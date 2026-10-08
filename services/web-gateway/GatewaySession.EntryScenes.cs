using System.Text.Json;

namespace Mir2.WebGateway;

public sealed partial class GatewaySession
{
    private bool interactiveLogin;
    private readonly string configuredServerName = Environment.GetEnvironmentVariable("MIR2_SERVER_NAME") ?? "热血传奇";
    private IReadOnlyList<LoginServerOption> loginServers = [];
    private long entryNoticeCounter;
    private (long Id, GameEpoch Epoch, string[] Lines)? pendingEntryNotice;

    private void InitializeEntryScenes(JsonElement command)
    {
        if (command.TryGetProperty("interactiveLogin", out var interactive) && interactive.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            throw new InvalidDataException("Invalid login scene capability");
        interactiveLogin = command.TryGetProperty("interactiveLogin", out interactive) && interactive.ValueKind == JsonValueKind.True;
        loginServers = [];
        lock (worldStateLock) pendingEntryNotice = null;
    }

    private async Task PresentLoginServers(LegacyPacket response, CancellationToken cancellation)
    {
        loginServers = OriginalLoginScenes.ReadServers(response);
        phase = "servers";
        await Send(new { type = "servers", servers = loginServers.Select(server => new
        { name = server.Name, status = server.Status, routable = server.Name == configuredServerName }) }, cancellation);
    }

    private async Task SelectLoginServer(JsonElement command, CancellationToken cancellation)
    {
        if (!command.TryGetProperty("name", out var value) || value.ValueKind != JsonValueKind.String)
            throw new InvalidDataException("Invalid server selection");
        string name = value.GetString() ?? "";
        OriginalLoginScenes.ValidateSelection(loginServers, name, configuredServerName);
        await CompleteServerLogin(name, cancellation);
    }

    private async Task CompleteServerLogin(string name, CancellationToken cancellation)
    {
        phase = "selectingServer";
        await login.Send(104, cancellation, name);
        ticket = (await login.Expect(530, cancellation)).Text.Split('/')[^1];
        if (!uint.TryParse(ticket, out _)) throw new InvalidDataException("Invalid login ticket");
        selection.Dispose(); selection = new();
        await selection.Connect(host, selectionPort, cancellation);
        await selection.Send(100, cancellation, $"{account}/{ticket}");
        var result = await selection.Expect(520, cancellation);
        phase = "characters";
        loginServers = [];
        await Send(CharacterList(result), cancellation);
    }

    private async Task PresentEntryNotice(GameEpoch epoch, LegacyPacket packet, CancellationToken cancellation)
    {
        (long Id, GameEpoch Epoch, string[] Lines) notice;
        string[] lines = OriginalLoginScenes.NoticeLines(packet.Text);
        lock (worldStateLock)
        {
            if (!IsCurrentGameEpoch(epoch)) return;
            if (pendingEntryNotice is { } existing && ReferenceEquals(existing.Epoch, epoch)) notice = existing;
            else
            {
                if (phase != "entering") throw new InvalidDataException("Entry notice arrived outside character entry");
                notice = (++entryNoticeCounter, epoch, lines);
                pendingEntryNotice = notice;
                phase = "entryNotice";
            }
        }
        await SendFromGame(epoch, new { type = "entryNotice", noticeId = notice.Id, lines = notice.Lines }, cancellation);
    }

    private async Task AcknowledgeEntryNotice(JsonElement command, CancellationToken cancellation)
    {
        long? id = OptionalLong(command, "noticeId");
        GameEpoch epoch;
        lock (worldStateLock)
        {
            if (id is null or <= 0 || pendingEntryNotice is not { } notice || notice.Id != id || !IsCurrentGameEpoch(notice.Epoch))
                throw new InvalidOperationException("Entry notice belongs to an inactive character entry");
            epoch = notice.Epoch;
            pendingEntryNotice = null;
            phase = "entering";
        }
        await SendGameProtocol(epoch, 1018, cancellation);
    }
}
