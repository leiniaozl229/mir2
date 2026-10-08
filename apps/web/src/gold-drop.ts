import type {SystemDialogInputRequest,SystemDialogInputResult} from './system-dialog';

export type GoldDropOptions={
 available:()=>boolean;
 prompt:(request:SystemDialogInputRequest)=>Promise<SystemDialogInputResult>;
 send:(amount:number)=>boolean;
 status:(text:string)=>void;
 amountOutput:HTMLElement;
 onPickup?:()=>void;
 onWorldDrop?:()=>void;
 timeoutMs?:number;
};

type PendingDrop={amount:number;before:number;timer:ReturnType<typeof setTimeout>};

/** The browser carries a UI token only; the gold value always comes from a server projection. */
export class GoldDropController {
 private gold=0;
 private moving=false;
 private pending:PendingDrop|undefined;
 private readonly cursor:HTMLDivElement;
 private readonly cursorAmount:HTMLSpanElement;
 private readonly removers:(()=>void)[]=[];
 private destroyed=false;
 private promptPending=false;
 private interactionGeneration=0;
 private worldPointer:number|undefined;

 constructor(private readonly trigger:HTMLElement,private readonly bag:HTMLElement,private readonly world:HTMLElement,private readonly options:GoldDropOptions){
  const document=trigger.ownerDocument;
  this.cursor=document.createElement('div');this.cursor.className='inventory-gold-cursor';this.cursor.hidden=true;this.cursor.setAttribute('aria-hidden','true');
  const coin=document.createElement('i');coin.className='inventory-gold-cursor-coin';coin.textContent='金';
  this.cursorAmount=document.createElement('span');this.cursor.append(coin,this.cursorAmount);document.body.append(this.cursor);
  this.listen(trigger,'click',()=>this.toggle());
  this.listen(bag,'click',event=>this.ignoreBagItem(event as MouseEvent),true);
  this.listen(bag,'dblclick',event=>this.ignoreBagItem(event as MouseEvent),true);
  this.listen(world,'pointerdown',event=>this.worldDown(event as PointerEvent),true);
  this.listen(world,'pointerup',event=>this.worldUp(event as PointerEvent),true);
  this.listen(document,'pointermove',event=>this.moveCursor(event as PointerEvent),true);
  this.listen(document,'keydown',event=>this.onKey(event as KeyboardEvent),true);
  this.listen(document,'pointercancel',event=>{const target=event.target as Node|null;if(target&&(target===document||this.trigger.contains(target)||this.bag.contains(target)||this.world.contains(target)))this.interrupt();},true);
  this.listen(document,'visibilitychange',()=>{if(document.hidden)this.interrupt();});
  const view=document.defaultView;if(view)this.listen(view,'blur',()=>this.interrupt());
  trigger.setAttribute('aria-grabbed','false');trigger.dataset.goldDropState='idle';
 }

 setGold(value:number){
  if(this.destroyed||!Number.isSafeInteger(value)||value<0)return;
  this.gold=value;this.options.amountOutput.textContent=value.toLocaleString('zh-CN');this.cursorAmount.textContent=value.toLocaleString('zh-CN');
  if(value<=1)this.cancelMoving();
  const pending=this.pending;if(!pending)return;
  this.clearPending();
  if(value===pending.before-pending.amount)this.options.status(`已丢弃 ${pending.amount.toLocaleString('zh-CN')} 金币`);
  else if(value===pending.before)this.options.status('服务器未确认金币减少，当前金币以服务器显示为准');
  else this.options.status('金币已按服务器数据更新，请核对丢弃结果');
 }

 serverMessage(text:string){if(this.pending)this.finishPending(`丢弃金币失败 · ${text}`);}
 rejected(text:string){if(this.pending)this.finishPending(`丢弃金币失败 · ${text}`);}
 cancelMoving(){this.worldPointer=undefined;if(!this.moving)return;this.moving=false;this.cursor.hidden=true;this.trigger.dataset.goldDropState='idle';this.trigger.setAttribute('aria-grabbed','false');}
 interrupt(){++this.interactionGeneration;this.promptPending=false;this.cancelMoving();if(this.pending)this.finishPending('金币丢弃结果未确认，已保持服务器显示的金额');}
 debugState(){return {gold:this.gold,moving:this.moving,promptPending:this.promptPending,pending:this.pending?{amount:this.pending.amount,before:this.pending.before}:undefined};}

 destroy(){if(this.destroyed)return;this.destroyed=true;this.interrupt();for(const remove of this.removers.splice(0))remove();this.cursor.remove();}

 private toggle(){
  if(this.destroyed)return;
  if(this.promptPending)return;
  if(this.moving){this.cancelMoving();this.options.status('已取消拿起金币');return;}
  if(this.pending){this.options.status('正在等待服务器确认金币变化');return;}
  if(!this.options.available())return;
  if(this.gold<=1){this.options.status('至少需要保留 1 枚金币');return;}
  this.options.onPickup?.();
  this.moving=true;this.trigger.dataset.goldDropState='moving';this.trigger.setAttribute('aria-grabbed','true');this.cursor.hidden=false;
  const rect=this.trigger.getBoundingClientRect();this.positionCursor(rect.left+rect.width/2,rect.top+rect.height/2);
  this.options.status('已拿起金币，点击地图后输入数量；再次点击金币可取消');
 }

 private ignoreBagItem(event:MouseEvent){
  if(!this.moving)return;
  const target=event.target as HTMLElement|null;if(!target||this.trigger.contains(target)||target.closest('[data-window-close],.inventory-item-tooltip'))return;
  // Native DItemGrid ignores carried gold; empty and occupied cells both retain it.
  event.preventDefault();event.stopImmediatePropagation();
 }

 private worldDown(event:PointerEvent){
  if(!this.moving)return;
  event.preventDefault();event.stopImmediatePropagation();
  this.worldPointer=event.button===0?event.pointerId:undefined;
 }

 private worldUp(event:PointerEvent){
  if(!this.moving||this.worldPointer!==event.pointerId||event.button!==0)return;
  event.preventDefault();event.stopImmediatePropagation();this.cancelMoving();
  if(!this.options.available())return;
  this.options.onWorldDrop?.();
  void this.askAmount();
 }

 private async askAmount(){
  if(this.promptPending||this.destroyed)return;
  const max=Math.min(65535,this.gold-1);if(max<1)return;
  const generation=this.interactionGeneration;this.promptPending=true;
  let result:SystemDialogInputResult;
  try{
   result=await this.options.prompt({
    text:'你想放下多少金币?',buttons:['ok'],size:'horizontal',
    input:{profile:'gold',label:`丢弃金币数量，最多 ${max}`,maxLength:5,inputMode:'numeric'}
   });
  }catch{
   if(!this.destroyed&&generation===this.interactionGeneration)this.options.status('金币数量窗口已中断，请重新操作');
   return;
  }finally{
   if(generation===this.interactionGeneration)this.promptPending=false;
  }
  if(this.destroyed||generation!==this.interactionGeneration)return;
  if(result.result!=='ok')return;
  const raw=result.value.trim();
  if(!/^\d{1,5}$/.test(raw)){this.options.status('请输入 1 到 65535 之间的整数金币数');return;}
  const amount=Number(raw),limit=Math.min(65535,this.gold-1);
  if(!Number.isSafeInteger(amount)||amount<1||amount>limit){this.options.status(`请输入 1 到 ${limit.toLocaleString('zh-CN')} 之间的金币数`);return;}
  if(!this.options.available()){this.options.status('连接已变化，金币请求未发送');return;}
  const before=this.gold;
  if(!this.options.send(amount)){this.options.status('金币请求未发送，请检查连接');return;}
  const timer=setTimeout(()=>{
   if(this.pending?.timer!==timer)return;
   this.pending=undefined;this.trigger.dataset.goldDropState='idle';this.options.status('服务器尚未确认金币变化，当前金额以服务器数据为准');
  },this.options.timeoutMs??8000);
  this.pending={amount,before,timer};this.trigger.dataset.goldDropState='pending';
  this.options.status(`正在等待服务器确认丢弃 ${amount.toLocaleString('zh-CN')} 金币`);
 }

 private finishPending(message:string){this.clearPending();this.trigger.dataset.goldDropState='idle';this.options.status(message);}
 private clearPending(){if(!this.pending)return;clearTimeout(this.pending.timer);this.pending=undefined;this.trigger.dataset.goldDropState='idle';}
 private onKey(event:KeyboardEvent){if(!this.moving||event.key!=='Escape')return;event.preventDefault();event.stopImmediatePropagation();this.cancelMoving();this.options.status('已取消拿起金币');}
 private moveCursor(event:PointerEvent){if(this.moving)this.positionCursor(event.clientX,event.clientY);}
 private positionCursor(x:number,y:number){this.cursor.style.left=`${x+10}px`;this.cursor.style.top=`${y+10}px`;}
 private listen(target:EventTarget,type:string,callback:EventListener,capture=false){target.addEventListener(type,callback,capture);this.removers.push(()=>target.removeEventListener(type,callback,capture));}
}
