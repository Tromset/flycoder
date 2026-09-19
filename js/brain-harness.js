/* Shared motor contract. The LLM selects modules; the existing functional
 * connectome weights route them to the virtual VNC and BRAIN.motorcontrol().
 * FlyWire is brain-only: these muscle projections are simulated, not a claim
 * that Qwen is running inside, or training, the biological connectome. */
(function (root) {
    'use strict';
    var MODULES = {
        walk: ['DN_WALK', 'VNC_CPG', 'DN_TURN'],
        turn: ['DN_TURN'],
        fly: ['DN_FLIGHT', 'DN_TURN'],
        land: [], stop: [], rest: [],
        feed: ['SEZ_FEED'], groom: ['SEZ_GROOM']
    };
    var LABELS = { walk: 'Marche', turn: 'Orientation', fly: 'Vol', land: 'Atterrissage',
        stop: 'Arrêt', rest: 'Repos', feed: 'Repas', groom: 'Toilette' };
    function angle(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }
    function validateCommand(value) {
        if (!value || Array.isArray(value) || typeof value !== 'object' ||
            !Object.hasOwn(MODULES, value.module)) throw new Error('Module moteur inconnu.');
        var keys = ['module', 'heading', 'speed', 'altitude', 'durationMs', 'reason'];
        if (Object.keys(value).some(function (key) { return keys.indexOf(key) === -1; })) throw new Error('Champ moteur inconnu.');
        if (!Number.isFinite(value.heading) || Math.abs(value.heading) > Math.PI ||
            !Number.isFinite(value.speed) || value.speed < 0 || value.speed > 1 ||
            !Number.isFinite(value.altitude) || value.altitude < 0 || value.altitude > 3 ||
            !Number.isInteger(value.durationMs) || value.durationMs < 500 || value.durationMs > 8000 ||
            typeof value.reason !== 'string' || value.reason.length > 160) throw new Error('Paramètres moteurs invalides.');
        if (value.module !== 'fly' && value.altitude !== 0) throw new Error('Altitude réservée au vol.');
        if (value.module === 'fly' && value.altitude < 0.5) throw new Error('Altitude de vol trop basse.');
        if (['walk', 'fly'].indexOf(value.module) === -1 && value.speed !== 0) throw new Error('Ce module reste sur place.');
        return Object.fromEntries(keys.map(function (key) { return [key, value[key]]; }));
    }

    function createHarness() {
        var mode = 'qwen', command = null, deadline = 0, origin = null, startedAt = 0;
        var feedback = { status: 'waiting', module: 'stop', distance: 0 };
        var motion = null;
        function clear() { command = null; deadline = 0; origin = null; motion = null; }
        return {
            setMode: function (value) {
                if (['qwen', 'brain', 'paused'].indexOf(value) === -1) throw new Error('Mode inconnu.');
                mode = value; clear(); feedback = { status: value === 'brain' ? 'brain' : 'waiting', module: 'stop', distance: 0 };
            },
            getMode: function () { return mode; },
            clear: clear,
            accept: function (value, now, expiresAt) {
                var checked = validateCommand(value);
                if (mode !== 'qwen' || !Number.isFinite(expiresAt) || expiresAt <= now) return false;
                command = checked; startedAt = now; deadline = Math.min(now + checked.durationMs, expiresAt); origin = null;
                return true;
            },
            getMotion: function () { return motion; },
            getFeedback: function () { return Object.assign({}, feedback); },
            apply: function (brain, context, now) {
                if (mode === 'brain') { motion = null; return null; }
                var active = mode === 'qwen' && command && now < deadline;
                var selected = active ? command.module : 'stop';
                var status = active ? 'executing' : command ? 'expired' : 'waiting';
                if (active && !origin) origin = { x: context.x, y: context.y };
                var distance = origin ? Math.hypot(context.x - origin.x, context.y - origin.y) : 0;
                // Check physical preconditions on every tick, including while a
                // long inference is running. Feeding never moves toward a target.
                if (active && selected === 'feed' && !context.foodContact) { selected = 'stop'; status = 'food_out_of_reach'; }
                if (active && ['walk', 'turn', 'feed', 'groom', 'rest'].indexOf(selected) !== -1 && context.altitude > 0.15) {
                    selected = 'land'; status = 'landing_first';
                }
                var blockedLanding = selected !== 'fly' && context.altitude > 0.15 && context.canLand === false;
                if (blockedLanding) { selected = 'fly'; status = 'landing_blocked'; }
                var heading = active && ['walk', 'turn', 'fly'].indexOf(selected) !== -1 && !blockedLanding ? command.heading : context.heading;
                var turn = angle(heading - context.heading);
                var intensity = active ? command.speed : 0;
                var channels = {}, routes = {};
                // Only selected routes may actuate the body. The rest of the
                // connectome continues to integrate sensors and internal drives.
                brain.motorNeurons.concat(['DN_STARTLE']).forEach(function (name) {
                    if (brain.postSynaptic[name]) brain.postSynaptic[name][brain.nextState] = 0;
                });
                function project(node, gain, mirror) {
                    routes[node] = gain;
                    var edges = brain.weights[node] || {};
                    Object.keys(edges).forEach(function (target) {
                        if (target.indexOf('MN_') !== 0) return;
                        var output = mirror ? target.replace(/_(L|R)(\d?)$/, function (_, side, leg) { return '_' + (side === 'L' ? 'R' : 'L') + leg; }) : target;
                        channels[output] = (channels[output] || 0) + edges[target] * gain;
                    });
                }
                if (selected === 'walk') { project('DN_WALK', intensity); project('VNC_CPG', intensity); }
                if (selected === 'fly') project('DN_FLIGHT', 1 + (blockedLanding ? 0 : intensity) * 4);
                if (selected === 'feed') project('SEZ_FEED', 1);
                if (selected === 'groom') project('SEZ_GROOM', 1);
                if (['walk', 'turn', 'fly'].indexOf(selected) !== -1 && !blockedLanding) project('DN_TURN', Math.min(1, Math.abs(turn)) * (selected === 'walk' ? intensity : 1), turn < 0);
                Object.keys(channels).forEach(function (name) {
                    // Flight steering uses head orientation, not walking legs.
                    if (selected === 'fly' && name.indexOf('MN_LEG_') === 0) channels[name] = 0;
                    channels[name] = Math.max(0, channels[name]);
                    if (brain.postSynaptic[name]) brain.postSynaptic[name][brain.nextState] = channels[name];
                });
                brain.motorcontrol();
                var velocity = selected === 'walk' ? Math.min(0.8, (brain.accumWalkLeft + brain.accumWalkRight) / 60) :
                    selected === 'fly' && active && !blockedLanding ? Math.min(2.5, brain.accumFlight / 40) * intensity : 0;
                var state = { stop: 'idle', land: 'idle', turn: 'walk' }[selected] || selected;
                motion = { behavior: state, heading: heading, speed: velocity,
                    altitude: selected === 'fly' ? (blockedLanding ? Math.max(0.5, context.altitude) : command.altitude) : 0 };
                feedback = { status: status, module: command ? command.module : 'stop', effectiveModule: selected,
                    distance: Math.round(distance * 10) / 10, elapsedMs: command ? now - startedAt : 0,
                    remainingMs: Math.max(0, deadline - now), routes: routes, channels: channels };
                return motion;
            }
        };
    }
    var api = { MODULES: MODULES, LABELS: LABELS, validateCommand: validateCommand, createHarness: createHarness };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.BrainHarness = api;
})(typeof window !== 'undefined' ? window : globalThis);
