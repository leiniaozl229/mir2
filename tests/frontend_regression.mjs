import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'apps/web/src/inventory.ts'),'utf8').replace(/^import .*;\n/,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.dataset={};this.classList={add(){}};this.disabled=false;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 setAttribute(){}
}
const context={exports:{},document:{createElement:tag=>new Element(tag)},fetch:()=>new Promise(()=>{}),loadNationalUiLibrary:()=>new Promise(()=>{})};
vm.createContext(context);
vm.runInContext(compiled,context);
const element=new Element(),sent=[];
const inventory=new context.exports.InventoryView(element,{drop(){},use(){},equip(){},trade:id=>sent.push(id)});
const candle={name:'蜡烛',makeIndex:100,durability:8000,maxDurability:8000,stdMode:30,weight:1,looks:1};
inventory.replace([candle]);
element.children[0].onclick({preventDefault(){},shiftKey:true});
if(!element.children[0].disabled||sent[0]!==100)throw new Error('trade action does not enter the pending state');
inventory.rejectPending();
if(element.children[0].disabled)throw new Error('rejected action leaves the inventory item disabled');
console.log('PASS frontend inventory rejection restores the item interaction state');

const movementSource=fs.readFileSync(path.join(root,'apps/web/src/movement-input.ts'),'utf8');
const movementContext={exports:{},require:()=>({screenDirection:()=>undefined})};
vm.createContext(movementContext);
vm.runInContext(ts.transpileModule(movementSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,movementContext);
const held=movementContext.exports.movementInput({code:'KeyD',key:'D',shiftKey:true});
if(!held?.run||held.dx!==1)throw new Error('Shift+D does not begin running to the right');
if(movementContext.exports.releasesMovement(held,{code:'ShiftLeft',key:'Shift'}))throw new Error('releasing Shift clears the movement key');
if(!movementContext.exports.releasesMovement(held,{code:'KeyD',key:'d'}))throw new Error('releasing D after Shift leaves movement held');
console.log('PASS frontend movement release uses a modifier-stable key code');

const movementModelSource=fs.readFileSync(path.join(root,'apps/web/src/movement-model.ts'),'utf8');
const movementModelContext={exports:{}};
vm.createContext(movementModelContext);
vm.runInContext(ts.transpileModule(movementModelSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,movementModelContext);
const movement=movementModelContext.exports;
if(movement.MOVEMENT_DURATION_MS!==600)throw new Error('movement animation no longer uses the six-frame cadence');
if(movement.routeDirection(10,10,11,10,0)!==2||movement.routeDirection(10,10,9,11,0)!==5)throw new Error('route direction does not follow actual coordinate displacement');
if(movement.screenDirection(250,1)!==2)throw new Error('nearly horizontal pointer movement resolves diagonally');
const straight=movement.findGridPath({x:10,y:10},{x:16,y:10},()=>true,()=>false);
if(straight.length!==6||straight.some((point,index)=>point.x!==11+index||point.y!==10))throw new Error('open-field path does not preserve a straight route');
const step={actionId:1,fromX:10,fromY:10,x:11,y:10,direction:2,run:false,startedAt:100,acknowledged:true};
if(movement.movementCanFinish(step,699)||!movement.movementCanFinish(step,700)||movement.movementCanFinish({...step,acknowledged:false},900))throw new Error('movement does not wait for both animation and acknowledgement');
const movementVisualSource=fs.readFileSync(path.join(root,'apps/web/src/movement-visual.ts'),'utf8');
const movementVisualContext={exports:{},require:()=>movement};
vm.createContext(movementVisualContext);
vm.runInContext(ts.transpileModule(movementVisualSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,movementVisualContext);
if(movementVisualContext.exports.visualDirection(0)!==0||movementVisualContext.exports.visualDirection(2)!==2||movementVisualContext.exports.visualDirection(7)!==7)throw new Error('Crystal actor directions are globally rotated');
console.log('PASS frontend movement model preserves direction, paths and action cadence');

const mapViewSource=fs.readFileSync(path.join(root,'apps/web/src/map-view.ts'),'utf8');
if(!mapViewSource.includes('(x-app.stage.position.x)/48')||!mapViewSource.includes('(y-app.stage.position.y)/32')||!mapViewSource.includes('start=performance.now()'))throw new Error('screen clicks or camera do not follow the shared movement timeline');
const onlineActorSource=fs.readFileSync(path.join(root,'apps/web/src/online-actors.ts'),'utf8');
if(!onlineActorSource.includes('Math.floor(movementProgress*this.frames.length)')||!onlineActorSource.includes('preloadPlayerLocomotion')||onlineActorSource.includes('this.body.texture=this.weapon.texture=this.hair.texture=Texture.EMPTY')||!onlineActorSource.includes('this.movementQueue.push(entity)')||!onlineActorSource.includes('this.update(next,time,true)')||!onlineActorSource.includes('stepDistance>maximumStep||this.movementQueue.length>=8'))throw new Error('locomotion frames do not load atomically on the displacement clock or remote movement lacks queue and resync handling');
const movementPlaySource=fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8');
if(!movementPlaySource.includes("message.type==='actionResult'")||movementPlaySource.includes("message.type==='legacy'&&pending")||!movementPlaySource.includes('movementCanFinish(pending,time)'))throw new Error('movement still consumes untyped acknowledgements or bypasses the animation gate');
console.log('PASS frontend locomotion shares camera, displacement and frame timing');

const actorSource=fs.readFileSync(path.join(root,'apps/web/src/online-actors.ts'),'utf8');
const hitBody=actorSource.match(/export function actorHitTest[\s\S]*?\n\}/)?.[0];
if(!hitBody)throw new Error('actor hit-test helper missing');
const hitContext={exports:{}};
vm.createContext(hitContext);
vm.runInContext(ts.transpileModule(hitBody,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,hitContext);
if(!hitContext.exports.actorHitTest(false,{x:10,y:20,width:30,height:40},20,30))throw new Error('corpse bounds cannot be selected');
if(hitContext.exports.actorHitTest(true,{x:10,y:20,width:30,height:40},20,30))throw new Error('the local player can select itself');
console.log('PASS frontend actor hit testing includes non-player corpses');

const equipmentElement=new Element();
const equipment=new context.exports.EquipmentView(equipmentElement,()=>{});
equipment.replace([{slot:7,item:{...candle,stdMode:22}}]);
if(equipment.preferredSlot(7)!==8)throw new Error('second ring does not select the empty right slot');
equipment.replace([{slot:5,item:{...candle,stdMode:24}}]);
if(equipment.preferredSlot(5)!==6)throw new Error('second bracelet does not select the empty right slot');
console.log('PASS frontend dual accessories select the empty paired slot');

const playSource=fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8');
if(playSource.includes("if(id==='chat'){classicWindow.hidden=true;return;}"))throw new Error('chat tab still closes the classic window');
if(!playSource.includes("if(id==='chat')classicWindowBody.append(chatPanel)"))throw new Error('chat tab does not expose the complete chat form');
console.log('PASS frontend chat tab exposes the channel and recipient controls');

const authSource=fs.readFileSync(path.join(root,'apps/web/src/classic-auth.ts'),'utf8');
const nationalMount=authSource.indexOf('this.mountNationalAuth();');
if(nationalMount<0||authSource.indexOf('this.renderSlots();',nationalMount)<nationalMount)throw new Error('national auth assets do not redraw existing character slots');
console.log('PASS national character assets redraw existing slots');

if(!authSource.includes("paintNationalButton(selectSprite,nationalPrguse"))throw new Error('national character slots mix fallback frame metadata with national images');
console.log('PASS national character slots use matching frame metadata');
if(!authSource.includes('nationalCreateJobs.find')||!authSource.includes('nationalCreateSexes.find')||authSource.includes('paintNationalButton(button,national,this.job===spec.job?spec.active:spec.index'))throw new Error('national character creation repaints with unavailable legacy frame indexes');
console.log('PASS national character creation keeps its own frame index space');

const actorsPage=fs.readFileSync(path.join(root,'apps/web/actors.html'),'utf8');
const actorsSource=fs.readFileSync(path.join(root,'apps/web/src/actors.ts'),'utf8');
if(!actorsPage.includes('<option value="running">跑步</option>')||!actorsSource.includes("running:{start:80,count:6")||!actorsSource.includes("running:'2'")||!actorsSource.includes('visualDirection(direction)'))throw new Error('actor validation page cannot inspect the corrected running rows and direction mapping');
console.log('PASS actor validation page exposes the six-frame running rows');
if(!onlineActorSource.includes('if(!this.frames.length)this.marker.circle')||!onlineActorSource.includes('if(layers||staticIndex!==undefined)this.marker.clear()'))throw new Error('player has no visible fallback while its initial pose loads');
console.log('PASS player remains visible while its initial pose loads');

const observerSource=fs.readFileSync(path.join(root,'apps/web/src/agent-observer.ts'),'utf8');
const observerContext={exports:{},URL,structuredClone};
vm.createContext(observerContext);
vm.runInContext(ts.transpileModule(observerSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,observerContext);
let now=0;const observer=new observerContext.exports.AgentObserver(true,()=>++now,2),debugTarget={};
observer.attach(debugTarget,()=>({ready:true}));observer.event('first',{value:1});observer.event('second',{value:2});
if(!observerContext.exports.agentObservationEnabled('http://localhost/play.html?agent=1')||observerContext.exports.agentObservationEnabled('http://localhost/play.html')||debugTarget.__mir2Agent.version!==1||debugTarget.__mir2Agent.events().length!==2||debugTarget.__mir2Agent.snapshot().ready!==true)throw new Error('agent observer is unavailable, unbounded or enabled outside explicit debug mode');
debugTarget.__mir2Agent.clear();if(debugTarget.__mir2Agent.events().length)throw new Error('agent observer timeline cannot be reset between scenarios');
console.log('PASS agent observer is explicit, bounded and resettable');
