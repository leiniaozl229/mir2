import contract from '../../../content/classic-176/selection-actions.json';
import {createNativeUiArtLoader} from './native-ui-art';

const spec=contract.portraits.idle;
const loadFrames=createNativeUiArtLoader(spec.art,'chrsel','选角人物');

/** Selected-character idle only; native selection transitions/glow have separate evidence gates. */
export class NativeSelectionPortrait{
 private revision=0;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private canvas:HTMLCanvasElement|undefined;
 private retry:HTMLButtonElement|undefined;
 constructor(private readonly root:HTMLElement,private readonly portrait:HTMLImageElement){globalThis.addEventListener?.('pagehide',()=>this.stop());}
 stop(){
  ++this.revision;if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;
  this.canvas?.remove();this.canvas=undefined;this.retry?.remove();this.retry=undefined;this.portrait.style.visibility='';
 }
 start(job:number,sex:number){
  this.stop();if(!this.active())return;
  const revision=this.revision;this.portrait.style.visibility='hidden';
  void this.prepare(job,sex,revision);
 }
 private active(){return this.root.isConnected&&this.portrait.isConnected&&!this.root.hidden&&this.root.dataset.authScene==='select'&&!this.portrait.hidden;}
 private current(revision:number){return revision===this.revision&&this.active();}
 private async prepare(job:number,sex:number,revision:number){
  try{
   if(![0,1,2].includes(job)||![0,1].includes(sex))throw new Error('原客户端人物职业或性别无效');
   const base=spec.baseFrame+job*spec.jobStride+sex*spec.sexStride;
   const indices=Array.from({length:spec.frameCount},(_,i)=>base+i),frames=await loadFrames(indices);
   if(!this.current(revision))return;
   const canvas=this.portrait.ownerDocument.createElement('canvas'),frame=spec.art.frames[String(base) as keyof typeof spec.art.frames];
   canvas.className='native-selection-portrait';canvas.width=frame.width;canvas.height=frame.height;canvas.setAttribute('aria-hidden','true');
   Object.assign(canvas.style,{left:this.portrait.style.left,top:this.portrait.style.top,width:`${frame.width}px`,height:`${frame.height}px`});
   const context=canvas.getContext('2d');if(!context)throw new Error('原客户端选角人物绘制不可用，请重试');context.imageSmoothingEnabled=false;
   this.canvas=canvas;this.portrait.parentElement!.append(canvas);let index=0;
   const paint=()=>{context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(frames.get(indices[index])!,0,0);canvas.dataset.nativePortraitFrame=String(indices[index]);};
   const advance=()=>{
    this.timer=undefined;if(!this.current(revision)){this.stop();return;}
    index=(index+1)%spec.frameCount;paint();this.timer=setTimeout(advance,spec.timerDelayMs);
   };
   paint();this.timer=setTimeout(advance,spec.timerDelayMs);
  }catch(error){
   if(!this.current(revision))return;
   const button=this.portrait.ownerDocument.createElement('button');button.type='button';button.className='native-selection-portrait-retry';button.textContent='重试人物显示';button.title=error instanceof Error?error.message:'原客户端选角人物载入失败';button.setAttribute('aria-label',button.title+'，重试人物显示');
   Object.assign(button.style,{left:this.portrait.style.left,top:this.portrait.style.top});button.onclick=()=>{if(this.current(revision))this.start(job,sex);};this.retry=button;this.portrait.parentElement!.append(button);
  }
 }
}
