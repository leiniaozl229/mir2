import {playerLayers,type PlayerLayers} from './online-actors';

const SOUTH=4;

export class PaperdollView {
 private generation=0;
 private feature?:number;
 constructor(private element:HTMLElement){}
 clear(){this.generation++;this.feature=undefined;this.element.replaceChildren();}
 setFeature(feature:number){
  if(feature===this.feature)return;
  this.feature=feature;
  const layers=playerLayers(feature);
  const generation=++this.generation;
  this.element.replaceChildren();
  if(!layers)return;
  void this.draw(layers,generation).catch(()=>{
   if(generation!==this.generation)return;
   this.element.textContent='换装形象待校准';
  });
 }
 private async draw(layers:PlayerLayers,generation:number){
  const parts:{name:string;offset:number;z:number}[]=[
   {name:layers.bodyName,offset:layers.offset,z:0},
  ];
  if(layers.weaponName)parts.push({name:layers.weaponName,offset:layers.weaponOffset,z:2});
  if(layers.hairName)parts.push({name:layers.hairName,offset:layers.offset,z:1});
  const images=await Promise.all(parts.map(async part=>{
   const response=await fetch(`/actors/${part.name}/library.json`);
   if(!response.ok)throw new Error(part.name);
   const library=await response.json() as {frames:Record<string,{file:string;offsetX:number;offsetY:number}>;actions?:Record<string,{start:number;count:number;skip:number}>};
   const definition=library.actions?.['0']??{start:0,count:4,skip:0};
   const index=part.offset+definition.start+SOUTH*(definition.count+definition.skip);
   const frame=library.frames[index]??library.frames[String(index)];
   if(!frame)return;
   const image=document.createElement('img');
   image.src=`/actors/${part.name}/${frame.file}`;
   image.alt='';
   image.style.zIndex=String(part.z);
   image.style.left=`${frame.offsetX}px`;
   image.style.top=`${frame.offsetY}px`;
   return image;
  }));
  if(generation!==this.generation)return;
  this.element.replaceChildren(...images.filter((image):image is HTMLImageElement=>Boolean(image)));
 }
}
