import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const contract=JSON.parse(read('content/classic-176/system-dialog.json'));
const national=JSON.parse(read('assets/web/ui-national/prguse/library.json'));
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
  deliver(mode='ok'){if(mode==='fail'){this.onerror?.();return;}const file=this.url.split('/').at(-1);const frame=Object.values(national.frames).find(frame=>frame.file===file);this.naturalWidth=mode==='wrong'?1:frame?.width??0;this.naturalHeight=frame?.height??0;this.onload?.();}
 }
 const globals={HTMLElement:Element,Element,Event:FakeEvent,Image,document,localStorage:{getItem:()=>null,setItem:()=>{}},getComputedStyle:document.defaultView.getComputedStyle,requestAnimationFrame:()=>0,Promise,queueMicrotask,setTimeout,clearTimeout};
 const load=file=>{
  if(file.endsWith('.css'))return {};
  if(file.endsWith('.json'))return {default:JSON.parse(read(file))};
  if(file==='apps/web/src/classic-layout.ts')return {classicUiLayout:()=>({})};
  if(modules.has(file))return modules.get(file);
  const context={...globals,exports:{},fetch:async url=>{fetches.push(url);return {ok:true,json:async()=>url==='/ui-national/prguse/library.json'?national:{frames:{}}};},require:specifier=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier))) };vm.createContext(context);
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
  const context={...globals,exports:{},fetch:async url=>{fetches.push(url);return {ok:true,json:async()=>url==='/ui-national/prguse/library.json'?national:{frames:{}}};},require:specifier=>execute(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier)))};vm.createContext(context);
  modules.set(file,context.exports);vm.runInContext(ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context,{filename:file});return context.exports;
 }
 const {SystemDialogController}=execute('apps/web/src/system-dialog.ts'),notifications=[];
 const controller=new SystemDialogController(layer,surface,{onVisibilityChange:value=>notifications.push(value),...options});
 const panel=()=>find(layer,node=>node.classList.contains('classic-system-dialog'));
 const overlay=()=>find(layer,node=>node.dataset.systemDialogOverlay==='true');
 const button=result=>find(panel(),node=>node.dataset.result===result);
 return {document,surface,layer,origin,images,behavior,fetches,notifications,controller,panel,overlay,button,execute,retry:()=>find(panel(),node=>node.className==='system-dialog-retry')};
}
function click(f,result){const button=f.button(result);return fire(button,'click');}
function key(f,name,extra={}){return fire(f.document.activeElement,'keydown',{key:name,...extra});}
const mousePoint=element=>{const bounds=element.getBoundingClientRect();return {clientX:bounds.left+3,clientY:bounds.top+3};};
const track=promise=>{const state={done:false,result:undefined};promise.then(result=>{state.done=true;state.result=result;});return state;};

{
 for(const size of ['horizontal','vertical','small']){const f=fixture();const pending=f.controller.show({text:'系统消息',buttons:['ok'],size});await flush();const variant=contract.variants[size];assert.equal(f.panel().style.width,`${variant.width}px`);assert.equal(f.panel().style.height,`${variant.height}px`);assert.equal(f.panel().style.backgroundImage,`url(/ui-national/prguse/${national.frames[String(variant.frame)].file})`);const centers={horizontal:['174px','210px'],vertical:['272px','120px'],small:['306px','247px']};assert.equal(f.panel().style.left,centers[size][0]);assert.equal(f.panel().style.top,centers[size][1]);assert.equal(f.panel().children.find(n=>n.className==='system-dialog-text').style.lineHeight,'14px');assert.equal(f.panel().dataset.resourceState,'ready');click(f,'ok');assert.equal(await pending,'ok');assert.ok(f.fetches.includes('/ui-national/prguse/library.json'));assert.ok(!f.fetches.some(url=>url.startsWith('/ui/')));}
 pass('three contract sizes use exact national frames at centered canvas coordinates without WIL actor offsets or reference substitution');
}
{
 const f=fixture(),pending=f.controller.showInput({text:'请输入金币数量',buttons:['ok','cancel'],size:'horizontal',input:{label:'丢弃金币数量',maxLength:5,inputMode:'numeric'}});await flush();const input=find(f.panel(),node=>node.tagName==='INPUT');
 assert.ok(input);assert.equal(input.getAttribute('aria-label'),'丢弃金币数量');assert.equal(input.maxLength,5);assert.equal(input.inputMode,'numeric');assert.equal(input.style.left,`${contract.variants.horizontal.input.left}px`);assert.ok(Number.parseFloat(input.style.top)>=Number.parseFloat(f.panel().children.find(n=>n.className==='system-dialog-text').style.top)+Number.parseFloat(f.panel().children.find(n=>n.className==='system-dialog-text').style.height));assert.equal(f.document.activeElement,input);
 input.value='120';const enter=key(f,'Enter');assert.equal(enter.defaultPrevented,true);const accepted=await pending;assert.equal(accepted.result,'ok');assert.equal(accepted.value,'120');assert.equal(f.controller.isOpen(),false);
 const cancel=f.controller.showInput({text:'取消输入',buttons:['ok','cancel'],input:{label:'数量',maxLength:5}});await flush();const second=find(f.panel(),node=>node.tagName==='INPUT');second.value='9';key(f,'Escape');const cancelled=await cancel;assert.equal(cancelled.result,'cancel');assert.equal(cancelled.value,'9');
 assert.throws(()=>f.controller.showInput({text:'无取消',buttons:['ok'],input:{label:'数量',maxLength:5}}),/确定和取消/);
 pass('input prompts preserve focus, numeric input metadata, Enter/Cancel results and return the submitted value through the production dialog');
}
{
 const results=['ok','yes','cancel','no'];
 for(const size of ['horizontal','vertical','small'])for(let mask=1;mask<16;mask++){
  const f=fixture(),buttons=results.filter((_,index)=>mask&(1<<index)),pending=f.controller.show({text:'组合',buttons,size});
  const effective=size==='small'&&buttons.length>1?'horizontal':size,variant=contract.variants[effective];assert.equal(f.panel().dataset.dialogSize,effective);
  for(const result of buttons){const element=f.button(result),left=Number.parseFloat(element.style.left),top=Number.parseFloat(element.style.top);assert.ok(left>=0&&top>=0&&left+80<=variant.width&&top+34<=variant.height);}
  const selected=buttons.at(-1);click(f,selected);assert.equal(await pending,selected);f.controller.destroy();
 }
 pass('all fifteen result combinations across three requested sizes have contract-owned full-size valid hit areas and explicit results');
}
{
 for(const result of ['ok','yes']){const f=fixture(),pending=f.controller.show({text:'单按钮',buttons:[result]});const event=key(f,'Enter');assert.equal(event.defaultPrevented,true);assert.equal(await pending,result);assert.equal(f.controller.interceptKey(event),true);}
 for(const result of ['cancel','no']){const f=fixture(),pending=track(f.controller.show({text:'单按钮',buttons:[result]}));key(f,'Enter');await flush();assert.equal(pending.done,false);f.controller.interrupt();}
 pass('only sole OK and sole Yes accept Enter and the same consumed event cannot fall into a newly opened gameplay route');
}
{
 for(const buttons of [['ok','cancel'],['yes','no'],['ok','yes','no','cancel']]){const f=fixture(),pending=track(f.controller.show({text:'双按钮',buttons}));for(const result of buttons){f.button(result).focus();const event=key(f,'Enter');if(!event.defaultPrevented)click(f,result);assert.equal(event.defaultPrevented,true);assert.equal(f.button(result).type,'button');const up=fire(f.button(result),'keyup',{key:'Enter'});assert.equal(up.defaultPrevented,true);}await flush();assert.equal(pending.done,false);f.controller.interrupt();}
 pass('focused multi-button Enter prevents native implicit button/form activation on keydown and keyup instead of choosing a default result');
}
{
 for(const buttons of [['ok','cancel'],['cancel'],['yes','cancel','no']]){const f=fixture(),pending=f.controller.show({text:'取消',buttons});key(f,'Escape');assert.equal(await pending,'cancel');}
 for(const buttons of [['ok'],['yes','no']]){const f=fixture(),state=track(f.controller.show({text:'不可取消',buttons}));key(f,'Escape');await flush();assert.equal(state.done,false);assert.equal(f.controller.isOpen(),true);f.controller.interrupt();}
 pass('Escape resolves Cancel only when that exact result is offered and cannot generic-close an OK-only or Yes/No prompt');
}
{
 const f=fixture();let worldKeys=0;f.document.addEventListener('keydown',()=>worldKeys++);const state=track(f.controller.show({text:'模态',buttons:['ok','cancel']}));
 for(const name of ['F1','F9','F10','F11','1','ArrowUp',' ','@','!','/','h']){const event=key(f,name);assert.equal(event.defaultPrevented,true);assert.equal(f.controller.interceptKey(event),true);}
 for(const extra of [{repeat:true},{ctrlKey:true},{altKey:true},{metaKey:true}])key(f,'Enter',extra);await flush();assert.equal(state.done,false);assert.equal(worldKeys,0);f.controller.interrupt();
 pass('active modal capture consumes every gameplay key including collaboration-window keys while repeats and modified defaults cannot finish a decision');
}
{
 const f=fixture(),state=track(f.controller.show({text:'输入法',buttons:['ok','cancel']}));fire(f.button('ok'),'compositionstart');
 for(const name of ['Enter','Escape']){const event=key(f,name);assert.equal(event.defaultPrevented,false);assert.equal(event.stopped,true);}
 fire(f.button('ok'),'compositionend');for(const extra of [{isComposing:true},{keyCode:229}]){const event=key(f,'Enter',extra);assert.equal(event.defaultPrevented,false);}await flush();assert.equal(state.done,false);key(f,'Escape');await flush();assert.equal(state.result,'cancel');
 pass('composition lifecycle and both browser IME markers preserve composition defaults without confirmation, cancellation or gameplay propagation');
}
{
 for(const extra of [{isComposing:true},{keyCode:229}]){const f=fixture(),state=track(f.controller.show({text:'无compositionstart',buttons:['ok','cancel']}));key(f,'Enter',extra);fire(f.button('ok'),'click',{detail:0});await flush();assert.equal(state.done,false);const button=f.button('ok'),point=mousePoint(button);fire(button,'pointerdown',point);fire(button,'pointerup',point);click(f,'ok');await flush();assert.equal(state.result,'ok');}
 const f=fixture(),pending=f.controller.show({text:'辅助点击',buttons:['ok']});fire(f.button('ok'),'click',{detail:0});assert.equal(await pending,'ok');
 pass('an IME marker without a composition lifecycle cannot turn a zero-detail implicit click into confirmation while fresh pointer and direct assistive activation remain usable');
}
{
 const f=fixture(),pending=f.controller.show({text:'焦点',buttons:['ok','yes','no','cancel']});assert.equal(f.document.activeElement,f.button('ok'));key(f,'Tab');assert.equal(f.document.activeElement,f.button('yes'));key(f,'Tab',{shiftKey:true});assert.equal(f.document.activeElement,f.button('ok'));key(f,'Tab',{shiftKey:true});assert.equal(f.document.activeElement,f.button('cancel'));
 f.origin.focus();assert.equal(f.document.activeElement,f.button('ok'));click(f,'cancel');await pending;assert.equal(f.document.activeElement,f.origin);
 pass('proposed Tab/Shift-Tab loop and outside-focus guard stay inside the prompt and restore a still-visible origin after the final result');
}
{
 for(const invalidate of [element=>element.remove(),element=>element.hidden=true,element=>element.disabled=true,element=>element.style.display='none']){const f=fixture(),pending=f.controller.show({text:'恢复',buttons:['ok']});invalidate(f.origin);click(f,'ok');await pending;assert.notEqual(f.document.activeElement,f.origin);}
 const f=fixture(),other=f.document.createElement('input');f.document.body.append(other);const pending=f.controller.show({text:'明确焦点',buttons:['ok'],restoreFocus:other});click(f,'ok');await pending;assert.equal(f.document.activeElement,other);
 pass('focus restoration rejects removed, hidden, disabled and visually absent targets and accepts an explicit valid target');
}
{
 const f=fixture(),a=f.controller.show({text:'A',buttons:['ok']}),b=track(f.controller.show({text:'B',buttons:['yes','no']}));click(f,'ok');assert.equal(await a,'ok');assert.equal(f.panel().children.find(child=>child.className==='system-dialog-text').textContent,'B');assert.equal(f.controller.isOpen(),true);assert.notEqual(f.document.activeElement,f.origin);assert.equal(b.done,false);click(f,'no');await flush();assert.equal(b.result,'no');assert.equal(f.document.activeElement,f.origin);assert.deepEqual(f.notifications,[true,true,false]);
 pass('queued decisions resolve in order, remain continuously modal and restore the original focus only after the queue drains');
}
{
 const f=fixture(),a=f.controller.show({text:'A',buttons:['ok']}),old=f.button('ok'),b=f.controller.show({text:'B',buttons:['cancel']}),c=f.controller.show({text:'C',buttons:['yes'],policy:'replace'});assert.equal(await a,'interrupted');assert.equal(await b,'interrupted');fire(old,'click');assert.equal(f.controller.isOpen(),true);click(f,'yes');assert.equal(await c,'yes');
 pass('replace explicitly interrupts the old active and queued requests and disconnected old button callbacks cannot complete the replacement');
}
{
 for(const reason of ['map','death','disconnect','scene']){const f=fixture(),a=f.controller.show({text:reason,buttons:['ok']}),b=f.controller.show({text:'等待',buttons:['cancel']});f.controller.interrupt();assert.equal(await a,'interrupted');assert.equal(await b,'interrupted');assert.equal(f.controller.isOpen(),false);assert.equal(f.overlay().hidden,true);assert.equal(f.document.activeElement,f.origin);}
 pass('the shared interruption boundary settles every pending request as interrupted without fabricating an OK/Cancel or owning another component');
}
{
 const f=fixture(),pending=f.controller.show({text:'销毁',buttons:['ok']}),old=f.button('ok');f.controller.destroy();f.controller.destroy();assert.equal(await pending,'interrupted');assert.equal(await f.controller.show({text:'之后',buttons:['ok']}),'interrupted');fire(old,'click');assert.equal(f.layer.children.length,0);assert.equal((f.document.listeners.get('keydown')??[]).length,0);
 pass('destroy is idempotent, removes modal listeners/DOM and resolves later show calls without resurrecting an old request');
}
{
 const f=fixture(),pending=f.controller.show({text:'<img src=x onerror=bad()>\n第二行',buttons:['ok']});assert.equal(f.panel().children.find(child=>child.className==='system-dialog-text').textContent,'<img src=x onerror=bad()>\n第二行');assert.equal(f.panel().getAttribute('role'),'dialog');assert.equal(f.panel().getAttribute('aria-modal'),'true');click(f,'ok');await pending;
 assert.throws(()=>f.controller.show({text:'无',buttons:[]}),/按钮无效/);assert.throws(()=>f.controller.show({text:'重复',buttons:['ok','ok']}),/按钮无效/);
 pass('message content remains literal text with dialog semantics and invalid/duplicate result sets fail before opening another modal');
}
{
 const f=fixture(),pending=f.controller.show({text:'按下',buttons:['ok']});await flush();const button=f.button('ok'),point=mousePoint(button);fire(button,'pointerdown',point);await flush();assert.equal(button.dataset.pressed,'true');assert.equal(button.style.backgroundImage,`url(/ui-national/prguse/${national.frames['362'].file})`);fire(button,'pointerup',point);await flush();assert.equal(button.dataset.pressed,'false');assert.equal(button.style.backgroundImage,`url(/ui-national/prguse/${national.frames['361'].file})`);click(f,'ok');assert.equal(await pending,'ok');
 pass('primary pointer press/release uses the original normal/Downed pair and completes exactly once through the current click');
}
{
 for(const result of ['ok','yes','cancel','no']){const f=fixture(),pending=f.controller.show({text:'状态帧',buttons:[result]});await flush();const button=f.button(result),point=mousePoint(button),spec=contract.buttons[result];fire(button,'pointerdown',point);await flush();assert.equal(button.style.backgroundImage,`url(/ui-national/prguse/${national.frames[String(spec.pressedFrame)].file})`);fire(button,'pointerup',point);await flush();assert.equal(button.style.backgroundImage,`url(/ui-national/prguse/${national.frames[String(spec.normalFrame)].file})`);click(f,result);click(f,result);assert.equal(await pending,result);assert.equal(f.controller.isOpen(),false);}
 pass('all four semantic results retain their exact two source frames and a repeated click cannot complete a second request');
}
{
 const f=fixture(),state=track(f.controller.show({text:'移出',buttons:['ok']})),button=f.button('ok'),point=mousePoint(button);fire(button,'pointerdown',point);fire(button,'pointermove',{...point,clientX:-100});assert.equal(button.dataset.pressed,'false');fire(button,'pointerup',{...point,clientX:-100});click(f,'ok');await flush();assert.equal(state.done,false);fire(button,'pointerdown',point);fire(button,'pointerup',point);click(f,'ok');await flush();assert.equal(state.result,'ok');
 pass('dragging a pressed button outside its exact hit area cancels that click while a fresh valid press remains usable');
}
{
 for(const cancel of ['pointercancel','lostpointercapture','blur']){const f=fixture(),state=track(f.controller.show({text:'取消按下',buttons:['ok']})),button=f.button('ok'),point=mousePoint(button);fire(button,'pointerdown',point);if(cancel==='blur')f.document.defaultView.dispatchEvent(new FakeEvent('blur'));else fire(button,cancel);assert.equal(button.dataset.pressed,'false');assert.equal(button.capture,undefined);click(f,'ok');await flush();assert.equal(state.done,false);f.controller.interrupt();}
 pass('pointercancel, lost capture and window blur release Downed state and prevent the abandoned press from resolving a decision');
}
{
 const f=fixture(),state=track(f.controller.show({text:'其他按钮',buttons:['ok']})),button=f.button('ok');fire(button,'pointerdown',{...mousePoint(button),button:2});assert.notEqual(button.dataset.pressed,'true');key(f,' ');await flush();assert.equal(state.done,false);f.controller.interrupt();
 pass('secondary pointer presses and DOM Space do not invent a new original confirmation shortcut');
}
{
 const f=fixture(),a=f.controller.show({text:'拖动A',buttons:['ok']}),handle=f.panel().children.find(child=>child.dataset.windowDragHandle);const point=mousePoint(handle);fire(handle,'pointerdown',point);fire(f.panel(),'pointermove',{...point,clientX:-2000,clientY:-2000});assert.equal(f.panel().style.left,'0px');assert.equal(f.panel().style.top,'0px');assert.equal(f.panel().classList.contains('window-dragging'),true);
 const b=f.controller.show({text:'拖动B',buttons:['yes'],policy:'replace'});assert.equal(await a,'interrupted');const left=f.panel().style.left;fire(f.panel(),'pointermove',{...point,clientX:2000,clientY:2000});assert.equal(f.panel().style.left,left);assert.equal(f.panel().classList.contains('window-dragging'),false);click(f,'yes');await b;
 pass('actual shared window-drag clamps to the canvas and replacement cancels old drag listeners before a stale move can reposition the new prompt');
}
{
 for(const session of [{national:new Map(),fallback:new Map([['Prguse',national]])},{national:new Map([['prguse',{...national,sourceSha256:'wrong'}]])}]){const f=fixture({loadSession:async()=>session}),pending=f.controller.show({text:'缺失',buttons:['ok']});await flush();assert.equal(f.panel().dataset.resourceState,'failed');assert.equal(f.retry().hidden,false);assert.equal(f.panel().style.backgroundImage,'none');click(f,'ok');assert.equal(await pending,'ok');}
 pass('missing or wrongly identified national manifests keep an actionable text fallback and never borrow a reference/generic system frame');
}
{
 for(const mode of ['fail','wrong']){const f=fixture(),url=`/ui-national/prguse/${national.frames['360'].file}`;f.behavior.set(url,mode);const pending=f.controller.show({text:'失败重试',buttons:['ok','cancel']});await flush();assert.equal(f.panel().dataset.resourceState,'failed');assert.equal(f.retry().hidden,false);f.behavior.delete(url);fire(f.retry(),'click');await flush();assert.equal(f.panel().dataset.resourceState,'ready');assert.equal(f.panel().dataset.skinned,'true');assert.equal(f.retry().hidden,true);assert.equal(f.images.filter(image=>image.url===url).length,2);click(f,'cancel');await pending;}
 pass('PNG network failure and invalid decoded dimensions show a retry control and explicit retry evicts only failed image work');
}
{
 const resolvers=[];const f=fixture({loadSession:()=>new Promise(resolve=>resolvers.push(resolve))}),a=f.controller.show({text:'旧资源',buttons:['ok']});const old=f.button('ok'),b=f.controller.show({text:'新资源',buttons:['yes'],policy:'replace'});assert.equal(await a,'interrupted');resolvers[0]({national:new Map([['prguse',national]])});await flush();assert.equal(f.panel().dataset.resourceState,'loading');assert.equal(old.dataset.skinned,undefined);resolvers[1]({national:new Map([['prguse',national]])});await flush();assert.equal(f.panel().dataset.resourceState,'ready');click(f,'yes');await b;
 pass('late resource fulfillment applies only to the newest request and cannot reskin a detached old button');
}
{
 const f=fixture(),pending=f.controller.show({text:'旧按下资源',buttons:['ok']});await flush();const pressedUrl=`/ui-national/prguse/${national.frames['362'].file}`;f.behavior.set(pressedUrl,'defer');const button=f.button('ok'),point=mousePoint(button);fire(button,'pointerdown',point);fire(button,'pointerup',point);await flush();const old=f.images.find(image=>image.url===pressedUrl);old.deliver();await flush();assert.equal(button.dataset.pressed,'false');assert.equal(button.style.backgroundImage,`url(/ui-national/prguse/${national.frames['361'].file})`);click(f,'ok');await pending;
 pass('late Downed-frame decode cannot overwrite the normal frame after pointer release');
}
{
 const f=fixture(),url=`/ui-national/prguse/${national.frames['360'].file}`;f.behavior.set(url,'defer');const pending=f.controller.show({text:'旧PNG',buttons:['ok']});await flush();const image=f.images.find(image=>image.url===url);f.controller.interrupt();const before=f.panel().dataset.resourceState;image.deliver('fail');await flush();assert.equal(await pending,'interrupted');assert.equal(f.overlay().hidden,true);assert.equal(f.panel().dataset.resourceState,before);assert.equal(f.retry().hidden,true);
 pass('an interrupted late PNG error cannot reopen the overlay, expose retry or mutate its settled presentation');
}
{
 const changed=structuredClone(national);changed.frames['361'].file=national.frames['363'].file;
 const f=fixture({loadSession:async()=>({national:new Map([['prguse',changed]]),fallback:new Map()})});const pending=f.controller.show({text:'相同尺寸错误帧',buttons:['ok']});await flush();
 assert.equal(f.button('ok').dataset.skinned,'false');assert.equal(f.button('ok').style.backgroundImage,'none');assert.equal(f.panel().dataset.resourceState,'failed');click(f,'ok');assert.equal(await pending,'ok');
 const shifted=structuredClone(national);shifted.frames['360'].offsetY+=1;const g=fixture({loadSession:async()=>({national:new Map([['prguse',shifted]]),fallback:new Map()})});const next=g.controller.show({text:'偏移错误',buttons:['ok']});await flush();assert.equal(g.panel().dataset.resourceState,'failed');assert.equal(g.images.length,0);click(g,'ok');assert.equal(await next,'ok');
 pass('a same-size button file substitution and changed source anchor cannot bypass the exact frame contract with a matching library source hash');
}
{
 const f=fixture(),gold=contract.inputProfiles.gold,pending=f.controller.showInput({text:gold.text,buttons:['ok'],input:{profile:'gold',label:'金币数量',maxLength:5,inputMode:'numeric'}});await flush();
 const input=find(f.panel(),node=>node.tagName==='INPUT');assert.equal(input.style.left,'35px');assert.equal(input.style.top,'69px');assert.equal(input.style.width,'382px');assert.equal(input.style.height,'22px');assert.equal(input.style.background,'#000000');assert.equal(input.style.color,'#ffffff');assert.equal(f.panel().dataset.inputProfile,'gold');assert.equal(f.button('cancel'),undefined);
 key(f,'Escape');assert.equal(f.controller.isOpen(),true);
 for(const [name,extra] of [['3',{}],['Backspace',{}],['ArrowLeft',{}],['a',{ctrlKey:true}]]){const event=key(f,name,extra);assert.equal(event.defaultPrevented,false);assert.equal(event.immediate,true);}
 input.value='0';key(f,'Enter');assert.equal((await pending).value,'0');
 const next=f.controller.showInput({text:'普通名字',buttons:['ok','cancel'],input:{label:'角色名',maxLength:10}});await flush();assert.equal(f.panel().dataset.inputProfile,'');const generic=find(f.panel(),node=>node.tagName==='INPUT');assert.equal(generic.style.left,'85px');assert.equal(generic.style.background,undefined);assert.match(find(f.panel(),node=>node.className==='system-dialog-text').style.fontFamily,/SimSun/);key(f,'Escape');assert.equal((await next).result,'cancel');
 assert.throws(()=>f.controller.showInput({text:gold.text,buttons:['ok','cancel'],input:{profile:'gold',label:'金币数量',maxLength:5}}),/只提供确定/);
 pass('same-version gold profile has one OK, black input, ignored Escape and working edit defaults; subsequent generic prompts restore their own profile');f.controller.destroy();
}
{
 const f=fixture(),{GoldDropController}=f.execute('apps/web/src/gold-drop.ts'),bag=f.document.createElement('section'),coin=f.document.createElement('button'),amountOutput=f.document.createElement('output'),world=f.document.createElement('canvas');bag.append(coin,amountOutput);f.surface.append(bag,world);const sent=[];
 const controller=new GoldDropController(coin,bag,world,{amountOutput,available:()=>!f.controller.isOpen(),prompt:request=>f.controller.showInput(request),send:amount=>{sent.push(amount);return true;},status:()=>{}});controller.setGold(100);
 fire(coin,'click');const down=fire(world,'pointerdown');assert.equal(down.immediate,true);assert.equal(f.controller.isOpen(),false);fire(world,'pointerup');await flush();assert.equal(f.controller.isOpen(),true);assert.equal(controller.debugState().promptPending,true);
 find(f.panel(),node=>node.tagName==='INPUT').value='20';key(f,'Enter');await flush();assert.deepEqual(sent,[20]);assert.equal(controller.debugState().pending.amount,20);assert.equal(amountOutput.textContent,'100');controller.rejected('安全区禁止丢弃');assert.equal(controller.debugState().pending,undefined);
 pass('actual gold and system-dialog controllers integrate without synthetic drag cancellation invalidating the quantity request, and preserve authority on rejection');controller.destroy();f.controller.destroy();
}
console.log(`TOTAL ${groups} system dialog production groups PASS; fake DOM/network/image inputs, no browser or native runtime claim`);
for(const file of ['apps/web/src/system-dialog.ts','apps/web/src/system-dialog.css','content/classic-176/system-dialog.json','tests/system_dialog_regression.mjs'])console.log(`SOURCE ${file} ${crypto.createHash('sha256').update(read(file)).digest('hex')}`);
