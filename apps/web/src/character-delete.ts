import contract from '../../../content/classic-176/selection-actions.json';
import type {SelectCharacter} from './classic-auth';

export type CharacterDeletionResult={type:'characterDeletionResult';requestId:number;name:string;accepted:boolean|null;status:'deleted'|'rejected'|'not-deleted'|'unknown'|'not-sent';requiresLogin:boolean;requestSent:boolean;characters?:SelectCharacter[]};
type Hooks={available:()=>boolean;confirm:(text:string)=>Promise<string>;send:(command:{type:'deleteCharacter';requestId:number;name:string})=>boolean;busy:(value:boolean)=>void;result:(value:CharacterDeletionResult)=>void;unknown:()=>void};

/** Decisions and pending native writes belong to a particular selection scene.
 * A timeout/close never retries an irreversible command or edits the list. */
export class CharacterDeleteController {
 private epoch=0;
 private nextId=1;
 private confirming=false;
 private pending?:{requestId:number;name:string;isCurrent:()=>boolean};
 private timer?:ReturnType<typeof setTimeout>;
 private destroyed=false;
 constructor(private readonly hooks:Hooks){}
 isBusy(){return this.confirming||this.pending!==undefined;}
 async request(name:string,isCurrent:()=>boolean){
  if(this.destroyed||this.isBusy()||!name||!this.hooks.available()||!isCurrent())return false;
  const epoch=++this.epoch;this.confirming=true;
  let answer:string;
  try{answer=await this.hooks.confirm(contract.delete.confirmText.replace('{name}',name));}
  catch{if(epoch===this.epoch)this.confirming=false;return false;}
  if(epoch!==this.epoch)return false;
  this.confirming=false;
  if(answer!=='yes'||this.destroyed||!this.hooks.available()||!isCurrent())return false;
  const operation={requestId:this.nextId++,name,isCurrent};this.pending=operation;this.hooks.busy(true);
  try{
   if(!this.hooks.send({type:'deleteCharacter',requestId:operation.requestId,name})){this.finish();return false;}
  }catch{this.failUnknown();return false;}
  // A synchronous transport fixture/result can already have retired this write.
  if(this.pending===operation)this.timer=setTimeout(()=>this.failUnknown(),contract.delete.clientDeadlineMs);
  return true;
 }
 handle(value:CharacterDeletionResult){
  const pending=this.pending;
  if(!pending||value.requestId!==pending.requestId||value.name!==pending.name||!pending.isCurrent())return false;
  if(!['deleted','rejected','not-deleted','unknown','not-sent'].includes(value.status))return false;
  const terminalUnknown=value.status==='unknown'||value.status==='not-sent';
  if(terminalUnknown){if(value.requiresLogin!==true||value.status==='unknown'&&(value.accepted!==null||value.requestSent!==true)||value.status==='not-sent'&&(value.accepted!==false||value.requestSent!==false))return false;}
  else{
   if(value.requiresLogin!==false||!Array.isArray(value.characters))return false;
   if(value.status==='deleted'&&(value.accepted!==true||value.characters.some(character=>character.name===pending.name)))return false;
   if(value.status!=='deleted'&&value.accepted!==false)return false;
  }
  this.finish();this.hooks.result(value);
  if(terminalUnknown)this.hooks.unknown();
  return true;
 }
 reject(value:{requestId?:number}){
  if(!this.pending||value.requestId!==this.pending.requestId)return false;
  this.finish();return true;
 }
 disconnected(){if(this.pending){this.failUnknown();return true;}this.interrupt();return false;}
 interrupt(){++this.epoch;this.confirming=false;this.finish();}
 destroy(){this.interrupt();this.destroyed=true;}
 private finish(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;const busy=this.pending!==undefined;this.pending=undefined;if(busy)this.hooks.busy(false);}
 private failUnknown(){
  const pending=this.pending;if(!pending)return;const current=pending.isCurrent();this.finish();
  if(current){this.hooks.result({type:'characterDeletionResult',requestId:pending.requestId,name:pending.name,accepted:null,status:'unknown',requiresLogin:true,requestSent:true});this.hooks.unknown();}
 }
}
