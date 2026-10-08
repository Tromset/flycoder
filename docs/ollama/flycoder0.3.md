# FlyCoder 0.3

A local coding model for Macs with 16 GB of memory. Complete, runnable code, a large context, and it answers in your language.

```sh
ollama run Tromset/flycoder0.3
```

| Base | Size | Mac | Context |
|---|---|---|---|
| Qwen3.5 9B (Apache 2.0) | 6.6 GB | 16 GB | 64K tokens |

- **Code that runs**: exact names and signatures, every import, edge cases handled, no "TODO", no invented APIs.
- **Large context**: 64K tokens out of the box, enough for whole files and coding agents (`ollama launch claude --model Tromset/flycoder0.3`).
- **Thinks first**: reasoning is on by default; `/set nothink` for instant answers.

Other sizes: [`Tromset/flycoder0.3fast`](https://ollama.com/Tromset/flycoder0.3fast) for 8 GB Macs, [`Tromset/flycoder0.3pro`](https://ollama.com/Tromset/flycoder0.3pro) for 32 GB Macs or more.

Needs Ollama 0.30 or later. Runs on Apple Silicon, Intel Macs, Linux and Windows.
Source, benchmark and installer: https://github.com/Tromset/flycoder
