export type NativeButtonVisualState='normal'|'hover'|'pressed';
type NativeButtonStateBinding={paint:(state:NativeButtonVisualState)=>void;render:()=>void;cancel:()=>void};
const nativeButtonBindings=new WeakMap<HTMLButtonElement,NativeButtonStateBinding>();
const nativeButtonLifecycleDocuments=new WeakSet<Document>();

function bindDocumentLifecycle(document:Document){
 if(nativeButtonLifecycleDocuments.has(document))return;
 nativeButtonLifecycleDocuments.add(document);
 const cancel=()=>{
  for(const button of Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-native-frame-states="bound"]')))nativeButtonBindings.get(button)?.cancel();
 };
 document.defaultView?.addEventListener('blur',cancel);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
}

/** Keep imported button frames in sync with pointer cancellation and focus loss, including buttons reskinned after async loads. */
export function bindNativeFrameButtonStates(button:HTMLButtonElement,paint:(state:NativeButtonVisualState)=>void){
 const existing=nativeButtonBindings.get(button);
 if(existing){existing.paint=paint;existing.render();return;}
 button.dataset.nativeFrameStates='bound';
 let hovered=false,focused=false,activeKey:string|undefined,pointerId:number|undefined,pointerType='mouse';
 const state=():NativeButtonVisualState=>pointerId!==undefined||activeKey!==undefined?'pressed':(hovered&&pointerType==='mouse')||focused?'hover':'normal';
 const binding:NativeButtonStateBinding={paint,render:()=>binding.paint(button.disabled?'normal':state()),cancel:()=>{releaseCapture();hovered=false;focused=false;activeKey=undefined;pointerType='mouse';binding.render();}};nativeButtonBindings.set(button,binding);
 const releaseCapture=()=>{const active=pointerId;pointerId=undefined;if(active!==undefined)try{if(button.hasPointerCapture?.(active))button.releasePointerCapture?.(active);}catch{}};
 const release=(event?:PointerEvent)=>{
  if(event&&pointerId!==event.pointerId)return;
  if(pointerId===undefined&&event)return;
  releaseCapture();binding.render();
 };
 button.addEventListener('focus',()=>{
  try{focused=button.matches(':focus-visible');}catch{focused=true;}
  binding.render();
 });
 button.addEventListener('blur',()=>{focused=false;activeKey=undefined;binding.render();});
 button.addEventListener('keydown',event=>{
  const key=event as KeyboardEvent;
  if(button.disabled||key.repeat)return;
  if(key.key!=='Enter'&&key.key!==' '&&key.code!=='Space')return;
  activeKey=key.code==='Space'?'Space':key.key;
  binding.render();
 });
 button.addEventListener('keyup',event=>{
  const key=event as KeyboardEvent,code=key.code==='Space'?'Space':key.key;
  if(activeKey!==undefined&&activeKey===code){activeKey=undefined;binding.render();}
 });
 button.addEventListener('pointerenter',event=>{const pointer=event as PointerEvent;if(button.disabled){hovered=false;if(pointerId===undefined)binding.render();return;}if(pointer.pointerType!=='mouse')return;pointerType='mouse';hovered=true;if(pointerId===undefined)binding.render();});
 button.addEventListener('pointerleave',()=>{hovered=false;if(pointerId===undefined)binding.render();});
 button.addEventListener('pointerdown',event=>{
  const pointer=event as PointerEvent;
  if(pointer.button!==0||button.disabled)return;
  pointerId=pointer.pointerId;pointerType=pointer.pointerType||'mouse';
  try{button.setPointerCapture?.(pointer.pointerId);}catch{}
  binding.render();
 });
 button.addEventListener('pointerup',release);
 button.addEventListener('pointercancel',release);
 button.addEventListener('lostpointercapture',release);
 bindDocumentLifecycle(button.ownerDocument);
 binding.render();
}
