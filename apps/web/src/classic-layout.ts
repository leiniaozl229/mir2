import uiLayout from '../../../content/classic-176/ui-layout.json';
import uiInteractions from '../../../content/classic-176/ui-interactions.json';

export type LayoutBox={x:number;y:number;width?:number;height?:number;maxWidth?:number};

/** Shared 800×600 UI contract. Production HUD and `/ui-calibration.html` both read this file. */
export function classicUiLayout(){return uiLayout;}

export function placeBox(element:HTMLElement|null|undefined,box:LayoutBox|undefined){
 if(!element||!box)return;
 element.style.left=`${box.x}px`;
 element.style.top=`${box.y}px`;
 if(box.width!==undefined)element.style.width=`${box.width}px`;
 if(box.height!==undefined)element.style.height=`${box.height}px`;
 if(box.maxWidth!==undefined)element.style.maxWidth=`${box.maxWidth}px`;
}

export function bagGridFromLayout(national=false){
 const grid=national?uiLayout.nationalInventoryGrid:uiLayout.inventoryGrid;
 return {width:grid.cellWidth,height:grid.cellHeight,originX:grid.originX,originY:grid.originY,gapX:grid.gapX,gapY:grid.gapY,columns:grid.columns,visible:grid.visible};
}

export function bagCellPositionFromLayout(index:number,national=false){
 const grid=bagGridFromLayout(national);
 const column=index%grid.columns,row=Math.floor(index/grid.columns)%5;
 return {left:column*(grid.width+grid.gapX)+grid.originX,top:row*(grid.height+grid.gapY)+grid.originY,width:grid.width,height:grid.height};
}

export function nationalHudOrbMetrics(){
 const hud=uiLayout.nationalHud;
 return {orbHeight:hud.orbs.hp.height,barWidth:hud.experienceBar.width,weightWidth:hud.weightBar.width,mpImageOffsetX:hud.orbs.mp.imageOffsetX};
}

export function nationalWindowButtonFrames(control:string|undefined){
 if(!control)return undefined;
 const spec=uiInteractions.controls[control as keyof typeof uiInteractions.controls] as {normal?:number|string;hover?:number|string;pressed?:number|string}|undefined;
 if(!spec||typeof spec.normal!=='number')return undefined;
 const hover=typeof spec.hover==='number'?spec.hover:spec.normal;
 const pressed=typeof spec.pressed==='number'?spec.pressed:spec.normal;
 return {index:spec.normal,hover,pressed};
}

export function applyNationalHudLayout(root:HTMLElement){
 const hud=uiLayout.nationalHud;
 placeBox(root.querySelector<HTMLElement>('[data-hud-main]'),hud.mainDialog);
 placeBox(root.querySelector<HTMLElement>('.hud-orb-well.hp'),hud.orbs.hp);
 placeBox(root.querySelector<HTMLElement>('.hud-orb-well.mp'),hud.orbs.mp);
 root.querySelectorAll<HTMLElement>('.hud-orb-fill').forEach(fill=>{
  fill.style.width=`${hud.orbs.hp.width}px`;fill.style.height=`${hud.orbs.hp.height}px`;
 });
 root.querySelectorAll<HTMLElement>('.hud-orb-fill img').forEach(image=>{
  image.style.width=`${hud.orbs.fillImageWidth}px`;image.style.height=`${hud.orbs.fillImageHeight}px`;
 });
 placeBox(root.querySelector<HTMLElement>('[data-hud-exp-track]'),hud.experienceBar);
 placeBox(root.querySelector<HTMLElement>('[data-hud-weight]'),hud.weightBar);
 placeBox(root.querySelector<HTMLElement>('[data-hud-hp]'),hud.fields.hp);
 placeBox(root.querySelector<HTMLElement>('[data-hud-mp]'),hud.fields.mp);
 placeBox(root.querySelector<HTMLElement>('[data-hud-name]'),hud.fields.name);
 placeBox(root.querySelector<HTMLElement>('[data-hud-job]'),hud.fields.job);
 placeBox(root.querySelector<HTMLElement>('[data-hud-status]'),hud.fields.status);
 placeBox(root.querySelector<HTMLElement>('[data-hud-exp]'),hud.fields.exp);
 placeBox(root.querySelector<HTMLElement>('[data-hud-gold]'),hud.fields.gold);
 const chat=root.querySelector<HTMLElement>('[data-hud-chat]');
 placeBox(chat,hud.chat);
 const log=chat?.querySelector('ol');
 if(log)(log as HTMLElement).style.height=`${hud.chat.logHeight}px`;
 const form=chat?.querySelector('form');
 if(form)placeBox(form as HTMLElement,hud.chat.input);
 applyNationalItemQuickBarLayout(root);
}

export function applyNationalItemQuickBarLayout(root:HTMLElement){
 const spec=uiLayout.itemQuickBar;
 const itembar=root.querySelector<HTMLElement>('[data-hud-itembar]');
 if(itembar){
  itembar.style.display='block';
  placeBox(itembar,{x:spec.frameOrigin.x,y:spec.frameOrigin.y,width:uiLayout.canvas.width,height:uiLayout.nationalHud.mainDialog.height});
 }
 const bar=root.querySelector<HTMLElement>('[data-hud-item-quickbar]');
 if(!bar)return;
 const width=(spec.count-1)*spec.slotStep+spec.slotWidth;
 placeBox(bar,{x:spec.x,y:spec.y,width,height:spec.slotHeight});
 bar.style.display='flex';
 bar.style.gap=`${spec.slotStep-spec.slotWidth}px`;
 bar.querySelectorAll<HTMLElement>('.item-quickbar-slot').forEach(slot=>{
  slot.style.width=`${spec.slotWidth}px`;
  slot.style.height=`${spec.slotHeight}px`;
  slot.style.flex=`0 0 ${spec.slotWidth}px`;
 });
}

export function applyNationalInventoryLayout(element:HTMLElement){
 const windowSpec=uiLayout.nationalInventoryWindow;
 const grid=uiLayout.nationalInventoryGrid;
 element.style.setProperty('--bag-origin-x',`${grid.originX}px`);
 element.style.setProperty('--bag-origin-y',`${grid.originY}px`);
 element.style.setProperty('--bag-step-x',`${grid.cellWidth+grid.gapX}px`);
 element.style.setProperty('--bag-step-y',`${grid.cellHeight+grid.gapY}px`);
 placeBox(element.querySelector<HTMLElement>('[data-inventory-gold], .inventory-gold'),grid.gold);
 element.querySelectorAll<HTMLElement>('.item-cell').forEach((cell,index)=>{
  const slot=Number(cell.dataset.slot);
  const position=bagCellPositionFromLayout(Number.isInteger(slot)?slot:index,true);
  cell.style.left=`${position.left}px`;
  cell.style.top=`${position.top}px`;
  cell.style.width=`${position.width}px`;
  cell.style.height=`${position.height}px`;
 });
 return windowSpec;
}

export function applyNationalCharacterLayout(element:HTMLElement){
 const windowSpec=uiLayout.nationalCharacterWindow;
 const page=uiLayout.nationalCharacterPage;
 const actor=uiLayout.nationalPaperdollActor;
 const paper=element.querySelector<HTMLElement>('[data-character-page="paperdoll"]');
 placeBox(paper,{x:page.x,y:page.y});
 const status=element.querySelector<HTMLElement>('#character-panel, [data-character-page="status"]');
 placeBox(status,windowSpec.statusPage);
 const skills=element.querySelector<HTMLElement>('[data-character-page="skills"]');
 placeBox(skills,windowSpec.skillsPage);
 placeBox(element.querySelector<HTMLElement>('#paperdoll-actor'),{x:actor.x,y:actor.y});
 const name=element.querySelector<HTMLElement>('.classic-char-name, [data-character-name]');
 if(name)name.style.width=`${windowSpec.width}px`;
 const tabs=windowSpec.tabs;
 element.querySelectorAll<HTMLButtonElement>('[data-character-tab]').forEach((button,index)=>{
  placeBox(button,{x:tabs.x+index*tabs.step,y:tabs.y,width:tabs.width,height:tabs.height});
  const label=tabs.labels[index];
  if(label)button.textContent=label;
 });
 applyNationalCharacterStats(element);
 return windowSpec;
}

export function applyNationalCharacterStats(root:HTMLElement){
 const stats=uiLayout.nationalCharacterWindow.statValues;
 const panel=root.id==='character-panel'||root.getAttribute('data-character-page')==='status'?root:root.querySelector<HTMLElement>('#character-panel, [data-character-page="status"]');
 if(!panel)return;
 panel.querySelectorAll<HTMLElement>('.classic-stat').forEach(label=>{label.style.display='none';});
 panel.querySelectorAll<HTMLElement>('.classic-stat-value').forEach((value,index)=>{
  const top=stats.tops[index];
  if(top===undefined)return;
  value.style.left=`${stats.x}px`;
  value.style.top=`${top}px`;
  value.style.width=`${stats.width}px`;
  value.style.textAlign='center';
 });
}

export function nationalUsesLayout(){
 return typeof document!=='undefined'&&Boolean(document.body?.classList?.contains('national-play'));
}
