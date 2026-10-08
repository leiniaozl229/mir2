import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const contract=JSON.parse(read('content/classic-176/skill-key-dialog.json'));
const national=JSON.parse(read('assets/web/ui-national/prguse/library.json'));
const magic=JSON.parse(read('assets/web/ui-national/magic-icons/library.json'));
const allFrames=[...Object.values(national.frames),...Object.values(magic.frames)];
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};

class FakeEvent{
 constructor(type,values={}){Object.assign(this,{type,button:0,pointerId:1,clientX:0,clientY:0,key:'',repeat:false,keyCode:0,isComposing:false,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,detail:1,defaultPrevented:false,bubbles:true},values);}
 preventDefault(){this.defaultPrevented=true;}stopPropagation(){this.stopped=true;}stopImmediatePropagation(){this.stopped=true;this.immediate=true;}
}
class Target{
 listeners=new Map();
 addEventListener(type,fn,capture=false){const list=this.listeners.get(type)??[];list.push({fn,capture:Boolean(capture)});this.listeners.set(type,list);}
 removeEventListener(type,fn,capture=false){this.listeners.set(type,(this.listeners.get(type)??[]).filter(item=>item.fn!==fn||item.capture!==Boolean(capture)));}
 run(event,capture){for(const item of [...(this.listeners.get(event.type)??[])]){if(item.capture!==capture)continue;item.fn(event);if(event.immediate)break;}}
 dispatchEvent(event){event.target??=this;this.run(event,true);if(!event.immediate)this.run(event,false);return !event.defaultPrevented;}
}
class Element extends Target{
 constructor(tag,document){super();this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.parentElement=null;this.style={setProperty(key,value){this[key]=value;}};this.dataset={};this.attributes=new Map();this.className='';this.hidden=false;this.tabIndex=0;this.textContent='';this.disabled=false;this.classList={add:(...names)=>this.className=[...new Set([...this.className.split(' ').filter(Boolean),...names])].join(' '),remove:(...names)=>this.className=this.className.split(' ').filter(name=>!names.includes(name)).join(' '),contains:name=>this.className.split(' ').includes(name)};}
 get isConnected(){return this===this.ownerDocument.body||Boolean(this.parentElement?.isConnected);}
 append(...children){for(const child of children){child.remove();child.parentElement=this;this.children.push(child);}}
 remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}}
 setAttribute(key,value){this.attributes.set(key,String(value));}getAttribute(key){return this.attributes.get(key)??null;}
 contains(node){return node===this||this.children.some(child=>child.contains(node));}
 matches(selector){return selector.split(',').some(part=>{part=part.trim();if(part===':disabled')return this.disabled;if(part==='[hidden]')return this.hidden;if(part==='[inert]')return this.attributes.has('inert');if(part.startsWith('[aria-hidden'))return this.getAttribute('aria-hidden')==='true';if(part.startsWith('[data-window-drag-handle'))return this.dataset.windowDragHandle!==undefined;if(part.startsWith('[draggable'))return this.draggable===true;if(part.startsWith('.'))return this.classList.contains(part.slice(1));return this.tagName===part.toUpperCase();});}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)??null;}
 get offsetWidth(){return Number.parseFloat(this.style.width)||0;}get offsetHeight(){return Number.parseFloat(this.style.height)||0;}
 getBoundingClientRect(){const parent=this.parentElement?.getBoundingClientRect()??{left:0,top:0};const left=parent.left+(Number.parseFloat(this.style.left)||0),top=parent.top+(Number.parseFloat(this.style.top)||0);return {left,top,width:this.offsetWidth,height:this.offsetHeight,right:left+this.offsetWidth,bottom:top+this.offsetHeight};}
 getClientRects(){return this.isConnected&&!this.closest('[hidden]')&&!this.hiddenByStyle()?[this.getBoundingClientRect()]:[];}
 hiddenByStyle(){return this.style.display==='none'||this.style.visibility==='hidden'||Boolean(this.parentElement?.hiddenByStyle());}
 focus(){this.ownerDocument.activeElement=this;fire(this,'focusin');}setPointerCapture(id){this.capture=id;}releasePointerCapture(){this.capture=undefined;}
 compareDocumentPosition(){return 4;}
 dispatchEvent(event){return fire(this,event.type,event);}
}
class Document extends Target{
 constructor(){super();this.defaultView=new Target();this.defaultView.getComputedStyle=element=>({display:element.hiddenByStyle()?'none':'block',visibility:element.style.visibility??'visible',zIndex:element.style.zIndex??'0'});this.body=new Element('body',this);this.activeElement=this.body;}
 createElement(tag){return new Element(tag,this);}
}
function fire(target,type,values={}){
 const event=values instanceof FakeEvent?values:new FakeEvent(type,values);event.target??=target;
 const document=target.ownerDocument,path=[];for(let node=target;node;node=node.parentElement)path.push(node);
 if(document)document.run(event,true);
 for(const node of [...path].reverse()){if(event.stopped)break;node.run(event,true);}
 for(const node of path){if(event.stopped)break;node.run(event,false);}
 if(document&&!event.stopped)document.run(event,false);
 return event;
}
const find=(element,predicate)=>predicate(element)?element:element.children.map(child=>find(child,predicate)).find(Boolean);
function fixture(options={}){
 const document=new Document(),surface=document.createElement('div'),layer=document.createElement('div'),origin=document.createElement('input');
 surface.style.width='800px';surface.style.height='600px';document.body.append(surface,origin);surface.append(layer);origin.focus();
 const images=[],behavior=new Map(),modules=new Map(),fetches=[];
 class Image{
  naturalWidth=0;naturalHeight=0;
  set src(url){this.url=url;images.push(this);const mode=behavior.get(url);if(mode==='defer')return;queueMicrotask(()=>this.deliver(mode??'ok'));}
  deliver(mode='ok'){if(mode==='fail'){this.onerror?.();return;}const file=this.url.split('/').at(-1);const frame=allFrames.find(frame=>frame.file===file);this.naturalWidth=mode==='wrong'?1:frame?.width??0;this.naturalHeight=frame?.height??0;this.onload?.();}
 }
 const globals={HTMLElement:Element,Element,Event:FakeEvent,Image,document,localStorage:{getItem:()=>null,setItem:()=>{}},getComputedStyle:document.defaultView.getComputedStyle,requestAnimationFrame:()=>0,Promise,queueMicrotask,setTimeout,clearTimeout};
 const load=file=>{
  if(file.endsWith('.css'))return {};
  if(file.endsWith('.json'))return {default:JSON.parse(read(file))};
  if(file==='apps/web/src/classic-layout.ts')return {classicUiLayout:()=>({})};
  if(modules.has(file))return modules.get(file);
  const context={...globals,exports:{},fetch:async url=>{fetches.push(url);return {ok:true,json:async()=>url==='/ui-national/prguse/library.json'?national:url==='/ui-national/magic-icons/library.json'?magic:{frames:{}}};},require:specifier=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier))) };vm.createContext(context);
  const source=read(file),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  modules.set(file,context.exports);vm.runInContext(compiled,context,{filename:file});return context.exports;
 };
 // TS sources import extensionless modules, just as the production bundler does.
 const originalLoad=load;
 const resolve=file=>file.endsWith('.json')||file.endsWith('.css')||file.endsWith('.ts')?file:`${file}.ts`;
 // Each module receives the same real classic-ui and window-drag implementations.
 function execute(file){
  file=resolve(file);if(file.endsWith('.json')||file.endsWith('.css')||file==='apps/web/src/classic-layout.ts')return originalLoad(file);
  if(modules.has(file))return modules.get(file);
  const context={...globals,exports:{},fetch:async url=>{fetches.push(url);return {ok:true,json:async()=>url==='/ui-national/prguse/library.json'?national:url==='/ui-national/magic-icons/library.json'?magic:{frames:{}}};},require:specifier=>execute(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier)))};vm.createContext(context);
  modules.set(file,context.exports);vm.runInContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context,{filename:file});return context.exports;
 }
 const {SkillKeyDialogController}=execute('apps/web/src/skill-key-dialog.ts'),notifications=[];
 const controller=new SkillKeyDialogController(layer,{onVisibilityChange:value=>notifications.push(value),...options});
 const panel=()=>find(layer,node=>node.classList.contains('classic-skill-key-dialog'));
 const overlay=()=>find(layer,node=>node.className==='classic-skill-key-overlay');
 const button=result=>find(panel(),node=>node.dataset.skillKey===String(result));
 return {document,surface,layer,origin,images,behavior,fetches,notifications,controller,panel,overlay,button,execute,retry:()=>find(panel(),node=>node.className==='skill-key-dialog-retry')};
}

const skill=(key=0)=>({magicId:1,key,name:'基本剑术',effect:0});
const key=(f,name)=>fire(f.document.activeElement,'keydown',{key:name});
const ok=f=>find(f.panel(),node=>node.className==='skill-key-dialog-ok');
{
 const f=fixture(),pending=f.controller.show(skill());await flush();
 assert.equal(f.panel().style.left,'212px');assert.equal(f.panel().style.top,'210px');assert.equal(f.panel().style.width,'376px');assert.equal(f.panel().dataset.resourceState,'ready');
 assert.equal(f.panel().style.backgroundImage,'url(/ui-national/prguse/'+national.frames['229'].file+')');
 assert.equal(f.button(50).style.left,'65px');assert.equal(f.button(50).style.top,'82px');assert.equal(f.button(0).getAttribute('aria-pressed'),'true');
 assert.deepEqual([53,54,55,56].map(key=>f.button(key).style.left),['170px','202px','234px','266px']);
 assert.equal(find(f.button(0),node=>node.tagName==='IMG').hidden,true);
 for(const name of ['Escape','Enter','F1','F9','F10','F11','w','1']){const event=key(f,name);assert.equal(event.defaultPrevented,true);assert.equal(event.immediate,true);assert.equal(f.controller.isOpen(),true);}
 fire(f.button(50),'click');assert.equal(f.controller.isOpen(),true);assert.equal(f.button(50).getAttribute('aria-pressed'),'true');
 const image=find(f.button(50),node=>node.tagName==='IMG');assert.equal(image.hidden,false);assert.equal(image.src,'/ui-national/prguse/'+national.frames['235'].file);assert.equal(image.style.left,'1px');
 fire(ok(f),'click');assert.equal(await pending,50);assert.equal(f.controller.isOpen(),false);assert.equal(f.document.activeElement,f.origin);
 pass('native modal uses exact frame, selected key draft and local controls; Escape/Enter/world shortcuts are blocked until mouse OK');
}
{
 const f=fixture(),pending=f.controller.show(skill(50));await flush();fire(f.button(0),'click');assert.equal(f.controller.isOpen(),true);fire(ok(f),'click');assert.equal(await pending,0);
 assert.deepEqual(f.notifications,[true,false]);assert.ok(!f.fetches.some(url=>url.startsWith('/ui/')));
 pass('None is an explicit zero draft, closes only on OK, and uses national resources');
}
{
 const f=fixture(),pending=f.controller.show(skill());await flush();const button=f.button(56),box=button.getBoundingClientRect();
 fire(button,'pointerdown',{pointerId:7,clientX:box.left+2,clientY:box.top+2});fire(button,'pointerup',{pointerId:7,clientX:box.right+1,clientY:box.top+2});fire(button,'click');assert.equal(button.getAttribute('aria-pressed'),'false');
 const confirm=ok(f),b=confirm.getBoundingClientRect();fire(confirm,'pointerdown',{pointerId:8,clientX:b.left+2,clientY:b.top+2});fire(confirm,'pointercancel',{pointerId:8});fire(confirm,'click');assert.equal(f.controller.isOpen(),true);
 fire(confirm,'pointerdown',{pointerId:9,clientX:b.left+2,clientY:b.top+2});fire(confirm,'pointerup',{pointerId:9,clientX:b.left+2,clientY:b.top+2});fire(confirm,'click');assert.equal(await pending,0);
 pass('captured drag outside and pointer cancellation cannot select or confirm; next valid press recovers');
}
{
 const f=fixture(),first=f.controller.show(skill());await flush();fire(f.button(50),'click');f.document.defaultView.dispatchEvent(new FakeEvent('blur'));assert.equal(await first,'interrupted');
 const second=f.controller.show(skill(49));await flush();const third=f.controller.show(skill(56));assert.equal(await second,'interrupted');await flush();assert.equal(f.button(56).getAttribute('aria-pressed'),'true');
 f.controller.destroy();assert.equal(await third,'interrupted');assert.equal(await f.controller.show(skill()),'interrupted');
 pass('blur, replacement and destroy discard stale drafts instead of manufacturing confirmed bindings');
}
{
 let release;const f=fixture({loadSession:()=>new Promise(resolve=>{release=resolve;})}),pending=f.controller.show(skill());f.controller.interrupt();assert.equal(await pending,'interrupted');release({national:new Map([['prguse',national],['magic-icons',magic]])});await flush();assert.equal(f.controller.isOpen(),false);assert.equal(f.panel().dataset.resourceState,'loading');
 pass('late asset loading cannot resurrect an interrupted modal');
}
{
 const altered=JSON.parse(JSON.stringify(national));altered.frames['229'].file='wrong.png';const f=fixture({loadSession:async()=>({national:new Map([['prguse',altered],['magic-icons',magic]])}),retrySession:async()=>({national:new Map([['prguse',national],['magic-icons',magic]])})});
 const pending=f.controller.show(skill());await flush();assert.equal(f.panel().dataset.resourceState,'failed');assert.equal(ok(f).disabled,true);assert.equal(f.retry().hidden,false);fire(f.retry(),'click');await flush();assert.equal(f.panel().dataset.resourceState,'ready');fire(ok(f),'click');assert.equal(await pending,0);
 pass('wrong frame identity fails closed; retry restores exact assets and safe confirmation');
}
{
 const f=fixture(),url='/ui-national/prguse/'+national.frames['229'].file;f.behavior.set(url,'wrong');
 const pending=f.controller.show(skill());await flush();assert.equal(f.panel().dataset.resourceState,'failed');assert.equal(ok(f).disabled,true);
 f.behavior.set(url,'ok');fire(f.retry(),'click');await flush();assert.equal(f.panel().dataset.resourceState,'ready');fire(ok(f),'click');assert.equal(await pending,0);
 pass('decoded PNG dimension mismatch evicts the failed probe and permits a valid resource retry');
}
for(const [index,frame] of Object.entries(contract.frames)){const actual=national.frames[index];assert.equal(actual.file,frame.file);const bytes=fs.readFileSync(path.join(root,'assets/web/ui-national/prguse',frame.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),frame.sha256);}
pass('all locked dialog/key frames match current national exported bytes');
console.log('Skill key dialog groups: '+groups);
