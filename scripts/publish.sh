#!/bin/sh
# Publishes FlyCoder on ollama.com so anyone can run: ollama run <user>/flycoder
#   sh scripts/publish.sh <ollama.com username> [--gguf]
# Prerequisites: an ollama.com account, then `ollama signin` once on this Mac.
# The models must exist locally: run `sh install.sh --all` first.
#   --gguf  also publish portable GGUF tags (0.2-beta-gguf, 0.2-beta-fast-gguf) for Intel Macs, Linux and Windows
set -eu

VERSION=0.2-beta
die() { printf 'FlyCoder : %s\n' "$*" >&2; exit 1; }

user=${1:-}
[ -n "$user" ] && [ "${user#-}" = "$user" ] || die "usage : sh scripts/publish.sh <nom d'utilisateur ollama.com> [--gguf]"
gguf=${2:-}
[ -z "$gguf" ] || [ "$gguf" = --gguf ] || die "option inconnue : $gguf"
command -v ollama >/dev/null 2>&1 || die "Ollama n'est pas installé."

require() { ollama show "$1" >/dev/null 2>&1 || die "$1 est absent. Lancez d'abord : sh install.sh --all"; }
format() { ollama show "$1" 2>/dev/null | awk '/quantization/ {print $2}' | head -n 1; }
push() { # push <local model> <remote tag>
  ollama cp "$1" "$user/flycoder:$2"
  ollama push "$user/flycoder:$2"
}

here=$(cd "$(dirname "$0")/.." && pwd)
require "flycoder:$VERSION"
require "flycoder:$VERSION-fast"
# The main tags must hold the Apple Silicon (MLX) builds, never a GGUF fallback.
for model in "flycoder:$VERSION" "flycoder:$VERSION-fast"; do
  [ "$(format "$model")" = nvfp4 ] || die "$model n'est pas la version MLX. Publiez depuis un Mac Apple Silicon après : sh install.sh --all"
done

push "flycoder:$VERSION" "$VERSION"
push "flycoder:$VERSION" latest
push "flycoder:$VERSION-fast" "$VERSION-fast"
push "flycoder:$VERSION-fast" fast

if [ "$gguf" = --gguf ]; then
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  sed 's|^FROM gemma4:12b-mlx$|FROM gemma4:12b|' "$here/Modelfile" > "$tmp/Modelfile"
  sed 's|^FROM qwen3.5:4b-mlx$|FROM qwen3.5:4b|' "$here/Modelfile.fast" > "$tmp/Modelfile.fast"
  ollama create "flycoder:$VERSION-gguf" -f "$tmp/Modelfile"
  ollama create "flycoder:$VERSION-fast-gguf" -f "$tmp/Modelfile.fast"
  push "flycoder:$VERSION-gguf" "$VERSION-gguf"
  push "flycoder:$VERSION-fast-gguf" "$VERSION-fast-gguf"
fi

printf '\nPublié. Tout le monde peut maintenant lancer :\n  ollama run %s/flycoder        (Gemma 4 12B, Mac 16 Go et plus)\n  ollama run %s/flycoder:fast   (Qwen3.5 4B, Mac 8 Go)\n' "$user" "$user"
printf 'Page du modèle : https://ollama.com/%s/flycoder (collez-y docs/ollama-model-page.md)\n' "$user"
