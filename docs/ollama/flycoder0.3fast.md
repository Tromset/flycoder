# FlyCoder 0.3 fast

The fast FlyCoder, for Macs with 8 GB of memory or when speed matters most.

```sh
ollama run Tromset/flycoder0.3fast
```

| Base | Size | Mac | Context |
|---|---|---|---|
| Qwen3.5 4B (Apache 2.0) | 3.3 GB | 8 GB | 32K tokens |

- **Fast**: about twice the speed of `Tromset/flycoder0.3`, with the same coding rules.
- **Code that runs**: exact names and signatures, every import, edge cases handled, no "TODO", no invented APIs.
- **Light**: fits next to your other apps on an 8 GB Mac.

Other sizes: [`Tromset/flycoder0.3`](https://ollama.com/Tromset/flycoder0.3) for 16 GB Macs, [`Tromset/flycoder0.3pro`](https://ollama.com/Tromset/flycoder0.3pro) for 32 GB Macs or more.

Needs Ollama 0.30 or later. Runs on Apple Silicon, Intel Macs, Linux and Windows.
Source, benchmark and installer: https://github.com/Tromset/flycoder
