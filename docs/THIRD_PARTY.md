# Provenance

- [Ollama-Code](https://github.com/Tromset/Ollama-Code/tree/1f532710c031c75176eefd15c984f05441a3642d), commit `1f532710c031c75176eefd15c984f05441a3642d`.
- [SunFlowerAssistant](https://github.com/Tromset/SunFlowerAssistant/tree/b88c7fea96c0542e8595e0e215f10791b8ec1804), commit `b88c7fea96c0542e8595e0e215f10791b8ec1804`.
- [Hermes-Agent](https://github.com/NousResearch/hermes-agent/tree/7c6f21a5e12ba9b1c674ec9b410fa6b8c45de4f8), commit `7c6f21a5e12ba9b1c674ec9b410fa6b8c45de4f8`.

`flycoder/cli/src` est dérivé du CLI Ollama-Code, puis adapté au moteur FlyCoder, à son identité et à son stockage. Le dépôt amont consulté ne contient pas de fichier de licence ; ne pas présumer de droits de redistribution au-delà de cette adaptation locale.

Sunflower inspire la séparation projet / conversation / résultats et les états de la mascotte. Hermes inspire les rôles spécialisés, la délégation bornée et la mémoire persistante. Leur code ne fait pas partie du moteur.

Le graphe fonctionnel du contrôleur (`flycoder/models/flybrain-graph.json`) a été figé à partir des fichiers `js/constants.js` et `js/connectome.js` de l’ancienne simulation FlyBrain de ce dépôt (licence MIT existante), retirée depuis.
