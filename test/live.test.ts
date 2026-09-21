import {
  isContextOverflow,
  normalizeContext,
  Type,
  type AssistantMessage,
  type Model,
  type TranscriptContext,
} from "@earendil-works/pi-ai";
import { beforeAll, describe, expect, it } from "vitest";
import { fetchCatalogue } from "../src/models.js";
import { llamaSwapResponsesApi, setPromptProgressListener } from "../src/responses-stream.js";
import type { PromptProgress } from "../src/prompt-progress.js";

const enabled = process.env.RUN_LLAMA_SWAP_LIVE === "1";
const baseUrl = process.env.LLAMA_SWAP_BASE_URL;
const apiKey = process.env.LLAMA_SWAP_API_KEY;
const fastModelId = process.env.LLAMA_SWAP_LIVE_FAST_MODEL;
const reasoningModelId = process.env.LLAMA_SWAP_LIVE_REASONING_MODEL;

function context(text: string): TranscriptContext {
  return normalizeContext({
    messages: [{ role: "user", content: [{ type: "text", text }], timestamp: Date.now() }],
  });
}

function textOf(message: AssistantMessage): string {
  return message.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("");
}

describe.skipIf(!enabled)("llama-swap live Responses transport", () => {
  let fastModel: Model<"openai-responses">;
  let reasoningModel: Model<"openai-responses">;

  beforeAll(async () => {
    if (!baseUrl || !fastModelId || !reasoningModelId) {
      throw new Error(
        "Live tests require LLAMA_SWAP_BASE_URL, LLAMA_SWAP_LIVE_FAST_MODEL, and LLAMA_SWAP_LIVE_REASONING_MODEL",
      );
    }
    const models = await fetchCatalogue(baseUrl, apiKey);
    fastModel = models.find((model) => model.id === fastModelId)!;
    reasoningModel = models.find((model) => model.id === reasoningModelId)!;
    expect(fastModel, `missing fast model ${fastModelId}`).toBeDefined();
    expect(reasoningModel, `missing reasoning model ${reasoningModelId}`).toBeDefined();
  }, 30_000);

  it("streams plain text and usage", async () => {
    const message = await llamaSwapResponsesApi.streamSimple(
      fastModel,
      context("Reply with exactly LIVE_OK"),
      { apiKey, reasoning: undefined },
    ).result();
    expect(textOf(message).trim()).toBe("LIVE_OK");
    expect(message.stopReason).toBe("stop");
    expect(message.usage.totalTokens).toBeGreaterThan(0);
  }, 120_000);

  it("streams reasoning off and every advertised effort", async () => {
    const disabled = await llamaSwapResponsesApi.streamSimple(
      reasoningModel,
      context("Compute 17 * 19. End with RESULT=323."),
      { apiKey },
    ).result();
    expect(textOf(disabled)).toContain("RESULT=323");
    expect(disabled.content.some((block) => block.type === "thinking")).toBe(false);

    const efforts = (["low", "medium", "high", "xhigh", "max"] as const).filter(
      (level) => reasoningModel.thinkingLevelMap?.[level] !== null,
    );
    expect(efforts.length).toBeGreaterThan(0);
    for (const reasoning of efforts) {
      const message = await llamaSwapResponsesApi.streamSimple(
        reasoningModel,
        context("Compute 17 * 19. End with RESULT=323."),
        { apiKey, reasoning },
      ).result();
      expect(textOf(message)).toContain("RESULT=323");
      expect(message.content.some((block) => block.type === "thinking")).toBe(true);
    }
  }, 600_000);

  it("streams single, parallel, and continued tool calls", async () => {
    const tool = {
      name: "lookup",
      description: "Return the value for a key",
      parameters: Type.Object({ key: Type.String() }),
    };
    const firstPrompt = "Call lookup once with key alpha. Do not answer without calling it.";
    const first = await llamaSwapResponsesApi.streamSimple(
      fastModel,
      normalizeContext({
        tools: [tool],
        messages: [{ role: "user", content: firstPrompt, timestamp: Date.now() }],
      }),
      { apiKey },
    ).result();
    const firstCalls = first.content.filter((block) => block.type === "toolCall");
    expect(firstCalls).toHaveLength(1);
    expect(firstCalls[0]).toMatchObject({ name: "lookup", arguments: { key: "alpha" } });

    const continued = await llamaSwapResponsesApi.streamSimple(
      fastModel,
      normalizeContext({
        messages: [
          { role: "user", content: firstPrompt, timestamp: Date.now() },
          first,
          {
            role: "toolResult",
            toolCallId: firstCalls[0]!.id,
            toolName: "lookup",
            content: [{ type: "text", text: "ALPHA_VALUE" }],
            isError: false,
            timestamp: Date.now(),
          },
        ],
      }),
      { apiKey },
    ).result();
    expect(textOf(continued)).toContain("ALPHA_VALUE");

    const parallel = await llamaSwapResponsesApi.streamSimple(
      reasoningModel,
      normalizeContext({
        tools: [tool],
        messages: [{
          role: "user",
          content: "In one parallel batch, call lookup for alpha and lookup for beta.",
          timestamp: Date.now(),
        }],
      }),
      { apiKey, reasoning: "low" },
    ).result();
    const parallelCalls = parallel.content.filter((block) => block.type === "toolCall");
    expect(parallelCalls).toHaveLength(2);
    expect(parallelCalls.map((call) => call.arguments.key).sort()).toEqual(["alpha", "beta"]);
  }, 300_000);

  it("accepts image input", async () => {
    expect(fastModel.input).toContain("image");
    const pixel = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const message = await llamaSwapResponsesApi.streamSimple(
      fastModel,
      normalizeContext({
        messages: [{
          role: "user",
          content: [
            { type: "image", data: pixel, mimeType: "image/png" },
            { type: "text", text: "Reply with exactly IMAGE_OK if you received the image." },
          ],
          timestamp: Date.now(),
        }],
      }),
      { apiKey },
    ).result();
    expect(textOf(message).trim()).toBe("IMAGE_OK");
  }, 180_000);

  it("recognizes context overflow and propagates provider errors", async () => {
    const overflowContext = context(
      `${Array.from({ length: 45_000 }, (_, index) => `word${index % 997}`).join(" ")}\nReply OK.`,
    );
    let overflow: AssistantMessage | undefined;
    for await (const event of llamaSwapResponsesApi.streamSimple(fastModel, overflowContext, { apiKey })) {
      if (event.type === "error") overflow = event.error;
    }
    expect(overflow).toBeDefined();
    expect(isContextOverflow(overflow!, fastModel.contextWindow)).toBe(true);

    let providerError: AssistantMessage | undefined;
    const missingModel = { ...fastModel, id: "live-test-model-that-does-not-exist" };
    for await (const event of llamaSwapResponsesApi.streamSimple(
      missingModel,
      context("hello"),
      { apiKey },
    )) {
      if (event.type === "error") providerError = event.error;
    }
    expect(providerError?.stopReason).toBe("error");
    expect(providerError?.errorMessage).toMatch(/404|no router|not found/i);
  }, 300_000);

  it("reports uncached and cached prompt progress", async () => {
    const prompt = `${"alpha beta gamma delta ".repeat(1_500)}\nReply with CACHE_OK.`;
    const runs: PromptProgress[][] = [];
    try {
      for (let run = 0; run < 2; run++) {
        const samples: PromptProgress[] = [];
        setPromptProgressListener((progress) => { if (progress) samples.push(progress); });
        const message = await llamaSwapResponsesApi.streamSimple(fastModel, context(prompt), {
          apiKey,
          sessionId: "pi-llama-swap-live-cache-test",
        }).result();
        expect(textOf(message)).toContain("CACHE_OK");
        runs.push(samples);
      }
    } finally {
      setPromptProgressListener(undefined);
    }
    expect(runs[0]?.length).toBeGreaterThan(1);
    expect(Math.max(0, ...runs[1]!.map((sample) => sample.cache ?? 0))).toBeGreaterThan(0);
  }, 300_000);

  it.each(["prefill", "generation"] as const)("aborts during %s", async (phase) => {
    const controller = new AbortController();
    let terminalReason: string | undefined;
    setPromptProgressListener((progress) => {
      if (phase === "prefill" && progress) controller.abort();
    });
    try {
      const prompt = phase === "prefill"
        ? `${"unique prefill sequence ".repeat(2_500)}\nRespond briefly.`
        : "Write a detailed essay about the history of compilers.";
      for await (const event of llamaSwapResponsesApi.streamSimple(fastModel, context(prompt), {
        apiKey,
        signal: controller.signal,
      })) {
        if (phase === "generation" && event.type === "text_delta") controller.abort();
        if (event.type === "error" || event.type === "done") terminalReason = event.reason;
      }
    } finally {
      setPromptProgressListener(undefined);
    }
    expect(controller.signal.aborted).toBe(true);
    expect(terminalReason).toBe("aborted");
  }, 180_000);
});
