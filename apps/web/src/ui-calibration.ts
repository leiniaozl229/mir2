import './style.css';
import './ui-calibration.css';
import {loadClassicUiSession} from './classic-ui';
import {ClassicAuth,type SelectCharacter} from './classic-auth';
import {ClassicHud} from './classic-hud';
import {CharacterPanel,type CharacterAttributes} from './character-panel';
import {EquipmentView,InventoryView,type InventoryItem} from './inventory';
import {ItemQuickBar} from './item-quickbar';
import {PaperdollView} from './paperdoll';
import {ClassicStage} from './classic-stage';
import {ShopView} from './shop';
import {RepairView} from './repair';
import {StorageView} from './storage';
import {SkillBar,type MagicSkill} from './skills';
import {makeClassicWindowDraggable} from './window-drag';

const frame=document.querySelector<HTMLElement>('#calibration-stage-frame')!;
const content=document.querySelector<HTMLElement>('#calibration-content')!;
const nationalPreview=document.querySelector<HTMLElement>('#national-preview')!;
new ClassicStage(frame,content);
for(const id of ['character-window','inventory-window','npc-dialog','shop-panel','repair-panel','storage-panel','calibration-quest-panel','calibration-attack-panel','calibration-targets-panel','calibration-ground-panel','calibration-group-panel','calibration-guild-panel','calibration-system-panel','calibration-chat-panel','calibration-trade-panel']){
 const panel=document.querySelector<HTMLElement>(`#${id}`);
 if(panel)makeClassicWindowDraggable(panel,content);
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
const sampleSkill:MagicSkill={key:1,level:3,currentTrain:82,magicId:1,name:'基本剑术',effectType:0,effect:0,spell:0,power:0,trainLevels:[0,20,50,100],maxTrain:[0,100,100,100],job:0,delay:0,defSpell:0,defPower:0,maxPower:0,defMaxPower:0,description:'基础剑术'};

const hud=new ClassicHud(document.querySelector<HTMLElement>('#classic-hud')!,()=>false);
const auth=new ClassicAuth(document.querySelector<HTMLElement>('#auth-overlay')!);
const characterPanel=new CharacterPanel(document.querySelector<HTMLElement>('#character-panel')!,document.querySelector<HTMLElement>('#character-state')!);
const paperdoll=new PaperdollView(document.querySelector<HTMLElement>('#paperdoll-actor')!);
const equipment=new EquipmentView(document.querySelector<HTMLElement>('#equipment-items')!,()=>undefined);
const inventory=new InventoryView(document.querySelector<HTMLElement>('#inventory-items')!,{drop:()=>undefined,equip:()=>undefined,use:()=>undefined});
const skillBar=new SkillBar(document.querySelector<HTMLElement>('#skills')!,{select:()=>undefined,self:()=>undefined});
const itemQuickBar=new ItemQuickBar(document.querySelector<HTMLElement>('[data-hud-item-quickbar]')!,{use:()=>undefined,status:text=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=text;},layoutKey:()=>undefined});
const shop=new ShopView(document.querySelector<HTMLElement>('#shop-panel')!,{details:()=>undefined,buy:()=>undefined,quote:()=>undefined,sell:()=>undefined});
const repair=new RepairView(document.querySelector<HTMLElement>('#repair-panel')!,{quote:()=>undefined,repair:()=>undefined});
const storage=new StorageView(document.querySelector<HTMLElement>('#storage-panel')!,{store:()=>undefined,take:()=>undefined});

const screens=['login','select','create','hud','character','inventory','npc','shop','repair','storage','quest','attack','targets','ground','group','guild','system','chat','trade'] as const;
type Screen=typeof screens[number];
const screenLabels:Record<Screen,string>={login:'登录',select:'选角',create:'创建角色',hud:'主 HUD',character:'角色窗',inventory:'背包窗',npc:'NPC 对话',shop:'商店',repair:'修理',storage:'仓库',quest:'任务日志',attack:'攻击模式',targets:'附近目标',ground:'地面物品',group:'队伍',guild:'行会',system:'系统弹窗',chat:'聊天',trade:'交易'};
let screen:Screen='login';
const characters:SelectCharacter[]=[{name:'WebCheck',job:0,level:7,sex:0},{name:'Tao905',job:2,level:7,sex:1}];

let nationalReady=false;
let missingNational:string[]=[];
function calibrationStatus(scene:Screen){
 const missing=missingNational.length?` · 缺少 ${missingNational.join('、')}`:'';
 return nationalReady?`国服原始素材已加载${missing} · 当前场景：${screenLabels[scene]}`:`Crystal 候选界面帧已加载 · 国服原始 Data 未找到 · 当前场景：${screenLabels[scene]}`;
}

function updateNationalMode(){
 // The calibration surface renders the same production component tree as
 // play.html. The raw atlas viewer is kept available through the separate
 // resource page; overlaying a second static scene would hide real hit areas.
 content.classList.remove('national-mode');
 nationalPreview.hidden=true;
}

function hideContent(){
 document.querySelector<HTMLElement>('#auth-overlay')!.hidden=true;
 document.querySelector<HTMLElement>('#classic-hud')!.hidden=true;
  for(const id of ['character-window','inventory-window','npc-dialog','shop-panel','repair-panel','storage-panel','calibration-quest-panel','calibration-attack-panel','calibration-targets-panel','calibration-ground-panel','calibration-group-panel','calibration-guild-panel','calibration-system-panel','calibration-chat-panel','calibration-trade-panel'])document.querySelector<HTMLElement>(`#${id}`)!.hidden=true;
  shop.clear();repair.clear();storage.clear();
}

function setCharacterPage(page:'paperdoll'|'status'|'state'|'skills'){
 const window=document.querySelector<HTMLElement>('#character-window')!;
 window.querySelectorAll<HTMLElement>('[data-character-page]').forEach(value=>{value.hidden=value.dataset.characterPage!==page;});
 window.querySelectorAll<HTMLButtonElement>('[data-character-tab]').forEach(value=>{value.classList.toggle('active',value.dataset.characterTab===page);});
}

function showHudWorkspace(){
 document.querySelector<HTMLElement>('#auth-overlay')!.hidden=true;
 document.querySelector<HTMLElement>('#classic-hud')!.hidden=false;
 for(const id of ['npc-dialog','shop-panel','repair-panel','storage-panel','calibration-quest-panel','calibration-attack-panel','calibration-targets-panel','calibration-ground-panel','calibration-group-panel','calibration-guild-panel','calibration-system-panel','calibration-chat-panel','calibration-trade-panel'])document.querySelector<HTMLElement>(`#${id}`)!.hidden=true;
}

function show(screenName:Screen){
 screen=screenName;hideContent();
 if(screenName==='login'||screenName==='select'||screenName==='create'){
  const root=document.querySelector<HTMLElement>('#auth-overlay')!;root.hidden=false;
  if(screenName==='login')auth.showLogin();
  else if(screenName==='select')auth.showSelect(characters,{start:()=>show('hud'),create:()=>show('create'),exit:()=>show('login')});
  else auth.showCreate();
 }else if(screenName==='hud')document.querySelector<HTMLElement>('#classic-hud')!.hidden=false;
 else if(screenName==='character'){
  const window=document.querySelector<HTMLElement>('#character-window')!;window.hidden=false;hud.skinWindow(window,'character');
  setCharacterPage('paperdoll');
 }else if(screenName==='inventory'){
  const window=document.querySelector<HTMLElement>('#inventory-window')!;window.hidden=false;hud.skinWindow(window,'inventory');
 }else if(screenName==='npc'){
  const window=document.querySelector<HTMLElement>('#npc-dialog')!;window.hidden=false;hud.skinWindow(window,'npc');
 }else if(screenName==='shop'){
  const window=document.querySelector<HTMLElement>('#shop-panel')!;shop.open(1,[{name:'小量金创药',subMenu:0,price:100,stock:12,looks:2},{name:'随机传送卷',subMenu:0,price:500,stock:4,looks:3},{name:'银蛇',subMenu:1,price:1200,stock:2,looks:15},{name:'半月弯刀',subMenu:1,price:5000,stock:1,looks:30}]);window.hidden=false;hud.skinWindow(window,'shop');
 }else if(screenName==='repair'){
  const window=document.querySelector<HTMLElement>('#repair-panel')!;repair.open(1,[sampleItems[0],sampleItems[1]]);window.hidden=false;hud.skinWindow(window,'repair');
 }else if(screenName==='storage'){
  const window=document.querySelector<HTMLElement>('#storage-panel')!;storage.openItems(1,[sampleItems[2],sampleItems[3]]);window.hidden=false;hud.skinWindow(window,'storage');
 }else if(screenName==='quest'){
  const window=document.querySelector<HTMLElement>('#calibration-quest-panel')!;window.hidden=false;hud.skinWindow(window,'quest');
 }else if(screenName==='attack'){
  const window=document.querySelector<HTMLElement>('#calibration-attack-panel')!;window.hidden=false;hud.skinWindow(window,'attack');
 }else if(screenName==='targets'){
  const window=document.querySelector<HTMLElement>('#calibration-targets-panel')!;window.hidden=false;hud.skinWindow(window,'targets');
 }else if(screenName==='ground'){
  const window=document.querySelector<HTMLElement>('#calibration-ground-panel')!;window.hidden=false;hud.skinWindow(window,'ground');
 }else if(screenName==='group'){
  const window=document.querySelector<HTMLElement>('#calibration-group-panel')!;window.hidden=false;hud.skinWindow(window,'group');
 }else if(screenName==='guild'){
  const window=document.querySelector<HTMLElement>('#calibration-guild-panel')!;window.hidden=false;hud.skinWindow(window,'guild');
 }else if(screenName==='system'){
  const window=document.querySelector<HTMLElement>('#calibration-system-panel')!;window.hidden=false;hud.skinWindow(window,'system');
 }else if(screenName==='chat'){
  const window=document.querySelector<HTMLElement>('#calibration-chat-panel')!;window.hidden=false;hud.skinWindow(window,'chat');
 }else if(screenName==='trade'){
  const window=document.querySelector<HTMLElement>('#calibration-trade-panel')!;window.hidden=false;hud.skinWindow(window,'trade');
 }
 document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button=>button.classList.toggle('active',button.dataset.scene===screen));
 document.querySelector<HTMLElement>('#calibration-status-message')!.setAttribute('data-scene',screen);
 document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=calibrationStatus(screen);
 updateNationalMode();
}

function wireControls(){
 document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button=>button.onclick=()=>show(button.dataset.scene as Screen));
 document.querySelectorAll<HTMLButtonElement>('[data-window-close]').forEach(button=>button.onclick=()=>show('hud'));
 document.querySelectorAll<HTMLButtonElement>('[data-window-open]').forEach(button=>button.addEventListener('click',()=>{
  const target=button.dataset.windowOpen;
 if(target==='character'||target==='inventory'||target==='skills'){
  showHudWorkspace();
  if(target==='character'||target==='skills'){
   const window=document.querySelector<HTMLElement>('#character-window')!;window.hidden=false;hud.skinWindow(window,'character');
   setCharacterPage(target==='skills'?'skills':'paperdoll');
  }else{
   const window=document.querySelector<HTMLElement>('#inventory-window')!;window.hidden=false;hud.skinWindow(window,'inventory');
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
 }));
 document.querySelectorAll<HTMLButtonElement>('[data-character-tab]').forEach(button=>button.addEventListener('click',()=>setCharacterPage((button.dataset.characterTab??'paperdoll') as 'paperdoll'|'status'|'state'|'skills')));
 document.querySelector<HTMLFormElement>('#login')!.addEventListener('submit',event=>{event.preventDefault();show('select');});
 document.querySelector<HTMLButtonElement>('#register')!.addEventListener('click',()=>show('create'));
 document.querySelector<HTMLFormElement>('#create-character')!.addEventListener('submit',event=>{event.preventDefault();show('select');});
 document.querySelectorAll<HTMLButtonElement>('#npc-options button').forEach(button=>button.addEventListener('click',()=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=`校准动作：${button.textContent??''}`;}));
 const attackMode=document.querySelector<HTMLSelectElement>('#calibration-attack-mode')!,attackStatus=document.querySelector<HTMLElement>('#calibration-attack-status')!;
 attackMode.addEventListener('change',()=>{attackStatus.textContent=`当前模式：${attackMode.selectedOptions[0]?.textContent??''}`;});
 window.addEventListener('keydown',event=>{if(event.isComposing||event.target instanceof HTMLElement&&event.target.matches('input,select,textarea'))return;if(event.ctrlKey&&event.key.toLowerCase()==='h'){event.preventDefault();attackMode.selectedIndex=(attackMode.selectedIndex+1)%attackMode.options.length;attackMode.dispatchEvent(new Event('change'));}});
 document.querySelectorAll<HTMLButtonElement>('#calibration-targets-list button').forEach(button=>button.addEventListener('click',()=>{document.querySelector<HTMLElement>('#calibration-targets-status')!.textContent=`已选择目标：${button.textContent??''}`;}));
 document.querySelectorAll<HTMLButtonElement>('#calibration-ground-list button').forEach(button=>button.addEventListener('click',()=>{document.querySelector<HTMLElement>('#calibration-ground-status')!.textContent=`拾取请求：${button.textContent??''}`;}));
 const groupStatus=document.querySelector<HTMLElement>('#calibration-group-status')!;
 document.querySelectorAll<HTMLButtonElement>('#calibration-group-panel [data-group-action]').forEach(button=>button.addEventListener('click',()=>{groupStatus.textContent=`队伍动作：${button.dataset.groupAction??button.textContent??''}`;}));
 const guildStatus=document.querySelector<HTMLElement>('#calibration-guild-status')!;
 document.querySelectorAll<HTMLButtonElement>('#calibration-guild-panel [data-guild-action]').forEach(button=>button.addEventListener('click',()=>{guildStatus.textContent=`行会动作：${button.dataset.guildAction??button.textContent??''}`;}));
 const systemStatus=document.querySelector<HTMLElement>('#calibration-system-status')!;
 document.querySelectorAll<HTMLButtonElement>('#calibration-system-panel [data-system-action]').forEach(button=>button.addEventListener('click',()=>{systemStatus.textContent=`系统动作：${button.dataset.systemAction??button.textContent??''}`;}));
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
