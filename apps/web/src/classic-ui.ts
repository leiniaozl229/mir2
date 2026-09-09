export type Frame={file:string;width:number;height:number;offsetX:number;offsetY:number};
type Library={frames:Record<string,Frame>};
import nationalProfile from '../../../content/classic-176/national-ui-profile.json';
import uiInteractions from '../../../content/classic-176/ui-interactions.json';
const cache=new Map<string,Promise<Library>>();
const nationalCache=new Map<string,Promise<Library>>();

export function loadUiLibrary(name:string){
 return cache.get(name)??cache.set(name,fetch(`/ui/${name}/library.json`).then(async response=>{
  if(!response.ok)throw new Error(`缺少界面素材 ${name}`);
  return response.json() as Promise<Library>;
 })).get(name)!;
}

export function loadNationalUiLibrary(name:string){
 return nationalCache.get(name)??nationalCache.set(name,fetch(`/ui-national/${name}/library.json`).then(async response=>{
  if(!response.ok)throw new Error(`缺少国服界面素材 ${name}`);
  return response.json() as Promise<Library>;
 })).get(name)!;
}

export function uiFrame(library:Library,index:number){
 const frame=library.frames[String(index)];
 if(!frame)throw new Error(`缺少界面帧 ${index}`);
 return frame;
}

export function uiUrl(name:string,frame:Frame){return `/ui/${name}/${frame.file}`;}
export function nationalUiUrl(name:string,frame:Frame){return `/ui-national/${name}/${frame.file}`;}

export function applyUiFrame(element:HTMLElement,name:string,frame:Frame){
 element.style.width=`${frame.width}px`;
 element.style.height=`${frame.height}px`;
 element.style.backgroundImage=`url(${uiUrl(name,frame)})`;
}

export function applyNationalUiFrame(element:HTMLElement,name:string,frame:Frame){
 element.style.width=`${frame.width}px`;
 element.style.height=`${frame.height}px`;
 element.style.backgroundImage=`url(${nationalUiUrl(name,frame)})`;
}

export type ClassicUiSession={
 profile:typeof nationalProfile;
 interactions:typeof uiInteractions;
 fallback:Map<string,Library>;
 national:Map<string,Library>;
 missingFallback:string[];
 missingNational:string[];
};
let sessionPromise:Promise<ClassicUiSession>|undefined;
const SESSION_FALLBACK=['Prguse','Prguse2','Title','ChrSel','MagIcon'];
const SESSION_NATIONAL=['prguse','prguse2','chrsel','items','stateitem','magic-icons'];

/** Shared, settled resource session used by login, HUD and item/equipment views. */
export function loadClassicUiSession(){
 if(sessionPromise)return sessionPromise;
 sessionPromise=Promise.all([
  Promise.allSettled(SESSION_FALLBACK.map(loadUiLibrary)),
  Promise.allSettled(SESSION_NATIONAL.map(loadNationalUiLibrary))
 ]).then(([fallbackResults,nationalResults])=>{
  const fallback=new Map<string,Library>(),national=new Map<string,Library>();
  const missingFallback:string[]=[],missingNational:string[]=[];
  SESSION_FALLBACK.forEach((name,index)=>{const result=fallbackResults[index];if(result.status==='fulfilled')fallback.set(name,result.value);else missingFallback.push(name);});
  SESSION_NATIONAL.forEach((name,index)=>{const result=nationalResults[index];if(result.status==='fulfilled')national.set(name,result.value);else missingNational.push(name);});
  return {profile:nationalProfile,interactions:uiInteractions,fallback,national,missingFallback,missingNational};
 });
 return sessionPromise;
}

export function classicUiProfile(){return nationalProfile;}
export function classicUiInteractions(){return uiInteractions;}
