namespace Mir2.WebGateway;

public sealed record MeleeAttackRequest(long ActionId, int MapGeneration, ushort X, ushort Y, byte Direction)
{
    public bool Interrupted { get; set; }
    public bool RejectionPublished { get; set; }
    public bool Matches(LegacyPacket packet, int? actorId, int mapGeneration)
        => !Interrupted && MapGeneration == mapGeneration && packet.Recog == actorId
            && packet.Param == X && packet.Tag == Y && (packet.Series & 255) == Direction
            && MeleeSkills.KindForServerAttack(packet.Id) is not null;
}

// ClMain.AttackTarget priority and TargetInSwordLongAttackRange. These flags
// select a legacy input; the engine remains authoritative for damage and cost.
public sealed class MeleeSkills
{
    // Exact server SMs. Neither a selected CM nor +GD proves its resulting
    // mode: the engine may downgrade or reject an attempted skill attack.
    public static string? KindForServerAttack(int legacyIdent) => legacyIdent switch
    {
        14 => "normal", 15 => "heavy", 16 => "big", 18 => "power",
        19 => "thrusting", 24 => "halfMoon", 8 => "fire", _ => null
    };

    public bool Thrusting { get; private set; }
    public bool HalfMoon { get; private set; }
    public bool FireHit { get; private set; }
    public bool PowerHit { get; private set; }

    public bool Apply(string status)
    {
        switch (status)
        {
            case "+LNG": Thrusting = true; break;
            case "+ULNG": Thrusting = false; break;
            case "+WID": HalfMoon = true; break;
            case "+UWID": HalfMoon = false; break;
            case "+FIR": FireHit = true; break;
            case "+UFIR": FireHit = false; break;
            case "+PWR": PowerHit = true; break;
            default: return false;
        }
        return true;
    }

    public static bool ConfirmsSpell(string status, int magicId) => magicId switch
    {
        12 => status is "+LNG" or "+ULNG",
        25 => status is "+WID" or "+UWID",
        26 => status == "+FIR",
        _ => false
    };

    public ushort SelectAttack(int mana, bool heavyWeapon, bool longTarget)
    {
        if (FireHit && mana >= 7) { FireHit = false; return 3025; }
        if (PowerHit) { PowerHit = false; return 3018; }
        if (HalfMoon && mana >= 3) return 3024;
        if (Thrusting && longTarget) return 3019;
        return heavyWeapon ? (ushort)3015 : (ushort)3014;
    }

    public object Snapshot() => new { type = "warriorSkill", thrusting = Thrusting,
        halfMoon = HalfMoon, fireHit = FireHit, powerHit = PowerHit };
}
