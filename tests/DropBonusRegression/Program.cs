using M2Server.Items;
using Mir2.WebGateway;
using OpenMir2.Data;
using OpenMir2.Packets.ClientPackets;

System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);

static void Require(bool ok, string message)
{
    if (!ok) throw new Exception(message);
}

var items = new GameItemSystem();
var sword = new StdItem { Name = "测试剑", StdMode = 5, DC = (ushort)((5 << 8) | 2) };
var drop = new UserItem();
GameItemSystem.ApplyMonsterDropStatBonus(sword, drop, 0);
Require(drop.Desc[0] == 0, "zero quality leaves the base attack unchanged");
GameItemSystem.ApplyMonsterDropStatBonus(sword, drop, 100);
Require(drop.Desc[0] == 5 && drop.Desc[1] == 0,
    "full quality doubles the nonzero base maximum only");
ClientItem clientItem = new();
items.GetUpgradeStdItem(sword, drop, ref clientItem);
Require((clientItem.Item.DC >> 8) == 10 && clientItem.Desc[0] == 5
    && clientItem.GetBuffer()[108] == 5,
    "bonus is present in the final attribute and the native item packet");
var projected = InventoryProjection.Parse(clientItem.GetBuffer());
Require(projected.dc.max == 10 && projected.bonus.dc == 5,
    "web gateway keeps the final stat and separate green bonus");

var armour = new StdItem { Name = "测试衣服", StdMode = 10,
    AC = (ushort)((8 << 8) | 1), MAC = (ushort)(3 << 8) };
var armourDrop = new UserItem();
GameItemSystem.ApplyMonsterDropStatBonus(armour, armourDrop, 50);
Require(armourDrop.Desc[0] == 4 && armourDrop.Desc[1] == 2,
    "one quality roll scales each nonzero combat attribute");

var ringDrop = new UserItem();
GameItemSystem.ApplyMonsterDropStatBonus(new StdItem { StdMode = 22, DC = (ushort)(3 << 8) },
    ringDrop, 100);
Require(ringDrop.Desc[2] == 3, "jewelry uses the accessory stat layout");

var capped = new StdItem { StdMode = 5, DC = (ushort)(200 << 8) };
var cappedDrop = new UserItem();
GameItemSystem.ApplyMonsterDropStatBonus(capped, cappedDrop, 100);
Require(cappedDrop.Desc[0] == 55, "rolled maximum fits in the legacy byte");

var specialDrop = new UserItem();
specialDrop.Desc[0] = 2;
GameItemSystem.ApplyMonsterDropStatBonus(sword, specialDrop, 100);
Require(specialDrop.Desc[0] == 7, "rolled bonus preserves existing special-item upgrades");

var potionDrop = new UserItem();
GameItemSystem.ApplyMonsterDropStatBonus(new StdItem { StdMode = 0, DC = (ushort)(5 << 8) },
    potionDrop, 100);
Require(potionDrop.Desc[0] == 0, "consumables do not gain combat attributes");
Console.WriteLine("Drop bonus regression passed.");
