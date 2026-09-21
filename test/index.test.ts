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

describe("extension login lifecycle", () => {
  it("refreshes models after pi stores the login credential", async () => {
    delete process.env.LLAMA_SWAP_BASE_URL;
    delete process.env.LLAMA_SWAP_API_KEY;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ id: "fixture-model", meta: { llamaswap: { type: "model" } } }],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    let provider: any;
    const handlers = new Map<string, (...args: any[]) => any>();
    const registerCommand = vi.fn();
    const pi = {
      registerProvider(value: any) { provider = value; },
      registerCommand,
      on(name: string, handler: (...args: any[]) => any) { handlers.set(name, handler); },
    };
    await llamaSwapExtension(pi as any);

    const refresh = vi.fn(async () => ({ aborted: false, errors: new Map() }));
    const ctx = {
      modelRegistry: {
        getProviderAuth: vi.fn(async () => ({
          auth: { baseUrl: "https://server.example/v1" },
        })),
        refresh,
      },
      ui: { setWidget: vi.fn(), notify: vi.fn() },
    };
    handlers.get("session_start")?.({}, ctx);

    const answers = ["https://server.example", ""];
    await provider.auth.apiKey.login({
      signal: new AbortController().signal,
      prompt: vi.fn(async () => answers.shift()!),
      notify: vi.fn(),
    });

    await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith({
      providers: ["llama-swap"],
      force: true,
    }));
    expect(registerCommand).not.toHaveBeenCalled();
  });
});
