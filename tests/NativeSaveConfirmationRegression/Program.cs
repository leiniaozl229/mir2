using System.Buffers.Binary;
using System.Collections.Specialized;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using DBSrv;
using DBSrv.Conf;
using DBSrv.Services.Impl;
using DBSrv.Storage;
using DBSrv.Storage.Model;
using OpenMir2;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;

internal static class Program
{
    private static int groups;
    private const string Account = "SaveFixtureAccount";
    private const string Character = "SaveFixture";

    public static async Task Main()
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        LogService.Logger = new Serilog.LoggerConfiguration().MinimumLevel.Fatal().CreateLogger();
        var factory = new OpenMir2.DataHandlingAdapters.PlayerDataFixedHeaderDataHandlingAdapter();
        var factoryMethod = factory.GetType().GetMethod("GetInstance", BindingFlags.Instance | BindingFlags.NonPublic)!;
        var firstPacket = (OpenMir2.DataHandlingAdapters.PlayerDataMessageFixedHeaderRequestInfo)factoryMethod.Invoke(factory, null)!;
        var secondPacket = (OpenMir2.DataHandlingAdapters.PlayerDataMessageFixedHeaderRequestInfo)factoryMethod.Invoke(factory, null)!;
        byte[] firstHeader = new byte[6];
        BinaryPrimitives.WriteUInt32LittleEndian(firstHeader, Grobal2.PacketCode);
        BinaryPrimitives.WriteUInt16LittleEndian(firstHeader.AsSpan(4), 1);
        byte[] secondHeader = (byte[])firstHeader.Clone();
        BinaryPrimitives.WriteUInt16LittleEndian(secondHeader.AsSpan(4), 2);
        Require(firstPacket.OnParsingHeader(firstHeader) && firstPacket.OnParsingBody(new byte[] { 1 }), "first packet did not parse");
        Require(secondPacket.OnParsingHeader(secondHeader) && secondPacket.OnParsingBody(new byte[] { 2, 3 }), "second packet did not parse");
        Require(!ReferenceEquals(firstPacket, secondPacket) && firstPacket.BodyLength == 1 && firstPacket.Message.SequenceEqual(new byte[] { 1 }) && secondPacket.BodyLength == 2, "two native requests share mutable parser state");
        groups++;
        Console.WriteLine("PASS native packet factories retain independent bodies and lengths across connections");
        groups += SessionCacheChecks.Run();
        await Check("TCP success ACK follows Update and cache, releasing only its native session", async f =>
        {
            f.Cache.Values[Character] = Snapshot(7);
            f.Storage.OnUpdate = () => Require(f.Cache.Values[Character].Data.Gold == 7 && f.Old.LoadRcd, "cache/session changed before storage confirmation");
            var reply = await f.Save(Snapshot(44));
            Success(reply);
            Require(f.Storage.UpdateCalls == 1 && f.Storage.Persisted.Data.Gold == 44, "storage snapshot not committed");
            Require(f.Cache.Values[Character].Data.Gold == 44 && !f.Old.LoadRcd && f.Newer.LoadRcd, "post-commit cache/session identity failed");
        });
        await Check("TCP Update false returns legacy failure without refreshing cache or releasing session", async f =>
        {
            f.Storage.UpdateResult = false;
            f.Cache.Values[Character] = Snapshot(7);
            Failure(await f.Save(Snapshot(44)));
            Require(!f.Cache.Values.ContainsKey(Character) && f.Cache.AddCalls == 0 && f.Cache.DeleteCalls == 1 && f.Old.LoadRcd && f.Newer.LoadRcd, "failed save published state or retained uncertain cache");
        });
        await Check("TCP Update exception produces correlated failure rather than a missing ACK", async f =>
        {
            f.Storage.ThrowUpdate = true;
            Failure(await f.Save(Snapshot(44)));
            Require(f.Cache.AddCalls == 0 && f.Old.LoadRcd, "exception released a save barrier");
        });
        await Check("TCP failed missing-record Add cannot proceed to Update or report saved", async f =>
        {
            f.Storage.Exists = false;
            f.Storage.AddResult = false;
            Failure(await f.Save(Snapshot(44)));
            Require(f.Storage.AddCalls == 1 && f.Storage.UpdateCalls == 0 && f.Old.LoadRcd, "Add failure was ignored");
        });
        await Check("TCP Add exception is a failure and preserves session claim", async f =>
        {
            f.Storage.Exists = false;
            f.Storage.ThrowAdd = true;
            Failure(await f.Save(Snapshot(44)));
            Require(f.Storage.UpdateCalls == 0 && f.Cache.AddCalls == 0 && f.Old.LoadRcd, "Add exception produced success");
        });
        await Check("TCP legacy missing-record fallback needs successful Add, index visibility and full Update", async f =>
        {
            f.Storage.Exists = false;
            Success(await f.Save(Snapshot(44)));
            Require(f.Storage.AddCalls == 1 && f.Storage.UpdateCalls == 1 && f.Storage.Persisted.Data.Gold == 44, "fallback skipped full snapshot save");
        });
        await Check("TCP Add success with missing index cannot be promoted to save success", async f =>
        {
            f.Storage.Exists = false;
            f.Storage.AddExposesIndex = false;
            Failure(await f.Save(Snapshot(44)));
            Require(f.Storage.UpdateCalls == 0 && f.Cache.AddCalls == 0, "unindexed Add was acknowledged");
        });
        await Check("TCP Add followed by failed Update remains failure and does not expose a new cache", async f =>
        {
            f.Storage.Exists = false;
            f.Storage.UpdateResult = false;
            Failure(await f.Save(Snapshot(44)));
            Require(f.Storage.AddCalls == 1 && f.Storage.UpdateCalls == 1 && f.Cache.AddCalls == 0 && f.Old.LoadRcd, "fallback lost its failure boundary");
        });
        await Check("TCP absent snapshot and malformed serialized save produce explicit legacy failure", async f =>
        {
            Failure(await f.Save(null));
            Failure(await f.RequestRaw(Messages.DB_SAVEHUMANRCD, 11, new byte[128]));
            Require(f.Storage.UpdateCalls == 0 && f.Cache.AddCalls == 0 && f.Old.LoadRcd, "invalid payload reached storage");
        });
        await Check("TCP extended save uses the same confirmation and exception behavior", async f =>
        {
            Success(await f.Save(Snapshot(44), ident: Messages.DB_SAVEHUMANRCDEX));
            f.Storage.ThrowUpdate = true;
            Failure(await f.Save(Snapshot(55), ident: Messages.DB_SAVEHUMANRCDEX));
            Require(f.Storage.Persisted.Data.Gold == 44, "failed extended save published later data");
        });
        await Check("TCP post-commit cache failure keeps success and invalidates cached state", async f =>
        {
            f.Cache.Values[Character] = Snapshot(7);
            f.Cache.ThrowAdd = true;
            Success(await f.Save(Snapshot(44)));
            Require(f.Cache.DeleteCalls == 1 && !f.Cache.Values.ContainsKey(Character) && !f.Old.LoadRcd, "cache failure undid commit or remained exposed");
            var loaded = await f.Load(11);
            LoadSuccess(loaded, 44);
            Require(f.Storage.GetCalls == 1, "load did not use persistent backend after failed cache refresh");
        });
        await Check("TCP cache Add and Delete both fail: later loads bypass the stale backend cache", async f =>
        {
            f.Cache.Values[Character] = Snapshot(7);
            f.Cache.ThrowAdd = true;
            f.Cache.ThrowDelete = true;
            Success(await f.Save(Snapshot(44)));
            var loaded = await f.Load(11);
            LoadSuccess(loaded, 44);
            Require(f.Cache.Values[Character].Data.Gold == 7 && f.Cache.GetCalls == 0 && f.Storage.GetCalls == 1, "stale cache survived bypass protection");
        });
        await Check("TCP successful cache refresh recovers a previous bypass marker", async f =>
        {
            f.Cache.ThrowAdd = true;
            Success(await f.Save(Snapshot(44)));
            f.Cache.ThrowAdd = false;
            Success(await f.Save(Snapshot(55)));
            LoadSuccess(await f.Load(11), 55);
            Require(f.Cache.GetCalls == 1 && f.Storage.GetCalls == 0, "successful cache was permanently bypassed");
        });
        await Check("TCP loaded session cannot be loaded twice even when foundSession is true", async f =>
        {
            var reply = await f.Load(11);
            Require(reply.Message.Ident == 1100 && reply.Message.Recog == -1 && f.Old.LoadRcd, "duplicate load released or bypassed claim");
            Require(f.Storage.GetCalls == 0 && f.Cache.GetCalls == 0, "duplicate load reached storage");
        });
        await Check("TCP load storage false rolls back only its newly acquired claim and permits retry", async f =>
        {
            f.Old.LoadRcd = false;
            f.Storage.GetResult = false;
            LoadFailure(await f.Load(11));
            Require(!f.Old.LoadRcd && f.Newer.LoadRcd, "failed load released wrong session or retained new claim");
            f.Storage.GetResult = true;
            LoadSuccess(await f.Load(11), 3);
            Require(f.Old.LoadRcd, "successful retry did not acquire claim");
        });
        await Check("TCP load storage exception produces failure and its exact claim can retry", async f =>
        {
            f.Old.LoadRcd = false;
            f.Storage.ThrowGet = true;
            LoadFailure(await f.Load(11));
            Require(!f.Old.LoadRcd && f.Newer.LoadRcd, "load exception leaked or released wrong claim");
            f.Storage.ThrowGet = false;
            LoadSuccess(await f.Load(11), 3);
        });
        await Check("TCP missing character and true-with-null storage never produce load success", async f =>
        {
            f.Old.LoadRcd = false;
            f.Storage.Exists = false;
            LoadFailure(await f.Load(11));
            Require(!f.Old.LoadRcd, "missing character retained claim");
            f.Storage.Exists = true;
            f.Storage.ReturnNull = true;
            LoadFailure(await f.Load(11));
            Require(!f.Old.LoadRcd, "null load retained claim");
        });
        await Check("TCP broken cache read falls through to storage without discarding load identity", async f =>
        {
            f.Old.LoadRcd = false;
            f.Cache.ThrowGet = true;
            LoadSuccess(await f.Load(11), 3);
            Require(f.Cache.DeleteCalls == 1 && f.Storage.GetCalls == 1 && f.Old.LoadRcd, "cache exception did not recover persistent load");
        });
        await Check("TCP invalid cached record is evicted and storage is used in the same request", async f =>
        {
            f.Old.LoadRcd = false;
            var broken = Snapshot(7);
            broken.Data = null;
            f.Cache.Values[Character] = broken;
            LoadSuccess(await f.Load(11), 3);
            Require(f.Cache.DeleteCalls == 1 && f.Storage.GetCalls == 1, "invalid cached state prevented load recovery");
        });
        await Check("TCP stale session save commits its snapshot without unlocking replacement login", async f =>
        {
            Success(await f.Save(Snapshot(44), session: 99));
            Require(f.Old.LoadRcd && f.Newer.LoadRcd, "nonmatching save unlocked current session");
        });
        await Check("TCP storage returns false after commit: fresh session reads persistent data rather than stale cache", async f =>
        {
            f.Cache.Values[Character] = Snapshot(7);
            f.Storage.UpdateResult = false;
            f.Storage.CommitBeforeFailure = true;
            Failure(await f.Save(Snapshot(44)));
            Require(f.Old.LoadRcd && f.Cache.AddCalls == 0, "uncertain result released claim or published success cache");
            f.Newer.LoadRcd = false;
            LoadSuccess(await f.Load(12), 44);
            Require(f.Storage.GetCalls == 1 && f.Old.LoadRcd && f.Newer.LoadRcd, "fresh session relied on stale cache or unlocked old claim");
        });
        await Check("TCP storage throws after commit and cache deletion fails: fresh session still bypasses stale cache", async f =>
        {
            f.Cache.Values[Character] = Snapshot(7);
            f.Cache.ThrowDelete = true;
            f.Storage.ThrowUpdate = true;
            f.Storage.CommitBeforeFailure = true;
            Failure(await f.Save(Snapshot(44)));
            f.Newer.LoadRcd = false;
            LoadSuccess(await f.Load(12), 44);
            Require(f.Cache.Values[Character].Data.Gold == 7 && f.Cache.GetCalls == 0 && f.Storage.GetCalls == 1 && f.Old.LoadRcd, "uncertain save exposed an old cache after delete failure");
        });
        await Check("two TCP connections cannot both acquire the same native session while the owner loads", async f =>
        {
            f.Old.LoadRcd = false;
            using var entered = new ManualResetEventSlim();
            using var release = new ManualResetEventSlim();
            f.Storage.OnGet = () => { entered.Set(); Require(release.Wait(TimeSpan.FromSeconds(4)), "storage gate not released"); };
            using var peer = await f.ConnectPeer();
            var owner = f.Load(11);
            try
            {
                Require(await Task.Run(() => entered.Wait(TimeSpan.FromSeconds(3))), "owner did not reach storage");
                var duplicate = await f.Load(11, peer.GetStream());
                Require(duplicate.Message.Recog == -1 && f.Old.LoadRcd && f.Storage.GetCalls == 1, "second connection acquired or released the owner's load claim");
            }
            finally { release.Set(); }
            LoadSuccess(await owner, 3);
            Require(f.Old.LoadRcd && f.Newer.LoadRcd, "owner success lost the exact session claim");
        });
        await Check("failed TCP load owner releases its claim for retry without a competing duplicate releasing it", async f =>
        {
            f.Old.LoadRcd = false;
            f.Storage.GetResult = false;
            using var entered = new ManualResetEventSlim();
            using var release = new ManualResetEventSlim();
            f.Storage.OnGet = () => { entered.Set(); Require(release.Wait(TimeSpan.FromSeconds(4)), "storage gate not released"); };
            using var peer = await f.ConnectPeer();
            var owner = f.Load(11);
            try
            {
                Require(await Task.Run(() => entered.Wait(TimeSpan.FromSeconds(3))), "owner did not reach storage");
                var duplicate = await f.Load(11, peer.GetStream());
                Require(duplicate.Message.Recog == -1 && f.Old.LoadRcd && f.Newer.LoadRcd, "duplicate released a pending owner claim");
            }
            finally { release.Set(); }
            LoadFailure(await owner);
            Require(!f.Old.LoadRcd && f.Newer.LoadRcd, "owner failure released the wrong claim");
            f.Storage.OnGet = null;
            f.Storage.GetResult = true;
            LoadSuccess(await f.Load(11, peer.GetStream()), 3);
        });
        await Check("same-character TCP saves publish cache in the order their storage operation completes", async f =>
        {
            using var committed = new ManualResetEventSlim();
            using var release = new ManualResetEventSlim();
            f.Storage.AfterCommit = gold =>
            {
                if (gold == 44) { committed.Set(); Require(release.Wait(TimeSpan.FromSeconds(4)), "commit gate not released"); }
            };
            using var peer = await f.ConnectPeer();
            var first = f.Save(Snapshot(44));
            Require(await Task.Run(() => committed.Wait(TimeSpan.FromSeconds(3))), "first save did not reach commit");
            var later = Snapshot(55);
            later.Data.ChrName = Character.ToLowerInvariant();
            var second = f.RequestRaw(Messages.DB_SAVEHUMANRCD, 11,
                SerializerUtil.Serialize(new SaveCharacterData(Account, Character.ToLowerInvariant(), later)), peer.GetStream());
            try { await Task.WhenAny(second, Task.Delay(500)); }
            finally { release.Set(); }
            Success(await first);
            Success(await second);
            Require(f.Storage.Persisted.Data.Gold == 55 && f.Cache.Values[Character].Data.Gold == 55, "an older post-commit cache publication replaced newer storage");
        });
        await Check("a new-session TCP load waits for an active same-character save to publish its committed cache", async f =>
        {
            f.Cache.Values[Character] = Snapshot(7);
            f.Newer.LoadRcd = false;
            using var committed = new ManualResetEventSlim();
            using var release = new ManualResetEventSlim();
            f.Storage.AfterCommit = _ => { committed.Set(); Require(release.Wait(TimeSpan.FromSeconds(4)), "commit gate not released"); };
            using var peer = await f.ConnectPeer();
            var saving = f.Save(Snapshot(44));
            Require(await Task.Run(() => committed.Wait(TimeSpan.FromSeconds(3))), "save did not reach commit");
            var loading = f.Load(12, peer.GetStream());
            try { await Task.WhenAny(loading, Task.Delay(500)); }
            finally { release.Set(); }
            Success(await saving);
            LoadSuccess(await loading, 44);
            Require(f.Newer.LoadRcd, "save released the new session's claim");
        });
        await Check("a blocked character commit does not hold another account's different-character TCP save", async f =>
        {
            f.Newer.Account = "OtherAccount";
            using var committed = new ManualResetEventSlim();
            using var release = new ManualResetEventSlim();
            f.Storage.AfterCommit = gold =>
            {
                if (gold == 44) { committed.Set(); Require(release.Wait(TimeSpan.FromSeconds(4)), "commit gate not released"); }
            };
            using var peer = await f.ConnectPeer();
            var first = f.Save(Snapshot(44));
            Require(await Task.Run(() => committed.Wait(TimeSpan.FromSeconds(3))), "first save did not reach commit");
            try
            {
                var other = Snapshot(55);
                other.Header.SetName("OtherFixture");
                other.Data.Account = "OtherAccount";
                other.Data.ChrName = "OtherFixture";
                var independent = await f.RequestRaw(Messages.DB_SAVEHUMANRCD, 12,
                    SerializerUtil.Serialize(new SaveCharacterData("OtherAccount", "OtherFixture", other)), peer.GetStream());
                Success(independent);
                Require(!first.IsCompleted && f.Cache.Values["OtherFixture"].Data.Gold == 55, "another character waited behind the first character's storage gate");
            }
            finally { release.Set(); }
            Success(await first);
            Require(f.Cache.Values[Character].Data.Gold == 44, "different character cache identities interfered");
        });
        await Check("a save cannot release a newer load claim for the same account and numeric session", async f =>
        {
            f.Old.LoadRcd = false;
            using var committed = new ManualResetEventSlim();
            using var release = new ManualResetEventSlim();
            f.Storage.AfterCommit = _ => { committed.Set(); Require(release.Wait(TimeSpan.FromSeconds(4)), "commit gate not released"); };
            using var peer = await f.ConnectPeer();
            var saving = f.Save(Snapshot(44));
            Require(await Task.Run(() => committed.Wait(TimeSpan.FromSeconds(3))), "save did not reach commit");
            var loading = f.Load(11, peer.GetStream());
            try { await Task.Run(() => SpinWait.SpinUntil(() => f.Old.LoadRcd, TimeSpan.FromMilliseconds(300))); }
            finally { release.Set(); }
            Success(await saving);
            LoadSuccess(await loading, 44);
            Require(f.Old.LoadRcd, "save cleanup released a claim belonging to a later load");
            var duplicate = await f.Load(11, peer.GetStream());
            Require(duplicate.Message.Recog == -1 && f.Old.LoadRcd, "the successful new load allowed a duplicate acquisition");
        });
        await Check("a preceding character save cannot release the same session's subsequent different-character load", async f =>
        {
            f.Old.LoadRcd = false;
            using var committed = new ManualResetEventSlim();
            using var release = new ManualResetEventSlim();
            f.Storage.AfterCommit = _ => { committed.Set(); Require(release.Wait(TimeSpan.FromSeconds(4)), "commit gate not released"); };
            using var peer = await f.ConnectPeer();
            var saving = f.Save(Snapshot(44));
            Require(await Task.Run(() => committed.Wait(TimeSpan.FromSeconds(3))), "save did not reach commit");
            var loading = f.Load(11, peer.GetStream(), "OtherFixture");
            try { await Task.WhenAny(loading, Task.Delay(300)); }
            finally { release.Set(); }
            Success(await saving);
            LoadSuccess(await loading, 3);
            Require(f.Old.LoadRcd, "previous character's save released the newly selected character's load claim");
            var duplicate = await f.Load(11, peer.GetStream());
            Require(duplicate.Message.Recog == -1, "same session could acquire two different characters");
        });
        Console.WriteLine($"RESULT native save confirmation {groups} groups; actual DBSrv TCP and production cache/session, in-memory storage boundary; no SQL or original services");
    }

    private static async Task Check(string title, Func<Fixture, Task> body)
    {
        await using var fixture = await Fixture.Create();
        await body(fixture);
        groups++;
        Console.WriteLine("PASS " + title);
    }

    private static void Success(Reply reply) => Require(reply.Message.Ident == 1102 && reply.Message.Recog == 1, "expected literal legacy1102/1 save confirmation");
    private static void Failure(Reply reply) => Require(reply.Message.Ident == 1100 && reply.Message.Recog == 0, "expected literal legacy1100/0 save failure");
    private static void LoadFailure(Reply reply) => Require(reply.Message.Ident == 1100 && reply.Message.Recog < 0 && reply.Packet.Length == 0, "invalid load emitted success payload");
    private static void LoadSuccess(Reply reply, int gold)
    {
        Require(reply.Message.Ident == 1100 && reply.Message.Recog == 1, "load was not confirmed");
        var loaded = SerializerUtil.Deserialize<LoadPlayerDataPacket>(EDCode.DecodeBuff(reply.Packet));
        Require(loaded.HumDataInfo?.Data != null && loaded.HumDataInfo.Data.Gold == gold, "load used stale or missing snapshot");
    }

    private static CharacterDataInfo Snapshot(int gold)
    {
        var value = new CharacterDataInfo();
        value.Header.SetName(Character);
        value.Data.Account = Account;
        value.Data.ChrName = Character;
        value.Data.Gold = gold;
        return value;
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    private sealed record Reply(ServerRequestMessage Message, byte[] Packet);

    private sealed class Fixture : IAsyncDisposable
    {
        public readonly FakeStorage Storage = new();
        public readonly FakeCache Cache = new();
        public readonly GlobaSessionInfo Old = new() { Account = Account, SessionID = 11, LoadRcd = true };
        public readonly GlobaSessionInfo Newer = new() { Account = Account, SessionID = 12, LoadRcd = true };
        private readonly DataService service;
        private readonly ClientSession session;
        private readonly int port;
        private readonly System.Net.Sockets.TcpClient client = new();
        private NetworkStream stream;
        private int query;

        private Fixture(SettingsModel settings)
        {
            session = new ClientSession(settings);
            port = settings.ServerPort;
            var sessions = (IList<GlobaSessionInfo>)typeof(ClientSession).GetField("_globaSessionList", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(session)!;
            sessions.Add(Old);
            sessions.Add(Newer);
            service = new DataService(settings, session, Storage, Cache);
        }

        public static async Task<Fixture> Create()
        {
            DBShare.Initialization();
            ((HashSet<string>)typeof(DBShare).GetField("ServerIpList", BindingFlags.Static | BindingFlags.NonPublic)!.GetValue(null)!).Add("127.0.0.1");
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            var fixture = new Fixture(new SettingsModel { ServerAddr = "127.0.0.1", ServerPort = port, LoginServerPort = 1 });
            fixture.service.Initialize();
            fixture.service.Start();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await fixture.client.ConnectAsync(IPAddress.Loopback, port, timeout.Token);
            fixture.stream = fixture.client.GetStream();
            return fixture;
        }

        public Task<Reply> Save(CharacterDataInfo snapshot, int session = 11, int ident = Messages.DB_SAVEHUMANRCD, NetworkStream wire = null) => RequestRaw(ident, session, SerializerUtil.Serialize(new SaveCharacterData(Account, Character, snapshot)), wire);
        public Task<Reply> Load(int session, NetworkStream connection = null, string character = Character) => RequestRaw(Messages.DB_LOADHUMANRCD, session, SerializerUtil.Serialize(new LoadCharacterData { Account = Account, ChrName = character, SessionID = session, UserAddr = "127.0.0.1" }), connection);

        public async Task<System.Net.Sockets.TcpClient> ConnectPeer()
        {
            var peer = new System.Net.Sockets.TcpClient();
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await peer.ConnectAsync(IPAddress.Loopback, port, timeout.Token);
            return peer;
        }

        public async Task<Reply> RequestRaw(int ident, int sessionId, byte[] payload, NetworkStream connection = null)
        {
            int id = Interlocked.Increment(ref query);
            connection ??= stream;
            var message = new ServerRequestMessage(ident, sessionId, 0, 0, 0);
            var request = new ServerRequestData { QueryId = id, Message = EDCode.EncodeBuffer(SerializerUtil.Serialize(message)), Packet = EDCode.EncodeBuffer(payload) };
            int packetLen = request.Message.Length + request.Packet.Length + ServerDataPacket.FixedHeaderLen;
            request.Sign = EDCode.EncodeBuffer(BitConverter.GetBytes(HUtil32.MakeLong((ushort)(id ^ 170), (ushort)packetLen)));
            byte[] body = SerializerUtil.Serialize(request);
            byte[] wire = new byte[body.Length + 6];
            BinaryPrimitives.WriteUInt32LittleEndian(wire, Grobal2.PacketCode);
            BinaryPrimitives.WriteUInt16LittleEndian(wire.AsSpan(4), checked((ushort)body.Length));
            body.CopyTo(wire, 6);
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await connection.WriteAsync(wire, timeout.Token);
            byte[] header = new byte[6];
            await connection.ReadExactlyAsync(header, timeout.Token);
            Require(BinaryPrimitives.ReadUInt32LittleEndian(header) == Grobal2.PacketCode, "reply changed native packet code");
            byte[] responseBody = new byte[BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(4))];
            await connection.ReadExactlyAsync(responseBody, timeout.Token);
            var response = SerializerUtil.Deserialize<ServerRequestData>(responseBody);
            Require(response.QueryId == id, "ACK queryId lost request identity");
            var parsed = SerializerUtil.Deserialize<ServerRequestMessage>(EDCode.DecodeBuff(response.Message));
            byte[] packet = response.Packet ?? Array.Empty<byte>();
            int checkCode = HUtil32.MakeLong((ushort)(id ^ 170), (ushort)(response.Message.Length + packet.Length + 6));
            Require(BitConverter.ToInt16(EDCode.DecodeBuff(response.Sign)) == BitConverter.ToInt16(BitConverter.GetBytes(checkCode)), "ACK changed native signature framing");
            return new Reply(parsed, packet);
        }

        public ValueTask DisposeAsync()
        {
            client.Dispose();
            service.Stop();
            session.Stop();
            return ValueTask.CompletedTask;
        }
    }

    private sealed class FakeStorage : IPlayDataStorage
    {
        public bool Exists = true, UpdateResult = true, AddResult = true, AddExposesIndex = true, GetResult = true, ReturnNull;
        public bool ThrowUpdate, ThrowAdd, ThrowGet, CommitBeforeFailure;
        public int UpdateCalls, AddCalls, GetCalls;
        public Action OnUpdate, OnGet;
        public Action<int> AfterCommit;
        public CharacterDataInfo Persisted = Snapshot(3);
        public void LoadQuickList() { }
        public int Index(string name) => Exists ? 1 : -1;
        public bool Update(string name, CharacterDataInfo value)
        {
            UpdateCalls++;
            OnUpdate?.Invoke();
            if (CommitBeforeFailure) Persisted = SerializerUtil.Deserialize<CharacterDataInfo>(SerializerUtil.Serialize(value));
            if (ThrowUpdate) throw new InvalidOperationException("fixture storage update");
            if (!UpdateResult) return false;
            Persisted = SerializerUtil.Deserialize<CharacterDataInfo>(SerializerUtil.Serialize(value));
            AfterCommit?.Invoke(value.Data.Gold);
            return true;
        }
        public bool Add(CharacterDataInfo value)
        {
            AddCalls++;
            if (ThrowAdd) throw new InvalidOperationException("fixture storage add");
            if (AddResult && AddExposesIndex) Exists = true;
            return AddResult;
        }
        public bool Get(string name, ref CharacterDataInfo value)
        {
            GetCalls++;
            OnGet?.Invoke();
            if (ThrowGet) throw new InvalidOperationException("fixture storage get");
            value = ReturnNull ? null : SerializerUtil.Deserialize<CharacterDataInfo>(SerializerUtil.Serialize(Persisted));
            if (value != null && !string.Equals(name, Character, StringComparison.OrdinalIgnoreCase))
            {
                value = Snapshot(3);
                value.Header.SetName(name);
                value.Data.ChrName = name;
            }
            return GetResult;
        }
        public int Get(int index, ref CharacterDataInfo value) => throw new NotSupportedException();
        public CharacterData Query(int playerId) => throw new NotSupportedException();
        public bool GetQryChar(int index, ref QueryChr value) => throw new NotSupportedException();
        public bool UpdateQryChar(int index, QueryChr value) => throw new NotSupportedException();
        public int Find(string name, StringDictionary list) => throw new NotSupportedException();
        public bool Delete(int index) => throw new NotSupportedException();
        public bool Delete(string name) => throw new NotSupportedException();
        public int Count() => Exists ? 1 : 0;
    }

    private sealed class FakeCache : ICacheStorage
    {
        public readonly Dictionary<string, CharacterDataInfo> Values = new(StringComparer.OrdinalIgnoreCase);
        public bool ThrowAdd, ThrowDelete, ThrowGet;
        public int AddCalls, DeleteCalls, GetCalls;
        public void Add(string name, CharacterDataInfo value)
        {
            AddCalls++;
            if (ThrowAdd) throw new InvalidOperationException("fixture cache add");
            Values[name] = value;
        }
        public CharacterDataInfo Get(string name, out bool exists)
        {
            GetCalls++;
            if (ThrowGet) throw new InvalidOperationException("fixture cache get");
            exists = Values.TryGetValue(name, out var value);
            return value;
        }
        public void Delete(string name)
        {
            DeleteCalls++;
            if (ThrowDelete) throw new InvalidOperationException("fixture cache delete");
            Values.Remove(name);
        }
        public IEnumerator<CharacterDataInfo> QueryCacheData() => Values.Values.GetEnumerator();
    }
}
