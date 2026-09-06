import {Assets,Container,Sprite,Texture} from 'pixi.js';

type EntityPosition={x:number;y:number};
type Frame={file:string;offsetX:number;offsetY:number};
type Library={frames:Record<string,Frame>};
type EffectPacket={casterId:number;targetId:number;x:number;y:number;effectType:number;effect:number};
type CastSequence={library:'Magic'|'Magic2';start:number;count:number;interval:number};

// The pinned 1.76 core catalogue is explicit here. Passive sword skills do
// not emit a cast animation; their visible result is the server's melee action.
const coreSkillVisuals:Record<number,CastSequence|null>={
  1:{library:'Magic',start:0,count:10,interval:60},
  2:{library:'Magic',start:200,count:10,interval:60},
  3:null,
  5:{library:'Magic',start:0,count:10,interval:60},
  6:{library:'Magic2',start:20,count:3,interval:100},
  7:null,
  8:{library:'Magic2',start:20,count:3,interval:100},
  11:{library:'Magic2',start:20,count:3,interval:100},
  12:null,
  13:{library:'Magic',start:0,count:10,interval:60},
  14:{library:'Magic2',start:20,count:3,interval:100},
  17:{library:'Magic2',start:10,count:5,interval:80},
  25:null,
  26:null,
  31:{library:'Magic2',start:20,count:3,interval:100},
};
const additionalSkillVisuals:Record<number,CastSequence>={
  9:{library:'Magic2',start:10,count:5,interval:80},
  10:{library:'Magic2',start:10,count:5,interval:80},
  15:{library:'Magic2',start:20,count:3,interval:100},
  16:{library:'Magic2',start:10,count:5,interval:80},
  18:{library:'Magic2',start:10,count:5,interval:80},
  19:{library:'Magic2',start:10,count:5,interval:80},
  20:{library:'Magic2',start:10,count:5,interval:80},
  29:{library:'Magic',start:200,count:10,interval:60},
  37:{library:'Magic2',start:20,count:3,interval:100},
};

const libraryCache=new Map<string,Promise<Library>>(),textureCache=new Map<string,Promise<Texture>>();

async function library(name:string){
 let pending=libraryCache.get(name);
 if(!pending){pending=fetch(`/effects/${name}/library.json`).then(async response=>{if(!response.ok)throw new Error(`缺少魔法素材 ${name}`);return response.json();});libraryCache.set(name,pending);}
 return pending;
}

async function frames(name:string,indices:number[]){
 const source=await library(name);
 return Promise.all(indices.map(async index=>{
  const frame=source.frames[index];if(!frame)return undefined;
  const url=`/effects/${name}/${frame.file}`;let pending=textureCache.get(url);
  if(!pending){pending=Assets.load<Texture>(url).then(texture=>{texture.source.scaleMode='nearest';return texture;});textureCache.set(url,pending);}
  return {texture:await pending,x:frame.offsetX,y:frame.offsetY};
 }));
}

export class MagicEffects {
 private generation=0;private sprites=new Set<Sprite>();
 constructor(private depth:Container,private position:(id:number)=>EntityPosition|undefined){}

 clear(){this.generation++;for(const sprite of this.sprites)sprite.destroy();this.sprites.clear();}

  cast(casterId:number,magicId:number){
  const caster=this.position(casterId);if(!caster)return;
  const visual=Object.prototype.hasOwnProperty.call(coreSkillVisuals,magicId)
    ? coreSkillVisuals[magicId]
    : additionalSkillVisuals[magicId];
  if(!visual)return;
  this.run(this.sequence(visual.library,range(visual.start,visual.count),caster,visual.interval));
}

 resolve(packet:EffectPacket){
  const caster=this.position(packet.casterId)??{x:packet.x,y:packet.y};
  const target=this.position(packet.targetId)??{x:packet.x,y:packet.y};
  if((packet.effectType===1&&(packet.effect===1||packet.effect===3))||
     (packet.effectType===8&&packet.effect===10))this.later(420,()=>this.projectile(caster,target));
  else if(packet.effectType===2&&(packet.effect===2||packet.effect===4||packet.effect===27))
   this.later(420,()=>this.sequence('Magic',range(370,10),target,80));
  else if(packet.effectType===7&&packet.effect===9)this.later(420,()=>this.sequence('Magic2',range(10,5),target,80));
  else if(packet.effectType===4)this.later(420,()=>this.sequence('Magic2',range(20,3),target,100));
}

 private async projectile(from:EntityPosition,to:EntityPosition){
  const generation=this.generation,direction=direction16(from,to),poses=await frames('Magic',range(10+direction*10,6));
  if(generation!==this.generation)return;
  const sprite=this.makeSprite(from);const distance=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y)),duration=Math.max(120,distance*50),started=performance.now();
  const tick=(now:number)=>{
   if(generation!==this.generation||sprite.destroyed)return;
   const progress=Math.min(1,(now-started)/duration),frame=Math.min(poses.length-1,Math.floor((now-started)/30)%poses.length),pose=poses[frame];
   sprite.position.set((from.x+(to.x-from.x)*progress)*48,(from.y+(to.y-from.y)*progress)*32);if(pose){sprite.texture=pose.texture;sprite.pivot.set(-pose.x,-pose.y);}
   if(progress<1)requestAnimationFrame(tick);else{this.remove(sprite);this.run(this.sequence('Magic',range(170,10),to,60));}
  };
  requestAnimationFrame(tick);
 }

 private async sequence(name:string,indices:number[],at:EntityPosition,interval:number){
  const generation=this.generation,poses=await frames(name,indices);if(generation!==this.generation)return;
  const sprite=this.makeSprite(at),started=performance.now();
  const tick=(now:number)=>{
   if(generation!==this.generation||sprite.destroyed)return;
   const frame=Math.floor((now-started)/interval);if(frame>=poses.length){this.remove(sprite);return;}
   const pose=poses[frame];if(pose){sprite.texture=pose.texture;sprite.pivot.set(-pose.x,-pose.y);}requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
 }

  private makeSprite(at:EntityPosition){const sprite=new Sprite();sprite.blendMode='add';sprite.position.set(at.x*48,at.y*32);sprite.zIndex=at.y*10000+at.x+4;this.sprites.add(sprite);this.depth.addChild(sprite);return sprite;}
 private remove(sprite:Sprite){this.sprites.delete(sprite);sprite.destroy();}
 private later(delay:number,action:()=>Promise<void>){const generation=this.generation;window.setTimeout(()=>{if(generation===this.generation)this.run(action());},delay);}
 private run(task:Promise<void>){void task.catch(()=>{});}
}

function range(start:number,count:number){return Array.from({length:count},(_,index)=>start+index);}
function direction16(from:EntityPosition,to:EntityPosition){
 const radians=Math.atan2(to.x-from.x,from.y-to.y),degrees=(radians*180/Math.PI+360+11.25)%360;
 return Math.floor(degrees/22.5)%16;
}
