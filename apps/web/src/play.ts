import {createMapView} from './map-view';
import {OnlineActor,preloadPlayerLocomotion,type Entity} from './online-actors';
import './style.css';
import {EquipmentView,InventoryView,type InventoryItem} from './inventory';
import {GroundItems,type GroundItem} from './ground-items';
import {PaperdollView} from './paperdoll';
import {CharacterPanel} from './character-panel';
import {ShopView} from './shop';
import {StorageView} from './storage';
import {SkillBar,skillUseOf,type MagicSkill} from './skills';
import {GameAudio} from './game-audio';
import {RepairView} from './repair';
import {MagicEffects} from './magic-effects';
import {ClassicHud} from './classic-hud';
import {ClassicAuth,type SelectCharacter} from './classic-auth';
import {ClassicStage} from './classic-stage';
import {movementInput,releasesMovement,screenDirection,type HeldMovement} from './movement-input';
import {DIRECTIONS as directions,MOVEMENT_DURATION_MS,directionIndex,findGridPath,movementCanFinish,type MovementStep} from './movement-model';
import {AgentObserver,agentObservationEnabled,type AgentDebugApi} from './agent-observer';
import {MiniMapController,type MiniMapMarker} from './minimap';
import {requestsHarvest} from './harvest-input';
import {makeClassicWindowDraggable} from './window-drag';
const connection=document.querySelector<HTMLElement>('#connection')!;
const worldStatus=document.querySelector<HTMLOutputElement>('#world-status')!;
new MutationObserver(()=>worldStatus.textContent=connection.textContent).observe(connection,{childList:true,characterData:true,subtree:true});
const loginForm=document.querySelector<HTMLFormElement>('#login')!;
const createCharacterForm=document.querySelector<HTMLFormElement>('#create-character')!;
const combatStatus=document.querySelector<HTMLElement>('#combat-status')!;
const targetsElement=document.querySelector<HTMLElement>('#nearby-targets')!;
const chatPanel=document.querySelector<HTMLElement>('.chat-panel')!,chatLog=document.querySelector<HTMLOListElement>('#chat-log')!,chatForm=document.querySelector<HTMLFormElement>('#chat-form')!,chatChannel=document.querySelector<HTMLSelectElement>('#chat-channel')!,chatTargetWrap=document.querySelector<HTMLElement>('#chat-target-wrap')!,chatTarget=document.querySelector<HTMLInputElement>('#chat-target')!,chatInput=document.querySelector<HTMLInputElement>('#chat-input')!;
const groupStatus=document.querySelector<HTMLElement>('#group-status')!,groupTarget=document.querySelector<HTMLInputElement>('#group-target')!,groupMembers=document.querySelector<HTMLOListElement>('#group-members')!,groupMode=document.querySelector<HTMLButtonElement>('#group-mode')!,groupCreate=document.querySelector<HTMLButtonElement>('#group-create')!,groupAdd=document.querySelector<HTMLButtonElement>('#group-add')!,groupRemove=document.querySelector<HTMLButtonElement>('#group-remove')!;
const attackModeSelect=document.querySelector<HTMLSelectElement>('#attack-mode')!,attackModeStatus=document.querySelector<HTMLElement>('#attack-mode-status')!;
const guildStatus=document.querySelector<HTMLElement>('#guild-status')!,guildTarget=document.querySelector<HTMLInputElement>('#guild-target')!,guildNameInput=document.querySelector<HTMLInputElement>('#guild-name')!,guildMembers=document.querySelector<HTMLOListElement>('#guild-members')!,guildRanksElement=document.querySelector<HTMLElement>('#guild-ranks')!,guildRelations=document.querySelector<HTMLElement>('#guild-relations')!,guildWarTarget=document.querySelector<HTMLInputElement>('#guild-war-target')!,guildWarRequest=document.querySelector<HTMLButtonElement>('#guild-war-request')!,guildCastleDialogue=document.querySelector<HTMLButtonElement>('#guild-castle-dialogue')!,guildNoticeInput=document.querySelector<HTMLTextAreaElement>('#guild-notice')!,guildNoticeSave=document.querySelector<HTMLButtonElement>('#guild-notice-save')!,guildAllyTarget=document.querySelector<HTMLInputElement>('#guild-ally-target')!,guildAlly=document.querySelector<HTMLButtonElement>('#guild-ally')!,guildBreakAlly=document.querySelector<HTMLButtonElement>('#guild-break-ally')!,guildRanksInput=document.querySelector<HTMLTextAreaElement>('#guild-ranks-input')!,guildRanksSave=document.querySelector<HTMLButtonElement>('#guild-ranks-save')!,guildOpen=document.querySelector<HTMLButtonElement>('#guild-open')!,guildMembersRequest=document.querySelector<HTMLButtonElement>('#guild-members-request')!,guildCreate=document.querySelector<HTMLButtonElement>('#guild-create')!,guildAdd=document.querySelector<HTMLButtonElement>('#guild-add')!,guildRemove=document.querySelector<HTMLButtonElement>('#guild-remove')!;
const tradePanel=document.querySelector<HTMLElement>('#trade-panel')!,tradeStatus=document.querySelector<HTMLElement>('#trade-status')!,tradeRequestForm=document.querySelector<HTMLFormElement>('#trade-request-form')!,tradeTarget=document.querySelector<HTMLInputElement>('#trade-target')!,tradeGoldInput=document.querySelector<HTMLInputElement>('#trade-gold')!,tradeSetGold=document.querySelector<HTMLButtonElement>('#trade-set-gold')!,tradeAccept=document.querySelector<HTMLButtonElement>('#trade-accept')!,tradeCancel=document.querySelector<HTMLButtonElement>('#trade-cancel')!,tradeLocalItems=document.querySelector<HTMLOListElement>('#trade-local-items')!,tradeRemoteItems=document.querySelector<HTMLOListElement>('#trade-remote-items')!;
const revivePanel=document.querySelector<HTMLElement>('#revive-panel')!,returnToTown=document.querySelector<HTMLButtonElement>('#return-to-town')!;
const questLog=document.querySelector<HTMLElement>('#quest-log')!;
const audio=new GameAudio(document.querySelector<HTMLButtonElement>('#audio-toggle')!);
const characterPanel=new CharacterPanel(
 document.querySelector<HTMLElement>('#character-panel')!,
 document.querySelector<HTMLElement>('#character-state')!,
 document.querySelector<HTMLElement>('[data-character-name]')!
);
const dialogueElement=document.querySelector<HTMLElement>('#npc-dialog')!,dialogueTitle=document.querySelector<HTMLElement>('#npc-title')!,dialogueText=document.querySelector<HTMLElement>('#npc-text')!,dialogueOptions=document.querySelector<HTMLElement>('#npc-options')!;
const shop=new ShopView(document.querySelector<HTMLElement>('#shop-panel')!,{
 details:(npcId,name,page)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'shopDetails',npcId,name,page}));},
 buy:(npcId,name,makeIndex)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'buyShopItem',npcId,name,...(makeIndex===undefined?{}:{makeIndex})}));},
 quote:(npcId,makeIndex)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'querySellItem',npcId,makeIndex}));},
 sell:(npcId,makeIndex)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'sellShopItem',npcId,makeIndex}));}
});
const storage=new StorageView(document.querySelector<HTMLElement>('#storage-panel')!,{
 store:(npcId,makeIndex)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'storeItem',npcId,makeIndex}));},
 take:(npcId,makeIndex)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'takeStorageItem',npcId,makeIndex}));}
});
const repair=new RepairView(document.querySelector<HTMLElement>('#repair-panel')!,{
 quote:(npcId,makeIndex)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'queryRepairItem',npcId,makeIndex}));},
 repair:(npcId,makeIndex)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'repairItem',npcId,makeIndex}));}
});
let selectedMagic:MagicSkill|undefined;
let groupEnabled=false,groupMemberNames:string[]=[],attackMode=0;
let guildName='',guildRankName='',guildNotice='',guildWarGuildNames:string[]=[],guildWarTimers:{name:string;remainingMs:number}[]=[],guildWarReceivedAt=0,guildAllyGuildNames:string[]=[],guildMemberNames:string[]=[],guildRanks:{rankNo:number;rankName:string;members:string[]}[]=[],castleWarStatus:{phase:'started'|'warning'|'captured'|'ended';castleName:string;remainingMinutes?:number;guildName?:string}|undefined,dialogueNpcId:number|undefined;
type QuestState={id:string;status:string;title:string;summary:string;objective:string;detail:string};
let quests=new Map<string,QuestState>();
let tradeOpen=false,tradeLocal=new Map<number,InventoryItem>(),tradeRemote=new Map<number,InventoryItem>(),tradeGold=0,tradeRemoteGold=0;
function questStorageKey(){return selectedCharacter?`mir2.quest.${selectedCharacter}`:undefined;}
function renderQuest(){
 if(!quests.size){questLog.textContent='与任务 NPC 交谈后会显示任务进度。';return;}
 questLog.replaceChildren();
 for(const quest of [...quests.values()].sort((a,b)=>Number(a.status==='complete')-Number(b.status==='complete'))){
  const state=quest.status==='complete'?'已完成':quest.status==='accepted'?'进行中':'可接取';
  const card=document.createElement('article');card.className=`quest-entry quest-${quest.status}`;
  const title=document.createElement('strong');title.textContent=`${quest.title} · ${state}`;
  const summary=document.createElement('p');summary.textContent=quest.summary;
  const objective=document.createElement('p');objective.textContent=`目标：${quest.objective}`;
  const detail=document.createElement('small');detail.textContent=quest.detail;
  card.append(title,summary,objective,detail);questLog.append(card);
 }
}
function updateQuest(value:QuestState){
 quests.set(value.id,value);
 const key=questStorageKey();if(key)window.localStorage.setItem(key,JSON.stringify(Object.fromEntries(quests)));
 renderQuest();
}
function renderDialogueText(value:string){
 dialogueText.replaceChildren();
 const token=/COLOR=(cl[A-Za-z]+)\s*/gi;
 let cursor=0,current='default',match:RegExpExecArray|null;
 while((match=token.exec(value))){
  appendDialogueText(value.slice(cursor,match.index),current);
  current=match[1].toLowerCase();
  cursor=match.index+match[0].length;
 }
 appendDialogueText(value.slice(cursor),current);
}
function appendDialogueText(value:string,color:string){
 if(!value)return;
 const span=document.createElement('span');span.className=`dialogue-color-${color}`;span.textContent=value;dialogueText.append(span);
}
function loadQuest(){
 quests=new Map();
 const key=questStorageKey();
 if(key){try{
  const value=JSON.parse(window.localStorage.getItem(key)??'null');
  if(value&&typeof value==='object'&&value.id)quests.set(value.id,value as QuestState);
  else if(value&&typeof value==='object')for(const [id,quest] of Object.entries(value))if(quest&&typeof quest==='object')quests.set(id,quest as QuestState);
  const legacy=JSON.parse(window.localStorage.getItem(`mir2.quest.${selectedCharacter}.p0-trial`)??'null');
  if(legacy?.id==='p0-trial')quests.set(legacy.id,legacy as QuestState);
 }catch{quests=new Map();}}
 renderQuest();
}
function renderGroup(){
 groupMode.textContent=`允许组队：${groupEnabled?'开':'关'}`;
 groupStatus.textContent=groupMemberNames.length?`队伍 ${groupMemberNames.length} 人`:'未组队';
 groupMembers.replaceChildren();
 for(const name of groupMemberNames){const item=document.createElement('li');item.textContent=name;groupMembers.append(item);}
}
function sendGroup(type:'groupMode'|'groupCreate'|'groupAdd'|'groupRemove'){
 if(socket?.readyState!==WebSocket.OPEN)return;
 if(type!=='groupMode'&&!groupTarget.value.trim()){connection.textContent='请填写角色名';groupTarget.focus();return;}
 const message:{type:string;enabled?:boolean;target?:string}={type};
 if(type==='groupMode')message.enabled=!groupEnabled;else message.target=groupTarget.value.trim();
 socket.send(JSON.stringify(message));
}
function renderAttackMode(){
 attackModeSelect.value=String(attackMode);
 attackModeStatus.textContent=`服务端状态：${attackModeSelect.selectedOptions[0]?.textContent??'未知'}`;
}
function formatGuildWarTime(remainingMs:number){const totalSeconds=Math.max(0,Math.ceil(remainingMs/1000));const hours=Math.floor(totalSeconds/3600),minutes=Math.floor(totalSeconds%3600/60),seconds=totalSeconds%60;return hours?`${hours}小时${String(minutes).padStart(2,'0')}分`:minutes?`${minutes}分${String(seconds).padStart(2,'0')}秒`:`${seconds}秒`;}
function renderGuildRelations(){
 const warText=guildWarGuildNames.length?`交战：${guildWarGuildNames.map(name=>{const timer=guildWarTimers.find(value=>value.name===name);return timer?`${name}（${formatGuildWarTime(timer.remainingMs-(performance.now()-guildWarReceivedAt))}）`:name;}).join('、')}`:'暂无交战';
 const castleText=castleWarStatus?castleWarStatus.phase==='started'?`${castleWarStatus.castleName}攻城进行中`:castleWarStatus.phase==='warning'?`${castleWarStatus.castleName}攻城剩余${castleWarStatus.remainingMinutes}分钟`:castleWarStatus.phase==='captured'?`${castleWarStatus.castleName}已被${castleWarStatus.guildName}占领`:`${castleWarStatus.castleName}攻城已结束`:'';
 guildRelations.textContent=[guildNotice?`公告：${guildNotice}`:'暂无公告',warText,guildAllyGuildNames.length?`联盟：${guildAllyGuildNames.join('、')}`:'暂无联盟',castleText].filter(Boolean).join(' · ');
}
function renderGuild(){
 guildStatus.textContent=guildName?(guildRankName?`${guildName} · ${guildRankName}`:guildName):'未加入行会';
 guildCreate.disabled=dialogueNpcId===undefined;
 guildWarRequest.disabled=dialogueNpcId===undefined||!guildName;
 guildCastleDialogue.disabled=dialogueNpcId===undefined||!guildName;
 guildNoticeInput.value=guildNotice;
 renderGuildRelations();
 guildMembers.replaceChildren();
 for(const name of guildMemberNames){const item=document.createElement('li');item.textContent=name;guildMembers.append(item);}
 guildRanksElement.replaceChildren();
 for(const rank of guildRanks){const row=document.createElement('p');row.textContent=`${rank.rankNo}. ${rank.rankName}：${rank.members.join('、')||'暂无成员'}`;guildRanksElement.append(row);}
 guildRanksInput.value=guildRanks.map(rank=>`${rank.rankNo}|${rank.rankName}|${rank.members.join(',')}`).join('\n');
}
window.setInterval(()=>{if(guildWarTimers.length||castleWarStatus)renderGuildRelations();},1000);
function sendGuild(type:'guildOpen'|'guildMembers'|'guildAdd'|'guildRemove'){
 if(socket?.readyState!==WebSocket.OPEN)return;
 if((type==='guildAdd'||type==='guildRemove')&&!guildTarget.value.trim()){connection.textContent='请填写行会对象';guildTarget.focus();return;}
 const message:{type:string;target?:string}={type};
 if(message.type==='guildAdd'||message.type==='guildRemove')message.target=guildTarget.value.trim();
 socket.send(JSON.stringify(message));
}
function renderTrade(){
 tradeStatus.textContent=tradeOpen?`与 ${tradeTarget.value||'对方'} 交易 · 我方金币 ${tradeGold} · 对方金币 ${tradeRemoteGold}`:'未打开';
 tradeLocalItems.replaceChildren();tradeRemoteItems.replaceChildren();
 for(const item of tradeLocal.values()){const row=document.createElement('li');row.textContent=item.name;const button=document.createElement('button');button.type='button';button.textContent='取回';button.disabled=!tradeOpen;button.onclick=()=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'tradeRemove',makeIndex:item.makeIndex}));};row.append(button);tradeLocalItems.append(row);}
 for(const item of tradeRemote.values()){const row=document.createElement('li');row.textContent=item.name;tradeRemoteItems.append(row);}
 tradePanel.hidden=false;
 if(tradeOpen)showClassicWindow('trade');
}
function clearTrade(){tradeOpen=false;tradeLocal.clear();tradeRemote.clear();tradeGold=0;tradeRemoteGold=0;tradeTarget.value='';tradeGoldInput.value='0';renderTrade();}
const skillBar=new SkillBar(document.querySelector<HTMLElement>('#skills')!,{
 select:skill=>{selectedMagic=skill;connection.textContent=skill?`已选择 ${skill.name}，请点击目标`:'已取消技能选择';},
 self:skill=>castSelf(skill)
});
const classicHud=new ClassicHud(document.querySelector<HTMLElement>('#classic-hud')!,index=>activateSkillSlot(index));
const classicAuth=new ClassicAuth(document.querySelector<HTMLElement>('#auth-overlay')!);
new ClassicStage(document.querySelector<HTMLElement>('#game-stage')!,document.querySelector<HTMLElement>('#viewport-shell')!);
const view=await createMapView(document.querySelector<HTMLElement>('#viewport')!,document.querySelector<HTMLOutputElement>('#status')!);
const minimap=new MiniMapController(document.querySelector<HTMLElement>('[data-hud-minimap-frame]')!,startMapRoute);
void minimap.setMap('0',view.width,view.height);
const magicEffects=new MagicEffects(view.depth,id=>entities.get(id));
let ignoreCanvasPointerUntil=0;
let lastAttack=0;
const inventory=new InventoryView(document.querySelector<HTMLElement>('#inventory-items')!,{
 drop:makeIndex=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'dropItem',makeIndex}));},
 equip:(makeIndex,slot)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'equipItem',makeIndex,slot:equipment.preferredSlot(slot)}));},
 use:makeIndex=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'useItem',makeIndex}));},
 trade:makeIndex=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'tradeAdd',makeIndex}));},
 layoutKey:()=>selectedCharacter?`mir2.inventory-layout.${selectedCharacter}`:undefined
});
const equipment=new EquipmentView(document.querySelector<HTMLElement>('#equipment-items')!,slot=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'takeOffItem',slot}));});
const paperdoll=new PaperdollView(document.querySelector<HTMLElement>('#paperdoll-actor')!);
const characterWindow=document.querySelector<HTMLElement>('#character-window')!;
const inventoryWindow=document.querySelector<HTMLElement>('#inventory-window')!;
const classicWindow=document.querySelector<HTMLElement>('#classic-window')!;
const classicWindowTitle=document.querySelector<HTMLElement>('#classic-window-title')!;
const classicWindowBody=document.querySelector<HTMLElement>('#classic-window-body')!;
const classicModalLayer=document.querySelector<HTMLElement>('#classic-modal-layer')!;
function updateCurrency(values:{gold?:number;gameGold?:number}){characterPanel.currency(values);classicHud.currency(values);if(values.gold!==undefined)inventory.currency(values.gold);}
for(const panel of [dialogueElement,document.querySelector<HTMLElement>('#shop-panel')!,document.querySelector<HTMLElement>('#repair-panel')!,document.querySelector<HTMLElement>('#storage-panel')!,revivePanel])classicModalLayer.append(panel);
const classicSurface=document.querySelector<HTMLElement>('#viewport-shell')!;
for(const panel of [characterWindow,inventoryWindow,classicWindow,dialogueElement,document.querySelector<HTMLElement>('#shop-panel')!,document.querySelector<HTMLElement>('#repair-panel')!,document.querySelector<HTMLElement>('#storage-panel')!])makeClassicWindowDraggable(panel,classicSurface);
const classicWindowSources=[
 {id:'quest',label:'任务日志',node:document.querySelector<HTMLElement>('#quest-panel')!},
 {id:'targets',label:'附近目标与 NPC',node:document.querySelector<HTMLElement>('#nearby-targets')!.parentElement as HTMLElement},
 {id:'ground',label:'地面物品',node:document.querySelector<HTMLElement>('#ground-items')!.parentElement as HTMLElement},
 {id:'chat',label:'聊天',node:chatPanel},
 {id:'group',label:'队伍',node:document.querySelector<HTMLElement>('#group-panel')!},
 {id:'attack',label:'攻击模式',node:document.querySelector<HTMLElement>('#attack-mode-panel')!},
 {id:'guild',label:'行会',node:document.querySelector<HTMLElement>('#guild-panel')!},
 {id:'trade',label:'玩家交易',node:document.querySelector<HTMLElement>('#trade-panel')!},
];
const hudChat=document.querySelector<HTMLElement>('[data-hud-chat]')!;
for(const source of classicWindowSources){source.node.hidden=source.id!=='chat';if(source.id!=='chat')classicWindowBody.append(source.node);}
hudChat.append(chatPanel);
function dockChat(){if(chatPanel.parentElement!==hudChat)hudChat.append(chatPanel);chatPanel.hidden=false;}
function setCharacterPage(page:'paperdoll'|'status'|'state'|'skills'){
 hideClassicWindows('character');
 characterWindow.hidden=false;classicHud.skinWindow(characterWindow,'character');
 characterWindow.querySelectorAll<HTMLElement>('[data-character-page]').forEach(node=>node.hidden=node.dataset.characterPage!==page);
 document.querySelector<HTMLElement>('#equipment-items')!.hidden=page!=='paperdoll';
 document.querySelector<HTMLElement>('#paperdoll-actor')!.hidden=page!=='paperdoll';
 characterWindow.querySelectorAll<HTMLButtonElement>('[data-character-tab]').forEach(button=>button.classList.toggle('active',button.dataset.characterTab===page));
}
function hideClassicWindows(except:'character'|'inventory'|'classic'|undefined=undefined){
 if(except!=='character')characterWindow.hidden=true;
 if(except!=='inventory')inventoryWindow.hidden=true;
 if(except!=='classic'){classicWindow.hidden=true;dockChat();}
}
function toggleClassicWindow(id:string){
 if(id==='character'||id==='equipment'){
  if(!characterWindow.hidden&&(id==='character'||id==='equipment')){characterWindow.hidden=true;return;}
  setCharacterPage('paperdoll');return;
 }
 if(id==='skills'){setCharacterPage('skills');return;}
 if(id==='inventory'){
  const open=inventoryWindow.hidden;
  if(open)hideClassicWindows('inventory');
  inventoryWindow.hidden=!open;
  if(open)classicHud.skinWindow(inventoryWindow,'inventory');
  return;
 }
 showClassicWindow(id);
}
function showClassicWindow(id:string){
 const source=classicWindowSources.find(value=>value.id===id);if(!source)return;
 hideClassicWindows('classic');
 if(id==='chat')classicWindowBody.append(chatPanel);else dockChat();
 for(const value of classicWindowSources)if(value.id!=='chat')value.node.hidden=value.node!==source.node;
 source.node.hidden=false;
 classicWindowTitle.textContent=source.label;
 classicWindow.hidden=false;classicHud.skinWindow(classicWindow,id);
 document.querySelectorAll<HTMLButtonElement>('[data-window-tab]').forEach(button=>button.classList.toggle('active',button.dataset.windowTab===id));
}
document.querySelectorAll<HTMLButtonElement>('[data-window-open],[data-window-tab]').forEach(button=>button.addEventListener('click',()=>toggleClassicWindow(button.dataset.windowOpen??button.dataset.windowTab??'')));
document.querySelectorAll<HTMLButtonElement>('[data-window-close]').forEach(button=>button.addEventListener('click',()=>{
 const id=button.dataset.windowClose;
 if(id==='character')characterWindow.hidden=true;
 else if(id==='inventory')inventoryWindow.hidden=true;
}));
document.querySelector<HTMLButtonElement>('#classic-window-close')!.addEventListener('click',()=>{classicWindow.hidden=true;dockChat();});
characterWindow.querySelectorAll<HTMLButtonElement>('[data-character-tab]').forEach(button=>button.addEventListener('click',()=>setCharacterPage((button.dataset.characterTab??'paperdoll') as 'paperdoll'|'status'|'state'|'skills')));
const groundItems=new GroundItems(view.depth,(item:GroundItem)=>{
 ignoreCanvasPointerUntil=performance.now()+100;
 const entity=self===undefined?undefined:entities.get(self);
 if(!entity||socket?.readyState!==WebSocket.OPEN)return;
 if(entity.x!==item.x||entity.y!==item.y){const dx=Math.sign(item.x-entity.x),dy=Math.sign(item.y-entity.y);pursuitGroundItem=item.id;if(sendMovement(entity,dx,dy))connection.textContent=`正在自动接近 ${item.name} · ${item.x}, ${item.y}`;return;}
 pursuitGroundItem=undefined;
 socket.send(JSON.stringify({type:'pickup'}));connection.textContent=`正在拾取 ${item.name}…`;
},document.querySelector<HTMLElement>('#ground-items')!);
const entities=new Map<number,Entity>(),visuals=new Map<number,OnlineActor>();
type PendingAction={actionId:number;kind:'move'|'attack'|'spell';startedAt:number;duration:number;acknowledged:boolean};
let socket:WebSocket|undefined,self:number|undefined,lastSequence=0,mapGeneration=0,currentMap='0',pending:MovementStep|undefined,pendingAction:PendingAction|undefined,nextActionId=1,doorRetry:{x:number;y:number;direction:number;run:boolean}|undefined,held:HeldMovement|undefined,rightPointer:{pointerId:number;clientX:number;clientY:number;direction?:number}|undefined,clickDestination:{x:number;y:number;run:boolean}|undefined,combatTimer:number|undefined,pursuitTarget:number|undefined,pursuitHarvest=false,pursuitRejectedCells=new Set<string>(),pursuitGroundItem:number|undefined,combatTarget:number|undefined,worldReady=true,initialSelfPending=true,reconnectTimer:number|undefined,reconnectAttempts=0,reconnectEnabled=false;
let mapReady:Promise<void>=Promise.resolve();
type Credentials={account:string;password:string};
let credentials:Credentials|undefined,selectedCharacter:string|undefined;
const agentObserver=new AgentObserver(agentObservationEnabled(location.href));
function agentSnapshot(){
 const entity=self===undefined?undefined:entities.get(self),visual=self===undefined?undefined:visuals.get(self),visualState=visual?.debugState();
 const nearby=entity?[...entities.values()].filter(value=>!value.self).map(value=>({...value,distance:Math.max(Math.abs(value.x-entity.x),Math.abs(value.y-entity.y))})).filter(value=>value.distance<=12).sort((left,right)=>left.distance-right.distance||left.id-right.id):[];
 const occupied=new Set([...entities.values()].filter(value=>!value.self&&!value.dead).map(value=>`${value.x},${value.y}`));
 const directionsAvailable=entity?directions.map(([dx,dy],direction)=>{
  let clearSteps=0;
  for(let step=1;step<=4;step++){const x=entity.x+dx*step,y=entity.y+dy*step;if(view.isWalkable(x,y)!==true||occupied.has(`${x},${y}`))break;clearSteps=step;}
  return {direction,dx,dy,clearSteps};
 }):[];
 return {
  now:performance.now(),visibility:document.visibilityState,hasFocus:document.hasFocus(),
  inWorld:document.body.classList.contains('in-world'),authScene:document.querySelector<HTMLElement>('#auth-overlay')?.dataset.authScene,
  connection:connection.textContent,map:currentMap,mapGeneration,lastSequence,worldReady,
  self:entity?{id:entity.id,name:entity.name,x:entity.x,y:entity.y,direction:entity.direction,action:entity.action,dead:Boolean(entity.dead),hp:entity.hp,maxHp:entity.maxHp}:undefined,
  confirmedCell:pending?{x:pending.acknowledged?pending.x:pending.fromX,y:pending.acknowledged?pending.y:pending.fromY}:{x:entity?.x,y:entity?.y},
  render:visualState?{...visualState,grid:{x:visualState.pixel.x/48,y:visualState.pixel.y/32},screen:{x:visualState.pixel.x+view.app.stage.position.x,y:visualState.pixel.y+view.app.stage.position.y}}:undefined,
  camera:{x:view.app.stage.position.x,y:view.app.stage.position.y},pending:pending?{...pending}:undefined,pendingAction:pendingAction?{...pendingAction}:undefined,
  intentions:{held:held?{...held}:undefined,rightPointer:Boolean(rightPointer),clickDestination:clickDestination?{...clickDestination}:undefined,pursuitTarget,pursuitHarvest,pursuitGroundItem,combatTarget},
  attributes:characterPanel.debugState(),inventory:inventory.debugState(),equipment:equipment.debugState(),paperdoll:paperdoll.debugState(),groundItems:groundItems.debugState(),skills:skillBar.debugState(),minimap:minimap.debugState(),
  dialogue:{visible:!dialogueElement.hidden,npc:dialogueTitle.textContent,text:dialogueText.textContent,options:Array.from(dialogueOptions.querySelectorAll<HTMLButtonElement>('button')).map(button=>({text:button.textContent,command:button.dataset.dialogueCommand}))},
  combatStatus:combatStatus.textContent,nearby, directions:directionsAvailable,entityCount:entities.size,
 };
}
agentObserver.attach(window as Window&{__mir2Agent?:AgentDebugApi},agentSnapshot);
function appendChat(channel:string,text:string){const line=document.createElement('li');line.dataset.channel=channel;const labels:Record<string,string>={local:'附近',group:'组队',shout:'喊话',whisper:'私聊',guild:'行会',system:'系统'};line.textContent=`[${labels[channel]??channel}] ${text}`;chatLog.append(line);while(chatLog.children.length>100)chatLog.firstElementChild?.remove();chatLog.scrollTop=chatLog.scrollHeight;}
function clearWorld(preserveCharacter=false){magicEffects.clear();for(const visual of visuals.values())visual.destroy();visuals.clear();entities.clear();groundItems.clear();self=undefined;pending=undefined;pendingAction=undefined;doorRetry=undefined;held=undefined;rightPointer=undefined;clickDestination=undefined;initialSelfPending=true;pursuitTarget=undefined;pursuitHarvest=false;pursuitRejectedCells.clear();pursuitGroundItem=undefined;combatTarget=undefined;selectedMagic=undefined;groupEnabled=false;groupMemberNames=[];attackMode=0;guildName='';guildRankName='';guildNotice='';guildWarGuildNames=[];guildWarTimers=[];guildWarReceivedAt=0;guildAllyGuildNames=[];guildMemberNames=[];guildRanks=[];castleWarStatus=undefined;dialogueNpcId=undefined;classicWindow.hidden=true;dockChat();characterWindow.hidden=true;inventoryWindow.hidden=true;renderGroup();renderAttackMode();renderGuild();clearTrade();if(combatTimer!==undefined)clearTimeout(combatTimer);combatTimer=undefined;if(!preserveCharacter){inventory.clear();equipment.clear();paperdoll.clear();characterPanel.clear();skillBar.clear();classicHud.clear();}dialogueElement.hidden=true;revivePanel.hidden=true;returnToTown.disabled=false;shop.clear();storage.clear();repair.clear();renderTargets();refreshMiniMapMarkers();}
function update(entity:Entity,movementStart?:number){entities.set(entity.id,entity);let visual=visuals.get(entity.id);if(!visual){visual=new OnlineActor(entity,interact);visuals.set(entity.id,visual);view.depth.addChild(visual.container);}visual.update(entity,movementStart);if(entity.self)paperdoll.setFeature(entity.feature);renderTargets();refreshMiniMapMarkers();}
function refreshMiniMapMarkers(){
 const markers:MiniMapMarker[]=[...entities.values()].map(entity=>{const race=entity.feature&255;return {id:`entity-${entity.id}`,x:entity.x,y:entity.y,kind:entity.self?'self':race===50?'npc':race===0?'player':'monster'} as MiniMapMarker;});
 for(const item of groundItems.debugState())markers.push({id:`drop-${item.id}`,x:item.x,y:item.y,kind:'drop'});
 minimap.setMarkers(markers);
}
function createAction(kind:'move'|'attack'|'spell',startedAt=performance.now(),duration=MOVEMENT_DURATION_MS){
 const action={actionId:nextActionId++,kind,startedAt,duration,acknowledged:false};pendingAction=action;agentObserver.event('action-start',{...action});return action;
}
function overlap(left:{x:number;y:number;width:number;height:number},right:{x:number;y:number;width:number;height:number}){return left.x<right.x+right.width&&left.x+left.width>right.x&&left.y<right.y+right.height&&left.y+left.height>right.y;}
function layoutActorLabels(){
 const placed:{x:number;y:number;width:number;height:number}[]=[];
 const actors=[...visuals.entries()].map(([id,visual])=>({entity:entities.get(id),visual})).filter((entry):entry is {entity:Entity;visual:OnlineActor}=>Boolean(entry.entity?.name)).sort((left,right)=>Number(right.entity.self)-Number(left.entity.self)||left.entity.y-right.entity.y||left.entity.x-right.entity.x||left.entity.id-right.entity.id);
 for(const {visual} of actors){
  let offset=0;
  for(let level=0;level<8;level++){
   visual.setLabelOffset(offset);
   const bounds=visual.labelBounds();
   if(!placed.some(previous=>overlap(bounds,previous))){placed.push(bounds);break;}
   offset-=14;
  }
 }
}
function renderTargets(){
 targetsElement.replaceChildren();const actor=self===undefined?undefined:entities.get(self);if(!actor){targetsElement.textContent='等待附近对象…';return;}
 const targets=[...entities.values()].filter(entity=>{const race=entity.feature&255;return !entity.self&&(race!==0||Boolean(entity.name));}).map(entity=>({entity,distance:Math.max(Math.abs(entity.x-actor.x),Math.abs(entity.y-actor.y))})).filter(value=>value.distance<=8).sort((a,b)=>a.distance-b.distance||a.entity.id-b.entity.id);
 if(!targets.length){targetsElement.textContent='附近没有可交互对象';return;}
 for(const {entity,distance} of targets){const button=document.createElement('button');button.type='button';button.dataset.entityId=String(entity.id);const race=entity.feature&255,npc=race===50,player=race===0,slave=entity.kind==='slave'||entity.nameColor===254,health=entity.hp===undefined?'':` · ${entity.hp}/${entity.maxHp} HP`;button.textContent=`${slave?'召唤 · ':''}${entity.name||(npc?'NPC':'怪物')} · ${entity.x},${entity.y} · ${distance} 格${health} · ${npc?(distance===1?'对话':'接近'):player?(distance===1?'PK/行会战':'接近'):entity.dead?'Alt+左键挖肉':distance===1?'攻击':'接近'}`;button.onclick=event=>interact(entities.get(entity.id)??entity,requestsHarvest(event));targetsElement.append(button);}
}
function clickPath(actor:Entity,destination:{x:number;y:number}){
 const start={x:actor.x,y:actor.y},goal={x:Math.round(destination.x),y:Math.round(destination.y)};
 if(start.x===goal.x&&start.y===goal.y)return [];
 // A click can land on a closed door. Keep the direct request in that case
 // so the server can emit its door state and the normal retry path can run.
 if(view.isWalkable(goal.x,goal.y)===false)return undefined;
 const key=(point:{x:number;y:number})=>`${point.x},${point.y}`;
 const occupied=new Set([...entities.values()].filter(entity=>!entity.self&&!entity.dead).map(entity=>key(entity)));
 return findGridPath(start,goal,(x,y)=>view.isWalkable(x,y)===true,(x,y)=>occupied.has(`${x},${y}`));
}
function targetApproachStep(actor:Entity,target:Entity){
 const occupied=new Set([...entities.values()].filter(entity=>!entity.self).map(entity=>`${entity.x},${entity.y}`));
 for(const cell of pursuitRejectedCells)occupied.add(cell);
 let best:{x:number;y:number}[]|undefined;
 for(const [dx,dy] of directions){
  const goal={x:target.x+dx,y:target.y+dy},key=`${goal.x},${goal.y}`;
  if(pursuitRejectedCells.has(key)||view.isWalkable(goal.x,goal.y)!==true||occupied.has(key))continue;
  const path=findGridPath(actor,goal,(x,y)=>view.isWalkable(x,y)===true,(x,y)=>occupied.has(`${x},${y}`));
  if(path&&path.length&&(!best||path.length<best.length))best=path;
 }
 return best?.[0];
}
function sendMovement(actor:Entity,dx:number,dy:number,run=false,distanceOverride?:number){
 if(actor.dead||pendingAction||socket?.readyState!==WebSocket.OPEN)return false;const direction=directionIndex(dx,dy);if(direction<0)return false;
 const distance=distanceOverride??(run?2:1),startedAt=performance.now(),action=createAction('move',startedAt);
 pending={...action,fromX:actor.x,fromY:actor.y,x:actor.x+dx*distance,y:actor.y+dy*distance,direction,run,startedAt,acknowledged:false};
 agentObserver.event('movement-start',{...pending});
 update({...actor,x:pending.x,y:pending.y,direction,action:run?'running':'walking'},startedAt);
 view.moveCenter(pending.x,pending.y,MOVEMENT_DURATION_MS,startedAt);
 socket.send(JSON.stringify({type:'move',mapGeneration,...pending}));return true;
}
function continueHeld(){if(!held||pendingAction)return;const actor=self===undefined?undefined:entities.get(self);if(actor)sendMovement(actor,held.dx,held.dy,held.run);}
function continuePointerRun(){
 if(!rightPointer||pendingAction)return;
 const actor=self===undefined?undefined:entities.get(self);
 if(!actor||actor.dead)return;
 const rect=view.app.canvas.getBoundingClientRect();
 const stageX=(rightPointer.clientX-rect.left)*800/rect.width,stageY=(rightPointer.clientY-rect.top)*600/rect.height;
 const direction=screenDirection(stageX-400,stageY-300,rightPointer.direction);if(direction===undefined)return;
 rightPointer.direction=direction;const [dx,dy]=directions[direction];
 if(sendMovement(actor,dx,dy,true,2))connection.textContent=`正在持续跑步 · ${actor.x+dx*2}, ${actor.y+dy*2}…`;
}
function continueClickDestination(){
 if(!clickDestination||pendingAction)return;
 const actor=self===undefined?undefined:entities.get(self);
 if(!actor||actor.dead){clickDestination=undefined;return;}
 const path=clickPath(actor,clickDestination);
 if(path===undefined){
  const dx=Math.sign(clickDestination.x-actor.x),dy=Math.sign(clickDestination.y-actor.y),distance=Math.max(Math.abs(clickDestination.x-actor.x),Math.abs(clickDestination.y-actor.y));
  if(!dx&&!dy){clickDestination=undefined;return;}
  const running=clickDestination.run&&distance>=2;
  if(sendMovement(actor,dx,dy,running,running?2:1))connection.textContent=`正在${running?'跑向':'走向'} ${clickDestination.x}, ${clickDestination.y}…`;
  return;
 }
 if(!path.length){clickDestination=undefined;return;}
 const first=path[0],dx=Math.sign(first.x-actor.x),dy=Math.sign(first.y-actor.y);
 const second=path[1],canRun=clickDestination.run&&second!==undefined&&second.x===actor.x+dx*2&&second.y===actor.y+dy*2;
 if(sendMovement(actor,dx,dy,canRun,canRun?2:1))connection.textContent=`正在${canRun?'跑向':'走向'} ${clickDestination.x}, ${clickDestination.y}…`;
}
function startMapRoute(point:{x:number;y:number},run:boolean){
 const actor=self===undefined?undefined:entities.get(self);
 if(!actor||actor.dead||socket?.readyState!==WebSocket.OPEN)return;
 rightPointer=undefined;stopCombat();doorRetry=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;held=undefined;
 clickDestination={x:point.x,y:point.y,run};connection.textContent=`地图寻路 · ${point.x}, ${point.y}`;agentObserver.event('minimap-route',{...point,run});continueClickDestination();
}
function continuePursuit(){
 if(pursuitTarget===undefined||pendingAction)return;
 const target=entities.get(pursuitTarget),actor=self===undefined?undefined:entities.get(self);
 if(!target||target.self||!actor||actor.dead){pursuitTarget=undefined;pursuitHarvest=false;return;}
 interact(target,pursuitHarvest);
}
function continueGroundPursuit(){
 if(pursuitGroundItem===undefined||pendingAction)return;
 const item=groundItems.get(pursuitGroundItem),actor=self===undefined?undefined:entities.get(self);
 if(!item||!actor||actor.dead){pursuitGroundItem=undefined;return;}
 const dx=Math.sign(item.x-actor.x),dy=Math.sign(item.y-actor.y);
 if(dx===0&&dy===0){pursuitGroundItem=undefined;socket?.send(JSON.stringify({type:'pickup'}));connection.textContent=`正在拾取 ${item.name}…`;return;}
 if(sendMovement(actor,dx,dy))connection.textContent=`正在自动接近 ${item.name} · ${item.x}, ${item.y}`;else if(!pendingAction)pursuitGroundItem=undefined;
}
function continueMovementIntent(){continueHeld();continuePointerRun();continueClickDestination();continuePursuit();continueGroundPursuit();}
function finishMovement(time:number){
 if(!pending||!movementCanFinish(pending,time))return;
 const completed=pending;pending=undefined;if(pendingAction?.actionId===completed.actionId)pendingAction=undefined;agentObserver.event('action-finish',{actionId:completed.actionId,kind:'move',x:completed.x,y:completed.y,elapsedMs:time-completed.startedAt});
 const actor=self===undefined?undefined:entities.get(self);if(actor)update({...actor,action:'standing'});
 continueMovementIntent();
}
function finishNonMovementAction(time:number){
 if(!pendingAction||pendingAction.kind==='move'||!pendingAction.acknowledged||time<pendingAction.startedAt+pendingAction.duration)return;
 const completed=pendingAction;pendingAction=undefined;agentObserver.event('action-finish',{actionId:completed.actionId,kind:completed.kind,elapsedMs:time-completed.startedAt});continueMovementIntent();
}
function stopCombat(){combatTarget=undefined;if(combatTimer!==undefined){clearTimeout(combatTimer);combatTimer=undefined;}}
function scheduleCombat(){if(combatTimer===undefined)combatTimer=window.setTimeout(()=>{combatTimer=undefined;continueCombat();},620);}
function continueCombat(){
 if(combatTarget===undefined)return;
 const target=entities.get(combatTarget),actor=self===undefined?undefined:entities.get(self);
 if(!target||target.dead||(target.hp!==undefined&&target.hp<=0)||!actor||actor.dead||socket?.readyState!==WebSocket.OPEN){stopCombat();return;}
 const dx=Math.sign(target.x-actor.x),dy=Math.sign(target.y-actor.y),distance=Math.max(Math.abs(target.x-actor.x),Math.abs(target.y-actor.y));
 if(distance>1){const id=target.id;combatTarget=undefined;pursuitTarget=id;pursuitHarvest=false;interact(target);return;}
 if(distance!==1){stopCombat();return;}
 const direction=directions.findIndex(([x,y])=>x===dx&&y===dy);if(direction<0){stopCombat();return;}
 if(pendingAction){scheduleCombat();return;}
 if(performance.now()-lastAttack<550){scheduleCombat();return;}
 lastAttack=performance.now();const action=createAction('attack');socket.send(JSON.stringify({type:'attack',direction,actionId:action.actionId,mapGeneration}));audio.play('swing');update({...actor,direction,action:'attack'});connection.textContent=`攻击 ${target.name}`;scheduleCombat();
}
function interact(target:Entity,harvest=false){
 ignoreCanvasPointerUntil=performance.now()+100;
 stopCombat();pursuitGroundItem=undefined;const actor=self===undefined?undefined:entities.get(self);if(!actor||actor.dead||target.self||socket?.readyState!==WebSocket.OPEN)return;
 if(selectedMagic&&(target.feature&255)!==50){if(pendingAction){connection.textContent='当前动作完成后再施放技能';return;}pursuitTarget=undefined;pursuitHarvest=false;const distance=Math.max(Math.abs(target.x-actor.x),Math.abs(target.y-actor.y));if(distance>8){connection.textContent=`${target.name||'目标'} 超出施法距离`;return;}const skill=selectedMagic;selectedMagic=undefined;skillBar.setPending(skill.magicId);const action=createAction('spell');socket.send(JSON.stringify({type:'castMagic',magicId:skill.magicId,targetId:target.id,actionId:action.actionId,mapGeneration}));update({...actor,direction:directions.findIndex(([x,y])=>x===Math.sign(target.x-actor.x)&&y===Math.sign(target.y-actor.y)),action:'spell'});connection.textContent=`正在对 ${target.name||'目标'} 施放 ${skill.name}…`;return;}
 const race=target.feature&255,player=race===0&&Boolean(target.name);if(race===0&&!player){pursuitTarget=undefined;pursuitHarvest=false;connection.textContent=`${target.name||'该对象'} 暂不支持交互`;return;}
 if(target.dead&&!harvest){pursuitTarget=undefined;pursuitHarvest=false;pursuitRejectedCells.clear();connection.textContent='按住 Alt 并左键点击尸体挖肉';return;}
 const dx=Math.sign(target.x-actor.x),dy=Math.sign(target.y-actor.y),distance=Math.max(Math.abs(target.x-actor.x),Math.abs(target.y-actor.y));
 if(distance>1){
  held=undefined;clickDestination=undefined;if(pursuitTarget!==target.id)pursuitRejectedCells.clear();pursuitTarget=target.id;pursuitHarvest=Boolean(target.dead&&harvest);
  const step=targetApproachStep(actor,target);
  if(step&&sendMovement(actor,step.x-actor.x,step.y-actor.y))connection.textContent=`正在自动接近 ${target.name||'目标'}…`;
  else{pursuitTarget=undefined;pursuitHarvest=false;pursuitRejectedCells.clear();connection.textContent=`无法接近 ${target.name||'目标'}`;}
  return;
 }
 if(distance!==1)return;
 pursuitTarget=undefined;pursuitHarvest=false;pursuitRejectedCells.clear();
 if(race===50){socket.send(JSON.stringify({type:'npc',targetId:target.id}));connection.textContent=`正在与 ${target.name} 交谈…`;return;}
 const direction=directions.findIndex(([x,y])=>x===dx&&y===dy);if(direction<0)return;
 if(target.dead&&harvest){socket.send(JSON.stringify({type:'butch',targetId:target.id}));update({...actor,direction,action:'harvest'});connection.textContent=`正在挖取 ${target.name}…`;return;}
 combatTarget=target.id;continueCombat();
}
view.app.ticker.add(()=>{const time=performance.now();for(const visual of visuals.values())visual.tick(time);finishMovement(time);finishNonMovementAction(time);if(pendingAction&&time-pendingAction.startedAt>5000){connection.textContent='动作确认超时，正在重新同步位置…';socket?.close();}layoutActorLabels();});
function scheduleReconnect(){
 if(!reconnectEnabled||reconnectTimer!==undefined||!credentials)return;
 if(reconnectAttempts>=5){reconnectEnabled=false;document.body.classList.remove('in-world');classicAuth.showLogin();connection.textContent='自动重连失败，请重新登录';return;}
 const attempt=reconnectAttempts++,delay=Math.min(8000,500*2**attempt);
 connection.textContent=`连接已断开，${Math.ceil(delay/1000)} 秒后自动重连 (${attempt+1}/5)…`;
 reconnectTimer=window.setTimeout(()=>{reconnectTimer=undefined;const saved=credentials;connect('login',selectedCharacter,saved,true);},delay);
}
function connect(intent:'login'|'register',resumeCharacter?:string,supplied?:Credentials,automatic=false){
 if(reconnectTimer!==undefined){clearTimeout(reconnectTimer);reconnectTimer=undefined;}
 if(!automatic){reconnectEnabled=true;reconnectAttempts=0;selectedCharacter=resumeCharacter;}
 socket?.close();clearWorld();lastSequence=0;mapGeneration=0;currentMap='0';mapReady=Promise.resolve();
 const account=supplied?.account??document.querySelector<HTMLInputElement>('#account')!.value,password=supplied?.password??document.querySelector<HTMLInputElement>('#password')!.value;
 credentials={account,password};
 const active=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);socket=active;connection.textContent='正在登录…';
 active.addEventListener('message',event=>{
  if(socket!==active)return;const envelope=JSON.parse(event.data),message=envelope.message;
  if(envelope.sequence<=lastSequence)return;lastSequence=envelope.sequence;
  if(envelope.mapGeneration<mapGeneration)return;
  agentObserver.event('gateway-in',{sequence:envelope.sequence,mapGeneration:envelope.mapGeneration,type:message.type,actionId:message.actionId,kind:message.kind,accepted:message.accepted,x:message.x,y:message.y,direction:message.direction,reason:message.reason,id:message.id,self:message.self,action:message.action,map:message.map,name:message.name,npcName:message.npcName,makeIndex:message.makeIndex,total:message.total,gained:message.gained,level:message.level,hp:message.hp,maxHp:message.maxHp});
  if(message.type==='connected'){active.send(JSON.stringify({type:intent,account,password}));document.querySelector<HTMLInputElement>('#password')!.value='';connection.textContent=intent==='register'?'正在创建账号…':'正在登录…';}
  else if(message.type==='registrationResult'){
   if(message.accepted){connection.textContent='账号创建成功，正在登录…';active.send(JSON.stringify({type:'login',account,password}));}
   else connection.textContent=message.reason===0?'该账号已经存在':`账号创建失败 (${message.reason})`;
  }
  else if(message.type==='characters'){
   reconnectAttempts=0;
   const list=message.characters as SelectCharacter[];
   for(const candidate of list)void preloadPlayerLocomotion(((candidate.sex&1)<<24)|((candidate.hair??0)<<16));
   const enter=(name:string)=>{selectedCharacter=name;loadQuest();active.send(JSON.stringify({type:'selectCharacter',name}));connection.textContent='正在进入比奇…';};
   const resumed=resumeCharacter===undefined?undefined:list.find(candidate=>candidate.name===resumeCharacter);
   if(resumed){enter(resumed.name);connection.textContent='正在返回安全区…';return;}
   classicAuth.showSelect(list,{
    start:enter,
    create:()=>classicAuth.showCreate(),
    exit:()=>{reconnectEnabled=false;active.close();classicAuth.showLogin();connection.textContent='已返回登录';}
   });
   connection.textContent=list.length?'选择角色后点击开始游戏':'当前账号没有角色，请创建战士、法师或道士。';
  }
  else if(message.type==='characterCreationResult')connection.textContent=message.accepted?`角色 ${message.name} 创建成功，请选择角色`:`角色创建失败 (${message.reason})`;
  else if(message.type==='map'){
   reconnectAttempts=0;
   classicAuth.hide();document.body.classList.add('in-world');
   doorRetry=undefined;currentMap=message.map;
   clearWorld(true);worldReady=false;mapGeneration=envelope.mapGeneration;classicHud.position(message.map,0,0);connection.textContent=`正在载入地图 ${message.map}…`;
   mapReady=view.setMap(message.map).then(()=>minimap.setMap(message.map,view.width,view.height)).then(()=>{worldReady=true;}).catch(error=>{
    const detail=error instanceof Error?error.message:`地图 ${message.map} 载入失败`;
    console.error('地图载入失败',message.map,error);
    connection.textContent=detail;
    worldReady=true;
  });
  }
  else if(message.type==='entity'){
   const prior=entities.get(message.id);const entity={...prior,...message,name:message.name??prior?.name??'',feature:message.feature??prior?.feature??0,self:message.self||prior?.self||false,kind:message.kind??prior?.kind} as Entity;
   update(entity);if(entity.self){self=entity.id;classicHud.position(currentMap,entity.x,entity.y);minimap.setPosition(entity.x,entity.y);refreshMiniMapMarkers();if(initialSelfPending){initialSelfPending=false;void mapReady.then(()=>{const current=entities.get(entity.id);if(current)void view.setCenter(current.x,current.y);});}else if(entity.action==='walking'||entity.action==='running')view.moveCenter(entity.x,entity.y,MOVEMENT_DURATION_MS);connection.textContent=`已连接 · ${entity.name} · ${entity.x}, ${entity.y}`;}if(message.self&&mapGeneration===1)active.send(JSON.stringify({type:'inventory'}));
  }
  else if(message.type==='appearance'||message.type==='entityName'||message.type==='nameColor'||message.type==='entityDied'||message.type==='entityAlive'){
   const entity=entities.get(message.id);if(entity){const next={...entity,...(message.type==='appearance'?{feature:message.feature}:message.type==='entityName'?{name:message.name,nameColor:message.nameColor??entity.nameColor,kind:message.kind??entity.kind}:message.type==='nameColor'?{nameColor:message.color,kind:message.color===254?'slave':entity.kind}:message.type==='entityAlive'?{dead:false,action:'standing',x:message.x,y:message.y,direction:message.direction}:{dead:true,action:'dying',x:message.x,y:message.y,direction:message.direction,hp:0})};update(next);if(message.type==='entityDied'&&combatTarget===message.id)stopCombat();if(message.type==='entityDied'&&entity.self){held=undefined;pending=undefined;pendingAction=undefined;stopCombat();characterPanel.resources({hp:0});revivePanel.hidden=false;connection.textContent='角色已死亡';combatStatus.textContent='等待回城复活';}}
  }
  else if(message.type==='entityAction'){const entity=entities.get(message.id);if(entity){update({...entity,x:message.x,y:message.y,direction:message.direction,action:message.action});if(message.action==='attack'&&!entity.self&&((entity.feature>>>16)&0xffff)===20)audio.play('skeletonAttack');}}
  else if(message.type==='health'){const entity=entities.get(message.id);if(entity){update({...entity,hp:message.hp,maxHp:message.maxHp,action:entity.dead?'dead':'struck'});if(message.damage>0)audio.play('struck');if(entity.self)characterPanel.resources({hp:message.hp,maxHp:message.maxHp});if(combatTarget===message.id&&message.hp<=0)stopCombat();combatStatus.textContent=`${entity.name||'目标'} ${message.hp}/${message.maxHp} HP`;}}
  else if(message.type==='attributes'){characterPanel.replace(message);classicHud.replaceAttributes(message);inventory.currency(message.gold);const entity=self===undefined?undefined:entities.get(self);if(entity)update({...entity,hp:message.hp,maxHp:message.maxHp});}
  else if(message.type==='resources'){const entity=entities.get(message.id);if(entity){update({...entity,hp:message.hp,maxHp:message.maxHp});if(entity.self){characterPanel.resources({hp:message.hp,mp:message.mp,maxHp:message.maxHp});classicHud.resource({hp:message.hp,mp:message.mp,maxHp:message.maxHp});}}}
  else if(message.type==='characterStatus'){const entity=entities.get(message.id);if(entity)update({...entity,status:message.status,hitSpeed:message.hitSpeed});if(self===message.id)classicHud.status(message.status);}
  else if(message.type==='myStatus')classicHud.hungerStatus(message.status);
  else if(message.type==='weights')characterPanel.weights(message);
  else if(message.type==='currency')updateCurrency(message);
  else if(message.type==='levelUp'){audio.play('levelUp',.45);characterPanel.level(message.level,message.experience);classicHud.level(message.level,message.experience);combatStatus.textContent=`升级至 ${message.level} 级`;}
  else if(message.type==='experience'){characterPanel.experience(message.total);classicHud.experience(message.total);combatStatus.textContent=`经验 +${message.gained} · 当前 ${message.total}`;}
  else if(message.type==='skills'){skillBar.replace(message.skills);classicHud.replaceSkills(message.skills);}
  else if(message.type==='skillAdded'){skillBar.add(message.skill);classicHud.addSkill(message.skill);connection.textContent=`学会 ${message.skill.name}`;}
  else if(message.type==='skillRemoved'){skillBar.remove(message.magicId);classicHud.removeSkill(message.magicId);}
  else if(message.type==='skillProgress'){skillBar.progress(message.magicId,message.level,message.currentTrain);classicHud.progress(message.magicId,message.level,message.currentTrain);}
  else if(message.type==='spellResult'){skillBar.resolve();connection.textContent=message.accepted?`${message.name} 已由服务端接受`:`${message.name} 施放失败`;}
  else if(message.type==='warriorSkill'){const parts=[message.thrusting===true?'刺杀开启':message.thrusting===false?'刺杀关闭':'',message.halfMoon===true?'半月开启':message.halfMoon===false?'半月关闭':'',message.fireHit?'烈火蓄力':''].filter(Boolean);if(parts.length)combatStatus.textContent=parts.join(' · ');}
  else if(message.type==='magicEffect'){const caster=entities.get(message.casterId);if(caster)update({...caster,action:'spell'});magicEffects.resolve(message);combatStatus.textContent=`魔法效果 ${message.effectType}/${message.effect} · ${message.x},${message.y}`;}
  else if(message.type==='spellCast'){const caster=entities.get(message.casterId);if(caster)update({...caster,x:message.x,y:message.y,action:'spell'});magicEffects.cast(message.casterId,message.magicId);}
  else if(message.type==='magicFailed'){skillBar.resolve();combatStatus.textContent='魔法未产生效果';}
  else if(message.type==='groupMode'){groupEnabled=message.enabled;renderGroup();connection.textContent=message.enabled?'已允许其他玩家组队':'已关闭组队邀请';}
  else if(message.type==='attackMode'){attackMode=message.mode;renderAttackMode();connection.textContent=`攻击模式：${attackModeSelect.selectedOptions[0]?.textContent??'未知'}`;}
  else if(message.type==='guildName'){guildName=message.guildName;guildRankName=message.rankName;renderGuild();}
  else if(message.type==='guildInfo'){guildName=message.guildName;guildNotice=message.notice.join('\n');guildWarGuildNames=[...message.warGuilds];guildWarTimers=Array.isArray(message.warGuildTimers)?message.warGuildTimers.map((value:{name:string;remainingMs:number})=>({name:value.name,remainingMs:value.remainingMs})):[];guildWarReceivedAt=performance.now();guildAllyGuildNames=[...message.allyGuilds];guildMemberNames=[];guildRanks=[];renderGuild();connection.textContent=`行会：${guildName}`;}
  else if(message.type==='guildMembers'){guildMemberNames=[...message.members];guildRanks=message.ranks.map((rank:{rankNo:number;rankName:string;members:string[]})=>({rankNo:rank.rankNo,rankName:rank.rankName,members:[...rank.members]}));renderGuild();connection.textContent=guildMemberNames.length?`行会成员：${guildMemberNames.join('、')}`:'行会暂无成员';}
  else if(message.type==='guildResult'){
   const labels:Record<string,string>={open:'打开行会',add:'邀请入会',remove:'移除成员',rank:'更新封号',ally:'结盟',breakAlly:'解除联盟'};
   const reasons:Record<string,string>={'-1':'已经加入其他行会','-2':'缺少创建费用','-3':'双方掌门人未相邻或无法结盟','-4':'行会名无效或已经存在','-5':'联盟权限未开启','1':'没有使用权限','2':'对象不存在或未面对掌门人','3':'对象已经在本行会','4':'对象已经加入其他行会','5':'对象拒绝加入行会'};
   if(message.action==='open'&&!message.accepted){guildName='';guildRankName='';guildNotice='';guildWarGuildNames=[];guildWarTimers=[];guildAllyGuildNames=[];guildMemberNames=[];guildRanks=[];renderGuild();}
   if(message.action==='create'&&message.accepted){connection.textContent='行会创建成功，正在载入行会资料…';window.setTimeout(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'guildOpen'}));},120);}
   if((message.action==='ally'||message.action==='breakAlly')&&message.accepted&&socket?.readyState===WebSocket.OPEN)window.setTimeout(()=>socket?.send(JSON.stringify({type:'guildOpen'})),120);
   else connection.textContent=message.accepted?`${labels[message.action]??'行会操作'}成功`:`${labels[message.action]??(message.action==='create'?'创建行会':'行会操作')}失败 · ${reasons[String(message.reason)]??(message.action==='open'?'当前角色未加入行会':`原因 ${message.reason}`)}`;
  }
  else if(message.type==='groupMembers'){groupMemberNames=[...message.members];renderGroup();connection.textContent=groupMemberNames.length?`队伍成员：${groupMemberNames.join('、')}`:'队伍已清空';}
  else if(message.type==='groupCancel'){groupEnabled=false;groupMemberNames=[];renderGroup();connection.textContent='队伍已解散';}
  else if(message.type==='groupResult'){
   const labels:Record<string,string>={create:'创建队伍',add:'邀请成员',remove:'移除成员'};
   const reasons:Record<string,string>={'-1':'当前角色不满足组队条件','-2':'角色不存在或不可用','-3':'对方已经加入其他队伍','-4':'对方关闭了组队','-5':'队伍已满'};
   connection.textContent=message.accepted?`${labels[message.action]??'队伍操作'}成功`:`${labels[message.action]??'队伍操作'}失败 · ${reasons[String(message.reason)]??`原因 ${message.reason}`}`;
  }
  else if(message.type==='tradeOpened'){tradeOpen=true;tradeLocal.clear();tradeRemote.clear();tradeGold=0;tradeRemoteGold=0;tradeTarget.value=message.target;tradeGoldInput.value='0';renderTrade();connection.textContent=`已与 ${message.target} 打开交易`;
  }
  else if(message.type==='tradeRemoteItemAdded'){tradeRemote.set(message.item.makeIndex,message.item);renderTrade();}
  else if(message.type==='tradeRemoteItemRemoved'){tradeRemote.delete(message.item.makeIndex);renderTrade();}
  else if(message.type==='tradeRemoteGold'){tradeRemoteGold=message.gold;renderTrade();}
  else if(message.type==='tradeGold'){tradeGold=message.gold;tradeGoldInput.value=String(message.gold);renderTrade();updateCurrency({gold:message.availableGold});connection.textContent=`交易金币已设置为 ${message.gold}`;}
  else if(message.type==='tradeResult'){
   const labels:Record<string,string>={request:'发起交易',add:'放入物品',remove:'取回物品',gold:'设置金币'};
   if(message.action==='add'&&message.accepted&&message.item){tradeLocal.set(message.item.makeIndex,message.item);inventory.resolve(message.item.makeIndex,true,true);}
   if(message.action==='add'&&!message.accepted)inventory.rejectPending();
   if(message.action==='remove'&&message.accepted&&message.item){tradeLocal.delete(message.item.makeIndex);inventory.add(message.item);}
   renderTrade();connection.textContent=message.accepted?`${labels[message.action]??'交易操作'}成功`:`${labels[message.action]??'交易操作'}失败 · 原因 ${message.reason}`;
  }
  else if(message.type==='tradeClosed'){for(const item of tradeLocal.values())inventory.add(item);tradeOpen=false;tradeLocal.clear();tradeRemote.clear();tradeGold=0;tradeRemoteGold=0;renderTrade();updateCurrency({gold:message.gold});connection.textContent='交易已取消，物品和金币已退回';}
  else if(message.type==='tradeSuccess'){tradeOpen=false;tradeLocal.clear();tradeRemote.clear();tradeGold=0;tradeRemoteGold=0;renderTrade();updateCurrency({gold:message.gold});connection.textContent='交易成功';}
  else if(message.type==='door'){
   void view.setDoor(message.x,message.y,message.open);
   if(message.open&&doorRetry&&doorRetry.x===message.x&&doorRetry.y===message.y){
    const retry=doorRetry;doorRetry=undefined;const actor=self===undefined?undefined:entities.get(self);
    if(actor&&!actor.dead&&!pendingAction){const dx=Math.sign(retry.x-actor.x),dy=Math.sign(retry.y-actor.y);if(sendMovement(actor,dx,dy,retry.run))connection.textContent=`门已打开，继续前进 · ${message.x}, ${message.y}`;}
   }else{if(!message.open)clickDestination=undefined;connection.textContent=message.open?`门已打开 · ${message.x}, ${message.y}`:`门已关闭 · ${message.x}, ${message.y}`;}
  }
  else if(message.type==='npcDialogue'&&worldReady){
   if(Array.isArray(message.quests))for(const quest of message.quests)updateQuest(quest as QuestState);else if(message.quest)updateQuest(message.quest as QuestState);
   dialogueNpcId=String(message.npcName).includes('国王')?message.npcId:undefined;renderGuild();
   shop.clear();storage.clear();repair.clear();hideClassicWindows();dialogueElement.hidden=false;classicHud.skinWindow(dialogueElement,'npc');dialogueTitle.textContent=message.npcName;renderDialogueText(message.text);dialogueOptions.replaceChildren();
   for(const option of message.options){if(option.input){const form=document.createElement('form');form.className='dialogue-input';const input=document.createElement('input');input.type='text';input.maxLength=80;input.placeholder=option.text;input.required=true;const button=document.createElement('button');button.type='submit';button.textContent=option.text;button.dataset.dialogueCommand=option.command;form.onsubmit=event=>{event.preventDefault();active.send(JSON.stringify({type:'dialogueSelect',npcId:message.npcId,command:option.command,input:input.value}));};form.append(input,button);dialogueOptions.append(form);}else{const button=document.createElement('button');button.type='button';button.textContent=option.text;button.dataset.dialogueCommand=option.command;button.onclick=()=>active.send(JSON.stringify({type:'dialogueSelect',npcId:message.npcId,command:option.command}));dialogueOptions.append(button);}}
  }
  else if(message.type==='dialogueMessage'&&worldReady){if(Array.isArray(message.quests))for(const quest of message.quests)updateQuest(quest as QuestState);else if(message.quest)updateQuest(message.quest as QuestState);hideClassicWindows();dialogueElement.hidden=false;classicHud.skinWindow(dialogueElement,'npc');renderDialogueText(message.text);dialogueOptions.replaceChildren();}
  else if(message.type==='npcDialogueClosed'){dialogueElement.hidden=true;dialogueNpcId=undefined;renderGuild();shop.clear();storage.clear();repair.clear();}
  else if(message.type==='shop'){dialogueElement.hidden=true;storage.clear();repair.clear();hideClassicWindows();shop.open(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#shop-panel')!,'shop');connection.textContent=`商店已打开 · ${message.items.length} 种商品`;}
  else if(message.type==='shopSell'){dialogueElement.hidden=true;storage.clear();repair.clear();hideClassicWindows();shop.openSell(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#shop-panel')!,'shop');connection.textContent='请选择要出售的背包物品';}
  else if(message.type==='shopDetails'){shop.showDetails(message.npcId,message.items);connection.textContent=`已载入 ${message.items.length} 件具体商品`;}
  else if(message.type==='shopPurchaseResult'){
   shop.resolve(message.name,message.makeIndex,message.accepted);if(message.accepted&&message.gold!==null)updateCurrency({gold:message.gold});
   const reasons:Record<number,string>={1:'商品已售罄',2:'背包空间或负重不足',3:'金币不足',4:'缺少必需物品'};
   connection.textContent=message.accepted?`购买 ${message.name} 成功 · 剩余 ${message.gold} 金币`:`购买失败 · ${reasons[message.reason]??`原因 ${message.reason}`}`;
  }
  else if(message.type==='shopSellQuote'){shop.showSellQuote(message.npcId,message.item,message.price);connection.textContent=message.price>0?`${message.item.name} 可卖 ${message.price} 金币`:`${message.item.name} 无法出售`;}
  else if(message.type==='shopSellResult'){
   shop.resolveSale(message.item,message.accepted);if(message.accepted){inventory.remove(message.item.makeIndex);if(message.gold!==null)updateCurrency({gold:message.gold});}
   connection.textContent=message.accepted?`已卖出 ${message.item.name} · 当前 ${message.gold} 金币`:`出售 ${message.item.name} 失败`;
  }
  else if(message.type==='repairItems'){dialogueElement.hidden=true;shop.clear();storage.clear();hideClassicWindows();repair.open(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#repair-panel')!,'repair');connection.textContent='请选择要修理的背包物品';}
  else if(message.type==='repairQuote'){repair.showQuote(message.npcId,message.item,message.price);connection.textContent=message.price>=0?`${message.item.name} 修理需要 ${message.price} 金币`:`${message.item.name} 无需或无法修理`;}
  else if(message.type==='repairResult'){repair.resolve(message.item,message.accepted);if(message.accepted){inventory.update(message.item);if(message.gold!==null)updateCurrency({gold:message.gold});}connection.textContent=message.accepted?`${message.item.name} 修理完成 · 当前 ${message.gold} 金币`:`${message.item.name} 修理失败`;}
  else if(message.type==='storageDeposit'){dialogueElement.hidden=true;shop.clear();repair.clear();hideClassicWindows();storage.openDeposit(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#storage-panel')!,'storage');connection.textContent='请选择要存入仓库的物品';}
  else if(message.type==='storageItems'){dialogueElement.hidden=true;shop.clear();repair.clear();hideClassicWindows();storage.openItems(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#storage-panel')!,'storage');connection.textContent=`仓库共 ${message.items.length} 件物品`;}
  else if(message.type==='storageResult'){
   storage.resolve(message.item,message.accepted);if(message.accepted&&message.kind==='store')inventory.remove(message.item.makeIndex);
   const reasons:Record<number,string>={1:'服务端拒绝操作',2:'仓库已满',3:'背包空间或负重不足'};connection.textContent=message.accepted?(message.kind==='store'?`已存入 ${message.item.name}`:`已取回 ${message.item.name}`):`仓库操作失败 · ${reasons[message.reason]??`原因 ${message.reason}`}`;
  }
  else if(message.type==='chat')appendChat(message.channel,message.text);
  else if(message.type==='systemMessage'){combatStatus.textContent=message.text;appendChat('system',message.text);if(message.castleWar){castleWarStatus=message.castleWar;renderGuild();}}
  else if(message.type==='entityRemoved'){if(pursuitTarget===message.id){pursuitTarget=undefined;pursuitHarvest=false;}if(combatTarget===message.id)stopCombat();entities.delete(message.id);visuals.get(message.id)?.destroy();visuals.delete(message.id);renderTargets();}
  else if(message.type==='actionResult'){
   if(!pendingAction||message.actionId!==pendingAction.actionId||message.kind!==pendingAction.kind)return;
   if(message.kind==='move'&&!pending){pendingAction=undefined;return;}
   if(message.kind==='move'&&pending){
    const movement=pending;
    if(message.accepted&&message.mapGeneration===mapGeneration&&message.x===movement.x&&message.y===movement.y){
     movement.acknowledged=true;agentObserver.event('action-ack',{actionId:movement.actionId,kind:'move',accepted:true,x:message.x,y:message.y});classicHud.position(view.map,movement.x,movement.y);minimap.setPosition(movement.x,movement.y);audio.play('movement',.22);connection.textContent=`已连接 · ${entities.get(self!)?.name??''} · ${movement.x}, ${movement.y}`;finishMovement(performance.now());
    }else{
     const retryTarget=pursuitTarget,retryHarvest=pursuitHarvest;agentObserver.event('action-rollback',{actionId:movement.actionId,kind:'move',accepted:false,x:message.x,y:message.y,reason:message.reason});pending=undefined;pendingAction=undefined;held=undefined;rightPointer=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;
     const entity=self===undefined?undefined:entities.get(self),x=Number.isInteger(message.x)?message.x:movement.fromX,y=Number.isInteger(message.y)?message.y:movement.fromY;
     if(entity){update({...entity,x,y,action:'standing'});classicHud.position(view.map,x,y);minimap.setPosition(x,y);void view.setCenter(x,y);}
     if(retryTarget!==undefined&&message.reason===28){pursuitRejectedCells.add(`${movement.x},${movement.y}`);pursuitTarget=retryTarget;pursuitHarvest=retryHarvest;connection.textContent='目标移动，正在重新接近…';window.setTimeout(()=>{if(pursuitTarget===retryTarget&&!pendingAction)continuePursuit();},350);}
     else if(message.reason===28&&socket?.readyState===WebSocket.OPEN){const retry={x:movement.x,y:movement.y,direction:movement.direction,run:movement.run};doorRetry=retry;socket.send(JSON.stringify({type:'openDoor',x:movement.x,y:movement.y}));connection.textContent=`尝试打开门 · ${movement.x}, ${movement.y}`;window.setTimeout(()=>{if(doorRetry===retry&&!pendingAction){doorRetry=undefined;clickDestination=undefined;connection.textContent='该方向暂时无法通行';}},350);}else{clickDestination=undefined;connection.textContent='该方向暂时无法通行';}
    }
   }else if(message.accepted){pendingAction.acknowledged=true;agentObserver.event('action-ack',{actionId:pendingAction.actionId,kind:pendingAction.kind,accepted:true});finishNonMovementAction(performance.now());}else{agentObserver.event('action-rollback',{actionId:pendingAction.actionId,kind:pendingAction.kind,accepted:false,reason:message.reason});pendingAction=undefined;continueMovementIntent();}
  }
  else if(message.type==='inventory')inventory.replace(message.items);
  else if(message.type==='equipment')equipment.replace(message.slots);
  else if(message.type==='itemAdded'){inventory.add(message.item);connection.textContent=`获得 ${message.item.name}`;}
  else if(message.type==='itemRemoved')inventory.remove(message.makeIndex);
  else if(message.type==='itemUpdated'){inventory.update(message.item);equipment.update(message.item);}
  else if(message.type==='equipmentDurability'){equipment.set(message.slot,message.item);}
  else if(message.type==='equipmentBroken'){equipment.remove(message.slot);connection.textContent=`${message.item.name} 已损坏`;}
  else if(message.type==='dropResult'){inventory.resolve(message.makeIndex,message.accepted,true);connection.textContent=message.accepted?'物品已落到地面':'服务端拒绝丢弃物品';}
  else if(message.type==='itemActionResult'){
   if(message.kind==='equip'){inventory.resolve(message.makeIndex,message.accepted,true);if(message.accepted)equipment.set(message.slot,message.item);}
   else if(message.kind==='takeoff')equipment.resolve(message.slot,message.accepted);
   else if(message.kind==='use')inventory.resolve(message.makeIndex,message.accepted,true);
   if(message.accepted&&message.feature!==null&&self!==undefined){const actor=entities.get(self);if(actor)update({...actor,feature:message.feature});}
   connection.textContent=message.accepted?message.kind==='equip'?`已装备 ${message.item.name}`:message.kind==='takeoff'?`已卸下 ${message.item.name}`:`已使用 ${message.item.name}`:`物品操作失败 (${message.reason})`;
  }
  else if(message.type==='groundItem'){groundItems.add(message);refreshMiniMapMarkers();connection.textContent=`地面出现 ${message.name} · ${message.x}, ${message.y}`;}
  else if(message.type==='groundItemRemoved'){if(pursuitGroundItem===message.id)pursuitGroundItem=undefined;groundItems.remove(message.id);refreshMiniMapMarkers();}
  else if(message.type==='error'){
   if(message.actionId!==undefined&&pendingAction?.actionId===message.actionId){
    const failed=pendingAction!;pendingAction=undefined;
    if(failed.kind==='move'&&pending){const movement=pending;pending=undefined;held=undefined;rightPointer=undefined;clickDestination=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;const entity=self===undefined?undefined:entities.get(self);if(entity){update({...entity,x:movement.fromX,y:movement.fromY,action:'standing'});classicHud.position(view.map,movement.fromX,movement.fromY);minimap.setPosition(movement.fromX,movement.fromY);void view.setCenter(movement.fromX,movement.fromY);}}
    else continueMovementIntent();
   }
   selectedMagic=undefined;skillBar.resolve();inventory.rejectPending();equipment.rejectPending();connection.textContent=message.message;appendChat('system',`操作失败：${message.message}`);
  }
 });
  active.addEventListener('close',()=>{if(socket!==active)return;pending=undefined;pendingAction=undefined;doorRetry=undefined;held=undefined;rightPointer=undefined;clickDestination=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;stopCombat();if(reconnectEnabled&&credentials){scheduleReconnect();}else{document.body.classList.remove('in-world');classicAuth.showLogin();connection.textContent='连接已断开，请重新登录';}});
 active.addEventListener('error',()=>{if(socket===active)connection.textContent='无法连接游戏网关';});
}
loginForm.addEventListener('submit',event=>{event.preventDefault();connect('login');});
document.querySelector('#register')!.addEventListener('click',()=>connect('register'));
chatChannel.addEventListener('change',()=>{const whisper=chatChannel.value==='whisper';chatTargetWrap.hidden=!whisper;chatTarget.required=whisper;if(whisper)chatTarget.focus();});
chatForm.addEventListener('submit',event=>{event.preventDefault();const text=chatInput.value.trim(),channel=chatChannel.value,target=chatTarget.value.trim();if(!text||!socket||socket.readyState!==WebSocket.OPEN||self===undefined)return;if(channel==='whisper'&&!target)return;socket.send(JSON.stringify({type:'say',channel,target,text}));chatInput.value='';});
groupMode.addEventListener('click',()=>sendGroup('groupMode'));
groupCreate.addEventListener('click',()=>sendGroup('groupCreate'));
groupAdd.addEventListener('click',()=>sendGroup('groupAdd'));
groupRemove.addEventListener('click',()=>sendGroup('groupRemove'));
attackModeSelect.addEventListener('change',()=>{if(socket?.readyState!==WebSocket.OPEN)return;const mode=Number(attackModeSelect.value);if(Number.isInteger(mode)&&mode>=0&&mode<=6)socket.send(JSON.stringify({type:'attackMode',mode}));});
guildOpen.addEventListener('click',()=>sendGuild('guildOpen'));
guildMembersRequest.addEventListener('click',()=>sendGuild('guildMembers'));
guildCreate.addEventListener('click',()=>{if(socket?.readyState!==WebSocket.OPEN||dialogueNpcId===undefined)return;const name=guildNameInput.value.trim();if(!name){connection.textContent='请填写行会名';guildNameInput.focus();return;}socket.send(JSON.stringify({type:'guildCreate',npcId:dialogueNpcId,guildName:name}));connection.textContent=`正在创建行会 ${name}…`;});
guildWarRequest.addEventListener('click',()=>{if(socket?.readyState!==WebSocket.OPEN||dialogueNpcId===undefined)return;const target=guildWarTarget.value.trim();if(!target){connection.textContent='请填写目标行会名';guildWarTarget.focus();return;}socket.send(JSON.stringify({type:'guildWarRequest',npcId:dialogueNpcId,guildName:target}));connection.textContent=`正在向 ${target} 请求行会战…`;});
guildCastleDialogue.addEventListener('click',()=>{if(socket?.readyState!==WebSocket.OPEN||dialogueNpcId===undefined)return;socket.send(JSON.stringify({type:'castleWarDialogue',npcId:dialogueNpcId}));connection.textContent='正在打开攻城申请…';});
guildAdd.addEventListener('click',()=>sendGuild('guildAdd'));
guildRemove.addEventListener('click',()=>sendGuild('guildRemove'));
guildNoticeSave.addEventListener('click',()=>{if(socket?.readyState!==WebSocket.OPEN)return;socket.send(JSON.stringify({type:'guildNotice',notice:guildNoticeInput.value}));connection.textContent='正在保存行会公告…';});
guildAlly.addEventListener('click',()=>{if(socket?.readyState!==WebSocket.OPEN)return;const target=guildAllyTarget.value.trim();if(!target){connection.textContent='请填写联盟对象';guildAllyTarget.focus();return;}socket.send(JSON.stringify({type:'guildAlly',target}));connection.textContent=`正在请求与 ${target} 结盟…`;});
guildBreakAlly.addEventListener('click',()=>{if(socket?.readyState!==WebSocket.OPEN)return;const target=guildAllyTarget.value.trim();if(!target){connection.textContent='请填写联盟对象';guildAllyTarget.focus();return;}socket.send(JSON.stringify({type:'guildBreakAlly',target}));connection.textContent=`正在解除与 ${target} 的联盟…`;});
guildRanksSave.addEventListener('click',()=>{if(socket?.readyState!==WebSocket.OPEN)return;const ranks=[];for(const line of guildRanksInput.value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)){const [rawNo,name,...memberParts]=line.split('|');const no=Number(rawNo),members=(memberParts.join('|').split(',').map(value=>value.trim()).filter(Boolean));if(!Number.isInteger(no)||no<1||no>99||!name||name.includes('<')||name.includes('>')){connection.textContent='封号格式应为：编号|封号|成员1,成员2';return;}ranks.push({no,name,members});}if(!ranks.length){connection.textContent='至少填写一个封号';return;}socket.send(JSON.stringify({type:'guildRanks',ranks}));connection.textContent='正在保存封号配置…';});
tradeRequestForm.addEventListener('submit',event=>{event.preventDefault();if(socket?.readyState!==WebSocket.OPEN)return;const target=tradeTarget.value.trim();if(!target){connection.textContent='请填写交易对象';return;}socket.send(JSON.stringify({type:'tradeRequest',target}));connection.textContent=`正在邀请 ${target} 交易…`;});
tradeSetGold.addEventListener('click',()=>{if(socket?.readyState!==WebSocket.OPEN||!tradeOpen)return;const amount=Math.max(0,Math.floor(Number(tradeGoldInput.value)));if(!Number.isSafeInteger(amount)){connection.textContent='请输入有效金币数量';return;}socket.send(JSON.stringify({type:'tradeGold',amount}));});
tradeAccept.addEventListener('click',()=>{if(socket?.readyState===WebSocket.OPEN&&tradeOpen){socket.send(JSON.stringify({type:'tradeAccept'}));connection.textContent='已确认交易，等待对方确认…';}});
tradeCancel.addEventListener('click',()=>{if(socket?.readyState===WebSocket.OPEN&&tradeOpen){socket.send(JSON.stringify({type:'tradeCancel'}));connection.textContent='正在取消交易…';}});
returnToTown.addEventListener('click',()=>{if(!credentials||!selectedCharacter){connection.textContent='请重新输入密码并登录';return;}returnToTown.disabled=true;connection.textContent='正在保存死亡状态…';const saved=credentials,character=selectedCharacter;window.setTimeout(()=>connect('login',character,saved),1000);});
document.querySelector('#close-dialogue')!.addEventListener('click',()=>dialogueElement.hidden=true);
createCharacterForm.addEventListener('submit',event=>{
 event.preventDefault();if(socket?.readyState!==WebSocket.OPEN)return;
 const name=document.querySelector<HTMLInputElement>('#character-name')!.value,job=Number(document.querySelector<HTMLSelectElement>('#character-job')!.value),sex=Number(document.querySelector<HTMLSelectElement>('#character-sex')!.value),hair=Number(document.querySelector<HTMLSelectElement>('#character-hair')!.value);
 socket.send(JSON.stringify({type:'createCharacter',name,job,sex,hair}));connection.textContent=`正在创建 ${name}…`;
});
view.app.canvas.addEventListener('contextmenu',event=>event.preventDefault());
view.app.canvas.addEventListener('pointerdown',event=>{
 if(performance.now()<ignoreCanvasPointerUntil)return;
 const entity=self===undefined?undefined:entities.get(self);if(!entity||entity.dead||socket?.readyState!==WebSocket.OPEN)return;
 const rect=view.app.canvas.getBoundingClientRect(),stageX=(event.clientX-rect.left)*800/rect.width,stageY=(event.clientY-rect.top)*600/rect.height;
 const clicked=view.cellAtScreen(stageX,stageY),clickedX=clicked.x,clickedY=clicked.y;
 const target=[...visuals.entries()].map(([id,visual])=>({entity:entities.get(id),visual})).filter((entry):entry is {entity:Entity;visual:OnlineActor}=>Boolean(entry.entity)&&entry.visual.hitTest(stageX,stageY)).sort((left,right)=>Math.max(Math.abs(left.entity.x-clickedX),Math.abs(left.entity.y-clickedY))-Math.max(Math.abs(right.entity.x-clickedX),Math.abs(right.entity.y-clickedY)))[0]?.entity;
 rightPointer=undefined;
 if(target){clickDestination=undefined;interact(target,requestsHarvest(event));return;}
 const clickedItem=groundItems.hitTest(stageX,stageY);
 if(clickedItem){clickDestination=undefined;groundItems.requestPickup(clickedItem);return;}
 if(clickedX===entity.x&&clickedY===entity.y){const item=groundItems.at(entity.x,entity.y);if(item){groundItems.requestPickup(item);}return;}
 stopCombat();doorRetry=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;held=undefined;
 if(event.button===2){rightPointer={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY};try{view.app.canvas.setPointerCapture(event.pointerId);}catch{}continuePointerRun();return;}
 clickDestination={x:clickedX,y:clickedY,run:event.shiftKey};continueClickDestination();
});
view.app.canvas.addEventListener('pointermove',event=>{if(rightPointer?.pointerId!==event.pointerId)return;rightPointer.clientX=event.clientX;rightPointer.clientY=event.clientY;});
const stopPointerRun=(event:PointerEvent)=>{if(rightPointer?.pointerId!==event.pointerId)return;rightPointer=undefined;if(view.app.canvas.hasPointerCapture(event.pointerId))view.app.canvas.releasePointerCapture(event.pointerId);};
view.app.canvas.addEventListener('pointerup',stopPointerRun);
view.app.canvas.addEventListener('pointercancel',stopPointerRun);
view.app.canvas.addEventListener('lostpointercapture',event=>{if(rightPointer?.pointerId===event.pointerId)rightPointer=undefined;});
function selectSkillSlot(index:number){activateSkillSlot(index);}
function activateSkillSlot(index:number){
 const skill=skillBar.skillAt(index);if(!skill)return false;
 const use=skillUseOf(skill.magicId);
 if(use==='passive'){classicHud.selectSlot(index);connection.textContent=`${skill.name} 为被动技能，随近战生效`;return true;}
 if(use==='self'||use==='toggle'||use==='charge'){classicHud.selectSlot(index);return skillBar.castSelf(skill);}
 if(skillBar.selectSlot(index)){classicHud.selectSlot(index);return true;}
 return false;
}
function castSelf(skill:MagicSkill){
 if(socket?.readyState!==WebSocket.OPEN||self===undefined||pendingAction){skillBar.resolve();if(pendingAction)connection.textContent='当前动作完成后再施放技能';return;}
 const action=createAction('spell');socket.send(JSON.stringify({type:'castMagic',magicId:skill.magicId,targetId:self,actionId:action.actionId,mapGeneration}));
 const actor=entities.get(self);if(actor)update({...actor,action:'spell'});
 const use=skillUseOf(skill.magicId);
 connection.textContent=use==='toggle'?`正在开关 ${skill.name}…`:use==='charge'?`正在蓄力 ${skill.name}…`:`正在施放 ${skill.name}…`;
}
function cycleAttackMode(){
 if(socket?.readyState!==WebSocket.OPEN||self===undefined)return;
 const mode=(attackMode+1)%7;
 attackModeSelect.value=String(mode);
 socket.send(JSON.stringify({type:'attackMode',mode}));
 connection.textContent='正在切换攻击模式…';
}
window.addEventListener('keydown',event=>{if(event.target instanceof HTMLElement&&event.target.matches('input,select,textarea'))return;if(event.key==='Tab'){event.preventDefault();if(!event.repeat)minimap.cycle();return;}if(event.ctrlKey&&event.key.toLowerCase()==='h'){event.preventDefault();if(!event.repeat)cycleAttackMode();return;}const classicWindowKey:Record<string,string>={F9:'inventory',F10:'character',F11:'skills'};const windowId=classicWindowKey[event.key];if(windowId){event.preventDefault();if(!event.repeat)toggleClassicWindow(windowId);return;}const functionKey=/^F([1-8])$/.exec(event.key);if(functionKey){event.preventDefault();if(!event.repeat)selectSkillSlot(Number(functionKey[1])-1);return;}const movement=movementInput(event);if(!movement||event.repeat)return;event.preventDefault();rightPointer=undefined;stopCombat();doorRetry=undefined;clickDestination=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;held=movement;const actor=self===undefined?undefined:entities.get(self);if(actor)sendMovement(actor,held.dx,held.dy,held.run);});
window.addEventListener('keyup',event=>{if(releasesMovement(held,event))held=undefined;});
window.addEventListener('blur',()=>{held=undefined;rightPointer=undefined;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){held=undefined;rightPointer=undefined;}});
