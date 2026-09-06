import {applyNationalUiFrame,applyUiFrame,loadNationalUiLibrary,loadUiLibrary,uiFrame,uiUrl,nationalUiUrl,type Frame} from './classic-ui';

export type SelectCharacter={name:string;job:number;level:number;sex:number;hair?:number};
type Library=Awaited<ReturnType<typeof loadUiLibrary>>;
type ButtonSpec={library:string;index:number;hover:number;pressed:number;x:number;y:number};
type NationalLibrary=Awaited<ReturnType<typeof loadNationalUiLibrary>>;

const portraits:Record<string,number>={'0-0':20,'1-0':40,'2-0':60,'0-1':300,'1-1':320,'2-1':340};
const nationalPortraits:Record<string,number>={'0-0':80,'1-0':40,'2-0':60,'0-1':160,'1-1':220,'2-1':200};
const login={
 dialog:{library:'Prguse',index:1084,x:236,y:190},
 title:{library:'Title',index:30,x:113,y:12},
 accountLabel:{library:'Title',index:31,x:52,y:83},
 passwordLabel:{library:'Title',index:32,x:43,y:105},
 accountInput:{x:85,y:85,width:136,height:15},
 passwordInput:{x:85,y:108,width:136,height:15},
 ok:{library:'Title',index:320,hover:321,pressed:322,x:227,y:81},
 register:{library:'Title',index:323,hover:324,pressed:325,x:60,y:163}
};
const select={
 title:{library:'Title',index:40,x:468,y:20},
 portrait:{x:260,y:420},
 slot:{library:'Prguse',index:44,filledLibrary:'Title',filledIndex:660,x:504,y:140,step:80,count:4},
 start:{library:'Title',index:340,hover:341,pressed:342,x:110,y:568},
 create:{library:'Title',index:343,hover:344,pressed:345,x:230,y:568},
 exit:{library:'Title',index:352,hover:353,pressed:354,x:590,y:568}
};
const created={
 library:'Prguse',index:73,x:106,y:70,
 title:{library:'Title',index:20,x:206,y:11},
 nameInput:{x:325,y:268,width:240,height:20},
 ok:{library:'Title',index:360,hover:361,pressed:362,x:160,y:425},
 cancel:{library:'Title',index:280,hover:281,pressed:282,x:425,y:425},
 jobs:[
  {job:0,library:'Prguse',index:2426,active:2427,hover:2427,pressed:2428,x:323,y:296},
  {job:1,library:'Prguse',index:2429,active:2430,hover:2430,pressed:2431,x:373,y:296},
  {job:2,library:'Prguse',index:2432,active:2433,hover:2433,pressed:2434,x:423,y:296}
 ],
 sexes:[
  {sex:0,library:'Prguse',index:2420,active:2421,hover:2421,pressed:2422,x:323,y:343},
  {sex:1,library:'Prguse',index:2423,active:2424,hover:2424,pressed:2425,x:373,y:343}
 ],
 portrait:{x:120,y:250}
};

export class ClassicAuth {
 private libraries=new Map<string,Library>();
 private nationalLibraries=new Map<string,NationalLibrary>();
 private nationalReady=false;
 private characters:SelectCharacter[]=[];
 private selected=0;
 private job=0;
 private sex=0;
 private onStart:(name:string)=>void=()=>undefined;
 private onCreate:()=>void=()=>undefined;
 private onExit:()=>void=()=>undefined;
 private readonly loginScene:HTMLElement;
 private readonly selectScene:HTMLElement;
 private readonly createForm:HTMLFormElement;
 private readonly charactersElement:HTMLElement;
 private readonly portrait:HTMLImageElement;
 private readonly createPortrait:HTMLImageElement;
 private readonly jobInput:HTMLSelectElement;
 private readonly sexInput:HTMLSelectElement;
 private readonly mountTask:Promise<void>;

 constructor(private readonly root:HTMLElement){
  this.loginScene=root.querySelector<HTMLElement>('[data-auth-login]')!;
  this.selectScene=root.querySelector<HTMLElement>('[data-auth-select]')!;
  this.createForm=root.querySelector<HTMLFormElement>('#create-character')!;
  this.charactersElement=root.querySelector<HTMLElement>('#characters')!;
  this.portrait=root.querySelector<HTMLImageElement>('[data-auth-portrait]')!;
  this.createPortrait=root.querySelector<HTMLImageElement>('[data-auth-create-portrait]')!;
  this.jobInput=root.querySelector<HTMLSelectElement>('#character-job')!;
  this.sexInput=root.querySelector<HTMLSelectElement>('#character-sex')!;
  this.mountTask=this.mount();
 }

 async ready(){await this.mountTask;}

 private async mount(){
  const names=['Prguse','Title','ChrSel'] as const;
  const loaded=await Promise.all(names.map(loadUiLibrary));
  names.forEach((name,index)=>this.libraries.set(name,loaded[index]));
  clipBackdrop(this.loginScene, 'ChrSel', uiFrame(this.libraries.get('ChrSel')!, 0));
  clipBackdrop(this.selectScene, 'Prguse', uiFrame(this.libraries.get('Prguse')!, 65));
  const dialog=this.root.querySelector<HTMLElement>('[data-auth-login-dialog]')!;
  place(dialog, login.dialog.x, login.dialog.y);
  applyUiFrame(dialog, 'Prguse', uiFrame(this.libraries.get('Prguse')!, login.dialog.index));
  placeLabel(dialog, '[data-auth-title-label]', 'Title', uiFrame(this.libraries.get('Title')!, login.title.index), login.title);
  placeLabel(dialog, '[data-auth-account-label]', 'Title', uiFrame(this.libraries.get('Title')!, login.accountLabel.index), login.accountLabel);
  placeLabel(dialog, '[data-auth-pass-label]', 'Title', uiFrame(this.libraries.get('Title')!, login.passwordLabel.index), login.passwordLabel);
  const account=this.root.querySelector<HTMLElement>('#account')!;
  const password=this.root.querySelector<HTMLElement>('#password')!;
  place(account, login.accountInput.x, login.accountInput.y, login.accountInput.width, login.accountInput.height);
  place(password, login.passwordInput.x, login.passwordInput.y, login.passwordInput.width, login.passwordInput.height);
  this.skinButton(this.root.querySelector<HTMLButtonElement>('#auth-login-ok')!, login.ok);
  this.skinButton(this.root.querySelector<HTMLButtonElement>('#register')!, login.register);
  placeLabel(this.selectScene, '[data-auth-select-title]', 'Title', uiFrame(this.libraries.get('Title')!, select.title.index), select.title);
  this.skinButton(this.root.querySelector<HTMLButtonElement>('[data-auth-start]')!, select.start);
  this.skinButton(this.root.querySelector<HTMLButtonElement>('[data-auth-new]')!, select.create);
  this.skinButton(this.root.querySelector<HTMLButtonElement>('[data-auth-exit]')!, select.exit);
  this.root.querySelector<HTMLButtonElement>('[data-auth-start]')!.onclick=()=>{
   const character=this.characters[this.selected];
   if(character)this.onStart(character.name);
  };
  this.root.querySelector<HTMLButtonElement>('[data-auth-new]')!.onclick=()=>this.onCreate();
  this.root.querySelector<HTMLButtonElement>('[data-auth-exit]')!.onclick=()=>this.onExit();
  place(this.createForm, created.x, created.y);
  applyUiFrame(this.createForm, 'Prguse', uiFrame(this.libraries.get('Prguse')!, created.index));
  placeLabel(this.createForm, '[data-auth-create-title]', 'Title', uiFrame(this.libraries.get('Title')!, created.title.index), created.title);
  const name=this.root.querySelector<HTMLElement>('#character-name')!;
  place(name, created.nameInput.x, created.nameInput.y, created.nameInput.width, created.nameInput.height);
  this.skinButton(this.root.querySelector<HTMLButtonElement>('#auth-create-ok')!, created.ok);
  const cancel=this.root.querySelector<HTMLButtonElement>('[data-auth-create-cancel]')!;
  this.skinButton(cancel, created.cancel);
  cancel.onclick=()=>this.showSelect(this.characters);
  for(const spec of created.jobs){
   const button=this.root.querySelector<HTMLButtonElement>(`[data-auth-job="${spec.job}"]`)!;
   this.skinToggle(button, spec, ()=>{this.job=spec.job;this.jobInput.value=String(spec.job);this.renderCreate();});
  }
  for(const spec of created.sexes){
   const button=this.root.querySelector<HTMLButtonElement>(`[data-auth-sex="${spec.sex}"]`)!;
  this.skinToggle(button, spec, ()=>{this.sex=spec.sex;this.sexInput.value=String(spec.sex);this.renderCreate();});
  }
  try{
   const [prguse,chrsel]=await Promise.all([loadNationalUiLibrary('prguse'),loadNationalUiLibrary('chrsel')]);
   this.nationalLibraries.set('prguse',prguse);this.nationalLibraries.set('chrsel',chrsel);this.nationalReady=true;
   this.mountNationalAuth();
  }catch{
   this.nationalReady=false;
  }
  this.renderCreate();
  this.showLogin();
 }

 private mountNationalAuth(){
  const prguse=this.nationalLibraries.get('prguse'),chrsel=this.nationalLibraries.get('chrsel');
  if(!prguse||!chrsel)return;
  this.root.classList.add('national-auth');
  clipBackdrop(this.loginScene,'chrsel',uiFrame(chrsel,22),'/ui-national');
  const dialog=this.root.querySelector<HTMLElement>('[data-auth-login-dialog]')!;
  place(dialog,252,173);applyNationalUiFrame(dialog,'prguse',uiFrame(prguse,60));
  for(const selector of ['[data-auth-title-label]','[data-auth-account-label]','[data-auth-pass-label]']){
   const element=this.root.querySelector<HTMLElement>(selector);if(element)element.hidden=true;
  }
  const account=this.root.querySelector<HTMLElement>('#account')!,password=this.root.querySelector<HTMLElement>('#password')!;
  place(account,95,82,140,20);place(password,95,111,140,20);
  const loginButton=this.root.querySelector<HTMLButtonElement>('#auth-login-ok')!,registerButton=this.root.querySelector<HTMLButtonElement>('#register')!;
  clearSkin(loginButton);clearSkin(registerButton);place(loginButton,168,159,76,39);place(registerButton,20,204,104,39);

  applyNationalUiFrame(this.createForm,'prguse',uiFrame(prguse,73));place(this.createForm,250,91);
  const createTitle=this.root.querySelector<HTMLElement>('[data-auth-create-title]');if(createTitle)createTitle.hidden=true;
  const createName=this.root.querySelector<HTMLElement>('#character-name')!;place(createName,70,106,140,20);
  const createOk=this.root.querySelector<HTMLButtonElement>('#auth-create-ok')!,createCancel=this.root.querySelector<HTMLButtonElement>('[data-auth-create-cancel]')!;
  clearSkin(createOk);clearSkin(createCancel);place(createOk,103,361,76,39);place(createCancel,190,361,76,39);
  this.createPortrait.hidden=true;
  for(const selector of ['[data-auth-job="0"]','[data-auth-job="1"]','[data-auth-job="2"]','[data-auth-sex="0"]','[data-auth-sex="1"]']){
   const button=this.root.querySelector<HTMLButtonElement>(selector);if(button)clearSkin(button);
  }
  const jobPositions=[[48,157],[98,157],[148,157]],sexPositions=[[93,228],[143,228]];
  this.root.querySelectorAll<HTMLButtonElement>('[data-auth-job]').forEach((button,index)=>{const position=jobPositions[index];if(position)place(button,position[0],position[1],42,44);});
  this.root.querySelectorAll<HTMLButtonElement>('[data-auth-sex]').forEach((button,index)=>{const position=sexPositions[index];if(position)place(button,position[0],position[1],42,43);});

  clipBackdrop(this.selectScene,'prguse',uiFrame(prguse,65),'/ui-national');
  const selectTitle=this.root.querySelector<HTMLElement>('[data-auth-select-title]');if(selectTitle)selectTitle.hidden=true;
  for(const selector of ['[data-auth-start]','[data-auth-new]','[data-auth-exit]']){
   const button=this.root.querySelector<HTMLButtonElement>(selector);if(button)clearSkin(button);
  }
  place(this.root.querySelector<HTMLButtonElement>('[data-auth-start]')!,348,450,110,34);
  place(this.root.querySelector<HTMLButtonElement>('[data-auth-new]')!,335,483,130,34);
  place(this.root.querySelector<HTMLButtonElement>('[data-auth-exit]')!,355,535,90,32);
 }

 bind(handlers:{start:(name:string)=>void;create:()=>void;exit:()=>void}){
  this.onStart=handlers.start;this.onCreate=handlers.create;this.onExit=handlers.exit;
 }

 showLogin(){
  this.root.hidden=false;
  this.root.dataset.authScene='login';
  this.loginScene.hidden=false;
  this.selectScene.hidden=true;
  this.createForm.hidden=true;
 }

 showSelect(characters:SelectCharacter[], handlers?:{start:(name:string)=>void;create:()=>void;exit:()=>void}){
  if(handlers)this.bind(handlers);
  this.characters=characters;
  if(this.selected>=characters.length)this.selected=0;
  this.root.hidden=false;
  this.root.dataset.authScene='select';
  this.loginScene.hidden=true;
  this.selectScene.hidden=false;
  this.createForm.hidden=true;
  this.renderSlots();
 }

 showCreate(){
  this.root.hidden=false;
  this.root.dataset.authScene='create';
  this.loginScene.hidden=true;
  this.selectScene.hidden=true;
  this.createForm.hidden=false;
  this.job=Number(this.jobInput.value)||0;
  this.sex=Number(this.sexInput.value)||0;
  this.renderCreate();
  this.root.querySelector<HTMLInputElement>('#character-name')?.focus();
 }

 hide(){this.root.hidden=true;}

 private renderSlots(){
  const chrSel=this.libraries.get('ChrSel'),title=this.libraries.get('Title'),prguse=this.libraries.get('Prguse');
  if(!chrSel||!title||!prguse)return;
  this.charactersElement.replaceChildren();
  const spec=select.slot;
  for(let index=0;index<spec.count;index++){
   const character=this.characters[index];
   const button=document.createElement('button');
   button.type='button';
   button.className='auth-slot';
   if(this.nationalReady){
    if(index>1){button.hidden=true;this.charactersElement.append(button);continue;}
    const x=index===0?44:618;place(button,x,448,184,128);button.style.backgroundImage='none';
   }else{
    place(button, spec.x, spec.y+index*spec.step);
    const filled=character?uiFrame(title, spec.filledIndex+character.job+(index===this.selected?5:0)):uiFrame(prguse, spec.index);
    applyUiFrame(button, character?'Title':'Prguse', filled);
   }
   if(character){
    const name=document.createElement('span');name.className='auth-slot-name';name.textContent=character.name;
    const meta=document.createElement('span');meta.className='auth-slot-meta';
    const job=document.createElement('span');job.className='auth-slot-job';
    if(this.nationalReady){
     meta.textContent=String(character.level);
     job.textContent=['战士','法师','道士'][character.job]??'';
     button.append(name, meta, job);
    }else{
     meta.textContent=`${character.level}  ${['战士','法师','道士'][character.job]??''}`;
     button.append(name, meta);
    }
    button.onclick=()=>{this.selected=index;this.renderSlots();};
    button.ondblclick=()=>this.onStart(character.name);
   }
   this.charactersElement.append(button);
  }
  const selected=this.characters[this.selected];
  if(!selected){this.portrait.hidden=true;return;}
  this.portrait.hidden=false;
  this.portrait.alt=selected.name;
  if(this.nationalReady){
   const nationalChr=this.nationalLibraries.get('chrsel');
   if(nationalChr){
    const frame=uiFrame(nationalChr, nationalPortraits[`${selected.job}-${selected.sex}`]??80);
    this.portrait.src=nationalUiUrl('chrsel', frame);
    const height=Math.min(frame.height, 318);
    const width=Math.round(frame.width*height/frame.height);
    const portraitX=this.selected===0?40:500;
    place(this.portrait, portraitX, 112, width, height);
    this.portrait.style.objectFit='contain';
    return;
   }
  }
  const index=portraits[`${selected.job}-${selected.sex}`]??20;
  const frame=uiFrame(chrSel, index);
  this.portrait.src=uiUrl('ChrSel', frame);
  place(this.portrait, select.portrait.x+frame.offsetX, select.portrait.y+frame.offsetY, frame.width, frame.height);
 }

 private renderCreate(){
  const chrSel=this.libraries.get('ChrSel');
  if(!chrSel)return;
  const index=portraits[`${this.job}-${this.sex}`]??20;
  const frame=uiFrame(chrSel, index);
  this.createPortrait.src=uiUrl('ChrSel', frame);
  this.createPortrait.alt=['战士','法师','道士'][this.job]??'角色';
  place(this.createPortrait, created.portrait.x+frame.offsetX, created.portrait.y+frame.offsetY, frame.width, frame.height);
  for(const spec of created.jobs){
  const button=this.root.querySelector<HTMLButtonElement>(`[data-auth-job="${spec.job}"]`);
   const library=this.libraries.get(spec.library);
   if(!button||!library)continue;
   if(this.nationalReady)clearSkin(button);else applyUiFrame(button, spec.library, uiFrame(library, this.job===spec.job?spec.active:spec.index));
  }
  for(const spec of created.sexes){
   const button=this.root.querySelector<HTMLButtonElement>(`[data-auth-sex="${spec.sex}"]`);
   const library=this.libraries.get(spec.library);
   if(!button||!library)continue;
   if(this.nationalReady)clearSkin(button);else applyUiFrame(button, spec.library, uiFrame(library, this.sex===spec.sex?spec.active:spec.index));
  }
 }

 private skinButton(button:HTMLButtonElement,spec:ButtonSpec){
  const library=this.libraries.get(spec.library);
  if(!library)return;
  place(button, spec.x, spec.y);
  applyUiFrame(button, spec.library, uiFrame(library, spec.index));
  button.textContent='';
  button.onmouseenter=()=>applyUiFrame(button, spec.library, uiFrame(library, spec.hover));
  button.onmouseleave=()=>applyUiFrame(button, spec.library, uiFrame(library, spec.index));
  button.onmousedown=()=>applyUiFrame(button, spec.library, uiFrame(library, spec.pressed));
  button.onmouseup=()=>applyUiFrame(button, spec.library, uiFrame(library, spec.hover));
 }

 private skinToggle(button:HTMLButtonElement,spec:{library:string;index:number;hover:number;pressed:number;x:number;y:number},activate:()=>void){
  const library=this.libraries.get(spec.library);
  if(!library)return;
  place(button, spec.x, spec.y);
  applyUiFrame(button, spec.library, uiFrame(library, spec.index));
  button.textContent='';
  button.onmouseenter=()=>applyUiFrame(button, spec.library, uiFrame(library, spec.hover));
  button.onmouseleave=()=>this.renderCreate();
  button.onmousedown=()=>applyUiFrame(button, spec.library, uiFrame(library, spec.pressed));
  button.onclick=activate;
 }
}

function place(element:HTMLElement,x:number,y:number,width?:number,height?:number){
 element.style.left=`${x}px`;element.style.top=`${y}px`;
 if(width!==undefined)element.style.width=`${width}px`;
 if(height!==undefined)element.style.height=`${height}px`;
}

function placeLabel(root:HTMLElement,selector:string,library:string,frame:Frame,spec:{x:number;y:number}){
 const element=root.querySelector<HTMLElement>(selector);
 if(!element)return;
 place(element, spec.x, spec.y);
 applyUiFrame(element, library, frame);
}

function clipBackdrop(element:HTMLElement,name:string,frame:Frame,base='/ui'){
 element.style.width='800px';
 element.style.height='600px';
 element.style.backgroundImage=`url(${base==='/ui'?uiUrl(name,frame):nationalUiUrl(name,frame)})`;
 element.style.backgroundRepeat='no-repeat';
 element.style.backgroundPosition='0 0';
}

function clearSkin(element:HTMLElement){element.style.backgroundImage='none';element.style.backgroundColor='transparent';}
