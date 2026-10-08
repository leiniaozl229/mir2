# 地图素材选择与原版配对 · 2026-10-01

第七批将已导出的 408 张参考地砖接入当前固定服务器 GA0 场景。当前选择契约是 `content/classic-176/map-asset-bindings.json`，作用范围为 GA0、background 层、Tiles 和契约逐项列出的原索引。国服地图/图库的历史配对与当前场景能否渲染分别验收。

## 选择范围

| 对象 | 当前规则 | 证据边界 |
|---|---|---|
| GA0 MAP | 固定子模块提交 `f38deae64c521a28f8e0d86f2bf24d4ba7c9ea5c`，270052 bytes，SHA `231b29ef5afa24aa276d195c037fa576b268033726642f0750e8c5ae2bbe5c2f` | 服务端扩展场景；本机原装 528 张 Map 中没有 GA0 |
| 408 个背景 Tiles 原索引 | `/libraries/reference-ga0/Tiles`，锁定 Crystal v2 的 31775 帧源；按原索引选图 | `reference_source`；没有历史原包配对证明 |
| 125 个已有 Tiles 索引 | 继续 `/libraries/Tiles` 的国服源 | 9、14 明确保留；候选这两个索引与国服不同 |
| 其他地图、其他图层、其他原索引 | 使用原来注册的国服源；越界或缺帧保留诊断 | 候选可用不扩大选择范围 |
| 地砖坐标 | 背景地砖直接绘制在格坐标，保持 nearest | 原素材 `(7,-44)` offset 保留于元数据，地砖绘制不统一加偏移；真实 GPU/原端画面待验 |

第六批 `ga0-tiles-candidate.json` 与候选 `library.json` 的 `mapBindingActive:false` 是当时导出快照，文件保持原样便于核对历史回执。当前是否选择由新契约的 enabled 状态、地图 SHA、源身份与索引集合决定。资源目录分别记录当前选择和导出快照；管理页显示“GA0参考源已选择，原版配对待核”。物品与技能的候选选择保持各自原有契约。

## 生产路径与恢复

`apps/web/src/map-assets.ts` 共用 map/layer/library/index 解析。原国服身份需要与 `active-asset-sources.json` 的 WIL/WIX、帧数和格式声明一致；参考选择再核对 enabled、GA0 MAP SHA、参考库 SHA、帧数、格式、namespace、原索引范围和保护集合。默认静态契约预编译、三类国服源预索引，避免每个地砖重复扫描全量锁表与 408 个索引。

`map-view.ts` 根据当前地图只请求对应候选 manifest。每个动画索引独立解析 frame、source 和 URL，纹理缓存以完整 URL 为键。切图继续使用第六批的请求代数和事务提交：旧 manifest、chunk、纹理完成或失败不能提交到新场景；碰撞、门和动画只随当前请求提交。失败请求退出相应 Promise 缓存，后续地图请求可重试。

运行时检查加载 manifest 的身份声明和帧元数据。原始 MAP/WIL/WIX/Lib、PNG 字节及解码像素由离线审计核对，HTTP 检查核对实际服务和构建文件；这三个范围分别登记，运行时元数据检查不等同逐文件加密哈希验证。

固定 GA0 的原始格子还包含 54 处高索引引用：背景 Tiles 20 处、中层 SmTiles 34 处。参考 WIL 在索引超过图库帧数时返回 nil；Web 在精确地图 SHA、图层及国服源身份均通过后，按相同结果跳过绘制，独立计为 `referenceRuleSkipped`，并保留原碰撞位。状态与 `renderDiagnostics` 只随当前场景提交。这不是所有地图通用的保留值规则；中层原源码使用未掩码值，与本图 Web 解码值均越界，只证明本图这 34 处结果相同。原始格子、54 处坐标和碰撞位回执为 `.runtime/reports/map-sentinel-seventh-source.json`，实现核对见 [高索引路径复查](map-sentinel-review-2026-10-01.md)。

独立复查修正了管理目录的三处诊断：enabled 但锁校验失败仍须报错；改动配对声明布尔值不能升级为历史配对已验证；存在缩略图的未配对地图仍须进入缺项筛选。实际 Python 与页面函数回归保留于 `.runtime/reports/map-catalog-seventh-resolved.json`。

## 审计与历史配对

`tools/map_asset_bindings.py` 验证锁定 MAP 的 blob/字节及配对报告中的提交声明，按 22500 个格子和 9 个 chunk 重建依赖，再核对 408 个候选 PNG 的原索引、几何、透明度和解码字节，以及 125 个保留国服帧的原 WIL 解码。纯审计函数不读取 Git checkout；实际子模块提交另由 Root 基线和配对取证中的 Git 命令核对。只有技术锁一致且 enabled 的条目能通过 `resolve_bound_frame` 提供当前参考帧。

`content_audit.py` 同时保留原国服 `maps.dependencyMissing` 与新增的当前选择 `maps.renderDependencyMissing`。当前 GA0 的原国服 408 缺项继续在前者登记；显式参考选择解决当前渲染后，后者可以为空。`maps.assetBindings.historicalFailures` 保留未核实配对，完整 `complete=false`。

同一 Crystal patch 的 Map 目录与 Unused 目录两个 GA0 文件都是 337554 bytes、SHA `a2f6533351d63a1547b051cce4acdabf828d58b6bbca9bfe555913e02ce9472b`；Unused/nGA0 是 864052 bytes、SHA `a37dedaf1e836d461da9eaf2e22212c266109dca4a30b4ea213ad2e39520b7e0`。三份文件都与固定服务器 GA0 不同。目录共存与候选可解码只提供参考来源线索；本次有界检索未找到与目标同字节的原始 MAP/图库包。

配对原始回执 `.runtime/reports/ga0-pairing-seventh.json` 保留实际目录 HTML、三份 MAP、锁定源和本机原 Map 文件名清单的 SHA。检查范围包含所列目录与本机固定来源，完整历史归档检索、同包原客户端执行和真实浏览器画面仍待完成。

## 全量内容与验收

完整内容仍包含 1000 物品、108 技能及 572 个服务端地图目标。版本范围另见 [完整内容版本边界](classic-version-boundary-2026-10-01.md)；15 个锁参数技能与 1–33 的经典输入契约是当前实现子集，各行的历史版本证据独立保留。当前 599 个物品图标、63 个技能图标和 MagicID48 身份冲突继续开放。

| 检查 | 实际结果 | .runtime/reports 回执 |
|---|---|---|
| TypeScript / Vite | 首轮optional帧数类型错误已保留；修正及54引用补齐后最终构建通过 | map-v7-tsc.log、map-v7-build-final.json、map-v7-sentinel-web-checks.json |
| 全量前端模块 | 352组/30脚本通过；真实生产模块、VM与Pixi类，Application/network模拟 | map-v7-sentinel-web-tests.json |
| 完整 Python | 修正调色板默认源目录后339/339通过；原national408与历史失败继续断言，初始332/331/1error回执保留 | map-v7-final-python-checks.json、map-v7-python-checks.json |
| 完整内容审计 | 最终CLI exit1；current render规范依赖无缺，original national GA0408、historical pairing及599/63/ID48继续失败 | map-v7-final-content-audit.json |
| HTTP / 构建字节 | 1454项一致，含409候选文件、全部GA0有效依赖的导出帧和9chunk/map manifest；play/resources/18801 ready | map-v7-http.json |
| 运行服务 | 最终ready、HTTP200且6个运行DLL相同；期间原服PID已变化，5173/18801 PID保持。本批未主动重启或改配置/数据库/夹具；原端装备overlay另有独立部署记录 | map-v7-runtime-final.json、map-v7-runtime-closure.json、map-v7-runtime-closure-ports.json |

195项仍5 implemented /178 partial /12 missing /0 verified。旧批次和本批先前失败/37组接入回执保留，最后指纹见 `replication-map-v7-batch.json`。
