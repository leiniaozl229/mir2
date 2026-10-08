import {Assets,Container,Sprite,Texture} from 'pixi.js';

type EntityPosition={x:number;y:number};
type Frame={file:string;offsetX:number;offsetY:number};
type Library={frames:Record<string,Frame>};
type EffectPacket={casterId:number;targetId:number;x:number;y:number;effectType:number;effect:number};
type CastSequence={library:'Magic'|'Magic2';start:number;count:number;interval:number};
type MapEventPacket={id:number;x:number;y:number;eventType:number;eventParam:number};
type EventVisual={packet:MapEventPacket;sprite?:Sprite;poses?:Awaited<ReturnType<typeof frames>>;started:number};
type MiningFragmentVisual={x:number;y:number;direction:number;frame:number;clockAt:number;generation:number;sprite?:Sprite;poses?:Awaited<ReturnType<typeof frames>>};

// The pinned 1.76 core catalogue is explicit here. Passive sword skills do
// not emit a cast animation; their visible result is the server's melee action.
const coreSkillVisuals:Record<number,CastSequence|null>={
  1:{library:'Magic',start:0,count:10,interval:60},
  2:{library:'Magic',start:200,count:10,interval:60},
  3:null,
  5:{library:'Magic',start:400,count:10,interval:60},
  6:{library:'Magic',start:600,count:10,interval:60},
  7:null,
  8:{library:'Magic',start:900,count:10,interval:60},
  11:{library:'Magic2',start:20,count:10,interval:60},
  12:null,
  13:{library:'Magic',start:940,count:10,interval:60},
  14:{library:'Magic',start:940,count:10,interval:60},
  17:{library:'Magic',start:1500,count:10,interval:60},
  25:null,
  26:null,
  31:{library:'Magic',start:3880,count:10,interval:60},
};
const additionalSkillVisuals:Record<number,CastSequence>={
  9:{library:'Magic',start:920,count:10,interval:60},
  10:{library:'Magic',start:940,count:10,interval:60},
  15:{library:'Magic',start:940,count:10,interval:60},
  16:{library:'Magic',start:1380,count:10,interval:60},
  18:{library:'Magic',start:1520,count:10,interval:60},
  19:{library:'Magic',start:940,count:10,interval:60},
  20:{library:'Magic',start:1560,count:10,interval:60},
  29:{library:'Magic',start:3840,count:10,interval:60},
  37:{library:'Magic',start:3920,count:10,interval:60},
};

const libraryCache=new Map<string,Promise<Library>>(),textureCache=new Map<string,Promise<Texture>>();

async function library(name:string){
 let pending=libraryCache.get(name);
 if(!pending){const task:Promise<Library>=fetch(`/effects/${name}/library.json`).then(async response=>{if(!response.ok)throw new Error(`缺少魔法素材 ${name}`);return response.json();}).catch(error=>{if(libraryCache.get(name)===task)libraryCache.delete(name);throw error;});pending=task;libraryCache.set(name,pending);}
 return pending;
}

async function frames(name:string,indices:number[]){
 const source=await library(name);
 return Promise.all(indices.map(async index=>{
  const frame=source.frames[index];if(!frame)return undefined;
  const url=`/effects/${name}/${frame.file}`;let pending=textureCache.get(url);
  if(!pending){const task:Promise<Texture>=Assets.load<Texture>(url).then(texture=>{texture.source.scaleMode='nearest';return texture;}).catch(error=>{if(textureCache.get(url)===task)textureCache.delete(url);throw error;});pending=task;textureCache.set(url,pending);}
  return {texture:await pending,x:frame.offsetX,y:frame.offsetY};
 }));
}

export class MagicEffects {
 private generation=0;private sprites=new Set<Sprite>();
 private events=new Map<number,EventVisual>();private eventFrame:number|undefined;
 private miningFrames=new Map<MiningFragmentVisual,number>();private miningVisuals=new Set<MiningFragmentVisual>();private miningError:string|undefined;
 constructor(private depth:Container,private position:(id:number)=>EntityPosition|undefined){}

 clear(){this.generation++;if(this.eventFrame!==undefined)cancelAnimationFrame(this.eventFrame);this.eventFrame=undefined;this.events.clear();for(const handle of this.miningFrames.values())cancelAnimationFrame(handle);this.miningFrames.clear();this.miningVisuals.clear();this.miningError=undefined;for(const sprite of this.sprites)sprite.destroy();this.sprites.clear();}

 /** Called by the actor at heavy-attack frame index 5 after a real DIG marker. */
 miningImpact(at:EntityPosition&{direction:number}){
  const visual:MiningFragmentVisual={x:at.x,y:at.y,direction:at.direction&7,frame:0,clockAt:performance.now(),generation:this.generation};
  this.miningVisuals.add(visual);
  const tick=(now:number)=>{
   this.miningFrames.delete(visual);
   if(visual.generation!==this.generation||!this.miningVisuals.has(visual))return;
   // Native Run starts with the effect, independently of asynchronous textures.
   // It uses strict >80 and advances once without catching up after a long tick.
   if(now-visual.clockAt>80){visual.clockAt=now;++visual.frame;if(visual.frame>=3){this.removeMining(visual);return;}this.paintMining(visual);}
   this.miningFrames.set(visual,requestAnimationFrame(tick));
  };
  this.miningFrames.set(visual,requestAnimationFrame(tick));
  void this.loadMining(visual).catch(error=>{if(visual.generation===this.generation&&this.miningVisuals.has(visual)){this.miningError=String(error);this.removeMining(visual);}});
 }
 debugMiningState(){return {effects:[...this.miningVisuals].map(({x,y,direction,frame,sprite})=>({x,y,direction,frame,visible:Boolean(sprite)})),error:this.miningError};}
 private async loadMining(visual:MiningFragmentVisual){
  const poses=await frames('Effect',range(8*visual.direction,3));
  if(visual.generation!==this.generation||!this.miningVisuals.has(visual))return;
  if(poses.some(pose=>!pose))throw new Error(`Missing mining fragment direction ${visual.direction}`);
  this.miningError=undefined;
  visual.poses=poses;visual.sprite=this.makeSprite(visual);
  // magiceff.TMapEffect draws mode 1 after the actor effects list. Final
  // indexed-palette framebuffer quantization remains a separate fidelity gap.
  visual.sprite.blendMode='screen';visual.sprite.zIndex=Number.MAX_SAFE_INTEGER-16;
  this.paintMining(visual);
 }
 private paintMining(visual:MiningFragmentVisual){
  const pose=visual.poses?.[visual.frame];
  if(pose&&visual.sprite){visual.sprite.texture=pose.texture;visual.sprite.pivot.set(-pose.x,-pose.y);}
 }
 private removeMining(visual:MiningFragmentVisual){
  const handle=this.miningFrames.get(visual);if(handle!==undefined)cancelAnimationFrame(handle);
  this.miningFrames.delete(visual);this.miningVisuals.delete(visual);if(visual.sprite)this.remove(visual.sprite);
 }

 showEvent(packet:MapEventPacket){
  // SM_SHOWEVENT is also sent when an existing event enters view. Its ID
  // owns one animation until SM_HIDEEVENT or a map change, with no client TTL.
  if(this.events.has(packet.id))return;
  const event:EventVisual={packet:{...packet},started:performance.now()};this.events.set(packet.id,event);
  if(packet.eventType!==5)return;
  this.run(this.loadEvent(event));
 }
 hideEvent(id:number){const event=this.events.get(id);if(event?.sprite)this.remove(event.sprite);this.events.delete(id);if(!this.events.size&&this.eventFrame!==undefined){cancelAnimationFrame(this.eventFrame);this.eventFrame=undefined;}}
 debugState(){return [...this.events.values()].map(event=>({...event.packet,visible:Boolean(event.sprite)}));}
 private async loadEvent(event:EventVisual){
  // Reference clEvent.pas: ET_FIRE=5, Magic[1630..1635], two 20ms
  // event ticks per image. Damage and lifetime remain native server decisions.
  const generation=this.generation,poses=await frames('Magic',range(1630,6));
  if(generation!==this.generation||this.events.get(event.packet.id)!==event)return;
  event.poses=poses;event.sprite=this.makeSprite(event.packet);this.paintEvent(event,performance.now());
  if(this.eventFrame===undefined)this.eventFrame=requestAnimationFrame(this.tickEvents);
 }
 private paintEvent(event:EventVisual,now:number){
  const pose=event.poses?.[Math.floor((now-event.started)/40)%6];
  if(pose&&event.sprite){event.sprite.texture=pose.texture;event.sprite.pivot.set(-pose.x,-pose.y);}
 }
 private tickEvents=(now:number)=>{
  this.eventFrame=undefined;let visible=false;
  for(const event of this.events.values())if(event.sprite){this.paintEvent(event,now);visible=true;}
  if(visible)this.eventFrame=requestAnimationFrame(this.tickEvents);
 };

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
     (packet.effectType===8&&packet.effect===10))this.later(420,()=>this.projectile(caster,target,packet.effect===3?400:packet.effect===10?940:0));
  else if(packet.effectType===2&&(packet.effect===2||packet.effect===4||packet.effect===27))
   this.later(420,()=>this.sequence('Magic',range(packet.effect===4?770:packet.effect===27?1960:370,10),target,80));
  else if(packet.effectType===7&&packet.effect===9)this.later(420,()=>this.sequence('Magic2',range(10,10),target,80));
}

 private async projectile(from:EntityPosition,to:EntityPosition,base=0){
  const generation=this.generation,direction=direction16(from,to),poses=await frames('Magic',range(base+10+direction*10,6));
  if(generation!==this.generation)return;
  const sprite=this.makeSprite(from);const distance=Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y)),duration=Math.max(120,distance*50),started=performance.now();
  const tick=(now:number)=>{
   if(generation!==this.generation||sprite.destroyed)return;
   const progress=Math.min(1,(now-started)/duration),frame=Math.min(poses.length-1,Math.floor((now-started)/30)%poses.length),pose=poses[frame];
   sprite.position.set((from.x+(to.x-from.x)*progress)*48,(from.y+(to.y-from.y)*progress)*32);if(pose){sprite.texture=pose.texture;sprite.pivot.set(-pose.x,-pose.y);}
   if(progress<1)requestAnimationFrame(tick);else{this.remove(sprite);this.run(this.sequence('Magic',range(base+170,10),to,60));}
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
