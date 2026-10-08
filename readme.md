# FlyCoder 0.3

FlyCoder is a local coding model for [Ollama](https://ollama.com), tuned for MacBooks and Mac minis: complete, runnable code, a large context, answers in your language.

```sh
ollama run Tromset/flycoder0.3       # Macs with 16 GB
ollama run Tromset/flycoder0.3fast   # Macs with 8 GB
ollama run Tromset/flycoder0.3pro    # Macs with 32 GB or more
```

You need Ollama 0.30 or later (0.32.12 for `pro`). Full documentation: [Documentation.md](Documentation.md).

## The three models

| Model | Base | Weights | Mac | Context |
|---|---|---|---|---|
| [`Tromset/flycoder0.3`](https://ollama.com/Tromset/flycoder0.3) | Qwen3.5 9B | 6.6 GB | 16 GB | 65,536 tokens |
| [`Tromset/flycoder0.3fast`](https://ollama.com/Tromset/flycoder0.3fast) | Qwen3.5 4B | 3.3 GB | 8 GB | 32,768 tokens |
| [`Tromset/flycoder0.3pro`](https://ollama.com/Tromset/flycoder0.3pro) | Qwen3.8 27B | 18 GB | 32 GB or more | 65,536 tokens |

All three are portable GGUF builds: they run on Apple Silicon and Intel Macs, Linux and Windows, with tool calling, thinking and images. The bases are licensed under Apache 2.0.

What FlyCoder sets up on top of the base:

- **A large context**: 64K tokens instead of Ollama's 4,096 default on machines under 24 GB. Qwen's hybrid attention keeps it cheap: `flycoder0.3` uses 8.8 GB in total at 64K.
- **The right sampling**: Qwen's recommended settings for coding in thinking mode.
- **A short system prompt for code**: exact names and signatures, complete code without "TODO", edge cases, no invented APIs, a final check before answering, secure defaults, answers in the user's language.

## Install under a short name

```sh
curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh
ollama run flycoder
```

The installer picks the variant from your memory and names it `flycoder`. Options after `sh -s --`: `--fast`, `--pro`, `--all`, `--mlx` (Ollama's MLX engine on Apple Silicon), `--no-brain`.

## Measured quality and speed

The 0.3 reference run (`docs/bench/cpu-nothink-0.3.json`) is being recorded. The 0.2 run stays in [docs/bench/cpu-nothink.json](docs/bench/cpu-nothink.json).

## FlyBrain: less RAM for simple requests (optional)

FlyBrain is a small Node server in front of Ollama. It answers to `flycoder0.3` and `flycoder0.3fast`, sends simple questions to a smaller expert and hard requests (and every agent request with tools) to the strong one, and keeps a single expert in memory. On 60 labelled requests it routes 59 correctly, and no hard request goes to the small model.

```sh
node ~/.flycoder/brain/flybrain.mjs        # installed by install.sh; or: npm run brain
OLLAMA_HOST=127.0.0.1:11435 ollama run flycoder0.3
```

Details: [Documentation.md, section 5.5](Documentation.md#55-flybrain-the-router-that-lowers-ram-use).

## Publishing

Every change to `main` that touches a Modelfile or a page in `docs/ollama/` is published on ollama.com by the [publish-ollama](.github/workflows/publish-ollama.yml) workflow: models first, then their pages. It needs two repository secrets, `OLLAMA_KEY` and `OLLAMA_API_KEY` ([Documentation.md, section 8](Documentation.md#8-publishing-on-ollamacom)).

## Repository contents

- `Modelfile`, `Modelfile.fast`, `Modelfile.pro`: the three variants. `Modelfile.lite`, `Modelfile.router`: FlyBrain's experts.
- `docs/ollama/`: the ollama.com page of each model.
- `brain/`: the FlyBrain server and its routing rules.
- `install.sh`: one-command install. `scripts/publish.sh`, `scripts/update-ollama-pages.sh`: publishing.
- `bench/`: quality and speed benchmark. `tests/`: `npm test`.
- `training/`, `scripts/build_language_dataset.js`, `server/fly-language.js`: the former FlyBrain voice pipeline, independent of FlyCoder.

## License

Repository code: MIT, see [license.md](license.md). The weights keep the license of their base: Apache 2.0 for Qwen3.5 and Qwen3.8.
