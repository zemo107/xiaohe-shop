import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { createOpening } from './opening.js?v=clean-title-1';
import { createShopAudio } from './audio.js?v=3';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const opening = createOpening($('#opening'));
const audio = createShopAudio($('#sound-control'));
window.portfolioAudio = audio;
let openingTimer;
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
const catalog=await fetch('./catalog.json').then(r=>r.json());
const entries=new Map(catalog.map(p=>[p.id,p]));
const profile={title:'关于店主 · 颉钟鹤',href:'projects/about.html'};
entries.set('about-outside',profile);entries.set('about-inside',profile);
const linksDialog=$('#links-dialog'),workDialog=$('#work-dialog'),helpDialog=$('#help-dialog'),frame=$('#work-frame');
audio.watchFrame(frame);
const canvas=$('#shop-canvas'),raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
let stage='boot',ready=false,busy=false,renderer,scene,camera,exterior,interior,door,productMap,hits=[],exteriorHits=[],targetId=null;
let yaw=0,pitch=.09,drag=null,pointerMoved=false,joystick={x:0,y:0};
let pointerPosition=null;
const keys=new Set(),player=new THREE.Vector3(0,1.82,9.7),floatingProducts=new Map();
let lastTime=performance.now();
const isModal=()=>linksDialog.open||workDialog.open||helpDialog.open||!$('#opening').hidden||!$('#loading').hidden||!$('#sound-settings').hidden;
function clearPointer(){pointerPosition=null;setTarget(null);}
function releaseMouse(){keys.clear();joystick.x=joystick.y=0;drag=null;canvas.classList.remove('looking');clearPointer();}
$('#sound-settings-toggle').addEventListener('click',releaseMouse);
function modalOpen(dialog){releaseMouse();if(dialog===workDialog)audio.setDetail(true);dialog.showModal();document.body.classList.add('dialog-open');}
function modalClose(){document.body.classList.remove('dialog-open');releaseMouse();audio.setDetail(workDialog.open);if(!workDialog.open)audio.play('close');}
function showLinks(){audio.play('select');modalOpen(linksDialog);$('#links-search').focus();}
['#show-links','#fallback-links'].forEach(id=>$(id).addEventListener('click',showLinks));
$$('[data-close-links]').forEach(b=>b.addEventListener('click',()=>linksDialog.close()));linksDialog.addEventListener('close',modalClose);
for(const p of catalog){const row=document.createElement('div');row.className='link-row';row.dataset.search=(p.title+' '+p.en+' '+p.kind).toLowerCase();const id=document.createElement('span');id.className='link-id';id.textContent=p.id;const label=document.createElement('div'),title=document.createElement('a'),url=document.createElement('span');title.href=p.href;title.className='link-title';title.textContent=p.title;url.className='link-url';url.textContent=p.href;label.append(title,url);const actions=document.createElement('div');actions.className='link-actions';const copy=document.createElement('button');copy.textContent='复制链接';copy.addEventListener('click',async()=>{const value=new URL(p.href,location.href).href;try{await navigator.clipboard.writeText(value)}catch{const tmp=document.createElement('textarea');tmp.value=value;document.body.append(tmp);tmp.select();document.execCommand('copy');tmp.remove();}$('#links-status').textContent=`已复制「${p.title}」的独立链接`;audio.play('confirm');});const open=document.createElement('button');open.textContent='打开 ↗';const use=e=>{e?.preventDefault();linksDialog.close();openWork(p)};open.addEventListener('click',use);title.addEventListener('click',use);actions.append(copy,open);row.append(id,label,actions);$('#link-list').append(row);}
$('#links-search').addEventListener('input',e=>{$$('.link-row').forEach(row=>row.hidden=!row.dataset.search.includes(e.target.value.trim().toLowerCase()))});
$('#show-help').addEventListener('click',()=>{audio.play('select');modalOpen(helpDialog)});['#close-help','#help-done'].forEach(id=>$(id).addEventListener('click',()=>helpDialog.close()));helpDialog.addEventListener('close',modalClose);
function openWork(p){if(!p)return;audio.play('open');$('#reader-title').textContent=p.title;$('#reader-standalone').href=p.href;frame.title=p.title+' · 作品网页';$('#work-loading-label').textContent='正在打开「'+p.title+'」';$('#work-loading').hidden=false;frame.setAttribute('aria-busy','true');frame.src=p.href;modalOpen(workDialog);$('#close-work').focus();}
$('#close-work').addEventListener('click',()=>workDialog.close());workDialog.addEventListener('close',()=>{frame.src='about:blank';modalClose()});
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='portfolio:return-to-shop')workDialog.close()});
// Escape works even when focus is inside the existing web experiences.
frame.addEventListener('load',()=>{if(frame.getAttribute('src')!=='about:blank'){$('#work-loading').hidden=true;frame.removeAttribute('aria-busy');}try{frame.contentDocument?.addEventListener('keydown',e=>{if(e.key==='Escape'&&!frame.contentDocument.querySelector('dialog[open]'))workDialog.close()})}catch{}});
$('#retry-scene').addEventListener('click',()=>location.reload());
function resetPlayer(){player.set(0,stage==='exterior'?1.82:1.78,stage==='exterior'?9.7:1.65);yaw=0;pitch=stage==='exterior'?.09:-.045;keys.clear();clearPointer();}
$('#go-start').addEventListener('click',()=>{audio.play('select');resetPlayer()});
function progress(n,word){n=Math.round(n);$('#progress-fill').style.width=n+'%';$('#progress-walker').style.left=n+'%';$('#load-progress').textContent=n+'%';$('.progress-track').setAttribute('aria-valuenow',String(n));if(word)$('#load-step').textContent=word;}
function loadModel(url){return new Promise((resolve,reject)=>new GLTFLoader().load(url,resolve,e=>{if(e.total)progress(8+e.loaded/e.total*79,'正在搬入模型与材质')},reject))}
// The clerk is being revised. Keep source files intact and omit its scene nodes.
function omitClerk(model){
 const remove=[];
 model.traverse(o=>{
  const materials=o.isMesh?(Array.isArray(o.material)?o.material:[o.material]):[];
  if(/clerk/i.test(o.name)||materials.some(m=>/^Zemo · (Web PBR|Clean face)(?:\.\d+)?$/.test(m?.name||'')))remove.push(o);
 });
 remove.forEach(o=>o.removeFromParent());
}
function prepare(model){model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material?.map)o.material.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy())}})}
function bindSelectable(id,obj,hitList,height=.1){
 if(!obj)throw Error('Missing interactive object '+id);
 floatingProducts.set(id,{object:obj,baseY:obj.position.y,lift:0,hoverStart:0,height});
 obj.traverse(o=>{
  if(!o.isMesh)return;
  o.userData.projectId=id;hitList.push(o);
  // Keep the original silhouette selectable while the object rises.
  const restHit=new THREE.Mesh(o.geometry,o.material);
  restHit.matrixAutoUpdate=false;restHit.matrixWorld.copy(o.matrixWorld);
  restHit.userData.projectId=id;hitList.push(restHit);
 });
}
function finishLoading(){progress(100,'准备好啦');setTimeout(()=>{$('#loading').classList.add('finished');setTimeout(()=>{$('#loading').hidden=true;ready=true;$('#game-hud').hidden=false},reduced?0:650)},reduced?0:250)}
async function showOpening(){audio.setScene('opening');document.body.classList.add('title-screen');releaseMouse();ready=false;$('#game-hud').hidden=true;$('#opening').hidden=false;$('#opening').classList.remove('leaving');$('#enter-game').disabled=false;
 await opening.play();
 if($('#opening').hidden||busy)return;
 audio.playOpening();
 $('#enter-game').focus({preventScroll:true});
 clearTimeout(openingTimer);openingTimer=setTimeout(()=>{if(!$('#opening').hidden&&!busy)$('#enter-game').click()},opening.duration);
}
function enterDoor(){if(busy||stage!=='exterior')return;audio.play('door');void showOpening();}
$('#enter-game').addEventListener('click',async()=>{if(busy)return;busy=true;clearTimeout(openingTimer);opening.stop();audio.stopOpening();audio.play('open');setTarget(null);$('#enter-game').disabled=true;$('#opening').classList.add('leaving');$('#loading').hidden=false;$('#loading').classList.remove('finished');$('#loading h2').textContent='小店准备中';$('.progress-info>span').textContent='稍等，小物们马上就位';progress(0,'正在铺好地板');setTimeout(()=>{$('#opening').hidden=true;document.body.classList.remove('title-screen')},reduced?0:600);try{productMap=await fetch('./models/shop-open-center-map.json').then(r=>r.json());progress(7);const gltf=await loadModel('./models/shop-open-center.glb?v=profile-1');progress(90,'正在摆好每件小物');interior=gltf.scene;omitClerk(interior);prepare(interior);scene.add(interior);exterior.visible=false;
 interior.updateMatrixWorld(true);
 for(const p of productMap.projects){
  const obj=interior.getObjectByName(p.node);
  bindSelectable(p.id,obj,hits);
 }
 bindSelectable('about-inside',interior.getObjectByName('Shop_profile'),hits,.065);

 stage='interior';audio.setScene('interior');resetPlayer();scene.background=new THREE.Color('#e8eddf');scene.fog=null;outsideSun.visible=false;interiorSun.visible=true;fill.intensity=1.9;indoorLights.forEach(l=>l.visible=true);progress(98,'打开灯，欢迎光临');updateCamera();renderer.render(scene,camera);finishLoading();busy=false;
 }catch(error){fail(error)}});
function interact(){
 if(!ready||isModal()||busy||!targetId)return;
 const id=targetId;
 $('#interaction-status').textContent=id==='door'?'正在推门':'正在打开'+entries.get(id).title;
 if(id==='door')enterDoor();else openWork(entries.get(id));
}
function setTarget(id){
 if(targetId===id)return;
 targetId=id;
 const item=floatingProducts.get(id);
 if(item)item.hoverStart=performance.now();
 if(id)audio.hover(id);
 canvas.classList.toggle('has-target',!!id);
 $('#interaction-status').textContent=id?(id==='door'?'门，可以进入':entries.get(id).title+'，可以查看'):'';
}
function animateProducts(dt,now){
 for(const [id,item] of floatingProducts){
  const selected=id===targetId;
  const height=selected?(reduced?item.height:item.height+Math.sin((now-item.hoverStart)*.003)*.006):0;
  item.lift=reduced?height:THREE.MathUtils.damp(item.lift,height,selected?18:14,dt);
  if(!selected&&item.lift<.0001)item.lift=0;
  item.object.position.y=item.baseY+item.lift;
 }
}
function trackPointer(e){
 const r=canvas.getBoundingClientRect();
 pointerPosition=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom?{x:e.clientX,y:e.clientY}:null;
}
function aim(){
 if(!ready||isModal()||busy||!pointerPosition||drag?.looking){setTarget(null);return;}
 const r=canvas.getBoundingClientRect();
 pointer.set((pointerPosition.x-r.left)/r.width*2-1,1-(pointerPosition.y-r.top)/r.height*2);
 raycaster.setFromCamera(pointer,camera);
 // Every visible item can be selected at a distance. Only the door
 // requires approaching it before entering the shop.
 raycaster.far=camera.far;
 const model=stage==='exterior'?exterior:interior;
 model.updateMatrixWorld(true);
 const solid=raycaster.intersectObject(model,true).find(i=>i.object.isMesh&&i.object.material.visible!==false);
 const nearest=raycaster.intersectObjects(stage==='exterior'?exteriorHits:hits,false)[0];
 const id=nearest?.object.userData.projectId;
 if(id==='door'&&nearest.distance>2.5){setTarget(null);return;}
 setTarget(id&&(!solid||solid.object.userData.projectId===id||solid.distance>=nearest.distance-.015)?id:null);
}
function look(dx,dy){if(!ready||isModal()||busy)return;yaw-=dx*.0022;pitch=THREE.MathUtils.clamp(pitch-dy*.0022,-1.05,1.1)}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')trackPointer(e);});
canvas.addEventListener('pointerleave',()=>{if(!drag)clearPointer();});
canvas.addEventListener('pointerdown',e=>{
 if(!ready||isModal()||busy||![0,2].includes(e.button)||drag)return;
 trackPointer(e);updateCamera();aim();
 drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,type:e.pointerType,button:e.button,startedOn:targetId,looking:e.button===2};
 pointerMoved=false;
 if(drag.looking){canvas.classList.add('looking');setTarget(null);}
 canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove',e=>{
 if(!ready||isModal()||busy)return;
 trackPointer(e);
 if(drag){
  const moved=Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5;
  if(moved)pointerMoved=true;
  // A blank-space drag also turns the view, so trackpads do not need a right button.
  const canLook=drag.button===2||drag.type!=='mouse'||!drag.startedOn;
  if(canLook&&(drag.looking||moved)){
   const dx=e.clientX-(drag.looking?drag.x:drag.startX),dy=e.clientY-(drag.looking?drag.y:drag.startY);
   drag.looking=true;canvas.classList.add('looking');look(dx,dy);setTarget(null);
  }
  drag.x=e.clientX;drag.y=e.clientY;
 }
 updateCamera();aim();
});
canvas.addEventListener('pointerup',e=>{
 if(!drag||e.button!==drag.button)return;
 const click=drag.button===0&&!pointerMoved&&!drag.looking;
 drag=null;canvas.classList.remove('looking');trackPointer(e);updateCamera();aim();
 if(click)interact();
 if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 if(e.pointerType!=='mouse')clearPointer();
});
canvas.addEventListener('pointercancel',releaseMouse);
canvas.addEventListener('lostpointercapture',()=>{if(drag)releaseMouse();});
window.addEventListener('keydown',e=>{if(!ready||isModal()||busy)return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)){keys.add(e.code);e.preventDefault()}if(e.code==='KeyE'&&!e.repeat){e.preventDefault();updateCamera();aim();interact()}});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',releaseMouse);document.addEventListener('visibilitychange',releaseMouse);
const pad=$('#touch-pad'),knob=$('#touch-knob');let padPointer=null;
function padMove(e){if(padPointer!==e.pointerId)return;const r=pad.getBoundingClientRect();let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;const len=Math.hypot(x,y),limit=27;if(len>limit){x*=limit/len;y*=limit/len}joystick.x=x/limit;joystick.y=-y/limit;knob.style.transform=`translate(${x}px,${y}px)`;e.preventDefault()}
pad.addEventListener('pointerdown',e=>{padPointer=e.pointerId;pad.setPointerCapture(e.pointerId);padMove(e)});pad.addEventListener('pointermove',padMove);function stopPad(){padPointer=null;joystick={x:0,y:0};knob.style.transform=''}pad.addEventListener('pointerup',stopPad);pad.addEventListener('pointercancel',stopPad);
function allowed(x,z){const r=.16;if(stage==='exterior')return x>-5.1&&x<5.1&&z>2.82&&z<12.5;
 if(x< -3.35+r||x>3.35-r||z< -1.12+r||z>1.96-r)return false;
 const boxes=[[-3.47,-1.78,.72,1.68],[1.86,3.43,-.11,.91]];
 return !boxes.some(([a,b,c,d])=>x>a-r&&x<b+r&&z>c-r&&z<d+r);
}
function move(dt){let forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)+joystick.y;let side=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;let len=Math.hypot(forward,side);if(!len)return false;if(len>1){forward/=len;side/=len}const speed=(keys.has('ShiftLeft')?2.5:1.65)*dt;const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed,dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed;if(allowed(player.x+dx,player.z))player.x+=dx;if(allowed(player.x,player.z+dz))player.z+=dz;
 const ground=stage==='exterior'?THREE.MathUtils.clamp((3.6-player.z)/.8,0,1)*.39+.12:.2;player.y=ground+1.57;return true;}
function updateCamera(bob=0){camera.position.copy(player);camera.position.y+=bob;camera.rotation.set(pitch,yaw,0,'YXZ');camera.updateMatrixWorld()}
function resize(){if(!renderer)return;renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
function fail(error){document.body.classList.remove('title-screen');console.error(error);ready=false;busy=false;$('#loading').hidden=true;$('#opening').hidden=true;$('#scene-error').hidden=false;}
let outsideSun,interiorSun,fill,indoorLights=[];
try{
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.07;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 scene=new THREE.Scene();scene.background=new THREE.Color('#c9e0e5');scene.fog=new THREE.Fog('#d7e7df',22,65);camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.035,120);fill=new THREE.HemisphereLight(0xf4f6e9,0xa2ad86,2.0);scene.add(fill);
 outsideSun=new THREE.DirectionalLight(0xffefcc,2.5);outsideSun.position.set(-8,14,8);outsideSun.castShadow=true;outsideSun.shadow.mapSize.set(2048,2048);Object.assign(outsideSun.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:.5,far:45});outsideSun.shadow.normalBias=.025;scene.add(outsideSun);
 interiorSun=new THREE.DirectionalLight(0xffedcb,1.6);interiorSun.position.set(-5,6,3);interiorSun.castShadow=true;interiorSun.shadow.mapSize.set(2048,2048);Object.assign(interiorSun.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.2,far:18});interiorSun.shadow.normalBias=.018;interiorSun.visible=false;scene.add(interiorSun);
 for(const x of [-1.5,1.5]){const l=new THREE.PointLight(0xffe8bd,15,6,2);l.position.set(x,2.64,-.35);l.visible=false;scene.add(l);indoorLights.push(l)}
 resize();window.addEventListener('resize',resize);progress(4,'正在准备屋外场景');const gltf=await loadModel('./models/exterior-original.glb?v=profile-1');progress(94,'门口见');exterior=gltf.scene;omitClerk(exterior);prepare(exterior);scene.add(exterior);door=exterior.getObjectByName('Outside_door');if(!door)throw Error('Existing exterior door was not exported');door.traverse(o=>{if(o.isMesh){o.userData.projectId='door';exteriorHits.push(o)}});exterior.updateMatrixWorld(true);bindSelectable('about-outside',exterior.getObjectByName('Outside_profile'),exteriorHits,.055);stage='exterior';resetPlayer();updateCamera();renderer.render(scene,camera);finishLoading();
 function tick(now){requestAnimationFrame(tick);const dt=Math.min(.04,(now-lastTime)/1000);lastTime=now;if(ready&&!isModal()&&!busy)move(dt);updateCamera();aim();animateProducts(dt,now);if(!document.hidden&&!workDialog.open&&$('#opening').hidden)renderer.render(scene,camera);}
 requestAnimationFrame(tick);
 window.portfolioScene={camera,player,get stage(){return stage},get ready(){return ready},get target(){return targetId},get productIds(){return productMap?.projects.map(p=>p.id)||[]},get angles(){return {yaw,pitch}},projectScreenPoint(id){const p=productMap?.projects.find(p=>p.id===id);if(!p)return;const v=new THREE.Vector3(...p.center);v.y+=floatingProducts.get(id)?.lift||0;v.project(camera);return{x:(v.x+1)/2*innerWidth,y:(1-v.y)/2*innerHeight}},get model(){return interior||exterior}};
}catch(error){fail(error)}
