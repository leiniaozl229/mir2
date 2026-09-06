using System.Reflection;
using M2Server.Guild;
using OpenMir2;
using Serilog;
using SystemModule;
using SystemModule.Actors;
using SystemModule.Castles;
using SystemModule.Data;
using SystemModule.SubSystem;
using System.Text;

static void Require(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

string directory = Path.Combine(Path.GetTempPath(), "mir2-castle-regression-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(directory);
try
{
    Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    LogService.Logger = new LoggerConfiguration().MinimumLevel.Debug().CreateLogger();
    SystemShare.Config.GuildDir = directory + Path.DirectorySeparatorChar;
    SystemShare.Config.GuildWarTime = 3 * 60 * 60 * 1000;

    GuildInfo red = new("RedGuild");
    GuildInfo blue = new("BlueGuild");
    red.AllyGuild(blue);
    Require(red.IsAllyGuild(blue), "alliance should be added to the in-memory guild list");
    string savedAlliance = File.ReadAllText(Path.Combine(SystemShare.Config.GuildDir, "RedGuild.txt"));
    Require(savedAlliance.Contains("+BlueGuild", StringComparison.Ordinal), "alliance should persist by guild name");
    Require(!savedAlliance.Contains("M2Server.Guild.GuildInfo", StringComparison.Ordinal), "alliance persistence must not use object ToString");

    blue.SaveGuildInfoFile();
    SystemShare.Config.GuildFile = Path.Combine(directory, "GuildList.txt");
    File.WriteAllLines(SystemShare.Config.GuildFile, ["RedGuild", "BlueGuild"]);
    GuildManager guildManager = new();
    SystemShare.GuildMgr = guildManager;
    guildManager.LoadGuildInfo();
    IGuild? loadedRed = guildManager.FindGuild("RedGuild");
    IGuild? loadedBlue = guildManager.FindGuild("BlueGuild");
    Require(loadedRed is not null && loadedBlue is not null && loadedRed.IsAllyGuild(loadedBlue),
        "alliance should reload from persisted guild names");

    red.DelAllyGuild(blue);
    WarGuild first = red.AddWarGuild(blue);
    Require(first.Guild == blue && first.WarTick > 0 && first.WarTime == SystemShare.Config.GuildWarTime,
        "first guild war declaration should create a live war record");
    WarGuild renewed = red.AddWarGuild(blue);
    Require(renewed.Guild == blue && renewed.WarTick > 0 && red.GuildWarList.Count == 1,
        "repeated guild war declaration should renew the existing record");

    // Exercise the castle capture rule with controllable map occupants. The
    // real world engine supplies the same list from the palace environment.
    SystemShare.Config.CastleDir = directory;
    SystemShare.Config.GetCastleTime = 1_000;
    var previousWorld = SystemShare.WorldEngine;
    var previousMapManager = SystemShare.MapMgr;
    try
    {
        GuildInfo defender = new("DefenderGuild");
        GuildInfo attacker = new("AttackerGuild");
        IUserCastle castle = new M2Server.Castle.UserCastle("scenario");
        castle.MasterGuild = defender;
        castle.OwnGuild = defender.GuildName;
        castle.UnderWar = true;
        castle.AttackGuildList.Add(attacker);
        castle.StartCastleWarTick = HUtil32.GetTickCount();
        SystemShare.MapMgr = DispatchProxy.Create<IMapSystem, CastleMapProxy>();

        IPlayerActor attackerPlayer = DispatchProxy.Create<IPlayerActor, CastlePlayerProxy>();
        ((CastlePlayerProxy)(object)attackerPlayer).Guild = attacker;
        IPlayerActor defenderPlayer = DispatchProxy.Create<IPlayerActor, CastlePlayerProxy>();
        ((CastlePlayerProxy)(object)defenderPlayer).Guild = defender;
        CastleWorldProxy world = (CastleWorldProxy)(object)(SystemShare.WorldEngine = DispatchProxy.Create<IWorldEngine, CastleWorldProxy>());
        world.Players = [attackerPlayer];

        Require(!castle.CanGetCastle(attacker), "castle capture should wait for the hold timer");
        castle.StartCastleWarTick = HUtil32.GetTickCount() - SystemShare.Config.GetCastleTime - 1;
        Require(castle.CanGetCastle(attacker), "attacker should capture after holding the palace");
        world.Players = [attackerPlayer, defenderPlayer];
        Require(!castle.CanGetCastle(attacker), "living defender should block castle capture");
        world.Players = [attackerPlayer];
        castle.GetCastle(attacker);
        Require(castle.MasterGuild == attacker && castle.OwnGuild == attacker.GuildName,
            "capture should transfer castle ownership");
        castle.StopWallconquestWar();
        Require(!castle.UnderWar && castle.AttackGuildList.Count == 0,
            "ending castle war should clear the active attack list");
    }
    finally
    {
        SystemShare.WorldEngine = previousWorld;
        SystemShare.MapMgr = previousMapManager;
    }
    Console.WriteLine("PASS guild alliance, first-war registration and castle capture flow");
}
finally
{
    try { Directory.Delete(directory, true); } catch { }
}

public class CastleWorldProxy : DispatchProxy
{
    public IList<IPlayerActor> Players { get; set; } = [];

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        if (targetMethod?.Name == nameof(IWorldEngine.GetMapRageHuman) && args is not null)
        {
            if (args[4] is IList<IPlayerActor> list)
            {
                list.Clear();
                foreach (IPlayerActor player in Players)
                {
                    list.Add(player);
                }
            }
            return null;
        }
        if (targetMethod?.ReturnType == typeof(void)) return null;
        if (targetMethod?.ReturnType == typeof(bool)) return false;
        if (targetMethod?.ReturnType == typeof(int)) return 0;
        if (targetMethod?.ReturnType == typeof(string)) return string.Empty;
        return targetMethod?.ReturnType is { IsValueType: true } type && type != typeof(void)
            ? Activator.CreateInstance(type)
            : null;
    }
}

public class CastleMapProxy : DispatchProxy
{
    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        if (targetMethod?.ReturnType == typeof(void)) return null;
        if (targetMethod?.Name == nameof(IMapSystem.GetMapOfServerIndex)) return (int)SystemShare.ServerIndex;
        if (targetMethod?.ReturnType == typeof(bool)) return false;
        if (targetMethod?.ReturnType == typeof(int)) return 0;
        if (targetMethod?.ReturnType == typeof(string)) return string.Empty;
        if (targetMethod?.ReturnType is { IsGenericType: true } type && type.GetGenericTypeDefinition() == typeof(IList<>))
            return Activator.CreateInstance(typeof(List<>).MakeGenericType(type.GetGenericArguments()[0]));
        return targetMethod?.ReturnType is { IsValueType: true } valueType && valueType != typeof(void)
            ? Activator.CreateInstance(valueType)
            : null;
    }
}

public class CastlePlayerProxy : DispatchProxy
{
    public IGuild? Guild { get; set; }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
    {
        if (targetMethod?.ReturnType == typeof(void)) return null;
        if (targetMethod?.Name == "get_MyGuild")
        {
            return Guild;
        }
        if (targetMethod?.Name == "set_MyGuild")
        {
            Guild = args?[0] as IGuild;
            return null;
        }
        if (targetMethod?.Name == "get_Death") return false;
        if (targetMethod?.Name == "get_HomeMap") return "0";
        if (targetMethod?.Name == nameof(IPlayerActor.MapRandomMove)) return null;
        if (targetMethod?.ReturnType == typeof(bool)) return false;
        if (targetMethod?.ReturnType == typeof(int)) return 0;
        if (targetMethod?.ReturnType == typeof(string)) return string.Empty;
        return targetMethod?.ReturnType is { IsValueType: true } type && type != typeof(void)
            ? Activator.CreateInstance(type)
            : null;
    }
}
