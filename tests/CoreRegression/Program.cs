using System.Collections.Concurrent;
using System.Reflection;
using GameSrv.Services;
using M2Server;
using OpenMir2.Packets.ServerPackets;
using SystemModule.Data;
using System.Text;
using M2Server.Maps;
using OpenMir2;
using OpenMir2.Common;
using Serilog;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    LogService.Logger = new LoggerConfiguration().WriteTo.Console().CreateLogger();
string directory = Path.Combine(Path.GetTempPath(), "mir2-regression-" + Guid.NewGuid());
Directory.CreateDirectory(directory);
try
{
    var namedPlayer = (M2Server.Player.PlayObject)System.Runtime.CompilerServices.RuntimeHelpers.GetUninitializedObject(typeof(M2Server.Player.PlayObject));
    namedPlayer.ChrName = "WebCheck";
    namedPlayer.RankLevelName = "%s";
    SystemModule.SystemShare.Config.ShowRankLevelName = true;
    Require(namedPlayer.GetShowName().Contains("WebCheck") && !namedPlayer.GetShowName().Contains("%s"),
            "legacy rank name template substitutes player name");
    SystemModule.SystemShare.Config.ShowRankLevelName = false;
    Require(OpenMir2.Base.ServerEnvironment.VirtualMemoryLoad == 0,
            "unavailable virtual memory does not crash statistics");
    SystemModule.SystemShare.Config.CastleDir = directory;
    SystemModule.SystemShare.MapMgr = DispatchProxy.Create<SystemModule.SubSystem.IMapSystem, MapIndexProxy>();
    var emptyCastle = new M2Server.Castle.UserCastle("empty-castle");
    emptyCastle.Save();
    var animal = (M2Server.Actor.AnimalObject)System.Runtime.CompilerServices.RuntimeHelpers.GetUninitializedObject(typeof(M2Server.Actor.AnimalObject));
    animal.BodyLeathery = 5;
    animal.MeatQuality = 100;
    Require(animal.ApplyHarvestDamage(10, 200), "harvest overshoot completes corpse");
    Require(animal.BodyLeathery == 0 && animal.MeatQuality == 0, "harvest counters saturate at zero");
    animal.BodyLeathery = 50;
    animal.MeatQuality = 1000;
    Require(!animal.ApplyHarvestDamage(10, 200), "partial harvesting remains incomplete");
    Require(animal.BodyLeathery == 40 && animal.MeatQuality == 800, "partial harvest retains remaining progress");
    animal.ReduceMeatQuality(2000);
    Require(animal.MeatQuality == 0, "combat damage cannot wrap meat quality");
    SystemModule.SystemShare.ItemSystem = DispatchProxy.Create<SystemModule.SubSystem.IItemSystem, MeatItemProxy>();
    animal.Envir = DispatchProxy.Create<SystemModule.Maps.IEnvirnoment, RejectedDropProxy>();
    var meat = new OpenMir2.Packets.ClientPackets.UserItem { Dura = 1, DuraMax = 4000 };
    Require(!animal.DropItemDown(meat, 0, false, 0, 0), "map rejection rejects the drop");
    Require(meat.Dura == 1, "rejected drop preserves bag durability");
    Require(RejectedDropProxy.Attempt.UserItem.Dura == 0,
            "ground meat wear saturates at zero without unsigned wrap");
    var wireItem = new OpenMir2.Packets.ClientPackets.ClientItem();
    wireItem.Item.Name = "鸡肉";
    wireItem.Item.StdMode = 40;
    wireItem.Item.Weight = 1;
    wireItem.MakeIndex = 0x12345678;
    wireItem.Dura = 1234;
    wireItem.DuraMax = 4000;
    byte[] nativeItem = wireItem.GetBuffer();
    Require(nativeItem.Length == 124 && BitConverter.ToInt32(nativeItem, 100) == wireItem.MakeIndex,
            "native ClientItem identity layout");
    File.WriteAllText(".runtime/reports/native-client-item.hex", Convert.ToHexString(nativeItem));
    string text = Path.Combine(directory, "new-list.txt");
    StringList list = new StringList();
    list.Add("比奇省");
    list.SaveToFile(text);
    StringList loaded = new StringList();
    loaded.LoadFromFile(text);
    Require(loaded.Count == 1 && loaded[0] == "比奇省", "new StringList file roundtrip");

    string mapFile = Path.Combine(directory, "cells.map");
    using (BinaryWriter writer = new BinaryWriter(File.Create(mapFile)))
    {
        writer.Write((short)2);
        writer.Write((short)2);
        writer.Write(new byte[48]);
        // File order is x-major. The first cell is a wall, all later cells open.
        for (int i = 0; i < 4; ++i)
        {
            writer.Write((ushort)(i == 0 ? 0x8001 : 1));
            writer.Write(new byte[10]);
        }
    }
    using Envirnoment map = new Envirnoment();
    Require(map.LoadMapData(mapFile), "load real server map parser");
    Require(!map.CanWalk(0, 0), "wall is blocked");
    var groundItem = new MapItem { Name = "鸡肉", UserItem = new OpenMir2.Packets.ClientPackets.UserItem() };
    var secondGroundItem = new MapItem();
    Require(groundItem.ItemId != 0 && secondGroundItem.ItemId != groundItem.ItemId,
            "ground objects receive distinct nonzero identities");
    Require(map.AddItemToMap(1, 1, groundItem), "new ground item enters a real map cell");
    Require(M2Share.CellObjectMgr.Get<MapItem>(groundItem.ItemId).Name == "鸡肉",
            "ground item resolves through map object registry");
    for (int i = 1; i < 4; ++i)
    {
        ref var cell = ref map.GetCellInfo(i / 2, i % 2, out bool found);
        Require(found && cell.Valid && cell.ObjList != null,
                $"walkable cell {i} after wall initialized");
    }
    var front = new FrontEngine();
    M2Share.FrontEngine = front;
    M2Share.UserDBCriticalSection = new object();
    front.AddToSaveRcdList(new SavePlayerRcd { ChrName = "pending", QueryId = 7001 });
    front.AddToSaveRcdList(new SavePlayerRcd { ChrName = "other", QueryId = 7002 });
    var queue = (ConcurrentQueue<int>)typeof(PlayerDataService)
        .GetField("SaveProcessList", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;
    queue.Enqueue(7001);
    PlayerDataService.ProcessSaveQueue();
    Require(front.InSaveRcdList("pending"), "no acknowledgement retains pending save");
    PlayerDataService.Enqueue(7001, new ServerRequestData {
        QueryId = 7001,
        Message = EDCode.EncodeBuffer(SerializerUtil.Serialize(
            new ServerRequestMessage(Messages.DBR_SAVEHUMANRCD, 1, 0, 0, 0))),
        Packet = Array.Empty<byte>()
    });
    PlayerDataService.ProcessSaveQueue();
    Require(!front.InSaveRcdList("pending"), "successful database acknowledgement unblocks login");
    Require(front.InSaveRcdList("other"), "unrelated save remains pending");
    Console.WriteLine("PASS: new-file encoding, map cells, database save acknowledgement, empty castle and memory statistics");
}
finally
{
    Directory.Delete(directory, true);
}

static void Require(bool condition, string message)
{
    if (!condition) throw new Exception("FAIL: " + message);
}

public class MapIndexProxy : DispatchProxy
{
    protected override object Invoke(MethodInfo targetMethod, object[] args)
    {
        if (targetMethod.Name == "GetMapOfServerIndex") return (int)M2Share.ServerIndex;
        throw new NotSupportedException(targetMethod.Name);
    }
}

public class MeatItemProxy : DispatchProxy
{
    protected override object Invoke(MethodInfo targetMethod, object[] args)
    {
        if (targetMethod.Name == "GetStdItem") return new OpenMir2.Data.StdItem { StdMode = 40, Name = "鸡肉" };
        if (targetMethod.Name == "GetStdItemName") return "鸡肉";
        throw new NotSupportedException(targetMethod.Name);
    }
}

public class RejectedDropProxy : DispatchProxy
{
    public static MapItem Attempt;
    protected override object Invoke(MethodInfo targetMethod, object[] args)
    {
        if (targetMethod.Name == "AddItemToMap")
        {
            Attempt = (MapItem)args[2];
            return false;
        }
        throw new NotSupportedException(targetMethod.Name);
    }
}
