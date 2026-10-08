export type LogoutMode='reselect'|'login';
export type LogoutRequest={type:'logout';mode:LogoutMode;logoutId:number;mapGeneration:number};
export type LogoutState={type:'logoutState';logoutId:number;mode:LogoutMode;state:'waiting'|'characters'|'login'|'failed';sessionGeneration:number;characters?:unknown[];requiresLogin?:boolean;message?:string};
export type LogoutOptions={
 available:()=>boolean;mapGeneration:()=>number;sessionGeneration:()=>number;
 confirm:(mode:LogoutMode)=>Promise<string>;send:(request:LogoutRequest)=>boolean;
 onWaiting:(request:LogoutRequest)=>void;onAccepted?:(request:LogoutRequest)=>void;onResult:(state:LogoutState)=>void;status:(text:string)=>void;
};

export class LogoutWaitingView {
 readonly element:HTMLDivElement;readonly text:HTMLElement;
 constructor(layer:HTMLElement){const doc=layer.ownerDocument;this.element=doc.createElement('div');this.element.className='logout-wait-overlay';this.element.hidden=true;this.element.setAttribute('role','status');this.element.setAttribute('aria-live','polite');this.element.tabIndex=-1;this.text=doc.createElement('p');this.element.append(this.text);layer.append(this.element);}
 show(text='正在退出，请等待服务器回应…'){this.text.textContent=text;this.element.hidden=false;this.element.focus();}
 hide(){this.element.hidden=true;}
 interceptKey(event:KeyboardEvent){if(this.element.hidden)return false;event.stopImmediatePropagation();if(!event.isComposing&&event.keyCode!==229)event.preventDefault();return true;}
 destroy(){this.element.remove();}
}

/** UI correlation only: a terminal reply is never a database-save acknowledgement. */
export class LogoutController {
 private serial=0;private epoch=0;private confirming=false;
 private pending:{request:LogoutRequest;generation:number;accepted:boolean}|undefined;
 constructor(private readonly options:LogoutOptions){}
 isBusy(){return this.confirming||Boolean(this.pending);}
 isWaiting(){return Boolean(this.pending);}
 isAccepted(){return this.pending?.accepted===true;}
 current(){return this.pending?{...this.pending.request}:undefined;}
 async request(mode:LogoutMode){
  if(this.isBusy())return false;
  if(!this.options.available()){this.options.status('当前连接尚不支持退出，请等待连接就绪。');return false;}
  const epoch=++this.epoch;this.confirming=true;let result:string;
  try{result=await this.options.confirm(mode);}catch{result='interrupted';}
  if(epoch!==this.epoch)return false;
  this.confirming=false;
  if(result!=='ok'||!this.options.available())return false;
  if(this.serial>=Number.MAX_SAFE_INTEGER){this.options.status('请重新打开页面后登录。');return false;}
  const request:LogoutRequest={type:'logout',mode,logoutId:++this.serial,mapGeneration:this.options.mapGeneration()};
  this.pending={request,generation:this.options.sessionGeneration(),accepted:false};
  let sent=false;try{sent=this.options.send(request);}catch{}
  if(!sent){this.pending=undefined;this.options.status('退出请求未发送，连接不可用。');return false;}
  this.options.onWaiting(request);return true;
 }
 handleState(value:unknown){
  if(!value||typeof value!=='object'||!this.pending)return false;
  const state=value as LogoutState,current=this.pending;
  if(state.type!=='logoutState'||state.logoutId!==current.request.logoutId||state.mode!==current.request.mode||!Number.isSafeInteger(state.sessionGeneration)||state.sessionGeneration<Math.max(current.generation,this.options.sessionGeneration()))return false;
  if(state.state==='waiting'){current.generation=state.sessionGeneration;if(!current.accepted){current.accepted=true;this.options.onAccepted?.(current.request);}return true;}
  if(!['characters','login','failed'].includes(state.state))return false;
  if(state.state==='characters'&&(state.mode!=='reselect'||!Array.isArray(state.characters)))return false;
  if(state.state==='login'&&state.mode!=='login')return false;
  this.pending=undefined;++this.epoch;this.options.onResult(state.state==='failed'?{...state,requiresLogin:true}:state);return true;
 }
 reject(value:{logoutId?:number;mode?:string;message?:string}){
  const current=this.pending;if(!current||current.accepted||value.logoutId!==current.request.logoutId||value.mode!==current.request.mode)return false;
  this.pending=undefined;++this.epoch;this.options.onResult({type:'logoutState',logoutId:current.request.logoutId,mode:current.request.mode,state:'failed',sessionGeneration:current.generation,requiresLogin:false,message:value.message??'退出请求被拒绝。'});return true;
 }
 interrupt(){++this.epoch;this.confirming=false;this.pending=undefined;}
 disconnected(){
  const current=this.pending;this.interrupt();
  if(current)this.options.onResult({type:'logoutState',logoutId:current.request.logoutId,mode:current.request.mode,state:'failed',sessionGeneration:current.generation,requiresLogin:true,message:'连接已断开，退出结果未确认，请重新登录。'});
  return Boolean(current);
 }
}
