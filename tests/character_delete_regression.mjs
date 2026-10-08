import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {fixture,playHarness,prguse,plain,flush} from './helpers/selection_fixture.mjs';
const root=new URL('../',import.meta.url),read=name=>fs.readFileSync(new URL(name,root),'utf8');
const contract=JSON.parse(read('content/classic-176/selection-actions.json'));
const code=ts.transpileModule(read('apps/web/src/character-delete.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let groups=0;const pass=text=>{groups++;console.log(`PASS ${text}`);};
const roles=[{name:'甲战士',job:0,sex:0,level:10},{name:'乙法师',job:1,sex:1,level:11}];
function controller(){
 const timers=new Map(),sent=[],busy=[],results=[],decisions=[];let available=true,current=true,unknown=0,nextTimer=0;
 const context={exports:{},require:()=>({default:contract}),setTimeout:(fn,ms)=>{assert.equal(ms,25000);timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(code,context);
 const hooks={available:()=>available,confirm:text=>new Promise(resolve=>decisions.push({text,resolve})),send:value=>{sent.push(plain(value));return true;},busy:value=>busy.push(value),result:value=>results.push(plain(value)),unknown:()=>unknown++};
 const value=new context.exports.CharacterDeleteController(hooks);
 return {value,timers,sent,busy,results,decisions,hooks,current:()=>current,setCurrent:v=>current=v,setAvailable:v=>available=v,unknown:()=>unknown};
}
for(const answer of ['no','cancel','interrupted']){
 const h=controller(),pending=h.value.request('甲战士',h.current);assert.equal(h.value.isBusy(),true);assert.equal(await h.value.request('乙法师',h.current),false);assert.ok(h.decisions[0].text.includes('“甲战士”'));
 h.decisions[0].resolve(answer);assert.equal(await pending,false);assert.equal(h.sent.length,0);assert.equal(h.value.isBusy(),false);
}
pass('actual controller only Yes authorizes one deletion; No/Cancel/interruption and duplicate confirmation send nothing');
for(const change of [h=>h.setCurrent(false),h=>h.setAvailable(false),h=>h.value.interrupt(),h=>h.value.destroy()]){
 const h=controller(),pending=h.value.request('甲战士',h.current);change(h);h.decisions[0].resolve('yes');assert.equal(await pending,false);assert.equal(h.sent.length,0);
}
pass('selection identity/availability/scene interruption and disposal invalidate late Yes callbacks before native request');
{
 const h=controller(),request=h.value.request('甲战士',h.current);h.decisions[0].resolve('yes');assert.equal(await request,true);assert.deepEqual(h.sent,[{type:'deleteCharacter',requestId:1,name:'甲战士'}]);assert.deepEqual(h.busy,[true]);
 const result={type:'characterDeletionResult',requestId:1,name:'甲战士',accepted:true,status:'deleted',requestSent:true,requiresLogin:false,characters:[roles[1]]};
 for(const bad of [{...result,requestId:2},{...result,name:'乙法师'},{...result,characters:roles},{...result,requiresLogin:true},{...result,accepted:false},{...result,status:'invented'}])assert.equal(h.value.handle(bad),false);
 assert.equal(h.value.isBusy(),true);assert.equal(h.results.length,0);assert.equal(h.value.handle(result),true);assert.deepEqual(h.busy,[true,false]);assert.equal(h.timers.size,0);
 const again=h.value.request('乙法师',h.current);h.decisions.at(-1).resolve('yes');await again;assert.equal(h.sent.at(-1).requestId,2);assert.equal(h.value.handle(result),false);
}
pass('matching request/name plus validated fresh absent-role snapshot is required; contradictory and stale outcomes leave pending untouched');
for(const outcome of ['timer','close','send-throw']){
 const h=controller();if(outcome==='send-throw')h.hooks.send=()=>{throw Error('transport');};
 const request=h.value.request('甲战士',h.current);h.decisions[0].resolve('yes');await request;
 if(outcome==='timer')[...h.timers.values()][0]();if(outcome==='close')h.value.disconnected();
 assert.equal(h.results.length,1);assert.equal(h.results[0].status,'unknown');assert.equal(h.results[0].accepted,null);assert.equal(h.unknown(),1);assert.equal(h.timers.size,0);assert.equal(h.value.isBusy(),false);h.value.disconnected();assert.equal(h.unknown(),1);
}
pass('deadline, disconnected native write and failed send stay unknown, release local pending and never replay deletion');
{
 const f=fixture();f.query('[data-auth-delete]').textContent='删除角色';await f.auth.ready();assert.equal(f.query('[data-auth-delete]').textContent,'');f.auth.setDeleteEnabled(true);f.auth.showSelect(roles);const action=[];f.auth.bindDelete(name=>action.push(name));
 for(const [name,selector] of [['start','[data-auth-start]'],['create','[data-auth-new]'],['delete','[data-auth-delete]'],['exit','[data-auth-exit]']]){
  const button=f.query(selector),spec=contract.buttons[name],frame=contract.frames[String(spec.frame)];assert.equal(button.style.left,`${spec.left}px`);assert.equal(button.style.top,`${spec.top}px`);assert.equal(button.style.width,`${frame.width}px`);assert.equal(button.style.height,`${frame.height}px`);
  const image=`url(/ui-national/prguse/${frame.file})`;assert.equal(button.style.backgroundImage,'none');button.emit('pointerenter',{pointerType:'mouse'});assert.equal(button.style.backgroundImage,image);button.emit('pointerdown',{button:0,pointerId:1,pointerType:'mouse'});assert.equal(button.style.backgroundImage,image);button.emit('pointerup',{pointerId:1});assert.equal(button.style.backgroundImage,image);button.emit('pointerleave');assert.equal(button.style.backgroundImage,'none');
 }
 f.query('[data-auth-delete]').emit('click');assert.deepEqual(action,['甲战士']);f.auth.setBusy(true);f.query('[data-auth-delete]').emit('click');assert.equal(action.length,1);f.auth.setBusy(false);f.auth.showSelect([]);assert.equal(f.query('[data-auth-delete]').disabled,true);f.auth.setDeleteEnabled(false);assert.equal(f.query('[data-auth-delete]').hidden,true);
}
pass('actual ClassicAuth uses locked original hot regions; resting labels remain in Prguse65, pointer states overlay aligned frames, deletion guards remain intact');
{
 const f=fixture();await f.auth.ready();f.auth.showSelect(roles);
 const start=f.query('[data-auth-start]'),exit=f.query('[data-auth-exit]');
 for(const button of [start,exit])button.emit('pointerdown',{button:0,pointerId:9,pointerType:'mouse'});
 assert.equal(f.document.defaultView.listeners.get('blur').length,1);assert.equal(f.document.listeners.get('visibilitychange').length,1);
 f.document.defaultView.emit('blur');
 for(const button of [start,exit])assert.equal(button.style.backgroundImage,'none');
 start.emit('pointerdown',{button:0,pointerId:10,pointerType:'touch'});f.document.hidden=true;f.document.emit('visibilitychange');
 assert.equal(start.style.backgroundImage,'none');assert.equal(f.auth.selectedCharacterName(),roles[0].name);
}
pass('actual selection controls share document lifecycle listeners and reset held frames on blur or page hiding without deleting or changing the role');
{
 const f=fixture();await f.auth.ready();f.auth.showSelect([{...roles[0]},{...roles[1],selected:true}]);assert.equal(f.auth.selectedCharacterName(),'乙法师');f.auth.showSelect(roles);assert.equal(f.auth.selectedCharacterName(),'乙法师');f.auth.showSelect([roles[1]]);assert.equal(f.auth.selectedCharacterName(),'乙法师');f.auth.showSelect([]);assert.equal(f.auth.selectedCharacterName(),undefined);
 const bad=plain(prguse);bad.frames['70'].file='wrong.png';const next=fixture({library:bad});await next.auth.ready();next.auth.setDeleteEnabled(true);next.auth.showSelect(roles);assert.ok(!next.query('[data-auth-delete]').style.backgroundImage?.includes('wrong.png'));
}
pass('native starred selection survives list refresh by role identity; invalid delete frame identity cannot select a different source skin');
{
 const h=await playHarness(),c=h.context;c.receive({data:JSON.stringify({sequence:1,mapGeneration:4,message:{type:'characters',characters:roles}})});
 h.f.query('[data-auth-delete]').emit('click');assert.deepEqual(h.dialogs[0].spec.buttons,['yes','no','cancel']);h.dialogs.shift().finish('yes');await flush();assert.equal(h.sent.length,1);assert.equal(h.sent[0].type,'deleteCharacter');assert.equal(h.f.query('[data-auth-start]').disabled,true);
 h.f.query('[data-auth-start]').onclick();assert.equal(h.sent.length,1);
 h.receive({type:'characterDeletionResult',requestId:1,name:'甲战士',accepted:true,status:'deleted',requestSent:true,requiresLogin:false,characters:[roles[1]]});assert.equal(h.f.auth.selectedCharacterName(),'乙法师');assert.match(c.connection.textContent,/已删除/);assert.equal(h.f.query('[data-auth-start]').disabled,false);assert.equal(h.dialogs.length,1);
}
pass('actual play delete click constructs three-choice production modal, sends correlated command, blocks enter and consumes only matching refreshed role list');
{
 const h=await playHarness(),c=h.context;h.receive({type:'characters',characters:roles});h.f.query('[data-auth-delete]').emit('click');h.dialogs.shift().finish('yes');await flush();
 h.receive({type:'characterDeletionResult',requestId:1,name:'甲战士',accepted:null,status:'unknown',requestSent:true,requiresLogin:true});assert.equal(c.socket,undefined);assert.equal(h.active.closed,1);assert.equal(c.credentials,undefined);assert.equal(c.reconnectEnabled,false);assert.equal(h.f.element.dataset.authScene,'login');assert.match(c.connection.textContent,/未确认/);assert.equal(h.sent.length,1);
 h.receive({type:'characterDeletionResult',requestId:1,name:'甲战士',accepted:true,status:'deleted',requiresLogin:false,characters:[]});assert.equal(h.f.element.dataset.authScene,'login');
}
pass('actual play unknown outcome closes old selection and clears reconnect credentials; a late success cannot mutate the new login scene');
{
 const h=await playHarness();h.receive({type:'characters',characters:roles});h.f.query('[data-auth-delete]').emit('click');const old=h.dialogs.shift();h.f.auth.showSelect([roles[1]]);old.finish('yes');await flush();assert.equal(h.sent.length,0);
 h.f.auth.showSelect(roles);h.f.query('[data-auth-delete]').emit('click');h.dialogs.shift().finish('yes');await flush();h.receive({type:'error',commandType:'deleteCharacter',requestId:99,message:'old'});assert.equal(h.f.query('[data-auth-start]').disabled,true);h.receive({type:'error',commandType:'deleteCharacter',requestId:1,message:'拒绝'});assert.equal(h.f.query('[data-auth-start]').disabled,false);
}
pass('actual play validates selected identity after modal, and only a matching typed command rejection releases deletion controls');
console.log(`TOTAL ${groups} character-delete groups; production controllers/markup/play AST with fake DOM and transport, no original/browser claim`);
