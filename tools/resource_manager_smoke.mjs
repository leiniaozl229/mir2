#!/usr/bin/env node
// Check the generated resource catalog through the real management UI.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';

const root=fileURLToPath(new URL('..',import.meta.url));
const catalogBytes=await readFile(path.join(root,'content/classic-176/resource-catalog.json'));
const generatedCatalog=JSON.parse(catalogBytes.toString('utf8'));
const iconUsage=JSON.parse(await readFile(path.join(root,'content/classic-176/icon-usage.json'),'utf8'));
const summaryKeys=['items','skills','monsters','maps','spawns','dropTables','dropRows','assetLibraries'];
const missingItems=generatedCatalog.items.filter(value=>!value.iconUrl).length;
const missingSkills=generatedCatalog.skills.filter(value=>!value.iconUrl).length;
const missingPressedSkills=generatedCatalog.skills.filter(value=>!value.pressedIconUrl).length;
const pageUrl=process.env.MIR2_RESOURCE_URL??'http://127.0.0.1:5173/resources.html';
const runId=new Date().toISOString().replaceAll(':','-').replace(/\.\d{3}Z$/,'Z');
const outputDir=path.join(root,'.runtime/reports/resource-manager-smoke',runId);
const latestPath=path.join(root,'.runtime/reports/resource-manager-smoke/latest.json');
const profile=path.join('/tmp',`mir2-resource-manager-${process.pid}`);
// --check only validates syntax. Browser evidence requires an explicit successful run.
const report={version:1,runId,pageUrl,passed:false,checks:[],console:[],artifacts:{},expectations:{catalogSha256:createHash('sha256').update(catalogBytes).digest('hex'),summary:generatedCatalog.summary,missingItems,missingSkills,missingPressedSkills}};
let chrome,session;

function chromePath(){
 if(process.env.CHROME_PATH&&existsSync(process.env.CHROME_PATH))return process.env.CHROME_PATH;
 return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(existsSync);
}
function check(condition,name,detail={}){
 const passed=Boolean(condition);report.checks.push({name,passed,...detail});
 if(!passed)throw new Error(name);
}
class CdpSession{
 constructor(socket){
  this.socket=socket;this.nextId=1;this.pending=new Map();this.listeners=new Map();
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);clearTimeout(pending.timer);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);return;}for(const listener of this.listeners.get(message.method)??[])listener(message.params);});
 }
 on(method,listener){const list=this.listeners.get(method)??[];list.push(listener);this.listeners.set(method,list);}
 send(method,params={}){const id=this.nextId++;this.socket.send(JSON.stringify({id,method,params}));return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out`));},20000);this.pending.set(id,{resolve,reject,timer});});}
 close(){this.socket.close();}
}
async function launchChrome(binary,port){
 const args=[`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--headless=new','--disable-background-networking','--disable-extensions','--no-first-run','about:blank'];
 const child=spawn(binary,args,{stdio:'ignore'});let targets;
 for(let attempt=0;attempt<60;attempt++){
  try{targets=await fetch(`http://127.0.0.1:${port}/json/list`).then(response=>response.json());if(targets.some(target=>target.type==='page'&&target.webSocketDebuggerUrl))break;}catch{}
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
async function waitFor(expression,timeout=20000){
 const deadline=Date.now()+timeout;
 while(Date.now()<deadline){const value=await evaluate(expression);if(value)return value;await sleep(100);}
 throw new Error(`Timed out waiting for ${expression}`);
}
async function capture(name){
 const result=await session.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}),file=path.join(outputDir,name);
 await writeFile(file,Buffer.from(result.data,'base64'));report.artifacts[name]=path.relative(root,file);return file;
}
async function chooseSection(section){
 await evaluate(`document.querySelector('[data-section=${JSON.stringify(section)}]').click()`);
 await waitFor(`document.querySelector('[data-section=${JSON.stringify(section)}]').classList.contains('active')`);
}
async function searchAndSelect(name,key){
 const literal=JSON.stringify(name),selector=JSON.stringify(key?`#resource-list [data-key=${JSON.stringify(key)}]`:'#resource-list [data-key]');
 await evaluate(`(()=>{const input=document.querySelector('#resource-search');input.value=${literal};input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
 await waitFor(`(()=>{const row=document.querySelector(${selector});return row?.textContent.includes(${literal})&&row})()`);
 await evaluate(`document.querySelector(${selector}).click()`);
 return waitFor(`document.querySelector('#resource-detail')?.textContent.includes(${literal})`);
}
function recordOf(section,name){const value=generatedCatalog[section].find(value=>value.name===name);if(!value)throw new Error(`Generated catalog is missing ${section}/${name}`);return value;}
async function checkIconDetail(value,section){
 if(value.iconUrl)await waitFor(`(()=>{const image=document.querySelector('#resource-detail .detail-heading img');return image?.complete&&image.naturalWidth>4&&image.naturalHeight>1&&new URL(image.src).pathname===${JSON.stringify(value.iconUrl)}})()`);
 const detail=await evaluate("(()=>{const node=document.querySelector('#resource-detail'),diagnostics=node.querySelector('.resource-icon-diagnostics');return {images:[...node.querySelectorAll('img')].map(image=>new URL(image.src).pathname),properties:Object.fromEntries([...diagnostics.querySelectorAll('.property')].map(row=>[row.querySelector('span').textContent,row.querySelector('strong').textContent])),candidateText:diagnostics.querySelector('.relation-list')?.textContent??'',candidateImages:diagnostics.querySelectorAll('img').length}})()");
 check(value.iconUrl?detail.images.length===1&&detail.images[0]===value.iconUrl:detail.images.length===0,`${section} detail shows only its exact selected frame or a missing icon`,{id:value.id??value.idx,iconIndex:value.iconIndex,expected:value.iconUrl,actual:detail.images});
 check(detail.properties['精确索引']===String(value.iconIndex)&&detail.properties['选帧规则']===value.iconMapping.kind&&detail.properties['服务端源索引']===String(value.iconMapping.sourceIndex),`${section} detail exposes the original field and exact frame rule`,{id:value.id??value.idx,properties:detail.properties});
 const candidates=value.iconResolution.candidates??[];
 check(candidates.every(candidate=>candidate.selected===false)&&detail.candidateImages===0&&candidates.every(candidate=>detail.candidateText.includes(candidate.sourceId))&&(!candidates.length||detail.candidateText.includes('未选作生效素材')),`${section} reference candidates stay explicitly unselected without preview images`,{id:value.id??value.idx,candidates:candidates.map(candidate=>candidate.sourceId)});
 if(section==='skills'){
  check(value.iconIndex===value.effect*iconUsage.skills.normalMultiplier&&value.pressedIconIndex===value.iconIndex+iconUsage.skills.pressedOffset&&detail.properties['按下帧索引']===String(value.pressedIconIndex)&&(value.pressedIconUrl?detail.properties['按下帧缺项']==='—':Boolean(detail.properties['按下帧缺项']&&detail.properties['按下帧缺项']!=='—')),'skill detail distinguishes effect-family normal and pressed frame availability',{idx:value.idx,effect:value.effect,normal:value.iconIndex,pressed:value.pressedIconIndex,pressedUrl:value.pressedIconUrl});
  if(value.identityStatus==='conflict')check(detail.properties['技能身份']==='编号与其他效果冲突，需独立核对','skill ID conflict remains visible independently of icon availability',{idx:value.idx,magicId:value.magicId});
 }
 return detail;
}

try{
 check(generatedCatalog.summary.items===generatedCatalog.items.length&&generatedCatalog.summary.skills===generatedCatalog.skills.length&&generatedCatalog.summary.maps===generatedCatalog.maps.length&&generatedCatalog.summary.itemIcons===generatedCatalog.items.length-missingItems&&generatedCatalog.summary.skillIcons===generatedCatalog.skills.length-missingSkills&&generatedCatalog.diagnostics.itemsMissingIcons===missingItems&&generatedCatalog.diagnostics.skillsMissingIcons===missingSkills&&generatedCatalog.diagnostics.skillsMissingPressedIcons===missingPressedSkills,'generated summary, exact coverage and both-state missing totals agree');
 await mkdir(outputDir,{recursive:true});
 const ready=await fetch(pageUrl).then(response=>response.ok).catch(()=>false);if(!ready)throw new Error(`Resource manager unavailable: ${pageUrl}`);
 const binary=chromePath();if(!binary)throw new Error('Chrome, Chromium or Edge is required');
 chrome=await launchChrome(binary,Number(process.env.MIR2_RESOURCE_CHROME_PORT??19319));session=chrome.cdp;
 session.on('Runtime.exceptionThrown',params=>report.console.push({level:'exception',text:params.exceptionDetails?.exception?.description??params.exceptionDetails?.text}));
 session.on('Runtime.consoleAPICalled',params=>{if(params.type==='error'||params.type==='warning')report.console.push({level:params.type,text:params.args?.map(value=>value.value??value.description).join(' ')});});
 session.on('Log.entryAdded',params=>{if(params.entry.level==='error'||params.entry.level==='warning')report.console.push({level:params.entry.level,text:params.entry.text,url:params.entry.url});});
 await Promise.all([session.send('Page.enable'),session.send('Runtime.enable'),session.send('Log.enable')]);
 await session.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await session.send('Page.navigate',{url:pageUrl});
 const summary=await waitFor("(()=>{const cards=[...document.querySelectorAll('.summary-card strong')];return cards.length===8&&cards.every(node=>node.textContent)&&cards.map(node=>node.textContent)})()",30000);
 check(summaryKeys.every((key,index)=>Number(summary[index].replace(/[^\d]/g,''))===generatedCatalog.summary[key]),'summary exposes current generated catalog counts',{summary,expected:generatedCatalog.summary});
 const overview=await evaluate("document.querySelector('#resource-detail').textContent");
 check(overview.includes(`${missingItems} 个物品仍缺背包图标`)&&overview.includes(`已核国服生效源覆盖 ${generatedCatalog.summary.itemIcons}/${generatedCatalog.summary.items}`)&&overview.includes(`${missingSkills} 个技能仍缺图标`)&&overview.includes(`${generatedCatalog.summary.maps} 张基线目录`),'overview exposes current exact-source coverage and unresolved counts');
 check(overview.includes(`MagicId 机制冲突：${generatedCatalog.diagnostics.duplicateMagicIds.join('、')||'无'}`),'overview exposes current independent magic identity conflicts');

 await chooseSection('items');await searchAndSelect('青铜剑');
 await waitFor("(()=>{const image=document.querySelector('#resource-detail img');return image?.complete&&image.naturalWidth>0})()");
 const item=await evaluate("(()=>{const node=document.querySelector('#resource-detail');const image=node.querySelector('img');return {text:node.textContent,imageReady:image?.complete&&image.naturalWidth>0}})()");
 check(item.imageReady&&item.text.includes('武器')&&item.text.includes('掉落来源')&&item.text.includes('骷髅精灵'),'item detail links mechanics, icon and drop sources');
 await checkIconDetail(recordOf('items','青铜剑'),'items');
 await capture('01-item-drop-sources.png');
 await searchAndSelect('雷霆战甲(男)');
 await checkIconDetail(recordOf('items','雷霆战甲(男)'),'items');

 await chooseSection('skills');await searchAndSelect('雷电术');
 await waitFor("(()=>{const image=document.querySelector('#resource-detail img');return image?.complete&&image.naturalWidth>0})()");
 const skill=await evaluate("(()=>{const node=document.querySelector('#resource-detail');const image=node.querySelector('img');return {text:node.textContent,imageReady:image?.complete&&image.naturalWidth>0}})()");
 check(skill.imageReady&&skill.text.includes('目标攻击')&&skill.text.includes(recordOf('skills','雷电术').needLevels.join(' / '))&&skill.text.includes('耗蓝公式'),'skill detail links icon, progression and execution rules',{detail:skill});
 await checkIconDetail(recordOf('skills','雷电术'),'skills');
 await searchAndSelect('四级雷电术');
 await checkIconDetail(recordOf('skills','四级雷电术'),'skills');
 for(const conflict of generatedCatalog.skills.filter(value=>value.identityStatus==='conflict')){
  await searchAndSelect(conflict.name,`skill-${conflict.idx}`);await checkIconDetail(conflict,'skills');
 }

 await chooseSection('monsters');await searchAndSelect('骷髅精灵');
 await waitFor("(()=>{const image=document.querySelector('#monster-preview img');return image?.complete&&image.naturalWidth>0})()");
 const monster=await evaluate("document.querySelector('#resource-detail').textContent");
 const monsterRecord=recordOf('monsters','骷髅精灵');
 check(monster.includes(`刷新分布 · ${monsterRecord.spawnIds.length}`)&&monster.includes(`掉落规则 · ${monsterRecord.drops.length}`)&&monster.includes('青铜剑'),'monster detail exposes animation, spawn maps and line-level drops');
 await capture('02-monster-drops-and-spawns.png');

 await chooseSection('maps');await searchAndSelect('兽人古墓一层');
 await waitFor("(()=>{const image=document.querySelector('.map-preview');return image?.complete&&image.naturalWidth>0})()");
 const map=await evaluate("document.querySelector('#resource-detail').textContent");
 const mapRecord=recordOf('maps','兽人古墓一层');
 check(map.includes(mapRecord.id)&&map.includes(String(mapRecord.width))&&map.includes(`怪物刷新分布 · ${mapRecord.spawnIds.length}`),'map detail exposes minimap, geometry and monster distribution');
 await capture('03-map-distribution.png');
 const candidateAsset=generatedCatalog.assets.find(value=>value.sourceRole==='reference_candidate');
 if(candidateAsset){
  await chooseSection('assets');await searchAndSelect(candidateAsset.id,`asset-${candidateAsset.id}`);
  const candidate=await evaluate(`(()=>{const node=document.querySelector('#resource-detail'),row=document.querySelector(${JSON.stringify(`#resource-list [data-key=${JSON.stringify(`asset-${candidateAsset.id}`)}]`)});return {text:node.textContent,images:node.querySelectorAll('img').length,status:row.querySelector('.row-status').textContent}})()`);
  const selected=(candidateAsset.mapSourceSelections??[]).filter(value=>value.selected&&value.manifestLocksMatch);
  const expectedStatus=selected.length?`${selected.map(value=>value.mapId).join(' / ')}参考源已选择${selected.every(value=>value.historicalPairingVerified)?'':'，原版配对待核'}`:'参考候选，未绑定';
  check(candidate.images===0&&candidate.status===expectedStatus&&candidate.text.includes(`${candidateAsset.frames} 个导出帧记录`)&&selected.every(value=>candidate.text.includes(`${value.indexCount} 个原索引`)),'reference library exposes the current scoped selection and separate pairing status without a preview image',{id:candidateAsset.id,detail:candidate});
 }

 await evaluate("document.querySelector('#open-template').click()");
 await waitFor("document.querySelector('#resource-template').open");
 await evaluate("(()=>{const kind=document.querySelector('#template-kind');kind.value='skill';kind.dispatchEvent(new Event('input',{bubbles:true}));const name=document.querySelector('#template-name');name.value='测试技能';name.dispatchEvent(new Event('input',{bubbles:true}));const index=document.querySelector('#template-index');index.value='200';index.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
 const template=await evaluate("document.querySelector('#template-output').value");
 check(template.includes('MagicId')&&template.includes('测试技能')&&template.includes('skill-rules.json')&&template.includes('200'),'new-skill template includes SQL, rule and validation checklist');
 await evaluate("document.querySelector('#resource-template [value=cancel]').click()");
 check(!(await evaluate("document.querySelector('#resource-template').open")),'template dialog closes cleanly');

 await chooseSection('items');
 await evaluate("(()=>{const box=document.querySelector('#missing-only');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 const missingCount=await waitFor(`(()=>{const text=document.querySelector('#resource-list-meta').textContent;return Number(text.split(' 条')[0].replace(/[^\\d]/g,''))===${missingItems}&&text})()`);
 check(Boolean(missingCount),'missing-resource filter produces the repair queue',{meta:missingCount});
 check(!report.console.some(value=>value.level==='exception'||value.level==='error'),'resource manager produced no browser errors',{entries:report.console});
 await capture('04-missing-resource-queue.png');report.passed=true;
 console.log(`PASS resource manager smoke ${report.checks.length} checks`);
}catch(error){
 report.error=error instanceof Error?error.message:String(error);process.exitCode=1;console.error(`FAIL resource manager smoke: ${report.error}`);
 if(session)try{await capture('failure.png');}catch{}
}finally{
 report.finishedAt=new Date().toISOString();await mkdir(outputDir,{recursive:true});await writeFile(path.join(outputDir,'report.json'),`${JSON.stringify(report,null,2)}\n`);await mkdir(path.dirname(latestPath),{recursive:true});await writeFile(latestPath,`${JSON.stringify({...report,reportPath:path.relative(root,path.join(outputDir,'report.json'))},null,2)}\n`);
 session?.close();if(chrome){chrome.child.kill('SIGTERM');await Promise.race([new Promise(resolve=>chrome.child.exitCode===null?chrome.child.once('exit',resolve):resolve()),sleep(2000)]);}await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
