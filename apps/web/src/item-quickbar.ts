import {iconIndexOf,loadFallbackItemIcons,type InventoryItem} from './inventory';
import {loadNationalUiLibrary,nationalUiUrl,uiUrl} from './classic-ui';

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

type IconFrame={file:string;width:number;height:number;offsetX:number;offsetY:number};
type Icons={frames:Record<string,IconFrame>};
type QuickBarActions={use:(makeIndex:number)=>boolean|void;status?:(text:string)=>void;layoutKey?:()=>string|undefined};

/** Six-slot item bar mapped to 1–6/Numpad1–6 and backed by per-character local storage. */
export class ItemQuickBar{
 private items=new Map<number,InventoryItem>();
 private slots:Array<number|undefined>=Array(ITEM_QUICKBAR_SLOTS).fill(undefined);
 private pending=new Set<number>();
 private pendingTimers=new Map<number,ReturnType<typeof setTimeout>>();
 private fallbackIcons:Icons|undefined;
 private nationalIcons:Icons|undefined;
 private activeLayoutKey:string|undefined;
 private layoutLoaded=false;
 private storedLayout=false;
 constructor(private readonly element:HTMLElement,private readonly actions:QuickBarActions){
  this.element.classList.add('hud-item-quickbar');
  void loadFallbackItemIcons().then(icons=>{this.fallbackIcons=icons;this.render();}).catch(()=>{});
  void loadNationalUiLibrary('items').then(icons=>{this.nationalIcons=icons;this.render();}).catch(()=>{});
  this.element.ondragover=event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';};
  this.element.ondrop=event=>{event.preventDefault();const id=Number(event.dataTransfer?.getData('text/plain'));if(Number.isInteger(id))this.bindDropped(id,event.target);};
  this.render();
 }
 clear(){this.clearPending();this.items.clear();this.slots=Array(ITEM_QUICKBAR_SLOTS).fill(undefined);this.activeLayoutKey=undefined;this.layoutLoaded=false;this.storedLayout=false;this.render();}
 replace(items:InventoryItem[]){this.clearPending();this.syncLayout();this.items=new Map(items.map(item=>[item.makeIndex,item]));this.pruneBindings();this.autoBind();this.render();}
 add(item:InventoryItem){this.syncLayout();this.items.set(item.makeIndex,item);if(isItemQuickBarUsable(item)&&!this.slots.includes(item.makeIndex)){const empty=this.slots.findIndex(id=>id===undefined);if(empty>=0){this.slots[empty]=item.makeIndex;this.saveLayout();}}this.render();}
 update(item:InventoryItem){if(this.items.has(item.makeIndex)){this.items.set(item.makeIndex,item);this.render();}}
 remove(makeIndex:number){this.items.delete(makeIndex);this.slots=this.slots.map(id=>id===makeIndex?undefined:id);this.clearPendingTimer(makeIndex);this.pending.delete(makeIndex);this.saveLayout();this.render();}
 resolve(makeIndex:number,accepted:boolean,removeOnSuccess=true){if(!this.pending.has(makeIndex))return false;this.clearPendingTimer(makeIndex);this.pending.delete(makeIndex);if(accepted&&removeOnSuccess)this.remove(makeIndex);else this.render();return true;}
 rejectPending(){if(!this.pending.size)return;this.clearPending();this.render();}
 handleKey(event:KeyboardEvent){
  if(event.isComposing||event.repeat)return false;
  if(event.target instanceof HTMLElement&&event.target.matches('input,select,textarea'))return false;
  const slot=itemQuickBarSlotFromCode(event.code);if(slot===undefined)return false;
  const makeIndex=this.slots[slot],item=makeIndex===undefined?undefined:this.items.get(makeIndex);
  if(makeIndex===undefined||!item||this.pending.has(makeIndex))return true;
  event.preventDefault();this.use(slot,item);return true;
 }
 bindSlot(slot:number,makeIndex:number){
  const item=this.items.get(makeIndex);if(slot<0||slot>=ITEM_QUICKBAR_SLOTS||!item||!isItemQuickBarUsable(item))return false;
  this.slots=this.slots.map(id=>id===makeIndex?undefined:id);this.slots[slot]=makeIndex;this.saveLayout();this.render();return true;
 }
 clearSlot(slot:number){if(slot<0||slot>=ITEM_QUICKBAR_SLOTS)return;this.slots[slot]=undefined;this.saveLayout();this.render();}
 debugState(){return {slots:this.slots.map((makeIndex,slot)=>({slot,makeIndex,item:makeIndex===undefined?undefined:this.items.get(makeIndex)?.name,pending:makeIndex===undefined?false:this.pending.has(makeIndex)})),pending:[...this.pending]};}
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
 private bindDropped(makeIndex:number,target:EventTarget|null){
  const element=target instanceof HTMLElement?target.closest<HTMLElement>('[data-item-quickbar-slot]'):undefined;
  const slot=element?Number(element.dataset.itemQuickbarSlot):0;
  this.bindSlot(Number.isInteger(slot)?slot:0,makeIndex);
 }
 private use(slot:number,item:InventoryItem){
  const id=item.makeIndex;this.pending.add(id);this.clearPendingTimer(id);this.pendingTimers.set(id,setTimeout(()=>{this.pendingTimers.delete(id);if(this.pending.delete(id))this.render();},8000));this.render();
  const result=this.actions.use(id);if(result===false){this.clearPendingTimer(id);this.pending.delete(id);this.render();}
  this.actions.status?.(`正在使用 ${item.name} · ${ITEM_QUICKBAR_KEYS[slot]}`);
 }
 private clearPending(){for(const timer of this.pendingTimers.values())clearTimeout(timer);this.pendingTimers.clear();this.pending.clear();}
 private clearPendingTimer(id:number){const timer=this.pendingTimers.get(id);if(timer!==undefined){clearTimeout(timer);this.pendingTimers.delete(id);}}
 private render(){
  this.element.replaceChildren();
  const visible=arrangeItemQuickSlots([...this.items.values()],this.slots);
  for(let slot=0;slot<ITEM_QUICKBAR_SLOTS;slot++){
   const item=visible[slot],button=document.createElement('button');button.type='button';button.className='item-quickbar-slot';button.dataset.itemQuickbarSlot=String(slot);button.setAttribute('aria-label',item?`${ITEM_QUICKBAR_KEYS[slot]}：${item.name}`:`${ITEM_QUICKBAR_KEYS[slot]}：空`);button.title=item?`${item.name} · ${ITEM_QUICKBAR_KEYS[slot]}键使用`:`${ITEM_QUICKBAR_KEYS[slot]}键：空`;
   const id=item?.makeIndex;button.disabled=id!==undefined&&this.pending.has(id);button.draggable=id!==undefined;
   const key=document.createElement('kbd');key.textContent=ITEM_QUICKBAR_KEYS[slot];button.append(key);
   if(item){
    button.dataset.itemId=String(item.makeIndex);
    const index=iconIndexOf(item),national=this.nationalIcons?.frames[String(index)],fallback=this.fallbackIcons?.frames[String(index)],frame=national??fallback;
   if(frame){const image=document.createElement('img');image.src=national?nationalUiUrl('items',frame):uiUrl('Items',frame);image.alt=item.name;image.width=Math.min(32,frame.width);image.height=Math.min(30,frame.height);button.append(image);}
    else{const label=document.createElement('span');label.textContent=item.name.slice(0,1);label.className='item-quickbar-fallback';button.append(label);}
    const quantity=item.quantity??item.count;if(quantity!==undefined&&quantity>1){const badge=document.createElement('b');badge.className='item-quickbar-count';badge.textContent=String(quantity);button.append(badge);}
    button.onclick=event=>{event.preventDefault();if(!button.disabled)this.use(slot,item);};
    button.ondragstart=event=>{event.dataTransfer?.setData('text/plain',String(item.makeIndex));if(event.dataTransfer)event.dataTransfer.effectAllowed='copy';};
   }
   button.ondragover=event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';};
   button.ondrop=event=>{event.preventDefault();const id=Number(event.dataTransfer?.getData('text/plain'));if(Number.isInteger(id))this.bindSlot(slot,id);};
   button.oncontextmenu=event=>{event.preventDefault();this.clearSlot(slot);};
   this.element.append(button);
  }
 }
}
