// Spatial invariants shared by rendering, food placement, and locomotion.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../js/habitat-world.js'), 'utf8'), context);
const world = context.window.HabitatWorld;
let checks = 0;
function check(name, run) { run(); checks++; console.log('PASS ' + name); }

check('Simulation/scene coordinates round-trip, including all corners', () => {
    for (const [x, y] of [[0,0], [1200,800], [600,400], [327,612]]) {
        const scene = world.toScene(x,y), result = world.fromScene(scene.x,scene.z);
        assert.ok(Math.abs(result.x-x)<1e-9 && Math.abs(result.y-y)<1e-9);
    }
});
check('Camera dimensions do not change the world', () => {
    const p = world.toScene(1100,730);
    context.window.innerWidth = 390; context.window.innerHeight = 844;
    assert.equal(world.toScene(1100,730).x,p.x);
    assert.equal(world.toScene(1100,730).z,p.z);
});
check('Food is rejected on props, water, outside the tray, and invalid coordinates', () => {
    for (const o of world.obstacles) {
        const p = world.fromScene(o.x,o.z);
        assert.equal(world.isFree(p.x,p.y,0.5),false);
    }
    for (const [x,y] of [[-1,400],[1200,400],[600,0],[600,800],[NaN,2],[undefined,1],[600,Infinity]]) assert.equal(world.isFree(x,y,0.5),false);
    assert.equal(world.isFree(600,430,0.5),true);
});
check('Fly is pushed out of each obstacle, including an exact center hit', () => {
    for (const o of world.obstacles) {
        const p = world.fromScene(o.x,o.z), result = world.constrain(p.x,p.y,0);
        assert.ok(result.hit);
        assert.ok(Number.isFinite(result.x) && Number.isFinite(result.y));
        const scene = world.toScene(result.x,result.y);
        assert.ok(Math.hypot(scene.x-o.x,scene.z-o.z)>=o.radius+0.4);
    }
});
check('Collisions beside the rim slide into free space instead of trapping the fly', () => {
    for (const [x,z] of [[10.95,-0.9],[2.8,-7.05],[-10.9,0.1]]) {
        const p = world.fromScene(x,z), resolved = world.constrain(p.x,p.y,0);
        const scene = world.toScene(resolved.x,resolved.y), b=world.bounds;
        assert.ok(resolved.x>=b.left && resolved.x<=b.right && resolved.y>=b.top && resolved.y<=b.bottom);
        for (const o of world.obstacles) assert.ok(Math.hypot(scene.x-o.x,scene.z-o.z)>=o.radius+0.4);
    }
});
check('Flight clears a low rock and landing resolves the same rock', () => {
    const rock = world.obstacles.find(o=>o.kind==='rock');
    const p = world.fromScene(rock.x,rock.z);
    assert.equal(world.constrain(p.x,p.y,3).hit,false);
    assert.equal(world.constrain(p.x,p.y,0).hit,true);
});
check('Large escape steps remain inside the tray', () => {
    for (const [x,y] of [[-500,-500],[3000,2000],[600,-3000]]) {
        const p = world.constrain(x,y,3), b = world.bounds;
        assert.ok(p.x>=b.left && p.x<=b.right && p.y>=b.top && p.y<=b.bottom);
    }
});
check('Avoidance points away from nearby obstacles and ignores low obstacles in flight', () => {
    const p = world.fromScene(6.2+2.5,2.3), force = world.avoidance(p.x,p.y,0);
    assert.ok(force.x>0);
    assert.equal(world.avoidance(p.x,p.y,3).x,0);
});
check('Ground heights are finite throughout the navigable area', () => {
    for(let x=-12;x<=12;x+=0.5) for(let z=-8;z<=8;z+=0.5) assert.ok(Number.isFinite(world.groundHeight(x,z)));
});
console.log(checks + ' habitat tests passed.');
