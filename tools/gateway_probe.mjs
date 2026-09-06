// Exercise the real WebSocket -> legacy TCP -> game engine path.
import { readFile, writeFile } from 'node:fs/promises';
const credentials = JSON.parse(await readFile('.runtime/probe-account.json', 'utf8'));
const report = { login: false, characters: false, map: false, movement: false };
const socket = new WebSocket('ws://127.0.0.1:18800/ws');
let sequence = 0;
const queue = [], waiters = [];
socket.addEventListener('message', event => {
  const packet = JSON.parse(event.data);
  if (packet.sequence <= sequence) throw new Error('Non-monotonic gateway sequence');
  sequence = packet.sequence;
  if (waiters.length) waiters.shift().resolve(packet.message);
  else queue.push(packet.message);
});
socket.addEventListener('close', () => {for (const waiter of waiters.splice(0)) waiter.reject(new Error('Gateway disconnected'));});
function receive() {
  if (queue.length) return Promise.resolve(queue.shift());
  return new Promise((resolve,reject) => {
    const waiter={resolve: value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}};
    const timer=setTimeout(()=>{const i=waiters.indexOf(waiter);if(i>=0)waiters.splice(i,1);reject(new Error('Gateway response timed out'));},15000);
    waiters.push(waiter);
  });
}
const send = command => socket.send(JSON.stringify(command));
try {
  if ((await receive()).type !== 'connected') throw new Error('Missing gateway greeting');
  send({type:'login', account:credentials.account, password:credentials.password});
  const characters=await receive();
  if(characters.type!=='characters'||!characters.characters.length)throw new Error(`Login/characters failed: ${JSON.stringify(characters)}`);
  report.login=report.characters=true;
  send({type:'selectCharacter', name:characters.characters[0].name});
  let position;
  for(let i=0;i<100;i++){
    const event=await receive();
    if(event.type==='map'){if(event.map!=='0')throw new Error('Unexpected map');report.map=true;}
    if(event.type==='entity'&&event.self){report.typedSelf=true;report.playerFeature=event.feature;}
    if(event.type==='legacy'&&event.id===50){position=[event.param,event.tag];break;}
    if(event.type==='error')throw new Error(event.message);
  }
  if(!position||!report.map||!report.typedSelf)throw new Error('No typed map entry');
  send({type:'inventory'});
  for(let i=0;i<300&&(!report.inventory||!report.attributes);i++){
    const event=await receive();
    if(event.type==='attributes')report.attributes={level:event.level,job:event.job,hp:event.hp,mp:event.mp,maxHp:event.maxHp,maxMp:event.maxMp,dc:event.dc,weight:event.weight,maxWeight:event.maxWeight};
    if(event.type==='equipment')report.equipment=event.slots;
    if(event.type==='inventory'){
      report.inventory=event.items;
      const baseline=JSON.parse(await readFile('.runtime/reports/inventory-baseline.json','utf8'));
      for(const expected of baseline.inventory){const actual=event.items.find(item=>item.makeIndex===expected.makeIndex);if(!actual||['name','durability','maxDurability','stdMode'].some(key=>actual[key]!==expected[key]))throw new Error('Web inventory differs from verified TCP baseline');}
    }
    if(event.type==='error')throw new Error(event.message);
  }
  if(!report.inventory)throw new Error('No inventory response');
  if(!report.attributes||report.attributes.hp<=0||report.attributes.maxHp<report.attributes.hp)throw new Error('No valid authoritative character attributes');
  const map=await readFile('.runtime/server/Mir200/Map/0.map');
  const width=map.readUInt16LE(0),height=map.readUInt16LE(2);
  const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  for(let direction=0;direction<8&&!report.movement;direction++){
    const [dx,dy]=directions[direction],x=position[0]+dx,y=position[1]+dy;
    if(x<0||y<0||x>=width||y>=height)continue;
    const offset=52+(x*height+y)*12;
    if((map.readUInt16LE(offset)|map.readUInt16LE(offset+4))&0x8000)continue;
    send({type:'move',x,y,direction});
    for(let i=0;i<200;i++){
      const event=await receive();
      if(event.type==='legacy'&&event.id===-1&&event.status.startsWith('+GD/')){report.movement=true;report.positionBefore=position;position=[x,y];report.positionAfter=position;break;}
      if(event.type==='legacy'&&event.id===28)break;
      if(event.type==='error')throw new Error(event.message);
    }
    if(!report.movement)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!report.movement)throw new Error('No movement accepted');
  const meat=report.inventory.find(item=>item.name==='鸡肉');
  if(!meat)throw new Error('Drop round-trip requires the verified chicken meat fixture');
  send({type:'dropItem',makeIndex:meat.makeIndex});
  let ground,dropAccepted=false;
  for(let i=0;i<300&&(!ground||!dropAccepted);i++){
    const event=await receive();
    if(event.type==='groundItem'&&event.name===meat.name)ground=event;
    if(event.type==='dropResult'&&event.makeIndex===meat.makeIndex){if(!event.accepted)throw new Error('Web drop rejected');dropAccepted=true;}
    if(event.type==='error')throw new Error(event.message);
  }
  if(!ground||!dropAccepted)throw new Error('No authoritative ground item after drop');
  for(let step=0;step<8&&(position[0]!==ground.x||position[1]!==ground.y);step++){
    const dx=Math.sign(ground.x-position[0]),dy=Math.sign(ground.y-position[1]);
    const direction=directions.findIndex(value=>value[0]===dx&&value[1]===dy),x=position[0]+dx,y=position[1]+dy;
    const offset=52+(x*height+y)*12;
    if(direction<0||((map.readUInt16LE(offset)|map.readUInt16LE(offset+4))&0x8000))throw new Error('Ground item path is blocked');
    send({type:'move',x,y,direction});
    let accepted=false;
    for(let i=0;i<200;i++){
      const event=await receive();
      if(event.type==='legacy'&&event.id===-1&&event.status.startsWith('+GD/')){position=[x,y];accepted=true;break;}
      if(event.type==='legacy'&&event.id===28)break;
      if(event.type==='error')throw new Error(event.message);
    }
    if(!accepted)throw new Error('Server rejected path to ground item');
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(position[0]!==ground.x||position[1]!==ground.y)throw new Error('Ground item is outside bounded pickup path');
  send({type:'pickup'});
  let restored,groundRemoved=false;
  for(let i=0;i<300&&(!restored||!groundRemoved);i++){
    const event=await receive();
    if(event.type==='itemAdded'&&event.item.makeIndex===meat.makeIndex)restored=event.item;
    if(event.type==='groundItemRemoved'&&event.id===ground.id)groundRemoved=true;
    if(event.type==='error')throw new Error(event.message);
  }
  const expectedDurability=meat.stdMode===40?Math.max(0,meat.durability-2000):meat.durability;
  if(!restored||!groundRemoved||restored.name!==meat.name||restored.durability!==expectedDurability)throw new Error('Web pickup did not restore authoritative item state');
  report.dropPickup={makeIndex:meat.makeIndex,groundId:ground.id,groundPosition:[ground.x,ground.y],durabilityBefore:meat.durability,durabilityAfter:restored.durability,passed:true};
  console.log('PASS WebSocket login, attributes, inventory, movement, drop, ground state and pickup');
} catch(error) {
  report.error=error.message;
  process.exitCode=1;
  console.error(error.message);
} finally {
  socket.close();
  await writeFile('.runtime/reports/gateway.json',JSON.stringify(report,null,2));
}
