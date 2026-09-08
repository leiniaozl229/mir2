export type AgentEvent={at:number;type:string;data:Record<string,unknown>};
export type AgentDebugApi={version:1;snapshot:()=>unknown;events:()=>AgentEvent[];clear:()=>void};

export function agentObservationEnabled(href:string){
 return new URL(href).searchParams.get('agent')==='1';
}

export class AgentObserver{
 private timeline:AgentEvent[]=[];
 constructor(readonly enabled:boolean,private clock=()=>performance.now(),private limit=2000){}
 event(type:string,data:Record<string,unknown>={}){
  if(!this.enabled)return;
  this.timeline.push({at:this.clock(),type,data});
  if(this.timeline.length>this.limit)this.timeline.splice(0,this.timeline.length-this.limit);
 }
 attach(target:{__mir2Agent?:AgentDebugApi},snapshot:()=>unknown){
  if(!this.enabled)return;
  target.__mir2Agent={version:1,snapshot,events:()=>structuredClone(this.timeline),clear:()=>{this.timeline=[];}};
  this.event('observer-ready');
 }
}
