import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync('apps/web/src/classic-ui.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export \{classicUiLayout\}.*;\r?\n/gm,'');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const fresh=fetch=>{const context={exports:{},fetch,nationalProfile:{},uiInteractions:{},uiLayout:{}};vm.createContext(context);vm.runInContext(code,context);return context.exports;};
const library={frames:{'0':{file:'0.png',width:2,height:2,offsetX:-1,offsetY:0}},sourceSha256:'preserved-lock'};
const ok=(value=library)=>({ok:true,json:async()=>value});
const settle=()=>new Promise(resolve=>setImmediate(resolve));

{
 let calls=0,finish;const ui=fresh(()=>{calls++;return new Promise(resolve=>finish=resolve);});
 const a=ui.loadNationalUiLibrary('items'),b=ui.loadNationalUiLibrary('items');assert.equal(a,b);await settle();assert.equal(calls,1);
 finish(ok());assert.equal((await a).sourceSha256,'preserved-lock');assert.equal(ui.loadNationalUiLibrary('items'),a);assert.equal(calls,1);
 console.log('PASS in-flight and fulfilled national manifests stay shared and preserve identity metadata');
}
{
 let calls=0;const ui=fresh(async()=>++calls===1?{ok:false}:ok());
 const a=ui.loadNationalUiLibrary('items'),b=ui.loadNationalUiLibrary('items');assert.equal(a,b);await assert.rejects(a,/载入失败/);
 const retry=ui.loadNationalUiLibrary('items');assert.notEqual(retry,a);assert.equal(await retry,library);assert.equal(calls,2);
 console.log('PASS HTTP failure evicts only failed promise and a new attempt recovers');
}
{
 let calls=0;const ui=fresh(async()=>++calls===1?{ok:true,json:async()=>{throw new SyntaxError('truncated');}}:ok());
 await assert.rejects(ui.loadUiLibrary('Prguse'),SyntaxError);assert.equal(await ui.loadUiLibrary('Prguse'),library);assert.equal(calls,2);
 console.log('PASS JSON decode rejection can retry without poisoning reference cache');
}
{
 for(const malformed of [null,{}, {frames:[]}]){
  let calls=0;const ui=fresh(async()=>ok(++calls===1?malformed:library));
  await assert.rejects(ui.loadNationalUiLibrary('items'),/载入失败/);assert.equal(await ui.loadNationalUiLibrary('items'),library);
 }
 console.log('PASS malformed manifest containers are rejected and recover on explicit new requests');
}
{
 let calls=0;const ui=fresh(()=>{if(++calls===1)throw new Error('network');return ok();});
 await assert.rejects(ui.loadUiLibrary('Title'),/network/);assert.equal(await ui.loadUiLibrary('Title'),library);
 console.log('PASS synchronous transport failure follows the same retry lifecycle');
}
{
 const urls=[];const ui=fresh(async url=>{urls.push(url);return ok({frames:{},url});});
 const n=ui.loadNationalUiLibrary('items'),r=ui.loadUiLibrary('items');assert.notEqual(n,r);
 assert.equal((await n).url,'/ui-national/items/library.json');assert.equal((await r).url,'/ui/items/library.json');assert.equal(urls.length,2);
 console.log('PASS national and reference namespaces cannot alias by library name');
}
{
 const urls=[];let recovered=false;const ui=fresh(async url=>{urls.push(url);return !recovered&&/ui-national\/(prguse|chrsel)\//.test(url)?{ok:false}:ok();});
 const first=ui.loadClassicUiSession();assert.equal(first,ui.loadClassicUiSession());assert.equal(first,ui.retryClassicUiSession());
 const initial=await first;assert.equal(initial.missingNational.length,2);assert.equal(initial.fallback.size,0);assert.equal(urls.length,6);
 assert.ok(urls.every(url=>url.startsWith('/ui-national/')));
 recovered=true;const retry=ui.retryClassicUiSession();assert.notEqual(retry,first);const result=await retry;
 assert.equal(result.missingNational.length,0);assert.equal(result.national.size,6);assert.equal(result.fallback.size,0);assert.equal(urls.length,8);
 assert.equal(ui.loadClassicUiSession(),retry);
 console.log('PASS missing original skin never loads Crystal; retry recovers only failed original families');
}
{
 const urls=[];let failed=true;const ui=fresh(async url=>{urls.push(url);return failed&&url.includes('/ui-national/items/')?{ok:false}:ok();});
 const first=await ui.loadClassicUiSession();assert.equal(first.missingNational.length,1);assert.equal(first.fallback.size,0);assert.equal(urls.length,6);
 failed=false;const retry=await ui.retryClassicUiSession();assert.equal(retry.missingNational.length,0);assert.equal(urls.length,7);
 console.log('PASS a failed secondary atlas recovers without fetching incompatible reference skin');
}
{
 const pending=[];const ui=fresh(()=>new Promise(resolve=>pending.push(resolve)));const request=ui.loadClassicUiSession();await settle();
 assert.equal(pending.length,6);assert.equal(ui.retryClassicUiSession(),request);assert.equal(ui.retryClassicUiSession(),request);
 pending.forEach(resolve=>resolve(ok()));await request;assert.equal(pending.length,6);
 console.log('PASS repeated retry while loading shares current session without duplicate requests');
}
