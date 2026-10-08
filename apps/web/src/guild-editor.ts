import {applyNationalUiFrame,loadClassicUiSession,uiFrame} from './classic-ui';
import './guild-editor.css';

export type GuildEditKind='notice'|'ranks';
export type GuildEditRequest={kind:GuildEditKind;value:string;restoreFocus?:HTMLElement|null;hint?:string};
export type GuildEditorOptions={save:(kind:GuildEditKind,value:string)=>string|void;loadSession?:typeof loadClassicUiSession};
export type GuildRankDraft={no:number;name:string;members:string[]};

export function parseGuildRankDraft(value:string):{ranks:GuildRankDraft[];error?:string}{
 const lines=value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
 if(!lines.length)return{ranks:[],error:'至少填写一个封号'};
 const ranks:GuildRankDraft[]=[];
 let current:GuildRankDraft|undefined;
 for(const line of lines){
  const header=/^#(\d+)\s+<([^<>]+)>$/.exec(line);
  if(header){
   const no=Number(header[1]),name=header[2];
   if(!Number.isInteger(no)||no<1||no>99||name.length>30||/[\r\n\u0000-\u001f]/.test(name))return{ranks:[],error:'封号格式应为：#编号 <封号>，封号最多 30 字'};
   if(ranks.length>=20)return{ranks:[],error:'封号最多配置 20 项'};
   current={no,name,members:[]};ranks.push(current);continue;
  }
  if(!current)return{ranks:[],error:'每个封号须以 #编号 <封号> 开始'};
  if(line.length>10||!/^[\p{L}\p{N}]+$/u.test(line))return{ranks:[],error:'成员名须为 1–10 位字母或数字'};
  current.members.push(line);
 }
 return{ranks};
}

/** The original client edits notices and rank assignments in the same Prguse#204 memo. */
export class GuildEditor {
 private readonly overlay:HTMLDivElement;
 private readonly panel:HTMLElement;
 private readonly memo:HTMLTextAreaElement;
 private readonly hint:HTMLElement;
 private readonly ok:HTMLButtonElement;
 private readonly closeButton:HTMLButtonElement;
 private readonly removers:(()=>void)[]=[];
 private request:GuildEditRequest|undefined;
 private restoreTarget:HTMLElement|null=null;
 private skinEpoch=0;

 constructor(layer:HTMLElement,private readonly surface:HTMLElement,private readonly options:GuildEditorOptions){
  const document=layer.ownerDocument;
  this.overlay=document.createElement('div');this.overlay.className='guild-editor-overlay';this.overlay.hidden=true;this.overlay.dataset.guildEditor='true';
  this.panel=document.createElement('section');this.panel.className='guild-editor';this.panel.tabIndex=-1;this.panel.setAttribute('role','dialog');this.panel.setAttribute('aria-modal','true');
  this.memo=document.createElement('textarea');this.memo.className='guild-editor-memo';this.memo.setAttribute('aria-label','行会公告或封号配置');this.memo.spellcheck=false;
  this.hint=document.createElement('p');this.hint.className='guild-editor-hint';this.hint.id=`guild-editor-hint-${++GuildEditor.nextId}`;this.hint.setAttribute('role','status');this.panel.setAttribute('aria-describedby',this.hint.id);
  this.ok=document.createElement('button');this.ok.type='button';this.ok.className='guild-editor-ok';this.ok.setAttribute('aria-label','确定保存');this.ok.textContent='确定保存';
  this.closeButton=document.createElement('button');this.closeButton.type='button';this.closeButton.className='guild-editor-close';this.closeButton.setAttribute('aria-label','关闭并取消');this.closeButton.textContent='关闭并取消';
  this.panel.append(this.memo,this.hint,this.ok,this.closeButton);this.overlay.append(this.panel);layer.append(this.overlay);
  this.listen(this.ok,'click',()=>this.submit());this.listen(this.closeButton,'click',()=>this.close());
  this.listen(this.memo,'keydown',event=>{const key=event as KeyboardEvent;if(key.key==='Tab'){key.preventDefault();(key.shiftKey?this.closeButton:this.ok).focus();}});
  this.listen(this.overlay,'keydown',event=>{const key=event as KeyboardEvent;if(key.key==='Escape'){key.preventDefault();key.stopImmediatePropagation();this.close();}else if(key.key==='Tab'){key.preventDefault();(key.shiftKey?this.closeButton:this.memo).focus();}} ,true);
  this.listen(document,'keydown',event=>{if(!this.isOpen())return;event.stopImmediatePropagation();if((event as KeyboardEvent).key==='Escape'){event.preventDefault();this.close();}},true);
  this.listen(document,'keyup',event=>{if(this.isOpen()){event.preventDefault();event.stopImmediatePropagation();}},true);
  this.listen(document,'focusin',event=>{if(this.isOpen()&&!this.panel.contains(event.target as Node))this.memo.focus();},true);
 }
 private static nextId=0;
 private listen(target:EventTarget,type:string,listener:EventListenerOrEventListenerObject,capture=false){target.addEventListener(type,listener,capture);this.removers.push(()=>target.removeEventListener(type,listener,capture));}
 isOpen(){return Boolean(this.request);}
 open(request:GuildEditRequest){
  if(this.isOpen())return false;
  this.request=request;this.restoreTarget=request.restoreFocus===undefined?this.activeElement():request.restoreFocus;
  this.panel.setAttribute('aria-label',request.kind==='notice'?'编辑行会公告':'编辑行会封号');
  this.memo.maxLength=request.kind==='notice'?500:5000;this.memo.value=request.value;this.memo.scrollTop=0;this.hint.textContent=request.hint??(request.kind==='notice'?'编辑行会公告':'格式：编号|封号|成员1,成员2');
  this.overlay.hidden=false;this.memo.focus();this.memo.setSelectionRange(this.memo.value.length,this.memo.value.length);
  void this.loadSkin(++this.skinEpoch);return true;
 }
 close(){
  if(!this.request)return false;
  this.request=undefined;this.overlay.hidden=true;this.skinEpoch++;
  const target=this.restoreTarget;this.restoreTarget=null;if(target?.isConnected&&!target.matches(':disabled'))target.focus();return true;
 }
 cancel(){return this.close();}
 interceptKey(event:KeyboardEvent){
  if(!this.isOpen())return false;
  event.stopImmediatePropagation();
  if(event.key==='Escape'){event.preventDefault();this.close();return true;}
  if(event.key==='Tab'){event.preventDefault();(event.shiftKey?this.closeButton:this.ok).focus();return true;}
  return true;
 }
 private submit(){
  const request=this.request;if(!request)return;
  const error=this.options.save(request.kind,this.memo.value);
  if(error){this.hint.textContent=error;this.memo.focus();return;}
  this.close();
 }
 private activeElement(){const active=this.panel.ownerDocument.activeElement;return active instanceof HTMLElement?active:null;}
 private async loadSkin(epoch:number){
  try{
   const session=await (this.options.loadSession??loadClassicUiSession)();
   if(epoch!==this.skinEpoch||!this.request)return;
   const library=session.national.get('prguse');if(!library){this.hint.textContent='行会编辑界面素材未载入，仍可编辑';return;}
   const panel=uiFrame(library,204),ok=uiFrame(library,361),close=uiFrame(library,64);
   applyNationalUiFrame(this.panel,'prguse',panel);applyNationalUiFrame(this.ok,'prguse',ok);applyNationalUiFrame(this.closeButton,'prguse',close);
  }catch{if(epoch===this.skinEpoch&&this.request)this.hint.textContent='行会编辑界面素材未载入，仍可编辑';}
 }
 destroy(){this.close();this.removers.splice(0).forEach(remove=>remove());this.overlay.remove();}
}
