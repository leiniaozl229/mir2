import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MiningGroundCache,readClassicMiningMap,routeToGround,assertOreInstance,assertSingleMiningFixture,nativeDropRange} from '../tools/mining_probe_ground.mjs';
const ore={name:'银矿',looks:285,stdMode:43,makeIndex:18129916,durability:12035};
const original={x:25,y:25};
const ground=(id,x=26,y=26,extra={})=>({type:'groundItem',id,x,y,name:ore.name,looks:ore.looks,...extra});
let passed=0;
async function test(name,callback){await callback();passed++;console.log('PASS '+name);}
function synthetic(width=5,height=5,blocked=[]){
 const bytes=Buffer.alloc(52+width*height*12);bytes.writeUInt16LE(width);bytes.writeUInt16LE(height,2);
 for(const [x,y] of blocked)bytes.writeUInt16LE(0x8000,52+(x*height+y)*12);
 return readClassicMiningMap(bytes);
}
await test('scattered ore uses new id, exact name/looks and Chebyshev range three',()=>{
 const cache=new MiningGroundCache();cache.apply(ground(1,25,25),1);const known=cache.snapshotIds();
 cache.apply(ground(325397447),1);
 assert.equal(cache.findNewDrop(known,ore,original,1).id,325397447);
 assert.equal(nativeDropRange,3);
});
await test('old same-name ground and repeated SM610 cannot become a new drop',()=>{
 const cache=new MiningGroundCache();cache.apply(ground(1),1);const known=cache.snapshotIds();
 cache.apply(ground(1),1);assert.equal(cache.findNewDrop(known,ore,original,1),undefined);
 assert.equal(cache.items.size,1);
});
await test('wrong name/looks and out-of-range ground never match',()=>{
 const cache=new MiningGroundCache();cache.apply(ground(1,25,25,{name:'铜矿'}),1);
 cache.apply(ground(2,25,25,{looks:286}),1);cache.apply(ground(3,29,25),1);
 assert.equal(cache.findNewDrop(new Set(),ore,original,1),undefined);
 cache.apply(ground(4,28,28),1);assert.equal(cache.findNewDrop(new Set(),ore,original,1).id,4);
});
await test('ambiguous new same-name same-look drops abort rather than choose another instance',()=>{
 const cache=new MiningGroundCache();cache.apply(ground(1),1);cache.apply(ground(2,27,26),1);
 assert.throws(()=>cache.findNewDrop(new Set(),ore,original,1),/Ambiguous/);
});
await test('SM611 removal and generation changes invalidate ground cache',()=>{
 const cache=new MiningGroundCache();cache.apply(ground(1),1);cache.apply({type:'groundItemRemoved',id:1},1);
 assert.equal(cache.items.size,0);cache.apply(ground(2),1);cache.apply({type:'resources'},2);
 assert.equal(cache.items.size,0);assert.throws(()=>cache.findNewDrop(new Set(),ore,original,1),/Map changed/);
 cache.apply(ground(3),2);cache.apply({type:'map'},2);assert.equal(cache.items.size,0);
});
await test('malformed authoritative ground coordinates or appearance are refused',()=>{
 const cache=new MiningGroundCache();assert.throws(()=>cache.apply(ground(1,NaN,25),1),/Invalid/);
 assert.throws(()=>cache.apply(ground(1,25,25,{looks:undefined}),1),/Invalid/);
});
await test('real pinned D401 map routes diagnosed (25,25) to (26,26) with original direction 3',async()=>{
 const bytes=await readFile(new URL('../vendor/mirserver-data/Mir200/Map/D401.map',import.meta.url)),map=readClassicMiningMap(bytes);
 assert.equal(map.width,200);assert.equal(map.height,200);
 assert.deepEqual(routeToGround(map,original,{x:26,y:26},new Map()),[{x:26,y:26,direction:3}]);
 assert.equal(map.walkable(24,26),false);
});
await test('BFS follows actual blocked tiles and does not move through live actors',()=>{
 const map=synthetic(5,5,[[2,0],[2,1],[2,2],[2,3]]),entities=new Map([[10,{x:1,y:1}]]);
 const route=routeToGround(map,{x:0,y:0},{x:4,y:0},entities);
 assert.ok(route.length>4);for(const step of route){assert.ok(map.walkable(step.x,step.y));assert.notDeepEqual({x:step.x,y:step.y},{x:1,y:1});}
 assert.deepEqual({x:route.at(-1).x,y:route.at(-1).y},{x:4,y:0});
});
await test('dead actors/self do not block route; live destination occupancy fails before movement',()=>{
 const map=synthetic(),target={x:1,y:1};
 assert.deepEqual(routeToGround(map,{x:0,y:0},target,new Map([[1,{...target,dead:true}],[2,{...target,self:true}]])),[{...target,direction:3}]);
 assert.throws(()=>routeToGround(map,{x:0,y:0},target,new Map([[1,target]])),/occupied/);
});
await test('unreachable wall, map bounds and bounded route fail without invented coordinates',()=>{
 const map=synthetic(5,5,[[2,0],[2,1],[2,2],[2,3],[2,4]]);
 assert.throws(()=>routeToGround(map,{x:0,y:0},{x:4,y:4},new Map()),/No bounded/);
 assert.throws(()=>routeToGround(map,{x:0,y:0},{x:2,y:2},new Map()),/walkable/);
 assert.throws(()=>routeToGround(map,{x:0,y:0},{x:-1,y:2},new Map()),/walkable/);
 assert.throws(()=>routeToGround(synthetic(),{x:0,y:0},{x:4,y:4},new Map(),{maxSteps:1}),/No bounded/);
 assert.deepEqual(routeToGround(map,{x:0,y:0},{x:0,y:0},new Map()),[]);
});
await test('truncated/invalid maps are refused rather than guessed',()=>{
 assert.throws(()=>readClassicMiningMap(Buffer.alloc(12)),/Truncated/);
 const bytes=Buffer.alloc(52);bytes.writeUInt16LE(200);bytes.writeUInt16LE(200,2);
 assert.throws(()=>readClassicMiningMap(bytes),/confirmed/);
});
await test('pickup and relogin require the original instance, appearance and raw purity',()=>{
 assert.equal(assertOreInstance({...ore},ore),true);
 for(const changed of [{makeIndex:18129917},{durability:12034},{name:'铜矿'},{looks:284},{stdMode:40}])
  assert.throws(()=>assertOreInstance({...ore,...changed},ore),/identity or raw purity/);
 assert.throws(()=>assertOreInstance(undefined,ore),/identity or raw purity/);
});
await test('recovery reads exactly one private namespace fixture and never substitutes another role',()=>{
 const fixture={account:'m1234abcd',character:'M1234abcd',password:'private-test-only'};
 assert.equal(assertSingleMiningFixture({fixtures:[fixture]}),fixture);
 for(const manifest of [{fixtures:[]},{fixtures:[fixture,fixture]},{cleaned:true,fixtures:[fixture]},
  {fixtures:[{...fixture,account:'production'}]},{fixtures:[{...fixture,character:'Other'}]}])
  assert.throws(()=>assertSingleMiningFixture(manifest),/fixture|namespace/);
});
await test('production probe preserves ground state before drop and uses shared routing/purity checks',async()=>{
 const source=await readFile(new URL('../tools/mining_probe.mjs',import.meta.url),'utf8');
 const snapshot=source.indexOf('knownGroundIds=client.groundItems.snapshotIds()'),drop=source.indexOf("client.send({type:'dropItem'");
 assert.ok(snapshot>=0&&snapshot<drop);assert.ok(source.includes('findNewDrop(knownGroundIds,ore,dropOrigin,generation)'));
 assert.ok(source.includes('routeToGround(miningMap,client.self,ground,client.entities'));
 assert.ok(source.includes('assertOreInstance(picked.item,ore)'));assert.ok(source.includes('assertOreInstance(persisted,ore)'));
 assert.ok(!source.includes('m.x===position.x&&m.y===position.y'));
});
console.log(`${passed}/${passed} mining ground regression checks passed; no runtime connection or data changes.`);
