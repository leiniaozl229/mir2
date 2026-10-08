import type {Container,Filter} from 'pixi.js';
import {createActorPaletteFilter} from './actor-palette';

/** PlayScn.DrawScene maps the completed world surface through the default
 * ceGrayScale on self death. HUD/windows are outside this canvas surface.
 * Indexed framebuffer blend quantization and configurable death colors
 * still require target-version evidence. */
export class WorldTone {
 private gray:Filter|undefined;
 private dead=false;
 private darkness:number|undefined;
 private destroyed=false;
 constructor(private surface:Container){}
 setDarkLevel(level:number){this.darkness=Number.isInteger(level)&&level>=0&&level<=65535?level:undefined;}
 debugState(){return {dead:this.dead,darkLevel:this.darkness,fogApplied:false};}
 setDead(dead:boolean){
  if(this.destroyed||this.dead===dead)return;
  this.dead=dead;
  if(dead){
   this.gray??=createActorPaletteFilter('gray');
   this.surface.filters=[...(this.surface.filters??[]).filter(filter=>filter!==this.gray),this.gray];
  }else this.detach();
 }
 clear(){this.dead=false;this.darkness=undefined;this.detach();}
 private detach(){if(this.gray)this.surface.filters=(this.surface.filters??[]).filter(filter=>filter!==this.gray);}
 destroy(){if(this.destroyed)return;this.clear();this.gray?.destroy();this.gray=undefined;this.destroyed=true;}
}
