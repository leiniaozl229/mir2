# Web 客户端完整复刻：总计划与落地追踪

更新：2026-10-02。持续目标是完整复刻目标版本的 UI、交互、玩法、美术和声音细节。已有新手闭环、P0 的 15 个技能、资源导出数量或一次联机成功，都不能替代完整版本验收。

## 文档入口

| 文档 | 管理范围 | 机器底稿 |
|---|---|---|
| [UI 细节清单](ui-replication-inventory.md) | 认证、HUD、窗口、物品、服务、社交、焦点、IME、关闭与取消 | [ui.json](replication/ui.json) |
| [玩法细节清单](gameplay-replication-inventory.md) | 移动战斗、全部候选经典技能、经济、任务、社交、死亡、换图和存档 | [gameplay.json](replication/gameplay.json) |
| [美术与声音清单](art-replication-inventory.md) | 素材来源、地图、角色、怪物、法术、UI、字体、游标、音频和逐帧差分 | [art.json](replication/art.json) |
| 本文 | 范围、状态规则、执行顺序、落地批次与验证限制 | `tools/replication_audit.py` |

首次全量盘点包含 **195 个稳定 ID**：UI 64、玩法 80（含技能 1–33 各一项）、美术与声音 51。每项都有来源、实现文件、成功/失败/边界验收条件、验证范围和剩余缺口。后续原端取证继续补细项，已有 ID 保留，新增要求分配新 ID。第八批更新后状态为 `missing` 10、`partial` 180、`implemented` 5、`verified` 0；数量表示盘点与验收状态，不表示画面或玩法还原百分比。

**当前状态快照（2026-10-02）：**195项：5 implemented、185 partial、5 missing、0 verified；UI为1/60/3/0，玩法为1/79/0/0，美术与声音为3/46/2/0。机器审计结果位于 `.runtime/reports/replication-audit-goal-continuation.json`。本快照由JSON台账统计；它不是还原百分比，也不替代每项验收证据。最新金币批次将UI-034与GAME-036同步为partial，真实浏览器、18801当前运行网关、原端和经济存档验收仍未关闭。

## 目标版本与证据

目标继续使用项目锁定的 2003 国服 1.76 候选包，版本、安装包哈希链与来源见 `content/classic-176/{version-profile,asset-sources,national-ui-profile,national-gameplay}.json`。本机原始 Data 位于 `C:/Program Files (x86)/shanda/Legend of Mir/Data`。生产使用 800×600 逻辑画布，校准页复用生产组件。

原端像素、同包可执行程序实测、Delphi/Crystal 参考代码、当前原服源码、项目契约和浏览器推断分别登记。参考代码能指导实现，版本一致性仍需同包原端运行证明。原端过去完成登录、选角、比奇入图和移动的范围见 `docs/local-playtest.md`；全部窗口、技能和音效仍需逐项对照。小地图点击寻路、WASD 等浏览器增强保留显式契约，等待核对目标版本语义。

地图需要单独锁版本：原装 Map 实查 528 张，服务端数据 572 张，当前 profile 与 Web 导出572张。528 张交集中 522 张哈希相同，`0/11/2/3/4/5` 六张不同；`D718/D719` 已以明确的服务端扩展接入，生成出生/向导/兜底配置与目标原版取证分别追踪。首次盘点有 10,247 个唯一 `(图库,索引)` 未导出：原三库范围内的 9,839 帧现已补齐，572 图现有规范渲染依赖无缺项。GA0 的 408 个越界 Tiles 索引已按精确契约选择参考源，原有 125 个国服索引保留；原国服缺项及 MAP/图库历史配对仍独立失败。固定 GA0 的 54 处高索引引用另按参考越界 nil 行为跳过并保留碰撞，不能推广为所有地图的通用规则。全量场景视口离线抽查及抽样点依据见 [地图场景审计](map-visual-catalog-audit-2026-10-02.md)；353 张地图尚无导航/刷怪坐标，使用的是可绘制视口而非已证实出生点。当前渲染接入与原版完整验收分别追踪。

## 状态与关闭门槛

| 状态 | 条件 | 下一步 |
|---|---|---|
| `missing` | 缺少入口或核心行为，缺口可复查 | 按版本依据补实现 |
| `partial` | 已有部分输入、协议、规则或表现，仍有实现/验收缺口 | 补齐全部分支和异常路径 |
| `implemented` | 该项实现闭合，路径可复查；完整验收仍待完成 | 按全部场景完成原端与生产浏览器验收 |
| `verified` | 全部验收条件通过且无剩余缺口，有同版原端与当前浏览器证据；视觉项另有差分 | 维护回归与证据指纹 |

源码审查、单元回归、真实原服协议、真实浏览器、原端运行和视觉差分各自登记。测试文件仅说明覆盖入口，执行报告说明本次结果。原端 TCP、网关 WebSocket、浏览器 DOM 和逐帧画面分别验收；历史证据保留日期、通道和限制。

完整关闭包至少记录：需求 ID、目标版本、源码/资源指纹、环境/时间、输入步骤、角色/物品/目标条件、预期/实际、成功/失败/边界、原服事件时间线、截图/录像/音频、差分阈值与遮罩、报告哈希。经济和存档增加金币/实例守恒、重登、断线/重复请求及独立夹具清理证明。

## 执行顺序

| 优先级 | 需求 ID | 工作包 |
|---|---|---|
| P0 | ART-003/005/006/051、GAME-001/081 | 地图缺帧与版本闭合：按真实依赖补原帧，保留索引/哈希；超范围与扩展世界差异逐项追踪，迁移内容审计 |
| P0 | UI-005/007/008/010/032/037/043 | 顶层关闭、模态隔离、取消/超时、权威迟到结果；随后补 NPC 会话代数与关闭后迟到回复隔离 |
| P1 | UI-026、GAME-045/051 | None/F1–F8 设置、冲突解绑、稀疏槽、原服确认快照、重登持久化和失败回滚 |
| P1 | GAME-053/106/131、ART-023/029/030 | 持续盾、受击盾帧、红绿毒差异、附体与近战剑光 |
| P1 | GAME-101–133、GAME-033/037 | 全经典技能、挖矿、特殊物品：学会、逐级数值、目标/材料/魔耗、命中、失败与边界 |
| P1 | UI-033/038–043/055–057、GAME-034/041–044/062 | 跨窗拿放、原版服务格子/分页、交易锁/变更撤销、容量/费用/失败/守恒 |
| P1 | UI-034、GAME-036 | 金币旧协议投放与失败/拾取/存档守恒；堆叠拆分仅在同版证据确认后实现 |
| P2 | UI-013–022/044–064、GAME-060–084 | 全认证流程、聊天语义、组队行会任务攻城、系统选项、死亡退出和恢复 |
| P2 | ART-004/007–016/018–027/031–050、UI-003/009/011/012/064 | 全动作/声音/字体/光照/游标和全部 UI 状态帧，按场景录制原端并与生产浏览器比较 |

P2 同样属于完整交付必需范围。每批同步维护 ID、实现和证据；已解决的缺口才移除，部分实现继续保留 `partial`。

## 2026-10-01 落地批次

**盘点与追踪：**新增三份人工清单及 JSON 底稿，逐项读取当前源码、manifest 与现存报告。`tools/replication_audit.py` 检查 ID、域/状态、验收场景、路径、Markdown/JSON ID与逐项状态一致性和证据类别；完整关闭要求原端/当前浏览器证据，视觉项要求差分，运行证据要求时间、环境、SHA-256 并核对实际内容。当前9个回归覆盖丢项、状态漂移、假关闭、失效路径、坏格式与证据替换。

**输入和窗口，UI-005/007/008/010/048/049/059：**新增生产 `classic-input.ts`。认证/死亡/地图未就绪阻断游戏热键；NPC/服务期间阻断世界移动、施法、数字物品键和攻击模式键。Enter/Tab 留给焦点控件，F9/F10/F11 允许打开协作窗口。IME/文本优先，Escape 先释放文本焦点，再取消意图并关闭实际顶层窗口。打开、主键点击和焦点会置前；服务层与角色/背包共用堆叠上下文，删除拖动时强制降到 z35 的 CSS 覆盖。NPC/服务打开立即取消追击与持续移动，世界鼠标、地面拖放、技能和地图寻路入口也检查模态。死亡取消意图和服务等待；本角色收到权威 entityAlive 后隐藏死亡窗、恢复回城按钮和输入，其他角色复活保持本人的锁。顶层 Escape 的精确原版规则仍为 proposed。

**装备等待，UI-010/032：**取下装备增加 8 秒上限，取消/超时/关闭/失焦/切图/断线释放等待与计时器。请求和回复匹配槽位及服务端实例，当前实例匹配的权威成功即使迟到仍会生效；旧实例结果不移除新装备。超时仅解除交互锁。旧协议没有请求 ID，同实例连续重试的否定结果仍无法区分请求代数，保留缺口。

**此前实现的现存证据：**占格追击重试、冲撞/推退/回弹、火墙持续事件对应 GAME-012/013/015/054/122/127 和 ART-017/028，`world-events-live.json` 11 项真实原服检查通过，`frontend-events-final.log` 42 项前端回归通过；专项夹具累计 13 个测试账号/角色已清理。证明范围限于报告所列通道和条件，完整复刻验收仍待完成。

**地图补帧，ART-003/005/006/051：**新增 `scripts/import-national-map-assets.py`，默认只规划，显式 `--apply` 按 570 地图 manifest 依赖补导出并合并保留已有资源。三库 WIL/WIX 先做 SHA 硬锁校验，保存原索引/偏移/PNG 哈希/空帧/尾索引诊断，越界帧明确 unresolved，退出码 2。11 个专项回归检查源版本错误、合并保留、坏 PNG 修复、空帧/越界和部分范围不冒充完成。实际本机应用补齐 **9,839 个原始帧**，保留已有 4,635 个依赖帧，当前共 14,474/14,882 个依赖索引有图；408 个超范围 Tiles 仍未解决，报告 `national-map-import.json` 为 `complete:false`。旧 manifest 已在 `.runtime/backups/national-map-frames-20261001` 备份。

当前本机通道为 `5173/play.html` → 测试网关 `18801` → 原服；Vite 代理使用本机启动配置。最终执行结果与开放缺口在本批次验收记录继续追加。

## 2026-10-02 继续批次：真实地图门帧与门组

高阶装备资源按用户指示暂缓。本批从非装备地图/UI/玩法范围推进。调研文档 `docs/native-equipment-assets-research-2026-10-01.md` 的高阶装备转换目标是隔离 Windows 原客户端 `Data`；Web 的 Vite 静态根为 `assets/web`，两者不是同一素材投放路径。当前 `/ui-national/prguse`、`/ui-national/chrsel` 和对应PNG可由5173正常响应，Web运行时选择2003国服UI图库；这证明资源请求链存在，不能证明屏幕截图和同版原端外观一致。普通玩法界面已从可确认的国服像素资源继续接入：队伍 `Prguse#120`、行会 `#180`，交易采用并排的 `#389/#390`；交易格与按钮位置参照客户端源码，位置证据标记为布局提案，尚未与同版原端截图逐像素验收。

地图绘制此前把门开关画成绿色框/棕色叉，未读取地图格 `btDoorIndex`、`btDoorOffset`。现按12字节格记录解析门组号及开门位：使用原国服帧号偏移绘制开/关门资源帧，按参考客户端±10格范围同步门组图像与碰撞，并预载该邻域地图分块。新增回归覆盖两格门组开门/关门帧及通行切换。`node tests/map_loading_regression.mjs` 19组、`map_sources_regression.mjs` 12组、`map_assets_regression.mjs` 14组、`map_sentinel_regression.mjs` 5组及 `movement_collision_regression.mjs` 2组通过；TypeScript `--noEmit`、Vite生产构建和复制后UI帧PNG哈希对比通过。`tools/replication_audit.py` 195项结构审计通过，仍为5 implemented、185 partial、5 missing、0 verified。以上是模块/资源/构建验证，不是同版原端与实时浏览器像素对照；需求继续保持partial。其他玩法/UI与未完整接入的资源范围按台账继续推进；本批没有修改高阶装备。

**队伍/行会与交易原版画框：**此前 `#classic-window` 的强制样式会把所有窗口固定为 416×347 与 `Prguse#402`，覆盖 `ClassicHud` 按功能选择的帧；已改为从帧元数据设置背景和尺寸。队伍 `Prguse#120`（276×242）与行会 `#180`（628×453）保留服务端状态和全部操作。继续核对交易资源后发现 `#389`（236×175）和 `#390`（220×175）是原版并排窗；交易双窗已经接入，按 800×600 参考坐标恢复两边 5×2 格、金币与原生确认按钮，现有请求、放入/取回、设金币、确认和取消仍走原服务端命令。交易在 `tradeOpened` 后打开一次，远端报价更新只重绘，不抢焦点；关闭/ESC 发送取消并等待服务端结束状态。其网格/按钮摆位来自参考客户端 `FState.pas`，仍属于布局提案，尚未与同版原端截图逐像素对照。任务、目标、地面、系统、聊天仍用 `#402`，后续优先寻找这些普通界面的专属素材和玩法证据。地图方面，扩展前景引用已被哈希绑定候选库解析为 0 个未解析项，当前全图背景仍有 91 个未解析引用；视口预取和异步重绘合并已有针对性回归。

本批验证：完整 `test:web` Node 回归、`tests/test_ui_calibration.py`（10项）、TypeScript `--noEmit` 通过；不拷贝 736 MB 公共素材的 Vite 增量构建转换 762 个模块并成功（11.46秒）。本机 `5173` 上 `/play.html`、校准页、Prguse manifest 与交易帧389/390/391均返回 HTTP 200。构建和接口验证不能代替实时页面/原端视觉比对，相关需求继续保持 partial。

### 本批次验收记录

| 检查 | 结果与范围 | 本机报告 |
|---|---|---|
| 清单完整性 | 195 ID、三域 JSON/Markdown 一致，0 错误；完整复刻 verified 仍为 0 | `.runtime/reports/replication-audit.json` |
| TypeScript + Vite | noEmit 通过；完整复制 public 资源的生产构建通过（721 模块，5m54s）；复审补复活/CSS 后重新构建最新代码通过（12.77s），保留已复制资源 | `replication-tsc.log`、`replication-vite-full.log`、`replication-vite-final-code.log` |
| 前端 | **61 项通过**：既有38、世界事件4、输入/死亡/复活8、装备等待11；为 Node/VM 回归，未冒充真实浏览器 | `replication-{frontend_regression,world_events_regression,classic_input_regression,equipment_pending_regression}.log` |
| 新 Python 专项 | 追踪校验8、国服地图导入11，全部通过 | `replication-ledger-regression.log`、`replication-map-regression.log` |
| 完整 Python | **151 项，141通过、9失败、1错误**。失败名称与起始基线相同；地图依赖首个缺项从 D001/Tiles39 收敛至 GA0/Tiles10320。其余为版本/路线/候选资源/扩展图标及 Docker 缺失等已登记问题 | `replication-python-full.log` |
| 补导出和幂等性 | 补9839原帧；重复规划14474已有、0可新增、408 unresolved；仅GA0庄园受缺帧影响，其余569图三库依赖闭合。原装Map目录无GA0，继续追踪扩展来源 | `national-map-import.json`、`national-map-repeat-plan.json` |
| 本机资源可访问 | 三库 manifest、6个旧/新 PNG 的 HTTP/生产副本哈希匹配；play HTTP200、18801 ready。仅文件与 HTTP 检查 | `replication-http-assets.json` |
| 空白与格式 | `git diff --check` 通过；保留已有工作树，未提交或重置 | `replication-diff-check.log` |

以上报告除完整路径外均位于 `.runtime/reports/`。新增 public 文件时，当前 Vite 配置忽略资产监听，会保留启动时的文件名单。本次实际发现新 PNG 返回 HTML，重启本任务前端进程后已复测正确；未来补导出后需重启开发服务器再核对 PNG 哈希。网关/原服保持运行。

下批继续原生同 NPC 旧回复关联、资源审计契约迁移、原版服务格子/分页、全部技能/挖矿/特殊物品和逐项原端/浏览器验收。扩展图库来源和历史 Python/CoreRegression 问题仍保留开放状态。

## 2026-10-01 第二落地批次：会话、按键和持续状态

**NPC 展示与成交分离，UI-037/043、GAME-040–044：**生产 `NpcSession` 与网关 `NpcConversation` 共用 `npcSessionId + mapGeneration`。每次主动点击分配新身份，新图自动脚本显式使用0；关闭、死亡、断线立即隔离旧展示。过期的A商店/修理/仓库回复或关闭通知不会覆盖/关闭B，也不会因旧对象回复抛异常断开。报价、目录请求与成交保留原实例及旧身份，按原生消息类型串行消费；旧报价不能成为B的可成交报价。已成功的购买/出售/修理/存取即使窗口关闭仍应用权威背包、快捷物品栏和金币。任务标记在展示筛选前应用；NPC命令拒绝仅释放对应服务等待，不取消进行中的移动、物品或施法确认。767=SM_MENU_OK、772=SM_DLGMSG作为独立系统提示，关闭提示不会误关底下的商店。原生同NPC关闭重开后的旧回复仍缺nonce，保留关联缺口，不声称完整解决。

**技能快捷键，UI-026/010、GAME-045/051：**加入None/F1–F8草稿、确定/取消、失败与5秒等待；完整已学列表与固定8格快捷栏分开，取消未绑定技能自动填格。原服按键是0或ASCII49–56；CM1008在游戏线程原子清占槽并返回真实211完整快照，成功依据目标键一致且无占槽冲突，确认前旧键不变。网页`bindingId`匹配迟到错误/超时，服务端也有5秒上限及切图、死亡、技能删除释放；取消后迟到211仍为权威快照。改绑没有+GD，也不使用移动/攻击/施法确认槽。日志仅记录命令类型和阶段。成功、失败、八键、None、冲突解绑、紧接移动和正常重登由本机真实原服检查覆盖。

**持续状态，ART-023、GAME-053/106/131：**状态位0x00100000决定持续盾，国服Magic3890–3892为正常帧、3900–3902为受击帧，120ms/帧，保持原帧偏移、像素采样与层级。SM_STRUCK使用递增序号区分真正新受击和资源/状态刷新，重复受击能重新播放；撤销、死亡、销毁、迟到加载、旧移动队列不能复活旧效果。红/绿毒按参考源码优先级及平均亮度通道着色，保留透明度与武器层。DrawBlend mode1参考为screen，尚未完成原8-bit调色板最近色量化及同版画面对照，因此仍为partial。

| 检查 | 本批结果和范围 | `.runtime/reports/` 报告 |
|---|---|---|
| 生产代码/构建 | TypeScript noEmit；Vite722模块，最新代码构建通过，保留前批已复制原图；原服M2Server编译通过（4个既有warning）；网关本机.NET8兼容构建0 warning/error | `npc-skills-{tsc,vite,native-build,gateway-build}.log` |
| 生产前端回归 | **101组通过**：原38、世界事件4、输入8、装备11、NPC身份8、技能按键7、持续状态15、真实生产NPC回调10。为Node/VM及fake Pixi，未冒充浏览器 | `npc-skills-*_regression.log`，`npc-play-regression.log` |
| 生产网关边界 | 9组NPC与4组binding通过，实际5秒计时验证同值新请求不被旧timeout释放；另NpcConversation纯模块6组、MagicKey协议纯模块3组、既有GatewayRegression3组 | `npc-gateway-session-2026-10-01.log`、`npc-conversation-2026-10-01.log`、`skill-keys-gateway.log`、`npc-skills-gateway-regression.log` |
| 原服联机 | **51/51通过**，真实WebSocket→18801→原服；八键、占槽、None、7类拒绝、独立移动、A/B切换与关闭/旧代次拒绝、正常重登持久化。没有注入伪造原生ACK，也未替代真实浏览器 | `npc-skill-live.json`、`npc-skill-live.log` |
| 原图核对 | 六盾帧从锁定国服WIL实解码，PNG字节/哈希/几何偏移相同；红绿/层级/异步race另有生产模块回归 | `actor-status-native-assets.json`、`actor-status-regression.log` |
| 完整Python | **151项：141通过、9失败、1错误**；名称与前批基线相同，无新失败。GA0缺帧、扩展图标/路线/版本契约继续开放 | `npc-skills-python-full.log` |
| 夹具/运行恢复 | 清理清单4组，账号/角色/索引残留0；两次正常保存停服并验证备份，部署前141712及清理前143854备份；完成后原服ready，18801/5173保留运行 | `npc-skill-cleanup.json`、`npc-skill-cleanup-{stop,backup,start}.log`、`npc-skills-backup.log` |
| 清单/格式 | 195项JSON与Markdown一致，5 implemented、172 partial、18 missing、0 verified；diff检查通过；未提交/重置已有变更 | `npc-skills-replication-audit.json`、`npc-skills-diff-check.log` |

探针前三次失败也保留：第一次7001在原服重新启动期间拒连，第二次第二NPC回复超时，复查发现探针缺少原服严格大于1000ms的点击节流等待，第三次误用不在当前地图的供给/接引员名称。已按实际setting与综合商人脚本修正；`npc-skill-live-{first,second,third}-attempt.*`不作为成功证据。最终报告带当前源码与脚本SHA。4个现有NPC联机探针迁移到相同会话协议，源码语法及4组会话辅助回归通过；它们的完整业务没有在本批重新跑，旧报告保留历史范围。

本批汇总与源码/报告指纹见 `.runtime/reports/replication-npc-skills-batch.json`。

当前没有可调用的真实浏览器控制工具，本批不新增browser_runtime/native_runtime/visual_comparison完整关闭声明。继续追踪同NPC原生来源、原调色板量化、原版服务布局和全部技能/声音/字体/光照等细节，保持195项完整目标。

## 2026-10-01 第三落地批次：原版服务、矿区和索引色

**服务窗口，UI-010/033/038–043、GAME-041–044：**按原Prguse385的308×205菜单与392的140×181挂槽恢复生产组件，布局与热区集中在 `content/classic-176/service-ui.json`。买入/取回每页十行，目录分页步长9、成色请求步长10；单击/双击只选中，独立确定才查询成色或成交。出售/修理/存入使用单个挂槽，出售和修理先报价后确认。背包拿取与拖放仅选择当前权威实例，选择/取消不会删包；买入/取回窗口保留普通背包使用路径。权威背包变化先更新候选，剥离本地布局slot避免废弃合法报价，成交在途即使物品从包里移除仍等待原交易结果。累计仓库704页不取消取回；每次新NPC会话清旧展示。八个实际发送回调透传失败，八秒等待、关闭/失焦/取消和错误按操作阶段释放。652空成色页补请求商品名，typed旧询价错误不解除新成交锁。成色分页保留最近有效652回复的满页标志，购买删行后仍可翻下一页，短页/空页/返回目录/新会话正确重置，等待期间禁止重复分页；不新增自动回读或成交。绝对窗位、文字基线、额外返回/提示控件和同阶段无nonce归因继续登记缺口，详见 `docs/service-ui-reference-2026-10-01.md`。

**挖矿输入与协议，GAME-033、ART-018/023：**新增生产MiningController；可用Shape19矿锄、无鼠标目标、前格阻挡或Shift才进入原参考循环。等级、带符号速度和手重决定严格大于的节拍。矿意图仍占统一动作槽，先真实CM_TURN3010确认方向，再发CM_HEAVYHIT3015；移动、施法、NPC、Escape和失焦停止后续循环。死亡/切图立即拒绝旧矿意图，但旧原生ACK排空前不复用槽；五秒未知关闭旧连接重同步。原短`=DIG`仅投影碎屑，SM200才增加真实矿石实例与原始Dura；纯度按Delphi Round处理半值取偶。重击零基frame5（450ms、第6个可见帧）才触发八方向原Effect三帧和91.wav，碎屑时钟从冲击即开始，迟到资源只接当前有效帧，卡顿每tick只推进一帧；切图/销毁/加载失败有回收与重试。

**原索引调色板，ART-023：**从锁定Prguse取原色盘，23个角色/UI WIL色盘字节一致。红/绿/蓝/黄/紫/灰按参考整数平均亮度和1–255最近色索引生成LUT，生产GLSL/WGSL使用nearest并保持透明度、毒优先级和共享原贴图不变。LUT直接从JSON生成内存Texture，本批无新增public PNG。GPU实际编译、screen帧缓冲最近色量化与原端画面对照仍待验收。

| 检查 | 本批结果和范围 | `.runtime/reports/` 报告 |
|---|---|---|
| TypeScript / Vite | 最终分页修复后noEmit通过，730模块代码构建通过；保留第一批已完整复制的public资源 | `services-mining-build-final.json`、`services-mining-{tsc,vite}.log` |
| 前端回归 | **170组通过**：166组生产模块/AST/fake DOM/Pixi，另4组探针会话辅助；含22服务、12NPC接线、12跨窗拿取、4色盘、5矿控制器、8矿接线、9碎屑，不是浏览器实测 | `services-mining-web-tests.json`、`services-mining-*_regression.log` |
| 网关回归 | 9矿协议、9NPC+4binding、既有3协议组通过；八方向真实本机TCP读写与实际五秒timeout为模拟原生端证据 | `services-mining-gateway-mining.log`、`npc-gateway-service-details-2026-10-01.json`、`services-mining-gateway-regression.log` |
| 原服矿墙 / 移动 | 真实生产类与原D401地图9组通过：每MINE/MINE2图2720节点、墙矿/边界、4/12随机调用、SM200实例/纯度、满包、十分钟恢复、火墙共存；现有走/跑纠正与恢复专项通过。使用脚本随机/捕获网络，无DB/浏览器 | `services-mining-native-wall-{build,regression}.log`、`services-mining-native-movement-{build,regression}.log`、`native-mining-post-review.json` |
| 原资源 / HTTP | Effect24帧直接WIL解码与导出PNG字节/几何一致，91.wav原字节；全部25文件HTTP/源文件/dist哈希一致 | `mining-native-assets.json`、`services-mining-http-assets.json` |
| 碎屑独立复审 | 晚到200ms接第2帧、240ms仍第2帧、单次400ms卡顿仅第1帧，独立复现3/3通过 | `mining-effects-tail-review.json` |
| 原服联机 | **79/79通过**：注册3、真实商店购锄/装备9、矿区完整闭环67。最终22挥锄、10DIG、SM200矿石19273520/原始纯度4996，实际散落地格移动/拾取/SM611删除及正常重登均确认。真实WebSocket→18801→原服，不是浏览器实测 | `mining-live-{create,purchase,final}.json`、`mining-live-final.log` |
| 地物追踪 / 夹具 | 14组缓存去重/新增地物归因/真实D401路径/占格与边界通过；正常停服备份后清理单个隔离账号，账号/角色/索引残留0、私密口令已去除，原服ready且5173/18801 HTTP200 | `mining-ground-regression.log`、`mining-cleanup.json`、`services-mining-cleanup-{stop,backup,apply,start}.log`、`services-mining-runtime-final.json` |
| Python | **175项：165通过、9失败、1错误**，失败名称与前批相同；新矿夹具准备8+清理4专项归档通过。最终以PYTHONUTF8=1让子进程继承UTF-8，之前3个中文子进程解码错误单独保留 | `services-mining-python-full.log`、`services-mining-python-full-encoding-failure.log`、`mining-probe-fixtures-regression.log` |
| 复刻台账 / 格式 | UI-033和GAME-033 missing→partial；195项，5 implemented / 174 partial / 16 missing / 0 verified，台账0错误；37个已填证据SHA均匹配当前文件；git diff --check通过 | `services-mining-replication-audit.json`、`services-mining-evidence-hashes.json`、`services-mining-diff-check.json` |

真实矿探针先通过正常注册、商店购买与装备。首次完整采样240次获原服确认但0DIG/0矿，稳定暴露矿墙事件写读使用可走格过滤的原服缺陷；该失败单独保留在 `mining-live-before-wall-fix.json`，不得作为成功证据。原服仅为事件新增有界墙格取格，普通移动取格保持原样；挖矿墙/脚下事件采用类型检查，已有火墙时不重复堆石也不异常。启动矿线程原已存在，不新增初始化、不改4/12矿率与品质。独立复审核对11个相关原方法未变，新M2Server已正常停服备份后部署。修复后25次真实尝试收到15个DIG、SM200银矿实例18129916/原始纯度12035；丢弃接受，但原探针错误假定落在人物格而超时，实际地物落在邻格(26,26)。`mining-live-first-wall-fix.json`保留该部分通过/闭环未通过范围。恢复旧银矿时，另一对话因树妖/地物显示修复另行正常重启原服，旧地物随世界重载消失，`mining-ore-recovery.json`真实失败保留，不纳入成功统计。

探针现按本次新增地物ID、名称/外观与原散落范围匹配，复用真实地图BFS并逐步等移动确认，最终拾取还核对原SM200实例和纯度，避免用同名物品假冒成功。最终完整67项矿闭环使用合并后的运行M2Server SHA `7e0afb8903f05fad7b462f3d56f80539f8cc0c18ac0a90a203bc926bf6f9c776`；初次矿修复构建SHA33bac2e0…另有历史回执。当前五个实际DLL在独立staging中再跑矿专项9/9与现有移动专项通过，见 `services-mining-native-runtime-compat.log`、`services-mining-movement-runtime-compat.log`，没有回退并行修复。购买准备154211、矿位准备154334、墙修复部署160819、最终清理163041均正常停服后验证备份；`.runtime/backups/events-native-20261001-*.tar.gz`及对应准备/备份报告保留。当前测试夹具已清理，原服/网关/前端保留运行。

服务与挖矿的同版原端、真实浏览器和经济异常场景继续保留partial；满包、售矿、MINE2、矿脉耗尽/恢复、骑马及未投影的原客户端时序配置另有明确验收项。既有GA0超范围资源、版本/路线/扩展图标和CoreRegression缺失API继续开放。本批所有源码与回执指纹汇总到 `.runtime/reports/replication-services-mining-batch.json`。

## 重复执行与维护

```sh
python3 tools/replication_audit.py --json .runtime/reports/replication-audit.json
npm run test:web
python3 -m unittest discover -s tests -p 'test_*.py'
npm run build
git diff --check
```

本机缺少 npm 时使用配置的 Node 直接运行同一 TypeScript/Vite/回归脚本，注明适配方式。本机 .NET 8 兼容构建与项目 .NET 10 构建分别登记。真实浏览器工具不可调用时保留 `browser_runtime` 缺口。

旧 `docs/implementation-status.md` 的 2026-09-09 Python 96/96、地图全闭合数字保留为历史。本轮起始 Python 132 条基线仍有 9 失败/1 错误；CoreRegression 编译失败，引用缺失 ReduceDurability、IsSafeZonePosition 和 IsAggressiveMonsterRace。当前具体状态以新清单、最新报告与本批次记录为准。

## 2026-10-01 第四落地批次：战士近战、原聊天与声音

**战士实际攻击，GAME-021/107/112/125/126、ART-030：**原服在攻击准备标记消耗前快照最终模式，攻杀与烈火真实SM不再退成普通表现；半月低魔力先降级普通攻击。验证0–7方向后设置Dir再选目标，修复转向一击仍打旧方向。新增真实自身七类SM，旁观普通重击空正文改用header-only，挖矿DIG正文保持独立；参考客户端明确忽略自己的七类SM，同包原端运行兼容仍待验收。原伤害、随机和魔耗公式保持原逻辑。网关+LNG/+WID/+FIR只更新战士状态，施法继续等真实+GD/28排空，避免旧施法GOOD确认新攻击。详见协议和 `.runtime/reports/melee-source-freeze.json`。

**剑光与预测：**真实SM18/19/24/8使用原Magic800/1410/1700/3480八方向六帧，192帧逐文件从锁定WIL解码核对；半月仍用ActHit200人体，重击与大幅动作独立。剑光保留signed偏移、screen和盾层之后叠放。自身只预测普通人体，同actionId真实确认沿用已处理帧和frameAt，不以elapsed/floor追补过去帧；晚到素材只接当前有效帧，完成/死亡/不同请求不重播。零基frame2按武器shape/2播放原50–57，再按实际四专属播放男/女与技能声；预测到确认不重复武器声，过去冲击不补播。挖矿真实progress明确heavy并清旧fire预测身份，frame5矿碎屑/91.wav继续独立。原端时线、light2、远端msgMuch加速、真实GPU及screen调色板仍开放。

**聊天，UI-046、GAME-060：**生产控制器与真实页面接入原Enter/Space/@/!/私聊前缀、原消息三token姓名选择、五频道原字符串映射、IME/229、Escape/发送失败草稿恢复。原CM_SAY允许raw前缀，仍执行180GBK字节与控制字符校验；typed chatId仅区分网页草稿错误，不当原生投递ACK。A/B旧或缺失ID不会覆盖新草稿，say拒绝不释放世界动作。100条发送历史是明确Web增强，原Up/Down/Page滚动、聊天板热区、真实IME、禁言及队伍行会权限保留缺口。

**声音，ART-046/047/048：**登录log-in-long2、选角sellect-loop2原WAV循环与scene切换已接入；创建属于选角、进入地图停止旧背景声。独立voices按结束/失败回收，静音、死亡、换图和断线清理。首可信手势仅恢复当前BGM，不补播旧一次性声音；焦点/页面暂停为明确Web适配。断线销毁旧Actor和法术效果，阻止旧frame2/frame5重新发声；返回登录的samephase可恢复清掉的BGM；同voice playAttempt隔离旧Abort拒绝，避免已恢复音乐被旧失败停掉。原包544 WAV与public/dist全部字节相同，20用途/19文件按sound.lst与参考常量核验。目标原端混音、空间衰减、声像、独立音乐/效果选项及地图/结束BGM触发尚待，详见 `docs/audio-reference-2026-10-01.md`。

| 检查 | 本批结果与范围 | `.runtime/reports/` 证据 |
|---|---|---|
| 当前前端与构建 | **242组/21脚本PASS**；实际生产VM/AST/fakeDOM/Pixi/media，含聊天19+7、剑光19、近战接线8、声音12、整合生命周期6。TypeScript noEmit与Vite734模块最新代码构建通过，原public资源保留 | `melee-chat-audio-web-tests.json`、`melee-chat-audio-tsc-final.log`、`melee-chat-audio-vite-final.log` |
| 原服实际类 | 近战6组真实目标/七SM/原伤害/MP/拒绝；新增M2配实际运行的原4依赖DLL组合也通过6近战+9矿+1移动，属于隔离生产类单元证明 | `melee-native-regression.log`、`melee-native-runtime-binary-compat.log`、`melee-actual-runtime-compat.json` |
| 网关与协议 | 近战7、ChatSession.Run5；原NPC9/binding4、挖矿9和既有Gateway3兼容回归分别保存。生产网关本机net8兼容构建0警告/错误；默认net10生产SDK未在本机执行 | `melee-gateway-regression.log`、`chat-session-regression.log`、`melee-chat-audio-*-compat.log`、`melee-chat-audio-gateway-publish.log` |
| 素材/声音 | 192剑光原PNG/偏移/透明度全部相同；544 WAV三份一致，20映射；实际Vite HTTP与dist192 PNG+19 WAV共211项字节核对 | `melee-native-assets.json`、`audio-native-assets-2026-10-01.json`、`melee-chat-audio-resource-http.json` |
| 新Python专项与完整Python | 剑光7、音频9、夹具12专项PASS；完整**203项：193通过、9失败、1错误**。10个失败名称与前批相同，GA0/地图版本与路线/扩展图标/旧资源契约/Docker继续开放 | `melee-import-regression.log`、`native-audio-assets-unit-2026-10-01.log`、`melee-fixture-regression.log`、`melee-chat-audio-python-full.log` |
| 原服联机近战 | create-only6、run53、low-MP8，共**67/67**；真实18801→原服、原导师四技能/真实木剑/自身与旁观SM+GD/正常重登，低MP的GOOD仅接受输入，不虚构FIR成功 | `melee-live-{create-only,run,low-mp}.json` |

前端旧NPC测试缺新增audio接口的首轮失败已保留为 `melee-chat-audio-web-tests-first-attempt.json` 与 `melee-chat-audio-npc_play-first-attempt.log`，补模拟并强化死亡/换图清声后通过。既有Gateway fixture把+WID当动作完成的旧断言已补真实+GD，并新增重复状态与施法未确认前攻击拒绝/peer未发送的断言；保留首轮失败，最终3组通过，不以超时或等待冒充ACK。部署前正常保存停服，174812校验备份后仅调整两个新p命名空间战士的学习位置；175433再备份后仅令攻击者MP=0。只更新M2Server.dll为09a2902c…d436，其余实际GameSrv/OpenMir2/SystemModule/ScriptSystem保留，网关更新为c4e22fc2…7b97。

本批额外聊天原服检查、最终夹具清理与恢复结果在汇总回执继续登记。本机仍以5173/play.html→18801测试网关工作；未新增原端运行、真实浏览器操作或视觉/听音差分完整关闭声明，195项完整目标继续推进。

**聊天真实原服补验：** `chat-live.json` 37/37通过：附近双方SM40、raw私聊SM103、180GBK/中文边界、超长拒绝与chatId、非法/缺失ID不会伪回显、连续A/B拒绝身份，以及随后真实移动ACK。原服SayMsgMaxLen默认80按自身规则截断，Web接受180GBK不等于完整长文本送达；按实际SayMsgTime/ChatInterval较大值3200ms等待。喊话、队伍、行会、禁言/ignore/跨图权限及原端聊天板和真实浏览器IME仍待，37项不等于五频道全部关闭。近战67与聊天37合计104项联机检查，不包含浏览器音画验收。

**清理与恢复：** 正常保存停服，180343校验备份后按private清单只删除两个本批注册p命名空间账号及其角色/索引/所属行，查询残留0，清单口令字段已移除。清理后原服ready、18801 ready、5173/play.html HTTP200，新M2和网关继续运行。证据 `melee-cleanup.json`、`melee-cleanup-{stop,backup,start}.log`、`melee-cleanup-gateway-ready.json` 与 `melee-chat-audio-runtime-final.json`。本批汇总 `.runtime/reports/replication-melee-chat-audio-batch.json` 保留全部本批源码/报告SHA、历史失败和当前范围，不覆盖前三批回执。

学技证据使用已存在的原服测试目录导师脚本 `测试/技能导师-0.txt`，通过真实NPC会话执行原有warriorset教学与发放木剑；没有SQL插入技能或武器。这证明当前原服教学/装备消息链，目标2003正式技能书、入口和逐级训练仍在对应GAME缺口中，不能把测试导师当作目标原版NPC取证。

## 2026-10-01 第五落地批次：地图、源锁与资源目录

本批详情见 [资源与内容一致性](resource-consistency-2026-10-01.md)。当前生效国服源与68个Crystal参考候选分开锁定，必需源/导出始终验证SHA、原索引和signed偏移。7个参考CUR按独立锁核对原二进制，仍不等同原国服游标。真实审计检查39库的120484条导出帧记录，同源不同namespace分别检查，不把重复导出算作独立原图总数。

D718/D719接入profile及Web：572张地图、572个内存生成向导目标无缺失；定向写入两图10文件，原570个manifest保持原样，重复导出写入0文件。两图明确来自固定服务端扩展；出生点/邻近NPC/虎蛇/DAY是生成配置，实际运行配置和数据库未刷新。出生生成的兜底分支已修复地图子集过滤；毒蛇谷按实际区域服务定义及可走格/商人距离验证。

物品/技能目录保持1000/108目标，生效图标580/58。420物品缺项分为397越界/23占位，50技能缺项分为43越界/7占位；五个override和ID48冲突单独失败。只读DB确认群体施毒术/气功波两行冲突与种子SQL一致；回城石1001有声明脚本，仍不推断历史执行。研究目录两份独立锁匹配库已定位，可解码216个候选缺图物品，本批未导出或选择，因此生效覆盖数不变。生产技能页的占位/index−1回退迁移另列下一批。

| 检查 | 结果与范围 | `.runtime/reports/`回执 |
|---|---|---|
| 前端 | TypeScript/Vite通过；242组/21脚本模块回归通过，VM/fakeDOM/Pixi/media范围 | `resources-v5-{tsc,vite}.log`、`resources-v5-web-tests.json` |
| 完整Python | 257项，256通过、1失败；剩余为GA0/Tiles10320真实缺帧。旧错误改为准确版本/诊断契约，完整内容审计仍失败 | `resources-v5-python-full.log` |
| 新专项 | 生效源21、地图导出10、地图/路线8、资源目录/DB边界19通过；全套后Node版本预检补验8+备份2通过 | `resources-v5-active-assets-tests.*`、`map-extension-fifth-regression.log`、`map-route-fifth-regression-final.log`、`resource-catalog-unit-2026-10-01.log`、`resources-v5-install-node-final.log`、`resources-v5-backup-final.log` |
| 完整资源审计 | 实际CLI exit1/complete=false；源锁通过，但GA0 408、420/50缺图、ID48及五override继续开放 | `resources-v5-content-audit.{json,md,log}`、`resource-identity-db-2026-10-01.json` |
| HTTP/构建文件 | 两图10文件源/HTTP/dist字节相同；前端和18801 health HTTP200；未操作浏览器 | `resources-v5-http.json` |
| 运行边界 | 原服与18801网关持续运行；只重启自有Vite，原进程因忽略publicDir变化未识别新地图。新PID8956；当前17101/17201配置保持原样 | `resources-v5-runtime-final.json`、`resources-v5-vite-dev*.log` |

HTTP首轮真实失败和地图测试首轮读取诊断分别保留，不作成功证据。安装检查显式compose/native-windows并拒绝过旧Node；本机仍缺npm及stock net10工具，本机交付链未完成。三个台账仍195项、5 implemented/178 partial/12 missing/0 verified；原端/浏览器/GPU/逐像素/听音比较继续开放。当前源码和回执指纹见 `replication-resources-v5-batch.json`。

## 2026-10-01 第六落地批次：原图标规则、恢复与切图事务

本批详情见 [原客户端图标规则与加载恢复](icon-source-usage-2026-10-01.md) 与 [技能图标来源](skill-icon-reference-2026-10-01.md)。原参考明确物品按Looks选择Items/stateitem/DnItems对应图库；技能按Effect×2/+1选择正常/按下帧。生产所有对应入口共用精确选帧，不再使用名称、ID或相邻帧替代。旧40名称和2通用回退保留为未选拟议映射。当前401物品/45技能有图，599/63缺项与MagID48冲突继续追踪；第五批580/58为当时错误映射统计，历史报告保留。

失败Promise可重新请求，PNG重试采用新代数并隔离旧回调；失败提示不改变实例、拿取、服务报价、金币、选技或绑定/施法等待。技能按下/拖出/松开按参考按钮语义恢复。生产切图请求、chunk/texture提交与play的worldReady增加代数/socket/目标护栏，避免旧加载覆盖新场景。

GA0的408张参考地砖已锁源并独立逐像素导出，19专项通过、重复导出0写入，4284现国服/GA0文件SHA不变。候选共有125索引中的9/14与国服不同，历史配对未核，mapBindingActive保持false；当前完整审计仍按GA0生产408缺帧失败。后续接入按map/layer/index选择同一源，不扩大为其他地图或原版像素完成。

本批TypeScript/Vite通过；前端324组/27脚本通过；完整Python279项/278通过、GA0既有1失败；实际内容CLI exit1/complete=false。HTTP421文件源/dist一致，5173与18801 ready。仅自有Vite重启为PID14700，原服服务/运行DLL/配置与数据库未改。195项仍5 implemented/178 partial/12 missing/0 verified，后续原端、浏览器、GPU及视觉比较逐条保留。回执前缀icons-v6，最终汇总 `replication-icons-v6-batch.json`，不覆盖旧批次回执。

## 2026-10-01 第七落地批次：地图来源选择与全量版本边界

本批详见 [地图来源选择](map-asset-selection-2026-10-01.md) 与 [全量版本边界](classic-version-boundary-2026-10-01.md)。固定GA0的408个background/Tiles原索引选择锁定参考源，125个原national索引及9/14保留；其他地图/图层/索引保持原选择。管理目录将当前enabled与第六批export快照分开，继续显示原版配对待核。

source/9chunk/raw pixels审计通过；current render规范依赖为空缺，原national408与历史配对独立失败。补审又发现54个高范围raw引用，按固定GA0的参考WIL越界nil路径跳过并单独计数、保留碰撞flag；原参考没有通用<0x7f00绘制规则，其他地图与中层常规解码/原端执行仍待核。

1000物品/108技能逐行梳理项目支持、明确参考扩展声明和未分类证据。1–33输入与15条锁参数是子集；年代unknown与未解析入口继续保留，不按名称、缺图或ID排除内容。599物品/63技能缺图与48冲突继续开放。

完整Python首轮发现调色板导出读取mutable原端运行目录；另一路装备工作已将该目录junction切到扩展副本。默认导出和重建测试改从active契约nationalData读取，显式错误源与全部22文件SHA锁继续拒绝不匹配，bundled LUT不变。详见 [调色板资源目录](actor-palette-source-path-2026-10-01.md)，本批未部署或还原该overlay。

最终TypeScript/Vite通过；前端352组/30脚本通过；修复后完整Python339/339通过，内容CLI仍exit1/complete=false。HTTP1454文件一致，5173/18801实际readiness另记；本批未改原服/网关/配置/数据库。195项状态不变，浏览器/原端/GPU/像素/听音与全部适用异常验收持续追踪。汇总 `replication-map-v7-batch.json`；旧回执及本批初始类型/目录失败不覆盖。

后续系统确认、改密与退出的来源已整理为 [认证与系统动作审查](auth-system-actions-source-review-2026-10-01.md)。先复用现有模态与输入模块补 UI-061；Enter/Escape 按原参考按钮组合处理。改密错误码、退出连接生命周期与原帧布局版本差异分别保留，不凭参考坐标直接升级为同版复刻完成。该文档为后续实现准备，UI-015/058/061 状态尚未提升。

## 第八落地批次：统一系统确认与独立改密

详见 [系统与认证实现](system-auth-implementation-2026-10-01.md)、[原素材与参考边界](system-auth-assets-reference-2026-10-01.md) 和 [退出/存档源审查](logout-session-source-review-2026-10-01.md)。UI-015/061由missing提升为partial，UI-058继续missing。195稳定ID现5 implemented/180 partial/10 missing/0 verified。

生产和校准共用三种国服系统框及四种明确结果。唯一OK/Yes Enter、Cancel Escape、焦点/IME、queue/replace/interrupted、未来世界意图取消而在途权威保留；767/772保留NPC/经济底层，选角Exit确认隔离旧socket。修正integer div的奇数高度一像素偏差、合同字体/14行距及精确frame文件/offset；模态层优先级不受普通窗口重复置前影响。全场景迁移/原端/浏览器关闭仍待验。

改密以原50底图/53入口和四字段接入；54/65不是53/64按下帧，拟合热区与缺状态明确未知。独立WS/TCP等待新连接5.1秒、CM2003/506/507、严格GBK、关联身份、取消/超时结果未确认及口令清理。真实联机只验证未知账号507/0和数据库前后0，未注册/改账号；506成功与旧失败新登录仍需停服备份、隔离夹具和清理专项。

最终前端33脚本420实际组、TSC/Vite通过；完整Python358/358。网关全量NET8兼容publish及实际GatewayRegression3组、改密TCP/Run15组通过，正式net10声明不变。仅自有18801测试网关切换13716→14992，旧publish保留；原服6DLL/配置/数据库不改。HTTP PNG/manifest源/服务/dist一致，未操作浏览器。当前源码/回执以replication-system-v8-batch.json为汇总，早期失败/阶段指纹保留。

下一批先补原服保存失败ACK/队列/cache边界回归，再实现F12/角色小退的独立game/selection生命周期、ticket与epoch；不可用当前ACK或缓存重登宣称持久保存。全部美术、技能、经济和社会玩法未关闭项继续按总台账推进。

## 2026-10-02 第九落地批次：保存确认、事务行与会话顺序

本批详见 [角色保存与会话顺序](save-confirmation-implementation-2026-10-02.md)。实际1102/1才完成保存，1100/0、false、异常和5秒未知各有明确边界；队列按queryId关联、同角色不越过、快照冻结、断线保留与TCP重连。缓存只在存储确认后发布，失败/提交未知绕过旧缓存。包对象独立、会话列表统一锁，account→character操作顺序使同账号换角色和加载失败释放不会与在途保存清理冲突。

MySQL子保存失败向外传播；主/必需行核身份并锁定，合法零变化保留，缺bonus及非空物品栏完整恢复，附加属性同事务保存。最终39组消息链、23组队列、213组存储类故障与72组真实隔离SQL通过；独占schema清理。Python364/364，既有移动/近战/挖矿/掉落四入口重编译运行通过；旧Core编译仍因既有缺失生产逻辑失败，恢复方案单独保留。前端60输入/33脚本/日志与第八批字节一致，复用420组结果，不宣称本批重新执行。

本批保存改动保持staging，未停原服/部署/操作生产账号。运行M2与进程的外部变化单独登记，不回滚。UI-058仍missing，其余状态不提升；195项保持5 implemented/180 partial/10 missing/0 verified。下一阶段补正常排空/stop边界，再接F12、独立game/selection代际、票据、真实选角重入和持久数据核对；原端/浏览器/视觉与完整玩法继续追踪。最终指纹 `replication-save-v9-batch.json`，旧失败与所有历史批次保留。

## 2026-10-02 第十落地批次：设置、退出与正常停止

详见 [网页设置与退出](logout-settings-implementation-2026-10-02.md) 和 [退出会话、停止及基础逻辑](shutdown-core-implementation-2026-10-02.md)。普通F12按参考切总声，Web设置接入音量、地图/聊天显示及持久偏好；六个国服设置/退出帧精确锁定，设置用途和布局为proposed。确认取消、接受前权威保留/拒绝恢复、接受后退役、相关小退选角和大退回登录统一实现；删除一秒即保存的旧回城假设。

网关每次认证/人物/退出均隔离代次，CM1009→旧reader/EOF→新CM100/SM520使用独立连接。旧计时器、半包和finally不污染新角色，新认证未选角也拒旧退出缓存；真实private TCP/Run八入口69实际组通过，排除两个summary PASS，失败总报告保留并逐入口登记最终结果。

原服正常停止实现准入/producer join、真实载入初始化、交易先退款后最终快照、对应ACK及未知/失败/取消/retry屏障。修复两ready load索引/terminal缓存、普通控制台保存与冻结的并发顺序；未实现金币队列不假排空，关闭准入后拒新world gold并释放入口锁。24组/16独立场景及当前NativeSaveQueue23组通过，938输入fresh构建前后冻结。装备四处饱和持久、天然怪物保护/出生/复活及避火判定已接生产路径，49专项、原Core、AI29通过；天然安全政策不能当同版国服事实。两类native产物分别锁其实际DLL组，未由本批部署。

网页35脚本、455 PASS标记、TSC/Vite通过；当前完整Python366/366，台账后续仅两文件变化另跑针对性审计。UI-058由missing到partial，其他状态保留：195项为5 implemented/181 partial/9 missing/0 verified。本机18801切到新测试网关并验证健康/未认证WS；6PNG+清单源/HTTP/dist一致。原服进程及三DLL外部变化只记观察身份，不归本批。无生产账号/SQL写入、无浏览器/GPU/听音/原端截图证明。

最终新档案 `replication-logout-shutdown-v10-batch.json` 保留第九131、第八166、第七124份closed报告、源契约及继续写入的日志历史前缀。完整复刻仍开放；后续优先召唤物Master WalkTo既有坐标差异、Planes/后台连接全生命周期、耐久保存日志/进程丢失恢复、实际退出重登持久核对，再按稳定台账推进完整UI/美术/技能/经济/社交和同版浏览器验收。


## 2026-10-02 第十一落地批次：召唤物让路与 HUD 等级

修正Master WalkTo横坐标误写零导致的主人前方占位及x=0误拦截，实际20组通过；当前policy49、AI29和原Core入口通过。HUD显式等级字段移到参考Lv区域，延迟加载/升级/退出/换角4组通过，36网页脚本459 PASS标记及TSC/Vite通过。195台账状态保持5 implemented/181 partial/9 missing/0 verified；原服未部署，原端/浏览器/像素与完整玩法仍开放。见 [本批实现与验收边界](summon-hud-implementation-2026-10-02.md)，最终档案使用 `replication-follow-hud-v11-batch.json`，第十批主题和历史closed报告保留。

## 2026-10-02 第十二批 HUD 状态与增量同步

按参考源码补齐27/28级战士血球切换、分球裁切、原纹理经验/负重条、nearest-even取整；受击和负重消息立即同步HUD/人物窗口。昼夜46保留phase/darkLevel，饱食708使用原帧，纠正数值高却写成“饥荒”的反向文字。校准页共用生产组件，新增职业/等级、资源比例、饱食及昼夜控件。昼夜父原点、同版字体/热区与真实浏览器仍待核对。

当前网页39脚本480 PASS标记、TSC/Vite，网关8入口71实际组，原服食物分支6组通过；各自142/39/966输入前后稳定。13PNG源/HTTP/dist一致，实际5173/ws连接新18801；Vite原进程保留，原服及数据库没有由本批部署或写入。完整Python366/366与台账审计通过；最终源/回执指纹见`replication-hud-state-v12-batch.json`。195项仍5 implemented/181 partial/9 missing/0 verified，UI-021/UI-022/GAME-024/GAME-035保留partial。详见[本批实现和未闭合范围](hud-state-implementation-2026-10-02.md)；完整UI、美术、技能、经济、社交和原端/浏览器验收继续推进。

## 2026-10-02 第十三批场景调色与原始灯光

默认self死亡调色已接整个生产世界舞台，保留HUD/窗口颜色并在复活、切图/退出清理；背景对齐黑色。角色光值、654与51/634地图暗度按原字段保留。六个原lig0*.dat及npal逐字节可重建导入，三个暗度表196608项独立重算一致；参考末尾强制免蜡的版本差异明确保留，生产夜景仍未绘制。新增[场景校准页](http://127.0.0.1:5173/scene-calibration.html)共用生产地图/人物/调色组件，并显示经过整文件SHA校验的原遮罩诊断。

41网页脚本488PASS标记、TSC/Vite通过；8网关入口73实际组通过；导入Python专项11项，8数据/清单源HTTP/dist一致，6页面/模块可取且实际5173/ws通新18801。完整Python377/377通过，288输入前后稳定；最终源/产物/回执指纹见`replication-scene-v13-batch.json`。原服/数据库未部署或写入，Vite14700保留；18801在0活跃客户时更新到PID12516。195项为5implemented/183partial/7missing/0verified，ART-009/010转partial，全部原端/浏览器/GPU、夜景/天气/光源与死亡完整流程继续开放。详见[本批实现与来源](scene-lighting-death-implementation-2026-10-02.md)。

## 2026-10-02 第十四批选角删除与确认闭环

选角新增国服原帧70删除按钮，开始/新建/删除/退出按参考SetImgIndex图尺寸和坐标布局。三选确认后只发送一次CM102，SM523/524后均重新查询SM520；ACK成功但角色仍在时提示未确认删除，坏包/超时/断线不伪造回滚、不自动重发，返回登录核对列表。星号保留为selected，角色白名单刷新原子发布。制作群参考回调为空且入口初始化被注释，保留目标版待确认。

42网页脚本497PASS标记、TSC/Vite及9网关入口80实际组通过；删除专项7组真实privateTCP/Run，离线校准4个AST结果分支通过。5原图/清单源HTTP/dist一致，6当前页面/模块可取；新网关已独立publish/HTTP/WS验证，18801因仍有连接保留PID12516上一版，新删除能力未由现有网关启用。UI-018从missing到partial，195项为5implemented/184partial/6missing/0verified。完整Python384/384通过，290个输入前后稳定，结果记录在`selection-v14-python.json`；原服/SQL/真实角色未修改。详见[实现与未关闭范围](selection-delete-implementation-2026-10-02.md)，最终指纹使用`replication-selection-v14-batch.json`。

## 2026-10-02 第十四批测试网关运行补充

此前封存后，18801连接释放，护栏确认0活跃连接再切换PID12516→17432，Vite14700保留。新网关已通过实际5173/ws证明characterDeletion=true、未登录删除requestId相关拒绝、退出拒绝与正常关闭；5原图/清单源HTTP/dist一致。原服/SQL/生产角色未操作，真实隔离删除及同版验收仍待完成。代码与测试输入不变，复用此前42网页脚本497标记/80网关实际组/384Python/4校准分支。详见[运行补充](selection-delete-runtime-2026-10-02.md)，最新档案为`replication-selection-live-v14-batch.json`；先前staging记录为其封存时点，不覆盖历史。

## 2026-10-02 第十五批原服删除确认

修复原服账号不匹配/等级受限仍回成功、等级缺读当0级及MySQL更新零命中仍回成功。删除保留原等级上限、软删除与姓名数据；读取/更新异常有明确失败回执，不提前修改共享记录。26组实际方法/生产TCP回执、8组真实独占MySQL存储和重载测试通过；隔离schema已确认清理，生产账号/行未操作，原服运行DLL未替换。既有存档确认39组/保存类213组通过，网页/网关输入不变时复用上批证据。UI-018仍partial，完整195项仍5implemented/184partial/6missing/0verified。详见[修复与验收边界](selection-delete-native-implementation-2026-10-02.md)；本批Python与最终档案另行补充。

第十五批封存补充：完整Python384/384通过，290个输入稳定；当前接受原服26/39/213组及真实隔离SQL8组均在最后源码上重新执行。实际5173/ws能力/关联拒绝通过，网关17432/Vite14700未重启。上批网页/网关/校准输入153/42/7个逐字节核实后复用；原服未部署，生产角色未修改。最终源/回执/验证产物见 `replication-selection-native-v15-batch.json`，完整复刻仍开放。

## 2026-10-02 第十六批：活动对象占格的移动恢复

网页点击路径现在在动态对象占格时停在可达邻格；收到服务端碰撞拒绝后，已知活动对象占格不会被误当作门而发送openDoor。最近被服务端拒绝的格子短暂避让1.5秒；继续中的点击路线立即重算，无可达路线时停止尝试。服务端位置及碰撞权威未改变。TypeScript noEmit、生产Vite构建通过，产物写入任务预览目录。首轮构建缺GridPoint类型导入失败，修复后重跑成功。没有真实浏览器键鼠、原端同场景和移动实体竞争时间线证据，GAME-012/013继续partial。详见[movement collision实现边界](movement-collision-implementation-2026-10-02.md)，报告`.runtime/reports/gameplay-v16-final-build.json`。

## 2026-10-02 第十七批：跑步途中格碰撞与门判定

已按服务端回执语义拆分跑步段：`actionResult.x/y` 只是权威回滚位置，客户端按方向回溯尝试经过的每个格；按先遇到的活动对象/地形阻挡恢复，开门请求定位到实际不可通行格，未知对象延迟到达时短暂避开整段并重规划。最终43条Web回归、Python384/384、TypeScript noEmit和Vite生产代码包均通过；最终增量包关闭静态publicDir复制，之前的完整静态资源包保持单独记录。没有生产浏览器和同版原端动态时序证据，GAME-012/013维持partial。实现、证据路径及下轮重放场景列于[movement collision实现边界](movement-collision-implementation-2026-10-02.md)。

## 2026-10-02 第十八批：阻挡对象离格后的路线恢复

怪物占格拒绝会暂存被拒绝的行走格，便于避开状态消息晚到的对象。现在服务器确认阻挡对象离格、死亡或移除且格内无其他活对象后，立即解除普通路线及追击路线的临时避让；若同格仍有另一活对象则保留。身份未知时1500ms兜底不变，客户端坐标仍只取服务端确认。生产`play.ts`实体更新、死亡与移除回归覆盖了迟到对象、同格对象与超时边界。`test:web` 44脚本、TypeScript noEmit、Vite生产构建及Python386/386通过；GAME-012/013仍待真实浏览器和同版原端时序回放，报告见[movement collision实现边界](movement-collision-implementation-2026-10-02.md)。

## 2026-10-02 第二十批：网关目标运行时验证

本地.NET SDK 10.0.401已安装在忽略目录，WebGateway net10.0 Release构建通过；隔离端口18802的健康路由与5173来源WebSocket问候测试通过。当前18801仍由旧.NET 8进程提供且健康；执行策略拒绝停止该进程，连接复查曾在0与1个客户端之间变化、最终为0，因此保留原服务，未做同端口替换。没有登录/游戏/存档或浏览器视觉验收，复刻台账保持195项、5 implemented / 185 partial / 5 missing / 0 verified。具体构建指纹、冒烟结果与限制见[网关运行冒烟记录](web-gateway-runtime-2026-10-02.md)。

## 2026-10-02 第二十一批：地图对象分库与美术来源核查

地图实际读取 `TMapInfo.btArea` 选择 `Objects.wil` 至 `Objects7.wil`，Web 原先却把前景引用全部送到 `Objects.wil`；同时背景/中层混画，静态大物件的遮挡层判断过宽。本批按原客户端规则接入区域分库和前景绘制顺序，并从哈希锁定的 2003 安装导入 44,487 个依赖帧，覆盖 519 张含扩展对象库引用的地图。实现、全量依赖统计与剩余缺口见[地图对象分库修复](map-object-bank-implementation-2026-10-02.md)。`Objects8`–`Objects15` 源文件未在锁定安装中，另有 713 个 `Objects3` 越界引用和 85,176 个缺库引用保持明确缺失，不用错误的 `Objects` 帧顶替。

普通 UI 的素材来源已确认与高阶装备调研分离：Web profile 锁定 `shanda-2003-1.76-cn`，资源从 `assets/web/ui-national` 读取。安装缺少 `NewopUI`、`ui1`、`ui3`、`Prguse3`；目前任务、目标、地面、系统、聊天等窗口仍使用通用 `Prguse#402`，组队、行会和交易已分别改用国服 `#120`、`#180`、`#389/#390` 帧。剩余窗口必须按目标版独立素材和截图继续复刻，不能用相邻帧或高阶装备候选库冒充；完整玩法状态仍需逐项补齐。高阶装备按用户指示暂缓。

本批最终地图资产/来源、Pixi地图来源、切图加载、GA0越界及 TypeScript 回归均通过；无本机 Browser 控制工具可用，未做真实浏览器截图或与原客户端的视觉差分。地图/界面同版运行验收继续开放。

## 2026-10-02 第二十二批：地图动画计数按原端50ms节拍

`PlayScn.pas` 以50ms增加共享动画计数，Web 原100ms节拍已校准；按MAP `btAniTick+1` 停留帧，页面绘制延迟时不从墙钟补跳多个帧。地图来源14组、地图加载/门组19组、TypeScript和Vite代码产物通过。5173源模块及地图63候选资源可取；静态资产不重复复制。全图仍有23张地图、91条背景引用找不到非空图片；没有浏览器截图/原客户端GPU逐帧差分，故ART-007保持partial。详见[地图动画节拍实现](map-animation-cadence-implementation-2026-10-02.md)和 `.runtime/reports/map-animation-cadence-2026-10-02.json`。高阶装备仍不纳入本批。

## 2026-10-02 第二十三批：地图高位前景双绘制与帧偏移

原端高位混合帧并非只画一次：48×32前景帧先画普通底图，再由第二遍以帧自身偏移加色绘制；此前Web只对2723–2732套偏移，并漏掉其余偏移和部分普通底图。现已修正双层合成、每帧偏移和按周期需要分配底图。全量572图审计发现2,326条高位前景引用跨253张图，旧位置与原端公式不符的有1,559条，17条48×32帧需要双份绘制。地图来源16组、加载19组、TypeScript/Vite构建通过；同版原端/浏览器截图对比仍未完成，ART-007保持partial。高阶装备不在本批范围。详见[实现记录](map-additive-composition-implementation-2026-10-02.md)和 `.runtime/reports/map-additive-composition-2026-10-02.json`。

## 2026-10-02 第二十四批：普通交易玩法接入国服原版双窗

高阶装备素材研究与Web界面资源目录互不相干；这里继续按用户关注点处理普通玩法/UI。将交易窗从通用 `Prguse#402` 改为国服交易窗 `#389`（本方236×175）与 `#390`（对方220×175）并排；用现有的物品帧来源显示交易格中的物品，保留发起交易、背包Shift放入、取回、设金币、确认与取消等原命令。报价刷新只更新内容；服务端 `tradeOpened` 时才自动打开；关闭位和Escape发送取消请求，只有收到交易结束结果后才收窗。格子和确认按钮坐标依据参考客户端源码，属于提案布局，尚未在同版原端截图上逐像素验收。组队与行会分别沿用上一批的 `#120/#180`；任务、目标、地面、系统、聊天仍待独立素材，不用相邻帧假冒。

完整 `test:web`、10项 `tests/test_ui_calibration.py`、TypeScript `--noEmit` 及保留已有公共资源目录的Vite增量构建通过（762模块）；`5173` 上播放页、校准页、交易帧389/390/391均HTTP 200。当前会话没有可用的浏览器截图控制接口，未声称完成真实浏览器画面对比；游戏内服务端完整交易往返仍需实际联机验收。

同日继续补齐交易玩法状态：背包/取回物品或设置金币收到服务器回包前，禁止并发报价修改和确认；12秒是本地状态提示阈值（非原服协议），触发时只提示“状态未确认”，保留锁定并允许取消，防止本地擅自解锁或重发；本方确认后冻结报价，服务器同样拒绝在途确认及确认后改价。邀请回应超时允许重新发起。生产 `renderTrade()` 状态回归、全部 `test:web`、TypeScript 与 Vite 构建通过；当前机器无 .NET SDK，网关源码修改未编译，也没有双账号交易/保存证明。高阶装备候选库仍不属于 Web 复刻入口；后续优先继续普通 UI、任务、战斗与社交玩法的闭环验收。

## 2026-10-07 补验：Windows 原端装备资源与 Web 美术链路

用户给出的 [Windows 原客户端高阶装备与美术资源调研](native-equipment-assets-research-2026-10-01.md) 把转换产物写入 `.runtime/native-equipment-data`，供本机 Windows 客户端的 WIL/WIX 使用；文档明确未改 Web 素材契约。这条链不会更新网页 UI，也不会改变 Web 的装备/怪物/特效贴图。高阶装备按用户指示暂缓。

当前 Vite `publicDir` 指向仓库 `assets/web`。对运行中的 `127.0.0.1:5173` 实测，`/ui-national/prguse/library.json`、`/ui-national/chrsel/library.json`、`/ui-national/prguse/402.2b8c83a121142363.png` 均返回 HTTP 200；页面、`play.ts` 与 `style.css` 也均返回 200。这只证明 Web 当前国服 UI 资源请求链通了，不能证明浏览器屏幕已切换到某套新图或与同版原端一致。原端 overlay 和 Crystal 候选不会自动进 `assets/web`；其余非装备美术须按来源哈希、Web 导出、manifest/帧契约和实际消费者逐项接入。

同批完成游戏内断线提示/取消重连、认证阶段超时恢复与焦点控件键盘路由；全量 `test:web` 49/49、TypeScript `--noEmit` 和标准全量 Vite 构建通过，构建产物包含默认静态资源。当前环境没有可用的本机浏览器截图控制接口，尚未做真实页面视觉、焦点和原端同场景差分；UI-007/UI-020/UI-060 继续保持 `partial`。


## 2026-10-07 继续批次：聊天颜色与交易格拖放

**UI-045 聊天颜色：**依据参考 `ClMain.pas` 392–398、4324–4343 与 `FState.pas` 3693–3704，Web 网关现分别传递协议前景/背景字节，客户端按锁定的国服 Prguse 256 项调色板映射，并只在消息文字范围绘制；系统消息同样使用原色值。清单仍为 `partial`，各频道实际颜色与同版截图、字体/行高及浏览器滚动外观尚未视觉核验。

**UI-033/056 交易拖放：**生产 `renderTrade` 给本方全部十个格绑定拖放入口。空格和已占用格拖放都调用新增报价流程；占用格拖放不误发取回，不会让包裹同一物品兼作在途报价，并受当前报价锁保护。这里补的是已识别的交易格落点；全窗口拿取/放置统一语义仍未完成。

**验证：**`test:web` 51 个 Node 回归脚本通过；TypeScript `--noEmit`、复制清单审计、网关合同/复制清单 20 个 Python 测试通过。Vite 使用 `publicDir:false`、关闭压缩的代码打包检查转换 766 个模块并成功；完整公共资源复制构建未由这项检查覆盖。本机 `5173/play.html` 与 `5173/src/play.ts` 均返回 HTTP 200。无浏览器截图或同版运行录像，本批不声称像素验收。

## 2026-10-07 继续批次：附近玩家交易入口

**UI-055：**附近目标列表为真实玩家行增加“邀请交易”操作；目标相邻时启用，点击用当前服务端投影中的角色名提交，非玩家/召唤物不显示，等待请求回包期间禁用。离开相邻范围或目标实体过期时，生产处理器会再次核对，避免沿用旧目标发起请求。现有手动名称入口保留。参考 `FState.pas` 的 `DBotTradeClick` 会节流后调用 `SendDealTry`；当前服务端 `ClientDealTry` 还会再次核验同地图、相邻距离和双方允许交易状态，因此前端限制只改善交互，不替代服务端校验。

**验证边界：**新增生产函数回归覆盖相邻/非相邻、权威姓名、怪物/召唤物排除、陈旧目标和在途锁；完整 `test:web` 51/51 脚本、TypeScript `--noEmit`、复制清单/网关合同 20 项测试通过，本批相关文件差异检查（`cr-at-eol`）通过，运行中 Vite 的播放页、`play.ts` 与样式均 HTTP 200。还没有双会话邀请/拒绝、离线/忙/死亡实服验证，也未找到足以还原原端 AllowDeal 控件和外观的同版证据；没有本轮浏览器截图，因此 UI-055 保持 `partial`。


## 2026-10-07 继续批次：组队操作确认

**UI-052：**按参考 `FState.pas` 中的 `DGrpCreateClick`、`DGrpAddMemClick`、`DGrpDelMemClick` 行为，队伍窗不再常驻网页姓名输入框。创建、邀请、移除分别打开默认尺寸国服 `DMessageDlg` 对应的共享文本输入对话框，复用原端三条中文提示和确定/取消控件；输入姓名最多10字，只有确定且非空时才发送。输入期间锁定队伍操作，地图变化、死亡、队伍解散或断线使待处理输入回调失效。操作回包继续以服务端结果为准。原端另有5秒本地冷却，Web保留回包单飞锁；目标版冷却、队长权限和成员绘制顺序仍待双会话/同版取证。

**验证：**`tests/group_actions_regression.mjs` 10组通过，覆盖三条原始提示、文本裁剪、确定/取消、空输入/旧场景不提交、待处理锁与权威结果；`tests/native_social_windows_regression.mjs` 确认网页专属常驻输入已移除。完整 `test:web` 51/51 脚本、TypeScript `--noEmit`、复制清单/网关合同 20 项测试通过。播放页与 `play.ts`、样式由运行中的 Vite 返回 HTTP 200。回归使用生产函数、fake DOM/transport；Edge headless 另在校准页实测 Prguse#120 与共享输入弹窗的显示及确认，截图和报告见 `.runtime/reports/ui-group-interaction-qa-2026-10-07.json`。浏览器步骤只改离线夹具；真实双账号联机和同版原端像素对照仍未完成。
