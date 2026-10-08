/** Browser presentation identity. The gateway must attach this stamp to NPC replies.
 * Legacy TCP has no request nonce: a stamp alone cannot identify an old reply from
 * a reopened conversation with the same NPC. Keep that gateway limitation explicit.
 */
export type NpcSessionStamp={npcSessionId:number;mapGeneration:number;npcId?:number};
export type NpcSessionMessage={npcSessionId?:number;mapGeneration?:number;npcId?:number;automatic?:boolean};

function validGeneration(value:unknown):value is number{return Number.isSafeInteger(value)&&Number(value)>=0;}
function validNpc(value:unknown):value is number{return Number.isInteger(value)&&Number(value)>=-2147483648&&Number(value)<=2147483647;}

/** Gates NPC windows and quotes, never authoritative inventory/currency results. */
export class NpcSession{
 private generation:number;
 private sequence=0;
 private active:NpcSessionStamp|undefined;
 private automaticAllowed=true;

 constructor(mapGeneration=0){
  if(!validGeneration(mapGeneration))throw new RangeError('Invalid NPC map generation');
  this.generation=mapGeneration;
 }

 /** Call at an actual map/connection boundary. No timer suppresses entry scripts. */
 reset(mapGeneration:number){
  if(!validGeneration(mapGeneration))throw new RangeError('Invalid NPC map generation');
  this.generation=mapGeneration;this.active=undefined;this.automaticAllowed=true;
 }

 /** Start a fresh identity on every deliberate click, including reopening one NPC. */
 begin(npcId:number,mapGeneration=this.generation):NpcSessionStamp{
  if(!validNpc(npcId)||!validGeneration(mapGeneration))throw new RangeError('Invalid NPC session identity');
  if(this.sequence===Number.MAX_SAFE_INTEGER)throw new RangeError('NPC session identity exhausted');
  this.generation=mapGeneration;this.automaticAllowed=false;
  this.active={npcSessionId:++this.sequence,mapGeneration,npcId};
  return {...this.active};
 }

 current():NpcSessionStamp|undefined{return this.active?{...this.active}:undefined;}

 /** Local close/death/disconnect is immediate; a later close ACK cannot reopen it. */
 close():NpcSessionStamp|undefined{
  const previous=this.current();this.active=undefined;this.automaticAllowed=false;return previous;
 }

 invalidate():NpcSessionStamp|undefined{return this.close();}

 /** Only permits presentation for a matching gateway stamp. Unstamped replies fail closed.
  * Session zero is reserved for an explicitly automatic script in a fresh map. Once
  * the player closes or clicks a conversation it cannot reopen an automatic window.
  */
 accept(message:NpcSessionMessage|null|undefined):boolean{
  if(!message||message.mapGeneration!==this.generation||!validGeneration(message.npcSessionId))return false;
  if(message.npcId!==undefined&&!validNpc(message.npcId))return false;
  if(this.active){
   if(message.npcSessionId!==this.active.npcSessionId)return false;
   if(message.npcId!==undefined&&this.active.npcId!==undefined&&message.npcId!==this.active.npcId)return false;
   if(this.active.npcId===undefined&&message.npcId!==undefined)this.active={...this.active,npcId:message.npcId};
   return true;
  }
  if(message.npcSessionId!==0||message.automatic!==true||!this.automaticAllowed)return false;
  this.active={npcSessionId:0,mapGeneration:this.generation,...(message.npcId===undefined?{}:{npcId:message.npcId})};
  return true;
 }
}
