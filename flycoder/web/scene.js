/* Original voxel geometry; deterministic animation responds to harness events. */
(async function(){
 const canvas=document.getElementById('fly-canvas');
 let renderer;
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:true});}catch{document.getElementById('fly-description').textContent='La vue 3D nécessite WebGL. Le moteur reste disponible.';return;}
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x1c232c,0);renderer.shadowMap.enabled=true;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,100);
 camera.position.set(3.5,2.5,-4.6);camera.lookAt(0,0,0);
 scene.add(new THREE.AmbientLight(0xc9e2f5,.75));const light=new THREE.DirectionalLight(0xffecc5,1.2);light.position.set(-3,6,-4);light.castShadow=true;light.shadow.mapSize.set(512,512);scene.add(light);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.ShadowMaterial({opacity:.17}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.02;floor.receiveShadow=true;scene.add(floor);
 const grid=new THREE.GridHelper(5.5,22,0x37424e,0x2b3541);grid.position.y=-1.01;scene.add(grid);
 const fly=new THREE.Group(),parts={body:new THREE.Group(),wingL:new THREE.Group(),wingR:new THREE.Group()};Object.values(parts).forEach(p=>fly.add(p));scene.add(fly);
 const asset=await fetch('/assets/fly.json').then(r=>r.json());const geo=new THREE.BoxGeometry(1,1,1),materials={};
 for(const box of asset.boxes){const mat=materials[box.color]||(materials[box.color]=new THREE.MeshStandardMaterial({color:box.color,roughness:.7,metalness:.05}));const mesh=new THREE.Mesh(geo,mat);mesh.position.set(...box.position);mesh.scale.set(...box.size);mesh.castShadow=true;mesh.receiveShadow=true;parts[box.part].add(mesh);}
 let state='idle',rewardUntil=0;window.flyScene={setState:s=>{state=s;if(s==='reward')rewardUntil=performance.now()+2400;}};
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let last=0;
 function render(t){requestAnimationFrame(render);if(document.hidden||t-last<40)return;last=t;const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
 if(canvas.width!==Math.round(rect.width*renderer.getPixelRatio())||canvas.height!==Math.round(rect.height*renderer.getPixelRatio())){renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();}
 const seconds=t/1000,busy=state==='working',reward=state==='reward'&&t<rewardUntil;
 if(!reduced.matches){fly.position.y=reward?.2+Math.sin(seconds*10)*.16:busy?.12+Math.sin(seconds*5)*.035:Math.sin(seconds*1.5)*.035;fly.rotation.y=reward?Math.sin(seconds*6)*.2:Math.sin(seconds*.4)*.08;const flap=Math.sin(seconds*(busy?45:reward?55:7))*(busy?.4:reward?.6:.045);parts.wingL.rotation.z=flap;parts.wingR.rotation.z=-flap;}else{fly.position.y=0;parts.wingL.rotation.z=0;parts.wingR.rotation.z=0;}
 renderer.render(scene,camera);
 }requestAnimationFrame(render);
})();
