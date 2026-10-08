# Web 客户端玩法复刻清单

审计日期：2026-10-02。本文件与 [机器底稿](replication/gameplay.json) 共用稳定需求 ID；覆盖完整经典玩法和 33 个候选技能，P0 的 15 个技能不会替代完整范围。依据是本次实际读取的工作树、固定原服源码、参考客户端源码以及当前存在的本机报告。新增要求继续分配新 ID，已分配 ID 不复用。

当前台账（2026-10-02）：80 项，缺失 0、部分实现 79、代码实现/未完成验收 1、已完整验证 0；完整游戏内容仍未闭合。

## 状态与证据规则

- `missing`：没有可用的对应行为入口或核心实现。
- `partial`：已存在部分输入、投影、表现或规则，仍有实现/验收缺口。
- `implemented`：对应实现已闭合，仍待要求范围内的完整验收。
- `verified`：所有成功、失败、边界场景已通过，并有生产浏览器交互及适用的同版本原端对照；当前清单没有达到该状态的条目。

依据分为**原端像素 / 原端实机 / 参考源码 / 固定原服源码 / 项目契约 / 工作树审计**。参考源码不是已证明与当前 `mir.dat` 完全相同的源码；项目输入契约不能证明全部历史数值。固定原服源码能说明服务器当前行为，同期原版数值仍需单独校准。

验证严格分为**纯回归 / 真实协议 / 浏览器交互 / 原端对照**：Node VM/单元回归证明有限逻辑；真实 WebSocket→Gate→原服证明消息与结果；生产页输入回放证明实际交互；同场景原端视频/截图/时间线证明复刻细节。只存在探针脚本或文档中的旧“通过”声明，不能当作当前已通过的证据。

每一项至少有成功、失败、边界三类验收。机器底稿中所有 implementation/sourceEvidence/verification 路径必须实际存在；尚未创建的测试、素材、报告只记缺口。原服负责坐标、HP/MP、伤害、实例、经济、成长和任务结果；浏览器只发意图并表现确认状态。

## 当前验证边界

| 当前报告 | 本次实际读取的结论 | 不能据此证明的内容 |
| --- | --- | --- |
| [frontend-events-final.log](../.runtime/reports/frontend-events-final.log) | 42 项纯前端回归 PASS | 本轮真实浏览器交互、全部 UI 状态、原端动态/像素一致 |
| [gateway-events-final.log](../.runtime/reports/gateway-events-final.log) | 地面/辅助/冲撞目标、战士优先级、编解码/分包/动作确认三个测试组 PASS | .NET 10 原目标运行、真实伤害或每个技能完整玩法；当前执行为 .NET 8 兼容构建 |
| [world-events-live.json](../.runtime/reports/world-events-live.json) | 11 项真实协议检查 true：火墙五格 ID/坐标/到期、冲撞阻挡/位移/被推、恢复移动 | 火墙伤害、灯光、浏览器帧表现与原端时间线 |
| [gameplay-live-check.json](../.runtime/reports/gameplay-live-check.json) | 15 项检查 true：半月开关、烈火确认/消费/过期、攻杀状态、点雷电和参数拒绝 | 战士各技能强化伤害、扇形范围、全部 33 技能 |
| [gameplay-gateway-live.json](../.runtime/reports/gameplay-gateway-live.json) | 当前协议能力、既有角色入图/属性/44件背包、一次走步并返回 | 新角色三职业创建、完整游玩闭环与重连 |
| [native-map-events-regression.log](../.runtime/reports/native-map-events-regression.log) | 1000 事件非零唯一 ID、同优先级 FIFO/原优先级保留 PASS | 1000 可视特效浏览器帧预算与内存 |
| [python-events-final.log](../.runtime/reports/python-events-final.log) | 132 项，9 失败、1 错误 | 完整地图/刷怪/资源闭合、安装恢复验收 |
| [events-CoreRegression.log](../.runtime/reports/events-CoreRegression.log) | 编译失败：ReduceDurability / IsSafeZonePosition / IsAggressiveMonsterRace 与当前接口不一致 | 核心规则或安全区回归通过 |
| [world-events-cleanup.json](../.runtime/reports/world-events-cleanup.json) | 六组独立夹具清理，账号/角色/选角索引残留 0 | 干净运行目录恢复整个存档 |
| [npc-skills-skill_keys_regression.log](../.runtime/reports/npc-skills-skill_keys_regression.log) | 最新技能改绑7组前端纯回归 PASS（含bindingId） | 生产页选择器/关闭可见性、原端模态框对照 |
| [skill-keys-gateway.log](../.runtime/reports/skill-keys-gateway.log) | 本批CM1008编码/已学校验/快照确认3组纯回归 PASS（.NET8兼容） | .NET10生产网关和固定原服真实收发/存档 |
| [actor-status-regression.log](../.runtime/reports/actor-status-regression.log) | 本批持续盾/受击/毒色/退出/异步与生产Actor排队状态15组纯回归 PASS | 真实协议状态、生产浏览器/原端实机及原调色板量化 |
| [actor-status-native-assets.json](../.runtime/reports/actor-status-native-assets.json) | 6/6盾帧直接国服WIL重解码与导出PNG一致 | 动态合成/绘制层级/脚底位置与时序实机一致 |
| [npc-skill-live.json](../.runtime/reports/npc-skill-live.json) | 最新51/51真实协议通过：八键/None/冲突/拒绝/独立移动/重登、导师A→综合商人B/关闭/旧代次隔离 | 生产浏览器热区/等待/关闭、同版本原端对照、全NPC/经济脚本与待决竞态 |
| [npc-probe-session-regression.log](../.runtime/reports/npc-probe-session-regression.log) | 4组共享探针current戳/节流/关闭/跨图回归通过；4旧probe语法通过 | 迁移后的技能/地图/行会/城战probe完整实跑 |
| [npc-gateway-session-2026-10-01.log](../.runtime/reports/npc-gateway-session-2026-10-01.log) | 9 NPC组+4 binding组生产网关反射纯回归 PASS，包含实际5秒异步timer | dummy WebSocket不能替代真实服务器/数据库/浏览器、NPC经济结算 |

上述运行报告位于被 Git 忽略的 `.runtime`，会被后续探针覆写；提交或验收时应另保存不含凭据的报告副本和运行环境/源码指纹。当前 `docs/implementation-status.md` 的 2026-09-09 指标、旧 570 地图闭合、旧 15 技能/双浏览器交易/组队/行会报告声明只用于找线索，本次未把不存在的报告引用为当前事实。当前原端桥报告能证明对应旧 TCP 桥路径，不能替代 Web 页的交互验收。

## 优先落地顺序

1. GAME-051 / GAME-040：None/F1–F8与稀疏槽、真实211、占槽解绑/拒绝/重登持久化及NPC A→B/关闭隔离已由最新51/51真实协议检查通过；下一步生产浏览器/原端对照与待决竞态验收。
2. GAME-131 / GAME-053 / GAME-106：持续盾常态/受击六帧与红绿毒色已补齐，15组生产类纯回归及6帧国服像素校验通过；继续实际bit/材料/数值/重登与原端动态对照。
3. GAME-123 / GAME-124 / GAME-130 / GAME-132 / GAME-133：当前没有专属效果分支的爆裂火焰、地狱雷光、召唤神兽、圣言术、冰咆哮；补齐原端帧/区域/实体行为与真实结算。
4. GAME-062：交易在途/锁定/双方确认及失败守恒；GAME-033：矿区挖矿入口与矿石闭环。
5. GAME-001 / GAME-070 / GAME-065：完整内容入口闭合、全任务、整场沙巴克；不能因各入口已有按钮降低最终范围。

## 系统状态索引

| ID | 要求 | 当前状态 |
| --- | --- | --- |
| [GAME-001](#game-001) | 完整玩法版本与全部内容入口闭合 | 部分实现 |
| [GAME-002](#game-002) | 经典档与个人试玩档可辨识且可重复应用 | 部分实现 |
| [GAME-003](#game-003) | 三职业角色成长与装备/技能学习要求 | 部分实现 |
| [GAME-010](#game-010) | 八方向走跑与动作节拍 | 部分实现 |
| [GAME-011](#game-011) | 转向、原地攻击与经典输入模式 | 部分实现 |
| [GAME-012](#game-012) | 静态碰撞与活动对象占格 | 部分实现 |
| [GAME-013](#game-013) | 追击、移动目标与取消世界意图 | 部分实现 |
| [GAME-014](#game-014) | 动态门开闭与开门后移动 | 部分实现 |
| [GAME-015](#game-015) | 强制冲撞、被推退与撞墙回弹 | 部分实现 |
| [GAME-016](#game-016) | actionId/mapGeneration及单动作确认 | 实现待完整验收 |
| [GAME-020](#game-020) | 基础近战、前摇命中及受击反馈 | 部分实现 |
| [GAME-021](#game-021) | 战士攻击优先级、开关、蓄力与一次消费 | 部分实现 |
| [GAME-022](#game-022) | PK模式、红名、攻击保护与安全区 | 部分实现 |
| [GAME-023](#game-023) | 怪物AI、仇恨、首领特性与刷新 | 部分实现 |
| [GAME-024](#game-024) | HP/MP/经验/负重与次级属性 | 部分实现 |
| [GAME-030](#game-030) | 地面掉落显示、拾取与实例一致性 | 部分实现 |
| [GAME-031](#game-031) | 掉落概率、归属、死亡爆装与消失 | 部分实现 |
| [GAME-032](#game-032) | 尸体挖肉与收获品质 | 部分实现 |
| [GAME-033](#game-033) | 矿区挖矿、鹤嘴锄及矿石品质 | 部分实现 |
| [GAME-034](#game-034) | 背包穿脱装备、双槽与条件限制 | 部分实现 |
| [GAME-035](#game-035) | 物品使用、药包、卷轴与回城 | 部分实现 |
| [GAME-036](#game-036) | 丢弃物品、金币与地面往返 | 部分实现 |
| [GAME-037](#game-037) | 持久、破损、特殊属性及特殊戒指 | 部分实现 |
| [GAME-040](#game-040) | NPC交互距离、脚本文本与菜单 | 部分实现 |
| [GAME-041](#game-041) | 商品目录、装备实例与购买 | 部分实现 |
| [GAME-042](#game-042) | 出售与原服询价 | 部分实现 |
| [GAME-043](#game-043) | 普通与特殊修理 | 部分实现 |
| [GAME-044](#game-044) | 仓库存取、分页与容量 | 部分实现 |
| [GAME-045](#game-045) | 技能书学习、键槽持久化与熟练度 | 部分实现 |
| [GAME-050](#game-050) | 目标/地面/方向/自我/辅助施法输入 | 部分实现 |
| [GAME-051](#game-051) | F1–F8改绑、稀疏槽及未分配技能 | 部分实现 |
| [GAME-052](#game-052) | 技能魔耗、材料、冷却与失败反馈 | 部分实现 |
| [GAME-053](#game-053) | 持续状态、解除与正确叠层 | 部分实现 |
| [GAME-054](#game-054) | 持续地图事件、入视野与光照 | 部分实现 |
| [GAME-060](#game-060) | 聊天五频道、中文输入与系统广播 | 部分实现 |
| [GAME-061](#game-061) | 组队邀请、队长成员及权限 | 部分实现 |
| [GAME-062](#game-062) | 玩家交易、锁定确认与守恒 | 部分实现 |
| [GAME-063](#game-063) | 行会创建、成员、封号、公告与联盟 | 部分实现 |
| [GAME-064](#game-064) | 行会战申请、关系及倒计时 | 部分实现 |
| [GAME-065](#game-065) | 完整沙巴克攻城与占领持久化 | 部分实现 |
| [GAME-070](#game-070) | 完整NPC任务清单与脚本语义 | 部分实现 |
| [GAME-071](#game-071) | 任务缓存、重复奖励与角色隔离 | 部分实现 |
| [GAME-080](#game-080) | 死亡状态、画面与回城复活 | 部分实现 |
| [GAME-081](#game-081) | 跨图、传送、对象世代与快照 | 部分实现 |
| [GAME-082](#game-082) | 断线重连、恢复与副作用不重放 | 部分实现 |
| [GAME-083](#game-083) | 正常退出、保存停止与异常窗口 | 部分实现 |
| [GAME-084](#game-084) | 备份恢复、独立夹具与持久守恒 | 部分实现 |
| [GAME-101](#game-101) | 技能 1：火球术（hostile） | 部分实现 |
| [GAME-102](#game-102) | 技能 2：治愈术（support） | 部分实现 |
| [GAME-103](#game-103) | 技能 3：基本剑术（passive） | 部分实现 |
| [GAME-104](#game-104) | 技能 4：精神力战法（passive） | 部分实现 |
| [GAME-105](#game-105) | 技能 5：大火球（hostile） | 部分实现 |
| [GAME-106](#game-106) | 技能 6：施毒术（hostile） | 部分实现 |
| [GAME-107](#game-107) | 技能 7：攻杀剑术（passive） | 部分实现 |
| [GAME-108](#game-108) | 技能 8：抗拒火环（self） | 部分实现 |
| [GAME-109](#game-109) | 技能 9：地狱火（directional） | 部分实现 |
| [GAME-110](#game-110) | 技能 10：疾光电影（directional） | 部分实现 |
| [GAME-111](#game-111) | 技能 11：雷电术（hostile） | 部分实现 |
| [GAME-112](#game-112) | 技能 12：刺杀剑术（toggle） | 部分实现 |
| [GAME-113](#game-113) | 技能 13：灵魂火符（hostile） | 部分实现 |
| [GAME-114](#game-114) | 技能 14：幽灵盾（support） | 部分实现 |
| [GAME-115](#game-115) | 技能 15：神圣战甲术（support） | 部分实现 |
| [GAME-116](#game-116) | 技能 16：困魔咒（ground） | 部分实现 |
| [GAME-117](#game-117) | 技能 17：召唤骷髅（self） | 部分实现 |
| [GAME-118](#game-118) | 技能 18：隐身术（self） | 部分实现 |
| [GAME-119](#game-119) | 技能 19：集体隐身术（ground） | 部分实现 |
| [GAME-120](#game-120) | 技能 20：诱惑之光（hostile） | 部分实现 |
| [GAME-121](#game-121) | 技能 21：瞬息移动（self） | 部分实现 |
| [GAME-122](#game-122) | 技能 22：火墙（ground） | 部分实现 |
| [GAME-123](#game-123) | 技能 23：爆裂火焰（ground） | 部分实现 |
| [GAME-124](#game-124) | 技能 24：地狱雷光（self） | 部分实现 |
| [GAME-125](#game-125) | 技能 25：半月弯刀（toggle） | 部分实现 |
| [GAME-126](#game-126) | 技能 26：烈火剑法（charge） | 部分实现 |
| [GAME-127](#game-127) | 技能 27：野蛮冲撞（rush） | 部分实现 |
| [GAME-128](#game-128) | 技能 28：心灵启示（support） | 部分实现 |
| [GAME-129](#game-129) | 技能 29：群体治疗术（ground） | 部分实现 |
| [GAME-130](#game-130) | 技能 30：召唤神兽（self） | 部分实现 |
| [GAME-131](#game-131) | 技能 31：魔法盾（self） | 部分实现 |
| [GAME-132](#game-132) | 技能 32：圣言术（hostile） | 部分实现 |
| [GAME-133](#game-133) | 技能 33：冰咆哮（ground） | 部分实现 |

## 逐项实施与验收

<a id="game-001"></a>

### GAME-001 完整玩法版本与全部内容入口闭合

状态：`partial`。

现有实现：`content/classic-176/version-profile.json`、`scripts/prepare-runtime.py`、`tools/content_audit.py`、`tools/skill_catalog_audit.py`、`content/classic-176/map-server-extensions.json`、`tools/resource_catalog.py`、`docs/resource-consistency-2026-10-01.md`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`tools/classic_version_boundary_audit.py`、`tests/test_classic_version_boundary_audit.py`、`docs/classic-version-boundary-2026-10-01.md`、`docs/map-asset-selection-2026-10-01.md`。

依据及等级：`contract` content/classic-176/version-profile.json — baseline-under-validation；P0技能15项；完整范围仍是经典1.76<br>`contract` PLAN.md — 完整地图、物品、怪物、技能、NPC任务、经济成长PK行会沙巴克<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。<br>`source_review` docs/classic-version-boundary-2026-10-01.md — 第七批全1000/108逐行支持与扩展声明/未知版本、静态入口证据；没有同包原端历史版本证明。。

必须通过：

- 成功：生成目标版本全量地图/技能/物品/怪物/任务/NPC可追踪清单，每个入口标明版本证据。
- 失败：白名单外英雄、合击、后期技能/装备从NPC、商店、掉落、书籍入口都不能进入经典档。
- 边界：版本清单、SQL、客户端帧映射存在冲突时显示待确认项，不能静默取交集缩小完整范围。

当前验证：`unit_regression` .runtime/reports/python-events-final.log — 132项；9失败/1错误，全量闭合未通过<br>`unit_regression` .runtime/reports/resources-v5-checks.json — 第五批当前源码：242组Node回归/21脚本；完整Python257项，失败1项；非浏览器。<br>`unit_regression` .runtime/reports/resources-v5-content-audit.json — 必需源/导出哈希、索引、偏移与内容目录；complete=false保留实际缺项，不是画面验收。<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/icons-v6-content-audit.json — 实际CLI遍历必需源/导出哈希与内容目录，complete=false；无原端、浏览器或历史配对完成声明。<br>`unit_regression` .runtime/reports/map-v7-sentinel-web-tests.json — 最终实际352组/30脚本模块/VM/Pixi回归；含源选择、54特殊引用nil路径和切图/失败恢复，非浏览器。<br>`unit_regression` .runtime/reports/map-v7-final-python-checks.json — 修复默认源路径后完整Python339/339通过；current render与original fidelity分别断言，独立内容CLI继续exit1。。

剩余缺口：

- skill-input已列1–33，而skill-rules/skill-combat/version-profile的P0仍15项；完整技能数值与成长材料未闭合。
- 种子SQL的群体施毒术/气功波共用ID48已由本机DB只读确认，未擅改编号；完整数值与版本边界继续待核。

<a id="game-002"></a>

### GAME-002 经典档与个人试玩档可辨识且可重复应用

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [PLAN.md](../PLAN.md)：经典倍率为默认基准；便利功能独立配置； **工作树审计** [docs/local-playtest.md](../docs/local-playtest.md)：当前经验20倍、掉率配置、城区综合服务与试玩NPC。

现有实现：[content/classic-176/personal-profile.playtest.json](../content/classic-176/personal-profile.playtest.json)、[scripts/apply-personal-profile.py](../scripts/apply-personal-profile.py)、[docs/local-playtest.md](../docs/local-playtest.md)。

必须通过：

- 成功：客户端及运行报告明确当前档位；经典档和试玩档都有独立可复现配置。
- 失败：重复应用试玩档不叠加倍率/刷怪/物品赠送；切回经典档不会污染原进度。
- 边界：存档与world配置变更先备份，历史明确授权的便利功能保留并标明与原版差异。

当前验证：[2026-10-02 门事件回归记录](../.runtime/reports/map-door-interaction-2026-10-02.log) 18组通过。覆盖真实 `play.ts` 消息回调、过期地图代次拒绝、门打开后原阻挡步恰好重试一次、关门不触发重试，以及 `map-view.ts` 对静态碰撞的开/关覆盖；地图渲染使用 fake Pixi，未进行真实浏览器或同版原端交互。

剩余缺口：

- 当前试玩设置、动态刷怪和合并城区NPC属于用户本机配置；需要逐条记录与基准客户端的差异及开关，不能直接算作经典复刻。

<a id="game-003"></a>

### GAME-003 三职业角色成长与装备/技能学习要求

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/version-profile.json](../content/classic-176/version-profile.json)：战士/法师/道士； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：职业/等级/魔力/技能由游戏服校验。

现有实现：[apps/web/src/classic-auth.ts](../apps/web/src/classic-auth.ts)、[services/web-gateway/CharacterProjection.cs](../services/web-gateway/CharacterProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：三职业男女创建后正常升级、经验溢出、解锁对应技能和装备。
- 失败：重名、非法名、职业不符、等级不足、未学技能、负重不足均有原服结果。
- 边界：升级/学习/装备后退出重登恢复同样等级、经验、技能及属性。

当前验证：**真实协议** [.runtime/reports/gameplay-gateway-live.json](../.runtime/reports/gameplay-gateway-live.json)：既有角色登录/属性/背包快照；不覆盖三职业创建或升级

剩余缺口：

- 当前最新live只覆盖已有角色登录和技能导师；三职业建角与正常学习成长没有当前专项报告。

<a id="game-010"></a>

### GAME-010 八方向走跑与动作节拍

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)：CM_WALK/CM_RUN及Good/Fail； **参考源码** [Actor.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas>)：走跑离散动作和朝向。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[apps/web/src/movement-model.ts](../apps/web/src/movement-model.ts)、[apps/web/src/movement-visual.ts](../apps/web/src/movement-visual.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：八方向走一格、跑两格、连续点击/按住、起止转向的权威坐标与原服一致。
- 失败：非法方向/斜跑偏移/远距目标拒绝后立即解锁并回到权威位置。
- 边界：低帧率、网络抖动、短按长按及到边界保持动作节拍，原端时间线相差不超过一个源帧。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：movement cadence/displacement/camera/paths； **真实协议** [.runtime/reports/gameplay-gateway-live.json](../.runtime/reports/gameplay-gateway-live.json)：一次移动及返回原位；不等于八方向完整验收

剩余缺口：

- 尚无本项当前生产浏览器完整成功/失败/边界回放及同版本原端对照；已有协议或纯回归通过不能作为完整复刻验收。

<a id="game-011"></a>

### GAME-011 转向、原地攻击与经典输入模式

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)：CM_TURN=3010； **参考源码** [ClMain.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas>)：原客户端鼠标/键盘动作入口； **项目契约** [PLAN.md](../PLAN.md)：自动战斗/现代寻路便利功能应独立配置。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[apps/web/src/movement-input.ts](../apps/web/src/movement-input.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：原端可用的原地转向、攻击空格、Shift/鼠标走跑操作均有对应浏览器入口。
- 失败：聊天或IME编辑、窗口拖动时不触发世界动作。
- 边界：自动追击/点击寻路若超出原端行为，设置可识别开关并保留经典模式。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：modifier-stable movement release；非原端输入证明

剩余缺口：

- 网关没有turn命令；点击路径与循环追击已开启，需要取得原端具体输入规则并区分便利配置。

<a id="game-012"></a>

### GAME-012 静态碰撞与活动对象占格

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs](../vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs)：原服移动碰撞与立即拒绝； **项目契约** [AGENT.md](../AGENT.md)：坐标仅由原服确认。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[apps/web/src/movement-model.ts](../apps/web/src/movement-model.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs](../vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs)。

必须通过：

- 成功：墙/树/门/活怪/玩家/NPC占格时依据地图和服务端结果停止或绕行。
- 失败：占格拒绝及时释放动作锁，无10秒卡住。
- 边界：尸体不当活物阻挡，怪物移走后格子恢复可通；斜角两侧阻挡按原规则处理。

当前验证：**真实协议** [.runtime/reports/world-events-live.json](../.runtime/reports/world-events-live.json)：占格移动35ms拒绝，权威位置不变； **纯回归** [.runtime/reports/events-movement-regression.log](../.runtime/reports/events-movement-regression.log)：原生占格拒绝及立即解锁； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：bounded paths/corpse hit testing/temporary occupancy

**纯回归** [.runtime/reports/movement-collision-early-release-2026-10-02.json](../.runtime/reports/movement-collision-early-release-2026-10-02.json)：生产 play.ts 的实体更新/移除路径确认活怪离格、死亡或销毁后立即释放避让格；仍有另一个活物占格时保留；未知迟到对象仍保留1.5秒上限。44个网页脚本、TypeScript noEmit、Vite生产构建与Python386/386通过；不替代浏览器实战或原端逐场景对照。

剩余缺口：

- 通行规则还需原端斜角/动态对象逐场景对照。

<a id="game-013"></a>

### GAME-013 追击、移动目标与取消世界意图

状态：**部分实现**（`partial`）。

依据及等级：**工作树审计** [apps/web/src/play.ts](../apps/web/src/play.ts)：targetApproachStep、continuePursuit、cancelWorldIntent； **项目契约** [AGENT.md](../AGENT.md)：Escape/失焦/pointercancel/等待回包。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[apps/web/src/movement-model.ts](../apps/web/src/movement-model.ts)。

必须通过：

- 成功：移动目标重新规划相邻站位；权威确认阻挡对象离格、死亡或移除后立刻重开原格，身份未知时仍在1.5秒上限后可重试，狭窄路径重新打开。
- 失败：目标死亡/离开视野、人工移动、施法、Escape、失焦或切图取消追击。
- 边界：取消只停止未来动作，仍接收当前actionId确认；旧地图定时器不能在新图发步。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：追击失败格过期、阻挡刷新、重试取消、保留在途动作

**纯回归** [.runtime/reports/movement-collision-early-release-2026-10-02.json](../.runtime/reports/movement-collision-early-release-2026-10-02.json)：追击与普通点击路线共用的避让记忆仅在权威确认旧格无人后提前释放；另一活物仍占格及迟到/未知阻挡保护均通过。当前浏览器追击成功/失败/边界回放和同版原端时序仍未验。

剩余缺口：

- 尚无本项当前生产浏览器完整成功/失败/边界回放及同版本原端对照；已有协议或纯回归通过不能作为完整复刻验收。

<a id="game-014"></a>

### GAME-014 动态门开闭与开门后移动

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)：1002/612/614； **工作树审计** [apps/web/src/play.ts](../apps/web/src/play.ts)：doorRetry与服务端door消息。

现有实现：[apps/web/src/map-view.ts](../apps/web/src/map-view.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：相邻点击门，确认开门帧与通行状态后重试原目标步。
- 失败：远距门/非法坐标拒绝；关门或另一玩家先占格时不穿越。
- 边界：整组门格同步、门重关、切图/断线取消旧doorRetry。

当前验证：**纯回归** [tests/map_loading_regression.mjs](../tests/map_loading_regression.mjs)：19组模块级/Pixi替身检查通过；新增地图格doorIndex/doorOffset驱动开门帧、同门组同步、碰撞同步和关门恢复。该回归不证明当前浏览器画面或同版原端开门流程。

剩余缺口：

- 尚无本项当前生产浏览器完整成功/失败/边界回放及同版本原端对照；已有协议或纯回归通过不能作为完整复刻验收。

<a id="game-015"></a>

### GAME-015 强制冲撞、被推退与撞墙回弹

状态：**部分实现**（`partial`）。

依据及等级：**参考源码** [Actor.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas>)：SM_RUSH/SM_BACKSTEP/SM_RUSHKUNG； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)：SM6冲撞、SM9后退、SM7尝试目标； **工作树审计** [services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)：强制位移保留旧命令槽，防止迟到ACK确认新指令。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[vendor/openmir2/src/M2Server/Actor/BaseObject.Message.cs](../vendor/openmir2/src/M2Server/Actor/BaseObject.Message.cs)。

必须通过：

- 成功：冲撞各步顺序更新权威坐标，被推目标保留原朝向，后续移动正确。
- 失败：撞墙SM7只前探并回弹，网关实际位置不变。
- 边界：冲撞打断待移动后迟到Good/Fail不覆盖新坐标；多步消息FIFO、切图取消强制动画。

当前验证：**真实协议** [.runtime/reports/world-events-live.json](../.runtime/reports/world-events-live.json)：冲撞、撞墙、低等级角色四步被推及恢复移动； **纯回归** [.runtime/reports/gateway-events-final.log](../.runtime/reports/gateway-events-final.log)：forced displacement and ACK ordering； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：forced facing/rush alternate poses； **纯回归** [.runtime/reports/native-map-events-regression.log](../.runtime/reports/native-map-events-regression.log)：同级消息FIFO/优先级

剩余缺口：

- 真实协议覆盖了当前位移场景；浏览器回弹、背退和双客户端帧时序尚未对照。

<a id="game-016"></a>

### GAME-016 actionId/mapGeneration及单动作确认

状态：**实现待完整验收**（`implemented`）。

依据及等级：**项目契约** [AGENT.md](../AGENT.md)：移动/攻击/施法必须携带身份和地图代次； **工作树审计** [services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)：5秒未确认断开；确认只消费对应动作。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：move/attack/spell都有唯一actionId，服务端确认只推进对应权威状态。
- 失败：旧mapGeneration、非法ID、待决期间重复命令拒绝且界面解锁。
- 边界：拒绝/超时/断线/迟到ACK/乱序实体包后快照重同步；无经济副作用重放。

当前验证：**纯回归** [.runtime/reports/gateway-events-final.log](../.runtime/reports/gateway-events-final.log)：拆合包及动作确认顺序； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：取消意图保留动作锁

剩余缺口：

- 需真实弱网/浏览器长时混合操作回放。

<a id="game-020"></a>

### GAME-020 基础近战、前摇命中及受击反馈

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientHitXY/原服伤害； **参考源码** [Actor.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas>)：攻击/受击/死亡动作。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：相邻八方向攻击、各武器动作、攻速、原服伤害/HP/死亡顺序正确。
- 失败：目标超距/失效/死亡及动作锁冲突不产生客户端伤害。
- 边界：连续受击与施法/走跑打断、低帧率、技能命中帧、武器前后层级按原端校准。

当前验证：**纯回归** [.runtime/reports/gateway-events-final.log](../.runtime/reports/gateway-events-final.log)：原服攻击opcode投影和优先级； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：国服动作/武器分层

剩余缺口：

- 当前报告只有攻击接受及战士状态；没有本轮真实伤害对比与命中时序。

<a id="game-021"></a>

### GAME-021 战士攻击优先级、开关、蓄力与一次消费

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：烈火/攻杀/半月/刺杀/重武器/普通； **源码审查** [services/web-gateway/MeleeSkills.cs](../services/web-gateway/MeleeSkills.cs)：MP门槛与+LNG/+WID/+FIR/+PWR； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\ClMain.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas)：AttackTarget 2128–2164：经典输入烈火>攻杀>半月>满足两格目标的刺杀>武器重击/普通；4086–4109 原客户端忽略自身全部七种攻击SM。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\Actor.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas)：3297–3324：四专属剑光都用ActHit六帧85ms，按实际SM区分power/thrusting/halfMoon/fire；重击、大击不借用专属剑光。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\M2Server\ObjBase.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/M2Server/ObjBase.pas)：AttackDir 18785–18857：先Dir=nDir再GetPoseCreate；消费前保存攻杀/烈火flags决定最终RM，随机与伤害顺序不变。； **固定原服源码** [vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs](../vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs)：固定经典ID：攻杀7、刺杀12、半月25、烈火26，不推断高版本ID。； **固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)：真实SM14 normal、15 heavy、16 big、18 power、19 thrusting、24 halfMoon、8 fire；输入CM3014/3015/3016/3018/3019/3024/3025。； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)：RM→SM旁观者投递；RM_HEAVYHIT空body走header-only，非空DIG body保留。； **项目契约** [content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)：经典四实际SM对应Magic原索引：攻杀800、刺杀1410、半月1700、烈火3480 +dir*10+bodyFrame0–5；ActHit六帧85ms；普通/重击/大击无专属剑光。

现有实现：[services/web-gateway/MeleeSkills.cs](../services/web-gateway/MeleeSkills.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)、[tests/NativeMeleeRegression/Program.cs](../tests/NativeMeleeRegression/Program.cs)、[tests/MeleeGatewayRegression/Program.cs](../tests/MeleeGatewayRegression/Program.cs)、[tools/melee_probe.mjs](../tools/melee_probe.mjs)、[tools/prepare_melee_probe.py](../tools/prepare_melee_probe.py)、[tools/cleanup_melee_probe.py](../tools/cleanup_melee_probe.py)、[tools/melee_probe_fixtures.py](../tools/melee_probe_fixtures.py)、[tests/test_melee_probe_fixtures.py](../tests/test_melee_probe_fixtures.py)、[docs/melee-probe.md](../docs/melee-probe.md)、[apps/web/src/melee-visual.ts](../apps/web/src/melee-visual.ts)、[content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)、[scripts/import-national-melee-assets.py](../scripts/import-national-melee-assets.py)、[tests/melee_visual_regression.mjs](../tests/melee_visual_regression.mjs)、[tests/test_national_melee_import.py](../tests/test_national_melee_import.py)。

必须通过：

- 成功：经典7/12/25/26按烈火>攻杀>半月>两格目标刺杀>武器重击/普通选择输入；实际七种SM唯一决定meleeKind，服务器伤害与费用保持权威。
- 失败：未确认/MP不足/无两格目标/死亡/错地图/动作忙/非法方向不伪造专属攻击；LNG/WID/FIR状态不能吞掉稍后施法+GD。
- 边界：自身与旁观者收到相同最终SM；消费前捕获攻杀/烈火，之后一次消费；新+PWR在当前GOOD前仍留给下一击；自身SM不重复完成ACK；旧地图/死亡ACK必须排空后才可发新动作。
- 边界：八向含对角先更新已验证合法的Dir再选目标，旧朝向目标无伤害；非法方向不能写Dir、消费MP/charge或发送成功SM/GOOD。

当前验证：**真实协议** [.runtime/reports/gameplay-live-check.json](../.runtime/reports/gameplay-live-check.json)：半月开关/烈火单次消费及超时/+PWR；不覆盖伤害比较； **纯回归** [.runtime/reports/gateway-events-final.log](../.runtime/reports/gateway-events-final.log)：攻击优先级/MP/状态消费/超时； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：战士按钮确认状态； **纯回归** [.runtime/reports/melee-native-regression.log](../.runtime/reports/melee-native-regression.log)：2026-10-01 17:31 CST，真实PlayObject.Operate/ClientHitXY/AttackDir、真实地图八向与旁观者、生产包编解码6组PASS：方向选目标、七SM一致、重击空/非空body、攻杀/烈火消费前捕获、MP0半月降级/原耗MP、非法/死亡/禁攻/错坐标拒绝。不是在线角色或原客户端实验。； **纯回归** [.runtime/reports/melee-gateway-regression.log](../.runtime/reports/melee-gateway-regression.log)：生产GatewaySession+LegacyConnection loopback TCP+捕获WebSocket7组PASS：七SM投影、fire>power>wide>long选择、LNG/WID/FIR状态不提前释放施法ACK槽、self SM不完成请求、服务器降级、新PWR不丢、拒绝及死亡/地图中断后原ACK排空。不是真实18801/原服联机。； **纯回归** [.runtime/reports/melee-native-build.log](../.runtime/reports/melee-native-build.log)：net8原服及真实类专项成功编译；本次增量0警告/0错误；原服全量4个既有警告在其它文件。； **纯回归** [.runtime/reports/melee-mining-compat.log](../.runtime/reports/melee-mining-compat.log)：同批攻击源码构建的原服实际矿逻辑9组PASS；未改变MakeMine概率/品质。； **纯回归** [.runtime/reports/melee-movement-compat.log](../.runtime/reports/melee-movement-compat.log)：同批原服实际移动碰撞、纠正、旁观隔离及恢复专项PASS。； **纯回归** [.runtime/reports/melee-mining-gateway-compat.log](../.runtime/reports/melee-mining-gateway-compat.log)：同批网关生产挖矿TCP9组PASS：TURN/HEAVY串行、真实SM200投影、死亡/换图排空及超时隔离。； **真实协议** [.runtime/reports/melee-live-run.json](../.runtime/reports/melee-live-run.json)：53/53真实原服：原导师学习经典7/12/25/26，原木剑真实equip，实际四专属SM18/8/24/19的self+observer一致与各请求GD，+PWR计数及优先消费、切换、F1/F2/F3原211确认、正常重登skills/keys及木剑实例24031355保存。没有在线伤害、扇形/穿透范围、等级0–2训练或浏览器/原端画面证明。；记录时间 2026-10-01T09:52:31.166Z；环境 Windows isolated owned warriors; real ws://127.0.0.1:18801/ws -> native runtime; local .NET8 Gateway compatibility build；报告SHA256 `7196c7ce2483032998d2d1cde41c7bef7f5a20030e274ccbc2de918474e5ee46`；实际M2 SHA256 `09a2902cc751b2a61ae0577b93a8a0c2a9948e2ada64b8055391ab037500d436`；实际Gateway SHA256 `c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97`；对应源码全部SHA见报告 sourceSha256； **源码审查** [.runtime/reports/melee-deployment.json](../.runtime/reports/melee-deployment.json)：根代理正常停服/备份后只部署M2Server与Gateway；实际新M2 09a290…d436、Gateway c4e22…7b97；既有GameSrv/OpenMir2/SystemModule/ScriptSystem原4依赖保持，不能拿默认新编译依赖代替此实际部署版本。；记录时间 2026-10-01T09:49:41.3999398Z；环境 M2 only; actual existing GameSrv/OpenMir2/SystemModule/ScriptSystem preserved; gateway local net8 compatibility build；报告SHA256 `109f3ff35ccc84dc04cd893a2e0f65243056914b9a668b7b943763116c55af84`； **纯回归** [.runtime/reports/melee-native-runtime-binary-compat.log](../.runtime/reports/melee-native-runtime-binary-compat.log)：独立staging使用新M2+实际原4依赖运行生产NativeMeleeRegression六组PASS；包括八向实际目标、SM self/remote、消费、重击body/费用及拒绝。未触及DB/真实角色；同版本矿9/移动1实际依赖证据另存melee-actual-runtime-compat.json。； **纯回归** [.runtime/reports/melee-fixture-regression.log](../.runtime/reports/melee-fixture-regression.log)：12项无DB夹具回归：实际原地图/导师脚本、协议拥有的双角色namespace、时间/backup/默认plan、仅攻击者Mp0、停服/其它角色拒绝及精确清理模拟。实际清理须另看live清理报告。； **真实协议** [.runtime/reports/melee-live-low-mp.json](../.runtime/reports/melee-live-low-mp.json)：8/8真实低MP阶段：已保存attacker Mp0，原skill26输入收到真实GOOD但无+FIR、无网关确认fire，下一真实SM非fire；保留AllowFireHitSkill先置内部flag的原行为，不把GOOD当蓄力/伤害证明。本阶段closedLoopVerified=false表示它仅为低MP专测，完整动作持久闭环在run报告。；记录时间 2026-10-01T09:56:31.609Z；环境 Windows isolated owned attacker; real ws://127.0.0.1:18801/ws; normal stop + verified backup before attacker-only saved MP preparation；报告SHA256 `f574f38ef4be58a4c56c3b2add3f1a2e95eb33fc37175b9ccd1796d1deb3b8ee`；实际M2 SHA256 `09a2902cc751b2a61ae0577b93a8a0c2a9948e2ada64b8055391ab037500d436`；实际Gateway SHA256 `c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97`； **纯回归** [.runtime/reports/melee-visual-regression.json](../.runtime/reports/melee-visual-regression.json)：生产MeleeVisual/OnlineActor 19组fakePixi、7项素材导入Python、旧Actor18/World4及TSC通过：同ID self prediction→actual专属kind在原frame/frameAt处接管，不floor/重播人体；零基frame2武器/技能音各一次，迟到不回放。不是浏览器/GPU/native.exe时序验证。；记录时间 2026-10-01T09:31:01.598597+00:00；环境 Windows local Node24/Python; actual production TypeScript transpile + fake Pixi/clock and isolated synthetic WIL fixtures; actual native WIL byte check; no browser/GPU/original executable；报告SHA256 `39ccd08b2d1f562c5bebf0312fbcb211e06c5af113a4682bd4516e4c47c8ce4c`；对应源码全部SHA见报告 sourceSha256； **原生素材像素** [.runtime/reports/melee-native-assets.json](../.runtime/reports/melee-native-assets.json)：本机原Magic WIL/WIX直接重解码192/192帧与既有PNG matched、repaired0，几何/alpha/source pair核对；只证明素材字节与偏移，不证明浏览器screen调色/原端实际播放。；记录时间 2026-10-01T09:31:34.032853+00:00；环境 local Python WeMadeLibrary direct original WIL/WIX decode; no network/browser/original executable；报告SHA256 `c59c3872aa6ff257e5c02e9629be5d79f6775c975e54c2f9d790b8584e1df1c3`； **真实协议** [.runtime/reports/melee-cleanup.json](../.runtime/reports/melee-cleanup.json)：正常停服并有效备份后清理本次协议拥有的两名战士隔离夹具：removedFixtures=2、remainingAccountsCharactersIndexes=0、verified=true；仅证明测试夹具收尾，不把它计为技能数值、权限、画面或原客户端完成。；记录时间 2026-10-01T10:04:10.210525+00:00；环境 Windows isolated owned warrior fixtures; normal native stop + verified backup; exact namespace cleanup and real residual database verification；报告SHA256 `681d53e58b45fe7bc085e86fe85eb94ec54d7c80f62c49caa1dc44c7ca908fc6`； **源码审查** [.runtime/reports/melee-cleanup-gateway-ready.json](../.runtime/reports/melee-cleanup-gateway-ready.json)：清理完成后测试网关实际重新ready，health.status=ready、protocol=1，运行Gateway SHA仍为c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97；仅为环境恢复证据，不是浏览器/原客户端交互验收。；记录时间 2026-10-01T10:06:10.2851933Z；环境 local Windows test18801 gateway restarted after owned fixture cleanup; actual HTTP health readiness；报告SHA256 `fe6a54e63c72cbc2da2eb210ca295170367ac89f006fada54f461e5340dc80f5`

剩余缺口：

- 已完成四种实际self/observerSM与独立GOOD、原导师/木剑及keys重登、MP0无FIR联机；实际目标血量/MP费用、两格穿透/扇形多目标、原生拒绝/旧地图ACK在线边界及0–2级训练仍缺。
- 真实浏览器输入、连续剑光/声音/帧偏移/同种动作重播与同版本原客户端动态对照仍缺；两名隔离角色已正常停服备份后清理，残留0，回执见melee-cleanup.json。 原light2、screen原palette量化、remote msgMuch与native CM/selfSM真实时线及八向四种原exe对照仍缺。

<a id="game-022"></a>

### GAME-022 PK模式、红名、攻击保护与安全区

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs](../vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs)：原服攻击许可； **固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)：1046/213模式回传； **工作树审计** [services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)：nameColor/attackMode。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs](../vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs)。

必须通过：

- 成功：七种攻击模式的队友/行会/联盟/全体/和平等目标许可、红名颜色与安全区符合原服。
- 失败：禁止攻击的目标及安全区不受伤，客户端不会自行判定许可。
- 边界：模式切换待决、PK值变更、红名死亡惩罚、跨图及重登恢复。

当前验证：**纯回归** [.runtime/reports/events-CoreRegression.log](../.runtime/reports/events-CoreRegression.log)：编译失败，含安全区接口失配

剩余缺口：

- 当前无pvp报告；CoreRegression编译失败，安全区不能引用本轮绿色全测。

<a id="game-023"></a>

### GAME-023 怪物AI、仇恨、首领特性与刷新

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/version-profile.json](../content/classic-176/version-profile.json)：完整目标怪物/首领与knownSqlGaps； **工作树审计** [vendor/openmir2/src/GameSrv/Word/WorldServer.MonGen.cs](../vendor/openmir2/src/GameSrv/Word/WorldServer.MonGen.cs)：当前有人地图动态刷新规则。

现有实现：[apps/web/src/monster-visuals.ts](../apps/web/src/monster-visuals.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/GameSrv/Word/WorldServer.MonGen.cs](../vendor/openmir2/src/GameSrv/Word/WorldServer.MonGen.cs)、[tools/world_catalog_audit.py](../tools/world_catalog_audit.py)。

必须通过：

- 成功：全清单怪物有正确race/look、移动攻击死亡、仇恨/脱战/远程/特殊机制及刷新点。
- 失败：未知SQL怪物/缺帧显式审计；安全区/不可达格不错误攻击。
- 边界：首领不随普通试玩密度倍增；无人图、死亡重刷、切图召唤与长期负载可复现。

当前验证：**纯回归** [.runtime/reports/python-events-final.log](../.runtime/reports/python-events-final.log)：怪物、地图刷怪及帧依赖多项失败

剩余缺口：

- 版本仍列神鹰/飞火流星/骷髅王SQL缺口；资源/刷怪清单当前Python失败；逐怪原端/浏览器未验。

<a id="game-024"></a>

### GAME-024 HP/MP/经验/负重与次级属性

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)：52/53/45/44/622/752等属性； **工作树审计** [services/web-gateway/CharacterProjection.cs](../services/web-gateway/CharacterProjection.cs)：上下限、等级、资源、hit/speed/恢复。

现有实现：[services/web-gateway/CharacterProjection.cs](../services/web-gateway/CharacterProjection.cs)、[apps/web/src/character-panel.ts](../apps/web/src/character-panel.ts)、[apps/web/src/classic-hud.ts](../apps/web/src/classic-hud.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)。

必须通过：

- 成功：能力快照/增量一致更新人物面板、血蓝球、负重和经验。
- 失败：未收到确认时不扣MP/药品、不加经验，非法资源包不能产生假状态。
- 边界：最大HP/MP变化、升级、装备buff、经验溢出、0值、断线重登保持。

当前验证：**真实协议** [.runtime/reports/gameplay-gateway-live.json](../.runtime/reports/gameplay-gateway-live.json)：attributes快照存在

剩余缺口：

- 缺完整次级属性/幸运诅咒饥饿与原端面板语义确认；各来源增量同步需浏览器验。

<a id="game-030"></a>

### GAME-030 地面掉落显示、拾取与实例一致性

状态：`partial`。

现有实现：`apps/web/src/ground-items.ts`、`apps/web/src/play.ts`、`services/web-gateway/InventoryProjection.cs`、`services/web-gateway/GatewaySession.cs`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/item-icons.ts`、`tests/item_icon_consumers_regression.mjs`。

依据及等级：`server_source` vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs — 掉落与服务端拾取<br>`contract` AGENT.md — 实例编号/原服坐标<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。。

必须通过：

- 成功：物品落地原图/名称/金币堆正确，绕障碍到精确格后pickup，仅原服确认新增实例。
- 失败：别人的锁定掉落、背包满、超重、物品已被拾取不能在本地伪造获得。
- 边界：同格多物品/金币、尸体重叠、按键/连点、拾取时换图/断线不重复。

当前验证：`unit_regression` .runtime/reports/frontend-events-final.log — 绕障拾取只在物品格发送<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。。

剩余缺口：

- 当前live报告没有战斗掉落拾取链路；所有权/超时数值需真实双角色验证。

<a id="game-031"></a>

### GAME-031 掉落概率、归属、死亡爆装与消失

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs](../vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs)：死亡掉落； **项目契约** [PLAN.md](../PLAN.md)：按目标版本表和统计样本核验。

现有实现：[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs](../vendor/openmir2/src/M2Server/Actor/BaseObject.Attack.cs)、[tools/drop_probe.py](../tools/drop_probe.py)、[docs/drop-balance.md](../docs/drop-balance.md)。

必须通过：

- 成功：目标怪物/首领各表掉落由原服随机结算，锁定归属/共享规则和TTL符合基准。
- 失败：重复击杀通知/重复拾取/非法makeIndex无复制物品。
- 边界：PK死亡爆装、金币堆上限、多人争抢、停服/崩溃窗口、试玩倍率独立验证。

当前验证：缺少当前可复核证据。

剩余缺口：

- 当前无drop-bonus或drop-pickup真实报告；试玩掉落平衡不等于原版概率。

<a id="game-032"></a>

### GAME-032 尸体挖肉与收获品质

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs)：原服收获/尸体状态； **参考源码** [ClMain.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas>)：SendButchAnimal。

现有实现：[apps/web/src/harvest-input.ts](../apps/web/src/harvest-input.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)。

必须通过：

- 成功：Alt+左键已死可挖动物，自动接近至相邻后按权威尸体坐标挖肉。
- 失败：活目标、远尸体、已挖完、非收获尸体或背包满由原服拒绝。
- 边界：尸体重叠、多玩家竞争、肉品质/重量、移动怪尸体及切图取消收获。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：Alt左键/尸体hit test/收获接近重试

剩余缺口：

- 当前最新报告只有输入与靠近纯回归；真实鸡鹿肉质量/竞争未验。

<a id="game-033"></a>

### GAME-033 矿区挖矿、鹤嘴锄及矿石品质

状态：**部分实现**（`partial`）。

依据及等级：

- **参考源码** [C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas>)：2252–2264无目标左键+Shape19+前格阻挡/Shift发3015；2435自动循环；3415原生节拍；=DIG只标碎屑
- **参考源码** [C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas>)：heavy264起6帧方向stride8/90ms，零基 frame 5（450ms，第 6 个可见帧）碎屑Effect8*dir起3帧80ms/strike_stone；手重超MaxHandWeight慢攻击；HitSpeed为ShortInt
- **参考源码** [C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/FState.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/FState.pas>)：4441 StdMode43矿石纯度=Delphi Round(Dura/1000)
- **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](<../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs>)：ClientHitXY887按旧Dir检查前格不可走、锄Shape19/Dura>0并PileStones，=DIG不是矿石奖励
- **固定原服源码** [vendor/openmir2/src/M2Server/Maps/Envirnoment.cs](<../vendor/openmir2/src/M2Server/Maps/Envirnoment.cs>)：GetEventCellInfo仅按地图边界访问矿墙；AddToMapMineEvent/GetEvent不再要求墙可走，矿墙邻域另验CellMatch；普通GetCellInfo/CanWalk保持原行为。源SHA ec6476c7ed1b5aa35974e90e9c26a0441c7696745773cb19f55486a08f888fe5。
- **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs](<../vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs>)：PileStones矿点次数/十分钟恢复、原矿率与MakeMine/MakeMine2随机物种/原始Dura、背包空间限制和SendAddItem；墙StoneMineEvent与地面PileStones采用类型检查，已有FireBurnEvent不强转或替换，保留4/12/类型/品质/耗锄随机顺序。源SHA 13ae36c656e7d23018f562f07f64eb0cfff681a19331422c703818156a4291eb。
- **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](<../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs>)：ClientChangeDir310–340使用原服CM_TURN确认Dir；挖矿规则未修改
- **固定原服源码** [vendor/openmir2/src/Modules/SystemModule/Conf/Model/GameSvrConf.cs](<../vendor/openmir2/src/Modules/SystemModule/Conf/Model/GameSvrConf.cs>)：默认命中率4/产矿率12与品质、原服速度默认；固定ClientConf缺少参考hitTime/itemSpeed覆盖字段
- **契约** [docs/web-protocol.md](<../docs/web-protocol.md>)：mine方向/动作代数、TURN→HEAVYHIT、碎屑与真实SM200严格分离、死亡/切图排空、独立矿探针/准备/清理
- **参考源码** [C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/M2Server/Envir.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/M2Server/Envir.pas>)：276–285 GetMapCellInfo按边界返回原始墙格；790–813 AddToMapMineEvent按chFlag选可达矿墙；1407–1425 GetEvent不按可走状态过滤。
- **固定原服源码** [vendor/openmir2/src/GameSrv/Maps/Maps.cs](<../vendor/openmir2/src/GameSrv/Maps/Maps.cs>)：StartMakeStoneThread/MakeStoneMines启动既有矿图初始化，MINE/MINE2遍历地图分配矿墙事件；本轮初始化线程与概率规则保持原实现，修复墙格访问造成的恒假条件。
- **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](<../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs>)：ClientDropItem按min(Config.DropItemRage,3)散落；GetDropPosition与地物SM610真实落点不保证等于人物格，pickup必须走到实际地格再由原服决定结果。

现有实现：[apps/web/src/mining-controller.ts](<../apps/web/src/mining-controller.ts>)、[apps/web/src/play.ts](<../apps/web/src/play.ts>)、[apps/web/src/online-actors.ts](<../apps/web/src/online-actors.ts>)、[apps/web/src/magic-effects.ts](<../apps/web/src/magic-effects.ts>)、[apps/web/src/game-audio.ts](<../apps/web/src/game-audio.ts>)、[apps/web/src/inventory.ts](<../apps/web/src/inventory.ts>)、[services/web-gateway/MiningCommand.cs](<../services/web-gateway/MiningCommand.cs>)、[services/web-gateway/GatewaySession.cs](<../services/web-gateway/GatewaySession.cs>)、[services/web-gateway/LegacyCodec.cs](<../services/web-gateway/LegacyCodec.cs>)、[services/web-gateway/WorldProjection.cs](<../services/web-gateway/WorldProjection.cs>)、[services/web-gateway/CharacterProjection.cs](<../services/web-gateway/CharacterProjection.cs>)、[services/web-gateway/InventoryProjection.cs](<../services/web-gateway/InventoryProjection.cs>)、[vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs](<../vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs>)、[tools/mining_probe.mjs](<../tools/mining_probe.mjs>)、[tools/prepare_mining_probe.py](<../tools/prepare_mining_probe.py>)、[tools/cleanup_mining_probe.py](<../tools/cleanup_mining_probe.py>)、[vendor/openmir2/src/M2Server/Maps/Envirnoment.cs](<../vendor/openmir2/src/M2Server/Maps/Envirnoment.cs>)、[tests/NativeMiningRegression/NativeMiningRegression.csproj](<../tests/NativeMiningRegression/NativeMiningRegression.csproj>)、[tests/NativeMiningRegression/Program.cs](<../tests/NativeMiningRegression/Program.cs>)、[tools/mining_probe_ground.mjs](<../tools/mining_probe_ground.mjs>)、[tools/recover_mining_probe_ore.mjs](<../tools/recover_mining_probe_ore.mjs>)、[tests/mining_ground_regression.mjs](<../tests/mining_ground_regression.mjs>)。

必须通过：

- 成功：左键无目标装备可用锄且前格为墙或Shift时循环发送独立mine；原服TURN确认后才3015，真实矿图矿点按原规则随机SM200新增原始矿石实例和Dura纯度。
- 失败：无锄/损坏/错误方向/旧地图/不安全actionId/已有动作待决/客户端指定坐标或奖励必须拒绝；非矿图、非矿墙、耗尽矿点或背包满不得凭GOOD/DIG虚构矿石。
- 边界：手动移动/交互/技能/窗口/Escape/失焦/pointercancel停循环并排空原生旧请求；死亡、切图立即旧mine失败且旧TURN ACK不能确认新动作；五秒未知必须关闭旧连接重同步。
- 资源：自己收到DIG、远端SM15非空正文才触发重击零基 frame 5（450ms，第 6 个可见帧）的三帧碎屑与石击音；没有矿石也可有碎屑，延迟加载/隐藏/切图不得重建过期特效。
- 闭环：独立新角色正常买锄/装备/原矿率采样；drop前保留已知地物ID，仅接受本次新增且name/looks匹配、原散落范围三格内的地物，真实.map BFS避开墙/活体并逐步等待move ACK到达；原pickup/SM200/SM611保留矿石makeIndex与原始Dura，正常退出重登保存矿石和原锄；另验售矿、满包、矿脉十分钟恢复与MINE2。
- 原端对照：同朝向/等级/手重/速度状态下对照输入、循环节拍、挥锄/碎屑层级与声音；固定原服未提供的骑马featureEx及时序覆盖字段不得猜测映射。

当前验证：

- **纯回归** [.runtime/reports/services-mining-gateway-mining.log](<../.runtime/reports/services-mining-gateway-mining.log>)：2026-10-01实际Release net8 DLL执行9组PASS：生产GatewaySession/LegacyConnection本机TCP编码读写、八方向TURN确认后HEAVYHIT、忙碌与非法输入拒绝、SM200矿石实例/纯度、装备/位移中断、死亡/切图旧槽排空、TURN拒绝和原生五秒超时关闭；模拟旧协议端，仍不是真实原服或浏览器实测。
- **纯回归** [.runtime/reports/services-mining-gateway-mining-build.log](<../.runtime/reports/services-mining-gateway-mining-build.log>)：2026-10-01 MiningGatewayRegression Release net8构建成功，0警告/0错误；构建证明与九组模拟协议回归分开，不作为真实挖矿验收。
- **纯回归** [.runtime/reports/services-mining-mining_controller_regression.log](<../.runtime/reports/services-mining-mining_controller_regression.log>)：5组生产MiningController Node VM逻辑PASS；循环/方向/资格/共享槽/取消/超时/原始纯度，非浏览器运行
- **纯回归** [.runtime/reports/services-mining-mining_play_regression.log](<../.runtime/reports/services-mining-mining_play_regression.log>)：8组实际play.ts输入/ticker/消息handler AST执行PASS；矿意图、普通走路/Shift、真假碎屑、540ms/ACK、取消/拒绝/超时、只有itemAdded加矿；仍属模拟生产页面回归
- **纯回归** [.runtime/reports/mining-effects-review-regression.log](<../.runtime/reports/mining-effects-review-regression.log>)：最新9组生产MagicEffects fakePixi PASS：八方向原图/偏移/nearest/screen、三帧严格>80ms/原生独立时钟、切图、迟到/过期加载、失败重试
- **原素材像素** [.runtime/reports/mining-native-assets.json](<../.runtime/reports/mining-native-assets.json>)：24帧Effect直接原WIL/WIX重解码与现PNG字节一致、原91.wav字节；不含原端可执行运行对照
- **纯回归** [tests/test_mining_probe_preparation.py](<../tests/test_mining_probe_preparation.py>)：本轮8项PASS；默认plan无DB/私密输出、单角色命名空间、停服前置、SHA/时间/含夹具备份、地图MINE与真实墙、外来角色/无真实购锄拒绝、只角色字段SQL
- **纯回归** [tests/test_mining_probe_cleanup.py](<../tests/test_mining_probe_cleanup.py>)：本轮4项PASS；默认plan无DB/泄密、namespace、正常停服、全部所有权预检后才能清理
- **纯回归** [.runtime/reports/mining-probe-fixtures-regression.log](<../.runtime/reports/mining-probe-fixtures-regression.log>)：2026-10-01当前归档12项PASS，准备8项+清理4项：单角色namespace、默认plan无DB/私密输出、正常停服前置、备份SHA/时间/包含新夹具、真实MINE地图与墙面、外来所有权拒绝、必须正常购得可用锄、仅角色字段变更、全部清理所有权预检；测试临时副本/数据库替身，不是本机真实角色准备或清理证据。
- **源码复核** [services/web-gateway/GatewaySession.cs](<../services/web-gateway/GatewaySession.cs>)：与当前生产play回调逐段复核direction/actionId/mapGeneration、miningProgress/miningStrike/actionResult、原服数据权威与死亡/切图的旧native槽排空
- **源码复核** [.runtime/reports/mining-source-review-final.json](<../.runtime/reports/mining-source-review-final.json>)：独立只读复核两个最终源码SHA；墙矿分配/访问、邻域边界与FireBurnEvent类型处理已修正；普通CellMatch/CellValid/GetCellInfo/CanWalk、ClientHitXY、MakeMine/MakeMine2和品级方法保持原实现，仍保留原启动线程短暂发布窗口，不宣称普遍NativeList并发安全。
- **纯回归** [.runtime/reports/services-mining-native-wall-build.log](<../.runtime/reports/services-mining-native-wall-build.log>)：2026-10-01 NativeMiningRegression与实际M2Server/GameSrv Release net8构建0警告/0错误；编译成功独立于实际联机结论。
- **纯回归** [.runtime/reports/services-mining-native-wall-regression.log](<../.runtime/reports/services-mining-native-wall-regression.log>)：9/9实际MapManager/MakeStoneMines/PileStones/MakeMine回归PASS：真实锁定D401每MINE/MINE2各2720可达墙矿节点、非矿图0、25,25→墙24,26方向5可访问而不可走、出界/孤岩/普通移动、原4/12随机调用、原SM200实例/品质/背包满/十分钟补矿和真实FireBurnEvent同格处理；无DB、测试内受控随机与内存物品表，不是联机或原版可执行端运行。
- **纯回归** [.runtime/reports/services-mining-native-movement-regression.log](<../.runtime/reports/services-mining-native-movement-regression.log>)：实际PlayObject阻挡walk/run、立即纠正与解锁、旁观者隔离及恢复移动PASS；矿墙事件未改变普通移动取格语义。
- **纯回归** [.runtime/reports/services-mining-native-runtime-compat.log](<../.runtime/reports/services-mining-native-runtime-compat.log>)：2026-10-01 16:29:59本机独立staging以最终运行目录五个DLL执行NativeMiningRegression9/9 PASS；其中M2Server.dll SHA7e0afb8903f05fad7b462f3d56f80539f8cc0c18ac0a90a203bc926bf6f9c776包含另一原任务合入，兼容回归不替代其完整来源、浏览器或原端验收。
- **纯回归** [.runtime/reports/mining-ground-regression.log](<../.runtime/reports/mining-ground-regression.log>)：14/14共享生产ground helper回归PASS：新增ID与重复SM610、name/looks/三格范围、歧义拒绝、SM611/换图清理、真实D40125,25→26,26方向3、墙与活体BFS/边界、原makeIndex/rawDura/外观核验、单一私有夹具和主探针接线；未连接WebSocket或改运行数据。
- **真实协议** [.runtime/reports/mining-live-create.json](<../.runtime/reports/mining-live-create.json>)：真实旧协议创建单一隔离战士并正常退出保存；未把创建成功标成完整矿闭环。 记录时间：`2026-10-01T07:40:54.201Z`；报告SHA256：`482dd99f5ab5531cdc899ab17a0bc67ac97e77cc4389a58481b29c2155cb9d81`；环境：本机隔离m8hex/M8hex夹具；ws://127.0.0.1:18801/ws→固定原服，时间以报告为准。
- **真实协议** [.runtime/reports/mining-live-purchase.json](<../.runtime/reports/mining-live-purchase.json>)：2026-10-01 07:43:11.658Z–07:43:22.713Z真实map0综合商人带NPC会话购买原鹤嘴锄、原服务端实例及slot1装备9/9 PASS；未直接插入装备或改变矿率。 记录时间：`2026-10-01T07:43:22.713Z`；报告SHA256：`f214979d06de789dfcafc8a3f264d6fa08babf9953d55eb8e6f88c765d103ba0`；环境：本机18801 WebSocket→原服；独立战士、已有综合商人和真实商店库存。
- **真实协议** [.runtime/reports/mining-live-before-wall-fix.json](<../.runtime/reports/mining-live-before-wall-fix.json>)：修复前真实240次TURN/HEAVY成功位置不变，但0DIG/0SM200；报告ok=false，为墙矿访问漏洞的失败证据，不计成功闭环。 记录时间：`2026-10-01T07:52:55.462Z`；报告SHA256：`dba9c97d54188b17471ac62dbd9c746cf5d896f8ac98cd00a5e2579f35d8e1aa`；环境：本机18801→修复前固定原服；隔离夹具D40125,25，240次上限与原矿率。
- **真实协议** [.runtime/reports/mining-live-first-wall-fix.json](<../.runtime/reports/mining-live-first-wall-fix.json>)：首次墙矿修复后25挥锄/15DIG，SM200实例18129916/rawDura12035与drop ACK已收到；探针假定同格而超时，实际散落26,26，报告ok=false，不计拾取或重登成功。 记录时间：`2026-10-01T08:10:45.126Z`；报告SHA256：`a74ea02c5b742d5cf7bf09fe847d3cc57912c681eb1e52564d2a2604f30f9bda`；环境：本机18801→M2Server.dll33bac2e0baa953ae7f06ee3939263abc216d4d4fdf8c1264cf8999c3e33acc69；隔离D401夹具。
- **真实协议** [.runtime/reports/mining-ore-recovery.json](<../.runtime/reports/mining-ore-recovery.json>)：既有18129916/rawDura12035的安全恢复实际等待地物超时，ok=false，仅一项入D401检查通过；未恢复矿石，不计入成功样本，既有失败记录保留。 记录时间：`2026-10-01T08:25:12.080Z`；报告SHA256：`b71b04db75bbb2e1bb15a4393d101f3cebbc1cc1f9a5c572835737c84c0bca02`；环境：本机18801 WebSocket；仅私有单角色恢复工具，报告执行工具SHA与当前源码版本分别保留。
- **真实协议** [.runtime/reports/mining-live-final.json](<../.runtime/reports/mining-live-final.json>)：2026-10-01 08:28:36.540Z–08:29:36.735Z最终67/67 PASS、ok=true、closedLoopVerified=true：22挥锄/10DIG、真实SM200实例19273520/rawDura4996，drop地物100963682从25,25散落26,26，方向3真实move ACK→原pickup/SM200/SM611→正常断开重登矿石及原锄保存；无客户端选奖励/改变矿率。报告含两原服源码SHA、probe531397eb7a94668a1e6bea6fef36d9fd288654f41f024a5856e50a3ca13370c8、helper cdd1e8d63a409d49ba10e712a7251b9c669946fcd4b5cb5cb7384b9c26017340及本机DLL指纹；真实协议结果不证明浏览器输入/渲染或原端对照。 记录时间：`2026-10-01T08:29:36.735Z`；报告SHA256：`c0742b020dccbf72765dec338aaf3a2a9dc3e393c9004b9de93f1996322ea2f3`；环境：本机ws://127.0.0.1:18801/ws→原服；单一隔离战士D40125,25；最终本机M2Server.dll SHA7e0afb8903f05fad7b462f3d56f80539f8cc0c18ac0a90a203bc926bf6f9c776，SystemModule.dll SHA5f9746cf38cf5171fd9a0eadcb27d989e1a2c7936fc28590443610bf42a1c7bf。
- **真实协议** [.runtime/reports/mining-live-run.log](<../.runtime/reports/mining-live-run.log>)：同次最终67/67真实矿闭环控制台回执；与mining-live-final.json结合读取，成功范围仅单一隔离夹具和该运行环境。 记录时间：`2026-10-01T08:29:36.735Z`；报告SHA256：`f2b2218dcc252292fe21aef663658ea32f9446c6bd5d7d7ddfa46b977a02901d`；环境：与mining-live-final.json同次本机18801→原服运行。
- **真实协议** [.runtime/reports/mining-cleanup.json](<../.runtime/reports/mining-cleanup.json>)：2026-10-01 08:31:41.786839Z正常停服并有效备份后清理1个隔离夹具；verified=true、remainingAccountsCharactersIndexes=0，私有manifest密码已移除；这是实测夹具收尾，非玩法视觉完成。 记录时间：`2026-10-01T08:31:41.786839+00:00`；报告SHA256：`b9f1a19d026ca1e181c26783a9872106dd4ee21f0eae0b9da898696265713b52`；环境：本机真实矿夹具生命周期收尾；仅本次私有namespace，正常停服+备份163041后数据库残留核验。
- **源码复核** [.runtime/reports/services-mining-runtime-final.json](<../.runtime/reports/services-mining-runtime-final.json>)：2026-10-01 08:32:37.415444Z清理后原服supervisor11300 ready，5173/play.html和18801/health均HTTP200；fixtureCredentialsRemoved=true；记录当前M2Server/GameSrv/SystemModule真实本机DLL SHA，仅环境恢复与健康，不是浏览器交互/native-client证据。

剩余缺口：

- 生产浏览器真实墙点/Shift/循环节拍/取消/碎屑层级/声音/纯度提示与同版本原端同场景运行对照仍缺；67/67真实协议、AST、fakePixi和原服专项回归均不替代browser_runtime/native_runtime。
- 真实非矿图、非矿墙、满包、耗尽/十分钟恢复、不同矿种原始纯度范围、MINE2及售矿仍需专项联机验收；这些边界已有部分原服无DB回归，不能扩大最终D401单角色22次样本范围。
- 参考ClientConf可覆盖1400/60节拍，骑马来自featureEx低字节；固定服务端ClientConf/Desc未提供这些字段，保留参考默认/缺口，不从普通feature或原服HitIntervalTime900伪造覆盖。
- 原MakeStoneMines后台线程与NativeList发布窗口保留；本轮D401无门墙、单写者矿墙初始化已复核，未证明所有未来地图的并发/动态门矿事件行为。

<a id="game-034"></a>

### GAME-034 背包穿脱装备、双槽与条件限制

状态：`partial`。

现有实现：`apps/web/src/inventory.ts`、`apps/web/src/paperdoll.ts`、`services/web-gateway/GatewaySession.cs`、`services/web-gateway/InventoryProjection.cs`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/item-icons.ts`、`tests/item_icon_consumers_regression.mjs`。

依据及等级：`server_source` vendor/openmir2/src/M2Server/Items/GameItemSystem.cs — 原服物品/装备属性<br>`source_review` services/web-gateway/GatewaySession.cs — 实例、槽位、类型校验<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。。

必须通过：

- 成功：男女衣服、武器、头盔、项链、双戒双镯、道具位穿脱后快照/外观/能力一致。
- 失败：错误职业/性别/等级/负重、错槽/未知实例及背包满卸装得到明确拒绝。
- 边界：双槽优先空槽、替换回包、拖动取消/失焦、一次实例不能同时背包与装备。

当前验证：`unit_regression` .runtime/reports/frontend-events-final.log — dual accessories/selection cancellation<br>`live_protocol` .runtime/reports/native-bridge-equipment.json — 旧编码桥武器穿戴和重登；不是Web浏览器交互<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。。

剩余缺口：

- 原端桥装备报告可证协议保存；当前Web全部装备/拒绝路径和叠图未验。

<a id="game-035"></a>

### GAME-035 物品使用、药包、卷轴与回城

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Items/GameItemSystem.cs](../vendor/openmir2/src/M2Server/Items/GameItemSystem.cs)：药品、打包药、卷轴由原服消费； **工作树审计** [docs/local-playtest.md](../docs/local-playtest.md)：当前回城石试玩物品和药包修复。

现有实现：[apps/web/src/inventory.ts](../apps/web/src/inventory.ts)、[apps/web/src/item-quickbar.ts](../apps/web/src/item-quickbar.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[vendor/openmir2/src/M2Server/Items/GameItemSystem.cs](../vendor/openmir2/src/M2Server/Items/GameItemSystem.cs)。

必须通过：

- 成功：双击/数字快捷药品、药包展开、随机/地牢/回城卷使用只按原服结果更新实例与资源/地图。
- 失败：满包药包、不允许传送地图、已满HP/MP、未满足物品条件保留物品且提示。
- 边界：同时连点/两入口使用同一实例、待决时断线、不足五空位六瓶展开、回城绑定点变化。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：six consumable keys/rebinding/pending

剩余缺口：

- 当前报告不包含Web真实药包、回城卷完整使用和失败路径；原端手工历史需补时间线证据。

<a id="game-036"></a>

### GAME-036 丢弃物品、金币与地面往返

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs) 接受正数CM_DROPGOLD；[PlayObject.Operate.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs) 校验安全区、禁丢地图、余额并在创建地面金币失败时回滚；**参考客户端** [FState.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/FState.pas) 显示金币伪物品/数量对话框顺序，但未证明与目标国服客户端同版；**工作树审计** [GatewaySession.cs](../services/web-gateway/GatewaySession.cs) 映射Web数量至CM_DROPGOLD=1016.Param，范围1..65535，不是运行实例证明。

现有实现：[apps/web/src/inventory.ts](../apps/web/src/inventory.ts)、[apps/web/src/gold-drop.ts](../apps/web/src/gold-drop.ts)、[apps/web/src/system-dialog.ts](../apps/web/src/system-dialog.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。金币 UI 不乐观扣款，待权威currency更新或失败消息结算。

必须通过：

- 成功：原版规定的物品拖放操作更新背包/地面；金币数量输入仅发送合法16位协议数量，最终余额和地面实例以原服为准。
- 失败：绑定物、交易中实例、禁丢区域、非法数量和地面创建失败都不能造成虚假本地扣除；原服的回滚与失败消息正确投影。
- 边界：金币保留至少1枚、余额上限与协议参数边界、丢弃/拾取往返、掉落消失TTL、断线/重复提交/重登持久守恒。

当前验证：**纯回归** [gold-drop-contract-checks-2026-10-02.json](../.runtime/reports/gold-drop-contract-checks-2026-10-02.json) 记录生产金币控制器5组、系统数量对话框28组、WebGateway源码合同10组及TypeScript检查；仅fake DOM/源合同，未重启18801、未连接原服、没有浏览器画面或存档证明。旧拖放回归见 [frontend-events-final.log](../.runtime/reports/frontend-events-final.log)。

剩余缺口：

- 测试网关仍是旧运行实例，当前WebGateway目标net10.0，本机仅有SDK8；需获得目标框架构建或兼容构建证据并在确认零活动连接后独立部署/协议实测。
- 尚无同版原端与真实浏览器输入/800×600视觉对照；未验证安全区、禁丢地图、服务器门槛、余额临界、地面创建失败回滚、拾取、断线重复与重登存档。
- 堆叠、拆分、部分交易仍缺同版协议/客户端数据证据；可选quantity/count字段只保留服务端显示，不提供伪数量操作。

<a id="game-037"></a>

### GAME-037 持久、破损、特殊属性及特殊戒指

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Items/GameItemSystem.cs](../vendor/openmir2/src/M2Server/Items/GameItemSystem.cs)：物品属性由原服加载； **工作树审计** [services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)：642装备持久/归零破损； **工作树审计** [docs/special-rings-audit.md](../docs/special-rings-audit.md)：特殊戒指规则审计。

现有实现：[services/web-gateway/InventoryProjection.cs](../services/web-gateway/InventoryProjection.cs)、[apps/web/src/inventory.ts](../apps/web/src/inventory.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[docs/special-rings-audit.md](../docs/special-rings-audit.md)。

必须通过：

- 成功：持久损耗、破损移除、极品/幸运诅咒/命中闪避等属性在Tooltip/装备/人物能力一致。
- 失败：未知物品属性不伪造；破损装备不继续显示有效加成。
- 边界：修理最大持久下降、特殊修理、特殊戒指触发/冷却/重登、实例属性持久化。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：inventory/equipment/shop shared attribute tooltip； **真实协议** [.runtime/reports/native-bridge-reconnect.json](../.runtime/reports/native-bridge-reconnect.json)：一次旧编码桥装备持久恢复

剩余缺口：

- 当前资源报告有item icon缺项；特殊戒指和完整随机属性浏览器/原端对照缺失。

<a id="game-040"></a>

### GAME-040 NPC交互距离、脚本文本与菜单

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Base.cs)（ClientClickNpc:674–696：原服节流严格 > ClickNpcTime，再定位商人/NPC并执行脚本）； **工作树审计** [services/web-gateway/NpcProjection.cs](../services/web-gateway/NpcProjection.cs)（旧脚本多行文本/链接/任务标记投影）； **工作树审计** [services/web-gateway/NpcConversation.cs](../services/web-gateway/NpcConversation.cs)（当前 npcId/npcSessionId/mapGeneration、A→B/关闭/跨图失效；原始同Actor旧包无nonce的限制）。

现有实现：[services/web-gateway/NpcProjection.cs](../services/web-gateway/NpcProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/NpcConversation.cs](../services/web-gateway/NpcConversation.cs)、[apps/web/src/npc-session.ts](../apps/web/src/npc-session.ts)、[tools/npc_skill_probe.mjs](../tools/npc_skill_probe.mjs)、[tools/npc_probe_session.mjs](../tools/npc_probe_session.mjs)、[tools/world_events_probe.mjs](../tools/world_events_probe.mjs)、[tools/skill_combat_probe.mjs](../tools/skill_combat_probe.mjs)、[tools/guild_war_probe.mjs](../tools/guild_war_probe.mjs)、[tools/castle_war_probe.mjs](../tools/castle_war_probe.mjs)、[tests/npc_probe_session_regression.mjs](../tests/npc_probe_session_regression.mjs)。

必须通过：

- 成功：相邻活NPC使用当前会话戳打开，脚本文字/链接按序显示；从技能导师A切到综合商人B时只有B当前对话有效。
- 失败：远距/消失/非法选项/输入拒绝；旧A菜单与关闭不能影响B；关闭B后其旧菜单和旧mapGeneration请求拒绝。
- 边界：同NPC重开会话ID递增、翻页/输入型脚本、原服ClickNpcTime节流、断线/走离/跨图/关闭；迟到经济结算仍保留服务器权威但不重开过期UI。
- 协议限制：原始同一NPC Actor迟到包无请求nonce；必须在文档记录无法由传统报头独立区分的情况，不能将所有同Actor竞态标为已验证。

当前验证：**真实协议** [.runtime/reports/world-events-live.json](../.runtime/reports/world-events-live.json)（隔离导师选项学火墙和冲撞）； **真实协议** [.runtime/reports/npc-skill-live.json](../.runtime/reports/npc-skill-live.json)（最新51/51通过中的导师/综合商人真实会话：A→B、旧A菜单拒绝/旧A关闭保B、B关闭旧菜单拒绝、重新打开ID递增/旧代次拒绝；不是全NPC/浏览器验收）； **纯回归** [.runtime/reports/npc-probe-session-regression.log](../.runtime/reports/npc-probe-session-regression.log)（4组探针会话回归：actor/session/map匹配、严格点击节流、stale A close保B、跨图serial/setting override；其它4探针只迁移及语法校验，未重跑）； **纯回归** [.runtime/reports/npc-gateway-session-2026-10-01.log](../.runtime/reports/npc-gateway-session-2026-10-01.log)（9个生产GatewaySession反射NPC组PASS：当前戳/旧请求拒绝、结果归属/失效隔离；dummy WebSocket与fixture，不能证明实际经济结算或浏览器）

剩余缺口：

- 本批导师/综合商人会话隔离真实协议已通过；所有NPC输入型脚本/分页/远距/走离与完整商店、修理、仓库经济请求仍需逐项协议/生产浏览器回放及原端对照。
- 传统协议同Actor迟到回复无nonce，仍需明确时序限制；其它仓库NPC probe已迁移新戳而未重新实跑，旧报告不能证明本批兼容。

<a id="game-041"></a>

### GAME-041 商品目录、装备实例与购买

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Sale.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Sale.cs)：原服BuyItem和股票； **工作树审计** [services/web-gateway/ShopProjection.cs](../services/web-gateway/ShopProjection.cs)：645目录/652实例/650651确认。

现有实现：[apps/web/src/shop.ts](../apps/web/src/shop.ts)、[services/web-gateway/ShopProjection.cs](../services/web-gateway/ShopProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：装备详情实例、库存/价格/持久、翻页、药品购买由当前商人确认。
- 失败：金币不足/背包满/超重/售完/过期实例/改名或价格篡改均拒绝。
- 边界：双客户端购买最后一件、等待/超时/关窗/断线不重复购买，成功同步金币和背包。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：shop pending timeout and shared tooltips

剩余缺口：

- 没有当前Web商店真实购买报告；普通商人和综合商人配置需要逐菜单复刻跟踪。

<a id="game-042"></a>

### GAME-042 出售与原服询价

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Sale.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Sale.cs)：查询价格和出售； **工作树审计** [services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)：当前NPC/实例/询价绑定。

现有实现：[apps/web/src/shop.ts](../apps/web/src/shop.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[services/web-gateway/ShopProjection.cs](../services/web-gateway/ShopProjection.cs)。

必须通过：

- 成功：选择允许出售的物品，原服报价，确认后金币/实例删除一致。
- 失败：不收购类型/错误NPC/实例失效/未询价不能出售。
- 边界：卖肉矿品质报价、卖最后一个物品、取消/超时/切图无误删。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：shop timeout/attribute tooltip

剩余缺口：

- 尚无本项当前生产浏览器完整成功/失败/边界回放及同版本原端对照；已有协议或纯回归通过不能作为完整复刻验收。

<a id="game-043"></a>

### GAME-043 普通与特殊修理

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Sale.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Sale.cs)：修理费用/普通特殊持久； **工作树审计** [services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)：668/671/669670与10241023。

现有实现：[apps/web/src/repair.ts](../apps/web/src/repair.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：同商人询价/修理，普通与特殊模式对应费用和最大持久变化。
- 失败：不可修理、金币不足、非法实例、取消或报价过期保留原持久。
- 边界：0持久装备、修理后立即装备、多个报价竞态、断线重登一致。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：repair timeout and tooltip

剩余缺口：

- 尚无本项当前生产浏览器完整成功/失败/边界回放及同版本原端对照；已有协议或纯回归通过不能作为完整复刻验收。

<a id="game-044"></a>

### GAME-044 仓库存取、分页与容量

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs)：原服仓库存取； **工作树审计** [services/web-gateway/StorageProjection.cs](../services/web-gateway/StorageProjection.cs)：700–707分页与实例。

现有实现：[apps/web/src/storage.ts](../apps/web/src/storage.ts)、[services/web-gateway/StorageProjection.cs](../services/web-gateway/StorageProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：存取实例/名称/持久属性、分页和剩余容量一致。
- 失败：仓库满/背包满/超重/已移除/非当前NPC正确拒绝。
- 边界：同名多实例、仓库最后一页为空、pending超时/关窗/断线重登守恒。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：storage timeout and tooltip

剩余缺口：

- 尚无本项当前生产浏览器完整成功/失败/边界回放及同版本原端对照；已有协议或纯回归通过不能作为完整复刻验收。

<a id="game-045"></a>

### GAME-045 技能书学习、键槽持久化与熟练度

状态：`partial`。

现有实现：`services/web-gateway/MagicProjection.cs`、`services/web-gateway/MagicKeyBinding.cs`、`apps/web/src/skills.ts`、`apps/web/src/play.ts`、`services/web-gateway/GatewaySession.cs`、`vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/classic-hud.ts`、`tests/skill_icons_regression.mjs`、`docs/skill-icon-reference-2026-10-01.md`、`tools/classic_version_boundary_audit.py`、`tests/test_classic_version_boundary_audit.py`、`docs/classic-version-boundary-2026-10-01.md`。

依据及等级：`server_source` vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs — 技能书学习；ClientChangeMagicKey:845–880 校验 ASCII/#0、原服去冲突并回 211 实际快照<br>`source_review` services/web-gateway/MagicProjection.cs — 210/211/212/640 技能及熟练度投影<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。<br>`source_review` docs/classic-version-boundary-2026-10-01.md — 第七批全1000/108逐行支持与扩展声明/未知版本、静态入口证据；没有同包原端历史版本证明。。

必须通过：

- 成功：正确职业/等级技能书学习、210新增、640训练升级；None/F1–F8 设置经真实 211 确认，原服存档后重登恢复。
- 失败：重复学习/不合条件/无书/不可训练不能消费或增加本地熟练度；改绑非法 key/未知技能/拒绝/超时不替换已确认键。
- 边界：同名书、技能删除、多于八技能、升满3级、待决时移除/切图/断线；占用 F 槽由服务器解绑原技能。

当前验证：`live_protocol` .runtime/reports/world-events-live.json — 既有导师学习22/27；该报告不验证本批改绑或重登<br>`unit_regression` .runtime/reports/npc-skills-skill_keys_regression.log — 最新7组PASS：原ASCII/None/稀疏/全技能、confirmed与pending、唯一实际快照、拒绝/超时/关闭/移除、bindingId阻止旧超时或拒绝清新请求；VM不是浏览器<br>`unit_regression` .runtime/reports/skill-keys-gateway.log — 本批3组PASS：CM1008编码/解码、仅已学技能与合法key、快照确认与冲突；独立 .NET 8 兼容测试，非 .NET 10 生产运行<br>`live_protocol` .runtime/reports/npc-skill-live.json — 最新51/51全程通过：导师教授多技能，CM1008原ASCII/None、占槽解绑、非法与未学拒绝、实际211和独立move、正常断线重登恢复全部稀疏键；非正常书籍/640成长<br>`unit_regression` .runtime/reports/npc-gateway-session-2026-10-01.log — 4个生产网关binding反射组PASS：请求identity拒绝/slot隔离、实际5秒timer、同magic/key的新binding防旧超时、取消timer；dummy WebSocket，无原服/DB/浏览器<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/map-v7-sentinel-web-tests.json — 最终实际352组/30脚本模块/VM/Pixi回归；含源选择、54特殊引用nil路径和切图/失败恢复，非浏览器。<br>`unit_regression` .runtime/reports/map-v7-final-python-checks.json — 修复默认源路径后完整Python339/339通过；current render与original fidelity分别断言，独立内容CLI继续exit1。。

剩余缺口：

- 技能改绑及断线重登键位持久化已由隔离角色真实协议通过；正常技能书学习、失败不消费与640熟练度成长尚缺专门真实协议/浏览器验收。
- 生产浏览器技能选择/等待/拒绝/关闭路径、正常书籍交互与同版本原端布局/时序对照仍未完成。

<a id="game-050"></a>

### GAME-050 目标/地面/方向/自我/辅助施法输入

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：33项使用规则；距离8； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY原服结算。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：地面坐标、方向、敌体、盟友/自我的输入方式正确携带actionId/mapGeneration，完整技能均可到达。
- 失败：未知技能/未学习/非法坐标/超8格/NPC/尸体目标拒绝。
- 边界：点空地、多层前景、目标移动、取消选择、在途回包、视野外失效，所有技能逐项验证。

当前验证：**纯回归** [.runtime/reports/gateway-events-final.log](../.runtime/reports/gateway-events-final.log)：target/point/directional/invalid aim； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：ground/rush/input range； **真实协议** [.runtime/reports/gameplay-live-check.json](../.runtime/reports/gameplay-live-check.json)：雷电空地目标0及非法坐标/NPC拒绝

剩余缺口：

- 全部33项输入契约已有，但大部分技能只有泛化通道，没有完整效果实现或真实玩法证据。

<a id="game-051"></a>

### GAME-051 F1–F8改绑、稀疏槽及未分配技能

状态：**部分实现**（`partial`）。

依据及等级：**参考源码** [FState.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/FState.pas>)（3519/3522–3532：选择按键、占槽先解绑 #0 后设置；5381–5392：F1–F8 ASCII 49–56 / None #0）； **参考源码** [ClMain.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas>)（3086–3091：CM_MAGICKEYCHANGE Recog=magicId，Param=byte(keych)，Tag/Series=0）； **固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)（58：CM_MAGICKEYCHANGE=1008）； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)（881–883：CM1008 调 ClientChangeMagicKey，没有 +GD；动作成功回复独立于改绑）； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs)（845–880：仅合法字符及已学技能写 UserMagic.Key；非0槽清除其他占槽技能，再 SendUseMagic 发211实际快照）。

现有实现：[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/classic-hud.ts](../apps/web/src/classic-hud.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/MagicKeyBinding.cs](../services/web-gateway/MagicKeyBinding.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs)、[tests/skill_keys_regression.mjs](../tests/skill_keys_regression.mjs)、[tests/MagicKeyRegression/MagicKeyRegression.csproj](../tests/MagicKeyRegression/MagicKeyRegression.csproj)、[tests/MagicKeyRegression/Program.cs](../tests/MagicKeyRegression/Program.cs)、[tools/npc_skill_probe.mjs](../tools/npc_skill_probe.mjs)、[tools/cleanup_npc_skill_probe.py](../tools/cleanup_npc_skill_probe.py)、[tests/test_npc_skill_cleanup.py](../tests/test_npc_skill_cleanup.py)。

必须通过：

- 成功：技能页选已学技能，用 None/F1–F8 选择器确定；原服 CM1008 处理后真实211快照同时更新技能列表及稀疏HUD；占用槽先解除原技能；正常断线保存后重登恢复。
- 失败：未知/未学技能、非法 1–8 数值别名或其它key、重复请求、拒绝和5秒超时均保留最后已确认槽；等待期间不能改绑或施法；冲突快照不能误确认。
- 边界：多于八项及None技能仍完整显示，未分配不自动填F槽；关闭技能页/窗口、Escape、失焦、pointercancel、断线、技能移除释放UI等待；已发送指令的迟到真实快照仍更新权威技能。
- 对照：原端键选择的布局/热区/颜色/时序，8个F槽、None、占槽解绑与重登逐场景对照；参考源码只证明编码和流程，不能证明当前国服模态窗口像素。

当前验证：**纯回归** [.runtime/reports/npc-skills-skill_keys_regression.log](../.runtime/reports/npc-skills-skill_keys_regression.log)（最新7组PASS：原ASCII/None/稀疏/全技能、confirmed与pending、唯一实际快照、拒绝/超时/关闭/移除、bindingId阻止旧超时或拒绝清新请求；VM不是浏览器）； **纯回归** [.runtime/reports/skill-keys-gateway.log](../.runtime/reports/skill-keys-gateway.log)（3组PASS：ASCII0/49–56、1008 Recog/Param及编码往返、只已学技能、同槽快照唯一确认；独立.NET8不是生产.NET10）； **工作树审计** [tests/skill_keys_regression.mjs](../tests/skill_keys_regression.mjs)（对应有限逻辑测试场景实现；不当作真实运行/原端对照）； **纯回归** [.runtime/reports/npc-skill-cleanup-regression.log](../.runtime/reports/npc-skill-cleanup-regression.log)（4项清理边界回归PASS：严格fixture身份/重复、默认plan无DB与凭据输出、正常停服要求、全部身份预检后才允许删除；非真实清理）； **真实协议** [.runtime/reports/npc-skill-live.json](../.runtime/reports/npc-skill-live.json)（最新51/51通过：ASCII49–56逐键实际211+bindingId确认、占槽解绑/None、6类非法key与未学拒绝、紧接move独立actionId、None与稀疏F1/F8正常断线重登恢复）； **纯回归** [.runtime/reports/npc-gateway-session-2026-10-01.log](../.runtime/reports/npc-gateway-session-2026-10-01.log)（4个生产网关binding反射组PASS：请求identity拒绝/slot隔离、实际5秒timer、同magic/key的新binding防旧超时、取消timer；dummy WebSocket，无原服/DB/浏览器）

**真实协议夹具收尾** [.runtime/reports/npc-skill-cleanup.json](../.runtime/reports/npc-skill-cleanup.json)：本批真实NPC/技能协议夹具收尾已完成：清理4个fixtures，verified=true、remainingAccountsCharactersIndexes=0；四项纯回归与四个实际夹具清理分别记录，本报告不是浏览器或原端交互证据。 记录时间：`2026-10-01T06:38:56.715337+00:00`；报告SHA256：`5a8cf3c6c08525608637b48b108e7ddac292e822a5eadf0402161a3b1dea3263`。

剩余缺口：

- 本批真实协议已闭合八键/None/占槽冲突/非法与未学拒绝/独立移动/重登持久化；切图或技能删除期间待决、重复请求、丢失211的5秒超时与迟到bindingId失败归属仍需专门运行竞态验收。
- 生产浏览器技能页选择器可见热区、pending/失败/关闭路径与800×600窗口组合，以及同版本国服原端键选择模态框对照未完成；因此保持partial。
- 最新npc-skill-live.json为51/51通过，早三次失败报告保留在.runtime/reports：外部重启期间入服拒连、随机第二NPC超时、错误测试NPC名称；这些失败不算完整玩法通过。

<a id="game-052"></a>

### GAME-052 技能魔耗、材料、冷却与失败反馈

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-combat.json](../content/classic-176/skill-combat.json)：原服取整魔耗/符/毒粉/状态； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：服务器魔力材料与技能冷却。

现有实现：[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)。

必须通过：

- 成功：每个技能在0–3级的MP与符/毒粉持久消耗符合原服，成功/失败对玩家可见。
- 失败：MP/材料/等级不足、冷却未过、目标无效释放pending且不伪造消耗。
- 边界：同Tick连施、材料最后一格、技能等级/装备变化、断线重同步及满级不再训练。

当前验证：**纯回归** [.runtime/reports/gateway-events-final.log](../.runtime/reports/gateway-events-final.log)：warrior MP gates； **真实协议** [.runtime/reports/gameplay-live-check.json](../.runtime/reports/gameplay-live-check.json)：火剑冷却/超时状态；不覆盖完整MP消耗

剩余缺口：

- P0数值只有15项，范围技能和持续状态完整魔耗/材料/冷却证据缺失。

<a id="game-053"></a>

### GAME-053 持续状态、解除与正确叠层

状态：**部分实现**（`partial`）。

依据及等级：**参考源码** [Actor.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas>)（657状态位/毒色/隐身/魔法盾）； **固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)（SM_CHARSTATUSCHANGED657）； **项目契约** [content/classic-176/actor-status.json](../content/classic-176/actor-status.json)（本批持续盾六帧/source SHA、毒色优先级/部位、死亡/换图/迟到清理及参考/推断边界）； **原端像素** [Magic.wil](<C:/Program Files (x86)/shanda/Legend of Mir/Data/Magic.wil>)（3890–3892/3900–3902 已按本机国服原帧重解码比较；不是原端实机）。

现有实现：[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/CharacterProjection.cs](../services/web-gateway/CharacterProjection.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[content/classic-176/actor-status.json](../content/classic-176/actor-status.json)、[tests/actor_status_regression.mjs](../tests/actor_status_regression.mjs)。

必须通过：

- 成功：红毒/绿毒/石化/隐身/护盾等状态分别从原服bit应用到正确部位/颜色/透明和持续效果。
- 失败：解除bit立即恢复，不把红绿毒合成同一种颜色，不由浏览器TTL替原服解除。
- 边界：多bit优先级、受到攻击、状态进出视野/换图/重登/死亡以及素材迟到不重建旧状态。

当前验证：**纯回归** [.runtime/reports/actor-status-regression.log](../.runtime/reports/actor-status-regression.log)（15组生产 ActorStatusEffects/OnlineActor + fake Pixi/时钟 PASS：盾持续/受击/解除/死亡/素材迟到/排队防旧状态、body/hair红绿毒色及优先级）； **原端像素** [.runtime/reports/actor-status-native-assets.json](../.runtime/reports/actor-status-native-assets.json)（6/6国服Magic原帧重解码与PNG bytes/hash/几何/alpha一致；无原端或浏览器实机显示）

剩余缺口：

- 持续盾与红绿毒色已补齐且15组纯回归通过；实际 SM657/SM_STRUCK/health 确认来源、状态叠层/解除/重登仍需真实协议与浏览器回放。
- 参考 Color256Anti 最近原256色调色板量化尚缺，screen只复现RGB混合；隐身自身/他人透明差异、石化表现和其它状态需原端实机对照。

<a id="game-054"></a>

### GAME-054 持续地图事件、入视野与光照

状态：**部分实现**（`partial`）。

依据及等级：**参考源码** [clEvent.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/clEvent.pas>)：ET_FIRE5 Magic1630..1635；原服事件ID管理； **固定原服源码** [vendor/openmir2/src/Modules/SystemModule/MagicEvent/MapEvent.cs](../vendor/openmir2/src/Modules/SystemModule/MagicEvent/MapEvent.cs)：每事件非零唯一ID。

现有实现：[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[vendor/openmir2/src/Modules/SystemModule/MagicEvent/MapEvent.cs](../vendor/openmir2/src/Modules/SystemModule/MagicEvent/MapEvent.cs)。

必须通过：

- 成功：火墙五格独立ID/坐标，40ms原6帧循环，生命周期由804/805；进出视野同步。
- 失败：重复事件、805先到、素材失败/迟到不会重复或复活效果。
- 边界：换图后复用ID、1000事件、每事件原端灯光，困魔等其他事件也应按类型实现。

当前验证：**真实协议** [.runtime/reports/world-events-live.json](../.runtime/reports/world-events-live.json)：火墙五格ID/坐标/到期； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：firewall duplicates/clear/hide async/shared ticker； **纯回归** [.runtime/reports/native-map-events-regression.log](../.runtime/reports/native-map-events-regression.log)：1000唯一事件ID

剩余缺口：

- 目前仅eventType5可绘制，其他类型登记无sprite；火墙灯光与逐帧原端对照缺。

<a id="game-060"></a>

### GAME-060 聊天五频道、中文输入与系统广播

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Chat.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Chat.cs)：附近/喊话/私聊/组队/行会规则； **源码审查** [services/web-gateway/ChatCommand.cs](../services/web-gateway/ChatCommand.cs)：180 GBK字节/私聊目标验证； **固定原服源码** [vendor/openmir2/src/GameGate/Services/ClientSession.cs](../vendor/openmir2/src/GameGate/Services/ClientSession.cs)：CM_SAY原ChatInterval节流，原服PlayObject.Chat SayMsgTime/禁言与SayMsgMaxLen按原规则保留；原生无Web chatId/投递ACK。

现有实现：[services/web-gateway/ChatCommand.cs](../services/web-gateway/ChatCommand.cs)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[apps/web/src/chat-input.ts](../apps/web/src/chat-input.ts)、[tests/chat_input_regression.mjs](../tests/chat_input_regression.mjs)、[tests/chat_play_regression.mjs](../tests/chat_play_regression.mjs)、[tests/ChatSessionRegression/Program.cs](../tests/ChatSessionRegression/Program.cs)、[docs/chat-ui-reference-2026-10-01.md](../docs/chat-ui-reference-2026-10-01.md)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[tools/chat_probe.mjs](../tools/chat_probe.mjs)。

必须通过：

- 成功：五频道与私聊对象按原服命令映射，中文IME不触发热键，服务广播颜色/顺序保留。
- 失败：非法/空内容、超180GBK字节、无私聊对象、频道权限限制有明确反馈。
- 边界：断线重连不重复发、长名字、多字节临界/换行、F键与输入框焦点、消息滚动。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：chat channel/recipient controls； **纯回归** [.runtime/reports/chat-ui-regression-2026-10-01.json](../.runtime/reports/chat-ui-regression-2026-10-01.json)：生产聊天控制器19组、实际play AST接线7组、纯ChatCommand/LegacyCodec5组PASS：raw五频道/@优先、IME/229、发送失败草稿、原姓名token、前缀热键、旧chatId隔离；fakeDOM非浏览器。发送历史100条为proposed，原Up/Down为滚动。；记录时间 2026-10-01T09:46:51.389049+00:00；环境 Windows Node VM/fakeDOM and net8 direct production class regression；报告SHA256 `ff572abb6452d6f6c90fbb2df2ad9595547d47b1500889db31d3f4957b00ac4f`； **纯回归** [.runtime/reports/chat-session-regression.log](../.runtime/reports/chat-session-regression.log)：生产GatewaySession.Run真实Web请求5组：合法/非法chatId回显、raw prefix编码与拒绝；模拟loopback TCP对端，不是原服投递/禁言/权限验收。；记录时间 2026-10-01T09:46:51.389049+00:00；环境 Windows net8 actual production Run + loopback sockets；报告SHA256 `4e94be3abe43e88e0b81ad6c458feccbb2afea3dcadb808150320e9b437003a2`； **真实协议** [.runtime/reports/chat-live.json](../.runtime/reports/chat-live.json)：37/37真实原服、复用两个owned Warrior：附近local发送/双方SM40 echo，raw /peer实际SM103私聊；180 ASCII与180 CJK GBK在Web接受后按原SayMsgMaxLen=80字符截断送达，181/182 GBK拒绝；非法chatId不伪回显、A/B queued各自ID、拒绝后原独立move GOOD恢复。原SayMsgTime3000/RunGate800以3200ms间隔发送，无聊天投递ACK注入或假设。没测组队/行会/喊话权限、禁言/忽略/跨图、真实IME/浏览器/原端。；记录时间 2026-10-01T10:01:12.204Z；环境 Windows real ws://127.0.0.1:18801/ws -> original native; two preexisting isolated protocol-owned warriors; local .NET8 Gateway compatibility build；报告SHA256 `ec9ba4274f2002aeae0a30b17b2154d3cd3c78b632b76135907ab638ad89f3be`；实际M2 SHA256 `09a2902cc751b2a61ae0577b93a8a0c2a9948e2ada64b8055391ab037500d436`；实际Gateway SHA256 `c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97`；对应源码全部SHA见报告 sourceSha256； **真实协议** [.runtime/reports/melee-cleanup.json](../.runtime/reports/melee-cleanup.json)：正常停服并有效备份后清理本次协议拥有的两名战士隔离夹具：removedFixtures=2、remainingAccountsCharactersIndexes=0、verified=true；仅证明测试夹具收尾，不把它计为技能数值、权限、画面或原客户端完成。；记录时间 2026-10-01T10:04:10.210525+00:00；环境 Windows isolated owned warrior fixtures; normal native stop + verified backup; exact namespace cleanup and real residual database verification；报告SHA256 `681d53e58b45fe7bc085e86fe85eb94ec54d7c80f62c49caa1dc44c7ca908fc6`； **源码审查** [.runtime/reports/melee-cleanup-gateway-ready.json](../.runtime/reports/melee-cleanup-gateway-ready.json)：清理完成后测试网关实际重新ready，health.status=ready、protocol=1，运行Gateway SHA仍为c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97；仅为环境恢复证据，不是浏览器/原客户端交互验收。；记录时间 2026-10-01T10:06:10.2851933Z；环境 local Windows test18801 gateway restarted after owned fixture cleanup; actual HTTP health readiness；报告SHA256 `fe6a54e63c72cbc2da2eb210ca295170367ac89f006fada54f461e5340dc80f5`

剩余缺口：

- 生产网页控制器及typed草稿代数已接线，隔离双人local/raw私聊37项已真实通过；真实双浏览器五频道、中文IME、字体/颜色/滚动及同版原端操作尚未复核
- 原生CM_SAY没有投递ACK；队伍/行会/禁言/喊话权限和长名字临界需要真实原服/原端验收
- 发送历史100条是明确Web增强，原Up/Down/Page滚动和聊天板热区仍待完整复刻
- 已完成local/raw私聊及180GBK原生截断/中文临界拒绝、chatId隔离与移动恢复真实协议；长名字完整私聊prefix临界、五频道各权限/禁言/ignore与同版原端/browser仍缺，不能把37项扩称五频道全通过。

本轮接线：生产 ChatInputController 支持原前缀/@优先、Enter/Space/!/@/私聊快捷入口、原消息姓名token选择、IME保护、发送失败保留草稿和匹配最新chatId的拒绝恢复。19控制器、7实际play AST/fakeDOM、5纯编码及5生产Run loopback组通过；报告 `.runtime/reports/chat-ui-regression-2026-10-01.json`、`chat-session-regression.log`。这些不证明原服投递/权限或真实浏览器IME，历史100条为明确Web增强。

<a id="game-061"></a>

### GAME-061 组队邀请、队长成员及权限

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs)：1019–1022组队； **工作树审计** [services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)：659–667成员与结果。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)。

必须通过：

- 成功：允许组队、创建、邀请、加入、踢出/解散双方成员同步，队长权限正确。
- 失败：关闭邀请/同名/离图/已队伍/非队长/满员拒绝。
- 边界：队长断线、成员死亡、经验共享、跨图、重连恢复及交易并行。

当前验证：缺少当前可复核证据。

剩余缺口：

- 文档记旧双浏览器成功，但当前reports不存在对应组队记录，不能引用当前verified。

<a id="game-062"></a>

### GAME-062 玩家交易、锁定确认与守恒

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs)：1025–1030交易； **工作树审计** [services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)：675–687本地/远端实例、金额、结果。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：相邻双人放入/撤回物品与金币，双方确认后交换完成并保存。
- 失败：非法实例/负金额/余额不足/未开/对方离开/取消/空间不足不丢失。
- 边界：确认后对方改价需重确认；同时操作、重复确认、超时、切图/掉线/服务重启守恒。

当前验证：2026-10-02 本地前端回归执行了生产交易窗渲染，覆盖在途物品/金币修改时禁止确认、重复确认锁定、超时保持未决并允许取消；回归还检查了网关对服务端在途报价确认和确认后继续改价的保护分支。该环境没有 .NET SDK，未能编译网关；此处也不等价于原服双账号端到端交易与持久化证明。

剩余缺口：

- UI现已显示报价同步中和本方确认锁定状态；响应超时会提示状态未决，保持物品/金币报价锁定并允许取消，避免不确定时重复操作。原服双账号“双方确认后交换并保存”、对方变更后的重确认、空间/余额失败返还、切图/断线/重启守恒仍需真实服务端交易测试；当前无端到端trade报告。

<a id="game-063"></a>

### GAME-063 行会创建、成员、封号、公告与联盟

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs)：1035–1045行会； **工作树审计** [services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)：750/753/756成员封号及战争联盟。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)。

必须通过：

- 成功：创建/退出/加人/踢人/封号/公告/联盟双方状态，掌门权限、金币与材料原服校验。
- 失败：无行会/无权限/重名/非法成员/公告长度/目标失效给出明确结果。
- 边界：行会人员变动重登持久；封号重复成员、中文长度、联盟撤销、断线重连。

当前验证：缺少当前可复核证据。

剩余缺口：

- 当前源码可用菜单，但没有完整双浏览器权限与保存专项报告。

<a id="game-064"></a>

### GAME-064 行会战申请、关系及倒计时

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs)：国王@@guildwar原服流程； **工作树审计** [services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)：warGuildTimers倒计时。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[tools/guild_war_probe.mjs](../tools/guild_war_probe.mjs)。

必须通过：

- 成功：国王二级菜单提交目标行会，两端战争关系与递减倒计时、PK许可一致。
- 失败：非掌门/无金币/不存在行会/重复战争/错误NPC拒绝。
- 边界：宣战结束、联盟关系、离线复登、临界到期、后台标签页计时按原服快照重建。

当前验证：缺少当前可复核证据。

剩余缺口：

- 当前无guild-war.json；工具存在仅表示可运行，旧实施文档通过声明不作为本次证据。

<a id="game-065"></a>

### GAME-065 完整沙巴克攻城与占领持久化

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/version-profile.json](../content/classic-176/version-profile.json)：worldRules.sabuk地图/城门/申请材料； **固定原服源码** [vendor/openmir2/src/M2Server/Castle/UserCastle.cs](../vendor/openmir2/src/M2Server/Castle/UserCastle.cs)：城战时钟/归属/宫殿/城门规则。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[vendor/openmir2/src/M2Server/Castle/UserCastle.cs](../vendor/openmir2/src/M2Server/Castle/UserCastle.cs)、[tools/castle_war_probe.mjs](../tools/castle_war_probe.mjs)。

必须通过：

- 成功：申请/材料消费/日期保存、开战提示、联盟/敌对、城门/守卫、皇宫判定、占领广播与结束保存。
- 失败：错误材料/权限/日期/重复申请/无效行会不能推进世界状态。
- 边界：两行会多人争夺、计时边界、换图/死亡/掉线、引擎重启恢复日期归属，完整战役可重放。

当前验证：缺少当前可复核证据。

剩余缺口：

- 现有按钮和广播只覆盖入口，当前无完整战役报告；尚不能验收沙巴克系统。

<a id="game-070"></a>

### GAME-070 完整NPC任务清单与脚本语义

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/version-profile.json](../content/classic-176/version-profile.json)：MapQuest及全部NPC任务； **工作树审计** [services/web-gateway/NpcProjection.cs](../services/web-gateway/NpcProjection.cs)：显式任务标记解析。

现有实现：[services/web-gateway/NpcProjection.cs](../services/web-gateway/NpcProjection.cs)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[tools/quest_catalog_audit.py](../tools/quest_catalog_audit.py)、[scripts/prepare-runtime.py](../scripts/prepare-runtime.py)。

必须通过：

- 成功：全任务目录逐条接取/检查/奖励/拒绝/回退菜单，与物品金币经验旗标原服一致。
- 失败：材料不足/重复领奖/错职业等级/未接任务/非法选项不发奖励。
- 边界：源脚本没有显式quest标记仍正确交互；多阶段、多任务、分支、断线及重登存档一致。

当前验证：缺少当前可复核证据。

剩余缺口：

- 浏览器QuestState仅由附加标记和localStorage恢复，源NPC脚本多数无现代任务标记；P0旗标任务不能代表全任务。

<a id="game-071"></a>

### GAME-071 任务缓存、重复奖励与角色隔离

状态：**部分实现**（`partial`）。

依据及等级：**工作树审计** [apps/web/src/play.ts](../apps/web/src/play.ts)：mir2.quest.{selectedCharacter}及loadQuest； **项目契约** [AGENT.md](../AGENT.md)：任务结果服务端确认。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/NpcProjection.cs](../services/web-gateway/NpcProjection.cs)。

必须通过：

- 成功：同角色任务由服务器对话/旗标确认；缓存只作可重建显示。
- 失败：localStorage篡改/旧任务条目不作为已完成奖励依据；重复选项原服最多领奖一次。
- 边界：同名不同账号角色隔离、清理缓存、任务重置、窗口关闭/切图不能留下假pending。

当前验证：缺少当前可复核证据。

剩余缺口：

- 缓存键只有角色名，需核对全服姓名唯一与跨服边界；没有真实重复领奖/缓存过期回归。

<a id="game-080"></a>

### GAME-080 死亡状态、画面与回城复活

状态：**部分实现**（`partial`）。

依据及等级：**固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Operate.cs)：原服死亡/入服home回城恢复； **工作树审计** [docs/web-protocol.md](../docs/web-protocol.md)：当前回城按钮断线重新入服。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：0HP死亡序列、灰屏/尸体、停止输入，回城重新选原角色由原服home落点和HP复活。
- 失败：死时移动/攻击/拾取/交易禁止，失败重登不能消除原服惩罚。
- 边界：27原地复活、自杀/PK/掉装、回城重复点击、凭据丢失、断线死亡与切图待决清理。

当前验证：缺少当前可复核证据。

剩余缺口：

- 本轮无死亡回城真实报告；原版灰屏、复活按钮热区/时序缺视觉证据。

<a id="game-081"></a>

### GAME-081 跨图、传送、对象世代与快照

状态：`partial`。

现有实现：`apps/web/src/play.ts`、`apps/web/src/map-view.ts`、`services/web-gateway/GatewaySession.cs`、`tests/map_loading_regression.mjs`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/map-assets.ts`、`content/classic-176/map-asset-bindings.json`、`tools/map_asset_bindings.py`、`tests/test_map_asset_bindings.py`、`tests/map_assets_regression.mjs`、`tests/map_sources_regression.mjs`、`tests/map_sentinel_regression.mjs`、`docs/map-source-binding-review-2026-10-01.md`、`docs/map-sentinel-review-2026-10-01.md`、`docs/map-asset-selection-2026-10-01.md`。

依据及等级：`server_source` vendor/openmir2/src/OpenMir2/Messages.cs — 633/634/801/807跨图<br>`contract` content/classic-176/version-profile.json — 全目标地图目录<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。<br>`contract` content/classic-176/map-asset-bindings.json — 第七批当前扩展场景精确map/layer/index选择；原national覆盖与历史配对独立保留。<br>`source_review` .runtime/reports/map-sentinel-seventh-source.json — 固定GA0全部54高索引格子原始12byte、坐标/碰撞与参考源码越界nil路径；不推导所有地图或原端执行。。

必须通过：

- 成功：步行出口/卷轴/技能/NPC/攻城跨图，地图代次、坐标、相机和新对象正确。
- 失败：资源缺失/非法目的地/待决操作遇到切图有明确处理，不显示旧图假位置。
- 边界：快速连传、旧图素材和消息迟到、门/掉落/事件/尸体/对话/追击全部清理，保留背包技能属性快照。

当前验证：`unit_regression` .runtime/reports/frontend-events-final.log — map change cancels persistent effects and retries<br>`unit_regression` .runtime/reports/python-events-final.log — profile/source/map dependencies等失败<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/map-v7-sentinel-web-tests.json — 最终实际352组/30脚本模块/VM/Pixi回归；含源选择、54特殊引用nil路径和切图/失败恢复，非浏览器。<br>`unit_regression` .runtime/reports/map-v7-final-python-checks.json — 修复默认源路径后完整Python339/339通过；current render与original fidelity分别断言，独立内容CLI继续exit1。<br>`unit_regression` .runtime/reports/map-sentinel-seventh-review.json — 5个实际生产模块/Pixi类回归覆盖54位置、高索引不请求纹理、碰撞保留及非目标否定案例。。

剩余缺口：

- 全地图当前Python闭合未过；570/572图口径及D718/D719等源映射需追踪，不能引用历史570全通。

<a id="game-082"></a>

### GAME-082 断线重连、恢复与副作用不重放

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [AGENT.md](../AGENT.md)：断线释放pending； **工作树审计** [apps/web/src/play.ts](../apps/web/src/play.ts)：scheduleReconnect自动重新登录选择角色； **工作树审计** [services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)：读写异常释放原连接。

现有实现：[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[tools/reconnect_probe.mjs](../tools/reconnect_probe.mjs)。

必须通过：

- 成功：断网/刷新/会话替换后重登获取坐标、HPMP、属性、装备、背包、仓库、技能、社会状态。
- 失败：登录失败/角色失效/网关停服/认证过期提示明确，不自动重放买卖交易领奖。
- 边界：20次断开、浏览器后台/休眠恢复、两客户端同时运行30分钟、残留pending全部释放。

当前验证：**真实协议** [.runtime/reports/native-bridge-reconnect.json](../.runtime/reports/native-bridge-reconnect.json)：旧编码TCP桥一次重登恢复；非Web

剩余缺口：

- 当前Web只一次既有角色协议登录；旧编码桥重登1次属于其他通道，不构成Web重连验收。

<a id="game-083"></a>

### GAME-083 正常退出、保存停止与异常窗口

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [AGENT.md](../AGENT.md)：正常停服保存及异常退出验证； **固定原服源码** [vendor/openmir2/src/Storeages/DBSvr.Storage.MySQL/PlayDataStorage.Save.cs](../vendor/openmir2/src/Storeages/DBSvr.Storage.MySQL/PlayDataStorage.Save.cs)：持久化字段和物品技能。

现有实现：[scripts/run-server-native.py](../scripts/run-server-native.py)、[vendor/openmir2/src/Storeages/DBSvr.Storage.MySQL/PlayDataStorage.Save.cs](../vendor/openmir2/src/Storeages/DBSvr.Storage.MySQL/PlayDataStorage.Save.cs)、[tools/power_loss_probe.mjs](../tools/power_loss_probe.mjs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)。

必须通过：

- 成功：正常退出/原生停止保存位置、等级、经验、金币、背包装备仓库技能与任务社会状态后恢复一致。
- 失败：存储写入失败明确显示，不能把未写入当成功。
- 边界：异常杀进程/网络断开/写队列中断，公布最大回退窗口；交易/奖励恰逢保存故障不重复。

当前验证：**工作树审计** [.runtime/reports/events-cleanup-stop.log](../.runtime/reports/events-cleanup-stop.log)：正常停止日志；不是全部存档字段证明

剩余缺口：

- 当前cleanup-stop确实正常停止，但完整进度字段/异常退出没有本轮报告。

<a id="game-084"></a>

### GAME-084 备份恢复、独立夹具与持久守恒

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [AGENT.md](../AGENT.md)：改账号/世界前备份；夹具清理； **工作树审计** [tools/cleanup_world_events_probe.py](../tools/cleanup_world_events_probe.py)：私密清单限定账号/角色/索引清理。

现有实现：[scripts/backup.py](../scripts/backup.py)、[tools/cleanup_world_events_probe.py](../tools/cleanup_world_events_probe.py)、[docs/local-playtest.md](../docs/local-playtest.md)。

必须通过：

- 成功：协调DB及文件备份恢复到独立干净运行目录，再真实登录核验完整进度字段。
- 失败：残缺/版本不符/校验不符备份拒绝恢复且不损坏当前存档。
- 边界：隔离探针只清理其创建账号角色行会掉落城堡状态，用户主角不变；正常保存后才能删fixture。

当前验证：**真实协议** [.runtime/reports/world-events-cleanup.json](../.runtime/reports/world-events-cleanup.json)：6独立fixture清理，账号/角色/索引残留0

剩余缺口：

- 当前备份与6fixture清理可复核，但没有干净环境的恢复登录报告。

<a id="game-101"></a>

### GAME-101 技能 1：火球术（hostile）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=1 火球术 use=hostile；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：目标/空地火球弹道、16方向、命中爆炸与原服伤害。
- 失败：目标死亡/移出8格/MP不足拒绝，未学习不能施法。
- 边界：目标移动时命中绑定规则与飞行速度逐帧对照；不把施法确认当作命中。

当前验证：缺少当前可复核证据。

剩余缺口：

- 已有10帧施法及部分投射特效，缺原端弹道/伤害时间线
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-102"></a>

### GAME-102 技能 2：治愈术（support）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=2 治愈术 use=support；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：对自己及可治疗友方施放，原服按时恢复HP。
- 失败：满血、死亡、不可治疗目标或MP不足时按原服反馈。
- 边界：延迟回复各tick、连续治疗叠加/刷新规则、治疗中受伤与过期。

当前验证：缺少当前可复核证据。

剩余缺口：

- 当前通用support可选友方；没有本轮治疗恢复曲线
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-103"></a>

### GAME-103 技能 3：基本剑术（passive）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=3 基本剑术 use=passive；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：被动命中/训练随原服近战，技能不产生主动施法。
- 失败：点击被动不发castMagic，条件不足/训练未触发不加本地熟练。
- 边界：0–3级命中收益、经验训练及重登持久化。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：通用passive/toggle/charge输入/状态控件；并非本技能完整原端回放

剩余缺口：

- UI被动及无魔法动画已有，缺数值训练对照
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-104"></a>

### GAME-104 技能 4：精神力战法（passive）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=4 精神力战法 use=passive；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：道士被动准确属性/训练随原服计算。
- 失败：不得产生主动castMagic，职业/等级不符不能学习。
- 边界：0–3级准确加成、升级上限、书籍消费及重登。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：通用passive/toggle/charge输入/状态控件；并非本技能完整原端回放

剩余缺口：

- 仅输入标passive；未纳入P0数值/技能训练清单
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-105"></a>

### GAME-105 技能 5：大火球（hostile）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=5 大火球 use=hostile；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：正确大火球施法、弹道/爆炸及高于普通火球的原服结果。
- 失败：未知/过远/MP不足及target失效拒绝。
- 边界：16方向帧、飞行路径移动目标、施法/命中不同时间点。

当前验证：缺少当前可复核证据。

剩余缺口：

- 代表施法和投射已有；当前真实damage/effect无专项
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-106"></a>

### GAME-106 技能 6：施毒术（hostile）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)（magicId=6 施毒术 use=hostile；这是输入契约，非全部数值与像素证明）； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)（原服技能实现/材料/范围/伤害）； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)（ClientSpellXY技能入口与许可）； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)（P0数值/职业/学习等级/训练参数）； **参考源码** [Actor.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas>)（红绿毒状态分离）； **项目契约** [content/classic-176/actor-status.json](../content/classic-176/actor-status.json)（绿毒0x80000000、红毒0x40000000、红覆盖绿及更高优先状态；body/hair平均亮度变色、武器不染与量化缺口）。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)、[content/classic-176/actor-status.json](../content/classic-176/actor-status.json)、[tests/actor_status_regression.mjs](../tests/actor_status_regression.mjs)。

必须通过：

- 成功：灰毒/黄毒材料分别施加绿毒/红毒，原服持续扣血/降防。
- 失败：无毒粉/材料槽错误/毒粉持久耗尽/无效目标不能施毒。
- 边界：两毒并存优先色、重复刷新、抗毒、死亡解毒、重登及tick停止。

当前验证：**纯回归** [.runtime/reports/actor-status-regression.log](../.runtime/reports/actor-status-regression.log)（15组状态生产类回归中的毒色分离/平均亮度/alpha/重叠优先级/部位及排队状态更新通过；不证明毒粉消耗/真实扣血）

剩余缺口：

- body/hair 红绿毒分离、红覆盖绿及参考状态优先级已实现；原调色板最近色量化与原端实机对照仍缺。
- 灰毒/黄毒材料槽、毒粉持久消耗/耗尽/失败守恒、抗毒、持续扣血/降防、死亡解除与重登真实玩法尚待专门协议及浏览器验收。

<a id="game-107"></a>

### GAME-107 技能 7：攻杀剑术（passive）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=7 攻杀剑术 use=passive；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\ClMain.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas)：AttackTarget 2128–2164：经典输入烈火>攻杀>半月>满足两格目标的刺杀>武器重击/普通；4086–4109 原客户端忽略自身全部七种攻击SM。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\Actor.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas)：3297–3324：四专属剑光都用ActHit六帧85ms，按实际SM区分power/thrusting/halfMoon/fire；重击、大击不借用专属剑光。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\M2Server\ObjBase.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/M2Server/ObjBase.pas)：AttackDir 18785–18857：先Dir=nDir再GetPoseCreate；消费前保存攻杀/烈火flags决定最终RM，随机与伤害顺序不变。； **固定原服源码** [vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs](../vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs)：固定经典ID：攻杀7、刺杀12、半月25、烈火26，不推断高版本ID。； **固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)：真实SM14 normal、15 heavy、16 big、18 power、19 thrusting、24 halfMoon、8 fire；输入CM3014/3015/3016/3018/3019/3024/3025。； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)：RM→SM旁观者投递；RM_HEAVYHIT空body走header-only，非空DIG body保留。； **项目契约** [content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)：经典四实际SM对应Magic原索引：攻杀800、刺杀1410、半月1700、烈火3480 +dir*10+bodyFrame0–5；ActHit六帧85ms；普通/重击/大击无专属剑光。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)、[services/web-gateway/MeleeSkills.cs](../services/web-gateway/MeleeSkills.cs)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)、[tests/NativeMeleeRegression/Program.cs](../tests/NativeMeleeRegression/Program.cs)、[tests/MeleeGatewayRegression/Program.cs](../tests/MeleeGatewayRegression/Program.cs)、[tools/melee_probe.mjs](../tools/melee_probe.mjs)、[tools/prepare_melee_probe.py](../tools/prepare_melee_probe.py)、[tools/cleanup_melee_probe.py](../tools/cleanup_melee_probe.py)、[tools/melee_probe_fixtures.py](../tools/melee_probe_fixtures.py)、[tests/test_melee_probe_fixtures.py](../tests/test_melee_probe_fixtures.py)、[docs/melee-probe.md](../docs/melee-probe.md)、[apps/web/src/melee-visual.ts](../apps/web/src/melee-visual.ts)、[content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)、[scripts/import-national-melee-assets.py](../scripts/import-national-melee-assets.py)、[tests/melee_visual_regression.mjs](../tests/melee_visual_regression.mjs)、[tests/test_national_melee_import.py](../tests/test_national_melee_import.py)。

必须通过：

- 成功：固定skill7被动+PWR后CM3018由原服消费一次，消费前保存RM_SPELL2→真实SM18 power；同一self/remote剑光由SM而不是开关/GOOD决定。
- 失败：无蓄力的CM3018降为SM14；无有效攻击输入、死亡、错位置或非法方向无伤害/消费/成功SM。
- 边界：与烈火/半月/刺杀同时准备时依原输入优先级；真实类固定DC100/HitPlus20目标失HP120、攻击阶段MP不另扣；下一次无charge攻击正常；0–3级训练及在线蓄力触发仍需覆盖。

当前验证：**真实协议** [.runtime/reports/gameplay-live-check.json](../.runtime/reports/gameplay-live-check.json)：原服+PWR状态出现；不证明攻杀伤害； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：通用passive/toggle/charge输入/状态控件；并非本技能完整原端回放； **纯回归** [.runtime/reports/melee-native-regression.log](../.runtime/reports/melee-native-regression.log)：2026-10-01 17:31 CST，真实PlayObject.Operate/ClientHitXY/AttackDir、真实地图八向与旁观者、生产包编解码6组PASS：方向选目标、七SM一致、重击空/非空body、攻杀/烈火消费前捕获、MP0半月降级/原耗MP、非法/死亡/禁攻/错坐标拒绝。不是在线角色或原客户端实验。； **纯回归** [.runtime/reports/melee-gateway-regression.log](../.runtime/reports/melee-gateway-regression.log)：生产GatewaySession+LegacyConnection loopback TCP+捕获WebSocket7组PASS：七SM投影、fire>power>wide>long选择、LNG/WID/FIR状态不提前释放施法ACK槽、self SM不完成请求、服务器降级、新PWR不丢、拒绝及死亡/地图中断后原ACK排空。不是真实18801/原服联机。； **纯回归** [.runtime/reports/melee-native-build.log](../.runtime/reports/melee-native-build.log)：net8原服及真实类专项成功编译；本次增量0警告/0错误；原服全量4个既有警告在其它文件。； **纯回归** [.runtime/reports/melee-mining-compat.log](../.runtime/reports/melee-mining-compat.log)：同批攻击源码构建的原服实际矿逻辑9组PASS；未改变MakeMine概率/品质。； **纯回归** [.runtime/reports/melee-movement-compat.log](../.runtime/reports/melee-movement-compat.log)：同批原服实际移动碰撞、纠正、旁观隔离及恢复专项PASS。； **纯回归** [.runtime/reports/melee-mining-gateway-compat.log](../.runtime/reports/melee-mining-gateway-compat.log)：同批网关生产挖矿TCP9组PASS：TURN/HEAVY串行、真实SM200投影、死亡/换图排空及超时隔离。； **真实协议** [.runtime/reports/melee-live-run.json](../.runtime/reports/melee-live-run.json)：53/53完整真实probe中的攻杀7：原导师3级学习/木剑equip后限量实际挥剑得到+PWR，下一真实self+observer为SM18/power并各请求GOOD；原learned skill重登保持。固定增强伤害由生产类专项证明，本live仅空挥，不证明实际目标血量。；记录时间 2026-10-01T09:52:31.166Z；环境 Windows isolated owned warriors; real ws://127.0.0.1:18801/ws -> native runtime; local .NET8 Gateway compatibility build；报告SHA256 `7196c7ce2483032998d2d1cde41c7bef7f5a20030e274ccbc2de918474e5ee46`；实际M2 SHA256 `09a2902cc751b2a61ae0577b93a8a0c2a9948e2ada64b8055391ab037500d436`；实际Gateway SHA256 `c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97`；对应源码全部SHA见报告 sourceSha256； **源码审查** [.runtime/reports/melee-deployment.json](../.runtime/reports/melee-deployment.json)：根代理正常停服/备份后只部署M2Server与Gateway；实际新M2 09a290…d436、Gateway c4e22…7b97；既有GameSrv/OpenMir2/SystemModule/ScriptSystem原4依赖保持，不能拿默认新编译依赖代替此实际部署版本。；记录时间 2026-10-01T09:49:41.3999398Z；环境 M2 only; actual existing GameSrv/OpenMir2/SystemModule/ScriptSystem preserved; gateway local net8 compatibility build；报告SHA256 `109f3ff35ccc84dc04cd893a2e0f65243056914b9a668b7b943763116c55af84`； **纯回归** [.runtime/reports/melee-native-runtime-binary-compat.log](../.runtime/reports/melee-native-runtime-binary-compat.log)：独立staging使用新M2+实际原4依赖运行生产NativeMeleeRegression六组PASS；包括八向实际目标、SM self/remote、消费、重击body/费用及拒绝。未触及DB/真实角色；同版本矿9/移动1实际依赖证据另存melee-actual-runtime-compat.json。； **纯回归** [.runtime/reports/melee-fixture-regression.log](../.runtime/reports/melee-fixture-regression.log)：12项无DB夹具回归：实际原地图/导师脚本、协议拥有的双角色namespace、时间/backup/默认plan、仅攻击者Mp0、停服/其它角色拒绝及精确清理模拟。实际清理须另看live清理报告。； **纯回归** [.runtime/reports/melee-visual-regression.json](../.runtime/reports/melee-visual-regression.json)：生产MeleeVisual/OnlineActor 19组fakePixi、7项素材导入Python、旧Actor18/World4及TSC通过：同ID self prediction→actual专属kind在原frame/frameAt处接管，不floor/重播人体；零基frame2武器/技能音各一次，迟到不回放。不是浏览器/GPU/native.exe时序验证。；记录时间 2026-10-01T09:31:01.598597+00:00；环境 Windows local Node24/Python; actual production TypeScript transpile + fake Pixi/clock and isolated synthetic WIL fixtures; actual native WIL byte check; no browser/GPU/original executable；报告SHA256 `39ccd08b2d1f562c5bebf0312fbcb211e06c5af113a4682bd4516e4c47c8ce4c`；对应源码全部SHA见报告 sourceSha256； **原生素材像素** [.runtime/reports/melee-native-assets.json](../.runtime/reports/melee-native-assets.json)：本机原Magic WIL/WIX直接重解码192/192帧与既有PNG matched、repaired0，几何/alpha/source pair核对；只证明素材字节与偏移，不证明浏览器screen调色/原端实际播放。；记录时间 2026-10-01T09:31:34.032853+00:00；环境 local Python WeMadeLibrary direct original WIL/WIX decode; no network/browser/original executable；报告SHA256 `c59c3872aa6ff257e5c02e9629be5d79f6775c975e54c2f9d790b8584e1df1c3`； **真实协议** [.runtime/reports/melee-cleanup.json](../.runtime/reports/melee-cleanup.json)：正常停服并有效备份后清理本次协议拥有的两名战士隔离夹具：removedFixtures=2、remainingAccountsCharactersIndexes=0、verified=true；仅证明测试夹具收尾，不把它计为技能数值、权限、画面或原客户端完成。；记录时间 2026-10-01T10:04:10.210525+00:00；环境 Windows isolated owned warrior fixtures; normal native stop + verified backup; exact namespace cleanup and real residual database verification；报告SHA256 `681d53e58b45fe7bc085e86fe85eb94ec54d7c80f62c49caa1dc44c7ca908fc6`； **源码审查** [.runtime/reports/melee-cleanup-gateway-ready.json](../.runtime/reports/melee-cleanup-gateway-ready.json)：清理完成后测试网关实际重新ready，health.status=ready、protocol=1，运行Gateway SHA仍为c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97；仅为环境恢复证据，不是浏览器/原客户端交互验收。；记录时间 2026-10-01T10:06:10.2851933Z；环境 local Windows test18801 gateway restarted after owned fixture cleanup; actual HTTP health readiness；报告SHA256 `fe6a54e63c72cbc2da2eb210ca295170367ac89f006fada54f461e5340dc80f5`

剩余缺口：

- 已完成原3级学习、真实+PWR计数和SM18 self/observer/GOOD；在线目标血量增强、0–2级训练及被动命中/空挥边界比较仍缺。
- 浏览器专属六帧剑光和同版本原客户端对照未实证。 原light2、screen原palette量化、remote msgMuch与native CM/selfSM真实时线及八向四种原exe对照仍缺。

<a id="game-108"></a>

### GAME-108 技能 8：抗拒火环（self）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=8 抗拒火环 use=self；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：自身火环推开合法较低等级目标并更新SM_BACKSTEP位置。
- 失败：更高等级/不可推目标、墙、MP不足拒绝或受阻。
- 边界：多目标围身、距离/推步数量、安全区、双角色/怪物帧表现。

当前验证：缺少当前可复核证据。

剩余缺口：

- 自身施法代表序列已有，通用被推位移已验；抗拒技能本身无专项
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-109"></a>

### GAME-109 技能 9：地狱火（directional）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=9 地狱火 use=directional；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：沿选择方向形成原服直线火焰，各覆盖格伤害与帧正确。
- 失败：MP不足/墙与无效方向按原服限制。
- 边界：八方向、直线上多目标/穿墙规则、火焰逐节与命中顺序。

当前验证：缺少当前可复核证据。

剩余缺口：

- 目前只920起10帧代表施法，没有直线分段和命中覆盖
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-110"></a>

### GAME-110 技能 10：疾光电影（directional）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=10 疾光电影 use=directional；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：直线光电覆盖与服务端多目标伤害，正确方向和长度。
- 失败：MP不足/目标不可攻击拒绝或不伤害。
- 边界：八方向透射、同列多个目标、障碍穿透/等级技能范围。

当前验证：缺少当前可复核证据。

剩余缺口：

- 仅940起施法和部分火符投射路径，不足完整光电
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-111"></a>

### GAME-111 技能 11：雷电术（hostile）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=11 雷电术 use=hostile；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：目标或空地施法，雷电命中指定格/实体并同步原服HP。
- 失败：超8格/不完整坐标/NPC/尸体及MP不足拒绝。
- 边界：被锁目标移动/消失、雷电落点和施法到受击延迟。

当前验证：**真实协议** [.runtime/reports/gameplay-live-check.json](../.runtime/reports/gameplay-live-check.json)：空格雷电target0与无效参数拒绝；不证明命中伤害

剩余缺口：

- 真实空地target0及参数拒绝已有；真实伤害和原端雷电帧未验
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-112"></a>

### GAME-112 技能 12：刺杀剑术（toggle）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=12 刺杀剑术 use=toggle；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\ClMain.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas)：AttackTarget 2128–2164：经典输入烈火>攻杀>半月>满足两格目标的刺杀>武器重击/普通；4086–4109 原客户端忽略自身全部七种攻击SM。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\Actor.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas)：3297–3324：四专属剑光都用ActHit六帧85ms，按实际SM区分power/thrusting/halfMoon/fire；重击、大击不借用专属剑光。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\M2Server\ObjBase.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/M2Server/ObjBase.pas)：AttackDir 18785–18857：先Dir=nDir再GetPoseCreate；消费前保存攻杀/烈火flags决定最终RM，随机与伤害顺序不变。； **固定原服源码** [vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs](../vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs)：固定经典ID：攻杀7、刺杀12、半月25、烈火26，不推断高版本ID。； **固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)：真实SM14 normal、15 heavy、16 big、18 power、19 thrusting、24 halfMoon、8 fire；输入CM3014/3015/3016/3018/3019/3024/3025。； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)：RM→SM旁观者投递；RM_HEAVYHIT空body走header-only，非空DIG body保留。； **项目契约** [content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)：经典四实际SM对应Magic原索引：攻杀800、刺杀1410、半月1700、烈火3480 +dir*10+bodyFrame0–5；ActHit六帧85ms；普通/重击/大击无专属剑光。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)、[services/web-gateway/MeleeSkills.cs](../services/web-gateway/MeleeSkills.cs)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)、[tests/NativeMeleeRegression/Program.cs](../tests/NativeMeleeRegression/Program.cs)、[tests/MeleeGatewayRegression/Program.cs](../tests/MeleeGatewayRegression/Program.cs)、[tools/melee_probe.mjs](../tools/melee_probe.mjs)、[tools/prepare_melee_probe.py](../tools/prepare_melee_probe.py)、[tools/cleanup_melee_probe.py](../tools/cleanup_melee_probe.py)、[tools/melee_probe_fixtures.py](../tools/melee_probe_fixtures.py)、[tests/test_melee_probe_fixtures.py](../tests/test_melee_probe_fixtures.py)、[docs/melee-probe.md](../docs/melee-probe.md)、[apps/web/src/melee-visual.ts](../apps/web/src/melee-visual.ts)、[content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)、[scripts/import-national-melee-assets.py](../scripts/import-national-melee-assets.py)、[tests/melee_visual_regression.mjs](../tests/melee_visual_regression.mjs)、[tests/test_national_melee_import.py](../tests/test_national_melee_import.py)。

必须通过：

- 成功：固定skill12的+LNG切换状态后等待原施法GOOD，再按两格目标选择CM3019；原服真实SM19投影thrusting，自身与旁观者一致。
- 失败：未学、关态、无两格目标不能仅凭按钮绘制刺杀；原服拒绝不得产生成功SM，迟到切换ACK不得误确认下一击。
- 边界：新方向两格穿透、障碍与单/多目标及刺杀与半月/烈火优先级由原服范围/伤害实现确认；八向方向选择不继续攻击旧朝向目标。

当前验证：**纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：通用passive/toggle/charge输入/状态控件；并非本技能完整原端回放； **纯回归** [.runtime/reports/gateway-events-final.log](../.runtime/reports/gateway-events-final.log)：战士优先级和状态opcode纯回归；未真实验证远刺伤害； **纯回归** [.runtime/reports/melee-native-regression.log](../.runtime/reports/melee-native-regression.log)：2026-10-01 17:31 CST，真实PlayObject.Operate/ClientHitXY/AttackDir、真实地图八向与旁观者、生产包编解码6组PASS：方向选目标、七SM一致、重击空/非空body、攻杀/烈火消费前捕获、MP0半月降级/原耗MP、非法/死亡/禁攻/错坐标拒绝。不是在线角色或原客户端实验。； **纯回归** [.runtime/reports/melee-gateway-regression.log](../.runtime/reports/melee-gateway-regression.log)：生产GatewaySession+LegacyConnection loopback TCP+捕获WebSocket7组PASS：七SM投影、fire>power>wide>long选择、LNG/WID/FIR状态不提前释放施法ACK槽、self SM不完成请求、服务器降级、新PWR不丢、拒绝及死亡/地图中断后原ACK排空。不是真实18801/原服联机。； **纯回归** [.runtime/reports/melee-native-build.log](../.runtime/reports/melee-native-build.log)：net8原服及真实类专项成功编译；本次增量0警告/0错误；原服全量4个既有警告在其它文件。； **纯回归** [.runtime/reports/melee-mining-compat.log](../.runtime/reports/melee-mining-compat.log)：同批攻击源码构建的原服实际矿逻辑9组PASS；未改变MakeMine概率/品质。； **纯回归** [.runtime/reports/melee-movement-compat.log](../.runtime/reports/melee-movement-compat.log)：同批原服实际移动碰撞、纠正、旁观隔离及恢复专项PASS。； **纯回归** [.runtime/reports/melee-mining-gateway-compat.log](../.runtime/reports/melee-mining-gateway-compat.log)：同批网关生产挖矿TCP9组PASS：TURN/HEAVY串行、真实SM200投影、死亡/换图排空及超时隔离。； **真实协议** [.runtime/reports/melee-live-run.json](../.runtime/reports/melee-live-run.json)：53/53完整真实probe中的刺杀12：原+LNG切换与GOOD、移动到实际原NPC两格处、输入产生SM19/thrusting，self+observer一致；关闭+ULNG；原SM211确认F1 ASCII49且正常重登保存。NPC只作为原客户端两格输入判据，不宣称穿透或NPC伤害。；记录时间 2026-10-01T09:52:31.166Z；环境 Windows isolated owned warriors; real ws://127.0.0.1:18801/ws -> native runtime; local .NET8 Gateway compatibility build；报告SHA256 `7196c7ce2483032998d2d1cde41c7bef7f5a20030e274ccbc2de918474e5ee46`；实际M2 SHA256 `09a2902cc751b2a61ae0577b93a8a0c2a9948e2ada64b8055391ab037500d436`；实际Gateway SHA256 `c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97`；对应源码全部SHA见报告 sourceSha256； **源码审查** [.runtime/reports/melee-deployment.json](../.runtime/reports/melee-deployment.json)：根代理正常停服/备份后只部署M2Server与Gateway；实际新M2 09a290…d436、Gateway c4e22…7b97；既有GameSrv/OpenMir2/SystemModule/ScriptSystem原4依赖保持，不能拿默认新编译依赖代替此实际部署版本。；记录时间 2026-10-01T09:49:41.3999398Z；环境 M2 only; actual existing GameSrv/OpenMir2/SystemModule/ScriptSystem preserved; gateway local net8 compatibility build；报告SHA256 `109f3ff35ccc84dc04cd893a2e0f65243056914b9a668b7b943763116c55af84`； **纯回归** [.runtime/reports/melee-native-runtime-binary-compat.log](../.runtime/reports/melee-native-runtime-binary-compat.log)：独立staging使用新M2+实际原4依赖运行生产NativeMeleeRegression六组PASS；包括八向实际目标、SM self/remote、消费、重击body/费用及拒绝。未触及DB/真实角色；同版本矿9/移动1实际依赖证据另存melee-actual-runtime-compat.json。； **纯回归** [.runtime/reports/melee-fixture-regression.log](../.runtime/reports/melee-fixture-regression.log)：12项无DB夹具回归：实际原地图/导师脚本、协议拥有的双角色namespace、时间/backup/默认plan、仅攻击者Mp0、停服/其它角色拒绝及精确清理模拟。实际清理须另看live清理报告。； **纯回归** [.runtime/reports/melee-visual-regression.json](../.runtime/reports/melee-visual-regression.json)：生产MeleeVisual/OnlineActor 19组fakePixi、7项素材导入Python、旧Actor18/World4及TSC通过：同ID self prediction→actual专属kind在原frame/frameAt处接管，不floor/重播人体；零基frame2武器/技能音各一次，迟到不回放。不是浏览器/GPU/native.exe时序验证。；记录时间 2026-10-01T09:31:01.598597+00:00；环境 Windows local Node24/Python; actual production TypeScript transpile + fake Pixi/clock and isolated synthetic WIL fixtures; actual native WIL byte check; no browser/GPU/original executable；报告SHA256 `39ccd08b2d1f562c5bebf0312fbcb211e06c5af113a4682bd4516e4c47c8ce4c`；对应源码全部SHA见报告 sourceSha256； **原生素材像素** [.runtime/reports/melee-native-assets.json](../.runtime/reports/melee-native-assets.json)：本机原Magic WIL/WIX直接重解码192/192帧与既有PNG matched、repaired0，几何/alpha/source pair核对；只证明素材字节与偏移，不证明浏览器screen调色/原端实际播放。；记录时间 2026-10-01T09:31:34.032853+00:00；环境 local Python WeMadeLibrary direct original WIL/WIX decode; no network/browser/original executable；报告SHA256 `c59c3872aa6ff257e5c02e9629be5d79f6775c975e54c2f9d790b8584e1df1c3`； **真实协议** [.runtime/reports/melee-cleanup.json](../.runtime/reports/melee-cleanup.json)：正常停服并有效备份后清理本次协议拥有的两名战士隔离夹具：removedFixtures=2、remainingAccountsCharactersIndexes=0、verified=true；仅证明测试夹具收尾，不把它计为技能数值、权限、画面或原客户端完成。；记录时间 2026-10-01T10:04:10.210525+00:00；环境 Windows isolated owned warrior fixtures; normal native stop + verified backup; exact namespace cleanup and real residual database verification；报告SHA256 `681d53e58b45fe7bc085e86fe85eb94ec54d7c80f62c49caa1dc44c7ca908fc6`； **源码审查** [.runtime/reports/melee-cleanup-gateway-ready.json](../.runtime/reports/melee-cleanup-gateway-ready.json)：清理完成后测试网关实际重新ready，health.status=ready、protocol=1，运行Gateway SHA仍为c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97；仅为环境恢复证据，不是浏览器/原客户端交互验收。；记录时间 2026-10-01T10:06:10.2851933Z；环境 local Windows test18801 gateway restarted after owned fixture cleanup; actual HTTP health readiness；报告SHA256 `fe6a54e63c72cbc2da2eb210ca295170367ac89f006fada54f461e5340dc80f5`

剩余缺口：

- 已完成3级学习、实际两格原NPC输入判据与SM19 self/observer/GOOD和F1重登；实际两格穿透/多目标/障碍、在线目标血量与0–2级训练仍缺。
- 浏览器剑光与同版本原客户端动态对照尚未完成。 原light2、screen原palette量化、remote msgMuch与native CM/selfSM真实时线及八向四种原exe对照仍缺。

<a id="game-113"></a>

### GAME-113 技能 13：灵魂火符（hostile）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=13 灵魂火符 use=hostile；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：使用装备符材料，目标火符弹道与原服伤害。
- 失败：符耗尽/错误槽/MP不足或目标失效失败。
- 边界：最后一符、移动目标、连续发符材料减少及重登一致。

当前验证：缺少当前可复核证据。

剩余缺口：

- 代表施法及一部分投射已有，材料/伤害专项缺
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-114"></a>

### GAME-114 技能 14：幽灵盾（support）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=14 幽灵盾 use=support；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：自身/友方范围获得魔防提升，正确符消耗与保护视觉。
- 失败：无符/MP不足、无效目标、不能覆盖的对象正确反馈。
- 边界：技能0–3级持续时间，刷新叠加、过期恢复MAC与换图。

当前验证：缺少当前可复核证据。

剩余缺口：

- 仅支持输入/代表940序列；真实范围buff/原端视觉缺
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-115"></a>

### GAME-115 技能 15：神圣战甲术（support）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=15 神圣战甲术 use=support；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：合法范围目标物防buff、原服持续时间及符消耗。
- 失败：无符/MP不足/无效目标失败，不伪造AC。
- 边界：与幽灵盾同时存在/刷新过期，0–3级，组队与陌生人覆盖规则。

当前验证：缺少当前可复核证据。

剩余缺口：

- 940起代表序列；P0数值未纳入、范围buff未验
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-116"></a>

### GAME-116 技能 16：困魔咒（ground）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=16 困魔咒 use=ground；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：选格生成原服困魔围栏事件并束缚符合条件怪物。
- 失败：Boss/已受攻怪/无法束缚者、缺符/MP不足原服失败。
- 边界：事件边框/多格重叠、玩家接近破除、怪受攻击解除、事件到期。

当前验证：缺少当前可复核证据。

剩余缺口：

- 1380施法代表序列已有；showEvent只绘type5，困魔持久围栏缺
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-117"></a>

### GAME-117 技能 17：召唤骷髅（self）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=17 召唤骷髅 use=self；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：符/MP消耗后生成原服骷髅对象，跟随/攻主目标/宠物名称等级正确。
- 失败：无符/MP不足/召唤空间不足失败，不生成本地宠物。
- 边界：重复召唤、宠物升级、死亡、主人换图/断线/死亡与攻击模式。

当前验证：缺少当前可复核证据。

剩余缺口：

- slave分类兼容主人后缀和多级颜色；没有当前完整召唤AI报告
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-118"></a>

### GAME-118 技能 18：隐身术（self）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=18 隐身术 use=self；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **参考源码** [Actor.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas>)：00800000隐身绘制。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：原服隐身状态控制人物像素和怪物仇恨/发现。
- 失败：无符/MP不足或移动/攻击使原服解除时正确恢复。
- 边界：自己/其他玩家可见规则、装备与名称是否半透明、重施/死亡/切图。

当前验证：缺少当前可复核证据。

剩余缺口：

- 目前全container统一alpha0.38，缺原端按人物/文字/装备的绘制语义
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-119"></a>

### GAME-119 技能 19：集体隐身术（ground）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=19 集体隐身术 use=ground；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：选区域对合法范围队友产生原服隐身，符消耗与动画。
- 失败：区域无目标/缺符/MP不足失败或空施按原服反馈。
- 边界：区域边界、多目标、玩家移动取消、自己与他人不同可见性。

当前验证：缺少当前可复核证据。

剩余缺口：

- 仅940起代表施法；范围影响和持续状态像素缺
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-120"></a>

### GAME-120 技能 20：诱惑之光（hostile）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=20 诱惑之光 use=hostile；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：符合怪物等级/类型时按原服成功、失控、宠物变色和主人。
- 失败：不可诱惑怪物/MP不足/宠物上限原服拒绝。
- 边界：成功概率统计、宠物叛变TTL、练级、多个宠物、主人掉线/换图。

当前验证：缺少当前可复核证据。

剩余缺口：

- 只1560起短序列；召唤/诱惑宠物行为和概率未验
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-121"></a>

### GAME-121 技能 21：瞬息移动（self）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=21 瞬息移动 use=self；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：原服选择合法随机落点并完成传送/ mapGeneration同步。
- 失败：禁传地图/等级条件/MP不足拒绝并提示。
- 边界：同图传送是否递增代次、连续传送、旧图加载取消、坐标保存。

当前验证：缺少当前可复核证据。

剩余缺口：

- 没有专属施法特效配置；真实瞬移未验
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-122"></a>

### GAME-122 技能 22：火墙（ground）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=22 火墙 use=ground；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **参考源码** [clEvent.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/clEvent.pas>)：Magic1630..1635火墙持续事件。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：选格五格十字持续火墙以独立ID表现，原服持续伤害和时间。
- 失败：不允许格/MP不足/技能未学习失败，旧效果不重复。
- 边界：敌友/免疫/重叠火墙伤害、跨图/进出视野、五格独立到期和灯光。

当前验证：**真实协议** [.runtime/reports/world-events-live.json](../.runtime/reports/world-events-live.json)：五格火墙独立ID/位置/自然到期；不证明伤害或渲染

剩余缺口：

- 五格事件/期限已真实协议验；damage/光照/浏览器帧对照缺
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-123"></a>

### GAME-123 技能 23：爆裂火焰（ground）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=23 爆裂火焰 use=ground；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：选格原服半径范围多目标爆炸与对应命中帧。
- 失败：MP不足/超距/无效区域拒绝或空施。
- 边界：区域边界多目标与障碍、同时重复施法的帧/伤害顺序。

当前验证：缺少当前可复核证据。

剩余缺口：

- MagicEffects没有技能23施法或对应效果分支；泛化输入不足
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-124"></a>

### GAME-124 技能 24：地狱雷光（self）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=24 地狱雷光 use=self；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：自身周围原服范围雷击、多目标与正确施法动作。
- 失败：MP不足/目标免疫或高等级保护遵循原服。
- 边界：半径边界、非死系/死系规则、连续施法动作和多人影响。

当前验证：缺少当前可复核证据。

剩余缺口：

- MagicEffects无24对应施法/resolve分支；范围真伤未验
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-125"></a>

### GAME-125 技能 25：半月弯刀（toggle）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=25 半月弯刀 use=toggle；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\ClMain.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas)：AttackTarget 2128–2164：经典输入烈火>攻杀>半月>满足两格目标的刺杀>武器重击/普通；4086–4109 原客户端忽略自身全部七种攻击SM。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\Actor.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas)：3297–3324：四专属剑光都用ActHit六帧85ms，按实际SM区分power/thrusting/halfMoon/fire；重击、大击不借用专属剑光。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\M2Server\ObjBase.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/M2Server/ObjBase.pas)：AttackDir 18785–18857：先Dir=nDir再GetPoseCreate；消费前保存攻杀/烈火flags决定最终RM，随机与伤害顺序不变。； **固定原服源码** [vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs](../vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs)：固定经典ID：攻杀7、刺杀12、半月25、烈火26，不推断高版本ID。； **固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)：真实SM14 normal、15 heavy、16 big、18 power、19 thrusting、24 halfMoon、8 fire；输入CM3014/3015/3016/3018/3019/3024/3025。； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)：RM→SM旁观者投递；RM_HEAVYHIT空body走header-only，非空DIG body保留。； **项目契约** [content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)：经典四实际SM对应Magic原索引：攻杀800、刺杀1410、半月1700、烈火3480 +dir*10+bodyFrame0–5；ActHit六帧85ms；普通/重击/大击无专属剑光。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)、[services/web-gateway/MeleeSkills.cs](../services/web-gateway/MeleeSkills.cs)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)、[tests/NativeMeleeRegression/Program.cs](../tests/NativeMeleeRegression/Program.cs)、[tests/MeleeGatewayRegression/Program.cs](../tests/MeleeGatewayRegression/Program.cs)、[tools/melee_probe.mjs](../tools/melee_probe.mjs)、[tools/prepare_melee_probe.py](../tools/prepare_melee_probe.py)、[tools/cleanup_melee_probe.py](../tools/cleanup_melee_probe.py)、[tools/melee_probe_fixtures.py](../tools/melee_probe_fixtures.py)、[tests/test_melee_probe_fixtures.py](../tests/test_melee_probe_fixtures.py)、[docs/melee-probe.md](../docs/melee-probe.md)、[apps/web/src/melee-visual.ts](../apps/web/src/melee-visual.ts)、[content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)、[scripts/import-national-melee-assets.py](../scripts/import-national-melee-assets.py)、[tests/melee_visual_regression.mjs](../tests/melee_visual_regression.mjs)、[tests/test_national_melee_import.py](../tests/test_national_melee_import.py)。

必须通过：

- 成功：固定skill25切换+WID且原GOOD确认后，CM3024由原服输出SM24 halfMoon；实际费用在原服扣除，self/remote一致。
- 失败：原服MP0降为SM14普通且无半月光效；网关原客户端门槛MP<3不选择半月；不把两者混为改写原服规则。
- 边界：真实类固定DefSpell3/MP100后97，扇形多个目标伤害/遮挡/等级仍需联机；施法状态到达后保留原ACK槽，重复攻击仅靠实际新SM推进序号。

当前验证：**真实协议** [.runtime/reports/gameplay-live-check.json](../.runtime/reports/gameplay-live-check.json)：原服开关和一次攻击确认；非扇形真伤； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：通用passive/toggle/charge输入/状态控件；并非本技能完整原端回放； **纯回归** [.runtime/reports/melee-native-regression.log](../.runtime/reports/melee-native-regression.log)：2026-10-01 17:31 CST，真实PlayObject.Operate/ClientHitXY/AttackDir、真实地图八向与旁观者、生产包编解码6组PASS：方向选目标、七SM一致、重击空/非空body、攻杀/烈火消费前捕获、MP0半月降级/原耗MP、非法/死亡/禁攻/错坐标拒绝。不是在线角色或原客户端实验。； **纯回归** [.runtime/reports/melee-gateway-regression.log](../.runtime/reports/melee-gateway-regression.log)：生产GatewaySession+LegacyConnection loopback TCP+捕获WebSocket7组PASS：七SM投影、fire>power>wide>long选择、LNG/WID/FIR状态不提前释放施法ACK槽、self SM不完成请求、服务器降级、新PWR不丢、拒绝及死亡/地图中断后原ACK排空。不是真实18801/原服联机。； **纯回归** [.runtime/reports/melee-native-build.log](../.runtime/reports/melee-native-build.log)：net8原服及真实类专项成功编译；本次增量0警告/0错误；原服全量4个既有警告在其它文件。； **纯回归** [.runtime/reports/melee-mining-compat.log](../.runtime/reports/melee-mining-compat.log)：同批攻击源码构建的原服实际矿逻辑9组PASS；未改变MakeMine概率/品质。； **纯回归** [.runtime/reports/melee-movement-compat.log](../.runtime/reports/melee-movement-compat.log)：同批原服实际移动碰撞、纠正、旁观隔离及恢复专项PASS。； **纯回归** [.runtime/reports/melee-mining-gateway-compat.log](../.runtime/reports/melee-mining-gateway-compat.log)：同批网关生产挖矿TCP9组PASS：TURN/HEAVY串行、真实SM200投影、死亡/换图排空及超时隔离。； **真实协议** [.runtime/reports/melee-live-run.json](../.runtime/reports/melee-live-run.json)：53/53完整真实probe中的半月25：原+WID切换/GOOD、真实SM24/halfMoon self+observer一致、关闭+UWID；原SM211确认F2 ASCII50且正常重登保存。费用与MP0降级已有原服类证明，此live不证明扇形多目标/目标血量。；记录时间 2026-10-01T09:52:31.166Z；环境 Windows isolated owned warriors; real ws://127.0.0.1:18801/ws -> native runtime; local .NET8 Gateway compatibility build；报告SHA256 `7196c7ce2483032998d2d1cde41c7bef7f5a20030e274ccbc2de918474e5ee46`；实际M2 SHA256 `09a2902cc751b2a61ae0577b93a8a0c2a9948e2ada64b8055391ab037500d436`；实际Gateway SHA256 `c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97`；对应源码全部SHA见报告 sourceSha256； **源码审查** [.runtime/reports/melee-deployment.json](../.runtime/reports/melee-deployment.json)：根代理正常停服/备份后只部署M2Server与Gateway；实际新M2 09a290…d436、Gateway c4e22…7b97；既有GameSrv/OpenMir2/SystemModule/ScriptSystem原4依赖保持，不能拿默认新编译依赖代替此实际部署版本。；记录时间 2026-10-01T09:49:41.3999398Z；环境 M2 only; actual existing GameSrv/OpenMir2/SystemModule/ScriptSystem preserved; gateway local net8 compatibility build；报告SHA256 `109f3ff35ccc84dc04cd893a2e0f65243056914b9a668b7b943763116c55af84`； **纯回归** [.runtime/reports/melee-native-runtime-binary-compat.log](../.runtime/reports/melee-native-runtime-binary-compat.log)：独立staging使用新M2+实际原4依赖运行生产NativeMeleeRegression六组PASS；包括八向实际目标、SM self/remote、消费、重击body/费用及拒绝。未触及DB/真实角色；同版本矿9/移动1实际依赖证据另存melee-actual-runtime-compat.json。； **纯回归** [.runtime/reports/melee-fixture-regression.log](../.runtime/reports/melee-fixture-regression.log)：12项无DB夹具回归：实际原地图/导师脚本、协议拥有的双角色namespace、时间/backup/默认plan、仅攻击者Mp0、停服/其它角色拒绝及精确清理模拟。实际清理须另看live清理报告。； **真实协议** [.runtime/reports/melee-live-low-mp.json](../.runtime/reports/melee-live-low-mp.json)：8/8真实低MP阶段：已保存attacker Mp0，原skill26输入收到真实GOOD但无+FIR、无网关确认fire，下一真实SM非fire；保留AllowFireHitSkill先置内部flag的原行为，不把GOOD当蓄力/伤害证明。本阶段closedLoopVerified=false表示它仅为低MP专测，完整动作持久闭环在run报告。；记录时间 2026-10-01T09:56:31.609Z；环境 Windows isolated owned attacker; real ws://127.0.0.1:18801/ws; normal stop + verified backup before attacker-only saved MP preparation；报告SHA256 `f574f38ef4be58a4c56c3b2add3f1a2e95eb33fc37175b9ccd1796d1deb3b8ee`；实际M2 SHA256 `09a2902cc751b2a61ae0577b93a8a0c2a9948e2ada64b8055391ab037500d436`；实际Gateway SHA256 `c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97`； **纯回归** [.runtime/reports/melee-visual-regression.json](../.runtime/reports/melee-visual-regression.json)：生产MeleeVisual/OnlineActor 19组fakePixi、7项素材导入Python、旧Actor18/World4及TSC通过：同ID self prediction→actual专属kind在原frame/frameAt处接管，不floor/重播人体；零基frame2武器/技能音各一次，迟到不回放。不是浏览器/GPU/native.exe时序验证。；记录时间 2026-10-01T09:31:01.598597+00:00；环境 Windows local Node24/Python; actual production TypeScript transpile + fake Pixi/clock and isolated synthetic WIL fixtures; actual native WIL byte check; no browser/GPU/original executable；报告SHA256 `39ccd08b2d1f562c5bebf0312fbcb211e06c5af113a4682bd4516e4c47c8ce4c`；对应源码全部SHA见报告 sourceSha256； **原生素材像素** [.runtime/reports/melee-native-assets.json](../.runtime/reports/melee-native-assets.json)：本机原Magic WIL/WIX直接重解码192/192帧与既有PNG matched、repaired0，几何/alpha/source pair核对；只证明素材字节与偏移，不证明浏览器screen调色/原端实际播放。；记录时间 2026-10-01T09:31:34.032853+00:00；环境 local Python WeMadeLibrary direct original WIL/WIX decode; no network/browser/original executable；报告SHA256 `c59c3872aa6ff257e5c02e9629be5d79f6775c975e54c2f9d790b8584e1df1c3`； **真实协议** [.runtime/reports/melee-cleanup.json](../.runtime/reports/melee-cleanup.json)：正常停服并有效备份后清理本次协议拥有的两名战士隔离夹具：removedFixtures=2、remainingAccountsCharactersIndexes=0、verified=true；仅证明测试夹具收尾，不把它计为技能数值、权限、画面或原客户端完成。；记录时间 2026-10-01T10:04:10.210525+00:00；环境 Windows isolated owned warrior fixtures; normal native stop + verified backup; exact namespace cleanup and real residual database verification；报告SHA256 `681d53e58b45fe7bc085e86fe85eb94ec54d7c80f62c49caa1dc44c7ca908fc6`； **源码审查** [.runtime/reports/melee-cleanup-gateway-ready.json](../.runtime/reports/melee-cleanup-gateway-ready.json)：清理完成后测试网关实际重新ready，health.status=ready、protocol=1，运行Gateway SHA仍为c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97；仅为环境恢复证据，不是浏览器/原客户端交互验收。；记录时间 2026-10-01T10:06:10.2851933Z；环境 local Windows test18801 gateway restarted after owned fixture cleanup; actual HTTP health readiness；报告SHA256 `fe6a54e63c72cbc2da2eb210ca295170367ac89f006fada54f461e5340dc80f5`

剩余缺口：

- 已完成3级学习、SM24 self/observer/GOOD及F2重登；费用/MP0降级为原服类证明，扇形多目标在线伤害/费用/遮挡边界与0–2级训练仍缺。
- 浏览器剑光与同版本原客户端动态对照尚未完成。 原light2、screen原palette量化、remote msgMuch与native CM/selfSM真实时线及八向四种原exe对照仍缺。

<a id="game-126"></a>

### GAME-126 技能 26：烈火剑法（charge）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=26 烈火剑法 use=charge；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)：P0数值/职业/学习等级/训练参数； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\ClMain.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas)：AttackTarget 2128–2164：经典输入烈火>攻杀>半月>满足两格目标的刺杀>武器重击/普通；4086–4109 原客户端忽略自身全部七种攻击SM。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\Client\Actor.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas)：3297–3324：四专属剑光都用ActHit六帧85ms，按实际SM区分power/thrusting/halfMoon/fire；重击、大击不借用专属剑光。； **原版参考源码** [C:\Users\122\Documents\Codex\2026-09-27\codex-threads-01a0ddc4-8265-75b0-82f2\work\mir2-client-reference\GameOfMir\M2Server\ObjBase.pas](C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/M2Server/ObjBase.pas)：AttackDir 18785–18857：先Dir=nDir再GetPoseCreate；消费前保存攻杀/烈火flags决定最终RM，随机与伤害顺序不变。； **固定原服源码** [vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs](../vendor/openmir2/src/Modules/SystemModule/Const/MagicConst.cs)：固定经典ID：攻杀7、刺杀12、半月25、烈火26，不推断高版本ID。； **固定原服源码** [vendor/openmir2/src/OpenMir2/Messages.cs](../vendor/openmir2/src/OpenMir2/Messages.cs)：真实SM14 normal、15 heavy、16 big、18 power、19 thrusting、24 halfMoon、8 fire；输入CM3014/3015/3016/3018/3019/3024/3025。； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)：RM→SM旁观者投递；RM_HEAVYHIT空body走header-only，非空DIG body保留。； **项目契约** [content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)：经典四实际SM对应Magic原索引：攻杀800、刺杀1410、半月1700、烈火3480 +dir*10+bodyFrame0–5；ActHit六帧85ms；普通/重击/大击无专属剑光。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)、[services/web-gateway/MeleeSkills.cs](../services/web-gateway/MeleeSkills.cs)、[services/web-gateway/WorldProjection.cs](../services/web-gateway/WorldProjection.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs)、[tests/NativeMeleeRegression/Program.cs](../tests/NativeMeleeRegression/Program.cs)、[tests/MeleeGatewayRegression/Program.cs](../tests/MeleeGatewayRegression/Program.cs)、[tools/melee_probe.mjs](../tools/melee_probe.mjs)、[tools/prepare_melee_probe.py](../tools/prepare_melee_probe.py)、[tools/cleanup_melee_probe.py](../tools/cleanup_melee_probe.py)、[tools/melee_probe_fixtures.py](../tools/melee_probe_fixtures.py)、[tests/test_melee_probe_fixtures.py](../tests/test_melee_probe_fixtures.py)、[docs/melee-probe.md](../docs/melee-probe.md)、[apps/web/src/melee-visual.ts](../apps/web/src/melee-visual.ts)、[content/classic-176/melee-visual.json](../content/classic-176/melee-visual.json)、[scripts/import-national-melee-assets.py](../scripts/import-national-melee-assets.py)、[tests/melee_visual_regression.mjs](../tests/melee_visual_regression.mjs)、[tests/test_national_melee_import.py](../tests/test_national_melee_import.py)。

必须通过：

- 成功：固定skill26+FIR蓄力后等原施法GOOD，再由CM3025消费一次；消费前保存RM_FIREHIT→真实SM8 fire，self/remote一致。
- 失败：未蓄力CM3025由原服输出SM14，无假烈火剑光；冷却未到/原MP不足拒绝，状态本身不能提前完成下一击。
- 边界：真实类固定DC100/HitDouble10目标失HP200且攻击阶段MP不另扣，随后无charge为普通；保留原费用、整除公式和随机顺序；双烈火/空挥/过期+UFIR/换图/重登和0–3级仍需真实在线覆盖。

当前验证：**真实协议** [.runtime/reports/gameplay-live-check.json](../.runtime/reports/gameplay-live-check.json)：蓄力/一次消费/冷却与自然到期；非真伤； **纯回归** [.runtime/reports/frontend-events-final.log](../.runtime/reports/frontend-events-final.log)：通用passive/toggle/charge输入/状态控件；并非本技能完整原端回放； **纯回归** [.runtime/reports/melee-native-regression.log](../.runtime/reports/melee-native-regression.log)：2026-10-01 17:31 CST，真实PlayObject.Operate/ClientHitXY/AttackDir、真实地图八向与旁观者、生产包编解码6组PASS：方向选目标、七SM一致、重击空/非空body、攻杀/烈火消费前捕获、MP0半月降级/原耗MP、非法/死亡/禁攻/错坐标拒绝。不是在线角色或原客户端实验。； **纯回归** [.runtime/reports/melee-gateway-regression.log](../.runtime/reports/melee-gateway-regression.log)：生产GatewaySession+LegacyConnection loopback TCP+捕获WebSocket7组PASS：七SM投影、fire>power>wide>long选择、LNG/WID/FIR状态不提前释放施法ACK槽、self SM不完成请求、服务器降级、新PWR不丢、拒绝及死亡/地图中断后原ACK排空。不是真实18801/原服联机。； **纯回归** [.runtime/reports/melee-native-build.log](../.runtime/reports/melee-native-build.log)：net8原服及真实类专项成功编译；本次增量0警告/0错误；原服全量4个既有警告在其它文件。； **纯回归** [.runtime/reports/melee-mining-compat.log](../.runtime/reports/melee-mining-compat.log)：同批攻击源码构建的原服实际矿逻辑9组PASS；未改变MakeMine概率/品质。； **纯回归** [.runtime/reports/melee-movement-compat.log](../.runtime/reports/melee-movement-compat.log)：同批原服实际移动碰撞、纠正、旁观隔离及恢复专项PASS。； **纯回归** [.runtime/reports/melee-mining-gateway-compat.log](../.runtime/reports/melee-mining-gateway-compat.log)：同批网关生产挖矿TCP9组PASS：TURN/HEAVY串行、真实SM200投影、死亡/换图排空及超时隔离。； **真实协议** [.runtime/reports/melee-live-run.json](../.runtime/reports/melee-live-run.json)：53/53完整真实probe中的烈火26：原+FIR与原施法GOOD之后实际self+observer SM8/fire一次消费；原SM211确认F3 ASCII51及重登保存。空挥SM是动作闭环，不宣称本live比较实际增强伤害、双烈火或全部等级训练。；记录时间 2026-10-01T09:52:31.166Z；环境 Windows isolated owned warriors; real ws://127.0.0.1:18801/ws -> native runtime; local .NET8 Gateway compatibility build；报告SHA256 `7196c7ce2483032998d2d1cde41c7bef7f5a20030e274ccbc2de918474e5ee46`；实际M2 SHA256 `09a2902cc751b2a61ae0577b93a8a0c2a9948e2ada64b8055391ab037500d436`；实际Gateway SHA256 `c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97`；对应源码全部SHA见报告 sourceSha256； **源码审查** [.runtime/reports/melee-deployment.json](../.runtime/reports/melee-deployment.json)：根代理正常停服/备份后只部署M2Server与Gateway；实际新M2 09a290…d436、Gateway c4e22…7b97；既有GameSrv/OpenMir2/SystemModule/ScriptSystem原4依赖保持，不能拿默认新编译依赖代替此实际部署版本。；记录时间 2026-10-01T09:49:41.3999398Z；环境 M2 only; actual existing GameSrv/OpenMir2/SystemModule/ScriptSystem preserved; gateway local net8 compatibility build；报告SHA256 `109f3ff35ccc84dc04cd893a2e0f65243056914b9a668b7b943763116c55af84`； **纯回归** [.runtime/reports/melee-native-runtime-binary-compat.log](../.runtime/reports/melee-native-runtime-binary-compat.log)：独立staging使用新M2+实际原4依赖运行生产NativeMeleeRegression六组PASS；包括八向实际目标、SM self/remote、消费、重击body/费用及拒绝。未触及DB/真实角色；同版本矿9/移动1实际依赖证据另存melee-actual-runtime-compat.json。； **纯回归** [.runtime/reports/melee-fixture-regression.log](../.runtime/reports/melee-fixture-regression.log)：12项无DB夹具回归：实际原地图/导师脚本、协议拥有的双角色namespace、时间/backup/默认plan、仅攻击者Mp0、停服/其它角色拒绝及精确清理模拟。实际清理须另看live清理报告。； **真实协议** [.runtime/reports/melee-live-low-mp.json](../.runtime/reports/melee-live-low-mp.json)：8/8真实低MP阶段：已保存attacker Mp0，原skill26输入收到真实GOOD但无+FIR、无网关确认fire，下一真实SM非fire；保留AllowFireHitSkill先置内部flag的原行为，不把GOOD当蓄力/伤害证明。本阶段closedLoopVerified=false表示它仅为低MP专测，完整动作持久闭环在run报告。；记录时间 2026-10-01T09:56:31.609Z；环境 Windows isolated owned attacker; real ws://127.0.0.1:18801/ws; normal stop + verified backup before attacker-only saved MP preparation；报告SHA256 `f574f38ef4be58a4c56c3b2add3f1a2e95eb33fc37175b9ccd1796d1deb3b8ee`；实际M2 SHA256 `09a2902cc751b2a61ae0577b93a8a0c2a9948e2ada64b8055391ab037500d436`；实际Gateway SHA256 `c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97`； **纯回归** [.runtime/reports/melee-visual-regression.json](../.runtime/reports/melee-visual-regression.json)：生产MeleeVisual/OnlineActor 19组fakePixi、7项素材导入Python、旧Actor18/World4及TSC通过：同ID self prediction→actual专属kind在原frame/frameAt处接管，不floor/重播人体；零基frame2武器/技能音各一次，迟到不回放。不是浏览器/GPU/native.exe时序验证。；记录时间 2026-10-01T09:31:01.598597+00:00；环境 Windows local Node24/Python; actual production TypeScript transpile + fake Pixi/clock and isolated synthetic WIL fixtures; actual native WIL byte check; no browser/GPU/original executable；报告SHA256 `39ccd08b2d1f562c5bebf0312fbcb211e06c5af113a4682bd4516e4c47c8ce4c`；对应源码全部SHA见报告 sourceSha256； **原生素材像素** [.runtime/reports/melee-native-assets.json](../.runtime/reports/melee-native-assets.json)：本机原Magic WIL/WIX直接重解码192/192帧与既有PNG matched、repaired0，几何/alpha/source pair核对；只证明素材字节与偏移，不证明浏览器screen调色/原端实际播放。；记录时间 2026-10-01T09:31:34.032853+00:00；环境 local Python WeMadeLibrary direct original WIL/WIX decode; no network/browser/original executable；报告SHA256 `c59c3872aa6ff257e5c02e9629be5d79f6775c975e54c2f9d790b8584e1df1c3`； **真实协议** [.runtime/reports/melee-cleanup.json](../.runtime/reports/melee-cleanup.json)：正常停服并有效备份后清理本次协议拥有的两名战士隔离夹具：removedFixtures=2、remainingAccountsCharactersIndexes=0、verified=true；仅证明测试夹具收尾，不把它计为技能数值、权限、画面或原客户端完成。；记录时间 2026-10-01T10:04:10.210525+00:00；环境 Windows isolated owned warrior fixtures; normal native stop + verified backup; exact namespace cleanup and real residual database verification；报告SHA256 `681d53e58b45fe7bc085e86fe85eb94ec54d7c80f62c49caa1dc44c7ca908fc6`； **源码审查** [.runtime/reports/melee-cleanup-gateway-ready.json](../.runtime/reports/melee-cleanup-gateway-ready.json)：清理完成后测试网关实际重新ready，health.status=ready、protocol=1，运行Gateway SHA仍为c4e22fc2521910b0d63835410f8fce730dda2bd3868d0797355b32c96f6a7b97；仅为环境恢复证据，不是浏览器/原客户端交互验收。；记录时间 2026-10-01T10:06:10.2851933Z；环境 local Windows test18801 gateway restarted after owned fixture cleanup; actual HTTP health readiness；报告SHA256 `fe6a54e63c72cbc2da2eb210ca295170367ac89f006fada54f461e5340dc80f5`

剩余缺口：

- 已完成3级学习、真实+FIR→SM8 self/observer/GOOD及F3重登；另MP0原GOOD无FIR、下一实际SM非fire通过。冷却/双烈火/空挥相对命中伤害、在线目标血量、0–2级训练仍缺。
- 浏览器剑光/声音与同版本原客户端动态对照尚未完成。 原light2、screen原palette量化、remote msgMuch与native CM/selfSM真实时线及八向四种原exe对照仍缺。

<a id="game-127"></a>

### GAME-127 技能 27：野蛮冲撞（rush）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=27 野蛮冲撞 use=rush；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：八方向冲撞多步，低等级目标被推，撞墙回弹，原服魔耗和训练。
- 失败：更高等级/不可推/安全区/墙/冷却不足不能错误移动。
- 边界：连续冲撞FIFO、冲撞打断移动、被推后马上动作、各种等级差。

当前验证：**真实协议** [.runtime/reports/world-events-live.json](../.runtime/reports/world-events-live.json)：冲撞/撞墙/四步被推/后续移动；不证明全部方向与渲染

剩余缺口：

- 位移/阻挡/被推和恢复实测；全部方向/MP/伤害/浏览器原端帧未验
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-128"></a>

### GAME-128 技能 28：心灵启示（support）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=28 心灵启示 use=support；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：原服限时显示合法目标血量并发送/解除HP查看状态。
- 失败：未学/MP不足/非法目标拒绝。
- 边界：敌友/怪物不同规则、效果到期再次隐藏血量、重施/目标移出视野。

当前验证：缺少当前可复核证据。

剩余缺口：

- 当前OnlineActor常绘已知HP，未实现原端开血限时语义；无专属特效
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-129"></a>

### GAME-129 技能 29：群体治疗术（ground）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=29 群体治疗术 use=ground；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：区域合法目标按原服周期群疗并同步资源。
- 失败：MP/符不足、死目标、超8格拒绝。
- 边界：范围边界、多目标受击、重复刷新、tick到期、满血行为。

当前验证：缺少当前可复核证据。

剩余缺口：

- 3840起短施法序列已有；范围治疗回复曲线/材料未验
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-130"></a>

### GAME-130 技能 30：召唤神兽（self）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=30 召唤神兽 use=self；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：消耗符并产生神兽/变形/喷火原服对象和攻击表现。
- 失败：MP/符不足/召唤上限/非法区域失败。
- 边界：重复召唤、神兽/圣兽两形态、练级0–7、主人死亡/跨图/掉线。

当前验证：缺少当前可复核证据。

剩余缺口：

- 无30施法序列；完整神兽两形态/喷火/召唤AI链路未验
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-131"></a>

### GAME-131 技能 31：魔法盾（self）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)（magicId=31 魔法盾 use=self；这是输入契约，非全部数值与像素证明）； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)（原服技能实现/材料/范围/伤害）； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)（ClientSpellXY技能入口与许可）； **项目契约** [content/classic-176/skill-rules.json](../content/classic-176/skill-rules.json)（P0数值/职业/学习等级/训练参数）； **参考源码** [Actor.pas](<C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas>)（盾bit与原帧3890/3900、120ms）； **项目契约** [content/classic-176/actor-status.json](../content/classic-176/actor-status.json)（0x00100000确认位、常态3890–3892/受击3900–3902每120ms；脚底偏移/层级/退出/异步清理）； **原端像素** [Magic.wil](<C:/Program Files (x86)/shanda/Legend of Mir/Data/Magic.wil>)（6个盾PNG直接国服重解码一致；source/index SHA锁定）。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)、[content/classic-176/actor-status.json](../content/classic-176/actor-status.json)、[tests/actor_status_regression.mjs](../tests/actor_status_regression.mjs)。

必须通过：

- 成功：原服0x00100000持续盾，常态3890..3892/受击3900..3902按120ms绘制。
- 失败：MP不足/未学/盾解除时停止显示，不由施法成功推断持续。
- 边界：重登带盾、受击3帧后常态、剩余秒数/破盾伤害、移动换图/死亡/迟到素材。

当前验证：**纯回归** [.runtime/reports/actor-status-regression.log](../.runtime/reports/actor-status-regression.log)（15组真实生产状态类+fake Pixi/时钟：确认bit持续正常三帧、受击三帧/重复打击/回常态、撤销/死亡/移除/素材迟到、共享资源独立生命周期）； **原端像素** [.runtime/reports/actor-status-native-assets.json](../.runtime/reports/actor-status-native-assets.json)（国服Magic六帧 bytes/hash/尺寸/有符号偏移/alpha重解码6/6一致；未证明屏幕叠加或原端运行）

剩余缺口：

- 持续盾与受击分支已实现；原服实际bit维持/重登带盾/解除、MP/时长/破盾伤害与连续受击时钟需真实协议及浏览器验收。
- screen保持RGB但尚无 Color256Anti 原256色最近色量化；动态合成/脚底位置/武器前后/120ms时序需要同版本原端实机与浏览器对照。

<a id="game-132"></a>

### GAME-132 技能 32：圣言术（hostile）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=32 圣言术 use=hostile；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：原服对符合死系条件目标判定成功击杀或失败，效果视觉一致。
- 失败：活系/不可圣言Boss/MP不足失败，绝不本地杀怪。
- 边界：等级差/概率统计、成功死亡掉落经验、目标换位/已死/队友宠物。

当前验证：缺少当前可复核证据。

剩余缺口：

- 无32施法/resolve分支；成功失败概率与死系限制未验
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

<a id="game-133"></a>

### GAME-133 技能 33：冰咆哮（ground）

状态：**部分实现**（`partial`）。

依据及等级：**项目契约** [content/classic-176/skill-input.json](../content/classic-176/skill-input.json)：magicId=33 冰咆哮 use=ground；这是输入契约，非全部数值与像素证明； **固定原服源码** [vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)：原服技能实现/材料/范围/伤害； **固定原服源码** [vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)：ClientSpellXY技能入口与许可。

现有实现：[content/classic-176/skill-input.json](../content/classic-176/skill-input.json)、[apps/web/src/skills.ts](../apps/web/src/skills.ts)、[apps/web/src/play.ts](../apps/web/src/play.ts)、[services/web-gateway/SpellTarget.cs](../services/web-gateway/SpellTarget.cs)、[services/web-gateway/MagicProjection.cs](../services/web-gateway/MagicProjection.cs)、[services/web-gateway/GatewaySession.cs](../services/web-gateway/GatewaySession.cs)、[apps/web/src/magic-effects.ts](../apps/web/src/magic-effects.ts)、[apps/web/src/online-actors.ts](../apps/web/src/online-actors.ts)、[vendor/openmir2/src/M2Server/Magic/MagicManager.cs](../vendor/openmir2/src/M2Server/Magic/MagicManager.cs)、[vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs](../vendor/openmir2/src/M2Server/Player/PlayObject.Attack.cs)。

必须通过：

- 成功：选格范围冰暴正确帧/方向/区域多目标原服伤害。
- 失败：MP不足/超8格/禁施范围拒绝。
- 边界：边缘目标、重复施法、范围遮挡层、下雪般多帧序列及多目标death。

当前验证：缺少当前可复核证据。

剩余缺口：

- 无33施法/resolve分支；仅泛化ground输入，完整技能不能标已实现
- 此技能不在P015项数值/训练验收清单；需要补全经典版本依据、技能书/NPC入口、数值与逐级验收。
- 浏览器交互与同版本原端动态对照尚未完成。

## 验收记录模板

每次落地更新对应 ID 的 implementation、gaps、verification 和 status。完整验收记录至少含：版本档位/源码指纹、客户端素材哈希、运行通道和环境、固定角色/目标/装备/技能等级、输入与原服事件时间线、成功/失败/边界结果、生产浏览器截图/录像、适用的原端同场景对照、夹具清理证明。只能删除已经由证据解决的缺口；不能把未验证项写成已完成。

经济、任务、交易、存档场景需要核验前后实例和金币守恒；技能场景区分“动作接受”“效果生成”“状态生效”“实际命中/消耗”“视觉符合原端”。每一层都保存独立证据，最后才合并为完整复刻通过。

## 2026-10-01 第五批：地图与资源一致性

本批生产修复和剩余范围见 [resource-consistency-2026-10-01.md](resource-consistency-2026-10-01.md)。生效源与参考候选、572张地图及两张服务端扩展、地图子集刷怪过滤、真实缺图和ID48冲突分别追踪；运行配置与数据库未修改。

本批检查：242组/21个Node脚本；完整Python257项，失败1项；全套之后的Node版本预检修复单独重跑8安装+2备份专项通过，不再重复未变的逐帧审计。内容审计complete=false。回执 `.runtime/reports/resources-v5-checks.json`、`resources-v5-content-audit.json`，批次汇总 `replication-resources-v5-batch.json`。这些是资源/静态/模块证据，不代表原端、浏览器或音画验收；195项目标和状态边界保留。

## 2026-10-01 第六批：原索引、加载恢复与切图事务

本批细节见 [原客户端图标规则与加载恢复](icon-source-usage-2026-10-01.md)；更新ID：GAME-001、GAME-030、GAME-034、GAME-045、GAME-081。

实际模块回归324组/27脚本；完整Python279项，278通过，GA0既有缺帧1失败；内容审计仍exit1/complete=false。HTTP421文件字节相同只证明资源可访问。195项状态边界不变，无浏览器/原端/GPU完整关闭。中央回执 `.runtime/reports/replication-icons-v6-batch.json`。

## 2026-10-01 第七批：地图来源选择与完整内容版本边界

本批细节见 [地图来源选择](map-asset-selection-2026-10-01.md) 和 [全量版本边界](classic-version-boundary-2026-10-01.md)。更新ID：GAME-001、GAME-045、GAME-081。

最终实际352组/30脚本通过；完整Python339/339通过；内容CLI仍exit1/complete=false。HTTP1454文件源/服务/dist一致；本批未改原服/网关/配置/数据库。调色板导出默认目录改为原版资源锁指定目录，另一路原端装备overlay部署不归为本批。195项状态不提升为原端/浏览器完整verified。回执 `.runtime/reports/replication-map-v7-batch.json`。

## 第十三批当前进度（保留上方初始审计快照）

默认死亡调色、原始遮罩/暗度表和权威光值已按当前JSON台账追踪。ART-009/010现partial，其余相关需求保持partial；总195项为5implemented/183partial/7missing/0verified。夜景未绘制，原端/浏览器验收及完整天气/光源/死亡玩法仍开放。上方2026-10-01审查与缺口作为历史快照保留，当前范围、执行报告和版本差异见[第十三批主题](scene-lighting-death-implementation-2026-10-02.md)及各领域replication JSON。

## 2026-10-02 第十六批：活动对象占格的移动恢复

网页点击路径现在在动态对象占格时停在可达邻格；收到服务端碰撞拒绝后，已知活动对象占格不会被误当作门而发送openDoor。最近被服务端拒绝的格子短暂避让1.5秒；继续中的点击路线立即重算，无可达路线时停止尝试。服务端位置及碰撞权威未改变。TypeScript noEmit、生产Vite构建通过，产物写入任务预览目录。首轮构建缺GridPoint类型导入失败，修复后重跑成功。没有真实浏览器键鼠、原端同场景和移动实体竞争时间线证据，GAME-012/013继续partial。详见[movement collision实现边界](movement-collision-implementation-2026-10-02.md)，报告`.runtime/reports/gameplay-v16-final-build.json`。

## 2026-10-02 第十七批：两格跑步碰撞逐格恢复

网关回传的 `actionResult.x/y` 是校正后的玩家位置，不是碰撞格。前端现在按跑步段顺序检查两格，先遇到的实体或地形格决定恢复方式；怪物挡第一格时按实际占格绕行，开门请求指向跑程内真实不可走格；实体状态还没到时，短暂避开尝试路径并重规划。最终43条网页回归、Python384/384、TypeScript和Vite生产代码包通过。最终增量包关闭publicDir复制，完整静态资源复制回执先于最后顺序调整。没有真实浏览器或同版原端时序回放，GAME-012/013仍partial。详细边界与回执见[movement collision实现边界](movement-collision-implementation-2026-10-02.md)及对应 `.runtime/reports/gameplay-v17-*.json`。

## 第十八批：已确认阻挡者离格后即时恢复

怪物占格拒绝会暂存被拒绝的行走格，便于避开状态消息晚到的对象。现在服务器确认阻挡对象离格、死亡或移除且格内无其他活对象后，立即解除普通路线及追击路线的临时避让；若同格仍有另一活对象则保留。身份未知时1500ms兜底不变，客户端坐标仍只取服务端确认。生产`play.ts`实体更新、死亡与移除回归覆盖了迟到对象、同格对象与超时边界。

`test:web` 44脚本、TypeScript noEmit、Vite 760模块/38输出文件构建、完整Python386/386通过。构建输出留在忽略目录，原`dist/web`未覆盖。没有生产浏览器键鼠和同版原端动态时序回放，GAME-012/013继续partial。详情及SHA见[movement collision实现边界](movement-collision-implementation-2026-10-02.md)和`.runtime/reports/movement-collision-early-release-2026-10-02.json`。
