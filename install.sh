#!/bin/sh
# FlyCoder 0.2 beta installer: builds the FlyCoder model inside your local Ollama.
#   curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh
#   sh install.sh [--fast | --all] [--gguf] [--no-brain]
#     --fast      install only flycoder:0.2-beta-fast (Qwen3.5 4B, 8 GB Macs, maximum speed)
#     --all       install both variants
#     --gguf      use the portable GGUF weights instead of MLX (Intel Macs, Linux, Windows)
#     --no-brain  skip the FlyBrain experts (flycoder:router, flycoder:0.2-beta-lite)
set -eu

VERSION=0.2-beta
MIN_OLLAMA=0.31.0
REF=${FLYCODER_REF:-main}
RAW=https://raw.githubusercontent.com/Tromset/flycoder/$REF

say() { printf '%s\n' "$@"; }
die() { printf 'FlyCoder : %s\n' "$*" >&2; exit 1; }

choice=auto
engine=auto
brain=yes
for arg in "$@"; do
  case $arg in
    --fast) choice=fast ;;
    --all) choice=all ;;
    --gguf) engine=gguf ;;
    --no-brain) brain=no ;;
    -h|--help) sed -n '2,9p' "$0" 2>/dev/null || true; exit 0 ;;
    *) die "option inconnue : $arg" ;;
  esac
done

command -v ollama >/dev/null 2>&1 || die "Ollama n'est pas installé. Téléchargez-le sur https://ollama.com/download puis relancez cette commande."
ollama list >/dev/null 2>&1 || die "Ollama ne répond pas. Ouvrez l'application Ollama (ou lancez 'ollama serve') puis relancez."

# Version check: returns success when $1 >= $2 (x.y.z).
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -n 1)" = "$2" ]
}
current=$(ollama --version 2>/dev/null | sed -n 's/.*version is \([0-9][0-9.]*\).*/\1/p' | head -n 1)
[ -n "$current" ] || die "impossible de lire la version d'Ollama."
version_ge "$current" "$MIN_OLLAMA" || die "Ollama $current est trop ancien. FlyCoder $VERSION demande Ollama $MIN_OLLAMA ou plus récent : https://ollama.com/download"

os=$(uname -s)
arch=$(uname -m)
if [ "$engine" = auto ]; then
  if [ "$os" = Darwin ] && [ "$arch" = arm64 ]; then engine=mlx; else engine=gguf; fi
fi

case $os in
  Darwin) memory_gb=$(( $(sysctl -n hw.memsize) / 1073741824 )) ;;
  Linux) memory_gb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1048576 )) ;;
  *) memory_gb=16 ;;
esac

if [ "$choice" = auto ]; then
  # 16 GB machines report a little less than 16 GiB of usable memory.
  if [ "$memory_gb" -ge 15 ]; then choice=default; else choice=fast; fi
fi

# Modelfiles come from this checkout when present, otherwise from GitHub.
here=$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo .)
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT
trap 'exit 130' INT TERM
fetch() {
  if [ -f "$here/$1" ] && grep -q "FlyCoder" "$here/$1"; then cp "$here/$1" "$workdir/$1"
  else curl -fsSL "$RAW/$1" -o "$workdir/$1" || die "téléchargement impossible : $RAW/$1"; fi
}

build() { # build <Modelfile> <tag> <mlx base> <gguf base>
  fetch "$1"
  base=$3
  if [ "$engine" = gguf ]; then
    base=$4
    sed "s|^FROM $3\$|FROM $4|" "$workdir/$1" > "$workdir/$1.gguf" && mv "$workdir/$1.gguf" "$workdir/$1"
  fi
  grep -q "^FROM $base\$" "$workdir/$1" || die "$1 ne part pas de $base."
  say "" "==> Téléchargement de la base $base"
  ollama pull "$base"
  say "==> Création de flycoder:$2"
  ollama create "flycoder:$2" -f "$workdir/$1"
}

say "FlyCoder $VERSION · Ollama $current · $os $arch · ${memory_gb} Go · moteur $engine"
case $choice in
  default) build Modelfile "$VERSION" gemma4:12b-mlx gemma4:12b; ollama cp "flycoder:$VERSION" flycoder:latest ;;
  fast) build Modelfile.fast "$VERSION-fast" qwen3.5:4b-mlx qwen3.5:4b; ollama cp "flycoder:$VERSION-fast" flycoder:latest ;;
  all)
    build Modelfile "$VERSION" gemma4:12b-mlx gemma4:12b
    build Modelfile.fast "$VERSION-fast" qwen3.5:4b-mlx qwen3.5:4b
    ollama cp "flycoder:$VERSION" flycoder:latest ;;
esac

# FlyBrain experts: the micro-router (1 GB) and the 2B expert for simple requests in flycoder:fast.
if [ "$brain" = yes ]; then
  build Modelfile.router router qwen3.5:0.8b-nvfp4 qwen3.5:0.8b
  build Modelfile.lite "$VERSION-lite" qwen3.5:2b-nvfp4 qwen3.5:2b
  if [ "$choice" = default ]; then build Modelfile.fast "$VERSION-fast" qwen3.5:4b-mlx qwen3.5:4b; fi
  # The FlyBrain server itself: two dependency-free Node files.
  brain_dir=${FLYCODER_HOME:-$HOME/.flycoder}/brain
  mkdir -p "$brain_dir"
  for file in brain/router.mjs brain/flybrain.mjs; do
    if [ -f "$here/$file" ]; then cp "$here/$file" "$brain_dir/"
    else curl -fsSL "$RAW/$file" -o "$brain_dir/${file#brain/}" || die "téléchargement impossible : $RAW/$file"; fi
  done
fi

say "" "FlyCoder est installé. Lancez :  ollama run flycoder"
if [ "$brain" = yes ]; then
  say "Avec le routeur FlyBrain (moins de RAM, Node 22) :  node $brain_dir/flybrain.mjs" \
      "puis, dans un autre terminal :  OLLAMA_HOST=127.0.0.1:11435 ollama run flycoder"
  if [ "$choice" = fast ]; then say "(sans le modèle 12B, lancez FlyBrain avec  --max-expert fast)"; fi
fi
[ "$choice" = default ] && say "Version la plus rapide (8 Go) :  sh install.sh --fast"
exit 0
