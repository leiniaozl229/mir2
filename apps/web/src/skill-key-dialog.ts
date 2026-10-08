import {applyNationalUiFrame,loadClassicUiSession,retryClassicUiSession,type ClassicUiSession,type Frame} from './classic-ui';
import type {MagicSkill} from './skills';
import iconUsage from '../../../content/classic-176/icon-usage.json';
import contract from '../../../content/classic-176/skill-key-dialog.json';
import './skill-key-dialog.css';

export type SkillKeyDialogResult=number|'interrupted';
export type SkillKeyDialogOptions={loadSession?:()=>Promise<ClassicUiSession>;retrySession?:()=>Promise<ClassicUiSession>;onVisibilityChange?:(open:boolean)=>void};
type Choice={button:HTMLButtonElement;image:HTMLImageElement;key:number;normalFrame:number;activeFrame:number;pressed:boolean;ignoreClick:boolean};
type Request={skill:MagicSkill;resolve:(value:SkillKeyDialogResult)=>void};
const validKey=(key:number)=>key===0||Number.isInteger(key)&&key>=49&&key<=56;

/** Native modal chooses a draft. Only SkillBar's server-confirmed snapshot can change a binding. */
export class SkillKeyDialogController {
 private readonly document:Document;private readonly overlay:HTMLDivElement;private readonly panel:HTMLElement;
 private readonly title:HTMLElement;private readonly icon:HTMLImageElement;private readonly ok:HTMLButtonElement;
 private readonly status:HTMLElement;private readonly retry:HTMLButtonElement;private readonly choices:Choice[]=[];
 private readonly removers:(()=>void)[]=[];private readonly handled=new WeakSet<Event>();private readonly images=new Map<string,Promise<void>>();
 private active:Request|undefined;private draft=0;private epoch=0;private session:ClassicUiSession|undefined;
 private press:{choice?:Choice;button:HTMLButtonElement;pointerId:number}|undefined;private ignoreOk=false;
 private restoreFocus:HTMLElement|null=null;private destroyed=false;
 constructor(layer:HTMLElement,private readonly options:SkillKeyDialogOptions={}){
  this.document=layer.ownerDocument;
  this.overlay=this.document.createElement('div');this.overlay.className='classic-skill-key-overlay';this.overlay.hidden=true;
  this.panel=this.document.createElement('section');this.panel.className='classic-skill-key-dialog';this.panel.tabIndex=-1;
  this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-modal','true');this.panel.setAttribute('aria-label','技能快捷键设置');
  Object.assign(this.panel.style,{left:`${contract.dialog.x}px`,top:`${contract.dialog.y}px`,width:`${contract.dialog.width}px`,height:`${contract.dialog.height}px`});
  this.title=this.document.createElement('div');this.title.className='skill-key-dialog-title';this.place(this.title,contract.title);
  Object.assign(this.title.style,{fontFamily:contract.typography.fontFamily,fontSize:`${contract.typography.fontSize}px`,lineHeight:`${contract.typography.lineHeight}px`,color:contract.typography.color});
  this.icon=this.document.createElement('img');this.icon.className='skill-key-dialog-icon';this.icon.alt='';this.place(this.icon,contract.icon);this.icon.hidden=true;
  this.panel.append(this.title,this.icon);
  for(const spec of contract.choices){
   const button=this.document.createElement('button');button.type='button';button.className='skill-key-dialog-choice';button.dataset.skillKey=String(spec.key);button.setAttribute('aria-label',spec.label);this.place(button,spec);
   const image=this.document.createElement('img');image.alt='';image.width=spec.width;image.height=spec.height;image.hidden=true;button.append(image);
   const choice:Choice={button,image,key:spec.key,normalFrame:spec.normalFrame,activeFrame:spec.activeFrame,pressed:false,ignoreClick:false};this.choices.push(choice);this.panel.append(button);this.bindPointer(button,choice);
   this.listen(button,'click',event=>{if(!this.active||button.disabled||choice.ignoreClick&&(event as MouseEvent).detail!==0)return;this.draft=choice.key;this.paintChoices();});
  }
  this.ok=this.document.createElement('button');this.ok.type='button';this.ok.className='skill-key-dialog-ok';this.ok.setAttribute('aria-label','确定');this.place(this.ok,contract.ok);this.panel.append(this.ok);this.bindPointer(this.ok);
  this.listen(this.ok,'click',event=>{if(this.active&&!this.ok.disabled&&!(this.ignoreOk&&(event as MouseEvent).detail!==0))this.finish(this.draft);});
  this.status=this.document.createElement('div');this.status.className='skill-key-dialog-status';this.status.setAttribute('role','status');
  this.retry=this.document.createElement('button');this.retry.type='button';this.retry.className='skill-key-dialog-retry';this.retry.textContent='重试界面';this.retry.hidden=true;
  this.panel.append(this.status,this.retry);this.overlay.append(this.panel);layer.append(this.overlay);
  this.listen(this.retry,'click',()=>void this.loadSkin(true));
  this.listen(this.document,'keydown',event=>this.interceptKey(event as KeyboardEvent),true);
  this.listen(this.document,'keyup',event=>{if(this.active){event.preventDefault();event.stopImmediatePropagation();}},true);
  this.listen(this.document,'focusin',event=>{if(this.active&&!this.panel.contains(event.target as Node))this.panel.focus();},true);
  this.listen(this.overlay,'pointerdown',event=>{if(event.target===this.overlay){event.preventDefault();this.panel.focus();}});
  if(this.document.defaultView)this.listen(this.document.defaultView,'blur',()=>this.interrupt());
  this.listen(this.document,'visibilitychange',()=>{if(this.document.hidden)this.interrupt();});
 }
 isOpen(){return Boolean(this.active);}
 show(skill:MagicSkill):Promise<SkillKeyDialogResult>{
  if(this.destroyed)return Promise.resolve('interrupted');
  this.interrupt();this.restoreFocus=this.document.activeElement instanceof HTMLElement?this.document.activeElement:null;
  this.draft=validKey(skill.key)?skill.key:0;this.title.textContent=`${skill.name}${contract.title.suffix}`;
  this.overlay.hidden=false;this.panel.dataset.resourceState='loading';this.panel.style.backgroundImage='none';this.icon.hidden=true;this.status.textContent='';this.retry.hidden=true;this.session=undefined;
  for(const choice of this.choices){choice.ignoreClick=false;choice.image.hidden=true;choice.button.disabled=true;}this.ok.disabled=true;this.ignoreOk=false;
  const promise=new Promise<SkillKeyDialogResult>(resolve=>{this.active={skill:{...skill},resolve};});
  this.panel.focus();this.visibilityChanged(true);void this.loadSkin(false);return promise;
 }
 /** The installed client ignores Escape and Enter; both must also stay out of the world. */
 interceptKey(event:KeyboardEvent){
  if(this.handled.has(event))return true;if(!this.active)return false;
  this.handled.add(event);event.preventDefault();event.stopImmediatePropagation();
  if(event.key==='Tab'&&!event.isComposing){const controls=[...this.choices.map(choice=>choice.button),this.ok,this.retry].filter(button=>!button.disabled&&!button.hidden);if(controls.length){const at=controls.indexOf(this.document.activeElement as HTMLButtonElement);controls[(at+(event.shiftKey?-1:1)+controls.length)%controls.length].focus();}}
  return true;
 }
 interrupt(){if(this.active)this.finish('interrupted');}
 destroy(){if(this.destroyed)return;this.interrupt();this.destroyed=true;++this.epoch;for(const remove of this.removers.splice(0))remove();this.overlay.remove();this.images.clear();}
 private finish(value:SkillKeyDialogResult){
  const request=this.active;if(!request)return;this.active=undefined;++this.epoch;this.cancelPress();this.overlay.hidden=true;this.visibilityChanged(false);request.resolve(value);
  const focus=this.restoreFocus;this.restoreFocus=null;if(focus?.isConnected&&!focus.closest('[hidden]'))focus.focus();
 }
 private place(element:HTMLElement,box:{x:number;y:number;width:number;height:number}){Object.assign(element.style,{left:`${box.x}px`,top:`${box.y}px`,width:`${box.width}px`,height:`${box.height}px`});}
 private listen(target:EventTarget,type:string,fn:EventListener,capture=false){target.addEventListener(type,fn,capture);this.removers.push(()=>target.removeEventListener(type,fn,capture));}
 private visibilityChanged(open:boolean){try{this.options.onVisibilityChange?.(open);}catch{}}
 private inRange(button:HTMLElement,event:PointerEvent){const box=button.getBoundingClientRect();return event.clientX>=box.left&&event.clientX<box.right&&event.clientY>=box.top&&event.clientY<box.bottom;}
 private bindPointer(button:HTMLButtonElement,choice?:Choice){
  this.listen(button,'pointerdown',event=>{const pointer=event as PointerEvent;if(!this.active||button.disabled||pointer.button!==0)return;
   this.cancelPress();if(choice){choice.ignoreClick=false;choice.pressed=true;}else this.ignoreOk=false;this.press={button,choice,pointerId:pointer.pointerId};try{button.setPointerCapture(pointer.pointerId);}catch{}this.paintChoices();
  });
  this.listen(button,'pointermove',event=>{const pointer=event as PointerEvent;if(this.press?.button!==button||this.press.pointerId!==pointer.pointerId)return;if(choice){choice.pressed=Boolean(pointer.buttons&1)&&this.inRange(button,pointer);this.paintChoices();}});
  this.listen(button,'pointerup',event=>{const pointer=event as PointerEvent;if(this.press?.button!==button||this.press.pointerId!==pointer.pointerId)return;const outside=!this.inRange(button,pointer);if(choice)choice.ignoreClick=outside;else this.ignoreOk=outside;this.cancelPress();});
  for(const type of ['pointercancel','lostpointercapture'])this.listen(button,type,()=>{if(this.press?.button!==button)return;if(choice)choice.ignoreClick=true;else this.ignoreOk=true;this.cancelPress();});
 }
 private cancelPress(){const press=this.press;this.press=undefined;if(press?.choice)press.choice.pressed=false;if(press)try{if(press.button.hasPointerCapture?.(press.pointerId))press.button.releasePointerCapture(press.pointerId);}catch{}this.paintChoices();}
 private paintChoices(){
  for(const choice of this.choices){const selected=choice.key!==0&&this.draft===choice.key;choice.button.setAttribute('aria-pressed',String(this.draft===choice.key));
   const active=selected||choice.pressed;choice.image.hidden=!this.session||!active;
   if(this.session&&active){const frame=this.frame(active?choice.activeFrame:choice.normalFrame);choice.image.src=`/ui-national/prguse/${frame.file}`;choice.image.style.left=`${contract.selectedOffset.x}px`;choice.image.style.top=`${contract.selectedOffset.y}px`;}
  }
 }
 private frame(index:number):Frame{
  const library=this.session?.national.get('prguse'),frame=library?.frames[String(index)];const locked=(contract.frames as Record<string,Frame>)[String(index)];
  if(!library||library.sourceSha256!==contract.sourceSha256||library.indexSha256!==contract.indexSha256||!frame||!locked||frame.file!==locked.file||frame.width!==locked.width||frame.height!==locked.height||frame.offsetX!==locked.offsetX||frame.offsetY!==locked.offsetY)throw new Error('技能界面素材不匹配');return frame;
 }
 private probe(family:string,frame:Frame){
  if(!frame.file||frame.file.includes('..')||frame.file.startsWith('/'))return Promise.reject(new Error('技能界面素材不匹配'));
  const url=`/ui-national/${family}/${frame.file}`,existing=this.images.get(url);if(existing)return existing;
  const promise=new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth===frame.width&&image.naturalHeight===frame.height?resolve():reject(new Error('技能界面素材不匹配'));image.onerror=()=>reject(new Error('技能界面素材暂缺'));image.src=url;});
  this.images.set(url,promise);void promise.catch(()=>{if(this.images.get(url)===promise)this.images.delete(url);});return promise;
 }
 private async loadSkin(retry:boolean){
  const request=this.active;if(!request)return;const epoch=++this.epoch;this.retry.hidden=true;
  try{
   const session=await (retry?(this.options.retrySession??retryClassicUiSession)():(this.options.loadSession??loadClassicUiSession)());
   if(this.active!==request||epoch!==this.epoch)return;this.session=session;
   const frame=this.frame(contract.dialog.frame),frames=[frame,...this.choices.map(choice=>this.frame(choice.activeFrame))];
   const iconIndex=request.skill.effect*iconUsage.skills.normalMultiplier,icon=session.national.get('magic-icons')?.frames[String(iconIndex)];
   if(!Number.isInteger(iconIndex)||!icon||icon.width!==contract.icon.width||icon.height!==contract.icon.height)throw new Error('技能图标暂缺');
   await Promise.all([...frames.map(frame=>this.probe('prguse',frame)),this.probe('magic-icons',icon)]);
   if(this.active!==request||epoch!==this.epoch||this.destroyed)return;
   applyNationalUiFrame(this.panel,'prguse',frame);this.icon.src=`/ui-national/magic-icons/${icon.file}`;this.icon.hidden=false;this.panel.dataset.resourceState='ready';this.status.textContent='';this.ok.disabled=false;for(const choice of this.choices)choice.button.disabled=false;this.paintChoices();
  }catch{
   if(this.active!==request||epoch!==this.epoch||this.destroyed)return;this.session=undefined;this.panel.dataset.resourceState='failed';this.panel.style.backgroundImage='none';this.icon.hidden=true;this.status.textContent='技能界面素材暂缺';this.retry.hidden=false;this.ok.disabled=true;for(const choice of this.choices){choice.button.disabled=true;choice.image.hidden=true;}
  }
 }
}
