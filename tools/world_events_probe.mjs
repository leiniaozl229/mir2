// Live native protocol verification. Credentials stay in the ignored fixture
// manifest for cleanup; the public report never includes them.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {NpcProbeSession} from './npc_probe_session.mjs';
const endpoint=process.env.MIR2_GATEWAY_URL??'ws://127.0.0.1:5173/ws';
const report={endpoint,checks:[],limits:['Protocol verification; browser rendering and damage comparison are separate checks.']};
const existing=await readFile('.runtime/world-events-fixtures.json','utf8').catch(error=>{if(error.code==='ENOENT')return '{"fixtures":[]}';throw error;});
const previous=JSON.parse(existing),fixtures=previous.cleaned?[]:previous.fixtures,clients=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const map=await readFile('.runtime/server/Mir200/Map/0.map'),width=map.readUInt16LE(0),height=map.readUInt16LE(2);
const starts=(await readFile('.runtime/server/Mir200/Envir/StartPoint.txt','utf8')).split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(parts=>parts[0]==='0').map(parts=>({x:Number(parts[1]),y:Number(parts[2])}));
const setting=new TextDecoder('gb18030').decode(await readFile('.runtime/server/Mir200/setting.conf'));
const safeRadius=Number(setting.match(/^SafeZoneSize=(\d+)/m)?.[1]??10);
const npcClickInterval=Number(setting.match(/^ClickNpcTime\s*=\s*(\d+)\s*$/m)?.[1]??1000);
function walkable(x,y){if(x<0||y<0||x>=width||y>=height)return false;const at=52+(x*height+y)*12;return !((map.readUInt16LE(at)|map.readUInt16LE(at+4))&0x8000);}
function check(name,passed,details={}){report.checks.push({name,passed:!!passed,...details});console.log(`${passed?'PASS':'FAIL'} ${name}`);if(!passed)throw new Error(name);}
class Client{
 constructor(){this.events=[];this.entities=new Map();this.rejected=new Map();this.generation=0;this.serial=100000;this.npcSession=new NpcProbeSession(npcClickInterval);this.socket=new WebSocket(endpoint);clients.push(this);this.socket.addEventListener('message',event=>{
  const envelope=JSON.parse(event.data),m=envelope.message;this.npcSession.observe(envelope);this.generation=envelope.mapGeneration;this.events.push(m);
  if(m.type==='map'){this.entities.clear();this.self=undefined;this.map=m.map;}
  if(m.type==='entity'){const prior=this.entities.get(m.id);const entity={...prior,...m,name:m.name??prior?.name,feature:m.feature??prior?.feature};this.entities.set(m.id,entity);if(m.self)this.self=entity;}
  if(m.type==='entityRemoved')this.entities.delete(m.id);
  if(m.type==='entityDied'&&this.entities.has(m.id))this.entities.get(m.id).dead=true;
  if(m.type==='actionResult'&&m.kind==='move'&&m.accepted&&this.self)Object.assign(this.self,{x:m.x,y:m.y});
 });}
 send(message){this.socket.send(JSON.stringify(message));}
 async wait(at,predicate,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){const recent=this.events.slice(at);const found=recent.find(predicate);if(found)return found;const failure=recent.find(m=>m.type==='error');if(failure)throw new Error(failure.message);if(this.socket.readyState===3)throw new Error('Gateway disconnected');await pause(20);}throw new Error('Expected native response timed out');}
 async action(command){await pause(850);const at=this.events.length,actionId=++this.serial,started=performance.now();this.send({...command,actionId,mapGeneration:this.generation});const result=await this.wait(at,m=>m.type==='actionResult'&&m.actionId===actionId),latencyMs=performance.now()-started;await pause(400);return {result,latencyMs,events:this.events.slice(at)};}
 async enter(job){
  const token=randomBytes(4).toString('hex'),fixture={account:`e${token}`,password:randomBytes(5).toString('hex'),character:`E${token}`,job};fixtures.push(fixture);
  await writeFile('.runtime/world-events-fixtures.json',JSON.stringify({createdAt:new Date().toISOString(),fixtures},null,2),{mode:0o600});
  await this.wait(0,m=>m.type==='connected'&&m.features?.mapEvents&&m.features?.forcedMovement);
  let at=this.events.length;this.send({type:'register',account:fixture.account,password:fixture.password});if(!(await this.wait(at,m=>m.type==='registrationResult')).accepted)throw new Error('Fixture registration rejected');
  at=this.events.length;this.send({type:'login',account:fixture.account,password:fixture.password});await this.wait(at,m=>m.type==='characters');
  at=this.events.length;this.send({type:'createCharacter',name:fixture.character,job,sex:0,hair:0});if(!(await this.wait(at,m=>m.type==='characterCreationResult')).accepted)throw new Error('Fixture creation rejected');await this.wait(at,m=>m.type==='characters');
  at=this.events.length;this.send({type:'selectCharacter',name:fixture.character});await this.wait(at,m=>m.type==='entity'&&m.self,45000);await pause(1200);
 }
 route(goal,budget=40){const occupied=new Set([...this.entities.values()].filter(e=>!e.self&&!e.dead).map(e=>`${e.x},${e.y}`)),queue=[{x:this.self.x,y:this.self.y,route:[]}],seen=new Set([`${this.self.x},${this.self.y}`]);
  for(const [cell,until] of this.rejected)if(until>Date.now())occupied.add(cell);else this.rejected.delete(cell);
  for(let i=0;i<queue.length&&i<5000;i++){const node=queue[i];if(goal(node))return node.route;if(node.route.length>=budget)continue;for(let direction=0;direction<8;direction++){const x=node.x+directions[direction][0],y=node.y+directions[direction][1],key=`${x},${y}`;if(!seen.has(key)&&walkable(x,y)&&!occupied.has(key)){seen.add(key);queue.push({x,y,route:[...node.route,{x,y,direction}]});}}}throw new Error('No safe walkable fixture route');}
 async walk(route){if(!route.length)return;const goal=route.at(-1);let failures=0;while(route.length){const step=route.shift(),{result}=await this.action({type:'move',...step});if(result.accepted)continue;if(result.reason!==28||++failures>6)throw new Error(`Fixture route blocked at ${step.x},${step.y} (${result.reason})`);Object.assign(this.self,{x:result.x,y:result.y});this.rejected.set(`${step.x},${step.y}`,Date.now()+1500);report.routeRejections=(report.routeRejections??0)+1;route=this.route(p=>p.x===goal.x&&p.y===goal.y);}}
 async trainer(kit){await this.npcMenu(['@skills','@advancedskills',kit]);}
 async npcMenu(commands){const npc=[...this.entities.values()].filter(e=>(e.feature&255)===50&&/导师/.test(e.name??'')).sort((a,b)=>Math.max(Math.abs(a.x-this.self.x),Math.abs(a.y-this.self.y))-Math.max(Math.abs(b.x-this.self.x),Math.abs(b.y-this.self.y)))[0];if(!npc)throw new Error('Skill trainer is outside fixture view');this.trainerNpc=npc;
  await this.walk(this.route(p=>Math.max(Math.abs(p.x-npc.x),Math.abs(p.y-npc.y))===1));
  const stamp=await this.npcSession.begin(npc.id);
  let at=this.events.length;this.send({type:'npc',targetId:npc.id,...stamp});await this.wait(at,m=>m.type==='npcDialogue'&&this.npcSession.matches(m));
  for(const command of commands){at=this.events.length;this.send({type:'dialogueSelect',...this.npcSession.fields(npc.id),command});if(command==='@nearmonsters'){await this.wait(at,m=>m.type==='map');await this.wait(at,m=>m.type==='entity'&&m.self);}else await this.wait(at,m=>m.type==='npcDialogue'&&this.npcSession.matches(m));}
  await pause(1000);
 }
}
try{
 const wizard=new Client();await wizard.enter(1);await wizard.trainer('@firewallset');
 check('native trainer teaches firewall',wizard.events.some(m=>m.type==='skillAdded'&&m.skill.magicId===22));
 // Outside all configured start-point safe squares on this map.
 // Keep all five tiles walkable and empty, and the caster in native view range.
 let aim;const clearAim=p=>{for(let dx=-8;dx<=8;dx++)for(let dy=-8;dy<=8;dy++){
  const x=p.x+dx,y=p.y+dy,cross=[[x,y],[x-1,y],[x+1,y],[x,y-1],[x,y+1]];
  if(Math.max(Math.abs(dx),Math.abs(dy))<3||!cross.every(([cx,cy])=>walkable(cx,cy)&&starts.every(start=>Math.max(Math.abs(cx-start.x),Math.abs(cy-start.y))>safeRadius)))continue;
  if([...wizard.entities.values()].some(e=>!e.dead&&cross.some(([cx,cy])=>Math.max(Math.abs(e.x-cx),Math.abs(e.y-cy))<=2)))continue;
  aim={x,y,cross};return true;
 }return false;};
 await wizard.walk(wizard.route(clearAim));const fireAt=wizard.events.length;
 const firewall=await wizard.action({type:'castMagic',magicId:22,x:aim.x,y:aim.y});
 check('firewall cast receives native completion',firewall.result.accepted);
 await wizard.wait(fireAt,()=>wizard.events.slice(fireAt).filter(m=>m.type==='mapEvent'&&m.eventType===5).length>=5);
 const shown=wizard.events.slice(fireAt).filter(m=>m.type==='mapEvent'&&m.eventType===5),ids=new Set(shown.map(m=>m.id)),cells=new Set(shown.map(m=>`${m.x},${m.y}`));
 check('five firewall tiles have distinct native IDs and cross coordinates',ids.size===5&&!ids.has(0)&&aim.cross.every(([x,y])=>cells.has(`${x},${y}`)),{tiles:shown});

 const warrior=new Client();await warrior.enter(0);await warrior.trainer('@rushset');check('native trainer teaches directional rush',warrior.events.some(m=>m.type==='skillAdded'&&m.skill.magicId===27));
 const npc=warrior.trainerNpc;await warrior.walk(warrior.route(p=>Math.max(Math.abs(p.x-npc.x),Math.abs(p.y-npc.y))===1));
 let direction=directions.findIndex(([dx,dy])=>warrior.self.x+dx===npc.x&&warrior.self.y+dy===npc.y),before={x:warrior.self.x,y:warrior.self.y};
 const blocked=await warrior.action({type:'castMagic',magicId:27,direction});
 check('blocked rush reports attempted cell without moving player',blocked.result.accepted&&blocked.events.some(m=>m.type==='rushBlocked')&&warrior.self.x===before.x&&warrior.self.y===before.y,{before,after:{x:warrior.self.x,y:warrior.self.y}});
 const collision=await warrior.action({type:'move',x:npc.x,y:npc.y,direction});
 check('occupied-cell move promptly rejects and retains authoritative coordinates',!collision.result.accepted&&collision.result.reason===28&&collision.latencyMs<1500&&collision.result.x===before.x&&collision.result.y===before.y,{latencyMs:Math.round(collision.latencyMs),x:collision.result.x,y:collision.result.y});
 function emptyDirection(p){const occupied=new Set([...warrior.entities.values()].filter(e=>!e.self&&!e.dead).map(e=>`${e.x},${e.y}`));for(let d=0;d<8;d++){const [dx,dy]=directions[d];if([1,2,3,4,5].every(step=>walkable(p.x+dx*step,p.y+dy*step)&&!occupied.has(`${p.x+dx*step},${p.y+dy*step}`)))return d;}return undefined;}
 await warrior.walk(warrior.route(p=>emptyDirection(p)!==undefined));direction=emptyDirection(warrior.self);before={x:warrior.self.x,y:warrior.self.y};await pause(3200);
 const rushed=await warrior.action({type:'castMagic',magicId:27,direction});const moves=rushed.events.filter(m=>m.type==='entity'&&m.self&&m.action==='rush');
 check('rush synchronizes all native displacement steps',rushed.result.accepted&&moves.length===4&&warrior.self.x===before.x+directions[direction][0]*4&&warrior.self.y===before.y+directions[direction][1]*4,{before,steps:moves.map(m=>({x:m.x,y:m.y})),after:{x:warrior.self.x,y:warrior.self.y}});
 const next=warrior.route(p=>Math.max(Math.abs(p.x-warrior.self.x),Math.abs(p.y-warrior.self.y))===1)[0];const moved=await warrior.action({type:'move',...next});check('movement immediately after rush uses updated gateway coordinates',moved.result.accepted,{x:moved.result.x,y:moved.result.y});
 const expires=Date.now()+90000;let removed=new Set();while(Date.now()<expires){removed=new Set(wizard.events.slice(fireAt).filter(m=>m.type==='mapEventRemoved').map(m=>m.id));if([...ids].every(id=>removed.has(id)))break;await pause(500);}
 check('native expiry removes each firewall tile', [...ids].every(id=>removed.has(id)),{removedIds:[...ids].filter(id=>removed.has(id))});

 // A lower-level independent fixture takes the native push; both players
 // leave the safe area and no existing player's record is involved.
 report.stage='prepare pushed fixture';const pushed=new Client();await pushed.enter(0);await pushed.npcMenu(['@cavecombat']);await pushed.npcMenu(['@more','@nearmonsters']);
 report.stage='move rush caster to push test area';
 await warrior.npcMenu(['@more','@nearmonsters']);
 const safe=p=>starts.every(start=>Math.max(Math.abs(p.x-start.x),Math.abs(p.y-start.y))>safeRadius+2);
 await warrior.walk(warrior.route(p=>safe(p)&&emptyDirection(p)!==undefined));direction=emptyDirection(warrior.self);
 const origin={x:warrior.self.x,y:warrior.self.y},[pushDx,pushDy]=directions[direction],front={x:origin.x+pushDx,y:origin.y+pushDy};
 report.stage='align pushed fixture';await pushed.walk(pushed.route(p=>p.x===front.x&&p.y===front.y));
 let at=warrior.events.length;warrior.send({type:'attackMode',mode:0});await warrior.wait(at,m=>m.type==='attackMode'&&m.mode===0);await pause(3200);
 report.stage='native player push';const pushAt=pushed.events.length,ram=await warrior.action({type:'castMagic',magicId:27,direction});
 await pushed.wait(pushAt,m=>m.type==='entity'&&m.self&&m.action==='backstep');await pause(600);
 const pushSteps=pushed.events.slice(pushAt).filter(m=>m.type==='entity'&&m.self&&m.action==='backstep');
 check('native two-player rush pushes lower-level fixture in order',ram.result.accepted&&pushSteps.length===4&&pushed.self.x===front.x+pushDx*4&&pushed.self.y===front.y+pushDy*4,{steps:pushSteps.map(m=>({x:m.x,y:m.y,direction:m.direction})),after:{x:pushed.self.x,y:pushed.self.y}});
 await pause(1200);const escape=pushed.route(p=>Math.max(Math.abs(p.x-pushed.self.x),Math.abs(p.y-pushed.self.y))===1)[0];
 const recovered=await pushed.action({type:'move',...escape});check('pushed player can move again using confirmed server position',recovered.result.accepted,{x:recovered.result.x,y:recovered.result.y});
 report.ok=true;
}catch(error){report.ok=false;report.error=error.message;console.log(`FAIL ${error.message}`);process.exitCode=1;}
finally{for(const client of clients)client.socket.close();await pause(1500);await mkdir('.runtime/reports',{recursive:true});await writeFile('.runtime/reports/world-events-live.json',JSON.stringify(report,null,2));}
