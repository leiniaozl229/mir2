import {installPlayUiContext} from './play_ui_context.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const contract=JSON.parse(read('content/classic-176/auth-actions.json'));
const prguse=JSON.parse(read('assets/web/ui-national/prguse/library.json')),chrsel=JSON.parse(read('assets/web/ui-national/chrsel/library.json'));
const plain=value=>JSON.parse(JSON.stringify(value));
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const flush=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));};
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
class Element{
 constructor(tag,document){this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.parentElement=null;this.dataset={};this.style={setProperty(key,value){this[key]=value;}};this.attributes=new Map();this.listeners=new Map();this.hidden=false;this.disabled=false;this.value='';this.type='';this.className='';this.classList={add:(...names)=>this.className=[...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' '),remove:(...names)=>this.className=this.className.split(' ').filter(name=>!names.includes(name)).join(' ')};}
 append(...children){for(const child of children){child.parentElement=this;this.children.push(child);}}replaceChildren(...children){this.children=[];this.append(...children);}
 setAttribute(name,value){this.attributes.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);else if(name==='id'||name==='type'||name==='class')this[name==='class'?'className':name]=String(value);else if(name==='hidden'||name==='disabled')this[name]=true;else if(name==='maxlength')this.maxLength=Number(value);}
 getAttribute(name){if(name.startsWith('data-'))return this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]??null;return this.attributes.get(name)??null;}
 matches(selector){return selector.split(',').some(part=>{part=part.trim();if(part.startsWith('#'))return this.id===part.slice(1);const match=/^(\w+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/.exec(part);if(!match)return false;if(match[1]&&this.tagName!==match[1].toUpperCase())return false;if(match[2]){if(match[2]==='type')return this.type===match[3];return match[3]===undefined?this.getAttribute(match[2])!==null:this.getAttribute(match[2])===match[3];}return true;});}
 querySelectorAll(selector){const found=[];for(const child of this.children){if(child.matches(selector))found.push(child);found.push(...child.querySelectorAll(selector));}return found;}querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 addEventListener(type,fn){this.listeners.set(type,[...(this.listeners.get(type)??[]),fn]);}removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(item=>item!==fn));}
 focus(){if(this.disabled||this.hidden||this.hasHiddenAncestor())return;this.ownerDocument.activeElement=this;}hasHiddenAncestor(){return Boolean(this.parentElement&&(this.parentElement.hidden||this.parentElement.hasHiddenAncestor()));}
 emit(type,extra={}){const event={type,target:this,key:'',isComposing:false,keyCode:0,repeat:false,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;this.immediate=true;},...extra};for(let node=this;node;node=node.parentElement){for(const fn of node.listeners.get(type)??[]){fn(event);if(event.immediate)break;}if(!event.immediate)node[`on${type}`]?.(event);if(event.stopped)break;}return event;}
}
function parseAuth(document){
 const markup=read('apps/web/play.html'),start=markup.indexOf('<div id="auth-overlay"'),stop=markup.indexOf('<p id="connection"',start),fragment=markup.slice(start,stop);
 const host=document.createElement('div'),stack=[host],voids=new Set(['INPUT','IMG','BR']);
 for(const token of fragment.matchAll(/<\/?[a-z][^>]*>/gi)){
  const raw=token[0];if(raw.startsWith('</')){if(stack.length>1)stack.pop();continue;}
  const tag=/^<([a-z]+)/i.exec(raw)[1],element=document.createElement(tag);
  const attributes=raw.slice(tag.length+1,-1);for(const match of attributes.matchAll(/([^\s=]+)(?:="([^"]*)")?/g))element.setAttribute(match[1],match[2]??'');
  stack.at(-1).append(element);if(!voids.has(element.tagName))stack.push(element);
 }
 return host.querySelector('#auth-overlay');
}
function fixture({library=prguse,deferred=false}={}){
 const document=new Element('document');document.activeElement=null;document.hidden=false;document.createElement=tag=>new Element(tag,document);document.defaultView=new Element('window',document);
 const element=parseAuth(document),modules=new Map(),urls=[],scenes=[],actions=[],images=[],imageModes=new Map();document.append(element);let release;
 class Image{naturalWidth=0;naturalHeight=0;set src(url){this.url=url;images.push(this);if(imageModes.get(url)==='defer')return;queueMicrotask(()=>this.deliver(imageModes.get(url)??'ok'));}deliver(mode='ok'){if(mode==='fail'){this.onerror?.();return;}const file=this.url.split('/').at(-1),frame=Object.values(prguse.frames).find(frame=>frame.file===file);this.naturalWidth=mode==='wrong'?1:frame?.width??0;this.naturalHeight=frame?.height??0;this.onload?.();}}
 const defer=deferred?new Promise(resolve=>{release=resolve;}):Promise.resolve();
 function load(file){
  if(file.endsWith('.css'))return {};
  if(file.endsWith('.json'))return {default:JSON.parse(read(file))};
  if(!file.endsWith('.ts'))file+='.ts';
  if(file==='apps/web/src/classic-layout.ts')return {classicUiLayout:()=>({})};
  if(modules.has(file))return modules.get(file);
  const context={exports:{},document,HTMLElement:Element,Image,setTimeout,clearTimeout,fetch:async url=>{urls.push(url);if(url==='/ui-national/prguse/library.json'){await defer;return {ok:true,json:async()=>library};}return {ok:true,json:async()=>url==='/ui-national/chrsel/library.json'?chrsel:{frames:{}}};},require:specifier=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier)))};installPlayUiContext(context);modules.set(file,context.exports);vm.runInContext(compile(read(file)),context,{filename:file});return context.exports;
 }
 const {ClassicAuth}=load('apps/web/src/classic-auth.ts'),auth=new ClassicAuth(element,phase=>scenes.push(phase));
 auth.bindPasswordActions({open:()=>actions.push('open'),cancel:()=>{actions.push('cancel');auth.showLogin();}});
 const query=selector=>element.querySelector(selector),field=name=>query(`[data-password-field="${name}"]`),secret=()=>{for(const name of ['oldPassword','newPassword','repeatPassword'])field(name).value=`fixture-${name}`;};
 return {document,element,auth,query,field,secret,scenes,actions,urls,release,images,imageModes};
}

const playFile=ts.createSourceFile('play.ts',read('apps/web/src/play.ts'),ts.ScriptTarget.ES2022,true);
const helper=name=>{const node=playFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node,`production ${name} missing`);return node.getText(playFile);};
const variable=name=>{const node=playFile.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>declaration.name.getText(playFile)===name));assert.ok(node,`production ${name} construction missing`);return node.getText(playFile);};
function calls(target,name,within=playFile){const found=[];function walk(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(playFile)===target&&node.expression.name.text===name)found.push(node);ts.forEachChild(node,walk);}walk(within);return found;}
function listener(target,type,within=playFile){const found=calls(target,'addEventListener',within).filter(node=>ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===type);assert.equal(found.length,1,`one actual ${target}.${type} listener`);return found[0];}
const connectNode=playFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='connect');
const receive=listener('active','message',connectNode).arguments[1],close=listener('active','close',connectNode).arguments[1];
async function playHarness(){
 const f=fixture();await f.auth.ready();const log=[],sent=[],sockets=[],timers=new Map(),windows=new Element('window',f.document);let nextTimer=0,modal=false;
 class Socket{
  static OPEN=1;readyState=1;listeners=new Map();closed=0;
  constructor(){sockets.push(this);}addEventListener(type,fn){this.listeners.set(type,[...(this.listeners.get(type)??[]),fn]);}removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(item=>item!==fn));}
  send(value){sent.push(JSON.parse(value));}close(){this.closed++;this.readyState=3;for(const fn of [...(this.listeners.get('close')??[])])fn();}
  message(message,sequence=1){for(const fn of [...(this.listeners.get('message')??[])])fn({data:JSON.stringify({sequence,mapGeneration:0,message})});}
 }
 const dialogs=[];
 class DialogBoundary{
  constructor(layer,surface,options){this.options=options;log.push(['dialog.mount',layer,surface]);}
  isOpen(){return modal;}interceptKey(){return modal;}
  show(spec){modal=true;this.options.onVisibilityChange(true);return new Promise(resolve=>dialogs.push({spec:plain(spec),finish:result=>{modal=false;resolve(result);}}));}
  interrupt(){log.push(['dialog.interrupt']);modal=false;for(const item of dialogs.splice(0))item.finish('interrupted');}
 }
 const pendingAction={actionId:73,kind:'move'},npcStamp={npcSessionId:8,mapGeneration:4,npcId:101};
 const service=()=>({clear:()=>log.push(['service.clear']),rejectPending:()=>log.push(['service.reject']),syncInventory:()=>{}}),component=()=>({clear:()=>{},cancelSelection:()=>{},rejectPending:()=>log.push(['inventory.reject']),resolve:()=>{},cancelKeyBinding:()=>{},resetHistory:()=>{}});
 const panels=new Map(['#shop-panel','#repair-panel','#storage-panel'].map(id=>[id,{hidden:true}]));
 const context={exports:{},classicAuth:f.auth,passwordForm:f.query('#change-password'),classicModalLayer:{id:'layer'},classicSurface:{id:'surface'},SystemDialogController:DialogBoundary,WebSocket:Socket,location:{protocol:'http:',host:'fixture'},connection:{textContent:''},document:{querySelector:selector=>selector==='#auth-overlay'?f.element:f.query(selector)??panels.get(selector),body:{classList:{contains:()=>context.inWorld,remove:()=>context.inWorld=false}}},window:windows,passwordSceneGeneration:0,reconnectEnabled:true,credentials:{account:'fixture',password:'fixture'},selectedCharacter:'fixture',reconnectTimer:5,reconnectAttempts:0,worldReady:true,inWorld:true,self:1,entities:new Map([[1,{id:1,dead:false}]]),revivePanel:{hidden:true},npcSession:{current:()=>npcStamp,accept:()=>true,reset:()=>{},invalidate:()=>log.push(['npc.invalidate'])},lastSequence:0,mapGeneration:4,agentObserver:{event:()=>{}},intent:'login',account:'fixture',password:'fixture',resumeCharacter:undefined,preloadPlayerLocomotion:()=>Promise.resolve(),loadQuest:()=>{},updateQuest:quest=>log.push(['quest',quest.id]),showAuthNotice:undefined,closeTopWindow:()=>{},toggleClassicWindow:()=>{},selectSkillSlot:()=>{},routeClassicKey:()=>log.push(['route']),bringClassicWindowToFront:()=>{},combatStatus:{textContent:''},pendingAction,pending:{actionId:73},held:{dx:1},rightPointer:{},clickDestination:{x:2,y:2},pursuitTarget:9,pursuitHarvest:true,pursuitGroundItem:10,doorRetry:{},pursuitRejectedCells:new Set(['1,2']),combatTarget:9,selectedMagic:{magicId:1},combatTimer:undefined,mining:{cancel:()=>log.push(['mining.cancel']),reset:()=>log.push(['mining.reset'])},skillBar:{...component(),cancelSelection:()=>{context.selectedMagic=undefined;}},stopCombat:()=>{context.combatTarget=undefined;},audio:{clear:()=>log.push(['audio.clear'])},magicEffects:{clear:()=>log.push(['magic.clear'])},visuals:new Map(),groundItems:{clear:()=>{}},chatController:component(),classicWindow:{hidden:false},characterWindow:{hidden:false},inventoryWindow:{hidden:false},inventory:component(),itemQuickBar:component(),equipment:component(),paperdoll:component(),characterPanel:{...component(),resources:()=>{}},classicHud:{...component(),skinWindow:()=>{}},shop:service(),repair:service(),storage:service(),returnToTown:{disabled:true},closeNpcSession:()=>log.push(['npc.close']),hideDialogue:()=>log.push(['dialogue.hide']),dialogueElement:{hidden:true},dockChat:()=>{},renderGroup:()=>{},renderAttackMode:()=>{},renderGuild:()=>{},clearTrade:()=>{},renderTargets:()=>{},refreshMiniMapMarkers:()=>{},scheduleReconnect:()=>log.push(['reconnect']),appendChat:()=>log.push(['chat']),setTimeout:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)};
 const controllerContext={exports:{},setTimeout:context.setTimeout,clearTimeout:context.clearTimeout};vm.createContext(controllerContext);vm.runInContext(compile(read('apps/web/src/password-change.ts')),controllerContext);Object.assign(context,controllerContext.exports);
 const deleteContext={exports:{},setTimeout:context.setTimeout,clearTimeout:context.clearTimeout,require:()=>({default:JSON.parse(read('content/classic-176/selection-actions.json'))})};vm.createContext(deleteContext);vm.runInContext(compile(read('apps/web/src/character-delete.ts')),deleteContext);Object.assign(context,deleteContext.exports);context.gatewayFeatures={characterDeletion:true};
 installPlayUiContext(context);
 const bind=calls('classicAuth','bindPasswordActions');assert.equal(bind.length,1);
 const code=[helper('cancelWorldIntent'),helper('showAuthNotice'),helper('sendNpcCommand'),helper('worldInputAvailable'),helper('worldInputBlocked'),helper('showDeathWindow'),helper('clearWorld'),variable('systemDialog'),variable('selectionRevision'),variable('characterDelete'),calls('classicAuth','bindDelete')[0].getText(playFile)+';',variable('passwordChange'),bind[0].getText(playFile)+';',listener('passwordForm','submit').getText(playFile)+';',listener('window','pagehide').getText(playFile)+';',listener('window','keydown').getText(playFile)+';',`globalThis.deletion=characterDelete;globalThis.dialog=systemDialog;globalThis.change=passwordChange;globalThis.receive=${receive.getText(playFile)};globalThis.closed=${close.getText(playFile)};`].join('\n');
 vm.runInContext(compile(code),context);const active=new Socket();context.active=active;context.socket=active;
 return {f,context,dialogs,log,sent,sockets,active,timers,modal:()=>modal,setModal:value=>modal=value,receive:message=>context.receive({data:JSON.stringify({sequence:context.lastSequence+1,mapGeneration:4,message})})};
}
export {fixture,playHarness,prguse,plain,flush};
