import { describe, expect, it } from "vitest";
import { DEFAULT_CONTEXT_WINDOW, parseCatalogue } from "../src/models.js";

const baseUrl = "https://server.example/v1";
const model = (id: string, extra: Record<string, unknown> = {}) => ({
  id, meta: { llamaswap: { type: "model" } }, ...extra,
});

describe("model catalogue", () => {
  it("uses public context, modality, output, and tool metadata", () => {
    const models = parseCatalogue({ data: [
      model("vision", {
        context_length: 8192,
        architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
        capabilities: { function_calling: true },
        supported_parameters: ["tools", "tool_choice"],
        meta: { n_ctx: 4096, llamaswap: { type: "model" } },
      }),
      model("no-tools", { capabilities: { function_calling: false } }),
      model("audio-only", { architecture: { output_modalities: ["audio"] } }),
    ] }, baseUrl);
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ id: "vision", contextWindow: 8192, input: ["text", "image"], api: "openai-responses" });
  });

  it("supports partial catalogues and public fallbacks", () => {
    const models = parseCatalogue({ data: [
      model("meta-context", { capabilities: { vision: true }, meta: { n_ctx: 1234, llamaswap: { type: "model" } } }),
      model("fallback"),
      { id: "alias", meta: { llamaswap: { type: "alias" } } },
      { id: "peer", meta: { llamaswap: { type: "peer" } } },
    ] }, baseUrl);
    expect(models.map(({ id, contextWindow, input }) => ({ id, contextWindow, input }))).toEqual([
      { id: "fallback", contextWindow: DEFAULT_CONTEXT_WINDOW, input: ["text"] },
      { id: "meta-context", contextWindow: 1234, input: ["text", "image"] },
    ]);
  });

  it("maps multi-effort, always-on, and alias-backed reasoning", () => {
    const models = parseCatalogue({ data: [
      model("efforts", { meta: { llamaswap: { type: "model", reasoningEfforts: ["none", "low", "high"] } } }),
      model("always", { meta: { llamaswap: { type: "model", reasoning: true } } }),
      model("legacy", { meta: { llamaswap: { type: "model", aliases: ["legacy:thinking"] } } }),
    ] }, baseUrl);
    expect(models.find((item) => item.id === "efforts")?.thinkingLevelMap).toMatchObject({ off: "none", low: "low", high: "high", medium: null });
    expect(models.find((item) => item.id === "always")?.thinkingLevelMap?.off).toBeNull();
    const legacyMap = models.find((item) => item.id === "legacy")?.thinkingLevelMap;
    expect(legacyMap?.off).toBe("none");
    expect(legacyMap).not.toHaveProperty("high");
  });
});
