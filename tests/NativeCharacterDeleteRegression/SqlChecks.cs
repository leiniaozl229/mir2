using System.Reflection;
using System.Text.Json;
using System.Text.RegularExpressions;
using DBSrv.Conf;
using DBSrv.Services.Impl;
using DBSrv.Storage;
using DBSrv.Storage.Model;
using DBSrv.Storage.MySQL;
using MySqlConnector;
using OpenMir2;

// Opt-in real storage check. Every write uses a new, owned schema; production
// table definitions are read-only. Neither credentials nor SQL errors are printed.
internal static class SqlChecks
{
    public static void Run(string[] args)
    {
        string root = Directory.GetCurrentDirectory();
        string approved = Path.GetFullPath(Path.Combine(root, ".runtime/mysql-client.ini"));
        string report = Path.GetFullPath(args[1]);
        if (!string.Equals(Path.GetFullPath(args[0]), approved, StringComparison.OrdinalIgnoreCase)
            || !report.StartsWith(Path.GetFullPath(Path.Combine(root, ".runtime/reports")) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            || !Path.GetFileName(report).StartsWith("selection-v15-sql-", StringComparison.Ordinal) || File.Exists(report))
            throw new ArgumentException("Use approved settings and a new selection-v15-sql report.");
        string schema = "mir2_delete_v15_" + Guid.NewGuid().ToString("N")[..16];
        if (!Regex.IsMatch(schema, @"\Amir2_delete_v15_[0-9a-f]{16}\z")) throw new Exception("Unsafe schema.");
        bool created = false, dropped = false;
        string error = "", cleanupError = "", phase = "initialization", connectionString = "";
        var cases = new List<string>();
        MySqlConnection admin = null;
        void Check(bool value, string reason) { if (!value) throw new InvalidOperationException(reason); }
        void Execute(string sql)
        {
            Check(created, "Schema not owned");
            using var c = new MySqlConnection(connectionString); c.Open();
            Check(c.Database == schema, "Wrong write destination");
            using var cmd = c.CreateCommand(); cmd.CommandText = sql; cmd.ExecuteNonQuery();
        }
        long Scalar(string sql)
        {
            using var c = new MySqlConnection(connectionString); c.Open();
            Check(c.Database == schema, "Wrong read destination");
            using var cmd = c.CreateCommand(); cmd.CommandText = sql;
            return Convert.ToInt64(cmd.ExecuteScalar());
        }
        void Test(string name, Action run) { phase = name; run(); cases.Add(name); Console.WriteLine("PASS isolated SQL: " + name); }
        try
        {
            var settings = File.ReadAllLines(approved)
                .Where(l => l.Contains('=') && !l.TrimStart().StartsWith('#') && !l.TrimStart().StartsWith(';'))
                .Select(l => l.Split('=', 2)).ToDictionary(p => p[0].Trim(), p => p[1].Trim(), StringComparer.OrdinalIgnoreCase);
            Check(settings["host"] is "127.0.0.1" or "localhost" && uint.Parse(settings["port"]) == 13306, "Only approved local MySQL");
            var options = new MySqlConnectionStringBuilder { Server = "127.0.0.1", Port = 13306, UserID = settings["user"], Password = settings["password"], Pooling = false, UseAffectedRows = true };
            admin = new MySqlConnection(options.ConnectionString); admin.Open();
            var ddl = new List<string>();
            foreach (string table in new[] { "characters_indexes", "characters" })
            {
                using var cmd = admin.CreateCommand();
                cmd.CommandText = "SHOW CREATE TABLE mir2_db." + table;
                using var reader = cmd.ExecuteReader(); Check(reader.Read(), "Source definition absent");
                ddl.Add(reader.GetString(1));
            }
            using (var cmd = admin.CreateCommand()) { cmd.CommandText = "CREATE DATABASE `" + schema + "` CHARACTER SET utf8mb4"; cmd.ExecuteNonQuery(); created = true; }
            options.Database = schema; connectionString = options.ConnectionString;
            foreach (string definition in ddl) Execute(definition);
            Execute("INSERT INTO characters_indexes (Id,Account,ChrName,SelectID,IsDeleted,CreateDate,ModifyDate) VALUES (17,'fixture-owner','Fixture',1,0,now(),now())");
            Execute("INSERT INTO characters (Id,LoginID,ChrName,Job,Hair,Sex,Level,Deleted) VALUES (23,'fixture-owner','Fixture',0,0,0,1,0)");
            var recordStorage = new PlayRecordStorage(new StorageOption { ConnectionString = connectionString });
            var dataStorage = new PlayDataStorage(new StorageOption { ConnectionString = connectionString });
            recordStorage.LoadQuickList(); dataStorage.LoadQuickList();
            var service = new UserService(new SettingsModel { DeleteMinLevel = 30 }, null, recordStorage, dataStorage);
            var method = typeof(UserService).GetMethod("TryDeleteCharacter", BindingFlags.Instance | BindingFlags.NonPublic)!;
            bool Delete() => (bool)method.Invoke(service, new object[] { "Fixture", "fixture-owner" })!;
            Test("missing query row returns false and clears a previous value", () => {
                QueryChr value = new() { Name = "stale", Level = 0 };
                Check(!dataStorage.GetQryChar(9999, ref value) && value == null, "Missing row promoted to level zero");
            });
            Test("actual level boundary prevents SQL writes", () => {
                Execute("UPDATE characters SET Level=30 WHERE Id=23");
                Check(!Delete() && Scalar("SELECT IsDeleted FROM characters_indexes WHERE Id=17") == 0, "Limit bypass");
                Execute("UPDATE characters SET Level=1 WHERE Id=23");
            });
            Test("stale level index cannot delete after data row disappears", () => {
                Execute("DELETE FROM characters WHERE Id=23");
                Check(!Delete() && Scalar("SELECT IsDeleted FROM characters_indexes WHERE Id=17") == 0, "Missing data allowed deletion");
                Execute("INSERT INTO characters (Id,LoginID,ChrName,Job,Hair,Sex,Level,Deleted) VALUES (23,'fixture-owner','Fixture',0,0,0,1,0)");
            });
            Test("zero-row Update returns false with a stale cached index", () => {
                bool found = false; var value = recordStorage.Get(17, ref found); Check(found, "Fixture missing");
                value.Deleted = true;
                Execute("DELETE FROM characters_indexes WHERE Id=17");
                Check(!recordStorage.Update(17, ref value), "No affected row acknowledged");
                Execute("INSERT INTO characters_indexes (Id,Account,ChrName,SelectID,IsDeleted,CreateDate,ModifyDate) VALUES (17,'fixture-owner','Fixture',1,0,now(),now())");
            });
            Test("SQL write exception returns false and leaves stored deletion flag clear", () => {
                bool found = false; var value = recordStorage.Get(17, ref found); value.Deleted = true;
                Execute("CREATE TRIGGER delete_v15_fail BEFORE UPDATE ON characters_indexes FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture'");
                try { Check(!recordStorage.Update(17, ref value) && Scalar("SELECT IsDeleted FROM characters_indexes WHERE Id=17") == 0, "Failed write changed row"); }
                finally { Execute("DROP TRIGGER delete_v15_fail"); }
            });
            Test("real UserService deletion commits one index flag on a fresh SQL connection", () => {
                Check(Delete() && Scalar("SELECT IsDeleted FROM characters_indexes WHERE Id=17") == 1, "Deletion not persisted");
                Check(Scalar("SELECT COUNT(*) FROM characters WHERE Id=23") == 1, "Deletion erased character data");
            });
            Test("duplicate deletion is refused and account count excludes the stored tombstone", () => {
                Check(!Delete() && recordStorage.ChrCountOfAccount("fixture-owner") == 0, "Deleted role counted or replay accepted");
            });
            Test("fresh storage reload excludes deleted role while retaining data name", () => {
                var freshRecords = new PlayRecordStorage(new StorageOption { ConnectionString = connectionString }); freshRecords.LoadQuickList();
                var freshData = new PlayDataStorage(new StorageOption { ConnectionString = connectionString }); freshData.LoadQuickList();
                Check(freshRecords.Index("Fixture") == -1 && freshRecords.ChrCountOfAccount("fixture-owner") == 0 && freshData.Index("Fixture") == 23, "Restart tombstone visibility differs");
            });
        }
        catch (Exception ex) { error = ex.GetType().Name; }
        finally
        {
            if (created && admin != null) try {
                using var cmd = admin.CreateCommand(); cmd.CommandText = "DROP DATABASE `" + schema + "`"; cmd.ExecuteNonQuery();
                cmd.CommandText = "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=@schema"; cmd.Parameters.AddWithValue("@schema", schema);
                dropped = Convert.ToInt32(cmd.ExecuteScalar()) == 0;
            } catch (Exception ex) { cleanupError = ex.GetType().Name; }
            admin?.Dispose();
            using var stream = new FileStream(report, FileMode.CreateNew);
            JsonSerializer.Serialize(stream, new { recordedAt = DateTimeOffset.UtcNow, ok = error == "" && cleanupError == "" && dropped && cases.Count == 8, created, dropped, schema, phase, errorType = error, cleanupErrorType = cleanupError, cases, productionRowWrites = false, authenticatedAccountUsed = false, scope = "Actual native deletion method and actual MySQL storages with real local owned schema only; read-only production table definitions, no native deployment or browser." }, new JsonSerializerOptions { WriteIndented = true });
        }
        if (error != "" || cleanupError != "" || !dropped || cases.Count != 8) throw new Exception("Isolated SQL validation failed; inspect sanitized report.");
    }
}
