import './style.css';
import {actionFrame,monsterLayers,nationalAction,playerLayers,weaponZIndex,type ActorAction} from './national-actors';
import {monsterVisualRules} from './monster-visuals';
import profile from '../../../content/classic-176/national-gameplay.json';

type Frame={file:string;offsetX:number;offsetY:number;width:number;height:number};
type Library={frames:Record<string,Frame>};
type Part={name:string;offset:number;z:number;library:Library};
const actor=document.querySelector<HTMLSelectElement>('#actor')!,action=document.querySelector<HTMLSelectElement>('#action')!;
const status=document.querySelector<HTMLOutputElement>('#status')!;
const dress=document.querySelector<HTMLSelectElement>('#dress')!,hair=document.querySelector<HTMLSelectElement>('#hair')!,weapon=document.querySelector<HTMLSelectElement>('#weapon')!;
for(const [control,count,label] of [[dress,profile.player.bodyShapes,'衣服'],[hair,profile.player.hairShapes,'头发'],[weapon,Math.floor(profile.sourceFamilies.NWeapon.frameCount/1200),'武器']] as const){
 for(let index=0;index<count;index++){const option=document.createElement('option');option.value=String(index);option.textContent=index===0?(control===dress?'基础外观':control===hair?'光头':'空手'):`${label} ${index}`;control.append(option);}
}
const cache=new Map<string,Promise<Library>>();
async function library(name:string){
 let pending=cache.get(name);
 if(!pending){pending=fetch(`/actors/${name}/library.json`).then(async response=>{if(!response.ok)throw new Error(name);return response.json();});cache.set(name,pending);}
 return pending;
}
actor.replaceChildren(...[{name:'基础男角色',feature:0},{name:'基础女角色',feature:1<<24},
 ...monsterVisualRules.map(rule=>({name:rule.names[0],feature:(rule.appr<<16)|rule.raceImg}))].map(({name,feature})=>{
 const option=document.createElement('option');option.value=String(feature);option.textContent=name;return option;
}));
const cells=['北','东北','东','东南','南','西南','西','西北'].map(direction=>{
 const cell=document.createElement('section');cell.className='direction';
 const name=document.createElement('span');name.textContent=direction;cell.append(name);
 const images=[0,1,2].map(()=>{const image=document.createElement('img');image.alt='';image.hidden=true;cell.append(image);return image;});
 document.querySelector('#directions')!.append(cell);return images;
});
let generation=0,start=performance.now(),definition:ActorAction|undefined,parts:Part[]=[],sex=0,ready=false;
async function load(){
 const mine=++generation;ready=false;
 let feature=Number(actor.value);const race=feature&255,isPlayer=race===0;
 for(const control of [dress,hair,weapon])control.disabled=!isPlayer;
 if(isPlayer){const gender=(feature>>>24)&1,held=Number(weapon.value);feature=((Number(dress.value)*2+gender)<<24)|(Number(hair.value)<<16)|((held?held*2+gender:0)<<8);}
 const layers=playerLayers(feature),monster=monsterLayers(feature),selectedAction=nationalAction(action.value,race);
 if(!selectedAction){status.textContent='此怪物没有该动作';cells.flat().forEach(image=>image.hidden=true);return;}
 const names:{name:string;offset:number;z:number}[]=[];
 if(layers){sex=layers.sex;names.push({name:layers.bodyName,offset:layers.offset,z:0});
  if(layers.hairName)names.push({name:layers.hairName,offset:layers.hairOffset,z:1});
  if(layers.weaponName)names.push({name:layers.weaponName,offset:layers.weaponOffset,z:2});
 }else if(monster)names.push({name:monster.bodyName,offset:monster.offset,z:0});
 status.textContent='正在加载国服原始动作帧…';
 const loaded=await Promise.all(names.map(async part=>({...part,library:await library(part.name)})));
 if(mine!==generation)return;
 const loads:Promise<void>[]=[];
 for(const part of loaded)for(let direction=0;direction<8;direction++)for(let frame=0;frame<selectedAction.count;frame++){
  const entry=part.library.frames[actionFrame(selectedAction,direction,frame,part.offset)];
  if(!entry)continue;const image=new Image();image.src=`/actors/${part.name}/${entry.file}`;loads.push(image.decode());
 }
 await Promise.all(loads);if(mine!==generation)return;
 parts=loaded;definition=selectedAction;start=performance.now();ready=true;
 status.textContent=`${names.map(part=>`${part.name} +${part.offset}`).join(' / ')} · 8 个方向 · ${definition.count} 帧 · ${definition.interval} ms/帧`;
}
function draw(time:number){
 if(ready&&definition){const frame=Math.floor((time-start)/definition.interval)%definition.count;
  cells.forEach((images,direction)=>images.forEach((image,index)=>{
   const part=parts[index],entry=part?.library.frames[actionFrame(definition!,direction,frame,part.offset)];
   image.hidden=!entry;if(!entry)return;
   const url=`/actors/${part.name}/${entry.file}`;if(image.getAttribute('src')!==url)image.src=url;
   image.style.left=`${75+entry.offsetX}px`;image.style.top=`${125+entry.offsetY}px`;
   image.style.zIndex=String(part.name==='NWeapon'?weaponZIndex(sex,actionFrame(definition!,direction,frame)):part.z);
  }));
 }
 requestAnimationFrame(draw);
}
function reload(){void load().catch(error=>{status.textContent=`素材加载失败：${error.message}`;});}
actor.addEventListener('change',reload);action.addEventListener('change',reload);reload();requestAnimationFrame(draw);
for(const control of [dress,hair,weapon])control.addEventListener('change',reload);
