using System.Net.WebSockets;
using System.Text.Json;

namespace Mir2.WebGateway;

public sealed partial class GatewaySession(WebSocket socket) : IDisposable
{
    private LegacyConnection login = new(), selection = new(), game = new();
    private readonly SemaphoreSlim outgoing = new(1, 1);
    private readonly string host = Environment.GetEnvironmentVariable("MIR2_ENGINE_HOST") ?? "engine";
    private readonly int loginPort = int.Parse(Environment.GetEnvironmentVariable("MIR2_LOGIN_GATE_PORT") ?? "7000");
    private readonly int selectionPort = int.Parse(Environment.GetEnvironmentVariable("MIR2_SELECTION_GATE_PORT") ?? "7100");
    private readonly int gamePort = int.Parse(Environment.GetEnvironmentVariable("MIR2_GAME_GATE_PORT") ?? "7200");
    private volatile string phase = "login";
    private string account = "", ticket = "", character = "";
    private HashSet<string> characters = [];
    private long sequence;
    private int mapGeneration;
    private Task? gameReader;
    private readonly PasswordChange passwordChange = new();
    private readonly List<Task> passwordChangeTasks = [];
    private readonly object worldStateLock = new();
    private readonly Dictionary<int, InventoryItem> inventory = [];
    private readonly Dictionary<int, InventoryItem> equipment = [];
    private readonly Dictionary<int, (ushort x, ushort y, bool dead, uint? feature)> entities = [];
    private readonly Dictionary<int, string> entityNames = [];
    private readonly Dictionary<int, byte> entityNameColors = [];
    private (ushort x, ushort y)? confirmedPosition;
    private (ushort x, ushort y)? pendingPosition;
    private int pendingDisplacement;
    private bool pendingAttack;
    private MeleeAttackRequest? pendingMelee;
    private MiningRequest? pendingMining;
    private MeleeSkills meleeSkills = new();
    private int confirmedMana;
    private long? pendingActionId;
    private string? pendingActionKind;
    private ItemAction? pendingItemAction;
    private int? activeNpc;
    private readonly NpcConversation npcConversation = new();
    private readonly Dictionary<string, NpcConversationStamp> pendingNpcStamps = [];
    private MagicKeyChange? pendingMagicKey;
    private long? pendingBindingId;
    private int? activeShopNpc;
    private readonly Dictionary<string, ShopGoods> shopGoods = new(StringComparer.Ordinal);
    private readonly Dictionary<int, ShopDetail> shopDetails = [];
    private (string name, int page)? pendingShopDetails;
    private (string name, int makeIndex)? pendingPurchase;
    private int? activeSellNpc;
    private InventoryItem? pendingSellQuote;
    private (InventoryItem item, int price)? sellQuote;
    private InventoryItem? pendingSale;
    private int? activeRepairNpc;
    private InventoryItem? pendingRepairQuote;
    private (InventoryItem item, int price)? repairQuote;
    private InventoryItem? pendingRepair;
    private int? activeStorageNpc;
    private readonly Dictionary<int, InventoryItem> storage = [];
    private (string kind, InventoryItem item)? pendingStorageAction;
    private readonly Dictionary<ushort, MagicSkill> skills = [];
    private int? playerActorId;
    private (ushort magicId, string name)? pendingSpell;
    private bool tradeOpen;
    private string tradeTarget = "";
    private readonly Dictionary<int, InventoryItem> tradeItems = [];
    private readonly Dictionary<int, InventoryItem> remoteTradeItems = [];
    private int tradeGold;
    private int remoteTradeGold;
    private int currentGold;
    private int? pendingTradeAdd;
    private int? pendingTradeRemove;
    private int? pendingTradeGold;
    private bool tradeAccepted;
    private sealed record ItemAction(string Kind, int MakeIndex, int Slot, InventoryItem Item);

    public async Task Run(CancellationToken requestCancellation)
    {
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(requestCancellation);
        var cancellation = lifetime.Token;
        try
        {
            await Send(new { type = "connected", protocol = 1, features = new { pointSpells = true, directionalRush = true, mapEvents = true, forcedMovement = true, magicKeyBinding = true, npcSessions = true, mining = true, passwordChange = true, logout = true, characterDeletion = true, entryScenes = true } }, cancellation);
            while (socket.State == WebSocketState.Open)
            {
                using var command = await ReadCommand(cancellation);
                if (command is null) break;
                try
                {
                    var root = command.RootElement;
                    string type = root.GetProperty("type").GetString() ?? "";
                    if (Environment.GetEnvironmentVariable("MIR2_PROTOCOL_TRACE") == "1")
                        Console.Error.WriteLine($"[protocol] command={(type.Length <= 32 && type.All(char.IsAsciiLetter) ? type : "invalid")} phase={phase}");
                    if (type == "logout") await StartLogout(root, cancellation);
                else if (logoutPending) throw new InvalidOperationException("Character logout is still pending");
                else if (type == "changePassword") await StartPasswordChange(root, cancellation);
                else if (type is "register" or "login" && passwordChange.IsPending)
                    throw new InvalidOperationException("Password change request is still pending");
                else if (type == "register" && phase == "login") await Register(root, cancellation);
                else if (type == "login" && phase == "login") await Login(root, cancellation);
                else if (type == "selectServer" && phase == "servers") await SelectLoginServer(root, cancellation);
                else if (type == "acknowledgeEntryNotice" && phase == "entryNotice") await AcknowledgeEntryNotice(root, cancellation);
                else if (type == "deleteCharacter" && phase == "characters") await DeleteCharacter(root, cancellation);
                else if (type == "createCharacter" && phase == "characters") await CreateCharacter(root, cancellation);
                else if (type == "selectCharacter" && phase == "characters")
                {
                    await SelectCharacter(root.GetProperty("name").GetString() ?? "", cancellation);
                    gameReader = ReadGame(lifetime);
                }
                else if (type == "say" && phase == "world")
                {
                    await Say(root, cancellation);
                }
                else if (type == "groupMode" && phase == "world")
                {
                    bool enabled = root.GetProperty("enabled").GetBoolean();
                    await game.Send(1019, cancellation, param: enabled ? (ushort)1 : (ushort)0);
                }
                else if (type == "attackMode" && phase == "world")
                {
                    int mode = root.GetProperty("mode").GetInt32();
                    if (mode < 0 || mode > 6) throw new InvalidDataException("Invalid attack mode");
                    await game.Send(1046, cancellation, param: (ushort)mode);
                }
                else if (type is "guildOpen" or "guildHome" or "guildMembers" && phase == "world")
                {
                    ushort commandId = type switch
                    {
                        "guildOpen" => 1035,
                        "guildHome" => 1036,
                        _ => 1037
                    };
                    await game.Send(commandId, cancellation);
                }
                else if (type is "guildAdd" or "guildRemove" && phase == "world")
                {
                    string target = Field(root, "target", 10);
                    await game.Send(type == "guildAdd" ? (ushort)1038 : (ushort)1039, cancellation, target);
                }
                else if (type == "guildNotice" && phase == "world") await UpdateGuildNotice(root, cancellation);
                else if (type == "guildRanks" && phase == "world") await UpdateGuildRanks(root, cancellation);
                else if (type == "guildAlly" && phase == "world") await game.Send(1044, cancellation);
                else if (type == "guildBreakAlly" && phase == "world")
                {
                    string target = Field(root, "target", 10);
                    await game.Send(1045, cancellation, target);
                }
                else if (type == "guildCreate" && phase == "world") await CreateGuild(root, cancellation);
                else if (type == "guildWarRequest" && phase == "world") await RequestGuildWar(root, cancellation);
                else if (type == "castleWarDialogue" && phase == "world") await OpenCastleWarDialogue(root, cancellation);
                else if (type is "groupCreate" or "groupAdd" or "groupRemove" && phase == "world")
                {
                    string target = Field(root, "target", 10);
                    ushort commandId = type switch
                    {
                        "groupCreate" => 1020,
                        "groupAdd" => 1021,
                        _ => 1022
                    };
                    await game.Send(commandId, cancellation, target);
                }
                else if (type == "tradeRequest" && phase == "world")
                {
                    string target = Field(root, "target", 10);
                    await game.Send(1025, cancellation, target);
                }
                else if (type == "tradeAdd" && phase == "world")
                {
                    int makeIndex = root.GetProperty("makeIndex").GetInt32();
                    InventoryItem item;
                    lock (worldStateLock)
                    {
                        if (!tradeOpen) throw new InvalidOperationException("Trade is not open");
                        if (tradeAccepted) throw new InvalidOperationException("Trade is confirmed; cancel the trade before changing the offer");
                        if (pendingTradeAdd is not null || pendingTradeRemove is not null) throw new InvalidOperationException("Trade item operation pending");
                        if (!inventory.TryGetValue(makeIndex, out item!)) throw new InvalidOperationException("Item is no longer in the inventory");
                        if (tradeItems.ContainsKey(makeIndex)) throw new InvalidOperationException("Item is already in the trade");
                        pendingTradeAdd = makeIndex;
                    }
                    try { await game.Send(1026, cancellation, item.name, recog: makeIndex, series: item.durability); }
                    catch { lock (worldStateLock) pendingTradeAdd = null; throw; }
                }
                else if (type == "tradeRemove" && phase == "world")
                {
                    int makeIndex = root.GetProperty("makeIndex").GetInt32();
                    InventoryItem item;
                    lock (worldStateLock)
                    {
                        if (!tradeOpen) throw new InvalidOperationException("Trade is not open");
                        if (tradeAccepted) throw new InvalidOperationException("Trade is confirmed; cancel the trade before changing the offer");
                        if (pendingTradeAdd is not null || pendingTradeRemove is not null) throw new InvalidOperationException("Trade item operation pending");
                        if (!tradeItems.TryGetValue(makeIndex, out item!)) throw new InvalidOperationException("Item is not in the trade");
                        pendingTradeRemove = makeIndex;
                    }
                    try { await game.Send(1027, cancellation, item.name, recog: makeIndex); }
                    catch { lock (worldStateLock) pendingTradeRemove = null; throw; }
                }
                else if (type == "tradeGold" && phase == "world")
                {
                    int amount = root.GetProperty("amount").GetInt32();
                    if (amount < 0) throw new InvalidOperationException("Invalid trade gold");
                    lock (worldStateLock)
                    {
                        if (!tradeOpen) throw new InvalidOperationException("Trade is not open");
                        if (tradeAccepted) throw new InvalidOperationException("Trade is confirmed; cancel the trade before changing the offer");
                        if (pendingTradeGold is not null) throw new InvalidOperationException("Trade gold operation pending");
                        pendingTradeGold = amount;
                    }
                    try { await game.Send(1029, cancellation, recog: amount); }
                    catch { lock (worldStateLock) pendingTradeGold = null; throw; }
                }
                else if (type == "tradeAccept" && phase == "world")
                {
                    lock (worldStateLock)
                    {
                        if (!tradeOpen) throw new InvalidOperationException("Trade is not open");
                        if (pendingTradeAdd is not null || pendingTradeRemove is not null || pendingTradeGold is not null)
                            throw new InvalidOperationException("Trade offer update is still pending");
                        if (tradeAccepted) throw new InvalidOperationException("Trade is already confirmed");
                        tradeAccepted = true;
                    }
                    try { await game.Send(1030, cancellation); }
                    catch { lock (worldStateLock) tradeAccepted = false; throw; }
                }
                else if (type == "tradeCancel" && phase == "world")
                {
                    lock (worldStateLock) if (!tradeOpen) throw new InvalidOperationException("Trade is not open");
                    await game.Send(1028, cancellation);
                }
                else if (type == "inventory" && phase == "world") await game.Send(81, cancellation);
                else if (type == "equipItem" && phase == "world") await EquipItem(root, cancellation);
                else if (type == "takeOffItem" && phase == "world") await TakeOffItem(root, cancellation);
                else if (type == "useItem" && phase == "world") await UseItem(root, cancellation);
                else if (type == "dropGold" && phase == "world")
                {
                    int amount = root.GetProperty("amount").GetInt32();
                    if (amount <= 0 || amount > ushort.MaxValue)
                        throw new InvalidOperationException("Gold amount is outside the legacy packet range");
                    await game.Send(1016, cancellation, param: (ushort)amount);
                }
                else if (type == "dropItem" && phase == "world")
                {
                    int makeIndex = root.GetProperty("makeIndex").GetInt32();
                    string name;
                    lock (worldStateLock)
                    {
                        if (!inventory.TryGetValue(makeIndex, out var item))
                            throw new InvalidOperationException("Item is no longer in the inventory");
                        name = item.name;
                    }
                    await game.Send(1000, cancellation, name, recog: makeIndex);
                }
                else if (type == "pickup" && phase == "world")
                {
                    (ushort x, ushort y) position;
                    lock (worldStateLock)
                        position = confirmedPosition ?? throw new InvalidOperationException("Player position is not ready");
                    await game.Send(1001, cancellation, param: position.x, tag: position.y);
                }
                else if (type == "openDoor" && phase == "world")
                {
                    int x = root.GetProperty("x").GetInt32(), y = root.GetProperty("y").GetInt32();
                    lock (worldStateLock)
                    {
                        var position = confirmedPosition ?? throw new InvalidOperationException("Player position is not ready");
                        if (x < 0 || x > 32767 || y < 0 || y > 32767 || Math.Max(Math.Abs(x - position.x), Math.Abs(y - position.y)) > 1)
                            throw new InvalidOperationException("Door is out of reach");
                    }
                    await game.Send(1002, cancellation, param: (ushort)x, tag: (ushort)y);
                }
                else if (type == "attack" && phase == "world") await Attack(root, cancellation);
                else if (type == "mine" && phase == "world") await Mine(root, cancellation);
                else if (type == "butch" && phase == "world")
                {
                    int targetId = root.GetProperty("targetId").GetInt32();
                    (ushort x, ushort y, bool dead, uint? feature) target;
                    (ushort x, ushort y) position;
                    lock (worldStateLock)
                    {
                        if (!entities.TryGetValue(targetId, out target) || !target.dead)
                            throw new InvalidOperationException("Corpse is unavailable");
                        position = confirmedPosition ?? throw new InvalidOperationException("Player position is not ready");
                    }
                    int dx = Math.Sign(target.x - position.x), dy = Math.Sign(target.y - position.y);
                    if ((dx == 0 && dy == 0) || Math.Max(Math.Abs(target.x - position.x), Math.Abs(target.y - position.y)) > 1)
                        throw new InvalidOperationException("Corpse is out of reach");
                    int direction = Direction(dx, dy);
                    await game.Send(1007, cancellation, recog: targetId, param: target.x, tag: target.y, series: (ushort)direction);
                }
                else if (type == "npc" && phase == "world") await ClickNpc(root, cancellation);
                else if (type == "npcClose" && phase == "world") CloseNpc(root);
                else if (type == "setMagicKey" && phase == "world") await SetMagicKey(root, cancellation);
                else if (type == "dialogueSelect" && phase == "world") await SelectDialogue(root, cancellation);
                else if (type == "shopDetails" && phase == "world") await RequestShopDetails(root, cancellation);
                else if (type == "buyShopItem" && phase == "world") await BuyShopItem(root, cancellation);
                else if (type == "querySellItem" && phase == "world") await QuerySellItem(root, cancellation);
                else if (type == "sellShopItem" && phase == "world") await SellShopItem(root, cancellation);
                else if (type == "queryRepairItem" && phase == "world") await QueryRepairItem(root, cancellation);
                else if (type == "repairItem" && phase == "world") await RepairItem(root, cancellation);
                else if (type == "storeItem" && phase == "world") await StoreItem(root, cancellation);
                else if (type == "takeStorageItem" && phase == "world") await TakeStorageItem(root, cancellation);
                else if (type == "castMagic" && phase == "world") await CastMagic(root, cancellation);
                else if (type == "move" && phase == "world")
                {
                    int x = root.GetProperty("x").GetInt32(), y = root.GetProperty("y").GetInt32();
                    int direction = root.GetProperty("direction").GetInt32();
                    bool running = root.TryGetProperty("run", out var runValue) && runValue.ValueKind == JsonValueKind.True;
                    long actionId = ReadActionId(root);
                    int commandMapGeneration = root.TryGetProperty("mapGeneration", out var generationValue) ? generationValue.GetInt32() : mapGeneration;
                    if (x < 0 || x > 32767 || y < 0 || y > 32767 || direction < 0 || direction > 7)
                        throw new InvalidDataException("Invalid movement coordinates");
                    lock (worldStateLock)
                    {
                        if (pendingAttack || pendingPosition is not null || pendingSpell is not null)
                            throw new InvalidOperationException("Action confirmation pending");
                        if (commandMapGeneration != mapGeneration) throw new InvalidOperationException("Movement belongs to an inactive map");
                        var current = confirmedPosition ?? throw new InvalidOperationException("Player position is not ready");
                        var offset = DirectionOffset(direction);
                        int distance = running ? 2 : 1;
                        if (x != current.x + offset.x * distance || y != current.y + offset.y * distance)
                            throw new InvalidOperationException("Movement target does not match confirmed position");
                        pendingPosition = ((ushort)x, (ushort)y);
                        SetPendingAction(actionId, "move");
                    }
                    try { await game.Send(running ? (ushort)3013 : (ushort)3011, cancellation, recog: x | y << 16, tag: (ushort)direction); }
                    catch { lock (worldStateLock) { pendingPosition = null; ClearPendingAction(); } throw; }
                }
                    else throw new InvalidOperationException("Command unavailable in current session phase");
                }
                catch (Exception error) when (error is InvalidOperationException or InvalidDataException or JsonException or ArgumentException or OverflowException)
                {
                    Console.Error.WriteLine($"Gateway command rejected: {error.Message}");
                    await Send(new
                    {
                        type = "error",
                        code = "command_rejected",
                        message = error is InvalidOperationException ? error.Message : "Invalid command",
                        actionId = TryActionId(command.RootElement),
                        kind = TryActionKind(command.RootElement),
                        commandType = command.RootElement.TryGetProperty("type", out var commandType) && commandType.ValueKind == JsonValueKind.String ? commandType.GetString() : null,
                        npcSessionId = OptionalLong(command.RootElement, "npcSessionId"),
                        mapGeneration = OptionalLong(command.RootElement, "mapGeneration"),
                        npcId = OptionalLong(command.RootElement, "npcId") ?? OptionalLong(command.RootElement, "targetId"),
                        bindingId = OptionalLong(command.RootElement, "bindingId"),
                        logoutId = LogoutIdentity(command.RootElement),
                        mode = LogoutMode(command.RootElement),
                        chatId = ChatIdentity(command.RootElement),
                        requestId = DeleteIdentity(command.RootElement)
                    }, cancellation);
                }
            }
        }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            if (!cancellation.IsCancellationRequested) Console.Error.WriteLine($"Gateway session failed: {error}");
            if (!cancellation.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                try { await Send(new { type = "error", code = "session_failed", message = error is InvalidOperationException ? error.Message : "Connection or protocol failure" }, timeout.Token); }
                catch (Exception) { /* Peer may already be gone. */ }
            }
        }
        finally
        {
            await lifetime.CancelAsync();
            if (passwordChangeTasks.Count > 0) try { await Task.WhenAll(passwordChangeTasks); } catch (Exception) { }
            if (logoutTask is not null) try { await logoutTask; } catch (Exception) { }
            if (gameReader is not null) try { await gameReader; } catch (Exception) { }
            await FinishGameEpoch(activeGameEpoch);
            activeGameEpoch?.TimerCancellation.Dispose();
            activeGameEpoch?.Cancellation.Dispose();
            activeGameEpoch?.NativeWrites.Dispose();
            if (socket.State == WebSocketState.Open || socket.State == WebSocketState.CloseReceived)
            {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                try { await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "Session ended", timeout.Token); } catch (Exception) { }
            }
        }
    }

    private async Task StartPasswordChange(JsonElement command, CancellationToken cancellation)
    {
        var rejected = passwordChange.Begin(command, phase == "login", out var operation);
        if (rejected is not null) await Send(rejected.Message(), cancellation);
        else
        {
            passwordChangeTasks.RemoveAll(task => task.IsCompleted);
            passwordChangeTasks.Add(CompletePasswordChange(operation!, cancellation));
        }
    }

    private async Task CompletePasswordChange(PasswordChangeOperation operation, CancellationToken cancellation)
    {
        try
        {
            var result = await passwordChange.Execute(operation, host, loginPort, cancellation);
            if (!cancellation.IsCancellationRequested && socket.State == WebSocketState.Open)
                await Send(result.Message(), cancellation);
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (Exception error) when (error is not OutOfMemoryException)
        {
            // Never log the command, encoded credential payload or exception.
            // A closed Web peer cannot receive the outcome; it is not a rollback.
            Console.Error.WriteLine("Password change result could not be delivered");
        }
    }

    private async Task Login(JsonElement command, CancellationToken cancellation)
    {
        InitializeEntryScenes(command);
        account = Field(command, "account", 10);
        string password = Field(command, "password", 10);
        // A new authentication attempt retires cached logout outcomes, including
        // the selection phase before a replacement game reader has started.
        // Keep the logout ID high-water mark to reject request identity reuse.
        lock (worldStateLock) sessionGeneration++;
        login.Dispose(); login = new();
        await login.Connect(host, loginPort, cancellation);
        await login.Send(2001, cancellation, $"{account}/{password}", recog: 20030422);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        var response = await login.Receive(timeout.Token);
        if (response.Id == 503 && response.Recog == -3)
        {
            await Task.Delay(TimeSpan.FromSeconds(5.2), cancellation);
            await login.Send(2001, cancellation, $"{account}/{password}", recog: 20030422);
            response = await login.Receive(timeout.Token);
        }
        if (response.Id != 529) throw new InvalidOperationException($"Login rejected ({response.Id}/{response.Recog})");
        if (interactiveLogin) await PresentLoginServers(response, cancellation);
        else await CompleteServerLogin(configuredServerName, cancellation);
    }

    private object CharacterList(LegacyPacket result)
        => new { type = "characters", characters = CharacterOptions(result) };

    private async Task Register(JsonElement command, CancellationToken cancellation)
    {
        string requestedAccount = AccountField(command, "account"), password = Field(command, "password", 10);
        using var registration = new LegacyConnection();
        await registration.Connect(host, loginPort, cancellation);
        await Task.Delay(TimeSpan.FromSeconds(1.1), cancellation);
        byte[] body = AccountRegistration.EncodeBody(requestedAccount, password);
        await registration.SendPayload([..LegacyCodec.Header(2002), ..body], cancellation);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        var result = await registration.Receive(timeout.Token);
        if (result.Id is not 504 and not 505) throw new InvalidDataException("Unexpected registration response");
        await Send(new { type = "registrationResult", accepted = result.Id == 504, reason = result.Id == 504 ? 0 : result.Recog }, cancellation);
    }

    private async Task CreateCharacter(JsonElement command, CancellationToken cancellation)
    {
        string name = Field(command, "name", 10);
        if (name.Length < 3) throw new InvalidOperationException("Character name must contain at least three characters");
        int job = command.GetProperty("job").GetInt32(), sex = command.GetProperty("sex").GetInt32(), hair = command.GetProperty("hair").GetInt32();
        if (job is < 0 or > 2 || sex is < 0 or > 1 || hair is < 0 or > 3)
            throw new InvalidOperationException("Invalid character appearance");
        // SelGate rejects CM_NEWCHR when it arrives within one second of CM_QUERYCHR.
        // The browser receives the character list immediately, so honor that legacy
        // throttle here instead of leaving the UI waiting for a response forever.
        await Task.Delay(TimeSpan.FromMilliseconds(1100), cancellation);
        await selection.Send(101, cancellation, $"{account}/{name}/{hair}/{job}/{sex}/");
        var result = await selection.Receive(cancellation);
        if (result.Id is not 521 and not 522) throw new InvalidDataException("Unexpected character creation response");
        await Send(new { type = "characterCreationResult", accepted = result.Id == 521, reason = result.Id == 521 ? 0 : result.Recog, name }, cancellation);
        if (result.Id == 521)
        {
            object? refreshed = null;
            for (int attempt = 0; attempt < 5; attempt++)
            {
                if (attempt > 0) await Task.Delay(TimeSpan.FromMilliseconds(150 * attempt), cancellation);
                await selection.Send(100, cancellation, $"{account}/{ticket}");
                refreshed = CharacterList(await selection.Expect(520, cancellation));
                if (characters.Contains(name)) break;
            }
            await Send(refreshed!, cancellation);
        }
    }

    private async Task SelectCharacter(string name, CancellationToken cancellation)
    {
        if (!characters.Contains(name)) throw new InvalidOperationException("Character unavailable");
        character = name;
        lock (worldStateLock) pendingEntryNotice = null;
        await selection.Send(103, cancellation, $"{account}/{name}");
        await selection.Expect(525, cancellation); // Internal routes stay in server configuration.
        game.Dispose(); game = new();
        await game.Connect(host, gamePort, cancellation);
        string handshake = $"**{account}/{name}/{ticket}/20030422/{uint.Parse(ticket) ^ 0xf2e44fff}/000000000000000000000000000000/0";
        await game.SendPayload(LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes(handshake)), cancellation);
        phase = "entering";
    }

    private async Task ReadGameEpoch(GameEpoch epoch, CancellationTokenSource lifetime)
    {
        var game = epoch.Connection;
        var character = epoch.CharacterName;
        var cancellation = epoch.Cancellation.Token;
        try
        {
            while (!cancellation.IsCancellationRequested && !epoch.Retiring)
            {
                var packet = await game.Receive(cancellation);
                lock (worldStateLock) if (!IsCurrentGameEpoch(epoch)) break;
                object? miningInterruption = null;
                object? meleeInterruption = null;
                if (packet.Id is 51 or 633 or 634 || packet.Id is 32 or 34 && packet.Recog == playerActorId)
                    lock (worldStateLock)
                    {
                        miningInterruption = InterruptMining(packet.Id);
                        meleeInterruption = InterruptMelee(packet.Id);
                    }
                if (miningInterruption is not null) await SendFromGame(epoch, miningInterruption, cancellation);
                if (meleeInterruption is not null) await SendFromGame(epoch, meleeInterruption, cancellation);
                if (Environment.GetEnvironmentVariable("MIR2_PROTOCOL_TRACE") == "1")
                    Console.Error.WriteLine($"[protocol] web game packet id={packet.Id} recog={packet.Recog} param={packet.Param} tag={packet.Tag} series={packet.Series} body={packet.EncodedBody.Length}");
                if (packet.Id == 658)
                {
                    if (interactiveLogin) await PresentEntryNotice(epoch, packet, cancellation);
                    else await SendGameProtocol(epoch, 1018, cancellation);
                    continue;
                }
                lock (worldStateLock)
                    if (pendingEntryNotice is not null && packet.Id is 50 or 51 or 634)
                        throw new InvalidDataException("World arrived before entry notice acknowledgement");
                if (packet.Id == 51)
                {
                    lock (worldStateLock)
                    {
                        confirmedPosition = null;
                        pendingPosition = null;
                        pendingAttack = false;
                        ClearWorldAction();
                        pendingItemAction = null;
                        pendingSpell = null;
                        playerActorId = null;
                        activeNpc = null;
                        ClearShop();
                        ClearStorage();
                        inventory.Clear();
                        equipment.Clear();
                        entities.Clear();
                        entityNames.Clear();
                        entityNameColors.Clear();
                        ClearTradeState();
                    }
                    lock (worldStateLock) { mapGeneration++; npcConversation.Reset(mapGeneration); }
                    await SendFromGame(epoch, new { type = "map", map = packet.Text, darkLevel = packet.Series }, cancellation);
                }
                if (packet.Id == 633)
                {
                    lock (worldStateLock)
                    {
                        pendingPosition = null;
                        pendingAttack = false;
                        ClearWorldAction();
                        pendingSpell = null;
                        activeNpc = null;
                        npcConversation.Invalidate();
                        ClearShop();
                        ClearStorage();
                        entities.Clear();
                        entityNames.Clear();
                        entityNameColors.Clear();
                        ClearTradeState();
                    }
                }
                if (packet.Id == 634)
                {
                    lock (worldStateLock)
                    {
                        confirmedPosition = (packet.Param, packet.Tag);
                        pendingPosition = null;
                        pendingAttack = false;
                        ClearWorldAction();
                        pendingItemAction = null;
                        pendingSpell = null;
                        playerActorId = packet.Recog;
                        activeNpc = null;
                        ClearShop();
                        ClearStorage();
                        entities.Clear();
                        entityNames.Clear();
                        entityNameColors.Clear();
                        ClearTradeState();
                    }
                    phase = "world";
                    lock (worldStateLock) { mapGeneration++; npcConversation.Reset(mapGeneration); }
                    await SendFromGame(epoch, new { type = "map", map = packet.Text, darkLevel = packet.Series }, cancellation);
                }
                if (packet.Id == 50)
                {
                    lock (worldStateLock) { confirmedPosition = (packet.Param, packet.Tag); playerActorId = packet.Recog; }
                    phase = "world";
                }
                object? commandResult = null;
                object? actionResult = null;
                object? miningStrike = null;
                MiningRequest? miningSwing = null;
                object? warriorSkill = null;
                if (packet.Id is 6 or 9 && packet.Recog == playerActorId)
                    lock (worldStateLock)
                    {
                        confirmedPosition = (packet.Param, packet.Tag);
                        // Keep the command slot until its reply arrives. Otherwise its
                        // delayed +GD could acknowledge a newly issued command.
                        if (pendingPosition is not null)
                        {
                            pendingPosition = confirmedPosition;
                            pendingDisplacement = packet.Id;
                        }
                    }
                if (packet.Id == -1 && packet.Status is string status)
                    lock (worldStateLock)
                    {
                        if (status == "=DIG" && pendingMining is { Turning: false, Interrupted: false } fragment && playerActorId is int actor)
                        {
                            miningStrike = new { type = "miningStrike", id = actor, actionId = fragment.ActionId,
                                x = fragment.X, y = fragment.Y, direction = fragment.Direction, mapGeneration = fragment.MapGeneration };
                        }
                        else if (status.StartsWith("+GD/", StringComparison.Ordinal))
                        {
                            if (pendingAttack && pendingMining is { } mining)
                            {
                                if (mining.TimedOut) { /* Preserve this connection's uncertain native slot until close. */ }
                                else if (mining.Turning && MiningCommand.CanSwing(mining, mapGeneration, confirmedPosition,
                                    equipment.GetValueOrDefault(1)))
                                {
                                    // Consume TURN's ACK without freeing the shared native GOOD/FAIL slot.
                                    mining.Turning = false;
                                    miningSwing = mining;
                                }
                                else
                                {
                                    bool accepted = !mining.Turning && !mining.Interrupted;
                                    pendingAttack = false;
                                    var finished = CompletePendingAction(accepted, reason: accepted ? 0 : 28);
                                    if (!mining.RejectionPublished) actionResult = finished;
                                }
                            }
                            else if (pendingAttack)
                            {
                                pendingAttack = false;
                                bool alreadyRejected = pendingMelee?.RejectionPublished == true;
                                var finished = CompletePendingAction(pendingMelee?.Interrupted != true);
                                if (!alreadyRejected) actionResult = finished;
                                warriorSkill = meleeSkills.Snapshot();
                            }
                            else if (pendingPosition is { } next) { confirmedPosition = next; pendingPosition = null; actionResult = CompletePendingAction(pendingDisplacement == 0, next.x, next.y, pendingDisplacement); }
                            else if (pendingSpell is { } spell) { pendingSpell = null; commandResult = new { type = "spellResult", magicId = spell.magicId, name = spell.name, accepted = true }; actionResult = CompletePendingAction(true); }
                        }
                        else if (meleeSkills.Apply(status))
                        {
                            warriorSkill = meleeSkills.Snapshot();
                            // CM_SPELL sends its status before a separate +GD.
                            // Keep the native slot until that ACK, so it cannot
                            // complete an attack submitted after the status.
                        }
                    }
                else if (packet.Id == 28) lock (worldStateLock)
                {
                    if (pendingMining is { TimedOut: true }) { /* Timeout owns the closing connection. */ }
                    else if (pendingAttack) { pendingAttack = false; bool alreadyRejected = pendingMining?.RejectionPublished == true || pendingMelee?.RejectionPublished == true;
                        var finished = CompletePendingAction(false, packet.Param, packet.Tag, packet.Id);
                        if (!alreadyRejected) actionResult = finished;
                        warriorSkill = meleeSkills.Snapshot(); }
                    else if (pendingPosition is not null)
                    {
                        pendingPosition = null;
                        confirmedPosition = (packet.Param, packet.Tag);
                        actionResult = CompletePendingAction(false, packet.Param, packet.Tag, pendingDisplacement != 0 ? pendingDisplacement : packet.Id);
                    }
                    else if (pendingSpell is { } spell) { pendingSpell = null; commandResult = new { type = "spellResult", magicId = spell.magicId, name = spell.name, accepted = false }; actionResult = CompletePendingAction(false, packet.Param, packet.Tag, packet.Id); }
                }
                if (packet.Recog == playerActorId && packet.Id is 6 or 9 or 32 or 34)
                    lock (worldStateLock)
                        if (pendingMining is { } mining) mining.Interrupted = true;
                if (miningSwing is { } swing)
                {
                    await SendGameProtocol(epoch, MiningCommand.SwingMessage, cancellation, recog: swing.PackedPosition, tag: swing.Direction);
                    await SendFromGame(epoch, new { type = "miningProgress", phase = "swing", id = playerActorId,
                        actionId = swing.ActionId, x = swing.X, y = swing.Y, direction = swing.Direction,
                        mapGeneration = swing.MapGeneration }, cancellation);
                }
                lock (worldStateLock)
                {
                    if (packet.Id == 52 && packet.Body.Length == 40) confirmedMana = System.Buffers.Binary.BinaryPrimitives.ReadUInt16LittleEndian(packet.Body.AsSpan(14));
                    else if (packet.Id == 53 && packet.Recog == playerActorId) confirmedMana = packet.Tag;
                }
                UpdateEntities(packet);
                string? knownName = null;
                byte? knownNameColor = null;
                lock (worldStateLock)
                {
                    entityNames.TryGetValue(packet.Recog, out knownName);
                    if (entityNameColors.TryGetValue(packet.Recog, out byte color)) knownNameColor = color;
                }
                UpdateInventory(packet);
                UpdateSkills(packet);
                object? magicKeyResult = null;
                var itemAction = UpdateItemState(packet);
                object? tradeResult, shopResult, storageResult;
                long? attackActionId = null;
                lock (worldStateLock)
                    if (pendingMelee is { } melee && melee.Matches(packet, playerActorId, mapGeneration)) attackActionId = melee.ActionId;
                var projection = WorldProjection.Project(packet, character, playerActorId, knownName, knownNameColor, attackActionId)
                    ?? InventoryProjection.Project(packet) ?? CharacterProjection.Project(packet) ?? MagicProjection.Project(packet);
                lock (worldStateLock)
                {
                    if (packet.Id == 211 && pendingMagicKey is { } binding && MagicKeyBinding.SnapshotConfirms(binding, skills.Values))
                    {
                        pendingMagicKey = null;
                        magicKeyResult = new { type = "magicKeyResult", magicId = binding.MagicId, key = binding.Key, bindingId = pendingBindingId, accepted = true };
                        pendingBindingId = null;
                    }
                    if (packet.Id is 51 or 633 or 634 || packet.Id == 212 && pendingMagicKey?.MagicId == packet.Recog
                        || packet.Id is 32 or 34 && packet.Recog == playerActorId)
                        magicKeyResult ??= RejectPendingMagicKey("技能设置已中断，请重试");
                    if (packet.Id is 32 or 34 && packet.Recog == playerActorId)
                    {
                        npcConversation.Invalidate(); activeNpc = null; ClearShop(); ClearStorage();
                    }
                    var npcProjection = NpcProjection.Project(packet);
                    if (packet.Id == 643 && npcConversation.ObserveDialogue(packet.Recog))
                    {
                        activeNpc = packet.Recog; ClearShop(); ClearStorage();
                        projection ??= npcConversation.Stamp(npcProjection!);
                    }
                    else projection ??= npcProjection; // Quest markers remain authoritative; unstamped stale UI is rejected by the browser.
                    tradeResult = UpdateTradeState(packet);
                    shopResult = UpdateShopState(packet);
                    storageResult = UpdateStorageState(packet);
                }
                if (projection is not null) await SendFromGame(epoch, projection, cancellation);
                if (packet.Id == 50)
                {
                    await SendFromGame(epoch, EquipmentSnapshot(), cancellation);
                    await SendFromGame(epoch, SkillSnapshot(), cancellation);
                }
                if (magicKeyResult is not null) await SendFromGame(epoch, magicKeyResult, cancellation);
                if (itemAction is not null) await SendFromGame(epoch, itemAction, cancellation);
                if (shopResult is not null) await SendFromGame(epoch, shopResult, cancellation);
                if (tradeResult is not null) await SendFromGame(epoch, tradeResult, cancellation);
                if (storageResult is not null) await SendFromGame(epoch, storageResult, cancellation);
                if (actionResult is not null) await SendFromGame(epoch, actionResult, cancellation);
                if (miningStrike is not null) await SendFromGame(epoch, miningStrike, cancellation);
                if (commandResult is not null) await SendFromGame(epoch, commandResult, cancellation);
                if (warriorSkill is not null) await SendFromGame(epoch, warriorSkill, cancellation);
                // Preserve per-record encoding until each legacy message has a typed projection.
                await SendFromGame(epoch, new { type = "legacy", id = packet.Id, recog = packet.Recog, param = packet.Param,
                    tag = packet.Tag, series = packet.Series, encodedBody = Convert.ToBase64String(packet.EncodedBody), status = packet.Status }, cancellation);
            }
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            bool miningTimedOut;
            lock (worldStateLock) miningTimedOut = pendingMining?.TimedOut == true;
            if ((epoch.Retiring || miningTimedOut) && error is IOException or ObjectDisposedException) return;
            Console.Error.WriteLine($"Legacy game reader failed: {error}");
            throw;
        }
        finally
        {
            bool closeSession;
            lock (worldStateLock) closeSession = IsCurrentGameEpoch(epoch);
            if (closeSession) await lifetime.CancelAsync();
        }
    }

    private void UpdateEntities(LegacyPacket packet)
    {
        lock (worldStateLock)
        {
            if (packet.Id is 6 or 9 or 10 or 11 or 13 or 50 or 801 or 807)
            {
                entities[packet.Recog] = (packet.Param, packet.Tag, false, WorldProjection.Feature(packet));
                if (WorldProjection.Name(packet, character, playerActorId) is { } name) entityNames[packet.Recog] = name;
                if (WorldProjection.NameColor(packet) is { } color) entityNameColors[packet.Recog] = color;
            }
            else if (packet.Id is 32 or 34)
            {
                uint? feature = entities.TryGetValue(packet.Recog, out var prior) ? prior.feature : null;
                entities[packet.Recog] = (packet.Param, packet.Tag, true, feature);
            }
            else if (packet.Id == 27 && entities.TryGetValue(packet.Recog, out var alive))
                entities[packet.Recog] = (packet.Param, packet.Tag, false, alive.feature);
            else if (packet.Id == 41 && entities.TryGetValue(packet.Recog, out var prior))
                entities[packet.Recog] = (prior.x, prior.y, prior.dead, WorldProjection.Feature(packet));
            else if (packet.Id == 42)
            {
                string[] parts = packet.Text.Split('/', 2);
                entityNames[packet.Recog] = WorldProjection.DisplayName(parts[0]);
                if (parts.Length > 1 && byte.TryParse(parts[1], out byte color)) entityNameColors[packet.Recog] = color;
            }
            else if (packet.Id is 29 or 30 or 800 or 806)
            {
                entities.Remove(packet.Recog);
                entityNames.Remove(packet.Recog);
                entityNameColors.Remove(packet.Recog);
            }
        }
    }

    private async Task ClickNpc(JsonElement command, CancellationToken cancellation)
    {
        int targetId = command.GetProperty("targetId").GetInt32();
        lock (worldStateLock)
        {
            if (!entities.TryGetValue(targetId, out var target) || target.dead || (target.feature & 255) != 50)
                throw new InvalidOperationException("NPC is unavailable");
            var position = confirmedPosition ?? throw new InvalidOperationException("Player position is not ready");
            if (Math.Max(Math.Abs(target.x - position.x), Math.Abs(target.y - position.y)) > 1)
                throw new InvalidOperationException("NPC is out of reach");
            long sessionId = command.GetProperty("npcSessionId").GetInt64();
            int generation = command.GetProperty("mapGeneration").GetInt32();
            npcConversation.Begin(targetId, sessionId, generation);
            ClearShop(); ClearStorage();
            activeNpc = targetId;
        }
        await game.Send(1010, cancellation, recog: targetId);
    }

    private async Task SelectDialogue(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32();
        string value = command.GetProperty("command").GetString() ?? "";
        lock (worldStateLock)
            if (activeNpc != npcId) throw new InvalidOperationException("NPC dialogue is no longer active");
        if (value.Length < 2 || value.Length > 80 || value[0] != '@' || value.Any(char.IsControl))
            throw new InvalidOperationException("Invalid NPC dialogue option");
        bool acceptsText = value.StartsWith("@@InPutString", StringComparison.OrdinalIgnoreCase);
        if (acceptsText)
        {
            string input = command.TryGetProperty("input", out var inputValue) ? inputValue.GetString() ?? "" : "";
            if (input.Length > 80 || input.Any(char.IsControl))
                throw new InvalidOperationException("Invalid NPC dialogue input");
            value += '\r' + input;
        }
        else if (command.TryGetProperty("input", out _))
        {
            throw new InvalidOperationException("This NPC dialogue option does not accept input");
        }
        await game.Send(1011, cancellation, value, recog: npcId);
    }

    private async Task CreateGuild(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32();
        string guildName = Field(command, "guildName", 20);
        lock (worldStateLock)
        {
            if (activeNpc != npcId) throw new InvalidOperationException("Guild NPC dialogue is no longer active");
            if (!entities.TryGetValue(npcId, out var npc) || npc.dead || (npc.feature & 255) != 50)
                throw new InvalidOperationException("Guild NPC is unavailable");
            if (!entityNames.TryGetValue(npcId, out var npcName) || !npcName.Contains("国王", StringComparison.Ordinal))
                throw new InvalidOperationException("Guild creation requires a king NPC");
            var position = confirmedPosition ?? throw new InvalidOperationException("Player position is not ready");
            if (Math.Max(Math.Abs(npc.x - position.x), Math.Abs(npc.y - position.y)) > 1)
                throw new InvalidOperationException("Guild NPC is out of reach");
        }
        await game.Send(1011, cancellation, $"@@buildguildnow\r{guildName}", recog: npcId);
    }

    private async Task RequestGuildWar(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = RequireGuildOfficial(command);
        string guildName = Field(command, "guildName", 20);
        if (guildName.Length == 0 || guildName.Any(character => char.IsControl(character) || character is '<' or '>' or '\r' or '\n'))
            throw new InvalidOperationException("Invalid target guild name");
        // The king exposes the war action on a second dialogue page. Enter
        // that page before submitting the protected @@guildwar action so the
        // legacy NPC can validate the current jump label.
        await game.Send(1011, cancellation, "@guildwar", recog: npcId);
        await Task.Delay(100, cancellation);
        await game.Send(1011, cancellation, $"@@guildwar\r{guildName}", recog: npcId);
    }

    private async Task OpenCastleWarDialogue(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = RequireGuildOfficial(command);
        await game.Send(1011, cancellation, "@requestcastlewarA", recog: npcId);
    }

    private int RequireGuildOfficial(JsonElement command)
    {
        int npcId = command.GetProperty("npcId").GetInt32();
        lock (worldStateLock)
        {
            if (activeNpc != npcId) throw new InvalidOperationException("Guild official dialogue is no longer active");
            if (!entities.TryGetValue(npcId, out var npc) || npc.dead || (npc.feature & 255) != 50)
                throw new InvalidOperationException("Guild official is unavailable");
            if (!entityNames.TryGetValue(npcId, out var npcName) || !npcName.Contains("国王", StringComparison.Ordinal))
                throw new InvalidOperationException("Guild war requires a king NPC");
            var position = confirmedPosition ?? throw new InvalidOperationException("Player position is not ready");
            if (Math.Max(Math.Abs(npc.x - position.x), Math.Abs(npc.y - position.y)) > 1)
                throw new InvalidOperationException("Guild official is out of reach");
        }
        return npcId;
    }

    private async Task UpdateGuildNotice(JsonElement command, CancellationToken cancellation)
    {
        string notice = command.TryGetProperty("notice", out var value) ? value.GetString() ?? "" : "";
        if (LegacyCodec.Gbk.GetByteCount(notice) > 1000 || notice.Any(character => char.IsControl(character) && character is not '\r' and not '\n'))
            throw new InvalidOperationException("Invalid guild notice");
        await game.Send(1040, cancellation, notice.Replace('\n', '\r'));
    }

    private async Task UpdateGuildRanks(JsonElement command, CancellationToken cancellation)
    {
        if (!command.TryGetProperty("ranks", out var ranks) || ranks.ValueKind != JsonValueKind.Array || ranks.GetArrayLength() is < 1 or > 20)
            throw new InvalidOperationException("Invalid guild ranks");
        var lines = new List<string>();
        foreach (var rank in ranks.EnumerateArray())
        {
            if (!rank.TryGetProperty("no", out var noValue) || !noValue.TryGetInt32(out int no) || no is < 1 or > 99)
                throw new InvalidOperationException("Invalid guild rank number");
            string name = rank.TryGetProperty("name", out var nameValue) ? nameValue.GetString() ?? "" : "";
            if (name.Length == 0 || name.Length > 30 || LegacyCodec.Gbk.GetByteCount(name) > 30 || name.Any(character => character is '<' or '>' or '\r' or '\n' || char.IsControl(character)))
                throw new InvalidOperationException("Invalid guild rank name");
            lines.Add($"#{no} <{name}>");
            if (rank.TryGetProperty("members", out var members) && members.ValueKind == JsonValueKind.Array)
            {
                foreach (var member in members.EnumerateArray())
                {
                    string memberName = member.GetString() ?? "";
                    if (memberName.Length is < 1 or > 10 || memberName.Any(character => !char.IsLetterOrDigit(character)))
                        throw new InvalidOperationException("Invalid guild member name");
                    lines.Add(memberName);
                }
            }
        }
        string payload = string.Join('\r', lines) + '\r';
        if (LegacyCodec.Gbk.GetByteCount(payload) > 5000) throw new InvalidOperationException("Guild ranks are too large");
        await game.Send(1041, cancellation, payload);
    }

    private async Task RequestShopDetails(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32();
        string name = command.GetProperty("name").GetString() ?? "";
        int page = command.TryGetProperty("page", out var pageValue) ? pageValue.GetInt32() : 0;
        lock (worldStateLock)
        {
            if (activeShopNpc != npcId || !shopGoods.TryGetValue(name, out var goods) || goods.subMenu != 1)
                throw new InvalidOperationException("Shop item is unavailable");
            if (page is < 0 or > ushort.MaxValue) throw new InvalidOperationException("Invalid shop page");
            if (pendingShopDetails is not null) throw new InvalidOperationException("Shop detail request pending");
            pendingShopDetails = (name, page);
            pendingNpcStamps["details"] = npcConversation.Require(command, npcId);
        }
        try { await game.Send(1015, cancellation, name, recog: npcId, param: (ushort)page); }
        catch { lock (worldStateLock) pendingShopDetails = null; throw; }
    }

    private async Task BuyShopItem(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32();
        string name = command.GetProperty("name").GetString() ?? "";
        int makeIndex = command.TryGetProperty("makeIndex", out var indexValue) ? indexValue.GetInt32() : 0;
        lock (worldStateLock)
        {
            if (activeShopNpc != npcId || !shopGoods.TryGetValue(name, out var goods) || goods.stock <= 0)
                throw new InvalidOperationException("Shop item is unavailable");
            if (pendingPurchase is not null) throw new InvalidOperationException("Purchase pending");
            if (goods.subMenu == 0)
            {
                if (makeIndex != 0) throw new InvalidOperationException("Invalid shop item identity");
            }
            else if (!shopDetails.TryGetValue(makeIndex, out var detail) || detail.name != name)
                throw new InvalidOperationException("Shop detail item is unavailable");
            pendingPurchase = (name, makeIndex);
            pendingNpcStamps["purchase"] = npcConversation.Require(command, npcId);
        }
        try
        {
            await game.Send(1014, cancellation, name, recog: npcId, param: (ushort)makeIndex,
                tag: (ushort)((uint)makeIndex >> 16), series: 1);
        }
        catch { lock (worldStateLock) pendingPurchase = null; throw; }
    }

    private async Task QuerySellItem(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32(), makeIndex = command.GetProperty("makeIndex").GetInt32();
        InventoryItem item;
        lock (worldStateLock)
        {
            if (activeSellNpc != npcId) throw new InvalidOperationException("Merchant is not accepting items");
            if (!inventory.TryGetValue(makeIndex, out item!)) throw new InvalidOperationException("Item is no longer in the inventory");
            if (pendingSellQuote is not null || pendingSale is not null) throw new InvalidOperationException("Sale operation pending");
            pendingSellQuote = item;
            pendingNpcStamps["sellQuote"] = npcConversation.Require(command, npcId);
        }
        try
        {
            await game.Send(1012, cancellation, item.name, recog: npcId, param: (ushort)makeIndex,
                tag: (ushort)((uint)makeIndex >> 16));
        }
        catch { lock (worldStateLock) pendingSellQuote = null; throw; }
    }

    private async Task SellShopItem(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32(), makeIndex = command.GetProperty("makeIndex").GetInt32();
        InventoryItem item;
        lock (worldStateLock)
        {
            if (activeSellNpc != npcId || sellQuote is not { } quote || quote.item.makeIndex != makeIndex || quote.price <= 0)
                throw new InvalidOperationException("Sale quote is unavailable");
            if (!inventory.TryGetValue(makeIndex, out item!) || item.name != quote.item.name)
                throw new InvalidOperationException("Item is no longer in the inventory");
            if (pendingSale is not null || pendingSellQuote is not null) throw new InvalidOperationException("Sale operation pending");
            pendingSale = item;
            pendingNpcStamps["sale"] = npcConversation.Require(command, npcId);
        }
        try
        {
            await game.Send(1013, cancellation, item.name, recog: npcId, param: (ushort)makeIndex,
                tag: (ushort)((uint)makeIndex >> 16), series: 1);
        }
        catch { lock (worldStateLock) pendingSale = null; throw; }
    }

    private async Task QueryRepairItem(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32(), makeIndex = command.GetProperty("makeIndex").GetInt32();
        InventoryItem item;
        lock (worldStateLock)
        {
            if (activeRepairNpc != npcId) throw new InvalidOperationException("Merchant is not accepting repairs");
            if (!inventory.TryGetValue(makeIndex, out item!)) throw new InvalidOperationException("Item is no longer in the inventory");
            if (pendingRepairQuote is not null || pendingRepair is not null) throw new InvalidOperationException("Repair operation pending");
            pendingRepairQuote = item;
            pendingNpcStamps["repairQuote"] = npcConversation.Require(command, npcId);
        }
        try
        {
            await game.Send(1024, cancellation, item.name, recog: npcId, param: (ushort)makeIndex,
                tag: (ushort)((uint)makeIndex >> 16));
        }
        catch { lock (worldStateLock) pendingRepairQuote = null; throw; }
    }

    private async Task RepairItem(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32(), makeIndex = command.GetProperty("makeIndex").GetInt32();
        InventoryItem item;
        lock (worldStateLock)
        {
            if (activeRepairNpc != npcId || repairQuote is not { } quote || quote.item.makeIndex != makeIndex || quote.price < 0)
                throw new InvalidOperationException("Repair quote is unavailable");
            if (!inventory.TryGetValue(makeIndex, out item!) || item.name != quote.item.name)
                throw new InvalidOperationException("Item is no longer in the inventory");
            if (pendingRepair is not null || pendingRepairQuote is not null) throw new InvalidOperationException("Repair operation pending");
            pendingRepair = item;
            pendingNpcStamps["repair"] = npcConversation.Require(command, npcId);
        }
        try
        {
            await game.Send(1023, cancellation, item.name, recog: npcId, param: (ushort)makeIndex,
                tag: (ushort)((uint)makeIndex >> 16));
        }
        catch { lock (worldStateLock) pendingRepair = null; throw; }
    }

    private async Task StoreItem(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32(), makeIndex = command.GetProperty("makeIndex").GetInt32();
        InventoryItem item;
        lock (worldStateLock)
        {
            if (activeStorageNpc != npcId) throw new InvalidOperationException("Storage is unavailable");
            if (!inventory.TryGetValue(makeIndex, out item!)) throw new InvalidOperationException("Item is no longer in the inventory");
            if (pendingStorageAction is not null) throw new InvalidOperationException("Storage operation pending");
            pendingStorageAction = ("store", item);
            pendingNpcStamps["storage"] = npcConversation.Require(command, npcId);
        }
        try
        {
            await game.Send(1031, cancellation, item.name, recog: npcId, param: (ushort)makeIndex,
                tag: (ushort)((uint)makeIndex >> 16), series: 1);
        }
        catch { lock (worldStateLock) pendingStorageAction = null; throw; }
    }

    private async Task TakeStorageItem(JsonElement command, CancellationToken cancellation)
    {
        lock (worldStateLock) npcConversation.Require(command);
        int npcId = command.GetProperty("npcId").GetInt32(), makeIndex = command.GetProperty("makeIndex").GetInt32();
        InventoryItem item;
        lock (worldStateLock)
        {
            if (activeStorageNpc != npcId) throw new InvalidOperationException("Storage is unavailable");
            if (!storage.TryGetValue(makeIndex, out item!)) throw new InvalidOperationException("Stored item is unavailable");
            if (pendingStorageAction is not null) throw new InvalidOperationException("Storage operation pending");
            pendingStorageAction = ("take", item);
            pendingNpcStamps["storage"] = npcConversation.Require(command, npcId);
        }
        try
        {
            await game.Send(1032, cancellation, item.name, recog: npcId, param: (ushort)makeIndex,
                tag: (ushort)((uint)makeIndex >> 16), series: 1);
        }
        catch { lock (worldStateLock) pendingStorageAction = null; throw; }
    }

    private object? UpdateStorageState(LegacyPacket packet)
    {
        if (packet.Id == 700)
        {
            if (!npcConversation.Matches(packet.Recog)) return null;
            ClearShop(); ClearStorage(); activeStorageNpc = packet.Recog;
            return npcConversation.Stamp(new { type = "storageDeposit", npcId = packet.Recog, items = inventory.Values.ToArray() });
        }
        if (packet.Id == 704)
        {
            if (!npcConversation.Matches(packet.Recog)) return null;
            var items = StorageProjection.ParseItems(packet);
            if (packet.Tag == 0) { storage.Clear(); ClearShop(); }
            foreach (var item in items) storage[item.makeIndex] = item;
            activeStorageNpc = packet.Recog;
            return npcConversation.Stamp(new { type = "storageItems", npcId = packet.Recog, page = packet.Tag, lastPage = packet.Series, items = storage.Values.ToArray() });
        }
        if (packet.Id is 701 or 702 or 703)
        {
            if (pendingStorageAction is not { kind: "store" } action) return null;
            bool current = PendingNpcIsCurrent("storage"); pendingStorageAction = null;
            bool accepted = packet.Id == 701;
            if (accepted) { inventory.Remove(action.item.makeIndex); if (current) storage[action.item.makeIndex] = action.item; }
            int reason = packet.Id == 702 ? 2 : packet.Id == 703 ? (packet.Recog == 0 ? 1 : packet.Recog) : 0;
            return FinishNpcReply("storage", new { type = "storageResult", kind = action.kind, item = action.item, accepted, reason });
        }
        if (packet.Id is 705 or 706 or 707)
        {
            if (pendingStorageAction is not { kind: "take" } action) return null;
            bool current = PendingNpcIsCurrent("storage"); pendingStorageAction = null;
            bool accepted = packet.Id == 705;
            if (accepted) { inventory[action.item.makeIndex] = action.item; if (current) storage.Remove(action.item.makeIndex); }
            int reason = packet.Id == 707 ? 3 : packet.Id == 706 ? 1 : 0;
            return FinishNpcReply("storage", new { type = "storageResult", kind = action.kind, item = action.item, accepted, reason });
        }
        return null;
    }

    private void ClearStorage()
    {
        activeStorageNpc = null;
        storage.Clear();
    }

    private void UpdateSkills(LegacyPacket packet)
    {
        lock (worldStateLock)
        {
            if (packet.Id == 211)
            {
                skills.Clear();
                foreach (var skill in MagicProjection.ParseList(packet)) skills[skill.magicId] = skill;
            }
            else if (packet.Id == 210)
            {
                var skill = MagicProjection.Parse(packet.Body);
                skills[skill.magicId] = skill;
            }
            else if (packet.Id == 212) skills.Remove(unchecked((ushort)packet.Recog));
            else if (packet.Id == 640 && skills.TryGetValue(unchecked((ushort)packet.Recog), out var skill))
                skills[skill.magicId] = skill with { level = (byte)packet.Param, currentTrain = unchecked((int)((uint)packet.Tag | (uint)packet.Series << 16)) };
        }
    }

    private object SkillSnapshot()
    {
        lock (worldStateLock)
            return new { type = "skills", skills = skills.Values.ToArray() };
    }

    private object? UpdateTradeState(LegacyPacket packet)
    {
        if (packet.Id == 653)
        {
            currentGold = packet.Recog;
            return null;
        }
        if (packet.Id == 673)
        {
            ClearTradeState();
            tradeOpen = true;
            tradeTarget = WorldProjection.DisplayName(packet.Text);
            return new { type = "tradeOpened", target = tradeTarget };
        }
        if (packet.Id == 674)
            return new { type = "tradeResult", action = "request", accepted = false, reason = packet.Recog };
        if (packet.Id is 675 or 676)
        {
            if (pendingTradeAdd is not { } makeIndex) return null;
            pendingTradeAdd = null;
            InventoryItem? item = null;
            bool accepted = packet.Id == 675 && inventory.TryGetValue(makeIndex, out item);
            if (accepted)
            {
                inventory.Remove(makeIndex);
                tradeItems[makeIndex] = item!;
            }
            return new { type = "tradeResult", action = "add", accepted, reason = accepted ? 0 : packet.Recog,
                item = accepted ? item : null };
        }
        if (packet.Id is 677 or 678)
        {
            if (pendingTradeRemove is not { } makeIndex) return null;
            pendingTradeRemove = null;
            InventoryItem? item = null;
            bool accepted = packet.Id == 677 && tradeItems.Remove(makeIndex, out item);
            if (accepted) inventory[makeIndex] = item!;
            return new { type = "tradeResult", action = "remove", accepted, reason = accepted ? 0 : packet.Recog,
                item = accepted ? item : null };
        }
        if (packet.Id == 682)
        {
            var item = InventoryProjection.Parse(packet.Body);
            remoteTradeItems[item.makeIndex] = item;
            return new { type = "tradeRemoteItemAdded", item };
        }
        if (packet.Id == 683)
        {
            var item = InventoryProjection.Parse(packet.Body);
            remoteTradeItems.Remove(item.makeIndex);
            return new { type = "tradeRemoteItemRemoved", item };
        }
        if (packet.Id is 684 or 685)
        {
            pendingTradeGold = null;
            tradeGold = packet.Recog;
            if (packet.Id == 684) currentGold = (int)((uint)packet.Param | (uint)packet.Tag << 16);
            else if (packet.Param != 0 || packet.Tag != 0) currentGold = (int)((uint)packet.Param | (uint)packet.Tag << 16);
            return packet.Id == 684
                ? new { type = "tradeGold", accepted = true, gold = tradeGold, availableGold = currentGold }
                : new { type = "tradeResult", action = "gold", accepted = false, reason = packet.Series, gold = tradeGold, availableGold = currentGold };
        }
        if (packet.Id == 686)
        {
            remoteTradeGold = packet.Recog;
            return new { type = "tradeRemoteGold", gold = remoteTradeGold };
        }
        if (packet.Id == 681)
        {
            foreach (var item in tradeItems.Values) inventory[item.makeIndex] = item;
            int returnedGold = tradeGold;
            if (returnedGold > 0) currentGold += returnedGold;
            var result = new { type = "tradeClosed", reason = "cancel", gold = currentGold };
            ClearTradeState();
            return result;
        }
        if (packet.Id == 687)
        {
            var result = new { type = "tradeSuccess", gold = currentGold };
            ClearTradeState();
            return result;
        }
        return null;
    }

    private void ClearTradeState()
    {
        tradeOpen = false;
        tradeTarget = "";
        tradeItems.Clear();
        remoteTradeItems.Clear();
        tradeGold = 0;
        remoteTradeGold = 0;
        tradeAccepted = false;
        pendingTradeAdd = null;
        pendingTradeRemove = null;
        pendingTradeGold = null;
    }

    private async Task CastMagic(JsonElement command, CancellationToken cancellation)
    {
        int requestedMagicId = command.GetProperty("magicId").GetInt32();
        long actionId = ReadActionId(command);
        int targetId;
        MagicSkill skill;
        ushort targetX, targetY;
        lock (worldStateLock)
        {
            ValidateActionMap(command);
            if (requestedMagicId is < 1 or > ushort.MaxValue || !skills.TryGetValue((ushort)requestedMagicId, out skill!))
                throw new InvalidOperationException("Skill is unavailable");
            if (pendingAttack || pendingSpell is not null || pendingPosition is not null)
                throw new InvalidOperationException("Action confirmation pending");
            var position = confirmedPosition ?? throw new InvalidOperationException("Player position is not ready");
            int selfId = playerActorId ?? throw new InvalidOperationException("Player position is not ready");
            (targetId, targetX, targetY) = SpellTarget.Resolve(command, skill.magicId, selfId, position, entities);
            pendingSpell = (skill.magicId, skill.name);
            SetPendingAction(actionId, "spell");
        }
        try
        {
            int packedPosition = targetX | targetY << 16;
            await game.Send(3017, cancellation, recog: packedPosition, param: (ushort)targetId,
                tag: skill.magicId, series: (ushort)((uint)targetId >> 16));
        }
        catch { lock (worldStateLock) { pendingSpell = null; ClearPendingAction(); } throw; }
    }

    private static long ReadActionId(JsonElement command)
    {
        if (!command.TryGetProperty("actionId", out var value)) return 0;
        if (!value.TryGetInt64(out long actionId) || actionId <= 0 || actionId > 9_007_199_254_740_991)
            throw new InvalidDataException("Invalid action id");
        return actionId;
    }

    private void ValidateActionMap(JsonElement command)
    {
        if (command.TryGetProperty("mapGeneration", out var value) && (!value.TryGetInt32(out int generation) || generation != mapGeneration))
            throw new InvalidOperationException("Action belongs to an inactive map");
    }

    private static long? TryActionId(JsonElement command)
        => command.TryGetProperty("actionId", out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out long actionId) ? actionId : null;

    private static string? TryActionKind(JsonElement command)
        => command.TryGetProperty("type", out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() switch { "move" => "move", "attack" => "attack", "mine" => "mine", "castMagic" => "spell", _ => null } : null;

    private void SetPendingAction(long actionId, string kind)
    {
        pendingActionId = actionId;
        pendingActionKind = kind;
    }

    private void ClearWorldAction()
    {
        if (pendingMining is { } mining)
        {
            mining.Interrupted = true;
            pendingAttack = true;
            return;
        }
        if (pendingMelee is { } melee)
        {
            melee.Interrupted = true;
            pendingAttack = true;
            return;
        }
        ClearPendingAction();
    }

    private void ClearPendingAction()
    {
        pendingMining = null;
        pendingMelee = null;
        pendingDisplacement = 0;
        pendingActionId = null;
        pendingActionKind = null;
    }

    private object? InterruptMining(int reason)
    {
        if (pendingMining is not { } mining) return null;
        mining.Interrupted = true;
        if (mining.RejectionPublished) return null;
        mining.RejectionPublished = true;
        return new { type = "actionResult", actionId = mining.ActionId, kind = "mine",
            accepted = false, reason, mapGeneration = mining.MapGeneration };
    }

    private object? InterruptMelee(int reason)
    {
        if (pendingMelee is not { } melee) return null;
        melee.Interrupted = true;
        if (melee.RejectionPublished) return null;
        melee.RejectionPublished = true;
        return new { type = "actionResult", actionId = melee.ActionId, kind = "attack",
            accepted = false, reason, mapGeneration = melee.MapGeneration };
    }

    private async Task Attack(JsonElement command, CancellationToken cancellation)
    {
        int direction = command.GetProperty("direction").GetInt32();
        long actionId = ReadActionId(command);
        ushort attackMessage;
        MeleeAttackRequest request;
        lock (worldStateLock)
        {
            if (direction < 0 || direction > 7) throw new InvalidOperationException("Invalid attack direction");
            ValidateActionMap(command);
            if (pendingAttack || pendingPosition is not null || pendingSpell is not null || pendingItemAction is not null)
                throw new InvalidOperationException("Action confirmation pending");
            if (playerActorId is not int actor || !entities.TryGetValue(actor, out var self) || self.dead)
                throw new InvalidOperationException("Player is unavailable for attack");
            var position = confirmedPosition ?? throw new InvalidOperationException("Player position is not ready");
            var (dx, dy) = AttackVector(direction);
            bool longTarget = entities.Values.Any(entity => !entity.dead && entity.x == position.x + dx * 2 && entity.y == position.y + dy * 2);
            attackMessage = meleeSkills.SelectAttack(confirmedMana, equipment.TryGetValue(1, out var weapon) && weapon.stdMode == 6, longTarget);
            request = new(actionId, mapGeneration, position.x, position.y, (byte)direction);
            pendingAttack = true;
            SetPendingAction(actionId, "attack");
            pendingMelee = request;
        }
        try { await game.Send(attackMessage, cancellation, recog: request.X | request.Y << 16, tag: request.Direction); }
        catch { lock (worldStateLock) { pendingAttack = false; ClearPendingAction(); } throw; }
    }

    private async Task Mine(JsonElement command, CancellationToken cancellation)
    {
        MiningRequest request;
        lock (worldStateLock)
        {
            if (pendingAttack || pendingPosition is not null || pendingSpell is not null || pendingItemAction is not null)
                throw new InvalidOperationException("Action confirmation pending");
            if (playerActorId is not int actor || !entities.TryGetValue(actor, out var self) || self.dead)
                throw new InvalidOperationException("Player is unavailable for mining");
            request = MiningCommand.Validate(command, mapGeneration, confirmedPosition, equipment.GetValueOrDefault(1));
            pendingAttack = true;
            SetPendingAction(request.ActionId, "mine");
            pendingMining = request;
        }
        try { await game.Send(MiningCommand.TurnMessage, cancellation, recog: request.PackedPosition, tag: request.Direction); }
        catch { lock (worldStateLock) { pendingAttack = false; ClearPendingAction(); } throw; }
        TrackGameTimer(ExpireMining(request, cancellation));
    }

    private async Task ExpireMining(MiningRequest request, CancellationToken cancellation)
    {
        var epoch = activeGameEpoch;
        if (epoch is null) return;
        using var timerCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellation, epoch.TimerCancellation.Token);
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(5), timerCancellation.Token);
            await outgoing.WaitAsync(timerCancellation.Token);
            try
            {
                lock (worldStateLock)
                {
                    if (!IsCurrentGameEpoch(epoch) || !ReferenceEquals(pendingMining, request)) return;
                    request.TimedOut = true;
                    request.Interrupted = true;
                }
                if (socket.State == WebSocketState.Open)
                {
                    await SendLocked(new { type = "actionResult", actionId = request.ActionId, kind = "mine",
                        accepted = false, reason = -1, mapGeneration = request.MapGeneration }, timerCancellation.Token);
                    await socket.CloseOutputAsync(WebSocketCloseStatus.PolicyViolation, "Native mining confirmation timed out", timerCancellation.Token);
                }
                // Native +GD has no nonce. End only this captured connection;
                // a retired timer cannot close its replacement or the Web peer.
                epoch.Connection.Dispose();
            }
            finally { outgoing.Release(); }
        }
        catch (Exception error) when (error is OperationCanceledException or WebSocketException or ObjectDisposedException) { }
    }

    private object? CompletePendingAction(bool accepted, ushort? x = null, ushort? y = null, int reason = 0)
    {
        if (pendingActionId is not long actionId || pendingActionKind is not string kind) return null;
        ClearPendingAction();
        return new { type = "actionResult", actionId, kind, accepted, x, y, reason, mapGeneration };
    }

    private static (int dx, int dy) AttackVector(int direction) => direction switch
    {
        0 => (0, -1), 1 => (1, -1), 2 => (1, 0), 3 => (1, 1),
        4 => (0, 1), 5 => (-1, 1), 6 => (-1, 0), 7 => (-1, -1),
        _ => throw new InvalidOperationException("Invalid attack direction")
    };

    private object? UpdateShopState(LegacyPacket packet)
    {
        if (packet.Id == 645)
        {
            if (!npcConversation.Matches(packet.Recog)) return null;
            ClearShop(); activeShopNpc = packet.Recog;
            foreach (var goods in ShopProjection.ParseGoods(packet)) shopGoods[goods.name] = goods;
            return npcConversation.Stamp(ShopProjection.Project(packet)!);
        }
        if (packet.Id == 646)
        {
            if (!npcConversation.Matches(packet.Recog)) return null;
            ClearShop(); activeSellNpc = packet.Recog;
            return npcConversation.Stamp(new { type = "shopSell", npcId = packet.Recog, items = inventory.Values.ToArray() });
        }
        if (packet.Id == 668)
        {
            if (!npcConversation.Matches(packet.Recog)) return null;
            ClearShop(); ClearStorage(); activeRepairNpc = packet.Recog;
            return npcConversation.Stamp(new { type = "repairItems", npcId = packet.Recog, items = inventory.Values.ToArray() });
        }
        if (packet.Id == 652)
        {
            if (pendingShopDetails is not { } request || !pendingNpcStamps.TryGetValue("details", out var stamp) || stamp.npcId != packet.Recog)
                return null;
            var details = ShopProjection.ParseDetails(packet);
            if (packet.Tag != request.page || details.Any(item => item.name != request.name)) return null;
            if (PendingNpcIsCurrent("details"))
            {
                shopDetails.Clear(); foreach (var detail in details) shopDetails[detail.makeIndex] = detail;
            }
            pendingShopDetails = null;
            return FinishNpcReply("details", new { type = "shopDetails", npcId = packet.Recog, name = request.name, page = packet.Tag, items = details });
        }
        if (packet.Id is 650 or 651)
        {
            if (pendingPurchase is not { } request) return null;
            bool current = PendingNpcIsCurrent("purchase"); pendingPurchase = null;
            if (packet.Id == 651)
                return FinishNpcReply("purchase", new { type = "shopPurchaseResult", accepted = false, name = request.name, makeIndex = request.makeIndex, reason = packet.Recog, gold = (int?)null });
            int returnedIndex = unchecked((int)((uint)packet.Param | (uint)packet.Tag << 16));
            if (request.makeIndex != 0 && returnedIndex != request.makeIndex)
                throw new InvalidDataException("Purchase response identity mismatch");
            if (current)
            {
                if (shopGoods.TryGetValue(request.name, out var goods)) shopGoods[request.name] = goods with { stock = Math.Max(0, goods.stock - 1) };
                if (request.makeIndex != 0) shopDetails.Remove(request.makeIndex);
            }
            currentGold = packet.Recog;
            return FinishNpcReply("purchase", new { type = "shopPurchaseResult", accepted = true, name = request.name, makeIndex = request.makeIndex, reason = 0, gold = packet.Recog });
        }
        if (packet.Id == 647)
        {
            if (pendingSellQuote is not { } item || !pendingNpcStamps.TryGetValue("sellQuote", out var stamp)) return null;
            pendingSellQuote = null;
            if (PendingNpcIsCurrent("sellQuote")) sellQuote = (item, packet.Recog);
            return FinishNpcReply("sellQuote", new { type = "shopSellQuote", npcId = stamp.npcId, item, price = packet.Recog });
        }
        if (packet.Id is 648 or 649)
        {
            if (pendingSale is not { } item) return null;
            bool current = PendingNpcIsCurrent("sale"); pendingSale = null;
            if (current) sellQuote = null;
            bool accepted = packet.Id == 648;
            if (accepted) { inventory.Remove(item.makeIndex); currentGold = packet.Recog; }
            return FinishNpcReply("sale", new { type = "shopSellResult", accepted, item, gold = accepted ? packet.Recog : (int?)null });
        }
        if (packet.Id == 671)
        {
            if (pendingRepairQuote is not { } item || !pendingNpcStamps.TryGetValue("repairQuote", out var stamp)) return null;
            pendingRepairQuote = null;
            if (PendingNpcIsCurrent("repairQuote")) repairQuote = (item, packet.Recog);
            return FinishNpcReply("repairQuote", new { type = "repairQuote", npcId = stamp.npcId, item, price = packet.Recog });
        }
        if (packet.Id is 669 or 670)
        {
            if (pendingRepair is not { } item) return null;
            bool current = PendingNpcIsCurrent("repair"); pendingRepair = null;
            if (current) repairQuote = null;
            bool accepted = packet.Id == 669;
            var updated = accepted ? item with { durability = packet.Param, maxDurability = packet.Tag } : item;
            if (accepted) { inventory[item.makeIndex] = updated; currentGold = packet.Recog; }
            return FinishNpcReply("repair", new { type = "repairResult", accepted, item = updated, gold = accepted ? packet.Recog : (int?)null });
        }
        if (packet.Id == 644 && npcConversation.Matches(packet.Recog))
        {
            var result = npcConversation.Stamp(new { type = "npcDialogueClosed", npcId = packet.Recog });
            npcConversation.Invalidate(); activeNpc = null; ClearShop(); ClearStorage();
            return result;
        }
        return null;
    }

    private void ClearShop()
    {
        activeShopNpc = null;
        shopGoods.Clear(); shopDetails.Clear();
        activeSellNpc = null; sellQuote = null;
        activeRepairNpc = null; repairQuote = null;
    }

    private void CloseNpc(JsonElement command)
    {
        lock (worldStateLock)
            if (npcConversation.Close(command)) { activeNpc = null; ClearShop(); ClearStorage(); }
    }

    private bool PendingNpcIsCurrent(string kind)
        => pendingNpcStamps.TryGetValue(kind, out var stamp) && stamp == npcConversation.Current();

    private object FinishNpcReply(string kind, object result)
    {
        return pendingNpcStamps.Remove(kind, out var stamp)
            ? npcConversation.Stamp(result, stamp)! : result;
    }

    private static long? OptionalLong(JsonElement command, string name)
        => command.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var result) ? result : null;

    private static long? ChatIdentity(JsonElement command)
        => command.TryGetProperty("type", out var type) && type.ValueKind == JsonValueKind.String && type.GetString() == "say"
            && OptionalLong(command, "chatId") is > 0 and <= 9_007_199_254_740_991 and var id ? id : null;

    private async Task Say(JsonElement command, CancellationToken cancellation)
    {
        if (command.TryGetProperty("chatId", out _) && ChatIdentity(command) is null)
            throw new InvalidDataException("Invalid chat identity");
        string channel = command.TryGetProperty("channel", out var channelValue) ? channelValue.GetString() ?? "local" : "local";
        string text = ChatCommand.Build(channel, command.GetProperty("text").GetString(),
            command.TryGetProperty("target", out var targetValue) ? targetValue.GetString() : null);
        await game.Send(3030, cancellation, text);
    }

    private async Task SetMagicKey(JsonElement command, CancellationToken cancellation)
    {
        MagicKeyChange request;
        long? bindingId = OptionalLong(command, "bindingId");
        if (command.TryGetProperty("bindingId", out _) && (bindingId is null or <= 0 or > 9_007_199_254_740_991))
            throw new InvalidDataException("Invalid magic binding identity");
        lock (worldStateLock)
        {
            if (pendingMagicKey is not null) throw new InvalidOperationException("Magic key confirmation pending");
            request = MagicKeyBinding.Validate(command.GetProperty("magicId").GetInt32(), command.GetProperty("key").GetInt32(), skills.Values);
            pendingMagicKey = request; pendingBindingId = bindingId;
        }
        try { await game.Send(MagicKeyBinding.MessageId, cancellation, recog: request.MagicId, param: request.Key); }
        catch { lock (worldStateLock) { pendingMagicKey = null; pendingBindingId = null; } throw; }
        TrackGameTimer(ExpireMagicKey(request, cancellation));
    }

    private object? RejectPendingMagicKey(string reason)
    {
        if (pendingMagicKey is not { } request) return null;
        var result = new { type = "magicKeyResult", magicId = request.MagicId, key = request.Key, bindingId = pendingBindingId, accepted = false, reason };
        pendingMagicKey = null; pendingBindingId = null;
        return result;
    }

    private async Task ExpireMagicKey(MagicKeyChange request, CancellationToken cancellation)
    {
        var epoch = activeGameEpoch;
        if (epoch is null) return;
        using var timerCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellation, epoch.TimerCancellation.Token);
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(5), timerCancellation.Token);
            object? result;
            lock (worldStateLock) result = IsCurrentGameEpoch(epoch) && ReferenceEquals(pendingMagicKey, request) ? RejectPendingMagicKey("快捷键确认超时，请重试") : null;
            if (result is not null && socket.State == WebSocketState.Open) await SendFromGame(epoch, result, timerCancellation.Token);
        }
        catch (Exception error) when (error is OperationCanceledException or WebSocketException or ObjectDisposedException) { }
    }

    private static int Direction(int dx, int dy) => (dx, dy) switch
    {
        (0, -1) => 0, (1, -1) => 1, (1, 0) => 2, (1, 1) => 3,
        (0, 1) => 4, (-1, 1) => 5, (-1, 0) => 6, (-1, -1) => 7,
        _ => throw new InvalidOperationException("Invalid direction")
    };

    private static (int x, int y) DirectionOffset(int direction) => direction switch
    {
        0 => (0, -1), 1 => (1, -1), 2 => (1, 0), 3 => (1, 1),
        4 => (0, 1), 5 => (-1, 1), 6 => (-1, 0), 7 => (-1, -1),
        _ => throw new InvalidOperationException("Invalid direction")
    };

    private void UpdateInventory(LegacyPacket packet)
    {
        lock (worldStateLock)
        {
            if (packet.Id == 201)
            {
                inventory.Clear();
                foreach (var item in InventoryProjection.ParseInventory(packet)) inventory[item.makeIndex] = item;
            }
            else if (packet.Id == 200)
            {
                var item = InventoryProjection.Parse(packet.Body);
                inventory[item.makeIndex] = item;
            }
            else if (packet.Id == 203)
            {
                var item = InventoryProjection.Parse(packet.Body);
                if (inventory.ContainsKey(item.makeIndex)) inventory[item.makeIndex] = item;
            }
            else if (packet.Id == 202) inventory.Remove(InventoryProjection.Parse(packet.Body).makeIndex);
            else if (packet.Id == 600) inventory.Remove(packet.Recog);
        }
    }

    private object EquipmentSnapshot()
    {
        lock (worldStateLock)
            return new { type = "equipment", slots = equipment.Select(value => new { slot = value.Key, item = value.Value }).ToArray() };
    }

    private object? UpdateItemState(LegacyPacket packet)
    {
        lock (worldStateLock)
        {
            if (packet.Id == 621)
            {
                equipment.Clear();
                foreach (var value in InventoryProjection.ParseEquipment(packet)) equipment[value.Key] = value.Value;
                return null;
            }
            if (packet.Id == 203)
            {
                var item = InventoryProjection.Parse(packet.Body);
                foreach (int slot in equipment.Where(value => value.Value.makeIndex == item.makeIndex).Select(value => value.Key).ToArray())
                    equipment[slot] = item;
                return null;
            }
            if (packet.Id == 642)
            {
                int slot = packet.Param;
                if (slot is < 0 or > 12 || !equipment.TryGetValue(slot, out var item)) return null;
                int maximum = unchecked((int)((uint)packet.Tag | (uint)packet.Series << 16));
                if (packet.Recog < 0 || packet.Recog > ushort.MaxValue || maximum < 0 || maximum > ushort.MaxValue)
                    throw new InvalidDataException("Invalid equipment durability");
                if (packet.Recog == 0)
                {
                    equipment.Remove(slot);
                    return new { type = "equipmentBroken", slot, makeIndex = item.makeIndex, item };
                }
                var updated = item with { durability = (ushort)packet.Recog, maxDurability = (ushort)maximum };
                equipment[slot] = updated;
                return new { type = "equipmentDurability", slot, item = updated };
            }
            if (pendingItemAction is not { } action) return null;
            bool? accepted = packet.Id switch
            {
                615 when action.Kind == "equip" => true,
                616 when action.Kind == "equip" => false,
                619 when action.Kind == "takeoff" => true,
                620 when action.Kind == "takeoff" => false,
                635 when action.Kind == "use" => true,
                636 when action.Kind == "use" => false,
                _ => null
            };
            if (accepted is null) return null;
            pendingItemAction = null;
            if (accepted == true)
            {
                if (action.Kind == "equip") { inventory.Remove(action.MakeIndex); equipment[action.Slot] = action.Item; }
                else if (action.Kind == "takeoff") equipment.Remove(action.Slot);
                else if (action.Kind == "use") inventory.Remove(action.MakeIndex);
            }
            uint? feature = (action.Kind is "equip" or "takeoff") && accepted == true ? unchecked((uint)packet.Recog) : null;
            return new { type = "itemActionResult", kind = action.Kind, makeIndex = action.MakeIndex, slot = action.Slot,
                item = action.Item, accepted, reason = accepted == false ? packet.Recog : 0, feature };
        }
    }

    private async Task EquipItem(JsonElement command, CancellationToken cancellation)
    {
        int makeIndex = command.GetProperty("makeIndex").GetInt32(), slot = command.GetProperty("slot").GetInt32();
        InventoryItem item;
        lock (worldStateLock)
        {
            if (pendingItemAction is not null) throw new InvalidOperationException("Item operation pending");
            if (!inventory.TryGetValue(makeIndex, out item!)) throw new InvalidOperationException("Item is no longer in the inventory");
            if (!CanEquip(slot, item.stdMode)) throw new InvalidOperationException("Item cannot use that equipment slot");
            pendingItemAction = new("equip", makeIndex, slot, item);
        }
        try { await game.Send(1003, cancellation, item.name, recog: makeIndex, param: (ushort)slot); }
        catch { lock (worldStateLock) pendingItemAction = null; throw; }
    }

    private async Task TakeOffItem(JsonElement command, CancellationToken cancellation)
    {
        int slot = command.GetProperty("slot").GetInt32();
        InventoryItem item;
        lock (worldStateLock)
        {
            if (pendingItemAction is not null) throw new InvalidOperationException("Item operation pending");
            if (!equipment.TryGetValue(slot, out item!)) throw new InvalidOperationException("Equipment slot is empty");
            pendingItemAction = new("takeoff", item.makeIndex, slot, item);
        }
        try { await game.Send(1004, cancellation, item.name, recog: item.makeIndex, param: (ushort)slot); }
        catch { lock (worldStateLock) pendingItemAction = null; throw; }
    }

    private async Task UseItem(JsonElement command, CancellationToken cancellation)
    {
        int makeIndex = command.GetProperty("makeIndex").GetInt32();
        InventoryItem item;
        lock (worldStateLock)
        {
            if (pendingItemAction is not null) throw new InvalidOperationException("Item operation pending");
            if (!inventory.TryGetValue(makeIndex, out item!)) throw new InvalidOperationException("Item is no longer in the inventory");
            if (item.stdMode is > 4 and not 31) throw new InvalidOperationException("Item cannot be used directly");
            pendingItemAction = new("use", makeIndex, -1, item);
        }
        try { await game.Send(1006, cancellation, item.name, recog: makeIndex, series: item.stdMode); }
        catch { lock (worldStateLock) pendingItemAction = null; throw; }
    }

    private static bool CanEquip(int slot, byte mode) => slot switch
    {
        0 => mode is 10 or 11, 1 => mode is 5 or 6, 2 => mode is 28 or 29 or 30,
        3 => mode is 19 or 20 or 21, 4 => mode == 15, 5 => mode is 24 or 25 or 26,
        6 => mode is 24 or 26, 7 or 8 => mode is 22 or 23, 9 => mode is 25 or 51,
        10 => mode is 54 or 64, 11 => mode is 52 or 62, 12 => mode is 53 or 63, _ => false
    };

    private static string Field(JsonElement command, string name, int capacity)
    {
        string value = command.GetProperty(name).GetString() ?? "";
        if (value.Length == 0 || value.Any(c => c == '/' || char.IsControl(c)) || LegacyCodec.Gbk.GetByteCount(value) > capacity)
            throw new InvalidOperationException($"Invalid {name}");
        return value;
    }

    private static string AccountField(JsonElement command, string name)
    {
        string value = Field(command, name, 10);
        if (value.Length < 4 || value.Any(character => !char.IsAsciiLetterOrDigit(character)))
            throw new InvalidOperationException("Account must use 4-10 ASCII letters or digits");
        return value;
    }

    private async Task<JsonDocument?> ReadCommand(CancellationToken cancellation)
    {
        byte[] bytes = new byte[8192];
        int count = 0;
        while (true)
        {
            var result = await socket.ReceiveAsync(bytes.AsMemory(count), cancellation);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            if (result.MessageType != WebSocketMessageType.Text) throw new InvalidDataException("Expected JSON text");
            count += result.Count;
            if (result.EndOfMessage) return JsonDocument.Parse(bytes.AsMemory(0, count), new JsonDocumentOptions { MaxDepth = 16 });
            if (count == bytes.Length) throw new InvalidDataException("Command exceeds limit");
        }
    }

    private async Task Send(object message, CancellationToken cancellation)
    {
        await outgoing.WaitAsync(cancellation);
        try { await SendLocked(message, cancellation); }
        finally { outgoing.Release(); }
    }
    public void Dispose() { login.Dispose(); selection.Dispose(); game.Dispose(); }
}
