export const MOVEMENT_DURATION_MS=600;
export const DIRECTIONS=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]] as const;

export type GridPoint={x:number;y:number};
export type MovementStep={actionId:number;fromX:number;fromY:number;x:number;y:number;direction:number;run:boolean;startedAt:number;acknowledged:boolean};

export function directionIndex(dx:number,dy:number){
 return DIRECTIONS.findIndex(([x,y])=>x===Math.sign(dx)&&y===Math.sign(dy));
}

export function routeDirection(fromX:number,fromY:number,toX:number,toY:number,fallback:number){
 const direction=directionIndex(toX-fromX,toY-fromY);
 return direction<0?fallback&7:direction;
}

export function screenDirection(dx:number,dy:number,previous?:number){
 const length=Math.hypot(dx,dy);if(length<12)return;
 let best=-1,bestScore=-Infinity;
 for(let direction=0;direction<DIRECTIONS.length;direction++){
  const [cellX,cellY]=DIRECTIONS[direction],screenX=cellX*48,screenY=cellY*32;
  const score=(dx*screenX+dy*screenY)/(length*Math.hypot(screenX,screenY));
  if(score>bestScore){best=direction;bestScore=score;}
 }
 if(previous!==undefined&&previous>=0&&previous<8){
  const [cellX,cellY]=DIRECTIONS[previous],screenX=cellX*48,screenY=cellY*32;
  const previousScore=(dx*screenX+dy*screenY)/(length*Math.hypot(screenX,screenY));
  if(previousScore>=bestScore-.06)return previous;
 }
 return best;
}

export function findGridPath(start:GridPoint,goal:GridPoint,isWalkable:(x:number,y:number)=>boolean,isOccupied:(x:number,y:number)=>boolean){
 if(start.x===goal.x&&start.y===goal.y)return [];
 if(!isWalkable(goal.x,goal.y))return undefined;
 const radius=Math.max(18,Math.max(Math.abs(goal.x-start.x),Math.abs(goal.y-start.y))+8);
 const minX=Math.min(start.x,goal.x)-radius,maxX=Math.max(start.x,goal.x)+radius;
 const minY=Math.min(start.y,goal.y)-radius,maxY=Math.max(start.y,goal.y)+radius;
 type Node={x:number;y:number;direction:number;cost:number;score:number;parent?:Node;serial:number};
 const heuristic=(x:number,y:number)=>Math.max(Math.abs(goal.x-x),Math.abs(goal.y-y));
 const directScore=(x:number,y:number,direction:number)=>{
  const goalX=goal.x-x,goalY=goal.y-y,goalLength=Math.hypot(goalX*48,goalY*32);
  if(!goalLength)return 0;
  const [dx,dy]=DIRECTIONS[direction],stepLength=Math.hypot(dx*48,dy*32);
  return 1-(goalX*48*dx*48+goalY*32*dy*32)/(goalLength*stepLength);
 };
 let serial=0;
 const open:Node[]=[{x:start.x,y:start.y,direction:-1,cost:0,score:heuristic(start.x,start.y),serial:serial++}];
 const best=new Map<string,number>([[`${start.x},${start.y},-1`,0]]);
 while(open.length){
  open.sort((a,b)=>a.score-b.score||a.cost-b.cost||a.serial-b.serial);
  const current=open.shift()!;
  if(current.x===goal.x&&current.y===goal.y){
   const result:GridPoint[]=[];let node:Node|undefined=current;
   while(node?.parent){result.unshift({x:node.x,y:node.y});node=node.parent;}
   return result;
  }
  for(let direction=0;direction<DIRECTIONS.length;direction++){
   const [dx,dy]=DIRECTIONS[direction],x=current.x+dx,y=current.y+dy;
   if(x<minX||x>maxX||y<minY||y>maxY||!isWalkable(x,y)||isOccupied(x,y)&&!(x===goal.x&&y===goal.y))continue;
   const turn=current.direction<0||current.direction===direction?0:.125;
   const cost=current.cost+1+turn+directScore(current.x,current.y,direction)*.02;
   const key=`${x},${y},${direction}`;
   if((best.get(key)??Infinity)<=cost)continue;
   best.set(key,cost);open.push({x,y,direction,cost,score:cost+heuristic(x,y),parent:current,serial:serial++});
  }
 }
 return undefined;
}

export function movementCanFinish(step:MovementStep,time:number){
 return step.acknowledged&&time>=step.startedAt+MOVEMENT_DURATION_MS;
}
