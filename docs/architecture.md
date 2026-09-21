# Architecture

The extension registers a native pi-ai `Provider` with an initially empty model list. During a configured model refresh, `src/models.ts` fetches `${baseUrl}/models`, converts eligible llama-swap model records into deterministic pi models, and publishes the resulting in-memory catalogue through `createProvider()`.

Authentication is owned by pi. `src/auth.ts` normalizes `/v1` URLs and resolves each field with stored credentials taking precedence over ambient environment variables.

Inference delegates message, image, tool, reasoning, usage, error, and abort behavior to pi-ai's OpenAI Responses implementation. `src/responses-stream.ts` adds `return_progress: true` and wraps the raw SSE response. The wrapper assigns omitted `output_index` values and then lets pi-ai's shared Responses parser consume the repaired stream. The fork point is intentionally narrow and references the exact upstream commit in the source header.

`prompt_progress` is inspected by the SSE wrapper but is never converted to assistant content. A throttled, width-safe widget is installed below the editor for interactive sessions. It is cleared when output begins, a stream terminates, the model changes, or the session shuts down. Non-interactive sessions do not depend on widget rendering.
