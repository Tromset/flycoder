#!/bin/sh
# Publishes FlyCoder on ollama.com: <user>/flycoder0.3, <user>/flycoder0.3fast, <user>/flycoder0.3pro
# and FlyBrain's experts <user>/flycoder0.3:lite and <user>/flycoder0.3:router.
#   sh scripts/publish.sh [<ollama.com username>] [<name> ...]
# Default user: Tromset. Default names: every model below. Example: sh scripts/publish.sh Tromset flycoder0.3fast
# Prerequisite: this machine's Ollama key is linked to the account (`ollama signin` once).
# GitHub Actions runs this script on every change to main (.github/workflows/publish-ollama.yml).
#   FLYCODER_PRUNE=1  removes each model and its base after the push, to keep the disk free (used by CI)
set -eu

VERSION=0.3
# Modelfile, published name. Keep in sync with install.sh and docs/ollama/.
MODELS='Modelfile flycoder0.3
Modelfile.fast flycoder0.3fast
Modelfile.pro flycoder0.3pro
Modelfile.lite flycoder0.3:lite
Modelfile.router flycoder0.3:router'

die() { printf 'FlyCoder: %s\n' "$*" >&2; exit 1; }

user=${1:-Tromset}
[ "${user#-}" = "$user" ] || die "usage: sh scripts/publish.sh [<ollama.com username>] [<name> ...]"
[ $# -gt 0 ] && shift
command -v ollama >/dev/null 2>&1 || die "Ollama is not installed."
ollama list >/dev/null 2>&1 || die "Ollama is not responding. Start it with 'ollama serve'."

here=$(cd "$(dirname "$0")/.." && pwd)
wanted() { # wanted <name> [<requested name> ...]: true when nothing was requested or <name> was
  n=$1; shift
  [ $# -eq 0 ] && return 0
  for w in "$@"; do [ "$w" = "$n" ] && return 0; done
  return 1
}

echo "$MODELS" | while read -r file name; do
  wanted "$name" "$@" || continue
  base=$(sed -n 's/^FROM //p' "$here/$file" | head -n 1)
  [ -n "$base" ] || die "$file has no FROM line."
  printf '\n==> %s/%s (%s, base %s)\n' "$user" "$name" "$file" "$base"
  ollama pull "$base"
  ollama create "$user/$name" -f "$here/$file"
  ollama push "$user/$name"
  if [ "${FLYCODER_PRUNE:-0}" = 1 ]; then ollama rm "$user/$name" "$base" >/dev/null; fi
done

printf '\nPublished FlyCoder %s. Anyone can now run:\n' "$VERSION"
printf '  ollama run %s/flycoder0.3        (Macs with 16 GB)\n' "$user"
printf '  ollama run %s/flycoder0.3fast    (Macs with 8 GB)\n' "$user"
printf '  ollama run %s/flycoder0.3pro     (Macs with 32 GB or more)\n' "$user"
