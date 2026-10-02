'use strict';
const $=id=>document.getElementById(id),token=document.querySelector('meta[name="flycoder-token"]').content;
const state={data:null,run:null,view:'work',tab:'conversation',transcribed:false,brain:null,freeze:false,busy:false,selectedNode:null};
const labels={running:'En cours',passed:'Tests réussis',failed:'Tests en échec',error:'Erreur',cancelled:'Arrêtée',unverified:'À vérifier',done:'Terminée'};
const roles={h:'Contrôleur',p:'Architecte',c:'Codeur',r:'Relecteur',v:'Vérificateur'};
const strategies={inspect:'Explorer puis coder',test_first:'Tester puis corriger',direct:'Correction directe'};
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
async function api(url,body){const r=await fetch(url,body?{method:'POST',headers:{'content-type':'application/json','x-flycoder-token':token},body:JSON.stringify(body)}:{});const value=await r.json();if(!r.ok)throw new Error(value.error||`HTTP ${r.status}`);return value;}
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),6500);}
function action(fn){return async e=>{try{await fn(e);}catch(error){toast(error.message);}};}
function view(name){state.view=name;document.querySelectorAll('.view').forEach(n=>n.classList.toggle('active',n.id==='view-'+name));document.querySelectorAll('.nav').forEach(n=>n.classList.toggle('active',n.dataset.view===name));if(name==='brain')drawBrain();}
function busy(value){state.busy=value;$('send').disabled=value;$('train').disabled=value;$('evaluate').disabled=value;$('install-model').disabled=value;$('stop').hidden=!value;$('new-task').disabled=value;$('fly-state').textContent=value?'Au travail':'Au repos';}
async function refresh(){
 const data=await api('/api/state');state.data=data;busy(data.busy);
 $('project').textContent=data.workspace.split('/').filter(Boolean).slice(-2).join(' / ');$('project').title=data.workspace;
 $('model-name').textContent=data.model;$('context-size').textContent=data.numCtx.toLocaleString('fr-FR');
 $('model-status').classList.toggle('off',!data.ollama.installed);$('model-status').querySelector('span').textContent=data.ollama.installed?(data.model.startsWith('flycoder0.1beta')?'Qwen3.5':data.model)+' · '+(data.localInference?'local':'hôte distant'):data.ollama.available?'Modèle à installer':'Ollama indisponible';
 $('settings-json').textContent=JSON.stringify({workspace:data.workspace,model:data.model,numCtx:data.numCtx,execution:data.execution,checks:data.checks},null,2);
 document.querySelector('.companion-footnote').textContent=data.localInference?'Tout reste local. Les mesures viennent de vos exécutions.':'Le contexte est transmis à votre hôte d’inférence configuré.';renderHistory(data.runs);renderStats(data);updateBrain(data.brain);renderTraining(data);
 if(data.activeId&&!state.run)await loadRun(data.activeId);
}
function renderHistory(runs){$('run-count').textContent=runs.length;$('history').replaceChildren();if(!runs.length)$('history').append(el('p','muted','Votre première mission apparaîtra ici.'));
 for(const r of runs){const b=el('button',r.status+(state.run?.id===r.id?' current':''),r.task);b.title=r.task+' — '+(labels[r.status]||r.status);b.onclick=action(()=>loadRun(r.id));$('history').append(b);}}
function renderStats(data){const runs=data.runs,verified=runs.filter(r=>['passed','failed'].includes(r.status)),passed=runs.filter(r=>r.status==='passed').length,day=d=>d.slice(0,10),counts={};
 for(const r of runs)if(r.at)counts[day(r.at)]=(counts[day(r.at)]||0)+1;
 $('stat-runs').textContent=runs.length.toLocaleString('fr-FR');$('stat-passed').textContent=verified.length?passed+' / '+verified.length:'—';$('stat-days').textContent=Object.keys(counts).length;
 $('stat-reward').textContent=(data.brain.totalReward>0?'+':'')+Number(data.brain.totalReward.toFixed(2));$('stat-episodes').textContent=data.brain.episodes;$('stat-model').textContent=data.model;$('stat-model').title=data.model;
 const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-start.getDay()-25*7);$('heat').replaceChildren();
 for(let i=0;i<182;i++){const d=new Date(start);d.setDate(start.getDate()+i);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),n=counts[key]||0,c=el('i',n?'l'+Math.min(4,n):null);c.title=key+' · '+n+' mission'+(n>1?'s':'');$('heat').append(c);}
 $('stats-foot').textContent=data.localInference?'Qwen3.5 pour le code. FlyBrain pour orienter l’effort. Tout reste sur votre machine.':'Qwen3.5 pour le code. FlyBrain pour orienter l’effort.';}
async function loadRun(id){state.run=await api('/api/run?id='+encodeURIComponent(id));renderRun();view('work');}
function newTask(){state.run=null;$('welcome').hidden=false;$('run-content').hidden=true;$('task-title').replaceChildren(document.createTextNode('Un petit cerveau.'),el('br'),document.createTextNode('De grandes idées à coder.'));$('run-state').textContent='Prête à apprendre';$('run-state').className='state-badge';$('prompt').value='';view('work');$('prompt').focus();renderPackets();}
function renderRun(){const r=state.run;if(!r)return;$('welcome').hidden=true;$('run-content').hidden=false;$('task-title').textContent=r.task.length>110?r.task.slice(0,107)+'…':r.task;$('task-title').title=r.task;$('run-state').textContent=labels[r.status]||r.status;$('run-state').className='state-badge '+r.status;
 $('conversation').replaceChildren();for(const e of r.events||[])appendConversation(e);
 if(r.error)$('conversation').append(el('p','tool-row error',r.error));
 $('change-count').textContent=r.changes?.length||0;$('changes').replaceChildren();
 for(const c of r.changes||[]){const d=el('details');d.append(el('summary',null,(c.status==='added'?'+ ':'~ ')+c.path));d.append(el('pre',null,c.content??'Fichier binaire'));$('changes').append(d);}
 if(!r.changes?.length)$('changes').append(el('p','empty','Aucun fichier modifié pour cette mission.'));
 $('checks').replaceChildren();for(const check of r.checks||[])appendCheck(check);
 if(!r.checks?.length)$('checks').append(el('p','empty','Aucun test exécuté. Configurez checks dans .flycoder.json pour obtenir une vérification et une récompense.'));
 $('run-actions').hidden=!['passed','failed','unverified'].includes(r.status);$('apply').disabled=!r.changes?.length||r.baseWorkspace!==state.data?.workspace;$('apply').textContent=r.baseWorkspace!==state.data?.workspace?'Exercice isolé':'Appliquer les fichiers';$('feedback-good').disabled=!!r.feedback;$('feedback-bad').disabled=!!r.feedback;
 $('strategy').textContent=strategies[r.decision?.name]||'En attente';$('reward').textContent=r.reward===null?'Non évaluée':r.reward>0?'+'+r.reward:r.reward;
 if(r.brain)updateBrain(r.brain);renderPackets();
 for(const role of ['p','c','r']){const e=r.events?.filter(e=>e.type==='agent'&&e.role===role).at(-1);$('agent-'+role).textContent=e?.status==='working'&&r.status==='running'?'Au travail':e?.status==='limited'?'Budget atteint':e?'Terminé':'En attente';}
 const metric=r.events?.filter(e=>e.type==='metrics').at(-1);if(metric)renderMetric(metric);
 const check=r.checks?.at(-1);if(check)renderCheckStatus(check);
}
function appendConversation(e){if(e.type==='message'){const m=el('article','message '+e.role);m.append(el('div','message-header',roles[e.role]||e.role));m.append(el('pre',null,e.content));$('conversation').append(m);}
 if(e.type==='tool_result')$('conversation').append(el('div','tool-row'+(!e.result.ok?' error':''),(e.result.ok?'✓ ':'✗ ')+e.call.function.name+' · '+e.result.content.slice(0,180)));}
function appendCheck(c){const d=el('article','check-row'+(!c.ok?' failed':''));d.append(el('h3',null,(c.ok?'✓ ':'✗ ')+c.name+' · '+c.durationMs+' ms · '+c.execution));d.append(el('pre',null,c.output||`Code de sortie : ${c.exitCode}`));$('checks').append(d);}
function renderCheckStatus(c){$('check-status').replaceChildren();$('check-status').append(el('span','check-icon',c.ok?'✓':'×'));const d=el('div');d.append(el('strong',null,c.ok?'Dernier test réussi':'Dernier test en échec'));d.append(el('p',null,c.name+' · '+c.durationMs+' ms'));$('check-status').append(d);}
function renderMetric(e){$('throughput').textContent=e.tokensPerSecond===null?'Indisponible':e.tokensPerSecond+' tok/s';}
function humanPacket(packet){
 const p=packet[5];if(typeof p==='string')return p;if(!p||typeof p!=='object')return String(p);
 if(packet[4]==='check')return 'Vérification « '+p.name+' » : '+(p.ok?'réussie':'en échec')+'.\nCode de sortie : '+p.exitCode+' · Durée : '+p.durationMs+' ms\n'+(p.output||'');
 if(packet[4]==='reward')return 'Récompense : '+(p.reward>0?'+':'')+p.reward+'\n'+(p.checks||[]).map(c=>c.name+' : '+(c.ok?'réussi':'échec')).join('\n');
 const lines=[];if(p.task)lines.push('Mission : '+p.task);if(p.plan)lines.push('Plan : '+p.plan);if(p.report)lines.push('Rapport : '+p.report);if(p.strategy)lines.push('Stratégie : '+(strategies[p.strategy]||p.strategy));if(p.changedPaths)lines.push('Fichiers : '+p.changedPaths.join(', '));if(p.instruction)lines.push('Consigne : '+p.instruction);if(p.failures)lines.push('Vérifications en échec :\n'+p.failures.map(f=>f.name+'\n'+f.output).join('\n'));return lines.length?lines.join('\n\n'):JSON.stringify(p,null,2);
}
function renderPackets(){const packets=state.run?.events?.filter(e=>e.type==='packet')||[];$('packets').replaceChildren();if(!packets.length)$('packets').append(el('div','empty','Lancez une mission pour suivre les échanges réels.'));
 let compact=0,expanded=0;
 for(const e of packets){const p=e.packet;compact+=e.compactBytes||0;expanded+=e.expandedBytes||0;const d=el('div','packet');d.append(el('div','packet-label',roles[p[2]]+' → '+roles[p[3]]+' · '+p[4]));d.append(el('pre',null,state.transcribed?humanPacket(p):JSON.stringify(p)));$('packets').append(d);}
 $('wire-size').textContent=packets.length?`${packets.length} messages · ${compact.toLocaleString('fr-FR')} octets · ${expanded?Math.round((1-compact/expanded)*100):0} % de moins qu’un JSON développé`:'Aucun échange';
 $('transcribe').textContent=state.transcribed?'Afficher FlyLink':'Transcrire les échanges';$('transcribe').setAttribute('aria-pressed',String(state.transcribed));}
function renderTraining(data){$('episodes').textContent=data.brain.episodes;$('total-reward').textContent=Number(data.brain.totalReward.toFixed(2));$('validation-score').textContent=data.evaluation?data.evaluation.passed+'/'+data.evaluation.total:'—';$('training-results').replaceChildren();
 for(const report of [data.training,data.evaluation].filter(Boolean)){for(const r of report.results){const d=el('div','training-result');d.append(el('b',null,r.status==='passed'?'✓':'×'),el('span',null,r.task),el('span',null,r.language+' · '+Math.round(r.durationMs/1000)+' s · '+(report.split==='holdout'?'validation':'entraînement')));$('training-results').append(d);}}
 if(!$('training-results').children.length)$('training-results').append(el('p','empty','Aucun entraînement enregistré.'));}
function updateBrain(brain){if(state.freeze)return;state.brain=brain;$('brain-count').textContent=brain.nodes.length+' unités · '+brain.edges.length+' connexions';$('episodes').textContent=brain.episodes;$('total-reward').textContent=Number(brain.totalReward.toFixed(2));if(state.view==='brain')drawBrain();}
let plotted=[];
function drawBrain(){const canvas=$('brain-canvas'),b=state.brain;if(!b)return;const rect=canvas.getBoundingClientRect();if(!rect.width)return;const ratio=Math.min(devicePixelRatio,2);canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);const w=rect.width,h=rect.height;ctx.clearRect(0,0,w,h);
 const func=b.nodes.filter(n=>n.kind==='functional'),sparse=b.nodes.filter(n=>n.kind==='sparse'),policy=b.nodes.filter(n=>n.kind==='policy');plotted=[];
 const colors={functional:'#a7d8eb',sparse:'#b7aacd',policy:'#edc76a'};
 func.forEach((n,i)=>{const half=i%2,count=Math.ceil(func.length/2),angle=Math.floor(i/2)/count*Math.PI*2;plotted.push({...n,x:w*(half?.33:.16)+Math.cos(angle)*w*.09,y:h*.45+Math.sin(angle)*h*.29,color:colors.functional});});
 sparse.forEach((n,i)=>plotted.push({...n,x:w*.5+(i%8)*w*.032,y:h*.2+Math.floor(i/8)*h*.067,color:colors.sparse}));
 policy.forEach((n,i)=>plotted.push({...n,x:w*.88,y:h*(.28+i*.17),color:colors.policy}));const byId=Object.fromEntries(plotted.map(n=>[n.id,n]));
 for(const edge of b.edges){const a=byId[edge.from],z=byId[edge.to];if(!a||!z)continue;const selected=state.selectedNode===a.id||state.selectedNode===z.id;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(z.x,z.y);ctx.strokeStyle=selected?(edge.weight<0?'#f29b9b88':'#edc76a99'):(edge.trainable?'#b7aacd13':'#a7d8eb1b');ctx.lineWidth=selected?1.1:.6;ctx.stroke();}
 for(const n of plotted){const radius=n.kind==='policy'?7:2.6+Math.max(0,n.value)*2;ctx.beginPath();ctx.arc(n.x,n.y,radius,0,Math.PI*2);ctx.globalAlpha=.4+.6*Math.max(0,n.value);ctx.fillStyle=n.color;ctx.fill();ctx.globalAlpha=1;if(n.id===state.selectedNode){ctx.beginPath();ctx.arc(n.x,n.y,radius+5,0,Math.PI*2);ctx.strokeStyle='#edc76a';ctx.stroke();}}
 ctx.font='10px -apple-system,sans-serif';ctx.fillStyle='#a7b2c1';ctx.textAlign='center';ctx.fillText('Circuits fonctionnels',w*.25,h*.1);ctx.fillText('Kenyon sparse',w*.615,h*.1);ctx.fillText('Routage',w*.88,h*.1);
 if(state.selectedNode){const n=byId[state.selectedNode];if(n){const edges=b.edges.filter(e=>e.from===n.id||e.to===n.id);$('neuron-detail').textContent=`${n.id} · activation ${n.value.toFixed(4)} · ${edges.length} connexions${n.bias!==undefined?' · biais '+n.bias.toFixed(4):''}. ${edges.slice(0,3).map(e=>e.from+' → '+e.to+' : '+e.weight.toFixed(3)).join(' ; ')}`;}}
}
$('brain-canvas').addEventListener('click',e=>{const rect=e.currentTarget.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;const found=plotted.map(n=>({...n,d:Math.hypot(n.x-x,n.y-y)})).sort((a,b)=>a.d-b.d)[0];if(found?.d<24){state.selectedNode=found.id;drawBrain();}});
$('brain-canvas').addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft'].includes(e.key))return;e.preventDefault();const i=plotted.findIndex(n=>n.id===state.selectedNode);state.selectedNode=plotted[(i+(e.key==='ArrowRight'?1:-1)+plotted.length)%plotted.length]?.id;drawBrain();});
new ResizeObserver(()=>{if(state.view==='brain')drawBrain();}).observe($('brain-canvas'));
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>view(b.dataset.view);
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{state.tab=b.dataset.tab;for(const t of document.querySelectorAll('[data-tab]')){t.classList.toggle('selected',t===b);t.setAttribute('aria-selected',String(t===b));}for(const id of ['conversation','changes','checks'])$(id).hidden=id!==state.tab;};
for(const b of document.querySelectorAll('[data-prompt]'))b.onclick=()=>{$('prompt').value=b.dataset.prompt;$('mode').value=b.dataset.mode;$('prompt').focus();};
$('new-task').onclick=newTask;$('transcribe').onclick=()=>{state.transcribed=!state.transcribed;renderPackets();};$('brain-pause').onclick=()=>{state.freeze=!state.freeze;$('brain-pause').textContent=state.freeze?'Reprendre':'Figer la vue';$('brain-pause').setAttribute('aria-pressed',String(state.freeze));if(!state.freeze)refresh().catch(e=>toast(e.message));};
$('composer').onsubmit=action(async e=>{e.preventDefault();if(state.busy)return;const task=$('prompt').value.trim();if(!task)return;await api('/api/run',{task,mode:$('mode').value});busy(true);$('prompt').value='';$('fly-caption').textContent='Une mission sous les ailes.';$('fly-description').textContent='Suivez les fichiers, les tests et les échanges au fur et à mesure.';});
$('stop').onclick=action(async()=>{await api('/api/stop',{});toast('Arrêt demandé. Le calcul et les tests en cours sont interrompus.');});
$('apply').onclick=action(async()=>{const r=await api('/api/apply',{id:state.run.id});toast(r.applied.length+' fichier(s) appliqué(s) au projet.');$('apply').disabled=true;});
for(const [id,value]of [['feedback-good',1],['feedback-bad',-1]])$(id).onclick=action(async()=>{const r=await api('/api/feedback',{id:state.run.id,value});state.run.feedback=r.feedback;updateBrain(r.brain);$('feedback-good').disabled=true;$('feedback-bad').disabled=true;toast('Feedback enregistré. Les poids du routage ont été ajustés.');});
for(const [id,evaluate]of [['train',false],['evaluate',true]])$(id).onclick=action(async()=>{await api('/api/train',{evaluate});busy(true);$('training-progress').textContent='Démarrage…';toast(evaluate?'Évaluation lancée.':'Entraînement lancé.');});
$('settings-open').onclick=()=>$('settings').showModal();$('model-status').onclick=()=>$('settings').showModal();$('install-model').onclick=action(async()=>{await api('/api/install',{});busy(true);$('install-progress').textContent='Téléchargement du modèle…';});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&state.view==='work'){e.preventDefault();$('composer').requestSubmit();}if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();if(!state.busy)newTask();}});
const stream=new EventSource('/api/events');stream.onerror=()=>{$('model-status').classList.add('off');$('model-status').querySelector('span').textContent='Reconnexion au serveur…';};
stream.onmessage=async message=>{const e=JSON.parse(message.data);try{
 if(e.type==='started'){state.run=await api('/api/run?id='+encodeURIComponent(e.id));renderRun();busy(true);return;}
 if(e.runId&&state.run?.id!==e.runId)return;
 if(state.run&&Number.isInteger(e.seq)&&state.run.events.some(x=>x.seq===e.seq)&&e.type!=='finished')return;
 if(state.run&&Number.isInteger(e.seq)&&!state.run.events.some(x=>x.seq===e.seq)){state.run.events.push(e);appendConversation(e);}
 if(e.type==='brain')updateBrain(e.brain);
 if(e.type==='agent'&&$('agent-'+e.role))$('agent-'+e.role).textContent=e.status==='working'?'Au travail':e.status==='limited'?'Budget atteint':'Terminé';
 if(e.type==='packet')renderPackets();if(e.type==='metrics')renderMetric(e);if(e.type==='check'){appendCheck(e);renderCheckStatus(e);}
 if(e.type==='error')toast(e.error);
 if(e.type==='finished'){if(state.run?.id===e.id){state.run=await api('/api/run?id='+encodeURIComponent(e.id));renderRun();}await refresh();if(e.status==='passed'){$('fly-caption').textContent='Ça passe. Ça s’apprend.';$('fly-description').textContent='Les vérifications ont réussi sur les fichiers finaux.';}else if(e.status==='error')$('fly-description').textContent='La mission a rencontré une erreur. Consultez le journal.';}
 if(e.type==='training_progress')$('training-progress').textContent=e.completed+'/'+e.total+' exercices terminés';
 if(e.type==='training_complete'){toast(e.report.passed+'/'+e.report.total+' exercices réussis.');await refresh();}
 if(e.type==='idle')await refresh();
 if(e.type==='install')$('install-progress').textContent=e.progress.status+(e.progress.total?' · '+Math.round(e.progress.completed/e.progress.total*100)+' %':'');
 if(e.type==='installed'){$('install-progress').textContent='Modèle installé.';await refresh();}
 }catch(error){toast(error.message);}};
refresh().catch(error=>toast(error.message));
