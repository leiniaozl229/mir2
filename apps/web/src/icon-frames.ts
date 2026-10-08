import type {Frame} from './classic-ui';
import activeSources from '../../../content/classic-176/active-asset-sources.json';

export type IconFrame=Frame&{index?:number;empty?:boolean;opaquePixels?:number};
export type IconLibrary={frames:Record<string,IconFrame>;sourceSha256?:string;indexSha256?:string;sourceFrameCount?:number;format?:string;empty?:number[];missing?:number[]};
export type IconSource={namespace:string;library?:IconLibrary};
export type IconResolution={status:'ready'|'missing';domain:'national'|'reference_candidate'|'unknown';index:number;frame?:Frame;url?:string;sourceId?:string;reason?:string};

type SourceEntry={id:string;role:string;provenance:string;namespace:string;kind:string;sourceFiles:Array<{purpose?:string;sha256:string}>;library?:{manifests:string[];sourceFrameCount:number;format?:string}};
const sourceEntries=activeSources.assets as SourceEntry[];

/** Geometry/filename screening only; source identity is checked separately. */
export function usableIconFrame(frame:Frame|undefined):Frame|undefined{
 if(!frame)return;
 const value=frame as IconFrame;
 if(!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<=4||value.height<=1||value.width>4096||value.height>4096)return;
 if(!Number.isInteger(value.offsetX)||!Number.isInteger(value.offsetY)||value.offsetX< -32768||value.offsetX>32767||value.offsetY< -32768||value.offsetY>32767)return;
 if(!/^[A-Za-z0-9_.-]+\.png$/i.test(value.file)||value.file.startsWith('.'))return;
 if(value.empty===true||value.opaquePixels===0)return;
 return frame;
}

/** Decoded alpha only; an unavailable/blocked canvas does not prove emptiness. */
export function iconHasPixels(resource:CanvasImageSource,width:number,height:number,owner:Document=document):boolean|undefined{
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=4||height<=1)return false;
 const canvas=owner.createElement('canvas');canvas.width=width;canvas.height=height;
 const context=canvas.getContext?.('2d',{willReadFrequently:true});if(!context)return;
 try{
  context.drawImage(resource,0,0,width,height);
  const pixels=context.getImageData(0,0,width,height).data;
  for(let index=3;index<pixels.length;index+=4)if(pixels[index]>0)return true;
  return false;
 }catch{return;}
}

/** An exact frame from a registered namespace, with no adjacent/default frame. */
export function resolveIconFrame(index:number,sources:readonly IconSource[],options:{allowReference?:boolean}={}):IconResolution{
 let missing:IconResolution={status:'missing',domain:'unknown',index,reason:'source_unknown'};
 if(!Number.isSafeInteger(index)||index<0)return {...missing,reason:'invalid_index'};
 const ready:IconResolution[]=[];
 for(const source of sources){
  const namespace='/'+source.namespace.replace(/^\/+|\/+$/g,'');
  const registered=sourceEntries.filter(entry=>entry.kind==='library'&&entry.namespace===namespace&&entry.library?.manifests.includes(`assets/web${namespace}/library.json`));
  const library=source.library;
  if(!library||!registered.length)continue;
  const matches=registered.filter(entry=>{
   const data=entry.sourceFiles.find(file=>file.purpose==='data'),lookup=entry.sourceFiles.find(file=>file.purpose==='index');
   return Boolean(data&&library.sourceSha256===data.sha256&&(!lookup||library.indexSha256===lookup.sha256));
  });
  if(matches.length!==1){if(missing.domain==='unknown')missing={...missing,reason:matches.length?'ambiguous_source':'source_mismatch'};continue;}
  const entry=matches[0];
  const domain=entry.role==='active_required'&&entry.provenance==='native_pixels'?'national':entry.role==='reference_candidate'?'reference_candidate':'unknown';
  const candidate:IconResolution={status:'missing',domain,index,sourceId:entry.id,reason:'source_unselected'};
  if(domain==='unknown'||(domain==='reference_candidate'&&!options.allowReference)){if(missing.domain==='unknown')missing=candidate;continue;}
  if(library.sourceFrameCount!==entry.library!.sourceFrameCount||entry.library!.format&&library.format!==entry.library!.format)candidate.reason='source_geometry_mismatch';
  else if(index>=entry.library!.sourceFrameCount)candidate.reason='frame_out_of_range';
  else if(library.empty?.includes(index))candidate.reason='frame_empty_placeholder';
  else if(library.missing?.includes(index))candidate.reason='frame_missing';
  else{
   const frame=library.frames?.[String(index)];
   if(!frame)candidate.reason='frame_missing';
   else if(frame.index!==undefined&&frame.index!==index)candidate.reason='frame_index_mismatch';
   else if(!usableIconFrame(frame))candidate.reason='frame_empty_or_invalid';
   else ready.push({status:'ready',domain,index,sourceId:entry.id,frame,url:`${namespace}/${frame.file}`});
  }
  if(missing.domain==='unknown'||domain==='national'&&missing.domain!=='national')missing=candidate;
 }
 return ready.find(value=>value.domain==='national')??ready[0]??missing;
}
