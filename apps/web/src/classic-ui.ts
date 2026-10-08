export type Frame={file:string;width:number;height:number;offsetX:number;offsetY:number};
export type Library={frames:Record<string,Frame>;schemaVersion?:number;format?:string;profile?:string;source?:string;sourceSha256?:string;index?:string;indexSha256?:string;sourceFrameCount?:number;empty?:number[];missing?:number[]};
import nationalProfile from '../../../content/classic-176/national-ui-profile.json';
import uiInteractions from '../../../content/classic-176/ui-interactions.json';
import uiLayout from '../../../content/classic-176/ui-layout.json';
const cache=new Map<string,Promise<Library>>();
const nationalCache=new Map<string,Promise<Library>>();

function loadLibrary(name:string,namespace:string,store:Map<string,Promise<Library>>){
 const existing=store.get(name);if(existing)return existing;
 const request=Promise.resolve().then(()=>fetch(`${namespace}/${name}/library.json`)).then(async response=>{
  if(!response.ok)throw new Error('界面素材载入失败');
  const library=await response.json() as Library;
  if(!library||typeof library!=='object'||!library.frames||typeof library.frames!=='object'||Array.isArray(library.frames))throw new Error('界面素材载入失败');
  return library;
 });
 store.set(name,request);
 void request.catch(()=>{if(store.get(name)===request)store.delete(name);});
 return request;
}

export function loadUiLibrary(name:string){
 return loadLibrary(name,'/ui',cache);
}

export function loadNationalUiLibrary(name:string){
 return loadLibrary(name,'/ui-national',nationalCache);
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
 layout:typeof uiLayout;
 fallback:Map<string,Library>;
 national:Map<string,Library>;
 missingFallback:string[];
 missingNational:string[];
};
let sessionPromise:Promise<ClassicUiSession>|undefined;
let sessionSettled=false;
const SESSION_NATIONAL=['prguse','prguse2','chrsel','items','stateitem','magic-icons'];

/** Shared, settled resource session used by login, HUD and item/equipment views. */
export function loadClassicUiSession(){
 if(sessionPromise)return sessionPromise;
 sessionSettled=false;
 const request=Promise.allSettled(SESSION_NATIONAL.map(loadNationalUiLibrary)).then(nationalResults=>{
  const fallback=new Map<string,Library>(),national=new Map<string,Library>();
  const missingFallback:string[]=[],missingNational:string[]=[];
  SESSION_NATIONAL.forEach((name,index)=>{const result=nationalResults[index];if(result.status==='fulfilled')national.set(name,result.value);else missingNational.push(name);});
  // Production and calibration use one original-client profile. Missing national
  // resources stay missing and retryable; never silently switch to Crystal art.
  return {profile:nationalProfile,interactions:uiInteractions,layout:uiLayout,fallback,national,missingFallback,missingNational};
 }).finally(()=>{if(sessionPromise===request)sessionSettled=true;});
 sessionPromise=request;
 return sessionPromise;
}

/** Retry failed libraries explicitly; successful manifests and in-flight work stay shared. */
export function retryClassicUiSession(){
 if(sessionPromise&&!sessionSettled)return sessionPromise;
 sessionPromise=undefined;
 return loadClassicUiSession();
}

export function classicUiProfile(){return nationalProfile;}
export function classicUiInteractions(){return uiInteractions;}
export {classicUiLayout} from './classic-layout';
