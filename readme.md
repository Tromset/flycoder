# FlyCoder 0.2 beta

FlyCoder est un modèle de code local pour Ollama, réglé pour les MacBook et Mac mini Apple Silicon. Depuis la 0.2, FlyCoder est uniquement le modèle : l'ancien atelier (CLI, interface web, Electron, contrôleur FlyBrain) a été retiré. Vous l'utilisez directement avec `ollama run`, ou dans n'importe quel outil compatible Ollama.

## Installer en une commande

Il faut [Ollama](https://ollama.com/download) 0.31 ou plus récent, ouvert.

```sh
curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh
ollama run flycoder
```

L'installateur détecte la mémoire du Mac et construit la bonne variante dans votre Ollama local : `flycoder:0.2-beta` à partir de 16 Go, `flycoder:0.2-beta-fast` en dessous. Dans les deux cas, `ollama run flycoder` fonctionne. Options : `sh -s -- --fast` (variante rapide), `sh -s -- --all` (les deux), `sh -s -- --gguf` (poids GGUF pour Mac Intel, Linux ou Windows).

Une fois publié sur ollama.com (voir plus bas), il suffit de :

```sh
ollama run <utilisateur>/flycoder
```

## Les deux variantes

| Tag | Base | Poids | Mac conseillé | Contexte |
|---|---|---|---|---|
| `flycoder:0.2-beta` (`latest`) | Gemma 4 12B, Google DeepMind | 7,7 Go, NVFP4 sur MLX | 16 Go et plus | 32 768 tokens |
| `flycoder:0.2-beta-fast` (`fast`) | Qwen3.5 4B, Alibaba Qwen | 4,0 Go, NVFP4 sur MLX | 8 Go et plus | 16 384 tokens |

Les deux bases sont sous licence Apache 2.0 et gèrent les outils (tool calling), la réflexion (thinking) et les images.

## Ce qui change par rapport à la 0.1

**Un modèle de base nettement plus fort.** La 0.1 reposait sur Qwen3.5 4B. Sur LiveCodeBench v6, chiffres publiés par les auteurs en mode réflexion, Gemma 4 12B obtient 72,0 % contre 55,8 % pour Qwen3.5 4B (et 65,6 % pour Qwen3.5 9B, qui serait deux fois plus lent). Son Elo Codeforces publié est de 1659.

**La prédiction multi-tokens garde la vitesse.** Gemma 4 embarque un petit modèle brouillon qui propose plusieurs tokens d'avance ; le modèle principal les vérifie en une seule passe. Mesuré ici sur du code : 80 % des tokens proposés acceptés, 3,4 tokens validés par vérification en moyenne. Ollama annonce environ +90 % de vitesse de génération sur Apple Silicon grâce à ce mécanisme.

**Le moteur MLX d'Apple Silicon.** Les deux variantes utilisent les poids NVFP4 du moteur MLX d'Ollama. Selon Ollama, ce format génère environ 20 % plus vite que le Q4_K_M de la 0.1 et divise à peu près par deux la perte de qualité due à la quantification.

**Des réglages corrigés.** La 0.1 tournait à une température de 0,2, ce que Qwen déconseille (risque de répétitions sans fin et baisse de qualité). La 0.2 applique les réglages officiels : ceux de Google pour Gemma 4, ceux de Qwen pour le code en mode réflexion.

**Assez de contexte pour du vrai code.** Sans réglage, Ollama limite à 4 096 tokens les machines de moins de 24 Go. FlyCoder fixe 32 768 tokens (variante principale) et 16 384 (variante rapide).

**Une consigne système dédiée au code**, courte : respecter exactement les noms et signatures demandés, livrer du code complet sans « TODO », traiter les cas limites, ne pas inventer d'API, ne jamais prétendre avoir exécuté des tests, éviter les failles classiques, répondre dans la langue de l'utilisateur.

## Vitesse et qualité mesurées

Le banc d'essai `bench/` contient 20 exercices de code (13 en Python, 7 en JavaScript) avec tests cachés : intervalles, chiffres romains stricts, tri topologique, cache LRU, SemVer, CSV, Dijkstra sur 100 000 arêtes, évaluateur d'expressions, joker `*`/`?` résistant aux cas pathologiques, etc. Chaque test est validé par une solution de référence et rejette une solution vide (`npm test`).

Premier passage enregistré dans [docs/bench](docs/bench/), sur un serveur Linux à 4 cœurs **sans GPU** (poids GGUF, réflexion désactivée comme dans l'ancien atelier, un essai par exercice). Les vitesses absolues sont bien plus basses que sur un Mac ; seules les comparaisons entre profils comptent :

<!-- bench-table -->

Pour mesurer sur votre Mac :

```sh
ollama create flycoder0.1beta -f bench/baselines/flycoder-0.1-beta.Modelfile   # pour comparer à la 0.1
npm run bench -- --models flycoder0.1beta,flycoder:0.2-beta,flycoder:0.2-beta-fast
```

Le banc exécute le code produit par les modèles sur votre machine, dans un dossier temporaire, avec un délai limite ; sur macOS, `sandbox-exec` lui interdit le réseau et l'écriture hors de ce dossier. Options utiles : `--think on|off`, `--samples 3`, `--only py-lcs,js-evaluate`.

## Utilisation

```sh
ollama run flycoder                      # réflexion activée par défaut : meilleure qualité
ollama run flycoder --think=false        # réponse immédiate, pour les questions simples
ollama run flycoder:fast                 # variante 4B si vous l'avez installée
```

Dans une conversation, `/set nothink` coupe la réflexion et `/set parameter num_ctx 65536` agrandit le contexte (environ 0,5 Go de mémoire en plus pour la variante principale). Ollama recommande au moins 64 000 tokens pour les agents de code ; FlyCoder fonctionne aussi avec `ollama launch` (Claude Code, Codex, OpenCode) : `ollama launch claude --model flycoder`.

Depuis une application, l'API d'Ollama suffit :

```sh
curl http://localhost:11434/api/chat -d '{"model":"flycoder","messages":[{"role":"user","content":"Écris une fonction Python qui fusionne des intervalles."}]}'
```

## Publier FlyCoder sur ollama.com

À faire une seule fois, depuis un Mac Apple Silicon :

1. Créez un compte sur [ollama.com](https://ollama.com/signup). Le nom d'utilisateur fera partie du nom du modèle.
2. Reliez ce Mac au compte : `ollama signin`.
3. Construisez les deux variantes : `sh install.sh --all`.
4. Publiez : `sh scripts/publish.sh <utilisateur>` (ajoutez `--gguf` pour publier aussi les versions Mac Intel, Linux et Windows).
5. Collez le texte de [docs/ollama-model-page.md](docs/ollama-model-page.md) dans la description de la page du modèle.

Ensuite, n'importe qui peut lancer `ollama run <utilisateur>/flycoder` ou `ollama run <utilisateur>/flycoder:fast`.

## Contenu du dépôt

- `Modelfile`, `Modelfile.fast` : définitions des deux variantes (`ollama create flycoder -f Modelfile`).
- `install.sh` : installation en une commande. `scripts/publish.sh` : publication sur ollama.com.
- `bench/` : banc d'essai qualité et vitesse ; `bench/baselines/` garde le profil 0.1 pour comparer.
- `tests/` : `npm test` vérifie les tests du banc, la cohérence des Modelfiles et des scripts.
- `training/`, `scripts/build_language_dataset.js`, `server/fly-language.js` : pipeline QLoRA de l'ancienne voix FlyBrain (Qwen 2.5 1.5B, MLX), indépendant de FlyCoder.

## Limites de cette beta

- Les poids ne sont pas réentraînés : FlyCoder 0.2 est un profil Ollama (base, quantification, réglages, contexte, consigne système). Les gains de qualité viennent du changement de base et des réglages, pas d'un fine-tuning.
- Les chiffres LiveCodeBench et Codeforces sont ceux publiés par Google et Qwen, pas des mesures FlyCoder. Le banc fourni est petit (20 exercices) : il départage des profils, il ne remplace pas un benchmark public.
- La vitesse sur Mac n'a pas été mesurée pour cette version : les gains MLX et multi-tokens cités sont ceux annoncés par Ollama. Lancez `npm run bench` sur votre machine pour les confirmer.
- Les variantes MLX demandent un Mac Apple Silicon ; ailleurs, utilisez `--gguf`.

## Licence

Code du dépôt : MIT, voir [license.md](license.md). Les poids restent sous la licence de leur base : Apache 2.0 pour Gemma 4 et pour Qwen3.5, affichée par `ollama show flycoder --license`.
