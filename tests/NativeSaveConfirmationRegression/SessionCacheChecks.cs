using System;
using System.Collections.Generic;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;
using DBSrv;
using DBSrv.Conf;
using DBSrv.Services.Impl;
using DBSrv.Storage.Impl;
using OpenMir2.Packets.ServerPackets;

public static class SessionCacheChecks
{
    public static int Run()
    {
        int groups = 0;
        var ownedSessions = new List<ClientSession>();
        try
        {
        Check("native cache first Add inserts the production record", () =>
        {
            var cache = new CacheStorageService();
            var record = new CharacterDataInfo();
            record.Data.Gold = 111;
            cache.Add("SaveFixture", record);
            Require(ReferenceEquals(cache.Get("SaveFixture", out bool exists), record) && exists,
                "first Add did not insert the supplied production record");
        });
        Check("native cache replaces the same case-insensitive character without duplicate entries", () =>
        {
            var cache = new CacheStorageService();
            var first = new CharacterDataInfo();
            first.Data.Gold = 111;
            var replacement = new CharacterDataInfo();
            replacement.Data.Gold = 222;
            cache.Add("SaveFixture", first);
            cache.Add("savefixture", replacement);
            var actual = cache.Get("SAVEFIXTURE", out bool exists);
            Require(exists && ReferenceEquals(actual, replacement) && actual.Data.Gold == 222,
                "replacement retained the old record or used a different key");
            using var entries = cache.QueryCacheData();
            Require(entries.MoveNext() && ReferenceEquals(entries.Current, replacement) && !entries.MoveNext(),
                "case-insensitive replacement left duplicate cache entries");
        });
        Check("native cache Delete invalidates a committed snapshot and tolerates a repeated delete", () =>
        {
            var cache = new CacheStorageService();
            cache.Add("SaveFixture", new CharacterDataInfo());
            cache.Delete("savefixture");
            Require(cache.Get("SaveFixture", out bool exists) == null && !exists,
                "Delete left the cached snapshot observable");
            cache.Delete("SAVEFIXTURE");
            using var entries = cache.QueryCacheData();
            Require(!entries.MoveNext(), "Delete left an enumerated cached snapshot");
        });
        Check("native precise save release leaves a newer same-account and other-account session locked", () =>
        {
            var (service, old, newer, other) = SessionFixture(ownedSessions);
            Require(service.SetSessionSaveRcd("FixtureAccount", 11), "matching save session was not found");
            Require(!old.LoadRcd && newer.LoadRcd && other.LoadRcd,
                "older save released a replacement or another account session");
        });
        Check("native precise save release rejects wrong account, missing identity and nonpositive IDs", () =>
        {
            var (service, old, newer, other) = SessionFixture(ownedSessions);
            Require(!service.SetSessionSaveRcd("AbsentAccount", 11), "wrong account was accepted");
            Require(!service.SetSessionSaveRcd("FixtureAccount", 99), "absent session was accepted");
            Require(!service.SetSessionSaveRcd("FixtureAccount", 0)
                && !service.SetSessionSaveRcd("FixtureAccount", -1)
                && !service.SetSessionSaveRcd("", 11), "invalid session identity was accepted");
            Require(old.LoadRcd && newer.LoadRcd && other.LoadRcd,
                "rejected save release changed a load state");
        });
        Check("native committed-session release permits one new load and stale save cannot unlock a removed login", () =>
        {
            var (service, old, newer, other) = SessionFixture(ownedSessions);
            Require(service.SetSessionSaveRcd("FixtureAccount", 11), "matching release failed");
            bool found = false;
            Require(service.CheckSessionLoadRcd("FixtureAccount", "127.0.0.1", 11, ref found) == 1
                && found && old.LoadRcd, "released session could not acquire a new load");
            found = false;
            Require(service.CheckSessionLoadRcd("FixtureAccount", "127.0.0.1", 11, ref found) == -1
                && found, "the loaded session was granted a second load");
            service.CloseSession("FixtureAccount", 11);
            Require(!service.SetSessionSaveRcd("FixtureAccount", 11) && newer.LoadRcd && other.LoadRcd,
                "stale release after CloseSession affected the remaining sessions");
        });
        Check("native readonly record-state query preserves claims and exact first-match identity", () =>
        {
            var (service, old, newer, other) = SessionFixture(ownedSessions);
            Require(service.IsSessionRecordLoaded("FixtureAccount", 11)
                && service.IsSessionRecordLoaded("FixtureAccount", 12)
                && service.IsSessionRecordLoaded("OtherFixture", 11), "readonly query missed an existing loaded identity");
            Require(!service.IsSessionRecordLoaded("fixtureaccount", 11)
                && !service.IsSessionRecordLoaded("AbsentFixture", 11)
                && !service.IsSessionRecordLoaded("FixtureAccount", 99)
                && !service.IsSessionRecordLoaded("", 11)
                && !service.IsSessionRecordLoaded("FixtureAccount", 0), "readonly query matched a different identity");
            Require(old.LoadRcd && newer.LoadRcd && other.LoadRcd, "readonly query released a loaded identity");
            Require(service.SetSessionSaveRcd("FixtureAccount", 11), "readonly fixture could not release the old claim");
            var sessions = (IList<GlobaSessionInfo>)typeof(ClientSession)
                .GetField("_globaSessionList", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(service)!;
            sessions.Add(new GlobaSessionInfo { Account = "FixtureAccount", SessionID = 11, LoadRcd = true });
            Require(!service.IsSessionRecordLoaded("FixtureAccount", 11) && !old.LoadRcd,
                "readonly query acquired a free session or searched beyond the first matching identity");
            bool found = false;
            Require(service.CheckSessionLoadRcd("FixtureAccount", "127.0.0.1", 11, ref found) == 1 && found,
                "readonly free-state query prevented the actual claim");
            Require(service.IsSessionRecordLoaded("FixtureAccount", 11) && old.LoadRcd
                && newer.LoadRcd && other.LoadRcd, "readonly claimed-state query changed a session");
            found = false;
            Require(service.CheckSessionLoadRcd("FixtureAccount", "127.0.0.1", 11, ref found) == -1 && found,
                "readonly claimed-state query allowed another acquisition");
        });
        Check("native concurrent duplicate claims acquire once while an independent account still acquires", () =>
        {
            var (service, old, newer, other) = SessionFixture(ownedSessions);
            for (int round = 0; round < 128; round++)
            {
                Require(service.SetSessionSaveRcd("FixtureAccount", 11)
                    && service.SetSessionSaveRcd("OtherFixture", 11), "race round could not release its own identities");
                using var ready = new CountdownEvent(3);
                using var start = new ManualResetEventSlim();
                Task<(int result, bool found)> Claim(string account) => Task.Factory.StartNew(() =>
                {
                    ready.Signal();
                    Require(start.Wait(TimeSpan.FromSeconds(5)), "concurrent claim start timed out");
                    bool found = false;
                    int result = service.CheckSessionLoadRcd(account, "127.0.0.1", 11, ref found);
                    return (result, found);
                }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
                var a = Claim("FixtureAccount");
                var b = Claim("FixtureAccount");
                var independent = Claim("OtherFixture");
                bool allReady = ready.Wait(TimeSpan.FromSeconds(5));
                start.Set();
                Require(allReady && Task.WaitAll(new Task[] { a, b, independent }, TimeSpan.FromSeconds(5)),
                    "concurrent production claim workers did not finish");
                Require(a.Result.found && b.Result.found
                    && ((a.Result.result == 1 && b.Result.result == -1)
                        || (a.Result.result == -1 && b.Result.result == 1)),
                    $"round {round}: duplicate session acquired twice or neither claimant acquired");
                Require(independent.Result == (1, true) && old.LoadRcd && newer.LoadRcd && other.LoadRcd,
                    $"round {round}: an independent account was blocked or a replacement was released");
            }
        });
        Check("native session message mutation, reads and Stop can race without releasing a surviving fresh claim", () =>
        {
            var (service, _, _, _) = SessionFixture(ownedSessions);
            using var start = new Barrier(3);
            Task Worker(Action action) => Task.Factory.StartNew(() =>
            {
                Require(start.SignalAndWait(TimeSpan.FromSeconds(5)), "session lifecycle worker start timed out");
                action();
            }, CancellationToken.None, TaskCreationOptions.LongRunning, TaskScheduler.Default);
            var mutator = Worker(() =>
            {
                for (int i = 0; i < 512; i++)
                {
                    int id = 1000 + i;
                    SessionMessage(service, "ProcessAddSession", $"MutationFixture/{id}/0/0/127.0.0.1/");
                    SessionMessage(service, "ProcessDelSession", $"MutationFixture/{id}");
                }
            });
            var reader = Worker(() =>
            {
                for (int i = 0; i < 512; i++)
                {
                    int id = 1000 + i;
                    service.CheckSession("MutationFixture", "127.0.0.1", id);
                    service.GetSession("MutationFixture", "127.0.0.1");
                    service.SetGlobaSessionPlay(id);
                    service.GetGlobaSessionStatus(id);
                    service.SetGlobaSessionNoPlay(id);
                    bool found = false;
                    service.CheckSessionLoadRcd("MutationFixture", "127.0.0.1", id, ref found);
                    service.SetSessionSaveRcd("MutationFixture", id);
                    service.SetSessionSaveRcd("MutationFixture");
                    service.CloseSession("MutationFixture", id);
                }
            });
            var stopper = Worker(() =>
            {
                for (int i = 0; i < 512; i++) service.Stop();
            });
            Require(Task.WaitAll(new[] { mutator, reader, stopper }, TimeSpan.FromSeconds(10)),
                "session list mutation/read lifecycle workers did not finish");
            service.Stop();
            SessionMessage(service, "ProcessAddSession", "FreshFixture/9999/0/0/127.0.0.1/");
            Require(service.CheckSession("FreshFixture", "127.0.0.1", 9999)
                && service.GetSession("FreshFixture", "127.0.0.1"), "fresh session was lost after completed mutations");
            bool freshFound = false;
            Require(service.CheckSessionLoadRcd("FreshFixture", "127.0.0.1", 9999, ref freshFound) == 1
                && freshFound, "fresh session could not acquire after completed mutations");
            Require(!service.SetSessionSaveRcd("MutationFixture", 9999), "stale account released the fresh claim");
            freshFound = false;
            Require(service.CheckSessionLoadRcd("FreshFixture", "127.0.0.1", 9999, ref freshFound) == -1
                && freshFound, "stale account release allowed a duplicate fresh claim");
            SessionMessage(service, "ProcessDelSession", "FreshFixture/9999");
            Require(!service.CheckSession("FreshFixture", "127.0.0.1", 9999), "close message retained the fresh session");
        });
        return groups;
        }
        finally
        {
            foreach (var service in ownedSessions)
            {
                service.Stop();
                (typeof(ClientSession).GetField("_clientScoket", BindingFlags.Instance | BindingFlags.NonPublic)!
                    .GetValue(service) as IDisposable)?.Dispose();
            }
        }

        void Check(string title, Action body)
        {
            body();
            groups++;
            Console.WriteLine("PASS " + title);
        }
    }

    private static (ClientSession service, GlobaSessionInfo old, GlobaSessionInfo newer, GlobaSessionInfo other) SessionFixture(ICollection<ClientSession> ownedSessions)
    {
        // Never Start this fixture. Even an eager reconnection plugin must not contact the
        // production LoginSrv; it receives a distinct loopback destination and is disposed.
        var service = new ClientSession(new SettingsModel { LoginServerAddr = "127.0.0.1", LoginServerPort = 1 });
        ownedSessions.Add(service);
        var sessions = (IList<GlobaSessionInfo>)(typeof(ClientSession)
            .GetField("_globaSessionList", BindingFlags.Instance | BindingFlags.NonPublic)!
            .GetValue(service)!);
        var old = new GlobaSessionInfo { Account = "FixtureAccount", SessionID = 11, LoadRcd = true };
        var newer = new GlobaSessionInfo { Account = "FixtureAccount", SessionID = 12, LoadRcd = true };
        var other = new GlobaSessionInfo { Account = "OtherFixture", SessionID = 11, LoadRcd = true };
        sessions.Add(old);
        sessions.Add(newer);
        sessions.Add(other);
        return (service, old, newer, other);
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    private static void SessionMessage(ClientSession service, string method, string body)
    {
        typeof(ClientSession).GetMethod(method, BindingFlags.Instance | BindingFlags.NonPublic)!
            .Invoke(service, new object[] { body });
    }
}
