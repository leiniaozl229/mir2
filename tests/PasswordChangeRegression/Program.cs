using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Text.Json;
using System.Threading.Channels;
using Mir2.WebGateway;

static void Check(bool value, string message) { if (!value) throw new Exception("FAIL: " + message); }
static JsonElement Request(long id, string account = "Test9", string oldPassword = "oldpass", string newPassword = "newpass")
    => JsonSerializer.SerializeToElement(new { type = "changePassword", requestId = id, account, oldPassword, newPassword });
static PasswordChange Fast(TimeSpan? deadline = null, TimeSpan? interval = null)
    => new(TimeSpan.FromMilliseconds(20), deadline ?? TimeSpan.FromSeconds(2), interval ?? TimeSpan.Zero);
static PasswordChangeOperation Begin(PasswordChange controller, JsonElement request)
{
    Check(controller.Begin(request, true, out var operation) is null && operation is not null, "valid operation was not started");
    return operation!;
}
static string? Type(JsonElement value) => value.GetProperty("type").GetString();
int groups = 0;
void Pass(string label) { groups++; Console.WriteLine("PASS " + label); }

// Exercise the actual public production policy once over TCP, including the
// >5000ms new-connection guard. Other network cases shorten only fixture timers.
await using (var peer = new NativePeer())
{
    var controller = new PasswordChange();
    var operation = Begin(controller, Request(1, "Test123456", "oldpass", "天地玄黄ab"));
    long before = Environment.TickCount64;
    Task<PasswordChangeResult> task = controller.Execute(operation, "127.0.0.1", peer.Port, CancellationToken.None);
    await peer.Accept(); var packet = await peer.Read(7000);
    Check(Environment.TickCount64 - before >= 5000, "CM2003 ignored native startup guard");
    Check(packet.Id == 2003 && packet.Recog == 0 && packet.Param == 0 && packet.Tag == 0 && packet.Series == 0, "CM2003 changed native header");
    Check(packet.Text.Split('\t').Length == 3 && packet.Text == string.Join('\t', "Test123456", "oldpass", "天地玄黄ab"), "GBK TAB fields changed");
    Check(packet.Body.Length == 29, "ten-byte boundary not preserved");
    await peer.Reply(506); var result = await task;
    Check(result.Accepted == true && result.Status == "succeeded" && result.Reason == 0 && result.RequestSent, "506 not sole success");
    Check(operation.Payload.All(value => value == 0) && !controller.IsPending, "completed credential payload/pending was retained");
    Pass("public policy: actual TCP CM2003 after >5s, exact 10-byte GBK fields, SM506 and payload disposal");
}

foreach (var (account, oldPassword, newPassword) in new[] {
    ("abc", "oldpass", "newpass"), ("abcdefghijk", "oldpass", "newpass"), ("测试账号", "oldpass", "newpass"),
    ("Test9", "", "newpass"), ("Test9", "oldpass", "ab"), ("Test9", "oldpass", "中文"),
    ("Test9", "oldpass", "天地玄黄甲a"), ("Test9", "oldpass", "😀abc"), ("Test9", "oldpass", "abc\tdef"),
    ("Test9", "oldpass", "abc\0def"), ("Test9", "old/pass", "newpass"), ("Test9", "oldpass", "new/pass"),
    ("Test9", "oldpass\r", "newpass"), ("Test9", "oldpass", "abcdefghijk") })
{
    var controller = Fast(); var result = controller.Begin(Request(1, account, oldPassword, newPassword), true, out var operation);
    Check(result is { Accepted: false, Status: "invalid", RequestSent: false } && operation is null && !controller.IsPending, "invalid credentials reached TCP");
}
foreach (var command in new[] {
    JsonSerializer.SerializeToElement(new { requestId = 1, account = "Test9", oldPassword = "oldpass" }),
    JsonSerializer.SerializeToElement(new { requestId = 1, account = "Test9", oldPassword = false, newPassword = "newpass" }) })
{
    Check(Fast().Begin(command, true, out _) is { Status: "invalid", RequestSent: false }, "missing/wrong field type accepted");
}
Pass("strict project fields: account ASCII4..10, new >=3 characters, GBK <=10 bytes, no replacement or delimiter/control injection");

foreach (object? id in new object?[] { null, 0, -1, 1.5, "1", true, 9007199254740992L })
{
    var command = JsonSerializer.SerializeToElement(new { requestId = id, account = "Test9", oldPassword = "oldpass", newPassword = "newpass" });
    Check(PasswordChange.RequestIdentity(command) is null, "unsafe identity reflected");
    try { Fast().Begin(command, true, out _); throw new Exception("unsafe identity started"); } catch (InvalidOperationException) { }
}
Check(PasswordChange.RequestIdentity(Request(9007199254740991L)) == 9007199254740991L, "maximum safe ID rejected");
Pass("request identity: absent/null/nonpositive/fractional/string/bool/unsafe rejected, maximum safe integer supported");

foreach (int reason in new[] { -1, -2, 0, 99 })
{
    await using var peer = new NativePeer(); var controller = Fast();
    Task<PasswordChangeResult> task = controller.Execute(Begin(controller, Request(1)), "127.0.0.1", peer.Port, CancellationToken.None);
    await peer.Accept(); await peer.Read(); await peer.Reply(507, reason);
    var result = await task; Check(result.Accepted == false && result.Reason == reason && result.Status == "rejected" && result.RequestSent, "native rejection reason lost");
}
Pass("actual TCP SM507 preserves -1 wrong old password / -2 lock / other native errors without inventing success");

await using (var peer = new NativePeer())
{
    var controller = Fast(TimeSpan.FromMilliseconds(150)); var operation = Begin(controller, Request(1));
    Task<PasswordChangeResult> task = controller.Execute(operation, "127.0.0.1", peer.Port, CancellationToken.None);
    await peer.Accept(); await peer.Read(); var result = await task;
    Check(result is { Accepted: null, Status: "timeout", RequestSent: true } && !controller.IsPending, "sent timeout fabricated rollback");
    // A later native response belongs to the disposed old short connection.
    try { await peer.Reply(506); } catch (IOException) { }
    await using var next = new NativePeer();
    Task<PasswordChangeResult> second = controller.Execute(Begin(controller, Request(2)), "127.0.0.1", next.Port, CancellationToken.None);
    await next.Accept(); await next.Read(); Check(!second.IsCompleted, "old response completed the new request");
    await next.Reply(507, -1); Check((await second) is { RequestId: 2, Accepted: false, Reason: -1 }, "new independent result was replaced");
}
Pass("sent timeout is unknown; late SM506 on old TCP cannot resolve the next request identity");

await using (var peer = new NativePeer())
{
    var controller = Fast(); Task<PasswordChangeResult> task = controller.Execute(Begin(controller, Request(1)), "127.0.0.1", peer.Port, CancellationToken.None);
    await peer.Accept(); await peer.Read(); peer.Close();
    Check(await task is { Accepted: null, Status: "disconnected", RequestSent: true }, "native close fabricated a negative commit");
}
Pass("native close after transmission reports unknown commit and releases pending");

await using (var peer = new NativePeer())
{
    var controller = Fast(); Task<PasswordChangeResult> task = controller.Execute(Begin(controller, Request(1)), "127.0.0.1", peer.Port, CancellationToken.None);
    await peer.Accept(); await peer.Read(); await peer.Reply(504);
    Check(await task is { Accepted: null, Status: "protocol_error", RequestSent: true }, "registration success was mistaken for password success");
}
Pass("unrelated native packet cannot be used as a password-change ACK");

await using (var peer = new NativePeer())
{
    var controller = new PasswordChange(TimeSpan.FromSeconds(1), TimeSpan.FromMilliseconds(50), TimeSpan.Zero);
    Task<PasswordChangeResult> task = controller.Execute(Begin(controller, Request(1)), "127.0.0.1", peer.Port, CancellationToken.None);
    await peer.Accept(); var result = await task;
    Check(result is { Accepted: false, Status: "timeout", RequestSent: false }, "unsent timeout marked commit unknown");
    Check(await peer.ReadClosed(), "cancelled startup sent a credential request");
}
Pass("timeout before native startup delay sends no CM2003 and distinguishes requestSent=false");

await using (var peer = new NativePeer())
{
    var controller = Fast(); using var cancel = new CancellationTokenSource(); var operation = Begin(controller, Request(1));
    Task<PasswordChangeResult> task = controller.Execute(operation, "127.0.0.1", peer.Port, cancel.Token);
    await peer.Accept(); await peer.Read(); cancel.Cancel();
    try { await task; throw new Exception("external cancellation fabricated a terminal result"); } catch (OperationCanceledException) { }
    Check(!controller.IsPending && operation.Payload.All(value => value == 0), "cancelled operation retained state/credential bytes");
    Check(await peer.ReadClosed(), "external cancellation did not close short TCP");
}
Pass("Web lifetime cancellation closes the isolated TCP, clears bytes and emits no fake rollback result");

await using (var peer = new NativePeer())
{
    var controller = Fast(interval: TimeSpan.FromMilliseconds(200));
    Task<PasswordChangeResult> task = controller.Execute(Begin(controller, Request(1)), "127.0.0.1", peer.Port, CancellationToken.None);
    await peer.Accept(); await peer.Read();
    Check(controller.Begin(Request(2), true, out _) is { Status: "busy", RequestId: 2, RequestSent: false }, "parallel request created another TCP");
    try { controller.Begin(Request(1), true, out _); throw new Exception("old identity reused"); } catch (InvalidOperationException) { }
    await peer.Reply(506); Check((await task).RequestId == 1, "parallel rejection overwrote pending identity");
    Check(controller.Begin(Request(3), true, out _) is { Status: "throttled", RequestSent: false }, "rapid request bypassed native throttle policy");
    Check(controller.Begin(Request(4), false, out _) is { Status: "unavailable", RequestSent: false }, "authenticated phase accepted password mutation");
}
Pass("busy/throttle/stale-ID/phase rejection cannot replace the original in-flight request");

await using (var fixture = new SessionFixture())
{
    Task run = fixture.Start(); var connected = await fixture.Socket.Wait(0, value => Type(value) == "connected");
    Check(connected.GetProperty("features").GetProperty("passwordChange").GetBoolean(), "missing supported feature");
    fixture.Socket.Input(Request(1)); await fixture.Peer.Accept(); await fixture.Peer.Read();
    int before = fixture.Socket.Count; fixture.Socket.Input(new { type = "login", account = "Test9", password = "oldpass" });
    await fixture.Socket.Wait(before, value => Type(value) == "error");
    Check(!fixture.Socket.Since(0).Any(value => Type(value) == "changePasswordResult"), "request got early apparent success");
    await fixture.Peer.Reply(506); var result = await fixture.Socket.Wait(0, value => Type(value) == "changePasswordResult");
    Check(result.GetProperty("requestId").GetInt64() == 1 && result.GetProperty("accepted").GetBoolean(), "Run did not forward actual native result");
    fixture.Socket.Input(new { type = "login", account = "Test9", password = "newpass" });
    await fixture.Peer.AcceptAnother(); var login = await fixture.Peer.Read();
    Check(login.Id == 2001, "short password TCP was reused as long authenticated TCP");
    await fixture.Stop(run);
}
Pass("actual GatewaySession.Run advertises feature, blocks pending login and uses a fresh long login connection afterward");

await using (var fixture = new SessionFixture())
{
    fixture.SetPhase("world"); Task run = fixture.Start(); await fixture.Socket.Wait(0, value => Type(value) == "connected");
    fixture.Socket.Input(Request(1)); var result = await fixture.Socket.Wait(0, value => Type(value) == "changePasswordResult");
    Check(result.GetProperty("status").GetString() == "unavailable" && !result.GetProperty("requestSent").GetBoolean(), "world changed password");
    Check(!fixture.Peer.PendingConnection(), "world request contacted LoginGate"); await fixture.Stop(run);
}
Pass("actual GatewaySession world phase refuses CM2003 without contacting LoginGate");

await using (var fixture = new SessionFixture())
{
    Task run = fixture.Start(); await fixture.Socket.Wait(0, value => Type(value) == "connected");
    fixture.Socket.Input(Request(1, newPassword: "abc\tdef"));
    var invalid = await fixture.Socket.Wait(0, value => Type(value) == "changePasswordResult");
    Check(invalid.GetProperty("requestId").GetInt64() == 1 && invalid.GetProperty("status").GetString() == "invalid"
        && !invalid.GetProperty("requestSent").GetBoolean() && !fixture.Peer.PendingConnection(), "Run validation leaked a credential TCP request");
    int start = fixture.Socket.Count; fixture.Socket.Input(Request(2)); await fixture.Peer.Accept(); await fixture.Peer.Read();
    fixture.Socket.Input(Request(2)); await fixture.Socket.Wait(start, value => Type(value) == "error");
    Check(!fixture.Socket.Since(start).Any(value => Type(value) == "changePasswordResult"), "reused ID fabricated completion of pending request");
    await fixture.Peer.Reply(507, -2);
    var denied = await fixture.Socket.Wait(start, value => Type(value) == "changePasswordResult");
    Check(denied.GetProperty("requestId").GetInt64() == 2 && denied.GetProperty("reason").GetInt32() == -2, "Run changed current native lock code");
    fixture.Socket.Input(new { type = "login", account = "Test9", password = "oldpass" });
    await fixture.Peer.AcceptAnother(); Check((await fixture.Peer.Read()).Id == 2001, "rejection blocked independent normal login");
    await fixture.Stop(run);
}
Pass("actual Run rejects injected fields without TCP, ignores repeated pending IDs and preserves -2 before normal login");

await using (var fixture = new SessionFixture())
{
    Task run = fixture.Start(); await fixture.Socket.Wait(0, value => Type(value) == "connected");
    fixture.Socket.Input(Request(1)); await fixture.Peer.Accept(); await fixture.Peer.Read(); fixture.Peer.Close();
    var result = await fixture.Socket.Wait(0, value => Type(value) == "changePasswordResult");
    Check(result.GetProperty("status").GetString() == "disconnected" && result.GetProperty("accepted").ValueKind == JsonValueKind.Null
        && fixture.Socket.State == WebSocketState.Open, "native password close killed Web/login lifetime or reported rollback");
    fixture.Socket.Input(new { type = "login", account = "Test9", password = "oldpass" });
    await fixture.Peer.AcceptAnother(); Check((await fixture.Peer.Read()).Id == 2001, "native password close damaged long login client");
    await fixture.Stop(run);
}
Pass("actual Run isolates native password disconnect, reports unknown and leaves normal login available");

await using (var fixture = new SessionFixture())
{
    Task run = fixture.Start(); await fixture.Socket.Wait(0, value => Type(value) == "connected");
    fixture.Socket.Input(Request(1)); await fixture.Peer.Accept(); await fixture.Peer.Read();
    int before = fixture.Socket.Count; fixture.Socket.RemoteClose(); await run.WaitAsync(TimeSpan.FromSeconds(2));
    Check(await fixture.Peer.ReadClosed(), "Web close left native password TCP alive");
    Check(!fixture.Socket.Since(before).Any(value => Type(value) == "changePasswordResult"), "closed Web received fake cancelled outcome");
}
Pass("actual Run consumes Web close during native wait, cancels short connection and suppresses stale result");

Console.WriteLine("PASS PasswordChangeRegression " + groups + "/" + groups + " groups (isolated local TCP + production Run; no real accounts/runtime)");

sealed class NativePeer : IAsyncDisposable
{
    private readonly TcpListener listener = new(IPAddress.Loopback, 0);
    private TcpClient? peer;
    public int Port => ((IPEndPoint)listener.LocalEndpoint).Port;
    public NativePeer() => listener.Start();
    public bool PendingConnection() => listener.Pending();
    public async Task Accept() => peer = await listener.AcceptTcpClientAsync().WaitAsync(TimeSpan.FromSeconds(3));
    public async Task AcceptAnother() { peer?.Dispose(); await Accept(); }
    public async Task<LegacyPacket> Read(int milliseconds = 2000)
    {
        using var timeout = new CancellationTokenSource(milliseconds); var bytes = new List<byte>(); byte[] one = new byte[1];
        while (true)
        {
            if (await peer!.GetStream().ReadAsync(one, timeout.Token) != 1) throw new Exception("fixture native connection closed");
            bytes.Add(one[0]); if (one[0] == '!') break;
        }
        if (bytes[0] != '#' || bytes.Count < 19) throw new Exception("fixture native framing invalid");
        return LegacyPacket.Parse(bytes.Skip(2).SkipLast(1).ToArray());
    }
    public Task Reply(ushort id, int reason = 0) => peer!.GetStream().WriteAsync(new byte[] { (byte)'#' }.Concat(LegacyCodec.Header(id, reason)).Append((byte)'!').ToArray()).AsTask();
    public async Task<bool> ReadClosed()
    {
        using var timeout = new CancellationTokenSource(2000); byte[] one = new byte[1];
        try { return await peer!.GetStream().ReadAsync(one, timeout.Token) == 0; } catch (IOException) { return true; }
    }
    public void Close() => peer?.Dispose();
    public ValueTask DisposeAsync() { peer?.Dispose(); listener.Stop(); return ValueTask.CompletedTask; }
}

sealed class SessionFixture : IAsyncDisposable
{
    public NativePeer Peer { get; } = new();
    public CaptureSocket Socket { get; } = new();
    private readonly CancellationTokenSource lifetime = new();
    private readonly GatewaySession session;
    public SessionFixture()
    {
        session = new(Socket);
        Set("host", "127.0.0.1"); Set("loginPort", Peer.Port);
        Set("passwordChange", new PasswordChange(TimeSpan.FromMilliseconds(20), TimeSpan.FromSeconds(2), TimeSpan.Zero));
    }
    private void Set(string field, object value) => typeof(GatewaySession).GetField(field, BindingFlags.NonPublic | BindingFlags.Instance)!.SetValue(session, value);
    public void SetPhase(string phase) => Set("phase", phase);
    public Task Start() => session.Run(lifetime.Token);
    public async Task Stop(Task run) { lifetime.Cancel(); await run.WaitAsync(TimeSpan.FromSeconds(2)); }
    public async ValueTask DisposeAsync() { lifetime.Cancel(); session.Dispose(); await Peer.DisposeAsync(); lifetime.Dispose(); }
}

sealed class CaptureSocket : WebSocket
{
    private readonly List<JsonElement> messages = [];
    private readonly Channel<byte[]?> input = Channel.CreateUnbounded<byte[]?>();
    private WebSocketState state = WebSocketState.Open;
    public void Input(object command) => input.Writer.TryWrite(JsonSerializer.SerializeToUtf8Bytes(command));
    public void RemoteClose() => input.Writer.TryWrite(null);
    public int Count { get { lock (messages) return messages.Count; } }
    public JsonElement[] Since(int start) { lock (messages) return messages.Skip(start).ToArray(); }
    public async Task<JsonElement> Wait(int start, Func<JsonElement, bool> predicate)
    {
        using var timeout = new CancellationTokenSource(2000);
        while (true)
        {
            var found = Since(start).Where(predicate).ToArray(); if (found.Length > 0) return found[0];
            await Task.Delay(5, timeout.Token);
        }
    }
    public override WebSocketCloseStatus? CloseStatus => null;
    public override string? CloseStatusDescription => null;
    public override WebSocketState State => state;
    public override string? SubProtocol => null;
    public override void Abort() => state = WebSocketState.Aborted;
    public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) { state = WebSocketState.Closed; return Task.CompletedTask; }
    public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) { state = WebSocketState.CloseSent; return Task.CompletedTask; }
    public override void Dispose() => state = WebSocketState.Closed;
    public override async Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken)
    {
        byte[]? bytes = await input.Reader.ReadAsync(cancellationToken);
        if (bytes is null) { state = WebSocketState.CloseReceived; return new(0, WebSocketMessageType.Close, true); }
        bytes.AsSpan().CopyTo(buffer.AsSpan()); return new(bytes.Length, WebSocketMessageType.Text, true);
    }
    public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
    {
        using var document = JsonDocument.Parse(buffer); lock (messages) messages.Add(document.RootElement.GetProperty("message").Clone());
        return Task.CompletedTask;
    }
}
