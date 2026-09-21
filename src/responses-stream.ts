/**
 * OpenAI Responses integration adapted around pi-ai's MIT-licensed implementation:
 * https://github.com/earendil-works/pi/blob/ecac0a9c4edad3dac5d9f8b40e0c7db7a56471fc/packages/ai/src/api/openai-responses.ts
 *
 * Copyright (c) 2025 Mario Zechner. Used under the MIT License.
 *
 * The request/message conversion and normalized event parsing remain delegated to
 * pi-ai. This file only adds llama-swap's return_progress flag and repairs
 * missing output_index fields before pi-ai consumes the SSE response.
 */
import {
  createAssistantMessageEventStream,
  type AssistantMessageEventStream,
  type Model,
  type ProviderStreams,
  type SimpleStreamOptions,
  type StreamOptions,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import * as upstream from "@earendil-works/pi-ai/api/openai-responses";
import { parsePromptProgress, type PromptProgress } from "./prompt-progress.js";

type EventRecord = Record<string, unknown> & { type?: string; output_index?: number; item_id?: string };

export interface NormalizationCallbacks {
  onProgress?: (progress: PromptProgress) => void;
  onOutput?: () => void;
}

class OutputIndexNormalizer {
  private nextIndex = 0;
  private readonly indices = new Map<string, number>();

  normalize(value: unknown, callbacks: NormalizationCallbacks = {}): unknown {
    if (typeof value !== "object" || value === null) return value;
    const event = value as EventRecord;
    const progress = parsePromptProgress(event.prompt_progress);
    if (progress) callbacks.onProgress?.(progress);

    if (event.type === "response.output_item.added") {
      callbacks.onOutput?.();
      const item = objectRecord(event.item);
      const itemId = typeof item?.id === "string" ? item.id : undefined;
      const index = typeof event.output_index === "number" ? event.output_index : this.nextIndex;
      this.nextIndex = Math.max(this.nextIndex, index + 1);
      if (itemId) this.indices.set(itemId, index);
      if (event.output_index === undefined) return { ...event, output_index: index };
      return event;
    }

    const item = objectRecord(event.item);
    const itemId = typeof event.item_id === "string"
      ? event.item_id
      : typeof item?.id === "string" ? item.id : undefined;
    const index = itemId ? this.indices.get(itemId) : undefined;
    let normalized: EventRecord = event;
    if (event.output_index === undefined && index !== undefined) normalized = { ...event, output_index: index };
    if (event.type?.startsWith("response.") && (event.type.includes(".delta") || event.type.includes(".added"))) {
      callbacks.onOutput?.();
    }
    if (event.type === "response.output_item.done" && itemId) this.indices.delete(itemId);
    return normalized;
  }

  clear(): void {
    this.indices.clear();
    this.nextIndex = 0;
  }
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

export async function* normalizeResponsesEvents<T>(
  events: AsyncIterable<T>,
  callbacks: NormalizationCallbacks = {},
): AsyncGenerator<T> {
  const normalizer = new OutputIndexNormalizer();
  try {
    for await (const event of events) yield normalizer.normalize(event, callbacks) as T;
  } finally {
    normalizer.clear();
  }
}

function transformSseBody(
  body: ReadableStream<Uint8Array>,
  callbacks: NormalizationCallbacks,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const normalizer = new OutputIndexNormalizer();
  let pending = "";

  const transformLine = (line: string): string => {
    if (!line.startsWith("data:")) return line;
    const prefix = line.startsWith("data: ") ? "data: " : "data:";
    const data = line.slice(prefix.length);
    if (!data || data === "[DONE]") return line;
    try {
      return prefix + JSON.stringify(normalizer.normalize(JSON.parse(data), callbacks));
    } catch {
      return line;
    }
  };

  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      if (lines.length) controller.enqueue(encoder.encode(lines.map(transformLine).join("\n") + "\n"));
    },
    flush(controller) {
      pending += decoder.decode();
      if (pending) controller.enqueue(encoder.encode(transformLine(pending)));
      normalizer.clear();
    },
  }));
}

function progressFetch(
  delegate: typeof fetch,
  omitAuthorization: boolean,
  callbacks: NormalizationCallbacks,
): typeof fetch {
  return async (input, init) => {
    let nextInput = input;
    let nextInit = init;
    if (omitAuthorization) {
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.delete("authorization");
      if (input instanceof Request && init === undefined) nextInput = new Request(input, { headers });
      else nextInit = { ...init, headers };
    }
    const response = await delegate(nextInput, nextInit);
    if (!response.body) return response;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(transformSseBody(response.body, callbacks), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

let progressListener: ((progress: PromptProgress | undefined) => void) | undefined;

export function setPromptProgressListener(listener: typeof progressListener): void {
  progressListener = listener;
}

function requestOptions<T extends StreamOptions>(options: T | undefined): T {
  const originalPayload = options?.onPayload;
  const originalFetch = options?.fetch ?? globalThis.fetch;
  return {
    ...options,
    apiKey: options?.apiKey || "unused",
    fetch: progressFetch(originalFetch, !options?.apiKey, {
      onProgress: (progress) => progressListener?.(progress),
      onOutput: () => progressListener?.(undefined),
    }),
    onPayload: async (payload, model) => {
      let next = originalPayload ? (await originalPayload(payload, model)) ?? payload : payload;
      if (typeof next !== "object" || next === null) return next;
      next = { ...(next as Record<string, unknown>), return_progress: true };

      // Legacy two-level models use their server-configured reasoning mode when
      // thinking is enabled; sending an invented effort would change behavior.
      const map = model.thinkingLevelMap;
      if (options && "reasoning" in options && options.reasoning && map?.off === "none" && !("high" in map)) {
        const reasoning = objectRecord((next as Record<string, unknown>).reasoning);
        if (reasoning) {
          const { effort: _effort, ...rest } = reasoning;
          next = { ...(next as Record<string, unknown>), reasoning: rest };
        }
      }
      return next;
    },
  } as T;
}

function clearOnTermination(inner: AssistantMessageEventStream): AssistantMessageEventStream {
  const outer = createAssistantMessageEventStream();
  void (async () => {
    try {
      for await (const event of inner) outer.push(event);
    } finally {
      progressListener?.(undefined);
      outer.end();
    }
  })();
  return outer;
}

export const llamaSwapResponsesApi: ProviderStreams = {
  stream(model: Model<any>, context: TranscriptContext, options?: StreamOptions): AssistantMessageEventStream {
    return clearOnTermination(upstream.stream(model, context, requestOptions(options)));
  },
  streamSimple(model: Model<any>, context: TranscriptContext, options?: SimpleStreamOptions): AssistantMessageEventStream {
    return clearOnTermination(upstream.streamSimple(model, context, requestOptions(options)));
  },
};
