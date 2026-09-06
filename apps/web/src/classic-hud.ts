import type {CharacterAttributes} from './character-panel';
import type {MagicSkill} from './skills';

type ResourceState={hp:number;mp:number;maxHp:number;maxMp:number;experience:number;maxExperience:number};

export class ClassicHud {
 private attributes:CharacterAttributes|undefined;
 private resources:ResourceState={hp:0,mp:0,maxHp:0,maxMp:0,experience:0,maxExperience:0};
 private skills:MagicSkill[]=[];
 private selected=-1;
 private map='0';
 private x=0;
 private y=0;
 private readonly job:HTMLElement;
 private readonly name:HTMLElement;
 private readonly coords:HTMLElement;
 private readonly hpOrb:HTMLElement;
 private readonly mpOrb:HTMLElement;
 private readonly hpText:HTMLElement;
 private readonly mpText:HTMLElement;
 private readonly expFill:HTMLElement;
 private readonly expText:HTMLElement;
 private readonly hotbar:HTMLElement;
 private readonly statusText:HTMLElement;
 private statusMask=0;
 private hunger=0;

 constructor(root:HTMLElement,private readonly select:(index:number)=>boolean){
  this.job=root.querySelector<HTMLElement>('[data-hud-job]')!;
  this.name=root.querySelector<HTMLElement>('[data-hud-name]')!;
  this.coords=root.querySelector<HTMLElement>('[data-hud-coords]')!;
  this.hpOrb=root.querySelector<HTMLElement>('[data-hud-hp-orb]')!;
  this.mpOrb=root.querySelector<HTMLElement>('[data-hud-mp-orb]')!;
  this.hpText=root.querySelector<HTMLElement>('[data-hud-hp]')!;
  this.mpText=root.querySelector<HTMLElement>('[data-hud-mp]')!;
  this.expFill=root.querySelector<HTMLElement>('[data-hud-exp-fill]')!;
  this.expText=root.querySelector<HTMLElement>('[data-hud-exp]')!;
  this.hotbar=root.querySelector<HTMLElement>('[data-hud-hotbar]')!;
  this.statusText=root.querySelector<HTMLElement>('[data-hud-status]')!;
  this.render();
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
 position(map:string,x:number,y:number){this.map=map;this.x=x;this.y=y;this.coords.textContent=`地图 ${map} · ${x},${y}`;}
 status(mask:number){this.statusMask=mask>>>0;this.renderStatus();}
 hungerStatus(value:number){this.hunger=Math.max(0,Math.min(4,value));this.renderStatus();}
 selectSlot(index:number){if(index<0||index>=this.skills.length)return;this.selected=index;this.renderHotbar();}

 private render(){
  const jobNames=['战士','法师','道士'];
  this.job.textContent=this.attributes?jobNames[this.attributes.job]??`职业 ${this.attributes.job}`:'未入场';
  this.name.textContent=this.attributes?`${this.attributes.level} 级`:'等待角色';
  this.coords.textContent=`地图 ${this.map} · ${this.x},${this.y}`;
  this.renderBars();
  this.renderStatus();
  this.renderHotbar();
 }
 private renderBars(){
  const {hp,mp,maxHp,maxMp,experience,maxExperience}=this.resources;
  this.hpText.textContent=`${Math.max(0,hp)} / ${Math.max(0,maxHp)}`;
  this.mpText.textContent=`${Math.max(0,mp)} / ${Math.max(0,maxMp)}`;
  this.hpOrb.style.setProperty('--fill',`${ratio(hp,maxHp)*100}%`);
  this.mpOrb.style.setProperty('--fill',`${ratio(mp,maxMp)*100}%`);
  this.expFill.style.width=`${ratio(experience,maxExperience)*100}%`;
  this.expText.textContent=`经验 ${Math.max(0,experience)} / ${Math.max(0,maxExperience)}`;
 }
 private renderStatus(){
  const labels:[[number,string],...Array<[number,string]>]=[
   [0x80000000,'绿毒'],[0x40000000,'红毒'],[0x20000000,'禁魔'],[0x10000000,'蛛网'],
   [0x08000000,'定身'],[0x04000000,'防麻'],[0x01000000,'加速'],[0x00800000,'隐身'],
   [0x00400000,'神圣战甲'],[0x00200000,'幽灵盾'],[0x00100000,'魔法盾'],[0x00000001,'石化'],[0x00000002,'开天眼']
  ];
  const active=labels.filter(([bit])=>(this.statusMask&bit)!==0).map(([,label])=>label);
  const hunger=['正常','微饿','饥饿','很饿','饥荒'][this.hunger]??'正常';
  this.statusText.textContent=[...active,`饥饿:${hunger}`].join(' · ');
  this.statusText.classList.toggle('hud-status-alert',active.length>0||this.hunger>=3);
 }
 private renderHotbar(){
  this.hotbar.replaceChildren();
  for(let index=0;index<8;index++){
   const skill=this.skills[index],button=document.createElement('button');
   button.type='button';button.className='hud-slot';button.dataset.slot=String(index);button.title=skill?`${skill.name} · ${skill.level}级`:'空技能栏';
   if(index===this.selected)button.classList.add('selected');
   const key=document.createElement('kbd');key.textContent=`F${index+1}`;
   const name=document.createElement('strong');name.textContent=skill?.name??'空';
   const level=document.createElement('small');level.textContent=skill?`${skill.level}级`:'—';
   button.append(key,name,level);
   button.onclick=()=>{if(this.select(index))this.selectSlot(index);};
   this.hotbar.append(button);
  }
 }
}

function ratio(value:number,max:number){return max>0?Math.max(0,Math.min(1,value/max)):0;}
