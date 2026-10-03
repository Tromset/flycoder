#!/bin/sh
# Publishes FlyCoder on ollama.com so anyone can run: ollama run <user>/flycoder
#   sh scripts/publish.sh <ollama.com username> [--gguf]
# Prerequisites: an ollama.com account, then `ollama signin` once on this Mac.
# The models must exist locally: run `sh install.sh --all` first.
#   --gguf  also publish portable GGUF tags (0.2-beta-gguf, 0.2-beta-fast-gguf, 0.2-beta-lite-gguf, router-gguf) for Intel Macs, Linux and Windows
set -eu

VERSION=0.2-beta
die() { printf 'FlyCoder: %s\n' "$*" >&2; exit 1; }

user=${1:-}
[ -n "$user" ] && [ "${user#-}" = "$user" ] || die "usage: sh scripts/publish.sh <ollama.com username> [--gguf]"
gguf=${2:-}
[ -z "$gguf" ] || [ "$gguf" = --gguf ] || die "unknown option: $gguf"
command -v ollama >/dev/null 2>&1 || die "Ollama is not installed."

require() { ollama show "$1" >/dev/null 2>&1 || die "$1 is missing. First run: sh install.sh --all"; }
format() { ollama show "$1" 2>/dev/null | awk '/quantization/ {print $2}' | head -n 1; }
push() { # push <local model> <remote tag>
  ollama cp "$1" "$user/flycoder:$2"
  ollama push "$user/flycoder:$2"
}

here=$(cd "$(dirname "$0")/.." && pwd)
require "flycoder:$VERSION"
require "flycoder:$VERSION-fast"
require "flycoder:$VERSION-lite"
require flycoder:router
# The main tags must hold the Apple Silicon (MLX) builds, never a GGUF fallback.
for model in "flycoder:$VERSION" "flycoder:$VERSION-fast" "flycoder:$VERSION-lite" flycoder:router; do
  [ "$(format "$model")" = nvfp4 ] || die "$model is not the MLX build. Publish from an Apple Silicon Mac after: sh install.sh --all"
done

push "flycoder:$VERSION" "$VERSION"
push "flycoder:$VERSION" latest
push "flycoder:$VERSION-fast" "$VERSION-fast"
push "flycoder:$VERSION-fast" fast
# FlyBrain experts, used by: node brain/flybrain.mjs --prefix <user>/
push "flycoder:$VERSION-lite" "$VERSION-lite"
push flycoder:router router

if [ "$gguf" = --gguf ]; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  sed 's|^FROM gemma4:12b-mlx$|FROM gemma4:12b|' "$here/Modelfile" > "$tmp/Modelfile"
  sed 's|^FROM qwen3.5:4b-mlx$|FROM qwen3.5:4b|' "$here/Modelfile.fast" > "$tmp/Modelfile.fast"
  sed 's|^FROM qwen3.5:2b-nvfp4$|FROM qwen3.5:2b|' "$here/Modelfile.lite" > "$tmp/Modelfile.lite"
  sed 's|^FROM qwen3.5:0.8b-nvfp4$|FROM qwen3.5:0.8b|' "$here/Modelfile.router" > "$tmp/Modelfile.router"
  ollama create "flycoder:$VERSION-gguf" -f "$tmp/Modelfile"
  ollama create "flycoder:$VERSION-fast-gguf" -f "$tmp/Modelfile.fast"
  ollama create "flycoder:$VERSION-lite-gguf" -f "$tmp/Modelfile.lite"
  ollama create flycoder:router-gguf -f "$tmp/Modelfile.router"
  push "flycoder:$VERSION-gguf" "$VERSION-gguf"
  push "flycoder:$VERSION-fast-gguf" "$VERSION-fast-gguf"
  push "flycoder:$VERSION-lite-gguf" "$VERSION-lite-gguf"
  push flycoder:router-gguf router-gguf
fi

printf '\nPublished. Anyone can now run:\n  ollama run %s/flycoder        (Gemma 4 12B, Macs with 16 GB or more)\n  ollama run %s/flycoder:fast   (Qwen3.5 4B, 8 GB Macs)\n' "$user" "$user"
printf 'Model page: https://ollama.com/%s/flycoder (paste docs/ollama-model-page.md there)\n' "$user"
