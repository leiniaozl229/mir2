using System.Text;

namespace Mir2.WebGateway;

public static class StorageProjection
{
    public static InventoryItem[] ParseItems(LegacyPacket packet)
    {
        if (packet.Id != 704 || packet.Tag > packet.Series) throw new InvalidDataException("Invalid storage page");
        string[] records = Encoding.ASCII.GetString(packet.EncodedBody).Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (records.Length > 50) throw new InvalidDataException("Storage page exceeds item limit");
        var items = records.Select(record => InventoryProjection.Parse(LegacyCodec.Decode(Encoding.ASCII.GetBytes(record)))).ToArray();
        if (items.Select(item => item.makeIndex).Distinct().Count() != items.Length)
            throw new InvalidDataException("Duplicate storage item identity");
        return items;
    }
}
