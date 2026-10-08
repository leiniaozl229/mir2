import {Assets,Container,Graphics,Sprite,Text,Texture,type Filter} from 'pixi.js';
import {createActorPaletteFilter} from './actor-palette';
import {ActorMeleeVisual,type MeleeKind,type AttackSoundParts} from './melee-visual';
import {resolveMonsterVisual} from './monster-visuals';
import {nationalUsesLayout} from './classic-layout';
import {actionFrame,monsterLayers,nationalAction,playerLayers,singleAction,weaponZIndex,type PlayerLayers} from './national-actors';
export {playerLayers,type PlayerLayers} from './national-actors';
import {MOVEMENT_DURATION_MS,MOVEMENT_SETTLE_MS,forcedMovementDuration,routeDirection,visualDirection} from './movement-visual';
import {nativeNpcPose,nativeNpcLibraryMatches,type NativeNpcPose} from './npc-visuals';
export type Entity={id:number;x:number;y:number;direction:number;feature:number;name:string;self:boolean;action:string;dead?:boolean;hp?:number;maxHp?:number;light?:number;status?:number;hitSpeed?:number;nameColor?:number;kind?:string;rushTarget?:{x:number;y:number};struckSequence?:number;digFragment?:boolean;swingSequence?:number;meleeKind?:MeleeKind;meleeActionId?:number;predictedMelee?:boolean};
type Frame={file:string;offsetX:number;offsetY:number};
type Action={start:number;count:number;skip:number;interval:number};
type Library={frames:Record<string,Frame>;actions?:Record<string,Action>;profile?:string;sourceSha256?:string;indexSha256?:string;sourceFrameCount?:number};
type Pose={texture:Texture;x:number;y:number;index?:number};
const libraryCache=new Map<string,Promise<Library>>(),textureCache=new Map<string,Promise<Texture>>();
const playerActions:Record<string,Action>={standing:{start:0,count:4,skip:0,interval:500},walking:{start:32,count:6,skip:0,interval:100},running:{start:80,count:6,skip:0,interval:100},attack:{start:136,count:6,skip:0,interval:100},spell:{start:296,count:6,skip:0,interval:100},harvest:{start:344,count:2,skip:0,interval:300},struck:{start:360,count:3,skip:0,interval:100},dying:{start:384,count:4,skip:0,interval:100},dead:{start:387,count:1,skip:3,interval:1000}};
async function library(name:string){let task=libraryCache.get(name);if(!task){task=fetch(`/actors/${name}/library.json`).then(async response=>{if(!response.ok)throw new Error(`缺少素材 ${name}`);return response.json();});task=task.catch(error=>{libraryCache.delete(name);throw error;});libraryCache.set(name,task);}return task;}
async function poses(name:string,action:string,direction:number,offset:number,race=0){
 const lib=await library(name),definition=lib.profile==='national-2003-gameplay'?nationalAction(action,race):lib.actions?.[{standing:'0',walking:'1',running:'2',attack:'9',struck:'18',dying:'21',dead:'22'}[action]!]??playerActions[action];
 if(!definition)throw new Error(`缺少动作 ${name}/${action}`);
 return {interval:definition.interval,frames:await Promise.all(Array.from({length:definition.count},async(_,frame)=>{
  const index=actionFrame(definition,direction,frame,offset),entry=lib.frames[index];
  if(!entry)return {texture:Texture.EMPTY,x:0,y:0,index:index-offset};
  const url=`/actors/${name}/${entry.file}`;let task=textureCache.get(url);if(!task){task=Assets.load<Texture>(url).then(texture=>{texture.source.scaleMode='nearest';return texture;});textureCache.set(url,task);}
  return {texture:await task,x:entry.offsetX,y:entry.offsetY,index:index-offset};
 }))};
}
const locomotionPreloads=new Map<string,Promise<void>>();
export function preloadPlayerLocomotion(feature:number){
 const layers=playerLayers(feature);if(!layers)return Promise.resolve();
 const key=`${layers.bodyName}/${layers.offset}/${layers.hairName}/${layers.hairOffset}/${layers.weaponName}/${layers.weaponOffset}`;
 let task=locomotionPreloads.get(key);
 if(!task){
  const jobs:Promise<unknown>[]=[];
  for(const action of ['standing','walking','running'])for(let direction=0;direction<8;direction++){
   jobs.push(poses(layers.bodyName,action,direction,layers.offset));
   if(layers.weaponName)jobs.push(poses(layers.weaponName,action,direction,layers.weaponOffset));
   if(layers.hairName)jobs.push(poses(layers.hairName,action,direction,layers.hairOffset));
  }
  task=Promise.all(jobs).then(()=>{},()=>{});locomotionPreloads.set(key,task);
 }
 return task;
}
async function npcPoses(pose:NativeNpcPose|undefined){
 if(!pose)throw new Error('原客户端 NPC 外观未解析');
 const lib=await library('NPC00');
 if(!nativeNpcLibraryMatches(lib)){libraryCache.delete('NPC00');throw new Error('NPC00 素材与仓库原客户端版本不一致');}
 const entries=pose.indices.map(index=>{const entry=lib.frames[index];if(!entry){libraryCache.delete('NPC00');throw new Error(`缺少 NPC 原帧 NPC00/${index}`);}return {index,entry};});
 return {interval:pose.interval,frames:await Promise.all(entries.map(async ({index,entry})=>{
  const url=`/actors/NPC00/${entry.file}`;let task=textureCache.get(url);
  if(!task){task=Assets.load<Texture>(url).then(texture=>{texture.source.scaleMode='nearest';return texture;}).catch(error=>{textureCache.delete(url);throw error;});textureCache.set(url,task);}
  return {texture:await task,x:entry.offsetX,y:entry.offsetY,index};
 }))};
}

const bubbleIndices=[3890,3891,3892,3900,3901,3902] as const;
const bubbleTextures=new Map<string,Promise<Texture>>();
let bubblePosesTask:Promise<Map<number,Pose>>|undefined;
async function bubblePoses(){
 if(!bubblePosesTask){
  const task=fetch('/effects/Magic/library.json').then(async response=>{
   if(!response.ok)throw new Error('缺少魔法盾素材 Magic');
   const source=await response.json() as Library;
   return new Map(await Promise.all(bubbleIndices.map(async index=>{
    const entry=source.frames[index];if(!entry)throw new Error(`缺少魔法盾帧 Magic/${index}`);
    const url=`/effects/Magic/${entry.file}`;let pending=bubbleTextures.get(url);
    if(!pending){pending=Assets.load<Texture>(url).then(texture=>{texture.source.scaleMode='nearest';return texture;}).catch(error=>{bubbleTextures.delete(url);throw error;});bubbleTextures.set(url,pending);}
    return [index,{texture:await pending,x:entry.offsetX,y:entry.offsetY,index}] as const;
   })));
  });
  bubblePosesTask=task.catch(error=>{bubblePosesTask=undefined;throw error;});
 }
 return bubblePosesTask;
}

type ActorStatus=Pick<Entity,'status'|'feature'|'action'|'dead'|'struckSequence'>;
// Actor.pas THumActor.DrawChr: one actor-owned Magic layer follows the
// actor foot and the confirmed STATE_BUBBLEDEFENCEUP bit, without a TTL.
export class ActorStatusEffects {
 private status=0;private action='standing';private struckSequence:number|undefined;
 private active=false;private destroyed=false;private generation=0;private loading=false;
 private sprite:Sprite|undefined;private poses:Map<number,Pose>|undefined;private loadError:string|undefined;
 private animatedAt=performance.now();private animationCount=0;private bubbleStruck=3;private frameIndex:number|undefined;
 constructor(private parent:Container){}
 update(entity:ActorStatus,time=performance.now()){
  if(this.destroyed)return;
  this.advance(time);
  const newStruck=entity.action==='struck'&&(entity.struckSequence!==undefined?entity.struckSequence!==this.struckSequence:this.action!=='struck');
  if(newStruck){this.animatedAt=time;this.bubbleStruck=0;}
  this.action=entity.action;this.struckSequence=entity.struckSequence;this.status=(entity.status??0)>>>0;
  const enabled=(entity.feature&255)===0&&(this.status&0x00100000)!==0&&!entity.dead&&entity.action!=='dying'&&entity.action!=='dead';
  if(!enabled){this.clear();return;}
  this.active=true;
  if(!this.sprite&&!this.loading)this.load();
  this.paint();
 }
 tick(time:number){if(this.destroyed)return;this.advance(time);this.paint();}
 private advance(time:number){
  const ticks=Math.max(0,Math.floor((time-this.animatedAt)/120));
  if(ticks){this.animationCount=(this.animationCount+ticks)%100001;this.bubbleStruck=Math.min(3,this.bubbleStruck+ticks);this.animatedAt+=ticks*120;}
 }
 private load(){
  const generation=++this.generation;this.loading=true;this.loadError=undefined;
  void bubblePoses().then(poses=>{
   if(this.destroyed||!this.active||generation!==this.generation)return;
   this.loading=false;this.poses=poses;
   const sprite=new Sprite(Texture.EMPTY);sprite.label='magic-shield';sprite.eventMode='none';sprite.zIndex=3;
   // cliUtil.DrawBlend(mode 1) computes screen before nearest-palette
   // quantization. Pixi retains the channel blend, not the 8-bit lookup.
   sprite.blendMode='screen';this.sprite=sprite;this.parent.addChild(sprite);this.tick(performance.now());
  }).catch(error=>{if(!this.destroyed&&this.active&&generation===this.generation){this.loading=false;this.loadError=String(error);}});
 }
 private paint(){
  if(!this.active||!this.sprite||!this.poses)return;
  const index=this.action==='struck'&&this.bubbleStruck<3?3900+this.bubbleStruck:3890+this.animationCount%3;
  const pose=this.poses.get(index);if(!pose)return;
  this.frameIndex=index;this.sprite.texture=pose.texture;this.sprite.position.set(pose.x,pose.y);
 }
 clear(){
  if(!this.active&&!this.loading&&!this.sprite)return;
  ++this.generation;this.active=false;this.loading=false;this.poses=undefined;this.frameIndex=undefined;this.loadError=undefined;
  this.sprite?.destroy();this.sprite=undefined;
 }
 debugState(){return {status:this.status,active:this.active,visible:Boolean(this.sprite),loading:this.loading,frame:this.frameIndex,action:this.action,struckFrame:this.bubbleStruck,loadError:this.loadError};}
 destroy(){this.clear();this.destroyed=true;}
}

export type ActorDrawEffect='none'|'green'|'red'|'blue'|'yellow'|'fuchsia'|'gray';
export function actorDrawEffect(status:number):ActorDrawEffect {
 // GetDrawEffectValue assigns these in order; the later state wins.
 if(status&0x04000000)return 'gray';
 if(status&0x08000000)return 'fuchsia';
 if(status&0x10000000)return 'yellow';
 if(status&0x20000000)return 'blue';
 if(status&0x40000000)return 'red';
 if(status&0x80000000)return 'green';
 return status&0x00000001?'gray':'none';
}

export class OnlineActor {
 private rushRight=false;
 private destroyed=false;private observedAction='standing';private lastSwingSequence:number|undefined;
 private swing:{start:number;armed:boolean;fired:boolean}|undefined;
 private meleeVisual:ActorMeleeVisual|undefined;
 private otherAttackImpact:{sequence:number|undefined;kind:'heavy'|'big';fired:boolean}|undefined;private otherAttackActive=false;
 readonly container=new Container();
 private statusEffects=new ActorStatusEffects(this.container);private confirmedStatus=0;private statusColor:ActorDrawEffect='none';private statusFilter:Filter|undefined;
 private marker=new Graphics();private weapon=new Sprite();private body=new Sprite();private hair=new Sprite();private healthBack=new Graphics();private health=new Graphics();private label=new Text({text:'',style:{fontFamily:'SimSun, Songti SC, serif',fontSize:12,fill:0xffffff,stroke:{color:0x000000,width:3}}});
 private sequence=0;private loadingPose=false;private loadError:string|undefined;private key='';private poseBaseKey='';private start=0;private frames:Pose[]=[];private weaponFrames:Pose[]=[];private hairFrames:Pose[]=[];private interval=500;private entity:Entity;private movement:{fromX:number;fromY:number;toX:number;toY:number;start:number;duration:number}|undefined;private movementQueue:Entity[]=[];private movementEndedAt:number|undefined;private labelBaseY=-64;private labelOffsetY=0;private labelOffsetX=0;
 constructor(entity:Entity,interact?:(entity:Entity)=>void,private onMiningImpact?:(entity:Entity)=>void,private onMeleeImpact?:(entity:Entity,parts:AttackSoundParts)=>void){this.entity=entity;this.container.sortableChildren=true;this.marker.zIndex=-2;this.body.zIndex=0;this.hair.zIndex=1;this.healthBack.zIndex=this.health.zIndex=8;this.label.zIndex=9;this.container.addChild(this.marker,this.weapon,this.body,this.hair,this.healthBack,this.health,this.label);this.label.anchor.set(.5,1);this.label.position.set(24,this.labelBaseY);if(interact)this.container.eventMode='static';this.applyCursor();}
 update(entity:Entity,movementStart=performance.now(),fromQueue=false){
  if(this.destroyed)return;
  if(!fromQueue){
   const otherKind=entity.meleeKind==='heavy'&&entity.action==='heavyAttack'?'heavy':entity.meleeKind==='big'&&entity.action==='wideAttack'?'big':undefined;
   this.otherAttackActive=otherKind!==undefined&&!entity.dead&&(entity.feature&255)===0;
   if(this.otherAttackActive&&otherKind){
    const fresh=entity.swingSequence!==undefined?entity.swingSequence!==this.otherAttackImpact?.sequence||otherKind!==this.otherAttackImpact?.kind:this.observedAction!==entity.action;
    if(fresh)this.otherAttackImpact={sequence:entity.swingSequence,kind:otherKind,fired:false};
   }
   const heavy=entity.action==='heavyAttack'&&!entity.dead&&(entity.feature&255)===0;
   if(heavy){
    const fresh=entity.swingSequence!==undefined?entity.swingSequence!==this.lastSwingSequence:this.observedAction!=='heavyAttack';
    if(fresh)this.swing={start:performance.now(),armed:entity.digFragment===true,fired:false};
    else if(this.swing&&!this.swing.fired&&entity.digFragment===true)this.swing.armed=true;
    this.lastSwingSequence=entity.swingSequence;
   }else this.swing=undefined;
   this.observedAction=entity.action;
  }
  // Status packets apply immediately, including while a remote walk waits
  // in the visual queue. Queued snapshots cannot restore an older buff.
  if(fromQueue)entity={...entity,status:this.confirmedStatus};
  else{
   this.confirmedStatus=(entity.status??0)>>>0;this.statusEffects.update(entity);
   this.container.alpha=(this.confirmedStatus&0x00800000)!==0?.38:1;
   const effect=actorDrawEffect(this.confirmedStatus);
   if(effect!==this.statusColor){
    this.statusColor=effect;this.statusFilter?.destroy();this.statusFilter=undefined;
    if(effect!=='none')this.statusFilter=createActorPaletteFilter(effect);
    this.body.filters=this.hair.filters=this.statusFilter?[this.statusFilter]:[];
   }
  }
  let adoptedMelee=false;
  if(!fromQueue&&(entity.meleeKind!==undefined||this.meleeVisual)){
   this.meleeVisual??=new ActorMeleeVisual(this.container,impact=>this.onMeleeImpact?.({...this.entity,meleeKind:impact.kind,swingSequence:impact.sequence},{weapon:impact.weapon,skill:impact.skill}));
   adoptedMelee=this.meleeVisual.update(entity);
  }
  const forced=entity.action==='rush'||entity.action==='backstep'||entity.action==='rushBlocked';
  if(forced||entity.dead||entity.action==='dying'||entity.action==='dead')this.movementQueue=[];
  const origin=!fromQueue&&!entity.self&&this.movementQueue.length?this.movementQueue[this.movementQueue.length-1]:this.entity;
  const blocked=entity.action==='rushBlocked'&&entity.rushTarget!==undefined;
  const toX=(blocked?(entity.x+entity.rushTarget!.x)/2:entity.x)*48,toY=(blocked?(entity.y+entity.rushTarget!.y)/2:entity.y)*32;let moving=blocked||(entity.action==='walking'||entity.action==='running'||forced)&&(origin.x!==entity.x||origin.y!==entity.y);const sameDestination=this.movement?.toX===toX&&this.movement?.toY===toY;
  if(moving&&!forced)entity={...entity,direction:routeDirection(origin.x,origin.y,entity.x,entity.y,entity.direction)};
  const stepDistance=Math.max(Math.abs(entity.x-origin.x),Math.abs(entity.y-origin.y)),maximumStep=entity.action==='running'?2:1;
  if(!entity.self&&!forced&&moving&&(stepDistance>maximumStep||this.movementQueue.length>=8)){
   this.movementQueue=[];this.movement=undefined;this.movementEndedAt=undefined;this.container.position.set(toX,toY);moving=false;entity={...entity,action:entity.dead?'dead':'standing'};
  }
  if(!fromQueue&&!entity.self&&!forced&&moving&&(this.movement!==undefined||this.movementQueue.length>0)){
   const destination=this.movementQueue[this.movementQueue.length-1]??this.entity;
   if(destination.x!==entity.x||destination.y!==entity.y)this.movementQueue.push(entity);
   return;
  }
  // A step owns its full visual interval. Remote follow-up steps wait in
  // arrival order instead of replacing the active interpolation.
  if(moving&&!sameDestination){this.movement={fromX:this.container.x,fromY:this.container.y,toX,toY,start:movementStart,duration:forced?forcedMovementDuration(entity.action):MOVEMENT_DURATION_MS};this.movementEndedAt=undefined;this.start=movementStart;}
  else if(!moving&&!sameDestination){this.movement=undefined;this.movementEndedAt=undefined;this.container.position.set(toX,toY);}
  this.entity=entity;this.container.zIndex=entity.y*10000+entity.x+.5;this.label.text=entity.name;this.label.style.fill=nameFill(entity.nameColor);this.labelOffsetY=0;this.labelOffsetX=0;this.applyLabelOffset();this.applyCursor();this.drawHealth();
  const race=entity.feature&255,dress=(entity.feature>>>24)&255;
  const slave=entity.kind==='slave'||entity.nameColor===254||entity.name==='变异骷髅';
  this.marker.clear();if(race===50&&(!this.frames.length||this.loadingPose||this.loadError))this.marker.circle(24,-22,12).fill(0x9a793f).stroke({color:0xe0c27d,width:2});
  else if(slave)this.marker.circle(24,-18,10).stroke({color:0x00ff66,width:2,alpha:.9});
  let bodyName:string|undefined,hairName:string|undefined,weaponName:string|undefined,offset=0,hairOffset=0,weaponOffset=0,npcPose:NativeNpcPose|undefined;
  const layers=playerLayers(entity.feature);
  if(layers){
   bodyName=layers.bodyName;offset=layers.offset;hairName=layers.hairName;hairOffset=layers.hairOffset;weaponName=layers.weaponName;weaponOffset=layers.weaponOffset;
   if(!this.frames.length)this.marker.circle(24,-22,11).fill({color:0xbda36a,alpha:.85}).stroke({color:0xf4df9b,width:2});
   if(entity.self)void preloadPlayerLocomotion(entity.feature);
  }
  else if(race===50){bodyName='NPC00';npcPose=nativeNpcPose(entity.feature,entity.direction);offset=npcPose?.offset??-1;}
  else{
   bodyName=resolveMonsterVisual(entity.feature,entity.name);
   offset=monsterLayers(entity.feature)?.offset??0;
   if(!bodyName){
    const color=((entity.feature>>>16)&1)?0x9a6b4b:0x707b91;
    this.marker.circle(24,-22,13).fill({color,alpha:.92}).stroke({color:0xe8d6a3,width:2});
    this.marker.circle(24,-22,4).fill(0x241d18);
   }
  }
  if(entity.action==='rush'&&moving)this.rushRight=!this.rushRight;
  const action=entity.action==='dying'?'dying':entity.dead?'dead':entity.action==='rush'?(this.rushRight?'rushLeft':'rushRight'):entity.action,poseDirection=race===50?npcPose?.direction??-1:visualDirection(entity.direction),key=`${bodyName}/${hairName}/${hairOffset}/${action}/${poseDirection}/${offset}`;
  const poseBaseKey=key+'/'+armourShapeKey(dress)+'/'+weaponName+'/'+weaponOffset+(race===50?'/'+(entity.feature>>>16):'');
  const visualKey=poseBaseKey+'/'+(entity.action==='struck'?entity.struckSequence??0:['attack','heavyAttack','wideAttack'].includes(entity.action)?entity.swingSequence??0:'');
  if(adoptedMelee&&poseBaseKey===this.poseBaseKey){this.key=visualKey;return;}
  if(visualKey===this.key&&!(race===50&&this.loadError))return;this.poseBaseKey=poseBaseKey;this.key=visualKey;const generation=++this.sequence;this.meleeVisual?.setBodyReady(false);this.loadingPose=true;this.loadError=undefined;
  if(race===50){this.frames=[];this.body.texture=Texture.EMPTY;this.marker.clear().circle(24,-22,12).fill(0x9a793f).stroke({color:0xe0c27d,width:2});}
  if(!bodyName){this.loadingPose=false;return;}
  this.weapon.zIndex=[0,5,6,7].includes(poseDirection)?-1:2;
  void Promise.all([race===50?npcPoses(npcPose):poses(bodyName,action,poseDirection,offset,race),weaponName?poses(weaponName,action,poseDirection,weaponOffset):Promise.resolve(undefined),hairName?poses(hairName,action,poseDirection,hairOffset):Promise.resolve(undefined)]).then(([body,heldWeapon,hair])=>{
   if(this.destroyed||generation!==this.sequence)return;this.loadingPose=false;this.frames=body.frames;this.weaponFrames=heldWeapon?.frames??[];this.hairFrames=hair?.frames??[];this.interval=body.interval;this.start=this.movement?.start??(this.entity.action==='heavyAttack'?this.swing?.start:undefined)??performance.now();this.labelBaseY=Math.min(...body.frames.map(frame=>frame.y))-4;this.applyLabelOffset();if(layers||race===50)this.marker.clear();this.drawHealth();
  }).catch(error=>{if(generation===this.sequence){this.loadingPose=false;this.loadError=String(error);console.warn(`Actor assets: ${bodyName}`,error);}});
 }
 tick(time:number){
  if(this.destroyed)return;
  this.applyCursor();
  this.statusEffects.tick(time);
  this.meleeVisual?.tick(time);
  const movement=this.movement;
  const movementProgress=movement?Math.min(1,Math.max(0,(time-movement.start)/movement.duration)):undefined;
  if(movement&&movementProgress!==undefined){this.container.position.set(movement.fromX+(movement.toX-movement.fromX)*movementProgress,movement.fromY+(movement.toY-movement.fromY)*movementProgress);if(movementProgress===1){if(this.entity.action==='rushBlocked')this.container.position.set(this.entity.x*48,this.entity.y*32);this.movement=undefined;this.movementEndedAt=time;const next=this.movementQueue.shift();if(next){this.update(next,time,true);return;}}}
  if(this.loadingPose||!this.frames.length)return;
  const locomotion=this.entity.action==='walking'||this.entity.action==='running'||this.entity.action==='rush'||this.entity.action==='backstep'||this.entity.action==='rushBlocked';
  const meleeFrame=this.entity.action==='attack'&&this.meleeVisual?.owns(this.entity.meleeKind,this.entity.swingSequence)?this.meleeVisual.bodyFrame():undefined;
  let frame=meleeFrame??(locomotion&&movementProgress!==undefined?Math.min(this.frames.length-1,Math.floor(movementProgress*this.frames.length)):Math.floor((time-this.start)/this.interval));
  if(locomotion&&movementProgress===1)frame=this.frames.length-1;
  if(locomotion&&movementProgress===undefined&&this.movementEndedAt!==undefined){if(this.entity.self||time-this.movementEndedAt<MOVEMENT_SETTLE_MS)frame=this.frames.length-1;else{this.update({...this.entity,status:this.confirmedStatus,action:'standing'});return;}}
  if(this.entity.action==='rushBlocked')frame=Math.min(2,movementProgress===undefined?Math.floor((time-this.start)/120):Math.floor(movementProgress*3));
  if(singleAction(this.entity.action)&&frame>=this.frames.length){this.update({...this.entity,status:this.confirmedStatus,action:this.entity.action==='dying'?'dead':'standing'});return;}
  frame%=this.frames.length;
  if(this.entity.action==='backstep')frame=this.frames.length-1-frame;
  if((this.entity.feature&255)===0)this.weapon.zIndex=weaponZIndex((this.entity.feature>>>24)&1,this.frames[frame].index??0);
  for(const [sprite,pose] of [[this.body,this.frames[frame]],[this.weapon,this.weaponFrames[frame]],[this.hair,this.hairFrames[frame]]] as const){sprite.texture=pose?.texture??Texture.EMPTY;if(pose)sprite.position.set(pose.x,pose.y);}
  this.meleeVisual?.setBodyReady(this.meleeVisual.owns(this.entity.meleeKind,this.entity.swingSequence)&&meleeFrame!==undefined&&this.frames[frame].texture!==Texture.EMPTY);
  if(frame===2&&this.otherAttackActive&&this.otherAttackImpact&&!this.otherAttackImpact.fired){
   this.otherAttackImpact.fired=true;this.onMeleeImpact?.({...this.entity},{weapon:true,skill:false});
  }
  // Actor.pas RunFrameAction receives currentFrame-startFrame: frame 5
  // is the sixth/last heavy-hit frame, not the fifth displayed frame.
  // A real DIG marker is consumed once; cancelled or late-loaded swings
  // cannot play fragments after their original action has elapsed.
  if(this.entity.action==='heavyAttack'&&frame===5&&this.swing?.armed&&!this.swing.fired){
   this.swing.fired=true;this.swing.armed=false;this.entity={...this.entity,digFragment:false};this.onMiningImpact?.({...this.entity});
  }
 }
 private drawHealth(){
  const visible=this.entity.hp!==undefined&&this.entity.maxHp!==undefined&&this.entity.maxHp>0&&!this.entity.dead;
  this.healthBack.clear();this.health.clear();if(!visible)return;
  const x=this.label.x-20,y=this.label.y+2,ratio=Math.max(0,Math.min(1,this.entity.hp!/this.entity.maxHp!));
  this.healthBack.rect(x,y,40,4).fill(0x201810);this.health.rect(x+1,y+1,38*ratio,2).fill(0xd13c32);
 }
 setLabelOffset(offset:number,horizontal=0){if(offset===this.labelOffsetY&&horizontal===this.labelOffsetX)return;this.labelOffsetY=offset;this.labelOffsetX=horizontal;this.applyLabelOffset();this.drawHealth();}
 labelBoundsAt(offset:number,horizontal=0){const x=this.label.x,y=this.label.y;this.label.position.set(24+horizontal,this.labelBaseY+offset);const bounds=this.label.getBounds();this.label.position.set(x,y);return bounds;}
 labelBounds(){return this.label.getBounds();}
 setLabelVisible(visible:boolean){this.label.visible=visible;this.healthBack.visible=visible;this.health.visible=visible;}
  debugState(){return {pixel:{x:this.container.x,y:this.container.y},movement:this.movement?{...this.movement}:undefined,queuedMovements:this.movementQueue.length,action:this.entity.action,direction:this.entity.direction,framesReady:this.frames.length>0&&!this.loadingPose,loadError:this.loadError,poseKey:this.key,statusEffects:this.statusEffects.debugState(),statusColor:this.statusColor,miningSwing:this.swing?{...this.swing}:undefined,meleeVisual:this.meleeVisual?.debugState()};}
 hitTest(x:number,y:number){return actorHitTest(this.entity.self,this.container.getBounds(),x,y);}
 private applyLabelOffset(){this.label.position.set(24+this.labelOffsetX,this.labelBaseY+this.labelOffsetY);}
 private applyCursor(){
  const race=this.entity.feature&255;
  const national=nationalUsesLayout();
  const cursor=national?(race===50?'pointer':this.entity.dead?'auto':'crosshair'):race===50?'url("/ui/Cursors/Cursor_Npc.CUR"), pointer':this.entity.dead?'url("/ui/Cursors/Cursor_Default.CUR"), auto':'url("/ui/Cursors/Cursor_Normal_Atk.CUR"), crosshair';
  if(this.container.cursor!==cursor)this.container.cursor=cursor;
 }
 destroy(){if(this.destroyed)return;this.destroyed=true;this.sequence++;this.swing=undefined;this.otherAttackActive=false;this.movementQueue=[];this.statusEffects.destroy();this.meleeVisual?.destroy();this.body.filters=this.hair.filters=[];this.statusFilter?.destroy();this.statusFilter=undefined;this.container.destroy({children:true});}
}

export function actorHitTest(self:boolean,bounds:{x:number;y:number;width:number;height:number},x:number,y:number){
 return !self&&x>=bounds.x&&x<=bounds.x+bounds.width&&y>=bounds.y&&y<=bounds.y+bounds.height;
}

function armourShapeKey(dress:number){return dress>>1;}
function nameFill(color:number|undefined){
 if(color===undefined||color===255)return 0xffffff;
 if(color===254)return 0x00ff66;
 if(color===249)return 0xff4040;
 if(color===250)return 0xffff40;
 if(color===0x93)return 0x80ff80;
 if(color===0x9A)return 0x40e0a0;
 if(color===0xE5)return 0xa0e0ff;
 if(color===0xA8)return 0xffc040;
 if(color===0xB4)return 0xff80c0;
 if(color===0xFC)return 0x80ffff;
 return 0xffffff;
}
