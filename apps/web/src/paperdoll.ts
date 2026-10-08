import {playerLayers} from './online-actors';
import {loadNationalUiLibrary,nationalUiUrl,uiFrame} from './classic-ui';

export class PaperdollView {
 private generation=0;
 private feature?:number;
 constructor(private element:HTMLElement){}
 clear(){this.generation++;this.feature=undefined;this.element.replaceChildren();}
 debugState(){const layers=this.feature===undefined?undefined:playerLayers(this.feature);return {feature:this.feature,layers,images:Array.from(this.element.querySelectorAll('img')).map(image=>({src:image.src,loaded:image.complete&&image.naturalWidth>0})),ready:Boolean(layers)&&this.element.querySelectorAll('img').length>0&&Array.from(this.element.querySelectorAll('img')).every(image=>image.complete&&image.naturalWidth>0)};}
 setFeature(feature:number){
  if(feature===this.feature)return;
  this.feature=feature;
  const layers=playerLayers(feature);
  const generation=++this.generation;
  this.element.replaceChildren();
  if(!layers)return;
  void this.draw(layers.sex,generation).catch(()=>{
   if(generation!==this.generation)return;
   this.element.textContent='换装形象待校准';
  });
 }
 private async draw(sex:number,generation:number){
  const library=await loadNationalUiLibrary('prguse');
  if(generation!==this.generation)return;
  const frame=uiFrame(library,sex===1?377:376);
  const image=document.createElement('img');image.alt='';image.width=frame.width;image.height=frame.height;
  image.style.left='0px';image.style.top='0px';image.src=nationalUiUrl('prguse',frame);
  this.element.replaceChildren(image);
 }
}
