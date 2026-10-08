using System.Collections;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using GameSrv;
using GameSrv.Services;
using GameSrv.Word.Threads;
using M2Server;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Data;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using Serilog;
using SystemModule;
using SystemModule.Data;

// Own loopback TCP listener, in-memory snapshots, actual production dispatcher and codec.
// No native host, MySQL, server configuration files or runtime accounts are used.
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().CreateLogger();
SystemShare.ActorMgr = new ActorMgr();
M2Share.UserDBCriticalSection = new object();
long clock = 10000;
FieldInfo clockField = PrivateField("SaveClock");
FieldInfo sendField = PrivateField("SendSaveRequest");
object originalClock = clockField.GetValue(null)!;
object originalSend = sendField.GetValue(null)!;
clockField.SetValue(null, (Func<long>)(() => clock));
var processor = new CharacterDataProcessor();
await using var peer = new DatabasePeer();
int groups = 0;
try
{
    Reset();
    var actor = new PlayObject { RcdSaved = true };
    var initial = Record("queue_initial", 1, actor);
    Front().AddToSaveRcdList(initial);
    Check(!actor.RcdSaved && !Front().IsIdle(), "enqueue resets a prior success marker");
    Front().GetSaveRcdList()[0] = Record("detached_copy", 2);
    Front().ClearSaveList();
    Check(Front().SaveListCount() == 1, "a caller cannot erase the failed-drain barrier");
    Pass("enqueue invalidates RcdSaved; list snapshots and ClearSaveList preserve unresolved data");

    await Tick();
    Check(Front().SaveListCount() == 1 && !initial.IsSaveing && initial.ReTryCount == 0,
        "disconnected processing must retain an unsent snapshot without spending retries");
    object?[] loadArgs = [new LoadDBInfo { ChrName = "QUEUE_INITIAL" }, false];
    bool waiting = (bool)typeof(CharacterDataProcessor).GetMethod("LoadCharacterData", BindingFlags.Static | BindingFlags.NonPublic)!
        .Invoke(null, loadArgs)!;
    Check(waiting && (bool)loadArgs[1]!, "real reload processing must wait behind the save barrier");
    Pass("DB disconnect retains saves and the production same-character reload barrier");

    await peer.Connect();
    await Tick();
    Request first = await peer.Read();
    Check(first.Header.Ident == Messages.DB_SAVEHUMANRCD && first.Snapshot!.CharacterData.Data.CurX == 1,
        "actual TCP carries DB_SAVE and the original snapshot");
    await Ack(first.QueryId);
    Check(actor.RcdSaved && Front().IsIdle() && !initial.IsSaveing, "matching success releases the exact record");
    Pass("actual DataQueryServer TCP request and 1102/1 response complete only the matching save");

    Reset();
    actor = new PlayObject();
    var a1 = Record("queue_a", 11, actor);
    var a2 = Record("QUEUE_A", 12, actor);
    var b1 = Record("queue_b", 21);
    Add(a1, a2, b1);
    await Tick();
    Request[] batch = [await peer.Read(), await peer.Read()];
    Request a = batch.Single(request => request.Snapshot!.ChrName == "queue_a");
    Request b = batch.Single(request => request.Snapshot!.ChrName == "queue_b");
    Check(a1.IsSaveing && !a2.IsSaveing && b1.IsSaveing && a2.QueryId == 0, "only the oldest case-insensitive character snapshot is sent");
    await Ack(b.QueryId);
    Check(!Front().InSaveRcdList("queue_b") && Front().SaveListCount() == 2 && !actor.RcdSaved,
        "a later character response must progress while the earlier character has no reply");
    Pass("same-character snapshots are serialized while out-of-order other-character ACKs progress");

    await peer.Send(a.QueryId, Messages.DBR_LOADHUMANRCD, 0);
    await WaitReply(a.QueryId);
    PlayerDataService.ProcessSaveQueue();
    Check(!a1.IsSaveing && a1.QueryId == 0 && Front().SaveListCount() == 2 && !actor.RcdSaved,
        "original LOAD/0 is a save failure, not completion");
    await Tick();
    Check(!a1.IsSaveing && !a2.IsSaveing, "failure backoff blocks both snapshots");
    clock += 1000;
    await Tick();
    Request retry = await peer.Read();
    Check(retry.QueryId != a.QueryId && retry.Snapshot!.CharacterData.Data.CurX == 11 && a1.ReTryCount == 2,
        "retry preserves the older snapshot and obtains a new query identity");
    Pass("1100/0 retains the snapshot, uses bounded retry backoff and never allows overtaking");

    await peer.Send(a.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
    await Task.Delay(35);
    PlayerDataService.ProcessSaveQueue();
    Check(a1.IsSaveing && a1.QueryId == retry.QueryId && Front().SaveListCount() == 2 && !actor.RcdSaved,
        "a retired attempt cannot confirm its retry");
    await Ack(retry.QueryId);
    Check(!actor.RcdSaved && Front().SaveListCount() == 1, "older success cannot confirm a newer snapshot");
    await Tick();
    Request newest = await peer.Read();
    Check(newest.Snapshot!.CharacterData.Data.CurX == 12, "next snapshot follows the real success");
    await peer.Send(retry.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
    await Task.Delay(35);
    PlayerDataService.ProcessSaveQueue();
    Check(!actor.RcdSaved && a2.IsSaveing, "duplicate prior ACK must not confirm the new snapshot");
    await Ack(newest.QueryId);
    Check(actor.RcdSaved && Front().IsIdle(), "only the newest success completes the actor");
    Pass("late and duplicate prior ACKs cannot confirm retries or newer snapshots; RcdSaved stays correlated");

    Reset();
    var uncertain = Record("queue_unknown", 30);
    var subsequent = Record("QUEUE_UNKNOWN", 31);
    Add(uncertain, subsequent);
    await Tick();
    Request lost = await peer.Read();
    clock += 4999;
    PlayerDataService.ProcessSaveQueue();
    Check(!Unknown(lost.QueryId), "confirmation remains pending just before 5s");
    clock++;
    PlayerDataService.ProcessSaveQueue();
    Check(Unknown(lost.QueryId) && uncertain.IsSaveing && Front().SaveListCount() == 2, "5s timeout preserves the exact unknown attempt");
    var independent = Record("queue_independent", 40);
    Add(independent);
    await Tick();
    Request independentRequest = await peer.Read();
    Check(independentRequest.Snapshot!.ChrName == "queue_independent" && subsequent.ReTryCount == 0,
        "unknown result holds only its own character");
    await Ack(independentRequest.QueryId);
    Check(Front().SaveListCount() == 2, "other character completed while unknown barrier remains");
    Pass("exact 5s timeout stays unknown without retry or newer snapshot; other characters remain live");

    await peer.Disconnect();
    await Tick();
    Check(uncertain.IsSaveing && uncertain.QueryId == lost.QueryId && Front().SaveListCount() == 2,
        "disconnect does not turn an unknown commit into unsent data");
    await peer.Connect();
    await Tick();
    Check(uncertain.ReTryCount == 1 && subsequent.ReTryCount == 0, "reconnect cannot silently retry an unknown snapshot");
    await Ack(lost.QueryId);
    await Tick();
    Request afterReconnect = await peer.Read();
    Check(afterReconnect.Snapshot!.CharacterData.Data.CurX == 31, "a real late matching ACK releases the next snapshot");
    await Ack(afterReconnect.QueryId);
    Pass("full-frame DB reconnect preserves unknown identity until its matching late ACK arrives");

    Reset();
    var wrong = Record("queue_wrong", 50);
    Add(wrong);
    await Tick();
    Request wrongRequest = await peer.Read();
    await peer.Send(wrongRequest.QueryId, Messages.DBR_LOADHUMANRCD, 1);
    await WaitReply(wrongRequest.QueryId);
    PlayerDataService.ProcessSaveQueue();
    Check(Unknown(wrongRequest.QueryId) && Front().SaveListCount() == 1 && wrong.IsSaveing,
        "wrong message kind cannot be accepted as a save success");
    await Ack(wrongRequest.QueryId);
    Pass("a matching query with the wrong reply kind remains unknown and accepts only later genuine 1102/1");

    Reset();
    var failedSend = Record("queue_send_false", 60);
    Add(failedSend);
    sendField.SetValue(null, (Func<int, ServerRequestMessage, SaveCharacterData, bool>)((_, _, _) => false));
    await Tick();
    Check(!failedSend.IsSaveing && failedSend.QueryId == 0 && failedSend.ReTryCount == 1 && Front().SaveListCount() == 1,
        "production pre-send=false must release IsSaveing but preserve its snapshot");
    sendField.SetValue(null, originalSend);
    clock += 1000;
    await Tick();
    Request sentAfterFailure = await peer.Read();
    await Ack(sentAfterFailure.QueryId);
    Pass("production send-false branch clears the permanent IsSaveing bug and retries the same record");

    Reset();
    var partialSend = Record("queue_partial_send", 70);
    Add(partialSend);
    sendField.SetValue(null, (Func<int, ServerRequestMessage, SaveCharacterData, bool>)((id, header, snapshot) =>
    {
        GameShare.DataServer.SendRequest(id, header, snapshot);
        throw new IOException("isolated transport exception after actual bytes");
    }));
    await Tick();
    Request interrupted = await peer.Read();
    Check(partialSend.IsSaveing && Unknown(interrupted.QueryId), "exception after bytes cannot imply that nothing was saved");
    sendField.SetValue(null, originalSend);
    clock += 10000;
    await Tick();
    Check(partialSend.ReTryCount == 1, "partial send cannot be blindly retried");
    await Ack(interrupted.QueryId);
    Pass("actual bytes followed by a transport exception preserve unknown status and accept the matching ACK");

    Reset();
    var malformed = Record("queue_malformed", 80);
    var healthy = Record("queue_healthy", 81);
    Add(malformed, healthy);
    await Tick();
    Request[] malformedBatch = [await peer.Read(), await peer.Read()];
    int malformedId = malformedBatch.Single(request => request.Snapshot!.ChrName == "queue_malformed").QueryId;
    int healthyId = malformedBatch.Single(request => request.Snapshot!.ChrName == "queue_healthy").QueryId;
    await peer.SendRaw(malformedId, EDCode.EncodeBuffer(new byte[32]), []);
    await WaitReply(malformedId);
    await Ack(healthyId);
    Check(Front().SaveListCount() == 1 && malformed.IsSaveing, "bad data cannot prevent another character's success");
    clock += 5000;
    PlayerDataService.ProcessSaveQueue();
    Check(Unknown(malformedId), "malformed response does not become a fabricated rejection");
    await Ack(malformedId);
    Pass("malformed production decoder input cannot starve another character or manufacture a save outcome");

    Reset();
    var exhausted = Record("queue_exhausted", 90);
    var blocked = Record("QUEUE_EXHAUSTED", 91);
    Add(exhausted, blocked);
    for (int attempt = 0; attempt < 50; attempt++)
    {
        await Tick();
        Request request = await peer.Read();
        await peer.Send(request.QueryId, Messages.DBR_LOADHUMANRCD, 0);
        await WaitReply(request.QueryId);
        PlayerDataService.ProcessSaveQueue();
        clock += 1000;
    }
    await Tick();
    Check(exhausted.ReTryCount == 50 && !exhausted.IsSaveing && blocked.ReTryCount == 0 && !Front().IsIdle(),
        "bounded retries must retain a terminal failure barrier instead of clearing it");
    var stillHealthy = Record("queue_after_exhaustion", 92);
    Add(stillHealthy);
    await Tick();
    Request afterExhaustion = await peer.Read();
    await Ack(afterExhaustion.QueryId);
    Check(Front().SaveListCount() == 2, "another character completes despite the exhausted record");
    Pass("50 rejected attempts stop retrying without reporting saved or blocking unrelated characters");

    Reset();
    int lastIssued = (int)PrivateField("LastIssuedQueryId").GetValue(null)!;
    SystemShare.Config.DBQueryID = 0;
    var wrapA = Record("queue_wrap_a", 100);
    var wrapB = Record("queue_wrap_b", 101);
    Add(wrapA);
    await Tick();
    Request wrapFirst = await peer.Read();
    Check(wrapFirst.QueryId > lastIssued, "configuration reset cannot reuse a historical query");
    SystemShare.Config.DBQueryID = 0;
    Add(wrapB);
    await Tick();
    Request wrapNext = await peer.Read();
    Check(wrapNext.QueryId > wrapFirst.QueryId && wrapA.QueryId == wrapFirst.QueryId,
        "live IDs stay monotonic across mutable configuration resets");
    await Ack(wrapNext.QueryId);
    await Ack(wrapFirst.QueryId);
    Pass("query IDs never wrap or reuse during this process lifetime, including configuration resets");

    Reset();
    var concurrent = Record("queue_concurrent", 110);
    Add(concurrent);
    bool[] results = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ => Task.Run(() =>
        PlayerDataService.SaveCharacterData(concurrent, ref concurrent.QueryId))));
    Request concurrentRequest = await peer.Read();
    Check(results.Count(result => result) == 1 && concurrent.ReTryCount == 1, "concurrent submissions send exactly one attempt");
    await Ack(concurrentRequest.QueryId);
    Pass("concurrent production save calls publish one in-flight attempt per record");

    Reset();
    int loadOne = 0, loadTwo = 0;
    Check(PlayerDataService.QueryCharacterData("queue_test", "load_one", "127.0.0.1", ref loadOne, 1), "queue first load");
    Check(PlayerDataService.QueryCharacterData("queue_test", "load_two", "127.0.0.1", ref loadTwo, 1), "queue second load");
    Request[] loads = [await peer.Read(), await peer.Read()];
    Check(loads.All(request => request.Header.Ident == Messages.DB_LOADHUMANRCD) && loadOne != loadTwo, "real load identities remain distinct");
    await peer.Send(loadOne, Messages.DBR_LOADHUMANRCD, 1, LoadPacket("load_one", 120));
    await WaitReply(loadOne);
    PlayerDataService.ProcessQueryQueue();
    await peer.Send(loadTwo, Messages.DBR_LOADHUMANRCD, 1, LoadPacket("load_two", 121));
    await WaitReply(loadTwo);
    PlayerDataService.ProcessQueryQueue();
    CharacterDataInfo loadedOne = null!, loadedTwo = null!;
    Check(PlayerDataService.GetPlayData(loadOne, ref loadedOne) && PlayerDataService.GetPlayData(loadTwo, ref loadedTwo)
        && loadedOne.Data.CurX == 120 && loadedTwo.Data.CurX == 121, "processing one load cannot dequeue the next load's identity");
    Pass("load/save shared query tracking does not drop the next queued load response");

    Reset();
    actor = new PlayObject();
    var frozen = Record("queue_frozen", 125, actor);
    CharacterDataInfo mutable = frozen.CharacterData;
    mutable.Data.StatusTimeArr[0] = 3;
    mutable.Data.BonusAbil.DC = 4;
    mutable.Data.QuestUnitOpen[0] = 5;
    mutable.Data.QuestUnit[0] = 6;
    mutable.Data.QuestFlag[0] = 7;
    mutable.Data.BagItems[0] = new ServerUserItem { Index = 1, MakeIndex = 100, Desc = new byte[14] };
    mutable.Data.BagItems[0].Desc[0] = 8;
    Add(frozen);
    Add(frozen);
    mutable.Data.StatusTimeArr[0] = 30;
    mutable.Data.BonusAbil.DC = 40;
    mutable.Data.QuestUnitOpen[0] = 50;
    mutable.Data.QuestUnit[0] = 60;
    mutable.Data.QuestFlag[0] = 70;
    mutable.Data.BagItems[0].Desc[0] = 80;
    Check(Front().SaveListCount() == 1 && ReferenceEquals(frozen.PlayObject, actor), "duplicate enqueue is idempotent and retains the real actor link");
    await Tick();
    Request frozenRequest = await peer.Read();
    CheckFrozen(frozenRequest.Snapshot!.CharacterData);
    await peer.Send(frozenRequest.QueryId, Messages.DBR_LOADHUMANRCD, 0);
    await WaitReply(frozenRequest.QueryId);
    PlayerDataService.ProcessSaveQueue();
    mutable.Data.StatusTimeArr[0] = 99;
    mutable.Data.BagItems[0].Desc[0] = 99;
    clock += 1000;
    await Tick();
    Request frozenRetry = await peer.Read();
    CheckFrozen(frozenRetry.Snapshot!.CharacterData);
    await Ack(frozenRetry.QueryId);
    Check(actor.RcdSaved, "frozen data success updates the original actor, not a cloned actor");
    Pass("production enqueue deep-freezes status/bonus/quest/item Desc buffers and retries the same immutable wire snapshot");

    Reset();
    actor = new PlayObject { RcdSaved = true };
    var invalidClone = Record("queue_clone_failure", 126, actor);
    invalidClone.CharacterData = null!;
    var cloneIndependent = Record("queue_clone_independent", 127);
    Add(invalidClone, cloneIndependent);
    await Tick();
    Request cloneIndependentRequest = await peer.Read();
    Check(cloneIndependentRequest.Snapshot!.ChrName == "queue_clone_independent", "invalid clone cannot starve unrelated snapshots");
    await Ack(cloneIndependentRequest.QueryId);
    Check(Front().SaveListCount() == 1 && invalidClone.QueryId == 0 && invalidClone.ReTryCount == 0
        && !actor.RcdSaved && !Front().IsIdle(), "clone failure retains the original record as an unsent failure barrier");
    Pass("snapshot clone failure never drops data, sends mutable data or reports RcdSaved");

    Reset();
    var fragmented = Record("queue_fragmented", 130);
    Add(fragmented);
    await Tick();
    Request fragmentedRequest = await peer.Read();
    await peer.SendPartial(fragmentedRequest.QueryId);
    await Wait(() => (int)typeof(DataQueryServer).GetProperty("BuffLen", BindingFlags.NonPublic | BindingFlags.Instance)!
        .GetValue(GameShare.DataServer)! > 0, "actual half reply did not enter the receive buffer");
    await peer.Disconnect();
    clock += 5000;
    var notSent = Record("queue_after_disconnect", 131);
    Add(notSent);
    await Tick();
    Check(notSent.ReTryCount == 0 && fragmented.IsSaveing && Unknown(fragmentedRequest.QueryId),
        "offline unsent data is retained independently of the uncertain half reply");
    await peer.Connect(); // Accepts automatic reconnect; deliberately never calls Start again.
    Check((int)typeof(DataQueryServer).GetProperty("BuffLen", BindingFlags.NonPublic | BindingFlags.Instance)!
        .GetValue(GameShare.DataServer)! == 0, "new TCP connection must start with no old partial bytes");
    await Tick();
    Request automatic = await peer.Read();
    Check(automatic.Snapshot!.ChrName == "queue_after_disconnect" && fragmented.ReTryCount == 1,
        "actual automatic reconnect sends unsent data but does not resend the unknown snapshot");
    await peer.SendTogether((fragmentedRequest.QueryId, Messages.DBR_SAVEHUMANRCD, 1),
        (automatic.QueryId, Messages.DBR_SAVEHUMANRCD, 1));
    await WaitReply(fragmentedRequest.QueryId);
    await WaitReply(automatic.QueryId);
    PlayerDataService.ProcessSaveQueue();
    Check(Front().IsIdle(), "new complete coalesced frames must not be corrupted by old partial data or buffer capacity");
    Pass("real half-frame disconnect resets buffering; automatic reconnect sends only unsent data and parses new coalesced ACKs");

    Reset();
    SystemShare.Config.DBQueryID = int.MaxValue - 1;
    var idExhausted = Record("queue_id_exhausted", 140);
    Add(idExhausted);
    await Tick();
    Check(!idExhausted.IsSaveing && idExhausted.ReTryCount == 0 && idExhausted.QueryId == 0 && !Front().IsIdle(),
        "32-bit query exhaustion must keep the data without wrapping onto historical identities");
    Pass("query identity exhaustion fails closed and preserves the unsent save barrier");

    GameShare.DataServer.Stop();
    await Task.Delay(1250);
    Check(!GameShare.DataServer.IsConnected && !peer.PendingConnection(), "manual Stop disables the polling reconnect mechanism");
    Pass("manual DataQueryServer.Stop prevents automatic reconnection");

    // A separate actual DataQueryServer verifies failed initial startup, which the
    // passive-disconnect-only reconnection helper would not cover.
    var unavailable = new TcpListener(IPAddress.Loopback, 0);
    unavailable.Start();
    int offlinePort = ((IPEndPoint)unavailable.LocalEndpoint).Port;
    unavailable.Stop();
    SystemShare.Config.nDBPort = offlinePort;
    var initiallyOffline = new DataQueryServer();
    initiallyOffline.Initialize();
    try
    {
        await initiallyOffline.Start();
        Check(!initiallyOffline.IsConnected, "initial TCP refusal stays disconnected");
        unavailable = new TcpListener(IPAddress.Loopback, offlinePort);
        unavailable.Start();
        using TcpClient recoveredClient = await unavailable.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(5));
        await Wait(() => initiallyOffline.IsConnected, "automatic reconnect did not recover failed initial startup");
        Pass("TouchSocket polling reconnect recovers an initially unavailable DB without a second Start call");
        initiallyOffline.Stop();
        await Task.Delay(1250);
        Check(!initiallyOffline.IsConnected && !unavailable.Pending(), "Stop prevents reconnection after initial-startup recovery");
        Pass("Stop also disables reconnection after recovering failed initial startup");
    }
    finally { initiallyOffline.Stop(); unavailable.Stop(); }

    Console.WriteLine($"RESULT groups={groups} passed={groups} failed=0 scope=production-queue-and-isolated-tcp; mysql/native-host/shutdown-not-run");
}
finally
{
    sendField.SetValue(null, originalSend);
    clockField.SetValue(null, originalClock);
    GameShare.DataServer.Stop();
}

FrontEngine Front() => (FrontEngine)M2Share.FrontEngine;
void Reset()
{
    M2Share.FrontEngine = new FrontEngine();
    foreach (string field in new[] { "QueryMap", "PendingSaves", "OutstandingQueries", "OutstandingLoads", "SaveRetryAt", "LoadPlayDataMap", "QueryProcessList" })
    {
        object value = PrivateField(field).GetValue(null)!;
        value.GetType().GetMethod("Clear")!.Invoke(value, null);
    }
    sendField.SetValue(null, originalSend);
    clock += 10000;
}
void Add(params SavePlayerRcd[] records) { foreach (SavePlayerRcd record in records) Front().AddToSaveRcdList(record); }
async Task Tick() => await (Task)typeof(CharacterDataProcessor).GetMethod("ExecuteInternal", BindingFlags.NonPublic | BindingFlags.Instance)!
    .Invoke(processor, [CancellationToken.None])!;
async Task Ack(int id)
{
    await peer.Send(id, Messages.DBR_SAVEHUMANRCD, 1);
    await WaitReply(id);
    PlayerDataService.ProcessSaveQueue();
}
async Task WaitReply(int id)
{
    object replies = PrivateField("QueryMap").GetValue(null)!;
    MethodInfo contains = replies.GetType().GetMethod("ContainsKey")!;
    await Wait(() => (bool)contains.Invoke(replies, [id])!, "actual TCP reply was not dispatched to the requested ID");
}
bool Unknown(int id)
{
    object pending = PrivateField("PendingSaves").GetValue(null)!;
    object entry = pending.GetType().GetProperty("Item")!.GetValue(pending, [id])!;
    return (bool)entry.GetType().GetField("ResultUnknown")!.GetValue(entry)!;
}
void Pass(string description) { groups++; Console.WriteLine("PASS " + description); }
static FieldInfo PrivateField(string name) => typeof(PlayerDataService).GetField(name, BindingFlags.Static | BindingFlags.NonPublic)!;
static SavePlayerRcd Record(string name, short x, PlayObject? actor = null)
{
    var record = new SavePlayerRcd { Account = "queue_test", ChrName = name, SessionID = 123, PlayObject = actor };
    record.CharacterData.Header.SetName(name);
    record.CharacterData.Data.ChrName = name;
    record.CharacterData.Data.Account = "queue_test";
    record.CharacterData.Data.CurX = x;
    return record;
}
static byte[] LoadPacket(string name, short x) => EDCode.EncodeBuffer(SerializerUtil.Serialize(new LoadPlayerDataPacket
{
    ChrName = EDCode.EncodeString(name), HumDataInfo = Record(name, x).CharacterData
}));
static void CheckFrozen(CharacterDataInfo snapshot)
{
    Check(snapshot.Data.StatusTimeArr[0] == 3 && snapshot.Data.BonusAbil.DC == 4
        && snapshot.Data.QuestUnitOpen[0] == 5 && snapshot.Data.QuestUnit[0] == 6
        && snapshot.Data.QuestFlag[0] == 7 && snapshot.Data.BagItems[0].Desc[0] == 8,
        "actor-owned mutations changed an already queued snapshot");
}
static void Check(bool condition, string message) { if (!condition) throw new Exception("FAIL " + message); }
static async Task Wait(Func<bool> condition, string error)
{
    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    while (!condition())
    {
        try { await Task.Delay(5, timeout.Token); }
        catch (OperationCanceledException) { throw new Exception("FAIL " + error); }
    }
}

sealed record Request(int QueryId, ServerRequestMessage Header, SaveCharacterData? Snapshot);
sealed class DatabasePeer : IAsyncDisposable
{
    TcpListener listener = new(IPAddress.Loopback, 0);
    readonly int port;
    bool listening = true;
    TcpClient? client;
    NetworkStream? stream;
    public DatabasePeer()
    {
        listener.Start();
        port = ((IPEndPoint)listener.LocalEndpoint).Port;
    }
    public async Task Connect()
    {
        if (!listening)
        {
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            listening = true;
        }
        SystemShare.Config.sDBAddr = "127.0.0.1";
        SystemShare.Config.nDBPort = ((IPEndPoint)listener.LocalEndpoint).Port;
        bool first = client is null;
        if (first) GameShare.DataServer.Initialize();
        Task<TcpClient> accept = listener.AcceptTcpClientAsync();
        if (first) await GameShare.DataServer.Start();
        client = await accept.WaitAsync(TimeSpan.FromSeconds(5));
        stream = client.GetStream();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        while (!GameShare.DataServer.IsConnected)
            await Task.Delay(5, timeout.Token);
    }
    public async Task Disconnect()
    {
        listener.Stop();
        listening = false;
        stream!.Close();
        client!.Close();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        while (GameShare.DataServer.IsConnected)
            await Task.Delay(5, timeout.Token);
    }
    public async Task<Request> Read()
    {
        byte[] head = new byte[ServerDataPacket.FixedHeaderLen];
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await stream!.ReadExactlyAsync(head, timeout.Token);
        ServerDataPacket outer = SerializerUtil.Deserialize<ServerDataPacket>(head);
        byte[] payload = new byte[outer.PacketLen];
        await stream.ReadExactlyAsync(payload, timeout.Token);
        ServerRequestData packet = SerializerUtil.Deserialize<ServerRequestData>(payload);
        ServerRequestMessage header = SerializerUtil.Deserialize<ServerRequestMessage>(EDCode.DecodeBuff(packet.Message));
        SaveCharacterData? save = header.Ident == Messages.DB_SAVEHUMANRCD
            ? SerializerUtil.Deserialize<SaveCharacterData>(EDCode.DecodeBuff(packet.Packet)) : null;
        return new Request(packet.QueryId, header, save);
    }
    public Task Send(int id, int ident, int recog, byte[]? body = null) => SendRaw(id,
        EDCode.EncodeBuffer(SerializerUtil.Serialize(new ServerRequestMessage(ident, recog, 0, 0, 0))), body ?? []);
    public async Task SendRaw(int id, byte[] message, byte[] body)
    {
        await stream!.WriteAsync(Frame(id, message, body));
    }
    static byte[] Frame(int id, byte[] message, byte[] body)
    {
        var packet = new ServerRequestData { QueryId = id, Message = message, Packet = body };
        int check = HUtil32.MakeLong((ushort)(id ^ 170), (ushort)(message.Length + body.Length + ServerDataPacket.FixedHeaderLen));
        packet.Sign = EDCode.EncodeBuffer(BitConverter.GetBytes(check));
        byte[] payload = SerializerUtil.Serialize(packet);
        byte[] head = SerializerUtil.Serialize(new ServerDataPacket { PacketCode = Grobal2.PacketCode, PacketLen = (ushort)payload.Length });
        return head.Concat(payload).ToArray();
    }
    public async Task SendPartial(int id)
    {
        byte[] frame = Frame(id, EDCode.EncodeBuffer(SerializerUtil.Serialize(new ServerRequestMessage(Messages.DBR_SAVEHUMANRCD, 1, 0, 0, 0))), []);
        await stream!.WriteAsync(frame.AsMemory(0, frame.Length / 2));
    }
    public async Task SendTogether(params (int Id, int Ident, int Recog)[] responses)
    {
        byte[] frames = responses.SelectMany(response => Frame(response.Id,
            EDCode.EncodeBuffer(SerializerUtil.Serialize(new ServerRequestMessage(response.Ident, response.Recog, 0, 0, 0))), [])).ToArray();
        await stream!.WriteAsync(frames);
    }
    public bool PendingConnection() => listening && listener.Pending();
    public ValueTask DisposeAsync()
    {
        stream?.Dispose(); client?.Dispose(); listener.Stop();
        return ValueTask.CompletedTask;
    }
}
