import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'apps/web/src/chat-input.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{}};vm.createContext(context);vm.runInContext(compiled,context);
const {ChatInputController,chatCommandOf,chatNameFromLine,CHAT_HISTORY_LIMIT}=context.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
class Input{
 value='';selectionStart=0;selectionEnd=0;selectionDirection='none';focused=false;listeners=new Map();
 addEventListener(type,fn){this.listeners.set(type,[...(this.listeners.get(type)??[]),fn]);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(value=>value!==fn));}
 emit(type,event={}){for(const fn of this.listeners.get(type)??[])fn(event);}
 focus(){this.focused=true;}blur(){this.focused=false;this.emit('blur');}
 setSelectionRange(start,end,direction='none'){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}
 edit(value,start=value.length,end=start){this.value=value;this.setSelectionRange(start,end);this.emit('input');}
}
const key=(name,extra={})=>({key:name,keyCode:0,isComposing:false,repeat:false,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra});
function fixture(){
 const input=new Input(),sent=[],statuses=[];let channel='local',target='',connected=true,sending=true;
 const controller=new ChatInputController(input,{channel:()=>channel,target:()=>target,setChannel:value=>{channel=value;},setTarget:value=>{target=value;},canSend:()=>connected,send:command=>{sent.push(plain(command));if(sending instanceof Error)throw sending;return sending;},status:reason=>statuses.push(reason)});
 return {input,sent,statuses,controller,get channel(){return channel;},set channel(value){channel=value;},get target(){return target;},set target(value){target=value;},set connected(value){connected=value;},set sending(value){sending=value;}};
}
{
 for(const channel of ['local','shout','group','guild'])assert.deepEqual(plain(chatCommandOf(' hello ',channel).command),{type:'say',channel,text:'hello'});
 assert.deepEqual(plain(chatCommandOf('hi','whisper',' Alice ').command),{type:'say',channel:'whisper',target:'Alice',text:'hi'});
 for(const target of ['', 'two names','/Alice','!Alice','@Alice','abcdefghijk'])assert.equal(chatCommandOf('hi','whisper',target).command,undefined);
 assert.equal(chatCommandOf('hi','unsupported').command,undefined);
 pass('structured channels retain their separate payload and validate whisper recipients without changing authority');
}
{
 for(const text of ['!hello','!!hello','!~hello','/张三  你好','@AttackMode','@拒绝私聊','@@加速处理']){
  for(const channel of ['local','shout','group','guild','whisper'])assert.deepEqual(plain(chatCommandOf(text,channel,'Other').command),{type:'say',channel:'raw',text});
 }
 assert.deepEqual(plain(chatCommandOf('  @AttackMode  1  ','guild').command),{type:'say',channel:'raw',text:'@AttackMode  1'});
 pass('explicit native prefixes override the selected channel exactly once and @ command/argument semantics survive');
}
{
 for(const text of ['', '  ','!','!!','!~','@','/张三','/张三   ','a\nb','a\0b','a\tb','a\u007fb','a\u0085b','x'.repeat(181)])assert.equal(chatCommandOf(text,'local').command,undefined);
 assert.equal(chatCommandOf('x'.repeat(180),'local').command.text.length,180);
 pass('empty bodies, malformed whispers, control characters and certain overlength input fail before the send callback');
}
{
 for(const [line,name] of [['Alice: hello','Alice'],['(!)张三:喊话','张三'],['(!!)Alice: hi','Alice'],['(*)张三=hello','张三'],['/Alice hello','Alice'],['Alice=>hi','Alice']])assert.equal(chatNameFromLine(line),name);
 for(const line of ['', '[系统] 提示','@command: hi','!','/','averylongname:hi'])assert.equal(chatNameFromLine(line),undefined);
 pass('actual FState two-token name extraction handles reference chat markers and rejects unsafe recipients');
}
{
 const f=fixture();f.channel='whisper';f.target='张三';f.input.edit('你好',1,2);f.input.focus();assert.equal(f.controller.submit(),true);
 assert.deepEqual(f.sent,[{type:'say',channel:'whisper',target:'张三',text:'你好',chatId:1}]);assert.equal(f.input.value,'');assert.equal(f.input.focused,false);assert.equal(f.input.selectionStart,0);assert.equal(f.controller.debugState().history.length,1);assert.equal(f.controller.debugState().lastWhisper,'张三');
 pass('successful queued sends clear and blur input while recording original draft/channel/target only after true');
}
{
 const f=fixture();f.input.edit('保留中的聊天草稿',2,5);f.input.focus();const chatId=f.controller.sendCommand('@AttackMode');
 assert.equal(chatId,1);assert.deepEqual(f.sent,[{type:'say',channel:'raw',text:'@AttackMode',chatId:1}]);assert.equal(f.input.value,'保留中的聊天草稿');assert.equal(f.input.selectionStart,2);assert.equal(f.input.selectionEnd,5);assert.equal(f.input.focused,true);assert.equal(f.controller.debugState().history.length,0);
 assert.equal(f.controller.rejectLastSend('服务器拒绝命令',chatId),false);assert.equal(f.input.value,'保留中的聊天草稿');assert.equal(f.input.selectionStart,2);assert.equal(f.input.selectionEnd,5);assert.equal(f.input.focused,true);assert.equal(f.statuses.at(-1),'服务器拒绝命令');
 pass('source-backed hotkey commands use the raw gateway path without replacing drafts or stealing input focus');
}
{
 for(const sending of [false,new Error('closed')]){const f=fixture();f.sending=sending;f.input.edit('未发消息',1,3);f.input.focus();assert.equal(f.controller.submit(),false);assert.equal(f.input.value,'未发消息');assert.equal(f.input.selectionStart,1);assert.equal(f.input.selectionEnd,3);assert.equal(f.input.focused,true);assert.equal(f.controller.debugState().history.length,0);assert.equal(f.statuses.length,1);}
 const f=fixture();f.connected=false;f.input.edit('断线草稿');assert.equal(f.controller.submit(),false);assert.equal(f.sent.length,0);assert.equal(f.input.value,'断线草稿');
 pass('disconnected, false and throwing sends preserve the draft, selection and focus without inserting sent history');
}
{
 const f=fixture();f.input.edit('中文');f.input.emit('compositionstart');const enter=key('Enter');f.input.emit('keydown',enter);assert.equal(enter.prevented,false);assert.equal(f.sent.length,0);assert.equal(f.controller.submit(),false);assert.equal(f.controller.selectName('Alice'),false);assert.equal(f.controller.open('!'),false);assert.equal(f.input.value,'中文');
 f.input.emit('compositionend');assert.equal(f.controller.handleKey(key('Enter',{keyCode:229})),false);assert.equal(f.controller.handleKey(key('Enter',{isComposing:true})),false);assert.equal(f.sent.length,0);f.input.emit('keydown',key('Enter'));assert.equal(f.sent.length,1);
 const cancelled=fixture();cancelled.input.edit('中途草稿');cancelled.input.emit('compositionstart');cancelled.input.blur();assert.equal(cancelled.controller.debugState().composing,false);assert.equal(cancelled.input.value,'中途草稿');cancelled.input.focus();assert.equal(cancelled.controller.submit(),true);
 pass('actual composition listeners and browser IME markers cannot send, navigate, replace names or insert prefixes during composition');
}
{
 const f=fixture();f.input.edit('消息');const enter=key('Enter');f.input.emit('keydown',enter);assert.equal(enter.prevented,true);assert.equal(enter.stopped,true);assert.equal(f.sent.length,1);
 f.input.edit('下一条');f.input.emit('keydown',key('Enter',{repeat:true}));assert.equal(f.sent.length,1);const modified=key('Enter',{ctrlKey:true});assert.equal(f.controller.handleKey(modified),false);assert.equal(modified.prevented,false);assert.equal(f.input.value,'下一条');
 pass('bound Enter suppresses implicit duplicate submission and key repeat while modified Enter keeps editor semantics');
}
{
 const f=fixture();f.input.edit('草稿');f.input.focus();f.input.emit('compositionstart');f.input.emit('keydown',key('Escape'));assert.equal(f.input.value,'草稿');f.input.emit('compositionend');const escape=key('Escape');f.input.emit('keydown',escape);assert.equal(f.input.value,'');assert.equal(f.input.focused,false);assert.equal(escape.stopped,true);assert.equal(f.sent.length,0);
 pass('Escape follows the reference clear/close route and leaves an active IME composition untouched');
}
{
 const f=fixture();f.input.edit('先前消息');f.controller.submit();f.input.edit('正在编辑',2);
 for(const event of [key('ArrowUp'),key('ArrowDown'),key('Home'),key('End'),key('ArrowLeft'),key('F1')]){assert.equal(f.controller.handleKey(event),false);assert.equal(event.prevented,false);}
 f.input.setSelectionRange(0,2);assert.equal(f.controller.handleKey(key('ArrowUp')),false);f.input.setSelectionRange(0,0);assert.equal(f.controller.handleKey(key('ArrowUp',{shiftKey:true})),false);
 assert.equal(f.input.value,'正在编辑');assert.equal(f.sent.length,1);
 pass('history shortcuts preserve mid-text editing, selected text and modifier shortcuts without hijacking other editor keys');
}
{
 const f=fixture();f.input.edit('第一条');f.controller.submit();f.channel='whisper';f.target='Alice';f.input.edit('第二条');f.controller.submit();f.channel='guild';f.target='drafttarget';f.input.edit('未发送',3);f.input.selectionDirection='backward';
 assert.equal(f.controller.handleKey(key('ArrowUp')),true);assert.equal(f.input.value,'第二条');assert.equal(f.channel,'whisper');assert.equal(f.target,'Alice');f.controller.handleKey(key('ArrowUp'));assert.equal(f.input.value,'第一条');assert.equal(f.channel,'local');f.controller.handleKey(key('ArrowUp'));assert.equal(f.input.value,'第一条');
 f.controller.handleKey(key('ArrowDown'));assert.equal(f.input.value,'第二条');f.controller.handleKey(key('ArrowDown'));assert.equal(f.input.value,'未发送');assert.equal(f.channel,'guild');assert.equal(f.target,'drafttarget');assert.equal(f.input.selectionStart,3);assert.equal(f.input.selectionDirection,'backward');assert.equal(f.controller.handleKey(key('ArrowDown')),false);
 pass('proposed history Up/Down restores exact channel/target and the unsent draft with its cursor at both bounds');
}
{
 const f=fixture();f.input.edit('发送记录');f.controller.submit();f.input.edit('原草稿');f.controller.handleKey(key('ArrowUp'));f.input.edit('编辑后的历史');assert.equal(f.controller.handleKey(key('ArrowDown')),false);f.controller.handleKey(key('ArrowUp'));assert.equal(f.input.value,'发送记录');f.controller.handleKey(key('ArrowDown'));assert.equal(f.input.value,'编辑后的历史');
 pass('editing a recalled entry starts a fresh draft and cannot restore the abandoned older draft over user edits');
}
{
 const f=fixture();for(let i=0;i<CHAT_HISTORY_LIMIT+3;i++){f.input.edit(`消息${i}`);f.controller.submit();}assert.equal(f.controller.debugState().history.length,100);assert.equal(f.controller.debugState().history[0].text,'消息3');f.input.edit('消息102');f.controller.submit();assert.equal(f.controller.debugState().history.length,100);assert.equal(f.controller.debugState().history.at(-2).text,'消息101');f.channel='group';f.input.edit('消息102');f.controller.submit();assert.equal(f.controller.debugState().history.at(-2).channel,'local');assert.equal(f.controller.debugState().history.at(-1).channel,'group');
 pass('proposed history is bounded in memory, coalesces only identical consecutive drafts and distinguishes channels');
}
{
 const f=fixture();f.input.edit('/张三 你好');f.controller.submit();assert.equal(f.controller.debugState().lastWhisper,'张三');assert.equal(f.controller.open('/'),true);assert.equal(f.input.value,'/张三 ');assert.equal(f.input.selectionStart,4);f.input.edit('不要覆盖');f.controller.open('!~');assert.equal(f.input.value,'不要覆盖');f.input.edit('');f.controller.open('@');assert.equal(f.input.value,'@');
 pass('slash remembers the last queued whisper name, puts the caret at the end and opening chat preserves a nonempty Web draft');
}
{
 const f=fixture();f.input.edit('old');assert.equal(f.controller.selectLine('(!)Alice: hello'),true);assert.equal(f.input.value,'/Alice ');assert.equal(f.channel,'whisper');assert.equal(f.target,'Alice');assert.equal(f.input.selectionStart,7);assert.equal(f.input.focused,true);assert.equal(f.sent.length,0);for(const name of ['', 'bad name','@command','/Alice'])assert.equal(f.controller.selectName(name),false);assert.equal(f.input.value,'/Alice ');
 pass('reference chat-line clicks prefill a whisper and focus its end without sending or accepting an unsafe name');
}
{
 const f=fixture();f.input.edit('待恢复',1,3);f.controller.submit();assert.equal(f.controller.rejectLastSend('发送拒绝',f.sent[0].chatId),true);assert.equal(f.input.value,'待恢复');assert.equal(f.input.selectionStart,1);assert.equal(f.input.selectionEnd,3);assert.equal(f.controller.rejectLastSend('重复拒绝',f.sent[0].chatId),false);
 const edited=fixture();edited.input.edit('旧消息');edited.controller.submit();edited.input.edit('新草稿');assert.equal(edited.controller.rejectLastSend('发送拒绝',edited.sent[0].chatId),false);assert.equal(edited.input.value,'新草稿');
 const switched=fixture();switched.input.edit('旧消息');switched.controller.submit();switched.channel='guild';assert.equal(switched.controller.rejectLastSend('发送拒绝',switched.sent[0].chatId),false);assert.equal(switched.channel,'guild');
 pass('rejected queued sends restore only an untouched cleared draft and never overwrite later text or channel edits');
}
{
 const f=fixture();f.input.edit('/Alice hi');f.controller.submit();f.input.edit('断连保留');f.controller.resetHistory();assert.equal(f.input.value,'断连保留');assert.equal(f.controller.debugState().history.length,0);assert.equal(f.controller.debugState().lastWhisper,'');assert.equal(f.controller.handleKey(key('ArrowUp')),false);
 pass('explicit history reset removes conversation memory without deleting an existing draft');
}
{
 const f=fixture();f.controller.dispose();f.input.edit('消息');const enter=key('Enter');f.input.emit('keydown',enter);f.input.emit('compositionstart');assert.equal(f.sent.length,0);assert.equal(enter.prevented,false);assert.equal(f.controller.debugState().composing,false);assert.ok([...f.input.listeners.values()].every(entries=>entries.length===0));
 pass('dispose removes actual key, input and composition bindings without leaving duplicate send listeners');
}
{
 const f=fixture();f.input.edit('A');f.controller.submit();f.input.edit('B',0,1);f.controller.submit();assert.deepEqual(f.sent.map(command=>command.chatId),[1,2]);
 assert.equal(f.controller.rejectLastSend('A旧拒绝',1),false);assert.deepEqual(f.statuses,['A旧拒绝']);
 for(const id of [undefined,1,0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1])assert.equal(f.controller.rejectLastSend('未知拒绝',id),false);
 assert.equal(f.input.value,'');assert.equal(f.controller.rejectLastSend('B拒绝',2),true);assert.equal(f.input.value,'B');assert.equal(f.input.selectionStart,0);assert.equal(f.input.selectionEnd,1);assert.deepEqual(f.statuses,['A旧拒绝','B拒绝']);assert.equal(f.controller.rejectLastSend('重复B',2),false);
 f.input.edit('C');f.controller.submit();f.controller.resetHistory();f.input.edit('D');f.controller.submit();assert.deepEqual(f.sent.map(command=>command.chatId),[1,2,3,4]);assert.equal(f.controller.rejectLastSend('reset前',3),false);assert.equal(f.controller.rejectLastSend('D拒绝',4),true);assert.equal(f.input.value,'D');
 assert.equal(chatCommandOf('纯解析','local').command.chatId,undefined);
 const failed=fixture();failed.input.edit('');assert.equal(failed.controller.submit(),false);failed.input.edit('失败');failed.sending=false;assert.equal(failed.controller.submit(),false);failed.sending=true;assert.equal(failed.controller.submit(),true);assert.deepEqual(failed.sent.map(command=>command.chatId),[1,2]);assert.equal(failed.controller.rejectLastSend('失败请求旧拒绝',1),false);assert.equal(failed.controller.rejectLastSend('当前拒绝',2),true);
 pass('positive monotonic chat IDs report older queued rejections without overwriting newer drafts, restore the matching draft and clear on reset');
}
assert.equal(groups,20);
console.log(`chat input production regression: ${groups} groups PASS`);
for(const file of ['apps/web/src/chat-input.ts','tests/chat_input_regression.mjs'])console.log(`SHA256 ${crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')} ${file}`);
console.log('Scope: actual transpiled production controller with fake input/events; no play integration, native runtime, browser IME, TCP delivery or history-fidelity claim.');
