import {Assets,Container,Sprite,Text,Texture} from 'pixi.js';
import {ItemIconAssets,itemIconHasPixels} from './item-icons';

export type GroundItem={id:number;x:number;y:number;looks:number;name:string};
type GroundVisual={visual:Container;sprite:Sprite;label:Text;token:number;url?:string;epoch?:number};

export class GroundItems {
 private items=new Map<number,GroundItem>();
 private visuals=new Map<number,Container>();
 private draws=new Map<number,GroundVisual>();
 private generation=0;
 private readonly iconAssets:ItemIconAssets;
 private retrying:Promise<boolean>|undefined;
 constructor(private layer:Container,private pickup:(item:GroundItem)=>void,private list?:HTMLElement){this.iconAssets=new ItemIconAssets('dnitems',()=>this.refreshIcons());this.renderList();}
 clear(){this.generation++;for(const visual of this.visuals.values())visual.destroy({children:true});this.visuals.clear();this.draws.clear();this.items.clear();this.renderList();}
 at(x:number,y:number){return [...this.items.values()].find(item=>item.x===x&&item.y===y);}
 get(id:number){return this.items.get(id);}
 debugState(){return [...this.items.values()].map(item=>({...item}));}
 remove(id:number){this.items.delete(id);this.visuals.get(id)?.destroy({children:true});this.visuals.delete(id);this.draws.delete(id);this.renderList();}
 hitTest(x:number,y:number){return [...this.visuals.entries()].map(([id,visual])=>({item:this.items.get(id),visual})).filter((entry):entry is {item:GroundItem;visual:Container}=>{const bounds=entry.visual.getBounds();return Boolean(entry.item)&&x>=bounds.x&&x<=bounds.x+bounds.width&&y>=bounds.y&&y<=bounds.y+bounds.height;}).sort((left,right)=>right.visual.zIndex-left.visual.zIndex)[0]?.item;}
 requestPickup(item:GroundItem){if(this.items.get(item.id)===item)this.pickup(item);}
 retryIcons(){
  if(this.retrying)return this.retrying;
  const failed=this.iconAssets.failedImageUrls().map(url=>this.iconAssets.imageUrl(url));
  if(!failed.length)return Promise.resolve(this.iconAssets.retry());
  for(const draw of this.draws.values())draw.token++;
  const retry=Promise.allSettled(failed.map(url=>Promise.resolve().then(()=>Assets.unload(url)))).then(()=>{this.retrying=undefined;return this.iconAssets.retry();});
  this.retrying=retry;return retry;
 }
 add(item:GroundItem){
  this.remove(item.id);this.items.set(item.id,item);
  const visual=new Container();visual.position.set(item.x*48,item.y*32);visual.zIndex=item.y*10000+item.x+.25;visual.eventMode='static';visual.cursor='url("/ui/Cursors/Cursor_Default.CUR"), pointer';
  const sprite=new Sprite(Texture.EMPTY),label=new Text({text:item.name,style:{fontFamily:'SimSun, Songti SC, serif',fontSize:12,fill:0xffe085,stroke:{color:0x000000,width:3}}});
  label.anchor.set(.5,1);label.position.set(24,2);visual.addChild(sprite,label);this.layer.addChild(visual);this.visuals.set(item.id,visual);
  const draw={visual,sprite,label,token:0};this.draws.set(item.id,draw);this.paint(item,draw);
  this.renderList();
 }
 private refreshIcons(){if(!this.retrying)for(const [id,draw] of this.draws){const item=this.items.get(id);if(item)this.paint(item,draw);}this.renderList();}
 private paint(item:GroundItem,draw:GroundVisual){
  const state=this.iconAssets.state(item),generation=this.generation,epoch=this.iconAssets.epoch();
  draw.label.text=state.status==='ready'?item.name:`${item.name} · ${state.status==='missing'?'图标暂缺':state.status==='loading'?'图标加载中':'图标未加载'}`;
  if(state.status!=='ready'){draw.token++;draw.url=undefined;draw.epoch=undefined;draw.sprite.texture=Texture.EMPTY;return;}
  const frame=state.frame!,url=this.iconAssets.imageUrl(state.url!);
  if(draw.url===url&&draw.epoch===epoch)return;
  const token=++draw.token;draw.url=url;draw.epoch=epoch;
  const current=()=>generation===this.generation&&this.items.get(item.id)===item&&this.draws.get(item.id)===draw&&draw.token===token&&epoch===this.iconAssets.epoch();
  void Assets.load<Texture>(url).then(texture=>{
   if(!current())return;
   if(texture.width!==frame.width||texture.height!==frame.height){this.iconAssets.imageFailed(state.url!,epoch);return;}
   const resource=texture.source.resource;
   if(resource&&itemIconHasPixels(resource as CanvasImageSource,frame.width,frame.height)===false){this.iconAssets.imageEmpty(state.url!,epoch);return;}
   texture.source.scaleMode='nearest';draw.sprite.texture=texture;draw.sprite.anchor.set(.5);draw.sprite.position.set(24,16);
  }).catch(()=>{if(current())this.iconAssets.imageFailed(state.url!,epoch);});
 }
 private renderList(){
  if(!this.list)return;this.list.replaceChildren();
  if(!this.items.size){this.list.textContent='地面没有物品';return;}
  for(const item of this.items.values()){
   const button=document.createElement('button');button.type='button';button.dataset.groundItemId=String(item.id);button.textContent=`${item.name} · ${item.x},${item.y} · 拾取`;button.onclick=()=>this.requestPickup(item);
   const state=this.iconAssets.state(item);button.dataset.iconState=state.status;
   if(state.status==='failed'){
    const retry=document.createElement('span');retry.textContent='图标重试';retry.setAttribute('role','button');retry.tabIndex=0;
    const run=(event:Event)=>{event.preventDefault();event.stopPropagation();void this.retryIcons();};retry.onclick=run;retry.onkeydown=event=>{if(event.key==='Enter'||event.key===' ')run(event);};button.append(retry);
   }else if(state.status==='missing'){const missing=document.createElement('span');missing.textContent=' · 图标暂缺';button.append(missing);}
   this.list.append(button);
  }
 }
}
