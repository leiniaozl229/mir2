using System.Reflection;
using System.Text;
using M2Server;
using M2Server.Actor;
using M2Server.Event;
using M2Server.Event.Events;
using M2Server.Maps;
using M2Server.Monster;
using M2Server.Net;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Data;
using Serilog;
using SystemModule;
using SystemModule.Actors;
using SystemModule.Data;
using SystemModule.MagicEvent.Events;
using SystemModule.SubSystem;

// Actual WalkTo and map cells, isolated from live services, accounts and storage.
Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().CreateLogger();
SystemShare.ActorMgr = new ActorMgr();
SystemShare.CastleMgr = DispatchProxy.Create<ICastleSystem, NullServices>();
SystemShare.EventMgr = new EventManager();
SystemShare.WorldEngine = DispatchProxy.Create<IWorldEngine, NullServices>();
M2Share.NetChannel = DispatchProxy.Create<INetChannel, NullServices>();
M2Share.StartPointList = new List<StartPoint>();
M2Share.MiniMapList = new();
M2Share.MonSayMsgList = new();
string directory = Path.Combine(Path.GetTempPath(), "mir2-follow-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(directory);
int passed = 0, failed = 0;
void Check(bool condition, string reason) { if (!condition) throw new Exception(reason); }
void Run(string name, Action action)
{
    try { action(); passed++; Console.WriteLine("PASS: " + name); }
    catch (Exception ex) { failed++; Console.WriteLine("FAIL: " + name + " / " + ex.Message); }
}
Envirnoment Map()
{
    string path = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".map");
    using (var w = new BinaryWriter(File.Create(path)))
    {
        w.Write((short)48); w.Write((short)48); w.Write(new byte[48]);
        for (int x = 0; x < 48; x++) for (int y = 0; y < 48; y++)
        { w.Write((ushort)(x == 30 && y == 30 ? 0x8001 : 1)); w.Write(new byte[10]); }
    }
    var map = new Envirnoment(); Check(map.LoadMapData(path), "real map parser");
    map.MapName = Guid.NewGuid().ToString("N"); return map;
}
T At<T>(T actor, Envirnoment map, short x, short y) where T : BaseObject
{
    actor.Envir = map; actor.MapName = map.MapName; actor.CurrX = x; actor.CurrY = y;
    actor.FixedHideMode = false;
    actor.Abil.MaxHP = actor.Abil.HP = 500; actor.Abil.MaxMP = actor.Abil.MP = 50; actor.AbilCopyToWAbil();
    Check(map.AddMapObject(x, y, actor.CellType, actor.ActorId, actor), "real actor cell registration"); return actor;
}
ProbePet Pet(Envirnoment map, PlayObject master, short x, short y)
{
    var pet = At(new ProbePet { Race = 53 }, map, x, y); pet.Master = master; return pet;
}
void Move(ProbePet pet, byte direction, bool expected, short x, short y, bool fearFire = false)
{
    short oldX = pet.CurrX, oldY = pet.CurrY;
    Check(pet.Step(direction, fearFire) == expected, "WalkTo result differs");
    Check(pet.CurrX == (expected ? x : oldX) && pet.CurrY == (expected ? y : oldY), "position differs");
}
try
{
    for (byte dir = 0; dir < 8; dir++)
    {
        byte direction = dir;
        Run("master reserved next cell direction " + direction, () =>
        {
            var map = Map(); var master = At(new PlayObject(), map, 20, 20); master.Dir = direction;
            short x = 0, y = 0; map.GetNextPosition(master.CurrX, master.CurrY, direction, 1, ref x, ref y);
            short sx = x, sy = (short)(y + 1); byte step = 0;
            if (sx == master.CurrX && sy == master.CurrY) { sx++; sy = y; step = 6; }
            Move(Pet(map, master, sx, sy), step, false, x, y);
        });
    }
    Run("free x zero shares reserved y", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 20, 20); master.Dir = 2;
        Move(Pet(map, master, 0, 21), 0, true, 0, 20);
    });
    Run("actual reserved x zero still blocked", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 1, 20); master.Dir = 6;
        Move(Pet(map, master, 0, 21), 0, false, 0, 20);
    });
    Run("same y with different x remains free", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 20, 20); master.Dir = 2;
        Move(Pet(map, master, 22, 21), 0, true, 22, 20);
    });
    Run("same x with different y remains free", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 20, 20); master.Dir = 2;
        Move(Pet(map, master, 22, 21), 6, true, 21, 21);
    });
    Run("wall still refuses pet", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 20, 20);
        Move(Pet(map, master, 30, 31), 0, false, 30, 30);
    });
    Run("living occupied cell still refuses pet", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 20, 20);
        At(new PlayObject(), map, 25, 25); Move(Pet(map, master, 25, 26), 0, false, 25, 25);
    });
    Run("map boundary still refuses pet", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 20, 20);
        Move(Pet(map, master, 0, 25), 6, false, -1, 25);
    });
    Run("summoned pet may walk unrelated safe cell", () =>
    {
        var map = Map(); map.Flag.SafeArea = true; var master = At(new PlayObject(), map, 20, 20);
        Move(Pet(map, master, 25, 26), 0, true, 25, 25);
    });
    Run("natural aggressive monster still avoids safe map", () =>
    {
        var map = Map(); map.Flag.SafeArea = true;
        Move(At(new ProbePet { Race = 53 }, map, 25, 26), 0, false, 25, 25);
    });
    Run("fear fire ordinary cell still allows pet", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 20, 20);
        Move(Pet(map, master, 25, 26), 0, true, 25, 25, true);
    });
    Run("fear fire damaging event still refuses pet", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 20, 20); var pet = Pet(map, master, 25, 26);
        _ = new FireBurnEvent(pet, 25, 25, Grobal2.ET_FIRE, 60000, 1);
        Check(!map.CanSafeWalk(25, 25), "real fire event did not register");
        Move(pet, 0, false, 25, 25, true);
    });
    Run("fear fire still reserves master next cell", () =>
    {
        var map = Map(); var master = At(new PlayObject(), map, 20, 20); master.Dir = 2;
        Move(Pet(map, master, 21, 21), 0, false, 21, 20, true);
    });
}
finally { Directory.Delete(directory, true); }
Console.WriteLine($"RESULT: {passed}/{passed + failed}");
Environment.ExitCode = failed == 0 ? 0 : 1;

public class ProbePet : MonsterObject
{
    public bool Step(byte direction, bool fearFire) => WalkTo(direction, false, fearFire);
}
public class NullServices : DispatchProxy
{
    protected override object Invoke(MethodInfo method, object[] args) => method.ReturnType == typeof(void) ? null
        : method.ReturnType.IsValueType ? Activator.CreateInstance(method.ReturnType) : null;
}
