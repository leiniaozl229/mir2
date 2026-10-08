export type ChatChannel='local'|'shout'|'group'|'guild'|'whisper';
export type SayCommand={type:'say';channel:ChatChannel|'raw';text:string;target?:string;chatId?:number};
type ChatDraft={text:string;channel:ChatChannel;target:string;start:number;end:number;direction:'forward'|'backward'|'none'};
export type ChatInputActions={
 channel:()=>ChatChannel;
 target:()=>string;
 send:(command:SayCommand)=>boolean;
 canSend?:()=>boolean;
 status?:(reason:string)=>void;
 setChannel?:(channel:ChatChannel)=>void;
 setTarget?:(target:string)=>void;
};

const controls=/[\u0000-\u001f\u007f-\u009f]/u;
// This bounded sent-message history is a proposed Web convenience. The inspected
// Delphi Up/Down implementation scrolls ChatBoard, rather than recalling sends.
export const CHAT_HISTORY_LIMIT=100;
const CHAT_REJECTION_TRACK_LIMIT=32;

export function validWhisperName(value:string){
 return value.length>=1&&value.length<=10&&!controls.test(value)&&!/[\s/!@]/u.test(value);
}

/** Explicit native prefixes take precedence over the browser's channel selector. */
export function chatCommandOf(value:string,channel:ChatChannel,target=''):{command?:SayCommand;reason?:string}{
 const text=value.trim();
 if(!text)return {reason:'请输入聊天内容'};
 if(controls.test(text))return {reason:'聊天内容不能包含控制字符'};
 // Exact GBK encodability and the final prefixed 180-byte limit belong to the gateway.
 if(text.length>180)return {reason:'聊天内容过长'};
 if(/^[@!/]/u.test(text)){
  const body=text.startsWith('!!')||text.startsWith('!~')?text.slice(2):text.slice(1);
  if(!body.trim())return {reason:'请输入前缀后的内容'};
  if(text.startsWith('/')){
   const match=/^\/([^\s]+)\s+(.+)$/u.exec(text);
   if(!match||!validWhisperName(match[1]))return {reason:'请填写私聊对象和内容'};
  }
  return {command:{type:'say',channel:'raw',text}};
 }
 if(!['local','shout','group','guild','whisper'].includes(channel))return {reason:'聊天频道无效'};
 if(channel==='whisper'){
  const recipient=target.trim();if(!validWhisperName(recipient))return {reason:'请填写有效的私聊对象'};
  return {command:{type:'say',channel,text,target:recipient}};
 }
 return {command:{type:'say',channel,text}};
}

function delimitedToken(value:string,dividers:string){
 let first=0;while(first<value.length&&dividers.includes(value[first]))first++;
 let last=first;while(last<value.length&&!dividers.includes(value[last]))last++;
 return value.slice(first,last);
}

/** FState.DBottomMouseDown's two GetValidStr3 tokens, restricted to valid recipients.
 * Call only for actual player-chat lines; a system notice is not a player identity.
 */
export function chatNameFromLine(text:string){
 const name=delimitedToken(delimitedToken(text,'(!*/)'),' =:');
 if(!name||'/(['.includes(name[0])||!validWhisperName(name))return undefined;
 return name;
}

export class ChatInputController{
 private composing=false;
 private history:ChatDraft[]=[];
 private historyIndex:number|undefined;
 private unsent:ChatDraft|undefined;
 private lastWhisper='';
 private revision=0;
 private nextChatId=0;
 private readonly pendingSends=new Map<number,{draft:ChatDraft;revision:number;chatId:number;restoreDraft:boolean}>();
 private readonly key=(event:KeyboardEvent)=>this.handleKey(event);
 private readonly compositionStart=()=>{this.composing=true;};
 private readonly compositionEnd=()=>{this.composing=false;};
 private readonly blurred=()=>{this.composing=false;};
 private readonly edited=()=>{this.revision++;this.historyIndex=undefined;this.unsent=undefined;};

 /** Binds keydown/composition/input once; form submission should call submit(). */
 constructor(private input:HTMLInputElement,private actions:ChatInputActions){
  input.addEventListener('keydown',this.key);
  input.addEventListener('compositionstart',this.compositionStart);
  input.addEventListener('compositionend',this.compositionEnd);
  input.addEventListener('blur',this.blurred);
  input.addEventListener('input',this.edited);
 }

 submit(){
  if(this.composing)return false;
  const draft=this.capture(),result=chatCommandOf(draft.text,draft.channel,draft.target);
  if(!result.command){this.actions.status?.(result.reason!);return false;}
  if(this.actions.canSend&&!this.actions.canSend()){this.actions.status?.('连接未就绪，草稿已保留');return false;}
  if(this.nextChatId>=Number.MAX_SAFE_INTEGER){this.actions.status?.('聊天发送编号已用尽，草稿已保留');return false;}
  const chatId=++this.nextChatId;
  try{if(!this.actions.send({...result.command,chatId})){this.actions.status?.('消息未发送，草稿已保留');return false;}}
  catch{this.actions.status?.('消息未发送，草稿已保留');return false;}
  const previous=this.history.at(-1);
  if(!previous||previous.text!==draft.text||previous.channel!==draft.channel||previous.target!==draft.target){
   this.history.push(draft);if(this.history.length>CHAT_HISTORY_LIMIT)this.history.shift();
  }
  if(result.command.channel==='whisper')this.lastWhisper=result.command.target!;
  else if(result.command.channel==='raw'&&result.command.text.startsWith('/'))this.lastWhisper=/^\/([^\s]+)/u.exec(result.command.text)?.[1]??'';
  this.input.value='';this.input.setSelectionRange(0,0);this.input.blur();
  this.historyIndex=undefined;this.unsent=undefined;
  const sent={draft,revision:++this.revision,chatId,restoreDraft:true};this.pendingSends.set(chatId,sent);
  while(this.pendingSends.size>CHAT_REJECTION_TRACK_LIMIT)this.pendingSends.delete(this.pendingSends.keys().next().value!);
  return true;
 }

 /** Sends a source-backed native prefix command without borrowing or clearing the player's current draft. */
 sendCommand(text:string){
  if(this.composing)return undefined;
  const result=chatCommandOf(text,this.actions.channel(),this.actions.target());
  if(!result.command||result.command.channel!=='raw'){this.actions.status?.(result.reason??'命令格式无效');return undefined;}
  if(this.actions.canSend&&!this.actions.canSend()){this.actions.status?.('连接未就绪');return undefined;}
  if(this.nextChatId>=Number.MAX_SAFE_INTEGER){this.actions.status?.('聊天发送编号已用尽');return undefined;}
  const chatId=++this.nextChatId;
  try{if(!this.actions.send({...result.command,chatId})){this.actions.status?.('命令未发送，请重试');return undefined;}}
  catch{this.actions.status?.('命令发送失败，请重试');return undefined;}
  const sent={draft:this.capture(),revision:this.revision,chatId,restoreDraft:false};this.pendingSends.set(chatId,sent);
  while(this.pendingSends.size>CHAT_REJECTION_TRACK_LIMIT)this.pendingSends.delete(this.pendingSends.keys().next().value!);
  return chatId;
 }

 /** A typed gateway rejection restores only its matching untouched cleared draft.
  * The request identity does not acknowledge delivery through the native TCP server.
  */
 rejectLastSend(reason='消息发送失败',chatId?:number){
  if(chatId===undefined||!Number.isSafeInteger(chatId)||chatId<=0)return false;
  const sent=this.pendingSends.get(chatId);if(!sent)return false;
  this.pendingSends.delete(chatId);this.actions.status?.(reason);
  if(!sent.restoreDraft)return false;
  if(sent.revision!==this.revision||this.input.value!==''||this.actions.channel()!==sent.draft.channel||this.actions.target()!==sent.draft.target)return false;
  this.restore(sent.draft);this.input.focus();return true;
 }

 handleKey(event:KeyboardEvent){
  if(this.composing||event.isComposing||event.keyCode===229)return false;
  if(event.ctrlKey||event.altKey||event.metaKey||event.shiftKey)return false;
  if(event.key==='Enter'){
   event.preventDefault();event.stopPropagation();if(!event.repeat)this.submit();return true;
  }
  if(event.key==='Escape'){
   event.preventDefault();event.stopPropagation();this.input.value='';this.edited();this.input.blur();return true;
  }
  if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return false;
  const start=this.input.selectionStart,end=this.input.selectionEnd;
  if(start===null||start!==end||(start!==0&&start!==this.input.value.length))return false;
  if(event.key==='ArrowUp'){
   if(!this.history.length)return false;
   if(this.historyIndex===undefined){this.unsent=this.capture();this.historyIndex=this.history.length-1;}
   else this.historyIndex=Math.max(0,this.historyIndex-1);
   this.restore(this.history[this.historyIndex]);
  }else{
   if(this.historyIndex===undefined)return false;
   if(this.historyIndex<this.history.length-1)this.restore(this.history[++this.historyIndex]);
   else{const draft=this.unsent;this.historyIndex=undefined;this.unsent=undefined;if(draft)this.restore(draft);}
  }
  event.preventDefault();event.stopPropagation();return true;
 }

 /** Opening chat preserves a nonempty Web draft. Prefix/remembered-target insertion is empty-only. */
 open(prefix=''){
  if(this.composing)return false;
  if(!this.input.value&&prefix){
   this.input.value=prefix==='/'&&this.lastWhisper?`/${this.lastWhisper} `:prefix;
   this.input.setSelectionRange(this.input.value.length,this.input.value.length);this.edited();
  }
  this.input.focus();return true;
 }

 selectName(value:string){
  if(this.composing)return false;const name=value.trim();if(!validWhisperName(name))return false;
  this.actions.setChannel?.('whisper');this.actions.setTarget?.(name);
  this.input.value=`/${name} `;this.input.setSelectionRange(this.input.value.length,this.input.value.length);
  this.edited();this.input.focus();return true;
 }
 selectLine(text:string){const name=chatNameFromLine(text);return name!==undefined&&this.selectName(name);}
 resetHistory(){this.history=[];this.historyIndex=undefined;this.unsent=undefined;this.lastWhisper='';this.pendingSends.clear();}
 dispose(){
  this.input.removeEventListener('keydown',this.key);this.input.removeEventListener('compositionstart',this.compositionStart);
  this.input.removeEventListener('compositionend',this.compositionEnd);this.input.removeEventListener('input',this.edited);
  this.input.removeEventListener('blur',this.blurred);
 }
 debugState(){return {composing:this.composing,history:this.history.map(draft=>({...draft})),historyIndex:this.historyIndex,lastWhisper:this.lastWhisper};}
 private capture():ChatDraft{return {text:this.input.value,channel:this.actions.channel(),target:this.actions.target(),start:this.input.selectionStart??this.input.value.length,end:this.input.selectionEnd??this.input.value.length,direction:this.input.selectionDirection??'none'};}
 private restore(draft:ChatDraft){
  this.actions.setChannel?.(draft.channel);this.actions.setTarget?.(draft.target);this.input.value=draft.text;
  this.input.setSelectionRange(draft.start,draft.end,draft.direction);this.revision++;
 }
}
