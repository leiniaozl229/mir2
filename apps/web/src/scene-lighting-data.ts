import profile from '../../../content/classic-176/scene-lighting.json';
export type NativeLightMask={width:number;height:number;pixels:Uint8Array;trailingBytes:number};
/** Original LoadFog reads signed little-endian dimensions and width*height
 * raw brightness bytes. Extra bytes are retained in source locks. */
export function readNativeLightMask(raw:Uint8Array):NativeLightMask{
 if(raw.byteLength<8)throw new Error('灯光遮罩头被截断');
 const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),width=view.getInt32(0,true),height=view.getInt32(4,true);
 if(width<=0||height<=0||width>4096||height>4096)throw new Error('灯光遮罩尺寸无效');
 const end=8+width*height;
 if(raw.byteLength<end)throw new Error('灯光遮罩像素被截断');
 return {width,height,pixels:raw.subarray(8,end),trailingBytes:raw.byteLength-end};
}
const requests=new Map<number,Promise<NativeLightMask>>();
export function loadNativeLightMask(level:number,retry=false){
 if(!Number.isInteger(level)||level<0||level>=profile.masks.length)return Promise.reject(new Error('灯光等级无效'));
 if(retry)requests.delete(level);
 let pending=requests.get(level);
 if(!pending){
  const spec=profile.masks[level];
  const task=fetch(`/lighting/${spec.file}`,{cache:retry?'reload':'default'}).then(async response=>{
   if(!response.ok)throw new Error(`灯光遮罩读取失败 (${response.status})`);
   const raw=new Uint8Array(await response.arrayBuffer());
   const digest=await crypto.subtle.digest('SHA-256',raw);
   const hash=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
   if(hash!==spec.sha256)throw new Error('灯光遮罩版本不匹配');
   const mask=readNativeLightMask(raw);
   if(mask.width!==spec.width||mask.height!==spec.height||mask.trailingBytes!==spec.trailingBytes)throw new Error('灯光遮罩几何不匹配');
   return mask;
  });
  pending=task;requests.set(level,task);void task.catch(()=>{if(requests.get(level)===task)requests.delete(level);});
 }
 return pending;
}
