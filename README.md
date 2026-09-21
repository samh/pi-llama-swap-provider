# pi-llama-swap-provider

A dynamic [pi](https://pi.dev) provider for llama-swap. It discovers eligible coding models from `/v1/models`, sends inference through the OpenAI Responses API, and displays llama-server prompt-prefill progress below the editor.

> Active development: keep an existing provider enabled until the live parity matrix is complete.

## Requirements

- pi 0.86.0 or newer
- llama-swap with public model metadata
- a backend implementing `/v1/responses`

Prompt progress uses the non-standard `return_progress: true` request field. Backends that ignore it should continue normally without a progress widget.

## Install

Try or install a local checkout:

```sh
pi -e /absolute/path/to/pi-llama-swap-provider
pi install /absolute/path/to/pi-llama-swap-provider
```

For releases, install a pinned Git tag rather than a moving branch:

```sh
pi install git:<repository-url>@v0.1.0
```

Update or remove the package with `pi update --extensions` and `pi remove <source>`.

## Configure

Interactive setup is the primary flow:

```text
/login llama-swap
```

Enter the llama-swap OpenAI base URL and, if needed, an API key. Pi stores these in its normal credential store. The package never writes its own credential file.

After login, the extension loads the server's model list. The models then appear in `/model` without another command. Logging out removes the credential, but pi may continue to show the cached model names. Requests stay blocked until you log in again.

For CI, containers, and other non-interactive use:

```sh
export LLAMA_SWAP_BASE_URL=https://server.example/v1
export LLAMA_SWAP_API_KEY=... # optional
```

There is no localhost default. Requests without an API key omit authorization. Environment-based setup loads the model list at startup. See [configuration](docs/configuration.md).

## Model discovery

Only records marked `meta.llamaswap.type: "model"` are exposed; aliases and peers are excluded. Public context, modality, output, and function-calling fields take precedence. Models explicitly reporting no function-calling support are excluded. Local model costs are zero.

Reasoning models retain advertised efforts, always-on behavior, and legacy thinking/non-thinking alias behavior. Unsupported pi thinking levels are hidden.

## Development

```sh
npm install
npm run typecheck
npm test
npm run verify
```

Opt-in live protocol tests require runtime-supplied configuration:

```sh
LLAMA_SWAP_BASE_URL=https://server.example/v1 \
LLAMA_SWAP_LIVE_FAST_MODEL=<fast-model-id> \
LLAMA_SWAP_LIVE_REASONING_MODEL=<reasoning-model-id> \
npm run test:live
```

Set `LLAMA_SWAP_API_KEY` as well when the endpoint requires it. Live tests
never contain or snapshot endpoint URLs, keys, or model IDs.

See [architecture](docs/architecture.md) and [compatibility](docs/compatibility.md).

## Security

Pi extensions execute with the current user's permissions. Review this package before installing it. Do not commit endpoint URLs, keys, captured streams, local settings, or model filesystem paths.

## License

MIT
