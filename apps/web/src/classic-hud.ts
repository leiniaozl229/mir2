import type {CharacterAttributes} from './character-panel';
import type {MagicSkill} from './skills';
import {applyUiFrame,loadUiLibrary,uiFrame,uiUrl,type Frame} from './classic-ui';

type ResourceState={hp:number;mp:number;maxHp:number;maxMp:number;experience:number;maxExperience:number};
type UiButton={library:string;index:number;hover:number;pressed:number;x:number;y:number;window:string};

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
  void this.mount(root);
 }

 private async mount(root:HTMLElement){
  const [prguse,prguse2,title,icons]=await Promise.all(['Prguse','Prguse2','Title','MagIcon'].map(loadUiLibrary));
  this.libraries.set('Prguse',prguse);this.libraries.set('Prguse2',prguse2);this.libraries.set('Title',title);this.libraries.set('MagIcon',icons);
  applyUiFrame(root.querySelector<HTMLElement>('[data-hud-main]')!, 'Prguse', uiFrame(prguse, 0));
  applyUiFrame(root.querySelector<HTMLElement>('[data-hud-minimap-frame]')!, 'Prguse', uiFrame(prguse, 2090));
  applyUiFrame(root.querySelector<HTMLElement>('[data-hud-chat]')!, 'Prguse', uiFrame(prguse, 2201));
  applyUiFrame(root.querySelector<HTMLElement>('[data-hud-chatbar]')!, 'Prguse', uiFrame(prguse, 2035));
  applyUiFrame(root.querySelector<HTMLElement>('[data-hud-skillbar]')!, 'Prguse', uiFrame(prguse, 2190));
  const orb=uiFrame(prguse, 4);
  this.hpFill.replaceChildren(orbImage(orb, 0));
  this.mpFill.replaceChildren(orbImage(orb, -51));
  applyUiFrame(root.querySelector<HTMLElement>('[data-hud-exp-track]')!, 'Prguse', uiFrame(prguse, 7));
  applyUiFrame(root.querySelector<HTMLElement>('[data-hud-weight]')!, 'Prguse', uiFrame(prguse, 76));
  const buttons:Record<string,UiButton>={
   character:{library:'Prguse',index:1900,hover:1901,pressed:1902,x:681,y:524,window:'character'},
   inventory:{library:'Prguse',index:1903,hover:1904,pressed:1905,x:704,y:524,window:'inventory'},
   skills:{library:'Prguse',index:1906,hover:1907,pressed:1908,x:727,y:524,window:'skills'},
   quest:{library:'Prguse',index:1909,hover:1910,pressed:1911,x:750,y:524,window:'quest'},
   option:{library:'Prguse',index:1912,hover:1913,pressed:1914,x:773,y:524,window:'attack'}
  };
  for(const [id,spec] of Object.entries(buttons)){
   const button=root.querySelector<HTMLButtonElement>(`[data-window-open="${spec.window}"]`);
   if(!button)continue;
   const frame=uiFrame(prguse, spec.index);
   button.style.left=`${spec.x}px`;button.style.top=`${spec.y}px`;
   applyUiFrame(button, 'Prguse', frame);
   button.textContent='';button.setAttribute('aria-label', id);
   button.onmouseenter=()=>applyUiFrame(button, 'Prguse', uiFrame(prguse, spec.hover));
   button.onmouseleave=()=>applyUiFrame(button, 'Prguse', uiFrame(prguse, spec.index));
   button.onmousedown=()=>applyUiFrame(button, 'Prguse', uiFrame(prguse, spec.pressed));
   button.onmouseup=()=>applyUiFrame(button, 'Prguse', uiFrame(prguse, spec.hover));
  }
  this.applyCursor(document.body);
  this.render();
 }

 skinWindow(element:HTMLElement,kind:'character'|'inventory'|'npc'|string){
  const prguse=this.libraries.get('Prguse'),title=this.libraries.get('Title'),prguse2=this.libraries.get('Prguse2');
  if(!prguse||!title||!prguse2)return;
  const specs:{library:string;index:number;x:number;y:number;closeX:number;closeY:number}={
   character:{library:'Title',index:504,x:536,y:0,closeX:241,closeY:3},
   inventory:{library:'Title',index:196,x:0,y:185,closeX:289,closeY:3},
   npc:{library:'Prguse',index:995,x:5,y:40,closeX:413,closeY:3}
  }[kind==='skills'||kind==='equipment'?'character':kind==='quest'?'character':kind]??{library:'Title',index:504,x:268,y:80,closeX:241,closeY:3};
  const library=this.libraries.get(specs.library)!;
  const frame=uiFrame(library, specs.index);
  element.style.left=`${specs.x}px`;element.style.top=`${specs.y}px`;element.style.right='auto';element.style.bottom='auto';
  applyUiFrame(element, specs.library, frame);
  if(kind==='character'||kind==='equipment'||kind==='skills'){
   const page=element.querySelector<HTMLElement>('[data-character-page="paperdoll"]');
   if(page)applyUiFrame(page, 'Prguse', uiFrame(prguse, 340));
   const status=element.querySelector<HTMLElement>('[data-character-page="status"]');
   if(status)applyUiFrame(status, 'Title', uiFrame(title, 506));
   const state=element.querySelector<HTMLElement>('[data-character-page="state"]');
   if(state)applyUiFrame(state, 'Title', uiFrame(title, 507));
   const skills=element.querySelector<HTMLElement>('[data-character-page="skills"]');
   if(skills)applyUiFrame(skills, 'Title', uiFrame(title, 508));
   const tabs=[{id:'paperdoll',index:500,x:8,y:70},{id:'status',index:501,x:70,y:70},{id:'state',index:502,x:132,y:70},{id:'skills',index:503,x:194,y:70}];
   for(const tab of tabs){
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
 resource(values:Partial<ResourceState>){this.resources={...this.resources,...values};this.renderBars();}
 experience(total:number){this.resources.experience=total;this.renderBars();}
 level(level:number,total:number){if(this.attributes)this.attributes={...this.attributes,level,experience:total};this.resources.experience=total;this.render();}
 replaceSkills(skills:MagicSkill[]){this.skills=[...skills];this.selected=-1;this.renderHotbar();}
 addSkill(skill:MagicSkill){this.skills=[...this.skills.filter(value=>value.magicId!==skill.magicId),skill].sort((a,b)=>a.magicId-b.magicId);this.renderHotbar();}
 removeSkill(magicId:number){this.skills=this.skills.filter(skill=>skill.magicId!==magicId);if(this.selected>=this.skills.length)this.selected=-1;this.renderHotbar();}
 progress(magicId:number,level:number,currentTrain:number){this.skills=this.skills.map(skill=>skill.magicId===magicId?{...skill,level,currentTrain}:skill);this.renderHotbar();}
 position(map:string,x:number,y:number){this.map=map;this.x=x;this.y=y;this.coords.textContent=`${x}:${y}`;}
 status(mask:number){this.statusMask=mask>>>0;this.renderStatus();}
 hungerStatus(value:number){this.hunger=Math.max(0,Math.min(4,value));this.renderStatus();}
 selectSlot(index:number){if(index<0||index>=this.skills.length)return;this.selected=index;this.renderHotbar();}

 private render(){
  const jobNames=['战士','法师','道士'];
  this.job.textContent=this.attributes?jobNames[this.attributes.job]??`职业 ${this.attributes.job}`:'';
  this.name.textContent=this.attributes?`${this.attributes.level}`:'';
  this.gold.textContent=this.attributes?String(this.attributes.gold):'0';
  this.coords.textContent=`${this.x}:${this.y}`;
  const prguse=this.libraries.get('Prguse');
  if(prguse&&this.attributes){
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
  this.hpFill.style.height=`${ratio(hp,maxHp)*80}px`;
  this.mpFill.style.height=`${ratio(mp,maxMp)*80}px`;
  this.expFill.style.width=`${ratio(experience,maxExperience)*784}px`;
  this.expText.textContent=`${Math.max(0,experience)}/${Math.max(0,maxExperience)}`;
  const weight=this.attributes?ratio(this.attributes.weight,this.attributes.maxWeight):0;
  const weightFill=document.querySelector<HTMLElement>('[data-hud-weight-fill]');
  if(weightFill)weightFill.style.width=`${weight*76}px`;
 }
 private renderStatus(){
  const labels:[[number,string],...Array<[number,string]>]=[
   [0x80000000,'绿毒'],[0x40000000,'红毒'],[0x20000000,'禁魔'],[0x10000000,'蛛网'],
   [0x08000000,'定身'],[0x04000000,'防麻'],[0x01000000,'加速'],[0x00800000,'隐身'],
   [0x00400000,'神圣战甲'],[0x00200000,'幽灵盾'],[0x00100000,'魔法盾'],[0x00000001,'石化'],[0x00000002,'开天眼']
  ];
  const active=labels.filter(([bit])=>(this.statusMask&bit)!==0).map(([,label])=>label);
  const hunger=['正常','微饿','饥饿','很饿','饥荒'][this.hunger]??'正常';
  this.statusText.textContent=[...active,hunger].filter(Boolean).join(' ');
  this.statusText.classList.toggle('hud-status-alert',active.length>0||this.hunger>=3);
 }
 private renderHotbar(){
  this.hotbar.replaceChildren();
  const icons=this.libraries.get('MagIcon');
  for(let index=0;index<8;index++){
   const skill=this.skills[index],button=document.createElement('button');
   button.type='button';button.className='hud-slot';button.style.left=`${15+index*25}px`;button.style.top='3px';
   button.title=skill?`${skill.name} · ${skill.level}级`:`F${index+1}`;
   if(index===this.selected)button.classList.add('selected');
   if(skill&&icons){
    const frame=icons.frames[String(skill.magicId)]??icons.frames[String(Math.max(0,skill.magicId-1))]??icons.frames['1'];
    if(frame){const image=new Image();image.src=uiUrl('MagIcon', frame);image.alt=skill.name;button.append(image);}
    else button.textContent=skill.name.slice(0,1);
   }
   const key=document.createElement('kbd');key.textContent=`F${index+1}`;button.append(key);
   button.onclick=()=>{if(this.select(index))this.selectSlot(index);};
   this.hotbar.append(button);
  }
 }
}

function orbImage(frame:Frame,offsetX:number){
 const image=new Image();image.src=uiUrl('Prguse', frame);image.alt='';image.style.left=`${offsetX}px`;return image;
}
function ratio(value:number,max:number){return max>0?Math.max(0,Math.min(1,value/max)):0;}
