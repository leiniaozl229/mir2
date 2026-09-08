export type HeldMovement={code:string;dx:number;dy:number;run:boolean};
export {screenDirection} from './movement-model';

const movementCodes:Record<string,[number,number]>={
 ArrowUp:[0,-1],KeyW:[0,-1],ArrowRight:[1,0],KeyD:[1,0],
 ArrowDown:[0,1],KeyS:[0,1],ArrowLeft:[-1,0],KeyA:[-1,0]
};

const legacyKeys:Record<string,string>={w:'KeyW',d:'KeyD',s:'KeyS',a:'KeyA'};

export function movementInput(event:Pick<KeyboardEvent,'code'|'key'|'shiftKey'>):HeldMovement|undefined{
 const code=event.code||legacyKeys[event.key.toLowerCase()]||event.key;
 const offset=movementCodes[code];
 return offset?{code,dx:offset[0],dy:offset[1],run:event.shiftKey}:undefined;
}

export function releasesMovement(held:HeldMovement|undefined,event:Pick<KeyboardEvent,'code'|'key'>){
 if(!held)return false;
 const code=event.code||legacyKeys[event.key.toLowerCase()]||event.key;
 return held.code===code;
}
