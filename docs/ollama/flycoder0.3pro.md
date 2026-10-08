# FlyCoder 0.3 pro

The strongest FlyCoder, for Macs with 32 GB of memory or more, and for coding agents.

```sh
ollama run Tromset/flycoder0.3pro
```

| Base | Size | Mac | Context |
|---|---|---|---|
| Qwen3.8 27B (Apache 2.0) | 18 GB | 32 GB | 64K tokens |

- **Best quality**: Qwen3.8, the latest Qwen generation, for hard bugs, algorithms and multi-file changes.
- **Built for agents**: tool calling and 64K tokens of context (`ollama launch claude --model Tromset/flycoder0.3pro`).
- **Code that runs**: exact names and signatures, every import, edge cases handled, no "TODO", no invented APIs.

Other sizes: [`Tromset/flycoder0.3`](https://ollama.com/Tromset/flycoder0.3) for 16 GB Macs, [`Tromset/flycoder0.3fast`](https://ollama.com/Tromset/flycoder0.3fast) for 8 GB Macs.

Needs Ollama 0.32.12 or later. Runs on Apple Silicon, Intel Macs, Linux and Windows.
Source, benchmark and installer: https://github.com/Tromset/flycoder
