import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const contract=JSON.parse(read('content/classic-176/client-settings.json')),national=JSON.parse(read('assets/web/ui-national/prguse/library.json'));
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const plain=value=>JSON.parse(JSON.stringify(value)),flush=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));};
let groups=0;const pass=text=>{groups++;console.log(`PASS ${text}`);};
class Target{listeners=new Map();addEventListener(type,fn){this.listeners.set(type,[...(this.listeners.get(type)??[]),fn]);}removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(value=>value!==fn));}emit(type,extra={}){const event={type,target:this,key:'',button:0,repeat:false,isComposing:false,keyCode:0,shiftKey:false,prevented:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};for(const fn of this.listeners.get(type)??[])fn(event);this[`on${type}`]?.(event);return event;}}
class Element extends Target{
 constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.parentElement=null;this.style={};this.dataset={};this.attributes=new Map();this.className='';this.hidden=false;this.disabled=false;this.value='';this.checked=false;this.classList={contains:name=>this.className.split(' ').includes(name)};}
 append(...nodes){for(const node of nodes){node.remove();node.parentElement=this;this.children.push(node);}}
 remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(value=>value!==this);this.parentElement=null;}}
 get isConnected(){return this===this.ownerDocument.body||Boolean(this.parentElement?.isConnected);}
 setAttribute(name,value){this.attributes.set(name,String(value));}getAttribute(name){return this.attributes.get(name);}
 matches(selector){return selector.split(',').some(value=>{value=value.trim();if(value==='[hidden]')return this.hidden;if(value.startsWith('.'))return this.classList.contains(value.slice(1));if(value==='[data-window-drag-handle]')return this.dataset.windowDragHandle!==undefined;return value.toUpperCase()===this.tagName;});}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)??null;}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 focus(){if(this.isConnected&&!this.closest('[hidden]')&&!this.disabled)this.ownerDocument.activeElement=this;}
 getBoundingClientRect(){return {left:Number.parseFloat(this.style.left)||0,top:Number.parseFloat(this.style.top)||0,width:Number.parseFloat(this.style.width)||800,height:Number.parseFloat(this.style.height)||600};}
}
function harness(){
 const document=new Target(),window=new Target(),saved=new Map(),instances=[],images=[],deferred=[];document.defaultView=window;document.hidden=false;document.createElement=tag=>new Element(tag,document);document.body=document.createElement('body');document.activeElement=document.body;window.getComputedStyle=()=>({zIndex:'0'});
 const surface=document.createElement('div'),layer=document.createElement('div'),origin=document.createElement('button');document.body.append(surface,origin);surface.append(layer);origin.focus();
 let imageMode='ok',playMode='ok';
 class Image{set src(url){this.url=url;images.push(this);if(imageMode==='defer')return;queueMicrotask(()=>this.deliver(imageMode));}deliver(mode='ok'){if(mode==='fail'){this.onerror?.();return;}const frame=Object.values(national.frames).find(value=>value.file===this.url.split('/').at(-1));this.naturalWidth=mode==='wrong'?1:frame.width;this.naturalHeight=frame.height;this.onload?.();}}
 class Audio extends Target{constructor(url){super();this.url=url;this.paused=true;this.currentTime=0;instances.push(this);}cloneNode(){return new Audio(this.url);}play(){this.paused=false;if(playMode==='defer')return new Promise((resolve,reject)=>deferred.push({audio:this,resolve,reject}));return Promise.resolve();}pause(){this.paused=true;}}
 const globals={document,window,HTMLElement:Element,Image,Audio,queueMicrotask,localStorage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},getComputedStyle:window.getComputedStyle},modules=new Map();
 function load(file){if(file.endsWith('.css'))return {};if(file.endsWith('.json'))return {default:JSON.parse(read(file))};if(!file.endsWith('.ts'))file+='.ts';if(modules.has(file))return modules.get(file);const context={...globals,exports:{},require:specifier=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier)))};vm.createContext(context);modules.set(file,context.exports);vm.runInContext(compile(read(file)),context,{filename:file});return context.exports;}
 const {GameAudio}=load('apps/web/src/game-audio.ts'),{DisplaySettings,ClientSettingsView}=load('apps/web/src/client-settings.ts'),{LogoutController,LogoutWaitingView}=load('apps/web/src/logout.ts'),{routeClassicKey}=load('apps/web/src/classic-input.ts');
 const audio=new GameAudio(origin),display=new DisplaySettings(),logoutCalls=[],visibility=[];let canLogout=true,library=national;
 const session=()=>Promise.resolve({national:new Map([['prguse',library]])});
 const settings=new ClientSettingsView(layer,surface,{audio,display,canLogout:()=>canLogout,logout:mode=>logoutCalls.push(mode),onVisibilityChange:value=>visibility.push(value),loadSession:session,retrySession:session});
 return {load,document,window,surface,layer,origin,saved,audio,display,settings,LogoutController,LogoutWaitingView,routeClassicKey,logoutCalls,visibility,images,instances,deferred,imageMode:value=>imageMode=value,playMode:value=>playMode=value,library:value=>library=value,canLogout:value=>canLogout=value,query:selector=>layer.querySelector(selector),input:name=>layer.querySelectorAll('input,select').find(value=>value.dataset.setting===name),button:mode=>layer.querySelectorAll('button').find(value=>value.dataset.logoutMode===mode)};
}
function logoutHarness(){const h=harness(),sends=[],waits=[],accepted=[],results=[],statuses=[];let available=true,generation=2,mapGeneration=7,confirmResult='ok',confirm;
 const controller=new h.LogoutController({available:()=>available,mapGeneration:()=>mapGeneration,sessionGeneration:()=>generation,confirm:()=>confirmResult==='defer'?new Promise(resolve=>confirm=resolve):Promise.resolve(confirmResult),send:request=>{sends.push(plain(request));return true;},onWaiting:request=>waits.push(plain(request)),onAccepted:request=>accepted.push(plain(request)),onResult:state=>results.push(plain(state)),status:text=>statuses.push(text)});
 return {...h,controller,sends,waits,accepted,results,statuses,available:value=>available=value,generation:value=>generation=value,confirmResult:value=>confirmResult=value,confirm:value=>confirm(value),reply:(state,extra={})=>controller.handleState({type:'logoutState',logoutId:sends.at(-1)?.logoutId,mode:sends.at(-1)?.mode,state,sessionGeneration:3,...extra})};}
{
 const h=logoutHarness();h.confirmResult('cancel');assert.equal(await h.controller.request('reselect'),false);assert.equal(h.sends.length,0);assert.equal(h.waits.length,0);h.available(false);await h.controller.request('login');assert.equal(h.sends.length,0);assert.match(h.statuses.at(-1),/不支持/);pass('cancel and unavailable connection never send or publish a logout wait');
}
{
 const h=logoutHarness();h.confirmResult('defer');const first=h.controller.request('reselect');assert.equal(h.controller.isBusy(),true);assert.equal(await h.controller.request('login'),false);h.confirm('ok');await first;assert.deepEqual(h.sends,[{type:'logout',mode:'reselect',logoutId:1,mapGeneration:7}]);assert.equal(h.waits.length,1);assert.equal(await h.controller.request('reselect'),false);pass('one explicit confirmation produces one stamped request; repeated modal and waiting requests cannot duplicate');
}
{
 const h=logoutHarness();h.confirmResult('defer');const first=h.controller.request('reselect');h.controller.interrupt();h.confirm('ok');assert.equal(await first,false);assert.equal(h.sends.length,0);h.confirmResult('ok');await h.controller.request('login');assert.equal(h.sends.at(-1).logoutId,1);pass('interrupted old confirmation cannot start a later transition');
}
{
 const h=logoutHarness();await h.controller.request('reselect');for(const extra of [{logoutId:2},{mode:'login'},{sessionGeneration:1},{sessionGeneration:3.5},{characters:null}])assert.equal(h.reply('characters',{characters:[],...extra}),false);assert.equal(h.controller.isWaiting(),true);assert.equal(h.results.length,0);assert.equal(h.reply('waiting'),true);assert.equal(h.reply('characters',{characters:[{name:'B'}]}),true);assert.equal(h.controller.isWaiting(),false);assert.equal(h.results[0].characters[0].name,'B');assert.equal(h.reply('characters',{characters:[]}),false);pass('wrong ID/mode/generation and malformed characters are ignored; one correlated real list terminates the wait');
}
{
 const h=logoutHarness();await h.controller.request('reselect');assert.equal(h.controller.reject({logoutId:1,mode:'login'}),false);assert.equal(h.controller.reject({logoutId:1,mode:'reselect',message:'拒绝'}),true);assert.equal(h.results[0].requiresLogin,false);await h.controller.request('login');assert.equal(h.sends.at(-1).logoutId,2);assert.equal(h.controller.reject({logoutId:1,mode:'reselect'}),false);h.reply('waiting');assert.equal(h.controller.reject({logoutId:2,mode:'login'}),false);assert.equal(h.controller.isWaiting(),true);h.reply('login');assert.equal(h.results.length,2);pass('typed rejection matches only unaccepted current request; old and post-waiting errors cannot cancel accepted exit');
}
{
 const h=logoutHarness();await h.controller.request('reselect');assert.equal(h.controller.disconnected(),true);assert.equal(h.results[0].state,'failed');assert.equal(h.results[0].requiresLogin,true);assert.match(h.results[0].message,/未确认/);assert.equal(h.controller.disconnected(),false);pass('disconnect terminates local waiting as unknown result requiring login, never as save success');
}
{
 for(const hint of [{},{requiresLogin:false}]){const h=logoutHarness();await h.controller.request('reselect');h.reply('waiting');h.reply('failed',hint);assert.equal(h.results[0].requiresLogin,true);assert.equal(h.controller.isWaiting(),false);}pass('a failed wire transition cannot restore retired world even when requiresLogin is missing or false');
}
{
 const h=logoutHarness();await h.controller.request('reselect');assert.equal(h.controller.isAccepted(),false);assert.equal(h.accepted.length,0);h.generation(3);assert.equal(h.reply('waiting',{sessionGeneration:2}),false);h.reply('waiting');h.reply('waiting');assert.equal(h.controller.isAccepted(),true);assert.equal(h.accepted.length,1);pass('actual acceptance callback runs only once at the current envelope generation; local confirmation is a separate phase');
}
{
 const h=harness();h.settings.show();await flush();const panel=h.query('.client-settings-panel');assert.equal(panel.dataset.skinState,'national');assert.equal(panel.dataset.layoutEvidence,'proposed');assert.equal(panel.style.width,'416px');assert.equal(panel.style.top,'126px');assert.match(panel.style.backgroundImage,/402\.2b8c/);assert.match(h.button('reselect').style.backgroundImage,/136\./);assert.equal(panel.style.backgroundPosition,undefined);assert.deepEqual([contract.entry.x,contract.entry.y,contract.entry.width,contract.entry.height],[710,10,44,24]);pass('actual settings use locked national full board and exit label pixels without actor offsets; fitted layout stays proposed and entry stays above the native main panel');
}
{
 const h=harness();h.settings.show();await flush();h.canLogout(false);h.settings.refreshAvailability();h.button('reselect').onclick();assert.equal(h.logoutCalls.length,0);h.canLogout(true);h.settings.refreshAvailability();h.button('reselect').emit('pointerdown');assert.match(h.button('reselect').style.backgroundImage,/137\./);h.button('reselect').emit('pointercancel');assert.match(h.button('reselect').style.backgroundImage,/136\./);h.button('login').onclick();assert.deepEqual(h.logoutCalls,['login']);h.settings.hide();h.button('login').onclick();assert.equal(h.logoutCalls.length,1);pass('feature gate disables exits; pressed/cancel state uses original pair and hidden old click cannot submit');
}
{
 const h=harness();h.settings.show();await flush();let event=h.origin.emit('keydown',{key:'Tab'});h.settings.interceptKey(event);assert.equal(event.prevented,true);assert.notEqual(h.document.activeElement,h.origin);event=h.origin.emit('keydown',{key:'Escape',isComposing:true});h.settings.interceptKey(event);assert.equal(h.settings.isOpen(),true);event=h.origin.emit('keydown',{key:'Escape'});h.settings.interceptKey(event);assert.equal(h.settings.isOpen(),false);assert.equal(h.document.activeElement,h.origin);pass('settings Tab stays inside actual controls, IME Escape is left alone, valid Escape restores visible focus');
}
{
 const h=harness();h.settings.show();h.origin.hidden=true;h.settings.hide();assert.notEqual(h.document.activeElement,h.origin);h.origin.hidden=false;h.origin.focus();h.settings.show();h.origin.remove();h.settings.hide();assert.notEqual(h.document.activeElement,h.origin);pass('hidden or detached restore target is not focused when closing settings');
}
{
 const h=harness();h.library({...national,sourceSha256:'wrong'});h.settings.show();await flush();assert.equal(h.query('.client-settings-panel').dataset.skinState,'unavailable');assert.equal(h.query('.client-settings-retry').hidden,false);assert.match(h.query('.client-settings-status').textContent,/仍可使用/);h.library(national);h.query('.client-settings-retry').onclick();await flush();assert.equal(h.query('.client-settings-panel').dataset.skinState,'national');pass('wrong source identity fails visibly and explicit retry recovers the same controls');
}
{
 const h=harness();h.imageMode('defer');h.settings.show();await flush();const old=[...h.images];h.settings.hide();h.imageMode('ok');h.settings.show();await flush();assert.equal(h.query('.client-settings-panel').dataset.skinState,'national');for(const image of old)image.deliver('fail');await flush();assert.equal(h.query('.client-settings-panel').dataset.skinState,'national');h.settings.destroy();assert.equal(h.layer.children.length,0);pass('late old PNG failure cannot replace reopened skin; destroyed settings remove subscriptions and DOM');
}
{
 const h=harness();h.display.set({minimapMode:'expanded',chatLogVisible:false});assert.deepEqual(plain(h.display.get()),{minimapMode:'expanded',chatLogVisible:false});const {DisplaySettings}=h.load('apps/web/src/client-settings.ts');assert.deepEqual(plain(new DisplaySettings().get()),plain(h.display.get()));h.saved.set(contract.persistence.display,'{"minimapMode":"bad","chatLogVisible":"bad"}');assert.deepEqual(plain(new DisplaySettings().get()),{minimapMode:'compact',chatLogVisible:true});pass('real display preferences persist supported modes and reject invalid saved fields');
}
{
 const h=harness();h.audio.setPhase('login');h.audio.play('swing',.8);const music=h.instances.find(value=>!value.paused&&value.loop),effect=h.instances.find(value=>!value.paused&&!value.loop);h.settings.show();h.input('musicVolume').value='25';h.input('musicVolume').oninput();h.input('effectsVolume').value='50';h.input('effectsVolume').oninput();assert.equal(music.volume,.25);assert.equal(effect.volume,.8*.5);h.audio.play('swing',.6);assert.equal(h.instances.at(-1).volume,.3);h.window.emit('blur');assert.equal(music.paused,true);h.window.emit('focus');assert.equal(music.volume,.25);assert.equal(music.paused,false);pass('slider changes affect current BGM/effects, new voices and real blur/focus media recovery');
}
{
 const h=harness();h.audio.setVolumes({musicVolume:.2,effectsVolume:.4});const {GameAudio}=h.load('apps/web/src/game-audio.ts');const second=new GameAudio(h.document.createElement('button'));assert.deepEqual(plain(second.preferences()),{enabled:true,musicVolume:.2,effectsVolume:.4});h.playMode('defer');h.audio.setPhase('select');h.audio.setEnabled(false);for(const pending of h.deferred)pending.resolve();await flush();assert.equal(h.instances.filter(value=>!value.paused).length,0);assert.equal(h.saved.get('mir2-audio'),'off');h.playMode('ok');h.audio.setEnabled(true);assert.equal(h.instances.at(-1).volume,.2);pass('audio settings persist separate channels and mute invalidates late media completion while unmute reuses current preferences');
}
{
 const h=harness(),calls=[];const actions={inWorld:()=>false,sessionInWorld:()=>true,sound:()=>calls.push('sound'),logout:mode=>calls.push(mode),worldBlocked:()=>true};
 for(const values of [{key:'F12'},{key:'F12',repeat:true},{key:'F12',ctrlKey:true,altKey:true},{key:'x',altKey:true},{key:'q',altKey:true},{key:'q',altKey:true,isComposing:true}])h.routeClassicKey(h.origin.emit('keydown',values),actions);
 assert.deepEqual(calls,['sound','reselect','login']);const input=h.document.createElement('input');h.routeClassicKey(input.emit('keydown',{key:'x',altKey:true}),actions);assert.deepEqual(calls,['sound','reselect','login']);pass('actual key route preserves ordinary F12, excludes extended CtrlAltF12, allows exit on dead-world UI, and respects IME/text input');
}
{
 const h=harness(),view=new h.LogoutWaitingView(h.layer);view.show('等待回应');const event=h.origin.emit('keydown',{key:'F9'});assert.equal(view.interceptKey(event),true);assert.equal(event.prevented,true);view.hide();assert.equal(view.interceptKey(h.origin.emit('keydown',{key:'F9'})),false);view.destroy();assert.equal(view.element.isConnected,false);pass('shared production waiting overlay captures game keys and releases them only after hide');
}
console.log(`TOTAL ${groups} logout/settings production groups PASS; VM DOM/media/transport boundaries, no browser/native claim`);
for(const file of ['apps/web/src/logout.ts','apps/web/src/client-settings.ts','apps/web/src/game-audio.ts','apps/web/src/classic-input.ts','content/classic-176/client-settings.json','tests/logout_settings_regression.mjs'])console.log(`SOURCE ${file} ${crypto.createHash('sha256').update(read(file)).digest('hex')}`);
