namespace Mir2.WebGateway;

public static class ChatCommand
{
    public static string Local(string? value) => Build("local", value, null);

    public static string Build(string? channel, string? value, string? target)
    {
        string text = ValidateText(value);
        return channel?.Trim().ToLowerInvariant() switch
        {
            "local" or "nearby" => LocalText(text),
            "shout" => Prefix("!", text),
            "group" => Prefix("!!", text),
            "guild" => Prefix("!~", text),
            "whisper" => Whisper(target, text),
            _ => throw new InvalidOperationException("Unknown chat channel")
        };
    }

    private static string Whisper(string? target, string text)
    {
        string recipient = (target ?? "").Trim();
        if (recipient.Length is < 1 or > 10 || recipient.Any(char.IsControl) || recipient.Any(char.IsWhiteSpace)
            || recipient.Any(character => character is '/' or '!' or '@'))
            throw new InvalidOperationException("Whisper target is invalid");
        return Prefix($"/{recipient} ", text);
    }

    private static string LocalText(string text)
    {
        if (text[0] is '@' or '/' or '!')
            throw new InvalidOperationException("Use a matching chat channel for prefixed messages");
        return text;
    }

    private static string Prefix(string prefix, string text)
    {
        if (LegacyCodec.Gbk.GetByteCount(prefix + text) > 180)
            throw new InvalidOperationException("Chat message exceeds 180 GBK bytes");
        return prefix + text;
    }

    private static string ValidateText(string? value)
    {
        string text = (value ?? "").Trim();
        if (text.Length == 0 || text.Any(char.IsControl))
            throw new InvalidOperationException("Chat message is empty or contains control characters");
        if (LegacyCodec.Gbk.GetByteCount(text) > 180)
            throw new InvalidOperationException("Chat message exceeds 180 GBK bytes");
        return text;
    }
}
