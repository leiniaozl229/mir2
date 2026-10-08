import type {InventoryItem,InventoryView} from './inventory';
import {ItemIconAssets,itemIconElement} from './item-icons';
import {classicUiLayout} from './classic-layout';

export const ITEM_QUICKBAR_SLOTS=6;
export const ITEM_QUICKBAR_KEYS=['1','2','3','4','5','6'] as const;

export function itemQuickBarSlotFromCode(code:string){
 const match=/^(?:Digit|Numpad)([1-6])$/.exec(code);
 return match?Number(match[1])-1:undefined;
}

export function isItemQuickBarUsable(item:Pick<InventoryItem,'stdMode'>){return item.stdMode<=4||item.stdMode===31;}

export function arrangeItemQuickSlots(items:InventoryItem[],bindings:Array<number|undefined>){
 const byId=new Map(items.map(item=>[item.makeIndex,item]));
 return Array.from({length:ITEM_QUICKBAR_SLOTS},(_,slot)=>{
  const id=bindings[slot];
  const item=id===undefined?undefined:byId.get(id);
  return item&&isItemQuickBarUsable(item)?item:undefined;
 });
}

type QuickBarActions={use:(makeIndex:number)=>boolean|void;status?:(text:string)=>void;layoutKey?:()=>string|undefined;heldItem?:()=>InventoryItem|undefined;clearHeld?:()=>void;canUse?:(makeIndex:number)=>boolean;inventory?:InventoryView};

/** Six-slot item bar mapped to 1–6/Numpad1–6 and backed by per-character local storage. */
export class ItemQuickBar{
 private items=new Map<number,InventoryItem>();
 private slots:Array<number|undefined>=Array(ITEM_QUICKBAR_SLOTS).fill(undefined);
 private pending=new Set<number>();
 private pendingTimers=new Map<number,ReturnType<typeof setTimeout>>();
 private readonly iconAssets:ItemIconAssets;
 private iconRender=0;
 private activeLayoutKey:string|undefined;
 private layoutLoaded=false;
 private storedLayout=false;
 constructor(private readonly element:HTMLElement,private readonly actions:QuickBarActions){
  this.element.classList.add('hud-item-quickbar');
  this.actions.inventory?.enablePockets();
  this.iconAssets=new ItemIconAssets('items',()=>this.render());
  this.render();
 }
 clear(){this.clearPending();this.items.clear();this.slots=Array(ITEM_QUICKBAR_SLOTS).fill(undefined);this.activeLayoutKey=undefined;this.layoutLoaded=false;this.storedLayout=false;this.render();}
 replace(items:InventoryItem[]){this.clearPending();if(this.actions.inventory){this.render();return;}this.syncLayout();this.items=new Map(items.map(item=>[item.makeIndex,item]));this.pruneBindings();this.autoBind();this.render();}
 add(item:InventoryItem){if(this.actions.inventory){this.render();return;}this.syncLayout();this.items.set(item.makeIndex,item);if(isItemQuickBarUsable(item)&&!this.slots.includes(item.makeIndex)){const empty=this.slots.findIndex(id=>id===undefined);if(empty>=0){this.slots[empty]=item.makeIndex;this.saveLayout();}}this.render();}
 update(item:InventoryItem){if(this.actions.inventory){this.render();return;}if(this.items.has(item.makeIndex)){this.items.set(item.makeIndex,item);this.render();}}
 remove(makeIndex:number){if(this.actions.inventory){this.render();return;}this.items.delete(makeIndex);this.slots=this.slots.map(id=>id===makeIndex?undefined:id);this.clearPendingTimer(makeIndex);this.pending.delete(makeIndex);this.saveLayout();this.render();}
 resolve(makeIndex:number,accepted:boolean,removeOnSuccess=true){if(this.actions.inventory)return false;if(!this.pending.has(makeIndex))return false;this.clearPendingTimer(makeIndex);this.pending.delete(makeIndex);if(accepted&&removeOnSuccess)this.remove(makeIndex);else this.render();return true;}
 rejectPending(){if(!this.pending.size)return;this.clearPending();this.render();}
 retryIcons(){return this.iconAssets.retry();}
  refreshAvailability(){this.render();}
 handleKey(event:KeyboardEvent){
  if(event.isComposing||event.repeat)return false;
  if(event.target instanceof HTMLElement&&event.target.matches('input,select,textarea'))return false;
  const slot=itemQuickBarSlotFromCode(event.code);if(slot===undefined)return false;
  const item=this.actions.inventory?.pocketItems()[slot]??(this.actions.inventory?undefined:this.items.get(this.slots[slot]!)),makeIndex=item?.makeIndex;
   if(makeIndex===undefined||!item||this.pending.has(makeIndex))return true;
  event.preventDefault();this.use(slot,item);return true;
 }
 bindSlot(slot:number,makeIndex:number){
  if(this.actions.inventory)return this.actions.inventory.moveToPocket(slot,makeIndex);
  const item=this.items.get(makeIndex);if(slot<0||slot>=ITEM_QUICKBAR_SLOTS||!item||!isItemQuickBarUsable(item))return false;
  this.slots=this.slots.map(id=>id===makeIndex?undefined:id);this.slots[slot]=makeIndex;this.saveLayout();this.render();return true;
 }
 clearSlot(slot:number){if(slot<0||slot>=ITEM_QUICKBAR_SLOTS)return;if(this.actions.inventory){this.actions.inventory.returnPocketToBag(slot);return;}this.slots[slot]=undefined;this.saveLayout();this.render();}
 debugState(){const shared=this.actions.inventory;if(shared)return {mode:'native-shared-pockets',slots:shared.pocketItems().map((item,slot)=>({slot,makeIndex:item?.makeIndex,item:item?.name,pending:item?shared.pocketPending(item.makeIndex):false})),pending:shared.debugState().pending};return {slots:this.slots.map((makeIndex,slot)=>({slot,makeIndex,item:makeIndex===undefined?undefined:this.items.get(makeIndex)?.name,pending:makeIndex===undefined?false:this.pending.has(makeIndex)})),pending:[...this.pending]};}
 private syncLayout(){
  const key=this.actions.layoutKey?.();if(this.layoutLoaded&&key===this.activeLayoutKey)return;
  this.activeLayoutKey=key;this.layoutLoaded=true;this.storedLayout=false;this.slots=Array(ITEM_QUICKBAR_SLOTS).fill(undefined);
  if(!key||typeof localStorage==='undefined')return;
  try{
   const saved=JSON.parse(localStorage.getItem(key)??'null');
   if(Array.isArray(saved)){saved.slice(0,ITEM_QUICKBAR_SLOTS).forEach((id,index)=>{if(Number.isInteger(id))this.slots[index]=id;});this.storedLayout=true;}
   else if(saved&&typeof saved==='object'){for(let index=0;index<ITEM_QUICKBAR_SLOTS;index++){const id=saved[String(index)];if(Number.isInteger(id))this.slots[index]=id;}this.storedLayout=true;}
  }catch{}
 }
 private autoBind(){
  if(this.storedLayout||this.slots.some(Boolean))return;
  for(const item of this.items.values()){
   if(!isItemQuickBarUsable(item))continue;
   const slot=this.slots.findIndex(id=>id===undefined);if(slot<0)break;this.slots[slot]=item.makeIndex;
  }
  this.saveLayout();
 }
 private pruneBindings(){this.slots=this.slots.map(id=>{const item=id===undefined?undefined:this.items.get(id);return item&&isItemQuickBarUsable(item)?id:undefined;});this.saveLayout();}
 private saveLayout(){
  const key=this.activeLayoutKey;if(!key||typeof localStorage==='undefined')return;
  try{localStorage.setItem(key,JSON.stringify(this.slots.map(id=>id??null)));}catch{}
 }
 private use(slot:number,item:InventoryItem){
  if(this.actions.inventory){if(!this.actions.inventory.useItem(item.makeIndex)){this.actions.status?.(`${item.name}正在其他操作中或请求未发送`);return false;}this.actions.status?.(`正在使用 ${item.name} · ${ITEM_QUICKBAR_KEYS[slot]}`);return true;}
   const id=item.makeIndex;if(this.pending.has(id))return false;if(this.actions.canUse?.(id)===false){this.actions.status?.(`${item.name}正在其他操作中`);return false;}this.pending.add(id);this.clearPendingTimer(id);this.pendingTimers.set(id,setTimeout(()=>{this.pendingTimers.delete(id);if(this.pending.delete(id))this.render();},8000));this.render();
   let result:boolean|void=undefined,failed=false;try{result=this.actions.use(id);}catch{failed=true;}
   if(failed||result===false){this.clearPendingTimer(id);this.pending.delete(id);this.render();this.actions.status?.(`${item.name}使用请求未发送，请重试`);return false;}
   this.actions.status?.(`正在使用 ${item.name} · ${ITEM_QUICKBAR_KEYS[slot]}`);return true;
 }
 private clearPending(){for(const timer of this.pendingTimers.values())clearTimeout(timer);this.pendingTimers.clear();this.pending.clear();}
 private clearPendingTimer(id:number){const timer=this.pendingTimers.get(id);if(timer!==undefined){clearTimeout(timer);this.pendingTimers.delete(id);}}
 private render(){
  if(this.actions.inventory){this.renderPockets(this.actions.inventory);return;}
  const render=++this.iconRender;
  this.element.replaceChildren();
  const visible=arrangeItemQuickSlots([...this.items.values()],this.slots);
  for(let slot=0;slot<ITEM_QUICKBAR_SLOTS;slot++){
   const spec=classicUiLayout().itemQuickBar;
   const item=visible[slot],button=document.createElement('button');button.type='button';button.className='item-quickbar-slot';button.dataset.itemQuickbarSlot=String(slot);button.setAttribute('aria-label',item?`${ITEM_QUICKBAR_KEYS[slot]}：${item.name}`:`${ITEM_QUICKBAR_KEYS[slot]}：空`);button.title=item?`${item.name} · ${ITEM_QUICKBAR_KEYS[slot]}键使用`:`${ITEM_QUICKBAR_KEYS[slot]}键：空`;
   button.style.width=`${spec.slotWidth}px`;button.style.height=`${spec.slotHeight}px`;button.style.flex=`0 0 ${spec.slotWidth}px`;
    const id=item?.makeIndex;button.disabled=id!==undefined&&(this.pending.has(id)||this.actions.canUse?.(id)===false);button.draggable=id!==undefined;
   const key=document.createElement('kbd');key.textContent=ITEM_QUICKBAR_KEYS[slot];button.append(key);
   if(item){
    button.dataset.itemId=String(item.makeIndex);
    button.append(itemIconElement(item,this.iconAssets,{maxWidth:32,maxHeight:30,isCurrent:()=>this.iconRender===render&&this.slots[slot]===item.makeIndex&&this.items.get(item.makeIndex)===item}));
    const quantity=item.quantity??item.count;if(quantity!==undefined&&quantity>1){const badge=document.createElement('b');badge.className='item-quickbar-count';badge.textContent=String(quantity);button.append(badge);}
    button.ondragstart=event=>{event.dataTransfer?.setData('text/plain',String(item.makeIndex));if(event.dataTransfer)event.dataTransfer.effectAllowed='copy';};
   }
    button.onclick=event=>{event.preventDefault();if(button.disabled)return;const held=this.actions.heldItem?.();if(held){if(this.bindSlot(slot,held.makeIndex))this.actions.clearHeld?.();else this.actions.status?.('快捷栏只支持药品和可使用道具');return;}if(item)this.use(slot,item);};
    button.ondragover=event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';button.classList.add('drop-target');};
    button.ondragleave=()=>button.classList.remove('drop-target');
    button.ondrop=event=>{event.preventDefault();button.classList.remove('drop-target');const raw=event.dataTransfer?.getData('text/plain');if(!/^[0-9]+$/.test(raw??''))return;const id=Number(raw);if(Number.isSafeInteger(id))this.bindSlot(slot,id);};
   button.oncontextmenu=event=>{event.preventDefault();this.clearSlot(slot);};
   this.element.append(button);
  }
 }
 private renderPockets(inventory:InventoryView){
  const render=++this.iconRender,visible=inventory.pocketItems(),retained=Array.from(this.element.children) as HTMLButtonElement[];
  for(let slot=0;slot<ITEM_QUICKBAR_SLOTS;slot++){
   const item=visible[slot],held=inventory.pocketHeld(slot),spec=classicUiLayout().itemQuickBar,button=retained[slot]??document.createElement('button');
   button.replaceChildren();button.type='button';button.className='item-quickbar-slot';button.dataset.itemQuickbarSlot=String(slot);delete button.dataset.itemId;delete button.dataset.heldItemId;
   button.style.width=`${spec.slotWidth}px`;button.style.height=`${spec.slotHeight}px`;button.style.flex=`0 0 ${spec.slotWidth}px`;
   button.disabled=!inventory.pocketKnown()||Boolean(item&&inventory.pocketPending(item.makeIndex));button.draggable=Boolean(item&&!button.disabled);
   button.setAttribute('aria-label',held?`拿取中：${held.name}`:item?`${ITEM_QUICKBAR_KEYS[slot]}：${item.name}`:`${ITEM_QUICKBAR_KEYS[slot]}：空`);button.title=item?`${item.name} · ${ITEM_QUICKBAR_KEYS[slot]}键使用`:held?`拿取中：${held.name}`:`${ITEM_QUICKBAR_KEYS[slot]}键：空`;
   const key=document.createElement('kbd');key.textContent=ITEM_QUICKBAR_KEYS[slot];button.append(key);
   if(held)button.dataset.heldItemId=String(held.makeIndex);
   if(item){button.dataset.itemId=String(item.makeIndex);button.append(itemIconElement(item,this.iconAssets,{maxWidth:32,maxHeight:30,isCurrent:()=>this.iconRender===render&&inventory.pocketItems()[slot]===item}));}
   const describe=()=>{const current=inventory.pocketItems()[slot];if(current)inventory.describeItem(current.makeIndex,button);else inventory.hideDescription();};
   button.onmouseenter=describe;button.onfocus=describe;button.onmouseleave=()=>inventory.hideDescription(button);button.onblur=()=>inventory.hideDescription(button);
   button.onclick=event=>{event.preventDefault();if(event.detail>1)return;if(!inventory.clickPocket(slot,event.clientX,event.clientY)&&inventory.heldItem())this.actions.status?.('口袋只支持药品、食物和卷轴');};
   button.ondblclick=event=>{event.preventDefault();const current=inventory.pocketItems()[slot]??inventory.pocketHeld(slot);if(current)this.use(slot,current);};
   button.oncontextmenu=event=>{event.preventDefault();if(inventory.cancelSelection())return;const current=inventory.pocketItems()[slot];if(current)this.use(slot,current);};
   button.ondragstart=event=>{if(!item||button.disabled){event.preventDefault();return;}event.dataTransfer?.setData('text/plain',String(item.makeIndex));if(event.dataTransfer)event.dataTransfer.effectAllowed='move';};
   button.ondragend=()=>inventory.cancelSelection();
   button.ondragover=event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';button.classList.add('drop-target');};
   button.ondragleave=()=>button.classList.remove('drop-target');
   button.ondrop=event=>{event.preventDefault();button.classList.remove('drop-target');const raw=event.dataTransfer?.getData('text/plain');if(!/^[0-9]+$/.test(raw??''))return;if(!inventory.moveToPocket(slot,Number(raw)))this.actions.status?.('口袋只支持药品、食物和卷轴');};
   if(!retained[slot])this.element.append(button);
  }
 }
}
