// Real delivery checks using only the two already protocol-owned melee fixtures.
// No account creation, fixture edits, database access or runtime process control.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {readClassicMiningMap} from './mining_probe_ground.mjs';
const args=process.argv.slice(2);
if(args.includes('--help')||args.length!==1||args[0]!=='--run'){console.log('Usage: node tools/chat_probe.mjs --run');console.log('Reuses only .runtime/melee-fixtures.json attacker/observer; report .runtime/reports/chat-live.json.');process.exit(args.includes('--help')?0:2);}
const endpoint=process.env.MIR2_GATEWAY_URL??'ws://127.0.0.1:18801/ws',url=new URL(endpoint);
if(url.username||url.password)throw new Error('Gateway URL must not contain credentials');
const report={schemaVersion:1,startedAt:new Date().toISOString(),endpoint:url.protocol+'//'+url.host+url.pathname,checks:[],limits:[
 'Real WebSocket/native delivery evidence is separate from production browser input and original-client comparison.',
 'No synthesized native chat delivery ACK; chatId correlates only Web rejection. Native chat truncation and anti-flood rules are preserved.',
 'Group/guild permissions, shout/level/cooldown, silence, ignore/whisper policy and cross-map delivery remain untested.',
 'Only the existing private protocol-owned melee fixtures are used. No additional fixture or database/process operation.'
]};
const clients=[],pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),dirs=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function check(name,passed,detail={}){report.checks.push({name,passed:!!passed,...detail});console.log((passed?'PASS ':'FAIL ')+name);if(!passed)throw new Error(name);}
function safe(m){const result={};for(const k of ['type','id','commandType','chatId','actionId','kind','accepted','code','mapGeneration','channel'])if(['string','number','boolean'].includes(typeof m[k]))result[k]=m[k];return result;}
function numericSetting(text,name,fallback){const match=text.match(new RegExp('^'+name+'\\s*=\\s*(\\d+)\\s*$','m'));const value=Number(match?.[1]??fallback);if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid native chat setting');return value;}
function gbkBytes(text){let n=0;for(const character of text){if(character.charCodeAt(0)<128)n++;else if(character==='中')n+=2;else throw new Error('Unsupported test character outside known GBK byte fixture');}return n;}
class Client{
 constructor(){this.events=[];this.entities=new Map();this.generation=0;this.actionSerial=600000;this.chatSerial=800000;this.lastSayAt=Date.now();this.socket=new WebSocket(endpoint);clients.push(this);
  this.socket.addEventListener('message',event=>{const envelope=JSON.parse(event.data),m=envelope.message;this.generation=envelope.mapGeneration;this.events.push(m);
   if(m.type==='map'){this.map=m.map;this.entities.clear();this.self=undefined;}
   if(m.type==='entity'){const e={...this.entities.get(m.id),...m};this.entities.set(m.id,e);if(m.self)this.self=e;}
   if(m.type==='entityRemoved')this.entities.delete(m.id);if(m.type==='entityDied'&&this.entities.has(m.id))this.entities.get(m.id).dead=true;
   if(m.type==='actionResult'&&m.kind==='move'&&m.accepted&&this.self)Object.assign(this.self,{x:m.x,y:m.y});
  });
 }
 send(command){this.socket.send(JSON.stringify(command));}
 async wait(at,predicate,allowError=false,ms=15000){const end=Date.now()+ms;while(Date.now()<end){const recent=this.events.slice(at),found=recent.find(predicate);if(found)return found;if(!allowError&&recent.some(m=>m.type==='error'))throw new Error('Gateway rejected current chat fixture operation');if(this.socket.readyState===WebSocket.CLOSED)throw new Error('Owned chat fixture disconnected');await pause(20);}report.timeout={operation:report.operation,mapGeneration:this.generation,events:this.events.slice(at).slice(-20).map(safe)};throw new Error('Expected native chat fixture response timed out');}
 async enter(f){await this.wait(0,m=>m.type==='connected');let at=this.events.length;this.send({type:'login',account:f.account,password:f.password});const list=await this.wait(at,m=>m.type==='characters');check('protocol-owned chat character still exists',list.characters.some(c=>c.name===f.character));at=this.events.length;this.send({type:'selectCharacter',name:f.character});await this.wait(at,m=>m.type==='entity'&&m.self,false,45000);this.lastSayAt=Date.now();}
 async quiet(interval){const remaining=this.lastSayAt+interval-Date.now();if(remaining>0)await pause(remaining);}
 async close(){if(this.socket.readyState===WebSocket.OPEN)this.socket.close();const end=Date.now()+5000;while(this.socket.readyState!==WebSocket.CLOSED&&Date.now()<end)await pause(20);if(this.socket.readyState!==WebSocket.CLOSED)throw new Error('Owned chat fixture did not close normally');}
}
try{
 const manifest=JSON.parse(await readFile('.runtime/melee-fixtures.json','utf8')),fixtures=manifest.fixtures;
 if(manifest.schemaVersion!==1||manifest.probe!=='classic-warrior-melee-v1'||manifest.cleaned||!Array.isArray(fixtures)||fixtures.length!==2||new Set(fixtures.map(f=>f.account)).size!==2||new Set(fixtures.map(f=>f.role)).size!==2||fixtures.some(f=>!/^p[0-9a-f]{8}$/.test(f.account)||f.character!=='P'+f.account.slice(1)||!['attacker','observer'].includes(f.role)||!f.registered||!f.characterCreated||typeof f.password!=='string'))throw new Error('Chat probe requires exactly two existing owned melee warriors');
 const actor=fixtures.find(f=>f.role==='attacker'),witness=fixtures.find(f=>f.role==='observer');
 report.sourceSha256={};for(const path of ['tools/chat_probe.mjs','services/web-gateway/ChatCommand.cs','services/web-gateway/GatewaySession.cs','services/web-gateway/WorldProjection.cs','vendor/openmir2/src/M2Server/Player/PlayObject.Chat.cs','vendor/openmir2/src/GameGate/Services/ClientSession.cs'])report.sourceSha256[path]=hash(await readFile(path));
 report.localRuntimeFiles={scope:'Local file fingerprints; remote deployment not inferred',sha256:{}};for(const path of ['.runtime/server/Mir200/M2Server.dll','.runtime/server/Mir200/SystemModule.dll',...(process.env.MIR2_GATEWAY_DLL?[process.env.MIR2_GATEWAY_DLL]:[])]){const bytes=await readFile(path).catch(e=>{if(e.code==='ENOENT')return;throw e;});if(bytes)report.localRuntimeFiles.sha256[path]=hash(bytes);}
 const nativeBytes=await readFile('.runtime/server/Mir200/setting.conf'),gateBytes=await readFile('.runtime/server/RunGate/config.conf');
 const native=new TextDecoder('gb18030').decode(nativeBytes),gate=new TextDecoder('gb18030').decode(gateBytes);
 const sayMsgTime=numericSetting(native,'SayMsgTime',3000),sayMsgMaxLen=numericSetting(native,'SayMsgMaxLen',80),gateChatInterval=numericSetting(gate,'ChatInterval',800),interval=Math.max(sayMsgTime,gateChatInterval)+200;
 if(sayMsgMaxLen<20)throw new Error('Native chat length is too small for bounded probe markers');
 report.nativeChat={sayMsgTimeMs:sayMsgTime,gateChatIntervalMs:gateChatInterval,waitMs:interval,sayMsgMaxLen,source:'PlayObject.Chat.cs currentTick-SayMsgTick<SayMsgTime; GameGate ClientSession <ChatInterval',nativeSettingsSha256:hash(nativeBytes),gateSettingsSha256:hash(gateBytes)};
 const sender=new Client(),receiver=new Client();await sender.enter(actor);await receiver.enter(witness);check('owned chat actors share actual nearby map',sender.map===receiver.map&&Math.max(Math.abs(sender.self.x-receiver.self.x),Math.abs(sender.self.y-receiver.self.y))<11);
 const marker='c'+randomBytes(4).toString('hex')+'_';
 async function deliver(channel,text,nativeChannel,expected,legacyId,{echo=false}={}){
  await sender.quiet(interval);const at=sender.events.length,otherAt=receiver.events.length,chatId=++sender.chatSerial;report.operation={type:'say',channel,chatId,gbkBytes:gbkBytes(text)};
  sender.send({type:'say',channel,text,chatId});sender.lastSayAt=Date.now();
  const actual=await receiver.wait(otherAt,m=>m.type==='chat'&&m.channel===nativeChannel&&m.text===expected);await receiver.wait(otherAt,m=>m.type==='legacy'&&m.id===legacyId);
  check('actual '+nativeChannel+' delivery survives original native parser',actual.text===expected,{chatId,gbkBytes:gbkBytes(text),nativeIdent:legacyId,deliveredTextSha256:hash(Buffer.from(actual.text)),nativeTruncationExpected:text.length>sayMsgMaxLen});
  if(echo){const local=await sender.wait(at,m=>m.type==='chat'&&m.channel===nativeChannel&&m.text===expected);check('local chat echo is a true native message',local.senderId===sender.self.id);}
  check('valid say creates no fabricated native delivery or world ACK',!sender.events.slice(at).some(m=>m.type==='chatResult'||m.type==='actionResult'||m.type==='error'));
 }
 const local=marker+'local 中';await deliver('local',local,'local',actor.character+':'+local.slice(0,sayMsgMaxLen),40,{echo:true});
 const whisperBody=marker+'raw 中',raw='/'+witness.character+' '+whisperBody;
 const nativeWhisper=raw.slice(0,sayMsgMaxLen).slice(witness.character.length+2);await deliver('raw',raw,'whisper',actor.character+'=> '+nativeWhisper,103);
 const ascii=marker+'a'.repeat(180-marker.length);check('ASCII fixture is exactly 180 GBK bytes',gbkBytes(ascii)===180);await deliver('local',ascii,'local',actor.character+':'+ascii.slice(0,sayMsgMaxLen),40,{echo:true});
 const cjk=marker+'中'.repeat((180-marker.length)/2);check('CJK fixture is exactly 180 GBK bytes',gbkBytes(cjk)===180);await deliver('local',cjk,'local',actor.character+':'+cjk.slice(0,sayMsgMaxLen),40,{echo:true});
 async function reject(command,label,expectedId){const at=sender.events.length,otherAt=receiver.events.length;report.operation={type:'reject say',case:label};sender.send({type:'say',channel:'local',...command});const error=await sender.wait(at,m=>m.type==='error'&&m.code==='command_rejected'&&m.commandType==='say',true);check(label,expectedId===null?error.chatId===null:error.chatId===expectedId,{chatId:typeof error.chatId==='number'?error.chatId:null});await pause(100);check('rejected say cannot deliver or complete a world action',!receiver.events.slice(otherAt).some(m=>m.type==='chat'&&m.text.includes(marker))&&!sender.events.slice(at).some(m=>m.type==='chatResult'||m.type==='actionResult'));}
 await reject({text:ascii+'b',chatId:++sender.chatSerial},'181 ASCII GBK bytes reject with own chatId',sender.chatSerial);
 await reject({text:cjk+'中',chatId:++sender.chatSerial},'182 CJK GBK bytes reject with own chatId',sender.chatSerial);
 await reject({text:'!'+marker,chatId:++sender.chatSerial},'prefixed local rejects with own chatId',sender.chatSerial);
 for(const chatId of [0,-1,1.5,'9',null,9007199254740992])await reject({text:marker+'bad identity',chatId},'invalid chatId is not reflected as a fake identity',null);
 const queueAt=sender.events.length,first=++sender.chatSerial,second=++sender.chatSerial;sender.send({type:'say',channel:'local',text:'!'+marker+'A',chatId:first});sender.send({type:'say',channel:'local',text:'!'+marker+'B',chatId:second});
 await sender.wait(queueAt,m=>m.type==='error'&&m.chatId===first,true);await sender.wait(queueAt,m=>m.type==='error'&&m.chatId===second,true);check('queued A/B typed rejects preserve their own chatId',sender.events.slice(queueAt).filter(m=>m.type==='error'&&[first,second].includes(m.chatId)).map(m=>m.chatId).join(',')===first+','+second);
 const world=readClassicMiningMap(await readFile('.runtime/server/Mir200/Map/'+sender.map+'.map'));const occupied=new Set([...sender.entities.values()].filter(e=>!e.self&&!e.dead).map(e=>e.x+','+e.y));let moved=false;
 for(let direction=0;direction<8&&!moved;direction++){const x=sender.self.x+dirs[direction][0],y=sender.self.y+dirs[direction][1];if(!world.walkable(x,y)||occupied.has(x+','+y))continue;await pause(1000);const actionId=++sender.actionSerial,at=sender.events.length;report.operation={type:'move after chat rejects',actionId};sender.send({type:'move',x,y,direction,actionId,mapGeneration:sender.generation});const result=await sender.wait(at,m=>m.type==='actionResult'&&m.actionId===actionId);if(result.accepted){check('chat rejection leaves native movement independently available',result.kind==='move'&&result.x===x&&result.y===y,{actionId});moved=true;}else if(result.reason!==28)throw new Error('Movement after chat rejects failed');}
 check('owned actor recovered movement after queued and invalid chat input',moved);report.ok=true;
}catch(error){report.ok=false;report.error=String(error.message??'Chat probe failed');process.exitCode=1;}
finally{for(const client of clients)try{await client.close();}catch{report.disconnectIncomplete=true;}report.finishedAt=new Date().toISOString();await mkdir('.runtime/reports',{recursive:true});await writeFile('.runtime/reports/chat-live.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,checks:report.checks.length,report:'.runtime/reports/chat-live.json'}));}
