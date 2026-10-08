using System.Reflection;
using System.Text;
using GameSrv.Word;
using M2Server;
using M2Server.Items;
using M2Server.Maps;
using M2Server.Monster;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Data;
using ScriptSystem;
using ScriptSystem.Consts;
using ScriptSystem.Processings;
using Serilog;
using SystemModule;
using SystemModule.Actors;
using SystemModule.Data;
using SystemModule.SubSystem;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().CreateLogger();
SystemShare.ActorMgr = new ActorMgr(); M2Share.StartPointList = new List<StartPoint>();
SystemShare.CastleMgr = DispatchProxy.Create<ICastleSystem, Services>();
SystemShare.EventMgr = DispatchProxy.Create<IEventSystem, Services>();
SystemShare.WorldEngine = DispatchProxy.Create<IWorldEngine, Services>();
SystemShare.ItemSystem = new GameItemSystem(); M2Share.MonDropLimitLIst = new();
var requests = new MonsterRefreshRequests();
int accepted=0;
Parallel.For(0,32,_=> { if(requests.Request("T140",100)) Interlocked.Increment(ref accepted); });
Require(accepted==1,"concurrent requests deduplicated");
var ownerA = new Dictionary<string,long>(StringComparer.OrdinalIgnoreCase);
var ownerB = new Dictionary<string,long>(StringComparer.OrdinalIgnoreCase);
Require(requests.Observe("t140",ownerA) && requests.Observe("T140",ownerB),"each owning thread sees request");
Require(!requests.Observe("T140",ownerA) && !requests.Request("t140",30099),"once per revision and cooldown");
Require(requests.Request("T140",30100) && requests.Observe("T140",ownerA) && requests.Observe("T140",ownerB),"cooldown boundary opens new revision");
Require(requests.Request("T219",100) && requests.Observe("T219",ownerA),"independent map cooldown");
Console.WriteLine("PASS concurrent deduplication, per-map cooldown, all owner threads observe each revision once");
var directory=Path.Combine(Path.GetTempPath(),"mir2-refresh-"+Guid.NewGuid()); Directory.CreateDirectory(directory);
try
{
    var path=Path.Combine(directory,"test.map");
    using(var writer=new BinaryWriter(File.Create(path)))
    { writer.Write((short)80);writer.Write((short)80);writer.Write(new byte[48]);for(int i=0;i<6400;i++){writer.Write((ushort)1);writer.Write(new byte[10]);} }
    using var map=new Envirnoment {MapName="T140"}; Require(map.LoadMapData(path),"load map");
    map.Flag.boNOHUMNOMON=true; // NPC can prewarm an empty destination.
    var world=new WorldServer();
    world.AddMonsterList(new MonsterInfo {Name="刷新测试",ItemList=new List<MonsterDropItem>{
        new(){ItemName=Grobal2.StringGoldName,MaxPoint=1000,SelPoint=999,Count=1000}}});
    var spawn=new MonGenInfo {MapName="T140",MonName="刷新测试",Race=81,Count=2,ActiveCount=2,
        Envir=map,X=30,Y=30,Range=2,ZenTime=3600000,CertList=new List<IMonsterActor>()};
    var alive=new MonsterObject {ChrName="刷新测试",Race=81,Envir=map,CurrX=30,CurrY=30,CanReAlive=true,MonGen=spawn};
    var dead=new MonsterObject {ChrName="刷新测试",Race=81,Envir=map,CurrX=31,CurrY=30,CanReAlive=true,MonGen=spawn};
    foreach(var monster in new[]{alive,dead})
    { monster.Abil.HP=monster.Abil.MaxHP=100; monster.AbilCopyToWAbil();Require(map.AddMapObject(monster.CurrX,monster.CurrY,monster.CellType,monster.ActorId,monster),"place actor");spawn.CertList.Add(monster); }
    alive.WAbil.HP=70; dead.WAbil.HP=0; dead.Death=true;
    world.MonGenInfoThreadMap.Add(0,new List<MonGenInfo>{spawn});
    Require(world.RequestMonsterRefresh("BAD")==-1,"unknown map rejected");
    Require(world.RequestMonsterRefresh("T140")==1 && world.RequestMonsterRefresh("t140")==-2,"valid groups queued then cooled down");
    Require(dead.Death,"NPC/world request does not mutate owning thread actors");
    var refresh=typeof(WorldServer).GetMethod("RefreshMonsterGroup",BindingFlags.NonPublic|BindingFlags.Instance)!;
    refresh.Invoke(world,new object[]{spawn,1});
    Require(!dead.Death && !dead.Invisible && dead.WAbil.HP==100 && dead.Gold>=500,"dead boss revives with HP and normal loot");
    Require(alive.WAbil.HP==70 && spawn.ActiveCount==2 && spawn.CertList.Count==2,"living boss preserved and no extra boss");
    int gold=dead.Gold; refresh.Invoke(world,new object[]{spawn,1});
    Require(dead.Gold==gold && spawn.CertList.Count==2 && alive.WAbil.HP==70,"replayed group does not reroll living loot or duplicate");
    Console.WriteLine("PASS actual worker refresh revives dead boss with loot on empty map, preserves living HP and count cap");
    var parser=new ScriptParsers();
    var parse=typeof(ScriptParsers).GetMethod("LoadScriptFileQuestAction",BindingFlags.NonPublic|BindingFlags.Instance)!;
    var arguments=new object[]{"RESETMONSPAWN CURRENT",new QuestActionInfo()};
    Require((bool)parse.Invoke(parser,arguments)!,"command parses");
    var action=(QuestActionInfo)arguments[1];
    Require(action.nCmdCode==(int)ExecutionCode.ResetMonSpawn && action.sParam1=="CURRENT","real parser routes new command");
    var execute=new ExecutionProcessingSys();execute.Initialize();
    bool success=true;var player=new PlayObject {MapName="T219"};
    execute.Execute(null,player,action,ref success);
    Require(Services.RequestedMap=="T219" && success,"registered script action targets player's current map");
    Console.WriteLine("PASS real script parser and registered execution dispatch RESETMONSPAWN CURRENT");
}
finally {Directory.Delete(directory,true);}
static void Require(bool condition,string message){if(!condition)throw new Exception(message);}
public class Services:DispatchProxy
{
    public static string RequestedMap;
    protected override object Invoke(MethodInfo method,object[] args)
    {
        if(method.Name=="RequestMonsterRefresh"){RequestedMap=(string)args[0];return 1;}
        if(method.ReturnType==typeof(void))return null;
        return method.ReturnType.IsValueType?Activator.CreateInstance(method.ReturnType):null;
    }
}
