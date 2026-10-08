import contract from '../../../content/classic-176/native-ui-fonts.json';

type Glyph=[number,number,number,number,number,number,number,number];
type Page={file:string;sha256:string;width:number;height:number};
type Manifest={schemaVersion:number;profile:string;sourceFontSha256:string;family:string;size:number;weight:number;charset:number;quality:number;encoding:string;glyphCount:number;repertoireSha256:string;pages:Page[];glyphs:Record<string,Glyph>};
type ProfileLock={size:number;weight:number;manifest:string;sha256:string;glyphCount?:number;repertoireSha256?:string};
const locks=contract.profiles as Record<string,ProfileLock>;
const cache=new Map<string,Promise<NativeUiFont>>();
const mismatch=()=>new Error('原客户端文字素材身份不匹配，请重新导入字形素材');

async function bytes(url:string,sha256:string){
 let response:Response;
 try{response=await fetch(url,{signal:AbortSignal.timeout(10000)});}catch{throw new Error('原客户端文字素材载入失败，请检查连接后重试');}
 if(!response.ok)throw new Error('原客户端文字素材载入失败，请重试');
 const data=await response.arrayBuffer();
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(digest!==sha256)throw mismatch();
 return data;
}

function validate(value:Manifest,profile:string,locked:ProfileLock){
 if(!value||value.schemaVersion!==1||value.profile!==profile||value.sourceFontSha256!==contract.sourceFont.sha256||
    value.family!==contract.sourceFont.resolvedFamily||value.size!==locked.size||value.weight!==locked.weight||
    value.charset!==contract.rasterizer.charset||value.quality!==contract.rasterizer.quality||value.encoding!==contract.encoding||
    value.glyphCount!==locked.glyphCount||value.repertoireSha256!==locked.repertoireSha256||
    !Array.isArray(value.pages)||!value.pages.length||value.pages.length>32||!value.glyphs||typeof value.glyphs!=='object'||Array.isArray(value.glyphs)||
    Object.keys(value.glyphs).length!==locked.glyphCount)throw mismatch();
 for(const page of value.pages){
  if(!page||!/^kaiti-(?:12|16-bold)-[a-f0-9]{16}\.png$/.test(page.file)||!Number.isInteger(page.width)||!Number.isInteger(page.height)||
     page.width<1||page.width>2048||page.height<1||page.height>2048||!/^[a-f0-9]{64}$/.test(page.sha256))throw mismatch();
 }
 for(const [key,glyph] of Object.entries(value.glyphs)){
  if(!/^\d+$/.test(key)||Number(key)>0xffff||!Array.isArray(glyph)||glyph.length!==8||glyph.some(number=>!Number.isInteger(number)))throw mismatch();
  const [page,x,y,width,height,offsetX,offsetY,advance]=glyph;
  if(page<0||page>=value.pages.length||x<0||y<0||width<0||height<0||width>64||height>64||
     x+width>value.pages[page].width||y+height>value.pages[page].height||Math.abs(offsetX)>32||Math.abs(offsetY)>32||advance<0||advance>64)throw mismatch();
 }
}

/** Portable, source-bound pixels. Browser/local fonts do not participate in drawing. */
export class NativeUiFont{
 private readonly images=new Map<number,Promise<HTMLImageElement>>();
 private readonly decoded=new Map<number,HTMLImageElement>();
 private constructor(private readonly manifest:Manifest){}

 static async load(profile:string){
  const locked=locks[profile];
  if(!locked||!/^\/ui-national\/fonts\/kaiti-(?:12|16-bold)-[a-f0-9]{16}\.json$/.test(locked.manifest)||!/^[a-f0-9]{64}$/.test(locked.sha256))throw mismatch();
  const value=JSON.parse(new TextDecoder().decode(await bytes(locked.manifest,locked.sha256))) as Manifest;
  validate(value,profile,locked);
  return new NativeUiFont(value);
 }

 private glyph(char:string){
  const glyph=this.manifest.glyphs[String(char.codePointAt(0))];
  if(!glyph)throw new Error(`缺少原客户端文字字形 U+${char.codePointAt(0)!.toString(16).toUpperCase()}，请核对旧协议编码`);
  return glyph;
 }

 private image(page:number){
  const existing=this.images.get(page);if(existing)return existing;
  const spec=this.manifest.pages[page];
  const request=bytes(`/ui-national/fonts/${spec.file}`,spec.sha256).then(async data=>{
   const url=URL.createObjectURL(new Blob([data],{type:'image/png'}));
   try{
    const image=new Image();
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('原客户端文字图片解码失败，请重试'));image.src=url;});
    if(image.naturalWidth!==spec.width||image.naturalHeight!==spec.height)throw mismatch();
    this.decoded.set(page,image);
    return image;
   }finally{URL.revokeObjectURL(url);}
  });
  this.images.set(page,request);
  void request.catch(()=>{if(this.images.get(page)===request)this.images.delete(page);});
  return request;
 }

 async prepare(text:string){
  const pages=new Set<number>();
  for(const char of text){if(char==='\n'||char==='\r'||char==='\t')continue;const glyph=this.glyph(char);if(glyph[3]&&glyph[4])pages.add(glyph[0]);}
  const results=await Promise.allSettled([...pages].map(page=>this.image(page)));
  const failed=results.find(result=>result.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
 }

 measure(text:string){
  let width=0,maximum=0;
  const tab=Math.max(1,this.glyph(' ')[7]*8);
  for(const char of text){
   if(char==='\r')continue;
   if(char==='\n'){maximum=Math.max(maximum,width);width=0;continue;}
   if(char==='\t'){width=(Math.floor(width/tab)+1)*tab;continue;}
   width+=this.glyph(char)[7];
  }
  return Math.max(maximum,width);
 }

 paint(canvas:HTMLCanvasElement,text:string,options:{width:number;height:number;left:number;top:number;lineHeight:number;color:string;outline?:boolean}){
  // Callers await prepare before exposing controls. Painting itself is synchronous.
  const {width,height,left,top,lineHeight,color}=options;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>800||height>600||
     !Number.isInteger(left)||!Number.isInteger(top)||!Number.isInteger(lineHeight)||lineHeight<1||!/^#[a-fA-F0-9]{6}$/.test(color))throw new Error('原客户端文字绘制范围无效');
  const mask=canvas.ownerDocument.createElement('canvas');mask.width=width;mask.height=height;
  const context=canvas.getContext('2d'),ink=mask.getContext('2d');
  if(!context||!ink)throw new Error('原客户端文字绘制不可用，请重试');
  canvas.width=width;canvas.height=height;
  // Keep one bitmap pixel per design pixel even when the game canvas stylesheet uses 100% sizing.
  canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
  context.imageSmoothingEnabled=false;ink.imageSmoothingEnabled=false;
  let x=left,y=top;
  const tab=Math.max(1,this.glyph(' ')[7]*8);
  for(const char of text){
   if(char==='\r')continue;
   if(char==='\n'){x=left;y+=lineHeight;continue;}
   if(char==='\t'){x=left+(Math.floor((x-left)/tab)+1)*tab;continue;}
   const [page,sx,sy,w,h,dx,dy,advance]=this.glyph(char);
   if(w&&h&&x+dx+w>0&&x+dx<width&&y+dy+h>0&&y+dy<height){
    const image=this.decoded.get(page);
    if(!image)throw new Error('原客户端文字素材尚未准备好，请重试');
    ink.drawImage(image,sx,sy,w,h,x+dx,y+dy,w,h);
   }
   x+=advance;
  }
  // Outline the union of the line glyphs; separate character outlines can erase adjacent ink.
  ink.globalCompositeOperation='source-in';
  if(options.outline!==false){
   ink.fillStyle='#000000';ink.fillRect(0,0,width,height);
   for(const [dx,dy] of contract.rasterizer.outline)context.drawImage(mask,dx,dy);
  }
  ink.fillStyle=color;ink.fillRect(0,0,width,height);context.drawImage(mask,0,0);
 }
}

export function loadNativeUiFont(profile:string){
 const existing=cache.get(profile);if(existing)return existing;
 const request=NativeUiFont.load(profile);cache.set(profile,request);
 void request.catch(()=>{if(cache.get(profile)===request)cache.delete(profile);});
 return request;
}
