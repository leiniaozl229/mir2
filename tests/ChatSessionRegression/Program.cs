using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Text.Json;
using Mir2.WebGateway;

static void Check(bool value,string message){if(!value)throw new Exception("FAIL: "+message);}
static string? Type(JsonElement value)=>value.GetProperty("type").GetString();
await using(var fixture=await Fixture.Create()){
 Task run=fixture.Run();await fixture.Socket.Wait(0,m=>Type(m)=="connected");
 foreach(var (id,text) in new[]{(1L,"!bad local prefix"),(2L,new string('中',91))}){
  int at=fixture.Socket.Count;fixture.Socket.Input(new{type="say",channel="local",text,chatId=id});
  var error=await fixture.Socket.Wait(at,m=>Type(m)=="error");
  Check(error.GetProperty("chatId").GetInt64()==id&&error.GetProperty("commandType").GetString()=="say","actual Run catch loses exact failed chat identity");
  Check(!fixture.Get<bool>("pendingAttack")&&fixture.Get<object?>("pendingActionId") is null,"rejected say occupied a world action slot");
 }
 Console.WriteLine("PASS real GatewaySession.Run rejects local prefix and 182-byte GBK input with corresponding chatId and no world action slot");
 int start=fixture.Socket.Count;
 fixture.Socket.Input(new{type="say",channel="local",text="!A",chatId=11});fixture.Socket.Input(new{type="say",channel="local",text="!B",chatId=12});
 await Fixture.Until(()=>fixture.Socket.Since(start).Count(m=>Type(m)=="error")==2);
 Check(fixture.Socket.Since(start).Where(m=>Type(m)=="error").Select(m=>m.GetProperty("chatId").GetInt64()).SequenceEqual(new long[]{11,12}),"queued rejects replaced original chat identity");
 Console.WriteLine("PASS queued A/B rejects retain independent native-free Web request identity");
 foreach(object? id in new object?[]{null,0,-1,1.5,"5",true,9007199254740992L}){
  int at=fixture.Socket.Count;fixture.Socket.Input(new{type="say",channel="raw",text="@probe",chatId=id});
  var error=await fixture.Socket.Wait(at,m=>Type(m)=="error");Check(error.GetProperty("chatId").ValueKind==JsonValueKind.Null,"invalid request identity was broadcast as a fake chat ID");
 }
 int missing=fixture.Socket.Count;fixture.Socket.Input(new{type="say",channel="local",text="!old client"});
 Check((await fixture.Socket.Wait(missing,m=>Type(m)=="error")).GetProperty("chatId").ValueKind==JsonValueKind.Null,"absent chatId invented an identity");
 Console.WriteLine("PASS missing/null/nonpositive/fractional/string/bool/unsafe chat IDs cannot be reflected as fake identities");
 int wrong=fixture.Socket.Count;fixture.Socket.Input(new{type="unavailable",chatId=23});
 Check((await fixture.Socket.Wait(wrong,m=>Type(m)=="error")).GetProperty("chatId").ValueKind==JsonValueKind.Null,"non-say command acquired a chat identity");
 Console.WriteLine("PASS unknown command cannot acquire another domain's chat identity");
 int success=fixture.Socket.Count;fixture.Socket.Input(new{type="say",channel="raw",text="@probe",chatId=9007199254740991L});
 var native=await fixture.ReadNative();Check(native.Id==3030&&native.Text=="@probe","valid raw chat changed original CM_SAY payload");
 await Task.Delay(30);Check(!fixture.Socket.Since(success).Any(m=>Type(m)is "chatResult" or "actionResult" or "error"),"valid send fabricated a native chat delivery ACK");
 Console.WriteLine("PASS maximum safe chatId sends original raw CM3030 and emits no fabricated delivery acknowledgement");
}
sealed class Fixture : IAsyncDisposable
{
    public CaptureSocket Socket { get; } = new();
    public GatewaySession Session { get; }
    public Dictionary<int, InventoryItem> Equipment => Get<Dictionary<int, InventoryItem>>("equipment");

    private readonly CancellationTokenSource lifetime = new();
    private TcpClient peer = null!;
    private Task reader = Task.CompletedTask;
    private Fixture() { Session = new(Socket); Set("phase", "world"); Set("mapGeneration", 3);
        Set("confirmedPosition", ((ushort)12,(ushort)18)); Set("playerActorId", 1);
        Get<Dictionary<int,(ushort x,ushort y,bool dead,uint? feature)>>("entities")[1] = (12,18,false,0); Equipment[1] = Tool();
        Equipment[1] = InventoryProjection.Parse(new byte[124]);
        Get<Dictionary<int,(ushort x,ushort y,bool dead,uint? feature)>>("entities")[2] = (14,18,false,0);
        foreach(ushort id in new ushort[]{12,25,26}){byte[] body=new byte[84];BinaryPrimitives.WriteUInt16LittleEndian(body.AsSpan(8),id);Get<Dictionary<ushort,MagicSkill>>("skills")[id]=MagicProjection.Parse(body);}
    }
    private static InventoryItem Tool() {
        byte[] b=new byte[124];b[15]=6;b[16]=19;BinaryPrimitives.WriteInt32LittleEndian(b.AsSpan(100),777);BinaryPrimitives.WriteUInt16LittleEndian(b.AsSpan(104),9000);
        return InventoryProjection.Parse(b);
    }
    public static async Task<Fixture> Create() {
        var f=new Fixture(); var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();
        try {
            var pending=listener.AcceptTcpClientAsync();
            await f.Get<LegacyConnection>("game").Connect("127.0.0.1",((IPEndPoint)listener.LocalEndpoint).Port,f.lifetime.Token);
            f.peer=await pending;f.peer.NoDelay=true;
            f.reader=(Task)f.Call("ReadGame",f.lifetime)!;return f;
        } finally { listener.Stop(); }
    }
    public T Get<T>(string name) => (T)typeof(GatewaySession).GetField(name,BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(Session)!;
    public void Set(string name,object? value) => typeof(GatewaySession).GetField(name,BindingFlags.Instance|BindingFlags.NonPublic)!.SetValue(Session,value);
    public object? Call(string name,params object?[] args) {
        try { return typeof(GatewaySession).GetMethod(name,BindingFlags.Instance|BindingFlags.NonPublic)!.Invoke(Session,args); }
        catch(TargetInvocationException e) when(e.InnerException is not null) { ExceptionDispatchInfo.Capture(e.InnerException).Throw();throw; }
    }
    public Task Run() => Session.Run(lifetime.Token);
    public Task Attack(JsonElement command) => (Task)Call("Attack",command,lifetime.Token)!;
    public Task Cast(JsonElement command) => (Task)Call("CastMagic",command,lifetime.Token)!;
    public async Task<LegacyPacket> ReadNative() {
        using var timeout=new CancellationTokenSource(2000);var bytes=new List<byte>();byte[] b=new byte[1];
        while(true) { Check(await peer.GetStream().ReadAsync(b,timeout.Token)==1,"native test peer disconnected");bytes.Add(b[0]);if(b[0]=='!')break; }
        Check(bytes[0]=='#',"bad native framing");return LegacyPacket.Parse(bytes.Skip(2).SkipLast(1).ToArray());
    }
    public Task Reply(string status) => Send(Encoding.ASCII.GetBytes(status));
    public Task Reply(LegacyPacket packet) => Send([..LegacyCodec.Header((ushort)packet.Id,packet.Recog,packet.Param,packet.Tag,packet.Series),..packet.EncodedBody]);
    private async Task Send(byte[] payload) => await peer.GetStream().WriteAsync(new byte[]{(byte)'#'}.Concat(payload).Append((byte)'!').ToArray(),lifetime.Token);
    public static async Task Until(Func<bool> test,int ms=2000) {
        long end=Environment.TickCount64+ms;while(!test()) { if(Environment.TickCount64>end)throw new Exception("production fixture event timeout");await Task.Delay(10); }
    }
    private static void Check(bool test,string message) { if(!test)throw new Exception(message); }
    public async ValueTask DisposeAsync() {
        lifetime.Cancel();peer.Dispose();Session.Dispose();
        try { await reader; } catch(Exception e) when(e is OperationCanceledException or IOException or ObjectDisposedException) {}
        lifetime.Dispose();
    }
}

sealed class CaptureSocket : WebSocket
{
    private readonly List<JsonElement> messages=[];
    private readonly System.Threading.Channels.Channel<byte[]> requests=System.Threading.Channels.Channel.CreateUnbounded<byte[]>();
    public void Input(object command)=>requests.Writer.TryWrite(JsonSerializer.SerializeToUtf8Bytes(command));
    private WebSocketState state=WebSocketState.Open;
    public int Count { get { lock(messages)return messages.Count; } }
    public JsonElement[] Since(int at) { lock(messages)return messages.Skip(at).ToArray(); }
    public async Task<JsonElement> Wait(int at,Func<JsonElement,bool> predicate,int ms=2000) {
        await Fixture.Until(()=>Since(at).Any(predicate),ms);return Since(at).First(predicate);
    }
    public override WebSocketCloseStatus? CloseStatus=>null;
    public override string? CloseStatusDescription=>null;
    public override WebSocketState State=>state;
    public override string? SubProtocol=>null;
    public override void Abort(){state=WebSocketState.Aborted;}
    public override Task CloseAsync(WebSocketCloseStatus closeStatus,string? statusDescription,CancellationToken cancellationToken){state=WebSocketState.Closed;return Task.CompletedTask;}
    public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus,string? statusDescription,CancellationToken cancellationToken){state=WebSocketState.CloseSent;return Task.CompletedTask;}
    public override void Dispose(){state=WebSocketState.Closed;}
    public override async Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer,CancellationToken cancellationToken){
        byte[] bytes=await requests.Reader.ReadAsync(cancellationToken);bytes.AsSpan().CopyTo(buffer.AsSpan());return new(bytes.Length,WebSocketMessageType.Text,true);
    }
    public override Task SendAsync(ArraySegment<byte> buffer,WebSocketMessageType messageType,bool endOfMessage,CancellationToken cancellationToken) {
        using var document=JsonDocument.Parse(buffer);lock(messages)messages.Add(document.RootElement.GetProperty("message").Clone());return Task.CompletedTask;
    }
}
