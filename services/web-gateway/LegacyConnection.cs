using System.Net.Sockets;

namespace Mir2.WebGateway;

public sealed class LegacyConnection : IDisposable
{
    private readonly TcpClient client = new();
    private readonly List<byte> pending = [];
    private readonly byte[] buffer = new byte[8192];
    private readonly SemaphoreSlim sendLock = new(1, 1);
    private int sequence = 1;
    public async Task Connect(string host, int port, CancellationToken cancellation)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        await client.ConnectAsync(host, port, timeout.Token);
        client.NoDelay = true;
    }
    public async Task Send(ushort id, CancellationToken cancellation, string text = "", int recog = 0,
        ushort param = 0, ushort tag = 0, ushort series = 0)
    {
        byte[] header = LegacyCodec.Header(id, recog, param, tag, series);
        byte[] body = LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes(text));
        await SendPayload([..header, ..body], cancellation);
    }
    public async Task SendPayload(byte[] payload, CancellationToken cancellation)
    {
        await sendLock.WaitAsync(cancellation);
        try
        {
            byte[] packet = [(byte)'#', (byte)('0' + sequence), ..payload, (byte)'!'];
            await client.GetStream().WriteAsync(packet, cancellation);
            sequence = sequence % 9 + 1;
        }
        finally { sendLock.Release(); }
    }
    // Exactly one consumer reads each connection; writes may originate in the command or notice loop.
    public async Task<LegacyPacket> Receive(CancellationToken cancellation)
    {
        while (true)
        {
            int start = pending.IndexOf((byte)'#');
            if (start > 0) pending.RemoveRange(0, start);
            if (start >= 0)
            {
                int end = pending.IndexOf((byte)'!', 1);
                if (end > 0)
                {
                    byte[] frame = pending.GetRange(1, end - 1).ToArray();
                    pending.RemoveRange(0, end + 1);
                    return LegacyPacket.Parse(frame);
                }
            }
            int count = await client.GetStream().ReadAsync(buffer, cancellation);
            if (count == 0) throw new EndOfStreamException("Legacy service disconnected");
            pending.AddRange(buffer.AsSpan(0, count).ToArray());
            if (pending.Count > 1_048_576) throw new InvalidDataException("Legacy frame exceeds limit");
        }
    }
    public async Task<LegacyPacket> Expect(int id, CancellationToken cancellation)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        var packet = await Receive(timeout.Token);
        if (packet.Id != id) throw new InvalidOperationException($"Legacy request failed ({packet.Id}/{packet.Recog})");
        return packet;
    }
    public void Dispose() => client.Dispose();
}
