import type {InventoryItem} from './inventory';
import {loadFallbackItemIcons} from './inventory';
import {loadNationalUiLibrary} from './classic-ui';

export type ShopGoods={name:string;subMenu:number;price:number;stock:number;looks?:number};
export type ShopDetail={name:string;makeIndex:number;price:number;durability:number;stdMode:number;weight:number;looks:number};

type ShopActions={details:(npcId:number,name:string,page:number)=>void;buy:(npcId:number,name:string,makeIndex?:number)=>void;quote:(npcId:number,makeIndex:number)=>void;sell:(npcId:number,makeIndex:number)=>void};

export class ShopView {
 private npcId:number|undefined;private goods:ShopGoods[]=[];private details:ShopDetail[]=[];private sellItems:InventoryItem[]=[];private quote:{item:InventoryItem;price:number}|undefined;private mode:'buy'|'sell'='buy';private pending:string|undefined;private icons:Awaited<ReturnType<typeof loadFallbackItemIcons>>|undefined;private nationalIcons:Awaited<ReturnType<typeof loadNationalUiLibrary>>|undefined;
 constructor(private element:HTMLElement,private actions:ShopActions){
  void loadFallbackItemIcons().then(icons=>{this.icons=icons;this.render();}).catch(()=>{});
  void loadNationalUiLibrary('items').then(icons=>{this.nationalIcons=icons;this.render();}).catch(()=>{});
 }
 clear(){this.npcId=undefined;this.goods=[];this.details=[];this.sellItems=[];this.quote=undefined;this.pending=undefined;this.element.hidden=true;this.element.replaceChildren();}
 open(npcId:number,goods:ShopGoods[]){this.npcId=npcId;this.mode='buy';this.goods=goods;this.details=[];this.sellItems=[];this.quote=undefined;this.pending=undefined;this.render();}
 openSell(npcId:number,items:InventoryItem[]){this.npcId=npcId;this.mode='sell';this.goods=[];this.details=[];this.sellItems=items;this.quote=undefined;this.pending=undefined;this.render();}
 showDetails(npcId:number,details:ShopDetail[]){if(this.npcId!==npcId)return;this.details=details;this.pending=undefined;this.render();}
 resolve(name:string,makeIndex:number,accepted:boolean){
  this.pending=undefined;
  if(accepted){const goods=this.goods.find(item=>item.name===name);if(goods)goods.stock=Math.max(0,goods.stock-1);if(makeIndex)this.details=this.details.filter(item=>item.makeIndex!==makeIndex);}
  this.render();
 }
 showSellQuote(npcId:number,item:InventoryItem,price:number){if(this.npcId!==npcId||this.mode!=='sell')return;this.quote={item,price};this.pending=undefined;this.render();}
 resolveSale(item:InventoryItem,accepted:boolean){this.pending=undefined;this.quote=undefined;if(accepted)this.sellItems=this.sellItems.filter(value=>value.makeIndex!==item.makeIndex);this.render();}
 private begin(key:string,action:()=>void){if(this.pending)return;this.pending=key;this.render();action();}
 private render(){
  this.element.hidden=this.npcId===undefined;if(this.npcId===undefined)return;this.element.replaceChildren();
  const heading=document.createElement('div');heading.className='shop-heading';const title=document.createElement('strong');title.textContent=this.mode==='buy'?'商店':'出售物品';const close=document.createElement('button');close.type='button';close.className='classic-window-close';close.textContent='关闭';close.onclick=()=>this.clear();heading.append(title,close);this.element.append(heading);
  if(this.mode==='sell'){this.renderSell();return;}
  const list=document.createElement('div');list.className='shop-goods';
  if(!this.goods.length){list.textContent='当前没有商品';this.element.append(list);return;}
  for(const item of this.goods){
   const row=document.createElement('div');row.className='shop-row';row.dataset.shopItem=item.name;
   const label=document.createElement('span');label.innerHTML=`<strong></strong><small></small>`;label.querySelector('strong')!.textContent=item.name;label.querySelector('small')!.textContent=`${item.price.toLocaleString('zh-CN')} 金币 · 库存 ${item.stock}`;
   const icon=this.icon(item);if(icon)row.append(icon);
   const button=document.createElement('button');button.type='button';const key=`goods:${item.name}`;button.disabled=Boolean(this.pending)||item.stock<=0;button.textContent=this.pending===key?'等待服务端…':item.subMenu===1?'选择成色':'购买';
   button.onclick=()=>this.begin(key,()=>item.subMenu===1?this.actions.details(this.npcId!,item.name,0):this.actions.buy(this.npcId!,item.name));row.append(label,button);list.append(row);
  }
  this.element.append(list);
  if(this.details.length){
   const detailHeading=document.createElement('h3');detailHeading.textContent=`${this.details[0].name} · 具体物品`;const detailList=document.createElement('div');detailList.className='shop-details';
   for(const item of this.details){const row=document.createElement('div');row.className='shop-row';row.dataset.shopDetail=String(item.makeIndex);const icon=this.icon(item);if(icon)row.append(icon);const label=document.createElement('span');label.innerHTML='<strong></strong><small></small>';label.querySelector('strong')!.textContent=`${item.name} #${item.makeIndex}`;label.querySelector('small')!.textContent=`${item.price.toLocaleString('zh-CN')} 金币 · 持久 ${(item.durability/1000).toFixed(1)}`;const button=document.createElement('button');button.type='button';const key=`detail:${item.makeIndex}`;button.disabled=Boolean(this.pending);button.textContent=this.pending===key?'等待服务端…':'购买';button.onclick=()=>this.begin(key,()=>this.actions.buy(this.npcId!,item.name,item.makeIndex));row.append(label,button);detailList.append(row);}this.element.append(detailHeading,detailList);
  }
 }
 private renderSell(){
  const list=document.createElement('div');list.className='shop-goods';if(!this.sellItems.length){list.textContent='背包中没有可出售物品';this.element.append(list);return;}
  for(const item of this.sellItems){const row=document.createElement('div');row.className='shop-row';row.dataset.sellItem=String(item.makeIndex);const icon=this.icon(item);if(icon)row.append(icon);const label=document.createElement('span');label.innerHTML='<strong></strong><small></small>';label.querySelector('strong')!.textContent=item.name;label.querySelector('small')!.textContent=`持久 ${(item.durability/1000).toFixed(1)} / ${(item.maxDurability/1000).toFixed(1)}`;const button=document.createElement('button');button.type='button';const quoted=this.quote?.item.makeIndex===item.makeIndex,key=`sell:${item.makeIndex}`,unsellable=quoted&&this.quote!.price<=0;button.disabled=Boolean(this.pending)||unsellable;button.textContent=this.pending===key?'等待服务端…':unsellable?'无法出售':quoted?`卖出 · ${this.quote!.price.toLocaleString('zh-CN')} 金币`:'询价';button.onclick=()=>this.begin(key,()=>quoted?this.actions.sell(this.npcId!,item.makeIndex):this.actions.quote(this.npcId!,item.makeIndex));row.append(label,button);list.append(row);}this.element.append(list);
 }
 private icon(item:{name:string;looks?:number}){
  if(item.looks===undefined)return undefined;
  const national=this.nationalIcons?.frames[String(item.looks)],fallback=this.icons?.frames[String(item.looks)],frame=national??fallback;
  if(!frame)return undefined;
  const image=document.createElement('img');image.className='item-icon';image.src=national?`/ui-national/items/${national.file}`:`/items/Items/${frame.file}`;image.alt='';return image;
 }
}
