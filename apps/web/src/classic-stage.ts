export const CLASSIC_STAGE={width:800,height:600} as const;

/** Keep the game surface on the original 800×600 coordinate system. */
export class ClassicStage {
 private readonly resizeHandler=()=>this.resize();

 constructor(private readonly frame:HTMLElement,private readonly content:HTMLElement){
  frame.style.position='relative';
  frame.style.overflow='hidden';
  content.style.position='absolute';
  content.style.left='0';
  content.style.top='0';
  content.style.margin='0';
  content.style.transformOrigin='top left';
  window.addEventListener('resize',this.resizeHandler,{passive:true});
  this.resize();
 }

 dispose(){window.removeEventListener('resize',this.resizeHandler);}

 private resize(){
  const availableWidth=Math.max(1,Math.min(CLASSIC_STAGE.width,document.documentElement.clientWidth));
  const scale=availableWidth/CLASSIC_STAGE.width;
  this.frame.style.width=`${availableWidth}px`;
  this.frame.style.height=`${CLASSIC_STAGE.height*scale}px`;
  this.content.style.width=`${CLASSIC_STAGE.width}px`;
  this.content.style.height=`${CLASSIC_STAGE.height}px`;
  this.content.style.transform=`scale(${scale})`;
  this.frame.style.setProperty('--classic-scale',String(scale));
 }
}
