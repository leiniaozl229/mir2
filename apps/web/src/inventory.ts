import {loadNationalUiLibrary} from './classic-ui';

export type InventoryItem={name:string;makeIndex:number;durability:number;maxDurability:number;stdMode:number;weight:number;looks:number};
type IconFrame={file:string;width:number;height:number;offsetX:number;offsetY:number};
type Icons={frames:Record<string,IconFrame>};
type InventoryActions={drop:(makeIndex:number)=>void;equip:(makeIndex:number,slot:number)=>void;use:(makeIndex:number)=>void;trade?:(makeIndex:number)=>void};

export const BAG_COLUMNS=8;
export const BAG_VISIBLE=40;
export const BAG_CELL={width:36,height:32,originX:9,originY:37,gapX:1,gapY:1};
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

let iconsPromise:Promise<Icons>|undefined;
export function loadFallbackItemIcons(){return iconsPromise??=fetch('/items/Items/library.json').then(async response=>{if(!response.ok)throw new Error('缺少物品素材');return response.json();});}

export function bagCellPosition(index:number){
 const x=index%BAG_COLUMNS,y=Math.floor(index/BAG_COLUMNS)%5;
 return {left:x*(BAG_CELL.width+BAG_CELL.gapX)+BAG_CELL.originX,top:y*(BAG_CELL.height+BAG_CELL.gapY)+BAG_CELL.originY};
}

export class InventoryView {
 private items=new Map<number,InventoryItem>();private pending=new Set<number>();private known=false;private icons:Icons|undefined;private nationalIcons:Icons|undefined;
 constructor(private element:HTMLElement,private actions:InventoryActions){
  this.element.classList.add('classic-bag');
  void loadFallbackItemIcons().then(icons=>{this.icons=icons;this.render();}).catch(()=>{});
  void loadNationalUiLibrary('items').then(icons=>{this.nationalIcons=icons;this.render();}).catch(()=>{});
 }
 clear(){this.known=false;this.items.clear();this.pending.clear();this.render();}
 replace(items:InventoryItem[]){this.known=true;this.items=new Map(items.map(item=>[item.makeIndex,item]));this.pending.clear();this.render();}
 add(item:InventoryItem){this.items.set(item.makeIndex,item);this.render();}
 update(item:InventoryItem){if(this.items.has(item.makeIndex)){this.items.set(item.makeIndex,item);this.render();}}
 remove(id:number){this.pending.delete(id);this.items.delete(id);this.render();}
 resolve(id:number,accepted:boolean,removeOnSuccess:boolean){this.pending.delete(id);if(accepted&&removeOnSuccess)this.items.delete(id);this.render();}
 rejectPending(){if(!this.pending.size)return;this.pending.clear();this.render();}
 debugState(){return {known:this.known,items:[...this.items.values()].map(item=>({...item})),pending:[...this.pending]};}
 private begin(item:InventoryItem,action:()=>void){this.pending.add(item.makeIndex);this.render();action();}
 private render(){
  this.element.replaceChildren();this.element.classList.add('classic-bag');
  const bag=[...this.items.values()];
  for(let index=0;index<BAG_VISIBLE;index++){
   const item=bag[index],cell=document.createElement('button');
   const position=bagCellPosition(index);
   cell.type='button';cell.className='item-cell';cell.style.left=`${position.left}px`;cell.style.top=`${position.top}px`;
   cell.dataset.slot=String(index);
   if(!this.known){cell.disabled=true;cell.title='等待服务端背包数据…';}
   else if(item){
    const pending=this.pending.has(item.makeIndex);
    cell.dataset.itemId=String(item.makeIndex);cell.disabled=pending;
    cell.title=`${item.name}\n持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;
    const nationalIcon=this.nationalIcons?.frames[item.looks],icon=nationalIcon??this.icons?.frames[item.looks];
    cell.append(imageOrEmpty(icon,item,nationalIcon?`/ui-national/items/${nationalIcon.file}`:undefined));
    cell.onclick=event=>{
     event.preventDefault();
     if(event.shiftKey&&this.actions.trade)this.begin(item,()=>this.actions.trade!(item.makeIndex));
     else{
      const slot=defaultSlot(item.stdMode);
      if(slot>=0)this.begin(item,()=>this.actions.equip(item.makeIndex,slot));
      else if(item.stdMode<=4||item.stdMode===31)this.begin(item,()=>this.actions.use(item.makeIndex));
     }
    };
    cell.draggable=true;
    cell.ondragstart=event=>{
     event.dataTransfer?.setData('text/plain',String(item.makeIndex));
     if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
    };
    cell.ondragend=event=>{
     const rect=this.element.getBoundingClientRect();
     const outside=event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;
     if(outside)this.begin(item,()=>this.actions.drop(item.makeIndex));
    };
    cell.oncontextmenu=event=>{
     event.preventDefault();
     const slot=defaultSlot(item.stdMode);
     if(slot>=0)this.begin(item,()=>this.actions.equip(item.makeIndex,slot));
     else if(item.stdMode<=4||item.stdMode===31)this.begin(item,()=>this.actions.use(item.makeIndex));
    };
   }else cell.title=this.known?'空':'等待服务端背包数据…';
   this.element.append(cell);
  }
 }
}

export class EquipmentView {
 private slots=new Map<number,InventoryItem>();private pending=new Set<number>();private icons:Icons|undefined;private stateIcons:Icons|undefined;
 constructor(private element:HTMLElement,private takeOff:(slot:number)=>void){
  this.element.classList.add('paperdoll');
  void loadFallbackItemIcons().then(icons=>{this.icons=icons;this.render();}).catch(()=>{});this.render();
  void loadNationalUiLibrary('stateitem').then(icons=>{this.stateIcons=icons;this.render();}).catch(()=>{});
 }
 clear(){this.slots.clear();this.pending.clear();this.render();}
 replace(values:{slot:number;item:InventoryItem}[]){this.slots=new Map(values.map(value=>[value.slot,value.item]));this.pending.clear();this.render();}
 set(slot:number,item:InventoryItem){this.pending.delete(slot);this.slots.set(slot,item);this.render();}
 remove(slot:number){this.pending.delete(slot);this.slots.delete(slot);this.render();}
 update(item:InventoryItem){for(const [slot,current] of this.slots)if(current.makeIndex===item.makeIndex){this.slots.set(slot,item);this.render();break;}}
 resolve(slot:number,accepted:boolean){this.pending.delete(slot);if(accepted)this.slots.delete(slot);this.render();}
 rejectPending(){if(!this.pending.size)return;this.pending.clear();this.render();}
 debugState(){return {slots:[...this.slots].map(([slot,item])=>({slot,item:{...item}})),pending:[...this.pending],rendered:Array.from(this.element.querySelectorAll<HTMLElement>('[data-slot]')).map(node=>({slot:Number(node.dataset.slot),kind:node.classList.contains('equipment-appearance')?'appearance':'cell',left:node.style.left,top:node.style.top}))};}
 preferredSlot(slot:number){
  if(slot===5&&this.slots.has(5)&&!this.slots.has(6))return 6;
  if(slot===7&&this.slots.has(7)&&!this.slots.has(8))return 8;
  return slot;
 }
 private render(){
  this.element.replaceChildren();this.element.classList.add('paperdoll');
  for(const appearance of EQUIPMENT_APPEARANCE){
   const item=this.slots.get(appearance.slot),frame=item&&this.stateIcons?.frames[String(item.looks)];
   if(!item||!frame)continue;
   const button=document.createElement('button');button.type='button';button.className=`equipment-appearance equipment-appearance--${appearance.layer}`;
   button.style.left=`${EQUIPMENT_PAGE.x+frame.offsetX}px`;button.style.top=`${EQUIPMENT_PAGE.y+frame.offsetY}px`;
   button.style.width=`${frame.width}px`;button.style.height=`${frame.height}px`;button.style.zIndex=String(appearance.z);
   button.dataset.slot=String(appearance.slot);button.dataset.durability=String(item.durability);button.dataset.maxDurability=String(item.maxDurability);
   button.title=`${appearance.name}：${item.name}\n持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;
   button.disabled=this.pending.has(appearance.slot);
   const image=imageOrEmpty(frame,item,`/ui-national/stateitem/${frame.file}`);image.classList.add('equipment-state-art');button.append(image);
   button.onclick=()=>{this.pending.add(appearance.slot);this.render();this.takeOff(appearance.slot);};
   this.element.append(button);
  }
  for(const cell of EQUIPMENT_CELLS){
   const button=document.createElement('button');button.type='button';button.className='item-cell equipment-cell';
   button.style.left=`${EQUIPMENT_PAGE.x+cell.x}px`;button.style.top=`${EQUIPMENT_PAGE.y+cell.y}px`;
   button.dataset.slot=String(cell.slot);button.setAttribute('aria-label',cell.name);
   const item=this.slots.get(cell.slot);
   if(item){
    button.dataset.durability=String(item.durability);button.dataset.maxDurability=String(item.maxDurability);
    button.title=`${cell.name}：${item.name}\n持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;
    button.disabled=this.pending.has(cell.slot);
    const stateIcon=this.stateIcons?.frames[String(item.looks)],icon=stateIcon??this.icons?.frames[String(item.looks)];
    button.append(imageOrEmpty(icon,item,stateIcon?`/ui-national/stateitem/${stateIcon.file}`:undefined));
    button.onclick=()=>{this.pending.add(cell.slot);this.render();this.takeOff(cell.slot);};
   }else{button.title=`${cell.name}：空`;button.disabled=true;}
   this.element.append(button);
  }
 }
}

function defaultSlot(mode:number){
 if(mode===10||mode===11)return 0;if(mode===5||mode===6)return 1;if([28,29,30].includes(mode))return 2;if([19,20,21].includes(mode))return 3;if(mode===15)return 4;
 if([24,26].includes(mode))return 5;if(mode===25||mode===51)return 9;if(mode===22||mode===23)return 7;if(mode===54||mode===64)return 10;if(mode===52||mode===62)return 11;if(mode===53||mode===63)return 12;return -1;
}
function imageOrEmpty(icon:IconFrame|undefined,item:InventoryItem,url?:string){
 if(icon){const image=document.createElement('img');image.src=url??`/items/Items/${icon.file}`;image.alt=item.name;image.width=icon.width;image.height=icon.height;return image;}
 const empty=document.createElement('span');empty.className='missing-item-icon';empty.setAttribute('aria-label',`${item.name} 图标待校准`);return empty;
}
