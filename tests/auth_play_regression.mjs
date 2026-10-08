import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=ts.createSourceFile('play.ts',fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8'),ts.ScriptTarget.ES2022,true);
const declaration=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='connect');
assert.ok(declaration,'production connect function missing');
const waitState=source.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(item=>ts.isIdentifier(item.name)&&item.name.text==='authResponseTimer'));
const clearWait=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='clearAuthenticationWait');
assert.ok(waitState&&clearWait,'production authentication wait state/functions missing');
const code=ts.transpileModule(`${waitState.getText(source)}\n${clearWait.getText(source)}\n${declaration.getText(source)}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const reconnectDeclarations=['setWorldConnectionState','scheduleReconnect','cancelReconnect'].map(name=>{
 const node=source.statements.find(statement=>ts.isFunctionDeclaration(statement)&&statement.name?.text===name);
 assert.ok(node,`production ${name} function missing`);return node.getText(source);
});
const reconnectCode=ts.transpileModule(reconnectDeclarations.join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const statusDeclarations=['setWorldConnectionState','isRoutineWorldStatus','syncWorldStatus'].map(name=>{
 const node=source.statements.find(statement=>ts.isFunctionDeclaration(statement)&&statement.name?.text===name);
 assert.ok(node,`production ${name} function missing`);return node.getText(source);
});
const statusCode=ts.transpileModule(statusDeclarations.join('\n'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const createSubmitCall=[];const findCreateSubmit=node=>{if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(source)==='createCharacterForm'&&node.expression.name.text==='addEventListener'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='submit')createSubmitCall.push(node.arguments[1]);ts.forEachChild(node,findCreateSubmit);};findCreateSubmit(source);
assert.equal(createSubmitCall.length,1,'production character creation submit handler missing');
const createSubmitCode=ts.transpileModule(`globalThis.submit=${createSubmitCall[0].getText(source)};`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;

class FakeSocket{
 static OPEN=1;
 constructor(){this.readyState=1;this.listeners=new Map();this.sent=[];this.closed=false;}
 addEventListener(type,listener){this.listeners.set(type,listener);}
 send(data){this.sent.push(JSON.parse(data));}
 close(){this.closed=true;this.readyState=3;}
 emit(type,message,sequence=1){this.listeners.get(type)?.({data:JSON.stringify({sequence,mapGeneration:0,message})});}
}
function harness(){
 const account={value:'PLAYER01',focused:false,focus(){this.focused=true;}},password={value:'secret12',focused:false,focus(){this.focused=true;}},connection={textContent:''},sockets=[],timers=new Map();let timerId=0,bodyInWorld=false;
 const context={
  accountInput:account,passwordInput:password,connection,credentials:undefined,socket:undefined,reconnectTimer:undefined,reconnectEnabled:false,reconnectAttempts:0,selectedCharacter:undefined,selectedServer:undefined,setWorldConnectionState(){},
  passwordSceneGeneration:0,selectionRevision:0,lastSequence:0,mapGeneration:0,currentMap:'0',mapReady:Promise.resolve(),sessionGeneration:0,gatewayFeatures:{},
  passwordChange:{isPending:()=>false},systemDialog:{isOpen:()=>false},logout:{isWaiting:()=>false,isAccepted:()=>false,interrupt:()=>{}},
  classicAuth:{busy:false,registrationError:undefined,registrationSuccesses:0,noticeShows:0,clearPasswordChange(){},setBusy(value){this.busy=value;},setDeleteEnabled(){},registrationRejected(message,field){this.registrationError={message,field};},registrationSucceeded(){this.registrationSuccesses++;},showLogin(){this.scene='login';},showServerSelection(servers,handlers){this.scene='servers';this.servers=servers;this.serverHandlers=handlers;this.busy=false;return Promise.resolve(true);},showEntryNotice(id,lines,handler){this.scene='notice';this.noticeId=id;this.noticeLines=lines;this.noticeHandler=handler;this.noticeShows++;this.busy=false;return Promise.resolve(true);},isEntrySceneOpen(){return this.scene==='servers'||this.scene==='notice';}},characterDelete:{interrupt(){}},logoutWait:{hidden:true},
  clearWorld(){},npcSession:{reset(){}},agentObserver:{event(){}},
  document:{body:{classList:{remove(name){if(name==='in-world')bodyInWorld=false;},add(name){if(name==='in-world')bodyInWorld=true;},contains(name){return name==='in-world'&&bodyInWorld;}},dataset:{}},querySelector(selector){if(selector==='#account')return account;if(selector==='#password')return password;throw Error(`unexpected selector ${selector}`);}},
  location:{protocol:'http:',host:'127.0.0.1:5173'},WebSocket:class extends FakeSocket{constructor(){super();sockets.push(this);}},
  window:{setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;}},clearTimeout(id){timers.delete(id);},
  showAuthNotice(_text,_field,afterClose){afterClose?.();},showCharacterSelection(){},
 };
 vm.createContext(context);vm.runInContext(code,context);
 return {context,account,password,connection,sockets,timers,connect:intent=>context.connect(intent),isInWorld:()=>bodyInWorld,enterWorld:()=>{bodyInWorld=true;},expire(){const [id,timer]=timers.entries().next().value??[];if(timer){timers.delete(id);timer.callback();}return timer;},
  handshake(socket,sequence=1){socket.emit('message',{type:'connected',features:{entryScenes:true}},sequence);}};
}

{
 const h=harness();h.connect('login');const socket=h.sockets[0];h.handshake(socket);
 assert.deepEqual(socket.sent[0],{type:'login',account:'player01',password:'secret12',interactiveLogin:true});
 assert.equal(h.password.value,'secret12','login must retain the obscured draft until credentials are accepted');
 socket.emit('message',{type:'error',commandType:'login',message:'密码错误'},2);
 assert.equal(h.password.value,'secret12','typed rejection must keep the password available for retry');
 assert.equal(h.password.focused,true,'after the auth error closes, return focus to the password field');
 assert.equal(h.context.classicAuth.busy,false);
 console.log('PASS login rejection preserves the obscured password draft for retry');
}

{
 const h=harness();h.connect('register');const socket=h.sockets[0];h.handshake(socket);
 assert.deepEqual(socket.sent[0],{type:'register',account:'player01',password:'secret12'});
 assert.equal(h.password.value,'secret12','registration must retain the password until registration or login succeeds');
 socket.emit('message',{type:'registrationResult',accepted:false,reason:0},2);
 assert.equal(h.password.value,'secret12','duplicate-account rejection must preserve the retry draft');
 assert.deepEqual(h.context.classicAuth.registrationError,{message:'该账号已经存在',field:'account'},'duplicate-account feedback must remain in the registration form and focus its account field');
 assert.equal(h.context.classicAuth.busy,false);
 console.log('PASS registration rejection preserves the obscured password draft and keeps the account form available for retry');
}

{
 const h=harness();h.connect('register');const socket=h.sockets[0];h.handshake(socket);socket.emit('close');
 assert.equal(h.context.reconnectEnabled,false,'a broken registration connection must not silently retry as a login');
 assert.equal(h.context.credentials,undefined,'a disconnected registration draft must stay in the form, not become reconnect credentials');
 assert.equal(h.context.classicAuth.busy,false);
 assert.match(h.context.classicAuth.registrationError.message,/中断/);
 console.log('PASS disconnected registration stays in the form for deliberate retry and never auto-connects as login');
}

{
 const h=harness();h.connect('register');const socket=h.sockets[0];h.handshake(socket);
 socket.emit('message',{type:'registrationResult',accepted:true,reason:0},2);
 assert.deepEqual(socket.sent[1],{type:'login',account:'player01',password:'secret12',interactiveLogin:true});
 assert.equal(h.context.classicAuth.registrationSuccesses,1,'accepted registration must close and clear the registration form before automatic login');
 assert.equal(h.password.value,'secret12','successful registration still needs its automatic login');
 socket.emit('message',{type:'characters',characters:[]},3);
 assert.equal(h.password.value,'','clear the password field once authentication succeeds');
 console.log('PASS accepted credentials remain available for automatic login then clear at the authenticated boundary');
}

{
 const h=harness();h.connect('login');const socket=h.sockets[0];socket.emit('message',{type:'connected',features:{}},1);
 assert.equal(socket.sent.length,0);assert.equal(socket.closed,true);assert.equal(h.context.credentials,undefined);assert.equal(h.context.classicAuth.scene,'login');assert.match(h.connection.textContent,/主流程/);
 console.log('PASS a gateway without original entry scenes cannot silently skip the missing client stages');
}
{
 const h=harness();h.connect('login');const socket=h.sockets[0];h.handshake(socket);socket.emit('message',{type:'servers',servers:[{name:'热血传奇',status:'idle',routable:true}]},2);
 assert.equal(h.context.classicAuth.scene,'servers');assert.equal(h.timers.size,0,'reading a server list must not use the 15-second network response timer');assert.equal(socket.sent.length,1);
 h.context.classicAuth.serverHandlers.choose('热血传奇');assert.deepEqual(socket.sent[1],{type:'selectServer',name:'热血传奇'});assert.equal(h.context.classicAuth.busy,true);assert.equal(h.timers.size,1);
 socket.emit('message',{type:'characters',characters:[]},3);socket.emit('message',{type:'entryNotice',noticeId:1,lines:['第一行','末行']},4);
 assert.equal(h.context.classicAuth.scene,'notice');assert.equal(h.context.classicAuth.noticeShows,1);assert.equal(h.timers.size,0,'reading an entry notice must wait for the native user acknowledgement');
 h.context.classicAuth.noticeHandler(1);assert.deepEqual(socket.sent[2],{type:'acknowledgeEntryNotice',noticeId:1});assert.equal(h.timers.size,1);
 socket.emit('message',{type:'entryNotice',noticeId:1,lines:['第一行','末行']},5);assert.equal(h.context.classicAuth.noticeShows,1,'a duplicate native notice must not reset the pending control');assert.equal(h.timers.size,1,'a duplicate notice must preserve the response deadline after acknowledgement');
 socket.emit('message',{type:'error',commandType:'acknowledgeEntryNotice',message:'公告会话已失效'},6);assert.equal(socket.closed,true);assert.equal(h.context.classicAuth.scene,'login');assert.equal(h.context.reconnectEnabled,false);assert.equal(h.timers.size,0);
 console.log('PASS production connect defers native server choice and notice acknowledgement, suppresses duplicate notice presentation and resets a rejected entry');
}
{
 const h=harness();h.connect('login');const first=h.sockets[0];h.handshake(first);first.emit('message',{type:'servers',servers:[{name:'热血传奇',status:'idle'}]},2);
 const retired=h.context.classicAuth.serverHandlers;h.connect('login');retired.choose('热血传奇');assert.equal(first.sent.length,1);assert.equal(h.sockets[1].sent.length,0);
 h.handshake(h.sockets[1]);h.sockets[1].emit('message',{type:'servers',servers:[{name:'热血传奇',status:'idle'}]},2);h.context.classicAuth.serverHandlers.exit();assert.equal(h.sockets[1].closed,true);assert.equal(h.context.classicAuth.scene,'login');assert.equal(h.context.credentials,undefined);
 console.log('PASS retired scene handlers cannot send into a new socket, and explicit server exit clears authentication state');
}

for(const scene of ['servers','notice']){
 const h=harness();h.connect('login');const socket=h.sockets[0];h.handshake(socket);
 socket.emit('message',scene==='servers'?{type:'servers',servers:[{name:'热血传奇',status:'idle'}]}:{type:'entryNotice',noticeId:1,lines:['公告']},2);
 const retired=scene==='servers'?()=>h.context.classicAuth.serverHandlers.choose('热血传奇'):()=>h.context.classicAuth.noticeHandler(1);
 socket.emit('close');assert.equal(h.context.socket,undefined);assert.equal(h.context.classicAuth.scene,'login');assert.equal(h.context.classicAuth.busy,false);assert.equal(h.context.credentials,undefined);assert.equal(h.context.reconnectEnabled,false);assert.equal(h.timers.size,0);
 const sent=socket.sent.length;retired();assert.equal(socket.sent.length,sent,'disconnected entry handlers must not write to the retired socket');
 console.log(`PASS ${scene} disconnect releases the scene and restores deliberate login without stale commands`);
}

console.log('auth play production regression: original entry stages and prior authentication paths PASS');

{
 const callbacks=[],calls=[],cleared=[],classes=new Set(['in-world']),worldStatus={dataset:{}},worldConnectionStatus={dataset:{}},reconnectCancel={hidden:true},connection={textContent:''},credentials={account:'player01',password:'secret12'},socket={closed:false,close(){this.closed=true;}};
 const context={worldStatus,worldConnectionStatus,reconnectCancel,worldNoticeTimer:undefined,connection,credentials,selectedCharacter:'Hero',socket,reconnectEnabled:true,reconnectAttempts:0,reconnectTimer:undefined,clearAuthenticationWait(){},
  document:{body:{classList:{remove(name){classes.delete(name);},contains(name){return classes.has(name);}}}},
  window:{setTimeout(callback,delay){callbacks.push({callback,delay});return callbacks.length;}},
  clearTimeout(id){cleared.push(id);},
  connect(...args){calls.push(args);},classicAuth:{showLogin(){calls.push(['showLogin']);},setBusy(value){calls.push(['busy',value]);}},
 };
 vm.createContext(context);vm.runInContext(reconnectCode,context);
 context.setWorldConnectionState('reconnecting');context.connection.textContent='连接已断开，1 秒后自动重连 (1/5)…';context.scheduleReconnect();
 assert.equal(worldStatus.dataset.connectionState,'reconnecting','reconnect state must be exposed to the in-world status output');
 assert.equal(callbacks[0].delay,500,'first retry should retain the existing half-second backoff');
 assert.equal(reconnectCancel.hidden,false,'the visible reconnect state must also expose its cancel control');
 assert.equal(worldConnectionStatus.dataset.connectionState,'reconnecting','the wrapper must drive the visible banner');
 callbacks[0].callback();
 assert.deepEqual(calls[0],['login','Hero',credentials,true],'retry should resume the previous character with saved credentials');
 context.reconnectTimer=99;context.cancelReconnect();
 assert.deepEqual(cleared,[99],'cancel should clear a pending backoff timer');
 assert.equal(socket.closed,true,'cancel should close the in-flight retry socket');
 assert.equal(context.socket,undefined,'late messages from the cancelled socket must be ignored');
 assert.equal(context.credentials,undefined,'cancel should discard saved reconnect credentials');
 assert.equal(context.reconnectEnabled,false);
 assert.equal(reconnectCancel.hidden,true);
 assert.equal(classes.has('in-world'),false,'cancel should return to login instead of leaving a frozen world scene');
 assert.equal(context.connection.textContent,'已取消自动重连，请手动登录');
 assert.deepEqual(calls.slice(1),[['showLogin'],['busy',false]]);
 context.reconnectEnabled=true;context.credentials=credentials;context.selectedCharacter='Hero';classes.add('in-world');calls.length=0;
 context.reconnectTimer=undefined;context.reconnectAttempts=5;context.connection.textContent='';context.scheduleReconnect();
 assert.equal(worldStatus.dataset.connectionState,undefined,'terminal failure should clear the in-world status flag');
 assert.equal(worldConnectionStatus.dataset.connectionState,undefined,'terminal failure should hide the banner wrapper');
 assert.equal(classes.has('in-world'),false,'terminal failure should return to the login scene');
 assert.equal(context.connection.textContent,'自动重连失败，请重新登录');
 assert.deepEqual(calls,[['showLogin'],['busy',false]]);
 console.log('PASS reconnect progress, explicit cancellation, and terminal failure all return cleanly to login');
}

assert.match(fs.readFileSync(path.join(root,'apps/web/src/style.css'),'utf8'),/body\.in-world #world-connection-status\[data-connection-state=reconnecting\]/,'normal players need a visible status banner while reconnecting');
console.log('PASS reconnect status banner is enabled outside diagnostic mode');

{
 const callbacks=[],cleared=[],classes=new Set(['in-world']),connection={textContent:'交易成交已确认'},worldStatus={dataset:{},textContent:''},worldConnectionStatus={dataset:{}},reconnectCancel={hidden:true};
 const context={connection,worldStatus,worldConnectionStatus,reconnectCancel,worldNoticeTimer:undefined,
  document:{body:{classList:{contains:name=>classes.has(name)}}},clearTimeout:id=>cleared.push(id),
  window:{setTimeout(callback,delay){callbacks.push({callback,delay});return callbacks.length;}},
 };
 vm.createContext(context);vm.runInContext(statusCode,context);context.syncWorldStatus();
 assert.equal(worldStatus.textContent,'交易成交已确认','the aria-live status should mirror the interaction result');
 assert.equal(worldConnectionStatus.dataset.connectionState,'notice','ordinary action results should appear briefly during play');
 assert.equal(callbacks[0].delay,2600,'interaction notices should clear after a short reading window');
 connection.textContent='已连接 · 战士 · 20,30';context.syncWorldStatus();
 assert.equal(callbacks.length,1,'routine position updates must not restart or spam the notice timer');
 callbacks[0].callback();assert.equal(worldConnectionStatus.dataset.connectionState,undefined,'the transient notice should dismiss itself');
 connection.textContent='攻击 骷髅';context.syncWorldStatus();
 assert.equal(worldConnectionStatus.dataset.connectionState,undefined,'per-swing combat text should stay out of the toast stream');
 console.log('PASS interaction feedback is visible briefly while movement coordinates and repeated attacks stay quiet');
}

{
 const h=harness();h.connect('login');const socket=h.sockets[0];
 assert.equal(h.timers.size,1,'login should have a bounded initial gateway response wait');
 assert.equal(h.expire().delay,15000,'the gateway wait should allow normal network latency');
 assert.equal(socket.closed,true,'a silent gateway socket should be closed after timeout');
 assert.equal(h.context.socket,undefined,'a timed-out socket must no longer own the login scene');
 assert.equal(h.context.classicAuth.busy,false,'timeout must unlock the login controls');
 assert.match(h.connection.textContent,/网关响应等待超时/);
 console.log('PASS silent gateway timeout closes the stale socket and restores retryable login');
}

{
 const h=harness();h.connect('login');const socket=h.sockets[0];h.handshake(socket);
 assert.equal(h.timers.size,1,'receiving connected should replace the gateway timer with the login response timer');
 h.expire();
 assert.equal(socket.closed,true,'a silent login response should release its transport');
 assert.equal(h.context.classicAuth.busy,false,'a login response timeout must unlock form controls');
 assert.match(h.connection.textContent,/账号登录等待超时/);
 console.log('PASS login response timeout unlocks the form and keeps the failure actionable');
}

{
 const h=harness();h.connect('register');const socket=h.sockets[0];h.handshake(socket);h.expire();
 assert.equal(h.password.value,'secret12','registration timeout should preserve the retry draft');
 assert.match(h.context.classicAuth.registrationError.message,/账号注册等待超时/);
 assert.equal(h.context.classicAuth.busy,false);
 assert.equal(h.context.reconnectEnabled,false,'registration timeout must never become automatic login');
 console.log('PASS registration timeout preserves the form draft and never retries as login');
}

{
 const h=harness(),credentials={account:'player01',password:'secret12'};h.enterWorld();h.context.connect('login','Hero',credentials,true);const socket=h.sockets[0];h.handshake(socket);socket.emit('message',{type:'error',commandType:'login',message:'账号已失效'},2);
 assert.equal(h.context.reconnectEnabled,false,'a typed automatic-login rejection must stop pointless retries');
 assert.equal(h.context.credentials,undefined,'rejected reconnect credentials must be discarded');
 assert.equal(h.context.socket,undefined,'the rejected session transport must be released');
 assert.equal(h.isInWorld(),false,'the hidden world scene must exit so the login screen is visible');
 assert.equal(h.context.classicAuth.scene,'login');
 assert.equal(socket.closed,true);
 const revision=h.context.selectionRevision;
 socket.emit('message',{type:'characters',characters:[]},3);
 assert.equal(h.context.selectionRevision,revision,'late characters from the rejected socket must not reopen selection');
 console.log('PASS automatic-login rejection exits the hidden world and ignores the rejected socket');
}

{
 const selectors={'#character-name':{value:'Warrior'},'#character-job':{value:'0'},'#character-sex':{value:'1'},'#character-hair':{value:'2'}},sent=[],waits=[];
 const context={document:{querySelector:selector=>selectors[selector]},worldCommandsAvailable:()=>true,classicAuth:{setBusy(){}},socket:{send:text=>sent.push(JSON.parse(text))},armCurrentAuthWait:stage=>waits.push(stage),connection:{textContent:''}};
 vm.createContext(context);vm.runInContext(createSubmitCode,context);let prevented=false;context.submit({preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.deepEqual(sent,[{type:'createCharacter',name:'Warrior',job:0,sex:1,hair:2}]);
 assert.deepEqual(waits,['创建角色'],'character creation must join the same bounded response-wait flow');
 console.log('PASS character creation sends once and arms the bounded response wait');
}
