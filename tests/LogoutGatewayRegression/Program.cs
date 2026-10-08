using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Mir2.WebGateway;
using static Checks;

await using (var f = new Fixture())
{
    await f.LoginWorld("甲战士", 11);
    Assert(f.Socket.Messages().First().GetProperty("message").GetProperty("features").GetProperty("logout").GetBoolean(), "logout capability absent");
    Pass("actual Run login/select/game handshake and fresh role list are driven through three private native TCP listeners");
    foreach (object command in new object[] {
        new { type="logout", mode="reselect", mapGeneration=f.Map },
        new { type="logout", mode="reselect", logoutId=0, mapGeneration=f.Map },
        new { type="logout", mode="reselect", logoutId=1.5, mapGeneration=f.Map },
        new { type="logout", mode="reselect", logoutId="3", mapGeneration=f.Map },
        new { type="logout", mode="reselect", logoutId=9007199254740992L, mapGeneration=f.Map },
        new { type="logout", mode="other", logoutId=3, mapGeneration=f.Map },
        new { type="logout", mode="reselect", logoutId=3 },
        new { type="logout", mode="reselect", logoutId=3, mapGeneration=f.Map-1 }
    }) {
        int at=f.Socket.Count; f.Socket.Input(command);
        await f.Socket.Wait(at,m=>Type(m)=="error" && m.GetProperty("code").GetString()=="command_rejected");
        Assert(f.Get<string>("phase")=="world" && f.Socket.State==WebSocketState.Open,"invalid logout retired a real world");
    }
    await f.Game!.NoCommand();
    Pass("missing/nonpositive/fractional/string/unsafe logout identity, invalid mode/missing/stale generation reject before CM1009 and keep the world");

    int oldMap=f.Map, oldSession=f.Generation;
    var gate=f.Socket.HoldNext(m=>Type(m)=="entityName");
    await f.Game!.Reply(42,text:"旧消息",recog:99);
    await gate.Entered.Task.WaitAsync(TimeSpan.FromSeconds(3));
    int atLogout=f.Socket.Count;
    f.Socket.Input(new {type="logout",mode="reselect",logoutId=10,mapGeneration=oldMap});
    await Task.Delay(30);
    Assert(!f.Socket.Since(atLogout).Any(e=>Type(Message(e))=="logoutState"),"waiting bypassed an in-flight old sender");
    gate.Release.TrySetResult();
    var waiting=await f.Socket.Wait(atLogout,m=>Type(m)=="logoutState" && State(m)=="waiting");
    Assert(waiting.GetProperty("sessionGeneration").GetInt32()==oldSession+1 && f.Map==oldMap+1,"logout did not advance both epochs once");
    int afterWaiting=f.Socket.Count;
    Assert((await f.Game.Read()).Id==1009,"soft close not original CM1009");
    f.Socket.Input(new {type="logout",mode="reselect",logoutId=10,mapGeneration=oldMap});
    await f.Socket.Wait(afterWaiting,m=>Type(m)=="logoutState"&&State(m)=="waiting");
    await f.Game.NoCommand();
    Pass("acceptance serializes with actual Web sender, advances map/session once and identical pending request emits no second CM1009");

    foreach(object command in new object[] {
        new {type="logout",mode="login",logoutId=10,mapGeneration=oldMap},
        new {type="logout",mode="reselect",logoutId=11,mapGeneration=f.Map},
        new {type="move",x=13,y=18,direction=2,actionId=77,mapGeneration=f.Map},
        new {type="selectCharacter",name="乙法师"}
    }) {
        int at=f.Socket.Count;f.Socket.Input(command);
        await f.Socket.Wait(at,m=>Type(m)=="error");
        Assert(f.Get<bool>("logoutPending"),"unaccepted duplicate cancelled accepted operation");
    }
    await f.Game.NoCommand();
    await f.Game.Reply(634,text:"旧地图",recog:11,param:90,tag:90);
    await f.Game.Raw("+GD/1"u8.ToArray());
    await f.Game.Bytes([(byte)'#',..LegacyCodec.Header(50,999).Take(5)]);
    f.Game.Dispose();
    var terminal=await f.FinishReselect(10);
    Assert(terminal.GetProperty("characters")[0].GetProperty("level").GetInt32()==22,"cached old character list used instead of new native reply");
    Assert(!f.Socket.Since(afterWaiting).Any(e=>Type(Message(e)) is "map" or "entity" or "characters" or "legacy" or "actionResult"),"retired native packet or uncorrelated chars leaked across waiting");
    Assert(f.Get<object?>("confirmedPosition") is null && f.Get<object?>("playerActorId") is null,"retired world positions survived terminal");
    Pass("waiting rejects new/different logout and world/select commands; late teleport/GOOD/partial frame remain old, fresh SM520 alone completes correlated characters");

    int atTerminal=f.Socket.Count;
    f.Socket.Input(new {type="logout",mode="reselect",logoutId=10,mapGeneration=oldMap});
    await f.Socket.Wait(atTerminal,m=>Type(m)=="logoutState"&&State(m)=="characters");
    await f.Selection!.NoCommand();
    await f.EnterWorld("乙法师",22);
    Assert(f.Socket.State==WebSocketState.Open && f.Generation>terminal.GetProperty("sessionGeneration").GetInt32(),"old reader cancelled the Web or replacement epoch did not advance");
    Assert(f.Get<string>("character")=="乙法师" && f.Get<int?>("playerActorId")==22,"replacement character retained old identity");
    int staleAt=f.Socket.Count;f.Socket.Input(new{type="logout",mode="reselect",logoutId=10,mapGeneration=oldMap});
    await f.Socket.Wait(staleAt,m=>Type(m)=="error");
    Assert(f.Get<string>("phase")=="world","old terminal identity resurrected character list inside new world");
    int moveAt=f.Socket.Count;
    f.Socket.Input(new{type="move",x=13,y=18,direction=2,actionId=701,mapGeneration=f.Map});
    Assert((await f.Game!.Read()).Id==3011,"replacement game connection did not receive its own movement");
    await f.Game.Raw("+GD/1"u8.ToArray());
    var moved=await f.Socket.Wait(moveAt,m=>Type(m)=="actionResult");
    Assert(moved.GetProperty("accepted").GetBoolean()&&moved.GetProperty("actionId").GetInt64()==701,"old GOOD completed replacement action");
    Pass("completed duplicate returns same list without CM100; distinct replacement role keeps Web alive and rejects old identity while its own native move/GOOD works");
}

await using (var f = new Fixture())
{
    Assert(f.Get<TimeSpan>("softCloseDelay")==TimeSpan.FromSeconds(2),"original command timer delay changed");
    f.Set("softCloseDelay",TimeSpan.FromMilliseconds(50));
    await f.LoginWorld("甲战士",29);
    int at=f.Socket.Count;
    f.Socket.Input(new{type="logout",mode="reselect",logoutId=19,mapGeneration=f.Map});
    await f.Socket.Wait(at,m=>Type(m)=="logoutState"&&State(m)=="waiting");
    Assert((await f.Game!.Read()).Id==1009,"client retirement omitted original soft-close command");
    // Deliberately keep the server peer open, as real GameGate does.
    Assert(await f.Game.ReadToEnd()==0,"gateway did not close its own transport or replayed CM1009");
    var result=await f.FinishReselect(19);
    Assert(State(result)=="characters"&&result.GetProperty("characters")[0].GetProperty("level").GetInt32()==22,"retirement reused cached characters");
    Assert(f.Socket.State==WebSocketState.Open,"retired receive cancelled the current Web peer");
    Pass("a native peer that never initiates EOF still reselects: one CM1009, client timer close, joined reader and fresh SM520 without a save claim");
}

await using (var f = new Fixture())
{
    await f.LoginWorld("甲战士",31);
    await f.SeedActions();
    int oldMap=f.Map;
    int at=f.Socket.Count;
    f.Socket.Input(new{type="logout",mode="reselect",logoutId=20,mapGeneration=oldMap});
    await f.Socket.Wait(at,m=>Type(m)=="logoutState"&&State(m)=="waiting");
    Assert((await f.Game!.Read()).Id==1009,"pending mine prevented original soft close");
    f.Game.Dispose();
    await f.FinishReselect(20);
    await f.EnterWorld("乙法师",32);
    int after=f.Socket.Count;
    await Task.Delay(5250);
    Assert(f.Socket.State==WebSocketState.Open&&!f.Socket.Since(after).Any(e=>Type(Message(e)) is "actionResult" or "magicKeyResult"),"retired mining/key timer affected replacement role");
    Assert(f.Get<object?>("pendingMining") is null && f.Get<object?>("pendingMagicKey") is null,"old action or binding not reset");
    Assert(f.Get<Dictionary<int,InventoryItem>>("inventory").Count==0 && f.Get<Dictionary<int,InventoryItem>>("equipment").Count==0 && f.Get<Dictionary<ushort,MagicSkill>>("skills").Count==0,"old inventory/equipment/magic crossed roles");
    Pass("actual pending mine and CM_MAGICKEYCHANGE timers cancel and join on retirement; after five seconds new Web/game remains open with no old result, item or skill");
}

foreach(bool failList in new[]{false,true})
await using (var f=new Fixture())
{
    await f.LoginWorld("甲战士",41);
    f.Set("logoutTimeout",TimeSpan.FromMilliseconds(200));
    f.Set("softCloseDelay",TimeSpan.FromMilliseconds(20));
    int at=f.Socket.Count;f.Socket.Input(new{type="logout",mode="reselect",logoutId=30,mapGeneration=f.Map});
    await f.Socket.Wait(at,m=>Type(m)=="logoutState"&&State(m)=="waiting");
    Assert((await f.Game!.Read()).Id==1009,"failure request was never sent");
    if(failList)f.Game.Dispose();
    f.Selection=await f.Accept(f.SelectListener);
    Assert((await f.Selection.Read()).Id==100,"fresh character query absent");
    if(failList)await f.Selection.Reply(520,text:"甲战士/0/0/22/0/",recog:2);
    var failed=await f.Socket.Wait(at,m=>Type(m)=="logoutState"&&State(m)=="failed");
    Assert(failed.GetProperty("requiresLogin").GetBoolean() && f.Get<string>("phase")=="login" && f.Get<string>("account")=="" && f.Get<string>("ticket")=="","failure resumed old authentication/world");
    Assert(!failed.GetProperty("message").GetString()!.Contains("已保存",StringComparison.Ordinal),"EOF or timeout claimed confirmed persistence");
    Assert(f.Socket.State==WebSocketState.Open,"recoverable reselect failure killed Web transport");
    Pass(failList ? "invalid fresh SM520 resets to typed requiresLogin failure with no cached character list" : "fresh selection timeout after one CM1009 resets authentication with unknown-save failure, never resumes or retries old world");
    await f.LoginWorld("甲战士",42);
    Assert(f.Get<int?>("playerActorId")==42,"fresh login after accepted failure reused disposed native slot");
    Pass("requiresLogin failure permits fresh login/selection/game connection on same Web peer");
}

await using(var f=new Fixture())
{
    await f.LoginWorld("甲战士",51);
    int originalMap=f.Map;
    int at=f.Socket.Count;
    f.Socket.Input(new{type="logout",mode="login",logoutId=40,mapGeneration=f.Map});
    await f.Socket.Wait(at,m=>Type(m)=="logoutState"&&State(m)=="login");
    Assert(await f.Game!.ReadToEnd()==0,"big exit fabricated CM1009 unlike reference AppExit");
    Assert(f.Get<string>("account")=="" && f.Get<string>("ticket")=="" && f.Get<object?>("confirmedPosition") is null,"big exit retained authentication or world");
    await f.LoginCharacters("otheracct");
    int replayAt=f.Socket.Count;
    f.Socket.Input(new{type="logout",mode="login",logoutId=40,mapGeneration=originalMap});
    await f.Socket.Wait(replayAt,m=>Type(m)=="error"&&m.GetProperty("code").GetString()=="command_rejected");
    Assert(f.Get<string>("phase")=="characters"&&f.Get<string>("account")=="otheracct"&&!f.Socket.Since(replayAt).Any(e=>Type(Message(e))=="logoutState"),"prior authentication's terminal logout replayed inside new selection");
    await f.EnterWorld("乙法师",52);
    Pass("big exit closes actual old TCP without CM1009, clears account/ticket/world, and a fresh same-Web login enters another role");
    Pass("fresh authentication retires prior logout result before its character selection phase while preserving logout ID high-water mark");
}

await using(var f=new Fixture())
{
    await f.LoginWorld("甲战士",55);
    await f.SeedActions();
    int at=f.Socket.Count;
    f.Socket.Input(new{type="logout",mode="reselect",logoutId=45,mapGeneration=f.Map});
    await f.Socket.Wait(at,m=>Type(m)=="logoutState"&&State(m)=="waiting");
    Assert((await f.Game!.Read()).Id==1009,"cancelled transition never sent its original soft close");
    await f.EndWeb();
    Assert(f.Run.IsCompletedSuccessfully && f.Get<object?>("activeGameEpoch") is null,"Web cancellation left a retired reader or disposed-source cleanup failure");
    Pass("Web cancellation during accepted EOF wait joins retired reader/timers and completes Run without disposing an active cancellation source twice");
}

await using(var f=new Fixture())
{
    await f.LoginWorld("甲战士",61);
    f.Game!.Dispose();
    await f.Run.WaitAsync(TimeSpan.FromSeconds(3));
    Assert(f.Socket.State!=WebSocketState.Open,"unexpected native EOF was swallowed as an accepted logout");
    Pass("unexpected EOF still terminates the owning Web session; only an accepted retired epoch preserves it");
}

static class Checks
{
    public static void Assert(bool value,string reason) { if(!value)throw new Exception("FAIL: "+reason); }
    public static void Pass(string message)=>Console.WriteLine("PASS "+message);
    public static JsonElement Message(JsonElement envelope)=>envelope.GetProperty("message");
    public static string? Type(JsonElement message)=>message.GetProperty("type").GetString();
    public static string? State(JsonElement message)=>message.GetProperty("state").GetString();
    public static async Task Until(Func<bool> test,int ms=4000) {
        long end=Environment.TickCount64+ms;
        while(!test()) { if(Environment.TickCount64>end)throw new TimeoutException("Fixture assertion event timed out");await Task.Delay(5); }
    }
}

sealed class Fixture : IAsyncDisposable
{
    public readonly TcpListener LoginListener=new(IPAddress.Loopback,0),SelectListener=new(IPAddress.Loopback,0),GameListener=new(IPAddress.Loopback,0);
    public readonly CaptureSocket Socket=new();
    public readonly GatewaySession Session;
    public readonly Task Run;
    public NativePeer? Game,Selection;
    private readonly CancellationTokenSource lifetime=new();
    private readonly List<NativePeer> peers=[];
    private readonly Dictionary<string,string?> environment=[];
    private string currentAccount="fixture";
    public int Map=>Get<int>("mapGeneration");
    public int Generation=>Get<int>("sessionGeneration");
    public Fixture() {
        LoginListener.Start();SelectListener.Start();GameListener.Start();
        SetEnv("MIR2_ENGINE_HOST","127.0.0.1");
        SetEnv("MIR2_LOGIN_GATE_PORT",Port(LoginListener));SetEnv("MIR2_SELECTION_GATE_PORT",Port(SelectListener));SetEnv("MIR2_GAME_GATE_PORT",Port(GameListener));
        Session=new(Socket);Run=Session.Run(lifetime.Token);
    }
    private static string Port(TcpListener listener)=>((IPEndPoint)listener.LocalEndpoint).Port.ToString();
    private void SetEnv(string key,string value) { environment[key]=Environment.GetEnvironmentVariable(key);Environment.SetEnvironmentVariable(key,value); }
    public T Get<T>(string name)=>(T)typeof(GatewaySession).GetField(name,BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(Session)!;
    public void Set(string name,object value)=>typeof(GatewaySession).GetField(name,BindingFlags.Instance|BindingFlags.NonPublic)!.SetValue(Session,value);
    public async Task<NativePeer> Accept(TcpListener listener) {
        var peer=new NativePeer(await listener.AcceptTcpClientAsync(lifetime.Token).AsTask().WaitAsync(TimeSpan.FromSeconds(3)));
        peers.Add(peer);return peer;
    }
    public async Task LoginWorld(string role,int actor) {
        await LoginCharacters();
        await EnterWorld(role,actor);
    }
    public async Task LoginCharacters(string account="fixture") {
        currentAccount=account;
        int at=Socket.Count;
        Socket.Input(new{type="login",account,password="fixture"});
        var login=await Accept(LoginListener);
        Assert((await login.Read()).Id==2001,"login command changed");
        await login.Reply(529);Assert((await login.Read()).Id==104,"server select changed");
        await login.Reply(530,text:"127.0.0.1/7100/1234");
        Selection=await Accept(SelectListener);Assert((await Selection.Read()).Id==100,"initial character query changed");
        await Selection.Reply(520,text:"甲战士/0/0/10/0/乙法师/1/1/11/1/",recog:2);
        await Socket.Wait(at,m=>Type(m)=="characters");
    }
    public async Task EnterWorld(string role,int actor) {
        int at=Socket.Count;Socket.Input(new{type="selectCharacter",name=role});
        var select=await Selection!.Read();Assert(select.Id==103&&select.Text==currentAccount+"/"+role,"selection kept stale role");
        await Selection.Reply(525);Game=await Accept(GameListener);
        string handshake=LegacyCodec.Gbk.GetString(LegacyCodec.Decode(await Game.Payload()));
        Assert(handshake.StartsWith("**"+currentAccount+"/"+role+"/",StringComparison.Ordinal),"game handshake kept stale role");
        byte[] frame=NativePeer.Frame(51,text:"0");
        await Game.Bytes(frame[..6]);await Task.Delay(3);await Game.Bytes(frame[6..]);
        await Game.Reply(50,body:new byte[8],recog:actor,param:12,tag:18);
        await Socket.Wait(at,m=>Type(m)=="entity"&&m.GetProperty("self").GetBoolean());
        await Until(()=>Get<string>("phase")=="world");
    }
    public async Task<JsonElement> FinishReselect(long id) {
        Selection=await Accept(SelectListener);
        var query=await Selection.Read();Assert(query.Id==100&&query.Text=="fixture/1234","reselect did not retain original in-memory ticket");
        await Selection.Reply(520,text:"甲战士/0/0/22/0/乙法师/1/1/23/1/",recog:2);
        return await Socket.Wait(0,m=>Type(m)=="logoutState"&&m.GetProperty("logoutId").GetInt64()==id&&State(m)=="characters");
    }
    public async Task SeedActions() {
        byte[] item=new byte[124];item[15]=6;item[16]=19;
        BinaryPrimitives.WriteInt32LittleEndian(item.AsSpan(100),777);BinaryPrimitives.WriteUInt16LittleEndian(item.AsSpan(104),9000);
        await Game!.Encoded(621,[(byte)'1',(byte)'/',..LegacyCodec.Encode(item),(byte)'/']);
        int at=Socket.Count;
        byte[] magic=new byte[84];BinaryPrimitives.WriteUInt16LittleEndian(magic.AsSpan(8),12);
        await Game.Reply(210,body:magic);
        await Socket.Wait(at,m=>Type(m)=="skillAdded");
        Socket.Input(new{type="mine",direction=2,actionId=801,mapGeneration=Map});
        Assert((await Game.Read()).Id==3010,"actual pending mining not established");
        Socket.Input(new{type="setMagicKey",magicId=12,key=49,bindingId=901});
        Assert((await Game.Read()).Id==1008,"actual pending binding not established");
    }
    public async Task EndWeb() { await lifetime.CancelAsync();await Run.WaitAsync(TimeSpan.FromSeconds(3)); }
    public async ValueTask DisposeAsync() {
        await lifetime.CancelAsync();foreach(var peer in peers)peer.Dispose();Session.Dispose();
        LoginListener.Stop();SelectListener.Stop();GameListener.Stop();
        try { await Run.WaitAsync(TimeSpan.FromSeconds(3)); } catch(OperationCanceledException) { }
        foreach(var pair in environment)Environment.SetEnvironmentVariable(pair.Key,pair.Value);
        lifetime.Dispose();
    }
}

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
