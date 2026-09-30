# FlyCoder 0.1 beta — design et contrat

## Produit

Un atelier local pour confier une tâche de code à Qwen3.5, suivre les agents,
inspecter le résultat des tests et enseigner au contrôleur avec ces résultats.
Le terrarium FlyBrain existant reste accessible séparément.

## Direction visuelle

Base graphite #181d24, surfaces ardoise #222a34, texte nuage #e9eef5,
secondaire #a7b2c1, ailes bleu glacier #a7d8eb, accent pollen #edc76a.
Police système pour les commandes et la conversation, monospace pour le code.
La mouche voxel, aux yeux ambrés, est le seul élément expressif majeur.
Le rythme à trois colonnes de Sunflower est conservé : navigation et projet,
travail/conversation, état et mouche. Les vues Cerveau, Agents et Apprentissage
partagent cette structure. Les petits écrans replient le panneau latéral.

```
FlyCoder / projet                         Qwen local
Navigation | Travail, diff ou cerveau     | Mouche 3D
           |                             | État réel
           | Demande + lancer / arrêter   | Derniers tests
```

Pas de chiffres de démonstration présentés comme mesures, pas de réseau
neuronal décoratif. Les couleurs, liens et activations de la carte viennent
du contrôleur exécuté. La réduction du mouvement est respectée.

## Architecture

- CLI Ink dérivé des sources Ollama-Code référencées dans THIRD_PARTY.md.
- Même harness partagé par CLI, serveur local et enveloppe Electron.
- Qwen3.5 via Ollama ; flycoder0.1beta est un profil de ce modèle, pas de
  nouveaux poids de fondation. Le contrôleur apprend séparément.
- Circuits fonctionnels FlyBrain réutilisés et projection sparse de type
  Kenyon ; tête de routage entraînée par récompense mesurée.
- Outils indépendants du langage ; vérificateurs argv configurables.
- Travail dans une copie isolée, contrôle de fichiers, vérification bornée,
  comparaison des modifications et application avec contrôle de conflits.
- Messages FlyLink JSON compacts, versionnés et réversibles. Le gain de taille
  est mesuré en octets ; aucun gain de tokens n'est supposé.
- Mémoire récupérée et historique compacté : extension de mémoire de travail,
  sans changement de la fenêtre native de Qwen. Latences et tokens mesurés.

## Ce qui est observable

La carte représente les vraies unités numériques du contrôleur en cours,
avec leurs poids et activations. Les groupes FlyBrain sont des abstractions
fonctionnelles, pas les neurones individuels du connectome FlyWire.
Ollama ne fournit pas les activations internes de Qwen. Aucun cerveau vivant
n'est présent. Ni supériorité en SWE, ni accélération ne sont présupposées.
