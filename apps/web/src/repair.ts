import type {InventoryItem} from './inventory';
import {attachItemTooltip,loadFallbackItemIcons} from './inventory';
import {loadNationalUiLibrary} from './classic-ui';

type RepairActions={quote:(npcId:number,makeIndex:number)=>void;repair:(npcId:number,makeIndex:number)=>void};

export class RepairView{
 private npcId:number|undefined;private items:InventoryItem[]=[];private quote:{item:InventoryItem;price:number}|undefined;private pending:number|undefined;private pendingTimer:ReturnType<typeof setTimeout>|undefined;private icons:Awaited<ReturnType<typeof loadFallbackItemIcons>>|undefined;private nationalIcons:Awaited<ReturnType<typeof loadNationalUiLibrary>>|undefined;
 constructor(private element:HTMLElement,private actions:RepairActions){
  void loadFallbackItemIcons().then(icons=>{this.icons=icons;this.render();}).catch(()=>{});
  void loadNationalUiLibrary('items').then(icons=>{this.nationalIcons=icons;this.render();}).catch(()=>{});
 }
 clear(){this.clearPendingTimer();this.npcId=undefined;this.items=[];this.quote=undefined;this.pending=undefined;this.element.hidden=true;this.element.replaceChildren();}
 rejectPending(){this.clearPendingTimer();this.pending=undefined;this.render();}
 open(npcId:number,items:InventoryItem[]){this.clearPendingTimer();this.npcId=npcId;this.items=items;this.quote=undefined;this.pending=undefined;this.render();}
 showQuote(npcId:number,item:InventoryItem,price:number){if(this.npcId!==npcId||this.pending!==item.makeIndex)return false;this.clearPendingTimer();this.quote={item,price};this.pending=undefined;this.render();return true;}
 resolve(item:InventoryItem,accepted:boolean){if(this.pending!==item.makeIndex)return false;this.clearPendingTimer();this.pending=undefined;this.quote=undefined;if(accepted)this.items=this.items.map(value=>value.makeIndex===item.makeIndex?item:value);this.render();return true;}
 private begin(item:InventoryItem,quoted:boolean){if(this.pending!==undefined||this.npcId===undefined)return;this.pending=item.makeIndex;this.clearPendingTimer();this.pendingTimer=setTimeout(()=>{this.pendingTimer=undefined;this.pending=undefined;this.render();},8000);this.render();if(quoted)this.actions.repair(this.npcId,item.makeIndex);else this.actions.quote(this.npcId,item.makeIndex);}
 private clearPendingTimer(){if(this.pendingTimer!==undefined){clearTimeout(this.pendingTimer);this.pendingTimer=undefined;}}
 private render(){
  this.element.hidden=this.npcId===undefined;if(this.npcId===undefined)return;this.element.replaceChildren();
  const heading=document.createElement('div');heading.className='shop-heading';const title=document.createElement('strong');title.textContent='修理物品';const close=document.createElement('button');close.type='button';close.className='classic-window-close';close.textContent='关闭';close.onclick=()=>this.clear();heading.append(title,close);this.element.append(heading);
  const list=document.createElement('div');list.className='shop-goods repair-list';if(!this.items.length){list.textContent='背包中没有可修理物品';this.element.append(list);return;}
  for(const item of this.items){const row=document.createElement('div');row.className='shop-row';row.dataset.repairItem=String(item.makeIndex);const icon=this.icon(item);if(icon)row.append(icon);const label=document.createElement('span');label.innerHTML='<strong></strong><small></small>';label.querySelector('strong')!.textContent=item.name;label.querySelector('small')!.textContent=`持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;const quoted=this.quote?.item.makeIndex===item.makeIndex,keyPending=this.pending===item.makeIndex,unavailable=quoted&&this.quote!.price<0;const button=document.createElement('button');button.type='button';button.disabled=this.pending!==undefined||unavailable;button.textContent=keyPending?'等待服务端…':unavailable?'无需或无法修理':quoted?`修理 · ${this.quote!.price.toLocaleString('zh-CN')} 金币`:'询价';button.onclick=()=>this.begin(item,quoted);row.append(label,button);attachItemTooltip(row,item);list.append(row);}this.element.append(list);
 }
 private icon(item:InventoryItem){
  const national=this.nationalIcons?.frames[String(item.looks)],fallback=this.icons?.frames[String(item.looks)],frame=national??fallback;if(!frame)return undefined;
  const image=document.createElement('img');image.className='item-icon';image.src=national?`/ui-national/items/${national.file}`:`/items/Items/${frame.file}`;image.alt='';return image;
 }
}
