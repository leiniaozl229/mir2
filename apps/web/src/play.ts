import {createMapView,WORLD_VIEW} from './map-view';
import {WorldTone} from './world-tone';
import {OnlineActor,preloadPlayerLocomotion,type Entity} from './online-actors';
import './style.css';
import {attachItemTooltip,EquipmentView,hideItemTooltip,InventoryView,type InventoryItem} from './inventory';
import {ItemQuickBar} from './item-quickbar';
import {GroundItems,type GroundItem} from './ground-items';
import {PaperdollView} from './paperdoll';
import {CharacterPanel} from './character-panel';
import {showCharacterPage,wireCharacterPageButtons,nativeWindowPositionVersion,type CharacterPage} from './character-window';
import {ShopView} from './shop';
import {StorageView} from './storage';
import {SkillBar,skillUseOf,SKILL_RANGE,type MagicSkill} from './skills';
import {GameAudio} from './game-audio';
import {RepairView} from './repair';
import {MagicEffects} from './magic-effects';
import {forcedMovementDuration} from './movement-visual';
import {ClassicHud} from './classic-hud';
import {ClassicAuth,type SelectCharacter} from './classic-auth';
import {SystemDialogController} from './system-dialog';
import {SkillKeyDialogController} from './skill-key-dialog';
import {GoldDropController} from './gold-drop';
import {CharacterDeleteController} from './character-delete';
import {PasswordChangeController,passwordChangeMessage,type PasswordChangeField,type PasswordChangeFields} from './password-change';
import {ClassicStage} from './classic-stage';
import {movementInput,releasesMovement,screenDirection,type HeldMovement} from './movement-input';
import {DIRECTIONS as directions,MOVEMENT_DURATION_MS,RecentBlockedCells,directionIndex,findGridPath,movementBlocker,movementCanFinish,movementTrace,type GridPoint,type MovementStep} from './movement-model';
import {AgentObserver,agentObservationEnabled,type AgentDebugApi} from './agent-observer';
import {MiniMapController,type MiniMapMarker} from './minimap';
import {requestsHarvest} from './harvest-input';
import {bringClassicWindowToFront,closeClassicWindowEntry,closeTopClassicWindow,makeClassicWindowDraggable,restoreClassicWindowFocus} from './window-drag';
import {routeClassicKey} from './classic-input';
import {NpcSession} from './npc-session';
import {bindInventoryServiceSlot,selectInventoryForService} from './service-input';
import {MiningController} from './mining-controller';
import {ChatInputController,type ChatChannel} from './chat-input';
import {applyClassicChatColors} from './chat-colors';
import {LogoutController,LogoutWaitingView,type LogoutState} from './logout';
import {classicUiLayout,classicWindowClosesOnEscape} from './classic-layout';
import {scrollGuildMemberList} from './guild-list';
import {ClientSettingsView,DisplaySettings} from './client-settings';
import {GuildEditor,parseGuildRankDraft} from './guild-editor';
import {ItemIconAssets,itemIconElement} from './item-icons';
import settingsContract from '../../../content/classic-176/client-settings.json';
const npcSession=new NpcSession();
const connection=document.querySelector<HTMLElement>('#connection')!;
document.body.dataset.diagnostics=agentObservationEnabled(location.href)?'on':'off';
const worldStatus=document.querySelector<HTMLOutputElement>('#world-status')!;
const worldConnectionStatus=document.querySelector<HTMLElement>('#world-connection-status')!;
const reconnectCancel=document.querySelector<HTMLButtonElement>('#reconnect-cancel')!;
let worldNoticeTimer:number|undefined,authResponseTimer:number|undefined,authResponseSocket:WebSocket|undefined,armCurrentAuthWait:((stage:string)=>void)|undefined;
function isRoutineWorldStatus(text:string){return /^(已连接 ·|攻击 |正在走向 |正在跑向 |正在自动接近 |正在施放 |正在挖取 |正在拾取 |地图寻路 ·)/.test(text);}
function setWorldConnectionState(state?:'reconnecting'|'notice'){
 if(state==='reconnecting')worldStatus.dataset.connectionState=state;else delete worldStatus.dataset.connectionState;
 if(state)worldConnectionStatus.dataset.connectionState=state;else delete worldConnectionStatus.dataset.connectionState;
 reconnectCancel.hidden=state!=='reconnecting';
 if(state!=='notice'&&worldNoticeTimer!==undefined){clearTimeout(worldNoticeTimer);worldNoticeTimer=undefined;}
}
function clearAuthenticationWait(active?:WebSocket){
 if(active&&authResponseSocket!==active)return;
 if(authResponseTimer!==undefined)clearTimeout(authResponseTimer);
 authResponseTimer=undefined;authResponseSocket=undefined;
}
function syncWorldStatus(){
 const message=connection.textContent??'';worldStatus.textContent=message;
 if(!document.body.classList.contains('in-world')||worldConnectionStatus.dataset.connectionState==='reconnecting'||!message||isRoutineWorldStatus(message))return;
 if(worldNoticeTimer!==undefined)clearTimeout(worldNoticeTimer);
 setWorldConnectionState('notice');
 worldNoticeTimer=window.setTimeout(()=>{worldNoticeTimer=undefined;if(worldConnectionStatus.dataset.connectionState==='notice')setWorldConnectionState();},2600);
}
new MutationObserver(syncWorldStatus).observe(connection,{childList:true,characterData:true,subtree:true});
const loginForm=document.querySelector<HTMLFormElement>('#login')!;
const createCharacterForm=document.querySelector<HTMLFormElement>('#create-character')!;
const combatStatus=document.querySelector<HTMLElement>('#combat-status')!;
const targetsElement=document.querySelector<HTMLElement>('#nearby-targets')!;
 const nearbyTradeButtons:HTMLButtonElement[]=[];
const chatPanel=document.querySelector<HTMLElement>('.chat-panel')!,chatLog=document.querySelector<HTMLOListElement>('#chat-log')!,chatForm=document.querySelector<HTMLFormElement>('#chat-form')!,chatChannel=document.querySelector<HTMLSelectElement>('#chat-channel')!,chatTargetWrap=document.querySelector<HTMLElement>('#chat-target-wrap')!,chatTarget=document.querySelector<HTMLInputElement>('#chat-target')!,chatInput=document.querySelector<HTMLInputElement>('#chat-input')!;
const hudChat=document.querySelector<HTMLElement>('[data-hud-chat]')!;hudChat.append(chatPanel);
function setChatChannel(channel:ChatChannel){chatChannel.value=channel;chatTargetWrap.hidden=channel!=='whisper';chatTarget.required=false;}
const chatController=new ChatInputController(chatInput,{
 channel:()=>chatChannel.value as ChatChannel,target:()=>chatTarget.value,
 canSend:()=>worldCommandsAvailable()&&self!==undefined,
 send:command=>{if(!worldCommandsAvailable()||self===undefined)return false;socket!.send(JSON.stringify(command));return true;},
 status:reason=>{connection.textContent=reason;},setChannel:setChatChannel,setTarget:target=>{chatTarget.value=target;}
});
chatForm.noValidate=true;chatTarget.required=false;
const groupStatus=document.querySelector<HTMLElement>('#group-status')!,groupFeedback=document.querySelector<HTMLElement>('#group-feedback')!,groupMembers=document.querySelector<HTMLOListElement>('#group-members')!,groupMode=document.querySelector<HTMLButtonElement>('#group-mode')!,groupCreate=document.querySelector<HTMLButtonElement>('#group-create')!,groupAdd=document.querySelector<HTMLButtonElement>('#group-add')!,groupRemove=document.querySelector<HTMLButtonElement>('#group-remove')!;
const guildScrollUp=document.querySelector<HTMLButtonElement>('#guild-scroll-up')!,guildScrollDown=document.querySelector<HTMLButtonElement>('#guild-scroll-down')!,guildScrollSpec=classicUiLayout().nationalUtilityWindows.guild.scrollButtons;
const attackModeSelect=document.querySelector<HTMLSelectElement>('#attack-mode')!,attackModeStatus=document.querySelector<HTMLElement>('#attack-mode-status')!;
const guildStatus=document.querySelector<HTMLElement>('#guild-status')!,guildNameInput=document.querySelector<HTMLInputElement>('#guild-name')!,guildCreateRow=document.querySelector<HTMLElement>('.guild-create')!,guildMemberControls=document.querySelector<HTMLElement>('.guild-invites')!,guildManagement=document.querySelector<HTMLElement>('.guild-management')!,guildMembers=document.querySelector<HTMLOListElement>('#guild-members')!,guildChatLog=document.querySelector<HTMLOListElement>('#guild-chat-log')!,guildChatToggle=document.querySelector<HTMLButtonElement>('#guild-chat-toggle')!,guildRanksElement=document.querySelector<HTMLElement>('#guild-ranks')!,guildRelations=document.querySelector<HTMLElement>('#guild-relations')!,guildWarTarget=document.querySelector<HTMLInputElement>('#guild-war-target')!,guildWarRequest=document.querySelector<HTMLButtonElement>('#guild-war-request')!,guildCastleDialogue=document.querySelector<HTMLButtonElement>('#guild-castle-dialogue')!,guildNoticeSave=document.querySelector<HTMLButtonElement>('#guild-notice-save')!,guildAlly=document.querySelector<HTMLButtonElement>('#guild-ally')!,guildBreakAlly=document.querySelector<HTMLButtonElement>('#guild-break-ally')!,guildRanksSave=document.querySelector<HTMLButtonElement>('#guild-ranks-save')!,guildOpen=document.querySelector<HTMLButtonElement>('#guild-open')!,guildMembersRequest=document.querySelector<HTMLButtonElement>('#guild-members-request')!,guildCreate=document.querySelector<HTMLButtonElement>('#guild-create')!,guildAdd=document.querySelector<HTMLButtonElement>('#guild-add')!,guildRemove=document.querySelector<HTMLButtonElement>('#guild-remove')!;
const tradePanel=document.querySelector<HTMLElement>('#trade-panel')!,tradeStatus=document.querySelector<HTMLElement>('#trade-status')!,tradeRequestForm=document.querySelector<HTMLFormElement>('#trade-request-form')!,tradeRequestButton=document.querySelector<HTMLButtonElement>('#trade-request-form button[type=submit]')!,tradeTarget=document.querySelector<HTMLInputElement>('#trade-target')!,tradeGoldInput=document.querySelector<HTMLInputElement>('#trade-gold')!,tradeSetGold=document.querySelector<HTMLButtonElement>('#trade-set-gold')!,tradeAccept=document.querySelector<HTMLButtonElement>('#trade-accept')!,tradeCancel=document.querySelector<HTMLButtonElement>('#trade-cancel')!,tradeLocalItems=document.querySelector<HTMLOListElement>('#trade-local-items')!,tradeRemoteItems=document.querySelector<HTMLOListElement>('#trade-remote-items')!;
const revivePanel=document.querySelector<HTMLElement>('#revive-panel')!,returnToTown=document.querySelector<HTMLButtonElement>('#return-to-town')!;
const questLog=document.querySelector<HTMLElement>('#quest-log')!;
const audio=new GameAudio(document.querySelector<HTMLButtonElement>('#audio-toggle')!);
const characterPanel=new CharacterPanel(
 document.querySelector<HTMLElement>('#character-panel')!,
 document.querySelector<HTMLElement>('#character-state')!,
 document.querySelector<HTMLElement>('[data-character-name]')!,()=>selectedCharacter
);
const dialogueElement=document.querySelector<HTMLElement>('#npc-dialog')!,dialogueTitle=document.querySelector<HTMLElement>('#npc-title')!,dialogueText=document.querySelector<HTMLElement>('#npc-text')!,dialogueOptions=document.querySelector<HTMLElement>('#npc-options')!;
const shop=new ShopView(document.querySelector<HTMLElement>('#shop-panel')!,{
 details:(npcId,name,page)=>sendNpcCommand({type:'shopDetails',npcId,name,page}),
 buy:(npcId,name,makeIndex)=>sendNpcCommand({type:'buyShopItem',npcId,name,...(makeIndex===undefined?{}:{makeIndex})}),
 quote:(npcId,makeIndex)=>sendNpcCommand({type:'querySellItem',npcId,makeIndex}),
 sell:(npcId,makeIndex)=>sendNpcCommand({type:'sellShopItem',npcId,makeIndex}),
 close:closeNpcSession,
 afterClose:focusWasWithinWindow=>restoreClassicWindowFocus(classicWindowEntries(),document.querySelector<HTMLElement>('#shop-panel')!,focusWasWithinWindow)
});
const storage=new StorageView(document.querySelector<HTMLElement>('#storage-panel')!,{
 store:(npcId,makeIndex)=>sendNpcCommand({type:'storeItem',npcId,makeIndex}),
 take:(npcId,makeIndex)=>sendNpcCommand({type:'takeStorageItem',npcId,makeIndex}),
 close:closeNpcSession,
 afterClose:focusWasWithinWindow=>restoreClassicWindowFocus(classicWindowEntries(),document.querySelector<HTMLElement>('#storage-panel')!,focusWasWithinWindow)
});
const repair=new RepairView(document.querySelector<HTMLElement>('#repair-panel')!,{
 quote:(npcId,makeIndex)=>sendNpcCommand({type:'queryRepairItem',npcId,makeIndex}),
 repair:(npcId,makeIndex)=>sendNpcCommand({type:'repairItem',npcId,makeIndex}),
 close:closeNpcSession,
 afterClose:focusWasWithinWindow=>restoreClassicWindowFocus(classicWindowEntries(),document.querySelector<HTMLElement>('#repair-panel')!,focusWasWithinWindow)
});
let selectedMagic:MagicSkill|undefined;
type DialogueOption={text:string;command:string;input?:boolean};
type DialogueInputOption=DialogueOption;
type DialoguePart={type:'text';text:string}|({type:'option'}&DialogueOption);
type DialogueInputPending={sessionId:number;npcId:number;command:string;key:string;input:HTMLInputElement;button:HTMLButtonElement;label:string};
const dialogueInputDrafts=new Map<string,string>();
let dialogueInputPending:DialogueInputPending|undefined;
type GroupRequest='groupMode'|'groupCreate'|'groupAdd'|'groupRemove';
let groupEnabled=false,groupMemberNames:string[]=[],groupPending:{type:GroupRequest;target?:string;enabled?:boolean}|undefined,groupConfirmationPending:{serial:number;type:Exclude<GroupRequest,'groupMode'>}|undefined,groupConfirmationSerial=0,groupCooldownUntil=0,groupFeedbackText='',attackMode=0,attackModePending:number|'cycle'|undefined,attackModeCommandChatId:number|undefined,attackModeNotice='';
type GuildPendingAction='open'|'members'|'create'|'add'|'remove'|'ally'|'breakAlly';
let guildPendingAction:{action:GuildPendingAction;label:string}|undefined;
type GuildMemberPromptAction='guildAdd'|'guildRemove';
let guildMemberPromptPending:{serial:number;action:GuildMemberPromptAction;guildName:string}|undefined,guildMemberPromptSerial=0;
type GuildActionPrompt='ally'|'breakAlly';
let guildActionPromptPending:{serial:number;action:GuildActionPrompt;guildName:string}|undefined,guildActionPromptSerial=0;
type GuildChatEntry={text:string;foreground?:number;background?:number};
let guildChatMode=false,guildChatEntries:GuildChatEntry[]=[];
let guildName='',guildRankName='',guildNotice='',guildCanManage=false,guildNoticeDraft:string|undefined,guildRanksDraft:string|undefined,guildWarGuildNames:string[]=[],guildWarTimers:{name:string;remainingMs:number}[]=[],guildWarReceivedAt=0,guildAllyGuildNames:string[]=[],guildMemberNames:string[]=[],guildRanks:{rankNo:number;rankName:string;members:string[]}[]=[],castleWarStatus:{phase:'started'|'warning'|'captured'|'ended';castleName:string;remainingMinutes?:number;guildName?:string}|undefined,dialogueNpcId:number|undefined;
type QuestState={id:string;status:string;title:string;summary:string;objective:string;detail:string};
let quests=new Map<string,QuestState>();
let tradeOpen=false,tradeLocal=new Map<number,InventoryItem>(),tradeRemote=new Map<number,InventoryItem>(),tradeLocalSlots=new Map<number,number>(),tradeRemoteSlots=new Map<number,number>(),tradeGold=0,tradeRemoteGold=0;
type TradePendingAction='add'|'remove'|'gold';
let tradePendingAction:TradePendingAction|null=null,tradePendingTimedOut=false,tradeAccepted=false,tradeRequestPending=false,tradeRequestTimedOut=false,tradeCancelPending=false;
let tradePendingMakeIndex:number|undefined;
let tradeRequestTimer:number|undefined,tradeOperationTimer:number|undefined;
let inventory!:InventoryView;
const tradeIconAssets=new ItemIconAssets('items',()=>{if(inventory)renderTrade();});
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
function appendDialogueTextRun(value:string,color:string){
 const token=/COLOR=(cl[A-Za-z]+)\s*/gi;
 let cursor=0,current=color,match:RegExpExecArray|null;
 while((match=token.exec(value))){
  appendDialogueText(value.slice(cursor,match.index),current);
  current=match[1].toLowerCase();
  cursor=match.index+match[0].length;
 }
 appendDialogueText(value.slice(cursor),current);
 return current;
}
function renderDialogueText(value:string){
 dialogueText.replaceChildren();
 appendDialogueTextRun(value,'default');
}
function createDialogueOptionControl(npcId:number,option:DialogueOption,color='default',inline=false){
 if(option.input){
  const form=document.createElement('form');form.className=inline?'dialogue-inline-input':'dialogue-input';
  const input=document.createElement('input');input.type='text';input.maxLength=80;input.placeholder=option.text;
  const session=npcSession.current(),key=session?dialogueInputKey(session,npcId,option.command):undefined;
  if(key!==undefined)input.value=dialogueInputDrafts.get(key)??'';
  input.oninput=()=>{if(key!==undefined)dialogueInputDrafts.set(key,input.value);};
  const button=document.createElement('button');button.type='submit';button.textContent=option.text;button.dataset.idleText=option.text;button.dataset.dialogueCommand=option.command;
  form.onsubmit=event=>{event.preventDefault();submitDialogueInput(npcId,option.command,input,button);};
  form.append(input,button);return form;
 }
 const button=document.createElement('button');button.type='button';button.className=inline?`dialogue-inline-option dialogue-color-${color}`:'dialogue-option';button.textContent=option.text;button.dataset.dialogueCommand=option.command;
 button.onclick=()=>{if(!dialogueInputPending)sendNpcCommand({type:'dialogueSelect',npcId,command:option.command});};
 return button;
}
function renderDialogueParts(npcId:number,parts:DialoguePart[]){
 dialogueText.replaceChildren();let color='default';
 for(const part of parts){
  if(part.type==='text')color=appendDialogueTextRun(part.text,color);
  else if(part.type==='option')dialogueText.append(createDialogueOptionControl(npcId,part,color,true));
 }
}
function dialogueInputKey(session:{npcSessionId:number;mapGeneration:number},npcId:number,command:string){return `${session.npcSessionId}:${session.mapGeneration}:${npcId}:${command}`;}
function releaseDialogueInputPending(focus=false){
 const pending=dialogueInputPending;if(!pending)return undefined;dialogueInputPending=undefined;dialogueOptions.dataset.inputPending='false';
 for(const container of [dialogueOptions,dialogueText])container.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button').forEach(control=>control.disabled=false);
 pending.button.textContent=pending.label;if(focus&&!dialogueElement.hidden)pending.input.focus();return pending;
}
function clearDialogueInputDrafts(){releaseDialogueInputPending();dialogueInputDrafts.clear();dialogueOptions.dataset.inputPending='false';}
function prepareDialogueInputRefresh(npcId:number,options:DialogueInputOption[]){
 const session=npcSession.current();if(!session){clearDialogueInputDrafts();return;}
 const prefix=`${session.npcSessionId}:${session.mapGeneration}:${npcId}:`,available=new Set(options.filter(option=>option.input).map(option=>dialogueInputKey(session,npcId,option.command)));
 for(const key of dialogueInputDrafts.keys())if(key.startsWith(prefix)&&!available.has(key))dialogueInputDrafts.delete(key);
 if(dialogueInputPending)releaseDialogueInputPending();
}
function submitDialogueInput(npcId:number,command:string,input:HTMLInputElement,button:HTMLButtonElement){
 if(dialogueInputPending||!worldCommandsAvailable())return false;
 const session=npcSession.current();if(!session||session.npcId!==npcId){connection.textContent='NPC 对话已关闭，请重新交谈';return false;}
 const key=dialogueInputKey(session,npcId,command),pending:DialogueInputPending={sessionId:session.npcSessionId,npcId,command,key,input,button,label:button.dataset.idleText??button.textContent};
 dialogueInputDrafts.set(key,input.value);dialogueInputPending=pending;dialogueOptions.dataset.inputPending='true';
 for(const container of [dialogueOptions,dialogueText])container.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,button').forEach(control=>control.disabled=true);button.textContent='正在提交…';
 try{if(!sendNpcCommand({type:'dialogueSelect',npcId,command,input:input.value})){releaseDialogueInputPending(true);connection.textContent='NPC 输入未发送，请检查连接后重试';return false;}}
 catch{releaseDialogueInputPending(true);connection.textContent='NPC 输入发送失败，请重试';return false;}
 connection.textContent='正在提交 NPC 输入…';return true;
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
 const busy=groupPending!==undefined||groupConfirmationPending!==undefined,labels:Record<GroupRequest,string>={groupMode:'切换组队邀请',groupCreate:'创建队伍',groupAdd:'邀请成员',groupRemove:'移除成员'};
 groupMode.textContent=`允许组队：${groupEnabled?'开':'关'}`;
 groupMode.dataset.enabled=groupEnabled?'true':'false';
  groupMode.setAttribute('aria-pressed',String(groupEnabled));
 const inGroup=groupMemberNames.length>0;
 groupMode.disabled=busy;groupCreate.disabled=busy||inGroup;groupAdd.disabled=busy||!inGroup;groupRemove.disabled=busy||!inGroup;
 groupStatus.dataset.pending=busy?'true':'false';
 groupStatus.textContent=groupPending?`正在${labels[groupPending.type]}…`:groupConfirmationPending?`等待输入${labels[groupConfirmationPending.type]}对象…`:groupMemberNames.length?`队伍 ${groupMemberNames.length} 人`:'未组队';
  groupFeedback.textContent=groupFeedbackText;groupFeedback.title=groupFeedbackText;groupFeedback.hidden=!groupFeedbackText;
 groupMembers.replaceChildren();
 for(const name of groupMemberNames){const item=document.createElement('li');item.textContent=name;groupMembers.append(item);}
}
function sendGroup(type:GroupRequest,targetOverride?:string){
 if(!worldCommandsAvailable()||groupPending!==undefined||groupCoolingDown())return;
 const inGroup=groupMemberNames.length>0;
 if(type==='groupCreate'&&inGroup||((type==='groupAdd'||type==='groupRemove')&&!inGroup))return;
 const target=targetOverride?.trim();
  if(type!=='groupMode'&&!target){groupFeedbackText='请填写角色名';renderGroup();connection.textContent=groupFeedbackText;return;}
 const message:{type:string;enabled?:boolean;target?:string}={type};
 if(type==='groupMode')message.enabled=!groupEnabled;else message.target=target;
  groupFeedbackText='';groupPending=type==='groupMode'?{type,enabled:message.enabled}:{type,target:message.target};renderGroup();connection.textContent=`正在${type==='groupMode'?'切换组队邀请':type==='groupCreate'?'创建队伍':type==='groupAdd'?'邀请成员':'移除成员'}…`;
  try{socket!.send(JSON.stringify(message));groupCooldownUntil=performance.now()+5000;}catch{groupPending=undefined;groupFeedbackText='队伍操作发送失败，请重试';renderGroup();connection.textContent=groupFeedbackText;}
}
function groupCoolingDown(){return groupCooldownUntil>0&&performance.now()<=groupCooldownUntil;}
function confirmGroupAction(type:Exclude<GroupRequest,'groupMode'>){
 if(!worldCommandsAvailable()||groupPending!==undefined||groupConfirmationPending!==undefined||systemDialog.isOpen()||groupCoolingDown())return;
 const inGroup=groupMemberNames.length>0;
 if(type==='groupCreate'&&inGroup||((type==='groupAdd'||type==='groupRemove')&&!inGroup))return;
 const prompts:Record<Exclude<GroupRequest,'groupMode'>,string>={
  groupCreate:'请输入邀请加入小组的玩家名.',
  groupAdd:'键入您想要参加小组的名字 .',
  groupRemove:'键入您想要从小组被删除的名字.'
 };
 const serial=++groupConfirmationSerial;groupConfirmationPending={serial,type};groupFeedbackText='';renderGroup();
 void systemDialog.showInput({text:prompts[type],buttons:['ok','cancel'],size:'horizontal',input:{label:'角色名',maxLength:10,inputMode:'text'}}).then(answer=>{
  if(groupConfirmationPending?.serial!==serial)return;
  groupConfirmationPending=undefined;renderGroup();
  if(answer.result!=='ok'||!worldCommandsAvailable())return;
  const target=answer.value.trim();
  if(!target){groupFeedbackText='请填写角色名';renderGroup();connection.textContent=groupFeedbackText;return;}
  sendGroup(type,target);
 });
}
function cancelGroupConfirmation(){groupConfirmationSerial++;groupConfirmationPending=undefined;}
function receiveGroupMode(enabled:boolean){
 const pending=groupPending?.type==='groupMode'?groupPending:undefined;if(pending)groupPending=undefined;
  groupEnabled=enabled;
  const message=pending&&pending.enabled!==enabled?'服务器未确认组队邀请设置，已显示当前状态':enabled?'已允许其他玩家组队':'已关闭组队邀请';
  if(pending)groupFeedbackText=message;
  renderGroup();connection.textContent=message;
}
function receiveGroupResult(message:{action:string;accepted:boolean;reason:number}){
 const action=message.action==='create'?'groupCreate':message.action==='add'?'groupAdd':message.action==='remove'?'groupRemove':undefined;
  const matchesPending=action!==undefined&&groupPending?.type===action;
  if(matchesPending)groupPending=undefined;
 const labels:Record<string,string>={create:'创建队伍',add:'邀请成员',remove:'移除成员'};
 const reasons:Record<string,string>={'-1':'当前角色不满足组队条件','-2':'角色不存在或不可用','-3':'对方已经加入其他队伍','-4':'对方关闭了组队','-5':'队伍已满'};
  const result=message.accepted?`${labels[message.action]??'队伍操作'}成功`:`${labels[message.action]??'队伍操作'}失败 · ${reasons[String(message.reason)]??`原因 ${message.reason}`}`;
  if(matchesPending){groupFeedbackText=result;renderGroup();}
  connection.textContent=result;
}
function receiveGroupError(type:string,text:string){if(groupPending?.type===type){groupPending=undefined;groupFeedbackText=text;renderGroup();}connection.textContent=text;}
function renderAttackMode(){
 attackModeSelect.value=String(typeof attackModePending==='number'?attackModePending:attackMode);
 attackModeSelect.disabled=attackModePending!==undefined;
 const label=attackModeSelect.selectedOptions[0]?.textContent??'未知';
 attackModeStatus.dataset.pending=attackModePending===undefined?'false':'true';
 attackModeStatus.textContent=attackModePending===undefined?attackModeNotice||`服务端状态：${label}`:attackModePending==='cycle'?'等待服务器确认攻击模式…':`等待服务器确认：${label}`;
}
function requestAttackMode(mode:number){
 if(!worldCommandsAvailable()||attackModePending!==undefined||!Number.isInteger(mode)||mode<0||mode>6){renderAttackMode();return;}
 attackModeNotice='';attackModePending=mode;renderAttackMode();
 try{socket!.send(JSON.stringify({type:'attackMode',mode}));}
 catch{attackModePending=undefined;attackModeNotice='攻击模式发送失败，请重试';renderAttackMode();connection.textContent=attackModeNotice;}
}
function receiveAttackMode(mode:number){
 const requested=attackModePending;attackModePending=undefined;attackModeCommandChatId=undefined;attackMode=mode;
 const label=attackModeSelect.options[mode]?.textContent??'未知';
 attackModeNotice=requested===undefined?'':requested==='cycle'?`攻击模式已切换：${label}`:requested===mode?`已确认攻击模式：${label}`:`服务端当前攻击模式：${label}`;
 renderAttackMode();connection.textContent=attackModeNotice||`攻击模式：${label}`;
}
function rejectAttackMode(message:string){
 if(typeof attackModePending!=='number')return false;
 attackModePending=undefined;attackModeNotice=message||'攻击模式设置失败，请重试';renderAttackMode();connection.textContent=attackModeNotice;return true;
}
function rejectAttackModeCycle(chatId:number|undefined,message:string){
 if(attackModePending!=='cycle'||attackModeCommandChatId===undefined||chatId!==attackModeCommandChatId)return false;
 attackModePending=undefined;attackModeCommandChatId=undefined;attackModeNotice=message||'攻击模式切换失败，请重试';renderAttackMode();connection.textContent=attackModeNotice;return true;
}
function formatGuildWarTime(remainingMs:number){const totalSeconds=Math.max(0,Math.ceil(remainingMs/1000));const hours=Math.floor(totalSeconds/3600),minutes=Math.floor(totalSeconds%3600/60),seconds=totalSeconds%60;return hours?`${hours}小时${String(minutes).padStart(2,'0')}分`:minutes?`${minutes}分${String(seconds).padStart(2,'0')}秒`:`${seconds}秒`;}
function renderGuildRelations(){
 const warText=guildWarGuildNames.length?`交战：${guildWarGuildNames.map(name=>{const timer=guildWarTimers.find(value=>value.name===name);return timer?`${name}（${formatGuildWarTime(timer.remainingMs-(performance.now()-guildWarReceivedAt))}）`:name;}).join('、')}`:'暂无交战';
 const castleText=castleWarStatus?castleWarStatus.phase==='started'?`${castleWarStatus.castleName}攻城进行中`:castleWarStatus.phase==='warning'?`${castleWarStatus.castleName}攻城剩余${castleWarStatus.remainingMinutes}分钟`:castleWarStatus.phase==='captured'?`${castleWarStatus.castleName}已被${castleWarStatus.guildName}占领`:`${castleWarStatus.castleName}攻城已结束`:'';
 guildRelations.textContent=[guildNotice?`公告：${guildNotice}`:'暂无公告',warText,guildAllyGuildNames.length?`联盟：${guildAllyGuildNames.join('、')}`:'暂无联盟',castleText].filter(Boolean).join(' · ');
}
function guildRanksText(){return guildRanks.flatMap(rank=>[`#${rank.rankNo} <${rank.rankName}>`,...rank.members]).join('\n');}
function syncGuildNotice(notice:string){guildNotice=notice;if(guildNoticeDraft===notice)guildNoticeDraft=undefined;}
function syncGuildRanks(ranks:{rankNo:number;rankName:string;members:string[]}[]){guildRanks=ranks;if(guildRanksDraft===guildRanksText())guildRanksDraft=undefined;}
function beginGuildAction(action:GuildPendingAction,label:string,send:()=>boolean|void){
 if(guildPendingAction||guildMemberPromptPending||guildActionPromptPending||!worldCommandsAvailable())return false;
 guildPendingAction={action,label};renderGuild();
 try{if(send()===false){guildPendingAction=undefined;renderGuild();connection.textContent=`${label}发送失败，请重试`;return false;}}
 catch{guildPendingAction=undefined;renderGuild();connection.textContent=`${label}发送失败，请重试`;return false;}
 connection.textContent=`正在${label}…`;return true;
}
function resolveGuildAction(action:GuildPendingAction){if(guildPendingAction?.action!==action)return false;guildPendingAction=undefined;renderGuild();return true;}
function confirmGuildMemberAction(action:GuildMemberPromptAction){
 if(!worldCommandsAvailable()||guildPendingAction||guildMemberPromptPending||systemDialog.isOpen()||!guildCanManage||!guildName)return;
 const guildAtPrompt=guildName,serial=++guildMemberPromptSerial;guildMemberPromptPending={serial,action,guildName:guildAtPrompt};renderGuild();
 const text=action==='guildAdd'?`请输入您想要让加入行会的玩家姓名： ${guildAtPrompt}.`:'请输入您想从行会删除的玩家姓名：';
 void systemDialog.showInput({text,buttons:['ok','cancel'],size:'horizontal',input:{label:'角色名',maxLength:10,inputMode:'text'}}).then(answer=>{
  if(guildMemberPromptPending?.serial!==serial)return;
  guildMemberPromptPending=undefined;renderGuild();
  if(answer.result!=='ok'||!worldCommandsAvailable())return;
  if(guildName!==guildAtPrompt||!guildCanManage){connection.textContent='行会状态已变化，请重新打开行会窗';return;}
  const target=answer.value.trim();if(!target){connection.textContent='请填写角色名';return;}
  sendGuild(action,target);
 }).catch(()=>{if(guildMemberPromptPending?.serial!==serial)return;guildMemberPromptPending=undefined;renderGuild();connection.textContent='行会输入提示无法打开';});
}
function confirmGuildAction(action:GuildActionPrompt){
 if(!worldCommandsAvailable()||guildPendingAction||guildMemberPromptPending||guildActionPromptPending||systemDialog.isOpen()||!guildCanManage||!guildName)return;
 const guildAtPrompt=guildName,serial=++guildActionPromptSerial;guildActionPromptPending={serial,action,guildName:guildAtPrompt};renderGuild();
 const request=action==='ally'
  ?systemDialog.show({text:'双方掌门人须同意并相邻。确定要请求结盟吗？',buttons:['ok','cancel'],size:'horizontal'}).then(result=>({result,value:''}))
  :systemDialog.showInput({text:'请输入需要解除联盟的行会名：',buttons:['ok','cancel'],size:'horizontal',input:{label:'行会名',maxLength:10,inputMode:'text'}});
 void request.then(answer=>{
  if(guildActionPromptPending?.serial!==serial)return;
  guildActionPromptPending=undefined;renderGuild();
  if(answer.result!=='ok'||!worldCommandsAvailable())return;
  if(guildName!==guildAtPrompt||!guildCanManage){connection.textContent='行会状态已变化，请重新打开行会窗';return;}
  if(action==='ally')beginGuildAction('ally','请求结盟',()=>{socket!.send(JSON.stringify({type:'guildAlly'}));});
  else{const target=answer.value.trim();if(!target){connection.textContent='请填写行会名';return;}beginGuildAction('breakAlly',`解除与 ${target} 的联盟`,()=>{socket!.send(JSON.stringify({type:'guildBreakAlly',target}));});}
 }).catch(()=>{if(guildActionPromptPending?.serial!==serial)return;guildActionPromptPending=undefined;renderGuild();connection.textContent='行会操作提示无法打开';});
}
function cancelGuildActionPrompt(){guildActionPromptSerial++;guildActionPromptPending=undefined;}
function guildActionForCommand(commandType:string):GuildPendingAction|undefined{
 const actions:Record<string,GuildPendingAction>={guildOpen:'open',guildMembers:'members',guildCreate:'create',guildAdd:'add',guildRemove:'remove',guildAlly:'ally',guildBreakAlly:'breakAlly'};
 return actions[commandType];
}
function guildActionForResult(result:string):GuildPendingAction|undefined{
 const actions:Record<string,GuildPendingAction>={open:'open',create:'create',add:'add',remove:'remove',ally:'ally',breakAlly:'breakAlly'};
 return actions[result];
}
function handleGuildCommandError(commandType:string,message:string){
 if(!['guildOpen','guildMembers','guildAdd','guildRemove','guildNotice','guildRanks','guildAlly','guildBreakAlly'].includes(commandType))return false;
 const action=guildActionForCommand(commandType);if(action)resolveGuildAction(action);
 if(commandType==='guildNotice')guildNoticeDraft=undefined;if(commandType==='guildRanks')guildRanksDraft=undefined;renderGuild();
 connection.textContent=message||'行会操作失败';appendChat('system',`行会操作失败：${message||'请检查行会状态'}`);return true;
}
function appendGuildChatEntry(entry:GuildChatEntry){const line=document.createElement('li'),content=document.createElement('span');content.textContent=entry.text;applyClassicChatColors(content,entry.foreground,entry.background);line.append(content);line.setAttribute('aria-label',`行会 ${entry.text}`);guildChatLog.append(line);}
function renderGuildChat(){
 const previousTop=guildChatLog.scrollTop;guildChatLog.replaceChildren();
 for(const entry of guildChatEntries)appendGuildChatEntry(entry);
 guildChatLog.scrollTop=Math.min(previousTop,Math.max(0,guildChatLog.scrollHeight-guildChatLog.clientHeight));
}
function setGuildChatMode(enabled:boolean){
 if(guildChatMode===enabled)return;guildChatMode=enabled;guildChatLog.hidden=!enabled;guildRelations.hidden=enabled;guildMembers.hidden=enabled;guildRanksElement.hidden=enabled;
 const label=enabled?'返回行会资料':'聊天记录';guildChatToggle.setAttribute('aria-pressed',String(enabled));guildChatToggle.setAttribute('aria-label',label);guildChatToggle.title=label;
 const list=enabled?guildChatLog:guildMembers;guildScrollUp.setAttribute('aria-controls',list.id);guildScrollDown.setAttribute('aria-controls',list.id);
 if(enabled){guildChatLog.scrollTop=0;renderGuildChat();}
}
function toggleGuildChat(){setGuildChatMode(!guildChatMode);}
function recordGuildChat(channel:string,text:string,foreground?:number,background?:number){
 if(channel!=='guild')return false;const entry={text,foreground,background};guildChatEntries.push(entry);const trimmed=guildChatEntries.length>500;if(trimmed)guildChatEntries.splice(0,101);if(guildChatMode){if(trimmed)renderGuildChat();else appendGuildChatEntry(entry);}return true;
}
function scrollGuildWindow(direction:-1|1){const list=guildChatMode?guildChatLog:guildMembers;return scrollGuildMemberList(list,direction,guildScrollSpec.stepRows,guildScrollSpec.lineHeight);}
function renderGuild(){
 if(!guildName&&guildChatMode)setGuildChatMode(false);
 const title=guildName?(guildRankName?`${guildName} · ${guildRankName}`:guildName):'未加入行会';
 const busy=Boolean(guildPendingAction||guildMemberPromptPending||guildActionPromptPending);
 guildStatus.dataset.pending=busy?'true':'false';guildStatus.textContent=guildPendingAction?`${title} · 正在${guildPendingAction.label}…`:guildMemberPromptPending?`${title} · 等待输入${guildMemberPromptPending.action==='guildAdd'?'邀请':'移除'}成员姓名…`:guildActionPromptPending?`${title} · 等待${guildActionPromptPending.action==='ally'?'结盟确认':'解除联盟输入'}…`:title;
 const inWorld=document.body.classList.contains('in-world'),canSend=inWorld&&worldCommandsAvailable(),canManage=canSend&&Boolean(guildName)&&guildCanManage;
 guildOpen.disabled=!canSend||busy;guildMembersRequest.disabled=!canSend||busy;
 guildCreateRow.hidden=Boolean(guildName)||dialogueNpcId===undefined;guildCreate.disabled=!canSend||busy||guildCreateRow.hidden;
 guildMemberControls.hidden=!canManage;guildManagement.hidden=!canManage;
 guildWarRequest.disabled=!canManage||busy||dialogueNpcId===undefined||!guildName;
 guildCastleDialogue.disabled=!canManage||busy||dialogueNpcId===undefined||!guildName;
 guildAdd.disabled=!canManage||busy||!guildName;guildRemove.disabled=!canManage||busy||!guildName;
 guildNoticeSave.disabled=!canManage||busy||!guildName;guildRanksSave.disabled=!canManage||busy||!guildName;
 guildAlly.disabled=!canManage||busy||!guildName;guildBreakAlly.disabled=!canManage||busy||!guildName;
 renderGuildRelations();
 guildMembers.replaceChildren();
 for(const name of guildMemberNames){const item=document.createElement('li');item.textContent=name;guildMembers.append(item);}
 guildRanksElement.replaceChildren();
 for(const rank of guildRanks){const row=document.createElement('p');row.textContent=`${rank.rankNo}. ${rank.rankName}：${rank.members.join('、')||'暂无成员'}`;guildRanksElement.append(row);}
}
window.setInterval(()=>{if(guildWarTimers.length||castleWarStatus)renderGuildRelations();},1000);
function sendGuild(type:'guildOpen'|'guildMembers'|'guildAdd'|'guildRemove',targetOverride?:string){
 if(!worldCommandsAvailable()||guildPendingAction||guildMemberPromptPending||guildActionPromptPending)return;
 const message:{type:string;target?:string}={type};
 if(message.type==='guildAdd'||message.type==='guildRemove'){message.target=targetOverride?.trim();if(!message.target){connection.textContent='请填写角色名';return;}}
 const actions:Record<typeof type,{action:GuildPendingAction;label:string}>={guildOpen:{action:'open',label:'打开行会'},guildMembers:{action:'members',label:'读取成员列表'},guildAdd:{action:'add',label:'邀请成员'},guildRemove:{action:'remove',label:'移除成员'}};
 const pending=actions[type],started=beginGuildAction(pending.action,pending.label,()=>{socket!.send(JSON.stringify(message));});if(started&&(type==='guildOpen'||type==='guildMembers'))setGuildChatMode(false);
}
function ensureTradeSlots(items:Map<number,InventoryItem>,slots:Map<number,number>){
 const used=new Set<number>();
 for(const [id,slot] of [...slots])if(!items.has(id)||!Number.isInteger(slot)||slot<0||slot>=10||used.has(slot))slots.delete(id);else used.add(slot);
 for(const item of items.values())if(!slots.has(item.makeIndex)){const slot=Array.from({length:10},(_,index)=>index).find(index=>!used.has(index));if(slot===undefined)break;slots.set(item.makeIndex,slot);used.add(slot);}
 return new Map([...slots].flatMap(([id,slot])=>{const item=items.get(id);return item?[[slot,item] as const]:[]}));
}
function renderTrade(){
 tradePanel.dataset.tradeOpen=tradeOpen?'true':'false';
 tradePanel.dataset.tradeAccepted=tradeAccepted?'true':'false';tradePanel.dataset.tradePending=tradePendingAction??'';tradePanel.dataset.tradeCancelPending=tradeCancelPending?'true':'false';
 tradeStatus.textContent=tradeOpen?(tradeCancelPending?'正在取消交易…':tradePendingAction?(tradePendingTimedOut?'服务器仍未回应，报价状态未确认；请取消交易':'正在同步交易报价…'):tradeAccepted?'我方已确认，等待交易完成':tradeTarget.value||'对方'):tradeRequestPending?'交易邀请已发送，等待回应…':tradeRequestTimedOut?'邀请回应超时，可以重新发起':'填写对象并发起交易';
 document.querySelector<HTMLElement>('#trade-remote-gold')!.textContent=`金币 ${tradeRemoteGold}`;
 tradeRequestForm.hidden=tradeOpen;tradeTarget.disabled=tradeOpen||tradeRequestPending;tradeRequestButton.disabled=tradeRequestPending;tradeAccept.hidden=!tradeOpen;tradeAccept.textContent=tradeAccepted?'已确认':'确认交易';tradeAccept.setAttribute('aria-pressed',String(tradeAccepted));
 const offerLocked=!tradeOpen||tradePendingAction!==null||tradeAccepted||tradeCancelPending;
 tradeGoldInput.disabled=offerLocked;tradeSetGold.disabled=offerLocked;tradeAccept.disabled=offerLocked;tradeCancel.disabled=!tradeOpen||tradeCancelPending;
 tradeLocalItems.replaceChildren();tradeRemoteItems.replaceChildren();
 const localBySlot=ensureTradeSlots(tradeLocal,tradeLocalSlots),remoteBySlot=ensureTradeSlots(tradeRemote,tradeRemoteSlots);
 for(let slot=0;slot<10;slot++){
  // DDealDlgSelect consumes a held bag item on any local trade cell before its contents.
  const item=localBySlot.get(slot),held=inventory.heldItem(),cell=document.createElement('li'),button=document.createElement('button');cell.className='trade-slot';cell.dataset.slot=String(slot);button.type='button';button.className=`trade-slot-button ${item?'trade-slot-button--local':'trade-slot-button--empty'}${held&&!offerLocked?' trade-slot-button--drop-target':''}`;button.disabled=item?false:offerLocked;
  if(item){cell.dataset.itemId=String(item.makeIndex);button.setAttribute('aria-disabled',String(offerLocked));button.title=held&&!offerLocked?`放入选中的背包物品 · 当前：${item.name}`:`我方交易物品：${item.name}`;button.setAttribute('aria-label',`我方交易物品：${item.name}，${held&&!offerLocked?'点击放入选中的背包物品':'点击取回'}`);button.append(itemIconElement(item,tradeIconAssets,{className:'trade-item-icon',maxWidth:30,maxHeight:28,isCurrent:()=>tradeLocal.get(item.makeIndex)===item}));const hint=document.createElement('span');hint.className='trade-slot-action';hint.textContent=held&&!offerLocked?'放入':'取回';button.append(hint);button.onclick=()=>{const current=inventory.heldItem();if(!offerLocked&&current){inventory.offerToTrade(current.makeIndex);return;}if(!offerLocked)sendTradeMutation('remove',{type:'tradeRemove',makeIndex:item.makeIndex});};attachItemTooltip(button,item,'我方交易物品');}
  else{button.setAttribute('aria-label',`我方交易空格 ${slot+1}`);button.title=offerLocked?'':'放入当前选中的背包物品';button.onclick=()=>{const held=inventory.heldItem();if(held)inventory.offerToTrade(held.makeIndex);};}
  button.ondragover=event=>{if(offerLocked)return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';};
  button.ondrop=event=>{if(offerLocked)return;event.preventDefault();event.stopPropagation();const raw=event.dataTransfer?.getData('text/plain');if(!/^[0-9]+$/.test(raw??''))return;const makeIndex=Number(raw);if(Number.isSafeInteger(makeIndex))inventory.offerToTrade(makeIndex);};
  cell.append(button);tradeLocalItems.append(cell);
 }
 for(let slot=0;slot<10;slot++){
  const item=remoteBySlot.get(slot),cell=document.createElement('li'),button=document.createElement('button');cell.className='trade-slot trade-slot--remote';cell.dataset.slot=String(slot);button.type='button';button.className='trade-slot-button trade-slot-button--remote';button.tabIndex=0;button.setAttribute('aria-disabled','true');
  if(item){cell.dataset.itemId=String(item.makeIndex);button.title=`对方交易物品：${item.name}`;button.setAttribute('aria-label',`对方交易物品：${item.name}`);button.append(itemIconElement(item,tradeIconAssets,{className:'trade-item-icon',maxWidth:30,maxHeight:28,isCurrent:()=>tradeRemote.get(item.makeIndex)===item}));attachItemTooltip(button,item,'对方交易物品');}
  else button.setAttribute('aria-label',`对方交易空格 ${slot+1}`);
  cell.append(button);tradeRemoteItems.append(cell);
 }
 for(const button of nearbyTradeButtons)button.disabled=tradeRequestPending;
}
function clearTradeTimers(){if(tradeRequestTimer!==undefined)clearTimeout(tradeRequestTimer);if(tradeOperationTimer!==undefined)clearTimeout(tradeOperationTimer);tradeRequestTimer=undefined;tradeOperationTimer=undefined;}
function releasePendingTradeItem(){const makeIndex=tradePendingMakeIndex;tradePendingMakeIndex=undefined;if(makeIndex!==undefined)inventory.resolve(makeIndex,false,false);}
function resolveTradeMutation(){if(tradeOperationTimer!==undefined)clearTimeout(tradeOperationTimer);tradeOperationTimer=undefined;tradePendingAction=null;tradePendingTimedOut=false;tradePendingMakeIndex=undefined;}
function sendTradeMutation(action:TradePendingAction,message:Record<string,string|number>){if(!tradeOpen||tradeAccepted||tradePendingAction!==null||!worldCommandsAvailable())return false;if(action==='add'&&tradeLocal.size>=10){connection.textContent='我方交易栏已满';return false;}tradePendingAction=action;tradePendingMakeIndex=action==='add'&&typeof message.makeIndex==='number'?message.makeIndex:undefined;tradePendingTimedOut=false;renderTrade();tradeOperationTimer=window.setTimeout(()=>{if(tradePendingAction===action){tradePendingTimedOut=true;renderTrade();}},12000);try{socket!.send(JSON.stringify(message));return true;}catch{resolveTradeMutation();renderTrade();connection.textContent='交易报价发送失败，请重试或取消交易';return false;}}
function clearTrade(){clearTradeTimers();releasePendingTradeItem();tradeOpen=false;tradeLocal.clear();tradeRemote.clear();tradeLocalSlots.clear();tradeRemoteSlots.clear();tradeGold=0;tradeRemoteGold=0;tradePendingAction=null;tradePendingMakeIndex=undefined;tradePendingTimedOut=false;tradeAccepted=false;tradeRequestPending=false;tradeRequestTimedOut=false;tradeCancelPending=false;tradeTarget.value='';tradeGoldInput.value='0';renderTrade();}
const skillBar=new SkillBar(document.querySelector<HTMLElement>('#skills')!,{
 chooseKey:skill=>worldInputAvailable()?skillKeyDialog.show(skill):Promise.resolve('interrupted'),closeKeyDialog:()=>skillKeyDialog.interrupt(),
 select:skill=>{if(skill)mining.cancel();selectedMagic=skill;classicHud.selectSkill(skill?.magicId);connection.textContent=skill?`已选择 ${skill.name}，请点击目标`:'已取消技能选择';},
 self:skill=>castSelf(skill),
 bind:(skill,key,bindingId)=>{
  if(!worldInputAvailable()||socket?.readyState!==WebSocket.OPEN||!gatewayFeatures.magicKeyBinding)return false;
  socket!.send(JSON.stringify({type:'setMagicKey',magicId:skill.magicId,key,bindingId}));return true;
 }
});
const classicHud=new ClassicHud(document.querySelector<HTMLElement>('#classic-hud')!,index=>activateSkillSlot(index));
const classicAuth=new ClassicAuth(document.querySelector<HTMLElement>('#auth-overlay')!,phase=>audio.setPhase(phase));
new ClassicStage(document.querySelector<HTMLElement>('#game-stage')!,document.querySelector<HTMLElement>('#viewport-shell')!);
const view=await createMapView(document.querySelector<HTMLElement>('#viewport')!,document.querySelector<HTMLOutputElement>('#status')!);
const worldTone=new WorldTone(view.app.stage);
const minimap=new MiniMapController(document.querySelector<HTMLElement>('[data-hud-minimap-frame]')!,startMapRoute);
void minimap.setMap('0',view.width,view.height);
const magicEffects=new MagicEffects(view.depth,id=>entities.get(id));
let ignoreCanvasPointerUntil=0;
let lastAttack=0;
inventory=new InventoryView(document.querySelector<HTMLElement>('#inventory-items')!,{
 drop:makeIndex=>{if(!worldCommandsAvailable())return false;socket!.send(JSON.stringify({type:'dropItem',makeIndex}));return true;},
 equip:(makeIndex,slot)=>{if(!worldCommandsAvailable())return false;socket!.send(JSON.stringify({type:'equipItem',makeIndex,slot:equipment.preferredSlot(slot)}));return true;},
 use:makeIndex=>{if(!worldCommandsAvailable())return false;socket!.send(JSON.stringify({type:'useItem',makeIndex}));return true;},
 trade:makeIndex=>sendTradeMutation('add',{type:'tradeAdd',makeIndex}),
 selectService:item=>selectInventoryForService(item,inventoryServiceTargets,canSelectServiceInventory),
  availabilityChanged:()=>itemQuickBar.refreshAvailability(),
   layoutKey:()=>selectedCharacter?`mir2.inventory-layout.${selectedCharacter}`:undefined,
   readAttributes:()=>characterPanel.debugState()
});
renderTrade();
shop.setInventoryInteraction({reserve:(makeIndex,reserved)=>reserved?inventory.reserveForService(makeIndex):inventory.releaseFromService(makeIndex),hold:(makeIndex,clientX,clientY)=>inventory.holdFromService(makeIndex,clientX,clientY)});
const itemQuickBar=new ItemQuickBar(document.querySelector<HTMLElement>('[data-hud-item-quickbar]')!,{
 inventory,
 use:makeIndex=>inventory.useItem(makeIndex),
 status:text=>{connection.textContent=text;},
 layoutKey:()=>selectedCharacter?`mir2.item-quickbar.${selectedCharacter}`:undefined,
 heldItem:()=>inventory.heldItem(),
 clearHeld:()=>inventory.cancelSelection(),
 canUse:makeIndex=>inventory.selectableItem(makeIndex)!==undefined
});
const equipment=new EquipmentView(document.querySelector<HTMLElement>('#equipment-items')!,slot=>{if(!worldCommandsAvailable())return false;socket!.send(JSON.stringify({type:'takeOffItem',slot}));return true;},(makeIndex,slot)=>inventory.equipInto(makeIndex,slot),()=>inventory.heldItem()?.makeIndex);
const inventoryServiceTargets=[
 {panel:document.querySelector<HTMLElement>('#shop-panel')!,view:shop},
 {panel:document.querySelector<HTMLElement>('#repair-panel')!,view:repair},
 {panel:document.querySelector<HTMLElement>('#storage-panel')!,view:storage}
];
function canSelectServiceInventory(){return worldInputAvailable()&&Boolean(npcSession.current())&&dialogueElement.hidden&&socket?.readyState===WebSocket.OPEN;}
for(const target of inventoryServiceTargets)bindInventoryServiceSlot(target,inventory,canSelectServiceInventory);
function syncServiceInventory(){const items=inventory.debugState().items.map(({slot,...item})=>item);shop.syncInventory(items);repair.syncInventory(items);storage.syncInventory(items);}
const paperdoll=new PaperdollView(document.querySelector<HTMLElement>('#paperdoll-actor')!);
const characterWindow=document.querySelector<HTMLElement>('#character-window')!;
const inventoryWindow=document.querySelector<HTMLElement>('#inventory-window')!;
const classicWindow=document.querySelector<HTMLElement>('#classic-window')!;
const classicWindowTitle=document.querySelector<HTMLElement>('#classic-window-title')!;
const classicWindowBody=document.querySelector<HTMLElement>('#classic-window-body')!;
const classicModalLayer=document.querySelector<HTMLElement>('#classic-modal-layer')!;
let goldDrop:GoldDropController|undefined;
function updateCurrency(values:{gold?:number;gameGold?:number}){characterPanel.currency(values);classicHud.currency(values);if(values.gold!==undefined){inventory.currency(values.gold);if(typeof goldDrop!=='undefined')goldDrop?.setGold(values.gold);}}
for(const panel of [dialogueElement,document.querySelector<HTMLElement>('#shop-panel')!,document.querySelector<HTMLElement>('#repair-panel')!,document.querySelector<HTMLElement>('#storage-panel')!,revivePanel])classicModalLayer.append(panel);
const classicSurface=document.querySelector<HTMLElement>('#viewport-shell')!;
const systemDialog=new SystemDialogController(classicModalLayer,classicSurface,{onVisibilityChange:active=>{if(active){if(typeof skillKeyDialog!=='undefined')skillBar.cancelKeyBinding();cancelWorldIntent();if(typeof goldDrop!=='undefined')goldDrop?.cancelMoving();}}});
const skillKeyDialog=new SkillKeyDialogController(classicModalLayer,{onVisibilityChange:open=>{if(open){cancelWorldIntent();inventory.cancelSelection();goldDrop?.cancelMoving();}}});
goldDrop=new GoldDropController(document.querySelector<HTMLElement>('[data-inventory-gold-icon]')!,inventoryWindow,view.app.canvas,{
 amountOutput:document.querySelector<HTMLElement>('[data-inventory-gold]')!,
 onPickup:()=>{cancelWorldIntent();inventory.cancelSelection();},onWorldDrop:cancelWorldIntent,
 available:()=>worldCommandsAvailable()&&document.body.classList.contains('in-world')&&!inventoryWindow.hidden,
 prompt:request=>systemDialog.showInput(request),
 send:amount=>{if(!worldCommandsAvailable())return false;socket!.send(JSON.stringify({type:'dropGold',amount}));return true;},
 status:text=>{connection.textContent=text;}
});
const displaySettings=new DisplaySettings();
const settings=new ClientSettingsView(classicModalLayer,classicSurface,{audio,display:displaySettings,logout:mode=>void logout.request(mode),canLogout,onVisibilityChange:open=>{if(open){skillBar.cancelKeyBinding();cancelWorldIntent();inventory.cancelSelection();if(typeof goldDrop!=='undefined')goldDrop?.cancelMoving();}}});
const guildEditor=new GuildEditor(classicModalLayer,classicSurface,{save:(kind,value)=>{if(socket?.readyState!==WebSocket.OPEN||logout.isWaiting()||settings.isOpen()||systemDialog.isOpen()||!guildCanManage||!guildName)return '行会状态已变化，请重新打开行会窗';try{if(kind==='notice'){socket.send(JSON.stringify({type:'guildNotice',notice:value}));guildNoticeDraft=value===guildNotice?undefined:value;connection.textContent='正在保存行会公告…';}else{const parsed=parseGuildRankDraft(value);if(parsed.error)return parsed.error;socket.send(JSON.stringify({type:'guildRanks',ranks:parsed.ranks}));guildRanksDraft=value===guildRanksText()?undefined:value;connection.textContent='正在保存封号配置…';}renderGuild();return;}catch{return '发送失败，请检查连接后重试';}}});
const logoutWaitingView=new LogoutWaitingView(classicModalLayer);
const logoutWait=logoutWaitingView.element;
const logout=new LogoutController({available:canLogout,mapGeneration:()=>mapGeneration,sessionGeneration:()=>sessionGeneration,
 confirm:mode=>systemDialog.show({text:mode==='reselect'?'是否重新选择人物？':'确定退出并返回登录吗？',buttons:['ok','cancel']}),
 send:request=>{if(socket?.readyState!==WebSocket.OPEN)return false;socket!.send(JSON.stringify(request));return true;},
 onWaiting:()=>{settings.hide(false);cancelWorldIntent();inventory.cancelSelection();if(typeof goldDrop!=='undefined')goldDrop?.cancelMoving();logoutWaitingView.show();},
 onAccepted:()=>{credentials=undefined;reconnectEnabled=false;if(reconnectTimer!==undefined){clearTimeout(reconnectTimer);reconnectTimer=undefined;}guildEditor.cancel();systemDialog.interrupt();if(typeof goldDrop!=='undefined')goldDrop?.interrupt();equipment.rejectPending();skillBar.cancelKeyBinding();skillBar.cancelSelection();skillBar.resolve();npcSession.invalidate();hideDialogue();shop.clear();repair.clear();storage.clear();magicEffects.clear();worldTone.clear();for(const visual of visuals.values())visual.destroy();visuals.clear();audio.setPhase('silent');worldReady=false;mapReady=Promise.resolve();},
 onResult:state=>finishLogout(state),status:text=>{connection.textContent=text;}
});
displaySettings.subscribe(value=>{minimap.setMode(value.minimapMode);chatLog.hidden=!value.chatLogVisible;});
const settingsEntry=document.createElement('button');settingsEntry.type='button';settingsEntry.className='client-settings-entry';settingsEntry.textContent=settingsContract.entry.label;settingsEntry.dataset.layoutEvidence=settingsContract.entry.layoutEvidence;settingsEntry.setAttribute('aria-label','Web 设置');Object.assign(settingsEntry.style,{left:`${settingsContract.entry.x}px`,top:`${settingsContract.entry.y}px`,width:`${settingsContract.entry.width}px`,height:`${settingsContract.entry.height}px`});document.querySelector<HTMLElement>('#classic-hud')!.append(settingsEntry);settingsEntry.onclick=()=>{if(document.body.classList.contains('in-world')&&!logout.isBusy()&&!systemDialog.isOpen())settings.show();};
function canLogout(){return socket?.readyState===WebSocket.OPEN&&gatewayFeatures.logout&&document.body.classList.contains('in-world')&&self!==undefined;}
function worldCommandsAvailable(){return socket?.readyState===WebSocket.OPEN&&!classicAuth.isEntrySceneOpen?.()&&!skillKeyDialog.isOpen()&&!logout.isWaiting()&&!settings.isOpen()&&!systemDialog.isOpen()&&!guildEditor.isOpen();}
function deferWorldCommand(message:object,delay:number){const active=socket,generation=sessionGeneration;window.setTimeout(()=>{if(socket===active&&sessionGeneration===generation&&worldCommandsAvailable())active!.send(JSON.stringify(message));},delay);}
function cycleMinimap(){minimap.cycle();displaySettings.set({minimapMode:minimap.debugState().mode});}
function finishLogout(state:LogoutState){
 logoutWait.hidden=true;settings.hide(false);
 if(state.state==='failed'&&state.requiresLogin===false){connection.textContent=state.message??'退出请求被拒绝。';return;}
 reconnectEnabled=false;if(reconnectTimer!==undefined){clearTimeout(reconnectTimer);reconnectTimer=undefined;}
 clearWorld();worldReady=false;document.body.classList.remove('in-world');mapReady=Promise.resolve();selectedCharacter=undefined;credentials=undefined;classicAuth.setBusy(false);
 if(state.state==='characters'&&socket?.readyState===WebSocket.OPEN){showCharacterSelection(socket,state.characters as SelectCharacter[]);return;}
 const previous=socket;socket=undefined;previous?.close();classicAuth.showLogin();connection.textContent=state.message??(state.state==='login'?'已返回登录':'退出结果未确认，请重新登录。');
}
function showCharacterSelection(active:WebSocket,list:SelectCharacter[],resumeCharacter?:string,waitForStart?:()=>void){
 ++selectionRevision;characterDelete.interrupt();classicAuth.setDeleteEnabled(gatewayFeatures.characterDeletion===true);
 for(const candidate of list)void preloadPlayerLocomotion(((candidate.sex&1)<<24)|((candidate.hair??0)<<16));
 const generation=sessionGeneration,revision=selectionRevision;
 const enter=(name:string)=>{if(socket!==active||active.readyState!==WebSocket.OPEN||generation!==sessionGeneration||revision!==selectionRevision||logout.isBusy()||characterDelete.isBusy()||systemDialog.isOpen())return;selectedCharacter=name;classicAuth.setBusy(true);loadQuest();active.send(JSON.stringify({type:'selectCharacter',name}));waitForStart?.();connection.textContent='正在进入游戏…';};
 const resumed=resumeCharacter===undefined?undefined:list.find(candidate=>candidate.name===resumeCharacter);if(resumed){enter(resumed.name);connection.textContent='正在返回安全区…';return;}
 setWorldConnectionState();
 classicAuth.setBusy(false);classicAuth.showSelect(list,{start:enter,create:()=>{if(socket===active&&generation===sessionGeneration&&!systemDialog.isOpen()&&!logout.isBusy()&&!characterDelete.isBusy())classicAuth.showCreate();},exit:()=>{
  if(systemDialog.isOpen()||characterDelete.isBusy())return;void systemDialog.show({text:'确定退出并返回登录吗？',buttons:['ok','cancel']}).then(result=>{
   if(result!=='ok'||socket!==active||generation!==sessionGeneration||document.querySelector<HTMLElement>('#auth-overlay')!.dataset.authScene!=='select')return;
   reconnectEnabled=false;credentials=undefined;selectedCharacter=undefined;armCurrentAuthWait=undefined;clearAuthenticationWait(active);socket=undefined;active.close();classicAuth.showLogin();classicAuth.setBusy(false);connection.textContent='已返回登录';
  });
 }},selectedServer??'');connection.textContent=list.length?'选择角色后点击开始游戏':'当前账号没有角色，请创建武士、法师或道士。';
}
let selectionRevision=0;
const characterDelete=new CharacterDeleteController({
 available:()=>socket?.readyState===WebSocket.OPEN&&gatewayFeatures.characterDeletion&&document.querySelector<HTMLElement>('#auth-overlay')!.dataset.authScene==='select'&&!logout.isBusy(),
 confirm:text=>systemDialog.show({text,buttons:['yes','no','cancel'],size:'vertical'}),
 send:command=>{if(socket?.readyState!==WebSocket.OPEN)return false;socket.send(JSON.stringify(command));connection.textContent=`正在删除 ${command.name}，请等待服务器确认…`;return true;},
 busy:value=>classicAuth.setBusy(value),
 result:value=>{
  if(!value.requiresLogin&&socket&&value.characters)showCharacterSelection(socket,value.characters);
  connection.textContent=value.status==='deleted'?`角色 ${value.name} 已删除。`:value.status==='rejected'?'删除角色失败，请联系管理员。':value.status==='not-deleted'?'服务器未确认角色已删除，请检查角色列表。':value.status==='not-sent'?'删除请求未发送，请重新登录。':'删除结果未确认，请重新登录核对角色列表。';
  if(!value.requiresLogin)showAuthNotice(connection.textContent);
 },
 unknown:()=>{const text=connection.textContent;const previous=socket;socket=undefined;reconnectEnabled=false;credentials=undefined;selectedCharacter=undefined;if(reconnectTimer!==undefined){clearTimeout(reconnectTimer);reconnectTimer=undefined;}++selectionRevision;systemDialog.interrupt();previous?.close();classicAuth.showLogin();classicAuth.setDeleteEnabled(false);classicAuth.setBusy(false);connection.textContent=text;showAuthNotice(text);}
});
classicAuth.bindDelete(name=>{
 if(systemDialog.isOpen())return;const active=socket,generation=sessionGeneration,revision=selectionRevision;
 void characterDelete.request(name,()=>socket===active&&active?.readyState===WebSocket.OPEN&&sessionGeneration===generation&&selectionRevision===revision&&classicAuth.selectedCharacterName()===name&&document.querySelector<HTMLElement>('#auth-overlay')!.dataset.authScene==='select');
});
const passwordForm=document.querySelector<HTMLFormElement>('#change-password')!;
let passwordSceneGeneration=0;
function showAuthNotice(text:string,field?:PasswordChangeField,afterClose?:()=>void){
 const generation=passwordSceneGeneration;
 void systemDialog.show({text,buttons:['ok']}).then(result=>{
  if(result==='ok'&&generation===passwordSceneGeneration){if(field&&classicAuth.isPasswordChangeOpen())passwordForm.querySelector<HTMLInputElement>(`[data-password-field="${field}"]`)?.focus();afterClose?.();}
 });
}
const passwordChange=new PasswordChangeController({
 connect:()=>new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`),
 onPending:pending=>{classicAuth.setBusy(pending);if(pending)connection.textContent='正在修改密码，请等待服务器确认…';},
 onValidation:(text,field)=>showAuthNotice(text,field),
 onResult:result=>{
  connection.textContent=passwordChangeMessage(result);
  if(result.accepted===true){const account=passwordForm.querySelector<HTMLInputElement>('[data-password-field="account"]')!.value;document.querySelector<HTMLInputElement>('#account')!.value=account;++passwordSceneGeneration;classicAuth.showLogin();}
  if(result.status!=='cancelled')showAuthNotice(passwordChangeMessage(result),result.accepted===false&&result.status==='rejected'&&result.reason===-1?'oldPassword':undefined);
 }
});
classicAuth.bindPasswordActions({
 open:()=>{
  ++passwordSceneGeneration;systemDialog.interrupt();reconnectEnabled=false;credentials=undefined;selectedCharacter=undefined;
  if(reconnectTimer!==undefined){clearTimeout(reconnectTimer);reconnectTimer=undefined;}
  const previous=socket;socket=undefined;previous?.close();document.querySelector<HTMLInputElement>('#password')!.value='';connection.textContent='请输入原密码和新密码。';
 },
 cancel:()=>{++passwordSceneGeneration;systemDialog.interrupt();const pending=passwordChange.isPending();passwordChange.cancel();classicAuth.setBusy(false);classicAuth.showLogin();if(!pending)connection.textContent='等待登录';}
});
passwordForm.addEventListener('submit',event=>{
 event.preventDefault();if(!classicAuth.isPasswordChangeOpen()||systemDialog.isOpen())return;
 const fields={} as PasswordChangeFields;
 for(const field of ['account','oldPassword','newPassword','repeatPassword'] as const)fields[field]=passwordForm.querySelector<HTMLInputElement>(`[data-password-field="${field}"]`)!.value;
 passwordChange.submit(fields);
});
window.addEventListener('pagehide',event=>{if(!event?.persisted)worldTone.destroy();characterDelete.destroy();passwordChange.destroy();classicAuth.clearPasswordChange();skillKeyDialog.destroy();systemDialog.interrupt();if(typeof goldDrop!=='undefined')goldDrop?.destroy();logout.interrupt();settings.destroy();logoutWaitingView.destroy();audio.dispose();credentials=undefined;});
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
const standaloneUtilityWindowIds=new Set(['group','guild','trade']);
const standaloneUtilityWindows=classicWindowSources.filter(source=>standaloneUtilityWindowIds.has(source.id));
for(const source of classicWindowSources){
 if(standaloneUtilityWindowIds.has(source.id)){source.node.hidden=true;source.node.classList.add('classic-utility-window');source.node.style.position='absolute';classicSurface.append(source.node);}
 else{source.node.hidden=source.id!=='chat';if(source.id!=='chat')classicWindowBody.append(source.node);}
}
for(const panel of [characterWindow,inventoryWindow,classicWindow,...standaloneUtilityWindows.map(source=>source.node),dialogueElement,document.querySelector<HTMLElement>('#shop-panel')!,document.querySelector<HTMLElement>('#repair-panel')!,document.querySelector<HTMLElement>('#storage-panel')!])makeClassicWindowDraggable(panel,classicSurface,nativeWindowPositionVersion(panel.id));
function dockChat(){if(chatPanel.parentElement!==hudChat)hudChat.append(chatPanel);chatPanel.hidden=false;}
function setCharacterPage(page:CharacterPage){
 if(page!=='skills')skillBar.cancelKeyBinding();
 characterWindow.hidden=false;bringClassicWindowToFront(characterWindow);classicHud.skinWindow(characterWindow,'character');
 showCharacterPage(characterWindow,page);
}
function cancelActiveTrade(){if(tradeOpen)tradeCancel.click();}
function hideStandaloneUtilityWindows(){for(const source of standaloneUtilityWindows)source.node.hidden=true;}
function hideClassicUtilityWindow(){cancelActiveTrade();classicWindow.hidden=true;hideStandaloneUtilityWindows();dockChat();}
function hideServiceWindows(){
 cancelActiveTrade();
 hideDialogue();
 document.querySelector<HTMLElement>('#shop-panel')!.hidden=true;
 document.querySelector<HTMLElement>('#repair-panel')!.hidden=true;
 document.querySelector<HTMLElement>('#storage-panel')!.hidden=true;
 classicWindow.hidden=true;dockChat();
}
function hideDialogue(){
 hideItemTooltip();
 clearDialogueInputDrafts();
 dialogueElement.hidden=true;
 dialogueNpcId=undefined;
 dialogueOptions.replaceChildren();
 renderGuild();
}
function closeNpcSession(){
 const stamp=npcSession.close();
 if(stamp&&worldCommandsAvailable())socket!.send(JSON.stringify({type:'npcClose',...stamp}));
}
function closeDialogue(){if(dialogueElement.dataset.dialogueKind!=='system')closeNpcSession();hideDialogue();}
function sendNpcCommand(message:{type:string;npcId:number;[key:string]:unknown}){
 if(!worldCommandsAvailable())return false;
 const stamp=npcSession.current();
 if(!stamp||stamp.npcId!==message.npcId||socket?.readyState!==WebSocket.OPEN)return false;
 socket!.send(JSON.stringify({...message,...stamp}));return true;
}
function toggleClassicWindow(id:string){
 if(logout.isWaiting()||settings.isOpen()||systemDialog.isOpen())return;
 if(id==='character'||id==='equipment'){
  if(!characterWindow.hidden&&(id==='character'||id==='equipment')){equipment.rejectPending();skillBar.cancelKeyBinding();characterWindow.hidden=true;return;}
  setCharacterPage('paperdoll');return;
 }
 if(id==='skills'){setCharacterPage('skills');return;}
 if(id==='inventory'){
  const open=inventoryWindow.hidden;
  inventoryWindow.hidden=!open;
  if(!open){inventory.cancelSelection();if(typeof goldDrop!=='undefined')goldDrop?.interrupt();}
  if(open){bringClassicWindowToFront(inventoryWindow);classicHud.skinWindow(inventoryWindow,'inventory');}
  return;
 }
 showClassicWindow(id);
}
function showClassicWindow(id:string){
 const source=classicWindowSources.find(value=>value.id===id);if(!source)return;
 if(standaloneUtilityWindowIds.has(id)){
  source.node.hidden=false;source.node.style.position='absolute';bringClassicWindowToFront(source.node);classicHud.skinWindow(source.node,id);
 }else{
  classicWindow.hidden=false;bringClassicWindowToFront(classicWindow);
  if(id==='chat')classicWindowBody.append(chatPanel);else dockChat();
  for(const value of classicWindowSources)if(value.id!=='chat'&&!standaloneUtilityWindowIds.has(value.id))value.node.hidden=value.node!==source.node;
  source.node.hidden=false;
  classicWindowTitle.textContent=source.label;
  classicHud.skinWindow(classicWindow,id);
 }
 document.querySelectorAll<HTMLButtonElement>('[data-window-tab]').forEach(button=>button.classList.toggle('active',button.dataset.windowTab===id));
}
function closeClassicWindow(){
 if(classicWindow.dataset.windowKind==='guild')setGuildChatMode(false);classicWindow.hidden=true;dockChat();
}
function closeUtilityWindow(id:string){const source=classicWindowSources.find(value=>value.id===id&&standaloneUtilityWindowIds.has(value.id));if(!source)return;if(id==='trade'&&tradeOpen){tradeCancel.click();return;}source.node.hidden=true;}
function hideTradeWindow(){const tradeWindow=classicWindowSources.find(value=>value.id==='trade')?.node;if(tradeWindow)tradeWindow.hidden=true;}
function classicWindowEntries(){
 return [
  {element:dialogueElement,close:closeDialogue},
  {element:document.querySelector<HTMLElement>('#shop-panel')!,close:()=>{closeNpcSession();shop.clear();}},
  {element:document.querySelector<HTMLElement>('#repair-panel')!,close:()=>{closeNpcSession();repair.clear();}},
  {element:document.querySelector<HTMLElement>('#storage-panel')!,close:()=>{closeNpcSession();storage.clear();}},
  ...standaloneUtilityWindows.map(source=>({element:source.node,close:()=>closeUtilityWindow(source.id)})),
  {element:classicWindow,close:closeClassicWindow},
  {element:inventoryWindow,close:()=>{inventory.cancelSelection();if(typeof goldDrop!=='undefined')goldDrop?.interrupt();inventoryWindow.hidden=true;}},
  {element:characterWindow,close:()=>{equipment.rejectPending();skillBar.cancelKeyBinding();characterWindow.hidden=true;}},
 ];
}
function closeWindowByElement(element:HTMLElement){closeClassicWindowEntry(classicWindowEntries(),element);}
document.querySelectorAll<HTMLButtonElement>('[data-window-open],[data-window-tab]').forEach(button=>button.addEventListener('click',()=>{
 if(button.dataset.hudAction==='sound'){audio.toggleEnabled();return;}
 toggleClassicWindow(button.dataset.windowOpen??button.dataset.windowTab??'');
}));
document.querySelectorAll<HTMLButtonElement>('[data-native-toolbar][data-hud-action]').forEach(button=>button.addEventListener('click',()=>{
 if(button.dataset.hudAction==='minimap')cycleMinimap();
 else if(button.dataset.hudAction==='reselect')void logout.request('reselect');
 else if(button.dataset.hudAction==='exit')void logout.request('login');
}));
document.querySelectorAll<HTMLButtonElement>('[data-window-close]').forEach(button=>button.addEventListener('click',()=>{
 const id=button.dataset.windowClose;
 const source=classicWindowSources.find(value=>value.id===id);
 const target=id==='character'?characterWindow:id==='inventory'?inventoryWindow:source?.node;
 if(target)closeWindowByElement(target);
}));
document.querySelector<HTMLButtonElement>('#classic-window-close')!.addEventListener('click',()=>closeWindowByElement(classicWindow));
wireCharacterPageButtons(characterWindow,setCharacterPage);
const groundItems=new GroundItems(view.depth,(item:GroundItem)=>{
 if(!worldInputAvailable()||worldInputBlocked())return;
 ignoreCanvasPointerUntil=performance.now()+100;
 const entity=self===undefined?undefined:entities.get(self);
 if(!entity||entity.dead||socket?.readyState!==WebSocket.OPEN)return;
 cancelWorldIntent();pursuitGroundItem=item.id;continueGroundPursuit();
},document.querySelector<HTMLElement>('#ground-items')!);
const entities=new Map<number,Entity>(),visuals=new Map<number,OnlineActor>();
type PendingAction={actionId:number;kind:'move'|'attack'|'spell'|'mine';startedAt:number;duration:number;acknowledged:boolean};
let socket:WebSocket|undefined,self:number|undefined,lastSequence=0,mapGeneration=0,currentMap='0',pending:MovementStep|undefined,pendingAction:PendingAction|undefined,nextActionId=1,doorRetry:{x:number;y:number;direction:number;run:boolean}|undefined,held:HeldMovement|undefined,rightPointer:{pointerId:number;clientX:number;clientY:number;direction?:number}|undefined,clickDestination:{x:number;y:number;run:boolean}|undefined,combatTimer:number|undefined,pursuitTarget:number|undefined,pursuitHarvest=false,pursuitRejectedCells=new RecentBlockedCells(),movementRejectedCells=new RecentBlockedCells(),pursuitGroundItem:number|undefined,combatTarget:number|undefined,worldReady=true,initialSelfPending=true,reconnectTimer:number|undefined,reconnectAttempts=0,reconnectEnabled=false;
let mapReady:Promise<void>=Promise.resolve();
let gatewayFeatures={pointSpells:false,directionalRush:false,magicKeyBinding:false,mining:false,logout:false,characterDeletion:false};
let sessionGeneration=0;
const mining=new MiningController({
 read:()=>{
  const actor=self===undefined?undefined:entities.get(self);if(!actor)return undefined;
  const attributes=characterPanel.debugState(),weapon=equipment.itemAt(1);
  return {x:actor.x,y:actor.y,direction:actor.direction,mapGeneration,dead:Boolean(actor.dead),
   weapon:weapon?{shape:weapon.shape??-1,stdMode:weapon.stdMode,durability:weapon.durability}:undefined,
   canAct:!pendingAction&&worldInputAvailable()&&!worldInputBlocked()&&!selectedMagic,
   serverReady:gatewayFeatures.mining&&socket?.readyState===WebSocket.OPEN,
   level:attributes?.level??0,hitSpeed:actor.hitSpeed??0,attackSlow:Boolean(attributes&&attributes.handWeight>attributes.maxHandWeight)};
 },
 canWalk:(x,y)=>view.isWalkable(x,y)===true,
 send:direction=>{
  if(pendingAction||!worldInputAvailable()||worldInputBlocked()||socket?.readyState!==WebSocket.OPEN||!gatewayFeatures.mining)return undefined;
  const action=createAction('mine',performance.now(),540);
  socket!.send(JSON.stringify({type:'mine',direction,actionId:action.actionId,mapGeneration}));
  connection.textContent='正在挖矿…';return {actionId:action.actionId,mapGeneration};
 },
 timeout:()=>{connection.textContent='挖矿确认超时，正在重新连接…';socket?.close();}
});
type Credentials={account:string;password:string};
let credentials:Credentials|undefined,selectedCharacter:string|undefined,selectedServer:string|undefined;
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
  gatewayFeatures:{...gatewayFeatures},
  self:entity?{id:entity.id,name:entity.name,x:entity.x,y:entity.y,direction:entity.direction,action:entity.action,dead:Boolean(entity.dead),hp:entity.hp,maxHp:entity.maxHp}:undefined,
  confirmedCell:pending?{x:pending.acknowledged?pending.x:pending.fromX,y:pending.acknowledged?pending.y:pending.fromY}:{x:entity?.x,y:entity?.y},
  render:visualState?{...visualState,grid:{x:visualState.pixel.x/48,y:visualState.pixel.y/32},screen:{x:visualState.pixel.x+view.app.stage.position.x,y:visualState.pixel.y+view.app.stage.position.y}}:undefined,
  camera:{x:view.app.stage.position.x,y:view.app.stage.position.y},pending:pending?{...pending}:undefined,pendingAction:pendingAction?{...pendingAction}:undefined,
  intentions:{held:held?{...held}:undefined,rightPointer:Boolean(rightPointer),clickDestination:clickDestination?{...clickDestination}:undefined,pursuitTarget,pursuitHarvest,pursuitGroundItem,combatTarget,mining:mining.debugState()},
  attributes:characterPanel.debugState(),inventory:inventory.debugState(),itemQuickBar:itemQuickBar.debugState(),equipment:equipment.debugState(),paperdoll:paperdoll.debugState(),groundItems:groundItems.debugState(),magicEffects:magicEffects.debugState(),miningEffects:magicEffects.debugMiningState(),skills:skillBar.debugState(),minimap:minimap.debugState(),
  dialogue:{visible:!dialogueElement.hidden,session:npcSession.current(),npc:dialogueTitle.textContent,text:dialogueText.textContent,options:Array.from(dialogueOptions.querySelectorAll<HTMLButtonElement>('button')).map(button=>({text:button.textContent,command:button.dataset.dialogueCommand}))},
  combatStatus:combatStatus.textContent,nearby, directions:directionsAvailable,entityCount:entities.size,
 };
}
agentObserver.attach(window as Window&{__mir2Agent?:AgentDebugApi},agentSnapshot);
function chatPhysicalLineCount(line:HTMLElement){const range=document.createRange?.();if(!range)return 1;try{range.selectNodeContents(line);return Math.max(1,range.getClientRects().length);}catch{return 1;}finally{range.detach?.();}}
function chatPhysicalPrefixLineCount(text:Text,endOffset:number){const range=document.createRange();try{range.setStart(text,0);range.setEnd(text,endOffset);return range.getClientRects().length;}catch{return 0;}finally{range.detach?.();}}
function chatPhysicalCutOffset(text:Text,removeLines:number){const offsets=[0];for(const character of text.data)offsets.push(offsets[offsets.length-1]+character.length);let low=0,high=offsets.length-1;while(low<high){const middle=Math.ceil((low+high)/2);if(chatPhysicalPrefixLineCount(text,offsets[middle])<=removeLines)low=middle;else high=middle-1;}return offsets[low]??text.length;}
function chatLogPhysicalLineCount(){return Array.from(chatLog.children).reduce((total,line)=>total+Math.max(1,Number((line as HTMLElement).dataset.physicalLines)||1),0);}
function trimChatLogPhysicalLines(){let total=chatLogPhysicalLineCount(),removedHeight=0;while(total>200&&chatLog.firstElementChild){const first=chatLog.firstElementChild as HTMLElement,lines=Math.max(1,Number(first.dataset.physicalLines)||1),excess=total-200,beforeHeight=first.getBoundingClientRect?.().height??first.offsetHeight??0,child=first.firstChild,text=(child?.nodeType===3?child:child?.firstChild) as Text|null;if(lines<=excess||!text){first.remove();total-=lines;removedHeight+=beforeHeight;continue;}const offset=chatPhysicalCutOffset(text,excess);if(offset<=0||offset>=text.length){first.remove();total-=lines;removedHeight+=beforeHeight;continue;}const labels:Record<string,string>={local:'附近',group:'组队',shout:'喊话',whisper:'私聊',guild:'行会',system:'系统'};text.data=text.data.slice(offset);first.dataset.physicalLines=String(chatPhysicalLineCount(first));first.setAttribute('aria-label',`${labels[first.dataset.channel??'']??first.dataset.channel??'聊天'} ${first.textContent}`);const afterHeight=first.getBoundingClientRect?.().height??first.offsetHeight??0;removedHeight+=Math.max(0,beforeHeight-afterHeight);total=chatLogPhysicalLineCount();}return removedHeight;}
function appendChat(channel:string,text:string,foreground?:number,background?:number){const wasAtBottom=chatLog.scrollHeight-chatLog.clientHeight-chatLog.scrollTop<=2,previousTop=chatLog.scrollTop,line=document.createElement('li'),content=document.createElement('span');line.dataset.channel=channel;const labels:Record<string,string>={local:'附近',group:'组队',shout:'喊话',whisper:'私聊',guild:'行会',system:'系统'};content.textContent=text;applyClassicChatColors(content,foreground,background);line.append(content);line.setAttribute('aria-label',`${labels[channel]??channel} ${text}`);if(channel!=='system')line.addEventListener('click',()=>chatController.selectLine(text));chatLog.append(line);line.dataset.physicalLines=String(chatPhysicalLineCount(line));const removedHeight=trimChatLogPhysicalLines();chatLog.scrollTop=wasAtBottom?chatLog.scrollHeight:Math.max(0,previousTop-removedHeight);}
function scrollChatLog(key:'ArrowUp'|'ArrowDown'|'PageUp'|'PageDown'){
 const measuredLineHeight=Number.parseFloat(window.getComputedStyle(chatLog).lineHeight),lineHeight=Number.isFinite(measuredLineHeight)&&measuredLineHeight>0?measuredLineHeight:14,pageStep=Math.max(lineHeight,chatLog.clientHeight-lineHeight),amount=key==='ArrowUp'?-lineHeight:key==='ArrowDown'?lineHeight:key==='PageUp'?-pageStep:pageStep,max=Math.max(0,chatLog.scrollHeight-chatLog.clientHeight);
 chatLog.scrollTop=Math.max(0,Math.min(max,chatLog.scrollTop+amount));return true;
}
function scrollQuestLog(key:'ArrowUp'|'ArrowDown'|'PageUp'|'PageDown'|'Home'|'End'){
 const measuredLineHeight=Number.parseFloat(window.getComputedStyle(questLog).lineHeight),lineHeight=Number.isFinite(measuredLineHeight)&&measuredLineHeight>0?measuredLineHeight:16,max=Math.max(0,questLog.scrollHeight-questLog.clientHeight),pageStep=Math.max(lineHeight,questLog.clientHeight-lineHeight),amount=key==='ArrowUp'?-lineHeight:key==='ArrowDown'?lineHeight:key==='PageUp'?-pageStep:key==='PageDown'?pageStep:0;
 questLog.scrollTop=key==='Home'?0:key==='End'?max:Math.max(0,Math.min(max,questLog.scrollTop+amount));return true;
}
questLog.addEventListener('keydown',event=>{if(!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();scrollQuestLog(event.key as 'ArrowUp'|'ArrowDown'|'PageUp'|'PageDown'|'Home'|'End');});
function clearWorld(preserveCharacter=false){settings.hide(false);guildEditor.cancel();systemDialog.interrupt();cancelGroupConfirmation();cancelGuildActionPrompt();if(typeof goldDrop!=='undefined')goldDrop?.interrupt();audio.clear();if(!preserveCharacter)chatController.resetHistory();mining.reset();skillBar.cancelKeyBinding();skillBar.cancelSelection();magicEffects.clear();worldTone.clear();for(const visual of visuals.values())visual.destroy();visuals.clear();entities.clear();groundItems.clear();self=undefined;pending=undefined;pendingAction=undefined;doorRetry=undefined;held=undefined;rightPointer=undefined;clickDestination=undefined;initialSelfPending=true;pursuitTarget=undefined;pursuitHarvest=false;pursuitRejectedCells.clear();movementRejectedCells.clear();pursuitGroundItem=undefined;combatTarget=undefined;groupEnabled=false;groupMemberNames=[];groupPending=undefined;groupFeedbackText='';attackMode=0;attackModePending=undefined;attackModeCommandChatId=undefined;attackModeNotice='';guildPendingAction=undefined;guildName='';guildRankName='';guildNotice='';guildCanManage=false;guildNoticeDraft=undefined;guildRanksDraft=undefined;guildWarGuildNames=[];guildWarTimers=[];guildWarReceivedAt=0;guildAllyGuildNames=[];guildMemberNames=[];guildRanks=[];castleWarStatus=undefined;closeNpcSession();hideDialogue();classicWindow.hidden=true;hideStandaloneUtilityWindows();dockChat();characterWindow.hidden=true;inventoryWindow.hidden=true;inventory.cancelSelection();inventory.rejectPending();itemQuickBar.rejectPending();equipment.rejectPending();shop.rejectPending();repair.rejectPending();storage.rejectPending();renderGroup();renderAttackMode();renderGuild();clearTrade();if(combatTimer!==undefined)clearTimeout(combatTimer);combatTimer=undefined;if(!preserveCharacter){inventory.clear();itemQuickBar.clear();equipment.clear();paperdoll.clear();characterPanel.clear();skillBar.clear();classicHud.clear();}revivePanel.hidden=true;returnToTown.disabled=false;shop.clear();storage.clear();repair.clear();renderTargets();refreshMiniMapMarkers();}
function releaseVacatedBlocker(entity:Entity|undefined){if(!entity||entity.self||entity.dead)return;const cell=`${entity.x},${entity.y}`;if([...entities.values()].some(other=>!other.self&&!other.dead&&other.x===entity.x&&other.y===entity.y))return;movementRejectedCells.delete(cell);pursuitRejectedCells.delete(cell);}
function update(entity:Entity,movementStart?:number){const previous=entities.get(entity.id);entities.set(entity.id,entity);if(previous&&!previous.self&&!previous.dead&&(previous.x!==entity.x||previous.y!==entity.y||entity.dead===true))releaseVacatedBlocker(previous);let visual=visuals.get(entity.id);if(!visual){visual=new OnlineActor(entity,interact,impact=>{magicEffects.miningImpact(impact);audio.play('miningStone');},(impact,parts)=>audio.playMelee(impact,parts));visuals.set(entity.id,visual);view.depth.addChild(visual.container);}visual.update(entity,movementStart);if(entity.self){worldTone.setDead(entity.dead===true);paperdoll.setFeature(entity.feature);}renderTargets();refreshMiniMapMarkers();}
function removeEntity(id:number){if(pursuitTarget===id){pursuitTarget=undefined;pursuitHarvest=false;}if(combatTarget===id)stopCombat();const removed=entities.get(id);entities.delete(id);releaseVacatedBlocker(removed);visuals.get(id)?.destroy();visuals.delete(id);renderTargets();}
function refreshMiniMapMarkers(){
 const markers:MiniMapMarker[]=[...entities.values()].map(entity=>{const race=entity.feature&255;return {id:`entity-${entity.id}`,x:entity.x,y:entity.y,kind:entity.self?'self':race===50?'npc':race===0?'player':'monster'} as MiniMapMarker;});
 for(const item of groundItems.debugState())markers.push({id:`drop-${item.id}`,x:item.x,y:item.y,kind:'drop'});
 minimap.setMarkers(markers);
}
function createAction(kind:'move'|'attack'|'spell'|'mine',startedAt=performance.now(),duration=MOVEMENT_DURATION_MS){
 const action={actionId:nextActionId++,kind,startedAt,duration,acknowledged:false};pendingAction=action;agentObserver.event('action-start',{...action});return action;
}
function overlap(left:{x:number;y:number;width:number;height:number},right:{x:number;y:number;width:number;height:number}){return left.x<right.x+right.width&&left.x+left.width>right.x&&left.y<right.y+right.height&&left.y+left.height>right.y;}
function layoutActorLabels(){
 const placed:{x:number;y:number;width:number;height:number}[]=[];
 const actors=[...visuals.entries()].map(([id,visual])=>({entity:entities.get(id),visual})).filter((entry):entry is {entity:Entity;visual:OnlineActor}=>Boolean(entry.entity?.name)).sort((left,right)=>Number(right.entity.self)-Number(left.entity.self)||left.entity.y-right.entity.y||left.entity.x-right.entity.x||left.entity.id-right.entity.id);
 for(const {visual} of actors){
  visual.setLabelVisible(true);
  const base=visual.labelBoundsAt(0,0),horizontalStep=Math.max(20,Math.ceil(base.width+4)),verticalStep=Math.max(16,Math.ceil(base.height+2));
  const columns=Math.ceil(800/horizontalStep),rows=Math.ceil(600/verticalStep);
  let placedLabel=false;
  for(let row=0;row<=rows&&!placedLabel;row++){
   const verticalOffsets=row===0?[0]:[-row*verticalStep,row*verticalStep];
   for(const offsetY of verticalOffsets){
    for(let column=0;column<=columns&&!placedLabel;column++){
     const horizontalOffsets=column===0?[0]:[-column*horizontalStep,column*horizontalStep];
     for(const offsetX of horizontalOffsets){
      const bounds=visual.labelBoundsAt(offsetY,offsetX);
      if(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=800&&bounds.y+bounds.height<=600&&!placed.some(previous=>overlap(bounds,previous))){visual.setLabelOffset(offsetY,offsetX);placed.push(bounds);placedLabel=true;break;}
     }
    }
   }
  }
  if(!placedLabel)visual.setLabelVisible(false);
 }
}
function requestTradeWithPlayer(id:number){
 if(!worldCommandsAvailable()||tradeRequestPending)return false;
 const target=entities.get(id),actor=self===undefined?undefined:entities.get(self);
 if(!target||target.self||!actor||(target.feature&255)!==0||target.kind==='slave'||target.nameColor===254||!target.name.trim())return false;
 if(Math.max(Math.abs(target.x-actor.x),Math.abs(target.y-actor.y))!==1)return false;
 tradeTarget.value=target.name;showClassicWindow('trade');tradeRequestForm.requestSubmit(tradeRequestButton);return true;
}
function renderTargets(){
 targetsElement.replaceChildren();nearbyTradeButtons.length=0;const actor=self===undefined?undefined:entities.get(self);if(!actor){targetsElement.textContent='等待附近对象…';return;}
 const targets=[...entities.values()].filter(entity=>{const race=entity.feature&255;return !entity.self&&(race!==0||Boolean(entity.name));}).map(entity=>({entity,distance:Math.max(Math.abs(entity.x-actor.x),Math.abs(entity.y-actor.y))})).filter(value=>value.distance<=8).sort((a,b)=>a.distance-b.distance||a.entity.id-b.entity.id);
 if(!targets.length){targetsElement.textContent='附近没有可交互对象';return;}
 for(const {entity,distance} of targets){const row=document.createElement('div'),button=document.createElement('button');row.className='nearby-target-entry';button.type='button';button.dataset.entityId=String(entity.id);const race=entity.feature&255,npc=race===50,player=race===0&&Boolean(entity.name),slave=entity.kind==='slave'||entity.nameColor===254,health=entity.hp===undefined?'':` · ${entity.hp}/${entity.maxHp} HP`;button.textContent=`${slave?'召唤 · ':''}${entity.name||(npc?'NPC':'怪物')} · ${entity.x},${entity.y} · ${distance} 格${health} · ${npc?(distance===1?'对话':'接近'):player?(distance===1?'PK/行会战':'接近'):entity.dead?'Alt+左键挖肉':distance===1?'攻击':'接近'}`;button.onclick=event=>interact(entities.get(entity.id)??entity,requestsHarvest(event));row.append(button);if(player&&!slave){const trade=document.createElement('button');trade.type='button';trade.dataset.tradeTarget=String(entity.id);trade.className='nearby-target-trade';trade.textContent=distance===1?'邀请交易':'需相邻交易';trade.title=distance===1?'向此玩家发起交易':'需要与交易对象相邻';trade.disabled=distance!==1||tradeRequestPending;trade.onclick=event=>{event.preventDefault();event.stopPropagation();requestTradeWithPlayer(entity.id);};nearbyTradeButtons.push(trade);row.append(trade);}targetsElement.append(row);}
}
function clickPath(actor:Entity,destination:{x:number;y:number}){
 const start={x:actor.x,y:actor.y},goal={x:Math.round(destination.x),y:Math.round(destination.y)};
 if(start.x===goal.x&&start.y===goal.y)return [];
 // A click can land on a closed door. Keep the direct request in that case
 // so the server can emit its door state and the normal retry path can run.
 if(view.isWalkable(goal.x,goal.y)===false)return undefined;
 const key=(point:{x:number;y:number})=>`${point.x},${point.y}`;
 const occupied=new Set([...entities.values()].filter(entity=>!entity.self&&!entity.dead).map(entity=>key(entity)));
 for(const cell of movementRejectedCells)occupied.add(cell);
 const blockedGoal=occupied.has(key(goal));
 if(blockedGoal){
  let best:GridPoint[]|undefined;
  for(const [dx,dy] of directions){
   const nearby={x:goal.x+dx,y:goal.y+dy},nearbyKey=key(nearby);
   if(view.isWalkable(nearby.x,nearby.y)!==true||occupied.has(nearbyKey))continue;
   const path=findGridPath(start,nearby,(x,y)=>view.isWalkable(x,y)===true,(x,y)=>occupied.has(key({x,y})));
   if(path&&(!best||path.length<best.length))best=path;
  }
  // The occupied destination is a stop point; never send a direct step into it.
  return best??[];
 }
 return findGridPath(start,goal,(x,y)=>view.isWalkable(x,y)===true,(x,y)=>occupied.has(key({x,y})));
}
function targetApproachStep(actor:Entity,target:Entity){
 const occupied=new Set([...entities.values()].filter(entity=>!entity.self&&!entity.dead).map(entity=>`${entity.x},${entity.y}`));
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
 if(!worldCommandsAvailable())return false;
 mining.cancel();
 if(actor.dead||pendingAction||socket?.readyState!==WebSocket.OPEN)return false;const direction=directionIndex(dx,dy);if(direction<0)return false;
 const distance=distanceOverride??(run?2:1),startedAt=performance.now(),action=createAction('move',startedAt);
 pending={...action,fromX:actor.x,fromY:actor.y,x:actor.x+dx*distance,y:actor.y+dy*distance,direction,run,startedAt,acknowledged:false};
 agentObserver.event('movement-start',{...pending});
 update({...actor,x:pending.x,y:pending.y,direction,action:run?'running':'walking'},startedAt);
 view.moveCenter(pending.x,pending.y,MOVEMENT_DURATION_MS,startedAt);
 socket!.send(JSON.stringify({type:'move',mapGeneration,...pending}));return true;
}
function continueHeld(){if(!held||pendingAction)return;const actor=self===undefined?undefined:entities.get(self);if(actor)sendMovement(actor,held.dx,held.dy,held.run);}
function continuePointerRun(){
 if(!rightPointer||pendingAction)return;
 const actor=self===undefined?undefined:entities.get(self);
 if(!actor||actor.dead)return;
 const rect=view.app.canvas.getBoundingClientRect();
 const stageX=(rightPointer.clientX-rect.left)*800/rect.width,stageY=(rightPointer.clientY-rect.top)*600/rect.height;
 const direction=screenDirection(stageX-WORLD_VIEW.pointerOrigin.x,stageY-WORLD_VIEW.pointerOrigin.y,rightPointer.direction);if(direction===undefined)return;
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
  const directCell=`${actor.x+dx*(running?2:1)},${actor.y+dy*(running?2:1)}`;
  if(movementRejectedCells.has(directCell)){clickDestination=undefined;connection.textContent='目标格暂时被占，已停止移动';return;}
  if(sendMovement(actor,dx,dy,running,running?2:1))connection.textContent=`正在${running?'跑向':'走向'} ${clickDestination.x}, ${clickDestination.y}…`;
  return;
 }
 if(!path.length){clickDestination=undefined;return;}
 const first=path[0],dx=Math.sign(first.x-actor.x),dy=Math.sign(first.y-actor.y);
 const second=path[1],canRun=clickDestination.run&&second!==undefined&&second.x===actor.x+dx*2&&second.y===actor.y+dy*2;
 if(sendMovement(actor,dx,dy,canRun,canRun?2:1))connection.textContent=`正在${canRun?'跑向':'走向'} ${clickDestination.x}, ${clickDestination.y}…`;
}
function startMapRoute(point:{x:number;y:number},run:boolean){
 if(!worldInputAvailable()||worldInputBlocked())return;
 mining.cancel();
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
 if(item.x===actor.x&&item.y===actor.y){pursuitGroundItem=undefined;socket?.send(JSON.stringify({type:'pickup'}));connection.textContent=`正在拾取 ${item.name}…`;return;}
 const step=clickPath(actor,item)?.[0];
 if(!step){pursuitGroundItem=undefined;connection.textContent=`无法接近 ${item.name}`;return;}
 if(sendMovement(actor,step.x-actor.x,step.y-actor.y))connection.textContent=`正在自动接近 ${item.name} · ${item.x}, ${item.y}`;else if(!pendingAction)pursuitGroundItem=undefined;
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
function cancelWorldIntent(){mining.cancel();held=undefined;rightPointer=undefined;clickDestination=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;doorRetry=undefined;pursuitRejectedCells.clear();stopCombat();skillBar.cancelSelection();}

function worldInputAvailable(){
 const actor=self===undefined?undefined:entities.get(self);
  return !skillKeyDialog.isOpen()&&!logout.isWaiting()&&!settings.isOpen()&&!systemDialog.isOpen()&&!guildEditor.isOpen()&&document.body.classList.contains('in-world')&&worldReady&&document.querySelector<HTMLElement>('#auth-overlay')!.hidden&&Boolean(actor&&!actor.dead)&&revivePanel.hidden;
}
function worldInputBlocked(){return skillKeyDialog.isOpen()||logout.isWaiting()||settings.isOpen()||systemDialog.isOpen()||guildEditor.isOpen()||[dialogueElement,document.querySelector<HTMLElement>('#shop-panel')!,document.querySelector<HTMLElement>('#repair-panel')!,document.querySelector<HTMLElement>('#storage-panel')!].some(panel=>!panel.hidden);}
function serviceWindowOpened(panel:HTMLElement){hideItemTooltip();cancelWorldIntent();bringClassicWindowToFront(panel);}
function showDeathWindow(){
  systemDialog.interrupt();
 cancelGroupConfirmation();renderGroup();
 audio.clear();
 skillBar.cancelKeyBinding();cancelWorldIntent();pending=undefined;pendingAction=undefined;
 inventory.cancelSelection();equipment.rejectPending();closeNpcSession();hideDialogue();shop.clear();repair.clear();storage.clear();
 characterPanel.resources({hp:0});classicHud.skinWindow(revivePanel,'system');revivePanel.hidden=false;bringClassicWindowToFront(revivePanel);
 connection.textContent='角色已死亡';combatStatus.textContent='等待回城复活';
}
function restoreAliveWindow(entity:Entity){
 if(!entity.self)return;
 revivePanel.hidden=true;returnToTown.disabled=false;
 connection.textContent='角色已复活';combatStatus.textContent='角色已复活';
}
function closeTopWindow(){
 closeTopClassicWindow(classicWindowEntries(),classicWindowClosesOnEscape);
}

function castSelectedAt(point:{x:number;y:number},target?:Entity){
 if(!worldInputAvailable()||worldInputBlocked())return false;
 const actor=self===undefined?undefined:entities.get(self),skill=selectedMagic;
 if(!actor||actor.dead||!skill||socket?.readyState!==WebSocket.OPEN)return false;
 if(pendingAction){connection.textContent='当前动作完成后再施放技能';return false;}
 if(target?.dead||(target&&((target.feature&255)===50))){connection.textContent='请选择存活对象或空地';return false;}
 const distance=Math.max(Math.abs(point.x-actor.x),Math.abs(point.y-actor.y));
 if(distance>SKILL_RANGE){connection.textContent=`${target?.name||'目标'} 超出施法距离`;return false;}
 const direction=directionIndex(point.x-actor.x,point.y-actor.y),use=skillUseOf(skill.magicId);
 if(use==='rush'&&!gatewayFeatures.directionalRush||use!=='rush'&&!target&&!gatewayFeatures.pointSpells){connection.textContent='当前连接暂不支持位置施法';return false;}
 const aim=use==='rush'?{direction:direction<0?actor.direction:direction}:target?{targetId:target.id}:{x:point.x,y:point.y};
 cancelWorldIntent();skillBar.setPending(skill.magicId);const action=createAction('spell');
 socket!.send(JSON.stringify({type:'castMagic',magicId:skill.magicId,...aim,actionId:action.actionId,mapGeneration}));
 update({...actor,direction:direction<0?actor.direction:direction,action:use==='rush'?'standing':'spell'});
 connection.textContent=`正在施放 ${skill.name} · ${target?.name||`${point.x},${point.y}`}…`;return true;
}
function scheduleCombat(){if(combatTimer===undefined)combatTimer=window.setTimeout(()=>{combatTimer=undefined;continueCombat();},620);}
function continueCombat(){
 if(!worldCommandsAvailable()){stopCombat();return;}
 if(combatTarget===undefined)return;
 const target=entities.get(combatTarget),actor=self===undefined?undefined:entities.get(self);
 if(!target||target.dead||(target.hp!==undefined&&target.hp<=0)||!actor||actor.dead||socket?.readyState!==WebSocket.OPEN){stopCombat();return;}
 const dx=Math.sign(target.x-actor.x),dy=Math.sign(target.y-actor.y),distance=Math.max(Math.abs(target.x-actor.x),Math.abs(target.y-actor.y));
 if(distance>1){const id=target.id;combatTarget=undefined;pursuitTarget=id;pursuitHarvest=false;interact(target);return;}
 if(distance!==1){stopCombat();return;}
 const direction=directions.findIndex(([x,y])=>x===dx&&y===dy);if(direction<0){stopCombat();return;}
 if(pendingAction){scheduleCombat();return;}
 if(performance.now()-lastAttack<550){scheduleCombat();return;}
 lastAttack=performance.now();const action=createAction('attack');socket!.send(JSON.stringify({type:'attack',direction,actionId:action.actionId,mapGeneration}));update({...actor,direction,action:'attack',meleeKind:'normal',predictedMelee:true,meleeActionId:action.actionId,digFragment:false});connection.textContent=`攻击 ${target.name}`;scheduleCombat();
}
function interact(target:Entity,harvest=false){
 if(!worldInputAvailable()||worldInputBlocked())return;
 mining.cancel();
 ignoreCanvasPointerUntil=performance.now()+100;
 stopCombat();pursuitGroundItem=undefined;const actor=self===undefined?undefined:entities.get(self);if(!actor||actor.dead||target.self||socket?.readyState!==WebSocket.OPEN)return;
 if(selectedMagic){castSelectedAt(target,target);return;}
 const race=target.feature&255,player=race===0&&Boolean(target.name);if(race===0&&!player){pursuitTarget=undefined;pursuitHarvest=false;connection.textContent=`${target.name||'该对象'} 暂不支持交互`;return;}
 if(target.dead&&!harvest){pursuitTarget=undefined;pursuitHarvest=false;pursuitRejectedCells.clear();connection.textContent='按住 Alt 并左键点击尸体挖肉';return;}
 const dx=Math.sign(target.x-actor.x),dy=Math.sign(target.y-actor.y),distance=Math.max(Math.abs(target.x-actor.x),Math.abs(target.y-actor.y));
 if(distance>1){
  held=undefined;clickDestination=undefined;if(pursuitTarget!==target.id)pursuitRejectedCells.clear();pursuitTarget=target.id;pursuitHarvest=Boolean(target.dead&&harvest);
  const step=targetApproachStep(actor,target);
  if(step&&sendMovement(actor,step.x-actor.x,step.y-actor.y))connection.textContent=`正在自动接近 ${target.name||'目标'}…`;
  else if(pursuitRejectedCells.size){const generation=mapGeneration;connection.textContent='目标附近暂时拥堵，正在重新接近…';window.setTimeout(()=>{if(mapGeneration===generation&&pursuitTarget===target.id&&!pendingAction)continuePursuit();},400);}
  else{pursuitTarget=undefined;pursuitHarvest=false;pursuitRejectedCells.clear();connection.textContent=`无法接近 ${target.name||'目标'}`;}
  return;
 }
 if(distance!==1)return;
 pursuitTarget=undefined;pursuitHarvest=false;pursuitRejectedCells.clear();
 if(race===50){clearDialogueInputDrafts();shop.clear();repair.clear();storage.clear();inventory.cancelSelection();const stamp=npcSession.begin(target.id,mapGeneration);socket!.send(JSON.stringify({type:'npc',targetId:target.id,...stamp}));connection.textContent=`正在与 ${target.name} 交谈…`;return;}
 const direction=directions.findIndex(([x,y])=>x===dx&&y===dy);if(direction<0)return;
 if(target.dead&&harvest){socket!.send(JSON.stringify({type:'butch',targetId:target.id}));update({...actor,direction,action:'harvest'});connection.textContent=`正在挖取 ${target.name}…`;return;}
 combatTarget=target.id;continueCombat();
}
view.app.ticker.add(()=>{if(logout.isAccepted())return;const time=performance.now();for(const visual of visuals.values())visual.tick(time);finishMovement(time);finishNonMovementAction(time);mining.tick();if(pendingAction&&time-pendingAction.startedAt>5000){connection.textContent='动作确认超时，正在重新同步位置…';socket?.close();}layoutActorLabels();});
function scheduleReconnect(){
 if(!reconnectEnabled||reconnectTimer!==undefined||!credentials)return;
 if(reconnectAttempts>=5){reconnectEnabled=false;setWorldConnectionState();document.body.classList.remove('in-world');classicAuth.showLogin();classicAuth.setBusy(false);connection.textContent='自动重连失败，请重新登录';return;}
 const attempt=reconnectAttempts++,delay=Math.min(8000,500*2**attempt);
 setWorldConnectionState('reconnecting');
 connection.textContent=`连接已断开，${Math.ceil(delay/1000)} 秒后自动重连 (${attempt+1}/5)…`;
 reconnectTimer=window.setTimeout(()=>{reconnectTimer=undefined;const saved=credentials;connect('login',selectedCharacter,saved,true);},delay);
}
function cancelReconnect(){
 if(!reconnectEnabled&&!reconnectTimer)return;
 reconnectEnabled=false;reconnectAttempts=0;credentials=undefined;selectedCharacter=undefined;
 armCurrentAuthWait=undefined;
 if(reconnectTimer!==undefined){clearTimeout(reconnectTimer);reconnectTimer=undefined;}
 clearAuthenticationWait();
 const active=socket;socket=undefined;active?.close();setWorldConnectionState();
 document.body.classList.remove('in-world');classicAuth.showLogin();classicAuth.setBusy(false);connection.textContent='已取消自动重连，请手动登录';
}
function connect(intent:'login'|'register',resumeCharacter?:string,supplied?:Credentials,automatic=false){
  if(passwordChange.isPending()||systemDialog.isOpen()||logout.isWaiting())return;
  ++passwordSceneGeneration;classicAuth.clearPasswordChange();
 if(reconnectTimer!==undefined){clearTimeout(reconnectTimer);reconnectTimer=undefined;}
 clearAuthenticationWait();
 armCurrentAuthWait=undefined;
 if(!automatic){setWorldConnectionState();reconnectEnabled=true;reconnectAttempts=0;selectedCharacter=resumeCharacter;selectedServer=undefined;}
 classicAuth.setBusy(true);
  ++selectionRevision;characterDelete.interrupt();classicAuth.setDeleteEnabled(false);logout.interrupt();logoutWait.hidden=true;socket?.close();clearWorld();lastSequence=0;mapGeneration=0;npcSession.reset(0);currentMap='0';mapReady=Promise.resolve();gatewayFeatures={pointSpells:false,directionalRush:false,magicKeyBinding:false,mining:false,logout:false,characterDeletion:false};sessionGeneration=0;
  const account=(supplied?.account??document.querySelector<HTMLInputElement>('#account')!.value).trim().toLowerCase();let password=supplied?.password??document.querySelector<HTMLInputElement>('#password')!.value;
  document.querySelector<HTMLInputElement>('#account')!.value=account;
 credentials={account,password};
 const active=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);socket=active;let registrationPending=intent==='register',shownEntryNoticeId:number|undefined;
 const waitForResponse=(stage:string)=>{clearAuthenticationWait();authResponseSocket=active;authResponseTimer=window.setTimeout(()=>{
  if(socket!==active||authResponseSocket!==active)return;
  authResponseTimer=undefined;authResponseSocket=undefined;if(armCurrentAuthWait===waitForResponse)armCurrentAuthWait=undefined;
  const notice=`${stage}等待超时，请检查网络后重试`;
  if(automatic){connection.textContent=`${stage}超时，正在自动重连…`;active.close();return;}
  socket=undefined;active.close();classicAuth.setBusy(false);
  if(intent==='register'&&registrationPending){registrationPending=false;reconnectEnabled=false;credentials=undefined;classicAuth.registrationRejected(notice);connection.textContent=notice;}
  else {classicAuth.showLogin();connection.textContent=notice;showAuthNotice(notice,undefined,()=>{if(intent==='login')document.querySelector<HTMLInputElement>('#password')?.focus();});}
 },15000);};
 armCurrentAuthWait=waitForResponse;
 const stopEntryScenes=(error:unknown,showNotice=true)=>{
  if(socket!==active)return;
  clearAuthenticationWait(active);if(armCurrentAuthWait===waitForResponse)armCurrentAuthWait=undefined;
  socket=undefined;active.close();reconnectEnabled=false;credentials=undefined;selectedCharacter=undefined;selectedServer=undefined;
  setWorldConnectionState();document.body.classList.remove('in-world');classicAuth.showLogin();classicAuth.setBusy(false);
  const text=error instanceof Error?error.message:String(error);connection.textContent=text;if(showNotice)showAuthNotice(text);
 };
 connection.textContent=intent==='register'?'正在连接注册服务…':automatic?'正在重新连接游戏…':'正在登录…';
 waitForResponse('网关响应');
 active.addEventListener('message',event=>{
  if(socket!==active)return;const envelope=JSON.parse(event.data),message=envelope.message;
  if(envelope.sequence<=lastSequence)return;lastSequence=envelope.sequence;
  if(Number.isSafeInteger(envelope.sessionGeneration)){if(envelope.sessionGeneration<sessionGeneration)return;sessionGeneration=envelope.sessionGeneration;}
   if(message.type==='logoutState'){if(logout.handleState(message)&&message.state==='waiting'){mapGeneration=envelope.mapGeneration;connection.textContent='正在退出，请等待服务器回应…';}return;}
   if(message.type==='error'&&message.commandType==='logout'){logout.reject(message);return;}
   if(logout.isAccepted())return;
   if(logout.isWaiting()&&['characters','characterCreationResult','connected','registrationResult'].includes(message.type))return;
   if(envelope.mapGeneration<mapGeneration)return;
  agentObserver.event('gateway-in',{sequence:envelope.sequence,mapGeneration:envelope.mapGeneration,type:message.type,actionId:message.actionId,kind:message.kind,accepted:message.accepted,x:message.x,y:message.y,direction:message.direction,reason:message.reason,id:message.id,self:message.self,action:message.action,map:message.map,name:message.name,npcName:message.npcName,makeIndex:message.makeIndex,total:message.total,gained:message.gained,level:message.level,hp:message.hp,maxHp:message.maxHp});
  if(['npcDialogue','npcDialogueClosed','shop','shopSell','shopDetails','shopSellQuote','repairItems','repairQuote','storageDeposit','storageItems'].includes(message.type)){
   if(Array.isArray(message.quests))for(const quest of message.quests)updateQuest(quest as QuestState);else if(message.quest)updateQuest(message.quest as QuestState);
   if(!npcSession.accept(message))return;
  }
  if(message.type==='connected'){clearAuthenticationWait(active);if(message.features?.entryScenes!==true){stopEntryScenes('网关尚未支持原客户端主流程，请更新网关后重试');return;}gatewayFeatures={pointSpells:message.features?.pointSpells===true,directionalRush:message.features?.directionalRush===true,magicKeyBinding:message.features?.magicKeyBinding===true,mining:message.features?.mining===true,logout:message.features?.logout===true,characterDeletion:message.features?.characterDeletion===true};active.send(JSON.stringify({type:intent,account,password,...(intent==='login'?{interactiveLogin:true}:{})}));waitForResponse(intent==='register'?'账号注册':'账号登录');connection.textContent=intent==='register'?'正在创建账号…':automatic?'连接成功，正在恢复角色…':'正在登录…';}
  else if(message.type==='registrationResult'){
   clearAuthenticationWait(active);
   if(message.accepted){registrationPending=false;classicAuth.registrationSucceeded();connection.textContent='账号创建成功，正在登录…';active.send(JSON.stringify({type:'login',account,password,interactiveLogin:true}));waitForResponse('注册后自动登录');}
   else {if(armCurrentAuthWait===waitForResponse)armCurrentAuthWait=undefined;const notice=message.reason===0?'该账号已经存在':`账号创建失败 (${message.reason})`;classicAuth.setBusy(false);classicAuth.registrationRejected(notice,message.reason===0?'account':'password');connection.textContent=notice;}
  }
  else if(message.type==='servers'){
   clearAuthenticationWait(active);connection.textContent='请选择服务器';
   const choose=(name:string)=>{if(socket!==active||active.readyState!==WebSocket.OPEN)return;selectedServer=name;classicAuth.setBusy(true);active.send(JSON.stringify({type:'selectServer',name}));waitForResponse('服务器选择');connection.textContent='正在连接服务器…';};
   const remembered=automatic&&selectedServer&&Array.isArray(message.servers)?message.servers.find((server:{name:string;status:string;routable?:boolean})=>server.name===selectedServer&&server.routable!==false&&['idle','general','busy'].includes(server.status)):undefined;
   if(remembered)choose(remembered.name);
   else void classicAuth.showServerSelection(message.servers,{choose,exit:()=>stopEntryScenes('已退出服务器选择',false)}).catch(error=>stopEntryScenes(error));
  }
  else if(message.type==='entryNotice'){
   if(shownEntryNoticeId===message.noticeId)return;
   clearAuthenticationWait(active);shownEntryNoticeId=message.noticeId;
   document.body.classList.remove('in-world');connection.textContent='请确认入图公告';
   void classicAuth.showEntryNotice(message.noticeId,message.lines,(noticeId:number)=>{if(socket!==active||active.readyState!==WebSocket.OPEN||shownEntryNoticeId!==noticeId)return;classicAuth.setBusy(true);active.send(JSON.stringify({type:'acknowledgeEntryNotice',noticeId}));waitForResponse('进入角色');connection.textContent='正在进入游戏…';}).catch(error=>stopEntryScenes(error));
  }
  else if(message.type==='characters'){clearAuthenticationWait(active);const resume=resumeCharacter;resumeCharacter=undefined;password='';document.querySelector<HTMLInputElement>('#password')!.value='';showCharacterSelection(active,message.characters as SelectCharacter[],resume,()=>waitForResponse('进入角色'));}
   else if(message.type==='characterDeletionResult'){characterDelete.handle(message);}
  else if(message.type==='characterCreationResult'){clearAuthenticationWait(active);classicAuth.setBusy(false);connection.textContent=message.accepted?`角色 ${message.name} 创建成功，请选择角色`:`角色创建失败 (${message.reason})`;}
  else if(message.type==='map'){
   shownEntryNoticeId=undefined;
   clearAuthenticationWait(active);
   if(armCurrentAuthWait===waitForResponse)armCurrentAuthWait=undefined;
   reconnectAttempts=0;
   classicAuth.hide();document.body.classList.add('in-world');
   doorRetry=undefined;currentMap=message.map;
   clearWorld(true);worldTone.setDarkLevel(message.darkLevel);worldReady=false;mapGeneration=envelope.mapGeneration;npcSession.reset(mapGeneration);classicHud.beginMap(message.map);connection.textContent=`正在载入地图 ${message.map}…`;
   const targetMap=message.map,targetGeneration=mapGeneration,targetSessionGeneration=sessionGeneration;
   const isCurrentMap=()=>!logout.isAccepted()&&sessionGeneration===targetSessionGeneration&&socket===active&&active.readyState===WebSocket.OPEN&&mapGeneration===targetGeneration&&currentMap===targetMap&&mapReady===ready;
   const ready=view.setMap(targetMap).then(async loaded=>{
    if(loaded!==true||!isCurrentMap())return;
    await minimap.setMap(targetMap,view.width,view.height);
    if(isCurrentMap()){worldReady=true;if(self!==undefined&&entities.get(self)?.self)setWorldConnectionState();}
   }).catch(error=>{
    if(!isCurrentMap())return;
    const detail=error instanceof Error?error.message:`地图 ${targetMap} 载入失败`;
    console.error('地图载入失败',targetMap,error);
    connection.textContent=detail;
    worldReady=false;
   });
   mapReady=ready;
  }
  else if(message.type==='mapDescription'){classicHud.mapDescription(message.title);}
  else if(message.type==='entity'){
   const prior=entities.get(message.id);const entity={...prior,...message,name:message.name??prior?.name??'',feature:message.feature??prior?.feature??0,self:message.self||prior?.self||false,kind:message.kind??prior?.kind,light:message.light??prior?.light??0} as Entity;
   if(entity.self&&message.forced){cancelWorldIntent();pending=undefined;agentObserver.event('forced-movement',{x:entity.x,y:entity.y,action:entity.action});}
   update(entity);if(entity.self){self=entity.id;classicHud.position(currentMap,entity.x,entity.y);minimap.setPosition(entity.x,entity.y);refreshMiniMapMarkers();if(worldReady)setWorldConnectionState();if(initialSelfPending){initialSelfPending=false;const ready=mapReady,generation=sessionGeneration;void ready.then(()=>{const current=entities.get(entity.id);if(current&&ready===mapReady&&generation===sessionGeneration&&!logout.isAccepted())void view.setCenter(current.x,current.y);});}else if(entity.action==='walking'||entity.action==='running'||message.forced)view.moveCenter(entity.x,entity.y,message.forced?forcedMovementDuration(entity.action):MOVEMENT_DURATION_MS);connection.textContent=`已连接 · ${entity.name} · ${entity.x}, ${entity.y}`;}if(message.self&&mapGeneration===1&&worldCommandsAvailable())active.send(JSON.stringify({type:'inventory'}));
  }
  else if(message.type==='actorLight'){const entity=entities.get(message.id);if(entity)update({...entity,light:message.light});}
  else if(message.type==='appearance'||message.type==='entityName'||message.type==='nameColor'||message.type==='entityDied'||message.type==='entityAlive'){
    const entity=entities.get(message.id);if(entity){const next={...entity,...(message.type==='appearance'?{feature:message.feature}:message.type==='entityName'?{name:message.name,nameColor:message.nameColor??entity.nameColor,kind:message.kind??entity.kind}:message.type==='nameColor'?{nameColor:message.color,kind:message.color===254?'slave':entity.kind}:message.type==='entityAlive'?{dead:false,action:'standing',x:message.x,y:message.y,direction:message.direction}:{dead:true,action:'dying',x:message.x,y:message.y,direction:message.direction,hp:0})};update(next);if(message.type==='entityDied'&&combatTarget===message.id)stopCombat();if(message.type==='entityDied'&&entity.self){showDeathWindow();}else if(message.type==='entityAlive')restoreAliveWindow(next);}
  }
  else if(message.type==='entityAction'){
   const entity=entities.get(message.id);
   if(entity){
    const melee=['normal','heavy','big','power','thrusting','halfMoon','fire'].includes(message.meleeKind);
    if(melee&&entity.self&&(message.self!==true||pendingAction?.kind!=='attack'||message.actionId!==pendingAction.actionId))return;
    update({...entity,x:message.x,y:message.y,direction:message.direction,action:message.action,digFragment:message.digFragment===true,
     meleeKind:melee?message.meleeKind:undefined,predictedMelee:false,meleeActionId:melee&&entity.self?message.actionId:undefined,
     ...(['attack','heavyAttack','wideAttack'].includes(message.action)?{swingSequence:(entity.swingSequence??0)+1}:{}),
     ...(message.action==='struck'?{struckSequence:(entity.struckSequence??0)+1}:{})});
    if(['attack','heavyAttack','wideAttack'].includes(message.action)&&!entity.self&&((entity.feature>>>16)&0xffff)===20)audio.play('skeletonAttack');
   }
  }
  else if(message.type==='miningProgress'){
   const entity=entities.get(message.id);
   if(entity?.self&&message.mapGeneration===mapGeneration&&pendingAction?.kind==='mine'&&pendingAction.actionId===message.actionId){
    pendingAction.startedAt=performance.now();
    update({...entity,x:message.x,y:message.y,direction:message.direction,action:'heavyAttack',meleeKind:'heavy',predictedMelee:false,meleeActionId:undefined,digFragment:false,swingSequence:(entity.swingSequence??0)+1},pendingAction.startedAt);
   }
  }
  else if(message.type==='miningStrike'){
   const entity=entities.get(message.id);
   if(entity?.self&&message.mapGeneration===mapGeneration&&pendingAction?.kind==='mine'&&pendingAction.actionId===message.actionId)update({...entity,digFragment:true});
  }
  else if(message.type==='health'){const entity=entities.get(message.id);if(entity){update({...entity,hp:message.hp,maxHp:message.maxHp,action:entity.dead?'dead':'struck',struckSequence:(entity.struckSequence??0)+1});if(message.damage>0)audio.play('struck');if(entity.self){characterPanel.resources({hp:message.hp,maxHp:message.maxHp});classicHud.resource({hp:message.hp,maxHp:message.maxHp});}if(combatTarget===message.id&&message.hp<=0)stopCombat();combatStatus.textContent=`${entity.name||'目标'} ${message.hp}/${message.maxHp} HP`;}}
  else if(message.type==='attributes'){characterPanel.replace(message);inventory.refreshItemDescription();classicHud.replaceAttributes(message);inventory.currency(message.gold);if(typeof goldDrop!=='undefined')goldDrop?.setGold(message.gold);const entity=self===undefined?undefined:entities.get(self);if(entity)update({...entity,hp:message.hp,maxHp:message.maxHp});}
  else if(message.type==='secondaryAttributes')characterPanel.secondary(message);
  else if(message.type==='resources'){const entity=entities.get(message.id);if(entity){update({...entity,hp:message.hp,maxHp:message.maxHp});if(entity.self){characterPanel.resources({hp:message.hp,mp:message.mp,maxHp:message.maxHp});classicHud.resource({hp:message.hp,mp:message.mp,maxHp:message.maxHp});}}}
  else if(message.type==='characterStatus'){const entity=entities.get(message.id);if(entity)update({...entity,status:message.status,hitSpeed:message.hitSpeed});if(self===message.id)classicHud.status(message.status);}
  else if(message.type==='myStatus')classicHud.hungerStatus(message.status);
   else if(message.type==='daylight'){classicHud.daylight(message.phase,message.darkLevel);worldTone.setDarkLevel(message.darkLevel);}
  else if(message.type==='weights'){characterPanel.weights(message);classicHud.weights(message);}
  else if(message.type==='currency')updateCurrency(message);
  else if(message.type==='levelUp'){audio.play('levelUp',.45);characterPanel.level(message.level,message.experience);inventory.refreshItemDescription();classicHud.level(message.level,message.experience);combatStatus.textContent=`升级至 ${message.level} 级`;}
  else if(message.type==='experience'){characterPanel.experience(message.total);classicHud.experience(message.total);combatStatus.textContent=`经验 +${message.gained} · 当前 ${message.total}`;}
  else if(message.type==='magicKeyResult'){if(!message.accepted)skillBar.rejectKeyBinding(message.reason??'服务端未确认快捷键设置',message.bindingId);}
  else if(message.type==='skills'){skillBar.replace(message.skills);classicHud.replaceSkills(message.skills);}
  else if(message.type==='skillAdded'){skillBar.add(message.skill);classicHud.addSkill(message.skill);connection.textContent=`学会 ${message.skill.name}`;}
  else if(message.type==='skillRemoved'){skillBar.remove(message.magicId);classicHud.removeSkill(message.magicId);}
  else if(message.type==='skillProgress'){skillBar.progress(message.magicId,message.level,message.currentTrain);classicHud.progress(message.magicId,message.level,message.currentTrain);}
  else if(message.type==='spellResult'){skillBar.resolve();connection.textContent=message.accepted?`${message.name} 已由服务端接受`:`${message.name} 施放失败`;}
  else if(message.type==='warriorSkill'){skillBar.warriorState(message);const parts=[message.thrusting===true?'刺杀开启':message.thrusting===false?'刺杀关闭':'',message.halfMoon===true?'半月开启':message.halfMoon===false?'半月关闭':'',message.fireHit===true?'烈火蓄力':message.fireHit===false?'烈火未蓄力':'',message.powerHit?'攻杀就绪':''].filter(Boolean);if(parts.length)combatStatus.textContent=parts.join(' · ');}
  else if(message.type==='magicEffect'){const caster=entities.get(message.casterId);if(caster)update({...caster,action:'spell'});magicEffects.resolve(message);combatStatus.textContent=`魔法效果 ${message.effectType}/${message.effect} · ${message.x},${message.y}`;}
  else if(message.type==='spellCast'){const caster=entities.get(message.casterId);if(caster)update({...caster,x:message.x,y:message.y,action:'spell'});magicEffects.cast(message.casterId,message.magicId);}
  else if(message.type==='magicFailed'){skillBar.resolve();combatStatus.textContent='魔法未产生效果';}
  else if(message.type==='mapEvent')magicEffects.showEvent(message);
  else if(message.type==='mapEventRemoved')magicEffects.hideEvent(message.id);
  else if(message.type==='rushBlocked'){const entity=entities.get(message.id);if(entity){if(entity.self){cancelWorldIntent();pending=undefined;}update({...entity,action:'rushBlocked',direction:message.direction,rushTarget:{x:message.targetX,y:message.targetY}});}}
  else if(message.type==='groupMode'){receiveGroupMode(message.enabled);}
  else if(message.type==='attackMode')receiveAttackMode(message.mode);
  else if(message.type==='guildName'){guildName=message.guildName;guildRankName=message.rankName;renderGuild();}
  else if(message.type==='guildInfo'){resolveGuildAction('open');setGuildChatMode(false);if(guildEditor.isOpen()&&(guildName!==message.guildName||message.canManage!==true))guildEditor.cancel();if(guildName&&guildName!==message.guildName){guildNoticeDraft=undefined;guildRanksDraft=undefined;}guildName=message.guildName;guildCanManage=message.canManage===true;syncGuildNotice(message.notice.join('\n'));guildWarGuildNames=[...message.warGuilds];guildWarTimers=Array.isArray(message.guildWarTimers)?message.guildWarTimers.map((value:{name:string;remainingMs:number})=>({name:value.name,remainingMs:value.remainingMs})):[];guildWarReceivedAt=performance.now();guildAllyGuildNames=[...message.allyGuilds];guildMemberNames=[];syncGuildRanks([]);renderGuild();connection.textContent=`行会：${guildName}`;}
  else if(message.type==='guildMembers'){resolveGuildAction('members');setGuildChatMode(false);guildMemberNames=[...message.members];syncGuildRanks(message.ranks.map((rank:{rankNo:number;rankName:string;members:string[]})=>({rankNo:rank.rankNo,rankName:rank.rankName,members:[...rank.members]})));renderGuild();connection.textContent=guildMemberNames.length?`行会成员：${guildMemberNames.join('、')}`:'行会暂无成员';}
  else if(message.type==='guildResult'){const action=guildActionForResult(message.action);if(action)resolveGuildAction(action);
   const labels:Record<string,string>={open:'打开行会',add:'邀请入会',remove:'移除成员',rank:'更新封号',ally:'结盟',breakAlly:'解除联盟'};
   const reasons:Record<string,string>={'-1':'已经加入其他行会','-2':'缺少创建费用','-3':'双方掌门人未相邻或无法结盟','-4':'行会名无效或已经存在','-5':'联盟权限未开启','1':'没有使用权限','2':'对象不存在或未面对掌门人','3':'对象已经在本行会','4':'对象已经加入其他行会','5':'对象拒绝加入行会'};
   if(message.action==='open'&&!message.accepted){guildName='';guildRankName='';guildNotice='';guildCanManage=false;guildNoticeDraft=undefined;guildRanksDraft=undefined;guildWarGuildNames=[];guildWarTimers=[];guildAllyGuildNames=[];guildMemberNames=[];guildRanks=[];renderGuild();}
   if(message.action==='create'&&message.accepted){connection.textContent='行会创建成功，正在载入行会资料…';deferWorldCommand({type:'guildOpen'},120);}
   if((message.action==='ally'||message.action==='breakAlly')&&message.accepted&&socket?.readyState===WebSocket.OPEN)deferWorldCommand({type:'guildOpen'},120);
   else connection.textContent=message.accepted?`${labels[message.action]??'行会操作'}成功`:`${labels[message.action]??(message.action==='create'?'创建行会':'行会操作')}失败 · ${reasons[String(message.reason)]??(message.action==='open'?'当前角色未加入行会':`原因 ${message.reason}`)}`;
  }
  else if(message.type==='groupMembers'){groupMemberNames=[...message.members];renderGroup();connection.textContent=groupMemberNames.length?`队伍成员：${groupMemberNames.join('、')}`:'队伍已清空';}
  else if(message.type==='groupCancel'){groupPending=undefined;cancelGroupConfirmation();groupEnabled=false;groupMemberNames=[];renderGroup();connection.textContent='队伍已解散';}
  else if(message.type==='groupResult'){receiveGroupResult(message);}
  else if(message.type==='tradeOpened'){clearTradeTimers();releasePendingTradeItem();tradeRequestPending=false;tradeRequestTimedOut=false;tradeOpen=true;tradeLocal.clear();tradeRemote.clear();tradeLocalSlots.clear();tradeRemoteSlots.clear();tradeGold=0;tradeRemoteGold=0;tradePendingAction=null;tradePendingMakeIndex=undefined;tradePendingTimedOut=false;tradeAccepted=false;tradeCancelPending=false;tradeTarget.value=message.target;tradeGoldInput.value='0';renderTrade();showClassicWindow('trade');connection.textContent=`已与 ${message.target} 打开交易`;
  }
  else if(message.type==='tradeRemoteItemAdded'){tradeRemote.set(message.item.makeIndex,message.item);renderTrade();}
  else if(message.type==='tradeRemoteItemRemoved'){tradeRemote.delete(message.item.makeIndex);renderTrade();}
  else if(message.type==='tradeRemoteGold'){tradeRemoteGold=message.gold;renderTrade();}
  else if(message.type==='tradeGold'){resolveTradeMutation();tradeGold=message.gold;tradeGoldInput.value=String(message.gold);renderTrade();updateCurrency({gold:message.availableGold});connection.textContent=`交易金币已设置为 ${message.gold}`;}
  else if(message.type==='tradeResult'){
   const labels:Record<string,string>={request:'发起交易',add:'放入物品',remove:'取回物品',gold:'设置金币'};
   const pendingMakeIndex=tradePendingMakeIndex;
   if(message.action==='request'){if(tradeRequestTimer!==undefined)clearTimeout(tradeRequestTimer);tradeRequestTimer=undefined;tradeRequestPending=false;tradeRequestTimedOut=false;}
   if(message.action==='add'||message.action==='remove'||message.action==='gold')resolveTradeMutation();
   if(message.action==='add'&&message.accepted&&message.item){tradeLocal.set(message.item.makeIndex,message.item);inventory.resolve(message.item.makeIndex,true,true);}
   if(message.action==='add'&&!message.accepted&&pendingMakeIndex!==undefined)inventory.resolve(pendingMakeIndex,false,false);
   if(message.action==='remove'&&message.accepted&&message.item){tradeLocal.delete(message.item.makeIndex);inventory.add(message.item);}
   renderTrade();connection.textContent=message.accepted?`${labels[message.action]??'交易操作'}成功`:`${labels[message.action]??'交易操作'}失败 · 原因 ${message.reason}`;
  }
  else if(message.type==='tradeClosed'){for(const item of tradeLocal.values())inventory.add(item);clearTrade();hideTradeWindow();updateCurrency({gold:message.gold});connection.textContent='交易已取消，物品和金币已退回';}
  else if(message.type==='tradeSuccess'){clearTrade();hideTradeWindow();updateCurrency({gold:message.gold});connection.textContent='交易成功';}
  else if(message.type==='door'){
   void view.setDoor(message.x,message.y,message.open);
   if(message.open&&doorRetry&&doorRetry.x===message.x&&doorRetry.y===message.y){
    const retry=doorRetry;doorRetry=undefined;const actor=self===undefined?undefined:entities.get(self);
    if(actor&&!actor.dead&&!pendingAction){const dx=Math.sign(retry.x-actor.x),dy=Math.sign(retry.y-actor.y);if(sendMovement(actor,dx,dy,retry.run))connection.textContent=`门已打开，继续前进 · ${message.x}, ${message.y}`;}
   }else{if(!message.open)clickDestination=undefined;connection.textContent=message.open?`门已打开 · ${message.x}, ${message.y}`:`门已关闭 · ${message.x}, ${message.y}`;}
  }
  else if(message.type==='npcDialogue'){
   prepareDialogueInputRefresh(message.npcId,message.options);
   dialogueElement.dataset.dialogueKind='npc';
   dialogueNpcId=String(message.npcName).includes('国王')?message.npcId:undefined;renderGuild();
   shop.clear();storage.clear();repair.clear();hideClassicUtilityWindow();dialogueElement.hidden=false;classicHud.skinWindow(dialogueElement,'npc');serviceWindowOpened(dialogueElement);dialogueTitle.textContent=message.npcName;dialogueOptions.replaceChildren();
   if(Array.isArray(message.parts))renderDialogueParts(message.npcId,message.parts);
   else{renderDialogueText(message.text);for(const option of message.options)dialogueOptions.append(createDialogueOptionControl(message.npcId,option));}
  }
   else if(message.type==='dialogueMessage'){if(dialogueInputPending)releaseDialogueInputPending();if(Array.isArray(message.quests))for(const quest of message.quests)updateQuest(quest as QuestState);else if(message.quest)updateQuest(message.quest as QuestState);void systemDialog.show({text:message.text,buttons:['ok']});}
  else if(message.type==='npcDialogueClosed'){npcSession.invalidate();hideDialogue();shop.clear();storage.clear();repair.clear();}
  else if(message.type==='shop'){dialogueElement.hidden=true;storage.clear();repair.clear();hideServiceWindows();shop.open(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#shop-panel')!,'shop');serviceWindowOpened(document.querySelector<HTMLElement>('#shop-panel')!);connection.textContent=`商店已打开 · ${message.items.length} 种商品`;}
  else if(message.type==='shopSell'){dialogueElement.hidden=true;storage.clear();repair.clear();hideServiceWindows();shop.openSell(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#shop-panel')!,'shop');serviceWindowOpened(document.querySelector<HTMLElement>('#shop-panel')!);connection.textContent='请选择要出售的背包物品';}
  else if(message.type==='shopDetails'){if(shop.showDetails(message.npcId,message.items,message.page,message.name))connection.textContent=`已载入 ${message.items.length} 件具体商品`;}
  else if(message.type==='shopPurchaseResult'){
   if(message.accepted&&message.gold!==null)updateCurrency({gold:message.gold});
   if(!npcSession.accept(message)||!shop.resolve(message.name,message.makeIndex,message.accepted))return;
   const reasons:Record<number,string>={1:'商品已售罄',2:'背包空间或负重不足',3:'金币不足',4:'缺少必需物品'};
   connection.textContent=message.accepted?`购买 ${message.name} 成功 · 剩余 ${message.gold} 金币`:`购买失败 · ${reasons[message.reason]??`原因 ${message.reason}`}`;
  }
  else if(message.type==='shopSellQuote'){if(shop.showSellQuote(message.npcId,message.item,message.price))connection.textContent=message.price>0?`${message.item.name} 可卖 ${message.price} 金币`:`${message.item.name} 无法出售`;}
  else if(message.type==='shopSellResult'){
   if(message.accepted){inventory.remove(message.item.makeIndex);itemQuickBar.remove(message.item.makeIndex);if(message.gold!==null)updateCurrency({gold:message.gold});syncServiceInventory();}
   if(!npcSession.accept(message)||!shop.resolveSale(message.item,message.accepted))return;
   connection.textContent=message.accepted?`已卖出 ${message.item.name} · 当前 ${message.gold} 金币`:`出售 ${message.item.name} 失败`;
  }
  else if(message.type==='repairItems'){dialogueElement.hidden=true;shop.clear();storage.clear();hideServiceWindows();repair.open(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#repair-panel')!,'repair');serviceWindowOpened(document.querySelector<HTMLElement>('#repair-panel')!);connection.textContent='请选择要修理的背包物品';}
  else if(message.type==='repairQuote'){if(repair.showQuote(message.npcId,message.item,message.price))connection.textContent=message.price>=0?`${message.item.name} 修理需要 ${message.price} 金币`:`${message.item.name} 无需或无法修理`;}
  else if(message.type==='repairResult'){if(message.accepted){inventory.update(message.item);itemQuickBar.update(message.item);equipment.update(message.item);if(message.gold!==null)updateCurrency({gold:message.gold});syncServiceInventory();}if(!npcSession.accept(message)||!repair.resolve(message.item,message.accepted))return;connection.textContent=message.accepted?`${message.item.name} 修理完成 · 当前 ${message.gold} 金币`:`${message.item.name} 修理失败`;}
  else if(message.type==='storageDeposit'){dialogueElement.hidden=true;shop.clear();repair.clear();hideServiceWindows();storage.openDeposit(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#storage-panel')!,'storage');serviceWindowOpened(document.querySelector<HTMLElement>('#storage-panel')!);connection.textContent='请选择要存入仓库的物品';}
  else if(message.type==='storageItems'){dialogueElement.hidden=true;shop.clear();repair.clear();hideServiceWindows();storage.openItems(message.npcId,message.items);classicHud.skinWindow(document.querySelector<HTMLElement>('#storage-panel')!,'storage');serviceWindowOpened(document.querySelector<HTMLElement>('#storage-panel')!);connection.textContent=`仓库共 ${message.items.length} 件物品`;}
  else if(message.type==='storageResult'){
   if(message.accepted){if(message.kind==='store'){inventory.remove(message.item.makeIndex);itemQuickBar.remove(message.item.makeIndex);}else if(message.kind==='take'){inventory.add(message.item);itemQuickBar.add(message.item);}syncServiceInventory();}
   if(!npcSession.accept(message)||!storage.resolve(message.item,message.accepted))return;
   const reasons:Record<number,string>={1:'服务端拒绝操作',2:'仓库已满',3:'背包空间或负重不足'};connection.textContent=message.accepted?(message.kind==='store'?`已存入 ${message.item.name}`:`已取回 ${message.item.name}`):`仓库操作失败 · ${reasons[message.reason]??`原因 ${message.reason}`}`;
  }
  else if(message.type==='chat'){recordGuildChat(message.channel,message.text,message.foreground,message.background);appendChat(message.channel,message.text,message.foreground,message.background);}
  else if(message.type==='systemMessage'){if(typeof goldDrop!=='undefined')goldDrop?.serverMessage(message.text);combatStatus.textContent=message.text;appendChat('system',message.text,message.foreground,message.background);if(message.castleWar){castleWarStatus=message.castleWar;renderGuild();}}
  else if(message.type==='entityRemoved')removeEntity(message.id);
  else if(message.type==='actionResult'){
   if(message.kind==='mine')mining.settle(message);
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
      const attempted=movementTrace(movement);
      const occupied=new Set([...entities.values()].filter(other=>!other.self&&!other.dead).map(other=>`${other.x},${other.y}`));
      const blocker=movementBlocker(attempted,cell=>occupied.has(`${cell.x},${cell.y}`),(x,y)=>view.isWalkable(x,y));
      if(retryTarget!==undefined&&message.reason===28){for(const cell of attempted){pursuitRejectedCells.add(`${cell.x},${cell.y}`);movementRejectedCells.add(`${cell.x},${cell.y}`);}pursuitTarget=retryTarget;pursuitHarvest=retryHarvest;connection.textContent='目标移动，正在重新接近…';window.setTimeout(()=>{if(pursuitTarget===retryTarget&&!pendingAction)continuePursuit();},350);}
      else if(message.reason===28&&blocker?.kind==='actor'){
       movementRejectedCells.add(`${blocker.cell.x},${blocker.cell.y}`);
      if(clickDestination){connection.textContent='有对象挡路，正在调整路线…';continueClickDestination();}
      else connection.textContent='有对象挡路，移动已停止';
      }else if(message.reason===28&&blocker?.kind==='terrain'&&worldCommandsAvailable()){const retry={x:blocker.cell.x,y:blocker.cell.y,direction:movement.direction,run:movement.run};doorRetry=retry;socket!.send(JSON.stringify({type:'openDoor',x:blocker.cell.x,y:blocker.cell.y}));connection.textContent=`尝试打开门 · ${blocker.cell.x}, ${blocker.cell.y}`;window.setTimeout(()=>{if(doorRetry===retry&&!pendingAction){doorRetry=undefined;clickDestination=undefined;connection.textContent='该方向暂时无法通行';}},350);}
      else if(message.reason===28){
       // The entity update can arrive after this rejection. Temporarily avoid
       // every tile in the attempted run and replan instead of sending a door
       // command for a walkable tile with no visible blocker yet.
       for(const cell of attempted)movementRejectedCells.add(`${cell.x},${cell.y}`);
       if(clickDestination){connection.textContent='路径格暂时不可进入，正在调整路线…';continueClickDestination();}
       else connection.textContent='路径格暂时不可进入，移动已停止';
      }else{clickDestination=undefined;connection.textContent='该方向暂时无法通行';}
    }
   }else if(message.accepted){pendingAction.acknowledged=true;agentObserver.event('action-ack',{actionId:pendingAction.actionId,kind:pendingAction.kind,accepted:true});finishNonMovementAction(performance.now());}else{agentObserver.event('action-rollback',{actionId:pendingAction.actionId,kind:pendingAction.kind,accepted:false,reason:message.reason});pendingAction=undefined;continueMovementIntent();}
  }
  else if(message.type==='inventory'){inventory.replace(message.items);itemQuickBar.replace(message.items);syncServiceInventory();}
  else if(message.type==='equipment')equipment.replace(message.slots);
  else if(message.type==='itemAdded'){inventory.add(message.item);itemQuickBar.add(message.item);syncServiceInventory();connection.textContent=`获得 ${message.item.name}`;}
  else if(message.type==='itemRemoved'){inventory.remove(message.makeIndex);itemQuickBar.remove(message.makeIndex);syncServiceInventory();}
  else if(message.type==='itemUpdated'){inventory.update(message.item);itemQuickBar.update(message.item);equipment.update(message.item);syncServiceInventory();}
  else if(message.type==='equipmentDurability'){equipment.set(message.slot,message.item);}
  else if(message.type==='equipmentBroken'){equipment.remove(message.slot);connection.textContent=`${message.item.name} 已损坏`;}
  else if(message.type==='dropResult'){const inventoryHandled=inventory.resolve(message.makeIndex,message.accepted,true);const quickBarHandled=itemQuickBar.resolve(message.makeIndex,message.accepted,true);if(!inventoryHandled&&!quickBarHandled)return;syncServiceInventory();connection.textContent=message.accepted?'物品已落到地面':'服务端拒绝丢弃物品';}
  else if(message.type==='itemActionResult'){
   let handled=false;
   if(message.kind==='equip'){handled=inventory.resolve(message.makeIndex,message.accepted,true);if(handled&&message.accepted)equipment.set(message.slot,message.item);}
   else if(message.kind==='takeoff')handled=equipment.resolve(message.slot,message.accepted,message.makeIndex);
   else if(message.kind==='use'){const inventoryHandled=inventory.resolve(message.makeIndex,message.accepted,true);const quickBarHandled=itemQuickBar.resolve(message.makeIndex,message.accepted,true);handled=inventoryHandled||quickBarHandled;}
   if(!handled)return;
   syncServiceInventory();
   if(message.accepted&&message.feature!==null&&self!==undefined){const actor=entities.get(self);if(actor)update({...actor,feature:message.feature});}
   connection.textContent=message.accepted?message.kind==='equip'?`已装备 ${message.item.name}`:message.kind==='takeoff'?`已卸下 ${message.item.name}`:`已使用 ${message.item.name}`:`物品操作失败 (${message.reason})`;
  }
  else if(message.type==='groundItem'){groundItems.add(message);refreshMiniMapMarkers();connection.textContent=`地面出现 ${message.name} · ${message.x}, ${message.y}`;}
  else if(message.type==='groundItemRemoved'){if(pursuitGroundItem===message.id)pursuitGroundItem=undefined;groundItems.remove(message.id);refreshMiniMapMarkers();}
  else if(message.type==='error'){
   if(message.commandType==='selectServer'||message.commandType==='acknowledgeEntryNotice'){stopEntryScenes(message.message||'主流程请求被拒绝，请重新登录');return;}
   if(['tradeRequest','tradeAdd','tradeRemove','tradeGold','tradeAccept','tradeCancel'].includes(message.commandType)){
    if(message.commandType==='tradeRequest'){if(tradeRequestTimer!==undefined)clearTimeout(tradeRequestTimer);tradeRequestTimer=undefined;tradeRequestPending=false;tradeRequestTimedOut=false;}
    if(['tradeAdd','tradeRemove','tradeGold'].includes(message.commandType)){const pendingMakeIndex=tradePendingMakeIndex;resolveTradeMutation();if(message.commandType==='tradeAdd'&&pendingMakeIndex!==undefined)inventory.resolve(pendingMakeIndex,false,false);}
    if(message.commandType==='tradeAccept')tradeAccepted=false;
    if(message.commandType==='tradeCancel')tradeCancelPending=false;
    renderTrade();connection.textContent=message.message||'交易操作失败';appendChat('system',`交易操作失败：${message.message||'请检查交易状态'}`);return;
   }
   if(message.commandType==='dropGold'){if(typeof goldDrop!=='undefined')goldDrop?.rejected(message.message);connection.textContent=message.message;appendChat('system',`操作失败：${message.message}`);return;}
     if(message.commandType==='deleteCharacter'){if(characterDelete.reject(message)){connection.textContent=message.message;showAuthNotice(message.message);}return;}
   if(['guildOpen','guildMembers','guildAdd','guildRemove','guildNotice','guildRanks','guildAlly','guildBreakAlly'].includes(message.commandType)&&handleGuildCommandError(message.commandType,message.message))return;
     if(message.commandType==='attackMode'&&rejectAttackMode(message.message))return;
     if(['groupMode','groupCreate','groupAdd','groupRemove'].includes(message.commandType)){receiveGroupError(message.commandType,message.message);return;}
    if(['login','register','selectCharacter','createCharacter'].includes(message.commandType)){clearAuthenticationWait(active);if(armCurrentAuthWait===waitForResponse)armCurrentAuthWait=undefined;if(automatic){reconnectEnabled=false;credentials=undefined;selectedCharacter=undefined;setWorldConnectionState();document.body.classList.remove('in-world');classicAuth.showLogin();const rejected=socket;socket=undefined;rejected?.close();}classicAuth.setBusy(false);connection.textContent=message.message;if(message.commandType==='register'){classicAuth.registrationRejected(message.message||'账号创建失败，请检查填写内容。');return;}showAuthNotice(message.message,undefined,()=>{if(message.commandType==='login')document.querySelector<HTMLInputElement>('#password')?.focus();});return;}
    if(message.commandType==='say'){chatController.rejectLastSend(message.message,message.chatId);rejectAttackModeCycle(message.chatId,message.message);return;}
   if(message.commandType==='mine'&&message.actionId!==undefined)mining.reject({actionId:message.actionId,mapGeneration});
   if(message.commandType==='setMagicKey'){skillBar.rejectKeyBinding(message.message,message.bindingId);connection.textContent=message.message;return;}
   if(message.npcSessionId!==null&&message.npcSessionId!==undefined&&!npcSession.accept(message))return;
   if(['npc','dialogueSelect','shopDetails','buyShopItem','querySellItem','sellShopItem','queryRepairItem','repairItem','storeItem','takeStorageItem','guildCreate','guildWarRequest','castleWarDialogue'].includes(message.commandType)){
    if(!npcSession.accept(message))return;
    if(message.commandType==='npc'){closeNpcSession();hideDialogue();}
    else if(message.commandType==='dialogueSelect')releaseDialogueInputPending(true);
     else if(message.commandType==='guildCreate')resolveGuildAction('create');
    else if(['shopDetails','buyShopItem','querySellItem','sellShopItem'].includes(message.commandType))shop.rejectPending(undefined,message.commandType==='shopDetails'?'details':message.commandType==='buyShopItem'?'purchase':message.commandType==='querySellItem'?'quote':'sale');
    else if(['queryRepairItem','repairItem'].includes(message.commandType))repair.rejectPending(undefined,message.commandType==='queryRepairItem'?'quote':'repair');
    else if(['storeItem','takeStorageItem'].includes(message.commandType))storage.rejectPending(undefined,message.commandType==='storeItem'?'store':'take');
    connection.textContent=message.message;appendChat('system',`操作失败：${message.message}`);return;
   }
   if(message.actionId!==undefined&&pendingAction?.actionId===message.actionId){
    const failed=pendingAction!;pendingAction=undefined;
    if(failed.kind==='move'&&pending){const movement=pending;pending=undefined;held=undefined;rightPointer=undefined;clickDestination=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;const entity=self===undefined?undefined:entities.get(self);if(entity){update({...entity,x:movement.fromX,y:movement.fromY,action:'standing'});classicHud.position(view.map,movement.fromX,movement.fromY);minimap.setPosition(movement.fromX,movement.fromY);void view.setCenter(movement.fromX,movement.fromY);}}
    else continueMovementIntent();
   }
   skillBar.cancelSelection();skillBar.resolve();inventory.rejectPending();itemQuickBar.rejectPending();equipment.rejectPending();shop.rejectPending();repair.rejectPending();storage.rejectPending();connection.textContent=message.message;appendChat('system',`操作失败：${message.message}`);
  }
 });
active.addEventListener('close',()=>{if(socket!==active)return;clearAuthenticationWait(active);if(armCurrentAuthWait===waitForResponse)armCurrentAuthWait=undefined;if(registrationPending){registrationPending=false;reconnectEnabled=false;setWorldConnectionState();credentials=undefined;classicAuth.setBusy(false);classicAuth.registrationRejected('注册连接已中断，请检查网络后重试。');connection.textContent='注册连接已中断，请检查网络后重试';return;}if(classicAuth.isEntrySceneOpen()){stopEntryScenes('主流程连接已断开，请重新登录');return;}if(characterDelete.disconnected())return;if(logout.disconnected())return;logout.interrupt();settings.hide(false);guildEditor.cancel();systemDialog.interrupt();if(typeof goldDrop!=='undefined')goldDrop?.interrupt();cancelGroupConfirmation();cancelGuildActionPrompt();groupPending=undefined;guildPendingAction=undefined;guildMemberPromptPending=undefined;renderGroup();renderGuild();audio.clear();magicEffects.clear();for(const visual of visuals.values())visual.destroy();visuals.clear();mining.reset();npcSession.invalidate();hideDialogue();clearTrade();shop.clear();repair.clear();storage.clear();skillBar.cancelKeyBinding();pending=undefined;pendingAction=undefined;doorRetry=undefined;held=undefined;rightPointer=undefined;clickDestination=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;skillBar.cancelSelection();skillBar.resolve();inventory.cancelSelection();inventory.rejectPending();itemQuickBar.rejectPending();equipment.rejectPending();shop.rejectPending();repair.rejectPending();storage.rejectPending();stopCombat();if(reconnectEnabled&&credentials){scheduleReconnect();}else{setWorldConnectionState();document.body.classList.remove('in-world');classicAuth.showLogin();classicAuth.setBusy(false);connection.textContent='连接已断开，请重新登录';}});
 active.addEventListener('error',()=>{if(socket===active){if(!reconnectEnabled||!credentials||reconnectAttempts>=5)classicAuth.setBusy(false);connection.textContent=automatic?'正在重新连接游戏…':'无法连接游戏网关';}});
}
loginForm.addEventListener('submit',event=>{event.preventDefault();connect('login');});
reconnectCancel.addEventListener('click',cancelReconnect);
classicAuth.bindRegistration((account,password)=>connect('register',undefined,{account,password}));
chatChannel.addEventListener('change',()=>{setChatChannel(chatChannel.value as ChatChannel);if(chatChannel.value==='whisper')chatTarget.focus();});
chatForm.addEventListener('submit',event=>{event.preventDefault();chatController.submit();});
groupMode.addEventListener('click',()=>sendGroup('groupMode'));
groupCreate.addEventListener('click',()=>confirmGroupAction('groupCreate'));
groupAdd.addEventListener('click',()=>confirmGroupAction('groupAdd'));
groupRemove.addEventListener('click',()=>confirmGroupAction('groupRemove'));
attackModeSelect.addEventListener('change',()=>requestAttackMode(Number(attackModeSelect.value)));
guildOpen.addEventListener('click',()=>sendGuild('guildOpen'));
guildMembersRequest.addEventListener('click',()=>sendGuild('guildMembers'));
guildScrollUp.addEventListener('click',()=>scrollGuildWindow(-1));
guildScrollDown.addEventListener('click',()=>scrollGuildWindow(1));
guildChatToggle.addEventListener('click',toggleGuildChat);
guildCreate.addEventListener('click',()=>{if(!worldCommandsAvailable()||dialogueNpcId===undefined||guildPendingAction)return;const name=guildNameInput.value.trim();if(!name){connection.textContent='请填写行会名';guildNameInput.focus();return;}beginGuildAction('create',`创建行会 ${name}`,()=>sendNpcCommand({type:'guildCreate',npcId:dialogueNpcId!,guildName:name}));});
guildWarRequest.addEventListener('click',()=>{if(!worldCommandsAvailable()||dialogueNpcId===undefined)return;const target=guildWarTarget.value.trim();if(!target){connection.textContent='请填写目标行会名';guildWarTarget.focus();return;}sendNpcCommand({type:'guildWarRequest',npcId:dialogueNpcId,guildName:target});connection.textContent=`正在向 ${target} 请求行会战…`;});
guildCastleDialogue.addEventListener('click',()=>{if(!worldCommandsAvailable()||dialogueNpcId===undefined)return;sendNpcCommand({type:'castleWarDialogue',npcId:dialogueNpcId});connection.textContent='正在打开攻城申请…';});
guildAdd.addEventListener('click',()=>confirmGuildMemberAction('guildAdd'));
guildRemove.addEventListener('click',()=>confirmGuildMemberAction('guildRemove'));
guildNoticeSave.addEventListener('click',()=>{if(!worldCommandsAvailable()||!guildCanManage||!guildName)return;cancelWorldIntent();guildEditor.open({kind:'notice',value:guildNoticeDraft??guildNotice,restoreFocus:guildNoticeSave,hint:'[修改行会公告内容]'});});
 guildRanksSave.addEventListener('click',()=>{if(!worldCommandsAvailable()||!guildCanManage||!guildName)return;if(!guildMemberNames.length){void systemDialog.show({text:'请先读取行会成员列表，再编辑封号配置。',buttons:['ok'],size:'horizontal'});return;}cancelWorldIntent();guildEditor.open({kind:'ranks',value:guildRanksDraft??guildRanksText(),restoreFocus:guildRanksSave,hint:'[修改行会成员的等级和职位] · 格式：#编号 <封号>，随后每行填写成员名'});});
guildAlly.addEventListener('click',()=>confirmGuildAction('ally'));
guildBreakAlly.addEventListener('click',()=>confirmGuildAction('breakAlly'));
tradeRequestForm.addEventListener('submit',event=>{event.preventDefault();if(!worldCommandsAvailable()||tradeRequestPending)return;const target=tradeTarget.value.trim();if(!target){connection.textContent='请填写交易对象';return;}tradeRequestPending=true;tradeRequestTimedOut=false;renderTrade();tradeRequestTimer=window.setTimeout(()=>{tradeRequestPending=false;tradeRequestTimedOut=true;tradeRequestTimer=undefined;renderTrade();},15000);try{socket!.send(JSON.stringify({type:'tradeRequest',target}));connection.textContent=`正在邀请 ${target} 交易…`;}catch{if(tradeRequestTimer!==undefined)clearTimeout(tradeRequestTimer);tradeRequestTimer=undefined;tradeRequestPending=false;tradeRequestTimedOut=false;renderTrade();connection.textContent='交易邀请发送失败，请重试';}});
tradeSetGold.addEventListener('click',()=>{if(!tradeOpen)return;const amount=Math.floor(Number(tradeGoldInput.value));if(!Number.isSafeInteger(amount)||amount<0){connection.textContent='请输入有效金币数量';return;}sendTradeMutation('gold',{type:'tradeGold',amount});});
tradeAccept.addEventListener('click',()=>{if(!worldCommandsAvailable()||!tradeOpen||tradeAccepted||tradePendingAction!==null||tradeCancelPending)return;tradeAccepted=true;renderTrade();try{socket!.send(JSON.stringify({type:'tradeAccept'}));connection.textContent='我方已确认，等待交易完成…';}catch{tradeAccepted=false;renderTrade();connection.textContent='确认请求发送失败，请重试或取消交易';}});
tradeCancel.addEventListener('click',()=>{if(!worldCommandsAvailable()||!tradeOpen||tradeCancelPending)return;tradeCancelPending=true;renderTrade();try{socket!.send(JSON.stringify({type:'tradeCancel'}));connection.textContent='正在取消交易…';}catch{tradeCancelPending=false;renderTrade();connection.textContent='取消请求发送失败，请重试';}});
returnToTown.addEventListener('click',()=>{if(systemDialog.isOpen())return;void logout.request('reselect');});
document.querySelector('#close-dialogue')!.addEventListener('click',()=>closeWindowByElement(dialogueElement));
createCharacterForm.addEventListener('submit',event=>{
 event.preventDefault();if(!worldCommandsAvailable())return;
 const name=document.querySelector<HTMLInputElement>('#character-name')!.value,job=Number(document.querySelector<HTMLSelectElement>('#character-job')!.value),sex=Number(document.querySelector<HTMLSelectElement>('#character-sex')!.value),hair=Number(document.querySelector<HTMLSelectElement>('#character-hair')!.value);
 classicAuth.setBusy(true);
 socket!.send(JSON.stringify({type:'createCharacter',name,job,sex,hair}));armCurrentAuthWait?.('创建角色');connection.textContent=`正在创建 ${name}…`;
});
view.app.canvas.addEventListener('contextmenu',event=>event.preventDefault());
view.app.canvas.addEventListener('dragover',event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';});
view.app.canvas.addEventListener('drop',event=>{
 event.preventDefault();
 if(!worldInputAvailable()||worldInputBlocked())return;
 const makeIndex=Number(event.dataTransfer?.getData('text/plain'));
 if(Number.isSafeInteger(makeIndex)&&makeIndex>0)inventory.requestDrop(makeIndex);
});
view.app.canvas.addEventListener('pointerdown',event=>{
 if(!worldInputAvailable()||worldInputBlocked())return;
 if(performance.now()<ignoreCanvasPointerUntil)return;
 mining.cancel();
 const entity=self===undefined?undefined:entities.get(self);if(!entity||entity.dead||socket?.readyState!==WebSocket.OPEN)return;
 const rect=view.app.canvas.getBoundingClientRect(),stageX=(event.clientX-rect.left)*800/rect.width,stageY=(event.clientY-rect.top)*600/rect.height;
 const clicked=view.cellAtScreen(stageX,stageY),clickedX=clicked.x,clickedY=clicked.y;
 const target=[...visuals.entries()].map(([id,visual])=>({entity:entities.get(id),visual})).filter((entry):entry is {entity:Entity;visual:OnlineActor}=>Boolean(entry.entity)&&entry.visual.hitTest(stageX,stageY)).sort((left,right)=>Math.max(Math.abs(left.entity.x-clickedX),Math.abs(left.entity.y-clickedY))-Math.max(Math.abs(right.entity.x-clickedX),Math.abs(right.entity.y-clickedY)))[0]?.entity;
 rightPointer=undefined;
 if(event.button===2)clickDestination=undefined;
 if(selectedMagic&&event.button===0){clickDestination=undefined;castSelectedAt(target??clicked,target);return;}
 if(target){clickDestination=undefined;interact(target,requestsHarvest(event));return;}
 const clickedItem=groundItems.hitTest(stageX,stageY);
 if(clickedItem){clickDestination=undefined;groundItems.requestPickup(clickedItem);return;}
 if(event.button===0&&gatewayFeatures.mining&&mining.start({x:clickedX,y:clickedY,shift:event.shiftKey,targetPresent:false})){stopCombat();doorRetry=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;held=undefined;clickDestination=undefined;return;}
 if(clickedX===entity.x&&clickedY===entity.y){const item=groundItems.at(entity.x,entity.y);if(item){groundItems.requestPickup(item);}return;}
 stopCombat();doorRetry=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;held=undefined;
 if(event.button===2){rightPointer={pointerId:event.pointerId,clientX:event.clientX,clientY:event.clientY};try{view.app.canvas.setPointerCapture(event.pointerId);}catch{}continuePointerRun();return;}
 clickDestination={x:clickedX,y:clickedY,run:event.shiftKey};continueClickDestination();
});
view.app.canvas.addEventListener('pointermove',event=>{if(rightPointer?.pointerId!==event.pointerId)return;rightPointer.clientX=event.clientX;rightPointer.clientY=event.clientY;});
const stopPointerRun=(event:PointerEvent)=>{if(rightPointer?.pointerId!==event.pointerId)return;rightPointer=undefined;if(view.app.canvas.hasPointerCapture(event.pointerId))view.app.canvas.releasePointerCapture(event.pointerId);};
view.app.canvas.addEventListener('pointerup',stopPointerRun);
view.app.canvas.addEventListener('pointercancel',stopPointerRun);
view.app.canvas.addEventListener('pointercancel',cancelWorldIntent);
view.app.canvas.addEventListener('lostpointercapture',event=>{if(rightPointer?.pointerId===event.pointerId)rightPointer=undefined;});
function selectSkillSlot(index:number){activateSkillSlot(index);}
function activateSkillSlot(index:number){
 if(!worldInputAvailable()||worldInputBlocked())return false;
 mining.cancel();
 const skill=skillBar.skillAt(index);if(!skill)return false;
 const use=skillUseOf(skill.magicId);
 if(use==='passive'){skillBar.cancelSelection();connection.textContent=`${skill.name} 为被动技能，随近战生效`;return true;}
 if(use==='self'||use==='toggle'||use==='charge')return skillBar.castSelf(skill);
 return skillBar.selectSlot(index);
}
function castSelf(skill:MagicSkill){
 if(!worldInputAvailable()||worldInputBlocked()){skillBar.resolve();return;}
 if(!worldCommandsAvailable()||self===undefined||pendingAction){skillBar.resolve();if(pendingAction)connection.textContent='当前动作完成后再施放技能';return;}
 cancelWorldIntent();
 const action=createAction('spell');socket!.send(JSON.stringify({type:'castMagic',magicId:skill.magicId,targetId:self,actionId:action.actionId,mapGeneration}));
 const use=skillUseOf(skill.magicId);
 const actor=entities.get(self);if(actor)update({...actor,action:use==='toggle'||use==='charge'?'standing':'spell'});
 connection.textContent=use==='toggle'?`正在开关 ${skill.name}…`:use==='charge'?`正在蓄力 ${skill.name}…`:`正在施放 ${skill.name}…`;
}
function cycleAttackMode(){
 if(self===undefined||!worldCommandsAvailable()||attackModePending!==undefined)return;
 attackModePending='cycle';attackModeCommandChatId=undefined;attackModeNotice='';renderAttackMode();
 const chatId=chatController.sendCommand('@AttackMode');
 if(chatId===undefined){attackModePending=undefined;attackModeNotice='攻击模式切换失败，请重试';renderAttackMode();connection.textContent=attackModeNotice;return;}
 attackModeCommandChatId=chatId;
}
window.addEventListener('keydown',event=>{if(skillKeyDialog.interceptKey(event))return;if(guildEditor.interceptKey(event))return;if(systemDialog.interceptKey(event))return;if(logoutWaitingView.interceptKey(event))return;if(settings.interceptKey(event))return;routeClassicKey(event,{
 inWorld:worldInputAvailable,worldBlocked:worldInputBlocked,sessionInWorld:()=>document.body.classList.contains('in-world'),sound:()=>audio.toggleEnabled(),logout:mode=>void logout.request(mode),
 cancelTransient:()=>{if(inventory.cancelSelection())return true;if(skillBar.cancelSelection())return true;return skillBar.cancelKeyBinding();},cancel:()=>{cancelWorldIntent();inventory.cancelSelection();skillBar.cancelKeyBinding();},closeTop:closeTopWindow,
 itemKey:event=>itemQuickBar.handleKey(event),chat:prefix=>chatController.open(prefix??(chatChannel.value==='guild'?'!~':'')),chatScroll:key=>questLog.contains(document.activeElement)?scrollQuestLog(key):scrollChatLog(key),minimap:cycleMinimap,attackMode:cycleAttackMode,
 window:toggleClassicWindow,skill:selectSkillSlot,
 movement:event=>{const movement=movementInput(event);if(!movement)return;rightPointer=undefined;stopCombat();doorRetry=undefined;clickDestination=undefined;pursuitTarget=undefined;pursuitHarvest=false;pursuitGroundItem=undefined;held=movement;const actor=self===undefined?undefined:entities.get(self);if(actor)sendMovement(actor,held.dx,held.dy,held.run);},
});});
window.addEventListener('keyup',event=>{if(guildEditor.isOpen()){event.preventDefault();event.stopImmediatePropagation();return;}if(releasesMovement(held,event))held=undefined;});
window.addEventListener('blur',cancelWorldIntent);
window.addEventListener('blur',()=>equipment.rejectPending());
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelWorldIntent();equipment.rejectPending();}});
