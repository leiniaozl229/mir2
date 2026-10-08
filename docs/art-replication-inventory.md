# 国服 Web 客户端美术、声音与动态细节清单

审计日期：2026-10-02。目标保持 **2003 国服原始 1.76、800×600 客户端的完整细节**。本文件把素材原像素、显示用途、动画、声音、文字和交互视觉列成可验收需求；没有把当前 P0 内容或已实现的功能缩成最终目标。UI 操作与玩法结果由相邻领域清单追踪，本文件要求同一状态也有对应的原版外观与时序。

机器底稿为 [replication/art.json](replication/art.json)，使用稳定 `ART-001`–`ART-051`。当前台账（2026-10-02）为 **51 项：46 partial、3 implemented、2 missing、0 verified**。`implemented` 表示主要代码和针对性回归已落地，仍须完成列出的原端与浏览器验收；只有要求的全部证据齐备才能升级 `verified`。不要通过删除需求或把未知行为改成已支持的较小范围关闭条目。此处数量是本轮检查时的快照，后续实施应在条目与追加记录中登记，不覆盖本轮缺口证据。

## 1. 来源与证据边界

| 证据 | 本次可确认的内容 | 不能据此确认的内容 |
| --- | --- | --- |
| 国服原像素 `native_pixels` | 本机原安装 WIL/WIX 的索引、像素、透明度、几何、signed 偏移；原装 WAV/Map 的文件内容与 hash | 控件用途、热区、默认显示、方向/动作节拍、混合算法、完整玩法 |
| 国服原端运行 `native_runtime` | 同版可执行程序真正显示出的状态、输入结果、录像、音轨与时间线，需带环境和场景信息 | 换了一套素材/补丁/角色状态之后的结果；当前 Web 完整一致 |
| 参考实现 `reference_source` | Delphi `GameOfMir/Client` 的 Actor、magiceff、clEvent、MapUnit、SoundUtil 等候选行为；Crystal 的参考资源/交互 | 自动视为2003国服原版；直接复用异版图号/窗口位置 |
| 服务端/契约 `server_source` / `contract` | 真实消息、坐标、实例与玩法结果，设计画布与目标清单 | 浏览器实际渲染时刻、原端美术一致 |
| Web 静态/回归 `source_review` / `unit_regression` | 代码分支、数据结构、特定输入/异步race结果 | 当前真实浏览器像素、原端时序与声音 |
| 真实协议 `live_protocol` | 原 Gate/引擎/网关收到与发出的事件及顺序 | 人物是否看起来流畅、法术图像/音轨是否一致、鼠标热区 |
| 浏览器运行/视觉比较 `browser_runtime` / `visual_comparison` | 当前生产页真实操作、截图/录像和与同版原端的差分 | 超出采样窗口/动作/状态的全项目完成 |

原始安装实际位于 `C:/Program Files (x86)/shanda/Legend of Mir`；仓库 `.runtime/native-client` 使用 junction 共享 `Data/Wav/Map`。UI 导入报告还记录历史解包路径 `C:/Users/122/Documents/Codex/2026-09-26/https-github-com-leiniaozl229-mir2-git/work/client-extraction/installed/App_Executables/Data`，需要区分“当前实际源”与“历史导出时的源目录”，通过 hash 确认相同内容。

`content/classic-176/asset-sources.json` 保留安装包 `mir2setup2003.exe`（326,778,386 bytes，SHA-256 `46e6cf029bd33f32b9977a4184b95d056a24ac32b60d03210a50e5251dcf4d42`）到 CAB、`mir.dat`/`Mir.exe` 等的链。声明版本和厂商字符串是版本候选证据，不能单凭名称证明官方身份。`national-gameplay.json` 锁定 Actor.pas 参考 SHA-256 `78f2ee21cc3a0230074064f80062eb1ad5f0352221e7c06925b247f2cc6a05e3`，其中 `evidence.animation` 明确仍缺原国服逐帧比较。

`docs/local-playtest.md` 与 `docs/delivery.md` 记录 9 月 29 日后原端登录、选角、入图、移动及部分功能的历史实测。`.runtime/native-client/native-client-manifest.json` 的 `runtime_verified:false` 尚未同步，是旧状态；两者都不能直接关闭所有 ART 项。本轮找到并查看的早期 `current-client-after-encoding-fix.png`、`native-client-window.png` 与 `windowed-client-visible.png` 是白屏/初期异常画面，不能充当成功场景参考。后续必须建立每项对应的原端采样包。原端名称常显/血条和窗口兼容辅助改动也需记录：增强后的画面可验收增强目标，不能代替原版默认外观证据。

## 2. 当前资产族清点

本机 `Data` 含 **42 对 WIL/WIX**。28 个玩法族导出合计 **103,250 个帧条目**，8 个 UI 族导出 **2,760 个条目**。其中 Items、DnItems、stateitem 同时用于两条导出路径，不能把它们重复算作新的资源族或复刻完成率。28 族导入报告的 `empty=0` 也不能代表全部为独立有效图像：原包有1×1占位和重复图，须做每族有效/透明/重复/坏帧审计。

| 玩法族 | 原图与生产库 | 当前导出条目 |
| --- | --- | ---: |
| 身体 | Hum.wil → actors/NHum | 10,800 |
| 头发 | Hair.wil → actors/NHair | 3,600 |
| 武器 | Weapon.wil → actors/NWeapon | 40,855 |
| NPC | npc.wil → actors/NPC00 | 2,790 |
| 怪物 | Mon1 / Mon2 / Mon3 / Mon4 / Mon5 / Mon6 | 1,086 / 490 / 3,690 / 3,670 / 3,600 / 1,720 |
| 怪物 | Mon7 / Mon8 / Mon9 / Mon10 / Mon11 / Mon12 | 1,770 / 1,800 / 1,520 / 1,440 / 1,440 / 3,610 |
| 怪物 | Mon13 / Mon14 / Mon15 / Mon16 / Mon17 / Mon18 | 1,344 / 780 / 3,269 / 1,588 / 2,617 / 3,707 |
| 魔法 | Magic / Magic2 / Effect | 4,010 / 33 / 326 |
| 物品 | Items / DnItems / stateitem | 570 / 565 / 560 |
| 原装声音 | Wav → audio/manifest.json | 544 个 WAV |

| UI族 | 条目 | 验证器“有效独立图” | 重复条目 | 透明独立图 |
| --- | ---: | ---: | ---: | ---: |
| ChrSel | 280 | 200 | 80 | 0 |
| Prguse | 510 | 235 | 275 | 0 |
| Prguse2 | 14 | 6 | 7 | 1 |
| mmap | 189 | 141 | 48 | 0 |
| stateitem | 560 | 252 | 308 | 0 |
| MagIcon | 72 | 63 | 9 | 0 |
| Items | 570 | 383 | 187 | 0 |
| DnItems | 565 | 277 | 288 | 0 |
| 合计 | 2,760 | 1,557 | 1,202 | 1 |

上述静态验证报告为 `.runtime/reports/national-ui-validation-exported.json`：缺失、解码失败、hash差异与几何差异均为0。这里的“有效独立图”是该验证器按 hash 去重后的类别，不能解读为1,557个控件用途已确认。`NewopUI/Prguse3/ui1/ui3` 在契约中为 optional，当前包缺失；不能从其他版本下载同名库并当作已确认。

| 地图对象族 | 原源帧数 | 当前消费情况 |
| --- | ---: | --- |
| Tiles | 7,910 | 导入前610帧；本轮后4,268帧，408越界列入missing |
| SmTiles | 938 | 导入前209帧；本轮后210帧 |
| Objects | 9,999 | 导入前3,816帧；本轮后9,996帧，当前profile源内依赖闭合 |
| Objects2 | 10,024 | 有原源，未导出/确定索引选择规则 |
| Objects3 | 9,229 | 同上 |
| Objects4 | 10,062 | 同上 |
| Objects5 | 9,919 | 同上 |
| Objects6 | 7,751 | 同上 |
| Objects7 | 9,984 | 同上 |

原安装 `Map` 有528张，服务端固定数据有572张。交集528张全部存在于服务端，其中522张 hash 相同、6张不同：`0 / 11 / 2 / 3 / 4 / 5`。当前 profile与Web导出570张，缺服务端 `D718/D719`。这证明版本/世界数据边界需要明确，不能把服务器全部扩展数据自动标成2003原包完整内容。

## 3. 最高优先级：地图依赖补齐与版本差异

导入前审计：570张已导出地图中 **569张有依赖缺帧**。按“地图×图库×索引”统计为169,460个缺引用；按“图库×索引”去重是 **10,247个唯一缺帧**。不同数字的分母必须保留，后续进度不能拿复用引用数量充当新导出的独立图数。

| 图库 | 缺引用次数 | 唯一缺索引 | 可从当前国服源补 | 超出国服源范围 |
| --- | ---: | ---: | ---: | ---: |
| Tiles | 19,830 | 4,066 | 3,658 | 408 |
| SmTiles | 5 | 1（索引13） | 1 | 0 |
| Objects | 149,625 | 6,180 | 6,180 | 0 |
| 合计 | 169,460 | 10,247 | **9,839** | **408** |

计算依据是 `assets/web/maps/<id>/map.json.dependencies` 中三族索引集合减去对应 `assets/web/libraries/<name>/library.json` 的 `frames.keys ∪ empty`；map_tool导出依赖已用0基索引。上述结果来自本轮读取全部570个manifest并求并集，不是从首个失败 `D001→Tiles:39` 推测。超范围 Tiles 最早为10320，最大11269；当前原源只有7910帧，不能直接解码、模取余或假映射。

这批工作的落实顺序：

1. 建立独立的国服地图导入入口，读取当前 profile 全部地图依赖，先核对现 manifest的三对WIL/WIX源hash和索引hash，再写资源。现 `scripts/import-national-game-assets.py` 只含28玩法族；`scripts/import-map-assets.py` 是Crystal导入器，在已有国服导入时会拒绝覆盖，不能用它重新下载候选图库盖掉原图。
2. 在源范围内补9,839个唯一索引，合并旧 `frames/empty` 和几何/hash元数据；`tools/wil_lib.py:export` 当前会重写 manifest，因此新入口必须保留旧条目或在临时目录导出后受控合并，不能把增量索引当成整个库。坏帧不能当空帧，源hash不符必须在写入前失败。脚本重复运行应输出相同结果。
3. 把408个范围外引用登记为明确未解决，包含地图/图库/索引和原源frameCount。导入有效部分不表示地图依赖全部闭合。调查这些扩展地图的真正版本与对应Tiles源，再决定同版目标和扩展适配；不删地图或降低断言让数字通过。
4. 独立调查 Objects2–7 在该原端的图库选择/索引换算与地图来源。现12字节字段的 `btArea` 与 `btLight` 不能凭名字猜成扩展图库号；先通过原端/格式证据锁规则，再纳入hash契约、导出和生产渲染。
5. 同步国服 source-lock/审计模式，分别统计原版资源、参考回退、服务端扩展和未解决引用。原装/服务器6个不同地图的截图应使用相同世界版本，避免拿不同地图做像素差分。完成后再跑依赖审计及原端/Web代表场景验证。

### 2026-10-01 真正应用后的追加记录

`scripts/import-national-map-assets.py` 的真实执行证据为 `.runtime/reports/national-map-import.json`，其中 `mode=apply`、`scope=profile`、profile hash `566dc6041291cea7e5c508787e5318d10cd728f8408b51facc25fd9fe72b0cd8`。独立入口 `scripts/import-national-map-assets.py` 已实际补齐9839个源内唯一帧，三族源/索引SHA与现国服契约相符；apply前manifest保存在 `.runtime/backups/national-map-frames-20261001`。本轮仅更新导出资源，没有更换原WIL/WIX、Map、数据库或世界数据。

| 应用指标 | 报告结果 |
| --- | ---: |
| profile / requestedMapCount | 570 / 570 |
| requestedUnique（三族总依赖） | 14,882 |
| alreadyPresent | 4,635 |
| exported | **9,839**（Tiles3,658 / SmTiles1 / Objects6,180） |
| empty | 0 |
| unresolved唯一索引 | **408**（全部Tiles，超过7910源帧） |
| 有缺索引的地图 | **1：GA0** |
| 当前三族依赖无缺索引的profile地图 | **569** |
| complete / status / 命令退出 | false / unresolved / 2（明确保留未解决范围） |

受影响地图是对 `families[].unresolved[].maps` 求并集得到，完整列表只有 `GA0`。报告的 `unresolvedMaps=[]` 表示没有缺失/非法的map manifest，不能解读成所有地图像素依赖已经解决。本轮另从profile570个map manifest与现三族 `frames.keys ∪ empty` 独立重算，确认缺索引地图仅GA0、唯一缺索引408；9839个报告导出PNG的路径也全部存在。Tiles/SmTiles/Objects当前帧数分别4,268/210/9,996。

新增地图导入夹具归档 `.runtime/reports/replication-map-regression.log` 明确11项全部OK。实际重复计划 `.runtime/reports/national-map-repeat-plan.json` 为requestedUnique14882/alreadyPresent14474/exportable0/empty0/unresolved408/exported0/completefalse，源内补帧已幂等。完整Python归档 `.runtime/reports/replication-python-full.log` 为151项、141通过、9失败1错误，地图首报已变GA0/Tiles10320。Vite结果不在这组美术范围验收中登记。没有执行本项HTTP访问、真实浏览器页面或原端逐帧对照，因此三族依赖补齐仍不能关闭ART-005/006/051。408个越界不能模取余映射、套入Objects2–7或删除GA0来伪装complete。

次高优先级是原版门帧（当前符号占位）、灯光（未实现）、近战剑光/持续附体、NPC/特殊怪动作、BGM与音效事件路由、逐窗口原版内容和字体/光标取证。地图先闭合可防止后续截图把资源缺图误判为窗口/层级问题。

## 4. 导入前全量 Python 的9失败1错误

导入前权威报告 `.runtime/reports/python-events-final.log`：132项，122通过、9失败、1错误。下表保留当时具体断言与原因；源内9839地图缺帧已在本轮解决。导入后另有 `.runtime/reports/replication-python-full.log`：**151项、141通过、9失败1错误**；失败名称与旧基线相同，但地图首报已从D001/Tiles39变为GA0/Tiles10320，不能把失败数量相同解释为没有进展。新增19项纳入完整回归，后续旧契约/扩展/环境失败继续追踪。

| 失败/错误 | 当前证据和原因 | 应落地的处理与验证 |
| --- | --- | --- |
| `test_cave_route_dependencies_have_exported_frames` | 导入前首报D001→Tiles:39；历史唯一缺索引10,247。该源内图已补，现剩GA0→Tiles越界408 | ART-005/006补有效源并保留越界报告，重新审计全部地图，不只首报 |
| `test_classic_spawn_filter_covers_route_catalog` | `_classic_mon_gen(routes)`输出额外D718/D719，而profile570未含；D001按控制夹具单独处理 | 版本范围、源地图、刷怪、路线、导出与准入契约同步；保留对非法地图检查 |
| `test_every_source_route_has_a_walkable_spawn_candidate` | 当前源路径572，profile570少D718/D719，尚未到spawn候选循环 | 先闭合版本/范围，再逐地图验可走出生点，不修改角色数据或绕过检查 |
| `test_profile_covers_every_supported_source_map` | 同一D718/D719集合差异 | 与上一项共因，但两个验收范围分别保留 |
| `test_viper_valley_guide_does_not_overlap_source_merchants` | 测试在prepare-runtime源码里regex找固定“测试/世界向导 2 x y”，当前入口已由city_services生成，匹配None | 读实际生成定义验证站位/与商人最小距离/可走性；源码字符串缺失不能推断NPC真的重叠 |
| `test_install_check_lists_repeatable_delivery_commands` | install report的failures为`tool:docker`，当前Windows原生运行没有Docker工具 | 区分native/Compose环境要求；重复交付检查两模式各自可执行命令，不删服务要求 |
| `test_generated_classic_profile_is_closed` | 导入前同时缺旧参考源锁、候选库、569地图依赖和D718/D719路线；源内帧补齐后仍剩GA0越界与其余契约缺口 | 国服/参考源契约迁移和地图/路线实质闭合；审计的多个失败域需单独关闭 |
| `test_catalog_covers_authoritative_resources` | 旧期望796物品图标，当前580；技能旧期望106、当前58（物品断言先失败） | 先锁目标版/扩展内容，各自资源覆盖；不能只把796改580或106改58 |
| `test_catalog_validation_and_templates` | 五个override无图：金创药(特量)813、魔法药(特量)814、金创药(特)包815、魔法药(特)包816、黄金乾坤1411 | 原Items只有570帧，调查这些后期物品的数据/资产来源，分开目标和扩展映射，不伪造原图 |
| `test_extended_asset_fallbacks_and_skill_id_health`（ERROR） | 雷霆战甲(男)扩展fallback `iconUrl=None`，`assertIn`触发TypeError；旧`items/Items`候选库已被原Items替换 | 分离候选/国服命名空间与扩展策略；测试先诊断无图再核正确来源，不掩盖缺图 |

`content_audit` 当前对 `asset-sources.json` 的候选清单检查：map3、actor44、effect2、item2、audio5、ui5、cursor7，共68个源锁；56个属于图库。当前 `assets/raw` 候选原文件缺失、且对应许多 `.Lib`导出库已不存在，不能将这些失败解释为国服全部原像素缺失。应让审计根据真正启用profile检查原国服来源，仍需对每个有意回退的候选检查hash。

`tools/resource_catalog.py:build()`本轮只读结果为：1000物品、108技能、705怪物、570地图、2827刷怪、7517掉落行、39图库；580物品有图、58技能有图、480怪物可映射。无图物品420个全为非P0；P0无图物品0。零P0缺口不能缩成“目标完整”，原1.76与扩展内容归属仍需全面梳理。

## 5. 逐项验收台账

路径为当前确实存在的实现/契约/报告。`source_review`只证明已读实现；单元报告和协议报告标明具体范围。当前没有条目因导出数量、构建、历史原端记录或源字符串检查升为 `verified`。每项关闭必须包括以下列出的全部条件，缺少原端/浏览器时在gaps继续保留。

### ART-001 安装包/版本/原端环境证据链

状态：`partial`。实现：`content/classic-176/asset-sources.json`、`content/classic-176/national-ui-profile.json`、`docs/local-playtest.md`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`contract` `content/classic-176/asset-sources.json`（326778386字节安装包与CAB/核心程序固定hash）；`source_review` `.runtime/native-client/native-client-manifest.json`（实际安装路径/hash；runtime_verified:false为过时状态）；`source_review` `docs/local-playtest.md`（历史原端运行记录，非每项当前关闭证据）。

关闭门槛：

- 安装包→CAB→核心程序→图库哈希链可复查。
- 每次原端采样记录字体、DPI、兼容DLL、800×600有效绘图区、辅助补丁、服务端提交。
- 原端与Web采样同一场景且不含凭据。

当前验证：`source_review` `content/classic-176/asset-sources.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `content/classic-176/national-ui-profile.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `docs/local-playtest.md`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- manifest旧runtime_verified:false与后续历史运行记录不一致。
- 原端辅助名称/血条等扩展应明确标记。

### ART-002 WIL/WIX调色板/透明/锚点/尾索引

状态：`implemented`。实现：`tools/wil_lib.py`、`tools/validate-national-ui.py`、`tools/import-national-ui.py`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）。

关闭门槛：

- 逐库原索引、width/height、signed offset与PNG解码一致。
- 调色板索引0透明、非零黑色不可误删。
- 尾部EOF有rawIndexEntries及discardedTrailingOffsets而内部异常严格失败。
- 备用WZL/PAK单独验证。

当前验证：`source_review` `tools/wil_lib.py`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `tools/validate-national-ui.py`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `tools/import-national-ui.py`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/python-events-final.log`（132项122通过、9失败1错误，失败全列于配套文档）；`unit_regression` `.runtime/reports/national-ui-validation-exported.json`（8库2760条目静态解码/哈希/几何无异常；不是用途/动画验收）。

未闭合：

- 本包WIL静态检查已有。
- 绘制用途锚点仍由独立条目验收。
- 备用格式不能继承本包结论。

### ART-003 国服/候选资源命名空间与可重建源锁

状态：`partial`。

现有实现：`scripts/import-national-game-assets.py`、`scripts/import-map-assets.py`、`tools/content_audit.py`、`content/classic-176/asset-sources.json`、`scripts/import-national-map-assets.py`、`content/classic-176/active-asset-sources.json`、`docs/resource-consistency-2026-10-01.md`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`tools/ga0_tiles_candidate_audit.py`、`tools/export_ga0_tiles_candidate.py`、`content/classic-176/ga0-tiles-candidate.json`、`apps/web/src/map-assets.ts`、`apps/web/src/map-view.ts`、`content/classic-176/map-asset-bindings.json`、`tools/map_asset_bindings.py`、`tests/test_map_asset_bindings.py`、`tests/map_assets_regression.mjs`、`tests/map_sources_regression.mjs`、`tests/map_sentinel_regression.mjs`、`docs/map-source-binding-review-2026-10-01.md`、`docs/map-sentinel-review-2026-10-01.md`、`docs/map-asset-selection-2026-10-01.md`。

依据及等级：`contract` content/classic-176/national-gameplay.json — 国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。<br>`contract` content/classic-176/map-asset-bindings.json — 第七批当前扩展场景精确map/layer/index选择；原national覆盖与历史配对独立保留。。

必须通过：

- 每生产资源显示真实原版或参考来源、hash与profile
- 版本不匹配先拒绝再写输出
- 国服导入和内容审计可从干净环境重建且不会覆盖为候选素材

当前验证：`source_review` scripts/import-national-game-assets.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` scripts/import-map-assets.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` tools/content_audit.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` content/classic-176/asset-sources.json — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` scripts/import-national-map-assets.py — 新增独立地图入口静态阅读；本清单未执行大规模导出，结果待Root登记<br>`native_pixels` .runtime/reports/national-map-import.json — 2026-10-01 本机真实apply：profile570、requestedUnique14882、alreadyPresent4635、exported9839、empty0、unresolved408（仅GA0）；completefalse/退出2。现manifest和9839输出文件存在性复核；不证明HTTP或浏览器画面<br>`source_review` .runtime/backups/national-map-frames-20261001 — apply前现有三族manifest备份；保留导入前10247唯一缺帧基线<br>`unit_regression` .runtime/reports/replication-map-regression.log — 2026-10-01 11项地图导入夹具全部OK：source preflight/合并保留/幂等/范围外/缺map/损坏帧等；不证明原端/Web图像<br>`unit_regression` .runtime/reports/national-map-repeat-plan.json — apply后真实重复计划：requestedUnique14882/alreadyPresent14474/exportable0/empty0/unresolved408/exported0/completefalse；已补源内帧不会重复规划<br>`unit_regression` .runtime/reports/replication-python-full.log — apply后全量151项：141通过、9失败、1错误；地图首报GA0/Tiles10320，其余已记录契约/扩展/环境失败继续保留<br>`unit_regression` .runtime/reports/resources-v5-checks.json — 第五批当前源码：242组Node回归/21脚本；完整Python257项，失败1项；非浏览器。<br>`unit_regression` .runtime/reports/resources-v5-content-audit.json — 必需源/导出哈希、索引、偏移与内容目录；complete=false保留实际缺项，不是画面验收。<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/ga0-tiles-source-freeze-sixth-final.json — 候选408个索引逐像素解码一致、19专项、独立namespace及重复导出0写入；现国服/GA0文件4284项SHA未变，未激活candidate。<br>`unit_regression` .runtime/reports/icons-v6-content-audit.json — 实际CLI遍历必需源/导出哈希与内容目录，complete=false；无原端、浏览器或历史配对完成声明。<br>`unit_regression` .runtime/reports/map-v7-sentinel-web-tests.json — 最终实际352组/30脚本模块/VM/Pixi回归；含源选择、54特殊引用nil路径和切图/失败恢复，非浏览器。<br>`unit_regression` .runtime/reports/map-v7-final-python-checks.json — 修复默认源路径后完整Python339/339通过；current render与original fidelity分别断言，独立内容CLI继续exit1。<br>`unit_regression` .runtime/reports/map-binding-seventh-source-freeze.json — MAP/blob/9chunk/source字节与408参考PNG、125国服保留帧逐解码核对；enabled参考选择，historical pairing=false。<br>`unit_regression` .runtime/reports/map-v7-final-content-audit.json — 最终实际内容CLI，renderDependencyMissing空、原national GA0缺408与historicalFailure保持；complete=false。。

剩余缺口：

- 当前GA0明确选择408个参考Tiles原索引；国服125索引及9/14保持原源，候选与生效国服来源分开锁定。
- 目标MAP/图库历史原包配对仍未核实；参考源码与同包原端版本关系、浏览器/GPU动态比较继续开放。

### ART-004 42对原始图库全族/有效帧/用途归属

状态：`partial`。实现：`scripts/import-national-game-assets.py`、`tools/import-national-ui.py`、`content/classic-176/national-gameplay.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`native_pixels` `C:/Program Files (x86)/shanda/Legend of Mir/Data`（实际安装Data42族，未导出族也列入范围）。

关闭门槛：

- 原安装Data42族均列源hash、有效/透明/重复/坏帧及生产消费者。
- 28玩法/8UI/3地图库/Objects2–7分别审计且复用族不重复算进度。
- 未知帧段有用途调查与独立关闭条件。

当前验证：`source_review` `scripts/import-national-game-assets.py`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `tools/import-national-ui.py`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `content/classic-176/national-gameplay.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- 103250帧与UI2760条目属于导出数量。
- Objects2–7未导出/映射，地图三库只部分索引。

### ART-005 所有目标地图底图/地面依赖闭合

状态：`partial`。

现有实现：`apps/web/src/map-view.ts`、`tools/map_tool.py`、`scripts/import-map-assets.py`、`assets/web/libraries/Tiles/library.json`、`assets/web/libraries/SmTiles/library.json`、`scripts/import-national-map-assets.py`、`content/classic-176/map-server-extensions.json`、`scripts/export-server-extension-maps.py`、`docs/resource-consistency-2026-10-01.md`、`tools/ga0_tiles_candidate_audit.py`、`tools/export_ga0_tiles_candidate.py`、`content/classic-176/ga0-tiles-candidate.json`、`apps/web/src/play.ts`、`tests/map_loading_regression.mjs`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/map-assets.ts`、`content/classic-176/map-asset-bindings.json`、`tools/map_asset_bindings.py`、`tests/test_map_asset_bindings.py`、`tests/map_assets_regression.mjs`、`tests/map_sources_regression.mjs`、`tests/map_sentinel_regression.mjs`、`docs/map-source-binding-review-2026-10-01.md`、`docs/map-sentinel-review-2026-10-01.md`、`docs/map-asset-selection-2026-10-01.md`、`tools/render-map-catalog-previews.py`、`docs/map-visual-catalog-audit-2026-10-02.md`。

依据及等级：`contract` content/classic-176/national-gameplay.json — 国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照<br>`native_pixels` C:/Program Files (x86)/shanda/Legend of Mir/Map — 原装528地图，522与服务端同hash、6不同<br>`server_source` vendor/mirserver-data/Mir200/Map — 572份当前服务器地图；不全属原装像素版<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。<br>`contract` content/classic-176/map-asset-bindings.json — 第七批当前扩展场景精确map/layer/index选择；原national覆盖与历史配对独立保留。<br>`source_review` .runtime/reports/map-sentinel-seventh-source.json — 固定GA0全部54高索引格子原始12byte、坐标/碰撞与参考源码越界nil路径；不推导所有地图或原端执行。。

必须通过：

- 每目标地图hash、尺寸、12字节单元、x/y顺序、48×32格与原端一致
- 全部依赖进入有效帧/确认空帧/明确未解决三类
- 平原/城市/洞穴同场景像素比较无缺图裂缝
- 越界索引不能静默排除

当前验证：`source_review` apps/web/src/map-view.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` tools/map_tool.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` scripts/import-map-assets.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`unit_regression` .runtime/reports/python-events-final.log — 132项122通过、9失败1错误，失败全列于配套文档<br>`source_review` scripts/import-national-map-assets.py — 新增独立地图入口静态阅读；本清单未执行大规模导出，结果待Root登记<br>`native_pixels` .runtime/reports/national-map-import.json — 2026-10-01 本机真实apply：profile570、requestedUnique14882、alreadyPresent4635、exported9839、empty0、unresolved408（仅GA0）；completefalse/退出2。现manifest和9839输出文件存在性复核；不证明HTTP或浏览器画面<br>`source_review` .runtime/backups/national-map-frames-20261001 — apply前现有三族manifest备份；保留导入前10247唯一缺帧基线<br>`unit_regression` .runtime/reports/replication-map-regression.log — 2026-10-01 11项地图导入夹具全部OK：source preflight/合并保留/幂等/范围外/缺map/损坏帧等；不证明原端/Web图像<br>`unit_regression` .runtime/reports/national-map-repeat-plan.json — apply后真实重复计划：requestedUnique14882/alreadyPresent14474/exportable0/empty0/unresolved408/exported0/completefalse；已补源内帧不会重复规划<br>`unit_regression` .runtime/reports/replication-python-full.log — apply后全量151项：141通过、9失败、1错误；地图首报GA0/Tiles10320，其余已记录契约/扩展/环境失败继续保留<br>`unit_regression` .runtime/reports/resources-v5-checks.json — 第五批当前源码：242组Node回归/21脚本；完整Python257项，失败1项；非浏览器。<br>`unit_regression` .runtime/reports/resources-v5-content-audit.json — 必需源/导出哈希、索引、偏移与内容目录；complete=false保留实际缺项，不是画面验收。<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/ga0-tiles-source-freeze-sixth-final.json — 候选408个索引逐像素解码一致、19专项、独立namespace及重复导出0写入；现国服/GA0文件4284项SHA未变，未激活candidate。<br>`unit_regression` .runtime/reports/icons-v6-content-audit.json — 实际CLI遍历必需源/导出哈希与内容目录，complete=false；无原端、浏览器或历史配对完成声明。<br>`unit_regression` .runtime/reports/map-v7-sentinel-web-tests.json — 最终实际352组/30脚本模块/VM/Pixi回归；含源选择、54特殊引用nil路径和切图/失败恢复，非浏览器。<br>`unit_regression` .runtime/reports/map-v7-final-python-checks.json — 修复默认源路径后完整Python339/339通过；current render与original fidelity分别断言，独立内容CLI继续exit1。<br>`unit_regression` .runtime/reports/map-binding-seventh-source-freeze.json — MAP/blob/9chunk/source字节与408参考PNG、125国服保留帧逐解码核对；enabled参考选择，historical pairing=false。<br>`unit_regression` .runtime/reports/map-v7-final-content-audit.json — 最终实际内容CLI，renderDependencyMissing空、原national GA0缺408与historicalFailure保持；complete=false。<br>`unit_regression` .runtime/reports/map-sentinel-seventh-review.json — 5个实际生产模块/Pixi类回归覆盖54位置、高索引不请求纹理、碰撞保留及非目标否定案例。。

2026-10-02 离线视口审计：[全量地图场景报告](../.runtime/reports/map-catalog-previews-2026-10-02/report.json)，572张、184,512次绘制、0个未解析/缺PNG/损坏分块/1×1底图占位；DH02有8次确认的越界nil跳过。353张没有导航或刷怪点，采样视口只用于资产审阅，不作为出生点。没有真实浏览器或原端像素对照。
剩余缺口：

- 572图范围保持；当前GA0规范依赖已用408参考索引补渲染，原国服408缺项与未核历史配对独立登记。
- 固定GA0的54条高索引引用按参考WIL越界nil行为跳过并单独计数；不是所有地图的通用保留值规则或原端执行证据。
- 原装528Map/服务端572的版本范围、6图hash差异、D718/D719扩展、真实路线与原端/浏览器画面仍待验收。

### ART-006 Objects/Objects2–7对象族与遮挡

状态：`partial`。实现：`apps/web/src/map-view.ts`、`assets/web/libraries/Objects/library.json`、`tools/render-map-catalog-previews.py`、`docs/map-visual-catalog-audit-2026-10-02.md`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`native_pixels` `C:/Program Files (x86)/shanda/Legend of Mir/Data/Objects2.wil`（Objects2–7真实安装源，选择规则未核定）。

关闭门槛：

- 从同版地图格式/原端建立图库选择与索引换算。
- 逐族源hash和局部索引可追溯。
- 树墙屋顶石柱与人怪/掉落前后遮挡逐方向逐帧正确。
- 原端静态及经过遮挡物移动比较。

当前验证：`source_review` `apps/web/src/map-view.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/python-events-final.log`（132项122通过、9失败1错误，失败全列于配套文档）；`native_pixels` `.runtime/reports/national-map-import.json`（2026-10-01 本机真实apply：profile570、requestedUnique14882、alreadyPresent4635、exported9839、empty0、unresolved408（仅GA0）；completefalse/退出2。现manifest和9839输出文件存在性复核；不证明HTTP或浏览器画面）；`source_review` `.runtime/backups/national-map-frames-20261001`（apply前现有三族manifest备份；保留导入前10247唯一缺帧基线）；`unit_regression` `.runtime/reports/replication-map-regression.log`（2026-10-01 11项地图导入夹具全部OK：source preflight/合并保留/幂等/范围外/缺map/损坏帧等；不证明原端/Web图像）；`unit_regression` `.runtime/reports/national-map-repeat-plan.json`（apply后真实重复计划：requestedUnique14882/alreadyPresent14474/exportable0/empty0/unresolved408/exported0/completefalse；已补源内帧不会重复规划）；`unit_regression` `.runtime/reports/replication-python-full.log`（apply后全量151项：141通过、9失败、1错误；地图首报GA0/Tiles10320，其余已记录契约/扩展/环境失败继续保留）。

2026-10-02 离线场景预览复用了生产地图绘制次序与精确对象图库绑定；完整572图报告见 [地图场景审计](../.runtime/reports/map-catalog-previews-2026-10-02/report.json)。它检查合成连续性，不建立Objects2–7的历史图库选择规则，也不替代同版原端遮挡对照。
未闭合：

- Objects源内6180个缺引用已补齐，现manifest9996帧；Objects2–7的原端图库选择/局部索引/导出和消费规则未建立。
- 树墙屋顶石柱与人怪/掉落遮挡、signed锚点及同版地图画面仍缺原端/浏览器验证。

### ART-007 地图动图计数/节拍/加色/偏移

状态：`partial`。实现：`apps/web/src/map-view.ts`、`tools/map_tool.py`。

证据：`contract` `content/classic-176/national-gameplay.json`；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/MapUnit.pas`（参考地图字段和门组逻辑）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/PlayScn.pas`（SHA-256 `0dcc555bf7fbd10fbd1ac240250bdc0bc28dead21ad188f664030c1af7426120`；每50ms推进共享计数，按 `btAniTick+1` 选动画帧；48×32前景帧先普通绘制，高位标记帧再按 `GetObjsEx` 偏移加色绘制）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/MShare.pas`（`GetObjsEx` 返回帧自身的 `nPx/nPy`）。

2026-10-02 追加：全572地图扫描有2,326条高位前景引用/253张地图；与旧绘制坐标相比1,559条位置错误，其中Y轴1,091条；另有17条48×32高位帧需要普通底图及加色副本。`map_sources_regression.mjs` 16组覆盖48×32双份绘制和100×100偏移；`map_loading_regression.mjs` 19组、TypeScript与Vite代码构建通过。详见[地图加色绘制实现](map-additive-composition-implementation-2026-10-02.md)及 `.runtime/reports/map-additive-composition-2026-10-02.json`。尚无原端/浏览器同帧视觉比较，故不升级状态。

关闭门槛：

- 水流火盆旗帜装饰各自btAniFrame低7位计数、btAniTick和高位混合有同版样本。
- 逐帧索引/循环/偏移/色彩一致。
- 切图与异步加载无旧帧和错误重启相位。

当前验证：`unit_regression` `tests/map_sources_regression.mjs` 14组（生产 map-view 与 Pixi 8.13.2，覆盖50ms共享计数、`btAniTick`帧停留、延迟绘制单步推进）；`unit_regression` `tests/map_loading_regression.mjs` 19组；TypeScript `--noEmit` exit 0。尚无浏览器与原端画面逐帧差分。

未闭合：

- 高位加色/偏移帧在真实浏览器与同版客户端之间仍未逐帧校准；不同动画资源的实际播放相位也未截图核对。

### ART-008 门组开关/原图帧/碰撞

状态：`partial`。实现：`apps/web/src/map-view.ts`、`services/web-gateway/WorldProjection.cs`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/MapUnit.pas`（参考地图字段和门组逻辑）。

关闭门槛：

- 门组ID与doorOffset选择原关闭/打开帧且组内门格同步。
- 真实服务器开关改变图像和通行。
- 原端与浏览器开关/经过/切图重入场景一致。

当前验证：`source_review` `apps/web/src/map-view.ts`（2026-10-02：按12字节地图格读取btDoorIndex/btDoorOffset，以doorIndex低7位和原端±10格门组范围同步重绘；不证明同版视觉）；`unit_regression` `tests/map_loading_regression.mjs`（已覆盖门组基础帧/开门偏移帧/恢复关闭帧与整组碰撞同步；Pixi替身回归，不证明浏览器画面）；`source_review` `services/web-gateway/WorldProjection.cs`（612/614门事件投影）。

未闭合：

- 门组事件、实际资源帧偏移和门音效仍缺当前浏览器与同版原端实战/逐帧对照；原始服务器门格数据也未覆盖全部地图。

### ART-009 地图/角色/法术光照与暗区

状态：`partial`。实现：`apps/web/src/map-view.ts`、`apps/web/src/online-actors.ts`、`apps/web/src/magic-effects.ts`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/MapUnit.pas`（参考地图字段和门组逻辑）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/clEvent.pas`（持续地面事件；非CUSTOM火墙1630..1635、40ms/图、light1）。

关闭门槛：

- 采集洞穴环境亮度、地图btLight、人物light、火把和火墙半径/色彩。
- 实现同版暗区光照并验证运动时光随实际帧脚点。
- 亮度消息和切图重置正确。

当前验证：`source_review` `apps/web/src/map-view.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/magic-effects.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- 地图btLight与演员light未进入视觉。
- 火墙只有add像素没有光照遮罩。

### ART-010 天气/时间/雾/屏幕色调

状态：`partial`。实现：`apps/web/src/map-view.ts`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`native_pixels` `C:/Program Files (x86)/shanda/Legend of Mir/mir.dat`（原程序作为目标能力和运行取证对象）。

关闭门槛：

- 先证明2003目标版本每模式存在或不存在及地图/消息控制。
- 对存在效果实现同版密度/叠层/音效/色调与切图清理。
- 有证据排除的模式记录版本与样本。

当前验证：`source_review` `apps/web/src/map-view.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- 目前无天气/时间渲染。
- 不能自动引入后期特效或现代泛光。

### ART-011 相机/深度排序/帧内脚点/裁切

状态：`partial`。实现：`apps/web/src/map-view.ts`、`apps/web/src/online-actors.ts`、`apps/web/src/movement-visual.ts`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）。

关闭门槛：

- 人物/怪物/标签/法术/掉落以同版signed锚点和相机规则同步。
- 普通步跑/推退/切图/边缘的时间线与原端一致。
- 大怪与同脚点对象遮挡正确。

当前验证：`source_review` `apps/web/src/map-view.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/movement-visual.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 400/300中心、线性曲线、y*10000+x深度为当前实现。
- 缺同版全场景比较。

### ART-012 mmap小地图原像素/比例/标记

状态：`partial`。实现：`apps/web/src/minimap.ts`、`apps/web/src/minimap-profile.ts`、`assets/web/ui-national/mmap/library.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`native_pixels` `assets/web/ui-national/mmap/library.json`（mmap原帧号/几何/signed偏移与源hash；不证明动态用途）。

关闭门槛：

- 189帧逐一证明地图归属/世界坐标比例/方向。
- 小/大/隐藏模式和每类标记像原端。
- 真实浏览器不同DPI点击边缘仍落到正确格且未知地图明确反馈。

当前验证：`source_review` `apps/web/src/minimap.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/minimap-profile.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 圆形标记颜色/半径和大量地图的mmap用途未同版校准。
- 网格回退不算原版完成。

### ART-013 Hum衣服/性别/形状原像素

状态：`partial`。实现：`apps/web/src/national-actors.ts`、`apps/web/src/online-actors.ts`、`assets/web/actors/NHum/library.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`（固定哈希Delphi参考动作/叠层；不能冒充国服运行行为）；`native_pixels` `assets/web/actors/NHum/library.json`（Hum原帧号/几何/signed偏移与源hash；不证明动态用途）。

关闭门槛：

- 9衣服×男女×8方向逐动作核对600帧块和signed偏移。
- 真实换装/出现/切图/死亡无旧外观。
- 原端对应装备动作逐帧比较。

当前验证：`source_review` `apps/web/src/national-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 10800帧导出存在，装备→形状→动作完整对应未全验收。

### ART-014 Hair发型/性别/头发层级

状态：`partial`。实现：`apps/web/src/national-actors.ts`、`apps/web/src/online-actors.ts`、`assets/web/actors/NHair/library.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`（固定哈希Delphi参考动作/叠层；不能冒充国服运行行为）；`native_pixels` `assets/web/actors/NHair/library.json`（Hair原帧号/几何/signed偏移与源hash；不证明动态用途）。

关闭门槛：

- 3600帧每发型/性别与Hum动作方向同步。
- 发型/头盔/身体/武器层级和偏移逐方向一致。
- 未知发型明确诊断并经真实换装重登比较。

当前验证：`source_review` `apps/web/src/national-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 当前Math.min钳到hairShapes-1，超范围语义未证明。

### ART-015 Weapon男女形状/WORDER逐帧层级

状态：`partial`。实现：`apps/web/src/national-actors.ts`、`apps/web/src/online-actors.ts`、`assets/web/actors/NWeapon/library.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`（固定哈希Delphi参考动作/叠层；不能冒充国服运行行为）；`native_pixels` `assets/web/actors/NWeapon/library.json`（Weapon原帧号/几何/signed偏移与源hash；不证明动态用途）。

关闭门槛：

- 40855帧武器块/性别/方向/动作明确末尾不完整块。
- 逐帧WORDER(sex,currentFrame)前后层级无穿身体。
- 空手/长兵器/快速换装及非法形状经原端和浏览器比较。

当前验证：`source_review` `apps/web/src/national-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- WORDER有参考依据。
- 所有装备映射和尾部帧段未完整验收。

### ART-016 人物所有动作序列/方向/时序

状态：`partial`。实现：`content/classic-176/national-gameplay.json`、`apps/web/src/national-actors.ts`、`apps/web/src/online-actors.ts`、`apps/web/src/actors.ts`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`（固定哈希Delphi参考动作/叠层；不能冒充国服运行行为）。

关闭门槛：

- standing/walking/running/warMode/rushLeft/rushRight/rushKung/attack/heavyAttack/wideAttack/spell/harvest/struck/dying/dead全部8方向逐帧采样。
- start/count/skip/interval有原端时间戳与协议触发。
- 生产/校准同表且低高帧率总时长正确。

当前验证：`source_review` `content/classic-176/national-gameplay.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/national-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 动作表来自固定Actor.pas参考。
- 原国服全动作逐帧比较未完成，契约存在不代表所有状态触发。

### ART-017 冲撞/推退/撞墙回弹动画

状态：`implemented`。实现：`apps/web/src/online-actors.ts`、`apps/web/src/national-actors.ts`、`apps/web/src/movement-visual.ts`、`services/web-gateway/WorldProjection.cs`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`（固定哈希Delphi参考动作/叠层；不能冒充国服运行行为）。

关闭门槛：

- rush左右3帧交替、backstep倒序、blocked尝试/归位由权威消息触发。
- 连续SM6/7保持消息顺序和原面向，清理旧移动队列且下次移动不跳格。
- 原端/Web同场景测位移曲线、回弹幅度和总时长。

当前验证：`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/national-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/movement-visual.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `services/web-gateway/WorldProjection.cs`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`live_protocol` `.runtime/reports/world-events-live.json`（11项真实网关/原生Gate事件与位移；非画面/伤害验证）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 真实协议与状态回归通过，浏览器/原端画面仍缺。
- implemented表示代码与针对性回归不代表视觉关闭。

### ART-018 受击/采集/死亡/尸体/消失

状态：`partial`。实现：`apps/web/src/online-actors.ts`、`services/web-gateway/WorldProjection.cs`、`content/classic-176/national-gameplay.json`、`apps/web/src/magic-effects.ts`、`apps/web/src/game-audio.ts`、`apps/web/src/play.ts`。

证据：

- `contract` `content/classic-176/national-gameplay.json`：国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照

- `reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`：固定哈希Delphi参考动作/叠层；不能冒充国服运行行为

- `reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`：SHA256 78f2ee21cc3a0230074064f80062eb1ad5f0352221e7c06925b247f2cc6a05e3；3581传currentFrame-startFrame，3493重击零基frame5且digFragment才消耗一次，WEffect8*dir/3帧/80ms/击石91。

- `reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/magiceff.pas`：SHA256 6ec23619b46747b810fd9cc413efb3a0b9bc71f96a85f8f7cd05ba74a301a850；TMapEffect.Run严格>80ms每次一步；DrawEff用current格中心+px/py-24/-16和DrawBlend1(screen)，非add。

- `native_pixels` `assets/web/effects/Effect/library.json`：Effect.wil SHA256 2d94f51ff7a7046daa65591e35c08cea0b23912f7aeeaae2aab0c7f24e37af90，WIX fe41b45a656df79ae9fd9e1fafc659fe0463c1fabaa08a86de0b9efce8c008d8；326源帧中8方向8*d+[0,1,2]24帧已逐原WIL重解码byte-equal现有PNG。

- `native_pixels` `assets/web/audio/91.wav`：SoundUtil.pas s_strike_stone91；国服Wav/sound.lst实际91: wav/91.wav，原装/导出byte-equal SHA256 ebcb5e32521cdf7256c334be1951064edd21e080264823b327bc6803acdd38f1；不证明浏览器音频播放/同步。

- `reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/SoundUtil.pas`：SHA256 541c51db6af6acd2fadf33382e37370f7c617095b2d8b68296ab6318a8221397；s_strike_stone=91；LoadSoundList按数字索引加载sound.lst，PlaySound以列表真实路径播放。 原运行仍待验证。

- `reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.dfm`：SHA256 1b679b97adf288412e27a802ef0bc76084c4e3a675b8e4531c922150409ae56c；WEffectImg组件FileName绑定Data/Effect.wil；不猜与Magic混用。 原运行仍待验证。

- `reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/PlayScn.pas`：SHA256 0dcc555bf7fbd10fbd1ac240250bdc0bc28dead21ad188f664030c1af7426120；1328先actor.DrawEff再m_EffectList.DrawEff；1733/1734地图转屏幕格中心后TMapEffect减24/16，参考800x600下对应现世界格top-left+signed源偏移。 原运行仍待验证。

关闭门槛：

- 受击不误重播攻击，采集方向/持续/收尾像原端。
- dying末帧进入dead等待服务器hide/revive。
- 复活/挖肉/尸体移除/重登逐方向完整验收。
- 真实重击序号swingSequence每次独立，digFragment确认标记才在零基frame5/450ms发出一次当前格/方向矿碎屑回调；同序号刷新不得重放，无标记攻击不得触发；取消/死亡/销毁/切图以及完整动作后才加载的旧资源不得迟到播放。
- 八方向矿碎屑8*d+0..2/80ms保持原signed偏移、screen和actor之后效果层；91号真实音与最后重击帧同步；原端/浏览器对应服务器DIG场景逐帧/音频比对，不据碎屑推断矿奖励。

当前验证：

- `source_review` `apps/web/src/online-actors.ts`：2026-10-01 当前文件静态阅读；不证明浏览器画面
- `source_review` `services/web-gateway/WorldProjection.cs`：2026-10-01 当前文件静态阅读；不证明浏览器画面
- `source_review` `content/classic-176/national-gameplay.json`：2026-10-01 当前文件静态阅读；不证明浏览器画面
- `unit_regression` `.runtime/reports/frontend-events-final.log`：42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面
- `native_pixels` `.runtime/reports/mining-native-assets.json`：2026-10-01直接原Effect WIL/WIX解码24/24与现有PNG字节相同，signed尺寸/偏移/hash；91.wav原装byteEqual，sound.lst hash及参考Actor/magiceff/ClMainDFM/PlayScn/SoundUtil hash记录。只证明像素/原音文件与参考规则。
- `unit_regression` `tests/actor_status_regression.mjs`：2026-10-01新增矿3组（共18）：真实OnlineActor+fakePixi/clock，450ms frame5一次、new/same/completed序号、只有真实DIG、末帧晚标记、取消/死亡/destroy/超过540ms异步load无迟到回调。
- `unit_regression` `.runtime/reports/actor-status-regression.log`：2026-10-01共18组PASS的实际日志，包含矿3组；没有实际browser/native runtime。
- `unit_regression` `tests/mining_effects_regression.mjs`：2026-10-01 Root修复后最新9/9 PASS（初版8组通过后审查发现loading时钟缺口）：八方向24源frame/offset/nearest/screen/actor后层；strict>80三步/迟RAF只走一步；独立clock从impact即推进，240ms加载附当前frame2、243后不迟到附；单帧卡顿400仍frame1；clear/旧map/缺帧/manifest与texture重试。fakePixi，未证明GPU编译/browser/native runtime。
- `unit_regression` `.runtime/reports/mining-effects-review-regression.log`：2026-10-01审查实跑最新9组PASS日志；初版8组曾漏loading clock，Root已删除名义240ms TTL并新增原tail时钟回归。非browser/native runtime/GPU编译。
- `source_review` `apps/web/src/game-audio.ts`：miningStone→/audio/91.wav，遵守既有静音开关，play克隆音实例；源文件已byte-equal国服91，HTMLAudio真实播放/延迟/音量仍未实测。
- `source_review` `apps/web/src/play.ts`：new OnlineActor第三参数回调→magicEffects.miningImpact(impact)+audio.play(miningStone)；heavyAttack通知递增swingSequence，miningFragment自有真实marker；clearWorld同时clear效果/destroy角色。仅静态阅读，不证明live_protocol/browser。
- `source_review` `apps/web/src/magic-effects.ts`：2026-10-01 Root修复后独立MiningFragmentVisual从impact即clock/RAF，加载仅附当前仍live frame，strict>80每次一步并第3次前进移除；无固定240ms TTL。clear generations/取消，manifest/texture失败删除缓存重试；Effect24源索引/offset/nearest/screen/actor后z正确。原最终palette framebuffer和真实浏览器仍未验收。
- `unit_regression` `.runtime/reports/mining-effects-tail-review.json`：2026-10-01额外只读生产复现3/3匹配参考clock，生产MagicEffects SHA256 96bf71d14b8ed47c4c616b602e9948bc202331aa14b64d99137b1ce44e49dbac：81/162后200ms加载→frame2、240ms加载→frame2尚活、只一次400ms tick后加载→frame1。运行fakePixi/clock，expected来自reference_source，不冒充native/browser。
- `live_protocol` `.runtime/reports/mining-live-final.json`：2026-10-01 08:28:36.540Z–08:29:36.735Z真实WebSocket→18801→原服D401单一隔离战士67/67通过：22次挥锄、10次真实DIG投影通知，原SM200新增矿石实例19273520/rawDura4996；拾取及正常重登保持该实例和纯度。仅证明原服/网关WebSocket协议与物品结果，不证明生产浏览器450ms矿碎屑呈现、八方向层级、91.wav实际播放或同版原端对照。 记录时间：`2026-10-01T08:29:36.735Z`；报告SHA256：`c0742b020dccbf72765dec338aaf3a2a9dc3e393c9004b9de93f1996322ea2f3`；环境：本机Windows ws://127.0.0.1:18801/ws→原服；单一隔离战士D401(25,25)；运行M2Server.dll SHA256 7e0afb8903f05fad7b462f3d56f80539f8cc0c18ac0a90a203bc926bf6f9c776；Node协议探针，无浏览器或原客户端运行。

未闭合：

- dying/dead基本逻辑存在，采集和尸体完整生命周期及音画时刻未验证。
- 2026-10-01角色hook+Root Effect三帧与91音接线已落地，18状态组/9效果组+3独立tail场景回归通过；loading clock及固定240 TTL差异经审查后已修复。真实原服→网关WebSocket已确认10次DIG及SM200矿石实例19273520/rawDura4996；仍缺生产浏览器矿碎屑呈现与音频实际播放/同步/音量、同版原端矿场景逐帧/音频比较、screen原256色帧缓冲差分；矿奖励只认服务器物品事件。

### ART-019 Mon1–Mon18全种类/APPR/动作

状态：`partial`。实现：`apps/web/src/monster-visuals.ts`、`apps/web/src/national-actors.ts`、`apps/web/src/online-actors.ts`、`content/classic-176/national-gameplay.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`（固定哈希Delphi参考动作/叠层；不能冒充国服运行行为）。

关闭门槛：

- 18族hash/原偏移、APPR库/stride/override逐怪可追溯。
- 目标所有怪物所有方向standing/walking/attack/struck/dying/dead有表。
- 未知race、空动作和Texture.EMPTY都被审计检出再以原端比较。

当前验证：`source_review` `apps/web/src/monster-visuals.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/national-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `content/classic-176/national-gameplay.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/python-events-final.log`（132项122通过、9失败1错误，失败全列于配套文档）。

未闭合：

- 705定义只有480可映射。
- MA9/25/30–47多表为空，P0名覆盖22不代表全世界。

### ART-020 祖玛唤醒/石化/钻地/特殊大怪

状态：`partial`。实现：`apps/web/src/national-actors.ts`、`apps/web/src/monster-visuals.ts`、`services/web-gateway/WorldProjection.cs`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`（固定哈希Delphi参考动作/叠层；不能冒充国服运行行为）。

关闭门槛：

- 休眠→触发→唤醒→攻击→死亡逐状态/方向/帧段取证。
- 101/104不能默认MA19冒充。
- 大怪多部位飞行喷火钻地有原端与服务器同步证据。

当前验证：`source_review` `apps/web/src/national-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/monster-visuals.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `services/web-gateway/WorldProjection.cs`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- unverifiedRaces101/104尚存。
- 多个特殊MA缺定义。
- 服务端扩展需先判断目标版本。

### ART-021 NPC造型/方向/待机动作

状态：`partial`。实现：`apps/web/src/online-actors.ts`、`assets/web/actors/NPC00/library.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`（固定哈希Delphi参考动作/叠层；不能冒充国服运行行为）；`native_pixels` `assets/web/actors/NPC00/library.json`（npc原帧号/几何/signed偏移与源hash；不证明动态用途）。

关闭门槛：

- npc2790帧按shape/方向/动画明确用途。
- 真实说话/出售/关闭与NPC动作和热区像原端。
- 守卫/商人/摆设锚点不被站位或marker替代。

当前验证：`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- race50目前feature>>16直接staticPose，没有NPC动画。

### ART-022 召唤/骷髅/神兽/宠物生命周期

状态：`partial`。实现：`apps/web/src/online-actors.ts`、`apps/web/src/monster-visuals.ts`、`apps/web/src/magic-effects.ts`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas`（固定哈希Delphi参考动作/叠层；不能冒充国服运行行为）。

关闭门槛：

- 召唤起手→地面效果→实体→跟随/变身/攻击/死亡→消失各阶段逐帧取证。
- 各级形状/主人名/友军色像原端。
- 真实召唤/重登/切图不留旧精灵。

当前验证：`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/monster-visuals.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/magic-effects.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- slave识别/名称色和部分起手存在，完整生命周期尚未验收。

### ART-023 隐身/中毒/石化/护盾多状态

状态：`partial`。

现有实现：`apps/web/src/online-actors.ts`、`content/classic-176/actor-status.json`、`apps/web/src/magic-effects.ts`、`services/web-gateway/WorldProjection.cs`、`apps/web/src/actor-palette.ts`、`content/classic-176/actor-status-palette.json`、`scripts/export-actor-status-palette.py`、`tests/test_actor_palette_export.py`、`docs/actor-palette-source-path-2026-10-01.md`。

依据及等级：`contract` content/classic-176/actor-status.json — 2026-10-01 GAME-053/106/131与ART-023契约：盾mask/六源帧/120ms/层级/解除；毒色覆盖优先级；锁定Prguse全局调色板、22兼容WIL源哈希与参考来源。原端/真实GPU逐像素验收待执行。<br>`reference_source` C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Actor.pas — SHA256 78f2ee21cc3a0230074064f80062eb1ad5f0352221e7c06925b247f2cc6a05e3；MAGBUBBLEBASE=3890/STRUCKBASE=3900、THumActor状态0x00100000、120ms计时、受击状态限定；GetDrawEffectValue绿→红→蓝→黄→紫→灰覆盖；不冒充国服运行<br>`reference_source` C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/cliUtil.pas — SHA256 e17f0604633636fb54c06503a285aa0f1837731f762e0a9daa73ed316ebb018d；BuildColorLevels以(r+g+b) div3，候选调色板索引1..255，Manhattan RGB且严格小于距离更新，平局取首索引；原index0保持0。DrawBlend1/Color256Anti的screen最终量化则候选0..255、Round，不能混为同一查表。规则是reference_source。<br>`native_pixels` C:/Program Files (x86)/shanda/Legend of Mir/Data/Magic.wil — 当前国服原装Magic.wil SHA256 be46a0258349b26db9ba7dba595abac1f0767d52fef11d9f508e704f2f6deaac；sourceFrameCount4010；3890–3892/3900–3902原索引均有效，原端用途/动态效果仍待运行确认<br>`native_pixels` C:/Program Files (x86)/shanda/Legend of Mir/Data/Magic.wix — 当前国服Magic.wix SHA256 7f95ff7ba4add42157e10eb0d43ee7c77fd3c5ac3ea1183e39971066a40dfc91；与当前Magic库同包，六帧实解码保持源索引/偏移/透明度<br>`native_pixels` assets/web/effects/Magic/library.json — 同包六原PNG存在，3890/91/92=92×110@(-21,-78)，3900=88×118@(-19,-78)，3901=92×120@(-21,-81)，3902=92×114@(-21,-78)；逐hash/PNG头/直接WIL重解码字节一致，不等同真实浏览器/原端显示<br>`native_pixels` C:/Program Files (x86)/shanda/Legend of Mir/Data/Prguse.wil — 全文件SHA256 88a12492138bc85ba0429dce3cbd857efcea5b7659cdd8d85a4f2f4db68d5ef2；classic WIL偏移56的1024原BGRA palette bytes SHA256 325fe725be263df66b47dbd9817dab2462d3fe54b3dc20bdf04971eb108c2b0f；256 RGB条目无重复。<br>`native_pixels` content/classic-176/actor-status-palette.json — 可重建原palette+6色阶表；资源SHA256 8f46af647fc9de0a3b97286740c12cc1e2065821921851f60d76c5e05680e906；6144字节LUT SHA256 01b60beba3181bdaa7af752ba1271ef2e480801f7d1c33e2afac5855a809078d。NHumHum/NHairHair/NWeaponWeapon/NPC00npc/Mon1..18共22WIL全文件hash逐锁且原palette字节与Prguse相同；表规则来自参考源码，数据不证明原端运行。<br>`reference_source` C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas — SHA256 08c79ace18755ca96882079ed0c5a5ff71c91bd8bb2de6ab539d90272355c74e；996–1005由g_WMainImages.MainPalette赋DxDraw.ColorTable再BuildColorLevels。<br>`reference_source` C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/MShare.pas — SHA256 b0b27f8e7802171caae5098b861f4e82b400ccab9a1eee5c3ba9ece5a846d2a2；g_WMainImages源MAINIMAGEFILE。<br>`reference_source` C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/Share.pas — SHA256 e25154998cd50b1ad1c08f8c123bd10e575bbabbb011cd96c570f7317d1af8c2；MAINIMAGEFILE=Data/Prguse.wil。<br>`reference_source` C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/WIL.pas — SHA256 662fa57702187698953d74c81464ba995fe05668125100a4f39a57f3119186ec；MainPalette读256TRGBQuad并写indexed DIB色表；GDI实际向全局表映射仍需原端验证。<br>`source_review` docs/actor-palette-source-path-2026-10-01.md — 调色板导出默认使用active契约nationalData；原装22源精确SHA与bundled LUT一致，mutable原端装备工作副本继续被拒绝。。

必须通过：

- 真实服务端授予0x00100000才显示持续盾，单独施法动画不得授予；国服原端与Web同时对照3890–3892每120ms循环，无前端TTL，八方向移动与signed源偏移/前武器后层级一致
- 新SM_STRUCK/health通知序号重播3900–3902每120ms；status/resources同受击序号不重播；角色受击动作结束即回常态，延迟资源加载仍在当前时钟相位；原端逐帧证明实际可见帧段
- 真实服务端撤销盾、dying/dead、销毁/切图/断线均清层；在manifest/texture迟到及撤销后重新授予的竞态中，仅当前世代可附加精灵；旧远端移动队列不可复活已撤销状态
- 0x40000000红毒与0x80000000绿毒分别显示红/绿，两位同时存在红优先，更高蓝/黄/紫/灰状态依参考覆盖；body与hair同变色，weapon/盾/名字不染色；真实服务器应用/解除逐状态后原端/Web比较
- 同包NHumHum/NHairHair/Mon/NPC原调色板源像素在六色阶逐一匹配：floor(sumRGB/3)、非零候选1..255、Manhattan距离与平局首索引；index0透明，body/hair共享滤镜但不写入原纹理，解除/死亡/多actor销毁不破坏共享LUT；GL与WebGPU两后端实编译并与原端截图逐像素比对，涵盖非3整除亮度/透明边缘
- 用原端截帧检验调色板最近色、screen量化/透明边界、本人与他人隐身/石化/焦点效果；RGBA矩阵或本地alpha值不得替代像素验收

当前验证：`native_pixels` .runtime/reports/actor-status-native-assets.json — 2026-10-01 6/6：原装Magic WIL/WIX源hash核实，逐源索引解码PNG与现有导出byte-equal，signed偏移/尺寸/透明与不透明像素确认；只证明像素来源<br>`unit_regression` tests/actor_status_regression.mjs — 2026-10-01 最新18组PASS：原15组盾/动作/状态/异步/queue生命周期通过，颜色断言已改为实际原palette查表；追加3组生产矿回调450ms、dig标记/重复序号及取消/死亡/销毁/超时加载。fakePixi/时钟，不等同真实浏览器/原端。<br>`unit_regression` .runtime/reports/actor-status-regression.log — 2026-10-01 最新18组实运行PASS日志；历史首批15组后，新增矿3组并用原palette替换矩阵断言。没有实际HTTP/原端/浏览器画面验收。<br>`source_review` apps/web/src/online-actors.ts — 2026-10-01 持续盾z3/screen/源偏移nearest、confirmed状态即时覆盖；毒色改为createActorPaletteFilter原256表，body/hair同filter，纹理不染改；struckSequence重启盾/角色受击帧。首批RGBA矩阵只是历史步骤，当前生产已替换。<br>`source_review` services/web-gateway/WorldProjection.cs — 本批前端只消费已投影status/health/action；此路径静态来源，不证明真实服务器逐状态场景<br>`native_pixels` .runtime/reports/actor-palette-export.json — 2026-10-01真实导出：锁定Prguse文件/1024palette和22actor WIL文件/同palette，1536brightness+1536sourceIndex表；resource/LUT hash记录。只证实来源与数据。<br>`native_pixels` .runtime/reports/actor-palette-check.json — 2026-10-01 --check真实只读重建，23源库hash与生成JSON精确相同，compatibleSourceCount22，sourceIndex1536/brightness1536；非浏览器像素。<br>`unit_regression` tests/actor_palette_regression.mjs — 2026-10-01 4组PASS：独立Manhattan/first-tie/div推导全部1536+1536项、source alpha/index0、6144bytes/hash；真实Pixi Filter/BufferImageSource/UniformGroup/GpuProgram资源绑定和vertex属性解析，销毁仍保留共享LUT/program。GL factory替身，GPU未编译，shader公式仅source_review。<br>`unit_regression` .runtime/reports/actor-palette-regression.log — 2026-10-01同次4组PASS日志，明确无browser_runtime/native_runtime/visual_comparison。<br>`unit_regression` tests/test_actor_palette_export.py — 2026-10-01 Python8/8 PASS：候选排除0/平局首索引、非法palette/header/size、BGR/保留bytes与完整source hash、拒绝解锁和坏源不写出、--check只读差异、真实23国服库重建与当前JSON相同。<br>`unit_regression` .runtime/reports/actor-palette-export-regression.log — 2026-10-01 Python8/8实运行日志，包含本机原装数据重建；不证明原端用途/画面。<br>`source_review` apps/web/src/actor-palette.ts — GL高精度/nearest 256×6查表、RGB byte恢复后floor/div并alpha重乘；WGSL显式textureSampleLevel避免非均匀透明分支的导数要求，资源/vertex属性已由安装的Pixi8.13.2解析。真实GLSL/WGSL编译、GPU输出仍待浏览器。<br>`unit_regression` .runtime/reports/map-v7-sentinel-web-tests.json — 最终实际352组/30脚本模块/VM/Pixi回归；含源选择、54特殊引用nil路径和切图/失败恢复，非浏览器。<br>`unit_regression` .runtime/reports/map-v7-final-python-checks.json — 修复默认源路径后完整Python339/339通过；current render与original fidelity分别断言，独立内容CLI继续exit1。<br>`unit_regression` .runtime/reports/actor-palette-seventh-repaired.json — 原安装22源实际--check通过、默认源/显式错误源边界回归；bundled palette与全部SHA锁未改，无浏览器/GPU/原端运行证明。。

剩余缺口：

- 原端与真实浏览器尚未对照盾八方向/装备遮挡、120ms及受击动作真实可见帧；假Pixi只验证生产生命周期，未标verified
- 毒色integer floor和原Prguse nearest/first-index LUT已实施并通过规则/源hash回归；GLSL/WGSL未在真实浏览器GPU编译或截图差分，RGBA滤镜中间缓冲的透明/舍入边界与原端实际输出仍待确认
- screen虽有逐通道公式，Magic自身palette SHA256 059647cd8b9c6b6a823c9d449e3627cffe4f9e65625c4f2e7d9a47b9e639d597与Prguse不同；原GDI源表→全局表映射、受光/暗场景屏幕索引、Color256Anti Round和候选0..255最终量化尚未实现/验证。不能拿actor毒色非零候选LUT复用来声称盾/光效screen已精确
- 隐身alpha0.38及bit0灰色石化回退仍是既有浏览器推断；本人/他人、焦点高亮与石化具体渲染/组合未闭合
- 真实服务器授予/解除、重复受击、死亡、切图、重登与断线的协议+浏览器联合场景待执行；本批没有HTTP/browser_runtime通过声明

### ART-024 名字/掉落标签/血条/选择反馈

状态：`partial`。实现：`apps/web/src/online-actors.ts`、`apps/web/src/ground-items.ts`、`apps/web/src/play.ts`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）。

关闭门槛：

- 原版默认显示/hover与辅助常显分别记录。
- 名称色/黑边/基线/光标离开/遮挡/多标签不偏移。
- 血条用权威HP并逐怪确认样式。
- 目标/强制攻击反馈经原端/Web比较。

当前验证：`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/ground-items.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/play.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- 血条自绘、nameFill色值和翻避规则多属推断。
- 原端辅助名称补丁不能算原版默认。

### ART-025 Magic/Magic2逐技能起手帧

状态：`partial`。实现：`apps/web/src/magic-effects.ts`、`content/classic-176/skill-assets.json`、`content/classic-176/national-gameplay.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/magiceff.pas`（参考EffectBase与法术流程，仍需原国服运行对照）。

关闭门槛：

- 每目标技能cast/flight/hit/attached/ground列库/start/count/direction/interval。
- 起手与角色spell和成功/失败同步。
- 所有被引用源段可用且有原端录像。

当前验证：`source_review` `apps/web/src/magic-effects.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `content/classic-176/skill-assets.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `content/classic-176/national-gameplay.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- 目前核心15与部分additional是固定10帧60ms表，不是完整经典技能覆盖。

### ART-026 弹道16方向/速度/目标运动

状态：`partial`。实现：`apps/web/src/magic-effects.ts`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/magiceff.pas`（参考EffectBase与法术流程，仍需原国服运行对照）。

关闭门槛：

- 火球/大火球/灵魂火符各16方向帧段/角度边界像原端。
- 起飞/每格速度/运动目标/消失/落空/爆炸正确。
- 两端逐帧位置测量不以命中消息替代画面。

当前验证：`source_review` `apps/web/src/magic-effects.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- 固定420ms延迟、distance*50ms、6帧循环未原端对照。

### ART-027 雷电/范围攻击/爆炸/受击时刻

状态：`partial`。实现：`apps/web/src/magic-effects.ts`、`apps/web/src/online-actors.ts`、`services/web-gateway/WorldProjection.cs`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/magiceff.pas`（参考EffectBase与法术流程，仍需原国服运行对照）。

关闭门槛：

- 每effectType/effect映射正确帧段与真实落点。
- 范围技能可见全部作用格。
- 雷电/爆炸/HP/受击首末帧时间与原端比较。
- 目标死/消失/空格施法不错误回退Caster。

当前验证：`source_review` `apps/web/src/magic-effects.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `services/web-gateway/WorldProjection.cs`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`live_protocol` `.runtime/reports/gameplay-live-check.json`（空格雷电真实effect接收；不证明爆炸图像或时间）。

未闭合：

- resolve只覆盖部分类型且固定延迟/80ms。
- 真实空格雷电回effect只能证明协议。

### ART-028 火墙五格持续事件/播放/移除

状态：`implemented`。实现：`apps/web/src/magic-effects.ts`、`apps/web/src/play.ts`、`services/web-gateway/WorldProjection.cs`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/clEvent.pas`（持续地面事件；非CUSTOM火墙1630..1635、40ms/图、light1）；`native_pixels` `assets/web/effects/Magic/library.json`（Magic原帧号/几何/signed偏移与源hash；不证明动态用途）。

关闭门槛：

- 五格独立事件ID/十字坐标正确，重复SHOW不重启，HIDE/切图移除。
- Magic1630–1635原偏移40ms/帧，异步HIDE不复活。
- 同版原端/Web比较加色/层级/相位/持续时长，灯光由ART-009验收。

当前验证：`source_review` `apps/web/src/magic-effects.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/play.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `services/web-gateway/WorldProjection.cs`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`live_protocol` `.runtime/reports/world-events-live.json`（11项真实网关/原生Gate事件与位移；非画面/伤害验证）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 协议与异步race回归通过，实际画面/灯光/伤害对照仍缺。

### ART-029 其他持续地图/附体法术

状态：`missing`。实现：`apps/web/src/magic-effects.ts`、`services/web-gateway/WorldProjection.cs`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/magiceff.pas`（参考EffectBase与法术流程，仍需原国服运行对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/clEvent.pas`（持续地面事件；非CUSTOM火墙1630..1635、40ms/图、light1）。

关闭门槛：

- 逐eventType列原端帧段/锚点/混合/光亮/生命周期。
- 困魔咒/护盾/隐身等目标法术按服务器创建/删除/更新驱动。
- 重入视野/断线/切图无残留和错误固定TTL。

当前验证：`source_review` `apps/web/src/magic-effects.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `services/web-gateway/WorldProjection.cs`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- 只有eventType5有sprite，其他仅记录。
- 附体持续效果和组合规则不完整。

### ART-030 烈火/刺杀/半月/攻杀/重击剑光

状态：`partial`。实现：`apps/web/src/melee-visual.ts`、`apps/web/src/online-actors.ts`、`content/classic-176/melee-visual.json`、`scripts/import-national-melee-assets.py`、`services/web-gateway/WorldProjection.cs`、`services/web-gateway/MeleeSkills.cs`。

原帧与动作依据分开登记：固定 SHA 的 Delphi `Actor.pas` / `magiceff.pas` 确认候选用途和节拍；本机 `Data/Magic.wil` / `Magic.WIX` 确认原像素、alpha、几何和 signed 偏移。四专属均为 `ActHit`：人体 `200+dir*8`、六帧、85ms，`Actor.Run` 使用 strict `>85ms`、一 tick 最多推进一帧。剑光为下表 `base+dir*10+[0..5]`，在盾后 `DrawBlend(...,1)`，生产层为 screen/z4，不给剑光套人体毒色滤镜。半月用 attack，而 big SM16 才使用 wideAttack。

| 真实 SM / kind | 参考剑光 Magic base | 8方向帧总量 | frame2附加声音号 |
| --- | ---: | ---: | --- |
| 18 / power 攻杀 | 800 | 48 | 男130 / 女131 |
| 19 / thrusting 刺杀 | 1410 | 48 | 132 |
| 24 / halfMoon 半月 | 1700 | 48 | 133 |
| 8 / fire 烈火 | 3480 | 48 | 137 |

普通 SM14、重击 SM15、big SM16 在参考中不设置这组 `m_boHitEffect`；重击人体 `264+dir*8`、6帧90ms，big人体 `328+dir*8`、8帧70ms。参考 `DrawWeaponGlimmer` 的 ready-fire3390段被注释，不能因准备开关而造光圈。`Actor.RunActSound` 在 tick 推进前的零基frame2播放武器声，四技能额外播放上表声号；武器按 feature weapon byte `div2` 选择50..57。原Wav播放与音轨由声音领域另验。

本轮采用真实SM的 `meleeKind` / `swingSequence`，开关和 +GD 不产生专属剑光。self普通预测仅播放人体与允许的frame2武器声，同一 `meleeActionId` 的实际确认沿用当前已处理 `frame/frameAt`，不重载相同人体资源、不按elapsed floor跳帧；剑光在当前帧加入。武器声与技能声分别记一次，同frame2确认只增加未播的技能部分，越过frame2不重放旧声。不同请求、远端、死亡/取消和heavy/big不继承预测clock；完成后的同请求迟到确认不复活人体或剑光。第四Actor回调为 `(entity,{weapon,skill})`，第三挖矿回调保持真实DIG的零基frame5/450ms，矿石声与frame2武器声独立。

原资源证据：WIL SHA `be46a0258349b26db9ba7dba595abac1f0767d52fef11d9f508e704f2f6deaac`、WIX SHA `7f95ff7ba4add42157e10eb0d43ee7c77fd3c5ac3ea1183e39971066a40dfc91`；原库4010帧。这192帧此前已在 `assets/web/effects/Magic/library.json` 导出，本轮未新增public PNG。新导入入口默认只读，显式 `--apply` 才逐帧修复并合并元数据，保留无关索引/文件；源hash、契约或必需原帧不符在写入前失败。

关闭门槛：

- 逐技能采集准备状态、人物/武器/剑光原帧段和8方向，192帧PNG/alpha/尺寸/原索引/signed偏移与锁定国服源一致。
- 人体、武器、头发、剑光同一strict85单tick clock，WORDER、盾后screen、毒色/隐身和缺人体帧的层级正确；重击/big不凭开关新增剑光。
- 一次消耗、刺杀二格、半月范围由实际确认攻击种类驱动；拒绝/降级普通/仅ACK不产生技能剑光或技能声，真实伤害以GAME证据另验。
- 同请求预测确认不重播、不重复武器声，错过的技能声不补播；同sequence刷新、切图/死亡/销毁、资源失败/迟到和共享纹理无残留，重击frame2武器与frame5DIG分离。
- 拒绝、空挥、命中、多人、准备状态、动态光照、音轨与原端及真实浏览器的32种技能方向逐帧/逐时刻比较。

当前验证：`native_pixels` `.runtime/reports/melee-native-assets.json` 于 `2026-10-01T09:31:34.032853+00:00` 在本机 Python 直接重解原WIL/WIX，**requested192 / matched192 / repaired0**，全部PNG字节、几何一致并记录RGBA hash；报告 SHA `c59c3872aa6ff257e5c02e9629be5d79f6775c975e54c2f9d790b8584e1df1c3`。`unit_regression` `.runtime/reports/melee-visual-regression.json` 于 `2026-10-01T09:31:01.598597+00:00` 归档6个own source SHA、命令和log hash，**19组生产MeleeVisual/OnlineActor fakePixi回归、7个素材Python测试、既有Actor18/world4、根tsc** 均exit0；报告 SHA `39ccd08b2d1f562c5bebf0312fbcb211e06c5af113a4682bd4516e4c47c8ce4c`。细节日志为 `melee-visual-regression.log` 与 `melee-import-regression.log`，覆盖32方向六帧、strict clock、预测接续/武器技能parts、异步race/销毁、共享纹理、错误manifest重试和缺人体原帧不得浮剑光。`.runtime/reports/melee-source-freeze.json` 锁定网关7/原服生产类隔离fixture6的源；历史 `gameplay-live-check.json` 仅确认战士开关/准备/消耗/到期。以上没有HTTP、GPU编译、浏览器音画或国服原可执行程序验证。

未闭合：

- 尚缺原国服可执行程序与真实浏览器32个技能方向的逐帧差分、所有衣服/武器WORDER、盾/红绿毒/隐身并存、拒绝/空挥/多人，以及实际武器/技能音轨。192原像素核验和fakePixi不能关闭动态门槛。
- 参考special攻击 `m_nMagLight=2` 的动态光照尚未实施；screen RGBA混合与原256调色板帧缓冲量化尚未证明一致，需连同ART-023和光照另验。
- 参考远端 `m_boMsgMuch` 积压时可 `Round(85*2/3)` 加速；当前普通strict85 clock和完整远端动作队列的节拍仍有范围差异。
- 同请求预测人体重播已修；确认kind迟到时剑光从当前帧加入且不补播错过技能声。原端self从CM开始动作并过滤自身SM，本轮native新增self SM回传属于网络适配，须比较原端输入与声光触发时刻，不能把fixture的self扩展当作原国服运行证据。
- 原文件声音选择、音量/失焦/可信手势与真实声叠加由Root声音批次另验；本轮只确认Actor回调parts与一次时序。

### ART-031 Effect通用/升级/传送/入图效果

状态：`partial`。实现：`apps/web/src/magic-effects.ts`、`assets/web/effects/Effect/library.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/magiceff.pas`（参考EffectBase与法术流程，仍需原国服运行对照）；`native_pixels` `assets/web/effects/Effect/library.json`（Effect原帧号/几何/signed偏移与源hash；不证明动态用途）。

关闭门槛：

- Effect326帧每段用途经原端确认。
- 升级/传送/入图/状态变化各有事件映射。
- 原偏移/人物背景名字层级/混合逐帧正确且失败/切图无残留。

当前验证：`source_review` `apps/web/src/magic-effects.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- Effect已导出，但MagicEffects只消费Magic/Magic2，多数通用效果无消费路径。

### ART-032 Items背包/商店/快捷栏图标

状态：`partial`。

现有实现：`apps/web/src/inventory.ts`、`apps/web/src/classic-ui.ts`、`tools/resource_catalog.py`、`content/classic-176/item-assets.json`、`assets/web/ui-national/items/library.json`、`docs/resource-consistency-2026-10-01.md`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/item-icons.ts`、`tests/item_icon_consumers_regression.mjs`。

依据及等级：`contract` content/classic-176/national-gameplay.json — 国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照<br>`native_pixels` assets/web/ui-national/items/library.json — Items原帧号/几何/signed偏移与源hash；不证明动态用途<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。。

必须通过：

- 每目标物品imgIndex/名字override对应原有效图，未知图明确诊断
- 缩放/居中/透明边界正确且各窗口共享实例图源
- 装备药品书籍材料逐图与原端核对

当前验证：`source_review` apps/web/src/inventory.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/classic-ui.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` tools/resource_catalog.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` content/classic-176/item-assets.json — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`unit_regression` .runtime/reports/python-events-final.log — 132项122通过、9失败1错误，失败全列于配套文档<br>`unit_regression` .runtime/reports/resources-v5-checks.json — 第五批当前源码：242组Node回归/21脚本；完整Python257项，失败1项；非浏览器。<br>`unit_regression` .runtime/reports/resources-v5-content-audit.json — 必需源/导出哈希、索引、偏移与内容目录；complete=false保留实际缺项，不是画面验收。<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/icons-v6-content-audit.json — 实际CLI遍历必需源/导出哈希与内容目录，complete=false；无原端、浏览器或历史配对完成声明。。

剩余缺口：

- 按原Looks准确映射后1000物品有401图标；599缺项为576越界/23占位，旧40名称+2通用替换不参与选图。
- 扩展物品内容身份与同族图库源、原端/浏览器像素及锚点比较尚未闭合。

### ART-033 DnItems掉落精灵/偏移/堆叠

状态：`partial`。实现：`apps/web/src/ground-items.ts`、`assets/web/ui-national/dnitems/library.json`、`content/classic-176/item-assets.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`native_pixels` `assets/web/ui-national/dnitems/library.json`（DnItems原帧号/几何/signed偏移与源hash；不证明动态用途）。

关闭门槛：

- 每目标物品地面索引/原偏移/脚点像原端。
- 多物同格/hover/常显/遮挡/移除正确。
- 相机移动与拾取确认期间标签不跳格不先删图。

当前验证：`source_review` `apps/web/src/ground-items.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `content/classic-176/item-assets.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- 565原帧存在，扩展缺图和默认标签风格未全比。

### ART-034 stateitem与装备纸娃娃

状态：`partial`。

现有实现：`apps/web/src/paperdoll.ts`、`apps/web/src/classic-hud.ts`、`assets/web/ui-national/stateitem/library.json`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/item-icons.ts`、`tests/item_icon_consumers_regression.mjs`、`apps/web/src/inventory.ts`。

依据及等级：`contract` content/classic-176/national-gameplay.json — 国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照<br>`native_pixels` assets/web/ui-national/stateitem/library.json — stateitem原帧号/几何/signed偏移与源hash；不证明动态用途<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。。

必须通过：

- 560帧衣服/武器/头盔实际用途与Hum世界动画区分
- 男女每类装备换装/摘下/拒绝由权威确认
- 原端窗口逐图验证纸娃娃锚点/武器头盔层级

当前验证：`source_review` apps/web/src/paperdoll.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/classic-hud.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/icons-v6-content-audit.json — 实际CLI遍历必需源/导出哈希与内容目录，complete=false；无原端、浏览器或历史配对完成声明。。

剩余缺口：

- 服装/武器/首饰已按原Looks选择stateitem且保留该族signed偏移；>=10000的StN独立扩展库尚未注册。
- 基础人体与头发页面仍需与同版原端匹配，纸娃娃层级/锚点/动作及真实浏览器比较未闭合。

### ART-035 Prguse/Prguse2全部UI底图族

状态：`partial`。

现有实现：`apps/web/src/classic-ui.ts`、`tools/import-national-ui.py`、`content/classic-176/ui-layout.json`、`apps/web/src/system-dialog.ts`、`apps/web/src/system-dialog.css`、`content/classic-176/system-dialog.json`、`docs/system-auth-implementation-2026-10-01.md`、`apps/web/src/password-change.ts`、`apps/web/src/password-change.css`、`apps/web/src/classic-auth.ts`、`apps/web/play.html`、`content/classic-176/auth-actions.json`、`services/web-gateway/PasswordChange.cs`、`services/web-gateway/GatewaySession.cs`。

依据及等级：`contract` content/classic-176/national-ui-profile.json — 目标版本/固定800×600/字体候选/参考场景<br>`contract` content/classic-176/ui-layout.json — 含asset与proposed/参考用途，须逐项分开<br>`contract` content/classic-176/ui-interactions.json — 状态帧表；CSS回退明确为proposal<br>`native_pixels` assets/web/ui-national/prguse/library.json — Prguse原帧号/几何/signed偏移与源hash；不证明动态用途<br>`contract` content/classic-176/system-dialog.json — 第八批原帧/源/几何锁；布局拟合与字体/版本/状态语义未核分别登记。。

必须通过：

- 510/14每个有效帧段有窗口/控件/状态/坐标证据
- 窗口原尺寸与透明边界正确
- optional NewopUI/Prguse3/ui1/ui3缺失按目标包证明而非异版替换

当前验证：`source_review` apps/web/src/classic-ui.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` tools/import-national-ui.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` content/classic-176/ui-layout.json — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` docs/system-auth-implementation-2026-10-01.md — 当前第八批行为、修正、源依据和验收边界；不是原端或浏览器运行证据。<br>`unit_regression` .runtime/reports/system-v8-release-web-tests.json — 33脚本420实际断言组：完整canonical后仅frame身份guard变更，32不变脚本复用、系统27组重跑；VM/fakeDOM/Pixi/media，非浏览器。<br>`unit_regression` .runtime/reports/system-v8-release-checks.json — 最终TSC/Vite通过；当前所有Web TS/CSS输入指纹、integer-div、字体契约、模态层与frame精确身份修正。<br>`unit_regression` .runtime/reports/system-auth-eighth-native-assets-final.json — 原安装Prguse16帧实际重解码，PNG bytes/RGBA/透明/偏移相等；18专项通过，字体/动态/历史配对仍unknown。。

剩余缺口：

- 新增16帧已锁源并与原WIL像素相同；整个Prguse/Prguse2族的用途、所有热区、目标版动态和全帧视觉比较仍待完成。

### ART-036 ChrSel登录/选服/选角/建角

状态：`partial`。

现有实现：`apps/web/src/classic-auth.ts`、`content/classic-176/ui-layout.json`、`assets/web/ui-national/chrsel/library.json`、`apps/web/src/password-change.ts`、`apps/web/src/password-change.css`、`apps/web/play.html`、`content/classic-176/auth-actions.json`、`services/web-gateway/PasswordChange.cs`、`services/web-gateway/GatewaySession.cs`、`docs/system-auth-implementation-2026-10-01.md`。

依据及等级：`contract` content/classic-176/national-ui-profile.json — 目标版本/固定800×600/字体候选/参考场景<br>`contract` content/classic-176/ui-layout.json — 含asset与proposed/参考用途，须逐项分开<br>`contract` content/classic-176/ui-interactions.json — 状态帧表；CSS回退明确为proposal<br>`native_pixels` assets/web/ui-national/chrsel/library.json — ChrSel原帧号/几何/signed偏移与源hash；不证明动态用途<br>`contract` content/classic-176/auth-actions.json — 第八批原帧/源/几何锁；布局拟合与字体/版本/状态语义未核分别登记。。

必须通过：

- 登录背景输入弹框/选服/空槽/选中/删除/创建每状态有同版截图
- 六画像40/80/120/160/200/240的动作与高亮段逐帧取证
- hover/pressed/disabled/pending/rejected/close/IME真实浏览器比较

当前验证：`source_review` apps/web/src/classic-auth.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` content/classic-176/ui-layout.json — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`unit_regression` .runtime/reports/frontend-events-final.log — 42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面<br>`source_review` docs/system-auth-implementation-2026-10-01.md — 当前第八批行为、修正、源依据和验收边界；不是原端或浏览器运行证据。<br>`unit_regression` .runtime/reports/system-v8-release-web-tests.json — 33脚本420实际断言组：完整canonical后仅frame身份guard变更，32不变脚本复用、系统27组重跑；VM/fakeDOM/Pixi/media，非浏览器。<br>`unit_regression` .runtime/reports/system-v8-release-checks.json — 最终TSC/Vite通过；当前所有Web TS/CSS输入指纹、integer-div、字体契约、模态层与frame精确身份修正。<br>`unit_regression` .runtime/reports/password-change-eighth-regression.json — 15组真实生产类/TCP/GatewaySession.Run，原生5.1秒等待、506/507和取消/超时/并行；fixture原生端，不冒充原服成功验收。<br>`live_protocol` .runtime/reports/password-change-live-rejection-v8.json — 真实生产控制器VM→WebSocket18801→LoginGate，仅未知账号507/0；11组，实测5190ms，SELECT前后账号/角色/索引全0；没有506成功、新旧密码登录或浏览器。<br>`unit_regression` .runtime/reports/system-auth-eighth-native-assets-final.json — 原安装Prguse16帧实际重解码，PNG bytes/RGBA/透明/偏移相等；18专项通过，字体/动态/历史配对仍unknown。。

剩余缺口：

- 新增国服50/53改密入口与像素内拟合字段；原端入口位置、字段/按钮热区、字体、按下态及完整登录/选服/选角/建角场景未逐项关闭。

### ART-037 HUD血蓝球/经验负重/数字/聊天

状态：`partial`。实现：`apps/web/src/classic-hud.ts`、`apps/web/src/classic-layout.ts`、`content/classic-176/ui-layout.json`。

证据：`contract` `content/classic-176/national-ui-profile.json`（目标版本/固定800×600/字体候选/参考场景）；`contract` `content/classic-176/ui-layout.json`（含asset与proposed/参考用途，须逐项分开）；`contract` `content/classic-176/ui-interactions.json`（状态帧表；CSS回退明确为proposal）；`native_pixels` `assets/web/ui-national/prguse/library.json`（Prguse原帧号/几何/signed偏移与源hash；不证明动态用途）。

关闭门槛：

- Prguse1原800×251在0,349绘制。
- 血蓝0/半/满、升级、耗蓝、超重的裁切/数值位置/颜色逐图比较。
- 每聊天频道颜色/滚动/输入条像原端。

当前验证：`source_review` `apps/web/src/classic-hud.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/classic-layout.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `content/classic-176/ui-layout.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 多数nationalHud坐标/热区仍proposed。
- 白底绿系统字只有历史单场景证据。

### ART-038 全部按钮状态帧/等待/失败

状态：`partial`。

现有实现：`apps/web/src/classic-auth.ts`、`apps/web/src/classic-hud.ts`、`apps/web/src/style.css`、`content/classic-176/ui-interactions.json`、`apps/web/src/system-dialog.ts`、`apps/web/src/system-dialog.css`、`content/classic-176/system-dialog.json`、`docs/system-auth-implementation-2026-10-01.md`、`apps/web/src/password-change.ts`、`apps/web/src/password-change.css`、`apps/web/play.html`、`content/classic-176/auth-actions.json`、`services/web-gateway/PasswordChange.cs`、`services/web-gateway/GatewaySession.cs`。

依据及等级：`contract` content/classic-176/national-ui-profile.json — 目标版本/固定800×600/字体候选/参考场景<br>`contract` content/classic-176/ui-layout.json — 含asset与proposed/参考用途，须逐项分开<br>`contract` content/classic-176/ui-interactions.json — 状态帧表；CSS回退明确为proposal<br>`contract` content/classic-176/system-dialog.json — 第八批原帧/源/几何锁；布局拟合与字体/版本/状态语义未核分别登记。。

必须通过：

- 每控件normal/hover/pressed/selected/disabled/pending/rejected/closed列原帧或同版无独立帧证据
- CSS状态明确proposal
- 按住移出/pointercancel/blur/focus/超时/重复点击全部真实浏览器原端对照

当前验证：`source_review` apps/web/src/classic-auth.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/classic-hud.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/style.css — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` content/classic-176/ui-interactions.json — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`unit_regression` .runtime/reports/frontend-events-final.log — 42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面<br>`source_review` docs/system-auth-implementation-2026-10-01.md — 当前第八批行为、修正、源依据和验收边界；不是原端或浏览器运行证据。<br>`unit_regression` .runtime/reports/system-v8-release-web-tests.json — 33脚本420实际断言组：完整canonical后仅frame身份guard变更，32不变脚本复用、系统27组重跑；VM/fakeDOM/Pixi/media，非浏览器。<br>`unit_regression` .runtime/reports/system-v8-release-checks.json — 最终TSC/Vite通过；当前所有Web TS/CSS输入指纹、integer-div、字体契约、模态层与frame精确身份修正。<br>`unit_regression` .runtime/reports/system-auth-eighth-native-assets-final.json — 原安装Prguse16帧实际重解码，PNG bytes/RGBA/透明/偏移相等；18专项通过，字体/动态/历史配对仍unknown。。

剩余缺口：

- 系统四按钮361–368已使用原正常/按下帧；53/64相邻54/65已排除，改密嵌入按钮按下/hover复用仍未知。
- 全部按钮disabled/等待/失败、原端鼠标动态与声音、当前浏览器比较仍需全量验收。

### ART-039 角色/背包/技能窗口及tooltip

状态：`partial`。

现有实现：`apps/web/src/classic-hud.ts`、`apps/web/src/inventory.ts`、`apps/web/src/skills.ts`、`apps/web/src/style.css`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/item-icons.ts`、`tests/item_icon_consumers_regression.mjs`、`tests/skill_icons_regression.mjs`、`docs/skill-icon-reference-2026-10-01.md`。

依据及等级：`contract` content/classic-176/national-ui-profile.json — 目标版本/固定800×600/字体候选/参考场景<br>`contract` content/classic-176/ui-layout.json — 含asset与proposed/参考用途，须逐项分开<br>`contract` content/classic-176/ui-interactions.json — 状态帧表；CSS回退明确为proposal<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。。

必须通过：

- 角色256×359、背包336×270、8×5格、金币65,190及每页内容像原端
- 持久/需求/属性/空格/选中/拿起/tooltip翻边正确
- 拖动边界/窗口组合/关闭取消逐状态比较

当前验证：`source_review` apps/web/src/classic-hud.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/inventory.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/skills.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/style.css — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`unit_regression` .runtime/reports/frontend-events-final.log — 42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/icons-v6-content-audit.json — 实际CLI遍历必需源/导出哈希与内容目录，complete=false；无原端、浏览器或历史配对完成声明。。

剩余缺口：

- 几何已有测量，内容文字/tooltip/技能窗全状态未全确认

### ART-040 NPC/买卖/修理/仓库服务内容

状态：`partial`。实现：`apps/web/src/play.ts`、`apps/web/src/shop.ts`、`apps/web/src/repair.ts`、`apps/web/src/storage.ts`、`apps/web/src/style.css`。

证据：`contract` `content/classic-176/national-ui-profile.json`（目标版本/固定800×600/字体候选/参考场景）；`contract` `content/classic-176/ui-layout.json`（含asset与proposed/参考用途，须逐项分开）；`contract` `content/classic-176/ui-interactions.json`（状态帧表；CSS回退明确为proposal）。

关闭门槛：

- 每目标服务独立取证底图/商品格/价目/持久条/数量框/基线。
- 库存空/钱不足/条件不足/等待/取消/关闭提示和按钮像原端。
- 生产和校准同组件热区对齐。

当前验证：`source_review` `apps/web/src/play.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/shop.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/repair.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/storage.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/style.css`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 402内两列商品/单列修理/四列仓库是proposal。
- 不能套现代服务流程推断1.76。

### ART-041 队伍/行会/交易/任务/系统/模式窗

状态：`partial`。

现有实现：`apps/web/src/play.ts`、`apps/web/src/classic-hud.ts`、`apps/web/src/style.css`、`apps/web/src/system-dialog.ts`、`apps/web/src/system-dialog.css`、`content/classic-176/system-dialog.json`、`docs/system-auth-implementation-2026-10-01.md`。

依据及等级：`contract` content/classic-176/national-ui-profile.json — 目标版本/固定800×600/字体候选/参考场景<br>`contract` content/classic-176/ui-layout.json — 含asset与proposed/参考用途，须逐项分开<br>`contract` content/classic-176/ui-interactions.json — 状态帧表；CSS回退明确为proposal<br>`contract` content/classic-176/system-dialog.json — 第八批原帧/源/几何锁；布局拟合与字体/版本/状态语义未核分别登记。。

必须通过：

- 逐类确认同版是窗口/菜单还是聊天命令及真正底图/列表/按钮
- 交易双方格/金币/锁定、组队邀请、行会权限、任务进度每状态取证
- 空列表/长中文/多页/拒绝/等待/断线关闭比较

当前验证：`source_review` apps/web/src/play.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/classic-hud.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/style.css — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`unit_regression` .runtime/reports/frontend-events-final.log — 42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面<br>`source_review` docs/system-auth-implementation-2026-10-01.md — 当前第八批行为、修正、源依据和验收边界；不是原端或浏览器运行证据。<br>`unit_regression` .runtime/reports/system-v8-release-web-tests.json — 33脚本420实际断言组：完整canonical后仅frame身份guard变更，32不变脚本复用、系统27组重跑；VM/fakeDOM/Pixi/media，非浏览器。<br>`unit_regression` .runtime/reports/system-v8-release-checks.json — 最终TSC/Vite通过；当前所有Web TS/CSS输入指纹、integer-div、字体契约、模态层与frame精确身份修正。<br>`unit_regression` .runtime/reports/system-auth-eighth-native-assets-final.json — 原安装Prguse16帧实际重解码，PNG bytes/RGBA/透明/偏移相等；18专项通过，字体/动态/历史配对仍unknown。。

剩余缺口：

- 系统三框/四结果和统一生产校准组件已接入；原版字体/焦点/热区、其他队伍/行会/交易/任务/模式窗口的完整同版比较仍未闭合。

### ART-042 拖动图/物品快捷栏/技能绑定反馈

状态：`partial`。

现有实现：`apps/web/src/item-quickbar.ts`、`apps/web/src/inventory.ts`、`apps/web/src/skills.ts`、`apps/web/src/window-drag.ts`、`apps/web/src/play.ts`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/item-icons.ts`、`tests/item_icon_consumers_regression.mjs`、`apps/web/src/classic-hud.ts`、`tests/skill_icons_regression.mjs`、`docs/skill-icon-reference-2026-10-01.md`。

依据及等级：`contract` content/classic-176/national-ui-profile.json — 目标版本/固定800×600/字体候选/参考场景<br>`contract` content/classic-176/ui-layout.json — 含asset与proposed/参考用途，须逐项分开<br>`contract` content/classic-176/ui-interactions.json — 状态帧表；CSS回退明确为proposal<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。。

必须通过：

- 拿起/交换/丢弃/绑定图及鼠标偏移/透明有同版依据
- F1–F8稀疏槽和1–6物品槽的选中/按下/蓄力/冷却/拒绝视觉一致
- 跨窗拖动和Escape/blur时图像及实例正确

当前验证：`source_review` apps/web/src/item-quickbar.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/inventory.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/skills.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/window-drag.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/play.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`unit_regression` .runtime/reports/frontend-events-final.log — 42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/icons-v6-content-audit.json — 实际CLI遍历必需源/导出哈希与内容目录，complete=false；无原端、浏览器或历史配对完成声明。。

剩余缺口：

- 功能回归存在，原版拖动手势/光标图/高亮冷却美术未确认

### ART-043 中文字体/编码/基线/IME

状态：`partial`。

现有实现：`content/classic-176/national-ui-profile.json`、`apps/web/src/style.css`、`apps/web/src/online-actors.ts`、`services/web-gateway/LegacyCodec.cs`、`apps/web/src/system-dialog.ts`、`apps/web/src/system-dialog.css`、`content/classic-176/system-dialog.json`、`docs/system-auth-implementation-2026-10-01.md`、`apps/web/src/password-change.ts`、`apps/web/src/password-change.css`、`apps/web/src/classic-auth.ts`。

依据及等级：`contract` content/classic-176/national-ui-profile.json — 目标版本/固定800×600/字体候选/参考场景<br>`contract` content/classic-176/ui-layout.json — 含asset与proposed/参考用途，须逐项分开<br>`contract` content/classic-176/ui-interactions.json — 状态帧表；CSS回退明确为proposal<br>`contract` content/classic-176/system-dialog.json — 第八批原帧/源/几何锁；布局拟合与字体/版本/状态语义未核分别登记。。

必须通过：

- 记录原端实际字体/许可/12px字形/间距/黑边/基线
- 旧编码转Unicode正确
- 中文ASCII全角标点长名换行输入各DPI和IME组合与原端比较且不发半成品

当前验证：`source_review` content/classic-176/national-ui-profile.json — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/style.css — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` apps/web/src/online-actors.ts — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` services/web-gateway/LegacyCodec.cs — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` docs/system-auth-implementation-2026-10-01.md — 当前第八批行为、修正、源依据和验收边界；不是原端或浏览器运行证据。<br>`unit_regression` .runtime/reports/system-v8-release-web-tests.json — 33脚本420实际断言组：完整canonical后仅frame身份guard变更，32不变脚本复用、系统27组重跑；VM/fakeDOM/Pixi/media，非浏览器。<br>`unit_regression` .runtime/reports/system-v8-release-checks.json — 最终TSC/Vite通过；当前所有Web TS/CSS输入指纹、integer-div、字体契约、模态层与frame精确身份修正。<br>`unit_regression` .runtime/reports/system-auth-eighth-native-assets-final.json — 原安装Prguse16帧实际重解码，PNG bytes/RGBA/透明/偏移相等；18专项通过，字体/动态/历史配对仍unknown。。

剩余缺口：

- 系统/改密字体与14行距从合同读取但仍为proposed，四密码字段maxlength字符与严格GBK字节规则分开。
- 同版字体栅格、baseline、中文IME、全控件编码/输入与实际浏览器事件比较尚缺。

### ART-044 国服CUR光标/热点/状态切换

状态：`partial`。实现：`apps/web/src/online-actors.ts`、`apps/web/src/style.css`、`assets/web/ui/Cursors/provenance.json`、`content/classic-176/ui-layout.json`。

证据：`contract` `content/classic-176/national-ui-profile.json`（目标版本/固定800×600/字体候选/参考场景）；`contract` `content/classic-176/ui-layout.json`（含asset与proposed/参考用途，须逐项分开）；`contract` `content/classic-176/ui-interactions.json`（状态帧表；CSS回退明确为proposal）；`reference_source` `assets/web/ui/Cursors/provenance.json`（7CUR固定Crystal来源且原国服比较pending）；`native_pixels` `C:/Program Files (x86)/shanda/Legend of Mir/mir.dat`（原PE游标候选，不自动确定用途）。

关闭门槛：

- 从同版PE或运行画面确认7种像素/尺寸/热点与用途。
- 默认NPC正常/强攻/文本/垃圾/升级与死亡/窗口遮挡切换一致。
- 真实浏览器DPI缩放下命中点正确。

当前验证：`source_review` `apps/web/src/online-actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/style.css`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `content/classic-176/ui-layout.json`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/python-events-final.log`（132项122通过、9失败1错误，失败全列于配套文档）。

未闭合：

- 当前7CUR固定hash Crystal参考，nationalRuntimeComparison:pending。
- 原PE游标身份未逐项映射。

### ART-045 544WAV原资源及移动/地表/性别声

状态：`partial`。实现：`scripts/import-national-game-assets.py`、`apps/web/src/game-audio.ts`、`assets/web/audio/manifest.json`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/SoundUtil.pas`（音效编号与BGM阶段参考，不证明全同版）；`native_pixels` `assets/web/audio/manifest.json`（544原WAV hash；kind在此表示原始媒体来源）。

关闭门槛：

- 544WAV保留hash/采样率/声道/时长/用途与空重复统计。
- 走跑/地表/男女声以原端确定触发帧频率重叠。
- 真实浏览器首手势/音量静音重登后录音比较。

当前验证：`source_review` `scripts/import-national-game-assets.py`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/game-audio.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- GameAudio只movement/swing/struck/skeletonAttack四Clip。
- levelUp未映射，有文件不等于完整事件音效。

### ART-046 武器/怪物/技能/门/升级/UI音效

状态：`partial`。实现：`apps/web/src/game-audio.ts`、`apps/web/src/play.ts`、`assets/web/audio/manifest.json`、`content/classic-176/audio-playback.json`、`docs/audio-reference-2026-10-01.md`、`tests/audio_playback_regression.mjs`、`tools/validate-native-audio.py`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/SoundUtil.pas`（音效编号与BGM阶段参考，不证明全同版）。

关闭门槛：

- 每武器/怪物APPR动作/技能各阶段/拾取/门/升级/UI有同版编号与时刻
- 成功失败取消死亡并发不重复错播
- 原端音轨/协议/Web音频时间线逐族比较

当前验证：`source_review` `apps/web/src/game-audio.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/play.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/audio-playback-final-2026-10-01.log`（生产GameAudio、实际ClassicAuth/play回调12组PASS：场景循环/切换、40并发回收、静音、异步过期、首手势当前BGM重试、play/media失败、失焦/隐藏/页面生命周期、销毁与frame2武器/专属文件选择，同场景清声后恢复与旧播放Abort隔离。fake media/events；不证明浏览器声音输出或原端混音。）；`native_pixels` `.runtime/reports/audio-native-assets-2026-10-01.json`（原装544 WAV、assets/web publicDir与dist/web逐文件byte/SHA相同，manifest544与20角色/19唯一文件映射核验；不证明触发、听感、时序。）。

未闭合：

- 七类人体近战已有frame2武器声、四专属真实SM额外声，挖矿frame5石声独立；骷髅400-2以外多数怪物/法术/门/升级/UI仍缺路由
- 原端与浏览器实际声轨、距离混音与动态时序未比较


### ART-047 登录/选角/死亡/地图BGM

状态：`partial`。实现：`apps/web/src/game-audio.ts`、`apps/web/src/classic-auth.ts`、`assets/web/audio/manifest.json`、`content/classic-176/audio-playback.json`、`apps/web/src/play.ts`、`docs/audio-reference-2026-10-01.md`、`tests/audio_playback_regression.mjs`、`tools/validate-native-audio.py`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/SoundUtil.pas`（音效编号与BGM阶段参考，不证明全同版）；`native_pixels` `C:/Program Files (x86)/shanda/Legend of Mir/Wav`（原装包含登录/选角/结束BGM文件）。

关闭门槛：

- 原Log-in-long2/sellect-loop2/Game over2各阶段和地图音乐有同版映射
- 循环接缝/切换停止/返回选角/重连/死亡复活不重叠
- 原端与浏览器长录音比较

当前验证：`source_review` `apps/web/src/game-audio.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/classic-auth.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/audio-playback-final-2026-10-01.log`（生产GameAudio、实际ClassicAuth/play回调12组PASS：场景循环/切换、40并发回收、静音、异步过期、首手势当前BGM重试、play/media失败、失焦/隐藏/页面生命周期、销毁与frame2武器/专属文件选择，同场景清声后恢复与旧播放Abort隔离。fake media/events；不证明浏览器声音输出或原端混音。）；`native_pixels` `.runtime/reports/audio-native-assets-2026-10-01.json`（原装544 WAV、assets/web publicDir与dist/web逐文件byte/SHA相同，manifest544与20角色/19唯一文件映射核验；不证明触发、听感、时序。）。

未闭合：

- 登录/选角已有原WAV循环与切换清理，原端与真实浏览器循环接缝/长录音/重连各阶段尚未对照
- 地图背景声、game over2触发尚无同版依据；参考Field2常量不等于目标触发且原包没有该文件
- 音乐/效果独立选项UI与目标默认音量/焦点行为尚未验收


### ART-048 音频混音/并发/空间/生命周期

状态：`partial`。实现：`apps/web/src/game-audio.ts`、`content/classic-176/audio-playback.json`、`apps/web/src/play.ts`、`docs/audio-reference-2026-10-01.md`、`tests/audio_playback_regression.mjs`、`tools/validate-native-audio.py`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）；`reference_source` `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/DXSounds.pas`（并发缓冲/volume/pan参考）。

关闭门槛：

- 按原端确定最大同时声数、重复音限制、音量距离衰减和声像
- 群怪连击/火墙/切图/失焦/断线不留实例
- 首手势自动播放限制与载入失败可诊断可恢复

当前验证：`source_review` `apps/web/src/game-audio.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/audio-playback-final-2026-10-01.log`（生产GameAudio、实际ClassicAuth/play回调12组PASS：场景循环/切换、40并发回收、静音、异步过期、首手势当前BGM重试、play/media失败、失焦/隐藏/页面生命周期、销毁与frame2武器/专属文件选择，同场景清声后恢复与旧播放Abort隔离。fake media/events；不证明浏览器声音输出或原端混音。）；`native_pixels` `.runtime/reports/audio-native-assets-2026-10-01.json`（原装544 WAV、assets/web publicDir与dist/web逐文件byte/SHA相同，manifest544与20角色/19唯一文件映射核验；不证明触发、听感、时序。）。

未闭合：

- 已有独立voices及结束/失败/静音/死亡/切图/断线清理、当前BGM首手势重试，真实浏览器媒体行为及原端混音对照尚未完成
- 原端群怪并发、重复音限制、目标音量/距离衰减/声像仍需同版依据与实测
- 当前失焦/隐藏暂停、一次性声音清理与单个开关属于明确Web适配；原版独立选项UI待复刻


### ART-049 最近邻/800×600/DPI/帧预算

状态：`partial`。实现：`apps/web/src/classic-stage.ts`、`apps/web/src/map-view.ts`、`apps/web/src/perf.ts`、`apps/web/src/style.css`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）。

关闭门槛：

- 逻辑800×600仅整体缩放不改坐标热区。
- nearest/roundPixels/DOM pixelated在DPI和非整数缩放清晰度比较。
- 完整人怪/窗口/动画/灯光/音效30/60fps总时长不变。

当前验证：`source_review` `apps/web/src/classic-stage.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/map-view.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/perf.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/style.css`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`unit_regression` `.runtime/reports/frontend-events-final.log`（42项前端回归；逐项查看测试范围，不能代替当前浏览器/原端画面）。

未闭合：

- 固定画布/nearest已实现，跨浏览器DPI和全资产压力未全验收。

### ART-050 逐场景原端/Web图片录像音频关闭包

状态：`missing`。实现：`tools/ui_visual_diff.py`、`apps/web/src/ui-calibration.ts`、`apps/web/src/actors.ts`。

证据：`contract` `content/classic-176/national-gameplay.json`（国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照）。

关闭门槛：

- 两端同800×600区域/角色地图装备状态步骤和时间戳。
- 静态差分保留输入hash/阈值/噪声mask/MAE/比例和人工复核。
- 动画按协议关键帧对齐逐帧比位置方向层级时长音轨。
- 每窗口状态×动作×资源族都具关闭包。

当前验证：`source_review` `tools/ui_visual_diff.py`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/ui-calibration.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）；`source_review` `apps/web/src/actors.ts`（2026-10-01 当前文件静态阅读；不证明浏览器画面）。

未闭合：

- 当前新增火墙冲撞只有协议/单元证据。
- 历史截图不证明当前dirty worktree。
- mask不得遮待验收细节。

### ART-051 美术/内容审计基线与扩展版本边界

状态：`partial`。

现有实现：`tools/content_audit.py`、`tools/resource_catalog.py`、`tests/test_asset_profile.py`、`tests/test_resource_catalog.py`、`tests/test_content_audit.py`、`docs/resource-consistency-2026-10-01.md`、`tools/ga0_tiles_candidate_audit.py`、`tools/export_ga0_tiles_candidate.py`、`content/classic-176/ga0-tiles-candidate.json`、`apps/web/src/icon-frames.ts`、`content/classic-176/icon-usage.json`、`docs/icon-source-usage-2026-10-01.md`、`apps/web/src/map-assets.ts`、`apps/web/src/map-view.ts`、`content/classic-176/map-asset-bindings.json`、`tools/map_asset_bindings.py`、`tests/test_map_asset_bindings.py`、`tests/map_assets_regression.mjs`、`tests/map_sources_regression.mjs`、`tests/map_sentinel_regression.mjs`、`docs/map-source-binding-review-2026-10-01.md`、`docs/map-sentinel-review-2026-10-01.md`、`docs/map-asset-selection-2026-10-01.md`、`tools/classic_version_boundary_audit.py`、`tests/test_classic_version_boundary_audit.py`、`docs/classic-version-boundary-2026-10-01.md`。

依据及等级：`contract` content/classic-176/national-gameplay.json — 国服原图哈希与参考动作表；动画/时序尚未原端逐帧对照<br>`contract` content/classic-176/icon-usage.json — 第六批原参考取帧规则，物品精确Looks、技能Effect×2/+1；参考版本与同包二进制对应仍待验收。<br>`contract` content/classic-176/map-asset-bindings.json — 第七批当前扩展场景精确map/layer/index选择；原national覆盖与历史配对独立保留。。

必须通过：

- 国服目标/服务器扩展/参考fallback分别审计源hash、缺帧、缺映射与待验收种类
- 解决当前9失败1错误真实原因，不删断言或改常量掩盖资源
- 所有ART关闭包齐备才称完整

当前验证：`source_review` tools/content_audit.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` tools/resource_catalog.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` tests/test_asset_profile.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` tests/test_resource_catalog.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`source_review` tests/test_content_audit.py — 2026-10-01 当前文件静态阅读；不证明浏览器画面<br>`unit_regression` .runtime/reports/python-events-final.log — 132项122通过、9失败1错误，失败全列于配套文档<br>`native_pixels` .runtime/reports/national-map-import.json — 2026-10-01 本机真实apply：profile570、requestedUnique14882、alreadyPresent4635、exported9839、empty0、unresolved408（仅GA0）；completefalse/退出2。现manifest和9839输出文件存在性复核；不证明HTTP或浏览器画面<br>`source_review` .runtime/backups/national-map-frames-20261001 — apply前现有三族manifest备份；保留导入前10247唯一缺帧基线<br>`unit_regression` .runtime/reports/replication-map-regression.log — 2026-10-01 11项地图导入夹具全部OK：source preflight/合并保留/幂等/范围外/缺map/损坏帧等；不证明原端/Web图像<br>`unit_regression` .runtime/reports/national-map-repeat-plan.json — apply后真实重复计划：requestedUnique14882/alreadyPresent14474/exportable0/empty0/unresolved408/exported0/completefalse；已补源内帧不会重复规划<br>`unit_regression` .runtime/reports/replication-python-full.log — apply后全量151项：141通过、9失败、1错误；地图首报GA0/Tiles10320，其余已记录契约/扩展/环境失败继续保留<br>`unit_regression` .runtime/reports/resources-v5-checks.json — 第五批当前源码：242组Node回归/21脚本；完整Python257项，失败1项；非浏览器。<br>`unit_regression` .runtime/reports/resources-v5-content-audit.json — 必需源/导出哈希、索引、偏移与内容目录；complete=false保留实际缺项，不是画面验收。<br>`unit_regression` .runtime/reports/icons-v6-web-tests.json — 第六批324组/27脚本实际模块/VM回归；含准确取帧/故障重试/旧回调/切图事务，非浏览器。<br>`unit_regression` .runtime/reports/icons-v6-python-checks.json — 完整Python279项/278通过，剩1项GA0当前source缺帧；独立内容CLI exit1。<br>`unit_regression` .runtime/reports/ga0-tiles-source-freeze-sixth-final.json — 候选408个索引逐像素解码一致、19专项、独立namespace及重复导出0写入；现国服/GA0文件4284项SHA未变，未激活candidate。<br>`unit_regression` .runtime/reports/icons-v6-content-audit.json — 实际CLI遍历必需源/导出哈希与内容目录，complete=false；无原端、浏览器或历史配对完成声明。<br>`unit_regression` .runtime/reports/map-v7-sentinel-web-tests.json — 最终实际352组/30脚本模块/VM/Pixi回归；含源选择、54特殊引用nil路径和切图/失败恢复，非浏览器。<br>`unit_regression` .runtime/reports/map-v7-final-python-checks.json — 修复默认源路径后完整Python339/339通过；current render与original fidelity分别断言，独立内容CLI继续exit1。<br>`unit_regression` .runtime/reports/map-binding-seventh-source-freeze.json — MAP/blob/9chunk/source字节与408参考PNG、125国服保留帧逐解码核对；enabled参考选择，historical pairing=false。<br>`unit_regression` .runtime/reports/map-v7-final-content-audit.json — 最终实际内容CLI，renderDependencyMissing空、原national GA0缺408与historicalFailure保持；complete=false。。

剩余缺口：

- 完整内容CLI保持exit1/complete=false：原国服GA0 408及历史配对、599物品/63技能缺图与MagID48冲突未闭合。
- 参考渲染接入不增加39个生效国服库；1000物品/108技能逐行版本边界保持unknown历史状态，未解析入口和条件不能用于删减目标。
- 同版原端、当前浏览器、GPU、逐像素/时序/音画与适用异常持久化验收逐条开放。

## 6. 后续记录规则

每次实施更新机器底稿对应稳定ID的implementation、verification、gaps和status；新规则/原端证据发现可以新增ID，不复用旧ID代表别的需求。验证条目要说清原版程序/包hash、代码状态、测试运行环境、场景/状态覆盖、报告路径、结果与未覆盖部分。不要把代码文件名作为“真实运行通过”的证据。

追加关闭记录建议字段为：日期、ART ID、用户可见改变、原端证据、浏览器场景、协议/单元证据、资产hash、结果、剩余gaps。原端/Web差分需要保留输入hash、噪声mask/阈值与人工复核；mask不能遮盖要验收的控件或效果。地图、动作与音效的统计分母应保持“唯一源帧 / 映射用途 / 验收状态”三个层级。

美术盘点阶段修改本清单及机器底稿；后续授权实施ART-023的角色状态层及专用契约/回归，证据写入对应ID。Root真实运行地图补帧，结果已在第3节追加，导入前10,247缺索引作为历史基线保留；原装/服务端版本差异、GA0越界、D718/D719及原端/浏览器视觉验收继续追踪。

## 2026-10-01 第五批：地图与资源一致性

本批生产修复和剩余范围见 [resource-consistency-2026-10-01.md](resource-consistency-2026-10-01.md)。生效源与参考候选、572张地图及两张服务端扩展、地图子集刷怪过滤、真实缺图和ID48冲突分别追踪；运行配置与数据库未修改。

本批检查：242组/21个Node脚本；完整Python257项，失败1项；全套之后的Node版本预检修复单独重跑8安装+2备份专项通过，不再重复未变的逐帧审计。内容审计complete=false。回执 `.runtime/reports/resources-v5-checks.json`、`resources-v5-content-audit.json`，批次汇总 `replication-resources-v5-batch.json`。这些是资源/静态/模块证据，不代表原端、浏览器或音画验收；195项目标和状态边界保留。

## 2026-10-01 第六批：原索引、加载恢复与切图事务

本批细节见 [原客户端图标规则与加载恢复](icon-source-usage-2026-10-01.md)；更新ID：ART-003、ART-005、ART-032、ART-034、ART-039、ART-042、ART-051。

实际模块回归324组/27脚本；完整Python279项，278通过，GA0既有缺帧1失败；内容审计仍exit1/complete=false。HTTP421文件字节相同只证明资源可访问。195项状态边界不变，无浏览器/原端/GPU完整关闭。中央回执 `.runtime/reports/replication-icons-v6-batch.json`。

## 2026-10-01 第七批：地图来源选择与完整内容版本边界

本批细节见 [地图来源选择](map-asset-selection-2026-10-01.md) 和 [全量版本边界](classic-version-boundary-2026-10-01.md)。更新ID：ART-003、ART-005、ART-023、ART-051。

最终实际352组/30脚本通过；完整Python339/339通过；内容CLI仍exit1/complete=false。HTTP1454文件源/服务/dist一致；本批未改原服/网关/配置/数据库。调色板导出默认目录改为原版资源锁指定目录，另一路原端装备overlay部署不归为本批。195项状态不提升为原端/浏览器完整verified。回执 `.runtime/reports/replication-map-v7-batch.json`。

## 第八批：系统确认与改密

更新ID：ART-035、ART-036、ART-038、ART-041、ART-043。实际范围与未完成项见 [系统与认证实现](system-auth-implementation-2026-10-01.md)。统一系统组件/改密前后端已接，原服只读拒绝链已验证；原端、当前浏览器、真实成功改密与完整退出保存仍未关闭。新回执前缀system-v8，旧尝试与旧批次保留。

## 第十三批当前进度（保留上方初始审计快照）

默认死亡调色、原始遮罩/暗度表和权威光值已按当前JSON台账追踪。ART-009/010现partial，其余相关需求保持partial；总195项为5implemented/183partial/7missing/0verified。夜景未绘制，原端/浏览器验收及完整天气/光源/死亡玩法仍开放。上方2026-10-01审查与缺口作为历史快照保留，当前范围、执行报告和版本差异见[第十三批主题](scene-lighting-death-implementation-2026-10-02.md)及各领域replication JSON。

## 2026-10-02 第十四批选角删除与确认闭环

选角新增国服原帧70删除按钮，开始/新建/删除/退出按参考SetImgIndex图尺寸和坐标布局。三选确认后只发送一次CM102，SM523/524后均重新查询SM520；ACK成功但角色仍在时提示未确认删除，坏包/超时/断线不伪造回滚、不自动重发，返回登录核对列表。星号保留为selected，角色白名单刷新原子发布。制作群参考回调为空且入口初始化被注释，保留目标版待确认。

42网页脚本497PASS标记、TSC/Vite及9网关入口80实际组通过；删除专项7组真实privateTCP/Run，离线校准4个AST结果分支通过。5原图/清单源HTTP/dist一致，6当前页面/模块可取；新网关已独立publish/HTTP/WS验证，18801因仍有连接保留PID12516上一版，新删除能力未由现有网关启用。UI-018从missing到partial，195项为5implemented/184partial/6missing/0verified。完整Python384/384通过，290个输入前后稳定，结果记录在`selection-v14-python.json`；原服/SQL/真实角色未修改。详见[实现与未关闭范围](selection-delete-implementation-2026-10-02.md)，最终指纹使用`replication-selection-v14-batch.json`。
