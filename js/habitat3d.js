/* A procedural terrarium and articulated fly, driven by the existing simulation.
 * Uses the vendored Three.js r128 + OrbitControls; no network assets required. */
(function () {
    'use strict';
    var W = window.HabitatWorld;
    var scene, camera, renderer, controls, container, ground, sun, ambient;
    var flyRoot, flyBody, head, proboscis, wings = [], legs = [], plants = [];
    var foodMeshes = new Map(), rippleMeshes = [], marker, shadow, water;
    var raycaster, mouse, resizeObserver, lastHud = 0, elapsed = 0;
    var follow = false, view = 'overview', cameraMove = null, pointer = null, pointers = new Set();
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var v1, v2, up, dummy, lastQuality = null;
    var seed = 73621;
    function random() { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; }
    function material(color, roughness) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: roughness === undefined ? 0.85 : roughness }); }
    var sphereGeo, segmentGeo, mats;
    function mesh(geo, mat, parent, x, y, z, sx, sy, sz) {
        var m = new THREE.Mesh(geo, mat);
        m.position.set(x || 0, y || 0, z || 0);
        if (sx !== undefined) m.scale.set(sx, sy, sz);
        m.castShadow = true; m.receiveShadow = true;
        (parent || scene).add(m);
        return m;
    }
    function ellipsoid(parent, mat, x, y, z, sx, sy, sz) { return mesh(sphereGeo, mat, parent, x, y, z, sx, sy, sz); }
    function lineBetween(m, a, b, thickness) {
        v1.subVectors(b, a);
        m.position.copy(a).addScaledVector(v1, 0.5);
        m.scale.set(thickness, v1.length(), thickness);
        m.quaternion.setFromUnitVectors(up, v1.normalize());
    }
    function branch(parent, a, b, radius, mat) {
        var m = mesh(segmentGeo, mat || mats.stem, parent);
        lineBetween(m, new THREE.Vector3().fromArray(a), new THREE.Vector3().fromArray(b), radius);
        return m;
    }
    function curve(parent, points, mat) {
        var geo = new THREE.BufferGeometry().setFromPoints(points.map(function (p) { return new THREE.Vector3().fromArray(p); }));
        var l = new THREE.Line(geo, mat); parent.add(l); return l;
    }
    function makeSoilTexture() {
        var c = document.createElement('canvas'); c.width = c.height = 512;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#877250'; ctx.fillRect(0, 0, 512, 512);
        var colors = ['#716345', '#a08c62', '#c0a579', '#60583e', '#94845b'];
        for (var i = 0; i < 22000; i++) {
            ctx.fillStyle = colors[Math.floor(random() * colors.length)];
            ctx.beginPath(); ctx.ellipse(random() * 512, random() * 512, 0.4 + random() * 2, 0.4 + random() * 1.4, random() * Math.PI, 0, Math.PI * 2); ctx.fill();
        }
        var tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(5, 3.3); tex.encoding = THREE.sRGBEncoding;
        tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        return tex;
    }
    function buildGround() {
        // Shallow botanical observation tray, with a continuous walkable surface.
        mesh(new THREE.BoxGeometry(24.6, 0.65, 16.6), mats.earth, scene, 0, -0.4, 0);
        var soil = material(0xffffff);
        soil.map = makeSoilTexture(); soil.bumpMap = soil.map; soil.bumpScale = 0.035;
        var geo = new THREE.PlaneGeometry(24, 16, 96, 64); geo.rotateX(-Math.PI / 2);
        var pos = geo.attributes.position;
        for (var i = 0; i < pos.count; i++) pos.setY(i, W.groundHeight(pos.getX(i), pos.getZ(i)));
        geo.computeVertexNormals();
        ground = mesh(geo, soil); ground.castShadow = false;
        [[0, -8.18, 24.7, 0.22], [0, 8.18, 24.7, 0.22], [-12.23, 0, 0.22, 16.5], [12.23, 0, 0.22, 16.5]].forEach(function (p) {
            mesh(new THREE.BoxGeometry(p[2], 0.75, p[3]), mats.wood, scene, p[0], -0.26, p[1]);
            mesh(new THREE.BoxGeometry(p[2], 0.06, p[3] + 0.06), mats.woodLight, scene, p[0], 0.14, p[1]);
        });
        var stage = mesh(new THREE.PlaneGeometry(200, 200), material(0xadb8a2), scene, 0, -0.76, 0);
        stage.rotation.x = -Math.PI / 2; stage.castShadow = false;

        // Instanced gravel and moss keep the richly textured floor inexpensive.
        var pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), mats.pebble, 450);
        var palette = [0x928572, 0xb6aa8e, 0x6e7351, 0xc8b590];
        for (var n = 0; n < 450; n++) {
            var x = (random() - 0.5) * 23.5, z = (random() - 0.5) * 15.5;
            var r = 0.025 + random() * 0.08;
            dummy.position.set(x, W.groundHeight(x, z), z); dummy.scale.set(r * 1.4, r * 0.6, r);
            dummy.rotation.set(random(), random() * 6, random()); dummy.updateMatrix();
            pebbles.setMatrixAt(n, dummy.matrix); pebbles.setColorAt(n, new THREE.Color(palette[n % 4]).convertSRGBToLinear());
        }
        pebbles.receiveShadow = true; scene.add(pebbles);
        var moss = new THREE.InstancedMesh(sphereGeo, mats.moss, 160);
        for (var j = 0; j < 160; j++) {
            var angle = random() * Math.PI * 2;
            var mx = Math.cos(angle) * (9 + random() * 2.6), mz = Math.sin(angle) * (5.8 + random() * 1.5);
            dummy.position.set(mx, W.groundHeight(mx, mz), mz); dummy.scale.set(0.15 + random() * 0.42, 0.06 + random() * 0.09, 0.15 + random() * 0.35);
            dummy.rotation.set(0, random() * 6, 0); dummy.updateMatrix(); moss.setMatrixAt(j, dummy.matrix);
            moss.setColorAt(j, new THREE.Color().setHSL(0.20 + random() * 0.06, 0.26, 0.22 + random() * 0.09).convertSRGBToLinear());
        }
        moss.receiveShadow = true; scene.add(moss);
    }
    function leafGeometry() {
        // A curved leaf with a pointed tip and raised central vein.
        var vertices = [], indices = [];
        for (var i = 0; i <= 10; i++) {
            var t = i / 10, width = Math.sin(Math.PI * t) * 0.42;
            for (var j = -1; j <= 1; j++) vertices.push(j * width, Math.sin(t * Math.PI) * 0.18 + (j === 0 ? 0.06 : 0), t * 1.8);
        }
        for (var k = 0; k < 10; k++) for (var c = 0; c < 2; c++) {
            var a = k * 3 + c; indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
        }
        var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
    }
    function buildPlants() {
        var leafGeo = leafGeometry();
        var leafMats = [0x55774a, 0x78964d, 0x3e694e, 0x8a9c57].map(function (c) {
            var m = material(c, 0.72); m.side = THREE.DoubleSide; return m;
        });
        var spots = [[-8.7,-5.5,3.6],[-2.9,-5.9,3.4],[8.8,-5.5,3.8],[-10.6,0.1,2.2],[10.7,-0.9,2.6],[-6.1,6.3,1.4],[2.8,-6.8,2.0]];
        spots.forEach(function (p, index) {
            var plant = new THREE.Group(); plant.position.set(p[0], W.groundHeight(p[0], p[1]), p[1]); scene.add(plant);
            branch(plant, [0,0,0], [0.13,p[2],0], 0.05);
            for (var i = 0; i < 9; i++) {
                var leaf = new THREE.Group(), angle = i * 2.4 + index;
                leaf.position.set(0.1 * i / 9, 0.4 + i / 9 * p[2], 0); leaf.rotation.y = angle;
                leaf.rotation.x = -0.25 - i * 0.065; leaf.scale.setScalar((1 - i * 0.058) * (p[2] / 3.3));
                mesh(leafGeo, leafMats[(index + i) % 4], leaf);
                curve(leaf, [[0,0.06,0],[0,0.22,0.9],[0,0.06,1.8]], mats.vein);
                plant.add(leaf);
            }
            plants.push({ root: plant, phase: random() * 6 });
        });
        // Fine blades along the edge, leaving the center open for observation.
        var blade = new THREE.ConeGeometry(0.075, 1, 3);
        var grass = new THREE.InstancedMesh(blade, leafMats[0], 240);
        for (var j = 0; j < 240; j++) {
            var a = random() * Math.PI * 2, x = Math.cos(a) * (10 + random() * 1.5), z = Math.sin(a) * (6.5 + random() * 0.8);
            var h = 0.2 + random() * 0.7;
            dummy.position.set(x, h / 2 + W.groundHeight(x,z), z); dummy.scale.set(1, h, 1);
            dummy.rotation.set((random()-0.5)*0.5, random()*6, (random()-0.5)*0.5); dummy.updateMatrix(); grass.setMatrixAt(j, dummy.matrix);
        }
        scene.add(grass);
        // Tiny clover flowers and a small cluster of mushrooms.
        [[-9,2.1],[-8.6,2.7],[-9.4,3], [6.8,-6.3], [7.4,-6.1]].forEach(function (p) {
            var y = W.groundHeight(p[0],p[1]), h = 0.6 + random()*0.5;
            branch(scene, [p[0],y,p[1]], [p[0],y+h,p[1]], 0.025);
            for (var i = 0; i < 6; i++) {
                var a = i * Math.PI / 3;
                ellipsoid(scene, mats.flower, p[0]+Math.cos(a)*0.12, y+h, p[1]+Math.sin(a)*0.12, 0.13,0.07,0.13);
            }
            ellipsoid(scene,mats.pollen,p[0],y+h+0.04,p[1],0.09,0.07,0.09);
        });
        [[-7.2,-1.2,0.65],[-7.7,-0.7,0.4],[-8.1,-1.4,0.52]].forEach(function (p) {
            var y = W.groundHeight(p[0],p[1]);
            branch(scene,[p[0],y,p[1]],[p[0],y+p[2],p[1]],0.09,mats.mushroomStem);
            mesh(new THREE.SphereGeometry(p[2]*0.55,20,12,0,Math.PI*2,0,Math.PI/2),mats.mushroom,scene,p[0],y+p[2],p[1],1,0.65,1);
        });
    }
    function buildProps() {
        W.obstacles.filter(function (o) { return o.kind === 'rock'; }).forEach(function (o) {
            var rock = mesh(new THREE.DodecahedronGeometry(1, 1), mats.rock, scene, o.x, o.height*0.32, o.z, o.radius, o.height*0.68, o.radius*0.85);
            rock.rotation.set(0.1, random()*6,0.2);
        });
        var log = new THREE.Group(); log.position.set(-6.5,0.62,-2.5); log.rotation.y = -0.46; scene.add(log);
        var bark = mesh(new THREE.CylinderGeometry(0.65,0.77,4.3,14), mats.bark, log); bark.rotation.z = Math.PI/2;
        [-1,1].forEach(function (side) {
            var end = mesh(new THREE.CircleGeometry(0.62,32),mats.woodLight,log,side*2.16,0,0); end.rotation.y=side*Math.PI/2;
            for(var r=0.12;r<0.62;r+=0.12) {
                var ring=mesh(new THREE.TorusGeometry(r,0.014,4,32),mats.bark,log,side*2.168,0,0);ring.rotation.y=Math.PI/2;
            }
        });
        for(var i=0;i<10;i++) {
            var a=i*Math.PI/5;
            branch(log,[-1.96,Math.sin(a)*0.65,Math.cos(a)*0.65],[2,Math.sin(a+0.07)*0.66,Math.cos(a+0.07)*0.66],0.035,mats.barkDark);
        }
        branch(log,[-0.3,0.3,0],[0.5,1.1,0.35],0.16,mats.bark);
        // A stone-lined shallow pool, excluded from walking and food placement.
        ellipsoid(scene,mats.rock,6.2,0.01,2.3,2.08,0.22,1.86);
        var wm = new THREE.MeshPhysicalMaterial({color:new THREE.Color(0x408c80).convertSRGBToLinear(),roughness:0.18,metalness:0.15,transparent:true,opacity:0.82,clearcoat:1});
        water=mesh(new THREE.CircleGeometry(1.72,64),wm,scene,6.2,0.235,2.3);water.rotation.x=-Math.PI/2;water.castShadow=false;water.scale.y=0.9;
        for(var j=0;j<16;j++) {
            var a=j*Math.PI/8;
            ellipsoid(scene,mats.pebble,6.2+Math.cos(a)*1.89,0.2,2.3+Math.sin(a)*1.68,0.24+random()*0.11,0.16,0.22);
        }
        for(var k=0;k<3;k++) {
            var ring=mesh(new THREE.RingGeometry(0.4+k*0.38,0.41+k*0.38,64),new THREE.MeshBasicMaterial({color:0xd5f2dc,transparent:true,opacity:0.25,side:THREE.DoubleSide}),scene,6.2,0.244+k*0.001,2.3);
            ring.rotation.x=-Math.PI/2;ring.scale.y=0.9;ring.castShadow=false;rippleMeshes.push(ring);
        }
        // Fallen leaf litter around the edges.
        var litterGeo=leafGeometry(), litterMat=material(0xa68845);litterMat.side=THREE.DoubleSide;
        [[-3.8,5.8,0.6],[8,5.4,-1],[-9,-3,2],[2,-4.8,1.2],[-0.9,6.5,2.6]].forEach(function(p){
            var l=mesh(litterGeo,litterMat,scene,p[0],0.09,p[1]);l.rotation.y=p[2];l.scale.setScalar(0.55);
        });
    }
    function buildFly() {
        flyRoot=new THREE.Group();scene.add(flyRoot);flyBody=new THREE.Group();flyRoot.add(flyBody);
        // Local +X is the head; root yaw shares facingDir with the connectome.
        ellipsoid(flyBody,mats.abdomen,-0.3,0,0,0.35,0.21,0.235);
        for(var i=0;i<4;i++) {
            var band=mesh(new THREE.TorusGeometry(1,0.055,6,28),mats.dark,flyBody,-0.48+i*0.13,0,0);
            band.rotation.y=Math.PI/2;var r=Math.sqrt(Math.max(0.1,1-Math.pow((-0.48+i*0.13+0.3)/0.35,2)));
            band.scale.set(0.236*r,0.212*r,0.15);
        }
        ellipsoid(flyBody,mats.thorax,0.15,0.08,0,0.28,0.24,0.205);
        head=new THREE.Group();head.position.set(0.47,0.08,0);flyBody.add(head);
        ellipsoid(head,mats.thorax,0,0,0,0.18,0.175,0.19);
        [-1,1].forEach(function(side){
            var eye=ellipsoid(head,mats.eye,0.035,0.035,side*0.15,0.145,0.16,0.085);
            // Fine facets suggest compound eyes without a costly texture asset.
            var facetGeo=new THREE.IcosahedronGeometry(1,2);eye.geometry=facetGeo;
            branch(head,[0.13,0.08,side*0.075],[0.28,0.14,side*0.115],0.017,mats.dark);
            ellipsoid(head,mats.thorax,0.27,0.14,side*0.115,0.036,0.035,0.024);
            branch(head,[0.27,0.15,side*0.12],[0.38,0.26,side*0.15],0.006,mats.dark);
        });
        proboscis=ellipsoid(head,mats.proboscis,0.13,-0.13,0,0.055,0.14,0.045);
        var hairPoints=[];
        for(var h=0;h<42;h++) {
            var x=(random()-0.5)*0.8, a=random()*Math.PI;
            var y=0.14+Math.sin(a)*0.11,z=Math.cos(a)*0.18;
            hairPoints.push(x,y,z,x-0.04,y+0.075,z*1.16);
        }
        var hairGeo=new THREE.BufferGeometry();hairGeo.setAttribute('position',new THREE.Float32BufferAttribute(hairPoints,3));
        flyBody.add(new THREE.LineSegments(hairGeo,mats.hair));
        var wingShape=new THREE.Shape();wingShape.moveTo(0,0);wingShape.bezierCurveTo(-0.26,0.12,-1.04,0.5,-1.08,0.17);wingShape.bezierCurveTo(-1.06,-0.12,-0.3,-0.16,0,0);
        var wg=new THREE.ShapeGeometry(wingShape,20);wg.rotateX(Math.PI/2);
        [-1,1].forEach(function(side){
            var pivot=new THREE.Group();pivot.position.set(0.21,0.26,side*0.13);flyBody.add(pivot);
            var membrane=new THREE.Group();membrane.scale.z=side;pivot.add(membrane);
            var w=mesh(wg,mats.wing,membrane);w.castShadow=false;
            curve(membrane,[[0,0.005,0],[-0.4,0.005,0.08],[-0.95,0.005,0.22]],mats.wingVein);
            curve(membrane,[[-0.08,0.005,0],[-0.55,0.005,-0.08],[-0.99,0.005,0.07]],mats.wingVein);
            curve(membrane,[[-0.4,0.005,0.08],[-0.56,0.005,-0.08]],mats.wingVein);
            wings.push({pivot:pivot,side:side});
            ellipsoid(flyBody,mats.pollen,-0.05,0.12,side*0.25,0.035,0.04,0.035);
            for(var i=0;i<3;i++) {
                var segments=[];
                for(var j=0;j<3;j++) segments.push(mesh(segmentGeo,mats.leg,flyRoot));
                legs.push({side:side,index:i,segments:segments,points:[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()]});
            }
        });
        // A soft grounding shadow remains readable even with shadows disabled in Lite mode.
        var c=document.createElement('canvas');c.width=c.height=64;var ctx=c.getContext('2d');
        var g=ctx.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'rgba(25,28,16,0.32)');g.addColorStop(1,'rgba(25,28,16,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
        shadow=mesh(new THREE.PlaneGeometry(2,1.5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}),scene);
        shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;
        marker=mesh(new THREE.RingGeometry(0.86,0.885,64),new THREE.MeshBasicMaterial({color:0xf1f5d9,transparent:true,opacity:0.65,side:THREE.DoubleSide,depthWrite:false}),scene);
        marker.rotation.x=-Math.PI/2;marker.castShadow=false;
    }
    function syncFood() {
        foodMeshes.forEach(function(group,item){if(food.indexOf(item)===-1){scene.remove(group);foodMeshes.delete(item);}});
        food.forEach(function(item){
            var group=foodMeshes.get(item);
            if(!group){
                group=new THREE.Group();
                ellipsoid(group,mats.fruit,0,0.13,0,0.22,0.15,0.2);
                ellipsoid(group,mats.fruitFlesh,0.015,0.225,0,0.175,0.025,0.15);
                branch(group,[0,0.23,0],[0.04,0.33,0.025],0.016,mats.stem);
                scene.add(group);foodMeshes.set(item,group);
            }
            var p=W.toScene(item.x,item.y);group.position.set(p.x,W.groundHeight(p.x,p.z),p.z);group.scale.setScalar(Math.max(0.12,item.radius/10));
        });
    }
    function animateFly() {
        var p=W.toScene(fly.x,fly.y), airborne=behavior.current==='fly'||(behavior.current==='startle'&&behavior.startlePhase==='burst');
        var y=W.groundHeight(p.x,p.z);
        flyRoot.position.set(p.x,y+0.43+fly.altitude,p.z);flyRoot.rotation.y=facingDir;
        var moving=speed>0.025, phase=anim.walkPhase*2;
        flyBody.position.y=moving?Math.sin(phase*2)*0.012:Math.sin(elapsed*3)*0.006;
        head.rotation.y=Math.sin(elapsed*2.3)*0.045;
        proboscis.scale.y=0.2+anim.proboscisExtend*1.1;
        proboscis.rotation.z=anim.proboscisExtend*-0.4;
        wings.forEach(function(w){w.pivot.rotation.y=-w.side*(0.13+anim.wingSpread*0.85);w.pivot.rotation.x=w.side*(airborne?Math.sin(elapsed*95)*0.65:0.04+Math.sin(elapsed*4)*0.015);});
        legs.forEach(function(leg){
            var s=leg.side,i=leg.index, points=leg.points;
            var gait=phase+(i%2===0?0:Math.PI)+(s===1?Math.PI:0);
            var swing=moving?Math.cos(gait)*0.15:0,lift=moving?Math.max(0,Math.sin(gait))*0.11:0;
            var footX=[0.66,0.03,-0.52][i]+swing,footZ=s*[0.52,0.68,0.56][i];
            var footY=-0.42+lift;
            if(airborne){footX-=0.17;footZ*=0.65;footY=-0.3;}
            if(behavior.current==='groom'&&i===(behavior.groomLocation==='abdomen'?2:0)){
                footX=i===0?0.62:-0.48;footZ=s*(0.1+Math.sin(anim.groomPhase)*0.08);footY=0.04+Math.cos(anim.groomPhase)*0.09;
            }
            points[0].set(0.26-i*0.18,-0.02,s*0.15);
            points[1].set([0.43,0.1,-0.29][i],-0.06,s*0.4);
            points[2].set(footX*0.9,footY+0.12,footZ*0.92);
            points[3].set(footX,footY,footZ);
            for(var n=0;n<3;n++)lineBetween(leg.segments[n],points[n],points[n+1],0.018-n*0.004);
        });
        shadow.position.set(p.x,y+0.015,p.z);shadow.material.opacity=1-fly.altitude*0.2;shadow.scale.setScalar(1+fly.altitude*0.3);
        marker.position.set(p.x,y+0.02,p.z);marker.visible=view!=='follow';
    }
    function resize() {
        if(!renderer || container.hidden)return;
        var top=document.getElementById('toolbar').getBoundingClientRect().bottom;
        var bottom=document.getElementById('left-panel').getBoundingClientRect().top;
        container.style.top=top+'px';container.style.height=Math.max(120,bottom-top)+'px';
        var width=container.clientWidth,height=container.clientHeight;
        var previousAspect=camera.aspect;
        camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);
        if(Habitat3D.ready && view!=='follow' && Math.abs(previousAspect-camera.aspect)>0.01)setView(view,true);
    }
    function setView(name, immediate) {
        view=name;follow=name==='follow';container.dataset.view=name;
        var p=W.toScene(fly.x,fly.y),target=new THREE.Vector3(0,0.2,0),offset;
        var aspect=(container.clientWidth || window.innerWidth)/Math.max(1,container.clientHeight || window.innerHeight);
        var fit=Math.max(1,1.4/aspect);
        if(name==='follow') {target.set(p.x,0.6+(fly.altitude||0),p.z);offset=new THREE.Vector3(3.8,3.1,4.4);}
        else if(name==='top')offset=new THREE.Vector3(0,28*fit,0.01);
        else offset=new THREE.Vector3(17,20.4,26).multiplyScalar(fit);
        controls.maxDistance=Math.max(65,offset.length()*1.5);
        if(immediate||reducedMotion){controls.target.copy(target);camera.position.copy(target).add(offset);controls.update();cameraMove=null;}
        else cameraMove={from:camera.position.clone(),fromTarget:controls.target.clone(),to:target.clone().add(offset),target:target,time:0};
        document.querySelectorAll('[data-habitat-view]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.habitatView===name));});
    }
    function pick(clientX,clientY,objects) {
        var r=renderer.domElement.getBoundingClientRect();mouse.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);
        return raycaster.intersectObjects(objects||[ground],true)[0]||null;
    }
    function groundPoint(e) {var hit=pick(e.clientX,e.clientY);return hit?W.fromScene(hit.point.x,hit.point.z):null;}
    function feedback(text) {document.getElementById('habitat-feedback').textContent=text;}
    function cancelGesture() {
        if(pointer&&pointer.air){BRAIN.stimulate.wind=false;BRAIN.stimulate.windStrength=0;windResetTime=0;}
        pointer=null;controls.enabled=true;
    }
    function bindInteractions() {
        var el=renderer.domElement;
        el.addEventListener('pointerdown',function(e){
            pointers.add(e.pointerId);if(pointers.size>1){cancelGesture();return;}
            if(e.button!==0)return;
            cameraMove=null;
            pointer={id:e.pointerId,x:e.clientX,y:e.clientY,tool:activeTool,world:groundPoint(e),air:activeTool==='air',moved:false};
            el.setPointerCapture(e.pointerId);
            if(pointer.air)controls.enabled=false;
        },true);
        el.addEventListener('pointermove',function(e){
            if(!pointer||e.pointerId!==pointer.id)return;
            if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)>6)pointer.moved=true;
            if(pointer.air&&pointer.world){
                var end=groundPoint(e);if(!end)return;
                var dx=end.x-pointer.world.x,dy=end.y-pointer.world.y;
                BRAIN.stimulate.wind=true;BRAIN.stimulate.windStrength=Math.min(1,Math.hypot(dx,dy)/150);BRAIN.stimulate.windDirection=Math.atan2(-dy,dx);windResetTime=Date.now()+2000;
            }
        });
        el.addEventListener('pointerup',function(e){
            pointers.delete(e.pointerId);if(!pointer||pointer.id!==e.pointerId)return;
            var start=pointer;pointer=null;controls.enabled=true;
            if(start.air){
                if(start.world){
                    if(!start.moved){BRAIN.stimulate.windStrength=0.4;BRAIN.stimulate.windDirection=Math.atan2(-(fly.y-start.world.y),fly.x-start.world.x);}
                    BRAIN.stimulate.wind=true;windResetTime=Date.now()+2000;feedback('Une brise traverse le terrarium.');
                }return;
            }
            if(start.moved||pointers.size)return;
            if(start.tool==='touch'){
                var hit=pick(e.clientX,e.clientY,[flyRoot]);
                if(hit){var point=W.fromScene(hit.point.x,hit.point.z);applyTouchTool(point.x,point.y);feedback('Contact détecté par la mouche.');}
                else feedback('Touchez directement le corps de la mouche.');
            }else if(start.tool==='feed'){
                var p=groundPoint(e);if(!p)return;
                if(Habitat3D.placeFood(p.x,p.y))feedback('Un morceau de fruit a été déposé.');
                else feedback('Choisissez un endroit libre sur le sol.');
            }
        });
        el.addEventListener('pointercancel',function(e){pointers.delete(e.pointerId);cancelGesture();});
        el.addEventListener('lostpointercapture',function(e){if(pointer&&pointer.id===e.pointerId){pointers.delete(e.pointerId);cancelGesture();}});
        window.addEventListener('blur',function(){pointers.clear();cancelGesture();});
        controls.addEventListener('start',function(){cameraMove=null;});
        document.querySelectorAll('[data-habitat-view]').forEach(function(b){b.addEventListener('click',function(){setView(b.dataset.habitatView);});});
        document.getElementById('habitat3dBtn').addEventListener('click',function(){Habitat3D.setActive(!Habitat3D.active);});
    }
    function updateHud() {
        var states={idle:'Au repos',walk:'Marche',explore:'Exploration',phototaxis:'Vers la lumière',rest:'Sommeil',groom:'Toilette',feed:'Repas',fly:'En vol',startle:'Réaction de fuite',brace:'Face au vent'};
        document.getElementById('habitat-state').textContent=states[behavior.current]||behavior.current;
        document.getElementById('habitat-food-count').textContent=food.length+' morceau'+(food.length===1?'':'x')+' de fruit';
        document.getElementById('habitat-light').textContent=['Lumière du jour','Lumière tamisée','Nuit'][lightStateIndex];
        document.getElementById('habitat-temperature').textContent=['Température douce','Température chaude','Température fraîche'][tempStateIndex];
        document.getElementById('habitat-hint').textContent=activeTool==='air'?'Glissez sur le sol pour souffler de l’air.':activeTool==='touch'?'Cliquez sur la mouche pour la toucher.':'Cliquez sur le sol pour déposer un fruit.';
    }
    window.Habitat3D={
        ready:false,active:false,
        init:function(){
            container=document.getElementById('habitat3d');
            try{
                renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
                renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.outputEncoding=THREE.sRGBEncoding;
                renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
                container.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','Terrarium 3D interactif de la mouche');renderer.domElement.setAttribute('tabindex','0');
                scene=new THREE.Scene();scene.background=new THREE.Color(0xbfcab5);scene.fog=new THREE.Fog(0xbfcab5,45,115);
                camera=new THREE.PerspectiveCamera(38,1,0.05,500);controls=new THREE.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=0.09;controls.minDistance=2;controls.maxPolarAngle=Math.PI/2-0.06;controls.screenSpacePanning=false;controls.target.set(0,0,0);
                up=new THREE.Vector3(0,1,0);v1=new THREE.Vector3();v2=new THREE.Vector3();dummy=new THREE.Object3D();raycaster=new THREE.Raycaster();mouse=new THREE.Vector2();
                sphereGeo=new THREE.SphereGeometry(1,20,14);segmentGeo=new THREE.CylinderGeometry(1,0.8,1,6);
                mats={earth:material(0x514435),wood:material(0x766446),woodLight:material(0xbba779),pebble:material(0x999585),moss:material(0xffffff),stem:material(0x4d6740),vein:new THREE.LineBasicMaterial({color:0xa4b976,transparent:true,opacity:0.45}),flower:material(0xe5ddcb),pollen:material(0xc2a34b),mushroomStem:material(0xc8b893),mushroom:material(0xaf7950),rock:material(0x8d9287),bark:material(0x65513a),barkDark:material(0x433e2b),abdomen:material(0xb99940,0.5),thorax:material(0x85723b,0.55),dark:material(0x3e321e),eye:material(0x991b16,0.33),leg:material(0x493e22,0.62),proboscis:material(0x8c653f),hair:new THREE.LineBasicMaterial({color:0x403a25,transparent:true,opacity:0.7}),wing:new THREE.MeshPhysicalMaterial({color:0xe7f1d9,transparent:true,opacity:0.38,roughness:0.22,metalness:0.1,clearcoat:1,side:THREE.DoubleSide,depthWrite:false}),wingVein:new THREE.LineBasicMaterial({color:0x829180,transparent:true,opacity:0.55}),fruit:material(0xe0973e,0.7),fruitFlesh:material(0xf2d080,0.85)};
                ambient=new THREE.HemisphereLight(0xe9f4dc,0x736747,0.9);scene.add(ambient);
                sun=new THREE.DirectionalLight(0xffefcc,2.2);sun.position.set(-9,16,-5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-17;sun.shadow.camera.right=17;sun.shadow.camera.top=14;sun.shadow.camera.bottom=-14;sun.shadow.normalBias=0.03;sun.shadow.bias=-0.0003;scene.add(sun);
                var fill=new THREE.DirectionalLight(0xd6e9f0,0.3);fill.position.set(7,8,10);scene.add(fill);
                buildGround();buildPlants();buildProps();buildFly();
                Habitat3D.ready=true;fly.x=600;fly.y=430;fly.altitude=0;
                food.forEach(function(f){f.x=Math.max(24,Math.min(1176,f.x/window.innerWidth*1200));f.y=Math.max(24,Math.min(776,f.y/window.innerHeight*800));var p=W.constrain(f.x,f.y,0);f.x=p.x;f.y=p.y;});
                if(!food.length){Habitat3D.placeFood(665,440);Habitat3D.placeFood(385,545);Habitat3D.placeFood(730,260);}
                bindInteractions();Habitat3D.setActive(true);setView('overview',true);
                resizeObserver=new ResizeObserver(resize);resizeObserver.observe(document.getElementById('toolbar'));resizeObserver.observe(document.getElementById('left-panel'));window.addEventListener('resize',resize);
                renderer.domElement.addEventListener('webglcontextlost',function(e){e.preventDefault();Habitat3D.setActive(false);document.getElementById('habitat3dBtn').disabled=true;document.getElementById('habitat3dBtn').title='Rechargez la page pour restaurer la vue 3D.';});
            }catch(e){
                console.warn('Habitat3D: falling back to the 2D simulation.',e);Habitat3D.ready=false;Habitat3D.active=false;container.hidden=true;document.body.classList.remove('habitat-mode');document.getElementById('canvas').style.display='';
                var b=document.getElementById('habitat3dBtn');b.disabled=true;b.textContent='3D indisponible';b.title='Le navigateur ne permet pas de créer la scène WebGL.';
                if(controls)controls.dispose();if(renderer)renderer.dispose();
            }
        },
        setActive:function(active){
            if(!Habitat3D.ready)return;
            cancelGesture();Habitat3D.active=active;container.hidden=!active;document.getElementById('canvas').style.display=active?'none':'';document.body.classList.toggle('habitat-mode',active);
            var b=document.getElementById('habitat3dBtn');b.textContent=active?'Habitat 3D':'Vue 2D';b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
            if(active){resize();updateHud();}
        },
        placeFood:function(x,y){
            if(!W.isFree(x,y,0.5))return false;
            food.push({x:x,y:y,radius:10,feedStart:0,feedDuration:0,eaten:0});return true;
        },
        focus:function(){setView('follow');},
        zoom:function(factor){cameraMove=null;v1.copy(camera.position).sub(controls.target);var distance=Math.max(controls.minDistance,Math.min(controls.maxDistance,v1.length()/factor));camera.position.copy(controls.target).add(v1.setLength(distance));controls.update();},
        advance:function(dt){
            if(!Habitat3D.ready)return;
            dt=Math.min(dt,100)/1000;elapsed+=dt;
            var airborne=behavior.current==='fly'||(behavior.current==='startle'&&behavior.startlePhase==='burst');
            var target=airborne?1.7+Math.sin(elapsed*3)*0.18:0;
            if(window.FlyController && FlyController.isActive()) {
                var motor=FlyController.getMotion();target=motor?motor.altitude:0;
            }
            fly.altitude=(fly.altitude||0)+(target-(fly.altitude||0))*(1-Math.exp(-dt*5));
            if(!airborne&&fly.altitude<0.005)fly.altitude=0;
        },
        render:function(dt){
            if(!Habitat3D.ready)return;
            dt=Math.min(dt||16.67,100)/1000;
            animateFly();
            if(!Habitat3D.active||(window.Brain3D&&Brain3D.active))return;
            var lite=!!window.liteModeActive;
            if(lite!==lastQuality){renderer.setPixelRatio(lite?1:Math.min(window.devicePixelRatio||1,1.75));renderer.shadowMap.enabled=!lite;lastQuality=lite;resize();}
            var light=BRAIN.stimulate.lightLevel;
            sun.intensity=0.1+light*1.2;ambient.intensity=0.23+light*0.51;renderer.toneMappingExposure=0.65+light*0.25;
            container.dataset.light=light===0?'night':light===0.5?'dim':'day';
            scene.background.setHex(light===0?0x273b42:light===0.5?0x83938a:0xbfcab5);scene.fog.color.copy(scene.background);
            syncFood();
            if(!reducedMotion&&!lite){plants.forEach(function(p){p.root.rotation.z=Math.sin(elapsed*0.7+p.phase)*(0.012+(BRAIN.stimulate.wind?BRAIN.stimulate.windStrength*0.08:0));});rippleMeshes.forEach(function(r,i){r.material.opacity=0.12+Math.sin(elapsed*1.5+i)*0.08;});}
            if(cameraMove){
                cameraMove.time=Math.min(1,cameraMove.time+dt*1.6);var t=cameraMove.time;var eased=t*t*(3-2*t);camera.position.lerpVectors(cameraMove.from,cameraMove.to,eased);controls.target.lerpVectors(cameraMove.fromTarget,cameraMove.target,eased);if(t===1)cameraMove=null;
            }else if(follow){v2.copy(flyRoot.position).sub(controls.target).multiplyScalar(1-Math.exp(-dt*4));controls.target.add(v2);camera.position.add(v2);}
            controls.update();
            var distance=camera.position.distanceTo(controls.target);
            scene.fog.near=distance+12;scene.fog.far=distance+90;
            renderer.render(scene,camera);
            if(elapsed-lastHud>0.2){updateHud();lastHud=elapsed;}
        }
    };
})();
