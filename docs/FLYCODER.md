# FlyCoder 0.1 beta

FlyCoder associe Qwen3.5, un contrôleur numérique inspiré de FlyBrain et un environnement de travail vérifiable. Le CLI et l’interface Electron utilisent le même moteur. L’ancien terrarium FlyBrain et ses tests sont conservés.

## Démarrage

```sh
npm install
npm link
flycoder install
flycoder doctor
flycoder                   # CLI interactif, dans le projet courant
flycoder ui                # atelier sur http://127.0.0.1:4317
npm run desktop            # application Electron, menu Projet → Ouvrir un dossier
```

Node 22 ou ultérieur et Ollama sont nécessaires. Node 26 et Electron 41 ont été vérifiés sur ce Mac Apple Silicon de 16 Go. `flycoder install` télécharge Qwen3.5 4B (environ 3,4 Go), crée le profil Ollama `flycoder0.1beta`, puis installe le checkpoint du contrôleur dans le projet s’il n’en possède pas déjà un. Les poids Qwen sont partagés par Ollama : le profil ne crée pas une seconde copie de 3,4 Go.

```sh
flycoder run "Explore l’architecture" --mode plan --workspace /chemin/du/projet
flycoder run "Corrige le parseur et vérifie les tests" --workspace /chemin/du/projet
flycoder apply <run-id> --workspace /chemin/du/projet
```

`flycoder init` prépare `.flycoder.json`. Les modifications sont produites dans `.flycoder/runs/<id>/workspace`. Le bouton **Appliquer les fichiers** ou `flycoder apply` les reporte dans le projet après comparaison des empreintes de tous les fichiers concernés. Toute modification concurrente bloque l’application entière. Les exercices d’entraînement ne peuvent pas être appliqués à un autre projet.

Le [premier exercice](../examples/hello-fly/README.md) permet de tester la boucle sur une fonction volontairement incorrecte, sans toucher à votre code.

## Vérificateurs et langages

Les outils manipulent des fichiers UTF-8 et des vérificateurs configurables, sans sélection fermée de langages. L’agent ne dispose pas d’un shell arbitraire. Vous définissez les commandes sous forme de tableaux d’arguments :

```json
{
  "model": "flycoder0.1beta",
  "numCtx": 16384,
  "maxTurns": 16,
  "maxTokens": 2048,
  "timeoutMs": 180000,
  "execution": "sandbox",
  "team": true,
  "checks": {
    "test": ["node", "--test"],
    "types": ["node_modules/.bin/tsc", "--noEmit"]
  }
}
```

Les checks sont exécutés dans l’ordre déclaré. Ils peuvent appeler `python3 -m unittest`, `go test ./...`, `cargo test`, un compilateur C/C++, Java, Ruby ou votre propre vérificateur. Chaque chaîne reste un argument ; `&&`, redirections et expansions shell ne sont pas interprétés. Pour une chaîne de compilation, utilisez plusieurs checks nommés ou un script déjà présent dans le projet. Les compilateurs et dépendances doivent être installés. Le harness a été vérifié avec JavaScript, Python, TypeScript et C ; cela ne prouve pas la compétence du modèle dans tous les langages.

Sur macOS, les vérificateurs sont exécutés avec `sandbox-exec` : réseau refusé, lecture des fichiers privés hors projet refusée, écriture limitée à la copie de travail et au répertoire temporaire propre au check. `node_modules` et `.venv` existants sont partagés en lecture seule. Les programmes système et le runtime Node peuvent être lus. Certains toolchains sous le dossier personnel nécessitent des chemins supplémentaires explicitement configurés dans `verifierReadPaths`. Ce sandbox est spécifique à macOS. Ailleurs, utilisez un environnement jetable ou choisissez explicitement `--trusted` / `"execution":"trusted"`, qui exécute du code avec les droits de votre compte.

Les sorties sont plafonnées à 20 000 caractères et les vérificateurs à 60 secondes. L’annulation tue le groupe de processus. La copie est limitée à 3 000 fichiers / 64 Mio ; les fichiers de plus de 2 Mio, dossiers de build, données, caches et secrets courants sont exclus. Les lectures de fichiers sont limitées à 1 Mio, les écritures à 200 Kio. La beta crée et modifie des fichiers ; elle ne propose pas de suppression ou de renommage.

## Récompenses et apprentissage

```text
Mission → encodage sparse → circuits FlyBrain + tête de routage
                                  ↓
              inspect / test_first / direct
                                  ↓
      Architecte → Codeur → Relecteur → Vérificateurs fixes
                         ↑                     ↓
                         └──── feedback ───────┘
                                  ↓
                     poids du routage + mémoire
```

Le contrôleur réutilise les 59 groupes et 230 connexions fonctionnelles de FlyBrain, figés dans `flycoder/models/flybrain-graph.json`. L’état du réseau est propagé et module les scores des stratégies. Une projection déterministe du texte active au plus huit unités parmi 64 unités de type Kenyon. Trois unités de sortie choisissent une stratégie ; leurs 192 poids et trois biais sont ajustés par gradient de politique avec baseline. L’exploration des exercices fait tourner les trois stratégies. `direct` évite l’appel architecte ; `test_first` mesure les erreurs initiales ; `inspect` invite à lire avant de modifier.

Une vérification indépendante repasse tous les checks après la dernière édition. Tous passent : +1. Un échec après au plus deux cycles de correction : −1. Sans check : statut **À vérifier**, aucune récompense automatique. Une erreur de transport ou un abandon ne devient pas une réussite. Un feedback humain unique par mission produit un signal distinct de ±0,25. Les expériences ayant reçu une récompense positive peuvent être récupérées par similarité de l’encodage sparse.

```sh
flycoder train       # 4 exercices : somme, unicité, clamp, palindrome
flycoder evaluate    # 2 exercices séparés : factorielle, découpage en blocs
```

Le checkpoint est dans `.flycoder/brain.json`, la mémoire dans `.flycoder/memory.json`. Les assertions des exercices sont écrites avant la génération et leur intégrité est contrôlée. Les tâches de validation sont séparées de l’entraînement et leurs récompenses ne mettent à jour ni le checkpoint de production ni sa mémoire. Le [parcours des trois agents](flycoder-team-verification.json) a aussi été exécuté sur une fonction de salutation : code et vérification réussis, avis du relecteur limité par son budget et explicitement signalé.

Les tests restent visibles au modèle : il ne s’agit pas d’une évaluation à tests cachés. Les vérifications choisies déterminent la qualité du signal et ne garantissent pas une absence de bugs ou de contournement des tests.

Les [résultats locaux enregistrés](flycoder-evaluation.json) contiennent 4/4 exercices d’entraînement et 2/2 exercices de validation réussis. Le premier pilote faisait 3/4 avant amélioration des erreurs de chemins. Ce petit corpus démontre une boucle exécutable, pas une amélioration générale de la performance SWE. Un essai plus exigeant de normalisation des accents dans un slug a atteint la limite de 16 tours sans correction satisfaisante ; il reste enregistré comme erreur, sans récompense positive.

## Agents, contexte et vitesse

Les agents Architecte, Codeur et Relecteur utilisent des contextes Qwen distincts. Ils sont séquentiels pour limiter la mémoire et les conflits sur ce Mac ; il ne s’agit pas de trois modèles chargés en parallèle. L’architecte et le relecteur lisent seulement ; le codeur peut éditer la copie et demander des checks. Un agent consultatif qui atteint son budget renvoie ses observations avec un avertissement. Son avis n’est pas présenté comme achevé. Les tests finaux restent obligatoires pour obtenir une récompense.

FlyLink transporte `[1, séquence, source, destination, type, contenu]`. Le bouton **Transcrire les échanges** affiche le contenu du même paquet en français lisible, sans nouvel appel au modèle. Le protocole est réversible ; il réduit les noms de champs mais n’est pas un « langage optimal pour les IA ». L’interface mesure les octets face au JSON développé. Elle ne confond pas ce chiffre avec des tokens économisés.

La mémoire récupérée et l’archivage d’anciens groupes assistant/outils permettent de poursuivre une tâche avec un budget borné. Le compacteur conserve la demande originale, le système et les groupes d’outils complets les plus récents. Il utilise un budget conservateur en octets, distinct des comptes de tokens réels fournis par Ollama. Les fichiers peuvent être relus. Cette mémoire est sélective et peut perdre des détails : elle n’augmente pas la fenêtre native de Qwen. Chaque appel transmet explicitement `num_ctx` et journalise temps, tokens d’entrée/sortie et débit. Aucun gain de vitesse n’est revendiqué sans comparaison contrôlée.

## La carte du contrôleur

La carte affiche les 126 unités numériques et 422 connexions effectivement utilisées par le contrôleur, avec leur activation, poids, biais et possibilité d’inspection au clic ou au clavier. Les positions sont une mise en page fonctionnelle, pas des coordonnées anatomiques. Les groupes d’origine sont les abstractions du simulateur FlyBrain ; ils ne sont pas les 139 255 neurones individuels FlyWire. Les données binaires complètes FlyWire ne sont pas présentes dans ce checkout. Ollama n’expose pas les activations internes de Qwen à cette interface.

## Ce qu’est le modèle beta

`flycoder0.1beta` est un **profil composite Qwen3.5 + contrôleur + mémoire + outils**, décrit dans `flycoder/models/flycoder0.1beta.json`. Le checkpoint entraîné livré ne contient que les poids du contrôleur. Il n’y a ni fusion de poids Qwen/FlyWire, ni nouveau modèle de fondation, ni cerveau vivant, ni fine-tuning Qwen dans cette beta. Les fichiers d’entraînement de la voix Qwen2.5 de l’ancien terrarium restent séparés.

## Validation et provenance

```sh
npm test                 # simulation existante + harness
npm run test:cli         # TypeScript du CLI dérivé d’Ollama-Code
flycoder doctor
```

Depuis le retrait de la simulation, `npm test` exécute 20 vérifications : 18 du harness (dont 3 réservées à la sandbox macOS) et 2 du jeu de données de la voix Qwen 2.5 conservé. `npm run test:cli` contrôle le TypeScript du CLI. Les tests couvrent les contrats d’outils, les récompenses, la persistance des poids, les limites de contexte, les modes en lecture seule, l’intégrité des tests, les chemins et liens symboliques, les dépendances en lecture seule, les timeouts, l’annulation, les conflits d’application et les protections HTTP du serveur local. L’interface a été inspectée dans le navigateur en desktop et à 390 px, puis dans Electron.

Le serveur écoute uniquement sur `127.0.0.1`, vérifie Host et Origin et exige un jeton pour les mutations. Il ne sert pas le dépôt comme répertoire statique. Les données restent locales avec la configuration par défaut ; un `host` distant ou un modèle cloud choisi explicitement change cette propriété.

Le CLI est dérivé des sources Ollama-Code, et les conventions d’interface et de délégation s’inspirent de Sunflower et Hermes. Les commits exacts et les conditions de réutilisation sont dans [THIRD_PARTY.md](THIRD_PARTY.md).
