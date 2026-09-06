using System.Buffers.Binary;
using System.Text;

namespace Mir2.WebGateway;

public record MagicSkill(byte key, byte level, int currentTrain, ushort magicId, string name, byte effectType,
    byte effect, ushort spell, ushort power, byte[] trainLevels, int[] maxTrain, byte job, int delay,
    byte defSpell, byte defPower, ushort maxPower, byte defMaxPower, string description);

public static class MagicProjection
{
    public static MagicSkill Parse(ReadOnlySpan<byte> body)
    {
        if (body.Length != 84 || body[10] > 14 || body[65] > 15) throw new InvalidDataException("Invalid ClientMagic layout");
        return new(body[0], body[1], I32(body, 4), U16(body, 8), Pascal(body, 10, 14), body[25], body[26],
            U16(body, 28), U16(body, 30), body.Slice(32, 4).ToArray(),
            [I32(body, 36), I32(body, 40), I32(body, 44), I32(body, 48)], body[53], I32(body, 56),
            body[60], body[61], U16(body, 62), body[64], Pascal(body, 65, 15));
    }

    public static MagicSkill[] ParseList(LegacyPacket packet)
    {
        if (packet.Id != 211) throw new InvalidDataException("Expected magic list packet");
        string[] records = Encoding.ASCII.GetString(packet.EncodedBody).Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (records.Length != packet.Series) throw new InvalidDataException("Magic count mismatch");
        var skills = records.Select(record => Parse(LegacyCodec.Decode(Encoding.ASCII.GetBytes(record)))).ToArray();
        if (skills.Select(skill => skill.magicId).Distinct().Count() != skills.Length)
            throw new InvalidDataException("Duplicate magic identity");
        return skills;
    }

    public static object? Project(LegacyPacket packet) => packet.Id switch
    {
        210 => new { type = "skillAdded", skill = Parse(packet.Body) },
        211 => new { type = "skills", skills = ParseList(packet) },
        212 => new { type = "skillRemoved", magicId = packet.Recog },
        640 => new { type = "skillProgress", magicId = packet.Recog, level = packet.Param,
            currentTrain = (uint)packet.Tag | (uint)packet.Series << 16 },
        638 => MagicEffect(packet),
        639 => new { type = "magicFailed", casterId = packet.Recog },
        17 => SpellCast(packet),
        _ => null
    };

    private static object MagicEffect(LegacyPacket packet)
    {
        byte[] body = packet.Body;
        if (body.Length != 4) throw new InvalidDataException("Invalid magic effect target");
        return new { type = "magicEffect", casterId = packet.Recog, x = packet.Param, y = packet.Tag,
            effectType = packet.Series & 255, effect = packet.Series >> 8,
            targetId = BinaryPrimitives.ReadInt32LittleEndian(body) };
    }

    private static object SpellCast(LegacyPacket packet)
    {
        if (!ushort.TryParse(packet.Text, out ushort magicId)) throw new InvalidDataException("Invalid observed spell identity");
        return new { type = "spellCast", casterId = packet.Recog, x = packet.Param, y = packet.Tag,
            effect = packet.Series, magicId };
    }

    private static string Pascal(ReadOnlySpan<byte> body, int offset, int capacity) =>
        LegacyCodec.Gbk.GetString(body.Slice(offset + 1, body[offset]));
    private static ushort U16(ReadOnlySpan<byte> body, int offset) => BinaryPrimitives.ReadUInt16LittleEndian(body[offset..]);
    private static int I32(ReadOnlySpan<byte> body, int offset) => BinaryPrimitives.ReadInt32LittleEndian(body[offset..]);
}
