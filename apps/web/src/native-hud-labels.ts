import layout from '../../../content/classic-176/ui-layout.json';
import {loadNativeUiFont} from './native-ui-font';
import {createNativeUiArtLoader} from './native-ui-art';

const spec=layout.nationalHud.labels;
const loadDigits=createNativeUiArtLoader(spec.art,'prguse','HUD数字');

/** Paint only confirmed HUD values; replacement/clear invalidates asynchronous graphics. */
export class NativeHudLabels{
 private levelRevision=0;
 private locationRevision=0;
 private levelValue:string|undefined;
 private locationValue:string|undefined;
 constructor(private readonly root:HTMLElement,private readonly level:HTMLElement,private readonly location:HTMLElement|null){
  level.classList.add('native-hud-label');level.style.height=`${spec.level.height}px`;
  if(location){location.classList.add('native-hud-label');Object.assign(location.style,{left:`${spec.location.x}px`,top:`${spec.location.y}px`,width:`${spec.location.width}px`,height:`${spec.location.height}px`});}
 }
 setLevel(value:string){
  if(value===this.levelValue)return;
  this.levelValue=value;const revision=++this.levelRevision;this.reset(this.level,value);
  if(value)void this.paintLevel(value,revision);
 }
 setLocation(value:string){
  if(!this.location||value===this.locationValue)return;
  this.locationValue=value;const revision=++this.locationRevision;this.reset(this.location,value);
  if(value)void this.paintLocation(value,revision);
 }
 private reset(element:HTMLElement,value:string){
  element.textContent='';element.setAttribute('aria-label',value);
  const literal=element.ownerDocument.createElement('span');literal.className='native-hud-literal';literal.textContent=value;element.append(literal);
 }
 private current(element:HTMLElement,revision:number,kind:'level'|'location'){
  return this.root.isConnected&&element.isConnected&&revision===(kind==='level'?this.levelRevision:this.locationRevision);
 }
 private canvas(element:HTMLElement,width:number,height:number){
  const canvas=element.ownerDocument.createElement('canvas');canvas.className='native-hud-glyph';canvas.setAttribute('aria-hidden','true');canvas.width=width;canvas.height=height;canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;return canvas;
 }
 private async paintLevel(value:string,revision:number){
  try{
   if(!/^\d+$/.test(value))throw new Error('原客户端等级数值无效');
   const indices=Array.from(value,digit=>spec.level.digitFirstFrame+Number(digit));
   const art=await loadDigits(indices);if(!this.current(this.level,revision,'level'))return;
   const canvas=this.canvas(this.level,layout.nationalHud.fields.level.width,spec.level.height),context=canvas.getContext('2d');
   if(!context)throw new Error('原客户端等级绘制不可用，请重试');context.imageSmoothingEnabled=false;
   indices.forEach((index,i)=>context.drawImage(art.get(index)!,spec.level.firstDigitX+i*spec.level.advance,0));
   this.level.append(canvas);
  }catch(error){if(this.current(this.level,revision,'level'))this.failure(this.level,error,()=>{if(!this.current(this.level,revision,'level'))return;this.levelValue=undefined;this.setLevel(value);});}
 }
 private async paintLocation(value:string,revision:number){
  const element=this.location!;
  try{
   const font=await loadNativeUiFont(spec.location.font);await font.prepare(value);
   if(!this.current(element,revision,'location'))return;
   const canvas=this.canvas(element,spec.location.width,spec.location.height);
   font.paint(canvas,value,{width:spec.location.width,height:spec.location.height,left:spec.location.drawLeft,top:spec.location.drawTop,lineHeight:spec.location.height,color:spec.location.color,outline:spec.location.outline});element.append(canvas);
  }catch(error){if(this.current(element,revision,'location'))this.failure(element,error,()=>{if(!this.current(element,revision,'location'))return;this.locationValue=undefined;this.setLocation(value);});}
 }
 private failure(element:HTMLElement,error:unknown,retry:()=>void){
  const button=element.ownerDocument.createElement('button');button.type='button';button.className='native-hud-label-retry';button.textContent='重试显示';button.title=error instanceof Error?error.message:'原客户端HUD显示载入失败';button.setAttribute('aria-label',button.title+'，重试显示');button.onclick=retry;element.append(button);
 }
}
