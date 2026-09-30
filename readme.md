# FlyCoder 0.1 beta

Atelier de codage local : **Qwen3.5 + contrôleur FlyBrain entraînable**, CLI dérivé d’Ollama-Code, agents spécialisés, récompenses par tests et interface Electron.

```sh
git clone https://github.com/Tromset/flycoder.git
cd flycoder
npm ci
npm link
flycoder install
flycoder ui          # http://127.0.0.1:4317
# ou : flycoder / npm run desktop
```

Le [profil `flycoder0.1beta`](flycoder/models/README.md), son `Modelfile` et le checkpoint du contrôleur sont inclus dans ce dépôt. Les poids de base Qwen3.5 sont téléchargés par `flycoder install` via Ollama ; ils ne sont pas stockés dans Git. Node.js 22 ou ultérieur et un serveur Ollama local démarré sont nécessaires.

Consultez le **[guide FlyCoder](docs/FLYCODER.md)** pour les vérificateurs multilangages, l’entraînement, la carte des unités et les limites de cette beta. Un [premier exercice prêt à lancer](examples/hello-fly/README.md) permet de vérifier la boucle.

La beta entraîne les poids du contrôleur, pas ceux de Qwen. La carte montre les unités numériques réellement exécutées ; elle ne représente pas des activations internes Qwen ni un cerveau vivant. Le [rapport local](docs/flycoder-evaluation.json) contient les résultats mesurés.

## Entraînement Qwen 2.5 conservé

La simulation FlyBrain a été retirée ; seul son pipeline d’entraînement QLoRA (Qwen 2.5 1.5B, MLX, Apple Silicon) reste disponible dans `training/`, avec `scripts/build_language_dataset.js` et `server/fly-language.js` qui définissent le jeu de données :

```sh
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r training/requirements.txt
npm run language:data
npm run language:train
npm run language:status
```

Les poids, checkpoints et journaux sont écrits sous `data/`, ignoré par Git.

## Origine

Le graphe du contrôleur (`flycoder/models/flybrain-graph.json`) est figé à partir des circuits fonctionnels de FlyBrain, lui-même dérivé de [heyseth/worm-sim](https://github.com/heyseth/worm-sim) et des données [FlyWire FAFB v783](https://codex.flywire.ai) (Dorkenwald *et al.*, *Nature* 634, 2024). Provenance du CLI : [docs/THIRD_PARTY.md](docs/THIRD_PARTY.md).

## Licence

MIT — voir [license.md](license.md).
