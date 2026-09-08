// Deterministic, offline regression for movement geometry and action ownership.
// It executes the production movement model and inspects the two integration
// boundaries. No browser session, account, or game-server state is touched.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=name=>fs.readFileSync(path.join(root,name),'utf8');
const modelSource=source('apps/web/src/movement-model.ts');
const context=vm.createContext({exports:{}});
vm.runInContext(ts.transpileModule(modelSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const model=context.exports;

const straight=model.findGridPath({x:10,y:10},{x:16,y:10},()=>true,()=>false);
const detour=model.findGridPath({x:10,y:10},{x:13,y:10},(x,y)=>!(x===11&&y===10),()=>false);
const acknowledged={actionId:1,fromX:10,fromY:10,x:11,y:10,direction:2,run:false,startedAt:100,acknowledged:true};
const waiting={...acknowledged,acknowledged:false};
const playSource=source('apps/web/src/play.ts');
const gatewaySource=source('services/web-gateway/GatewaySession.cs');
const actorSource=source('apps/web/src/online-actors.ts');
const visualSource=source('apps/web/src/movement-visual.ts');

const report={
  scope:'Offline execution of the production movement model plus source-boundary assertions; no live browser/GPU/network timing claim.',
  sourceSha256:Object.fromEntries([
    ['movement-model.ts',modelSource],['play.ts',playSource],['GatewaySession.cs',gatewaySource],['online-actors.ts',actorSource],
  ].map(([name,value])=>[name,createHash('sha256').update(value).digest('hex')])),
  direction:{north:model.routeDirection(10,10,10,9,4),east:model.routeDirection(10,10,11,10,4),south:model.routeDirection(10,10,10,11,0),west:model.routeDirection(10,10,9,10,0),
    identityMapping:/return serverDirection&7/.test(visualSource)},
  pointer:{east:model.screenDirection(250,1),south:model.screenDirection(1,250),deadZone:model.screenDirection(4,4)??null},
  path:{straight,detour,straightDeviation:Math.max(...straight.map(point=>Math.abs(point.y-10)))},
  timeline:{beforeAnimationEnd:model.movementCanFinish(acknowledged,699),atAnimationEnd:model.movementCanFinish(acknowledged,700),withoutAcknowledgement:model.movementCanFinish(waiting,900)},
  protocol:{browserSendsActionId:/type:'move',mapGeneration,\.\.\.pending/.test(playSource),browserConsumesTypedResult:playSource.includes("message.type==='actionResult'"),browserConsumesLegacyMovement:playSource.includes("message.type==='legacy'&&pending"),gatewayReturnsTypedResult:gatewaySource.includes('type = "actionResult"'),gatewayValidatesMap:gatewaySource.includes('ValidateActionMap')},
  assets:{preloadsLocomotion:actorSource.includes('preloadPlayerLocomotion'),clearsPoseDuringLoad:actorSource.includes('this.body.texture=this.weapon.texture=this.hair.texture=Texture.EMPTY')},
  remoteActors:{queuesMovement:actorSource.includes('this.movementQueue.push(entity)'),startsQueuedStep:actorSource.includes('this.update(next,time,true)'),resyncsDiscontinuity:actorSource.includes('stepDistance>maximumStep||this.movementQueue.length>=8')},
};
report.pass=report.direction.north===0&&report.direction.east===2&&report.direction.south===4&&report.direction.west===6&&report.direction.identityMapping
  &&report.pointer.east===2&&report.pointer.south===4&&report.pointer.deadZone===null
  &&report.path.straight.length===6&&report.path.straightDeviation===0&&report.path.detour.length===3&&report.path.detour.some(point=>point.y!==10)
  &&!report.timeline.beforeAnimationEnd&&report.timeline.atAnimationEnd&&!report.timeline.withoutAcknowledgement
  &&report.protocol.browserSendsActionId&&report.protocol.browserConsumesTypedResult&&!report.protocol.browserConsumesLegacyMovement&&report.protocol.gatewayReturnsTypedResult&&report.protocol.gatewayValidatesMap
  &&report.assets.preloadsLocomotion&&!report.assets.clearsPoseDuringLoad&&report.remoteActors.queuesMovement&&report.remoteActors.startsQueuedStep&&report.remoteActors.resyncsDiscontinuity;
const output=path.join(root,'.runtime/reports/movement-audit-20260908/implementation.json');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(`${report.pass?'PASS':'FAIL'} movement architecture ${output}`);
if(!report.pass){console.error(JSON.stringify(report,null,2));process.exitCode=1;}
