import type {CharacterAttributes} from './character-panel';
import {arrangeSkills,type MagicSkill} from './skills';
import {applyNationalUiFrame,applyUiFrame,loadNationalUiLibrary,loadUiLibrary,uiFrame,uiUrl,nationalUiUrl,type Frame} from './classic-ui';
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
  const [prguse,prguse2,title,icons]=await Promise.all(['Prguse','Prguse2','Title','MagIcon'].map(loadUiLibrary));
  this.libraries.set('Prguse',prguse);this.libraries.set('Prguse2',prguse2);this.libraries.set('Title',title);this.libraries.set('MagIcon',icons);
  applyUiFrame(root.querySelector<HTMLElement>('[data-hud-main]')!, 'Prguse', uiFrame(prguse, 0));
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
  try{
   const nationalPrguse=await loadNationalUiLibrary('prguse');
  this.nationalLibraries.set('prguse',nationalPrguse);this.nationalReady=true;this.mountNationalHud(root);
   void loadNationalUiLibrary('magic-icons').then(icons=>{this.nationalLibraries.set('magic-icons',icons);this.renderHotbar();}).catch(()=>{});
  }catch{
   this.nationalReady=false;
  }
  this.applyCursor(document.body);
  this.render();
 }

 private mountNationalHud(root:HTMLElement){
  const prguse=this.nationalLibraries.get('prguse');
  if(!prguse)return;
  root.classList.add('national-ui');document.body.classList.add('national-play');
  const main=root.querySelector<HTMLElement>('[data-hud-main]')!;
  applyNationalUiFrame(main,'prguse',uiFrame(prguse,1));main.style.left='0';main.style.top='349px';
  void punchNationalHudChat(main,prguse);
  for(const selector of ['[data-hud-minimap-frame]','[data-hud-skillbar]','[data-hud-chatbar]','[data-hud-exp-track]','[data-hud-weight]']){
   const element=root.querySelector<HTMLElement>(selector);if(element)element.style.backgroundImage='none';
  }
  const orb=uiFrame(prguse,4);
  this.hpFill.replaceChildren(orbImage(orb,0,true));
  this.mpFill.replaceChildren(orbImage(orb,-46,true));
  const windowButtons=Array.from(root.querySelectorAll<HTMLButtonElement>('.hud-window-buttons button'));
  const nationalButtons=[
   {index:8,hover:24,pressed:24,x:640,y:410,width:32,height:32,backgroundX:3,backgroundY:0},
   {index:9,hover:9,pressed:9,x:678,y:390,width:32,height:32,backgroundX:4,backgroundY:0},
   {index:10,hover:10,pressed:10,x:718,y:370,width:32,height:32,backgroundX:4,backgroundY:0},
   undefined,
   {index:11,hover:11,pressed:11,x:760,y:360,width:32,height:32,backgroundX:4,backgroundY:0}
  ];
  windowButtons.forEach((button,index)=>{
   const spec=nationalButtons[index];
   button.hidden=false;
   if(index===3){
    clearSkin(button);button.onmouseenter=null;button.onmouseleave=null;button.onmousedown=null;button.onmouseup=null;
    button.dataset.windowOpen='targets';button.setAttribute('aria-label','目标');button.title='附近目标';button.style.left='748px';button.style.top='400px';button.style.width='32px';button.style.height='32px';
   }else if(spec){
    skinNationalHudButton(button,prguse,spec);
   }
   if(index===4){
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

 private skinNationalWindow(element:HTMLElement,kind:string){
  const prguse=this.nationalLibraries.get('prguse');
  const specs:Record<string,{index:number;x:number;y:number;closeX:number;closeY:number}>={
   character:{index:380,x:272,y:80,closeX:232,closeY:2},
   inventory:{index:3,x:232,y:165,closeX:308,closeY:204},
   npc:{index:402,x:192,y:126,closeX:390,closeY:2},
   shop:{index:402,x:192,y:126,closeX:390,closeY:2},
   repair:{index:402,x:192,y:126,closeX:390,closeY:2},
   storage:{index:402,x:192,y:126,closeX:390,closeY:2}
  };
  const spec=specs[kind];
  if(!prguse||!spec)return false;
  element.classList.add('national-window');element.classList.toggle('national-panel',['shop','repair','storage'].includes(kind));element.style.left=`${spec.x}px`;element.style.top=`${spec.y}px`;element.style.right='auto';element.style.bottom='auto';
  applyNationalUiFrame(element,'prguse',uiFrame(prguse,spec.index));
  if(kind==='character'){
   const paper=element.querySelector<HTMLElement>('[data-character-page="paperdoll"]');
   if(paper){applyNationalUiFrame(paper,'prguse',uiFrame(prguse,378));paper.style.left='44px';paper.style.top='72px';}
   const status=element.querySelector<HTMLElement>('[data-character-page="status"]');
   if(status){applyNationalUiFrame(status,'prguse',uiFrame(prguse,370));status.style.left='12px';status.style.top='52px';}
   const labels=['装备','属性','状态','技能'];
   element.querySelectorAll<HTMLButtonElement>('[data-character-tab]').forEach((button,index)=>{
    button.style.left=`${8+index*60}px`;button.style.top='28px';button.style.width='56px';button.style.height='18px';button.textContent=labels[index]??'';
   });
  }
  const close=element.querySelector<HTMLButtonElement>('#classic-window-close, [data-window-close], #close-dialogue, .classic-window-close');
  if(close){clearSkin(close);close.style.left=`${spec.closeX}px`;close.style.top=`${spec.closeY}px`;close.style.width='22px';close.style.height='22px';}
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
 resource(values:Partial<ResourceState>){this.resources={...this.resources,...values};this.renderBars();}
 experience(total:number){this.resources.experience=total;this.renderBars();}
 level(level:number,total:number){if(this.attributes)this.attributes={...this.attributes,level,experience:total};this.resources.experience=total;this.render();}
 replaceSkills(skills:MagicSkill[]){this.skills=arrangeSkills(skills);this.selected=-1;this.renderHotbar();}
 addSkill(skill:MagicSkill){this.skills=arrangeSkills([...this.skills.filter(value=>value.magicId!==skill.magicId),skill]);this.renderHotbar();}
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
  const orbHeight=this.nationalReady?90:80,barWidth=this.nationalReady?75:784,weightWidth=this.nationalReady?75:76;
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
  const skills=arrangeSkills(this.skills);
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
 const left=207,right=Math.min(canvas.width-1,594),top=120,bottom=Math.min(canvas.height-1,243);
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const i=(y*canvas.width+x)*4;
  if(data[i]>248&&data[i+1]>248&&data[i+2]>248&&data[i+3]>200){data[i]=26;data[i+1]=22;data[i+2]=18;data[i+3]=255;}
 }
 context.putImageData(pixels,0,0);
 main.style.backgroundImage=`url(${canvas.toDataURL('image/png')})`;
}
function clearSkin(element:HTMLElement){element.style.backgroundImage='none';element.style.backgroundColor='transparent';}
function skinNationalHudButton(button:HTMLButtonElement,library:NationalLibrary,spec:{index:number;hover:number;pressed:number;x:number;y:number;width:number;height:number;backgroundX:number;backgroundY:number}){
 button.style.left=`${spec.x}px`;button.style.top=`${spec.y}px`;button.style.width=`${spec.width}px`;button.style.height=`${spec.height}px`;
 const paint=(index:number,filter:string)=>{
  const frame=uiFrame(library,index);
  button.style.setProperty('background-image',`url(${nationalUiUrl('prguse',frame)})`,'important');
  button.style.backgroundPosition=`${spec.backgroundX}px ${spec.backgroundY}px`;
  button.style.backgroundRepeat='no-repeat';button.style.backgroundColor='transparent';button.style.filter=filter;
 };
 paint(spec.index,'');
 button.onmouseenter=()=>paint(spec.hover,'brightness(1.14)');
 button.onmouseleave=()=>paint(spec.index,'');
 button.onmousedown=()=>paint(spec.pressed,'brightness(.86)');
 button.onmouseup=()=>paint(spec.hover,'brightness(1.14)');
}
function ratio(value:number,max:number){return max>0?Math.max(0,Math.min(1,value/max)):0;}
