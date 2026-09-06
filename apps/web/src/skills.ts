export type MagicSkill={key:number;level:number;currentTrain:number;magicId:number;name:string;effectType:number;effect:number;spell:number;power:number;trainLevels:number[];maxTrain:number[];job:number;delay:number;defSpell:number;defPower:number;maxPower:number;defMaxPower:number;description:string};

type SkillActions={select:(skill:MagicSkill|undefined)=>void;self:(skill:MagicSkill)=>void};

export class SkillBar {
 private skills=new Map<number,MagicSkill>();private selected:number|undefined;private pending:number|undefined;private known=false;
 constructor(private element:HTMLElement,private actions:SkillActions){this.render();}
 clear(){this.skills.clear();this.selected=undefined;this.pending=undefined;this.known=false;this.render();}
 replace(skills:MagicSkill[]){this.skills=new Map(skills.map(skill=>[skill.magicId,skill]));this.selected=undefined;this.pending=undefined;this.known=true;this.render();}
 add(skill:MagicSkill){this.known=true;this.skills.set(skill.magicId,skill);this.render();}
 remove(magicId:number){this.skills.delete(magicId);if(this.selected===magicId){this.selected=undefined;this.actions.select(undefined);}this.render();}
 progress(magicId:number,level:number,currentTrain:number){const skill=this.skills.get(magicId);if(skill){this.skills.set(magicId,{...skill,level,currentTrain});this.render();}}
 selectSlot(index:number){const skill=[...this.skills.values()][index];if(!skill||this.pending!==undefined)return false;this.selected=skill.magicId;this.actions.select(skill);this.render();return true;}
 setPending(magicId:number){this.selected=undefined;this.pending=magicId;this.render();}
 resolve(){this.pending=undefined;this.render();}
 private render(){
  this.element.replaceChildren();if(!this.known&&!this.skills.size){this.element.textContent='尚未收到技能数据';return;}if(!this.skills.size){this.element.textContent='尚未学会技能';return;}
  let slot=0;for(const skill of this.skills.values()){
   const row=document.createElement('div');row.className='skill-item';row.dataset.magicId=String(skill.magicId);const description=document.createElement('span'),name=document.createElement('strong'),key=document.createElement('kbd'),detail=document.createElement('small');key.textContent=slot<8?`F${slot+1}`:'';name.append(key,skill.name);slot++;const next=Math.min(3,skill.level);detail.textContent=`${skill.level} 级 · 修炼 ${skill.currentTrain}/${skill.maxTrain[next]??0} · MP ${skill.spell+skill.defSpell*skill.level}`;description.append(name,detail);
   const select=document.createElement('button');select.type='button';select.disabled=this.pending!==undefined;select.textContent=this.pending===skill.magicId?'施法中…':this.selected===skill.magicId?'已选目标':'选择目标';select.onclick=()=>{this.selected=this.selected===skill.magicId?undefined:skill.magicId;this.actions.select(this.selected===undefined?undefined:skill);this.render();};
   const self=document.createElement('button');self.type='button';self.disabled=this.pending!==undefined;self.textContent='对自己';self.onclick=()=>{this.pending=skill.magicId;this.actions.self(skill);this.render();};row.append(description,select,self);this.element.append(row);
  }
 }
}
