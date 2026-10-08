import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const play=fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8');
const html=fs.readFileSync(path.join(root,'apps/web/play.html'),'utf8');
const source=ts.createSourceFile('play.ts',play,ts.ScriptTarget.Latest,true);
const names=['renderAttackMode','requestAttackMode','receiveAttackMode','rejectAttackMode','rejectAttackModeCycle','cycleAttackMode'];
const declarations=names.map(name=>source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name)?.getText(source));
for(let i=0;i<names.length;i++)assert.ok(declarations[i],`production ${names[i]} missing`);
const code=ts.transpileModule(`${declarations.join('\n')}\nglobalThis.attackModeApi={renderAttackMode,requestAttackMode,receiveAttackMode,rejectAttackMode,rejectAttackModeCycle,cycleAttackMode};`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const labels=['全体攻击','和平攻击','夫妻攻击','师徒攻击','编组攻击','行会攻击','红名攻击'];
class Select{
 constructor(){this.value='0';this.disabled=false;this.dataset={};this.options=labels.map(textContent=>({textContent}));}
 get selectedOptions(){return [this.options[Number(this.value)]??{textContent:'未知'}];}
}
class Node{constructor(){this.textContent='';this.dataset={};}}
function harness(){
 const sent=[],nativeCommands=[],attackModeSelect=new Select(),attackModeStatus=new Node(),connection=new Node();let nextChatId=20,commandFailure=false;
 const context={self:1,attackMode:0,attackModePending:undefined,attackModeCommandChatId:undefined,attackModeNotice:'',attackModeSelect,attackModeStatus,connection,worldCommandsAvailable:()=>true,chatController:{sendCommand:text=>{nativeCommands.push(text);return commandFailure?undefined:++nextChatId;}},socket:{send:value=>sent.push(JSON.parse(value))}};
 vm.createContext(context);vm.runInContext(code,context);
 return {context,sent,nativeCommands,attackModeSelect,attackModeStatus,connection,api:context.attackModeApi,setCommandFailure(value){commandFailure=value;}};
}
{
 const h=harness();h.api.renderAttackMode();
 assert.equal(h.attackModeStatus.textContent,'服务端状态：全体攻击');assert.equal(h.attackModeSelect.disabled,false);
 h.attackModeSelect.value='2';h.api.requestAttackMode(2);
 assert.deepEqual(h.sent,[{type:'attackMode',mode:2}]);assert.equal(h.attackModeSelect.value,'2');assert.equal(h.attackModeSelect.disabled,true);assert.equal(h.attackModeStatus.textContent,'等待服务器确认：夫妻攻击');
 h.api.requestAttackMode(1);assert.equal(h.sent.length,1,'pending mode prevents a competing request');
 h.api.receiveAttackMode(2);assert.equal(h.context.attackMode,2);assert.equal(h.context.attackModePending,undefined);assert.equal(h.attackModeSelect.disabled,false);assert.equal(h.attackModeStatus.textContent,'已确认攻击模式：夫妻攻击');
 console.log('PASS pending selection is visibly locked until the authoritative mode echo');
}
{
 const h=harness();h.attackModeSelect.value='5';h.api.requestAttackMode(5);h.api.receiveAttackMode(3);
 assert.equal(h.context.attackMode,3);assert.equal(h.attackModeSelect.value,'3');assert.equal(h.attackModeSelect.disabled,false);assert.equal(h.attackModeStatus.textContent,'服务端当前攻击模式：师徒攻击');
 console.log('PASS a different server mode restores the authoritative selection and reports the current state');
}
{
 const h=harness();h.api.cycleAttackMode();assert.deepEqual(h.nativeCommands,['@AttackMode']);assert.deepEqual(h.sent,[],'the native hotkey uses the native command rather than guessing the next mode');assert.equal(h.context.attackModePending,'cycle');assert.equal(h.context.attackModeCommandChatId,21);assert.equal(h.attackModeStatus.textContent,'等待服务器确认攻击模式…');
 h.api.cycleAttackMode();assert.equal(h.nativeCommands.length,1,'Ctrl+H cannot send another mode while one is pending');
 h.api.receiveAttackMode(6);assert.equal(h.context.attackMode,6);assert.equal(h.context.attackModePending,undefined);assert.equal(h.attackModeSelect.value,'6');assert.match(h.attackModeStatus.textContent,/攻击模式已切换/);
 h.api.cycleAttackMode();assert.equal(h.nativeCommands.length,2,'the next hotkey uses the same native server command after confirmation');
 console.log('PASS Ctrl+H sends the reference @AttackMode command and waits for the server-selected mode');
}
{
 const h=harness();h.api.cycleAttackMode();assert.equal(h.api.rejectAttackModeCycle(99,'unrelated'),false);assert.equal(h.context.attackModePending,'cycle');
 assert.equal(h.api.rejectAttackModeCycle(21,'服务器拒绝切换'),true);assert.equal(h.context.attackModePending,undefined);assert.equal(h.context.attackModeCommandChatId,undefined);assert.equal(h.attackModeStatus.textContent,'服务器拒绝切换');
 h.setCommandFailure(true);h.api.cycleAttackMode();assert.equal(h.context.attackModePending,undefined);assert.match(h.attackModeStatus.textContent,/切换失败/);
 h.context.worldCommandsAvailable=()=>false;h.api.cycleAttackMode();assert.equal(h.nativeCommands.length,2,'world input block prevents native command send');
 console.log('PASS native-command rejection correlates by chatId and failed or blocked sends release the selector');
}
{
 const h=harness();h.attackModeSelect.value='1';h.api.requestAttackMode(1);
 assert.equal(h.api.rejectAttackMode('服务器拒绝切换'),true);assert.equal(h.context.attackModePending,undefined);assert.equal(h.attackModeSelect.value,'0');assert.equal(h.attackModeSelect.disabled,false);assert.equal(h.attackModeStatus.textContent,'服务器拒绝切换');
 assert.equal(h.api.rejectAttackMode('迟到错误'),false,'an old error cannot replace a resolved state');
 console.log('PASS typed rejection restores the current mode and re-enables the control');
}
{
 const h=harness();h.attackModeSelect.value='4';h.context.socket.send=()=>{throw new Error('closed');};h.api.requestAttackMode(4);
 assert.equal(h.context.attackModePending,undefined);assert.equal(h.attackModeSelect.value,'0');assert.equal(h.attackModeSelect.disabled,false);assert.equal(h.attackModeStatus.textContent,'攻击模式发送失败，请重试');
 h.context.worldCommandsAvailable=()=>false;h.attackModeSelect.value='6';h.api.requestAttackMode(6);assert.equal(h.attackModeSelect.value,'0');
 h.context.worldCommandsAvailable=()=>true;h.attackModeSelect.value='7';h.api.requestAttackMode(7);assert.equal(h.attackModeSelect.value,'0');
 console.log('PASS send failure, unavailable world input and invalid mode restore server state');
}
assert.match(play,/else if\(message\.type==='attackMode'\)receiveAttackMode\(message\.mode\);/,'production dispatch must apply authoritative echoes');
assert.match(play,/attackModeSelect\.addEventListener\('change',\(\)=>requestAttackMode\(Number\(attackModeSelect\.value\)\)\)/,'selector changes must use the guarded pending-state route');
assert.match(play,/function cycleAttackMode\(\)\{\s*if\(self===undefined\|\|!worldCommandsAvailable\(\)\|\|attackModePending!==undefined\)return;\s*attackModePending='cycle';[^}]*chatController\.sendCommand\('@AttackMode'\)/,'Ctrl+H must use the source-backed native command and pending state');
assert.match(play,/message\.commandType==='attackMode'&&rejectAttackMode\(message\.message\)/,'typed gateway errors must release the pending selector');
assert.match(play,/rejectAttackModeCycle\(message\.chatId,message\.message\)/,'typed raw-command errors must release only the matching Ctrl+H request');
assert.match(play,/attackModePending=undefined;attackModeCommandChatId=undefined;attackModeNotice='';/,'world reset must clear pending attack-mode UI');
assert.match(html,/<span id="attack-mode-status" role="status" aria-live="polite" aria-atomic="true">/,'mode confirmation changes must be announced accessibly');
console.log('attack mode production regression: 5 scenarios PASS');
