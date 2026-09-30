"""Original voxel fly, exported as an animated self-contained glTF 2.0 asset."""
import base64, json, math, struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'flycoder/assets'
ROOT.mkdir(parents=True,exist_ok=True)
colors={'body':'#586778','dark':'#303d4d','light':'#8c9cae','eye':'#edc76a','shade':'#c19345','shine':'#fff3c3','wing':'#b6deeb','edge':'#84b8cc','leg':'#435365'}
boxes=[]
def box(name,pos,size,color,part='body'):
 boxes.append(dict(name=name,position=pos,size=size,color=colors[color],part=part))
box('thorax',[0,0,0],[.95,.78,.92],'body')
box('thorax-cap',[0,.45,-.03],[.72,.15,.7],'light')
box('abdomen',[0,-.12,.75],[.76,.62,.78],'dark')
box('abdomen-tip',[0,-.15,1.22],[.5,.45,.3],'body')
for z in [.55,.85,1.1]: box('abdomen-band'+str(z),[0,.21,z],[.7,.09,.11],'light')
box('head',[0,.05,-.77],[1.04,.8,.66],'dark')
for side in [-1,1]:
 box('cheek'+str(side),[side*.53,.03,-.81],[.18,.55,.5],'body')
 box('eye'+str(side),[side*.32,.15,-1.14],[.44,.55,.12],'eye')
 box('eye-shadow'+str(side),[side*.32,-.07,-1.22],[.42,.14,.07],'shade')
 box('eye-glint'+str(side),[side*.32-.07,.3,-1.22],[.14,.16,.04],'shine')
 box('antenna-base'+str(side),[side*.29,.57,-.97],[.1,.3,.1],'leg')
 box('antenna-tip'+str(side),[side*.4,.75,-.98],[.22,.1,.12],'light')
 for i,z in enumerate([-.43,.03,.52]):
  box('leg-hip'+str(side)+str(i),[side*.63,-.35,z],[.36,.12,.13],'leg')
  box('leg-knee'+str(side)+str(i),[side*.81,-.55,z+.12],[.12,.4,.13],'leg')
  box('foot'+str(side)+str(i),[side*.9,-.78,z+.03],[.3,.1,.33],'dark')
 part='wingL' if side<0 else 'wingR'
 for i in range(5):
  x=side*(.8+i*.2);z=.18+i*.13
  box(part+str(i),[x,.36,z],[.22,.06,.72 if i<3 else .55],'wing',part)
 box(part+'edge',[side*1.22,.39,.65],[.74,.025,.06],'edge',part)
asset={'name':'Pip — FlyCoder voxel fly','license':'MIT','boxes':boxes,'animations':['idle','working','reward','rest']}
(ROOT/'fly.json').write_text(json.dumps(asset,indent=2)+'\n')
# Shared 24-vertex flat-shaded cube, plus wing flap animation.
faces=[([1,0,0],[(.5,-.5,-.5),(.5,.5,-.5),(.5,.5,.5),(.5,-.5,.5)]),([-1,0,0],[(-.5,-.5,.5),(-.5,.5,.5),(-.5,.5,-.5),(-.5,-.5,-.5)]),([0,1,0],[(-.5,.5,-.5),(-.5,.5,.5),(.5,.5,.5),(.5,.5,-.5)]),([0,-1,0],[(-.5,-.5,.5),(-.5,-.5,-.5),(.5,-.5,-.5),(.5,-.5,.5)]),([0,0,1],[(-.5,-.5,.5),(.5,-.5,.5),(.5,.5,.5),(-.5,.5,.5)]),([0,0,-1],[(.5,-.5,-.5),(-.5,-.5,-.5),(-.5,.5,-.5),(.5,.5,-.5)])]
pos=[];norm=[];idx=[]
for i,(n,vs) in enumerate(faces):
 for v in vs: pos+=v;norm+=n
 idx += [i*4+j for j in [0,1,2,0,2,3]]
buff=bytearray();views=[];access=[]
def add(values,fmt,kind,count,component,minval=None,maxval=None):
 while len(buff)%4:buff.append(0)
 offset=len(buff);data=struct.pack('<'+fmt*len(values),*values);buff.extend(data)
 views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
 a={'bufferView':len(views)-1,'componentType':component,'count':count,'type':kind}
 if minval is not None:a['min']=minval;a['max']=maxval
 access.append(a);return len(access)-1
p=add(pos,'f','VEC3',24,5126,[-.5]*3,[.5]*3);n=add(norm,'f','VEC3',24,5126);ind=add(idx,'H','SCALAR',36,5123)
mats=[];meshes=[];coloridx={}
for color in colors.values():
 rgb=[int(color[i:i+2],16)/255 for i in [1,3,5]]
 coloridx[color]=len(mats);mats.append({'name':color,'pbrMetallicRoughness':{'baseColorFactor':rgb+[1],'metallicFactor':.05,'roughnessFactor':.7}})
 meshes.append({'primitives':[{'attributes':{'POSITION':p,'NORMAL':n},'indices':ind,'material':len(mats)-1}]})
nodes=[{'name':'Pip','children':[1,2,3]},{'name':'body','children':[]},{'name':'wingL','children':[]},{'name':'wingR','children':[]}]
for b in boxes:
 parent={'body':1,'wingL':2,'wingR':3}[b['part']];nodes[parent]['children'].append(len(nodes));nodes.append({'name':b['name'],'mesh':coloridx[b['color']],'translation':b['position'],'scale':b['size']})
times=add([0,.12,.24],'f','SCALAR',3,5126,[0],[.24]);samplers=[];channels=[]
for node,sgn in [(2,-1),(3,1)]:
 q=[]
 for a in [0,sgn*.35,0]:q += [0,0,math.sin(a/2),math.cos(a/2)]
 out=add(q,'f','VEC4',3,5126);samplers.append({'input':times,'output':out,'interpolation':'LINEAR'});channels.append({'sampler':len(samplers)-1,'target':{'node':node,'path':'rotation'}})
gltf={'asset':{'version':'2.0','generator':'FlyCoder voxel builder'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'meshes':meshes,'materials':mats,'buffers':[{'byteLength':len(buff),'uri':'data:application/octet-stream;base64,'+base64.b64encode(buff).decode()}],'bufferViews':views,'accessors':access,'animations':[{'name':'Wing flutter','samplers':samplers,'channels':channels}]}
(ROOT/'fly.gltf').write_text(json.dumps(gltf,separators=(',',':'))+'\n')
print(f'Generated {len(boxes)} voxels and animated glTF')
