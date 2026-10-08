namespace Mir2.WebGateway;

/// <summary>One source-bound CM_MAGICKEYCHANGE intent, never an optimistic skill update.</summary>
public sealed record MagicKeyChange(ushort MagicId, byte Key);

public static class MagicKeyBinding
{
    public const ushort MessageId = 1008;

    public static MagicKeyChange Validate(int magicId, int key, IEnumerable<MagicSkill> learned)
    {
        if (magicId is <= 0 or > ushort.MaxValue)
            throw new InvalidDataException("Invalid magic identity");
        if (key != 0 && key is not (>= 49 and <= 56))
            throw new InvalidDataException("Magic key must be None or F1-F8");
        MagicSkill[] skills = learned.ToArray();
        if (skills.Count(skill => skill.magicId == magicId) != 1)
            throw new InvalidOperationException("Magic is not uniquely learned");
        return new((ushort)magicId, (byte)key);
    }

    /// <summary>Encoded legacy header: Recog=magicId, Param=ASCII key or #0.</summary>
    public static byte[] Header(MagicKeyChange request)
    {
        if (request.MagicId == 0 || (request.Key != 0 && request.Key is not (>= 49 and <= 56)))
            throw new InvalidDataException("Invalid magic key change");
        return LegacyCodec.Header(MessageId, request.MagicId, request.Key);
    }

    /// <summary>Only an actual SM_SENDMYMAGIC snapshot can confirm the change.</summary>
    public static bool SnapshotConfirms(MagicKeyChange request, IEnumerable<MagicSkill> snapshot)
    {
        MagicSkill[] skills = snapshot.ToArray();
        MagicSkill[] target = skills.Where(skill => skill.magicId == request.MagicId).ToArray();
        return target.Length == 1 && target[0].key == request.Key &&
            (request.Key == 0 || !skills.Any(skill =>
                skill.magicId != request.MagicId && skill.key == request.Key));
    }
}
