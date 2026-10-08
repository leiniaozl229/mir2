import {movementInput} from './movement-input';

export type ChatScrollKey='ArrowUp'|'ArrowDown'|'PageUp'|'PageDown';
export type ClassicKeyboardActions={
 inWorld:()=>boolean;
 sessionInWorld?:()=>boolean;sound?:()=>void;logout?:(mode:'reselect'|'login')=>void;
 worldBlocked:()=>boolean;
 cancel:()=>void; cancelTransient?:()=>boolean;
 closeTop:()=>void;
 chatScroll?:(key:ChatScrollKey)=>boolean;
 itemKey:(event:KeyboardEvent)=>boolean;
 chat:(prefix?:string)=>void;
 minimap:()=>void;
 attackMode:()=>void;
 window:(id:string)=>void;
 skill:(index:number)=>void;
 movement:(event:KeyboardEvent)=>void;
};

function textEntry(target:EventTarget|null){
 return target instanceof HTMLElement&&(target.matches('input,select,textarea')||target.isContentEditable||Boolean(target.closest('[contenteditable="true"],[contenteditable=""],[role="textbox"]')));
}
function nativeActivationControl(target:EventTarget|null){
 return target instanceof HTMLElement&&(target.matches('button,a[href],[role="button"],[tabindex]:not([tabindex="-1"])')||Boolean(target.closest('button,a[href],[role="button"],[tabindex]:not([tabindex="-1"])')));
}

/** Browser input contract; original executable timing remains an acceptance item. */
export function routeClassicKey(event:KeyboardEvent,actions:ClassicKeyboardActions){
 if(event.isComposing||event.keyCode===229)return;
 const sessionInWorld=actions.sessionInWorld?.()??actions.inWorld();
 if(!textEntry(event.target)&&sessionInWorld&&event.key==='F12'&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();if(!event.repeat)actions.sound?.();return;}
 if(!textEntry(event.target)&&sessionInWorld&&event.altKey&&!event.ctrlKey&&!event.metaKey&&['x','q'].includes(event.key.toLowerCase())){event.preventDefault();if(!event.repeat)actions.logout?.(event.key.toLowerCase()==='x'?'reselect':'login');return;}
 if(event.key==='Escape'&&!event.repeat){
  if(textEntry(event.target)){(event.target as HTMLElement).blur();return;}
  if(!actions.inWorld())return;
  event.preventDefault();if(actions.cancelTransient?.())return;actions.cancel();actions.closeTop();return;
 }
 if(textEntry(event.target)||!actions.inWorld())return;
 const windows:Record<string,string>={F9:'inventory',F10:'character',F11:'skills'},windowId=windows[event.key];
 if(windowId){event.preventDefault();if(!event.repeat)actions.window(windowId);return;}
 if(['ArrowUp','ArrowDown','PageUp','PageDown'].includes(event.key)&&actions.chatScroll?.(event.key as ChatScrollKey)){event.preventDefault();return;}
 if(nativeActivationControl(event.target)&&['Enter',' ','Tab'].includes(event.key))return;
 const functionKey=/^F([1-8])$/.exec(event.key),movement=movementInput(event);
 if(actions.worldBlocked()){
  // Leave Enter and Tab with the focused modal control; do not redirect them to chat/map.
  if(functionKey||movement||/^[1-6]$/.test(event.key)||/^Numpad[1-6]$/.test(event.code)||(event.ctrlKey&&event.key.toLowerCase()==='h'))event.preventDefault();
  return;
 }
 if(actions.itemKey(event))return;
 if(!event.ctrlKey&&!event.altKey&&!event.metaKey&&['Enter',' ','@','!','/'].includes(event.key)){
  event.preventDefault();if(!event.repeat)actions.chat(['@','!','/'].includes(event.key)?event.key:undefined);return;
 }
 if(event.key==='Tab'){event.preventDefault();if(!event.repeat)actions.minimap();return;}
 if(event.ctrlKey&&event.key.toLowerCase()==='h'){event.preventDefault();if(!event.repeat)actions.attackMode();return;}
 if(functionKey){event.preventDefault();if(!event.repeat)actions.skill(Number(functionKey[1])-1);return;}
 if(movement&&!event.repeat){event.preventDefault();actions.movement(event);}
}
