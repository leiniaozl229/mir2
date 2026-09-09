import {loadNationalUiLibrary} from './classic-ui';
import itemAssets from '../../../content/classic-176/item-assets.json';

export type ItemRange={min:number;max:number};
export type InventoryItem={name:string;makeIndex:number;durability:number;maxDurability:number;stdMode:number;weight:number;looks:number;quantity?:number;count?:number;shape?:number;baseDurability?:number;ac?:ItemRange;mac?:ItemRange;dc?:ItemRange;mc?:ItemRange;sc?:ItemRange;need?:number;needLevel?:number;price?:number;attackSpeed?:number;agility?:number;accuracy?:number;magicAvoidance?:number;strong?:number;undead?:number;hpAdd?:number;mpAdd?:number;light?:number};
type IconFrame={file:string;width:number;height:number;offsetX:number;offsetY:number};
type Icons={frames:Record<string,IconFrame>};
type InventoryActions={drop:(makeIndex:number)=>void;equip:(makeIndex:number,slot:number)=>void;use:(makeIndex:number)=>void;trade?:(makeIndex:number)=>void;layoutKey?:()=>string|undefined};

export const BAG_COLUMNS=8;
export const BAG_VISIBLE=40;
export const BAG_CELL={width:36,height:32,originX:9,originY:37,gapX:1,gapY:1};
export const NATIONAL_BAG_CELL={width:36,height:32,originX:18,originY:14,gapX:0,gapY:0};
export const EQUIPMENT_PAGE={x:44,y:72};
export const EQUIPMENT_CELLS:{slot:number;name:string;x:number;y:number}[]=[
 {slot:3,name:'项链',x:131,y:36},
 {slot:2,name:'蜡烛',x:131,y:72},
 {slot:5,name:'左手镯',x:4,y:125},
 {slot:6,name:'右手镯',x:131,y:125},
 {slot:7,name:'左戒指',x:4,y:161},
 {slot:8,name:'右戒指',x:131,y:161}
];
export const EQUIPMENT_APPEARANCE:{slot:number;name:string;layer:string;z:number}[]=[
 {slot:0,name:'衣服',layer:'clothes',z:1},
 {slot:1,name:'武器',layer:'weapon',z:3},
 {slot:4,name:'头盔',layer:'helmet',z:4}
];
export function iconIndexOf(item:InventoryItem){return (itemAssets.iconIndexByName as Record<string,number>)[item.name]??(itemAssets.fallbackIconIndexBySourceIndex as Record<string,number>)[item.looks]??item.looks;}

let iconsPromise:Promise<Icons>|undefined;
export function loadFallbackItemIcons(){return iconsPromise??=fetch('/items/Items/library.json').then(async response=>{if(!response.ok)throw new Error('缺少物品素材');return response.json();});}

export function bagCellPosition(index:number){
 const x=index%BAG_COLUMNS,y=Math.floor(index/BAG_COLUMNS)%5;
 return {left:x*(BAG_CELL.width+BAG_CELL.gapX)+BAG_CELL.originX,top:y*(BAG_CELL.height+BAG_CELL.gapY)+BAG_CELL.originY};
}

export function itemDetailRows(item:InventoryItem){
 const rows:[string,string][]=[['类型',itemTypeName(item.stdMode)],['重量',String(item.weight)]];
 if(item.maxDurability>0)rows.push(['持久',`${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`]);
 if(item.needLevel)rows.push(['需要等级',String(item.needLevel)]);
 for(const [name,value] of [['防御',item.ac],['魔御',item.mac],['攻击',item.dc],['魔法',item.mc],['道术',item.sc]] as [string,ItemRange|undefined][]){if(value&&(value.min||value.max))rows.push([name,`${value.min}-${value.max}`]);}
 for(const [name,value] of [['攻击速度',item.attackSpeed],['敏捷',item.agility],['准确',item.accuracy],['魔法躲避',item.magicAvoidance],['强度',item.strong],['生命',item.hpAdd],['魔法值',item.mpAdd],['光照',item.light]] as [string,number|undefined][]){if(value)rows.push([name,String(value)]);}
 if(item.price)rows.push(['价格',String(item.price)]);
 return rows;
}

let nextServiceTooltipId=0;
/** Attach the same hover/focus attribute surface to service-window rows. */
export function attachItemTooltip(target:HTMLElement,item:InventoryItem,label=item.name){
 const document=target.ownerDocument;
 const tooltip=document.createElement('div');
 tooltip.className='inventory-item-tooltip service-item-tooltip';
 tooltip.setAttribute('role','tooltip');
 tooltip.id=`service-item-tooltip-${++nextServiceTooltipId}`;
 tooltip.hidden=true;
 const heading=document.createElement('strong');heading.textContent=item.name;tooltip.append(heading);
 const slot=document.createElement('span'),slotName=document.createElement('em'),slotValue=document.createElement('b');
 slotName.textContent='对象';slotValue.textContent=label;slot.append(slotName,slotValue);tooltip.append(slot);
 for(const [name,value] of itemDetailRows(item)){
  const row=document.createElement('span'),key=document.createElement('em'),amount=document.createElement('b');
  key.textContent=name;amount.textContent=value;row.append(key,amount);tooltip.append(row);
 }
 target.append(tooltip);
 target.setAttribute('aria-describedby',tooltip.id);
 const show=()=>{tooltip.hidden=false;};
 const hide=()=>{tooltip.hidden=true;};
 target.addEventListener('pointerenter',show);target.addEventListener('pointerleave',hide);
 target.addEventListener('focusin',show);target.addEventListener('focusout',hide);
 return ()=>{target.removeEventListener('pointerenter',show);target.removeEventListener('pointerleave',hide);target.removeEventListener('focusin',show);target.removeEventListener('focusout',hide);tooltip.remove();};
}

export class InventoryView {
 private items=new Map<number,InventoryItem>();private placements=new Map<number,number>();private pending=new Set<number>();private pendingTimers=new Map<number,ReturnType<typeof setTimeout>>();private known=false;private icons:Icons|undefined;private nationalIcons:Icons|undefined;private selectedSlot:number|undefined;private activeLayoutKey:string|undefined;private gold=0;private readonly tooltip:HTMLElement|undefined;private readonly heldPreview:HTMLElement|undefined;
 constructor(private element:HTMLElement,private actions:InventoryActions){
  this.element.classList.add('classic-bag');
  this.tooltip=this.element.parentElement?.querySelector<HTMLElement>('[data-inventory-tooltip],#inventory-item-tooltip')??undefined;
  const body=this.element.ownerDocument?.body;
  if(body){this.heldPreview=this.element.ownerDocument.createElement('div');this.heldPreview.className='inventory-held-item';this.heldPreview.hidden=true;body.append(this.heldPreview);}
  this.element.onpointermove=event=>{this.moveHeldPreview(event.clientX,event.clientY);};
  this.element.ownerDocument?.addEventListener?.('pointermove',event=>{this.moveHeldPreview(event.clientX,event.clientY);});
  this.element.ownerDocument?.addEventListener?.('pointercancel',()=>this.clearSelection());
  this.element.ownerDocument?.defaultView?.addEventListener?.('blur',()=>this.clearSelection());
  this.element.ownerDocument?.addEventListener?.('visibilitychange',()=>{if(this.element.ownerDocument?.hidden)this.clearSelection();});
  void loadFallbackItemIcons().then(icons=>{this.icons=icons;this.render();}).catch(()=>{});
  void loadNationalUiLibrary('items').then(icons=>{this.nationalIcons=icons;this.render();}).catch(()=>{});
 }
 clear(){this.known=false;this.items.clear();this.placements.clear();this.activeLayoutKey=undefined;this.clearPendingTimers();this.pending.clear();this.clearSelection();this.render();}
 replace(items:InventoryItem[]){this.loadPlacements();this.known=true;this.items=new Map(items.map(item=>[item.makeIndex,item]));this.clearPendingTimers();this.pending.clear();this.assignPlacements();this.render();}
 add(item:InventoryItem){this.items.set(item.makeIndex,item);this.assignPlacements();this.render();}
  update(item:InventoryItem){if(this.items.has(item.makeIndex)){this.items.set(item.makeIndex,item);this.render();}}
 remove(id:number){this.clearPendingTimer(id);this.pending.delete(id);this.items.delete(id);this.placements.delete(id);this.render();}
 resolve(id:number,accepted:boolean,removeOnSuccess:boolean){if(!this.pending.has(id))return false;this.clearPendingTimer(id);this.pending.delete(id);if(accepted&&removeOnSuccess){this.items.delete(id);this.placements.delete(id);}this.render();return true;}
  rejectPending(){if(!this.pending.size)return;this.clearPendingTimers();this.pending.clear();this.render();}
 currency(gold:number){this.gold=gold;const output=this.element.parentElement?.querySelector<HTMLElement>('[data-inventory-gold]');if(output)output.textContent=gold.toLocaleString('zh-CN');}
 cancelSelection(){this.clearSelection();}
 requestDrop(makeIndex:number){const item=this.items.get(makeIndex);if(item)this.begin(item,()=>this.actions.drop(makeIndex));}
 debugState(){return {known:this.known,items:[...this.items.values()].map(item=>({...item,slot:this.placements.get(item.makeIndex)})),pending:[...this.pending],selectedSlot:this.selectedSlot,gold:this.gold};}
  private begin(item:InventoryItem,action:()=>void){const id=item.makeIndex;this.pending.add(id);this.clearPendingTimer(id);if(typeof setTimeout==='function')this.pendingTimers.set(id,setTimeout(()=>{this.pendingTimers.delete(id);if(this.pending.delete(id))this.render();},8000));this.render();action();}
 private clearPendingTimer(id:number){const timer=this.pendingTimers.get(id);if(timer!==undefined){clearTimeout(timer);this.pendingTimers.delete(id);}}
 private clearPendingTimers(){for(const timer of this.pendingTimers.values())clearTimeout(timer);this.pendingTimers.clear();}
 private loadPlacements(){
  const key=this.actions.layoutKey?.();if(key===this.activeLayoutKey)return;this.activeLayoutKey=key;this.placements.clear();
  if(!key||typeof localStorage==='undefined')return;
  try{const saved=JSON.parse(localStorage.getItem(key)??'{}') as Record<string,number>;for(const [id,slot] of Object.entries(saved))if(Number.isInteger(slot)&&slot>=0&&slot<BAG_VISIBLE)this.placements.set(Number(id),slot);}catch{}
 }
 private savePlacements(){
  const key=this.activeLayoutKey;if(!key||typeof localStorage==='undefined')return;
  try{localStorage.setItem(key,JSON.stringify(Object.fromEntries(this.placements)));}catch{}
 }
 private assignPlacements(){
  for(const id of [...this.placements.keys()])if(!this.items.has(id))this.placements.delete(id);
  const used=new Set([...this.placements.values()].filter(slot=>slot>=0&&slot<BAG_VISIBLE));
  for(const item of this.items.values())if(!this.placements.has(item.makeIndex)){const slot=Array.from({length:BAG_VISIBLE},(_,index)=>index).find(index=>!used.has(index));if(slot===undefined)break;this.placements.set(item.makeIndex,slot);used.add(slot);}
  this.savePlacements();
 }
 private clearSelection(render=false){
  this.selectedSlot=undefined;if(this.heldPreview){this.heldPreview.hidden=true;this.heldPreview.replaceChildren();}
  this.element.querySelectorAll?.('.item-cell.selected').forEach(cell=>{cell.classList.remove('selected');cell.setAttribute('aria-pressed','false');});
  if(render)this.render();
 }
 private moveHeldPreview(clientX:number,clientY:number){if(this.selectedSlot!==undefined&&this.heldPreview){this.heldPreview.style.left=`${clientX+10}px`;this.heldPreview.style.top=`${clientY+10}px`;}}
 private select(index:number,item:InventoryItem,cell:HTMLButtonElement,event:MouseEvent){
  if(this.selectedSlot===index){this.clearSelection();return;}
  if(this.selectedSlot!==undefined){
   const from=this.selectedSlot,fromEntry=[...this.placements].find(([,slot])=>slot===from),toEntry=[...this.placements].find(([,slot])=>slot===index);
   if(fromEntry){this.placements.set(fromEntry[0],index);if(toEntry)this.placements.set(toEntry[0],from);this.savePlacements();}
   this.clearSelection();this.render();return;
  }
  this.selectedSlot=index;cell.classList.add('selected');cell.setAttribute('aria-pressed','true');
  if(this.heldPreview){const iconIndex=iconIndexOf(item),nationalIcon=usableIcon(this.nationalIcons?.frames[iconIndex]),icon=nationalIcon??usableIcon(this.icons?.frames[iconIndex]);this.heldPreview.replaceChildren(imageOrEmpty(icon,item,nationalIcon?`/ui-national/items/${nationalIcon.file}`:undefined));this.heldPreview.hidden=false;this.heldPreview.style.left=`${event.clientX+10}px`;this.heldPreview.style.top=`${event.clientY+10}px`;}
 }
 private activate(item:InventoryItem){const slot=defaultSlot(item.stdMode);this.clearSelection();if(slot>=0)this.begin(item,()=>this.actions.equip(item.makeIndex,slot));else if(item.stdMode<=4||item.stdMode===31)this.begin(item,()=>this.actions.use(item.makeIndex));}
 private showTooltip(item:InventoryItem,cell:HTMLButtonElement){
  if(!this.tooltip)return;this.tooltip.replaceChildren();const document=this.element.ownerDocument;const heading=document.createElement('strong');heading.textContent=item.name;this.tooltip.append(heading);
  for(const [label,value] of itemDetailRows(item)){const row=document.createElement('span'),name=document.createElement('em'),amount=document.createElement('b');name.textContent=label;amount.textContent=value;row.append(name,amount);this.tooltip.append(row);}
  this.tooltip.style.left=`${cell.offsetLeft+(cell.offsetLeft>160?-184:38)}px`;this.tooltip.style.top=`${Math.max(6,Math.min(150,cell.offsetTop))}px`;this.tooltip.hidden=false;
 }
 private hideTooltip(){if(this.tooltip)this.tooltip.hidden=true;}
  private render(){
  this.element.replaceChildren();this.element.classList.add('classic-bag');this.hideTooltip();
  const bag=new Map<number,InventoryItem>();for(const item of this.items.values()){const slot=this.placements.get(item.makeIndex);if(slot!==undefined)bag.set(slot,item);}
  for(let index=0;index<BAG_VISIBLE;index++){
   const item=bag.get(index),cell=document.createElement('button'),column=index%BAG_COLUMNS,row=Math.floor(index/BAG_COLUMNS)%5;
   const position=bagCellPosition(index);cell.type='button';cell.className='item-cell';cell.style.left=`calc(var(--bag-origin-x, ${position.left-column*(BAG_CELL.width+BAG_CELL.gapX)}px) + ${column} * var(--bag-step-x, ${BAG_CELL.width+BAG_CELL.gapX}px))`;cell.style.top=`calc(var(--bag-origin-y, ${position.top-row*(BAG_CELL.height+BAG_CELL.gapY)}px) + ${row} * var(--bag-step-y, ${BAG_CELL.height+BAG_CELL.gapY}px))`;
   cell.dataset.slot=String(index);cell.setAttribute('aria-pressed',String(this.selectedSlot===index));if(this.selectedSlot===index)cell.classList.add('selected');
   if(!this.known){cell.disabled=true;cell.title='等待服务端背包数据…';}
   else if(item){
    const pending=this.pending.has(item.makeIndex);
    cell.dataset.itemId=String(item.makeIndex);cell.disabled=pending;cell.setAttribute('aria-label',item.name);cell.setAttribute('aria-describedby','inventory-item-tooltip');
    const iconIndex=iconIndexOf(item),nationalIcon=usableIcon(this.nationalIcons?.frames[iconIndex]),icon=nationalIcon??usableIcon(this.icons?.frames[iconIndex]);
    cell.append(imageOrEmpty(icon,item,nationalIcon?`/ui-national/items/${nationalIcon.file}`:undefined));
    const quantity=item.quantity??item.count;if(quantity!==undefined&&quantity>1){const badge=document.createElement('b');badge.className='item-count';badge.textContent=String(quantity);cell.append(badge);}
    cell.onclick=event=>{
     event.preventDefault();
     if(event.shiftKey&&this.actions.trade)this.begin(item,()=>this.actions.trade!(item.makeIndex));
     else this.select(index,item,cell,event);
    };
    cell.ondblclick=event=>{event.preventDefault();event.stopPropagation();this.activate(item);};
    cell.onmouseenter=()=>this.showTooltip(item,cell);cell.onmouseleave=()=>this.hideTooltip();cell.onfocus=()=>this.showTooltip(item,cell);cell.onblur=()=>this.hideTooltip();
    cell.draggable=true;
    cell.ondragstart=event=>{
     event.dataTransfer?.setData('text/plain',String(item.makeIndex));
     if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
    };
    cell.ondragend=()=>{this.clearSelection();};
    cell.oncontextmenu=event=>{
     event.preventDefault();this.activate(item);
    };
   }else{cell.title=this.known?'空':'等待服务端背包数据…';cell.setAttribute('aria-label',`空格 ${index+1}`);cell.onclick=event=>{event.preventDefault();if(this.selectedSlot!==undefined){const selected=[...this.items.values()].find(value=>this.placements.get(value.makeIndex)===this.selectedSlot);if(selected)this.select(index,selected,cell,event);}};}
   cell.ondragover=event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';};cell.ondrop=event=>{event.preventDefault();const id=Number(event.dataTransfer?.getData('text/plain')),from=this.placements.get(id);if(from===undefined||from===index)return;this.selectedSlot=from;const selected=this.items.get(id);if(selected)this.select(index,selected,cell,event as unknown as MouseEvent);};
   this.element.append(cell);
  }
 }
}

export class EquipmentView {
 private slots=new Map<number,InventoryItem>();private pending=new Set<number>();private icons:Icons|undefined;private stateIcons:Icons|undefined;private readonly tooltip:HTMLElement|undefined;
 constructor(private element:HTMLElement,private takeOff:(slot:number)=>void){
  this.tooltip=this.element.parentElement?.querySelector<HTMLElement>('[data-equipment-tooltip],#equipment-item-tooltip')??undefined;
  this.element.classList.add('paperdoll');
  void loadFallbackItemIcons().then(icons=>{this.icons=icons;this.render();}).catch(()=>{});this.render();
  void loadNationalUiLibrary('stateitem').then(icons=>{this.stateIcons=icons;this.render();}).catch(()=>{});
 }
 clear(){this.hideTooltip();this.slots.clear();this.pending.clear();this.render();}
 replace(values:{slot:number;item:InventoryItem}[]){this.slots=new Map(values.map(value=>[value.slot,value.item]));this.pending.clear();this.render();}
 set(slot:number,item:InventoryItem){this.pending.delete(slot);this.slots.set(slot,item);this.render();}
 remove(slot:number){this.pending.delete(slot);this.slots.delete(slot);this.render();}
 update(item:InventoryItem){for(const [slot,current] of this.slots)if(current.makeIndex===item.makeIndex){this.slots.set(slot,item);this.render();break;}}
 resolve(slot:number,accepted:boolean){if(!this.pending.has(slot))return false;this.pending.delete(slot);if(accepted)this.slots.delete(slot);this.render();return true;}
 rejectPending(){if(!this.pending.size)return;this.pending.clear();this.render();}
 debugState(){return {slots:[...this.slots].map(([slot,item])=>({slot,item:{...item}})),pending:[...this.pending],rendered:Array.from(this.element.querySelectorAll<HTMLElement>('[data-slot]')).map(node=>({slot:Number(node.dataset.slot),kind:node.classList.contains('equipment-appearance')?'appearance':'cell',left:node.style.left,top:node.style.top}))};}
 preferredSlot(slot:number){
  if(slot===5&&this.slots.has(5)&&!this.slots.has(6))return 6;
  if(slot===7&&this.slots.has(7)&&!this.slots.has(8))return 8;
  return slot;
 }
 private render(){
  this.hideTooltip();this.element.replaceChildren();this.element.classList.add('paperdoll');
  for(const appearance of EQUIPMENT_APPEARANCE){
   const item=this.slots.get(appearance.slot),frame=item&&this.stateIcons?.frames[String(iconIndexOf(item))];
   if(!item||!frame)continue;
   const button=document.createElement('button');button.type='button';button.className=`equipment-appearance equipment-appearance--${appearance.layer}`;
   button.style.left=`${EQUIPMENT_PAGE.x+frame.offsetX}px`;button.style.top=`${EQUIPMENT_PAGE.y+frame.offsetY}px`;
   button.style.width=`${frame.width}px`;button.style.height=`${frame.height}px`;button.style.zIndex=String(appearance.z);
   button.dataset.slot=String(appearance.slot);button.dataset.durability=String(item.durability);button.dataset.maxDurability=String(item.maxDurability);button.setAttribute('aria-describedby','equipment-item-tooltip');
   button.title=`${appearance.name}：${item.name}\n持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;
   button.disabled=this.pending.has(appearance.slot);
   const image=imageOrEmpty(frame,item,`/ui-national/stateitem/${frame.file}`);image.classList.add('equipment-state-art');button.append(image);
   button.onclick=()=>{this.pending.add(appearance.slot);this.render();this.takeOff(appearance.slot);};button.onmouseenter=()=>this.showTooltip(item,button,appearance.name);button.onmouseleave=()=>this.hideTooltip();button.onfocus=()=>this.showTooltip(item,button,appearance.name);button.onblur=()=>this.hideTooltip();
   this.element.append(button);
  }
  for(const cell of EQUIPMENT_CELLS){
   const button=document.createElement('button');button.type='button';button.className='item-cell equipment-cell';
   button.style.left=`${EQUIPMENT_PAGE.x+cell.x}px`;button.style.top=`${EQUIPMENT_PAGE.y+cell.y}px`;
   button.dataset.slot=String(cell.slot);button.setAttribute('aria-label',cell.name);
   const item=this.slots.get(cell.slot);
   if(item){
    button.dataset.durability=String(item.durability);button.dataset.maxDurability=String(item.maxDurability);button.setAttribute('aria-describedby','equipment-item-tooltip');
    button.title=`${cell.name}：${item.name}\n持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;
    button.disabled=this.pending.has(cell.slot);
    const iconIndex=iconIndexOf(item),stateIcon=usableIcon(this.stateIcons?.frames[String(iconIndex)]),icon=stateIcon??usableIcon(this.icons?.frames[String(iconIndex)]);
    button.append(imageOrEmpty(icon,item,stateIcon?`/ui-national/stateitem/${stateIcon.file}`:undefined));
    button.onclick=()=>{this.pending.add(cell.slot);this.render();this.takeOff(cell.slot);};button.onmouseenter=()=>this.showTooltip(item,button,cell.name);button.onmouseleave=()=>this.hideTooltip();button.onfocus=()=>this.showTooltip(item,button,cell.name);button.onblur=()=>this.hideTooltip();
   }else{button.title=`${cell.name}：空`;button.disabled=true;}
   this.element.append(button);
  }
 }
 private showTooltip(item:InventoryItem,cell:HTMLButtonElement,label:string){
  if(!this.tooltip)return;this.tooltip.replaceChildren();const heading=document.createElement('strong');heading.textContent=item.name;this.tooltip.append(heading);
  const slot=document.createElement('span'),slotName=document.createElement('em'),slotValue=document.createElement('b');slotName.textContent='部位';slotValue.textContent=label;slot.append(slotName,slotValue);this.tooltip.append(slot);
  for(const [name,value] of itemDetailRows(item)){const row=document.createElement('span'),key=document.createElement('em'),amount=document.createElement('b');key.textContent=name;amount.textContent=value;row.append(key,amount);this.tooltip.append(row);}
  const left=cell.offsetLeft+(cell.offsetLeft>150?-180:38),top=Math.max(6,Math.min(250,cell.offsetTop));this.tooltip.style.left=`${left}px`;this.tooltip.style.top=`${top}px`;this.tooltip.hidden=false;
 }
 private hideTooltip(){if(this.tooltip)this.tooltip.hidden=true;}
}

function defaultSlot(mode:number){
 if(mode===10||mode===11)return 0;if(mode===5||mode===6)return 1;if([28,29,30].includes(mode))return 2;if([19,20,21].includes(mode))return 3;if(mode===15)return 4;
 if([24,26].includes(mode))return 5;if(mode===25||mode===51)return 9;if(mode===22||mode===23)return 7;if(mode===54||mode===64)return 10;if(mode===52||mode===62)return 11;if(mode===53||mode===63)return 12;return -1;
}
function imageOrEmpty(icon:IconFrame|undefined,item:InventoryItem,url?:string){
 if(icon){const image=document.createElement('img');image.src=url??`/items/Items/${icon.file}`;image.alt=item.name;image.width=icon.width;image.height=icon.height;return image;}
 const empty=document.createElement('span');empty.className='missing-item-icon';empty.setAttribute('aria-label',`${item.name} 图标待校准`);return empty;
}
function usableIcon(icon:IconFrame|undefined){return icon&&icon.width>4&&icon.height>1?icon:undefined;}
function itemTypeName(mode:number){if(mode<=4||mode===31)return '可使用物品';if(mode===5||mode===6)return '武器';if(mode===10||mode===11)return '衣服';if(mode===15)return '头盔';if([19,20,21].includes(mode))return '项链';if([22,23].includes(mode))return '戒指';if([24,26].includes(mode))return '手镯';if([28,29,30].includes(mode))return '蜡烛/护身符';if(mode===40)return '肉类';return `物品 ${mode}`;}
