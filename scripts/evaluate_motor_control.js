'use strict';
// Live, reproducible contract checks against the local Qwen backend.
// Does not move a browser fly or change its environment.
const fs = require('node:fs');
const path = require('node:path');
const { buildObservation, generateCommand } = require('../server/fly-control');
const baseUrl = process.env.FLY_CONTROL_BASE_URL || process.env.FLY_LLM_BASE_URL || 'http://127.0.0.1:8081/v1';
const model = process.env.FLY_CONTROL_MODEL || process.env.FLY_DIALOGUE_MODEL || 'mlx-community/Qwen2.5-7B-Instruct-4bit';
const cases = [
    { module: 'walk', goal: 'Marche tout droit vers la droite, cap 0, à vitesse modérée.', heading: 0 },
    { module: 'turn', goal: 'Pivote sur place vers le haut, cap 1.5708. Ne te déplace pas.', heading: Math.PI / 2 },
    { module: 'fly', goal: 'Décolle et vole vers la gauche, cap 3.14, altitude 2, vitesse modérée.', heading: 3.14, expectedAltitude: 2 },
    { module: 'stop', goal: 'Arrête-toi maintenant. Reste immobile.' },
    { module: 'rest', goal: 'Repose-toi sur place maintenant.' },
    { module: 'groom', goal: 'Fais ta toilette sur place maintenant.' },
    { module: 'feed', goal: 'Mange la nourriture au contact de ta trompe maintenant.', contact: true },
    { module: 'land', goal: 'Atterris maintenant sur ce terrain libre.', altitude: 1.7 },
    { module: 'walk', goal: 'Rejoins la nourriture juste à droite. Marche pour la rejoindre avant de manger.', foodX: 390, heading: 0 }
];
async function main() {
    const results = [];
    for (const scenario of cases) {
        const state = { drives: { hunger: 0.7, fear: 0.1, fatigue: 0.2, curiosity: 0.6, groom: 0.3 },
            behavior: { current: scenario.altitude ? 'fly' : 'idle' },
            position: { x: 300, y: 300, facingDir: 0, speed: 0, altitude: scenario.altitude || 0 },
            food: scenario.contact ? [{ x: 305, y: 300 }] : scenario.foodX ? [{ x: scenario.foodX, y: 300 }] : [],
            sensory: { foodContact: !!scenario.contact, canLand: true },
            environment: { lightLevel: 0, temperature: 0, bounds: { left: 46, right: 1154, top: 46, bottom: 754 } },
            brain: { central: { CX_EPG: 10, CX_PFN: 7, SEZ_FEED: 2 }, sensory: { OLF_ORN_FOOD: scenario.foodX ? 15 : 0 } },
            control: { feedback: { status: 'waiting', module: 'stop', distance: 0 } } };
        const started = Date.now();
        const result = { goal: scenario.goal, expectedModule: scenario.module };
        try {
            const generated = await generateCommand({ observation: buildObservation(state), goal: scenario.goal,
                model, baseUrl, signal: AbortSignal.timeout(20000) });
            result.command = generated.command;
            result.attempts = generated.attempts;
            result.passed = result.command.module === scenario.module &&
                (scenario.heading === undefined || Math.abs(result.command.heading - scenario.heading) < 0.02) &&
                (scenario.expectedAltitude === undefined || Math.abs(result.command.altitude - scenario.expectedAltitude) < 0.02);
        } catch (error) { result.passed = false; result.error = error.message; }
        result.latencyMs = Date.now() - started; results.push(result);
        console.log(JSON.stringify(result));
    }
    const report = { model, timestamp: new Date().toISOString(), passed: results.filter(r => r.passed).length, total: results.length, results };
    const output = path.join(__dirname, '../data/fly-language/control-evaluation.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(report.passed + '/' + report.total + ' motor decisions passed. ' + output);
    if (report.passed !== report.total) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
