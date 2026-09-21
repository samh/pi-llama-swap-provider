import { normalizeContext, type Model } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import {
  llamaSwapResponsesApi,
  normalizeResponsesEvents,
  setPromptProgressListener,
} from "../src/responses-stream.js";

async function* events(values: Record<string, unknown>[]) { yield* values; }

describe("Responses event normalization", () => {
  it("indexes interleaved reasoning, text, and parallel tool calls", async () => {
    const input = [
      { type: "response.output_item.added", item: { id: "reason", type: "reasoning" } },
      { type: "response.output_item.added", item: { id: "text", type: "message" } },
      { type: "response.output_item.added", item: { id: "tool-a", type: "function_call" } },
      { type: "response.output_item.added", item: { id: "tool-b", type: "function_call" } },
      { type: "response.reasoning_summary_text.delta", item_id: "reason", delta: "why" },
      { type: "response.output_text.delta", item_id: "text", delta: "hello" },
      { type: "response.function_call_arguments.delta", item_id: "tool-b", delta: "{}" },
      { type: "response.function_call_arguments.delta", item_id: "tool-a", delta: "{}" },
      { type: "response.output_item.done", item: { id: "tool-a" } },
    ];
    const output = [];
    for await (const event of normalizeResponsesEvents(events(input))) output.push(event);
    expect(output.map((event) => event.output_index)).toEqual([0, 1, 2, 3, 0, 1, 3, 2, 2]);
  });

  it("preserves conforming indices and reports valid progress", async () => {
    const onProgress = vi.fn();
    const input = [{
      type: "response.output_item.added", output_index: 7,
      prompt_progress: { total: 12, processed: 4 }, item: { id: "x" },
    }];
    const output = [];
    for await (const event of normalizeResponsesEvents(events(input), { onProgress })) output.push(event);
    expect(output[0]).toBe(input[0]);
    expect(onProgress).toHaveBeenCalledWith({ total: 12, processed: 4 });
  });

  it("ignores malformed and absent progress without affecting output", async () => {
    const onProgress = vi.fn();
    const input = [
      { type: "response.created", prompt_progress: { total: "bad", processed: 0 } },
      { type: "response.output_item.added", item: { id: "text", type: "message" } },
      { type: "response.output_text.delta", item_id: "text", delta: "ok" },
    ];
    const output = [];
    for await (const event of normalizeResponsesEvents(events(input), { onProgress })) output.push(event);
    expect(onProgress).not.toHaveBeenCalled();
    expect(output[2]).toMatchObject({ output_index: 0, delta: "ok" });
  });

  it("streams normally when the server ignores return_progress", async () => {
    const item = {
      id: "message-1",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: "ok", annotations: [] }],
    };
    const response = {
      id: "response-1",
      object: "response",
      created_at: 0,
      status: "completed",
      model: "fixture-model",
      output: [item],
      usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 },
    };
    const payloads = [
      { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
      { type: "response.output_item.added", item },
      { type: "response.output_text.delta", item_id: item.id, delta: "ok" },
      { type: "response.output_item.done", item },
      { type: "response.completed", response },
    ];
    const sse = `${payloads.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      expect(JSON.parse(init?.body as string)).toMatchObject({ return_progress: true });
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return new Response(sse, { headers: { "content-type": "text/event-stream" } });
    });
    const model: Model<"openai-responses"> = {
      id: "fixture-model",
      name: "Fixture Model",
      api: "openai-responses",
      provider: "llama-swap",
      baseUrl: "https://server.example/v1",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 4096,
      maxTokens: 512,
    };
    const progress = vi.fn();
    setPromptProgressListener((value) => { if (value) progress(value); });
    try {
      const message = await llamaSwapResponsesApi.streamSimple(
        model,
        normalizeContext({ messages: [{ role: "user", content: "hello", timestamp: 1 }] }),
        { fetch: fetchMock },
      ).result();
      expect(message.content).toMatchObject([{ type: "text", text: "ok" }]);
      expect(message.stopReason).toBe("stop");
      expect(progress).not.toHaveBeenCalled();
    } finally {
      setPromptProgressListener(undefined);
    }
  });
});
