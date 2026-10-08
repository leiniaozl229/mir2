import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root=process.cwd();
const json=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const sourceFiles=['classic-ui','classic-layout','icon-frames','skills','classic-hud'];
const source=sourceFiles.map(name=>fs.readFileSync(path.join(root,`apps/web/src/${name}.ts`),'utf8')
 .replace(/^import .*;\r?\n/gm,'').replace(/^export \{.*\} from .*;\r?\n/gm,'')).join('\n');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.style={setProperty(name,value){this[name]=value;}};this.hidden=false;this.disabled=false;this.listeners=new Map();this.queries=new Map();const classes=new Set();this.classList={add(...values){values.forEach(value=>classes.add(value));},remove(value){classes.delete(value);},toggle(value,state){if(state)classes.add(value);else classes.delete(value);},contains:value=>classes.has(value)};}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(name,value){this.attributes[name]=value;}
 removeAttribute(name){delete this.attributes[name];}
 getAttribute(name){return this.attributes[name];}
 addEventListener(name,callback){const callbacks=this.listeners.get(name)??[];callbacks.push(callback);this.listeners.set(name,callbacks);}
 emit(name,event={}){for(const callback of this.listeners.get(name)??[])callback(event);this['on'+name]?.(event);}
 querySelector(selector){if(!this.queries.has(selector))this.queries.set(selector,new Element());return this.queries.get(selector);}
 querySelectorAll(selector){const result=[];const visit=element=>{for(const child of element.children){if(typeof child!=='object')continue;if(selector==='.skill-icon'&&child.className==='skill-icon')result.push(child);visit(child);}};visit(this);return result;}
 setPointerCapture(id){this.capture=id;}
 getBoundingClientRect(){return {left:10,top:20,right:42,bottom:50};}
}
function harness(failIcons=false){
 const document=new Element();document.body=new Element('body');document.createElement=tag=>{const element=new Element(tag);if(tag==='canvas')element.getContext=()=>({drawImage(){},getImageData:()=>({data:Uint8ClampedArray.from([0,0,0,state.alpha])})});return element;};document.hidden=false;
 const window=new Element(),requests=[],timers=new Map();let nextTimer=0;
 const state={failIcons,alpha:255};
 const context={exports:{},document,window,NativeHudLabels:class{constructor(_root,level,location){this.level=level;this.location=location;}setLevel(value){this.level.textContent=value;}setLocation(value){if(this.location)this.location.textContent=value;}},Image:class extends Element{constructor(){super('img');}},
  activeSources:json('content/classic-176/active-asset-sources.json'),iconUsage:json('content/classic-176/icon-usage.json'),nationalProfile:json('content/classic-176/national-ui-profile.json'),uiLayout:json('content/classic-176/ui-layout.json'),uiInteractions:json('content/classic-176/ui-interactions.json'),skillInput:json('content/classic-176/skill-input.json'),
  skinServiceWindow:()=>false,setTimeout:(callback,delay)=>{assert.equal(delay,5000);const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  fetch:async url=>{requests.push(url);if(state.failIcons&&url==='/ui-national/magic-icons/library.json')return {ok:false};const file=path.join(root,'assets/web',url);return fs.existsSync(file)?{ok:true,json:async()=>json(path.relative(root,file))}:{ok:false};}};
 vm.createContext(context);vm.runInContext(compiled,context);
 return {...context.exports,document,window,requests,state,timers};
}
const skill=(magicId,effect,key=49,name='技能'+magicId)=>({magicId,effect,key,name,level:1,currentTrain:0,effectType:0,spell:1,power:1,trainLevels:[],maxTrain:[],job:0,delay:0,defSpell:0,defPower:0,maxPower:0,defMaxPower:0,description:''});
const find=(element,className)=>{if(element.className===className)return element;for(const child of element.children??[]){if(typeof child==='object'){const found=find(child,className);if(found)return found;}}};
const images=element=>{const result=[];const walk=node=>{if(node.tagName==='img')result.push(node);for(const child of node.children??[])if(typeof child==='object')walk(child);};walk(element);return result;};
const plain=value=>JSON.parse(JSON.stringify(value));
function decoded(image,index=10){const frame=json('assets/web/ui-national/magic-icons/library.json').frames[index];image.naturalWidth=frame.width;image.naturalHeight=frame.height;image.onload();}

{
 const h=harness();
 assert.equal(h.skillIconIndexOf(skill(1,0)),0);assert.equal(h.skillIconIndexOf(skill(1,0),true),1);
 assert.equal(h.skillIconIndexOf(skill(11,5)),10);assert.equal(h.skillIconIndexOf(skill(11,5),true),11);
 const poison=skill(48,27,49,'群体施毒术'),push=skill(48,36,49,'气功波');
 assert.equal(h.skillIconIndexOf(poison),54);assert.equal(h.skillIconIndexOf(push),72);
 assert.equal(h.skillIconIndexOf({...poison,name:'不同名称'}),54);
 for(const effect of [-1,256,1.5,NaN])assert.ok(Number.isNaN(h.skillIconIndexOf(skill(1,effect))));
 console.log('PASS real effect field selects normal/pressed pairs including zero; conflicting ID48/name overrides do not choose icon identity');
}
{
 const h=harness(),element=new Element(),sent=[];
 const bar=new h.SkillBar(element,{select(){},self(){},bind:(...args)=>{sent.push(args);return true;}});bar.replace([skill(11,5)]);await bar.retryIcons();
 const holder=find(element,'skill-icon-button'),normal=images(holder)[0];assert.match(normal.src,/\/10\./);
 holder.emit('pointerdown',{button:0,pointerId:7});const pressed=images(holder)[0];assert.match(pressed.src,/\/11\./);
 holder.emit('pointermove',{pointerId:7,buttons:1,clientX:100,clientY:30});assert.match(images(holder)[0].src,/\/10\./);
 holder.emit('pointermove',{pointerId:7,buttons:1,clientX:20,clientY:30});assert.match(images(holder)[0].src,/\/11\./);
 holder.emit('pointerleave');assert.match(images(holder)[0].src,/\/10\./);
 holder.emit('pointerenter',{pointerId:7,buttons:1});assert.match(images(holder)[0].src,/\/11\./);
 holder.emit('pointerup',{pointerId:7,clientX:20,clientY:30});assert.match(images(holder)[0].src,/\/10\./);
 const generation=bar.iconRenderSerial;pressed.onerror();assert.equal(bar.iconRenderSerial,generation,'discarded pressed image cannot mutate current normal state');
 holder.emit('pointerdown',{button:0,pointerId:8});holder.emit('pointercancel');assert.match(images(holder)[0].src,/\/10\./);
 holder.emit('pointerdown',{button:0,pointerId:9});holder.emit('lostpointercapture');assert.match(images(holder)[0].src,/\/10\./);
 holder.emit('pointerdown',{button:0,pointerId:10});holder.emit('pointerup',{pointerId:10,clientX:100,clientY:30});holder.onclick({detail:1});assert.equal(find(element,'skill-key-editor'),undefined,'captured pointer release outside must not open binding');
 holder.onclick({detail:0});assert.ok(find(element,'skill-key-editor'));assert.equal(sent.length,0,'keyboard activation opens key editor without sending a binding');
 console.log('PASS production skill icon normal/Downed frames and up/leave/reentry/cancel/capture cancellation preserve input semantics');
}
{
 const h=harness(),element=new Element(),selected=[],bound=[];
 const bar=new h.SkillBar(element,{select:skill=>selected.push(skill?.magicId),self(){},bind:(...args)=>{bound.push(args);return true;}});bar.replace([skill(48,36,49,'气功波')]);await bar.retryIcons();
 assert.equal(images(element).length,0);assert.equal(find(element,'skill-icon-missing').textContent,'图标暂缺');assert.equal(find(element,'skill-icon-button').disabled,false);
 assert.equal(bar.selectSlot(0),true);assert.equal(selected.at(-1),48);assert.equal(bar.requestKeyBinding(48,50),true);assert.equal(bound.length,1);assert.equal(bar.debugState().learnedSkills[0].effect,36);
 const other=new h.SkillBar(new Element(),{select(){},self(){},bind:()=>true});other.replace([skill(48,27,49,'群体施毒术')]);await other.retryIcons();assert.match(other.debugState().icons[0].src,/\/54\./);
 const tinyElement=new Element(),tiny=new h.SkillBar(tinyElement,{select(){},self(){},bind:()=>true});tiny.replace([skill(90,33)]);await tiny.retryIcons();assert.equal(images(tinyElement).length,0);assert.equal(tiny.selectSlot(0),true);
 console.log('PASS out-of-range and native tiny skills retain casting selection/key binding; ID48 effect27 and36 remain independently visible/missing');
}
{
 const h=harness(true),element=new Element(),selected=[];
 const bar=new h.SkillBar(element,{select:skill=>selected.push(skill?.magicId),self(){},bind:()=>true});bar.replace([skill(11,5)]);await bar.retryIcons();
 const retry=find(element,'skill-icon-retry');assert.ok(retry);assert.equal(retry.disabled,false);assert.equal(images(element).length,0);
 assert.equal(bar.selectSlot(0),true);const before=plain(bar.debugState().learnedSkills);h.state.failIcons=false;retry.onclick();await bar.retryIcons();
 assert.equal(bar.debugState().selected,11);assert.deepEqual(plain(bar.debugState().learnedSkills),before);assert.equal(h.requests.filter(url=>url==='/ui-national/magic-icons/library.json').length,2);assert.match(images(element)[0].src,/\/10\..*\?retry=2$/);
 console.log('PASS actual classic-ui failed-manifest cache is retried explicitly; selected skill and authoritative data survive recovery');
}
{
 const h=harness(),element=new Element();
 const bar=new h.SkillBar(element,{select(){},self(){},bind:()=>true});bar.replace([skill(11,5)]);await bar.retryIcons();
 const stale=images(element)[0];bar.setPending(11);const generation=bar.iconRenderSerial;stale.onerror();assert.equal(bar.iconRenderSerial,generation);assert.equal(find(element,'skill-icon-retry'),undefined);
 const current=images(element)[0];current.onerror();assert.equal(bar.debugState().pending,11);assert.equal(images(element).length,0);assert.ok(find(element,'skill-icon-retry'));
 await bar.retryIcons();assert.equal(bar.debugState().pending,11);assert.equal(find(element,'skill-icon-button').disabled,true);assert.match(images(element)[0].src,/\/10\./);
 bar.resolve();assert.equal(bar.requestKeyBinding(11,50),true);const binding=plain(bar.debugState().binding),timerCount=h.timers.size;images(element)[0].onerror();await bar.retryIcons();assert.deepEqual(plain(bar.debugState().binding),binding);assert.equal(h.timers.size,timerCount);assert.equal(bar.debugState().learnedSkills[0].key,49);
 const old=images(element)[0];bar.clear();const cleared=bar.iconRenderSerial;old.onerror();assert.equal(bar.iconRenderSerial,cleared);assert.equal(bar.debugState().learnedSkills.length,0);
 console.log('PASS PNG error/explicit retry preserve cast and binding waits; callbacks from replaced/cleared renders cannot restore old UI');
}
{
 const h=harness(),rootElement=Object.assign(new Element(),{ownerDocument:h.document}),selected=[];
 const hud=new h.ClassicHud(rootElement,index=>{selected.push(index);return true;});await hud.ready();hud.replaceSkills([skill(11,5,56),skill(48,36,49,'气功波')]);
 const hotbar=rootElement.querySelector('[data-hud-hotbar]');assert.equal(hotbar.children.filter(child=>child.className==='hud-slot').length,8);
 assert.equal(images(hotbar.children[0]).length,0);assert.match(hotbar.children[0].title,/图标暂缺/);assert.match(images(hotbar.children[7])[0].src,/\/10\./);
 hotbar.children[7].onclick();assert.deepEqual(selected,[7]);
 hotbar.children[0].onclick();assert.deepEqual(selected,[7,0]);assert.equal(hud.skills[1].effect,36);
 console.log('PASS real ClassicHud mount and hotbar use the same effect family, keep sparse F1–F8 and allow missing-image skill selection');
}
{
 const h=harness(true),rootElement=Object.assign(new Element(),{ownerDocument:h.document}),selected=[];
 const hud=new h.ClassicHud(rootElement,index=>{selected.push(index);return true;});await hud.ready();hud.replaceSkills([skill(11,5,56)]);hud.selectSkill(11);rootElement.querySelector('[data-hud-hotbar]').children[7].onclick();
 const hotbar=rootElement.querySelector('[data-hud-hotbar]'),retry=find(hotbar,'hud-icon-retry');assert.ok(retry);assert.equal(retry.disabled,false);h.state.failIcons=false;retry.onclick();await hud.retryIcons();
 assert.deepEqual(selected,[7]);assert.equal(hotbar.children[7].classList.contains('selected'),true);assert.equal(hud.skills[0].effect,5);assert.match(images(hotbar.children[7])[0].src,/\/10\..*\?retry=2$/);assert.equal(find(hotbar,'hud-icon-retry'),undefined);
 console.log('PASS HUD explicitly recovers a failed manifest without resetting selected slot or learned skill identity');
}
{
 const h=harness(),rootElement=Object.assign(new Element(),{ownerDocument:h.document});
 const hud=new h.ClassicHud(rootElement,()=>true);await hud.ready();hud.replaceSkills([skill(11,5)]);hud.selectSkill(11);
 const hotbar=rootElement.querySelector('[data-hud-hotbar]'),image=images(hotbar)[0];image.onerror();assert.equal(hotbar.children[0].classList.contains('selected'),true);assert.ok(find(hotbar,'hud-icon-retry'));await hud.retryIcons();assert.equal(hotbar.children[0].classList.contains('selected'),true);assert.equal(find(hotbar,'hud-icon-retry'),undefined);
 image.onerror();assert.equal(find(hotbar,'hud-icon-retry'),undefined,'old PNG failure cannot poison a successful retry');
 const old=images(hotbar)[0];hud.clear();const generation=hud.iconRenderSerial;old.onerror();assert.equal(hud.iconRenderSerial,generation);assert.equal(hotbar.children.some(button=>button.classList.contains('selected')),false);assert.equal(hud.skills.length,0);assert.equal(images(hotbar).length,0);
 console.log('PASS HUD PNG failure/retry preserve selection and old image callbacks cannot repopulate cleared or recovered hotbars');
}
{
 const h=harness(),element=new Element();
 const bar=new h.SkillBar(element,{select(){},self(){},bind:()=>true});bar.replace([skill(11,5)]);await bar.retryIcons();assert.equal(bar.requestKeyBinding(11,50),true);
 const binding=plain(bar.debugState().binding),old=images(element)[0];old.naturalWidth=1;old.naturalHeight=1;old.onload();assert.ok(find(element,'skill-icon-retry'));assert.deepEqual(plain(bar.debugState().binding),binding);
 await bar.retryIcons();h.state.alpha=0;const generation=bar.iconRenderSerial;old.onload();assert.equal(bar.iconRenderSerial,generation,'obsolete decoded image does not poison retry');
 decoded(images(element)[0]);assert.equal(images(element).length,0);assert.equal(find(element,'skill-icon-missing').textContent,'图标暂缺');assert.equal(find(element,'skill-icon-retry'),undefined,'confirmed transparent pixels are missing artwork, not a network retry');
 assert.deepEqual(plain(bar.debugState().binding),binding);assert.equal(h.timers.size,1);bar.rejectKeyBinding();assert.equal(bar.selectSlot(0),true);
 console.log('PASS skills reject decoded dimension mismatches and transparent artwork without releasing binding waits or losing missing-image selection');
}
{
  const h=harness(),rootElement=Object.assign(new Element(),{ownerDocument:h.document}),selected=[],hud=new h.ClassicHud(rootElement,index=>{selected.push(index);return true;});await hud.ready();hud.replaceSkills([skill(11,5)]);hud.selectSkill(11);
 const hotbar=rootElement.querySelector('[data-hud-hotbar]'),old=images(hotbar)[0];old.naturalWidth=1;old.naturalHeight=1;old.onload();assert.ok(find(hotbar,'hud-icon-retry'));assert.equal(hotbar.children[0].classList.contains('selected'),true);await hud.retryIcons();
 h.state.alpha=0;const generation=hud.iconRenderSerial;old.onload();assert.equal(hud.iconRenderSerial,generation);decoded(images(hotbar)[0]);assert.equal(images(hotbar).length,0);assert.match(hotbar.children[0].title,/图标暂缺/);assert.equal(find(hotbar,'hud-icon-retry'),undefined);hotbar.children[0].onclick();assert.deepEqual(selected,[0]);assert.equal(hotbar.children[0].classList.contains('selected'),true);
 console.log('PASS HUD decoded geometry/alpha checks preserve selected skill and ignore old successful-load callbacks after retry');
}
