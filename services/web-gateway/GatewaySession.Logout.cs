using System.Net.WebSockets;
using System.Text.Json;

namespace Mir2.WebGateway;

public sealed partial class GatewaySession
{
    private int sessionGeneration;
    private volatile bool logoutPending;
    private GameEpoch? activeGameEpoch;
    private LogoutOperation? lastLogout;
    private Task? logoutTask;
    private TimeSpan logoutTimeout = TimeSpan.FromSeconds(15);
    private TimeSpan softCloseDelay = TimeSpan.FromSeconds(2);

    private sealed class GameEpoch(LegacyConnection connection, string characterName, int generation,
        CancellationTokenSource cancellation)
    {
        public readonly LegacyConnection Connection = connection;
        public readonly string CharacterName = characterName;
        public readonly int Generation = generation;
        public readonly CancellationTokenSource Cancellation = cancellation;
        public readonly CancellationTokenSource TimerCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellation.Token);
        public readonly SemaphoreSlim NativeWrites = new(1, 1);
        public readonly List<Task> Timers = [];
        public Task? Reader;
        public volatile bool Retiring;
    }

    private sealed class LogoutOperation(long id, string mode, int originalMapGeneration, int generation, GameEpoch epoch)
    {
        public readonly long Id = id;
        public readonly string Mode = mode;
        public readonly int OriginalMapGeneration = originalMapGeneration;
        public readonly int Generation = generation;
        public readonly GameEpoch Epoch = epoch;
        public object Result = new { type = "logoutState", logoutId = id, mode, state = "waiting", sessionGeneration = generation };
        public bool Complete;
    }

    private static long? LogoutIdentity(JsonElement command)
        => command.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "logout"
            && OptionalLong(command, "logoutId") is > 0 and <= 9_007_199_254_740_991 and var id ? id : null;

    private static string? LogoutMode(JsonElement command)
        => command.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "logout"
            && command.TryGetProperty("mode", out var mode) && mode.ValueKind == JsonValueKind.String
            && mode.GetString() is "reselect" or "login" ? mode.GetString() : null;

    private async Task StartLogout(JsonElement command, CancellationToken cancellation)
    {
        long id = LogoutIdentity(command) ?? throw new InvalidDataException("Invalid logout identity");
        string mode = LogoutMode(command) ?? throw new InvalidDataException("Invalid logout mode");
        if (!command.TryGetProperty("mapGeneration", out var map) || map.ValueKind != JsonValueKind.Number || !map.TryGetInt32(out int generation))
            throw new InvalidDataException("Invalid logout map generation");

        LogoutOperation operation;
        // Acceptance and old epoch publication use the same gate. No old world
        // envelope can be published after the accepted waiting envelope.
        await outgoing.WaitAsync(cancellation);
        try
        {
            lock (worldStateLock)
            {
                if (lastLogout is { } previous && previous.Id == id)
                {
                    if (previous.Mode != mode || previous.OriginalMapGeneration != generation)
                        throw new InvalidOperationException("Logout identity belongs to another request");
                    bool sameTransition = previous.Generation == sessionGeneration &&
                        (logoutPending || previous.Complete && phase is "characters" or "login");
                    if (!sameTransition) throw new InvalidOperationException("Logout belongs to an inactive character session");
                    operation = previous;
                }
                else
                {
                    if (logoutPending) throw new InvalidOperationException("Character logout is still pending");
                    if (phase != "world" || activeGameEpoch is not { } epoch || epoch.Retiring)
                        throw new InvalidOperationException("Logout is unavailable in current session phase");
                    if (generation != mapGeneration) throw new InvalidOperationException("Logout belongs to an inactive map");
                    if (lastLogout is { } old && id <= old.Id) throw new InvalidOperationException("Logout identity has already been used");
                    epoch.Retiring = true;
                    logoutPending = true;
                    phase = "loggingOut";
                    sessionGeneration++;
                    mapGeneration++;
                    ResetWorldState();
                    operation = new(id, mode, generation, sessionGeneration, epoch);
                    lastLogout = operation;
                }
            }
            await SendLocked(operation.Result, cancellation);
        }
        finally { outgoing.Release(); }
        if (ReferenceEquals(operation, lastLogout) && !operation.Complete && logoutTask?.IsCompleted != false)
            logoutTask = CompleteLogout(operation, cancellation);
    }

    private async Task CompleteLogout(LogoutOperation operation, CancellationToken cancellation)
    {
        var epoch = operation.Epoch;
        try
        {
            await epoch.TimerCancellation.CancelAsync();
            if (operation.Mode == "reselect")
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
                timeout.CancelAfter(logoutTimeout);
                // CM_SOFTCLOSE is an original request, not a durable save ACK.
                // Send before cancelling an active receive. On Windows an
                // aborted receive can invalidate TcpClient's connected state.
                await epoch.NativeWrites.WaitAsync(timeout.Token);
                try { await epoch.Connection.Send(1009, timeout.Token); }
                finally { epoch.NativeWrites.Release(); }
                // Original ClMain tcSoftClose closes the client socket on its
                // 2000ms command timer. GameGate need not initiate EOF. Waiting
                // for it leaves real reselect stuck even though CM1009 arrived.
                // This delay/close is transport retirement, never a save ACK.
                await Task.Delay(softCloseDelay, timeout.Token);
                epoch.Connection.Dispose();
                await epoch.Cancellation.CancelAsync();
                await JoinRetiredReader(epoch, timeout.Token);
                await FinishGameEpoch(epoch);
                lock (worldStateLock) { ResetWorldState(); activeGameEpoch = null; }
                selection.Dispose(); selection = new();
                await selection.Connect(host, selectionPort, timeout.Token);
                await selection.Send(100, timeout.Token, $"{account}/{ticket}");
                var result = await selection.Expect(520, timeout.Token);
                var list = CharacterOptions(result);
                lock (worldStateLock)
                {
                    character = "";
                    phase = "characters";
                    operation.Result = new { type = "logoutState", logoutId = operation.Id, mode = operation.Mode,
                        state = "characters", sessionGeneration = operation.Generation, characters = list, requiresLogin = false };
                }
            }
            else
            {
                epoch.Connection.Dispose();
                await epoch.Cancellation.CancelAsync();
                await JoinRetiredReader(epoch, CancellationToken.None);
                await FinishGameEpoch(epoch);
                ResetAuthentication();
                operation.Result = new { type = "logoutState", logoutId = operation.Id, mode = operation.Mode,
                    state = "login", sessionGeneration = operation.Generation, requiresLogin = false };
            }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            epoch.Connection.Dispose();
            await epoch.Cancellation.CancelAsync();
            await JoinRetiredReader(epoch, CancellationToken.None);
            await FinishGameEpoch(epoch);
            lock (worldStateLock) { ResetWorldState(); activeGameEpoch = null; }
            return;
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            epoch.Connection.Dispose();
            await epoch.Cancellation.CancelAsync();
            await JoinRetiredReader(epoch, CancellationToken.None);
            await FinishGameEpoch(epoch);
            ResetAuthentication();
            // The original request may already have reached the engine. Do not
            // replay it, resume the old world, or claim a confirmed save.
            operation.Result = new { type = "logoutState", logoutId = operation.Id, mode = operation.Mode,
                state = "failed", sessionGeneration = operation.Generation, requiresLogin = true,
                message = "返回选角失败，请重新登录。原角色保存状态尚未确认。" };
            Console.Error.WriteLine($"Character logout failed ({error.GetType().Name})");
        }
        finally
        {
            // This is safe only after the cancelled epoch's reader and timers join.
            if (epoch.Reader?.IsCompleted != false && epoch.Timers.All(task => task.IsCompleted))
            {
                epoch.TimerCancellation.Dispose(); epoch.Cancellation.Dispose();
                epoch.NativeWrites.Dispose();
            }
        }
        await outgoing.WaitAsync(cancellation);
        try
        {
            lock (worldStateLock) { operation.Complete = true; logoutPending = false; }
            await SendLocked(operation.Result, cancellation);
        }
        finally { outgoing.Release(); }
    }

    private object[] CharacterOptions(LegacyPacket result)
    {
        string[] fields = result.Text.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (fields.Length % 5 != 0 || result.Recog != fields.Length / 5) throw new InvalidDataException("Invalid character list");
        var names = new HashSet<string>(StringComparer.Ordinal);
        var list = new List<object>();
        for (int i = 0; i < fields.Length; i += 5)
        {
            bool selected = fields[i].StartsWith('*');
            string name = selected ? fields[i][1..] : fields[i];
            if (string.IsNullOrWhiteSpace(name) || !names.Add(name)
                || !int.TryParse(fields[i + 1], out int job) || !int.TryParse(fields[i + 2], out int hair)
                || !int.TryParse(fields[i + 3], out int level) || !int.TryParse(fields[i + 4], out int sex))
                throw new InvalidDataException("Invalid character list");
            list.Add(new { name, job, hair, level, sex, selected });
        }
        // A malformed refresh must not publish a partially replaced whitelist.
        characters = names;
        return list.ToArray();
    }

    private void ResetAuthentication()
    {
        login.Dispose(); selection.Dispose(); game.Dispose();
        login = new(); selection = new(); game = new();
        lock (worldStateLock)
        {
            account = ticket = character = "";
            characters.Clear();
            ResetWorldState();
            activeGameEpoch = null;
            phase = "login";
        }
    }

    // Caller holds worldStateLock. Final reset occurs after the retired reader
    // has joined, before any replacement character can enter the world.
    private void ResetWorldState()
    {
        confirmedPosition = pendingPosition = null;
        pendingAttack = false; ClearPendingAction();
        pendingItemAction = null; pendingSpell = null;
        pendingMagicKey = null; pendingBindingId = null;
        confirmedMana = 0; currentGold = 0; playerActorId = null;
        activeNpc = null; npcConversation.Reset(mapGeneration); pendingNpcStamps.Clear();
        ClearShop(); ClearStorage(); ClearTradeState();
        pendingShopDetails = null; pendingPurchase = null;
        pendingSellQuote = null; pendingSale = null;
        pendingRepairQuote = null; pendingRepair = null; pendingStorageAction = null;
        inventory.Clear(); equipment.Clear(); entities.Clear(); entityNames.Clear(); entityNameColors.Clear();
        skills.Clear(); meleeSkills = new();
    }

    private Task ReadGame(CancellationTokenSource lifetime)
    {
        GameEpoch epoch;
        lock (worldStateLock)
        {
            if (activeGameEpoch?.Reader is not null) throw new InvalidOperationException("Game connection already has a reader");
            epoch = new(game, character, ++sessionGeneration, CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token));
            activeGameEpoch = epoch;
        }
        epoch.Reader = ReadGameEpoch(epoch, lifetime);
        return epoch.Reader;
    }

    private bool IsCurrentGameEpoch(GameEpoch epoch)
        => ReferenceEquals(activeGameEpoch, epoch) && !epoch.Retiring;

    private async Task SendFromGame(GameEpoch epoch, object message, CancellationToken cancellation)
    {
        await outgoing.WaitAsync(cancellation);
        try
        {
            lock (worldStateLock) if (!IsCurrentGameEpoch(epoch)) return;
            await SendLocked(message, cancellation);
        }
        finally { outgoing.Release(); }
    }

    private async Task SendGameProtocol(GameEpoch epoch, ushort id, CancellationToken cancellation,
        int recog = 0, ushort tag = 0)
    {
        await epoch.NativeWrites.WaitAsync(cancellation);
        try
        {
            lock (worldStateLock) if (!IsCurrentGameEpoch(epoch)) return;
            await epoch.Connection.Send(id, cancellation, recog: recog, tag: tag);
        }
        finally { epoch.NativeWrites.Release(); }
    }

    private static async Task JoinRetiredReader(GameEpoch epoch, CancellationToken cancellation)
    {
        if (epoch.Reader is null) return;
        try { await epoch.Reader.WaitAsync(cancellation); }
        catch (Exception error) when (error is IOException or ObjectDisposedException or InvalidOperationException) { }
        catch (OperationCanceledException) when (epoch.Reader.IsCompleted) { }
    }

    private void TrackGameTimer(Task timer)
    {
        lock (worldStateLock)
        {
            activeGameEpoch?.Timers.RemoveAll(task => task.IsCompleted);
            activeGameEpoch?.Timers.Add(timer);
        }
    }

    private static async Task FinishGameEpoch(GameEpoch? epoch)
    {
        if (epoch is null) return;
        await epoch.Cancellation.CancelAsync();
        await epoch.TimerCancellation.CancelAsync();
        try { await Task.WhenAll(epoch.Timers); } catch (OperationCanceledException) { }
    }

    private async Task SendLocked(object message, CancellationToken cancellation)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new { sequence = ++sequence, mapGeneration, sessionGeneration, message });
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        await socket.SendAsync(bytes, WebSocketMessageType.Text, true, timeout.Token);
    }
}
