#!/usr/bin/env bash
set -euo pipefail

: "${LLAMA_SWAP_BASE_URL:?LLAMA_SWAP_BASE_URL is required}"
: "${LLAMA_SWAP_LIVE_FAST_MODEL:?LLAMA_SWAP_LIVE_FAST_MODEL is required}"

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
pi_bin=${PI_BIN:-${PI_PACKAGE_DIR:+$PI_PACKAGE_DIR/../../bin/pi}}
pi_bin=${pi_bin:-$(command -v pi)}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

npm pack --silent --pack-destination "$tmp" "$root" >/dev/null
tar -xzf "$tmp"/pi-llama-swap-provider-*.tgz -C "$tmp"
cd "$tmp"

output=$(
  HOME="$tmp/home" "$pi_bin" -ne -e "$tmp/package" \
    --no-session --no-tools \
    --provider llama-swap \
    --model "$LLAMA_SWAP_LIVE_FAST_MODEL" \
    --thinking off \
    -p "Reply with exactly PACKAGE_OK"
)

if [[ "${output//$'\n'/}" != "PACKAGE_OK" ]]; then
  printf 'Unexpected packed-extension response: %s\n' "$output" >&2
  exit 1
fi
