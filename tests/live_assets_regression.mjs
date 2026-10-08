import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {liveAssetPlugin} from '../apps/web/live-assets.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mir2-live-assets-'));
const assetDir=path.join(root,'export');
let middleware;
liveAssetPlugin(assetDir).configureServer({middlewares:{use(handler){middleware=handler;}}});
const server=http.createServer((req,res)=>middleware(req,res,error=>{
 res.statusCode=error?500:200;res.setHeader('Content-Type','text/html');res.end('SOURCE');
}));
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const request=(url,method='GET')=>new Promise((resolve,reject)=>{
 const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:url,method},res=>{
  const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()}));
 });req.on('error',reject);req.end();
});
try{
 assert.equal((await request('/')).body,'SOURCE');
 assert.equal((await request('/src/profile.json?import')).body,'SOURCE');
 assert.equal((await request('/ui-national/new.png')).status,404);
 await fs.mkdir(path.join(assetDir,'ui-national'),{recursive:true});
 await fs.writeFile(path.join(assetDir,'ui-national/new.png'),'PNG-FIXTURE');
 const added=await request('/ui-national/new.png');
 assert.equal(added.status,200);assert.equal(added.body,'PNG-FIXTURE');assert.equal(added.headers['content-type'],'image/png');
 await fs.writeFile(path.join(assetDir,'ui-national/new.png'),'UPDATED');
 assert.equal((await request('/ui-national/new.png')).body,'UPDATED');
 const head=await request('/ui-national/new.png','HEAD');assert.equal(head.body,'');assert.equal(head.headers['content-length'],'7');
 for(const url of ['/%2e%2e/outside.png','/ui-national/%5c..%5coutside.png','/ui-national/%00.png'])assert.equal((await request(url)).status,403,url);
 assert.equal((await request('/ui-national/%xx.png')).status,400);
 console.log('PASS: root/source passthrough, late assets, replacements, MIME, HEAD, missing image 404 and path boundaries');
}finally{
 await new Promise(resolve=>server.close(resolve));
 await fs.rm(root,{recursive:true,force:true});
}
