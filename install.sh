#!/bin/sh
# FlyCoder 0.3 installer: builds FlyCoder inside your local Ollama, picked from your memory.
#   curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh
#   sh install.sh [--fast | --pro | --all] [--mlx] [--no-brain]
#     --fast      install flycoder0.3fast (Qwen3.5 4B, 8 GB Macs, maximum speed)
#     --pro       install flycoder0.3pro (Qwen3.8 27B, 32 GB Macs or more)
#     --all       install all three variants
#     --mlx       use Ollama's MLX engine on Apple Silicon (faster, needs Ollama 0.31+); default: portable GGUF
#     --no-brain  skip the FlyBrain experts (flycoder0.3:router, flycoder0.3:lite)
# Without installing anything, the published models also work: ollama run Tromset/flycoder0.3
set -eu

VERSION=0.3
REF=${FLYCODER_REF:-main}
RAW=https://raw.githubusercontent.com/Tromset/flycoder/$REF

say() { printf '%s\n' "$@"; }
die() { printf 'FlyCoder: %s\n' "$*" >&2; exit 1; }

choice=auto
engine=gguf
brain=yes
for arg in "$@"; do
  case $arg in
    --fast) choice=fast ;;
    --pro) choice=pro ;;
    --all) choice=all ;;
    --mlx) engine=mlx ;;
    --no-brain) brain=no ;;
    -h|--help) sed -n '2,10p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "unknown option: $arg" ;;
  esac
done

command -v ollama >/dev/null 2>&1 || die "Ollama is not installed. Download it from https://ollama.com/download, then run this command again."
ollama list >/dev/null 2>&1 || die "Ollama is not responding. Open the Ollama app (or run 'ollama serve'), then try again."

# Version check: returns success when $1 >= $2 (x.y.z).
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -n 1)" = "$2" ]
}
current=$(ollama --version 2>/dev/null | sed -n 's/.*version is \([0-9][0-9.]*\).*/\1/p' | head -n 1)
[ -n "$current" ] || die "could not read the Ollama version."
need() { # need <minimum Ollama version> <what>
  version_ge "$current" "$1" || die "Ollama $current is too old: $2 needs Ollama $1 or later. Update it from https://ollama.com/download, then run this command again."
}
need 0.30.0 "FlyCoder $VERSION (Qwen3.5)"
[ "$engine" = mlx ] && need 0.31.0 "the MLX engine"

os=$(uname -s)
arch=$(uname -m)
[ "$engine" = gguf ] || { [ "$os" = Darwin ] && [ "$arch" = arm64 ]; } || die "--mlx needs an Apple Silicon Mac."

case $os in
  Darwin) memory_gb=$(( $(sysctl -n hw.memsize) / 1073741824 )) ;;
  Linux) memory_gb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1048576 )) ;;
  *) memory_gb=16 ;;
esac

if [ "$choice" = auto ]; then
  # 16 GB machines report a little less than 16 GiB of usable memory.
  if [ "$memory_gb" -ge 30 ]; then choice=pro
  elif [ "$memory_gb" -ge 15 ]; then choice=default
  else choice=fast; fi
fi
case $choice in pro|all) need 0.32.12 "flycoder0.3pro (Qwen3.8)" ;; esac

# Modelfiles come from this checkout when present, otherwise from GitHub.
here=$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo .)
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
trap 'exit 130' INT TERM
fetch() {
  if [ -f "$here/$1" ] && grep -q "FlyCoder" "$here/$1"; then cp "$here/$1" "$workdir/$1"
  else curl -fsSL "$RAW/$1" -o "$workdir/$1" || die "download failed: $RAW/$1"; fi
}

build() { # build <Modelfile> <name> <gguf base> <mlx base>
  fetch "$1"
  base=$3
  if [ "$engine" = mlx ]; then
    base=$4
    sed "s|^FROM $3\$|FROM $4|" "$workdir/$1" > "$workdir/$1.mlx" && mv "$workdir/$1.mlx" "$workdir/$1"
  fi
  grep -q "^FROM $base\$" "$workdir/$1" || die "$1 does not start from $base."
  say "" "==> Downloading base model $base"
  ollama pull "$base"
  say "==> Creating $2"
  ollama create "$2" -f "$workdir/$1"
}
main() { build Modelfile flycoder0.3 qwen3.5:9b qwen3.5:9b-mtp-nvfp4; }
fast() { build Modelfile.fast flycoder0.3fast qwen3.5:4b qwen3.5:4b-nvfp4; }
pro() { build Modelfile.pro flycoder0.3pro qwen3.8:27b qwen3.8:27b-nvfp4; }

say "FlyCoder $VERSION · Ollama $current · $os $arch · ${memory_gb} GB · $engine weights"
# `flycoder` is a short alias for the variant that fits this machine.
case $choice in
  default) main; ollama cp flycoder0.3 flycoder ;;
  fast) fast; ollama cp flycoder0.3fast flycoder ;;
  pro) pro; ollama cp flycoder0.3pro flycoder ;;
  all) main; fast; pro; ollama cp flycoder0.3 flycoder ;;
esac

# FlyBrain routes flycoder0.3 and flycoder0.3fast; flycoder0.3pro is never routed.
[ "$choice" = pro ] && brain=no
if [ "$brain" = yes ]; then
  # The micro-router (1 GB), the 2B expert, and the 4B for simple requests to flycoder0.3.
  build Modelfile.router flycoder0.3:router qwen3.5:0.8b qwen3.5:0.8b-nvfp4
  build Modelfile.lite flycoder0.3:lite qwen3.5:2b qwen3.5:2b-nvfp4
  [ "$choice" = default ] && fast
  # The FlyBrain server itself: two dependency-free Node files.
  brain_dir=${FLYCODER_HOME:-$HOME/.flycoder}/brain
  mkdir -p "$brain_dir"
  for file in brain/router.mjs brain/flybrain.mjs; do
    if [ -f "$here/$file" ]; then cp "$here/$file" "$brain_dir/"
    else curl -fsSL "$RAW/$file" -o "$brain_dir/${file#brain/}" || die "download failed: $RAW/$file"; fi
  done
fi

say "" "FlyCoder is installed. Run:  ollama run flycoder"
if [ "$brain" = yes ]; then
  say "With the FlyBrain router (less RAM, Node 22):  node $brain_dir/flybrain.mjs" \
      "then, in another terminal:  OLLAMA_HOST=127.0.0.1:11435 ollama run flycoder0.3"
  [ "$choice" = fast ] && say "(without the 9B model, start FlyBrain with  --max-expert fast)"
fi
exit 0
