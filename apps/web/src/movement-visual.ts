export const MOVEMENT_DURATION_MS=600;

// OpenMir2 and the classic Hum/Mon WIL rows share the same clockwise order:
// 0=up, 2=right, 4=down and 6=left.
export function visualDirection(serverDirection:number){
 return serverDirection&7;
}
