export type NativeArtSource={sourceSha256:string;indexSha256:string;frames:Record<string,{file:string;sha256:string;width:number;height:number}>};

/** Source-bound original UI images. Rejected batches settle before exposing retry. */
export function createNativeUiArtLoader(source:NativeArtSource,libraryName:string,label:string){
 const locks=source.frames;
let metadata:Promise<void>|undefined;
const images=new Map<number,Promise<HTMLImageElement>>();
const mismatch=()=>new Error(`原客户端${label}素材身份不匹配，请重新导入原素材`);

async function response(url:string){
 try{
  const value=await fetch(url,{signal:AbortSignal.timeout(10000)});
  if(!value.ok)throw new Error();
  return value;
 }catch{throw new Error(`原客户端${label}素材载入失败，请检查连接后重试`);}
}

function manifest(){
 if(metadata)return metadata;
 const request=response(`/ui-national/${libraryName}/library.json`).then(async value=>{
  const library=await value.json().catch(()=>{throw mismatch();});
  if(library?.sourceSha256!==source.sourceSha256||library?.indexSha256!==source.indexSha256)throw mismatch();
  for(const [index,locked] of Object.entries(locks)){
   const frame=library.frames?.[index];
   if(!frame||frame.file!==locked.file||frame.sha256!==locked.sha256||frame.width!==locked.width||frame.height!==locked.height)throw mismatch();
  }
 });
 metadata=request;void request.catch(()=>{if(metadata===request)metadata=undefined;});return request;
}

function image(index:number){
 const locked=locks[String(index)];
 if(!Number.isInteger(index)||!locked||!/^\d+\.[a-f0-9]{16}\.png$/.test(locked.file))return Promise.reject(mismatch());
 const existing=images.get(index);if(existing)return existing;
 const request=manifest().then(async()=>{
  let data:ArrayBuffer;
  try{data=await (await response(`/ui-national/${libraryName}/${locked.file}`)).arrayBuffer();}catch{throw new Error(`原客户端${label}素材载入失败，请检查连接后重试`);}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(digest!==locked.sha256)throw mismatch();
  const url=URL.createObjectURL(new Blob([data],{type:'image/png'}));
  try{
   const result=new Image();
   await new Promise<void>((resolve,reject)=>{result.onload=()=>resolve();result.onerror=()=>reject(new Error(`原客户端${label}图片解码失败，请重试`));result.src=url;});
   if(result.naturalWidth!==locked.width||result.naturalHeight!==locked.height)throw mismatch();
   return result;
  }finally{URL.revokeObjectURL(url);}
 });
 images.set(index,request);void request.catch(()=>{if(images.get(index)===request)images.delete(index);});return request;
}

/** Original label artwork, decoded and source-checked once. Failed requests stay explicitly retryable. */
return async function load(indices:number[]){
 // Settle every requested frame before exposing retry, so another failing request
 // from this batch cannot be reused by an immediate retry.
 const settled=await Promise.allSettled([...new Set(indices)].map(async index=>[index,await image(index)] as const));
 const failed=settled.find(result=>result.status==='rejected');
 if(failed?.status==='rejected')throw failed.reason;
 return new Map(settled.map(result=>(result as PromiseFulfilledResult<readonly[number,HTMLImageElement]>).value));
}

}
