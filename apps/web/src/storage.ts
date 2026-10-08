import type {InventoryItem} from './inventory';
import {attachItemTooltip} from './inventory';
import {SERVICE_UI,ServiceAssets,ServiceWait,cancelServiceWaitOnInputLoss,serviceButton,serviceHeading,serviceMenuHeaders,serviceMenuRow,serviceSlot,serviceStatus} from './service-window';
type StorageActions={store:(npcId:number,makeIndex:number)=>boolean|void;take:(npcId:number,makeIndex:number)=>boolean|void;close?:()=>void;afterClose?:(focusWasWithinWindow:boolean)=>void};

export class StorageView{
 private npcId:number|undefined;private mode:'store'|'take'='store';private items:InventoryItem[]=[];private selected:InventoryItem|undefined;private top=0;private message='';
 private readonly wait:ServiceWait;private readonly assets:ServiceAssets;
 constructor(private element:HTMLElement,private actions:StorageActions){this.wait=new ServiceWait(reason=>{if(reason)this.message=reason;this.render();});this.assets=new ServiceAssets(()=>this.render());cancelServiceWaitOnInputLoss(element,()=>{if(this.wait.current)this.rejectPending('操作已取消，请重试');});}
 clear(){this.wait.clear();this.npcId=undefined;this.items=[];this.selected=undefined;this.top=0;this.message='';this.element.hidden=true;this.element.replaceChildren();}
 rejectPending(reason='操作未完成，请重试',phase?:'store'|'take'){if(!this.wait.current||phase!==undefined&&this.wait.current.kind!==phase)return false;this.wait.clear();this.message=reason;this.render();return true;}
 openDeposit(npcId:number,items:InventoryItem[]){this.clear();this.npcId=npcId;this.mode='store';this.items=items.map(item=>({...item}));this.render();}
 openItems(npcId:number,items:InventoryItem[]){
  // SM_SENDUSERSTORAGEITEM carries cumulative pages; later pages must not cancel a take.
  if(this.npcId!==npcId||this.mode!=='take'){this.clear();this.npcId=npcId;this.mode='take';}
  this.items=items.map(item=>({...item}));if(this.selected)this.selected=this.items.find(item=>item.makeIndex===this.selected!.makeIndex);
  this.top=Math.min(this.top,Math.max(0,this.items.length-1));this.render();
 }
 acceptsInventoryItem(){return this.npcId!==undefined&&this.mode==='store'&&!this.wait.current;}
 offerInventoryItem(item:InventoryItem){if(!this.acceptsInventoryItem())return false;const actual=this.items.find(value=>value.makeIndex===item.makeIndex);if(!actual)return false;this.selected=actual;this.message='';this.render();return true;}
 syncInventory(items:InventoryItem[]){if(this.mode!=='store'||this.npcId===undefined)return;this.items=items.map(item=>({...item}));if(this.selected)this.selected=this.items.find(item=>item.makeIndex===this.selected!.makeIndex);this.render();}
 cancelSelection(){if(this.wait.current)return false;this.selected=undefined;this.message='';this.render();return true;}
 resolve(item:InventoryItem,accepted:boolean){if(!this.wait.matches(this.mode,item.makeIndex))return false;this.wait.clear();if(accepted){this.items=this.items.filter(value=>value.makeIndex!==item.makeIndex);this.selected=undefined;this.top=Math.min(this.top,Math.max(0,this.items.length-1));}this.message=accepted?(this.mode==='store'?'已存入':'已取回'):'操作失败，请重试';this.render();return true;}
 debugState(){return {npcId:this.npcId,mode:this.mode,selectedItem:this.selected?{...this.selected}:undefined,top:this.top,pending:this.wait.current?{...this.wait.current}:undefined,items:this.items.map(item=>({...item})),message:this.message};}
 private confirm(){const item=this.selected;if(!item||this.wait.current||this.npcId===undefined)return;this.message='';this.wait.start({kind:this.mode,makeIndex:item.makeIndex},()=>this.mode==='store'?this.actions.store(this.npcId!,item.makeIndex):this.actions.take(this.npcId!,item.makeIndex));}
 private render(){this.element.hidden=this.npcId===undefined;if(this.npcId===undefined)return;this.element.dataset.serviceMode=this.mode;this.assets.skin(this.element);this.element.replaceChildren();serviceHeading(this.element,this.mode==='store'?'存入仓库':'仓库物品',()=>{this.actions.close?.();this.clear();},focusWasWithinWindow=>this.actions.afterClose?.(focusWasWithinWindow));
  const pending=Boolean(this.wait.current);
  if(this.mode==='store'){const slot=serviceSlot(this.element,this.selected,this.assets,pending,()=>this.cancelSelection());slot.classList.add(`storage-list--${this.mode}`);if(this.selected)attachItemTooltip(slot,this.selected);const title=document.createElement('div');title.className='service-price';title.textContent='存放物品';this.element.append(title,serviceButton('确认存入','confirm',pending||!this.selected,()=>this.confirm()));serviceStatus(this.element,pending?'等待服务端…':this.message||'从背包放入物品');return;}
  serviceMenuHeaders(this.element,['仓库物品','持久','']);const list=document.createElement('div');list.className=`service-menu-list storage-list--${this.mode}`;list.setAttribute('role','listbox');list.setAttribute('aria-label','仓库物品');
  for(const item of this.items.slice(this.top,this.top+SERVICE_UI.menu.list.visible)){const row=serviceMenuRow([item.name,`${Math.floor(item.durability/1000)}/${Math.floor(item.maxDurability/1000)}`,''],this.selected?.makeIndex===item.makeIndex,pending,()=>{this.selected=item;this.message='';this.render();});row.dataset.storageItem=String(item.makeIndex);attachItemTooltip(row,item);list.append(row);}this.element.append(list);
  this.element.append(serviceButton('上一页','previous',pending||this.top===0,()=>{this.top=Math.max(0,this.top-SERVICE_UI.menu.localPageStep);this.render();}),serviceButton('下一页','next',pending||this.top+SERVICE_UI.menu.list.visible>=this.items.length,()=>{this.top+=SERVICE_UI.menu.localPageStep;this.render();}),serviceButton('确认取回','confirm',pending||!this.selected,()=>this.confirm()));serviceStatus(this.element,pending?'等待服务端…':this.message||(!this.items.length?'仓库为空':'请选择物品'));}
}
