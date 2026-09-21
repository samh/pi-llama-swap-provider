import { afterEach, describe, expect, it, vi } from "vitest";
import llamaSwapExtension from "../src/index.js";

const originalBaseUrl = process.env.LLAMA_SWAP_BASE_URL;
const originalApiKey = process.env.LLAMA_SWAP_API_KEY;

afterEach(() => {
  if (originalBaseUrl === undefined) delete process.env.LLAMA_SWAP_BASE_URL;
  else process.env.LLAMA_SWAP_BASE_URL = originalBaseUrl;
  if (originalApiKey === undefined) delete process.env.LLAMA_SWAP_API_KEY;
  else process.env.LLAMA_SWAP_API_KEY = originalApiKey;
  vi.unstubAllGlobals();
});

async function setupExtension(getProviderAuth: ReturnType<typeof vi.fn>) {
  delete process.env.LLAMA_SWAP_BASE_URL;
  delete process.env.LLAMA_SWAP_API_KEY;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    data: [{ id: "fixture-model", meta: { llamaswap: { type: "model" } } }],
  }), { status: 200, headers: { "content-type": "application/json" } })));

  let provider: any;
  const handlers = new Map<string, (...args: any[]) => any>();
  const pi = {
    registerProvider(value: any) { provider = value; },
    on(name: string, handler: (...args: any[]) => any) { handlers.set(name, handler); },
  };
  await llamaSwapExtension(pi as any);

  const refresh = vi.fn(async () => ({ aborted: false, errors: new Map() }));
  handlers.get("session_start")?.({}, {
    modelRegistry: { getProviderAuth, refresh },
    ui: { setWidget: vi.fn(), notify: vi.fn() },
  });
  return { provider, refresh };
}

async function login(provider: any, answers: string[]) {
  return provider.auth.apiKey.login({
    signal: new AbortController().signal,
    prompt: vi.fn(async () => answers.shift()!),
    notify: vi.fn(),
  });
}

describe("extension login lifecycle", () => {
  it("refreshes models after pi stores the first login credential", async () => {
    const getProviderAuth = vi.fn(async () => ({
      auth: { baseUrl: "https://server.example/v1" },
    }));
    const { provider, refresh } = await setupExtension(getProviderAuth);

    await login(provider, ["https://server.example", ""]);

    expect(provider.getModels().map((model: { id: string }) => model.id)).toContain("fixture-model");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith({
      providers: ["llama-swap"],
      force: true,
    }));
  });

  it("waits for a replacement credential before refreshing", async () => {
    const getProviderAuth = vi.fn()
      .mockResolvedValueOnce({ auth: { baseUrl: "https://old.example/v1", apiKey: "old-key" } })
      .mockResolvedValue({ auth: { baseUrl: "https://new.example/v1", apiKey: "new-key" } });
    const { provider, refresh } = await setupExtension(getProviderAuth);

    await login(provider, ["https://new.example", "new-key"]);

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(getProviderAuth).toHaveBeenCalledTimes(2);
  });
});
