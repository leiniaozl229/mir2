export const MOVEMENT_SETTLE_MS=250;
export function visualDirection(serverDirection:number){
 return serverDirection&7;
}

export {MOVEMENT_DURATION_MS,routeDirection} from './movement-model';
