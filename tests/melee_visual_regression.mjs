import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contract=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/melee-visual.json'),'utf8'));
const profile=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/national-gameplay.json'),'utf8'));
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const codes={melee:compile('apps/web/src/melee-visual.ts'),actor:compile('apps/web/src/online-actors.ts'),national:compile('apps/web/src/national-actors.ts')};
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const player={id:1,x:10,y:10,direction:2,feature:0x00010200,name:'actor',self:false,action:'attack',status:0,swingSequence:1,meleeKind:'power'};
const kinds={power:800,thrusting:1410,halfMoon:1700,fire:3480};
let passed=0;
const pass=label=>{passed++;console.log('PASS '+label);};
class Scene {
 constructor(){this.x=this.y=0;this.children=[];this.style={};this.filters=[];this.alpha=1;this.visible=true;this.position={set:(x,y)=>{assert.ok(!this.destroyed,'late sprite position');this.x=x;this.y=y;}};this.anchor=this.pivot={set(){}};}
 addChild(...children){assert.ok(!this.destroyed,'late child attach');this.children.push(...children);children.forEach(child=>child.parent=this);}
 destroy(options){assert.ok(!this.destroyed,'double sprite destroy');this.destroyed=true;if(options?.children)for(const c of [...this.children])c.destroy();if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
 clear(){return this;}circle(){return this;}fill(){return this;}stroke(){return this;}rect(){return this;}
 getBounds(){return {x:this.x,y:this.y,width:48,height:64};}
 set texture(t){assert.ok(!this.destroyed,'late sprite texture');this.currentTexture=t;}
 get texture(){return this.currentTexture;}
}
function harness(options={}){
 let now=0;const fetches=[],loads=[],textures=[],warnings=[];const cache={};
 const manifest={sourceSha256:contract.evidence.sourceSha256,indexSha256:contract.evidence.indexSha256,sourceFrameCount:4010,frames:structuredClone(contract.frames)};
 const shield=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/actor-status.json'),'utf8'));
 for(const f of shield.bubble.frames)manifest.frames[f.index]={...f,file:f.index+'.png'};
 const actorManifest={profile:'national-2003-gameplay',frames:Object.fromEntries(Array.from({length:2400},(_,index)=>[index,{file:index+'.png',offsetX:index%7,offsetY:-40}]))};
 const pixi={Container:Scene,Sprite:Scene,Graphics:Scene,Text:Scene,Texture:{EMPTY:{empty:true}},Assets:{load:url=>{loads.push(url);const texture={url,source:{},destroy(){this.destroyed=true;}};textures.push(texture);return options.load?.(url,texture)??Promise.resolve(texture);}}};
 const globals={console:{...console,warn:(...a)=>warnings.push(a)},performance:{now:()=>now},fetch:url=>{fetches.push(url);return options.fetch?.(url,manifest,actorManifest)??Promise.resolve({ok:true,json:async()=>url==='/effects/Magic/library.json'?manifest:actorManifest});}};
 const run=(name,code,require)=>{const context={...globals,exports:{},require};vm.createContext(context);vm.runInContext(code,context);cache[name]=context.exports;return context.exports;};
 const national=run('national',codes.national,()=>({default:profile}));
 const melee=run('melee',codes.melee,name=>name==='pixi.js'?pixi:{default:contract});
 const palette={createActorPaletteFilter:effect=>({effect,destroy(){this.destroyed=true;}})};
 const movement={MOVEMENT_DURATION_MS:600,MOVEMENT_SETTLE_MS:250,forcedMovementDuration:()=>360,visualDirection:d=>d&7,routeDirection:()=>2};
 const actor=run('actor',codes.actor,name=>name==='pixi.js'?pixi:name==='./melee-visual'?melee:name==='./actor-palette'?palette:name==='./national-actors'?national:name==='./monster-visuals'?{resolveMonsterVisual:()=>undefined}:name==='./classic-layout'?{nationalUsesLayout:()=>false}:movement);
 return {melee,actor,pixi,manifest,fetches,loads,textures,warnings,at:time=>{now=time;},make:cb=>{const parent=new Scene();return {parent,visual:new melee.ActorMeleeVisual(parent,cb)};},makeActor:(mine,impact)=>new actor.OnlineActor({...player,action:'standing',meleeKind:undefined},undefined,mine,impact)};
}
const sword=parent=>parent.children.find(c=>c.label==='melee-sword');
{
 const actualPath=path.join(root,contract.evidence.nativePixels);
 if(fs.existsSync(actualPath)){
  const manifest=JSON.parse(fs.readFileSync(actualPath,'utf8'));assert.equal(manifest.sourceSha256,contract.evidence.sourceSha256);assert.equal(manifest.indexSha256,contract.evidence.indexSha256);
  assert.equal(Object.keys(contract.frames).length,192);
  for(const [kind,base] of Object.entries(kinds))for(let d=0;d<8;d++)for(let f=0;f<6;f++){
   const index=base+d*10+f,expected=contract.frames[index],entry=manifest.frames[index];assert.deepEqual(entry,expected);
   const png=fs.readFileSync(path.join(path.dirname(actualPath),entry.file));assert.equal(crypto.createHash('sha256').update(png).digest('hex'),entry.sha256);
   assert.equal(png.readUInt32BE(16),entry.width);assert.equal(png.readUInt32BE(20),entry.height);
  }
  pass('192 existing national Magic PNGs retain original indices, SHA, dimensions and signed offsets; no browser claim');
 }else console.log('SKIP installed assets absent; fixture checks do not establish native_pixels');
}
{
 const h=harness();
 for(const [kind,base] of Object.entries(kinds))for(let d=0;d<8;d++){
  const {parent,visual}=h.make();visual.update({...player,meleeKind:kind,direction:d},0);await settle();visual.setBodyReady(true);
  parent.position.set(480,320);let time=0;
  for(let f=0;f<6;f++){
   if(f){time+=86;visual.tick(time);}
   const index=base+d*10+f,entry=contract.frames[index],s=sword(parent);
   assert.equal(visual.bodyFrame(),f);assert.equal(visual.debugState().index,index);assert.ok(s.texture.url.endsWith('/'+entry.file));assert.equal(s.x+parent.x,480+entry.offsetX);assert.equal(s.y+parent.y,320+entry.offsetY);
   assert.equal(s.blendMode,'screen');assert.equal(s.zIndex,4);assert.equal(s.eventMode,'none');assert.equal(s.filters.length,0);assert.equal(s.texture.source.scaleMode,'nearest');
  }
  visual.tick(time+86);assert.equal(parent.children.length,0);visual.destroy();
 }
 pass('all four kinds and eight directions use six body-synchronized native frames, screen after shield, original foot offsets and no poison filter');
}
{
 const h=harness(),impacts=[],{visual}=h.make(e=>impacts.push(e));visual.update(player,0);await settle();
 visual.tick(85);assert.equal(visual.bodyFrame(),0);visual.tick(86);assert.equal(visual.bodyFrame(),1);visual.tick(171);assert.equal(visual.bodyFrame(),1);visual.tick(172);assert.equal(visual.bodyFrame(),2);assert.equal(impacts.length,0);
 visual.tick(173);assert.equal(impacts.length,1);assert.equal(impacts[0].kind,'power');assert.equal(impacts[0].frame,2);visual.tick(174);assert.equal(impacts.length,1);
 visual.tick(10000);assert.equal(visual.bodyFrame(),3);visual.tick(10000);assert.equal(visual.bodyFrame(),3);visual.destroy();
 pass('strict >85 clock advances once per tick, frame2 impact precedes advancement, same-tick and low-FPS frames never catch up');
}
{
 const h=harness(),{visual,parent}=h.make();visual.update(player,0);await settle();visual.tick(86);visual.update({...player,status:0x40000000},100);assert.equal(visual.bodyFrame(),1);
 visual.update({...player,swingSequence:2},101);await settle();assert.equal(visual.bodyFrame(),0);
 visual.update({...player,action:'standing',swingSequence:2},110);assert.equal(parent.children.length,0);visual.update({...player,swingSequence:2},120);assert.equal(visual.debugState().active,false);
 visual.update({...player,swingSequence:3},121);await settle();assert.equal(visual.debugState().active,true);for(let i=1;i<=6;i++)visual.tick(121+i*86);
 visual.update({...player,swingSequence:3},1000);assert.equal(visual.debugState().active,false);assert.equal(parent.children.length,0);
 visual.update({...player,swingSequence:4},1001);await settle();assert.equal(visual.bodyFrame(),0);visual.destroy();
 pass('same confirmed sequence refresh does not replay; new sequence replays; cancelled and completed identities stay consumed');
}
{
 const h=harness(),{visual,parent}=h.make();
 for(const patch of [{meleeKind:undefined},{meleeKind:'heavy',action:'heavyAttack'},{meleeKind:'big',action:'wideAttack'},{feature:80},{dead:true},{action:'spell'},{direction:-1},{direction:8},{direction:1.5},{action:'standing',status:0x800000}]){visual.update({...player,...patch},0);await settle();assert.equal(parent.children.length,0);}
 visual.update({...player,meleeKind:'normal',swingSequence:2},0);visual.tick(86);assert.equal(visual.bodyFrame(),1);assert.equal(parent.children.length,0);
 visual.update({...player,action:'standing',swingSequence:undefined},100);visual.update({...player,swingSequence:undefined},101);await settle();assert.equal(parent.children.length,1);visual.update({...player,action:'standing',swingSequence:undefined},110);visual.update({...player,swingSequence:undefined},120);await settle();assert.equal(visual.bodyFrame(),0);visual.destroy();
 assert.throws(()=>h.melee.swordIndex('fire',8,0));assert.throws(()=>h.melee.swordIndex('fire',0,6));
 pass('no sword for preparation, normal/heavy/big/nonhuman/dead or invalid direction; undefined legacy sequence only retriggers after action exit');
}
{
 const gate=deferred(),h=harness({fetch:(url,manifest,actor)=>url==='/effects/Magic/library.json'?gate.promise:Promise.resolve({ok:true,json:async()=>actor})}),{visual,parent}=h.make();
 visual.update(player,0);visual.tick(86);visual.tick(172);visual.tick(258);gate.resolve({ok:true,json:async()=>h.manifest});await settle();visual.setBodyReady(true);
 assert.equal(visual.bodyFrame(),3);assert.ok(sword(parent).texture.url.endsWith('/'+contract.frames[823].file));visual.destroy();
 pass('late manifest attaches only current frame3 without resetting its independent action clock');
}
{
 for(const cancel of ['completed','dying','destroy']){
  const gate=deferred(),h=harness({load:(url,texture)=>gate.promise.then(()=>texture)}),{visual,parent}=h.make();visual.update(player,0);await settle();
  if(cancel==='completed')for(let i=1;i<=6;i++)visual.tick(i*86);
  else if(cancel==='dying')visual.update({...player,action:'dying'},10);
  else visual.destroy();
  gate.resolve();await settle();assert.equal(parent.children.length,0);if(cancel!=='destroy')visual.destroy();assert.ok(h.textures.every(t=>!t.destroyed));
 }
 pass('completion, death and destruction during deferred texture loads prevent late sprites and preserve shared textures');
}
{
 const gate=deferred(),h=harness({load:(url,texture)=>url.includes('/800.')||url.includes('/801.')||url.includes('/802.')||url.includes('/803.')||url.includes('/804.')||url.includes('/805.')?gate.promise.then(()=>texture):Promise.resolve(texture)}),{visual,parent}=h.make();
 visual.update({...player,direction:0},0);await settle();visual.update({...player,meleeKind:'fire',direction:7,swingSequence:2},10);await settle();visual.setBodyReady(true);assert.ok(sword(parent).texture.url.endsWith('/'+contract.frames[3550].file));
 gate.resolve();await settle();assert.equal(parent.children.length,1);assert.ok(sword(parent).texture.url.endsWith('/'+contract.frames[3550].file));visual.destroy();
 pass('new confirmed kind/sequence isolates an older async attack even when the old texture task finishes last');
}
{
 let manifestAttempts=0;const h=harness({fetch:(url,manifest,actor)=>Promise.resolve({ok:true,json:async()=>url==='/effects/Magic/library.json'?(++manifestAttempts===1?{...manifest,sourceSha256:'wrong'}:manifest):actor})}),{visual,parent}=h.make();
 visual.update(player,0);await settle();assert.match(visual.debugState().loadError,/source mismatch/);assert.equal(parent.children.length,0);visual.update(player,10);await settle();assert.equal(parent.children.length,1);assert.equal(manifestAttempts,2);visual.destroy();
 let first=true;const h2=harness({load:(url,texture)=>first&&url.endsWith('/'+contract.frames[820].file)?(first=false,Promise.reject(new Error('temporary'))):Promise.resolve(texture)}),a=h2.make();a.visual.update(player,0);await settle();assert.match(a.visual.debugState().loadError,/temporary/);a.visual.update(player,10);await settle();assert.equal(h2.loads.length,7);assert.equal(a.parent.children.length,1);a.visual.destroy();
 pass('source mismatch and failed individual texture are visible, retryable and never fabricate a fallback circle');
}
{
 const h=harness(),a=h.make(),b=h.make();a.visual.update(player,0);b.visual.update({...player,swingSequence:2},50);await settle();a.visual.tick(86);a.visual.setBodyReady(true);b.visual.setBodyReady(true);
 assert.equal(a.visual.bodyFrame(),1);assert.equal(b.visual.bodyFrame(),0);assert.equal(h.loads.length,6);a.visual.destroy();assert.equal(b.parent.children.length,1);assert.ok(h.textures.every(t=>!t.destroyed));b.visual.destroy();
 pass('two actors share immutable native textures but own separate clocks, impact flags and sprite lifetimes');
}
{
 const h=harness(),impacts=[],actor=h.makeActor(undefined,e=>impacts.push(e));actor.update({...player,status:0x40100000});await settle();actor.tick(0);
 assert.equal(actor.debugState().meleeVisual.frame,0);assert.equal(sword(actor.container).visible,true);assert.equal(actor.container.children.find(c=>c.label==='magic-shield').zIndex,3);
 const body=actor.container.children[2],weapon=actor.container.children[1],hair=actor.container.children[3];assert.equal(body.filters[0].effect,'red');assert.equal(hair.filters[0].effect,'red');assert.equal(sword(actor.container).filters.length,0);
 for(const time of [86,172,173]){h.at(time);actor.tick(time);}
 assert.ok(body.texture.url.endsWith('/218.png'));assert.ok(weapon.texture.url.endsWith('/1418.png'));assert.ok(hair.texture.url.endsWith('/1418.png'));assert.ok(sword(actor.container).texture.url.endsWith('/'+contract.frames[822].file));assert.equal(impacts.length,1);assert.equal(impacts[0].swingSequence,1);
 h.at(174);actor.update({...player,status:0x40100000,swingSequence:2});await settle();actor.tick(174);assert.equal(actor.debugState().meleeVisual.frame,0);assert.ok(body.texture.url.endsWith('/216.png'));
 h.at(180);actor.update({...player,status:0x40100000,action:'dying',swingSequence:2});await settle();actor.tick(180);assert.equal(actor.debugState().action,'dying');assert.equal(sword(actor.container),undefined);assert.equal(actor.debugState().statusEffects.active,false);actor.destroy();
 pass('actual OnlineActor keeps body/weapon/hair/sword phase and WORDER, preserves shield/palette layering, repeats confirmed attacks and does not skip dying');
}
{
 const bodyGate=deferred(),h=harness({fetch:(url,manifest,actor)=>url==='/effects/Magic/library.json'?Promise.resolve({ok:true,json:async()=>manifest}):bodyGate.promise}),impacts=[],actor=h.makeActor(undefined,e=>impacts.push(e));
 actor.update(player);await settle();actor.tick(0);assert.equal(sword(actor.container).visible,false);
 for(const time of [86,172,173,258]){h.at(time);actor.tick(time);}assert.equal(impacts.length,1);assert.equal(actor.debugState().meleeVisual.frame,3);
 bodyGate.resolve({ok:true,json:async()=>({profile:'national-2003-gameplay',frames:Object.fromEntries(Array.from({length:2400},(_,index)=>[index,{file:index+'.png',offsetX:0,offsetY:-40}]))})});await settle();actor.tick(259);assert.equal(sword(actor.container).visible,true);assert.ok(actor.container.children[2].texture.url.endsWith('/219.png'));assert.ok(sword(actor.container).texture.url.endsWith('/'+contract.frames[823].file));actor.destroy();
 pass('body loading never shows mismatched sword; clock/impact continue and late body joins current frame without replay');
}
{
 const h=harness(),mine=[],impact=[],actor=h.makeActor(e=>mine.push(e),e=>impact.push(e));actor.update({...player,action:'heavyAttack',meleeKind:'heavy',digFragment:true,status:0x00100000});await settle();
 h.at(450);actor.tick(450);assert.equal(mine.length,1);assert.equal(impact.length,0);assert.equal(sword(actor.container),undefined);assert.equal(actor.debugState().statusEffects.active,true);
 actor.tick(451);assert.equal(mine.length,1);actor.destroy();await settle();assert.ok(h.textures.every(t=>!t.destroyed));
 pass('third mining callback still fires once at450ms on real DIG; heavy adds no sword or special sound and shield/shared assets survive');
}
{
 const h=harness(),events=[],actor=h.makeActor(undefined,(e,parts)=>events.push({entity:e,parts}));
 const predicted={...player,self:true,meleeKind:'normal',predictedMelee:true,meleeActionId:101};
 actor.update(predicted);await settle();actor.tick(0);h.at(86);actor.tick(86);
 const body=actor.container.children[2],before=body.texture,loaded=h.loads.filter(url=>url.startsWith('/actors/')).length;
 h.at(100);actor.update({...predicted,meleeKind:'power',predictedMelee:false,swingSequence:2});await settle();
 assert.equal(actor.debugState().meleeVisual.adopted,true);assert.equal(actor.debugState().meleeVisual.frame,1);assert.equal(actor.debugState().meleeVisual.frameAt,86);assert.equal(actor.debugState().framesReady,true);assert.equal(body.texture,before);assert.equal(h.loads.filter(url=>url.startsWith('/actors/')).length,loaded);
 actor.tick(100);assert.equal(actor.debugState().meleeVisual.frame,1);assert.ok(sword(actor.container).texture.url.endsWith('/'+contract.frames[821].file));
 h.at(172);actor.tick(172);h.at(173);actor.tick(173);
 assert.equal(events.length,1);assert.equal(events[0].entity.meleeKind,'power');assert.deepEqual({...events[0].parts},{weapon:true,skill:true});actor.destroy();
 pass('actual self confirmation adopts exact processed prediction frame/frameAt and current body resources without replay, floor or delayed reload');
}
{
 const h=harness(),events=[],actor=h.makeActor(undefined,(e,parts)=>events.push({entity:e,parts}));
 const predicted={...player,self:true,meleeKind:'normal',predictedMelee:true,meleeActionId:102};
 actor.update(predicted);await settle();for(const time of [86,172,173]){h.at(time);actor.tick(time);}
 assert.equal(events.length,1);assert.equal(events[0].entity.predictedMelee,true);assert.deepEqual({...events[0].parts},{weapon:true,skill:false});assert.equal(sword(actor.container),undefined);
 h.at(174);actor.update({...predicted,meleeKind:'fire',predictedMelee:false,swingSequence:2});await settle();actor.tick(175);actor.tick(176);
 assert.equal(events.length,2);assert.deepEqual({...events[1].parts},{weapon:false,skill:true});assert.equal(events[1].entity.meleeKind,'fire');assert.equal(actor.debugState().meleeVisual.frame,2);
 actor.destroy();
 pass('prediction plays only frame2 weapon once; same-frame special confirmation adds only skill sound without duplicating weapon audio');
}
{
 const gate=deferred(),h=harness({fetch:(url,manifest,actor)=>url==='/effects/Magic/library.json'?gate.promise:Promise.resolve({ok:true,json:async()=>actor})}),events=[],actor=h.makeActor(undefined,(e,parts)=>events.push({entity:e,parts}));
 const predicted={...player,self:true,meleeKind:'normal',predictedMelee:true,meleeActionId:103};
 actor.update(predicted);await settle();for(const time of [86,172,173,258]){h.at(time);actor.tick(time);}
 h.at(260);actor.update({...predicted,meleeKind:'fire',predictedMelee:false,swingSequence:2});assert.equal(actor.debugState().meleeVisual.adopted,true);assert.equal(actor.debugState().meleeVisual.frame,3);
 for(const time of [344,430,516]){h.at(time);actor.tick(time);}
 gate.resolve({ok:true,json:async()=>h.manifest});await settle();assert.equal(events.length,1);assert.equal(events[0].entity.meleeKind,'normal');assert.equal(sword(actor.container),undefined);assert.equal(actor.debugState().action,'standing');actor.destroy();
 pass('confirmation after impact adopts current frame, never replays missed skill audio, and late texture after completion cannot revive a sword');
}
{
 const h=harness();
 for(const reason of ['different-id','remote','cancel','death','heavy','big']){
  const a=h.make(),predicted={...player,self:true,meleeKind:'normal',predictedMelee:true,meleeActionId:200};
  a.visual.update(predicted,0);a.visual.tick(86);
  if(reason==='cancel')a.visual.cancel();
  if(reason==='death')a.visual.update({...predicted,action:'dying'},90);
  const confirmed={...predicted,predictedMelee:false,meleeKind:'power',swingSequence:2,...(reason==='different-id'?{meleeActionId:201}:reason==='remote'?{self:false}:reason==='heavy'?{meleeKind:'heavy',action:'heavyAttack'}:reason==='big'?{meleeKind:'big',action:'wideAttack'}:{})};
  const adopted=a.visual.update(confirmed,100);assert.equal(adopted,false);assert.equal(a.visual.debugState().adopted,false);
  if(reason!=='heavy'&&reason!=='big')assert.equal(a.visual.bodyFrame(),0);
  a.visual.destroy();
 }
 const a=h.make();const predicted={...player,self:true,meleeKind:'normal',predictedMelee:true,meleeActionId:300};a.visual.update(predicted,0);for(let i=1;i<=6;i++)a.visual.tick(i*86);a.visual.update({...predicted,action:'standing'},520);
 assert.equal(a.visual.update({...predicted,predictedMelee:false,meleeKind:'power',swingSequence:2},1000),true);assert.equal(a.visual.debugState().active,false);assert.equal(a.visual.bodyFrame(),6);await settle();assert.equal(a.parent.children.length,0);a.visual.destroy();
 pass('different requests, remote actors, cancel, death and incompatible heavy/big never adopt; completed same-request prediction stays consumed after late confirmation');
}
{
 const h=harness(),mine=[],events=[],actor=h.makeActor(e=>mine.push(e),(e,parts)=>events.push({entity:e,parts}));
 actor.update({...player,action:'heavyAttack',meleeKind:'heavy',digFragment:true});await settle();h.at(180);actor.tick(180);actor.tick(181);
 assert.equal(events.length,1);assert.equal(events[0].entity.meleeKind,'heavy');assert.deepEqual({...events[0].parts},{weapon:true,skill:false});assert.equal(mine.length,0);
 h.at(450);actor.tick(450);actor.tick(451);assert.equal(events.length,1);assert.equal(mine.length,1);
 h.at(500);actor.update({...player,action:'wideAttack',meleeKind:'big',swingSequence:2,digFragment:false});await settle();actor.tick(640);actor.tick(641);assert.equal(events.length,2);assert.equal(events[1].entity.meleeKind,'big');assert.deepEqual({...events[1].parts},{weapon:true,skill:false});assert.equal(mine.length,1);assert.equal(sword(actor.container),undefined);actor.destroy();
 pass('human heavy/big frame2 weapon once is independent of heavy frame5 DIG stone audio and never creates a special sword or skill sound');
}
{
 let attempts=0;const h=harness({fetch:(url,manifest,actor)=>Promise.resolve({ok:true,json:async()=>{
  if(url!=='/effects/Magic/library.json')return actor;
  if(++attempts===1){const bad=structuredClone(manifest);bad.frames[820].offsetX++;return bad;}
  return manifest;
 }})}),a=h.make();a.visual.update(player,0);await settle();assert.match(a.visual.debugState().loadError,/frame mismatch/);assert.equal(a.parent.children.length,0);a.visual.update(player,10);await settle();assert.equal(attempts,2);assert.equal(a.parent.children.length,1);a.visual.destroy();
 const h2=harness({fetch:(url,manifest,actor)=>{if(url!=='/effects/Magic/library.json')delete actor.frames[216];return Promise.resolve({ok:true,json:async()=>url==='/effects/Magic/library.json'?manifest:actor});}}),actor=h2.makeActor();actor.update(player);await settle();actor.tick(0);assert.equal(sword(actor.container).visible,false);
 h2.at(86);actor.tick(86);assert.equal(sword(actor.container).visible,true);actor.destroy();
 pass('wrong frame geometry re-fetches a repaired manifest, and missing body pixels hide sword until a real synchronized body frame exists');
}
console.log(passed+' meaningful production melee visual regression groups passed; fake Pixi/clock, no GPU, browser or original executable verification.');
