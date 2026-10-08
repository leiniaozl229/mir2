import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {NpcProbeSession,readNativeNpcClickInterval} from '../tools/npc_probe_session.mjs';

let time=10000,sleeps=[];
const session=new NpcProbeSession(1000,{now:()=>time,pause:async ms=>{sleeps.push(ms);time+=ms;}});
session.observe({mapGeneration:7,message:{type:'map'}});
const a=await session.begin(10);
assert.deepEqual(a,{npcId:10,npcSessionId:1,mapGeneration:7});
assert.deepEqual(sleeps,[]);
assert.equal(session.matches({type:'npcDialogue',...a}),true);
for(const wrong of [{...a,npcId:11},{...a,npcSessionId:0},{...a,mapGeneration:6}])
 assert.equal(session.matches(wrong),false);
assert.throws(()=>session.fields(11),/no longer current/);
console.log('PASS NPC commands require the current actor, session and map generation');

session.observe({mapGeneration:7,message:{type:'npcDialogue',...a}});
const b=await session.begin(20);
assert.equal(b.npcSessionId,2);
assert.equal(time,11100);
assert.deepEqual(sleeps,[1000,100]);
session.observe({mapGeneration:7,message:{type:'npcDialogueClosed',...a}});
assert.deepEqual(session.fields(20),b);
session.observe({mapGeneration:7,message:{type:'npcDialogueClosed',...b}});
assert.throws(()=>session.fields(20),/no longer current/);
console.log('PASS native strict click interval is respected and stale A close preserves B');

session.observe({mapGeneration:8,message:{type:'map'}});
const c=await session.begin(30);
assert.equal(c.npcSessionId,3);
assert.equal(c.mapGeneration,8);
session.observe({mapGeneration:9,message:{type:'map'}});
assert.throws(()=>session.fields(30),/no longer current/);
assert.equal(session.matches({type:'npcDialogue',...c}),false);
assert.equal((await session.begin(30)).npcSessionId,4);
console.log('PASS map transitions discard active NPC identity without resetting the increasing serial');

const directory=await mkdtemp(join(tmpdir(),'mir2-npc-interval-'));
try{
 const root=pathToFileURL(directory+'/');
 assert.equal(await readNativeNpcClickInterval(root),1000);
 await mkdir(join(directory,'.runtime/server/Mir200'),{recursive:true});
 await writeFile(join(directory,'.runtime/server/Mir200/setting.conf'),'ClickNpcTime=1375\n');
 assert.equal(await readNativeNpcClickInterval(root),1375);
}finally{
 assert.equal(dirname(resolve(directory)),resolve(tmpdir()));
 assert.ok(basename(directory).startsWith('mir2-npc-interval-'));
 await rm(directory,{recursive:true,force:true});
}
console.log('PASS runtime ClickNpcTime overrides the source default without engine or DB access');
