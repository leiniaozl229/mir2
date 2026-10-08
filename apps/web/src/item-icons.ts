import {loadNationalUiLibrary} from './classic-ui';
import {iconHasPixels,resolveIconFrame,type IconLibrary,type IconResolution,type IconSource} from './icon-frames';
import itemAssets from '../../../content/classic-176/item-assets.json';

export type ItemIconFamily='items'|'stateitem'|'dnitems';
export type IconItem={name:string;looks:number};
export type ItemIconState=Omit<IconResolution,'status'>&{status:'ready'|'missing'|'loading'|'failed'};
const gameplayNames={items:'Items',stateitem:'stateitem',dnitems:'DnItems'} as const;
const itemLibraryRequests=new Map<ItemIconFamily,Promise<IconLibrary>>();
const transparentItemIcons=new Set<string>();

/** Client Item.S.Looks indexes its own Items/stateitem/DnItems family directly. */
export function itemIconIndex(item:IconItem){return item.looks;}
export function proposedItemIconMapping(item:IconItem){
 const named=(itemAssets.iconIndexByName as Record<string,number>)[item.name];
 const fallback=(itemAssets.fallbackIconIndexBySourceIndex as Record<string,number>)[String(item.looks)];
 if(named!==undefined)return {kind:'name_override',index:named,status:'proposed_unselected'} as const;
 if(fallback!==undefined)return {kind:'source_index_fallback',index:fallback,status:'proposed_unselected'} as const;
 return undefined;
}

export function loadActiveItemLibrary(family:ItemIconFamily='items'){
 const existing=itemLibraryRequests.get(family);if(existing)return existing;
 const request=Promise.resolve().then(()=>fetch(`/items/${gameplayNames[family]}/library.json`)).then(async response=>{
  if(!response.ok)throw new Error('图标加载失败');
  const value=await response.json() as IconLibrary;
  if(!value||typeof value!=='object'||!value.frames||typeof value.frames!=='object'||Array.isArray(value.frames))throw new Error('图标加载失败');
  return value;
 });
 itemLibraryRequests.set(family,request);
 void request.catch(()=>{if(itemLibraryRequests.get(family)===request)itemLibraryRequests.delete(family);});
 return request;
}

/** Asset state only: authority, selection and pending business requests stay in their views. */
export class ItemIconAssets{
 private readonly sources:IconSource[];
 private readonly states=new Map<string,'loading'|'loaded'|'failed'>();
 private readonly imageFailures=new Set<string>();
 private readonly imageRetries=new Map<string,number>();
 private revision=0;
 constructor(readonly family:ItemIconFamily,private readonly ready:()=>void){
  this.sources=[{namespace:`/ui-national/${family}`},{namespace:`/items/${gameplayNames[family]}`}];
  this.load();
 }
 private load(){
  for(const source of this.sources){
   if(this.states.get(source.namespace)==='loaded'||this.states.get(source.namespace)==='loading')continue;
   this.states.set(source.namespace,'loading');
   const request=source.namespace.startsWith('/ui-national/')?loadNationalUiLibrary(this.family):loadActiveItemLibrary(this.family);
   void request.then(library=>{source.library=library;this.states.set(source.namespace,'loaded');this.ready();})
    .catch(()=>{this.states.set(source.namespace,'failed');this.ready();});
  }
 }
 state(item:IconItem):ItemIconState{
  const resolution=resolveIconFrame(itemIconIndex(item),this.sources);
  if(resolution.status==='ready'){
   if(transparentItemIcons.has(resolution.url!))return {...resolution,status:'missing',reason:'decoded_empty'};
   if(this.imageFailures.has(resolution.url!))return {...resolution,status:'failed',reason:'image_load_failed'};
   return resolution;
  }
  // A verified native manifest can conclusively describe a missing/empty/out-of-range frame.
  if(resolution.domain==='national'||!Number.isSafeInteger(item.looks)||item.looks<0)return resolution;
  if([...this.states.values()].includes('loading'))return {...resolution,status:'loading'};
  if([...this.states.values()].includes('failed'))return {...resolution,status:'failed'};
  return resolution;
 }
 epoch(){return this.revision;}
 imageUrl(url:string){const retry=this.imageRetries.get(url);return retry?`${url}?retry=${retry}`:url;}
 failedImageUrls(){return [...this.imageFailures];}
 imageFailed(url:string,epoch:number){if(epoch!==this.revision||transparentItemIcons.has(url))return;this.imageFailures.add(url);this.ready();}
 imageEmpty(url:string,epoch:number){if(epoch!==this.revision)return;transparentItemIcons.add(url);this.imageFailures.delete(url);this.ready();}
 retry(){
  const retryable=this.imageFailures.size>0||[...this.states.values()].includes('failed');
  if(!retryable)return false;
  this.revision++;for(const url of this.imageFailures)this.imageRetries.set(url,(this.imageRetries.get(url)??0)+1);this.imageFailures.clear();this.load();this.ready();return true;
 }
}

/** Returns undefined when no readable canvas is available; does not invent an alpha result. */
export function itemIconHasPixels(resource:CanvasImageSource,width:number,height:number,owner:Document=document){
 return iconHasPixels(resource,width,height,owner);
}

type ItemIconOptions={className?:string;maxWidth?:number;maxHeight?:number;retry?:()=>void;owner?:Document;isCurrent?:()=>boolean};
export function itemIconElement(item:IconItem,assets:ItemIconAssets,options:ItemIconOptions={}){
 const owner=options.owner??document,state=assets.state(item),proposed=proposedItemIconMapping(item);
 const element=owner.createElement(state.status==='ready'?'img':'span');
 element.className=options.className??(state.status==='ready'?'item-icon':'missing-item-icon');
 element.dataset.iconState=state.status;element.dataset.iconIndex=String(item.looks);
 if(state.sourceId)element.dataset.iconSource=state.sourceId;
 if(proposed){element.dataset.iconMapping=proposed.status;element.dataset.proposedIconIndex=String(proposed.index);}
 if(state.status==='ready'){
  const image=element as HTMLImageElement,frame=state.frame!,epoch=assets.epoch();
  const current=()=>epoch===assets.epoch()&&image.isConnected!==false&&(!options.isCurrent||options.isCurrent());
  // A cached load may fire while the caller is still appending the newly created node.
  const adopt=(action:()=>void)=>{if(image.isConnected===false){void Promise.resolve().then(()=>{if(current())action();});}else if(current())action();};
  image.alt=item.name;image.width=Math.min(options.maxWidth??frame.width,frame.width);image.height=Math.min(options.maxHeight??frame.height,frame.height);
  image.onload=()=>adopt(()=>{
   if(image.naturalWidth!==frame.width||image.naturalHeight!==frame.height){assets.imageFailed(state.url!,epoch);return;}
   if(itemIconHasPixels(image,image.naturalWidth,image.naturalHeight,owner)===false)assets.imageEmpty(state.url!,epoch);
  });
  image.onerror=()=>adopt(()=>assets.imageFailed(state.url!,epoch));image.src=assets.imageUrl(state.url!);return element;
 }
 const text=state.status==='failed'?'图标未加载，点击重试':state.status==='loading'?'图标加载中':'图标暂缺';
 element.textContent=state.status==='missing'?'?':state.status==='loading'?'…':'重试';
 element.setAttribute('aria-label',`${item.name}：${text}`);element.title=text;
 if(state.status==='failed'){
  element.setAttribute('role','button');element.tabIndex=0;
  const retry=(event:Event)=>{event.preventDefault();event.stopPropagation();if(options.retry)options.retry();else assets.retry();};
  element.onclick=retry;element.onkeydown=event=>{if(event.key==='Enter'||event.key===' '||event.key==='Spacebar')retry(event);};
 }
 return element;
}
