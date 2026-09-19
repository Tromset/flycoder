#!/usr/bin/env python3
"""Bounded local QLoRA session; keep the best validation adapter and a report."""
import argparse
import fcntl
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'data/fly-language'
os.environ.setdefault('HF_HOME', str(ROOT / 'data/huggingface'))
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')


def write_json(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--detach', action='store_true')
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--iters', type=int)
    opts = parser.parse_args()
    WORK.mkdir(parents=True, exist_ok=True)
    os.chdir(ROOT)
    if opts.detach:
        # The child holds an exclusive lock for the entire session.
        with (WORK / 'session.log').open('a') as log:
            command = [sys.executable, '-u', __file__] + [a for a in sys.argv[1:] if a != '--detach']
            child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        time.sleep(1)
        if child.poll() is not None:
            raise RuntimeError('Session failed to start; see data/fly-language/session.log')
        print(json.dumps({'pid': child.pid, 'log': str(WORK / 'session.log')}))
        return

    lock = (WORK / 'session.lock').open('w')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('A language training/inference session is already running.')
    status = {'status': 'loading', 'pid': os.getpid(), 'startedAt': time.time(), 'iteration': 0}

    def update(**fields):
        status.update(fields, updatedAt=time.time())
        write_json(WORK / 'status.json', status)

    def stop(signum, _frame):
        update(status='stopped')
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    update()
    try:
        import copy
        import shutil
        import types
        import yaml
        import numpy as np
        import mlx.core as mx
        from mlx.utils import tree_flatten
        from mlx_lm import load, generate
        from mlx_lm.lora import CONFIG_DEFAULTS, train_model
        from mlx_lm.tuner.datasets import load_dataset, CacheDataset
        from mlx_lm.tuner.trainer import evaluate, TrainingCallback
        from mlx_lm.sample_utils import make_sampler
        from huggingface_hub import snapshot_download

        config = copy.deepcopy(CONFIG_DEFAULTS)
        config.update(yaml.safe_load((ROOT / 'training/qwen-fly.yaml').read_text()))
        if opts.iters is not None:
            if opts.iters < 4 or opts.iters % config['grad_accumulation_steps']:
                raise ValueError('iters must be a positive multiple of gradient accumulation (4).')
            config['iters'] = opts.iters
        args = types.SimpleNamespace(**config)
        update(model=args.model, iterations=args.iters)
        if opts.serve:
            snapshot_download(os.environ.get('FLY_DIALOGUE_MODEL', 'mlx-community/Qwen2.5-7B-Instruct-4bit'))
        model, tokenizer = load(args.model)
        train_set, valid_set, test_set = load_dataset(args, tokenizer)
        # Check the complete corpus before truncation could silently mask answers.
        lengths = [len(dataset.process(row)[0]) for dataset in (train_set, valid_set, test_set) for row in dataset]
        if max(lengths) > args.max_seq_length:
            raise ValueError(f'Dataset exceeds context budget: {max(lengths)} > {args.max_seq_length}')
        update(status='baseline', maxSampleTokens=max(lengths))

        def test_loss():
            np.random.seed(20260914)
            return float(evaluate(model=model, dataset=CacheDataset(test_set), batch_size=1,
                                  num_batches=48, max_seq_length=args.max_seq_length))

        baseline = test_loss()
        best_path = WORK / 'best'
        best_path.mkdir(exist_ok=True)

        class Progress(TrainingCallback):
            best = float('inf')

            def on_train_loss_report(self, info):
                if not math.isfinite(info['train_loss']):
                    raise RuntimeError('Non-finite training loss')
                update(status='training', **info)

            def on_val_loss_report(self, info):
                loss = float(info['val_loss'])
                if not math.isfinite(loss):
                    raise RuntimeError('Non-finite validation loss')
                if loss < self.best:
                    self.best = loss
                    mx.save_safetensors(str(best_path / 'adapters.safetensors'), dict(tree_flatten(model.trainable_parameters())))
                    shutil.copyfile(WORK / 'adapters/adapter_config.json', best_path / 'adapter_config.json')
                    status['bestIteration'] = info['iteration']
                update(validationLoss=loss, bestValidationLoss=self.best)

        update(status='training', baselineTestLoss=baseline)
        train_model(args, model, train_set, valid_set, Progress())
        model.load_weights(str(best_path / 'adapters.safetensors'), strict=False)
        update(status='evaluating')
        adapted = test_loss()
        cases = json.loads((WORK / 'dataset/evaluation.json').read_text())[:12]
        samples = []
        # Prompt bytes are generated by the same Node module used in production.
        for case in cases:
            messages = json.loads(subprocess.check_output(['node', '-e',
                'const {buildMessages}=require("./server/fly-language"); const fs=require("fs"); const x=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(JSON.stringify(buildMessages(x.state,x.question)));'],
                input=json.dumps(case).encode(), cwd=ROOT))
            prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            result = generate(model, tokenizer, prompt=prompt, max_tokens=160, sampler=make_sampler(temp=0))
            samples.append({**case, 'actual': result})
        report = {'model': args.model, 'iterations': args.iters, 'bestIteration': status.get('bestIteration'),
                  'baselineTestLoss': baseline, 'adaptedTestLoss': adapted,
                  'testBatches': 48, 'bestValidationLoss': status['bestValidationLoss'],
                  'source': 'Synthetic simulation supervision; perplexity is not proof of semantic understanding.',
                  'samples': samples}
        write_json(WORK / 'evaluation.json', report)
        if not math.isfinite(adapted) or adapted >= baseline:
            update(status='validation_failed', adaptedTestLoss=adapted)
            return
        update(status='trained', adaptedTestLoss=adapted)
        if opts.serve:
            # Free training allocations before starting the inference worker.
            del model, tokenizer, train_set, valid_set, test_set
            mx.clear_cache()
            command = [sys.executable, '-m', 'mlx_lm', 'server', '--model', args.model,
                       '--adapter-path', str(best_path), '--host', '127.0.0.1', '--port', '8081']
            with (WORK / 'inference.log').open('a') as log:
                worker = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
                try:
                    update(status='serving', inferencePid=worker.pid)
                    code = worker.wait()
                    update(status='stopped' if code == 0 else 'failed', inferenceExitCode=code)
                finally:
                    if worker.poll() is None:
                        worker.terminate()
                        worker.wait(timeout=20)
    except Exception as error:
        update(status='failed', error=str(error))
        raise


if __name__ == '__main__':
    main()
