import type {
  ApiKeyCredential,
  AuthContext,
  AuthResult,
  ProviderAuthInteraction,
} from "@earendil-works/pi-ai";

export const BASE_URL_ENV = "LLAMA_SWAP_BASE_URL";
export const API_KEY_ENV = "LLAMA_SWAP_API_KEY";

export interface ResolvedConfiguration {
  baseUrl: string;
  apiKey?: string;
  source: string;
}

export function normalizeBaseUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("A llama-swap base URL is required");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter an absolute HTTP(S) URL, for example https://server.example/v1");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The llama-swap base URL must use HTTP or HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The llama-swap base URL must not contain credentials, a query, or a fragment");
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (path === "") url.pathname = "/v1";
  else if (path === "/v1") url.pathname = "/v1";
  else throw new Error("The llama-swap base URL path must be /v1 (or omitted)");

  return url.toString().replace(/\/$/, "");
}

export async function resolveConfiguration(
  credential: ApiKeyCredential | undefined,
  env: (name: string) => Promise<string | undefined>,
): Promise<ResolvedConfiguration | undefined> {
  const storedUrl = credential?.env?.[BASE_URL_ENV];
  const ambientUrl = await env(BASE_URL_ENV);
  const rawBaseUrl = storedUrl || ambientUrl;
  if (!rawBaseUrl) return undefined;

  const ambientKey = await env(API_KEY_ENV);
  const apiKey = credential?.key || ambientKey || undefined;
  return {
    baseUrl: normalizeBaseUrl(rawBaseUrl),
    ...(apiKey ? { apiKey } : {}),
    source: storedUrl || credential?.key ? "stored llama-swap credential" : BASE_URL_ENV,
  };
}

export async function resolveAuth(input: {
  ctx: AuthContext;
  credential?: ApiKeyCredential;
}): Promise<AuthResult | undefined> {
  const config = await resolveConfiguration(input.credential, (name) => input.ctx.env(name));
  if (!config) return undefined;
  return {
    auth: {
      baseUrl: config.baseUrl,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    },
    env: { [BASE_URL_ENV]: config.baseUrl },
    source: config.source,
  };
}

export async function login(
  interaction: ProviderAuthInteraction,
  validate: (baseUrl: string, apiKey: string | undefined, signal: AbortSignal) => Promise<void>,
): Promise<ApiKeyCredential> {
  const enteredUrl = await interaction.prompt({
    type: "text",
    message: "llama-swap OpenAI base URL",
    placeholder: "https://server.example/v1",
  });
  const baseUrl = normalizeBaseUrl(enteredUrl);
  const enteredKey = await interaction.prompt({
    type: "secret",
    message: "API key (optional; leave empty for none)",
  });
  const key = enteredKey.trim() || undefined;
  interaction.notify({ type: "progress", message: "Validating llama-swap model catalogue…" });
  await validate(baseUrl, key, interaction.signal);
  return {
    type: "api_key",
    ...(key ? { key } : {}),
    env: { [BASE_URL_ENV]: baseUrl },
  };
}
