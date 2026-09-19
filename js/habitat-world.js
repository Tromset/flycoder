/* Shared habitat geometry. Simulation coordinates stay independent of the viewport. */
(function () {
    'use strict';
    var world = {
        width: 1200,
        height: 800,
        scale: 0.02,
        light: { x: 430, y: 260 },
        bounds: { left: 46, right: 1154, top: 46, bottom: 754 },
        obstacles: [
            { x: -6.5, z: -2.5, radius: 1.2, height: 1.3, kind: 'wood' },
            { x: -7.7, z: -3.1, radius: 1.15, height: 1.3, kind: 'wood' },
            { x: -5.3, z: -1.9, radius: 1.05, height: 1.3, kind: 'wood' },
            { x: 6.2, z: 2.3, radius: 1.9, height: 0.3, kind: 'water' },
            { x: 4.9, z: -3.5, radius: 1.15, height: 1.4, kind: 'rock' },
            { x: 6.5, z: -4.2, radius: 0.75, height: 0.9, kind: 'rock' },
            { x: -8.5, z: 4.7, radius: 0.8, height: 0.7, kind: 'rock' },
            { x: -8.7, z: -5.5, radius: 0.65, height: 4, kind: 'plant' },
            { x: -2.9, z: -5.9, radius: 0.6, height: 3.7, kind: 'plant' },
            { x: 8.8, z: -5.5, radius: 0.65, height: 4, kind: 'plant' },
            { x: -10.6, z: 0.1, radius: 0.35, height: 2.2, kind: 'plant' },
            { x: 10.7, z: -0.9, radius: 0.35, height: 2.6, kind: 'plant' },
            { x: -6.1, z: 6.3, radius: 0.35, height: 1.4, kind: 'plant' },
            { x: 2.8, z: -6.8, radius: 0.35, height: 2, kind: 'plant' }
        ],
        toScene: function (x, y) { return { x: (x - 600) * this.scale, z: (y - 400) * this.scale }; },
        fromScene: function (x, z) { return { x: x / this.scale + 600, y: z / this.scale + 400 }; },
        groundHeight: function (x, z) {
            return 0.08 + 0.045 * Math.sin(x * 0.7) * Math.cos(z * 0.8) + 0.022 * Math.sin(x * 2 + z);
        },
        isFree: function (x, y, clearance) {
            var b = this.bounds;
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < b.left || x > b.right || y < b.top || y > b.bottom) return false;
            var p = this.toScene(x, y);
            return this.obstacles.every(function (o) {
                return Math.hypot(p.x - o.x, p.z - o.z) > o.radius + (clearance || 0);
            });
        },
        // Resolve penetration even during a low-frame-rate escape burst.
        constrain: function (x, y, altitude) {
            var b = this.bounds;
            var min = this.toScene(b.left, b.top), max = this.toScene(b.right, b.bottom);
            var p = this.toScene(Math.max(b.left, Math.min(b.right, x)), Math.max(b.top, Math.min(b.bottom, y)));
            for (var pass = 0; pass < 8; pass++) {
                var moved = false;
                this.obstacles.forEach(function (o) {
                    if (altitude > o.height + 0.2) return;
                    var dx = p.x - o.x, dz = p.z - o.z;
                    var d = Math.hypot(dx, dz), r = o.radius + 0.42;
                    if (d < r - 0.000001) {
                        moved = true;
                        p.x = o.x + (d > 0.00001 ? dx / d : (o.x > 0 ? -1 : 1)) * r;
                        p.z = o.z + (d > 0.00001 ? dz / d : 0) * r;
                        // Slide around a stem beside the rim instead of clamping back into it.
                        if (p.x < min.x || p.x > max.x) {
                            p.x = Math.max(min.x, Math.min(max.x, p.x));
                            p.z = o.z + (dz >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, r * r - Math.pow(p.x - o.x, 2)));
                        }
                        if (p.z < min.z || p.z > max.z) {
                            p.z = Math.max(min.z, Math.min(max.z, p.z));
                            p.x = o.x + (dx >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, r * r - Math.pow(p.z - o.z, 2)));
                        }
                    }
                });
                if (!moved) break;
            }
            var result = this.fromScene(p.x, p.z);
            result.x = Math.max(b.left, Math.min(b.right, result.x));
            result.y = Math.max(b.top, Math.min(b.bottom, result.y));
            result.hit = Math.hypot(result.x - x, result.y - y) > 0.01;
            return result;
        },
        avoidance: function (x, y, altitude) {
            var p = this.toScene(x, y), force = { x: 0, y: 0 };
            this.obstacles.forEach(function (o) {
                if (altitude > o.height + 0.2) return;
                var dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
                var reach = o.radius + 1.3;
                if (d < reach && d > 0.00001) {
                    var strength = (reach - d) / 1.3;
                    force.x += dx / d * strength;
                    force.y -= dz / d * strength;
                }
            });
            return force;
        }
    };
    window.HabitatWorld = world;
})();
