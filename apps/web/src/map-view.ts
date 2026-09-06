import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';

type Chunk={x:number;y:number;width:number;height:number;file:string};
type World={width:number;height:number;chunks:Chunk[]};
type Frame={width:number;height:number;file:string;offsetX:number;offsetY:number};
type Library={frames:Record<string,Frame>;empty:number[];missing:number[]};

export async function createMapView(viewport:HTMLElement,status:HTMLOutputElement){
const app=new Application();
await app.init({width:800,height:600,background:0x080a08,antialias:false,preference:'webgl'});
viewport.appendChild(app.canvas);
const getJSON=async<T>(url:string):Promise<T>=>{const response=await fetch(url);if(!response.ok)throw new Error(`${url}: ${response.status}`);return response.json();};
let mapId='0',world=await getJSON<World>('/maps/0/map.json');
const names=['Tiles','SmTiles','Objects'];
const libraries=await Promise.all(names.map(name=>getJSON<Library>(`/libraries/${name}/library.json`)));
const chunkCache=new Map<string,Promise<DataView>>();
const textureCache=new Map<string,Promise<Texture>>();
let centerX=296,centerY=624,markerX=centerX,markerY=centerY,generation=0,current:Container|undefined,showCollision=false;
const doorStates=new Map<string,boolean>();
const depth=new Container();depth.sortableChildren=true;app.stage.addChild(depth);let mapSprites:Container[]=[];
const miniMap=viewport.parentElement?.querySelector<HTMLCanvasElement>('#mini-map');
let redrawMiniMap:()=>void=()=>{};
type Animation={sprite:Sprite;textures:Texture[];tick:number};
let animations:Animation[]=[];
app.ticker.add(()=>{const tick=Math.floor(performance.now()/100);for(const animation of animations)animation.sprite.texture=animation.textures[Math.floor(tick/(animation.tick+1))%animation.textures.length];});
function chunkData(chunk:Chunk,id:string){
 const key=`${id}/${chunk.file}`;let pending=chunkCache.get(key);
 if(!pending){pending=fetch(`/maps/${encodeURIComponent(id)}/${chunk.file}`).then(async r=>{if(!r.ok)throw new Error('地图块读取失败');return new DataView(await r.arrayBuffer());});chunkCache.set(key,pending);}
 return pending;
}
async function render(){
 const mine=++generation,cx=centerX,cy=centerY,id=mapId,activeWorld=world;
 status.textContent=`正在载入 ${cx}, ${cy}…`;
 const left=Math.max(0,cx-12),right=Math.min(activeWorld.width-1,cx+12),top=Math.max(0,cy-14),bottom=Math.min(activeWorld.height-1,cy+24);
 const chunks=activeWorld.chunks.filter(c=>c.x<=right&&c.y<=bottom&&c.x+c.width>left&&c.y+c.height>top);
 const buffers=await Promise.all(chunks.map(chunk=>chunkData(chunk,id)));
 const next=new Container(),floor=new Container(),objects=new Container(),overlay=new Graphics();
 next.addChild(floor,overlay);objects.sortableChildren=true;
 let visible=0,unresolved=0;
 const jobs:Promise<void>[]=[];
 const nextAnimations:Animation[]=[];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const ci=chunks.findIndex(c=>x>=c.x&&y>=c.y&&x<c.x+c.width&&y<c.y+c.height);
  const c=chunks[ci],data=buffers[ci],offset=((x-c.x)*c.height+y-c.y)*12;
  const px=x*48,py=y*32;
  if(showCollision&&((data.getUint16(offset,true)|data.getUint16(offset+4,true))&0x8000))overlay.rect(px,py,48,32).fill({color:0xff4422,alpha:0.25});
  for(let layer=0;layer<3;layer++){
   if(layer===0&&(x%2!==0||y%2!==0))continue;
   const index=(data.getUint16(offset+layer*2,true)&0x7fff)-1;
   if(index<0)continue;
   const library=libraries[layer],frame=library.frames[index];
   if(!frame){if(!library.empty.includes(index))unresolved++;continue;}
   const animation=layer===2?data.getUint8(offset+8):0;
   const floorTile=layer===0||(!animation&&((frame.width===48&&frame.height===32)||(frame.width===96&&frame.height===64)));
   const sprite=new Sprite();sprite.position.set(px,floorTile?py:py+32-frame.height);sprite.zIndex=y*activeWorld.width+x;
   if(animation&128){sprite.blendMode='add';if(index>=2723&&index<=2732){sprite.x+=frame.offsetX;sprite.y+=frame.offsetY;}}
   (floorTile?floor:objects).addChild(sprite);
   const frameJobs:Promise<Texture>[]=[];
   for(let a=0;a<Math.max(1,animation&127);a++){
    const animatedFrame=library.frames[index+a];
    if(!animatedFrame){if(!library.empty.includes(index+a))unresolved++;frameJobs.push(Promise.resolve(Texture.EMPTY));continue;}
    const url=`/libraries/${names[layer]}/${animatedFrame.file}`;
    let texture=textureCache.get(url);
    if(!texture){texture=Assets.load<Texture>(url).then(t=>{t.source.scaleMode='nearest';return t;});textureCache.set(url,texture);}
    frameJobs.push(texture);
   }
   jobs.push(Promise.all(frameJobs).then(textures=>{sprite.texture=textures[0];if(textures.length>1)nextAnimations.push({sprite,textures,tick:data.getUint8(offset+9)});}));visible++;
  }
 }
 for(const [key,open] of doorStates){
  const [doorMap,doorXText,doorYText]=key.split(':');
  if(doorMap!==id)continue;
  const doorX=Number(doorXText),doorY=Number(doorYText);
  if(doorX<left||doorX>right||doorY<top||doorY>bottom)continue;
  const x=doorX*48+5,y=doorY*32+3;
  if(open){
   overlay.roundRect(x,y,38,26,3).stroke({color:0x8ac48a,width:2,alpha:.72});
   overlay.moveTo(x+8,y+13).lineTo(x+30,y+13).stroke({color:0x8ac48a,width:2,alpha:.55});
  }else{
   overlay.roundRect(x,y,38,26,3).fill({color:0x4b2b1e,alpha:.72}).stroke({color:0xd18b55,width:2,alpha:.9});
   overlay.moveTo(x+8,y+5).lineTo(x+30,y+21).stroke({color:0xd18b55,width:2,alpha:.8});
   overlay.moveTo(x+30,y+5).lineTo(x+8,y+21).stroke({color:0xd18b55,width:2,alpha:.8});
  }
 }
 await Promise.all(jobs);
 if(mine!==generation){next.destroy({children:true});objects.destroy({children:true});return;}
 if(current){app.stage.removeChild(current);current.destroy({children:true});}
 for(const sprite of mapSprites)sprite.destroy();
 mapSprites=objects.removeChildren().filter((sprite):sprite is Container=>Boolean(sprite)&&!sprite.destroyed);
 if(mapSprites.length)depth.addChild(...mapSprites);
 objects.destroy();
 current=next;animations=nextAnimations;app.stage.addChildAt(next,0);app.stage.position.set(400-cx*48,300-cy*32);
 if(miniMap){
  const context=miniMap.getContext('2d');
  if(context){
   const cellWidth=6,cellHeight=3;
   redrawMiniMap=()=>{
    context.imageSmoothingEnabled=false;
    context.fillStyle='#11170f';context.fillRect(0,0,miniMap.width,miniMap.height);
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
     const chunkIndex=chunks.findIndex(chunk=>x>=chunk.x&&y>=chunk.y&&x<chunk.x+chunk.width&&y<chunk.y+chunk.height);
     if(chunkIndex<0)continue;
     const chunk=chunks[chunkIndex],data=buffers[chunkIndex],offset=((x-chunk.x)*chunk.height+y-chunk.y)*12;
     const tile=data.getUint16(offset,true)&0x7fff,smTile=data.getUint16(offset+2,true)&0x7fff;
     const blocked=((data.getUint16(offset,true)|data.getUint16(offset+4,true))&0x8000)!==0;
     context.fillStyle=blocked?'#4d3027':smTile?'#697047':tile?'#465c3d':'#263322';
     context.fillRect((x-left)*cellWidth,(y-top)*cellHeight,cellWidth,cellHeight);
    }
    const markerLeft=(markerX-left)*cellWidth,markerTop=(markerY-top)*cellHeight;
    if(markerLeft>=0&&markerLeft<miniMap.width&&markerTop>=0&&markerTop<miniMap.height){
     context.fillStyle='#f4d66d';context.fillRect(markerLeft-2,markerTop-2,5,5);
     context.strokeStyle='#3b1b12';context.lineWidth=1;context.strokeRect(markerLeft-2.5,markerTop-2.5,6,6);
    }
   };
   redrawMiniMap();
  }
 }
 status.textContent=`地图 ${id} · ${cx}, ${cy} · ${visible} 个图块 · ${unresolved} 个未解析引用`;
}

// Serialize scene commits so a fast character update cannot mutate Pixi's display tree concurrently.
let renderTail:Promise<void>=Promise.resolve();
const scheduleRender=()=>{const task=renderTail.then(render,render);renderTail=task.catch(()=>{});return task;};

await scheduleRender();
return {app,depth,get width(){return world.width;},get height(){return world.height;},get map(){return mapId;},
 get center(){return {x:centerX,y:centerY};},
 async setCenter(x:number,y:number){centerX=Math.max(0,Math.min(world.width-1,Math.round(x)));centerY=Math.max(0,Math.min(world.height-1,Math.round(y)));await scheduleRender();},
 setMarker(x:number,y:number){markerX=Math.round(x);markerY=Math.round(y);redrawMiniMap();},
 async setMap(id:string){
  if(!/^[A-Za-z0-9]{1,10}$/.test(id))throw new Error('地图编号无效');
 const next=await getJSON<World>(`/maps/${encodeURIComponent(id)}/map.json`);
  for(const key of doorStates.keys())if(key.startsWith(`${id}:`))doorStates.delete(key);
  mapId=id;world=next;centerX=Math.max(0,Math.min(world.width-1,centerX));centerY=Math.max(0,Math.min(world.height-1,centerY));await scheduleRender();
 },
 setDoor(x:number,y:number,open:boolean){
  if(!Number.isInteger(x)||!Number.isInteger(y))return Promise.resolve();
  doorStates.set(`${mapId}:${x}:${y}`,open);return scheduleRender();
 },
 async setCollision(value:boolean){showCollision=value;await scheduleRender();}};
}
