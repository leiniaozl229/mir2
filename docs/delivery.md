# 安装、备份与交付

本机按 README.md 的开发步骤可以从干净目录进入同一比奇参考场景。下面把启动、停服、备份和恢复收成可重复命令。完整玩法范围仍以 PLAN.md 为准。

## 安装

需要 Git、Python 3、Docker（Apple Silicon 可用 Colima）以及 Docker Compose 或独立的 `docker-compose`。

```sh
git submodule update --init --recursive
python3 scripts/install-check.py
bash scripts/build-server.sh
bash scripts/build-gateway.sh
python3 scripts/prepare-runtime.py
bash scripts/compose.sh up -d
python3 scripts/wait-ready.py
```

`python3 scripts/prepare-runtime.py --refresh-classic-route` 会接入 570 张可解析地图、刷怪、NPC 脚本和 MapQuest。浏览器客户端：

```sh
python3 scripts/import-map-assets.py
npm ci
npm run dev
```

联机入口：http://127.0.0.1:5173/play.html 。WebSocket 为 `127.0.0.1:18800/ws`。

2003 国服 UI 基准入口：http://127.0.0.1:5173/ui-calibration.html 。页面会优先加载 `assets/web/ui-national` 中的国服原始帧，缺少导入产物时回退到 Crystal 候选帧；加载国服参考截图后，可在固定 800×600 画布上切换登录、选角、创建角色、主 HUD、角色窗、背包窗和 NPC 对话，使用透明度、网格和坐标尺完成逐窗口校准。导入客户端前运行 `python3 tools/validate-national-ui.py --data-dir /path/to/Data`，确认必需素材族齐全；WIL/WIX 或 WZL/WZX 可直接运行 `python3 tools/import-national-ui.py --data-dir /path/to/Data` 导出到隔离的 `assets/web/ui-national`。当前 2003 客户端包实测导出 8 组核心素材、2,756 帧，NewopUI、Prguse3、ui1、ui3 在包内缺失并按版本契约作为可选族处理。

当前联机页的商店、修理和仓库会使用国服 `Prguse#402` 窗口框，并在物品实例数据到达后显示 `Items` 图标；`stateitem` 大尺寸装备帧的真实 `Image` 映射仍需结合服务端物品字段继续校准。

## 存档

角色进度在 MySQL。浏览器只缓存可再下载的素材和个人设置。

```sh
python3 scripts/backup.py create
python3 scripts/backup.py verify .runtime/backups/mir2-save-YYYYMMDD-HHMMSS.tar.gz
python3 scripts/backup.py restore .runtime/backups/mir2-save-YYYYMMDD-HHMMSS.tar.gz --yes
```

创建备份会先断开网关、保存在线角色并等待数据库确认，再导出 `mir2_account`、`mir2_db`、`mir2_data` 以及行会和沙巴克文件。恢复会替换当前账号、角色、游戏数据、行会和城堡状态。

正常停服：

```sh
bash scripts/compose.sh stop
```

## 验收入口

最新验收记录见 [2026-09-08 整体 review](reviews/2026-09-08-review.md)。R01–R10 已完成代码修复；前端 5 项交互回归、81 项 Python、CoreRegression 和 GatewayRegression 通过。试玩中出现 Colima 连接 / 挂载异常及引擎退出，真实服务复验仍需在环境恢复后完成。

执行验收前需记录当前运行模式：本轮实际只有 `0 / D001`，570 张地图导出不等同于完整世界加载。任务审计现报告 `runtimeMode`、`expectedRuntimeEntries`、`skippedRuntimeEntries` 和 `missingRuntimeEntries`；经典路线缺少必需任务时返回失败。下表中的主动故障、停服与双行会夹具属于独立场景，本轮未重跑。

| 检查 | 命令 |
|---|---|
| 内容引用闭合 | `python3 tools/content_audit.py` |
| 世界刷怪清单 | `python3 tools/world_catalog_audit.py --json .runtime/reports/world-catalog.json` |
| 15 项技能实战 | `node tools/skill_combat_probe.mjs` |
| 800×600 帧预算 | `node tools/frame_budget_probe.mjs` |
| 20 次断线重连 | `node tools/reconnect_probe.mjs` |
| 断线重连快照 | `node tools/session_stability_probe.mjs`；2 小时验收使用 `MIR2_STABILITY_MS=7200000 node tools/session_stability_probe.mjs` |
| 异常退出回退 | `node tools/power_loss_probe.mjs` |
| 双行会宣战与倒计时 | `bash scripts/run-guild-war-known-fixture.sh` |
| 有效攻城申请 | `MIR2_GUILD_EXPECT_CASTLE_SUBMISSION=1 bash scripts/run-guild-war-known-fixture.sh` |
| 安装清单 | `python3 scripts/install-check.py` |

帧预算页：http://127.0.0.1:5173/perf.html 。默认采样比奇 `296,624` 的 800×600 画布；`?pressure=100` 额外放入 100 个可见对象。报告写入 `.runtime/reports/frame-budget.json` 与 `.runtime/reports/reconnect.json`。

已知限制：原端逐像素对照、完整旧服任务筛选、沙巴克联机战役、Safari / Firefox 首发关闭和连续 2 小时稳定性仍按 PLAN.md 后续验收。双行会宣战、双方倒计时和有效攻城申请已有实机回归；该入口会创建并清理临时角色、行会文件，结束后恢复沙巴克申请文件、引擎和 Web 网关。
