# Configuration

## Interactive

Run `/login llama-swap` in pi. Enter an absolute HTTP(S) llama-swap URL. An origin such as `https://server.example` is normalized to `https://server.example/v1`; `/v1/` is normalized to `/v1`. Other paths are rejected. The API key prompt is optional.

Pi stores the resulting credential in its standard auth store. This package does not create a credential file.

After login, the extension fetches `/v1/models`. The returned models appear in `/model` without another command.

## Environment

For non-interactive use, set:

- `LLAMA_SWAP_BASE_URL` (required, with the same normalization rules)
- `LLAMA_SWAP_API_KEY` (optional)

Stored credential fields take precedence over environment fields independently. With no base URL, the provider remains unconfigured and makes no model request. With no key, requests omit the Authorization header.

When `LLAMA_SWAP_BASE_URL` is set, the extension loads the model list at startup.

## Troubleshooting

- Confirm the configured server exposes both `/v1/models` and `/v1/responses`.
- Ensure catalogue entries have `meta.llamaswap.type: "model"`.
- Models explicitly advertising `capabilities.function_calling: false`, or output modalities without text, are intentionally excluded.
- To replace a stored URL or key, run `/login llama-swap` again.
- To remove the stored connection, run `/logout`.
