import {createReadStream} from 'node:fs';
import {stat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const assetRoot=fileURLToPath(new URL('../../assets/web/',import.meta.url));
const mime={'.png':'image/png','.json':'application/json','.jpg':'image/jpeg',
 '.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.wav':'audio/wav',
 '.mp3':'audio/mpeg','.ogg':'audio/ogg','.bin':'application/octet-stream',
 '.map':'application/octet-stream','.woff2':'font/woff2','.svg':'image/svg+xml'};
function inside(root,file){const relative=path.relative(root,file);return relative!==''&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative);}

export function liveAssetPlugin(root=assetRoot){
 return {name:'mir2-live-assets',configureServer(server){
  server.middlewares.use(async(req,res,next)=>{
   if(req.method!=='GET'&&req.method!=='HEAD')return next();
   let pathname;
   try{pathname=decodeURIComponent((req.url??'').split('?')[0]);}catch{res.statusCode=400;res.end();return;}
   if(pathname==='/')return next();
   const file=path.resolve(root,`.${pathname}`);
   if(!inside(root,file)||pathname.includes('\0')||pathname.includes('\\')){res.statusCode=403;res.end();return;}
   if(!/^\/(actors|audio|effects|items|libraries|lighting|maps|ui|ui-national)\//.test(pathname)&&pathname!=='/national-gameplay-import.json')return next();
   try{
    const info=await stat(file);
    if(!info.isFile())return next();
    if(!inside(await realpath(root),await realpath(file))){res.statusCode=403;res.end();return;}
    res.setHeader('Content-Type',mime[path.extname(file).toLowerCase()]??'application/octet-stream');
    res.setHeader('Content-Length',info.size);
    res.setHeader('Cache-Control','no-cache');
    if(req.method==='HEAD'){res.end();return;}
    const stream=createReadStream(file);
    stream.on('error',()=>{if(!res.headersSent)res.statusCode=500;res.end();});
    res.on('close',()=>stream.destroy());stream.pipe(res);
   }catch(error){
    if(error.code==='ENOENT'||error.code==='ENOTDIR'){
     // Missing images must never masquerade as the SPA HTML fallback.
     if(mime[path.extname(file).toLowerCase()]){res.statusCode=404;res.end();return;}
     return next();
    }
    next(error);
   }
  });
 }};
}
