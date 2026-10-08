import {NativeHudLabels} from './native-hud-labels';
import type {CharacterAttributes} from './character-panel';
import {arrangeSkillSlots,skillIconIndexOf,type MagicSkill} from './skills';
import {applyNationalUiFrame,applyUiFrame,loadClassicUiSession,loadNationalUiLibrary,loadUiLibrary,uiFrame,uiUrl,nationalUiUrl,type Frame} from './classic-ui';
import {applyNationalCharacterLayout,applyNationalHudLayout,applyNationalInventoryLayout,classicUiLayout,nationalHudOrbMetrics,nationalWindowButtonFrames,placeBox} from './classic-layout';
import {skinServiceWindow} from './service-window';
import {resolveIconFrame,iconHasPixels} from './icon-frames';
import {bindNativeFrameButtonStates,type NativeButtonVisualState} from './native-frame-button';

type ResourceState={hp:number;mp:number;maxHp:number;maxMp:number;experience:number;maxExperience:number};
type UiButton={library:string;index:number;hover:number;pressed:number;x:number;y:number;window:string};
type NationalLibrary=Awaited<ReturnType<typeof loadNationalUiLibrary>>;

function skinNativeFrameButton(button:HTMLButtonElement,library:NationalLibrary,normalIndex:number,hoverIndex:number){
 const normal=uiFrame(library,normalIndex),hover=uiFrame(library,hoverIndex);
 const label=button.getAttribute('aria-label')||button.textContent?.trim()||'';
 if(label){button.setAttribute('aria-label',label);button.title=label;}
 button.textContent='';button.classList.add('native-frame-button');
 const paint=(state:NativeButtonVisualState)=>{
  applyNationalUiFrame(button,'prguse',state==='normal'?normal:hover);
  button.dataset.uiState=state;
 };
 bindNativeFrameButtonStates(button,paint);
}

export class ClassicHud {
 private attributes:CharacterAttributes|undefined;
 private resources:ResourceState={hp:0,mp:0,maxHp:0,maxMp:0,experience:0,maxExperience:0};
 private skills:MagicSkill[]=[];
 private selectedMagicId:number|undefined;
 private map='0';
 private mapTitle='';
 private nativeLabels:NativeHudLabels|undefined;
 private x=0;
 private y=0;
 private statusMask=0;
 private hunger=0;
 private dayBright:number|undefined=classicUiLayout().nationalHud.daylight.initialPhase;
 private dayDarkLevel=0;
 private nationalOrbMode:string|undefined;
 private libraries=new Map<string,Awaited<ReturnType<typeof loadUiLibrary>>>();
 private nationalLibraries=new Map<string,NationalLibrary>();
 private pendingWindowSkins=new Map<HTMLElement,string>();
 private nationalReady=false;
 private readonly job:HTMLElement;
 private readonly levelText:HTMLElement;
 private readonly coords:HTMLElement;
 private readonly hpFill:HTMLElement;
 private readonly mpFill:HTMLElement;
 private readonly hpText:HTMLElement;
 private readonly mpText:HTMLElement;
 private readonly expFill:HTMLElement;
 private readonly expText:HTMLElement;
 private readonly gold:HTMLElement;
 private readonly hotbar:HTMLElement;
 private readonly statusText:HTMLElement;
 private readonly classIcon:HTMLElement;
 private readonly mountTask:Promise<void>;
 private iconLoadFailed=false;
 private iconSerial=1;
 private iconRenderSerial=0;
 private failedIconUrls=new Set<string>();
 private emptyIconUrls=new Set<string>();
 private iconRetryTask:Promise<void>|undefined;

 constructor(private readonly root:HTMLElement,private readonly select:(index:number)=>boolean){
  this.job=root.querySelector<HTMLElement>('[data-hud-job]')!;
  this.levelText=root.querySelector<HTMLElement>('[data-hud-level]')!;
  this.coords=root.querySelector<HTMLElement>('[data-hud-coords]')!;
  this.hpFill=root.querySelector<HTMLElement>('[data-hud-hp-fill]')!;
  this.mpFill=root.querySelector<HTMLElement>('[data-hud-mp-fill]')!;
  this.hpText=root.querySelector<HTMLElement>('[data-hud-hp]')!;
  this.mpText=root.querySelector<HTMLElement>('[data-hud-mp]')!;
  this.expFill=root.querySelector<HTMLElement>('[data-hud-exp-fill]')!;
  this.expText=root.querySelector<HTMLElement>('[data-hud-exp]')!;
  this.gold=root.querySelector<HTMLElement>('[data-hud-gold]')!;
  this.hotbar=root.querySelector<HTMLElement>('[data-hud-hotbar]')!;
  this.statusText=root.querySelector<HTMLElement>('[data-hud-status]')!;
  this.classIcon=root.querySelector<HTMLElement>('[data-hud-class]')!;
 this.mountTask=this.mount(root);
}

 async ready(){await this.mountTask;}
 retryIcons(){
  if(this.iconRetryTask)return this.iconRetryTask;
  this.iconSerial++;this.iconLoadFailed=false;this.failedIconUrls.clear();
  const task=loadNationalUiLibrary('magic-icons').then(icons=>{this.nationalLibraries.set('magic-icons',icons);}).catch(()=>{this.iconLoadFailed=true;}).finally(()=>{if(this.iconRetryTask===task){this.iconRetryTask=undefined;this.renderHotbar();}});
  this.iconRetryTask=task;this.renderHotbar();return task;
 }

 private async mount(root:HTMLElement){
  const session=await loadClassicUiSession();
  for(const [name,library] of session.fallback)this.libraries.set(name,library);
  for(const [name,library] of session.national)this.nationalLibraries.set(name,library);
  this.iconLoadFailed=session.missingNational.includes('magic-icons');
  const nationalPrguse=session.national.get('prguse');
  if(nationalPrguse){this.nationalLibraries.set('prguse',nationalPrguse);this.nationalReady=true;}
  const prguse=this.libraries.get('Prguse');
  if(prguse&&!this.nationalReady){
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-main]')!, 'Prguse', uiFrame(prguse, 0));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-chat]')!, 'Prguse', uiFrame(prguse, 2201));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-chatbar]')!, 'Prguse', uiFrame(prguse, 2035));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-skillbar]')!, 'Prguse', uiFrame(prguse, 2190));
   const orb=uiFrame(prguse, 4);
   this.hpFill.replaceChildren(orbImage(orb, 0));
   this.mpFill.replaceChildren(orbImage(orb, -51));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-exp-track]')!, 'Prguse', uiFrame(prguse, 7));
   applyUiFrame(root.querySelector<HTMLElement>('[data-hud-weight]')!, 'Prguse', uiFrame(prguse, 76));
  }
  if(!this.nationalReady){
   const buttons=classicUiLayout().buttons as Record<string,UiButton>;
   for(const [id,spec] of Object.entries(buttons)){
    const button=root.querySelector<HTMLButtonElement>(`[data-window-open="${spec.window}"]`);
    if(!button)continue;
    if(!prguse)continue;
    button.style.left=`${spec.x}px`;button.style.top=`${spec.y}px`;
    button.textContent='';button.setAttribute('aria-label', id);
    const paint=(state:NativeButtonVisualState)=>applyUiFrame(button,'Prguse',uiFrame(prguse,state==='normal'?spec.index:state==='hover'?spec.hover:spec.pressed));
    bindNativeFrameButtonStates(button,paint);
   }
  }
  if(this.nationalReady){
   this.mountNationalHud(root);
   this.nativeLabels=new NativeHudLabels(root,this.levelText,root.querySelector<HTMLElement>('[data-hud-location]'));
   this.renderLocation();
   this.renderHotbar();
  }
  if(!prguse&&!this.nationalReady)throw new Error('缺少可用的经典 HUD 素材');
  this.applyCursor(document.body);
  this.render();
  this.applyPendingWindowSkins();
 }

 private applyPendingWindowSkins(){
  const pending=[...this.pendingWindowSkins];this.pendingWindowSkins.clear();
  for(const [element,kind] of pending)this.skinWindow(element,kind);
 }

 private mountNationalHud(root:HTMLElement){
  const prguse=this.nationalLibraries.get('prguse');
  if(!prguse)return;
  const layout=classicUiLayout();
  const hud=layout.nationalHud;
  root.classList.add('national-ui');document.body.classList.add('national-play');
  const main=root.querySelector<HTMLElement>('[data-hud-main]')!;
  applyNationalUiFrame(main,'prguse',uiFrame(prguse,hud.mainDialog.index));
  const soundToggle=root.ownerDocument.querySelector<HTMLButtonElement>('#audio-toggle');
  if(soundToggle&&hud.soundToggle){
   applyNationalUiFrame(soundToggle,'prguse',uiFrame(prguse,hud.soundToggle.index));
   placeBox(soundToggle,hud.soundToggle);soundToggle.style.position='absolute';soundToggle.style.right='auto';
   soundToggle.style.zIndex='31';soundToggle.classList.add('native-sound-toggle');
   soundToggle.setAttribute('aria-label',soundToggle.getAttribute('aria-pressed')==='true'?'关闭声音':'开启声音');
   soundToggle.title='声音开关（F12）';
  }
  const skillbar=root.querySelector<HTMLElement>('[data-hud-skillbar]');
  if(skillbar){skillbar.hidden=true;skillbar.setAttribute('aria-hidden','true');}
  for(const selector of ['[data-hud-minimap-frame]','[data-hud-chatbar]','[data-hud-weight]']){
   const element=root.querySelector<HTMLElement>(selector);if(element)element.style.backgroundImage='none';
  }
  this.nationalOrbMode=undefined;
  applyNationalHudLayout(root);
  const windowButtons=Array.from(root.querySelectorAll<HTMLButtonElement>('.hud-window-buttons button'));
  hud.windowButtons.forEach((spec,index)=>{
   const button=windowButtons[index];if(!button)return;
   button.hidden=false;
   const frames=nationalWindowButtonFrames('control' in spec?spec.control:undefined);
   if('remapFrom' in spec&&spec.remapFrom){
    // No native art or executable evidence exists for this extra target button.
    // Keep the target list reachable through the existing utility window.
    clearSkin(button);button.hidden=true;
   }else if(frames){
    skinNationalHudButton(button,prguse,{...frames,x:spec.x,y:spec.y,width:spec.width,height:spec.height,backgroundX:'backgroundX' in spec?spec.backgroundX??0:0,backgroundY:'backgroundY' in spec?spec.backgroundY??0:0});
   }
  });
  for(const spec of hud.toolbar){
   const button=root.querySelector<HTMLButtonElement>(`[data-native-toolbar="${spec.id}"]`);
   if(!button||button.dataset.nativeToolbar!==spec.id)continue;
   placeBox(button,spec);
   skinNativeFrameButton(button,prguse,spec.normal,spec.hover);
  }
 }

 skinWindow(element:HTMLElement,kind:'character'|'inventory'|'npc'|string){
  if(!this.nationalReady&&!this.libraries.size&&!this.nationalLibraries.size){this.pendingWindowSkins.set(element,kind);return;}
  if(['shop','repair','storage'].includes(kind)){
   element.dataset.serviceMode??=kind==='shop'?'buy':kind==='repair'?'repair':'store';
   skinServiceWindow(element,this.nationalLibraries.get('prguse'));return;
  }
  const prguse=this.libraries.get('Prguse'),title=this.libraries.get('Title'),prguse2=this.libraries.get('Prguse2');
  if(this.nationalReady&&this.skinNationalWindow(element,kind))return;
  if(!prguse||!title||!prguse2)return;
  const layout=classicUiLayout();
  const specs:{library:string;index:number;x:number;y:number;closeX:number;closeY:number}=
   kind==='inventory'?{library:layout.windows.inventory.library,index:layout.windows.inventory.index,x:layout.windows.inventory.x,y:layout.windows.inventory.y,closeX:layout.windows.inventory.closeX,closeY:layout.windows.inventory.closeY}:
   kind==='npc'?{library:layout.windows.npc.library,index:layout.windows.npc.index,x:layout.windows.npc.x,y:layout.windows.npc.y,closeX:layout.windows.npc.closeX,closeY:layout.windows.npc.closeY}:
   kind==='character'||kind==='equipment'||kind==='skills'?{library:layout.windows.character.library,index:layout.windows.character.index,x:layout.windows.character.x,y:layout.windows.character.y,closeX:layout.windows.character.closeX,closeY:layout.windows.character.closeY}:
   {library:'Title',index:504,x:268,y:80,closeX:241,closeY:3};
  const library=this.libraries.get(specs.library)!;
  const frame=uiFrame(library, specs.index);
  if(element.dataset.windowMoved!=='true'){element.style.left=`${specs.x}px`;element.style.top=`${specs.y}px`;if(element.id==='classic-window'){element.style.setProperty('--classic-window-left',`${specs.x}px`);element.style.setProperty('--classic-window-top',`${specs.y}px`);}}
  element.style.right='auto';element.style.bottom='auto';
  applyUiFrame(element, specs.library, frame);
  if(kind==='character'||kind==='equipment'||kind==='skills'){
   const page=element.querySelector<HTMLElement>('[data-character-page="paperdoll"]');
   if(page)applyUiFrame(page, 'Prguse', uiFrame(prguse, layout.characterPage.index));
   const status=element.querySelector<HTMLElement>('[data-character-page="status"]');
   if(status)applyUiFrame(status, 'Title', uiFrame(title, 506));
   const state=element.querySelector<HTMLElement>('[data-character-page="state"]');
   if(state)applyUiFrame(state, 'Title', uiFrame(title, 507));
   const skills=element.querySelector<HTMLElement>('[data-character-page="skills"]');
   if(skills)applyUiFrame(skills, 'Title', uiFrame(title, 508));
   for(const tab of layout.characterTabs){
    const button=element.querySelector<HTMLButtonElement>(`[data-character-tab="${tab.id}"]`);
    if(!button)continue;
    button.style.left=`${tab.x}px`;button.style.top=`${tab.y}px`;
    applyUiFrame(button, 'Title', uiFrame(title, tab.index));
    button.textContent='';
   }
  }
  const close=element.querySelector<HTMLButtonElement>('#classic-window-close, [data-window-close], #close-dialogue');
  if(close){const closeFrame=uiFrame(prguse2, 360);close.style.left=`${specs.closeX}px`;close.style.top=`${specs.closeY}px`;applyUiFrame(close, 'Prguse2', closeFrame);close.textContent='';}
 }

 private skinNationalWindow(element:HTMLElement,kind:string){
  if(skinServiceWindow(element,this.nationalLibraries.get('prguse')))return true;
  const prguse=this.nationalLibraries.get('prguse');
  const layout=classicUiLayout();
  const specs:Record<string,{index:number;x:number;y:number;closeX:number;closeY:number;closeWidth:number;closeHeight:number;padding?:string;paintClose?:boolean}>={
   npc:{index:402,x:192,y:126,closeX:385,closeY:-37,closeWidth:17,closeHeight:23},
   quest:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   attack:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   targets:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   ground:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   group:{index:layout.nationalUtilityWindows.group.index,x:layout.nationalUtilityWindows.group.x,y:layout.nationalUtilityWindows.group.y,closeX:layout.nationalUtilityWindows.group.close.x,closeY:layout.nationalUtilityWindows.group.close.y,closeWidth:layout.nationalUtilityWindows.group.close.width,closeHeight:layout.nationalUtilityWindows.group.close.height,padding:layout.nationalUtilityWindows.group.padding},
   guild:{index:layout.nationalUtilityWindows.guild.index,x:layout.nationalUtilityWindows.guild.x,y:layout.nationalUtilityWindows.guild.y,closeX:layout.nationalUtilityWindows.guild.close.x,closeY:layout.nationalUtilityWindows.guild.close.y,closeWidth:layout.nationalUtilityWindows.guild.close.width,closeHeight:layout.nationalUtilityWindows.guild.close.height,padding:layout.nationalUtilityWindows.guild.padding},
   system:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   chat:{index:402,x:192,y:126,closeX:399,closeY:1,closeWidth:17,closeHeight:23},
   trade:{index:layout.nationalUtilityWindows.trade.index,x:layout.nationalUtilityWindows.trade.x,y:layout.nationalUtilityWindows.trade.y,closeX:layout.nationalUtilityWindows.trade.close.x,closeY:layout.nationalUtilityWindows.trade.close.y,closeWidth:layout.nationalUtilityWindows.trade.close.width,closeHeight:layout.nationalUtilityWindows.trade.close.height,padding:layout.nationalUtilityWindows.trade.padding}
  };
  const spec=kind==='character'||kind==='equipment'||kind==='skills'?{
   index:layout.nationalCharacterWindow.index,x:layout.nationalCharacterWindow.x,y:layout.nationalCharacterWindow.y,
   closeX:layout.nationalCharacterWindow.close.x,closeY:layout.nationalCharacterWindow.close.y,
   closeWidth:layout.nationalCharacterWindow.close.width,closeHeight:layout.nationalCharacterWindow.close.height,
   paintClose:layout.nationalCharacterWindow.close.paint
  }:kind==='inventory'?{
   index:layout.nationalInventoryWindow.index,x:layout.nationalInventoryWindow.x,y:layout.nationalInventoryWindow.y,
   closeX:layout.nationalInventoryWindow.close.x,closeY:layout.nationalInventoryWindow.close.y,
   closeWidth:layout.nationalInventoryWindow.close.width,closeHeight:layout.nationalInventoryWindow.close.height
  }:specs[kind];
  if(!prguse||!spec)return false;
  const frame=uiFrame(prguse,spec.index);
  element.classList.add('national-window');element.classList.toggle('national-panel',['shop','repair','storage','quest','attack','targets','ground','group','guild','system','chat','trade'].includes(kind));element.dataset.windowKind=kind;const minWindowTop=Math.min(0,spec.y);if(minWindowTop<0)element.dataset.windowMinTop=String(minWindowTop);else delete element.dataset.windowMinTop;if(element.dataset.windowMoved!=='true'){element.style.left=`${spec.x}px`;element.style.top=`${spec.y}px`;if(element.id==='classic-window'){element.style.setProperty('--classic-window-left',`${spec.x}px`);element.style.setProperty('--classic-window-top',`${spec.y}px`);}}element.style.right='auto';element.style.bottom='auto';if(spec.padding!==undefined)element.style.setProperty('--classic-window-padding',spec.padding);
  applyNationalUiFrame(element,'prguse',frame);
  if(kind==='group'){
   const controls=layout.nationalUtilityWindows.group.buttons;
   for(const [name,spec] of Object.entries(controls)){
    const button=element.querySelector<HTMLButtonElement>(`#group-${name}`);if(!button)continue;
    button.style.left=`${spec.x}px`;button.style.top=`${spec.y}px`;
    skinNativeFrameButton(button,prguse,spec.index,spec.index);
   }
  }
  if(kind==='trade'){
   const remote=element.querySelector<HTMLElement>('[data-trade-remote-window]'),remoteSpec=layout.nationalUtilityWindows.trade.remote;
   if(remote){applyNationalUiFrame(remote,'prguse',uiFrame(prguse,remoteSpec.index));remote.style.position='absolute';remote.style.left=`${remoteSpec.left}px`;remote.style.top=`${remoteSpec.top}px`;remote.style.right='auto';remote.style.bottom='auto';}
   const confirm=uiFrame(prguse,layout.nationalUtilityWindows.trade.confirm.index);
   element.querySelectorAll<HTMLButtonElement>('[data-trade-confirm]').forEach(button=>{applyNationalUiFrame(button,'prguse',confirm);button.style.backgroundRepeat='no-repeat';});
  }
  if(kind==='guild'){
   const buttons=layout.nationalUtilityWindows.guild.buttons;
   const controls=[
    ['#guild-open',buttons.open],['#guild-members-request',buttons.members],['#guild-chat-toggle',buttons.chat],['#guild-add',buttons.add],
    ['#guild-ally',buttons.ally],['#guild-break-ally',buttons.breakAlly],['#guild-remove',buttons.remove],
    ['#guild-ranks-save',buttons.ranks],['#guild-notice-save',buttons.notice],['#guild-war-request',buttons.war]
   ] as const;
   for(const [selector,frames] of controls){const button=element.querySelector<HTMLButtonElement>(selector);if(!button)continue;skinNativeFrameButton(button,prguse,frames.normal,frames.hover);const geometry=frames.geometry;if(geometry){button.style.left=`${geometry.x}px`;button.style.top=`${geometry.y}px`;button.style.width=`${geometry.width}px`;button.style.height=`${geometry.height}px`;}}
   const scrollButtons=layout.nationalUtilityWindows.guild.scrollButtons;
   for(const [id,geometry] of [['guild-scroll-up',scrollButtons.up],['guild-scroll-down',scrollButtons.down]] as const){const button=element.querySelector<HTMLButtonElement>(`#${id}`);if(!button)continue;button.style.left=`${geometry.x}px`;button.style.top=`${geometry.y}px`;button.style.width=`${geometry.width}px`;button.style.height=`${geometry.height}px`;}
  }
  if(element.id==='classic-window'){
   element.style.setProperty('--classic-window-width',`${frame.width}px`);element.style.setProperty('--classic-window-height',`${frame.height}px`);
   element.style.setProperty('--classic-window-background',`url('${nationalUiUrl('prguse',frame)}')`);
   element.style.setProperty('--classic-window-padding',spec.padding??'38px 14px 12px');
   element.style.setProperty('--classic-window-close-left',`${spec.closeX}px`);element.style.setProperty('--classic-window-close-top',`${spec.closeY}px`);
   element.style.setProperty('--classic-window-close-width',`${spec.closeWidth}px`);element.style.setProperty('--classic-window-close-height',`${spec.closeHeight}px`);
  }
  if(kind==='character'||kind==='equipment'||kind==='skills'){
   const paper=element.querySelector<HTMLElement>('[data-character-page="paperdoll"]');
   if(paper)applyNationalUiFrame(paper,'prguse',uiFrame(prguse,layout.nationalCharacterPage.index));
   const status=element.querySelector<HTMLElement>('[data-character-page="status"]');
   if(status)clearSkin(status);
    for(const pageName of ['state','skills'] as const){
     const page=element.querySelector<HTMLElement>(`[data-character-page="${pageName}"]`);
     const pageSpec=pageName==='state'?layout.nationalCharacterWindow.statePage:layout.nationalCharacterWindow.skillsPage;
     if(page)applyNationalUiFrame(page,'prguse',uiFrame(prguse,pageSpec.index));
    }
   const controls=layout.nationalCharacterWindow.pageButtons;
   for(const [direction,control] of Object.entries(controls)){
    const button=element.querySelector<HTMLButtonElement>(`[data-character-cycle="${direction}"]`);
    if(button){clearSkin(button);placeBox(button,control);button.textContent='';}
   }
   applyNationalCharacterLayout(element);
  }
  if(kind==='inventory'){
   const goldIcon=element.querySelector<HTMLElement>('[data-inventory-gold-icon]');
   if(goldIcon)applyNationalUiFrame(goldIcon,'prguse',uiFrame(prguse,layout.nationalInventoryGrid.goldIcon.index));
   applyNationalInventoryLayout(element);
  }
  const close=element.querySelector<HTMLButtonElement>('#classic-window-close, [data-window-close], #close-dialogue, .classic-window-close');
  if(close)skinNationalClose(close,prguse,spec);
  return true;
 }

 applyCursor(root:HTMLElement){
  const national=root.classList.contains('national-play');
  // The 2003 skin has no verified national cursor atlas. Its reference client
  // compiles with USECURSOR=DEFAULTCURSOR; keep Crystal .CUR art on fallback only.
  root.style.setProperty('--cursor-default', national?'auto':"url('/ui/Cursors/Cursor_Default.CUR'), auto");
  root.style.setProperty('--cursor-attack', national?'crosshair':"url('/ui/Cursors/Cursor_Normal_Atk.CUR'), crosshair");
  root.style.setProperty('--cursor-attack-red', national?'crosshair':"url('/ui/Cursors/Cursor_Compulsion_Atk.CUR'), crosshair");
  root.style.setProperty('--cursor-npc', national?'pointer':"url('/ui/Cursors/Cursor_Npc.CUR'), pointer");
  root.style.setProperty('--cursor-text', national?'text':"url('/ui/Cursors/Cursor_TextPrompt.CUR'), text");
  root.style.setProperty('--cursor-trash', national?'no-drop':"url('/ui/Cursors/Cursor_Trash.CUR'), pointer");
  root.classList.add('classic-cursors');
 }

 clear(){this.mapTitle='';this.x=0;this.y=0;this.renderLocation();this.attributes=undefined;this.skills=[];this.selectedMagicId=undefined;this.statusMask=0;this.hunger=0;this.dayBright=classicUiLayout().nationalHud.daylight.initialPhase;this.dayDarkLevel=0;this.resources={hp:0,mp:0,maxHp:0,maxMp:0,experience:0,maxExperience:0};this.render();}
 replaceAttributes(attributes:CharacterAttributes){this.attributes=attributes;this.resources={...this.resources,hp:attributes.hp,mp:attributes.mp,maxHp:attributes.maxHp,maxMp:attributes.maxMp,experience:attributes.experience,maxExperience:attributes.maxExperience};this.render();}
 currency(values:{gold?:number;gameGold?:number}){if(!this.attributes)return;this.attributes={...this.attributes,...values};this.gold.textContent=String(this.attributes.gold);}
 weights(values:{weight:number;wearWeight:number;handWeight:number}){if(!this.attributes)return;this.attributes={...this.attributes,...values};this.renderBars();}
 daylight(phase:number,darkLevel:number){this.dayBright=Number.isInteger(phase)?phase:undefined;this.dayDarkLevel=darkLevel;this.renderStatus();}
 resource(values:Partial<ResourceState>){this.resources={...this.resources,...values};this.renderBars();}
 experience(total:number){this.resources.experience=total;this.renderBars();}
 level(level:number,total:number){if(this.attributes)this.attributes={...this.attributes,level,experience:total};this.resources.experience=total;this.render();}
 replaceSkills(skills:MagicSkill[]){this.skills=[...skills];this.selectedMagicId=undefined;this.renderHotbar();}
 addSkill(skill:MagicSkill){this.skills=[...this.skills.filter(value=>value.magicId!==skill.magicId),skill];this.renderHotbar();}
 removeSkill(magicId:number){this.skills=this.skills.filter(skill=>skill.magicId!==magicId);if(this.selectedMagicId===magicId)this.selectedMagicId=undefined;this.renderHotbar();}
 progress(magicId:number,level:number,currentTrain:number){this.skills=this.skills.map(skill=>skill.magicId===magicId?{...skill,level,currentTrain}:skill);this.renderHotbar();}
 beginMap(map:string){this.mapTitle='';this.position(map,0,0);}
 mapDescription(title:string){this.mapTitle=title;this.renderLocation();}
 position(map:string,x:number,y:number){if(map!==this.map)this.mapTitle='';this.map=map;this.x=x;this.y=y;this.coords.textContent=`${x}:${y}`;this.renderLocation();}
 private renderLocation(){
  const value=this.mapTitle?`${this.mapTitle} ${this.x}:${this.y}`:` ${this.x}:${this.y}`;
  if(this.nativeLabels)this.nativeLabels.setLocation(value);
  else{const location=this.root.querySelector<HTMLElement>('[data-hud-location]');if(location)location.textContent=value;}
 }
 status(mask:number){this.statusMask=mask>>>0;this.renderStatus();}
 hungerStatus(value:number){this.hunger=Number.isInteger(value)&&value>=1&&value<=4?value:0;this.renderStatus();}
 selectSkill(magicId:number|undefined){this.selectedMagicId=magicId;this.renderHotbar();}

 private render(){
  const jobNames=['战士','法师','道士'];
  this.job.hidden=this.nationalReady;
  this.job.textContent=this.attributes?jobNames[this.attributes.job]??`职业 ${this.attributes.job}`:'';
  const level=this.attributes?`${this.attributes.level}`:'';
  if(this.nativeLabels)this.nativeLabels.setLevel(level);else this.levelText.textContent=level;
  this.gold.textContent=this.attributes?String(this.attributes.gold):'0';
  this.gold.hidden=this.nationalReady;
  this.coords.textContent=`${this.x}:${this.y}`;
  const prguse=this.libraries.get('Prguse');
  if(prguse&&this.attributes&&!this.nationalReady){
   const icon=uiFrame(prguse, 100+(this.attributes.job===1?1:this.attributes.job===2?2:0));
   applyUiFrame(this.classIcon, 'Prguse', icon);
   this.classIcon.hidden=false;
  }else this.classIcon.hidden=true;
  this.renderBars();
  this.renderStatus();
  this.renderHotbar();
 }
 private renderBars(){
  const {hp,mp,maxHp,maxMp,experience,maxExperience}=this.resources;
  this.hpText.textContent=`${Math.max(0,hp)}/${Math.max(0,maxHp)}`;
  this.mpText.textContent=`${Math.max(0,mp)}/${Math.max(0,maxMp)}`;
  this.hpText.hidden=this.nationalReady;this.mpText.hidden=this.nationalReady;this.expText.hidden=this.nationalReady;
  if(this.nationalReady){this.renderNationalBars();return;}
  const orbHeight=80,barWidth=784,weightWidth=76;
  this.hpFill.style.height=`${ratio(hp,maxHp)*orbHeight}px`;
  this.mpFill.style.height=`${ratio(mp,maxMp)*orbHeight}px`;
  this.expFill.style.width=`${ratio(experience,maxExperience)*barWidth}px`;
  this.expText.textContent=`${Math.max(0,experience)}/${Math.max(0,maxExperience)}`;
  const weight=this.attributes?ratio(this.attributes.weight,this.attributes.maxWeight):0;
  const weightFill=this.root.querySelector<HTMLElement>('[data-hud-weight-fill]');
  if(weightFill)weightFill.style.width=`${weight*weightWidth}px`;
 }
 private renderNationalBars(){
  const hud=classicUiLayout().nationalHud,prguse=this.nationalLibraries.get('prguse');
  if(!prguse)return;
  const warrior=this.attributes?.job===hud.orbs.warrior.job&&this.attributes.level<hud.orbs.warrior.levelBelow;
  const mode=warrior?'warrior':'split',spec=warrior?hud.orbs.warrior:hud.orbs.hp;
  const hpWell=this.root.querySelector<HTMLElement>('.hud-orb-well.hp'),mpWell=this.root.querySelector<HTMLElement>('.hud-orb-well.mp');
  const empty=this.root.querySelector<HTMLElement>('.hud-orb-well.hp [data-hud-orb-image]');
  const enabled=Boolean(this.attributes)&&this.resources.maxHp>0&&this.resources.maxMp>0;
  if(hpWell){placeBox(hpWell,spec);hpWell.hidden=!enabled;hpWell.title=`HP ${this.resources.hp}/${this.resources.maxHp}`;}
  if(mpWell){placeBox(mpWell,hud.orbs.mp);mpWell.hidden=!enabled||warrior;mpWell.title=`MP ${this.resources.mp}/${this.resources.maxMp}`;}
  if(empty)empty.hidden=!warrior;
  const frame=uiFrame(prguse,warrior?hud.orbs.warrior.fillIndex:hud.orbs.splitIndex);
  if(this.nationalOrbMode!==mode){
   this.nationalOrbMode=mode;
   this.hpFill.replaceChildren(orbImage(frame,0,true));
   this.mpFill.replaceChildren(orbImage(uiFrame(prguse,hud.orbs.splitIndex),hud.orbs.mp.imageOffsetX,true));
   if(warrior&&empty)applyNationalUiFrame(empty,'prguse',uiFrame(prguse,hud.orbs.warrior.emptyIndex));
  }
  this.hpFill.style.width=`${spec.width}px`;this.mpFill.style.width=`${hud.orbs.mp.width}px`;
  for(const [fill,width,height] of [[this.hpFill,frame.width,frame.height],[this.mpFill,hud.orbs.fillImageWidth,hud.orbs.fillImageHeight]] as const){
   const image=fill.querySelector<HTMLImageElement>('img');
   if(image){image.style.width=`${width}px`;image.style.height=`${height}px`;}
  }
  this.hpFill.style.height=`${enabled?classicOrbHeight(spec.height,this.resources.hp,this.resources.maxHp):0}px`;
  this.mpFill.style.height=`${enabled&&!warrior?classicOrbHeight(hud.orbs.mp.height,this.resources.mp,this.resources.maxMp):0}px`;
  const barsEnabled=Boolean(this.attributes)&&this.resources.maxExperience>0&&(this.attributes?.maxWeight??0)>0;
  const weightFill=this.root.querySelector<HTMLElement>('[data-hud-weight-fill]');
  for(const [track,fill,box,value,max] of [
   [this.root.querySelector<HTMLElement>('[data-hud-exp-track]'),this.expFill,hud.experienceBar,this.resources.experience,this.resources.maxExperience],
   [this.root.querySelector<HTMLElement>('[data-hud-weight]'),weightFill,hud.weightBar,this.attributes?.weight??0,this.attributes?.maxWeight??0]
  ] as const){
   if(track){track.style.backgroundImage='none';placeBox(track,box);track.title=`${Math.max(0,value)}/${Math.max(0,max)}`;}
   if(fill){
    const bar=uiFrame(prguse,box.index);fill.style.backgroundImage=`url(${nationalUiUrl('prguse',bar)})`;
    fill.style.backgroundColor='transparent';fill.style.backgroundRepeat='no-repeat';fill.style.backgroundSize=`${bar.width}px ${bar.height}px`;
    fill.style.width=`${barsEnabled?classicBarWidth(box.width,value,max):0}px`;
   }
  }
 }
 private renderStatus(){
  const labels:[[number,string],...Array<[number,string]>]=[
   [0x80000000,'绿毒'],[0x40000000,'红毒'],[0x20000000,'禁魔'],[0x10000000,'蛛网'],
   [0x08000000,'定身'],[0x04000000,'防麻'],[0x01000000,'加速'],[0x00800000,'隐身'],
   [0x00400000,'神圣战甲'],[0x00200000,'幽灵盾'],[0x00100000,'魔法盾'],[0x00000001,'石化'],[0x00000002,'开天眼']
  ];
  const active=labels.filter(([bit])=>(this.statusMask&bit)!==0).map(([,label])=>label);
  const hunger=['','饱食等级 1','饱食等级 2','饱食等级 3','饱食等级 4'][this.hunger]??'';
  this.statusText.textContent=[...active,hunger].filter(Boolean).join(' ');
  this.statusText.hidden=this.nationalReady;
  this.statusText.classList.toggle('hud-status-alert',active.length>0);
  this.renderNationalIndicators();
 }
 private renderNationalIndicators(){
  const hud=classicUiLayout().nationalHud,prguse=this.nationalLibraries.get('prguse');
  const hunger=this.root.querySelector<HTMLElement>('[data-hud-hunger]'),daylight=this.root.querySelector<HTMLElement>('[data-hud-daylight]');
  const phase=hud.daylight.phases.find(value=>value.phase===this.dayBright);
  for(const [element,spec,index,label,visible] of [
   [hunger,hud.hunger,hud.hunger.firstIndex+this.hunger-1,`饱食等级 ${this.hunger}`,Boolean(this.attributes)&&hud.hunger.states.includes(this.hunger)],
   [daylight,hud.daylight,phase?.index??0,phase?.label??'',Boolean(phase)]
  ] as const){
   if(!element)continue;
   element.hidden=!this.nationalReady||!prguse||!visible;
   if(element.hidden){element.style.backgroundImage='none';element.title='';element.removeAttribute('aria-label');continue;}
   applyNationalUiFrame(element,'prguse',uiFrame(prguse!,index));placeBox(element,spec);
   element.setAttribute('role','img');element.setAttribute('aria-label',label);element.title=label;
  }
  if(daylight)daylight.dataset.darkLevel=String(this.dayDarkLevel);
 }
 private renderHotbar(){
  const renderGeneration=++this.iconRenderSerial;
  this.hotbar.replaceChildren();
  const nationalIcons=this.nationalLibraries.get('magic-icons');
  const skills=arrangeSkillSlots(this.skills);
  for(let index=0;index<8;index++){
   const skill=skills[index],button=document.createElement('button');
   button.type='button';button.className='hud-slot';button.style.left=`${15+index*25}px`;button.style.top='3px';
   if(this.nationalReady){button.style.left=`${index*31}px`;button.style.top='1px';button.style.width='26px';button.style.height='26px';}
   button.title=skill?`${skill.name} · ${skill.level}级`:`F${index+1}`;
   if(skill&&skill.magicId===this.selectedMagicId)button.classList.add('selected');
   if(skill){
    const iconIndex=skillIconIndexOf(skill);
    const resolved=resolveIconFrame(iconIndex,[{namespace:'/ui-national/magic-icons',library:nationalIcons}]);
    if(resolved.status==='ready'&&resolved.frame&&resolved.url&&!this.failedIconUrls.has(resolved.url)&&!this.emptyIconUrls.has(resolved.url)){
     const image=new Image(),url=resolved.url,generation=this.iconSerial;image.alt=skill.name;image.dataset.iconDomain=resolved.domain;
     const current=()=>generation===this.iconSerial&&renderGeneration===this.iconRenderSerial;
     const failed=()=>{if(!current())return;this.failedIconUrls.add(url);this.renderHotbar();};
     image.onerror=failed;image.onload=()=>{if(!current())return;if(image.naturalWidth!==resolved.frame!.width||image.naturalHeight!==resolved.frame!.height){failed();return;}if(iconHasPixels(image,image.naturalWidth,image.naturalHeight)===false){this.emptyIconUrls.add(url);this.failedIconUrls.delete(url);this.renderHotbar();}};
     image.src=url+(this.iconSerial>1?`?retry=${this.iconSerial}`:'');button.append(image);
    }else{const missing=document.createElement('span');missing.className='hud-icon-missing';missing.textContent='?';missing.setAttribute('aria-label','图标暂缺');button.title+=' · 图标暂缺';button.append(missing);}
   }
   const key=document.createElement('kbd');key.textContent=`F${index+1}`;button.append(key);
   button.onclick=()=>{this.select(index);};
   button.oncontextmenu=event=>{event.preventDefault();this.select(index);};
   this.hotbar.append(button);
  }
  if(this.iconLoadFailed||this.failedIconUrls.size){const retry=document.createElement('button');retry.type='button';retry.className='hud-icon-retry';retry.textContent='图标加载失败，重试';retry.style.position='absolute';retry.style.top='30px';retry.style.left='0';retry.disabled=Boolean(this.iconRetryTask);retry.onclick=()=>{void this.retryIcons();};this.hotbar.append(retry);}
 }
}

function orbImage(frame:Frame,offsetX:number,national=false){
 const image=new Image();image.src=national?nationalUiUrl('prguse', frame):uiUrl('Prguse', frame);image.alt='';image.style.left=`${offsetX}px`;return image;
}
function clearSkin(element:HTMLElement){element.style.backgroundImage='none';element.style.backgroundColor='transparent';}
function skinNationalClose(button:HTMLButtonElement,library:NationalLibrary,spec:{closeX:number;closeY:number;closeWidth:number;closeHeight:number;paintClose?:boolean}){
 clearSkin(button);button.style.left=`${spec.closeX}px`;button.style.top=`${spec.closeY}px`;button.style.right='auto';button.style.width=`${spec.closeWidth}px`;button.style.height=`${spec.closeHeight}px`;button.style.padding='0';button.style.border='0';button.textContent='';
 if(spec.paintClose){const frame=uiFrame(library,371);button.style.setProperty('background-image',`url(${nationalUiUrl('prguse',frame)})`,'important');button.style.backgroundRepeat='no-repeat';}
}
function skinNationalHudButton(button:HTMLButtonElement,library:NationalLibrary,spec:{index:number;hover:number;pressed:number;x:number;y:number;width:number;height:number;backgroundX:number;backgroundY:number}){
 button.style.left=`${spec.x}px`;button.style.top=`${spec.y}px`;button.style.width=`${spec.width}px`;button.style.height=`${spec.height}px`;
 const paint=(index:number,filter:string)=>{
  const frame=uiFrame(library,index);
  button.style.setProperty('background-image',`url(${nationalUiUrl('prguse',frame)})`,'important');
  button.style.backgroundPosition=`${spec.backgroundX}px ${spec.backgroundY}px`;
  button.style.backgroundRepeat='no-repeat';button.style.backgroundColor='transparent';button.style.filter=filter;
 };
 const hoverFilter=spec.hover===spec.index?'':'brightness(1.14)',pressedFilter=spec.pressed===spec.index?'':'brightness(.86)';
 const paintState=(state:NativeButtonVisualState)=>{
  const index=state==='normal'?spec.index:state==='hover'?spec.hover:spec.pressed;
  paint(index,state==='normal'?'':state==='hover'?hoverFilter:pressedFilter);
  button.dataset.uiState=state;
 };
 bindNativeFrameButtonStates(button,paintState);
}
function ratio(value:number,max:number){return max>0?Math.max(0,Math.min(1,value/max)):0;}

// Delphi Round uses the nearest even integer on half-pixel ties.
function classicRound(value:number){
 const floor=Math.floor(value),fraction=value-floor;
 return fraction===.5?(floor%2===0?floor:floor+1):Math.round(value);
}
function classicOrbHeight(height:number,value:number,max:number){
 if(!(max>0)||!Number.isFinite(value))return 0;
 const current=Math.max(0,Math.min(max,value));
 return height-classicRound(height/max*(max-current));
}
function classicBarWidth(width:number,value:number,max:number){
 if(!(max>0)||!Number.isFinite(value)||value<=0)return 0;
 return Math.max(0,Math.min(width,classicRound(width/(max/value))));
}
