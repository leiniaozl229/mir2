#!/usr/bin/env node
// Exercise leveling, dungeon travel, combat, corpse harvesting and boss drops
// through the real browser UI. A disposable account keeps persistent fixtures clean.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const pageUrl=process.env.MIR2_AGENT_PLAY_URL??'http://127.0.0.1:5173/play.html?agent=1';
const runId=new Date().toISOString().replaceAll(':','-').replace(/\.\d{3}Z$/,'Z');
const outputDir=path.join(root,'.runtime/reports/agent-gameplay-playtest',runId);
const latestPath=path.join(root,'.runtime/reports/agent-gameplay-playtest/latest.json');
const suffix=`${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`.slice(-8);
const fixture={account:`a${suffix}`.slice(0,10),password:`p${suffix}`.slice(0,10),warrior:`W${suffix}`.slice(0,10),character:`A${suffix}`.slice(0,10)};
const report={version:1,runId,pageUrl,scenario:'level-dungeon-boss-drops',passed:false,checks:[],stages:[],console:[],webSocket:[],artifacts:{},fixture:{character:fixture.character,disposable:true}};
let chrome,session;

function chromePath(){
 if(process.env.CHROME_PATH&&existsSync(process.env.CHROME_PATH))return process.env.CHROME_PATH;
 return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(existsSync);
}
function requireCheck(condition,name,detail={}){
 report.checks.push({name,passed:Boolean(condition),...detail});
 if(!condition)throw new Error(name);
}
function safeFrame(payload,direction){
 try{
  const parsed=JSON.parse(payload),message=parsed.message??parsed;
  return {direction,type:message.type,actionId:message.actionId,kind:message.kind,accepted:message.accepted,x:message.x,y:message.y,id:message.id,name:message.name,total:message.total,gained:message.gained,level:message.level,sequence:parsed.sequence,mapGeneration:parsed.mapGeneration};
 }catch{return {direction,type:'non-json',bytes:payload.length};}
}
function recordWebSocket(payload,direction){const frame=safeFrame(payload,direction);if(frame.type!=='legacy')report.webSocket.push(frame);if(report.webSocket.length>2000)report.webSocket.splice(0,report.webSocket.length-2000);}

class CdpSession{
 constructor(socket){
  this.socket=socket;this.nextId=1;this.pending=new Map();this.listeners=new Map();
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);if(message.error)pending.reject(new Error(message.error.message));else pending.resolve(message.result);return;}for(const listener of this.listeners.get(message.method)??[])listener(message.params);});
 }
 on(method,listener){const list=this.listeners.get(method)??[];list.push(listener);this.listeners.set(method,list);}
 send(method,params={}){const id=this.nextId++;this.socket.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out`));},20000);this.pending.set(id,{resolve,reject,timer});});}
 close(){this.socket.close();}
}

async function launchChrome(binary,port,profile){
 const args=[`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--disable-background-networking','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding','--disable-extensions','--no-first-run','--enable-webgl','--use-gl=angle'];
 if(process.env.MIR2_AGENT_VISIBLE!=='1')args.push('--headless=new');
 args.push('about:blank');const child=spawn(binary,args,{stdio:'ignore'});
 let targets;
 for(let attempt=0;attempt<60;attempt++){
  try{targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(response=>response.json());if(Array.isArray(targets)&&targets.some(target=>target.type==='page'&&target.webSocketDebuggerUrl))break;}catch{}
  await sleep(100);
 }
 const target=targets?.find(value=>value.type==='page'&&value.webSocketDebuggerUrl);
 if(!target){child.kill('SIGTERM');throw new Error('Chrome DevTools target missing');}
 const socket=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',()=>reject(new Error('Chrome DevTools connection failed')),{once:true});});
 return {child,cdp:new CdpSession(socket)};
}

async function evaluate(expression){
 const result=await session.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
 return result.result?.value;
}
async function waitFor(expression,timeout=30000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){const value=await evaluate(expression);if(value)return value;await sleep(100);}
 throw new Error(`Timed out waiting for ${expression}`);
}
async function snapshot(){return evaluate('window.__mir2Agent?.snapshot()');}
async function events(){return evaluate('window.__mir2Agent?.events() ?? []');}
async function capture(name){
 const result=await session.send('Page.captureScreenshot',{format:'png'}),file=path.join(outputDir,name);
 await writeFile(file,Buffer.from(result.data,'base64'));report.artifacts[name]=path.relative(root,file);return file;
}
async function clickTarget(name,id){
 const nameLiteral=JSON.stringify(name),idLiteral=id===undefined?'undefined':String(id);
 return evaluate(`(()=>{const buttons=[...document.querySelectorAll('#nearby-targets [data-entity-id]')];const button=buttons.find(value=>(${idLiteral}===undefined||Number(value.dataset.entityId)===${idLiteral})&&value.textContent.includes(${nameLiteral}));if(!button)return false;button.click();return true})()`);
}
async function waitAndClickTarget(name,id,timeout=30000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){if(await clickTarget(name,id))return;await sleep(200);}
 throw new Error(`Target ${name} was not available in the nearby UI`);
}
async function clickDialogue(command){
 const literal=JSON.stringify(command);
 const clicked=await evaluate(`(()=>{const button=[...document.querySelectorAll('#npc-options button')].find(value=>value.dataset.dialogueCommand===${literal});if(!button)return false;button.click();return true})()`);
 if(!clicked)throw new Error(`Dialogue option ${command} was not available`);
}
async function walkNear(x,y,distance=7){
 for(let attempt=0;attempt<12;attempt++){
  const state=await snapshot(),dx=x-state.self.x,dy=y-state.self.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<=distance)return state;
  let stepX=Math.max(-6,Math.min(6,dx)),stepY=Math.max(-6,Math.min(6,dy));
  if(attempt%3===1)stepY=0;else if(attempt%3===2)stepX=0;
  const point=await evaluate(`(()=>{const rect=document.querySelector('#viewport canvas').getBoundingClientRect();return {x:rect.left+rect.width/2+${stepX}*48*rect.width/800,y:rect.top+rect.height/2+${stepY}*32*rect.height/600}})()`);
  await session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});
  await session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1});
  await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.self&&!s.pendingAction&&!s.intentions.clickDestination})()",30000);
 }
 throw new Error(`Could not walk near ${x},${y}`);
}
async function walkNearTrainer(){const state=await snapshot();return state.self.x>500?walkNear(648,628):walkNear(284,609);}
async function pressTab(){
 await session.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
 await session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,nativeVirtualKeyCode:9});
 await sleep(100);
}
async function clickMiniMapCell(x,y,shift=false){
 const point=await evaluate(`(()=>{const state=window.__mir2Agent.snapshot().minimap,canvas=document.querySelector('#mini-map'),rect=canvas.getBoundingClientRect(),draw=state.drawRect;return {x:rect.left+draw.left+(${x}+.5)/state.world.width*draw.width,y:rect.top+draw.top+(${y}+.5)/state.world.height*draw.height}})()`);
 await session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1,modifiers:shift?8:0});
 await session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1,modifiers:shift?8:0});
}
async function selectLightning(){
 return evaluate(`(()=>{const row=[...document.querySelectorAll('#skills .skill-item')].find(value=>value.textContent.includes('雷电术'));const button=row?.querySelector('button');if(!button||button.disabled)return false;button.click();return true})()`);
}
function recordStage(name,value){report.stages.push({name,snapshot:value});return value;}
function itemCount(value,name){return value.inventory.items.filter(item=>item.name===name).length;}
const equipmentNames=['轻型盔甲(男)','乌木剑','青铜头盔','金项链','铁手镯','古铜戒指'];

try{
 await mkdir(outputDir,{recursive:true});
 const ready=await fetch(pageUrl).then(response=>response.ok).catch(()=>false);if(!ready)throw new Error(`Vite page unavailable: ${pageUrl}`);
 const binary=chromePath();if(!binary)throw new Error('Chrome, Chromium or Edge is required');
 const port=Number(process.env.MIR2_AGENT_GAMEPLAY_CHROME_PORT??19318),profile=path.join('/tmp',`mir2-agent-gameplay-${process.pid}`);
 chrome=await launchChrome(binary,port,profile);session=chrome.cdp;
 session.on('Runtime.exceptionThrown',params=>report.console.push({level:'exception',text:params.exceptionDetails?.exception?.description??params.exceptionDetails?.text}));
 session.on('Runtime.consoleAPICalled',params=>{if(params.type==='error'||params.type==='warning')report.console.push({level:params.type,text:params.args?.map(value=>value.value??value.description).join(' ')});});
 session.on('Log.entryAdded',params=>{if(params.entry.level==='error'||params.entry.level==='warning')report.console.push({level:params.entry.level,text:params.entry.text,url:params.entry.url});});
 session.on('Network.webSocketFrameSent',params=>recordWebSocket(params.response.payloadData,'out'));
 session.on('Network.webSocketFrameReceived',params=>recordWebSocket(params.response.payloadData,'in'));
 await Promise.all([session.send('Page.enable'),session.send('Runtime.enable'),session.send('Network.enable'),session.send('Log.enable')]);
 await session.send('Emulation.setDeviceMetricsOverride',{width:1000,height:800,deviceScaleFactor:1,mobile:false});
 await session.send('Emulation.setFocusEmulationEnabled',{enabled:true});await session.send('Page.bringToFront');
 await session.send('Page.navigate',{url:pageUrl});
 await waitFor("document.readyState==='complete'&&window.__mir2Agent?.version===1");
 await capture('01-registration.png');

 const account=JSON.stringify(fixture.account),password=JSON.stringify(fixture.password),warrior=JSON.stringify(fixture.warrior),character=JSON.stringify(fixture.character);
 await evaluate(`(()=>{document.querySelector('#account').value=${account};document.querySelector('#password').value=${password};document.querySelector('#register').click();return true})()`);
 await waitFor("document.querySelector('#auth-overlay')?.dataset.authScene==='select'",30000);
 await evaluate("(()=>{document.querySelector('[data-auth-new]').click();return true})()");
 await waitFor("document.querySelector('#auth-overlay')?.dataset.authScene==='create'");
 await evaluate(`(()=>{document.querySelector('[data-auth-job="0"]').click();document.querySelector('#character-name').value=${warrior};document.querySelector('#auth-create-ok').click();return true})()`);
 await waitFor("document.querySelector('#auth-overlay')?.dataset.authScene==='select'&&document.querySelector('.auth-slot[aria-label]')",30000);
 const warriorPortrait=await waitFor("(()=>{const image=document.querySelector('[data-auth-portrait]');return image?.complete&&image.naturalWidth>0&&/\\/40\\.[^/]+\\.png$/.test(new URL(image.src).pathname)&&{src:image.src,width:image.naturalWidth,height:image.naturalHeight}})()",20000);
 requireCheck(Boolean(warriorPortrait),'warrior selection uses the warrior portrait frame',{portrait:warriorPortrait});
 await evaluate("(()=>{document.querySelector('[data-auth-new]').click();return true})()");
 await waitFor("document.querySelector('#auth-overlay')?.dataset.authScene==='create'");
 await evaluate(`(()=>{document.querySelector('[data-auth-job="1"]').click();document.querySelector('#character-name').value=${character};document.querySelector('#auth-create-ok').click();return true})()`);
 await waitFor("document.querySelector('#auth-overlay')?.dataset.authScene==='select'&&document.querySelector('.auth-slot[aria-label]')",30000);
 await evaluate(`(()=>{const slot=[...document.querySelectorAll('.auth-slot[aria-label]')].find(value=>value.getAttribute('aria-label').startsWith(${character}));if(!slot)return false;slot.click();return true})()`);
 const wizardPortrait=await waitFor("(()=>{const image=document.querySelector('[data-auth-portrait]');return image?.complete&&image.naturalWidth>0&&/\\/80\\.[^/]+\\.png$/.test(new URL(image.src).pathname)&&{src:image.src,width:image.naturalWidth,height:image.naturalHeight}})()",20000);
 requireCheck(Boolean(wizardPortrait),'wizard selection uses the wizard portrait frame',{portrait:wizardPortrait});
 await capture('01b-profession-portraits.png');
 await evaluate("(()=>{document.querySelector('[data-auth-start]').click();return true})()");
 const entered=recordStage('entered-world',await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.inWorld&&s.worldReady&&s.self&&s.render?.framesReady&&s.attributes&&s.inventory?.known&&s})()",45000));
 requireCheck(entered.map==='0','disposable character enters Bichon',{map:entered.map,position:[entered.self.x,entered.self.y]});
 requireCheck(entered.minimap?.imageReady&&entered.minimap.frameIndex===100&&/\/100\.[^/]+\.png$/.test(entered.minimap.imageUrl),'Bichon minimap uses the mapped mmap.wil frame',{minimap:entered.minimap});
 const compactMapGeometry=await evaluate("(()=>{const shell=document.querySelector('#viewport-shell').getBoundingClientRect(),panel=document.querySelector('[data-hud-minimap-frame]').getBoundingClientRect();return {within:panel.left>=shell.left&&panel.top>=shell.top&&panel.right<=shell.right&&panel.bottom<shell.top+349,panel:{left:panel.left-shell.left,top:panel.top-shell.top,width:panel.width,height:panel.height}}})()");
 requireCheck(compactMapGeometry.within,'compact minimap stays inside the world viewport above the bottom HUD',{geometry:compactMapGeometry.panel});
 const hudSkillbar=await evaluate("(()=>{const node=document.querySelector('[data-hud-skillbar]');return {display:getComputedStyle(node).display,hidden:node.hidden,ariaHidden:node.getAttribute('aria-hidden')}})()");
 requireCheck(hudSkillbar.hidden&&hudSkillbar.display==='none'&&hudSkillbar.ariaHidden==='true','national HUD keeps skill shortcuts in the F11 skill page',{skillbar:hudSkillbar});
 await pressTab();const expandedMap=await waitFor("(()=>{const s=window.__mir2Agent.snapshot();return s.minimap.mode==='expanded'&&s.minimap.drawRect.width>500&&s})()");
 requireCheck(expandedMap.minimap.mode==='expanded','Tab expands the minimap');await capture('02a-minimap-expanded.png');
 const routeDirection=expandedMap.directions.find(value=>value.clearSteps>0);requireCheck(Boolean(routeDirection),'minimap route fixture has an adjacent walkable cell',{directions:expandedMap.directions});
 const routeTarget={x:expandedMap.self.x+routeDirection.dx,y:expandedMap.self.y+routeDirection.dy};
 await clickMiniMapCell(routeTarget.x,routeTarget.y);
 await waitFor("window.__mir2Agent.events().some(value=>value.type==='minimap-route')",5000);
 const routed=await waitFor(`(()=>{const s=window.__mir2Agent.snapshot();return !s.pendingAction&&!s.intentions.clickDestination&&s.self.x===${routeTarget.x}&&s.self.y===${routeTarget.y}&&s})()`,10000);
 requireCheck(routed.self.x===routeTarget.x&&routed.self.y===routeTarget.y,'clicking the expanded minimap enters the shared movement route',{target:routeTarget,position:[routed.self.x,routed.self.y]});
 await pressTab();requireCheck((await snapshot()).minimap.mode==='hidden','Tab hides the map after expanded mode');await pressTab();requireCheck((await snapshot()).minimap.mode==='compact','Tab restores compact mode after hidden mode');
 await capture('02-entered-world.png');

 await walkNearTrainer();await waitAndClickTarget('导师');
 await waitFor("window.__mir2Agent?.snapshot().dialogue?.npc?.endsWith('导师')",30000);
 await clickDialogue('@equipmentset');
 const equipmentBag=recordStage('equipment-set-received',await waitFor(`(()=>{const s=window.__mir2Agent?.snapshot();return ${JSON.stringify(equipmentNames)}.every(name=>s?.inventory?.items.some(item=>item.name===name))&&s})()`,20000));
 const equipmentIds=equipmentNames.map(name=>equipmentBag.inventory.items.find(item=>item.name===name).makeIndex);
 await clickDialogue('@main');await waitFor("window.__mir2Agent?.snapshot().dialogue?.options?.some(value=>value.command==='@exit')");
 await clickDialogue('@exit');await waitFor("!window.__mir2Agent?.snapshot().dialogue?.visible");
 await evaluate("(()=>{document.querySelector('[data-window-open=\"inventory\"]').click();return true})()");
 await waitFor(`(()=>${JSON.stringify(equipmentIds)}.every(id=>{const image=document.querySelector('[data-item-id="'+id+'"] img');return image?.complete&&image.naturalWidth>0}))()`,20000);
 requireCheck(true,'representative equipment icons load in the browser',{names:equipmentNames});
 const bagGeometry=await evaluate(`(()=>[...document.querySelectorAll('#inventory-items [data-item-id]')].map(cell=>{const image=cell.querySelector('img'),c=cell.getBoundingClientRect(),i=image.getBoundingClientRect();return {slot:Number(cell.dataset.slot),name:image.alt,cell:{x:c.x,y:c.y,width:c.width,height:c.height},image:{x:i.x,y:i.y,width:i.width,height:i.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight},centerError:{x:Math.abs((i.left+i.width/2)-(c.left+c.width/2)),y:Math.abs((i.top+i.height/2)-(c.top+c.height/2))},aspectError:Math.abs(i.width/i.height-image.naturalWidth/image.naturalHeight)}}))()`);
 requireCheck(bagGeometry.every(value=>value.image.width<=value.cell.width+.5&&value.image.height<=value.cell.height+.5&&value.centerError.x<=.5&&value.centerError.y<=.5&&value.aspectError<=.02),'bag icons retain their aspect ratio and stay centered in each cell',{items:bagGeometry});
 await capture('02a-equipment-icons.png');
 for(const id of equipmentIds){
  const clicked=await evaluate(`(()=>{const button=document.querySelector('[data-item-id="${id}"]');if(!button||button.disabled)return false;button.click();return true})()`);
  if(!clicked)throw new Error(`Equipment item ${id} could not be selected from the inventory UI`);
  await waitFor(`window.__mir2Agent?.snapshot().equipment.slots.some(value=>value.item.makeIndex===${id})`,10000);
 }
 const equipped=recordStage('equipment-equipped',await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.equipment?.slots?.length>=6&&s.paperdoll?.ready&&s.paperdoll.layers?.bodyName==='CArmour02'&&s.paperdoll.layers?.weaponName==='CWeapon01'&&s})()",20000));
 requireCheck(equipped.paperdoll.layers.bodyName==='CArmour02'&&equipped.paperdoll.layers.weaponName==='CWeapon01','equipped dress and weapon select matching actor libraries',{layers:equipped.paperdoll.layers,feature:equipped.paperdoll.feature});
 await evaluate("(()=>{document.querySelector('[data-window-open=\"character\"]').click();return true})()");
 await waitFor("(()=>{const images=[...document.querySelectorAll('#equipment-items img,#paperdoll-actor img')];return images.length>=8&&images.every(image=>image.complete&&image.naturalWidth>0)})()",20000);
 requireCheck(true,'equipment slots and paperdoll images load after equipping',{slots:equipped.equipment.slots.map(value=>({slot:value.slot,name:value.item.name}))});
 const equipmentGeometry=await evaluate(`(()=>({paperdollVisibility:getComputedStyle(document.querySelector('#paperdoll-actor')).visibility,items:[...document.querySelectorAll('#equipment-items [data-slot]')].map(node=>({slot:Number(node.dataset.slot),kind:node.classList.contains('equipment-appearance')?'appearance':'cell',left:node.style.left,top:node.style.top,width:node.style.width,height:node.style.height,src:node.querySelector('img')?.src}))}))()`);
 const expectedEquipment={0:['92px','91px'],1:['74px','59px'],4:['124px','55px'],3:['175px','108px'],2:['175px','144px'],5:['48px','197px'],6:['175px','197px'],7:['48px','233px'],8:['175px','233px']};
 requireCheck(equipmentGeometry.items.every(value=>expectedEquipment[value.slot]?.[0]===value.left&&expectedEquipment[value.slot]?.[1]===value.top),'equipment art follows the measured 2003 character-panel anchors',{items:equipmentGeometry.items});
 requireCheck(equipmentGeometry.paperdollVisibility==='hidden'&&equipmentGeometry.items.filter(value=>value.kind==='appearance').every(value=>value.src?.includes('/ui-national/stateitem/')),'equipped clothing, weapon and helmet use StateItem layers without a duplicate actor',{paperdollVisibility:equipmentGeometry.paperdollVisibility});
 await capture('02b-equipment-paperdoll.png');
 await evaluate("(()=>{document.querySelector('[data-window-close=\"character\"]').click();return true})()");
 await waitAndClickTarget('导师');await waitFor("window.__mir2Agent?.snapshot().dialogue?.npc?.endsWith('导师')&&window.__mir2Agent?.snapshot().dialogue?.visible",30000);
 await waitFor("window.__mir2Agent?.snapshot().dialogue?.options?.some(value=>value.command==='@cavecombat')");
 await clickDialogue('@cavecombat');
 const prepared=recordStage('prepared-cave-combat',await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.attributes?.level===30&&s.skills?.skills?.some(value=>value.name==='雷电术')&&s.dialogue?.options?.some(value=>value.command==='@orcgrave')&&s})()",20000));
 requireCheck(prepared.attributes.level===30&&prepared.skills.skills.some(value=>value.name==='雷电术'),'trainer prepares a level-30 dungeon character');
 await clickDialogue('@orcgrave');
 const graveEntry=recordStage('entered-orc-grave',await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.map==='D001'&&s.self&&Math.max(Math.abs(s.self.x-152),Math.abs(s.self.y-362))<=1&&s})()",45000));
 requireCheck(graveEntry.map==='D001','NPC route enters the Orc Grave',{position:[graveEntry.self.x,graveEntry.self.y]});
 requireCheck(graveEntry.minimap?.imageReady&&graveEntry.minimap.frameIndex===0&&/\/0\.[^/]+\.png$/.test(graveEntry.minimap.imageUrl),'Orc Grave minimap switches to its dungeon frame',{minimap:graveEntry.minimap});
 await capture('03-orc-grave.png');

 await evaluate("(()=>{document.querySelector('[data-window-open=\"skills\"]').click();return true})()");
 const skillGeometry=await waitFor("(()=>{const rows=[...document.querySelectorAll('#skills .skill-item')],icons=[...document.querySelectorAll('#skills .skill-icon')];if(!rows.length||icons.length!==rows.length||icons.some(image=>!image.complete||!image.naturalWidth))return false;return {equipmentDisplay:getComputedStyle(document.querySelector('#equipment-items')).display,icons:icons.map(image=>({magicId:Number(image.dataset.magicId),src:image.src,width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height}))}})()",20000);
 requireCheck(skillGeometry.equipmentDisplay==='none','skill page hides every equipment layer',{display:skillGeometry.equipmentDisplay});
 requireCheck(skillGeometry.icons.every(value=>new URL(value.src).pathname.split('/').at(-1).startsWith(String(value.magicId)+'.')&&value.width===32&&value.height===30),'skill rows load the matching MagicId icons at native size',{icons:skillGeometry.icons});
 await capture('03a-skill-icons.png');
 await evaluate("(()=>{document.querySelector('[data-window-close=\"character\"]').click();return true})()");

 await waitAndClickTarget('古墓向导');
 await waitFor("window.__mir2Agent?.snapshot().dialogue?.npc==='古墓向导'",20000);
 await clickDialogue('@mobtest');
 const levelingStart=recordStage('leveling-start',await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.map==='D001'&&s.attributes?.level===1&&s.nearby?.some(value=>value.name==='鸡'&&!value.dead)&&s})()",30000));
 const chicken=levelingStart.nearby.find(value=>value.name==='鸡'&&!value.dead),levelBefore=levelingStart.attributes.level,experienceBefore=levelingStart.attributes.experience;
 let levelingCasts=0;
 while(levelingCasts<12){
  if((await events()).some(value=>value.type==='gateway-in'&&value.data.type==='entityDied'&&value.data.id===chicken.id))break;
  await waitFor("!window.__mir2Agent?.snapshot().pendingAction",5000);
  if(!await selectLightning()){await sleep(150);continue;}
  if(!await clickTarget('鸡',chicken.id))throw new Error('Leveling target left the browser interaction list');
  levelingCasts++;await sleep(680);
 }
 await waitFor(`window.__mir2Agent?.events().some(value=>value.type==='gateway-in'&&value.data.type==='entityDied'&&value.data.id===${chicken.id})`,30000);
 const leveled=recordStage('leveling-complete',await snapshot());
 const experienceEvent=(await events()).find(value=>value.type==='gateway-in'&&value.data.type==='experience'&&Number(value.data.gained)>0);
 requireCheck(Boolean(experienceEvent),'monster kill produces an authoritative experience event',{casts:levelingCasts,gained:experienceEvent?.data.gained,total:experienceEvent?.data.total});
 requireCheck(leveled.attributes.level>levelBefore||leveled.attributes.experience!==experienceBefore,'monster kill changes level or experience',{before:{level:levelBefore,experience:experienceBefore},after:{level:leveled.attributes.level,experience:leveled.attributes.experience}});
 await capture('04-level-up.png');

 const meatBefore=itemCount(leveled,'鸡肉');let harvestAttempts=0;
 while(harvestAttempts<12){
  harvestAttempts++;
  if(!await clickTarget('鸡',chicken.id))break;
  await sleep(900);
  const current=await snapshot();
  if(itemCount(current,'鸡肉')>meatBefore)break;
 }
 const harvested=recordStage('corpse-harvested',await snapshot());
 requireCheck(itemCount(harvested,'鸡肉')>meatBefore,'corpse harvesting adds chicken meat to the inventory',{attempts:harvestAttempts});
 await capture('05-corpse-loot.png');

 await walkNear(153,362);
 await waitAndClickTarget('古墓向导');await waitFor("window.__mir2Agent?.snapshot().dialogue?.npc==='古墓向导'&&window.__mir2Agent?.snapshot().dialogue?.visible",20000);
 await waitFor("window.__mir2Agent?.snapshot().dialogue?.options?.some(value=>value.command==='@return')");
 await clickDialogue('@return');
 await waitFor("window.__mir2Agent?.snapshot().map==='0'",45000);
 await walkNearTrainer();await waitAndClickTarget('导师');await waitFor("window.__mir2Agent?.snapshot().dialogue?.npc?.endsWith('导师')",30000);
 await clickDialogue('@wizardset');await waitFor("window.__mir2Agent?.snapshot().attributes?.level===31",20000);
 await clickDialogue('@main');await waitFor("window.__mir2Agent?.snapshot().dialogue?.options?.some(value=>value.command==='@orcgrave')");
 await clickDialogue('@orcgrave');await waitFor("window.__mir2Agent?.snapshot().map==='D001'",45000);
 await waitAndClickTarget('古墓向导');await waitFor("window.__mir2Agent?.snapshot().dialogue?.npc==='古墓向导'",20000);
 await clickDialogue('@boss');
 const bossStart=recordStage('boss-start',await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.map==='D001'&&s.nearby?.some(value=>value.name==='骷髅精灵'&&!value.dead)&&s})()",30000));
 const boss=bossStart.nearby.find(value=>value.name==='骷髅精灵'&&!value.dead),potionsBefore=itemCount(bossStart,'魔法药(中量)'),goldBefore=bossStart.attributes.gold;
 requireCheck(Boolean(boss),'boss fixture appears on the dungeon map',{id:boss?.id,position:boss?[boss.x,boss.y]:undefined});
 await capture('06-boss-encounter.png');
 let casts=0;
 while(casts<60){
  const currentEvents=await events();if(currentEvents.some(value=>value.type==='gateway-in'&&value.data.type==='entityDied'&&value.data.id===boss.id))break;
  const state=await snapshot(),currentBoss=state.nearby.find(value=>value.id===boss.id&&!value.dead);
  if(currentBoss&&currentBoss.distance>8){await walkNear(currentBoss.x,currentBoss.y,8);continue;}
  await waitFor("!window.__mir2Agent?.snapshot().pendingAction",5000);
  if(!await selectLightning()){await sleep(150);continue;}
  if(!await clickTarget('骷髅精灵',boss.id))throw new Error('Boss left the browser interaction list during combat');
  casts++;await sleep(680);
 }
 await waitFor(`window.__mir2Agent?.events().some(value=>value.type==='gateway-in'&&value.data.type==='entityDied'&&value.data.id===${boss.id})`,10000);
 const bossDead=recordStage('boss-defeated',await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.groundItems?.length>=2&&s})()",15000));
 requireCheck(casts>0&&casts<=60,'boss dies from browser-driven lightning casts',{casts});
 requireCheck(bossDead.groundItems.length>=2,'boss death creates visible ground drops',{drops:bossDead.groundItems});
 await capture('07-boss-drops.png');

 const dropped=[...bossDead.groundItems];
 for(const item of dropped){
  const clicked=await evaluate(`(()=>{const button=document.querySelector('[data-ground-item-id="${item.id}"]');if(!button)return false;button.click();return true})()`);
  if(!clicked)throw new Error(`Ground item ${item.id} was absent from the UI list`);
  await waitFor(`!window.__mir2Agent?.snapshot().groundItems.some(value=>value.id===${item.id})`,30000);
 }
 const picked=recordStage('boss-drops-picked-up',await snapshot());
 requireCheck(picked.groundItems.length===0,'browser picks up every boss drop');
 requireCheck(itemCount(picked,'魔法药(中量)')>potionsBefore,'boss potion drop reaches the inventory',{before:potionsBefore,after:itemCount(picked,'魔法药(中量)')});
 requireCheck(picked.attributes.gold>goldBefore,'boss gold drop increases character gold',{before:goldBefore,after:picked.attributes.gold});
 requireCheck(!report.console.some(value=>value.level==='exception'||value.level==='error'),'browser produced no runtime errors',{entries:report.console});
 await capture('08-loot-picked-up.png');report.passed=true;
 console.log(`PASS agent gameplay playtest ${report.checks.filter(value=>value.passed===true).length} checks, ${casts} boss casts, ${dropped.length} drops`);
}catch(error){
 report.error=error instanceof Error?error.message:String(error);process.exitCode=1;console.error(`FAIL agent gameplay playtest: ${report.error}`);
 if(session)try{await capture('99-failure.png');report.failureSnapshot=await snapshot();report.timeline=await events();}catch{}
}finally{
 report.finishedAt=new Date().toISOString();await mkdir(outputDir,{recursive:true});await writeFile(path.join(outputDir,'report.json'),`${JSON.stringify(report,null,2)}\n`);await mkdir(path.dirname(latestPath),{recursive:true});await writeFile(latestPath,`${JSON.stringify({...report,reportPath:path.relative(root,path.join(outputDir,'report.json'))},null,2)}\n`);
 session?.close();if(chrome){chrome.child.kill('SIGTERM');await Promise.race([new Promise(resolve=>chrome.child.exitCode===null?chrome.child.once('exit',resolve):resolve()),sleep(2000)]);await rm(path.join('/tmp',`mir2-agent-gameplay-${process.pid}`),{recursive:true,force:true}).catch(()=>{});}
}
