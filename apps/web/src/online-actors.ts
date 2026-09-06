import {Assets,Container,Graphics,Sprite,Text,Texture} from 'pixi.js';
import {resolveMonsterVisual} from './monster-visuals';
export type Entity={id:number;x:number;y:number;direction:number;feature:number;name:string;self:boolean;action:string;dead?:boolean;hp?:number;maxHp?:number;status?:number;hitSpeed?:number};
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
 private marker=new Graphics();private weapon=new Sprite();private body=new Sprite();private hair=new Sprite();private healthBack=new Graphics();private health=new Graphics();private label=new Text({text:'',style:{fontFamily:'sans-serif',fontSize:12,fill:0xffffff,stroke:{color:0x000000,width:3}}});
 private sequence=0;private key='';private start=0;private frames:Pose[]=[];private weaponFrames:Pose[]=[];private hairFrames:Pose[]=[];private interval=500;private entity:Entity;private movement:{fromX:number;fromY:number;toX:number;toY:number;start:number;duration:number}|undefined;
 constructor(entity:Entity,interact?:(entity:Entity)=>void){this.entity=entity;this.container.sortableChildren=true;this.marker.zIndex=-2;this.body.zIndex=0;this.hair.zIndex=1;this.healthBack.zIndex=this.health.zIndex=8;this.label.zIndex=9;this.container.addChild(this.marker,this.weapon,this.body,this.hair,this.healthBack,this.health,this.label);this.label.anchor.set(.5,1);this.label.position.set(24,-64);if(interact){this.container.eventMode='static';this.container.cursor='pointer';this.container.on('pointertap',event=>{event.stopPropagation();interact(this.entity);});}}
 update(entity:Entity){
  const toX=entity.x*48,toY=entity.y*32,moving=(entity.action==='walking'||entity.action==='running')&&(this.entity.x!==entity.x||this.entity.y!==entity.y);
  if(moving)this.movement={fromX:this.container.x,fromY:this.container.y,toX,toY,start:performance.now(),duration:entity.action==='running'?400:600};else{this.movement=undefined;this.container.position.set(toX,toY);}
  this.entity=entity;this.container.zIndex=entity.y*700+entity.x+.5;this.label.text=entity.name;this.drawHealth();
  const status=(entity.status??0)>>>0;
  this.container.alpha=(status&0x00800000)!==0?.38:1;
  this.body.tint=(status&0x00000001)!==0?0x8f8f8f:(status&0xC0000000)!==0?0x8aa86e:0xffffff;
  const race=entity.feature&255,weapon=(entity.feature>>>8)&255,dress=(entity.feature>>>24)&255,hair=(entity.feature>>>16)&255;
  this.marker.clear();if(race===50)this.marker.circle(24,-22,12).fill(0x9a793f).stroke({color:0xe0c27d,width:2});
  let bodyName:string|undefined,hairName:string|undefined,weaponName:string|undefined,offset=0,weaponOffset=0,staticIndex:number|undefined;
  if(race===0){
   // GetFeature packs the dress shape in the high byte and the gender in
   // its low bit.  The classic armour libraries share the same 808-frame
   // male/female layout, so authoritative equipment updates can select the
   // matching visual without changing the actor animation table.
   const armourShape=dress>>1;
   if(armourShape<=13)bodyName=`CArmour${String(armourShape).padStart(2,'0')}`;
   else bodyName='CArmour00';
   offset=(dress&1)?808:0;
   if((hair>>1)<=1)hairName=`CHair0${hair>>1}`;
   const weaponShape=weapon>>1;
   if(weaponShape>0){weaponName=`CWeapon${String(weaponShape).padStart(2,'0')}`;weaponOffset=(weapon&1)?416:0;}
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
  const action=entity.action==='dying'?'dying':entity.dead?'dead':entity.action,key=`${bodyName}/${hairName}/${action}/${entity.direction}/${offset}`;
  const visualKey=`${key}/${armourShapeKey(dress)}/${weaponName}/${weaponOffset}/${staticIndex}`;
  if(visualKey===this.key)return;this.key=visualKey;const generation=++this.sequence;this.frames=[];this.weaponFrames=[];this.hairFrames=[];this.body.texture=this.weapon.texture=this.hair.texture=Texture.EMPTY;
  if(!bodyName)return;
  this.weapon.zIndex=[0,5,6,7].includes(entity.direction)?-1:2;
  void Promise.all([staticIndex===undefined?poses(bodyName,action,entity.direction,offset):staticPose(bodyName,staticIndex),weaponName?poses(weaponName,action,entity.direction,weaponOffset):Promise.resolve(undefined),hairName?poses(hairName,action,entity.direction,offset):Promise.resolve(undefined)]).then(([body,heldWeapon,hair])=>{
   if(generation!==this.sequence)return;this.frames=body.frames;this.weaponFrames=heldWeapon?.frames??[];this.hairFrames=hair?.frames??[];this.interval=body.interval;this.start=performance.now();this.label.y=Math.min(...body.frames.map(frame=>frame.y))-4;if(staticIndex!==undefined)this.marker.clear();this.drawHealth();
  }).catch(()=>{if(generation===this.sequence)this.label.text=`${entity.name} · 素材待补齐`;});
 }
 tick(time:number){
  if(this.movement){const progress=Math.min(1,(time-this.movement.start)/this.movement.duration);this.container.position.set(this.movement.fromX+(this.movement.toX-this.movement.fromX)*progress,this.movement.fromY+(this.movement.toY-this.movement.fromY)*progress);if(progress===1)this.movement=undefined;}
  if(!this.frames.length)return;
  let frame=Math.floor((time-this.start)/this.interval);
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
 destroy(){this.sequence++;this.container.destroy({children:true});}
}

function armourShapeKey(dress:number){return dress>>1;}
