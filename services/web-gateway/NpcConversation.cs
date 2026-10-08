using System.Text.Json;

namespace Mir2.WebGateway;

public sealed record NpcConversationStamp(long npcSessionId, int mapGeneration, int npcId, bool automatic = false);

/// <summary>Presentation identity only. Call under the gateway's world-state lock.
/// Native NPC packets have no request nonce; matching an actor cannot distinguish
/// a late reply from an earlier conversation with that same actor.
/// </summary>
public sealed class NpcConversation
{
    private int generation;
    private long lastClientId;
    private bool automaticAllowed = true;
    private NpcConversationStamp? active;

    public void Reset(int mapGeneration)
    {
        if (mapGeneration < 0) throw new ArgumentOutOfRangeException(nameof(mapGeneration));
        generation = mapGeneration;
        active = null;
        automaticAllowed = true;
    }

    public NpcConversationStamp Begin(int npcId, long id, int mapGeneration)
    {
        if (mapGeneration != generation) throw new InvalidOperationException("NPC conversation belongs to an inactive map");
        if (id <= 0 || id <= lastClientId) throw new InvalidDataException("NPC conversation identity must increase");
        lastClientId = id;
        automaticAllowed = false;
        return active = new(id, generation, npcId);
    }

    public bool ObserveDialogue(int npcId)
    {
        if (active is not null) return active.npcId == npcId;
        if (!automaticAllowed) return false;
        active = new(0, generation, npcId, automatic: true);
        return true;
    }

    public bool Matches(int npcId) => active?.npcId == npcId;

    public NpcConversationStamp Require(JsonElement command, int? npcId = null)
    {
        if (!TryReadStamp(command, out long id, out int mapGeneration, out int? declaredNpc))
            throw new InvalidDataException("Invalid NPC conversation stamp");
        if (active is null || active.npcSessionId != id || active.mapGeneration != mapGeneration
            || npcId is int requestedNpc && active.npcId != requestedNpc
            || declaredNpc is int commandNpc && active.npcId != commandNpc)
            throw new InvalidOperationException("NPC conversation is no longer active");
        return active;
    }

    public bool Close(JsonElement command)
    {
        if (!TryReadStamp(command, out long id, out int mapGeneration, out int? npcId)
            || active is null || active.npcSessionId != id || active.mapGeneration != mapGeneration
            || npcId is int requestedNpc && active.npcId != requestedNpc)
            return false;
        Invalidate();
        return true;
    }

    public void Invalidate()
    {
        active = null;
        automaticAllowed = false;
    }

    public NpcConversationStamp? Current() => active;

    /// <summary>Use a captured stamp for in-flight quotes/results. Null selects the
    /// current conversation; with neither identity, no presentation is produced.
    /// Original JSON fields, including npcId and economic authority, are retained.
    /// </summary>
    public object? Stamp(object payload, NpcConversationStamp? captured = null)
    {
        NpcConversationStamp? stamp = captured ?? active;
        if (stamp is null) return null;
        JsonElement json = JsonSerializer.SerializeToElement(payload);
        if (json.ValueKind != JsonValueKind.Object) throw new InvalidDataException("NPC presentation payload must be an object");
        var result = new Dictionary<string, object?>();
        foreach (JsonProperty property in json.EnumerateObject()) result[property.Name] = property.Value.Clone();
        result["npcSessionId"] = stamp.npcSessionId;
        result["mapGeneration"] = stamp.mapGeneration;
        result["automatic"] = stamp.automatic;
        return result;
    }

    private static bool TryReadStamp(JsonElement command, out long id, out int mapGeneration, out int? npcId)
    {
        id = 0; mapGeneration = 0; npcId = null;
        if (command.ValueKind != JsonValueKind.Object
            || !command.TryGetProperty("npcSessionId", out JsonElement idValue) || idValue.ValueKind != JsonValueKind.Number
            || !idValue.TryGetInt64(out id) || id < 0
            || !command.TryGetProperty("mapGeneration", out JsonElement generationValue) || generationValue.ValueKind != JsonValueKind.Number
            || !generationValue.TryGetInt32(out mapGeneration) || mapGeneration < 0)
            return false;
        if (command.TryGetProperty("npcId", out JsonElement npcValue))
        {
            if (npcValue.ValueKind != JsonValueKind.Number || !npcValue.TryGetInt32(out int value)) return false;
            npcId = value;
        }
        return true;
    }
}
