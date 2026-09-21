import type { ApiKeyCredential, Model, ThinkingLevelMap } from "@earendil-works/pi-ai";
import { API_KEY_ENV, BASE_URL_ENV, resolveConfiguration } from "./auth.js";

export const DEFAULT_CONTEXT_WINDOW = 32_768;
export const DEFAULT_MAX_TOKENS = 16_384;
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;
const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
const EFFORTS = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

export interface CatalogueEntry {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: unknown;
    output_modalities?: unknown;
  };
  capabilities?: {
    vision?: unknown;
    function_calling?: unknown;
  };
  supported_parameters?: unknown;
  meta?: {
    n_ctx?: unknown;
    llamaswap?: {
      type?: string;
      aliases?: unknown;
      reasoning?: unknown;
      reasoningEfforts?: unknown;
      pi?: { reasoning?: unknown };
    };
  };
}

export interface ModelsPayload { data?: unknown }

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

function reasoningAliases(entry: CatalogueEntry): boolean {
  return (stringArray(entry.meta?.llamaswap?.aliases) ?? []).some(
    (alias) => alias.endsWith(":thinking") || alias.endsWith(":non-thinking"),
  );
}

function reasoningDetails(entry: CatalogueEntry): {
  reasoning: boolean;
  thinkingLevelMap?: ThinkingLevelMap;
} {
  const metadata = entry.meta?.llamaswap;
  const efforts = new Set(
    (stringArray(metadata?.reasoningEfforts) ?? []).filter((effort) => EFFORTS.has(effort)),
  );
  const explicit = metadata?.reasoning === true || metadata?.pi?.reasoning === true;
  const legacy = efforts.size === 0 && reasoningAliases(entry);
  if (efforts.size > 0) {
    const enabled = [...efforts].filter((effort) => effort !== "none");
    if (efforts.has("none") && enabled.length === 0) {
      return {
        reasoning: true,
        thinkingLevelMap: {
          off: "none", minimal: null, low: null, medium: null,
          xhigh: null, max: null,
        },
      };
    }
    return {
      reasoning: true,
      thinkingLevelMap: Object.fromEntries(LEVELS.map((level) => [
        level,
        efforts.has(level === "off" ? "none" : level) ? (level === "off" ? "none" : level) : null,
      ])),
    };
  }
  if (legacy) {
    return {
      reasoning: true,
      thinkingLevelMap: {
        off: "none", minimal: null, low: null, medium: null,
        xhigh: null, max: null,
      },
    };
  }
  if (explicit) {
    return {
      reasoning: true,
      thinkingLevelMap: {
        off: null, minimal: null, low: null, medium: null,
        xhigh: null, max: null,
      },
    };
  }
  return { reasoning: false };
}

export function catalogueEntryToModel(
  entry: CatalogueEntry,
  baseUrl: string,
): Model<"openai-responses"> | undefined {
  if (!entry.id || entry.meta?.llamaswap?.type !== "model") return undefined;
  if (entry.capabilities?.function_calling === false) return undefined;

  const output = stringArray(entry.architecture?.output_modalities);
  if (output && !output.includes("text")) return undefined;

  const inputModalities = stringArray(entry.architecture?.input_modalities);
  const image = inputModalities
    ? inputModalities.includes("image")
    : entry.capabilities?.vision === true;
  const reasoning = reasoningDetails(entry);

  return {
    id: entry.id,
    name: entry.name?.trim() || entry.id,
    api: "openai-responses",
    provider: "llama-swap",
    baseUrl,
    reasoning: reasoning.reasoning,
    ...(reasoning.thinkingLevelMap ? { thinkingLevelMap: reasoning.thinkingLevelMap } : {}),
    input: image ? ["text", "image"] : ["text"],
    cost: { ...ZERO_COST },
    contextWindow:
      positiveInteger(entry.context_length) ??
      positiveInteger(entry.meta?.n_ctx) ??
      DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
    compat: {
      supportsStrictMode: false,
      supportsMaxOutputTokens: true,
    },
  };
}

export function parseCatalogue(payload: unknown, baseUrl: string): Model<"openai-responses">[] {
  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as ModelsPayload).data)) {
    throw new Error("Unexpected llama-swap /models payload: expected { data: [...] }");
  }
  return (payload as { data: unknown[] }).data
    .filter((entry): entry is CatalogueEntry => typeof entry === "object" && entry !== null)
    .map((entry) => catalogueEntryToModel(entry, baseUrl))
    .filter((model): model is Model<"openai-responses"> => model !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchCatalogue(
  baseUrl: string,
  apiKey?: string,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<Model<"openai-responses">[]> {
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
  const response = await fetchImpl(`${baseUrl}/models`, { headers, signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch llama-swap models: ${response.status} ${response.statusText}`);
  }
  return parseCatalogue(await response.json(), baseUrl);
}

export async function configurationForRefresh(credential?: ApiKeyCredential) {
  return resolveConfiguration(credential, async (name) => {
    if (name === BASE_URL_ENV) return process.env[BASE_URL_ENV];
    if (name === API_KEY_ENV) return process.env[API_KEY_ENV];
    return undefined;
  });
}
