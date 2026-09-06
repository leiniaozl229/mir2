using System.Buffers.Binary;

namespace Mir2.WebGateway;

/// <summary>Only fields confirmed against the pinned server are projected.</summary>
public static class WorldProjection
{
    public static object? Project(LegacyPacket packet, string character, int? playerActorId = null)
    {
        if (packet.Id is 10 or 11 or 13 or 50 or 801 or 807)
        {
            byte[] description = packet.Id == 50 ? packet.Body
                : packet.EncodedBody.Length >= 11 ? LegacyCodec.Decode(packet.EncodedBody.AsSpan(0, 11)) : [];
            uint? feature = description.Length >= 8 ? BinaryPrimitives.ReadUInt32LittleEndian(description) : null;
            uint? status = description.Length >= 8 ? BinaryPrimitives.ReadUInt32LittleEndian(description.AsSpan(4)) : null;
            bool self = packet.Id == 50 || playerActorId == packet.Recog;
            string? name = self ? character : null;
            if (packet.Id is 10 or 801 or 807 && packet.EncodedBody.Length > 11)
                name = DisplayName(LegacyCodec.Gbk.GetString(LegacyCodec.Decode(packet.EncodedBody.AsSpan(11))).Split('/')[0]);
            return new { type = "entity", id = packet.Recog, x = packet.Param, y = packet.Tag,
                direction = packet.Series & 255, feature, status, name, self,
                action = packet.Id == 11 ? "walking" : packet.Id == 13 ? "running" : "standing", dead = false };
        }
        return packet.Id switch
        {
            29 or 30 or 800 or 806 => new { type = "entityRemoved", id = packet.Recog },
            14 => new { type = "entityAction", id = packet.Recog, action = "attack", x = packet.Param, y = packet.Tag, direction = packet.Series & 255 },
            31 => new { type = "health", id = packet.Recog, hp = packet.Param, maxHp = packet.Tag, damage = packet.Series },
            32 or 34 => new { type = "entityDied", id = packet.Recog, x = packet.Param, y = packet.Tag, direction = packet.Series & 255 },
            27 => new { type = "entityAlive", id = packet.Recog, x = packet.Param, y = packet.Tag, direction = packet.Series & 255 },
            41 => new { type = "appearance", id = packet.Recog, feature = (uint)packet.Param | (uint)packet.Tag << 16 },
            42 => new { type = "entityName", id = packet.Recog, name = DisplayName(packet.Text) },
            44 => new { type = "experience", total = packet.Recog, gained = (uint)packet.Param | (uint)packet.Tag << 16 },
            40 => Chat(packet, "local"),
            100 => new { type = "systemMessage", text = packet.Text },
            101 => Chat(packet, "group"),
            102 => Chat(packet, "shout"),
            103 => Chat(packet, "whisper"),
            104 => Chat(packet, "guild"),
            213 => new { type = "attackMode", mode = packet.Recog & 255 },
            750 => GuildName(packet),
            753 => GuildInfo(packet),
            754 => GuildResult(packet, "open", false),
            756 => GuildMembers(packet),
            757 or 758 => GuildResult(packet, "add", packet.Id == 757),
            759 or 760 => GuildResult(packet, "remove", packet.Id == 759),
            761 => GuildResult(packet, "rank", false),
            762 or 763 => GuildResult(packet, "create", packet.Id == 762),
            768 or 769 => GuildResult(packet, "ally", packet.Id == 768),
            770 or 771 => GuildResult(packet, "breakAlly", packet.Id == 770),
            659 => new { type = "groupMode", enabled = packet.Param != 0 },
            660 or 661 => GroupResult(packet, "create", packet.Id == 660),
            662 or 664 => GroupResult(packet, "add", packet.Id == 662),
            663 or 665 => GroupResult(packet, "remove", packet.Id == 663),
            666 => new { type = "groupCancel" },
            667 => new { type = "groupMembers", members = packet.Text.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries) },
            612 => new { type = "door", x = packet.Param, y = packet.Tag, open = true },
            614 => new { type = "door", x = packet.Param, y = packet.Tag, open = false },
            637 => new { type = "entityAction", id = packet.Recog, action = "harvest", x = packet.Param, y = packet.Tag, direction = packet.Series & 255 },
            _ => null
        };
    }
    public static uint? Feature(LegacyPacket packet)
    {
        if (packet.Id == 41) return (uint)packet.Param | (uint)packet.Tag << 16;
        if (packet.Id is not (10 or 11 or 13 or 50 or 801 or 807)) return null;
        byte[] description = packet.Id == 50 ? packet.Body
            : packet.EncodedBody.Length >= 11 ? LegacyCodec.Decode(packet.EncodedBody.AsSpan(0, 11)) : [];
        return description.Length >= 4 ? BinaryPrimitives.ReadUInt32LittleEndian(description) : null;
    }
    public static string? Name(LegacyPacket packet, string character, int? playerActorId = null)
    {
        bool self = packet.Id == 50 || playerActorId == packet.Recog;
        string? name = self ? character : null;
        if (packet.Id is 10 or 801 or 807 && packet.EncodedBody.Length > 11)
            name = DisplayName(LegacyCodec.Gbk.GetString(LegacyCodec.Decode(packet.EncodedBody.AsSpan(11))).Split('/')[0]);
        return name;
    }
    private static object Chat(LegacyPacket packet, string channel) => new
    {
        type = "chat",
        channel,
        senderId = packet.Recog,
        foreground = packet.Param & 255,
        background = packet.Param >> 8,
        text = packet.Text
    };
    private static object GroupResult(LegacyPacket packet, string action, bool accepted) => new
    {
        type = "groupResult",
        action,
        accepted,
        reason = accepted ? 0 : packet.Recog,
        target = packet.Text
    };
    private static object GuildName(LegacyPacket packet)
    {
        string[] fields = packet.Text.Split('/', 2, StringSplitOptions.TrimEntries);
        return new { type = "guildName", guildName = fields.ElementAtOrDefault(0) ?? "", rankName = fields.ElementAtOrDefault(1) ?? "" };
    }
    private static object GuildInfo(LegacyPacket packet)
    {
        string[] lines = packet.Text.Split('\r', StringSplitOptions.TrimEntries);
        string section = "";
        var notice = new List<string>();
        var wars = new List<string>();
        var warTimers = new List<object>();
        var allies = new List<string>();
        foreach (string line in lines.Skip(3))
        {
            if (line is "<Notice>" or "<KillGuilds>" or "<AllyGuilds>") { section = line; continue; }
            if (line.Length == 0) continue;
            switch (section)
            {
                case "<Notice>": notice.Add(line); break;
                case "<KillGuilds>":
                    AddGuildRelation(line, wars, warTimers);
                    break;
                case "<AllyGuilds>": allies.Add(line.TrimStart('+')); break;
            }
        }
        return new { type = "guildInfo", guildName = lines.ElementAtOrDefault(0) ?? "", canManage = lines.ElementAtOrDefault(2) == "1", notice, warGuilds = wars, warGuildTimers = warTimers, allyGuilds = allies, raw = packet.Text };
    }
    private static void AddGuildRelation(string line, List<string> names, List<object> timers)
    {
        string value = line.TrimStart('+').Trim();
        int separator = value.LastIndexOf(' ');
        if (separator > 0 && long.TryParse(value[(separator + 1)..], out long remainingMs))
        {
            string name = value[..separator].Trim();
            if (name.Length == 0) return;
            names.Add(name);
            timers.Add(new { name, remainingMs = Math.Max(0, remainingMs) });
            return;
        }
        if (value.Length > 0) names.Add(value);
    }
    private static object GuildMembers(LegacyPacket packet)
    {
        var members = new List<string>();
        var ranks = new List<object>();
        foreach (string record in packet.Text.Split('#', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            int marker = record.IndexOf("/*", StringComparison.Ordinal);
            int separator = marker < 0 ? -1 : record.IndexOf('/', marker + 2);
            string headerText = separator < 0 ? record : record[..separator];
            string[] header = headerText.Split("/*", 2, StringSplitOptions.None);
            if (!int.TryParse(header[0], out int rankNo)) continue;
            string rankName = header.ElementAtOrDefault(1) ?? "";
            var rankMembers = (separator < 0 ? "" : record[(separator + 1)..]).Split('/', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
            members.AddRange(rankMembers);
            ranks.Add(new { rankNo, rankName, members = rankMembers });
        }
        return new { type = "guildMembers", members, ranks };
    }
    private static object GuildResult(LegacyPacket packet, string action, bool accepted) => new
    {
        type = "guildResult",
        action,
        accepted,
        reason = accepted ? 0 : packet.Recog
    };
    public static string DisplayName(string name) => name.Replace('\\', '\n').TrimEnd('\n');
}
