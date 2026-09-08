const CANVAS_WIDTH=800;
const CANVAS_HEIGHT=600;

type Position={left:number;top:number};

export function clampWindowPosition(left:number,top:number,width:number,height:number):Position{
 return {left:Math.round(Math.max(0,Math.min(CANVAS_WIDTH-Math.min(width,CANVAS_WIDTH),left))),top:Math.round(Math.max(0,Math.min(CANVAS_HEIGHT-Math.min(height,CANVAS_HEIGHT),top)))};
}

export function makeClassicWindowDraggable(element:HTMLElement,surface:HTMLElement){
 const key=element.id?`mir2.window-position.${element.id}`:undefined;
 if(key){try{const value=JSON.parse(localStorage.getItem(key)??'null') as Position|null;if(value&&Number.isFinite(value.left)&&Number.isFinite(value.top)){const position=clampWindowPosition(value.left,value.top,element.offsetWidth,element.offsetHeight);element.style.left=`${position.left}px`;element.style.top=`${position.top}px`;element.style.right='auto';element.style.bottom='auto';element.dataset.windowMoved='true';}}catch{}}
 element.addEventListener('pointerdown',event=>{
  if(event.button!==0||!dragHandle(event,element))return;
  const surfaceBounds=surface.getBoundingClientRect(),scale=Math.max(.01,surfaceBounds.width/CANVAS_WIDTH);
  const startX=event.clientX,startY=event.clientY,startLeft=Number.parseFloat(element.style.left)||0,startTop=Number.parseFloat(element.style.top)||0;
  element.setPointerCapture?.(event.pointerId);element.classList.add('window-dragging');event.preventDefault();
  const move=(moveEvent:PointerEvent)=>{
   const position=clampWindowPosition(startLeft+(moveEvent.clientX-startX)/scale,startTop+(moveEvent.clientY-startY)/scale,element.offsetWidth,element.offsetHeight);
   element.style.left=`${position.left}px`;element.style.top=`${position.top}px`;element.style.right='auto';element.style.bottom='auto';element.dataset.windowMoved='true';
  };
  const finish=()=>{
   element.removeEventListener('pointermove',move);element.removeEventListener('pointerup',finish);element.removeEventListener('pointercancel',finish);element.classList.remove('window-dragging');
   if(key&&element.dataset.windowMoved==='true')try{localStorage.setItem(key,JSON.stringify({left:Number.parseFloat(element.style.left)||0,top:Number.parseFloat(element.style.top)||0}));}catch{}
  };
  element.addEventListener('pointermove',move);element.addEventListener('pointerup',finish);element.addEventListener('pointercancel',finish);
 });
}

function dragHandle(event:PointerEvent,element:HTMLElement){
 const target=event.target;if(!(target instanceof Element))return false;
 if(target.closest('button,input,textarea,select,a,.item-cell,[draggable="true"]'))return false;
 if(target.closest('[data-window-drag-handle]'))return true;
 const bounds=element.getBoundingClientRect();return event.clientY-bounds.top<=36;
}
