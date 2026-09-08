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
const movementContext={exports:{}};
vm.createContext(movementContext);
vm.runInContext(ts.transpileModule(movementSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,movementContext);
const held=movementContext.exports.movementInput({code:'KeyD',key:'D',shiftKey:true});
if(!held?.run||held.dx!==1)throw new Error('Shift+D does not begin running to the right');
if(movementContext.exports.releasesMovement(held,{code:'ShiftLeft',key:'Shift'}))throw new Error('releasing Shift clears the movement key');
if(!movementContext.exports.releasesMovement(held,{code:'KeyD',key:'d'}))throw new Error('releasing D after Shift leaves movement held');
console.log('PASS frontend movement release uses a modifier-stable key code');

const movementVisualSource=fs.readFileSync(path.join(root,'apps/web/src/movement-visual.ts'),'utf8');
const movementVisualContext={exports:{}};
vm.createContext(movementVisualContext);
vm.runInContext(ts.transpileModule(movementVisualSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,movementVisualContext);
if(movementVisualContext.exports.visualDirection(0)!==0||movementVisualContext.exports.visualDirection(2)!==2||movementVisualContext.exports.visualDirection(7)!==7)throw new Error('server movement direction differs from classic actor rows');
if(movementVisualContext.exports.MOVEMENT_DURATION_MS!==600)throw new Error('movement interpolation differs from the OpenMir2 interval');
console.log('PASS frontend movement visuals follow OpenMir2 direction and timing');

const mapViewSource=fs.readFileSync(path.join(root,'apps/web/src/map-view.ts'),'utf8');
if(!mapViewSource.includes('(x-app.stage.position.x)/48')||!mapViewSource.includes('(y-app.stage.position.y)/32'))throw new Error('screen clicks do not follow the interpolating camera');
const onlineActorSource=fs.readFileSync(path.join(root,'apps/web/src/online-actors.ts'),'utf8');
if(!onlineActorSource.includes('Math.floor(movementProgress*this.frames.length)')||!onlineActorSource.includes('this.start=this.movement?.start'))throw new Error('locomotion frames do not share the displacement clock');
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
