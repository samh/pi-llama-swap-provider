# Implementation Plan

## Goal

Create an installable pi package that registers a dynamic `llama-swap` provider, discovers models from llama-swap metadata, uses the OpenAI Responses API, and displays llama-server prompt-processing progress in pi. Preserve the current provider's model, reasoning, tool, image, and cache behavior while adding standard pi login and packaging flows.

The package is complete when it can replace the existing user-local extension without losing supported behavior, install from a pinned Git tag, and pass the parity and security gates below.

## Repository and package shape

Build this repository as an MIT-licensed pi package:

```text
pi-llama-swap-provider/
├── src/
│   ├── index.ts
│   ├── auth.ts
│   ├── models.ts
│   ├── prompt-progress.ts
│   └── responses-stream.ts
├── test/
│   ├── auth.test.ts
│   ├── models.test.ts
│   ├── prompt-progress.test.ts
│   └── responses-stream.test.ts
├── docs/
│   ├── architecture.md
│   ├── compatibility.md
│   └── configuration.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── README.md
├── CHANGELOG.md
├── LICENSE
└── .gitignore
```

Use `pi-llama-swap-provider` as both the repository and package name. Declare `pi-package` in `keywords` and expose `./src/index.ts` through `package.json`'s `pi.extensions` manifest. Keep pi packages imported by the extension in `peerDependencies` with `"*"` ranges. Put every directly imported non-pi runtime package in `dependencies`.

## 1. Establish package scaffolding

1. Add the package manifest, TypeScript configuration, test runner, MIT license, changelog, and ignore rules.
2. Add scripts for type checking, unit tests, and all local verification.
3. Confirm both package loading modes work:
   - `pi -e /absolute/path/to/pi-llama-swap-provider`
   - `pi install /absolute/path/to/pi-llama-swap-provider`
4. Keep the existing `~/.pi/agent/extensions/llama-swap-provider.ts` active until the replacement passes every parity gate.

Completion criterion: pi can discover the package extension from the repository root, and the repository has a repeatable test/type-check command.

## 2. Implement standard pi provider authentication

Use a native pi-ai `Provider` created with `createProvider()` rather than inventing a package-specific credential file.

### Interactive setup

Register API-key auth so users configure the provider through:

```text
/login llama-swap
```

The login flow must:

1. Prompt for the llama-swap OpenAI base URL with a text prompt, an example such as `http://server.example:8080/v1`, and no default value.
2. Normalize the URL by removing a trailing slash. Require the canonical base path to end in `/v1`; append `/v1` when the user enters an origin with no path, and reject unrelated paths with a clear error. Build model and response endpoints as `${baseUrl}/models` and `${baseUrl}/responses` so `/v1` is never duplicated.
3. Prompt for an optional API key using a secret prompt.
4. Validate the connection by requesting the model catalogue.
5. Return an `ApiKeyCredential` with:
   - the optional key in `credential.key`;
   - the normalized URL in `credential.env.LLAMA_SWAP_BASE_URL`.

Pi then persists the credential in its normal auth store. URLs and secrets must not be persisted in this repository or a package-owned configuration file.

### Non-interactive setup

Support ambient configuration for CI, containers, and headless use:

- `LLAMA_SWAP_BASE_URL`
- `LLAMA_SWAP_API_KEY` (optional)

Resolution precedence is stored credential first, then ambient environment per field. An absent base URL means the provider is unconfigured; there is no localhost fallback. An absent API key means requests omit authorization rather than persisting or presenting a dummy credential.

### Dynamic model discovery after login

The provider starts with an empty dynamic model catalogue and exposes `refreshModels()`. Ensure model discovery receives the same resolved base URL and optional key as inference requests.

Verify these lifecycle cases explicitly:

- first `/login llama-swap` in an interactive session;
- process restart with a stored credential;
- environment-only configuration;
- `/login` replacement of an existing credential;
- `/logout` followed by an unconfigured state;
- `pi --list-models` where supported by pi's credential-loading lifecycle.

If pi does not automatically refresh dynamic models after login, trigger provider refresh from the extension lifecycle or add a narrowly scoped `/llama-swap-refresh` command. Prefer pi's native refresh path and avoid a command unless required by observed behavior.

Completion criterion: a fresh installation makes no network request until configured, `/login llama-swap` validates and stores configuration, and subsequent sessions discover models without asking again.

## 3. Port model discovery without private defaults

Move model-catalogue behavior from the current extension into `src/models.ts` without copying any private endpoint value.

Use the public model-catalogue fields as the primary contract, retaining llama-swap metadata only for llama-swap-specific concepts that have no public equivalent:

- Select entries whose llama-swap metadata type is `model`; exclude aliases and peers from pi's logical model list.
- Resolve context size in this order: top-level `context_length`, `meta.n_ctx`, then a documented conservative fallback. Treat `context_length` as canonical because it is the client-facing catalogue field; `n_ctx` is a llama-server compatibility fallback. Do not read the former `meta.llamaswap.context` field.
- Resolve pi input types from `architecture.input_modalities`, falling back to `capabilities.vision` only when architecture metadata is absent. Include `image` only when one of those public fields reports vision support. Do not infer vision from the former `meta.llamaswap.mmproj` field.
- Accept models with missing output metadata for backward compatibility. When `architecture.output_modalities` is present, require it to contain `text`, since pi's agent provider expects text output.
- Read `capabilities.function_calling` and `supported_parameters` during discovery. Pi currently has no per-model tool-capability field, so define and test an explicit policy rather than silently claiming support: models explicitly reporting `function_calling: false` are excluded from this coding-agent provider; missing capability metadata remains eligible for compatibility. Use `supported_parameters` as corroborating metadata, not as a replacement for an explicit capability.
- Preserve zero local-model cost.
- Preserve reasoning detection from explicit llama-swap metadata, supported efforts, and alias metadata until a public reasoning-capability field exists.
- Preserve pi thinking-level maps, including always-on and legacy two-level models, and omit unsupported levels.
- Preserve conservative output-token defaults.

Adopt these public fields in the initial implementation rather than deferring them: model discovery is already being rewritten, and adding a second metadata migration later would create avoidable compatibility debt.

Adapt model definitions to `api: "openai-responses"`. Keep model conversion deterministic and independently unit tested with fixtures containing no private model paths or names.

Completion criterion: fixture tests account for complete and partial public catalogue shapes; text-only and multimodal input; explicit and missing tool capabilities; non-text output exclusion; context-length precedence; non-reasoning, always-on reasoning, multi-effort reasoning; and alias-backed models.

## 4. Implement the Responses transport

Base `src/responses-stream.ts` on pi's MIT-licensed OpenAI Responses implementation. Record the exact upstream repository URL and commit in the file header and preserve required license attribution.

Keep the local fork narrow:

1. Build Responses requests with pi-compatible message, tool, image, reasoning, usage, timeout, and abort behavior.
2. Add top-level `return_progress: true`.
3. Obtain the raw Responses event stream.
4. Pass it through the llama-swap normalization iterator.
5. Delegate normalized events to pi-ai's shared `processResponsesStream()` parser.
6. Preserve pi's error, usage, stop-reason, and cost semantics.

Use pi's shared message/tool conversion and Responses event processing where exported and compatible. Treat those imports as version-sensitive integration points: document the minimum tested pi version and cover them with integration tests. Copy additional upstream code only where no reusable seam exists.

Completion criterion: the transport produces valid pi `AssistantMessageEventStream` sequences for text, reasoning, tools, usage, completion, errors, and aborts.

## 5. Normalize llama-server Responses events

The probed llama-server emits useful Responses events but omits `output_index`. Pi's shared parser uses that field to associate output items and deltas.

Implement an async iterator that:

1. Assigns a monotonically increasing index to each `response.output_item.added` event lacking `output_index`.
2. Maps each output item ID to its assigned index.
3. Adds the matching index to delta, part, and done events using `item_id` or `item.id`.
4. Leaves already conforming events unchanged.
5. Supports interleaved reasoning, text, and multiple/parallel function calls.
6. Removes map entries when items complete and clears all state when the stream terminates.

The same iterator must inspect `prompt_progress` without converting it into assistant content or persisting it in session history.

Completion criterion: synthetic interleaved-event tests demonstrate that every delta and completion reaches the correct pi content block, including two parallel tool calls.

## 6. Render prompt progress

Validate progress payloads defensively:

```ts
interface PromptProgress {
  total: number;
  processed: number;
  cache?: number;
  time_ms?: number;
}
```

Calculate progress over uncached prompt tokens:

- `uncachedTotal = max(0, total - cache)`
- `uncachedProcessed = clamp(processed - cache, 0, uncachedTotal)`
- percentage from uncached processed/total;
- ETA from elapsed time and uncached processing rate only when enough data exists.

Display a themed widget below the editor by default. Keep rendering width-safe and update at a throttled rate to avoid excessive terminal redraws. Clear the widget on:

- first reasoning, text, or tool-call output;
- normal completion;
- provider error;
- abort;
- model/session replacement;
- extension shutdown.

Non-TUI modes must continue normally without relying on widget availability. Consider a later configuration option for `widget`, `status`, or `off`; do not block the initial release on it.

Completion criterion: progress appears only during prefill, accurately handles cached prefixes, and never remains stale after stream termination.

## 7. Prove parity with Chat Completions

Use mocked protocol tests plus opt-in live tests against a user-supplied endpoint. Live tests must read configuration only from pi credentials or environment and must never embed endpoints, keys, model paths, or private model IDs in fixtures or snapshots.

Required parity matrix:

- plain text response;
- reasoning on/off and every advertised effort;
- single tool call;
- multiple/parallel tool calls;
- tool-result continuation;
- repeated tool loop through an actual pi session;
- cached-prefix progress;
- uncached progress;
- multimodal image input;
- usage accounting;
- context-overflow error recognition;
- server/provider error propagation;
- user abort during prefill;
- user abort during generation;
- malformed and absent progress metadata;
- server that supports Responses but ignores `return_progress`.

Retain a documented Chat Completions fallback during initial releases if it can preserve existing behavior without duplicating the progress implementation. Do not switch the installed user extension until Responses passes the full matrix.

Completion criterion: all automated tests pass and a real pi session completes text, reasoning, tool, image, cache, and cancellation smoke tests.

## 8. Document the package

### README

Document:

- purpose and features;
- requirements: pi, llama-swap, and a backend supporting `/v1/responses`;
- installation from local path and pinned Git tag;
- `/login llama-swap` as the primary setup path;
- environment variables as the non-interactive alternative;
- model discovery and reasoning-level behavior;
- prompt-progress UI;
- update and removal commands;
- development and test commands;
- security note that pi extensions execute with user permissions;
- the non-standard nature of `return_progress`.

### Architecture

Explain request construction, raw event interception, `output_index` normalization, delegation to pi's shared parser, model discovery, auth resolution, and widget lifecycle.

### Compatibility

Maintain a tested-version table for pi, llama-swap, and llama-server. Record protocol quirks and fallback behavior. Distinguish llama-swap routing support from backend Responses/progress support.

### Configuration

Document interactive credentials, environment fallback, URL normalization, optional API keys, credential storage location managed by pi, and troubleshooting for authentication/model-discovery failures.

Completion criterion: a new user can install, log in, select a discovered model, and understand the security and compatibility boundaries using only repository documentation.

## 9. Security and release gates

Before the first commit and every release:

1. Inspect all tracked and staged files for private hostnames, private URLs, fixed nonstandard ports, bearer tokens, API keys, model filesystem paths, and user-specific paths.
2. Ensure `.env`, credential exports, captured SSE streams, test output, and local pi settings are ignored and untracked.
3. Run `git diff --cached` and `git ls-files` inspection before committing.
4. Run tests and type checking from a clean checkout.
5. Install the package into a temporary pi configuration and perform the live smoke matrix using runtime-supplied credentials.
6. Verify the Git history itself, not only the working tree, before publishing.
7. Tag the first validated release as `v0.1.0` and document installation with that pinned tag.

Completion criterion: a clean clone contains no private infrastructure data, installs through pi's package manager, and passes the release verification command.

## Upstream references

- Pi packages: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md>
- Custom providers: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/custom-provider.md>
- Extension UI: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md>
- OpenAI Responses implementation: <https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/openai-responses.ts>
- Shared Responses parser: <https://github.com/earendil-works/pi/blob/main/packages/ai/src/api/openai-responses-shared.ts>

Pin copied or adapted upstream code to an exact commit when implementation begins.
