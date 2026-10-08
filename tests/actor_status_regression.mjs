import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const contract=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/actor-status.json'),'utf8'));
const profile=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/national-gameplay.json'),'utf8'));
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const actorCode=compile('apps/web/src/online-actors.ts');
const npcContract=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/npc-visuals.json'),'utf8'));
const npcContext={exports:{},require:()=>({default:npcContract})};
vm.createContext(npcContext);vm.runInContext(compile('apps/web/src/npc-visuals.ts'),npcContext);
const npc=npcContext.exports;
const paletteCode=compile('apps/web/src/actor-palette.ts');
const lookup=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/actor-status-palette.json'),'utf8'));
const nationalContext={exports:{},require:()=>({default:profile})};
vm.createContext(nationalContext);vm.runInContext(compile('apps/web/src/national-actors.ts'),nationalContext);
const national=nationalContext.exports;
const frames=Object.fromEntries(contract.bubble.frames.map(frame=>[frame.index,{...frame,file:`${frame.index}.png`}]));
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const entity={id:1,x:10,y:10,direction:2,feature:0x00010200,name:'actor',self:false,action:'standing',status:0};
const shield=Number(contract.bubble.mask);
let passed=0;
const pass=label=>{passed++;console.log(`PASS ${label}`);};

class Scene {
 constructor(){this.x=this.y=0;this.children=[];this.style={};this.tint=0xffffff;this.alpha=1;this.filters=[];
  this.position={set:(x,y)=>{assert.ok(!this.destroyed,'position write after sprite destruction');this.x=x;this.y=y;}};
  this.anchor=this.pivot={set(){}};
 }
 addChild(...children){assert.ok(!this.destroyed,'child attached to destroyed actor');this.children.push(...children);for(const child of children)child.parent=this;}
 destroy(options){assert.ok(!this.destroyed,'sprite destroyed twice');this.destroyed=true;if(options?.children)for(const child of [...this.children])child.destroy();if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 clear(){this.circles=[];return this;}circle(...values){this.circles??=[];this.circles.push(values);return this;}fill(){return this;}stroke(){return this;}rect(x,y,width,height){this.rectangles??=[];this.rectangles.push({x,y,width,height});return this;}
 getBounds(){return {x:this.x,y:this.y,width:48,height:64};}
 set texture(value){assert.ok(!this.destroyed,'texture write after sprite destruction');this.currentTexture=value;}
 get texture(){return this.currentTexture;}
}
class StatusFilter {constructor(options){this.options=options;}destroy(){assert.ok(!this.destroyed,'filter destroyed twice');this.destroyed=true;}}
class BufferSource {constructor(options){Object.assign(this,options);this.style={scaleMode:options.scaleMode,addressMode:options.addressMode};}}
class StatusTexture {static EMPTY={empty:true};constructor(options){this.source=options.source;}}
class Uniforms {constructor(values){this.uniforms=values;}}
function harness(options={}){
 let now=0,nationalSkin=options.nationalSkin??false;const fetches=[],loads=[];const textures=[];
 const pixi={Container:Scene,Graphics:Scene,Sprite:Scene,Text:Scene,Filter:StatusFilter,BufferImageSource:BufferSource,Texture:StatusTexture,UniformGroup:Uniforms,GlProgram:{from:options=>options},GpuProgram:{from:options=>options},Assets:{load:url=>{
  loads.push(url);const texture={source:{},url};textures.push(texture);return options.load?.(url,texture)??Promise.resolve(texture);
 }}};
 const paletteContext={exports:{},Uint8Array,require:name=>name==='pixi.js'?pixi:{default:name.endsWith('actor-status-palette.json')?lookup:contract}};
 vm.createContext(paletteContext);vm.runInContext(paletteCode,paletteContext);const palette=paletteContext.exports;
 const context={exports:{},console,performance:{now:()=>now},
  require:name=>name==='pixi.js'?pixi:name==='./actor-palette'?palette:name==='./national-actors'?national:name==='./npc-visuals'?npc:name==='./monster-visuals'?{resolveMonsterVisual:()=>undefined}:name==='./classic-layout'?{nationalUsesLayout:()=>nationalSkin}:{MOVEMENT_DURATION_MS:600,MOVEMENT_SETTLE_MS:250,forcedMovementDuration:()=>360,visualDirection:d=>d&7,routeDirection:()=>2},
  fetch:url=>{fetches.push(url);if(url==='/effects/Magic/library.json')return options.fetch?.()??Promise.resolve({ok:true,json:async()=>({frames})});
   if(options.bodyFetch)return options.bodyFetch(url);
   if(!options.bodyReady)return new Promise(()=>{});
   return Promise.resolve({ok:true,json:async()=>({profile:'national-2003-gameplay',frames:Object.fromEntries(Array.from({length:2400},(_,i)=>[i,{file:`${i}.png`,offsetX:3,offsetY:-40}]))})});
  }
 };
 vm.createContext(context);vm.runInContext(actorCode,context);
 return {...context.exports,...palette,fetches,loads,textures,at:time=>{now=time;},setNationalSkin:value=>{nationalSkin=value;},makeActor:callback=>new context.exports.OnlineActor({...entity},undefined,callback),makeEffects:()=>new context.exports.ActorStatusEffects(new Scene())};
}
const shieldSprite=parent=>parent.children.find(child=>child.label==='magic-shield');
const statusState=(patch={})=>({feature:entity.feature,status:shield,action:'standing',...patch});

{
 const h=harness(),actor=h.makeActor();actor.update({...entity,hp:25,maxHp:100});actor.setLabelOffset(-18,72);
 const healthBack=actor.container.children[4],health=actor.container.children[5],label=actor.container.children[6];
 assert.equal(label.x,96);assert.equal(healthBack.rectangles.at(-1).x,76);assert.equal(health.rectangles.at(-1).x,77);
 actor.destroy();pass('health bar tracks both vertical and horizontal name-label avoidance offsets');
}

{
 const h=harness({nationalSkin:true}),player=h.makeActor();player.update({...entity});assert.equal(player.container.cursor,'crosshair');
 const npc=h.makeActor();npc.update({...entity,feature:50});assert.equal(npc.container.cursor,'pointer');
 const dead=h.makeActor();dead.update({...entity,dead:true});assert.equal(dead.container.cursor,'auto');
 h.setNationalSkin(false);player.tick(0);npc.tick(0);dead.tick(0);
 assert.equal(player.container.cursor,'url("/ui/Cursors/Cursor_Normal_Atk.CUR"), crosshair');
 assert.equal(npc.container.cursor,'url("/ui/Cursors/Cursor_Npc.CUR"), pointer');
 assert.equal(dead.container.cursor,'url("/ui/Cursors/Cursor_Default.CUR"), auto');
 player.destroy();npc.destroy();dead.destroy();pass('production actor hit targets follow the active skin cursor policy and refresh after the national atlas mounts');
}

// These six installed-asset hashes are genuine pixels, not evidence that
// the old executable or a browser has displayed the animation correctly.
const manifestPath=path.join(root,contract.evidence.manifest);
if(fs.existsSync(manifestPath)){
 const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
 assert.equal(manifest.sourceSha256,contract.evidence.sourceSha256);assert.equal(manifest.indexSha256,contract.evidence.indexSha256);assert.equal(manifest.sourceFrameCount,4010);
 for(const expected of contract.bubble.frames){
  const actual=manifest.frames[expected.index];assert.ok(actual,`missing installed shield frame ${expected.index}`);
  for(const key of ['width','height','offsetX','offsetY','sha256'])assert.equal(actual[key],expected[key],`${expected.index}/${key}`);
  const png=fs.readFileSync(path.join(path.dirname(manifestPath),actual.file));
  assert.equal(crypto.createHash('sha256').update(png).digest('hex'),expected.sha256);
  assert.equal(png.readUInt32BE(16),expected.width);assert.equal(png.readUInt32BE(20),expected.height);assert.ok(expected.width>1&&expected.height>1);
 }
 pass('same national Magic library: six real PNG hashes, dimensions and signed offsets');
}else console.log('SKIP installed native PNGs absent; fixtures below do not establish native_pixels');

{
 const h=harness();
 assert.equal(h.actorDrawEffect(0x40000000),'red');assert.equal(h.actorDrawEffect(-2147483648),'green');assert.equal(h.actorDrawEffect(0xC0000000),'red');
 let status=0;for(const entry of contract.drawEffect.priorityLowToHigh){status|=Number(entry.mask);assert.equal(h.actorDrawEffect(status),entry.effect);}
 for(const effect of ['red','green'])assert.deepEqual(Array.from(h.mapActorPalettePixel(effect,[18,90,180,64])),[...lookup.palette[lookup.brightnessMaps[effect][96]],64]);
 assert.notDeepEqual(Array.from(h.mapActorPalettePixel('red',[18,90,180,255])),Array.from(h.mapActorPalettePixel('green',[18,90,180,255])));
 assert.equal(h.actorDrawEffect(0),'none');pass('distinct red/green native-palette colors, alpha and reference overlap priority');
}
{
 const h=harness(),parent=new Scene(),effects=new h.ActorStatusEffects(parent);
 effects.update(statusState({status:0,action:'spell'}));await settle();assert.equal(h.fetches.length,0);assert.equal(parent.children.length,0);
 effects.update(statusState({feature:80}));await settle();assert.equal(h.fetches.length,0);
 effects.update(statusState());await settle();assert.equal(h.fetches.length,1);assert.equal(h.loads.length,6);
 const sprite=shieldSprite(parent);assert.equal(sprite.zIndex,3);assert.equal(sprite.blendMode,'screen');assert.equal(sprite.eventMode,'none');
 for(const [time,index] of [[0,3890],[119,3890],[120,3891],[240,3892],[360,3890]]){
  h.at(time);effects.tick(time);assert.equal(effects.debugState().frame,index);assert.equal(sprite.x,frames[index].offsetX);assert.equal(sprite.y,frames[index].offsetY);
 }
 parent.position.set(480,320);assert.equal(sprite.x+parent.x,459);assert.equal(sprite.y+parent.y,242);
 assert.ok(h.textures.every(texture=>texture.source.scaleMode==='nearest'));
 h.at(1200000);effects.tick(1200000);assert.equal(parent.children.length,1);assert.equal(effects.debugState().active,true);
 effects.destroy();assert.equal(parent.children.length,0);pass('confirmed player shield only, 120 ms normal loop, screen layer, foot offsets, nearest pixels and no TTL');
}
{
 const h=harness(),parent=new Scene(),effects=new h.ActorStatusEffects(parent);effects.update(statusState());await settle();
 h.at(1000);effects.update(statusState({action:'struck',struckSequence:1}));assert.equal(effects.debugState().frame,3900);
 h.at(1100);effects.update(statusState({action:'struck',struckSequence:1}));
 for(const [time,index] of [[1119,3900],[1120,3901],[1240,3902]]){h.at(time);effects.tick(time);assert.equal(effects.debugState().frame,index);const sprite=shieldSprite(parent);assert.equal(sprite.x,frames[index].offsetX);assert.equal(sprite.y,frames[index].offsetY);}
 h.at(1360);effects.tick(1360);assert.ok(contract.bubble.normal.indices.includes(effects.debugState().frame));
 h.at(1400);effects.update(statusState({action:'struck',struckSequence:2}));assert.equal(effects.debugState().frame,3900);
 h.at(1420);effects.update(statusState({action:'standing',struckSequence:2}));assert.ok(contract.bubble.normal.indices.includes(effects.debugState().frame));
 effects.update(statusState({status:0}));assert.equal(parent.children.length,0);
 effects.update(statusState());await settle();effects.update(statusState({action:'dying'}));assert.equal(parent.children.length,0);
 effects.update(statusState({dead:true}));await settle();assert.equal(parent.children.length,0);
 effects.update(statusState());await settle();assert.equal(parent.children.length,1);assert.equal(h.loads.length,6);
 effects.destroy();effects.tick(2000);effects.update(statusState());await settle();assert.equal(parent.children.length,0);
 pass('struck triplet, repeated hit sequence, refresh clock preservation, action exit, revoke, dying, dead and destruction');
}
{
 const gate=deferred(),h=harness({fetch:()=>gate.promise}),parent=new Scene(),effects=new h.ActorStatusEffects(parent);
 effects.update(statusState());effects.update(statusState({status:0}));gate.resolve({ok:true,json:async()=>({frames})});await settle();assert.equal(parent.children.length,0);
 effects.update(statusState());effects.update(statusState({status:0}));effects.update(statusState());await settle();assert.equal(parent.children.length,1);assert.equal(h.fetches.length,1);
 effects.destroy();pass('status revoke before manifest resolution and remove/re-add generation race');
}
{
 const gate=deferred(),h=harness({load:(_url,texture)=>gate.promise.then(()=>texture)}),parent=new Scene(),effects=new h.ActorStatusEffects(parent);
 effects.update(statusState());await settle();effects.update(statusState({status:0}));effects.update(statusState());h.at(240);gate.resolve();await settle();
 assert.equal(parent.children.length,1);assert.equal(effects.debugState().frame,3892);assert.equal(h.loads.length,6);effects.destroy();
 pass('remove/re-add during texture loading keeps one current sprite and its elapsed animation phase');
}
{
 const gate=deferred(),h=harness({load:(_url,texture)=>gate.promise.then(()=>texture)}),parent=new Scene(),effects=new h.ActorStatusEffects(parent);
 effects.update(statusState());await settle();assert.equal(h.loads.length,6);effects.destroy();gate.resolve();await settle();assert.equal(parent.children.length,0);
 pass('actor destruction during six deferred texture loads never attaches or writes a late sprite');
}
{
 let attempts=0;const h=harness({fetch:()=>Promise.resolve(++attempts===1?{ok:false}:{ok:true,json:async()=>({frames})})}),parent=new Scene(),effects=new h.ActorStatusEffects(parent);
 effects.update(statusState());await settle();assert.ok(effects.debugState().loadError);assert.equal(parent.children.length,0);
 effects.update(statusState());await settle();assert.equal(parent.children.length,1);assert.equal(h.fetches.length,2);effects.destroy();
 pass('failed manifest is observable and retryable without a fake shield');
}
{
 let failure=true;const h=harness({load:(url,texture)=>url.endsWith('/3901.png')&&failure?(failure=false,Promise.reject(new Error('transient texture failure'))):Promise.resolve(texture)}),parent=new Scene(),effects=new h.ActorStatusEffects(parent);
 effects.update(statusState());await settle();assert.ok(effects.debugState().loadError);assert.equal(parent.children.length,0);
 effects.update(statusState());await settle();assert.equal(parent.children.length,1);assert.equal(h.loads.length,7);effects.destroy();
 pass('one failed texture retries only that texture and preserves successful shared loads');
}
{
 const incomplete={...frames};delete incomplete[3902];const h=harness({fetch:()=>Promise.resolve({ok:true,json:async()=>({frames:incomplete})})}),parent=new Scene(),effects=new h.ActorStatusEffects(parent);
 effects.update(statusState());await settle();assert.match(effects.debugState().loadError,/3902/);assert.equal(parent.children.length,0);effects.destroy();
 pass('missing required hit frame is reported and cannot become a partial dummy animation');
}
{
 const h=harness(),actor=h.makeActor();actor.update({...entity,status:shield});await settle();assert.equal(actor.debugState().framesReady,false);assert.equal(actor.debugState().statusEffects.visible,true);
 h.at(120);actor.tick(120);assert.equal(actor.debugState().statusEffects.frame,3891);
 const sameKey=actor.debugState().poseKey;actor.update({...entity,status:shield|0x80000000});
 assert.equal(actor.debugState().poseKey,sameKey);assert.equal(actor.debugState().statusColor,'green');
 const [,weapon,body,hair]=actor.container.children;assert.equal(weapon.filters.length,0);assert.equal(body.filters.length,1);assert.equal(hair.filters[0],body.filters[0]);
 const greenFilter=body.filters[0];actor.update({...entity,status:shield|0xC0000000});assert.equal(actor.debugState().statusColor,'red');assert.equal(greenFilter.destroyed,true);
 const redFilter=body.filters[0];actor.update({...entity,status:0});assert.equal(actor.debugState().statusEffects.visible,false);assert.equal(actor.debugState().statusColor,'none');assert.equal(redFilter.destroyed,true);assert.equal(body.filters.length,0);assert.equal(hair.filters.length,0);
 actor.destroy();pass('production OnlineActor ticks shield while body loads and updates body/hair color despite an unchanged pose key');
}
{
 const h=harness(),actor=h.makeActor();actor.update({...entity,status:shield});await settle();
 h.at(100);actor.update({...entity,status:shield,action:'struck',struckSequence:1});await settle();assert.equal(actor.debugState().statusEffects.frame,3900);const hitKey=actor.debugState().poseKey;
 h.at(220);actor.tick(220);assert.equal(actor.debugState().statusEffects.frame,3901);
 h.at(230);actor.update({...entity,status:shield|0x40000000,action:'struck',struckSequence:1});assert.equal(actor.debugState().statusEffects.frame,3901);assert.equal(actor.debugState().poseKey,hitKey);
 h.at(250);actor.update({...entity,status:shield,action:'struck',struckSequence:2});assert.equal(actor.debugState().statusEffects.frame,3900);assert.notEqual(actor.debugState().poseKey,hitKey);
 h.at(610);actor.tick(610);assert.ok(contract.bubble.normal.indices.includes(actor.debugState().statusEffects.frame));
 actor.update({...entity,status:shield,action:'standing',struckSequence:2});actor.update({...entity,status:shield,action:'struck',struckSequence:2});
 assert.ok(contract.bubble.normal.indices.includes(actor.debugState().statusEffects.frame),'stale resource refresh replays an already completed hit');actor.destroy();
 pass('production hit sequence restarts shield and body pose while same-hit status/resource refreshes cannot replay it');
}
{
 const h=harness({bodyReady:true}),actor=h.makeActor();actor.update({...entity,status:shield});await settle();
 h.at(100);actor.update({...entity,status:shield,action:'struck',struckSequence:1});await settle();actor.tick(100);
 const body=actor.container.children[2],firstHitTexture=body.texture;
 h.at(180);actor.tick(180);assert.notEqual(body.texture,firstHitTexture);
 h.at(210);actor.update({...entity,status:shield,action:'struck',struckSequence:2});await settle();actor.tick(210);assert.equal(body.texture,firstHitTexture);
 h.at(280);actor.tick(280);assert.notEqual(body.texture,firstHitTexture);
 h.at(420);actor.tick(420);await settle();assert.equal(actor.debugState().action,'standing');assert.ok(contract.bubble.normal.indices.includes(actor.debugState().statusEffects.frame));actor.destroy();
 pass('loaded production body redraws first struck frame on a new hit and shield returns to normal when the native body action ends');
}
{
 const h=harness({bodyReady:true}),actor=h.makeActor();actor.update({...entity,status:shield});await settle();
 actor.update({...entity,x:11,status:shield,action:'walking'},0);
 h.at(100);actor.update({...entity,x:12,status:shield,action:'walking'},100);
 h.at(200);actor.update({...entity,x:13,status:0x40000000,action:'walking'},200);
 assert.equal(actor.debugState().queuedMovements,2);assert.equal(actor.debugState().statusEffects.visible,false);assert.equal(actor.debugState().statusColor,'red');
 h.at(600);actor.tick(600);await settle();assert.equal(actor.debugState().statusEffects.status,0x40000000);assert.equal(actor.debugState().statusColor,'red');assert.equal(shieldSprite(actor.container),undefined);
 h.at(1200);actor.tick(1200);await settle();h.at(1800);actor.tick(1800);h.at(2051);actor.tick(2051);await settle();
 assert.equal(actor.debugState().action,'standing');assert.equal(actor.debugState().statusEffects.status,0x40000000);assert.equal(actor.debugState().statusEffects.visible,false);
 actor.update({...entity,x:14,status:shield,action:'walking'},2100);await settle();actor.update({...entity,x:15,status:shield,action:'walking'},2200);
 actor.update({...entity,x:14,status:shield,dead:true,action:'dying'},2300);await settle();assert.equal(actor.debugState().queuedMovements,0);assert.equal(actor.debugState().statusEffects.visible,false);
 h.at(3000);actor.tick(3000);assert.equal(actor.debugState().statusEffects.visible,false);actor.destroy();
 pass('queued old movement cannot restore a revoked shield/color and death clears queued actions and the effect layer');
}
{
 const h=harness(),a=new Scene(),b=new Scene(),one=new h.ActorStatusEffects(a),two=new h.ActorStatusEffects(b);
 one.update(statusState());two.update(statusState());await settle();assert.equal(h.fetches.length,1);assert.equal(h.loads.length,6);assert.equal(a.children.length,1);assert.equal(b.children.length,1);
 one.destroy();h.at(240);two.tick(240);assert.equal(b.children.length,1);assert.equal(two.debugState().frame,3892);two.destroy();
 pass('multiple production actors share assets while retaining independent effect lifetimes');
}
{
 const h=harness({bodyReady:true}),impacts=[],actor=h.makeActor(e=>impacts.push(e));
 actor.update({...entity,action:'heavyAttack',digFragment:true,swingSequence:1});await settle();
 for(const time of [0,89,90,360,449]){h.at(time);actor.tick(time);assert.equal(impacts.length,0);}
 h.at(450);actor.tick(450);assert.equal(impacts.length,1);assert.equal(impacts[0].digFragment,false);assert.equal(impacts[0].direction,entity.direction);assert.equal(impacts[0].x,entity.x);
 actor.tick(451);actor.update({...entity,action:'heavyAttack',digFragment:true,swingSequence:1});actor.tick(500);assert.equal(impacts.length,1);
 h.at(540);actor.tick(540);await settle();assert.equal(actor.debugState().action,'standing');
 actor.update({...entity,action:'heavyAttack',digFragment:true,swingSequence:1});await settle();h.at(990);actor.tick(990);assert.equal(impacts.length,1,'same completed server swing replayed');
 h.at(1000);actor.update({...entity,action:'heavyAttack',digFragment:true,swingSequence:2});await settle();h.at(1449);actor.tick(1449);assert.equal(impacts.length,1);h.at(1450);actor.tick(1450);assert.equal(impacts.length,2);
 actor.destroy();pass('production heavy-hit source frame 5 at 450ms consumes real DIG once and a new sequence replays the action');
}
{
 const h=harness({bodyReady:true}),impacts=[],actor=h.makeActor(e=>impacts.push(e));
 actor.update({...entity,action:'heavyAttack',digFragment:false,swingSequence:1});await settle();h.at(450);actor.tick(450);assert.equal(impacts.length,0);
 actor.update({...entity,action:'heavyAttack',digFragment:true,swingSequence:1});actor.tick(451);assert.equal(impacts.length,1);
 h.at(500);actor.update({...entity,action:'attack',digFragment:true,swingSequence:2});await settle();h.at(950);actor.tick(950);assert.equal(impacts.length,1);
 h.at(1000);actor.update({...entity,action:'heavyAttack',digFragment:false,swingSequence:3});await settle();h.at(1450);actor.tick(1450);assert.equal(impacts.length,1);
 actor.destroy();pass('only confirmed DIG on heavyAttack can trigger; a late marker in the current last frame is consumed');
}
{
 for(const cancel of ['standing','dying','destroy']){
  const gate=deferred(),h=harness({bodyFetch:()=>gate.promise}),impacts=[],actor=h.makeActor(e=>impacts.push(e));
  actor.update({...entity,action:'heavyAttack',digFragment:true,swingSequence:1});h.at(100);
  if(cancel==='destroy')actor.destroy();else actor.update({...entity,action:cancel,dead:cancel==='dying',digFragment:true,swingSequence:1});
  gate.resolve({ok:true,json:async()=>({profile:'national-2003-gameplay',frames:Object.fromEntries(Array.from({length:2400},(_,i)=>[i,{file:`${i}.png`,offsetX:3,offsetY:-40}]))})});await settle();
  h.at(500);actor.tick(500);assert.equal(impacts.length,0,cancel);if(cancel!=='destroy')actor.destroy();
 }
 const gate=deferred(),h=harness({bodyFetch:()=>gate.promise}),impacts=[],actor=h.makeActor(e=>impacts.push(e));
 actor.update({...entity,action:'heavyAttack',digFragment:true,swingSequence:1});h.at(600);
 gate.resolve({ok:true,json:async()=>({profile:'national-2003-gameplay',frames:Object.fromEntries(Array.from({length:2400},(_,i)=>[i,{file:`${i}.png`,offsetX:3,offsetY:-40}]))})});await settle();actor.tick(600);assert.equal(impacts.length,0);assert.equal(actor.debugState().action,'standing');actor.destroy();
 pass('cancel/death/map destruction and post-expiration async body loads cannot emit stale mining impact');
}
{
 for(let direction=0;direction<8;direction++){
  const pose=npc.nativeNpcPose(327730,direction),first=300+(direction%3)*10;
  assert.deepEqual([...pose.indices],[first,first+1,first+2,first+3]);assert.equal(pose.interval,200);
 }
 for(const [appearance,offset] of [[23,1380],[24,1470],[25,1530],[27,1650],[32,1950],[43,2580],[47,2640],[49,2760]])assert.equal(npc.nativeNpcPose((appearance<<16)|50,2).offset,offset);
 assert.equal(npc.nativeNpcPose(0,0),undefined);assert.equal(npc.nativeNpcPose((50<<16)|50,0),undefined);assert.equal(npc.nativeNpcPose(327730,NaN),undefined);
 pass('NPC appearance segments, three direction banks and native-source bounds prevent index-5 or shape-0 fallback');
}
const npcLibrary=()=>({...npcContract,profile:'national-2003-gameplay',frames:Object.fromEntries([300,301,302,303,310,311,312,313,320,321,322,323].map(index=>[index,{file:`${index}.png`,offsetX:7,offsetY:-53}]))});
const npcEntity={...entity,feature:327730,direction:7,name:'NPC',action:'standing'};
{
 const gate=deferred(),h=harness({bodyFetch:()=>gate.promise}),actor=h.makeActor();
 actor.update(entity);assert.equal(actor.container.children[0].circles.length,1);
 gate.resolve({ok:true,json:async()=>({profile:'national-2003-gameplay',frames:Object.fromEntries(Array.from({length:2400},(_,index)=>[index,{file:`${index}.png`,offsetX:3,offsetY:-40}]))})});
 await settle();actor.tick(0);assert.equal(actor.debugState().framesReady,true);assert.equal(actor.container.children[0].circles.length,0);
 actor.destroy();pass('player initial-load fallback clears only after the complete real pose is ready');
}
{
 const h=harness({bodyFetch:()=>Promise.resolve({ok:true,json:async()=>npcLibrary()})}),actor=h.makeActor();
 actor.update(npcEntity);await settle();h.at(0);actor.tick(0);
 const body=actor.container.children[2],marker=actor.container.children[0];
 assert.ok(body.texture.url.endsWith('/310.png'));assert.equal(body.x,7);assert.equal(body.y,-53);assert.equal(marker.circles.length,0);
 for(const [time,index] of [[199,310],[200,311],[400,312],[600,313],[800,310]]){h.at(time);actor.tick(time);assert.ok(body.texture.url.endsWith(`/${index}.png`));}
 actor.update({...npcEntity,name:'updated NPC'});assert.equal(marker.circles.length,0,'same-pose updates must not redraw the placeholder');
 assert.equal(h.loads.filter(url=>url.includes('NPC00')).length,4);assert.ok(!h.loads.some(url=>url.endsWith('/5.png')));
 actor.destroy();pass('production NPC loads four real body frames, animates, preserves signed offsets and keeps resolved markers clear');
}
{
 let valid=false;const h=harness({bodyFetch:()=>Promise.resolve({ok:true,json:async()=>({...npcLibrary(),sourceSha256:valid?npcContract.sourceSha256:'different-client'})})}),actor=h.makeActor();
 actor.update(npcEntity);await settle();assert.ok(actor.debugState().loadError);assert.equal(h.loads.length,0);assert.equal(actor.debugState().framesReady,false);
 valid=true;actor.update(npcEntity);await settle();actor.tick(0);assert.equal(actor.debugState().loadError,undefined);assert.equal(actor.debugState().framesReady,true);
 assert.equal(h.fetches.filter(url=>url.includes('NPC00')).length,2);
 actor.destroy();pass('wrong-version NPC library is rejected before texture loads and a later update retries corrected bytes');
}
{
 let missing=true;const h=harness({bodyFetch:()=>Promise.resolve({ok:true,json:async()=>{const lib=npcLibrary();if(missing)delete lib.frames[313];return lib;}})}),actor=h.makeActor();
 actor.update(npcEntity);await settle();assert.equal(actor.debugState().framesReady,false);assert.ok(actor.debugState().loadError.includes('313'));assert.equal(h.loads.length,0);
 missing=false;actor.update(npcEntity);await settle();assert.equal(actor.debugState().framesReady,true);
 actor.destroy();pass('partial NPC segments fail without displaying filler frames and recover after manifest repair');
}
{
 let rejectTexture=true;const h=harness({bodyFetch:()=>Promise.resolve({ok:true,json:async()=>npcLibrary()}),load:(url,texture)=>url.endsWith('/313.png')&&rejectTexture?Promise.reject(new Error('PNG unavailable')):Promise.resolve(texture)}),actor=h.makeActor();
 actor.update(npcEntity);await settle();assert.equal(actor.debugState().framesReady,false);assert.ok(actor.debugState().loadError.includes('PNG unavailable'));
 rejectTexture=false;actor.update(npcEntity);await settle();actor.tick(0);assert.equal(actor.debugState().framesReady,true);assert.equal(h.loads.filter(url=>url.endsWith('/313.png')).length,2);
 actor.destroy();pass('failed NPC PNG promises are evicted so a later real update can recover');
}
{
 const old=deferred(),h=harness({bodyFetch:()=>old.promise}),actor=h.makeActor();
 actor.update(npcEntity);actor.update({...npcEntity,direction:2});
 old.resolve({ok:true,json:async()=>npcLibrary()});await settle();actor.tick(0);assert.ok(actor.container.children[2].texture.url.endsWith('/320.png'));
 actor.destroy();
 const gate=deferred(),destroyed=harness({bodyFetch:()=>gate.promise}),removed=destroyed.makeActor();removed.update(npcEntity);removed.destroy();gate.resolve({ok:true,json:async()=>npcLibrary()});await settle();
 pass('changed NPC directions discard late poses and removed actors never receive stale asynchronous bodies');
}
{
 const manifestPath=path.join(root,'assets/web/actors/NPC00/library.json');
 if(fs.existsSync(manifestPath)){
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));assert.equal(npc.nativeNpcLibraryMatches(manifest),true);
  for(let direction=0;direction<3;direction++)for(const index of npc.nativeNpcPose(327730,direction).indices){const frame=manifest.frames[index];assert.ok(frame.width>20&&frame.height>50);const bytes=fs.readFileSync(path.join(path.dirname(manifestPath),frame.file));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),frame.sha256);assert.equal(bytes.readUInt32BE(16),frame.width);assert.equal(bytes.readUInt32BE(20),frame.height);}
  pass('all 12 appearance-5 frames exist with original library locks and byte-verified full NPC body geometry');
 }else console.log('SKIP installed NPC PNGs absent; source fixtures do not prove original pixels');
}
console.log(`${passed} actor-status groups passed; fake Pixi/clock regression does not establish browser_runtime or native_runtime.`);
