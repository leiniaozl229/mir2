using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Mir2.WebGateway;

public sealed record PasswordChangeResult(long RequestId, bool? Accepted, string Status, int? Reason, bool RequestSent)
{
    public object Message() => new { type = "changePasswordResult", requestId = RequestId, accepted = Accepted,
        status = Status, reason = Reason, requestSent = RequestSent };
}

// Each operation owns a fresh, unauthenticated LoginGate connection. Credentials
// remain encoded bytes and must never appear in exception messages or ToString.
public sealed class PasswordChangeOperation : IDisposable
{
    internal byte[] Payload { get; }
    public long RequestId { get; }
    internal PasswordChangeOperation(long requestId, byte[] payload) { RequestId = requestId; Payload = payload; }
    public void Dispose() => CryptographicOperations.ZeroMemory(Payload);
    public override string ToString() => nameof(PasswordChangeOperation);
}

public sealed class PasswordChange
{
    public static readonly TimeSpan NativeStartupDelay = TimeSpan.FromMilliseconds(5100);
    public static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(15);
    public static readonly TimeSpan RequestInterval = TimeSpan.FromMilliseconds(5100);
    private readonly object gate = new();
    private readonly TimeSpan startupDelay, timeout, interval;
    private long lastRequestId, lastStarted;
    private bool started, pending;
    public bool IsPending { get { lock (gate) return pending; } }

    public PasswordChange() : this(NativeStartupDelay, RequestTimeout, RequestInterval) { }
    // Linked-source regressions can exercise timeout and isolation without waiting
    // fifteen seconds for every negative case. The public constructor locks policy.
    internal PasswordChange(TimeSpan startupDelay, TimeSpan timeout, TimeSpan interval)
    { this.startupDelay = startupDelay; this.timeout = timeout; this.interval = interval; }

    public static long? RequestIdentity(JsonElement command)
    {
        if (command.ValueKind != JsonValueKind.Object || !command.TryGetProperty("requestId", out var value)
            || value.ValueKind != JsonValueKind.Number || !value.TryGetInt64(out long id) || id <= 0 || id > 9007199254740991)
            return null;
        return id;
    }

    // A reused ID is not a new request: do not send an apparent result for the
    // already-running operation. Rejections for new IDs cannot complete older IDs.
    public PasswordChangeResult? Begin(JsonElement command, bool available, out PasswordChangeOperation? operation)
    {
        operation = null;
        long id = RequestIdentity(command) ?? throw new InvalidOperationException("Invalid password change request identity");
        lock (gate)
        {
            if (id <= lastRequestId) throw new InvalidOperationException("Password change request identity already used");
            lastRequestId = id;
            if (!available) return new(id, false, "unavailable", null, false);
            if (pending) return new(id, false, "busy", null, false);
            long now = Environment.TickCount64;
            if (started && now - lastStarted < interval.TotalMilliseconds) return new(id, false, "throttled", null, false);
            byte[] payload;
            try { payload = EncodePayload(command); }
            catch (Exception error) when (error is InvalidDataException or EncoderFallbackException)
            { return new(id, false, "invalid", null, false); }
            started = true; lastStarted = now; pending = true;
            operation = new(id, payload);
            return null;
        }
    }

    public static byte[] EncodePayload(JsonElement command)
    {
        string account = Field(command, "account", 4);
        if (account.Any(value => !char.IsAsciiLetterOrDigit(value))) throw new InvalidDataException("Invalid password change fields");
        string oldPassword = Field(command, "oldPassword", 1);
        string newPassword = Field(command, "newPassword", 3);
        // TAB is the actual CM2003 separator. Slash is excluded by the existing
        // Web login policy because CM2001 uses it as its credential separator.
        byte[] raw = LegacyCodec.Gbk.GetBytes(string.Join('\t', account, oldPassword, newPassword));
        try { return [.. LegacyCodec.Header(2003), .. LegacyCodec.Encode(raw)]; }
        finally { CryptographicOperations.ZeroMemory(raw); }
    }

    private static string Field(JsonElement command, string name, int minimumCharacters)
    {
        if (command.ValueKind != JsonValueKind.Object || !command.TryGetProperty(name, out var field)
            || field.ValueKind != JsonValueKind.String) throw new InvalidDataException("Invalid password change fields");
        string value = field.GetString() ?? "";
        if (value.Length < minimumCharacters || value.Any(character => character == '/' || char.IsControl(character))
            || LegacyCodec.Gbk.GetByteCount(value) > 10) throw new InvalidDataException("Invalid password change fields");
        return value;
    }

    public async Task<PasswordChangeResult> Execute(PasswordChangeOperation operation, string host, int port, CancellationToken cancellation)
    {
        bool sent = false;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(timeout);
        using var connection = new LegacyConnection();
        try
        {
            await connection.Connect(host, port, deadline.Token);
            // LoginServer initializes LastUpdatePwdTick on connect. Its handler
            // accepts only elapsed >5000ms and silently drops an earlier CM2003.
            await Task.Delay(startupDelay, deadline.Token);
            sent = true; // A partial/failed write can still have reached the server.
            await connection.SendPayload(operation.Payload, deadline.Token);
            var packet = await connection.Receive(deadline.Token);
            return packet.Id switch
            {
                506 => new(operation.RequestId, true, "succeeded", 0, true),
                507 => new(operation.RequestId, false, "rejected", packet.Recog, true),
                _ => new(operation.RequestId, null, "protocol_error", null, true)
            };
        }
        catch (OperationCanceledException) when (!cancellation.IsCancellationRequested)
        { return new(operation.RequestId, sent ? null : false, "timeout", null, sent); }
        catch (Exception error) when (error is IOException or System.Net.Sockets.SocketException or ObjectDisposedException)
        { return new(operation.RequestId, sent ? null : false, "disconnected", null, sent); }
        catch (InvalidDataException)
        { return new(operation.RequestId, sent ? null : false, "protocol_error", null, sent); }
        finally
        {
            operation.Dispose();
            lock (gate) pending = false;
        }
    }
}
