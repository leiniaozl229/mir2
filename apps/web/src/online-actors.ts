import {Assets,Container,Graphics,Sprite,Text,Texture} from 'pixi.js';
import {resolveMonsterVisual} from './monster-visuals';
import {MOVEMENT_DURATION_MS,visualDirection} from './movement-visual';
export type Entity={id:number;x:number;y:number;direction:number;feature:number;name:string;self:boolean;action:string;dead?:boolean;hp?:number;maxHp?:number;status?:number;hitSpeed?:number;nameColor?:number;kind?:string};
export type PlayerLayers={bodyName:string;offset:number;hairName?:string;weaponName?:string;weaponOffset:number};

export function playerLayers(feature:number):PlayerLayers|undefined{
 const race=feature&255;
 if(race!==0)return;
 const weapon=(feature>>>8)&255,dress=(feature>>>24)&255,hair=(feature>>>16)&255;
 const armourShape=dress>>1,weaponShape=weapon>>1;
 return {
  bodyName:armourShape<=13?`CArmour${String(armourShape).padStart(2,'0')}`:'CArmour00',
  offset:(dress&1)?808:0,
  hairName:(hair>>1)<=1?`CHair0${hair>>1}`:undefined,
  weaponName:weaponShape>0?`CWeapon${String(weaponShape).padStart(2,'0')}`:undefined,
  weaponOffset:(weapon&1)?416:0,
 };
}
type Frame={file:string;offsetX:number;offsetY:number};
type Action={start:number;count:number;skip:number;interval:number};
type Library={frames:Record<string,Frame>;actions:Record<string,Action>};
type Pose={texture:Texture;x:number;y:number};
const libraryCache=new Map<string,Promise<Library>>(),textureCache=new Map<string,Promise<Texture>>();
const playerActions:Record<string,Action>={standing:{start:0,count:4,skip:0,interval:500},walking:{start:32,count:6,skip:0,interval:100},running:{start:80,count:6,skip:0,interval:100},attack:{start:136,count:6,skip:0,interval:100},spell:{start:296,count:6,skip:0,interval:100},harvest:{start:344,count:2,skip:0,interval:300},struck:{start:360,count:3,skip:0,interval:100},dying:{start:384,count:4,skip:0,interval:100},dead:{start:387,count:1,skip:3,interval:1000}};
async function library(name:string){let task=libraryCache.get(name);if(!task){task=fetch(`/actors/${name}/library.json`).then(async response=>{if(!response.ok)throw new Error(`缺少素材 ${name}`);return response.json();});libraryCache.set(name,task);}return task;}
async function poses(name:string,action:string,direction:number,offset:number){
 const lib=await library(name),definition=lib.actions[{standing:'0',walking:'1',running:'1',attack:'9',struck:'18',dying:'21',dead:'22'}[action]!]??playerActions[action];
 if(!definition)throw new Error(`缺少动作 ${name}/${action}`);
 return {interval:definition.interval,frames:await Promise.all(Array.from({length:definition.count},async(_,frame)=>{
  const index=offset+definition.start+direction*(definition.count+definition.skip)+frame,entry=lib.frames[index];
  if(!entry)return {texture:Texture.EMPTY,x:0,y:0};
  const url=`/actors/${name}/${entry.file}`;let task=textureCache.get(url);if(!task){task=Assets.load<Texture>(url).then(texture=>{texture.source.scaleMode='nearest';return texture;});textureCache.set(url,task);}
  return {texture:await task,x:entry.offsetX,y:entry.offsetY};
 }))};
}
async function staticPose(name:string,index:number){
 const lib=await library(name),entry=lib.frames[index];if(!entry)throw new Error(`缺少静态帧 ${name}/${index}`);
 const url=`/actors/${name}/${entry.file}`;let task=textureCache.get(url);if(!task){task=Assets.load<Texture>(url).then(texture=>{texture.source.scaleMode='nearest';return texture;});textureCache.set(url,task);}
 return {interval:1000,frames:[{texture:await task,x:entry.offsetX,y:entry.offsetY}]};
}
export class OnlineActor {
 readonly container=new Container();
 private marker=new Graphics();private weapon=new Sprite();private body=new Sprite();private hair=new Sprite();private healthBack=new Graphics();private health=new Graphics();private label=new Text({text:'',style:{fontFamily:'SimSun, Songti SC, serif',fontSize:12,fill:0xffffff,stroke:{color:0x000000,width:3}}});
 private sequence=0;private key='';private start=0;private frames:Pose[]=[];private weaponFrames:Pose[]=[];private hairFrames:Pose[]=[];private interval=500;private entity:Entity;private movement:{fromX:number;fromY:number;toX:number;toY:number;start:number;duration:number}|undefined;private labelBaseY=-64;private labelOffsetY=0;
 constructor(entity:Entity,interact?:(entity:Entity)=>void){this.entity=entity;this.container.sortableChildren=true;this.marker.zIndex=-2;this.body.zIndex=0;this.hair.zIndex=1;this.healthBack.zIndex=this.health.zIndex=8;this.label.zIndex=9;this.container.addChild(this.marker,this.weapon,this.body,this.hair,this.healthBack,this.health,this.label);this.label.anchor.set(.5,1);this.label.position.set(24,this.labelBaseY);if(interact)this.container.eventMode='static';this.applyCursor();}
 update(entity:Entity){
  const toX=entity.x*48,toY=entity.y*32,moving=(entity.action==='walking'||entity.action==='running')&&(this.entity.x!==entity.x||this.entity.y!==entity.y),sameDestination=this.movement?.toX===toX&&this.movement?.toY===toY;
  // Keep interpolation aligned with the server cadence so consecutive
  // authoritative steps splice without a visible rubber-band.
  if(moving&&!sameDestination){const start=performance.now();this.movement={fromX:this.container.x,fromY:this.container.y,toX,toY,start,duration:MOVEMENT_DURATION_MS};this.start=start;}
  else if(!moving&&!sameDestination){this.movement=undefined;this.container.position.set(toX,toY);}
  this.entity=entity;this.container.zIndex=entity.y*10000+entity.x+.5;this.label.text=entity.name;this.label.style.fill=nameFill(entity.nameColor);this.labelOffsetY=0;this.applyLabelOffset();this.applyCursor();this.drawHealth();
  const status=(entity.status??0)>>>0;
  this.container.alpha=(status&0x00800000)!==0?.38:1;
  this.body.tint=(status&0x00000001)!==0?0x8f8f8f:(status&0xC0000000)!==0?0x8aa86e:0xffffff;
  const race=entity.feature&255,dress=(entity.feature>>>24)&255;
  const slave=entity.kind==='slave'||entity.nameColor===254||entity.name==='变异骷髅';
  this.marker.clear();if(race===50)this.marker.circle(24,-22,12).fill(0x9a793f).stroke({color:0xe0c27d,width:2});
  else if(slave)this.marker.circle(24,-18,10).stroke({color:0x00ff66,width:2,alpha:.9});
  let bodyName:string|undefined,hairName:string|undefined,weaponName:string|undefined,offset=0,weaponOffset=0,staticIndex:number|undefined;
  const layers=playerLayers(entity.feature);
  if(layers){
   bodyName=layers.bodyName;offset=layers.offset;hairName=layers.hairName;weaponName=layers.weaponName;weaponOffset=layers.weaponOffset;
  }
  else if(race===50){bodyName='NPC00';staticIndex=entity.feature>>>16;}
  else{
   bodyName=resolveMonsterVisual(entity.feature,entity.name);
   if(!bodyName){
    const color=((entity.feature>>>16)&1)?0x9a6b4b:0x707b91;
    this.marker.circle(24,-22,13).fill({color,alpha:.92}).stroke({color:0xe8d6a3,width:2});
    this.marker.circle(24,-22,4).fill(0x241d18);
   }
  }
  const action=entity.action==='dying'?'dying':entity.dead?'dead':entity.action,poseDirection=visualDirection(entity.direction),key=`${bodyName}/${hairName}/${action}/${poseDirection}/${offset}`;
  const visualKey=`${key}/${armourShapeKey(dress)}/${weaponName}/${weaponOffset}/${staticIndex}`;
  if(visualKey===this.key)return;this.key=visualKey;const generation=++this.sequence;this.frames=[];this.weaponFrames=[];this.hairFrames=[];this.body.texture=this.weapon.texture=this.hair.texture=Texture.EMPTY;
  if(!bodyName)return;
  this.weapon.zIndex=[0,5,6,7].includes(poseDirection)?-1:2;
  void Promise.all([staticIndex===undefined?poses(bodyName,action,poseDirection,offset):staticPose(bodyName,staticIndex),weaponName?poses(weaponName,action,poseDirection,weaponOffset):Promise.resolve(undefined),hairName?poses(hairName,action,poseDirection,offset):Promise.resolve(undefined)]).then(([body,heldWeapon,hair])=>{
   if(generation!==this.sequence)return;this.frames=body.frames;this.weaponFrames=heldWeapon?.frames??[];this.hairFrames=hair?.frames??[];this.interval=body.interval;this.start=this.movement?.start??performance.now();this.labelBaseY=Math.min(...body.frames.map(frame=>frame.y))-4;this.applyLabelOffset();if(staticIndex!==undefined)this.marker.clear();this.drawHealth();
  }).catch(()=>{if(generation===this.sequence)this.label.text=`${entity.name} · 素材待补齐`;});
 }
 tick(time:number){
  const movement=this.movement;
  const movementProgress=movement?Math.min(1,Math.max(0,(time-movement.start)/movement.duration)):undefined;
  if(movement&&movementProgress!==undefined){this.container.position.set(movement.fromX+(movement.toX-movement.fromX)*movementProgress,movement.fromY+(movement.toY-movement.fromY)*movementProgress);if(movementProgress===1)this.movement=undefined;}
  if(!this.frames.length)return;
  const locomotion=this.entity.action==='walking'||this.entity.action==='running';
  let frame=locomotion&&movementProgress!==undefined?Math.min(this.frames.length-1,Math.floor(movementProgress*this.frames.length)):Math.floor((time-this.start)/this.interval);
  if(locomotion&&movementProgress===1){this.update({...this.entity,action:'standing'});return;}
  if(['walking','running','attack','harvest','struck','dying'].includes(this.entity.action)&&frame>=this.frames.length){this.update({...this.entity,action:this.entity.action==='dying'?'dead':'standing'});return;}
  frame%=this.frames.length;
  for(const [sprite,pose] of [[this.body,this.frames[frame]],[this.weapon,this.weaponFrames[frame]],[this.hair,this.hairFrames[frame]]] as const){sprite.texture=pose?.texture??Texture.EMPTY;if(pose)sprite.position.set(pose.x,pose.y);}
 }
 private drawHealth(){
  const visible=this.entity.hp!==undefined&&this.entity.maxHp!==undefined&&this.entity.maxHp>0&&!this.entity.dead;
  this.healthBack.clear();this.health.clear();if(!visible)return;
  const y=this.label.y+2,ratio=Math.max(0,Math.min(1,this.entity.hp!/this.entity.maxHp!));
  this.healthBack.rect(4,y,40,4).fill(0x201810);this.health.rect(5,y+1,38*ratio,2).fill(0xd13c32);
 }
 setLabelOffset(offset:number){if(offset===this.labelOffsetY)return;this.labelOffsetY=offset;this.applyLabelOffset();this.drawHealth();}
 labelBounds(){return this.label.getBounds();}
 hitTest(x:number,y:number){return actorHitTest(this.entity.self,this.container.getBounds(),x,y);}
 private applyLabelOffset(){this.label.y=this.labelBaseY+this.labelOffsetY;}
 private applyCursor(){
  const race=this.entity.feature&255;
  this.container.cursor=race===50?'url("/ui/Cursors/Cursor_Npc.CUR") 0 0, pointer':this.entity.dead?'url("/ui/Cursors/Cursor_Default.CUR") 0 0, auto':'url("/ui/Cursors/Cursor_Normal_Atk.CUR") 0 0, crosshair';
 }
 destroy(){this.sequence++;this.container.destroy({children:true});}
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
