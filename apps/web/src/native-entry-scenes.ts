import contract from '../../../content/classic-176/entry-scenes.json';
import {loadClassicUiSession,retryClassicUiSession,nationalUiUrl,type Library,type Frame} from './classic-ui';
import {bindNativeFrameButtonStates} from './native-frame-button';
import {loadNativeUiFont} from './native-ui-font';
import './native-entry-scenes.css';

export type LoginServer={name:string;status:string;routable?:boolean};
type Scene='servers'|'notice';
type LockedSource={sourceSha256:string;indexSha256:string;frames:Record<string,Frame&{sha256:string}>};
const locks=contract.sources as Record<string,LockedSource>;

function place(element:HTMLElement,left:number,top:number,width?:number,height?:number){
 element.style.left=`${left}px`;element.style.top=`${top}px`;
 if(width!==undefined)element.style.width=`${width}px`;
 if(height!==undefined)element.style.height=`${height}px`;
}

/** Shared original-client pre-world scenes. No character/map data is fabricated here. */
export class NativeEntryScenes{
 private readonly scene:HTMLDivElement;
 private readonly panel:HTMLDivElement;
 private readonly content:HTMLDivElement;
 private readonly close:HTMLButtonElement;
 private readonly confirm:HTMLButtonElement;
 private libraries=new Map<string,Library>();
 private loadTask:Promise<void>|undefined;
 private retry=false;
 private revision=0;
 private active:Scene|undefined;
 private pending=false;
 private noticeId:number|undefined;
 private choose:(name:string)=>void=()=>{};
 private exit:()=>void=()=>{};
 private acknowledge:(noticeId:number)=>void=()=>{};

 constructor(private readonly root:HTMLElement){
  const document=root.ownerDocument;
  this.scene=document.createElement('div');this.scene.className='auth-scene native-entry-scene';this.scene.hidden=true;
  this.panel=document.createElement('div');this.panel.className='native-entry-panel';
  this.content=document.createElement('div');this.content.className='native-entry-content';
  this.close=document.createElement('button');this.close.type='button';this.close.className='native-entry-close';this.close.setAttribute('aria-label','退出服务器选择');
  this.confirm=document.createElement('button');this.confirm.type='button';this.confirm.className='native-entry-confirm';this.confirm.setAttribute('aria-label','确定');
  this.close.addEventListener('click',()=>{if(this.active==='servers')this.exit();});
  this.confirm.addEventListener('click',()=>this.confirmNotice());
  this.scene.addEventListener('keydown',event=>{
   if(!this.active)return;
   const key=event as KeyboardEvent;
   if(key.key!=='Enter'&&key.key!=='Escape')return;
   key.preventDefault();key.stopImmediatePropagation();
   if(key.repeat||key.isComposing||key.keyCode===229)return;
   if(this.active==='notice'&&key.key==='Enter')this.confirmNotice();
  },true);
  this.panel.append(this.content,this.close,this.confirm);this.scene.append(this.panel);root.append(this.scene);
 }

 private frame(family:string,index:number){
  const library=this.libraries.get(family),locked=locks[family]?.frames[String(index)];
  const frame=library?.frames[String(index)] as (Frame&{sha256?:string})|undefined;
  if(!library||!locked||library.sourceSha256!==locks[family].sourceSha256||library.indexSha256!==locks[family].indexSha256||
   !frame||frame.file!==locked.file||frame.sha256!==locked.sha256||frame.width!==locked.width||frame.height!==locked.height)
   throw new Error('原客户端主流程素材身份不匹配，请重新导入原素材');
  return frame;
 }

 private ready(){
  if(this.loadTask)return this.loadTask;
  const task=(this.retry?retryClassicUiSession():loadClassicUiSession()).then(async session=>{
   this.libraries=session.national;
   const images:Promise<void>[]=[];
   for(const [family,source] of Object.entries(locks))for(const index of Object.keys(source.frames)){
    const frame=this.frame(family,Number(index));
    images.push(new Promise((resolve,reject)=>{
     const image=new Image();image.onload=()=>{
      if(image.naturalWidth!==frame.width||image.naturalHeight!==frame.height)reject(new Error('原客户端主流程素材尺寸不匹配'));
      else resolve();
     };image.onerror=()=>reject(new Error('原客户端主流程素材载入失败'));image.src=nationalUiUrl(family,frame);
    }));
   }
   await Promise.all(images);this.retry=false;
  }).catch(error=>{if(this.loadTask===task)this.loadTask=undefined;this.retry=true;throw error;});
  this.loadTask=task;return task;
 }

 private async begin(scene:Scene,text:string){
  const revision=++this.revision;this.active=scene;this.pending=true;this.scene.hidden=false;
  this.scene.dataset.entryScene=scene;this.scene.setAttribute('aria-busy','true');
  this.panel.hidden=true;this.content.replaceChildren();this.close.hidden=true;this.confirm.hidden=true;
  const profile=scene==='servers'?contract.serverSelection.button.text.fontProfile:contract.entryNotice.text.fontProfile;
  const [,font]=await Promise.all([this.ready(),loadNativeUiFont(profile)]);
  await font.prepare(text);
  if(this.revision!==revision||this.active!==scene)return false;
  return font;
 }

 async showServers(servers:LoginServer[],handlers:{choose:(name:string)=>void;exit:()=>void}){
  if(!Array.isArray(servers)||!servers.length||servers.length>64||servers.some(server=>!server||typeof server.name!=='string'||!server.name||typeof server.status!=='string')||new Set(servers.map(server=>server.name)).size!==servers.length)
   throw new Error('服务器列表无效，请重新登录');
  this.choose=handlers.choose;this.exit=handlers.exit;this.acknowledge=()=>{};this.noticeId=undefined;
  const font=await this.begin('servers',servers.map(server=>server.name).join(''));
  if(!font)return false;
  const revision=this.revision;
  const spec=contract.serverSelection;
  this.scene.style.backgroundImage=`url(${nationalUiUrl(spec.background.family,this.frame(spec.background.family,spec.background.frame))})`;
  this.panel.style.backgroundImage=`url(${nationalUiUrl(spec.panel.family,this.frame(spec.panel.family,spec.panel.frame))})`;
  place(this.panel,spec.panel.left,spec.panel.top,308,450);
  place(this.content,0,0,308,450);this.content.style.whiteSpace='';this.content.style.overflow='';
  place(this.close,spec.close.left,spec.close.top,spec.close.width,spec.close.height);this.close.hidden=false;
  for(let index=0;index<servers.length;index++){
   const server=servers[index],button=this.root.ownerDocument.createElement('button');
   button.type='button';button.className='native-server-button';button.textContent=server.name;button.dataset.serverName=server.name;
   button.style.color='transparent';button.style.textShadow='none';
   const label=this.root.ownerDocument.createElement('canvas');label.className='native-bitmap-label';label.setAttribute('aria-hidden','true');
   font.paint(label,server.name,{width:spec.button.width,height:spec.button.height,
    left:Math.floor((spec.button.width-font.measure(server.name))/2),top:spec.button.text.drawTop,
    lineHeight:spec.button.text.lineHeight,color:spec.button.text.color});
   button.append(label);
   button.dataset.serverAvailable=String(server.routable!==false&&['idle','general','busy'].includes(server.status));
   place(button,spec.button.left,servers.length===1?spec.button.top:Math.max(62,spec.button.top-Math.floor((servers.length-1)/2)*spec.button.rowStep)+index*spec.button.rowStep,spec.button.width,spec.button.height);
   button.addEventListener('click',()=>{
    if(this.revision!==revision||this.active!=='servers'||this.pending||button.dataset.serverAvailable!=='true')return;
    this.setBusy(true);this.choose(server.name);
   });
   bindNativeFrameButtonStates(button,state=>{
    const number=state==='pressed'?spec.button.pressedFrame:spec.button.normalFrame;
    button.style.backgroundImage=`url(${nationalUiUrl(spec.button.family,this.frame(spec.button.family,number))})`;
   });
   this.content.append(button);
  }
  this.content.dataset.multipleServerLayout=servers.length>1?'proposed':'native-runtime';
  if(servers.length>8){this.content.style.overflowY='auto';this.content.style.height='420px';}
  this.panel.hidden=false;this.setBusy(false);this.scene.tabIndex=-1;this.scene.focus();return true;
 }

 async showNotice(noticeId:number,lines:string[],handler:(noticeId:number)=>void){
  if(!Number.isSafeInteger(noticeId)||noticeId<=0||!Array.isArray(lines)||lines.some(line=>typeof line!=='string'))throw new Error('入图公告无效，请重新登录');
  this.noticeId=noticeId;this.acknowledge=handler;this.choose=()=>{};this.exit=()=>{};
  const body=lines.join('\n'),font=await this.begin('notice',body);
  if(!font)return false;
  const spec=contract.entryNotice;
  this.scene.style.backgroundImage='none';this.scene.style.backgroundColor=spec.background;
  this.panel.style.backgroundImage=`url(${nationalUiUrl(spec.panel.family,this.frame(spec.panel.family,spec.panel.frame))})`;
  place(this.panel,spec.panel.left,spec.panel.top,256,359);
  const text=this.content;text.textContent=body;place(text,spec.text.left,spec.text.top,spec.text.width);
  text.style.fontSize=`${spec.text.fontSize}px`;text.style.lineHeight=`${spec.text.lineHeight}px`;text.style.color='transparent';text.style.textShadow='none';text.style.whiteSpace=spec.text.whiteSpace;text.style.overflow=spec.text.overflow;
  text.style.height='auto';text.style.overflowY='';
  const label=this.root.ownerDocument.createElement('canvas');label.className='native-bitmap-label';label.setAttribute('aria-hidden','true');
  label.style.left='-1px';label.style.top='-1px';
  font.paint(label,body,{width:contract.canvas.width-spec.panel.left-spec.text.left+1,height:contract.canvas.height-spec.panel.top-spec.text.top+1,
   left:1,top:1,lineHeight:spec.text.lineHeight,color:spec.text.color});text.append(label);
  place(this.confirm,spec.button.left,spec.button.top,spec.button.width,spec.button.height);this.confirm.hidden=false;
  bindNativeFrameButtonStates(this.confirm,state=>{
   const number=state==='pressed'?spec.button.pressedFrame:spec.button.normalFrame;
   this.confirm.style.backgroundImage=`url(${nationalUiUrl(spec.button.family,this.frame(spec.button.family,number))})`;
  });
  this.panel.hidden=false;this.setBusy(false);this.scene.tabIndex=-1;this.scene.focus();return true;
 }

 private confirmNotice(){
  if(this.active!=='notice'||this.pending||this.noticeId===undefined)return;
  this.setBusy(true);this.acknowledge(this.noticeId);
 }

 setBusy(busy:boolean){
  this.pending=busy;this.scene.setAttribute('aria-busy',String(busy));this.confirm.disabled=busy;
  this.content.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.disabled=busy||button.dataset.serverAvailable!=='true';});
  this.close.disabled=false;
 }

 isOpen(){return this.active!==undefined&&!this.scene.hidden;}
 hide(){++this.revision;this.active=undefined;this.pending=false;this.noticeId=undefined;this.scene.hidden=true;this.choose=()=>{};this.exit=()=>{};this.acknowledge=()=>{};}
}
