# flycoder0.1beta

Profil composite de codage local : Qwen3.5 4B dans Ollama, un contrôleur FlyBrain entraîné et les outils du moteur FlyCoder.

## Fichiers publiés

- [`Modelfile`](Modelfile) : modèle de base, instructions et paramètres Ollama.
- [`flycoder0.1beta.json`](flycoder0.1beta.json) : identité et architecture du profil.
- [`controller-v1.json`](controller-v1.json) : checkpoint des poids du contrôleur de routage.
- [`../core/`](../core/) : moteur de codage, outils fichiers, tests, mémoire et application des propositions.

Les poids Qwen3.5 ne sont pas modifiés par cette beta. Ils sont téléchargés depuis Ollama et partagés avec le modèle de base, sans copie binaire dans Git. Les journaux, conversations et apprentissages propres à chaque projet restent dans `.flycoder/`, ignoré par Git.

## Installer depuis le dépôt

Avec Node.js 22 ou ultérieur et Ollama démarré, depuis la racine du dépôt :

```sh
npm ci
npm run flycoder:install
npm run flycoder -- doctor
npm start
```

L’installation récupère `qwen3.5:4b` (environ 3,4 Go), crée `flycoder0.1beta` et copie le checkpoint du contrôleur dans `.flycoder/brain.json` si ce fichier n’existe pas. L’interface est disponible sur `http://127.0.0.1:4317`.

Pour créer seulement le profil Ollama à partir de sa définition :

```sh
ollama pull qwen3.5:4b
ollama create flycoder0.1beta -f flycoder/models/Modelfile
```

`ollama run flycoder0.1beta` ouvre une conversation avec le modèle. Pour utiliser les outils de codage et le contrôleur, lancez FlyCoder :

```sh
npm run flycoder -- run "Corrige cette fonction et lance les tests" --workspace /chemin/du/projet
```

Les commandes de test se configurent dans `.flycoder.json`. Le [guide complet](../../docs/FLYCODER.md) décrit la sandbox macOS, les autres plateformes, la revue et l’application des propositions. Les [résultats enregistrés](../../docs/flycoder-evaluation.json) portent sur de petits exercices, sans garantie de performance générale.
