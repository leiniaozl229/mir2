import {minimapFrameByMap,minimapName} from './minimap-profile';

export type MiniMapMode='compact'|'expanded'|'hidden';
export type MiniMapMarker={id:string;x:number;y:number;kind:'self'|'player'|'npc'|'monster'|'drop'};
type Frame={index:number;width:number;height:number;file:string};
type Library={frames:Record<string,Frame>};
type Rect={left:number;top:number;width:number;height:number};
type Size={width:number;height:number};

const modes:MiniMapMode[]=['compact','expanded','hidden'];
const markerColor:Record<MiniMapMarker['kind'],string>={self:'#fff07a',player:'#69d7ff',npc:'#64e4b0',monster:'#f06b54',drop:'#f2c84b'};

export function nextMiniMapMode(mode:MiniMapMode){return modes[(modes.indexOf(mode)+1)%modes.length];}

export function mapPointFromClient(clientX:number,clientY:number,canvas:Rect,draw:Rect,world:Size){
 const localX=clientX-canvas.left-draw.left,localY=clientY-canvas.top-draw.top;
 if(draw.width<=0||draw.height<=0||localX<0||localY<0||localX>draw.width||localY>draw.height)return undefined;
 return {
  x:Math.max(0,Math.min(world.width-1,Math.round(localX/draw.width*(world.width-1)))),
  y:Math.max(0,Math.min(world.height-1,Math.round(localY/draw.height*(world.height-1)))),
 };
}

function loadImage(url:string){
 return new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.decoding='async';image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`小地图图像载入失败：${url}`));image.src=url;});
}

export class MiniMapController{
 private mode:MiniMapMode='compact';
 private mapId='0';
 private mapName=minimapName('0');
 private world:Size={width:1,height:1};
 private position={x:0,y:0};
 private markers:MiniMapMarker[]=[];
 private image?:HTMLImageElement;
 private imageUrl?:string;
 private frameIndex?:number;
 private drawRect:Rect={left:0,top:0,width:0,height:0};
 private generation=0;
 private library?:Promise<Library>;
 private readonly canvas:HTMLCanvasElement;
 private readonly nameElement:HTMLElement;
 private readonly coordsElement:HTMLElement;
 private readonly statusElement:HTMLElement;
 private readonly toggle:HTMLButtonElement;
 private readonly resizeObserver:ResizeObserver;

 constructor(private readonly root:HTMLElement,private readonly route:(point:{x:number;y:number},run:boolean)=>void){
  this.canvas=root.querySelector<HTMLCanvasElement>('#mini-map')!;
  this.nameElement=root.querySelector<HTMLElement>('[data-minimap-name]')!;
  this.coordsElement=root.querySelector<HTMLElement>('[data-hud-coords]')!;
  this.statusElement=root.querySelector<HTMLElement>('[data-minimap-status]')!;
  this.toggle=root.querySelector<HTMLButtonElement>('[data-minimap-toggle]')!;
  this.toggle.addEventListener('click',event=>{event.stopPropagation();this.cycle();});
  this.canvas.addEventListener('pointerdown',event=>this.onPointer(event));
  this.resizeObserver=new ResizeObserver(()=>this.draw());this.resizeObserver.observe(this.canvas);
  this.applyMode();
 }

 cycle(){this.setMode(nextMiniMapMode(this.mode));}
 setMode(mode:MiniMapMode){this.mode=mode;this.applyMode();}
 private applyMode(){
  this.root.dataset.mapMode=this.mode;
  this.root.setAttribute('aria-label',`${this.mapName}小地图，${this.mode==='compact'?'小地图':this.mode==='expanded'?'大地图':'已收起'}`);
  this.toggle.textContent=this.mode==='expanded'?'关':this.mode==='compact'?'大':'图';
  this.toggle.setAttribute('aria-label',this.mode==='expanded'?'切换到关闭地图':this.mode==='compact'?'切换到大地图':'打开小地图');
  requestAnimationFrame(()=>this.draw());
 }

 async setMap(mapId:string,width:number,height:number){
  const generation=++this.generation;
  this.mapId=mapId;this.mapName=minimapName(mapId);this.world={width:Math.max(1,width),height:Math.max(1,height)};
  this.nameElement.textContent=this.mapName;this.image=undefined;this.imageUrl=undefined;this.frameIndex=minimapFrameByMap[mapId];
  this.statusElement.textContent=this.frameIndex===undefined?'暂无地图资料':'正在读取地图…';this.draw();
  if(this.frameIndex===undefined)return;
  try{
   if(!this.library)this.library=fetch('/ui-national/mmap/library.json').then(async response=>{if(!response.ok)throw new Error('缺少 mmap 素材库');return response.json() as Promise<Library>;});
   const library=await this.library,frame=library.frames[this.frameIndex];
   if(!frame)throw new Error(`mmap 帧 ${this.frameIndex} 不存在`);
   const imageUrl=`/ui-national/mmap/${frame.file}`,image=await loadImage(imageUrl);
   if(generation!==this.generation)return;
   this.image=image;this.imageUrl=imageUrl;this.statusElement.textContent='';this.draw();
  }catch(error){
   if(generation!==this.generation)return;
   this.statusElement.textContent=error instanceof Error?error.message:'小地图载入失败';this.library=undefined;this.draw();
  }
 }

 setPosition(x:number,y:number){this.position={x:Math.round(x),y:Math.round(y)};this.coordsElement.textContent=`${this.position.x}:${this.position.y}`;this.draw();}
 setMarkers(markers:MiniMapMarker[]){this.markers=markers.map(marker=>({...marker}));this.draw();}

 private onPointer(event:PointerEvent){
  if(event.button!==0||this.mode==='hidden')return;
  event.preventDefault();event.stopPropagation();
  const rect=this.canvas.getBoundingClientRect();
  const point=mapPointFromClient(event.clientX,event.clientY,{left:rect.left,top:rect.top,width:rect.width,height:rect.height},this.drawRect,this.world);
  if(point)this.route(point,event.shiftKey);
 }

 private draw(){
  if(this.mode==='hidden')return;
  const width=Math.max(1,Math.round(this.canvas.clientWidth)),height=Math.max(1,Math.round(this.canvas.clientHeight)),scale=Math.max(1,window.devicePixelRatio||1);
  const pixelWidth=Math.round(width*scale),pixelHeight=Math.round(height*scale);
  if(this.canvas.width!==pixelWidth)this.canvas.width=pixelWidth;if(this.canvas.height!==pixelHeight)this.canvas.height=pixelHeight;
  const context=this.canvas.getContext('2d');if(!context)return;
  context.setTransform(scale,0,0,scale,0,0);context.imageSmoothingEnabled=false;context.clearRect(0,0,width,height);context.fillStyle='#070a08';context.fillRect(0,0,width,height);
  const sourceWidth=this.image?.naturalWidth??this.world.width*1.5,sourceHeight=this.image?.naturalHeight??this.world.height;
  const ratio=Math.min(width/sourceWidth,height/sourceHeight),drawWidth=Math.max(1,sourceWidth*ratio),drawHeight=Math.max(1,sourceHeight*ratio);
  this.drawRect={left:(width-drawWidth)/2,top:(height-drawHeight)/2,width:drawWidth,height:drawHeight};
  if(this.image)context.drawImage(this.image,this.drawRect.left,this.drawRect.top,drawWidth,drawHeight);
  else{
   context.fillStyle='#161b16';context.fillRect(this.drawRect.left,this.drawRect.top,drawWidth,drawHeight);
   context.strokeStyle='rgba(177,150,91,.18)';context.lineWidth=1;
   for(let x=0;x<=8;x++){const px=this.drawRect.left+drawWidth*x/8;context.beginPath();context.moveTo(px,this.drawRect.top);context.lineTo(px,this.drawRect.top+drawHeight);context.stroke();}
   for(let y=0;y<=8;y++){const py=this.drawRect.top+drawHeight*y/8;context.beginPath();context.moveTo(this.drawRect.left,py);context.lineTo(this.drawRect.left+drawWidth,py);context.stroke();}
  }
  for(const marker of this.markers){
   if(marker.x<0||marker.y<0||marker.x>=this.world.width||marker.y>=this.world.height)continue;
   const x=this.drawRect.left+(marker.x+.5)/this.world.width*drawWidth,y=this.drawRect.top+(marker.y+.5)/this.world.height*drawHeight;
   const radius=marker.kind==='self'?(this.mode==='expanded'?5:3):(this.mode==='expanded'?3:1.75);
   context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.fillStyle=markerColor[marker.kind];context.fill();context.strokeStyle='rgba(0,0,0,.9)';context.lineWidth=1;context.stroke();
  }
 }

 debugState(){return {mode:this.mode,mapId:this.mapId,name:this.mapName,world:{...this.world},position:{...this.position},frameIndex:this.frameIndex,imageUrl:this.imageUrl,imageReady:Boolean(this.image),drawRect:{...this.drawRect},markers:this.markers.map(marker=>({...marker}))};}
}
