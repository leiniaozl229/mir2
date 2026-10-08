// Live WebSocket -> fixed native server checks. Run only against the isolated
// verification world after deploying the gateway and native skill-key changes.
// Credentials are confined to the ignored fixture manifest, never the report.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';

const endpoint=process.env.MIR2_GATEWAY_URL??'ws://127.0.0.1:18801/ws';
const endpointUrl=new URL(endpoint);
if(endpointUrl.username||endpointUrl.password)throw new Error('Gateway URL must not contain credentials');
const fixturePath='.runtime/npc-skill-fixtures.json';
const reportPath='.runtime/reports/npc-skill-live.json';
const report={schemaVersion:1,startedAt:new Date().toISOString(),endpoint,checks:[],limits:[
 'Native protocol evidence; production browser UI and original client comparison remain separate.',
 'No fabricated native ACK or delayed native packet injection. Same-actor late legacy replies have no request nonce.',
 'Only a newly generated isolated fixture account and character are used; stop the engine normally before cleanup.'
]};
const prior=JSON.parse(await readFile(fixturePath,'utf8').catch(error=>{
 if(error.code==='ENOENT')return '{"fixtures":[]}';throw error;
}));
if(!Array.isArray(prior.fixtures))throw new Error('Invalid existing fixture manifest');
const fixtures=prior.cleaned?[]:prior.fixtures,clients=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const mapBytes=await readFile('.runtime/server/Mir200/Map/0.map');
const width=mapBytes.readUInt16LE(0),height=mapBytes.readUInt16LE(2);
const nativeSetting=new TextDecoder('gb18030').decode(await readFile('.runtime/server/Mir200/setting.conf'));
const clickNpcSetting=nativeSetting.match(/^ClickNpcTime\s*=\s*(\d+)\s*$/m);
// PlayObject.Base.cs:685 uses strict >; GameSvrConf.cs:1481 defaults to 1000.
const clickNpcTimeMs=Number(clickNpcSetting?.[1]??1000);
if(!Number.isSafeInteger(clickNpcTimeMs)||clickNpcTimeMs<0)throw new Error('Invalid native NPC click interval');
report.nativeNpcThrottle={clickNpcTimeMs,source:clickNpcSetting?'runtime setting.conf':'GameSvrConf.cs default; setting.conf has no override',comparison:'strict >'};
function safeEvent(message){
 const summary={};
 for(const key of ['type','id','npcId','npcSessionId','mapGeneration','bindingId','commandType','code'])
  if(['string','number','boolean'].includes(typeof message[key]))summary[key]=message[key];
 if(message.type==='legacy'&&[643,644,645].includes(message.id))
  for(const key of ['recog','param','tag','series'])
   if(Number.isFinite(message[key]))summary[key]=message[key];
 return summary;
}
function walkable(x,y){
 if(x<0||y<0||x>=width||y>=height)return false;
 const at=52+(x*height+y)*12;
 return !((mapBytes.readUInt16LE(at)|mapBytes.readUInt16LE(at+4))&0x8000);
}
function check(name,passed,details={}){
 report.checks.push({name,passed:!!passed,...details});
 console.log(`${passed?'PASS':'FAIL'} ${name}`);
 if(!passed)throw new Error(name);
}
const keys=skills=>skills.map(skill=>({magicId:skill.magicId,key:skill.key})).sort((a,b)=>a.magicId-b.magicId);
const fingerprint=skills=>JSON.stringify(keys(skills));
class Client{
 constructor(){
  this.events=[];this.entities=new Map();this.skills=new Map();this.rejected=new Map();
  this.generation=0;this.actionSerial=500000;this.bindingSerial=0;this.npcSerial=0;
  this.lastNpcReplyAt=0;this.operation={type:'connect'};
  this.socket=new WebSocket(endpoint);clients.push(this);
  this.socket.addEventListener('message',event=>{
   const envelope=JSON.parse(event.data),m=envelope.message;
   this.generation=envelope.mapGeneration;this.events.push(m);
   if(m.type==='map'){this.entities.clear();this.self=undefined;this.map=m.map;}
   if(m.type==='entity'){
    const previous=this.entities.get(m.id),entity={...previous,...m,name:m.name??previous?.name,feature:m.feature??previous?.feature};
    this.entities.set(m.id,entity);if(m.self)this.self=entity;
   }
   if(m.type==='entityRemoved')this.entities.delete(m.id);
   if(m.type==='entityDied'&&this.entities.has(m.id))this.entities.get(m.id).dead=true;
   if(m.type==='actionResult'&&m.kind==='move'&&this.self)Object.assign(this.self,{x:m.x,y:m.y});
   if(m.type==='skills')this.skills=new Map(m.skills.map(skill=>[skill.magicId,{...skill}]));
   if(m.type==='skillAdded')this.skills.set(m.skill.magicId,{...m.skill});
   if(m.type==='skillRemoved')this.skills.delete(m.magicId);
  });
 }
 send(command){this.socket.send(JSON.stringify(command));}
 operationAt(type,details={}){this.operation={type,...details};report.currentOperation=this.operation;}
 async wait(at,predicate,timeout=15000,allowErrors=false){
  const end=Date.now()+timeout;
  while(Date.now()<end){
   const recent=this.events.slice(at),found=recent.find(predicate);
   if(found)return found;
   const rejected=recent.find(m=>m.type==='error');
   if(!allowErrors&&rejected){
    report.lastRejected={operation:this.operation,event:safeEvent(rejected)};
    throw new Error('Gateway rejected the expected fixture operation');
   }
   if(this.socket.readyState===WebSocket.CLOSED)throw new Error('Gateway disconnected before expected response');
   await pause(20);
  }
  report.lastTimeout={operation:this.operation,mapGeneration:this.generation,events:this.events.slice(at).slice(-18).map(safeEvent)};
  console.log('TIMEOUT '+JSON.stringify(report.lastTimeout));
  throw new Error('Expected native fixture response timed out during '+this.operation.type);
 }
 async ready(){
  const connected=await this.wait(0,m=>m.type==='connected');
  check('gateway advertises magicKeyBinding and npcSessions',connected.features?.magicKeyBinding&&connected.features?.npcSessions);
 }
 async enter(fixture,create=false){
  this.operationAt(create?'create isolated fixture':'relogin isolated fixture');
  await this.ready();
  let at=this.events.length;
  if(create){
   this.send({type:'register',account:fixture.account,password:fixture.password});
   if(!(await this.wait(at,m=>m.type==='registrationResult')).accepted)throw new Error('Fixture registration rejected');
  }
  at=this.events.length;this.send({type:'login',account:fixture.account,password:fixture.password});
  await this.wait(at,m=>m.type==='characters');
  if(create){
   at=this.events.length;this.send({type:'createCharacter',name:fixture.character,job:1,sex:0,hair:0});
   if(!(await this.wait(at,m=>m.type==='characterCreationResult')).accepted)throw new Error('Fixture creation rejected');
   await this.wait(at,m=>m.type==='characters');
  }
  at=this.events.length;this.send({type:'selectCharacter',name:fixture.character});
  await this.wait(at,m=>m.type==='entity'&&m.self,45000);
  await this.wait(at,m=>m.type==='skills',45000);await pause(1300);
  if(this.map!=='0')throw new Error('Probe requires the isolated map 0 spawn');
 }
 route(goal,budget=70){
  const occupied=new Set([...this.entities.values()].filter(e=>!e.self&&!e.dead).map(e=>`${e.x},${e.y}`));
  for(const [cell,until] of this.rejected)if(until>Date.now())occupied.add(cell);else this.rejected.delete(cell);
  const queue=[{x:this.self.x,y:this.self.y,route:[]}],seen=new Set([`${this.self.x},${this.self.y}`]);
  for(let i=0;i<queue.length&&i<15000;i++){
   const node=queue[i];if(goal(node))return node.route;if(node.route.length>=budget)continue;
   for(let direction=0;direction<8;direction++){
    const x=node.x+directions[direction][0],y=node.y+directions[direction][1],cell=`${x},${y}`;
    if(seen.has(cell)||!walkable(x,y)||occupied.has(cell))continue;
    seen.add(cell);queue.push({x,y,route:[...node.route,{x,y,direction}]});
   }
  }
  throw new Error('No walkable isolated fixture route');
 }
 async move(step){
  await pause(850);const at=this.events.length,actionId=++this.actionSerial;
  this.operationAt('move',{actionId,mapGeneration:this.generation});
  this.send({type:'move',...step,actionId,mapGeneration:this.generation});
  return await this.wait(at,m=>m.type==='actionResult'&&m.actionId===actionId);
 }
 async walk(route){
  if(!route.length)return;
  const goal=route.at(-1);let failures=0;
  while(route.length){
   const step=route.shift(),result=await this.move(step);
   if(result.accepted)continue;
   if(result.reason!==28||++failures>6)throw new Error('Fixture route remained occupied');
   this.rejected.set(`${step.x},${step.y}`,Date.now()+1500);
   route=this.route(p=>p.x===goal.x&&p.y===goal.y);
  }
 }
 async openNpc(npc){
  await this.walk(this.route(p=>Math.max(Math.abs(p.x-npc.x),Math.abs(p.y-npc.y))===1));
  const earliest=this.lastNpcReplyAt+clickNpcTimeMs+100;
  while(Date.now()<earliest)await pause(Math.min(1000,earliest-Date.now()));
  const stamp={npcId:npc.id,npcSessionId:++this.npcSerial,mapGeneration:this.generation};
  this.operationAt('open NPC',{...stamp});
  const at=this.events.length;this.send({type:'npc',targetId:npc.id,...stamp});
  const dialogue=await this.wait(at,m=>m.type==='npcDialogue'&&m.npcId===npc.id&&m.npcSessionId===stamp.npcSessionId);
  this.lastNpcReplyAt=Date.now();
  check('native NPC dialogue carries current conversation stamp',dialogue.mapGeneration===stamp.mapGeneration&&!dialogue.automatic);
  return {stamp,dialogue};
 }
 async choose(stamp,command){
  this.operationAt('select NPC option',{...stamp});
  const at=this.events.length;this.send({type:'dialogueSelect',...stamp,command});
  return this.wait(at,m=>m.type==='npcDialogue'&&m.npcId===stamp.npcId&&m.npcSessionId===stamp.npcSessionId);
 }
 async bind(magicId,key){
  const bindingId=++this.bindingSerial;
  this.operationAt('bind skill',{magicId,key,bindingId});
  const at=this.events.length;this.send({type:'setMagicKey',magicId,key,bindingId});
  const snapshot=await this.wait(at,m=>m.type==='skills'&&m.skills.some(s=>s.magicId===magicId&&s.key===key)
   &&(key===0||m.skills.filter(s=>s.key===key).length===1));
  await this.wait(at,m=>m.type==='magicKeyResult'&&m.magicId===magicId&&m.key===key&&m.bindingId===bindingId&&m.accepted);
  await this.wait(at,m=>m.type==='legacy'&&m.id===211);
  check(`CM1008 key ${key} confirms through actual native 211`,true,{magicId,key,keys:keys(snapshot.skills)});
  check('skill key change emits no move/spell action result',!this.events.slice(at).some(m=>m.type==='actionResult'));
  return snapshot.skills;
 }
 async reject(command,name){
  this.operationAt('reject command',{...safeEvent(command)});
  const before=fingerprint([...this.skills.values()]),at=this.events.length;
  this.send(command);
  const error=await this.wait(at,m=>m.type==='error'&&m.code==='command_rejected'&&m.commandType===command.type,15000,true);
  await pause(300);
  check(name,error.commandType===command.type&&before===fingerprint([...this.skills.values()]),{
   commandType:command.type,code:error.code,
   ...(command.npcSessionId!==undefined?{npcSessionId:error.npcSessionId,mapGeneration:error.mapGeneration}: {})
  });
 }
 async close(){
  if(this.socket.readyState===WebSocket.CLOSED)return;
  const closed=new Promise(resolve=>this.socket.addEventListener('close',resolve,{once:true}));
  this.socket.close();await Promise.race([closed,pause(5000)]);
 }
}
try{
 const token=randomBytes(4).toString('hex'),fixture={account:`s${token}`,password:randomBytes(5).toString('hex'),character:`S${token}`,job:1};
 fixtures.push(fixture);await mkdir('.runtime',{recursive:true});
 await writeFile(fixturePath,JSON.stringify({createdAt:prior.createdAt??new Date().toISOString(),fixtures},null,2)+'\n',{mode:0o600});
 const sourcePaths=['services/web-gateway/GatewaySession.cs','services/web-gateway/MagicKeyBinding.cs','services/web-gateway/NpcConversation.cs','vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs'];
 report.sourceSha256=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
 let client=new Client();await client.enter(fixture,true);
 const trainer=[...client.entities.values()].filter(e=>(e.feature&255)===50&&/导师/.test(e.name??''))
  .sort((a,b)=>Math.max(Math.abs(a.x-client.self.x),Math.abs(a.y-client.self.y))-Math.max(Math.abs(b.x-client.self.x),Math.abs(b.y-client.self.y)))[0];
 if(!trainer)throw new Error('Isolated skill trainer is outside fixture view');
 const {stamp}=await client.openNpc(trainer);
 await client.choose(stamp,'@skills');await client.choose(stamp,'@wizardset');
 await client.wait(0,()=>client.skills.size>=3);await pause(500);
 check('isolated wizard trainer supplies multiple native learned skills',client.skills.size>=3);
 const ids=[...client.skills.keys()].sort((a,b)=>a-b),[first,second,third]=ids;
 for(let key=49;key<=56;key++)await client.bind(first,key);
 let snapshot=await client.bind(second,56);
 check('binding occupied F8 unbinds the previous skill on the server',snapshot.find(s=>s.magicId===first)?.key===0&&snapshot.find(s=>s.magicId===second)?.key===56);
 snapshot=await client.bind(second,0);
 check('None leaves F8 empty in native snapshot',snapshot.every(s=>s.key!==56));
 for(const key of [1,8,48,57,-1,256])await client.reject({type:'setMagicKey',magicId:first,key},`invalid key ${key} rejects without key changes`);
 const unknown=Array.from({length:65535},(_,i)=>i+1).reverse().find(id=>!client.skills.has(id));
 await client.reject({type:'setMagicKey',magicId:unknown,key:49},'unlearned skill rejects without key changes');
 // A key reply has no +GD. An immediately following move has its own actionId.
 await pause(900);const step=client.route(p=>Math.max(Math.abs(p.x-client.self.x),Math.abs(p.y-client.self.y))===1)[0];
 const moveAt=client.events.length,actionId=++client.actionSerial;
 const moveBindingId=++client.bindingSerial;
 client.operationAt('bind and immediately move',{bindingId:moveBindingId,actionId,mapGeneration:client.generation});
 client.send({type:'setMagicKey',magicId:first,key:50,bindingId:moveBindingId});
 client.send({type:'move',...step,actionId,mapGeneration:client.generation});
 const movement=await client.wait(moveAt,m=>m.type==='actionResult'&&m.actionId===actionId);
 await client.wait(moveAt,m=>m.type==='magicKeyResult'&&m.magicId===first&&m.key===50&&m.bindingId===moveBindingId&&m.accepted);
 await client.wait(moveAt,m=>m.type==='legacy'&&m.id===211);
 check('move immediately after binding has independent native action confirmation',movement.accepted&&movement.kind==='move'&&movement.x===step.x&&movement.y===step.y,{actionId,x:movement.x,y:movement.y});

 const a=await client.openNpc(trainer);
 // MerChant.txt map 0: 综合商人 at 329,270. Its isolated script has
 // [@main] with buy/sell/repair links, so it is a dialogued merchant.
 const merchantScriptPath='.runtime/server/Mir200/Envir/Market_Def/测试/综合商人-0.txt';
 const merchantScript=await readFile(merchantScriptPath);
 if(!merchantScript.includes(Buffer.from('[@main]')))throw new Error('Isolated second merchant script has no main dialogue');
 report.secondNpcSource={path:merchantScriptPath,sha256:createHash('sha256').update(merchantScript).digest('hex'),main:true};
 const secondNpcNames=[/综合商人/];
 const others=[...client.entities.values()].filter(e=>e.id!==trainer.id&&(e.feature&255)===50&&!e.dead&&secondNpcNames.some(pattern=>pattern.test(e.name??'')))
  .sort((l,r)=>Math.max(Math.abs(l.x-client.self.x),Math.abs(l.y-client.self.y))-Math.max(Math.abs(r.x-client.self.x),Math.abs(r.y-client.self.y)));
 let secondNpc;
 for(const candidate of others){try{client.route(p=>Math.max(Math.abs(p.x-candidate.x),Math.abs(p.y-candidate.y))===1);secondNpc=candidate;break;}catch{}}
 if(!secondNpc){
  report.availableNpcIds=[...client.entities.values()].filter(e=>(e.feature&255)===50&&!e.dead).map(e=>e.id);
  throw new Error('The reachable isolated general merchant is required; A-to-B check cannot use a decorative or same actor');
 }
 report.secondNpcId=secondNpc.id;
 const b=await client.openNpc(secondNpc);
 check('A to B NPC switch allocates a different current stamp',a.stamp.npcId!==b.stamp.npcId&&b.stamp.npcSessionId>a.stamp.npcSessionId);
 await client.reject({type:'dialogueSelect',...a.stamp,command:'@main'},'old NPC A command rejects while B is active');
 // A stale close must leave B active.
 client.send({type:'npcClose',...a.stamp});
 const bAgain=await client.choose(b.stamp,'@main');
 check('stale A close preserves current B dialogue',bAgain.npcSessionId===b.stamp.npcSessionId);
 client.send({type:'npcClose',...b.stamp});
 await client.reject({type:'dialogueSelect',...b.stamp,command:'@main'},'closed B command rejects with its original stamp');
 const reopened=await client.openNpc(trainer);
 check('new NPC opening after close has a fresh identity',reopened.stamp.npcSessionId>b.stamp.npcSessionId);
 await client.reject({type:'dialogueSelect',...reopened.stamp,mapGeneration:reopened.stamp.mapGeneration-1,command:'@main'},'old map generation rejects without changing skills');
 client.send({type:'npcClose',...reopened.stamp});

 await client.bind(first,49);await client.bind(second,56);await client.bind(third,0);
 const expected=keys([...client.skills.values()]);
 report.expectedPersistentKeys=expected;
 await client.close();await pause(4000);
 client=new Client();await client.enter(fixture);
 await client.wait(0,m=>m.type==='skills'&&m.skills.length>=expected.length);
 check('normal disconnect and relogin persist None and sparse F1/F8 bindings',fingerprint([...client.skills.values()])===JSON.stringify(expected),{restoredKeys:keys([...client.skills.values()])});
 check('relogin snapshot has at most one learned skill in each F slot',[49,50,51,52,53,54,55,56].every(key=>[...client.skills.values()].filter(skill=>skill.key===key).length<=1));
 report.ok=true;
}catch(error){
 report.ok=false;report.error=error instanceof Error?error.message:'Probe failed';
 console.log(`FAIL ${report.error}`);process.exitCode=1;
}finally{
 await Promise.all(clients.map(client=>client.close()));
 report.finishedAt=new Date().toISOString();
 await mkdir('.runtime/reports',{recursive:true});
 await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
 console.log(`Report: ${reportPath}; private fixture cleanup: tools/cleanup_npc_skill_probe.py after normal shutdown`);
}
