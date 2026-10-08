import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const profile=JSON.parse(read('content/classic-176/audio-playback.json'));
const code=ts.transpileModule(read('apps/web/src/game-audio.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
let groups=0;const pass=name=>{groups++;console.log(`PASS ${name}`);};
class Target{
 listeners=new Map();
 addEventListener(type,fn){let set=this.listeners.get(type);if(!set)this.listeners.set(type,set=new Set());set.add(fn);}
 removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
 emit(type,extra={}){for(const fn of this.listeners.get(type)??[])fn({type,isTrusted:true,...extra});}
 get count(){return [...this.listeners.values()].reduce((n,set)=>n+set.size,0);}
}
function harness(preference='on'){
 const document=new Target(),window=new Target(),instances=[],deferred=[],saved=[];document.hidden=false;
 let mode='ok';
 class Audio extends Target{
  constructor(url){super();this.url=url;this.paused=true;this.currentTime=0;this.playCalls=0;this.pauseCalls=0;instances.push(this);}
  cloneNode(){return new Audio(this.url);}
  play(){this.playCalls++;if(mode==='throw'){const e=new Error();e.name='NotSupportedError';throw e;}this.paused=false;
   if(mode==='deferred')return new Promise((resolve,reject)=>deferred.push({audio:this,resolve,reject}));
   if(mode==='blocked'){this.paused=true;const e=new Error();e.name='NotAllowedError';return Promise.reject(e);}
   return Promise.resolve();
  }
  pause(){this.paused=true;this.pauseCalls++;}
 }
 const toggle={attributes:{},setAttribute(key,value){this.attributes[key]=String(value);},onclick:null},context={exports:{},require:()=>profile,Audio,document,window,Error,localStorage:{getItem:()=>preference,setItem:(...args)=>saved.push(args)}};
 vm.createContext(context);vm.runInContext(code,context);const audio=new context.exports.GameAudio(toggle);
 return {audio,toggle,instances,document,window,deferred,saved,mode:value=>{mode=value;},playing:()=>instances.filter(x=>!x.paused),flush:async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();}};
}
{
 const h=harness();h.audio.setPhase('login');assert.equal(h.audio.debugState().music,'log-in-long2.wav');assert.equal(h.playing()[0].loop,true);
 const first=h.playing()[0];h.audio.setPhase('login');assert.equal(first.playCalls,1);
 h.audio.play('swing');h.audio.setPhase('select');assert.equal(first.paused,true);assert.equal(h.audio.debugState().voices,1);assert.equal(h.audio.debugState().music,'sellect-loop2.wav');
 h.audio.setPhase('select');assert.equal(h.playing().length,1);h.audio.setPhase('world');assert.equal(h.playing().length,0);assert.equal(h.audio.debugState().music,undefined);
 pass('login/select use original loop files, repeated scene updates do not restart, entering world clears prior voices');
}
{
 const h=harness();h.audio.setPhase('world');for(let i=0;i<40;i++)h.audio.play('swing');assert.equal(h.audio.debugState().voices,40);
 const playing=h.playing();playing[0].emit('ended');playing[1].emit('error');assert.equal(h.audio.debugState().voices,38);assert.equal(playing[0].count,0);assert.equal(playing[1].count,0);
 h.audio.clear();assert.equal(h.playing().length,0);assert.equal(h.audio.debugState().voices,0);
 pass('overlapping original independent voices have no invented cap and ended/error/clear release their instances');
}
{
 const h=harness();assert.equal(h.toggle.attributes['aria-label'],'关闭声音');assert.equal(h.toggle.title,'关闭声音（F12）');h.mode('deferred');h.audio.setPhase('login');h.audio.play('swing');h.toggle.onclick();assert.equal(h.audio.debugState().enabled,false);assert.equal(h.toggle.attributes['aria-label'],'开启声音');assert.equal(h.toggle.title,'开启声音（F12）');assert.equal(h.playing().length,0);
 for(const p of h.deferred)p.resolve();await h.flush();assert.equal(h.playing().length,0);assert.equal(h.saved[0][1],'off');
 h.mode('ok');h.toggle.onclick();assert.equal(h.audio.debugState().music,'log-in-long2.wav');assert.equal(h.playing().length,1);
 const disabled=harness('off');disabled.audio.setPhase('select');assert.equal(disabled.instances.length,0);assert.equal(disabled.audio.play('swing'),false);
 pass('mute persists, clears in-flight voices and late play completion cannot revive old sound');
}
{
 const h=harness();h.mode('blocked');h.audio.setPhase('login');h.audio.play('swing');await h.flush();assert.equal(h.audio.debugState().voices,1);assert.equal(h.audio.debugState().blocked,true);
 h.audio.setPhase('select');await h.flush();h.mode('ok');h.document.emit('pointerdown',{isTrusted:false});await h.flush();assert.equal(h.playing().length,0);
 h.document.emit('pointerdown');await h.flush();assert.equal(h.playing().length,1);assert.ok(h.playing()[0].url.endsWith('/sellect-loop2.wav'));assert.equal(h.audio.debugState().blocked,false);
 pass('trusted gesture retries only current blocked BGM; expired one-shots and prior login music never replay');
}
{
 const h=harness();h.mode('throw');h.audio.setPhase('login');assert.equal(h.audio.debugState().music,undefined);assert.equal(h.audio.debugState().voices,0);
 h.mode('ok');h.document.emit('keydown');await h.flush();assert.equal(h.audio.debugState().voices,1);
 h.playing()[0].emit('error');assert.equal(h.audio.debugState().voices,0);h.document.emit('pointerdown');await h.flush();assert.equal(h.playing().length,1);
 pass('synchronous play and media failures leave no stale music pointer and recover on the next gesture');
}
{
 const h=harness();h.audio.setPhase('login');await h.flush();const music=h.playing()[0];music.currentTime=12;h.audio.play('swing');h.window.emit('blur');assert.equal(h.playing().length,0);assert.equal(h.audio.debugState().voices,1);
 h.document.emit('visibilitychange');assert.equal(h.playing().length,0);h.window.emit('focus');await h.flush();assert.deepEqual(h.playing(),[music]);assert.equal(music.currentTime,12);
 h.document.hidden=true;h.document.emit('visibilitychange');h.window.emit('focus');assert.equal(h.playing().length,0);h.document.hidden=false;h.document.emit('visibilitychange');await h.flush();assert.deepEqual(h.playing(),[music]);
 h.window.emit('pagehide');assert.equal(h.playing().length,0);h.window.emit('pageshow');await h.flush();assert.deepEqual(h.playing(),[music]);
 pass('blur/hidden/page lifecycle pauses the current loop and clears effects without background or duplicate playback');
}
{
 const h=harness();h.mode('deferred');h.audio.setPhase('login');h.audio.dispose();assert.equal(h.document.count,0);assert.equal(h.window.count,0);assert.equal(h.toggle.onclick,null);
 for(const p of h.deferred)p.reject(Object.assign(new Error(),{name:'NotAllowedError'}));await h.flush();assert.equal(h.audio.debugState().blocked,false);assert.equal(h.audio.play('swing'),false);assert.equal(h.playing().length,0);
 pass('dispose detaches event listeners and late promises cannot restore the dead audio session');
}
{
 const h=harness();h.audio.setPhase('world');const urls=()=>h.playing().map(x=>x.url);
 h.audio.playMelee({feature:4<<8,meleeKind:'power'});assert.deepEqual(urls(),['/audio/52.wav','/audio/m7-1.wav']);h.audio.clear();
 h.audio.playMelee({feature:(1<<24)|(16<<8),meleeKind:'power'});assert.deepEqual(urls(),['/audio/56.wav','/audio/m7-2.wav']);h.audio.clear();
 for(const [kind,file] of [['thrusting','m12-1.wav'],['halfMoon','m25-1.wav'],['fire','m26-3.wav']]){h.audio.playMelee({feature:0,meleeKind:kind});assert.deepEqual(urls(),['/audio/57.wav',`/audio/${file}`]);h.audio.clear();}
 for(const kind of ['normal','heavy','big']){assert.equal(h.audio.playMelee({feature:0,meleeKind:kind}),true);assert.deepEqual(urls(),['/audio/57.wav']);h.audio.clear();}
 h.audio.playMelee({feature:0,meleeKind:'fire'},{weapon:false,skill:true});assert.deepEqual(urls(),['/audio/m26-3.wav']);h.audio.clear();
 h.audio.playMelee({feature:0,meleeKind:'fire'},{weapon:true,skill:false});assert.deepEqual(urls(),['/audio/57.wav']);h.audio.clear();
 assert.equal(h.audio.playMelee({feature:1,meleeKind:'fire'}),false);assert.equal(h.audio.playMelee({feature:0}),false);assert.equal(h.audio.debugState().voices,0);
 h.audio.play('swing',2);assert.equal(h.playing()[0].volume,1);
 pass('human impact uses original sex/weapon/sound.lst; normal/heavy/big emit only weapon sound and monsters cannot acquire skill voices');
}
{
 const h=harness();h.audio.setPhase('login');await h.flush();const first=h.playing()[0];assert.equal(first.playCalls,1);
 h.audio.setPhase('login');await h.flush();assert.deepEqual(h.playing(),[first]);assert.equal(first.playCalls,1);
 h.audio.clear();assert.equal(h.audio.debugState().voices,0);assert.equal(first.paused,true);h.audio.setPhase('login');await h.flush();const restored=h.playing()[0];
 assert.notEqual(restored,first);assert.equal(h.audio.debugState().music,'log-in-long2.wav');assert.equal(h.audio.debugState().voices,1);assert.equal(restored.playCalls,1);
 h.audio.setPhase('login');await h.flush();assert.deepEqual(h.playing(),[restored]);assert.equal(restored.playCalls,1);assert.equal(h.audio.debugState().blocked,false);
 pass('same-phase login after connection clear restores one current BGM, while a running same-phase loop never restarts');
}
{
 const h=harness();h.mode('deferred');h.audio.setPhase('login');const music=h.playing()[0];music.currentTime=9;
 assert.equal(h.deferred.length,1);h.window.emit('blur');assert.equal(music.paused,true);h.window.emit('focus');assert.equal(h.deferred.length,2);
 h.deferred[1].resolve();await h.flush();assert.deepEqual(h.playing(),[music]);assert.equal(h.audio.debugState().voices,1);
 h.deferred[0].reject(Object.assign(new Error(),{name:'AbortError'}));await h.flush();
 assert.deepEqual(h.playing(),[music]);assert.equal(music.currentTime,9);assert.equal(music.playCalls,2);assert.equal(h.audio.debugState().voices,1);assert.equal(h.audio.debugState().music,'log-in-long2.wav');assert.equal(h.audio.debugState().blocked,false);assert.equal(h.audio.debugState().errors.length,0);
 pass('late P1 AbortError after blur/focus P2 success cannot release, pause or poison the current BGM attempt');
}
{
 const h=harness();h.mode('deferred');h.audio.setPhase('login');const music=h.playing()[0];music.currentTime=11;
 h.document.hidden=true;h.document.emit('visibilitychange');assert.equal(music.paused,true);assert.equal(h.audio.debugState().suspended,true);
 h.deferred[0].reject(Object.assign(new Error(),{name:'AbortError'}));await h.flush();
 assert.equal(h.audio.debugState().voices,1);assert.equal(h.audio.debugState().music,'log-in-long2.wav');assert.equal(h.audio.debugState().blocked,false);assert.equal(music.currentTime,11);assert.equal(h.audio.debugState().errors.length,0);
 h.window.emit('focus');assert.equal(h.deferred.length,1);assert.equal(music.paused,true);h.document.hidden=false;h.document.emit('visibilitychange');assert.equal(h.deferred.length,2);
 h.deferred[1].resolve();await h.flush();assert.deepEqual(h.playing(),[music]);assert.equal(music.currentTime,11);assert.equal(music.playCalls,2);assert.equal(h.audio.debugState().voices,1);
 pass('hidden lifecycle invalidates pending play rejection but preserves the paused BGM instance and position until a visible retry');
}
{
 const source=ts.createSourceFile('classic-auth.ts',read('apps/web/src/classic-auth.ts'),ts.ScriptTarget.ES2022,true);
 const cls=source.statements.find(ts.isClassDeclaration),methods=new Map(cls.members.filter(ts.isMethodDeclaration).map(m=>[m.name.getText(source),m.getText(source)]));
 const mini=ts.transpileModule(`class Scene {${['showLogin','showSelect','showCreate','hide','hideEntryScenes','selectedCharacterName','closeRegistrationView'].map(n=>methods.get(n)).join('\n')}}globalThis.Scene=Scene;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const phases=[],scene={selectionLabels:{stop(){}},portraitAnimation:{stop(){}},hidePasswordChange(){},root:{dataset:{},querySelector:()=>({focus(){}})},loginScene:{},selectScene:{},createForm:{},characters:[],selected:0,jobInput:{value:'0'},sexInput:{value:'0'},renderSlots(){},renderCreate(){},onScene:p=>phases.push(p)};
 const c={};vm.createContext(c);vm.runInContext(mini,c);Object.setPrototypeOf(scene,c.Scene.prototype);scene.showLogin();scene.showSelect([]);scene.showCreate();scene.hide();assert.deepEqual(phases,['login','select','select','world']);
 assert.match(read('apps/web/src/play.ts'),/new ClassicAuth\([^\n]+phase=>audio\.setPhase\(phase\)/);
 pass('production auth methods emit login/select/create-as-select/world phases through the actual play audio callback');
}
console.log(`${groups}/${groups} audio playback regression checks passed; fake media/events, no browser output or audible comparison.`);
