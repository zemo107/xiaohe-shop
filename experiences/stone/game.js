import * as THREE from './vendor/three.module.js';
import * as CANNON from './vendor/cannon-es.js';
import {createCollection,setupTooltips} from './collection.js';
import {createStudio} from './studio.js';
import {stoneDensity,stoneStyle,stonePalettes} from './stone.js';
import {unsupportedComponents,collisionBoxes} from './fracture.js';

const $ = s => document.querySelector(s);
let studio=null,collection=null,hasCarved=false,assisted=true,customTarget=null;
const canvas = $('#world');
const gardenImage=new Image();gardenImage.src='./assets/storybook-garden.png';
const workbenchImage=new Image();workbenchImage.src='./assets/storybook-workbench.png';
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, preserveDrawingBuffer:true}); }
catch(e) { $('#loading').innerHTML='<p>当前浏览器没有启用 WebGL，请在 Chrome 或 Safari 中开启硬件加速后重试。</p>'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor(0xf7f0db,0);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();
scene.fog=null;
const camera=new THREE.OrthographicCamera(-5,5,4,-4,.1,80);
const camRight=new THREE.Vector3(10,0,-7).normalize();
const cameraTarget=new THREE.Vector3();
const viewPan=new THREE.Vector3(),viewRight=new THREE.Vector3(10,0,-7).normalize(),viewUp=new THREE.Vector3().crossVectors(viewRight,new THREE.Vector3(7,5.3,10).normalize()).negate();
let safeView={left:16,top:110,right:innerWidth-70,bottom:innerHeight-200},spaceHeld=false,panDrag=null,lastButtons=0;
function measureWorkspace(){
 const visibleRect=selector=>{const e=document.querySelector(selector);if(!e||e.hidden||!e.getClientRects().length)return null;return e.getBoundingClientRect();};
 const bars=['.bottom-area','#decorateTools'].map(visibleRect).filter(Boolean);
 const controls=visibleRect('.side-controls'),header=visibleRect('header'),target=studio?.mode==='decorate'?null:visibleRect('.intro');
 safeView={left:16,top:Math.max(header?.bottom||0,target?.bottom||0)+14,right:(controls?.left||innerWidth)-14,bottom:Math.min(...bars.map(b=>b.top),innerHeight-16)-14};
 if(safeView.bottom-safeView.top<160)safeView.top=70;
 canvas.style.clipPath=`inset(${safeView.top}px ${innerWidth-safeView.right}px ${innerHeight-safeView.bottom}px ${safeView.left}px)`;
 updateViewCamera();
}
function updateViewCamera(){
 const unit=(camera.top-camera.bottom)/camera.zoom/innerHeight;
 cameraTarget.set(0,1.27,0).add(viewPan);
 cameraTarget.addScaledVector(viewRight,-((safeView.left+safeView.right)/2-innerWidth/2)*unit);
 cameraTarget.addScaledVector(viewUp,((safeView.top+safeView.bottom)/2-innerHeight/2)*unit);
 camera.position.copy(cameraTarget).add(new THREE.Vector3(7,5.3,10));camera.lookAt(cameraTarget);camera.updateMatrixWorld();
}
function panView(dx,dy){const unit=(camera.top-camera.bottom)/camera.zoom/innerHeight;viewPan.addScaledVector(viewRight,-dx*unit).addScaledVector(viewUp,dy*unit);if(viewPan.length()>4)viewPan.setLength(4);updateViewCamera();}

scene.add(new THREE.HemisphereLight(0xfffdf1,0x91927d,2.2));
const key=new THREE.DirectionalLight(0xfff8e8,2.6);
key.position.set(-3,8,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);
Object.assign(key.shadow.camera,{left:-7,right:7,top:7,bottom:-7,near:.1,far:22});
key.shadow.normalBias=.035;key.shadow.bias=-.0003;key.shadow.radius=4;scene.add(key);
const fill=new THREE.DirectionalLight(0xd8e6db,.5);fill.position.set(4,3,-3);scene.add(fill);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xf0efe3,roughness:1}));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.position.y=.25;floor.material=new THREE.ShadowMaterial({opacity:.055});scene.add(floor);
const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.78,.23,64),new THREE.MeshStandardMaterial({color:0xd8ddc9,roughness:1}));
pedestal.position.y=.115;pedestal.receiveShadow=true;pedestal.castShadow=true;pedestal.visible=false;scene.add(pedestal);
const top=new THREE.Mesh(new THREE.CylinderGeometry(1.69,1.7,.035,64),new THREE.MeshStandardMaterial({color:0xe6e8d9,roughness:1}));top.position.y=.243;top.receiveShadow=true;top.visible=false;scene.add(top);
const rockRoot=new THREE.Group();rockRoot.position.y=1.27;scene.add(rockRoot);
// Paint-like, three-tone shading stays on the live carved mesh.
const rockMat=new THREE.ShaderMaterial({
 uniforms:{lightPaint:{value:new THREE.Color('#b1b1d1')},middlePaint:{value:new THREE.Color('#9098bc')},darkPaint:{value:new THREE.Color('#727f9e')},speckPaint:{value:new THREE.Color('#edc9a5')}},
 vertexShader:`attribute vec4 pigment; varying vec4 painted; varying vec3 paintPosition; varying vec3 paintNormal;
 void main(){painted=pigment;paintPosition=position;paintNormal=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`varying vec4 painted;uniform vec3 lightPaint;uniform vec3 middlePaint;uniform vec3 darkPaint;uniform vec3 speckPaint;varying vec3 paintPosition;varying vec3 paintNormal;
 float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
 void main(){float light=dot(normalize(paintNormal),normalize(vec3(-0.7,1.0,1.4)));vec3 col=mix(darkPaint,middlePaint,smoothstep(-.15,-.06,light));col=mix(col,lightPaint,smoothstep(.66,.73,light));
 float grain=hash(floor(paintPosition*490.0));col*=.96+grain*.08;
 vec3 cell=floor(paintPosition*25.0);vec3 within=fract(paintPosition*25.0)-.5;float fleck=step(.987,hash(cell))*step(length(within.xy),.23);col=mix(col,speckPaint,fleck*.75);
 col=mix(col,pow(painted.rgb,vec3(2.2))*(.86+.14*max(0.0,light)),painted.a);
 gl_FragColor=vec4(col,1.0);
 #include <colorspace_fragment>
 }`
});
rockMat.defaultAttributeValues.pigment=[0,0,0,0];
let rock=new THREE.Mesh(new THREE.BufferGeometry(),rockMat);rock.castShadow=true;rockRoot.add(rock);
const inkOutline=new THREE.Mesh(rock.geometry,new THREE.MeshBasicMaterial({color:0x62677e,side:THREE.BackSide}));inkOutline.scale.setScalar(1.007);rockRoot.add(inkOutline);
const ghostMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,vertexShader:`varying vec3 n;varying vec3 eye;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);eye=-p.xyz;gl_Position=projectionMatrix*p;}`,fragmentShader:`varying vec3 n;varying vec3 eye;void main(){float edge=pow(1.0-abs(dot(normalize(n),normalize(eye))),2.2);gl_FragColor=vec4(.25,.80,.65,.12+edge*.78);}`});
let ghost=new THREE.Mesh(new THREE.BufferGeometry(),ghostMat);ghost.visible=true;ghost.renderOrder=4;rockRoot.add(ghost);
const marker=new THREE.Mesh(new THREE.RingGeometry(.065,.076,28),new THREE.MeshBasicMaterial({color:0xfaf8dc,side:THREE.DoubleSide,transparent:true,opacity:.85,depthTest:false}));marker.renderOrder=4;marker.visible=false;scene.add(marker);
// A small real 3D steel chisel follows the selected surface.
const chisel=new THREE.Group();
const steel=new THREE.Mesh(new THREE.CylinderGeometry(.026,.009,.31,5),new THREE.MeshStandardMaterial({color:0x696f63,roughness:.45,metalness:.6}));steel.position.y=.155;chisel.add(steel);
const grip=new THREE.Mesh(new THREE.CylinderGeometry(.043,.033,.19,6),new THREE.MeshStandardMaterial({color:0xa9926c,roughness:.85}));grip.position.y=.38;chisel.add(grip);chisel.visible=false;scene.add(chisel);

// Each tool has its own contact shape and gesture, not just a different radius.
// Local origin is the center of the striking face; +Y points away from stone.
const mallet=new THREE.Group();
const malletHead=new THREE.Mesh(new THREE.BoxGeometry(.23,.20,.19),new THREE.MeshStandardMaterial({color:0x696a78,roughness:.8}));malletHead.position.y=.10;mallet.add(malletHead);
const malletHandle=new THREE.Mesh(new THREE.CylinderGeometry(.033,.045,.48,7),new THREE.MeshStandardMaterial({color:0xb19265,roughness:.9}));malletHandle.rotation.z=-Math.atan2(.8,.6);malletHandle.position.set(.29*.8,.13+.29*.6,0);mallet.add(malletHandle);mallet.visible=false;scene.add(mallet);
let hammerImpact=null;
function aimHammer(point,normal,lift=0){
 const up=normal.clone().normalize();
 // Project the player direction onto the contact plane. The handle also
 // tilts outward from the head, so its grip faces the player on front surfaces.
 const towardPlayer=camera.position.clone().sub(point).normalize();
 const tangent=towardPlayer.clone().addScaledVector(up,-towardPlayer.dot(up));
 if(tangent.lengthSq()<.025){tangent.copy(viewUp).negate().addScaledVector(up,viewUp.dot(up));}
 if(tangent.lengthSq()<.01)tangent.copy(viewRight).addScaledVector(up,-viewRight.dot(up));
 tangent.normalize();const side=new THREE.Vector3().crossVectors(tangent,up).normalize();
 mallet.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent,up,side));
 mallet.position.copy(point).addScaledVector(up,lift);mallet.visible=true;
}
const sandingPad=new THREE.Group();
const abrasive=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),new THREE.MeshStandardMaterial({color:0xb5a778,roughness:1}));abrasive.scale.set(.15,.044,.11);abrasive.position.y=.025;sandingPad.add(abrasive);
const padGrip=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshStandardMaterial({color:0xd5c799,roughness:1}));padGrip.scale.set(.09,.04,.065);padGrip.position.y=.065;sandingPad.add(padGrip);sandingPad.visible=false;scene.add(sandingPad);

// Shared scalar grid. Positive density is stone. Marching tetrahedra produces a
// closed, genuinely three-dimensional surface after every subtractive strike.
const NX=65, NY=77, NZ=57, STEP=.04;
const count=NX*NY*NZ;
const field=new Float32Array(count), original=new Float32Array(count), target=new Float32Array(count);
const coords=new Float32Array(count*3);
const idx=(x,y,z)=>(y*NZ+z)*NX+x;
for(let y=0;y<NY;y++)for(let z=0;z<NZ;z++)for(let x=0;x<NX;x++){
 const i=idx(x,y,z);coords[i*3]=(x-(NX-1)/2)*STEP;coords[i*3+1]=(y-(NY-1)/2)*STEP;coords[i*3+2]=(z-(NZ-1)/2)*STEP;
 }
let stone=stoneStyle();
function paintStone(material,style){const colors=stonePalettes[style.palette];['lightPaint','middlePaint','darkPaint','speckPaint'].forEach((key,i)=>material.uniforms[key].value.set(colors[i]));}
function generateStone(style){stone=stoneStyle(style);const density=stoneDensity(stone.seed);for(let i=0;i<count;i++)original[i]=density(coords[i*3],coords[i*3+1],coords[i*3+2]);paintStone(rockMat,stone);inkOutline.material.color.set(stonePalettes[stone.palette][4]);}
function randomStone(){const seed=crypto.getRandomValues(new Uint32Array(1))[0]||1;return {seed,palette:(stone.palette+1+Math.floor(Math.random()*(stonePalettes.length-1)))%stonePalettes.length};}
generateStone(stone);
const offsets=[0,1,1+NX, NX, NX*NZ, NX*NZ+1,NX*NZ+1+NX,NX*NZ+NX];
// corners: lower y plane (x,z), then upper y plane
const tets=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
function makeGeometry(values,colored=true){
 const pos=[],colors=[];
 function interpolate(a,b){const t=values[a]/(values[a]-values[b]);return [coords[a*3]+t*(coords[b*3]-coords[a*3]),coords[a*3+1]+t*(coords[b*3+1]-coords[a*3+1]),coords[a*3+2]+t*(coords[b*3+2]-coords[a*3+2])];}
 function triangle(a,b,c,inside){
  const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],ac=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  if(normal[0]*(coords[inside*3]-a[0])+normal[1]*(coords[inside*3+1]-a[1])+normal[2]*(coords[inside*3+2]-a[2])>0)[b,c]=[c,b];
  pos.push(...a,...b,...c);
  if(colored){const v=.96+.015*Math.sin(a[0]*41+a[1]*23+a[2]*57);for(let n=0;n<3;n++)colors.push(v,v*.999,v*.973);}
 }
 for(let y=0;y<NY-1;y++)for(let z=0;z<NZ-1;z++)for(let x=0;x<NX-1;x++){
  const base=idx(x,y,z);let mask=0;for(let j=0;j<8;j++)if(values[base+offsets[j]]>0)mask|=1<<j;if(mask===0||mask===255)continue;
  const corners=offsets.map(o=>base+o);
  for(const tet of tets){const ins=[],out=[];for(const j of tet)(values[corners[j]]>0?ins:out).push(corners[j]);
   if(ins.length===1)triangle(interpolate(ins[0],out[0]),interpolate(ins[0],out[1]),interpolate(ins[0],out[2]),ins[0]);
   else if(ins.length===3)triangle(interpolate(ins[0],out[0]),interpolate(ins[1],out[0]),interpolate(ins[2],out[0]),ins[0]);
   else if(ins.length===2){const a=interpolate(ins[0],out[0]),b=interpolate(ins[0],out[1]),c=interpolate(ins[1],out[0]),d=interpolate(ins[1],out[1]);triangle(a,b,c,ins[0]);triangle(b,d,c,ins[0]);}
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));if(colored)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
 // Weld coincident normals to remove the dense triangular appearance without
 // lowering carving resolution or changing the actual surface.
 if(colored){const ns=g.attributes.normal.array,ps=g.attributes.position.array,averages=new Map();
 for(let i=0;i<ps.length;i+=3){const key=`${Math.round(ps[i]*100000)},${Math.round(ps[i+1]*100000)},${Math.round(ps[i+2]*100000)}`;let n=averages.get(key);if(!n){n=[0,0,0];averages.set(key,n);}n[0]+=ns[i];n[1]+=ns[i+1];n[2]+=ns[i+2];}
 for(let i=0;i<ps.length;i+=3){const key=`${Math.round(ps[i]*100000)},${Math.round(ps[i+1]*100000)},${Math.round(ps[i+2]*100000)}`;const n=averages.get(key),l=Math.hypot(...n)||1;ns[i]=n[0]/l;ns[i+1]=n[1]/l;ns[i+2]=n[2]/l;}}
 if(colored){if(studio)studio.colorGeometry(g);else g.setAttribute('pigment',new THREE.BufferAttribute(new Float32Array(pos.length/3*4),4));}
 g.computeBoundingSphere();return g;
}
let history=[],tool='fine',targetID=0,strikes=0,awarded=false;
function captureState(){return {field:field.slice(),fragments:captureFragments(),art:studio?.snapshot()};}
function lockBlueprint(){hasCarved=true;updateBlueprintLock();}
function updateBlueprintLock(){for(const id of ['nextTarget','drawBlueprint']){const button=$('#'+id);button.disabled=hasCarved;}const button=$('#drawBlueprint');button.dataset.tooltip=hasCarved?'已开始雕刻，换新石头后可更换图纸':'自绘立体图纸';}
function recordState(state){history.push(state);if(history.length>30)history.shift();updateScore();}
function safeDensity(i,value){return assisted?Math.max(value,Math.min(field[i],target[i]+.006)):value;}
let lastCut=null,streak=0,blade=1,zoom=1,latestPointer=null;
const cracks=new THREE.Group();rockRoot.add(cracks);
const crackMaterial=new THREE.LineBasicMaterial({color:0x606552,transparent:true,opacity:.5});
function clearCracks(){for(const c of [...cracks.children]){c.geometry.dispose();cracks.remove(c);}}
function addCracks(center,normal,strength){
 clearCracks();if(strength<2)return;const u=new THREE.Vector3(0,1,0);if(Math.abs(normal.y)>.9)u.set(1,0,0);u.cross(normal).normalize();const v=normal.clone().cross(u).normalize();
 const points=[];for(let branch=0;branch<Math.min(5,strength);branch++){let a=branch*2.4+center.y*19;let previous=null;for(let j=1;j<=5;j++){let r=.04+j*.025*(1+strength*.12);let sample=center.clone().addScaledVector(u,Math.cos(a+j*.15)*r).addScaledVector(v,Math.sin(a+j*.15)*r);const world=rockRoot.localToWorld(sample.clone().addScaledVector(normal,.6));const dir=normal.clone().transformDirection(rockRoot.matrixWorld).negate();const probe=new THREE.Raycaster(world,dir,0,1.2);const hit=probe.intersectObject(rock)[0];if(!hit){previous=null;continue;}const local=rockRoot.worldToLocal(hit.point).addScaledVector(normal,.002);if(previous)points.push(previous,local);previous=local;}}
 if(points.length)cracks.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),crackMaterial));
}
const targets=[{name:'一枚卵石',desc:'圆润一点，也从容一点。',path:'M22 78C10 65 24 40 38 24Q50 9 63 27C77 44 88 71 73 81Q46 93 22 78Z',fn:(x,y,z)=>1-Math.sqrt((x/(.72-.11*y))**2+((y+.12)/1.11)**2+(z/.61)**2)},
{name:'一座小山',desc:'把山野，留在掌心。',path:'M12 83 37 27Q43 15 50 30L61 49 69 39 91 83Q50 89 12 83Z',fn:(x,y,z)=>Math.min((1.10-y)/1.5, (y+1.24)/1.5, (.9-(y+1.24)*.34-Math.abs(x))/.8,1-Math.abs(z)/.53)},
{name:'一弯新月',desc:'凿去一点，留下一点光。',path:'M72 14C12 12 8 86 70 87C40 71 36 37 72 14Z',fn:(x,y,z)=>Math.min(1-Math.sqrt((x/.84)**2+(y/1.2)**2+(z/.57)**2),(Math.sqrt(((x-.47)/.83)**2+((y-.14)/1.08)**2)-1)*.65)}];
function updateScore(){let inter=0,union=0,keep=0,total=0;for(let i=0;i<count;i++){const a=field[i]>0,b=target[i]>0;if(a&&b)inter++;if(a||b)union++;if(b){total++;if(a)keep++;}}
 const score=Math.round(100*inter/(union||1));

 if(score>=87&&!awarded){awarded=true;toast('这块石头，有了你的样子。可以保存作品了。');sound.chime();}
 $('#undo').disabled=!history.length;return score;
}
function rebuild(){const g=makeGeometry(field);rock.geometry.dispose();rock.geometry=g;inkOutline.geometry=g;studio?.refreshDecals(rock);updateStaticCollider();updateScore();}
function setTarget(reset=true){if(targetID===3&&!studio?.blueprint)targetID=0;const t=targets[targetID]||{name:studio?.blueprint?.name||'自绘图纸',path:'M18 20H82V80H18Z'};if(targetID===3){customTarget=studio.makeTarget();target.set(customTarget);}else for(let i=0;i<count;i++)target[i]=Math.min(original[i],t.fn(coords[i*3],coords[i*3+1],coords[i*3+2]));ghost.geometry.dispose();ghost.geometry=makeGeometry(target,false);$('#targetName').textContent=t.name;$('#targetIcon path').setAttribute('d',t.path);if(reset)resetRock();}
function resetRock(){cancelGesture();generateStone(randomStone());field.set(original);setTarget(false);hasCarved=false;updateBlueprintLock();studio?.reset();history=[];strikes=0;awarded=false;lastCut=null;streak=0;clearCracks();clearDebris();clearFragments();rebuild();save();}
let toastTimer;function toast(s){if(!s.includes('已保存')&&!s.includes('已清理'))return;$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200);}

// WebAudio: impact transients, resonant steel, stone body, and velocity-driven
// debris contacts. No remote audio files or network requests are needed.
const sound={ctx:null,muted:false,lastContact:0,
 init(){if(!this.ctx){this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.65;const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-12;limiter.ratio.value=8;this.master.connect(limiter);limiter.connect(this.ctx.destination);this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate*.5,this.ctx.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;}if(this.ctx.state==='suspended')this.ctx.resume();},
 tone(freq,duration,vol,type='sine',delay=0){if(!this.ctx||this.muted)return;const c=this.ctx,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(freq*.64,t+duration);g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(vol,t+.003);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.02);},
 grit(duration,vol,freq,delay=0){if(!this.ctx||this.muted)return;const c=this.ctx,t=c.currentTime+delay,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;f.type='bandpass';f.frequency.value=freq;f.Q.value=.6;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+duration);},
 hit(p,polish=false,hardness=.5,fracture=false){if(polish){this.grit(.15,.24,1800);return;}this.tone(140+hardness*110-p*65,.10+p*.12,.24+p*.16,'triangle');this.tone(1800+hardness*1400-p*500,.055,.11);if(fracture){this.grit(.22,.24,550);this.tone(85,.2,.19,'triangle');}this.tone(3470,.035,.035);this.grit(.045,.38,3600);this.grit(.16+p*.13,.14+p*.12,700);},
 contact(v){if(!this.ctx||this.ctx.currentTime-this.lastContact<.045||v<.5)return;this.lastContact=this.ctx.currentTime;this.tone(250+Math.random()*550,.035+v*.008,Math.min(.10,v*.014),'triangle');this.grit(.045,Math.min(.11,v*.015),2100);},
 fine(hardness=.5){this.tone(2400+hardness*650,.035,.08);this.tone(410,.045,.07,'triangle');this.grit(.035,.14,4100);},
 heavy(power,hardness=.5){this.hit(power,false,hardness,true);this.tone(75,.17+power*.1,.16+power*.08,'triangle');},
 scrape(speed){
  if(!this.ctx||this.muted){this.stopScrape();return;}
  const c=this.ctx,t=c.currentTime;
  if(!this.scraper){const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;source.loop=true;filter.type='bandpass';filter.Q.value=.55;gain.gain.value=.0001;source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start();this.scraper={source,filter,gain};}
  const {source,filter,gain}=this.scraper;filter.frequency.setTargetAtTime(650+Math.min(speed,4)*500,t,.025);source.playbackRate.setTargetAtTime(.7+Math.min(speed,4)*.2,t,.025);gain.gain.setTargetAtTime(.07+Math.min(speed,4)*.035,t,.015);
 },
 stopScrape(){if(!this.scraper)return;const {source,gain,filter}=this.scraper;this.scraper=null;const t=this.ctx.currentTime;gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(.0001,t,.025);source.stop(t+.14);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};},
 chime(){[660,825,990].forEach((f,i)=>this.tone(f,.5,.05,'sine',i*.14));}
};
$('#sound').onclick=()=>{sound.init();sound.muted=!sound.muted;if(sound.muted)sound.stopScrape();$('#sound span').textContent=sound.muted?'声音关闭':'声音开启';$('#sound').setAttribute('aria-label',sound.muted?'开启声音':'关闭声音');save();};

const physics=new CANNON.World({gravity:new CANNON.Vec3(0,-9.82,0)});physics.allowSleep=true;physics.broadphase=new CANNON.SAPBroadphase(physics);
const stonePhysics=new CANNON.Material('stone');physics.defaultContactMaterial.friction=.6;physics.defaultContactMaterial.restitution=.22;
const floorBody=new CANNON.Body({mass:0,material:stonePhysics});floorBody.position.y=.25;floorBody.addShape(new CANNON.Plane());floorBody.quaternion.setFromEuler(-Math.PI/2,0,0);physics.addBody(floorBody);
// The changing workpiece is also a collision object, so detached pieces can
// land on it. Collider cells are coarser than the carving mesh (three samples).
const fragments=[];
let workpieceBody=null;
function bodyFromGrid(data,center,mass){
 const body=new CANNON.Body({mass,material:stonePhysics,linearDamping:.12,angularDamping:.18,sleepSpeedLimit:.12,sleepTimeLimit:1});
 for(const box of collisionBoxes(data,NX,NY,NZ,STEP))body.addShape(new CANNON.Box(new CANNON.Vec3(...box.half)),new CANNON.Vec3(box.center[0]-center.x,box.center[1]-center.y,box.center[2]-center.z));
 return body;
}
function updateStaticCollider(){
 if(workpieceBody)physics.removeBody(workpieceBody);
 workpieceBody=bodyFromGrid(field,new THREE.Vector3(),0);
 workpieceBody.position.copy(rockRoot.position);workpieceBody.quaternion.copy(rockRoot.quaternion);
 if(workpieceBody.shapes.length)physics.addBody(workpieceBody);
}
function fragmentState(f){return {data:f.data,center:f.center.clone(),position:f.body.position.toArray(),quaternion:f.body.quaternion.toArray(),velocity:f.body.velocity.toArray(),angularVelocity:f.body.angularVelocity.toArray()};}
function captureFragments(){return fragments.map(fragmentState);}
function addFragment(data,center,state=null){
 let volume=0;for(const v of data)if(v>0)volume++;
 const body=bodyFromGrid(data,center,Math.max(.005,volume*STEP**3*2400));
 if(state){body.position.set(...state.position);body.quaternion.set(...state.quaternion);body.velocity.set(...state.velocity);body.angularVelocity.set(...state.angularVelocity);}
 else{rockRoot.updateMatrixWorld(true);body.position.copy(rockRoot.localToWorld(center.clone()));body.quaternion.copy(rockRoot.quaternion);}
 const group=new THREE.Group(),geometry=makeGeometry(data),mesh=new THREE.Mesh(geometry,rockMat);
 mesh.position.copy(center).multiplyScalar(-1);mesh.castShadow=true;group.add(mesh);
 const outline=new THREE.Mesh(geometry,inkOutline.material);outline.position.copy(mesh.position);outline.material.color.set(stonePalettes[stoneStyle(state.stone).palette][4]);outline.scale.setScalar(1.007);group.add(outline);
 group.position.copy(body.position);group.quaternion.copy(body.quaternion);scene.add(group);
 body.addEventListener('collide',e=>sound.contact(Math.abs(e.contact.getImpactVelocityAlongNormal())));physics.addBody(body);
 studio?.refreshDecals(mesh);const fragment={data,center,body,group,geometry,mesh};fragments.push(fragment);return fragment;
}
function clearFragments(){for(const f of fragments){physics.removeBody(f.body);scene.remove(f.group);f.geometry.dispose();}fragments.length=0;}
function releaseUnsupported(){
 const disconnected=unsupportedComponents(field,NX,NY,NZ,STEP,.25-rockRoot.position.y+STEP*1.5,assisted?target:null);
 for(const cells of disconnected){
  const data=new Float32Array(count).fill(-1),center=new THREE.Vector3();
  for(const i of cells){data[i]=field[i];center.x+=coords[i*3];center.y+=coords[i*3+1];center.z+=coords[i*3+2];
   const y=Math.floor(i/(NX*NZ)),z=Math.floor((i-y*NX*NZ)/NX),x=i%NX;
   for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    const xx=x+dx,yy=y+dy,zz=z+dz;if(xx<0||xx>=NX||yy<0||yy>=NY||zz<0||zz>=NZ)continue;
    const j=idx(xx,yy,zz);if(field[j]<=0)data[j]=field[j];
   }
  }
  center.multiplyScalar(1/cells.length);
  for(const i of cells)field[i]=-Math.max(.00001,field[i]);
  addFragment(data,center);
 }
 return disconnected.length;
}
let fragmentSaveTimer=0;
const debris=[],dust=[];
const debrisMat=rockMat;
const dustMat=new THREE.MeshBasicMaterial({color:0xc9badd,transparent:true,opacity:.4,depthWrite:false});
const dustGeo=new THREE.SphereGeometry(.018,4,3);
function spawnDebris(point,normal,p){
 const amount=tool==='fine'?2:5;
 for(let i=0;i<amount;i++){
  const r=(tool==='rough'?.035+Math.random()*.065:.009+Math.random()*.024)*blade;
  const verts=[new CANNON.Vec3(r,r,r),new CANNON.Vec3(-r,-r,r),new CANNON.Vec3(-r,r,-r),new CANNON.Vec3(r,-r,-r)];
  const faces=[[0,2,1],[0,1,3],[0,3,2],[1,2,3]];
  const shape=new CANNON.ConvexPolyhedron({vertices:verts,faces});
  const body=new CANNON.Body({mass:r**3*2500,shape,material:stonePhysics,linearDamping:.18,angularDamping:.22,sleepSpeedLimit:.12,sleepTimeLimit:.7});
  body.position.set(point.x+normal.x*.13+(Math.random()-.5)*.08,point.y+normal.y*.13,point.z+normal.z*.13+(Math.random()-.5)*.08);
  const force=.9+p*2;body.velocity.set(normal.x*force+(Math.random()-.5)*1.8,Math.max(.4,normal.y*force)+Math.random()*(1+p),normal.z*force+(Math.random()-.5)*1.8);
  body.angularVelocity.set(Math.random()*16,Math.random()*16,Math.random()*16);
  body.addEventListener('collide',e=>sound.contact(Math.abs(e.contact.getImpactVelocityAlongNormal())));physics.addBody(body);
  const positions=[];for(const f of faces)for(const j of f)positions.push(verts[j].x,verts[j].y,verts[j].z);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,debrisMat);mesh.castShadow=true;scene.add(mesh);debris.push({body,mesh,birth:performance.now()});
 }
 for(let i=0;i<4;i++){const mesh=new THREE.Mesh(dustGeo,dustMat);mesh.position.copy(point);scene.add(mesh);dust.push({mesh,life:0,v:new THREE.Vector3((Math.random()-.5)*.65,Math.random()*.6,(Math.random()-.5)*.65)});}
 while(debris.length>45)removeDebris(debris.shift());
}
function removeDebris(d){physics.removeBody(d.body);scene.remove(d.mesh);d.mesh.geometry.dispose();}
function clearDebris(){debris.splice(0).forEach(removeDebris);for(const d of dust)scene.remove(d.mesh);dust.length=0;}

let shake=0,recoil=0,press=null,polishStroke=null,lastHit=null,angle=0,desiredAngle=0,drag=null,lastFrame=performance.now(),pointerInside=false;
const ray=new THREE.Raycaster(),ndc=new THREE.Vector2(),normalMatrix=new THREE.Matrix3();
function surface(e){const r=canvas.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);return ray.intersectObject(rock,false)[0]||null;}
function updatePointer(e){latestPointer={clientX:e.clientX,clientY:e.clientY};lastHit=surface(e);pointerInside=true;$('#cursor').style.left=e.clientX+'px';$('#cursor').style.top=e.clientY+'px';$('#charge').style.left=(e.clientX-26)+'px';$('#charge').style.top=(e.clientY+29)+'px';$('#cursor').style.display=lastHit?'block':'none';canvas.style.cursor=lastHit?'none':'grab';}
function strike(hit,p){
 if(!hit||tool==='polish')return;
 if(tool==='fine')p=.12;else if(tool==='rough')p=.8;
 const local=rockRoot.worldToLocal(hit.point.clone()),norm=hit.face.normal.clone();
 normalMatrix.getNormalMatrix(rock.matrixWorld);const worldNormal=norm.clone().applyMatrix3(normalMatrix).normalize();
 if(tool==='rough')hammerImpact={point:hit.point.clone(),normal:worldNormal.clone(),at:performance.now()};
 streak=lastCut&&lastCut.distanceTo(local)<.23?streak+1:1;lastCut=local.clone();
 const fracture=streak>=4&&streak%4===0;
 const hardness=.5+.22*Math.sin(local.x*13+local.z*9)*Math.cos(local.y*17);
 const radius=(tool==='fine'?.055+p*.065:.22+p*.21)*blade*(fracture?1.28:1);
 const effectiveRadius=radius*(1.08-hardness*.2);
 const cut=local.clone().addScaledVector(norm,-effectiveRadius*(.18+Math.min(streak,5)*.035));
 const snapshot=field.slice(),beforeFragments=captureFragments();let changed=false,removed=0;
 for(let i=0;i<count;i++){const d=Math.hypot(coords[i*3]-cut.x,coords[i*3+1]-cut.y,coords[i*3+2]-cut.z),v=(d-effectiveRadius)/.95;const safe=safeDensity(i,v);if(safe<field[i]){removed+=Math.max(0,field[i])-Math.max(0,safe);field[i]=safe;changed=true;}}
 if(!changed||removed<.00001){field.set(snapshot);sound.tone(220,.055,.04,'triangle');recoil=.04;return;}
 lockBlueprint();history.push({field:snapshot,fragments:beforeFragments,art:studio?.snapshot()});if(history.length>30)history.shift();strikes++;releaseUnsupported();rebuild();
 addCracks(local,norm,streak);
 if(tool==='fine')sound.fine(hardness);else sound.heavy(p,hardness);spawnDebris(hit.point,worldNormal,p*(fracture?1.3:1));
 shake=tool==='fine'?.006:.025+p*.045;recoil=tool==='fine'?.075:.18+p*.22;

 $('#cursor').classList.add('hit');setTimeout(()=>$('#cursor').classList.remove('hit'),90);
 if(navigator.vibrate)navigator.vibrate(tool==='fine'?6:20+Math.round(p*28));
 if(strikes===1)toast('转动石头，可以雕刻背面。按 G 查看目标轮廓。');save();
}
// One drag gesture is one undo action. Holding still never sands the surface.
function beginPolish(e,hit){
 polishStroke={lastPoint:rockRoot.worldToLocal(hit.point.clone()),lastScreen:new THREE.Vector2(e.clientX,e.clientY),lastAt:performance.now(),lastMotionAt:performance.now(),undo:null,changed:false};
 clearCracks();
}
function sandSurface(e,hit){
 const stroke=polishStroke;if(!stroke)return;
 if(!hit){stroke.lastPoint=null;sound.stopScrape();return;}
 const local=rockRoot.worldToLocal(hit.point.clone()),now=performance.now();
 if(!stroke.lastPoint){stroke.lastPoint=local;stroke.lastScreen.set(e.clientX,e.clientY);stroke.lastAt=now;return;}
 const pixels=Math.hypot(e.clientX-stroke.lastScreen.x,e.clientY-stroke.lastScreen.y),distance=local.distanceTo(stroke.lastPoint);
 if(pixels<2||distance<.009)return;
 const speed=distance/Math.max(.016,(now-stroke.lastAt)/1000);stroke.lastMotionAt=now;sound.scrape(speed);
 if(now-stroke.lastAt<85)return;
 if(distance>.7){stroke.lastPoint=local;stroke.lastScreen.set(e.clientX,e.clientY);stroke.lastAt=now;return;}
 const before=field.slice();let changed=false;const radius=.18*blade,steps=Math.min(5,Math.max(1,Math.ceil(distance/(radius*.5)))),strength=Math.min(.9,.35+distance*2.5);
 const centers=[];for(let n=1;n<=steps;n++)centers.push(stroke.lastPoint.clone().lerp(local,n/steps));
 // Remove local high spots using the scalar-field Laplacian. Concavities
 // are never filled and there is no spherical punch into the stone.
 for(let pass=0;pass<3;pass++){
  const source=field.slice();
  for(const center of centers){
   const gx=Math.round(center.x/STEP+(NX-1)/2),gy=Math.round(center.y/STEP+(NY-1)/2),gz=Math.round(center.z/STEP+(NZ-1)/2),r=Math.ceil(radius/STEP);
   for(let y=Math.max(1,gy-r);y<=Math.min(NY-2,gy+r);y++)for(let z=Math.max(1,gz-r);z<=Math.min(NZ-2,gz+r);z++)for(let x=Math.max(1,gx-r);x<=Math.min(NX-2,gx+r);x++){
    const i=idx(x,y,z);if(Math.abs(source[i])>.18)continue;const d=Math.hypot(coords[i*3]-center.x,coords[i*3+1]-center.y,coords[i*3+2]-center.z);if(d>=radius)continue;
    const avg=(source[i-1]+source[i+1]+source[i-NX]+source[i+NX]+source[i-NX*NZ]+source[i+NX*NZ])/6;
    const falloff=1-d/radius;
    const value=safeDensity(i,source[i]+Math.min(0,avg-source[i])*strength*falloff-.00025*strength*falloff);
    if(value<field[i]-1e-7){field[i]=value;changed=true;}
   }
  }
 }
 if(changed){
  lockBlueprint();if(!stroke.undo){stroke.undo={field:before,fragments:captureFragments(),art:studio?.snapshot()};history.push(stroke.undo);if(history.length>30)history.shift();}
  stroke.changed=true;releaseUnsupported();rebuild();
  // Fine powder, no impact chips or camera shake.
  for(let i=0;i<3;i++){const mesh=new THREE.Mesh(dustGeo,dustMat);mesh.position.copy(hit.point);scene.add(mesh);dust.push({mesh,life:.15,v:new THREE.Vector3((Math.random()-.5)*.12,.08,(Math.random()-.5)*.12)});}
 }
 stroke.lastPoint=local;stroke.lastScreen.set(e.clientX,e.clientY);stroke.lastAt=performance.now();stroke.lastMotionAt=stroke.lastAt;
}
function endPolish(){if(polishStroke?.changed)save();polishStroke=null;sound.stopScrape();}
function cancelGesture(){studio?.end();press=null;drag=null;panDrag=null;lastButtons=0;endPolish();$('#charge').style.display='none';}
canvas.addEventListener('pointermove',e=>{
 if(e.isPrimary===false||document.body.classList.contains('workspace-switching'))return;
 lastButtons=e.buttons;
 if(panDrag){panView(e.clientX-panDrag.x,e.clientY-panDrag.y);panDrag={x:e.clientX,y:e.clientY};latestPointer={clientX:e.clientX,clientY:e.clientY};return;}
 if(drag){desiredAngle=drag.angle+(e.clientX-drag.x)*.009;drag.moved=Math.abs(e.clientX-drag.x)>4;}
 updatePointer(e);
 if(studio?.mode==='decorate'){studio.move(e,lastHit);return;}
 if(polishStroke){sandSurface(e,lastHit);return;}
 if(press&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>18){press=null;$('#charge').style.display='none';}
});
canvas.addEventListener('pointerdown',e=>{if(e.isPrimary===false||document.body.classList.contains('workspace-switching')||(e.button!==0&&e.button!==1&&e.button!==2))return;e.preventDefault();cancelGesture();sound.init();updatePointer(e);canvas.setPointerCapture(e.pointerId);lastButtons=e.buttons;
 if(e.button===1||spaceHeld||(zoom>1.15&&!lastHit&&e.button===0)){panDrag={x:e.clientX,y:e.clientY};canvas.style.cursor='grabbing';return;}
 if(e.button===2||!lastHit){drag={x:e.clientX,angle:desiredAngle,moved:false};canvas.style.cursor='grabbing';return;}
 if(studio?.mode==='decorate'&&studio.begin(e,lastHit))return;
 if(tool==='fine'){strike(lastHit,.12);return;}
 if(tool==='polish'){beginPolish(e,lastHit);return;}
 strike(lastHit,.8);
});
function release(e){cancelGesture();if(e&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}
canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',cancelGesture);canvas.addEventListener('lostpointercapture',cancelGesture);
canvas.addEventListener('pointerleave',()=>{pointerInside=false;sound.stopScrape();if(!press&&!polishStroke){marker.visible=false;chisel.visible=false;mallet.visible=false;sandingPad.visible=false;$('#cursor').style.display='none';}});
window.addEventListener('blur',cancelGesture);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelGesture();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.shiftKey){panView(-e.deltaX,-e.deltaY);return;}setZoom(zoom-e.deltaY*.001,{x:e.clientX,y:e.clientY});},{passive:false});
function setZoom(value,anchor=null){
 const next=THREE.MathUtils.clamp(value,.8,3.5);
 const point=anchor||{x:(safeView.left+safeView.right)/2,y:(safeView.top+safeView.bottom)/2};
 const projectToPlane=()=>{const ndc=new THREE.Vector2(point.x/innerWidth*2-1,1-point.y/innerHeight*2),r=new THREE.Raycaster();r.setFromCamera(ndc,camera);const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),new THREE.Vector3(0,1.27,0));return r.ray.intersectPlane(plane,new THREE.Vector3());};
 const before=projectToPlane();zoom=next;camera.zoom=zoom;camera.updateProjectionMatrix();updateViewCamera();const after=projectToPlane();if(before&&after)viewPan.add(before.sub(after));if(zoom<=1)viewPan.multiplyScalar(.65);updateViewCamera();
}
$('#zoomIn').onclick=()=>setZoom(zoom+.2);$('#zoomOut').onclick=()=>setZoom(zoom-.2);
$('#resetView').onclick=()=>{cancelGesture();viewPan.set(0,0,0);zoom=1;camera.zoom=1;camera.updateProjectionMatrix();measureWorkspace();};
window.addEventListener('keydown',e=>{if(e.code==='Space'&&!document.querySelector('dialog[open]')&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();spaceHeld=true;}});
window.addEventListener('keyup',e=>{if(e.code==='Space')spaceHeld=false;});
window.addEventListener('blur',()=>{spaceHeld=false;});
$('#blade').oninput=e=>{blade=Number(e.target.value);$('#bladeValue').textContent=blade<.8?'极细':blade>1.3?'宽刃':'标准';};
const tips={fine:'细凿 · 小口去料，适合修整轮廓',rough:'重凿 · 点按重击，大块凿去多余石料',polish:'磨石 · 轻轻磨去凸起，收拾细小棱角'};
function selectTool(value){cancelGesture();hammerImpact=null;tool=value;canvas.dataset.tool=tool;$('#cursor').dataset.tool=tool;$('#bladeLabel').textContent=tool==='polish'?'磨面':'刃口';document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));save();}
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>selectTool(b.dataset.tool));
function undo(){cancelGesture();if(!history.length)return;const snapshot=history.pop();field.set(snapshot.field);studio?.restore(snapshot.art);clearFragments();if(studio?.mode!=='decorate')for(const f of snapshot.fragments)addFragment(f.data,f.center,f);lastCut=null;streak=0;clearCracks();rebuild();clearDebris();toast('回到上一刀。');save();}
$('#undo').onclick=undo;
$('#rotate').onclick=()=>{desiredAngle+=Math.PI/2;};
$('#decorUndo').onclick=undo;
$('#assist').onclick=()=>{cancelGesture();assisted=!assisted;$('#assist').textContent=assisted?'辅助':'自由';$('#assist').classList.toggle('active',assisted);ghost.visible=assisted;if(!assisted){releaseUnsupported();rebuild();}save();};
$('#guide').onclick=()=>{ghost.visible=!ghost.visible;$('#guide').classList.toggle('active',ghost.visible);$('#guide').setAttribute('aria-pressed',String(ghost.visible));toast(ghost.visible?'绿色网格是目标形状，沿外侧慢慢凿。':'已隐藏目标轮廓。');};
$('#help').onclick=()=>{cancelGesture();$('#helpDialog').showModal();};$('#closeHelp').onclick=()=>$('#helpDialog').close();
$('#reset').onclick=()=>{cancelGesture();$('#resetDialog').showModal();};$('#cancelReset').onclick=()=>$('#resetDialog').close();$('#confirmReset').onclick=()=>{$('#resetDialog').close();resetRock();toast('新石头，新的可能。');};
$('#nextTarget').onclick=()=>{if(hasCarved)return;targetID=(targetID+1)%(studio?.blueprint?4:3);setTarget(false);awarded=false;updateScore();save();toast('已更换目标，当前石头和撤销记录保留。');};
function sweepDebris(){cancelGesture();hammerImpact=null;clearDebris();clearFragments();fragmentSaveTimer=0;renderer.render(scene,camera);save();toast('已清理碎屑');const button=$('#cleanDebris');button.classList.remove('sweeping');void button.offsetWidth;button.classList.add('sweeping');sound.grit(.18,.08,1100);}
// Run at pointer-down so a touch, pan or drag cannot swallow the cleanup click.
const cleanButton=$('#cleanDebris');
cleanButton.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();sweepDebris();});
cleanButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(e.detail===0)sweepDebris();});
$('#capture').onclick=()=>{cancelGesture();marker.visible=false;chisel.visible=false;mallet.visible=false;sandingPad.visible=false;const wasGhost=ghost.visible;ghost.visible=false;renderer.render(scene,camera);const link=document.createElement('a');link.download=`石间_${targets[targetID].name}_${new Date().toISOString().slice(0,10)}.png`;const output=document.createElement('canvas');output.width=canvas.width;output.height=canvas.height;const ctx=output.getContext('2d');ctx.fillStyle='#f7f0df';ctx.fillRect(0,0,output.width,output.height);const background=studio?.mode==='decorate'?workbenchImage:gardenImage;if(background.complete&&background.naturalWidth){const ratio=Math.max(output.width/background.width,output.height/background.height),w=background.width*ratio,h=background.height*ratio;ctx.drawImage(background,(output.width-w)/2,(output.height-h)/2,w,h);}ctx.drawImage(canvas,0,0);link.href=output.toDataURL('image/png');link.click();ghost.visible=wasGhost;toast('作品已保存成图片。');};
window.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='='||e.key==='+')setZoom(zoom+.2);if(e.key==='-')setZoom(zoom-.2);if(e.key==='1')selectTool('fine');if(e.key==='2')selectTool('rough');if(e.key==='3')selectTool('polish');if(e.key.toLowerCase()==='b')sweepDebris();if(e.key.toLowerCase()==='g')$('#guide').click();if(e.key.toLowerCase()==='q')$('#rotate').click();if(e.key.toLowerCase()==='z'){e.preventDefault();undo();}});
function exportWork(){return {field:encodeField(),stone:{...stone},targetID,tool,muted:sound.muted,strikes,hasCarved,assisted,art:studio?.encodeArt(),fragments:fragments.map(f=>({...fragmentState(f),center:f.center.toArray(),data:encodeSparse(f.data)}))};}
function save(){try{localStorage.setItem('stone-still-storybook-v4',JSON.stringify(exportWork()));}catch{}}
function encodeField(){const bytes=new Uint8Array(field.buffer);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
function decodeField(text){const bin=atob(text);if(bin.length!==count*4)return null;const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));const data=new Float32Array(bytes.buffer);return data.every(Number.isFinite)?data:null;}
function encodeSparse(data){let n=0;for(const v of data)if(v!==-1)n++;const buf=new ArrayBuffer(n*8),view=new DataView(buf);let offset=0;for(let i=0;i<data.length;i++)if(data[i]!==-1){view.setUint32(offset,i,true);view.setFloat32(offset+4,data[i],true);offset+=8;}const bytes=new Uint8Array(buf);let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
function decodeSparse(text){const bin=atob(text);if(bin.length%8)throw new Error('Invalid fragment');const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer),data=new Float32Array(count).fill(-1);for(let i=0;i<bytes.length;i+=8){const index=view.getUint32(i,true),v=view.getFloat32(i+4,true);if(index>=count||!Number.isFinite(v))throw new Error('Invalid fragment');data[index]=v;}return data;}
studio=createStudio({grid:{nx:NX,ny:NY,nz:NZ,step:STEP},coords,original,root:rockRoot,rock,locked:()=>hasCarved,planCreated:data=>collection.addPlan(data),cancel:cancelGesture,capture:captureState,record:recordState,save,tap:()=>sound.tone(650,.07,.05),setDecorating:value=>{if(value){clearDebris();clearFragments();fragmentSaveTimer=0;save();}document.body.classList.toggle('decorating',value);requestAnimationFrame(measureWorkspace);ghost.visible=!value&&assisted;},applyBlueprint:value=>{if(hasCarved)return;targetID=3;customTarget=value;target.set(value);setTarget(false);assisted=true;ghost.visible=true;$('#assist').textContent='辅助';$('#assist').classList.add('active');}});
let restored=false,restoredFragments=[];
try{const s=JSON.parse(localStorage.getItem('stone-still-storybook-v4'));const data=s?.field?decodeField(s.field):null;if(data&&Number.isInteger(s.targetID)&&s.targetID>=0&&s.targetID<4){generateStone(s.stone);studio.loadArt(s.art);assisted=s.assisted!==false;field.set(data);targetID=s.targetID;tool=tips[s.tool]?s.tool:'fine';sound.muted=!!s.muted;strikes=s.strikes||0;hasCarved=s.hasCarved??(strikes>0||data.some((v,i)=>v<original[i]-1e-5));restoredFragments=s.fragments||[];restored=true;}}catch{}
setTarget(!restored);if(restored){for(const f of restoredFragments){try{if([f.center,f.position,f.quaternion,f.velocity,f.angularVelocity].every(a=>Array.isArray(a)&&a.every(Number.isFinite)))addFragment(decodeSparse(f.data),new THREE.Vector3(...f.center),f);}catch{}}releaseUnsupported();rebuild();$('#sound span').textContent=sound.muted?'声音关闭':'声音开启';}selectTool(tool);updateBlueprintLock();ghost.visible=assisted;$('#assist').textContent=assisted?'辅助':'自由';$('#assist').classList.toggle('active',assisted);
function previewWork(state){
 const values=decodeField(state.field);if(!values)throw new Error('作品数据无效');const previous=studio.encodeArt();
 try{studio.loadArt(state.art);const geometry=makeGeometry(values),mesh=new THREE.Mesh(geometry,rockMat.clone());paintStone(mesh.material,stoneStyle(state.stone));const group=new THREE.Group();group.add(mesh);const outline=new THREE.Mesh(geometry.clone(),inkOutline.material.clone());outline.material.color.set(stonePalettes[stoneStyle(state.stone).palette][4]);outline.scale.setScalar(1.007);group.add(outline);group.rotation.y=.48;group.updateMatrixWorld(true);studio.refreshDecals(mesh);return group;}finally{studio.loadArt(previous);}
}
function thumbnailWork(){
 cancelGesture();const preview=previewWork(exportWork()),scene=new THREE.Scene();scene.add(preview);const camera=new THREE.PerspectiveCamera(34,4/3,.1,50);camera.position.set(0,.1,5.6);camera.lookAt(0,0,0);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});renderer.setSize(400,300);renderer.setClearColor(0xf3eddb);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.render(scene,camera);const image=renderer.domElement.toDataURL('image/png');preview.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});renderer.dispose();return image;
}
function loadWork(state){
 const values=decodeField(state.field);if(!values)throw new Error('作品数据无效');cancelGesture();clearDebris();clearFragments();generateStone(state.stone);studio.loadArt(state.art);field.set(values);targetID=state.targetID||0;hasCarved=state.hasCarved??true;strikes=state.strikes||0;assisted=state.assisted!==false;selectTool(tips[state.tool]?state.tool:'fine');sound.muted=!!state.muted;$('#sound span').textContent=sound.muted?'声音关闭':'声音开启';$('#assist').textContent=assisted?'辅助':'自由';$('#assist').classList.toggle('active',assisted);history=[];setTarget(false);rebuild();updateBlueprintLock();studio.setMode('sculpt');viewPan.set(0,0,0);zoom=1;camera.zoom=1;camera.updateProjectionMatrix();measureWorkspace();save();
}
collection=createCollection({cancel:cancelGesture,locked:()=>hasCarved,snapshot:exportWork,thumbnail:thumbnailWork,preview:previewWork,load:loadWork,usePlan:data=>{if(hasCarved)return;studio.useBlueprint(data);save();}});
setupTooltips();updateBlueprintLock();
if(studio.blueprint)collection.addPlan({...studio.blueprint,id:studio.blueprint.id||'legacy-current-blueprint'},true).catch(()=>{});
function resize(){const w=innerWidth,h=innerHeight,aspect=w/h,mobile=w<801;const span=mobile?6.7:5.6;camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;camera.updateProjectionMatrix();renderer.setSize(w,h);measureWorkspace();}
window.addEventListener('resize',resize);resize();
function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;physics.step(1/60,dt,3);
 angle+=(desiredAngle-angle)*Math.min(1,dt*10);rockRoot.rotation.y=angle;rockRoot.updateMatrixWorld(true);
 if(workpieceBody){workpieceBody.quaternion.copy(rockRoot.quaternion);workpieceBody.aabbNeedsUpdate=true;}
 for(const f of fragments){f.group.position.copy(f.body.position);f.group.quaternion.copy(f.body.quaternion);}
 if(fragments.length){fragmentSaveTimer+=dt;if(fragmentSaveTimer>1){save();fragmentSaveTimer=0;}}
 shake*=Math.exp(-dt*29);recoil*=Math.exp(-dt*20);
 updateViewCamera();camera.position.x+=(Math.random()-.5)*shake;camera.position.y+=(Math.random()-.5)*shake;camera.lookAt(cameraTarget);
 if(zoom>1.15&&lastButtons&&latestPointer&&pointerInside&&!panDrag&&!drag&&!press){const e=latestPointer,margin=36,speed=220*dt;const dx=e.clientX<safeView.left+margin?speed:e.clientX>safeView.right-margin?-speed:0;const dy=e.clientY<safeView.top+margin?speed:e.clientY>safeView.bottom-margin?-speed:0;if(dx||dy)panView(dx,dy);}
 if(latestPointer&&pointerInside&&!drag&&!press)lastHit=surface(latestPointer);
 if(polishStroke&&now-polishStroke.lastMotionAt>120)sound.stopScrape();
 marker.visible=false;chisel.visible=false;mallet.visible=false;sandingPad.visible=false;
 const contact=panDrag?null:press?.hit||lastHit;
 if(studio?.mode!=='decorate'&&contact&&pointerInside&&!drag&&Math.abs(desiredAngle-angle)<.03){
  const normal=contact.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(rock.matrixWorld)).normalize();
  marker.visible=true;marker.position.copy(contact.point).addScaledVector(normal,.012);marker.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
  const visual=tool==='fine'?chisel:tool==='rough'?mallet:sandingPad;visual.visible=true;visual.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),normal);
  const power=press?Math.min(1,Math.max(0,(now-press.at-180)/850)):0;
  if(tool==='rough')aimHammer(contact.point,normal,.045);else visual.position.copy(contact.point).addScaledVector(normal,tool==='polish'?.006:.03+recoil);
  marker.scale.setScalar(tool==='polish'?2.2*blade:1+power*.8);
  if(press)$('#charge i').style.width=(power*100)+'%';
 }
 if(hammerImpact&&tool==='rough'&&studio?.mode!=='decorate'){
  const t=(now-hammerImpact.at)/190;
  if(t<1){const lift=.16*Math.sin(Math.PI*t);aimHammer(hammerImpact.point,hammerImpact.normal,Math.max(0,lift));}else hammerImpact=null;
 }
 for(let i=debris.length-1;i>=0;i--){const d=debris[i];d.mesh.position.copy(d.body.position);d.mesh.quaternion.copy(d.body.quaternion);if(now-d.birth>8000){removeDebris(d);debris.splice(i,1);}}
 for(let i=dust.length-1;i>=0;i--){const d=dust[i];d.life+=dt;d.mesh.position.addScaledVector(d.v,dt);d.v.y-=dt*.3;d.mesh.scale.setScalar(Math.max(0,1-d.life/1.2));if(d.life>1.2){scene.remove(d.mesh);dust.splice(i,1);}}
 renderer.render(scene,camera);
}
$('#loading').style.display='none';requestAnimationFrame(frame);
// Read-only diagnostics for smoke testing; the actual gameplay always uses ray hits.
window.stoneDebug={get state(){return {stone:{...stone},score:updateScore(),strikes,vertices:rock.geometry.attributes.position.count,debris:debris.length,history:history.length,target:targetID,tool,audio:sound.ctx?.state||'not-started',muted:sound.muted,streak,grid:count,remaining:field.reduce((a,v)=>a+(v>0?1:0),0),fragments:fragments.map(f=>({position:f.body.position.toArray(),velocity:f.body.velocity.toArray(),sleepState:f.body.sleepState,shapes:f.body.shapes.length})),scraping:!!sound.scraper,polishing:!!polishStroke,charging:!!press,zoom,viewPan:viewPan.toArray(),safeView,hasCarved,assisted,painted:studio?.painted,stickers:studio?.stickerCount,density:field.reduce((a,v)=>a+Math.max(0,v),0),unsupported:unsupportedComponents(field,NX,NY,NZ,STEP,.25-rockRoot.position.y+STEP*1.5,assisted?target:null).length};}};
