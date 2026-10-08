import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contract=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/native-ui-fonts.json'),'utf8'));
const repertoire=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/legacy-text-repertoire.json'),'utf8'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let groups=0;const pass=label=>{groups++;console.log('PASS '+label);};
for(const [profile,spec] of Object.entries(contract.profiles)){
 const file=path.join(root,'assets/web',spec.manifest.slice(1)),bytes=fs.readFileSync(file);assert.equal(sha(bytes),spec.sha256);
 const manifest=JSON.parse(bytes);assert.equal(manifest.repertoireSha256,repertoire.sha256);assert.deepEqual(Object.keys(manifest.glyphs).map(Number).sort((a,b)=>a-b),repertoire.codepoints);
 assert.ok(manifest.glyphs['63733'],'Actual CP936 maps byte FF to U+F8F5');
 for(const page of manifest.pages){const bytes=fs.readFileSync(path.join(path.dirname(file),page.file));assert.equal(sha(bytes),page.sha256);assert.equal(bytes.readUInt32BE(16),page.width);assert.equal(bytes.readUInt32BE(20),page.height);}
}
pass('both font manifests and actual PNG geometries/hashes cover every codepoint emitted by the real gateway CP936 decoder');

const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'apps/web/src/native-ui-font.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(){
 const lock=structuredClone(contract),requests=[],canvases=[],pageGates=new Map();let corrupt=false,imageFailure=false,wrongGeometry=false,networkFailure=false;
 class Canvas{
  constructor(){this.ownerDocument=document;this.style={};this.ops=[];canvases.push(this);this.context={drawImage:(...args)=>this.ops.push(['drawImage',...args]),fillRect:(...args)=>this.ops.push(['fillRect',...args])};}
  getContext(){return this.context;}
 }
 const document={createElement:()=>new Canvas()};
 class Image{
  set src(url){this.url=url;globalThis.fetch(url).then(r=>r.arrayBuffer()).then(data=>{if(imageFailure){this.onerror?.();return;}const b=Buffer.from(data);this.naturalWidth=wrongGeometry?1:b.readUInt32BE(16);this.naturalHeight=b.readUInt32BE(20);this.onload?.();}).catch(()=>this.onerror?.());}
 }
 const context=vm.createContext({exports:{},require:()=>({default:lock}),TextDecoder,Uint8Array,Array,Blob,URL,Image,crypto:crypto.webcrypto,AbortSignal,
  fetch:async url=>{requests.push(url);if(pageGates.has(url))await pageGates.get(url);if(networkFailure)throw new TypeError('Failed to fetch');let bytes=fs.readFileSync(path.join(root,'assets/web',url.slice(1)));if(corrupt&&url.endsWith('.png')){bytes=Buffer.from(bytes);bytes[bytes.length-1]^=1;}return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}});
 vm.runInContext(compiled,context);return {load:context.exports.loadNativeUiFont,document,canvases,requests,pageGates,
  corruption:value=>{corrupt=value;},imageFailure:value=>{imageFailure=value;},wrongGeometry:value=>{wrongGeometry=value;},networkFailure:value=>{networkFailure=value;},lock};
}
{
 const f=fixture(),first=f.load('kaiti-16-bold');assert.equal(f.load('kaiti-16-bold'),first);const font=await first;
 assert.equal(font.measure('热血传奇'),68);await font.prepare('热血传奇');const canvas=f.document.createElement('canvas');
 font.paint(canvas,'热血传奇',{width:168,height:41,left:50,top:12,lineHeight:18,color:'#f7ef8c'});
 assert.equal(canvas.width,168);assert.equal(canvas.height,41);assert.equal(canvas.context.imageSmoothingEnabled,false);
 const ink=f.canvases.at(-1);assert.equal(ink.ops.filter(op=>op[0]==='drawImage').length,4);
 assert.deepEqual(canvas.ops.filter(op=>op[0]==='drawImage').map(op=>op.slice(-2)),[[-1,0],[1,0],[0,-1],[0,1],[0,0]]);
 assert.equal(ink.context.fillStyle,'#f7ef8c');assert.equal(ink.context.globalCompositeOperation,'source-in');
 pass('actual shared font loader coalesces requests, preserves GDI bold advances, paints glyph union with nearest sampling and four-way outline');
}
{
 const f=fixture(),font=await f.load('kaiti-12');await font.prepare('第一行\n第二行\tABC');const canvas=f.document.createElement('canvas');
 font.paint(canvas,'第一行\n第二行\tABC',{width:506,height:461,left:1,top:1,lineHeight:14,color:'#ffffff'});
 const ink=f.canvases.at(-1),draws=ink.ops.filter(op=>op[0]==='drawImage');assert.equal(draws.length,9);
 assert.equal(font.measure('第一行'),36);assert.ok(font.measure('第二行\tABC')>36);assert.equal(font.measure('第一行\nA'),36);
 await assert.rejects(font.prepare('😀'),/U\+1F600/);assert.throws(()=>font.paint(canvas,'A',{width:2000,height:1,left:0,top:0,lineHeight:14,color:'#ffffff'}),/范围无效/);
 pass('literal multi-line/ASCII/tab text uses codepage glyphs; unsupported Unicode and unsafe canvas dimensions fail without local-font fallback');
}
for(const kind of ['corrupt','decode','geometry']){
 const f=fixture(),font=await f.load('kaiti-12');
 if(kind==='corrupt')f.corruption(true);else if(kind==='decode')f.imageFailure(true);else f.wrongGeometry(true);
 await assert.rejects(font.prepare('公告'));
 f.corruption(false);f.imageFailure(false);f.wrongGeometry(false);await font.prepare('公告');
 const canvas=f.document.createElement('canvas');font.paint(canvas,'公告',{width:100,height:30,left:1,top:1,lineHeight:14,color:'#ffffff'});
 pass(`${kind}: failed image promise is evicted, byte/decode/geometry rejection cannot poison an explicit retry`);
}
{
 const f=fixture(),font=await f.load('kaiti-12');await font.prepare('经验值397/397');const canvas=f.document.createElement('canvas');
 font.paint(canvas,'经验值',{width:85,height:14,left:0,top:0,lineHeight:14,color:'#c0c0c0',outline:false});
 assert.deepEqual(canvas.ops.filter(op=>op[0]==='drawImage').map(op=>op.slice(-2)),[[0,0]]);
 const ink=f.canvases.at(-1);assert.equal(ink.ops.filter(op=>op[0]==='fillRect').length,1);assert.equal(ink.context.fillStyle,'#c0c0c0');
 font.paint(canvas,'397/397',{width:64,height:12,left:0,top:0,lineHeight:12,color:'#ffffff',outline:false});
 assert.equal(canvas.style.width,'64px');assert.equal(canvas.style.height,'12px');
 pass('actual shared rasterizer preserves raw silver/white character ink without outlining or CSS resampling');
}
{
 const f=fixture();f.networkFailure(true);await assert.rejects(f.load('kaiti-12'),/检查连接后重试/);
 f.networkFailure(false);const font=await f.load('kaiti-12');f.networkFailure(true);await assert.rejects(font.prepare('状态'),/检查连接后重试/);
 f.networkFailure(false);await font.prepare('状态');
 pass('network failures show an actionable Chinese diagnostic and both manifest/page caches recover on retry');
}
{
 const f=fixture();f.lock.profiles['kaiti-12'].sha256='0'.repeat(64);await assert.rejects(f.load('kaiti-12'),/身份不匹配/);
 f.lock.profiles['kaiti-12'].sha256=contract.profiles['kaiti-12'].sha256;await f.load('kaiti-12');
 await assert.rejects(f.load('../another-version'),/身份不匹配/);
 pass('manifest source hash and declared profile identity fail closed; rejected shared metadata requests can be retried');
}
{
 const f=fixture(),font=await f.load('kaiti-16-bold'),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/web',contract.profiles['kaiti-16-bold'].manifest.slice(1)),'utf8'));
 const representatives=[0,1].map(page=>Object.entries(manifest.glyphs).find(([key,glyph])=>glyph[0]===page&&glyph[3]&&glyph[4]));assert.ok(representatives.every(Boolean));
 const chars=representatives.map(([key])=>String.fromCodePoint(Number(key))).join('');const gates=[];
 for(const page of [0,1]){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});f.pageGates.set('/ui-national/fonts/'+manifest.pages[page].file,promise);gates.push({resolve,reject});}
 let settled=false;const request=font.prepare(chars).then(()=>{settled=true;return null;},error=>{settled=true;return error;});
 await new Promise(resolve=>setImmediate(resolve));gates[0].reject(new Error('first page failed'));await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false,'retry must not be exposed while another old page request is pending');
 gates[1].reject(new Error('second page failed'));const error=await request;assert.match(error.message,/检查连接后重试/);assert.equal(settled,true);f.pageGates.clear();await font.prepare(chars);
 pass('real multi-page font batch waits for every old request to settle, then an immediate retry refetches both failed pages');
}
console.log(`${groups} native UI font regression groups passed; actual browser/native pixel qualification remains separate`);
