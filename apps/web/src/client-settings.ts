import {applyNationalUiFrame,loadClassicUiSession,retryClassicUiSession,type ClassicUiSession,type Frame} from './classic-ui';
import {makeClassicWindowDraggable} from './window-drag';
import type {AudioPreferences} from './game-audio';
import type {LogoutMode} from './logout';
import contract from '../../../content/classic-176/client-settings.json';
import './client-settings.css';

export type DisplayPreferences={minimapMode:'compact'|'expanded'|'hidden';chatLogVisible:boolean};
export class DisplaySettings {
 private value:DisplayPreferences={minimapMode:'compact',chatLogVisible:true};
 private readonly listeners=new Set<(value:DisplayPreferences)=>void>();
 constructor(){try{const saved=JSON.parse(localStorage.getItem(contract.persistence.display)??'null');if(saved)this.value=this.normalize(saved);}catch{}}
 get(){return {...this.value};}
 set(value:Partial<DisplayPreferences>){const next=this.normalize({...this.value,...value});if(next.minimapMode===this.value.minimapMode&&next.chatLogVisible===this.value.chatLogVisible)return;this.value=next;try{localStorage.setItem(contract.persistence.display,JSON.stringify(next));}catch{}for(const listener of this.listeners)listener(this.get());}
 subscribe(listener:(value:DisplayPreferences)=>void){this.listeners.add(listener);listener(this.get());return ()=>{this.listeners.delete(listener);};}
 private normalize(value:Partial<DisplayPreferences>):DisplayPreferences{return {minimapMode:contract.displayOptions.minimapMode.includes(value.minimapMode??'')?value.minimapMode as DisplayPreferences['minimapMode']:'compact',chatLogVisible:typeof value.chatLogVisible==='boolean'?value.chatLogVisible:true};}
}
export type SettingsAudio={preferences:()=>AudioPreferences;setEnabled:(value:boolean)=>void;setVolumes:(value:Partial<Pick<AudioPreferences,'musicVolume'|'effectsVolume'>>)=>void;subscribe:(listener:(value:AudioPreferences)=>void)=>()=>void};
export type SettingsOptions={audio:SettingsAudio;display:DisplaySettings;logout:(mode:LogoutMode)=>void;canLogout:()=>boolean;onVisibilityChange?:(open:boolean)=>void;loadSession?:()=>Promise<ClassicUiSession>;retrySession?:()=>Promise<ClassicUiSession>};

/** National generic board and exit labels, with explicitly proposed Web settings layout. */
export class ClientSettingsView {
 private readonly overlay:HTMLDivElement;private readonly panel:HTMLElement;private readonly status:HTMLElement;private readonly retry:HTMLButtonElement;
 private readonly enabled:HTMLInputElement;private readonly music:HTMLInputElement;private readonly effects:HTMLInputElement;private readonly map:HTMLSelectElement;private readonly chat:HTMLInputElement;
 private readonly logoutButtons:HTMLButtonElement[]=[];private readonly removers:(()=>void)[]=[];
 private session:ClassicUiSession|undefined;private epoch=0;private destroyed=false;private restore:HTMLElement|null=null;private press:HTMLButtonElement|undefined;
 constructor(layer:HTMLElement,surface:HTMLElement,private readonly options:SettingsOptions){
  const doc=layer.ownerDocument;
  this.overlay=doc.createElement('div');this.overlay.className='client-settings-overlay';this.overlay.hidden=true;
  this.panel=doc.createElement('section');this.panel.className='client-settings-panel';this.panel.dataset.layoutEvidence=contract.panel.layoutEvidence;this.panel.tabIndex=-1;this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-modal','true');this.panel.setAttribute('aria-label','设置');
  Object.assign(this.panel.style,{width:`${contract.panel.width}px`,height:`${contract.panel.height}px`,left:`${contract.panel.x}px`,top:`${contract.panel.y}px`});
  const heading=doc.createElement('strong');heading.textContent='设置';heading.dataset.windowDragHandle='true';heading.className='client-settings-heading';
  const close=doc.createElement('button');close.type='button';close.className='client-settings-close';close.setAttribute('aria-label','关闭设置');close.textContent='关闭';close.onclick=()=>this.hide();
  Object.assign(close.style,{left:`${contract.panel.close.x}px`,top:`${contract.panel.close.y}px`});
  const rows=doc.createElement('div');rows.className='client-settings-options';Object.assign(rows.style,{left:`${contract.panel.textX}px`,top:`${contract.panel.contentY}px`,width:`${contract.panel.contentWidth}px`});
  const input=(label:string,type:string,key:string)=>{const row=doc.createElement('label'),caption=doc.createElement('span'),control=doc.createElement('input');caption.textContent=label;control.type=type;control.dataset.setting=key;row.append(caption,control);rows.append(row);return control;};
  this.enabled=input('声音（F12）','checkbox','enabled');this.music=input('背景音量','range','musicVolume');this.effects=input('效果音量','range','effectsVolume');
  for(const slider of [this.music,this.effects]){slider.min='0';slider.max='100';slider.step='1';}
  const mapRow=doc.createElement('label'),mapLabel=doc.createElement('span');mapLabel.textContent='地图显示';this.map=doc.createElement('select');this.map.dataset.setting='minimapMode';
  for(const [value,text] of [['compact','小地图'],['expanded','大地图'],['hidden','收起']]){const option=doc.createElement('option');option.value=value;option.textContent=text;this.map.append(option);}mapRow.append(mapLabel,this.map);rows.append(mapRow);
  this.chat=input('显示聊天记录','checkbox','chatLogVisible');
  this.enabled.onchange=()=>options.audio.setEnabled(this.enabled.checked);
  this.music.oninput=()=>options.audio.setVolumes({musicVolume:Number(this.music.value)/100});this.effects.oninput=()=>options.audio.setVolumes({effectsVolume:Number(this.effects.value)/100});
  this.map.onchange=()=>options.display.set({minimapMode:this.map.value as DisplayPreferences['minimapMode']});this.chat.onchange=()=>options.display.set({chatLogVisible:this.chat.checked});
  this.status=doc.createElement('div');this.status.className='client-settings-status';this.status.setAttribute('role','status');this.status.textContent='音量和显示选项保存在本机。';
  const note=doc.createElement('small');note.className='client-settings-note';note.textContent='Web 设置布局';
  this.retry=doc.createElement('button');this.retry.type='button';this.retry.className='client-settings-retry';this.retry.textContent='重试界面';this.retry.hidden=true;this.retry.onclick=()=>void this.loadSkin(true);
  this.panel.append(heading,close,rows,this.status,note,this.retry);
  for(const mode of ['reselect','login'] as const){
   const spec=contract.buttons[mode],button=doc.createElement('button'),label=doc.createElement('span');button.type='button';button.dataset.logoutMode=mode;button.className='client-settings-logout';button.setAttribute('aria-label',mode==='reselect'?'重新选择人物（Alt+X）':'返回登录（Alt+Q）');button.textContent=mode==='reselect'?'小退':'大退';
   Object.assign(button.style,{left:`${spec.x}px`,top:`${spec.y}px`,width:`${spec.width}px`,height:`${spec.height}px`});
   label.className='client-settings-logout-label';label.textContent=mode==='reselect'?'重新选择人物':'返回登录';Object.assign(label.style,{left:`${spec.x+34}px`,top:`${spec.y-1}px`});
   button.onclick=()=>{if(this.isOpen()&&options.canLogout())options.logout(mode);};
   const normal=()=>{if(this.press===button)this.press=undefined;this.skinButton(button,mode,false);};
   button.addEventListener('pointerdown',event=>{if(button.disabled||event.button!==0)return;this.press=button;this.skinButton(button,mode,true);});
   button.addEventListener('pointerup',normal);button.addEventListener('pointercancel',normal);button.addEventListener('pointerleave',normal);
   this.panel.append(button,label);this.logoutButtons.push(button);
  }
  this.overlay.append(this.panel);layer.append(this.overlay);makeClassicWindowDraggable(this.panel,surface);
  this.removers.push(options.audio.subscribe(value=>{this.enabled.checked=value.enabled;this.music.value=String(Math.round(value.musicVolume*100));this.effects.value=String(Math.round(value.effectsVolume*100));this.music.setAttribute('aria-valuetext',`${this.music.value}%`);this.effects.setAttribute('aria-valuetext',`${this.effects.value}%`);}),options.display.subscribe(value=>{this.map.value=value.minimapMode;this.chat.checked=value.chatLogVisible;}));
  const blur=()=>{for(const button of this.logoutButtons)this.skinButton(button,button.dataset.logoutMode as LogoutMode,false);this.press=undefined;};doc.defaultView?.addEventListener('blur',blur);this.removers.push(()=>doc.defaultView?.removeEventListener('blur',blur));
  this.overlay.addEventListener('pointerdown',event=>{if(event.target===this.overlay){event.preventDefault();this.panel.focus();}});
 }
 isOpen(){return !this.destroyed&&!this.overlay.hidden;}
 show(){if(this.destroyed)return;this.restore=this.panel.ownerDocument.activeElement as HTMLElement|null;this.overlay.hidden=false;this.refreshAvailability();this.options.onVisibilityChange?.(true);this.enabled.focus();void this.loadSkin(false);}
 hide(restoreFocus=true){if(!this.isOpen())return;this.overlay.hidden=true;++this.epoch;this.press=undefined;this.options.onVisibilityChange?.(false);const target=this.restore;this.restore=null;if(restoreFocus&&target?.isConnected&&!target.closest('[hidden]'))target.focus();}
 refreshAvailability(){for(const button of this.logoutButtons)button.disabled=!this.options.canLogout();}
 interceptKey(event:KeyboardEvent){
  if(!this.isOpen())return false;
  event.stopImmediatePropagation();
  if(event.isComposing||event.keyCode===229)return true;
  if(event.key==='Escape'){event.preventDefault();if(!event.repeat)this.hide();return true;}
  if(event.key==='F12'&&!event.ctrlKey&&!event.altKey&&!event.metaKey){event.preventDefault();if(!event.repeat)this.options.audio.setEnabled(!this.options.audio.preferences().enabled);return true;}
  if(event.altKey&&!event.ctrlKey&&!event.metaKey&&['x','q'].includes(event.key.toLowerCase())){event.preventDefault();if(!event.repeat&&this.options.canLogout())this.options.logout(event.key.toLowerCase()==='x'?'reselect':'login');return true;}
  if(event.key==='Tab'){event.preventDefault();const controls=Array.from(this.panel.querySelectorAll<HTMLElement>('button,input,select')).filter(element=>!element.hidden&&!(element as HTMLButtonElement).disabled&&!element.closest('[hidden]'));const current=controls.indexOf(this.panel.ownerDocument.activeElement as HTMLElement),index=(current+(event.shiftKey?-1:1)+controls.length)%controls.length;controls[index]?.focus();return true;}
  // Focused controls keep their native editing/activation; all world handlers stop here.
  if(/^F\d+$/.test(event.key))event.preventDefault();return true;
 }
 destroy(){if(this.destroyed)return;this.hide(false);this.destroyed=true;++this.epoch;for(const remove of this.removers)remove();this.overlay.remove();}
 private skinButton(button:HTMLButtonElement,mode:LogoutMode,pressed:boolean){if(!this.session)return;const index=pressed?contract.buttons[mode].pressedFrame:contract.buttons[mode].normalFrame,frame=this.session.national.get(contract.family)?.frames[String(index)];if(this.matchesFrame(index,frame))applyNationalUiFrame(button,contract.family,frame!);}
 private matchesFrame(index:number,frame:Frame|undefined){const expected=(contract.frames as Record<string,Frame>)[String(index)];return Boolean(frame&&expected&&frame.file===expected.file&&frame.width===expected.width&&frame.height===expected.height);}
 private async loadSkin(retry:boolean){
  const epoch=++this.epoch;this.retry.hidden=true;
  try{
   const session=await(retry?(this.options.retrySession??retryClassicUiSession)():(this.options.loadSession??loadClassicUiSession)());
   const library=session.national.get(contract.family);
   if(!library||library.sourceSha256!==contract.sourceSha256||library.indexSha256!==contract.indexSha256||Object.keys(contract.frames).some(key=>!this.matchesFrame(Number(key),library.frames[key])))throw new Error('skin');
   await Promise.all(Object.keys(contract.frames).map(key=>new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>{const expected=(contract.frames as Record<string,Frame>)[key];image.naturalWidth===expected.width&&image.naturalHeight===expected.height?resolve():reject(new Error('image'));};image.onerror=()=>reject(new Error('image'));image.src=`/ui-national/${contract.family}/${library.frames[key].file}`;})));
   if(epoch!==this.epoch||!this.isOpen())return;
   this.session=session;applyNationalUiFrame(this.panel,contract.family,library.frames[String(contract.panel.frame)]);this.panel.dataset.skinState='national';
   const close=this.panel.querySelector<HTMLElement>('.client-settings-close');if(close){applyNationalUiFrame(close,contract.family,library.frames[String(contract.panel.close.frame)]);close.dataset.skinState='national';}
   for(const button of this.logoutButtons){this.skinButton(button,button.dataset.logoutMode as LogoutMode,false);button.dataset.skinState='national';}
   this.status.textContent='音量和显示选项保存在本机。';
  }catch{
   if(epoch!==this.epoch||!this.isOpen())return;this.session=undefined;this.panel.dataset.skinState='unavailable';this.panel.style.backgroundImage='none';for(const button of this.logoutButtons){button.style.backgroundImage='none';button.dataset.skinState='unavailable';}
   this.status.textContent='界面暂未加载，设置仍可使用。';this.retry.hidden=false;
  }
 }
}
