import {applyNationalUiFrame,applyUiFrame,loadClassicUiSession,loadNationalUiLibrary,loadUiLibrary,uiFrame,uiUrl,nationalUiUrl,type Frame} from './classic-ui';

export type SelectCharacter={name:string;job:number;level:number;sex:number;hair?:number};
type Library=Awaited<ReturnType<typeof loadUiLibrary>>;
type ButtonSpec={library:string;index:number;hover:number;pressed:number;x:number;y:number};
type NationalLibrary=Awaited<ReturnType<typeof loadNationalUiLibrary>>;

const portraits:Record<string,number>={'0-0':20,'1-0':40,'2-0':60,'0-1':300,'1-1':320,'2-1':340};
const nationalPortraits:Record<string,number>={'0-0':40,'1-0':80,'2-0':120,'0-1':160,'1-1':200,'2-1':240};
const nationalCreateJobs=[{job:0,normal:74,active:55},{job:1,normal:75,active:56},{job:2,normal:76,active:57}];
const nationalCreateSexes=[{sex:0,normal:77,active:58},{sex:1,normal:78,active:59}];
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
  const session=await loadClassicUiSession();
  for(const name of ['Prguse','Title','ChrSel'] as const){const library=session.fallback.get(name);if(library)this.libraries.set(name,library);}
  const fallbackChrSel=this.libraries.get('ChrSel'),fallbackPrguse=this.libraries.get('Prguse');
  if(fallbackChrSel)clipBackdrop(this.loginScene, 'ChrSel', uiFrame(fallbackChrSel, 0));
  if(fallbackPrguse)clipBackdrop(this.selectScene, 'Prguse', uiFrame(fallbackPrguse, 65));
  const dialog=this.root.querySelector<HTMLElement>('[data-auth-login-dialog]')!;
  place(dialog, login.dialog.x, login.dialog.y);
  if(fallbackPrguse)applyUiFrame(dialog, 'Prguse', uiFrame(fallbackPrguse, login.dialog.index));
  const fallbackTitle=this.libraries.get('Title');
  if(fallbackTitle){
   placeLabel(dialog, '[data-auth-title-label]', 'Title', uiFrame(fallbackTitle, login.title.index), login.title);
   placeLabel(dialog, '[data-auth-account-label]', 'Title', uiFrame(fallbackTitle, login.accountLabel.index), login.accountLabel);
   placeLabel(dialog, '[data-auth-pass-label]', 'Title', uiFrame(fallbackTitle, login.passwordLabel.index), login.passwordLabel);
  }
  const account=this.root.querySelector<HTMLElement>('#account')!;
  const password=this.root.querySelector<HTMLElement>('#password')!;
  place(account, login.accountInput.x, login.accountInput.y, login.accountInput.width, login.accountInput.height);
  place(password, login.passwordInput.x, login.passwordInput.y, login.passwordInput.width, login.passwordInput.height);
  this.skinButton(this.root.querySelector<HTMLButtonElement>('#auth-login-ok')!, login.ok);
  this.skinButton(this.root.querySelector<HTMLButtonElement>('#register')!, login.register);
  if(fallbackTitle)placeLabel(this.selectScene, '[data-auth-select-title]', 'Title', uiFrame(fallbackTitle, select.title.index), select.title);
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
  if(fallbackPrguse)applyUiFrame(this.createForm, 'Prguse', uiFrame(fallbackPrguse, created.index));
  if(fallbackTitle)placeLabel(this.createForm, '[data-auth-create-title]', 'Title', uiFrame(fallbackTitle, created.title.index), created.title);
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
  const nationalPrguse=session.national.get('prguse'),nationalChrSel=session.national.get('chrsel');
  if(nationalPrguse&&nationalChrSel){
   this.nationalLibraries.set('prguse',nationalPrguse);this.nationalLibraries.set('chrsel',nationalChrSel);this.nationalReady=true;
   this.mountNationalAuth();
   this.renderSlots();
  }else{
   this.nationalReady=false;
  }
  if(!this.nationalReady&&(!fallbackChrSel||!fallbackPrguse||!fallbackTitle))throw new Error('缺少可用的经典登录素材');
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
  this.skinNationalButton(loginButton,prguse,{index:62,hover:62,pressed:62,x:168,y:159,width:76,height:39,backgroundX:0,backgroundY:3});
  this.skinNationalButton(registerButton,prguse,{index:61,hover:61,pressed:61,x:20,y:204,width:104,height:39,backgroundX:4,backgroundY:2});

  applyNationalUiFrame(this.createForm,'prguse',uiFrame(prguse,73));place(this.createForm,250,91);
  const createTitle=this.root.querySelector<HTMLElement>('[data-auth-create-title]');if(createTitle)createTitle.hidden=true;
  const createName=this.root.querySelector<HTMLElement>('#character-name')!;place(createName,70,106,140,20);
  const createOk=this.root.querySelector<HTMLButtonElement>('#auth-create-ok')!,createCancel=this.root.querySelector<HTMLButtonElement>('[data-auth-create-cancel]')!;
  this.skinNationalButton(createOk,prguse,{index:361,hover:362,pressed:363,x:100,y:358,width:80,height:34});
  clearSkin(createCancel);createCancel.onmouseenter=null;createCancel.onmouseleave=null;createCancel.onmousedown=null;createCancel.onmouseup=null;place(createCancel,190,361,76,39);
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
  this.skinNationalButton(this.root.querySelector<HTMLButtonElement>('[data-auth-start]')!,prguse,{index:68,hover:68,pressed:68,x:348,y:450,width:110,height:34,backgroundX:37,backgroundY:6});
  this.skinNationalButton(this.root.querySelector<HTMLButtonElement>('[data-auth-new]')!,prguse,{index:69,hover:69,pressed:69,x:335,y:483,width:130,height:34,backgroundX:13,backgroundY:3});
  this.skinNationalButton(this.root.querySelector<HTMLButtonElement>('[data-auth-exit]')!,prguse,{index:72,hover:72,pressed:72,x:355,y:535,width:90,height:32,backgroundX:24,backgroundY:12});
 }

 bind(handlers:{start:(name:string)=>void;create:()=>void;exit:()=>void}){
  this.onStart=handlers.start;this.onCreate=handlers.create;this.onExit=handlers.exit;
 }

 /** Reflect an in-flight authentication request in every visible auth control. */
 setBusy(busy:boolean){
  this.root.dataset.authBusy=String(busy);
  this.root.setAttribute('aria-busy',String(busy));
  this.root.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.disabled=busy;});
  this.root.querySelectorAll<HTMLInputElement>('input,select').forEach(input=>{input.disabled=busy;});
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
  if(!this.nationalReady&&(!chrSel||!title||!prguse))return;
  this.charactersElement.replaceChildren();
  const spec=select.slot;
  const nationalPrguse=this.nationalLibraries.get('prguse');
  for(let index=0;index<spec.count;index++){
   const character=this.characters[index];
  const button=document.createElement('button');
  button.type='button';
  button.className='auth-slot';
  if(this.nationalReady){
    if(index>1){button.hidden=true;this.charactersElement.append(button);continue;}
    const x=index===0?44:618;place(button,x,448,184,128);button.style.backgroundImage='none';
    const selectSprite=document.createElement('span');selectSprite.className='auth-slot-select';
    const selectX=index===0?89:67,selectY=index===0?4:5;place(selectSprite,selectX,selectY,76,33);
    if(!nationalPrguse)continue;
    const paintSelect=(frameIndex:number)=>paintNationalButton(selectSprite,nationalPrguse,frameIndex,0,0,'');
    paintSelect(index===this.selected?67:66);
    button.onmouseenter=()=>paintSelect(67);
    button.onmouseleave=()=>paintSelect(index===this.selected?67:66);
    button.onmousedown=()=>paintSelect(67);
    button.onmouseup=()=>paintSelect(67);
    button.append(selectSprite);
   }else if(chrSel&&title&&prguse){
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
    button.setAttribute('aria-label',`${character.name}，${character.level}级${['战士','法师','道士'][character.job]??''}`);
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
  if(!chrSel)return;
  const index=portraits[`${selected.job}-${selected.sex}`]??20;
  const frame=uiFrame(chrSel, index);
  this.portrait.src=uiUrl('ChrSel', frame);
  place(this.portrait, select.portrait.x+frame.offsetX, select.portrait.y+frame.offsetY, frame.width, frame.height);
 }

 private renderCreate(){
  const chrSel=this.libraries.get('ChrSel');
  if(!this.nationalReady&&!chrSel)return;
  if(this.nationalReady){
   const nationalChr=this.nationalLibraries.get('chrsel');
   const frame=nationalChr&&uiFrame(nationalChr, nationalPortraits[`${this.job}-${this.sex}`]??80);
   if(frame){
    this.createPortrait.src=nationalUiUrl('chrsel', frame);
    this.createPortrait.alt=['战士','法师','道士'][this.job]??'角色';
    const height=Math.min(frame.height, 318);
    const width=Math.round(frame.width*height/frame.height);
    place(this.createPortrait, 40, 112, width, height);
    this.createPortrait.hidden=false;
   }
  }else if(chrSel){
   const index=portraits[`${this.job}-${this.sex}`]??20;
   const frame=uiFrame(chrSel, index);
   this.createPortrait.src=uiUrl('ChrSel', frame);
   this.createPortrait.alt=['战士','法师','道士'][this.job]??'角色';
   place(this.createPortrait, created.portrait.x+frame.offsetX, created.portrait.y+frame.offsetY, frame.width, frame.height);
   this.createPortrait.hidden=false;
  }
  for(const spec of created.jobs){
  const button=this.root.querySelector<HTMLButtonElement>(`[data-auth-job="${spec.job}"]`);
   const library=this.libraries.get(spec.library);
   if(!button||!library)continue;
   if(this.nationalReady){
    const national=this.nationalLibraries.get('prguse');
    const mapped=nationalCreateJobs.find(value=>value.job===spec.job);
    if(national&&mapped)paintNationalButton(button,national,this.job===spec.job?mapped.active:mapped.normal,0,0,'');
   }else applyUiFrame(button, spec.library, uiFrame(library, this.job===spec.job?spec.active:spec.index));
  }
  for(const spec of created.sexes){
   const button=this.root.querySelector<HTMLButtonElement>(`[data-auth-sex="${spec.sex}"]`);
   const library=this.libraries.get(spec.library);
   if(!button||!library)continue;
   if(this.nationalReady){
    const national=this.nationalLibraries.get('prguse');
    const mapped=nationalCreateSexes.find(value=>value.sex===spec.sex);
    if(national&&mapped)paintNationalButton(button,national,this.sex===spec.sex?mapped.active:mapped.normal,0,0,'');
   }else applyUiFrame(button, spec.library, uiFrame(library, this.sex===spec.sex?spec.active:spec.index));
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

 private skinNationalButton(button:HTMLButtonElement,library:NationalLibrary,spec:{index:number;hover:number;pressed:number;x:number;y:number;width:number;height:number;backgroundX?:number;backgroundY?:number}){
  place(button,spec.x,spec.y,spec.width,spec.height);
  const backgroundX=spec.backgroundX??0,backgroundY=spec.backgroundY??0;
  const hoverFilter=spec.hover===spec.index?'':'brightness(1.12)';
  const pressedFilter=spec.pressed===spec.index?'':'brightness(.88)';
  const paint=(index:number,filter:string)=>paintNationalButton(button,library,index,backgroundX,backgroundY,filter);
  paint(spec.index,'');
  button.onmouseenter=()=>paint(spec.hover,hoverFilter);
  button.onmouseleave=()=>paint(spec.index,'');
  button.onmousedown=()=>paint(spec.pressed,pressedFilter);
  button.onmouseup=()=>paint(spec.hover,hoverFilter);
 }

 private bindNationalToggle(button:HTMLButtonElement,library:NationalLibrary,spec:{normal:number;active:number;hover:number;pressed:number}){
  const selected=()=>button.dataset.authJob!==undefined?this.job===Number(button.dataset.authJob):this.sex===Number(button.dataset.authSex);
  const hoverFilter=spec.hover===spec.active?'':'brightness(1.12)';
  const pressedFilter=spec.pressed===spec.active?'':'brightness(.88)';
  const paint=(index:number,filter='')=>paintNationalButton(button,library,index,0,0,filter);
  paint(selected()?spec.active:spec.normal);
  button.onmouseenter=()=>paint(spec.hover,hoverFilter);
  button.onmouseleave=()=>paint(selected()?spec.active:spec.normal);
  button.onmousedown=()=>paint(spec.pressed,pressedFilter);
  button.onmouseup=()=>paint(spec.hover,hoverFilter);
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

function paintNationalButton(element:HTMLElement,library:NationalLibrary,index:number,backgroundX:number,backgroundY:number,filter:string){
 const frame=uiFrame(library,index);
 element.style.backgroundImage=`url(${nationalUiUrl('prguse',frame)})`;
 element.style.backgroundPosition=`${backgroundX}px ${backgroundY}px`;
 element.style.backgroundRepeat='no-repeat';
 element.style.backgroundColor='transparent';
 element.style.filter=filter;
}
