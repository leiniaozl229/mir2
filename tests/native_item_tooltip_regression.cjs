const assert = require('node:assert/strict');
const {nativeExtraItemTip} = require('../tools/native-window-fix/item-tooltip.cjs');
const labels = {b7c0d3f9:'ac', c4a7d3f9:'mac', b9a5bbf7:'dc', c4a7b7a8:'mc', b5c0caf5:'sc'};
function decode(hex, base) {
  const bytes = Buffer.from(hex, 'hex');
  const name = bytes.subarray(1, 1 + bytes[0]).toString('hex');
  const snapshot = Buffer.from(bytes);
  const result = nativeExtraItemTip(bytes, {labels, items:{[name]:base}});
  assert.deepEqual(bytes, snapshot, 'view must not mutate the native item');
  return result;
}
const royal = '0ccdf5d5dfd1fcb4f828b5c029000036bc01000200005805401f0313031500000000020300340000c0d40100fa144e02400b401f';
const moon = '08f0a9d4c2d1fcb4f800000000000036bc011e0a0000d80ae02e0423052e0309030903091246000090d00300fb144e02881de02e';
const royalBase = {mode:54,ac:[3,5],mac:[3,5],dc:[0,0],mc:[0,0],sc:[2,3]};
let tip = decode(royal, royalBase);
assert.deepEqual(tip.stats.map(({field,min,max,bonus})=>[field,min,max,bonus]),
  [['ac',3,19,14],['mac',3,21,16],['sc',2,3,0]]);
assert.equal(tip.requiredLevel,52);
assert.equal(tip.durability,2880);
assert.equal(tip.maxDurability,8000);
tip = decode(moon,{mode:54,ac:[4,9],mac:[5,8],dc:[3,9],mc:[3,9],sc:[3,9]});
assert.deepEqual(tip.stats.map(({field,min,max,bonus})=>[field,min,max,bonus]),
  [['ac',4,35,26],['mac',5,46,38],['dc',3,9,0],['mc',3,9,0],['sc',3,9,0]]);
assert.equal(tip.requiredLevel,70);
const boot = Buffer.from(royal,'hex'); boot[15]=52; boot[27]=255;
tip = decode(boot.toString('hex'),{...royalBase,mode:52,ac:[3,240]});
assert.equal(tip.stats[0].bonus,15,'show effective bonus after byte cap');
boot[36]=1;
assert.equal(decode(boot.toString('hex'),{...royalBase,mode:52}).requiredLevel,null);
assert.equal(nativeExtraItemTip(Buffer.alloc(51),{labels,items:{}}),null);
assert.equal(decode(royal,{...royalBase,mode:52}),null);
boot[15]=21;
assert.equal(decode(boot.toString('hex'),{...royalBase,mode:21}),null,'preserve recovery necklace semantics');
const unknown = Buffer.from(royal,'hex'); unknown[1]=0;
assert.equal(nativeExtraItemTip(unknown,{labels,items:{}}),null);
console.log('Native belt/boot tooltip regression passed: real instance stats, capped green bonuses, requirements, unsupported modes, read-only view.');
