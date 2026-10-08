using static Harness;
using System.Collections;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using GameSrv;
using GameSrv.Services;
using GameSrv.Word;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using M2Server;
using M2Server.Net;
using M2Server.Net.TCP;
using M2Server.Maps;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Data;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using Serilog;
using SystemModule;
using SystemModule.Actors;
using SystemModule.Data;
using SystemModule.Maps;

// Every scenario is a separate process: production GameShare timers are one-shot.
// Only private loopback listeners, real production queues and in-memory actor data are used.
// Initialization/config/SQL/auth/planes startup are deliberately excluded by the transport seam.
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().CreateLogger();
if (args.Length == 0)
{
    foreach (string scenario in new[] { "network", "empty", "trade", "producerRace", "unknown", "negative", "freezeFailure", "slowFreeze", "busyWorker", "stopFailure", "loads", "multiLoads", "terminalLoad", "snapshotFailure", "goldFailure", "monsters" })
    {
        var info = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false };
        info.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
        info.ArgumentList.Add(scenario);
        using Process child = Process.Start(info)!;
        await child.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(45));
        Check(child.ExitCode == 0, "isolated scenario failed: " + scenario);
    }
    Console.WriteLine("SUMMARY all isolated shutdown scenarios passed");
    return;
}
string mode = args[0];
if (mode == "network")
{
    using var provider = new ServiceCollection().BuildServiceProvider();
    _ = new GameApp(provider);
    var channel = NewChannel();
    for (int i = 0; i < 128; i++) channel.AddGameGateQueue(99, new ServerMessage(), []);
    Check(QueueCount(channel) == 128, "actual pre-start receive queue is nonempty");
    await Task.WhenAll(channel.StopAsync(), channel.StopAsync(), channel.QuiesceAsync()).WaitAsync(TimeSpan.FromSeconds(3));
    Check(channel.IsStopped && channel.IsQuiesced && QueueCount(channel) == 0 && QueueCompleted(channel), "nonempty channel must drain and complete before stop");
    Pass("real TCPNetChannel nonempty pre-start queue completes writer and reader; concurrent stop/quiesce returns");
    channel = NewChannel();
    await channel.Start();
    for (int i = 0; i < 1000; i++) channel.AddGameGateQueue(99, new ServerMessage(), []);
    await Task.WhenAll(channel.StopAsync(), channel.StopAsync(), channel.StopAsync()).WaitAsync(TimeSpan.FromSeconds(3));
    Check(channel.IsStopped && QueueCompleted(channel), "started consumer joins and completes");
    channel.AddGameGateQueue(99, new ServerMessage(), []);
    Check(QueueCount(channel) == 0, "commands after writer completion cannot be executed");
    bool failed = false;
    try { await channel.Start(); } catch (InvalidOperationException) { failed = true; }
    Check(failed, "stopped channel must not restart command dispatch");
    Pass("real started TCPNetChannel joins its tracked consumer exactly once and rejects post-quiesce commands/restart");
    return;
}

await using var fixture = new Fixture();
var app = fixture.App;
var world = fixture.World;
var front = fixture.Front;
var peer = fixture.Peer;
var options = new ShutdownOptions { AttemptTimeout = TimeSpan.FromMilliseconds(2000), AdmissionDelay = TimeSpan.Zero,
    PollInterval = TimeSpan.FromMilliseconds(10), HostRetryDelay = TimeSpan.FromMilliseconds(20) };
var service = new AppService(app, shutdownOptions: options);
switch (mode)
{
    case "empty":
    {
        using var startup = new CancellationTokenSource();
        await fixture.Start(true, startup.Token);
        startup.Cancel();
        await Task.Delay(80);
        Check(GameShare.CharacterDataProcessor.ExecuteTask?.IsCompleted == false, "host startup token cannot end storage ACK processing");
        Pass("actual ServerBase.StartUp separates storage lifetime from an externally cancelled startup token");
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        Check((await service.RequestShutdownAsync(cancelled.Token)).Reason == "not_started" && !front.ShutdownRequested && !world.IsShutdownFrozen,
            "cancelled request before start cannot initiate shutdown");
        Pass("request cancelled before dispatch makes no admission, freeze or snapshot changes");
        ShutdownResult[] result = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => service.RequestShutdownAsync()));
        Check(result.All(r => r.Succeeded && r.State.Drained), "all joined attempts must report a genuine drained stop");
        Check(app.StopTransportCalls == 1 && fixture.Module.StopCalls == 1 && !GameShare.DataServer.IsConnected,
            "actual DB disconnect follows one complete stop, with one module finalization");
        Check(GameShare.CharacterDataProcessor.ExecuteTask!.IsCompleted && fixture.Channel.IsStopped, "real workers and channel must have ended");
        Check((await service.RequestShutdownAsync()).Succeeded && app.StopTransportCalls == 1, "completed shutdown is idempotent");
        Check((await service.RequestShutdownAsync(cancelled.Token)).Succeeded, "known completed shutdown takes precedence over a newly cancelled waiter");
        Pass("actual AppService concurrent empty-world shutdown freezes, finalizes empty snapshots and stops storage/DB/network once");
        break;
    }
    case "trade":
    {
        await fixture.Start();
        PlayObject a = fixture.Actor("trade_a", 100), b = fixture.Actor("trade_b", 200);
        a.Dealing = b.Dealing = true; a.DealCreat = b; b.DealCreat = a;
        a.DealGolds = 30; b.DealGolds = 40;
        a.DealItemList.Add(new UserItem { Index = 1, MakeIndex = 70001, Dura = 123 });
        b.DealItemList.Add(new UserItem { Index = 2, MakeIndex = 70002, Dura = 456 });
        fixture.Module.OnStop = () => a.Gold += 50;
        Task<ShutdownResult> stopping = service.RequestShutdownAsync();
        Request[] requests = [await peer.Read(), await peer.Read()];
        foreach (Request r in requests)
        {
            CharacterData d = r.Snapshot!.CharacterData.Data;
            Check(d.Gold == (d.ChrName == "trade_a" ? 180 : 240), "module finalization and actual DealCancelA refund must precede every final snapshot");
            Check(d.BagItems[0].MakeIndex == (d.ChrName == "trade_a" ? 70001 : 70002), "actual escrow item returned before final snapshot");
            Check(d.Abil.HP == (d.ChrName == "trade_a" ? 71 : 72), "final snapshot includes actual WAbil health");
        }
        Check(a.DealGolds == 0 && b.DealGolds == 0 && !a.Dealing && !b.Dealing && a.DealItemList.Count == 0 && b.DealItemList.Count == 0,
            "both actual actor escrow stores have settled");
        Pass("real PlayObject.DealCancelA refunds both trade participants and items before actual serialized final snapshots");
        Check(fixture.Module.StopCalls == 1 && a.Gold == 180, "actual module callback changes are included exactly once before final snapshots");
        Pass("actual module final callback completes before final snapshot capture and remains idempotent across shutdown retry");
        WorldServer.SaveHumanRcd(a);
        Check(front.SaveListCount() == 2, "ordinary actor save is blocked after final snapshot phase");
        ShutdownResult timed = await stopping;
        Check(timed.Outcome == ShutdownOutcome.TimedOut && world.IsShutdownFrozen && front.SaveListCount() == 2 && app.StopTransportCalls == 0,
            "timeout cannot disconnect DB or count pending saves as stopped");
        Task<ShutdownResult> retry = service.RequestShutdownAsync();
        Check(front.SaveListCount() == 2, "retry cannot generate duplicate final snapshots");
        await peer.Send(requests[1].QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        await Wait(() => front.SaveListCount() == 1, "one matching ACK leaves the other record pending");
        Check(!retry.IsCompleted && app.StopTransportCalls == 0, "first ACK cannot complete the overall stop");
        await peer.Send(requests[0].QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        Check((await retry).Succeeded && a.RcdSaved && b.RcdSaved, "only both real ACKs complete shutdown");
        Pass("timeout/retry preserves exactly one final snapshot per actor; out-of-order real TCP ACKs complete only after both saves");
        break;
    }
    case "unknown":
    {
        await fixture.Start();
        var record = Record("prior_unknown"); front.AddToSaveRcdList(record);
        Task<ShutdownResult> attempt = service.RequestShutdownAsync();
        Request request = await peer.Read();
        ShutdownResult timed = await attempt;
        Check(timed.Outcome == ShutdownOutcome.TimedOut && timed.State.Saves == 1 && app.StopTransportCalls == 0, "zero online actors cannot bypass a preexisting save");
        Pass("zero online players with an actual pending native save remain frozen and connected after the console deadline");
        using var caller = new CancellationTokenSource(40);
        ShutdownResult cancelled = await service.RequestShutdownAsync(caller.Token);
        Check(cancelled.Outcome == ShutdownOutcome.Cancelled && cancelled.Reason == "caller_result_unknown" && front.SaveListCount() == 1,
            "caller cancellation cannot remove or resend the real native attempt");
        await Wait(() => PlayerDataService.UnknownSaveCount == 1, "actual native five-second timeout must become unknown", 8000);
        Check(record.QueryId == request.QueryId && record.ReTryCount == 1 && !record.PlayObject!.RcdSaved && !fixture.Channel.IsStopped,
            "unknown save identity remains pinned and is not retried");
        Pass("actual five-second unknown result and waiter cancellation preserve the exact query, snapshot and RcdSaved barrier");
        using var cancelledHost = new CancellationTokenSource(); cancelledHost.Cancel();
        Task host = service.StoppingAsync(cancelledHost.Token);
        await Task.Delay(100);
        Check(!host.IsCompleted && GameShare.DataServer.IsConnected && GameShare.CharacterDataProcessor.ExecuteTask!.IsCompleted == false,
            "cancelled host stop must keep real ACK worker alive until data is confirmed");
        await peer.Send(request.QueryId + 9000, Messages.DBR_SAVEHUMANRCD, 1);
        await Task.Delay(80);
        Check(front.SaveListCount() == 1 && !host.IsCompleted, "uncorrelated ACK cannot release the shutdown barrier");
        await peer.Send(request.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        await host.WaitAsync(TimeSpan.FromSeconds(3));
        Check(service.LastShutdownResult!.Succeeded && app.StopTransportCalls == 1 && record.PlayObject.RcdSaved, "matching late ACK releases real host stop");
        Pass("actual host StoppingAsync ignores expired cancellation as success; unknown/foreign ACK stays blocked and matching late ACK drains and stops");
        break;
    }
    case "producerRace":
    {
        await fixture.Start();
        service = LoadService(app);
        PlayObject actor = fixture.Actor("producer_actor", 100); actor.Dealing = true; actor.DealGolds = 30;
        fixture.Module.OnStop = () => actor.Gold += 50;
        object snapshotGate = typeof(WorldServer).GetField("_shutdownGate", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(world)!;
        using var hold = new HeldLock(front.UserCriticalSection);
        Task producer = Task.Run(() => WorldServer.SaveHumanRcd(actor));
        await Wait(() => HeldByAnotherThread(snapshotGate), "actual ordinary save producer holds the world snapshot gate before enqueue");
        Task<ShutdownResult> attempt = service.RequestShutdownAsync();
        await Task.Delay(80);
        Check(!world.IsShutdownFrozen && !attempt.IsCompleted, "freeze must wait for the already admitted real snapshot producer");
        hold.Release(); await producer;
        Request older = await peer.Read();
        Check(older.Snapshot!.CharacterData.Data.Gold == 100, "prefreeze original snapshot is first, before final refund and module callback");
        await peer.Send(older.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        Request final = await peer.Read();
        Check(final.Snapshot!.CharacterData.Data.Gold == 180 && final.QueryId > older.QueryId && !actor.RcdSaved,
            "actual final snapshot follows the original producer and includes refund plus final callback");
        await peer.Send(final.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        Check((await attempt).Succeeded && actor.RcdSaved && front.IsIdle(), "both actual ordered snapshots confirm before stop");
        Pass("real blocked ordinary SaveHumanRcd producer serializes with freeze; old snapshot cannot enqueue after refunded final snapshot or overwrite it later");
        break;
    }
    case "negative":
    {
        await fixture.Start();
        PlayObject actor = fixture.Actor("negative_actor", 501);
        Task<ShutdownResult> attempt = service.RequestShutdownAsync();
        Request first = await peer.Read();
        Check(!PlayerDataService.RetireLoad(first.QueryId) && PlayerDataService.PendingSaveCount == 1,
            "load retirement cannot remove an active save query");
        await peer.Send(first.QueryId, Messages.DBR_LOADHUMANRCD, 0);
        ShutdownResult failed = await attempt;
        Check(!failed.Succeeded && front.SaveListCount() == 1 && !actor.RcdSaved && app.StopTransportCalls == 0, "1100/0 cannot be reported as a saved stop");
        Task<ShutdownResult> retry = service.RequestShutdownAsync();
        Request second = await peer.Read();
        Check(second.QueryId != first.QueryId && second.Snapshot!.CharacterData.Data.Gold == 501 && front.SaveListCount() == 1,
            "known rejection retries the same frozen snapshot with a fresh query identity");
        await peer.Send(first.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        await Task.Delay(80);
        Check(!retry.IsCompleted && !actor.RcdSaved, "retired rejection ACK cannot complete the retry");
        await peer.Send(second.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        Check((await retry).Succeeded && actor.RcdSaved, "confirmed retry closes the stop");
        Pass("actual 1100/0 preserves failed stop and frozen snapshot; fresh native retry ignores retired ACK and accepts matching 1102/1");
        break;
    }
    case "freezeFailure":
    {
        await fixture.Start(); fixture.Module.ThrowNext = true;
        ShutdownResult first = await service.RequestShutdownAsync();
        Check(first.Outcome == ShutdownOutcome.Failed && !world.IsShutdownFrozen && front.ShutdownRequested && fixture.Channel.IsQuiesced,
            "module failure preserves admission/network barriers without pretending full world freeze");
        Check(app.StopTransportCalls == 0 && GameShare.DataServer.IsConnected && GameShare.CharacterDataProcessor.ExecuteTask!.IsCompleted == false,
            "module failure cannot stop ACK processing");
        ShutdownResult second = await service.RequestShutdownAsync();
        Check(second.Succeeded && fixture.Module.StopCalls == 2 && app.StopTransportCalls == 1, "failed freeze stage actually retries instead of retaining faulted task");
        Pass("actual ServerBase module stop throw preserves partial barriers and real storage worker; retry repeats only incomplete freeze stage");
        break;
    }
    case "stopFailure":
    {
        await fixture.Start(); app.ThrowStopOnce = true;
        ShutdownResult first = await service.RequestShutdownAsync();
        Check(first.Outcome == ShutdownOutcome.Failed && first.State.Drained && world.IsShutdownFrozen && GameShare.DataServer.IsConnected,
            "transport finalization failure cannot announce successful stop");
        Check(GameShare.CharacterDataProcessor.ExecuteTask!.IsCompleted && fixture.Channel.IsStopped, "already completed final stages remain complete");
        Check((await service.RequestShutdownAsync()).Succeeded && app.StopTransportCalls == 2 && fixture.Module.StopCalls == 1,
            "failed connection stop can retry without redoing completed module/snapshot stages");
        Pass("actual final connection failure is retryable; drained snapshots and completed workers are idempotent and goodbye remains withheld until completion");
        break;
    }
    case "slowFreeze":
    {
        await fixture.Start();
        using var entered = new ManualResetEventSlim(); using var release = new ManualResetEventSlim();
        fixture.Module.OnStop = () => { entered.Set(); release.Wait(); };
        Stopwatch watch = Stopwatch.StartNew();
        Task<ShutdownResult> pending = service.RequestShutdownAsync();
        Check(entered.Wait(TimeSpan.FromSeconds(2)), "actual synchronous module callback entered");
        ShutdownResult first = await pending;
        Check(first.Outcome == ShutdownOutcome.TimedOut && watch.Elapsed < TimeSpan.FromSeconds(3) && !world.IsShutdownFrozen &&
            GameShare.DataServer.IsConnected && fixture.Module.StopCalls == 1, "console timeout is bounded while the genuine freeze callback is still running");
        Task<ShutdownResult> retry = service.RequestShutdownAsync(); release.Set();
        Check((await retry).Succeeded && fixture.Module.StopCalls == 1, "retry joins the in-flight freeze stage rather than duplicating it");
        Pass("slow real module callback does not block console deadline; timed-out freeze continues safely and retry joins one actual callback");
        break;
    }
    case "busyWorker":
    {
        await fixture.Start();
        object gate = typeof(GameSrv.Word.Threads.CharacterDataProcessor).GetField("_processingGate", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(GameShare.CharacterDataProcessor)!;
        using var hold = new HeldLock(gate);
        Stopwatch watch = Stopwatch.StartNew();
        ShutdownResult first = await service.RequestShutdownAsync();
        Check(first.Outcome == ShutdownOutcome.TimedOut && first.State.Processing && !first.State.Drained && watch.Elapsed < TimeSpan.FromSeconds(3),
            "busy production worker must be reported conservatively without blocking request deadline");
        Check(GameShare.DataServer.IsConnected && app.StopTransportCalls == 0, "busy worker cannot be cancelled into a successful stop");
        hold.Release();
        Check((await service.RequestShutdownAsync()).Succeeded, "actual worker release permits the shared freeze/drain to finish");
        Pass("actual storage processing gate stays live through timeout; diagnostics mark in-progress counts and never infer an empty drain");
        break;
    }
    case "loads":
    {
        await fixture.Start();
        service = new AppService(app, shutdownOptions: new ShutdownOptions { AttemptTimeout = TimeSpan.FromSeconds(5), AdmissionDelay = TimeSpan.Zero, PollInterval = TimeSpan.FromMilliseconds(10) });
        fixture.AddWalkableMap();
        PlayObject actor = fixture.Actor("load_guard", 149);
        var loaded = new PlayObject { UserAccount = "shutdown_test", ChrName = "load_pending", Gold = 333, MapName = "fixture", HomeMap = "fixture", CurrX = 15, CurrY = 15 };
        loaded.WAbil.HP = loaded.WAbil.MaxHP = loaded.Abil.HP = loaded.Abil.MaxHP = 90;
        loaded.Abil.Level = 10;
        CharacterDataInfo snapshot = (CharacterDataInfo)typeof(WorldServer).GetMethod("MakeSaveRcd", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, [loaded])!;
        front.AddToLoadRcdList(new LoadDBInfo { Account = "shutdown_test", ChrName = "load_pending", SessionID = 999, sIPaddr = "127.0.0.1" });
        Task<ShutdownResult> attempt = service.RequestShutdownAsync();
        Request load = await peer.Read();
        await Wait(() => world.IsShutdownFrozen, "world freeze before draining existing loads");
        Check(front.IsIdle() && !GameShare.CharacterDataProcessor.TryFinalizeShutdownSnapshots() && !world.ShutdownFinalSnapshotsComplete,
            "empty save list cannot bypass native load processing");
        byte[] body = EDCode.EncodeBuffer(SerializerUtil.Serialize(new LoadPlayerDataPacket { ChrName = EDCode.EncodeString("load_pending"), HumDataInfo = snapshot }));
        await peer.Send(load.QueryId, Messages.DBR_LOADHUMANRCD, 1, body);
        Request[] saved = [await peer.Read(), await peer.Read()];
        Check(world.PlayObjectCount == 2 && PlayerDataService.PendingLoadCount == 0 && world.LoadPlayCount == 0,
            "actual WorldServer new-human initialization must settle before either final snapshot");
        Check(saved.Single(r => r.Snapshot!.ChrName == "load_pending").Snapshot!.CharacterData.Data.Gold == 333 &&
            saved.Single(r => r.Snapshot!.ChrName == "load_guard").Snapshot!.CharacterData.Data.Gold == 149,
            "actual loaded character and existing actor are both in final save pass");
        foreach (Request r in saved) await peer.Send(r.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        Check((await attempt).Succeeded, "load drain then save ACK completes actual AppService");
        Pass("actual admitted FrontEngine load and TCP reply run WorldServer new-human initialization before all loaded/existing actor final snapshots");
        break;
    }
    case "snapshotFailure":
    {
        await fixture.Start();
        PlayObject actor = fixture.Actor("escrow_guard", 100);
        actor.DealGolds = 33; // Inconsistent escrow: real DealCancelA must not silently discard it.
        ShutdownResult first = await service.RequestShutdownAsync();
        Check(first.Outcome == ShutdownOutcome.Failed && world.IsShutdownFrozen && !world.ShutdownFinalSnapshotsComplete && front.IsIdle(),
            "unreturned escrow prevents all final snapshots even though save queue is empty");
        Check(app.StopTransportCalls == 0 && GameShare.DataServer.IsConnected, "failed actor finalization cannot close native DB");
        actor.Dealing = true;
        Task<ShutdownResult> retry = service.RequestShutdownAsync();
        Request saved = await peer.Read();
        Check(saved.Snapshot!.CharacterData.Data.Gold == 133 && front.SaveListCount() == 1, "retry finalizes actual escrow before its only final snapshot");
        await peer.Send(saved.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        Check((await retry).Succeeded, "recovered actor finalization completes stop");
        Pass("actual DealCancelA escrow inconsistency leaves frozen failure; repaired state retries refund and one final snapshot before real ACK");
        break;
    }
    case "multiLoads":
    {
        await fixture.Start(); fixture.AddWalkableMap(); fixture.Actor("existing_actor", 111);
        service = LoadService(app);
        front.AddToLoadRcdList(Load("load_one")); front.AddToLoadRcdList(Load("load_two"));
        Task<ShutdownResult> attempt = service.RequestShutdownAsync();
        Request[] loads = [await peer.Read(), await peer.Read()];
        await Wait(() => world.IsShutdownFrozen && world.LoadPlayCount == 2, "both actual loads reach world wait list");
        object processing = typeof(GameSrv.Word.Threads.CharacterDataProcessor).GetField("_processingGate", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(GameShare.CharacterDataProcessor)!;
        using (var hold = new HeldLock(processing))
        {
            for (int i = 0; i < loads.Length; i++) await peer.Send(loads[i].QueryId, Messages.DBR_LOADHUMANRCD, 1, fixture.LoadBody(i == 0 ? "load_one" : "load_two", 201 + i));
            await Wait(() => ReplyCount() == 2, "real coalesced native replies enter the actual response map");
            PlayerDataService.ProcessQueryQueue(); PlayerDataService.ProcessQueryQueue();
            Check(PlayerDataService.PendingLoadCount == 2 && front.IsIdle(), "two real ready loads are cached before world initialization");
        }
        Request[] saves = [await peer.Read(), await peer.Read(), await peer.Read()];
        Check(world.LoadPlayCount == 0 && world.PendingShutdownWorkCount == 0 && world.PlayObjectCount == 3 &&
            saves.Select(s => s.Snapshot!.ChrName).ToHashSet().SetEquals(["existing_actor", "load_one", "load_two"]),
            "actual two-ready-load removal cannot skip indices or retain null/runtime work");
        foreach (Request saved in saves) await peer.Send(saved.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        Check((await attempt).Succeeded, "all loaded and existing actor saves confirm shutdown");
        Pass("two actual ready load replies initialize both actors; reverse retirement clears exact world entries before all three final snapshots and ACK drain");
        break;
    }
    case "terminalLoad":
    {
        await fixture.Start(); fixture.AddWalkableMap(); fixture.Actor("already_online", 411);
        service = LoadService(app);
        PropertyInfo loadTick = typeof(WorldServer).GetProperty("ProcessLoadPlayTick", BindingFlags.Instance | BindingFlags.NonPublic)!;
        loadTick.SetValue(world, HUtil32.GetTickCount() + 100000);
        front.AddToLoadRcdList(Load("already_online")); front.AddToLoadRcdList(Load("other_load"));
        Task<ShutdownResult> attempt = service.RequestShutdownAsync();
        Request retired = await peer.Read();
        Request other = await peer.Read();
        object processing = typeof(GameSrv.Word.Threads.CharacterDataProcessor).GetField("_processingGate", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(GameShare.CharacterDataProcessor)!;
        using (var hold = new HeldLock(processing))
        {
            await peer.Send(retired.QueryId, Messages.DBR_LOADHUMANRCD, 1, fixture.LoadBody("already_online", 911));
            await Wait(() => ReplyCount() == 1, "actual positive terminal-load response arrives before world admission finishes");
            PlayerDataService.ProcessQueryQueue(); PlayerDataService.ProcessQueryQueue();
            Check(ReadyLoadCount() == 1, "real positive reply is decoded into the cache before terminal world branch");
            loadTick.SetValue(world, HUtil32.GetTickCount() - 1000);
        }
        await Wait(() => world.LoadPlayCount == 1 && PlayerDataService.PendingLoadCount == 1, "terminal same-name load retires exactly its ready reply and world null entry");
        CharacterDataInfo? unused = null;
        Check(!PlayerDataService.GetPlayData(retired.QueryId, ref unused!), "retired terminal reply cannot leave a ready cache consumer");
        await peer.Send(retired.QueryId, Messages.DBR_LOADHUMANRCD, 1, fixture.LoadBody("already_online", 999));
        await Task.Delay(80);
        Check(ReplyCount() == 0 && PlayerDataService.PendingLoadCount == 1 && world.PlayObjectCount == 1,
            "late retired query cannot cache orphan data or instantiate another actor");
        await peer.Send(other.QueryId, Messages.DBR_LOADHUMANRCD, 1, fixture.LoadBody("other_load", 512));
        Request[] saves = [await peer.Read(), await peer.Read()];
        Check(saves.Single(s => s.Snapshot!.ChrName == "already_online").Snapshot!.CharacterData.Data.Gold == 411 &&
            saves.Single(s => s.Snapshot!.ChrName == "other_load").Snapshot!.CharacterData.Data.Gold == 512 && world.LoadPlayCount == 0,
            "terminal duplicate does not overwrite existing actor or retire another admitted query");
        foreach (Request saved in saves) await peer.Send(saved.QueryId, Messages.DBR_SAVEHUMANRCD, 1);
        Check((await attempt).Succeeded && world.PlayObjectCount == 2, "other exact load completes and saves after terminal retirement");
        Pass("actual already-online terminal load retires only its positive cached query; late reply cannot orphan/reinitialize and another real admitted load still initializes and saves");
        break;
    }
    case "monsters":
    {
        await fixture.Start();
        SystemShare.Config.ProcessMonsterMultiThreadLimit = 1;
        world.InitializeMonster(); world.InitializationMonsterThread();
        Thread[] threads = (Thread[])typeof(WorldServer).GetField("MobThreading", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(world)!;
        await Wait(() => threads[0].IsAlive, "actual monster worker starts");
        Check((await service.RequestShutdownAsync()).Succeeded && threads.All(t => !t.IsAlive), "actual monster worker must cooperate and join before freeze");
        Pass("actual WorldServer monster loop stops cooperatively and joins before final world freeze, without Thread.Interrupt");
        break;
    }
    case "goldFailure":
    {
        await fixture.Start();
        front.AddChangeGoldList("private-admin", "private-target", 12);
        world.sub4AE514(new GoldChangeInfo { sGameMasterName = "private-admin", sGetGoldUser = "private-target", nGold = 14 });
        ShutdownResult result = await service.RequestShutdownAsync();
        Check(result.Outcome == ShutdownOutcome.TimedOut && result.State.GoldChanges == 2 && result.Reason == "unsupported_gold_operation" && !result.State.FinalSnapshotsComplete &&
            front.IsIdle() && app.StopTransportCalls == 0 && GameShare.DataServer.IsConnected,
            "unsupported gold write cannot be silently cleared into a successful empty save queue");
        front.AddChangeGoldList("private-admin", "private-target", 13);
        Check(front.PendingGoldCount == 1, "new gold commands cannot extend a frozen world");
        Pass("preexisting failed legacy gold operation remains an explicit shutdown barrier; empty saves do not fake a stopped result");
        world.sub4AE514(new GoldChangeInfo { sGameMasterName = "private-admin", sGetGoldUser = "private-target", nGold = 15 });
        Check(world.PendingShutdownGoldCount == 1 && result.State.RuntimeWork == 1 && world.IsShutdownFrozen,
            "world deferred gold is not cleared by frozen ProcessHumans and new commands do not extend it");
        Pass("actual WorldServer deferred gold enqueue releases its lock and remains unsupported through frozen load processing, blocking final snapshots/drained/stop");
        break;
    }
    default: throw new Exception("Unknown isolated scenario");
}

static class Harness
{
public static void Check(bool condition, string message) { if (!condition) throw new Exception("FAIL " + message); }
public static void Pass(string description) => Console.WriteLine("PASS " + description);
public static async Task Wait(Func<bool> condition, string message, int milliseconds = 4000)
{
    using var timeout = new CancellationTokenSource(milliseconds);
    while (!condition()) { try { await Task.Delay(5, timeout.Token); } catch (OperationCanceledException) { throw new Exception("FAIL " + message); } }
}
public static int FreePort() { var l = new TcpListener(IPAddress.Loopback, 0); l.Start(); int p = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop(); return p; }
public static TCPNetChannel NewChannel()
{
    SystemShare.Config.sGateAddr = "127.0.0.1"; SystemShare.Config.nGatePort = FreePort();
    var channel = new TCPNetChannel(); M2Share.NetChannel = channel; channel.Initialize(); return channel;
}
public static object Reader(TCPNetChannel channel)
{
    object queue = typeof(TCPNetChannel).GetField("_receiveQueue", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(channel)!;
    return queue.GetType().GetProperty("Reader")!.GetValue(queue)!;
}
public static int QueueCount(TCPNetChannel channel) => (int)Reader(channel).GetType().GetProperty("Count")!.GetValue(Reader(channel))!;
public static bool QueueCompleted(TCPNetChannel channel) => ((Task)Reader(channel).GetType().GetProperty("Completion")!.GetValue(Reader(channel))!).IsCompletedSuccessfully;
public static SavePlayerRcd Record(string name)
{
    var r = new SavePlayerRcd { Account = "shutdown_test", ChrName = name, SessionID = 123, PlayObject = new PlayObject() };
    r.CharacterData.Header.SetName(name); r.CharacterData.Data.Account = r.Account; r.CharacterData.Data.ChrName = name; return r;
}
public static AppService LoadService(GameApp app) => new(app, shutdownOptions: new ShutdownOptions { AttemptTimeout = TimeSpan.FromSeconds(8), AdmissionDelay = TimeSpan.Zero, PollInterval = TimeSpan.FromMilliseconds(10) });
public static LoadDBInfo Load(string name) => new() { Account = "shutdown_test", ChrName = name, SessionID = 999, sIPaddr = "127.0.0.1" };
public static int ReplyCount()
{
    object replies = typeof(PlayerDataService).GetField("QueryMap", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;
    return (int)replies.GetType().GetProperty("Count")!.GetValue(replies)!;
}
public static int ReadyLoadCount()
{
    object ready = typeof(PlayerDataService).GetField("LoadPlayDataMap", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;
    return (int)ready.GetType().GetProperty("Count")!.GetValue(ready)!;
}
public static bool HeldByAnotherThread(object gate)
{
    if (!Monitor.TryEnter(gate)) return true;
    Monitor.Exit(gate); return false;
}

}

sealed class Fixture : IAsyncDisposable
{
    public readonly TestModule Module = new();
    public readonly TestApp App;
    public readonly WorldServer World;
    public readonly FrontEngine Front = new();
    public readonly TCPNetChannel Channel;
    public readonly DatabasePeer Peer = new();
    readonly ServiceProvider provider;
    readonly ChannelMessageHandler gate;
    Envirnoment? map;
    string? mapPath;
    public Fixture()
    {
        provider = new ServiceCollection().AddSingleton<IModuleInitializer>(Module).BuildServiceProvider();
        App = new TestApp(provider);
        SystemShare.ActorMgr = new ActorMgr(); M2Share.UserDBCriticalSection = new object();
        M2Share.FrontEngine = Front; World = (WorldServer)SystemShare.WorldEngine;
        SystemShare.Config.ShutdownSeconds = 0; SystemShare.Config.ConsoleShowUserCountTime = int.MaxValue;
        SystemShare.Config.CheckBlock = 100000;
        Channel = NewChannel();
        gate = new ChannelMessageHandler(new ChannelGate { UserList = new List<SessionUser>(), SocketId = "private-test" });
        ((ChannelMessageHandler[])typeof(TCPNetChannel).GetField("_gameGates", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(Channel)!)[0] = gate;
    }
    public async Task Start(bool allWorkers = false, CancellationToken token = default)
    {
        await Peer.Connect();
        if (allWorkers) await App.StartUp(token);
        else { await Channel.Start(); await GameShare.CharacterDataProcessor.StartAsync(CancellationToken.None); }
    }
    public PlayObject Actor(string name, int gold)
    {
        var actor = new PlayObject { UserAccount = "shutdown_test", ChrName = name, SessionId = 123, Gold = gold,
            RunTick = HUtil32.GetTickCount() + 100000, MapName = "fixture", HomeMap = "fixture" };
        actor.WAbil.HP = (ushort)(name.EndsWith("_b") ? 72 : 71);
        ((IList<IPlayerActor>)typeof(WorldServer).GetField("PlayObjectList", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(World)!).Add(actor);
        return actor;
    }
    public void AddWalkableMap()
    {
        mapPath = Path.Combine(Environment.CurrentDirectory, "shutdown-map-" + Guid.NewGuid().ToString("N") + ".map");
        using (var writer = new BinaryWriter(File.Create(mapPath)))
        { writer.Write((short)32); writer.Write((short)32); writer.Write(new byte[48]); for (int i = 0; i < 1024; i++) { writer.Write((ushort)1); writer.Write(new byte[10]); } }
        map = new Envirnoment { MapName = "fixture", ServerIndex = M2Share.ServerIndex };
        Check(map.LoadMapData(mapPath), "actual map parser accepts isolated map");
        ((IDictionary<string, IEnvirnoment>)typeof(GameSrv.Maps.MapManager).GetField("_mapList", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(SystemShare.MapMgr)!).Add("fixture", map);
    }
    public byte[] LoadBody(string name, int gold)
    {
        var loaded = new PlayObject { UserAccount = "shutdown_test", ChrName = name, Gold = gold, MapName = "fixture", HomeMap = "fixture", CurrX = 15, CurrY = 15 };
        loaded.WAbil.HP = loaded.WAbil.MaxHP = loaded.Abil.HP = loaded.Abil.MaxHP = 90; loaded.Abil.Level = 10;
        CharacterDataInfo snapshot = (CharacterDataInfo)typeof(WorldServer).GetMethod("MakeSaveRcd", BindingFlags.Static | BindingFlags.NonPublic)!.Invoke(null, [loaded])!;
        return EDCode.EncodeBuffer(SerializerUtil.Serialize(new LoadPlayerDataPacket { ChrName = EDCode.EncodeString(name), HumDataInfo = snapshot }));
    }
    public async ValueTask DisposeAsync()
    {
        GameShare.DataServer.Stop();
        await Channel.StopAsync(); gate.Stop();
        await GameShare.CharacterDataProcessor.StopAsync(CancellationToken.None);
        await Peer.DisposeAsync(); provider.Dispose();
        map?.Dispose(); if (mapPath != null) File.Delete(mapPath);
    }
}
sealed class TestApp(IServiceProvider provider) : GameApp(provider)
{
    public int StopTransportCalls;
    public bool ThrowStopOnce;
    protected override Task StartConnectionsAsync() => M2Share.NetChannel.Start();
    protected override Task StopConnectionsAsync()
    {
        StopTransportCalls++;
        if (ThrowStopOnce) { ThrowStopOnce = false; throw new IOException("isolated final transport fault"); }
        if (!GameShare.CharacterDataProcessor.ObserveShutdownDrain().Drained) throw new Exception("transport stopped before confirmed drain");
        return Task.CompletedTask;
    }
}
sealed class TestModule : IModuleInitializer
{
    public int StopCalls;
    public bool ThrowNext;
    public Action? OnStop;
    public void ConfigureServices(IServiceCollection services) { }
    public void Configure(IHostEnvironment env) { }
    public void Startup(CancellationToken token = default) { }
    public void Stopping(CancellationToken token = default)
    {
        StopCalls++;
        if (ThrowNext) { ThrowNext = false; throw new IOException("isolated module fault"); }
        OnStop?.Invoke();
    }
}
sealed class HeldLock : IDisposable
{
    readonly ManualResetEventSlim release = new();
    readonly ManualResetEventSlim entered = new();
    readonly Thread thread;
    public HeldLock(object gate)
    {
        thread = new Thread(() => { lock (gate) { entered.Set(); release.Wait(); } }) { IsBackground = true };
        thread.Start(); Check(entered.Wait(TimeSpan.FromSeconds(3)), "isolated hold acquires genuine production lock");
    }
    public void Release() => release.Set();
    public void Dispose() { Release(); thread.Join(); entered.Dispose(); release.Dispose(); }
}
