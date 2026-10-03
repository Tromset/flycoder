# Rulesets « propriétaire seul »

Deux rulesets GitHub qui réservent toute écriture dans le dépôt au rôle **Repository admin**. Sur un dépôt personnel, ce rôle n'appartient qu'au propriétaire (Tromset).

| Fichier | Cible | Effet pour tout autre acteur |
|---|---|---|
| `owner-only-branches.json` | toutes les branches | impossible de créer, pousser, fusionner une PR, supprimer ou forcer un push |
| `owner-only-tags.json` | tous les tags | impossible de créer, déplacer ou supprimer un tag, donc de publier une release sur un nouveau tag |

La règle `non_fast_forward` (blocage des force-push) double `update`. Elle reste en place au cas où `update` serait assoupli plus tard.

## Importer

1. **Settings > Rules > Rulesets > New ruleset > Import a ruleset**, puis choisir `owner-only-branches.json`, vérifier et cliquer **Create**.
2. Recommencer avec `owner-only-tags.json`.
3. Ouvrir chaque ruleset et vérifier deux choses : le statut est **Active**, et la **Bypass list** contient **Repository admin** réglé sur **Always allow**.
4. Tester : pousser une branche jetable, puis la supprimer.

Si l'import refuse l'acteur (« contains an invalid actor ») :

1. Retirer le bloc `bypass_actors` du fichier, puis réimporter.
2. Ajouter l'exception à la main : **Bypass list > Add bypass > Repository admin > Always allow > Save changes**.

Ne laissez jamais un ruleset actif sans cette exception. En cas de blocage, vous restez admin : **Settings > Rules > Rulesets**, puis passez le ruleset en **Disabled**.

Quand vous fusionnez votre propre PR, GitHub peut proposer « Merge without waiting for requirements to be met (bypass rules) ». Cochez la case : c'est votre exception qui s'applique.

## Ce qui sera aussi bloqué

Les rulesets bloquent tout acteur qui n'est pas dans la liste d'exceptions, y compris les automatismes :

- **Claude (Claude Code)**, qui pousse les branches `claude-code/*` et ouvre des PR. Selon le jeton qu'il utilise (celui de l'application ou le vôtre), il sera peut-être bloqué. Pour le garder : **Bypass list > Add bypass**, chercher « Claude », sélectionner l'application, puis **Always allow**. Testez ensuite une poussée de Claude.
- **GitHub Actions** pour les workflows qui poussent ou créent des tags avec `GITHUB_TOKEN`. Aucun workflow du dépôt ne le fait aujourd'hui.
- **Dependabot** et les **deploy keys** en écriture. Vous pouvez les ajouter à la liste d'exceptions si vous en avez besoin.

## Ce qu'un ruleset ne peut pas empêcher

Un ruleset ne limite que ceux qui ont déjà un accès en écriture. Vous êtes aujourd'hui le seul collaborateur. Comme le dépôt est public, les réglages suivants complètent la protection :

- **Collaborateurs** (Settings > Collaborators) : n'y ajoutez personne.
- **Pull requests** (Settings > General > Features > Pull requests) : réglez la création sur **Collaborators only**. Ne décochez pas complètement les PR : cela masquerait aussi les vôtres et celles de Claude. Après ce réglage, vérifiez que Claude peut encore ouvrir une PR.
- **Issues** (Settings > General > Features > Issues) : réglez la création sur **Collaborators only**, ou désactivez les issues.
- **Wiki** : cochez « Restrict editing to collaborators only », ou désactivez le wiki s'il ne sert pas. Désactivez aussi **Projects** si vous ne l'utilisez pas.
- **Commentaires et réactions** (Settings > Moderation options > Interaction limits) : choisissez **Limit to repository collaborators**. La limite dure 6 mois au maximum, il faudra la renouveler.
- **Actions et forks** (Settings > Actions > General) : choisissez **Require approval for all external contributors** pour les workflows des PR venant de forks. N'utilisez pas de workflow `pull_request_target`.
- **Lecture, clonage et fork** : impossibles à bloquer sur un dépôt public. Le seul moyen est de passer le dépôt en privé (Settings > General > Danger Zone > Change visibility). Dans ce cas, les forks existants restent publics, les étoiles sont perdues, et sur GitHub Free les rulesets d'un dépôt privé demandent GitHub Pro.

Sources : [rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets), [API des rulesets](https://docs.github.com/en/rest/repos/rules?apiVersion=2022-11-28#create-a-repository-ruleset), [exceptions](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository#granting-bypass-permissions-for-your-branch-or-tag-ruleset), [limites d'interaction](https://docs.github.com/en/communities/moderating-comments-and-conversations/limiting-interactions-in-your-repository), [accès aux PR](https://github.blog/changelog/2026-02-13-new-repository-settings-for-configuring-pull-request-access/).
