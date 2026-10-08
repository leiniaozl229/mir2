import {applyNationalCharacterStats,classicUiLayout,nationalUsesLayout} from './classic-layout';
import {loadNativeUiFont} from './native-ui-font';

type RangeStat={min:number;max:number};
export type CharacterAttributes={level:number;job:number;gold:number;gameGold:number;ac:RangeStat;mac:RangeStat;dc:RangeStat;mc:RangeStat;sc:RangeStat;hp:number;mp:number;maxHp:number;maxMp:number;experience:number;maxExperience:number;weight:number;maxWeight:number;wearWeight:number;maxWearWeight:number;handWeight:number;maxHandWeight:number};
export type SecondaryAttributes={antiMagic:number;hit:number;speed:number;antiPoison:number;poisonRecover:number;healthRecover:number;spellRecover:number};

export class CharacterPanel {
 private attributes:CharacterAttributes|undefined;
 private secondaryAttributes:SecondaryAttributes|undefined;
 private revision=0;
 constructor(private element:HTMLElement,private stateElement?:HTMLElement,private nameElement?:HTMLElement,private nameSource?:()=>string|undefined){this.render();}
 clear(){this.attributes=undefined;this.secondaryAttributes=undefined;this.render();}
 secondary(attributes:SecondaryAttributes){this.secondaryAttributes={...attributes};this.render();}
 replace(attributes:CharacterAttributes){this.attributes=attributes;this.render();}
 resources(values:{hp?:number;mp?:number;maxHp?:number;maxMp?:number}){if(!this.attributes)return;this.attributes={...this.attributes,...values};this.render();}
 experience(total:number){if(!this.attributes)return;this.attributes.experience=total;this.render();}
 level(level:number,experience:number){if(!this.attributes)return;this.attributes.level=level;this.attributes.experience=experience;this.render();}
 weights(values:{weight:number;wearWeight:number;handWeight:number}){if(!this.attributes)return;Object.assign(this.attributes,values);this.render();}
 currency(values:{gold?:number;gameGold?:number}){if(!this.attributes)return;Object.assign(this.attributes,values);this.render();}
 debugState(){return this.attributes?structuredClone(this.attributes):undefined;}
 private render(){
  const revision=++this.revision;
  const a=this.attributes;
  if(this.nameElement)this.nameElement.textContent=a?(this.nameSource?.()??`${['战士','法师','道士'][a.job]??''} ${a.level}`):'';
  if(a&&this.nameElement&&(nationalUsesLayout()||this.nameElement.closest('.national-window'))){
   const spec=classicUiLayout().nationalCharacterWindow.name;
   this.nameElement.style.color='transparent';this.nameElement.style.textShadow='none';
   void this.paint(this.nameElement,[this.nameElement],{...spec.font,width:spec.width,height:spec.height},revision);
  }
  this.element.replaceChildren();
  if(this.stateElement)this.stateElement.replaceChildren();
  if(!a){this.element.textContent='等待角色属性…';return;}
  this.place(this.element,[['AC',range(a.ac),20],['MAC',range(a.mac),38],['DC',range(a.dc),56],['MC',range(a.mc),74],['SC',range(a.sc),92],['HP',`${a.hp}/${a.maxHp}`,110],['MP',`${a.mp}/${a.maxMp}`,128]],revision);
  if(this.stateElement){
   const exp=a.maxExperience>0?`${Math.min(100,a.experience/a.maxExperience*100).toFixed(2)}%`:'0.00%';
   const s=this.secondaryAttributes;
   const percentScale=classicUiLayout().nationalCharacterWindow.secondaryPercentMultiplier;
   const rows:[string,string,number][]=[['经验值',exp,10],['背包重量',`${a.weight}/${a.maxWeight}`,24],['负重量',`${a.wearWeight}/${a.maxWearWeight}`,38],['腕力',`${a.handWeight}/${a.maxHandWeight}`,52]];
   if(s)rows.push(['准确度',String(s.hit),66],['敏捷度',String(s.speed),80],['魔法防御',`+${s.antiMagic*percentScale}%`,94],['中毒防御',`+${s.antiPoison*percentScale}%`,108],['中毒恢复',`+${s.poisonRecover*percentScale}%`,122],['体力恢复',`+${s.healthRecover*percentScale}%`,136],['魔法恢复',`+${s.spellRecover*percentScale}%`,150]);
   this.place(this.stateElement,rows,revision);
  }
 }
 private place(root:HTMLElement,rows:[string,string,number][],revision:number){
  const statusPage=root.id==='character-panel'||root.matches('[data-character-page="status"]');
  const nativeLayout=nationalUsesLayout()||Boolean(root.closest('.national-window'));
  const national=statusPage&&nativeLayout;
  const stats=national?classicUiLayout().nationalCharacterWindow.statValues:undefined;
  const stateRows=!statusPage&&nativeLayout?classicUiLayout().nationalCharacterWindow.stateRows:undefined;
  const textNodes:HTMLElement[]=[];
  for(const [index,[name,value,top]] of rows.entries()){
   const label=document.createElement('span');label.className='classic-stat';label.style.left='20px';label.style.top=`${top}px`;label.textContent=name;
   const amount=document.createElement('span');amount.className='classic-stat-value';amount.style.left='126px';amount.style.top=`${top}px`;amount.textContent=value;
   if(stateRows){
    label.style.left=`${stateRows.labelX}px`;amount.style.left=`${stateRows.valueX}px`;amount.style.textAlign='left';
    label.style.top=amount.style.top=`${stateRows.rowTop+index*stateRows.rowStep}px`;
    label.style.width=`${stateRows.valueX-stateRows.labelX}px`;
    amount.style.width=`${classicUiLayout().nationalCharacterWindow.statePage.width-stateRows.valueX}px`;
   }
   if(stats){
    label.style.display='none';
    const rowTop=stats.tops[index];
    if(rowTop!==undefined){amount.style.left=`${stats.x}px`;amount.style.top=`${rowTop}px`;amount.style.width=`${stats.width}px`;amount.style.textAlign=stats.align;}
   }
   root.append(label,amount);
   if(nativeLayout){
    if(!stats)textNodes.push(label);
    textNodes.push(amount);
   }
  }
  if(national)applyNationalCharacterStats(root);
  const typography=stats?.font??stateRows?.font;
  if(typography){
   // Keep literal authoritative values accessible while only source-bound bitmap ink is visible.
   for(const node of textNodes){node.style.color='transparent';node.style.textShadow='none';}
   void this.paint(root,textNodes,typography,revision);
  }
 }
 private async paint(root:HTMLElement,nodes:HTMLElement[],typography:{profile:string;color:string;outline:boolean;height:number;width?:number;align?:string;drawTop?:number},revision:number){
  const current=()=>this.revision===revision&&root.isConnected&&nodes.every(node=>node===root||node.parentElement===root);
  try{
   const font=await loadNativeUiFont(typography.profile);
   await font.prepare(nodes.map(node=>node.textContent??'').join('\n'));
   if(!current())return;
   // Stage the entire batch first, so a drawing failure cannot expose half a page.
   const painted=nodes.map(node=>{
    const canvas=root.ownerDocument.createElement('canvas');canvas.className='native-character-glyph';canvas.setAttribute('aria-hidden','true');
    const text=node.textContent??'',width=typography.width??Number.parseInt(node.style.width,10);
    font.paint(canvas,text,{width,height:typography.height,left:typography.align==='center'?Math.floor((width-font.measure(text))/2):0,top:typography.drawTop??0,lineHeight:typography.height,color:typography.color,outline:typography.outline});
    return canvas;
   });
   if(current())nodes.forEach((node,index)=>node.append(painted[index]));
  }catch(error){
   if(!current())return;
   const diagnostic=root.ownerDocument.createElement('div');diagnostic.className='native-character-font-error'+(root===this.nameElement?' native-character-font-error--title':'');diagnostic.setAttribute('role','alert');
   const message=root.ownerDocument.createElement('span');message.textContent=error instanceof Error?error.message:'原客户端文字素材载入失败，请重试';
   const retry=root.ownerDocument.createElement('button');retry.type='button';retry.textContent='重试文字';
   retry.addEventListener('click',()=>{if(current())this.render();});
   diagnostic.append(message,retry);root.append(diagnostic);
  }
 }
}

function range(value:RangeStat){return `${value.min}-${value.max}`;}
