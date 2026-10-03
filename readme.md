# FlyCoder 0.3 beta

FlyCoder est un modèle de code local pour Ollama, réglé pour les MacBook et Mac mini Apple Silicon. Vous l'utilisez directement avec `ollama run`, ou dans n'importe quel outil compatible Ollama. Depuis la 0.3, le routeur facultatif **FlyBrain** n'active que la partie de FlyCoder dont une demande a besoin, ce qui baisse la mémoire utilisée (voir plus bas).

Documentation complète (installation, utilisation, API, réglages, banc d'essai, publication, dépannage) : [Documentation.md](Documentation.md).

## Installer en une commande

Il faut [Ollama](https://ollama.com/download) 0.31 ou plus récent, ouvert. FlyCoder est publié sur [ollama.com/delairvictor9/flycoder](https://ollama.com/delairvictor9/flycoder) :

```sh
ollama run delairvictor9/flycoder        # Gemma 4 12B, Mac 16 Go et plus
ollama run delairvictor9/flycoder:fast   # Qwen3.5 4B, Mac 8 Go
```

Ou, pour l'installer sous le nom court `flycoder` avec la variante choisie selon la mémoire du Mac :

```sh
curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh
ollama run flycoder
```

L'installateur détecte la mémoire du Mac et construit la bonne variante dans votre Ollama local : `flycoder:0.2-beta` à partir de 16 Go, `flycoder:0.2-beta-fast` en dessous. Dans les deux cas, `ollama run flycoder` fonctionne. Options : `sh -s -- --fast` (variante rapide), `sh -s -- --all` (les deux), `sh -s -- --gguf` (poids GGUF pour Mac Intel, Linux ou Windows).

## Les deux variantes

| Tag | Base | Poids | Mac conseillé | Contexte |
|---|---|---|---|---|
| `flycoder:0.2-beta` (`latest`) | Gemma 4 12B, Google DeepMind | 7,7 Go, NVFP4 sur MLX | 16 Go et plus | 32 768 tokens |
| `flycoder:0.2-beta-fast` (`fast`) | Qwen3.5 4B, Alibaba Qwen | 4,0 Go, NVFP4 sur MLX | 8 Go et plus | 16 384 tokens |

Les deux bases sont sous licence Apache 2.0 et gèrent les outils (tool calling), la réflexion (thinking) et les images.

## FlyBrain : moins de RAM, même qualité sur les demandes difficiles

FlyBrain s'inspire du cerveau de la mouche : de petits indices tirés de la demande (comme les cellules de Kenyon du corps pédonculé) suffisent à trancher les cas nets. Quand rien n'est net, un micro-modèle de 0,8 milliard de paramètres décide. Un seul « lobe » expert est ensuite chargé en mémoire.

| Vous appelez | Demande simple | Demande difficile, outils (agents) ou long contexte | Demande ambiguë |
|---|---|---|---|
| `flycoder` | Qwen3.5 4B, avec réflexion | Gemma 4 12B, avec réflexion | le micro-modèle `flycoder:router` (Qwen3.5 0.8B) choisit |
| `flycoder:fast` | `flycoder:0.2-beta-lite` (Qwen3.5 2B) | Qwen3.5 4B | Qwen3.5 4B (pas de micro-modèle) |

Mémoire mesurée (mémoire résidente des processus du modèle après une réponse, serveur Linux 16 Go sans GPU, poids GGUF ; sur Mac avec MLX, les valeurs absolues diffèrent) :

| Cas | Sans FlyBrain | Avec FlyBrain |
|---|---|---|
| `flycoder`, demande simple | 10,5 Gio | **6,1 Gio** (4B + micro-modèle) |
| `flycoder`, demande difficile | 10,5 Gio | 10,5 Gio (identique : la qualité est gardée) |
| `flycoder:fast`, demande simple | 4,6 Gio | **3,7 Gio** |
| `flycoder:fast`, demande difficile | 4,6 Gio | 4,6 Gio |

Le routeur se trompe rarement : sur 60 demandes étiquetées (les 20 exercices du banc et 40 demandes écrites pour l'occasion dans [tests/fixtures/route-prompts.json](tests/fixtures/route-prompts.json)), il en aiguille 59 correctement. Aucune demande difficile n'est partie vers le petit modèle ; une question git simple est partie vers le gros. Les règles décident seules 39 fois ; le micro-modèle répond en 0,6 s environ (médiane, sur processeur). Si le micro-modèle échoue ou hésite, la demande part vers le gros modèle. Une conversation garde son expert, et ne peut que monter vers le plus fort. Sous 16 Go de mémoire, FlyBrain plafonne `flycoder` au 4B.

```sh
node ~/.flycoder/brain/flybrain.mjs        # installé par install.sh ; ou : npm run brain depuis ce dépôt
OLLAMA_HOST=127.0.0.1:11435 ollama run flycoder
```

FlyBrain parle l'API d'Ollama sur le port 11435 et laisse passer tous les autres modèles. Pour un agent de code, pointez-le sur FlyBrain plutôt que sur Ollama :

```sh
ANTHROPIC_BASE_URL=http://127.0.0.1:11435 ANTHROPIC_AUTH_TOKEN=ollama ANTHROPIC_API_KEY="" claude --model flycoder   # Claude Code
# Codex, OpenCode, Cline… : URL compatible OpenAI http://127.0.0.1:11435/v1, modèle flycoder
```

Avec les modèles publiés sur ollama.com plutôt qu'installés par `install.sh` : `ollama pull delairvictor9/flycoder:router` (et `:0.2-beta-lite`, `:0.2-beta-fast`, `:0.2-beta`), puis `node brain/flybrain.mjs --prefix delairvictor9/`.

## Ce qui change par rapport à la 0.1

**Un modèle de base nettement plus fort.** La 0.1 reposait sur Qwen3.5 4B. Sur LiveCodeBench v6, chiffres publiés par les auteurs en mode réflexion, Gemma 4 12B obtient 72,0 % contre 55,8 % pour Qwen3.5 4B (et 65,6 % pour Qwen3.5 9B, qui serait deux fois plus lent). Son Elo Codeforces publié est de 1659.

**La prédiction multi-tokens limite le coût des 12 milliards de paramètres.** Gemma 4 embarque un petit modèle brouillon qui propose plusieurs tokens d'avance ; le modèle principal les vérifie en une seule passe. Mesuré ici sur 14 réponses de code : 77 % des 6 594 tokens proposés acceptés, 3,35 tokens validés par passe, et une génération 49 % plus rapide qu'avec le brouillon désactivé (2,7 → 4,1 tokens/s sur le même exemple). Ollama annonce environ +90 % sur Apple Silicon.

**Le moteur MLX d'Apple Silicon.** Les deux variantes utilisent les poids NVFP4 du moteur MLX d'Ollama. Selon Ollama, ce format génère environ 20 % plus vite que le Q4_K_M de la 0.1 et divise à peu près par deux la perte de qualité due à la quantification.

**Des réglages corrigés.** La 0.1 tournait à une température de 0,2, ce que Qwen déconseille (risque de répétitions sans fin et baisse de qualité). La 0.2 applique les réglages officiels : ceux de Google pour Gemma 4, ceux de Qwen pour le code en mode réflexion.

**Assez de contexte pour du vrai code.** Sans réglage, Ollama limite à 4 096 tokens les machines de moins de 24 Go. FlyCoder fixe 32 768 tokens (variante principale) et 16 384 (variante rapide).

**Une consigne système dédiée au code**, courte : respecter exactement les noms et signatures demandés, livrer du code complet sans « TODO », traiter les cas limites, ne pas inventer d'API, ne jamais prétendre avoir exécuté des tests, éviter les failles classiques, répondre dans la langue de l'utilisateur.

## Vitesse et qualité mesurées

Le banc d'essai `bench/` contient 20 exercices de code (13 en Python, 7 en JavaScript) avec tests cachés : intervalles, chiffres romains stricts, tri topologique, cache LRU, SemVer, CSV, Dijkstra sur 100 000 arêtes, évaluateur d'expressions, joker `*`/`?` résistant aux cas pathologiques, etc. Chaque test est validé par une solution de référence et rejette une solution vide (`npm test`).

Passage enregistré dans [docs/bench/cpu-nothink.json](docs/bench/cpu-nothink.json), sur un serveur Linux à 4 cœurs **sans GPU** (Ollama 0.35, poids GGUF Q4_K_M, réflexion désactivée comme dans l'ancien atelier, un essai par exercice, 2 048 tokens maximum). Les vitesses absolues sont bien plus basses que sur un Mac ; seules les comparaisons entre profils comptent :

| Profil | Base | Exercices réussis | Génération | Tokens par réponse | Temps par exercice |
|---|---|---|---|---|---|
| `flycoder0.1beta` (0.1) | Qwen3.5 4B, température 0,2 | 5/20 (25 %) | 6,6 tok/s | 581 | 94 s |
| `flycoder:0.2-beta-fast` | Qwen3.5 4B, réglages Qwen | 5/20 (25 %) | 6,5 tok/s | 537 | 89 s |
| `flycoder:0.2-beta` | Gemma 4 12B, multi-tokens | **14/20 (70 %)** | 3,4 tok/s | 739 | 235 s |

Ce que ces chiffres disent :

- **La variante principale résout presque trois fois plus d'exercices** que la 0.1 : 14 contre 5, dont l'évaluateur d'expressions, le parseur CSV, le cache LRU, les chiffres romains stricts et l'écriture des nombres en toutes lettres, tous ratés par la 0.1.
- **Elle est plus lente par exercice sur ce serveur** : environ 2,5 fois le temps de la 0.1, car elle écrit un code plus complet (validations, docstrings) et chaque token coûte plus cher sur processeur. Sur Mac, le moteur MLX et le gain multi-tokens, plus fort sur GPU, devraient réduire cet écart ; ce n'est pas encore mesuré.
- **La variante rapide garde exactement la vitesse de la 0.1** (6,5 contre 6,6 tokens/s, 89 contre 94 s par exercice) avec le même taux de réussite sans réflexion, et 8 % de tokens en moins. Sur Mac, elle gagne en plus le moteur MLX.

Sept exercices de la variante principale et un de la variante rapide ont été relancés : au premier passage, le serveur avait manqué de mémoire ou le banc avait coupé la requête après 5 minutes. Ce sont des pannes d'infrastructure, pas des réponses ; le banc envoie désormais les réponses en flux continu et relance une fois un modèle qui plante.

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

Dans une conversation, `/set nothink` coupe la réflexion et `/set parameter num_ctx 65536` agrandit le contexte (environ 0,5 Go de mémoire en plus pour la variante principale). Ollama recommande au moins 64 000 tokens pour les agents de code ; FlyCoder fonctionne aussi avec `ollama launch` (Claude Code, Codex, OpenCode) : `ollama launch claude --model flycoder` si vous l'avez installé avec `install.sh`, ou `ollama launch claude --model delairvictor9/flycoder` depuis ollama.com. `ollama launch` parle directement à Ollama ; pour passer par FlyBrain, voir la section FlyBrain.

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

Ensuite, n'importe qui peut lancer `ollama run <utilisateur>/flycoder` ou `ollama run <utilisateur>/flycoder:fast`. La 0.2 beta est publiée sous `delairvictor9`.

## Contenu du dépôt

- `Modelfile`, `Modelfile.fast` : définitions des deux variantes (`ollama create flycoder -f Modelfile`).
- `Modelfile.lite`, `Modelfile.router` : expert 2B et micro-modèle de FlyBrain.
- `brain/` : le serveur FlyBrain (`flybrain.mjs`), ses règles (`router.mjs`) et la mesure de justesse du routeur (`eval-router.mjs`).
- `install.sh` : installation en une commande. `scripts/publish.sh` : publication sur ollama.com.
- `bench/` : banc d'essai qualité et vitesse ; `bench/baselines/` garde le profil 0.1 pour comparer.
- `tests/` : `npm test` vérifie les tests du banc, la cohérence des Modelfiles et des scripts.
- `training/`, `scripts/build_language_dataset.js`, `server/fly-language.js` : pipeline QLoRA de l'ancienne voix FlyBrain (Qwen 2.5 1.5B, MLX), indépendant de FlyCoder.

## Limites de cette beta

- Les poids ne sont pas réentraînés : FlyCoder 0.2 est un profil Ollama (base, quantification, réglages, contexte, consigne système). Les gains de qualité viennent du changement de base et des réglages, pas d'un fine-tuning.
- Les chiffres LiveCodeBench et Codeforces sont ceux publiés par Google et Qwen, pas des mesures FlyCoder. Le banc fourni est petit (20 exercices) : il départage des profils, il ne remplace pas un benchmark public.
- La vitesse sur Mac n'a pas été mesurée pour cette version : les gains MLX et multi-tokens cités sont ceux annoncés par Ollama. Sur processeur, la variante principale est environ 2,5 fois plus lente par exercice que la 0.1 ; si l'écart reste trop grand sur votre Mac, `ollama cp flycoder:0.2-beta-fast flycoder:latest` fait de la variante rapide le modèle par défaut.
- Sans réflexion, les trois profils laissent parfois une première tentative abandonnée dans le code rendu (3 réponses sur 20 chacun) : gardez la réflexion activée pour du code à livrer.
- Le banc a tourné sans réflexion. Avec la réflexion activée (le défaut de `ollama run`), la qualité monte pour les deux bases mais les réponses sont plus longues ; mesurez-le avec `npm run bench -- --think on`.
- Les variantes MLX demandent un Mac Apple Silicon ; ailleurs, utilisez `--gguf`.
- FlyBrain baisse la mémoire des demandes simples, pas celle des demandes difficiles : le pic reste celui du gros modèle. Changer d'expert prend quelques secondes de rechargement. Les agents (qui envoient des outils) vont toujours au gros modèle. Les mesures de mémoire et du routeur viennent d'un serveur Linux en GGUF, pas encore d'un Mac en MLX.

## Licence

Code du dépôt : MIT, voir [license.md](license.md). Les poids restent sous la licence de leur base : Apache 2.0 pour Gemma 4 et pour Qwen3.5, affichée par `ollama show flycoder --license`.
