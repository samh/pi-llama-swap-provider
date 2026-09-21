import { describe, expect, it, vi } from "vitest";
import { normalizeResponsesEvents } from "../src/responses-stream.js";

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
});
