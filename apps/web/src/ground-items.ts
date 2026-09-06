import {Assets,Container,Sprite,Text,Texture} from 'pixi.js';
import {loadNationalUiLibrary} from './classic-ui';

export type GroundItem={id:number;x:number;y:number;looks:number;name:string};
type Frame={file:string;width:number;height:number};
type Library={frames:Record<string,Frame>};

export class GroundItems {
 private items=new Map<number,GroundItem>();
 private visuals=new Map<number,Container>();
 private generation=0;
 private library?:Promise<Library>;
 private nationalLibrary?:Promise<Library>;
 constructor(private layer:Container,private pickup:(item:GroundItem)=>void,private list?:HTMLElement){this.renderList();}
 clear(){this.generation++;for(const visual of this.visuals.values())visual.destroy({children:true});this.visuals.clear();this.items.clear();this.renderList();}
 at(x:number,y:number){return [...this.items.values()].find(item=>item.x===x&&item.y===y);}
 get(id:number){return this.items.get(id);}
 remove(id:number){this.items.delete(id);this.visuals.get(id)?.destroy({children:true});this.visuals.delete(id);this.renderList();}
 add(item:GroundItem){
  this.remove(item.id);this.items.set(item.id,item);
  const visual=new Container();visual.position.set(item.x*48,item.y*32);visual.zIndex=item.y*700+item.x+.25;visual.eventMode='static';visual.cursor='url("/ui/Cursors/Cursor_Default.CUR") 0 0, pointer';
  const sprite=new Sprite(Texture.EMPTY),label=new Text({text:item.name,style:{fontFamily:'SimSun, Songti SC, serif',fontSize:12,fill:0xffe085,stroke:{color:0x000000,width:3}}});
  label.anchor.set(.5,1);label.position.set(24,2);visual.addChild(sprite,label);this.layer.addChild(visual);this.visuals.set(item.id,visual);
  visual.on('pointertap',event=>{event.stopPropagation();this.pickup(item);});
  const generation=this.generation;
  void this.loadNationalLibrary().catch(()=>undefined).then(async national=>{
   const fallback=await this.loadLibrary();
   const frame=national?.frames[item.looks]??fallback.frames[item.looks];
   if(!frame||generation!==this.generation||this.items.get(item.id)!==item)return;
   const texture=await Assets.load<Texture>(national?.frames[item.looks]?`/ui-national/dnitems/${frame.file}`:`/items/DnItems/${frame.file}`);texture.source.scaleMode='nearest';
   if(generation!==this.generation||this.items.get(item.id)!==item)return;
   sprite.texture=texture;sprite.anchor.set(.5);sprite.position.set(24,16);
  }).catch(()=>{if(this.items.get(item.id)===item)label.text=`${item.name} · 地面图待校准`;});
  this.renderList();
 }
 private renderList(){
  if(!this.list)return;this.list.replaceChildren();
  if(!this.items.size){this.list.textContent='地面没有物品';return;}
  for(const item of this.items.values()){
   const button=document.createElement('button');button.type='button';button.dataset.groundItemId=String(item.id);button.textContent=`${item.name} · ${item.x},${item.y} · 拾取`;button.onclick=()=>this.pickup(item);this.list.append(button);
  }
 }
 private loadLibrary(){
  if(!this.library)this.library=fetch('/items/DnItems/library.json').then(async response=>{
   if(!response.ok)throw new Error('缺少地面物品素材');
   return response.json() as Promise<Library>;
  }).catch(error=>{this.library=undefined;throw error;});
  return this.library;
 }
 private loadNationalLibrary(){
  if(!this.nationalLibrary)this.nationalLibrary=loadNationalUiLibrary('dnitems').catch(error=>{this.nationalLibrary=undefined;throw error;});
  return this.nationalLibrary;
 }
}
