---
license: apache-2.0
base_model: Qwen/Qwen3.5-9B
base_model_relation: quantized
pipeline_tag: image-text-to-text
tags:
  - gguf
  - ollama
  - llama.cpp
  - code
  - flycoder
---

# FlyCoder 0.3

A local coding model for Macs with 16 GB of memory. Complete, runnable code, a large context, and it answers in your language.

```sh
ollama run hf.co/@HF_NAMESPACE@/flycoder0.3
```

| Base | Size | Mac | Context |
|---|---|---|---|
| [Qwen3.5 9B](https://huggingface.co/Qwen/Qwen3.5-9B) (Apache 2.0) | 6.6 GB | 16 GB | 64K tokens |

- **Code that runs**: exact names and signatures, every import, edge cases handled, no "TODO", no invented APIs.
- **Large context**: 64K tokens out of the box, enough for whole files and coding agents.
- **Thinks first**: reasoning is on by default; `/set nothink` in Ollama for instant answers.

## Files

- `flycoder0.3-Q4_K_M.gguf`: the weights, the same file as [`Tromset/flycoder0.3`](https://ollama.com/Tromset/flycoder0.3) on ollama.com.
- `mmproj-flycoder0.3.gguf`: the vision projector, for images.
- `system`, `params`: FlyCoder's system prompt and sampling settings, applied by Ollama.

With llama.cpp, pass the same settings and the contents of `system` as the system message:

```sh
llama-server -hf @HF_NAMESPACE@/flycoder0.3 --jinja -c 65536 --temp 0.6 --top-k 20 --top-p 0.95 --min-p 0
```

For tool calling and thinking in Ollama, `ollama run Tromset/flycoder0.3` uses Ollama's built-in Qwen renderer and is the reference build.

Other sizes: [`flycoder0.3fast`](https://huggingface.co/@HF_NAMESPACE@/flycoder0.3fast) for 8 GB Macs, [`flycoder0.3pro`](https://huggingface.co/@HF_NAMESPACE@/flycoder0.3pro) for 32 GB Macs or more.

Source, benchmark and installer: https://github.com/Tromset/flycoder
