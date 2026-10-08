import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const layout=JSON.parse(fs.readFileSync(repo+'/content/classic-176/ui-layout.json','utf8'));
const compile=file=>ts.transpileModule(fs.readFileSync(repo+'/apps/web/src/'+file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let groups=0;
function fixture(){
 const art=[],fonts=[],paints=[];
 const document={createElement:tag=>new Element(tag)};
 class Element{
  constructor(tag='div'){this.tag=tag;this.style={};this.attributes={};this.children=[];this.classList={add(){}};this.ownerDocument=document;this.isConnected=true;this._text='';this.ops=[];this.hidden=false;}
  set textContent(value){this.children=[];this._text=value;}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  append(...children){this.children.push(...children);}
  setAttribute(k,v){this.attributes[k]=v;}
  getContext(){return {drawImage:(...op)=>this.ops.push(op)};}
 }
 const context=vm.createContext({exports:{},Error,require:specifier=>{
  if(specifier.endsWith('.json'))return {default:layout};
  if(specifier==='./native-ui-art')return {createNativeUiArtLoader:()=>indices=>new Promise((resolve,reject)=>art.push({indices,resolve:()=>resolve(new Map(indices.map(i=>[i,{index:i}]))),reject}))};
  if(specifier==='./native-ui-font')return {loadNativeUiFont:async()=>({prepare:text=>new Promise((resolve,reject)=>fonts.push({text,resolve,reject})),paint:(canvas,text,options)=>paints.push({canvas,text,options})})};
  throw new Error(specifier);
 }});
 vm.runInContext(compile('native-hud-labels.ts'),context);
 const root=new Element(),level=new Element(),location=new Element();
 const labels=new context.exports.NativeHudLabels(root,level,location);
 return {labels,root,level,location,art,fonts,paints};
}
const canvases=element=>element.children.filter(c=>c.tag==='canvas');
const failures=element=>element.children.filter(c=>c.tag==='button');
{
 const f=fixture();f.labels.setLevel('29');assert.equal(f.level.textContent,'29');f.art.shift().resolve();await flush();
 assert.deepEqual(canvases(f.level)[0].ops.map(op=>[op[0].index,...op.slice(1)]),[[32,8,0],[39,16,0]]);
 f.labels.setLocation('比奇省 338:264');await flush();f.fonts.shift().resolve();await flush();
 assert.equal(f.paints[0].text,'比奇省 338:264');assert.deepEqual(JSON.parse(JSON.stringify(f.paints[0].options)),{width:600,height:18,left:4,top:2,lineHeight:18,color:'#ffffff',outline:true});
 assert.equal(f.location.style.left,'4px');assert.equal(f.location.style.top,'229px');
 console.log('PASS source bitmap digits and four-way outlined location draw at the original design origins');groups++;
}
{
 const f=fixture();f.labels.setLevel('29');const old=f.art.shift();f.labels.setLevel('1');f.art.shift().resolve();await flush();old.resolve();await flush();assert.equal(canvases(f.level).length,1);assert.equal(canvases(f.level)[0].ops[0][0].index,31);
 f.labels.setLocation('旧地图 1:2');await flush();const oldFont=f.fonts.shift();f.labels.setLocation('新地图 3:4');await flush();f.fonts.shift().resolve();await flush();oldFont.resolve();await flush();assert.equal(f.paints.length,1);assert.equal(f.paints[0].text,'新地图 3:4');
 f.labels.setLevel('40');const cleared=f.art.shift();f.labels.setLevel('');cleared.resolve();await flush();assert.equal(canvases(f.level).length,0);assert.equal(f.level.textContent,'');
 console.log('PASS latest level/location generations replace old callbacks and clear invalidates pending digits');groups++;
}
{
 const f=fixture();f.labels.setLevel('29');f.art.shift().reject(new Error('数字离线'));await flush();assert.equal(failures(f.level).length,1);assert.equal(f.level.textContent,'29重试显示');
 failures(f.level)[0].onclick();f.art.shift().resolve();await flush();assert.equal(failures(f.level).length,0);assert.equal(f.level.attributes['aria-label'],'29');assert.equal(canvases(f.level).length,1);
 f.labels.setLocation('比奇省 338:264');await flush();f.fonts.shift().reject(new Error('字形离线'));await flush();assert.equal(failures(f.location).length,1);failures(f.location)[0].onclick();await flush();f.fonts.shift().resolve();await flush();assert.equal(failures(f.location).length,0);assert.equal(canvases(f.location).length,1);
 console.log('PASS explicit independent retry preserves authority and recovers digits/location without changing values');groups++;
}
{
 const f=fixture();f.labels.setLevel('29');f.art.shift().reject(new Error('offline'));await flush();const oldRetry=failures(f.level)[0];f.labels.setLevel('1');const current=f.art.shift();oldRetry.onclick();assert.equal(f.art.length,0);current.resolve();await flush();assert.equal(f.level.attributes['aria-label'],'1');
 console.log('PASS an old retry callback cannot replace a newer confirmed level');groups++;
}
{
 const f=fixture();f.labels.setLevel('29');f.labels.setLocation('比奇省 338:264');await flush();f.root.isConnected=false;f.art.shift().resolve();f.fonts.shift().reject(new Error('offline'));await flush();assert.equal(canvases(f.level).length,0);assert.equal(failures(f.location).length,0);
 const g=fixture();g.root.hidden=true;g.labels.setLevel('29');g.art.shift().resolve();await flush();assert.equal(g.root.hidden,true);
 console.log('PASS detached roots discard late graphics/errors and asynchronous paint never reveals hidden HUD');groups++;
}

// Exercise map title state through the production ClassicHud, with graphics at its boundary.
{
 const source=fs.readFileSync(repo+'/apps/web/src/classic-hud.ts','utf8');
 const node=ts.createSourceFile('hud.ts',source,ts.ScriptTarget.Latest,true);
 const declaration=node.statements.find(s=>ts.isClassDeclaration(s)&&s.name.text==='ClassicHud');
 const methods=['beginMap','mapDescription','position','renderLocation'];
 const code='class Harness {map="0";mapTitle="";x=0;y=0;coords={};root={querySelector:()=>null};nativeLabels={setLocation:value=>{this.location=value;}};'+declaration.members.filter(m=>methods.includes(m.name?.getText(node))).map(m=>m.getText(node)).join('\n')+'}\nexports.Harness=Harness;';
 const ctx=vm.createContext({exports:{}});vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,ctx);
 const h=new ctx.exports.Harness();h.beginMap('0');h.mapDescription('比奇省');h.position('0',338,264);assert.equal(h.location,'比奇省 338:264');h.beginMap('0');assert.equal(h.location,' 0:0');h.mapDescription('');h.position('0',2,3);assert.equal(h.location,' 2:3');h.mapDescription('旧图');h.position('3',4,5);assert.equal(h.location,' 4:5');
 console.log('PASS production map entry clears titles even for same map ID; confirmed coordinates retain the current title');groups++;
}
console.log(`${groups} native HUD label regression groups passed`);
