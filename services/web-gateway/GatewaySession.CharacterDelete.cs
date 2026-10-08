using System.Text.Json;

namespace Mir2.WebGateway;

public sealed partial class GatewaySession
{
    private long lastDeleteId;
    private readonly TimeSpan characterDeleteTimeout = TimeSpan.FromSeconds(20);

    private static long? DeleteIdentity(JsonElement command)
        => command.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "deleteCharacter"
            && OptionalLong(command, "requestId") is > 0 and <= 9_007_199_254_740_991 and var id ? id : null;

    private async Task DeleteCharacter(JsonElement command, CancellationToken cancellation)
    {
        long id = DeleteIdentity(command) ?? throw new InvalidOperationException("Invalid character deletion identity");
        if (id <= lastDeleteId) throw new InvalidOperationException("Character deletion identity already used");
        string name = Field(command, "name", 10);
        if (!characters.Contains(name)) throw new InvalidOperationException("Character unavailable");
        lastDeleteId = id;
        bool requestSent = false;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(characterDeleteTimeout);
        try
        {
            // Both CM_NEWCHR and CM_DELCHR are ignored within1000ms of the
            // preceding character query. Never send a delete again on timeout.
            await Task.Delay(TimeSpan.FromMilliseconds(1100), timeout.Token);
            requestSent = true; // A failed write may already have sent bytes.
            await selection.Send(102, timeout.Token, name);
            var ack = await selection.Receive(timeout.Token);
            if (ack.Id is not 523 and not 524) throw new InvalidDataException("Unexpected character deletion response");
            // DBSrv clears boChrQueryed even on SM524. Restore it with an actual
            // query before allowing enter/create/delete on this connection.
            // Existing native DeleteChr also has paths that emit523 without
            // updating Deleted: only the fresh authoritative list proves removal.
            await selection.Send(100, timeout.Token, $"{account}/{ticket}");
            var snapshot = await selection.Expect(520, timeout.Token);
            var list = CharacterOptions(snapshot);
            bool deleted = ack.Id == 523 && !characters.Contains(name);
            await Send(new { type = "characterDeletionResult", requestId = id, name,
                accepted = (bool?)deleted, status = deleted ? "deleted" : ack.Id == 524 ? "rejected" : "not-deleted",
                reason = ack.Recog, requestSent, characters = list, requiresLogin = false }, cancellation);
        }
        catch (Exception error) when (!cancellation.IsCancellationRequested && error is not OutOfMemoryException)
        {
            // No outcome is a rollback. Retire this stream so late ACK/list
            // packets cannot be consumed by a subsequent selection command.
            selection.Dispose(); characters.Clear(); phase = "login"; character = "";
            await Send(new { type = "characterDeletionResult", requestId = id, name,
                accepted = requestSent ? (bool?)null : false, status = requestSent ? "unknown" : "not-sent",
                reason = (int?)null, requestSent, requiresLogin = true }, cancellation);
        }
    }
}
