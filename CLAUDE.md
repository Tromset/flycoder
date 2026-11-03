# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

FlyCoder is not trained weights: it is a set of **Ollama Modelfiles** (base model + sampling + context + system prompt) published as `Tromset/flycoder0.3`, `flycoder0.3fast`, `flycoder0.3pro`, plus FlyBrain's two helper models `flycoder0.3:lite` and `flycoder0.3:router`. The JavaScript in the repo is tooling around those Modelfiles: a benchmark, an optional routing proxy (FlyBrain), an installer and publishers. No npm dependencies; Node >= 22. `Documentation.md` is the full user/developer manual (section 10 covers development).

## Commands

```sh
npm test                                   # whole suite; needs node and python3, no Ollama
node --test tests/router.test.mjs          # one test file
node --test --test-name-pattern="flycoder0.3pro" tests/modelfile.test.mjs   # one test by name
npm run bench -- --models flycoder0.3,flycoder0.3fast [--think off] [--only py-lcs] [--samples 3]  # needs a running Ollama
npm run brain                              # FlyBrain on 127.0.0.1:11435, in front of Ollama on 11434
node brain/eval-router.mjs                 # routing accuracy on labelled prompts (needs Ollama for the micro-model)
ollama create flycoder0.3 -f Modelfile     # build a variant locally
```

CI (`.github/workflows/test.yml`) runs `npm test` on Ubuntu and macOS; on macOS the bench tests run reference solutions inside `sandbox-exec`.

## Cross-file invariants enforced by `tests/modelfile.test.mjs`

Most changes touch several files at once; the tests fail if they drift apart.

- **Model list** lives in seven places that must agree: the Modelfile, the `build <file> <name> <gguf> <mlx>` line in `install.sh`, `MODELS` in `scripts/publish.sh`, the `case` mapping in `.github/workflows/publish-ollama.yml`, `MODELS` in `scripts/publish-hf.sh` (published variants only), `docs/ollama/<name>.md` and `docs/huggingface/<name>.md`, and the `VARIANTS`/`ROUTER` tables at the top of the test file.
- **Version**: `package.json` is `0.3.x`; `VERSION=0.3` in `install.sh`, `scripts/publish.sh`, `scripts/publish-hf.sh`.
- **System prompt**: `Modelfile`, `Modelfile.fast` and `Modelfile.lite` share one `SYSTEM` block, identical except the sentence naming the base model; under 2,500 chars; no `MESSAGE` example conversations. `Modelfile.pro` must contain every shared `- ` rule verbatim (except the "Never claim..." line, which it rewords for tool use), plus the agent rules; under 3,000 chars. Each Modelfile declares `REQUIRES` (0.30.0, or 0.32.12 for pro) and only known `PARAMETER` keys.
- **ollama.com pages** (`docs/ollama/`): at most 40 lines, must state size, Mac memory, context and base, must not mention 0.2 or Gemma. They are pasted by hand on ollama.com (the API cannot edit pages).
- **Hugging Face cards** (`docs/huggingface/`): front matter with `license: apache-2.0` and `base_model: Qwen/...`, the literal placeholder `@HF_NAMESPACE@`, and `-c <num_ctx> `.
- Shell scripts are POSIX `sh` (checked with `sh -n`).

Prompt or sampling changes are judged with the bench, not by intuition: Documentation.md §6.5 and §7 record that a longer workflow prompt with a worked example scored 6/20 vs 9/20 and was dropped. Reference runs are stored in `docs/bench/`; local runs go to the git-ignored `bench/results/`.

## Publishing is automatic on `main`

Merging a change to any `Modelfile*` into `main` rebuilds and pushes the affected models to ollama.com (`publish-ollama`, secret `OLLAMA_KEY`), then `publish-huggingface` mirrors the same GGUF blobs from the Ollama registry to Hugging Face (secret `HF_TOKEN`; skipped with a warning if absent). Treat Modelfile edits as releases.

## Architecture

**Bench** (`bench/`): `problems.mjs` holds 20 problems (`id` prefixed `py-`/`js-`, `language`, `entry`, `prompt`, `reference`, `test`). Only `prompt` (plus a format instruction from `instruction()`) reaches the model. `bench.mjs` streams the answer from Ollama, `extractCode()` picks the fenced block in the right language that defines `entry`, and `runTest()` runs it in a temp dir with a timeout (and `sandbox-exec` on macOS). `npm test` proves every problem: the reference must pass and a stub must fail.

**FlyBrain** (`brain/`): an Ollama-compatible HTTP proxy that answers to `flycoder`/`flycoder0.3`/`flycoder0.3fast` (optionally with a `--prefix` like `Tromset/`) and forwards everything else untouched. `router.mjs` is pure logic: `digest()` normalises native, OpenAI and Anthropic request shapes; `ruleRoute()` decides `simple`/`hard`/`unsure` from cheap cues (tools, length, code fences, spec bullets, bilingual EN/FR keyword regexes); only `unsure` asks the `flycoder0.3:router` micro-model, and any failure falls back to `hard`. `Memory` keys conversations by their first user message so a conversation can move up to the hard expert but never back down. `flybrain.mjs` adds the `Scheduler` (one expert loaded at a time, unloading via `keep_alive: 0`), forces `think: true` on the normal profile, and exposes `x-flybrain-expert`/`x-flybrain-reason` headers. `flycoder0.3pro` is deliberately not routed. Tests run it against a fake Ollama server.

**Installer** (`install.sh`): picks a variant from system memory, builds it locally under the short name `flycoder` (GGUF or `--mlx` tags), and copies `brain/` to `~/.flycoder/brain/`.

**Legacy, independent of FlyCoder**: `training/`, `server/fly-language.js`, `scripts/build_language_dataset.js` (the former FlyBrain voice pipeline; it speaks French by design, Python/MLX under `.venv/`). Only `tests/fly-language.test.js` covers it.

## Conventions

- Commit messages use a `type(scope): summary` style (`feat`, `fix(pro)`, `ci`, `docs`, `bench`).
- User-facing docs are in English; `.github/rulesets/` is in French. The repo has owner-only rulesets; `.github/rulesets/README.md` notes that Claude's `claude-code/*` pushes may need a bypass entry.
