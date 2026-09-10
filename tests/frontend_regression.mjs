import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const uiLayout=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/ui-layout.json'),'utf8'));
const uiInteractions=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/ui-interactions.json'),'utf8'));
const layoutSource=fs.readFileSync(path.join(root,'apps/web/src/classic-layout.ts'),'utf8').replace(/^import .*;\n/gm,'');
const source=`const itemAssets={iconIndexByName:{'祖玛井中月':48},fallbackIconIndexBySourceIndex:{1144:0,1582:0}};\nconst uiLayout=${JSON.stringify(uiLayout)};\nconst uiInteractions=${JSON.stringify(uiInteractions)};\n${layoutSource}\n`+fs.readFileSync(path.join(root,'apps/web/src/inventory.ts'),'utf8').replace(/^import .*;\n/gm,'');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mockDocument={createElement:tag=>new Element(tag)};
class Element{
 constructor(tag='div'){this.tag=tag;this.children=[];this.style={};this.dataset={};this.classList={add(){},remove(){}};this.disabled=false;this.hidden=false;this.ownerDocument=mockDocument;this.offsetLeft=0;this.offsetTop=0;this.listeners=new Map();}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=[...children];}
 addEventListener(type,listener){const list=this.listeners.get(type)??[];list.push(listener);this.listeners.set(type,list);}
 removeEventListener(type,listener){this.listeners.set(type,(this.listeners.get(type)??[]).filter(value=>value!==listener));}
 emit(type,event={}){for(const listener of this.listeners.get(type)??[])listener.call(this,event);}
 remove(){}
 setAttribute(){}
}
const context={exports:{},document:mockDocument,fetch:()=>new Promise(()=>{}),loadNationalUiLibrary:()=>new Promise(()=>{})};
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

const movedElement=new Element(),used=[];
const movableInventory=new context.exports.InventoryView(movedElement,{drop(){},equip(){},use:id=>used.push(id)});
const potion={name:'金创药(中量)',makeIndex:101,durability:1,maxDurability:1,stdMode:0,weight:1,looks:2,dc:{min:2,max:5},needLevel:7,price:1234};
movableInventory.replace([candle,potion]);
movedElement.children[0].onclick({preventDefault(){},shiftKey:false,clientX:20,clientY:20});
if(movableInventory.debugState().selectedSlot!==0)throw new Error('left click does not pick up an inventory item');
movedElement.children[7].onclick({preventDefault(){},shiftKey:false,clientX:20,clientY:20});
if(movableInventory.debugState().items.find(item=>item.makeIndex===100)?.slot!==7||movableInventory.debugState().selectedSlot!==undefined)throw new Error('picked inventory item cannot move to an empty grid cell');
const potionCell=movedElement.children.find(child=>child.dataset.itemId==='101');
potionCell.ondblclick({preventDefault(){},stopPropagation(){}});
if(used[0]!==101)throw new Error('double click does not use a consumable item');
const details=context.exports.itemDetailRows(potion);
if(!details.some(([name,value])=>name==='攻击'&&value==='2-5')||!details.some(([name,value])=>name==='价格'&&value==='1234'))throw new Error('inventory tooltip omits parsed item attributes');
if(context.exports.NATIONAL_BAG_CELL.originX!==18||context.exports.NATIONAL_BAG_CELL.originY!==14||context.exports.NATIONAL_BAG_CELL.gapX!==0||context.exports.NATIONAL_BAG_CELL.gapY!==0)throw new Error('national inventory grid is not aligned to the imported frame');
const nationalGrid=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/ui-layout.json'),'utf8')).nationalInventoryGrid;
if(nationalGrid.originX!==context.exports.NATIONAL_BAG_CELL.originX||nationalGrid.originY!==context.exports.NATIONAL_BAG_CELL.originY||nationalGrid.cellWidth!==context.exports.NATIONAL_BAG_CELL.width||nationalGrid.cellHeight!==context.exports.NATIONAL_BAG_CELL.height)throw new Error('frontend national inventory geometry diverges from the UI contract');
console.log('PASS inventory supports pick, place, double-click use, detailed attributes and national grid calibration');

const tooltipElement=new Element('aside');tooltipElement.hidden=true;
const tooltipParent={querySelector:selector=>selector.includes('#inventory-item-tooltip')?tooltipElement:undefined};
const tooltipInventoryElement=new Element();tooltipInventoryElement.parentElement=tooltipParent;
const tooltipInventory=new context.exports.InventoryView(tooltipInventoryElement,{drop(){},use(){},equip(){}});
tooltipInventory.replace([potion]);
const tooltipCell=tooltipInventoryElement.children.find(child=>child.dataset.itemId==='101');
tooltipCell.onmouseenter();
if(tooltipElement.hidden||!tooltipElement.children.length||tooltipElement.children[0].textContent!=='金创药(中量)')throw new Error('inventory hover and keyboard focus do not expose the item tooltip');
tooltipCell.onmouseleave();
if(!tooltipElement.hidden)throw new Error('inventory tooltip remains visible after leaving the item');
console.log('PASS inventory item tooltip opens and closes through pointer interaction');

const equipmentTooltipElement=new Element('aside');equipmentTooltipElement.hidden=true;
const equipmentTooltipParent={querySelector:selector=>selector.includes('#equipment-item-tooltip')?equipmentTooltipElement:undefined};
const equipmentTooltipGrid=new Element();equipmentTooltipGrid.parentElement=equipmentTooltipParent;
const equipmentTooltipView=new context.exports.EquipmentView(equipmentTooltipGrid,()=>{});
equipmentTooltipView.replace([{slot:7,item:potion}]);
const equipmentTooltipCell=equipmentTooltipGrid.children.find(child=>child.dataset.slot==='7');
equipmentTooltipCell.onmouseenter();
if(equipmentTooltipElement.hidden||!equipmentTooltipElement.children.length||equipmentTooltipElement.children[0].textContent!=='金创药(中量)')throw new Error('equipment hover does not expose the shared item tooltip');
equipmentTooltipCell.onmouseleave();
if(!equipmentTooltipElement.hidden)throw new Error('equipment tooltip remains visible after leaving the item');
console.log('PASS equipment item tooltip shares the inventory attribute renderer');

const serviceRow=new Element();
const serviceTooltip=context.exports.attachItemTooltip(serviceRow,potion,'修理实例');
const serviceTooltipElement=serviceRow.children.find(child=>child.className==='inventory-item-tooltip service-item-tooltip');
if(!serviceTooltipElement||!serviceTooltipElement.hidden)throw new Error('service tooltip is not mounted as a hidden accessible surface');
serviceRow.emit('pointerenter');
if(serviceTooltipElement.hidden||serviceTooltipElement.children[0].textContent!=='金创药(中量)')throw new Error('service row hover does not expose item attributes');
serviceRow.emit('pointerleave');
if(!serviceTooltipElement.hidden)throw new Error('service row tooltip remains visible after leaving the row');
serviceTooltip();
console.log('PASS shop, repair and storage rows share the item attribute tooltip');

const cancelledElement=new Element();const dropped=[];
const cancelledInventory=new context.exports.InventoryView(cancelledElement,{drop:id=>dropped.push(id),use(){},equip(){}});
cancelledInventory.replace([candle]);
cancelledElement.children.find(child=>child.dataset.itemId==='100').ondragend();
if(dropped.length||cancelledInventory.debugState().pending.length||cancelledInventory.debugState().selectedSlot!==undefined)throw new Error('cancelled inventory drag can still drop or leave a held selection');
console.log('PASS cancelled inventory drag clears the held selection without dropping the item');

const dragSource=fs.readFileSync(path.join(root,'apps/web/src/window-drag.ts'),'utf8').replace(/function dragHandle[\s\S]*/,'');
const dragContext={exports:{}};vm.createContext(dragContext);
vm.runInContext(ts.transpileModule(dragSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,dragContext);
const clamped=dragContext.exports.clampWindowPosition(760,-12,336,270);
if(clamped.left!==464||clamped.top!==0)throw new Error('movable classic windows can leave the 800 by 600 stage');
const frontElement=new Element();dragContext.exports.bringClassicWindowToFront(frontElement);if(frontElement.style.zIndex!=='31')throw new Error('classic window clicks do not raise the active window');
if(!dragSource.includes('ResizeObserver')||!dragSource.includes('reclamp()'))throw new Error('restored classic windows are not re-clamped after their imported frame dimensions become available');
console.log('PASS classic window dragging clamps persisted positions to the game stage');

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

const harvestInputSource=fs.readFileSync(path.join(root,'apps/web/src/harvest-input.ts'),'utf8');
const harvestInputContext={exports:{}};
vm.createContext(harvestInputContext);
vm.runInContext(ts.transpileModule(harvestInputSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,harvestInputContext);
const requestsHarvest=harvestInputContext.exports.requestsHarvest;
if(requestsHarvest({altKey:false,button:0})||requestsHarvest({altKey:true,button:2})||!requestsHarvest({altKey:true,button:0}))throw new Error('corpse harvesting does not require Alt plus the left mouse button');
console.log('PASS corpse harvesting requires Alt plus left click');

const equipmentElement=new Element();
const equipment=new context.exports.EquipmentView(equipmentElement,()=>{});
equipment.replace([{slot:7,item:{...candle,stdMode:22}}]);
if(equipment.preferredSlot(7)!==8)throw new Error('second ring does not select the empty right slot');
equipment.replace([{slot:5,item:{...candle,stdMode:24}}]);
if(equipment.preferredSlot(5)!==6)throw new Error('second bracelet does not select the empty right slot');
console.log('PASS frontend dual accessories select the empty paired slot');

const playSource=fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8');
const inventorySource=fs.readFileSync(path.join(root,'apps/web/src/inventory.ts'),'utf8');
const playMarkup=fs.readFileSync(path.join(root,'apps/web/play.html'),'utf8');
if(!playMarkup.includes('id="revive-panel" class="revive-panel classic-window utility-panel system-panel"')||!playSource.includes("classicHud.skinWindow(revivePanel,'system')"))throw new Error('production death modal does not use the national system-dialog skin');
if(!inventorySource.includes("'pointercancel'")||!inventorySource.includes("'visibilitychange'")||!inventorySource.includes("addEventListener?.('blur'"))throw new Error('inventory selection is not cleared on cancellation and focus loss');
console.log('PASS inventory selection clears on pointer cancellation, blur and hidden tabs');
if(playSource.includes("if(id==='chat'){classicWindow.hidden=true;return;}"))throw new Error('chat tab still closes the classic window');
if(!playSource.includes("if(id==='chat')classicWindowBody.append(chatPanel)"))throw new Error('chat tab does not expose the complete chat form');
if(!playSource.includes('function closeDialogue()')||!playSource.includes('dialogueNpcId=undefined;')||!playSource.includes('function hideServiceWindows(){\n closeDialogue();')||!playSource.includes('inventory.rejectPending();itemQuickBar.rejectPending();equipment.rejectPending();shop.rejectPending();repair.rejectPending();storage.rejectPending();'))throw new Error('closing dialogue or changing maps can leave stale NPC and service pending state');
if(playSource.includes('suppressNpcDialogsUntil'))throw new Error('valid NPC dialogue is discarded during the first seconds after map entry');
if(!playSource.includes('function targetApproachStep(')||!playSource.includes('pursuitRejectedCells.add(`${movement.x},${movement.y}`)')||!playSource.includes('pursuitTarget=retryTarget'))throw new Error('target pursuit does not reroute after a transient blocked move');
console.log('PASS target pursuit reroutes after a transient blocked move');
if(!playSource.includes("entity.dead?'Alt+左键挖肉'")||!playSource.includes('interact(target,requestsHarvest(event))')||!playSource.includes('if(target.dead&&!harvest)')||!playSource.includes("if(target.dead&&harvest){socket.send(JSON.stringify({type:'butch'"))throw new Error('corpse interaction can still harvest without Alt plus left click');
if(!playSource.includes('pursuitHarvest=retryHarvest')||!playSource.includes('interact(target,pursuitHarvest)'))throw new Error('automatic corpse approach loses the harvest modifier intent');
console.log('PASS corpse harvest intent survives automatic approach and blocked-cell retries');
if(!playSource.includes('.filter(value=>value.distance<=8)')||!playSource.includes('if(distance>8){connection.textContent=`${target.name||\'目标\'} 超出施法距离`'))throw new Error('the interaction list and spell distance exceed the server range');
console.log('PASS interaction targets match the server spell range');
console.log('PASS frontend chat tab exposes the channel and recipient controls');

const authSource=fs.readFileSync(path.join(root,'apps/web/src/classic-auth.ts'),'utf8');
const nationalMount=authSource.indexOf('this.mountNationalAuth();');
if(nationalMount<0||authSource.indexOf('this.renderSlots();',nationalMount)<nationalMount)throw new Error('national auth assets do not redraw existing character slots');
console.log('PASS national character assets redraw existing slots');

if(!authSource.includes("paintNationalButton(selectSprite,nationalPrguse"))throw new Error('national character slots mix fallback frame metadata with national images');
console.log('PASS national character slots use matching frame metadata');
if(!authSource.includes('nationalCreateJobs.find')||!authSource.includes('nationalCreateSexes.find')||authSource.includes('paintNationalButton(button,national,this.job===spec.job?spec.active:spec.index'))throw new Error('national character creation repaints with unavailable legacy frame indexes');
console.log('PASS national character creation keeps its own frame index space');
if(!authSource.includes("{'0-0':40,'1-0':80,'2-0':120,'0-1':160,'1-1':200,'2-1':240}"))throw new Error('national character selection portraits do not follow the three profession frame ranges');
console.log('PASS national character portraits use the correct profession ranges');
if(!authSource.includes('loadClassicUiSession()'))throw new Error('auth mount does not use the shared settled UI resource session');
if(!authSource.includes('if(!this.nationalReady&&(!chrSel||!title||!prguse))return;'))throw new Error('national-only auth mode has no guarded fallback slot renderer');
if(!authSource.includes('setBusy(busy:boolean)')||!authSource.includes("this.root.setAttribute('aria-busy',String(busy))"))throw new Error('auth controls do not expose a bounded busy state');
if(!playSource.includes('classicAuth.setBusy(true)')||!playSource.includes('classicAuth.setBusy(false)')||!playSource.includes('if(!reconnectEnabled||!credentials||reconnectAttempts>=5)classicAuth.setBusy(false)'))throw new Error('authentication requests do not lock controls and release them after a result');
const classicUiSource=fs.readFileSync(path.join(root,'apps/web/src/classic-ui.ts'),'utf8');
if(!classicUiSource.includes('Promise.allSettled(SESSION_FALLBACK.map(loadUiLibrary))')||!classicUiSource.includes('Promise.allSettled(SESSION_NATIONAL.map(loadNationalUiLibrary))')||!classicUiSource.includes('missingNational')||!classicUiSource.includes('interactions:typeof uiInteractions'))throw new Error('shared UI resource session does not settle optional families or expose missing-resource diagnostics');
const profile=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/national-ui-profile.json'),'utf8'));
if(profile.canvas.width!==800||profile.canvas.height!==600||profile.typography?.primaryCandidates?.length<2)throw new Error('national UI profile lacks the fixed canvas and typography contract');
const layout=JSON.parse(fs.readFileSync(path.join(root,'content/classic-176/ui-layout.json'),'utf8'));
if(layout.nationalWindowContracts?.repair?.content!=='durability-list-single-column'||layout.nationalWindowContracts?.storage?.content!=='storage-grid-four-column'||layout.nationalWindowContracts?.quest?.content!=='quest-progress-list'||layout.nationalWindowContracts?.attack?.content!=='attack-mode-select'||layout.nationalWindowContracts?.system?.content!=='modal-confirmation'||layout.nationalWindowContracts?.group?.frame!=='prguse#402'||layout.nationalWindowContracts?.guild?.frame!=='prguse#402')throw new Error('national service and utility windows do not have separate semantic content contracts');
if(layout.nationalHud?.mainDialog?.y!==349||layout.nationalHud?.mainDialog?.evidence!=='asset'||layout.nationalInventoryWindow?.index!==3||layout.nationalCharacterWindow?.index!==380||layout.nationalInventoryGrid?.originX!==18||layout.nationalInventoryGrid?.originY!==14)throw new Error('national HUD, inventory and character layout contracts are missing measured coordinates');
if(!classicUiSource.includes('layout:typeof uiLayout')||!classicUiSource.includes('layout:uiLayout'))throw new Error('shared UI resource session does not expose the layout contract');
const layoutHelperSource=fs.readFileSync(path.join(root,'apps/web/src/classic-layout.ts'),'utf8');
if(!layoutHelperSource.includes('export function applyNationalHudLayout')||!layoutHelperSource.includes('export function applyNationalInventoryLayout')||!layoutHelperSource.includes('export function applyNationalCharacterLayout'))throw new Error('classic layout helper does not apply HUD, inventory and character contracts');
const nationalHudSource=fs.readFileSync(path.join(root,'apps/web/src/classic-hud.ts'),'utf8');
if(!nationalHudSource.includes('applyNationalHudLayout(root)')||!nationalHudSource.includes('applyNationalInventoryLayout(element)')||!nationalHudSource.includes('applyNationalCharacterLayout(element)'))throw new Error('classic HUD does not apply national layout from the shared contract');
for(const kind of ['targets','ground','group','guild','system'])if(!nationalHudSource.includes(`${kind}:{index:402`))throw new Error(`national ${kind} window falls back to an unrelated skin`);
if(!fs.readFileSync(path.join(root,'apps/web/src/shop.ts'),'utf8').includes('shop-list--${this.mode}')||!fs.readFileSync(path.join(root,'apps/web/src/repair.ts'),'utf8').includes('repair-list')||!fs.readFileSync(path.join(root,'apps/web/src/storage.ts'),'utf8').includes('storage-list--${this.mode}'))throw new Error('service panels do not emit their semantic content layout classes');
const stageSource=fs.readFileSync(path.join(root,'apps/web/src/classic-stage.ts'),'utf8');
const stageContext={exports:{}};vm.createContext(stageContext);
vm.runInContext(ts.transpileModule(stageSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,stageContext);
if(stageContext.exports.classicScaleForViewport(400,300)!==0.5||stageContext.exports.classicScaleForViewport(800,300)!==0.5||stageContext.exports.classicScaleForViewport(1200,900)!==1)throw new Error('classic stage does not preserve the 4:3 pixel coordinate contract on short viewports');
console.log('PASS auth assets load concurrently and support a national-only client');

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

const minimapProfileSource=fs.readFileSync(path.join(root,'apps/web/src/minimap-profile.ts'),'utf8');
const minimapProfileContext={exports:{}};vm.createContext(minimapProfileContext);
vm.runInContext(ts.transpileModule(minimapProfileSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,minimapProfileContext);
if(minimapProfileContext.exports.minimapFrameByMap['0']!==100||minimapProfileContext.exports.minimapFrameByMap.D001!==0||minimapProfileContext.exports.minimapName('D001')!=='兽人古墓一层')throw new Error('minimap profile does not follow the one-based MiniMap.txt mapping');
const minimapSource=fs.readFileSync(path.join(root,'apps/web/src/minimap.ts'),'utf8');
const minimapHelpers=`const modes=['compact','expanded','hidden'];\n${minimapSource.match(/export function nextMiniMapMode[\s\S]*?\n\}/)?.[0]}\n${minimapSource.match(/export function mapPointFromClient[\s\S]*?\n\}/)?.[0]}`;
if(!minimapHelpers.includes('mapPointFromClient'))throw new Error('minimap coordinate helpers missing');
const minimapContext={exports:{}};vm.createContext(minimapContext);
vm.runInContext(ts.transpileModule(minimapHelpers,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,minimapContext);
const helper=minimapContext.exports;
if(helper.nextMiniMapMode('compact')!=='expanded'||helper.nextMiniMapMode('expanded')!=='hidden'||helper.nextMiniMapMode('hidden')!=='compact')throw new Error('Tab map modes do not form the expected three-state cycle');
const mapped=helper.mapPointFromClient(85,65,{left:10,top:20,width:150,height:100},{left:0,top:0,width:150,height:100},{width:700,height:700});
if(mapped.x!==350||mapped.y!==315||helper.mapPointFromClient(5,5,{left:10,top:20,width:150,height:100},{left:0,top:0,width:150,height:100},{width:700,height:700})!==undefined)throw new Error('minimap pointer coordinates do not map or reject letterbox clicks correctly');
const scaled=helper.mapPointFromClient(37.5,25,{left:0,top:0,width:75,height:50},{left:0,top:0,width:150,height:100},{width:700,height:700},{width:.5,height:.5});
if(scaled.x!==350||scaled.y!==350)throw new Error('scaled minimap pointer coordinates do not map to the center of the world');
console.log('PASS minimap profile, pointer mapping and Tab modes are deterministic');

const skillsSource=`const skillAssets={iconIndexByName:{}};\n${fs.readFileSync(path.join(root,'apps/web/src/skills.ts'),'utf8').replace(/^import .*;\n/gm,'')}`;
const skillsContext={exports:{},document:mockDocument,fetch:()=>new Promise(()=>{}),loadNationalUiLibrary:()=>new Promise(()=>{})};vm.createContext(skillsContext);
vm.runInContext(ts.transpileModule(skillsSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,skillsContext);
const sparseSkill={key:8,level:1,currentTrain:0,magicId:1,name:'攻杀剑术',effectType:0,effect:0,spell:1,power:1,trainLevels:[],maxTrain:[],job:0,delay:0,defSpell:0,defPower:0,maxPower:0,defMaxPower:0,description:''};
const sparseSlots=skillsContext.exports.arrangeSkillSlots([sparseSkill]);
if(sparseSlots[7]!==sparseSkill||sparseSlots[0]!==undefined)throw new Error('sparse skill keys are compacted into the wrong F-slot');
console.log('PASS sparse skill keys preserve their F-slot labels');
const hudSource=fs.readFileSync(path.join(root,'apps/web/src/classic-hud.ts'),'utf8');
if(!hudSource.includes('replaceSkills(skills:MagicSkill[]){this.skills=[...skills]')||!hudSource.includes('selectSlot(index:number){const slots=arrangeSkillSlots(this.skills)'))throw new Error('classic HUD hotbar loses sparse skill slot positions');
console.log('PASS classic HUD hotbar keeps sparse skill positions clickable');
for(const moduleName of ['shop','repair','storage']){
 const moduleSource=fs.readFileSync(path.join(root,`apps/web/src/${moduleName}.ts`),'utf8');
 if(!moduleSource.includes('pendingTimer')||!moduleSource.includes('8000'))throw new Error(`${moduleName} pending state has no timeout cleanup`);
}
const shopStateSource=fs.readFileSync(path.join(root,'apps/web/src/shop.ts'),'utf8');
if(!shopStateSource.includes('const expected=makeIndex===undefined||makeIndex===0?`goods:${name}`:`detail:${makeIndex}`')||!shopStateSource.includes('if(this.pending!==expected)return false;')||!shopStateSource.includes("this.pending!==`sell:${item.makeIndex}`"))throw new Error('late shop responses can mutate a reopened service window');
if(!fs.readFileSync(path.join(root,'apps/web/src/repair.ts'),'utf8').includes('this.pending!==item.makeIndex')||!fs.readFileSync(path.join(root,'apps/web/src/storage.ts'),'utf8').includes('this.pending!==item.makeIndex'))throw new Error('late repair or storage responses can mutate a reopened service window');
const quickBarStateSource=fs.readFileSync(path.join(root,'apps/web/src/item-quickbar.ts'),'utf8');
if(!inventorySource.includes('if(!this.pending.has(id))return false;')||!inventorySource.includes('if(!this.pending.has(slot))return false;')||!quickBarStateSource.includes('if(!this.pending.has(makeIndex))return false;')||!quickBarStateSource.includes('replace(items:InventoryItem[]){this.clearPending();'))throw new Error('late item responses can mutate a replaced inventory or equipment snapshot');
if(!playSource.includes("if(!shop.resolve(message.name,message.makeIndex,message.accepted))return;")||!playSource.includes("if(!shop.resolveSale(message.item,message.accepted))return;")||!playSource.includes("if(!repair.resolve(message.item,message.accepted))return;")||!playSource.includes("if(!storage.resolve(message.item,message.accepted))return;")||!playSource.includes('const quickBarHandled=itemQuickBar.resolve(message.makeIndex,message.accepted,true);')||!playSource.includes('if(!inventoryHandled&&!quickBarHandled)return;'))throw new Error('stale service or item responses still apply side effects after component rejection');
console.log('PASS shop, repair and storage pending states time out and unlock');

const quickBarSource=`const uiLayout=${JSON.stringify(uiLayout)};\nfunction classicUiLayout(){return uiLayout;}\n`+fs.readFileSync(path.join(root,'apps/web/src/item-quickbar.ts'),'utf8').replace(/^import .*;\n/gm,'');
const quickBarContext={exports:{},document:mockDocument,HTMLElement:Element,setTimeout,clearTimeout,loadFallbackItemIcons:()=>new Promise(()=>{}),loadNationalUiLibrary:()=>new Promise(()=>{}),nationalUiUrl:()=>'',uiUrl:()=>'',iconIndexOf:item=>item.looks};
vm.createContext(quickBarContext);
vm.runInContext(ts.transpileModule(quickBarSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,quickBarContext);
if(quickBarContext.exports.ITEM_QUICKBAR_SLOTS!==6||quickBarContext.exports.itemQuickBarSlotFromCode('Digit1')!==0||quickBarContext.exports.itemQuickBarSlotFromCode('Numpad6')!==5||quickBarContext.exports.itemQuickBarSlotFromCode('Digit7')!==undefined)throw new Error('item quickbar key contract does not map the six imported pockets');
const quickItems=[{name:'小红',makeIndex:401,stdMode:1,looks:1},{name:'木剑',makeIndex:402,stdMode:5,looks:2}];
const arranged=quickBarContext.exports.arrangeItemQuickSlots(quickItems,[401,402,undefined,undefined,undefined,undefined]);
if(arranged[0]!==quickItems[0]||arranged[1]!==undefined)throw new Error('item quickbar admits equipment into a consumable slot');
const quickElement=new Element(),quickUsed=[];
const quickBar=new quickBarContext.exports.ItemQuickBar(quickElement,{use:id=>{quickUsed.push(id);return true;},layoutKey:()=>undefined});
quickBar.replace(quickItems);
if(quickBar.debugState().slots[0].makeIndex!==401||quickBar.debugState().slots[1].makeIndex!==undefined)throw new Error('item quickbar does not auto-bind usable items into six slots');
if(quickElement.children[2].disabled)throw new Error('empty item quickbar slots must remain valid drag targets');
const keyEvent={code:'Digit1',repeat:false,isComposing:false,target:null,preventDefault(){this.prevented=true;}};
if(!quickBar.handleKey(keyEvent)||!keyEvent.prevented||quickUsed[0]!==401)throw new Error('item quickbar Digit1 does not use the bound item');
quickBar.bindSlot(2,401);if(quickBar.debugState().slots[0].makeIndex!==undefined||quickBar.debugState().slots[2].makeIndex!==401)throw new Error('item quickbar manual drag binding does not move an item');
quickBar.clearSlot(2);if(quickBar.debugState().slots.some(slot=>slot.makeIndex!==undefined))throw new Error('item quickbar context clear leaves a bound slot');
console.log('PASS item quickbar exposes six consumable slots, key use and manual rebinding');

const playPage=fs.readFileSync(path.join(root,'apps/web/play.html'),'utf8');
const calibrationPage=fs.readFileSync(path.join(root,'apps/web/ui-calibration.html'),'utf8');
if(!playPage.includes('data-hud-item-quickbar')||!calibrationPage.includes('data-hud-item-quickbar')||!playSource.includes("import {ItemQuickBar} from './item-quickbar';")||!playSource.includes("itemQuickBar.replace(message.items)"))throw new Error('production and calibration HUDs are missing the shared item quickbar wiring');
const layoutHelperCompiled=ts.transpileModule(`const uiLayout=${JSON.stringify(uiLayout)};\nconst uiInteractions=${JSON.stringify(uiInteractions)};\n`+fs.readFileSync(path.join(root,'apps/web/src/classic-layout.ts'),'utf8').replace(/^import .*;\n/gm,''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const layoutHelperContext={exports:{}};vm.createContext(layoutHelperContext);
vm.runInContext(layoutHelperCompiled,layoutHelperContext);
const origin=layoutHelperContext.exports.bagCellPositionFromLayout(0,true);
const lastCell=layoutHelperContext.exports.bagCellPositionFromLayout(39,true);
if(origin.left!==18||origin.top!==14||lastCell.left!==18+7*36||lastCell.top!==14+4*32)throw new Error('national bag cells are not generated from the layout contract');
if(layoutHelperContext.exports.nationalHudOrbMetrics().barWidth!==layout.nationalHud.experienceBar.width)throw new Error('national HUD orb metrics diverge from the layout contract');
const placed={style:{}};
layoutHelperContext.exports.placeBox(placed,{x:232,y:165,width:336,height:270});
if(placed.style.left!=='232px'||placed.style.top!=='165px'||placed.style.width!=='336px')throw new Error('layout helper does not apply contract boxes to elements');
const itemLayout=uiLayout.itemQuickBar;
const styleSource=fs.readFileSync(path.join(root,'apps/web/src/style.css'),'utf8');
if(itemLayout.count!==6||itemLayout.slotStep!==46||itemLayout.x!==280||itemLayout.y!==50||itemLayout.frameOrigin.y!==349)throw new Error('item quickbar geometry does not match the imported Prguse#1 evidence');
if(styleSource.includes('left:286px!important')||styleSource.includes('left:207px!important')||styleSource.includes('left:12px!important')||styleSource.includes('7.c0ab139c0ca9ba48.png'))throw new Error('national HUD/inventory/character coordinates are still duplicated as CSS !important literals');
console.log('PASS production and calibration pages share the measured national item quickbar contract');
