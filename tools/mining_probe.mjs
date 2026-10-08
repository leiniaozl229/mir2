// Three phases, all restricted to newly generated m[8hex]/M[8hex] fixtures.
// --create-only registers a warrior through real protocol and saves normally.
// After normal shutdown + backup, Root prepares only that private fixture.
// --run never grants ore, changes mining rates, or edits the database.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {MiningGroundCache,readClassicMiningMap,routeToGround,assertOreInstance} from './mining_probe_ground.mjs';
const args=new Set(process.argv.slice(2));
if(args.has('--help')||(!args.has('--create-only')&&!args.has('--purchase')&&!args.has('--run'))){
 console.log('Usage: node tools/mining_probe.mjs --create-only | --purchase | --run');
 console.log('Private fixtures: .runtime/mining-fixtures.json. Prepare a usable pickaxe and a real MINE map after normal shutdown + backup.');
 process.exit(args.has('--help')?0:2);
}
if(args.size!==1)throw new Error('Choose exactly one mining probe phase');
const endpoint=process.env.MIR2_GATEWAY_URL??'ws://127.0.0.1:18801/ws',url=new URL(endpoint);
if(url.username||url.password)throw new Error('Gateway URL must not contain credentials');
const fixturePath='.runtime/mining-fixtures.json',reportPath='.runtime/reports/mining-live.json';
const report={schemaVersion:1,startedAt:new Date().toISOString(),phase:args.has('--run')?'run':args.has('--purchase')?'purchase':'create-only',
 endpoint:url.protocol+'//'+url.host+url.pathname,checks:[],limits:[
  'Real protocol evidence remains distinct from production browser interaction and original client comparison.',
  'DIG confirms fragments only; ore comes exclusively from server SM200. Native ore randomness is unchanged.',
  'Only isolated generated fixture identities are used. Normal shutdown and backup are required before preparation or cleanup.'
 ]};
const prior=JSON.parse(await readFile(fixturePath,'utf8').catch(e=>{if(e.code==='ENOENT')return '{"fixtures":[]}';throw e;}));
if(!Array.isArray(prior.fixtures))throw new Error('Invalid fixture manifest');
const seen=new Set();
for(const f of prior.fixtures){
 if(!/^m[0-9a-f]{8}$/.test(f.account)||f.character!=='M'+f.account.slice(1)||seen.has(f.account))throw new Error('Fixture identity outside mining namespace');
 seen.add(f.account);
}
const fixtures=prior.cleaned?[]:prior.fixtures,clients=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
function check(name,passed,details={}){
 report.checks.push({name,passed:!!passed,...details});console.log((passed?'PASS ':'FAIL ')+name);
 if(!passed)throw new Error(name);
}
function summary(m){
 const result={};
 for(const k of ['type','id','actionId','kind','accepted','mapGeneration','direction','x','y','looks','reason','code'])
  if(['string','number','boolean'].includes(typeof m[k]))result[k]=m[k];
 if(m.type==='legacy'&&m.id===-1&&['=DIG'].includes(m.status))result.status=m.status;
 return result;
}
class Client{
 constructor(){
  this.events=[];this.inventory=new Map();this.equipment=new Map();this.entities=new Map();this.groundItems=new MiningGroundCache();
  this.generation=0;this.actionSerial=100000;this.socket=new WebSocket(endpoint);clients.push(this);
  this.socket.addEventListener('message',event=>{
   const envelope=JSON.parse(event.data),m=envelope.message;this.generation=envelope.mapGeneration;this.events.push(m);
   try{this.groundItems.apply(m,this.generation);}catch{this.groundFailure=true;}
   if(m.type==='map'){this.map=m.map;this.entities.clear();this.self=undefined;}
   if(m.type==='entity'){const e={...this.entities.get(m.id),...m};this.entities.set(m.id,e);if(m.self)this.self=e;}
   if(m.type==='entityDied'&&this.entities.has(m.id))this.entities.get(m.id).dead=true;
   if(m.type==='entityRemoved')this.entities.delete(m.id);
   if(m.type==='actionResult'&&m.kind==='move'&&this.self&&Number.isFinite(m.x))Object.assign(this.self,{x:m.x,y:m.y});
   if(m.type==='inventory')this.inventory=new Map(m.items.map(i=>[i.makeIndex,i]));
   if(m.type==='itemAdded'||m.type==='itemUpdated')this.inventory.set(m.item.makeIndex,m.item);
   if(m.type==='itemRemoved')this.inventory.delete(m.makeIndex);
   if(m.type==='equipment')this.equipment=new Map(m.slots.map(s=>[s.slot,s.item]));
   if(m.type==='equipmentDurability')this.equipment.set(m.slot,m.item);
   if(m.type==='equipmentBroken')this.equipment.delete(m.slot);
   if(m.type==='itemActionResult'&&m.accepted){
    if(m.kind==='equip'){this.inventory.delete(m.makeIndex);this.equipment.set(m.slot,m.item);}
    if(m.kind==='takeoff')this.equipment.delete(m.slot);
   }
   if(m.type==='dropResult'&&m.accepted)this.inventory.delete(m.makeIndex);
  });
 }
 send(command){this.socket.send(JSON.stringify(command));}
 async wait(at,predicate,ms=15000,allowError=false){
  const end=Date.now()+ms;
  while(Date.now()<end){
   if(this.groundFailure)throw new Error('Invalid authoritative mining ground item');
   const found=this.events.slice(at).find(predicate);if(found)return found;
   if(!allowError&&this.events.slice(at).some(m=>m.type==='error'))throw new Error('Gateway rejected mining fixture operation');
   if(this.socket.readyState===WebSocket.CLOSED)throw new Error('Mining fixture connection ended unexpectedly');
   await pause(20);
  }
  report.timeout={operation:report.operation,mapGeneration:this.generation,events:this.events.slice(at).slice(-16).map(summary)};
  throw new Error('Mining fixture response timeout');
 }
 async enter(fixture,create=false){
  report.operation=create?'create independent fixture':'enter independent fixture';
  const connected=await this.wait(0,m=>m.type==='connected');
  check('gateway advertises dedicated mining intent',connected.features?.mining);
  let at=this.events.length;
  if(create){
   this.send({type:'register',account:fixture.account,password:fixture.password});
   check('isolated fixture registration accepted',(await this.wait(at,m=>m.type==='registrationResult')).accepted);
  }
  at=this.events.length;this.send({type:'login',account:fixture.account,password:fixture.password});
  await this.wait(at,m=>m.type==='characters');
  if(create){
   at=this.events.length;this.send({type:'createCharacter',name:fixture.character,job:0,sex:0,hair:0});
   check('isolated warrior creation accepted',(await this.wait(at,m=>m.type==='characterCreationResult')).accepted);
   await this.wait(at,m=>m.type==='characters');
  }
  at=this.events.length;this.send({type:'selectCharacter',name:fixture.character});
  await this.wait(at,m=>m.type==='entity'&&m.self,45000);
  await this.wait(at,m=>m.type==='equipment',45000);
  const inventoryAt=this.events.length;this.send({type:'inventory'});await this.wait(inventoryAt,m=>m.type==='inventory');
  await pause(1500);
 }
 async close(){if(this.socket.readyState===WebSocket.OPEN)this.socket.close();const end=Date.now()+5000;while(this.socket.readyState!==WebSocket.CLOSED&&Date.now()<end)await pause(20);}
 async action(type,fields={},allowError=false){
  await pause(1500);const actionId=++this.actionSerial,at=this.events.length;
  report.operation=type;this.send({type,...fields,actionId,mapGeneration:this.generation});
  return this.wait(at,m=>m.actionId===actionId&&(m.type==='actionResult'||m.type==='error'),15000,allowError);
 }
 async item(type,fields){
  const at=this.events.length;report.operation=type;this.send({type,...fields});
  const result=await this.wait(at,m=>m.type==='itemActionResult'&&m.kind===(type==='equipItem'?'equip':'takeoff'));
  check('native '+type+' accepted',result.accepted);await pause(1500);return result;
 }
 async reject(fields,name){
  const at=this.events.length,actionId=++this.actionSerial;
  this.send({type:'mine',direction:2,actionId,mapGeneration:this.generation,...fields});
  const result=await this.wait(at,m=>m.type==='error'&&m.actionId===actionId,15000,true);
  check(name,result.code==='command_rejected'&&result.kind==='mine');
 }
}
try{
 report.sourceSha256={};
 for(const file of ['tools/mining_probe.mjs','tools/mining_probe_ground.mjs','services/web-gateway/MiningCommand.cs','services/web-gateway/GatewaySession.cs','services/web-gateway/LegacyCodec.cs','vendor/openmir2/src/M2Server/Maps/Envirnoment.cs','vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs'])
  report.sourceSha256[file]=createHash('sha256').update(await readFile(file)).digest('hex');
 report.localRuntimeFiles={scope:'Local filesystem fingerprints; remote gateway deployment is not inferred',sha256:{}};
 for(const file of ['.runtime/server/Mir200/M2Server.dll','.runtime/server/Mir200/SystemModule.dll']){
  const bytes=await readFile(file).catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});
  if(bytes)report.localRuntimeFiles.sha256[file]=createHash('sha256').update(bytes).digest('hex');
 }
 if(args.has('--create-only')){
  if(fixtures.length)throw new Error('An uncleaned independent mining fixture already exists; reuse or clean it before another creation');
  const suffix=randomBytes(4).toString('hex'),fixture={account:'m'+suffix,password:randomBytes(4).toString('hex'),character:'M'+suffix,createdAt:new Date().toISOString()};
  fixtures.push(fixture);await mkdir('.runtime',{recursive:true});await writeFile(fixturePath,JSON.stringify({schemaVersion:1,fixtures},null,2)+'\n');
  const client=new Client();await client.enter(fixture,true);await client.close();await pause(4000);
  report.preparationRequired={map:'existing MINE map (currently D401)',weapon:'existing server Shape19 pickaxe, usable durability, equipped slot1 or in bag',
   level:'meet original pickaxe equipment requirement',position:'walkable cell near internal blocked mine wall',rules:'preserve MakeMineHitRate/MakeMineRate and all quality rules'};
  report.ok=true;report.closedLoopVerified=false;
 }else if(args.has('--purchase')){
  const fixture=fixtures.at(-1);if(!fixture||fixture.preparedStage!=='purchase')throw new Error('Prepare the isolated purchase stage after normal shutdown and backup first');
  const client=new Client();await client.enter(fixture);
  check('purchase stage is in existing map 0',client.map==='0');
  const trader=[...client.entities.values()].find(e=>e.kind==='npc'&&e.name==='综合商人'&&Math.max(Math.abs(e.x-client.self.x),Math.abs(e.y-client.self.y))<=1);
  check('confirmed existing general merchant is adjacent',!!trader);
  const stamp={npcId:trader.id,npcSessionId:1,mapGeneration:client.generation};
  let at=client.events.length;client.send({type:'npc',targetId:trader.id,...stamp});
  const dialogue=await client.wait(at,m=>m.type==='npcDialogue'&&m.npcId===trader.id&&m.npcSessionId===1);
  check('native merchant exposes purchase option',dialogue.options.some(o=>o.command==='@buy'));
  at=client.events.length;client.send({type:'dialogueSelect',command:'@buy',...stamp});
  const shop=await client.wait(at,m=>m.type==='shop'&&m.npcId===trader.id);
  check('native shop stocks original pickaxe',shop.items.some(i=>i.name==='鹤嘴锄'&&i.stock>0));
  at=client.events.length;client.send({type:'shopDetails',name:'鹤嘴锄',page:0,...stamp});
  const details=await client.wait(at,m=>m.type==='shopDetails'&&m.npcId===trader.id);
  const offered=details.items.find(i=>i.durability>=5000);
  check('real pickaxe stock supports bounded unchanged-rate sample',!!offered,{minimumRawDurability:5000});
  at=client.events.length;client.send({type:'buyShopItem',name:'鹤嘴锄',makeIndex:offered.makeIndex,...stamp});
  const bought=await client.wait(at,m=>m.type==='shopPurchaseResult');
  check('native original pickaxe purchase accepted',bought.accepted);
  const actual=await client.wait(at,m=>m.type==='itemAdded'&&m.item.name==='鹤嘴锄');
  check('purchased pickaxe is a real server instance',actual.item.shape===19&&actual.item.durability>=5000);
  await client.item('equipItem',{slot:1,makeIndex:actual.item.makeIndex});
  client.send({type:'npcClose',...stamp});await client.close();await pause(4000);
  fixture.pickaxePurchasedAt=new Date().toISOString();
  await writeFile(fixturePath,JSON.stringify({schemaVersion:1,fixtures},null,2)+'\n');
  report.ok=true;report.closedLoopVerified=false;
 }else{
  const fixture=fixtures.at(-1);if(!fixture||typeof fixture.password!=='string')throw new Error('Create an independent fixture first; prepare it after normal shutdown and backup');
  let client=new Client();await client.enter(fixture);
  const mapInfo=await readFile('.runtime/server/Mir200/Envir/MapInfo.txt');
  const mapLine=new TextDecoder('utf-8').decode(mapInfo).split(/\r?\n/).find(line=>line.startsWith('['+client.map+' ')&&/\bMINE\b/.test(line));
  check('native character entered an existing real MINE map',!!mapLine,{map:client.map});
  report.mapInfoSha256=createHash('sha256').update(mapInfo).digest('hex');
  if(!/^[A-Za-z0-9_]+$/.test(client.map))throw new Error('Unsupported fixture map identifier');
  const bytes=await readFile('.runtime/server/Mir200/Map/'+client.map+'.map'),miningMap=readClassicMiningMap(bytes);
  const {inBounds,walkable}=miningMap;
  const wallDirection=p=>directions.findIndex(([dx,dy])=>inBounds(p.x+dx,p.y+dy)&&!walkable(p.x+dx,p.y+dy));
  const occupied=new Set([...client.entities.values()].filter(e=>!e.self&&!e.dead).map(e=>e.x+','+e.y));
  const queue=[{x:client.self.x,y:client.self.y,route:[]}],visited=new Set([client.self.x+','+client.self.y]);let goal;
  for(let i=0;i<queue.length&&i<12000;i++){
   const p=queue[i];if(wallDirection(p)>=0){goal=p;break;}if(p.route.length>=60)continue;
   directions.forEach(([dx,dy],direction)=>{
    const x=p.x+dx,y=p.y+dy,k=x+','+y;if(!walkable(x,y)||visited.has(k)||occupied.has(k))return;
    visited.add(k);queue.push({x,y,route:[...p.route,{x,y,direction}]});
   });
  }
  check('reachable internal mine wall exists',!!goal);
  for(const step of goal.route){const result=await client.action('move',step);check('native route step accepted',result.accepted);}
  const direction=wallDirection(client.self),position={x:client.self.x,y:client.self.y};
  check('confirmed player faces a blocked internal wall intent',direction>=0);
  let pickaxe=client.equipment.get(1);
  if(pickaxe){await client.item('takeOffItem',{slot:1});pickaxe=client.inventory.get(pickaxe.makeIndex);}
  if(!pickaxe||pickaxe.shape!==19)pickaxe=[...client.inventory.values()].find(i=>i.shape===19&&i.durability>0);
  check('native isolated fixture owns a usable real pickaxe',!!pickaxe&&pickaxe.durability>0);
  await client.reject({direction},'unarmed mining rejected');
  await client.item('equipItem',{slot:1,makeIndex:pickaxe.makeIndex});
  await client.reject({direction:8},'invalid mining direction rejected');
  await client.reject({mapGeneration:client.generation-1},'stale map mining rejected');
  await client.reject({x:999,y:999},'client-selected mining coordinates rejected');
  await client.reject({ore:'gold',quality:99},'client-selected ore reward rejected');
  const before=new Set(client.inventory.keys()),at=client.events.length;
  const swings=Number(process.env.MIR2_MINING_MAX_SWINGS??240);
  if(!Number.isInteger(swings)||swings<1||swings>1000)throw new Error('Invalid bounded mining sample size');
  let attempts=0,ore;
  for(;attempts<swings&&!ore;attempts++){
   const result=await client.action('mine',{direction});
   check('real native mining swing accepted',result.kind==='mine'&&result.accepted,{attempt:attempts+1});
   check('mining retained authoritative position',client.self.x===position.x&&client.self.y===position.y);
   ore=[...client.inventory.values()].find(i=>i.stdMode===43&&!before.has(i.makeIndex));
   if(!client.equipment.get(1)?.durability)throw new Error('Native pickaxe broke during bounded sampling');
  }
  const events=client.events.slice(at);
  report.sample={attempts,maximum:swings,fragments:events.filter(m=>m.type==='miningStrike').length,
   authoritativeOreAdds:events.filter(m=>m.type==='itemAdded'&&m.item.stdMode===43).map(m=>({makeIndex:m.item.makeIndex,durability:m.item.durability}))};
  check('native DIG fragment received without protocol disconnect',report.sample.fragments>0);
  if(!ore){report.insufficientNativeOreSample=true;throw new Error('No native ore within bounded unchanged-randomness sample; ore loop remains unverified');}
  check('ore comes from native SM200 actual instance and raw purity',events.some(m=>m.type==='itemAdded'&&m.item.makeIndex===ore.makeIndex&&m.item.stdMode===43&&m.item.durability===ore.durability),
   {makeIndex:ore.makeIndex,rawPurity:ore.durability});
  const rawPurity=ore.durability,oreId=ore.makeIndex,map=client.map,generation=client.generation;
  const dropOrigin={x:client.self.x,y:client.self.y},knownGroundIds=client.groundItems.snapshotIds();let itemAt=client.events.length;
  report.operation='drop mined ore';
  client.send({type:'dropItem',makeIndex:oreId});const dropped=await client.wait(itemAt,m=>m.type==='dropResult'&&m.makeIndex===oreId);
  check('native ore drop accepted',dropped.accepted);
  report.operation='find newly scattered native ore';let ground;
  await client.wait(itemAt,()=>{
   ground=client.groundItems.findNewDrop(knownGroundIds,ore,dropOrigin,generation);return !!ground;
  });
  check('new native ground ore matches name looks and original drop range',!!ground,{groundId:ground.id,x:ground.x,y:ground.y,looks:ground.looks});
  report.groundRoundTrip={makeIndex:oreId,rawPurity,groundId:ground.id,map,origin:dropOrigin,drop:{x:ground.x,y:ground.y},route:[]};
  for(let walked=0;client.self.x!==ground.x||client.self.y!==ground.y;walked++){
   if(walked>=60||client.generation!==generation||client.map!==map||client.self.dead||!client.groundItems.items.has(ground.id))
    throw new Error('Ground or player state changed during native ore route');
   const route=routeToGround(miningMap,client.self,ground,client.entities,{maxSteps:60-walked}),step=route[0];
   const result=await client.action('move',step);
   check('scattered ore route step confirmed',result.kind==='move'&&result.accepted&&client.self.x===step.x&&client.self.y===step.y,{x:step.x,y:step.y});
   report.groundRoundTrip.route.push(step);
  }
  await pause(1500);
  if(client.generation!==generation||client.map!==map||client.self.dead||!client.groundItems.items.has(ground.id))throw new Error('Ground or map changed before native ore pickup');
  const stacked=[...client.groundItems.items.values()].filter(item=>item.x===ground.x&&item.y===ground.y);
  check('native pickup tile contains only the new ore',stacked.length===1&&stacked[0].id===ground.id);
  itemAt=client.events.length;report.operation='pickup scattered native ore';client.send({type:'pickup'});
  const picked=await client.wait(itemAt,m=>m.type==='itemAdded'&&m.item.makeIndex===oreId);
  check('native ore pickup preserves identity and purity',assertOreInstance(picked.item,ore));
  await client.wait(itemAt,m=>m.type==='groundItemRemoved'&&m.id===ground.id);
  check('native pickup removes the matching ground id',!client.groundItems.items.has(ground.id));
  await client.close();await pause(4000);client=new Client();await client.enter(fixture);
  const persisted=client.inventory.get(oreId),tool=client.equipment.get(1);
  check('native ore persists after normal disconnect and relogin',assertOreInstance(persisted,ore)&&client.map===map);
  check('native pickaxe persists after relogin',tool?.shape===19&&tool.makeIndex===pickaxe.makeIndex);
  report.ok=true;report.closedLoopVerified=true;
 }
}catch(error){
 report.ok=false;report.failure=error instanceof Error?error.message:'Mining probe failed';console.log('FAIL '+report.failure);process.exitCode=1;
}finally{
 for(const client of clients)await client.close();
 report.finishedAt=new Date().toISOString();await mkdir('.runtime/reports',{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
}
