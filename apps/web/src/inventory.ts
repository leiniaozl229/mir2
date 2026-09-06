export type InventoryItem={name:string;makeIndex:number;durability:number;maxDurability:number;stdMode:number;weight:number;looks:number};
type Icons={frames:Record<string,{file:string}>};
type InventoryActions={drop:(makeIndex:number)=>void;equip:(makeIndex:number,slot:number)=>void;use:(makeIndex:number)=>void;trade?:(makeIndex:number)=>void};

let iconsPromise:Promise<Icons>|undefined;
function loadIcons(){return iconsPromise??=fetch('/items/Items/library.json').then(async response=>{if(!response.ok)throw new Error('缺少物品素材');return response.json();});}

export class InventoryView {
 private items=new Map<number,InventoryItem>();private pending=new Set<number>();private known=false;private icons:Icons|undefined;
 constructor(private element:HTMLElement,private actions:InventoryActions){void loadIcons().then(icons=>{this.icons=icons;this.render();}).catch(()=>{});}
 clear(){this.known=false;this.items.clear();this.pending.clear();this.render();}
 replace(items:InventoryItem[]){this.known=true;this.items=new Map(items.map(item=>[item.makeIndex,item]));this.pending.clear();this.render();}
 add(item:InventoryItem){this.items.set(item.makeIndex,item);this.render();}
 update(item:InventoryItem){if(this.items.has(item.makeIndex)){this.items.set(item.makeIndex,item);this.render();}}
 remove(id:number){this.pending.delete(id);this.items.delete(id);this.render();}
 resolve(id:number,accepted:boolean,removeOnSuccess:boolean){this.pending.delete(id);if(accepted&&removeOnSuccess)this.items.delete(id);this.render();}
 private begin(item:InventoryItem,action:()=>void){this.pending.add(item.makeIndex);this.render();action();}
 private render(){
  this.element.replaceChildren();if(!this.known){this.element.textContent='等待服务端背包数据…';return;}
  if(!this.items.size){const empty=document.createElement('p');empty.textContent='背包为空';this.element.append(empty);return;}
  for(const item of this.items.values()){
   const row=document.createElement('div');row.className='inventory-item';row.dataset.itemId=String(item.makeIndex);
   const description=document.createElement('div'),name=document.createElement('strong'),durability=document.createElement('p'),buttons=document.createElement('div');buttons.className='item-actions';
   name.textContent=item.name;durability.textContent=`持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;description.append(name,durability);
   const pending=this.pending.has(item.makeIndex),slot=defaultSlot(item.stdMode);
   if(slot>=0)buttons.append(this.button(pending?'等待确认…':'装备',pending,()=>this.begin(item,()=>this.actions.equip(item.makeIndex,slot))));
   else if(item.stdMode<=4||item.stdMode===31)buttons.append(this.button(pending?'等待确认…':'使用',pending,()=>this.begin(item,()=>this.actions.use(item.makeIndex))));
   if(this.actions.trade)buttons.append(this.button(pending?'等待确认…':'交易',pending,()=>this.begin(item,()=>this.actions.trade!(item.makeIndex))));
   buttons.append(this.button(pending?'等待确认…':'丢弃',pending,()=>this.begin(item,()=>this.actions.drop(item.makeIndex))));
   row.append(imageOrEmpty(this.icons?.frames[item.looks],item),description,buttons);this.element.append(row);
  }
 }
 private button(text:string,disabled:boolean,action:()=>void){const button=document.createElement('button');button.type='button';button.textContent=text;button.disabled=disabled;button.onclick=action;return button;}
}

const slotNames=['衣服','武器','右手','项链','头盔','左手镯','右手镯','左戒指','右戒指','护身符','腰带','靴子','宝石'];
export class EquipmentView {
 private slots=new Map<number,InventoryItem>();private pending=new Set<number>();private icons:Icons|undefined;
 constructor(private element:HTMLElement,private takeOff:(slot:number)=>void){void loadIcons().then(icons=>{this.icons=icons;this.render();}).catch(()=>{});this.render();}
 clear(){this.slots.clear();this.pending.clear();this.render();}
 replace(values:{slot:number;item:InventoryItem}[]){this.slots=new Map(values.map(value=>[value.slot,value.item]));this.pending.clear();this.render();}
 set(slot:number,item:InventoryItem){this.pending.delete(slot);this.slots.set(slot,item);this.render();}
 remove(slot:number){this.pending.delete(slot);this.slots.delete(slot);this.render();}
 update(item:InventoryItem){for(const [slot,current] of this.slots)if(current.makeIndex===item.makeIndex){this.slots.set(slot,item);this.render();break;}}
 resolve(slot:number,accepted:boolean){this.pending.delete(slot);if(accepted)this.slots.delete(slot);this.render();}
 private render(){
  this.element.replaceChildren();for(let slot=0;slot<slotNames.length;slot++){
   const row=document.createElement('div');row.className='equipment-item';row.dataset.slot=String(slot);const title=document.createElement('span');title.textContent=slotNames[slot];row.append(title);
   const item=this.slots.get(slot);if(item){row.dataset.durability=String(item.durability);row.dataset.maxDurability=String(item.maxDurability);const description=document.createElement('span'),name=document.createElement('strong'),durability=document.createElement('small');name.textContent=item.name;durability.textContent=`持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;description.append(name,durability);const button=document.createElement('button');button.type='button';button.textContent=this.pending.has(slot)?'等待确认…':'卸下';button.disabled=this.pending.has(slot);button.onclick=()=>{this.pending.add(slot);this.render();this.takeOff(slot);};row.append(imageOrEmpty(this.icons?.frames[item.looks],item),description,button);}else{const empty=document.createElement('em');empty.textContent='空';row.append(empty);}
   this.element.append(row);
  }
 }
}

function defaultSlot(mode:number){
 if(mode===10||mode===11)return 0;if(mode===5||mode===6)return 1;if([28,29,30].includes(mode))return 2;if([19,20,21].includes(mode))return 3;if(mode===15)return 4;
 if([24,25,26].includes(mode))return 5;if(mode===22||mode===23)return 7;if(mode===51)return 9;if(mode===54||mode===64)return 10;if(mode===52||mode===62)return 11;if(mode===53||mode===63)return 12;return -1;
}
function imageOrEmpty(icon:{file:string}|undefined,item:InventoryItem){
 if(icon){const image=document.createElement('img');image.src=`/items/Items/${icon.file}`;image.alt=item.name;return image;}
 const empty=document.createElement('span');empty.className='missing-item-icon';empty.setAttribute('aria-label',`${item.name} 图标待校准`);return empty;
}
