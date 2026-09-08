#!/usr/bin/env node
// Check the generated resource catalog through the real management UI.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const pageUrl=process.env.MIR2_RESOURCE_URL??'http://127.0.0.1:5173/resources.html';
const runId=new Date().toISOString().replaceAll(':','-').replace(/\.\d{3}Z$/,'Z');
const outputDir=path.join(root,'.runtime/reports/resource-manager-smoke',runId);
const latestPath=path.join(root,'.runtime/reports/resource-manager-smoke/latest.json');
const profile=path.join('/tmp',`mir2-resource-manager-${process.pid}`);
const report={version:1,runId,pageUrl,passed:false,checks:[],console:[],artifacts:{}};
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
async function searchAndSelect(name){
 const literal=JSON.stringify(name);
 await evaluate(`(()=>{const input=document.querySelector('#resource-search');input.value=${literal};input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
 await waitFor(`(()=>{const row=document.querySelector('#resource-list [data-key]');return row?.textContent.includes(${literal})&&row})()`);
 await evaluate("document.querySelector('#resource-list [data-key]').click()");
 return waitFor(`document.querySelector('#resource-detail')?.textContent.includes(${literal})`);
}

try{
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
 check(summary[0]==='1,000'&&summary[1]==='108'&&summary[2]==='705'&&summary[3]==='570','summary exposes generated catalog counts',{summary});
 check((await evaluate("document.querySelector('#resource-detail').textContent.includes('9 个物品仍缺背包图标')")),'overview exposes unresolved asset coverage');

 await chooseSection('items');await searchAndSelect('青铜剑');
 await waitFor("(()=>{const image=document.querySelector('#resource-detail img');return image?.complete&&image.naturalWidth>0})()");
 const item=await evaluate("(()=>{const node=document.querySelector('#resource-detail');const image=node.querySelector('img');return {text:node.textContent,imageReady:image?.complete&&image.naturalWidth>0}})()");
 check(item.imageReady&&item.text.includes('武器')&&item.text.includes('掉落来源')&&item.text.includes('骷髅精灵'),'item detail links mechanics, icon and drop sources');
 await capture('01-item-drop-sources.png');
 await searchAndSelect('祖玛井中月');
 const groundFallback=await waitFor("(()=>{const image=document.querySelector('#resource-detail img');return image?.complete&&image.naturalWidth>0&&image.src.includes('/items/DnItems/')&&image.src})()");
 check(Boolean(groundFallback),'item detail uses the ground-art fallback when the inventory frame is empty',{src:groundFallback});

 await chooseSection('skills');await searchAndSelect('雷电术');
 await waitFor("(()=>{const image=document.querySelector('#resource-detail img');return image?.complete&&image.naturalWidth>0})()");
 const skill=await evaluate("(()=>{const node=document.querySelector('#resource-detail');const image=node.querySelector('img');return {text:node.textContent,imageReady:image?.complete&&image.naturalWidth>0}})()");
 check(skill.imageReady&&skill.text.includes('目标攻击')&&skill.text.includes('17 / 20 / 23')&&skill.text.includes('耗蓝公式'),'skill detail links icon, progression and execution rules',{detail:skill});
 await searchAndSelect('四级雷电术');
 const extendedSkillIcon=await waitFor("(()=>{const image=document.querySelector('#resource-detail img');return image?.complete&&image.naturalWidth>0&&image.src.includes('/ui/MagIcon/')&&image.src})()");
 check(Boolean(extendedSkillIcon),'extended skill detail falls back to MagIcon.Lib',{src:extendedSkillIcon});

 await chooseSection('monsters');await searchAndSelect('骷髅精灵');
 await waitFor("(()=>{const image=document.querySelector('#monster-preview img');return image?.complete&&image.naturalWidth>0})()");
 const monster=await evaluate("document.querySelector('#resource-detail').textContent");
 check(monster.includes('刷新分布 · 4')&&monster.includes('掉落规则 · 43')&&monster.includes('青铜剑'),'monster detail exposes animation, spawn maps and line-level drops');
 await capture('02-monster-drops-and-spawns.png');

 await chooseSection('maps');await searchAndSelect('兽人古墓一层');
 await waitFor("(()=>{const image=document.querySelector('.map-preview');return image?.complete&&image.naturalWidth>0})()");
 const map=await evaluate("document.querySelector('#resource-detail').textContent");
 check(map.includes('D001')&&map.includes('400')&&map.includes('怪物刷新分布 · 10'),'map detail exposes minimap, geometry and monster distribution');
 await capture('03-map-distribution.png');

 await evaluate("document.querySelector('#open-template').click()");
 await waitFor("document.querySelector('#resource-template').open");
 await evaluate("(()=>{const kind=document.querySelector('#template-kind');kind.value='skill';kind.dispatchEvent(new Event('input',{bubbles:true}));const name=document.querySelector('#template-name');name.value='测试技能';name.dispatchEvent(new Event('input',{bubbles:true}));const index=document.querySelector('#template-index');index.value='200';index.dispatchEvent(new Event('input',{bubbles:true}));return true})()");
 const template=await evaluate("document.querySelector('#template-output').value");
 check(template.includes('MagicId')&&template.includes('测试技能')&&template.includes('skill-rules.json')&&template.includes('200'),'new-skill template includes SQL, rule and validation checklist');
 await evaluate("document.querySelector('#resource-template [value=cancel]').click()");
 check(!(await evaluate("document.querySelector('#resource-template').open")),'template dialog closes cleanly');

 await chooseSection('items');
 await evaluate("(()=>{const box=document.querySelector('#missing-only');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));return true})()");
 const missingCount=await waitFor("(()=>{const text=document.querySelector('#resource-list-meta').textContent;return text.startsWith('9 条')&&text})()");
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
