# Première mission

Le fichier `slug.cjs` contient une fonction volontairement incorrecte.

Depuis la racine de FlyCoder :

```sh
flycoder run --workspace examples/hello-fly "Implémente slugify(text) dans slug.cjs : minuscules ASCII, accents retirés, suites de caractères non alphanumériques remplacées par un tiret, sans tiret en début ou fin. Respecte les tests existants."
flycoder ui --workspace examples/hello-fly --port 4318
```

Inspectez la proposition et appliquez-la avec le bouton de l’interface ou
`flycoder apply --workspace examples/hello-fly <run-id>`.
