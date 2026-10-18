---
license: apache-2.0
base_model: Qwen/Qwen3.5-4B
base_model_relation: quantized
pipeline_tag: image-text-to-text
tags:
  - gguf
  - ollama
  - llama.cpp
  - code
  - flycoder
---

# FlyCoder 0.3 fast

The fast FlyCoder, for Macs with 8 GB of memory or when speed matters most.

```sh
ollama run hf.co/@HF_NAMESPACE@/flycoder0.3fast
```

| Base | Size | Mac | Context |
|---|---|---|---|
| [Qwen3.5 4B](https://huggingface.co/Qwen/Qwen3.5-4B) (Apache 2.0) | 3.3 GB | 8 GB | 32K tokens |

- **Fast**: about twice the speed of `flycoder0.3`, with the same coding rules.
- **Code that runs**: exact names and signatures, every import, edge cases handled, no "TODO", no invented APIs.
- **Light**: fits next to your other apps on an 8 GB Mac.

## Files

- `flycoder0.3fast-Q4_K_M.gguf`: the weights, the same file as [`Tromset/flycoder0.3fast`](https://ollama.com/Tromset/flycoder0.3fast) on ollama.com.
- `mmproj-flycoder0.3fast.gguf`: the vision projector, for images.
- `system`, `params`: FlyCoder's system prompt and sampling settings, applied by Ollama.

With llama.cpp, pass the same settings and the contents of `system` as the system message:

```sh
llama-server -hf @HF_NAMESPACE@/flycoder0.3fast --jinja -c 32768 --temp 0.6 --top-k 20 --top-p 0.95 --min-p 0
```

For tool calling and thinking in Ollama, `ollama run Tromset/flycoder0.3fast` uses Ollama's built-in Qwen renderer and is the reference build.

Other sizes: [`flycoder0.3`](https://huggingface.co/@HF_NAMESPACE@/flycoder0.3) for 16 GB Macs, [`flycoder0.3pro`](https://huggingface.co/@HF_NAMESPACE@/flycoder0.3pro) for 32 GB Macs or more.

Source, benchmark and installer: https://github.com/Tromset/flycoder
