using System.Buffers.Binary;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Reflection;
using System.Runtime.ExceptionServices;
using System.Text;
using System.Text.Json;
using Mir2.WebGateway;

static void Check(bool condition, string message) { if (!condition) throw new Exception(message); }
static JsonElement Json(object? value)
{
    Check(value is not null, "production method returned no expected result");
    return JsonSerializer.SerializeToElement(value);
}
static void Stamped(object? value, NpcConversationStamp stamp, string type)
{
    var json = Json(value);
    Check(json.GetProperty("type").GetString() == type, $"unexpected result type for {type}");
    Check(json.GetProperty("npcSessionId").GetInt64() == stamp.npcSessionId
        && json.GetProperty("mapGeneration").GetInt32() == stamp.mapGeneration,
        $"{type} lost its captured conversation identity");
}
static byte[] ItemBytes(int makeIndex, string name = "NPC回归物品", ushort durability = 100)
{
    byte[] body = new byte[124], text = LegacyCodec.Gbk.GetBytes(name);
    Check(text.Length <= 14, "test item name exceeds native field");
    body[0] = (byte)text.Length; text.CopyTo(body, 1); body[15] = 6; body[17] = 2;
    BinaryPrimitives.WriteInt32LittleEndian(body.AsSpan(100), makeIndex);
    BinaryPrimitives.WriteUInt16LittleEndian(body.AsSpan(104), durability);
    BinaryPrimitives.WriteUInt16LittleEndian(body.AsSpan(106), 1200);
    return body;
}
static LegacyPacket Goods(int npcId, string name = "NPC回归物品", int subMenu = 0)
    => new(645, npcId, 1, 0, 0, LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes($"{name}/{subMenu}/15/8/")));
static LegacyPacket Details(int npcId, byte[] item)
    => new(652, npcId, 1, 0, 0, LegacyCodec.Encode(Encoding.ASCII.GetBytes(Encoding.ASCII.GetString(LegacyCodec.Encode(item)) + "/")));
static LegacyPacket StoredItems(int npcId, byte[] item)
    => new(704, npcId, 0, 0, 0, [.. LegacyCodec.Encode(item), (byte)'/']);
static JsonElement ItemCommand(NpcConversationStamp stamp, int makeIndex)
    => JsonSerializer.SerializeToElement(new { stamp.npcSessionId, stamp.mapGeneration, stamp.npcId, makeIndex });
static async Task PendingRefusal(Fixture fixture, string method, JsonElement command)
{
    bool refused = false;
    try { await (Task)fixture.Call(method, command, CancellationToken.None)!; }
    catch (InvalidOperationException error) { refused = error.Message.Contains("pending", StringComparison.OrdinalIgnoreCase); }
    Check(refused, $"{method} did not preserve the unresolved native-request lock");
}
static async Task QuoteUnavailable(Fixture fixture, string method, JsonElement command)
{
    bool refused = false;
    try { await (Task)fixture.Call(method, command, CancellationToken.None)!; }
    catch (InvalidOperationException error) { refused = error.Message.Contains("quote is unavailable", StringComparison.OrdinalIgnoreCase); }
    Check(refused, $"{method} consumed a stale quote from another conversation");
}

var oldItem = InventoryProjection.Parse(ItemBytes(77));
var newItem = InventoryProjection.Parse(ItemBytes(88, "新服务物品"));

using (var fixture = new Fixture())
{
    var old = fixture.Begin(101, 1);
    fixture.Set("activeShopNpc", 101); fixture.Set("activeSellNpc", 101); fixture.Set("activeRepairNpc", 101); fixture.Set("activeStorageNpc", 101);
    fixture.Set("pendingShopDetails", (oldItem.name, 0)); fixture.Set("pendingPurchase", (oldItem.name, 0));
    fixture.Set("pendingSellQuote", oldItem); fixture.Set("pendingSale", oldItem);
    fixture.Set("pendingRepairQuote", oldItem); fixture.Set("pendingRepair", oldItem);
    fixture.Set("pendingStorageAction", ("store", oldItem));
    foreach (var key in new[] { "details", "purchase", "sellQuote", "sale", "repairQuote", "repair", "storage" }) fixture.Stamps[key] = old;
    var inFlight = new[] { "pendingShopDetails", "pendingPurchase", "pendingSellQuote", "pendingSale", "pendingRepairQuote", "pendingRepair", "pendingStorageAction" }
        .ToDictionary(name => name, fixture.Get);
    fixture.Call("ClearShop"); fixture.Call("ClearStorage");
    foreach (var (field, value) in inFlight)
        Check(value is not null && Equals(fixture.Get(field), value), $"production clear discarded or changed {field}");
    Check(fixture.Stamps.Count == 7 && fixture.Stamps.Values.All(stamp => stamp == old), "production clear discarded captured request identities");
    fixture.Call("CloseNpc", JsonSerializer.SerializeToElement(old));
    Check(fixture.Conversation.Current() is null && !fixture.Conversation.ObserveDialogue(101), "local close allows automatic late reopening");
    Check(fixture.Get("pendingPurchase") is not null && fixture.Get("pendingStorageAction") is not null, "local close discarded economic waits");
    var current = fixture.Begin(202, 2); fixture.Set("activeShopNpc", 202);
    fixture.Call("CloseNpc", JsonSerializer.SerializeToElement(old));
    Check(fixture.Conversation.Current() == current && fixture.Get<int?>("activeNpc") == 202 && fixture.Get<int?>("activeShopNpc") == 202, "late local close cleared the newer NPC");
    Console.WriteLine("PASS production ClearShop/ClearStorage/CloseNpc preserve all in-flight requests and reject stale close stamps");
}

using (var fixture = new Fixture())
{
    fixture.Begin(101, 1); var current = fixture.Switch(202, 2);
    fixture.Set("activeShopNpc", 202); fixture.Set("activeStorageNpc", 202);
    fixture.Goods[newItem.name] = new(newItem.name, 0, 15, 8); fixture.Stored[newItem.makeIndex] = newItem;
    foreach (var packet in new[] { Goods(101), new LegacyPacket(646, 101, 0, 0, 0, []), new LegacyPacket(668, 101, 0, 0, 0, []) })
        Check(fixture.Call("UpdateShopState", packet) is null, $"old {packet.Id} returns a current presentation");
    foreach (var packet in new[] { new LegacyPacket(700, 101, 0, 0, 0, []), StoredItems(101, ItemBytes(77)) })
        Check(fixture.Call("UpdateStorageState", packet) is null, $"old {packet.Id} returns a current storage presentation");
    Check(fixture.Call("UpdateShopState", new LegacyPacket(644, 101, 0, 0, 0, [])) is null, "old native close is projected for the current NPC");
    Check(fixture.Call("UpdateStorageState", new LegacyPacket(644, 101, 0, 0, 0, [])) is null, "old native close clears storage separately");
    Check(fixture.Conversation.Current() == current && fixture.Goods.ContainsKey(newItem.name) && fixture.Stored.ContainsKey(newItem.makeIndex)
        && fixture.Get<int?>("activeShopNpc") == 202 && fixture.Get<int?>("activeStorageNpc") == 202, "old initial/close packets polluted NPC B");
    Stamped(fixture.Call("UpdateShopState", Goods(202)), current, "shop");
    Stamped(fixture.Call("UpdateStorageState", StoredItems(202, ItemBytes(88, "新服务物品"))), current, "storageItems");
    Stamped(fixture.Call("UpdateShopState", new LegacyPacket(644, 202, 0, 0, 0, [])), current, "npcDialogueClosed");
    Check(fixture.Conversation.Current() is null && fixture.Stored.Count == 0, "matching native close does not invalidate the presentation");
    Console.WriteLine("PASS production old 645/646/668/700/704/644 packets leave NPC B intact while matching packets remain usable");
}

foreach (var (requestField, stampKind, quoteField, activeField, queryMethod, actionMethod, packetId, resultType) in new[] {
    ("pendingSellQuote", "sellQuote", "sellQuote", "activeSellNpc", "QuerySellItem", "SellShopItem", 647, "shopSellQuote"),
    ("pendingRepairQuote", "repairQuote", "repairQuote", "activeRepairNpc", "QueryRepairItem", "RepairItem", 671, "repairQuote") })
{
    using var fixture = new Fixture(); var old = fixture.Begin(101, 1);
    fixture.Bag[oldItem.makeIndex] = oldItem; fixture.Bag[newItem.makeIndex] = newItem;
    fixture.Set(requestField, oldItem); fixture.Stamps[stampKind] = old;
    var current = fixture.Switch(202, 2); fixture.Set(activeField, 202);
    await PendingRefusal(fixture, queryMethod, ItemCommand(current, newItem.makeIndex));
    var reply = fixture.Call("UpdateShopState", new LegacyPacket(packetId, 333, 0, 0, 0, []));
    Stamped(reply, old, resultType);
    Check(Json(reply).GetProperty("npcId").GetInt32() == 101 && fixture.Get(requestField) is null && fixture.Get(quoteField) is null
        && !fixture.Stamps.ContainsKey(stampKind), "stale quote became NPC B's purchasable quote or remained unresolved");
    await QuoteUnavailable(fixture, actionMethod, ItemCommand(current, oldItem.makeIndex));
    Check(fixture.Conversation.Current() == current, "consuming a late quote changed the active conversation");
}
Console.WriteLine("PASS production late sell/repair quotes retain old stamps, block overlapping requests and cannot authorize new service actions");

using (var fixture = new Fixture())
{
    var old = fixture.Begin(101, 1); fixture.Set("pendingShopDetails", (oldItem.name, 0)); fixture.Stamps["details"] = old;
    var current = fixture.Switch(202, 2); fixture.Set("activeShopNpc", 202);
    fixture.Goods[oldItem.name] = new(oldItem.name, 1, 15, 8);
    fixture.DetailItems[newItem.makeIndex] = new(newItem.name, newItem.makeIndex, 15, newItem.durability, newItem.stdMode, newItem.weight, newItem.looks);
    await PendingRefusal(fixture, "RequestShopDetails", JsonSerializer.SerializeToElement(new { current.npcSessionId, current.mapGeneration, current.npcId, name = oldItem.name, page = 0 }));
    var oldDetails = fixture.Call("UpdateShopState", Details(101, ItemBytes(77)));
    Stamped(oldDetails, old, "shopDetails");
    Check(Json(oldDetails).GetProperty("name").GetString() == oldItem.name, "detail response lost its captured request name");
    Check(fixture.Get("pendingShopDetails") is null && fixture.DetailItems.ContainsKey(newItem.makeIndex) && !fixture.DetailItems.ContainsKey(oldItem.makeIndex), "old detail response overwrote the new detail list");
    Check(fixture.Conversation.Current() == current, "old details changed active presentation");
    fixture.Set("pendingShopDetails", (newItem.name, 10)); fixture.Stamps["details"] = current;
    var emptyDetails = fixture.Call("UpdateShopState", new LegacyPacket(652, 202, 0, 10, 0, []));
    Stamped(emptyDetails, current, "shopDetails");
    Check(Json(emptyDetails).GetProperty("name").GetString() == newItem.name
        && Json(emptyDetails).GetProperty("page").GetInt32() == 10 && Json(emptyDetails).GetProperty("items").GetArrayLength() == 0
        && fixture.Get("pendingShopDetails") is null && fixture.DetailItems.Count == 0,
        "empty native detail page lost the originating name/page or remained unresolved");
    Console.WriteLine("PASS production old and empty shop details retain request name/page without overwriting NPC B details");
}

using (var fixture = new Fixture())
{
    var old = fixture.Begin(101, 1); fixture.Set("pendingPurchase", (oldItem.name, 0)); fixture.Stamps["purchase"] = old;
    var current = fixture.Switch(202, 2); fixture.Set("activeShopNpc", 202); fixture.Goods[oldItem.name] = new(oldItem.name, 0, 15, 8);
    await PendingRefusal(fixture, "BuyShopItem", JsonSerializer.SerializeToElement(new { current.npcSessionId, current.mapGeneration, current.npcId, name = oldItem.name }));
    var result = fixture.Call("UpdateShopState", new LegacyPacket(650, 700, 0, 0, 0, []));
    Stamped(result, old, "shopPurchaseResult");
    Check(Json(result).GetProperty("accepted").GetBoolean() && fixture.Get<int>("currentGold") == 700
        && fixture.Goods[oldItem.name].stock == 8 && fixture.Get("pendingPurchase") is null, "old purchase lost gold or changed new merchant stock");
    fixture.Call("UpdateInventory", new LegacyPacket(200, 0, 0, 0, 0, LegacyCodec.Encode(ItemBytes(77))));
    Check(fixture.Bag.ContainsKey(77) && fixture.Conversation.Current() == current, "authoritative purchased item was not retained");
    Check(fixture.Call("UpdateShopState", new LegacyPacket(650, 700, 0, 0, 0, [])) is null, "duplicate purchase reapplied");
    Console.WriteLine("PASS production late accepted purchase keeps captured identity, currency and native item delta without changing new stock");
}

foreach (var (pendingField, kind, activeField, quoteField, packetId, resultType) in new[] {
    ("pendingSale", "sale", "activeSellNpc", "sellQuote", 648, "shopSellResult"),
    ("pendingRepair", "repair", "activeRepairNpc", "repairQuote", 669, "repairResult") })
{
    using var fixture = new Fixture(); var old = fixture.Begin(101, 1);
    fixture.Bag[oldItem.makeIndex] = oldItem; fixture.Set(pendingField, oldItem); fixture.Stamps[kind] = old;
    var current = fixture.Switch(202, 2); fixture.Set(activeField, 202); fixture.Set(quoteField, (newItem, 333));
    var result = fixture.Call("UpdateShopState", new LegacyPacket(packetId, 800, 900, 1200, 0, []));
    Stamped(result, old, resultType);
    Check(Json(result).GetProperty("accepted").GetBoolean() && fixture.Get<int>("currentGold") == 800
        && fixture.Get(pendingField) is null && fixture.Get(quoteField) is not null && fixture.Conversation.Current() == current,
        "late economic success discarded authority or released NPC B's quote");
    Check(packetId == 648 ? !fixture.Bag.ContainsKey(oldItem.makeIndex) : fixture.Bag[oldItem.makeIndex].durability == 900,
        "late sale/repair did not update the original inventory instance");
    Check(fixture.Call("UpdateShopState", new LegacyPacket(packetId, 800, 900, 1200, 0, [])) is null, "duplicate economic result reapplied");
}
Console.WriteLine("PASS production late accepted sale/repair update inventory and gold while retaining NPC B's quote");

foreach (var (kind, packetId) in new[] { ("store", 701), ("take", 705) })
{
    using var fixture = new Fixture(); var old = fixture.Begin(101, 1);
    fixture.Bag[oldItem.makeIndex] = oldItem; fixture.Set("pendingStorageAction", (kind, oldItem)); fixture.Stamps["storage"] = old;
    var current = fixture.Switch(202, 2); fixture.Set("activeStorageNpc", 202); fixture.Stored[newItem.makeIndex] = newItem;
    if (kind == "take") { fixture.Bag.Remove(oldItem.makeIndex); fixture.Stored[oldItem.makeIndex] = oldItem; }
    var result = fixture.Call("UpdateStorageState", new LegacyPacket(packetId, 0, 0, 0, 0, []));
    Stamped(result, old, "storageResult");
    Check(Json(result).GetProperty("accepted").GetBoolean() && fixture.Get("pendingStorageAction") is null
        && fixture.Stored.ContainsKey(newItem.makeIndex) && fixture.Conversation.Current() == current, "old storage result changed the new service or remained pending");
    Check(kind == "store" ? !fixture.Bag.ContainsKey(77) && !fixture.Stored.ContainsKey(77) : fixture.Bag.ContainsKey(77) && fixture.Stored.ContainsKey(77),
        "old storage authority was discarded or projected into NPC B's displayed storage");
    Check(fixture.Call("UpdateStorageState", new LegacyPacket(packetId, 0, 0, 0, 0, [])) is null, "duplicate storage result reapplied");
}
Console.WriteLine("PASS production late accepted store/take update the bag and preserve the new service's storage cache");

foreach (var (pendingField, key, method, packetId, resultType) in new[] {
    ("pendingSale", "sale", "UpdateShopState", 649, "shopSellResult"),
    ("pendingRepair", "repair", "UpdateShopState", 670, "repairResult"),
    ("pendingStorageAction", "storage", "UpdateStorageState", 702, "storageResult") })
{
    using var fixture = new Fixture(); var old = fixture.Begin(101, 1); fixture.Bag[oldItem.makeIndex] = oldItem;
    fixture.Set(pendingField, pendingField == "pendingStorageAction" ? (object)("store", oldItem) : oldItem); fixture.Stamps[key] = old;
    var current = fixture.Switch(202, 2); fixture.Set("currentGold", 500);
    var result = fixture.Call(method, new LegacyPacket(packetId, 1, 0, 0, 0, []));
    Stamped(result, old, resultType);
    Check(!Json(result).GetProperty("accepted").GetBoolean() && fixture.Bag[77].durability == oldItem.durability
        && fixture.Get<int>("currentGold") == 500 && fixture.Get(pendingField) is null && fixture.Conversation.Current() == current,
        "old refusal corrupted authority or remained in flight");
}
Console.WriteLine("PASS production late economic refusals release only their captured request without changing inventory or gold");

foreach (var (kind, field, method, packetId, resultType) in new[] {
    ("purchase", "pendingPurchase", "UpdateShopState", 650, "shopPurchaseResult"),
    ("sale", "pendingSale", "UpdateShopState", 648, "shopSellResult"),
    ("repair", "pendingRepair", "UpdateShopState", 669, "repairResult"),
    ("store", "pendingStorageAction", "UpdateStorageState", 701, "storageResult"),
    ("take", "pendingStorageAction", "UpdateStorageState", 705, "storageResult") })
{
    using var fixture = new Fixture(); var old = fixture.Begin(101, 1); fixture.Bag[77] = oldItem;
    object pending = kind == "purchase" ? (oldItem.name, 0) : kind is "store" or "take" ? (kind, oldItem) : oldItem;
    fixture.Set(field, pending); fixture.Stamps[kind is "store" or "take" ? "storage" : kind] = old;
    if (kind == "take") fixture.Bag.Remove(77);
    fixture.Call("CloseNpc", JsonSerializer.SerializeToElement(old));
    var result = fixture.Call(method, new LegacyPacket(packetId, 700, kind == "repair" ? (ushort)900 : (ushort)0, kind == "repair" ? (ushort)1200 : (ushort)0, 0, []));
    Stamped(result, old, resultType);
    Check(Json(result).GetProperty("accepted").GetBoolean() && fixture.Get(field) is null
        && fixture.Conversation.Current() is null && fixture.Get("activeNpc") is null && fixture.Stored.Count == 0,
        "late success after close disappeared or reopened a presentation");
    if (kind is "purchase" or "sale" or "repair") Check(fixture.Get<int>("currentGold") == 700, "close-only path lost authoritative gold");
    if (kind is "sale" or "store") Check(!fixture.Bag.ContainsKey(77), "close-only path lost authoritative item removal");
    if (kind == "repair") Check(fixture.Bag[77].durability == 900, "close-only path lost authoritative durability");
    if (kind == "take") Check(fixture.Bag.ContainsKey(77), "close-only path lost authoritative item recovery");
}
Console.WriteLine("PASS production accepted purchase/sale/repair/store/take after close without reopening preserve authority and keep UI inactive");

using (var fixture = new Fixture())
{
    var request = new MagicKeyChange(12, 49);
    fixture.Set("pendingMagicKey", request); fixture.Set("pendingBindingId", 701L);
    fixture.Set("pendingPosition", ((ushort)120, (ushort)121)); fixture.Set("pendingAttack", true);
    fixture.Set("pendingSpell", ((ushort)3, "回归技能")); fixture.Set("pendingActionId", 702L); fixture.Set("pendingActionKind", "move");
    var worldFields = new[] { "pendingPosition", "pendingAttack", "pendingSpell", "pendingActionId", "pendingActionKind" }
        .ToDictionary(name => name, fixture.Get);
    var result = Json(fixture.Call("RejectPendingMagicKey", "回归拒绝"));
    Check(result.GetProperty("type").GetString() == "magicKeyResult" && !result.GetProperty("accepted").GetBoolean()
        && result.GetProperty("magicId").GetUInt16() == request.MagicId && result.GetProperty("key").GetByte() == request.Key
        && result.GetProperty("bindingId").GetInt64() == 701 && result.GetProperty("reason").GetString() == "回归拒绝",
        "binding rejection lost its captured request identity or reason");
    Check(fixture.Get("pendingMagicKey") is null && fixture.Get("pendingBindingId") is null
        && fixture.Call("RejectPendingMagicKey", "重复拒绝") is null, "binding rejection did not release exactly one pending request");
    foreach (var (field, value) in worldFields) Check(Equals(fixture.Get(field), value), $"binding rejection changed world action field {field}");
    Console.WriteLine("PASS production magic binding rejection retains request identity, releases only binding fields and leaves world actions intact");
}

static async Task SameBindingTimeout()
{
    using var fixture = new Fixture(); await fixture.EnableGameEpoch(); fixture.Socket.StateValue = WebSocketState.Closed;
    var request = new MagicKeyChange(12, 49);
    fixture.Set("pendingMagicKey", request); fixture.Set("pendingBindingId", 703L);
    fixture.Set("pendingPosition", ((ushort)120, (ushort)121)); fixture.Set("pendingActionId", 704L); fixture.Set("pendingActionKind", "move");
    var elapsed = Stopwatch.StartNew();
    var timeout = (Task)fixture.Call("ExpireMagicKey", request, CancellationToken.None)!;
    await Task.Delay(80);
    Check(ReferenceEquals(fixture.Get("pendingMagicKey"), request) && !timeout.IsCompleted, "production binding timeout released before its five-second wait");
    await timeout.WaitAsync(TimeSpan.FromSeconds(10));
    Check(elapsed.Elapsed >= TimeSpan.FromMilliseconds(4800) && fixture.Get("pendingMagicKey") is null && fixture.Get("pendingBindingId") is null,
        "production five-second timeout did not release the original binding");
    Check(fixture.Socket.SendCount == 0 && fixture.Get<long?>("pendingActionId") == 704
        && fixture.Get<string>("pendingActionKind") == "move" && fixture.Get<(ushort x, ushort y)?>("pendingPosition") == ((ushort)120, (ushort)121),
        "closed-socket binding timeout sent a packet or released the movement request");
}
static async Task ReplacedBindingTimeout()
{
    using var fixture = new Fixture(); await fixture.EnableGameEpoch(); fixture.Socket.StateValue = WebSocketState.Closed;
    var old = new MagicKeyChange(12, 49); var current = new MagicKeyChange(12, 49);
    Check(old == current && !ReferenceEquals(old, current), "equal-value timeout fixture lacks distinct request identities");
    fixture.Set("pendingMagicKey", old); fixture.Set("pendingBindingId", 705L);
    var timeout = (Task)fixture.Call("ExpireMagicKey", old, CancellationToken.None)!;
    await Task.Delay(80);
    fixture.Set("pendingMagicKey", current); fixture.Set("pendingBindingId", 706L);
    await timeout.WaitAsync(TimeSpan.FromSeconds(10));
    Check(ReferenceEquals(fixture.Get("pendingMagicKey"), current) && fixture.Get<long?>("pendingBindingId") == 706 && fixture.Socket.SendCount == 0,
        "old timeout released an equal-value replacement binding or sent its obsolete result");
}
static async Task CancelledBindingTimeout()
{
    using var fixture = new Fixture(); await fixture.EnableGameEpoch(); fixture.Socket.StateValue = WebSocketState.Closed;
    using var cancellation = new CancellationTokenSource(); var request = new MagicKeyChange(12, 49);
    fixture.Set("pendingMagicKey", request); fixture.Set("pendingBindingId", 707L);
    var timeout = (Task)fixture.Call("ExpireMagicKey", request, cancellation.Token)!;
    await Task.Delay(80); cancellation.Cancel(); await timeout.WaitAsync(TimeSpan.FromSeconds(2));
    Check(timeout.IsCompletedSuccessfully && ReferenceEquals(fixture.Get("pendingMagicKey"), request)
        && fixture.Get<long?>("pendingBindingId") == 707 && fixture.Socket.SendCount == 0,
        "cancelled timeout threw, sent a packet or mutated a binding before lifecycle cleanup");
    fixture.Call("RejectPendingMagicKey", "会话结束");
    Check(fixture.Get("pendingMagicKey") is null && fixture.Get("pendingBindingId") is null, "lifecycle rejection cannot release a cancelled wait");
}
await Task.WhenAll(SameBindingTimeout(), ReplacedBindingTimeout(), CancelledBindingTimeout());
Console.WriteLine("PASS production actual five-second magic binding timeout releases the same request without consuming movement or sending on a closed socket");
Console.WriteLine("PASS production old binding timeout preserves a distinct replacement request even when both requests have equal magic/key values");
Console.WriteLine("PASS production binding timeout cancellation completes without throwing and allows explicit lifecycle rejection");

Console.WriteLine("PASS NPC GatewaySession regression complete: 9 NPC groups and 4 binding groups, production reflection methods, real five-second timers on actual private TCP game epochs, dummy WebSocket, no account/database/native server");

sealed class Fixture : IDisposable
{
    public DummySocket Socket { get; } = new();
    public GatewaySession Session { get; }
    public NpcConversation Conversation => Get<NpcConversation>("npcConversation");
    public Dictionary<string, NpcConversationStamp> Stamps => Get<Dictionary<string, NpcConversationStamp>>("pendingNpcStamps");
    public Dictionary<int, InventoryItem> Bag => Get<Dictionary<int, InventoryItem>>("inventory");
    public Dictionary<int, InventoryItem> Stored => Get<Dictionary<int, InventoryItem>>("storage");
    public Dictionary<string, ShopGoods> Goods => Get<Dictionary<string, ShopGoods>>("shopGoods");
    public Dictionary<int, ShopDetail> DetailItems => Get<Dictionary<int, ShopDetail>>("shopDetails");
    private readonly CancellationTokenSource lifetime = new();
    private TcpClient? peer;
    private Task? reader;
    public Fixture() { Session = new(Socket); Set("mapGeneration", 1); Conversation.Reset(1); }
    private static FieldInfo Field(string name) => typeof(GatewaySession).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)
        ?? throw new MissingFieldException(typeof(GatewaySession).Name, name);
    public object? Get(string name) => Field(name).GetValue(Session);
    public T Get<T>(string name) => (T)Get(name)!;
    public void Set(string name, object? value) => Field(name).SetValue(Session, value);
    public object? Call(string name, params object?[] arguments)
    {
        var method = typeof(GatewaySession).GetMethod(name, BindingFlags.Instance | BindingFlags.NonPublic)
            ?? throw new MissingMethodException(typeof(GatewaySession).Name, name);
        try { return method.Invoke(Session, arguments); }
        catch (TargetInvocationException error) when (error.InnerException is not null)
        { ExceptionDispatchInfo.Capture(error.InnerException).Throw(); throw; }
    }
    public NpcConversationStamp Begin(int npcId, long id) { var stamp = Conversation.Begin(npcId, id, 1); Set("activeNpc", npcId); return stamp; }
    public NpcConversationStamp Switch(int npcId, long id) { Call("ClearShop"); Call("ClearStorage"); return Begin(npcId, id); }
    public async Task EnableGameEpoch()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        try
        {
            var incoming = listener.AcceptTcpClientAsync();
            await Get<LegacyConnection>("game").Connect("127.0.0.1", ((IPEndPoint)listener.LocalEndpoint).Port, lifetime.Token);
            peer = await incoming;
            reader = (Task)Call("ReadGame", lifetime)!;
        }
        finally { listener.Stop(); }
    }
    public void Dispose()
    {
        lifetime.Cancel(); peer?.Dispose(); Session.Dispose();
        if (reader is not null)
        {
            try { reader.GetAwaiter().GetResult(); }
            catch (Exception error) when (error is OperationCanceledException or IOException or ObjectDisposedException) { }
            var epoch = Get("activeGameEpoch")!;
            foreach (string name in new[] { "TimerCancellation", "Cancellation", "NativeWrites" })
                ((IDisposable)epoch.GetType().GetField(name)!.GetValue(epoch)!).Dispose();
        }
        lifetime.Dispose();
    }
}

sealed class DummySocket : WebSocket
{
    public WebSocketState StateValue { get; set; } = WebSocketState.Open;
    public int SendCount { get; private set; }
    public override WebSocketCloseStatus? CloseStatus => null;
    public override string? CloseStatusDescription => null;
    public override WebSocketState State => StateValue;
    public override string? SubProtocol => null;
    public override void Abort() { }
    public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) => Task.CompletedTask;
    public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) => Task.CompletedTask;
    public override void Dispose() { }
    public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken)
        => throw new InvalidOperationException("This reflection fixture must not start the network reader");
    public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
    { SendCount++; return Task.CompletedTask; }
}
