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

async function setupExtension(
  getProviderAuth: ReturnType<typeof vi.fn>,
  refresh = vi.fn(async (): Promise<any> => ({ aborted: false, errors: new Map() })),
) {
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

  const notify = vi.fn();
  handlers.get("session_start")?.({}, {
    modelRegistry: { getProviderAuth, refresh },
    ui: { setWidget: vi.fn(), notify },
  });
  return { provider, refresh, notify };
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

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith({
      providers: ["llama-swap"],
      force: true,
    }));
  });

  it("handles older Pi refresh methods that return no result", async () => {
    const refresh = vi.fn(async (): Promise<any> => undefined);
    const getProviderAuth = vi.fn(async () => ({
      auth: { baseUrl: "https://server.example/v1" },
    }));
    const { provider, notify } = await setupExtension(getProviderAuth, refresh);

    await login(provider, ["https://server.example", ""]);

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    // Allow the detached post-login task to finish; it must not reject.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(notify).not.toHaveBeenCalled();
  });

  it("reports refresh failures without an unhandled rejection", async () => {
    const refresh = vi.fn(async (): Promise<any> => { throw new Error("server unavailable"); });
    const getProviderAuth = vi.fn(async () => ({ auth: { baseUrl: "https://server.example/v1" } }));
    const { provider, notify } = await setupExtension(getProviderAuth, refresh);

    await login(provider, ["https://server.example", ""]);

    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith(
      "Could not load llama-swap models: server unavailable", "error",
    ));
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
