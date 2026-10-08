import {installPlayUiContext} from './helpers/play_ui_context.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=ts.createSourceFile('play.ts',fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8'),ts.ScriptTarget.ES2022,true);
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const helper=name=>{const node=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(node,name);return node.getText(source);};
const listeners=[];function walk(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.getText(source)==='active.addEventListener'&&n.arguments[0]?.text==='message')listeners.push(n.arguments[1]);ts.forEachChild(n,walk);}walk(source);assert.equal(listeners.length,1);
const code=compile(`${helper('createAction')}\n${helper('continueCombat')}\n${helper('finishNonMovementAction')}\nglobalThis.receive=${listeners[0].getText(source)};`);
const plain=value=>JSON.parse(JSON.stringify(value));let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
function harness(){let now=1000,sequence=0;const sent=[],calls=[];
 const context={exports:{},WebSocket:{OPEN:1},performance:{now:()=>now},socket:{readyState:1,send:value=>sent.push(JSON.parse(value))},active:undefined,self:1,entities:new Map([[1,{id:1,self:true,feature:0,x:10,y:10,action:'standing',direction:0}],[2,{id:2,self:false,feature:0,x:11,y:10,name:'target',action:'standing'}]]),lastSequence:0,mapGeneration:5,combatTarget:2,lastAttack:0,nextActionId:71,pendingAction:undefined,MOVEMENT_DURATION_MS:360,
  directions:[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]],connection:{},combatStatus:{},pursuitTarget:undefined,pursuitHarvest:false,
  scheduleCombat:()=>calls.push('schedule'),stopCombat:()=>calls.push('stop'),interact:()=>calls.push('interact'),continueMovementIntent:()=>calls.push('continue'),agentObserver:{event:(...args)=>calls.push(['observe',...args])},
  update:entity=>{context.entities.set(entity.id,entity);calls.push(['update',plain(entity)]);},audio:{play:(...args)=>calls.push(['audio',...args]),playMelee:(...args)=>calls.push(['meleeAudio',...args])},mining:{settle:()=>calls.push('mine-settle')},skillBar:{warriorSkill:(...args)=>calls.push(['warriorSkill',...args]),resolve:()=>calls.push('resolve')},warriorSkillFlags:{},
 };
 context.active=context.socket;installPlayUiContext(context);vm.runInContext(code,context);
 return {context,sent,calls,time:value=>{now=value;},send:(message,{generation=5,seq=++sequence}={})=>context.receive({data:JSON.stringify({sequence:seq,mapGeneration:generation,message})})};
}
{
 const h=harness();h.context.continueCombat();assert.deepEqual(h.sent,[{type:'attack',direction:2,actionId:71,mapGeneration:5}]);const e=h.context.entities.get(1);assert.equal(e.meleeKind,'normal');assert.equal(e.predictedMelee,true);assert.equal(e.meleeActionId,71);assert.equal(e.digFragment,false);assert.equal(h.calls.some(x=>Array.isArray(x)&&x[0]==='audio'),false);h.context.continueCombat();assert.equal(h.sent.length,1);
 pass('actual attack predicts only normal body with native request identity and holds its shared action slot');
}
{
 for(const [kind,ident] of [['normal',14],['heavy',15],['big',16],['power',18],['thrusting',19],['halfMoon',24],['fire',8]]){
  const h=harness();h.context.continueCombat();h.send({type:'entityAction',id:1,self:true,actionId:71,legacyIdent:ident,meleeKind:kind,action:kind==='heavy'?'heavyAttack':kind==='big'?'wideAttack':'attack',x:10,y:10,direction:2});const e=h.context.entities.get(1);assert.equal(e.meleeKind,kind);assert.equal(e.predictedMelee,false);assert.equal(e.meleeActionId,71);assert.equal(e.swingSequence,1);assert.equal(h.context.pendingAction.acknowledged,false);
 }
 pass('all seven true self SM kinds replace prediction without fabricating an acknowledgement');
}
{
 const h=harness();h.context.continueCombat();for(const extra of [{actionId:70,self:true},{actionId:71,self:false},{actionId:71}])h.send({type:'entityAction',id:1,meleeKind:'fire',action:'attack',x:10,y:10,direction:2,...extra});assert.equal(h.context.entities.get(1).predictedMelee,true);assert.equal(h.context.entities.get(1).swingSequence,undefined);
 h.context.pendingAction.kind='spell';h.send({type:'entityAction',id:1,self:true,actionId:71,meleeKind:'fire',action:'attack',x:10,y:10,direction:2});assert.equal(h.context.entities.get(1).predictedMelee,true);
 h.context.pendingAction=undefined;h.send({type:'entityAction',id:1,self:true,actionId:71,meleeKind:'fire',action:'attack',x:10,y:10,direction:2});assert.equal(h.context.entities.get(1).predictedMelee,true);
 pass('stale, unowned, spell-slot and cleared self swings cannot attach a special sword effect');
}
{
 const h=harness();for(const kind of ['power','thrusting','halfMoon','fire'])h.send({type:'entityAction',id:2,self:false,actionId:null,meleeKind:kind,action:'attack',x:11,y:10,direction:6});assert.equal(h.context.entities.get(2).swingSequence,4);assert.equal(h.context.entities.get(2).meleeKind,'fire');assert.equal(h.context.entities.get(2).meleeActionId,undefined);assert.equal(h.sent.length,0);
 pass('remote true melee SM messages advance independent swings without owning a local request');
}
{
 const h=harness();h.context.continueCombat();h.send({type:'entityAction',id:1,self:true,actionId:71,meleeKind:'fire',action:'attack',x:99,y:99,direction:0},{generation:4});assert.equal(h.context.entities.get(1).x,10);h.send({type:'entityAction',id:1,self:true,actionId:71,meleeKind:'fire',action:'attack',x:10,y:10,direction:2});h.send({type:'entityAction',id:1,self:true,actionId:71,meleeKind:'power',action:'attack',x:10,y:10,direction:2},{seq:2});assert.equal(h.context.entities.get(1).meleeKind,'fire');assert.equal(h.context.entities.get(1).swingSequence,1);
 pass('old map generations and duplicate envelopes do not replay self sword or voice effects');
}
{
 const h=harness();h.context.continueCombat();h.send({type:'actionResult',kind:'attack',actionId:70,accepted:true,mapGeneration:5});assert.equal(h.context.pendingAction.acknowledged,false);h.send({type:'actionResult',kind:'attack',actionId:71,accepted:true,mapGeneration:5});assert.equal(h.context.pendingAction.acknowledged,true);assert.equal(h.context.entities.get(1).meleeKind,'normal');assert.equal(h.context.entities.get(1).predictedMelee,true);h.time(1360);h.context.finishNonMovementAction(1360);assert.equal(h.context.pendingAction,undefined);assert.ok(h.calls.includes('continue'));
 pass('native GD completion alone finishes the request clock without inventing a special SM kind');
}
{
 const h=harness();h.context.continueCombat();h.send({type:'actionResult',kind:'attack',actionId:71,accepted:false,reason:28});assert.equal(h.context.pendingAction,undefined);h.send({type:'entityAction',id:1,self:true,actionId:71,meleeKind:'fire',action:'attack',x:10,y:10,direction:2});assert.equal(h.context.entities.get(1).meleeKind,'normal');assert.equal(h.context.entities.get(1).swingSequence,undefined);
 pass('a refused attack releases its pending request and rejects a delayed special confirmation');
}
{
 const h=harness();const actorCalls=[];h.context.visuals=new Map();h.context.view={depth:{addChild(){}}};h.context.paperdoll={setFeature(){}};h.context.renderTargets=()=>{};h.context.refreshMiniMapMarkers=()=>{};h.context.magicEffects={miningImpact:()=>actorCalls.push('stone')};h.context.OnlineActor=class{constructor(e,click,mine,melee){this.mine=mine;this.melee=melee;actorCalls.push(this);}update(){}};vm.runInContext(compile(helper('update')),h.context);h.context.update(h.context.entities.get(1));const v=actorCalls[0];v.melee(h.context.entities.get(1),{weapon:false,skill:true});assert.deepEqual(plain(h.calls.find(x=>x[0]==='meleeAudio').slice(1)),[plain(h.context.entities.get(1)),{weapon:false,skill:true}]);v.mine(h.context.entities.get(1));assert.ok(actorCalls.includes('stone'));assert.deepEqual(h.calls.find(x=>x[0]==='audio'),['audio','miningStone']);
 pass('actual OnlineActor callbacks forward phase-specific melee audio and preserve mining impact audio');
}
assert.equal(groups,8);
