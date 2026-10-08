import type {InventoryItem} from './inventory';

export type InventoryServiceView={
 acceptsInventoryItem:()=>boolean;
 offerInventoryItem:(item:InventoryItem)=>boolean;
 itemInServiceSlot?:()=>InventoryItem|undefined;
};
export type InventoryServiceTarget={panel:HTMLElement;view:InventoryServiceView};
export type ServiceInventorySource={
 heldItem:()=>InventoryItem|undefined;
 selectableItem:(makeIndex:number)=>InventoryItem|undefined;
 consumeHeldItem:(makeIndex:number)=>boolean;
 holdFromService?:(makeIndex:number,clientX:number,clientY:number)=>boolean;
};

/** Service selection is presentation only; the separate confirmation sends the transaction. */
export function selectInventoryForService(item:InventoryItem,targets:InventoryServiceTarget[],canInteract:()=>boolean):boolean|undefined{
 const target=targets.filter(({panel})=>!panel.hidden).sort((a,b)=>(Number(b.panel.style.zIndex)||0)-(Number(a.panel.style.zIndex)||0))[0];
 if(!target)return undefined;
 if(!canInteract())return false;
 // The reference bag still uses/equips normally beside a buy/take menu.
 if(!target.panel.querySelector('[data-service-item-slot]'))return undefined;
 if(!target.view.acceptsInventoryItem())return false;
 return target.view.offerInventoryItem(item);
}

export function bindInventoryServiceSlot(target:InventoryServiceTarget,source:ServiceInventorySource,canInteract:()=>boolean){
 const {panel,view}=target;
 const slot=(event:Event)=>event.target instanceof HTMLElement&&Boolean(event.target.closest('[data-service-item-slot]'));
 const available=()=>!panel.hidden&&canInteract()&&view.acceptsInventoryItem();
 const click=(event:MouseEvent)=>{
  if(!slot(event))return;
  const item=source.heldItem();if(!item)return;
  // A held item must not trigger the slot's ordinary click-to-return behavior first.
  event.preventDefault();event.stopPropagation();
  const displaced=view.itemInServiceSlot?.();
  if(available()&&view.offerInventoryItem(item)){
   source.consumeHeldItem(item.makeIndex);
   if(displaced&&displaced.makeIndex!==item.makeIndex)source.holdFromService?.(displaced.makeIndex,event.clientX,event.clientY);
  }
 };
 const dragover=(event:DragEvent)=>{
  if(!slot(event))return;
  event.preventDefault();
  if(event.dataTransfer)event.dataTransfer.dropEffect=available()?'move':'none';
 };
 const drop=(event:DragEvent)=>{
  if(!slot(event))return;
  event.preventDefault();event.stopPropagation();
  if(!available())return;
  const makeIndex=Number(event.dataTransfer?.getData('text/plain'));
  if(!Number.isSafeInteger(makeIndex)||makeIndex<=0)return;
  const item=source.selectableItem(makeIndex);
  const displaced=view.itemInServiceSlot?.();
  if(item&&view.offerInventoryItem(item)){
   source.consumeHeldItem(item.makeIndex);
   if(displaced&&displaced.makeIndex!==item.makeIndex)source.holdFromService?.(displaced.makeIndex,event.clientX,event.clientY);
  }
 };
 panel.addEventListener('click',click,true);
 panel.addEventListener('dragover',dragover);
 panel.addEventListener('drop',drop);
 return ()=>{panel.removeEventListener('click',click,true);panel.removeEventListener('dragover',dragover);panel.removeEventListener('drop',drop);};
}
