# Compatibility

| Component | Tested version | Notes |
| --- | --- | --- |
| pi | 0.86.0 | Native provider auth and dynamic catalogue lifecycle |
| llama-swap | Development main | Public `/v1/models` metadata shape |
| llama-server | Not yet live-tested | Must support `/v1/responses`; progress is optional |

The transport uses pi-ai's exported OpenAI Responses adapter and therefore treats pi 0.86.0 as the current minimum tested version. These exports are version-sensitive and covered by type checking and protocol tests.

llama-swap routing support does not imply that every configured backend supports Responses, images, tools, reasoning controls, or prompt progress. `return_progress` is a non-standard request field. A server that ignores it should otherwise stream normally.

Known protocol accommodation: llama-server Responses events may omit `output_index`. The package assigns stable indices using output item IDs before pi's parser receives events.

A full live parity matrix and Chat Completions fallback decision remain release gates for v0.1.0.
