export const CLASSIC_STAGE={width:800,height:600} as const;

export function classicScaleForViewport(width:number,height:number){
 const availableWidth=Math.max(1,Math.min(CLASSIC_STAGE.width,width));
 const availableHeight=Math.max(1,Math.min(CLASSIC_STAGE.height,height));
 return Math.round(Math.min(availableWidth/CLASSIC_STAGE.width,availableHeight/CLASSIC_STAGE.height)*1000)/1000;
}

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
  const availableWidth=Math.min(window.innerWidth,document.documentElement.clientWidth||CLASSIC_STAGE.width);
  const availableHeight=Math.min(window.innerHeight,document.documentElement.clientHeight||CLASSIC_STAGE.height);
  const scale=classicScaleForViewport(availableWidth,availableHeight);
  this.frame.style.width=`${CLASSIC_STAGE.width*scale}px`;
  this.frame.style.height=`${CLASSIC_STAGE.height*scale}px`;
  this.content.style.width=`${CLASSIC_STAGE.width}px`;
  this.content.style.height=`${CLASSIC_STAGE.height}px`;
  this.content.style.transform=`scale(${scale})`;
  this.frame.style.setProperty('--classic-scale',String(scale));
 }
}
