import type {CharacterAttributes} from './character-panel';
import {arrangeSkillSlots,type MagicSkill} from './skills';
import {applyNationalUiFrame,applyUiFrame,loadClassicUiSession,loadNationalUiLibrary,loadUiLibrary,uiFrame,uiUrl,nationalUiUrl,type Frame} from './classic-ui';
import {applyNationalCharacterLayout,applyNationalHudLayout,applyNationalInventoryLayout,classicUiLayout,nationalHudOrbMetrics,nationalWindowButtonFrames,placeBox} from './classic-layout';
import skillAssets from '../../../content/classic-176/skill-assets.json';

type ResourceState={hp:number;mp:number;maxHp:number;maxMp:number;experience:number;maxExperience:number};
type UiButton={library:string;index:number;hover:number;pressed:number;x:number;y:number;window:string};
type NationalLibrary=Awaited<ReturnType<typeof loadNationalUiLibrary>>;

export class ClassicHud {
 private attributes:CharacterAttributes|undefined;
 private resources:ResourceState={hp:0,mp:0,maxHp:0,maxMp:0,experience:0,maxExperience:0};
 private skills:MagicSkill[]=[];
 private selected=-1;
 private map='0';
 private x=0;
 private y=0;
 private statusMask=0;
 private hunger=0;
 private libraries=new Map<string,Awaited<ReturnType<typeof loadUiLibrary>>>();
 private nationalLibraries=new Map<string,NationalLibrary>();
 private nationalReady=false;
 private readonly job:HTMLElement;
 private readonly name:HTMLElement;
 private readonly coords:HTMLElement;
 private readonly hpFill:HTMLElement;
 private readonly mpFill:HTMLElement;
 private readonly hpText:HTMLElement;
 private readonly mpText:HTMLElement;
 private readonly expFill:HTMLElement;
 private readonly expText:HTMLElement;
 private readonly gold:HTMLElement;
 private readonly hotbar:HTMLElement;
 private readonly statusText:HTMLElement;
 private readonly classIcon:HTMLElement;
 private readonly mountTask:Promise<void>;

 constructor(root:HTMLElement,private readonly select:(index:number)=>boolean){
  this.job=root.querySelector<HTMLElement>('[data-hud-job]')!;
  this.name=root.querySelector<HTMLElement>('[data-hud-name]')!;
  this.coords=root.querySelector<HTMLElement>('[data-hud-coords]')!;
  this.hpFill=root.querySelector<HTMLElement>('[data-hud-hp-fill]')!;
  this.mpFill=root.querySelector<HTMLElement>('[data-hud-mp-fill]')!;
  this.hpText=root.querySelector<HTMLElement>('[data-hud-hp]')!;
  this.mpText=root.querySelector<HTMLElement>('[data-hud-mp]')!;
  this.expFill=root.querySelector<HTMLElement>('[data-hud-exp-fill]')!;
  this.expText=root.querySelector<HTMLElement>('[data-hud-exp]')!;
  this.gold=root.querySelector<HTMLElement>('[data-hud-gold]')!;
  this.hotbar=root.querySelector<HTMLElement>('[data-hud-hotbar]')!;
  this.statusText=root.querySelector<HTMLElement>('[data-hud-status]')!;
  this.classIcon=root.querySelector<HTMLElement>('[data-hud-class]')!;
 this.mountTask=this.mount(root);
}

 async ready(){await this.mountTask;}

 private async mount(root:HTMLElement){
  const session=await loadClassicUiSession();
  for(const [name,library] of session.fallback)this.libraries.set(name,library);
  for(const [name,library] of session.national)this.nationalLibraries.set(name,library);
  const nationalPrguse=session.national.get('prguse');
  if(nationalPrguse){this.nationalLibraries.set('prguse',nationalPrguse);this.nationalReady=true;}
  const prguse=this.libraries.get('Prguse');
  if(prguse){
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-main]')!, 'Prguse', uiFrame(prguse, 0));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-chat]')!, 'Prguse', uiFrame(prguse, 2201));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-chatbar]')!, 'Prguse', uiFrame(prguse, 2035));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-skillbar]')!, 'Prguse', uiFrame(prguse, 2190));
   const orb=uiFrame(prguse, 4);
   this.hpFill.replaceChildren(orbImage(orb, 0));
   this.mpFill.replaceChildren(orbImage(orb, -51));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-exp-track]')!, 'Prguse', uiFrame(prguse, 7));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-weight]')!, 'Prguse', uiFrame(prguse, 76));
  }
  const buttons=classicUiLayout().buttons as Record<string,UiButton>;
  for(const [id,spec] of Object.entries(buttons)){
   const button=root.querySelector<HTMLButtonElement>(`[data-window-open="${spec.window}"]`);
   if(!button)continue;
   if(!prguse)continue;
   const frame=uiFrame(prguse, spec.index);
   button.style.left=`${spec.x}px`;button.style.top=`${spec.y}px`;
   applyUiFrame(button, 'Prguse', frame);
   button.textContent='';button.setAttribute('aria-label', id);
   button.onmouseenter=()=>applyUiFrame(button, 'Prguse', uiFrame(prguse, spec.hover));
   button.onmouseleave=()=>applyUiFrame(button, 'Prguse', uiFrame(prguse, spec.index));
   button.onmousedown=()=>applyUiFrame(button, 'Prguse', uiFrame(prguse, spec.pressed));
   button.onmouseup=()=>applyUiFrame(button, 'Prguse', uiFrame(prguse, spec.hover));
  }
  if(this.nationalReady){
   this.mountNationalHud(root);
   this.renderHotbar();
  }
  if(!prguse&&!this.nationalReady)throw new Error('缺少可用的经典 HUD 素材');
  this.applyCursor(document.body);
  this.render();
 }

 private mountNationalHud(root:HTMLElement){
  const prguse=this.nationalLibraries.get('prguse');
  if(!prguse)return;
  const layout=classicUiLayout();
  const hud=layout.nationalHud;
  root.classList.add('national-ui');document.body.classList.add('national-play');
  const main=root.querySelector<HTMLElement>('[data-hud-main]')!;
  applyNationalUiFrame(main,'prguse',uiFrame(prguse,hud.mainDialog.index));
  void punchNationalHudChat(main,prguse);
  const skillbar=root.querySelector<HTMLElement>('[data-hud-skillbar]');
  if(skillbar){skillbar.hidden=true;skillbar.setAttribute('aria-hidden','true');}
  for(const selector of ['[data-hud-minimap-frame]','[data-hud-chatbar]','[data-hud-weight]']){
   const element=root.querySelector<HTMLElement>(selector);if(element)element.style.backgroundImage='none';
  }
  const expTrack=root.querySelector<HTMLElement>('[data-hud-exp-track]');
  if(expTrack)applyNationalUiFrame(expTrack,'prguse',uiFrame(prguse,hud.experienceBar.index));
  const orb=uiFrame(prguse,4);
  const orbMetrics=nationalHudOrbMetrics();
  this.hpFill.replaceChildren(orbImage(orb,hud.orbs.hp.imageOffsetX,true));
  this.mpFill.replaceChildren(orbImage(orb,orbMetrics.mpImageOffsetX,true));
  applyNationalHudLayout(root);
  const windowButtons=Array.from(root.querySelectorAll<HTMLButtonElement>('.hud-window-buttons button'));
  hud.windowButtons.forEach((spec,index)=>{
   const button=windowButtons[index];if(!button)return;
   button.hidden=false;
   const frames=nationalWindowButtonFrames('control' in spec?spec.control:undefined);
   if('remapFrom' in spec&&spec.remapFrom){
    clearSkin(button);button.onmouseenter=null;button.onmouseleave=null;button.onmousedown=null;button.onmouseup=null;
    button.dataset.windowOpen=spec.window;button.setAttribute('aria-label','目标');button.title='附近目标';
    placeBox(button,{x:spec.x,y:spec.y,width:spec.width,height:spec.height});
   }else if(frames){
    skinNationalHudButton(button,prguse,{...frames,x:spec.x,y:spec.y,width:spec.width,height:spec.height,backgroundX:'backgroundX' in spec?spec.backgroundX??0:0,backgroundY:'backgroundY' in spec?spec.backgroundY??0:0});
   }
   if(spec.id==='attack'){
    button.setAttribute('aria-label','声音');
    button.addEventListener('click',event=>{
     event.preventDefault();event.stopImmediatePropagation();
     document.querySelector<HTMLButtonElement>('#audio-toggle')?.click();
    },true);
   }
  });
 }

 skinWindow(element:HTMLElement,kind:'character'|'inventory'|'npc'|string){
  const prguse=this.libraries.get('Prguse'),title=this.libraries.get('Title'),prguse2=this.libraries.get('Prguse2');
  if(this.nationalReady&&this.skinNationalWindow(element,kind))return;
  if(!prguse||!title||!prguse2)return;
  const layout=classicUiLayout();
  const specs:{library:string;index:number;x:number;y:number;closeX:number;closeY:number}=
   kind==='inventory'?{library:layout.windows.inventory.library,index:layout.windows.inventory.index,x:layout.windows.inventory.x,y:layout.windows.inventory.y,closeX:layout.windows.inventory.closeX,closeY:layout.windows.inventory.closeY}:
   kind==='npc'?{library:layout.windows.npc.library,index:layout.windows.npc.index,x:layout.windows.npc.x,y:layout.windows.npc.y,closeX:layout.windows.npc.closeX,closeY:layout.windows.npc.closeY}:
   kind==='character'||kind==='equipment'||kind==='skills'?{library:layout.windows.character.library,index:layout.windows.character.index,x:layout.windows.character.x,y:layout.windows.character.y,closeX:layout.windows.character.closeX,closeY:layout.windows.character.closeY}:
   {library:'Title',index:504,x:268,y:80,closeX:241,closeY:3};
  const library=this.libraries.get(specs.library)!;
  const frame=uiFrame(library, specs.index);
  if(element.dataset.windowMoved!=='true'){element.style.left=`${specs.x}px`;element.style.top=`${specs.y}px`;if(element.id==='classic-window'){element.style.setProperty('--classic-window-left',`${specs.x}px`);element.style.setProperty('--classic-window-top',`${specs.y}px`);}}
  element.style.right='auto';element.style.bottom='auto';
  applyUiFrame(element, specs.library, frame);
  if(kind==='character'||kind==='equipment'||kind==='skills'){
   const page=element.querySelector<HTMLElement>('[data-character-page="paperdoll"]');
   if(page)applyUiFrame(page, 'Prguse', uiFrame(prguse, layout.characterPage.index));
   const status=element.querySelector<HTMLElement>('[data-character-page="status"]');
   if(status)applyUiFrame(status, 'Title', uiFrame(title, 506));
   const state=element.querySelector<HTMLElement>('[data-character-page="state"]');
   if(state)applyUiFrame(state, 'Title', uiFrame(title, 507));
   const skills=element.querySelector<HTMLElement>('[data-character-page="skills"]');
   if(skills)applyUiFrame(skills, 'Title', uiFrame(title, 508));
   for(const tab of layout.characterTabs){
    const button=element.querySelector<HTMLButtonElement>(`[data-character-tab="${tab.id}"]`);
    if(!button)continue;
    button.style.left=`${tab.x}px`;button.style.top=`${tab.y}px`;
    applyUiFrame(button, 'Title', uiFrame(title, tab.index));
    button.textContent='';
   }
  }
  const close=element.querySelector<HTMLButtonElement>('#classic-window-close, [data-window-close], #close-dialogue');
  if(close){const closeFrame=uiFrame(prguse2, 360);close.style.left=`${specs.closeX}px`;close.style.top=`${specs.closeY}px`;applyUiFrame(close, 'Prguse2', closeFrame);close.textContent='';}
 }

 private skinNationalWindow(element:HTMLElement,kind:string){
  const prguse=this.nationalLibraries.get('prguse');
  const layout=classicUiLayout();
  const specs:Record<string,{index:number;x:number;y:number;closeX:number;closeY:number;closeWidth:number;closeHeight:number;paintClose?:boolean}>={
   npc:{index:402,x:192,y:126,closeX:385,closeY:-37,closeWidth:17,closeHeight:23},
   shop:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   repair:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   storage:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   quest:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   attack:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   targets:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   ground:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   group:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   guild:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   system:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   chat:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   trade:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23}
  };
  const spec=kind==='character'||kind==='equipment'||kind==='skills'?{
   index:layout.nationalCharacterWindow.index,x:layout.nationalCharacterWindow.x,y:layout.nationalCharacterWindow.y,
   closeX:layout.nationalCharacterWindow.close.x,closeY:layout.nationalCharacterWindow.close.y,
   closeWidth:layout.nationalCharacterWindow.close.width,closeHeight:layout.nationalCharacterWindow.close.height,
   paintClose:layout.nationalCharacterWindow.close.paint
  }:kind==='inventory'?{
   index:layout.nationalInventoryWindow.index,x:layout.nationalInventoryWindow.x,y:layout.nationalInventoryWindow.y,
   closeX:layout.nationalInventoryWindow.close.x,closeY:layout.nationalInventoryWindow.close.y,
   closeWidth:layout.nationalInventoryWindow.close.width,closeHeight:layout.nationalInventoryWindow.close.height
  }:specs[kind];
  if(!prguse||!spec)return false;
  element.classList.add('national-window');element.classList.toggle('national-panel',['shop','repair','storage','quest','attack','targets','ground','group','guild','system','chat','trade'].includes(kind));if(element.dataset.windowMoved!=='true'){element.style.left=`${spec.x}px`;element.style.top=`${spec.y}px`;if(element.id==='classic-window'){element.style.setProperty('--classic-window-left',`${spec.x}px`);element.style.setProperty('--classic-window-top',`${spec.y}px`);}}element.style.right='auto';element.style.bottom='auto';
  applyNationalUiFrame(element,'prguse',uiFrame(prguse,spec.index));
  if(kind==='character'||kind==='equipment'||kind==='skills'){
   const paper=element.querySelector<HTMLElement>('[data-character-page="paperdoll"]');
   if(paper)applyNationalUiFrame(paper,'prguse',uiFrame(prguse,layout.nationalCharacterPage.index));
   const status=element.querySelector<HTMLElement>('[data-character-page="status"]');
   if(status)applyNationalUiFrame(status,'prguse',uiFrame(prguse,layout.nationalCharacterWindow.statusPage.index));
   applyNationalCharacterLayout(element);
  }
  if(kind==='inventory')applyNationalInventoryLayout(element);
  const close=element.querySelector<HTMLButtonElement>('#classic-window-close, [data-window-close], #close-dialogue, .classic-window-close');
  if(close)skinNationalClose(close,prguse,spec);
  return true;
 }

 applyCursor(root:HTMLElement){
  root.style.setProperty('--cursor-default', "url('/ui/Cursors/Cursor_Default.CUR') 0 0, auto");
  root.style.setProperty('--cursor-attack', "url('/ui/Cursors/Cursor_Normal_Atk.CUR') 0 0, crosshair");
  root.style.setProperty('--cursor-attack-red', "url('/ui/Cursors/Cursor_Compulsion_Atk.CUR') 0 0, crosshair");
  root.style.setProperty('--cursor-npc', "url('/ui/Cursors/Cursor_Npc.CUR') 0 0, pointer");
  root.style.setProperty('--cursor-text', "url('/ui/Cursors/Cursor_TextPrompt.CUR') 1 11, text");
  root.style.setProperty('--cursor-trash', "url('/ui/Cursors/Cursor_Trash.CUR') 0 0, pointer");
  root.classList.add('classic-cursors');
 }

 clear(){this.attributes=undefined;this.skills=[];this.selected=-1;this.statusMask=0;this.hunger=0;this.resources={hp:0,mp:0,maxHp:0,maxMp:0,experience:0,maxExperience:0};this.render();}
 replaceAttributes(attributes:CharacterAttributes){this.attributes=attributes;this.resources={...this.resources,hp:attributes.hp,mp:attributes.mp,maxHp:attributes.maxHp,maxMp:attributes.maxMp,experience:attributes.experience,maxExperience:attributes.maxExperience};this.render();}
 currency(values:{gold?:number;gameGold?:number}){if(!this.attributes)return;this.attributes={...this.attributes,...values};this.gold.textContent=String(this.attributes.gold);}
 resource(values:Partial<ResourceState>){this.resources={...this.resources,...values};this.renderBars();}
 experience(total:number){this.resources.experience=total;this.renderBars();}
 level(level:number,total:number){if(this.attributes)this.attributes={...this.attributes,level,experience:total};this.resources.experience=total;this.render();}
 replaceSkills(skills:MagicSkill[]){this.skills=[...skills];this.selected=-1;this.renderHotbar();}
 addSkill(skill:MagicSkill){this.skills=[...this.skills.filter(value=>value.magicId!==skill.magicId),skill];this.renderHotbar();}
 removeSkill(magicId:number){this.skills=this.skills.filter(skill=>skill.magicId!==magicId);if(this.selected>=this.skills.length)this.selected=-1;this.renderHotbar();}
 progress(magicId:number,level:number,currentTrain:number){this.skills=this.skills.map(skill=>skill.magicId===magicId?{...skill,level,currentTrain}:skill);this.renderHotbar();}
 position(map:string,x:number,y:number){this.map=map;this.x=x;this.y=y;this.coords.textContent=`${x}:${y}`;}
 status(mask:number){this.statusMask=mask>>>0;this.renderStatus();}
 hungerStatus(value:number){this.hunger=Math.max(0,Math.min(4,value));this.renderStatus();}
 selectSlot(index:number){const slots=arrangeSkillSlots(this.skills);if(index<0||index>=slots.length||!slots[index])return;this.selected=index;this.renderHotbar();}

 private render(){
  const jobNames=['战士','法师','道士'];
  this.job.textContent=this.attributes?jobNames[this.attributes.job]??`职业 ${this.attributes.job}`:'';
  this.name.textContent=this.attributes?`${this.attributes.level}`:'';
  this.gold.textContent=this.attributes?String(this.attributes.gold):'0';
  this.coords.textContent=`${this.x}:${this.y}`;
  const prguse=this.libraries.get('Prguse');
  if(prguse&&this.attributes&&!this.nationalReady){
   const icon=uiFrame(prguse, 100+(this.attributes.job===1?1:this.attributes.job===2?2:0));
   applyUiFrame(this.classIcon, 'Prguse', icon);
   this.classIcon.hidden=false;
  }else this.classIcon.hidden=true;
  this.renderBars();
  this.renderStatus();
  this.renderHotbar();
 }
 private renderBars(){
  const {hp,mp,maxHp,maxMp,experience,maxExperience}=this.resources;
  this.hpText.textContent=`${Math.max(0,hp)}/${Math.max(0,maxHp)}`;
  this.mpText.textContent=`${Math.max(0,mp)}/${Math.max(0,maxMp)}`;
  const orbHeight=this.nationalReady?nationalHudOrbMetrics().orbHeight:80,barWidth=this.nationalReady?nationalHudOrbMetrics().barWidth:784,weightWidth=this.nationalReady?nationalHudOrbMetrics().weightWidth:76;
  this.hpFill.style.height=`${ratio(hp,maxHp)*orbHeight}px`;
  this.mpFill.style.height=`${ratio(mp,maxMp)*orbHeight}px`;
  this.expFill.style.width=`${ratio(experience,maxExperience)*barWidth}px`;
  this.expText.textContent=`${Math.max(0,experience)}/${Math.max(0,maxExperience)}`;
  const weight=this.attributes?ratio(this.attributes.weight,this.attributes.maxWeight):0;
  const weightFill=document.querySelector<HTMLElement>('[data-hud-weight-fill]');
  if(weightFill)weightFill.style.width=`${weight*weightWidth}px`;
 }
 private renderStatus(){
  const labels:[[number,string],...Array<[number,string]>]=[
   [0x80000000,'绿毒'],[0x40000000,'红毒'],[0x20000000,'禁魔'],[0x10000000,'蛛网'],
   [0x08000000,'定身'],[0x04000000,'防麻'],[0x01000000,'加速'],[0x00800000,'隐身'],
   [0x00400000,'神圣战甲'],[0x00200000,'幽灵盾'],[0x00100000,'魔法盾'],[0x00000001,'石化'],[0x00000002,'开天眼']
  ];
  const active=labels.filter(([bit])=>(this.statusMask&bit)!==0).map(([,label])=>label);
  const hunger=['','微饿','饥饿','很饿','饥荒'][this.hunger]??'';
  this.statusText.textContent=[...active,hunger].filter(Boolean).join(' ');
  this.statusText.classList.toggle('hud-status-alert',active.length>0||this.hunger>=3);
 }
 private renderHotbar(){
  this.hotbar.replaceChildren();
  const icons=this.libraries.get('MagIcon'),nationalIcons=this.nationalLibraries.get('magic-icons');
  const skills=arrangeSkillSlots(this.skills);
  for(let index=0;index<8;index++){
   const skill=skills[index],button=document.createElement('button');
   button.type='button';button.className='hud-slot';button.style.left=`${15+index*25}px`;button.style.top='3px';
   if(this.nationalReady){button.style.left=`${index*31}px`;button.style.top='1px';button.style.width='26px';button.style.height='26px';}
   button.title=skill?`${skill.name} · ${skill.level}级`:`F${index+1}`;
   if(index===this.selected)button.classList.add('selected');
   if(skill&&(nationalIcons||icons)){
    const iconIndex=(skillAssets.iconIndexByName as Record<string,number>)[skill.name]??skill.magicId;
    const nationalFrame=nationalIcons?.frames[String(iconIndex)]??nationalIcons?.frames[String(Math.max(0,iconIndex-1))];
    const frame=nationalFrame??icons?.frames[String(iconIndex)]??icons?.frames[String(Math.max(0,iconIndex-1))]??icons?.frames['1'];
    if(frame){const image=new Image();image.src=nationalFrame?`/ui-national/magic-icons/${nationalFrame.file}`:uiUrl('MagIcon', frame);image.alt=skill.name;button.append(image);}
    else button.textContent=skill.name.slice(0,1);
   }
   const key=document.createElement('kbd');key.textContent=`F${index+1}`;button.append(key);
   button.onclick=()=>{if(this.select(index))this.selectSlot(index);};
   button.oncontextmenu=event=>{event.preventDefault();if(this.select(index))this.selectSlot(index);};
   this.hotbar.append(button);
  }
 }
}

function orbImage(frame:Frame,offsetX:number,national=false){
 const image=new Image();image.src=national?nationalUiUrl('prguse', frame):uiUrl('Prguse', frame);image.alt='';image.style.left=`${offsetX}px`;return image;
}
async function punchNationalHudChat(main:HTMLElement,prguse:NationalLibrary){
 const frame=uiFrame(prguse,1),image=new Image();
 image.src=nationalUiUrl('prguse', frame);
 await image.decode().catch(()=>undefined);
 if(!image.naturalWidth)return;
 const canvas=document.createElement('canvas');canvas.width=frame.width;canvas.height=frame.height;
 const context=canvas.getContext('2d');if(!context)return;
 context.drawImage(image,0,0);
 const pixels=context.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
 const punch=classicUiLayout().nationalHud.chatPunch;
 const left=punch.left,right=Math.min(canvas.width-1,punch.right),top=punch.top,bottom=Math.min(canvas.height-1,punch.bottom);
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const i=(y*canvas.width+x)*4;
  if(data[i]>248&&data[i+1]>248&&data[i+2]>248&&data[i+3]>200){data[i]=26;data[i+1]=22;data[i+2]=18;data[i+3]=255;}
 }
 context.putImageData(pixels,0,0);
 main.style.backgroundImage=`url(${canvas.toDataURL('image/png')})`;
}
function clearSkin(element:HTMLElement){element.style.backgroundImage='none';element.style.backgroundColor='transparent';}
function skinNationalClose(button:HTMLButtonElement,library:NationalLibrary,spec:{closeX:number;closeY:number;closeWidth:number;closeHeight:number;paintClose?:boolean}){
 clearSkin(button);button.style.left=`${spec.closeX}px`;button.style.top=`${spec.closeY}px`;button.style.right='auto';button.style.width=`${spec.closeWidth}px`;button.style.height=`${spec.closeHeight}px`;button.style.padding='0';button.style.border='0';button.textContent='';
 if(spec.paintClose){const frame=uiFrame(library,371);button.style.setProperty('background-image',`url(${nationalUiUrl('prguse',frame)})`,'important');button.style.backgroundRepeat='no-repeat';}
}
function skinNationalHudButton(button:HTMLButtonElement,library:NationalLibrary,spec:{index:number;hover:number;pressed:number;x:number;y:number;width:number;height:number;backgroundX:number;backgroundY:number}){
 button.style.left=`${spec.x}px`;button.style.top=`${spec.y}px`;button.style.width=`${spec.width}px`;button.style.height=`${spec.height}px`;
 const paint=(index:number,filter:string)=>{
  const frame=uiFrame(library,index);
  button.style.setProperty('background-image',`url(${nationalUiUrl('prguse',frame)})`,'important');
  button.style.backgroundPosition=`${spec.backgroundX}px ${spec.backgroundY}px`;
  button.style.backgroundRepeat='no-repeat';button.style.backgroundColor='transparent';button.style.filter=filter;
 };
 const hoverFilter=spec.hover===spec.index?'':'brightness(1.14)',pressedFilter=spec.pressed===spec.index?'':'brightness(.86)';
 paint(spec.index,'');
 button.onmouseenter=()=>paint(spec.hover,hoverFilter);
 button.onmouseleave=()=>paint(spec.index,'');
 button.onmousedown=()=>paint(spec.pressed,pressedFilter);
 button.onmouseup=()=>paint(spec.hover,hoverFilter);
}
function ratio(value:number,max:number){return max>0?Math.max(0,Math.min(1,value/max)):0;}
