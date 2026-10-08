using System.Net;
using System.Net.Sockets;
using GameSrv;
using OpenMir2;
using OpenMir2.Data;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using SystemModule;

sealed record Request(int QueryId, ServerRequestMessage Header, SaveCharacterData? Snapshot);
sealed class DatabasePeer : IAsyncDisposable
{
    TcpListener listener = new(IPAddress.Loopback, 0);
    readonly int port;
    bool listening = true;
    TcpClient? client;
    NetworkStream? stream;
    public DatabasePeer()
    {
        listener.Start();
        port = ((IPEndPoint)listener.LocalEndpoint).Port;
    }
    public async Task Connect()
    {
        if (!listening)
        {
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            listening = true;
        }
        SystemShare.Config.sDBAddr = "127.0.0.1";
        SystemShare.Config.nDBPort = ((IPEndPoint)listener.LocalEndpoint).Port;
        bool first = client is null;
        if (first) GameShare.DataServer.Initialize();
        Task<TcpClient> accept = listener.AcceptTcpClientAsync();
        if (first) await GameShare.DataServer.Start();
        client = await accept.WaitAsync(TimeSpan.FromSeconds(5));
        stream = client.GetStream();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        while (!GameShare.DataServer.IsConnected)
            await Task.Delay(5, timeout.Token);
    }
    public async Task Disconnect()
    {
        listener.Stop();
        listening = false;
        stream!.Close();
        client!.Close();
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3));
        while (GameShare.DataServer.IsConnected)
            await Task.Delay(5, timeout.Token);
    }
    public async Task<Request> Read()
    {
        byte[] head = new byte[ServerDataPacket.FixedHeaderLen];
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await stream!.ReadExactlyAsync(head, timeout.Token);
        ServerDataPacket outer = SerializerUtil.Deserialize<ServerDataPacket>(head);
        byte[] payload = new byte[outer.PacketLen];
        await stream.ReadExactlyAsync(payload, timeout.Token);
        ServerRequestData packet = SerializerUtil.Deserialize<ServerRequestData>(payload);
        ServerRequestMessage header = SerializerUtil.Deserialize<ServerRequestMessage>(EDCode.DecodeBuff(packet.Message));
        SaveCharacterData? save = header.Ident == Messages.DB_SAVEHUMANRCD
            ? SerializerUtil.Deserialize<SaveCharacterData>(EDCode.DecodeBuff(packet.Packet)) : null;
        return new Request(packet.QueryId, header, save);
    }
    public Task Send(int id, int ident, int recog, byte[]? body = null) => SendRaw(id,
        EDCode.EncodeBuffer(SerializerUtil.Serialize(new ServerRequestMessage(ident, recog, 0, 0, 0))), body ?? []);
    public async Task SendRaw(int id, byte[] message, byte[] body)
    {
        await stream!.WriteAsync(Frame(id, message, body));
    }
    static byte[] Frame(int id, byte[] message, byte[] body)
    {
        var packet = new ServerRequestData { QueryId = id, Message = message, Packet = body };
        int check = HUtil32.MakeLong((ushort)(id ^ 170), (ushort)(message.Length + body.Length + ServerDataPacket.FixedHeaderLen));
        packet.Sign = EDCode.EncodeBuffer(BitConverter.GetBytes(check));
        byte[] payload = SerializerUtil.Serialize(packet);
        byte[] head = SerializerUtil.Serialize(new ServerDataPacket { PacketCode = Grobal2.PacketCode, PacketLen = (ushort)payload.Length });
        return head.Concat(payload).ToArray();
    }
    public async Task SendPartial(int id)
    {
        byte[] frame = Frame(id, EDCode.EncodeBuffer(SerializerUtil.Serialize(new ServerRequestMessage(Messages.DBR_SAVEHUMANRCD, 1, 0, 0, 0))), []);
        await stream!.WriteAsync(frame.AsMemory(0, frame.Length / 2));
    }
    public async Task SendTogether(params (int Id, int Ident, int Recog)[] responses)
    {
        byte[] frames = responses.SelectMany(response => Frame(response.Id,
            EDCode.EncodeBuffer(SerializerUtil.Serialize(new ServerRequestMessage(response.Ident, response.Recog, 0, 0, 0))), [])).ToArray();
        await stream!.WriteAsync(frames);
    }
    public bool PendingConnection() => listening && listener.Pending();
    public ValueTask DisposeAsync()
    {
        stream?.Dispose(); client?.Dispose(); listener.Stop();
        return ValueTask.CompletedTask;
    }
}
