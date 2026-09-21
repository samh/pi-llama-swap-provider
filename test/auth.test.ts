import { describe, expect, it, vi } from "vitest";
import { login, normalizeBaseUrl, resolveConfiguration } from "../src/auth.js";

describe("normalizeBaseUrl", () => {
  it.each([
    ["https://server.example", "https://server.example/v1"],
    ["https://server.example/", "https://server.example/v1"],
    ["https://server.example/v1/", "https://server.example/v1"],
  ])("normalizes %s", (input, expected) => expect(normalizeBaseUrl(input)).toBe(expected));

  it.each(["", "server.example", "ftp://server.example", "https://server.example/api", "https://server.example/v1?x=1"])(
    "rejects %s", (input) => expect(() => normalizeBaseUrl(input)).toThrow(),
  );
});

describe("credential resolution", () => {
  it("uses stored values before ambient values per field", async () => {
    const result = await resolveConfiguration(
      { type: "api_key", env: { LLAMA_SWAP_BASE_URL: "https://stored.example/v1" } },
      async (name) => name === "LLAMA_SWAP_BASE_URL" ? "https://ambient.example/v1" : "ambient-key",
    );
    expect(result).toMatchObject({ baseUrl: "https://stored.example/v1", apiKey: "ambient-key" });
  });

  it("is unconfigured without a URL and permits a missing key", async () => {
    expect(await resolveConfiguration(undefined, async () => undefined)).toBeUndefined();
    expect(await resolveConfiguration(undefined, async (name) => name.endsWith("BASE_URL") ? "https://host.example" : undefined))
      .toMatchObject({ baseUrl: "https://host.example/v1" });
  });
});

describe("login", () => {
  it("validates and returns a native credential", async () => {
    const validate = vi.fn(async () => undefined);
    const answers = ["https://host.example", ""];
    const credential = await login({
      signal: new AbortController().signal,
      prompt: vi.fn(async () => answers.shift()!),
      notify: vi.fn(),
    }, validate);
    expect(validate).toHaveBeenCalledWith("https://host.example/v1", undefined, expect.any(AbortSignal));
    expect(credential).toEqual({ type: "api_key", env: { LLAMA_SWAP_BASE_URL: "https://host.example/v1" } });
  });
});
