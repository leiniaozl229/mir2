// One-off recovery for the already diagnosed first wall-fix mining fixture.
// Default --plan never opens a socket. Root runs --recover after review.
// It cannot create accounts, drop items, mine, grant ore or modify the database.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MiningGroundCache,readClassicMiningMap,routeToGround,assertOreInstance,assertSingleMiningFixture,gridDistance,nativeDropRange} from './mining_probe_ground.mjs';
const expected=Object.freeze({makeIndex:18129916,durability:12035,name:'银矿',looks:285,groundId:325397447,x:26,y:26,map:'D401'});
const args=process.argv.slice(2);
if(args.includes('--help')){
 console.log('Usage: node tools/recover_mining_probe_ore.mjs --plan | --recover');
 console.log('Uses only the single private .runtime/mining-fixtures.json fixture; pins ore 18129916 / raw purity 12035 / ground 325397447 in D401 (26,26).');
 process.exit(0);
}
if(args.length>1||args.some(arg=>!['--plan','--recover'].includes(arg)))throw new Error('Choose --plan or --recover');
let privateManifest;
try{privateManifest=JSON.parse(await readFile('.runtime/mining-fixtures.json','utf8'));}
catch{throw new Error('Cannot read a valid private mining fixture manifest');}
const fixture=assertSingleMiningFixture(privateManifest);
const mapBytes=await readFile('.runtime/server/Mir200/Map/D401.map'),map=readClassicMiningMap(mapBytes);
if(!map.walkable(expected.x,expected.y))throw new Error('Expected ore tile is not walkable in the real map');
const catalog=JSON.parse(await readFile('content/classic-176/resource-catalog.json','utf8'));
if(!catalog.items.some(item=>item.name===expected.name&&item.stdMode===43&&item.imgIndex===expected.looks))throw new Error('Silver ore catalog identity changed');
const report={schemaVersion:1,startedAt:new Date().toISOString(),phase:'recover-first-wall-fix-ore',expected,checks:[],
 mapSha256:createHash('sha256').update(mapBytes).digest('hex'),limits:['Real protocol recovery of one isolated fixture; no browser or original client visual evidence.']};
report.sourceSha256={};
for(const path of ['tools/recover_mining_probe_ore.mjs','tools/mining_probe_ground.mjs'])report.sourceSha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
if(args[0]!=='--recover'){
 console.log('PLAN: one validated private fixture; D401 real map; ground 325397447 at (26,26); silver ore 18129916 raw purity 12035.');
 console.log('RECOVER: real login, bounded BFS + acknowledged walking, native pickup, verify original instance/purity, normal close and relogin. No drop, mining or database changes.');
 process.exit(0);
}
const endpoint=process.env.MIR2_GATEWAY_URL??'ws://127.0.0.1:18801/ws';let url;
try{url=new URL(endpoint);}catch{throw new Error('Invalid ore recovery gateway URL');}
if(url.username||url.password)throw new Error('Gateway URL must not contain credentials');
report.endpoint=url.protocol+'//'+url.host+url.pathname;
const clients=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function check(name,passed,details={}){report.checks.push({name,passed:!!passed,...details});console.log((passed?'PASS ':'FAIL ')+name);if(!passed)throw new Error(name);}
function summary(message){const safe={};for(const key of ['type','id','actionId','kind','accepted','mapGeneration','x','y','looks','code'])if(['string','number','boolean'].includes(typeof message[key]))safe[key]=message[key];return safe;}
class RecoveryClient{
 constructor(){
  this.events=[];this.inventory=new Map();this.entities=new Map();this.ground=new MiningGroundCache();this.actionSerial=200000;
  this.socket=new WebSocket(endpoint);clients.push(this);
  this.socket.addEventListener('message',event=>{
   try{
    const envelope=JSON.parse(event.data),message=envelope.message;this.generation=envelope.mapGeneration;
    this.events.push(message);this.ground.apply(message,this.generation);
    if(message.type==='map'){this.map=message.map;this.self=undefined;this.entities.clear();}
    if(message.type==='entity'){const actor={...this.entities.get(message.id),...message};this.entities.set(message.id,actor);if(message.self)this.self=actor;}
    if(message.type==='entityDied'&&this.entities.has(message.id))this.entities.get(message.id).dead=true;
    if(message.type==='entityRemoved')this.entities.delete(message.id);
    if(message.type==='actionResult'&&message.kind==='move'&&this.self&&Number.isInteger(message.x))Object.assign(this.self,{x:message.x,y:message.y});
    if(message.type==='inventory')this.inventory=new Map(message.items.map(item=>[item.makeIndex,item]));
    if(message.type==='itemAdded'||message.type==='itemUpdated')this.inventory.set(message.item.makeIndex,message.item);
    if(message.type==='itemRemoved')this.inventory.delete(message.makeIndex);
   }catch{this.messageFailure=true;}
  });
  this.socket.addEventListener('error',()=>{this.connectionFailure=true;});
 }
 send(command){this.socket.send(JSON.stringify(command));}
 async wait(at,predicate,timeout=15000){
  const end=Date.now()+timeout;
  while(Date.now()<end){
   if(this.messageFailure)throw new Error('Invalid gateway event while recovering ore');
   const found=this.events.slice(at).find(predicate);if(found)return found;
   if(this.events.slice(at).some(message=>message.type==='error'))throw new Error('Gateway rejected isolated ore recovery operation');
   if(this.connectionFailure||this.socket.readyState===WebSocket.CLOSED)throw new Error('Isolated ore recovery connection ended');
   await pause(20);
  }
  report.timeout={operation:report.operation,mapGeneration:this.generation,events:this.events.slice(at).slice(-16).map(summary)};
  throw new Error('Isolated ore recovery response timeout');
 }
 async enter(){
  report.operation='enter private mining fixture';await this.wait(0,message=>message.type==='connected');
  let at=this.events.length;this.send({type:'login',account:fixture.account,password:fixture.password});
  const characters=await this.wait(at,message=>message.type==='characters');
  if(!characters.characters?.some(character=>(typeof character==='string'?character:character.name)===fixture.character))throw new Error('Private mining character is not in authenticated character list');
  at=this.events.length;this.send({type:'selectCharacter',name:fixture.character});
  await this.wait(at,message=>message.type==='entity'&&message.self,45000);
  at=this.events.length;this.send({type:'inventory'});await this.wait(at,message=>message.type==='inventory');await pause(1500);
  check('isolated ore recovery is in D401',this.map===expected.map);
 }
 async move(step,generation){
  await pause(1500);
  if(this.generation!==generation||this.map!==expected.map||this.self?.dead)throw new Error('Map or player state changed during ore recovery');
  const at=this.events.length,actionId=++this.actionSerial;report.operation='walk to diagnosed ore';
  this.send({type:'move',...step,actionId,mapGeneration:generation});
  const result=await this.wait(at,message=>message.type==='actionResult'&&message.actionId===actionId);
  check('recovery route step confirmed',result.kind==='move'&&result.accepted&&this.self.x===step.x&&this.self.y===step.y,{x:step.x,y:step.y});
 }
 async close(){if(this.socket.readyState===WebSocket.OPEN)this.socket.close();const end=Date.now()+5000;while(this.socket.readyState!==WebSocket.CLOSED&&Date.now()<end)await pause(20);}
}
try{
 let client=new RecoveryClient();await client.enter();
 const existing=client.inventory.get(expected.makeIndex);
 if(existing){check('diagnosed ore already in authoritative bag',assertOreInstance(existing,expected));}
 else{
  report.operation='find diagnosed ground ore';
  await client.wait(0,()=>client.ground.items.has(expected.groundId));
  const ground=client.ground.items.get(expected.groundId),generation=client.generation;
  check('diagnosed ground id name looks and coordinates match',ground.name===expected.name&&ground.looks===expected.looks&&ground.x===expected.x&&ground.y===expected.y);
  check('diagnosed ground is within original drop range',gridDistance(client.self,ground)<=nativeDropRange);
  for(let walked=0;client.self.x!==ground.x||client.self.y!==ground.y;walked++){
   if(walked>=60||!client.ground.items.has(ground.id))throw new Error('Ground disappeared or recovery route bound reached');
   const route=routeToGround(map,client.self,ground,client.entities,{maxSteps:60-walked});await client.move(route[0],generation);
  }
  await pause(1500);
  if(client.generation!==generation||client.self.dead||!client.ground.items.has(ground.id))throw new Error('Ground or map changed before native pickup');
  const stacked=[...client.ground.items.values()].filter(item=>item.x===ground.x&&item.y===ground.y);
  check('native pickup tile contains only diagnosed ore',stacked.length===1&&stacked[0].id===ground.id);
  const at=client.events.length;report.operation='native pickup diagnosed ore';client.send({type:'pickup'});
  const picked=await client.wait(at,message=>message.type==='itemAdded'&&message.item.makeIndex===expected.makeIndex);
  check('recovered SM200 preserves original instance and raw purity',assertOreInstance(picked.item,expected));
  await client.wait(at,message=>message.type==='groundItemRemoved'&&message.id===ground.id);
 }
 await client.close();await pause(4000);client=new RecoveryClient();await client.enter();
 check('recovered original ore persists after normal relogin',assertOreInstance(client.inventory.get(expected.makeIndex),expected));
 report.ok=true;
}catch(error){report.ok=false;report.failure=error instanceof Error?error.message:'Isolated ore recovery failed';console.log('FAIL '+report.failure);process.exitCode=1;}
finally{
 for(const client of clients)await client.close();report.finishedAt=new Date().toISOString();
 await mkdir('.runtime/reports',{recursive:true});await writeFile('.runtime/reports/mining-ore-recovery.json',JSON.stringify(report,null,2)+'\n');
}
