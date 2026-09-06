using System.Buffers.Binary;

namespace Mir2.WebGateway;

public static class CharacterProjection
{
    public static object? Project(LegacyPacket packet) => packet.Id switch
    {
        52 => Ability(packet),
        53 => new { type = "resources", id = packet.Recog, hp = packet.Param, mp = packet.Tag, maxHp = packet.Series },
        45 => new { type = "levelUp", experience = packet.Recog, level = packet.Param },
        622 => new { type = "weights", weight = packet.Recog, wearWeight = packet.Param, handWeight = packet.Tag },
        653 => new { type = "currency", gold = packet.Recog, gameGold = (uint)packet.Param | (uint)packet.Tag << 16 },
        752 => Secondary(packet),
        657 => new { type = "characterStatus", id = packet.Recog,
            status = (uint)packet.Param | (uint)packet.Tag << 16, hitSpeed = packet.Series },
        708 => new { type = "myStatus", status = unchecked((short)packet.Param) },
        _ => null
    };

    private static object Ability(LegacyPacket packet)
    {
        byte[] body = packet.Body;
        if (body.Length != 40) throw new InvalidDataException("Invalid Ability layout");
        return new
        {
            type = "attributes",
            level = body[0],
            job = packet.Param & 255,
            innerPowerLevel = packet.Param >> 8,
            gold = packet.Recog,
            gameGold = (uint)packet.Tag | (uint)packet.Series << 16,
            ac = Range(body, 2),
            mac = Range(body, 4),
            dc = Range(body, 6),
            mc = Range(body, 8),
            sc = Range(body, 10),
            hp = U16(body, 12),
            mp = U16(body, 14),
            maxHp = U16(body, 16),
            maxMp = U16(body, 18),
            experience = I32(body, 24),
            maxExperience = I32(body, 28),
            weight = U16(body, 32),
            maxWeight = U16(body, 34),
            wearWeight = body[36],
            maxWearWeight = body[37],
            handWeight = body[38],
            maxHandWeight = body[39]
        };
    }

    private static object Secondary(LegacyPacket packet)
    {
        uint value = unchecked((uint)packet.Recog);
        return new
        {
            type = "secondaryAttributes",
            antiMagic = value & 255,
            innerPowerRecover = value >> 8 & 255,
            addDamage = value >> 16 & 255,
            reduceDamage = value >> 24,
            hit = packet.Param & 255,
            speed = packet.Param >> 8,
            antiPoison = packet.Tag & 255,
            poisonRecover = packet.Tag >> 8,
            healthRecover = packet.Series & 255,
            spellRecover = packet.Series >> 8
        };
    }

    private static object Range(byte[] body, int offset)
    {
        ushort value = U16(body, offset);
        return new { min = value & 255, max = value >> 8 };
    }

    private static ushort U16(byte[] body, int offset) => BinaryPrimitives.ReadUInt16LittleEndian(body.AsSpan(offset));
    private static int I32(byte[] body, int offset) => BinaryPrimitives.ReadInt32LittleEndian(body.AsSpan(offset));
}
