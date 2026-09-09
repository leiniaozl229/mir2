# 实施状态

状态快照：2026-09-09。本文只记录当前工作树和最近一次可复现报告；历史审查与旧指标已移到 [`docs/archive/`](archive/README.md)。实施范围与未完成项仍以 [`PLAN.md`](../PLAN.md) 为准。

## 当前基线

| 检查 | 当前结果 | 证据 |
| --- | --- | --- |
| 安装清单 | 通过 | `python3 scripts/install-check.py` |
| 前端生产构建 | 通过，715 个模块 | `npm run build` |
| 前端回归 | 32/32 通过 | `npm run test:web` |
| Python 回归 | 96/96 通过 | `python3 -m unittest discover -s tests -p 'test_*.py'` |
| 内容闭合 | 570/570 地图、路线目的地 570/570、依赖缺口 0 | `.runtime/reports/content-audit.json` |
| 国服 UI 素材验证 | `ready-for-decoder`，必需缺项 0 | `.runtime/reports/national-ui-validation.json` |
| 移动回放 | 接受 22、拒绝 0，返回起点 | `.runtime/reports/movement-replay.json` |
| 协议主流程 | 登录、选服、选角、入图、移动和位置恢复通过 | `.runtime/reports/protocol.json` |
| 战斗与掉落 | 鸡战斗、死亡、挖肉、地面物品拾取通过 | `.runtime/reports/combat.json`、`drop-pickup.json` |
| 技能实战 | 15 个技能场景通过 | `.runtime/reports/skill-combat.json` |
| 行会战夹具 | 通过 | `.runtime/reports/guild-war.json` |
| 会话稳定性 | 30 秒、10 次快照通过 | `.runtime/reports/session-stability.json` |
| 重连 | 5 个周期通过，属性/装备/背包/技能快照齐全 | `.runtime/reports/reconnect.json` |
| 异常退出恢复 | 1 秒故障延迟下恢复已保存坐标 | `.runtime/reports/power-loss.json` |
| 帧预算 | 普通与 100 对象压力场景 p95 均 16.7ms，约 59.88 FPS | `.runtime/reports/frame-budget.json` |

`gateway.json` 仍记录一次浏览器背包与 TCP 基线不一致，因此综合网关探针不标记为整体通过；协议主流程、物品回归和独立网关用例分别看各自报告。

## 运行模式

- `python3 scripts/prepare-runtime.py --refresh-p0` 生成最小 P0 运行目录，适合确定性战斗和掉落回归。P0 任务审计会有意跳过源数据中的 Q001，并在报告中写入 `skippedRuntimeEntries: ["Q001"]`。
- `python3 scripts/prepare-runtime.py --refresh-classic-route` 生成经典路线运行目录。当前 `.runtime/server/Mir200/Envir/MapInfo.txt` 含 570 张地图，`MapQuest.txt` 含 Q001；内容审计的 570 张地图与路线闭合结果对应此目录。
- 运行服务由 MySQL、OpenMir2 的 Login/DB/Game 服务、旧版 Gate 服务、WebSocket 网关和 Vite 前端组成。浏览器只连接网关，账号、角色、坐标、背包、装备、技能和战斗结果由服务端确认。

## UI 与资源状态

本地 2003 国服安装包已完成只读解包，锁定 SHA-256，并导出 `Prguse`、`Prguse2`、`ChrSel`、`mmap`、`stateitem`、`MagIcon`、`Items`、`DnItems` 八组核心 WIL/WIX 素材，共 2,760 个帧条目（含空白占位帧）。`NewopUI`、`Prguse3`、`ui1`、`ui3` 在该包中缺失，契约将它们标记为可选族；页面会显示缺项并回退到 Crystal 候选素材。导出结果位于被 Git 忽略的 `assets/web/ui-national`，可按 [`docs/client-ui-replication.md`](client-ui-replication.md) 重建。

游戏画布固定为 800×600。登录、选角、HUD、六槽物品快捷栏、角色、背包、NPC、商店、修理、仓库、任务、攻击模式、目标、地面物品、队伍、行会、系统弹窗、聊天和交易已接入共享生产组件与校准页。原端逐像素位置、字体基线、完整热区时序和每个窗口的动态证据仍需逐项验收；导出帧数量不能替代原端截图差分。

## 可复现资源链

`assets/raw/` 与 `assets/web/` 均被 Git 忽略。地图、Crystal 图库、角色、效果、物品、声音和游标的下载地址、字节数与 SHA-256 位于 `content/classic-176/asset-sources.json`；执行 `python3 scripts/import-map-assets.py` 会在缺少源文件时自动下载并校验，哈希变化会中止导入。国服安装包素材需要用户自行准备解出的 `Data` 目录，再运行 `tools/validate-national-ui.py` 和 `tools/import-national-ui.py`。

## 未完成验收

- Windows 11 上运行原版 `mir.exe` 的动态启动、登录、协议兼容和原端截图采集。
- 原端逐像素 UI 校准、字体与光标确认，以及 Safari/Firefox 首发验证。
- 完整 1.76 任务、怪物视觉和地图动态内容的逐条浏览器回归。
- 完整沙巴克战役、攻城计时、占城和联盟战斗场景。
- 连续两小时以上稳定性、真实主机断电和云服务器部署验收。

原版客户端不需要参与浏览器运行链路。保留它的价值在于提供视觉、资源和协议线索；浏览器运行由自有 OpenMir2 服务端与 WebSocket 网关承载。关于原端无法在当前 macOS 直接运行时的替代方案，见 [`docs/ui-fidelity-audit-2026-09-09.md`](ui-fidelity-audit-2026-09-09.md)。
