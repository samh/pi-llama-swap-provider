import { describe, expect, it } from "vitest";
import { calculatePromptProgress, parsePromptProgress } from "../src/prompt-progress.js";

describe("prompt progress", () => {
  it("calculates progress and ETA over uncached tokens", () => {
    expect(calculatePromptProgress({ total: 100, cache: 40, processed: 70, time_ms: 300 }))
      .toEqual({ uncachedTotal: 60, uncachedProcessed: 30, fraction: 0.5, percent: 50, etaMs: 300 });
  });

  it("clamps malformed ranges", () => {
    expect(calculatePromptProgress({ total: 10, cache: 20, processed: 5 }))
      .toMatchObject({ uncachedTotal: 0, uncachedProcessed: 0, percent: 100 });
  });

  it("rejects malformed payloads", () => {
    expect(parsePromptProgress({ total: 10, processed: "2" })).toBeUndefined();
    expect(parsePromptProgress({ total: -1, processed: 0 })).toBeUndefined();
  });
});
