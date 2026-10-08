import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash,webcrypto} from 'node:crypto';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url));
const profile=JSON.parse(read('content/classic-176/scene-lighting.json'));
const code=ts.transpileModule(read('apps/web/src/scene-lighting-data.ts').toString('utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sha=raw=>createHash('sha256').update(raw).digest('hex');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function harness(){const requests=[],context={exports:{},Uint8Array,DataView,crypto:webcrypto,require:()=>({default:profile}),fetch:(url,options)=>{const req={url,options,...deferred()};requests.push(req);return req.promise;}};vm.createContext(context);vm.runInContext(code,context);return {api:context.exports,requests};}
const response=raw=>({ok:true,status:200,arrayBuffer:async()=>Uint8Array.from(raw).buffer});
let passed=0;const pass=name=>{passed++;console.log('PASS '+name);};
{
 const {api}=harness();
 for(const spec of profile.masks){const raw=read('assets/web/lighting/'+spec.file),mask=api.readNativeLightMask(raw);assert.equal(sha(raw),spec.sha256);assert.equal(mask.width,spec.width);assert.equal(mask.height,spec.height);assert.equal(mask.trailingBytes,spec.trailingBytes);assert.equal(sha(mask.pixels),sha(raw.subarray(8,8+spec.width*spec.height)));assert.ok(mask.pixels.every(value=>value<=30));}
 const raw=Uint8Array.from([2,0,0,0,2,0,0,0,1,2,3,4,255]),padded=Uint8Array.from([99,99,...raw,99]),mask=api.readNativeLightMask(padded.subarray(2,-1));assert.deepEqual(Array.from(mask.pixels),[1,2,3,4]);assert.equal(mask.trailingBytes,1);
 pass('production decoder reads every byte of all six original masks, raw trailing data and nonzero buffer offsets');
}
{
 const {api}=harness();
 for(const raw of [new Uint8Array(7),Uint8Array.from([255,255,255,255,1,0,0,0]),Uint8Array.from([2,0,0,0,2,0,0,0,1]),Uint8Array.from([1,16,0,0,1,0,0,0])])assert.throws(()=>api.readNativeLightMask(raw));
 pass('truncated headers/pixels and signed invalid/oversize dimensions fail before exposing an unchecked mask');
}
{
 const {api,requests}=harness(),pending=api.loadNativeLightMask(0);assert.equal(api.loadNativeLightMask(0),pending);assert.equal(requests.length,1);requests[0].resolve(response(read('assets/web/lighting/lig0a.dat')));const mask=await pending;assert.equal(mask.width,196);assert.equal(mask.trailingBytes,904);assert.equal(api.loadNativeLightMask(0),pending);
 for(const level of [-1,0.5,6,NaN,Infinity])await assert.rejects(api.loadNativeLightMask(level),/等级无效/);assert.equal(requests.length,1);
 const bad=api.loadNativeLightMask(1);requests[1].resolve(response(read('assets/web/lighting/lig0a.dat')));await assert.rejects(bad,/版本不匹配/);
 const retry=api.loadNativeLightMask(1);assert.equal(requests.length,3);requests[2].resolve(response(read('assets/web/lighting/lig0b.dat')));assert.equal((await retry).width,448);
 const failed=api.loadNativeLightMask(2);requests[3].resolve({ok:false,status:500});await assert.rejects(failed,/500/);const recovered=api.loadNativeLightMask(2);requests[4].resolve(response(read('assets/web/lighting/lig0c.dat')));assert.equal((await recovered).height,528);
 pass('SHA-locked loader shares pending/cached requests, rejects other-version bytes/invalid levels and recovers after hash/HTTP failures');
}
{
 const {api,requests}=harness(),old=api.loadNativeLightMask(3),newer=api.loadNativeLightMask(3,true);assert.notEqual(old,newer);assert.equal(requests[1].options.cache,'reload');requests[1].resolve(response(read('assets/web/lighting/lig0d.dat')));await newer;
 requests[0].reject(new Error('obsolete request failed'));await assert.rejects(old,/obsolete/);assert.equal(api.loadNativeLightMask(3),newer);assert.equal(requests.length,2);
 pass('forced reread owns a new verified request and an older late failure cannot erase the newer successful cache');
}
console.log(`${passed} scene-lighting groups passed; exact data and loader only, no inferred night rendering.`);
