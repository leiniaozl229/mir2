import {createMapView} from './map-view';
import {OnlineActor,type Entity} from './online-actors';
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
const connection=document.querySelector<HTMLElement>('#connection')!;
const loginForm=document.querySelector<HTMLFormElement>('#login')!;
const createCharacterForm=document.querySelector<HTMLFormElement>('#create-character')!;
const combatStatus=document.querySelector<HTMLElement>('#combat-status')!;
const targetsElement=document.querySelector<HTMLElement>('#nearby-targets')!;
const chatLog=document.querySelector<HTMLOListElement>('#chat-log')!,chatForm=document.querySelector<HTMLFormElement>('#chat-form')!,chatChannel=document.querySelector<HTMLSelectElement>('#chat-channel')!,chatTargetWrap=document.querySelector<HTMLElement>('#chat-target-wrap')!,chatTarget=document.querySelector<HTMLInputElement>('#chat-target')!,chatInput=document.querySelector<HTMLInputElement>('#chat-input')!;
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
const magicEffects=new MagicEffects(view.depth,id=>entities.get(id));
let ignoreCanvasPointerUntil=0;
let lastAttack=0;
const directions=[[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const inventory=new InventoryView(document.querySelector<HTMLElement>('#inventory-items')!,{
 drop:makeIndex=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'dropItem',makeIndex}));},
 equip:(makeIndex,slot)=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'equipItem',makeIndex,slot}));},
 use:makeIndex=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'useItem',makeIndex}));},
 trade:makeIndex=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'tradeAdd',makeIndex}));}
});
const equipment=new EquipmentView(document.querySelector<HTMLElement>('#equipment-items')!,slot=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'takeOffItem',slot}));});
const paperdoll=new PaperdollView(document.querySelector<HTMLElement>('#paperdoll-actor')!);
const characterWindow=document.querySelector<HTMLElement>('#character-window')!;
const inventoryWindow=document.querySelector<HTMLElement>('#inventory-window')!;
const classicWindow=document.querySelector<HTMLElement>('#classic-window')!;
const classicWindowTitle=document.querySelector<HTMLElement>('#classic-window-title')!;
const classicWindowBody=document.querySelector<HTMLElement>('#classic-window-body')!;
const classicModalLayer=document.querySelector<HTMLElement>('#classic-modal-layer')!;
for(const panel of [dialogueElement,document.querySelector<HTMLElement>('#shop-panel')!,document.querySelector<HTMLElement>('#repair-panel')!,document.querySelector<HTMLElement>('#storage-panel')!,revivePanel])classicModalLayer.append(panel);
const classicWindowSources=[
 {id:'quest',label:'任务日志',node:document.querySelector<HTMLElement>('#quest-panel')!},
 {id:'targets',label:'附近目标与 NPC',node:document.querySelector<HTMLElement>('#nearby-targets')!.parentElement as HTMLElement},
 {id:'ground',label:'地面物品',node:document.querySelector<HTMLElement>('#ground-items')!.parentElement as HTMLElement},
 {id:'chat',label:'聊天',node:document.querySelector<HTMLElement>('.chat-panel')!},
 {id:'group',label:'队伍',node:document.querySelector<HTMLElement>('#group-panel')!},
 {id:'attack',label:'攻击模式',node:document.querySelector<HTMLElement>('#attack-mode-panel')!},
 {id:'guild',label:'行会',node:document.querySelector<HTMLElement>('#guild-panel')!},
 {id:'trade',label:'玩家交易',node:document.querySelector<HTMLElement>('#trade-panel')!},
];
for(const source of classicWindowSources){source.node.hidden=source.id!=='chat';if(source.id!=='chat')classicWindowBody.append(source.node);}
document.querySelector<HTMLElement>('[data-hud-chat]')!.append(document.querySelector<HTMLElement>('.chat-panel')!);
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
 if(except!=='classic')classicWindow.hidden=true;
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
 for(const value of classicWindowSources)if(value.id!=='chat')value.node.hidden=value.node!==source.node;
 classicWindowTitle.textContent=source.label;
 if(id==='chat'){classicWindow.hidden=true;return;}
 classicWindow.hidden=false;classicHud.skinWindow(classicWindow,id);
 document.querySelectorAll<HTMLButtonElement>('[data-window-tab]').forEach(button=>button.classList.toggle('active',button.dataset.windowTab===id));
}
document.querySelectorAll<HTMLButtonElement>('[data-window-open],[data-window-tab]').forEach(button=>button.addEventListener('click',()=>toggleClassicWindow(button.dataset.windowOpen??button.dataset.windowTab??'')));
document.querySelectorAll<HTMLButtonElement>('[data-window-close]').forEach(button=>button.addEventListener('click',()=>{
 const id=button.dataset.windowClose;
 if(id==='character')characterWindow.hidden=true;
 else if(id==='inventory')inventoryWindow.hidden=true;
}));
document.querySelector<HTMLButtonElement>('#classic-window-close')!.addEventListener('click',()=>{classicWindow.hidden=true;});
characterWindow.querySelectorAll<HTMLButtonElement>('[data-character-tab]').forEach(button=>button.addEventListener('click',()=>setCharacterPage((button.dataset.characterTab??'paperdoll') as 'paperdoll'|'status'|'state'|'skills')));
const groundItems=new GroundItems(view.depth,(item:GroundItem)=>{
 ignoreCanvasPointerUntil=performance.now()+100;
 const entity=self===undefined?undefined:entities.get(self);
 if(!entity||socket?.readyState!==WebSocket.OPEN)return;
 if(entity.x!==item.x||entity.y!==item.y){const dx=Math.sign(item.x-entity.x),dy=Math.sign(item.y-entity.y);if(sendMovement(entity,dx,dy)){pursuitGroundItem=item.id;connection.textContent=`正在自动接近 ${item.name} · ${item.x}, ${item.y}`;}return;}
 pursuitGroundItem=undefined;
 socket.send(JSON.stringify({type:'pickup'}));connection.textContent=`正在拾取 ${item.name}…`;
},document.querySelector<HTMLElement>('#ground-items')!);
const entities=new Map<number,Entity>(),visuals=new Map<number,OnlineActor>();
let socket:WebSocket|undefined,self:number|undefined,lastSequence=0,mapGeneration=0,currentMap='0',pending:{x:number;y:number;direction:number;run:boolean}|undefined,doorRetry:{x:number;y:number;direction:number;run:boolean}|undefined,held:{key:string;dx:number;dy:number;run:boolean}|undefined,rightPointer:{pointerId:number;clientX:number;clientY:number}|undefined,clickDestination:{x:number;y:number;run:boolean}|undefined,movementTimer:number|undefined,combatTimer:number|undefined,pursuitTarget:number|undefined,pursuitGroundItem:number|undefined,combatTarget:number|undefined,worldReady=true,initialSelfPending=true,suppressNpcDialogsUntil=0,reconnectTimer:number|undefined,reconnectAttempts=0,reconnectEnabled=false;
let mapReady:Promise<void>=Promise.resolve();
type Credentials={account:string;password:string};
let credentials:Credentials|undefined,selectedCharacter:string|undefined;
function appendChat(channel:string,text:string){const line=document.createElement('li');line.dataset.channel=channel;const labels:Record<string,string>={local:'附近',group:'组队',shout:'喊话',whisper:'私聊',guild:'行会',system:'系统'};line.textContent=`[${labels[channel]??channel}] ${text}`;chatLog.append(line);while(chatLog.children.length>100)chatLog.firstElementChild?.remove();chatLog.scrollTop=chatLog.scrollHeight;}
function clearWorld(preserveCharacter=false){magicEffects.clear();for(const visual of visuals.values())visual.destroy();visuals.clear();entities.clear();groundItems.clear();self=undefined;pending=undefined;doorRetry=undefined;held=undefined;rightPointer=undefined;clickDestination=undefined;initialSelfPending=true;pursuitTarget=undefined;pursuitGroundItem=undefined;combatTarget=undefined;selectedMagic=undefined;groupEnabled=false;groupMemberNames=[];attackMode=0;guildName='';guildRankName='';guildNotice='';guildWarGuildNames=[];guildWarTimers=[];guildWarReceivedAt=0;guildAllyGuildNames=[];guildMemberNames=[];guildRanks=[];castleWarStatus=undefined;dialogueNpcId=undefined;classicWindow.hidden=true;characterWindow.hidden=true;inventoryWindow.hidden=true;renderGroup();renderAttackMode();renderGuild();clearTrade();if(movementTimer!==undefined)clearTimeout(movementTimer);movementTimer=undefined;if(combatTimer!==undefined)clearTimeout(combatTimer);combatTimer=undefined;if(!preserveCharacter){inventory.clear();equipment.clear();paperdoll.clear();characterPanel.clear();skillBar.clear();classicHud.clear();}dialogueElement.hidden=true;revivePanel.hidden=true;returnToTown.disabled=false;shop.clear();storage.clear();repair.clear();renderTargets();}
function update(entity:Entity){entities.set(entity.id,entity);let visual=visuals.get(entity.id);if(!visual){visual=new OnlineActor(entity,interact);visuals.set(entity.id,visual);view.depth.addChild(visual.container);}visual.update(entity);if(entity.self)paperdoll.setFeature(entity.feature);renderTargets();}
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
 for(const {entity,distance} of targets){const button=document.createElement('button');button.type='button';button.dataset.entityId=String(entity.id);const race=entity.feature&255,npc=race===50,player=race===0,slave=entity.kind==='slave'||entity.nameColor===254,health=entity.hp===undefined?'':` · ${entity.hp}/${entity.maxHp} HP`;button.textContent=`${slave?'召唤 · ':''}${entity.name||(npc?'NPC':'怪物')} · ${entity.x},${entity.y} · ${distance} 格${health} · ${npc?(distance===1?'对话':'接近'):player?(distance===1?'PK/行会战':'接近'):entity.dead?'挖肉':distance===1?'攻击':'接近'}`;button.onclick=()=>interact(entities.get(entity.id)??entity);targetsElement.append(button);}
}
function clickPath(actor:Entity,destination:{x:number;y:number}){
 const start={x:actor.x,y:actor.y},goal={x:Math.round(destination.x),y:Math.round(destination.y)};
 if(start.x===goal.x&&start.y===goal.y)return [];
 // A click can land on a closed door. Keep the direct request in that case
 // so the server can emit its door state and the normal retry path can run.
 if(view.isWalkable(goal.x,goal.y)===false)return undefined;
 const key=(point:{x:number;y:number})=>`${point.x},${point.y}`;
 const occupied=new Set([...entities.values()].filter(entity=>!entity.self&&!entity.dead).map(entity=>key(entity)));
 const queue=[start],previous=new Map<string,string>(),points=new Map([[key(start),start]]);
 const radius=Math.max(18,Math.max(Math.abs(goal.x-start.x),Math.abs(goal.y-start.y))+8);
 const minX=Math.min(start.x,goal.x)-radius,maxX=Math.max(start.x,goal.x)+radius;
 const minY=Math.min(start.y,goal.y)-radius,maxY=Math.max(start.y,goal.y)+radius;
 for(let index=0;index<queue.length;index++){
  const current=queue[index];
  if(current.x===goal.x&&current.y===goal.y){
   const path=[];let cursor=key(goal);
   while(cursor!==key(start)){const point=points.get(cursor);if(!point)return undefined;path.unshift(point);cursor=previous.get(cursor)!;}
   return path;
  }
  for(const [dx,dy] of directions){
   const next={x:current.x+dx,y:current.y+dy},nextKey=key(next);
   if(next.x<minX||next.x>maxX||next.y<minY||next.y>maxY||points.has(nextKey)||occupied.has(nextKey)&&nextKey!==key(goal))continue;
   if(view.isWalkable(next.x,next.y)!==true)continue;
   points.set(nextKey,next);previous.set(nextKey,key(current));queue.push(next);
  }
 }
 return undefined;
}
function sendMovement(actor:Entity,dx:number,dy:number,run=false,distanceOverride?:number){
 if(actor.dead||pending||socket?.readyState!==WebSocket.OPEN)return false;const direction=directions.findIndex(([x,y])=>x===dx&&y===dy);if(direction<0)return false;
 const distance=distanceOverride??(run?2:1);pending={x:actor.x+dx*distance,y:actor.y+dy*distance,direction,run};socket.send(JSON.stringify({type:'move',...pending}));return true;
}
function continueHeld(){if(!held||pending||movementTimer!==undefined)return;movementTimer=window.setTimeout(()=>{movementTimer=undefined;const actor=self===undefined?undefined:entities.get(self);if(actor&&held)sendMovement(actor,held.dx,held.dy,held.run);},45);}
function continuePointerRun(){
 if(!rightPointer||pending)return;
 const actor=self===undefined?undefined:entities.get(self);
 if(!actor||actor.dead)return;
 const rect=view.app.canvas.getBoundingClientRect();
 const stageX=(rightPointer.clientX-rect.left)*800/rect.width,stageY=(rightPointer.clientY-rect.top)*600/rect.height;
 const dx=Math.sign(stageX-400),dy=Math.sign(stageY-300);
 if(!dx&&!dy)return;
 if(sendMovement(actor,dx,dy,true,2))connection.textContent=`正在持续跑步 · ${actor.x+dx*2}, ${actor.y+dy*2}…`;
}
function continueClickDestination(){
 if(!clickDestination||pending)return;
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
function continuePursuit(){
 if(pursuitTarget===undefined||pending)return;
 const target=entities.get(pursuitTarget),actor=self===undefined?undefined:entities.get(self);
 if(!target||target.self||!actor||actor.dead){pursuitTarget=undefined;return;}
 interact(target);
}
function continueGroundPursuit(){
 if(pursuitGroundItem===undefined||pending)return;
 const item=groundItems.get(pursuitGroundItem),actor=self===undefined?undefined:entities.get(self);
 if(!item||!actor||actor.dead){pursuitGroundItem=undefined;return;}
 const dx=Math.sign(item.x-actor.x),dy=Math.sign(item.y-actor.y);
 if(dx===0&&dy===0){pursuitGroundItem=undefined;socket?.send(JSON.stringify({type:'pickup'}));connection.textContent=`正在拾取 ${item.name}…`;return;}
 if(sendMovement(actor,dx,dy))connection.textContent=`正在自动接近 ${item.name} · ${item.x}, ${item.y}`;else if(!pending)pursuitGroundItem=undefined;
}
function stopCombat(){combatTarget=undefined;if(combatTimer!==undefined){clearTimeout(combatTimer);combatTimer=undefined;}}
function scheduleCombat(){if(combatTimer===undefined)combatTimer=window.setTimeout(()=>{combatTimer=undefined;continueCombat();},620);}
function continueCombat(){
 if(combatTarget===undefined)return;
 const target=entities.get(combatTarget),actor=self===undefined?undefined:entities.get(self);
 if(!target||target.dead||(target.hp!==undefined&&target.hp<=0)||!actor||actor.dead||socket?.readyState!==WebSocket.OPEN){stopCombat();return;}
 const dx=Math.sign(target.x-actor.x),dy=Math.sign(target.y-actor.y),distance=Math.max(Math.abs(target.x-actor.x),Math.abs(target.y-actor.y));
 if(distance>1){const id=target.id;combatTarget=undefined;pursuitTarget=id;interact(target);return;}
 if(distance!==1){stopCombat();return;}
 const direction=directions.findIndex(([x,y])=>x===dx&&y===dy);if(direction<0){stopCombat();return;}
 if(performance.now()-lastAttack<550){scheduleCombat();return;}
 lastAttack=performance.now();socket.send(JSON.stringify({type:'attack',direction}));audio.play('swing');update({...actor,direction,action:'attack'});connection.textContent=`攻击 ${target.name}`;scheduleCombat();
}
function interact(target:Entity){
 ignoreCanvasPointerUntil=performance.now()+100;
 stopCombat();pursuitGroundItem=undefined;const actor=self===undefined?undefined:entities.get(self);if(!actor||actor.dead||target.self||socket?.readyState!==WebSocket.OPEN)return;
 if(selectedMagic&&(target.feature&255)!==50){pursuitTarget=undefined;const distance=Math.max(Math.abs(target.x-actor.x),Math.abs(target.y-actor.y));if(distance>12){connection.textContent=`${target.name||'目标'} 超出施法距离`;return;}const skill=selectedMagic;selectedMagic=undefined;skillBar.setPending(skill.magicId);socket.send(JSON.stringify({type:'castMagic',magicId:skill.magicId,targetId:target.id}));update({...actor,direction:directions.findIndex(([x,y])=>x===Math.sign(target.x-actor.x)&&y===Math.sign(target.y-actor.y)),action:'spell'});connection.textContent=`正在对 ${target.name||'目标'} 施放 ${skill.name}…`;return;}
 const race=target.feature&255,player=race===0&&Boolean(target.name);if(race===0&&!player){pursuitTarget=undefined;connection.textContent=`${target.name||'该对象'} 暂不支持交互`;return;}
 const dx=Math.sign(target.x-actor.x),dy=Math.sign(target.y-actor.y),distance=Math.max(Math.abs(target.x-actor.x),Math.abs(target.y-actor.y));
 if(distance>1){held=undefined;clickDestination=undefined;if(sendMovement(actor,dx,dy)){pursuitTarget=target.id;connection.textContent=`正在自动接近 ${target.name||'目标'}…`;}else if(!pending)pursuitTarget=undefined;return;}
 if(distance!==1)return;
 pursuitTarget=undefined;
 if(race===50){socket.send(JSON.stringify({type:'npc',targetId:target.id}));connection.textContent=`正在与 ${target.name} 交谈…`;return;}
 const direction=directions.findIndex(([x,y])=>x===dx&&y===dy);if(direction<0)return;
 if(target.dead){socket.send(JSON.stringify({type:'butch',targetId:target.id}));update({...actor,direction,action:'harvest'});connection.textContent=`正在挖取 ${target.name}…`;return;}
 combatTarget=target.id;continueCombat();
}
view.app.ticker.add(()=>{const time=performance.now();for(const visual of visuals.values())visual.tick(time);layoutActorLabels();});
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
  if(message.type==='connected'){active.send(JSON.stringify({type:intent,account,password}));document.querySelector<HTMLInputElement>('#password')!.value='';connection.textContent=intent==='register'?'正在创建账号…':'正在登录…';}
  else if(message.type==='registrationResult'){
   if(message.accepted){connection.textContent='账号创建成功，正在登录…';active.send(JSON.stringify({type:'login',account,password}));}
   else connection.textContent=message.reason===0?'该账号已经存在':`账号创建失败 (${message.reason})`;
  }
  else if(message.type==='characters'){
   reconnectAttempts=0;
   const list=message.characters as SelectCharacter[];
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
   clearWorld(true);worldReady=false;suppressNpcDialogsUntil=performance.now()+3000;mapGeneration=envelope.mapGeneration;classicHud.position(message.map,0,0);connection.textContent=`正在载入地图 ${message.map}…`;
   mapReady=view.setMap(message.map).then(()=>{worldReady=true;}).catch(error=>{
    const detail=error instanceof Error?error.message:`地图 ${message.map} 载入失败`;
    console.error('地图载入失败',message.map,error);
    connection.textContent=detail;
    worldReady=true;
  });
  }
  else if(message.type==='entity'){
   const prior=entities.get(message.id);const entity={...prior,...message,name:message.name??prior?.name??'',feature:message.feature??prior?.feature??0,self:message.self||prior?.self||false,kind:message.kind??prior?.kind} as Entity;
   update(entity);if(entity.self){self=entity.id;classicHud.position(currentMap,entity.x,entity.y);view.setMarker(entity.x,entity.y);if(initialSelfPending){initialSelfPending=false;void mapReady.then(()=>{const current=entities.get(entity.id);if(current)void view.setCenter(current.x,current.y);});}connection.textContent=`已连接 · ${entity.name} · ${entity.x}, ${entity.y}`;}if(message.self&&mapGeneration===1)active.send(JSON.stringify({type:'inventory'}));
  }
  else if(message.type==='appearance'||message.type==='entityName'||message.type==='nameColor'||message.type==='entityDied'||message.type==='entityAlive'){
   const entity=entities.get(message.id);if(entity){const next={...entity,...(message.type==='appearance'?{feature:message.feature}:message.type==='entityName'?{name:message.name,nameColor:message.nameColor??entity.nameColor,kind:message.kind??entity.kind}:message.type==='nameColor'?{nameColor:message.color,kind:message.color===254?'slave':entity.kind}:message.type==='entityAlive'?{dead:false,action:'standing',x:message.x,y:message.y,direction:message.direction}:{dead:true,action:'dying',x:message.x,y:message.y,direction:message.direction,hp:0})};update(next);if(message.type==='entityDied'&&combatTarget===message.id)stopCombat();if(message.type==='entityDied'&&entity.self){held=undefined;pending=undefined;stopCombat();characterPanel.resources({hp:0});revivePanel.hidden=false;connection.textContent='角色已死亡';combatStatus.textContent='等待回城复活';}}
  }
  else if(message.type==='entityAction'){const entity=entities.get(message.id);if(entity){update({...entity,x:message.x,y:message.y,direction:message.direction,action:message.action});if(message.action==='attack'&&!entity.self&&((entity.feature>>>16)&0xffff)===20)audio.play('skeletonAttack');}}
  else if(message.type==='health'){const entity=entities.get(message.id);if(entity){update({...entity,hp:message.hp,maxHp:message.maxHp,action:entity.dead?'dead':'struck'});if(message.damage>0)audio.play('struck');if(entity.self)characterPanel.resources({hp:message.hp,maxHp:message.maxHp});if(combatTarget===message.id&&message.hp<=0)stopCombat();combatStatus.textContent=`${entity.name||'目标'} ${message.hp}/${message.maxHp} HP`;}}
  else if(message.type==='attributes'){characterPanel.replace(message);classicHud.replaceAttributes(message);const entity=self===undefined?undefined:entities.get(self);if(entity)update({...entity,hp:message.hp,maxHp:message.maxHp});}
  else if(message.type==='resources'){const entity=entities.get(message.id);if(entity){update({...entity,hp:message.hp,maxHp:message.maxHp});if(entity.self){characterPanel.resources({hp:message.hp,mp:message.mp,maxHp:message.maxHp});classicHud.resource({hp:message.hp,mp:message.mp,maxHp:message.maxHp});}}}
  else if(message.type==='characterStatus'){const entity=entities.get(message.id);if(entity)update({...entity,status:message.status,hitSpeed:message.hitSpeed});if(self===message.id)classicHud.status(message.status);}
  else if(message.type==='myStatus')classicHud.hungerStatus(message.status);
  else if(message.type==='weights')characterPanel.weights(message);
  else if(message.type==='currency')characterPanel.currency(message);
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
  else if(message.type==='tradeGold'){tradeGold=message.gold;tradeGoldInput.value=String(message.gold);renderTrade();characterPanel.currency({gold:message.availableGold});connection.textContent=`交易金币已设置为 ${message.gold}`;}
  else if(message.type==='tradeResult'){
   const labels:Record<string,string>={request:'发起交易',add:'放入物品',remove:'取回物品',gold:'设置金币'};
   if(message.action==='add'&&message.accepted&&message.item){tradeLocal.set(message.item.makeIndex,message.item);inventory.resolve(message.item.makeIndex,true,true);}
   if(message.action==='remove'&&message.accepted&&message.item){tradeLocal.delete(message.item.makeIndex);inventory.add(message.item);}
   renderTrade();connection.textContent=message.accepted?`${labels[message.action]??'交易操作'}成功`:`${labels[message.action]??'交易操作'}失败 · 原因 ${message.reason}`;
  }
  else if(message.type==='tradeClosed'){for(const item of tradeLocal.values())inventory.add(item);tradeOpen=false;tradeLocal.clear();tradeRemote.clear();tradeGold=0;tradeRemoteGold=0;renderTrade();characterPanel.currency({gold:message.gold});connection.textContent='交易已取消，物品和金币已退回';}
  else if(message.type==='tradeSuccess'){tradeOpen=false;tradeLocal.clear();tradeRemote.clear();tradeGold=0;tradeRemoteGold=0;renderTrade();characterPanel.currency({gold:message.gold});connection.textContent='交易成功';}
  else if(message.type==='door'){
   void view.setDoor(message.x,message.y,message.open);
   if(message.open&&doorRetry&&doorRetry.x===message.x&&doorRetry.y===message.y){
    const retry=doorRetry;doorRetry=undefined;const actor=self===undefined?undefined:entities.get(self);
    if(actor&&!actor.dead&&!pending){const dx=Math.sign(retry.x-actor.x),dy=Math.sign(retry.y-actor.y);if(sendMovement(actor,dx,dy,retry.run))connection.textContent=`门已打开，继续前进 · ${message.x}, ${message.y}`;}
   }else{if(!message.open)clickDestination=undefined;connection.textContent=message.open?`门已打开 · ${message.x}, ${message.y}`:`门已关闭 · ${message.x}, ${message.y}`;}
  }
  else if(message.type==='npcDialogue'&&worldReady&&performance.now()>=suppressNpcDialogsUntil){
   if(Array.isArray(message.quests))for(const quest of message.quests)updateQuest(quest as QuestState);else if(message.quest)updateQuest(message.quest as QuestState);
   dialogueNpcId=String(message.npcName).includes('国王')?message.npcId:undefined;renderGuild();
   shop.clear();storage.clear();repair.clear();hideClassicWindows();dialogueElement.hidden=false;classicHud.skinWindow(dialogueElement,'npc');dialogueTitle.textContent=message.npcName;renderDialogueText(message.text);dialogueOptions.replaceChildren();
   for(const option of message.options){if(option.input){const form=document.createElement('form');form.className='dialogue-input';const input=document.createElement('input');input.type='text';input.maxLength=80;input.placeholder=option.text;input.required=true;const button=document.createElement('button');button.type='submit';button.textContent=option.text;form.onsubmit=event=>{event.preventDefault();active.send(JSON.stringify({type:'dialogueSelect',npcId:message.npcId,command:option.command,input:input.value}));};form.append(input,button);dialogueOptions.append(form);}else{const button=document.createElement('button');button.type='button';button.textContent=option.text;button.onclick=()=>active.send(JSON.stringify({type:'dialogueSelect',npcId:message.npcId,command:option.command}));dialogueOptions.append(button);}}
  }
  else if(message.type==='dialogueMessage'&&worldReady&&performance.now()>=suppressNpcDialogsUntil){if(Array.isArray(message.quests))for(const quest of message.quests)updateQuest(quest as QuestState);else if(message.quest)updateQuest(message.quest as QuestState);hideClassicWindows();dialogueElement.hidden=false;classicHud.skinWindow(dialogueElement,'npc');renderDialogueText(message.text);dialogueOptions.replaceChildren();}
  else if(message.type==='npcDialogueClosed'){dialogueElement.hidden=true;dialogueNpcId=undefined;renderGuild();shop.clear();storage.clear();repair.clear();}
  else if(message.type==='shop'){dialogueElement.hidden=true;storage.clear();repair.clear();hideClassicWindows();shop.open(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#shop-panel')!,'shop');connection.textContent=`商店已打开 · ${message.items.length} 种商品`;}
  else if(message.type==='shopSell'){dialogueElement.hidden=true;storage.clear();repair.clear();hideClassicWindows();shop.openSell(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#shop-panel')!,'shop');connection.textContent='请选择要出售的背包物品';}
  else if(message.type==='shopDetails'){shop.showDetails(message.npcId,message.items);connection.textContent=`已载入 ${message.items.length} 件具体商品`;}
  else if(message.type==='shopPurchaseResult'){
   shop.resolve(message.name,message.makeIndex,message.accepted);if(message.accepted&&message.gold!==null)characterPanel.currency({gold:message.gold});
   const reasons:Record<number,string>={1:'商品已售罄',2:'背包空间或负重不足',3:'金币不足',4:'缺少必需物品'};
   connection.textContent=message.accepted?`购买 ${message.name} 成功 · 剩余 ${message.gold} 金币`:`购买失败 · ${reasons[message.reason]??`原因 ${message.reason}`}`;
  }
  else if(message.type==='shopSellQuote'){shop.showSellQuote(message.npcId,message.item,message.price);connection.textContent=message.price>0?`${message.item.name} 可卖 ${message.price} 金币`:`${message.item.name} 无法出售`;}
  else if(message.type==='shopSellResult'){
   shop.resolveSale(message.item,message.accepted);if(message.accepted){inventory.remove(message.item.makeIndex);if(message.gold!==null)characterPanel.currency({gold:message.gold});}
   connection.textContent=message.accepted?`已卖出 ${message.item.name} · 当前 ${message.gold} 金币`:`出售 ${message.item.name} 失败`;
  }
  else if(message.type==='repairItems'){dialogueElement.hidden=true;shop.clear();storage.clear();hideClassicWindows();repair.open(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#repair-panel')!,'repair');connection.textContent='请选择要修理的背包物品';}
  else if(message.type==='repairQuote'){repair.showQuote(message.npcId,message.item,message.price);connection.textContent=message.price>=0?`${message.item.name} 修理需要 ${message.price} 金币`:`${message.item.name} 无需或无法修理`;}
  else if(message.type==='repairResult'){repair.resolve(message.item,message.accepted);if(message.accepted){inventory.update(message.item);if(message.gold!==null)characterPanel.currency({gold:message.gold});}connection.textContent=message.accepted?`${message.item.name} 修理完成 · 当前 ${message.gold} 金币`:`${message.item.name} 修理失败`;}
  else if(message.type==='storageDeposit'){dialogueElement.hidden=true;shop.clear();repair.clear();hideClassicWindows();storage.openDeposit(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#storage-panel')!,'storage');connection.textContent='请选择要存入仓库的物品';}
  else if(message.type==='storageItems'){dialogueElement.hidden=true;shop.clear();repair.clear();hideClassicWindows();storage.openItems(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#storage-panel')!,'storage');connection.textContent=`仓库共 ${message.items.length} 件物品`;}
  else if(message.type==='storageResult'){
   storage.resolve(message.item,message.accepted);if(message.accepted&&message.kind==='store')inventory.remove(message.item.makeIndex);
   const reasons:Record<number,string>={1:'服务端拒绝操作',2:'仓库已满',3:'背包空间或负重不足'};connection.textContent=message.accepted?(message.kind==='store'?`已存入 ${message.item.name}`:`已取回 ${message.item.name}`):`仓库操作失败 · ${reasons[message.reason]??`原因 ${message.reason}`}`;
  }
  else if(message.type==='chat')appendChat(message.channel,message.text);
  else if(message.type==='systemMessage'){combatStatus.textContent=message.text;appendChat('system',message.text);if(message.castleWar){castleWarStatus=message.castleWar;renderGuild();}}
  else if(message.type==='entityRemoved'){if(pursuitTarget===message.id)pursuitTarget=undefined;if(combatTarget===message.id)stopCombat();entities.delete(message.id);visuals.get(message.id)?.destroy();visuals.delete(message.id);renderTargets();}
  else if(message.type==='legacy'&&pending){
   if(message.id===-1&&message.status?.startsWith('+GD/')){const accepted=pending,entity=self===undefined?undefined:entities.get(self);if(entity&&accepted){if(entity.x!==accepted.x||entity.y!==accepted.y)update({...entity,...accepted,action:accepted.run?'running':'walking'});classicHud.position(view.map,accepted.x,accepted.y);view.setMarker(accepted.x,accepted.y);view.moveCenter(accepted.x,accepted.y,accepted.run?400:600);audio.play('movement',.22);connection.textContent=`已连接 · ${entity.name} · ${accepted.x}, ${accepted.y}`;}pending=undefined;continueHeld();continuePointerRun();continueClickDestination();continuePursuit();continueGroundPursuit();}
   else if(message.id===28){const blocked=pending;pending=undefined;held=undefined;rightPointer=undefined;pursuitTarget=undefined;pursuitGroundItem=undefined;if(blocked&&socket?.readyState===WebSocket.OPEN){doorRetry=blocked;socket.send(JSON.stringify({type:'openDoor',x:blocked.x,y:blocked.y}));connection.textContent=`尝试打开门 · ${blocked.x}, ${blocked.y}`;}else connection.textContent='该方向暂时无法通行';}
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
  else if(message.type==='groundItem'){groundItems.add(message);connection.textContent=`地面出现 ${message.name} · ${message.x}, ${message.y}`;}
  else if(message.type==='groundItemRemoved'){if(pursuitGroundItem===message.id)pursuitGroundItem=undefined;groundItems.remove(message.id);}
  else if(message.type==='error'){selectedMagic=undefined;skillBar.resolve();connection.textContent=message.message;}
 });
  active.addEventListener('close',()=>{if(socket!==active)return;pending=undefined;doorRetry=undefined;held=undefined;rightPointer=undefined;clickDestination=undefined;pursuitTarget=undefined;pursuitGroundItem=undefined;stopCombat();if(reconnectEnabled&&credentials){scheduleReconnect();}else{document.body.classList.remove('in-world');classicAuth.showLogin();connection.textContent='连接已断开，请重新登录';}});
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
 const entity=self===undefined?undefined:entities.get(self);if(!entity||entity.dead||pending||socket?.readyState!==WebSocket.OPEN)return;
 const rect=view.app.canvas.getBoundingClientRect(),stageX=(event.clientX-rect.left)*800/rect.width,stageY=(event.clientY-rect.top)*600/rect.height;
 const clickedX=view.center.x+Math.floor((stageX-400)/48),clickedY=view.center.y+Math.floor((stageY-300)/32);
 const target=[...visuals.entries()].map(([id,visual])=>({entity:entities.get(id),visual})).filter((entry):entry is {entity:Entity;visual:OnlineActor}=>Boolean(entry.entity)&&entry.visual.hitTest(stageX,stageY)).sort((left,right)=>Math.max(Math.abs(left.entity.x-clickedX),Math.abs(left.entity.y-clickedY))-Math.max(Math.abs(right.entity.x-clickedX),Math.abs(right.entity.y-clickedY)))[0]?.entity;
 rightPointer=undefined;
 if(target){clickDestination=undefined;interact(target);return;}
 const clickedItem=groundItems.hitTest(stageX,stageY);
 if(clickedItem){clickDestination=undefined;groundItems.requestPickup(clickedItem);return;}
 if(clickedX===entity.x&&clickedY===entity.y){const item=groundItems.at(entity.x,entity.y);if(item){groundItems.requestPickup(item);}return;}
 stopCombat();doorRetry=undefined;pursuitTarget=undefined;pursuitGroundItem=undefined;held=undefined;
 if(event.button===2){rightPointer={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY};try{view.app.canvas.setPointerCapture(event.pointerId);}catch{}continuePointerRun();return;}
 clickDestination={x:clickedX,y:clickedY,run:event.shiftKey};continueClickDestination();
});
view.app.canvas.addEventListener('pointermove',event=>{if(rightPointer?.pointerId!==event.pointerId)return;rightPointer.clientX=event.clientX;rightPointer.clientY=event.clientY;});
const stopPointerRun=(event:PointerEvent)=>{if(rightPointer?.pointerId!==event.pointerId)return;rightPointer=undefined;if(view.app.canvas.hasPointerCapture(event.pointerId))view.app.canvas.releasePointerCapture(event.pointerId);};
view.app.canvas.addEventListener('pointerup',stopPointerRun);
view.app.canvas.addEventListener('pointercancel',stopPointerRun);
view.app.canvas.addEventListener('lostpointercapture',event=>{if(rightPointer?.pointerId===event.pointerId)rightPointer=undefined;});
const movementKeys:Record<string,[number,number]>={ArrowUp:[0,-1],w:[0,-1],W:[0,-1],ArrowRight:[1,0],d:[1,0],D:[1,0],ArrowDown:[0,1],s:[0,1],S:[0,1],ArrowLeft:[-1,0],a:[-1,0],A:[-1,0]};
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
 if(socket?.readyState!==WebSocket.OPEN||self===undefined){skillBar.resolve();return;}
 socket.send(JSON.stringify({type:'castMagic',magicId:skill.magicId,targetId:self}));
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
window.addEventListener('keydown',event=>{if(event.target instanceof HTMLElement&&event.target.matches('input,select,textarea'))return;if(event.ctrlKey&&event.key.toLowerCase()==='h'){event.preventDefault();if(!event.repeat)cycleAttackMode();return;}const classicWindowKey:Record<string,string>={F9:'inventory',F10:'character',F11:'skills'};const windowId=classicWindowKey[event.key];if(windowId){event.preventDefault();if(!event.repeat)toggleClassicWindow(windowId);return;}const functionKey=/^F([1-8])$/.exec(event.key);if(functionKey){event.preventDefault();if(!event.repeat)selectSkillSlot(Number(functionKey[1])-1);return;}const offset=movementKeys[event.key];if(!offset||event.repeat)return;event.preventDefault();rightPointer=undefined;stopCombat();doorRetry=undefined;clickDestination=undefined;pursuitTarget=undefined;pursuitGroundItem=undefined;held={key:event.key,dx:offset[0],dy:offset[1],run:event.shiftKey};const actor=self===undefined?undefined:entities.get(self);if(actor)sendMovement(actor,held.dx,held.dy,held.run);});
window.addEventListener('keyup',event=>{if(held?.key===event.key)held=undefined;});
