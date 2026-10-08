import type {InventoryItem} from './inventory';
import {ItemIconAssets,itemIconElement} from './item-icons';
import {loadNationalUiLibrary,type Frame} from './classic-ui';
import serviceUi from '../../../content/classic-176/service-ui.json';
import './service-window.css';

export const SERVICE_UI=serviceUi;
export type ServiceMode='buy'|'sell'|'repair'|'store'|'take';
type Library={frames:Record<string,Frame>};
export type ServiceRequest={kind:'details'|'purchase'|'quote'|'sale'|'repair'|'store'|'take';makeIndex?:number;name?:string;page?:number};
export type ServiceSend=()=>boolean|void;

/** A quote refers to the complete authoritative instance, including rare bonuses. */
export function serviceItemChanged(previous:InventoryItem,next:InventoryItem){
 const keys=new Set([...Object.keys(previous),...Object.keys(next)]) as Set<keyof InventoryItem>;
 return [...keys].some(key=>JSON.stringify(previous[key])!==JSON.stringify(next[key]));
}

/** UI waits have identity independent of economic authority retained by the gateway. */
export class ServiceWait{
 current:ServiceRequest|undefined;private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(private changed:(reason?:string,request?:ServiceRequest)=>void){}
 start(request:ServiceRequest,send:ServiceSend){
  if(this.current)return false;
  this.current=request;
  this.timer=setTimeout(()=>{if(this.current!==request)return;this.clear();this.changed('等待超时，请重试',request);},SERVICE_UI.interaction.waitMs);
  this.changed();
  try{if(send()!==false)return true;}catch{}
  if(this.current===request){this.clear();this.changed('请求未发送，请重试',request);}return false;
 }
 clear(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;this.current=undefined;}
 matches(kind:ServiceRequest['kind'],makeIndex?:number){return this.current?.kind===kind&&(makeIndex===undefined||this.current.makeIndex===makeIndex);}
}

export function cancelServiceWaitOnInputLoss(element:HTMLElement,cancel:()=>void){
 element.addEventListener('pointercancel',cancel);
 const doc=element.ownerDocument;
 doc?.defaultView?.addEventListener('blur',cancel);
 doc?.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();});
}

/** The component marks its mode; HUD and async atlas loading use this same contract. */
export function skinServiceWindow(element:HTMLElement,library?:Library){
 const mode=element.dataset.serviceMode as ServiceMode|undefined;
 if(!mode||!['buy','sell','repair','store','take'].includes(mode))return false;
 const spec=mode==='buy'||mode==='take'?SERVICE_UI.menu:SERVICE_UI.slot;
 element.classList.add('classic-service-window','national-window');element.classList.remove('national-panel');
 element.dataset.serviceFrame=String(spec.frame);element.dataset.serviceEvidence=SERVICE_UI.status;
 element.style.width=`${spec.width}px`;element.style.height=`${spec.height}px`;
 if(element.dataset.windowMoved!=='true'){element.style.left=`${spec.placement.x}px`;element.style.top=`${spec.placement.y}px`;}
 element.style.right='auto';element.style.bottom='auto';
 element.style.setProperty('--service-heading-height',`${spec.headingHeight}px`);
 const rect=(name:string,value:{x:number;y:number;width?:number;height?:number})=>{
  element.style.setProperty(`--service-${name}-x`,`${value.x}px`);element.style.setProperty(`--service-${name}-y`,`${value.y}px`);
  if(value.width!==undefined)element.style.setProperty(`--service-${name}-width`,`${value.width}px`);
  if(value.height!==undefined)element.style.setProperty(`--service-${name}-height`,`${value.height}px`);
 };
 rect('close',spec.close);rect('confirm',spec.confirm);rect('status',spec.status);
 if(mode==='buy'||mode==='take'){
  const menu=SERVICE_UI.menu;rect('previous',menu.previous);rect('next',menu.next);rect('return',menu.return);
  rect('headers',{...menu.headers,width:menu.list.width});rect('list',{...menu.list,height:menu.list.rowHeight*menu.list.visible});
  element.style.setProperty('--service-menu-columns',menu.list.columns.map(value=>`${value}px`).join(' '));
  element.style.setProperty('--service-row-height',`${menu.list.rowHeight}px`);
 }else{rect('item',SERVICE_UI.slot.item);rect('price',SERVICE_UI.slot.price);}
 const frame=library?.frames[String(spec.frame)];
 if(frame){element.style.backgroundImage=`url(/ui-national/prguse/${frame.file})`;element.dataset.serviceSkin='native';}
 else if(!element.dataset.serviceSkin){element.dataset.serviceSkin='pending';}
 return true;
}

export class ServiceAssets{
 private readonly itemIcons:ItemIconAssets;private panels:Library|undefined;
 private iconRender=0;private panel:HTMLElement|undefined;
 constructor(private ready:()=>void){
  this.itemIcons=new ItemIconAssets('items',()=>this.ready());
  void loadNationalUiLibrary('prguse').then(value=>{this.panels=value;this.ready();}).catch(()=>{});
 }
 skin(element:HTMLElement){this.iconRender++;this.panel=element;skinServiceWindow(element,this.panels);}
 retryIcons(){return this.itemIcons.retry();}
 icon(item:Pick<InventoryItem,'name'|'looks'>){
  const render=this.iconRender,icon=itemIconElement(item,this.itemIcons,{className:'service-item-icon',isCurrent:()=>this.iconRender===render&&!this.panel?.hidden}),state=this.itemIcons.state(item);
  if(state.status==='ready'){icon.style.width=`${state.frame!.width}px`;icon.style.height=`${state.frame!.height}px`;}
  return icon;
 }
}

export function serviceButton(label:string,control:string,disabled:boolean,action:()=>void){
 const button=document.createElement('button');button.type='button';button.className=`service-command service-command--${control}`;
 button.dataset.serviceControl=control;button.textContent=label;button.disabled=disabled;button.setAttribute('aria-label',label);
 button.onclick=event=>{event.preventDefault();event.stopPropagation();if(!button.disabled)action();};return button;
}
export function serviceHeading(element:HTMLElement,title:string,close:()=>void,afterClose?:(focusWasWithinWindow:boolean)=>void){
 element.setAttribute('aria-label',title);const heading=document.createElement('div');heading.className='service-heading';heading.dataset.windowDragHandle='true';
 const name=document.createElement('span');name.className='service-a11y-label';name.textContent=title;
 const button=serviceButton(`关闭${title}`,'close',false,()=>{const active=element.ownerDocument.activeElement as HTMLElement|null,focusWasWithinWindow=Boolean(active&&(element.contains(active)||active===element.ownerDocument.body||active===element.ownerDocument.documentElement));close();if(element.hidden)afterClose?.(focusWasWithinWindow);});button.classList.add('classic-window-close');heading.append(name,button);element.append(heading);
}
export function serviceStatus(element:HTMLElement,text:string){const node=document.createElement('div');node.className='service-status';node.setAttribute('role','status');node.textContent=text;node.title=text;element.append(node);}
export function serviceSlot(element:HTMLElement,item:InventoryItem|undefined,assets:ServiceAssets,waiting:boolean,cancel:(event:MouseEvent)=>void){
 const slot=document.createElement('button');slot.type='button';slot.className='service-item-slot';slot.dataset.serviceItemSlot='true';
 slot.disabled=waiting;slot.setAttribute('aria-label',item?`${item.name}，点击放回背包`:'从背包放入物品');
 if(item){slot.dataset.itemId=String(item.makeIndex);const icon=assets.icon(item);if(icon)slot.append(icon);else{const name=document.createElement('span');name.textContent=item.name;slot.append(name);}}
 slot.onclick=event=>{if(event.defaultPrevented||slot.disabled)return;event.preventDefault();cancel(event);};element.append(slot);return slot;
}
export function serviceMenuHeaders(element:HTMLElement,labels:string[]){const header=document.createElement('div');header.className='service-menu-headers';for(const text of labels){const label=document.createElement('span');label.textContent=text;header.append(label);}element.append(header);}
export function serviceMenuRow(values:string[],selected:boolean,waiting:boolean,select:()=>void){
 const row=document.createElement('button');row.type='button';row.className='service-menu-row';row.setAttribute('role','option');row.setAttribute('aria-selected',String(selected));row.disabled=waiting;
 for(const value of values){const label=document.createElement('span');label.textContent=value;row.append(label);}
 // There is no reference double-click transaction. Confirm remains a separate control.
 row.onclick=event=>{event.preventDefault();event.stopPropagation();if(!row.disabled)select();};row.ondblclick=event=>{event.preventDefault();event.stopPropagation();};return row;
}
