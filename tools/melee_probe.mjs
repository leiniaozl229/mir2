// Explicit phases. No runtime process, DB or rule mutation is performed here.
// All account/character changes use the real protocol and only owned fixtures.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {readClassicMiningMap,routeToGround} from './mining_probe_ground.mjs';
const phases=['--create-only','--run','--low-mp'],args=process.argv.slice(2);
if(args.length!==1||!phases.includes(args[0])){console.log('Usage: node tools/melee_probe.mjs --create-only | --run | --low-mp');process.exit(args.includes('--help')?0:2);}
const phase=args[0].slice(2),endpoint=process.env.MIR2_GATEWAY_URL??'ws://127.0.0.1:18801/ws',url=new URL(endpoint);
if(url.username||url.password)throw new Error('Gateway URL must not contain credentials');
const fixturePath='.runtime/melee-fixtures.json',reportPath='.runtime/reports/melee-live-'+phase+'.json',probe='classic-warrior-melee-v1';
const report={schemaVersion:1,phase,startedAt:new Date().toISOString(),endpoint:url.protocol+'//'+url.host+url.pathname,checks:[],limits:[
 'Actual WebSocket/native protocol is separate from production browser input and original-client dynamic comparison.',
 'No damage, ore, reward, target health or native SM is fabricated; GOOD means processed input, not skill or damage success.',
 'Only protocol-owned p[8hex]/P[8hex] fixtures. Preparation and cleanup require normal shutdown and verified fresh backup.'
]};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),dirs=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]],clients=[];
const prior=JSON.parse(await readFile(fixturePath,'utf8').catch(e=>{if(e.code==='ENOENT')return '{"fixtures":[]}';throw e;}));
let fixtures=prior.cleaned?[]:prior.fixtures;
if(!Array.isArray(fixtures))throw new Error('Invalid private fixture manifest');
if(fixtures.length&&(prior.probe!==probe||fixtures.length!==2||new Set(fixtures.map(f=>f.account)).size!==2||new Set(fixtures.map(f=>f.role)).size!==2||fixtures.some(f=>!/^p[0-9a-f]{8}$/.test(f.account)||f.character!=='P'+f.account.slice(1)||!['attacker','observer'].includes(f.role))))throw new Error('Private manifest is outside isolated melee ownership');
async function save(){await mkdir('.runtime',{recursive:true});await writeFile(fixturePath,JSON.stringify({schemaVersion:1,probe,fixtures},null,2)+'\n',{mode:0o600});}
function check(name,passed,detail={}){report.checks.push({name,passed:!!passed,...detail});console.log((passed?'PASS ':'FAIL ')+name);if(!passed)throw new Error(name);}
function safe(m){const s={};for(const k of ['type','id','actionId','kind','accepted','legacyIdent','meleeKind','self','mapGeneration','direction','x','y','code'])if(['string','number','boolean'].includes(typeof m[k]))s[k]=m[k];if(m.type==='legacy'&&['+LNG','+ULNG','+WID','+UWID','+FIR','+UFIR','+PWR'].includes(m.status))s.status=m.status;return s;}
const keys=skills=>[...skills.values()].map(s=>({magicId:s.magicId,key:s.key,level:s.level})).sort((a,b)=>a.magicId-b.magicId);
class Client{
 constructor(){this.events=[];this.entities=new Map();this.inventory=new Map();this.equipment=new Map();this.skills=new Map();this.flags={};this.generation=0;this.serial=300000;this.binding=0;this.socket=new WebSocket(endpoint);clients.push(this);
  this.socket.addEventListener('message',event=>{const envelope=JSON.parse(event.data),m=envelope.message;this.generation=envelope.mapGeneration;this.events.push(m);
   if(m.type==='map'){this.map=m.map;this.entities.clear();this.self=undefined;}
   if(m.type==='entity'){const e={...this.entities.get(m.id),...m};this.entities.set(m.id,e);if(m.self)this.self=e;}
   if(m.type==='entityRemoved')this.entities.delete(m.id);if(m.type==='entityDied'&&this.entities.has(m.id))this.entities.get(m.id).dead=true;
   if(m.type==='actionResult'&&m.kind==='move'&&m.accepted&&this.self)Object.assign(this.self,{x:m.x,y:m.y});
   if(m.type==='warriorSkill')this.flags=m;if(m.type==='attributes'||m.type==='resources')this.mp=m.mp;
   if(m.type==='skills')this.skills=new Map(m.skills.map(s=>[s.magicId,s]));if(m.type==='skillAdded')this.skills.set(m.skill.magicId,m.skill);if(m.type==='skillRemoved')this.skills.delete(m.magicId);
   if(m.type==='inventory')this.inventory=new Map(m.items.map(i=>[i.makeIndex,i]));if(m.type==='itemAdded'||m.type==='itemUpdated')this.inventory.set(m.item.makeIndex,m.item);if(m.type==='itemRemoved')this.inventory.delete(m.makeIndex);
   if(m.type==='equipment')this.equipment=new Map(m.slots.map(s=>[s.slot,s.item]));if(m.type==='equipmentDurability')this.equipment.set(m.slot,m.item);if(m.type==='equipmentBroken')this.equipment.delete(m.slot);
   if(m.type==='itemActionResult'&&m.accepted&&m.kind==='equip'){this.inventory.delete(m.makeIndex);this.equipment.set(m.slot,m.item);}
  });
 }
 send(command){this.socket.send(JSON.stringify(command));}
 async wait(at,predicate,timeout=15000,allowError=false){const end=Date.now()+timeout;while(Date.now()<end){const recent=this.events.slice(at),found=recent.find(predicate);if(found)return found;if(!allowError&&recent.some(m=>m.type==='error'))throw new Error('Gateway rejected current isolated melee operation');if(this.socket.readyState===WebSocket.CLOSED)throw new Error('Isolated melee connection ended');await pause(20);}report.timeout={operation:report.operation,mapGeneration:this.generation,events:this.events.slice(at).slice(-20).map(safe)};throw new Error('Isolated melee response timeout');}
 async enter(f,create=false){await this.wait(0,m=>m.type==='connected');let at=this.events.length;
  if(create){this.send({type:'register',account:f.account,password:f.password});check('protocol-owned isolated registration',(await this.wait(at,m=>m.type==='registrationResult')).accepted);f.registered=true;f.registeredAt=new Date().toISOString();await save();}
  at=this.events.length;this.send({type:'login',account:f.account,password:f.password});const list=await this.wait(at,m=>m.type==='characters');
  if(create){check('new account owns no preexisting character',list.characters.length===0);at=this.events.length;this.send({type:'createCharacter',name:f.character,job:0,sex:0,hair:0});check('original warrior character creation',(await this.wait(at,m=>m.type==='characterCreationResult')).accepted);f.characterCreated=true;await save();await this.wait(at,m=>m.type==='characters');}
  at=this.events.length;this.send({type:'selectCharacter',name:f.character});await this.wait(at,m=>m.type==='entity'&&m.self,45000);await this.wait(at,m=>m.type==='skills',45000);await this.wait(at,m=>m.type==='equipment',45000);await this.wait(at,m=>m.type==='attributes',45000);
  const bag=this.events.length;this.send({type:'inventory'});await this.wait(bag,m=>m.type==='inventory');
 }
 async close(){if(this.socket.readyState===WebSocket.OPEN)this.socket.close();const end=Date.now()+5000;while(this.socket.readyState!==WebSocket.CLOSED&&Date.now()<end)await pause(20);if(this.socket.readyState!==WebSocket.CLOSED)throw new Error('Fixture did not disconnect normally');}
 async action(type,fields={},delay=1500){await pause(delay);const actionId=++this.serial,at=this.events.length;report.operation={type,actionId,mapGeneration:this.generation};this.send({type,...fields,actionId,mapGeneration:this.generation});const result=await this.wait(at,m=>m.type==='actionResult'&&m.actionId===actionId);check('native '+type+' retains exact request acknowledgement',result.accepted&&result.kind===(type==='castMagic'?'spell':type),{actionId});return{at,actionId,result};}
 async attack(direction,observer){const otherAt=observer?.events.length;const a=await this.action('attack',{direction});const swing=await this.wait(a.at,m=>m.type==='entityAction'&&m.self&&m.actionId===a.actionId);check('actual self SM has accepted position/direction and one action result',swing.id===this.self.id&&swing.x===this.self.x&&swing.y===this.self.y&&swing.direction===direction&&this.events.slice(a.at).filter(m=>m.type==='actionResult'&&m.actionId===a.actionId).length===1,{actionId:a.actionId,legacyIdent:swing.legacyIdent,meleeKind:swing.meleeKind});
  if(observer){const remote=await observer.wait(otherAt,m=>m.type==='entityAction'&&m.id===this.self.id);check('actual observer receives matching native melee SM',remote.meleeKind===swing.meleeKind&&remote.legacyIdent===swing.legacyIdent&&!remote.self&&remote.actionId===null,{legacyIdent:remote.legacyIdent,meleeKind:remote.meleeKind});}return swing;
 }
 async bind(id,key){const at=this.events.length,bindingId=++this.binding;this.send({type:'setMagicKey',magicId:id,key,bindingId});check('native learned skill key is confirmed by actual 211',(await this.wait(at,m=>m.type==='magicKeyResult'&&m.bindingId===bindingId)).accepted);await this.wait(at,m=>m.type==='skills'&&m.skills.some(s=>s.magicId===id&&s.key===key));}
 async walk(target,world){const route=routeToGround(world,this.self,target,this.entities,{maxSteps:25,maxNodes:12000});for(const step of route)await this.action('move',step,900);}
}
try{
 report.sourceSha256={};for(const path of ['tools/melee_probe.mjs','services/web-gateway/GatewaySession.cs','services/web-gateway/MeleeSkills.cs','services/web-gateway/WorldProjection.cs','vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs','vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs'])report.sourceSha256[path]=createHash('sha256').update(await readFile(path)).digest('hex');
 report.localRuntimeFiles={scope:'Local files only; remote gateway/runtime deployment is not inferred',sha256:{}};
 for(const path of ['.runtime/server/Mir200/M2Server.dll','.runtime/server/Mir200/SystemModule.dll','.runtime/server/Mir200/OpenMir2.dll',...(process.env.MIR2_GATEWAY_DLL?[process.env.MIR2_GATEWAY_DLL]:[])]){const bytes=await readFile(path).catch(e=>{if(e.code==='ENOENT')return;throw e;});if(bytes)report.localRuntimeFiles.sha256[path]=createHash('sha256').update(bytes).digest('hex');}
 if(phase==='create-only'){
  if(fixtures.length)throw new Error('Reuse or clean existing private melee fixtures before creation');
  fixtures=['attacker','observer'].map(role=>{const id=randomBytes(4).toString('hex');return{role,account:'p'+id,character:'P'+id,password:randomBytes(5).toString('hex'),createdAt:new Date().toISOString()};});await save();
  for(const f of fixtures){report.operation={type:'create fixture',role:f.role};const c=new Client();await c.enter(f,true);await c.close();await pause(4000);}
  report.preparationRequired={stage:'learn',method:'normal stop + backup then prepare positions beside original map 0 skill trainer; actual warriorset/equip online'};report.ok=true;report.closedLoopVerified=false;
 }else{
  if(fixtures.length!==2||fixtures.some(f=>!f.registered||!f.characterCreated||typeof f.password!=='string'))throw new Error('Create owned isolated melee fixtures first');
  const attacker=fixtures.find(f=>f.role==='attacker'),owner=new Client();await owner.enter(attacker);
  check('fixture remains in original map 0',owner.map==='0');
  if(phase==='low-mp'){
   check('low-MP stage was prepared after normal backup',attacker.preparedStage==='low-mp');check('actual original saved MP is below fire cost',Number.isFinite(owner.mp)&&owner.mp<7,{mp:owner.mp});
   const a=await owner.action('castMagic',{magicId:26},0);await pause(100);check('low MP input GOOD does not invent FIR charge',!owner.events.slice(a.at).some(m=>m.type==='legacy'&&m.status==='+FIR')&&!owner.flags.fireHit,{observedMp:owner.mp,acceptedInput:a.result.accepted});
   const swing=await owner.attack(0);check('next real SM is not unconfirmed fire',swing.meleeKind!=='fire'&&swing.legacyIdent!==8,{legacyIdent:swing.legacyIdent});report.closedLoopVerified=false;report.ok=true;
  }else{
   check('learn positions were prepared from stopped backed up fixture',attacker.preparedStage==='learn');
   const world=readClassicMiningMap(await readFile('.runtime/server/Mir200/Map/0.map'));
   const trainer=[...owner.entities.values()].find(e=>e.kind==='npc'&&e.name==='边界导师');check('original named trainer is in fixture view',!!trainer);
   const bytes=await readFile('.runtime/server/Mir200/Envir/Market_Def/测试/技能导师-0.txt');report.originalTrainerScriptSha256=createHash('sha256').update(bytes).digest('hex');if(!bytes.includes(Buffer.from('[@warriorset]')))throw new Error('Existing trainer warriorset missing');
   const settings=new TextDecoder('gb18030').decode(await readFile('.runtime/server/Mir200/setting.conf'));
   const clickOverride=settings.match(/^ClickNpcTime\s*=\s*(\d+)\s*$/m),clickNpcTimeMs=Number(clickOverride?.[1]??1000);
   if(!Number.isSafeInteger(clickNpcTimeMs)||clickNpcTimeMs<0)throw new Error('Invalid native NPC click interval');
   report.nativeNpcThrottle={clickNpcTimeMs,comparison:'strict >',source:clickOverride?'runtime setting.conf':'GameSvrConf default'};
   if(![7,12,25,26].every(id=>owner.skills.has(id))){
    await pause(clickNpcTimeMs+200);
    const stamp={npcId:trainer.id,npcSessionId:1,mapGeneration:owner.generation};let at=owner.events.length;report.operation={type:'original trainer learning'};owner.send({type:'npc',targetId:trainer.id,...stamp});let dialogue=await owner.wait(at,m=>m.type==='npcDialogue'&&m.npcId===trainer.id&&m.npcSessionId===1);
    for(const command of ['@skills','@warriorset']){check('current native NPC offers '+command,dialogue.mapGeneration===stamp.mapGeneration&&dialogue.options.some(o=>o.command===command));at=owner.events.length;owner.send({type:'dialogueSelect',command,...stamp});dialogue=await owner.wait(at,m=>m.type==='npcDialogue'&&m.npcId===trainer.id&&m.npcSessionId===1);}
    await owner.wait(0,()=>[7,12,25,26].every(id=>owner.skills.has(id)));owner.send({type:'npcClose',...stamp});
   }
   check('original native trainer teaches exact four classic IDs',[7,12,25,26].every(id=>owner.skills.has(id)),{magicIds:[7,12,25,26]});
   let weapon=owner.equipment.get(1);if(!weapon){weapon=[...owner.inventory.values()].find(i=>i.name==='木剑'&&i.stdMode===5&&i.durability>0);check('trainer supplies original usable sword instance',!!weapon);let at=owner.events.length;owner.send({type:'equipItem',slot:1,makeIndex:weapon.makeIndex});check('real native equip accepts trainer sword',(await owner.wait(at,m=>m.type==='itemActionResult'&&m.kind==='equip')).accepted);}
   const witness=new Client();await witness.enter(fixtures.find(f=>f.role==='observer'));await pause(1500);check('independent observer can view attacking actor',[...witness.entities.values()].some(e=>e.id===owner.self.id));
   let acquired=owner.flags.powerHit;for(let i=0;i<24&&!acquired;i++){await owner.attack(0,witness);acquired=owner.flags.powerHit;}
   check('original passive counter produces actual PWR',acquired);let swing=await owner.attack(0,witness);check('actual confirmed power attack uses SM18',swing.legacyIdent===18&&swing.meleeKind==='power');
   await owner.action('castMagic',{magicId:26});check('original fire cast receives actual FIR',owner.flags.fireHit);swing=await owner.attack(0,witness);check('actual charged fire attack uses SM8',swing.legacyIdent===8&&swing.meleeKind==='fire');
   for(let n=0;owner.flags.powerHit&&n<8;n++)await owner.attack(0,witness);check('prior passive power charge drained before halfmoon',!owner.flags.powerHit);
   await owner.action('castMagic',{magicId:25});check('actual halfmoon toggle confirmed',owner.flags.halfMoon);swing=await owner.attack(0,witness);check('actual halfmoon attack uses SM24',swing.legacyIdent===24&&swing.meleeKind==='halfMoon');await owner.action('castMagic',{magicId:25});check('actual halfmoon toggle closed',!owner.flags.halfMoon);
   let target;for(let d=0;d<8;d++){const p={x:trainer.x-2*dirs[d][0],y:trainer.y-2*dirs[d][1]};try{routeToGround(world,owner.self,p,owner.entities,{maxSteps:25,maxNodes:12000});target={...p,direction:d};break;}catch{}}
   check('original two-cell actor range has reachable test position',!!target);await owner.walk(target,world);
   for(let n=0;owner.flags.powerHit&&n<8;n++)await owner.attack(0,witness);check('prior power charge drained before thrusting',!owner.flags.powerHit);
   await owner.action('castMagic',{magicId:12});check('actual thrusting toggle confirmed',owner.flags.thrusting);swing=await owner.attack(target.direction,witness);check('actual thrusting attack uses SM19',swing.legacyIdent===19&&swing.meleeKind==='thrusting');await owner.action('castMagic',{magicId:12});check('actual thrusting toggle closed',!owner.flags.thrusting);
   for(const [id,key] of [[12,49],[25,50],[26,51]])await owner.bind(id,key);const saved=keys(owner.skills),sword=owner.equipment.get(1);await owner.close();await witness.close();await pause(4000);
   const reload=new Client();await reload.enter(attacker);check('four learned skills and real key assignments survive normal relogin',JSON.stringify(keys(reload.skills))===JSON.stringify(saved),{keys:saved});check('actual equipped sword instance survives relogin',reload.equipment.get(1)?.makeIndex===sword.makeIndex,{makeIndex:sword.makeIndex});
   attacker.completedRunAt=new Date().toISOString();await save();report.ok=true;report.closedLoopVerified=true;
  }
 }
}catch(error){report.ok=false;report.closedLoopVerified=false;report.error=String(error.message??'Isolated melee probe failed');process.exitCode=1;}
finally{for(const client of clients)try{await client.close();}catch{report.disconnectIncomplete=true;}report.finishedAt=new Date().toISOString();await mkdir('.runtime/reports',{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,phase,checks:report.checks.length,closedLoopVerified:report.closedLoopVerified,report:reportPath}));}
