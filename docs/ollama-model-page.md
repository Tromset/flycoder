# FlyCoder 0.2 beta

A local coding model tuned for MacBook and Mac mini (Apple Silicon), packaged for Ollama.

```sh
ollama run Tromset/flycoder         # Gemma 4 12B base, Macs with 16 GB or more
ollama run Tromset/flycoder:fast    # Qwen3.5 4B base, Macs with 8 GB
```

## Tags

| Tag | Base | Size | Context |
|---|---|---|---|
| `latest`, `0.2-beta` | Gemma 4 12B (Google DeepMind), NVFP4 on Ollama's MLX engine | 7.7 GB | 32,768 |
| `fast`, `0.2-beta-fast` | Qwen3.5 4B (Alibaba Qwen), NVFP4 on Ollama's MLX engine | 4.0 GB | 16,384 |
| `0.2-beta-lite` | Qwen3.5 2B, NVFP4 on MLX: FlyBrain's expert for simple requests in `flycoder:fast` | 2.5 GB | 8,192 |
| `router` | Qwen3.5 0.8B, NVFP4 on MLX: FlyBrain's micro-router, answers only `simple` or `hard` | 1.0 GB | 2,048 |
| `*-gguf` | Same bases as GGUF Q4_K_M, for Intel Macs, Linux and Windows | 8.0 / 3.4 / 2.7 / 1.0 GB | same |

MLX tags need Ollama 0.31 or later on Apple Silicon.

## What FlyCoder sets up

- A stronger base for the same hardware: Gemma 4 12B scores 72.0% on LiveCodeBench v6 (Google's published figure, thinking mode), against 55.8% for Qwen3.5 4B (Qwen's published figure).
- Multi-token prediction on Gemma 4: a small draft model proposes several tokens that the main model verifies in one pass, which Ollama reports as nearly 90% faster generation on Apple Silicon.
- The sampling settings recommended by each base model's authors for coding.
- A real context window: Ollama otherwise defaults to 4,096 tokens on machines with less than 24 GB.
- A short system prompt focused on complete, correct code: exact names and signatures, edge cases, no invented APIs, no claims of having run tests, secure defaults, answers in the user's language.

## Less memory with FlyBrain (optional)

FlyBrain is a small Node server from the GitHub repository that sits in front of Ollama. It answers to `flycoder` and `flycoder:fast`, sends simple questions to a smaller expert, sends hard requests (and every agent request with tools) to the strong one, and keeps a single expert in memory. Measured on a 16 GB Linux server (GGUF, CPU): a simple request to `flycoder` uses 6.1 GiB instead of 10.5. Hard requests still use the strong model, so their quality is unchanged.

```sh
node brain/flybrain.mjs --prefix Tromset/
OLLAMA_HOST=127.0.0.1:11435 ollama run flycoder
```

FlyCoder does not retrain weights. Weights keep their base license (Apache 2.0 for both bases).

Source, installer and benchmark: https://github.com/Tromset/flycoder
