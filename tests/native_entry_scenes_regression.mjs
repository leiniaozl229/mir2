import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const contract=JSON.parse(read('content/classic-176/entry-scenes.json'));
const libraries=new Map(Object.keys(contract.sources).map(name=>[name,JSON.parse(read(`assets/web/ui-national/${name}/library.json`))]));
const pngs=new Map();
for(const [family,source] of Object.entries(contract.sources))for(const frame of Object.values(source.frames)){
 const bytes=fs.readFileSync(path.join(root,'assets/web/ui-national',family,frame.file));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),frame.sha256);
 assert.equal(bytes.readUInt32BE(16),frame.width);assert.equal(bytes.readUInt32BE(20),frame.height);
 pngs.set(`/ui-national/${family}/${frame.file}`,bytes);
}
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
pass('seven locked source-frame PNG identities and actual IHDR geometries match the original-client contract');

const authFixture=read('tests/auth_actions_regression.mjs');
const domSource=authFixture.slice(authFixture.indexOf('class Element{'),authFixture.indexOf('\nfunction parseAuth('));
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture({delayed=false,missing=false,badIdentity=false,imageFailure=false,fontFailure=false}={}){
 let release;const gate=delayed?new Promise(resolve=>{release=resolve;}):Promise.resolve();
 let attempts=0,retries=0;const images=[],modules=new Map();
 const libs=new Map([...libraries].map(([name,library])=>[name,structuredClone(library)]));
 if(missing)libs.delete('prguse2');if(badIdentity)libs.get('prguse2').sourceSha256='wrong';
 const context=vm.createContext({console,queueMicrotask,Promise,Map,Set});
 vm.runInContext(domSource+'\nglobalThis.TestElement=Element;',context);
 const document={activeElement:null,createElement:tag=>new context.TestElement(tag,document),addEventListener(){},defaultView:{addEventListener(){}}};
 class Image{
  set src(url){this.url=url;images.push(url);queueMicrotask(()=>{const bytes=pngs.get(url);if(imageFailure||!bytes){this.onerror?.();return;}this.naturalWidth=bytes.readUInt32BE(16);this.naturalHeight=bytes.readUInt32BE(20);this.onload?.();});}
 }
 context.Image=Image;
 const session=async()=>{attempts++;await gate;return {national:libs};};
 const resources={loadClassicUiSession:session,retryClassicUiSession:async()=>{retries++;return session();},nationalUiUrl:(family,frame)=>`/ui-national/${family}/${frame.file}`};
 function load(file){
  if(file.endsWith('.css'))return {};
  if(file.endsWith('.json'))return {default:JSON.parse(read(file))};
  if(file==='apps/web/src/classic-ui.ts')return resources;
  // Resource pixels and integrity execute separately in native_ui_font_regression.
  if(file==='apps/web/src/native-ui-font.ts')return {loadNativeUiFont:async()=>{
   await gate;if(fontFailure)throw new Error('font load failed');
   return {prepare:async()=>{},measure:text=>[...text].length*17,paint:(canvas,text,options)=>{canvas.width=options.width;canvas.height=options.height;canvas.dataset.paintedText=text;canvas.dataset.paintOptions=JSON.stringify(options);}};
  }};
  if(modules.has(file))return modules.get(file);
  const exports={};modules.set(file,exports);const previous=context.exports,previousRequire=context.require;
  context.exports=exports;context.require=specifier=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier.endsWith('.json')||specifier.endsWith('.css')?specifier:specifier+'.ts')));
  vm.runInContext(compile(read(file)),context,{filename:file});context.exports=previous;context.require=previousRequire;return exports;
 }
 const rootElement=document.createElement('div');
 const {NativeEntryScenes}=load('apps/web/src/native-entry-scenes.ts');
 const scenes=new NativeEntryScenes(rootElement),scene=rootElement.children[0],panel=scene.children[0],content=panel.children[0],close=panel.children[1],confirm=panel.children[2];
 return {scenes,scene,panel,content,close,confirm,document,libs,images,release,attempts:()=>attempts,retries:()=>retries,recoverImage:()=>{imageFailure=false;},recoverFont:()=>{fontFailure=false;}};
}
const server={name:'热血传奇',status:'idle',routable:true};
{
 const f=fixture(),chosen=[],exits=[];await f.scenes.showServers([server],{choose:name=>chosen.push(name),exit:()=>exits.push('exit')});
 const button=f.content.children[0];assert.equal(f.panel.style.left,'246px');assert.equal(f.panel.style.top,'75px');assert.equal(button.style.left,'63px');assert.equal(button.style.top,'214px');assert.equal(button.textContent,server.name);assert.equal(f.images.length,7);assert.equal(f.document.activeElement,f.scene);
 assert.equal(button.children[0].className,'native-bitmap-label');assert.equal(button.children[0].getAttribute('aria-hidden'),'true');assert.equal(button.style.color,'transparent');
 assert.deepEqual(JSON.parse(button.children[0].dataset.paintOptions),{width:168,height:41,left:50,top:12,lineHeight:18,color:'#f7ef8c'});
 for(const key of ['Enter','Escape']){const event=f.scene.emit('keydown',{key});assert.equal(event.prevented,true);assert.equal(event.stopped,true);}assert.deepEqual(chosen,[]);
 button.emit('click');button.emit('click');assert.deepEqual(chosen,[server.name]);assert.equal(button.disabled,true);assert.equal(f.close.disabled,false);f.close.emit('click');assert.deepEqual(exits,['exit']);
 pass('original measured server layout, mouse-only selection, duplicate suppression, and exit during a pending selection use the real production controller');
}
{
 const f=fixture(),chosen=[];await f.scenes.showServers([{...server,status:'offline'},{name:'另一服务器',status:'busy',routable:false}],{choose:name=>chosen.push(name),exit(){}});
 for(const button of f.content.children){assert.equal(button.disabled,true);button.emit('click');}assert.deepEqual(chosen,[]);
 pass('offline and unroutable server names never submit a native selection');
}
{
 const f=fixture(),ids=[];await f.scenes.showNotice(9,['第一行','<script>原公告文本</script>'],id=>ids.push(id));
 assert.equal(f.panel.style.left,'272px');assert.equal(f.panel.style.top,'120px');assert.equal(f.confirm.style.left,'90px');assert.equal(f.confirm.style.top,'305px');assert.equal(f.content.textContent,'第一行\n<script>原公告文本</script>');
 assert.equal(f.content.style.left,'23px');assert.equal(f.content.style.top,'20px');assert.equal(f.content.children[0].style.left,'-1px');assert.equal(f.content.children[0].dataset.paintedText,'第一行\n<script>原公告文本</script>');
 f.scene.emit('keydown',{key:'Escape'});f.scene.emit('keydown',{key:'Enter',isComposing:true});f.scene.emit('keydown',{key:'Enter',repeat:true});assert.deepEqual(ids,[]);
 f.scene.emit('keydown',{key:'Enter'});f.scene.emit('keydown',{key:'Enter'});f.confirm.emit('click');assert.deepEqual(ids,[9]);assert.equal(f.confirm.disabled,true);
 await f.scenes.showNotice(10,['重选后再次公告'],id=>ids.push(id));f.confirm.emit('click');assert.deepEqual(ids,[9,10]);
 f.scenes.hide();f.scene.emit('keydown',{key:'Enter'});f.confirm.emit('click');assert.deepEqual(ids,[9,10]);assert.equal(f.scenes.isOpen(),false);
 pass('native Enter acknowledgement, ignored Escape/IME/repeat, literal text, one request per notice, fresh reselection identity and hidden-scene rejection');
}
{
 const f=fixture(),chosen=[];await f.scenes.showServers([server],{choose:name=>chosen.push(name),exit(){}});const retired=f.content.children[0];
 await f.scenes.showServers([{name:'新列表',status:'idle'}],{choose:name=>chosen.push(name),exit(){}});retired.emit('click');assert.deepEqual(chosen,[]);f.content.children[0].emit('click');assert.deepEqual(chosen,['新列表']);
 pass('retired server controls cannot submit into a replacement list');
}
{
 const f=fixture({delayed:true});const old=f.scenes.showServers([server],{choose(){throw new Error('retired selection');},exit(){}});const latest=f.scenes.showNotice(12,['新的公告'],()=>{});f.release();assert.equal(await old,false);assert.equal(await latest,true);assert.equal(f.scene.dataset.entryScene,'notice');assert.equal(f.content.textContent,'新的公告');
 pass('a delayed original-resource load cannot resurrect a retired server-selection scene');
}
{
 const f=fixture({delayed:true});const old=f.scenes.showNotice(13,['中断公告'],()=>{throw new Error('retired notice');});f.scenes.hide();f.release();assert.equal(await old,false);assert.equal(f.scene.hidden,true);
 pass('closing or disconnecting during resource load keeps the scene closed');
}
for(const option of ['missing','badIdentity','imageFailure']){
 const f=fixture({[option]:true});await assert.rejects(f.scenes.showServers([server],{choose(){},exit(){}}));assert.equal(f.panel.hidden,true);f.scenes.hide();
 f.libs.set('prguse2',structuredClone(libraries.get('prguse2')));f.recoverImage();assert.equal(await f.scenes.showServers([server],{choose(){},exit(){}}),true);assert.equal(f.retries(),1);
 pass(`${option}: no replacement artwork or live controls before preflight, followed by an explicit successful resource retry`);
}
{
 const f=fixture({fontFailure:true});await assert.rejects(f.scenes.showServers([server],{choose(){},exit(){}}),/font load failed/);
 assert.equal(f.panel.hidden,true);assert.equal(f.close.hidden,true);assert.equal(f.confirm.hidden,true);f.scenes.hide();f.recoverFont();
 assert.equal(await f.scenes.showServers([server],{choose(){},exit(){}}),true);assert.equal(f.panel.hidden,false);
 pass('failed glyph preparation exposes no scene controls and the actual production controller recovers on the next request');
}
{
 const f=fixture();await assert.rejects(f.scenes.showServers([server,server],{choose(){},exit(){}}));await assert.rejects(f.scenes.showNotice(0,['公告'],()=>{}));await assert.rejects(f.scenes.showNotice(1,[null],()=>{}));assert.equal(f.images.length,0);
 pass('invalid duplicate server lists, notice identity and non-text body are rejected before loading a scene');
}
console.log(`${groups} original login-scene regression groups passed; browser rendering/native video/protocol integration remain separate gates`);
