export type Frame={file:string;width:number;height:number;offsetX:number;offsetY:number};
type Library={frames:Record<string,Frame>};
const cache=new Map<string,Promise<Library>>();

export function loadUiLibrary(name:string){
 return cache.get(name)??cache.set(name,fetch(`/ui/${name}/library.json`).then(async response=>{
  if(!response.ok)throw new Error(`缺少界面素材 ${name}`);
  return response.json() as Promise<Library>;
 })).get(name)!;
}

export function uiFrame(library:Library,index:number){
 const frame=library.frames[String(index)];
 if(!frame)throw new Error(`缺少界面帧 ${index}`);
 return frame;
}

export function uiUrl(name:string,frame:Frame){return `/ui/${name}/${frame.file}`;}

export function applyUiFrame(element:HTMLElement,name:string,frame:Frame){
 element.style.width=`${frame.width}px`;
 element.style.height=`${frame.height}px`;
 element.style.backgroundImage=`url(${uiUrl(name,frame)})`;
}
