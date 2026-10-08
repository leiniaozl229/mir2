using System.Data;
using System.Data.Common;
using System.Reflection;
using System.Text.RegularExpressions;
using DBSrv.Storage;
using DBSrv.Storage.MySQL;
using MySqlConnector;
using OpenMir2;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using Serilog;

// This program has no connection string, configuration file, schema creation or
// SQL connection. It references the actual storage assembly; only its database
// execution/transaction boundary is substituted. It does not prove SQL durability.
if (args.Length != 0) throw new ArgumentException("This regression accepts no database settings.");
LogService.Logger = new LoggerConfiguration().CreateLogger();
int passed = 0;
void Check(bool value, string message) { if (!value) throw new Exception(message); }
void Test(string name, Action run)
{
    run();
    passed++;
    Console.WriteLine("PASS: " + name);
}

CharacterDataInfo Record()
{
    var r = new CharacterDataInfo();
    var header = r.Header;
    header.Name = "isolated-storage-fixture";
    r.Header = header;
    r.Data.ChrName = r.Header.Name;
    r.Data.Account = "isolated-no-account";
    r.Data.Gold = 4321;
    r.Data.CurMap = "0";
    r.Data.HomeMap = "0";
    r.Data.MasterName = r.Data.DearName = r.Data.StoragePwd = "";
    foreach (var slots in new[] { r.Data.HumItems, r.Data.BagItems, r.Data.StorageItems })
    {
        for (int i = 0; i < slots.Length; i++) slots[i] = new ServerUserItem();
        int family = slots.Length;
        slots[0] = new ServerUserItem { MakeIndex = 1000 + family, Index = 42, Dura = 123, DuraMax = 456 };
        slots[0].Desc[2] = 7;
    }
    for (int i = 0; i < r.Data.Magic.Length; i++) r.Data.Magic[i] = new MagicRcd();
    r.Data.Magic[0] = new MagicRcd { MagIdx = 7, Level = 1, MagicKey = '2', TranPoint = 3 };
    r.Data.QuestUnitOpen[0] = 1;
    r.Data.QuestFlag[1] = 2;
    r.Data.QuestUnit[2] = 3;
    return r;
}

Test("actual StorageContext refuses begin/commit without an open transaction", () =>
{
    using var context = new StorageContext(new StorageOption { ConnectionString = "" });
    bool beginFailed = false, commitFailed = false;
    try { context.BeginTransaction(); } catch (InvalidOperationException) { beginFailed = true; }
    try { context.Commit(); } catch (InvalidOperationException) { commitFailed = true; }
    Check(beginFailed && commitFailed, "missing transaction must not succeed silently");
    context.RollBack();
    context.Dispose(); // cleanup is idempotent even before an open.
});

Test("actual StorageContext invalid connection settings return false without connecting", () =>
{
    using var context = new StorageContext(new StorageOption { ConnectionString = "UnknownStorageOption=1" });
    bool opened = true;
    context.Open(ref opened);
    Check(!opened, "invalid connection settings must reset success");
});

List<Statement> successfulUpdate = [];
Test("actual Update commits every save family and preserves instance/quest parameters", () =>
{
    var context = new FixtureContext();
    var storage = new FixtureStorage(context, knownCharacter: true);
    Check(storage.Update(Record().Header.Name, Record()), "valid update failed");
    Check(context.CommitCalls == 1 && context.RollbackCalls == 0 && context.DisposeCalls == 1, "success transaction lifecycle changed");
    Check(context.Committed.Count > 0 && context.Pending.Count == 0, "success did not commit the staged commands");
    successfulUpdate.AddRange(context.Commands);
    foreach (string table in new[] { "characters", "characters_ablity", "characters_item", "characters_bagitem", "characters_storageitem", "characters_item_attr", "characters_magic", "characters_bonusability", "characters_status", "characters_quest" })
        Check(context.Commands.Any(s => s.Table == table), "missing save family " + table);
    Check(context.Commands[0].Parameters["@Gold"].Equals(4321), "gold parameter changed");
    foreach (var attrs in context.Commands.Where(s => s.Table == "characters_item_attr" && s.Sql.StartsWith("INSERT")))
        Check(attrs.Parameters.Count == 16 && attrs.Parameters["@Value2"].Equals((byte)7), "instance attributes changed");
    var quest = context.Commands.Single(s => s.Table == "characters_quest" && s.Sql.StartsWith("INSERT"));
    Check(Convert.FromBase64String((string)quest.Parameters["@QuestOpen"])[0] == 1
        && Convert.FromBase64String((string)quest.Parameters["@QuestFlag"])[1] == 2
        && Convert.FromBase64String((string)quest.Parameters["@QuestUnit"])[2] == 3, "quest serialization changed");
});

for (int ordinal = 1; ordinal <= successfulUpdate.Count; ordinal++)
{
    int failure = ordinal;
    string table = successfulUpdate[ordinal - 1].Table;
    Test($"actual Update write {failure}/{successfulUpdate.Count} {table} failure rolls back", () =>
    {
        var context = new FixtureContext { FailWrite = failure };
        var storage = new FixtureStorage(context, knownCharacter: true);
        Check(!storage.Update(Record().Header.Name, Record()), "failed child write returned true");
        Check(context.Commands.Count == failure, "later child commands executed after failure");
        Check(context.CommitCalls == 0 && context.RollbackCalls == 1 && context.DisposeCalls == 1, "failure lifecycle must rollback once and never commit");
        Check(context.Committed.SequenceEqual(new[] { "original-snapshot" }) && context.Pending.Count == 0, "failed update exposed staged changes");
    });
}

foreach (string table in new[] { "characters_item", "characters_bagitem", "characters_storageitem" })
{
    Test("actual Update strict old-slot read failure: " + table, () =>
    {
        var context = new FixtureContext { FailReadTable = table };
        Check(!new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "slot read failure returned true");
        Check(context.ReadTables.Last() == table && context.CommitCalls == 0 && context.RollbackCalls == 1, "failed slot read was ignored");
    });
}

Test("actual Update malformed old slot data aborts instead of committing a partial snapshot", () =>
{
    var context = new FixtureContext { InvalidPositionTable = "characters_bagitem" };
    Check(!new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "invalid old slot returned true");
    Check(context.CommitCalls == 0 && context.RollbackCalls == 1, "malformed slot did not rollback");
});

Test("actual Update keeps legal zero affected-row writes successful", () =>
{
    var context = new FixtureContext { AffectedRows = 0 };
    Check(new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "zero affected rows became an error");
    Check(context.CommitCalls == 1, "zero affected rows skipped commit");
});

Test("actual Update empty skill set still commits its deletion and subsequent save families", () =>
{
    var context = new FixtureContext();
    var r = Record();
    r.Data.Magic = [];
    Check(new FixtureStorage(context, true).Update(r.Header.Name, r), "empty skills failed");
    Check(context.Commands.Count(s => s.Table == "characters_magic") == 1
        && context.Commands.Any(s => s.Table == "characters_quest") && context.CommitCalls == 1, "empty skills changed delete/continue behavior");
});

Test("actual Update invalid instance-attribute length continues to propagate and rollback", () =>
{
    var context = new FixtureContext();
    var r = Record();
    r.Data.HumItems[0].Desc = [1];
    Check(!new FixtureStorage(context, true).Update(r.Header.Name, r), "invalid item attribute length succeeded");
    Check(context.CommitCalls == 0 && context.RollbackCalls == 1, "attribute serialization failure did not rollback");
});

foreach (string phase in new[] { "open-false", "open-throw", "begin", "commit", "rollback", "dispose" })
{
    Test("actual Update boundary failure remains false: " + phase, () =>
    {
        var context = new FixtureContext { FailPhase = phase, FailWrite = phase == "rollback" ? 2 : 0 };
        Check(!new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "boundary failure returned true");
        Check(context.DisposeCalls == 1, "boundary failure did not cleanup once");
        if (phase is "open-false" or "open-throw" or "begin") Check(context.Commands.Count == 0, "writes preceded a valid begin");
        if (phase != "dispose") Check(context.Committed.SequenceEqual(new[] { "original-snapshot" }), "failure committed writes");
        if (phase == "commit") Check(context.RollbackCalls == 1 && context.Pending.Count == 0, "commit failure did not attempt rollback");
    });
}

Test("actual Update rejects unknown character without opening storage", () =>
{
    var context = new FixtureContext();
    Check(!new FixtureStorage(context, false).Update(Record().Header.Name, Record()), "unknown character updated");
    Check(context.OpenCalls == 0 && context.Commands.Count == 0, "unknown character reached SQL");
});

foreach (string fault in new[]
{
    "characters:missing", "characters_ablity:missing", "characters_status:missing",
    "characters:id", "characters:name", "characters:account", "characters:deleted",
    "characters:null-deleted", "characters:duplicate", "characters_ablity:id", "characters_status:id"
})
{
    Test("actual Update stale quick map or corrupt required row is rejected before any write: " + fault, () =>
    {
        var context = new FixtureContext { IntegrityFault = fault };
        var storage = new FixtureStorage(context, true);
        Check(!storage.Update(Record().Header.Name, Record()), "invalid required save row returned true");
        Check(context.Commands.Count == 0 && context.CommitCalls == 0 && context.RollbackCalls == 1, "integrity failure wrote or committed data");
        Check(context.Committed.SequenceEqual(new[] { "original-snapshot" }), "integrity failure changed the committed snapshot");
    });
}

foreach (string table in new[] { "characters", "characters_ablity", "characters_status" })
{
    Test("actual Update required row locking query error cannot be acknowledged: " + table, () =>
    {
        var context = new FixtureContext { FailReadTable = table };
        Check(!new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "failed integrity query returned true");
        Check(context.Commands.Count == 0 && context.CommitCalls == 0 && context.RollbackCalls == 1, "failed integrity query reached writes");
    });
}

foreach (string field in new[] { "header", "data-name", "empty-account" })
{
    Test("actual Update snapshot identity mismatch is rejected before SQL: " + field, () =>
    {
        var r = Record();
        string key = r.Header.Name;
        if (field == "header") { var header = r.Header; header.Name = "different-name"; r.Header = header; }
        if (field == "data-name") r.Data.ChrName = "different-name";
        if (field == "empty-account") r.Data.Account = "";
        var context = new FixtureContext();
        Check(!new FixtureStorage(context, true).Update(key, r), "mismatched snapshot identity succeeded");
        Check(context.Commands.Count == 0 && context.ReadTables.Count == 0 && context.RollbackCalls == 1, "invalid snapshot reached SQL");
    });
}

Test("actual Update required locks use a fixed transaction-local order and preserve case-insensitive identity", () =>
{
    var r = Record();
    string key = r.Header.Name;
    var header = r.Header; header.Name = header.Name.ToUpperInvariant(); r.Header = header;
    r.Data.ChrName = r.Data.ChrName.ToUpperInvariant();
    r.Data.Account = r.Data.Account.ToUpperInvariant();
    var context = new FixtureContext();
    Check(new FixtureStorage(context, true).Update(key, r), "case-only identity difference was rejected");
    Check(context.ReadTables.Take(3).SequenceEqual(new[] { "characters", "characters_ablity", "characters_status" }), "required row lock order changed");
    Check(context.CommitCalls == 1 && context.DisposeCalls == 1, "required locks escaped the normal transaction lifecycle");
});

Test("actual bonus save uses a parameterized full snapshot upsert", () =>
{
    var context = new FixtureContext();
    Check(new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "bonus upsert failed");
    var bonus = context.Commands.Single(s => s.Table == "characters_bonusability");
    Check(bonus.Sql.StartsWith("INSERT", StringComparison.Ordinal) && bonus.Sql.Contains("ON DUPLICATE KEY UPDATE")
        && bonus.Parameters.Count == 11 && bonus.Parameters.ContainsKey("@RESERVED"), "bonus snapshot still depends on a preexisting row");
});

foreach (var (table, family) in new[] { ("characters_item", 13), ("characters_bagitem", 46), ("characters_storageitem", 50) })
{
    Test("actual missing active slot inserts its complete item instead of skipping it: " + table, () =>
    {
        var context = new FixtureContext { SlotFault = table + ":missing-active" };
        Check(new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "missing active position was not recovered");
        var inserted = context.Commands.Single(s => s.Table == table && s.Sql.StartsWith("INSERT"));
        Check(inserted.Parameters["@MakeIndex"].Equals(1000 + family)
            && inserted.Parameters["@Position"].Equals(0) && inserted.Parameters["@StdIndex"].Equals((ushort)42)
            && inserted.Parameters["@Dura"].Equals((ushort)123) && inserted.Parameters["@DuraMax"].Equals((ushort)456), "missing slot insert lost original item fields");
        Check(context.Commands.Any(s => s.Table == "characters_item_attr" && s.Sql.StartsWith("INSERT")
            && s.Parameters["@MakeIndex"].Equals(1000 + family)), "missing slot item lost its independent attributes");
    });
    Test("actual newly missing slot INSERT failure rolls back instead of acknowledging a lost item: " + table, () =>
    {
        var successful = new FixtureContext { SlotFault = table + ":missing-active" };
        Check(new FixtureStorage(successful, true).Update(Record().Header.Name, Record()), "missing slot control save failed");
        int ordinal = successful.Commands.FindIndex(s => s.Table == table && s.Sql.StartsWith("INSERT")) + 1;
        var failed = new FixtureContext { SlotFault = table + ":missing-active", FailWrite = ordinal };
        Check(ordinal > 0 && !new FixtureStorage(failed, true).Update(Record().Header.Name, Record()), "missing slot insert failure returned true");
        Check(failed.CommitCalls == 0 && failed.RollbackCalls == 1 && failed.Committed.SequenceEqual(new[] { "original-snapshot" }), "missing slot insert failure exposed earlier writes");
    });
    Test("actual sparse empty slot remains absent and existing writes use locked primary IDs: " + table, () =>
    {
        var context = new FixtureContext { SlotFault = table + ":missing-empty" };
        Check(new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "legal sparse empty position was rejected");
        Check(!context.Commands.Any(s => s.Table == table && s.Sql.StartsWith("INSERT")), "empty absent slot was synthesized");
        Check(context.Commands.Where(s => s.Table == table).All(s => s.Sql.Contains("Id=@RowId") && s.Parameters.ContainsKey("@RowId")), "existing item write lacks locked primary ID");
    });
    Test("actual item clear uses latest fields read under the row lock: " + table, () =>
    {
        var context = new FixtureContext { SlotFault = table + ":latest-fields" };
        Check(new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "latest locked item fields prevented valid clear");
        var clear = context.Commands.Single(s => s.Table == table && s.Sql.Contains("MakeIndex = 0"));
        Check(clear.Parameters["@MakeIndex"].Equals(999) && clear.Parameters["@StdIndex"].Equals((ushort)77), "clear still compared the stale unlocked snapshot");
    });
    foreach (string fault in new[] { "duplicate", "disappeared", "locked-owner", "locked-position" })
    {
        Test("actual invalid or changed item slot rejects and rolls back: " + table + ":" + fault, () =>
        {
            var context = new FixtureContext { SlotFault = table + ":" + fault };
            Check(!new FixtureStorage(context, true).Update(Record().Header.Name, Record()), "invalid item slot returned true");
            Check(context.CommitCalls == 0 && context.RollbackCalls == 1
                && context.Committed.SequenceEqual(new[] { "original-snapshot" }), "invalid slot committed partial state");
        });
    }
}

foreach (string family in new[] { "worn", "bag", "storage" })
{
    Test("actual save rejects a noncanonical incoming slot array rather than clearing unrelated attributes: " + family, () =>
    {
        var r = Record();
        if (family == "worn") r.Data.HumItems = [];
        if (family == "bag") r.Data.BagItems = [];
        if (family == "storage") r.Data.StorageItems = [];
        var context = new FixtureContext();
        Check(!new FixtureStorage(context, true).Update(r.Header.Name, r), "noncanonical incoming slot array returned true");
        Check(context.CommitCalls == 0 && context.RollbackCalls == 1, "invalid incoming shape committed partial writes");
    });
}

foreach (string malformed in new[] { "null-record", "null-data", "default-header", "null-worn", "null-bag", "null-storage", "null-skills" })
{
    Test("actual Update malformed snapshot returns false without diagnostic dereferences: " + malformed, () =>
    {
        var r = Record();
        string name = r.Header.Name;
        if (malformed == "null-record") r = null;
        if (malformed == "null-data") r.Data = null;
        if (malformed == "default-header") r.Header = default;
        if (malformed == "null-worn") r.Data.HumItems = null;
        if (malformed == "null-bag") r.Data.BagItems = null;
        if (malformed == "null-storage") r.Data.StorageItems = null;
        if (malformed == "null-skills") r.Data.Magic = null;
        var context = new FixtureContext();
        Check(!new FixtureStorage(context, true).Update(name, r), "malformed snapshot escaped false");
        Check(context.CommitCalls == 0, "malformed snapshot committed");
    });
}

Test("actual Update null or empty character key is rejected without opening storage", () =>
{
    var context = new FixtureContext();
    var storage = new FixtureStorage(context, true);
    Check(!storage.Update(null, Record()) && !storage.Update("", Record()) && context.OpenCalls == 0, "invalid character key opened or threw from storage");
});

int creationWrites = 0;
Test("actual Add commits legal default rows before publishing quick maps", () =>
{
    var context = new FixtureContext { Creating = true };
    var storage = new FixtureStorage(context, false);
    Check(storage.Add(Record()), "valid creation failed");
    Check(storage.Index(Record().Header.Name) == FixtureContext.InsertedId && storage.QuickIndexCount == 1, "creation did not publish committed ID");
    Check(context.CommitCalls == 1 && context.RollbackCalls == 0, "valid creation transaction changed");
    creationWrites = context.Commands.Count;
    Check(creationWrites == 112, "default row count changed");
    foreach (var (table, count) in new[] { ("characters_item", 13), ("characters_bagitem", 46), ("characters_storageitem", 50) })
        Check(context.Commands.Count(s => s.Table == table) == count, "default slot format changed: " + table);
});

// Every default slot INSERT is exercised, including the last statement of each
// family. A failure must not publish the name or ID into either in-memory map.
for (int ordinal = 1; ordinal <= creationWrites; ordinal++)
{
    int failure = ordinal;
    Test($"actual Add write {failure}/{creationWrites} failure does not publish quick maps", () =>
    {
        var context = new FixtureContext { Creating = true, FailWrite = failure };
        var storage = new FixtureStorage(context, false);
        Check(!storage.Add(Record()), "failed creation returned true");
        Check(storage.Index(Record().Header.Name) == -1 && storage.QuickIndexCount == 0, "failed creation published quick maps");
        Check(context.Commands.Count == failure && context.CommitCalls == 0 && context.RollbackCalls == 1, "creation continued or committed after failure");
        Check(context.Committed.SequenceEqual(new[] { "original-snapshot" }) && context.Pending.Count == 0, "failed creation exposed staged rows");
    });
}

foreach (string table in new[] { "characters_item", "characters_bagitem", "characters_storageitem" })
{
    Test("actual Add strict slot read failure leaves no quick maps: " + table, () =>
    {
        var context = new FixtureContext { Creating = true, FailReadTable = table };
        var storage = new FixtureStorage(context, false);
        Check(!storage.Add(Record()) && storage.Index(Record().Header.Name) == -1 && storage.QuickIndexCount == 0, "creation read failure published ID");
        Check(context.CommitCalls == 0 && context.RollbackCalls == 1, "creation read failure did not rollback");
    });
}

foreach (string phase in new[] { "open-false", "open-throw", "begin", "commit", "rollback", "dispose" })
{
    Test("actual Add boundary failure keeps both quick maps unpublished: " + phase, () =>
    {
        var context = new FixtureContext { Creating = true, FailPhase = phase, FailWrite = phase == "rollback" ? 2 : 0 };
        var storage = new FixtureStorage(context, false);
        Check(!storage.Add(Record()) && storage.Index(Record().Header.Name) == -1 && storage.QuickIndexCount == 0, "creation boundary failure published ID");
        Check(context.DisposeCalls == 1, "creation boundary failure did not cleanup");
    });
}

Test("actual Add rejects invalid inserted ID and can retry after a commit failure", () =>
{
    var invalid = new FixtureContext { Creating = true, ReturnedId = 0 };
    var storage = new FixtureStorage(invalid, false);
    Check(!storage.Add(Record()) && invalid.RollbackCalls == 1 && storage.Index(Record().Header.Name) == -1, "invalid ID accepted");
    var failedCommit = new FixtureContext { Creating = true, FailPhase = "commit" };
    storage.Context = failedCommit;
    Check(!storage.Add(Record()) && storage.Index(Record().Header.Name) == -1, "commit failure published character");
    storage.Context = new FixtureContext { Creating = true };
    Check(storage.Add(Record()) && storage.Index(Record().Header.Name) == FixtureContext.InsertedId, "failed creation left stale name/ID blocking retry");
});

Test("actual Add rejects duplicate without SQL", () =>
{
    var context = new FixtureContext { Creating = true };
    var storage = new FixtureStorage(context, true);
    Check(!storage.Add(Record()) && context.OpenCalls == 0, "duplicate creation reached SQL");
});

Console.WriteLine($"Storage save regression passed: {passed} cases; real SQL/durability not exercised.");

sealed class FixtureStorage : PlayDataStorage
{
    public FixtureContext Context;
    private static readonly FieldInfo Names = typeof(PlayDataStorage).GetField("_NameQuickMap", BindingFlags.NonPublic | BindingFlags.Instance)!;
    private static readonly FieldInfo Indexes = typeof(PlayDataStorage).GetField("_IndexQuickIdMap", BindingFlags.NonPublic | BindingFlags.Instance)!;
    public int QuickIndexCount => ((Dictionary<int, int>)Indexes.GetValue(this)!).Count;
    public FixtureStorage(FixtureContext context, bool knownCharacter) : base(new StorageOption { ConnectionString = "" })
    {
        Context = context;
        if (knownCharacter) ((Dictionary<string, int>)Names.GetValue(this)!).Add("isolated-storage-fixture", FixtureContext.InsertedId);
    }
    protected override StorageContext CreateSaveContext() => Context;
}

record Statement(string Sql, string Table, Dictionary<string, object> Parameters);

sealed class FixtureContext : StorageContext
{
    public const int InsertedId = 42;
    public int FailWrite, OpenCalls, CommitCalls, RollbackCalls, DisposeCalls;
    public int AffectedRows = 1;
    public long ReturnedId = InsertedId;
    public string FailReadTable = "", InvalidPositionTable = "", FailPhase = "", IntegrityFault = "", SlotFault = "";
    public bool Creating;
    public readonly List<Statement> Commands = [];
    public readonly List<string> ReadTables = [];
    public readonly List<string> Pending = [], Committed = ["original-snapshot"];
    private bool transactionActive;
    public FixtureContext() : base(new StorageOption { ConnectionString = "" }) { }
    public override void Open(ref bool success)
    {
        OpenCalls++;
        if (FailPhase == "open-throw") throw new InvalidOperationException("injected open failure");
        success = FailPhase != "open-false";
    }
    public override void BeginTransaction()
    {
        if (FailPhase == "begin") throw new InvalidOperationException("injected begin failure");
        transactionActive = true;
    }
    public override int ExecuteNonQuery(MySqlCommand command)
    {
        if (!transactionActive) throw new Exception("production save executed outside transaction");
        var sql = command.CommandText;
        var table = Regex.Match(sql, @"(?:UPDATE|INTO|FROM)\s+(characters(?:_\w+)?)", RegexOptions.IgnoreCase).Groups[1].Value;
        var values = command.Parameters.Cast<MySqlParameter>().ToDictionary(p => p.ParameterName, p => p.Value);
        Commands.Add(new Statement(sql, table, values));
        if (Commands.Count == FailWrite) throw new InvalidOperationException("injected child command failure");
        Pending.Add(sql);
        return AffectedRows;
    }
    public override long GetLastInsertedId(MySqlCommand command) => ReturnedId;
    public override DbDataReader ExecuteReader(MySqlCommand command)
    {
        if (!transactionActive) throw new Exception("production snapshot read outside transaction");
        string table = Regex.Match(command.CommandText, @"FROM\s+(characters(?:_\w+)?)").Groups[1].Value;
        ReadTables.Add(table);
        if (table == FailReadTable) throw new InvalidOperationException("injected slot read failure");
        var rows = new DataTable();
        if (command.Parameters.Contains("@RowId"))
        {
            long rowId = Convert.ToInt64(command.Parameters["@RowId"].Value);
            long baseId = table == "characters_item" ? 10000 : table == "characters_bagitem" ? 20000 : 30000;
            int position = (int)(rowId - baseId - 1);
            rows.Columns.Add("Id", typeof(long));
            rows.Columns.Add("PlayerId", typeof(int));
            rows.Columns.Add("Position", typeof(int));
            rows.Columns.Add("MakeIndex", typeof(int));
            rows.Columns.Add("StdIndex", typeof(ushort));
            rows.Columns.Add("Dura", typeof(ushort));
            rows.Columns.Add("DuraMax", typeof(ushort));
            rows.Rows.Add(rowId, SlotFault == table + ":locked-owner" ? InsertedId + 1 : InsertedId,
                SlotFault == table + ":locked-position" ? position + 1 : position,
                SlotFault == table + ":latest-fields" && position == 1 ? 999 : position < 2 ? 50 + position : 0,
                (ushort)(SlotFault == table + ":latest-fields" && position == 1 ? 77 : position < 2 ? 42 : 0),
                (ushort)321, (ushort)654);
            if (SlotFault == table + ":disappeared") rows.Clear();
            return rows.CreateDataReader();
        }
        if (command.CommandText.EndsWith("FOR UPDATE", StringComparison.Ordinal))
        {
            if (table == "characters")
            {
                rows.Columns.Add("Id", typeof(int));
                rows.Columns.Add("ChrName", typeof(string));
                rows.Columns.Add("LoginID", typeof(string));
                rows.Columns.Add("Deleted", typeof(int));
                rows.Rows.Add(IntegrityFault == "characters:id" ? InsertedId + 1 : InsertedId,
                    IntegrityFault == "characters:name" ? "other-character" : "isolated-storage-fixture",
                    IntegrityFault == "characters:account" ? "other-account" : "isolated-no-account",
                    IntegrityFault == "characters:null-deleted" ? DBNull.Value : IntegrityFault == "characters:deleted" ? 1 : 0);
                if (IntegrityFault == "characters:duplicate") rows.ImportRow(rows.Rows[0]);
            }
            else
            {
                rows.Columns.Add("PlayerId", typeof(int));
                rows.Rows.Add(IntegrityFault == table + ":id" ? InsertedId + 1 : InsertedId);
            }
            if (IntegrityFault == table + ":missing") rows.Clear();
            return rows.CreateDataReader();
        }
        rows.Columns.Add("Id", typeof(long));
        rows.Columns.Add("Position", typeof(int));
        rows.Columns.Add("MakeIndex", typeof(int));
        rows.Columns.Add("StdIndex", typeof(ushort));
        rows.Columns.Add("Dura", typeof(ushort));
        rows.Columns.Add("DuraMax", typeof(ushort));
        if (!Creating)
        {
            int size = table == "characters_item" ? 13 : table == "characters_bagitem" ? 46 : 50;
            long baseId = table == "characters_item" ? 10000 : table == "characters_bagitem" ? 20000 : 30000;
            for (int i = 0; i < size; i++)
            {
                if (SlotFault == table + ":missing-active" && i == 0 || SlotFault == table + ":missing-empty" && i == 2) continue;
                rows.Rows.Add(baseId + i + 1, i, i < 2 ? 50 + i : 0, (ushort)(i < 2 ? 42 : 0), (ushort)123, (ushort)456);
            }
            if (SlotFault == table + ":duplicate") rows.Rows.Add(baseId + 1000, 0, 51, (ushort)42, (ushort)123, (ushort)456);
        }
        if (table == InvalidPositionTable) rows.Rows.Add(90000L, 1000, 1, (ushort)42, (ushort)1, (ushort)1);
        return rows.CreateDataReader();
    }
    public override void Commit()
    {
        CommitCalls++;
        if (!transactionActive) { base.Commit(); return; }
        if (FailPhase == "commit") throw new InvalidOperationException("injected commit failure");
        Committed.AddRange(Pending);
        Pending.Clear();
        transactionActive = false;
    }
    public override void RollBack()
    {
        RollbackCalls++;
        if (FailPhase == "rollback") throw new InvalidOperationException("injected rollback failure");
        Pending.Clear();
        transactionActive = false;
    }
    public override void Dispose()
    {
        DisposeCalls++;
        // Mirrors disposal of an uncommitted connection after rollback itself fails.
        Pending.Clear();
        transactionActive = false;
        if (FailPhase == "dispose") throw new InvalidOperationException("injected dispose failure");
    }
}
