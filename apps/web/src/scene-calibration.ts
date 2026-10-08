import './style.css';
import {createMapView} from './map-view';
import {OnlineActor,type Entity} from './online-actors';
import {WorldTone} from './world-tone';
import {loadNativeLightMask} from './scene-lighting-data';

const viewport=document.querySelector<HTMLElement>('#scene-preview-viewport')!,status=document.querySelector<HTMLOutputElement>('#scene-preview-status')!;
const view=await createMapView(viewport,status),tone=new WorldTone(view.app.stage);
const dead=document.querySelector<HTMLInputElement>('#scene-dead')!,map=document.querySelector<HTMLSelectElement>('#scene-map')!;
let entity:Entity={id:1,x:view.center.x,y:view.center.y,direction:4,feature:0,name:'校准角色',self:true,action:'standing',dead:false};
const actor=new OnlineActor(entity);view.depth.addChild(actor.container);
view.app.ticker.add(()=>actor.tick(performance.now()));
function updateDeath(){entity={...entity,dead:dead.checked,action:dead.checked?'dying':'standing'};actor.update(entity);tone.setDead(dead.checked);}
dead.addEventListener('change',updateDeath);
let mapEpoch=0,disposed=false;
async function updateMap(){
 const epoch=++mapEpoch;
 try{const loaded=await view.setMap(map.value);if(!loaded||epoch!==mapEpoch||disposed)return;entity={...entity,x:view.center.x,y:view.center.y};actor.update(entity);updateDeath();}
 catch(error){if(epoch===mapEpoch&&!disposed)status.textContent=error instanceof Error?error.message:String(error);}
}
map.addEventListener('change',()=>void updateMap());
document.querySelector<HTMLFormElement>('#scene-preview-controls')!.addEventListener('submit',event=>event.preventDefault());
const level=document.querySelector<HTMLSelectElement>('#scene-light-level')!,maskCanvas=document.querySelector<HTMLCanvasElement>('#scene-light-mask')!,maskStatus=document.querySelector<HTMLOutputElement>('#scene-light-status')!;
let maskEpoch=0;
async function paintMask(retry=false){
 const epoch=++maskEpoch;maskStatus.textContent='正在核对原始遮罩…';
 try{
  const mask=await loadNativeLightMask(Number(level.value),retry);if(epoch!==maskEpoch||disposed)return;
  maskCanvas.width=mask.width;maskCanvas.height=mask.height;const context=maskCanvas.getContext('2d');if(!context)throw new Error('无法显示遮罩诊断');
  const image=context.createImageData(mask.width,mask.height);
  for(let index=0;index<mask.pixels.length;index++){const value=Math.round(mask.pixels[index]*255/30);image.data.set([value,value,value,255],index*4);}
  context.putImageData(image,0,0);maskStatus.textContent=`${mask.width}×${mask.height} · 原文件校验通过`;maskCanvas.hidden=false;
 }catch(error){if(epoch!==maskEpoch||disposed)return;maskCanvas.hidden=true;maskStatus.textContent=error instanceof Error?error.message:String(error);}
}
level.addEventListener('change',()=>void paintMask());document.querySelector<HTMLButtonElement>('#scene-light-retry')!.addEventListener('click',()=>void paintMask(true));void paintMask();
window.addEventListener('pagehide',event=>{if(event.persisted)return;disposed=true;++mapEpoch;++maskEpoch;tone.destroy();actor.destroy();view.app.destroy(true,{children:true});});
