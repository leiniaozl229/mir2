using System.Text.Json;

namespace Mir2.WebGateway;

public static class SpellTarget
{
    private static readonly JsonDocument Rules = JsonDocument.Parse(
        typeof(SpellTarget).Assembly.GetManifestResourceStream("Mir2.WebGateway.SkillInput")
        ?? throw new InvalidDataException("Missing skill input contract"));
    public static int Range => Rules.RootElement.GetProperty("range").GetInt32();
    public static string UseOf(int magicId) => Rules.RootElement.GetProperty("skills")
        .TryGetProperty(magicId.ToString(System.Globalization.CultureInfo.InvariantCulture), out var skill)
        ? skill.GetProperty("use").GetString()! : "hostile";
    public static bool AllowsPoint(int magicId) => Rules.RootElement.GetProperty("skills")
        .TryGetProperty(magicId.ToString(System.Globalization.CultureInfo.InvariantCulture), out var skill)
        && skill.GetProperty("point").GetBoolean();

    // Coordinates are an aiming request. Only the game service can decide
    // whether the spell succeeds, creates an event, or consumes mana/reagents.
    public static (int targetId, ushort x, ushort y) Resolve(JsonElement command, int magicId, int selfId,
        (ushort x, ushort y) position,
        IReadOnlyDictionary<int, (ushort x, ushort y, bool dead, uint? feature)> entities)
    {
        int targetId = command.TryGetProperty("targetId", out var target) ? target.GetInt32() : 0;
        bool hasX = command.TryGetProperty("x", out var xValue), hasY = command.TryGetProperty("y", out var yValue);
        if (UseOf(magicId) == "rush")
        {
            if (hasX || hasY || targetId != 0 || !command.TryGetProperty("direction", out var directionValue)
                || !directionValue.TryGetInt32(out int direction) || direction is < 0 or > 7)
                throw new InvalidDataException("Rush requires an eight-way direction");
            // CM_SPELL's X field carries direction for SKILL_MOOTEBO.
            return (0, (ushort)direction, 0);
        }
        if (hasX || hasY)
        {
            if (!hasX || !hasY || targetId != 0 || !AllowsPoint(magicId)
                || !xValue.TryGetInt32(out int x) || !yValue.TryGetInt32(out int y)
                || x is < 0 or > short.MaxValue || y is < 0 or > short.MaxValue)
                throw new InvalidDataException("Invalid spell aim coordinates");
            CheckRange(position, x, y);
            return (0, (ushort)x, (ushort)y);
        }
        if (targetId < 0) throw new InvalidDataException("Invalid spell target");
        if (targetId == 0 || targetId == selfId) return (selfId, position.x, position.y);
        if (!entities.TryGetValue(targetId, out var entity) || entity.dead
            || entity.feature is not uint feature || (feature & 255) == 50)
            throw new InvalidOperationException("Magic target is unavailable");
        CheckRange(position, entity.x, entity.y);
        return (targetId, entity.x, entity.y);
    }

    private static void CheckRange((ushort x, ushort y) position, int x, int y)
    {
        if (Math.Max(Math.Abs(x - position.x), Math.Abs(y - position.y)) > Range)
            throw new InvalidOperationException("Magic target is out of range");
    }
}
