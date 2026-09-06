export type MagicSkill={key:number;level:number;currentTrain:number;magicId:number;name:string;effectType:number;effect:number;spell:number;power:number;trainLevels:number[];maxTrain:number[];job:number;delay:number;defSpell:number;defPower:number;maxPower:number;defMaxPower:number;description:string};
export type SkillUse='hostile'|'self'|'toggle'|'charge'|'passive';
export const skillUse:Record<number,SkillUse>={
 1:'hostile',2:'self',3:'passive',5:'hostile',6:'hostile',7:'passive',
 8:'self',11:'hostile',12:'toggle',13:'hostile',14:'self',17:'self',
 25:'toggle',26:'charge',31:'self'
};
export function skillUseOf(magicId:number):SkillUse{return skillUse[magicId]??'hostile';}
export function spellCost(skill:Pick<MagicSkill,'spell'|'defSpell'|'level'>){
 return Math.round(skill.spell/4*(skill.level+1))+skill.defSpell;
}

type SkillActions={select:(skill:MagicSkill|undefined)=>void;self:(skill:MagicSkill)=>void};

export class SkillBar {
 private skills=new Map<number,MagicSkill>();private selected:number|undefined;private pending:number|undefined;private known=false;
 constructor(private element:HTMLElement,private actions:SkillActions){this.render();}
 clear(){this.skills.clear();this.selected=undefined;this.pending=undefined;this.known=false;this.render();}
 replace(skills:MagicSkill[]){this.skills=new Map(skills.map(skill=>[skill.magicId,skill]));this.selected=undefined;this.pending=undefined;this.known=true;this.render();}
 add(skill:MagicSkill){this.known=true;this.skills.set(skill.magicId,skill);this.render();}
 remove(magicId:number){this.skills.delete(magicId);if(this.selected===magicId){this.selected=undefined;this.actions.select(undefined);}this.render();}
 progress(magicId:number,level:number,currentTrain:number){const skill=this.skills.get(magicId);if(skill){this.skills.set(magicId,{...skill,level,currentTrain});this.render();}}
 skillAt(index:number){return [...this.skills.values()][index];}
 selectSlot(index:number){const skill=this.skillAt(index);if(!skill||this.pending!==undefined)return false;this.selected=skill.magicId;this.actions.select(skill);this.render();return true;}
 castSelf(skill:MagicSkill){if(this.pending!==undefined)return false;this.selected=undefined;this.pending=skill.magicId;this.actions.self(skill);this.render();return true;}
 setPending(magicId:number){this.selected=undefined;this.pending=magicId;this.render();}
 resolve(){this.pending=undefined;this.render();}
 private render(){
  this.element.replaceChildren();if(!this.known&&!this.skills.size){this.element.textContent='尚未收到技能数据';return;}if(!this.skills.size){this.element.textContent='尚未学会技能';return;}
  let slot=0;for(const skill of this.skills.values()){
   const use=skillUseOf(skill.magicId);
   const row=document.createElement('div');row.className='skill-item';row.dataset.magicId=String(skill.magicId);row.dataset.use=use;
   const description=document.createElement('span'),name=document.createElement('strong'),key=document.createElement('kbd'),detail=document.createElement('small');
   key.textContent=slot<8?`F${slot+1}`:'';name.append(key,skill.name);slot++;
   const next=Math.min(3,skill.level);detail.textContent=`${skill.level} 级 · 修炼 ${skill.currentTrain}/${skill.maxTrain[next]??0} · MP ${spellCost(skill)}`;
   description.append(name,detail);
   if(use==='hostile'){
    const select=document.createElement('button');select.type='button';select.disabled=this.pending!==undefined;
    select.textContent=this.pending===skill.magicId?'施法中…':this.selected===skill.magicId?'已选目标':'选择目标';
    select.onclick=()=>{this.selected=this.selected===skill.magicId?undefined:skill.magicId;this.actions.select(this.selected===undefined?undefined:skill);this.render();};
    row.append(description,select);
   }else if(use==='passive'){
    const note=document.createElement('span');note.className='skill-passive';note.textContent='近战被动';row.append(description,note);
   }else{
    const self=document.createElement('button');self.type='button';self.disabled=this.pending!==undefined;
    self.textContent=this.pending===skill.magicId?'施法中…':use==='toggle'?'开关':use==='charge'?'蓄力':'对自己';
    self.onclick=()=>this.castSelf(skill);row.append(description,self);
   }
   this.element.append(row);
  }
 }
}
