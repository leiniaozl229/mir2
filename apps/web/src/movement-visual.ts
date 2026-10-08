export const MOVEMENT_SETTLE_MS=250;
// Actor.pas: rush 3*120ms, backstep ActWalk 6*90ms; blocked
// rush ends after the first three ActRun frames and returns to its origin.
export function forcedMovementDuration(action:string){return action==='backstep'?540:360;}
export function visualDirection(serverDirection:number){
 return serverDirection&7;
}

export {MOVEMENT_DURATION_MS,routeDirection} from './movement-model';
