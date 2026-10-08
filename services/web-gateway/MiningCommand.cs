using System.Text.Json;

namespace Mir2.WebGateway;

/// <summary>A mining intent carries no client position, ore, quantity, or quality.</summary>
public sealed class MiningRequest(long actionId, int mapGeneration, ushort x, ushort y, byte direction, int weaponMakeIndex)
{
    public long ActionId { get; } = actionId;
    public int MapGeneration { get; } = mapGeneration;
    public ushort X { get; } = x;
    public ushort Y { get; } = y;
    public byte Direction { get; } = direction;
    public int WeaponMakeIndex { get; } = weaponMakeIndex;
    public bool Turning { get; set; } = true;
    public bool Interrupted { get; set; }
    public bool RejectionPublished { get; set; }
    public bool TimedOut { get; set; }
    public int PackedPosition => X | Y << 16;
}

public static class MiningCommand
{
    public const ushort TurnMessage = 3010, SwingMessage = 3015;
    public static bool IsPickaxe(InventoryItem? weapon)
        => weapon is { shape: 19, durability: > 0, stdMode: 5 or 6 };

    public static MiningRequest Validate(JsonElement command, int generation, (ushort x, ushort y)? position, InventoryItem? weapon)
    {
        foreach (var field in command.EnumerateObject())
            if (field.Name is not ("type" or "direction" or "actionId" or "mapGeneration"))
                throw new InvalidDataException("Mining accepts only direction and action identity");
        if (!command.TryGetProperty("actionId", out var id) || !id.TryGetInt64(out long actionId)
            || actionId <= 0 || actionId > 9_007_199_254_740_991)
            throw new InvalidDataException("Invalid mining action id");
        if (!command.TryGetProperty("mapGeneration", out var map) || !map.TryGetInt32(out int requested) || requested != generation)
            throw new InvalidOperationException("Mining belongs to an inactive map");
        if (!command.TryGetProperty("direction", out var direction) || !direction.TryGetByte(out byte facing) || facing > 7)
            throw new InvalidDataException("Invalid mining direction");
        if (position is not { } current) throw new InvalidOperationException("Player position is not ready");
        if (!IsPickaxe(weapon)) throw new InvalidOperationException("Mining requires an equipped usable pickaxe");
        return new(actionId, generation, current.x, current.y, facing, weapon!.makeIndex);
    }

    // Validate again after TURN's own reply: a pushed actor or changed tool must
    // not swing with the preceding position/tool. Native terrain/MINE/rates and
    // inventory checks remain inside ClientHitXY/PileStones/MakeMine.
    public static bool CanSwing(MiningRequest request, int generation, (ushort x, ushort y)? position, InventoryItem? weapon)
        => !request.Interrupted && request.MapGeneration == generation
        && position is { } current && current.x == request.X && current.y == request.Y
        && IsPickaxe(weapon) && weapon!.makeIndex == request.WeaponMakeIndex;
}
