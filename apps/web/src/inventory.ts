import {ItemIconAssets,itemIconElement,itemIconIndex,loadActiveItemLibrary} from './item-icons';
import {bagCellPositionFromLayout,bagGridFromLayout,classicUiLayout,nationalBagIconPosition,nationalUsesLayout} from './classic-layout';
import {orePurity} from './mining-controller';
import {loadNativeUiFont} from './native-ui-font';

export type ItemRange={min:number;max:number};
export type ItemBonuses={ac:number;mac:number;dc:number;mc:number;sc:number};
export type InventoryItem={name:string;makeIndex:number;durability:number;maxDurability:number;stdMode:number;weight:number;looks:number;quantity?:number;count?:number;shape?:number;baseDurability?:number;ac?:ItemRange;mac?:ItemRange;dc?:ItemRange;mc?:ItemRange;sc?:ItemRange;bonus?:ItemBonuses;need?:number;needLevel?:number;price?:number;attackSpeed?:number;agility?:number;accuracy?:number;magicAvoidance?:number;strong?:number;undead?:number;hpAdd?:number;mpAdd?:number;light?:number};
type ItemDescriptionAttributes={level:number;job:number;dc:ItemRange;mc:ItemRange;sc:ItemRange};
type InventoryActions={drop:(makeIndex:number)=>boolean|void;equip:(makeIndex:number,slot:number)=>boolean|void;use:(makeIndex:number)=>boolean|void;trade?:(makeIndex:number)=>boolean|void;selectService?:(item:InventoryItem)=>boolean|undefined;availabilityChanged?:()=>void;layoutKey?:()=>string|undefined;readAttributes?:()=>ItemDescriptionAttributes|undefined};

export const BAG_COLUMNS=bagGridFromLayout(false).columns;
export const BAG_VISIBLE=bagGridFromLayout(false).visible;
export const POCKET_COUNT=classicUiLayout().itemQuickBar.count;
export function acceptsPocketItem(item:Pick<InventoryItem,'stdMode'>){return item.stdMode>=0&&item.stdMode<=classicUiLayout().itemQuickBar.admissionMaxStdMode;}
export const BAG_CELL=bagGridFromLayout(false);
export const NATIONAL_BAG_CELL=bagGridFromLayout(true);
export const EQUIPMENT_PAGE={x:classicUiLayout().nationalCharacterPage.x,y:classicUiLayout().nationalCharacterPage.y};
export const EQUIPMENT_APPEARANCE_ORIGIN=classicUiLayout().nationalEquipmentAppearanceOrigin;
export const EQUIPMENT_CELLS:{slot:number;name:string;x:number;y:number}[]=classicUiLayout().nationalEquipmentCells.map(cell=>({slot:cell.slot,name:cell.name,x:cell.x,y:cell.y}));
export const EQUIPMENT_APPEARANCE:{slot:number;name:string;layer:string;z:number}[]=classicUiLayout().nationalEquipmentAppearance.map(cell=>({slot:cell.slot,name:cell.name,layer:cell.layer,z:cell.z}));
export function iconIndexOf(item:InventoryItem){return itemIconIndex(item);}

export function loadFallbackItemIcons(){return loadActiveItemLibrary('items');}

export function bagCellPosition(index:number,national=false){
 return bagCellPositionFromLayout(index,national);
}

export function itemDetailRows(item:InventoryItem){
 const rows:[string,string,number?][]=[['类型',itemTypeName(item.stdMode)],['重量',String(item.weight)]];
 if(item.stdMode===43)rows.push(['纯度',String(orePurity(item))]);
 else if(item.maxDurability>0)rows.push(['持久',`${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`]);
 if(item.needLevel)rows.push(['需要等级',String(item.needLevel)]);
 for(const [name,value,bonus] of [['防御',item.ac,item.bonus?.ac],['魔御',item.mac,item.bonus?.mac],['攻击',item.dc,item.bonus?.dc],['魔法',item.mc,item.bonus?.mc],['道术',item.sc,item.bonus?.sc]] as [string,ItemRange|undefined,number|undefined][]){if(value&&(value.min||value.max))rows.push([name,`${value.min}-${value.max}`,bonus]);}
 for(const [name,value] of [['攻击速度',item.attackSpeed],['敏捷',item.agility],['准确',item.accuracy],['魔法躲避',item.magicAvoidance],['强度',item.strong],['生命',item.hpAdd],['魔法值',item.mpAdd],['光照',item.light]] as [string,number|undefined][]){if(value)rows.push([name,String(value)]);}
 if(item.price)rows.push(['价格',String(item.price)]);
 return rows;
}

function nativeRound(value:number,unit=1000){const integer=Math.floor(value/unit),remainder=value%unit;return remainder<unit/2?integer:remainder>unit/2?integer+1:integer+(integer%2);}

/** Installed 2003 client: fixed bag lines. Ranges already include server bonuses. */
export function nativeItemDescription(item:InventoryItem,attributes?:ItemDescriptionAttributes){
 const mode=item.stdMode,packed=(range?:ItemRange)=>(range?.min??0)+256*(range?.max??0);
 const stats:string[]=[],extra:string[]=[];
 let first=`重量${item.weight}`,requirement='',requirementMet:boolean|undefined;
 const durable=[5,6,10,11,15,16,19,20,21,22,23,24,26,30].includes(mode);
 if(durable)first+=` 持久力${nativeRound(item.durability)}/${nativeRound(item.maxDurability)}`;
 if(mode===0){const hp=packed(item.ac),mp=packed(item.mac);first=[hp?`+${hp}HP`:'',mp?`+${mp}MP`:'',first].filter(Boolean).join(' ');}
 else if(mode===25)first+=` 数量${nativeRound(item.durability,100)}`;
 else if(mode===40)first+=` 品质${nativeRound(item.durability)}`;
 else if(mode===43)first+=` 纯度${nativeRound(item.durability)}`;
 const addRange=(name:string,value?:ItemRange)=>{if(value&&(value.min||value.max))stats.push(`${name}${value.min}-${value.max}`);};
 if(durable&&mode!==30){
  if([10,11,15,16,22,26].includes(mode)){addRange('防御',item.ac);addRange('魔御',item.mac);}
  if([5,6].includes(mode)){
   if(item.ac?.max)extra.push(`准确+${item.ac.max}`);
   if(item.mac?.max)extra.push(`攻击速度${item.mac.max>10?`+${item.mac.max-10}`:`-${item.mac.max}`}`);
   if(item.ac?.min)extra.push(`诅咒+${item.ac.min}`);
   if(item.mac?.min)extra.push(`幸运+${item.mac.min}`);
  }else if(mode===19){
   if(item.ac?.max)stats.push(`魔法躲避+${item.ac.max*10}%`);
   if(item.mac?.min)stats.push(`诅咒+${item.mac.min}`);
   if(item.mac?.max)stats.push(`幸运+${item.mac.max}`);
  }else if(mode===20||mode===24){
   if(item.ac?.max)stats.push(`准确+${item.ac.max}`);
   if(item.mac?.max)stats.push(`敏捷+${item.mac.max}`);
  }else if(mode===21||mode===23){
   if(item.ac?.max)stats.push(`${mode===21?'体力恢复':'毒物躲避'}+${item.ac.max*10}%`);
   if(item.mac?.max)stats.push(`${mode===21?'魔法恢复':'中毒恢复'}+${item.mac.max*10}%`);
   if(item.ac?.min)stats.push(`攻击速度+${item.ac.min}`);
   if(item.mac?.min)stats.push(`攻击速度-${item.mac.min}`);
  }
  addRange('攻击',item.dc);addRange('魔法',item.mc);addRange('道术',item.sc);
  const need=item.need??0,value=item.needLevel;
  if(value!==undefined&&need>=0&&need<=3){
   const label=['需要等级','需要攻击力','需要魔法力','需要精神力'][need];requirement=`${label}${value}`;
   if(attributes)requirementMet=(need===0?attributes.level:[attributes.dc,attributes.mc,attributes.sc][need-1].max)>=value;
  }
 }else if(mode===4){
  if(item.shape!==undefined&&item.shape>=0&&item.shape<=2)stats.push(`${['战士','法师','道士'][item.shape]}专用`);
  const level=nativeRound(item.maxDurability);requirement=`需要等级${level}`;
  if(attributes)requirementMet=attributes.level>=level&&(item.shape===undefined||item.shape===attributes.job);
 }
 return {name:item.name,first,second:stats.join(' '),third:[...extra,requirement].filter(Boolean).join(' '),requirementMet};
}

function appendItemDetailRows(tooltip:HTMLElement,item:InventoryItem){
 const document=tooltip.ownerDocument;
 for(const [name,value,bonus] of itemDetailRows(item)){
  const row=document.createElement('span'),key=document.createElement('em'),amount=document.createElement('b');
  key.textContent=name;amount.textContent=value;
  if(bonus){const extra=document.createElement('i');extra.className='item-bonus';extra.textContent=` +${bonus}`;amount.append(extra);}
  row.append(key,amount);tooltip.append(row);
 }
}

let activeItemTooltipTarget:HTMLElement|undefined;
let activeItemTooltip:HTMLElement|undefined;
const tooltipLifecycleDocuments=new WeakSet<Document>();

function itemTooltipFor(element:HTMLElement){
 const document=element.ownerDocument;
 return document.getElementById?.('item-tooltip')??element.parentElement?.querySelector<HTMLElement>('[data-inventory-tooltip],#inventory-item-tooltip,#equipment-item-tooltip')??undefined;
}

function itemTooltipStage(document:Document){
 return document.getElementById?.('viewport-shell')??document.getElementById?.('calibration-stage-frame')??undefined;
}

function positionItemTooltip(target:HTMLElement,tooltip:HTMLElement){
 const document=target.ownerDocument,stage=itemTooltipStage(document);
 const targetRect=target.getBoundingClientRect?.(),stageRect=stage?.getBoundingClientRect?.();
 if(!targetRect||!stageRect||stageRect.width<=0||stageRect.height<=0){
  const left=(target as HTMLElement).offsetLeft??0,top=(target as HTMLElement).offsetTop??0;
  tooltip.style.left=`${left>150?Math.max(6,left-188):left+38}px`;
  tooltip.style.top=`${Math.max(6,Math.min(540,top))}px`;
  return;
 }
 const scaleX=stageRect.width/800,scaleY=stageRect.height/600;
 const tipRect=tooltip.getBoundingClientRect?.();
 const width=Math.max(1,(tipRect?.width??0)/scaleX||tooltip.offsetWidth||180);
 const height=Math.max(1,(tipRect?.height??0)/scaleY||tooltip.offsetHeight||120);
 const left=(targetRect.left-stageRect.left)/scaleX,right=(targetRect.right-stageRect.left)/scaleX;
 const top=(targetRect.top-stageRect.top)/scaleY,bottom=(targetRect.bottom-stageRect.top)/scaleY;
 let x=right+6;
 if(x+width>794)x=left-width-6;
 x=Math.min(Math.max(6,x),Math.max(6,794-width));
 let y=top;
 if(y+height>594)y=bottom-height;
 y=Math.min(Math.max(6,y),Math.max(6,594-height));
 tooltip.style.left=`${x}px`;tooltip.style.top=`${y}px`;
}

function tooltipTargetVisible(target:HTMLElement,stage:HTMLElement){
 return target.isConnected!==false&&stage.contains(target)&&!target.closest?.('[hidden]');
}

function refreshActiveItemTooltip(){
 if(!activeItemTooltip||!activeItemTooltipTarget)return;
 const stage=itemTooltipStage(activeItemTooltipTarget.ownerDocument);
 if(!stage||!tooltipTargetVisible(activeItemTooltipTarget,stage)){hideItemTooltip();return;}
 positionItemTooltip(activeItemTooltipTarget,activeItemTooltip);
}

function observeItemTooltipLifecycle(target:HTMLElement){
 const document=target.ownerDocument;
 if(tooltipLifecycleDocuments.has(document))return;
 tooltipLifecycleDocuments.add(document);
 document.addEventListener('scroll',()=>hideItemTooltip(),true);
 document.defaultView?.addEventListener('resize',refreshActiveItemTooltip);
  const stage=itemTooltipStage(document);
 if(stage&&typeof MutationObserver==='function'){
  const observer=new MutationObserver(refreshActiveItemTooltip);
  observer.observe(stage,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 }
}

function showItemTooltip(target:HTMLElement,tooltip:HTMLElement,item:InventoryItem,label?:string,labelType?:string){
 if(activeItemTooltip&&activeItemTooltip!==tooltip)activeItemTooltip.hidden=true;
 tooltip.replaceChildren();
 const document=tooltip.ownerDocument,heading=document.createElement('strong');heading.textContent=item.name;tooltip.append(heading);
 if(label!==undefined){const slot=document.createElement('span'),slotName=document.createElement('em'),slotValue=document.createElement('b');slotName.textContent=labelType??'对象';slotValue.textContent=label;slot.append(slotName,slotValue);tooltip.append(slot);}
 appendItemDetailRows(tooltip,item);
 activeItemTooltipTarget=target;activeItemTooltip=tooltip;tooltip.hidden=false;
 positionItemTooltip(target,tooltip);observeItemTooltipLifecycle(target);
}

export function hideItemTooltip(within?:HTMLElement){
 if(within&&activeItemTooltipTarget&&within!==activeItemTooltipTarget&&!within.contains(activeItemTooltipTarget))return;
 if(activeItemTooltip)activeItemTooltip.hidden=true;
 activeItemTooltip=undefined;activeItemTooltipTarget=undefined;
}

/** Attach the same hover/focus attribute surface to service-window rows. */
export function attachItemTooltip(target:HTMLElement,item:InventoryItem,label=item.name){
 const tooltip=itemTooltipFor(target);if(!tooltip)return ()=>{};
 target.setAttribute('aria-describedby',tooltip.id);
 const show=()=>showItemTooltip(target,tooltip,item,label,'对象');
 const hide=()=>hideItemTooltip(target);
 target.addEventListener('pointerenter',show);target.addEventListener('pointerleave',hide);
 target.addEventListener('focusin',show);target.addEventListener('focusout',hide);
 return ()=>{target.removeEventListener('pointerenter',show);target.removeEventListener('pointerleave',hide);target.removeEventListener('focusin',show);target.removeEventListener('focusout',hide);hideItemTooltip(target);};
}

export class InventoryView {
 private pocketLayout=false;
 private cancelledRightClick=false;
 private readonly description:HTMLElement|undefined;
 private descriptionMakeIndex:number|undefined;
 private descriptionTarget:HTMLElement|undefined;
 private descriptionRevision=0;
 private descriptionError=false;
 private items=new Map<number,InventoryItem>();private placements=new Map<number,number>();private serviceReserved=new Set<number>();private pending=new Set<number>();private pendingTimers=new Map<number,ReturnType<typeof setTimeout>>();private known=false;private readonly iconAssets:ItemIconAssets;private iconRender=0;private heldIconRender=0;private selectedSlot:number|undefined;private selectedMakeIndex:number|undefined;private activeLayoutKey:string|undefined;private gold=0;private readonly tooltip:HTMLElement|undefined;private readonly heldPreview:HTMLElement|undefined;
 constructor(private element:HTMLElement,private actions:InventoryActions){
  this.element.classList.add('classic-bag');
  this.tooltip=itemTooltipFor(this.element);
  this.description=this.element.parentElement?.querySelector<HTMLElement>('[data-inventory-description]')??undefined;
  if(this.description){const box=classicUiLayout().nationalInventoryGrid.description;this.description.style.left=`${box.x}px`;this.description.style.top=`${box.y}px`;this.description.style.width=`${box.width}px`;this.description.style.height=`${box.height}px`;this.element.parentElement?.style?.setProperty?.('--bag-native-font-family',box.fontFamily);}
  this.element.parentElement?.addEventListener?.('pointerleave',()=>this.hideDescription());
  if(this.description&&typeof MutationObserver==='function')new MutationObserver(()=>{if(this.description?.closest('[hidden]'))this.hideDescription();}).observe(this.element.parentElement!,{attributes:true,attributeFilter:['hidden']});
  const body=this.element.ownerDocument?.body;
  if(body){this.heldPreview=this.element.ownerDocument.createElement('div');this.heldPreview.className='inventory-held-item';this.heldPreview.hidden=true;body.append(this.heldPreview);}
  this.element.onpointermove=event=>{this.moveHeldPreview(event.clientX,event.clientY);};
  this.element.ownerDocument?.addEventListener?.('pointermove',event=>{this.moveHeldPreview(event.clientX,event.clientY);});
  this.element.ownerDocument?.addEventListener?.('pointercancel',()=>this.cancelSelection());
  this.element.ownerDocument?.addEventListener?.('pointerdown',event=>{this.cancelledRightClick=false;if(!this.pocketLayout||event.button!==2||!this.heldItem())return;const stage=itemTooltipStage(this.element.ownerDocument);if(stage&&event.target instanceof Node&&stage.contains(event.target)){event.preventDefault();event.stopPropagation();this.cancelledRightClick=true;this.cancelSelection();}},true);
  this.element.ownerDocument?.addEventListener?.('contextmenu',event=>{if(!this.cancelledRightClick)return;this.cancelledRightClick=false;event.preventDefault();event.stopPropagation();},true);
  this.element.ownerDocument?.defaultView?.addEventListener?.('blur',()=>{this.cancelSelection();this.hideDescription();});
  this.element.ownerDocument?.addEventListener?.('visibilitychange',()=>{if(this.element.ownerDocument?.hidden)this.cancelSelection();});
  this.iconAssets=new ItemIconAssets('items',()=>this.render());
 }
 /** Bag cells and the six native pockets share one instance/location table. */
 enablePockets(){if(this.pocketLayout)return;this.pocketLayout=true;this.activeLayoutKey=undefined;this.placements.clear();if(this.known){this.loadPlacements();this.assignPlacements();}this.render();}
 pocketItems(){return Array.from({length:POCKET_COUNT},(_,slot)=>this.itemAtLocation(BAG_VISIBLE+slot));}
 pocketHeld(slot:number){return this.selectedSlot===BAG_VISIBLE+slot?this.heldItem():undefined;}
 pocketKnown(){return this.known;}
 pocketPending(id:number){return this.pending.has(id)||this.serviceReserved.has(id);}
 describeItem(makeIndex:number,target:HTMLElement){
  const item=this.selectableItem(makeIndex);if(!item||this.selectedMakeIndex===makeIndex){this.hideDescription();return;}
  if(!this.description){if(this.tooltip)showItemTooltip(target,this.tooltip,item);return;}
  hideItemTooltip();if(this.description.closest('[hidden]'))return;
  this.descriptionMakeIndex=makeIndex;this.descriptionTarget=target;target.setAttribute('aria-describedby',this.description.id);this.refreshDescription();
 }
 hideDescription(target?:HTMLElement){
  if(target&&this.description&&this.descriptionTarget!==target)return;
  // A font error must survive source-item blur so its real retry can receive focus.
  // Explicit window/leave/disconnect cleanup still calls this without a target.
  if(target&&this.descriptionError)return;
  ++this.descriptionRevision;
  this.descriptionError=false;
  this.descriptionMakeIndex=undefined;this.descriptionTarget=undefined;if(this.description){this.description.replaceChildren();delete this.description.dataset.itemId;}
  if(target)hideItemTooltip(target);
 }
 refreshItemDescription(){this.refreshDescription();}
 private refreshDescription(){
  if(!this.description||this.descriptionMakeIndex===undefined)return;
  const item=this.selectableItem(this.descriptionMakeIndex);
  if(!item||this.selectedMakeIndex===item.makeIndex||this.description.closest('[hidden]')){this.hideDescription();return;}
  const detail=nativeItemDescription(item,this.actions.readAttributes?.()),document=this.description.ownerDocument;
  this.descriptionError=false;
  const first=document.createElement('div'),name=document.createElement('strong'),info=document.createElement('span'),second=document.createElement('div'),third=document.createElement('div');
  name.textContent=`${detail.name} `;info.textContent=detail.first;first.append(name,info);second.textContent=detail.second;third.textContent=detail.third;third.dataset.requirement=detail.requirementMet===false?'unmet':detail.requirementMet===true?'met':'unknown';
  this.description.dataset.itemId=String(item.makeIndex);this.description.replaceChildren(first,second,third);
  const revision=++this.descriptionRevision;
  if(this.description.closest('.national-window')){
   const nodes=[name,info,second,third];
   for(const node of nodes)node.style.color='transparent';
   void this.paintDescription(nodes,detail.requirementMet===false,revision);
  }
 }
 private async paintDescription(nodes:HTMLElement[],unmet:boolean,revision:number){
  const root=this.description!,box=classicUiLayout().nationalInventoryGrid.description;
  const current=()=>this.descriptionRevision===revision&&root.isConnected&&!root.closest('[hidden]')&&nodes.every(node=>root.contains(node));
  try{
   const font=await loadNativeUiFont(box.fontProfile);
   const texts=nodes.map(node=>node.textContent??'');
   await font.prepare(texts.join('\n'));
   if(!current())return;
   const colors=['#ffff00','#ffffff','#ffffff',unmet?'#ff0000':'#ffffff'];
   const painted=nodes.map((node,index)=>{
    const canvas=root.ownerDocument.createElement('canvas');canvas.className='native-inventory-glyph';canvas.setAttribute('aria-hidden','true');
    font.paint(canvas,texts[index],{width:box.width,height:box.lineHeight,left:index===1?font.measure(texts[0]):0,top:0,lineHeight:box.lineHeight,color:colors[index],outline:false});
    return canvas;
   });
   if(current())nodes.forEach((node,index)=>node.append(painted[index]));
  }catch(error){
   if(!current())return;
   this.descriptionError=true;
   const diagnostic=root.ownerDocument.createElement('div');diagnostic.className='native-inventory-font-error';diagnostic.setAttribute('role','alert');
   const message=root.ownerDocument.createElement('span');message.textContent=error instanceof Error?error.message:'原客户端文字素材载入失败，请重试';
   const retry=root.ownerDocument.createElement('button');retry.type='button';retry.textContent='重试文字';
   retry.addEventListener('click',()=>{if(current())this.refreshDescription();});diagnostic.append(message,retry);root.append(diagnostic);
  }
 }
 clickPocket(slot:number,clientX=0,clientY=0){if(!Number.isInteger(slot)||slot<0||slot>=POCKET_COUNT)return false;const held=this.heldItem();if(held&&!acceptsPocketItem(held))return false;return this.moveLocal(BAG_VISIBLE+slot,clientX,clientY);}
 moveToPocket(slot:number,makeIndex:number){if(!Number.isInteger(slot)||slot<0||slot>=POCKET_COUNT)return false;const item=this.selectableItem(makeIndex),from=this.placements.get(makeIndex);if(!item||!acceptsPocketItem(item)||from===undefined)return false;if(this.heldItem()?.makeIndex!==makeIndex)this.cancelSelection();this.selectedSlot=from;this.selectedMakeIndex=makeIndex;return this.moveLocal(BAG_VISIBLE+slot);}
 returnPocketToBag(slot:number){const item=this.itemAtLocation(BAG_VISIBLE+slot);if(!item||!this.selectableItem(item.makeIndex))return false;const occupied=new Set(this.placements.values()),empty=Array.from({length:BAG_VISIBLE},(_,i)=>i).find(i=>!occupied.has(i));if(empty===undefined)return false;this.placements.set(item.makeIndex,empty);this.clearSelection();this.savePlacements();this.render();this.actions.availabilityChanged?.();return true;}
 private itemAtLocation(slot:number){const entry=[...this.placements].find(([,value])=>value===slot);return entry&&!this.serviceReserved.has(entry[0])&&this.selectedMakeIndex!==entry[0]?this.items.get(entry[0]):undefined;}
 private moveLocal(index:number,clientX=0,clientY=0){
  if(!this.known)return false;
  const target=this.itemAtLocation(index),held=this.heldItem();
  if(target&&!this.selectableItem(target.makeIndex))return false;
  if(!held){if(!target)return false;this.selectedSlot=index;this.selectedMakeIndex=target.makeIndex;}
  else if(this.selectedSlot===index){this.clearSelection();}
  else{const from=this.selectedSlot!;this.placements.set(held.makeIndex,index);if(target){this.placements.set(target.makeIndex,from);this.selectedSlot=from;this.selectedMakeIndex=target.makeIndex;}else this.clearSelection();this.savePlacements();}
  this.hideTooltip();this.render();if(this.heldPreview)this.heldPreview.hidden=!this.heldItem();this.moveHeldPreview(clientX,clientY);this.actions.availabilityChanged?.();return true;
 }
  clear(){this.hideDescription();this.known=false;this.items.clear();this.placements.clear();this.serviceReserved.clear();this.activeLayoutKey=undefined;this.clearPendingTimers();this.pending.clear();this.clearSelection();this.render();this.actions.availabilityChanged?.();}
  replace(items:InventoryItem[]){this.loadPlacements();this.known=true;this.items=new Map(items.map(item=>[item.makeIndex,item]));for(const id of [...this.serviceReserved])if(!this.items.has(id))this.serviceReserved.delete(id);this.clearPendingTimers();this.pending.clear();this.assignPlacements();this.render();this.actions.availabilityChanged?.();}
  add(item:InventoryItem){this.items.set(item.makeIndex,item);this.assignPlacements();this.render();this.actions.availabilityChanged?.();}
   update(item:InventoryItem){if(this.items.has(item.makeIndex)){this.items.set(item.makeIndex,item);this.render();this.actions.availabilityChanged?.();}}
  remove(id:number){this.clearPendingTimer(id);this.pending.delete(id);this.items.delete(id);this.placements.delete(id);this.serviceReserved.delete(id);this.render();this.actions.availabilityChanged?.();}
  resolve(id:number,accepted:boolean,removeOnSuccess:boolean){if(!this.pending.has(id))return false;this.clearPendingTimer(id);this.pending.delete(id);if(accepted&&removeOnSuccess){this.items.delete(id);this.placements.delete(id);this.serviceReserved.delete(id);}this.render();this.actions.availabilityChanged?.();return true;}
   rejectPending(){if(!this.pending.size)return;this.clearPendingTimers();this.pending.clear();this.render();this.actions.availabilityChanged?.();}
 currency(gold:number){this.gold=gold;const output=this.element.parentElement?.querySelector<HTMLElement>('[data-inventory-gold]');if(output)output.textContent=gold.toLocaleString('zh-CN');}
 cancelSelection(){const hadSelection=this.selectedSlot!==undefined||this.selectedMakeIndex!==undefined;if(!hadSelection)return false;this.clearSelection();this.render();this.actions.availabilityChanged?.();return true;}
 retryIcons(){return this.iconAssets.retry();}
 heldItem(){const id=this.selectedMakeIndex;if(id===undefined||this.pending.has(id)||this.serviceReserved.has(id)||this.placements.get(id)!==this.selectedSlot)return undefined;return this.items.get(id);}
  selectableItem(makeIndex:number){return this.pending.has(makeIndex)||this.serviceReserved.has(makeIndex)?undefined:this.items.get(makeIndex);}
  useItem(makeIndex:number){const item=this.selectableItem(makeIndex);if(!item||!(item.stdMode<=4||item.stdMode===31))return false;if(this.selectedMakeIndex===makeIndex)this.clearSelection();return this.begin(item,()=>this.actions.use(makeIndex));}
 consumeHeldItem(makeIndex:number){if(this.heldItem()?.makeIndex!==makeIndex)return false;this.clearSelection();this.render();return true;}
 equipInto(makeIndex:number,slot:number){if(!EQUIPMENT_CELLS.some(value=>value.slot===slot))return false;const item=this.items.get(makeIndex);if(!item||this.pending.has(makeIndex)||this.serviceReserved.has(makeIndex))return false;this.clearSelection();this.hideTooltip();return this.begin(item,()=>this.actions.equip(makeIndex,slot));}
  reserveForService(makeIndex:number){if(!this.items.has(makeIndex)||this.pending.has(makeIndex))return false;if(this.serviceReserved.has(makeIndex))return true;if(this.selectedMakeIndex===makeIndex)this.clearSelection();this.serviceReserved.add(makeIndex);this.placements.delete(makeIndex);this.assignPlacements();this.render();this.actions.availabilityChanged?.();return true;}
  releaseFromService(makeIndex:number){if(!this.serviceReserved.delete(makeIndex))return false;this.assignPlacements();this.render();this.actions.availabilityChanged?.();return true;}
  holdFromService(makeIndex:number,clientX:number,clientY:number){if(!this.items.has(makeIndex)||this.pending.has(makeIndex))return false;const wasReserved=this.serviceReserved.delete(makeIndex);this.assignPlacements();const slot=this.placements.get(makeIndex);if(slot===undefined){if(wasReserved)this.serviceReserved.add(makeIndex);this.assignPlacements();this.render();return false;}this.clearSelection();this.selectedSlot=slot;this.selectedMakeIndex=makeIndex;this.hideTooltip();this.render();this.actions.availabilityChanged?.();if(this.heldPreview)this.heldPreview.hidden=false;this.moveHeldPreview(clientX,clientY);return true;}
 offerToTrade(makeIndex:number){const item=this.selectableItem(makeIndex);if(!item||!this.actions.trade)return false;return this.begin(item,()=>this.actions.trade!(makeIndex),null);}
  requestDrop(makeIndex:number){const item=this.selectableItem(makeIndex);if(item)this.begin(item,()=>this.actions.drop(makeIndex));}
 debugState(){return {known:this.known,items:[...this.items.values()].map(item=>({...item,slot:this.placements.get(item.makeIndex)})),pending:[...this.pending],serviceReserved:[...this.serviceReserved],selectedSlot:this.selectedSlot,selectedMakeIndex:this.selectedMakeIndex,gold:this.gold};}
  private begin(item:InventoryItem,action:()=>boolean|void,timeoutMs:number|null=8000){const id=item.makeIndex;if(this.pending.has(id))return false;this.pending.add(id);this.clearPendingTimer(id);if(timeoutMs!==null&&typeof setTimeout==='function')this.pendingTimers.set(id,setTimeout(()=>{this.pendingTimers.delete(id);if(this.pending.delete(id)){this.render();this.actions.availabilityChanged?.();}},timeoutMs));this.render();this.actions.availabilityChanged?.();try{if(action()===false){this.clearPendingTimer(id);this.pending.delete(id);this.render();this.actions.availabilityChanged?.();return false;}return true;}catch(error){this.clearPendingTimer(id);this.pending.delete(id);this.render();this.actions.availabilityChanged?.();throw error;}}
 private clearPendingTimer(id:number){const timer=this.pendingTimers.get(id);if(timer!==undefined){clearTimeout(timer);this.pendingTimers.delete(id);}}
 private clearPendingTimers(){for(const timer of this.pendingTimers.values())clearTimeout(timer);this.pendingTimers.clear();}
 private loadPlacements(){
  const baseKey=this.actions.layoutKey?.(),key=baseKey&&this.pocketLayout?`${baseKey}.${classicUiLayout().itemQuickBar.layoutVersion}`:baseKey;if(key===this.activeLayoutKey)return;this.hideDescription();this.clearSelection();this.serviceReserved.clear();this.activeLayoutKey=key;this.placements.clear();
  if(!key||typeof localStorage==='undefined')return;
  try{const saved=JSON.parse(localStorage.getItem(key)??'{}') as Record<string,number>;const used=new Set<number>();for(const [id,slot] of Object.entries(saved))if(Number.isSafeInteger(Number(id))&&Number(id)>0&&Number.isInteger(slot)&&slot>=0&&slot<BAG_VISIBLE+(this.pocketLayout?POCKET_COUNT:0)&&!used.has(slot)){this.placements.set(Number(id),slot);used.add(slot);}}catch{}
 }
 private savePlacements(){
  const key=this.activeLayoutKey;if(!key||typeof localStorage==='undefined')return;
  try{localStorage.setItem(key,JSON.stringify(Object.fromEntries(this.placements)));}catch{}
 }
 private assignPlacements(){
  for(const id of [...this.placements.keys()])if(!this.items.has(id)||this.serviceReserved.has(id))this.placements.delete(id);
  if(this.pocketLayout)for(const [id,slot] of this.placements)if(slot>=BAG_VISIBLE&&!acceptsPocketItem(this.items.get(id)!))this.placements.delete(id);
  const used=new Set(this.placements.values());
  for(const item of this.items.values())if(!this.serviceReserved.has(item.makeIndex)&&!this.placements.has(item.makeIndex)){const candidates=[...(this.pocketLayout&&acceptsPocketItem(item)?Array.from({length:POCKET_COUNT},(_,i)=>BAG_VISIBLE+i):[]),...Array.from({length:BAG_VISIBLE},(_,i)=>i)];const slot=candidates.find(index=>!used.has(index));if(slot===undefined)continue;this.placements.set(item.makeIndex,slot);used.add(slot);}
  this.savePlacements();
 }
 private clearSelection(render=false){
  this.heldIconRender++;this.selectedSlot=undefined;this.selectedMakeIndex=undefined;if(this.heldPreview){this.heldPreview.hidden=true;this.heldPreview.replaceChildren();}
  this.element.querySelectorAll?.('.item-cell.selected').forEach(cell=>{cell.classList.remove('selected');cell.setAttribute('aria-pressed','false');});
  if(render)this.render();
 }
 private moveHeldPreview(clientX:number,clientY:number){if(this.selectedSlot!==undefined&&this.heldPreview){this.heldPreview.style.left=`${clientX+10}px`;this.heldPreview.style.top=`${clientY+10}px`;}}
 private paintHeldPreview(item:InventoryItem){const render=++this.heldIconRender;this.heldPreview?.replaceChildren(itemIconElement(item,this.iconAssets,{isCurrent:()=>this.heldIconRender===render&&this.heldItem()===item}));}
 private select(index:number,item:InventoryItem,cell:HTMLButtonElement,event:MouseEvent){
  if(this.pocketLayout){this.moveLocal(index,event.clientX,event.clientY);const placed=this.itemAtLocation(index);if(placed)this.describeItem(placed.makeIndex,cell);return;}
  const current=this.selectableItem(item.makeIndex);if(!current)return;item=current;
  if(this.selectedSlot===index){this.clearSelection();this.render();return;}
  if(this.selectedSlot!==undefined){
   const from=this.selectedSlot,fromEntry=[...this.placements].find(([,slot])=>slot===from),toEntry=[...this.placements].find(([,slot])=>slot===index);
   if(fromEntry){this.placements.set(fromEntry[0],index);if(toEntry)this.placements.set(toEntry[0],from);this.savePlacements();}
   this.clearSelection();this.render();return;
  }
  this.selectedSlot=index;this.selectedMakeIndex=item.makeIndex;cell.classList.add('selected');cell.setAttribute('aria-pressed','true');cell.dataset.heldItemId=String(item.makeIndex);cell.title=`拿取中：${item.name}`;cell.setAttribute('aria-label',`拿取中：${item.name}`);cell.replaceChildren();
  if(this.heldPreview){this.paintHeldPreview(item);this.heldPreview.hidden=false;this.heldPreview.style.left=`${event.clientX+10}px`;this.heldPreview.style.top=`${event.clientY+10}px`;}
 }
  private activate(item:InventoryItem){const current=this.selectableItem(item.makeIndex);if(!current)return;item=current;const selected=this.actions.selectService?.(item);if(selected!==undefined){if(selected)this.clearSelection();return;}const slot=defaultSlot(item.stdMode);this.clearSelection();this.render();if(slot>=0)this.begin(item,()=>this.actions.equip(item.makeIndex,slot));else if(item.stdMode<=4||item.stdMode===31)this.useItem(item.makeIndex);}
 private showTooltip(item:InventoryItem,cell:HTMLButtonElement){
  this.describeItem(item.makeIndex,cell);
 }
 private hideTooltip(target?:HTMLElement){this.hideDescription(target);hideItemTooltip(target??this.element);}
  private render(){
  const render=++this.iconRender;
  const retained=this.pocketLayout?Array.from(this.element.children) as HTMLButtonElement[]:[];
  if(!this.pocketLayout)this.element.replaceChildren();this.element.classList.add('classic-bag');hideItemTooltip(this.element);
  if(this.selectedSlot!==undefined&&!this.heldItem())this.clearSelection();
  const bag=new Map<number,InventoryItem>();for(const item of this.items.values()){const slot=this.placements.get(item.makeIndex);if(slot!==undefined&&!this.serviceReserved.has(item.makeIndex)&&!(this.selectedSlot===slot&&this.selectedMakeIndex===item.makeIndex))bag.set(slot,item);}
  for(let index=0;index<BAG_VISIBLE;index++){
   const item=bag.get(index),cell=retained[index]??document.createElement('button');
   cell.replaceChildren();cell.title='';cell.disabled=false;cell.draggable=false;cell.onclick=null;cell.ondblclick=null;cell.oncontextmenu=null;cell.onmouseenter=null;cell.onmouseleave=null;cell.onfocus=null;cell.onblur=null;cell.ondragstart=null;cell.ondragend=null;delete cell.dataset.itemId;delete cell.dataset.heldItemId;
   const national=nationalUsesLayout()||Boolean(this.element.closest?.('.national-window'));
   const metrics=national?NATIONAL_BAG_CELL:BAG_CELL;
   const position=bagCellPosition(index,national);cell.type='button';cell.className='item-cell';cell.style.left=`${position.left}px`;cell.style.top=`${position.top}px`;cell.style.width=`${metrics.width}px`;cell.style.height=`${metrics.height}px`;
   cell.dataset.slot=String(index);cell.setAttribute('aria-pressed',String(this.selectedSlot===index));if(this.selectedSlot===index)cell.classList.add('selected');
   if(!this.known){cell.disabled=true;cell.title='等待服务端背包数据…';}
   else if(item){
    const pending=this.pending.has(item.makeIndex);
    cell.dataset.itemId=String(item.makeIndex);cell.disabled=pending;cell.setAttribute('aria-label',item.name);cell.setAttribute('aria-describedby',this.description?.id??this.tooltip?.id??'item-tooltip');
    const iconState=this.iconAssets.state(item),icon=itemIconElement(item,this.iconAssets,{isCurrent:()=>this.iconRender===render&&this.items.get(item.makeIndex)===item});
    if(national&&iconState.status==='ready'&&iconState.frame){const anchor=nationalBagIconPosition(iconState.frame);icon.classList.add('native-bag-item-icon');icon.style.left=`${anchor.left}px`;icon.style.top=`${anchor.top}px`;}
    cell.append(icon);
    const quantity=item.quantity??item.count;if(quantity!==undefined&&quantity>1){const badge=document.createElement('b');badge.className='item-count';badge.textContent=String(quantity);cell.append(badge);}
    cell.onclick=event=>{
     event.preventDefault();
     if(event.detail>1)return;
     if(event.shiftKey&&this.actions.trade)this.offerToTrade(item.makeIndex);
     else this.select(index,item,cell,event);
    };
    cell.ondblclick=event=>{event.preventDefault();event.stopPropagation();this.activate(item);};
    cell.onmouseenter=()=>this.showTooltip(item,cell);cell.onmouseleave=()=>this.hideTooltip(cell);cell.onfocus=()=>this.showTooltip(item,cell);cell.onblur=()=>this.hideTooltip(cell);
    cell.draggable=true;
    cell.ondragstart=event=>{
     event.dataTransfer?.setData('text/plain',String(item.makeIndex));
      if(event.dataTransfer)event.dataTransfer.effectAllowed='copyMove';
    };
    cell.ondragend=()=>{this.cancelSelection();};
    cell.oncontextmenu=event=>{
     event.preventDefault();if(this.pocketLayout&&this.cancelSelection())return;this.activate(item);
    };
   }else{const held=this.selectedSlot===index?this.heldItem():undefined;cell.title=held?`拿取中：${held.name}`:this.known?'空':'等待服务端背包数据…';cell.setAttribute('aria-label',held?`拿取中：${held.name}`:`空格 ${index+1}`);if(held){cell.dataset.heldItemId=String(held.makeIndex);cell.ondblclick=event=>{event.preventDefault();this.activate(held);};cell.oncontextmenu=event=>{event.preventDefault();if(this.pocketLayout&&this.cancelSelection())return;this.activate(held);};}cell.onclick=event=>{event.preventDefault();if(event.detail>1)return;if(this.pocketLayout){this.moveLocal(index,event.clientX,event.clientY);return;}if(held){this.select(index,held,cell,event);return;}if(this.selectedSlot!==undefined){const selected=[...this.items.values()].find(value=>this.placements.get(value.makeIndex)===this.selectedSlot);if(selected)this.select(index,selected,cell,event);}};}
   cell.ondragover=event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';};cell.ondrop=event=>{event.preventDefault();const id=Number(event.dataTransfer?.getData('text/plain')),from=this.placements.get(id);if(from===undefined||from===index||this.pending.has(id))return;this.selectedSlot=from;this.selectedMakeIndex=id;const selected=this.items.get(id);if(selected)this.select(index,selected,cell,event as unknown as MouseEvent);};
   if(!retained[index])this.element.append(cell);
  }
  const held=this.heldItem();if(held&&this.heldPreview)this.paintHeldPreview(held);
  this.refreshDescription();
 }
}

export class EquipmentView {
 private slots=new Map<number,InventoryItem>();private pending=new Map<number,{makeIndex:number;token:number}>();private pendingTimers=new Map<number,ReturnType<typeof setTimeout>>();private nextPendingToken=0;private readonly iconAssets:ItemIconAssets;private iconRender=0;private readonly tooltip:HTMLElement|undefined;
 constructor(private element:HTMLElement,private takeOff:(slot:number)=>boolean|void,private equipFromBag?:(makeIndex:number,slot:number)=>boolean|void,private heldMakeIndex?:()=>number|undefined){
  this.tooltip=itemTooltipFor(this.element);
  this.element.classList.add('paperdoll');
  this.iconAssets=new ItemIconAssets('stateitem',()=>this.render());this.render();
 }
 clear(){this.hideTooltip();this.clearPending();this.slots.clear();this.render();}
 itemAt(slot:number){return this.slots.get(slot);}
 retryIcons(){return this.iconAssets.retry();}
 replace(values:{slot:number;item:InventoryItem}[]){this.clearPending();this.slots=new Map(values.map(value=>[value.slot,value.item]));this.render();}
 set(slot:number,item:InventoryItem){if(this.slots.get(slot)?.makeIndex!==item.makeIndex)this.clearPendingSlot(slot);this.slots.set(slot,item);this.render();}
 remove(slot:number){this.clearPendingSlot(slot);this.slots.delete(slot);this.render();}
 update(item:InventoryItem){for(const [slot,current] of this.slots)if(current.makeIndex===item.makeIndex){this.slots.set(slot,item);this.render();break;}}
 resolve(slot:number,accepted:boolean,makeIndex:number){
  if(this.slots.get(slot)?.makeIndex!==makeIndex)return false;
  // Success remains authoritative after closing the window or timing out the wait.
  if(accepted){this.clearPendingSlot(slot);this.slots.delete(slot);this.render();return true;}
  if(!this.pending.has(slot))return false;
  if(this.pending.get(slot)!.makeIndex!==makeIndex)return false;
  this.clearPendingSlot(slot);this.render();return true;
 }
 rejectPending(){if(!this.pending.size)return;this.clearPending();this.hideTooltip();this.render();}
 debugState(){return {slots:[...this.slots].map(([slot,item])=>({slot,item:{...item}})),pending:[...this.pending.keys()],pendingRequests:[...this.pending].map(([slot,request])=>({slot,makeIndex:request.makeIndex})),rendered:Array.from(this.element.querySelectorAll<HTMLElement>('[data-slot]')).map(node=>({slot:Number(node.dataset.slot),kind:node.classList.contains('equipment-appearance')?'appearance':'cell',left:node.style.left,top:node.style.top}))};}
 preferredSlot(slot:number){
  if(slot===5&&this.slots.has(5)&&!this.slots.has(6))return 6;
  if(slot===7&&this.slots.has(7)&&!this.slots.has(8))return 8;
  return slot;
 }
 private equipHeld(slot:number){const makeIndex=this.heldMakeIndex?.();if(makeIndex===undefined)return false;this.equipFromBag?.(makeIndex,slot);return true;}
 private bindEquipDrop(button:HTMLButtonElement,slot:number){if(!this.equipFromBag)return;button.ondragover=event=>{if(this.pending.has(slot))return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';button.classList.add('drop-target');};button.ondragleave=()=>button.classList.remove('drop-target');button.ondrop=event=>{event.preventDefault();button.classList.remove('drop-target');if(this.pending.has(slot))return;const raw=event.dataTransfer?.getData('text/plain');if(!/^[0-9]+$/.test(raw??''))return;const makeIndex=Number(raw);if(Number.isSafeInteger(makeIndex))this.equipFromBag?.(makeIndex,slot);};}
 private beginTakeOff(slot:number){
  const item=this.slots.get(slot);if(!item||this.pending.has(slot))return;
  const request={makeIndex:item.makeIndex,token:++this.nextPendingToken};this.pending.set(slot,request);
  if(typeof setTimeout==='function')this.pendingTimers.set(slot,setTimeout(()=>{if(this.pending.get(slot)?.token!==request.token)return;this.pendingTimers.delete(slot);this.pending.delete(slot);this.render();},8000));
  this.render();
  try{if(this.takeOff(slot)===false){this.clearPendingSlot(slot);this.render();}}catch(error){this.clearPendingSlot(slot);this.render();throw error;}
 }
 private clearPendingSlot(slot:number){const timer=this.pendingTimers.get(slot);if(timer!==undefined){clearTimeout(timer);this.pendingTimers.delete(slot);}this.pending.delete(slot);}
 private clearPending(){for(const timer of this.pendingTimers.values())clearTimeout(timer);this.pendingTimers.clear();this.pending.clear();}
 private render(){
  const render=++this.iconRender;
  this.hideTooltip();this.element.replaceChildren();this.element.classList.add('paperdoll');
  for(const appearance of EQUIPMENT_APPEARANCE){
   const item=this.slots.get(appearance.slot),state=item&&this.iconAssets.state(item),frame=state?.status==='ready'?state.frame:undefined;
   if(!item||!frame)continue;
   const button=document.createElement('button');button.type='button';button.className=`equipment-appearance equipment-appearance--${appearance.layer}`;
   button.style.left=`${EQUIPMENT_APPEARANCE_ORIGIN.x+frame.offsetX}px`;button.style.top=`${EQUIPMENT_APPEARANCE_ORIGIN.y+frame.offsetY}px`;
   button.style.width=`${frame.width}px`;button.style.height=`${frame.height}px`;button.style.zIndex=String(appearance.z);
    button.dataset.slot=String(appearance.slot);button.dataset.durability=String(item.durability);button.dataset.maxDurability=String(item.maxDurability);button.setAttribute('aria-describedby',this.tooltip?.id??'item-tooltip');
   button.title=`${appearance.name}：${item.name}\n持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;
   button.disabled=this.pending.has(appearance.slot);
   button.append(itemIconElement(item,this.iconAssets,{className:'equipment-state-art',isCurrent:()=>this.iconRender===render&&this.slots.get(appearance.slot)===item}));
   button.onclick=()=>{if(!this.equipHeld(appearance.slot))this.beginTakeOff(appearance.slot);};this.bindEquipDrop(button,appearance.slot);button.onmouseenter=()=>this.showTooltip(item,button,appearance.name);button.onmouseleave=()=>this.hideTooltip();button.onfocus=()=>this.showTooltip(item,button,appearance.name);button.onblur=()=>this.hideTooltip();
   this.element.append(button);
  }
  for(const cell of EQUIPMENT_CELLS){
   const button=document.createElement('button');button.type='button';button.className='item-cell equipment-cell';
   button.style.left=`${EQUIPMENT_PAGE.x+cell.x}px`;button.style.top=`${EQUIPMENT_PAGE.y+cell.y}px`;
   button.dataset.slot=String(cell.slot);button.setAttribute('aria-label',cell.name);
   const item=this.slots.get(cell.slot);
   if(item){
    button.dataset.durability=String(item.durability);button.dataset.maxDurability=String(item.maxDurability);button.setAttribute('aria-describedby',this.tooltip?.id??'item-tooltip');
    button.title=`${cell.name}：${item.name}\n持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;
    button.disabled=this.pending.has(cell.slot);
    button.append(itemIconElement(item,this.iconAssets,{isCurrent:()=>this.iconRender===render&&this.slots.get(cell.slot)===item}));
    button.onclick=()=>{if(!this.equipHeld(cell.slot))this.beginTakeOff(cell.slot);};button.onmouseenter=()=>this.showTooltip(item,button,cell.name);button.onmouseleave=()=>this.hideTooltip();button.onfocus=()=>this.showTooltip(item,button,cell.name);button.onblur=()=>this.hideTooltip();
    }else{button.title=`${cell.name}：空`;button.disabled=this.pending.has(cell.slot)||!this.equipFromBag;button.onclick=()=>this.equipHeld(cell.slot);}
   this.bindEquipDrop(button,cell.slot);this.element.append(button);
  }
 }
 private showTooltip(item:InventoryItem,cell:HTMLButtonElement,label:string){
  if(!this.tooltip)return;showItemTooltip(cell,this.tooltip,item,label,'部位');
 }
 private hideTooltip(){hideItemTooltip(this.element);}
}

function defaultSlot(mode:number){
 if(mode===10||mode===11)return 0;if(mode===5||mode===6)return 1;if([28,29,30].includes(mode))return 2;if([19,20,21].includes(mode))return 3;if(mode===15)return 4;
 if([24,26].includes(mode))return 5;if(mode===25||mode===51)return 9;if(mode===22||mode===23)return 7;if(mode===54||mode===64)return 10;if(mode===52||mode===62)return 11;if(mode===53||mode===63)return 12;return -1;
}
function itemTypeName(mode:number){if(mode<=4||mode===31)return '可使用物品';if(mode===5||mode===6)return '武器';if(mode===10||mode===11)return '衣服';if(mode===15)return '头盔';if([19,20,21].includes(mode))return '项链';if([22,23].includes(mode))return '戒指';if([24,26].includes(mode))return '手镯';if([28,29,30].includes(mode))return '蜡烛/护身符';if(mode===40)return '肉类';if(mode===43)return '矿石';return `物品 ${mode}`;}
