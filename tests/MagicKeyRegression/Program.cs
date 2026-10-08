using System.Buffers.Binary;
using Mir2.WebGateway;

static MagicSkill Skill(ushort id, byte key) =>
    new(key, 1, 0, id, $"Skill{id}", 0, 0, 0, 0, [], [], 0, 0, 0, 0, 0, 0, "");

static void Check(bool result, string message)
{
    if (!result) throw new Exception(message);
}

static void Reject(Action action)
{
    try { action(); }
    catch (InvalidDataException) { return; }
    catch (InvalidOperationException) { return; }
    throw new Exception("Invalid magic key request was accepted");
}

var learned = new[] { Skill(1, 49), Skill(2, 50), Skill(7, 0) };
foreach (int key in new[] { 0, 49, 50, 51, 52, 53, 54, 55, 56 })
{
    MagicKeyChange change = MagicKeyBinding.Validate(7, key, learned);
    byte[] header = LegacyCodec.Decode(MagicKeyBinding.Header(change));
    Check(BinaryPrimitives.ReadInt32LittleEndian(header) == 7, "magic id must be Recog");
    Check(BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(4)) == 1008, "wrong opcode");
    Check(BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(6)) == key, "key must be Param");
    Check(BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(8)) == 0, "Tag/Series must be zero");
    Check(LegacyCodec.Decode(LegacyCodec.Encode(header)).SequenceEqual(header), "legacy encoding drift");
}
Console.WriteLine("PASS None/F1-F8 encoded headers decode to original magic id and ASCII key fields");

foreach (int key in new[] { -1, 1, 8, 48, 57, 256 })
    Reject(() => MagicKeyBinding.Validate(7, key, learned));
foreach (int id in new[] { -1, 0, 999, 65536 })
    Reject(() => MagicKeyBinding.Validate(id, 49, learned));
Reject(() => MagicKeyBinding.Validate(7, 49, [Skill(7, 0), Skill(7, 0)]));
Reject(() => MagicKeyBinding.Header(new(7, 8)));
Reject(() => MagicKeyBinding.Header(new(0, 49)));
Console.WriteLine("PASS only uniquely learned skills and original ASCII keys pass validation");

MagicKeyChange binding = MagicKeyBinding.Validate(7, 50, learned);
Check(!MagicKeyBinding.SnapshotConfirms(binding, learned), "old snapshot confirms a new intent");
Check(!MagicKeyBinding.SnapshotConfirms(binding, [Skill(1, 49), Skill(2, 50), Skill(7, 50)]),
    "occupied slot was not cleared");
Check(!MagicKeyBinding.SnapshotConfirms(binding, [Skill(1, 49), Skill(2, 0)]),
    "missing learned target confirms");
Check(!MagicKeyBinding.SnapshotConfirms(binding, [Skill(7, 50), Skill(7, 50)]),
    "duplicate target confirms");
Check(MagicKeyBinding.SnapshotConfirms(binding, [Skill(1, 49), Skill(2, 0), Skill(7, 50)]),
    "authoritative replacement snapshot does not confirm");
Check(MagicKeyBinding.SnapshotConfirms(new(7, 0), [Skill(1, 0), Skill(2, 0), Skill(7, 0)]),
    "None may be shared by unassigned skills");
Check(learned[1].key == 50 && learned[2].key == 0, "validation changed confirmed skills");
Console.WriteLine("PASS only actual target-key and cleared-conflict snapshots confirm; validation is immutable");
