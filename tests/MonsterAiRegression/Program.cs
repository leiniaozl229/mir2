using System.Reflection;
using System.Text;
using M2Server;
using M2Server.Actor;
using M2Server.Items;
using M2Server.Maps;
using M2Server.Monster;
using M2Server.Monster.Monsters;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Consts;
using OpenMir2.Data;
using OpenMir2.Enums;
using Serilog;
using SystemModule;
using SystemModule.Actors;
using SystemModule.Data;
using SystemModule.SubSystem;
using GameSrv.Word;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().WriteTo.Console().CreateLogger();
SystemShare.ActorMgr = new ActorMgr();
M2Share.StartPointList = new List<StartPoint>();
SystemShare.CastleMgr = DispatchProxy.Create<ICastleSystem, NullServices>();
SystemShare.EventMgr = DispatchProxy.Create<IEventSystem, NullServices>();
SystemShare.WorldEngine = DispatchProxy.Create<IWorldEngine, NullServices>();
string directory = Path.Combine(Path.GetTempPath(), "mir2-monster-ai-" + Guid.NewGuid());
Directory.CreateDirectory(directory);
int failures = 0, checks = 0;
try
{
    string path = Path.Combine(directory, "test.map");
    using (var writer = new BinaryWriter(File.Create(path)))
    {
        writer.Write((short)80); writer.Write((short)80); writer.Write(new byte[48]);
        for (int i = 0; i < 6400; i++) { writer.Write((ushort)1); writer.Write(new byte[10]); }
    }
    Envirnoment Map()
    {
        var map = new Envirnoment();
        Require(map.LoadMapData(path), "load test map");
        return map;
    }
    T At<T>(T actor, Envirnoment map, short x = 30, short y = 30) where T : BaseObject
    {
        actor.Envir = map; actor.CurrX = x; actor.CurrY = y;
        actor.FixedHideMode = false;
        actor.AbilCopyToWAbil();
        actor.WalkSpeed = 1000000; // Keep Run deterministic: no wandering/movement.
        Require(map.AddMapObject(x, y, actor.CellType, actor.ActorId, actor), "add actor");
        return actor;
    }
    void Check(string label, Action test)
    {
        checks++;
        try { test(); Console.WriteLine("PASS: " + label); }
        catch (Exception error) { failures++; Console.WriteLine("FAIL: " + label + " — " + error.GetBaseException()); }
    }
    foreach (byte range in new byte[] { 5, 7, 8, 12 })
    {
        Check($"player discovery uses monster range {range}", () =>
        {
            using var map = Map();
            var player = At(new PlayObject(), map);
            var monster = At(new ProbeMonster { ViewRange = range }, map, (short)(30 + range), 30);
            player.SearchViewRange();
            Require(Queue(monster).UnorderedItems.Any(item => item.Element.wIdent == Messages.RM_UPDATEVIEWRANGE), "notification at boundary");
        });
    }
    Check("player does not activate an ordinary monster beyond five cells", () =>
    {
        using var map = Map(); var player = At(new PlayObject(), map);
        var monster = At(new ProbeMonster(), map, 36, 30);
        player.SearchViewRange();
        Require(!Queue(monster).UnorderedItems.Any(item => item.Element.wIdent == Messages.RM_UPDATEVIEWRANGE), "no out-of-range notification");
    });
    Check("new discoveries are immediate, independent and deduplicated", () =>
    {
        using var map = Map(); var monster = At(new ProbeMonster(), map);
        var first = At(new PlayObject(), map, 31, 30); var second = At(new PlayObject(), map, 32, 30);
        Notify(monster, first); Notify(monster, second); Notify(monster, first);
        Require(monster.VisibleActors.Count == 2 && monster.IsVisibleActive, "both players registered without SearchTime delay");
        NotifyId(monster, 99999999); // stale messages must be harmless.
    });
    Check("stale discovery messages cannot activate distant or other-map actors", () =>
    {
        using var map = Map(); using var other = Map(); var monster = At(new ProbeMonster { SearchTick = 0 }, map);
        Notify(monster, At(new PlayObject(), map, 36, 30));
        Notify(monster, At(new PlayObject(), other, 31, 30));
        Require(monster.VisibleActors.Count == 0, "reject stale discovery");
    });
    Check("clearing unrelated stale actors preserves pursuit and removes every stale entry", () =>
    {
        using var map = Map(); var monster = At(new ProbeMonster(), map);
        var target = At(new PlayObject(), map, 40, 30); monster.SetTargetCreat(target);
        var dead = At(new PlayObject { Death = true }, map, 31, 30);
        var ghost = At(new PlayObject { Ghost = true }, map, 32, 30);
        monster.UpdateVisibleGay(dead); monster.UpdateVisibleGay(ghost); monster.FindTarget();
        Require(monster.TargetCret == target, "valid pursuit target retained");
        Require(monster.VisibleActors.Count == 0, "adjacent stale entries both removed");
    });
    Check("acquisition is five cells but pursuit persists through fifteen", () =>
    {
        using var map = Map(); var monster = At(new ProbeMonster(), map);
        var target = At(new PlayObject(), map, 36, 30);
        monster.UpdateVisibleGay(target); monster.FindTarget();
        Require(monster.TargetCret == null, "no new acquisition at six cells");
        target.CurrX = 35; monster.FindTarget(); Require(monster.TargetCret == target, "acquire at five cells");
        target.CurrX = 45; monster.Run(); Require(monster.TargetCret == target, "pursue at fifteen cells");
        monster.TargetX = 45; monster.TargetY = 30;
        target.CurrX = 46; monster.Run();
        Require(monster.TargetCret == null && monster.TargetX == -1 && monster.TargetY == -1, "release beyond fifteen cells and clear destination");
    });
    foreach (string invalid in new[] { "other map", "dead", "ghost", "hidden" })
    {
        Check("invalid adjacent target cannot be attacked: " + invalid, () =>
        {
            using var map = Map(); using var other = Map(); var monster = At(new ProbeMonster(), map);
            var target = At(new PlayObject(), map, 31, 30);
            monster.SetTargetCreat(target); monster.AttackTick = HUtil32.GetTickCount() - 10000;
            if (invalid == "other map") target.Envir = other;
            if (invalid == "dead") target.Death = true;
            if (invalid == "ghost") target.Ghost = true;
            if (invalid == "hidden") target.HideMode = true;
            monster.TryAttack();
            Require(monster.Attacks == 0 && monster.TargetCret == null, "reject before attack");
        });
    }
    Check("statue wakes at two cells, shares target within seven, retains other status bits", () =>
    {
        using var map = Map(); var statue = At(new ProbeStatue(), map);
        var neighbor = At(new ProbeStatue(), map, 23, 30); var outside = At(new ProbeStatue(), map, 22, 30);
        var player = At(new PlayObject(), map, 32, 32);
        statue.CharStatusEx |= 0x40000000;
        statue.UpdateVisibleGay(player); statue.Ready(); statue.Run();
        Require(!statue.StoneMode && statue.TargetCret == player, "trigger locks target immediately");
        Require(!neighbor.StoneMode && neighbor.TargetCret == player && neighbor.IsVisibleActive, "group wakes and acquires same target");
        Require(outside.StoneMode, "eight-cell neighbor stays asleep");
        Require((statue.CharStatusEx & 0x40000000) != 0 && (statue.CharStatusEx & PoisonState.STONEMODE) == 0, "only stone status cleared");
    });
    foreach (string invalid in new[] { "three cells", "ghost", "other map", "hidden" })
    {
        Check("statue ignores wake candidate: " + invalid, () =>
        {
            using var map = Map(); using var other = Map(); var statue = At(new ProbeStatue(), map);
            var player = At(new PlayObject(), map, 32, 30);
            if (invalid == "three cells") player.CurrX = 33;
            if (invalid == "ghost") player.Ghost = true;
            if (invalid == "other map") player.Envir = other;
            if (invalid == "hidden") player.HideMode = true;
            statue.UpdateVisibleGay(player); statue.Ready(); statue.Run(); Require(statue.StoneMode, "remain asleep");
        });
    }
    Check("king wakes and immediately locks trigger", () =>
    {
        using var map = Map(); var king = At(new ProbeKing(), map); var player = At(new PlayObject(), map, 32, 30);
        king.UpdateVisibleGay(player); king.Ready(); king.Run();
        Require(!king.StoneMode && king.TargetCret == player, "king acquires trigger");
    });
    Check("hidden players require CoolEye; observers never wake statues", () =>
    {
        using var map = Map(); var statue = At(new ProbeStatue { CoolEye = true }, map);
        var player = At(new PlayObject { HideMode = true, ObMode = true }, map, 32, 30);
        statue.UpdateVisibleGay(player); statue.Ready(); statue.Run(); Require(statue.StoneMode, "observer ignored");
        player.ObMode = false; statue.Ready(); statue.Run();
        Require(!statue.StoneMode && statue.TargetCret == player, "CoolEye sees spell hiding");
    });
    Check("player discovery messages drive actual statue awakening", () =>
    {
        using var map = Map(); var statue = At(new ProbeStatue(), map);
        var player = At(new PlayObject(), map, 32, 30);
        player.SearchViewRange(); statue.Run(); // Consume queued RM_UPDATEVIEWRANGE.
        statue.Ready(); statue.Run();
        Require(!statue.StoneMode && statue.TargetCret == player, "end-to-end discovery/wake");
    });
    Check("passive monster stays passive until retaliating and expires stale pursuit", () =>
    {
        using var map = Map(); var monster = At(new ProbeMonster(), map); var player = At(new PlayObject(), map, 31, 30);
        Notify(monster, player); monster.Run(); Require(monster.TargetCret == null, "no automatic aggression for passive class");
        player.CurrX = 40; monster.SetTargetCreat(player); monster.Run(); Require(monster.TargetCret == player, "retaliation can pursue beyond sight");
        monster.TargetFocusTick = HUtil32.GetTickCount() - 30001; monster.Run(); Require(monster.TargetCret == null, "thirty-second pursuit timeout");
    });
    Check("king summon waves occur at 80/60/40/20 percent, not on minor damage", () =>
    {
        using var map = Map(); var king = At(new ProbeKing { StoneMode = false, CharStatusEx = 0 }, map);
        king.WAbil.MaxHP = 1000; king.WAbil.HP = 999; NullServices.Summons = 0;
        king.ReadySearch(); king.Run(); Require(NullServices.Summons == 0, "99.9% does not summon");
        foreach (ushort hp in new ushort[] { 800, 600, 400, 200 })
        {
            int previous = NullServices.Summons; king.WAbil.HP = hp; king.ReadySearch(); king.Run();
            Require(NullServices.Summons > previous, "wave at " + hp);
            previous = NullServices.Summons; king.ReadySearch(); king.Run(); Require(NullServices.Summons == previous, "no duplicate wave at same HP");
        }
    });
    Check("tree boss can evaluate combat targets without an invalid class cast", () =>
    {
        using var map = Map(); var tree = At(new ProbeTree { Race = 115 }, map); var player = At(new PlayObject(), map, 31, 30);
        Require(tree.IsProperTarget(player), "tree may attack player");
        tree.RecalcAbilitys(); Require(tree.WAbil.MaxHP == tree.Abil.MaxHP, "tree attributes recalculate");
    });
    Check("player discovery activates specialized tree AI", () =>
    {
        using var map = Map(); var tree = At(new ProbeTree { Race = 115 }, map); var player = At(new PlayObject(), map, 31, 30);
        player.SearchViewRange(); tree.Run();
        Require(tree.IsVisibleActive && tree.VisibleActors.Any(actor => actor.BaseObject == player), "specialized AI receives discovery");
    });
    Check("lethal tree hit completes death, XP and loot messages exactly once", () =>
    {
        using var map = Map(); var tree = At(new ProbeTree { Race = 115, FightExp = 5000 }, map); var player = At(new PlayObject(), map, 31, 30);
        tree.StruckDamage(tree.WAbil.HP);
        tree.AddMessage(new SendMessage { wIdent = Messages.RM_STRUCK, ActorId = tree.ActorId, nParam3 = player.ActorId });
        tree.Run(); Require(tree.Death && tree.WAbil.HP == 0, "zero HP becomes death even with a queued hit");
        tree.Run(); tree.Run();
        Require(tree.BagDrops == 1 && tree.DropOwner == player.ActorId, "one owned loot drop");
        Require(Queue(player).UnorderedItems.Count(item => item.Element.wIdent == Messages.RM_PLAYERKILLMONSTER) == 1, "one XP reward");
    });
    Check("tree boss can respawn with full health and independent base attributes", () =>
    {
        using var map = Map(); var tree = At(new ProbeTree { Race = 115 }, map);
        var spawn = new MonGenInfo { Envir = map, X = 30, Y = 30, Range = 0 };
        tree.MonGen = spawn; tree.CanReAlive = true; tree.Death = true; tree.MakeGhost();
        Require(tree.ReAliveEx(spawn) && !tree.Death && !tree.Invisible, "tree respawns without class cast");
        Require(tree.WAbil.HP == tree.WAbil.MaxHP, "full health restored");
        tree.WAbil.HP--; Require(tree.Abil.HP == tree.Abil.MaxHP, "damage does not alter base health");
    });
    Check("respawn rerolls guaranteed tree loot on every life", () =>
    {
        using var map = Map(); var tree = At(new BigHeartMonster { Race = 115, ChrName = "千年树妖" }, map);
        var player = At(new PlayObject(), map, 31, 30);
        M2Share.MonDropLimitLIst = new();
        var world = new WorldServer();
        var items = new GameItemSystem(); items.AddItem(new StdItem { Name = "强效金创药", StdMode = 0, DuraMax = 1000 });
        SystemShare.ItemSystem = items;
        world.AddMonsterList(new MonsterInfo { Name = tree.ChrName, ItemList = new List<MonsterDropItem> {
            new() { ItemName = Grobal2.StringGoldName, MaxPoint = 1000, SelPoint = 999, Count = 1000 },
            new() { ItemName = "强效金创药", MaxPoint = 1000, SelPoint = 999, Count = 1 } } });
        MethodInfo revive = typeof(WorldServer).GetMethod("RespawnMonster", BindingFlags.Instance | BindingFlags.NonPublic)!;
        Require(revive != null, "respawn uses the loot preparation path");
        var spawn = new MonGenInfo { Envir = map, X = 30, Y = 30, Range = 0 };
        tree.MonGen = spawn; tree.CanReAlive = true;
        for (int life = 0; life < 2; life++)
        {
            tree.Death = true; tree.MakeGhost();
            Require((bool)revive.Invoke(world, new object[] { tree })!, "successful respawn");
            Require(tree.Gold >= 500 && tree.ItemList.Count == 1, "gold and potion regenerated on life " + life);
            tree.AttackTick = HUtil32.GetTickCount();
            tree.SetLastHiter(player); tree.StruckDamage(tree.WAbil.HP); tree.Run(); tree.Run();
            player.SearchViewRange();
            Require(tree.Death && player.VisibleItems.Count(item => item.sName == "强效金创药") == life + 1,
                $"real potion floor drop on life {life}: dead={tree.Death}, HP={tree.WAbil.HP}, bag={tree.ItemList.Count}, gold={tree.Gold}, visible={string.Join(',', player.VisibleItems.Select(item => item.sName))}");
            Require(player.VisibleItems.Any(item => item.sName == Grobal2.StringGoldName), "real gold floor drop");
        }
    });
    Check("respawned statue remains visible, dormant and can awaken again", () =>
    {
        using var map = Map(); var statue = At(new ProbeStatue { Race = 101 }, map);
        var spawn = new MonGenInfo { Envir = map, X = 30, Y = 30, Range = 0 };
        statue.MonGen = spawn; statue.CanReAlive = true; statue.Death = true; statue.MakeGhost();
        Require(statue.ReAliveEx(spawn) && statue.StoneMode && !statue.FixedHideMode, "respawn restores stone state, not permanent invisibility");
        var player = At(new PlayObject(), map, 32, 30); player.SearchViewRange(); statue.Run(); statue.Ready(); statue.Run();
        Require(!statue.StoneMode && statue.TargetCret == player, "second-life proximity awakening");
    });
    Console.WriteLine($"RESULT: {checks - failures}/{checks} monster AI checks passed");
    if (failures > 0) Environment.ExitCode = 1;
}
finally { Directory.Delete(directory, true); }

static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
static PriorityQueue<SendMessage, (byte Priority, long Order)> Queue(ActorEntity actor) =>
    (PriorityQueue<SendMessage, (byte Priority, long Order)>)typeof(ActorEntity).GetField("MsgQueue", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(actor)!;
static void Notify(MonsterObject monster, IActor player) => NotifyId(monster, player.ActorId);
static void NotifyId(MonsterObject monster, int id) => typeof(MonsterObject).GetMethod("Operate", BindingFlags.Instance | BindingFlags.NonPublic)!
    .Invoke(monster, new object[] { new ProcessMessage { wIdent = Messages.RM_UPDATEVIEWRANGE, wParam = id } });

public class ProbeMonster : MonsterObject
{
    public int Attacks;
    public void FindTarget() => SearchTarget();
    public bool TryAttack() => AttackTarget();
    protected override void Attack(IActor target, byte dir) { Attacks++; }
}
public class ProbeStatue : ScultureMonster
{
    public void Ready() { WalkSpeed = 1000000; WalkTick = HUtil32.GetTickCount() - WalkSpeed; }
}
public class ProbeKing : ScultureKingMonster
{
    public void Ready() { WalkSpeed = 1000000; WalkTick = HUtil32.GetTickCount() - WalkSpeed; }
    public void ReadySearch() { Ready(); SearchEnemyTick = HUtil32.GetTickCount() - 9000; }
}
public class ProbeTree : BigHeartMonster
{
    public int BagDrops, DropOwner;
    public override void ScatterBagItems(int owner) { BagDrops++; DropOwner = owner; }
}
public class NullServices : DispatchProxy
{
    public static int Summons;
    protected override object Invoke(MethodInfo method, object[] args)
    {
        if (method.Name == "RegenMonsterByName") Summons++;
        if (method.ReturnType == typeof(void)) return null;
        return method.ReturnType.IsValueType ? Activator.CreateInstance(method.ReturnType) : null;
    }
}
