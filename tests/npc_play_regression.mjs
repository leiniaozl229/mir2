import {installPlayUiContext} from './helpers/play_ui_context.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=ts.createSourceFile('play.ts',fs.readFileSync(path.join(root,'apps/web/src/play.ts'),'utf8'),ts.ScriptTarget.ES2022,true);
const connect=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='connect');
assert.ok(connect,'production connect() missing');
const callbacks=[];
function findCallback(node){
 if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='addEventListener'&&node.expression.expression.getText(source)==='active'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='message')callbacks.push(node.arguments[1]);
 ts.forEachChild(node,findCallback);
}
findCallback(connect);assert.equal(callbacks.length,1,'expected the actual active socket message callback');
assert.ok(ts.isArrowFunction(callbacks[0])||ts.isFunctionExpression(callbacks[0]));
const transpile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const helpers=['hideDialogue','hideServiceWindows','cancelActiveTrade','hideClassicUtilityWindow','closeNpcSession','closeDialogue','sendNpcCommand','appendDialogueText','appendDialogueTextRun','createDialogueOptionControl','renderDialogueParts','dialogueInputKey','releaseDialogueInputPending','clearDialogueInputDrafts','prepareDialogueInputRefresh','submitDialogueInput','updateCurrency','updateQuest','syncServiceInventory'].map(name=>{
 const node=source.statements.find(candidate=>ts.isFunctionDeclaration(candidate)&&candidate.name?.text===name);assert.ok(node,`missing production helper ${name}`);return node.getText(source);
});
const callbackCode=transpile(`${helpers.join('\n')}\nglobalThis.receive=${callbacks[0].getText(source)};`);
const sessionContext={exports:{}};vm.createContext(sessionContext);
vm.runInContext(transpile(fs.readFileSync(path.join(root,'apps/web/src/npc-session.ts'),'utf8')),sessionContext);
const {NpcSession}=sessionContext.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
let groups=0;const pass=label=>{groups++;console.log(`PASS ${label}`);};

class Element{
 constructor(tag='section'){this.tag=tag;this.hidden=true;this.children=[];this.textContent='';this.dataset={};this.value='';this.disabled=false;this.focused=false;}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=[...children];}
 querySelectorAll(selector){const tags=selector.split(',').map(value=>value.trim());return this.children.flatMap(child=>[...(tags.includes(child.tag)?[child]:[]),...child.querySelectorAll(selector)]);}
 focus(){this.focused=true;}
}
function harness(){
 const calls=[],sent=[],panels=new Map(['#shop-panel','#repair-panel','#storage-panel'].map(selector=>[selector,new Element()]));
 const collection=prefix=>{
  const items=new Map();return {items,debugState:()=>({items:[...items.values()].map((item,slot)=>({...item,slot}))}),
   replace:values=>{items.clear();for(const item of values)items.set(item.makeIndex,item);},
   add:item=>{calls.push([`${prefix}.add`,item.makeIndex]);items.set(item.makeIndex,item);},
   remove:id=>{calls.push([`${prefix}.remove`,id]);items.delete(id);},
   update:item=>{calls.push([`${prefix}.update`,item.makeIndex]);if(items.has(item.makeIndex))items.set(item.makeIndex,item);},
   currency:gold=>{calls.push([`${prefix}.currency`,gold]);result.gold=gold;}
  };
 };
 const service=(prefix,selector,names)=>{
  const view={syncInventory:()=>{}};for(const name of names)view[name]=(...args)=>{calls.push([`${prefix}.${name}`,...args]);if(name==='clear')panels.get(selector).hidden=true;if(name.startsWith('open'))panels.get(selector).hidden=false;return true;};return view;
 };
 const active={readyState:1,send:data=>sent.push(JSON.parse(data))};
 const result={calls,sent,panels,gold:1000};
  const context={systemDialog:{opened:false,isOpen(){return this.opened;},show(request){this.opened=true;calls.push(['system.show',plain(request)]);return Promise.resolve('ok');},interrupt(){this.opened=false;calls.push(['system.interrupt']);}},console,mining:{reset(){},cancel(){},settle(){},reject(){}},active,socket:active,WebSocket:{OPEN:1},lastSequence:0,mapGeneration:5,npcSession:new NpcSession(5),connection:{textContent:'unchanged'},dialogueElement:new Element(),dialogueTitle:new Element('h2'),dialogueText:new Element('div'),dialogueOptions:new Element('div'),dialogueInputDrafts:new Map(),dialogueInputPending:undefined,dialogueNpcId:undefined,characterWindow:new Element(),inventoryWindow:new Element(),classicWindow:new Element(),tradeOpen:false,quests:new Map(),hideItemTooltip(){},hideStandaloneUtilityWindows(){},
  document:{querySelector:selector=>{assert.ok(panels.has(selector),`unexpected document selector ${selector}`);return panels.get(selector);},createElement:tag=>new Element(tag)},
  agentObserver:{event:(...args)=>calls.push(['agent',...args])},
  shop:service('shop','#shop-panel',['clear','open','openSell','showDetails','showSellQuote','resolve','resolveSale']),
  repair:service('repair','#repair-panel',['clear','open','showQuote','resolve']),
  storage:service('storage','#storage-panel',['clear','openDeposit','openItems','resolve']),
  inventory:collection('inventory'),itemQuickBar:collection('quickbar'),equipment:collection('equipment'),
  characterPanel:{currency:values=>calls.push(['character.currency',values])},
  classicHud:{currency:values=>calls.push(['hud.currency',values]),skinWindow:(panel,skin)=>calls.push(['skin',panel,skin])},
  renderGuild:()=>calls.push(['guild.render']),hideClassicWindows:()=>calls.push(['classic.hide']),dockChat:()=>calls.push(['chat.dock']),
  renderDialogueText:text=>{context.dialogueText.textContent=text;calls.push(['dialogue.text',text]);},
  serviceWindowOpened:panel=>calls.push(['window.open',panel]),questStorageKey:()=>undefined,renderQuest:()=>calls.push(['quest.render'])
 };
 context.clearAuthenticationWait=()=>{};context.armCurrentAuthWait=undefined;context.waitForResponse=()=>{};context.automatic=false;context.resumeCharacter=undefined;
 installPlayUiContext(context);vm.runInContext(callbackCode,context);
 let sequence=0;
 return {...result,context,
  send:(message,envelope={})=>context.receive({data:JSON.stringify({sequence:++sequence,mapGeneration:5,...envelope,message})}),
  gold:()=>result.gold,
  count:name=>calls.filter(call=>call[0]===name).length,
  clearCalls:()=>{calls.length=0;},
  item:(item)=>{for(const target of [context.inventory,context.itemQuickBar,context.equipment])target.items.set(item.makeIndex,{...item});}
 };
}
const apple={makeIndex:71,name:'苹果',durability:100,maxDurability:100};
const sword={makeIndex:72,name:'木剑',durability:5,maxDurability:100};
const quote={items:[apple],item:apple,price:300,npcName:'国王乙',text:'新对话',options:[]};
const presentation=['npcDialogue','shop','shopSell','shopDetails','shopSellQuote','repairItems','repairQuote','storageDeposit','storageItems','npcDialogueClosed'];

{
 const h=harness(),c=h.context,a=c.npcSession.begin(101),b=c.npcSession.begin(202);
 c.dialogueElement.hidden=false;c.dialogueTitle.textContent='当前乙';c.dialogueText.textContent='乙原内容';h.clearCalls();
 for(const [index,type] of presentation.entries()){
  const quest={id:`late-${index}`,title:'服务端任务',status:'done'};
  h.send({...quote,type,...a,...(index%2?{quest}:{quests:[quest]})});
  assert.equal(c.quests.get(quest.id).status,'done',`${type} discarded authoritative quests`);
  assert.equal(c.dialogueElement.hidden,false);assert.equal(c.dialogueTitle.textContent,'当前乙');assert.equal(c.dialogueText.textContent,'乙原内容');
  assert.deepEqual(plain(c.npcSession.current()),plain(b));
 }
 assert.equal(h.count('window.open'),0);assert.equal(h.count('dialogue.text'),0);
 assert.equal(h.calls.some(call=>/^(shop|repair|storage)\./.test(call[0])),false);
 pass('actual message callback rejects all ten old A presentation types after switching to B while their quest updates survive');
}
{
 const h=harness(),c=h.context,stamp=c.npcSession.begin(202);
 h.send({...quote,type:'npcDialogue',...stamp,options:[{text:'购买',command:'@buy'},{text:'输入',command:'@input',input:true}]});
 assert.equal(c.dialogueElement.hidden,false);assert.equal(c.dialogueTitle.textContent,'国王乙');assert.equal(c.dialogueText.textContent,'新对话');assert.equal(c.dialogueOptions.children.length,2);
 c.dialogueOptions.children[0].onclick();assert.deepEqual(h.sent[0],{type:'dialogueSelect',npcId:202,command:'@buy',...plain(stamp)});
 const form=c.dialogueOptions.children[1];form.children[0].value='输入值';form.onsubmit({preventDefault(){}});assert.equal(h.sent[1].input,'输入值');
 for(const [type,method] of [['shop','shop.open'],['shopSell','shop.openSell'],['shopDetails','shop.showDetails'],['shopSellQuote','shop.showSellQuote'],['repairItems','repair.open'],['repairQuote','repair.showQuote'],['storageDeposit','storage.openDeposit'],['storageItems','storage.openItems']]){
  const count=h.count(method);h.send({...quote,type,...stamp});assert.equal(h.count(method),count+1,type);assert.deepEqual(plain(c.npcSession.current()),plain(stamp),'presentation hiding invalidated the active session');
 }
 pass('current stamped NPC dialogue, text/input commands, shop/sell/details/quotes, repair and storage use the actual production branches without invalidating the session');
}
{
 const h=harness(),c=h.context,stamp=c.npcSession.begin(204);
 const parts=[{type:'text',text:'COLOR=clLime向导：欢迎。\n'}, {type:'option',text:'领取任务',command:'@quest'}, {type:'text',text:'\n需要先输入名字：'}, {type:'option',text:'提交',command:'@@InPutString8',input:true}];
 h.send({...quote,type:'npcDialogue',...stamp,options:[parts[1],parts[3]],parts});
 assert.deepEqual(c.dialogueText.children.map(child=>child.className),['dialogue-color-cllime','dialogue-inline-option dialogue-color-cllime','dialogue-color-cllime','dialogue-inline-input']);
 assert.equal(c.dialogueOptions.children.length,0,'ordered native text parts should own their inline controls');
 c.dialogueText.children[1].onclick();assert.deepEqual(h.sent[0],{type:'dialogueSelect',npcId:204,command:'@quest',...plain(stamp)});
 const form=c.dialogueText.children[3],input=form.children[0],submit=form.children[1];input.value='道长';input.oninput();form.onsubmit({preventDefault(){}});
 assert.equal(h.sent[1].command,'@@InPutString8');assert.equal(h.sent[1].input,'道长');assert.equal(input.disabled,true);assert.equal(submit.disabled,true);
 assert.equal(c.dialogueText.children[1].disabled,true,'input submission locks every inline choice');
 h.send({...quote,type:'npcDialogue',...stamp,options:[parts[1],parts[3]],parts});
 assert.equal(c.dialogueText.children[3].children[0].value,'道长','an inline input keeps its draft across the server redraw');
 assert.equal(c.dialogueText.children[1].disabled,false);
 pass('ordered NPC projection keeps prose, colored inline links and input prompts in one flowing text surface with session-safe actions');
}
{
 const h=harness(),c=h.context,stamp=c.npcSession.begin(303),inputOption={text:'请输入姓名',command:'@@InPutString',input:true},options=[inputOption,{text:'返回',command:'@back'}];
 h.send({...quote,type:'npcDialogue',...stamp,options});
 let form=c.dialogueOptions.children[0],input=form.children[0],button=form.children[1];
 input.value='草稿';input.oninput();form.onsubmit({preventDefault(){}});
 assert.equal(h.sent.at(-1).input,'草稿');assert.equal(input.disabled,true);assert.equal(button.disabled,true);assert.equal(c.dialogueOptions.children[1].disabled,true);assert.equal(c.dialogueOptions.dataset.inputPending,'true');
 form.onsubmit({preventDefault(){}});assert.equal(h.sent.length,1,'one submit must not queue duplicate dialogue commands');
 h.send({...quote,type:'npcDialogue',...stamp,options});
 form=c.dialogueOptions.children[0];input=form.children[0];button=form.children[1];assert.equal(input.value,'草稿','same-session redraw must restore the input draft');assert.equal(input.disabled,false);assert.equal(button.disabled,false);assert.equal(c.dialogueInputPending,undefined);
 input.value='服务器拒绝后仍保留';input.oninput();form.onsubmit({preventDefault(){}});c.appendChat=()=>{};
 h.send({type:'error',commandType:'dialogueSelect',message:'姓名不可用',...stamp});
 assert.equal(input.disabled,false);assert.equal(button.disabled,false);assert.equal(input.focused,true);assert.equal(input.value,'服务器拒绝后仍保留');assert.equal(c.dialogueInputPending,undefined);
 h.send({...quote,type:'npcDialogue',...stamp,options:[{text:'继续',command:'@next'}]});assert.equal(c.dialogueInputDrafts.size,0,'a completed input step must discard its old draft when that field disappears');
 h.send({...quote,type:'npcDialogue',...stamp,options:[inputOption]});assert.equal(c.dialogueOptions.children[0].children[0].value,'','re-entering a completed input step must not revive stale text');assert.notEqual(c.dialogueOptions.children[0].children[0].required,true,'the browser must not block an empty value accepted by the gateway');c.dialogueOptions.children[0].onsubmit({preventDefault(){}});assert.equal(h.sent.at(-1).input,'','empty NPC input follows the gateway contract');
 h.send({...quote,type:'npcDialogueClosed',...stamp});assert.equal(c.dialogueInputDrafts.size,0);assert.equal(c.dialogueInputPending,undefined);
 pass('NPC input draft survives redraw and typed rejection, submissions lock against duplicates, and completed/closed prompts clear stale values');
}
{
 const h=harness(),c=h.context,stamp=c.npcSession.begin(202);
 c.characterWindow.hidden=false;c.inventoryWindow.hidden=false;c.classicWindow.hidden=false;c.classicWindow.dataset.windowKind='guild';
 h.send({...quote,type:'npcDialogue',...stamp});
 assert.equal(c.dialogueElement.hidden,false);assert.equal(c.classicWindow.hidden,true);
 assert.equal(c.characterWindow.hidden,false,'opening NPC dialogue must preserve the character window');
 assert.equal(c.inventoryWindow.hidden,false,'opening NPC dialogue must preserve the inventory window');
 assert.equal(h.count('classic.hide'),0,'NPC dialogue must not invoke the all-window close path');
 pass('NPC dialogue closes the single utility tab while preserving coexisting character and inventory windows');
}
{
 const h=harness(),c=h.context,a=c.npcSession.begin(101),b=c.npcSession.begin(202);
 h.send({...quote,type:'npcDialogue',...b});h.clearCalls();
 h.send({type:'npcDialogueClosed',...a});h.send({type:'npcDialogueClosed',...b,npcId:101});
 assert.equal(c.dialogueElement.hidden,false);assert.deepEqual(plain(c.npcSession.current()),plain(b));assert.equal(h.count('shop.clear'),0);
 h.send({type:'npcDialogueClosed',...b});assert.equal(c.dialogueElement.hidden,true);assert.equal(c.npcSession.current(),undefined);assert.equal(h.count('shop.clear'),1);assert.equal(h.count('repair.clear'),1);assert.equal(h.count('storage.clear'),1);
 pass('old or wrong-NPC close acknowledgements leave B open; a matching close invalidates B and hides/clears its views');
}
{
 const h=harness(),c=h.context,stamp=c.npcSession.begin(101);h.item(apple);h.item(sword);
 c.closeDialogue();assert.equal(c.npcSession.current(),undefined);assert.equal(h.sent[0].type,'npcClose');h.clearCalls();
 const purchased={...apple,makeIndex:73};h.send({type:'itemAdded',item:purchased});h.send({type:'shopPurchaseResult',...stamp,accepted:true,name:purchased.name,makeIndex:73,gold:900,reason:0});
 assert.equal(h.gold(),900);assert.equal(c.inventory.items.has(73),true);assert.equal(c.itemQuickBar.items.has(73),true);assert.equal(h.count('shop.resolve'),0);
 h.send({type:'shopSellResult',...stamp,accepted:true,item:apple,gold:1200});assert.equal(h.gold(),1200);assert.equal(c.inventory.items.has(71),false);assert.equal(c.itemQuickBar.items.has(71),false);assert.equal(h.count('shop.resolveSale'),0);
 h.send({type:'repairResult',...stamp,accepted:true,item:{...sword,durability:100},gold:1100});assert.equal(h.gold(),1100);for(const target of [c.inventory,c.itemQuickBar,c.equipment])assert.equal(target.items.get(72).durability,100);assert.equal(h.count('repair.resolve'),0);
 h.send({type:'storageResult',...stamp,accepted:true,kind:'store',item:sword});assert.equal(c.inventory.items.has(72),false);assert.equal(c.itemQuickBar.items.has(72),false);
 h.send({type:'storageResult',...stamp,accepted:true,kind:'take',item:sword});assert.equal(c.inventory.items.has(72),true);assert.equal(c.itemQuickBar.items.has(72),true);assert.equal(h.count('storage.resolve'),0);
 assert.equal(c.npcSession.current(),undefined);assert.equal(c.dialogueElement.hidden,true);assert.equal(h.count('window.open'),0);
 pass('late accepted purchase (separate itemAdded), sale, repair and storage keep authoritative inventory/quickbar/equipment/gold after local close without resolving stale UI');
}
{
 const h=harness(),c=h.context,a=c.npcSession.begin(101),b=c.npcSession.begin(202);h.item(apple);
 h.send({...quote,type:'npcDialogue',...b});h.clearCalls();
 h.send({type:'shopSellResult',...a,accepted:true,item:apple,gold:1300});
 assert.equal(h.gold(),1300);assert.equal(c.inventory.items.has(71),false);assert.equal(c.dialogueElement.hidden,false);assert.equal(c.dialogueTitle.textContent,'国王乙');assert.deepEqual(plain(c.npcSession.current()),plain(b));assert.equal(h.count('shop.resolveSale'),0);
 pass('accepted economic authority from old A applies while a different current B presentation remains intact');
}
{
 const h=harness(),c=h.context,stamp=c.npcSession.begin(202);h.item(apple);h.item(sword);
 h.send({type:'shopPurchaseResult',...stamp,accepted:true,name:'苹果',makeIndex:73,gold:900,reason:0});assert.equal(h.count('shop.resolve'),1);assert.match(c.connection.textContent,/购买.*成功/);
 h.send({type:'shopSellResult',...stamp,accepted:true,item:apple,gold:1100});assert.equal(h.count('shop.resolveSale'),1);assert.equal(c.inventory.items.has(71),false);
 h.send({type:'repairResult',...stamp,accepted:true,item:{...sword,durability:100},gold:1000});assert.equal(h.count('repair.resolve'),1);assert.equal(c.inventory.items.get(72).durability,100);
 h.send({type:'storageResult',...stamp,accepted:true,kind:'store',item:sword});h.send({type:'storageResult',...stamp,accepted:true,kind:'take',item:sword});assert.equal(h.count('storage.resolve'),2);assert.equal(c.itemQuickBar.items.has(72),true);
 const beforeGold=h.gold(),beforeItem=c.inventory.items.get(72);
 for(const message of [{type:'shopPurchaseResult',name:'苹果',makeIndex:73,gold:0,reason:3},{type:'shopSellResult',item:sword,gold:0},{type:'repairResult',item:{...sword,durability:1},gold:0},{type:'storageResult',kind:'store',item:sword,reason:1}])h.send({...message,...stamp,accepted:false});
 assert.equal(h.gold(),beforeGold);assert.equal(c.inventory.items.get(72),beforeItem);assert.equal(h.count('shop.resolve'),2);assert.equal(h.count('shop.resolveSale'),2);assert.equal(h.count('repair.resolve'),2);assert.equal(h.count('storage.resolve'),3);
 pass('current-session accepted and rejected results resolve their presentation; only accepted results mutate economic authority');
}
{
 const h=harness(),c=h.context;c.npcSession.begin(202);c.closeDialogue();h.clearCalls();
 // Gateway 767/772 both arrive as dialogueMessage; the current frontend
 // uses the shared modal controller and retains no legacy-kind distinction.
 for(const [messageId,text] of [[767,'消息提示'],[772,'地图说明']]){
  const quest={id:`system-${messageId}`,status:'active'};c.dialogueOptions.append(new Element('button'));
  h.send({type:'dialogueMessage',text,quests:[quest]});
  assert.equal(c.dialogueElement.hidden,true);assert.deepEqual(h.calls.filter(call=>call[0]==='system.show').at(-1)[1],{text,buttons:['ok']});assert.equal(c.npcSession.current(),undefined);assert.equal(c.quests.get(quest.id).status,'active');
 }
 assert.equal(h.count('system.show'),2);assert.equal(h.count('window.open'),0);
 pass('767/772 projected dialogueMessage works without NPC identity after local close, updates quests and uses the shared system modal without reopening NPC UI');
}
{
 const h=harness(),c=h.context,stamp=c.npcSession.begin(202);h.send({...quote,type:'npcDialogue',...stamp});h.clearCalls();
 h.send({...quote,type:'npcDialogue',...stamp,text:'duplicate',quest:{id:'duplicate'}},{sequence:c.lastSequence});
 h.send({...quote,type:'npcDialogue',...stamp,text:'old-map',quest:{id:'old-map'}},{mapGeneration:4});
 c.socket={};h.send({...quote,type:'npcDialogue',...stamp,text:'old-connection',quest:{id:'old-connection'}});
 assert.equal(c.dialogueText.textContent,'新对话');assert.equal(c.quests.size,0);assert.equal(h.count('window.open'),0);
 pass('production envelope sequence/map/connection guards reject messages before NPC presentation or quest mutation');
}
{
 const h=harness(),c=h.context,stamp=c.npcSession.begin(202);
 h.send({...quote,type:'shop',...stamp});
 h.send({type:'dialogueMessage',text:'独立系统提示'});
 assert.equal(c.systemDialog.isOpen(),true);assert.equal(c.sendNpcCommand({type:'shopDetails',npcId:202,name:'苹果',page:0}),false);
 assert.equal(h.panels.get('#shop-panel').hidden,false);
 c.systemDialog.interrupt();
 assert.equal(c.dialogueElement.hidden,true);
 assert.equal(h.panels.get('#shop-panel').hidden,false);
 assert.deepEqual(plain(c.npcSession.current()),plain(stamp));
 assert.equal(h.sent.length,0,'closing a system prompt sent npcClose for the underlying shop');
 assert.equal(c.sendNpcCommand({type:'shopDetails',npcId:202,name:'苹果',page:0}),true);
 assert.deepEqual(h.sent[0],{type:'shopDetails',npcId:202,name:'苹果',page:0,...plain(stamp)});

 // Run actual lifecycle functions with the shared dialogue marked as system.
 // Only their unrelated rendering/world collaborators are stubbed.
 const lifecycle=['cancelGroupConfirmation','clearWorld','showDeathWindow'].map(name=>{
  const node=source.statements.find(candidate=>ts.isFunctionDeclaration(candidate)&&candidate.name?.text===name);
  assert.ok(node,`missing production lifecycle ${name}`);return node.getText(source);
 });
 const noop=()=>{};
 let audioClears=0;
 Object.assign(c,{
  audio:{clear:()=>audioClears++},chatController:{resetHistory:noop},
  skillBar:{cancelKeyBinding:noop,cancelSelection:noop,resolve:noop},magicEffects:{clear:noop},visuals:new Map(),entities:new Map(),groundItems:{clear:noop},
   pursuitRejectedCells:new Set(),movementRejectedCells:new Set(),characterWindow:new Element(),inventoryWindow:new Element(),combatTimer:undefined,
  revivePanel:new Element(),returnToTown:{disabled:false},combatStatus:{},cancelWorldIntent:noop,bringClassicWindowToFront:noop,
  renderGroup:noop,renderAttackMode:noop,clearTrade:noop,renderTargets:noop,refreshMiniMapMarkers:noop,
  groupConfirmationSerial:0,groupConfirmationPending:undefined,
  classicAuth:{hide:noop},view:{width:800,height:600,setMap:()=>Promise.resolve(true)},minimap:{setMap:()=>Promise.resolve()}
 });
 c.document.body={classList:{add:noop}};
 Object.assign(c.inventory,{cancelSelection:noop,rejectPending:noop});
 for(const view of [c.itemQuickBar,c.equipment,c.shop,c.repair,c.storage])view.rejectPending=noop;
 c.characterPanel.resources=noop;c.classicHud.position=noop;c.classicHud.beginMap=noop;
 vm.runInContext(transpile(lifecycle.join('\n')),c);
 h.send({type:'dialogueMessage',text:'死亡前提示'});
 const sentBeforeDeath=h.sent.length;c.showDeathWindow();
 assert.equal(audioClears,1);
 assert.equal(c.npcSession.current(),undefined);
 assert.equal(h.sent.length,sentBeforeDeath+1);
 assert.deepEqual(h.sent.at(-1),{type:'npcClose',...plain(stamp)});
 assert.equal(c.dialogueElement.hidden,true);assert.equal(h.panels.get('#shop-panel').hidden,true);

 const next=c.npcSession.begin(303);h.send({...quote,type:'shop',...next});
 h.send({type:'dialogueMessage',text:'切图前提示'});
 const sentBeforeMap=h.sent.length;h.send({type:'map',map:'3'},{mapGeneration:6});
 assert.equal(audioClears,2);
 assert.equal(h.sent.length,sentBeforeMap+1);
 assert.deepEqual(h.sent.at(-1),{type:'npcClose',...plain(next)});
 assert.equal(c.npcSession.current(),undefined);
 assert.equal(c.dialogueElement.hidden,true);assert.equal(h.panels.get('#shop-panel').hidden,true);
 assert.equal(c.mapGeneration,6);assert.equal(c.worldReady,false);
 // A valid script arriving before map assets finish uses the real callback,
 // with an explicit automatic marker and no timer-based discard.
 h.send({...quote,type:'npcDialogue',npcId:404,npcSessionId:0,mapGeneration:6,automatic:true},{mapGeneration:6});
 assert.equal(c.dialogueElement.hidden,false);
 assert.deepEqual(plain(c.npcSession.current()),{npcSessionId:0,mapGeneration:6,npcId:404});
 pass('production system close preserves underlying B commands; death/map clear close its session and the new map accepts automatic entry during asset loading');
}
{
 const h=harness(),c=h.context,a=c.npcSession.begin(101),b=c.npcSession.begin(202);
 const action={actionId:99,kind:'move'},itemPending={makeIndex:72};
 c.pendingAction=action;c.inventory.pending=itemPending;
 const failures=[];
 for(const [name,view] of [['shop',c.shop],['repair',c.repair],['storage',c.storage],['inventory',c.inventory],['equipment',c.equipment],['quickbar',c.itemQuickBar]])view.rejectPending=(reason,phase)=>failures.push([name,phase]);
 c.appendChat=()=>{};c.skillBar={resolve:()=>{throw new Error('NPC rejection released a pending spell');}};
 h.send({type:'error',commandType:'buyShopItem',message:'pending',...a});assert.deepEqual(failures,[]);
 const commands=[['shopDetails','shop','details'],['buyShopItem','shop','purchase'],['querySellItem','shop','quote'],['sellShopItem','shop','sale'],['queryRepairItem','repair','quote'],['repairItem','repair','repair'],['storeItem','storage','store'],['takeStorageItem','storage','take']];
 for(const [commandType,expected,phase] of commands){
  h.send({type:'error',commandType,message:'pending',...b});assert.deepEqual(failures.at(-1),[expected,phase]);
  assert.equal(c.pendingAction,action);assert.equal(c.inventory.pending,itemPending);assert.deepEqual(plain(c.npcSession.current()),plain(b));
 }
 assert.deepEqual(failures,commands.map(([,name,phase])=>[name,phase]));
 h.send({type:'error',commandType:'npc',message:'out of reach',...b});
 assert.equal(c.npcSession.current(),undefined);assert.equal(c.pendingAction,action);assert.equal(c.inventory.pending,itemPending);
 assert.deepEqual(h.sent.at(-1),{type:'npcClose',...plain(b)});
 pass('production NPC command rejection releases only its own view, preserves world/item/spell confirmations and invalidates a failed opening');
}
{
 const h=harness(),c=h.context,a=c.npcSession.begin(101),b=c.npcSession.begin(202),synced=[];
 for(const [name,view] of [['shop',c.shop],['repair',c.repair],['storage',c.storage]])view.syncInventory=items=>synced.push([name,plain(items)]);
 h.send({type:'inventory',items:[sword]});assert.equal(synced.length,3);assert.equal(synced.at(-1)[1][0].makeIndex,sword.makeIndex);assert.equal('slot' in synced.at(-1)[1][0],false,'bag layout slots must never invalidate an authoritative service quote');
 h.send({type:'itemUpdated',item:{...sword,durability:55}});assert.equal(synced.at(-1)[1][0].durability,55);
 h.send({type:'storageResult',accepted:true,kind:'take',item:apple,...a});assert.equal(c.inventory.items.has(apple.makeIndex),true);assert.equal(synced.at(-1)[1].length,2);assert.deepEqual(plain(c.npcSession.current()),plain(b));
 h.send({type:'storageResult',accepted:true,kind:'store',item:apple,...a});assert.equal(synced.at(-1)[1].length,1);
 h.send({type:'itemRemoved',makeIndex:sword.makeIndex});assert.equal(synced.at(-1)[1].length,0);assert.equal(synced.length,15);
 pass('production service candidates track authoritative snapshots, durability and late old-session transactions before presentation filtering');
}
{
 const constructors=['shop','storage','repair'].map(name=>{
  const node=source.statements.find(candidate=>ts.isVariableStatement(candidate)&&candidate.declarationList.declarations.some(declaration=>declaration.name.getText(source)===name));
  assert.ok(node,`missing actual ${name} constructor`);return node.getText(source);
 });
 const actions={},sent=[];let accepted=false;
 class ServiceConstructor{constructor(element,callbacks){actions[element.id]=callbacks;}}
 const c={document:{querySelector:selector=>({id:selector})},ShopView:ServiceConstructor,StorageView:ServiceConstructor,RepairView:ServiceConstructor,sendNpcCommand:message=>{sent.push(plain(message));return accepted;},closeNpcSession(){}};
 installPlayUiContext(c);vm.runInContext(transpile(constructors.join('\n')),c);
 const commands=[
  ['#shop-panel','details',[101,'木剑',10],{type:'shopDetails',npcId:101,name:'木剑',page:10}],
  ['#shop-panel','buy',[101,'木剑'],{type:'buyShopItem',npcId:101,name:'木剑'}],
  ['#shop-panel','buy',[101,'木剑',201],{type:'buyShopItem',npcId:101,name:'木剑',makeIndex:201}],
  ['#shop-panel','quote',[101,201],{type:'querySellItem',npcId:101,makeIndex:201}],
  ['#shop-panel','sell',[101,201],{type:'sellShopItem',npcId:101,makeIndex:201}],
  ['#repair-panel','quote',[101,201],{type:'queryRepairItem',npcId:101,makeIndex:201}],
  ['#repair-panel','repair',[101,201],{type:'repairItem',npcId:101,makeIndex:201}],
  ['#storage-panel','store',[101,201],{type:'storeItem',npcId:101,makeIndex:201}],
  ['#storage-panel','take',[101,201],{type:'takeStorageItem',npcId:101,makeIndex:201}],
 ];
 for(const result of [false,true]){
  accepted=result;for(const [panel,method,args,expected] of commands){assert.equal(actions[panel][method](...args),result,`${panel}.${method} lost the send result`);assert.deepEqual(sent.at(-1),expected);}
 }
 assert.equal(sent.length,18);
 pass('actual production shop/repair/storage constructor actions forward false/true send results and exact command parameters');
}

console.log(`${groups} NPC play groups passed: actual AST-extracted play callback/helpers + production NpcSession; view stubs, no browser/native runtime claim.`);
