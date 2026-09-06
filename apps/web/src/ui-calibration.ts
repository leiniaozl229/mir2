import './style.css';
import './ui-calibration.css';
import {ClassicAuth,type SelectCharacter} from './classic-auth';
import {ClassicHud} from './classic-hud';
import {CharacterPanel,type CharacterAttributes} from './character-panel';
import {EquipmentView,InventoryView,type InventoryItem} from './inventory';
import {PaperdollView} from './paperdoll';
import {ClassicStage} from './classic-stage';

const frame=document.querySelector<HTMLElement>('#calibration-stage-frame')!;
const content=document.querySelector<HTMLElement>('#calibration-content')!;
const nationalPreview=document.querySelector<HTMLElement>('#national-preview')!;
const nationalToggle=document.querySelector<HTMLInputElement>('#show-national-ui')!;
new ClassicStage(frame,content);

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

const hud=new ClassicHud(document.querySelector<HTMLElement>('#classic-hud')!,()=>false);
const auth=new ClassicAuth(document.querySelector<HTMLElement>('#auth-overlay')!);
const characterPanel=new CharacterPanel(document.querySelector<HTMLElement>('#calibration-character-status')!,document.querySelector<HTMLElement>('#calibration-state')!);
const paperdoll=new PaperdollView(document.querySelector<HTMLElement>('#calibration-paperdoll-actor')!);
const equipment=new EquipmentView(document.querySelector<HTMLElement>('#calibration-equipment-items')!,()=>undefined);
const inventory=new InventoryView(document.querySelector<HTMLElement>('#calibration-inventory-items')!,{drop:()=>undefined,equip:()=>undefined,use:()=>undefined});

const screens=['login','select','create','hud','character','inventory','npc'] as const;
type Screen=typeof screens[number];
const screenLabels:Record<Screen,string>={login:'登录',select:'选角',create:'创建角色',hud:'主 HUD',character:'角色窗',inventory:'背包窗',npc:'NPC 对话'};
let screen:Screen='login';
const characters:SelectCharacter[]=[{name:'WebCheck',job:0,level:7,sex:0},{name:'Tao905',job:2,level:7,sex:1}];

type NationalFrame={file:string;width:number;height:number};
type NationalLibrary={frames:Record<string,NationalFrame>};
type NationalLayer={library:string;index:number;x:number;y:number};
const nationalScenes:Record<Screen,NationalLayer[]>={
 login:[{library:'chrsel',index:22,x:0,y:0},{library:'prguse',index:60,x:252,y:173}],
 select:[{library:'prguse',index:65,x:0,y:0}],
 create:[{library:'prguse',index:73,x:250,y:91}],
 hud:[{library:'prguse',index:1,x:0,y:349}],
 character:[{library:'prguse',index:370,x:284,y:138}],
 inventory:[{library:'prguse',index:3,x:232,y:165}],
 npc:[{library:'prguse',index:402,x:192,y:126}]
};
const nationalLibraries=new Map<string,NationalLibrary>();
let nationalReady=false;

async function nationalLibrary(name:string){
 const cached=nationalLibraries.get(name);if(cached)return cached;
 const response=await fetch(`/ui-national/${name}/library.json`);if(!response.ok)throw new Error(`缺少国服素材 ${name}`);
 const library=await response.json() as NationalLibrary;nationalLibraries.set(name,library);return library;
}

async function renderNationalScene(scene:Screen){
 if(!nationalReady||!nationalToggle.checked)return;
 const layers=nationalScenes[scene];
 const images=await Promise.all(layers.map(async layer=>{
  const library=await nationalLibrary(layer.library),source=library.frames[String(layer.index)];
  if(!source)throw new Error(`缺少国服素材 ${layer.library}#${layer.index}`);
  const image=document.createElement('img');image.src=`/ui-national/${layer.library}/${source.file}`;image.alt='';image.width=source.width;image.height=source.height;image.style.left=`${layer.x}px`;image.style.top=`${layer.y}px`;return image;
 }));
 nationalPreview.replaceChildren(...images);
}

function updateNationalMode(){
 const enabled=nationalReady&&nationalToggle.checked;
 content.classList.toggle('national-mode',enabled);nationalPreview.hidden=!enabled;
 if(enabled)void renderNationalScene(screen);
}

function hideContent(){
 document.querySelector<HTMLElement>('#auth-overlay')!.hidden=true;
 document.querySelector<HTMLElement>('#classic-hud')!.hidden=true;
 for(const id of ['character-window','inventory-window','npc-window'])document.querySelector<HTMLElement>(`#${id}`)!.hidden=true;
}

function show(screenName:Screen){
 screen=screenName;hideContent();
 if(screenName==='login'||screenName==='select'||screenName==='create'){
  const root=document.querySelector<HTMLElement>('#auth-overlay')!;root.hidden=false;
  if(screenName==='login')auth.showLogin();
  else if(screenName==='select')auth.showSelect(characters,{start:()=>undefined,create:()=>show('create'),exit:()=>show('login')});
  else auth.showCreate();
 }else if(screenName==='hud')document.querySelector<HTMLElement>('#classic-hud')!.hidden=false;
 else if(screenName==='character'){
  const window=document.querySelector<HTMLElement>('#character-window')!;window.hidden=false;hud.skinWindow(window,'character');
  window.querySelectorAll<HTMLElement>('[data-character-page]').forEach(page=>page.hidden=page.dataset.characterPage!=='paperdoll');
  document.querySelectorAll<HTMLButtonElement>('[data-character-tab]').forEach(button=>button.classList.toggle('active',button.dataset.characterTab==='paperdoll'));
 }else if(screenName==='inventory'){
  const window=document.querySelector<HTMLElement>('#inventory-window')!;window.hidden=false;hud.skinWindow(window,'inventory');
 }else{
  const window=document.querySelector<HTMLElement>('#npc-window')!;window.hidden=false;hud.skinWindow(window,'npc');
 }
 document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button=>button.classList.toggle('active',button.dataset.scene===screen));
 document.querySelector<HTMLElement>('#calibration-status-message')!.setAttribute('data-scene',screen);
 document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=nationalReady?'国服原始素材已加载 · 当前场景：'+screenLabels[screen]:'Crystal 候选界面帧已加载 · 国服原始 Data 未找到 · 当前场景：'+screenLabels[screen];
 updateNationalMode();
}

function wireControls(){
 document.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach(button=>button.onclick=()=>show(button.dataset.scene as Screen));
 document.querySelectorAll<HTMLButtonElement>('[data-window-close]').forEach(button=>button.onclick=()=>show('hud'));
 const grid=document.querySelector<HTMLInputElement>('#show-grid')!;grid.onchange=()=>frame.classList.toggle('show-grid',grid.checked);
 const ruler=document.querySelector<HTMLInputElement>('#show-ruler')!;ruler.onchange=()=>frame.classList.toggle('show-ruler',ruler.checked);
 nationalToggle.onchange=updateNationalMode;
 const opacity=document.querySelector<HTMLInputElement>('#reference-opacity')!;opacity.oninput=()=>document.querySelector<HTMLElement>('#calibration-reference')!.style.opacity=opacity.value;
 const file=document.querySelector<HTMLInputElement>('#reference-file')!;file.onchange=()=>{const selected=file.files?.[0];if(!selected)return;const reader=new FileReader();reader.onload=()=>{const image=document.querySelector<HTMLImageElement>('#reference-image')!;image.src=String(reader.result);document.querySelector<HTMLElement>('#calibration-reference')!.hidden=false;};reader.readAsDataURL(selected);};
 document.querySelector<HTMLButtonElement>('#clear-reference')!.onclick=()=>{const image=document.querySelector<HTMLImageElement>('#reference-image')!;image.removeAttribute('src');document.querySelector<HTMLElement>('#calibration-reference')!.hidden=true;file.value='';};
 frame.onpointermove=event=>{const rect=frame.getBoundingClientRect(),scale=rect.width/800,x=Math.max(0,Math.min(799,Math.floor((event.clientX-rect.left)/scale))),y=Math.max(0,Math.min(599,Math.floor((event.clientY-rect.top)/scale)));document.querySelector<HTMLElement>('#calibration-pointer')!.textContent=`${x}, ${y}`;};
}

async function boot(){
 await Promise.all([hud.ready(),auth.ready()]);
 hud.replaceAttributes(sampleAttributes);hud.position('0',289,616);hud.replaceSkills([{key:1,level:3,currentTrain:82,magicId:1,name:'基本剑术',effectType:0,effect:0,spell:0,power:0,trainLevels:[0,20,50,100],maxTrain:[0,100,100,100],job:0,delay:0,defSpell:0,defPower:0,maxPower:0,defMaxPower:0,description:'基础剑术'}]);
 characterPanel.replace(sampleAttributes);equipment.replace([{slot:1,item:sampleItems[0]},{slot:0,item:sampleItems[1]}]);inventory.replace(sampleItems);paperdoll.setFeature(0);
 wireControls();
 try{
  await Promise.all([nationalLibrary('chrsel'),nationalLibrary('prguse')]);
  nationalReady=true;nationalToggle.disabled=false;
 }catch(error){
  nationalToggle.checked=false;nationalToggle.disabled=true;
 }
 show('login');
 document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=nationalReady?'国服原始素材已加载 · 当前场景：登录':'Crystal 候选界面帧已加载 · 国服原始 Data 未找到 · 当前场景：登录';
}

void boot().catch(error=>{document.querySelector<HTMLElement>('#calibration-status-message')!.textContent=`界面素材加载失败：${error instanceof Error?error.message:String(error)}`;});
