import {createMapView} from './map-view';
import {OnlineActor} from './online-actors';
import './style.css';

const status=document.querySelector<HTMLOutputElement>('#status')!;
const reportElement=document.querySelector<HTMLElement>('#frame-budget-report')!;
const view=await createMapView(document.querySelector<HTMLElement>('#viewport')!,status);
await view.setCenter(296,624);
const params=new URLSearchParams(location.search);
const sampleMs=Number(params.get('ms')??8000);
const pressure=Math.max(0,Math.min(200,Number(params.get('pressure')??0)));
const extras:OnlineActor[]=[];
if(pressure){
 for(let index=0;index<pressure;index++){
  const x=296+(index%10)-4,y=624+Math.floor(index/10)-4;
  const actor=new OnlineActor({id:2000+index,x,y,direction:index%8,feature:11|(160<<16),name:'鸡',self:false,action:'standing'});
  actor.update({id:2000+index,x,y,direction:index%8,feature:11|(160<<16),name:'鸡',self:false,action:'standing'});
  view.depth.addChild(actor.container);
  extras.push(actor);
 }
 view.app.ticker.add(()=>{const now=performance.now();for(const actor of extras)actor.tick(now);});
}
status.textContent=`正在采样 ${sampleMs}ms${pressure?` · ${pressure} 个对象`:''}…`;
await new Promise(resolve=>setTimeout(resolve,sampleMs));
const snapshot=view.frameBudget.snapshot(800,600);
const report={
  ...snapshot,
  map:view.map,
  center:view.center,
  sampleMs,
  pressure,
  passed:snapshot.samples>=120 && snapshot.p95Ms<=33.4,
};
reportElement.textContent=JSON.stringify(report,null,2);
Object.assign(window,{__mir2FrameBudget:report});
status.textContent=`p95 ${snapshot.p95Ms}ms · 约 ${snapshot.fpsEstimate} FPS · 样本 ${snapshot.samples}${pressure?` · ${pressure} 对象`:''}`;
