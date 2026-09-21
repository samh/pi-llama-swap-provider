# Architecture

The extension registers a native pi-ai `Provider`. With environment-based configuration, it fetches `${baseUrl}/models` during startup. After interactive login, it waits for pi to save the credential and then refreshes the model list automatically. `src/models.ts` converts eligible llama-swap records into pi models.

Authentication is owned by pi. `src/auth.ts` normalizes `/v1` URLs and resolves each field with stored credentials taking precedence over ambient environment variables.

Inference delegates message, image, tool, reasoning, usage, error, and abort behavior to pi-ai's OpenAI Responses implementation. `src/responses-stream.ts` adds `return_progress: true` and wraps the raw SSE response. The wrapper assigns omitted `output_index` values and then lets pi-ai's shared Responses parser consume the repaired stream. The fork point is intentionally narrow and references the exact upstream commit in the source header.

`prompt_progress` is inspected by the SSE wrapper but is never converted to assistant content. A throttled, width-safe widget is installed below the editor for interactive sessions. It is cleared when output begins, a stream terminates, the model changes, or the session shuts down. Non-interactive sessions do not depend on widget rendering.
