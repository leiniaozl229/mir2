using System.Buffers.Binary;
using System.Text;

namespace Mir2.WebGateway;

public static class LegacyCodec
{
    public static readonly Encoding Gbk;
    static LegacyCodec()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        Gbk = Encoding.GetEncoding(936, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
    }

    public static byte[] Encode(ReadOnlySpan<byte> raw)
    {
        var output = new List<byte>((raw.Length * 4 + 2) / 3);
        for (int offset = 0; offset < raw.Length; offset += 3)
        {
            int remainder = 0;
            for (int i = 0; i < Math.Min(3, raw.Length - offset); i++)
            {
                int value = raw[offset + i] ^ 0xac;
                if (i == 2)
                {
                    output.Add((byte)((value & 63) + 0x3c));
                    remainder |= (value >> 2) & 0x30;
                }
                else
                {
                    output.Add((byte)((((value >> 2) & 0x3c) | (value & 3)) + 0x3c));
                    remainder = (remainder << 2) | ((value >> 2) & 3);
                }
            }
            output.Add((byte)(remainder + 0x3c));
        }
        return output.ToArray();
    }

    public static byte[] Decode(ReadOnlySpan<byte> raw)
    {
        if (raw.Length % 4 == 1) throw new InvalidDataException("Invalid legacy encoding length");
        foreach (byte value in raw) if (value < 0x3c || value > 0x7b) throw new InvalidDataException("Invalid legacy encoding byte");
        var output = new List<byte>(raw.Length * 3 / 4);
        for (int offset = 0; offset < raw.Length; offset += 4)
        {
            int count = Math.Min(4, raw.Length - offset), remainder = raw[offset + count - 1] - 0x3c;
            for (int i = 0; i < count - 1; i++)
            {
                int value = raw[offset + i] - 0x3c;
                int shift = i == 1 || count == 2 ? 2 : 0;
                int decoded = i == 2 ? value | ((remainder << 2) & 0xc0)
                    : ((value << 2) & 0xf0) | ((remainder << shift) & 12) | (value & 3);
                output.Add((byte)(decoded ^ 0xac));
            }
        }
        return output.ToArray();
    }

    public static byte[] Header(ushort id, int recog = 0, ushort param = 0, ushort tag = 0, ushort series = 0)
    {
        Span<byte> header = stackalloc byte[12];
        BinaryPrimitives.WriteInt32LittleEndian(header, recog);
        BinaryPrimitives.WriteUInt16LittleEndian(header[4..], id);
        BinaryPrimitives.WriteUInt16LittleEndian(header[6..], param);
        BinaryPrimitives.WriteUInt16LittleEndian(header[8..], tag);
        BinaryPrimitives.WriteUInt16LittleEndian(header[10..], series);
        return Encode(header);
    }
}

public record LegacyPacket(int Id, int Recog, ushort Param, ushort Tag, ushort Series, byte[] EncodedBody, string? Status = null)
{
    public byte[] Body => LegacyCodec.Decode(EncodedBody);
    public string Text => LegacyCodec.Gbk.GetString(Body);
    public static LegacyPacket Parse(byte[] frame)
    {
        if (frame.Length > 0 && frame[0] == '+') return new(-1, 0, 0, 0, 0, [], Encoding.ASCII.GetString(frame));
        if (frame.Length < 16) throw new InvalidDataException("Truncated legacy header");
        var header = LegacyCodec.Decode(frame.AsSpan(0, 16));
        return new(BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(4)),
            BinaryPrimitives.ReadInt32LittleEndian(header), BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(6)),
            BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(8)), BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(10)), frame[16..]);
    }
}
