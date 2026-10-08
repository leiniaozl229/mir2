import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourcePath=path.join(root,'apps/web/src/password-change.ts');
const source=fs.readFileSync(sourcePath,'utf8');
const sourceSha256=crypto.createHash('sha256').update(source).digest('hex');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const check=(value,message)=>{if(!value)throw new Error(message);};
const plain=value=>JSON.parse(JSON.stringify(value));
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};
const fields=overrides=>({account:'Test9',oldPassword:'oldpass',newPassword:'newpass',repeatPassword:'newpass',...overrides});
const envelope=(sequence,message,mapGeneration=0)=>({sequence,mapGeneration,message});
const connected=(sequence=1,features={passwordChange:true})=>envelope(sequence,{type:'connected',protocol:1,features});
const result=(requestId=1,overrides={})=>({type:'changePasswordResult',requestId,accepted:true,status:'succeeded',reason:0,requestSent:true,...overrides});

class Clock{
 now=0;serial=0;jobs=new Map();
 setTimeout(callback,delay){const id=++this.serial;this.jobs.set(id,{callback,due:this.now+delay});return id;}
 clearTimeout(id){this.jobs.delete(id);}
 advance(delta){
  const target=this.now+delta;
  while(true){const next=[...this.jobs].filter(([,job])=>job.due<=target).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];if(!next)break;this.now=next[1].due;this.jobs.delete(next[0]);next[1].callback();}
  this.now=target;
 }
}
class Socket{
 listeners=new Map();sent=[];closed=0;throwSend=false;
 addEventListener(type,callback){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(callback);}
 removeEventListener(type,callback){this.listeners.get(type)?.delete(callback);}
 emit(type,event={}){for(const callback of [...this.listeners.get(type)??[]])callback(event);}
 deliver(data){this.emit('message',{data:typeof data==='string'?data:JSON.stringify(data)});}
 send(command){if(this.throwSend)throw new Error('fixture socket unavailable');this.sent.push(command);}
 close(){this.closed++;this.emit('close');}
 count(){return [...this.listeners.values()].reduce((sum,listeners)=>sum+listeners.size,0);}
 capture(){return [...this.listeners.get('message')??[]];}
}
function fixture(options={}){
 const clock=new Clock(),sockets=[],pending=[],outcomes=[],validation=[];
 const context={exports:{},setTimeout:clock.setTimeout.bind(clock),clearTimeout:clock.clearTimeout.bind(clock)};
 vm.createContext(context);vm.runInContext(compiled,context,{filename:'apps/web/src/password-change.ts'});
 let failConnect=false;
 const controller=new context.exports.PasswordChangeController({connect:()=>{if(failConnect)throw new Error('fixture connection failure');const socket=new Socket();sockets.push(socket);return socket;},onPending:value=>pending.push(value),onResult:value=>outcomes.push(plain(value)),onValidation:(message,field)=>validation.push({message,field}),...options});
 return {clock,sockets,pending,outcomes,validation,controller,...context.exports,set failConnect(value){failConnect=value;}};
}

{
 const f=fixture();check(f.controller.submit(fields()),'valid submit failed');const socket=f.sockets[0];
 check(f.controller.isPending()&&f.pending.join(',')==='true'&&socket.sent.length===0,'submit sent before capability handshake');
 socket.deliver(connected());check(socket.sent.length===1,'real gateway envelope did not unlock exactly one command');
 const command=JSON.parse(socket.sent[0]);
 check(command.type==='changePassword'&&command.requestId===1&&command.account==='Test9'&&command.oldPassword==='oldpass'&&command.newPassword==='newpass','original request fields changed');
 check(Object.keys(command).sort().join(',')==='account,newPassword,oldPassword,requestId,type','repeat field or unrelated auth data was sent');
 socket.deliver(envelope(2,result()));
 check(f.outcomes.length===1&&f.outcomes[0].accepted===true&&f.outcomes[0].requestSent===true&&f.outcomes[0].reason===0,'typed success lost authority fields');
 check(!f.controller.isPending()&&f.pending.join(',')==='true,false'&&socket.closed===1&&socket.count()===0&&f.clock.jobs.size===0,'successful operation retained listeners/timer/socket/pending');
 pass('real envelope handshake emits only CM2003 Web fields, then authoritative typed success cleans the owned socket');
}
{
 for(const features of [undefined,{},false,[],{passwordChange:false},{passwordChange:1},{passwordChange:'true'}]){
  const f=fixture();f.controller.submit(fields());f.sockets[0].deliver(envelope(1,{type:'connected',protocol:1,features}));
  check(f.sockets[0].sent.length===0&&f.outcomes.length===1&&f.outcomes[0].accepted===false&&f.outcomes[0].status==='unavailable'&&f.outcomes[0].requestSent===false,'absent/false capability submitted credentials');
  check(f.clock.jobs.size===0&&!f.controller.isPending(),'unavailable capability retained wait');
 }
 pass('absent/false/nonboolean passwordChange capability refuses transmission and ends the prelogin wait');
}
{
 const f=fixture();f.controller.submit(fields());const socket=f.sockets[0];
 for(const invalid of ['{','null','[]',connected().message,envelope(1,null),envelope(1,[]),envelope(1,'connected'),envelope(0,connected().message),envelope(-1,connected().message),envelope(1.5,connected().message),envelope('1',connected().message),envelope(9007199254740992,connected().message),envelope(1,connected().message,1),{sequence:1,message:connected().message}])socket.deliver(invalid);
 socket.emit('message',{data:new Uint8Array([1])});
 check(socket.sent.length===0&&f.outcomes.length===0&&f.controller.isPending(),'malformed/envelope-free/world-generation packet advanced password state');
 socket.deliver(connected());check(socket.sent.length===1,'invalid packets consumed the legitimate handshake sequence');f.controller.cancel();
 pass('strict envelope rejects malformed JSON, binary, flat bodies, invalid sequence and nonzero/missing map generation');
}
{
 const f=fixture();f.controller.submit(fields());const socket=f.sockets[0];
 socket.deliver(envelope(1,result()));check(f.outcomes.length===0&&socket.sent.length===0,'result before capability handshake fabricated success');
 socket.deliver(connected(2));socket.deliver(connected(3));
 check(socket.sent.length===1&&f.outcomes.length===0,'repeated connected replayed the credential command');
 socket.deliver(envelope(4,result()));check(f.outcomes.length===1&&f.outcomes[0].accepted===true,'post-handshake valid result missing');
 pass('typed results before handshake cannot settle, and duplicate capability frames cannot submit twice');
}
{
 const f=fixture();f.controller.submit(fields());const socket=f.sockets[0];socket.deliver(connected(4));
 for(const sequence of [4,3,0,-1,4.5,'5',true,9007199254740992])socket.deliver(envelope(sequence,result()));
 for(const requestId of [0,-1,2,'1',true,null,1.5,9007199254740992])socket.deliver(envelope(5+(socket.extraSequence=(socket.extraSequence??0)+1),result(requestId)));
 check(f.outcomes.length===0&&f.controller.isPending(),'wrong identity/stale sequence resolved current request');
 socket.deliver(envelope(30,result()));check(f.outcomes.length===1&&f.outcomes[0].requestId===1,'current identity failed after ignored stale replies');
 pass('wrong/unsafe request identities and stale/noninteger sequences cannot resolve the current operation');
}
{
 for(const [reason,fragment] of [[-1,'原密码'],[-2,'锁定'],[0,'服务器拒绝'],[99,'服务器拒绝']]){
  const f=fixture();f.controller.submit(fields());const socket=f.sockets[0];socket.deliver(connected());socket.deliver(envelope(2,result(1,{accepted:false,status:'rejected',reason})));
  check(f.outcomes.length===1&&f.outcomes[0].accepted===false&&f.outcomes[0].reason===reason,'native rejection reason changed');
  const message=f.passwordChangeMessage(f.outcomes[0]);check(message.includes(fragment)&&!message.includes('不一致'),'current native lock was confused with reference repeat mismatch');
 }
 pass('SM507 typed -1/-2/other native reasons remain rejection; -2 is lock rather than repeat-password mismatch');
}
{
 for(const status of ['unavailable','busy','throttled','invalid']){
  const f=fixture();f.controller.submit(fields());f.sockets[0].deliver(connected());f.sockets[0].deliver(envelope(2,result(1,{accepted:false,status,reason:null,requestSent:false})));
  check(f.outcomes.length===1&&f.outcomes[0].accepted===false&&f.outcomes[0].requestSent===false,'known unsent rejection changed disposition');
 }
 for(const status of ['timeout','disconnected','protocol_error'])for(const requestSent of [false,true]){
  const f=fixture();f.controller.submit(fields());f.sockets[0].deliver(connected());f.sockets[0].deliver(envelope(2,result(1,{accepted:requestSent?null:false,status,reason:null,requestSent})));
  check(f.outcomes.length===1&&f.outcomes[0].requestSent===requestSent&&f.outcomes[0].accepted===(requestSent?null:false),'typed uncertainty was flattened into false/true');
 }
 pass('valid unsent rejection and sent/unsent uncertainty combinations retain backend requestSent and nullable acceptance');
}
{
 const malformed=[
  {accepted:false},{reason:null},{reason:1},{requestSent:false},{accepted:null},
  {status:'rejected',accepted:true,reason:-1},{status:'rejected',accepted:false,reason:null},{status:'rejected',accepted:false,reason:-1,requestSent:false},
  {status:'rejected',accepted:false,reason:1.5},{status:'rejected',accepted:false,reason:'-2'},{status:'rejected',accepted:false,reason:9007199254740992},
  ...['unavailable','busy','throttled','invalid'].flatMap(status=>[{status,accepted:false,reason:null,requestSent:true},{status,accepted:null,reason:null,requestSent:false},{status,accepted:false,reason:0,requestSent:false}]),
  ...['timeout','disconnected','protocol_error'].flatMap(status=>[{status,accepted:false,reason:null,requestSent:true},{status,accepted:true,reason:null,requestSent:true},{status,accepted:null,reason:null,requestSent:false},{status,accepted:null,reason:0,requestSent:true}]),
  {status:'unknown'},{status:null},{requestSent:null},{requestSent:1},{accepted:'true'},{type:'error'},{type:'registrationResult'}
 ];
 const f=fixture();f.controller.submit(fields());const socket=f.sockets[0];socket.deliver(connected());let sequence=1;
 for(const overrides of malformed)socket.deliver(envelope(++sequence,result(1,overrides)));
 for(const missing of ['status','reason','requestSent','accepted','requestId']){const body=result();delete body[missing];socket.deliver(envelope(++sequence,body));}
 check(f.outcomes.length===0&&f.controller.isPending(),'malformed typed combination prematurely completed operation');
 socket.deliver(envelope(++sequence,result()));check(f.outcomes.length===1,'valid result could not settle after malformed replies');
 pass('strict typed combinations reject contradictory acceptance/reason/sent fields, unknown statuses and missing properties');
}
{
 const f=fixture();check(f.controller.submit(fields()),'first valid submit failed');
 check(!f.controller.submit(fields({account:'Other9'}))&&!f.controller.submit(fields({newPassword:'x'})),'double submit replaced the first request');
 check(f.sockets.length===1&&f.pending.join(',')==='true'&&f.validation.length===0,'double submit allocated another socket or mutated wait/validation');
 f.sockets[0].deliver(connected());check(JSON.parse(f.sockets[0].sent[0]).account==='Test9','double submit changed captured credentials');f.controller.cancel();
 pass('pending double submit opens no second connection, preserves the original request and emits no second validation');
}
{
 for(const submitted of [false,true]){
  const f=fixture();f.controller.submit(fields());const socket=f.sockets[0];const callbacks=socket.capture();if(submitted)socket.deliver(connected());
  f.controller.cancel();f.controller.cancel();socket.deliver(envelope(2,result()));for(const callback of callbacks)callback({data:JSON.stringify(envelope(3,result()))});f.clock.advance(20000);
  check(f.outcomes.length===1&&f.outcomes[0].status==='cancelled'&&f.outcomes[0].accepted===(submitted?null:false)&&f.outcomes[0].requestSent===(submitted?null:false),'cancel invented native rollback or duplicate outcome');
  check(!f.controller.isPending()&&f.pending.join(',')==='true,false'&&socket.closed===1&&socket.count()===0&&f.clock.jobs.size===0,'cancel retained pending/timer/socket callbacks');
  const text=f.passwordChangeMessage(f.outcomes[0]);check(text.includes(submitted?'重新登录':'尚未提交'),'cancel disposition has misleading message');
 }
 pass('cancel before handshake is unsent; cancel after Web command is unknown, with one result and stale callbacks removed');
}
{
 for(const submitted of [false,true]){
  const f=fixture();f.controller.submit(fields());if(submitted)f.sockets[0].deliver(connected());
  f.clock.advance(17999);check(f.outcomes.length===0&&f.controller.isPending(),'default timer fired before 18 seconds');
  f.clock.advance(1);check(f.outcomes.length===1&&f.outcomes[0].status==='timeout'&&f.outcomes[0].accepted===(submitted?null:false)&&f.outcomes[0].requestSent===(submitted?null:false),'timeout invented native disposition');
  check(f.clock.jobs.size===0&&f.sockets[0].count()===0&&!f.controller.isPending(),'timeout retained listener/pending');
 }
 const f=fixture({timeoutMs:200});f.controller.submit(fields());f.clock.advance(199);check(f.outcomes.length===0,'custom timeout fired early');f.clock.advance(1);check(f.outcomes.length===1,'custom timeout ignored');
 pass('default18s and custom timeout distinguish unsent handshake wait from unknown command outcome and clean resources');
}
{
 for(const event of ['close','error'])for(const submitted of [false,true]){
  const f=fixture();f.controller.submit(fields());if(submitted)f.sockets[0].deliver(connected());f.sockets[0].emit(event);f.sockets[0].emit(event);
  check(f.outcomes.length===1&&f.outcomes[0].status==='disconnected'&&f.outcomes[0].accepted===(submitted?null:false)&&f.outcomes[0].requestSent===(submitted?null:false),'close/error fabricated a failed committed change');
 }
 const f=fixture();f.controller.submit(fields());f.sockets[0].throwSend=true;f.sockets[0].deliver(connected());
 check(f.outcomes.length===1&&f.outcomes[0].accepted===null&&f.outcomes[0].requestSent===null,'throwing send claimed it proved the native mutation did not occur');
 pass('Web close/error and send exceptions preserve unknown state after the capability-triggered attempt');
}
{
 const f=fixture();f.failConnect=true;check(!f.controller.submit(fields()),'connect exception reported a queued operation');
 check(f.outcomes.length===1&&f.outcomes[0].status==='unavailable'&&f.outcomes[0].accepted===false&&f.outcomes[0].requestSent===false&&f.pending.length===0&&!f.controller.isPending(),'connect failure retained pending or claimed submitted');
 f.failConnect=false;check(f.controller.submit(fields()),'next operation could not recover');f.sockets[0].deliver(connected());check(JSON.parse(f.sockets[0].sent[0]).requestId===2,'request identity was reused after connection failure');f.controller.cancel();
 pass('connect exceptions leave no pending/socket/timer and a later retry uses a fresh increasing request identity');
}
{
 const f=fixture();f.controller.submit(fields());const old=f.sockets[0],oldCallbacks=old.capture();old.deliver(connected());f.controller.cancel();
 check(f.controller.submit(fields({account:'Other9'})),'replacement request failed');const current=f.sockets[1];current.deliver(connected(1));
 check(JSON.parse(current.sent[0]).requestId===2&&JSON.parse(current.sent[0]).account==='Other9','replacement socket reused old request data/identity');
 for(const callback of oldCallbacks)callback({data:JSON.stringify(envelope(500,result(1)))});
 old.emit('error');old.emit('close');current.deliver(envelope(2,result(1)));check(f.outcomes.length===1&&f.controller.isPending(),'late old socket/ID completed replacement request');
 current.deliver(envelope(3,result(2)));check(f.outcomes.length===2&&f.outcomes[1].requestId===2&&f.outcomes[1].accepted===true,'current request did not resolve independently');
 check(f.pending.join(',')==='true,false,true,false','old callbacks altered current pending lifecycle');
 pass('fresh socket starts sequence1; old callbacks/ID/results cannot complete or overwrite a replacement request');
}
{
 for(const submitted of [false,true]){
  const f=fixture();f.controller.submit(fields());const socket=f.sockets[0],callbacks=socket.capture();if(submitted)socket.deliver(connected());f.controller.destroy();f.controller.destroy();
  for(const callback of callbacks)callback({data:JSON.stringify(envelope(2,result()))});f.clock.advance(20000);
  check(f.outcomes.length===0&&!f.controller.isPending()&&f.pending.join(',')==='true,false'&&socket.count()===0&&socket.closed===1&&f.clock.jobs.size===0,'destroy delivered a cancelled/server result or left resources');
  check(!f.controller.submit(fields())&&f.sockets.length===1,'destroyed controller accepted another credential request');
 }
 pass('destroy releases the owned socket without reviving closed UI, reporting rollback or allowing future submissions');
}
{
 const f=fixture();const cases=[
  [{account:'abc'},'account'],[{account:'abcdefghijk'},'account'],[{account:'测试账号'},'account'],[{account:'Test/9'},'account'],
  [{oldPassword:''},'oldPassword'],[{oldPassword:'x'.repeat(11)},'oldPassword'],[{oldPassword:'x/y'},'oldPassword'],[{oldPassword:'x\ty'},'oldPassword'],
  [{newPassword:'ab',repeatPassword:'ab'},'newPassword'],[{newPassword:'x'.repeat(11),repeatPassword:'x'.repeat(11)},'newPassword'],[{newPassword:'a/b',repeatPassword:'a/b'},'newPassword'],[{newPassword:'a\0b',repeatPassword:'a\0b'},'newPassword'],
  [{newPassword:'a\u0085b',repeatPassword:'a\u0085b'},'newPassword'],[{repeatPassword:'different'},'repeatPassword']
 ];
 for(const [overrides,field] of cases){const invalid=f.validatePasswordChange(fields(overrides));check(invalid?.field===field,'field-specific validation precedence changed');check(!f.controller.submit(fields(overrides)),'invalid editable fields allocated a socket');}
 check(f.sockets.length===0&&f.pending.length===0&&f.outcomes.length===0&&f.validation.length===cases.length,'local field errors entered network pending/result');
 pass('local account/character/control/repeat validation focuses the exact field and never submits or allocates auth sockets');
}
{
 const f=fixture();
 // These pass the edit-control character rule. This test makes no browser GBK
 // encoder claim: only the strict gateway can accept/reject their actual bytes.
 for(const password of ['天地玄黄宇宙洪荒日月','😀abc']){
  const input=fields({newPassword:password,repeatPassword:password});check(f.validatePasswordChange(input)===undefined,'browser pretended to implement strict GBK encoding');
  check(f.controller.submit(input),'character-valid draft could not reach the gateway');const socket=f.sockets.at(-1);socket.deliver(connected());
  check(JSON.parse(socket.sent[0]).newPassword===password,'browser truncated/replaced characters before authoritative GBK validation');
  socket.deliver(envelope(2,result(f.sockets.length,{accepted:false,status:'invalid',reason:null,requestSent:false})));
  const outcome=f.outcomes.at(-1);check(outcome.accepted===false&&f.passwordChangeMessage(outcome).includes('GBK')&&f.passwordChangeMessage(outcome).includes('10 字节'),'gateway encoding rejection is mislabeled');
 }
 pass('CJK byte overflow and unencodable Unicode are left intact for backend validation and receive an explicit GBK/10-byte message');
}
{
 const f=fixture();const input=fields();check(f.controller.submit(input),'captured draft submit failed');
 input.account='Other9';input.oldPassword='changed';input.newPassword='changed';input.repeatPassword='changed';
 const socket=f.sockets[0];socket.deliver(connected());const command=JSON.parse(socket.sent[0]);
 check(command.account==='Test9'&&command.oldPassword==='oldpass'&&command.newPassword==='newpass'&&!('repeatPassword' in command),'mutable form/repeat changed the captured outbound draft');
 check(!Object.values(f.controller).some(value=>typeof value==='string'),'controller retained credentials as observable properties');
 socket.deliver(envelope(2,result()));const callbackCount=socket.count();socket.deliver(connected(3));check(socket.sent.length===1&&callbackCount===0,'completed controller retained a credential replay path');
 pass('submit captures one immutable draft, sends no repeat, and completion leaves no observable credential fields or replay listeners');
}
{
 const f=fixture();f.controller.nextId=Number.MAX_SAFE_INTEGER-1;check(f.controller.submit(fields()),'last safe identity rejected');const socket=f.sockets[0];socket.deliver(connected());
 check(JSON.parse(socket.sent[0]).requestId===Number.MAX_SAFE_INTEGER,'last safe request identity changed');socket.deliver(envelope(2,result(Number.MAX_SAFE_INTEGER)));
 check(!f.controller.submit(fields())&&f.validation.at(-1)?.field==='account'&&f.sockets.length===1,'exhausted controller emitted an unsafe/reused identity');
 pass('last safe request ID works once; counter exhaustion asks for refresh without another connection');
}
check(crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')===sourceSha256,'production source changed during the regression run');
console.log(`PASS password_change_regression ${groups}/${groups} groups; sourceSha256=${sourceSha256}; scope=actual-production-VM/fake-WebSocket-and-clock; no native/browser runtime`);
