import {applyNationalUiFrame,loadClassicUiSession,retryClassicUiSession,type ClassicUiSession,type Frame} from './classic-ui';
import {bringClassicWindowToFront,makeClassicWindowDraggable} from './window-drag';
import systemDialogContract from '../../../content/classic-176/system-dialog.json';
import './system-dialog.css';

export type SystemDialogButton='ok'|'yes'|'cancel'|'no';
export type SystemDialogResult=SystemDialogButton|'interrupted';
export type SystemDialogSize='horizontal'|'vertical'|'small';
export type SystemDialogRequest={text:string;buttons:readonly SystemDialogButton[];size?:SystemDialogSize;policy?:'queue'|'replace';restoreFocus?:HTMLElement|null};
export type SystemDialogInputRequest=SystemDialogRequest&{input:{label:string;maxLength:number;value?:string;inputMode?:'numeric'|'text';profile?:'gold'}};
export type SystemDialogInputResult={result:SystemDialogResult;value:string};
export type SystemDialogOptions={loadSession?:()=>Promise<ClassicUiSession>;retrySession?:()=>Promise<ClassicUiSession>;onVisibilityChange?:(active:boolean)=>void};
type Variant={frame:number;width:number;height:number;text:{left:number;top:number;width:number;height:number};input?:{left:number;top:number;width:number;height:number};buttonBase:{left:number;top:number};buttonSpacing:number;buttonPositionsByCount:Record<string,{left:number;top:number}[]>;maxButtons?:number;fallbackSizeForOverflow?:SystemDialogSize};
type ButtonSpec={normalFrame:number;pressedFrame:number;width:number;height:number};
type Typography={familyCandidates:string[];fallback:string;cssPixelSize:number;lineHeight:number;color:string;shadow:string};
type InputProfile={input:{left:number;top:number;width:number;height:number;background:string;color:string;border:string;padding:string;fontFamily:string;fontSize:number;lineHeight:number};typography:Typography};
type Contract={family:string;canvas:{width:number;height:number};frames:Record<string,Frame>;variants:Record<SystemDialogSize,Variant>;buttons:Record<SystemDialogButton,ButtonSpec>;typography:Typography;inputProfiles:Record<'gold',InputProfile>;sourceSha256?:string;indexSha256?:string};
type Waiting={id:number;request:SystemDialogRequest;resolve:(result:SystemDialogResult)=>void;input?:HTMLInputElement;inputProfile?:'gold'};
type ButtonState={element:HTMLButtonElement;result:SystemDialogButton;entry:Waiting;pressed:boolean;assetEpoch:number;ignoreClick:boolean};
type Press={state:ButtonState;pointerId:number;inside:boolean};
const contract=systemDialogContract as Contract;
const resultOrder:readonly SystemDialogButton[]=['ok','yes','no','cancel'];
const labels:Record<SystemDialogButton,string>={ok:'确定',yes:'确定',cancel:'取消',no:'取消'};

/** Explicit results are local UI decisions, never an NPC, transaction or protocol acknowledgement. */
export class SystemDialogController {
 private readonly document:Document;
 private readonly overlay:HTMLDivElement;
 private readonly panel:HTMLElement;
 private readonly text:HTMLDivElement;
 private activeInput:HTMLInputElement|undefined;
 private readonly resourceStatus:HTMLDivElement;
 private readonly retry:HTMLButtonElement;
 private readonly removers:(()=>void)[]=[];
 private readonly handledKeys=new WeakSet<Event>();
 private readonly imageCache=new Map<string,Promise<void>>();
 private active:Waiting|undefined;
 private readonly queue:Waiting[]=[];
 private buttons:ButtonState[]=[];
 private serial=0;
 private skinEpoch=0;
 private session:ClassicUiSession|undefined;
 private restoreTarget:HTMLElement|null=null;
 private press:Press|undefined;
 private composing=false;
 private keyboardClickBlocked=false;
 private destroyed=false;

 constructor(layer:HTMLElement,surface:HTMLElement,private readonly options:SystemDialogOptions={}){
  this.document=layer.ownerDocument;
  this.overlay=this.document.createElement('div');this.overlay.className='classic-system-dialog-overlay';this.overlay.hidden=true;
  this.overlay.dataset.systemDialogOverlay='true';
  this.panel=this.document.createElement('section');this.panel.className='classic-system-dialog';this.panel.tabIndex=-1;
  this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-modal','true');this.panel.setAttribute('aria-label','系统提示');
  const handle=this.document.createElement('div');handle.className='system-dialog-drag-handle';handle.dataset.windowDragHandle='true';handle.setAttribute('aria-hidden','true');
  this.text=this.document.createElement('div');this.text.className='system-dialog-text';this.text.id=`system-dialog-text-${++SystemDialogController.nextId}`;
  Object.assign(this.text.style,{fontFamily:[...contract.typography.familyCandidates.map(name=>`"${name}"`),contract.typography.fallback].join(','),fontSize:`${contract.typography.cssPixelSize}px`,lineHeight:`${contract.typography.lineHeight}px`,color:contract.typography.color,textShadow:`1px 1px ${contract.typography.shadow}`});
  this.panel.setAttribute('aria-describedby',this.text.id);
  this.resourceStatus=this.document.createElement('div');this.resourceStatus.className='system-dialog-resource-status';this.resourceStatus.setAttribute('role','status');
  this.retry=this.document.createElement('button');this.retry.type='button';this.retry.className='system-dialog-retry';this.retry.textContent='重试界面';this.retry.hidden=true;
  this.panel.append(handle,this.text,this.resourceStatus,this.retry);this.overlay.append(this.panel);layer.append(this.overlay);
  makeClassicWindowDraggable(this.panel,surface);
  this.listen(this.retry,'click',()=>{const current=this.active;if(current)void this.loadSkin(current,true);});
  this.listen(this.document,'keydown',event=>this.interceptKey(event as KeyboardEvent),true);
  this.listen(this.document,'keyup',event=>{if(this.active){event.stopImmediatePropagation();if(!(event as KeyboardEvent).isComposing&&(event as KeyboardEvent).keyCode!==229)event.preventDefault();}},true);
  this.listen(this.document,'compositionstart',()=>{if(this.active)this.composing=true;},true);
  this.listen(this.document,'compositionend',()=>{this.composing=false;},true);
  this.listen(this.document,'focusin',event=>{if(this.active&&!this.panel.contains(event.target as Node))this.focusFirst();},true);
  const view=this.document.defaultView;
  if(view)this.listen(view,'blur',()=>{this.composing=false;this.cancelPress();this.cancelDrag();});
  this.listen(this.overlay,'pointerdown',event=>{if(event.target===this.overlay){event.preventDefault();this.focusFirst();}});
 }
 private static nextId=0;

 isOpen(){return Boolean(this.active);}

 show(request:SystemDialogRequest):Promise<SystemDialogResult>{
  return this.enqueue(request);
 }

 showInput(request:SystemDialogInputRequest):Promise<SystemDialogInputResult>{
  if(request.input.profile!==undefined&&request.input.profile!=='gold')throw new Error('输入提示样式无效');
  if(request.input.profile==='gold'){if(request.buttons.length!==1||request.buttons[0]!=='ok')throw new Error('金币输入提示只提供确定');}
  else if(!request.buttons.includes('ok')||!request.buttons.includes('cancel'))throw new Error('输入提示必须提供确定和取消');
  if((request.size??'horizontal')!=='horizontal')throw new Error('输入提示尺寸无效');
  if(!Number.isInteger(request.input.maxLength)||request.input.maxLength<1||request.input.maxLength>64)throw new Error('输入提示长度无效');
  const input=this.document.createElement('input');input.type='text';input.className='system-dialog-input';input.value=request.input.value??'';
  input.maxLength=request.input.maxLength;input.inputMode=request.input.inputMode??'text';input.autocomplete='off';input.setAttribute('aria-label',request.input.label);
  return this.enqueue(request,result=>({result,value:input.value}),input,request.input.profile);
 }

 private enqueue<T=SystemDialogResult>(request:SystemDialogRequest,mapResult:(result:SystemDialogResult)=>T=(result=>result as T),input?:HTMLInputElement,inputProfile?:'gold'):Promise<T>{
  if(this.destroyed)return Promise.resolve(mapResult('interrupted'));
  const buttons=resultOrder.filter(result=>request.buttons.includes(result));
  if(!buttons.length||buttons.length!==request.buttons.length)throw new Error('系统提示按钮无效');
  if(request.size&&!Object.prototype.hasOwnProperty.call(contract.variants,request.size))throw new Error('系统提示尺寸无效');
  const normalized={...request,text:String(request.text),buttons:[...buttons]};
  return new Promise<T>(resolve=>{
   const entry:Waiting={id:++this.serial,request:normalized,resolve:result=>resolve(mapResult(result)),input,inputProfile};
   if(!this.active){this.restoreTarget=request.restoreFocus===undefined?this.focusElement():request.restoreFocus;this.start(entry);return;}
   if(request.policy==='replace'){
    const old=this.active;this.active=undefined;old.resolve('interrupted');
    for(const waiting of this.queue.splice(0))waiting.resolve('interrupted');
    if(request.restoreFocus!==undefined)this.restoreTarget=request.restoreFocus;
    this.start(entry);return;
   }
   this.queue.push(entry);
  });
 }

 /** Invoke before any gameplay key route. Composition keeps its browser editing default. */
 interceptKey(event:KeyboardEvent){
  if(this.handledKeys.has(event))return true;
  if(!this.active)return false;
  this.handledKeys.add(event);event.stopImmediatePropagation();
  if(event.key==='Enter'||event.key===' ')this.keyboardClickBlocked=true;
  if(this.composing||event.isComposing||event.keyCode===229)return true;
  // Keep editing defaults while capture prevents the same keys reaching world input.
  if(this.activeInput&&this.document.activeElement===this.activeInput&&!['Enter','Escape','Tab'].includes(event.key))return true;
  event.preventDefault();
  if(event.key==='Tab'){this.cycleFocus(event.shiftKey);return true;}
  if(event.repeat||event.ctrlKey||event.altKey||event.metaKey)return true;
  if(event.key==='Escape'&&this.active.request.buttons.includes('cancel'))this.complete(this.active,'cancel');
  else if(event.key==='Enter'&&this.active.input&&this.document.activeElement===this.active.input)this.complete(this.active,'ok');
  else if(event.key==='Enter'&&this.active.request.buttons.length===1){
   const result=this.active.request.buttons[0];if(result==='ok'||result==='yes')this.complete(this.active,result);
  }
  return true;
 }

 /** Map/death/disconnect/scene changes must interrupt decisions rather than manufacture Cancel. */
 interrupt(){
  if(!this.active&&!this.queue.length)return;
  const old=this.active;this.active=undefined;
  old?.resolve('interrupted');for(const waiting of this.queue.splice(0))waiting.resolve('interrupted');
  this.hide();
 }

 destroy(){
  if(this.destroyed)return;
  this.interrupt();this.destroyed=true;++this.skinEpoch;
  for(const remove of this.removers.splice(0))remove();
  this.overlay.remove();this.imageCache.clear();
 }

 private start(entry:Waiting){
  this.cancelPress();this.cancelDrag();++this.skinEpoch;this.active=entry;this.composing=false;this.keyboardClickBlocked=false;this.session=undefined;
  this.activeInput?.remove();this.activeInput=entry.input;
  for(const state of this.buttons)state.element.remove();this.buttons=[];
  this.overlay.hidden=false;this.panel.dataset.dialogId=String(entry.id);this.text.textContent=entry.request.text;
  this.panel.dataset.inputProfile=entry.inputProfile??'';
  const profile=entry.inputProfile?contract.inputProfiles[entry.inputProfile]:undefined,typography=profile?.typography??contract.typography;
  Object.assign(this.text.style,{fontFamily:[...typography.familyCandidates.map(name=>`"${name}"`),typography.fallback].join(','),fontSize:`${typography.cssPixelSize}px`,lineHeight:`${typography.lineHeight}px`,color:typography.color,textShadow:`1px 1px ${typography.shadow}`});
  const size=this.layout(entry.request);this.panel.dataset.dialogSize=size;
  if(entry.input){const variant=contract.variants[size],position=profile?.input??variant.input;if(!position)throw new Error('输入提示布局缺失');this.text.style.height=`${Math.max(14,position.top-variant.text.top-8)}px`;Object.assign(entry.input.style,{position:'absolute',left:`${position.left}px`,top:`${position.top}px`,width:`${position.width}px`,height:`${position.height}px`});if(profile)Object.assign(entry.input.style,{background:profile.input.background,color:profile.input.color,border:profile.input.border,padding:profile.input.padding,fontFamily:profile.input.fontFamily,fontSize:`${profile.input.fontSize}px`,lineHeight:`${profile.input.lineHeight}px`});this.panel.append(entry.input);}
  this.panel.dataset.resourceState='loading';this.panel.style.backgroundImage='none';this.panel.dataset.skinned='false';
  this.resourceStatus.textContent='';this.retry.hidden=true;
  for(const result of entry.request.buttons)this.addButton(entry,result);
  this.positionButtons(contract.variants[size]);
  bringClassicWindowToFront(this.panel);this.focusFirst();this.visibilityChanged(true);
  void this.loadSkin(entry,false);
 }

 private layout(request:SystemDialogRequest):SystemDialogSize{
  let size=request.size??'horizontal',variant=contract.variants[size];
  if(variant.maxButtons&&request.buttons.length>variant.maxButtons&&variant.fallbackSizeForOverflow){size=variant.fallbackSizeForOverflow;variant=contract.variants[size];}
  this.panel.style.width=`${variant.width}px`;this.panel.style.height=`${variant.height}px`;
   this.panel.style.left=`${Math.floor((contract.canvas.width-variant.width)/2)}px`;this.panel.style.top=`${Math.floor((contract.canvas.height-variant.height)/2)}px`;
  this.panel.style.right='auto';this.panel.style.bottom='auto';
  Object.assign(this.text.style,{left:`${variant.text.left}px`,top:`${variant.text.top}px`,width:`${variant.text.width}px`,height:`${variant.text.height}px`});
  return size;
 }

 private positionButtons(variant:Variant){
  const rightToLeft=[...this.buttons].reverse();
  const positions=variant.buttonPositionsByCount[String(rightToLeft.length)];
  rightToLeft.forEach((state,index)=>{
   const spec=contract.buttons[state.result],position=positions[index];
   Object.assign(state.element.style,{left:`${position.left}px`,top:`${position.top}px`,width:`${spec.width}px`,height:`${spec.height}px`});
  });
 }

 private addButton(entry:Waiting,result:SystemDialogButton){
  const element=this.document.createElement('button');element.type='button';element.className='system-dialog-button';element.dataset.result=result;
  element.textContent=labels[result];element.setAttribute('aria-label',labels[result]);
  const state:ButtonState={element,result,entry,pressed:false,assetEpoch:0,ignoreClick:false};this.buttons.push(state);this.panel.append(element);
  element.addEventListener('pointerdown',event=>{
   if(!this.current(state)||event.button!==0)return;
   this.cancelPress();this.keyboardClickBlocked=false;state.ignoreClick=false;this.press={state,pointerId:event.pointerId,inside:true};state.pressed=true;
   element.focus();element.setPointerCapture?.(event.pointerId);event.preventDefault();this.paintButton(state);
  });
  element.addEventListener('pointermove',event=>{
   if(this.press?.state!==state||this.press.pointerId!==event.pointerId)return;
   this.press.inside=this.inside(element,event);state.pressed=this.press.inside;this.paintButton(state);
  });
  element.addEventListener('pointerleave',event=>{if(this.press?.state===state&&this.press.pointerId===event.pointerId){this.press.inside=false;state.pressed=false;this.paintButton(state);}});
  element.addEventListener('pointerenter',event=>{if(this.press?.state===state&&this.press.pointerId===event.pointerId){this.press.inside=true;state.pressed=true;this.paintButton(state);}});
  element.addEventListener('pointerup',event=>{
   if(this.press?.state!==state||this.press.pointerId!==event.pointerId)return;
   state.ignoreClick=!this.press.inside||!this.inside(element,event);this.press=undefined;state.pressed=false;this.paintButton(state);
   try{element.releasePointerCapture?.(event.pointerId);}catch{/* Capture may already have ended in the browser. */}
  });
  element.addEventListener('pointercancel',()=>{if(this.press?.state===state)this.cancelPress();});
  element.addEventListener('lostpointercapture',()=>{if(this.press?.state===state)this.cancelPress();});
  element.addEventListener('click',event=>{
   event.preventDefault();if(!this.current(state)||event.button!==0)return;
   if(event.detail===0&&this.keyboardClickBlocked)return;
   if(state.ignoreClick){state.ignoreClick=false;return;}
   if(this.composing)return;this.complete(entry,result);
  });
 }

 private complete(entry:Waiting,result:SystemDialogButton){
  if(this.active!==entry)return;
  this.active=undefined;entry.resolve(result);
  const next=this.queue.shift();if(next)this.start(next);else this.hide();
 }

 private hide(){
  ++this.skinEpoch;this.cancelPress();this.cancelDrag();this.composing=false;this.overlay.hidden=true;
  this.activeInput?.remove();this.activeInput=undefined;
  this.visibilityChanged(false);
  const target=this.restoreTarget;this.restoreTarget=null;if(target&&this.visibleFocus(target))target.focus();
 }

 private current(state:ButtonState){return !this.destroyed&&this.active===state.entry&&!this.overlay.hidden&&this.overlay.isConnected&&state.element.isConnected&&this.panel.contains(state.element);}
 private inside(element:HTMLElement,event:PointerEvent){const rect=element.getBoundingClientRect();return event.clientX>=rect.left&&event.clientX<rect.right&&event.clientY>=rect.top&&event.clientY<rect.bottom;}
 private cancelPress(){const previous=this.press;this.press=undefined;if(previous){previous.state.ignoreClick=true;previous.state.pressed=false;try{previous.state.element.releasePointerCapture?.(previous.pointerId);}catch{}this.paintButton(previous.state);}}
 private cancelDrag(){this.panel.dispatchEvent(new Event('pointercancel'));this.panel.classList.remove('window-dragging');}
 private focusElement(){const target=this.document.activeElement;return target instanceof HTMLElement?target:null;}
 private visibleFocus(element:HTMLElement){
  if(!element.isConnected||element.closest('[hidden],[inert],[aria-hidden="true"]')||element.matches(':disabled'))return false;
  const view=this.document.defaultView;const style=view?.getComputedStyle(element);
  return (!style||style.display!=='none'&&style.visibility!=='hidden')&&element.getClientRects().length>0;
 }
 private focusFirst(){const input=this.activeInput&&this.visibleFocus(this.activeInput)?this.activeInput:undefined;const first=this.buttons.find(state=>this.visibleFocus(state.element));(input??first?.element??this.panel).focus();}
 private cycleFocus(backward:boolean){
  const controls=[...(this.activeInput?[this.activeInput]:[]),...this.buttons.map(state=>state.element),this.retry].filter(element=>this.visibleFocus(element));
  if(!controls.length){this.panel.focus();return;}
  const index=controls.indexOf(this.document.activeElement as HTMLButtonElement);
  const next=index<0?(backward?controls.length-1:0):(index+(backward?-1:1)+controls.length)%controls.length;controls[next].focus();
 }
 private visibilityChanged(active:boolean){try{this.options.onVisibilityChange?.(active);}catch{/* Caller notifications cannot strand an explicit UI result. */}}
 private listen(target:EventTarget,type:string,callback:EventListener,capture=false){target.addEventListener(type,callback,capture);this.removers.push(()=>target.removeEventListener(type,callback,capture));}

 private async loadSkin(entry:Waiting,retry:boolean){
  const epoch=++this.skinEpoch;this.panel.dataset.resourceState='loading';this.retry.hidden=true;
  try{
   const session=await (retry?(this.options.retrySession??retryClassicUiSession)():(this.options.loadSession??loadClassicUiSession)());
   if(this.active!==entry||epoch!==this.skinEpoch||this.destroyed||!this.overlay.isConnected)return;
   this.session=session;
   const variant=contract.variants[this.panel.dataset.dialogSize as SystemDialogSize],frame=this.frame(variant.frame,variant.width,variant.height);
   await this.probe(frame);
   if(this.active!==entry||epoch!==this.skinEpoch||this.destroyed||!this.overlay.isConnected)return;
   applyNationalUiFrame(this.panel,contract.family,frame);this.panel.dataset.skinned='true';this.panel.dataset.resourceState='ready';this.resourceStatus.textContent='';
   for(const state of this.buttons)this.paintButton(state);
  }catch{
   if(this.active!==entry||epoch!==this.skinEpoch||this.destroyed||!this.overlay.isConnected)return;
   this.panel.dataset.resourceState='failed';this.panel.dataset.skinned='false';this.panel.style.backgroundImage='none';
   this.resourceStatus.textContent='界面素材暂缺';this.retry.hidden=false;
  }
 }

 private frame(index:number,width:number,height:number):Frame{
  const library=this.session?.national.get(contract.family),frame=library?.frames[String(index)];
  const locked=contract.frames[String(index)];
  if(!library||!frame||frame.width!==width||frame.height!==height||!Number.isFinite(frame.offsetX)||!Number.isFinite(frame.offsetY)||!frame.file||frame.file.includes('..')||frame.file.startsWith('/'))throw new Error('界面素材暂缺');
  if(!locked||frame.file!==locked.file||frame.width!==locked.width||frame.height!==locked.height||frame.offsetX!==locked.offsetX||frame.offsetY!==locked.offsetY)throw new Error('界面素材暂缺');
  if(contract.sourceSha256&&library.sourceSha256!==contract.sourceSha256||contract.indexSha256&&library.indexSha256!==contract.indexSha256)throw new Error('界面素材暂缺');
  return frame;
 }

 private probe(frame:Frame){
  const url=`/ui-national/${contract.family}/${frame.file}`,existing=this.imageCache.get(url);if(existing)return existing;
  const task=new Promise<void>((resolve,reject)=>{
   const image=new Image();image.onload=()=>{if(image.naturalWidth!==frame.width||image.naturalHeight!==frame.height)reject(new Error('界面素材暂缺'));else resolve();};image.onerror=()=>reject(new Error('界面素材暂缺'));image.src=url;
  });
  this.imageCache.set(url,task);void task.catch(()=>{if(this.imageCache.get(url)===task)this.imageCache.delete(url);});return task;
 }

 private paintButton(state:ButtonState){
  if(!this.current(state))return;
  const epoch=++state.assetEpoch,spec=contract.buttons[state.result],index=state.pressed?spec.pressedFrame:spec.normalFrame;
  state.element.dataset.pressed=String(state.pressed);
  if(!this.session)return;
  try{
   const frame=this.frame(index,spec.width,spec.height);
   void this.probe(frame).then(()=>{
    if(!this.current(state)||state.assetEpoch!==epoch)return;
    applyNationalUiFrame(state.element,contract.family,frame);state.element.dataset.skinned='true';
   }).catch(()=>this.failedButton(state,epoch));
  }catch{this.failedButton(state,epoch);}
 }
 private failedButton(state:ButtonState,epoch:number){
  if(!this.current(state)||state.assetEpoch!==epoch)return;
  state.element.dataset.skinned='false';state.element.style.backgroundImage='none';this.resourceStatus.textContent='界面素材暂缺';this.retry.hidden=false;
  this.panel.dataset.resourceState='failed';
 }
}
