import './style.css';
import './ui-calibration.css';
import {loadClassicUiSession} from './classic-ui';
import {ClassicAuth,type SelectCharacter} from './classic-auth';
import {CharacterDeleteController} from './character-delete';
import {SystemDialogController,type SystemDialogButton,type SystemDialogSize} from './system-dialog';
import {GoldDropController} from './gold-drop';
import {SkillKeyDialogController} from './skill-key-dialog';
import {validatePasswordChange,type PasswordChangeFields} from './password-change';
import {ClassicHud} from './classic-hud';
import {bindHudPreviewControls} from './hud-preview';
let disposeHudPreview=()=>{};
import {CharacterPanel,type CharacterAttributes} from './character-panel';
import {showCharacterPage,wireCharacterPageButtons,nativeWindowPositionVersion,type CharacterPage} from './character-window';
import {EquipmentView,InventoryView,type InventoryItem} from './inventory';
import {ItemQuickBar} from './item-quickbar';
import {PaperdollView} from './paperdoll';
import {ClassicStage} from './classic-stage';
import {ShopView} from './shop';
import {RepairView} from './repair';
import {StorageView} from './storage';
import {SkillBar,type MagicSkill} from './skills';
import {bringClassicWindowToFront,closeClassicWindowEntry,closeTopClassicWindow,makeClassicWindowDraggable} from './window-drag';
import {GameAudio} from './game-audio';
import {ClientSettingsView,DisplaySettings} from './client-settings';
import {LogoutController,LogoutWaitingView} from './logout';
import {classicUiLayout,classicWindowClosesOnEscape} from './classic-layout';
import {scrollGuildMemberList} from './guild-list';
import {routeClassicKey} from './classic-input';
import settingsContract from '../../../content/classic-176/client-settings.json';

const frame=document.querySelector<HTMLElement>('#calibration-stage-frame')!;
const content=document.querySelector<HTMLElement>('#calibration-content')!;
const nationalPreview=document.querySelector<HTMLElement>('#national-preview')!;
new ClassicStage(frame,content);
for(const id of ['character-window','inventory-window','npc-dialog','shop-panel','repair-panel','storage-panel','calibration-quest-panel','calibration-attack-panel','calibration-targets-panel','calibration-ground-panel','calibration-group-panel','calibration-guild-panel','calibration-chat-panel','calibration-trade-panel']){
 const panel=document.querySelector<HTMLElement>(`#${id}`);
 if(panel)makeClassicWindowDraggable(panel,content,nativeWindowPositionVersion(panel.id));
}

const sampleAttributes:CharacterAttributes={
 level:7,job:0,gold:128,gameGold:0,
 ac:{min:0,max:2},mac:{min:0,max:0},dc:{min:3,max:6},mc:{min:0,max:0},sc:{min:0,max:0},
 hp:24,mp:18,maxHp:30,maxMp:30,experience:2485,maxExperience:10000,
 weight:18,maxWeight:50,wearWeight:5,maxWearWeight:30,handWeight:3,maxHandWeight:15
};
const sampleItems:InventoryItem[]=[
 {name:'木剑',makeIndex:1001,durability:3970,maxDurability:4000,stdMode:5,weight:1,looks:1},
 {name:'布衣(男)',makeIndex:1002,durability:1990,maxDurability:2000,stdMode:10,weight:2,looks:1},
 {name:'小量金创药',makeIndex:1003,durability:1,maxDurability:1,stdMode:1,weight:1,looks:2},
 {name:'蜡烛',makeIndex:1004,durability:8000,maxDurability:8000,stdMode:31,weight:1,looks:3},
];
const sampleSkill:MagicSkill={key:0,level:3,currentTrain:82,magicId:1,name:'基本剑术',effectType:0,effect:0,spell:0,power:0,trainLevels:[0,20,50,100],maxTrain:[0,100,100,100],job:0,delay:0,defSpell:0,defPower:0,maxPower:0,defMaxPower:0,description:'基础剑术'};

const hud=new ClassicHud(document.querySelector<HTMLElement>('#classic-hud')!,()=>false);
const audio=new GameAudio(document.querySelector<HTMLButtonElement>('#audio-toggle')!);
const auth=new ClassicAuth(document.querySelector<HTMLElement>('#auth-overlay')!,phase=>audio.setPhase(phase));
let goldDrop:GoldDropController|undefined;
const systemDialog=new SystemDialogController(document.querySelector<HTMLElement>('#classic-modal-layer')!,content,{onVisibilityChange:active=>{if(active){if(typeof skillKeyDialog!=='undefined')skillBar.cancelKeyBinding();goldDrop?.cancelMoving();}}});
const skillKeyDialog=new SkillKeyDialogController(document.querySelector<HTMLElement>('#classic-modal-layer')!,{onVisibilityChange:open=>{if(open){goldDrop?.cancelMoving();if(typeof inventory!=='undefined')inventory.cancelSelection();}}});
let deletePreviewEpoch=0;
const characterDeletePreview=new CharacterDeleteController({
 available:()=>screen==='select',confirm:text=>systemDialog.show({text,buttons:['yes','no','cancel'],size:'vertical'}),busy:value=>auth.setBusy(value),
 send:command=>{
  const epoch=deletePreviewEpoch,outcome=document.querySelector<HTMLSelectElement>('#delete-preview-result')!.value;
  document.querySelector<HTMLElement>('#calibration-status-message')!.textContent='校准夹具：等待删除结果，不发送真实协议。';
  window.setTimeout(()=>{if(epoch!==deletePreviewEpoch)return;const unknown=outcome==='unknown',deleted=outcome==='deleted';characterDeletePreview.handle({type:'characterDeletionResult',requestId:command.requestId,name:command.name,status:outcome as 'deleted'|'rejected'|'not-deleted'|'unknown',accepted:unknown?null:deleted,requestSent:true,requiresLogin:unknown,characters:unknown?undefined:deleted?characters.filter(role=>role.name!==command.name):characters});},700);return true;
 },
 result:value=>{if(value.characters){characters.splice(0,characters.length,...value.characters);auth.showSelect(characters);}document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=`校准夹具删除结果：${value.status}，不代表真实角色结果。`;},unknown:()=>show('login')
});
const displaySettings=new DisplaySettings();
const settings=new ClientSettingsView(document.querySelector<HTMLElement>('#classic-modal-layer')!,content,{audio,display:displaySettings,canLogout:()=>true,logout:mode=>void logout.request(mode)});
const logoutWaitingView=new LogoutWaitingView(document.querySelector<HTMLElement>('#classic-modal-layer')!);
const logout=new LogoutController({available:()=>true,mapGeneration:()=>1,sessionGeneration:()=>1,confirm:mode=>systemDialog.show({text:mode==='reselect'?'是否重新选择人物？':'确定退出并返回登录吗？',buttons:['ok','cancel']}),send:()=>true,
 onWaiting:request=>{settings.hide(false);logoutWaitingView.show('校准夹具：等待退出回应（不发送真实协议）');queueMicrotask(()=>logout.handleState({type:'logoutState',logoutId:request.logoutId,mode:request.mode,state:'waiting',sessionGeneration:2}));document.querySelector<HTMLElement>('#calibration-status-message')!.textContent='校准夹具：正在等待退出回应，不发送真实协议。';window.setTimeout(()=>{const outcome=document.querySelector<HTMLSelectElement>('#logout-preview-result')!.value;logout.handleState({type:'logoutState',logoutId:request.logoutId,mode:request.mode,state:outcome==='failed'?'failed':request.mode==='reselect'?'characters':'login',sessionGeneration:2,characters,requiresLogin:outcome==='failed',message:'校准夹具结果，不代表保存确认。'});},400);},
 onAccepted:()=>{systemDialog.interrupt();audio.setPhase('silent');},
 onResult:state=>{logoutWaitingView.hide();show(state.state==='characters'?'select':'login');document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=`校准退出结果：${state.state}（离线夹具，无保存证明）`;},status:text=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=text;}});
const settingsEntry=document.createElement('button');settingsEntry.type='button';settingsEntry.className='client-settings-entry';settingsEntry.textContent=settingsContract.entry.label;settingsEntry.dataset.layoutEvidence=settingsContract.entry.layoutEvidence;Object.assign(settingsEntry.style,{left:`${settingsContract.entry.x}px`,top:`${settingsContract.entry.y}px`,width:`${settingsContract.entry.width}px`,height:`${settingsContract.entry.height}px`});document.querySelector<HTMLElement>('#classic-hud')!.append(settingsEntry);settingsEntry.onclick=()=>show('settings');

const characterPanel=new CharacterPanel(document.querySelector<HTMLElement>('#character-panel')!,document.querySelector<HTMLElement>('#character-state')!,document.querySelector<HTMLElement>('.classic-char-name')!,()=>auth.selectedCharacterName()??characters[0]?.name);
const paperdoll=new PaperdollView(document.querySelector<HTMLElement>('#paperdoll-actor')!);
const equipment=new EquipmentView(document.querySelector<HTMLElement>('#equipment-items')!,()=>undefined);
const inventory=new InventoryView(document.querySelector<HTMLElement>('#inventory-items')!,{drop:()=>undefined,equip:()=>undefined,use:()=>undefined,availabilityChanged:()=>itemQuickBar.refreshAvailability(),readAttributes:()=>characterPanel.debugState()});
const skillBar=new SkillBar(document.querySelector<HTMLElement>('#skills')!,{select:()=>undefined,self:()=>undefined,
 chooseKey:skill=>skillKeyDialog.show(skill),closeKeyDialog:()=>skillKeyDialog.interrupt(),
 bind:(_skill,_key,bindingId)=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent='校准夹具：快捷键请求不发送真实协议';queueMicrotask(()=>skillBar.rejectKeyBinding('离线夹具未连接服务器',bindingId));return true;}
});
const itemQuickBar=new ItemQuickBar(document.querySelector<HTMLElement>('[data-hud-item-quickbar]')!,{inventory,use:id=>inventory.useItem(id),status:text=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=text;},layoutKey:()=>undefined});
const inventoryWindow=document.querySelector<HTMLElement>('#inventory-window')!;
goldDrop=new GoldDropController(document.querySelector<HTMLElement>('[data-inventory-gold-icon]')!,inventoryWindow,document.querySelector<HTMLElement>('#calibration-playfield')!,{
 amountOutput:document.querySelector<HTMLElement>('[data-inventory-gold]')!,
 available:()=>!inventoryWindow.hidden&&!skillKeyDialog.isOpen()&&!systemDialog.isOpen()&&!settings.isOpen()&&!logout.isBusy(),
 onPickup:()=>inventory.cancelSelection(),prompt:request=>systemDialog.showInput(request),
 send:amount=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=`校准夹具：丢弃 ${amount} 金币（不发送真实协议、不修改余额）`;queueMicrotask(()=>goldDrop?.rejected('离线夹具未连接服务器'));return true;},
 status:text=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=text;}
});
goldDrop.setGold(sampleAttributes.gold??0);
const shop=new ShopView(document.querySelector<HTMLElement>('#shop-panel')!,{details:()=>undefined,buy:()=>undefined,quote:()=>undefined,sell:()=>undefined});
const repair=new RepairView(document.querySelector<HTMLElement>('#repair-panel')!,{quote:()=>undefined,repair:()=>undefined});
const storage=new StorageView(document.querySelector<HTMLElement>('#storage-panel')!,{store:()=>undefined,take:()=>undefined});

const screens=['login','servers','entry-notice','password-change','select','create','hud','character','inventory','npc','shop','repair','storage','quest','attack','targets','ground','group','guild','system','settings','chat','trade'] as const;
type Screen=typeof screens[number];
const screenLabels:Record<Screen,string>={login:'登录',servers:'服务器选择（离线夹具）','entry-notice':'入图公告（离线夹具）','password-change':'修改密码',select:'选角',create:'创建角色',hud:'主 HUD',character:'角色窗',inventory:'背包窗',npc:'NPC 对话',shop:'商店',repair:'修理',storage:'仓库',quest:'任务日志',attack:'攻击模式',targets:'附近目标',ground:'地面物品',group:'队伍',guild:'行会',system:'系统弹窗',settings:'Web 设置',chat:'聊天',trade:'交易'};
let screen:Screen='login';
let entryNoticePreviewIdentity=0;
const characters:SelectCharacter[]=[{name:'WebCheck',job:0,level:7,sex:0},{name:'Tao905',job:2,level:7,sex:1}];
const calibrationWindowIds=['character-window','inventory-window','npc-dialog','shop-panel','repair-panel','storage-panel','calibration-quest-panel','calibration-attack-panel','calibration-targets-panel','calibration-ground-panel','calibration-group-panel','calibration-guild-panel','calibration-chat-panel','calibration-trade-panel'];

let nationalReady=false;
let missingNational:string[]=[];
function calibrationStatus(scene:Screen){
 const missing=missingNational.length?` · 缺少 ${missingNational.join('、')}`:'';
 return nationalReady?`国服原始素材已加载${missing} · 当前场景：${screenLabels[scene]}`:`国服界面素材未就绪${missing} · 当前场景：${screenLabels[scene]}`;
}

function updateNationalMode(){
 // The calibration surface renders the same production component tree as
 // play.html. The raw atlas viewer is kept available through the separate
 // resource page; overlaying a second static scene would hide real hit areas.
 content.classList.remove('national-mode');
 nationalPreview.hidden=true;
}

function hideContent(){
 skillBar.cancelKeyBinding();goldDrop?.interrupt();
 logout.interrupt();logoutWaitingView.hide();settings.hide(false);systemDialog.interrupt();auth.hide();
 document.querySelector<HTMLElement>('#classic-hud')!.hidden=true;
  for(const id of ['character-window','inventory-window','npc-dialog','shop-panel','repair-panel','storage-panel','calibration-quest-panel','calibration-attack-panel','calibration-targets-panel','calibration-ground-panel','calibration-group-panel','calibration-guild-panel','calibration-chat-panel','calibration-trade-panel'])document.querySelector<HTMLElement>(`#${id}`)!.hidden=true;
  shop.clear();repair.clear();storage.clear();
}

function setCharacterPage(page:CharacterPage){
 const window=document.querySelector<HTMLElement>('#character-window')!;
 showCharacterPage(window,page);
}

function showHudWorkspace(){
 document.querySelector<HTMLElement>('#auth-overlay')!.hidden=true;
 document.querySelector<HTMLElement>('#classic-hud')!.hidden=false;
 for(const id of ['npc-dialog','shop-panel','repair-panel','storage-panel','calibration-quest-panel','calibration-attack-panel','calibration-targets-panel','calibration-ground-panel','calibration-group-panel','calibration-guild-panel','calibration-chat-panel','calibration-trade-panel'])document.querySelector<HTMLElement>(`#${id}`)!.hidden=true;
}

function calibrationWindowEntries(){
 return calibrationWindowIds.map(id=>({element:document.querySelector<HTMLElement>(`#${id}`)!,close:()=>{
  if(id==='inventory-window'){inventory.cancelSelection();goldDrop?.interrupt();}
  if(id==='character-window'){equipment.rejectPending();skillBar.cancelKeyBinding();}
  if(id==='shop-panel')shop.clear();
  if(id==='repair-panel')repair.clear();
  if(id==='storage-panel')storage.clear();
  if(id==='calibration-trade-panel')document.querySelector<HTMLElement>('#calibration-trade-panel')!.dataset.tradeOpen='false';
  document.querySelector<HTMLElement>(`#${id}`)!.hidden=true;
 }}));
}

function closeCalibrationTopWindow(){return closeTopClassicWindow(calibrationWindowEntries(),classicWindowClosesOnEscape);}
function closeCalibrationWindow(element:HTMLElement){return closeClassicWindowEntry(calibrationWindowEntries(),element);}

function displayCalibrationWindow(element:HTMLElement,kind:string){
 element.hidden=false;hud.skinWindow(element,kind);bringClassicWindowToFront(element);
}

function show(screenName:Screen){
 ++deletePreviewEpoch;characterDeletePreview.interrupt();systemDialog.interrupt();screen=screenName;hideContent();
 if(['hud','character','inventory','npc','shop','repair','storage','quest','attack','targets','ground','group','guild','system','chat','trade'].includes(screenName))showHudWorkspace();
 if(screenName==='settings'){showHudWorkspace();settings.show();}
 else if(screenName==='login'||screenName==='servers'||screenName==='entry-notice'||screenName==='password-change'||screenName==='select'||screenName==='create'){
  const root=document.querySelector<HTMLElement>('#auth-overlay')!;root.hidden=false;
  if(screenName==='login')auth.showLogin();
  else if(screenName==='servers')void auth.showServerSelection([{name:'热血传奇',status:'idle',routable:true}],{choose:()=>show('select'),exit:()=>show('login')}).catch(error=>{if(screen==='servers'){auth.showLogin();document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=String(error);}});
  else if(screenName==='entry-notice')void auth.showEntryNotice(++entryNoticePreviewIdentity,['欢迎进入热血传奇本地测试服','当前环境用于功能验证，角色和世界数据可能随测试重置。'],()=>show('hud')).catch(error=>{if(screen==='entry-notice'){auth.showLogin();document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=String(error);}});
  else if(screenName==='password-change')auth.showPasswordChange();
  else if(screenName==='select'){auth.setDeleteEnabled(true);auth.showSelect(characters,{start:()=>show('entry-notice'),create:()=>show('create'),exit:()=>show('login')},'热血传奇');}
  else auth.showCreate();
 }else if(screenName==='hud')document.querySelector<HTMLElement>('#classic-hud')!.hidden=false;
 else if(screenName==='character'){
  const window=document.querySelector<HTMLElement>('#character-window')!;displayCalibrationWindow(window,'character');
  setCharacterPage('paperdoll');
 }else if(screenName==='inventory'){
  const window=document.querySelector<HTMLElement>('#inventory-window')!;displayCalibrationWindow(window,'inventory');
 }else if(screenName==='npc'){
  const window=document.querySelector<HTMLElement>('#npc-dialog')!;displayCalibrationWindow(window,'npc');
 }else if(screenName==='shop'){
  const window=document.querySelector<HTMLElement>('#shop-panel')!;shop.open(1,[{name:'小量金创药',subMenu:0,price:100,stock:12,looks:2},{name:'随机传送卷',subMenu:0,price:500,stock:4,looks:3},{name:'银蛇',subMenu:1,price:1200,stock:2,looks:15},{name:'半月弯刀',subMenu:1,price:5000,stock:1,looks:30}]);displayCalibrationWindow(window,'shop');
 }else if(screenName==='repair'){
  const window=document.querySelector<HTMLElement>('#repair-panel')!;repair.open(1,[sampleItems[0],sampleItems[1]]);displayCalibrationWindow(window,'repair');
 }else if(screenName==='storage'){
  const window=document.querySelector<HTMLElement>('#storage-panel')!;storage.openItems(1,[sampleItems[2],sampleItems[3]]);displayCalibrationWindow(window,'storage');
 }else if(screenName==='quest'){
  const window=document.querySelector<HTMLElement>('#calibration-quest-panel')!;displayCalibrationWindow(window,'quest');
 }else if(screenName==='attack'){
  const window=document.querySelector<HTMLElement>('#calibration-attack-panel')!;displayCalibrationWindow(window,'attack');
 }else if(screenName==='targets'){
  const window=document.querySelector<HTMLElement>('#calibration-targets-panel')!;displayCalibrationWindow(window,'targets');
 }else if(screenName==='ground'){
  const window=document.querySelector<HTMLElement>('#calibration-ground-panel')!;displayCalibrationWindow(window,'ground');
 }else if(screenName==='group'){
  const window=document.querySelector<HTMLElement>('#calibration-group-panel')!;displayCalibrationWindow(window,'group');
 }else if(screenName==='guild'){
  const window=document.querySelector<HTMLElement>('#calibration-guild-panel')!;displayCalibrationWindow(window,'guild');
 }else if(screenName==='system'){
  previewSystemDialog();
 }else if(screenName==='chat'){
  const window=document.querySelector<HTMLElement>('#calibration-chat-panel')!;displayCalibrationWindow(window,'chat');
 }else if(screenName==='trade'){
  const window=document.querySelector<HTMLElement>('#calibration-trade-panel')!;document.querySelector<HTMLElement>('#calibration-trade-panel')!.dataset.tradeOpen='true';displayCalibrationWindow(window,'trade');
 }
 document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button=>button.classList.toggle('active',button.dataset.scene===screen));
 document.querySelector<HTMLElement>('#calibration-status-message')!.setAttribute('data-scene',screen);
 document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=calibrationStatus(screen);
 updateNationalMode();
}

function previewSystemDialog(){
 const size=document.querySelector<HTMLSelectElement>('#system-dialog-size')!.value as SystemDialogSize;
 const buttons=document.querySelector<HTMLSelectElement>('#system-dialog-buttons')!.value.split(',') as SystemDialogButton[];
 void systemDialog.show({text:'系统提示：请选择操作。',size,buttons}).then(result=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=`系统弹窗结果：${result}`;});
}

function wireControls(){
 const initialCharacters=characters.map(role=>({...role}));
 auth.bindDelete(name=>{if(systemDialog.isOpen())return;const epoch=deletePreviewEpoch;void characterDeletePreview.request(name,()=>epoch===deletePreviewEpoch&&screen==='select'&&auth.selectedCharacterName()===name);});
 document.querySelector<HTMLButtonElement>('#delete-preview-reset')!.onclick=()=>{characters.splice(0,characters.length,...initialCharacters.map(role=>({...role})));show('select');};
 const hudPreview=document.querySelector<HTMLElement>('[data-hud-preview]');
 if(hudPreview){
  const nativeSample=document.createElement('button');nativeSample.type='button';nativeSample.textContent='原端 HUD 29级样本';nativeSample.dataset.nativeHudSample='';
  nativeSample.onclick=()=>{hud.replaceAttributes({...sampleAttributes,level:29});hud.beginMap('0');hud.mapDescription('比奇省');hud.position('0',338,264);show('hud');};hudPreview.append(nativeSample);
 }
 const selectionSample=document.createElement('button');selectionSample.type='button';selectionSample.textContent='原端选角文字样本';selectionSample.dataset.nativeSelectionSample='';
 const inventorySample=document.createElement('button');inventorySample.type='button';inventorySample.textContent='原端背包蓝药说明样本';inventorySample.dataset.nativeInventorySample='';
 inventorySample.onclick=()=>{inventory.replace([{name:'魔法药(中量)',makeIndex:17680,durability:1,maxDurability:1,stdMode:0,weight:2,looks:396,mac:{min:80,max:0}}]);inventory.currency(17863);show('inventory');};document.querySelector<HTMLButtonElement>('[data-scene="inventory"]')!.parentElement!.append(inventorySample);
 const iconSample=document.createElement('button');iconSample.type='button';iconSample.textContent='原端背包图标定位样本';iconSample.title='只核对原帧和绘制坐标；名称、类型和属性为离线夹具，不代表实际物品。';
 iconSample.onclick=()=>{const bagFrames=[400,400,396,404,404,404,404,16,148,37,0,0,0,191,0,0,0,0,0,0,211,0,0,0,0,0,0,0,0,0,0,145];const pocketFrames=Array.from({length:6},()=>400);inventory.replace([...pocketFrames,...bagFrames].map((looks,index)=>({name:`图标 #${looks}`,makeIndex:176100+index,durability:0,maxDurability:0,stdMode:index<6?0:5,weight:0,looks})));inventory.currency(17863);show('inventory');};inventorySample.parentElement!.append(iconSample);
 selectionSample.onclick=()=>{++deletePreviewEpoch;characterDeletePreview.interrupt();characters.splice(0,characters.length,{name:'Mir35448bf1',job:0,level:29,sex:0,selected:true},{name:'Tao905',job:2,level:7,sex:1});show('select');};document.querySelector<HTMLButtonElement>('#delete-preview-reset')!.parentElement!.append(selectionSample);
 if(hudPreview)disposeHudPreview=bindHudPreviewControls(hudPreview,sampleAttributes,hud,(attributes,interactive)=>{characterPanel.replace(attributes);if(interactive)show('hud');});
 auth.bindPasswordActions({open:()=>{screen='password-change';},cancel:()=>show('login')});
 document.querySelector<HTMLButtonElement>('#system-dialog-preview')!.onclick=previewSystemDialog;
 document.querySelector<HTMLButtonElement>('#logout-preview-reselect')!.onclick=()=>void logout.request('reselect');document.querySelector<HTMLButtonElement>('#logout-preview-login')!.onclick=()=>void logout.request('login');
 document.querySelector<HTMLFormElement>('#change-password')!.addEventListener('submit',event=>{
  event.preventDefault();const fields={} as PasswordChangeFields;
  for(const field of ['account','oldPassword','newPassword','repeatPassword'] as const)fields[field]=document.querySelector<HTMLInputElement>(`[data-password-field="${field}"]`)!.value;
  const invalid=validatePasswordChange(fields);void systemDialog.show({text:invalid?.message??'校准页未连接服务器，请在联机页修改密码。',buttons:['ok']});
 });
 document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button=>button.onclick=()=>show(button.dataset.scene as Screen));
 document.querySelectorAll<HTMLButtonElement>('[data-window-close]').forEach(button=>button.onclick=()=>{
  const target=button.closest<HTMLElement>('.classic-window');if(target)closeCalibrationWindow(target);
 });
 document.querySelectorAll<HTMLButtonElement>('[data-window-open]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.hudAction==='sound'){audio.toggleEnabled();return;}
  const target=button.dataset.windowOpen;
 if(target==='character'||target==='inventory'||target==='skills'){
  showHudWorkspace();
  if(target==='character'||target==='skills'){
   const window=document.querySelector<HTMLElement>('#character-window')!;displayCalibrationWindow(window,'character');
   setCharacterPage(target==='skills'?'skills':'paperdoll');
  }else{
   const window=document.querySelector<HTMLElement>('#inventory-window')!;displayCalibrationWindow(window,'inventory');
  }
  screen='hud';
  document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(value=>value.classList.toggle('active',value.dataset.scene==='hud'));
  document.querySelector<HTMLElement>('#calibration-status-message')!.setAttribute('data-scene','hud');
  document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=calibrationStatus('hud');
  updateNationalMode();
  return;
 }
 if(target==='quest')show('quest');
  else if(target==='attack')show('attack');
  else if(target==='targets')show('targets');
  else if(target==='ground')show('ground');
  else if(target==='group'||target==='guild'||target==='trade')show(target);
 }));
 document.querySelectorAll<HTMLButtonElement>('[data-native-toolbar][data-hud-action]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.hudAction==='reselect')void logout.request('reselect');
  else if(button.dataset.hudAction==='exit')void logout.request('login');
  else if(button.dataset.hudAction==='minimap'){
   const panel=document.querySelector<HTMLElement>('[data-hud-minimap-frame]');
   if(panel)panel.dataset.mapMode=panel.dataset.mapMode==='hidden'?'compact':'hidden';
  }
 }));
 wireCharacterPageButtons(document.querySelector<HTMLElement>('#character-window')!,setCharacterPage);
 document.querySelector<HTMLFormElement>('#login')!.addEventListener('submit',event=>{event.preventDefault();show('servers');});
 document.querySelector<HTMLButtonElement>('#register')!.addEventListener('click',()=>show('create'));
 document.querySelector<HTMLFormElement>('#create-character')!.addEventListener('submit',event=>{event.preventDefault();show('select');});
 document.querySelectorAll<HTMLButtonElement>('#npc-options button').forEach(button=>button.addEventListener('click',()=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=`校准动作：${button.textContent??''}`;}));
 const attackMode=document.querySelector<HTMLSelectElement>('#calibration-attack-mode')!,attackStatus=document.querySelector<HTMLElement>('#calibration-attack-status')!;
 attackMode.addEventListener('change',()=>{attackStatus.textContent=`当前模式：${attackMode.selectedOptions[0]?.textContent??''}`;});
 window.addEventListener('keydown',event=>{if(skillKeyDialog.interceptKey(event))return;if(systemDialog.interceptKey(event)||settings.interceptKey(event))return;if(logoutWaitingView.interceptKey(event))return;routeClassicKey(event,{inWorld:()=>!document.querySelector<HTMLElement>('#classic-hud')!.hidden,worldBlocked:()=>false,cancel:()=>{inventory.cancelSelection();skillBar.cancelSelection();skillBar.cancelKeyBinding();},cancelTransient:()=>inventory.cancelSelection()||skillBar.cancelSelection()||skillBar.cancelKeyBinding(),closeTop:closeCalibrationTopWindow,itemKey:()=>false,chat:()=>undefined,minimap:()=>undefined,attackMode:()=>undefined,window:()=>undefined,skill:()=>undefined,movement:()=>undefined,sound:()=>audio.toggleEnabled(),logout:mode=>void logout.request(mode)});if(event.isComposing||event.target instanceof HTMLElement&&event.target.matches('input,select,textarea'))return;if(event.ctrlKey&&event.key.toLowerCase()==='h'){event.preventDefault();attackMode.selectedIndex=(attackMode.selectedIndex+1)%attackMode.options.length;attackMode.dispatchEvent(new Event('change'));}});
 document.querySelectorAll<HTMLButtonElement>('#calibration-targets-list button').forEach(button=>button.addEventListener('click',()=>{document.querySelector<HTMLElement>('#calibration-targets-status')!.textContent=`已选择目标：${button.textContent??''}`;}));
 document.querySelectorAll<HTMLButtonElement>('#calibration-ground-list button').forEach(button=>button.addEventListener('click',()=>{document.querySelector<HTMLElement>('#calibration-ground-status')!.textContent=`拾取请求：${button.textContent??''}`;}));
 const groupFeedback=document.querySelector<HTMLElement>('#group-feedback')!,groupMode=document.querySelector<HTMLButtonElement>('#group-mode')!;
 const groupPrompts:Record<string,string>={'新建队伍':'请输入邀请加入小组的玩家名.','邀请加入':'键入您想要参加小组的名字 .','移除成员':'键入您想要从小组被删除的名字.'};
 document.querySelectorAll<HTMLButtonElement>('#calibration-group-panel [data-group-action]').forEach(button=>button.addEventListener('click',()=>{
  const action=button.dataset.groupAction??'';
  if(action==='允许组队'){
   const enabled=groupMode.dataset.enabled!=='true';groupMode.dataset.enabled=String(enabled);groupMode.setAttribute('aria-pressed',String(enabled));groupMode.textContent=`允许组队：${enabled?'开':'关'}`;
   groupFeedback.textContent=`校准夹具：${enabled?'已允许':'已关闭'}组队邀请（不发送真实协议）`;groupFeedback.hidden=false;return;
  }
  const text=groupPrompts[action];if(!text||button.disabled)return;
  void systemDialog.showInput({text,buttons:['ok','cancel'],size:'horizontal',input:{label:'角色名',maxLength:10,inputMode:'text'}}).then(answer=>{
   if(answer.result!=='ok')return;const name=answer.value.trim();groupFeedback.textContent=name?`校准夹具：${action} ${name}（不发送真实请求）`:'请填写角色名';groupFeedback.hidden=false;
  });
 }));
 const guildStatus=document.querySelector<HTMLElement>('#calibration-guild-status')!;
 document.querySelectorAll<HTMLButtonElement>('#calibration-guild-panel [data-guild-action]').forEach(button=>button.addEventListener('click',()=>{guildStatus.textContent=`行会动作：${button.dataset.guildAction??button.textContent??''}`;}));
 const guildMemberList=document.querySelector<HTMLOListElement>('#guild-members')!,guildScroll=classicUiLayout().nationalUtilityWindows.guild.scrollButtons;
 document.querySelector<HTMLButtonElement>('#guild-scroll-up')!.addEventListener('click',()=>scrollGuildMemberList(guildMemberList,-1,guildScroll.stepRows,guildScroll.lineHeight));
 document.querySelector<HTMLButtonElement>('#guild-scroll-down')!.addEventListener('click',()=>scrollGuildMemberList(guildMemberList,1,guildScroll.stepRows,guildScroll.lineHeight));
 const chatChannel=document.querySelector<HTMLSelectElement>('#calibration-chat-channel')!,chatTargetWrap=document.querySelector<HTMLElement>('#calibration-chat-target-wrap')!,chatTarget=document.querySelector<HTMLInputElement>('#calibration-chat-target')!,chatInput=document.querySelector<HTMLInputElement>('#calibration-chat-input')!,chatLog=document.querySelector<HTMLOListElement>('#calibration-chat-log')!;
 chatChannel.addEventListener('change',()=>{const whisper=chatChannel.value==='whisper';chatTargetWrap.hidden=!whisper;chatTarget.required=whisper;if(whisper)chatTarget.focus();});
 document.querySelector<HTMLFormElement>('#calibration-chat-form')!.addEventListener('submit',event=>{event.preventDefault();const text=chatInput.value.trim();if(!text||(chatChannel.value==='whisper'&&!chatTarget.value.trim()))return;const line=document.createElement('li');line.dataset.channel=chatChannel.value;line.textContent=`WebCheck：${text}`;chatLog.append(line);chatInput.value='';});
 document.querySelectorAll<HTMLButtonElement>('#calibration-trade-panel .trade-controls button,#calibration-trade-panel .trade-columns button').forEach(button=>button.addEventListener('click',()=>{const status=document.querySelector<HTMLElement>('#calibration-trade-status')!;status.textContent=button.id.endsWith('cancel')?'交易已取消':button.id.endsWith('accept')?'已确认交易，等待对方确认':button.textContent==='取回'?'已取回物品':`已设置金币 ${document.querySelector<HTMLInputElement>('#calibration-trade-gold')!.value}`;}));
 const grid=document.querySelector<HTMLInputElement>('#show-grid')!;grid.onchange=()=>frame.classList.toggle('show-grid',grid.checked);
 const ruler=document.querySelector<HTMLInputElement>('#show-ruler')!;ruler.onchange=()=>frame.classList.toggle('show-ruler',ruler.checked);
 const opacity=document.querySelector<HTMLInputElement>('#reference-opacity')!;opacity.oninput=()=>document.querySelector<HTMLElement>('#calibration-reference')!.style.opacity=opacity.value;
 const file=document.querySelector<HTMLInputElement>('#reference-file')!;file.onchange=()=>{const selected=file.files?.[0];if(!selected)return;const reader=new FileReader();reader.onload=()=>{const image=document.querySelector<HTMLImageElement>('#reference-image')!;image.src=String(reader.result);document.querySelector<HTMLElement>('#calibration-reference')!.hidden=false;};reader.readAsDataURL(selected);};
 document.querySelector<HTMLButtonElement>('#clear-reference')!.onclick=()=>{const image=document.querySelector<HTMLImageElement>('#reference-image')!;image.removeAttribute('src');document.querySelector<HTMLElement>('#calibration-reference')!.hidden=true;file.value='';};
 frame.onpointermove=event=>{const rect=frame.getBoundingClientRect(),scale=rect.width/800,x=Math.max(0,Math.min(799,Math.floor((event.clientX-rect.left)/scale))),y=Math.max(0,Math.min(599,Math.floor((event.clientY-rect.top)/scale)));document.querySelector<HTMLElement>('#calibration-pointer')!.textContent=`${x}, ${y}`;};
}

async function boot(){
 await Promise.all([hud.ready(),auth.ready()]);
 hud.replaceAttributes(sampleAttributes);hud.position('0',289,616);hud.replaceSkills([sampleSkill]);skillBar.replace([sampleSkill]);
 characterPanel.replace(sampleAttributes);equipment.replace([{slot:1,item:sampleItems[0]},{slot:0,item:sampleItems[1]}]);inventory.replace(sampleItems);paperdoll.setFeature(0);
 itemQuickBar.replace(sampleItems);
 wireControls();
 const session=await loadClassicUiSession();
 missingNational=session.missingNational;
 nationalReady=Boolean(session.national.get('chrsel')&&session.national.get('prguse'));
 show('login');
 document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=calibrationStatus('login');
}

void boot().catch(error=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=`界面素材加载失败：${error instanceof Error?error.message:String(error)}`;});

 window.addEventListener('pagehide',()=>{++deletePreviewEpoch;characterDeletePreview.destroy();disposeHudPreview();goldDrop?.destroy();logout.interrupt();settings.destroy();logoutWaitingView.destroy();systemDialog.destroy();auth.clearPasswordChange();audio.dispose();});
