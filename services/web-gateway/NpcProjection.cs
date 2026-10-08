using System.Text.RegularExpressions;

namespace Mir2.WebGateway;

public static partial class NpcProjection
{
    public static object? Project(LegacyPacket packet)
    {
        if (packet.Id != 643)
        {
            if (packet.Id is not (767 or 772)) return null;
            string dialogue = packet.Text.Replace('\\', '\n');
            string cleaned = CleanQuest(dialogue, out var questUpdate, out var questUpdates);
            return new { type = "dialogueMessage", text = cleaned, quest = questUpdate, quests = questUpdates.Count == 0 ? null : questUpdates };
        }
        string raw = packet.Text;
        int separator = raw.IndexOf('/');
        string npcName = separator < 0 ? "NPC" : raw[..separator];
        string content = separator < 0 ? raw : raw[(separator + 1)..];
        string displayContent = content.Trim();
        var links = Link().Matches(displayContent).Cast<Match>().ToArray();
        var options = links.Select(match =>
        {
            string command = match.Groups[2].Value;
            return new { text = match.Groups[1].Value, command, input = command.StartsWith("@@InPutString", StringComparison.OrdinalIgnoreCase) };
        }).ToArray();
        string text = Link().Replace(content, "");
        text = Decoration().Replace(text, match => match.Groups[1].Value).Replace('\\', '\n').Trim();
        text = CleanQuest(text, out var quest, out var quests).Trim();
        var parts = new List<object>();
        void AddText(string value)
        {
            value = Decoration().Replace(value, match => match.Groups[1].Value).Replace('\\', '\n');
            value = Quest().Replace(value, "");
            if (value.Length > 0) parts.Add(new { type = "text", text = value });
        }
        int cursor = 0;
        foreach (Match link in links)
        {
            AddText(displayContent[cursor..link.Index]);
            string command = link.Groups[2].Value;
            parts.Add(new { type = "option", text = link.Groups[1].Value, command, input = command.StartsWith("@@InPutString", StringComparison.OrdinalIgnoreCase) });
            cursor = link.Index + link.Length;
        }
        AddText(displayContent[cursor..]);
        return new { type = "npcDialogue", npcId = packet.Recog, npcName, text, options, parts, quest, quests = quests.Count == 0 ? null : quests };
    }

    private static string CleanQuest(string text, out object? quest, out List<object> quests)
    {
        quest = null;
        quests = [];
        foreach (Match marker in Quest().Matches(text))
        {
            string[] fields = marker.Groups[1].Value.Split('|');
            if (fields.Length < 2 || fields[0].Length is not (> 0 and <= 40) || fields[1].Length is not (> 0 and <= 20))
                continue;
            quests.Add(new
            {
                id = fields[0], status = fields[1], title = fields.ElementAtOrDefault(2) ?? "",
                summary = fields.ElementAtOrDefault(3) ?? "", objective = fields.ElementAtOrDefault(4) ?? "",
                detail = fields.ElementAtOrDefault(5) ?? ""
            });
        }
        quest = quests.FirstOrDefault();
        return Quest().Replace(text, "");
    }

    [GeneratedRegex("<([^<>/]+)/(@[^<>]+)>")]
    private static partial Regex Link();

    [GeneratedRegex("<([^<>/]+)>")]
    private static partial Regex Decoration();

    [GeneratedRegex("QMARK\\|([^\\r\\n]+?)\\|END")]
    private static partial Regex Quest();
}
