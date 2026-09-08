# 游戏资源目录与管理器

## 打开管理器

开发服务启动后访问 `http://127.0.0.1:5173/resources.html`。管理器集中展示以下关联数据：

- 物品与装备：SQL 全字段、StdMode 分类、背包/装备素材、佩戴条件、属性和掉落怪物。
- 技能：职业、学习等级、熟练度、耗蓝公式、威力参数、施放机制、材料、状态和图标。
- 怪物：等级、经验、战斗数值、RaceImg/Appr、动画覆盖、刷新地图和逐行掉落概率。
- 地图与刷新：570 张版本地图、尺寸、小地图、刷新中心、半径、数量和刷新时间。
- 素材库：地图、角色、怪物、物品、魔法和 UI 导出库的有效帧、空帧、缺失帧及来源哈希。

页面的“缺失素材/关联”筛选可直接形成后续补图和规则接入队列。总览保留源数据自身的问题，例如重复 MagicId、基线外刷新地图、未定义刷新怪物和掉落表引用的未定义物品；这些记录不会在生成时被静默修正。

图标按“国服 WIL → 扩展 Crystal Lib → 地面物品图”的顺序解析，并在详情中标出实际来源。当前 1.76 基线全部有图；扩展数据仍有 9 个物品和 2 个技能找不到任何对应素材。角色技能与英雄技能可以共用执行机制 ID，管理器将其显示为机制别名；不同执行机制共用 ID 会列为冲突。

`0024-fix-conflicting-skill-identities.patch` 修复了群体施毒术与气功波占用同一 MagicId 48 的冲突：气功波保留 48，群体施毒术迁移到 104，并将其图标单独映射到 `MagIcon` 38 帧。服务端技能槽扩展到 1024，可容纳当前最高 501 以及管理器生成的后续编号。现有 12 组四级/英雄技能共用机制 ID，执行效果一致，目录按机制别名呈现。

## 生成与校验

目录文件为 `content/classic-176/resource-catalog.json`。它由权威配置生成，请勿手工编辑。

```bash
python3 tools/resource_catalog.py build
python3 tools/resource_catalog.py validate
python3 -m unittest tests.test_resource_catalog
npm run test:resources
```

`test:resources` 使用临时无头浏览器，不会弹出独立窗口。它会从页面完成装备、技能、怪物、地图、缺失队列和新增技能模板的查询，截图与 JSON 报告写入 `.runtime/reports/resource-manager-smoke/`，方便 agent 在改动数据或素材后复查。

生成器读取：

- `.runtime/sql/02-mir2_data.sql`：`stditems`、`magics`、`monsters`。
- `content/classic-176/version-profile.json`：1.76 版本基线。
- `content/classic-176/skill-rules.json` 与 `skill-combat.json`：技能数值锁定和 Web 执行规则。
- `vendor/mirserver-data/Mir200/Envir/MonGen.txt`：怪物刷新。
- `vendor/mirserver-data/Mir200/Envir/MonItems/*.txt`：怪物掉落。
- `MapInfo.txt`、`MiniMap.txt`、`assets/web/**/library.json`：地图名称、小地图和客户端素材状态。

## 新增装备或物品

管理器右上角的“新增资源模板”可以生成 SQL 与检查清单。命令行也能生成起始记录：

```bash
python3 tools/resource_catalog.py new item --name 龙纹剑
```

完成一件物品需要同步检查：

1. 在 `stditems` 分配唯一 `Id`，选择正确的 `StdMode`、`Shape`、`ImgIndex`、持久、属性和佩戴条件。
2. 确认 `Items.wil` 中的背包图标；衣服、武器和头盔还要核对 `StateItem.wil` 以及角色外观层。
3. 商店出售时更新对应 Merchant 文件；怪物掉落时更新 `MonItems/怪物名.txt`。
4. 属于版本基线时加入 `version-profile.json` 的 `p0Baseline.items`。
5. 重新准备运行时、生成目录并运行目录测试和实机物品测试。

常见 `StdMode`：`5/6` 武器、`10/11` 男女衣服、`15` 头盔、`19/20/21` 项链、`22/23` 戒指、`24/26` 手镯、`25` 符或药粉、`30` 照明或勋章、`52` 鞋、`54` 腰带。完整字段解释在管理器“总览与机制”中。

## 新增技能

```bash
python3 tools/resource_catalog.py new skill --name 新剑术
```

技能需要同时维护：

1. 在 `magics` 分配唯一 `Idx` 与 `MagID`，填写效果、耗蓝、威力、职业、学习等级和熟练度阈值。
2. 在 `skill-rules.json` 锁定服务器数值，在 `skill-combat.json` 声明目标型、自身型、开关、蓄力或被动机制，以及材料和状态位。
3. 核对 `magic-icons` 的 `MagID` 图标；主动技能在 `magic-effects.ts` 配置匹配的动画序列。
4. 属于版本基线时加入 `version-profile.json` 的 `p0Baseline.skills`。
5. 运行 `skill_catalog_audit.py`、`skill_combat_audit.py`、`skill_visual_audit.py`、前端回归和真实施法测试。

技能耗蓝按 `round(spell / 4 × (技能等级 + 1)) + defSpell` 计算。`EffectType` 和 `Effect` 决定服务器执行分支与视觉路由，新增前应确认 OpenMir2 中对应的处理逻辑。

## 掉落和地图分布

`MonItems` 的 `numerator/denominator` 是单行独立判定，页面同时显示原始比例和百分比。重复行代表多次独立掉落机会，管理器保留每一行，方便核对 Boss 多掉落行为。

`MonGen` 每行依次记录地图、中心坐标、怪物、刷新半径、数量和刷新分钟。管理器可以从怪物查看所有地图，也可以从地图反查全部刷新组。新增刷新点后要确认地图存在、中心可通行、怪物 SQL 已定义、动画有映射、掉落表可读取。
