import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import worldViewContract from '../../../content/classic-176/world-view.json';
import {FrameBudget} from './perf';
import {MAP_LAYER_NAMES,MAP_LIBRARY_NAMES,mapObjectLibraryForArea,isMapCandidateLibrary,mapCandidateSources,resolveMapFrame,type MapLibrary,type MapLibraryName,type NativeMapLibraryName} from './map-assets';

type Chunk={x:number;y:number;width:number;height:number;file:string};
type World={width:number;height:number;chunks:Chunk[];sourceSha256?:string};
type MapRenderDiagnostics={map:string;sourceSha256?:string;visibleTiles:number;unresolvedReferences:number;referenceRuleSkipped:number};

export const WORLD_VIEW=Object.freeze({...worldViewContract,
 viewport:Object.freeze({...worldViewContract.viewport}),cell:Object.freeze({...worldViewContract.cell}),
 cameraAnchor:Object.freeze({...worldViewContract.cameraAnchor}),pointerOrigin:Object.freeze({...worldViewContract.pointerOrigin})});

export async function createMapView(viewport:HTMLElement,status:HTMLOutputElement){
const app=new Application();
await app.init({width:800,height:600,background:0x000000,antialias:false,preference:'webgl',roundPixels:true});
viewport.appendChild(app.canvas);
const frameBudget=new FrameBudget();
frameBudget.attach(app.ticker);
const getJSON=async<T>(url:string):Promise<T>=>{const response=await fetch(url);if(!response.ok)throw new Error(`${url}: ${response.status}`);return response.json();};
let mapId='0',world=await getJSON<World>('/maps/0/map.json');
 let mapAnimationCount=0,mapAnimationTime=performance.now();
const baseLibraries=MAP_LIBRARY_NAMES.slice(0,3);
const loadedNativeLibraries=new Map<string,MapLibrary>();
const nativeLibraryRequests=new Map<string,Promise<MapLibrary>>();
const loadNativeLibrary=(name:NativeMapLibraryName)=>{
 const loaded=loadedNativeLibraries.get(name);if(loaded)return Promise.resolve(loaded);
 let pending=nativeLibraryRequests.get(name);
 if(!pending){pending=getJSON<MapLibrary>(`/libraries/${name}/library.json`).then(library=>{loadedNativeLibraries.set(name,library);return library;});nativeLibraryRequests.set(name,pending);const attempt=pending;void pending.catch(()=>{if(nativeLibraryRequests.get(name)===attempt)nativeLibraryRequests.delete(name);});}
 return pending;
};
await Promise.all(baseLibraries.map(loadNativeLibrary));
const candidateLibraries=new Map<string,MapLibrary>(),candidateRequests=new Map<string,Promise<MapLibrary>>();
const chunkCache=new Map<string,Promise<DataView>>();
const textureCache=new Map<string,Promise<Texture>>();
let centerX=296,centerY=624,generation=0,mapRequest=0,worldRequest=0,requestedMapId=mapId,current:Container|undefined,showCollision=false;
let renderWindow:{map:string;left:number;right:number;top:number;bottom:number}|undefined;
const viewportCells={left:WORLD_VIEW.cameraAnchor.x/48,right:(800-WORLD_VIEW.cameraAnchor.x)/48,
 top:WORLD_VIEW.cameraAnchor.y/32,bottom:(600-WORLD_VIEW.cameraAnchor.y)/32},renderSafetyCells=2;
const needsRenderForViewport=(x:number,y:number,window:NonNullable<typeof renderWindow>)=>
 (window.left>0&&x-viewportCells.left<=window.left+renderSafetyCells)||
 (window.right<world.width-1&&x+viewportCells.right>=window.right-renderSafetyCells)||
 (window.top>0&&y-viewportCells.top<=window.top+renderSafetyCells)||
 (window.bottom<world.height-1&&y+viewportCells.bottom>=window.bottom-renderSafetyCells);
let renderDiagnostics:MapRenderDiagnostics|undefined;
let cameraMotion:{fromX:number;fromY:number;toX:number;toY:number;start:number;duration:number}|undefined;
const doorStates=new Map<string,boolean>();
const collisionCells=new Map<string,boolean>();
const depth=new Container();depth.sortableChildren=true;app.stage.addChild(depth);let mapSprites:Container[]=[];
type AnimationFrame={texture:Texture;x:number;y:number;opaqueBase:boolean};
type Animation={sprite:Sprite;frames:AnimationFrame[];tick:number;baseSprite?:Sprite};
let animations:Animation[]=[];
app.ticker.add(()=>{
 const now=performance.now();
  if(now-mapAnimationTime>=50){mapAnimationTime=now;if(++mapAnimationCount>100000)mapAnimationCount=0;}
 if(cameraMotion){
  const progress=Math.min(1,(now-cameraMotion.start)/cameraMotion.duration);
  app.stage.position.set(cameraMotion.fromX+(cameraMotion.toX-cameraMotion.fromX)*progress,cameraMotion.fromY+(cameraMotion.toY-cameraMotion.fromY)*progress);
  if(progress===1){app.stage.position.set(cameraMotion.toX,cameraMotion.toY);cameraMotion=undefined;}
 }
  for(const animation of animations){const frame=animation.frames[Math.floor(mapAnimationCount/(animation.tick+1))%animation.frames.length];animation.sprite.texture=frame.texture;animation.sprite.position.set(frame.x,frame.y);if(animation.baseSprite){animation.baseSprite.texture=frame.texture;animation.baseSprite.visible=frame.opaqueBase;}}
});
function chunkData(chunk:Chunk,id:string){
 const key=`${id}/${chunk.file}`;let pending=chunkCache.get(key);
 if(!pending){pending=fetch(`/maps/${encodeURIComponent(id)}/${chunk.file}`).then(async r=>{if(!r.ok)throw new Error('地图块读取失败');return new DataView(await r.arrayBuffer());});chunkCache.set(key,pending);const attempt=pending;void pending.catch(()=>{if(chunkCache.get(key)===attempt)chunkCache.delete(key);});}
 return pending;
}
function candidateData(namespace:string){
 const url=`${namespace}/library.json`;let pending=candidateRequests.get(url);
 if(!pending){pending=getJSON<MapLibrary>(url).then(library=>{if(!isMapCandidateLibrary(namespace,library))throw new Error('地图参考资源来源不匹配');candidateLibraries.set(namespace,library);return library;});candidateRequests.set(url,pending);const attempt=pending;void pending.catch(()=>{if(candidateRequests.get(url)===attempt)candidateRequests.delete(url);});}
 return pending;
}
async function render(request:number){
 if(request!==mapRequest||request!==worldRequest)return false;
 const mine=++generation,cx=centerX,cy=centerY,id=mapId,activeWorld=world;
 const isCurrent=()=>request===mapRequest&&request===worldRequest&&mine===generation;
 status.textContent=`正在载入 ${cx}, ${cy}…`;
 const left=Math.max(0,cx-12),right=Math.min(activeWorld.width-1,cx+12),top=Math.max(0,cy-14),bottom=Math.min(activeWorld.height-1,cy+24);
 const doorMargin=10;
 const chunks=activeWorld.chunks.filter(c=>c.x<=right+doorMargin&&c.y<=bottom+doorMargin&&c.x+c.width>left-doorMargin&&c.y+c.height>top-doorMargin);
 let buffers:DataView[];
 try{buffers=await Promise.all(chunks.map(chunk=>chunkData(chunk,id)));}catch(error){if(!isCurrent())return false;throw error;}
 if(!isCurrent())return false;
 const activeDoorGroups:{x:number;y:number;group:number;open:boolean}[]=[];
 for(const [key,open] of doorStates){
  const [doorMap,xText,yText]=key.split(':');if(doorMap!==id)continue;
  const doorX=Number(xText),doorY=Number(yText),ci=chunks.findIndex(c=>doorX>=c.x&&doorY>=c.y&&doorX<c.x+c.width&&doorY<c.y+c.height);
  if(ci<0)continue;
  const c=chunks[ci],data=buffers[ci],offset=((doorX-c.x)*c.height+doorY-c.y)*12,doorIndex=data.getUint8(offset+6);
  if((doorIndex&0x80)!==0)activeDoorGroups.push({x:doorX,y:doorY,group:doorIndex&0x7f,open});
 }
 const doorGroupState=(x:number,y:number,group:number)=>{
  for(let i=activeDoorGroups.length-1;i>=0;i--){const door=activeDoorGroups[i];if(door.group===group&&Math.abs(door.x-x)<=10&&Math.abs(door.y-y)<=10)return door.open;}
  return undefined;
 };
 const neededObjectLibraries=new Set<MapLibraryName>();
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const ci=chunks.findIndex(c=>x>=c.x&&y>=c.y&&x<c.x+c.width&&y<c.y+c.height);if(ci<0)continue;
  const c=chunks[ci],data=buffers[ci],offset=((x-c.x)*c.height+y-c.y)*12;
  if((data.getUint16(offset+4,true)&0x7fff)>0){const library=mapObjectLibraryForArea(data.getUint8(offset+10));if(library)neededObjectLibraries.add(library);}
 }
 const neededCandidateLibraries=new Set(neededObjectLibraries);
 const candidateSources=mapCandidateSources({mapId:id,mapSourceSha256:activeWorld.sourceSha256}).filter(source=>source.library==='Tiles'||neededCandidateLibraries.has(source.library));
 try{await Promise.all([...candidateSources.map(source=>candidateData(source.namespace)),...[...neededObjectLibraries].filter((name):name is NativeMapLibraryName=>(MAP_LIBRARY_NAMES as readonly string[]).includes(name)).map(loadNativeLibrary)]);}catch(error){if(!isCurrent())return false;throw error;}
 if(!isCurrent())return false;
 const next=new Container(),background=new Container(),middle=new Container(),flatObjects=new Container(),objects=new Container(),overlay=new Graphics();
 next.addChild(background,middle,flatObjects,overlay);objects.sortableChildren=true;
 let visible=0,unresolved=0,referenceRuleSkipped=0;
 const jobs:Promise<void>[]=[];
 const nextAnimations:Animation[]=[];
 const nextCollisionCells=new Map<string,boolean>();
 try{
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const ci=chunks.findIndex(c=>x>=c.x&&y>=c.y&&x<c.x+c.width&&y<c.y+c.height);
  const c=chunks[ci],data=buffers[ci],offset=((x-c.x)*c.height+y-c.y)*12;
  const px=x*48,py=y*32;
  const blocked=((data.getUint16(offset,true)|data.getUint16(offset+4,true))&0x8000)!==0;
  const cellKey=`${id}:${x}:${y}`,doorIndex=data.getUint8(offset+6),doorOffset=data.getUint8(offset+7),doorGroup=doorIndex&0x7f;
  const doorOpen=doorGroupState(x,y,doorGroup)??doorStates.get(cellKey)??((doorOffset&0x80)!==0);
  nextCollisionCells.set(cellKey,(doorIndex&0x80)!==0?doorOpen??!blocked:!blocked);
  if(showCollision&&blocked)overlay.rect(px,py,48,32).fill({color:0xff4422,alpha:0.25});
  for(let layer=0;layer<3;layer++){
   if(layer===0&&(x%2!==0||y%2!==0))continue;
   let rawIndex=data.getUint16(offset+layer*2,true)&0x7fff;
   if(rawIndex===0)continue;
   if(layer===2&&doorGroup>0&&doorOpen)rawIndex+=doorOffset&0x7f;
   const library=layer===0?'Tiles':layer===1?'SmTiles':mapObjectLibraryForArea(data.getUint8(offset+10));
   if(!library){unresolved++;continue;}
   const index=rawIndex-1;
   const resolve=(frameIndex:number)=>resolveMapFrame({mapId:id,mapSourceSha256:activeWorld.sourceSha256,layer:MAP_LAYER_NAMES[layer],library,index:frameIndex},{native:loadedNativeLibraries.get(library),candidates:candidateLibraries});
   const resolved=resolve(index),frame=resolved.frame;
   if(resolved.status!=='ready'||!frame){if(resolved.reason==='reference_out_of_range_nil')referenceRuleSkipped++;else if(resolved.status!=='empty')unresolved++;continue;}
   const animation=layer===2?data.getUint8(offset+8):0,blend=(animation&128)!==0,frameCount=Math.max(1,animation&127);
    const floorTile=layer<2||(frame.width===48&&frame.height===32),sprite=new Sprite(),frameJobs:Promise<Texture>[]=[],framePositions:{x:number;y:number;opaqueBase:boolean}[]=[];
   for(let a=0;a<frameCount;a++){
    const animated=resolve(index+a),animatedFrame=animated.status==='ready'?animated.frame:undefined;
    if(!animatedFrame||!animated.url){if(animated.status!=='empty')unresolved++;frameJobs.push(Promise.resolve(Texture.EMPTY));framePositions.push({x:px,y:py,opaqueBase:false});continue;}
    const url=animated.url;
    let texture=textureCache.get(url);
    if(!texture){texture=Assets.load<Texture>(url).then(t=>{t.source.scaleMode='nearest';return t;});textureCache.set(url,texture);const attempt=texture;void texture.catch(()=>{if(textureCache.get(url)===attempt)textureCache.delete(url);});}
    frameJobs.push(texture);
    framePositions.push(blend?{x:px+animatedFrame.offsetX-2,y:py+animatedFrame.offsetY-68,opaqueBase:animatedFrame.width===48&&animatedFrame.height===32}:{x:px,y:layer<2||animatedFrame.width===48&&animatedFrame.height===32?py:py+32-animatedFrame.height,opaqueBase:false});
   }
    // Native PlayScn draws 48x32 foreground frames in its ordinary pass and
    // draws every high-bit frame again in the additive pass. Allocate that
    // ordinary copy only when this animation actually contains such a frame.
    const baseSprite=blend&&framePositions.some(position=>position.opaqueBase)?new Sprite():undefined;
    sprite.zIndex=y*10000+x;
    if(blend){sprite.blendMode='add';objects.addChild(sprite);if(baseSprite){baseSprite.position.set(px,py);baseSprite.zIndex=y*10000+x;baseSprite.visible=false;flatObjects.addChild(baseSprite);}}
    else (layer===0?background:layer===1?middle:floorTile?flatObjects:objects).addChild(sprite);
    jobs.push(Promise.all(frameJobs).then(textures=>{if(sprite.destroyed||(baseSprite&&baseSprite.destroyed))return;sprite.texture=textures[0];sprite.position.set(framePositions[0].x,framePositions[0].y);if(baseSprite){baseSprite.texture=textures[0];baseSprite.visible=framePositions[0].opaqueBase;}if(textures.length>1)nextAnimations.push({sprite,frames:textures.map((texture,i)=>({texture,...framePositions[i]})),tick:data.getUint8(offset+9),baseSprite});}));visible++;
  }
 }
 await Promise.all(jobs);
 }catch(error){next.destroy({children:true});objects.destroy({children:true});if(!isCurrent())return false;throw error;}
 if(!isCurrent()){next.destroy({children:true});objects.destroy({children:true});return false;}
 if(current){app.stage.removeChild(current);current.destroy({children:true});}
 for(const sprite of mapSprites)sprite.destroy();
 mapSprites=objects.removeChildren().filter((sprite):sprite is Container=>Boolean(sprite)&&!sprite.destroyed);
 if(mapSprites.length)depth.addChild(...mapSprites);
 objects.destroy();
 current=next;animations=nextAnimations;app.stage.addChildAt(next,0);
 for(const [key,walkable] of nextCollisionCells)collisionCells.set(key,walkable);
 renderWindow={map:id,left,right,top,bottom};
 renderDiagnostics={map:id,sourceSha256:activeWorld.sourceSha256,visibleTiles:visible,unresolvedReferences:unresolved,referenceRuleSkipped};
 if(!cameraMotion)app.stage.position.set(WORLD_VIEW.cameraAnchor.x-cx*48,WORLD_VIEW.cameraAnchor.y-cy*32);
 status.textContent=`地图 ${id} · ${cx}, ${cy} · ${visible} 个图块 · ${unresolved} 个未解析引用${referenceRuleSkipped?` · ${referenceRuleSkipped} 个参考规则跳过`:''}`;
 return true;
}

// Coalesce same-map refreshes while a render is loading. Keep one follow-up for
// center/door changes that arrive during the active pass instead of queuing a
// full viewport render for every movement packet.
type ScheduledRender={request:number;promise:Promise<boolean>;again:boolean};
let renderTail:Promise<unknown>=Promise.resolve(),scheduledRender:ScheduledRender|undefined;
const scheduleRender=():Promise<boolean>=>{
 const request=mapRequest,active=scheduledRender;
 if(active?.request===request){active.again=true;return active.promise;}
 const task=renderTail.then(()=>render(request),()=>render(request));renderTail=task.catch(()=>false);
 const state:ScheduledRender={request,promise:Promise.resolve(false),again:false};
  const promise:Promise<boolean>=task.then(result=>{
  if(scheduledRender===state)scheduledRender=undefined;
  if(!result||request!==mapRequest)return result;
  const window=renderWindow;
  if(state.again||!window||window.map!==mapId||needsRenderForViewport(centerX,centerY,window))return scheduleRender();
  return result;
 },error=>{if(scheduledRender===state)scheduledRender=undefined;throw error;});
 state.promise=promise;scheduledRender=state;return promise;
};

await scheduleRender();
return {app,depth,frameBudget,get width(){return world.width;},get height(){return world.height;},get map(){return mapId;},
 get center(){return {x:centerX,y:centerY};},
 get renderDiagnostics(){return renderDiagnostics?{...renderDiagnostics}:undefined;},
 cellAtScreen(x:number,y:number){
  return {x:Math.floor((x-app.stage.position.x)/48),y:Math.floor((y-app.stage.position.y)/32)};
 },
 async setCenter(x:number,y:number){
  cameraMotion=undefined;
  centerX=Math.max(0,Math.min(world.width-1,Math.round(x)));centerY=Math.max(0,Math.min(world.height-1,Math.round(y)));
  app.stage.position.set(WORLD_VIEW.cameraAnchor.x-centerX*48,WORLD_VIEW.cameraAnchor.y-centerY*32);
  await scheduleRender();
 },
 moveCenter(x:number,y:number,duration=600,start=performance.now()){
  const nextX=Math.max(0,Math.min(world.width-1,Math.round(x))),nextY=Math.max(0,Math.min(world.height-1,Math.round(y)));
  if(nextX===centerX&&nextY===centerY)return;
  const targetX=WORLD_VIEW.cameraAnchor.x-nextX*48,targetY=WORLD_VIEW.cameraAnchor.y-nextY*32;
  cameraMotion={fromX:app.stage.position.x,fromY:app.stage.position.y,toX:targetX,toY:targetY,start,duration};
  centerX=nextX;centerY=nextY;
  const window=renderWindow;
  if(!window||window.map!==mapId||needsRenderForViewport(nextX,nextY,window))void scheduleRender();
 },
 async setMap(id:string){
  if(!/^[A-Za-z0-9]{1,10}$/.test(id))throw new Error('地图编号无效');
  const request=++mapRequest;requestedMapId=id;++generation;renderTail=Promise.resolve();
  collisionCells.clear();
  for(const key of doorStates.keys())if(key.startsWith(`${id}:`))doorStates.delete(key);
  cameraMotion=undefined;renderWindow=undefined;renderDiagnostics=undefined;
  try{
   const next=await getJSON<World>(`/maps/${encodeURIComponent(id)}/map.json`);
   if(request!==mapRequest)return false;
   mapId=id;world=next;worldRequest=request;centerX=Math.max(0,Math.min(world.width-1,centerX));centerY=Math.max(0,Math.min(world.height-1,centerY));app.stage.position.set(WORLD_VIEW.cameraAnchor.x-centerX*48,WORLD_VIEW.cameraAnchor.y-centerY*32);
   return await scheduleRender();
  }catch(error){if(request!==mapRequest)return false;throw error;}
 },
 setDoor(x:number,y:number,open:boolean){
  if(!Number.isInteger(x)||!Number.isInteger(y))return Promise.resolve();
  doorStates.set(`${requestedMapId}:${x}:${y}`,open);return scheduleRender();
 },
 isWalkable(x:number,y:number){
  if(worldRequest!==mapRequest)return undefined;
  const key=`${mapId}:${Math.round(x)}:${Math.round(y)}`;
  return doorStates.has(key)?doorStates.get(key):collisionCells.get(key);
 },
 async setCollision(value:boolean){showCollision=value;await scheduleRender();}};
}
