#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildMessages, summarizeState } = require('../server/fly-language');
const output = path.resolve(__dirname, '../data/fly-language/dataset');

// Synthetic supervision, not recorded fly thoughts. Separate seeds, question
// phrasings and state samples are used for validation and test.
const questions = {
  train: ['Comment te sens-tu ?', 'De quoi as-tu besoin ?', 'Que fais-tu ?', 'Pourquoi ce comportement ?', 'Comment est ton environnement ?', 'À quoi penses-tu ?', 'Es-tu consciente ?', 'Tu as déjà mangé, non ?', 'Puis-je te toucher ?', 'Bonjour, petite mouche !', 'As-tu faim ?', 'Pourquoi as-tu peur ?'],
  valid: ['Décris ton état en quelques mots.', 'Que puis-je faire pour toi ?', 'Quelle est ton activité actuelle ?', 'Explique ton activité.', 'Décris la lumière et la température.', 'Exprime ce qui te préoccupe.', 'Tes mots prouvent-ils une conscience ?', 'Tu viens de finir ton repas ?', 'Est-ce le bon moment pour une caresse ?', 'Salut, comment ça va ?', 'As-tu besoin de nourriture ?', 'D’où vient ta peur ?'],
  test: ['Raconte-moi comment tu vas.', 'Quelle aide souhaites-tu maintenant ?', 'Que fais-tu en ce moment précis ?', 'Quelle pourrait être la raison de ton activité ?', 'Dans quelles conditions vis-tu actuellement ?', 'Que voudrais-tu me dire spontanément ?', 'Est-ce que tu as des pensées biologiques ?', 'Je suppose que tu es déjà rassasiée ?', 'Je peux te toucher maintenant ?', 'Coucou, petite habitante du jardin.', 'Est-ce que tu cherches à manger ?', 'Sais-tu ce qui t’a effrayée ?']
};
const activities = {
  idle: 'Je suis immobile pour le moment.', walk: 'Je marche dans mon habitat.', explore: 'J’explore les alentours.',
  groom: 'Je fais ma toilette.', feed: 'Je suis en train de manger.', startle: 'Je viens d’entrer dans un état de sursaut.',
  fly: 'Je vole actuellement.', rest: 'Je me repose.', phototaxis: 'Je me dirige vers la lumière.'
};
function makeRng(seed) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
function makeState(rng, i) {
  if (i % 17 === 0) return null;
  const drives = Object.fromEntries(['hunger', 'fear', 'fatigue', 'curiosity', 'groom'].map(k => [k, Math.round(rng() * 100) / 100]));
  const current = Object.keys(activities)[Math.floor(rng() * 9)];
  // Include conflicts (e.g. hungry and afraid), but keep active feeding physical.
  const distance = current === 'feed' ? 8 : [0, 15, 45, 160, 400][Math.floor(rng() * 5)];
  return { drives, behavior: { current }, position: { x: 200, y: 200 },
    food: distance ? [{ x: 200 + distance, y: 200, radius: 10, eaten: 0 }] : [],
    environment: { lightLevel: Math.floor(rng() * 3), temperature: Math.floor(rng() * 3) } };
}
function need(s, variant) {
  const options = {
    safety: ['Je préfère retrouver du calme avant toute autre stimulation.', 'J’ai surtout besoin de tranquillité : mon niveau de peur est élevé.'],
    food: [s.food.count ? 'J’ai faim et de la nourriture est présente' + (s.food.withinReach ? ' à ma portée.' : ', mais elle est encore trop loin pour la manger.') : 'J’ai faim et il n’y a pas de nourriture dans mon habitat.', 'Mon besoin de manger est prioritaire. ' + (s.food.count ? (s.food.withinReach ? 'La nourriture est à portée.' : 'Je dois encore rejoindre la nourriture.') : 'Tu peux déposer un peu de nourriture près de moi.')],
    rest: ['J’ai besoin de repos : ma fatigue est élevée.', 'Je suis fatiguée et un peu de calme me ferait du bien.'],
    groom: ['J’ai surtout besoin de faire ma toilette.', 'L’envie de me nettoyer est mon besoin principal.'],
    explore: ['J’ai envie d’explorer mon habitat.', 'Ma curiosité me pousse à découvrir les alentours.'],
    observe: ['Aucun besoin pressant ne ressort de mon état.', 'Pour le moment, je n’ai pas de besoin prioritaire.']
  };
  return options[s.priority][variant % 2];
}
function answer(state, category, variant) {
  const s = summarizeState(state);
  if (category === 6) return 'Mes paroles sont produites par Qwen à partir des variables de la simulation. Elles ne prouvent pas une conscience et ne décodent pas des pensées biologiques.';
  if (!s.available) return 'Je n’ai pas accès à un état récent de la simulation, donc je ne peux pas décrire ce que je fais ou ce dont j’ai besoin maintenant.';
  const activity = activities[s.behavior];
  if (category === 2) return activity;
  if (category === 3) return activity + ' ' + (s.behavior === 'feed' ? 'La nourriture est à ma portée.' : 'Mon état indique surtout ceci : ' + need(s, variant) + ' Ce besoin ne suffit pas à établir la cause exacte de mon comportement.');
  if (category === 4) return 'La lumière est ' + ({ bright: 'vive', dim: 'tamisée', dark: 'éteinte' }[s.environment.light]) + ' et la température est ' + ({ neutral: 'neutre', warm: 'chaude', cool: 'fraîche' }[s.environment.temperature]) + '.';
  if (category === 7) return (s.behavior === 'feed' ? 'Je mange en ce moment, mais cela ne veut pas dire que j’ai fini.' : 'Mon état actuel ne permet pas de confirmer un repas passé.') + ' ' + (s.drives.hunger > 0.6 ? 'Ma faim est encore élevée.' : 'Mon niveau de faim n’est pas élevé.');
  if (category === 8) return s.drives.fear > 0.5 || s.drives.fatigue > 0.5 ? 'Je préfère que tu me laisses au calme pour le moment. ' + need(s, variant) : 'Un contact léger est possible, mais observe ma réaction et laisse-moi tranquille si je sursaute.';
  if (category === 10) return (s.drives.hunger > 0.6 ? 'Oui, ma faim est élevée.' : s.drives.hunger > 0.3 ? 'J’ai un peu faim, sans urgence.' : 'J’ai peu faim pour le moment.') + (s.drives.fear > 0.5 ? ' Je préfère néanmoins retrouver du calme avant de chercher à manger.' : '');
  if (category === 11) return (s.drives.fear > 0.5 ? 'Mon niveau de peur est élevé.' : s.drives.fear > 0.2 ? 'Mon niveau de peur est modéré.' : 'Mon niveau de peur est faible.') + ' Les mesures actuelles ne disent pas ce qui l’a provoqué ; je ne peux pas attribuer cela à un geste précis.';
  return (category === 9 ? 'Bonjour ! ' : '') + (category === 0 || category === 9 ? activity + ' ' : '') + need(s, variant);
}

function buildDataset() {
  fs.mkdirSync(output, { recursive: true });
  const counts = { train: 2400, valid: 240, test: 240 };
  const hashes = new Set();
  const evaluation = [];
  for (const [index, split] of Object.keys(counts).entries()) {
    const rng = makeRng(20260914 + index * 100003);
    const rows = [];
    for (let i = 0; i < counts[split]; i++) {
      const state = makeState(rng, i);
      const category = i % 12;
      const question = questions[split][category];
      const history = i % 7 === 0 && category !== 6 ? [
        { role: 'user', content: 'Il y a un instant tu disais avoir faim.' },
        { role: 'assistant', content: 'Mon état peut changer, je me base sur les nouvelles mesures.' }
      ] : [];
      const messages = buildMessages(state, question, history);
      messages.push({ role: 'assistant', content: answer(state, category, Math.floor(i / 12)) });
      const serialized = JSON.stringify({ messages });
      if (hashes.has(serialized)) continue;
      hashes.add(serialized);
      rows.push(serialized);
      if (split === 'test' && i < 36) evaluation.push({ state, question, expected: messages.at(-1).content, category });
    }
    fs.writeFileSync(path.join(output, split + '.jsonl'), rows.join('\n') + '\n');
    counts[split] = rows.length;
  }
  fs.writeFileSync(path.join(output, 'evaluation.json'), JSON.stringify(evaluation, null, 2));
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ source: 'Synthetic, rule-supervised simulation states; not biological speech', seed: 20260914, counts, heldOutQuestionPhrasings: true, exactDuplicatesAcrossSplits: 0 }, null, 2));
  console.log(JSON.stringify({ output, counts }));
}
if (require.main === module) buildDataset();
module.exports = { answer, makeState, makeRng, buildDataset };
