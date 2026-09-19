'use strict';
const { MODULES, validateCommand } = require('../js/brain-harness');
const { summarizeState } = require('./fly-language');

const SYSTEM_PROMPT = `Tu es Qwen 2.5, le contrôleur du corps de la mouche virtuelle FlyBrain. Choisis la prochaine action à partir des perceptions, des besoins, de l'activité des régions cérébrales et du résultat précédent. Respecte l'objectif de l'utilisateur. Le cerveau sert de harness : les modules activent ses projections motrices simulées, puis les pattes, ailes, tête et trompe. Tu décides du comportement, du cap, de la vitesse et de l'altitude ; les anciens réflexes de sélection ne prennent pas le contrôle.
Modules : walk (marcher via DN_WALK/VNC_CPG), turn (pivoter sur place via DN_TURN), fly (voler via DN_FLIGHT), land (atterrir sur place), stop (s'arrêter et se poser), rest (repos), feed (manger via SEZ_FEED, seulement au contact), groom (toilette via SEZ_GROOM).
Les coordonnées x vont vers la droite et y vers le bas. heading est un cap ABSOLU en radians dans [-3.141592653589793,3.141592653589793] : 0=droite, 1.5708=haut, -1.5708=bas. Les caps des cibles sont déjà calculés. speed est dans [0,1], et vaut 0 sauf pour walk/fly. À vitesse maximale, walk parcourt environ 44 unités/seconde et fly 150. altitude est en unités 3D : 0 sauf pour fly où elle est dans [0.5,3]. durationMs est un entier de 500 à 8000, adapté à la distance (éviter de dépasser une cible). Les commandes sont renouvelées ; la durée est un maximum d'exécution, pas une promesse de réalisation. Une rotation courte précède la marche si la cible est derrière toi. Les obstacles et limites sont solides. Pour atterrir, choisir du terrain libre ; landing_blocked signifie qu'il faut se déplacer avant de se poser. food_out_of_reach signifie qu'il faut marcher vers la nourriture avant feed. Prioriser la nourriture si la faim est élevée et le repos si la fatigue est élevée, sauf objectif explicite différent. Utiliser le retour d'action pour corriger une absence de progrès. Aucun événement ancien non fourni n'est connu.
Pour rejoindre une nourriture, recopie son champ heading EXACTEMENT, sans le recalculer ni le convertir en degrés. Par exemple, food=[{"x":390,"y":300,"distance":90,"heading":0}] impose heading=0 pour marcher vers cette nourriture. Une cible avec heading=1.570796 est vers le haut ; une cible avec heading=-1.570796 est vers le bas. Si l'objectif donne un cap explicite, recopie ce cap. Justifie par l'objectif ou les mesures ; n'invente pas de besoin élevé.
Réponds UNIQUEMENT par un objet JSON avec exactement ces champs : {"module":"walk","heading":0,"speed":0.5,"altitude":0,"durationMs":4000,"reason":"Courte justification en français"}. reason a au plus 160 caractères. Aucun Markdown, aucune commande système, aucune modification de l'environnement, aucun dialogue.`;

const finite = (value, fallback = 0) => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : fallback;
const heading = value => Math.trunc(Math.atan2(Math.sin(value), Math.cos(value)) * 1000000) / 1000000;
function buildObservation(state) {
    const summary = summarizeState(state);
    const p = state?.position;
    if (!summary.available || !p || !['x', 'y', 'facingDir', 'altitude'].every(key => Number.isFinite(p[key]))) return null;
    const target = item => ({ x: finite(item.x), y: finite(item.y),
        distance: finite(Math.hypot(item.x - p.x, item.y - p.y)), heading: heading(Math.atan2(p.y - item.y, item.x - p.x)) });
    const sensory = state.sensory || {};
    const brain = {};
    for (const region of ['sensory', 'central', 'drives', 'motor']) {
        brain[region] = Object.fromEntries(Object.entries(state.brain?.[region] || {})
            .filter(([key, value]) => /^[A-Z][A-Z0-9_]{1,30}$/.test(key) && Number.isFinite(value))
            .slice(0, 24).map(([key, value]) => [key, finite(Math.max(0, Math.min(100, value)))]));
    }
    const bounds = state.environment?.bounds;
    if (!bounds || !['left', 'right', 'top', 'bottom'].every(key => Number.isFinite(bounds[key]))) return null;
    const last = state.control?.feedback || {};
    return {
        ...summary, position: { x: finite(p.x), y: finite(p.y), heading: heading(p.facingDir), altitude: finite(p.altitude), speed: finite(p.speed) },
        food: (state.food || []).filter(f => Number.isFinite(f.x) && Number.isFinite(f.y) && (!Number.isFinite(f.eaten) || f.eaten < 1))
            .map(target).sort((a, b) => a.distance - b.distance).slice(0, 6),
        sensory: { foodContact: sensory.foodContact === true, touch: sensory.touch === true, wind: sensory.wind === true,
            windStrength: finite(sensory.windStrength), windDirection: finite(sensory.windDirection), canLand: sensory.canLand !== false },
        bounds: Object.fromEntries(['left', 'right', 'top', 'bottom'].map(key => [key, finite(bounds[key])])),
        obstacles: (Array.isArray(state.obstacles) ? state.obstacles : [])
            .filter(o => ['x', 'y', 'radius', 'height'].every(key => Number.isFinite(o[key]))).map(o => ({ ...target(o), radius: finite(o.radius), height: finite(o.height) }))
            .sort((a, b) => a.distance - a.radius - (b.distance - b.radius)).slice(0, 6),
        brain,
        previousAction: { module: Object.hasOwn(MODULES, last.module) ? last.module : null,
            status: ['executing', 'expired', 'waiting', 'food_out_of_reach', 'landing_first', 'landing_blocked'].includes(last.status) ? last.status : null,
            distance: finite(last.distance), elapsedMs: finite(last.elapsedMs), remainingMs: finite(last.remainingMs) }
    };
}

async function generateCommand({ observation, goal, model, baseUrl, fetchImpl = fetch, signal }) {
    const messages = [{ role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify({ goal, observation }) }];
    // MLX does not constrain JSON decoding. One bounded repair turn gives the
    // model the validator's exact error; invalid output is never executed.
    for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await fetchImpl(baseUrl + '/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
            body: JSON.stringify({ model, temperature: 0, max_tokens: 180, stream: false, messages })
        });
        if (!response.ok) throw new Error('Qwen HTTP ' + response.status);
        const data = await response.json();
        const choice = data.choices?.[0];
        const raw = choice?.message?.content;
        try {
            if (choice?.finish_reason === 'length') throw new Error('Décision tronquée.');
            return { command: validateCommand(JSON.parse(raw)), attempts: attempt };
        } catch (error) {
            if (attempt === 2) throw error;
            messages.push({ role: 'assistant', content: typeof raw === 'string' ? raw.slice(0, 2000) : '{}' });
            messages.push({ role: 'user', content: 'Commande rejetée : ' + error.message +
                ' Corrige le JSON en conservant le module adapté à mon objectif. Pour turn, land, stop, rest, feed et groom : speed=0 et altitude=0. Pour walk : altitude=0. Pour fly : altitude entre 0.5 et 3. Réponds uniquement par le JSON complet corrigé.' });
        }
    }
}

function createFlyControl({ getState, isVoiceBusy = () => false, fetchImpl = fetch, now = Date.now,
    baseUrl = process.env.FLY_CONTROL_BASE_URL || process.env.FLY_LLM_BASE_URL || 'http://127.0.0.1:8081/v1',
    model = process.env.FLY_CONTROL_MODEL || process.env.FLY_DIALOGUE_MODEL || 'mlx-community/Qwen2.5-7B-Instruct-4bit' }) {
    let busy = false;
    function json(res, status, body) {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
    }
    async function step(req, res) {
        if (busy || isVoiceBusy()) return json(res, 429, { error: 'Qwen termine une autre décision ou un dialogue.' });
        busy = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        const disconnect = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', disconnect);
        try {
            let body = '';
            for await (const chunk of req) {
                body += chunk;
                if (Buffer.byteLength(body) > 4096) return json(res, 413, { error: 'Requête trop longue.' });
            }
            let request;
            try { request = JSON.parse(body); } catch (_) { return json(res, 400, { error: 'JSON invalide.' }); }
            if (!request || !/^[a-zA-Z0-9-]{16,80}$/.test(request.sessionId || '') ||
                !Number.isSafeInteger(request.epoch) || request.epoch < 0 ||
                !Number.isSafeInteger(request.requestId) || request.requestId < 0 ||
                typeof request.goal !== 'string' || !request.goal.trim() || request.goal.length > 600) {
                return json(res, 400, { error: 'Session, objectif ou numéro de décision invalide.' });
            }
            function currentState() {
                const state = getState(request.sessionId);
                return state?.control?.mode === 'qwen' && state.control.visible === true && state.control.epoch === request.epoch ? state : null;
            }
            const observation = buildObservation(currentState());
            if (!observation) return json(res, 409, { error: 'En attente d’un état récent de cet habitat en mode Qwen.' });
            const started = now();
            const { command, attempts } = await generateCommand({ observation, goal: request.goal.trim(), model, baseUrl,
                fetchImpl, signal: controller.signal });
            if (controller.signal.aborted || !buildObservation(currentState())) return json(res, 409, { error: 'Décision abandonnée : état ou objectif modifié.' });
            const issuedAt = now();
            json(res, 200, { requestId: request.requestId, epoch: request.epoch, command, model, attempts,
                latencyMs: issuedAt - started, issuedAt, expiresAt: issuedAt + command.durationMs });
        } catch (error) {
            process.stderr.write('[fly-control] ' + error.message + '\n');
            if (!res.destroyed) json(res, 503, { error: 'Décision Qwen indisponible ou invalide. Le corps reste en attente.' });
        } finally { clearTimeout(timeout); res.off('close', disconnect); busy = false; }
    }
    return { isBusy: () => busy, handle(req, res) {
        if (req.url !== '/fly/control/step') return false;
        if (req.method !== 'POST') json(res, 405, { error: 'POST requis.' });
        else step(req, res);
        return true;
    } };
}
module.exports = { SYSTEM_PROMPT, buildObservation, generateCommand, createFlyControl };
