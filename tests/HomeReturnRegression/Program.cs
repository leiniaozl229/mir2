using System.Reflection;
using System.Text;
using M2Server;
using M2Server.Maps;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Data;
using OpenMir2.Packets.ClientPackets;
using Serilog;
using SystemModule;
using SystemModule.Actors;
using SystemModule.Data;
using SystemModule.SubSystem;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().CreateLogger();
SystemShare.ActorMgr = new ActorMgr();
M2Share.StartPointList = new List<StartPoint>();
SystemShare.CastleMgr = DispatchProxy.Create<ICastleSystem, Services>();
SystemShare.EventMgr = DispatchProxy.Create<IEventSystem, Services>();
SystemShare.WorldEngine = DispatchProxy.Create<IWorldEngine, Services>();
SystemShare.MapMgr = DispatchProxy.Create<IMapSystem, Services>();
var folder = Path.Combine(Path.GetTempPath(), "mir2-home-return-" + Guid.NewGuid());
Directory.CreateDirectory(folder);
try
{
    var path = Path.Combine(folder, "test.map");
    using (var writer = new BinaryWriter(File.Create(path)))
    {
        writer.Write((short)400); writer.Write((short)400); writer.Write(new byte[48]);
        for (int i=0; i<160000; i++) { writer.Write((ushort)1); writer.Write(new byte[10]); }
    }
    using var oldMap = new Envirnoment { MapName="T219", MapFileName="T219", ServerIndex=M2Share.ServerIndex };
    using var city = new Envirnoment { MapName="0", MapFileName="0", ServerIndex=M2Share.ServerIndex };
    Require(oldMap.LoadMapData(path) && city.LoadMapData(path), "load walkable maps");
    Services.City = city;
    var eat = typeof(PlayObject).GetMethod("EatItems", BindingFlags.NonPublic | BindingFlags.Instance)!;
    foreach (var name in new[]{"回城卷", "回城石"})
    foreach (int pk in new[]{0,2000})
    {
        var player = new PlayObject {ChrName="return-probe", Envir=oldMap, MapName="T219", CurrX=81, CurrY=17,
            HomeMap="3", HomeX=332, HomeY=328, PkPoint=pk};
        Require(oldMap.AddMapObject(81,17,player.CellType,player.ActorId,player), "place player");
        var item = new StdItem {Name=name, StdMode=3, Shape=3};
        Require((bool)eat.Invoke(player,new object[]{item,new UserItem()})!, "item succeeds");
        Require(player.MapName=="0" && player.CurrX==330 && player.CurrY==266 && ReferenceEquals(player.Envir,city), "real SpaceMove reaches Bichon");
        Require(player.HomeMap=="3" && player.HomeX==332 && player.HomeY==328, "binding preserved");
        city.DeleteFromMap(player.CurrX,player.CurrY,player.CellType,player.ActorId,player);
        Console.WriteLine($"PASS {name}, PK={pk}: actual EatItems -> SpaceMove reaches Bichon 330,266 instead of bound home");
    }
}
finally { Directory.Delete(folder,true); }
static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
public class Services : DispatchProxy
{
    public static Envirnoment City;
    protected override object Invoke(MethodInfo method, object[] args)
    {
        if (method.Name=="FindMap") return (string)args[0]=="0" ? City : null;
        if (method.ReturnType==typeof(void)) return null;
        return method.ReturnType.IsValueType ? Activator.CreateInstance(method.ReturnType) : null;
    }
}
