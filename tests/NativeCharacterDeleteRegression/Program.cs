using System.Buffers.Binary;
using System.Collections;
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
using OpenMir2.Data;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using TouchSocket.Sockets;

// Actual UserService/DeleteChr and native TCP output; fake storage boundary only.
// No authentication, production accounts, settings files or SQL in this mode.
EncodingSetup();
if (args.Length == 2) { SqlChecks.Run(args); return; }
if (args.Length != 0) throw new ArgumentException("This regression accepts no settings.");
int groups = 0;
foreach (var test in new (string Name, Action<Fixture> Setup, bool Success)[]
{
    ("owned low-level character", f => {}, true),
    ("wrong owner", f => f.Records.Record.sAccount = "other", false),
    ("empty owner", f => f.Account = "", false),
    ("missing record index", f => f.Records.IndexValue = -1, false),
    ("record read failed", f => f.Records.Found = false, false),
    ("record read returned null with true", f => f.Records.Record = null, false),
    ("stale record index names another character", f => f.Records.Record.sChrName = "Other", false),
    ("already deleted record", f => f.Records.Record.Deleted = true, false),
    ("already deleted header", f => f.Records.Record.Header.Deleted = true, false),
    ("missing level index", f => f.Data.IndexValue = -1, false),
    ("level read failed", f => f.Data.Found = false, false),
    ("missing level row returned true", f => f.Data.Character = null, false),
    ("level row belongs to another character", f => f.Data.Character.Name = "Other", false),
    ("level just below limit", f => f.Data.Character.Level = 29, true),
    ("level at limit", f => f.Data.Character.Level = 30, false),
    ("level above limit", f => f.Data.Character.Level = 31, false),
    ("zero level read successfully", f => f.Data.Character.Level = 0, true),
    ("nonpositive deletion limit", f => f.Settings.DeleteMinLevel = 0, false),
    ("Update false", f => f.Records.UpdateResult = false, false),
    ("Update throws", f => f.Records.ThrowAt = "update", false),
    ("record Index throws", f => f.Records.ThrowAt = "index", false),
    ("record Get throws", f => f.Records.ThrowAt = "get", false),
    ("level Index throws", f => f.Data.ThrowAt = "index", false),
    ("level query throws", f => f.Data.ThrowAt = "query", false),
    ("case-insensitive name index retains canonical record", f => f.RequestName = "fixture", true),
    ("GBK character name", f => {
        f.RequestName = f.Records.Record.sChrName = f.Records.Record.Header.Name = f.Data.Character.Name = "测试角色";
    }, true),
})
{
    await using var f = await Fixture.Create();
    test.Setup(f);
    var original = f.Records.Record;
    var reply = await f.Delete();
    Check(reply.Ident == (test.Success ? Messages.SM_DELCHR_SUCCESS : Messages.SM_DELCHR_FAIL), test.Name + " wrong ACK");
    Check(reply.Recog == 0 && reply.Param == 0 && reply.Tag == 0 && reply.Series == 0, "ACK field changed");
    Check(original == null || original.Deleted == (test.Name == "already deleted record"), "fetched record was mutated");
    if (test.Success)
    {
        Check(f.Records.UpdateCalls == 1 && f.Records.Persisted?.Deleted == true
            && f.Records.Persisted.Header.Deleted, "success without one committed deletion");
        Check(!ReferenceEquals(original, f.Records.Persisted)
            && f.Records.Persisted.Selected == 1 && f.Records.Persisted.Id == 17, "record identity was lost");
        f.Records.Record = f.Records.Persisted;
        Check((await f.Delete()).Ident == Messages.SM_DELCHR_FAIL && f.Records.UpdateCalls == 1, "duplicate deletion wrote again");
    }
    else
    {
        Check(f.Records.Persisted == null, "rejection published a deletion");
        if (!test.Name.StartsWith("Update")) Check(f.Records.UpdateCalls == 0, "invalid request reached Update");
    }
    groups++;
    Console.WriteLine("PASS native DeleteChr TCP: " + test.Name);
}
Console.WriteLine($"Native character deletion: {groups} groups passed.");

static void EncodingSetup()
{
    System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
    LogService.Logger = new Serilog.LoggerConfiguration().CreateLogger();
    DBShare.Initialization();
    ((HashSet<string>)typeof(DBShare).GetField("ServerIpList", BindingFlags.Static | BindingFlags.NonPublic)!.GetValue(null)!).Add("127.0.0.1");
}
static void Check(bool value, string reason) { if (!value) throw new InvalidOperationException(reason); }

sealed class Fixture : IAsyncDisposable
{
    public readonly Records Records = new();
    public readonly Data Data = new();
    public readonly SettingsModel Settings;
    public string Account = "fixture-owner", RequestName = "Fixture";
    private readonly UserService service;
    private readonly TcpService server;
    private readonly System.Net.Sockets.TcpClient peer = new();
    private string connectionId;
    private Fixture(int port)
    {
        Settings = new SettingsModel { GateAddr = "127.0.0.1", GatePort = port, DeleteMinLevel = 30 };
        service = new UserService(Settings, new ClientSession(Settings), Records, Data);
        server = (TcpService)typeof(UserService).GetField("_socketServer", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(service)!;
    }
    public static async Task<Fixture> Create()
    {
        var reservation = new TcpListener(IPAddress.Loopback, 0);
        reservation.Start();
        int port = ((IPEndPoint)reservation.LocalEndpoint).Port;
        reservation.Stop();
        var f = new Fixture(port);
        f.service.Initialize();
        f.server.Start(); // no permanent queue worker or login connection needed
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await f.peer.ConnectAsync(IPAddress.Loopback, port, timeout.Token);
        var gates = (SelGateInfo[])typeof(UserService).GetField("_gateClients", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(f.service)!;
        while (gates[0] == null) await Task.Delay(10, timeout.Token);
        f.connectionId = gates[0].ConnectionId;
        return f;
    }
    public async Task<CommandMessage> Delete()
    {
        object[] arguments = [EDCode.EncodeString(RequestName), new SessionUserInfo { sAccount = Account, ConnectionId = connectionId, SessionId = "fixture-session" }];
        typeof(UserService).GetMethod("DeleteChr", BindingFlags.Instance | BindingFlags.NonPublic)!.Invoke(service, arguments);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        var stream = peer.GetStream();
        byte[] header = new byte[6];
        await stream.ReadExactlyAsync(header, timeout.Token);
        if (BinaryPrimitives.ReadUInt32LittleEndian(header) != Grobal2.PacketCode) throw new Exception("invalid TCP packet code");
        byte[] body = new byte[BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(4))];
        await stream.ReadExactlyAsync(body, timeout.Token);
        var packet = SerializerUtil.Deserialize<ServerDataMessage>(body);
        string text = HUtil32.GetString(packet.Data, 0, packet.DataLen);
        if (packet.SocketId != "fixture-session" || packet.Type != ServerDataType.Data || !text.StartsWith('#') || !text.EndsWith('!'))
            throw new Exception("ACK lost session or framing");
        return EDCode.DecodePacket(text[1..^1]);
    }
    public ValueTask DisposeAsync() { peer.Dispose(); server.Stop(); server.Dispose(); return ValueTask.CompletedTask; }
}

sealed class Records : IPlayRecordStorage
{
    public int IndexValue = 17, UpdateCalls;
    public bool Found = true, UpdateResult = true;
    public string ThrowAt = "";
    public PlayerRecordData Record = new() { Id = 17, sAccount = "fixture-owner", sChrName = "Fixture", Selected = 1, Header = new RecordHeader { Name = "Fixture", sAccount = "fixture-owner", SelectID = 1 } };
    public PlayerRecordData Persisted;
    public void LoadQuickList() { }
    public int Index(string name) { Fail("index"); return IndexValue; }
    public PlayerRecordData Get(int index, ref bool success) { Fail("get"); success = Found; return Record; }
    public bool Update(int index, ref PlayerRecordData value)
    {
        UpdateCalls++; Fail("update");
        if (!UpdateResult) return false;
        Persisted = value;
        return true;
    }
    private void Fail(string phase) { if (ThrowAt == phase) throw new InvalidOperationException("isolated fixture"); }
    public PlayerRecordData GetBy(int index, ref bool success) => throw new NotSupportedException();
    public int FindByAccount(string account, ref IList<PlayQuick> list) => throw new NotSupportedException();
    public int ChrCountOfAccount(string account) => throw new NotSupportedException();
    public bool Add(PlayerRecordData value) => throw new NotSupportedException();
    public bool Delete(string name) => throw new NotSupportedException();
    public void UpdateBy(int index, ref PlayerRecordData value) => throw new NotSupportedException();
    public int FindByName(string name, ArrayList list) => throw new NotSupportedException();
}
sealed class Data : IPlayDataStorage
{
    public int IndexValue = 23;
    public bool Found = true;
    public string ThrowAt = "";
    public QueryChr Character = new() { Name = "Fixture", Level = 1 };
    public void LoadQuickList() { }
    public int Index(string name) { Fail("index"); return IndexValue; }
    public bool GetQryChar(int index, ref QueryChr value) { Fail("query"); value = Character; return Found; }
    private void Fail(string phase) { if (ThrowAt == phase) throw new InvalidOperationException("isolated fixture"); }
    public int Get(int index, ref CharacterDataInfo value) => throw new NotSupportedException();
    public bool Get(string name, ref CharacterDataInfo value) => throw new NotSupportedException();
    public CharacterData Query(int id) => throw new NotSupportedException();
    public bool Update(string name, CharacterDataInfo value) => throw new NotSupportedException();
    public bool UpdateQryChar(int index, QueryChr value) => throw new NotSupportedException();
    public bool Add(CharacterDataInfo value) => throw new NotSupportedException();
    public int Find(string name, StringDictionary list) => throw new NotSupportedException();
    public bool Delete(int index) => throw new NotSupportedException();
    public bool Delete(string name) => throw new NotSupportedException();
    public int Count() => throw new NotSupportedException();
}
