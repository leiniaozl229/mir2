using System.Text.Json;
using Mir2.WebGateway;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}
static JsonElement Command(object value) => JsonSerializer.SerializeToElement(value);
static void Refused(Action action, string message)
{
    bool refused = false;
    try { action(); } catch (Exception error) when (error is InvalidDataException or InvalidOperationException or ArgumentException) { refused = true; }
    Check(refused, message);
}

var conversation = new NpcConversation();
conversation.Reset(1);
Check(conversation.Current() is null, "reset leaves an old active conversation");
Check(conversation.ObserveDialogue(101), "fresh-map automatic dialogue is discarded");
var automatic = conversation.Current()!;
Check(automatic == new NpcConversationStamp(0, 1, 101, true), "automatic dialogue lacks explicit identity zero");
Check(conversation.ObserveDialogue(101) && !conversation.ObserveDialogue(202), "automatic NPC identity crosses actors");
Check(conversation.Matches(101) && !conversation.Matches(202), "Matches ignores active NPC identity");
Check(conversation.Require(Command(new { npcSessionId = 0, mapGeneration = 1, npcId = 101 })) == automatic, "automatic conversation cannot submit its valid stamp");
Check(conversation.Close(Command(automatic)), "valid automatic close is rejected");
Check(conversation.Current() is null && !conversation.ObserveDialogue(101), "close allows an automatic late reply to reopen");
Console.WriteLine("PASS fresh-map automatic identity, NPC matching, required stamp and local close");

var first = conversation.Begin(101, 1, 1);
Check(conversation.Require(Command(first), 101) == first, "current deliberate stamp is rejected");
Refused(() => conversation.Begin(101, 0, 1), "zero deliberate identity accepted");
Refused(() => conversation.Begin(101, -1, 1), "negative deliberate identity accepted");
Refused(() => conversation.Begin(101, 1, 1), "duplicate identity accepted");
Refused(() => conversation.Begin(202, 2, 2), "wrong-map begin accepted");
Check(conversation.Current() == first, "rejected begin changes active identity");
var second = conversation.Begin(202, 2, 1);
Check(!conversation.ObserveDialogue(101) && conversation.ObserveDialogue(202), "old NPC dialogue overwrites the current NPC");
Refused(() => conversation.Require(Command(first)), "old request identity accepted");
Refused(() => conversation.Require(Command(second), 101), "wrong explicit NPC accepted");
Refused(() => conversation.Require(Command(new { second.npcSessionId, second.mapGeneration, npcId = 101 })), "wrong command NPC accepted");
Check(!conversation.Close(Command(first)) && conversation.Current() == second, "late close clears a newer conversation");
Check(conversation.Close(Command(second)), "current close rejected");
var reopened = conversation.Begin(202, 3, 1);
Check(!conversation.Close(Command(second)) && conversation.Current() == reopened, "same-NPC old close clears a newer identity");
Console.WriteLine("PASS strict increasing IDs, map checks, switching NPC and stale/same-NPC close exclusion");

foreach (string malformed in new[] { "null", "[]", "{}", "{\"npcSessionId\":3}", "{\"npcSessionId\":\"3\",\"mapGeneration\":1}", "{\"npcSessionId\":3.5,\"mapGeneration\":1}", "{\"npcSessionId\":3,\"mapGeneration\":-1}", "{\"npcSessionId\":3,\"mapGeneration\":1,\"npcId\":\"202\"}" })
{
    using var document = JsonDocument.Parse(malformed);
    Refused(() => conversation.Require(document.RootElement), "malformed required stamp accepted");
    Check(!conversation.Close(document.RootElement) && conversation.Current() == reopened, "malformed close mutates current state");
}
Check(conversation.Require(Command(reopened)) == reopened, "valid stamp lost after malformed requests");
Console.WriteLine("PASS malformed required stamps and closes fail without corrupting active state");

conversation.Invalidate();
Check(conversation.Current() is null && !conversation.Matches(202) && !conversation.ObserveDialogue(202), "death/disconnect-style invalidation allows old NPC replies");
Refused(() => conversation.Require(Command(reopened)), "invalidated required stamp accepted");
conversation.Reset(2);
Check(conversation.ObserveDialogue(404), "new map does not restore automatic entry dialogue");
Refused(() => conversation.Begin(404, 3, 2), "reset reused a prior client identity");
var current = conversation.Begin(404, 4, 2);
Refused(() => conversation.Require(Command(new { current.npcSessionId, mapGeneration = 1 })), "old-map required stamp accepted");
Refused(() => conversation.Reset(-1), "negative map generation accepted");
Check(conversation.Current() == current, "invalid reset corrupts current identity");
Console.WriteLine("PASS invalidation, new-map automatic recovery and monotonic IDs across resets");

var payload = new { type = "repairResult", npcId = 101, accepted = true, item = new { makeIndex = 77, durability = 900 }, gold = 700, detail = new[] { "原字段", "kept" }, npcSessionId = -99, mapGeneration = -99, automatic = true };
using var stampedCurrent = JsonDocument.Parse(JsonSerializer.Serialize(conversation.Stamp(payload)));
Check(stampedCurrent.RootElement.GetProperty("npcSessionId").GetInt64() == 4 && stampedCurrent.RootElement.GetProperty("mapGeneration").GetInt32() == 2 && !stampedCurrent.RootElement.GetProperty("automatic").GetBoolean(), "current stamp fields not authoritative");
Check(stampedCurrent.RootElement.GetProperty("npcId").GetInt32() == 101 && stampedCurrent.RootElement.GetProperty("item").GetProperty("makeIndex").GetInt32() == 77 && stampedCurrent.RootElement.GetProperty("gold").GetInt32() == 700 && stampedCurrent.RootElement.GetProperty("detail")[0].GetString() == "原字段", "stamping loses payload authority/nested fields");
using var stampedCaptured = JsonDocument.Parse(JsonSerializer.Serialize(conversation.Stamp(payload, first)));
Check(stampedCaptured.RootElement.GetProperty("npcSessionId").GetInt64() == 1 && stampedCaptured.RootElement.GetProperty("mapGeneration").GetInt32() == 1, "old in-flight result is stamped with a newer conversation");
conversation.Invalidate();
Check(conversation.Stamp(payload) is null, "no-current payload gets a presentation identity");
using var capturedAfterClose = JsonDocument.Parse(JsonSerializer.Serialize(conversation.Stamp(payload, first)));
Check(capturedAfterClose.RootElement.GetProperty("gold").GetInt32() == 700 && capturedAfterClose.RootElement.GetProperty("npcSessionId").GetInt64() == 1, "closing loses a captured successful economic result");
Console.WriteLine("PASS current/captured JSON stamping retains original fields and late authoritative result identity after close");

conversation.Reset(3);
conversation.ObserveDialogue(505);
using var autoPayload = JsonDocument.Parse(JsonSerializer.Serialize(conversation.Stamp(new { type = "npcDialogue", npcId = 505 })));
Check(autoPayload.RootElement.GetProperty("npcSessionId").GetInt64() == 0 && autoPayload.RootElement.GetProperty("automatic").GetBoolean(), "automatic projection loses its marker");
Refused(() => conversation.Stamp("not-an-object"), "nonobject presentation is accepted");
Check(conversation.ObserveDialogue(505), "same-NPC native correlation boundary changed unexpectedly");
Console.WriteLine("PASS automatic JSON marker and documented same-NPC native correlation boundary");
