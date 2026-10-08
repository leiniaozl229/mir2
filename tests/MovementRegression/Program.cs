using System.Reflection;
using System.Text;
using M2Server;
using M2Server.Actor;
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
using SystemModule.Data;
using SystemModule.SubSystem;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
LogService.Logger = new LoggerConfiguration().WriteTo.Console().CreateLogger();
SystemShare.ActorMgr = new ActorMgr();
SystemShare.CastleMgr = DispatchProxy.Create<ICastleSystem, EmptyCastleSystem>();
SystemShare.Config.CloseSpeedHackCheck = true;
M2Share.NetChannel = DispatchProxy.Create<INetChannel, CaptureChannel>();
string directory = Path.Combine(Path.GetTempPath(), "mir2-movement-" + Guid.NewGuid());
Directory.CreateDirectory(directory);
try
{
    string path = Path.Combine(directory, "test.map");
    using (var writer = new BinaryWriter(File.Create(path)))
    {
        writer.Write((short)12);
        writer.Write((short)12);
        writer.Write(new byte[48]);
        for (int i = 0; i < 144; i++)
        {
            writer.Write((ushort)1);
            writer.Write(new byte[10]);
        }
    }
    using var map = new Envirnoment();
    Require(map.LoadMapData(path), "load collision map");
    var player = new PlayObject { Envir = map, CurrX = 5, CurrY = 5, FixedHideMode = false, SocketId = 101 };
    var bystander = new PlayObject { Envir = map, CurrX = 4, CurrY = 5, FixedHideMode = false, SocketId = 102 };
    var monster = (AnimalObject)System.Runtime.CompilerServices.RuntimeHelpers.GetUninitializedObject(typeof(AnimalObject));
    monster.ActorId = SystemShare.ActorMgr.GetNextIdentity();
    monster.Envir = map;
    monster.CurrX = 6;
    monster.CurrY = 5;
    monster.Race = ActorRace.Animal;
    SystemShare.ActorMgr.Add(monster);
    Require(map.AddMapObject(5, 5, CellType.Play, player.ActorId, player), "add player");
    Require(map.AddMapObject(4, 5, CellType.Play, bystander.ActorId, bystander), "add bystander");
    Require(map.AddMapObject(6, 5, CellType.Monster, monster.ActorId, monster), "add blocking monster");
    MethodInfo operate = typeof(PlayObject).GetMethod("Operate", BindingFlags.Instance | BindingFlags.NonPublic)!;
    var queueField = typeof(ActorEntity).GetField("MsgQueue", BindingFlags.Instance | BindingFlags.NonPublic)!;
    var playerQueue = (PriorityQueue<SendMessage, (byte Priority, long Order)>)queueField.GetValue(player)!;
    var bystanderQueue = (PriorityQueue<SendMessage, (byte Priority, long Order)>)queueField.GetValue(bystander)!;
    foreach (int action in new[] { Messages.CM_WALK, Messages.CM_RUN, Messages.CM_WALK })
    {
        CaptureChannel.Packets.Clear();
        operate.Invoke(player, new object[] { new ProcessMessage {
            wIdent = action, nParam1 = action == Messages.CM_RUN ? 7 : 6, nParam2 = 5
        } });
        Require(player.CurrX == 5 && player.CurrY == 5, "collision preserves authoritative position");
        Require(playerQueue.Count == 0 && bystanderQueue.Count == 0, "failure is immediate and does not broadcast");
        Require(CaptureChannel.Packets.Count == 2, "collision sends correction and failure acknowledgement");
        byte[] correction = CaptureChannel.Packets[0];
        var header = SerializerUtil.Deserialize<ServerMessage>(correction.AsSpan(0, ServerMessage.PacketSize).ToArray());
        var command = SerializerUtil.Deserialize<CommandMessage>(correction.AsSpan(ServerMessage.PacketSize, CommandMessage.Size).ToArray());
        Require(header.Socket == 101 && command.Ident == Messages.SM_MOVEFAIL &&
            command.Recog == player.ActorId && command.Param == 5 && command.Tag == 5,
            "correction targets only blocked player and actual coordinates");
        string reply = Encoding.ASCII.GetString(CaptureChannel.Packets[1], ServerMessage.PacketSize,
            CaptureChannel.Packets[1].Length - ServerMessage.PacketSize);
        Require(reply.StartsWith("+FL/"), "failure releases legacy client's pending action via codec bridge");
    }
    CaptureChannel.Packets.Clear();
    operate.Invoke(player, new object[] { new ProcessMessage { wIdent = Messages.RM_MOVEFAIL, ActorId = bystander.ActorId } });
    Require(CaptureChannel.Packets.Count == 0, "another actor's stale failure cannot reset this player");
    CaptureChannel.Packets.Clear();
    operate.Invoke(player, new object[] { new ProcessMessage { wIdent = Messages.CM_WALK, nParam1 = 5, nParam2 = 6 } });
    Require(player.CurrX == 5 && player.CurrY == 6, "player can move away after collision");
    Require(CaptureChannel.Packets.Any(packet => Encoding.ASCII.GetString(packet, ServerMessage.PacketSize,
        packet.Length - ServerMessage.PacketSize).StartsWith("+GD/")), "next successful action retains success acknowledgement");
    Console.WriteLine("PASS: blocked walk/run, immediate correction and unlock, bystander isolation, movement recovery");
}
finally
{
    Directory.Delete(directory, true);
}

static void Require(bool condition, string message)
{
    if (!condition) throw new Exception("FAIL: " + message);
}

public class CaptureChannel : DispatchProxy
{
    public static readonly List<byte[]> Packets = new();
    protected override object Invoke(MethodInfo method, object[] args)
    {
        if (method.Name == "AddGateBuffer") { Packets.Add((byte[])args[1]); return null; }
        throw new NotSupportedException(method.Name);
    }
}

public class EmptyCastleSystem : DispatchProxy
{
    protected override object Invoke(MethodInfo method, object[] args)
    {
        if (method.Name == "InCastleWarArea") return null;
        throw new NotSupportedException(method.Name);
    }
}
