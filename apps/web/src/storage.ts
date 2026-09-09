import type {InventoryItem} from './inventory';
import {attachItemTooltip,loadFallbackItemIcons} from './inventory';
import {loadNationalUiLibrary} from './classic-ui';

type StorageActions={store:(npcId:number,makeIndex:number)=>void;take:(npcId:number,makeIndex:number)=>void};

export class StorageView {
 private npcId:number|undefined;private mode:'store'|'take'='store';private items:InventoryItem[]=[];private pending:number|undefined;private pendingTimer:ReturnType<typeof setTimeout>|undefined;private icons:Awaited<ReturnType<typeof loadFallbackItemIcons>>|undefined;private nationalIcons:Awaited<ReturnType<typeof loadNationalUiLibrary>>|undefined;
 constructor(private element:HTMLElement,private actions:StorageActions){
  void loadFallbackItemIcons().then(icons=>{this.icons=icons;this.render();}).catch(()=>{});
  void loadNationalUiLibrary('items').then(icons=>{this.nationalIcons=icons;this.render();}).catch(()=>{});
 }
 clear(){this.clearPendingTimer();this.npcId=undefined;this.items=[];this.pending=undefined;this.element.hidden=true;this.element.replaceChildren();}
 rejectPending(){this.clearPendingTimer();this.pending=undefined;this.render();}
 openDeposit(npcId:number,items:InventoryItem[]){this.clearPendingTimer();this.npcId=npcId;this.mode='store';this.items=items;this.pending=undefined;this.render();}
 openItems(npcId:number,items:InventoryItem[]){this.clearPendingTimer();this.npcId=npcId;this.mode='take';this.items=items;this.pending=undefined;this.render();}
 resolve(item:InventoryItem,accepted:boolean){if(this.pending!==item.makeIndex)return false;this.clearPendingTimer();this.pending=undefined;if(accepted)this.items=this.items.filter(value=>value.makeIndex!==item.makeIndex);this.render();return true;}
 private clearPendingTimer(){if(this.pendingTimer!==undefined){clearTimeout(this.pendingTimer);this.pendingTimer=undefined;}}
 private render(){
  this.element.hidden=this.npcId===undefined;if(this.npcId===undefined)return;this.element.replaceChildren();
  const heading=document.createElement('div');heading.className='shop-heading';const title=document.createElement('strong');title.textContent=this.mode==='store'?'存入仓库':'仓库物品';const close=document.createElement('button');close.type='button';close.className='classic-window-close';close.textContent='关闭';close.onclick=()=>this.clear();heading.append(title,close);this.element.append(heading);
  const list=document.createElement('div');list.className=`storage-items storage-list--${this.mode}`;if(!this.items.length){list.textContent=this.mode==='store'?'背包为空':'仓库为空';this.element.append(list);return;}
  for(const item of this.items){const row=document.createElement('div');row.className='shop-row';row.dataset.storageItem=String(item.makeIndex);const icon=this.icon(item);if(icon)row.append(icon);const label=document.createElement('span');label.innerHTML='<strong></strong><small></small>';label.querySelector('strong')!.textContent=item.name;label.querySelector('small')!.textContent=`#${item.makeIndex} · 持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;const button=document.createElement('button');button.type='button';button.disabled=this.pending!==undefined;button.textContent=this.pending===item.makeIndex?'等待服务端…':this.mode==='store'?'存入':'取回';button.onclick=()=>{if(this.pending!==undefined)return;this.pending=item.makeIndex;this.clearPendingTimer();this.pendingTimer=setTimeout(()=>{this.pendingTimer=undefined;this.pending=undefined;this.render();},8000);this.render();if(this.mode==='store')this.actions.store(this.npcId!,item.makeIndex);else this.actions.take(this.npcId!,item.makeIndex);};row.append(label,button);attachItemTooltip(row,item);list.append(row);}this.element.append(list);
 }
 private icon(item:InventoryItem){
  const national=this.nationalIcons?.frames[String(item.looks)],fallback=this.icons?.frames[String(item.looks)],frame=national??fallback;if(!frame)return undefined;
  const image=document.createElement('img');image.className='item-icon';image.src=national?`/ui-national/items/${national.file}`:`/items/Items/${frame.file}`;image.alt='';return image;
 }
}
