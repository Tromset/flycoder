# FlyCoder 0.1 beta

Atelier de codage local : **Qwen3.5 + contrôleur FlyBrain entraînable**, CLI dérivé d’Ollama-Code, agents spécialisés, récompenses par tests, interface Electron et mouche voxel animée.

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

---

# FlyBrain

Interactive browser simulation of the *Drosophila melanogaster* (fruit fly) brain. 139,255 neurons and 2.7M connections from the [FlyWire FAFB v783](https://codex.flywire.ai) connectome run in real time via a leaky integrate-and-fire model in a Web Worker.

The default view is a complete 3D terrarium: textured soil, plants, fallen wood, mushrooms, rocks, and a shallow pool. An articulated Drosophila walks, grooms, feeds, and flies inside it, with animations linked to the simulation. All habitat assets are generated locally with the vendored Three.js library.

The fly has two controllers. By default, local Qwen 2.5 chooses motor actions from perceptions, internal drives, brain activity and action feedback, using the functional brain structure as its harness. **Connectome seul** restores the original selection of behaviors from neural outputs and local rules. The same body, habitat physics and animations execute both modes.

## Usage

Open `index.html` in a browser (or visit the hosted version). The fly loads the full connectome and begins exploring. Use the toolbar to interact:

- **Habitat 3D** -- switch between the terrarium and the 2D view. Drag to orbit; scroll or pinch to zoom. Camera presets offer an overview, a close follow camera, and a top view.
- **Lite** -- lower rendering resolution and disable dynamic shadows for slower devices.
- **Feed** -- click on clear ground to place food. The fly seeks and eats it when hungry.
- **Touch** -- click on the fly. Head, thorax, abdomen, and legs trigger different responses.
- **Air** -- click and drag near the fly to blow wind.
- **Light** -- cycle through Bright, Dim, Dark. The fly exhibits phototaxis.
- **Temp** -- cycle through Neutral, Warm, Cool.

The habitat has fixed dimensions, so resizing the browser or switching cameras keeps the fly and food in place. The fly avoids solid scenery and the pool, can fly over low obstacles, and lands back on the ground. Light controls change the scene lighting and the existing sensory input. Browsers without WebGL retain the 2D simulation.

The bottom panel shows all 139K neurons firing in real time (WebGL), grouped by region: Sensory, Central, Drives, Motor.

## Local development

Serve the project with `python3 -m http.server 8000 --bind 127.0.0.1` and open [localhost:8000](http://localhost:8000). Run `npm test` for the connectome, habitat, dialogue and motor-control checks. Qwen control requires the local inference and caretaker servers described below. Without them, Qwen mode holds the body stationary; select **Connectome seul** to use the standalone simulation. Opening the app with `file://` selects the standalone mode automatically.

## Contrôle du corps — cerveau comme harness

Dans **Activity → Contrôle du corps**, Qwen 2.5 est le contrôleur par défaut. Le champ **Objectif de la mouche** permet de lui donner une instruction, par exemple « Marche vers le fruit », « Vole vers la gauche à une altitude de 2 » ou « Repose-toi ». **Appliquer** lance un nouvel objectif ; **Pause** suspend immédiatement les décisions ; **Connectome seul** rend la sélection des comportements au simulateur initial. Le dialogue et l’objectif moteur ont des champs distincts.

```text
Perceptions + besoins + activité des régions + résultat du mouvement
                              ↓
                   Qwen 2.5 7B local
                              ↓
            Module + cap + vitesse + altitude + durée
                              ↓
       Projections fonctionnelles du cerveau → VNC virtuel
                              ↓
            BRAIN.motorcontrol → corps → nouvel état
```

| Module | Routage du harness | Effet |
|---|---|---|
| `walk` | `DN_WALK`, `VNC_CPG`, `DN_TURN` → pattes | Marche au cap et à la vitesse choisis |
| `turn` | `DN_TURN` → pattes et tête | Orientation sur place |
| `fly` | `DN_FLIGHT`, `DN_TURN` → ailes et tête | Vol, altitude comprise entre 0,5 et 3 |
| `land`, `stop` | Arrêt de la propulsion et descente | Atterrissage sur terrain libre |
| `feed` | `SEZ_FEED` → trompe et tête | Repas uniquement au contact réel d’un fruit |
| `groom` | `SEZ_GROOM` → pattes avant, abdomen et tête | Toilette |
| `rest` | Arrêt de la propulsion | Repos |

Le routage utilise réellement les poids des projections de `js/constants.js`, lus par `js/brain-harness.js`, puis les accumulateurs de `BRAIN.motorcontrol()`. En mode Qwen, la sélection automatique, les biais vers la lumière/nourriture et les directions aléatoires cèdent l’autorité au modèle. Les collisions et les limites restent physiques. Un atterrissage au-dessus d’un obstacle est différé en vol stationnaire ; le modèle reçoit `landing_blocked` pour se déplacer vers du terrain libre. Un repas hors de portée produit `food_out_of_reach` sans réduire la faim.

Le connectome FlyWire continue sa simulation sensorielle ; ses activités sont résumées par région. Les projections motrices fonctionnelles et le VNC sont des abstractions du simulateur : Qwen n’est pas exécuté dans les 139 255 neurones et ne modifie pas les poids biologiques. Le modèle contrôle le corps à travers ces modules, avec un retour du déplacement effectivement observé.

Chaque onglet possède sa session et une seule requête motrice en vol. `/fly/control/step` accepte uniquement un état récent de cette session visible en mode Qwen. La réponse JSON est validée avant toute exécution. Les commandes durent de 0,5 à 8 secondes et sont renouvelées selon la latence mesurée ; à expiration, le corps s’arrête/se pose. Un changement d’objectif, une pause, un onglet masqué ou une déconnexion invalide les réponses en cours. Le dialogue a priorité sur la décision suivante, et peut donc interrompre temporairement le mouvement. La navigation dépend des décisions du modèle et n’est pas un planificateur de trajectoires garanti.

Le contrôleur utilise les poids de base de **Qwen 2.5 7B**, déjà utilisés pour le dialogue. L’adaptateur 1.5B entraîné pour la voix n’est pas appliqué aux commandes motrices. Aucun nouvel entraînement n’est nécessaire si les deux modèles sont déjà téléchargés :

```sh
npm run language:serve
# Dans un autre terminal :
CARETAKER_DAEMON=1 npm run caretaker
# Vérifications reproductibles du modèle local (mettre le contrôle en pause avant) :
npm run control:evaluate
```

`FLY_CONTROL_MODEL` et `FLY_CONTROL_BASE_URL` permettent de choisir un serveur/modèle dédié. Par défaut, le contrôleur partage `FLY_LLM_BASE_URL` et le modèle `FLY_DIALOGUE_MODEL`. L’évaluation vérifie les modules ainsi que les caps et l’altitude demandés dans neuf scénarios ; son rapport est écrit dans `data/fly-language/control-evaluation.json`. Ces scénarios vérifient le contrat de commande, pas la réussite de toute navigation autonome.

Les sorties JSON invalides sont renvoyées une fois au modèle avec l’erreur de validation, dans la même limite de vingt secondes. Si cette correction échoue, le corps reste en attente. Les neuf scénarios ont passé l’évaluation locale du 14 septembre 2026, dont deux après correction ; les décisions ont pris environ deux à six secondes avec le modèle déjà chargé.

## Voix de la mouche — Qwen 2.5

Le panneau **Activity → La mouche · Qwen 2.5** permet de parler à la mouche en français. **Exprimer une pensée** lui fait décrire son besoin actuel. Le menu permet aussi de retrouver le gardien Claude et ses statistiques. Les conversations des deux interlocuteurs sont conservées séparément.

Qwen reçoit le comportement, les besoins, la nourriture disponible et l’environnement du bon onglet de simulation. Un état vieux de plus de cinq secondes est refusé. Le modèle traduit ces variables en paroles ; il ne décode pas de pensées biologiques et n’entraîne pas les poids du connectome.

Le dialogue utilise deux étapes : l’adaptateur Qwen 2.5 **1.5B** entraîné produit un brouillon de besoin, puis Qwen 2.5 **7B** interprète la question et formule la réponse finale à partir de faits explicites en français. Ces faits priment sur le brouillon. Le petit modèle seul a tendance à ignorer certaines reformulations malgré une faible perte de test ; le 7B conserve sa compréhension générale. Seul l’adaptateur 1.5B est fine-tuné. Le serveur charge les modèles successivement pour limiter la mémoire occupée.

Sur un Mac Apple Silicon, préparer un environnement Python 3.11 et entraîner l’adaptateur :

```sh
uv venv --python 3.11 .venv
uv pip install --python .venv/bin/python -r training/requirements.txt
npm ci
npm run language:data
npm run language:train
```

La session détachée utilise Qwen2.5-1.5B-Instruct en 4 bits, QLoRA de rang 16 sur 16 couches, 600 micro-batches et une accumulation des gradients par 4 (150 mises à jour). Elle télécharge aussi Qwen 2.5 7B quantifié pour le dialogue, sauvegarde tous les 100 pas et conserve l’adaptateur avec la meilleure perte de validation. Le serveur d’inférence démarre sur `127.0.0.1:8081` si la perte de test s’améliore. L’entraînement reste borné et local ; aucun service payant n’est appelé.

Le corpus est synthétique et reproductible : 2 281 exemples d’apprentissage, 239 de validation et 239 de test, avec des formulations de questions distinctes. Il couvre les besoins concurrents, les distances de nourriture, les états manquants et les causes inconnues. Les scores mesurent l’adaptation à ces exemples, pas une compréhension générale ; les réponses peuvent encore se tromper. MLX effectue un véritable ajustement de poids d’adaptateur, selon sa [documentation QLoRA](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md), sur le [modèle Qwen 2.5 MLX](https://huggingface.co/mlx-community/Qwen2.5-1.5B-Instruct-4bit).

```sh
npm run language:status
tail -f data/fly-language/session.log
# Comparaison reproductible sur l’intégralité du jeu de test :
.venv/bin/python training/evaluate.py
# Exemples de réponses du dialogue complet, serveur démarré :
node scripts/evaluate_language_dialogue.js
# Après arrêt de la session, relancer uniquement le meilleur adaptateur :
npm run language:serve
# Serveur de dialogue (dans un autre terminal) :
CARETAKER_DAEMON=1 npm run caretaker
```

Ouvrir ensuite le serveur web sur [127.0.0.1:8000](http://127.0.0.1:8000), comme indiqué ci-dessus. Le chat de la mouche fonctionne sans clé Anthropic. `FLY_LLM_BASE_URL`, `FLY_LLM_MODEL` (voix) et `FLY_DIALOGUE_MODEL` (dialogue, 7B par défaut) permettent de choisir un autre serveur compatible avec l’API de chat et ses modèles. Si cette URL est personnalisée pour un autre serveur MLX, préciser aussi `FLY_LLM_ADAPTER_PATH` pour charger l’adaptateur. Les requêtes de voix transmettent explicitement le chemin de l’adaptateur à MLX ; les requêtes de dialogue utilisent les poids de base du 7B. Les poids, checkpoints, journaux et conversations sont stockés sous `data/fly-language/`, ignoré par Git ; le téléchargement des modèles est sous `data/huggingface/`.

Pour arrêter proprement la session et son serveur d’inférence, lire le PID dans `npm run language:status`, puis exécuter `kill -TERM <PID>`. Le verrou de session empêche deux entraînements simultanés. Les fichiers `evaluation.json` (adaptateur seul), `dialogue-evaluation.json` (réponses finales) et `comparison.json` (comparaison déterministe) servent à inspecter les résultats. Pour les questions sur les besoins, l’environnement, le comportement et le passé, le serveur prépare le contenu factuel pertinent avant sa reformulation par Qwen. Le brouillon n’est jamais une mesure biologique.

## Data Source

Connectome data from the FlyWire Whole-Brain Connectome:

> Dorkenwald, S., Matsliah, A., Sterling, A.R. *et al.* Neuronal wiring diagram of an adult brain. *Nature* **634**, 124--138 (2024). https://doi.org/10.1038/s41586-024-07558-y

The binary connectome file (`data/neuron_meta.bin.gz`) is derived from the [FlyWire Codex](https://codex.flywire.ai) public dataset (FAFB v783). Neurons are classified into functional groups (sensory, central, drives, motor) based on FlyWire cell type annotations.

## Origin

Forked from [heyseth/worm-sim](https://github.com/heyseth/worm-sim), which simulated the 302-neuron *C. elegans* connectome in the browser. FlyBrain replaces the worm with a fruit fly and scales from 302 neurons to 139,255.

## License

MIT License -- see [license.md](license.md) for details.

## Acknowledgments

- **FlyWire Consortium** -- for mapping the complete adult *Drosophila* brain connectome and making the data publicly available.
- **Timothy Busbice, Gabriel Garrett, Geoffrey Churchill** and contributors to the [GoPiGo Connectome](https://github.com/Connectome/GoPiGo) -- original connectome-driven robot concept.
- **[Zach Rispoli](https://github.com/zrispo)** -- porting the *C. elegans* connectome to JavaScript.
- **[Seth Miller](https://github.com/heyseth)** -- creating worm-sim, the browser simulation this project is forked from.
