using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Text.Json;
using System.Threading.Channels;
using Mir2.WebGateway;
using static Checks;

LegacyPacket ServerPacket(string text, ushort count) => new(529, 0, 0, 0, count, LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes(text)));
foreach (var packet in new[] {ServerPacket("热血传奇/Idle/", 2), ServerPacket("同名/Idle/同名/Busy/", 2), ServerPacket("/Idle/", 1), ServerPacket("热血传奇/Idle/", 0)})
{
    try { OriginalLoginScenes.ReadServers(packet); throw new Exception("Malformed server list accepted"); }
    catch (InvalidDataException) { }
}
Assert(OriginalLoginScenes.NoticeLines("第一行 \u001b\u001b \u001b\u001b末行 \u001b\u001b").SequenceEqual(new[]{"第一行", "", "末行"}), "Native ESC separators or blank notice lines changed");
Pass("native 529 count/name validation and exact ESC/blank-line notice projection");

using var loginListener = new TcpListener(IPAddress.Loopback, 0);
using var selectionListener = new TcpListener(IPAddress.Loopback, 0);
using var gameListener = new TcpListener(IPAddress.Loopback, 0);
loginListener.Start(); selectionListener.Start(); gameListener.Start();
Environment.SetEnvironmentVariable("MIR2_ENGINE_HOST", "127.0.0.1");
Environment.SetEnvironmentVariable("MIR2_SERVER_NAME", "热血传奇");
Environment.SetEnvironmentVariable("MIR2_LOGIN_GATE_PORT", ((IPEndPoint)loginListener.LocalEndpoint).Port.ToString());
Environment.SetEnvironmentVariable("MIR2_SELECTION_GATE_PORT", ((IPEndPoint)selectionListener.LocalEndpoint).Port.ToString());
Environment.SetEnvironmentVariable("MIR2_GAME_GATE_PORT", ((IPEndPoint)gameListener.LocalEndpoint).Port.ToString());
using var socket = new CaptureSocket();
using var cancellation = new CancellationTokenSource();
using var session = new GatewaySession(socket);
var running = session.Run(cancellation.Token);
string Phase() => (string)typeof(GatewaySession).GetField("phase", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(session)!;
var connected = await socket.Wait(0, m => Type(m) == "connected");
Assert(connected.GetProperty("features").GetProperty("entryScenes").GetBoolean(), "Entry scene capability absent");
socket.Input(new {type="login", account="fixture", password="fixture", interactiveLogin=true});
using var login = new NativePeer(await loginListener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(5)));
Assert((await login.Read()).Id == 2001, "Initial native login command changed");
await login.Reply(529, text:"热血传奇/Idle/离线服/0/", series:2);
var servers = await socket.Wait(0, m => Type(m) == "servers");
Assert(servers.GetProperty("servers").GetArrayLength() == 2, "Native server list was collapsed");
Assert(Phase() == "servers", "Login did not wait for explicit server choice");
await login.NoCommand();
Pass("actual Run waits at native 529 without automatically sending CM_SELECTSERVER=104");
foreach (string unavailable in new[]{"不存在", "离线服"})
{
    int at = socket.Count; socket.Input(new {type="selectServer", name=unavailable});
    await socket.Wait(at, m => Type(m) == "error" && m.GetProperty("commandType").GetString() == "selectServer");
    await login.NoCommand(); Assert(Phase() == "servers", "Rejected choice consumed the native login session");
}
socket.Input(new {type="selectServer", name="热血传奇"});
var chosen = await login.Read(); Assert(chosen.Id == 104 && chosen.Text == "热血传奇", "Explicit server name was not forwarded");
await login.Reply(530, text:"127.0.0.1/7100/1234");
using var selection = new NativePeer(await selectionListener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(5)));
Assert((await selection.Read()).Id == 100, "Character query missing after native ticket");
await selection.Reply(520, text:"甲战士/0/0/10/0/", recog:1);
await socket.Wait(0, m => Type(m) == "characters");
int duplicateAt = socket.Count; socket.Input(new {type="selectServer", name="热血传奇"});
await socket.Wait(duplicateAt, m => Type(m) == "error"); await login.NoCommand();
Pass("unknown/offline/unroutable and duplicate choices reject, while one valid choice obtains the real 530 ticket and 520 character list");

socket.Input(new {type="selectCharacter", name="甲战士"});
Assert((await selection.Read()).Id == 103, "Character selection command changed");
await selection.Reply(525);
using var game = new NativePeer(await gameListener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(5)));
await game.Payload();
await game.Reply(658, text:"第一行 \u001b\u001b \u001b\u001b末行 \u001b\u001b");
var notice = await socket.Wait(0, m => Type(m) == "entryNotice");
long noticeId = notice.GetProperty("noticeId").GetInt64();
Assert(notice.GetProperty("lines").GetArrayLength() == 3 && Phase() == "entryNotice", "Notice body or explicit waiting phase changed");
await game.NoCommand();
Pass("actual game reader projects SM_SENDNOTICE=658 and waits without automatically writing CM_LOGINNOTICEOK=1018");
int duplicateNoticeAt = socket.Count;
await game.Reply(658, text:"重复公告 \u001b\u001b");
var duplicateNotice = await socket.Wait(duplicateNoticeAt, m => Type(m) == "entryNotice");
Assert(duplicateNotice.GetProperty("noticeId").GetInt64() == noticeId && duplicateNotice.GetProperty("lines")[0].GetString() == "第一行", "Repeated native notice replaced its active identity or body");
await game.NoCommand();
foreach (object command in new object[]{new {type="move",x=1,y=1,direction=0,actionId=1,mapGeneration=0}, new {type="acknowledgeEntryNotice",noticeId=0L}, new {type="acknowledgeEntryNotice",noticeId=noticeId+1}, new {type="acknowledgeEntryNotice",noticeId="1"}})
{
    int at = socket.Count; socket.Input(command); await socket.Wait(at, m => Type(m) == "error");
    await game.NoCommand(); Assert(Phase() == "entryNotice", "Invalid pre-world command consumed the notice");
}
socket.Input(new {type="acknowledgeEntryNotice", noticeId});
Assert((await game.Read()).Id == 1018, "Explicit acknowledgement was not sent to native game service");
int repeatedAt = socket.Count; socket.Input(new {type="acknowledgeEntryNotice", noticeId});
await socket.Wait(repeatedAt, m => Type(m) == "error"); await game.NoCommand();
await game.Reply(51, text:"0"); await game.Reply(50, recog:11, param:12, tag:18, body:new byte[8]);
await socket.Wait(0, m => Type(m) == "entity" && m.GetProperty("self").GetBoolean());
await Until(() => Phase() == "world");
int lateAt = socket.Count; socket.Input(new {type="acknowledgeEntryNotice", noticeId});
await socket.Wait(lateAt, m => Type(m) == "error"); await game.NoCommand();
Pass("movement/stale/malformed/duplicate notice commands cannot advance entry; one acknowledgement permits authoritative native map and self packets");
int firstMap = socket.Messages().Last(e => Type(Message(e)) == "map").GetProperty("mapGeneration").GetInt32();
int descriptionAt = socket.Count;
await game.Reply(54, text:"比奇省\r后续地图说明", recog:7);
await socket.Wait(descriptionAt, m => Type(m) == "mapDescription" && m.GetProperty("title").GetString() == "比奇省" && m.GetProperty("musicId").GetInt32() == 7);
var firstDescription = socket.Messages().Last(e => Type(Message(e)) == "mapDescription");
Assert(firstDescription.GetProperty("mapGeneration").GetInt32() == firstMap, "Map description lost its map generation");
int mapAgainAt = socket.Count;
await game.Reply(51, text:"0");
await socket.Wait(mapAgainAt, m => Type(m) == "map");
firstMap = socket.Messages().Last(e => Type(Message(e)) == "map").GetProperty("mapGeneration").GetInt32();
Assert(firstMap > firstDescription.GetProperty("mapGeneration").GetInt32(), "Same-ID map entry failed to advance generation");
await game.Reply(54, text:"", recog:-1);
await socket.Wait(mapAgainAt, m => Type(m) == "mapDescription" && m.GetProperty("title").GetString() == "" && m.GetProperty("musicId").GetInt32() == -1);
Assert(socket.Messages().Last(e => Type(Message(e)) == "mapDescription").GetProperty("mapGeneration").GetInt32() == firstMap, "New map description reused the prior generation");
Pass("actual native TCP SM54 projects CR-delimited GBK title/music and stamps same-ID map replacement generations");
int reselectAt = socket.Count;
socket.Input(new {type="logout", mode="reselect", logoutId=1, mapGeneration=firstMap});
await socket.Wait(reselectAt, m => Type(m) == "logoutState" && m.GetProperty("state").GetString() == "waiting");
Assert((await game.Read()).Id == 1009, "Reselection did not use native soft close");
game.Dispose();
using var secondSelection = new NativePeer(await selectionListener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(5)));
Assert((await secondSelection.Read()).Id == 100, "Reselection omitted a fresh native character query");
await secondSelection.Reply(520, text:"甲战士/0/0/10/0/", recog:1);
await socket.Wait(reselectAt, m => Type(m) == "logoutState" && m.GetProperty("state").GetString() == "characters");
socket.Input(new {type="selectCharacter", name="甲战士"});
Assert((await secondSelection.Read()).Id == 103, "Reselected character was not forwarded");
await secondSelection.Reply(525);
using var secondGame = new NativePeer(await gameListener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(5)));
await secondGame.Payload();
await secondGame.Reply(658, text:"再次入图 \u001b\u001b");
var secondNotice = await socket.Wait(reselectAt, m => Type(m) == "entryNotice");
long secondNoticeId = secondNotice.GetProperty("noticeId").GetInt64();
Assert(secondNoticeId > noticeId && Phase() == "entryNotice", "Reselection reused the previous notice identity or skipped its acknowledgement");
int staleNoticeAt = socket.Count; socket.Input(new {type="acknowledgeEntryNotice", noticeId});
await socket.Wait(staleNoticeAt, m => Type(m) == "error");
await secondGame.NoCommand(); Assert(Phase() == "entryNotice", "Old acknowledgement advanced a replacement native game epoch");
socket.Input(new {type="acknowledgeEntryNotice", noticeId=secondNoticeId});
Assert((await secondGame.Read()).Id == 1018, "Fresh replacement notice did not send one acknowledgement");
await secondGame.NoCommand();
Pass("duplicate native notices preserve one identity; real soft-close/reselection receives a fresh notice and rejects the previous epoch's acknowledgement");
socket.Abort(); cancellation.Cancel(); await running;
Pass("test session exits without modifying live accounts, saves, maps or engine configuration");

static class Checks
{
    public static void Assert(bool value,string reason) { if(!value)throw new Exception("FAIL: "+reason); }
    public static void Pass(string message)=>Console.WriteLine("PASS "+message);
    public static JsonElement Message(JsonElement envelope)=>envelope.GetProperty("message");
    public static string? Type(JsonElement message)=>message.GetProperty("type").GetString();
    public static async Task Until(Func<bool> test,int ms=5000) {
        long end=Environment.TickCount64+ms;
        while(!test()) { if(Environment.TickCount64>end)throw new TimeoutException("Fixture assertion event timed out");await Task.Delay(5); }
    }
}

// Native peer and capture socket harness reused from LogoutGatewayRegression.
sealed class NativePeer(TcpClient client) : IDisposable
{
    private readonly List<byte> pending=[];
    public async Task<byte[]> Payload(int ms=3000) {
        using var cancellation=new CancellationTokenSource(ms);
        byte[] buffer=new byte[1];
        while(true) {
            int count=await client.GetStream().ReadAsync(buffer,cancellation.Token);
            if(count==0)throw new EndOfStreamException("Test peer EOF");
            pending.Add(buffer[0]);
            if(buffer[0]=='!') {
                byte[] frame=pending.ToArray();pending.Clear();Assert(frame[0]=='#',"native frame start changed");
                return frame[2..^1];
            }
        }
    }
    public async Task<LegacyPacket> Read()=>LegacyPacket.Parse(await Payload());
    public async Task NoCommand() {
        // Idle inspection must not cancel a read on the test peer: Windows can
        // mark its TcpClient disconnected after an aborted receive operation.
        await Task.Delay(80);
        Assert(client.Available==0,"unexpected extra native command");
    }
    public async Task<int> ReadToEnd() {
        int frames=0;using var cancellation=new CancellationTokenSource(3000);byte[] b=new byte[128];
        while(true) { int count=await client.GetStream().ReadAsync(b,cancellation.Token);if(count==0)return frames;frames+=b.AsSpan(0,count).ToArray().Count(v=>v=='!'); }
    }
    public static byte[] Frame(ushort id,string text="",int recog=0,ushort param=0,ushort tag=0,ushort series=0,byte[]? body=null)
        =>[(byte)'#',..LegacyCodec.Header(id,recog,param,tag,series),..LegacyCodec.Encode(body??LegacyCodec.Gbk.GetBytes(text)),(byte)'!'];
    public Task Reply(ushort id,string text="",int recog=0,ushort param=0,ushort tag=0,ushort series=0,byte[]? body=null)
        =>Bytes(Frame(id,text,recog,param,tag,series,body));
    public Task Encoded(ushort id,byte[] encoded)=>Bytes([(byte)'#',..LegacyCodec.Header(id),..encoded,(byte)'!']);
    public Task Raw(byte[] raw)=>Bytes([(byte)'#',..raw,(byte)'!']);
    public async Task Bytes(byte[] bytes)=>await client.GetStream().WriteAsync(bytes);
    public void Dispose()=>client.Dispose();
}

sealed class CaptureSocket : WebSocket
{
    public sealed record SendGate(Func<JsonElement,bool> Predicate)
    {
        public readonly TaskCompletionSource Entered=new(TaskCreationOptions.RunContinuationsAsynchronously);
        public readonly TaskCompletionSource Release=new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
    private readonly List<JsonElement> messages=[];
    private readonly Channel<byte[]> requests=Channel.CreateUnbounded<byte[]>();
    private WebSocketState state=WebSocketState.Open;
    private SendGate? gate;
    public int Count {get { lock(messages)return messages.Count; }}
    public JsonElement[] Messages()=>Since(0);
    public JsonElement[] Since(int at) { lock(messages)return messages.Skip(at).ToArray(); }
    public void Input(object command)=>requests.Writer.TryWrite(JsonSerializer.SerializeToUtf8Bytes(command));
    public SendGate HoldNext(Func<JsonElement,bool> predicate)=>gate=new(predicate);
    public async Task<JsonElement> Wait(int at,Func<JsonElement,bool> predicate) {
        await Until(()=>Since(at).Any(e=>predicate(Message(e))));return Message(Since(at).First(e=>predicate(Message(e))));
    }
    public override WebSocketCloseStatus? CloseStatus=>null;
    public override string? CloseStatusDescription=>null;
    public override WebSocketState State=>state;
    public override string? SubProtocol=>null;
    public override void Abort()=>state=WebSocketState.Aborted;
    public override Task CloseAsync(WebSocketCloseStatus status,string? description,CancellationToken cancellation) {state=WebSocketState.Closed;return Task.CompletedTask;}
    public override Task CloseOutputAsync(WebSocketCloseStatus status,string? description,CancellationToken cancellation) {state=WebSocketState.CloseSent;return Task.CompletedTask;}
    public override void Dispose()=>state=WebSocketState.Closed;
    public override async Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer,CancellationToken cancellation) {
        byte[] bytes=await requests.Reader.ReadAsync(cancellation);bytes.CopyTo(buffer.AsSpan());return new(bytes.Length,WebSocketMessageType.Text,true);
    }
    public override async Task SendAsync(ArraySegment<byte> buffer,WebSocketMessageType type,bool end,CancellationToken cancellation) {
        using var document=JsonDocument.Parse(buffer);var envelope=document.RootElement.Clone();
        if(gate is { } hold && hold.Predicate(Message(envelope))) { gate=null;hold.Entered.TrySetResult();await hold.Release.Task.WaitAsync(cancellation); }
        lock(messages)messages.Add(envelope);
    }
}
