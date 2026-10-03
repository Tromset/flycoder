# FlyCoder 0.3 beta documentation

FlyCoder is a local coding model that runs in [Ollama](https://ollama.com), tuned for Apple Silicon MacBooks and Mac minis. This documentation covers installation, usage, settings, the benchmark, publishing and troubleshooting. For a quick overview, see the [README](readme.md).

## Contents

1. [What FlyCoder is](#1-what-flycoder-is)
2. [Requirements](#2-requirements)
3. [Installation](#3-installation)
4. [Choosing a variant](#4-choosing-a-variant)
5. [Usage](#5-usage)
6. [Settings](#6-settings)
7. [Benchmark](#7-benchmark)
8. [Publishing a version on ollama.com](#8-publishing-a-version-on-ollamacom)
9. [Troubleshooting](#9-troubleshooting)
10. [Development](#10-development)
11. [Known limitations](#11-known-limitations)
12. [Version history](#12-version-history)
13. [Licenses](#13-licenses)

## 1. What FlyCoder is

FlyCoder 0.2 beta is an **Ollama profile**: an open base model, a quantization suited to Macs, the official sampling settings, an explicit context window and a system prompt dedicated to code. You use it like any Ollama model: in the terminal, through the API, or behind a coding agent.

FlyCoder does not retrain the weights. The gains over 0.1 come from the choice of base and settings, and are measured by the repository's benchmark (section 7).

Since 0.2, FlyCoder no longer includes a workshop (CLI, web interface, Electron app, FlyBrain controller): only the model ships.

## 2. Requirements

| Item | Minimum | Note |
|---|---|---|
| Mac | Apple Silicon (M1 or later) | Intel Macs, Linux and Windows: GGUF variants |
| Memory | 8 GB for `fast`, 16 GB for the main variant | The installer picks for you |
| Ollama | 0.31 or later | Main variant on MLX; `fast` on MLX needs 0.19 |
| Disk | 4.0 GB (`fast`) or 7.7 GB (main) | Shared with the base models, no duplicate copy |
| Node.js | 22 | Only for the benchmark and the tests |
| Python 3 | The one shipped with macOS | Only for the benchmark |

Check the Ollama version:

```sh
ollama --version
```

## 3. Installation

### 3.1 From ollama.com

FlyCoder is published at [ollama.com/delairvictor9/flycoder](https://ollama.com/delairvictor9/flycoder). One command is enough:

```sh
ollama run delairvictor9/flycoder                       # main variant (Gemma 4 12B, MLX)
ollama run delairvictor9/flycoder:fast                  # fast variant (Qwen3.5 4B, MLX)
ollama run delairvictor9/flycoder:0.2-beta-gguf         # main, Intel Mac, Linux, Windows
ollama run delairvictor9/flycoder:0.2-beta-fast-gguf    # fast, Intel Mac, Linux, Windows
```

Available tags: `latest` and `0.2-beta` (main), `fast` and `0.2-beta-fast` (fast), `0.2-beta-gguf` and `0.2-beta-fast-gguf` (portable). To call it simply `flycoder`: `ollama cp delairvictor9/flycoder flycoder`.

### 3.2 One-command installer

```sh
curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh
ollama run flycoder
```

The installer:

1. checks that Ollama is installed, running and at version 0.31 or later;
2. detects the system and the memory;
3. picks `flycoder:0.2-beta` from 15 GB of memory up, otherwise `flycoder:0.2-beta-fast`;
4. downloads the base model, creates the variant and copies it to `flycoder:latest`.

Options, placed after `sh -s --` when the script is read from `curl`:

| Option | Effect |
|---|---|
| `--fast` | installs only the fast variant |
| `--all` | installs both variants; `latest` points to the main one |
| `--gguf` | uses the portable GGUF weights (Intel Mac, Linux, Windows) instead of MLX |
| `--no-brain` | skips the FlyBrain experts (`flycoder:router`, `flycoder:0.2-beta-lite`) |

```sh
curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh -s -- --all
```

From a copy of the repository, `sh install.sh` uses the local Modelfiles. The `FLYCODER_REF` variable picks another GitHub branch or tag to download them from.

### 3.3 By hand

```sh
git clone https://github.com/Tromset/flycoder.git && cd flycoder
ollama create flycoder:0.2-beta -f Modelfile
ollama create flycoder:0.2-beta-fast -f Modelfile.fast
ollama cp flycoder:0.2-beta flycoder:latest
```

On a machine without Apple Silicon, first replace the `FROM` line: `gemma4:12b-mlx` with `gemma4:12b`, and `qwen3.5:4b-mlx` with `qwen3.5:4b`.

### 3.4 Checking the installation

```sh
ollama list                         # flycoder:latest, flycoder:0.2-beta...
ollama show flycoder                # base, quantization, capabilities
ollama show flycoder --parameters   # applied settings
ollama run flycoder "Write a Python function that reverses a string."
ollama ps                           # memory used, GPU share, allocated context
```

In `ollama ps`, the PROCESSOR column should show `100% GPU`. A CPU/GPU split means memory is short (section 9).

### 3.5 Uninstalling

```sh
ollama rm flycoder:latest flycoder:0.2-beta flycoder:0.2-beta-fast
ollama rm gemma4:12b-mlx qwen3.5:4b-mlx   # bases, if no other model uses them
```

## 4. Choosing a variant

| Tag | Base | Weights | Context | For |
|---|---|---|---|---|
| `flycoder:0.2-beta`, `latest` | Gemma 4 12B (Google DeepMind), NVFP4 on MLX | 7.7 GB | 32,768 | Macs with 16 GB or more, maximum quality |
| `flycoder:0.2-beta-fast`, `fast` | Qwen3.5 4B (Alibaba Qwen), NVFP4 on MLX | 4.0 GB | 16,384 | 8 GB Macs, 0.1's speed |
| `flycoder:0.2-beta-gguf` | Gemma 4 12B, GGUF Q4_K_M | 8.0 GB | 32,768 | Intel Mac, Linux, Windows |
| `flycoder:0.2-beta-fast-gguf` | Qwen3.5 4B, GGUF Q4_K_M | 3.4 GB | 16,384 | Intel Mac, Linux, Windows |

Both bases support tool calling, thinking and images.

Rule of thumb: take the main variant if your Mac has 16 GB or more and code quality matters more than latency; take `fast` on 8 GB or if you want exactly 0.1's responsiveness. To change the default model:

```sh
ollama cp flycoder:0.2-beta-fast flycoder:latest   # the fast variant becomes "flycoder"
ollama cp flycoder:0.2-beta flycoder:latest        # back to the main variant
```

## 5. Usage

### 5.1 In the terminal

```sh
ollama run flycoder
```

Type your request, then press Enter. For multi-line text, wrap it in `"""`. Useful commands in a conversation:

| Command | Effect |
|---|---|
| `/set nothink` / `/set think` | turns thinking off or back on |
| `/set parameter num_ctx 65536` | enlarges the context for the session |
| `/set system "…"` | replaces the system prompt for the session |
| `/show parameters` | shows the current settings |
| `/clear` | clears the conversation |
| `/bye` | quits |

Launch options: `--think=false` (immediate answer), `--hidethinking` (hides the thinking but keeps it), `--verbose` (shows the tokens-per-second rate after each answer).

Giving the model a file:

```sh
ollama run flycoder "Find the bugs in this file and suggest a fix: $(cat src/parser.py)"
```

Giving it an image (screenshot, diagram): write its path in the request, for example `ollama run flycoder "Write the HTML for this mockup: ./mockup.png"`.

### 5.2 Ollama REST API

```sh
curl http://localhost:11434/api/chat -d '{
  "model": "flycoder",
  "messages": [{"role": "user", "content": "Write a JavaScript function debounce(fn, ms)."}],
  "think": false,
  "stream": false
}'
```

- `"think": true` or `false` turns thinking on or off; the thinking comes back separately in `message.thinking`.
- `"stream": true` (the default) sends the answer as it is generated, as JSON lines.
- `"options": {"num_ctx": 65536}` changes a setting for one request.
- A `{"role": "system", ...}` message replaces FlyCoder's system prompt for that conversation.

### 5.3 OpenAI-compatible API

Ollama also exposes `http://localhost:11434/v1`. Example in Python with the `openai` package:

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
reply = client.chat.completions.create(
    model="flycoder",
    messages=[{"role": "user", "content": "Write a pytest test for a slugify function."}],
)
print(reply.choices[0].message.content)
```

### 5.4 Coding agents and editors

`ollama launch` sets up and opens an agent with FlyCoder:

```sh
ollama launch claude --model flycoder     # Claude Code
ollama launch codex --model flycoder      # Codex
ollama launch opencode --model flycoder   # OpenCode
```

If you got FlyCoder from ollama.com without `install.sh`, use the published name: `ollama launch claude --model delairvictor9/flycoder`.

`ollama launch --help` lists the other integrations, including VS Code, Copilot CLI, Cline, Qwen Code, Pi and Droid. Agents send long instructions and many files: Ollama recommends at least 64,000 tokens of context for them (section 6.2).

### 5.5 FlyBrain: the router that lowers RAM use

FlyBrain is a small, dependency-free Node 22 server that sits in front of Ollama on port 11435. It answers to the names `flycoder` and `flycoder:fast`, picks an expert for each request and keeps only one expert in memory. Other models and other routes pass through unchanged.

```sh
node ~/.flycoder/brain/flybrain.mjs          # copied by install.sh; or npm run brain in this repository
node brain/flybrain.mjs --prefix delairvictor9/   # with the models published on ollama.com
```

Options: `--port` (11435), `--ollama` (http://127.0.0.1:11434), `--prefix`, `--max-expert auto|full|fast`. With `auto`, the default, a Mac with less than 16 GB caps `flycoder` at the 4B.

How a request is routed:

1. **Rules** (free): a request is hard if it carries tools (agents), more than 6,000 characters, several code blocks, a bulleted specification, or a word such as debug, algorithm, optimize, security, error. It is simple if it is a short question without code ("what is", "how do I", "explain"…). The rules recognize these cues in both English and French.
2. **The `flycoder:router` micro-model** (Qwen3.5 0.8B, 1 GB) for the rest. It answers `{"level":"simple"}` or `{"level":"hard"}` in an enforced JSON format. If it fails, takes longer than 8 s or answers anything else, the request goes to the large model. It is not called when the large model is already loaded. `flycoder:fast` has no micro-model: an unclear request keeps the 4B.
3. **Conversation memory**: a conversation keeps its expert and can only move up to the stronger one.
4. **A single expert**: before loading another expert, FlyBrain waits for the running answers to finish, then unloads the old one. It also unloads the micro-model before the large model.

The normal variant forces thinking (`think: true`) unless the client turns it off. Each response carries the `x-flybrain-expert` and `x-flybrain-reason` headers, and FlyBrain's terminal prints one line per decision.

Connecting tools:

```sh
OLLAMA_HOST=127.0.0.1:11435 ollama run flycoder
ANTHROPIC_BASE_URL=http://127.0.0.1:11435 ANTHROPIC_AUTH_TOKEN=ollama ANTHROPIC_API_KEY="" claude --model flycoder
curl http://127.0.0.1:11435/v1/chat/completions -d '{"model":"flycoder","messages":[{"role":"user","content":"Hello"}]}'
```

To measure the router's accuracy on your own requests: add them to `tests/fixtures/route-prompts.json`, then run `node brain/eval-router.mjs`. The memory and accuracy measurements are in the [README](readme.md#flybrain-less-ram-same-quality-on-hard-requests).

## 6. Settings

### 6.1 What the Modelfiles set

| Parameter | Main | `fast` | Why |
|---|---|---|---|
| `num_ctx` | 32,768 | 16,384 | Otherwise Ollama limits machines under 24 GB of memory to 4,096 tokens |
| `temperature` | 1 | 0.6 | Official values from Google and Qwen for coding |
| `top_k` | 64 | 20 | Same |
| `top_p` | 0.95 | 0.95 | Same |
| `min_p`, `presence_penalty`, `repeat_penalty` | inherited | 0, 0, 1 | Qwen's "coding in thinking mode" settings |

The main variant also inherits Gemma 4's multi-token prediction draft model, enabled by Ollama. Avoid lowering the temperature: Qwen and Google recommend it as is, and 0.1 (temperature 0.2) produced looping answers.

### 6.2 Enlarging the context

For one session: `/set parameter num_ctx 65536`. For a permanent model, create a variant:

```sh
printf 'FROM flycoder:0.2-beta\nPARAMETER num_ctx 65536\n' > Modelfile.64k
ollama create flycoder:64k -f Modelfile.64k
ollama launch claude --model flycoder:64k
```

Memory cost of the cache, on top of the weights: about 0.5 GB per 32,768 tokens for the main variant, and about 0.5 GB per 16,384 tokens for `fast`. On a 16 GB Mac, 65,536 tokens should fit with the main variant if few other applications are running (not measured): check with `ollama ps` that the model stays at `100% GPU`.

### 6.3 Thinking

Thinking is on by default: the model reasons before answering, which clearly improves code on hard problems but lengthens the wait. Turn it off for simple questions (`--think=false`, `/set nothink`, or `"think": false` in the API). Without thinking, the benchmark showed that models sometimes leave an abandoned first attempt in the returned code; keep it on for code you ship.

### 6.4 System prompt

FlyCoder's system prompt (`ollama show flycoder --system`) asks the model to:

- keep the requested names, signatures and files exactly;
- deliver complete, runnable code, without "TODO";
- handle edge cases;
- prefer the standard library and never invent APIs;
- choose a suitable algorithm;
- show only the changed parts of an existing file;
- never claim to have run tests;
- avoid common vulnerabilities;
- answer in the user's language.

Replace it for a session with `/set system`, or with a `system` message in the API.

### 6.5 Ollama server settings

These variables apply to every model. On a Mac running the Ollama app, set them with `launchctl setenv`, then restart Ollama:

```sh
launchctl setenv OLLAMA_KV_CACHE_TYPE q8_0      # context cache half the size, small loss of precision
launchctl setenv OLLAMA_KEEP_ALIVE 30m          # keeps the model loaded for 30 minutes
```

`OLLAMA_KV_CACHE_TYPE=q8_0` halves the context cache memory of GGUF models (`-gguf` tags); Ollama's documentation does not say how it affects the MLX engine. `OLLAMA_KEEP_ALIVE` avoids reloading the model between two widely spaced questions.

## 7. Benchmark

The `bench/` folder measures the pass rate and speed of any Ollama model on 20 coding problems:

- 13 in Python and 7 in JavaScript;
- each with hidden tests that the model never sees;
- each test is proven by a reference solution and rejects an empty solution (`npm test`).

```sh
ollama create flycoder0.1beta -f bench/baselines/flycoder-0.1-beta.Modelfile   # to compare with 0.1
npm run bench -- --models flycoder0.1beta,flycoder:0.2-beta,flycoder:0.2-beta-fast
```

| Option | Effect |
|---|---|
| `--models a,b` | models to compare, one after the other (memory is freed in between) |
| `--think on\|off\|default` | forces or disables thinking; `default` follows the model |
| `--samples 3` | several attempts per problem, to smooth out randomness |
| `--only py-lcs,js-evaluate` | subset of problems |
| `--max-tokens 8192` | token cap per answer; a truncated answer counts as a failure |
| `--num-ctx 8192` | smaller context for machines short on memory, with no effect on these short answers |
| `--out file.json` | report location; `bench/results/` by default |
| `--no-sandbox` | disables the macOS sandbox |

The bench prints a table (passes, generation rate, prompt processing speed, tokens per answer, seconds per problem) and records every answer, every test error and every counter in the JSON, updated after each problem.

It runs the code written by the models on your machine, in a temporary folder, with a time limit. On macOS, `sandbox-exec` blocks network access and writes outside that folder.

Reference results, recorded in [docs/bench/cpu-nothink.json](docs/bench/cpu-nothink.json) on a Linux server without a GPU, with GGUF weights, without thinking and one attempt per problem:

| Profile | Passed | Generation | Tokens per answer | Time per problem |
|---|---|---|---|---|
| `flycoder0.1beta` (0.1) | 5/20 | 6.6 tok/s | 581 | 94 s |
| `flycoder:0.2-beta-fast` | 5/20 | 6.5 tok/s | 537 | 89 s |
| `flycoder:0.2-beta` | 14/20 | 3.4 tok/s | 739 | 235 s |

On this server, the main variant solves almost three times as many problems, but takes about 2.5 times as long per problem. The fast variant keeps 0.1's speed and pass rate. No measurement has been made on a Mac yet, where the MLX engine and multi-token prediction should narrow the speed gap.

## 8. Publishing a version on ollama.com

0.2 beta is published under the `delairvictor9` account. To publish a new version, follow these steps. The script refuses to push non-MLX builds under the main tags: build them on an Apple Silicon Mac.

1. Create an account on [ollama.com](https://ollama.com/signup). The username becomes the model's prefix (`<username>/flycoder`).
2. Link the machine to the account: `ollama signin`, then confirm in the browser. Authorized machines are managed in the account settings, under Ollama keys; remove the ones you no longer use.
3. Build both variants: `sh install.sh --all`.
4. Publish: `sh scripts/publish.sh <username>`. Add `--gguf` to also publish the GGUF tags (`0.2-beta-gguf`, `0.2-beta-fast-gguf`, `0.2-beta-lite-gguf`, `router-gguf`).
5. On the `https://ollama.com/<username>/flycoder` page, paste the text of [docs/ollama-model-page.md](docs/ollama-model-page.md).

Published tags: `0.2-beta` and `latest` (main), `0.2-beta-fast` and `fast` (fast), `0.2-beta-lite` and `router` (FlyBrain experts), plus the GGUF tags with `--gguf`. Weights already on Ollama's registry are not uploaded again: for 0.2, whose bases come from the official library, publishing the six tags took only a few minutes.

For a new version, update the version in `package.json`, `install.sh`, `scripts/publish.sh` and the system prompt of the Modelfiles. `npm test` checks that they agree.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `this model requires MLX support` | machine without Apple Silicon, or Ollama too old | update Ollama; otherwise `sh install.sh --gguf` or the `-gguf` tags |
| `requires a newer version of Ollama` | Ollama older than 0.31 | update from https://ollama.com/download |
| The installer says "Ollama is not responding" | the app is closed | open Ollama, or run `ollama serve` |
| Very slow answers, `ollama ps` shows a CPU share | not enough memory, the model spills out of the GPU | close applications, lower `num_ctx`, or switch to `flycoder:fast` |
| The model stops or crashes while loading | memory full | same; only one large model loaded at a time |
| The model forgets the start of a long file | context too small | enlarge `num_ctx` (section 6.2) |
| Thinking takes too long | simple question handled in thinking mode | `--think=false` or `/set nothink` |
| Endless repetition | temperature changed to a value that is too low | go back to the Modelfile's settings |
| `npm run bench`: "Reference solution failed" | `python3` or `node` missing, or sandbox refused | `xcode-select --install`, Node 22, or `--no-sandbox` |
| `publish.sh`: "is not the MLX build" | variants built as GGUF | rerun `sh install.sh --all` on an Apple Silicon Mac |

## 10. Development

### 10.1 Repository layout

| Path | Role |
|---|---|
| `Modelfile`, `Modelfile.fast` | definitions of the two variants |
| `Modelfile.lite`, `Modelfile.router` | FlyBrain's 2B expert and micro-model |
| `brain/flybrain.mjs`, `brain/router.mjs` | FlyBrain server and routing rules |
| `brain/eval-router.mjs`, `tests/fixtures/route-prompts.json` | router accuracy measurement |
| `install.sh` | one-command installer |
| `scripts/publish.sh` | publishing on ollama.com |
| `bench/bench.mjs`, `bench/problems.mjs` | benchmark and problems |
| `bench/baselines/` | 0.1 profile, for comparison |
| `docs/bench/` | reference results |
| `docs/ollama-model-page.md` | text of the ollama.com page |
| `tests/` | tests for the bench, the Modelfiles and the scripts |
| `.github/workflows/test.yml` | CI on Linux and macOS |
| `training/`, `scripts/build_language_dataset.js`, `server/fly-language.js` | former FlyBrain voice pipeline, independent of FlyCoder; the voice speaks French by design |

### 10.2 Tests

```sh
npm test
```

The tests check:

- that each reference solution passes its hidden tests, and that an empty solution fails;
- code extraction from answers and the statistics;
- reading streamed answers and the execution time limit;
- that the Modelfiles start from the right bases, with the expected settings and an identical system prompt apart from the base name;
- that the installer and the publishing script agree with the Modelfiles and the version;
- FlyBrain's rules (the 20 bench problems go to the large model), the fallback to the large model when the micro-model fails, conversation memory and the scheduler;
- the FlyBrain server against a fake Ollama: model rewriting on the native, OpenAI and Anthropic APIs, streaming passed through, a single expert loaded at a time.

CI runs them on Linux and on macOS, where the reference solutions run inside the sandbox.

### 10.3 Changing the system prompt

Edit the `SYSTEM` block of the Modelfiles identically (only the sentence naming the base differs), run `npm test`, rebuild with `ollama create`, then compare before and after with `npm run bench`.

### 10.4 Adding a problem to the bench

Add an object to `bench/problems.mjs` with:

- `id` (`py-` or `js-` prefix);
- `language` (`python` or `javascript`);
- `entry` (expected function or class);
- `prompt` (the only text sent to the model);
- `reference` (correct solution);
- `test` (assertions).

`npm test` rejects the problem if the reference fails or if an empty solution passes.

## 11. Known limitations

- The weights are not retrained: FlyCoder is a profile of existing models.
- The LiveCodeBench figures (72.0% for Gemma 4 12B, 55.8% for Qwen3.5 4B) are the ones published by Google and Qwen, not FlyCoder measurements.
- The bench has 20 problems and one attempt per problem: it separates profiles without replacing a public benchmark.
- Speed on a Mac has not been measured for this version. The MLX (about +20%) and multi-token (about +90% on Apple Silicon) gains are those reported by Ollama; on CPU, the measured multi-token gain is 49%.
- Thinking mode has not been measured by the bench.
- The MLX tags only work on Apple Silicon.
- FlyBrain does not lower the memory peak of hard requests, and switching experts costs a few seconds. Its measurements (memory, accuracy on 60 requests) come from a Linux server running GGUF, not from a Mac running MLX. The rules were adjusted once after a first measurement on these same requests: the score on new requests may be a little lower.

## 12. Version history

| Version | Contents |
|---|---|
| 0.1 beta | Full workshop: Qwen3.5 4B, trainable FlyBrain controller, CLI, web and Electron interfaces, architect, coder and reviewer agents. |
| 0.2 beta | FlyCoder becomes an Ollama model only: Gemma 4 12B variant (MLX, multi-token) and a fixed Qwen3.5 4B variant, one-command install, ollama.com publishing, hidden-test benchmark, workshop removed. |
| 0.3 beta | Optional FlyBrain router: rules and a Qwen3.5 0.8B micro-model, a 2B expert for `flycoder:fast`, a single expert in memory. Less RAM for simple requests. The 0.2 models are unchanged. |

## 13. Licenses

- Repository code: MIT, see [license.md](license.md).
- Weights: Apache 2.0 for Gemma 4 and for Qwen3.5. Each base's terms are shown by `ollama show flycoder --license`.
