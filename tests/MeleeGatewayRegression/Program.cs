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
static JsonElement Attack(long id,int direction=2,int generation=3)=>JsonSerializer.SerializeToElement(new{type="attack",actionId=id,direction,mapGeneration=generation});
static string? Type(JsonElement value)=>value.GetProperty("type").GetString();
static async Task Reject(Func<Task> callback){bool rejected=false;try{await callback();}catch(Exception e)when(e is InvalidOperationException or InvalidDataException){rejected=true;}Check(rejected,"invalid/busy input reached native stream");}
foreach(var (sm,kind,action) in new[]{(14,"normal","attack"),(15,"heavy","heavyAttack"),(16,"big","wideAttack"),(18,"power","attack"),(19,"thrusting","attack"),(24,"halfMoon","attack"),(8,"fire","attack")})
{
 var self=JsonSerializer.SerializeToElement(WorldProjection.Project(new(sm,1,12,18,0x202,[]),"",1,attackActionId:99));
 var other=JsonSerializer.SerializeToElement(WorldProjection.Project(new(sm,2,12,18,0x202,[]),"",1,attackActionId:99));
 Check(self.GetProperty("meleeKind").GetString()==kind&&self.GetProperty("action").GetString()==action&&self.GetProperty("legacyIdent").GetInt32()==sm,"actual server attack mapping incorrect");
 Check(self.GetProperty("self").GetBoolean()&&self.GetProperty("actionId").GetInt64()==99&&self.GetProperty("direction").GetInt32()==2,"self native identity/direction lost");
 Check(!other.GetProperty("self").GetBoolean()&&other.GetProperty("actionId").ValueKind==JsonValueKind.Null,"remote attack stole self action identity");
}
Console.WriteLine("PASS exact seven server SMs project melee kind/raw identity/self correlation; all four skill actions use ordinary body and heavy/big remain separate");

await using(var fixture=await Fixture.Create())
{
 var state=fixture.Get<MeleeSkills>("meleeSkills");fixture.Set("confirmedMana",100);state.Apply("+LNG");state.Apply("+WID");state.Apply("+PWR");state.Apply("+FIR");
 foreach(var expected in new[]{3025,3018,3024}){await fixture.Attack(Attack(expected));Check((await fixture.ReadNative()).Id==expected,"native input priority differs from original fire > power > halfmoon");await fixture.Reply("+GD/1");await Fixture.Until(()=>!fixture.Get<bool>("pendingAttack"));}
 state.Apply("+UWID");await fixture.Attack(Attack(400));Check((await fixture.ReadNative()).Id==3019,"enabled long target did not select thrusting");await fixture.Reply("+GD/2");await Fixture.Until(()=>!fixture.Get<bool>("pendingAttack"));
 state.Apply("+ULNG");await fixture.Attack(Attack(401));Check((await fixture.ReadNative()).Id==3014,"ordinary sword did not return to HIT");await fixture.Reply("+GD/3");await Fixture.Until(()=>!fixture.Get<bool>("pendingAttack"));
 Check(!fixture.Socket.Since(0).Any(m=>Type(m)=="entityAction"),"request/GOOD fabricated a sword light kind without a native SM");
 Console.WriteLine("PASS production native TCP input priority and one-shot fire/power consumption; neither selected CM nor GOOD synthesizes a melee effect");
}
foreach(var (magicId,status) in new[]{(12,"+LNG"),(25,"+WID"),(26,"+FIR")})
{
 await using var fixture=await Fixture.Create();int at=fixture.Socket.Count;
 await fixture.Cast(JsonSerializer.SerializeToElement(new{type="castMagic",magicId,actionId=500,mapGeneration=3}));Check((await fixture.ReadNative()).Id==3017,"production cast encoding missing");
 await fixture.Reply(status);await fixture.Socket.Wait(at,m=>Type(m)=="warriorSkill");
 Check(fixture.Get<object?>("pendingSpell") is not null&&!fixture.Socket.Since(at).Any(m=>Type(m)is "actionResult" or "spellResult"),"status released the spell native slot before its GOOD");
 await Reject(()=>fixture.Attack(Attack(501)));await fixture.Reply("+GD/100");
 var castResult=await fixture.Socket.Wait(at,m=>Type(m)=="actionResult");Check(castResult.GetProperty("actionId").GetInt64()==500&&castResult.GetProperty("kind").GetString()=="spell","cast GOOD was attributed to next attack");
 await fixture.Attack(Attack(501));await fixture.ReadNative();int attackAt=fixture.Socket.Count;
 await fixture.Reply(new LegacyPacket(19,1,12,18,2,[]));var swing=await fixture.Socket.Wait(attackAt,m=>Type(m)=="entityAction");
 Check(swing.GetProperty("actionId").GetInt64()==501&&fixture.Get<bool>("pendingAttack")&&!fixture.Socket.Since(attackAt).Any(m=>Type(m)=="actionResult"),"self SM prematurely completed the attack");
 await fixture.Reply("+GD/101");var result=await fixture.Socket.Wait(attackAt,m=>Type(m)=="actionResult");Check(result.GetProperty("actionId").GetInt64()==501,"actual attack ACK mismatch");
 await fixture.Reply("+GD/101");await fixture.Socket.Wait(attackAt,m=>Type(m)=="legacy"&&m.GetProperty("id").GetInt32()==-1);
 await Task.Delay(30);Check(fixture.Socket.Since(attackAt).Count(m=>Type(m)=="actionResult")==1,"duplicate GOOD completed attack twice");
}
Console.WriteLine("PASS production LNG/WID/FIR status retains spell slot until its own GOOD; next real self SM retains attack pending and one final ACK identity");

await using(var fixture=await Fixture.Create())
{
 fixture.Set("confirmedMana",7);fixture.Get<MeleeSkills>("meleeSkills").Apply("+FIR");int at=fixture.Socket.Count;
 await fixture.Attack(Attack(600));Check((await fixture.ReadNative()).Id==3025,"charged input missing");
 await fixture.Reply(new LegacyPacket(14,1,12,18,2,[]));var actual=await fixture.Socket.Wait(at,m=>Type(m)=="entityAction");
 Check(actual.GetProperty("meleeKind").GetString()=="normal"&&actual.GetProperty("actionId").GetInt64()==600,"native downgrade was replaced with requested fire effect");
 await fixture.Reply("+GD/1");await fixture.Socket.Wait(at,m=>Type(m)=="actionResult");
 Check(!fixture.Socket.Since(at).Any(m=>Type(m)=="entityAction"&&m.GetProperty("meleeKind").GetString()=="fire"),"GOOD introduced an invented fire kind");
}
Console.WriteLine("PASS production real self SM downgrade overrides requested fire; damage and cost are never invented by command/status/ACK");

await using(var fixture=await Fixture.Create())
{
 var state=fixture.Get<MeleeSkills>("meleeSkills");state.Apply("+PWR");await fixture.Attack(Attack(700));Check((await fixture.ReadNative()).Id==3018,"first power input missing");
 int at=fixture.Socket.Count;await fixture.Reply(new LegacyPacket(18,1,12,18,2,[]));await fixture.Reply("+PWR");await fixture.Reply("+GD/2");await fixture.Socket.Wait(at,m=>Type(m)=="actionResult");
 Check(state.PowerHit,"next server charge before current GOOD was discarded");await fixture.Attack(Attack(701));Check((await fixture.ReadNative()).Id==3018,"next actual charge was not preserved");
}
Console.WriteLine("PASS production next PWR notification before current GOOD survives snapshot and selects the following attack exactly once");

await using(var fixture=await Fixture.Create())
{
 var state=fixture.Get<MeleeSkills>("meleeSkills");state.Apply("+FIR");state.Apply("+PWR");fixture.Set("confirmedMana",100);
 fixture.Set("pendingPosition",((ushort)13,(ushort)18));await Reject(()=>fixture.Attack(Attack(800)));fixture.Set("pendingPosition",null);
 await Reject(()=>fixture.Attack(Attack(800,8)));await Reject(()=>fixture.Attack(Attack(800,generation:2)));
 fixture.Get<Dictionary<int,(ushort x,ushort y,bool dead,uint? feature)>>("entities")[1]=(12,18,true,0);await Reject(()=>fixture.Attack(Attack(800)));
 Check(state.FireHit&&state.PowerHit&&!fixture.Get<bool>("pendingAttack")&&!fixture.Socket.Since(0).Any(m=>Type(m)=="entityAction"),"invalid input consumed authoritative input flags or emitted action");
}
Console.WriteLine("PASS production busy/stale/invalid/dead attack input rejects before charge selection, native send or effect projection");

foreach(int interruption in new[]{32,633,634})
{
 await using var fixture=await Fixture.Create();int at=fixture.Socket.Count;await fixture.Attack(Attack(900));await fixture.ReadNative();
 await fixture.Reply(new LegacyPacket(interruption,1,12,18,2,interruption==634?LegacyCodec.Encode("0"u8):[]));
 var result=await fixture.Socket.Wait(at,m=>Type(m)=="actionResult");Check(!result.GetProperty("accepted").GetBoolean()&&result.GetProperty("actionId").GetInt64()==900,"interruption lost pending attack identity");
 await Reject(()=>fixture.Attack(Attack(901,generation:fixture.Get<int>("mapGeneration"))));Check(fixture.Get<bool>("pendingAttack"),"interruption discarded old native slot");
 await fixture.Reply("+GD/100");await Fixture.Until(()=>!fixture.Get<bool>("pendingAttack"));
 Check(fixture.Socket.Since(at).Count(m=>Type(m)=="actionResult")==1,"late old attack ACK completed another action or duplicated failure");
}
Console.WriteLine("PASS production death/map immediately fails old attack and drains its original GOOD without new-action or duplicate-result attribution");

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
    public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer,CancellationToken cancellationToken)=>throw new NotSupportedException();
    public override Task SendAsync(ArraySegment<byte> buffer,WebSocketMessageType messageType,bool endOfMessage,CancellationToken cancellationToken) {
        using var document=JsonDocument.Parse(buffer);lock(messages)messages.Add(document.RootElement.GetProperty("message").Clone());return Task.CompletedTask;
    }
}
