import {applyUiFrame,loadUiLibrary,uiFrame,uiUrl,type Frame} from './classic-ui';

export type SelectCharacter={name:string;job:number;level:number;sex:number;hair?:number};
type Library=Awaited<ReturnType<typeof loadUiLibrary>>;
type ButtonSpec={library:string;index:number;hover:number;pressed:number;x:number;y:number};

const portraits:Record<string,number>={'0-0':20,'1-0':40,'2-0':60,'0-1':300,'1-1':320,'2-1':340};
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

 constructor(private readonly root:HTMLElement){
  this.loginScene=root.querySelector<HTMLElement>('[data-auth-login]')!;
  this.selectScene=root.querySelector<HTMLElement>('[data-auth-select]')!;
  this.createForm=root.querySelector<HTMLFormElement>('#create-character')!;
  this.charactersElement=root.querySelector<HTMLElement>('#characters')!;
  this.portrait=root.querySelector<HTMLImageElement>('[data-auth-portrait]')!;
  this.createPortrait=root.querySelector<HTMLImageElement>('[data-auth-create-portrait]')!;
  this.jobInput=root.querySelector<HTMLSelectElement>('#character-job')!;
  this.sexInput=root.querySelector<HTMLSelectElement>('#character-sex')!;
  void this.mount();
 }

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
  this.renderCreate();
  this.showLogin();
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
   place(button, spec.x, spec.y+index*spec.step);
   const filled=character?uiFrame(title, spec.filledIndex+character.job+(index===this.selected?5:0)):uiFrame(prguse, spec.index);
   applyUiFrame(button, character?'Title':'Prguse', filled);
   if(character){
    const name=document.createElement('span');name.className='auth-slot-name';name.textContent=character.name;
    const meta=document.createElement('span');meta.className='auth-slot-meta';meta.textContent=`${character.level}  ${['战士','法师','道士'][character.job]??''}`;
    button.append(name, meta);
    button.onclick=()=>{this.selected=index;this.renderSlots();};
    button.ondblclick=()=>this.onStart(character.name);
   }
   this.charactersElement.append(button);
  }
  const selected=this.characters[this.selected];
  if(!selected){this.portrait.hidden=true;return;}
  const index=portraits[`${selected.job}-${selected.sex}`]??20;
  const frame=uiFrame(chrSel, index);
  this.portrait.hidden=false;
  this.portrait.src=uiUrl('ChrSel', frame);
  this.portrait.alt=selected.name;
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
   applyUiFrame(button, spec.library, uiFrame(library, this.job===spec.job?spec.active:spec.index));
  }
  for(const spec of created.sexes){
   const button=this.root.querySelector<HTMLButtonElement>(`[data-auth-sex="${spec.sex}"]`);
   const library=this.libraries.get(spec.library);
   if(!button||!library)continue;
   applyUiFrame(button, spec.library, uiFrame(library, this.sex===spec.sex?spec.active:spec.index));
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

function clipBackdrop(element:HTMLElement,name:string,frame:Frame){
 element.style.width='800px';
 element.style.height='600px';
 element.style.backgroundImage=`url(${uiUrl(name, frame)})`;
 element.style.backgroundRepeat='no-repeat';
 element.style.backgroundPosition='0 0';
}
