using System.Data;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using DBSrv.Storage;
using DBSrv.Storage.MySQL;
using MySqlConnector;
using OpenMir2;
using OpenMir2.Packets.ClientPackets;
using OpenMir2.Packets.ServerPackets;
using Serilog;

// Explicit opt-in integration harness. Only the newly generated schema is writable.
// No password, connection string, authentication ticket, or database row is logged.
if (args.Length != 2) throw new ArgumentException("Pass the approved mysql-client.ini path and a new report path.");
string repo = Directory.GetCurrentDirectory();
string approvedSettings = Path.GetFullPath(Path.Combine(repo, ".runtime", "mysql-client.ini"));
if (!StringComparer.OrdinalIgnoreCase.Equals(Path.GetFullPath(args[0]), approvedSettings))
    throw new ArgumentException("Only the repository mysql-client.ini is accepted.");
string reportPath = Path.GetFullPath(args[1]);
string reportDirectory = Path.GetFullPath(Path.Combine(repo, ".runtime", "reports")) + Path.DirectorySeparatorChar;
if (!reportPath.StartsWith(reportDirectory, StringComparison.OrdinalIgnoreCase)
    || !Path.GetFileName(reportPath).StartsWith("save-v9-storage-sql-", StringComparison.Ordinal)
    || File.Exists(reportPath)) throw new ArgumentException("Use a new save-v9-storage-sql report inside .runtime/reports.");
LogService.Logger = new LoggerConfiguration().CreateLogger(); // no sinks, including SQL error messages
string schema = "mir2_save_v9_" + Guid.NewGuid().ToString("N")[..16];
if (!Regex.IsMatch(schema, @"\Amir2_save_v9_[0-9a-f]{16}\z") || schema == "mir2_db")
    throw new InvalidOperationException("Unsafe schema name.");
string[] tables = ["characters", "characters_ablity", "characters_item", "characters_bagitem", "characters_storageitem", "characters_item_attr", "characters_magic", "characters_bonusability", "characters_status", "characters_quest"];
var start = DateTimeOffset.UtcNow;
var cases = new List<object>();
var definitions = new List<object>();
var operations = new List<object>();
bool created = false, dropped = false, productionRowWrites = false;
string errorType = "", cleanupErrorType = "", phase = "initialization";
MySqlConnection? administration = null;
string isolatedConnectionString = "";
int passes = 0;

void Check(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
void Test(string name, Action run)
{
    phase = name;
    run();
    passes++;
    cases.Add(new { name, passed = true });
    Console.WriteLine("PASS: " + name);
}
void ExecuteOwned(string sql)
{
    Check(created, "No schema ownership.");
    using var connection = new MySqlConnection(isolatedConnectionString);
    connection.Open();
    Check(connection.Database == schema, "Wrong write destination.");
    using var command = connection.CreateCommand();
    command.CommandText = sql;
    command.ExecuteNonQuery();
}
Dictionary<string, string> Snapshot()
{
    // A fresh connection for each snapshot cannot observe a prior connection's
    // uncommitted state or the in-process character cache.
    using var connection = new MySqlConnection(isolatedConnectionString);
    connection.Open();
    var result = new Dictionary<string, string>();
    foreach (string table in tables)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT * FROM `" + table + "`";
        using var reader = command.ExecuteReader();
        var rows = new List<string>();
        while (reader.Read())
        {
            var values = new object?[reader.FieldCount];
            reader.GetValues(values!);
            rows.Add(JsonSerializer.Serialize(values.Select(v => v is DBNull ? null : v).ToArray()));
        }
        rows.Sort(StringComparer.Ordinal);
        string canonical = JsonSerializer.Serialize(rows);
        result[table] = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }
    return result;
}
bool Same(Dictionary<string, string> a, Dictionary<string, string> b) => tables.All(t => a[t] == b[t]);
long Scalar(string sql)
{
    using var connection = new MySqlConnection(isolatedConnectionString);
    connection.Open();
    using var command = connection.CreateCommand();
    command.CommandText = sql;
    return Convert.ToInt64(command.ExecuteScalar());
}
CharacterDataInfo Record(string name, bool pending = false)
{
    var r = new CharacterDataInfo();
    var header = r.Header;
    header.Name = name;
    r.Header = header;
    r.Data.ChrName = name;
    r.Data.Account = "v9fixture";
    r.Data.CurMap = r.Data.HomeMap = "0";
    r.Data.MasterName = r.Data.DearName = r.Data.StoragePwd = "";
    r.Data.Gold = pending ? 9876 : 4321;
    var ability = r.Data.Abil;
    ability.HP = (ushort)(pending ? 222 : 111);
    r.Data.Abil = ability;
    var bonus = r.Data.BonusAbil;
    bonus.DC = (byte)(pending ? 19 : 7);
    r.Data.BonusAbil = bonus;
    r.Data.StatusTimeArr[0] = (ushort)(pending ? 99 : 22);
    r.Data.QuestUnitOpen[0] = (byte)(pending ? 2 : 1);
    foreach (var slots in new[] { r.Data.HumItems, r.Data.BagItems, r.Data.StorageItems })
    {
        for (int i = 0; i < slots.Length; i++) slots[i] = new ServerUserItem();
        int instanceOffset = name == "v9parallel" ? 100000 : 0;
        slots[0] = new ServerUserItem { MakeIndex = instanceOffset + 1000 + slots.Length, Index = 42, Dura = (ushort)(pending ? 321 : 123), DuraMax = 456 };
        slots[0].Desc[2] = (byte)(pending ? 19 : 7);
        if (!pending)
        {
            slots[1] = new ServerUserItem { MakeIndex = instanceOffset + 2000 + slots.Length, Index = 43, Dura = 12, DuraMax = 45 };
            slots[1].Desc[2] = 9;
        }
    }
    for (int i = 0; i < r.Data.Magic.Length; i++) r.Data.Magic[i] = new MagicRcd();
    r.Data.Magic[0] = new MagicRcd { MagIdx = 7, Level = (byte)(pending ? 2 : 1), MagicKey = '2', TranPoint = (ushort)(pending ? 44 : 33) };
    return r;
}
void CreateTrigger(string table, string operation, string condition)
{
    Check(tables.Contains(table) && new[] { "UPDATE", "INSERT", "DELETE" }.Contains(operation), "Unsafe trigger target.");
    ExecuteOwned("CREATE TRIGGER `save_v9_inject` BEFORE " + operation + " ON `" + table
        + "` FOR EACH ROW BEGIN IF " + condition + " THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='isolated-save-v9-failure'; END IF; END");
}
void DropTrigger() => ExecuteOwned("DROP TRIGGER IF EXISTS `save_v9_inject`");

try
{
    var settings = File.ReadAllLines(approvedSettings)
        .Where(line => line.Contains('=') && !line.TrimStart().StartsWith('#') && !line.TrimStart().StartsWith(';'))
        .Select(line => line.Split('=', 2))
        .ToDictionary(parts => parts[0].Trim(), parts => parts[1].Trim(), StringComparer.OrdinalIgnoreCase);
    Check(settings["host"] is "127.0.0.1" or "localhost" && uint.Parse(settings["port"]) == 13306, "Only the approved local instance is allowed.");
    var options = new MySqlConnectionStringBuilder
    {
        Server = "127.0.0.1", Port = 13306,
        UserID = settings["user"], Password = settings["password"],
        Pooling = false, UseAffectedRows = true
    };
    administration = new MySqlConnection(options.ConnectionString);
    administration.Open();
    phase = "read-only-source-table-definitions";
    var ddl = new Dictionary<string, string>();
    foreach (string table in tables)
    {
        using var show = administration.CreateCommand();
        show.CommandText = "SHOW CREATE TABLE `mir2_db`.`" + table + "`";
        using var reader = show.ExecuteReader();
        Check(reader.Read(), "Missing source table.");
        string definition = reader.GetString(1);
        // Execute only this one allowlisted CREATE TABLE on a connection whose
        // selected database is the owned schema. Reject foreign databases, foreign
        // keys, comments containing extra statements, and nontransactional engines.
        Check(definition.StartsWith("CREATE TABLE `" + table + "` (", StringComparison.Ordinal)
            && Regex.IsMatch(definition, @"\bENGINE=InnoDB\b", RegexOptions.IgnoreCase)
            && !definition.Contains(';') && !definition.Contains("/*") && !definition.Contains("--")
            && !Regex.IsMatch(definition, @"\b(?:USE|DATABASE|SCHEMA|REFERENCES)\b", RegexOptions.IgnoreCase)
            && !Regex.IsMatch(definition, @"`[^`]+`\s*\.\s*`"), "Unsafe or nontransactional table definition.");
        ddl.Add(table, definition);
        definitions.Add(new { table, source = "mir2_db", engine = "InnoDB", sha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(definition))).ToLowerInvariant() });
        if (table == "characters_bonusability")
            Check(Regex.IsMatch(definition, @"PRIMARY KEY\s*\(\s*`PLAYERID`\s*\)", RegexOptions.IgnoreCase), "Bonus snapshot upsert requires its actual PlayerId unique key.");
        if (table is "characters_item" or "characters_bagitem" or "characters_storageitem")
            Check(Regex.IsMatch(definition, @"PRIMARY KEY\s*\(\s*`Id`\s*\)", RegexOptions.IgnoreCase), "Slot locking requires its actual Id primary key.");
    }
    phase = "create-owned-schema";
    using (var create = administration.CreateCommand())
    {
        // No IF NOT EXISTS: successful creation is necessary to establish exclusive
        // ownership, and a collision must never authorize cleanup of an old schema.
        create.CommandText = "CREATE DATABASE `" + schema + "` CHARACTER SET utf8mb4";
        create.ExecuteNonQuery();
        created = true;
    }
    operations.Add(new { operation = "create-schema", schema, recordedAt = DateTimeOffset.UtcNow });
    options.Database = schema;
    isolatedConnectionString = options.ConnectionString;
    foreach (string definition in ddl.Values) ExecuteOwned(definition);
    var storage = new SqlFixtureStorage(isolatedConnectionString);
    const string name = "v9existing";
    int playerId = 0;
    Test("real Add creates only owned schema default rows", () =>
    {
        Check(storage.Add(Record(name)), "Legal real Add failed.");
        playerId = storage.Index(name);
        Check(playerId > 0 && Scalar("SELECT COUNT(*) FROM characters WHERE ID=" + playerId) == 1, "Committed character missing on new connection.");
        foreach (var (table, count) in new[] { ("characters_item", 13), ("characters_bagitem", 46), ("characters_storageitem", 50) })
            Check(Scalar("SELECT COUNT(*) FROM " + table + " WHERE PlayerId=" + playerId) == count, "Default slots missing.");
    });
    Test("real first save creates the full bonus snapshot missing from legacy Add", () =>
    {
        Check(Scalar("SELECT COUNT(*) FROM characters_bonusability WHERE PlayerId=" + playerId) == 0, "Legacy Add unexpectedly supplied a bonus row.");
        Check(storage.Update(name, Record(name)), "Initial real save failed.");
        Check(Scalar("SELECT DC FROM characters_bonusability WHERE PlayerId=" + playerId) == 7, "First save lost its authoritative bonus snapshot.");
    });
    var baseline = Snapshot();
    foreach (var (table, key) in new[] { ("characters", "Id"), ("characters_ablity", "PlayerId"), ("characters_status", "PlayerId") })
    {
        Test("real stale quick map rejects a missing required row before writes: " + table, () =>
        {
            // Both the backup and the deliberate deletion stay in the owned schema.
            ExecuteOwned("CREATE TABLE `save_v9_row_backup` LIKE `" + table + "`");
            try
            {
                ExecuteOwned("INSERT INTO save_v9_row_backup SELECT * FROM `" + table + "` WHERE `" + key + "`=" + playerId);
                ExecuteOwned("DELETE FROM `" + table + "` WHERE `" + key + "`=" + playerId);
                var missingSnapshot = Snapshot();
                Check(storage.Index(name) == playerId, "The stale quick-map condition was not retained.");
                Check(!storage.Update(name, Record(name, true)), "Missing required row returned true.");
                Check(storage.LastContext!.WriteCalls == 0 && Same(missingSnapshot, Snapshot()), "Missing required row reached writes.");
                ExecuteOwned("INSERT INTO `" + table + "` SELECT * FROM save_v9_row_backup");
            }
            finally { ExecuteOwned("DROP TABLE save_v9_row_backup"); }
            Check(Same(baseline, Snapshot()), "Restoring the temporary test row changed its snapshot.");
        });
    }
    foreach (var (field, badValue, originalValue) in new[]
    {
        ("ChrName", "'v9other'", "'v9existing'"),
        ("LoginID", "'v9wrong'", "'v9fixture'"),
        ("Deleted", "1", "0"),
        ("Deleted", "NULL", "0")
    })
    {
        Test("real existing row identity or deletion mismatch cannot acknowledge a save: " + field + "=" + badValue, () =>
        {
            ExecuteOwned("UPDATE characters SET `" + field + "`=" + badValue + " WHERE Id=" + playerId);
            try
            {
                var changedIdentity = Snapshot();
                Check(!storage.Update(name, Record(name, true)), "Invalid existing character identity returned true.");
                Check(storage.LastContext!.WriteCalls == 0 && Same(changedIdentity, Snapshot()), "Invalid existing identity reached writes.");
            }
            finally { ExecuteOwned("UPDATE characters SET `" + field + "`=" + originalValue + " WHERE Id=" + playerId); }
            Check(Same(baseline, Snapshot()), "Temporary identity restoration changed other data.");
        });
    }
    foreach (string identity in new[] { "header", "data-name", "account" })
    {
        Test("real mismatched incoming snapshot is rejected without updating the existing owner: " + identity, () =>
        {
            var bad = Record(name, true);
            if (identity == "header") { var header = bad.Header; header.Name = "v9wrong"; bad.Header = header; }
            if (identity == "data-name") bad.Data.ChrName = "v9wrong";
            if (identity == "account") bad.Data.Account = "v9wrong";
            Check(!storage.Update(name, bad), "Wrong incoming snapshot identity returned true.");
            Check(storage.LastContext!.WriteCalls == 0 && Same(baseline, Snapshot()), "Wrong incoming identity changed stored data.");
        });
    }
    var failures = new (string label, string table, string operation, string condition)[]
    {
        ("character", "characters", "UPDATE", "1=1"),
        ("ability", "characters_ablity", "UPDATE", "1=1"),
        ("equipment-clear", "characters_item", "UPDATE", "NEW.Position=1"),
        ("equipment-update", "characters_item", "UPDATE", "NEW.Position=0"),
        ("bag-clear", "characters_bagitem", "UPDATE", "NEW.Position=1"),
        ("bag-update", "characters_bagitem", "UPDATE", "NEW.Position=0"),
        ("storage-clear", "characters_storageitem", "UPDATE", "NEW.Position=1"),
        ("storage-update", "characters_storageitem", "UPDATE", "NEW.Position=0"),
        ("attrs-delete", "characters_item_attr", "DELETE", "1=1"),
        ("attrs-worn-insert", "characters_item_attr", "INSERT", "NEW.MakeIndex=1013"),
        ("attrs-bag-insert", "characters_item_attr", "INSERT", "NEW.MakeIndex=1046"),
        ("attrs-storage-insert", "characters_item_attr", "INSERT", "NEW.MakeIndex=1050"),
        ("skills-delete", "characters_magic", "DELETE", "1=1"),
        ("skills-insert", "characters_magic", "INSERT", "1=1"),
        ("bonus-ability", "characters_bonusability", "UPDATE", "1=1"),
        ("status", "characters_status", "UPDATE", "1=1"),
        ("quest-delete", "characters_quest", "DELETE", "1=1"),
        ("quest-insert", "characters_quest", "INSERT", "1=1")
    };
    foreach (var f in failures)
    {
        Test("real trigger SQL failure rolls back all ten tables: " + f.label, () =>
        {
            CreateTrigger(f.table, f.operation, f.condition);
            try
            {
                Check(!storage.Update(name, Record(name, pending: true)), "Injected SQL failure returned true.");
                Check(storage.LastContext!.SqlExceptionNumber == 1644 && storage.LastContext.SqlState == "45000", "Trigger failure was not reached.");
                Check(Same(baseline, Snapshot()), "SQL failure exposed partial writes on new connection.");
            }
            finally { DropTrigger(); }
        });
    }
    foreach (string table in new[] { "characters_item", "characters_bagitem", "characters_storageitem" })
    {
        Test("real missing old-slot table rolls back prior writes: " + table, () =>
        {
            string held = "held_" + table;
            ExecuteOwned("RENAME TABLE `" + table + "` TO `" + held + "`");
            try
            {
                Check(!storage.Update(name, Record(name, true)), "Missing slot table returned true.");
                Check(storage.LastContext!.ReadFailureNumber == 1146, "Actual missing-table SQL error was not reached.");
            }
            finally { ExecuteOwned("RENAME TABLE `" + held + "` TO `" + table + "`"); }
            Check(Same(baseline, Snapshot()), "Failed slot read committed prior writes.");
        });
    }
    Test("real transaction rolls back when the application throws before COMMIT", () =>
    {
        storage.CommitFailure = "before";
        try
        {
            Check(!storage.Update(name, Record(name, true)), "Pre-commit exception returned true.");
            Check(Same(baseline, Snapshot()), "Pre-commit exception left persisted writes.");
        }
        finally { storage.CommitFailure = ""; }
    });
    Test("real successful COMMIT is visible from fresh connections across all save families", () =>
    {
        Check(storage.Update(name, Record(name, true)), "Real final Update failed.");
        Check(Scalar("SELECT Gold FROM characters WHERE ID=" + playerId) == 9876, "Gold not committed.");
        Check(Scalar("SELECT Hp FROM characters_ablity WHERE PlayerId=" + playerId) == 222, "Ability not committed.");
        foreach (string table in new[] { "characters_item", "characters_bagitem", "characters_storageitem" })
        {
            Check(Scalar("SELECT Dura FROM " + table + " WHERE PlayerId=" + playerId + " AND Position=0") == 321, "Slot update not committed.");
            Check(Scalar("SELECT MakeIndex FROM " + table + " WHERE PlayerId=" + playerId + " AND Position=1") == 0, "Slot clear not committed.");
        }
        Check(Scalar("SELECT COUNT(*) FROM characters_item_attr WHERE PlayerId=" + playerId + " AND VALUE2=19") == 3, "Instance attributes not committed.");
        Check(Scalar("SELECT Level FROM characters_magic WHERE PlayerId=" + playerId) == 2, "Skills not committed.");
        Check(Scalar("SELECT DC FROM characters_bonusability WHERE PlayerId=" + playerId) == 19, "Bonus ability not committed.");
        Check(Scalar("SELECT Status0 FROM characters_status WHERE PlayerId=" + playerId) == 99, "Status not committed.");
        Check(Scalar("SELECT COUNT(*) FROM characters_quest WHERE PlayerId=" + playerId + " AND QUESTOPENINDEX='" + Convert.ToBase64String(Record(name, true).Data.QuestUnitOpen) + "'") == 1, "Quest encoding not committed.");
    });
    Test("real unchanged writes may affect zero rows without making the save fail", () =>
    {
        Check(storage.Update(name, Record(name, true)), "Zero-row repeat save failed.");
        Check(storage.LastContext!.ZeroAffectedWrites > 0, "No actual zero-row write was observed.");
    });
    Test("real previously deleted bonus row is recreated with the complete current snapshot", () =>
    {
        ExecuteOwned("DELETE FROM characters_bonusability WHERE PlayerId=" + playerId);
        Check(storage.Update(name, Record(name, true)), "Missing bonus row prevented a legitimate save.");
        Check(Scalar("SELECT COUNT(*) FROM characters_bonusability WHERE PlayerId=" + playerId + " AND DC=19") == 1, "Bonus snapshot was skipped or duplicated.");
    });
    Test("real bonus upsert INSERT failure rolls back every prior save family", () =>
    {
        ExecuteOwned("DELETE FROM characters_bonusability WHERE PlayerId=" + playerId);
        var missingBonus = Snapshot();
        CreateTrigger("characters_bonusability", "INSERT", "1=1");
        try
        {
            Check(!storage.Update(name, Record(name)), "Failed bonus insert returned true.");
            Check(storage.LastContext!.SqlExceptionNumber == 1644 && Same(missingBonus, Snapshot()), "Bonus insert failure committed partial changes.");
        }
        finally { DropTrigger(); }
        Check(storage.Update(name, Record(name, true)), "Bonus insert could not retry after rollback.");
    });
    foreach (var (table, family) in new[] { ("characters_item", 13), ("characters_bagitem", 46), ("characters_storageitem", 50) })
    {
        Test("real missing active slot persists the item, attributes, and idempotent retry: " + table, () =>
        {
            ExecuteOwned("DELETE FROM `" + table + "` WHERE PlayerId=" + playerId + " AND Position=0");
            var missingSlot = Snapshot();
            CreateTrigger(table, "INSERT", "1=1");
            try
            {
                Check(!storage.Update(name, Record(name, true)), "Failed missing-slot INSERT returned true.");
                Check(storage.LastContext!.SqlExceptionNumber == 1644 && Same(missingSlot, Snapshot()), "Missing-slot INSERT failure committed partial writes.");
            }
            finally { DropTrigger(); }
            Check(storage.Update(name, Record(name, true)), "Missing active slot save failed.");
            string required = "PlayerId=" + playerId + " AND Position=0 AND MakeIndex=" + (1000 + family) + " AND StdIndex=42 AND Dura=321 AND DuraMax=456";
            Check(Scalar("SELECT COUNT(*) FROM `" + table + "` WHERE " + required) == 1, "Missing slot lost full item fields.");
            Check(Scalar("SELECT COUNT(*) FROM characters_item_attr WHERE PlayerId=" + playerId + " AND MakeIndex=" + (1000 + family) + " AND VALUE2=19") == 1, "Inserted slot lost its bound instance attributes.");
            Check(storage.Update(name, Record(name, true)) && Scalar("SELECT COUNT(*) FROM `" + table + "` WHERE PlayerId=" + playerId + " AND Position=0") == 1, "Save retry duplicated the inserted position.");
        });
        Test("real absent empty slot remains sparse instead of synthesizing a default row: " + table, () =>
        {
            ExecuteOwned("DELETE FROM `" + table + "` WHERE PlayerId=" + playerId + " AND Position=2");
            Check(storage.Update(name, Record(name, true)), "Sparse empty slot was rejected.");
            Check(Scalar("SELECT COUNT(*) FROM `" + table + "` WHERE PlayerId=" + playerId + " AND Position=2") == 0, "Sparse empty slot was fabricated.");
        });
        foreach (int position in new[] { 0, -1, family })
        {
            Test("real duplicate or out-of-range slot rejects without partial writes: " + table + "/" + position, () =>
            {
                ExecuteOwned("INSERT INTO `" + table + "` (PlayerId,Position,MakeIndex,StdIndex,Dura,DuraMax) VALUES (" + playerId + "," + position + ",9000,42,1,2)");
                long badId = Scalar("SELECT MAX(Id) FROM `" + table + "`");
                try
                {
                    var corrupt = Snapshot();
                    Check(!storage.Update(name, Record(name)), "Corrupt slot layout returned true.");
                    Check(Same(corrupt, Snapshot()), "Corrupt layout committed unrelated changes.");
                }
                finally { ExecuteOwned("DELETE FROM `" + table + "` WHERE Id=" + badId); }
            });
        }
        Test("real clear compares the latest locked fields after the initial unlocked snapshot: " + table, () =>
        {
            storage.BeforeSlotLocks[table] = () => ExecuteOwned("UPDATE `" + table + "` SET MakeIndex=9999,StdIndex=99,Dura=11,DuraMax=44 WHERE PlayerId=" + playerId + " AND Position=1");
            try
            {
                Check(storage.Update(name, Record(name, true)), "Latest locked fields prevented a legal save.");
                Check(Scalar("SELECT MakeIndex FROM `" + table + "` WHERE PlayerId=" + playerId + " AND Position=1") == 0, "Save compared stale MakeIndex and skipped the clear.");
            }
            finally { storage.BeforeSlotLocks.Clear(); }
        });
        Test("real known slot primary ID is locked against concurrent deletion and released by commit: " + table, () =>
        {
            long slotId = Scalar("SELECT Id FROM `" + table + "` WHERE PlayerId=" + playerId + " AND Position=0");
            storage.BeforeSlotWrites[table] = () =>
            {
                using var deleting = new MySqlConnection(isolatedConnectionString);
                deleting.Open();
                using (var timeout = deleting.CreateCommand()) { timeout.CommandText = "SET SESSION innodb_lock_wait_timeout=1"; timeout.ExecuteNonQuery(); }
                using var delete = deleting.CreateCommand();
                delete.CommandText = "DELETE FROM `" + table + "` WHERE Id=" + slotId;
                bool locked = false;
                try { delete.ExecuteNonQuery(); } catch (MySqlException error) when (error.Number == 1205) { locked = true; }
                Check(locked, "Concurrent deletion bypassed the exact slot row lock.");
            };
            try { Check(storage.Update(name, Record(name, true)), "Save failed while exercising its slot lock."); }
            finally { storage.BeforeSlotWrites.Clear(); }
            using var after = new MySqlConnection(isolatedConnectionString);
            after.Open();
            using var transaction = after.BeginTransaction();
            using var released = after.CreateCommand();
            released.Transaction = transaction;
            released.CommandText = "DELETE FROM `" + table + "` WHERE Id=" + slotId;
            Check(released.ExecuteNonQuery() == 1, "Slot row lock escaped the save transaction.");
            transaction.Rollback();
        });
    }
    Test("real saves for different characters do not wait on unrelated slot row locks", () =>
    {
        var other = new SqlFixtureStorage(isolatedConnectionString);
        const string otherName = "v9parallel";
        Check(other.Add(Record(otherName)) && other.Update(otherName, Record(otherName)), "Second isolated character could not be initialized.");
        storage.BeforeSlotWrites["characters_item"] = () => Check(other.Update(otherName, Record(otherName, true)), "Other character save was blocked by unrelated slot locks.");
        try { Check(storage.Update(name, Record(name, true)), "Original character failed after the parallel save."); }
        finally { storage.BeforeSlotWrites.Clear(); }
        Check(Scalar("SELECT Gold FROM characters WHERE Id=" + other.Index(otherName)) == 9876, "Other character did not commit independently.");
    });
    Test("real item movement preserves existing independent Desc bytes", () =>
    {
        var moved = Record(name, true);
        var item = moved.Data.HumItems[0];
        item.Desc[0] = 10; item.Desc[1] = 11; item.Desc[3] = 50; item.Desc[4] = 51;
        moved.Data.HumItems[0] = new ServerUserItem();
        moved.Data.BagItems[2] = item;
        Check(storage.Update(name, moved), "Item move save failed.");
        Check(Scalar("SELECT MakeIndex FROM characters_item WHERE PlayerId=" + playerId + " AND Position=0") == 0
            && Scalar("SELECT MakeIndex FROM characters_bagitem WHERE PlayerId=" + playerId + " AND Position=2") == 1013, "Item move slots incorrect.");
        Check(Scalar("SELECT COUNT(*) FROM characters_item_attr WHERE PlayerId=" + playerId + " AND MakeIndex=1013 AND VALUE0=10 AND VALUE1=11 AND VALUE2=19 AND VALUE3=50 AND VALUE4=51") == 1, "Move lost or duplicated Desc bytes.");
    });
    foreach (var (table, key) in new[] { ("characters", "Id"), ("characters_ablity", "PlayerId"), ("characters_status", "PlayerId") })
    {
        Test("real required row lock prevents concurrent deletion before the first write: " + table, () =>
        {
            storage.BeforeFirstWrite = () =>
            {
                using var deletingConnection = new MySqlConnection(isolatedConnectionString);
                deletingConnection.Open();
                using (var timeout = deletingConnection.CreateCommand())
                {
                    timeout.CommandText = "SET SESSION innodb_lock_wait_timeout=1";
                    timeout.ExecuteNonQuery();
                }
                using var delete = deletingConnection.CreateCommand();
                delete.CommandText = "DELETE FROM `" + table + "` WHERE `" + key + "`=" + playerId;
                bool locked = false;
                try { delete.ExecuteNonQuery(); }
                catch (MySqlException error) when (error.Number == 1205) { locked = true; }
                Check(locked, "Concurrent deletion was not blocked by the required row lock.");
            };
            try { Check(storage.Update(name, Record(name, true)), "Save failed after observing its row lock."); }
            finally { storage.BeforeFirstWrite = null; }
            Check(Scalar("SELECT COUNT(*) FROM `" + table + "` WHERE `" + key + "`=" + playerId) == 1, "Concurrent attempt deleted the required row.");
            using var afterCommit = new MySqlConnection(isolatedConnectionString);
            afterCommit.Open();
            using (var timeout = afterCommit.CreateCommand())
            {
                timeout.CommandText = "SET SESSION innodb_lock_wait_timeout=1";
                timeout.ExecuteNonQuery();
            }
            using var transaction = afterCommit.BeginTransaction();
            using var deleteAfter = afterCommit.CreateCommand();
            deleteAfter.Transaction = transaction;
            deleteAfter.CommandText = "DELETE FROM `" + table + "` WHERE `" + key + "`=" + playerId;
            Check(deleteAfter.ExecuteNonQuery() == 1, "The save's row lock did not end with its commit.");
            transaction.Rollback();
        });
    }
    Test("post-COMMIT exception returns false but does not falsely claim the completed commit rolled back", () =>
    {
        var changed = Record(name, true); changed.Data.Gold = 7777;
        storage.CommitFailure = "after";
        try
        {
            Check(!storage.Update(name, changed), "Post-commit uncertainty returned true.");
            Check(Scalar("SELECT Gold FROM characters WHERE ID=" + playerId) == 7777, "Completed commit was unexpectedly lost.");
        }
        finally { storage.CommitFailure = ""; }
    });
    int fixture = 0;
    foreach (string table in new[] { "characters", "characters_ablity", "characters_status", "characters_item", "characters_bagitem", "characters_storageitem" })
    {
        Test("real Add child INSERT failure has no rows or published quick maps: " + table, () =>
        {
            var before = Snapshot();
            string createdName = "v9new" + (++fixture);
            var creator = new SqlFixtureStorage(isolatedConnectionString);
            CreateTrigger(table, "INSERT", "1=1");
            try
            {
                Check(!creator.Add(Record(createdName)), "Failed real Add returned true.");
                Check(creator.LastContext!.SqlExceptionNumber == 1644 && creator.Index(createdName) == -1 && creator.QuickIndexCount == 0, "Failed Add published ID or missed SQL fault.");
                Check(Same(before, Snapshot()), "Failed Add left partial rows.");
            }
            finally { DropTrigger(); }
            Check(creator.Add(Record(createdName)) && creator.Index(createdName) > 0, "Same fixture could not retry after rollback.");
        });
    }
    Test("real optional empty skills, quest and attributes do not fail required-row integrity", () =>
    {
        ExecuteOwned("DELETE FROM characters_magic WHERE PlayerId=" + playerId);
        ExecuteOwned("DELETE FROM characters_quest WHERE PlayerId=" + playerId);
        ExecuteOwned("DELETE FROM characters_item_attr WHERE PlayerId=" + playerId);
        var empty = Record(name, true);
        empty.Data.Magic = [];
        foreach (var slots in new[] { empty.Data.HumItems, empty.Data.BagItems, empty.Data.StorageItems })
            for (int i = 0; i < slots.Length; i++) slots[i] = new ServerUserItem();
        Check(storage.Update(name, empty), "Optional empty rows were treated as missing required rows.");
        Check(Scalar("SELECT COUNT(*) FROM characters_magic WHERE PlayerId=" + playerId) == 0
            && Scalar("SELECT COUNT(*) FROM characters_item_attr WHERE PlayerId=" + playerId) == 0
            && Scalar("SELECT COUNT(*) FROM characters_quest WHERE PlayerId=" + playerId) == 1, "Optional empty save semantics changed.");
    });
}
catch (Exception error)
{
    errorType = error.GetType().FullName ?? error.GetType().Name;
    cases.Add(new { name = phase, passed = false, errorType });
    Console.WriteLine("FAIL: " + phase + " (" + error.GetType().Name + ")");
}
finally
{
    if (created)
    {
        try
        {
            // Ownership can only be established by this process's successful
            // CREATE DATABASE. No preexisting/random-name collision can be dropped.
            if (!Regex.IsMatch(schema, @"\Amir2_save_v9_[0-9a-f]{16}\z") || schema == "mir2_db") throw new InvalidOperationException();
            using var drop = administration!.CreateCommand();
            drop.CommandText = "DROP DATABASE `" + schema + "`";
            drop.ExecuteNonQuery();
            using var verify = administration.CreateCommand();
            verify.CommandText = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME=@schema";
            verify.Parameters.AddWithValue("@schema", schema);
            dropped = Convert.ToInt32(verify.ExecuteScalar()) == 0;
            operations.Add(new { operation = "drop-owned-schema", schema, verifiedAbsent = dropped, recordedAt = DateTimeOffset.UtcNow });
        }
        catch (Exception error) { cleanupErrorType = error.GetType().FullName ?? error.GetType().Name; }
    }
    try { administration?.Dispose(); }
    catch (Exception error) { cleanupErrorType = error.GetType().FullName ?? error.GetType().Name; }
    var report = new
    {
        schemaVersion = 1, startedAt = start, finishedAt = DateTimeOffset.UtcNow,
        passed = errorType == "" && cleanupErrorType == "" && created && dropped,
        passedCases = passes, schema, exclusivelyCreatedByThisProcess = created, schemaDroppedAndVerifiedAbsent = dropped,
        productionDatabase = "mir2_db", productionOperations = new[] { "SHOW CREATE TABLE for ten allowlisted tables only" },
        productionRowWrites, productionAccountsReadOrChanged = false, serviceOrRuntimeChanges = false,
        credentialsLogged = false, definitions, operations, cases, errorType, cleanupErrorType,
        scope = "Actual production PlayDataStorage/StorageContext and MySqlConnector against an exclusively owned temporary InnoDB schema on the approved local instance. Trigger and missing-table SQL errors are checked by fresh-connection snapshots of all ten tables. No production schema data writes or account operations. Add and subsequent Update remain separate transactions.",
        limitations = new[] { "No network interruption, crash, restart, or lost COMMIT response was injected.", "The post-COMMIT exception test deliberately observes persisted data alongside a false result; false means success cannot be acknowledged, not proof of rollback.", "No native TCP ACK, game save queue, browser, or original-client execution is covered by this storage harness.", "Duplicate-position prevention for newly missing slots relies on production saves sharing the locked character row; independent administrative writers bypassing that protocol are not covered." }
    };
    using var file = new FileStream(reportPath, FileMode.CreateNew, FileAccess.Write);
    JsonSerializer.Serialize(file, report, new JsonSerializerOptions { WriteIndented = true });
}
return errorType == "" && cleanupErrorType == "" && created && dropped ? 0 : 1;

sealed class SqlFixtureStorage : PlayDataStorage
{
    private readonly string connectionString;
    public RealSqlContext? LastContext;
    public string CommitFailure = "";
    public Action? BeforeFirstWrite;
    public readonly Dictionary<string, Action> BeforeSlotLocks = [], BeforeSlotWrites = [];
    private static readonly FieldInfo Indexes = typeof(PlayDataStorage).GetField("_IndexQuickIdMap", BindingFlags.NonPublic | BindingFlags.Instance)!;
    public int QuickIndexCount => ((Dictionary<int, int>)Indexes.GetValue(this)!).Count;
    public SqlFixtureStorage(string value) : base(new StorageOption { ConnectionString = value }) { connectionString = value; }
    protected override StorageContext CreateSaveContext()
    {
        LastContext = new RealSqlContext(new StorageOption { ConnectionString = connectionString }, CommitFailure, BeforeFirstWrite,
            new Dictionary<string, Action>(BeforeSlotLocks), new Dictionary<string, Action>(BeforeSlotWrites));
        return LastContext;
    }
}
sealed class RealSqlContext(StorageOption options, string commitFailure, Action? beforeFirstWrite,
    Dictionary<string, Action> beforeSlotLocks, Dictionary<string, Action> beforeSlotWrites) : StorageContext(options)
{
    public int SqlExceptionNumber, ReadFailureNumber, ZeroAffectedWrites, WriteCalls;
    public string SqlState = "";
    private readonly HashSet<string> observedSlotLocks = [], observedSlotWrites = [];
    public override void Open(ref bool success)
    {
        base.Open(ref success);
        if (success)
        {
            using var command = GetConnection().CreateCommand();
            command.CommandText = "SET SESSION innodb_lock_wait_timeout=1";
            command.ExecuteNonQuery();
        }
    }
    public override int ExecuteNonQuery(MySqlCommand command)
    {
        try
        {
            if (WriteCalls++ == 0) beforeFirstWrite?.Invoke();
            string table = Regex.Match(command.CommandText, @"(?:UPDATE|INTO)\s+(characters(?:_\w+)?)", RegexOptions.IgnoreCase).Groups[1].Value;
            if (beforeSlotWrites.TryGetValue(table, out var hook) && observedSlotWrites.Add(table)) hook();
            int rows = base.ExecuteNonQuery(command);
            if (rows == 0) ZeroAffectedWrites++;
            return rows;
        }
        catch (MySqlException error) { SqlExceptionNumber = error.Number; SqlState = error.SqlState ?? ""; throw; }
    }
    public override System.Data.Common.DbDataReader ExecuteReader(MySqlCommand command)
    {
        try
        {
            string table = Regex.Match(command.CommandText, @"FROM\s+(characters(?:_\w+)?)", RegexOptions.IgnoreCase).Groups[1].Value;
            if (command.Parameters.Contains("@RowId") && beforeSlotLocks.TryGetValue(table, out var hook) && observedSlotLocks.Add(table)) hook();
            return base.ExecuteReader(command);
        }
        catch (MySqlException error) { ReadFailureNumber = error.Number; throw; }
    }
    public override void Commit()
    {
        if (commitFailure == "before") throw new InvalidOperationException("injected-before-COMMIT");
        base.Commit();
        if (commitFailure == "after") throw new InvalidOperationException("injected-after-completed-COMMIT");
    }
}
