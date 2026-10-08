import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'apps/web/src/movement-model.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let now=0;
const modelContext={exports:{},performance:{now:()=>now}};
vm.createContext(modelContext);
vm.runInContext(compiled,modelContext);
const {movementBlocker,movementTrace,RecentBlockedCells}=modelContext.exports;
const check=(condition,message)=>{if(!condition)throw new Error(message);};

const run={fromX:10,fromY:20,direction:2,run:true};
const trace=movementTrace(run);
check(JSON.stringify(trace)==='[{"x":11,"y":20},{"x":12,"y":20}]','run trace omits its intermediate tile');
const actorBlock=movementBlocker(trace,cell=>cell.x===11,(x,y)=>x!==12);
check(actorBlock?.kind==='actor'&&actorBlock.cell.x===11,'intermediate actor must take precedence over the later terrain tile');
const doorBlock=movementBlocker(trace,()=>false,(x,y)=>x!==12);
check(doorBlock?.kind==='terrain'&&doorBlock.cell.x===12,'closed terrain must report the exact blocked tile');
const firstTerrainBlock=movementBlocker(trace,cell=>cell.x===12,(x,y)=>x!==11);
check(firstTerrainBlock?.kind==='terrain'&&firstTerrainBlock.cell.x===11,'a later actor must not hide the first terrain obstacle in the run trace');
check(movementBlocker(trace,()=>false,()=>undefined)===undefined,'unknown terrain must not be misclassified as a door');
console.log('PASS two-cell movement rejection locates the first actor/terrain obstacle and leaves unknown terrain unclassified');

const playSource=fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8');
const ast=ts.createSourceFile('play.ts',playSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=new Set(['releaseVacatedBlocker','update','removeEntity']);
const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name&&names.has(node.name.text));
check(functions.length===names.size,'production play lifecycle does not expose the blocker-release paths');
const lifecycle=ts.transpileModule(functions.map(node=>node.getText(ast)).join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const actor=(id,x,y,overrides={})=>({id,x,y,self:false,dead:false,feature:1,...overrides});
function harness(entities){
 const c={entities:new Map(entities.map(entity=>[entity.id,entity])),visuals:new Map(entities.map(entity=>[entity.id,{update(){},destroy(){}}])),movementRejectedCells:new RecentBlockedCells(1500,()=>now),pursuitRejectedCells:new RecentBlockedCells(1500,()=>now),pursuitTarget:undefined,pursuitHarvest:false,combatTarget:undefined,OnlineActor:class{constructor(){this.container={};}update(){}destroy(){}},interact(){},magicEffects:{miningImpact(){}},audio:{play(){}},view:{depth:{addChild(){}}},stopCombat(){this.combatTarget=undefined;},renderTargets(){},refreshMiniMapMarkers(){}};
 vm.createContext(c);vm.runInContext(lifecycle,c);return c;
}
{
 const blocker=actor(2,11,20),c=harness([actor(1,10,20,{self:true}),blocker]);
 c.movementRejectedCells.add('11,20');c.pursuitRejectedCells.add('11,20');
 c.update({...blocker,x:12});
 check(!c.movementRejectedCells.has('11,20')&&!c.pursuitRejectedCells.has('11,20'),'a server-confirmed moving actor left a stale 1.5-second route block');
 check(c.entities.get(2).x===12,'the entity update must remain authoritative');
}
{
 const c=harness([actor(1,10,20,{self:true})]);c.movementRejectedCells.add('11,20');c.movementRejectedCells.add('12,20');c.pursuitRejectedCells.add('11,20');c.pursuitRejectedCells.add('12,20');
 const late=actor(2,11,20);c.update(late);
 check(c.movementRejectedCells.has('11,20')&&c.movementRejectedCells.has('12,20'),'a late actor update must preserve the full rejected run until it vacates a tile');
 c.update({...late,x:12});
 check(!c.movementRejectedCells.has('11,20')&&!c.pursuitRejectedCells.has('11,20')&&c.movementRejectedCells.has('12,20'),'late actor arrival must clear only the vacated first tile');
}
{
 const blocker=actor(2,11,20),other=actor(3,11,20),c=harness([actor(1,10,20,{self:true}),blocker,other]);
 c.movementRejectedCells.add('11,20');c.pursuitRejectedCells.add('11,20');c.update({...blocker,x:12});
 check(c.movementRejectedCells.has('11,20')&&c.pursuitRejectedCells.has('11,20'),'a second live actor still occupies the blocked cell');
}
{
 const blocker=actor(2,11,20),c=harness([actor(1,10,20,{self:true}),blocker]);
 c.movementRejectedCells.add('11,20');c.pursuitRejectedCells.add('11,20');c.update({...blocker,dead:true});
 check(!c.movementRejectedCells.has('11,20')&&!c.pursuitRejectedCells.has('11,20'),'a dead actor no longer occupies the collision cell');
}
{
 const blocker=actor(2,11,20),c=harness([actor(1,10,20,{self:true}),blocker]);
 c.movementRejectedCells.add('11,20');c.pursuitRejectedCells.add('11,20');c.removeEntity(2);
 check(!c.movementRejectedCells.has('11,20')&&!c.pursuitRejectedCells.has('11,20'),'removing a despawned blocker must release the route cell');
}
{
 let expiredAt=0;const cells=new RecentBlockedCells(1500,()=>expiredAt);cells.add('12,20');
 expiredAt=1499;check(cells.has('12,20'),'the existing safety window must remain until authoritative vacancy is known');
 expiredAt=1501;check(!cells.has('12,20'),'the bounded fallback expiry must still release an unknown blocker');
}
console.log('PASS live entity movement/death/removal releases vacated collision cells without clearing another actor or weakening the unknown-blocker timeout');

const pointerDown=[];
const playAst=ts.createSourceFile('play.ts',playSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const findPointerDown=node=>{
 if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(playAst)==='view.app.canvas'&&node.expression.name.text==='addEventListener'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='pointerdown')pointerDown.push(node.arguments[1]);
 ts.forEachChild(node,findPointerDown);
};
findPointerDown(playAst);
check(pointerDown.length===1,'production canvas pointerdown handler missing');
const pointerCode=ts.transpileModule(`globalThis.handlePointerDown=${pointerDown[0].getText(playAst)};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function pointerHarness(clickedCell){
 const canvas={getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),setPointerCapture(){}};
 const player=actor(1,10,10,{self:true}),c={
  ignoreCanvasPointerUntil:0,worldInputAvailable:()=>true,worldInputBlocked:()=>false,performance:{now:()=>100},WebSocket:{OPEN:1},mining:{cancel(){},start:()=>false},
  self:1,entities:new Map([[1,player]]),socket:{readyState:1},view:{app:{canvas},cellAtScreen:()=>clickedCell},visuals:new Map(),selectedMagic:undefined,
  rightPointer:undefined,clickDestination:{x:4,y:5,run:false},groundItems:{hitTest:()=>undefined,at:()=>undefined},gatewayFeatures:{mining:false},stopCombat(){},doorRetry:undefined,
  pursuitTarget:undefined,pursuitHarvest:false,pursuitGroundItem:undefined,held:undefined,started:false,
  interact(){throw Error('unexpected actor interaction');},requestsHarvest(){return false;},castSelectedAt(){throw Error('unexpected spell');},continueClickDestination(){throw Error('right click must not continue the old destination');},
 };
 c.continuePointerRun=()=>{c.started=true;};
 vm.createContext(c);vm.runInContext(pointerCode,c);c.handlePointerDown({button:2,pointerId:8,clientX:480,clientY:300,shiftKey:false});return c;
}
{
 const c=pointerHarness({x:12,y:10});
 check(c.rightPointer?.pointerId===8&&c.started,'right-drag establishes the current pointer-run intent');
 check(c.clickDestination===undefined,'starting right-button run clears a previous click-to-move destination');
}
{
 const c=pointerHarness({x:10,y:10});
 check(c.clickDestination===undefined,'right-clicking the current tile still cancels an older click-to-move route');
 check(c.rightPointer===undefined,'right-clicking the current tile does not start a zero-direction pointer run');
}
console.log('PASS production right-button run supersedes stale click-to-move intent');
