import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'apps/web/src/magic-effects.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/web/effects/Effect/library.json'),'utf8'));
const settle=async()=>{for(let i=0;i<18;i++)await Promise.resolve();};
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
class Sprite{
 constructor(){this.position={set:(x,y)=>{this.x=x;this.y=y;}};this.pivot={set:(x,y)=>{this.pivotX=x;this.pivotY=y;}};}
 destroy(){this.destroyed=true;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
}
function harness(){
 let now=0,serial=0;const pending=new Map(),loads=[];
 const state={defer:false,release:undefined,failManifest:false,failTexture:false,missing:false};
 const depth={children:[],addChild(sprite){this.children.push(sprite);sprite.parent=this;}};
 const context={exports:{},performance:{now:()=>now},requestAnimationFrame:callback=>{pending.set(++serial,callback);return serial;},cancelAnimationFrame:handle=>pending.delete(handle),
  fetch:()=>state.failManifest?Promise.reject(new Error('manifest unavailable')):Promise.resolve({ok:true,json:()=>Promise.resolve(state.missing?{frames:{}}:manifest)}),
  require:()=>({Sprite,Assets:{load:url=>{loads.push(url);if(state.failTexture)return Promise.reject(new Error('texture unavailable'));const texture={url,source:{}};return state.defer?new Promise(resolve=>{(state.releases??=[]).push(()=>resolve(texture));}):Promise.resolve(texture);}}})};
 vm.createContext(context);vm.runInContext(code,context);const effects=new context.exports.MagicEffects(depth,()=>undefined);
 return {effects,depth,state,pending,loads,time:value=>{now=value;},tick(value){now=value;const callbacks=[...pending.values()];pending.clear();for(const callback of callbacks)callback(now);}};
}
{
 const h=harness();
 for(let direction=0;direction<8;direction++)h.effects.miningImpact({x:10+direction,y:20,direction});await settle();
 assert.equal(h.depth.children.length,8);assert.equal(h.loads.length,24);
 for(let direction=0;direction<8;direction++){
  const sprite=h.depth.children[direction],frame=manifest.frames[String(direction*8)];
  assert.equal(sprite.texture.url,`/effects/Effect/${frame.file}`);assert.equal(sprite.x,(10+direction)*48);assert.equal(sprite.y,20*32);
  assert.equal(sprite.pivotX,-frame.offsetX);assert.equal(sprite.pivotY,-frame.offsetY);assert.equal(sprite.blendMode,'screen');assert.equal(sprite.texture.source.scaleMode,'nearest');assert.equal(sprite.zIndex,Number.MAX_SAFE_INTEGER-16);
 }
 pass('eight mining directions use real Effect frame indices, signed offsets, nearest sampling and screen above the actors');
}
{
 const h=harness();h.effects.miningImpact({x:10,y:20,direction:2});await settle();
 const frame=()=>h.effects.debugMiningState().effects[0]?.frame;
 assert.equal(frame(),0);h.tick(80);assert.equal(frame(),0);h.tick(81);assert.equal(frame(),1);h.tick(161);assert.equal(frame(),1);h.tick(162);assert.equal(frame(),2);h.tick(243);assert.equal(h.depth.children.length,0);assert.equal(h.pending.size,0);
 pass('three mining fragments advance once at strict greater-than 80ms boundaries and release their sprite and ticker');
}
{
 const h=harness();h.effects.miningImpact({x:10,y:20,direction:5});await settle();h.tick(400);assert.equal(h.effects.debugMiningState().effects[0].frame,1);h.tick(480);assert.equal(h.effects.debugMiningState().effects[0].frame,1);h.tick(481);assert.equal(h.effects.debugMiningState().effects[0].frame,2);
 pass('a delayed animation tick advances one native fragment without skipping frames to catch up');
}
{
 const h=harness();h.effects.miningImpact({x:10,y:20,direction:2});await settle();assert.equal(h.pending.size,1);h.effects.clear();assert.equal(h.depth.children.length,0);assert.equal(h.pending.size,0);assert.equal(h.effects.debugMiningState().effects.length,0);
 pass('map clear removes mining sprites and cancels all their scheduled callbacks');
}
{
 const h=harness();h.state.defer=true;h.effects.miningImpact({x:10,y:20,direction:2});await settle();h.effects.clear();h.state.defer=false;h.effects.miningImpact({x:30,y:40,direction:3});for(const release of h.state.releases)release();await settle();
 assert.equal(h.depth.children.length,1);assert.equal(h.depth.children[0].x,30*48);assert.equal(h.effects.debugMiningState().effects[0].direction,3);
 pass('old-map texture completion cannot create a fragment while a current mining impact survives');
}
{
 const h=harness();h.state.defer=true;h.effects.miningImpact({x:10,y:20,direction:2});await settle();h.tick(81);h.tick(162);h.tick(243);for(const release of h.state.releases)release();await settle();assert.equal(h.depth.children.length,0);assert.equal(h.pending.size,0);
 pass('assets finishing after the native fragment clock ends do not flash a stale mining effect');
}
{
 const h=harness();h.state.defer=true;h.effects.miningImpact({x:10,y:20,direction:2});await settle();h.tick(81);h.tick(162);h.tick(240);for(const release of h.state.releases)release();await settle();assert.equal(h.depth.children.length,1);assert.equal(h.effects.debugMiningState().effects[0].frame,2);assert.equal(h.depth.children[0].texture.url,`/effects/Effect/${manifest.frames['18'].file}`);h.tick(243);assert.equal(h.depth.children.length,0);
 const lag=harness();lag.state.defer=true;lag.effects.miningImpact({x:10,y:20,direction:2});await settle();lag.tick(400);for(const release of lag.state.releases)release();await settle();assert.equal(lag.effects.debugMiningState().effects[0].frame,1);assert.equal(lag.depth.children[0].texture.url,`/effects/Effect/${manifest.frames['17'].file}`);
 pass('loading advances the independent native clock and attaches its current still-live frame even after a delayed tick');
}
{
 const h=harness();h.state.failManifest=true;h.effects.miningImpact({x:10,y:20,direction:2});await settle();assert.match(h.effects.debugMiningState().error,/manifest unavailable/);h.state.failManifest=false;h.effects.miningImpact({x:10,y:20,direction:2});await settle();assert.equal(h.depth.children.length,1);assert.equal(h.effects.debugMiningState().error,undefined);
 pass('a failed effect manifest is observable and a later real mining impact can retry it');
}
{
 const h=harness();h.state.failTexture=true;h.effects.miningImpact({x:10,y:20,direction:2});await settle();assert.match(h.effects.debugMiningState().error,/texture unavailable/);h.state.failTexture=false;h.effects.miningImpact({x:10,y:20,direction:2});await settle();assert.equal(h.depth.children.length,1);assert.equal(h.loads.length,6);
 const missing=harness();missing.state.missing=true;missing.effects.miningImpact({x:10,y:20,direction:2});await settle();assert.equal(missing.depth.children.length,0);assert.match(missing.effects.debugMiningState().error,/Missing mining fragment/);
 pass('failed textures retry and a direction with missing original frames never produces an empty phantom sprite');
}
assert.equal(groups,9);
