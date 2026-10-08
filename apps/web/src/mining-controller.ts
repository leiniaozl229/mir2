export type MiningWeapon={shape:number;stdMode:number;durability:number};
export type MiningState={
 x:number;y:number;direction:number;mapGeneration:number;dead:boolean;horse?:boolean;
 weapon?:MiningWeapon;canAct:boolean;serverReady:boolean;level:number;hitSpeed:number;
 hitTime?:number;itemSpeed?:number;attackSlow?:boolean;
};
export type MiningIdentity={actionId:number;mapGeneration:number};
export type MiningResult=MiningIdentity&{kind:string;accepted:boolean};
export type MiningInput={x:number;y:number;shift:boolean;targetPresent:boolean};
export type MiningHooks={
 read:()=>MiningState|undefined;
 canWalk:(x:number,y:number)=>boolean;
 send:(direction:number)=>MiningIdentity|undefined;
 timeout:()=>void;
 now?:()=>number;
};
const offsets=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]] as const;

export function usablePickaxe(weapon?:MiningWeapon){
 return !!weapon&&weapon.shape===19&&(weapon.stdMode===5||weapon.stdMode===6)&&weapon.durability>0;
}
export function miningDirection(state:Pick<MiningState,'x'|'y'|'direction'>,input:Pick<MiningInput,'x'|'y'>){
 const dx=Math.sign(input.x-state.x),dy=Math.sign(input.y-state.y);
 const index=offsets.findIndex(([x,y])=>x===dx&&y===dy);
 return index<0?state.direction&7:index;
}
// ClMain.CanNextHit: animation completion and native confirmation are separate
// gates. This is a client request cadence; the server still enforces its rules.
export function miningInterval(state:Pick<MiningState,'level'|'hitSpeed'|'hitTime'|'itemSpeed'|'attackSlow'>){
 const levelFast=Math.min(370,Math.max(0,state.level)*14);
 const fast=Math.min(800,levelFast+state.hitSpeed*(state.itemSpeed??60));
 return Math.max(0,(state.hitTime??1400)-fast+(state.attackSlow?1500:0));
}
export function miningEligible(state:MiningState|undefined,input:MiningInput,canWalk:MiningHooks['canWalk']){
 if(!state||state.dead||state.horse||input.targetPresent||!usablePickaxe(state.weapon))return false;
 const direction=miningDirection(state,input),[dx,dy]=offsets[direction];
 return input.shift||!canWalk(state.x+dx,state.y+dy);
}

export class MiningController{
 private activeDirection:number|undefined;
 private generation:number|undefined;
 private pending:(MiningIdentity&{startedAt:number})|undefined;
 private lastSentAt=-Infinity;
 private now:()=>number;
 constructor(private hooks:MiningHooks){this.now=hooks.now??(()=>performance.now());}
 start(input:MiningInput){
  const state=this.hooks.read();
  // A new click cancels the original loop, just as ClMain.MouseDown does.
  this.cancel();
  if(!miningEligible(state,input,this.hooks.canWalk)||!state)return false;
  this.activeDirection=miningDirection(state,input);this.generation=state.mapGeneration;
  this.tick();return true;
 }
 tick(){
  const now=this.now();
  if(this.pending&&now-this.pending.startedAt>=5000){
   this.cancel();this.pending=undefined;this.hooks.timeout();return;
  }
  if(this.activeDirection===undefined)return;
  const state=this.hooks.read();
  if(!state||state.dead||state.horse||!usablePickaxe(state.weapon)||state.mapGeneration!==this.generation){
   this.cancel();return;
  }
  if(this.pending||!state.canAct||!state.serverReady||now-this.lastSentAt<=miningInterval(state))return;
  const identity=this.hooks.send(this.activeDirection);
  if(!identity)return;
  if(identity.mapGeneration!==state.mapGeneration||!Number.isSafeInteger(identity.actionId)||identity.actionId<=0){
   this.cancel();this.hooks.timeout();return;
  }
  this.pending={...identity,startedAt:now};this.lastSentAt=now;
 }
 settle(result:MiningResult){
  if(result.kind!=='mine'||!this.pending||result.actionId!==this.pending.actionId||result.mapGeneration!==this.pending.mapGeneration)return false;
  this.pending=undefined;if(!result.accepted)this.cancel();return true;
 }
 reject(identity:MiningIdentity){return this.settle({...identity,kind:'mine',accepted:false});}
 // Stop repeated requests immediately. The wire has no cancellation message;
 // the current native GOOD/FAIL slot must drain before another action is sent.
 cancel(){this.activeDirection=undefined;this.generation=undefined;}
 // Use only on a different map/connection. An uncertain timeout must disconnect
 // through timeout(), rather than releasing the live connection's action slot.
 reset(){this.cancel();this.pending=undefined;this.lastSentAt=-Infinity;}
 debugState(){return {active:this.activeDirection!==undefined,direction:this.activeDirection,pending:this.pending?{...this.pending}:undefined};}
}

// FState.pas:4441 uses Delphi Round(Dura/1000), including ties to even.
// Dura is ore purity for StdMode43, not remaining pickaxe durability.
export function orePurity(item:{stdMode:number;durability:number}){
 if(item.stdMode!==43)return undefined;
 const integer=Math.floor(item.durability/1000),remainder=item.durability%1000;
 return remainder<500?integer:remainder>500?integer+1:integer+(integer%2);
}
