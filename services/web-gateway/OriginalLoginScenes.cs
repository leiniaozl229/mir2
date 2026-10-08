namespace Mir2.WebGateway;

public sealed record LoginServerOption(string Name, string Status);

public static class OriginalLoginScenes
{
    public static IReadOnlyList<LoginServerOption> ReadServers(LegacyPacket packet)
    {
        if (packet.Id != 529 || packet.Series is 0 or > 64 || packet.Text.Length > 8192)
            throw new InvalidDataException("Invalid native server list");
        string[] fields = packet.Text.Split('/');
        int length = fields.Length - (fields[^1] == "" ? 1 : 0);
        if (length != packet.Series * 2) throw new InvalidDataException("Native server list count mismatch");
        var names = new HashSet<string>(StringComparer.Ordinal);
        var result = new List<LoginServerOption>();
        for (int index = 0; index < length; index += 2)
        {
            string name = fields[index];
            if (name.Length is 0 or > 80 || name.Any(char.IsControl) || !names.Add(name))
                throw new InvalidDataException("Invalid native server name");
            string status = fields[index + 1] switch
            {
                "Idle" or "1" => "idle", "General" or "2" => "general", "Busy" or "3" => "busy",
                "Full" or "4" => "full", "0" => "offline", _ => "unknown"
            };
            result.Add(new(name, status));
        }
        return result;
    }

    public static void ValidateSelection(IReadOnlyList<LoginServerOption> options, string name, string configuredServer)
    {
        var server = options.SingleOrDefault(option => option.Name == name);
        if (server is null || name != configuredServer) throw new InvalidOperationException("Server is unavailable on this gateway");
        if (server.Status is not ("idle" or "general" or "busy")) throw new InvalidOperationException("Server is unavailable");
    }

    public static string[] NoticeLines(string text)
    {
        const string separator = " \u001b\u001b";
        if (text.Length > 131072) throw new InvalidDataException("Native entry notice exceeds limit");
        if (text.EndsWith(separator, StringComparison.Ordinal)) text = text[..^separator.Length];
        return text.Replace(separator, "\n").Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
    }
}
