import { createProvider, type ApiKeyCredential } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { login, resolveAuth } from "./auth.js";
import { configurationForRefresh, fetchCatalogue } from "./models.js";
import { formatPromptProgress, type PromptProgress } from "./prompt-progress.js";
import { llamaSwapResponsesApi, setPromptProgressListener } from "./responses-stream.js";

const PROVIDER_ID = "llama-swap";
const WIDGET_ID = "llama-swap-prompt-progress";

function installProgressWidget(ctx: ExtensionContext): { clear(): void; dispose(): void } {
  let pending: PromptProgress | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const render = () => {
    timer = undefined;
    if (!pending) {
      ctx.ui.setWidget(WIDGET_ID, undefined);
      return;
    }
    const text = formatPromptProgress(pending);
    ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
      render: (width) => [truncateToWidth(theme.fg("muted", text), width)],
      invalidate() {},
    }), { placement: "belowEditor" });
  };

  setPromptProgressListener((progress) => {
    pending = progress;
    if (!progress) {
      if (timer) clearTimeout(timer);
      render();
    } else if (!timer) {
      timer = setTimeout(render, 100);
    }
  });

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
    ctx.ui.setWidget(WIDGET_ID, undefined);
  };
  return {
    clear,
    dispose() {
      clear();
      setPromptProgressListener(undefined);
    },
  };
}

export default function llamaSwapExtension(pi: ExtensionAPI): void {
  const provider = createProvider<"openai-responses">({
    id: PROVIDER_ID,
    name: "llama-swap",
    auth: {
      apiKey: {
        name: "llama-swap connection",
        login: (interaction) => login(interaction, async (baseUrl, apiKey, signal) => {
          await fetchCatalogue(baseUrl, apiKey, signal);
        }),
        resolve: resolveAuth,
      },
    },
    models: [],
    fetchModels: async ({ credential, signal, allowNetwork }) => {
      if (!allowNetwork) return [];
      const config = await configurationForRefresh(
        credential?.type === "api_key" ? credential as ApiKeyCredential : undefined,
      );
      if (!config) return [];
      return fetchCatalogue(config.baseUrl, config.apiKey, signal);
    },
    api: llamaSwapResponsesApi,
  });

  pi.registerProvider(provider);

  let widget: ReturnType<typeof installProgressWidget> | undefined;
  pi.on("session_start", (_event, ctx) => {
    widget?.dispose();
    widget = installProgressWidget(ctx);
  });
  pi.on("model_select", () => widget?.clear());
  pi.on("session_shutdown", () => widget?.dispose());
}
