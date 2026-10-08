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


await using (var f=new Fixture()) {
 Assert(f.Socket.Messages().First().GetProperty("message").GetProperty("features").GetProperty("characterDeletion").GetBoolean(),"missing deletion capability");
 f.Socket.Input(new{type="deleteCharacter",requestId=1,name="甲战士"});
 await f.Socket.Wait(0,m=>Type(m)=="error"&&m.GetProperty("commandType").GetString()=="deleteCharacter");
 await f.LoginCharacters();
 foreach(object? id in new object?[]{null,0,-1,1.5,"1",true,9007199254740992L}) {
  int at=f.Socket.Count;f.Socket.Input(new{type="deleteCharacter",requestId=id,name="甲战士"});
  var error=await f.Socket.Wait(at,m=>Type(m)=="error");Assert(error.GetProperty("requestId").ValueKind==JsonValueKind.Null,"unsafe ID reflected");
 }
 int mark=f.Socket.Count;f.Socket.Input(new{type="deleteCharacter",requestId=1,name="陌生角色"});await f.Socket.Wait(mark,m=>Type(m)=="error");
 await f.Selection!.NoCommand();Pass("actual Run gates phase, malformed/unsafe identities and current account whitelist before CM102");
}
await using (var f=new Fixture()) {
 await f.LoginCharacters();int at=f.Socket.Count;long started=Environment.TickCount64;
 f.Socket.Input(new{type="deleteCharacter",requestId=1,name="甲战士"});
 var deletion=await f.Selection!.Read();Assert(deletion.Id==102&&deletion.Text=="甲战士"&&deletion.Recog==0&&deletion.Param==0&&deletion.Tag==0&&deletion.Series==0,"delete payload/header changed");
 Assert(Environment.TickCount64-started>=1100,"native delete throttle bypassed");
 byte[] ack=NativePeer.Frame(523);await f.Selection.Bytes(ack[..5]);await Task.Delay(3);await f.Selection.Bytes(ack[5..]);
 var query=await f.Selection.Read();Assert(query.Id==100&&query.Text=="fixture/1234","refresh lost authenticated account/ticket");
 await f.Selection.Reply(520,text:"*乙法师/1/1/11/1/",recog:1);
 var result=await f.Socket.Wait(at,m=>Type(m)=="characterDeletionResult");
 Assert(result.GetProperty("accepted").GetBoolean()&&result.GetProperty("status").GetString()=="deleted"&&result.GetProperty("characters")[0].GetProperty("selected").GetBoolean(),"fresh absence/selected marker not authoritative");
 at=f.Socket.Count;f.Socket.Input(new{type="deleteCharacter",requestId=1,name="乙法师"});await f.Socket.Wait(at,m=>Type(m)=="error");await f.Selection.NoCommand();
 at=f.Socket.Count;f.Socket.Input(new{type="selectCharacter",name="甲战士"});await f.Socket.Wait(at,m=>Type(m)=="error");await f.Selection.NoCommand();
 await f.EnterWorld("乙法师",20);Pass("actual native throttle/GBK name-only CM102, fragmented523, fresh520 absence, selected marker, ID replay rejection and remaining-role enter");
}
foreach(ushort ack in new ushort[]{523,524}) await using(var f=new Fixture()) {
 await f.LoginCharacters();int at=f.Socket.Count;f.Socket.Input(new{type="deleteCharacter",requestId=1,name="甲战士"});await f.Selection!.Read();
 await f.Selection.Reply(ack,recog:7);Assert((await f.Selection.Read()).Id==100,"negative ACK failed to restore character-query state");
 await f.Selection.Reply(520,text:"甲战士/0/0/10/0/乙法师/1/1/11/1/",recog:2);
 var value=await f.Socket.Wait(at,m=>Type(m)=="characterDeletionResult");
 Assert(!value.GetProperty("accepted").GetBoolean()&&value.GetProperty("status").GetString()==(ack==523?"not-deleted":"rejected")&&value.GetProperty("characters").GetArrayLength()==2&&value.GetProperty("reason").GetInt32()==7,"ACK fabricated removal or lost reason");
 await f.EnterWorld("甲战士",21);
}
Pass("SM523 with role still present never succeeds; SM524 also refreshes the actual list and both preserve selection usability");
foreach(string failure in new[]{"unexpected-ack","malformed-list","eof"}) await using(var f=new Fixture()) {
 await f.LoginCharacters();int at=f.Socket.Count;f.Socket.Input(new{type="deleteCharacter",requestId=1,name="甲战士"});await f.Selection!.Read();
 if(failure=="unexpected-ack")await f.Selection.Reply(525);
 else if(failure=="eof")f.Selection.Dispose();
 else{await f.Selection.Reply(523);await f.Selection.Read();await f.Selection.Reply(520,text:"乙法师/1/1/notlevel/1/",recog:1);}
 var value=await f.Socket.Wait(at,m=>Type(m)=="characterDeletionResult");
 Assert(value.GetProperty("status").GetString()=="unknown"&&value.GetProperty("accepted").ValueKind==JsonValueKind.Null&&value.GetProperty("requiresLogin").GetBoolean()&&f.Get<HashSet<string>>("characters").Count==0&&f.Get<string>("phase")=="login","unknown did not quarantine selection");
 at=f.Socket.Count;f.Socket.Input(new{type="selectCharacter",name="乙法师"});await f.Socket.Wait(at,m=>Type(m)=="error");
}
Pass("unexpected native ACK, malformed refresh and EOF after delete all retain unknown outcome and quarantine old selection authority");
foreach(bool sent in new[]{false,true}) await using(var f=new Fixture()) {
 await f.LoginCharacters();f.Set("characterDeleteTimeout",TimeSpan.FromMilliseconds(sent?1400:50));int at=f.Socket.Count;
 f.Socket.Input(new{type="deleteCharacter",requestId=1,name="甲战士"});
 if(sent)Assert((await f.Selection!.Read()).Id==102,"sent timeout never wrote");
 var value=await f.Socket.Wait(at,m=>Type(m)=="characterDeletionResult");
 Assert(value.GetProperty("status").GetString()==(sent?"unknown":"not-sent")&&value.GetProperty("requestSent").GetBoolean()==sent,"timeout invented sent/rollback status");
 if(!sent)Assert(await f.Selection!.ReadToEnd()==0,"before-write cancellation still sent a native command");
 await f.LoginCharacters("fresh9");Assert(f.Get<HashSet<string>>("characters").Contains("甲战士"),"fresh login was contaminated by old result");
}
Pass("actual pre-write and post-write deadline branches never replay CM102; fresh authentication restores independent selection");
await using(var f=new Fixture()) {
 await f.LoginCharacters();var parse=typeof(GatewaySession).GetMethod("CharacterOptions",BindingFlags.Instance|BindingFlags.NonPublic)!;
 foreach(var invalid in new[]{new LegacyPacket(520,2,0,0,0,LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("甲战士/0/0/1/0/坏角色/1/0/notlevel/0/"))),new LegacyPacket(520,2,0,0,0,LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("甲战士/0/0/1/0/甲战士/1/0/2/0/")))}) {
  try{parse.Invoke(f.Session,[invalid]);throw new Exception("invalid list accepted");}catch(TargetInvocationException e) when(e.InnerException is InvalidDataException){}
  Assert(f.Get<HashSet<string>>("characters").SetEquals(["甲战士","乙法师"]),"bad list published partial whitelist");
 }
 Pass("malformed numeric/duplicate character lists fail atomically instead of publishing partial account whitelist");
}
await using(var f=new Fixture()) {
 await f.LoginCharacters();int at=f.Socket.Count;f.Socket.Input(new{type="deleteCharacter",requestId=1,name="甲战士"});await f.Selection!.Read();
 f.Socket.Input(new{type="selectCharacter",name="甲战士"});await f.Selection.NoCommand();
 // ACK and list coalesced exercise buffered Receive/Expect ownership.
 await f.Selection.Bytes([..NativePeer.Frame(523),..NativePeer.Frame(520,text:"乙法师/1/1/11/1/",recog:1)]);
 Assert((await f.Selection.Read()).Id==100,"coalesced refresh skipped real query");
 await f.Socket.Wait(at,m=>Type(m)=="characterDeletionResult");await f.Socket.Wait(at,m=>Type(m)=="error"&&m.GetProperty("commandType").GetString()=="selectCharacter");await f.Selection.NoCommand();
 Pass("queued enter cannot pass an in-flight delete; coalesced523/520 replaces authority before queued removed-role selection");
}
Console.WriteLine("TOTAL character deletion production Run/private TCP checks complete; no production account or DB mutation");
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
