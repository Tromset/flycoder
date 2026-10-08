# FlyCoder 0.3 documentation

FlyCoder is a local coding model that runs in [Ollama](https://ollama.com), tuned for MacBooks and Mac minis. This documentation covers installation, usage, settings, the benchmark, publishing and troubleshooting. For a quick overview, see the [README](readme.md).

## Contents

1. [What FlyCoder is](#1-what-flycoder-is)
2. [Requirements](#2-requirements)
3. [Installation](#3-installation)
4. [Choosing a variant](#4-choosing-a-variant)
5. [Usage](#5-usage)
6. [Settings](#6-settings)
7. [Benchmark](#7-benchmark)
8. [Publishing on ollama.com](#8-publishing-on-ollamacom)
9. [Troubleshooting](#9-troubleshooting)
10. [Development](#10-development)
11. [Known limitations](#11-known-limitations)
12. [Version history](#12-version-history)
13. [Licenses](#13-licenses)

## 1. What FlyCoder is

FlyCoder 0.3 is an **Ollama profile**: an open base model, the sampling settings its authors recommend for code, a large context window and a short system prompt dedicated to code. You use it like any Ollama model: in the terminal, through the API, or behind a coding agent.

It comes in three sizes, each published as its own model on ollama.com:

| Model | Base | Weights | Mac | Context |
|---|---|---|---|---|
| `Tromset/flycoder0.3` | Qwen3.5 9B | 6.6 GB | 16 GB | 65,536 tokens |
| `Tromset/flycoder0.3fast` | Qwen3.5 4B | 3.3 GB | 8 GB | 32,768 tokens |
| `Tromset/flycoder0.3pro` | Qwen3.8 27B | 18 GB | 32 GB or more | 65,536 tokens |

FlyCoder does not retrain the weights. The gains come from the choice of base and settings, and are measured by the repository's benchmark (section 7).

## 2. Requirements

| Item | Minimum | Note |
|---|---|---|
| Computer | Any Mac (Apple Silicon or Intel), Linux or Windows | The published models are GGUF: they run everywhere |
| Memory | 8 GB (`fast`), 16 GB (`flycoder0.3`), 32 GB (`pro`) | The installer picks for you |
| Ollama | 0.30 (`flycoder0.3`, `fast`), 0.32.12 (`pro`) | `ollama --version`; update from https://ollama.com/download |
| Node.js | 22 | Only for FlyBrain, the benchmark and the tests |
| Python 3 | The one shipped with macOS | Only for the benchmark |

## 3. Installation

### 3.1 From ollama.com

One command is enough:

```sh
ollama run Tromset/flycoder0.3       # Macs with 16 GB
ollama run Tromset/flycoder0.3fast   # Macs with 8 GB
ollama run Tromset/flycoder0.3pro    # Macs with 32 GB or more
```

To call it simply `flycoder`: `ollama cp Tromset/flycoder0.3 flycoder`.

### 3.2 One-command installer

```sh
curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh
ollama run flycoder
```

The installer:

1. checks that Ollama is installed, running and recent enough for the chosen variant;
2. detects the system and the memory;
3. picks `flycoder0.3pro` from 30 GB of memory up, `flycoder0.3` from 15 GB, otherwise `flycoder0.3fast`;
4. downloads the base model, creates the variant and copies it to the short name `flycoder`;
5. installs FlyBrain's experts and server (section 5.5), except with `pro`.

Options, placed after `sh -s --` when the script is read from `curl`:

| Option | Effect |
|---|---|
| `--fast` | installs `flycoder0.3fast` |
| `--pro` | installs `flycoder0.3pro` |
| `--all` | installs all three; `flycoder` points to `flycoder0.3` |
| `--mlx` | uses Ollama's MLX engine on Apple Silicon (faster, needs Ollama 0.31) instead of the portable GGUF weights |
| `--no-brain` | skips the FlyBrain experts (`flycoder0.3:router`, `flycoder0.3:lite`) |

From a copy of the repository, `sh install.sh` uses the local Modelfiles. The `FLYCODER_REF` variable picks another GitHub branch or tag to download them from.

### 3.3 By hand

```sh
git clone https://github.com/Tromset/flycoder.git && cd flycoder
ollama create flycoder0.3 -f Modelfile
ollama create flycoder0.3fast -f Modelfile.fast
ollama create flycoder0.3pro -f Modelfile.pro
```

### 3.4 Checking the installation

```sh
ollama list                             # flycoder0.3, flycoder...
ollama show flycoder0.3                 # base, quantization, capabilities
ollama show flycoder0.3 --parameters    # applied settings
ollama run flycoder0.3 "Write a Python function that reverses a string."
ollama ps                               # memory used, GPU share, allocated context
```

On a Mac, the PROCESSOR column of `ollama ps` should show `100% GPU`. A CPU/GPU split means memory is short (section 9).

### 3.5 Uninstalling

```sh
ollama rm flycoder flycoder0.3 flycoder0.3fast flycoder0.3pro flycoder0.3:lite flycoder0.3:router
ollama rm qwen3.5:9b qwen3.5:4b qwen3.5:2b qwen3.5:0.8b qwen3.8:27b   # bases, if no other model uses them
```

## 4. Choosing a variant

Take the largest variant your memory allows:

- **`flycoder0.3`** (Qwen3.5 9B, 16 GB Macs): the default. With its 64K context it uses about 9 GB in memory (measured: 8.8 GB).
- **`flycoder0.3fast`** (Qwen3.5 4B, 8 GB Macs): about twice as fast per token, a lower pass rate on hard problems.
- **`flycoder0.3pro`** (Qwen3.8 27B, 32 GB Macs or more): the latest Qwen generation, for hard bugs, algorithms and coding agents.

All three bases support tool calling, thinking and images.

## 5. Usage

### 5.1 In the terminal

```sh
ollama run flycoder0.3
```

Type your request, then press Enter. For multi-line text, wrap it in `"""`. Useful commands in a conversation:

| Command | Effect |
|---|---|
| `/set nothink` / `/set think` | turns thinking off or back on |
| `/set parameter num_ctx 131072` | enlarges the context for the session |
| `/set system "…"` | replaces the system prompt for the session |
| `/show parameters` | shows the current settings |
| `/clear` | clears the conversation |
| `/bye` | quits |

Launch options: `--think=false` (immediate answer), `--hidethinking` (hides the thinking but keeps it), `--verbose` (shows the tokens-per-second rate after each answer).

Giving the model a file:

```sh
ollama run flycoder0.3 "Find the bugs in this file and suggest a fix: $(cat src/parser.py)"
```

Giving it an image (screenshot, diagram): write its path in the request, for example `ollama run flycoder0.3 "Write the HTML for this mockup: ./mockup.png"`.

### 5.2 Ollama REST API

```sh
curl http://localhost:11434/api/chat -d '{
  "model": "Tromset/flycoder0.3",
  "messages": [{"role": "user", "content": "Write a JavaScript function debounce(fn, ms)."}],
  "think": false,
  "stream": false
}'
```

- `"think": true` or `false` turns thinking on or off; the thinking comes back separately in `message.thinking`.
- `"stream": true` (the default) sends the answer as it is generated, as JSON lines.
- `"options": {"num_ctx": 131072}` changes a setting for one request.
- A `{"role": "system", ...}` message replaces FlyCoder's system prompt for that conversation.

### 5.3 OpenAI-compatible API

Ollama also exposes `http://localhost:11434/v1`. Example in Python with the `openai` package:

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
reply = client.chat.completions.create(
    model="Tromset/flycoder0.3",
    messages=[{"role": "user", "content": "Write a pytest test for a slugify function."}],
)
print(reply.choices[0].message.content)
```

### 5.4 Coding agents and editors

`ollama launch` sets up and opens an agent with FlyCoder:

```sh
ollama launch claude --model Tromset/flycoder0.3      # Claude Code
ollama launch codex --model Tromset/flycoder0.3       # Codex
ollama launch opencode --model Tromset/flycoder0.3    # OpenCode
```

`ollama launch --help` lists the other integrations. Ollama recommends at least 64,000 tokens of context for agents: `flycoder0.3` and `flycoder0.3pro` have 65,536 out of the box. For agents, `flycoder0.3pro` gives the best results if your Mac can hold it.

### 5.5 FlyBrain: the router that lowers RAM use

FlyBrain is a small, dependency-free Node 22 server that sits in front of Ollama on port 11435. It answers to the names `flycoder0.3` (and `flycoder`) and `flycoder0.3fast`, picks an expert for each request and keeps only one expert in memory. Other models, `flycoder0.3pro` included, and other routes pass through unchanged.

| You call | Simple request | Hard request, tools (agents) or long context | Unclear request |
|---|---|---|---|
| `flycoder0.3` | `flycoder0.3fast` (4B), with thinking | `flycoder0.3` (9B), with thinking | the `flycoder0.3:router` micro-model (Qwen3.5 0.8B) decides |
| `flycoder0.3fast` | `flycoder0.3:lite` (Qwen3.5 2B) | `flycoder0.3fast` (4B) | the 4B (no micro-model) |

```sh
node ~/.flycoder/brain/flybrain.mjs          # copied by install.sh; or npm run brain in this repository
node brain/flybrain.mjs --prefix Tromset/   # with the models pulled from ollama.com
```

With `--prefix Tromset/`, first pull the experts: `ollama pull Tromset/flycoder0.3:router`, `Tromset/flycoder0.3:lite`, `Tromset/flycoder0.3fast` and `Tromset/flycoder0.3`.

Options: `--port` (11435), `--ollama` (http://127.0.0.1:11434), `--prefix`, `--max-expert auto|full|fast`. With `auto`, the default, a machine with less than 16 GB caps `flycoder0.3` at the 4B.

How a request is routed:

1. **Rules** (free): a request is hard if it carries tools (agents), more than 6,000 characters, several code blocks, a bulleted specification, or a word such as debug, algorithm, optimize, security, error. It is simple if it is a short question without code ("what is", "how do I", "explain"…). The rules recognize these cues in both English and French.
2. **The micro-model** for the rest. It answers `{"level":"simple"}` or `{"level":"hard"}` in an enforced JSON format. If it fails, takes longer than 8 s or answers anything else, the request goes to the large model. It is not called when the large model is already loaded.
3. **Conversation memory**: a conversation keeps its expert and can only move up to the stronger one.
4. **A single expert**: before loading another expert, FlyBrain waits for the running answers to finish, then unloads the old one. It also unloads the micro-model before the large model.

On 60 labelled requests (the 20 bench problems plus [tests/fixtures/route-prompts.json](tests/fixtures/route-prompts.json)), the rules and the micro-model route 59 correctly; no hard request goes to the small model. Measure it on your own requests with `node brain/eval-router.mjs`.

Connecting tools:

```sh
OLLAMA_HOST=127.0.0.1:11435 ollama run flycoder0.3
ANTHROPIC_BASE_URL=http://127.0.0.1:11435 ANTHROPIC_AUTH_TOKEN=ollama ANTHROPIC_API_KEY="" claude --model flycoder0.3
curl http://127.0.0.1:11435/v1/chat/completions -d '{"model":"flycoder0.3","messages":[{"role":"user","content":"Hello"}]}'
```

Each response carries the `x-flybrain-expert` and `x-flybrain-reason` headers, and FlyBrain's terminal prints one line per decision.

## 6. Settings

### 6.1 What the Modelfiles set

| Parameter | `flycoder0.3` | `fast` | `pro` | Why |
|---|---|---|---|---|
| `num_ctx` | 65,536 | 32,768 | 65,536 | Otherwise Ollama limits machines under 24 GB of memory to 4,096 tokens |
| `temperature` | 0.6 | 0.6 | 0.6 | Qwen's settings for coding in thinking mode |
| `top_k`, `top_p`, `min_p` | 20, 0.95, 0 | same | same | Same |
| `presence_penalty`, `repeat_penalty` | 0, 1 | same | same | Same |

Avoid lowering the temperature: Qwen advises against it, and FlyCoder 0.1 (temperature 0.2) produced looping answers.

### 6.2 Enlarging the context

The bases support up to 262,144 tokens. For one session: `/set parameter num_ctx 131072`. For a permanent model, create a variant:

```sh
printf 'FROM Tromset/flycoder0.3\nPARAMETER num_ctx 131072\n' > Modelfile.128k
ollama create flycoder0.3:128k -f Modelfile.128k
```

Qwen3.5 and Qwen3.8 use a hybrid attention where most layers keep no growing cache, so a large context costs little memory: `flycoder0.3` uses 8.8 GB in total at 65,536 tokens (measured with `ollama ps`). Check with `ollama ps` that the model stays at `100% GPU` after a change.

### 6.3 Thinking

Thinking is on by default: the model reasons before answering, which clearly improves code on hard problems but lengthens the wait. Turn it off for simple questions (`--think=false`, `/set nothink`, or `"think": false` in the API).

### 6.4 System prompt

FlyCoder's system prompt (`ollama show flycoder0.3 --system`) asks the model to:

- keep the requested names, signatures and files exactly;
- deliver complete, runnable code, without "TODO";
- handle edge cases;
- prefer the standard library and never invent APIs;
- choose a suitable algorithm;
- check its code once more before answering, and give a single final version;
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

## 7. Benchmark

The `bench/` folder measures the pass rate and speed of any Ollama model on 20 coding problems:

- 13 in Python and 7 in JavaScript;
- each with hidden tests that the model never sees;
- each test is proven by a reference solution and rejects an empty solution (`npm test`).

```sh
npm run bench -- --models flycoder0.3,flycoder0.3fast
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

The bench runs the code written by the models on your machine, in a temporary folder, with a time limit. On macOS, `sandbox-exec` blocks network access and writes outside that folder.

The 0.3 reference run (`docs/bench/cpu-nothink-0.3.json`) is being recorded. The 0.2 run stays in [docs/bench/cpu-nothink.json](docs/bench/cpu-nothink.json).

## 8. Publishing on ollama.com

Publishing is automatic. On every change to `main` that touches a Modelfile, a page in `docs/ollama/` or the publishing scripts, the [publish-ollama](.github/workflows/publish-ollama.yml) workflow:

1. rebuilds the changed models from their Modelfiles and pushes them as `Tromset/flycoder0.3`, `Tromset/flycoder0.3fast`, `Tromset/flycoder0.3pro`, `Tromset/flycoder0.3:lite` and `Tromset/flycoder0.3:router`;
2. updates each model page on ollama.com from `docs/ollama/<model>.md`.

It can also be started by hand from the Actions tab (Run workflow), with a list of models or `none` to update only the pages.

One-time setup, in the repository's Settings > Secrets and variables > Actions:

| Secret | Value |
|---|---|
| `OLLAMA_KEY` | the private key `~/.ollama/id_ed25519` of a machine linked to the Tromset account (`ollama signin` on that machine first) |
| `OLLAMA_API_KEY` | an API key created at https://ollama.com/settings/keys, used to update the pages |

Updating a page uses the same request as the page's Edit button; Ollama does not document it. If it is refused, the workflow shows a warning and the page can still be pasted by hand.

By hand, from any machine signed in to the account: `sh scripts/publish.sh` (all models) or `sh scripts/publish.sh Tromset flycoder0.3fast` (one model), then `OLLAMA_API_KEY=... sh scripts/update-ollama-pages.sh`.

For a new version, update the version in `package.json`, `install.sh`, `scripts/publish.sh`, the system prompt of the Modelfiles and the pages. `npm test` checks that they agree.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `pull model manifest: file does not exist` | wrong name | the names are `Tromset/flycoder0.3`, `Tromset/flycoder0.3fast` and `Tromset/flycoder0.3pro` |
| `requires a newer version of Ollama` or `unknown model architecture` | Ollama too old | update from https://ollama.com/download (0.30 or later; 0.32.12 for `pro`) |
| The installer says "Ollama is not responding" | the app is closed | open Ollama, or run `ollama serve` |
| Very slow answers, `ollama ps` shows a CPU share | not enough memory, the model spills out of the GPU | close applications, lower `num_ctx`, or switch to `flycoder0.3fast` |
| The model stops or crashes while loading | memory full | same; only one large model loaded at a time |
| The model forgets the start of a long file | context too small | enlarge `num_ctx` (section 6.2) |
| Thinking takes too long | simple question handled in thinking mode | `--think=false` or `/set nothink` |
| Endless repetition | temperature changed to a value that is too low | go back to the Modelfile's settings |
| `npm run bench`: "Reference solution failed" | `python3` or `node` missing, or sandbox refused | `xcode-select --install`, Node 22, or `--no-sandbox` |
| The publish workflow fails at "Check the secrets" | `OLLAMA_KEY` is missing | add it (section 8) |

## 10. Development

### 10.1 Repository layout

| Path | Role |
|---|---|
| `Modelfile`, `Modelfile.fast`, `Modelfile.pro` | the three variants |
| `Modelfile.lite`, `Modelfile.router` | FlyBrain's 2B expert and micro-model |
| `brain/flybrain.mjs`, `brain/router.mjs` | FlyBrain server and routing rules |
| `brain/eval-router.mjs`, `tests/fixtures/route-prompts.json` | router accuracy measurement |
| `install.sh` | one-command installer |
| `scripts/publish.sh`, `scripts/update-ollama-pages.sh` | publishing models and pages on ollama.com |
| `docs/ollama/` | the ollama.com pages, one file per model |
| `bench/bench.mjs`, `bench/problems.mjs` | benchmark and problems |
| `bench/baselines/` | 0.1 profile, for comparison |
| `docs/bench/` | reference results |
| `tests/` | tests for the bench, the Modelfiles, the scripts, the pages and FlyBrain |
| `.github/workflows/test.yml`, `.github/workflows/publish-ollama.yml` | CI on Linux and macOS, automatic publishing |
| `training/`, `scripts/build_language_dataset.js`, `server/fly-language.js` | former FlyBrain voice pipeline, independent of FlyCoder; the voice speaks French by design |

### 10.2 Tests

```sh
npm test
```

The tests check:

- that each reference solution passes its hidden tests, and that an empty solution fails;
- code extraction from answers and the statistics;
- that the Modelfiles start from the right bases, with the expected settings and an identical system prompt apart from the base name;
- that the installer, the publishing script and the workflow agree with the Modelfiles and the version;
- that each ollama.com page shows the right name, size, memory and context;
- FlyBrain's rules, the fallback to the large model when the micro-model fails, conversation memory, the scheduler, and the server against a fake Ollama.

CI runs them on Linux and on macOS, where the reference solutions run inside the sandbox.

### 10.3 Changing the system prompt

Edit the `SYSTEM` block of the Modelfiles identically (only the sentence naming the base differs), run `npm test`, rebuild with `ollama create`, then compare before and after with `npm run bench`. Once merged into `main`, the new prompt is published automatically.

### 10.4 Adding a problem to the bench

Add an object to `bench/problems.mjs` with `id` (`py-` or `js-` prefix), `language` (`python` or `javascript`), `entry` (expected function or class), `prompt` (the only text sent to the model), `reference` (correct solution) and `test` (assertions). `npm test` rejects the problem if the reference fails or if an empty solution passes.

## 11. Known limitations

- The weights are not retrained: FlyCoder is a profile of existing models.
- The bench has 20 problems and one attempt per problem: it separates profiles without replacing a public benchmark.
- The reference measurements come from a Linux server without a GPU; speed on a Mac has not been measured for this version.
- `flycoder0.3pro` was not run by the bench: its 27B base needs more memory than the test server has.
- FlyBrain does not lower the memory peak of hard requests, and switching experts costs a few seconds.

## 12. Version history

| Version | Contents |
|---|---|
| 0.1 beta | Full workshop: Qwen3.5 4B, trainable FlyBrain controller, CLI, web and Electron interfaces, architect, coder and reviewer agents. |
| 0.2 beta | FlyCoder becomes an Ollama model only: Gemma 4 12B variant (MLX, multi-token) and a fixed Qwen3.5 4B variant, one-command install, hidden-test benchmark. Then the optional FlyBrain router. |
| 0.3 | Three models under clear names (`Tromset/flycoder0.3`, `fast`, `pro`), all portable GGUF that run on any recent Ollama; Qwen3.5 9B replaces Gemma 4 12B, which did not run on every 16 GB Mac; Qwen3.8 27B for `pro`; 64K context; automatic publishing from GitHub; short ollama.com pages. |

## 13. Licenses

- Repository code: MIT, see [license.md](license.md).
- Weights: Apache 2.0 for Qwen3.5 and Qwen3.8. Each base's terms are shown by `ollama show flycoder0.3 --license`.
