#!/bin/sh
# Publishes FlyCoder on Hugging Face: <namespace>/flycoder0.3, <namespace>/flycoder0.3fast, <namespace>/flycoder0.3pro.
#   HF_TOKEN=... sh scripts/publish-hf.sh [<Hugging Face namespace>] [<name> ...]
# Default namespace: the owner of HF_TOKEN. Default names: every model below.
# Each repository mirrors the model published on ollama.com (Tromset/<name>), byte for byte:
# the GGUF weights, the vision projector, the system prompt, the sampling settings and the base's license,
# with docs/huggingface/<name>.md as the model card. Ollama, llama.cpp and LM Studio can run it from there.
# Prerequisites: curl, node, python3 with huggingface_hub (pip install huggingface_hub), a token with write access
# (https://huggingface.co/settings/tokens). Downloads one model at a time: the largest needs 18 GB of free disk.
# GitHub Actions runs this script after each publication on ollama.com (.github/workflows/publish-huggingface.yml).
set -eu

VERSION=0.3
OLLAMA_USER=Tromset
# Published name, quantization. Keep in sync with scripts/publish.sh and docs/huggingface/.
MODELS='flycoder0.3 Q4_K_M
flycoder0.3fast Q4_K_M
flycoder0.3pro Q4_K_M'
REGISTRY=https://registry.ollama.ai/v2

die() { printf 'FlyCoder: %s\n' "$*" >&2; exit 1; }

[ -n "${HF_TOKEN:-}" ] || die "HF_TOKEN is not set (create a write token at https://huggingface.co/settings/tokens)."
for tool in curl node python3; do command -v "$tool" >/dev/null 2>&1 || die "$tool is not installed."; done
python3 -c 'import huggingface_hub' 2>/dev/null || die "huggingface_hub is missing: pip install huggingface_hub"

here=$(cd "$(dirname "$0")/.." && pwd)
namespace=${1:-}
[ $# -gt 0 ] && shift
[ "${namespace#-}" = "$namespace" ] || die "usage: sh scripts/publish-hf.sh [<Hugging Face namespace>] [<name> ...]"
if [ -z "$namespace" ]; then
  namespace=$(curl -fsS -H "Authorization: Bearer $HF_TOKEN" https://huggingface.co/api/whoami-v2 \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).name))') \
    || die "Hugging Face refused HF_TOKEN."
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

wanted() { # wanted <name> [<requested name> ...]: true when nothing was requested or <name> was
  n=$1; shift
  [ $# -eq 0 ] && return 0
  for w in "$@"; do [ "$w" = "$n" ] && return 0; done
  return 1
}

# layer <manifest> <media type>: the digest of the layer with that type, or nothing.
layer() {
  node -e 'const m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
    const l=m.layers.find(l=>l.mediaType==="application/vnd.ollama.image."+process.argv[2]); if(l) console.log(l.digest)' "$1" "$2"
}

# fetch <name> <digest> <file>: downloads a blob of Tromset/<name> and checks its digest.
fetch() {
  curl -fsSL --retry 4 --retry-all-errors -o "$3" "$REGISTRY/$OLLAMA_USER/$1/blobs/$2"
  [ "sha256:$(sha256sum "$3" | cut -d' ' -f1)" = "$2" ] || die "$3 does not match $2."
}

echo "$MODELS" | while read -r name quant; do
  wanted "$name" "$@" || continue
  card="$here/docs/huggingface/$name.md"
  [ -f "$card" ] || die "$card is missing."
  repo="$namespace/$name"
  dir="$work/$name"
  mkdir -p "$dir"
  printf '\n==> https://huggingface.co/%s (from ollama.com/%s/%s)\n' "$repo" "$OLLAMA_USER" "$name"

  curl -fsS -H 'Accept: application/vnd.docker.distribution.manifest.v2+json' \
    -o "$work/manifest.json" "$REGISTRY/$OLLAMA_USER/$name/manifests/latest" || die "Tromset/$name is not on ollama.com."
  model=$(layer "$work/manifest.json" model)
  [ -n "$model" ] || die "Tromset/$name has no weights."
  fetch "$name" "$model" "$dir/$name-$quant.gguf"
  [ "$(head -c 4 "$dir/$name-$quant.gguf")" = GGUF ] || die "the weights of Tromset/$name are not a GGUF file."
  projector=$(layer "$work/manifest.json" projector)
  [ -z "$projector" ] || fetch "$name" "$projector" "$dir/mmproj-$name.gguf"
  # Ollama reads `system` and `params` from the repository when it runs hf.co/<repo>. The template layer is not
  # copied: it is a placeholder, Ollama formats Qwen3.5 with its built-in renderer and llama.cpp with the GGUF's template.
  for kind in system params license; do
    digest=$(layer "$work/manifest.json" "$kind")
    [ -n "$digest" ] || continue
    file=$kind; [ "$kind" = license ] && file=LICENSE
    fetch "$name" "$digest" "$dir/$file"
  done
  sed "s|@HF_NAMESPACE@|$namespace|g" "$card" > "$dir/README.md"

  python3 - "$repo" "$dir" "FlyCoder $VERSION: $name from ollama.com/$OLLAMA_USER/$name" <<'EOF'
import sys
from huggingface_hub import HfApi
repo, folder, message = sys.argv[1:]
api = HfApi()
api.create_repo(repo, repo_type="model", exist_ok=True)
api.upload_folder(repo_id=repo, folder_path=folder, commit_message=message)
EOF
  rm -rf "$dir"
done

printf '\nPublished FlyCoder %s on Hugging Face. Anyone can now run:\n' "$VERSION"
printf '  ollama run hf.co/%s/flycoder0.3\n' "$namespace"
printf '  llama-server -hf %s/flycoder0.3 --jinja\n' "$namespace"
