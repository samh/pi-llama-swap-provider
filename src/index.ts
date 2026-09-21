import { createProvider, type ApiKeyCredential } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { API_KEY_ENV, login, resolveAuth } from "./auth.js";
import { configurationForRefresh, fetchCatalogue } from "./models.js";
import { formatPromptProgress, type PromptProgress } from "./prompt-progress.js";
import { llamaSwapResponsesApi, setPromptProgressListener } from "./responses-stream.js";

const PROVIDER_ID = "llama-swap";

function installProgressMessage(ctx: ExtensionContext): { clear(): void; dispose(): void } {
  let pending: PromptProgress | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const render = () => {
    timer = undefined;
    ctx.ui.setWorkingMessage(pending ? formatPromptProgress(pending) : undefined);
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
    ctx.ui.setWorkingMessage();
  };
  return {
    clear,
    dispose() {
      clear();
      setPromptProgressListener(undefined);
    },
  };
}

export default async function llamaSwapExtension(pi: ExtensionAPI): Promise<void> {
  let activeContext: ExtensionContext | undefined;

  const refreshAfterLogin = async (baseUrl: string, apiKey: string | undefined): Promise<void> => {
    // Pi 0.86 synchronizes login with an offline refresh. Wait until it has
    // stored the new credential, then run the network refresh it omits.
    for (let attempt = 0; attempt < 100; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const ctx = activeContext;
      if (!ctx) continue;
      const auth = await ctx.modelRegistry.getProviderAuth(PROVIDER_ID);
      if (auth?.auth.baseUrl !== baseUrl || auth.auth.apiKey !== apiKey) continue;

      const result = await ctx.modelRegistry.refresh({ providers: [PROVIDER_ID], force: true });
      const error = result.errors.get(PROVIDER_ID);
      if (error) ctx.ui.notify(`Could not load llama-swap models: ${error.message}`, "error");
      return;
    }
    activeContext?.ui.notify("Could not load llama-swap models after login", "error");
  };

  // Extension providers are registered after pi's create-time network refresh.
  // Preload ambient configuration here so environment-only `--list-models`
  // works on the first process. Stored credentials restore the provider's
  // persisted dynamic catalogue on subsequent processes.
  const initialConfig = await configurationForRefresh();
  const initialModels = initialConfig
    ? await fetchCatalogue(initialConfig.baseUrl, initialConfig.apiKey)
    : [];

  const provider = createProvider<"openai-responses">({
    id: PROVIDER_ID,
    name: "llama-swap",
    auth: {
      apiKey: {
        name: "llama-swap connection",
        login: (interaction) => login(interaction, async (baseUrl, apiKey, signal) => {
          const resolvedApiKey = apiKey || process.env[API_KEY_ENV] || undefined;
          await fetchCatalogue(baseUrl, resolvedApiKey, signal);
          void refreshAfterLogin(baseUrl, resolvedApiKey);
        }),
        resolve: resolveAuth,
      },
    },
    models: initialModels,
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

  let progressMessage: ReturnType<typeof installProgressMessage> | undefined;
  pi.on("session_start", (_event, ctx) => {
    activeContext = ctx;
    progressMessage?.dispose();
    progressMessage = installProgressMessage(ctx);
  });
  pi.on("model_select", () => progressMessage?.clear());
  pi.on("session_shutdown", () => {
    activeContext = undefined;
    progressMessage?.dispose();
  });
}
