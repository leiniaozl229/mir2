type RangeStat={min:number;max:number};
export type CharacterAttributes={level:number;job:number;gold:number;gameGold:number;ac:RangeStat;mac:RangeStat;dc:RangeStat;mc:RangeStat;sc:RangeStat;hp:number;mp:number;maxHp:number;maxMp:number;experience:number;maxExperience:number;weight:number;maxWeight:number;wearWeight:number;maxWearWeight:number;handWeight:number;maxHandWeight:number};

export class CharacterPanel {
 private attributes:CharacterAttributes|undefined;
 constructor(private element:HTMLElement,private stateElement?:HTMLElement,private nameElement?:HTMLElement){this.render();}
 clear(){this.attributes=undefined;this.render();}
 replace(attributes:CharacterAttributes){this.attributes=attributes;this.render();}
 resources(values:{hp?:number;mp?:number;maxHp?:number;maxMp?:number}){if(!this.attributes)return;this.attributes={...this.attributes,...values};this.render();}
 experience(total:number){if(!this.attributes)return;this.attributes.experience=total;this.render();}
 level(level:number,experience:number){if(!this.attributes)return;this.attributes.level=level;this.attributes.experience=experience;this.render();}
 weights(values:{weight:number;wearWeight:number;handWeight:number}){if(!this.attributes)return;Object.assign(this.attributes,values);this.render();}
 currency(values:{gold?:number;gameGold?:number}){if(!this.attributes)return;Object.assign(this.attributes,values);this.render();}
 debugState(){return this.attributes?structuredClone(this.attributes):undefined;}
 private render(){
  const a=this.attributes;
  if(this.nameElement)this.nameElement.textContent=a?`${['战士','法师','道士'][a.job]??''} ${a.level}`:'';
  this.element.replaceChildren();
  if(this.stateElement)this.stateElement.replaceChildren();
  if(!a){this.element.textContent='等待角色属性…';return;}
  this.place(this.element,[['AC',range(a.ac),20],['MAC',range(a.mac),38],['DC',range(a.dc),56],['MC',range(a.mc),74],['SC',range(a.sc),92],['HP',`${a.hp}/${a.maxHp}`,110],['MP',`${a.mp}/${a.maxMp}`,128]]);
  if(this.stateElement){
   const exp=a.maxExperience>0?`${Math.min(100,a.experience/a.maxExperience*100).toFixed(1)}%`:'0%';
   this.place(this.stateElement,[['经验',exp,20],['背包',`${a.weight}/${a.maxWeight}`,38],['穿戴',`${a.wearWeight}/${a.maxWearWeight}`,56],['腕力',`${a.handWeight}/${a.maxHandWeight}`,74],['金币',String(a.gold),92]]);
  }
 }
 private place(root:HTMLElement,rows:[string,string,number][]){
  for(const [name,value,top] of rows){
   const label=document.createElement('span');label.className='classic-stat';label.style.left='20px';label.style.top=`${top}px`;label.textContent=name;
   const amount=document.createElement('span');amount.className='classic-stat-value';amount.style.left='126px';amount.style.top=`${top}px`;amount.textContent=value;
   root.append(label,amount);
  }
 }
}

function range(value:RangeStat){return `${value.min}-${value.max}`;}
