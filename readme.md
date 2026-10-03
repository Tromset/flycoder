# FlyCoder 0.3 beta

FlyCoder is a local coding model for Ollama, tuned for Apple Silicon MacBooks and Mac minis. Use it directly with `ollama run`, or from any Ollama-compatible tool. Since 0.3, the optional **FlyBrain** router only activates the part of FlyCoder a request needs, which lowers memory use (see below).

Full documentation (installation, usage, API, settings, benchmark, publishing, troubleshooting): [Documentation.md](Documentation.md).

## One-command install

You need [Ollama](https://ollama.com/download) 0.31 or later, running. FlyCoder is published at [ollama.com/Tromset/flycoder](https://ollama.com/Tromset/flycoder):

```sh
ollama run Tromset/flycoder        # Gemma 4 12B, Macs with 16 GB or more
ollama run Tromset/flycoder:fast   # Qwen3.5 4B, 8 GB Macs
```

For now only the portable GGUF tags are online (`ollama run Tromset/flycoder:0.2-beta-gguf`); the Mac (MLX) tags above come next. Until then, Macs install with `install.sh` below.

Or, to install it under the short name `flycoder`, with the variant picked from your Mac's memory:

```sh
curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh
ollama run flycoder
```

The installer detects your Mac's memory and builds the right variant in your local Ollama: `flycoder:0.2-beta` from 16 GB up, `flycoder:0.2-beta-fast` below that. Either way, `ollama run flycoder` works. Options: `sh -s -- --fast` (fast variant), `sh -s -- --all` (both), `sh -s -- --gguf` (GGUF weights for Intel Macs, Linux or Windows).

## The two variants

| Tag | Base | Weights | Recommended Mac | Context |
|---|---|---|---|---|
| `flycoder:0.2-beta` (`latest`) | Gemma 4 12B, Google DeepMind | 7.7 GB, NVFP4 on MLX | 16 GB or more | 32,768 tokens |
| `flycoder:0.2-beta-fast` (`fast`) | Qwen3.5 4B, Alibaba Qwen | 4.0 GB, NVFP4 on MLX | 8 GB or more | 16,384 tokens |

Both bases are licensed under Apache 2.0 and support tool calling, thinking and images.

## FlyBrain: less RAM, same quality on hard requests

FlyBrain takes its cue from the fly's brain: small hints drawn from the request (like the Kenyon cells of the mushroom body) are enough to settle the clear cases. When nothing is clear, a 0.8-billion-parameter micro-model decides. Only one expert "lobe" is then loaded into memory.

| You call | Simple request | Hard request, tools (agents) or long context | Unclear request |
|---|---|---|---|
| `flycoder` | Qwen3.5 4B, with thinking | Gemma 4 12B, with thinking | the `flycoder:router` micro-model (Qwen3.5 0.8B) decides |
| `flycoder:fast` | `flycoder:0.2-beta-lite` (Qwen3.5 2B) | Qwen3.5 4B | Qwen3.5 4B (no micro-model) |

Measured memory (resident memory of the model processes after one answer, 16 GB Linux server without a GPU, GGUF weights; on a Mac with MLX the absolute values differ):

| Case | Without FlyBrain | With FlyBrain |
|---|---|---|
| `flycoder`, simple request | 10.5 GiB | **6.1 GiB** (4B + micro-model) |
| `flycoder`, hard request | 10.5 GiB | 10.5 GiB (unchanged: quality is kept) |
| `flycoder:fast`, simple request | 4.6 GiB | **3.7 GiB** |
| `flycoder:fast`, hard request | 4.6 GiB | 4.6 GiB |

The router is rarely wrong: out of 60 labelled requests (the 20 bench problems plus 40 requests written for the purpose in [tests/fixtures/route-prompts.json](tests/fixtures/route-prompts.json)), it routes 59 correctly. No hard request went to the small model; one simple git question went to the large one. The rules decide on their own 39 times; the micro-model answers in about 0.6 s (median, on CPU). If the micro-model fails or hesitates, the request goes to the large model. A conversation keeps its expert and can only move up to the stronger one. Below 16 GB of memory, FlyBrain caps `flycoder` at the 4B.

```sh
node ~/.flycoder/brain/flybrain.mjs        # installed by install.sh; or: npm run brain from this repository
OLLAMA_HOST=127.0.0.1:11435 ollama run flycoder
```

FlyBrain speaks the Ollama API on port 11435 and passes every other model through. For a coding agent, point it at FlyBrain instead of Ollama:

```sh
ANTHROPIC_BASE_URL=http://127.0.0.1:11435 ANTHROPIC_AUTH_TOKEN=ollama ANTHROPIC_API_KEY="" claude --model flycoder   # Claude Code
# Codex, OpenCode, Cline…: OpenAI-compatible URL http://127.0.0.1:11435/v1, model flycoder
```

With the models published on ollama.com rather than installed by `install.sh`: `ollama pull Tromset/flycoder:router` (and `:0.2-beta-lite`, `:0.2-beta-fast`, `:0.2-beta`), then `node brain/flybrain.mjs --prefix Tromset/`.

## What changed since 0.1

**A much stronger base model.** 0.1 was built on Qwen3.5 4B. On LiveCodeBench v6, using the figures published by the authors in thinking mode, Gemma 4 12B scores 72.0% against 55.8% for Qwen3.5 4B (and 65.6% for Qwen3.5 9B, which would be twice as slow). Its published Codeforces Elo is 1659.

**Multi-token prediction keeps the cost of 12 billion parameters in check.** Gemma 4 ships a small draft model that proposes several tokens ahead; the main model verifies them in a single pass. Measured here over 14 coding answers: 77% of the 6,594 proposed tokens accepted, 3.35 tokens validated per pass, and generation 49% faster than with the draft disabled (2.7 → 4.1 tokens/s on the same example). Ollama reports about +90% on Apple Silicon.

**Apple Silicon's MLX engine.** Both variants use NVFP4 weights on Ollama's MLX engine. According to Ollama, this format generates about 20% faster than 0.1's Q4_K_M and roughly halves the quality loss from quantization.

**Fixed settings.** 0.1 ran at a temperature of 0.2, which Qwen advises against (risk of endless repetition and lower quality). 0.2 applies the official settings: Google's for Gemma 4, Qwen's for coding in thinking mode.

**Enough context for real code.** Out of the box, Ollama limits machines with less than 24 GB to 4,096 tokens. FlyCoder sets 32,768 tokens (main variant) and 16,384 (fast variant).

**A short system prompt dedicated to code**: keep the requested names and signatures exactly, deliver complete code without "TODO", handle edge cases, never invent APIs, never claim to have run tests, avoid common vulnerabilities, answer in the user's language.

## Measured speed and quality

The `bench/` benchmark holds 20 coding problems (13 in Python, 7 in JavaScript) with hidden tests: intervals, strict Roman numerals, topological sort, LRU cache, SemVer, CSV, Dijkstra on 100,000 edges, expression evaluator, `*`/`?` wildcard matching that withstands pathological cases, and more. Each test is validated against a reference solution and rejects an empty solution (`npm test`).

Run recorded in [docs/bench/cpu-nothink.json](docs/bench/cpu-nothink.json), on a 4-core Linux server **without a GPU** (Ollama 0.35, GGUF Q4_K_M weights, thinking disabled as in the former workshop, one attempt per problem, 2,048 tokens maximum). Absolute speeds are much lower than on a Mac; only the comparisons between profiles matter:

| Profile | Base | Problems solved | Generation | Tokens per answer | Time per problem |
|---|---|---|---|---|---|
| `flycoder0.1beta` (0.1) | Qwen3.5 4B, temperature 0.2 | 5/20 (25%) | 6.6 tok/s | 581 | 94 s |
| `flycoder:0.2-beta-fast` | Qwen3.5 4B, Qwen settings | 5/20 (25%) | 6.5 tok/s | 537 | 89 s |
| `flycoder:0.2-beta` | Gemma 4 12B, multi-token | **14/20 (70%)** | 3.4 tok/s | 739 | 235 s |

What these numbers say:

- **The main variant solves almost three times as many problems** as 0.1: 14 against 5, including the expression evaluator, the CSV parser, the LRU cache, strict Roman numerals and spelling numbers out in words, all failed by 0.1.
- **It is slower per problem on this server**: about 2.5 times 0.1's time, because it writes more complete code (validation, docstrings) and each token costs more on CPU. On a Mac, the MLX engine and the multi-token gain, which is larger on GPU, should narrow that gap; this is not measured yet.
- **The fast variant keeps exactly 0.1's speed** (6.5 against 6.6 tokens/s, 89 against 94 s per problem) with the same pass rate without thinking, and 8% fewer tokens. On a Mac, it also gains the MLX engine.

Seven problems for the main variant and one for the fast variant were rerun: on the first pass, the server had run out of memory or the bench had cut the request after 5 minutes. These were infrastructure failures, not answers; the bench now streams answers and retries a crashed model once.

To measure on your Mac:

```sh
ollama create flycoder0.1beta -f bench/baselines/flycoder-0.1-beta.Modelfile   # to compare with 0.1
npm run bench -- --models flycoder0.1beta,flycoder:0.2-beta,flycoder:0.2-beta-fast
```

The bench runs the code the models produce on your machine, in a temporary folder, with a time limit; on macOS, `sandbox-exec` blocks network access and writes outside that folder. Useful options: `--think on|off`, `--samples 3`, `--only py-lcs,js-evaluate`.

## Usage

```sh
ollama run flycoder                      # thinking on by default: best quality
ollama run flycoder --think=false        # immediate answer, for simple questions
ollama run flycoder:fast                 # 4B variant if you installed it
```

In a conversation, `/set nothink` turns thinking off and `/set parameter num_ctx 65536` enlarges the context (about 0.5 GB of extra memory for the main variant). Ollama recommends at least 64,000 tokens for coding agents; FlyCoder also works with `ollama launch` (Claude Code, Codex, OpenCode): `ollama launch claude --model flycoder` if you installed it with `install.sh`, or `ollama launch claude --model Tromset/flycoder` from ollama.com. `ollama launch` talks to Ollama directly; to go through FlyBrain, see the FlyBrain section.

From an application, the Ollama API is all you need:

```sh
curl http://localhost:11434/api/chat -d '{"model":"flycoder","messages":[{"role":"user","content":"Write a Python function that merges intervals."}]}'
```

## Publishing FlyCoder on ollama.com

Done once, from an Apple Silicon Mac:

1. Create an account on [ollama.com](https://ollama.com/signup). The username becomes part of the model name.
2. Link this Mac to the account: `ollama signin`.
3. Build both variants: `sh install.sh --all`.
4. Publish: `sh scripts/publish.sh <username>` (add `--gguf` to also publish the Intel Mac, Linux and Windows builds).
5. Paste the text of [docs/ollama-model-page.md](docs/ollama-model-page.md) into the model page description.

After that, anyone can run `ollama run <username>/flycoder` or `ollama run <username>/flycoder:fast`. The GGUF tags of 0.2 beta are published under `Tromset`; the MLX tags (`latest`, `fast`) still have to be pushed from an Apple Silicon Mac.

## Repository contents

- `Modelfile`, `Modelfile.fast`: definitions of the two variants (`ollama create flycoder -f Modelfile`).
- `Modelfile.lite`, `Modelfile.router`: FlyBrain's 2B expert and micro-model.
- `brain/`: the FlyBrain server (`flybrain.mjs`), its rules (`router.mjs`) and the router accuracy measurement (`eval-router.mjs`).
- `install.sh`: one-command install. `scripts/publish.sh`: publishing on ollama.com.
- `bench/`: quality and speed benchmark; `bench/baselines/` keeps the 0.1 profile for comparison.
- `tests/`: `npm test` checks the bench tests and the consistency of the Modelfiles and scripts.
- `training/`, `scripts/build_language_dataset.js`, `server/fly-language.js`: QLoRA pipeline for the former FlyBrain voice (Qwen 2.5 1.5B, MLX), independent of FlyCoder. That voice speaks French by design, so its prompts and dataset stay in French.

## Limitations of this beta

- The weights are not retrained: FlyCoder 0.2 is an Ollama profile (base, quantization, settings, context, system prompt). The quality gains come from the change of base and settings, not from fine-tuning.
- The LiveCodeBench and Codeforces figures are the ones published by Google and Qwen, not FlyCoder measurements. The bundled bench is small (20 problems): it separates profiles, it does not replace a public benchmark.
- Speed on a Mac has not been measured for this version: the MLX and multi-token gains quoted are those reported by Ollama. On CPU, the main variant is about 2.5 times slower per problem than 0.1; if the gap stays too large on your Mac, `ollama cp flycoder:0.2-beta-fast flycoder:latest` makes the fast variant the default model.
- Without thinking, all three profiles sometimes leave an abandoned first attempt in the returned code (3 answers out of 20 each): keep thinking on for code you ship.
- The bench ran without thinking. With thinking on (the `ollama run` default), quality goes up for both bases but answers are longer; measure it with `npm run bench -- --think on`.
- The MLX variants need an Apple Silicon Mac; elsewhere, use `--gguf`.
- FlyBrain lowers memory for simple requests, not for hard ones: the peak stays that of the large model. Switching experts takes a few seconds of reloading. Agents (which send tools) always go to the large model. The memory and router measurements come from a Linux server running GGUF, not yet from a Mac running MLX.

## License

Repository code: MIT, see [license.md](license.md). The weights keep the license of their base: Apache 2.0 for Gemma 4 and for Qwen3.5, shown by `ollama show flycoder --license`.
