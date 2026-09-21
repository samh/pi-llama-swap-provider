#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
pi_bin=${PI_BIN:-${PI_PACKAGE_DIR:+$PI_PACKAGE_DIR/../../bin/pi}}
pi_bin=${pi_bin:-$(command -v pi)}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

npm pack --silent --pack-destination "$tmp" "$root" >/dev/null
tar -xzf "$tmp"/pi-llama-swap-provider-*.tgz -C "$tmp"
cd "$tmp"

HOME="$tmp/home" \
  env -u LLAMA_SWAP_BASE_URL -u LLAMA_SWAP_API_KEY \
  "$pi_bin" -ne -e "$tmp/package" --list-models llama-swap >/dev/null
