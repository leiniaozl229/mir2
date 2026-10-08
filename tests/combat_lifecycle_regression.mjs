import {installPlayUiContext} from './helpers/play_ui_context.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const profile=JSON.parse(read('content/classic-176/audio-playback.json'));
const nationalProfile=JSON.parse(read('content/classic-176/national-gameplay.json'));
const meleeProfile=JSON.parse(read('content/classic-176/melee-visual.json'));
const transpile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
const playSource=ts.createSourceFile('play.ts',read('apps/web/src/play.ts'),ts.ScriptTarget.ES2022,true);
const connect=playSource.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='connect');assert.ok(connect);
function callback(type){
 const found=[];const walk=node=>{if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='addEventListener'&&node.expression.expression.getText(playSource)==='active'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===type)found.push(node.arguments[1]);ts.forEachChild(node,walk);};
 walk(connect);assert.equal(found.length,1,`expected actual active ${type} callback`);return found[0].getText(playSource);
}
const update=playSource.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='update');assert.ok(update);
const cancelGroupConfirmation=playSource.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='cancelGroupConfirmation');assert.ok(cancelGroupConfirmation);
const authConstructor=playSource.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>declaration.name.getText(playSource)==='classicAuth'));assert.ok(authConstructor);
const authSource=ts.createSourceFile('classic-auth.ts',read('apps/web/src/classic-auth.ts'),ts.ScriptTarget.ES2022,true);
const authClass=authSource.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='ClassicAuth');assert.ok(authClass);
const authMethods=['bind','setBusy','showLogin','showSelect','showCreate','hide','hideEntryScenes','isEntrySceneOpen','selectedCharacterName','setDeleteEnabled','refreshDeleteButton','closeRegistrationView'].map(name=>{const method=authClass.members.find(member=>ts.isMethodDeclaration(member)&&member.name.getText(authSource)===name);assert.ok(method);return method.getText(authSource);});
const sceneCode=transpile(`class LifecycleAuth{
 constructor(root,onScene){this.selectionLabels={stop(){}};this.portraitAnimation={stop(){}};this.root=root;this.onScene=onScene;this.entryScenesRevision=0;this.loginScene={};this.selectScene={};this.createForm={};this.selected=0;this.characters=[];this.jobInput={value:'0'};this.sexInput={value:'0'};}
 hidePasswordChange(){}isPasswordChangeOpen(){return false;}renderSlots(){}renderCreate(){}
 ${authMethods.join('\n')}
}globalThis.LifecycleAuth=LifecycleAuth;`);
const playCode=transpile(`${update.getText(playSource)}\n${cancelGroupConfirmation.getText(playSource)}\n${authConstructor.getText(playSource)}\nglobalThis.auth=classicAuth;globalThis.receive=${callback('message')};globalThis.closeCurrent=${callback('close')};`);
const settle=async()=>{for(let i=0;i<50;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
class Target{
 constructor(){this.listeners=new Map();this.dataset={};this.hidden=false;this.attributes=new Map();}
 addEventListener(type,callback){const callbacks=this.listeners.get(type)??new Set();callbacks.add(callback);this.listeners.set(type,callbacks);}
 removeEventListener(type,callback){this.listeners.get(type)?.delete(callback);}
 emit(type,event={}){for(const callback of this.listeners.get(type)??[])callback({type,isTrusted:true,...event});}
 setAttribute(name,value){this.attributes.set(name,value);}querySelectorAll(){return [];}querySelector(){return null;}
}
class Scene{
 constructor(){this.x=this.y=0;this.children=[];this.style={};this.filters=[];this.alpha=1;this.visible=true;this.position={set:(x,y)=>{assert.ok(!this.destroyed,'position after close');this.x=x;this.y=y;}};this.anchor=this.pivot={set(){}};}
 addChild(...children){assert.ok(!this.destroyed,'child after close');this.children.push(...children);for(const child of children)child.parent=this;}
 destroy(options){assert.ok(!this.destroyed,'double destruction');this.destroyed=true;if(options?.children)for(const child of [...this.children])child.destroy();if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 clear(){return this;}circle(){return this;}fill(){return this;}stroke(){return this;}rect(){return this;}
 getBounds(){return {x:this.x,y:this.y,width:48,height:64};}
 set texture(value){assert.ok(!this.destroyed,'texture after close');this.currentTexture=value;}get texture(){return this.currentTexture;}
}
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
const player=(id,patch={})=>({id,x:10,y:10,direction:2,feature:0x00010400,name:'fixture',self:false,action:'standing',status:0,...patch});
function harness(options={}){
 let now=0,mediaMode='ok',frameId=0;const calls=[],media=[],pendingMedia=[],closeQueue=[],frames=new Map(),textures=[];
 const document=new Target(),window=new Target(),authRoot=new Target(),passwordField={value:'fixture-password',focus(){}};document.hidden=false;document.body={classList:{remove:name=>calls.push(['body.remove',name])}};document.querySelector=selector=>{if(selector==='#auth-overlay')return authRoot;if(selector==='#password')return passwordField;assert.fail(`unexpected document selector ${selector}`);};
 class Audio extends Target{
  constructor(url){super();this.url=url;this.paused=true;this.currentTime=0;this.playCalls=0;this.pauseCalls=0;media.push(this);}
  cloneNode(){return new Audio(this.url);}
  play(){this.playCalls++;this.paused=false;if(mediaMode==='deferred')return new Promise((resolve,reject)=>pendingMedia.push({audio:this,resolve,reject}));return Promise.resolve();}
  pause(){this.paused=true;this.pauseCalls++;}
 }
 const requestAnimationFrame=callback=>{const id=++frameId;frames.set(id,callback);return id;},cancelAnimationFrame=id=>frames.delete(id);
 const pixi={Container:Scene,Sprite:Scene,Graphics:Scene,Text:Scene,Texture:{EMPTY:{empty:true}},Assets:{load:url=>{const texture={url,source:{}};textures.push(texture);return options.textureGate?options.textureGate.promise.then(()=>texture):Promise.resolve(texture);}}};
 const magicManifest={sourceSha256:meleeProfile.evidence.sourceSha256,indexSha256:meleeProfile.evidence.indexSha256,sourceFrameCount:4010,frames:structuredClone(meleeProfile.frames)};
 const effectManifest={frames:Object.fromEntries(Array.from({length:64},(_,i)=>[i,{file:`${i}.png`,offsetX:0,offsetY:-24}]))};
 const actorManifest={profile:'national-2003-gameplay',frames:Object.fromEntries(Array.from({length:2400},(_,i)=>[i,{file:`${i}.png`,offsetX:0,offsetY:-40}]))};
 const globals={console,Error,performance:{now:()=>now},requestAnimationFrame,cancelAnimationFrame,fetch:url=>Promise.resolve({ok:true,json:async()=>url==='/effects/Magic/library.json'?magicManifest:url==='/effects/Effect/library.json'?effectManifest:actorManifest})};
 const module=(file,require)=>{const context={...globals,exports:{},require};installPlayUiContext(context);vm.runInContext(transpile(read(file)),context);return context.exports;};
 const national=module('apps/web/src/national-actors.ts',()=>nationalProfile);
 const melee=module('apps/web/src/melee-visual.ts',name=>name==='pixi.js'?pixi:meleeProfile);
  const actor=module('apps/web/src/online-actors.ts',name=>name==='pixi.js'?pixi:name==='./melee-visual'?melee:name==='./national-actors'?national:name==='./actor-palette'?{createActorPaletteFilter:()=>({destroy(){}})}:name==='./monster-visuals'?{resolveMonsterVisual:()=>undefined}:name==='./classic-layout'?{nationalUsesLayout:()=>false}:{MOVEMENT_DURATION_MS:600,MOVEMENT_SETTLE_MS:250,forcedMovementDuration:()=>360,visualDirection:d=>d&7,routeDirection:()=>2});
 const magic=module('apps/web/src/magic-effects.ts',()=>pixi);
 const audioContext={exports:{},require:()=>profile,Audio,document,window,Error,localStorage:{getItem:()=>null,setItem(){}}};vm.createContext(audioContext);vm.runInContext(transpile(read('apps/web/src/game-audio.ts')),audioContext);
 const audio=new audioContext.exports.GameAudio(new Target());audio.setPhase('world');
 const depth=new Scene(),visuals=new Map(),entities=new Map(),magicEffects=new magic.MagicEffects(depth,id=>entities.get(id));
 const tracked=prefix=>({clear:()=>calls.push([`${prefix}.clear`]),rejectPending:()=>calls.push([`${prefix}.reject`]),cancelSelection:()=>calls.push([`${prefix}.selection`]),cancelKeyBinding:()=>calls.push([`${prefix}.binding`]),resolve:()=>calls.push([`${prefix}.resolve`])});
 const active={close:()=>closeQueue.push(()=>context.closeCurrent()),send:data=>calls.push(['socket.send',JSON.parse(data)]),readyState:1};
 const context={systemDialog:{isOpen:()=>false,interrupt(){},show:async()=>'ok'},...globals,audio,magicEffects,groupPending:undefined,groupConfirmationSerial:0,groupConfirmationPending:undefined,registrationPending:false,setWorldConnectionState:()=>{},clearAuthenticationWait:()=>{},waitForResponse:()=>{},armCurrentAuthWait:undefined,renderGroup:()=>{},OnlineActor:actor.OnlineActor,visuals,entities,view:{depth},interact:()=>{},paperdoll:{setFeature:()=>{}},renderTargets:()=>{},refreshMiniMapMarkers:()=>{},document,window,
  active,socket:active,WebSocket:{OPEN:1},self:1,lastSequence:0,mapGeneration:5,agentObserver:{event:()=>{}},
  mining:{reset:()=>calls.push(['mining.reset'])},npcSession:{invalidate:()=>calls.push(['npc.invalidate'])},hideDialogue:()=>calls.push(['dialogue.hide']),clearTrade:()=>calls.push(['trade.clear']),
  inventory:tracked('inventory'),itemQuickBar:tracked('quickbar'),equipment:tracked('equipment'),skillBar:tracked('skills'),shop:tracked('shop'),repair:tracked('repair'),storage:tracked('storage'),
  pending:{x:1},pendingAction:{kind:'move'},held:{dx:1},rightPointer:1,doorRetry:{x:2},clickDestination:{x:3},pursuitTarget:2,pursuitHarvest:true,pursuitGroundItem:3,selectedMagic:4,
  stopCombat:()=>calls.push(['combat.stop']),scheduleReconnect:()=>calls.push(['reconnect.schedule']),reconnectEnabled:true,credentials:{fixture:true},reconnectAttempts:2,resumeCharacter:undefined,connection:{textContent:''},preloadPlayerLocomotion:()=>Promise.resolve(),loadQuest:()=>{},
 };
 installPlayUiContext(context);vm.runInContext(sceneCode,context);context.ClassicAuth=context.LifecycleAuth;vm.runInContext(playCode,context);
 let sequence=0;
 return {context,calls,audio,media,pendingMedia,depth,frames,textures,closeQueue,
  at:time=>{now=time;},tick:(visual,time)=>{now=time;visual.tick(time);},mode:value=>{mediaMode=value;},playing:()=>media.filter(instance=>!instance.paused),
  add:(id,patch)=>{context.update(player(id,patch));return visuals.get(id);},
  receive:message=>context.receive({data:JSON.stringify({sequence:++sequence,mapGeneration:5,message})}),
  flushClose:()=>{const callback=closeQueue.shift();assert.ok(callback,'expected async close');callback();}
 };
}
{
 const h=harness(),melee=h.add(11,{action:'attack',meleeKind:'power',swingSequence:1}),miner=h.add(12,{action:'heavyAttack',digFragment:true,swingSequence:2});await settle();
 h.tick(melee,86);h.tick(melee,172);h.tick(melee,173);assert.deepEqual(h.playing().map(audio=>audio.url),['/audio/52.wav','/audio/m7-1.wav']);
 h.tick(miner,449);assert.equal(h.context.magicEffects.debugMiningState().effects.length,0);h.tick(miner,450);await settle();assert.equal(h.playing().at(-1).url,'/audio/91.wav');assert.equal(h.context.magicEffects.debugMiningState().effects.length,1);
 h.context.closeCurrent();assert.ok(h.calls.some(call=>call[0]==='trade.clear'),'socket close must clear trade presentation and unlock its held inventory instance');assert.equal(h.audio.debugState().voices,0);assert.equal(h.context.magicEffects.debugMiningState().effects.length,0);assert.equal(h.depth.children.length,0);assert.equal(h.context.visuals.size,0);
 pass('baseline actual play update callbacks emit frame2 weapon/skill and frame5 DIG; current close destroys actors, mining effects and voices');
}
{
 const h=harness(),melee=h.add(11,{action:'attack',meleeKind:'power',swingSequence:1}),miner=h.add(12,{action:'heavyAttack',digFragment:true,swingSequence:2});await settle();h.tick(melee,86);h.tick(melee,172);h.tick(miner,449);
 assert.equal(h.media.length,0);h.context.closeCurrent();h.tick(melee,173);h.tick(miner,450);h.tick(melee,1000);h.tick(miner,1000);await settle();
 assert.equal(h.media.length,0);assert.equal(h.context.magicEffects.debugMiningState().effects.length,0);assert.equal(h.frames.size,0);assert.ok(melee.container.destroyed&&miner.container.destroyed);assert.equal(h.calls.filter(call=>call[0]==='reconnect.schedule').length,1);
 pass('actual current socket close before frame2/frame5 prevents retained production actors from creating old sword/mining audio or fragments');
}
{
 const gate=deferred(),h=harness({textureGate:gate}),old=h.add(11,{action:'attack',meleeKind:'fire',swingSequence:1});h.context.magicEffects.miningImpact(player(12));await settle();
 assert.ok(h.textures.length>0);h.context.closeCurrent();gate.resolve();await settle();h.tick(old,500);assert.equal(h.depth.children.length,0);assert.equal(h.frames.size,0);assert.equal(h.media.length,0);assert.equal(h.context.magicEffects.debugMiningState().effects.length,0);
 pass('pending real actor/sword/mining texture completion after close cannot attach sprites, reschedule mining frames or create sound');
}
{
 const h=harness(),current=h.add(11,{action:'attack',meleeKind:'power',swingSequence:1});h.context.magicEffects.miningImpact(player(12));await settle();h.tick(current,86);h.tick(current,172);h.audio.setPhase('login');await settle();const music=h.playing()[0],children=[...h.depth.children];h.context.socket={readyState:1};h.context.closeCurrent();
 assert.equal(h.context.visuals.size,1);assert.equal(current.container.destroyed,undefined);assert.equal(h.playing()[0],music);assert.equal(h.calls.length,0);assert.deepEqual(h.depth.children,children);assert.equal(h.context.magicEffects.debugMiningState().effects.length,1);assert.equal(h.frames.size,1);h.tick(current,173);assert.deepEqual(h.playing().map(audio=>audio.url),['/audio/log-in-long2.wav','/audio/52.wav','/audio/m7-1.wav']);
 pass('old active socket close returns before clearing the current visuals/effects/audio and the current actor still owns its valid impact');
}
{
 const h=harness();h.receive({type:'characters',characters:[]});await settle();assert.equal(h.audio.debugState().music,'sellect-loop2.wav');assert.equal(h.context.auth.root.dataset.authScene,'select');
 h.context.auth.onExit();await settle();assert.equal(h.closeQueue.length,1);assert.equal(h.context.reconnectEnabled,false);assert.equal(h.context.auth.root.dataset.authScene,'login');assert.equal(h.audio.debugState().music,'log-in-long2.wav');
 const old=h.playing()[0];h.flushClose();await settle();assert.equal(old.paused,false);assert.equal(h.context.auth.root.dataset.authScene,'login');assert.equal(h.audio.debugState().phase,'login');assert.equal(h.audio.debugState().music,'log-in-long2.wav');assert.equal(h.playing().length,1);assert.ok(h.playing()[0].url.endsWith('/log-in-long2.wav'));assert.equal(h.calls.some(call=>call[0]==='reconnect.schedule'),false);
 const restored=h.playing()[0];h.context.auth.showLogin();await settle();assert.equal(h.playing()[0],restored);assert.equal(restored.playCalls,1);
 pass('actual characters exit handler then asynchronous close preserves login BGM through real auth scene callback and repeated same-phase login does not duplicate it');
}
{
 const h=harness();h.mode('deferred');h.audio.play('swing');h.context.reconnectEnabled=false;h.context.closeCurrent();assert.equal(h.audio.debugState().music,'log-in-long2.wav');assert.equal(h.pendingMedia.length,2);
 const [oldEffect,newLogin]=h.pendingMedia;oldEffect.resolve();newLogin.resolve();await settle();assert.equal(oldEffect.audio.paused,true);assert.equal(newLogin.audio.paused,false);assert.equal(h.playing().length,1);assert.equal(h.playing()[0],newLogin.audio);assert.equal(h.context.visuals.size,0);
 pass('old one-shot play promise after actual close cannot revive effects or pause the newly started login music');
}
assert.equal(groups,6);
console.log(`combat lifecycle production regression: ${groups} groups PASS`);
for(const file of ['apps/web/src/play.ts','apps/web/src/game-audio.ts','apps/web/src/online-actors.ts','apps/web/src/melee-visual.ts','apps/web/src/magic-effects.ts','apps/web/src/classic-auth.ts','content/classic-176/audio-playback.json','tests/combat_lifecycle_regression.mjs'])console.log(`SHA256 ${crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')} ${file}`);
console.log('Scope: actual AST-extracted play update/message/close/auth construction and production auth scene methods, OnlineActor/MeleeVisual/MagicEffects/GameAudio with fake Pixi/media; no native/browser visual, audio output or TCP disconnect timing claim.');
