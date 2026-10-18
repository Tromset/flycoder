---
license: apache-2.0
base_model: Qwen/Qwen3.8-27B
base_model_relation: quantized
pipeline_tag: image-text-to-text
tags:
  - gguf
  - ollama
  - llama.cpp
  - code
  - flycoder
---

# FlyCoder 0.3 pro

The strongest FlyCoder, for hard coding work and coding agents, on Macs with 32 GB of memory or more.

```sh
ollama run hf.co/@HF_NAMESPACE@/flycoder0.3pro
```

| Base | Size | Mac | Context |
|---|---|---|---|
| [Qwen3.8 27B](https://huggingface.co/Qwen/Qwen3.8-27B) (Apache 2.0) | 18 GB | 32 GB | 64K tokens |

- **Code that runs**: exact names and signatures, every import, edge cases handled, a final check before answering, no "TODO", no invented APIs.
- **Built for agents**: reads files before editing, makes minimal changes, reports real test output, never runs a destructive command without asking.
- **Fast for its size**: multi-token prediction is on in Ollama, and 64K tokens of context cost only about 4.4 GB thanks to Qwen3.8's hybrid attention.

## Files

- `flycoder0.3pro-Q4_K_M.gguf`: the weights, the same file as [`Tromset/flycoder0.3pro`](https://ollama.com/Tromset/flycoder0.3pro) on ollama.com.
- `mmproj-flycoder0.3pro.gguf`: the vision projector, for images.
- `system`, `params`: FlyCoder's system prompt and sampling settings, applied by Ollama.

With llama.cpp, pass the same settings and the contents of `system` as the system message:

```sh
llama-server -hf @HF_NAMESPACE@/flycoder0.3pro --jinja -c 65536 --temp 0.6 --top-k 20 --top-p 0.95 --min-p 0
```

For tool calling and thinking in Ollama, `ollama run Tromset/flycoder0.3pro` uses Ollama's built-in Qwen renderer and is the reference build.

Other sizes: [`flycoder0.3`](https://huggingface.co/@HF_NAMESPACE@/flycoder0.3) for 16 GB Macs, [`flycoder0.3fast`](https://huggingface.co/@HF_NAMESPACE@/flycoder0.3fast) for 8 GB Macs.

Source, benchmark and installer: https://github.com/Tromset/flycoder
