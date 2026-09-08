#!/usr/bin/env node
// Drive the real browser UI through Chrome DevTools and collect movement evidence.
// Credentials are read locally and are never copied into the report or console.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const pageUrl=process.env.MIR2_AGENT_PLAY_URL??'http://127.0.0.1:5173/play.html?agent=1';
const credentialsPath=process.env.MIR2_AGENT_CREDENTIALS??path.join(root,'.runtime/probe-account.json');
const runId=new Date().toISOString().replaceAll(':','-').replace(/\.\d{3}Z$/,'Z');
const outputDir=path.join(root,'.runtime/reports/agent-playtest',runId);
const latestPath=path.join(root,'.runtime/reports/agent-playtest/latest.json');
const report={version:1,runId,pageUrl,scenario:'movement-smoke',passed:false,checks:[],scenarios:[],console:[],webSocket:[],artifacts:{}};
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
  return {direction,type:message.type,actionId:message.actionId,kind:message.kind,accepted:message.accepted,x:message.x,y:message.y,directionIndex:message.direction,run:message.run,sequence:parsed.sequence,mapGeneration:parsed.mapGeneration};
 }catch{return {direction,type:'non-json',bytes:payload.length};}
}
function recordWebSocket(payload,direction){const frame=safeFrame(payload,direction);if(frame.type!=='legacy')report.webSocket.push(frame);if(report.webSocket.length>1000)report.webSocket.splice(0,report.webSocket.length-1000);}

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
 if(process.env.MIR2_AGENT_HEADLESS==='1')args.push('--headless=new');
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
 while(Date.now()<deadline){const value=await evaluate(expression);if(value)return value;await sleep(80);}
 throw new Error(`Timed out waiting for ${expression}`);
}
async function snapshot(){return evaluate('window.__mir2Agent?.snapshot()');}
async function events(){return evaluate('window.__mir2Agent?.events() ?? []');}
async function clearEvents(){await evaluate('window.__mir2Agent?.clear()');}
async function capture(name){
 const result=await session.send('Page.captureScreenshot',{format:'png'}),file=path.join(outputDir,name);
 await writeFile(file,Buffer.from(result.data,'base64'));report.artifacts[name]=path.relative(root,file);return file;
}
const keySpecs={0:{key:'ArrowUp',code:'ArrowUp',keyCode:38},2:{key:'ArrowRight',code:'ArrowRight',keyCode:39},4:{key:'ArrowDown',code:'ArrowDown',keyCode:40},6:{key:'ArrowLeft',code:'ArrowLeft',keyCode:37}};
async function keyEvent(type,direction,shift=false){
 const spec=keySpecs[direction];if(!spec)throw new Error(`Direction ${direction} has no keyboard mapping`);
 await session.send('Input.dispatchKeyEvent',{type,key:spec.key,code:spec.code,windowsVirtualKeyCode:spec.keyCode,nativeVirtualKeyCode:spec.keyCode,modifiers:shift?8:0});
}
async function press(direction,shift=false){
 if(shift)await session.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,nativeVirtualKeyCode:16,modifiers:8});
 await keyEvent('keyDown',direction,shift);await sleep(35);await keyEvent('keyUp',direction,shift);
 if(shift)await session.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Shift',code:'ShiftLeft',windowsVirtualKeyCode:16,nativeVirtualKeyCode:16});
}
async function waitIdle(timeout=10000){return waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.inWorld&&s.worldReady&&!s.pendingAction&&s.self?.action==='standing'&&s})()",timeout);}
function choose(snapshotValue,steps,allowed=[0,2,4,6]){return snapshotValue.directions.find(value=>allowed.includes(value.direction)&&value.clearSteps>=steps);}

try{
 await mkdir(outputDir,{recursive:true});
 const ready=await fetch(pageUrl).then(response=>response.ok).catch(()=>false);if(!ready)throw new Error(`Vite page unavailable: ${pageUrl}`);
 const binary=chromePath();if(!binary)throw new Error('Chrome, Chromium or Edge is required');
 const credentials=JSON.parse(await readFile(credentialsPath,'utf8'));if(!credentials.account||!credentials.password)throw new Error('Agent playtest credentials are incomplete');
 const port=Number(process.env.MIR2_AGENT_CHROME_PORT??19317),profile=path.join('/tmp',`mir2-agent-playtest-${process.pid}`);
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
 await capture('01-login.png');
 const accountLiteral=JSON.stringify(credentials.account),passwordLiteral=JSON.stringify(credentials.password);
 await evaluate(`(()=>{const account=document.querySelector('#account'),password=document.querySelector('#password');account.value=${accountLiteral};password.value=${passwordLiteral};document.querySelector('#auth-login-ok').click();return true})()`);
 await waitFor("document.querySelector('#auth-overlay')?.dataset.authScene==='select'",30000);
 await evaluate("(()=>{document.querySelector('[data-auth-start]').click();return true})()");
 const entered=await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.inWorld&&s.worldReady&&s.self&&s.render&&s})()",30000);
 report.character=entered.self.name;report.map=entered.map;report.start={x:entered.self.x,y:entered.self.y};
 await evaluate("(()=>{const canvas=document.querySelector('#viewport canvas');canvas.tabIndex=-1;canvas.focus();return document.activeElement===canvas})()");
 await clearEvents();await capture('02-entered-world.png');
 const poseReady=await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.render?.framesReady&&s})()",10000);report.initialPoseReadyMs=poseReady.now-entered.now;requireCheck(poseReady.render.framesReady===true,'initial player pose becomes renderable',{readyMs:report.initialPoseReadyMs});await capture('02b-pose-ready.png');

 const singleDirection=choose(await snapshot(),1);if(!singleDirection)throw new Error('No clear cardinal cell for single-step trial');
 const before=await snapshot();await press(singleDirection.direction);const active=await waitFor("(()=>{const s=window.__mir2Agent?.snapshot();return s?.pendingAction?.kind==='move'&&s})()");await sleep(260);const midpoint=await snapshot();await capture('03-movement-midpoint.png');const after=await waitIdle();
 const expectedX=before.self.x+singleDirection.dx,expectedY=before.self.y+singleDirection.dy;
 const renderAdvance=Math.hypot(midpoint.render.grid.x-before.self.x,midpoint.render.grid.y-before.self.y);
 requireCheck(midpoint.pending?.acknowledged===true,'early ACK remains attached while the visual action is active',{actionId:active.pendingAction.actionId});
 requireCheck(renderAdvance>.15&&renderAdvance<.85,'midpoint render position is inside one grid step',{renderAdvance});
 requireCheck(Math.abs(midpoint.render.screen.x-400)<2&&Math.abs(midpoint.render.screen.y-300)<2,'camera and actor retain a shared screen anchor',{screen:midpoint.render.screen});
 requireCheck(after.self.x===expectedX&&after.self.y===expectedY,'single keyboard step reaches the expected cell',{expected:{x:expectedX,y:expectedY},actual:{x:after.self.x,y:after.self.y}});
 const lifecycle=await events(),movementStart=lifecycle.find(value=>value.type==='movement-start'),ack=lifecycle.find(value=>value.type==='action-ack'),finish=lifecycle.find(value=>value.type==='action-finish');
 requireCheck(movementStart&&ack&&finish&&movementStart.data.actionId===ack.data.actionId&&ack.data.actionId===finish.data.actionId,'action start, ACK and finish share one actionId');
 requireCheck(finish.data.elapsedMs>=590,'movement cannot finish before its 600ms visual interval',{elapsedMs:finish.data.elapsedMs});
 report.scenarios.push({name:'single-step',before,midpoint,after,events:lifecycle});
 await press((singleDirection.direction+4)%8);await waitIdle();

 const holdStart=await snapshot(),holdDirection=choose(holdStart,3);if(!holdDirection)throw new Error('No clear three-cell cardinal line for held-key trial');
 await clearEvents();await keyEvent('keyDown',holdDirection.direction);await sleep(1350);await keyEvent('keyUp',holdDirection.direction);const holdAfter=await waitIdle();const holdEvents=(await events()).filter(value=>value.type==='movement-start');
 requireCheck(holdEvents.length===3,'held key schedules exactly three completed steps in 1.35s',{steps:holdEvents.length});
 const intervals=holdEvents.slice(1).map((value,index)=>value.at-holdEvents[index].at);
 requireCheck(intervals.every(value=>value>=590&&value<750),'held-key action starts follow the 600ms controller cadence',{intervals});
 requireCheck(holdAfter.self.x===holdStart.self.x+holdDirection.dx*3&&holdAfter.self.y===holdStart.self.y+holdDirection.dy*3,'held key advances one cell per action');
 report.scenarios.push({name:'held-key',before:holdStart,after:holdAfter,events:await events()});
 for(let step=0;step<3;step++){await press((holdDirection.direction+4)%8);await waitIdle();}

 const clickStart=await snapshot(),clickDirection=choose(clickStart,3);if(!clickDirection)throw new Error('No clear three-cell cardinal line for click-path trial');
 await clearEvents();const geometry=await evaluate("(()=>{const r=document.querySelector('#viewport canvas').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})()");
 const stageX=400+clickDirection.dx*48*3+10,stageY=300+clickDirection.dy*32*3+8,x=geometry.left+stageX/800*geometry.width,y=geometry.top+stageY/600*geometry.height;
 await session.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
 await waitFor("window.__mir2Agent?.snapshot().pendingAction?.kind==='move'");const clickExpected={x:clickStart.self.x+clickDirection.dx*3,y:clickStart.self.y+clickDirection.dy*3};const clickAfter=await waitFor(`(()=>{const s=window.__mir2Agent?.snapshot();return !s.pendingAction&&s.self?.action==='standing'&&s.self.x===${clickExpected.x}&&s.self.y===${clickExpected.y}&&s})()`,6000);const clickMoves=(await events()).filter(value=>value.type==='movement-start');
 requireCheck(clickMoves.length===3&&clickMoves.every(value=>value.data.direction===clickDirection.direction),'three-cell click path remains straight',{directions:clickMoves.map(value=>value.data.direction)});
 requireCheck(clickAfter.self.x===clickExpected.x&&clickAfter.self.y===clickExpected.y,'click path reaches its requested cell');
 report.scenarios.push({name:'click-path',before:clickStart,after:clickAfter,events:await events()});
 for(let step=0;step<3;step++){await press((clickDirection.direction+4)%8);await waitIdle();}

 const pointerStart=await snapshot(),pointerDirection=choose(pointerStart,4,[2,6]);
 if(pointerDirection){
  await clearEvents();const pointerStageX=400+pointerDirection.dx*230,pointerStageY=301,px=geometry.left+pointerStageX/800*geometry.width,py=geometry.top+pointerStageY/600*geometry.height;
  await session.send('Input.dispatchMouseEvent',{type:'mousePressed',x:px,y:py,button:'right',clickCount:1});await sleep(720);await session.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:px,y:py,button:'right',clickCount:1});await waitIdle();const pointerMoves=(await events()).filter(value=>value.type==='movement-start');
  requireCheck(pointerMoves.length===2&&pointerMoves.every(value=>value.data.run===true&&value.data.direction===pointerDirection.direction),'nearly horizontal right-button input stays cardinal',{directions:pointerMoves.map(value=>value.data.direction)});
  report.scenarios.push({name:'right-button-run',before:pointerStart,after:await snapshot(),events:await events()});
  for(let step=0;step<2;step++){await press((pointerDirection.direction+4)%8,true);await waitIdle();}
 }else report.checks.push({name:'nearly horizontal right-button input stays cardinal',passed:null,skipped:'No clear four-cell east/west line'});

 const finalState=await waitIdle();report.end={x:finalState.self.x,y:finalState.self.y};
 requireCheck(report.end.x===report.start.x&&report.end.y===report.start.y,'playtest returns the character to its starting cell',{start:report.start,end:report.end});
 requireCheck(!report.console.some(value=>value.level==='exception'||value.level==='error'),'browser produced no runtime errors',{entries:report.console});
 await capture('04-finished.png');report.timeline=await events();report.passed=true;
 console.log(`PASS agent browser playtest ${report.checks.filter(value=>value.passed===true).length} checks, map ${report.map}`);
}catch(error){
 report.error=error instanceof Error?error.message:String(error);process.exitCode=1;console.error(`FAIL agent browser playtest: ${report.error}`);
 if(session)try{await capture('99-failure.png');report.failureSnapshot=await snapshot();report.timeline=await events();}catch{}
}finally{
 report.finishedAt=new Date().toISOString();await mkdir(outputDir,{recursive:true});await writeFile(path.join(outputDir,'report.json'),`${JSON.stringify(report,null,2)}\n`);await mkdir(path.dirname(latestPath),{recursive:true});await writeFile(latestPath,`${JSON.stringify({...report,reportPath:path.relative(root,path.join(outputDir,'report.json'))},null,2)}\n`);
 session?.close();if(chrome){chrome.child.kill('SIGTERM');await Promise.race([new Promise(resolve=>chrome.child.exitCode===null?chrome.child.once('exit',resolve):resolve()),sleep(2000)]);await rm(path.join('/tmp',`mir2-agent-playtest-${process.pid}`),{recursive:true,force:true}).catch(()=>{});}
}
