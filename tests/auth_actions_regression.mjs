import {installPlayUiContext} from './helpers/play_ui_context.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
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
 getAttribute(name){return this.attributes.get(name)??null;}
 matches(selector){return selector.split(',').some(part=>{part=part.trim();if(part.startsWith('#'))return this.id===part.slice(1);const match=/^(\w+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/.exec(part);if(!match)return false;if(match[1]&&this.tagName!==match[1].toUpperCase())return false;if(match[2]){if(match[2]==='type')return this.type===match[3];return match[3]===undefined?this.attributes.has(match[2]):this.getAttribute(match[2])===match[3];}return true;});}
 querySelectorAll(selector){const found=[];for(const child of this.children){if(child.matches(selector))found.push(child);found.push(...child.querySelectorAll(selector));}return found;}querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 addEventListener(type,fn){this.listeners.set(type,[...(this.listeners.get(type)??[]),fn]);}removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(item=>item!==fn));}
 focus(){if(this.disabled||this.hidden||this.hasHiddenAncestor())return;this.ownerDocument.activeElement=this;}hasHiddenAncestor(){return Boolean(this.parentElement&&(this.parentElement.hidden||this.parentElement.hasHiddenAncestor()));}
 emit(type,extra={}){const event={type,target:this,key:'',isComposing:false,keyCode:0,repeat:false,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;this.immediate=true;},...extra};for(let node=this;node;node=node.parentElement){for(const fn of node.listeners.get(type)??[]){fn(event);if(event.immediate)break;}if(!event.immediate)node[`on${type}`]?.(event);if(event.stopped)break;}return event;}
}
function parseAuth(document,markupFile='apps/web/play.html'){
 const markup=read(markupFile),start=markup.indexOf('<div id="auth-overlay"'),stop=markup.indexOf('<p id="connection"',start),fragment=markup.slice(start,stop);
 const host=document.createElement('div'),stack=[host],voids=new Set(['INPUT','IMG','BR']);
 for(const token of fragment.matchAll(/<\/?[a-z][^>]*>/gi)){
  const raw=token[0];if(raw.startsWith('</')){if(stack.length>1)stack.pop();continue;}
  const tag=/^<([a-z]+)/i.exec(raw)[1],element=document.createElement(tag);
  const attributes=raw.slice(tag.length+1,-1);for(const match of attributes.matchAll(/([^\s=]+)(?:="([^"]*)")?/g))element.setAttribute(match[1],match[2]??'');
  stack.at(-1).append(element);if(!voids.has(element.tagName))stack.push(element);
 }
 return host.querySelector('#auth-overlay');
}
function fixture({library=prguse,deferred=false,markupFile='apps/web/play.html'}={}){
 const document={activeElement:null,createElement:tag=>new Element(tag,document),addEventListener(){},defaultView:{addEventListener(){}}},element=parseAuth(document,markupFile),modules=new Map(),urls=[],scenes=[],actions=[],images=[],imageModes=new Map();let release;
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
 auth.bindRegistration((account,password)=>actions.push(['register',account,password]));
 const query=selector=>element.querySelector(selector),field=name=>query(`[data-password-field="${name}"]`),secret=()=>{for(const name of ['oldPassword','newPassword','repeatPassword'])field(name).value=`fixture-${name}`;};
 return {document,element,auth,query,field,secret,scenes,actions,urls,release,images,imageModes};
}

for(const markupFile of ['apps/web/play.html','apps/web/ui-calibration.html']){
 const f=fixture({markupFile});await f.auth.ready();f.query('#account').value='testaccount';const embedded=f.query('[data-auth-password-entry]'),legacy=f.query('#auth-password-change');assert.ok(embedded,`${markupFile} is missing the password-entry hit area`);assert.equal(embedded.hidden,false);assert.equal(legacy.hidden,true);assert.equal(embedded.style.left,`${contract.changePassword.nativeLoginEntry.left}px`);assert.equal(embedded.style.top,`${contract.changePassword.nativeLoginEntry.top}px`);assert.equal(embedded.style.width,`${contract.changePassword.nativeLoginEntry.width}px`);assert.equal(embedded.style.height,`${contract.changePassword.nativeLoginEntry.height}px`);embedded.emit('click');assert.equal(f.auth.isPasswordChangeOpen(),true);assert.equal(f.element.dataset.authScene,'password-change');assert.equal(f.query('[data-auth-login-dialog]').hidden,true);assert.equal(f.query('#change-password').hidden,false);assert.equal(f.field('account').value,'testaccount');assert.equal(f.document.activeElement,f.field('account'));assert.deepEqual(f.actions,['open']);assert.equal(f.scenes.at(-1),'login');
 pass(`${markupFile}: native login panel hit area opens password change, suppresses the duplicate control and retains account prefill/focus`);
}
{
 const f=fixture();await f.auth.ready();f.auth.showPasswordChange();const order=contract.changePassword.inputOrder;let submits=0;f.query('#change-password').addEventListener('submit',()=>submits++);
 for(let index=0;index<order.length;index++){const input=f.field(order[index]);input.focus();const event=input.emit('keydown',{key:'Enter'});if(!event.prevented)f.query('#change-password').emit('submit');assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(f.document.activeElement,f.field(order[(index+1)%order.length]));}
 assert.equal(submits,0);
 pass('all four reference input fields consume Enter and cycle focus in contract order without implicit form submission');
}
{
 const f=fixture();await f.auth.ready();f.auth.showPasswordChange();const input=f.field('oldPassword');input.focus();
 for(const key of ['Enter','Escape'])for(const marker of [{isComposing:true},{keyCode:229}]){const event=input.emit('keydown',{key,...marker});assert.equal(event.prevented,false);assert.equal(event.stopped,false);assert.equal(f.document.activeElement,input);assert.equal(f.auth.isPasswordChangeOpen(),true);}
 assert.equal(f.actions.length,0);
 pass('password field IME composition and legacy 229 markers cannot cycle focus, cancel the form or invoke an action');
}
{
 const f=fixture();await f.auth.ready();f.auth.showPasswordChange();const input=f.field('oldPassword'),form=f.query('#change-password');input.focus();let submits=0;form.addEventListener('submit',()=>submits++);input.emit('compositionstart');const key=input.emit('keydown',{key:'Enter'});assert.equal(key.prevented,false);assert.equal(f.document.activeElement?.dataset.passwordField,'oldPassword');const submit=form.emit('submit');assert.equal(submit.prevented,true);assert.equal(submit.immediate,true);assert.equal(submits,0);input.emit('compositionend');form.emit('submit');assert.equal(submits,1);input.emit('compositionstart');f.auth.showLogin();f.auth.showPasswordChange();f.field('account').emit('keydown',{key:'Enter'});assert.equal(f.document.activeElement?.dataset.passwordField,'oldPassword');
 pass('actual composition listeners block an implicit form submit at capture precedence and scene clearing releases composition state');
}
{
 const f=fixture();await f.auth.ready();f.auth.showPasswordChange();f.secret();f.auth.setBusy(true);assert.equal(f.query('[data-password-agree]').disabled,true);assert.equal(f.field('account').disabled,true);assert.equal(f.query('[data-password-cancel]').disabled,false);const before=f.document.activeElement;const event=f.field('account').emit('keydown',{key:'Enter'});assert.equal(event.prevented,true);assert.equal(f.document.activeElement,before);f.query('[data-password-cancel]').emit('click');assert.equal(f.actions.at(-1),'cancel');assert.equal(f.auth.isPasswordChangeOpen(),false);for(const name of ['oldPassword','newPassword','repeatPassword'])assert.equal(f.field(name).value,'');
 pass('busy state disables submit and all editable fields while cancellation remains available and clears secrets');
}
{
 const f=fixture();await f.auth.ready();f.auth.showPasswordChange();f.secret();f.auth.setBusy(true);const event=f.field('oldPassword').emit('keydown',{key:'Escape'});assert.equal(event.prevented,true);assert.equal(event.stopped,true);assert.equal(f.actions.at(-1),'cancel');assert.equal(f.auth.isPasswordChangeOpen(),false);
 pass('Escape remains an explicit cancel path during a pending password request without waiting for a transport result');
}
{
 for(const transition of [auth=>auth.showLogin(),auth=>auth.showSelect([]),auth=>auth.showCreate(),auth=>auth.hide()]){const f=fixture();await f.auth.ready();f.auth.showPasswordChange();f.secret();f.field('account').value='fixtureaccount';transition(f.auth);assert.equal(f.query('#change-password').hidden,true);for(const name of ['oldPassword','newPassword','repeatPassword'])assert.equal(f.field(name).value,'');assert.equal(f.field('account').value,'fixtureaccount');}
 pass('every login/select/create/world transition hides the password form and clears only its three secret fields');
}
{
 const f=fixture();await f.auth.ready();const form=f.query('#change-password'),entry=f.query('#auth-password-change'),spec=contract.changePassword;assert.equal(form.dataset.authSkin,'national');assert.equal(form.style.backgroundImage,`url(/ui-national/prguse/${prguse.frames['50'].file})`);assert.equal(form.style.left,`${spec.center.left}px`);assert.equal(form.style.top,`${spec.center.top}px`);assert.equal(form.style.width,'420px');assert.equal(form.style.height,'299px');assert.equal(entry.style.backgroundImage,`url(/ui-national/prguse/${prguse.frames['53'].file})`);
 for(const [name,box] of Object.entries(spec.inputs)){const input=f.field(name);assert.equal(input.style.left,`${box.left}px`);assert.equal(input.style.top,`${box.top}px`);assert.equal(input.style.width,`${box.width}px`);assert.equal(input.maxLength,10);assert.equal(input.type,box.masked?'password':'text');}
 pass('national password panel 50 and login entry 53 use source-locked contract geometry without actor offsets');
}
{
 for(const mutate of [library=>library.sourceSha256='wrong',library=>library.indexSha256='wrong',library=>library.frames['50'].file='wrong.png',library=>library.frames['53'].width=1]){const library=plain(prguse);mutate(library);const f=fixture({library});await f.auth.ready();const form=f.query('#change-password'),entry=f.query('#auth-password-change');if(library.frames['50'].file!==prguse.frames['50'].file||library.sourceSha256==='wrong'||library.indexSha256==='wrong')assert.equal(form.dataset.authSkin,'unavailable');if(library.frames['53'].width===1||library.sourceSha256==='wrong'||library.indexSha256==='wrong')assert.equal(entry.dataset.authSkin,'unavailable');}
 pass('wrong source/index identity and mismatched per-frame file/geometry leave the new auth skins unavailable rather than selecting another version');
}
{
 const f=fixture();await f.auth.ready();const entry=f.query('#auth-password-change'),url=`url(/ui-national/prguse/${prguse.frames['53'].file})`;
 entry.emit('pointerenter',{pointerType:'mouse'});entry.emit('pointerdown',{button:0,pointerId:1,pointerType:'mouse'});entry.emit('pointerleave');entry.emit('pointercancel',{pointerId:1});
 assert.equal(entry.style.backgroundImage,url);assert.equal(entry.dataset.nativeFrameStates,'bound');assert.ok(!entry.style.backgroundImage.includes(prguse.frames['54'].file));
 assert.equal(contract.changePassword.loginEntry.pressedFrame,53);assert.equal(prguse.frames['54'].width,296);assert.equal(prguse.frames['54'].height,253);
 pass('password entry hover/press/release keep frame 53 and never reinterpret unrelated 296x253 frame 54 as Downed');
}
{
 const f=fixture();await f.auth.ready();f.auth.showCreate();const button=f.query('#auth-create-ok'),frame=index=>`url(/ui-national/prguse/${prguse.frames[String(index)].file})`;
 assert.equal(button.style.backgroundImage,frame(361));button.emit('pointerenter',{pointerType:'mouse'});assert.equal(button.style.backgroundImage,frame(362));
 button.emit('pointerdown',{button:0,pointerId:7,pointerType:'mouse'});assert.equal(button.style.backgroundImage,frame(363));button.emit('pointerleave');button.emit('pointercancel',{pointerId:7});assert.equal(button.style.backgroundImage,frame(361));
 button.emit('pointerenter',{pointerType:'touch'});button.emit('pointerdown',{button:0,pointerId:8,pointerType:'touch'});assert.equal(button.style.backgroundImage,frame(363));button.emit('pointerup',{pointerId:8});assert.equal(button.style.backgroundImage,frame(361));
 pass('reskinned auth controls replace the fallback painter and restore pressed state on cancellation and touch release');
}
{
 const f=fixture();await f.auth.ready();const entry=f.query('[data-auth-password-entry]');f.auth.setBusy(true);entry.emit('click');assert.equal(f.auth.isPasswordChangeOpen(),false);assert.deepEqual(f.actions,[]);f.auth.setBusy(false);entry.emit('click');assert.equal(f.auth.isPasswordChangeOpen(),true);f.secret();f.auth.showPasswordChange();for(const name of ['oldPassword','newPassword','repeatPassword'])assert.equal(f.field(name).value,'');
 pass('the embedded national login entry stays inert while busy and reopening starts with cleared secret fields');
}

{
 const f=fixture();await f.auth.ready();const form=f.query('#register-form');
 f.query('#register').emit('click');
 assert.equal(f.auth.isRegistrationOpen(),true);assert.equal(form.hidden,false);assert.equal(f.query('[data-auth-login-dialog]').hidden,true);
 assert.equal(f.document.activeElement,f.query('#register-account'));
 f.query('#register-account').value='abc';f.query('#register-password').value='secret1';f.query('#register-confirm').value='secret1';
 let event=form.emit('submit');assert.equal(event.prevented,true);assert.deepEqual(f.actions,[]);assert.match(f.query('#register-status').textContent,/4–10/);assert.equal(f.document.activeElement,f.query('#register-account'));
 f.query('#register-account').value='webuser';f.query('#register-password').value='secret1';f.query('#register-confirm').value='secret2';
 event=form.emit('submit');assert.equal(event.prevented,true);assert.deepEqual(f.actions,[]);assert.match(f.query('#register-status').textContent,/不一致/);assert.equal(f.document.activeElement,f.query('#register-confirm'));
 f.query('#register-confirm').value='secret1';event=form.emit('submit');assert.equal(event.prevented,true);
 assert.deepEqual(f.actions,[['register','webuser','secret1']]);assert.equal(f.query('#account').value,'webuser');assert.equal(f.query('#password').value,'secret1');
 f.auth.setBusy(true);event=f.query('#register-account').emit('keydown',{key:'Escape'});assert.equal(event.prevented,true);assert.equal(f.auth.isRegistrationOpen(),true);f.auth.setBusy(false);
 f.auth.registrationSucceeded();assert.equal(f.auth.isRegistrationOpen(),false);assert.equal(form.hidden,true);assert.equal(f.query('#register-password').value,'');assert.equal(f.query('#register-confirm').value,'');
 pass('new-account form validates confirmation, submits the supported credentials and clears duplicate password drafts only after success');
}

{
 const f=fixture();await f.auth.ready();const account=f.query('#account'),password=f.query('#password'),form=f.query('#login');
 account.value='';account.focus();let event=account.emit('keydown',{key:'Enter'});assert.equal(event.prevented,true);assert.equal(f.document.activeElement,account);
 account.value='PLAYER01';event=account.emit('keydown',{key:'Enter'});assert.equal(event.prevented,true);assert.equal(f.document.activeElement,password);
 account.focus();event=account.emit('keydown',{key:'Enter',isComposing:true});assert.equal(event.prevented,false);assert.equal(f.document.activeElement,account);
 let submits=0;form.addEventListener('submit',()=>submits++);account.emit('compositionstart');event=form.emit('submit');assert.equal(event.prevented,true);assert.equal(event.immediate,true);assert.equal(submits,0);account.emit('compositionend');
 pass('login Enter advances from a nonempty account to password and IME composition cannot advance or submit');
}

{
 const f=fixture();await f.auth.ready();f.query('#register').emit('click');
 const account=f.query('#register-account'),password=f.query('#register-password'),confirm=f.query('#register-confirm');
 let event=account.emit('keydown',{key:'Enter'});assert.equal(event.prevented,true);assert.equal(f.document.activeElement,password);
 event=password.emit('keydown',{key:'Enter'});assert.equal(event.prevented,true);assert.equal(f.document.activeElement,confirm);
 const cancel=f.query('[data-registration-cancel]');account.focus();event=account.emit('keydown',{key:'Tab',shiftKey:true});assert.equal(event.prevented,true);assert.equal(f.document.activeElement,cancel);event=cancel.emit('keydown',{key:'Tab'});assert.equal(event.prevented,true);assert.equal(f.document.activeElement,account);
 for(const marker of [{isComposing:true},{keyCode:229}]){account.focus();event=account.emit('keydown',{key:'Enter',...marker});assert.equal(event.prevented,false);assert.equal(f.document.activeElement,account);assert.equal(f.auth.isRegistrationOpen(),true);}
 f.auth.registrationRejected('该账号已经存在','account');assert.equal(f.document.activeElement,account);assert.equal(f.query('#register-status').textContent,'该账号已经存在');
 password.value='secret1';confirm.value='secret1';event=account.emit('keydown',{key:'Escape'});assert.equal(event.prevented,true);assert.equal(f.auth.isRegistrationOpen(),false);assert.equal(f.document.activeElement,f.query('#register'));assert.equal(password.value,'');assert.equal(confirm.value,'');
 pass('registration keyboard flow advances fields, traps Tab, ignores IME Enter, focuses typed rejection and restores login focus on Escape');
}
{
 const f=fixture({deferred:true});f.auth.showPasswordChange();f.secret();f.release();await f.auth.ready();assert.equal(f.auth.isPasswordChangeOpen(),true);for(const name of ['oldPassword','newPassword','repeatPassword'])assert.equal(f.field(name).value,`fixture-${name}`);
 for(const transition of [auth=>auth.showSelect([]),auth=>auth.showCreate(),auth=>auth.hide()]){const next=fixture({deferred:true});transition(next.auth);const scene=next.element.dataset.authScene,hidden=next.element.hidden;next.release();await next.auth.ready();assert.equal(next.element.dataset.authScene,scene);assert.equal(next.element.hidden,hidden);}
 pass('late initial resources preserve password drafts, select/create scenes and an already hidden world auth overlay');
}
{
 for(const mode of ['fail','wrong']){const f=fixture();f.imageModes.set(`/ui-national/prguse/${prguse.frames['50'].file}`,mode);f.imageModes.set(`/ui-national/prguse/${prguse.frames['53'].file}`,mode);await f.auth.ready();assert.equal(f.query('#change-password').dataset.authSkin,'unavailable');assert.equal(f.query('#auth-password-change').dataset.authSkin,'unavailable');assert.equal(f.query('#auth-password-change').style.visibility,'');assert.equal(f.query('#change-password').style.backgroundImage,'none');f.imageModes.clear();await f.auth.retryPasswordChangeSkin();assert.equal(f.query('#change-password').dataset.authSkin,'national');assert.equal(f.query('#auth-password-change').dataset.authSkin,'national');assert.equal(f.images.length,4);}
 pass('failed PNGs or wrong natural dimensions retain visible unavailable auth controls and an explicit real decode retry can recover');
}
{
 const f=fixture();await f.auth.ready();const url=`/ui-national/prguse/${prguse.frames['50'].file}`;f.imageModes.set(url,'defer');const old=f.auth.retryPasswordChangeSkin();await flush();const image=f.images.at(-2);assert.equal(image.url,url);f.imageModes.delete(url);await f.auth.retryPasswordChangeSkin();assert.equal(f.query('#change-password').dataset.authSkin,'national');image.deliver('fail');await old;assert.equal(f.query('#change-password').dataset.authSkin,'national');
 pass('the actual password skin epoch prevents an older failed image decode from replacing a later successful retry');
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
  const context={exports:{},classicAuth:f.auth,passwordForm:f.query('#change-password'),classicModalLayer:{id:'layer'},classicSurface:{id:'surface'},SystemDialogController:DialogBoundary,WebSocket:Socket,registrationPending:false,location:{protocol:'http:',host:'fixture'},connection:{textContent:''},document:{querySelector:selector=>selector==='#auth-overlay'?f.element:f.query(selector)??panels.get(selector),body:{classList:{contains:()=>context.inWorld,remove:()=>context.inWorld=false}}},window:windows,passwordSceneGeneration:0,reconnectEnabled:true,credentials:{account:'fixture',password:'fixture'},selectedCharacter:'fixture',reconnectTimer:5,reconnectAttempts:0,worldReady:true,inWorld:true,self:1,entities:new Map([[1,{id:1,dead:false}]]),revivePanel:{hidden:true},groupConfirmationSerial:0,groupConfirmationPending:undefined,npcSession:{current:()=>npcStamp,accept:()=>true,reset:()=>{},invalidate:()=>log.push(['npc.invalidate'])},lastSequence:0,mapGeneration:4,agentObserver:{event:()=>{}},intent:'login',account:'fixture',password:'fixture',resumeCharacter:undefined,preloadPlayerLocomotion:()=>Promise.resolve(),loadQuest:()=>{},updateQuest:quest=>log.push(['quest',quest.id]),showAuthNotice:undefined,closeTopWindow:()=>{},toggleClassicWindow:()=>{},selectSkillSlot:()=>{},routeClassicKey:()=>log.push(['route']),bringClassicWindowToFront:()=>{},combatStatus:{textContent:''},pendingAction,pending:{actionId:73},held:{dx:1},rightPointer:{},clickDestination:{x:2,y:2},pursuitTarget:9,pursuitHarvest:true,pursuitGroundItem:10,doorRetry:{},pursuitRejectedCells:new Set(['1,2']),movementRejectedCells:new Set(['2,2']),combatTarget:9,selectedMagic:{magicId:1},combatTimer:undefined,mining:{cancel:()=>log.push(['mining.cancel']),reset:()=>log.push(['mining.reset'])},skillBar:{...component(),cancelSelection:()=>{context.selectedMagic=undefined;}},stopCombat:()=>{context.combatTarget=undefined;},audio:{clear:()=>log.push(['audio.clear'])},magicEffects:{clear:()=>log.push(['magic.clear'])},visuals:new Map(),groundItems:{clear:()=>{}},chatController:component(),classicWindow:{hidden:false},characterWindow:{hidden:false},inventoryWindow:{hidden:false},inventory:component(),itemQuickBar:component(),equipment:component(),paperdoll:component(),characterPanel:{...component(),resources:()=>{}},classicHud:{...component(),skinWindow:()=>{}},shop:service(),repair:service(),storage:service(),returnToTown:{disabled:true},closeNpcSession:()=>log.push(['npc.close']),hideDialogue:()=>log.push(['dialogue.hide']),hideStandaloneUtilityWindows:()=>log.push(['utility.hide']),dialogueElement:{hidden:true},dockChat:()=>{},renderGroup:()=>{},renderAttackMode:()=>{},renderGuild:()=>{},clearTrade:()=>{},renderTargets:()=>{},refreshMiniMapMarkers:()=>{},scheduleReconnect:()=>log.push(['reconnect']),appendChat:()=>log.push(['chat']),setTimeout:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)};
 context.dialogueInputDrafts=new Map();context.dialogueInputPending=undefined;context.setWorldConnectionState=()=>{};context.clearAuthenticationWait=()=>{};context.waitForResponse=()=>{};context.armCurrentAuthWait=undefined;context.automatic=false;
 const controllerContext={exports:{},setTimeout:context.setTimeout,clearTimeout:context.clearTimeout};vm.createContext(controllerContext);vm.runInContext(compile(read('apps/web/src/password-change.ts')),controllerContext);Object.assign(context,controllerContext.exports);
 installPlayUiContext(context);
 const bind=calls('classicAuth','bindPasswordActions');assert.equal(bind.length,1);
 const code=[helper('cancelWorldIntent'),helper('cancelGroupConfirmation'),helper('showAuthNotice'),helper('sendNpcCommand'),helper('worldInputAvailable'),helper('worldInputBlocked'),helper('showDeathWindow'),helper('clearWorld'),variable('systemDialog'),variable('passwordChange'),bind[0].getText(playFile)+';',listener('passwordForm','submit').getText(playFile)+';',listener('window','pagehide').getText(playFile)+';',listener('window','keydown').getText(playFile)+';',`globalThis.dialog=systemDialog;globalThis.change=passwordChange;globalThis.receive=${receive.getText(playFile)};globalThis.closed=${close.getText(playFile)};`].join('\n');
 vm.runInContext(compile(code),context);const active=new Socket();context.active=active;context.socket=active;
 return {f,context,dialogs,log,sent,sockets,active,timers,modal:()=>modal,setModal:value=>modal=value,receive:message=>context.receive({data:JSON.stringify({sequence:++context.lastSequence,mapGeneration:4,message})})};
}
{
 const h=await playHarness(),c=h.context;h.f.query('#password').value='fixture';h.f.query('#auth-password-change').emit('click');assert.equal(c.socket,undefined);assert.equal(h.active.closed,1);assert.equal(c.credentials,undefined);assert.equal(c.selectedCharacter,undefined);assert.equal(c.reconnectEnabled,false);assert.equal(h.f.query('#password').value,'');assert.equal(c.passwordSceneGeneration,1);
 pass('actual play password-open callback invalidates the old world socket before closing it and clears login credentials/reconnect intent');
}
{
 const h=await playHarness(),c=h.context;h.f.auth.showPasswordChange();h.f.field('account').value='testacc';h.f.field('oldPassword').value='oldfixture';h.f.field('newPassword').value='newfixture';h.f.field('repeatPassword').value='newfixture';const event=h.f.query('#change-password').emit('submit');assert.equal(event.prevented,true);assert.equal(c.change.isPending(),true);assert.equal(h.f.query('[data-password-cancel]').disabled,false);const socket=h.sockets.at(-1);socket.message({type:'connected',features:{passwordChange:true}});assert.equal(h.sent.length,1);assert.equal(h.sent[0].type,'changePassword');assert.equal(h.sent[0].requestId,1);assert.equal(Object.hasOwn(h.sent[0],'repeatPassword'),false);assert.equal(c.pendingAction.actionId,73);h.f.query('[data-password-cancel]').emit('click');assert.equal(c.change.isPending(),false);assert.equal(h.f.auth.isPasswordChangeOpen(),false);assert.equal(h.f.field('oldPassword').value,'');socket.message({type:'changePasswordResult',requestId:1,accepted:true,status:'succeeded',reason:0,requestSent:true},2);assert.equal(h.dialogs.length,0);
 pass('actual production submit queues one changePassword JSON request through its isolated controller and pending cancel ignores old typed success without retaining secret fields');
}
{
 const h=await playHarness(),c=h.context;h.f.auth.showPasswordChange();h.f.field('account').value='testacc';h.f.field('oldPassword').value='oldfixture';h.f.field('newPassword').value='newfixture';h.f.field('repeatPassword').value='different';h.f.query('#change-password').emit('submit');assert.equal(h.sockets.length,1);assert.equal(h.dialogs.length,1);assert.deepEqual(h.dialogs[0].spec.buttons,['ok']);h.dialogs.shift().finish('ok');await flush();assert.equal(h.f.document.activeElement?.dataset.passwordField,'repeatPassword');
 vm.runInContext("showAuthNotice('旧提示','oldPassword');",c);const old=h.dialogs.shift();h.f.query('[data-password-cancel]').emit('click');h.f.auth.showPasswordChange();h.f.field('newPassword').focus();old.finish('ok');await flush();assert.equal(h.f.document.activeElement?.dataset.passwordField,'newPassword');
 pass('actual validation notice focuses its current field after OK and a cancelled/reopened scene refuses old notice focus callbacks');
}
{
 const h=await playHarness(),c=h.context;h.f.auth.showPasswordChange();const fields={account:'testacc',oldPassword:'oldfixture',newPassword:'newfixture',repeatPassword:'newfixture'};for(const [field,value] of Object.entries(fields))h.f.field(field).value=value;c.change.submit(fields);h.sockets.at(-1).message({type:'connected',features:{passwordChange:true}});h.sockets.at(-1).message({type:'changePasswordResult',requestId:1,accepted:false,status:'rejected',reason:-2,requestSent:true},2);assert.equal(h.f.auth.isPasswordChangeOpen(),true);assert.match(c.connection.textContent,/锁定/);assert.equal(h.dialogs.length,1);h.dialogs.shift().finish('ok');await flush();assert.equal(h.f.auth.isPasswordChangeOpen(),true);
 c.change.submit(fields);h.sockets.at(-1).message({type:'connected',features:{passwordChange:true}});h.sockets.at(-1).message({type:'changePasswordResult',requestId:2,accepted:true,status:'succeeded',reason:0,requestSent:true},2);assert.equal(h.f.auth.isPasswordChangeOpen(),false);assert.equal(h.f.query('#account').value,'testacc');assert.equal(h.f.field('newPassword').value,'');
 pass('actual rejection reason -2 remains account-lock text while only a matching succeeded reply returns to login and clears password fields');
}
{
 const h=await playHarness(),c=h.context;h.setModal(true);assert.equal(vm.runInContext('worldInputAvailable()',c),false);assert.equal(vm.runInContext('worldInputBlocked()',c),true);assert.equal(vm.runInContext("sendNpcCommand({type:'querySellItem',npcId:101,makeIndex:11})",c),false);const before=h.sent.length;h.f.field('account').emit('keydown',{key:'F9'});h.context.window.emit('keydown',{key:'F9'});assert.equal(h.log.some(row=>row[0]==='route'),false);assert.equal(h.sent.length,before);h.setModal(false);h.f.auth.hide();assert.equal(vm.runInContext('worldInputAvailable()',c),true);assert.equal(vm.runInContext("sendNpcCommand({type:'querySellItem',npcId:101,makeIndex:11})",c),true);assert.equal(h.sent.at(-1).npcSessionId,8);
 pass('actual key route, world availability and NPC sender all prioritize a system modal and resume only with current stamped authority');
}
{
 const h=await playHarness(),c=h.context;const prior=c.pendingAction,stamp=c.npcSession.current();c.receive({data:JSON.stringify({sequence:1,mapGeneration:4,message:{type:'dialogueMessage',text:'系统文字',quests:[{id:'q'}]}})});assert.equal(h.dialogs.length,1);assert.equal(h.dialogs[0].spec.text,'系统文字');assert.equal(h.log.some(row=>row[0]==='quest'),true);assert.equal(h.log.some(row=>['npc.close','npc.invalidate','service.clear','service.reject','inventory.reject'].includes(row[0])),false);assert.equal(c.npcSession.current(),stamp);assert.equal(c.pendingAction,prior);assert.equal(c.held,undefined);
 c.receive({data:JSON.stringify({sequence:2,mapGeneration:4,message:{type:'error',commandType:'login',message:'登录拒绝'}})});assert.equal(c.pendingAction,prior);assert.equal(h.log.some(row=>row[0]==='inventory.reject'),false);assert.equal(h.dialogs.length,2);
 pass('actual 767/772 typed system text applies quests and stops future intent without closing NPC/economic waits; typed auth rejection avoids world pending cleanup');
}
{
 const h=await playHarness(),c=h.context;h.f.auth.showSelect([]);c.receive({data:JSON.stringify({sequence:1,mapGeneration:4,message:{type:'characters',characters:[]}})});h.f.query('[data-auth-exit]').onclick();assert.deepEqual(h.dialogs[0].spec.buttons,['ok','cancel']);h.dialogs.shift().finish('cancel');await flush();assert.equal(h.active.closed,0);h.f.query('[data-auth-exit]').onclick();const old=h.dialogs.shift();c.socket={readyState:1};old.finish('ok');await flush();assert.equal(h.active.closed,0);c.socket=h.active;h.f.query('[data-auth-exit]').onclick();h.dialogs.shift().finish('ok');await flush();assert.equal(h.active.closed,1);assert.equal(c.socket,undefined);assert.equal(c.reconnectEnabled,false);assert.equal(h.f.element.dataset.authScene,'login');
 pass('actual select Exit requires explicit OK and current socket/scene identity; Cancel and old-socket confirmation cannot close a replacement');
}
{
 for(const lifetime of ['showDeathWindow','clearWorld']){const h=await playHarness();h.context.dialog.show({text:'等待确认',buttons:['ok','cancel']});vm.runInContext(`${lifetime}();`,h.context);assert.equal(h.modal(),false);assert.equal(h.log.some(row=>row[0]==='dialog.interrupt'),true);}
 const h=await playHarness(),c=h.context;c.dialog.show({text:'等待',buttons:['ok']});const original=c.active;c.socket={};c.closed();assert.equal(h.modal(),true);assert.equal(h.log.some(row=>row[0]==='npc.invalidate'),false);c.socket=original;c.reconnectEnabled=false;c.credentials=undefined;c.closed();assert.equal(h.modal(),false);assert.equal(h.log.some(row=>row[0]==='npc.invalidate'),true);
 h.f.auth.showPasswordChange();h.f.field('account').value='testacc';h.f.field('oldPassword').value='oldfixture';h.f.field('newPassword').value='newfixture';h.f.field('repeatPassword').value='newfixture';h.f.query('#change-password').emit('submit');assert.equal(c.change.isPending(),true);c.window.emit('pagehide');assert.equal(c.change.isPending(),false);for(const name of ['oldPassword','newPassword','repeatPassword'])assert.equal(h.f.field(name).value,'');assert.equal(c.credentials,undefined);assert.equal(c.change.submit({account:'testacc',oldPassword:'oldfixture',newPassword:'newfixture',repeatPassword:'newfixture'}),false);
 pass('actual death/map/current-close/pagehide interrupt modal decisions and destroy secret request state while a stale socket close cannot touch the new scene');
}

console.log(`TOTAL ${groups} auth action production groups PASS; actual markup/class/resources and play AST with fake DOM/transport, no browser/native claim`);
for(const file of ['apps/web/src/classic-auth.ts','apps/web/src/account-registration.css','apps/web/src/play.ts','apps/web/src/password-change.ts','apps/web/play.html','content/classic-176/auth-actions.json','tests/auth_actions_regression.mjs'])console.log(`SOURCE ${file} ${crypto.createHash('sha256').update(read(file)).digest('hex')}`);
