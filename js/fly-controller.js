/* One inference at a time per visible habitat. Commands have a short lease;
 * pause, disconnection, visibility changes and new goals invalidate it. */
(function () {
    'use strict';
    var harness = BrainHarness.createHarness();
    var epoch = 0, requestId = 0, pending = null, timer = null;
    var goal = 'Explore ton habitat, cherche la nourriture si tu as faim et repose-toi si tu es fatiguée.';
    var message = 'Qwen prépare le contrôle du corps…', lastDecision = null;
    var sampledBrain = {};
    var API = 'http://' + (location.hostname || 'localhost') + ':7600/fly/control/step';
    var modeEl = document.getElementById('fly-control-mode');
    var statusEl = document.getElementById('fly-control-status');
    var detailEl = document.getElementById('fly-control-detail');
    var goalEl = document.getElementById('fly-control-goal');

    function render() {
        if (modeEl) modeEl.value = harness.getMode();
        var feedback = harness.getFeedback();
        var labels = { executing: 'en cours', expired: 'durée écoulée', waiting: 'en attente',
            food_out_of_reach: 'nourriture hors de portée', landing_first: 'descente vers le sol', landing_blocked: 'sol occupé, vol stationnaire' };
        if (statusEl) statusEl.textContent = harness.getMode() === 'brain' ? 'Le connectome choisit les comportements.' :
            harness.getMode() === 'paused' ? 'Contrôle suspendu · corps à l’arrêt.' : message;
        if (detailEl) detailEl.textContent = lastDecision && harness.getMode() === 'qwen' ?
            BrainHarness.LABELS[lastDecision.command.module] + ' · ' + (labels[feedback.status] || feedback.status) +
            ' · ' + (lastDecision.latencyMs / 1000).toFixed(1) + ' s de décision. ' + lastDecision.command.reason : '';
    }
    function schedule(delay) { clearTimeout(timer); timer = setTimeout(decide, delay); }
    function invalidate() {
        epoch++; harness.clear(); lastDecision = null;
        if (pending) pending.abort();
        clearTimeout(timer);
    }
    function publish() { if (window.caretakerBridge) window.caretakerBridge.sendState(); }
    function setMode(mode) {
        invalidate(); harness.setMode(mode);
        message = 'Qwen prépare une décision…';
        publish(); render(); schedule(100);
    }
    async function decide() {
        if (pending || harness.getMode() !== 'qwen' || document.hidden) return;
        if (!window.caretakerBridge || !caretakerBridge.isConnected()) {
            harness.clear(); message = 'Serveur de contrôle hors ligne · corps en attente.'; render(); schedule(3000); return;
        }
        var generation = epoch, id = ++requestId;
        var controller = new AbortController(); pending = controller;
        var timeout = setTimeout(function () { controller.abort(); }, 22000);
        message = 'Qwen 2.5 décide à partir du cerveau et des perceptions…'; render(); publish();
        var delay = 1000;
        try {
            var response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                signal: controller.signal, body: JSON.stringify({ sessionId: caretakerBridge.getSessionId(), epoch: generation, requestId: id, goal: goal }) });
            var result = await response.json();
            if (generation !== epoch || controller.signal.aborted || document.hidden || harness.getMode() !== 'qwen') return;
            if (!response.ok) throw new Error(result.error || 'Contrôle indisponible.');
            if (result.epoch !== generation || result.requestId !== id) throw new Error('Décision ancienne ignorée.');
            if (!harness.accept(result.command, Date.now(), result.expiresAt)) throw new Error('Décision expirée, nouvelle observation nécessaire.');
            lastDecision = result;
            message = 'Qwen 2.5 contrôle le corps · ' + BrainHarness.LABELS[result.command.module] + '.';
            // Renew early enough for inference while allowing observed progress.
            delay = Math.max(250, Math.min(2000, result.command.durationMs - result.latencyMs - 500));
        } catch (error) {
            if (generation === epoch) {
                harness.clear(); message = controller.signal.aborted ? 'Qwen met trop de temps · corps en attente.' : error.message;
                delay = 3000;
            }
        } finally {
            clearTimeout(timeout); if (pending === controller) pending = null;
            render(); schedule(generation === epoch ? delay : 100);
        }
    }
    window.FlyController = {
        isActive: function () { return harness.getMode() !== 'brain'; },
        setMode: setMode,
        sampleBrain: function () {
            sampledBrain = {};
            Object.keys(BRAIN.neuronRegions).forEach(function (region) {
                sampledBrain[region] = {};
                BRAIN.neuronRegions[region].forEach(function (name) {
                    var value = BRAIN.postSynaptic[name];
                    if (value) sampledBrain[region][name] = Math.round(Math.max(0, value[BRAIN.thisState]) * 100) / 100;
                });
            });
        },
        getBrain: function () { return sampledBrain; },
        getState: function () { return { mode: harness.getMode(), epoch: epoch, visible: !document.hidden, feedback: harness.getFeedback() }; },
        getMotion: function () { return harness.getMotion(); },
        apply: function () {
            var contact = food.some(function (item) { return Math.hypot(item.x - fly.x, item.y - fly.y) <= 20 && (fly.altitude || 0) < 0.15; });
            return harness.apply(BRAIN, { x: fly.x, y: fly.y, altitude: fly.altitude || 0, heading: facingDir,
                foodContact: contact, canLand: !habitatReady() || HabitatWorld.isFree(fly.x, fly.y, 0.42) }, Date.now());
        },
        connectionChanged: function (connected) {
            invalidate(); message = connected ? 'Connexion établie · Qwen prépare une décision…' : 'Serveur de contrôle hors ligne · corps en attente.';
            publish(); render(); if (connected) schedule(100);
        }
    };
    if (modeEl) modeEl.addEventListener('change', function () { setMode(modeEl.value); });
    if (goalEl) goalEl.value = goal;
    var form = document.getElementById('fly-control-form');
    if (form) form.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!goalEl.value.trim()) { goalEl.focus(); return; }
        goal = goalEl.value.trim(); setMode('qwen');
    });
    document.addEventListener('visibilitychange', function () {
        invalidate(); publish();
        if (!document.hidden) schedule(100);
    });
    if (location.protocol === 'file:') harness.setMode('brain');
    render(); schedule(1000);
    setInterval(function () { if (!document.hidden) render(); }, 1000);
})();
