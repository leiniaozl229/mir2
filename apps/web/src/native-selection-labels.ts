import contract from '../../../content/classic-176/selection-actions.json';
import {loadNativeUiFont} from './native-ui-font';

const spec=contract.labels;
type SlotLabels={index:number;name:HTMLElement;level:HTMLElement;job:HTMLElement};
type Label={element:HTMLElement;text:string;width:number;left:number};

/** Selected server and character values remain literal; asynchronous pixels never revive an old scene. */
export class NativeSelectionLabels{
 private revision=0;
 private elements:HTMLElement[]=[];
 private retry:HTMLButtonElement|undefined;
 constructor(private readonly root:HTMLElement,private readonly scene:HTMLElement,private readonly title:HTMLElement|null){
  root.ownerDocument.defaultView?.addEventListener('pagehide',()=>this.stop());
 }
 stop(){
  ++this.revision;this.retry?.remove();this.retry=undefined;
  for(const element of this.elements){element.textContent='';element.removeAttribute('aria-label');}
  this.elements=[];if(this.title)this.title.hidden=true;
 }
 show(serverName:string,slots:SlotLabels[]){
  const values=slots.map(slot=>({slot,text:{name:slot.name.textContent??'',level:slot.level.textContent??'',job:slot.job.textContent??''}}));
  this.stop();const revision=this.revision;
  if(!this.current(revision))return;
  const labels:Label[]=[];
  if(this.title&&serverName){
   this.title.hidden=false;
   this.place(this.title,0,spec.title.drawY-spec.drawTop,spec.title.surfaceWidth);
   labels.push(this.literal(this.title,serverName,spec.title.surfaceWidth,0));
  }
  for(const {slot,text} of values){
   const position=spec.slots[slot.index];if(!position)continue;
   for(const [kind,element] of [['name',slot.name],['level',slot.level],['job',slot.job]] as const){
    const value=text[kind],origin=position[kind],surfaceLeft=origin.x-1,width=800-surfaceLeft;
    this.place(element,surfaceLeft-position.buttonLeft,origin.y-spec.drawTop-position.buttonTop,width);
    labels.push(this.literal(element,value,width,1));
   }
  }
  if(labels.length)void this.paint(labels,serverName,slots,revision);
 }
 private place(element:HTMLElement,left:number,top:number,width:number){
  element.classList.add('native-selection-label');
  Object.assign(element.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${spec.height}px`});
 }
 private literal(element:HTMLElement,text:string,width:number,left:number):Label{
  element.textContent='';element.setAttribute('aria-label',text);
  const literal=element.ownerDocument.createElement('span');literal.className='native-selection-literal';literal.textContent=text;element.append(literal);
  this.elements.push(element);return {element,text,width,left};
 }
 private current(revision:number){return revision===this.revision&&this.root.isConnected&&this.scene.isConnected&&!this.root.hidden&&!this.scene.hidden&&this.root.dataset.authScene==='select';}
 private async paint(labels:Label[],serverName:string,slots:SlotLabels[],revision:number){
  try{
   const font=await loadNativeUiFont(spec.font);await font.prepare(labels.map(label=>label.text).join('\n'));
   if(!this.current(revision)||labels.some(label=>!label.element.isConnected))return;
   const canvases=labels.map(label=>{
    const canvas=label.element.ownerDocument.createElement('canvas');canvas.className='native-selection-glyph';canvas.setAttribute('aria-hidden','true');
    const left=label.element===this.title?spec.title.centerX-Math.floor(font.measure(label.text)/2):label.left;
    font.paint(canvas,label.text,{width:label.width,height:spec.height,left,top:spec.drawTop,lineHeight:spec.height,color:spec.color,outline:spec.outline});return canvas;
   });
   if(!this.current(revision)||labels.some(label=>!label.element.isConnected))return;
   labels.forEach((label,index)=>label.element.append(canvases[index]));
  }catch(error){
   if(!this.current(revision)||labels.some(label=>!label.element.isConnected))return;
   const button=this.scene.ownerDocument.createElement('button');button.type='button';button.className='native-selection-label-retry';button.textContent='重试文字';button.title=error instanceof Error?error.message:'原客户端选角文字载入失败，请重试';button.setAttribute('aria-label',button.title+'，重试文字');button.disabled=this.root.dataset.authBusy==='true';
   button.onclick=()=>{
    if(!this.current(revision)||this.root.dataset.authBusy==='true')return;
    // Restore the literal source before rebuilding; neither a retry nor graphics decides character data.
    for(const label of labels)label.element.textContent=label.text;
    this.show(serverName,slots);
   };
   this.retry=button;this.scene.append(button);
  }
 }
}
