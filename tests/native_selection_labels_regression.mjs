import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {installPlayUiContext} from './helpers/play_ui_context.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const contract=JSON.parse(read('content/classic-176/selection-actions.json'));
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const flush=async()=>{for(let i=0;i<3;i++)await new Promise(resolve=>setImmediate(resolve));};
const plain=value=>JSON.parse(JSON.stringify(value));let groups=0;const pass=text=>{groups++;console.log('PASS '+text);};
function fixture(){
 const preparations=[],paints=[],pageEvents={};
 const document={defaultView:{addEventListener:(name,fn)=>{pageEvents[name]=fn;}},createElement:tag=>new Element(tag)};
 class Element{
  constructor(tag='span'){this.tag=tag;this.children=[];this.style={};this.dataset={};this.hidden=false;this.isConnected=true;this.className='';this.attributes={};this.ownerDocument=document;this._text='';this.classList={add:name=>{this.className+=' '+name;}};}
  set textContent(value){this.children=[];this._text=value;}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.isConnected=false;}
  setAttribute(key,value){this.attributes[key]=value;}removeAttribute(key){delete this.attributes[key];}
 }
 const ctx=vm.createContext({exports:{},require:specifier=>{
  if(specifier.endsWith('.json'))return {default:contract};
  if(specifier==='./native-ui-font')return {loadNativeUiFont:async()=>({measure:text=>text==='热血传奇'?48:text.length*6,prepare:text=>new Promise((resolve,reject)=>preparations.push({text,resolve,reject})),paint:(canvas,text,options)=>{canvas.width=options.width;canvas.height=options.height;paints.push({canvas,text,options});}})};
  throw Error(specifier);
 }});
 vm.runInContext(compile(read('apps/web/src/native-selection-labels.ts')),ctx);
 const root=new Element('div'),scene=new Element('div'),title=new Element();root.dataset.authScene='select';
 const slots=[0,1].map(index=>({index,name:new Element(),level:new Element(),job:new Element()}));
 const values=[['Mir35448bf1','29','武士'],['Tao905','7','道士']];
 const assign=()=>slots.forEach((slot,i)=>['name','level','job'].forEach((key,j)=>{slot[key].textContent=values[i][j];}));assign();
 return {root,scene,title,slots,preparations,paints,pageEvents,values,assign,labels:new ctx.exports.NativeSelectionLabels(root,scene,title)};
}
const canvases=element=>element.children.filter(child=>child.tag==='canvas');
const retries=f=>f.scene.children.filter(child=>child.tag==='button');
{
 const f=fixture();f.labels.show('热血传奇',f.slots);await flush();assert.equal(f.preparations.length,1);assert.match(f.preparations[0].text,/Mir35448bf1\n29\n武士/);f.preparations.shift().resolve();await flush();
 assert.equal(f.paints.length,7);assert.equal(f.title.hidden,false);assert.equal(f.title.style.top,'7px');
 const title=f.paints.find(p=>p.text==='热血传奇');assert.deepEqual(plain(title.options),{width:800,height:18,left:381,top:1,lineHeight:18,color:'#ffffff',outline:true});
 const first=f.slots[0];assert.equal(first.name.style.left,'76px');assert.equal(first.name.style.top,'45px');assert.equal(first.level.style.top,'74px');assert.equal(first.job.style.top,'104px');assert.equal(first.name.style.width,'684px');
 const second=f.slots[1];assert.equal(second.name.style.left,'80px');assert.equal(second.name.style.top,'47px');assert.equal(second.name.style.width,'130px');
 assert.equal(first.name.attributes['aria-label'],'Mir35448bf1');assert.equal(canvases(first.name)[0].attributes['aria-hidden'],'true');
 pass('actual component paints target slot1 origins/native 武士 and measured title center with whole-surface clipping; slot2 is explicitly reference-only');
}
{
 const f=fixture();f.labels.show('旧服',f.slots);await flush();const old=f.preparations.shift();f.values[0]=['新人物','30','法师'];f.assign();f.labels.show('新服',f.slots);await flush();f.preparations.shift().resolve();await flush();old.resolve();await flush();
 assert.equal(f.paints.length,7);assert.equal(f.title.attributes['aria-label'],'新服');assert.equal(f.slots[0].name.attributes['aria-label'],'新人物');
 f.assign();f.labels.show('热血传奇',f.slots);await flush();const pending=f.preparations.shift();f.labels.stop();pending.resolve();await flush();assert.equal(f.title.hidden,true);assert.equal(canvases(f.slots[0].name).length,0);assert.equal(f.slots[0].name.attributes['aria-label'],undefined);
 pass('new role/title revision wins and stopping a scene clears pixels/literals before old asynchronous callbacks finish');
}
{
 const f=fixture();f.labels.show('热血传奇',f.slots);await flush();f.preparations.shift().reject(Error('原客户端文字素材载入失败，请重试'));await flush();assert.equal(retries(f).length,1);assert.equal(canvases(f.title).length,0);assert.equal(f.slots[0].job.attributes['aria-label'],'武士');assert.match(retries(f)[0].attributes['aria-label'],/载入失败/);
 const old=retries(f)[0];old.onclick();await flush();f.preparations.shift().resolve();await flush();assert.equal(retries(f).length,0);assert.equal(f.paints.length,7);assert.equal(f.slots[0].name.attributes['aria-label'],'Mir35448bf1');old.onclick();await flush();assert.equal(f.preparations.length,0);
 pass('one explicit scene retry restores all unchanged literal values, evicts its old generation and cannot run an old retry again');
}
{
 const f=fixture();f.labels.show('热血传奇',f.slots);await flush();const request=f.preparations.shift();f.root.dataset.authScene='login';request.reject(Error('offline'));await flush();assert.equal(retries(f).length,0);
 const g=fixture();g.labels.show('热血传奇',g.slots);await flush();g.slots[1].job.isConnected=false;g.preparations.shift().resolve();await flush();assert.equal(g.paints.length,0);
 const h=fixture();h.labels.show('热血传奇',h.slots);await flush();h.pageEvents.pagehide();h.preparations.shift().resolve();await flush();assert.equal(h.title.hidden,true);assert.equal(h.paints.length,0);
 const k=fixture();k.root.hidden=true;k.labels.show('热血传奇',k.slots);await flush();assert.equal(k.preparations.length,0);assert.equal(k.root.hidden,true);
 pass('scene exit, detached labels, pagehide and hidden roots discard stale graphics/failures without revealing auth UI');
}
{
 const f=fixture();f.root.dataset.authBusy='true';f.labels.show('热血传奇',f.slots);await flush();f.preparations.shift().reject(Error('offline'));await flush();const retry=retries(f)[0];assert.equal(retry.disabled,true);retry.onclick();await flush();assert.equal(f.preparations.length,0);
 const g=fixture();g.labels.show('',[]);await flush();assert.equal(g.title.hidden,true);assert.equal(g.preparations.length,0);
 g.labels.show('热血传奇',[]);await flush();g.preparations.shift().resolve();await flush();assert.equal(g.paints.length,1);
 pass('in-flight auth cannot retry graphics and an empty role list still paints its accepted server title');
}
{
 const src=ts.createSourceFile('auth.ts',read('apps/web/src/classic-auth.ts'),ts.ScriptTarget.Latest,true);
 const cls=src.statements.find(n=>ts.isClassDeclaration(n)&&n.name.text==='ClassicAuth');
 const names=['showSelect','showLogin','hideEntryScenes','selectedCharacterName'];
 const body=cls.members.filter(n=>names.includes(n.name?.getText(src))).map(n=>n.getText(src)).join('\n');
 const context=vm.createContext({exports:{}});vm.runInContext(compile('class Harness {serverName="";selected=0;characters=[];root={hidden:false,dataset:{}};loginScene={};selectScene={};createForm={};selectionLabels={stop(){}};portraitAnimation={stop(){}};entryScenesRevision=0;closeRegistrationView(){};hidePasswordChange(){};bind(){};renderSlots(){this.renderedServer=this.serverName;}'+body+'} exports.Harness=Harness;'),context);
 const h=new context.exports.Harness();h.showSelect([{name:'人物',level:29,job:0,sex:0}],undefined,'热血传奇');assert.equal(h.renderedServer,'热血传奇');h.showSelect([]);assert.equal(h.renderedServer,'热血传奇');h.showLogin();assert.equal(h.serverName,'');h.showSelect([]);assert.equal(h.renderedServer,'');
 pass('production ClassicAuth retains accepted title for same-session refresh/reselection and clears it on return to login');
}
{
 const calls=[],active={readyState:1};const ctx={selectedServer:'热血传奇',sessionGeneration:2,selectionRevision:0,socket:active,WebSocket:{OPEN:1},connection:{},preloadPlayerLocomotion:async()=>{},classicAuth:{setBusy(){},setDeleteEnabled(){},showSelect:(list,handlers,title)=>calls.push({list,handlers,title})},characterDelete:{interrupt(){},isBusy:()=>false},logout:{isBusy:()=>false},systemDialog:{isOpen:()=>false},gatewayFeatures:{characterDeletion:true}};
 installPlayUiContext(ctx);ctx.showCharacterSelection(active,[{name:'人物',level:29,job:0,sex:0}]);assert.equal(calls[0].title,'热血传奇');assert.equal(calls[0].list[0].name,'人物');
 pass('actual production accepted-character-list handler supplies the selected server title without a hardcoded production sample');
}
console.log(`${groups} native selection label regression groups passed`);
