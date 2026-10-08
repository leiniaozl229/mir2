import {applyNationalUiFrame,loadClassicUiSession,loadNationalUiLibrary,uiFrame,nationalUiUrl,type Frame} from './classic-ui';
import {NativeSelectionPortrait} from './native-selection-portrait';
import {NativeSelectionLabels} from './native-selection-labels';
import authActions from '../../../content/classic-176/auth-actions.json';
import selectionActions from '../../../content/classic-176/selection-actions.json';
import './password-change.css';
import './account-registration.css';
import {bindNativeFrameButtonStates,type NativeButtonVisualState} from './native-frame-button';
import type {NativeEntryScenes,LoginServer} from './native-entry-scenes';

export type SelectCharacter={name:string;job:number;level:number;sex:number;hair?:number;selected?:boolean};
type NationalLibrary=Awaited<ReturnType<typeof loadNationalUiLibrary>>;
const nationalPortraits:Record<string,number>={'0-0':40,'1-0':80,'2-0':120,'0-1':160,'1-1':200,'2-1':240};
const nationalCreateJobs=[{job:0,normal:74,active:55},{job:1,normal:75,active:56},{job:2,normal:76,active:57}];
const nationalCreateSexes=[{sex:0,normal:77,active:58},{sex:1,normal:78,active:59}];

export class ClassicAuth {
 private nationalLibraries=new Map<string,NationalLibrary>();
 private nationalReady=false;
 private characters:SelectCharacter[]=[];
 private selected=0;
 private job=0;
 private sex=0;
 private onStart:(name:string)=>void=()=>undefined;
 private onCreate:()=>void=()=>undefined;
  private onExit:()=>void=()=>undefined;
  private onDelete:(name:string)=>void=()=>undefined;
  private deleteEnabled=false;
 private readonly loginScene:HTMLElement;
 private readonly selectScene:HTMLElement;
 private readonly createForm:HTMLFormElement;
 private readonly charactersElement:HTMLElement;
 private readonly portrait:HTMLImageElement;
 private readonly portraitAnimation:NativeSelectionPortrait;
 private readonly selectionLabels:NativeSelectionLabels;
 private serverName='';
 private readonly createPortrait:HTMLImageElement;
 private readonly jobInput:HTMLSelectElement;
 private readonly sexInput:HTMLSelectElement;
 private readonly mountTask:Promise<void>;
 private readonly passwordForm:HTMLFormElement|null;
 private readonly registrationForm:HTMLFormElement|null;
 private onPasswordOpen:()=>void=()=>undefined;
 private onPasswordCancel:()=>void=()=>this.showLogin();
 private onRegister:(account:string,password:string)=>void=()=>undefined;
 private passwordSkinEpoch=0;
 private passwordComposing=false;
 private registrationComposing=false;
 private loginComposing=false;
 private entryScenes:NativeEntryScenes|undefined;
 private entryScenesLoad:Promise<NativeEntryScenes>|undefined;
 private entryScenesRevision=0;

 constructor(private readonly root:HTMLElement,private readonly onScene?:(phase:'login'|'select'|'world')=>void){
  this.loginScene=root.querySelector<HTMLElement>('[data-auth-login]')!;
  this.selectScene=root.querySelector<HTMLElement>('[data-auth-select]')!;
  this.createForm=root.querySelector<HTMLFormElement>('#create-character')!;
  this.charactersElement=root.querySelector<HTMLElement>('#characters')!;
  this.portrait=root.querySelector<HTMLImageElement>('[data-auth-portrait]')!;
  this.createPortrait=root.querySelector<HTMLImageElement>('[data-auth-create-portrait]')!;
  this.portraitAnimation=new NativeSelectionPortrait(root,this.portrait);
  this.selectionLabels=new NativeSelectionLabels(root,this.selectScene,root.querySelector<HTMLElement>('[data-auth-select-title]'));
  this.jobInput=root.querySelector<HTMLSelectElement>('#character-job')!;
  this.sexInput=root.querySelector<HTMLSelectElement>('#character-sex')!;
  this.passwordForm=root.querySelector<HTMLFormElement>('#change-password');
  this.registrationForm=root.querySelector<HTMLFormElement>('#register-form');
  const loginForm=root.querySelector<HTMLFormElement>('#login'),loginAccount=root.querySelector<HTMLInputElement>('#account'),loginPassword=root.querySelector<HTMLInputElement>('#password');
  loginForm?.addEventListener('compositionstart',()=>{this.loginComposing=true;});
  loginForm?.addEventListener('compositionend',()=>{this.loginComposing=false;});
  loginForm?.addEventListener('submit',event=>{if(this.loginComposing){event.preventDefault();event.stopImmediatePropagation();}},true);
  loginAccount?.addEventListener('keydown',event=>{
   const keyEvent=event as KeyboardEvent;
   if(keyEvent.key!=='Enter'||this.loginComposing||keyEvent.isComposing||keyEvent.keyCode===229)return;
   keyEvent.preventDefault();keyEvent.stopPropagation();
   if(loginAccount.value.trim())loginPassword?.focus();
  });
  const passwordEntry=root.querySelector<HTMLButtonElement>('#auth-password-change');if(passwordEntry)passwordEntry.style.visibility='hidden';
  root.querySelector<HTMLButtonElement>('#register')?.addEventListener('click',()=>this.showRegistration());
  this.registrationForm?.querySelector<HTMLButtonElement>('[data-registration-cancel]')?.addEventListener('click',()=>this.closeRegistration());
  this.registrationForm?.addEventListener('compositionstart',()=>{this.registrationComposing=true;});
  this.registrationForm?.addEventListener('compositionend',()=>{this.registrationComposing=false;});
  this.registrationForm?.addEventListener('submit',event=>{
   event.preventDefault();
   if(this.registrationComposing||this.root.dataset.authBusy==='true')return;
   this.submitRegistration();
  });
  this.registrationForm?.addEventListener('keydown',event=>{
   const keyEvent=event as KeyboardEvent;
   if(this.registrationComposing||keyEvent.isComposing||keyEvent.keyCode===229)return;
   if(keyEvent.key==='Escape'){keyEvent.preventDefault();keyEvent.stopPropagation();if(this.root.dataset.authBusy!=='true')this.closeRegistration();return;}
   if(keyEvent.key==='Tab'){
    const first=this.registrationField('account'),last=this.registrationForm?.querySelector<HTMLButtonElement>('[data-registration-cancel]');
    if(keyEvent.shiftKey&&keyEvent.target===first&&last){keyEvent.preventDefault();last.focus();}
    else if(!keyEvent.shiftKey&&keyEvent.target===last&&first){keyEvent.preventDefault();first.focus();}
    return;
   }
   if(keyEvent.key!=='Enter')return;
   keyEvent.preventDefault();keyEvent.stopPropagation();
   if(this.root.dataset.authBusy==='true')return;
   const fields=['#register-account','#register-password','#register-confirm'];
   const index=fields.findIndex(selector=>this.registrationForm?.querySelector(selector)===keyEvent.target);
   if(index>=0&&index<fields.length-1)this.registrationForm?.querySelector<HTMLInputElement>(fields[index+1])?.focus();
   else if(index===fields.length-1)this.submitRegistration();
  });
  const openPasswordChange=()=>{if(root.dataset.authBusy==='true')return;this.showPasswordChange();this.onPasswordOpen();};
  root.querySelector<HTMLButtonElement>('#auth-password-change')?.addEventListener('click',openPasswordChange);
  root.querySelector<HTMLButtonElement>('[data-auth-password-entry]')?.addEventListener('click',openPasswordChange);
  root.querySelector<HTMLButtonElement>('[data-password-cancel]')?.addEventListener('click',()=>this.onPasswordCancel());
  this.passwordForm?.addEventListener('compositionstart',()=>{this.passwordComposing=true;});
  this.passwordForm?.addEventListener('compositionend',()=>{this.passwordComposing=false;});
  this.passwordForm?.addEventListener('submit',event=>{if(this.passwordComposing){event.preventDefault();event.stopImmediatePropagation();}},true);
  this.passwordForm?.addEventListener('keydown',event=>{
   if(this.passwordComposing||event.isComposing||event.keyCode===229)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.onPasswordCancel();return;}
   if(event.key!=='Enter')return;
   event.preventDefault();event.stopPropagation();
   if(this.root.dataset.authBusy==='true')return;
   const fields=authActions.changePassword.inputOrder;
   const index=fields.findIndex(field=>this.passwordForm?.querySelector(`[data-password-field="${field}"]`)===event.target);
   this.passwordForm?.querySelector<HTMLInputElement>(`[data-password-field="${fields[(index+1)%fields.length]}"]`)?.focus();
  });
  this.mountTask=this.mount();
 }

 async ready(){await this.mountTask;}

 private async mount(){
  const session=await loadClassicUiSession();
  this.root.querySelector<HTMLButtonElement>('[data-auth-start]')!.onclick=()=>{
   const character=this.characters[this.selected];if(character)this.onStart(character.name);
  };
  this.root.querySelector<HTMLButtonElement>('[data-auth-new]')!.onclick=()=>this.onCreate();
  this.root.querySelector<HTMLButtonElement>('[data-auth-exit]')!.onclick=()=>this.onExit();
  const deleteButton=this.root.querySelector<HTMLButtonElement>('[data-auth-delete]');
  if(deleteButton)deleteButton.onclick=()=>{const name=this.selectedCharacterName();if(name&&this.deleteEnabled&&this.root.dataset.authBusy!=='true'&&this.root.dataset.authScene==='select')this.onDelete(name);};
  this.root.querySelector<HTMLButtonElement>('[data-auth-create-cancel]')!.onclick=()=>this.showSelect(this.characters);
  for(const spec of nationalCreateJobs){
   this.root.querySelector<HTMLButtonElement>(`[data-auth-job="${spec.job}"]`)!.onclick=()=>{this.job=spec.job;this.jobInput.value=String(spec.job);this.renderCreate();};
  }
  for(const spec of nationalCreateSexes){
   this.root.querySelector<HTMLButtonElement>(`[data-auth-sex="${spec.sex}"]`)!.onclick=()=>{this.sex=spec.sex;this.sexInput.value=String(spec.sex);this.renderCreate();};
  }
  const nationalPrguse=session.national.get('prguse'),nationalChrSel=session.national.get('chrsel');
  if(nationalPrguse&&nationalChrSel){
   this.nationalLibraries.set('prguse',nationalPrguse);this.nationalLibraries.set('chrsel',nationalChrSel);this.nationalReady=true;
   this.mountNationalAuth();
   this.renderSlots();
  }else{
   this.nationalReady=false;
  }
  if(!this.nationalReady)throw new Error('缺少仓库原客户端登录素材');
  this.renderCreate();
  await this.mountPasswordChange();
  if(!this.root.dataset.authScene||this.root.dataset.authScene==='login')this.showLogin();
 }

 async retryPasswordChangeSkin(){await this.mountPasswordChange();}
 private async mountPasswordChange(){
  const form=this.passwordForm,entry=this.root.querySelector<HTMLButtonElement>('#auth-password-change');
  if(!form||!entry)return;
  const epoch=++this.passwordSkinEpoch;
  const spec=authActions.changePassword,library=this.nationalLibraries.get('prguse');
  const matches=(index:50|53)=>{
   const locked=authActions.frames[index],frame=library?.frames[String(index)];
   return library?.sourceSha256===authActions.sourceSha256&&library.indexSha256===authActions.indexSha256&&frame?.file===locked.file&&frame.width===locked.width&&frame.height===locked.height&&frame.offsetX===locked.offsetX&&frame.offsetY===locked.offsetY;
  };
  place(form,spec.center.left,spec.center.top,spec.width,spec.height);
  form.style.fontFamily=spec.typography.familyCandidates.map(name=>`"${name}"`).join(',')+',serif';form.style.fontSize=`${spec.typography.cssPixelSize}px`;
  form.dataset.authSkin='unavailable';form.style.backgroundImage='none';
  for(const [field,box] of Object.entries(spec.inputs)){
   const input=form.querySelector<HTMLInputElement>(`[data-password-field="${field}"]`);
   if(input){place(input,box.left,box.top,box.width,box.height);input.maxLength=box.maxLength;input.type=box.masked?'password':'text';input.parentElement?.style.setProperty('--password-label-top',`${box.top}px`);}
  }
  for(const [name,box] of Object.entries(spec.buttons)){
   const button=form.querySelector<HTMLButtonElement>(`[data-password-${name}]`);
   if(button){place(button,box.left,box.top,box.width,box.height);button.setAttribute('aria-label',box.label);}
  }
  const position=spec.loginEntry.referencePosition;
  place(entry,position.left,position.top,spec.loginEntry.width,spec.loginEntry.height);
  entry.dataset.authSkin='unavailable';clearSkin(entry);
  if(library){
   const [backgroundReady,entryReady]=await Promise.all([matches(50)?authImageReady(nationalUiUrl('prguse',uiFrame(library,50)),spec.width,spec.height):false,matches(53)?authImageReady(nationalUiUrl('prguse',uiFrame(library,53)),spec.loginEntry.width,spec.loginEntry.height):false]);
   if(epoch!==this.passwordSkinEpoch)return;
   if(backgroundReady){applyNationalUiFrame(form,'prguse',uiFrame(library,50));form.dataset.authSkin='national';}
   if(entryReady){this.skinNationalButton(entry,library,{index:spec.loginEntry.normalFrame,hover:spec.loginEntry.normalFrame,pressed:spec.loginEntry.pressedFrame,x:position.left,y:position.top,width:spec.loginEntry.width,height:spec.loginEntry.height});entry.dataset.authSkin='national';}
  }
  entry.style.visibility='';
 }

 bindPasswordActions(handlers:{open:()=>void;cancel:()=>void}){this.onPasswordOpen=handlers.open;this.onPasswordCancel=handlers.cancel;}
 bindRegistration(handler:(account:string,password:string)=>void){this.onRegister=handler;}
 isRegistrationOpen(){return this.root.dataset.authScene==='register'&&!this.root.hidden;}
 private registrationField(id:'account'|'password'|'confirm'){return this.registrationForm?.querySelector<HTMLInputElement>(`#register-${id}`);}
 private registrationStatus(message=''){const status=this.registrationForm?.querySelector<HTMLOutputElement>('[data-registration-status]');if(status)status.textContent=message;}
 private submitRegistration(){
  const account=this.registrationField('account'),password=this.registrationField('password'),confirm=this.registrationField('confirm');
  if(!account||!password||!confirm)return;
  account.value=account.value.trim().toLowerCase();
  if(account.value.length<4||account.value.length>10||!/^[A-Za-z0-9]+$/.test(account.value)){this.registrationRejected('账号需为 4–10 位英文字母或数字。','account');return;}
  if(password.value.length<4||password.value.length>10){this.registrationRejected('密码需为 4–10 位。','password');return;}
  if(password.value!==confirm.value){this.registrationRejected('两次输入的密码不一致。','confirm');return;}
  this.registrationStatus('正在创建账号…');
  const loginAccount=this.root.querySelector<HTMLInputElement>('#account'),loginPassword=this.root.querySelector<HTMLInputElement>('#password');
  if(loginAccount)loginAccount.value=account.value;
  if(loginPassword)loginPassword.value=password.value;
  this.onRegister(account.value,password.value);
 }
 registrationRejected(message:string,field:'account'|'password'|'confirm'='password'){
  this.registrationStatus(message);
  this.registrationField(field)?.focus();
 }
 registrationSucceeded(){
  this.registrationComposing=false;
  if(this.registrationField('password'))this.registrationField('password')!.value='';
  if(this.registrationField('confirm'))this.registrationField('confirm')!.value='';
  this.registrationStatus('');
  this.showLogin();
 }
 showRegistration(){
  if(this.root.dataset.authBusy==='true'||!this.registrationForm)return;
  this.hidePasswordChange();
  this.root.hidden=false;this.root.dataset.authScene='register';
  this.loginScene.hidden=false;this.selectScene.hidden=true;this.createForm.hidden=true;
  const loginDialog=this.root.querySelector<HTMLElement>('[data-auth-login-dialog]');if(loginDialog)loginDialog.hidden=true;
  this.setLegacyPasswordEntryHidden(true);
  this.registrationForm.hidden=false;
  for(const field of ['account','password','confirm'] as const){const input=this.registrationField(field);if(input)input.value='';}
  this.registrationStatus('');
  this.registrationField('account')?.focus();
  this.onScene?.('login');
 }
 closeRegistration(){
  this.registrationComposing=false;
  for(const field of ['account','password','confirm'] as const){const input=this.registrationField(field);if(input)input.value='';}
  if(this.registrationForm)this.registrationForm.hidden=true;
  const loginDialog=this.root.querySelector<HTMLElement>('[data-auth-login-dialog]');if(loginDialog)loginDialog.hidden=false;
  this.setLegacyPasswordEntryHidden(false);
  this.registrationStatus('');
  this.showLogin();
  this.root.querySelector<HTMLButtonElement>('#register')?.focus();
 }
 isPasswordChangeOpen(){return this.root.dataset.authScene==='password-change'&&!this.root.hidden;}
 clearPasswordChange(){this.passwordForm?.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(input=>{input.value='';});}
 showPasswordChange(){
  if(!this.passwordForm)return;
  this.closeRegistrationView();
  this.root.hidden=false;this.root.dataset.authScene='password-change';this.loginScene.hidden=false;this.selectScene.hidden=true;this.createForm.hidden=true;
  const dialog=this.root.querySelector<HTMLElement>('[data-auth-login-dialog]');if(dialog)dialog.hidden=true;
  this.setLegacyPasswordEntryHidden(true);
  this.passwordForm.hidden=false;this.clearPasswordChange();
  const account=this.passwordForm.querySelector<HTMLInputElement>('[data-password-field="account"]');
  if(account){account.value=this.root.querySelector<HTMLInputElement>('#account')?.value??'';account.focus();}
  this.onScene?.('login');
 }

 private hidePasswordChange(){
  this.passwordComposing=false;
  if(this.passwordForm)this.passwordForm.hidden=true;this.clearPasswordChange();
  const dialog=this.root.querySelector<HTMLElement>('[data-auth-login-dialog]');if(dialog)dialog.hidden=false;
  this.setLegacyPasswordEntryHidden(false);
 }

 private setLegacyPasswordEntryHidden(hidden:boolean){
  const entry=this.root.querySelector<HTMLElement>('#auth-password-change');
  if(entry)entry.hidden=hidden||this.nationalReady;
 }

 private closeRegistrationView(){
  this.registrationComposing=false;
  if(this.registrationForm)this.registrationForm.hidden=true;
 }

 private mountNationalAuth(){
  const prguse=this.nationalLibraries.get('prguse'),chrsel=this.nationalLibraries.get('chrsel');
  if(!prguse||!chrsel)return;
  this.root.classList.add('national-auth');
  clipBackdrop(this.loginScene,'chrsel',uiFrame(chrsel,22),'/ui-national');
  const dialog=this.root.querySelector<HTMLElement>('[data-auth-login-dialog]')!;
  const loginSpec=authActions.login;
  place(dialog,loginSpec.dialogOrigin.left,loginSpec.dialogOrigin.top);applyNationalUiFrame(dialog,'prguse',uiFrame(prguse,loginSpec.backgroundFrame));
  for(const selector of ['[data-auth-title-label]','[data-auth-account-label]','[data-auth-pass-label]']){
   const element=this.root.querySelector<HTMLElement>(selector);if(element)element.hidden=true;
  }
  const account=this.root.querySelector<HTMLElement>('#account')!,password=this.root.querySelector<HTMLElement>('#password')!;
  for(const [input,box] of [[account,loginSpec.inputs.account],[password,loginSpec.inputs.password]] as const){
   place(input,box.left,box.top,box.width,box.height);input.style.backgroundColor=loginSpec.inputBackground;
  }
  const loginButton=this.root.querySelector<HTMLButtonElement>('#auth-login-ok')!,registerButton=this.root.querySelector<HTMLButtonElement>('#register')!;
  const embeddedPasswordEntry=this.root.querySelector<HTMLButtonElement>('[data-auth-password-entry]');
  if(embeddedPasswordEntry){const spec=authActions.changePassword.nativeLoginEntry;embeddedPasswordEntry.hidden=false;place(embeddedPasswordEntry,spec.left,spec.top,spec.width,spec.height);}
  this.setLegacyPasswordEntryHidden(true);
  // The recorded resting button is baked into Prguse#60; #62 changes its pixels.
  place(loginButton,168,159,76,39);bindNativeFrameButtonStates(loginButton,()=>{clearSkin(loginButton);loginButton.style.filter='';});
  this.skinNationalButton(registerButton,prguse,{index:61,hover:61,pressed:61,x:20,y:204,width:104,height:39,backgroundX:4,backgroundY:2});

  applyNationalUiFrame(this.createForm,'prguse',uiFrame(prguse,73));place(this.createForm,250,91);
  const createTitle=this.root.querySelector<HTMLElement>('[data-auth-create-title]');if(createTitle)createTitle.hidden=true;
  const createName=this.root.querySelector<HTMLElement>('#character-name')!;place(createName,70,106,140,20);
  const createOk=this.root.querySelector<HTMLButtonElement>('#auth-create-ok')!,createCancel=this.root.querySelector<HTMLButtonElement>('[data-auth-create-cancel]')!;
  this.skinNationalButton(createOk,prguse,{index:361,hover:362,pressed:363,x:100,y:358,width:80,height:34});
  clearSkin(createCancel);bindNativeFrameButtonStates(createCancel,()=>{});place(createCancel,190,361,76,39);
  this.createPortrait.hidden=true;
  for(const selector of ['[data-auth-job="0"]','[data-auth-job="1"]','[data-auth-job="2"]','[data-auth-sex="0"]','[data-auth-sex="1"]']){
   const button=this.root.querySelector<HTMLButtonElement>(selector);if(button)clearSkin(button);
  }
  const jobPositions=[[47,156],[92,156],[137,156]],sexPositions=[[92,230],[137,230]];
  this.root.querySelectorAll<HTMLButtonElement>('[data-auth-job]').forEach((button,index)=>{const position=jobPositions[index];if(position)place(button,position[0],position[1],44,36);});
  this.root.querySelectorAll<HTMLButtonElement>('[data-auth-sex]').forEach((button,index)=>{const position=sexPositions[index];if(position)place(button,position[0],position[1],44,35);});
  this.bindNationalToggle(this.root.querySelector<HTMLButtonElement>('[data-auth-job="0"]')!,prguse,{normal:74,active:55,hover:55,pressed:55});
  this.bindNationalToggle(this.root.querySelector<HTMLButtonElement>('[data-auth-job="1"]')!,prguse,{normal:75,active:56,hover:56,pressed:56});
  this.bindNationalToggle(this.root.querySelector<HTMLButtonElement>('[data-auth-job="2"]')!,prguse,{normal:76,active:57,hover:57,pressed:57});
  this.bindNationalToggle(this.root.querySelector<HTMLButtonElement>('[data-auth-sex="0"]')!,prguse,{normal:77,active:58,hover:58,pressed:58});
  this.bindNationalToggle(this.root.querySelector<HTMLButtonElement>('[data-auth-sex="1"]')!,prguse,{normal:78,active:59,hover:59,pressed:59});

  clipBackdrop(this.selectScene,'prguse',uiFrame(prguse,65),'/ui-national');
  const selectTitle=this.root.querySelector<HTMLElement>('[data-auth-select-title]');if(selectTitle)selectTitle.hidden=true;
  for(const [name,selector] of [['start','[data-auth-start]'],['create','[data-auth-new]'],['delete','[data-auth-delete]'],['exit','[data-auth-exit]']] as const){
   const button=this.root.querySelector<HTMLButtonElement>(selector),spec=selectionActions.buttons[name],frame=uiFrame(prguse,spec.frame),locked=selectionActions.frames[String(spec.frame) as keyof typeof selectionActions.frames];
   if(!button)continue;
   if(prguse.sourceSha256===selectionActions.sourceSha256&&prguse.indexSha256===selectionActions.indexSha256&&frame?.file===locked.file&&frame.width===locked.width&&frame.height===locked.height){
    button.textContent='';place(button,spec.left,spec.top,frame.width,frame.height);
    // Prguse65 already paints the resting labels. Only paint the active frame over that exact label.
    bindNativeFrameButtonStates(button,state=>{if(state==='normal')clearSkin(button);else paintNationalButton(button,prguse,spec.frame,0,0,'');});
    button.dataset.layoutEvidence=selectionActions.layoutEvidence;
   }
  }
 }

 bind(handlers:{start:(name:string)=>void;create:()=>void;exit:()=>void}){
  this.onStart=handlers.start;this.onCreate=handlers.create;this.onExit=handlers.exit;
 }

  bindDelete(handler:(name:string)=>void){this.onDelete=handler;}
  selectedCharacterName(){return this.characters[this.selected]?.name;}
  setDeleteEnabled(enabled:boolean){this.deleteEnabled=enabled;this.refreshDeleteButton();}
  private refreshDeleteButton(){const button=this.root.querySelector<HTMLButtonElement>('[data-auth-delete]');if(button){button.hidden=!this.deleteEnabled;button.disabled=this.root.dataset.authBusy==='true'||!this.characters[this.selected];}}

  /** Reflect an in-flight authentication request in every visible auth control. */
 setBusy(busy:boolean){
  this.root.dataset.authBusy=String(busy);
  this.root.setAttribute('aria-busy',String(busy));
  this.root.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.disabled=busy;});
  this.root.querySelectorAll<HTMLInputElement>('input,select').forEach(input=>{input.disabled=busy;});
   if(this.isPasswordChangeOpen()){const cancel=this.passwordForm?.querySelector<HTMLButtonElement>('[data-password-cancel]');if(cancel)cancel.disabled=false;}
   this.refreshDeleteButton();
   this.entryScenes?.setBusy(busy);
 }

 private hideEntryScenes(){this.selectionLabels.stop();this.portraitAnimation.stop();++this.entryScenesRevision;this.entryScenes?.hide();}
 private loadEntryScenes(){
  if(this.entryScenes)return Promise.resolve(this.entryScenes);
  if(this.entryScenesLoad)return this.entryScenesLoad;
  const task=import('./native-entry-scenes').then(({NativeEntryScenes})=>this.entryScenes??=new NativeEntryScenes(this.root)).catch(error=>{if(this.entryScenesLoad===task)this.entryScenesLoad=undefined;throw error;});
  this.entryScenesLoad=task;return task;
 }
 isEntrySceneOpen(){return this.root.dataset.authScene==='servers'||this.root.dataset.authScene==='notice';}
 async showServerSelection(servers:LoginServer[],handlers:{choose:(name:string)=>void;exit:()=>void}){
  this.hideEntryScenes();const revision=this.entryScenesRevision;
  this.closeRegistrationView();this.hidePasswordChange();this.root.hidden=false;this.root.dataset.authScene='servers';
  this.loginScene.hidden=true;this.selectScene.hidden=true;this.createForm.hidden=true;this.onScene?.('login');
  const scenes=await this.loadEntryScenes();if(revision!==this.entryScenesRevision)return false;
  if(!await scenes.showServers(servers,handlers)||revision!==this.entryScenesRevision)return false;
  this.setBusy(false);return true;
 }
 async showEntryNotice(noticeId:number,lines:string[],acknowledge:(noticeId:number)=>void){
  this.hideEntryScenes();const revision=this.entryScenesRevision;
  this.closeRegistrationView();this.hidePasswordChange();this.root.hidden=false;this.root.dataset.authScene='notice';
  this.loginScene.hidden=true;this.selectScene.hidden=true;this.createForm.hidden=true;this.onScene?.('select');
  const scenes=await this.loadEntryScenes();if(revision!==this.entryScenesRevision)return false;
  if(!await scenes.showNotice(noticeId,lines,acknowledge)||revision!==this.entryScenesRevision)return false;
  this.setBusy(false);return true;
 }

 showLogin(){
  this.serverName='';
  this.hideEntryScenes();
  this.closeRegistrationView();
  this.hidePasswordChange();
  this.root.hidden=false;
  this.root.dataset.authScene='login';
  this.loginScene.hidden=false;
  this.selectScene.hidden=true;
  this.createForm.hidden=true;
  this.onScene?.('login');
 }

 showSelect(characters:SelectCharacter[], handlers?:{start:(name:string)=>void;create:()=>void;exit:()=>void},serverName?:string){
  if(serverName!==undefined)this.serverName=serverName;
  this.hideEntryScenes();
  this.closeRegistrationView();
  this.hidePasswordChange();
  if(handlers)this.bind(handlers);
   const previous=this.selectedCharacterName();this.characters=characters;
   const marked=characters.findIndex(character=>character.selected===true),retained=characters.findIndex(character=>character.name===previous);
   this.selected=marked>=0?marked:retained>=0?retained:0;
  this.root.hidden=false;
  this.root.dataset.authScene='select';
  this.loginScene.hidden=true;
  this.selectScene.hidden=false;
  this.createForm.hidden=true;
  this.renderSlots();
  this.onScene?.('select');
 }

 showCreate(){
  this.hideEntryScenes();
  this.closeRegistrationView();
  this.hidePasswordChange();
  this.root.hidden=false;
  this.root.dataset.authScene='create';
  this.loginScene.hidden=true;
  this.selectScene.hidden=true;
  this.createForm.hidden=false;
  this.job=Number(this.jobInput.value)||0;
  this.sex=Number(this.sexInput.value)||0;
  this.renderCreate();
  this.root.querySelector<HTMLInputElement>('#character-name')?.focus();
  this.onScene?.('select');
 }

 hide(){this.hideEntryScenes();this.closeRegistrationView();this.hidePasswordChange();this.root.dataset.authScene='world';this.root.hidden=true;this.onScene?.('world');}

 private renderSlots(){
  this.selectionLabels.stop();
  this.portraitAnimation.stop();
  if(!this.nationalReady)return;
  const nationalPrguse=this.nationalLibraries.get('prguse');if(!nationalPrguse)return;
  this.charactersElement.replaceChildren();
  const labels:{index:number;name:HTMLElement;level:HTMLElement;job:HTMLElement}[]=[];
  for(let index=0;index<2;index++){
   const character=this.characters[index],button=document.createElement('button');
   button.type='button';button.className='auth-slot';button.dataset.slot=String(index);
   const x=index===0?40:590;place(button,x,448,190,135);button.style.backgroundImage='none';
   const selectSprite=document.createElement('span');selectSprite.className='auth-slot-select';
   place(selectSprite,index===0?94:95,4,76,33);
   const paintSelect=(state:NativeButtonVisualState)=>{
    if(state==='normal')clearSkin(selectSprite);else paintNationalButton(selectSprite,nationalPrguse,index===0?66:67,0,0,'');
   };
   bindNativeFrameButtonStates(button,paintSelect);button.append(selectSprite);
   if(character){
    const name=document.createElement('span');name.className='auth-slot-name';name.textContent=character.name;
    const meta=document.createElement('span');meta.className='auth-slot-meta';meta.textContent=String(character.level);
    const job=document.createElement('span');job.className='auth-slot-job';job.textContent=selectionActions.labels.jobs[character.job]??'';
    button.append(name,meta,job);labels.push({index,name,level:meta,job});
    button.onclick=()=>{this.selected=index;this.renderSlots();};button.ondblclick=()=>this.onStart(character.name);
    button.setAttribute('aria-label',`${character.name}，${character.level}级${job.textContent}`);
   }
   this.charactersElement.append(button);
  }
  this.selectionLabels.show(this.serverName,labels);
  this.refreshDeleteButton();
  const selected=this.characters[this.selected],nationalChr=this.nationalLibraries.get('chrsel');
  if(!selected||!nationalChr){this.portrait.hidden=true;return;}
  this.portrait.hidden=false;this.portrait.alt=selected.name;
  const frame=uiFrame(nationalChr,nationalPortraits[`${selected.job}-${selected.sex}`]??40);
  this.portrait.src=nationalUiUrl('chrsel',frame);
  const anchor=selectionActions.portraits.anchors[`${selected.job}-${selected.sex}` as keyof typeof selectionActions.portraits.anchors]??selectionActions.portraits.anchors['0-0'];
  place(this.portrait,anchor.left+(this.selected===1?340:0),anchor.top+(this.selected===1?2:0),frame.width,frame.height);
  this.portrait.style.objectFit='none';
  this.portraitAnimation.start(selected.job,selected.sex);
 }

 private renderCreate(){
  const national=this.nationalLibraries.get('prguse');if(!national)return;
  // The create panel contains its own figure. Its native choices have independent index ranges.
  this.createPortrait.hidden=true;
  for(const value of nationalCreateJobs){
   const button=this.root.querySelector<HTMLButtonElement>(`[data-auth-job="${value.job}"]`);
   const mapped=nationalCreateJobs.find(spec=>spec.job===value.job);
   if(button&&mapped)paintNationalButton(button,national,this.job===value.job?mapped.active:mapped.normal,0,0,'');
  }
  for(const value of nationalCreateSexes){
   const button=this.root.querySelector<HTMLButtonElement>(`[data-auth-sex="${value.sex}"]`);
   const mapped=nationalCreateSexes.find(spec=>spec.sex===value.sex);
   if(button&&mapped)paintNationalButton(button,national,this.sex===value.sex?mapped.active:mapped.normal,0,0,'');
  }
 }

 private skinNationalButton(button:HTMLButtonElement,library:NationalLibrary,spec:{index:number;hover:number;pressed:number;x:number;y:number;width:number;height:number;backgroundX?:number;backgroundY?:number}){
  place(button,spec.x,spec.y,spec.width,spec.height);
  const backgroundX=spec.backgroundX??0,backgroundY=spec.backgroundY??0;
  const hoverFilter=spec.hover===spec.index?'':'brightness(1.12)';
  const pressedFilter=spec.pressed===spec.index?'':'brightness(.88)';
  const paint=(state:NativeButtonVisualState)=>paintNationalButton(button,library,state==='normal'?spec.index:state==='hover'?spec.hover:spec.pressed,backgroundX,backgroundY,state==='normal'?'':state==='hover'?hoverFilter:pressedFilter);
  bindNativeFrameButtonStates(button,paint);
 }

 private bindNationalToggle(button:HTMLButtonElement,library:NationalLibrary,spec:{normal:number;active:number;hover:number;pressed:number}){
  const selected=()=>button.dataset.authJob!==undefined?this.job===Number(button.dataset.authJob):this.sex===Number(button.dataset.authSex);
  const hoverFilter=spec.hover===spec.active?'':'brightness(1.12)';
  const pressedFilter=spec.pressed===spec.active?'':'brightness(.88)';
  const paint=(state:NativeButtonVisualState)=>paintNationalButton(button,library,state==='normal'?(selected()?spec.active:spec.normal):state==='hover'?spec.hover:spec.pressed,0,0,state==='normal'?'':state==='hover'?hoverFilter:pressedFilter);
  bindNativeFrameButtonStates(button,paint);
 }


}

function authImageReady(url:string,width:number,height:number):Promise<boolean>{
 if(typeof Image==='undefined')return Promise.resolve(false);
 return new Promise(resolve=>{
  const img=new Image();let settled=false;
  const finish=(ready:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);img.onload=null;img.onerror=null;resolve(ready);};
  const timer=setTimeout(()=>finish(false),8000);
  img.onload=()=>finish(img.naturalWidth===width&&img.naturalHeight===height);img.onerror=()=>finish(false);img.src=url;
 });
}

function place(element:HTMLElement,x:number,y:number,width?:number,height?:number){
 element.style.left=`${x}px`;element.style.top=`${y}px`;
 if(width!==undefined)element.style.width=`${width}px`;
 if(height!==undefined)element.style.height=`${height}px`;
}

function clipBackdrop(element:HTMLElement,name:string,frame:Frame,base='/ui-national'){
 element.style.width='800px';element.style.height='600px';
 element.style.backgroundImage=`url(${nationalUiUrl(name,frame)})`;
 element.style.backgroundRepeat='no-repeat';element.style.backgroundPosition='0 0';
}

function clearSkin(element:HTMLElement){element.style.backgroundImage='none';element.style.backgroundColor='transparent';}

function paintNationalButton(element:HTMLElement,library:NationalLibrary,index:number,backgroundX:number,backgroundY:number,filter:string){
 const frame=uiFrame(library,index);
 element.style.backgroundImage=`url(${nationalUiUrl('prguse',frame)})`;
 element.style.backgroundPosition=`${backgroundX}px ${backgroundY}px`;
 element.style.backgroundRepeat='no-repeat';
 element.style.backgroundColor='transparent';
 element.style.filter=filter;
}
