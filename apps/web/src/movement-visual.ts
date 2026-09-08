export const MOVEMENT_DURATION_MS=600;
export const MOVEMENT_SETTLE_MS=250;

const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]] as const;

export function routeDirection(fromX:number,fromY:number,toX:number,toY:number,fallback:number){
 const dx=Math.sign(toX-fromX),dy=Math.sign(toY-fromY);
 const direction=directions.findIndex(([x,y])=>x===dx&&y===dy);
 return direction<0?fallback&7:direction;
}

// OpenMir2 uses 0=up, 2=right, 4=down and 6=left. The imported classic
// Hum WIL rows start at down, so rotate the logical route direction by 180°.
export function visualDirection(serverDirection:number){
 return (serverDirection+4)&7;
}
