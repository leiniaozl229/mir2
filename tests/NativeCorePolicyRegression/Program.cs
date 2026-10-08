using System.Reflection;
using System.Text;
using GameSrv.Word;
using M2Server;
using M2Server.Actor;
using M2Server.Event;
using M2Server.Event.Events;
using M2Server.Items;
using M2Server.Maps;
using M2Server.Monster;
using M2Server.Net;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Consts;
using OpenMir2.Data;
using OpenMir2.Enums;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using Serilog;
using SystemModule;
using SystemModule.Actors;
using SystemModule.Data;
using SystemModule.MagicEvent.Events;
using SystemModule.Maps;
using SystemModule.SubSystem;

// No service startup, database, production map/config mutation or account is used.
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().CreateLogger();
SystemShare.ActorMgr = new ActorMgr();
SystemShare.CastleMgr = DispatchProxy.Create<ICastleSystem, NullServices>();
SystemShare.EventMgr = new EventManager();
SystemShare.WorldEngine = DispatchProxy.Create<IWorldEngine, NullServices>();
SystemShare.MapMgr = DispatchProxy.Create<IMapSystem, MapServices>();
M2Share.NetChannel = DispatchProxy.Create<INetChannel, CaptureChannel>();
M2Share.StartPointList = new List<StartPoint>();
M2Share.MiniMapList = new();
M2Share.MonSayMsgList = new();
var items = new GameItemSystem();
items.StdItemList.Add(new StdItem { Name = "v10 sword", StdMode = 5, DuraMax = 65535 });
items.StdItemList.Add(new StdItem { Name = "v10 dress", StdMode = 10, DuraMax = 65535 });
items.StdItemList.Add(new StdItem { Name = "v10 ring", StdMode = 22, Shape = 114, DuraMax = 65535 });
SystemShare.ItemSystem = items;
string directory = Path.Combine(Path.GetTempPath(), "mir2-native-core-v10-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(directory);
var maps = new List<Envirnoment>();
int passed = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
void Test(string name, Action body)
{
    SetRandom(new Random(1729)); CaptureChannel.Packets.Clear(); CaptureChannel.OnPacket = null;
    M2Share.StartPointList = new List<StartPoint>();
    SystemShare.Config.SafeZoneSize = 2; SystemShare.Config.RedHomeMap = "none";
    body(); passed++; Console.WriteLine("PASS: " + name);
}
Envirnoment Map(string name = "v10", bool wall = false)
{
    string path = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".map");
    using (var w = new BinaryWriter(File.Create(path)))
    {
        w.Write((short)48); w.Write((short)48); w.Write(new byte[48]);
        for (int x = 0; x < 48; x++) for (int y = 0; y < 48; y++)
        { w.Write((ushort)(wall || (x == 30 && y == 30) ? 0x8001 : 1)); w.Write(new byte[10]); }
    }
    var map = new Envirnoment(); Check(map.LoadMapData(path), "load actual map parser");
    map.MapName = name; maps.Add(map); MapServices.Maps[name] = map; return map;
}
T At<T>(T actor, Envirnoment map, short x = 35, short y = 35) where T : BaseObject
{
    actor.Envir = map; actor.CurrX = x; actor.CurrY = y; actor.MapName = map.MapName;
    actor.FixedHideMode = false; actor.Abil.MaxHP = actor.Abil.HP = 500;
    actor.Abil.MaxMP = actor.Abil.MP = 50; actor.AbilCopyToWAbil();
    Check(map.AddMapObject(x, y, actor.CellType, actor.ActorId, actor), "add real map actor"); return actor;
}
UserItem Item(ushort index, ushort durability) => new() { Index = index, Dura = durability, DuraMax = 65535, MakeIndex = 1000 + index };
int DeletePackets() => CaptureChannel.Packets.Count(p => Command(p).Ident == Messages.SM_DELITEM);
CommandMessage Command(byte[] p) => SerializerUtil.Deserialize<CommandMessage>(p.AsSpan(ServerMessage.PacketSize, CommandMessage.Size).ToArray());
void AssertDeletionSnapshot(ProbePlayer actor, byte slot, ushort index, ushort durability)
{
    CaptureChannel.OnPacket = packet =>
    {
        if (Command(packet).Ident != Messages.SM_DELITEM) return;
        byte[] payload = EDCode.DecodeBuffer(packet.AsSpan(ServerMessage.PacketSize + CommandMessage.Size).ToArray()).ToArray();
        Check(actor.UseItems[slot].Index == index && actor.UseItems[slot].Dura == durability && actor.Recalculations == 0,
            "deletion occurs after slot clearing/recalculation instead of its original point");
        Check(BitConverter.ToInt32(payload, 100) == 1000 + index && BitConverter.ToUInt16(payload, 104) == durability,
            "actual deletion payload lost the instance identity/durability snapshot");
    };
}
SendMessage[] MessagesOf(ActorEntity actor, int ident) => Queue(actor).UnorderedItems.OrderBy(x => x.Priority.Order).Select(x => x.Element).Where(x => x.wIdent == ident).ToArray();
WorldServer World(byte race, string name, bool gold = false)
{
    var world = new WorldServer();
    var monsters = (IDictionary<string, MonsterInfo>)typeof(WorldServer).GetField("MonsterList", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(world)!;
    monsters[name] = new MonsterInfo { Name = name, Race = race, HP = 123, MP = 45,
        ItemList = gold ? new List<MonsterDropItem> { new() { ItemName = Grobal2.StringGoldName, MaxPoint = 1, SelPoint = 0, Count = 100 } } : null };
    return world;
}
IMonsterActor Create(WorldServer world, Envirnoment map, byte race, bool natural, short x = 20, short y = 20) =>
    (IMonsterActor)typeof(WorldServer).GetMethod("CreateMonster", BindingFlags.NonPublic | BindingFlags.Instance)!
    .Invoke(world, new object[] { map.MapName, x, y, (int)race, "v10-mon", natural })!;
bool Respawn(WorldServer world, IMonsterActor actor) => (bool)typeof(WorldServer).GetMethod("RespawnMonster", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(world, new object[] { actor })!;
bool Regen(WorldServer world, MonGenInfo info) => (bool)typeof(WorldServer).GetMethod("RegenMonsters", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(world, new object[] { info, 1 })!;
try
{
    foreach (ushort durability in new ushort[] { 0, 4, 5, 6, 65535 })
    {
        Test("actual DoDamageWeapon saturates, deletes and notifies: " + durability, () =>
        {
            var p = At(new ProbePlayer { SocketId = 110 }, Map()); p.UseItems[ItemLocation.Weapon] = Item(1, durability);
            AssertDeletionSnapshot(p, ItemLocation.Weapon, 1, 0);
            var random = new StrictRandom(); SetRandom(random);
            p.DamageWeapon(5); random.Complete();
            Check(p.UseItems[ItemLocation.Weapon].Dura == Math.Max(0, durability - 5), "weapon unsigned wrap");
            Check(p.UseItems[ItemLocation.Weapon].Index == (durability <= 5 ? 0 : 1), "weapon removal threshold");
            Check(DeletePackets() == (durability <= 5 ? 1 : 0), "actual weapon deletion packet missing/duplicated");
            Check(MessagesOf(p, Messages.RM_DURACHANGE).Length == (durability == 0 ? 1 : durability <= 5 ? 2 : 1), "existing weapon durability notification count changed");
            Check(p.Recalculations == 0, "weapon damage introduced a new ability recalculation");
        });
    }
    Test("actual floating weapon zero-cost keeps its existing notification and consumes no RNG", () =>
    {
        var p = At(new ProbePlayer { SocketId = 110 }, Map()); p.UseItems[ItemLocation.Weapon] = Item(1, 1000);
        var random = new StrictRandom(); SetRandom(random); p.DamageWeapon(0); random.Complete();
        Check(p.UseItems[ItemLocation.Weapon].Index == 1 && p.UseItems[ItemLocation.Weapon].Dura == 1000 && DeletePackets() == 0, "zero-cost weapon changed");
        Check(MessagesOf(p, Messages.RM_DURACHANGE).Length == 1, "existing floating-point comparison behavior changed");
    });
    foreach (ushort durability in new ushort[] { 0, 4, 5, 6, 501, 65535 })
    {
        Test("actual StruckDamage dress preserves RNG and break/recalc chain: " + durability, () =>
        {
            var p = At(new ProbePlayer { SocketId = 110 }, Map()); p.UseItems[ItemLocation.Dress] = Item(2, durability);
            AssertDeletionSnapshot(p, ItemLocation.Dress, 2, durability);
            var random = durability <= 5 ? new StrictRandom((10, 0)) : new StrictRandom((10, 0), (8, 1)); SetRandom(random);
            p.StruckDamage(1); random.Complete();
            Check(p.UseItems[ItemLocation.Dress].Dura == Math.Max(0, durability - 5), "dress unsigned wrap");
            Check(p.UseItems[ItemLocation.Dress].Index == (durability <= 5 ? 0 : 2), "dress removal threshold changed");
            Check(DeletePackets() == (durability <= 5 ? 1 : 0), "dress deletion packet incorrect");
            Check(MessagesOf(p, Messages.RM_DURACHANGE).Length == (durability == 501 ? 1 : 0), "dress rounding threshold notification changed");
            Check(p.Recalculations == (durability <= 5 ? 1 : 0), "dress recalculation changed");
            if (durability <= 5) Check(MessagesOf(p, Messages.RM_ABILITY).Length == 1 && MessagesOf(p, Messages.RM_SUBABILITY).Length == 1, "broken dress ability notifications lost");
        });
        Test("actual StruckDamage accessory preserves RNG and saturated removal: " + durability, () =>
        {
            var p = At(new ProbePlayer { SocketId = 110 }, Map()); p.UseItems[ItemLocation.Ringl] = Item(3, durability);
            AssertDeletionSnapshot(p, ItemLocation.Ringl, 3, durability);
            var random = new StrictRandom((10, 0), (8, 0)); SetRandom(random); p.StruckDamage(1); random.Complete();
            Check(p.UseItems[ItemLocation.Ringl].Dura == Math.Max(0, durability - 5), "accessory unsigned wrap");
            Check(p.UseItems[ItemLocation.Ringl].Index == (durability <= 5 ? 0 : 3), "accessory removal threshold changed");
            Check(DeletePackets() == (durability <= 5 ? 1 : 0) && p.Recalculations == (durability <= 5 ? 1 : 0), "accessory break/recalc chain changed");
            Check(MessagesOf(p, Messages.RM_DURACHANGE).Length == (durability == 501 ? 1 : 0), "accessory rounding threshold notification changed");
        });
    }
    Test("actual poison-scaled zero wear preserves equipped item and RNG", () =>
    {
        int prior = SystemShare.Config.PosionDamagarmor;
        try
        {
            SystemShare.Config.PosionDamagarmor = 0;
            var p = At(new ProbePlayer { SocketId = 110 }, Map()); p.UseItems[ItemLocation.Dress] = Item(2, 1000); p.StatusTimeArr[PoisonState.DAMAGEARMOR] = 1;
            var random = new StrictRandom((10, 0), (8, 0)); SetRandom(random); p.StruckDamage(1); random.Complete();
            Check(p.UseItems[ItemLocation.Dress].Dura == 1000 && p.UseItems[ItemLocation.Dress].Index == 2 && DeletePackets() == 0 && p.Recalculations == 0, "zero wear broke an item");
        }
        finally { SystemShare.Config.PosionDamagarmor = prior; }
    });
    foreach (ushort durability in new ushort[] { 0, 999, 1000, 1001, 65535 })
    {
        Test("actual revival-ring consumption saturates and recalculates: " + durability, () =>
        {
            var p = At(new ProbePlayer { SocketId = 110 }, Map()); p.UseItems[ItemLocation.Ringl] = Item(3, durability);
            AssertDeletionSnapshot(p, ItemLocation.Ringl, 3, 0);
            var random = new StrictRandom(); SetRandom(random);
            typeof(PlayObject).GetMethod("ItemDamageRevivalRing", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(p, null); random.Complete();
            Check(p.UseItems[ItemLocation.Ringl].Dura == Math.Max(0, durability - 1000), "revival-ring unsigned wrap");
            Check(p.UseItems[ItemLocation.Ringl].Index == (durability <= 1000 ? 0 : 3), "revival-ring removal threshold changed");
            Check(DeletePackets() == (durability <= 1000 ? 1 : 0) && p.Recalculations == (durability <= 1000 ? 1 : 0), "revival-ring break/recalc chain changed");
            Check(MessagesOf(p, Messages.RM_DURACHANGE).Length == (durability == 0 ? 0 : 1), "revival-ring rounding threshold notification changed");
        });
    }
    Test("shared actual safe geometry covers square corners, map case, RedHome, SafeArea and null list", () =>
    {
        var map = Map("safe-test"); M2Share.StartPointList.Add(new StartPoint { MapName = "SAFE-TEST", CurrX = 20, CurrY = 20 });
        Check(BaseObject.IsSafeZonePosition(map, 22, 18) && !BaseObject.IsSafeZonePosition(map, 23, 20), "square radius/case changed");
        var actor = At(new ProbeMonster(), map, 22, 18); Check(actor.InSafeZone() && actor.InSafeZone(map, 22, 18), "instance geometries diverged");
        M2Share.StartPointList = null; Check(!BaseObject.IsSafeZonePosition(map, 20, 20), "null start list throws or invents protection");
        SystemShare.Config.RedHomeMap = "SAFE-TEST"; SystemShare.Config.RedHomeX = 10; SystemShare.Config.RedHomeY = 10;
        Check(BaseObject.IsSafeZonePosition(map, 12, 8) && !BaseObject.IsSafeZonePosition(map, 13, 10), "RedHome geometry changed");
        map.Flag.SafeArea = true; Check(BaseObject.IsSafeZonePosition(map, 45, 45) && BaseObject.IsSafeZonePosition(null, 1, 1), "SafeArea/null semantics changed");
    });
    foreach (var (race, hostile) in new (byte, bool)[] { (51, false), (52, false), (53, true), (54, true), (55, false), (80, true), (110, false), (111, false), (112, false) })
    {
        Test("actual WalkTo safe boundary follows natural race policy: " + race, () =>
        {
            var map = Map(); M2Share.StartPointList.Add(new StartPoint { MapName = map.MapName, CurrX = 20, CurrY = 20 });
            var actor = At(new ProbeMonster { Race = race }, map, 23, 20);
            Check(BaseObject.IsAggressiveMonsterRace(race) == hostile, "race predicate changed from the explicit policy");
            Check(actor.Step(Direction.Left) == !hostile && actor.CurrX == (hostile ? 23 : 22), "actual safe walk classification changed");
        });
    }
    Test("actual Master walk remains allowed by existing summon behavior", () =>
    {
        var map = Map(); M2Share.StartPointList.Add(new StartPoint { MapName = map.MapName, CurrX = 20, CurrY = 20 });
        var actor = At(new ProbeMonster { Race = 53 }, map, 23, 20); actor.Master = At(new ProbePlayer(), map, 40, 40);
        Check(actor.Step(Direction.Left) && actor.CurrX == 22, "master was incorrectly treated as a natural spawn");
    });
    Test("actual fearFire allows ordinary floor and cannot bypass safe rejection", () =>
    {
        var map = Map(); var actor = At(new ProbeMonster { Race = 53 }, map, 23, 20);
        Check(actor.Step(Direction.Right, true) && actor.CurrX == 24, "ordinary safe floor is treated as fire");
        M2Share.StartPointList.Add(new StartPoint { MapName = map.MapName, CurrX = 20, CurrY = 20 }); actor.CurrX = 23;
        map.DeleteFromMap(24, 20, actor.CellType, actor.ActorId, actor); map.AddMapObject(23, 20, actor.CellType, actor.ActorId, actor);
        Check(!actor.Step(Direction.Left, true) && actor.CurrX == 23, "fearFire re-enabled a rejected safe-zone walk");
    });
    Test("actual fearFire rejects a real damage event without blocking ordinary wall/bounds rules", () =>
    {
        var map = Map(); var actor = At(new ProbeMonster { Race = 53 }, map, 23, 20);
        var fire = new FireBurnEvent(actor, 24, 20, Grobal2.ET_FIRE, 60000, 1);
        Check(!map.CanSafeWalk(24, 20) && !actor.Step(Direction.Right, true) && actor.CurrX == 23, "real fire floor is not rejected");
        var wallActor = At(new ProbeMonster { Race = 53 }, map, 29, 30); Check(!wallActor.Step(Direction.Right, true), "fire path walked into a wall");
        var edge = At(new ProbeMonster { Race = 53 }, map, 0, 0); Check(!edge.Step(Direction.Left, true), "fire path walked out of bounds");
    });
    Test("actual IsAttackTarget rejects both safe player and safe natural attacker; Master exemption remains", () =>
    {
        var map = Map(); M2Share.StartPointList.Add(new StartPoint { MapName = map.MapName, CurrX = 20, CurrY = 20 });
        var actor = At(new ProbeMonster { Race = 53 }, map, 20, 20); var player = At(new ProbePlayer(), map, 25, 20);
        Check(!actor.TargetAllowed(player), "natural actor attacks from safe zone");
        actor.Master = At(new ProbePlayer(), map, 40, 40); actor.Master.TargetCret = player;
        Check(actor.TargetAllowed(player), "master targeting was blocked by the natural-only attacker guard");
        actor.Master = null; actor.CurrX = 25; player.CurrX = 20; Check(!actor.TargetAllowed(player), "safe player target allowed");
    });
    Test("actual natural CreateMonster finds walkable non-safe cell; default script and chicken stay at requested safe cell", () =>
    {
        var map = Map(); M2Share.StartPointList.Add(new StartPoint { MapName = map.MapName, CurrX = 20, CurrY = 20 });
        var wolf = Create(World(53, "v10-mon"), map, 53, true);
        Check(wolf != null && !wolf.InSafeZone() && map.CanWalk(wolf.CurrX, wolf.CurrY, true), "natural create publishes forbidden position");
        var script = Create(World(53, "v10-mon"), map, 53, false);
        Check(script != null && script.CurrX == 20 && script.CurrY == 20, "default script was relocated");
        var chicken = Create(World(51, "v10-mon"), map, 51, false);
        Check(chicken != null && chicken.CurrX == 20 && chicken.CurrY == 20, "passive chicken was relocated");
    });
    Test("actual natural spawn rejects all-safe, all-wall and invalid initial positions without false success", () =>
    {
        var map = Map(); map.Flag.SafeArea = true;
        var random = new StrictRandom(); SetRandom(random); Check(Create(World(53, "v10-mon"), map, 53, true) == null, "all-safe natural create succeeded"); random.Complete();
        var wall = Map("wall", true); SetRandom(new StrictRandom()); Check(Create(World(53, "v10-mon"), wall, 53, true) == null, "all-wall natural create succeeded");
        SetRandom(new Random(1729));
        var open = Map("open"); var created = Create(World(53, "v10-mon"), open, 53, true, -1, -1);
        Check(created != null && created.CurrX >= 0 && created.CurrY >= 0 && !created.InSafeZone(), "out-of-bounds requested spawn is published");
    });
    foreach (bool allSafe in new[] { false, true })
    {
        Test("actual CreateMonster fallback rechecks safe policy after failed initialization: " + allSafe, () =>
        {
            var map = Map();
            var proxy = DispatchProxy.Create<IEnvirnoment, SpawnFallbackMap>();
            var boundary = (SpawnFallbackMap)(object)proxy;
            boundary.Inner = map; boundary.AllSafeAfterInitialization = allSafe;
            MapServices.Maps[map.MapName] = proxy;
            var actor = Create(World(53, "v10-mon"), map, 53, true, 35, 35);
            Check(boundary.InitializeFailed, "test did not enter the production fallback");
            if (allSafe) Check(actor == null && boundary.Published == 0, "fallback published a monster after all cells became safe");
            else Check(actor != null && !actor.InSafeZone() && boundary.Published == 1, "fallback bypassed new safe boundary or published twice");
        });
    }
    foreach (int mission in new[] { 0, 100 })
    {
        Test("actual natural RegenMonsters normal/mission selects the protected pipeline: " + mission, () =>
        {
            var map = Map(); M2Share.StartPointList.Add(new StartPoint { MapName = map.MapName, CurrX = 20, CurrY = 20 });
            var info = new MonGenInfo { MapName = map.MapName, Envir = map, MonName = "v10-mon", Race = 53, X = 20, Y = 20, Range = 0, MissionGenRate = (byte)mission, CertList = new List<IMonsterActor>() };
            SetRandom(new CenterSpawnRandom());
            Check(Regen(World(53, "v10-mon"), info) && info.ActiveCount == 1 && info.CertList.Count == 1,
                "natural generator failed its legitimate spawn");
            var actor = info.CertList[0];
            Check(!actor.InSafeZone() && actor.CanReAlive && ReferenceEquals(actor.MonGen, info), "actual normal/mission native path skipped protection or lifetime registration");
        });
        Test("actual natural RegenMonsters normal/mission rejects no legal position: " + mission, () =>
        {
            var map = Map(); map.Flag.SafeArea = true;
            var info = new MonGenInfo { MapName = map.MapName, Envir = map, MonName = "v10-mon", Race = 53, X = 20, Y = 20, Range = 0, MissionGenRate = (byte)mission, CertList = new List<IMonsterActor>() };
            Check(!Regen(World(53, "v10-mon"), info) && info.ActiveCount == 0 && info.CertList.Count == 0, "generator claims failed spawn completed");
        });
    }
    Test("actual World Respawn rejects impossible natural life before clearing corpse or rolling drops", () =>
    {
        var map = Map(); map.Flag.SafeArea = true;
        var actor = new ProbeMonster { Race = 53, Envir = map, CurrX = 20, CurrY = 20, ChrName = "v10-mon", CanReAlive = true, Death = true, Invisible = true, Gold = 777, ItemList = new List<UserItem>() };
        actor.ItemList.Add(new UserItem { Index = 1, MakeIndex = 7654 }); actor.ProcessRunCount = 9; actor.ReAliveTick = 42;
        actor.MonGen = new MonGenInfo { Envir = map, X = 20, Y = 20, Range = 0 };
        var random = new StrictRandom(); SetRandom(random);
        Check(!Respawn(World(53, "v10-mon", true), actor), "no-position natural life falsely revived"); random.Complete();
        Check(actor.Death && actor.Invisible && actor.Gold == 777 && actor.ItemList.Count == 1 && actor.ProcessRunCount == 9 && actor.ReAliveTick == 42, "failed respawn cleared old life or rolled new drops");
    });
    Test("actual World Respawn succeeds outside safe zone and resets ability, corpse, and fresh gold once", () =>
    {
        var map = Map(); M2Share.StartPointList.Add(new StartPoint { MapName = map.MapName, CurrX = 20, CurrY = 20 });
        var actor = new ProbeMonster { Race = 53, Envir = map, CurrX = 20, CurrY = 20, ChrName = "v10-mon", CanReAlive = true, Death = true, Invisible = true, Gold = 777, ItemList = new List<UserItem>() };
        actor.Abil.MaxHP = 123; actor.Abil.MaxMP = 45; actor.WAbil = actor.Abil.Clone(); actor.WAbil.HP = 0;
        actor.ItemList.Add(new UserItem { Index = 1 }); actor.ProcessRunCount = 9;
        actor.MonGen = new MonGenInfo { Envir = map, X = 20, Y = 20, Range = 0 };
        Check(Respawn(World(53, "v10-mon", true), actor) && !actor.Death && !actor.Invisible && !actor.InSafeZone(), "successful natural life remained dead/safe");
        Check(actor.WAbil.HP == 123 && actor.WAbil.MP == 45 && actor.Gold >= 50 && actor.Gold < 150 && actor.ItemList.Count == 0 && actor.ProcessRunCount == 0, "actual world reset/drop chain changed");
        Check(!ReferenceEquals(actor.Abil, actor.WAbil), "revive lost ability clone separation");
    });
    Test("actual script-default and Master ReAliveEx preserve their existing safe positions", () =>
    {
        var map = Map(); M2Share.StartPointList.Add(new StartPoint { MapName = map.MapName, CurrX = 20, CurrY = 20 });
        var script = new ProbeMonster { Race = 53, Envir = map, CurrX = 20, CurrY = 20, Death = true, CanReAlive = false };
        var info = new MonGenInfo { Envir = map, X = 20, Y = 20, Range = 0 };
        Check(script.ReAliveEx(info) && script.CurrX == 20 && script.CurrY == 20, "script-default revive was relocated");
        var pet = new ProbeMonster { Race = 53, Envir = map, CurrX = 21, CurrY = 20, Death = true, CanReAlive = true, Master = At(new ProbePlayer(), map, 40, 40) };
        info.X = 21; Check(pet.ReAliveEx(info) && pet.CurrX == 21, "Master revive was treated as natural");
    });
    Console.WriteLine($"Native core policy regression passed: {passed} cases; real production behavior with isolated maps/actors, no DB/service/native-client/browser execution.");
}
finally { foreach (var map in maps) map.Dispose(); Directory.Delete(directory, true); }

static PriorityQueue<SendMessage, (byte Priority, long Order)> Queue(ActorEntity actor) =>
    (PriorityQueue<SendMessage, (byte Priority, long Order)>)typeof(ActorEntity).GetField("MsgQueue", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(actor)!;
static void SetRandom(Random random) => typeof(RandomNumber).GetField("random", BindingFlags.NonPublic | BindingFlags.Static)!.SetValue(null, random);
public class ProbePlayer : PlayObject
{
    public int Recalculations;
    public void DamageWeapon(ushort cost) => DoDamageWeapon(cost);
    public override void RecalcAbilitys() { Recalculations++; base.RecalcAbilitys(); }
}
public class ProbeMonster : MonsterObject
{
    public bool Step(byte direction, bool fearFire = false) => WalkTo(direction, false, fearFire);
    public bool TargetAllowed(IActor target) => IsAttackTarget(target);
}
public class StrictRandom : Random
{
    readonly Queue<(int Bound, int Value)> expected;
    public StrictRandom(params (int Bound, int Value)[] values) => expected = new(values);
    public override int Next(int bound)
    {
        if (!expected.TryDequeue(out var next) || next.Bound != bound) throw new Exception("unexpected production RNG bound " + bound);
        return next.Value;
    }
    public void Complete() { if (expected.Count != 0) throw new Exception("missing production RNG call"); }
}
public class CenterSpawnRandom : Random
{
    public override int Next(int bound) => bound == 20 ? 10 : 0;
}
public class CaptureChannel : DispatchProxy
{
    public static readonly List<byte[]> Packets = new();
    public static Action<byte[]> OnPacket;
    protected override object Invoke(MethodInfo method, object[] args)
    {
        if (method.Name == "AddGateBuffer") { byte[] packet = (byte[])args[1]; Packets.Add(packet); OnPacket?.Invoke(packet); return null; }
        throw new NotSupportedException(method.Name);
    }
}
public class MapServices : DispatchProxy
{
    public static readonly Dictionary<string, IEnvirnoment> Maps = new(StringComparer.OrdinalIgnoreCase);
    protected override object Invoke(MethodInfo method, object[] args)
    {
        if (method.Name == "FindMap") return Maps.TryGetValue((string)args[0], out var map) ? map : null;
        if (method.Name == "GetMapOfServerIndex") return (int)M2Share.ServerIndex;
        throw new NotSupportedException(method.Name);
    }
}
public class SpawnFallbackMap : DispatchProxy
{
    public Envirnoment Inner;
    public bool AllSafeAfterInitialization, InitializeFailed;
    public int Published;
    protected override object Invoke(MethodInfo method, object[] args)
    {
        if (method.Name == "CanWalk" && (bool)args[2] && !InitializeFailed)
        {
            InitializeFailed = true;
            if (AllSafeAfterInitialization) Inner.Flag.SafeArea = true;
            else M2Share.StartPointList.Add(new StartPoint { MapName = Inner.MapName, CurrX = Convert.ToInt16(args[0]), CurrY = Convert.ToInt16(args[1]) });
            return false;
        }
        object value = method.Invoke(Inner, args);
        if (method.Name == "AddMapObject" && value is true) Published++;
        return value;
    }
}
public class NullServices : DispatchProxy
{
    protected override object Invoke(MethodInfo method, object[] args) => method.ReturnType == typeof(void) ? null
        : method.ReturnType.IsValueType ? Activator.CreateInstance(method.ReturnType) : null;
}
