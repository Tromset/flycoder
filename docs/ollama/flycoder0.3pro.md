# FlyCoder 0.3 pro

The strongest FlyCoder, for hard coding work and coding agents, on Macs with 32 GB of memory or more.

```sh
ollama run Tromset/flycoder0.3pro
```

| Base | Size | Mac | Context |
|---|---|---|---|
| Qwen3.8 27B (Apache 2.0) | 18 GB | 32 GB | 64K tokens |

- **Works like a senior engineer**: pins down the contract, plans multi-file changes, writes the code and the tests that prove it, checks the tricky cases before answering, then tells you how to run the tests.
- **Built for agents**: reads files before editing, makes minimal changes, reports real test output, never runs a destructive command without asking (`ollama launch claude --model Tromset/flycoder0.3pro`).
- **Fast for its size**: multi-token prediction is on, and 64K tokens of context cost only about 4.4 GB thanks to Qwen3.8's hybrid attention.

Other sizes: [`Tromset/flycoder0.3`](https://ollama.com/Tromset/flycoder0.3) for 16 GB Macs, [`Tromset/flycoder0.3fast`](https://ollama.com/Tromset/flycoder0.3fast) for 8 GB Macs.

Needs Ollama 0.32.12 or later. Runs on Apple Silicon, Intel Macs, Linux and Windows.
Source, benchmark and installer: https://github.com/Tromset/flycoder
