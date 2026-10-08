import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const play=fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8');
const html=fs.readFileSync(path.join(root,'apps/web/play.html'),'utf8');
const css=fs.readFileSync(path.join(root,'apps/web/src/style.css'),'utf8');
const source=ts.createSourceFile('play.ts',play,ts.ScriptTarget.Latest,true);
const declaration=name=>source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)?.getText(source);
const names=['renderGroup','sendGroup','groupCoolingDown','confirmGroupAction','cancelGroupConfirmation','receiveGroupMode','receiveGroupResult','receiveGroupError'];
for(const name of names)assert.ok(declaration(name),`production ${name} missing`);
const code=ts.transpileModule(`${names.map(declaration).join('\n')}\nglobalThis.groupApi={renderGroup,sendGroup,groupCoolingDown,confirmGroupAction,cancelGroupConfirmation,receiveGroupMode,receiveGroupResult,receiveGroupError};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
class Node{
  constructor(){this.disabled=false;this.hidden=false;this.title='';this.attributes={};this.dataset={};this.children=[];this.value='';this.textContent='';this.focused=false;}
 setAttribute(name,value){this.attributes[name]=value;}
 replaceChildren(...children){this.children=[...children];}
 append(...children){this.children.push(...children);}
 focus(){this.focused=true;}
}
let groups=0;const pass=name=>{groups++;console.log(`PASS ${name}`);};
function harness(){
  const sent=[],prompts=[],connection=new Node(),groupMode=new Node(),groupStatus=new Node(),groupFeedback=new Node(),groupCreate=new Node(),groupAdd=new Node(),groupRemove=new Node(),groupMembers=new Node();let dialogOpen=false,now=0;
  const context={groupEnabled:true,groupMemberNames:['小明','小红'],groupPending:undefined,groupConfirmationPending:undefined,groupConfirmationSerial:0,groupCooldownUntil:0,groupFeedbackText:'',groupMode,groupStatus,groupFeedback,groupCreate,groupAdd,groupRemove,groupMembers,connection,performance:{now:()=>now},worldCommandsAvailable:()=>true,systemDialog:{isOpen:()=>dialogOpen,showInput:request=>{dialogOpen=true;return new Promise(resolve=>prompts.push({request,resolve:(result,value='')=>{dialogOpen=false;resolve({result,value});}}));}},socket:{send:value=>sent.push(JSON.parse(value))},document:{createElement:()=>new Node()}};
 vm.createContext(context);vm.runInContext(code,context);
  return {context,sent,prompts,connection,groupMode,groupStatus,groupFeedback,groupCreate,groupAdd,groupRemove,groupMembers,setNow:value=>{now=value;},now:()=>now,api:context.groupApi};
}
{
 const h=harness();h.api.renderGroup();
  assert.equal(h.groupStatus.textContent,'队伍 2 人');assert.equal(h.groupMode.textContent,'允许组队：开');assert.equal(h.groupMode.attributes['aria-pressed'],'true');assert.equal(h.groupStatus.dataset.pending,'false');assert.equal(h.groupFeedback.hidden,true);
 assert.equal(h.groupCreate.disabled,true,'an existing party cannot create another group');assert.equal(h.groupAdd.disabled,false);assert.equal(h.groupRemove.disabled,false);
  h.api.sendGroup('groupCreate');assert.equal(h.sent.length,0,'existing group state blocks create requests');
  h.api.sendGroup('groupAdd','  小明  ');
 assert.equal(h.sent.length,1);assert.equal(JSON.stringify(h.sent[0]),JSON.stringify({type:'groupAdd',target:'小明'}));
 assert.equal(h.groupStatus.textContent,'正在邀请成员…');assert.equal(h.groupStatus.dataset.pending,'true');
 assert.equal(h.groupFeedback.hidden,true,'pending state clears the previous local result');
 for(const button of [h.groupMode,h.groupCreate,h.groupAdd,h.groupRemove])assert.equal(button.disabled,true);
 h.api.sendGroup('groupRemove','小红');assert.equal(h.sent.length,1,'a second click must not queue another group request');
 pass('production group request locks every conflicting control and sends one trimmed target');
}
{
 const h=harness();h.api.confirmGroupAction('groupAdd');
 assert.equal(h.prompts.length,1);assert.equal(h.sent.length,0,'opening the native prompt must not send the invite');
 assert.equal(JSON.stringify(h.prompts[0].request),JSON.stringify({text:'键入您想要参加小组的名字 .',buttons:['ok','cancel'],size:'horizontal',input:{label:'角色名',maxLength:10,inputMode:'text'}}));
 assert.equal(h.context.groupConfirmationPending.type,'groupAdd');assert.equal(h.groupStatus.textContent,'等待输入邀请成员对象…');
 for(const control of [h.groupMode,h.groupCreate,h.groupAdd,h.groupRemove])assert.equal(control.disabled,true,'controls stay locked while the modal is open');
 h.api.confirmGroupAction('groupRemove');assert.equal(h.prompts.length,1,'double clicks do not queue a second input prompt');
 h.prompts[0].resolve('ok','  小明  ');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.sent.length,1);assert.equal(JSON.stringify(h.sent[0]),JSON.stringify({type:'groupAdd',target:'小明'}));assert.equal(h.context.groupPending.type,'groupAdd');
 pass('party invite uses the native text-entry prompt and submits its trimmed name only after OK');
}
{
 const cases=[['groupCreate','请输入邀请加入小组的玩家名.',[],{type:'groupCreate',target:'目标玩家'}],['groupAdd','键入您想要参加小组的名字 .',['小明'],{type:'groupAdd',target:'目标玩家'}],['groupRemove','键入您想要从小组被删除的名字.',['小明'],{type:'groupRemove',target:'目标玩家'}]];
 for(const [action,text,members,expected] of cases){const h=harness();h.context.groupMemberNames=members;h.api.confirmGroupAction(action);assert.equal(h.prompts[0].request.text,text,`${action} prompt should match the Delphi reference text`);h.prompts[0].resolve('ok','  目标玩家  ');await new Promise(resolve=>setImmediate(resolve));assert.equal(JSON.stringify(h.sent[0]),JSON.stringify(expected));}
 const empty=harness();empty.api.confirmGroupAction('groupAdd');empty.prompts[0].resolve('ok','   ');await new Promise(resolve=>setImmediate(resolve));assert.equal(empty.sent.length,0);assert.equal(empty.groupFeedback.textContent,'请填写角色名');
 pass('create/invite/remove use their source-backed Chinese prompts; empty OK input sends nothing');
}
{
 const h=harness();h.api.confirmGroupAction('groupRemove');assert.equal(h.sent.length,0);h.prompts[0].resolve('cancel','小红');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.sent.length,0,'cancel must not submit member removal');assert.equal(h.context.groupConfirmationPending,undefined);assert.equal(h.groupRemove.disabled,false);
 h.api.confirmGroupAction('groupRemove');h.api.cancelGroupConfirmation();h.prompts[1].resolve('ok','小红');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.sent.length,0,'an interrupted prompt from an old scene cannot submit later');assert.equal(h.api.groupCoolingDown(),false,'cancelled and interrupted prompts do not start the local cooldown');
 pass('cancel and interrupted native name prompts never send stale membership commands');
}
{
 const h=harness();h.api.sendGroup('groupAdd','小明');
 h.api.receiveGroupResult({action:'create',accepted:true,reason:0});
 assert.equal(h.context.groupPending.type,'groupAdd','another action result cannot unlock this request');assert.equal(h.groupAdd.disabled,true);
 assert.equal(h.groupFeedback.hidden,true,'a result for another action must not be presented as this request result');
 h.api.receiveGroupResult({action:'add',accepted:false,reason:-4});
 assert.equal(h.context.groupPending,undefined);assert.equal(h.groupAdd.disabled,false);assert.equal(h.groupStatus.textContent,'队伍 2 人');assert.equal(h.connection.textContent,'邀请成员失败 · 对方关闭了组队');
 assert.equal(h.groupFeedback.hidden,false);assert.equal(h.groupFeedback.textContent,h.connection.textContent);assert.equal(h.groupFeedback.title,h.connection.textContent);
 h.api.sendGroup('groupAdd','小明');assert.equal(h.sent.length,1,'a fast server reply does not bypass the remaining local cooldown');
 h.setNow(5000);assert.equal(h.api.groupCoolingDown(),true,'the native tick check remains closed at exactly five seconds');
 h.setNow(5001);assert.equal(h.api.groupCoolingDown(),false);h.api.sendGroup('groupAdd','小明');assert.equal(h.sent.length,2,'the shared gate reopens after the native strict-greater-than deadline');
 pass('matching typed results release the request lock while the source-backed cooldown remains active until its deadline');
}
{
 const h=harness();h.context.groupEnabled=false;h.api.sendGroup('groupMode');
 assert.equal(h.sent.length,1);assert.equal(h.sent[0].enabled,true);assert.equal(h.context.groupEnabled,false,'the UI must wait for server authority');
 h.api.sendGroup('groupMode');assert.equal(h.sent.length,1);
 h.api.receiveGroupMode(false);assert.equal(h.context.groupPending,undefined);assert.equal(h.context.groupEnabled,false);assert.equal(h.groupMode.attributes['aria-pressed'],'false');assert.match(h.connection.textContent,/未确认/);
 assert.equal(h.groupFeedback.textContent,h.connection.textContent,'the refusal is visible in the party window');
 h.api.sendGroup('groupMode');assert.equal(h.sent.length,1,'mode shares the cooldown with the prior group action');
 h.api.confirmGroupAction('groupAdd');assert.equal(h.prompts.length,0,'membership dialogs share the same cooldown as invitation mode');
 h.setNow(5001);h.api.sendGroup('groupMode');h.api.receiveGroupMode(true);assert.equal(h.sent.length,2);assert.equal(h.context.groupPending,undefined);assert.equal(h.context.groupEnabled,true);assert.equal(h.groupMode.attributes['aria-pressed'],'true');assert.equal(h.connection.textContent,'已允许其他玩家组队');
 pass('group invitation toggle remains server-authoritative and shares the native five-second action cooldown');
}
{
 const h=harness();h.api.receiveGroupMode(false);assert.equal(h.groupFeedback.hidden,true,'unsolicited authoritative state must not look like a user-action result');
 pass('unsolicited group mode snapshots update state without fabricating action feedback');
}
{
  const h=harness();h.context.groupMemberNames=[];h.api.sendGroup('groupCreate','   ');assert.equal(h.sent.length,0);assert.equal(h.context.groupPending,undefined);assert.equal(h.groupFeedback.textContent,'请填写角色名');assert.equal(h.groupFeedback.hidden,false);
 h.context.socket.send=()=>{throw new Error('closed');};h.api.sendGroup('groupCreate','小明');assert.equal(h.context.groupPending,undefined);assert.equal(h.groupMode.disabled,false);assert.equal(h.connection.textContent,'队伍操作发送失败，请重试');
 assert.equal(h.groupFeedback.textContent,h.connection.textContent,'synchronous send failures are visible in the party window');
 pass('missing target and synchronous transport failure leave group controls retryable');
}
{
 const h=harness();h.context.groupMemberNames=[];h.api.renderGroup();
 assert.equal(h.groupCreate.disabled,false);assert.equal(h.groupAdd.disabled,true,'members cannot be invited before a party exists');assert.equal(h.groupRemove.disabled,true,'members cannot be removed before a party exists');
  h.api.sendGroup('groupAdd','小明');h.api.sendGroup('groupRemove','小明');assert.equal(h.sent.length,0,'membership-only requests are rejected outside a group');
  h.context.groupMemberNames=['小明'];h.api.renderGroup();assert.equal(h.groupCreate.disabled,true);assert.equal(h.groupAdd.disabled,false);assert.equal(h.groupRemove.disabled,false);
 pass('create/add/remove controls follow authoritative party membership');
}
{
 const h=harness();h.api.sendGroup('groupAdd','小明');h.api.receiveGroupError('groupRemove','旧请求失败');
 assert.equal(h.context.groupPending.type,'groupAdd');assert.equal(h.groupAdd.disabled,true);assert.equal(h.groupFeedback.hidden,true,'an unrelated typed error must not overwrite the in-window feedback');
 h.api.receiveGroupError('groupAdd','邀请请求被网关拒绝');assert.equal(h.context.groupPending,undefined);assert.equal(h.groupAdd.disabled,false);assert.equal(h.connection.textContent,'邀请请求被网关拒绝');assert.equal(h.groupFeedback.textContent,h.connection.textContent);
 h.api.sendGroup('groupRemove','小红');assert.equal(h.sent.length,1,'a typed transport error also leaves the native local tick in force');h.setNow(5001);h.api.sendGroup('groupRemove','小红');assert.equal(h.sent.length,2,'retry becomes available after the shared cooldown');
 pass('typed gateway errors release only the matching group action');
}
assert.match(play,/message\.type==='groupMode'\)\{receiveGroupMode\(message\.enabled\);\}/);
assert.match(play,/message\.type==='groupResult'\)\{receiveGroupResult\(message\);\}/);
assert.match(play,/groupCreate\.addEventListener\('click',\(\)=>confirmGroupAction\('groupCreate'\)\)/,'create must pass through the confirmation modal');
assert.match(play,/groupAdd\.addEventListener\('click',\(\)=>confirmGroupAction\('groupAdd'\)\)/,'invite must pass through the confirmation modal');
assert.match(play,/groupRemove\.addEventListener\('click',\(\)=>confirmGroupAction\('groupRemove'\)\)/,'remove must pass through the confirmation modal');
assert.match(play,/\['groupMode','groupCreate','groupAdd','groupRemove'\]\.includes\(message\.commandType\)\)\{receiveGroupError/);
assert.match(play,/groupPending=undefined;groupFeedbackText='';/,'disconnect must clear party pending state and stale feedback');
assert.match(html,/<span id="group-feedback" role="status" aria-live="polite" aria-atomic="true" hidden><\/span>/,'party outcomes need an in-window live region');
assert.match(html,/<button id="group-mode"[^>]*aria-pressed="false"/,'party invitation toggle exposes its pressed state to assistive technology');
assert.match(css,/\.national-window\[data-window-kind=group\] #group-feedback\{[^}]*overflow:hidden;text-overflow:ellipsis/,'party feedback stays within the native panel geometry');
console.log(`group action production regression: ${groups} groups PASS`);
for(const file of ['apps/web/src/play.ts','apps/web/play.html','apps/web/src/style.css','tests/group_actions_regression.mjs'])console.log(`SHA256 ${crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')} ${file}`);
console.log('Scope: actual production group render/request/result/error functions under fake DOM/transport plus source routing checks; no browser/native timing or target-version visual claim.');
