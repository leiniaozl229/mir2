import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class Scene {
 constructor(){this.x=this.y=0;this.children=[];this.style={};this.position={set:(x,y)=>{this.x=x;this.y=y;}};this.pivot=this.anchor={set(){}};}
 addChild(...children){this.children.push(...children);for(const child of children)child.parent=this;}
 destroy(){this.destroyed=true;if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
 clear(){return this;}circle(){return this;}fill(){return this;}stroke(){return this;}rect(){return this;}
}
let now=0,nextFrame=0;const callbacks=new Map(),loads=[];
const context={exports:{},performance:{now:()=>now},requestAnimationFrame:callback=>{callbacks.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>callbacks.delete(id),
 require:()=>({Container:Scene,Sprite:Scene,Assets:{load:url=>{loads.push(url);return Promise.resolve({source:{},url});}}}),
 fetch:()=>Promise.resolve({ok:true,json:()=>Promise.resolve({frames:Object.fromEntries(Array.from({length:6},(_,i)=>[1630+i,{file:`${1630+i}.png`,offsetX:-15,offsetY:-40}]))})})};
vm.createContext(context);vm.runInContext(compile('apps/web/src/magic-effects.ts'),context);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const tick=time=>{now=time;const entries=[...callbacks.values()];callbacks.clear();for(const callback of entries)callback(time);};
const depth=new Scene(),effects=new context.exports.MagicEffects(depth,()=>undefined),event={id:1,x:301,y:611,eventType:5,eventParam:37};
effects.showEvent(event);effects.showEvent(event);await settle();
check(depth.children.length===1&&loads.length===6,'duplicate event creates a second firewall or reloads the frames');
check(depth.children[0].x===301*48&&depth.children[0].y===611*32,'firewall does not retain server tile coordinates');
tick(80);check(depth.children[0].texture.url.endsWith('/1632.png'),'firewall does not advance using the native 40ms interval');
tick(120000);check(depth.children.length===1,'firewall expires without a native hide event');
effects.showEvent({...event,id:2});await settle();check(callbacks.size===1,'multiple firewalls create independent perpetual animation callbacks');
effects.hideEvent(1);check(depth.children.length===1&&effects.debugState()[0].id===2,'hide removes an unrelated firewall');
effects.hideEvent(2);check(!depth.children.length&&!callbacks.size,'last native hide leaves a sprite or animation callback');
effects.showEvent({...event,id:3});effects.hideEvent(3);await settle();check(!depth.children.length,'late asset resolution recreates an already hidden event');
effects.showEvent({...event,id:4});effects.clear();effects.showEvent({...event,id:4,x:400});await settle();
check(depth.children.length===1&&depth.children[0].x===400*48,'old map asynchronous load contaminates the same event ID on a new map');
effects.clear();check(!depth.children.length&&!callbacks.size,'map change leaves persistent sprites or animation callbacks');
console.log('PASS persistent firewall coordinates, native frames, lifetime, duplicates, shared ticker and hide/map async races');

const profile=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/national-gameplay.json'),'utf8'));
const nationalContext={exports:{},require:()=>({default:profile})};vm.createContext(nationalContext);vm.runInContext(compile('apps/web/src/national-actors.ts'),nationalContext);
const national=nationalContext.exports;
const actorContext={exports:{},performance:{now:()=>0},fetch:()=>new Promise(()=>{}),
 require:name=>name==='pixi.js'?{Container:Scene,Sprite:Scene,Graphics:Scene,Text:Scene,Texture:{EMPTY:{}}}:name==='./national-actors'?national:name==='./monster-visuals'?{resolveMonsterVisual:()=>undefined}:name==='./classic-layout'?{nationalUsesLayout:()=>false}:{MOVEMENT_DURATION_MS:600,MOVEMENT_SETTLE_MS:250,forcedMovementDuration:action=>action==='backstep'?540:360,visualDirection:d=>d&7,routeDirection:()=>2}};
vm.createContext(actorContext);vm.runInContext(compile('apps/web/src/online-actors.ts'),actorContext);
const entity={id:2,x:10,y:10,direction:2,feature:0,name:'actor',self:false,action:'standing'};
const actor=new actorContext.exports.OnlineActor(entity);actor.update(entity,0);
actor.update({...entity,x:11,action:'walking'},0);actor.update({...entity,x:12,action:'walking'},100);
check(actor.debugState().queuedMovements===1,'fixture did not enqueue a remote movement');
actor.update({...entity,x:13,direction:6,action:'backstep'},200);
check(actor.debugState().queuedMovements===0&&actor.debugState().direction===6,'forced displacement retains obsolete walk steps or rotates native facing');
actor.tick(740);check(actor.debugState().pixel.x===13*48,'forced displacement does not finish at the native tile');
actor.update({...entity,x:13,action:'rushBlocked',rushTarget:{x:14,y:10}},750);
actor.tick(930);check(actor.debugState().pixel.x>13*48&&actor.debugState().pixel.x<14*48,'blocked rush does not lunge toward its attempted cell');
actor.tick(1110);check(actor.debugState().pixel.x===13*48,'blocked rush remains inside the blocked cell instead of returning to origin');
actor.update({...entity,x:14,action:'rush'},1000);const firstKey=actor.debugState().poseKey;
actor.update({...entity,x:15,action:'rush'},1100);check(actor.debugState().poseKey!==firstKey,'rush does not alternate native left and right poses');
check(national.actionFrame(national.nationalAction('rushLeft'),2,0)===144&&national.actionFrame(national.nationalAction('rushRight'),2,0)===147,'rush frames diverge from reference Actor.pas');
console.log('PASS forced displacement clears queued walks, preserves native facing and alternates rush poses');

const movementContext={exports:{}};vm.createContext(movementContext);vm.runInContext(compile('apps/web/src/movement-model.ts'),movementContext);
const blockedCells=new movementContext.exports.RecentBlockedCells(1500,()=>now);
now=0;blockedCells.add('11,10');check(blockedCells.has('11,10'),'new collision is not excluded from the immediate retry');
now=1000;blockedCells.add('11,10');now=1600;check(blockedCells.has('11,10'),'earlier expiry removes a more recent collision at the same cell');
now=2500;check(!blockedCells.has('11,10')&&blockedCells.size===0,'departed monster leaves a permanent blocked path cell');
const narrow=(x,y)=>y===10&&x>=10&&x<=12;
now=3000;blockedCells.add('11,10');check(movementContext.exports.findGridPath({x:10,y:10},{x:12,y:10},narrow,(x,y)=>blockedCells.has(`${x},${y}`))===undefined,'fixture corridor is not blocked initially');
now=4500;const reopened=movementContext.exports.findGridPath({x:10,y:10},{x:12,y:10},narrow,(x,y)=>blockedCells.has(`${x},${y}`));
check(reopened?.length===2&&reopened[0].x===11,'pursuit cannot reuse a corridor after the transient blocker leaves');
blockedCells.add('11,10');blockedCells.clear();check(!blockedCells.size,'input cancellation leaves a temporary blocked-cell record');
console.log('PASS moving-monster rejection expires, repeated occupancy refreshes it and narrow pursuit paths reopen');

const playFile=ts.createSourceFile('play.ts',fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8'),ts.ScriptTarget.ES2022,true);
const interact=playFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='interact').getText(playFile);
const timers=[],actorAt={id:1,x:10,y:10},targetAt={id:2,x:12,y:10,feature:80,name:'monster'},sentSteps=[];
now=6000;blockedCells.add('11,10');
const pursuitContext={mining:{cancel(){}},performance:{now:()=>now},self:1,entities:new Map([[1,actorAt]]),socket:{readyState:1},WebSocket:{OPEN:1},selectedMagic:undefined,ignoreCanvasPointerUntil:0,pursuitGroundItem:undefined,pursuitTarget:2,pursuitHarvest:false,pursuitRejectedCells:blockedCells,mapGeneration:3,pendingAction:undefined,held:{},clickDestination:{},connection:{},stopCombat(){},
 window:{setTimeout:(callback,delay)=>{timers.push({callback,delay});}},targetApproachStep:()=>blockedCells.size?undefined:{x:11,y:10},sendMovement:(actor,dx,dy)=>{sentSteps.push({dx,dy});return true;}};
vm.createContext(pursuitContext);vm.runInContext(ts.transpileModule(interact,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,pursuitContext);
pursuitContext.worldInputAvailable=()=>true;pursuitContext.worldInputBlocked=()=>false;
pursuitContext.continuePursuit=()=>pursuitContext.interact(targetAt);
pursuitContext.interact(targetAt);check(pursuitContext.pursuitTarget===2&&timers[0].delay===400,'temporary congestion cancels pursuit instead of scheduling a retry');
pursuitContext.mapGeneration=4;now=8000;timers.shift().callback();check(!sentSteps.length,'retry from an earlier map issues a movement on the new map');
pursuitContext.mapGeneration=3;now=9000;blockedCells.add('11,10');pursuitContext.interact(targetAt);now=10500;timers.shift().callback();
check(sentSteps.length===1&&sentSteps[0].dx===1,'pursuit does not resume after the rejected cell expires');
console.log('PASS temporarily blocked pursuit resumes when clear and stale map retries remain cancelled');
