import {Assets,Container,Sprite,Texture} from 'pixi.js';
import contract from '../../../content/classic-176/melee-visual.json';

export type MeleeKind='normal'|'heavy'|'big'|'power'|'thrusting'|'halfMoon'|'fire';
export type SwordKind='power'|'thrusting'|'halfMoon'|'fire';
type ActorMeleeState={feature:number;action:string;direction:number;self?:boolean;dead?:boolean;meleeKind?:MeleeKind;swingSequence?:number;meleeActionId?:number;predictedMelee?:boolean};
type Entry={index:number;file:string;width:number;height:number;offsetX:number;offsetY:number;sha256:string};
type Library={sourceSha256:string;indexSha256:string;sourceFrameCount:number;frames:Record<string,Entry>};
type Pose={texture:Texture;x:number;y:number;index:number};
export type AttackSoundParts={weapon:boolean;skill:boolean};
type Impact=AttackSoundParts&{kind:MeleeKind;sequence:number|undefined;frame:2};
const definitions=contract.specials;
const entries=contract.frames as Record<string,Entry>;
const textureTasks=new Map<string,Promise<Texture>>();
const poseTasks=new Map<string,Promise<Pose[]>>();
let libraryTask:Promise<Library>|undefined;
export function swordKind(kind:MeleeKind|undefined):kind is SwordKind {
 return kind==='power'||kind==='thrusting'||kind==='halfMoon'||kind==='fire';
}
export function meleeBodyKind(kind:MeleeKind|undefined){return kind==='normal'||swordKind(kind);}
export function swordIndex(kind:SwordKind,direction:number,frame:number){
 if(!Number.isInteger(direction)||direction<0||direction>7||!Number.isInteger(frame)||frame<0||frame>=contract.bodyAction.count)throw new Error('Invalid native melee direction/frame');
 return definitions[kind].base+direction*contract.draw.directionStride+frame;
}
async function library(){
 if(!libraryTask){
  libraryTask=fetch(contract.draw.url+'library.json').then(async response=>{
   if(!response.ok)throw new Error('Missing native melee Magic manifest');
   const value=await response.json() as Library;
   if(value.sourceSha256!==contract.evidence.sourceSha256||value.indexSha256!==contract.evidence.indexSha256||value.sourceFrameCount!==contract.evidence.sourceFrameCount)throw new Error('Native melee Magic source mismatch');
   return value;
  }).catch(error=>{libraryTask=undefined;throw error;});
 }
 return libraryTask;
}
async function swordPoses(kind:SwordKind,direction:number){
 const key=kind+'/'+direction;
 let task=poseTasks.get(key);
 if(!task){
  task=library().then(async lib=>Promise.all(Array.from({length:contract.bodyAction.count},async(_,frame)=>{
   const index=swordIndex(kind,direction,frame),expected=entries[index],entry=lib.frames[index];
   if(!entry||!expected||(['index','file','width','height','offsetX','offsetY','sha256'] as const).some(field=>entry[field]!==expected[field])){libraryTask=undefined;throw new Error('Native melee frame mismatch: '+index);}
   if(!/^[A-Za-z0-9_.-]+\.png$/.test(entry.file))throw new Error('Invalid melee frame file');
   const url=contract.draw.url+entry.file;
   let pending=textureTasks.get(url);
   if(!pending){
    pending=Assets.load<Texture>(url).then(texture=>{texture.source.scaleMode='nearest';return texture;}).catch(error=>{textureTasks.delete(url);throw error;});
    textureTasks.set(url,pending);
   }
   return {texture:await pending,x:entry.offsetX,y:entry.offsetY,index};
  }))).catch(error=>{poseTasks.delete(key);throw error;});
  poseTasks.set(key,task);
 }
 return task;
}

// One clock drives the original body, weapon, hair and optional sword overlay.
// Actor.Run uses strict >85ms and advances at most once, including slow RAFs.
export class ActorMeleeVisual {
 private active=false;private destroyed=false;private complete=false;private cancelled=false;private predicted=false;private actionId:number|undefined;private seenPredictionId:number|undefined;private adopted=false;
 private kind:MeleeKind|undefined;private direction=0;private sequence:number|undefined;
 private seenSequence:number|undefined;private seenIdentity=false;private observedEligible=false;private bodyReady=false;
 private frame=0;private frameAt=0;private weaponImpact=false;private skillImpact=false;
 private sprite:Sprite|undefined;private poses:Pose[]|undefined;
 private generation=0;private loading=false;private loadError:string|undefined;
 constructor(private parent:Container,private onImpact?:(impact:Impact)=>void){}
 update(entity:ActorMeleeState,time=performance.now()){
  if(this.destroyed)return false;
  this.adopted=false;
  const valid=(entity.feature&255)===0&&!entity.dead&&entity.action==='attack'&&meleeBodyKind(entity.meleeKind)&&Number.isInteger(entity.direction)&&entity.direction>=0&&entity.direction<=7;
  if(!valid){
   this.observedEligible=false;
   // Only an exhausted prediction's automatic standing transition preserves
   // its consumed clock for a same-request delayed confirmation.
   const preserveCompletedPrediction=this.complete&&!this.cancelled&&entity.action==='standing'&&entity.predictedMelee===true&&entity.meleeActionId===this.actionId;
   this.cancel(preserveCompletedPrediction);return false;
  }
  const isPrediction=entity.predictedMelee===true;
  const validId=Number.isSafeInteger(entity.meleeActionId)&&entity.meleeActionId!>0;
  if(isPrediction&&(entity.self!==true||entity.meleeKind!=='normal'||!validId)){this.cancelled=true;this.cancel();return false;}
  // Adopt this exact processed tick/frameAt only; no floor(elapsed) or catchup.
  const adopt=!isPrediction&&entity.self===true&&validId&&this.predicted&&!this.cancelled&&entity.meleeActionId===this.actionId&&this.direction===entity.direction;
  if(adopt){
   this.clearLayer();this.kind=entity.meleeKind;this.sequence=entity.swingSequence;this.seenSequence=entity.swingSequence;this.seenIdentity=true;this.predicted=false;this.adopted=true;
   if(this.frame>contract.impactFrame)this.skillImpact=true;
  }else{
   if(isPrediction&&this.seenPredictionId!==undefined&&entity.meleeActionId!<=this.seenPredictionId&&(!this.predicted||this.cancelled||this.complete))return false;
   if(isPrediction&&this.seenPredictionId!==undefined&&entity.meleeActionId!<this.seenPredictionId)return false;
   const fresh=isPrediction?entity.meleeActionId!==this.seenPredictionId:entity.swingSequence!==undefined?(!this.seenIdentity||entity.swingSequence!==this.seenSequence):!this.observedEligible;
   if(!fresh&&(this.kind!==entity.meleeKind||this.direction!==entity.direction)){this.cancelled=true;this.cancel();return false;}
   if(fresh){
    this.clearLayer();this.active=true;this.complete=false;this.cancelled=false;this.kind=entity.meleeKind;this.direction=entity.direction;this.sequence=entity.swingSequence;this.seenSequence=entity.swingSequence;this.seenIdentity=true;
    this.predicted=isPrediction;this.actionId=validId?entity.meleeActionId:undefined;if(isPrediction)this.seenPredictionId=entity.meleeActionId;
    this.frame=0;this.frameAt=time;this.weaponImpact=this.skillImpact=false;this.bodyReady=false;
   }
  }
  this.observedEligible=true;
  if(this.active&&!this.predicted&&swordKind(this.kind)&&!this.sprite&&!this.loading)this.load();
  this.paint();return this.adopted;
 }
 tick(time:number){
  if(this.destroyed||!this.active)return;
  // RunActSound precedes this tick's advancement. Prediction may play only
  // weapon audio; a same-frame confirmed kind can add skill audio once.
  if(this.frame===contract.impactFrame){
   const weapon=!this.weaponImpact,skill=!this.predicted&&swordKind(this.kind)&&!this.skillImpact;
   if(weapon||skill){
    this.weaponImpact=true;if(skill)this.skillImpact=true;
    this.onImpact?.({kind:this.kind!,sequence:this.sequence,frame:2,weapon,skill});
   }
  }
  if(time-this.frameAt>contract.bodyAction.interval){
   this.frameAt=time;this.frame++;
   if(this.frame>=contract.bodyAction.count){this.active=false;this.complete=true;this.clearLayer();return;}
  }
  this.paint();
 }
 private load(){
  if(this.predicted||!swordKind(this.kind))return;
  const generation=++this.generation,kind=this.kind,direction=this.direction;
  this.loading=true;this.loadError=undefined;
  void swordPoses(kind,direction).then(poses=>{
   if(this.destroyed||!this.active||this.predicted||generation!==this.generation)return;
   this.loading=false;this.poses=poses;
   const sprite=new Sprite(Texture.EMPTY);sprite.label='melee-sword';sprite.eventMode='none';sprite.zIndex=contract.draw.actorZIndex;sprite.blendMode='screen';
   sprite.visible=this.bodyReady;this.sprite=sprite;this.parent.addChild(sprite);this.paint();
  }).catch(error=>{
   if(!this.destroyed&&this.active&&generation===this.generation){this.loading=false;this.loadError=String(error);}
  });
 }
 private paint(){
  if(!this.active||!this.sprite||!this.poses)return;
  const pose=this.poses[this.frame];if(!pose)return;
  this.sprite.texture=pose.texture;this.sprite.position.set(pose.x,pose.y);this.sprite.visible=this.bodyReady;
 }
 private clearLayer(){
  ++this.generation;this.loading=false;this.loadError=undefined;this.poses=undefined;
  this.sprite?.destroy();this.sprite=undefined;
 }
 cancel(preserveCompletedPrediction=false){
  if(!preserveCompletedPrediction)this.cancelled=true;
  if(!this.active&&!this.loading&&!this.sprite)return;
  this.active=false;this.complete=true;this.clearLayer();
 }
 setBodyReady(ready:boolean){this.bodyReady=ready;this.paint();}
 bodyFrame(){return this.active?this.frame:this.complete?contract.bodyAction.count:undefined;}
 owns(kind:MeleeKind|undefined,sequence:number|undefined){return this.seenIdentity&&this.kind===kind&&this.sequence===sequence;}
 debugState(){return {active:this.active,complete:this.complete,kind:this.kind,direction:this.direction,sequence:this.sequence,actionId:this.actionId,predicted:this.predicted,adopted:this.adopted,cancelled:this.cancelled,frame:this.frame,frameAt:this.frameAt,visible:Boolean(this.sprite)&&this.bodyReady,bodyReady:this.bodyReady,loading:this.loading,loadError:this.loadError,impactFired:this.weaponImpact,skillImpactFired:this.skillImpact,index:swordKind(this.kind)&&this.active?swordIndex(this.kind,this.direction,this.frame):undefined};}
 destroy(){if(this.destroyed)return;this.cancel();this.destroyed=true;}
}
