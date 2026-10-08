import {installPlayUiContext} from './helpers/play_ui_context.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const transpile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const file=ts.createSourceFile('play.ts',read('apps/web/src/play.ts'),ts.ScriptTarget.ES2022,true);
function callback(owner,type){const found=[];function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='addEventListener'&&node.expression.expression.getText(file)===owner&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text===type)found.push(node.arguments[1].getText(file));ts.forEachChild(node,visit);}visit(file);assert.equal(found.length,1);return found[0];}
function helper(name){const node=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);assert.ok(node,name);return node.getText(file);}
const declaration=file.statements.flatMap(node=>ts.isVariableStatement(node)?[...node.declarationList.declarations]:[]).find(node=>node.name.getText(file)==='mining');assert.ok(declaration);
const code=transpile(`${helper('createAction')}\n${helper('cancelWorldIntent')}\n${helper('finishNonMovementAction')}\nconst ${declaration.getText(file)};globalThis.controller=mining;globalThis.receive=${callback('active','message')};globalThis.pointer=${callback('view.app.canvas','pointerdown')};`);
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
function harness(){
 let now=0,sequence=0,closed=0;const sent=[],calls=[],inventory=new Map(),actor={id:1,x:10,y:10,direction:0,feature:0,self:true,action:'standing',hitSpeed:0};
 const context={exports:{},performance:{now:()=>now},mapGeneration:5,lastSequence:0,self:1,entities:new Map([[1,actor]]),visuals:new Map(),gatewayFeatures:{mining:true},WebSocket:{OPEN:1},pendingAction:undefined,nextActionId:1,connection:{textContent:''},
  socket:{readyState:1,send:text=>sent.push(JSON.parse(text)),close:()=>closed++},active:undefined,
  characterPanel:{debugState:()=>({level:1,handWeight:0,maxHandWeight:10})},equipment:{itemAt:()=>({shape:19,stdMode:5,durability:10000})},
  worldInputAvailable:()=>true,worldInputBlocked:()=>false,
  view:{isWalkable:(x,y)=>x!==11||y!==10,app:{canvas:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),setPointerCapture(){} }},cellAtScreen:()=>({x:12,y:10})},
  agentObserver:{event:()=>{}},selectedMagic:undefined,held:undefined,rightPointer:undefined,clickDestination:undefined,pursuitTarget:undefined,pursuitHarvest:false,pursuitGroundItem:undefined,doorRetry:undefined,pursuitRejectedCells:new Set(),ignoreCanvasPointerUntil:0,
  stopCombat:()=>calls.push('stopCombat'),skillBar:{cancelSelection:()=>{context.selectedMagic=undefined;}},continueMovementIntent:()=>calls.push('continue'),
  groundItems:{hitTest:()=>undefined,at:()=>undefined},continueClickDestination:()=>calls.push('walk'),continuePointerRun:()=>calls.push('run'),requestsHarvest:()=>false,interact:()=>calls.push('interact'),castSelectedAt:()=>calls.push('spell'),
  update:(entity,start)=>{context.entities.set(entity.id,entity);calls.push(['update',entity,start]);},audio:{play:clip=>calls.push(['audio',clip])},
  inventory:{add:item=>inventory.set(item.makeIndex,item),debugState:()=>({items:[...inventory.values()]})},itemQuickBar:{add(){}},syncServiceInventory:()=>{},
  dialogueElement:{hidden:true},npcSession:{accept:()=>false}
 };
 context.active=context.socket;installPlayUiContext(context);vm.runInContext(transpile(read('apps/web/src/mining-controller.ts')),context);context.MiningController=context.exports.MiningController;vm.runInContext(code,context);
 return {context,sent,calls,inventory,time:value=>{now=value;},closed:()=>closed,
  send:message=>context.receive({data:JSON.stringify({sequence:++sequence,mapGeneration:5,message})}),
  click:(extra={})=>context.pointer({button:0,shiftKey:false,clientX:400,clientY:250,pointerId:1,...extra})};
}
{
 const h=harness();h.click();assert.equal(h.sent.length,1);assert.deepEqual(h.sent[0],{type:'mine',direction:2,actionId:1,mapGeneration:5});assert.equal(h.context.pendingAction.kind,'mine');assert.equal(h.calls.includes('walk'),false);assert.equal(h.context.entities.get(1).action,'standing');
 h.time(1600);h.context.controller.tick();assert.equal(h.sent.length,1);
 pass('actual wall click requests mine through the shared action identity without walking or predicting a heavy swing');
}
{
 const h=harness();h.context.equipment.itemAt=()=>({shape:3,stdMode:5,durability:10000});h.click();assert.equal(h.sent.length,0);assert.equal(h.calls.includes('walk'),true);
 h.context.equipment.itemAt=()=>({shape:19,stdMode:5,durability:10000});h.context.view.isWalkable=()=>true;h.calls.length=0;h.click();assert.equal(h.sent.length,0);assert.equal(h.calls.includes('walk'),true);h.click({shiftKey:true});assert.equal(h.sent[0].type,'mine');
 pass('actual click keeps ordinary walking without a pickaxe or blocked front tile and supports the reference Shift mining intent');
}
{
 const h=harness();h.click();h.time(90);h.send({type:'miningProgress',phase:'swing',id:1,actionId:99,mapGeneration:5,x:10,y:10,direction:2});assert.equal(h.context.entities.get(1).action,'standing');
 h.context.entities.set(1,{...h.context.entities.get(1),meleeKind:'fire',predictedMelee:true,meleeActionId:999});
 h.send({type:'miningProgress',phase:'swing',id:1,actionId:1,mapGeneration:5,x:10,y:10,direction:2});const actor=h.context.entities.get(1);assert.equal(actor.action,'heavyAttack');assert.equal(actor.meleeKind,'heavy');assert.equal(actor.predictedMelee,false);assert.equal(actor.meleeActionId,undefined);assert.equal(actor.swingSequence,1);assert.equal(actor.digFragment,false);assert.equal(h.context.pendingAction.startedAt,90);
 h.send({type:'miningStrike',id:1,actionId:99,mapGeneration:5});assert.equal(h.context.entities.get(1).digFragment,false);h.send({type:'miningStrike',id:1,actionId:1,mapGeneration:5});assert.equal(h.context.entities.get(1).digFragment,true);assert.equal(h.inventory.size,0);
 pass('real swing progress and matching DIG mark the actor while wrong request identities do not animate or fabricate ore');
}
{
 const h=harness();h.click();h.send({type:'miningProgress',id:1,actionId:1,mapGeneration:5,x:10,y:10,direction:2});h.send({type:'actionResult',kind:'mine',actionId:1,mapGeneration:5,accepted:true});assert.equal(h.context.controller.debugState().pending,undefined);assert.equal(h.context.pendingAction.acknowledged,true);assert.equal(h.inventory.size,0);
 h.time(539);h.context.finishNonMovementAction(539);assert.equal(h.context.pendingAction.kind,'mine');h.time(540);h.context.finishNonMovementAction(540);assert.equal(h.context.pendingAction,undefined);
 h.time(1400);h.context.controller.tick();assert.equal(h.sent.length,2);assert.equal(h.sent[1].actionId,2);
 pass('native acknowledgement and the real 540ms swing finish gate the next mining request independently of ore rewards');
}
{
 const h=harness();h.click();h.context.cancelWorldIntent();assert.equal(h.context.controller.debugState().active,false);assert.equal(h.context.controller.debugState().pending.actionId,1);assert.equal(h.context.pendingAction.actionId,1);
 h.send({type:'actionResult',kind:'mine',actionId:1,mapGeneration:5,accepted:true});h.time(2000);h.context.finishNonMovementAction(2000);h.context.controller.tick();assert.equal(h.sent.length,1);assert.equal(h.context.pendingAction,undefined);
 pass('production cancel stops repeated mining and preserves its native action until acknowledgement drains');
}
{
 const h=harness();h.click();h.send({type:'actionResult',kind:'mine',actionId:99,mapGeneration:5,accepted:false});assert.equal(h.context.pendingAction.actionId,1);assert.equal(h.context.controller.debugState().active,true);
 h.send({type:'actionResult',kind:'mine',actionId:1,mapGeneration:5,accepted:false,reason:28});assert.equal(h.context.pendingAction,undefined);assert.equal(h.context.controller.debugState().active,false);assert.equal(h.context.controller.debugState().pending,undefined);h.time(2000);h.context.controller.tick();assert.equal(h.sent.length,1);
 pass('actual failed mining result cancels its loop and an unrelated refusal cannot release its action slot');
}
{
 const h=harness();h.click();h.time(5000);h.context.controller.tick();assert.equal(h.closed(),1);assert.equal(h.context.controller.debugState().active,false);assert.equal(h.context.pendingAction.kind,'mine');
 pass('production mining timeout closes the uncertain connection without making its shared native slot reusable');
}
{
 const h=harness();h.send({type:'entityAction',id:1,action:'heavyAttack',x:10,y:10,direction:2,digFragment:true});assert.equal(h.context.entities.get(1).swingSequence,1);h.send({type:'entityAction',id:1,action:'heavyAttack',x:10,y:10,direction:2,digFragment:false});assert.equal(h.context.entities.get(1).swingSequence,2);assert.equal(h.context.entities.get(1).digFragment,false);
 const ore={name:'铁矿',makeIndex:123,stdMode:43,durability:4500,maxDurability:0};h.send({type:'itemAdded',item:ore});assert.equal(h.inventory.size,1);assert.equal(h.inventory.get(123).durability,4500);
 pass('real heavy-action notifications replay per swing and only native itemAdded introduces the raw ore instance');
}
assert.equal(groups,8);
