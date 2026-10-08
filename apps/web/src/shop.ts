import type {InventoryItem} from './inventory';
import {attachItemTooltip} from './inventory';
import {SERVICE_UI,ServiceAssets,ServiceWait,cancelServiceWaitOnInputLoss,serviceButton,serviceHeading,serviceItemChanged,serviceMenuHeaders,serviceMenuRow,serviceSlot,serviceStatus} from './service-window';

export type ShopGoods={name:string;subMenu:number;price:number;stock:number;looks?:number};
export type ShopDetail={name:string;makeIndex:number;price:number;durability:number;stdMode:number;weight:number;looks:number;item?:InventoryItem};
type ShopActions={details:(npcId:number,name:string,page:number)=>boolean|void;buy:(npcId:number,name:string,makeIndex?:number)=>boolean|void;quote:(npcId:number,makeIndex:number)=>boolean|void;sell:(npcId:number,makeIndex:number)=>boolean|void;close?:()=>void;afterClose?:(focusWasWithinWindow:boolean)=>void};
type ShopInventoryInteraction={reserve:(makeIndex:number,reserved:boolean)=>boolean;hold:(makeIndex:number,clientX:number,clientY:number)=>boolean};

/** Native menu and a separate single-item sell slot; no economic changes before confirmation. */
export class ShopView{
 private npcId:number|undefined;private mode:'buy'|'sell'='buy';private goods:ShopGoods[]=[];private details:ShopDetail[]|undefined;
 private sellItems:InventoryItem[]=[];private selectedName:string|undefined;private selectedIndex:number|undefined;private selectedItem:InventoryItem|undefined;
 private quote:{item:InventoryItem;price:number}|undefined;private top=0;private detailName:string|undefined;private detailPage=0;private detailPageFull=false;private message='';private inventoryInteraction:ShopInventoryInteraction|undefined;
 private readonly wait:ServiceWait;private readonly assets:ServiceAssets;
 constructor(private element:HTMLElement,private actions:ShopActions){
  this.wait=new ServiceWait(reason=>{if(reason){this.message=reason;this.quote=undefined;}this.render();});
  this.assets=new ServiceAssets(()=>this.render());cancelServiceWaitOnInputLoss(element,()=>{if(this.wait.current)this.rejectPending('操作已取消，请重试');});
 }
 clear(){if(this.selectedItem)this.inventoryInteraction?.reserve(this.selectedItem.makeIndex,false);this.wait.clear();this.npcId=undefined;this.goods=[];this.details=undefined;this.sellItems=[];this.quote=undefined;this.selectedItem=undefined;this.selectedName=undefined;this.selectedIndex=undefined;this.detailName=undefined;this.top=0;this.detailPage=0;this.detailPageFull=false;this.message='';this.element.hidden=true;this.element.replaceChildren();}
 setInventoryInteraction(interaction:ShopInventoryInteraction){this.inventoryInteraction=interaction;if(this.selectedItem)this.inventoryInteraction.reserve(this.selectedItem.makeIndex,true);}
 itemInServiceSlot(){return this.mode==='sell'&&this.selectedItem?{...this.selectedItem}:undefined;}
 rejectPending(reason='操作未完成，请重试',phase?:'details'|'purchase'|'quote'|'sale'){if(!this.wait.current||phase!==undefined&&this.wait.current.kind!==phase)return false;this.wait.clear();this.quote=undefined;this.message=reason;this.render();return true;}
 open(npcId:number,goods:ShopGoods[]){this.clear();this.npcId=npcId;this.mode='buy';this.goods=goods.map(item=>({...item}));this.render();}
 openSell(npcId:number,items:InventoryItem[]){this.clear();this.npcId=npcId;this.mode='sell';this.sellItems=items.map(item=>({...item}));this.render();}
 acceptsInventoryItem(){return this.npcId!==undefined&&this.mode==='sell'&&!this.wait.current;}
 offerInventoryItem(item:InventoryItem){
  if(!this.acceptsInventoryItem())return false;const actual=this.sellItems.find(value=>value.makeIndex===item.makeIndex);if(!actual)return false;
  const previous=this.selectedItem,quote=this.quote;this.selectedItem=actual;this.quote=undefined;this.message='';
  if(previous?.makeIndex!==actual.makeIndex&&this.inventoryInteraction&&!this.inventoryInteraction.reserve(actual.makeIndex,true)){this.selectedItem=previous;this.quote=quote;this.render();return false;}
  const sent=this.wait.start({kind:'quote',makeIndex:actual.makeIndex},()=>this.actions.quote(this.npcId!,actual.makeIndex));
  if(!sent){if(previous?.makeIndex!==actual.makeIndex)this.inventoryInteraction?.reserve(actual.makeIndex,false);this.selectedItem=previous;this.quote=quote;this.render();return false;}
  if(previous&&previous.makeIndex!==actual.makeIndex)this.inventoryInteraction?.reserve(previous.makeIndex,false);return true;
 }
 syncInventory(items:InventoryItem[]){
  if(this.mode!=='sell'||this.npcId===undefined)return;this.sellItems=items.map(item=>({...item}));
  if(this.selectedItem){const item=this.sellItems.find(value=>value.makeIndex===this.selectedItem!.makeIndex);
   if(!item){this.inventoryInteraction?.reserve(this.selectedItem.makeIndex,false);this.selectedItem=undefined;this.quote=undefined;if(this.wait.current?.kind==='quote')this.wait.clear();}
   else{if(serviceItemChanged(this.selectedItem,item)){this.quote=undefined;if(this.wait.current?.kind==='quote')this.wait.clear();}this.selectedItem=item;}}
  this.render();
 }
 cancelSelection(){if(this.wait.current)return false;if(this.selectedItem)this.inventoryInteraction?.reserve(this.selectedItem.makeIndex,false);this.selectedItem=undefined;this.quote=undefined;this.message='';this.render();return true;}
 showDetails(npcId:number,details:ShopDetail[],page?:number,name?:string){
  const request=this.wait.current;
  if(this.npcId!==npcId||this.mode!=='buy'||request?.kind!=='details'||page!==undefined&&request.page!==page||name!==undefined&&request.name!==name||details.some(item=>item.name!==request.name))return false;
  this.wait.clear();this.details=details.map(item=>({...item}));this.detailName=request.name;this.detailPage=request.page??0;this.detailPageFull=details.length===SERVICE_UI.menu.list.visible;this.selectedIndex=undefined;
  this.message=this.details.length?'请选择成色，再按确定':this.detailPage?'这一页没有商品':'当前没有该商品';this.render();return true;
 }
 showSellQuote(npcId:number,item:InventoryItem,price:number){
  if(this.npcId!==npcId||this.mode!=='sell'||!this.wait.matches('quote',item.makeIndex)||this.selectedItem?.makeIndex!==item.makeIndex)return false;
  this.wait.clear();this.quote={item:{...this.selectedItem},price};this.message=price>0?'确认卖出此物品':'此物品无法出售';this.render();return true;
 }
 resolve(name:string,makeIndex:number|undefined,accepted:boolean){
  const request=this.wait.current;if(request?.kind!=='purchase'||request.name!==name||(request.makeIndex??0)!==(makeIndex??0))return false;
  this.wait.clear();if(accepted){const item=this.goods.find(value=>value.name===name);if(item)item.stock=Math.max(0,item.stock-1);if(makeIndex&&this.details)this.details=this.details.filter(value=>value.makeIndex!==makeIndex);this.selectedIndex=undefined;}
  this.message=accepted?'购买成功':'购买失败，请重试';this.render();return true;
 }
 resolveSale(item:InventoryItem,accepted:boolean){
  if(!this.wait.matches('sale',item.makeIndex))return false;this.wait.clear();this.quote=undefined;
  if(accepted){this.inventoryInteraction?.reserve(item.makeIndex,false);this.sellItems=this.sellItems.filter(value=>value.makeIndex!==item.makeIndex);this.selectedItem=undefined;}
  this.message=accepted?'出售成功':'出售失败，请重新询价';this.render();return true;
 }
 debugState(){return {npcId:this.npcId,mode:this.mode,top:this.top,detailPage:this.detailPage,detailPageFull:this.detailPageFull,detailName:this.detailName,selectedName:this.selectedName,selectedIndex:this.selectedIndex,selectedItem:this.selectedItem?{...this.selectedItem}:undefined,quote:this.quote?{item:{...this.quote.item},price:this.quote.price}:undefined,pending:this.wait.current?{...this.wait.current}:undefined,goods:this.goods.map(item=>({...item})),details:this.details?.map(item=>({...item})),message:this.message};}
 private requestDetails(name:string,page:number){if(page<0||page>65535)return false;this.message='';return this.wait.start({kind:'details',name,page},()=>this.actions.details(this.npcId!,name,page));}
 private confirm(){
  if(this.npcId===undefined||this.wait.current)return;
  if(this.mode==='sell'){
   const item=this.selectedItem;if(!item)return;
   if(!this.quote){this.offerInventoryItem(item);return;}
   if(this.quote.item.makeIndex!==item.makeIndex||this.quote.price<=0)return;
   this.message='';this.wait.start({kind:'sale',makeIndex:item.makeIndex},()=>this.actions.sell(this.npcId!,item.makeIndex));return;
  }
  if(this.details!==undefined){const item=this.details.find(value=>value.makeIndex===this.selectedIndex);if(!item)return;this.message='';this.wait.start({kind:'purchase',name:item.name,makeIndex:item.makeIndex},()=>this.actions.buy(this.npcId!,item.name,item.makeIndex));return;}
  const item=this.goods.find(value=>value.name===this.selectedName);if(!item||item.stock<=0)return;
  if(item.subMenu>0){this.requestDetails(item.name,0);return;}
  this.message='';this.wait.start({kind:'purchase',name:item.name,makeIndex:0},()=>this.actions.buy(this.npcId!,item.name));
 }
 private render(){
  this.element.hidden=this.npcId===undefined;if(this.npcId===undefined)return;this.element.dataset.serviceMode=this.mode;this.assets.skin(this.element);this.element.replaceChildren();
  serviceHeading(this.element,this.mode==='sell'?'出售物品':'商店',()=>{this.actions.close?.();this.clear();},focusWasWithinWindow=>this.actions.afterClose?.(focusWasWithinWindow));
  if(this.mode==='sell'){this.renderSell();return;}
  serviceMenuHeaders(this.element,['商品','价格','持久']);const list=document.createElement('div');list.className=`service-menu-list shop-list--${this.mode}`;list.setAttribute('role','listbox');list.setAttribute('aria-label',this.details!==undefined?'具体商品成色':'商品目录');
  const pending=Boolean(this.wait.current),items=this.details??this.goods.slice(this.top,this.top+SERVICE_UI.menu.list.visible);
  for(const item of items){const detail='makeIndex' in item;
   const row=serviceMenuRow([`${item.name}${!detail&&item.subMenu>0?' ›':''}`,String(item.price),detail?String(Math.floor(item.durability/1000)):'—'],detail?item.makeIndex===this.selectedIndex:item.name===this.selectedName,pending,()=>{if(detail)this.selectedIndex=item.makeIndex;else this.selectedName=item.name;this.message='';this.render();});
   if(detail){row.dataset.shopDetail=String(item.makeIndex);attachItemTooltip(row,item.item??{...item,maxDurability:0},`${item.name} #${item.makeIndex}`);}else row.dataset.shopItem=item.name;
   list.append(row);
  }
  this.element.append(list);
  const inDetails=this.details!==undefined,previous=inDetails?this.detailPage>0:this.top>0,next=inDetails?this.detailPageFull&&this.detailPage<=65535-SERVICE_UI.menu.detailPageStep:this.top+SERVICE_UI.menu.list.visible<this.goods.length;
  const selected=inDetails?Boolean(this.details!.some(item=>item.makeIndex===this.selectedIndex)):Boolean(this.goods.some(item=>item.name===this.selectedName&&item.stock>0));
  this.element.append(serviceButton('上一页','previous',pending||!previous,()=>{if(inDetails)this.requestDetails(this.detailName!,Math.max(0,this.detailPage-SERVICE_UI.menu.detailPageStep));else{this.top=Math.max(0,this.top-SERVICE_UI.menu.localPageStep);this.render();}}),serviceButton('下一页','next',pending||!next,()=>{if(inDetails)this.requestDetails(this.detailName!,this.detailPage+SERVICE_UI.menu.detailPageStep);else{this.top+=SERVICE_UI.menu.localPageStep;this.render();}}),serviceButton(inDetails?'购买所选物品':'确定所选商品','confirm',pending||!selected,()=>this.confirm()));
  if(inDetails){const back=document.createElement('button');back.type='button';back.className='service-return';back.textContent='返回商品目录';back.disabled=pending;back.onclick=()=>{if(this.wait.current)return;this.details=undefined;this.detailName=undefined;this.detailPageFull=false;this.selectedIndex=undefined;this.message='';this.render();};this.element.append(back);}
  serviceStatus(this.element,pending?'等待服务端…':this.message||(!items.length?'当前没有商品':'请选择商品'));
 }
 private renderSell(){
  const pending=Boolean(this.wait.current),slot=serviceSlot(this.element,this.selectedItem,this.assets,pending,event=>this.takeSellSlotItem(event));if(this.selectedItem)attachItemTooltip(slot,this.selectedItem);
  const price=document.createElement('div');price.className='service-price';price.textContent=this.quote?`价格：${this.quote.price>0?this.quote.price:'—'}`:'出售物品';this.element.append(price);
  const unavailable=this.quote!==undefined&&this.quote.price<=0;
  this.element.append(serviceButton(this.quote?'确认出售':'查询价格','confirm',pending||!this.selectedItem||unavailable,()=>this.confirm()));
  serviceStatus(this.element,pending?'等待服务端…':this.message||'从背包放入物品');
 }
 private takeSellSlotItem(event:MouseEvent){
  const item=this.selectedItem;if(!item||this.wait.current){this.cancelSelection();return;}
  const hand=this.inventoryInteraction?.hold(item.makeIndex,event.clientX,event.clientY);
  if(hand===undefined){this.cancelSelection();return;}if(!hand)return;
  this.inventoryInteraction?.reserve(item.makeIndex,false);this.selectedItem=undefined;this.quote=undefined;this.message='物品已拿起';this.render();
 }
}
