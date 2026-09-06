import type {Ticker} from 'pixi.js';

export type FrameBudgetSnapshot={
  canvas:{width:number;height:number};
  samples:number;
  meanMs:number;
  p50Ms:number;
  p95Ms:number;
  p99Ms:number;
  fpsEstimate:number;
  targetFps:number;
  targetFrameMs:number;
};

export class FrameBudget {
 private readonly samples:number[]=[];
 constructor(private readonly limit=720){}
 attach(ticker:Ticker){
  ticker.add(()=>{
   const delta=ticker.deltaMS;
   if(!Number.isFinite(delta)||delta<=0||delta>250)return;
   this.samples.push(delta);
   if(this.samples.length>this.limit)this.samples.shift();
  });
 }
 snapshot(width=800,height=600):FrameBudgetSnapshot{
  const sorted=[...this.samples].sort((a,b)=>a-b);
  const at=(percentile:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.floor(percentile/100*(sorted.length-1)))]:0;
  const mean=sorted.length?sorted.reduce((sum,value)=>sum+value,0)/sorted.length:0;
  const p95=at(95);
  return {
   canvas:{width,height},
   samples:sorted.length,
   meanMs:round(mean),
   p50Ms:round(at(50)),
   p95Ms:round(p95),
   p99Ms:round(at(99)),
   fpsEstimate:p95>0?round(1000/p95):0,
   targetFps:60,
   targetFrameMs:16.67,
  };
 }
}

function round(value:number){return Math.round(value*100)/100;}
