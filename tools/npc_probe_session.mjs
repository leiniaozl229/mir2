// Shared current NPC stamp handling for live protocol probes.
// This class records native presentation identity; it never fabricates a reply.
import {readFile} from 'node:fs/promises';

export async function readNativeNpcClickInterval(root){
 let bytes;
 try{bytes=await readFile(new URL('.runtime/server/Mir200/setting.conf',root));}
 catch(error){if(error.code==='ENOENT')return 1000;throw error;}
 const setting=new TextDecoder('gb18030').decode(bytes);
 // GameSvrConf.cs:1481 defaults to 1000; PlayObject.Base.cs:685 is strict >.
 const value=Number(setting.match(/^ClickNpcTime\s*=\s*(\d+)\s*$/m)?.[1]??1000);
 if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid native NPC click interval');
 return value;
}

export class NpcProbeSession{
 constructor(intervalMs=1000,{now=Date.now,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  this.intervalMs=intervalMs;this.now=now;this.pause=pause;
  this.generation=0;this.serial=0;this.active=undefined;this.lastReplyAt=0;
 }
 observe(envelope){
  const message=envelope.message;
  if(Number.isInteger(envelope.mapGeneration))this.generation=envelope.mapGeneration;
  if(message.type==='map')this.active=undefined;
  if(message.type==='npcDialogue'&&this.matches(message))this.lastReplyAt=this.now();
  if(message.type==='npcDialogueClosed'&&this.matches(message))this.active=undefined;
 }
 async begin(npcId){
  const earliest=this.lastReplyAt+this.intervalMs+100;
  while(this.now()<earliest)await this.pause(Math.min(1000,earliest-this.now()));
  return this.active={npcId,npcSessionId:++this.serial,mapGeneration:this.generation};
 }
 fields(npcId){
  if(!this.active||this.active.npcId!==npcId||this.active.mapGeneration!==this.generation)
   throw new Error('Probe NPC conversation is no longer current');
  return {...this.active};
 }
 matches(message){
  return !!this.active&&message.npcId===this.active.npcId&&message.npcSessionId===this.active.npcSessionId
   &&message.mapGeneration===this.active.mapGeneration&&message.mapGeneration===this.generation;
 }
}
