const CANVAS_WIDTH=800;
const CANVAS_HEIGHT=600;

type Position={left:number;top:number};
type WindowEntry={element:HTMLElement;close:()=>void};
let nextWindowZ=30;
const lastFocusedControl=new WeakMap<HTMLElement,HTMLElement>();

/** Raise a classic window when it receives a primary pointer interaction. */
export function bringClassicWindowToFront(element:HTMLElement){
 element.style.zIndex=String(++nextWindowZ);
}

function topVisibleWindow(windows:WindowEntry[],excluded?:HTMLElement){
 let top:WindowEntry|undefined,topZ=-Infinity;
 for(const window of windows){
   if(window.element===excluded||window.element.hidden)continue;
  const z=Number.parseInt(getComputedStyle(window.element).zIndex,10)||0;
  if(!top||z>topZ||(z===topZ&&Boolean(top.element.compareDocumentPosition(window.element)&4))){top=window;topZ=z;}
 }
 return top;
}

function usableFocusTarget(window:HTMLElement,target:HTMLElement|undefined){
 if(!target||('disabled'in target&&Boolean((target as HTMLInputElement).disabled))||target.hidden||target.isConnected===false||target.tabIndex<0||!window.contains(target))return false;
 if(target.getAttribute?.('aria-hidden')==='true'||target.closest?.('[hidden],[inert],[aria-hidden="true"]'))return false;
 const style=getComputedStyle(target);if(style.display==='none'||style.visibility==='hidden')return false;
 return typeof target.getClientRects!=='function'||target.getClientRects().length>0;
}

function restoreWindowFocus(window:HTMLElement){
 const remembered=lastFocusedControl.get(window);
 const controls=Array.from(window.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])'));
 const target=usableFocusTarget(window,remembered)?remembered:controls.find(control=>usableFocusTarget(window,control));
 if(target){target.focus({preventScroll:true});return true;}
 if(window.tabIndex<0)window.tabIndex=-1;
 window.focus({preventScroll:true});return true;
}

function restoreFocusAfterClose(windows:WindowEntry[],element:HTMLElement,shouldRestore:boolean){
 if(!shouldRestore||!element.hidden)return false;
 const document=element.ownerDocument,next=topVisibleWindow(windows,element);
 if(next)restoreWindowFocus(next.element);
 else{const canvas=document.querySelector<HTMLElement>('#viewport-shell canvas');if(canvas){canvas.tabIndex=-1;canvas.focus({preventScroll:true});}else document.body?.focus?.();}
 return true;
}

/** Restore focus after a service panel has performed its own close-and-clear lifecycle. */
export function restoreClassicWindowFocus(windows:WindowEntry[],element:HTMLElement,focusWasWithinWindow:boolean){
 return restoreFocusAfterClose(windows,element,focusWasWithinWindow);
}

function closeWindowEntry(windows:WindowEntry[],entry:WindowEntry){
 const document=entry.element.ownerDocument,active=document.activeElement as HTMLElement|null;
 const shouldRestore=Boolean(active&&(entry.element.contains(active)||active===document.body||active===document.documentElement));
 entry.close();
 restoreFocusAfterClose(windows,entry.element,shouldRestore);
 return true;
}

/** Close a specific visible window and move focus to the next visible window or the game surface. */
export function closeClassicWindowEntry(windows:WindowEntry[],element:HTMLElement){
 const entry=windows.find(window=>window.element===element);
 if(!entry||entry.element.hidden)return false;
 return closeWindowEntry(windows,entry);
}

/** Consult the painted top window's close policy without falling through to a window underneath it. */
export function closeTopClassicWindow(windows:WindowEntry[],canClose:(element:HTMLElement)=>boolean=()=>true){
 const top=topVisibleWindow(windows);if(!top||!canClose(top.element))return false;
 return closeWindowEntry(windows,top);
}

export function clampWindowPosition(left:number,top:number,width:number,height:number,minTop=0):Position{
 const lowerTop=Number.isFinite(minTop)?Math.min(0,minTop):0;
 return {left:Math.round(Math.max(0,Math.min(CANVAS_WIDTH-Math.min(width,CANVAS_WIDTH),left))),top:Math.round(Math.max(lowerTop,Math.min(CANVAS_HEIGHT-Math.min(height,CANVAS_HEIGHT),top)))};
}

function minimumWindowTop(element:HTMLElement){
 const value=Number.parseFloat(element.dataset.windowMinTop??'0');
 return Number.isFinite(value)?Math.min(0,value):0;
}

export function makeClassicWindowDraggable(element:HTMLElement,surface:HTMLElement,positionVersion=''){
  element.addEventListener('focusin',event=>{const target=event.target;if(target instanceof HTMLElement&&target!==element)lastFocusedControl.set(element,target);bringClassicWindowToFront(element);});
 const key=element.id?`mir2.window-position.${element.id}${positionVersion?`.${positionVersion}`:''}`:undefined;
 let activePointerId:number|undefined;
 if(key){try{const value=JSON.parse(localStorage.getItem(key)??'null') as Position|null;if(value&&Number.isFinite(value.left)&&Number.isFinite(value.top)){const position=clampWindowPosition(value.left,value.top,element.offsetWidth,element.offsetHeight,minimumWindowTop(element));setWindowPosition(element,position.left,position.top);element.style.right='auto';element.style.bottom='auto';element.dataset.windowMoved='true';}}catch{}}
 const reclamp=()=>{
  if(element.offsetWidth<=0||element.offsetHeight<=0)return;
  const position=clampWindowPosition(Number.parseFloat(element.style.left)||0,Number.parseFloat(element.style.top)||0,element.offsetWidth,element.offsetHeight,minimumWindowTop(element));
  setWindowPosition(element,position.left,position.top);element.style.right='auto';element.style.bottom='auto';
 };
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(reclamp).observe(element);
 else if(typeof requestAnimationFrame==='function')requestAnimationFrame(reclamp);
 element.addEventListener('pointerdown',event=>{
  if(event.button===0)bringClassicWindowToFront(element);
  if(event.button!==0||activePointerId!==undefined||!dragHandle(event,element))return;
  reclamp();
  const surfaceBounds=surface.getBoundingClientRect(),scale=Math.max(.01,surfaceBounds.width/CANVAS_WIDTH);
  const startX=event.clientX,startY=event.clientY,startLeft=Number.parseFloat(element.style.left)||0,startTop=Number.parseFloat(element.style.top)||0;
  const wasMoved=element.dataset.windowMoved==='true';activePointerId=event.pointerId;
  try{element.setPointerCapture?.(event.pointerId);}catch{}
  element.classList.add('window-dragging');event.preventDefault();
  let hiddenObserver:MutationObserver|undefined;
  const move=(moveEvent:PointerEvent)=>{
   if(moveEvent.pointerId!==event.pointerId)return;
   const position=clampWindowPosition(startLeft+(moveEvent.clientX-startX)/scale,startTop+(moveEvent.clientY-startY)/scale,element.offsetWidth,element.offsetHeight,minimumWindowTop(element));
   setWindowPosition(element,position.left,position.top);element.style.right='auto';element.style.bottom='auto';element.dataset.windowMoved='true';
  };
  const windowObject=element.ownerDocument.defaultView;
  const finish=(commit:boolean)=>{
   if(activePointerId!==event.pointerId)return;
   activePointerId=undefined;
   element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',finishUp);element.removeEventListener('pointercancel',finishCancel);element.removeEventListener('lostpointercapture',finishCancel);
   windowObject?.removeEventListener('blur',finishCancel);element.ownerDocument.removeEventListener('visibilitychange',visibilityChange);
   element.classList.remove('window-dragging');
   if(!commit){setWindowPosition(element,startLeft,startTop);if(wasMoved)element.dataset.windowMoved='true';else delete element.dataset.windowMoved;}
   else if(key&&element.dataset.windowMoved==='true')try{localStorage.setItem(key,JSON.stringify({left:Number.parseFloat(element.style.left)||0,top:Number.parseFloat(element.style.top)||0}));}catch{}
   hiddenObserver?.disconnect();hiddenObserver=undefined;
   try{if(element.hasPointerCapture?.(event.pointerId))element.releasePointerCapture?.(event.pointerId);}catch{}
  };
  const finishUp=(upEvent:PointerEvent)=>{if(upEvent.pointerId===event.pointerId)finish(true);},finishCancel=(cancelEvent?:Event)=>{if(cancelEvent&&'pointerId'in cancelEvent&&(cancelEvent as PointerEvent).pointerId!==event.pointerId)return;finish(false);},visibilityChange=()=>{if(element.ownerDocument.hidden)finish(false);};
  element.addEventListener('pointermove',move);element.addEventListener('pointerup',finishUp);element.addEventListener('pointercancel',finishCancel);element.addEventListener('lostpointercapture',finishCancel);
  windowObject?.addEventListener('blur',finishCancel);element.ownerDocument.addEventListener('visibilitychange',visibilityChange);
  if(typeof MutationObserver!=='undefined'){
   hiddenObserver=new MutationObserver(()=>finish(false));
   hiddenObserver.observe(element,{attributes:true,attributeFilter:['hidden']});
  }
 });
}

function setWindowPosition(element:HTMLElement,left:number,top:number){
 element.style.left=`${left}px`;element.style.top=`${top}px`;
 if(element.id==='classic-window'){element.style.setProperty('--classic-window-left',`${left}px`);element.style.setProperty('--classic-window-top',`${top}px`);}
}

function dragHandle(event:PointerEvent,element:HTMLElement){
 const target=event.target;if(!(target instanceof Element))return false;
 if(target.closest('button,input,textarea,select,a,.item-cell,[draggable="true"]'))return false;
 if(target.closest('[data-window-drag-handle]'))return true;
 const bounds=element.getBoundingClientRect(),scaleY=element.offsetHeight>0?bounds.height/element.offsetHeight:1;
 return (event.clientY-bounds.top)/Math.max(.01,scaleY)<=36;
}
