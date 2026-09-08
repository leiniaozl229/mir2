export const MOVEMENT_DURATION_MS=600;

// OpenMir2 uses 0=up and 4=down. The classic Hum/Mon WIL rows begin at
// down and continue clockwise, so their visual row is half a turn ahead.
export function visualDirection(serverDirection:number){
 return (serverDirection+4)&7;
}
