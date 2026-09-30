# 特殊戒指现状（2026-09-30）

`vendor/openmir2/sql/mir2_data.sql` 的 `stditems` 350–358 号已经定义了以下九枚戒指，客户端图标编号也已配置。下面的效果依据当前服务端源码审计，**尚未逐枚做实际穿戴与战斗测试**。

| 戒指 | 当前代码中的效果 |
| --- | --- |
| 传送戒指 | 穿戴后设置 `Teleport`；原设计可用 `@传送 x y` 在当前地图移动到可通行坐标，冷却配置为 10 秒。 |
| 隐身戒指 | 穿戴后进入隐身状态。 |
| 麻痹戒指 | 攻击时按目标抗毒与配置概率触发石化；当前基础参数为 `AttackPosionRate=5`、`AttackPosionTime=4`。 |
| 复活戒指 | 致命伤时恢复满 HP，并消耗戒指持久；当前冷却配置为 60 秒。 |
| 火焰戒指 | 赋予火球术物品技能。 |
| 防御戒指 | 赋予治愈术物品技能。 |
| 求婚戒指 | 数据库有普通戒指条目，当前没有找到对应特殊效果；婚姻相关功能需单独验证。 |
| 护身戒指 | 受伤时优先用 MP 抵扣，伤害与 MP 消耗按 1:1.5 换算。 |
| 超负载戒指 | 背包、穿戴与持武器负重上限约翻倍，受字段上限限制。 |

当前试玩环境的怪物掉落表与 NPC 商店脚本没有配置这九枚戒指；仅有数据库定义并不代表能正常获得。要试玩，应先设计掉落或领取渠道，再实测客户端图标、装备持久和效果。

源码还发现两处阻碍正式使用的问题：

1. `command.conf` 把 `UserMove` 命名为 `传送`，但命令默认最低权限为 10，普通角色 `StartPermission=0`；命令处理器先检查权限。因此传送戒指虽然设置了 `Teleport`，普通角色仍不能用 `@传送 x y`。需要把该命令单独开放给普通角色，仍保留服务端的“必须穿戴戒指”判断。
2. `PlayObject.RecalcAbilitys()` 会清除 `RecoveryRing` 和 `MagicShield` 等状态，却未在重算开始时清除 `Teleport`、`Paralysis`、`Revival`、`FlameRing`、`MuscleRing`。这些效果只看到设为 `true` 的路径，卸下或损坏戒指后可能持续到重登。修复后应逐枚测试穿戴、摘下、损坏与重登。

主要依据：`vendor/openmir2/src/M2Server/Player/PlayObject.cs` 的 `RecalcAbilitys`、`vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs` 的攻击逻辑、`vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs` 的复活逻辑、`vendor/openmir2/src/M2Server/Actor/BaseObject.cs` 的伤害逻辑，以及 `vendor/openmir2/src/Modules/GameCommand/Commands/UserMoveXYCommand.cs` 和 `GameCommands.cs`。
