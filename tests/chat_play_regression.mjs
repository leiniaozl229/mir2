import {installPlayUiContext} from './helpers/play_ui_context.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=ts.createSourceFile('play.ts',read('apps/web/src/play.ts'),ts.ScriptTarget.ES2022,true);
const nativePaletteResource=JSON.parse(read('content/classic-176/actor-status-palette.json'));
const chatColorModule=read('apps/web/src/chat-colors.ts').replace(/^import .*;\r?\n/gm,'');
const transpile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const helper=name=>{const node=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node,`production ${name} missing`);return node.getText(source);};
const constructor=source.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>declaration.name.getText(source)==='chatController'));
assert.ok(constructor,'actual chat controller construction missing');
function listener(target,type,within=source){
 const matches=[];
 const walk=node=>{if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='addEventListener'&&node.expression.expression.getText(source)===target&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===type)matches.push(node);ts.forEachChild(node,walk);};
 walk(within);assert.equal(matches.length,1,`expected one production ${target}.${type} listener`);return matches[0];
}
const connect=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='connect');assert.ok(connect);
const receive=listener('active','message',connect).arguments[1];
assert.ok(ts.isArrowFunction(receive)||ts.isFunctionExpression(receive));
const configuration=['chatForm.noValidate','chatTarget.required'].map(name=>{
 const statement=source.statements.find(node=>ts.isExpressionStatement(node)&&ts.isBinaryExpression(node.expression)&&node.expression.left.getText(source)===name);
 assert.ok(statement,`production ${name} assignment missing`);return statement.getText(source);
});
const code=transpile(`${chatColorModule}\n${helper('setChatChannel')}\n${helper('chatPhysicalLineCount')}\n${helper('chatPhysicalPrefixLineCount')}\n${helper('chatPhysicalCutOffset')}\n${helper('chatLogPhysicalLineCount')}\n${helper('trimChatLogPhysicalLines')}\n${helper('appendChat')}\n${helper('scrollChatLog')}\n${constructor.getText(source)}\n${configuration.join('\n')}\n${listener('chatForm','submit').getText(source)};\n${listener('chatChannel','change').getText(source)};\n${listener('window','keydown').getText(source)};\nglobalThis.controller=chatController;globalThis.receive=${receive.getText(source)};`);
const chatContext={exports:{}};vm.createContext(chatContext);vm.runInContext(transpile(read('apps/web/src/chat-input.ts')),chatContext);
const movementContext={exports:{},require:name=>{assert.equal(name,'./movement-model');return {screenDirection(){throw Error('outside chat scope');}};}};
vm.createContext(movementContext);vm.runInContext(transpile(read('apps/web/src/movement-input.ts')),movementContext);
const routeContext={exports:{},require:name=>{assert.equal(name,'./movement-input');return movementContext.exports;}};
class TextNode{constructor(data,parent){this.data=data;this.parentNode=parent;this.nodeType=3;}get length(){return this.data.length;}get textContent(){return this.data;}}
class Element{
 constructor(tag='div'){this.tag=tag;this.value='';this.hidden=false;this.required=true;this.children=[];this.dataset={};this.listeners=new Map();this.attributes=new Map();this.style={};this._textContent='';this.firstChild=null;this.focused=false;this.isContentEditable=false;this._scrollTop=0;this._scrollHeight=0;this.clientHeight=0;}
 addEventListener(type,callback){this.listeners.set(type,[...(this.listeners.get(type)??[]),callback]);}
 removeEventListener(type,callback){this.listeners.set(type,(this.listeners.get(type)??[]).filter(value=>value!==callback));}
 emit(type,event={}){event.target??=this;for(const callback of this.listeners.get(type)??[])callback(event);return event;}
 matches(){return ['input','select','textarea'].includes(this.tag);}closest(){return null;}
 focus(){this.focused=true;}blur(){this.focused=false;this.emit('blur');}
 setAttribute(name,value){this.attributes.set(name,value);}
 set textContent(value){this._textContent=String(value);this.children=[];this.firstChild=this._textContent?new TextNode(this._textContent,this):null;}
 get textContent(){return this.children.length?this.children.map(child=>child?.textContent??'').join(''):this.firstChild?.textContent??this._textContent;}
 append(...items){for(const item of items){this.children.push(item);item.parent=this;item.parentNode=this;if(!this.firstChild)this.firstChild=item;}}
 remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);}
 getBoundingClientRect(){return {height:Number(this.dataset.physicalLines||1)*14+4};}
 get firstElementChild(){return this.children[0];}get scrollHeight(){return this._scrollHeight||this.children.length;}set scrollHeight(value){this._scrollHeight=value;}get scrollTop(){return this._scrollTop;}set scrollTop(value){this._scrollTop=Math.max(0,Math.min(Math.max(0,this.scrollHeight-this.clientHeight),value));}
}
class Input extends Element{
 constructor(){super('input');this.selectionStart=0;this.selectionEnd=0;this.selectionDirection='none';}
 setSelectionRange(start,end,direction='none'){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction;}
 edit(value,start=value.length,end=start){this.value=value;this.setSelectionRange(start,end);this.emit('input');}
}
routeContext.HTMLElement=Element;vm.createContext(routeContext);vm.runInContext(transpile(read('apps/web/src/classic-input.ts')),routeContext);
const event=(key,extra={})=>({key,code:'',keyCode:0,isComposing:false,repeat:false,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra});
const plain=value=>JSON.parse(JSON.stringify(value));
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
function harness(){
 const sent=[],calls=[],attackModeCycleErrors=[],window=new Element(),chatInput=new Input(),chatTarget=new Input(),chatChannel=new Element('select'),chatForm=new Element('form'),chatLog=new Element('ol'),questLog={contains:node=>node===questLog};window.lineHeight=14;window.getComputedStyle=()=>({lineHeight:`${window.lineHeight}px`});chatChannel.value='local';chatLog.clientHeight=52;
 const wrapWidths=new Map(),document={createElement:tag=>new Element(tag),createRange(){let node,line,start=0,end=0;const findText=target=>target?.nodeType===3?target:target?.firstChild?findText(target.firstChild):undefined;return {selectNodeContents(target){line=target.nodeType===3?target.parentNode:target;node=findText(target);if(line&&!line.dataset.testWrapWidth)line.dataset.testWrapWidth=String(wrapWidths.get(line.textContent)??10000);start=0;end=node?.data.length??0;},setStart(target,offset){node=target;line=target.parentNode;start=offset;if(line&&!line.dataset.testWrapWidth)line.dataset.testWrapWidth=String(wrapWidths.get(line.textContent)??10000);},setEnd(target,offset){node=target;line=target.parentNode;end=offset;if(line&&!line.dataset.testWrapWidth)line.dataset.testWrapWidth=String(wrapWidths.get(line.textContent)??10000);},getClientRects(){const width=Math.max(1,Number(line?.dataset.testWrapWidth)||10000),length=Math.max(0,end-start);return Array.from({length:Math.ceil(length/width)},()=>({}));},detach(){}};}};
 const tracked=prefix=>({rejectPending:(...args)=>calls.push([`${prefix}.reject`,...args]),resolve:()=>calls.push([`${prefix}.resolve`]),cancelSelection:()=>calls.push([`${prefix}.selection`]),cancelKeyBinding:()=>calls.push([`${prefix}.binding`]),handleKey:()=>false});
 const active={readyState:1,send:data=>sent.push(JSON.parse(data))};
 const context={exports:{},systemDialog:{interceptKey:()=>false},console,nativePaletteResource,ChatInputController:chatContext.exports.ChatInputController,routeClassicKey:routeContext.exports.routeClassicKey,movementInput:movementContext.exports.movementInput,
  HTMLElement:Element,window,chatInput,chatTarget,chatChannel,chatForm,chatLog,questLog,scrollQuestLog:key=>calls.push(['quest.scroll',key]),chatTargetWrap:new Element(),connection:new Element(),combatStatus:new Element(),document,wrapWidths,
  active,socket:active,WebSocket:{OPEN:1},self:1,lastSequence:0,mapGeneration:5,agentObserver:{event:(...args)=>calls.push(['observe',...args])},
  pending:{x:3,y:4,fromX:2,fromY:4},pendingAction:{actionId:73,kind:'move'},selectedMagic:9,held:{code:'KeyW',dx:0,dy:-1,run:false},rightPointer:12,clickDestination:{x:3,y:4},pursuitTarget:31,pursuitHarvest:true,pursuitGroundItem:32,doorRetry:{x:3,y:4},
  inventory:tracked('inventory'),itemQuickBar:tracked('quickbar'),equipment:tracked('equipment'),skillBar:tracked('skills'),shop:tracked('shop'),repair:tracked('repair'),storage:tracked('storage'),mining:{reject:()=>calls.push(['mining.reject'])},
  worldInputAvailable:()=>context.inWorld,worldInputBlocked:()=>context.blocked,inWorld:true,blocked:false,cancelWorldIntent:()=>calls.push(['world.cancel']),closeTopWindow:()=>calls.push(['window.close']),minimap:{cycle:()=>calls.push(['map.cycle'])},cycleAttackMode:()=>calls.push(['attack.mode']),rejectAttackModeCycle:(...args)=>{attackModeCycleErrors.push(args);return false;},toggleClassicWindow:name=>calls.push(['window.toggle',name]),selectSkillSlot:index=>calls.push(['skill.select',index]),stopCombat:()=>calls.push(['combat.stop']),entities:new Map(),sendMovement:()=>calls.push(['movement.send'])
 };
 installPlayUiContext(context);vm.runInContext(code,context);
 let sequence=0;
 return {context,sent,calls,attackModeCycleErrors,input:chatInput,controller:context.controller,submit:()=>chatForm.emit('submit',event('Enter')),key:(key,extra={})=>window.emit('keydown',event(key,extra)),receive:(message,envelope={})=>context.receive({data:JSON.stringify({sequence:++sequence,mapGeneration:5,...envelope,message})})};
}
{
 const h=harness(),c=h.context;assert.equal(c.chatForm.noValidate,true);assert.equal(c.chatTarget.required,false);
 c.chatChannel.value='whisper';c.chatChannel.emit('change');assert.equal(c.chatTargetWrap.hidden,false);assert.equal(c.chatTarget.required,false);assert.equal(c.chatTarget.focused,true);
 h.input.edit('  @AttackMode  1  ');const submitted=h.submit();assert.equal(submitted.prevented,true);assert.deepEqual(h.sent,[{type:'say',channel:'raw',text:'@AttackMode  1',chatId:1}]);assert.equal(h.input.value,'');
 h.input.edit('!!组队话');h.submit();assert.deepEqual(h.sent[1],{type:'say',channel:'raw',text:'!!组队话',chatId:2});
 h.input.edit('缺少对象');h.submit();assert.equal(h.sent.length,2);assert.equal(h.input.value,'缺少对象');assert.match(c.connection.textContent,/私聊对象/);
 pass('actual constructor, noValidate and channel callback preserve raw @/prefix text despite an empty selected whisper target');
}
{
 const h=harness();h.input.edit('一次发送');const enter=event('Enter');h.input.emit('keydown',enter);assert.equal(enter.prevented,true);assert.equal(enter.stopped,true);assert.equal(h.sent.length,1);h.submit();assert.equal(h.sent.length,1);
 h.input.edit('下一条');h.input.emit('keydown',event('Enter',{repeat:true}));assert.equal(h.sent.length,1);h.input.emit('compositionstart');h.submit();h.input.emit('keydown',event('Enter'));assert.equal(h.sent.length,1);assert.equal(h.input.value,'下一条');h.input.emit('compositionend');h.submit();assert.equal(h.sent.length,2);
 pass('production form and bound input Enter enqueue once, reject repeated/empty submission and keep an active IME draft');
}
{
 for(const change of [c=>{c.socket.readyState=3;},c=>{c.socket=undefined;},c=>{c.self=undefined;}]){
  const h=harness();change(h.context);h.input.edit('/张三 未连消息',2,5);h.input.focus();h.submit();assert.equal(h.sent.length,0);assert.equal(h.input.value,'/张三 未连消息');assert.equal(h.input.selectionStart,2);assert.equal(h.input.selectionEnd,5);assert.equal(h.input.focused,true);assert.match(h.context.connection.textContent,/草稿已保留/);
 }
 const h=harness();h.context.socket.send=()=>{throw Error('socket closing');};h.input.edit('正在断开');h.submit();assert.equal(h.input.value,'正在断开');assert.equal(h.controller.debugState().history.length,0);
 pass('actual page send/canSend configuration keeps text, selection and focus with closed/missing sockets, missing self and send exceptions');
}
{
 const h=harness(),c=h.context;h.receive({type:'chat',channel:'shout',text:'(!)张三:你好',foreground:4,background:0});assert.equal(c.chatLog.children.length,1);assert.equal(c.chatLog.children[0].firstChild.style.color,'rgb(0, 0, 128)');assert.equal(c.chatLog.children[0].firstChild.style.backgroundColor,'rgb(0, 0, 0)');c.chatLog.children[0].emit('click');assert.equal(h.input.value,'/张三 ');assert.equal(c.chatChannel.value,'whisper');assert.equal(c.chatTarget.value,'张三');assert.equal(h.input.selectionStart,4);assert.equal(h.sent.length,0);
 h.input.edit('草稿');h.receive({type:'systemMessage',text:'国王:提示',foreground:2,background:7});const system=c.chatLog.children[1];assert.equal(system.dataset.channel,'system');assert.equal(system.firstChild.style.color,'rgb(0, 128, 0)');assert.equal(system.firstChild.style.backgroundColor,'rgb(192, 192, 192)');assert.equal(system.listeners.get('click'),undefined);system.emit('click');assert.equal(h.input.value,'草稿');assert.equal(c.chatTarget.value,'张三');assert.equal(c.combatStatus.textContent,'国王:提示');assert.equal(h.sent.length,0);
 pass('actual receive/appendChat callbacks turn player-name clicks into unsent whispers and exclude system notices from name selection');
}
{
 const h=harness(),c=h.context;h.receive({type:'chat',channel:'guild',text:'消息',foreground:4,background:5});const content=c.chatLog.children[0].firstChild;assert.equal(content.style.color,'rgb(0, 0, 128)');assert.equal(content.style.backgroundColor,'rgb(128, 0, 128)');assert.equal(c.chatLog.children[0].textContent,'消息');
 pass('native guild message palette bytes render on the text bounds without changing text or channel routing');
}
{
 const h=harness(),c=h.context,log=c.chatLog;log.scrollHeight=300;log.scrollTop=248;c.blocked=true;c.window.lineHeight=16;
 for(const [key,expected] of [['ArrowUp',232],['PageUp',196],['ArrowDown',212],['PageDown',248]]){const result=h.key(key);assert.equal(result.prevented,true);assert.equal(log.scrollTop,expected);}
 c.document.activeElement=c.questLog;const chatPosition=log.scrollTop;h.key('ArrowDown');assert.equal(log.scrollTop,chatPosition,'focused quest navigation must not also scroll chat');assert.ok(h.calls.some(([name,key])=>name==='quest.scroll'&&key==='ArrowDown'));c.document.activeElement=null;
 assert.ok(!h.calls.includes('movement.send'),'chat scrolling also sent world movement');c.blocked=false;log.scrollHeight=400;log.scrollTop=100;h.receive({type:'chat',channel:'local',text:'历史中的新消息'});assert.equal(log.scrollTop,100,'new messages must not pull a reader away from chat history');log.scrollTop=348;h.receive({type:'chat',channel:'local',text:'新消息'});assert.equal(log.scrollTop,348);
 pass('production keyboard routing measures chat line height for arrows and PageUp/PageDown, keeps scrolling available while world input is blocked, preserves a history position and follows messages only from the bottom');
}
{
 const h=harness();for(let index=0;index<201;index++)h.receive({type:'chat',channel:'local',text:`消息${index}`});
 assert.equal(h.context.chatLog.children.length,200);assert.equal(h.context.chatLog.children[0].textContent,'消息1');assert.equal(h.context.chatLog.children.at(-1).textContent,'消息200');assert.equal(h.context.chatLog.scrollTop,h.context.chatLog.scrollHeight-h.context.chatLog.clientHeight);
 pass('production chat log retains a 200-line physical buffer and stays at the newest entry after trimming');
}
{
 const h=harness(),log=h.context.chatLog,old='A'.repeat(120),middle='B'.repeat(50),latest='C'.repeat(40);h.context.wrapWidths.set(old,1);h.context.wrapWidths.set(middle,1);h.context.wrapWidths.set(latest,1);h.receive({type:'chat',channel:'local',text:old});h.receive({type:'chat',channel:'group',text:middle});log.scrollHeight=600;log.scrollTop=300;h.receive({type:'chat',channel:'local',text:latest});
 assert.equal(log.children.length,3);assert.equal(log.children[0].textContent,'A'.repeat(110),'only the excess oldest physical lines should be removed from a wrapped message');assert.deepEqual(log.children.map(line=>Number(line.dataset.physicalLines)),[110,50,40]);assert.equal(log.children.reduce((total,line)=>total+Number(line.dataset.physicalLines),0),200);assert.equal(log.children[0].attributes.get('aria-label'),`附近 ${'A'.repeat(110)}`);assert.equal(log.scrollTop,160,'trimming above the viewport must keep the viewed content anchored');
 pass('wrapped chat messages count as rendered physical lines; overflow trims only the oldest line prefix and offsets history scroll by removed height');
}
{
 const h=harness(),c=h.context;h.input.edit('A');h.submit();h.input.edit('B',0,1);h.submit();
 const before=plain({pending:c.pending,pendingAction:c.pendingAction,selectedMagic:c.selectedMagic,held:c.held,rightPointer:c.rightPointer,clickDestination:c.clickDestination,pursuitTarget:c.pursuitTarget,pursuitHarvest:c.pursuitHarvest,pursuitGroundItem:c.pursuitGroundItem,doorRetry:c.doorRetry});
 h.receive({type:'error',commandType:'say',message:'A旧拒绝',chatId:1,actionId:73});assert.equal(h.input.value,'');h.receive({type:'error',commandType:'say',message:'缺失编号'});assert.equal(h.input.value,'');
 h.receive({type:'error',commandType:'say',message:'B拒绝',chatId:2,actionId:73});assert.equal(h.input.value,'B');assert.equal(h.input.selectionStart,0);assert.equal(h.input.selectionEnd,1);assert.equal(c.connection.textContent,'B拒绝');
 assert.deepEqual(plain(h.attackModeCycleErrors),[[1,'A旧拒绝'],[null,'缺失编号'],[2,'B拒绝']]);
 assert.deepEqual(plain({pending:c.pending,pendingAction:c.pendingAction,selectedMagic:c.selectedMagic,held:c.held,rightPointer:c.rightPointer,clickDestination:c.clickDestination,pursuitTarget:c.pursuitTarget,pursuitHarvest:c.pursuitHarvest,pursuitGroundItem:c.pursuitGroundItem,doorRetry:c.doorRetry}),before);
 assert.ok(h.calls.every(call=>call[0]==='observe'),'say error reached unrelated movement/item/magic/service failure path');assert.equal(c.chatLog.children.length,0);
 pass('production say error passes matching chatId, rejects queued old/unknown errors and returns before unrelated world/item/magic pending rollback');
}
{
 for(const [key,prefix] of [['Enter',''],[' ',''],['@','@'],['!','!'],['/','/']]){
  const h=harness(),triggered=h.key(key);assert.equal(triggered.prevented,true);assert.equal(h.input.value,prefix);assert.equal(h.input.focused,true);assert.equal(h.sent.length,0);assert.equal(h.calls.length,0);
 }
 const h=harness();h.context.chatChannel.value='guild';h.key('Enter');assert.equal(h.input.value,'!~');h.input.edit('现有草稿');h.key('!');assert.equal(h.input.value,'现有草稿');h.input.edit('');h.key('@',{shiftKey:true});assert.equal(h.input.value,'@');
 pass('actual global keyboard configuration opens Enter/Space/prefix chat, uses guild !~ default and preserves a nonempty draft without sending');
}
{
 for(const [extra,prepare,targetInput] of [[{repeat:true},()=>{}],[{isComposing:true},()=>{}],[{keyCode:229},()=>{}],[{ctrlKey:true},()=>{}],[{altKey:true},()=>{}],[{metaKey:true},()=>{}],[{},c=>{c.blocked=true;}],[{},c=>{c.inWorld=false;}],[{},()=>{},true]]){
  const h=harness();prepare(h.context);h.key('@',{...extra,...(targetInput?{target:h.input}:{})});assert.equal(h.input.value,'');assert.equal(h.input.focused,false);assert.equal(h.sent.length,0);
 }
 const h=harness();h.input.edit('/Alice hi');h.submit();h.key('/');assert.equal(h.input.value,'/Alice ');assert.equal(h.input.selectionStart,7);
 pass('production keyboard routing leaves focused editors, IME, repeated/modifier keys and blocked/nonworld contexts untouched and reuses the last whisper');
}
assert.equal(groups,11);
console.log(`chat play production regression: ${groups} groups PASS`);
for(const file of ['apps/web/src/chat-input.ts','apps/web/src/classic-input.ts','apps/web/src/play.ts','tests/chat_play_regression.mjs'])console.log(`SHA256 ${crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')} ${file}`);
console.log('Scope: TypeScript AST-extracted actual play constructor, configuration, form/channel/keyboard/socket callbacks and appendChat with real production chat controller/key router in fake DOM; no browser/native IME, live TCP delivery or native history-fidelity claim.');
