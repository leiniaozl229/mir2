using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Collections.Concurrent;
using System.Reflection;
using Mir2.WebGateway;
using System.Text.Json;

static void Require(bool ok, string message) { if (!ok) throw new Exception(message); }
Require(LegacyCodec.Encode([0xac]).SequenceEqual("<<"u8.ToArray()), "single byte reference vector");
Require(LegacyCodec.Encode([0, 0, 0]).SequenceEqual("ddhk"u8.ToArray()), "three byte reference vector");
for (int size = 0; size < 1024; size++)
{
    byte[] data = Enumerable.Range(0, size).Select(i => (byte)(i * 73 + size)).ToArray();
    Require(LegacyCodec.Decode(LegacyCodec.Encode(data)).SequenceEqual(data), $"roundtrip length {size}");
}
foreach (byte[] invalid in new byte[][] { "<"u8.ToArray(), "zz|"u8.ToArray(), [0, 0] })
{
    bool rejected = false;
    try { LegacyCodec.Decode(invalid); } catch (InvalidDataException) { rejected = true; }
    Require(rejected, "invalid encoding rejected");
}
Require(LegacyCodec.Gbk.GetString(LegacyCodec.Gbk.GetBytes("比奇省")) == "比奇省", "Chinese code page");
byte[] description = [..BitConverter.GetBytes(10485771u), ..BitConverter.GetBytes(7u)];
var namedActor = new LegacyPacket(10, 99, 296, 624, 3,
    [..LegacyCodec.Encode(description), ..LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("鸡/255"))]);
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(namedActor, "Test"))))
{
    var entity = projected.RootElement;
    Require(entity.GetProperty("name").GetString() == "鸡", "separately encoded entity name");
    Require(entity.GetProperty("nameColor").GetInt32() == 255, "entity name color from appearance string");
    Require(entity.GetProperty("kind").GetString() == "monster", "ordinary monster kind");
    Require(entity.GetProperty("feature").GetUInt32() == 10485771 && entity.GetProperty("x").GetInt32() == 296,
        "entity feature and position projection");
}
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(31, 99, 12, 20, 8, []), ""))))
{
    var health = projected.RootElement;
    Require(health.GetProperty("type").GetString() == "health" && health.GetProperty("hp").GetInt32() == 12
        && health.GetProperty("maxHp").GetInt32() == 20 && health.GetProperty("damage").GetInt32() == 8,
        "struck fields project as health and damage");
    Require(!health.TryGetProperty("x", out _), "damage HP fields are not positions");
}
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(11, 88, 291, 612, 0, []), ""))))
    Require(projected.RootElement.GetProperty("kind").ValueKind == JsonValueKind.Null,
        "unnamed movement update does not overwrite entity kind");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(
    new LegacyPacket(11, 88, 291, 612, 0, []), "", knownName: "变异骷髅(Test)", knownNameColor: 229))))
    Require(projected.RootElement.GetProperty("kind").GetString() == "slave"
        && projected.RootElement.GetProperty("name").GetString() == "变异骷髅(Test)",
        "cached summon identity is restored on unnamed movement");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(14, 99, 296, 624, 3, []), ""))))
    Require(projected.RootElement.GetProperty("action").GetString() == "attack"
        && projected.RootElement.GetProperty("direction").GetInt32() == 3, "attack action projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(44, 120, 5, 0, 0, []), ""))))
    Require(projected.RootElement.GetProperty("gained").GetUInt32() == 5
        && projected.RootElement.GetProperty("total").GetInt32() == 120, "experience projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(612, 0, 301, 611, 0, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "door"
        && projected.RootElement.GetProperty("open").GetBoolean()
        && projected.RootElement.GetProperty("x").GetInt32() == 301
        && projected.RootElement.GetProperty("y").GetInt32() == 611, "door open projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(614, 0, 301, 611, 0, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "door"
        && !projected.RootElement.GetProperty("open").GetBoolean(), "door close projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(659, 0, 1, 0, 0, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "groupMode"
        && projected.RootElement.GetProperty("enabled").GetBoolean(), "group mode projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(213, 6, 0, 0, 0, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "attackMode"
        && projected.RootElement.GetProperty("mode").GetInt32() == 6, "attack mode projection uses Recog");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(754, 0, 0, 0, 0, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "guildResult"
        && projected.RootElement.GetProperty("action").GetString() == "open"
        && !projected.RootElement.GetProperty("accepted").GetBoolean(), "guild no-membership projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(100, 0, 0, 0, 0,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("[沙巴克 攻城战已经开始]"))), ""))))
    Require(projected.RootElement.GetProperty("castleWar").GetProperty("phase").GetString() == "started"
        && projected.RootElement.GetProperty("castleWar").GetProperty("castleName").GetString() == "沙巴克",
        "castle war start system message projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(100, 0, 0, 0, 0,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("[沙巴克 攻城战离结束还有10分钟]"))), ""))))
    Require(projected.RootElement.GetProperty("castleWar").GetProperty("phase").GetString() == "warning"
        && projected.RootElement.GetProperty("castleWar").GetProperty("remainingMinutes").GetInt32() == 10,
        "castle war warning system message projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(100, 0, 0, 0, 0,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("[沙巴克 已被 攻城行会 占领]"))), ""))))
    Require(projected.RootElement.GetProperty("castleWar").GetProperty("phase").GetString() == "captured"
        && projected.RootElement.GetProperty("castleWar").GetProperty("guildName").GetString() == "攻城行会",
        "castle war capture system message projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(753, 0, 0, 0, 1,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("测试行会\r \r1\r<Notice>\r欢迎\r<KillGuilds>\r敌对行会\r<AllyGuilds>\r友好行会"))), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "guildInfo"
        && projected.RootElement.GetProperty("guildName").GetString() == "测试行会"
        && projected.RootElement.GetProperty("canManage").GetBoolean()
        && projected.RootElement.GetProperty("notice")[0].GetString() == "欢迎"
        && projected.RootElement.GetProperty("warGuilds")[0].GetString() == "敌对行会"
        && projected.RootElement.GetProperty("allyGuilds")[0].GetString() == "友好行会", "guild info projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(753, 0, 0, 0, 1,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("测试行会\r \r1\r<KillGuilds>\r+敌对行会 123000\r<AllyGuilds>\r+友好行会"))), ""))))
{
    var timers = projected.RootElement.GetProperty("warGuildTimers");
    Require(timers.GetArrayLength() == 1 && timers[0].GetProperty("name").GetString() == "敌对行会"
        && timers[0].GetProperty("remainingMs").GetInt64() == 123000
        && projected.RootElement.GetProperty("allyGuilds")[0].GetString() == "友好行会", "guild war timer projection");
}
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(756, 0, 0, 0, 1,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("#1/*掌门/WebCheck/#2/*成员/Tao905/"))), ""))))
{
    var members = projected.RootElement.GetProperty("members");
    Require(projected.RootElement.GetProperty("type").GetString() == "guildMembers"
        && members.GetArrayLength() == 2 && members[0].GetString() == "WebCheck" && members[1].GetString() == "Tao905",
        "guild members projection");
    var ranks = projected.RootElement.GetProperty("ranks");
    Require(ranks.GetArrayLength() == 2 && ranks[0].GetProperty("rankNo").GetInt32() == 1
        && ranks[0].GetProperty("rankName").GetString() == "掌门" && ranks[1].GetProperty("members")[0].GetString() == "Tao905",
        "guild rank groups projection");
}
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(768, 0, 0, 0, 0, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "guildResult"
        && projected.RootElement.GetProperty("action").GetString() == "ally"
        && projected.RootElement.GetProperty("accepted").GetBoolean(), "guild ally projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(763, -3, 0, 0, 0, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "guildResult"
        && projected.RootElement.GetProperty("action").GetString() == "create"
        && !projected.RootElement.GetProperty("accepted").GetBoolean()
        && projected.RootElement.GetProperty("reason").GetInt32() == -3, "guild create failure projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(762, 0, 0, 0, 0, []), ""))))
    Require(projected.RootElement.GetProperty("action").GetString() == "create"
        && projected.RootElement.GetProperty("accepted").GetBoolean(), "guild create success projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(661, -3, 0, 0, 0,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("Group905"))), ""))))
{
    var result = projected.RootElement;
    Require(result.GetProperty("type").GetString() == "groupResult"
        && result.GetProperty("action").GetString() == "create"
        && !result.GetProperty("accepted").GetBoolean()
        && result.GetProperty("reason").GetInt32() == -3
        && result.GetProperty("target").GetString() == "Group905", "group failure projection");
}
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(667, 0, 0, 0, 0,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("WebCheck/Group905/"))), ""))))
{
    var members = projected.RootElement.GetProperty("members");
    Require(projected.RootElement.GetProperty("type").GetString() == "groupMembers"
        && members.GetArrayLength() == 2
        && members[0].GetString() == "WebCheck"
        && members[1].GetString() == "Group905", "group members projection");
}
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(666, 0, 0, 0, 0, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "groupCancel", "group cancel projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(
    new LegacyPacket(40, 99, 0x0703, 0, 1, LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("测试角色:你好，比奇"))), ""))))
{
    var chat = projected.RootElement;
    Require(chat.GetProperty("type").GetString() == "chat" && chat.GetProperty("channel").GetString() == "local"
        && chat.GetProperty("senderId").GetInt32() == 99 && chat.GetProperty("text").GetString() == "测试角色:你好，比奇",
        "local chat projection");
    Require(chat.GetProperty("foreground").GetInt32() == 3 && chat.GetProperty("background").GetInt32() == 7,
        "chat colour projection");
}
Require(ChatCommand.Local(" 你好，比奇 ") == "你好，比奇", "local chat trims outer whitespace");
Require(ChatCommand.Build("shout", "准备出发", null) == "!准备出发", "shout chat command encoding");
Require(ChatCommand.Build("group", "跟上", null) == "!!跟上", "group chat command encoding");
Require(ChatCommand.Build("guild", "集合", null) == "!~集合", "guild chat command encoding");
Require(ChatCommand.Build("whisper", "你好", "WebCheck") == "/WebCheck 你好", "whisper chat command encoding");
foreach (string invalidChat in new[] { "", "/角色 私聊", "!喊话", "@命令", "有\n换行", new string('界', 91) })
{
    bool rejected = false;
    try { ChatCommand.Local(invalidChat); } catch (InvalidOperationException) { rejected = true; }
    Require(rejected, "unsafe or oversized local chat rejected");
}
foreach ((string channel, string? target) in new[] { ("whisper", (string?)""), ("whisper", "带 空格"), ("unknown", (string?)null) })
{
    bool rejected = false;
    try { ChatCommand.Build(channel, "测试", target); } catch (InvalidOperationException) { rejected = true; }
    Require(rejected, "invalid chat channel or target rejected");
}
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(34, 99, 296, 624, 4, []), ""))))
    Require(projected.RootElement.GetProperty("x").GetInt32() == 296
        && projected.RootElement.GetProperty("direction").GetInt32() == 4, "death position projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(27, 99, 289, 618, 6, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "entityAlive"
        && projected.RootElement.GetProperty("x").GetInt32() == 289
        && projected.RootElement.GetProperty("y").GetInt32() == 618
        && projected.RootElement.GetProperty("direction").GetInt32() == 6, "revival position projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(50, 12, 300, 600, 2, LegacyCodec.Encode([..description, ..new byte[8]])), "Test"))))
    Require(projected.RootElement.GetProperty("self").GetBoolean(), "logon identifies the player");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(801, 12, 152, 362, 5, LegacyCodec.Encode(description)), "Test", 12))))
{
    var entity = projected.RootElement;
    Require(entity.GetProperty("self").GetBoolean() && entity.GetProperty("name").GetString() == "Test",
        "space move show identifies the current player");
    Require(entity.GetProperty("x").GetInt32() == 152 && entity.GetProperty("y").GetInt32() == 362
        && entity.GetProperty("feature").GetUInt32() == 10485771,
        "space move show projects position and appearance");
}
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(800, 12, 0, 0, 0, []), "Test", 12))))
    Require(projected.RootElement.GetProperty("type").GetString() == "entityRemoved", "space move hide removes the prior entity");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(656, 99, 254, 0, 0, []), ""))))
    Require(projected.RootElement.GetProperty("type").GetString() == "nameColor"
        && projected.RootElement.GetProperty("id").GetInt32() == 99
        && projected.RootElement.GetProperty("color").GetInt32() == 254, "summon name color packet");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(42, 99, 249, 0, 0, LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("变异骷髅"))), ""))))
    Require(projected.RootElement.GetProperty("name").GetString() == "变异骷髅"
        && projected.RootElement.GetProperty("nameColor").GetInt32() == 249
        && projected.RootElement.GetProperty("kind").GetString() == "slave", "username packet carries palette color");
var slaveActor = new LegacyPacket(10, 88, 290, 616, 0,
    [..LegacyCodec.Encode(description), ..LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("变异骷髅/254"))]);
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(slaveActor, "Test"))))
    Require(projected.RootElement.GetProperty("kind").GetString() == "slave"
        && projected.RootElement.GetProperty("nameColor").GetInt32() == 254, "summon appearance uses slave kind");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(WorldProjection.Project(new LegacyPacket(42, 100, 0xE5, 0, 0,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("变异骷髅(Test)"))), ""))))
    Require(projected.RootElement.GetProperty("kind").GetString() == "slave"
        && projected.RootElement.GetProperty("nameColor").GetInt32() == 229, "higher-level summon name suffix uses slave kind");
using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
byte[] nativeItem = Convert.FromHexString(File.ReadAllText("tests/fixtures/native-client-item.hex").Trim());
var item = InventoryProjection.Parse(nativeItem);
Require(item.name == "鸡肉" && item.makeIndex == 0x12345678 && item.durability == 1234 && item.maxDurability == 4000,
    "native ClientItem identity and durability projection");
byte[] statsItem = (byte[])nativeItem.Clone();
statsItem[26] = 2; statsItem[27] = 5; statsItem[37] = 7; BitConverter.GetBytes(1234).CopyTo(statsItem, 40); statsItem[50] = 3;
var detailedItem = InventoryProjection.Parse(statsItem);
Require(detailedItem.ac.min == 2 && detailedItem.ac.max == 5 && detailedItem.needLevel == 7
    && detailedItem.price == 1234 && detailedItem.accuracy == 3, "native ClientItem tooltip attributes projection");
byte[] secondItem = (byte[])nativeItem.Clone();
BitConverter.GetBytes(99).CopyTo(secondItem, 100);
var bagPacket = new LegacyPacket(201, 0, 0, 0, 2, [..LegacyCodec.Encode(nativeItem), (byte)'/', ..LegacyCodec.Encode(secondItem), (byte)'/']);
using (var bag = JsonDocument.Parse(JsonSerializer.Serialize(InventoryProjection.Project(bagPacket))))
    Require(bag.RootElement.GetProperty("items").GetArrayLength() == 2, "independently encoded bag records");
using (var removed = JsonDocument.Parse(JsonSerializer.Serialize(InventoryProjection.Project(
    new LegacyPacket(202, 321, 0, 0, 1, LegacyCodec.Encode(nativeItem))))))
    Require(removed.RootElement.GetProperty("makeIndex").GetInt32() == 0x12345678,
        "item removal projection reads instance identity from the item body");
bool badCount = false;
try { InventoryProjection.Project(bagPacket with { Series = 3 }); } catch (InvalidDataException) { badCount = true; }
Require(badCount, "bag count mismatch rejected");
var equipmentPacket = new LegacyPacket(621, 0, 0, 0, 0,
    [.."1/"u8, ..LegacyCodec.Encode(nativeItem), (byte)'/', .."4/"u8, ..LegacyCodec.Encode(secondItem), (byte)'/']);
var equipment = InventoryProjection.ParseEquipment(equipmentPacket);
Require(equipment.Count == 2 && equipment[1].makeIndex == 0x12345678 && equipment[4].makeIndex == 99,
    "mixed slot and independently encoded equipment records");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(InventoryProjection.Project(equipmentPacket))))
    Require(projected.RootElement.GetProperty("slots").GetArrayLength() == 2, "equipment snapshot projection");
bool badSlot = false;
try { InventoryProjection.ParseEquipment(equipmentPacket with { EncodedBody = [.."13/"u8, ..LegacyCodec.Encode(nativeItem), (byte)'/'] }); }
catch (InvalidDataException) { badSlot = true; }
Require(badSlot, "invalid equipment slot rejected");
byte[] abilityBody = Convert.FromHexString("020000000000010100000000180012001800120000000000000000000F0000000E003300000F000C");
var abilityPacket = new LegacyPacket(52, 321, 0x6300, 7, 0, LegacyCodec.Encode(abilityBody));
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(CharacterProjection.Project(abilityPacket))))
{
    var attributes = projected.RootElement;
    Require(attributes.GetProperty("level").GetInt32() == 2 && attributes.GetProperty("job").GetInt32() == 0,
        "level and job ability projection");
    Require(attributes.GetProperty("hp").GetInt32() == 24 && attributes.GetProperty("mp").GetInt32() == 18
        && attributes.GetProperty("maxHp").GetInt32() == 24 && attributes.GetProperty("maxMp").GetInt32() == 18,
        "HP and MP ability projection");
    Require(attributes.GetProperty("dc").GetProperty("min").GetInt32() == 1
        && attributes.GetProperty("dc").GetProperty("max").GetInt32() == 1,
        "packed ability range projection");
    Require(attributes.GetProperty("maxExperience").GetInt32() == 15
        && attributes.GetProperty("maxWeight").GetInt32() == 51 && attributes.GetProperty("maxHandWeight").GetInt32() == 12,
        "experience and weight ability projection");
}
bool badAbility = false;
try { CharacterProjection.Project(abilityPacket with { EncodedBody = LegacyCodec.Encode(abilityBody[..39]) }); }
catch (InvalidDataException) { badAbility = true; }
Require(badAbility, "invalid ability layout rejected");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(CharacterProjection.Project(new LegacyPacket(752, unchecked((int)0x04030201), 0x0605, 0x0807, 0x0a09, [])))))
{
    var secondary = projected.RootElement;
    Require(secondary.GetProperty("antiMagic").GetInt32() == 1 && secondary.GetProperty("reduceDamage").GetInt32() == 4
        && secondary.GetProperty("hit").GetInt32() == 5 && secondary.GetProperty("spellRecover").GetInt32() == 10,
        "secondary ability byte projection");
}
byte[] registration = AccountRegistration.EncodeBody("webtest1", "pass1234");
Require(registration.Length > 198, "registration contains both independently encoded records");
byte[] registrationPrimary = LegacyCodec.Decode(registration.AsSpan(0, 198));
Require(registrationPrimary.Length == 148 && registrationPrimary[0] == 8
    && LegacyCodec.Gbk.GetString(registrationPrimary.AsSpan(1, 8)) == "webtest1" && registrationPrimary[11] == 8,
    "registration primary fixed Pascal fields");
Require(AccountRegistration.Pascal("比奇", 10).Length == 11 && AccountRegistration.Pascal("比奇", 10)[0] == 4,
    "registration Pascal field uses GBK byte length");
var dialoguePacket = new LegacyPacket(643, 77, 0, 0, 1, LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("边界老兵/欢迎来到比奇\\<查看奖励/@jiangli>\\<返回/@main>")));
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(NpcProjection.Project(dialoguePacket))))
{
    var dialogue = projected.RootElement;
    Require(dialogue.GetProperty("npcName").GetString() == "边界老兵" && dialogue.GetProperty("text").GetString()!.Contains("欢迎来到比奇"),
        "NPC dialogue name and text projection");
    Require(dialogue.GetProperty("options").GetArrayLength() == 2
        && dialogue.GetProperty("options")[0].GetProperty("command").GetString() == "@jiangli",
        "NPC dialogue options projection");
}
var inputDialoguePacket = new LegacyPacket(643, 77, 0, 0, 1,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("衣服/请告诉我暗号\\<输入暗号/@@InPutString8>")));
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(NpcProjection.Project(inputDialoguePacket))))
{
    var option = projected.RootElement.GetProperty("options")[0];
    Require(option.GetProperty("input").GetBoolean() && option.GetProperty("command").GetString() == "@@InPutString8",
        "NPC input dialogue option projection");
}
var questDialogue = new LegacyPacket(772, 77, 0, 0, 1,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("任务标记QMARK|p0-trial|accepted|比奇试炼|收集 1 个鸡肉|击杀比奇省的鸡|试炼已开始。|END\\返回")));
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(NpcProjection.Project(questDialogue))))
{
    var dialogue = projected.RootElement;
    Require(dialogue.GetProperty("type").GetString() == "dialogueMessage"
        && dialogue.GetProperty("text").GetString()!.Contains("返回")
        && dialogue.GetProperty("quest").GetProperty("id").GetString() == "p0-trial"
        && dialogue.GetProperty("quest").GetProperty("status").GetString() == "accepted",
        "NPC quest marker projection");
}
var multiQuestDialogue = new LegacyPacket(772, 77, 0, 0, 1,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("任务标记QMARK|p0-trial|accepted|比奇试炼|收集鸡肉|击杀鸡|进行中|END\\任务标记QMARK|p0-deer|available|猎人试炼|收集鹿肉|击杀鹿|可接取|END")));
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(NpcProjection.Project(multiQuestDialogue))))
{
    var quests = projected.RootElement.GetProperty("quests");
    Require(quests.GetArrayLength() == 2 && quests[1].GetProperty("id").GetString() == "p0-deer"
        && projected.RootElement.GetProperty("text").GetString()!.Contains("任务标记"), "multiple quest marker projection");
}
var goodsPacket = new LegacyPacket(645, 77, 2, 0, 0,
    LegacyCodec.Encode(LegacyCodec.Gbk.GetBytes("小量金创药/0/88/12/木剑/1/440/3/")));
var goods = ShopProjection.ParseGoods(goodsPacket);
Require(goods.Length == 2 && goods[0].name == "小量金创药" && goods[0].price == 88 && goods[1].subMenu == 1,
    "shop catalogue projection");
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(ShopProjection.Project(goodsPacket))))
    Require(projected.RootElement.GetProperty("npcId").GetInt32() == 77
        && projected.RootElement.GetProperty("items").GetArrayLength() == 2, "shop envelope projection");
byte[] shopNativeItem = (byte[])nativeItem.Clone();
BitConverter.GetBytes(4567).CopyTo(shopNativeItem, 100);
BitConverter.GetBytes((ushort)440).CopyTo(shopNativeItem, 106);
byte[] encodedShopRecord = [..LegacyCodec.Encode(shopNativeItem), (byte)'/'];
var detailPacket = new LegacyPacket(652, 77, 1, 0, 0, LegacyCodec.Encode(encodedShopRecord));
var details = ShopProjection.ParseDetails(detailPacket);
Require(details.Length == 1 && details[0].makeIndex == 4567 && details[0].price == 440
    && details[0].name == "鸡肉", "independently encoded shop detail projection");
bool badGoodsCount = false;
try { ShopProjection.ParseGoods(goodsPacket with { Param = 3 }); } catch (InvalidDataException) { badGoodsCount = true; }
Require(badGoodsCount, "shop catalogue count mismatch rejected");
var storagePacket = new LegacyPacket(704, 88, 0, 0, 0,
    [..LegacyCodec.Encode(nativeItem), (byte)'/', ..LegacyCodec.Encode(secondItem), (byte)'/']);
var storedItems = StorageProjection.ParseItems(storagePacket);
Require(storedItems.Length == 2 && storedItems[0].makeIndex == 0x12345678 && storedItems[1].makeIndex == 99,
    "independently encoded storage item page");
bool badStoragePage = false;
try { StorageProjection.ParseItems(storagePacket with { Tag = 1 }); } catch (InvalidDataException) { badStoragePage = true; }
Require(badStoragePage, "invalid storage page rejected");
byte[] fireball = new byte[84];
fireball[0] = (byte)'F';
fireball[1] = 1;
BitConverter.GetBytes(23).CopyTo(fireball, 4);
BitConverter.GetBytes((ushort)1).CopyTo(fireball, 8);
byte[] fireballName = LegacyCodec.Gbk.GetBytes("火球术");
fireball[10] = (byte)fireballName.Length;
fireballName.CopyTo(fireball, 11);
fireball[25] = 4;
fireball[26] = 5;
BitConverter.GetBytes((ushort)4).CopyTo(fireball, 28);
BitConverter.GetBytes((ushort)2).CopyTo(fireball, 30);
new byte[] { 7, 11, 16, 0 }.CopyTo(fireball, 32);
new int[] { 100, 200, 300, 0 }.SelectMany(BitConverter.GetBytes).ToArray().CopyTo(fireball, 36);
fireball[53] = 1;
BitConverter.GetBytes(550).CopyTo(fireball, 56);
fireball[60] = 1;
fireball[61] = 2;
BitConverter.GetBytes((ushort)9).CopyTo(fireball, 62);
fireball[64] = 3;
byte[] fireballDescription = LegacyCodec.Gbk.GetBytes("基础火焰魔法");
fireball[65] = (byte)fireballDescription.Length;
fireballDescription.CopyTo(fireball, 66);
var parsedMagic = MagicProjection.Parse(fireball);
Require(parsedMagic.magicId == 1 && parsedMagic.name == "火球术" && parsedMagic.currentTrain == 23
    && parsedMagic.trainLevels.SequenceEqual(new byte[] { 7, 11, 16, 0 })
    && parsedMagic.maxTrain.SequenceEqual(new int[] { 100, 200, 300, 0 })
    && parsedMagic.description == "基础火焰魔法", "native ClientMagic layout projection");
byte[] healing = (byte[])fireball.Clone();
BitConverter.GetBytes((ushort)2).CopyTo(healing, 8);
byte[] healingName = LegacyCodec.Gbk.GetBytes("治愈术");
healing[10] = (byte)healingName.Length;
Array.Clear(healing, 11, 14);
healingName.CopyTo(healing, 11);
var magicListPacket = new LegacyPacket(211, 0, 0, 0, 2,
    [..LegacyCodec.Encode(fireball), (byte)'/', ..LegacyCodec.Encode(healing), (byte)'/']);
var magicList = MagicProjection.ParseList(magicListPacket);
Require(magicList.Length == 2 && magicList[0].magicId == 1 && magicList[1].name == "治愈术",
    "independently encoded magic records");
bool badMagicCount = false;
try { MagicProjection.ParseList(magicListPacket with { Series = 3 }); } catch (InvalidDataException) { badMagicCount = true; }
Require(badMagicCount, "magic count mismatch rejected");
var magicEffectPacket = new LegacyPacket(638, 91, 301, 611, 0x0504,
    LegacyCodec.Encode(BitConverter.GetBytes(92)));
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(MagicProjection.Project(magicEffectPacket))))
{
    var effect = projected.RootElement;
    Require(effect.GetProperty("casterId").GetInt32() == 91 && effect.GetProperty("targetId").GetInt32() == 92
        && effect.GetProperty("effectType").GetInt32() == 4 && effect.GetProperty("effect").GetInt32() == 5,
        "magic effect projection");
}
var spellCastPacket = new LegacyPacket(17, 91, 301, 611, 1, "11"u8.ToArray());
using (var projected = JsonDocument.Parse(JsonSerializer.Serialize(MagicProjection.Project(spellCastPacket))))
{
    var spell = projected.RootElement;
    Require(spell.GetProperty("type").GetString() == "spellCast"
        && spell.GetProperty("magicId").GetInt32() == 11,
        "plain ASCII spell cast projection");
}
var listener = new TcpListener(IPAddress.Loopback, 0);
listener.Start();
try
{
    using var connection = new LegacyConnection();
    var connect = connection.Connect("127.0.0.1", ((IPEndPoint)listener.LocalEndpoint).Port, timeout.Token);
    using var peer = await listener.AcceptTcpClientAsync(timeout.Token);
    await connect;
    byte[] payload = [(byte)'#', ..LegacyCodec.Header(51, param: 700, tag: 700), ..LegacyCodec.Encode("0"u8), (byte)'!'];
    var reading = connection.Receive(timeout.Token);
    await peer.GetStream().WriteAsync(payload.AsMemory(0, 7), timeout.Token);
    Require(!reading.IsCompleted, "partial TCP frame does not emit a packet");
    byte[] tail = [..payload[7..], .."#+GD/1!"u8.ToArray(), ..payload];
    await peer.GetStream().WriteAsync(tail, timeout.Token);
    var first = await reading;
    Require(first.Id == 51 && first.Text == "0" && first.Param == 700, "split frame parsed");
    Require((await connection.Receive(timeout.Token)).Status == "+GD/1", "coalesced status frame parsed");
    Require((await connection.Receive(timeout.Token)).Id == 51, "coalesced third frame retained");
}
finally { listener.Stop(); }

var actionSocket = new RecorderSocket();
using (var actionSession = new GatewaySession(actionSocket))
using (var actionListener = new TcpListener(IPAddress.Loopback, 0))
using (var actionTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(10)))
{
    actionListener.Start();
    var flags = BindingFlags.NonPublic | BindingFlags.Instance;
    var sessionType = typeof(GatewaySession);
    void Set(string name, object value) => sessionType.GetField(name, flags)!.SetValue(actionSession, value);
    object? Get(string name) => sessionType.GetField(name, flags)!.GetValue(actionSession);
    var game = (LegacyConnection)Get("game")!;
    var connect = game.Connect("127.0.0.1", ((IPEndPoint)actionListener.LocalEndpoint).Port, actionTimeout.Token);
    using var peer = await actionListener.AcceptTcpClientAsync(actionTimeout.Token);
    await connect;
    Set("phase", "world");
    Set("confirmedPosition", ((ushort)10, (ushort)10));
    Set("pendingAttack", true);
    Set("pendingActionId", (long?)41);
    Set("pendingActionKind", "attack");
    Set("playerActorId", 7);
    var reading = (Task)sessionType.GetMethod("ReadGame", flags)!.Invoke(actionSession, [actionTimeout])!;

    await peer.GetStream().WriteAsync("#+GD/1!"u8.ToArray(), actionTimeout.Token);
    await actionSocket.WaitForCount(2, actionTimeout.Token);
    Require((ValueTuple<ushort, ushort>?)Get("confirmedPosition") == ((ushort)10, (ushort)10),
        "attack acknowledgement does not alter movement coordinates");
    Require(!(bool)Get("pendingAttack")!, "attack acknowledgement clears the attack action");
    Require(actionSocket.Contains("\"type\":\"actionResult\"", "\"actionId\":41", "\"kind\":\"attack\"", "\"accepted\":true"),
        "attack acknowledgement carries its browser action identity");

    Set("pendingPosition", ((ushort)11, (ushort)10));
    Set("pendingActionId", (long?)42);
    Set("pendingActionKind", "move");
    byte[] rejected = [(byte)'#', ..LegacyCodec.Header(28, recog: 7, param: 10, tag: 10, series: 2), (byte)'!'];
    await peer.GetStream().WriteAsync(rejected, actionTimeout.Token);
    await actionSocket.WaitForCount(4, actionTimeout.Token);
    Require((ValueTuple<ushort, ushort>?)Get("confirmedPosition") == ((ushort)10, (ushort)10),
        "movement rejection restores the authoritative position");
    Require(Get("pendingPosition") is null, "movement rejection clears the pending position");
    Require(actionSocket.Contains("\"type\":\"actionResult\"", "\"actionId\":42", "\"kind\":\"move\"", "\"accepted\":false"),
        "movement rejection carries its browser action identity");

    await actionTimeout.CancelAsync();
    try { await reading; } catch (OperationCanceledException) { }
}
Console.WriteLine("PASS gateway codec vectors, 1024 payload lengths, GBK, split/coalesced TCP frames and action confirmation ordering");

sealed class RecorderSocket : WebSocket
{
    private readonly ConcurrentQueue<string> messages = new();
    public override WebSocketCloseStatus? CloseStatus => null;
    public override string? CloseStatusDescription => null;
    public override WebSocketState State => WebSocketState.Open;
    public override string? SubProtocol => null;
    public override void Abort() { }
    public override Task CloseAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) => Task.CompletedTask;
    public override Task CloseOutputAsync(WebSocketCloseStatus closeStatus, string? statusDescription, CancellationToken cancellationToken) => Task.CompletedTask;
    public override void Dispose() { }
    public override Task<WebSocketReceiveResult> ReceiveAsync(ArraySegment<byte> buffer, CancellationToken cancellationToken) => throw new NotSupportedException();
    public override Task SendAsync(ArraySegment<byte> buffer, WebSocketMessageType messageType, bool endOfMessage, CancellationToken cancellationToken)
    {
        messages.Enqueue(System.Text.Encoding.UTF8.GetString(buffer));
        return Task.CompletedTask;
    }
    public async Task WaitForCount(int count, CancellationToken cancellationToken)
    {
        while (messages.Count < count) await Task.Delay(10, cancellationToken);
    }
    public bool Contains(params string[] fragments) => messages.Any(message => fragments.All(message.Contains));
}
