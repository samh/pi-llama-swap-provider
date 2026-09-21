# Compatibility

| Component | Tested version | Notes |
| --- | --- | --- |
| pi | 0.86.0 | Native provider auth, package loading, and live sessions |
| llama-swap | v251 (`4ec3175`) | Dynamic catalogue and Responses routing |
| llama-server | Endpoint did not report a version | Responses, tools, images, progress, cache, and cancellation tested |

The transport uses pi-ai's exported OpenAI Responses adapter and therefore treats pi 0.86.0 as the current minimum tested version. These exports are version-sensitive and covered by type checking and protocol tests.

llama-swap routing support does not imply that every configured backend supports Responses, images, tools, reasoning controls, or prompt progress. `return_progress` is a non-standard request field. A server that ignores it should otherwise stream normally.

Known protocol accommodation: llama-server Responses events may omit `output_index`. The package assigns stable indices using output item IDs before pi's parser receives events.

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
- progress-widget rendering and cleanup after cancellation.

After logout, pi's model picker may still show the cached llama-swap model
catalog. Requests remain blocked because the credential is gone. This matches
pi's behavior for other logged-out providers.

Malformed and absent progress metadata, and a backend that ignores
`return_progress`, are covered by protocol tests. Login replacement with a
second endpoint still requires explicit gate coverage. A Chat Completions
fallback decision also remains a v0.1.0 release gate.
