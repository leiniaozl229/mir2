using System.Reflection;
using System.Text;
using M2Server;
using M2Server.Actor;
using M2Server.Items;
using M2Server.Maps;
using M2Server.Net;
using M2Server.Player;
using OpenMir2;
using OpenMir2.Data;
using OpenMir2.Enums;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using Serilog;
using SystemModule;
using SystemModule.Const;
using SystemModule.Data;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().WriteTo.Console().CreateLogger();
SystemShare.ActorMgr = new ActorMgr();
SystemShare.Config.CloseSpeedHackCheck = true;
M2Share.NetChannel = DispatchProxy.Create<INetChannel, CaptureChannel>();
var items = new GameItemSystem();
items.StdItemList.Add(new StdItem { Name="test sword", StdMode=5, DuraMax=10000 });
SystemShare.ItemSystem=items;
string directory=Path.Combine(Path.GetTempPath(),"mir2-native-melee-"+Guid.NewGuid());
Directory.CreateDirectory(directory);
try
{
 string path=Path.Combine(directory,"test.map");
 using(var writer=new BinaryWriter(File.Create(path)))
 { writer.Write((short)32);writer.Write((short)32);writer.Write(new byte[48]);for(int i=0;i<1024;i++){writer.Write((ushort)1);writer.Write(new byte[10]);} }
 using var map=new Envirnoment();Require(map.LoadMapData(path),"load actual walkable map");
 var player=new TestWarrior{Envir=map,CurrX=15,CurrY=15,SocketId=101,FixedHideMode=false};
 var observer=new TestWarrior{Envir=map,CurrX=12,CurrY=15,SocketId=102,FixedHideMode=false};
 Require(map.AddMapObject(15,15,CellType.Play,player.ActorId,player),"add actual player");
 Require(map.AddMapObject(12,15,CellType.Play,observer.ActorId,observer),"add actual observer");
 var victims=new List<TestWarrior>();
 var vectors=new(short X,short Y)[]{(0,-1),(1,-1),(1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-1)};
 foreach(var (dx,dy) in vectors){var victim=new TestWarrior{Envir=map,CurrX=(short)(15+dx),CurrY=(short)(15+dy),Race=ActorRace.Animal,FixedHideMode=false};
  victim.WAbil.HP=victim.WAbil.MaxHP=5000;victim.HitPoint=0;victim.SpeedPoint=0;victims.Add(victim);
  Require(map.AddMapObject(victim.CurrX,victim.CurrY,CellType.Monster,victim.ActorId,victim),"add real directional target");}
 player.UseItems[1]=new UserItem{Index=1,Dura=10000,DuraMax=10000};
  player.WAbil.DC=HUtil32.MakeWord(100,100);player.WAbil.HP=player.WAbil.MaxHP=1000;player.Abil.Level=40;
 player.HitPoint=100;player.HitPlus=20;player.HitDouble=10;
 player.MagicArr[MagicConst.SKILL_ERGUM]=Skill(12);
 player.MagicArr[MagicConst.SKILL_BANWOL]=Skill(25,3);
 for(byte direction=0;direction<8;direction++)
 {
  Reset();player.Dir=(byte)((direction+4)%8);var before=victims.Select(v=>v.WAbil.HP).ToArray();
  Hit(Messages.CM_HIT,direction);var actual=Decode(101,14).Single();
  Require(player.Dir==direction&&actual.Series==direction,"actual SM retains accepted direction");
  Require(victims[direction].WAbil.HP<before[direction],"actual new-direction target was hit");
  Require(victims.Where((v,i)=>i!=direction).Select((v,i)=>v).All(v=>v.WAbil.HP==5000),"old-facing and other targets remain untouched");
 }
 Console.WriteLine("PASS real ClientHitXY/AttackDir targets new facing in all eight directions including diagonals; old-facing target remains intact");
 foreach(var (cm,sm) in new[]{(3014,14),(3015,15),(3016,16),(3018,18),(3019,19),(3024,24),(3025,8)})
 {
  Reset();player.PowerHit=cm==3018;player.FireHitSkill=cm==3025;player.WAbil.MP=100;
   Hit(cm,2);Drain(observer);
  Require(Decode(101,sm).Count()==1&&Decode(102,sm).Count()==1,
   $"expected actual CM{cm}/SM{sm} once in self and observer; self=[{string.Join(',',Decode(101,null).Select(c=>c.Ident))}] observer=[{string.Join(',',Decode(102,null).Select(c=>c.Ident))}]");
  var self=Decode(101,sm).Single();var other=Decode(102,sm).Single();
  Require(self.Recog==player.ActorId&&other.Recog==player.ActorId&&self.Param==15&&self.Tag==15&&self.Series==2,
   "actual self and observer SM share actor, position and direction");
  Require(other.Param==self.Param&&other.Tag==self.Tag&&other.Series==self.Series,"same engine attack mode reaches both channels");
  Require(Good(101)==1,"self SM does not duplicate the original GOOD acknowledgement");
 }
 Console.WriteLine("PASS actual ordinary/heavy/big/power/thrusting/halfmoon/fire attack emits matching self + observer SM and exactly one native GOOD");
  Reset();observer.Op(new ProcessMessage{wIdent=Messages.RM_HEAVYHIT,ActorId=player.ActorId,nParam1=15,nParam2=15,wParam=2,Msg="1"});
  Require(Decode(102,15).Count()==1&&CaptureChannel.Packets.Single()[^1]==(byte)'1',"heavy DIG body remains intact");
  Console.WriteLine("PASS ordinary heavy hit reaches the observer without a body and mining fragment body remains intact");
 foreach(var (cm,sm) in new[]{(3018,18),(3025,8)})
 {
  Reset();player.WAbil.MP=100;player.PowerHit=cm==3018;player.FireHitSkill=cm==3025;
  Hit(cm,2);Require(Decode(101,sm).Count()==1&&!player.PowerHit&&!player.FireHitSkill,"actual charged mode is snapshotted before consumption");
  ushort damage=(ushort)(5000-victims[2].WAbil.HP);
   Require(damage==(cm==3018?120:200)&&player.WAbil.MP==100,"existing charged damage formula and attack-stage mana remain unchanged");
  CaptureChannel.Packets.Clear();Hit(cm,2);Require(Decode(101,14).Count()==1&&!Decode(101,sm).Any(),"second uncharged input is truly normal");
 }
 Console.WriteLine("PASS actual power/fire charge is consumed once after mode capture, stronger real target damage remains, and next uncharged input projects normal");
 Reset();player.WAbil.MP=0;Hit(3024,2);Drain(observer);
 Require(Decode(101,14).Count()==1&&Decode(102,14).Count()==1&&!Decode(101,24).Any(),"MP-zero halfmoon downgrade is identical for self and observer");
 Reset();player.WAbil.MP=100;Hit(3024,2);Require(player.WAbil.MP==97,"actual halfmoon retains original three mana cost");
 Console.WriteLine("PASS actual halfmoon MP-zero downgrade emits normal SM and funded halfmoon retains original native mana cost");
 foreach(var mode in new[]{"invalid8","invalid255","dead","locked","wrongPosition"})
 {
  Reset();player.Dir=6;player.PowerHit=true;player.FireHitSkill=true;player.WAbil.MP=100;
  player.Death=mode=="dead";player.IsCanHit=mode!="locked";
  byte direction=mode=="invalid8"?(byte)8:mode=="invalid255"?(byte)255:(byte)2;
  Hit(3018,direction,mode=="wrongPosition"?16:15);Drain(observer);
  Require(!Decode(101,null).Any(c=>new[]{8,14,15,16,18,19,24}.Contains(c.Ident))&&
   !Decode(102,null).Any(c=>new[]{8,14,15,16,18,19,24}.Contains(c.Ident)),"rejected attack cannot emit a self or remote swing");
  Require(player.PowerHit&&player.FireHitSkill&&player.WAbil.MP==100&&player.Dir==6&&victims.All(v=>v.WAbil.HP==5000),
   "rejected input cannot consume charges, mana, target health or facing");
  Require(Good(101)==0,"rejected input cannot emit a success ACK");
 }
 Console.WriteLine("PASS native invalid directions/death/disabled/wrong-position rejects produce no SM, charge/mana/damage/facing changes or GOOD");

 void Reset(){CaptureChannel.Packets.Clear();Queue(player).Clear();Queue(observer).Clear();player.Death=false;player.IsCanHit=true;player.PowerHit=false;player.FireHitSkill=false;
  foreach(var victim in victims){victim.WAbil.HP=5000;victim.Death=false;Queue(victim).Clear();}}
 void Hit(int cm,byte direction,int x=15)=>player.Op(new ProcessMessage{wIdent=cm,wParam=direction,nParam1=x,nParam2=15});
}
finally{Directory.Delete(directory,true);}
static UserMagic Skill(ushort id,byte mana=0)=>new(){MagIdx=id,Level=3,Magic=new MagicInfo{MagicId=id,DefSpell=mana,MagicName="test skill"}};
static PriorityQueue<SendMessage,(byte Priority,long Order)> Queue(PlayObject player)
 =>(PriorityQueue<SendMessage,(byte Priority,long Order)>)typeof(ActorEntity).GetField("MsgQueue",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(player)!;
static void Drain(TestWarrior player){while(Queue(player).TryDequeue(out var msg,out _))player.Op(new ProcessMessage{wIdent=msg.wIdent,wParam=msg.wParam,nParam1=msg.nParam1,nParam2=msg.nParam2,nParam3=msg.nParam3,ActorId=msg.ActorId,Msg=msg.Buff});}
static IEnumerable<CommandMessage> Decode(int socket,int? ident)
{
 foreach(byte[] packet in CaptureChannel.Packets){var header=SerializerUtil.Deserialize<ServerMessage>(packet.AsSpan(0,ServerMessage.PacketSize).ToArray());
  if(header.Socket!=socket||packet.Length<ServerMessage.PacketSize+CommandMessage.Size)continue;
  var command=SerializerUtil.Deserialize<CommandMessage>(packet.AsSpan(ServerMessage.PacketSize,CommandMessage.Size).ToArray());
  if(ident is null||command.Ident==ident)yield return command;}
}
static int Good(int socket)=>CaptureChannel.Packets.Count(packet=>SerializerUtil.Deserialize<ServerMessage>(packet.AsSpan(0,ServerMessage.PacketSize).ToArray()).Socket==socket&&Encoding.ASCII.GetString(packet,ServerMessage.PacketSize,packet.Length-ServerMessage.PacketSize).StartsWith("+GD/"));
static void Require(bool condition,string message){if(!condition)throw new Exception("FAIL: "+message);}
public sealed class TestWarrior:PlayObject{public bool Op(ProcessMessage message)=>Operate(message);}
public class CaptureChannel:DispatchProxy
{
 public static readonly List<byte[]> Packets=new();
 protected override object Invoke(MethodInfo method,object[] args){if(method.Name=="AddGateBuffer"){Packets.Add((byte[])args[1]);return null!;}throw new NotSupportedException(method.Name);}
}
