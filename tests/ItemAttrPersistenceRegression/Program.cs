using System.Reflection;
using DBSrv.Storage;
using DBSrv.Storage.MySQL;
using MySqlConnector;
using OpenMir2.Packets.ServerPackets;

if (args.Length != 1)
    throw new ArgumentException("Pass the local mysql-client.ini path.");

var settings = File.ReadAllLines(args[0])
    .Where(line => line.Contains('=') && !line.TrimStart().StartsWith('#'))
    .Select(line => line.Split('=', 2))
    .ToDictionary(parts => parts[0].Trim(), parts => parts[1].Trim(), StringComparer.OrdinalIgnoreCase);
var connectionString = new MySqlConnectionStringBuilder
{
    Server = settings["host"],
    Port = uint.Parse(settings["port"]),
    UserID = settings["user"],
    Password = settings["password"],
    Database = "mir2_db"
}.ConnectionString;
var option = new StorageOption { ConnectionString = connectionString };
var storage = new PlayDataStorage(option);
const int playerId = int.MaxValue;
const int makeIndex = int.MaxValue - 1;

static void Check(bool result, string message)
{
    if (!result) throw new Exception(message);
}

void DeleteTestRows()
{
    using var connection = new MySqlConnection(connectionString);
    connection.Open();
    using var command = connection.CreateCommand();
    command.CommandText = "DELETE FROM characters_item_attr WHERE PlayerId=@PlayerId";
    command.Parameters.AddWithValue("@PlayerId", playerId);
    command.ExecuteNonQuery();
}

int ReadBonus()
{
    using var connection = new MySqlConnection(connectionString);
    connection.Open();
    using var command = connection.CreateCommand();
    command.CommandText = "SELECT Value2 FROM characters_item_attr WHERE PlayerId=@PlayerId AND MakeIndex=@MakeIndex";
    command.Parameters.AddWithValue("@PlayerId", playerId);
    command.Parameters.AddWithValue("@MakeIndex", makeIndex);
    return Convert.ToInt32(command.ExecuteScalar() ?? 0);
}

var saveMethod = typeof(PlayDataStorage).GetMethod("ReplaceItemAttrs", BindingFlags.NonPublic | BindingFlags.Instance)!;
var loadMethod = typeof(PlayDataStorage).GetMethod("QueryItemAttr", BindingFlags.NonPublic | BindingFlags.Instance)!;
void Save(ServerUserItem[] worn, ServerUserItem[] bag)
{
    using var context = new StorageContext(option);
    bool opened = false;
    context.Open(ref opened);
    Check(opened, "test database did not open");
    context.BeginTransaction();
    saveMethod.Invoke(storage, [context, playerId, worn, bag, Array.Empty<ServerUserItem>()]);
    context.Commit();
}

try
{
    DeleteTestRows();
    var item = new ServerUserItem { MakeIndex = makeIndex, Index = 42 };
    item.Desc[0] = 10;
    item.Desc[1] = 10;
    item.Desc[2] = 7;
    item.Desc[3] = 50;
    item.Desc[4] = 50;
    Save([], [item]);
    Check(ReadBonus() == 7, "first save did not insert the new equipment bonus");

    var loaded = new ServerUserItem[] { new() { MakeIndex = makeIndex, Index = 42 } };
    using (var context = new StorageContext(option))
    {
        bool opened = false;
        context.Open(ref opened);
        Check(opened, "test database did not reopen");
        object[] loadArgs = [context, playerId, loaded];
        loadMethod.Invoke(storage, loadArgs);
    }
    Check(loaded[0].Desc.Take(5).SequenceEqual(new byte[] { 10, 10, 7, 50, 50 }),
        "login reload lost one or more independent equipment bonuses");

    using (var context = new StorageContext(option))
    {
        bool opened = false;
        context.Open(ref opened);
        Check(opened, "test database did not open for rollback");
        context.BeginTransaction();
        var invalid = new ServerUserItem { MakeIndex = makeIndex, Index = 42, Desc = [1] };
        try
        {
            saveMethod.Invoke(storage, [context, playerId, Array.Empty<ServerUserItem>(),
                new ServerUserItem[] { invalid }, Array.Empty<ServerUserItem>()]);
            throw new Exception("invalid attribute length unexpectedly succeeded");
        }
        catch (TargetInvocationException ex) when (ex.InnerException is IndexOutOfRangeException)
        {
            context.RollBack();
        }
    }
    Check(ReadBonus() == 7, "failed save did not roll back the previous bonus");

    item.Desc[2] = 9;
    Save([item], []);
    Check(ReadBonus() == 9, "moving equipment from bag to worn slot lost its bonus");

    Save([], []);
    Check(ReadBonus() == 0, "removed equipment kept an orphaned bonus");
    Console.WriteLine("Item attribute insert, reload, rollback, slot move, and removal passed.");
}
finally
{
    DeleteTestRows();
}
