import type {InventoryItem} from './inventory';

type StorageActions={store:(npcId:number,makeIndex:number)=>void;take:(npcId:number,makeIndex:number)=>void};

export class StorageView {
 private npcId:number|undefined;private mode:'store'|'take'='store';private items:InventoryItem[]=[];private pending:number|undefined;
 constructor(private element:HTMLElement,private actions:StorageActions){}
 clear(){this.npcId=undefined;this.items=[];this.pending=undefined;this.element.hidden=true;this.element.replaceChildren();}
 openDeposit(npcId:number,items:InventoryItem[]){this.npcId=npcId;this.mode='store';this.items=items;this.pending=undefined;this.render();}
 openItems(npcId:number,items:InventoryItem[]){this.npcId=npcId;this.mode='take';this.items=items;this.pending=undefined;this.render();}
 resolve(item:InventoryItem,accepted:boolean){this.pending=undefined;if(accepted)this.items=this.items.filter(value=>value.makeIndex!==item.makeIndex);this.render();}
 private render(){
  this.element.hidden=this.npcId===undefined;if(this.npcId===undefined)return;this.element.replaceChildren();
  const heading=document.createElement('div');heading.className='shop-heading';const title=document.createElement('strong');title.textContent=this.mode==='store'?'存入仓库':'仓库物品';const close=document.createElement('button');close.type='button';close.textContent='关闭';close.onclick=()=>this.clear();heading.append(title,close);this.element.append(heading);
  const list=document.createElement('div');list.className='storage-items';if(!this.items.length){list.textContent=this.mode==='store'?'背包为空':'仓库为空';this.element.append(list);return;}
  for(const item of this.items){const row=document.createElement('div');row.className='shop-row';row.dataset.storageItem=String(item.makeIndex);const label=document.createElement('span');label.innerHTML='<strong></strong><small></small>';label.querySelector('strong')!.textContent=item.name;label.querySelector('small')!.textContent=`#${item.makeIndex} · 持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;const button=document.createElement('button');button.type='button';button.disabled=this.pending!==undefined;button.textContent=this.pending===item.makeIndex?'等待服务端…':this.mode==='store'?'存入':'取回';button.onclick=()=>{this.pending=item.makeIndex;this.render();if(this.mode==='store')this.actions.store(this.npcId!,item.makeIndex);else this.actions.take(this.npcId!,item.makeIndex);};row.append(label,button);list.append(row);}this.element.append(list);
 }
}
