# Compatibility

| Component | Tested version | Notes |
| --- | --- | --- |
| pi | 0.86.0 | Native provider auth, package loading, and live sessions |
| llama-swap | v251 (`4ec3175`) | Dynamic catalogue and Responses routing |
| llama-server | Endpoint did not report a version | Responses, tools, images, progress, cache, and cancellation tested |

The transport uses pi-ai's exported OpenAI Responses adapter and therefore treats pi 0.86.0 as the current minimum tested version. These exports are version-sensitive and covered by type checking and protocol tests.

llama-swap routing support does not imply that every configured backend supports Responses, images, tools, reasoning controls, or prompt progress. `return_progress` is a non-standard request field. A server that ignores it should otherwise stream normally.

Known protocol accommodation: llama-server Responses events may omit `output_index`. The package assigns stable indices using output item IDs before pi's parser receives events.

Pi 0.86 refreshes the provider catalog after login, but it does not rebuild an existing session-scoped model list. Newly discovered models appear under `all` in `/model` immediately. The `scoped` view includes them after restart.

## Live smoke results

The following passed against the runtime-supplied test endpoint:

- plain text and usage accounting;
- reasoning off and every advertised effort;
- one tool call, two parallel tool calls, tool-result continuation, and a
  two-step tool loop through pi;
- uncached progress and cached-prefix progress;
- image input;
- cancellation during prefill and generation;
- context-overflow and unknown-model error propagation;
- interactive login, automatic model refresh, stored-credential restart, and
  logout;
- working-message progress rendering and cleanup after cancellation.

After logout, pi's model picker may still show the cached llama-swap model
catalog. Requests remain blocked because the credential is gone. This matches
pi's behavior for other logged-out providers.

Malformed and absent progress metadata, and a backend that ignores
`return_progress`, are covered by protocol tests.

## No Chat Completions fallback

This package requires a backend with `/v1/responses`. It does not fall back to
Chat Completions. A fallback would not preserve prompt progress and would add a
second transport after Responses passed the parity checks. Servers without a
Responses endpoint fail with the provider error instead of silently changing
protocols.
