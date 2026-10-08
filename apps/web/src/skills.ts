import {loadNationalUiLibrary} from './classic-ui';
import {resolveIconFrame,iconHasPixels,type IconLibrary} from './icon-frames';
import skillInput from '../../../content/classic-176/skill-input.json';
import iconUsage from '../../../content/classic-176/icon-usage.json';
import {classicUiLayout} from './classic-layout';
import {loadNativeUiFont} from './native-ui-font';
import {loadNativeSkillArt} from './native-skill-art';

export type MagicSkill={key:number;level:number;currentTrain:number;magicId:number;name:string;effectType:number;effect:number;spell:number;power:number;trainLevels:number[];maxTrain:number[];job:number;delay:number;defSpell:number;defPower:number;maxPower:number;defMaxPower:number;description:string};
export type SkillUse='hostile'|'self'|'toggle'|'charge'|'passive'|'ground'|'support'|'directional'|'rush';
export const SKILL_RANGE=skillInput.range;
export const skillUse=Object.fromEntries(Object.entries(skillInput.skills).map(([id,rule])=>[id,rule.use])) as Record<number,SkillUse>;
export function skillUseOf(magicId:number):SkillUse{return skillUse[magicId]??'hostile';}
/** Delphi FState.DStMag1DirectPaint: btEffect * 2, Downed uses the next state. */
export function skillIconIndexOf(skill:Pick<MagicSkill,'effect'>,pressed=false){return Number.isInteger(skill.effect)&&skill.effect>=0&&skill.effect<=255?skill.effect*iconUsage.skills.normalMultiplier+(pressed?iconUsage.skills.pressedOffset:0):NaN;}
export function spellCost(skill:Pick<MagicSkill,'spell'|'defSpell'|'level'>){
 return Math.round(skill.spell/4*(skill.level+1))+skill.defSpell;
}
export function arrangeSkills(skills:Iterable<MagicSkill>){
 const values=[...skills],assigned=arrangeSkillSlots(values).filter((skill):skill is MagicSkill=>skill!==undefined);
 const assignedIds=new Set(assigned.map(skill=>skill.magicId));
 return [...assigned,...values.filter(skill=>!assignedIds.has(skill.magicId))];
}
export function skillKeySlot(key:number){return Number.isInteger(key)&&key>=49&&key<=56?key-49:undefined;}
export function validSkillKey(key:number){return key===0||skillKeySlot(key)!==undefined;}
export function skillKeyLabel(key:number){const slot=skillKeySlot(key);return slot===undefined?'None':`F${slot+1}`;}
export function arrangeSkillSlots(skills:Iterable<MagicSkill>):Array<MagicSkill|undefined>{
 const ordered:Array<MagicSkill|undefined>=Array(8).fill(undefined);
 for(const skill of skills){
  const slot=skillKeySlot(skill.key);
  if(slot!==undefined&&ordered[slot]===undefined)ordered[slot]=skill;
 }
 return ordered;
}

type SkillActions={select:(skill:MagicSkill|undefined)=>void;self:(skill:MagicSkill)=>void;bind?:(skill:MagicSkill,key:number,bindingId:number)=>boolean;chooseKey?:(skill:MagicSkill)=>Promise<number|'interrupted'>;closeKeyDialog?:()=>void};
type KeyBinding={magicId:number;key:number;bindingId:number};
type NativeSkillLabels={row:HTMLElement;skill:MagicSkill;name:HTMLElement;training:HTMLElement;key:HTMLElement};

export class SkillBar {
 private skills=new Map<number,MagicSkill>();private selected:number|undefined;private pending:number|undefined;private known=false;private warrior={thrusting:false,halfMoon:false,fireHit:false,powerHit:false};private nationalIcons?:IconLibrary;
 private iconLoadTask:Promise<void>|undefined;private iconLoadFailed=false;private iconSerial=0;private iconRenderSerial=0;private failedIconUrls=new Set<string>();private emptyIconUrls=new Set<string>();
 private bindingSerial=0;private binding:KeyBinding|undefined;private bindingTimer:ReturnType<typeof setTimeout>|undefined;private bindingEditor:number|undefined;private bindingDraft=0;private bindingMessage='';
 private nativePage=0;private editorSerial=0;
 constructor(private element:HTMLElement,private actions:SkillActions){
  element.addEventListener('pointercancel',()=>this.cancelKeyBinding());
  element.addEventListener('wheel',event=>{
   if(!this.element.closest?.('.character-window')||!event.deltaY)return;
   const rows=classicUiLayout().nationalCharacterWindow.skillRows.count;
   if(this.skills.size<=rows)return;
   event.preventDefault();event.stopPropagation();
   this.nativePage=Math.max(0,Math.min(Math.ceil(this.skills.size/rows)-1,this.nativePage+(event.deltaY>0?1:-1)));this.render();
  },{passive:false});
  if(typeof window!=='undefined')window.addEventListener('blur',()=>this.cancelKeyBinding());
  if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancelKeyBinding();});
  this.render();
  void this.retryIcons();
 }
 retryIcons(){
  if(this.iconLoadTask)return this.iconLoadTask;
  this.iconSerial++;this.iconLoadFailed=false;this.failedIconUrls.clear();this.render();
  const task=loadNationalUiLibrary('magic-icons').then(icons=>{this.nationalIcons=icons;this.render();}).catch(()=>{this.iconLoadFailed=true;this.render();}).finally(()=>{if(this.iconLoadTask===task){this.iconLoadTask=undefined;this.render();}});
  this.iconLoadTask=task;return task;
 }
 warriorState(state:Partial<typeof this.warrior>){this.warrior={...this.warrior,...state};this.render();}
 clear(){this.cancelKeyBinding();this.clearSelected();this.clearBindingPending();this.bindingEditor=undefined;this.bindingMessage='';this.nativePage=0;this.warrior={thrusting:false,halfMoon:false,fireHit:false,powerHit:false};this.skills.clear();this.pending=undefined;this.known=false;this.render();}
 replace(skills:MagicSkill[]){
  this.clearSelected();this.skills=new Map(skills.map(skill=>[skill.magicId,{...skill}]));this.pending=undefined;this.known=true;
  if(this.binding&&this.bindingConfirmed(this.binding)){this.bindingMessage=`快捷键已设置为 ${skillKeyLabel(this.binding.key)}`;this.clearBindingPending();this.bindingEditor=undefined;}
  if(this.bindingEditor!==undefined&&!this.skills.has(this.bindingEditor))this.cancelKeyBinding();
  this.render();
 }
 add(skill:MagicSkill){this.known=true;this.skills.set(skill.magicId,skill);this.render();}
 remove(magicId:number){this.skills.delete(magicId);if(this.selected===magicId)this.clearSelected();if(this.binding?.magicId===magicId)this.rejectKeyBinding('技能已经移除');if(this.bindingEditor===magicId)this.cancelKeyBinding();this.render();}
 progress(magicId:number,level:number,currentTrain:number){const skill=this.skills.get(magicId);if(skill){this.skills.set(magicId,{...skill,level,currentTrain});this.render();}}
 debugState(){return {known:this.known,selected:this.selected,pending:this.pending,binding:this.binding?{...this.binding}:undefined,bindingEditor:this.bindingEditor,bindingMessage:this.bindingMessage,skills:arrangeSkillSlots(this.skills.values()).map(skill=>skill?{...skill,use:skillUseOf(skill.magicId)}:undefined),learnedSkills:arrangeSkills(this.skills.values()).map(skill=>({...skill,use:skillUseOf(skill.magicId)})),icons:Array.from(this.element.querySelectorAll<HTMLImageElement>('.skill-icon')).map(image=>({magicId:Number(image.dataset.magicId),src:image.src,loaded:image.complete&&image.naturalWidth>0}))};}
 skillAt(index:number){return arrangeSkillSlots(this.skills.values())[index];}
 selectSlot(index:number){const skill=this.skillAt(index);if(!skill||this.pending!==undefined||this.binding||this.bindingEditor!==undefined)return false;this.selected=skill.magicId;this.actions.select(skill);this.render();return true;}
 castSelf(skill:MagicSkill){if(this.pending!==undefined||this.binding)return false;this.clearSelected();this.pending=skill.magicId;this.actions.self(skill);this.render();return true;}
 setPending(magicId:number){this.clearSelected();this.pending=magicId;this.render();}
 cancelSelection(){if(!this.clearSelected())return false;this.render();return true;}
 resolve(){this.pending=undefined;this.render();}
 requestKeyBinding(magicId:number,key:number){
  const skill=this.skills.get(magicId);
  if(!this.known||!skill||!validSkillKey(key)||this.pending!==undefined||this.binding||!this.actions.bind)return false;
  if(skill.key===key&&this.bindingConfirmed({magicId,key,bindingId:0})){this.bindingEditor=undefined;this.bindingMessage='快捷键没有变化';this.render();return false;}
  this.clearSelected();this.binding={magicId,key,bindingId:++this.bindingSerial};this.bindingMessage='正在等待服务端设置快捷键…';
  this.bindingTimer=setTimeout(()=>this.rejectKeyBinding('设置超时，请重试'),5000);this.render();
  try{if(this.actions.bind(skill,key,this.binding.bindingId))return true;}catch{}
  this.rejectKeyBinding('快捷键设置未发送，请重试');return false;
 }
 cancelKeyBinding(reason=''){++this.editorSerial;this.actions.closeKeyDialog?.();const active=this.binding!==undefined||this.bindingEditor!==undefined;if(!active&&this.bindingMessage===reason)return false;this.clearBindingPending();this.bindingEditor=undefined;this.bindingMessage=reason;this.render();return active;}
 rejectKeyBinding(reason='快捷键设置失败',bindingId?:number){if(bindingId!==undefined&&this.binding?.bindingId!==bindingId)return false;this.clearBindingPending();this.bindingMessage=reason;this.render();return true;}
 private clearSelected(){if(this.selected===undefined)return false;this.selected=undefined;this.actions.select(undefined);return true;}
 private clearBindingPending(){if(this.bindingTimer!==undefined)clearTimeout(this.bindingTimer);this.bindingTimer=undefined;this.binding=undefined;}
 private bindingConfirmed(binding:KeyBinding){const target=this.skills.get(binding.magicId);return target?.key===binding.key&&(binding.key===0||![...this.skills.values()].some(skill=>skill.magicId!==binding.magicId&&skill.key===binding.key));}
 private openKeyEditor(skill:MagicSkill){
  if(this.pending!==undefined||this.binding||this.bindingEditor!==undefined)return;
  this.bindingEditor=skill.magicId;this.bindingDraft=validSkillKey(skill.key)?skill.key:0;this.bindingMessage='';
  if(this.element.closest?.('.character-window')&&this.actions.chooseKey){
   const serial=++this.editorSerial;this.render();
   void this.actions.chooseKey({...skill}).then(key=>{
    if(serial!==this.editorSerial||this.bindingEditor!==skill.magicId)return;
    this.bindingEditor=undefined;
    if(key!=='interrupted')this.requestKeyBinding(skill.magicId,key);
    this.render();
   }).catch(()=>{if(serial===this.editorSerial)this.cancelKeyBinding('快捷键窗口未打开，请重试');});
  }else this.render();
 }
 private appendSkillIcon(row:HTMLElement,skill:MagicSkill,renderGeneration:number){
  const holder=document.createElement('button');holder.type='button';holder.className='skill-icon-button';holder.setAttribute('aria-label',`设置 ${skill.name} 的快捷键`);holder.disabled=!this.actions.bind||this.pending!==undefined||Boolean(this.binding);holder.style.padding='0';holder.style.flex='none';holder.style.width='32px';holder.style.height='30px';
  let painting=0,captured:number|undefined,pressedState:boolean|undefined,pointerClickCancelled=false;
  const inRange=(event:PointerEvent)=>{const box=holder.getBoundingClientRect();return event.clientX>=box.left&&event.clientX<box.right&&event.clientY>=box.top&&event.clientY<box.bottom;};
  const paint=(pressed=false)=>{
   if(renderGeneration!==this.iconRenderSerial)return;
   if(pressedState===pressed)return;pressedState=pressed;
   const paintGeneration=++painting;holder.replaceChildren();
   const resolved=resolveIconFrame(skillIconIndexOf(skill,pressed),[{namespace:'/ui-national/magic-icons',library:this.nationalIcons}]);
   if(resolved.status==='ready'&&resolved.frame&&resolved.url&&!this.failedIconUrls.has(resolved.url)&&!this.emptyIconUrls.has(resolved.url)){
    const icon=document.createElement('img'),url=resolved.url,generation=this.iconSerial;icon.className='skill-icon';icon.dataset.magicId=String(skill.magicId);icon.dataset.iconDomain=resolved.domain;icon.alt='';icon.width=resolved.frame.width;icon.height=resolved.frame.height;
    const current=()=>generation===this.iconSerial&&renderGeneration===this.iconRenderSerial&&paintGeneration===painting;
    const failed=()=>{if(!current())return;this.failedIconUrls.add(url);this.render();};
    icon.onerror=failed;icon.onload=()=>{if(!current())return;if(icon.naturalWidth!==resolved.frame!.width||icon.naturalHeight!==resolved.frame!.height){failed();return;}if(iconHasPixels(icon,icon.naturalWidth,icon.naturalHeight)===false){this.emptyIconUrls.add(url);this.failedIconUrls.delete(url);this.render();}};
    icon.src=url+(this.iconSerial>1?`?retry=${this.iconSerial}`:'');holder.append(icon);
   }else{const missing=document.createElement('span');missing.className='skill-icon-missing';missing.textContent='图标暂缺';missing.style.fontSize='10px';holder.append(missing);}
  };
  holder.onpointerdown=event=>{if(holder.disabled||event.button!==0)return;pointerClickCancelled=false;captured=event.pointerId;holder.setPointerCapture?.(event.pointerId);paint(true);};
  holder.onpointermove=event=>{if(captured!==event.pointerId)return;paint(Boolean(event.buttons&1)&&inRange(event));};
  holder.onpointerup=event=>{if(captured!==event.pointerId)return;pointerClickCancelled=!inRange(event);captured=undefined;paint();};holder.onpointercancel=()=>{pointerClickCancelled=true;captured=undefined;paint();};holder.onlostpointercapture=()=>{if(captured!==undefined)pointerClickCancelled=true;captured=undefined;paint();};
  holder.onpointerleave=()=>paint();holder.onpointerenter=event=>{if(captured===event.pointerId&&(event.buttons&1))paint(true);};
  holder.onclick=event=>{if(holder.disabled||renderGeneration!==this.iconRenderSerial||pointerClickCancelled&&event.detail!==0)return;this.openKeyEditor(skill);};
  paint();row.append(holder);
 }
 private renderKeyBinding(row:HTMLElement,skill:MagicSkill,native=false){
  const button=document.createElement('button');button.type='button';button.className='skill-key-binding';button.dataset.magicId=String(skill.magicId);button.textContent=skillKeyLabel(skill.key);button.disabled=!this.actions.bind||this.pending!==undefined||Boolean(this.binding);
  if(native&&skillKeySlot(skill.key)===undefined)button.textContent='';
  button.setAttribute('aria-label',`设置 ${skill.name} 的快捷键`);
  button.onclick=()=>this.openKeyEditor(skill);row.append(button);
  if(native)return button;
  if(this.bindingEditor!==skill.magicId)return;
  const editor=document.createElement('div');editor.className='skill-key-editor';editor.style.display='flex';editor.style.flexWrap='wrap';editor.style.flexBasis='100%';editor.setAttribute('role','group');editor.setAttribute('aria-label',`${skill.name} 快捷键`);
  for(const key of [0,49,50,51,52,53,54,55,56]){
   const choice=document.createElement('button');choice.type='button';choice.dataset.skillKey=String(key);choice.textContent=skillKeyLabel(key);choice.disabled=Boolean(this.binding);choice.setAttribute('aria-pressed',String(this.bindingDraft===key));
   choice.onclick=()=>{this.bindingDraft=key;this.render();};editor.append(choice);
  }
  const confirm=document.createElement('button');confirm.type='button';confirm.className='skill-key-confirm';confirm.textContent=this.binding?'设置中…':'确定';confirm.disabled=Boolean(this.binding);confirm.onclick=()=>this.requestKeyBinding(skill.magicId,this.bindingDraft);
  const cancel=document.createElement('button');cancel.type='button';cancel.className='skill-key-cancel';cancel.textContent='取消';cancel.onclick=()=>this.cancelKeyBinding();editor.append(confirm,cancel);return editor;
 }

 private async paintNativeRows(labels:NativeSkillLabels[],generation:number){
  const current=()=>generation===this.iconRenderSerial&&this.element.isConnected&&labels.every(item=>item.row.parentElement===this.element);
  const spec=classicUiLayout().nationalCharacterWindow.skillRows;
  try{
   const keys=labels.map(item=>skillKeySlot(item.skill.key)).filter((key):key is number=>key!==undefined).map(key=>spec.key.frames[key]);
   const [font,art]=await Promise.all([loadNativeUiFont(spec.font.profile),loadNativeSkillArt([spec.levelLabel.frame,spec.trainLabel.frame,...keys])]);
   await font.prepare(labels.map(item=>`${item.skill.name}\n${item.skill.level}\n${item.skill.level>=3?'-':item.skill.currentTrain}`).join('\n'));
   if(!current())return;
   const document=this.element.ownerDocument;
   const canvas=(width:number,height:number)=>{
    const value=document.createElement('canvas');value.className='native-character-glyph';value.setAttribute('aria-hidden','true');
    value.width=width;value.height=height;value.style.width=`${width}px`;value.style.height=`${height}px`;return value;
   };
   const text=(value:string,width:number)=>{
    const image=canvas(width,spec.font.height);
    font.paint(image,value,{width,height:spec.font.height,left:0,top:0,lineHeight:spec.font.height,color:spec.font.color,outline:spec.font.outline});return image;
   };
   // Prepare complete rows off-DOM before exposing any part of their text/artwork.
   const painted=labels.map(item=>{
    const name=text(item.skill.name,spec.name.width),training=canvas(spec.width,spec.step),context=training.getContext('2d');
    if(!context)throw new Error('原客户端技能文字绘制不可用，请重试');context.imageSmoothingEnabled=false;
    for(const label of [spec.levelLabel,spec.trainLabel])context.drawImage(art.get(label.frame)!,label.x,label.y);
    context.drawImage(text(String(item.skill.level),spec.levelValue.width),spec.levelValue.x,spec.levelValue.y);
    context.drawImage(text(item.skill.level>=3?'-':String(item.skill.currentTrain),spec.trainValue.width),spec.trainValue.x,spec.trainValue.y);
    const slot=skillKeySlot(item.skill.key);let key:HTMLCanvasElement|undefined;
    if(slot!==undefined){key=canvas(spec.key.width,spec.key.height);const target=key.getContext('2d');if(!target)throw new Error('原客户端快捷键标签绘制不可用，请重试');target.imageSmoothingEnabled=false;target.drawImage(art.get(spec.key.frames[slot])!,0,0);}
    return {name,training,key};
   });
   if(current())labels.forEach((item,index)=>{item.name.append(painted[index].name);item.training.append(painted[index].training);if(painted[index].key)item.key.append(painted[index].key!);});
  }catch(error){
   if(!current())return;
   const diagnostic=this.element.ownerDocument.createElement('div');diagnostic.className='native-character-font-error';diagnostic.setAttribute('role','alert');
   const message=this.element.ownerDocument.createElement('span');message.textContent=error instanceof Error?error.message:'原客户端技能文字或标签载入失败，请重试';
   const retry=this.element.ownerDocument.createElement('button');retry.type='button';retry.className='native-skill-art-retry';retry.textContent='重试技能文字';retry.onclick=()=>{if(current())this.render();};
   diagnostic.append(message,retry);this.element.append(diagnostic);
  }
 }
 private render(){
  const renderGeneration=++this.iconRenderSerial;
  this.element.replaceChildren();if(!this.known&&!this.skills.size){this.element.textContent='尚未收到技能数据';return;}if(!this.skills.size){this.element.textContent='尚未学会技能';return;}
  // The character window exists before its asynchronous skin mounts.
  const native=Boolean(this.element.closest?.('.character-window'));
  const slots=native?[...this.skills.values()]:arrangeSkills(this.skills.values());
  const nativeRows=native?classicUiLayout().nationalCharacterWindow.skillRows:{count:0,step:0};
  const nativeLabels:NativeSkillLabels[]=[];
  if(native)this.nativePage=Math.min(this.nativePage,Math.max(0,Math.ceil(slots.length/nativeRows.count)-1));
  for(let slot=0;slot<slots.length;slot++){
   if(native&&(slot<this.nativePage*nativeRows.count||slot>=(this.nativePage+1)*nativeRows.count))continue;
   const skill=slots[slot];if(!skill)continue;
   const use=skillUseOf(skill.magicId);
   const row=document.createElement('div');row.className='skill-item';row.dataset.magicId=String(skill.magicId);row.dataset.use=use;
   this.appendSkillIcon(row,skill,renderGeneration);
   if(native){
    const spec=classicUiLayout().nationalCharacterWindow.skillRows;
    row.classList.add('native-skill-row');Object.assign(row.style,{top:`${(slot%nativeRows.count)*nativeRows.step}px`,width:`${spec.width}px`,height:`${spec.step}px`});
    const name=document.createElement('span');name.className='native-skill-name';name.textContent=skill.name;Object.assign(name.style,{left:`${spec.name.x}px`,top:`${spec.name.y}px`,width:`${spec.name.width}px`,color:'transparent',textShadow:'none'});
    const level=document.createElement('span');level.className='native-skill-training';level.textContent=`Lv${skill.level} Exp${skill.level>=3?'-':skill.currentTrain}`;Object.assign(level.style,{left:'0px',top:'0px',width:`${spec.width}px`,height:`${spec.step}px`,color:'transparent',textShadow:'none',pointerEvents:'none'});
    row.append(name,level);
    const key=this.renderKeyBinding(row,skill,true)!;Object.assign(key.style,{left:`${spec.key.x}px`,top:`${spec.key.y}px`,width:`${spec.key.width}px`,height:`${spec.key.height}px`,color:'transparent'});
    nativeLabels.push({row,skill:{...skill},name,training:level,key});
    this.element.append(row);
    continue;
   }
   const description=document.createElement('span'),name=document.createElement('strong'),key=document.createElement('kbd'),detail=document.createElement('small');
   key.textContent=skillKeySlot(skill.key)===undefined?'':skillKeyLabel(skill.key);name.append(key,skill.name);
   const next=Math.min(3,skill.level);detail.textContent=`${skill.level} 级 · 修炼 ${skill.currentTrain}/${skill.maxTrain[next]??0} · MP ${spellCost(skill)}`;
   description.append(name,detail);
   if(['hostile','ground','support','directional','rush'].includes(use)){
    const select=document.createElement('button');select.type='button';select.disabled=this.pending!==undefined||Boolean(this.binding);
    const prompt=use==='ground'?'选择位置':use==='rush'||use==='directional'?'选择方向':'选择目标';
    select.textContent=this.pending===skill.magicId?'施法中…':this.selected===skill.magicId?'已选技能':prompt;
    select.onclick=()=>{this.selected=this.selected===skill.magicId?undefined:skill.magicId;this.actions.select(this.selected===undefined?undefined:skill);this.render();};
    row.append(description,select);
    if(use==='support'){const self=document.createElement('button');self.type='button';self.disabled=this.pending!==undefined||Boolean(this.binding);self.textContent='对自己';self.onclick=()=>this.castSelf(skill);row.append(self);}
   }else if(use==='passive'){
    const note=document.createElement('span');note.className='skill-passive';note.textContent=skill.magicId===7&&this.warrior.powerHit?'攻杀就绪':'近战被动';row.append(description,note);
   }else{
    const self=document.createElement('button');self.type='button';self.disabled=this.pending!==undefined||Boolean(this.binding);
    self.textContent=this.pending===skill.magicId?'施法中…':use==='toggle'?((skill.magicId===12?this.warrior.thrusting:this.warrior.halfMoon)?'关闭（已开启）':'开启'):use==='charge'?(this.warrior.fireHit?'已蓄力':'蓄力'):'对自己';
    self.onclick=()=>this.castSelf(skill);row.append(description,self);
   }
   const editor=this.renderKeyBinding(row,skill);this.element.append(row);if(editor)this.element.append(editor);
  }
  if(nativeLabels.length)void this.paintNativeRows(nativeLabels,renderGeneration);
  if(this.iconLoadFailed||this.failedIconUrls.size){const retry=document.createElement('button');retry.type='button';retry.className='skill-icon-retry';retry.textContent='图标加载失败，重试';retry.disabled=Boolean(this.iconLoadTask);retry.onclick=()=>{void this.retryIcons();};this.element.append(retry);}
  if(this.bindingMessage){const message=document.createElement('p');message.className='skill-key-status';message.setAttribute('role','status');message.textContent=this.bindingMessage;this.element.append(message);}
 }
}
