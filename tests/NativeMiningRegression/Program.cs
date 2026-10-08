using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using GameSrv.Maps;
using M2Server;
using M2Server.Event;
using M2Server.Event.Events;
using M2Server.Items;
using M2Server.Maps;
using M2Server.Net;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Common;
using OpenMir2.Data;
using OpenMir2.Enums;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using Serilog;
using SystemModule;
using SystemModule.Actors;
using SystemModule.Data;
using SystemModule.MagicEvent;
using SystemModule.MagicEvent.Events;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().WriteTo.Console().CreateLogger();
SystemShare.ActorMgr = new ActorMgr();
SystemShare.EventMgr = new EventManager();
M2Share.MiniMapList = new();
M2Share.NetChannel = DispatchProxy.Create<INetChannel, CaptureChannel>();
var items = new GameItemSystem();
foreach (string name in new[] { SystemShare.Config.GoldStone, SystemShare.Config.SilverStone,
    SystemShare.Config.SteelStone, SystemShare.Config.BlackStone, SystemShare.Config.CopperStone })
    items.StdItemList.Add(new StdItem { Name = name, StdMode = 43, Weight = 1, DuraMax = 26000 });
items.StdItemList.Add(new StdItem { Name = "test pickaxe", StdMode = 6, Shape = 19, DuraMax = 10000 });
SystemShare.ItemSystem = items;
Require(SystemShare.Config.MakeMineHitRate == 4 && SystemShare.Config.MakeMineRate == 12,
    "original default mining rates are unchanged");

string mapPath = Path.Combine(AppContext.BaseDirectory, "maps", "D401.map");
byte[] raw = File.ReadAllBytes(mapPath);
Require(Convert.ToHexString(SHA256.HashData(raw)).ToLowerInvariant() ==
    "81365b41fae7a2b1b45fa7db3f347caeb8bb6ae866299e410bc7cfb3d2da84b3", "locked source D401 map");
SystemShare.Config.MapDir = Path.GetDirectoryName(mapPath)!;
var manager = new MapManager();
SystemShare.MapMgr = manager;
manager.AddMapInfo("D401", "native mine", 0, new MapInfoFlag { Mine = true }, null!);
manager.AddMapInfo("D401Mine2|D401", "native second mine", 0, new MapInfoFlag { boMINE2 = true }, null!);
manager.AddMapInfo("D401Plain|D401", "non-mine", 0, new MapInfoFlag(), null!);
Require(manager.GetMineMaps().Count == 2, "real map registration includes MINE and MINE2 only");
typeof(GameSrv.Maps.Map).GetMethod("MakeStoneMines", BindingFlags.NonPublic | BindingFlags.Static)!
    .Invoke(null, null);
var mine = (Envirnoment)manager.FindMap("D401");
var second = (Envirnoment)manager.FindMap("D401Mine2");
var plain = (Envirnoment)manager.FindMap("D401Plain");
int expected = 0;
for (int x = 0; x < mine.Width; x++)
for (int y = 0; y < mine.Height; y++)
{
    bool eligible = !Walk(x, y) && AdjacentWalk(x, y);
    foreach (Envirnoment map in new[] { mine, second })
    {
        MapEvent node = map.GetEvent(x, y);
        Require(eligible == (node is StoneMineEvent), $"actual allocation exactly follows blocked + reachable wall cells at {map.MapName} ({x},{y}), expected {eligible}, actual {node?.GetType().Name ?? "none"}");
        if (node is StoneMineEvent stone)
            Require(stone.AddToMap && stone.MineCount is >= 1 and <= 200 &&
                stone.EventType == Grobal2.ET_MINE && stone.nX == x && stone.nY == y,
                "native node identity and unchanged initial quantity");
    }
    Require(plain.GetEvent(x, y) == null, "non-mining map receives no startup mining nodes");
    if (eligible) expected++;
}
Require(expected > 0, "source mine contains usable wall nodes");
Console.WriteLine($"PASS real MapManager and MakeStoneMines allocate {expected} D401 wall nodes per MINE/MINE2 map; non-mine remains empty");

Require(mine.CanWalk(25, 25, false) && !mine.CanWalk(24, 26, false), "fixture cell and direction 5 wall");
var wall = (StoneMineEvent)mine.GetEvent(24, 26);
mine.GetCellInfo(24, 26, out bool wallWalkAccess);
mine.GetCellInfo(25, 25, out bool floorWalkAccess);
Require(!wallWalkAccess && floorWalkAccess && wall != null, "wall event access does not broaden actor/movement cell access");
Require(mine.GetEvent(-1, 26) == null && mine.GetEvent(200, 26) == null &&
    mine.GetEvent(24, -1) == null && mine.GetEvent(24, 200) == null, "out-of-bounds event reads never alias cell zero");
Require(mine.GetEvent(25, 25) == null && !mine.CanWalk(24, 26, false) && mine.CanWalk(25, 25, false),
    "invisible mine nodes do not turn walls into walkable cells or block their adjacent floor");
Console.WriteLine("PASS locked D401 (25,25) -> direction 5 (24,26) accesses its actual wall event; normal movement and bounds remain unchanged");

string directory = Path.Combine(Path.GetTempPath(), "mir2-native-mining-" + Guid.NewGuid());
Directory.CreateDirectory(directory);
try
{
    string isolatedPath = Path.Combine(directory, "isolated.map");
    using (var writer = new BinaryWriter(File.Create(isolatedPath)))
    {
        writer.Write((short)3); writer.Write((short)3); writer.Write(new byte[48]);
        for (int i = 0; i < 9; i++) { writer.Write((ushort)0x8000); writer.Write(new byte[10]); }
    }
    using var isolated = new Envirnoment();
    Require(isolated.LoadMapData(isolatedPath), "load fully blocked boundary fixture");
    var edge = new StoneMineEvent(isolated, 0, 0, Grobal2.ET_MINE);
    var deep = new StoneMineEvent(isolated, 1, 1, Grobal2.ET_MINE);
    Require(!edge.AddToMap && !deep.AddToMap && isolated.GetEvent(0, 0) == null,
        "out-of-bounds neighbours and inaccessible rock cannot create mining nodes");
    var floorNode = new StoneMineEvent(mine, 25, 25, Grobal2.ET_MINE);
    Require(!floorNode.AddToMap && mine.GetEvent(25, 25) == null, "walkable floor cannot accept ordinary wall mining nodes");
    Console.WriteLine("PASS actual node construction rejects walkable floor, isolated rock and false reachable map edges");
}
finally { Directory.Delete(directory, true); }

var player = new PlayObject { Envir = mine, CurrX = 25, CurrY = 25, Dir = 5, SocketId = 101, FixedHideMode = true };
player.UseItems[ItemLocation.Weapon] = new UserItem { Index = 6, Dura = 10000, DuraMax = 10000 };
MethodInfo pile = typeof(PlayObject).GetMethod("PileStones", BindingFlags.NonPublic | BindingFlags.Instance)!;
bool Hit() => (bool)pile.Invoke(player, new object[] { 24, 26 })!;
wall.MineCount = 10;
SetRandom(new ScriptedRandom((4, 1)));
Require(!Hit() && wall.MineCount == 9 && player.ItemList.Count == 0 &&
    player.UseItems[ItemLocation.Weapon].Dura == 10000, "miss consumes one node attempt without fragments, ore or tool wear");
Require(mine.GetEvent(25, 25) == null, "miss cannot create a stone pile");
Console.WriteLine("PASS real PileStones miss follows original Random(4), node consumption and no ore/tool-wear path");

var noOre = new ScriptedRandom((4, 0), (12, 1), (15, 0));
SetRandom(noOre);
Require(Hit() && wall.MineCount == 8 && player.ItemList.Count == 0 &&
    player.UseItems[ItemLocation.Weapon].Dura == 9995 && mine.GetEvent(25, 25) is PileStones,
    "stone hit without the separate ore roll still creates fragments and native tool wear");
noOre.Complete();
Console.WriteLine("PASS real PileStones hit and separate Random(12) ore refusal retain fragments and weapon wear");

CaptureChannel.Packets.Clear();
var oreRoll = new ScriptedRandom((4, 0), (12, 0), (120, 0), (13000, 12999), (20, 0), (10000, 9999), (15, 14));
SetRandom(oreRoll);
Require(Hit(), "actual ore-producing stone hit");
oreRoll.Complete();
UserItem ore = player.ItemList.Single();
Require(items.GetStdItem(ore.Index).Name == SystemShare.Config.CopperStone && ore.MakeIndex != 0 &&
    ore.Dura == 25998 && player.UseItems[ItemLocation.Weapon].Dura == 9976,
    "actual MakeMine preserves ore type, identity, raw purity and weapon wear");
Require(CaptureChannel.Packets.Count == 1, "actual ore allocation emits exactly one native SM200 packet");
byte[] packet = CaptureChannel.Packets.Single();
var header = SerializerUtil.Deserialize<ServerMessage>(packet.AsSpan(0, ServerMessage.PacketSize).ToArray());
var command = SerializerUtil.Deserialize<CommandMessage>(packet.AsSpan(ServerMessage.PacketSize, CommandMessage.Size).ToArray());
byte[] payload = EDCode.DecodeBuffer(packet.AsSpan(ServerMessage.PacketSize + CommandMessage.Size).ToArray()).ToArray();
Require(header.Socket == player.SocketId && command.Ident == Messages.SM_ADDITEM && command.Ident == 200 &&
    BitConverter.ToInt32(payload, 100) == ore.MakeIndex && BitConverter.ToUInt16(payload, 104) == ore.Dura,
    "actual SM200 header and decoded body retain the native ore identity and raw purity");
Console.WriteLine("PASS real PileStones -> MakeMine -> GameItemSystem creates the native ore instance with unchanged 4/12/type/purity rolls and SM200");

player.ItemList.Clear();
for (int i = 0; i < Grobal2.MaxBagItem; i++) player.ItemList.Add(new UserItem { Index = 5 });
CaptureChannel.Packets.Clear();
var fullBag = new ScriptedRandom((4, 0), (12, 0), (15, 0));
SetRandom(fullBag);
Require(Hit() && player.ItemList.Count == Grobal2.MaxBagItem && CaptureChannel.Packets.Count == 0,
    "full inventory preserves DIG-worthy hit but suppresses ore/type/purity allocation");
fullBag.Complete(); player.ItemList.Clear();
Console.WriteLine("PASS actual full-bag MakeMine returns without invented ore or SM200 while the stone hit still occurs");

wall.MineCount = 0; wall.AddStoneMineTick = HUtil32.GetTickCount();
SetRandom(new ScriptedRandom());
Require(!Hit() && wall.MineCount == 0, "depleted node does not roll or replenish before ten minutes");
wall.AddStoneMineTick = HUtil32.GetTickCount() - 10 * 60 * 1000 - 1;
Require(!Hit() && wall.MineCount is >= 1 and <= 80, "first expired-node hit replenishes unchanged 1..80 but does not mine immediately");
Console.WriteLine("PASS actual exhausted-node path waits ten minutes and replenishes its original amount without mining on the same attempt");

using var fireMap = new Envirnoment();
Require(fireMap.LoadMapData(mapPath), "load floor-event mining fixture");
fireMap.Flag.Mine = true;
SetRandom(new Random(0));
var fireWall = new StoneMineEvent(fireMap, 24, 26, Grobal2.ET_MINE);
player.Envir = fireMap; fireWall.MineCount = 10;
var floorEvent = new FireBurnEvent(player, 25, 25, Grobal2.ET_FIRE, 60000, 1);
var fireOre = new ScriptedRandom((4, 0), (12, 0), (120, 0), (13000, 0), (20, 1), (15, 0));
SetRandom(fireOre);
Require(Hit() && ReferenceEquals(fireMap.GetEvent(25, 25), floorEvent) && player.ItemList.Count == 1 &&
    player.ItemList[0].Dura == 3000,
    "standing in another floor event cannot throw or replace that event on a mining hit");
fireOre.Complete();
Console.WriteLine("PASS actual mining hit coexists with an existing fire floor event without invalid casts or duplicate stone piles");

bool Walk(int x, int y) => x >= 0 && y >= 0 && x < 200 && y < 200 &&
    ((BitConverter.ToUInt16(raw, 52 + (x * 200 + y) * 12) |
      BitConverter.ToUInt16(raw, 56 + (x * 200 + y) * 12)) & 0x8000) == 0;
bool AdjacentWalk(int x, int y)
{
    for (int dx = -1; dx <= 1; dx++) for (int dy = -1; dy <= 1; dy++)
        if (Walk(x + dx, y + dy)) return true;
    return false;
}
static void Require(bool condition, string message)
{ if (!condition) throw new Exception("FAIL: " + message); }
static void SetRandom(Random random) => typeof(RandomNumber).GetField("random", BindingFlags.NonPublic | BindingFlags.Static)!
    .SetValue(null, random);

public sealed class ScriptedRandom : Random
{
    private readonly Queue<(int Bound, int Value)> sequence;
    public ScriptedRandom(params (int Bound, int Value)[] values) => sequence = new(values);
    public override int Next(int maxValue)
    {
        if (!sequence.TryDequeue(out var next) || next.Bound != maxValue || next.Value < 0 || next.Value >= maxValue)
            throw new Exception("FAIL: unexpected production mining random bound " + maxValue);
        return next.Value;
    }
    public void Complete()
    { if (sequence.Count != 0) throw new Exception("FAIL: production skipped a required mining random roll"); }
}
public class CaptureChannel : DispatchProxy
{
    public static readonly List<byte[]> Packets = new();
    protected override object Invoke(MethodInfo method, object[] args)
    {
        if (method.Name == "AddGateBuffer") { Packets.Add((byte[])args[1]); return null!; }
        throw new NotSupportedException(method.Name);
    }
}
