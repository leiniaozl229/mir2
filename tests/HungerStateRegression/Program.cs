using System.Reflection;
using System.Text;
using M2Server;
using M2Server.Event;
using M2Server.Maps;
using M2Server.Net;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Data;
using OpenMir2.Packets.ClientPackets;
using Serilog;
using SystemModule;
using SystemModule.Actors;
using SystemModule.Data;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger=new LoggerConfiguration().CreateLogger();
SystemShare.ActorMgr=new ActorMgr();SystemShare.EventMgr=new EventManager();
M2Share.NetChannel=DispatchProxy.Create<INetChannel,NoNetwork>();
var eat=typeof(PlayObject).GetMethod("EatItems",BindingFlags.NonPublic|BindingFlags.Instance)!;
void Check(bool ok,string reason){if(!ok)throw new Exception(reason);}
ProbePlayer Player(int hunger)=>new(){Envir=new Envirnoment(),HungerStatus=hunger};
bool Food(ProbePlayer player,ushort durability)=>(bool)eat.Invoke(player,[new StdItem {StdMode=1,DuraMax=durability},new UserItem()])!;
var grades=Player(0);
foreach(var (value,expected) in new[]{(0,0),(999,0),(1000,1),(1999,1),(2000,2),(3000,3),(4000,4),(4999,4),(5000,4),(6000,4)}){grades.HungerStatus=value;Check(grades.GetMyStatus()==expected,"actual status bucket/cap");}
Console.WriteLine("PASS: actual GetMyStatus has higher food reserves at higher grades and caps at4");
var first=Player(999);Check(Food(first,100)&&first.HungerStatus==1009&&first.GetMyStatus()==1&&first.StatusMessages==1&&first.Recalculations==1,"food crossing0 to1");
Console.WriteLine("PASS: actual food raises grade0 to1 and queues one status refresh");
var full=Player(3999);Check(Food(full,100)&&full.HungerStatus==4009&&full.GetMyStatus()==4&&full.StatusMessages==1,"food crossing3 to4");
Console.WriteLine("PASS: actual food raises grade3 to4; grade4 cannot mean severe starvation");
var same=Player(1001);Check(Food(same,1000)&&same.HungerStatus==1101&&same.StatusMessages==0&&same.Recalculations==0,"same grade repeats no status refresh");
Console.WriteLine("PASS: same bucket food does not invent another status message");
var capped=Player(4999);Check(Food(capped,ushort.MaxValue)&&capped.HungerStatus==5000&&capped.GetMyStatus()==4&&capped.StatusMessages==0,"food reserve max");
Console.WriteLine("PASS: actual food reserves cap5000 without false grade change");
var blocked=Player(3000);blocked.Envir.Flag.boNODRUG=true;Check(!Food(blocked,100)&&blocked.HungerStatus==3000&&blocked.StatusMessages==0,"map food rejection preserves reserve");
Console.WriteLine("PASS: actual no-drug map refuses food without changing authoritative reserve");
Console.WriteLine("RESULT: 6/6; actual status/food branch and queued RM_MYSTATUS. Unrelated RecalcAbilitys and network are boundary fakes; no inventory consume ACK, native server, DB, account or persistence claim.");

public class ProbePlayer:PlayObject
{
    public int Recalculations;
    public override void RecalcAbilitys(){Recalculations++;}
    public int StatusMessages=>MsgQueue.UnorderedItems.Count(x=>x.Element.wIdent==Messages.RM_MYSTATUS);
}
public class NoNetwork:DispatchProxy
{
    protected override object Invoke(MethodInfo method,object[] args)=>method.ReturnType==typeof(void)?null:method.ReturnType.IsValueType?Activator.CreateInstance(method.ReturnType):null;
}
