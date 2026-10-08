export type PasswordChangeFields={account:string;oldPassword:string;newPassword:string;repeatPassword:string};
export type PasswordChangeField=keyof PasswordChangeFields;
export type PasswordChangeOutcome={requestId:number;accepted:boolean|null;status:string;reason:number|null;requestSent:boolean|null};
type Options={connect:()=>WebSocket;onPending:(pending:boolean)=>void;onResult:(result:PasswordChangeOutcome)=>void;onValidation:(message:string,field:PasswordChangeField)=>void;timeoutMs?:number};

/** Character limits are from the edit controls; strict GBK byte limits are enforced by the gateway. */
export function validatePasswordChange(fields:PasswordChangeFields):{message:string;field:PasswordChangeField}|undefined{
 if(!/^[A-Za-z0-9]{4,10}$/.test(fields.account))return {message:'账号需为 4–10 位字母或数字。',field:'account'};
 for(const field of ['oldPassword','newPassword'] as const){
  const value=fields[field],minimum=field==='newPassword'?3:1;
  if(value.length<minimum||value.length>10||/[\x00-\x1f\x7f-\x9f/]/.test(value))return {message:field==='newPassword'?'新密码需为 3–10 个字符，不能包含斜杠或控制字符；编码后最多 10 字节。':'请填写原密码，不能包含斜杠或控制字符；编码后最多 10 字节。',field};
 }
 if(fields.newPassword!==fields.repeatPassword)return {message:'两次输入的新密码不一致。',field:'repeatPassword'};
}

export function passwordChangeMessage(result:PasswordChangeOutcome):string{
 if(result.accepted===true)return '密码修改成功，请使用新密码登录。';
 if(result.accepted===null)return result.status==='cancelled'?'已取消等待，修改结果请通过重新登录确认。':'未收到明确的修改结果，请通过重新登录确认。';
 if(result.status==='rejected')return result.reason===-1?'原密码不正确。':result.reason===-2?'账号暂时锁定，请稍后再试。':'服务器拒绝修改密码，请检查账号后再试。';
 if(result.status==='invalid')return '账号或密码不符合要求，密码必须能够使用 GBK 编码且最多 10 字节。';
 if(result.status==='throttled'||result.status==='busy')return '操作过于频繁，请稍后再试。';
 if(result.status==='cancelled')return '已取消等待，尚未提交修改请求。';
 return '修改请求未送达，请稍后再试。';
}

function resultOf(message:Record<string,unknown>,id:number):PasswordChangeOutcome|undefined{
 if(message.type!=='changePasswordResult'||message.requestId!==id||typeof message.requestSent!=='boolean')return;
 const {accepted,status,reason,requestSent}=message;
 if(typeof status!=='string')return;
 const rejection=['unavailable','busy','throttled','invalid'].includes(status);
 const uncertain=['timeout','disconnected','protocol_error'].includes(status);
 if(status==='succeeded'&&accepted===true&&reason===0&&requestSent===true||
    status==='rejected'&&accepted===false&&typeof reason==='number'&&Number.isSafeInteger(reason)&&requestSent===true||
    rejection&&accepted===false&&reason===null&&requestSent===false||
    uncertain&&reason===null&&(requestSent?accepted===null:accepted===false))
  return {requestId:id,accepted:accepted as boolean|null,status,reason:reason as number|null,requestSent};
}

/** Owns a pre-login socket; never borrows the world connection or stores credentials. */
export class PasswordChangeController{
 private nextId=0;
 private finishCurrent:((status:string,deliver:boolean)=>void)|undefined;
 private disposed=false;
 constructor(private readonly options:Options){}
 isPending(){return this.finishCurrent!==undefined;}
 submit(fields:PasswordChangeFields):boolean{
  if(this.disposed||this.isPending())return false;
  const invalid=validatePasswordChange(fields);if(invalid){this.options.onValidation(invalid.message,invalid.field);return false;}
  if(this.nextId>=Number.MAX_SAFE_INTEGER){this.options.onValidation('请刷新页面后再试。','account');return false;}
  const id=++this.nextId;
  let socket:WebSocket;
  try{socket=this.options.connect();}catch{this.options.onResult({requestId:id,accepted:false,status:'unavailable',reason:null,requestSent:false});return false;}
  let submitted=false,settled=false,lastSequence=0;
  // Keep the captured credential values only until the initial capability handshake.
  let command:string|undefined=JSON.stringify({type:'changePassword',requestId:id,account:fields.account,oldPassword:fields.oldPassword,newPassword:fields.newPassword});
  let timer:ReturnType<typeof setTimeout>|undefined;
  const settle=(result:PasswordChangeOutcome,deliver=true)=>{
   if(settled)return;settled=true;command=undefined;
   if(timer!==undefined)clearTimeout(timer);
   socket.removeEventListener('message',message);socket.removeEventListener('close',closed);socket.removeEventListener('error',failed);
   this.finishCurrent=undefined;this.options.onPending(false);
   try{socket.close();}catch{/* Already closed. */}
   if(deliver)this.options.onResult(result);
  };
  const local=(status:string,deliver=true)=>settle({requestId:id,accepted:submitted?null:false,status,reason:null,requestSent:submitted?null:false},deliver);
  const message=(event:MessageEvent)=>{
   if(settled||typeof event.data!=='string')return;
   let value:unknown;try{value=JSON.parse(event.data);}catch{return;}
   if(!value||typeof value!=='object'||Array.isArray(value))return;
   const envelope=value as Record<string,unknown>;
   if(!Number.isSafeInteger(envelope.sequence)||(envelope.sequence as number)<=lastSequence||envelope.mapGeneration!==0)return;
   const body=envelope.message;
   if(!body||typeof body!=='object'||Array.isArray(body))return;
   const data=body as Record<string,unknown>;lastSequence=envelope.sequence as number;
   if(data.type==='connected'&&!submitted){
    const features=data.features as Record<string,unknown>|undefined;
    if(features?.passwordChange!==true){local('unavailable');return;}
    // Once sent to the gateway, only its typed reply can prove whether CM2003 reached LoginGate.
    submitted=true;
    try{socket.send(command!);command=undefined;}catch{local('disconnected');}
    return;
   }
   const result=resultOf(data,id);if(result&&submitted)settle(result);
  };
  const closed=()=>local('disconnected'),failed=()=>local('disconnected');
  this.finishCurrent=local;
  socket.addEventListener('message',message);socket.addEventListener('close',closed);socket.addEventListener('error',failed);
  timer=setTimeout(()=>local('timeout'),this.options.timeoutMs??18000);
  this.options.onPending(true);return true;
 }
 cancel(){this.finishCurrent?.('cancelled',true);}
 destroy(){this.disposed=true;this.finishCurrent?.('cancelled',false);}
}
