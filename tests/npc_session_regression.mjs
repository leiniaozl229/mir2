import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context={exports:{},setTimeout(){throw new Error('NPC identity must not depend on a delay');}};
vm.createContext(context);
vm.runInContext(ts.transpileModule(fs.readFileSync(path.join(root,'apps/web/src/npc-session.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const {NpcSession}=context.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const initialTypes=['npcDialogue','shop','shopSell','repairItems','storageDeposit','storageItems'];

const session=new NpcSession(1),a=session.begin(101);
assert.deepEqual(plain(a),{npcSessionId:1,mapGeneration:1,npcId:101});
for(const type of initialTypes)assert.equal(session.accept({type,...a}),true,type);
assert.deepEqual(plain(session.close()),plain(a));
for(const type of initialTypes)assert.equal(session.accept({type,...a}),false,`closed ${type} reopened`);
assert.equal(session.accept({...a,type:'shopDetails'}),false);
assert.equal(session.accept({...a,type:'repairQuote'}),false);
assert.equal(session.accept({...a,type:'npcDialogueClosed'}),false);
assert.equal(session.current(),undefined);
console.log('PASS NPC, shop, sell, repair and storage windows stay closed when their stamped replies arrive late');

const b=session.begin(202);
for(const type of initialTypes){assert.equal(session.accept({...a,type}),false);assert.equal(session.accept({...b,type}),true);}
assert.equal(session.accept({...b,npcId:101}),false);
assert.equal(session.accept({...b,type:'npcDialogueClosed',npcId:101}),false);
session.close();const reopened=session.begin(202);
assert.notEqual(reopened.npcSessionId,b.npcSessionId);
assert.equal(session.accept(b),false);assert.equal(session.accept(reopened),true);
console.log('PASS switching NPC and reopening the same NPC reject the previous gateway presentation identity');

for(const reason of ['death','disconnect','leave']){
 const pending=session.current();assert.deepEqual(plain(session.invalidate()),plain(pending));
 assert.equal(session.accept(pending),false,reason);
 assert.equal(session.accept({npcSessionId:0,mapGeneration:1,npcId:101,automatic:true}),false,reason);
 session.begin(202);
}
const beforeMap=session.current();session.reset(2);
assert.equal(session.accept(beforeMap),false);assert.equal(session.current(),undefined);
const nextMap=session.begin(202);
assert.ok(nextMap.npcSessionId>beforeMap.npcSessionId);
assert.equal(session.accept({...nextMap,mapGeneration:1}),false);assert.equal(session.accept(nextMap),true);
console.log('PASS death/disconnect/leave invalidate immediately and a map reset retains monotonic client identities');

session.reset(3);
assert.equal(session.accept({npcSessionId:0,mapGeneration:2,npcId:101,automatic:true}),false);
assert.equal(session.accept({npcSessionId:0,mapGeneration:3,npcId:101}),false);
assert.equal(session.accept({npcSessionId:0,mapGeneration:3,npcId:101,automatic:true}),true);
assert.deepEqual(plain(session.current()),{npcSessionId:0,mapGeneration:3,npcId:101});
assert.equal(session.accept({npcSessionId:0,mapGeneration:3,npcId:101,type:'shop'}),true);
assert.equal(session.accept({npcSessionId:0,mapGeneration:3,npcId:202,automatic:true}),false);
session.close();assert.equal(session.accept({npcSessionId:0,mapGeneration:3,npcId:101,automatic:true}),false);
session.begin(101);assert.equal(session.accept({npcSessionId:0,mapGeneration:3,npcId:101,automatic:true}),false);
console.log('PASS valid entry scripts are admitted without a timer and automatic messages cannot resurrect a locally closed conversation');

session.reset(4);
assert.equal(session.accept({npcSessionId:0,mapGeneration:4,automatic:true}),true);
assert.equal(session.accept({npcSessionId:0,mapGeneration:4,npcId:202}),true);
assert.equal(session.accept({npcSessionId:0,mapGeneration:4,npcId:101}),false);
const copy=session.current();copy.npcSessionId=999;copy.mapGeneration=99;copy.npcId=101;
assert.deepEqual(plain(session.current()),{npcSessionId:0,mapGeneration:4,npcId:202});
const click=session.begin(202),returned=session.current();click.npcId=101;returned.mapGeneration=99;
assert.equal(session.accept({npcSessionId:click.npcSessionId,mapGeneration:4,npcId:202}),true);
console.log('PASS automatic sessions bind one NPC identity and callers cannot mutate the active stamp');

const active=session.current();
for(const malformed of [undefined,null,{}, {npcId:202}, {...active,npcSessionId:-1}, {...active,npcSessionId:1.5}, {...active,npcSessionId:NaN}, {...active,mapGeneration:undefined}, {...active,mapGeneration:'4'}, {...active,npcId:1.5}]){
 assert.equal(session.accept(malformed),false);
 assert.deepEqual(plain(session.current()),plain(active));
}
for(const invalid of [-1,NaN,Infinity,1.5])assert.throws(()=>session.reset(invalid),/Invalid/);
assert.throws(()=>session.begin(NaN),/Invalid/);
assert.equal(session.accept(active),true);
console.log('PASS unstamped, malformed and wrong-map presentation replies cannot alter current NPC state');

// Economic success must be processed outside accept(). This integration contract
// fixture deliberately updates authority even while the old presentation is denied.
const economic=session.current();session.close();
const authority={gold:500,inventory:new Map([[77,{makeIndex:77,durability:200}]])};
const sale={...economic,type:'shopSellResult',accepted:true,item:{makeIndex:77},gold:700};
assert.equal(session.accept(sale),false);
if(sale.accepted){authority.inventory.delete(sale.item.makeIndex);authority.gold=sale.gold;}
assert.equal(authority.gold,700);assert.equal(authority.inventory.has(77),false);assert.equal(session.current(),undefined);
console.log('PASS presentation rejection remains separate from late successful inventory/currency authority (integration contract fixture)');

// The legacy server has no nonce. Do not pretend this class can detect a gateway
// that incorrectly stamps an old same-NPC native packet with the current identity.
const same=session.begin(202);
assert.equal(session.accept({...same,type:'npcDialogue'}),true);
console.log('PASS same-NPC replies stamped as current remain a documented native-correlation limit');
