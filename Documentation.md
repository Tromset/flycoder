# Documentation de FlyCoder 0.2 beta

FlyCoder est un modèle de code local qui tourne dans [Ollama](https://ollama.com), réglé pour les MacBook et Mac mini Apple Silicon. Cette documentation couvre l'installation, l'utilisation, les réglages, le banc d'essai, la publication et le dépannage. Pour une vue d'ensemble rapide, voir le [README](readme.md).

## Sommaire

1. [Ce qu'est FlyCoder](#1-ce-quest-flycoder)
2. [Prérequis](#2-prérequis)
3. [Installation](#3-installation)
4. [Choisir une variante](#4-choisir-une-variante)
5. [Utilisation](#5-utilisation)
6. [Réglages](#6-réglages)
7. [Banc d'essai](#7-banc-dessai)
8. [Publier une version sur ollama.com](#8-publier-une-version-sur-ollamacom)
9. [Dépannage](#9-dépannage)
10. [Développement](#10-développement)
11. [Limites connues](#11-limites-connues)
12. [Historique des versions](#12-historique-des-versions)
13. [Licences](#13-licences)

## 1. Ce qu'est FlyCoder

FlyCoder 0.2 beta est un **profil Ollama** : un modèle de base ouvert, une quantification adaptée aux Mac, des réglages d'échantillonnage officiels, une fenêtre de contexte explicite et une consigne système dédiée au code. Il s'utilise comme n'importe quel modèle Ollama : dans le terminal, par l'API, ou derrière un agent de code.

FlyCoder ne réentraîne pas les poids. Les gains par rapport à la 0.1 viennent du choix de la base et des réglages, et sont mesurés par le banc d'essai du dépôt (section 7).

Depuis la 0.2, FlyCoder n'inclut plus d'atelier (CLI, interface web, application Electron, contrôleur FlyBrain) : seul le modèle est livré.

## 2. Prérequis

| Élément | Minimum | Remarque |
|---|---|---|
| Mac | Apple Silicon (M1 ou plus récent) | Mac Intel, Linux et Windows : variantes GGUF |
| Mémoire | 8 Go pour `fast`, 16 Go pour la variante principale | L'installateur choisit seul |
| Ollama | 0.31 ou plus récent | Variante principale MLX ; `fast` MLX demande 0.19 |
| Disque | 4,0 Go (`fast`) ou 7,7 Go (principale) | Partagés avec les modèles de base, pas de double copie |
| Node.js | 22 | Seulement pour le banc d'essai et les tests |
| Python 3 | Celui de macOS | Seulement pour le banc d'essai |

Vérifier la version d'Ollama :

```sh
ollama --version
```

## 3. Installation

### 3.1 Depuis ollama.com

Une fois FlyCoder publié (section 8), une seule commande suffit :

```sh
ollama run <utilisateur>/flycoder        # variante principale (Gemma 4 12B)
ollama run <utilisateur>/flycoder:fast   # variante rapide (Qwen3.5 4B)
```

Remplacez `<utilisateur>` par le nom du compte ollama.com qui a publié le modèle.

### 3.2 Installateur en une commande

```sh
curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh
ollama run flycoder
```

L'installateur :

1. vérifie qu'Ollama est installé, démarré et en version 0.31 ou plus ;
2. détecte le système et la mémoire ;
3. choisit `flycoder:0.2-beta` à partir de 15 Go de mémoire, sinon `flycoder:0.2-beta-fast` ;
4. télécharge le modèle de base, crée la variante et la copie sous `flycoder:latest`.

Options, à placer après `sh -s --` quand le script est lu depuis `curl` :

| Option | Effet |
|---|---|
| `--fast` | installe seulement la variante rapide |
| `--all` | installe les deux variantes ; `latest` pointe vers la principale |
| `--gguf` | utilise les poids GGUF portables (Mac Intel, Linux, Windows) au lieu de MLX |

```sh
curl -fsSL https://raw.githubusercontent.com/Tromset/flycoder/main/install.sh | sh -s -- --all
```

Depuis une copie du dépôt, `sh install.sh` utilise les Modelfiles locaux. La variable `FLYCODER_REF` choisit une autre branche ou étiquette GitHub pour les télécharger.

### 3.3 À la main

```sh
git clone https://github.com/Tromset/flycoder.git && cd flycoder
ollama create flycoder:0.2-beta -f Modelfile
ollama create flycoder:0.2-beta-fast -f Modelfile.fast
ollama cp flycoder:0.2-beta flycoder:latest
```

Sur une machine sans Apple Silicon, remplacez d'abord la ligne `FROM` : `gemma4:12b-mlx` par `gemma4:12b`, et `qwen3.5:4b-mlx` par `qwen3.5:4b`.

### 3.4 Vérifier l'installation

```sh
ollama list                         # flycoder:latest, flycoder:0.2-beta...
ollama show flycoder                # base, quantification, capacités
ollama show flycoder --parameters   # réglages appliqués
ollama run flycoder "Écris une fonction Python qui inverse une chaîne."
ollama ps                           # mémoire utilisée, part GPU, contexte alloué
```

Dans `ollama ps`, la colonne PROCESSOR doit afficher `100% GPU`. Une répartition CPU/GPU signale un manque de mémoire (section 9).

### 3.5 Désinstaller

```sh
ollama rm flycoder:latest flycoder:0.2-beta flycoder:0.2-beta-fast
ollama rm gemma4:12b-mlx qwen3.5:4b-mlx   # bases, si aucun autre modèle ne les utilise
```

## 4. Choisir une variante

| Tag | Base | Poids | Contexte | Pour |
|---|---|---|---|---|
| `flycoder:0.2-beta`, `latest` | Gemma 4 12B (Google DeepMind), NVFP4 sur MLX | 7,7 Go | 32 768 | Mac 16 Go et plus, qualité maximale |
| `flycoder:0.2-beta-fast`, `fast` | Qwen3.5 4B (Alibaba Qwen), NVFP4 sur MLX | 4,0 Go | 16 384 | Mac 8 Go, vitesse de la 0.1 |
| `flycoder:0.2-beta-gguf` | Gemma 4 12B, GGUF Q4_K_M | 8,0 Go | 32 768 | Mac Intel, Linux, Windows |
| `flycoder:0.2-beta-fast-gguf` | Qwen3.5 4B, GGUF Q4_K_M | 3,4 Go | 16 384 | Mac Intel, Linux, Windows |

Les deux bases gèrent l'appel d'outils, la réflexion (thinking) et les images.

Règle simple : prenez la variante principale si votre Mac a 16 Go ou plus et que la qualité du code compte plus que la latence ; prenez `fast` sur 8 Go ou si vous voulez exactement la réactivité de la 0.1. Pour changer le modèle par défaut :

```sh
ollama cp flycoder:0.2-beta-fast flycoder:latest   # la variante rapide devient « flycoder »
ollama cp flycoder:0.2-beta flycoder:latest        # retour à la variante principale
```

## 5. Utilisation

### 5.1 Dans le terminal

```sh
ollama run flycoder
```

Tapez votre demande puis Entrée. Pour un texte sur plusieurs lignes, encadrez-le de `"""`. Commandes utiles dans la conversation :

| Commande | Effet |
|---|---|
| `/set nothink` / `/set think` | désactive ou réactive la réflexion |
| `/set parameter num_ctx 65536` | agrandit le contexte pour la session |
| `/set system "…"` | remplace la consigne système pour la session |
| `/show parameters` | affiche les réglages en cours |
| `/clear` | efface la conversation |
| `/bye` | quitte |

Options de lancement : `--think=false` (réponse immédiate), `--hidethinking` (masque la réflexion mais la garde), `--verbose` (affiche le débit en tokens par seconde après chaque réponse).

Donner un fichier au modèle :

```sh
ollama run flycoder "Trouve les bugs de ce fichier et propose un correctif : $(cat src/parser.py)"
```

Donner une image (capture d'écran, schéma) : écrivez son chemin dans la demande, par exemple `ollama run flycoder "Écris le HTML de cette maquette : ./maquette.png"`.

### 5.2 API REST d'Ollama

```sh
curl http://localhost:11434/api/chat -d '{
  "model": "flycoder",
  "messages": [{"role": "user", "content": "Écris une fonction JavaScript debounce(fn, ms)."}],
  "think": false,
  "stream": false
}'
```

- `"think": true` ou `false` active ou coupe la réflexion ; la réflexion est renvoyée à part dans `message.thinking`.
- `"stream": true` (par défaut) envoie la réponse au fil de l'eau en lignes JSON.
- `"options": {"num_ctx": 65536}` change un réglage pour une requête.
- Un message `{"role": "system", ...}` remplace la consigne système de FlyCoder pour cette conversation.

### 5.3 API compatible OpenAI

Ollama expose aussi `http://localhost:11434/v1`. Exemple en Python avec le paquet `openai` :

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
reply = client.chat.completions.create(
    model="flycoder",
    messages=[{"role": "user", "content": "Écris un test pytest pour une fonction slugify."}],
)
print(reply.choices[0].message.content)
```

### 5.4 Agents de code et éditeurs

`ollama launch` configure et ouvre un agent avec FlyCoder :

```sh
ollama launch claude --model flycoder     # Claude Code
ollama launch codex --model flycoder      # Codex
ollama launch opencode --model flycoder   # OpenCode
```

`ollama launch --help` liste les autres intégrations, dont VS Code, Copilot CLI, Cline, Qwen Code, Pi et Droid. Les agents envoient de longues consignes et beaucoup de fichiers : Ollama recommande au moins 64 000 tokens de contexte pour eux (section 6.2).

## 6. Réglages

### 6.1 Ce que fixent les Modelfiles

| Paramètre | Principale | `fast` | Pourquoi |
|---|---|---|---|
| `num_ctx` | 32 768 | 16 384 | Ollama limite sinon à 4 096 tokens sous 24 Go de mémoire |
| `temperature` | 1 | 0,6 | Valeurs officielles de Google et de Qwen pour le code |
| `top_k` | 64 | 20 | Idem |
| `top_p` | 0,95 | 0,95 | Idem |
| `min_p`, `presence_penalty`, `repeat_penalty` | hérités | 0, 0, 1 | Réglages Qwen « code en mode réflexion » |

La variante principale hérite aussi de Gemma 4 son modèle brouillon de prédiction multi-tokens, activé par Ollama. Évitez de baisser la température : Qwen et Google la recommandent telle quelle, et la 0.1 (température 0,2) produisait des réponses en boucle.

### 6.2 Agrandir le contexte

Pour une session : `/set parameter num_ctx 65536`. Pour un modèle permanent, créez une variante :

```sh
printf 'FROM flycoder:0.2-beta\nPARAMETER num_ctx 65536\n' > Modelfile.64k
ollama create flycoder:64k -f Modelfile.64k
ollama launch claude --model flycoder:64k
```

Coût mémoire du cache, en plus des poids : environ 0,5 Go par tranche de 32 768 tokens pour la variante principale, et environ 0,5 Go par tranche de 16 384 tokens pour `fast`. Sur un Mac 16 Go, 65 536 tokens devraient tenir avec la variante principale si peu d'autres applications tournent (non mesuré) : vérifiez avec `ollama ps` que le modèle reste à `100% GPU`.

### 6.3 Réflexion

La réflexion est activée par défaut : le modèle raisonne avant de répondre, ce qui améliore nettement le code sur les problèmes difficiles mais allonge l'attente. Coupez-la pour les questions simples (`--think=false`, `/set nothink`, ou `"think": false` dans l'API). Sans réflexion, le banc a montré que les modèles laissent parfois une première tentative abandonnée dans le code rendu ; gardez-la pour du code à livrer.

### 6.4 Consigne système

La consigne de FlyCoder (`ollama show flycoder --system`) demande de :

- respecter exactement les noms, signatures et fichiers demandés ;
- livrer du code complet et exécutable, sans « TODO » ;
- traiter les cas limites ;
- privilégier la bibliothèque standard et ne jamais inventer d'API ;
- choisir un algorithme adapté ;
- ne montrer que les parties modifiées d'un fichier existant ;
- ne jamais prétendre avoir exécuté des tests ;
- éviter les failles classiques ;
- répondre dans la langue de l'utilisateur.

Remplacez-la pour une session avec `/set system`, ou par un message `system` dans l'API.

### 6.5 Réglages du serveur Ollama

Ces variables s'appliquent à tous les modèles. Sur Mac, avec l'application Ollama, définissez-les avec `launchctl setenv` puis redémarrez Ollama :

```sh
launchctl setenv OLLAMA_KV_CACHE_TYPE q8_0      # cache de contexte deux fois plus petit, perte de précision faible
launchctl setenv OLLAMA_KEEP_ALIVE 30m          # garde le modèle chargé 30 minutes
```

`OLLAMA_KV_CACHE_TYPE=q8_0` divise par deux la mémoire du cache de contexte des modèles GGUF (tags `-gguf`) ; la documentation d'Ollama ne précise pas son effet sur le moteur MLX. `OLLAMA_KEEP_ALIVE` évite de recharger le modèle entre deux questions espacées.

## 7. Banc d'essai

Le dossier `bench/` mesure le taux de réussite et la vitesse de n'importe quel modèle Ollama sur 20 exercices de code :

- 13 en Python et 7 en JavaScript ;
- chacun avec des tests cachés, que le modèle ne voit jamais ;
- chaque test est prouvé par une solution de référence et rejette une solution vide (`npm test`).

```sh
ollama create flycoder0.1beta -f bench/baselines/flycoder-0.1-beta.Modelfile   # pour comparer à la 0.1
npm run bench -- --models flycoder0.1beta,flycoder:0.2-beta,flycoder:0.2-beta-fast
```

| Option | Effet |
|---|---|
| `--models a,b` | modèles à comparer, l'un après l'autre (la mémoire est libérée entre deux) |
| `--think on\|off\|default` | force ou coupe la réflexion ; `default` suit le modèle |
| `--samples 3` | plusieurs essais par exercice, pour lisser le hasard |
| `--only py-lcs,js-evaluate` | sous-ensemble d'exercices |
| `--max-tokens 8192` | plafond de tokens par réponse ; une réponse coupée compte comme un échec |
| `--num-ctx 8192` | contexte réduit pour les machines à court de mémoire, sans effet sur ces réponses courtes |
| `--out fichier.json` | emplacement du rapport ; par défaut `bench/results/` |
| `--no-sandbox` | désactive la sandbox macOS |

Le banc affiche un tableau (réussites, débit de génération, vitesse de lecture du prompt, tokens par réponse, secondes par exercice) et enregistre chaque réponse, chaque erreur de test et chaque compteur dans le JSON, mis à jour après chaque exercice.

Il exécute le code écrit par les modèles sur votre machine, dans un dossier temporaire, avec un délai limite. Sur macOS, `sandbox-exec` lui interdit le réseau et l'écriture hors de ce dossier.

Résultats de référence, enregistrés dans [docs/bench/cpu-nothink.json](docs/bench/cpu-nothink.json) sur un serveur Linux sans GPU, avec les poids GGUF, sans réflexion et un essai par exercice :

| Profil | Réussis | Génération | Tokens par réponse | Temps par exercice |
|---|---|---|---|---|
| `flycoder0.1beta` (0.1) | 5/20 | 6,6 tok/s | 581 | 94 s |
| `flycoder:0.2-beta-fast` | 5/20 | 6,5 tok/s | 537 | 89 s |
| `flycoder:0.2-beta` | 14/20 | 3,4 tok/s | 739 | 235 s |

Sur ce serveur, la variante principale réussit presque trois fois plus d'exercices, mais met environ 2,5 fois plus de temps par exercice. La variante rapide garde la vitesse et le taux de réussite de la 0.1. Aucune mesure n'a encore été faite sur Mac, où le moteur MLX et la prédiction multi-tokens devraient réduire l'écart de vitesse.

## 8. Publier une version sur ollama.com

À faire depuis un Mac Apple Silicon. La publication depuis un autre système refuse de pousser des versions non MLX sous les tags principaux.

1. Créez un compte sur [ollama.com](https://ollama.com/signup). Le nom d'utilisateur devient le préfixe du modèle (`<utilisateur>/flycoder`).
2. Reliez la machine au compte : `ollama signin`, puis validez dans le navigateur. Les machines autorisées se gèrent dans les réglages du compte, rubrique des clés Ollama ; retirez celles dont vous ne vous servez plus.
3. Construisez les deux variantes : `sh install.sh --all`.
4. Publiez : `sh scripts/publish.sh <utilisateur>`. Ajoutez `--gguf` pour publier aussi `0.2-beta-gguf` et `0.2-beta-fast-gguf`.
5. Sur la page `https://ollama.com/<utilisateur>/flycoder`, collez le texte de [docs/ollama-model-page.md](docs/ollama-model-page.md) en remplaçant `<user>`.

Tags publiés : `0.2-beta` et `latest` (principale), `0.2-beta-fast` et `fast` (rapide), plus les deux tags GGUF avec `--gguf`. Les poids de base sont envoyés avec le modèle : prévoyez environ 12 Go d'envoi, 23 Go avec `--gguf`.

Pour une nouvelle version, mettez à jour la version dans `package.json`, `install.sh`, `scripts/publish.sh` et la consigne système des deux Modelfiles. `npm test` vérifie qu'ils concordent.

## 9. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `this model requires MLX support` | machine sans Apple Silicon, ou Ollama trop ancien | mettre Ollama à jour ; sinon `sh install.sh --gguf` ou les tags `-gguf` |
| `requires a newer version of Ollama` | Ollama antérieur à 0.31 | mettre à jour depuis https://ollama.com/download |
| L'installateur dit « Ollama ne répond pas » | application fermée | ouvrir Ollama, ou lancer `ollama serve` |
| Réponses très lentes, `ollama ps` montre une part CPU | mémoire insuffisante, le modèle déborde du GPU | fermer des applications, réduire `num_ctx`, ou passer à `flycoder:fast` |
| Le modèle s'arrête ou plante au chargement | mémoire saturée | idem ; un seul gros modèle chargé à la fois |
| Le modèle oublie le début d'un long fichier | contexte trop petit | agrandir `num_ctx` (section 6.2) |
| Réflexion trop longue | question simple traitée en mode réflexion | `--think=false` ou `/set nothink` |
| Répétitions sans fin | température modifiée trop basse | revenir aux réglages du Modelfile |
| `npm run bench` : « Reference solution failed » | `python3` ou `node` absent, ou sandbox refusée | `xcode-select --install`, Node 22, ou `--no-sandbox` |
| `publish.sh` : « n'est pas la version MLX » | variantes construites en GGUF | relancer `sh install.sh --all` sur un Mac Apple Silicon |

## 10. Développement

### 10.1 Structure du dépôt

| Chemin | Rôle |
|---|---|
| `Modelfile`, `Modelfile.fast` | définitions des deux variantes |
| `install.sh` | installateur en une commande |
| `scripts/publish.sh` | publication sur ollama.com |
| `bench/bench.mjs`, `bench/problems.mjs` | banc d'essai et exercices |
| `bench/baselines/` | profil de la 0.1, pour comparer |
| `docs/bench/` | résultats de référence |
| `docs/ollama-model-page.md` | texte de la page ollama.com |
| `tests/` | tests du banc, des Modelfiles et des scripts |
| `.github/workflows/test.yml` | CI sur Linux et macOS |
| `training/`, `scripts/build_language_dataset.js`, `server/fly-language.js` | ancien pipeline de voix FlyBrain, indépendant de FlyCoder |

### 10.2 Tests

```sh
npm test
```

Les tests vérifient :

- que chaque solution de référence passe ses tests cachés, et qu'une solution vide échoue ;
- l'extraction du code des réponses et le calcul des statistiques ;
- la lecture des réponses en flux continu et le délai limite d'exécution ;
- que les deux Modelfiles partent des bonnes bases, avec les réglages attendus et une consigne identique hormis le nom de la base ;
- que l'installateur et le script de publication concordent avec les Modelfiles et la version.

La CI les lance sur Linux et sur macOS, où les solutions de référence tournent dans la sandbox.

### 10.3 Modifier la consigne système

Modifiez le bloc `SYSTEM` des deux Modelfiles à l'identique (seule la phrase qui nomme la base diffère), lancez `npm test`, reconstruisez avec `ollama create`, puis comparez avant et après avec `npm run bench`.

### 10.4 Ajouter un exercice au banc

Ajoutez un objet à `bench/problems.mjs` avec :

- `id` (préfixe `py-` ou `js-`) ;
- `language` (`python` ou `javascript`) ;
- `entry` (fonction ou classe attendue) ;
- `prompt` (seul texte envoyé au modèle) ;
- `reference` (solution correcte) ;
- `test` (assertions).

`npm test` refuse l'exercice si la référence échoue ou si une solution vide passe.

## 11. Limites connues

- Les poids ne sont pas réentraînés : FlyCoder est un profil de modèles existants.
- Les chiffres LiveCodeBench (72,0 % pour Gemma 4 12B, 55,8 % pour Qwen3.5 4B) sont ceux publiés par Google et Qwen, pas des mesures FlyCoder.
- Le banc compte 20 exercices et un essai par exercice : il départage des profils, sans remplacer un benchmark public.
- La vitesse sur Mac n'a pas été mesurée pour cette version. Les gains MLX (environ +20 %) et multi-tokens (environ +90 % sur Apple Silicon) sont ceux annoncés par Ollama ; sur processeur, le gain multi-tokens mesuré est de 49 %.
- Le mode réflexion n'a pas été mesuré par le banc.
- Les tags MLX ne fonctionnent que sur Apple Silicon.

## 12. Historique des versions

| Version | Contenu |
|---|---|
| 0.1 beta | Atelier complet : Qwen3.5 4B, contrôleur FlyBrain entraînable, CLI, interface web et Electron, agents architecte, codeur et relecteur. |
| 0.2 beta | FlyCoder devient uniquement un modèle Ollama : variante Gemma 4 12B (MLX, multi-tokens) et variante Qwen3.5 4B corrigée, installation en une commande, publication ollama.com, banc d'essai à tests cachés, atelier retiré. |

## 13. Licences

- Code du dépôt : MIT, voir [license.md](license.md).
- Poids : Apache 2.0 pour Gemma 4 et pour Qwen3.5. Les conditions de chaque base s'affichent avec `ollama show flycoder --license`.
