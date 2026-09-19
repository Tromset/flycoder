#!/usr/bin/env python3
"""Compare base and adapted Qwen on exactly the same held-out examples."""
import argparse
import json
import os
from pathlib import Path
import types

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME', str(ROOT / 'data/huggingface'))
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')


def main():
    import mlx.core as mx
    import numpy as np
    import yaml
    from mlx_lm import load
    from mlx_lm.lora import CONFIG_DEFAULTS
    from mlx_lm.tuner.datasets import CacheDataset, load_dataset
    from mlx_lm.tuner.trainer import evaluate
    from mlx_lm.tuner.utils import load_adapters

    parser = argparse.ArgumentParser()
    parser.add_argument('--batches', type=int, default=-1, help='-1 evaluates the full test set')
    opts = parser.parse_args()
    os.chdir(ROOT)
    config = {**CONFIG_DEFAULTS, **yaml.safe_load((ROOT / 'training/qwen-fly.yaml').read_text())}
    model, tokenizer = load(config['model'])
    _, _, test = load_dataset(types.SimpleNamespace(**config), tokenizer)
    dataset = CacheDataset(test)
    losses = {}
    for label in ['base', 'adapted']:
        if label == 'adapted':
            load_adapters(model, str(ROOT / 'data/fly-language/best'))
        np.random.seed(20260914)
        losses[label] = float(evaluate(model, dataset, 1, opts.batches, max_seq_length=config['max_seq_length']))
        mx.clear_cache()
    report = {'model': config['model'], 'seed': 20260914,
              'examples': len(test) if opts.batches == -1 else min(opts.batches, len(test)),
              'sameExamplesAndOrder': True, 'loss': losses,
              'relativeLossReduction': 1 - losses['adapted'] / losses['base'],
              'limitation': 'Synthetic test data from the same generator. This measures fit to the task, not general intelligence or biological thoughts.'}
    target = ROOT / 'data/fly-language/comparison.json'
    target.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
