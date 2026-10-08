using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Text.Json;
using Mir2.WebGateway;

static void Check(bool value, string message) { if (!value) throw new Exception(message); }
static JsonElement Command(long id, int direction = 2, int generation = 3)
    => JsonSerializer.SerializeToElement(new { type = "mine", actionId = id, direction, mapGeneration = generation });
static InventoryItem Tool(ushort durability = 9000)
{
    byte[] body = new byte[124]; body[15] = 6; body[16] = 19;
    BinaryPrimitives.WriteInt32LittleEndian(body.AsSpan(100), 777);
    BinaryPrimitives.WriteUInt16LittleEndian(body.AsSpan(104), durability);
    return InventoryProjection.Parse(body);
}
static async Task Reject(Fixture fixture, JsonElement command)
{
    bool rejected = false;
    try { await fixture.Mine(command); }
    catch (Exception error) when (error is InvalidOperationException or InvalidDataException) { rejected = true; }
    Check(rejected, "invalid/busy mining was forwarded");
}

Check(LegacyPacket.Parse("=DIG"u8.ToArray()).Status == "=DIG", "raw DIG was treated as an encoded header");
foreach (var frame in new[] { "=D", "=DIG/ore", "DIG" })
{
    bool rejected = false; try { LegacyPacket.Parse(Encoding.ASCII.GetBytes(frame)); }
    catch (InvalidDataException) { rejected = true; }
    Check(rejected, "malformed short notification was accepted");
}
var remote = JsonSerializer.SerializeToElement(WorldProjection.Project(new(15, 99, 12, 18, 7, LegacyCodec.Encode("1"u8)), ""));
Check(remote.GetProperty("digFragment").GetBoolean(), "native remote fragment flag was dropped");
var ordinary = JsonSerializer.SerializeToElement(WorldProjection.Project(new(15, 99, 12, 18, 7, []), ""));
Check(!ordinary.GetProperty("digFragment").GetBoolean(), "ordinary heavy attack became a mining fragment");
Console.WriteLine("PASS exact native short DIG parsing and remote heavy-hit fragment projection");
var slow = JsonSerializer.SerializeToElement(CharacterProjection.Project(new(657, 1, 0, 0, 65531, [])));
Check(slow.GetProperty("hitSpeed").GetInt32() == -5, "native signed ShortInt speed was interpreted as a huge bonus");
Console.WriteLine("PASS original signed hit speed preserves slow equipment cadence");

await using (var fixture = await Fixture.Create())
{
    foreach (int direction in Enumerable.Range(0, 8))
    {
        long id = 100 + direction; int at = fixture.Socket.Count;
        await fixture.Mine(Command(id, direction));
        var turn = await fixture.ReadNative();
        Check(turn.Id == 3010 && turn.Tag == direction && turn.Recog == (12 | 18 << 16), "production TURN encoding lost direction or confirmed position");
        fixture.NativeFacing = turn.Tag; // The native mining branch reads old Dir.
        await fixture.Reply("+GD/100");
        var swing = await fixture.ReadNative();
        Check(swing.Id == 3015 && swing.Tag == fixture.NativeFacing && swing.Recog == turn.Recog, "production swing preceded its actual TURN confirmation");
        await fixture.Socket.Wait(at, m => m.GetProperty("type").GetString() == "miningProgress");
        Check(!fixture.Socket.Since(at).Any(m => m.GetProperty("type").GetString() == "actionResult"), "TURN ACK completed mining prematurely");
        await Reject(fixture, Command(id + 1000));
        Check(fixture.Get<bool>("pendingAttack"), "TURN's ACK freed the shared native slot");
        if (direction == 2)
        {
            await fixture.Reply("=DIG");
            var fragment = await fixture.Socket.Wait(at, m => m.GetProperty("type").GetString() == "miningStrike");
            Check(fragment.GetProperty("actionId").GetInt64() == id && fragment.GetProperty("direction").GetInt32() == direction, "DIG lost transaction identity");
            Check(!fixture.Socket.Since(at).Any(m => m.GetProperty("type").GetString() == "itemAdded"), "DIG fabricated an ore instance");
        }
        await fixture.Reply("+GD/101");
        var result = await fixture.Socket.Wait(at, m => m.GetProperty("type").GetString() == "actionResult");
        Check(result.GetProperty("kind").GetString() == "mine" && result.GetProperty("actionId").GetInt64() == id
            && result.GetProperty("accepted").GetBoolean() && result.GetProperty("mapGeneration").GetInt32() == 3, "actual swing ACK was mismatched");
    }
    Console.WriteLine("PASS production TCP TURN -> own ACK -> HEAVYHIT in all eight directions; no early result, busy reuse or ore fabrication");
    fixture.Set("pendingAttack", true); await Reject(fixture, Command(500)); fixture.Set("pendingAttack", false);
    fixture.Set("pendingPosition", ((ushort)13, (ushort)18)); await Reject(fixture, Command(500)); fixture.Set("pendingPosition", null);
    fixture.Set("pendingSpell", ((ushort)1, "spell")); await Reject(fixture, Command(500)); fixture.Set("pendingSpell", null);
    fixture.Equipment[1] = Tool(0); await Reject(fixture, Command(500)); fixture.Equipment[1] = Tool();
    foreach (var value in new object[] {
        new { type="mine",actionId=500,direction=8,mapGeneration=3 },
        new { type="mine",actionId=500,direction=2,mapGeneration=2 },
        new { type="mine",actionId=0,direction=2,mapGeneration=3 },
        new { type="mine",direction=2,mapGeneration=3 },
        new { type="mine",actionId=500,direction=2,mapGeneration=3,x=99 },
        new { type="mine",actionId=500,direction=2,mapGeneration=3,ore="gold" } })
        await Reject(fixture, JsonSerializer.SerializeToElement(value));
    Console.WriteLine("PASS production busy attack/move/spell, stale map, invalid identity/direction, broken tool and client reward/coordinate rejection");
    int itemAt = fixture.Socket.Count; byte[] ore = new byte[124]; ore[15] = 43;
    BinaryPrimitives.WriteInt32LittleEndian(ore.AsSpan(100), 90001);
    BinaryPrimitives.WriteUInt16LittleEndian(ore.AsSpan(104), 4500);
    await fixture.Reply(new LegacyPacket(200, 0, 0, 0, 0, LegacyCodec.Encode(ore)));
    var added = await fixture.Socket.Wait(itemAt, m => m.GetProperty("type").GetString() == "itemAdded");
    Check(added.GetProperty("item").GetProperty("makeIndex").GetInt32() == 90001
        && added.GetProperty("item").GetProperty("durability").GetInt32() == 4500
        && fixture.Get<Dictionary<int, InventoryItem>>("inventory")[90001].stdMode == 43, "real ore packet was not retained");
    Console.WriteLine("PASS production SM200 exclusively establishes actual ore identity, raw purity and authoritative inventory");
}

foreach (bool moved in new[] { false, true })
{
    await using var fixture = await Fixture.Create(); int at = fixture.Socket.Count;
    await fixture.Mine(Command(700)); await fixture.ReadNative();
    if (moved) await fixture.Reply(new LegacyPacket(6, 1, 11, 18, 6, []));
    else fixture.Equipment[1] = Tool(0);
    await fixture.Reply("+GD/100");
    var result = await fixture.Socket.Wait(at, m => m.GetProperty("type").GetString() == "actionResult");
    Check(!result.GetProperty("accepted").GetBoolean() && fixture.Get<MiningRequest?>("pendingMining") is null, "changed position/tool swung after old turn");
    Check(!fixture.Socket.Since(at).Any(m => m.GetProperty("type").GetString() == "miningProgress"), "interrupted turn forwarded HEAVYHIT");
}
Console.WriteLine("PASS production forced movement or broken weapon during TURN prevents obsolete HEAVYHIT after ACK");

foreach (int interruption in new[] { 32, 633, 634 })
{
    await using var fixture = await Fixture.Create(); int at = fixture.Socket.Count;
    await fixture.Mine(Command(750)); await fixture.ReadNative();
    await fixture.Reply(new LegacyPacket(interruption, 1, 12, 18, 4,
        interruption == 634 ? LegacyCodec.Encode("D401"u8) : []));
    var rejected = await fixture.Socket.Wait(at, m => m.GetProperty("type").GetString() == "actionResult");
    Check(!rejected.GetProperty("accepted").GetBoolean() && rejected.GetProperty("reason").GetInt32() == interruption
        && rejected.GetProperty("mapGeneration").GetInt32() == 3, "death/map interruption lost old mining identity");
    Check(fixture.Get<bool>("pendingAttack"), "death/map discarded the unconsumed native TURN slot");
    await Reject(fixture, Command(751, generation:fixture.Get<int>("mapGeneration")));
    await fixture.Reply("+GD/100");
    await Fixture.Until(() => !fixture.Get<bool>("pendingAttack"));
    Check(!fixture.Socket.Since(at).Any(m => m.GetProperty("type").GetString() == "miningProgress")
        && fixture.Socket.Since(at).Count(m => m.GetProperty("type").GetString() == "actionResult") == 1,
        "late interrupted TURN ACK swung, completed a new action, or duplicated its rejection");
}
Console.WriteLine("PASS production death/clear-map/new-map immediately reject old mining and drain late TURN ACK before any new action");

await using (var fixture = await Fixture.Create())
{
    int at = fixture.Socket.Count; await fixture.Mine(Command(800)); await fixture.ReadNative();
    await fixture.Reply(new LegacyPacket(28, 1, 12, 18, 4, []));
    var result = await fixture.Socket.Wait(at, m => m.GetProperty("type").GetString() == "actionResult");
    Check(!result.GetProperty("accepted").GetBoolean() && !fixture.Get<bool>("pendingAttack"), "native turn rejection remained pending");
    Console.WriteLine("PASS production native TURN rejection drains the action slot without emitting a swing");
}
await using (var fixture = await Fixture.Create())
{
    int at = fixture.Socket.Count; await fixture.Mine(Command(900)); await fixture.ReadNative();
    var result = await fixture.Socket.Wait(at, m => m.GetProperty("type").GetString() == "actionResult", 6500);
    Check(!result.GetProperty("accepted").GetBoolean() && result.GetProperty("reason").GetInt32() == -1
        && fixture.Get<bool>("pendingAttack"), "uncertain timeout released native action slot");
    await Fixture.Until(() => fixture.Socket.State == WebSocketState.CloseSent);
    await Reject(fixture, Command(901));
    Console.WriteLine("PASS actual five-second production timeout closes the connection and preserves native slot against late TURN ACK reuse");
}

sealed class Fixture : IAsyncDisposable
{
    public CaptureSocket Socket { get; } = new();
    public GatewaySession Session { get; }
    public Dictionary<int, InventoryItem> Equipment => Get<Dictionary<int, InventoryItem>>("equipment");
    public ushort NativeFacing { get; set; } = 4;
    private readonly CancellationTokenSource lifetime = new();
    private TcpClient peer = null!;
    private Task reader = Task.CompletedTask;
    private Fixture() { Session = new(Socket); Set("phase", "world"); Set("mapGeneration", 3);
        Set("confirmedPosition", ((ushort)12,(ushort)18)); Set("playerActorId", 1);
        Get<Dictionary<int,(ushort x,ushort y,bool dead,uint? feature)>>("entities")[1] = (12,18,false,0); Equipment[1] = Tool(); }
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
    public Task Mine(JsonElement command) => (Task)Call("Mine",command,lifetime.Token)!;
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
