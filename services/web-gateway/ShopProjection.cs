using System.Text;

namespace Mir2.WebGateway;

public record ShopGoods(string name, int subMenu, int price, int stock);
public record ShopDetail(string name, int makeIndex, int price, ushort durability, byte stdMode, byte weight, ushort looks);

public static class ShopProjection
{
    public static ShopGoods[] ParseGoods(LegacyPacket packet)
    {
        if (packet.Id != 645) throw new InvalidDataException("Expected shop goods packet");
        string[] fields = packet.Text.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (fields.Length != packet.Param * 4) throw new InvalidDataException("Shop goods count mismatch");
        var goods = new ShopGoods[packet.Param];
        var names = new HashSet<string>(StringComparer.Ordinal);
        for (int i = 0; i < goods.Length; i++)
        {
            string name = fields[i * 4];
            if (name.Length == 0 || !int.TryParse(fields[i * 4 + 1], out int subMenu) || subMenu is < 0 or > 1
                || !int.TryParse(fields[i * 4 + 2], out int price) || price <= 0
                || !int.TryParse(fields[i * 4 + 3], out int stock) || stock < 0 || !names.Add(name))
                throw new InvalidDataException("Invalid shop goods record");
            goods[i] = new(name, subMenu, price, stock);
        }
        return goods;
    }

    public static ShopDetail[] ParseDetails(LegacyPacket packet)
    {
        if (packet.Id != 652) throw new InvalidDataException("Expected shop detail packet");
        // This legacy message wraps a slash-separated list whose individual ClientItem records are encoded again.
        string[] records = Encoding.ASCII.GetString(packet.Body).Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (records.Length != packet.Param) throw new InvalidDataException("Shop detail count mismatch");
        var details = records.Select(record =>
        {
            var item = InventoryProjection.Parse(LegacyCodec.Decode(Encoding.ASCII.GetBytes(record)));
            if (item.makeIndex <= 0 || item.maxDurability == 0) throw new InvalidDataException("Invalid shop detail item");
            return new ShopDetail(item.name, item.makeIndex, item.maxDurability, item.durability, item.stdMode, item.weight, item.looks);
        }).ToArray();
        if (details.Select(item => item.makeIndex).Distinct().Count() != details.Length)
            throw new InvalidDataException("Duplicate shop detail identity");
        return details;
    }

    public static object? Project(LegacyPacket packet) => packet.Id switch
    {
        645 => new { type = "shop", npcId = packet.Recog, items = ParseGoods(packet) },
        652 => new { type = "shopDetails", npcId = packet.Recog, page = packet.Tag, items = ParseDetails(packet) },
        644 => new { type = "npcDialogueClosed", npcId = packet.Recog },
        _ => null
    };
}
