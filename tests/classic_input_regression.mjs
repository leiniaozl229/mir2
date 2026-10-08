import {installPlayUiContext} from './helpers/play_ui_context.mjs';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const compile=file=>ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const check=(value,message)=>{if(!value)throw new Error(message);};
class Element{
 constructor({input=false,editable=false,button=false,link=false,tabbable=false,order=0,z=0,hidden=false}={}){Object.assign(this,{input,isContentEditable:editable,button,link,tabbable,order,style:{zIndex:String(z)},hidden,dataset:{},listeners:new Map(),children:[],tabIndex:0,disabled:false,isConnected:true});}
 matches(selector=''){return (this.input&&selector.includes('input'))||(this.button&&selector.includes('button'))||(this.link&&selector.includes('a[href]'))||(this.tabbable&&selector.includes('[tabindex]'));}closest(selector){return this.matches(selector)?this:null;}blur(){this.blurred=true;}
 compareDocumentPosition(other){return this.order<other.order?4:2;}
 addEventListener(type,callback){this.listeners.set(type,callback);}
 contains(target){return this===target||this.children.includes(target);}
 querySelectorAll(){return this.children;}
 getClientRects(){return this.hidden?[]:[{}];}
 getAttribute(){return null;}
 focus(){if(this.ownerDocument)this.ownerDocument.activeElement=this;}
}
class DragEventTarget{
 constructor(){this.listeners=new Map();}
 addEventListener(type,callback){const listeners=this.listeners.get(type)??new Set();listeners.add(callback);this.listeners.set(type,listeners);}
 removeEventListener(type,callback){this.listeners.get(type)?.delete(callback);}
 dispatch(type,event={}){for(const callback of [...(this.listeners.get(type)??[])])callback(event);}
}
class DragElementFixture extends DragEventTarget{
 constructor(document){super();this.id='drag-fixture';this.ownerDocument=document;this.offsetWidth=200;this.offsetHeight=100;this.dataset={};this.hidden=false;this.capturedPointer=undefined;this.style={left:'100px',top:'100px',right:'auto',bottom:'auto',setProperty(name,value){this[name]=value;}};this.classList={values:new Set(),add(value){this.values.add(value);},remove(value){this.values.delete(value);}};this.__observers=new Set();}
 get hidden(){return this._hidden===true;}
 set hidden(value){const changed=this._hidden!==value;this._hidden=value;if(changed)for(const observer of [...(this.__observers??[])])observer.callback();}
 closest(){return null;}
 getBoundingClientRect(){const left=Number.parseFloat(this.style.left)||0,top=Number.parseFloat(this.style.top)||0;return {left,top,right:left+this.offsetWidth,bottom:top+this.offsetHeight,width:this.offsetWidth,height:this.offsetHeight};}
 setPointerCapture(pointerId){this.capturedPointer=pointerId;}
 hasPointerCapture(pointerId){return this.capturedPointer===pointerId;}
 releasePointerCapture(pointerId){if(this.capturedPointer===pointerId)this.capturedPointer=undefined;}
}
class DragMutationObserver{
 constructor(callback){this.callback=callback;this.target=undefined;}
 observe(target){this.target=target;target.__observers.add(this);}
 disconnect(){this.target?.__observers.delete(this);this.target=undefined;}
}
const movement={exports:{},require:()=>({})};vm.createContext(movement);vm.runInContext(compile('apps/web/src/movement-input.ts'),movement);
const keyboard={exports:{},HTMLElement:Element,require:()=>movement.exports};vm.createContext(keyboard);vm.runInContext(compile('apps/web/src/classic-input.ts'),keyboard);
const layout={exports:{},require:file=>({default:JSON.parse(fs.readFileSync(path.join(root,'content/classic-176',path.basename(file)),'utf8'))})};vm.createContext(layout);vm.runInContext(compile('apps/web/src/classic-layout.ts'),layout);
const dragStorage=new Map(),dragView=new DragEventTarget(),dragDocument=new DragEventTarget();dragDocument.hidden=false;dragDocument.defaultView=dragView;
const drag={exports:{},Element:DragElementFixture,HTMLElement:Element,MutationObserver:DragMutationObserver,localStorage:{getItem:key=>dragStorage.get(key)??null,setItem:(key,value)=>dragStorage.set(key,value)},getComputedStyle:element=>element.style};vm.createContext(drag);vm.runInContext(compile('apps/web/src/window-drag.ts'),drag);
const draggable=new DragElementFixture(dragDocument),surface={getBoundingClientRect:()=>({width:800})};drag.exports.makeClassicWindowDraggable(draggable,surface);
const pointer=(type,pointerId,x,y)=>draggable.dispatch(type,{button:0,pointerId,clientX:x,clientY:y,target:draggable,preventDefault(){this.prevented=true;}});
pointer('pointerdown',1,100,100);pointer('pointermove',1,140,100);check(draggable.style.left==='140px','window drag did not follow the active pointer');pointer('pointerup',2,140,100);check(draggable.classList.values.has('window-dragging'),'unrelated pointerup ended an active drag');draggable.hidden=true;check(draggable.style.left==='100px'&&!draggable.classList.values.has('window-dragging')&&!draggable.listeners.get('pointermove')?.size,'hiding a window left its active drag capture/listeners behind');
draggable.hidden=false;pointer('pointerdown',3,100,100);pointer('pointermove',3,125,100);dragView.dispatch('blur');check(draggable.style.left==='100px'&&!draggable.classList.values.has('window-dragging'),'blur did not cancel and roll back a window drag');
pointer('pointerdown',4,100,100);pointer('pointermove',4,130,100);pointer('pointercancel',4,130,100);check(draggable.style.left==='100px'&&!draggable.classList.values.has('window-dragging'),'pointercancel did not roll back a window drag');
pointer('pointerdown',5,100,100);pointer('pointermove',5,135,100);draggable.dispatch('lostpointercapture',{pointerId:5});check(draggable.style.left==='100px'&&!draggable.classList.values.has('window-dragging'),'lost pointer capture did not roll back a window drag');
pointer('pointerdown',6,100,100);pointer('pointermove',6,120,100);pointer('pointerup',6,120,100);check(draggable.style.left==='120px'&&JSON.parse(dragStorage.get('mir2.window-position.drag-fixture')).left===120,'matching pointerup did not commit and persist the window position');console.log('PASS window dragging ignores unrelated pointerup and cleans up hidden, blur, cancel, lost-capture and commit paths');
let available=true,blocked=false,pickupHeld=false;const calls=[];
const actions={inWorld:()=>available,worldBlocked:()=>blocked,cancelTransient:()=>{if(!pickupHeld)return false;pickupHeld=false;calls.push('pickup.cancel');return true;},cancel:()=>calls.push('cancel'),closeTop:()=>calls.push('close'),itemKey:event=>{if(event.key!=='1')return false;calls.push('item');return true;},chat:()=>calls.push('chat'),minimap:()=>calls.push('map'),attackMode:()=>calls.push('mode'),window:id=>calls.push(id),skill:slot=>calls.push(`skill:${slot}`),movement:()=>calls.push('move')};
const key=(key,extra={})=>{const event={key,code:key,shiftKey:false,ctrlKey:false,isComposing:false,repeat:false,target:null,preventDefault(){this.prevented=true;},...extra};keyboard.exports.routeClassicKey(event,actions);return event;};

available=false;for(const k of ['1','F1','F9','Enter','Tab','w','Escape'])key(k,{code:k==='w'?'KeyW':k});
check(calls.length===0,'auth/death/map-not-ready input reaches gameplay callbacks');available=true;
for(const target of [new Element({input:true}),new Element({editable:true})]){
 key('F1',{target});key('w',{target,code:'KeyW'});key('Escape',{target});
 check(target.blurred,'Escape does not release text focus before closing windows');
}
key('Enter',{isComposing:true});key('Enter',{keyCode:229});check(calls.length===0,'IME or text input fires world actions');
console.log('PASS auth/death/world-not-ready gating and text/IME focus priority');

blocked=true;for(const k of ['1','F1','Enter','Tab','w','h'])key(k,{code:k==='w'?'KeyW':k,ctrlKey:k==='h'});
check(calls.length===0,'NPC or service modal fires consumable, spell, movement, chat, map or attack-mode hotkey');
key('F9');key('F10');check(calls.join(',')==='inventory,character','service modal cannot open cooperating inventory/character windows');
calls.length=0;pickupHeld=true;key('Escape');check(calls.join(',')==='pickup.cancel'&&!pickupHeld,'first Escape closes a window while an item is held');calls.length=0;key('Escape');check(calls.join(',')==='cancel,close','second Escape does not close the top window after the held item was cancelled');
console.log('PASS NPC/service input isolation, cooperating item windows and Escape cancellation');

blocked=false;calls.length=0;key('F8');key('1');key('Enter');key('Tab');key('h',{ctrlKey:true});key('w',{code:'KeyW'});
check(calls.join(',')==='skill:7,item,chat,map,mode,move','normal world shortcut behavior or sparse F8 slot changed');
calls.length=0;key('F1',{repeat:true});key('F9',{repeat:true});key('w',{code:'KeyW',repeat:true});check(calls.length===0,'key repeats send repeated discrete actions');
console.log('PASS normal world skills/items/chat/map/attack/movement and repeat suppression');

calls.length=0;const focusedButton=new Element({button:true});
const enterButton=key('Enter',{target:focusedButton}),spaceButton=key(' ',{target:focusedButton}),tabButton=key('Tab',{target:focusedButton});
check(calls.length===0&&!enterButton.prevented&&!spaceButton.prevented&&!tabButton.prevented,'focused native buttons lose Enter/Space activation or Tab navigation to game hotkeys');
key('F1',{target:focusedButton});check(calls.join(',')==='skill:0','preserving a focused button’s activation keys disabled explicit function-key gameplay shortcuts');
console.log('PASS focused native controls keep Enter/Space/Tab while explicit F-key shortcuts remain available');

const chatPrefixes=[];const prefixActions={...actions,chat:prefix=>chatPrefixes.push(prefix)};
for(const value of ['Enter',' ','@','!','/']){
 const e={key:value,code:'',repeat:false,shiftKey:['@','!'].includes(value),preventDefault(){this.prevented=true;}};
 keyboard.exports.routeClassicKey(e,prefixActions);check(e.prevented,'chat shortcut leaves its character on the world surface');
}
check(JSON.stringify(chatPrefixes)===JSON.stringify([undefined,undefined,'@','!','/']),'original prefix keys are not forwarded exactly');
for(const extra of [{repeat:true},{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true},{keyCode:229},{target:new Element({input:true})}])keyboard.exports.routeClassicKey({key:'/',code:'',preventDefault(){},...extra},prefixActions);
blocked=true;keyboard.exports.routeClassicKey({key:'!',code:'',preventDefault(){}},prefixActions);blocked=false;
check(chatPrefixes.length===5,'repeat/modifier/IME/text/modal shortcut opens a second chat editor');
console.log('PASS original Enter/Space and command/shout/whisper prefixes respect focus, IME, modifiers and repeats');

const bag=new Element({order:1,z:40}),character=new Element({order:2,z:41}),shop=new Element({order:3,z:39}),closed=[];
const windowDocument={activeElement:null,body:new Element(),documentElement:new Element(),querySelector(){return undefined;}};windowDocument.body.ownerDocument=windowDocument;windowDocument.documentElement.ownerDocument=windowDocument;for(const element of [bag,character,shop])element.ownerDocument=windowDocument;
const windows=[{element:shop,close:()=>{closed.push('shop');shop.hidden=true;}},{element:bag,close:()=>{closed.push('bag');bag.hidden=true;}},{element:character,close:()=>{closed.push('character');character.hidden=true;}}];
drag.exports.closeTopClassicWindow(windows);check(closed[0]==='character','fixed type order closes a window below the actual top window');
drag.exports.bringClassicWindowToFront(shop);drag.exports.bringClassicWindowToFront(bag); // raise counter as needed in this isolated fixture
shop.style.zIndex='42';drag.exports.closeTopClassicWindow(windows);check(closed[1]==='shop','clicked/raised service window is not the Escape target');
character.hidden=false;character.style.zIndex=bag.style.zIndex='0';shop.hidden=true;
drag.exports.closeTopClassicWindow(windows);check(closed[2]==='character','equal z-index does not follow DOM paint order');
character.hidden=bag.hidden=true;check(!drag.exports.closeTopClassicWindow(windows),'all-hidden windows still consume a close operation');
console.log('PASS proposed generic window close follows paint order, raised windows, DOM ties and hidden exclusion');

const focusDocument={activeElement:null,body:new Element(),documentElement:new Element(),defaultView:new DragEventTarget(),addEventListener(){},querySelector(){return undefined;}};
focusDocument.body.ownerDocument=focusDocument;focusDocument.documentElement.ownerDocument=focusDocument;
const underlyingWindow=new Element({order:1,z:35}),underlyingControl=new Element({order:1});underlyingWindow.ownerDocument=focusDocument;underlyingControl.ownerDocument=focusDocument;underlyingControl.parentElement=underlyingWindow;underlyingWindow.children=[underlyingControl];
const upperWindow=new Element({order:2,z:36}),upperControl=new Element({order:2});upperWindow.ownerDocument=focusDocument;upperControl.ownerDocument=focusDocument;upperControl.parentElement=upperWindow;upperWindow.children=[upperControl];
drag.exports.makeClassicWindowDraggable(underlyingWindow,{getBoundingClientRect:()=>({width:800})});drag.exports.makeClassicWindowDraggable(upperWindow,{getBoundingClientRect:()=>({width:800})});
underlyingWindow.listeners.get('focusin')({target:underlyingControl});upperWindow.listeners.get('focusin')({target:upperControl});focusDocument.activeElement=upperControl;
drag.exports.closeTopClassicWindow([{element:upperWindow,close:()=>{upperWindow.hidden=true;focusDocument.activeElement=focusDocument.body;}},{element:underlyingWindow,close:()=>{underlyingWindow.hidden=true;}}]);
check(focusDocument.activeElement===underlyingControl,'closing the top window does not restore focus to the last valid control in the remaining window');
const fallbackControl=new Element({order:3});fallbackControl.ownerDocument=focusDocument;fallbackControl.parentElement=underlyingWindow;underlyingWindow.children.push(fallbackControl);underlyingControl.disabled=true;upperWindow.hidden=false;focusDocument.activeElement=upperControl;
drag.exports.closeTopClassicWindow([{element:upperWindow,close:()=>{upperWindow.hidden=true;focusDocument.activeElement=focusDocument.body;}},{element:underlyingWindow,close:()=>{underlyingWindow.hidden=true;}}]);
check(focusDocument.activeElement===fallbackControl,'closing the top window restores focus to a hidden/disabled remembered control');
upperWindow.hidden=false;focusDocument.activeElement=upperControl;
drag.exports.closeClassicWindowEntry([{element:upperWindow,close:()=>{upperWindow.hidden=true;focusDocument.activeElement=focusDocument.body;}},{element:underlyingWindow,close:()=>{underlyingWindow.hidden=true;}}],upperWindow);
check(focusDocument.activeElement===fallbackControl,'manual close button does not restore focus to the next visible window');
upperWindow.hidden=false;focusDocument.activeElement=upperControl;
drag.exports.closeClassicWindowEntry([{element:upperWindow,close:()=>{focusDocument.activeElement=focusDocument.body;}},{element:underlyingWindow,close:()=>{underlyingWindow.hidden=true;}}],upperWindow);
check(focusDocument.activeElement===focusDocument.body,'pending asynchronous close steals focus before the window is actually hidden');
upperWindow.hidden=true;focusDocument.activeElement=focusDocument.body;
drag.exports.restoreClassicWindowFocus([{element:upperWindow,close:()=>{}},{element:underlyingWindow,close:()=>{}}],upperWindow,true);
check(focusDocument.activeElement===fallbackControl,'a cleared service panel does not restore focus to the next useful window');
upperWindow.hidden=false;focusDocument.activeElement=focusDocument.body;
check(!drag.exports.restoreClassicWindowFocus([{element:upperWindow,close:()=>{}},{element:underlyingWindow,close:()=>{}}],upperWindow,true),'a service close that remains visible steals focus while waiting');
console.log('PASS Escape and manual close restore the previous window focus; pending closes preserve focus');

// Exercise the production play.ts close callback wiring, including pending cleanup and chat redocking.
const source=ts.createSourceFile('play.ts',fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8'),ts.ScriptTarget.ES2022,true);
check(source.getFullText().includes('cancelTransient:()=>{if(inventory.cancelSelection())return true;if(skillBar.cancelSelection())return true;return skillBar.cancelKeyBinding();}'),'production keyboard routing does not consume transient item/skill state before closing a window');
const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='closeTopWindow');
const closeClassic=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='closeClassicWindow');
const entries=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='classicWindowEntries');
const closeByElement=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='closeWindowByElement');
check(fn&&entries&&closeByElement,'production window close callback wiring is absent');
const panels=Object.fromEntries(['#shop-panel','#repair-panel','#storage-panel'].map(id=>[id,new Element({hidden:true})]));
let rejected=0,docked=0,selectionCancelled=0,keyBindingCancelled=0,npcClosed=0;
  const play={exports:{},classicWindowClosesOnEscape:layout.exports.classicWindowClosesOnEscape,closeClassicWindowEntry:drag.exports.closeClassicWindowEntry,closeTopClassicWindow:drag.exports.closeTopClassicWindow,dialogueElement:new Element({hidden:true}),closeDialogue(){},closeNpcSession:()=>npcClosed++,skillBar:{cancelKeyBinding:()=>keyBindingCancelled++},document:{querySelector:id=>panels[id]},shop:{clear(){}},repair:{clear(){}},storage:{clear(){}},classicWindow:new Element({hidden:true}),classicWindowSources:[],standaloneUtilityWindows:[],closeUtilityWindow(){},tradeOpen:false,tradeCancel:{click(){}},inventoryWindow:new Element({hidden:true}),characterWindow:new Element({z:50}),equipment:{rejectPending:()=>rejected++},inventory:{cancelSelection:()=>selectionCancelled++},dockChat:()=>docked++};
play.inventoryWindow.id='inventory-window';play.characterWindow.id='character-window';
for(const element of [...Object.values(panels),play.dialogueElement,play.classicWindow,play.inventoryWindow,play.characterWindow])element.ownerDocument=windowDocument;
play.characterWindow.children=[new Element({button:true})];play.characterWindow.children[0].ownerDocument=windowDocument;play.characterWindow.children[0].parentElement=play.characterWindow;
play.inventoryWindow.children=[new Element({button:true})];play.inventoryWindow.children[0].ownerDocument=windowDocument;play.inventoryWindow.children[0].parentElement=play.inventoryWindow;
drag.exports.makeClassicWindowDraggable(play.inventoryWindow,{getBoundingClientRect:()=>({width:800})});play.inventoryWindow.listeners.get('focusin')({target:play.inventoryWindow.children[0]});
installPlayUiContext(play);vm.runInContext(ts.transpileModule(`${closeClassic.getText(source)}\n${entries.getText(source)}\n${closeByElement.getText(source)}\n${fn.getText(source)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,play);
play.characterWindow.hidden=false;play.inventoryWindow.hidden=false;windowDocument.activeElement=play.characterWindow.children[0];play.closeWindowByElement(play.characterWindow);
check(play.characterWindow.hidden&&rejected===1&&keyBindingCancelled===1&&windowDocument.activeElement===play.inventoryWindow.children[0],'production character close leaves pending state or focus in the closed window');
play.classicWindow.hidden=false;play.closeWindowByElement(play.classicWindow);check(play.classicWindow.hidden&&docked===1,'manual chat/generic close does not restore HUD chat');
play.inventoryWindow.hidden=false;windowDocument.activeElement=play.inventoryWindow.children[0];play.closeWindowByElement(play.inventoryWindow);check(selectionCancelled===1,'manual bag close does not release held inventory selection');
play.inventoryWindow.hidden=false;windowDocument.activeElement=play.inventoryWindow.children[0];play.closeTopWindow();check(!play.inventoryWindow.hidden&&selectionCancelled===1&&windowDocument.activeElement===play.inventoryWindow.children[0],'Escape closes the native bag or steals its focus');
play.characterWindow.hidden=false;play.classicWindow.hidden=false;play.classicWindow.style.zIndex='20';windowDocument.activeElement=play.characterWindow.children[0];play.closeTopWindow();check(!play.characterWindow.hidden&&!play.inventoryWindow.hidden&&!play.classicWindow.hidden&&rejected===1&&keyBindingCancelled===1,'Escape closes a native character/bag window or falls through to the lower generic window');
play.classicWindow.style.zIndex='60';play.closeTopWindow();check(play.classicWindow.hidden&&!play.characterWindow.hidden&&!play.inventoryWindow.hidden&&docked===2,'an upper generic close bypasses its lifecycle or closes the native windows beneath it');
play.closeWindowByElement(play.inventoryWindow);check(play.inventoryWindow.hidden&&selectionCancelled===2,'native Escape protection blocks manual bag close cleanup');
check(source.getFullText().includes("#close-dialogue')!.addEventListener('click',()=>closeWindowByElement(dialogueElement))")&&source.getFullText().includes('if(target)closeWindowByElement(target)'),'visible close buttons bypass shared focus and cleanup behavior');
console.log('PASS native bag/character ignore Escape, protected tops do not close lower windows, and manual closes retain cleanup/focus');

const calibrationSource=ts.createSourceFile('ui-calibration.ts',fs.readFileSync(path.join(root,'apps/web/src/ui-calibration.ts'),'utf8'),ts.ScriptTarget.ES2022,true);
const calibrationFns=calibrationSource.statements.filter(node=>ts.isFunctionDeclaration(node)&&['calibrationWindowEntries','closeCalibrationTopWindow','closeCalibrationWindow'].includes(node.name?.text));
check(calibrationFns.length===3,'calibration window close wiring is missing');
const calibrationPanels={'#inventory-window':play.inventoryWindow,'#character-window':play.characterWindow,'#shop-panel':panels['#shop-panel']};
const calibration={...play,calibrationWindowIds:['inventory-window','character-window','shop-panel'],goldDrop:undefined,document:{querySelector:id=>calibrationPanels[id]}};
vm.createContext(calibration);vm.runInContext(ts.transpileModule(calibrationFns.map(node=>node.getText(calibrationSource)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,calibration);
play.inventoryWindow.hidden=false;play.characterWindow.hidden=false;panels['#shop-panel'].hidden=false;panels['#shop-panel'].style.zIndex='10';calibration.closeCalibrationTopWindow();
check(!play.inventoryWindow.hidden&&!play.characterWindow.hidden&&!panels['#shop-panel'].hidden,'calibration diverges from native Escape protection');
panels['#shop-panel'].style.zIndex='70';calibration.closeCalibrationTopWindow();check(panels['#shop-panel'].hidden&&!play.characterWindow.hidden&&!play.inventoryWindow.hidden,'calibration upper service close also closes the protected native windows');
console.log('PASS calibration executes the same contract and top-window Escape behavior as production');
const closeButtons=[{closest:()=>play.inventoryWindow},{closest:()=>play.characterWindow}];
calibration.document.querySelectorAll=()=>closeButtons;
const calibrationWire=calibrationSource.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='wireControls');
const manualCloseBinding=calibrationWire.body.statements.find(node=>node.getText(calibrationSource).includes("querySelectorAll<HTMLButtonElement>('[data-window-close]')"));
check(manualCloseBinding,'calibration manual close buttons are not wired');
vm.runInContext(ts.transpileModule(manualCloseBinding.getText(calibrationSource),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,calibration);
const beforeManualSelection=selectionCancelled,beforeManualEquipment=rejected;
closeButtons[0].onclick();check(play.inventoryWindow.hidden&&!play.characterWindow.hidden&&selectionCancelled===beforeManualSelection+1,'calibration bag close uses the Escape policy, closes a different window, or skips selection cleanup');
closeButtons[1].onclick();check(play.characterWindow.hidden&&rejected===beforeManualEquipment+1,'calibration character close uses the Escape policy or skips pending equipment cleanup');
console.log('PASS actual calibration manual-button binding closes its own protected window and performs cleanup');

const stateNodes=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&['worldInputAvailable','worldInputBlocked','serviceWindowOpened'].includes(node.name?.text));
const auth=new Element({hidden:true}),revive=new Element({hidden:true}),npc=new Element({hidden:true}),self={id:1,dead:false};
let inWorld=true,stopped=0;
const state={systemDialog:{isOpen:()=>false},self:1,entities:new Map([[1,self]]),worldReady:true,revivePanel:revive,dialogueElement:npc,document:{body:{classList:{contains:()=>inWorld}},querySelector:id=>id==='#auth-overlay'?auth:panels[id]},hideItemTooltip(){},cancelWorldIntent:()=>stopped++,bringClassicWindowToFront:drag.exports.bringClassicWindowToFront};
installPlayUiContext(state);vm.runInContext(ts.transpileModule(stateNodes.map(node=>node.getText(source)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,state);
check(state.worldInputAvailable()&&!state.worldInputBlocked(),'fixture world input is unavailable');
state.skillKeyDialog.isOpen=()=>true;
check(!state.worldInputAvailable()&&state.worldInputBlocked(),'native skill-key modal does not block production world input');
state.skillKeyDialog.isOpen=()=>false;
for(const mutate of [()=>auth.hidden=false,()=>self.dead=true,()=>revive.hidden=false,()=>state.worldReady=false,()=>inWorld=false]){
 mutate();check(!state.worldInputAvailable(),'production availability misses auth/death/revive/map/body gate');
 auth.hidden=revive.hidden=true;self.dead=false;state.worldReady=inWorld=true;
}
npc.hidden=false;check(state.worldInputBlocked(),'production NPC modal is not recognized');npc.hidden=true;panels['#shop-panel'].hidden=false;
check(state.worldInputBlocked(),'production shop modal is not recognized');state.serviceWindowOpened(panels['#shop-panel']);
check(stopped===1&&Number(panels['#shop-panel'].style.zIndex)>0,'opening a production service does not stop persistent world input and raise the window');
console.log('PASS production world gating and service-opening cancellation');

const deathNode=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='showDeathWindow'),cancelGroupNode=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='cancelGroupConfirmation');
let cancelled=0;const cleared=[];
const death={systemDialog:{interrupt(){},isOpen:()=>false},groupConfirmationSerial:1,groupConfirmationPending:{serial:1,type:'groupAdd',target:'小明'},renderGroup(){},audio:{clear:()=>cleared.push('audio')},skillBar:{cancelKeyBinding:()=>cleared.push('skill-binding')},pending:{actionId:1},pendingAction:{actionId:1},cancelWorldIntent:()=>cancelled++,inventory:{cancelSelection:()=>cleared.push('held-item')},equipment:{rejectPending:()=>cleared.push('equipment')},closeNpcSession:()=>cleared.push('npc-session'),hideDialogue:()=>cleared.push('dialogue'),shop:{clear:()=>cleared.push('shop')},repair:{clear:()=>cleared.push('repair')},storage:{clear:()=>cleared.push('storage')},characterPanel:{resources:value=>cleared.push(`hp:${value.hp}`)},classicHud:{skinWindow(){}},revivePanel:new Element({hidden:true}),bringClassicWindowToFront:drag.exports.bringClassicWindowToFront,connection:{},combatStatus:{}};
installPlayUiContext(death);vm.runInContext(ts.transpileModule(`${cancelGroupNode.getText(source)}\n${deathNode.getText(source)}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,death);death.showDeathWindow();
check(cancelled===1&&!death.pending&&!death.pendingAction,'death leaves movement/combat intents or pending world action');
check(death.groupConfirmationPending===undefined&&death.groupConfirmationSerial===2,'death leaves a stale party confirmation valid');
check(cleared.join(',')==='audio,skill-binding,held-item,equipment,npc-session,dialogue,shop,repair,storage,hp:0'&&!death.revivePanel.hidden,'death leaves audio/service/item waits or fails to show revive modal');
console.log('PASS production death cancels world intent and item/service waits before showing revival');

const revivalNodes=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&['worldInputAvailable','cancelGroupConfirmation','showDeathWindow','restoreAliveWindow'].includes(node.name?.text));
const revivedSelf={id:1,self:true,dead:false},revivalPanel=new Element({hidden:true}),townButton={disabled:true};
const revival={...death,self:1,entities:new Map([[1,revivedSelf]]),worldReady:true,revivePanel:revivalPanel,returnToTown:townButton,document:{body:{classList:{contains:()=>true}},querySelector:()=>({hidden:true})}};
installPlayUiContext(revival);vm.runInContext(ts.transpileModule(revivalNodes.map(node=>node.getText(source)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,revival);
revivedSelf.dead=true;revival.showDeathWindow();
check(!revival.worldInputAvailable()&&!revivalPanel.hidden,'death does not lock actual production world input');
revival.restoreAliveWindow({id:2,self:false,dead:false});
check(!revival.worldInputAvailable()&&!revivalPanel.hidden&&townButton.disabled,'another actor revival releases the self death modal');
calls.length=0;
keyboard.exports.routeClassicKey({key:'w',code:'KeyW',target:null,repeat:false,preventDefault(){}},{...actions,inWorld:revival.worldInputAvailable,worldBlocked:()=>false});
check(calls.length===0,'movement callback runs before the server revives the self actor');
revivedSelf.dead=false;revival.restoreAliveWindow(revivedSelf);
check(revivalPanel.hidden&&!townButton.disabled&&revival.worldInputAvailable(),'self entityAlive leaves the revive panel or return button locked');
keyboard.exports.routeClassicKey({key:'w',code:'KeyW',target:null,repeat:false,preventDefault(){}},{...actions,inWorld:revival.worldInputAvailable,worldBlocked:()=>false});
check(calls.join(',')==='move','server-confirmed self revival fails to restore the production keyboard route');
console.log('PASS production death-to-alive recovery stays locked for other actors and restores self input and the return button');
