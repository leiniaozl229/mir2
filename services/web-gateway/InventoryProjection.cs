using System.Buffers.Binary;
using System.Text;

namespace Mir2.WebGateway;

public record InventoryItem(string name, int makeIndex, ushort durability, ushort maxDurability, byte stdMode, byte weight, ushort looks);

public static class InventoryProjection
{
    public static InventoryItem Parse(ReadOnlySpan<byte> body)
    {
        if (body.Length != 124 || body[0] > 14) throw new InvalidDataException("Invalid ClientItem layout");
        return new(LegacyCodec.Gbk.GetString(body.Slice(1, body[0])),
            BinaryPrimitives.ReadInt32LittleEndian(body[100..]), BinaryPrimitives.ReadUInt16LittleEndian(body[104..]),
            BinaryPrimitives.ReadUInt16LittleEndian(body[106..]), body[15], body[17], BinaryPrimitives.ReadUInt16LittleEndian(body[22..]));
    }

    public static object? Project(LegacyPacket packet)
    {
        if (packet.Id == 201)
        {
            var items = ParseInventory(packet);
            return new { type = "inventory", items };
        }
        return packet.Id switch
        {
            200 => new { type = "itemAdded", item = Parse(packet.Body) },
            202 => new { type = "itemRemoved", makeIndex = Parse(packet.Body).makeIndex },
            203 => new { type = "itemUpdated", item = Parse(packet.Body) },
            621 => new { type = "equipment", slots = ParseEquipment(packet).Select(value => new { slot = value.Key, item = value.Value }) },
            600 or 601 => new { type = "dropResult", makeIndex = packet.Recog, accepted = packet.Id == 600 },
            610 => new { type = "groundItem", id = packet.Recog, x = packet.Param, y = packet.Tag, looks = packet.Series, name = packet.Text },
            611 => new { type = "groundItemRemoved", id = packet.Recog },
            _ => null
        };
    }

    public static InventoryItem[] ParseInventory(LegacyPacket packet)
    {
        if (packet.Id != 201) throw new InvalidDataException("Expected inventory packet");
        string[] records = Encoding.ASCII.GetString(packet.EncodedBody).Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (records.Length != packet.Series) throw new InvalidDataException("Inventory count mismatch");
        var items = records.Select(record => Parse(LegacyCodec.Decode(Encoding.ASCII.GetBytes(record)))).ToArray();
        if (items.Select(item => item.makeIndex).Distinct().Count() != items.Length)
            throw new InvalidDataException("Duplicate inventory identity");
        return items;
    }

    public static Dictionary<int, InventoryItem> ParseEquipment(LegacyPacket packet)
    {
        if (packet.Id != 621) throw new InvalidDataException("Expected equipment packet");
        string[] records = Encoding.ASCII.GetString(packet.EncodedBody).Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (records.Length % 2 != 0) throw new InvalidDataException("Invalid equipment records");
        var result = new Dictionary<int, InventoryItem>();
        for (int i = 0; i < records.Length; i += 2)
        {
            if (!int.TryParse(records[i], out int slot) || slot < 0 || slot > 12 || result.ContainsKey(slot))
                throw new InvalidDataException("Invalid equipment slot");
            result[slot] = Parse(LegacyCodec.Decode(Encoding.ASCII.GetBytes(records[i + 1])));
        }
        if (result.Values.Select(item => item.makeIndex).Distinct().Count() != result.Count)
            throw new InvalidDataException("Duplicate equipped item identity");
        return result;
    }
}
