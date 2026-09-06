type RangeStat={min:number;max:number};
export type CharacterAttributes={level:number;job:number;gold:number;gameGold:number;ac:RangeStat;mac:RangeStat;dc:RangeStat;mc:RangeStat;sc:RangeStat;hp:number;mp:number;maxHp:number;maxMp:number;experience:number;maxExperience:number;weight:number;maxWeight:number;wearWeight:number;maxWearWeight:number;handWeight:number;maxHandWeight:number};

export class CharacterPanel {
 private attributes:CharacterAttributes|undefined;
 constructor(private element:HTMLElement){this.render();}
 clear(){this.attributes=undefined;this.render();}
 replace(attributes:CharacterAttributes){this.attributes=attributes;this.render();}
 resources(values:{hp?:number;mp?:number;maxHp?:number;maxMp?:number}){if(!this.attributes)return;this.attributes={...this.attributes,...values};this.render();}
 experience(total:number){if(!this.attributes)return;this.attributes.experience=total;this.render();}
 level(level:number,experience:number){if(!this.attributes)return;this.attributes.level=level;this.attributes.experience=experience;this.render();}
 weights(values:{weight:number;wearWeight:number;handWeight:number}){if(!this.attributes)return;Object.assign(this.attributes,values);this.render();}
 currency(values:{gold?:number;gameGold?:number}){if(!this.attributes)return;Object.assign(this.attributes,values);this.render();}
 private render(){
  this.element.replaceChildren();const a=this.attributes;if(!a){this.element.textContent='等待角色属性…';return;}
  const jobs=['战士','法师','道士'];
  const identity=document.createElement('div');identity.className='character-identity';identity.innerHTML=`<strong>${jobs[a.job]??`职业 ${a.job}`} · ${a.level} 级</strong><span>金币 ${a.gold.toLocaleString('zh-CN')}</span>`;
  const vitals=document.createElement('div');vitals.className='vitals';vitals.append(this.meter('HP',a.hp,a.maxHp,'hp'),this.meter('MP',a.mp,a.maxMp,'mp'),this.meter('经验',a.experience,a.maxExperience,'exp'));
  const stats=document.createElement('dl');stats.className='attribute-grid';
  const values=[['攻击',a.dc],['魔法',a.mc],['道术',a.sc],['防御',a.ac],['魔防',a.mac],['背包',`${a.weight}/${a.maxWeight}`],['穿戴',`${a.wearWeight}/${a.maxWearWeight}`],['腕力',`${a.handWeight}/${a.maxHandWeight}`]] as const;
  for(const [name,value] of values){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=typeof value==='string'?value:`${value.min}-${value.max}`;stats.append(dt,dd);}
  this.element.append(identity,vitals,stats);
 }
 private meter(name:string,value:number,max:number,kind:string){const block=document.createElement('div');block.className='vital';const label=document.createElement('span');label.textContent=`${name} ${value} / ${max}`;const meter=document.createElement('div');meter.className=`meter ${kind}`;const fill=document.createElement('i');fill.style.width=`${max>0?Math.max(0,Math.min(100,value/max*100)):0}%`;meter.append(fill);block.append(label,meter);return block;}
}
