// Shared by the real mining probe and its isolated ore recovery command.
// This module performs no network, filesystem, account or database operations.
export const miningDirections=Object.freeze([[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]]);
export const nativeDropRange=3; // ClientDropItem: min(Config.DropItemRage, 3).
export const gridDistance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const coordinate=p=>Number.isInteger(p?.x)&&Number.isInteger(p?.y);

export class MiningGroundCache{
 constructor(){this.items=new Map();this.generation=undefined;}
 apply(message,generation){
  if(this.generation!==generation||message.type==='map')this.items.clear();
  this.generation=generation;
  if(message.type==='groundItem'){
   if(!Number.isInteger(message.id)||!coordinate(message)||!Number.isInteger(message.looks)||typeof message.name!=='string')
    throw new Error('Invalid authoritative ground item');
   this.items.set(message.id,{...message,mapGeneration:generation});
  }
  if(message.type==='groundItemRemoved')this.items.delete(message.id);
 }
 snapshotIds(){return new Set(this.items.keys());}
 findNewDrop(knownIds,ore,origin,generation){
  if(this.generation!==generation)throw new Error('Map changed while awaiting dropped ore');
  if(!coordinate(origin)||typeof ore?.name!=='string'||!Number.isInteger(ore.looks))throw new Error('Invalid dropped ore identity');
  const matches=[...this.items.values()].filter(item=>!knownIds.has(item.id)&&item.name===ore.name&&item.looks===ore.looks&&gridDistance(item,origin)<=nativeDropRange);
  if(matches.length>1)throw new Error('Ambiguous new ground ore; no pickup requested');
  return matches[0];
 }
}

export function readClassicMiningMap(bytes){
 if(bytes.length<52)throw new Error('Truncated classic map header');
 const width=bytes.readUInt16LE(),height=bytes.readUInt16LE(2);
 if(!width||!height||bytes.length<52+width*height*12)throw new Error('Probe requires confirmed classic map layout');
 const inBounds=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<height;
 const walkable=(x,y)=>inBounds(x,y)&&!((bytes.readUInt16LE(52+(x*height+y)*12)|bytes.readUInt16LE(56+(x*height+y)*12))&0x8000);
 return {width,height,inBounds,walkable};
}

export function routeToGround(map,start,target,entities,{maxSteps=60,maxNodes=12000}={}){
 if(!coordinate(start)||!coordinate(target)||!map.walkable(start.x,start.y)||!map.walkable(target.x,target.y))
  throw new Error('Ground route requires walkable authoritative endpoints');
 if(!Number.isInteger(maxSteps)||maxSteps<0||!Number.isInteger(maxNodes)||maxNodes<1)throw new Error('Invalid ground route bound');
 const occupied=new Set([...entities.values()].filter(e=>!e.self&&!e.dead&&coordinate(e)).map(e=>e.x+','+e.y));
 if(occupied.has(target.x+','+target.y))throw new Error('Dropped ore tile is occupied');
 const queue=[{x:start.x,y:start.y,previous:-1}],visited=new Set([start.x+','+start.y]);let goal=-1;
 for(let i=0;i<queue.length&&i<maxNodes;i++){
  const point=queue[i];
  if(point.x===target.x&&point.y===target.y){goal=i;break;}
  if((point.depth??0)>=maxSteps)continue;
  miningDirections.forEach(([dx,dy],direction)=>{
   const x=point.x+dx,y=point.y+dy,key=x+','+y;
   if(!map.walkable(x,y)||visited.has(key)||occupied.has(key)||queue.length>=maxNodes)return;
   visited.add(key);queue.push({x,y,direction,previous:i,depth:(point.depth??0)+1});
  });
 }
 if(goal<0)throw new Error('No bounded walkable route to dropped ore');
 const route=[];
 while(queue[goal].previous>=0){const {x,y,direction,previous}=queue[goal];route.unshift({x,y,direction});goal=previous;}
 return route;
}

export function assertOreInstance(item,expected){
 if(!item||item.makeIndex!==expected.makeIndex||item.stdMode!==43||item.name!==expected.name||item.looks!==expected.looks||item.durability!==expected.durability)
  throw new Error('Authoritative ore identity or raw purity differs');
 return true;
}

export function assertSingleMiningFixture(manifest){
 if(manifest.cleaned||!Array.isArray(manifest.fixtures)||manifest.fixtures.length!==1)throw new Error('Recovery requires exactly one active private mining fixture');
 const fixture=manifest.fixtures[0];
 if(!/^m[0-9a-f]{8}$/.test(fixture.account)||fixture.character!=='M'+fixture.account.slice(1)||typeof fixture.password!=='string'||!fixture.password)
  throw new Error('Invalid private mining fixture namespace');
 return fixture;
}
