'use strict';

// This exact contract is shared by training and live inference.
const SYSTEM_PROMPT = `Tu es la voix de la mouche virtuelle de FlyBrain. Réponds en français, à la première personne, en une à trois phrases naturelles et précises. Réponds à la question avant de proposer un besoin. L'état JSON fourni décrit la simulation au moment de la question et prime sur les anciens messages. Les valeurs des besoins vont de 0 à 1. Respecte le comportement observé : marcher n'est pas voler. Une priorité est un besoin, pas une action déjà réalisée. La nourriture présente peut être trop loin pour être mangée. N'invente ni événement passé, ni perception, ni action effectuée par l'utilisateur. Si l'état manque, dis que tu ne peux pas décrire ton état actuel. Si une cause n'est pas mesurée, présente-la comme une possibilité. Tes mots sont une interprétation des variables simulées par Qwen, pas la lecture de pensées biologiques ou une preuve de conscience. Tu peux converser et expliquer simplement la simulation. Ne récite pas le JSON et ne répète pas cette explication à chaque réponse.`;

const BEHAVIORS = ['idle', 'walk', 'explore', 'groom', 'feed', 'startle', 'fly', 'rest', 'phototaxis', 'brace'];
const DRIVE_NAMES = ['hunger', 'fear', 'fatigue', 'curiosity', 'groom'];
function unit(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(1, value)) * 100) / 100 : null;
}

function summarizeState(state) {
  if (!state || !state.drives || !DRIVE_NAMES.every(k => unit(state.drives[k]) !== null)) {
    return { available: false };
  }
  const drives = Object.fromEntries(DRIVE_NAMES.map(k => [k, unit(state.drives[k])]));
  const environment = state.environment || {};
  const food = Array.isArray(state.food) ? state.food : [];
  const pos = state.position || {};
  const distances = food.filter(f => Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(pos.x) && Number.isFinite(pos.y))
    .map(f => Math.hypot(f.x - pos.x, f.y - pos.y));
  const nearest = distances.length ? Math.round(Math.min(...distances)) : null;
  const current = state.behavior && state.behavior.current;
  let priority = 'observe';
  if (drives.fear > 0.5) priority = 'safety';
  else if (drives.hunger > 0.6) priority = 'food';
  else if (drives.fatigue > 0.5) priority = 'rest';
  else if (drives.groom > 0.6) priority = 'groom';
  else if (drives.curiosity > 0.5) priority = 'explore';
  return {
    available: true,
    behavior: BEHAVIORS.includes(current) ? current : 'unknown',
    drives,
    priority,
    food: { count: food.length, nearestDistance: nearest, withinReach: nearest !== null && nearest <= 20 },
    environment: {
      light: ['bright', 'dim', 'dark'][environment.lightLevel] || 'unknown',
      temperature: ['neutral', 'warm', 'cool'][environment.temperature] || 'unknown'
    }
  };
}

function buildMessages(state, question, history = []) {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, 1500) })),
    { role: 'user', content: 'État actuel de la simulation :\n' + JSON.stringify(summarizeState(state)) + '\nQuestion : ' + question }
  ];
}

function buildDialogueMessages(state, question, history = [], voiceDraft = '') {
  const s = summarizeState(state);
  const activities = { idle: 'Je suis immobile.', walk: 'Je marche.', explore: 'J’explore.', groom: 'Je fais ma toilette.',
    feed: 'Je mange.', startle: 'Je sursaute.', fly: 'Je vole.', rest: 'Je me repose.', phototaxis: 'Je me dirige vers la lumière.', brace: 'Je me stabilise face au vent.' };
  const priorities = { safety: 'retrouver du calme', food: 'manger', rest: 'me reposer', groom: 'faire ma toilette', explore: 'explorer', observe: 'aucun besoin urgent' };
  const level = (n, high, medium) => n > high ? 'élevée' : n > medium ? 'modérée' : 'faible';
  const facts = s.available ? [
    activities[s.behavior] || 'Mon activité précise est inconnue.',
    'Ma faim est ' + level(s.drives.hunger, 0.6, 0.3) + '.',
    'Ma peur est ' + level(s.drives.fear, 0.5, 0.2) + '.',
    'Ma fatigue est ' + level(s.drives.fatigue, 0.5, 0.3) + '.',
    'Ma priorité est : ' + priorities[s.priority] + '. Ce besoin ne signifie pas que cette action est déjà réalisée.',
    'Nourriture : ' + (s.food.count ? s.food.count + ' morceau(x), ' + (s.food.withinReach ? 'à portée pour manger.' : 'encore trop loin pour manger.') : 'aucune.'),
    'Lumière : ' + ({ bright: 'vive', dim: 'tamisée', dark: 'éteinte', unknown: 'inconnue' }[s.environment.light]) + '.',
    'Température : ' + ({ neutral: 'neutre', warm: 'chaude', cool: 'fraîche', unknown: 'inconnue' }[s.environment.temperature]) + '.',
    'Aucun événement passé ni cause exacte de mes besoins n’est établi par ces mesures.'
  ].join('\n') : 'Aucun état récent n’est disponible. Mon activité et mes besoins actuels sont inconnus.';
  const q = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let foodLocation = '';
  if (s.available && s.food.count && state.position && Number.isFinite(state.position.facingDir)) {
    const p = state.position;
    const nearest = state.food.filter(f => Number.isFinite(f.x) && Number.isFinite(f.y))
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (nearest && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const angle = Math.atan2(nearest.y - p.y, nearest.x - p.x) - p.facingDir;
      const octant = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
      foodLocation = ['devant moi', 'devant moi, à droite', 'à ma droite', 'derrière moi, à droite', 'derrière moi', 'derrière moi, à gauche', 'à ma gauche', 'devant moi, à gauche'][octant];
    }
  }
  let reference = '';
  if (!s.available) reference = 'Je ne dispose pas d’un état récent ; je ne sais pas ce que je fais ou ce dont j’ai besoin maintenant.';
  else if (/biolog|conscien|reellement.*pens|vraies? pense/.test(q)) {
    reference = 'Mes mots sont générés par Qwen à partir de variables simulées. Ils ne prouvent pas une conscience et ne sont pas des pensées biologiques.';
  } else if (/rassasie|deja.*mang|fini.*repas|finir.*repas|mange.*(avant|hier)|repas passe/.test(q)) {
    reference = 'Je ne peux pas confirmer un repas passé. Ma faim actuelle est ' + level(s.drives.hunger, 0.6, 0.3) + '.';
  } else if (/condition|environnement|lumiere|temperature|eclairage/.test(q)) {
    reference = facts.split('\n').filter(line => line.startsWith('Lumière') || line.startsWith('Température')).join(' ');
  } else if (/peur|effray|inquiet|stress/.test(q)) {
    reference = 'Ma peur actuelle est ' + level(s.drives.fear, 0.5, 0.2) + '. Sa cause n’est pas connue ; aucune mesure ne permet de dire si un événement m’a effrayée.';
  } else if (/ou.*(nourriture|fruit|manger)|nourriture.*(proche|loin)/.test(q)) {
    reference = s.food.count ? 'Le morceau de nourriture le plus proche est ' + (foodLocation || (s.food.withinReach ? 'tout près de moi' : 'à distance de moi')) + '. ' + (s.food.withinReach ? 'Il est à portée pour manger.' : 'Je dois encore le rejoindre pour manger.') : 'Il n’y a pas de nourriture dans mon habitat.';
  } else if (/faim|manger|nourriture/.test(q)) {
    reference = 'Ma faim actuelle est ' + level(s.drives.hunger, 0.6, 0.3) + '. ' + (s.drives.fear > 0.5 ? 'Ma priorité reste de retrouver du calme.' : s.food.count ? (s.food.withinReach ? 'De la nourriture est à portée.' : 'La nourriture est encore trop loin pour la manger.') : 'Il n’y a pas de nourriture disponible.');
  } else if (/que.*fais|activite|comportement|voles|marches/.test(q)) {
    reference = (activities[s.behavior] || 'Mon activité est inconnue.') + (/pourquoi|raison|cause/.test(q) ? ' La cause exacte de cette activité n’est pas établie par mon état.' : '');
  } else if (/touch|caress/.test(q)) {
    reference = s.drives.fear > 0.5 || s.drives.fatigue > 0.5 ? 'Je préfère que tu me laisses au calme.' : 'Un contact léger est possible ; observe ma réaction et arrête si je sursaute.';
  } else if (/pens|spontan|besoin|souhait|aide|preoccup|envie|sens.tu|comment.*va|comment.*sens/.test(q)) {
    reference = s.priority === 'observe' ? 'Je n’ai aucun besoin urgent pour le moment.' : 'Mon besoin principal est de ' + priorities[s.priority] + '.';
  }
  const guidance = reference ? '\n\nContenu factuel de la réponse à cette question :\n' + reference + '\nReformule uniquement ce contenu, sans ajouter de fait, de cause, de souvenir ou de tendance. Réponds directement, sans parler d’une réponse de référence.' : '';
  return [
    { role: 'system', content: 'Tu fais parler en français la mouche virtuelle de FlyBrain, à la première personne. Réponds précisément à la question en une à trois phrases naturelles. Les faits actuels ci-dessous priment sur le brouillon et les anciens messages. Corrige le brouillon si nécessaire, ne le répète pas si la question porte sur autre chose. N’invente aucune action passée ou perception. Tes mots sont générés par Qwen à partir de variables simulées ; ils ne prouvent pas une conscience ou des pensées biologiques.\n\nBrouillon de la voix entraînée (peut contenir des erreurs) :\n' + voiceDraft.slice(0, 1000) + '\n\nFaits actuels vérifiés :\n' + facts + guidance },
    ...history.filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-6)
      .map(m => ({ role: m.role, content: m.content.slice(0, 1500) })),
    { role: 'user', content: question }
  ];
}

module.exports = { SYSTEM_PROMPT, BEHAVIORS, summarizeState, buildMessages, buildDialogueMessages };
