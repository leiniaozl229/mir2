# 安装、备份与交付

本文对应 2026-09-09 的可复现基线。历史运行快照保存在 [`docs/archive/`](archive/README.md)，当前功能与缺口见 [`docs/implementation-status.md`](implementation-status.md)。

## 干净检出

需要 Git、Python 3、Node.js/npm、Docker 和 Docker Compose。Apple Silicon 可使用 Colima；脚本会自动选择 `docker compose` 或 `docker-compose`。`vendor/openmir2` 已随主仓库提交，`vendor/mirserver-data` 使用公开数据子模块；干净检出只需初始化该数据子模块。

```sh
git clone <repository-url>
cd mir2
git submodule update --init --recursive
npm ci
python3 scripts/install-check.py
bash scripts/build-server.sh
bash scripts/build-gateway.sh
python3 scripts/import-native-map-sources.py --client-map-dir /path/to/reference-client/Map
python3 scripts/prepare-runtime.py --refresh-classic-route
python3 scripts/import-map-assets.py --maps-only
python3 scripts/import-national-map-assets.py --data-dir /path/to/reference-client/Data --apply
python3 scripts/import-national-game-assets.py --client-dir /path/to/reference-client
python3 tools/import-national-ui.py --data-dir /path/to/reference-client/Data --export-root assets/web/ui-national
bash scripts/compose.sh up -d
python3 scripts/wait-ready.py
npm run dev
```

打开 `http://127.0.0.1:5173/play.html` 进入联机页，`http://127.0.0.1:5173/ui-calibration.html` 进入 800×600 国服 UI 校准页。旧协议服务端端口由 Compose 保持在本机回环地址，WebSocket 网关入口为 `127.0.0.1:18800/ws`。

生产主流程现要求网关声明`connected.features.entryScenes=true`，登录时提交`interactiveLogin:true`以展示原服服务器列表和入图公告。更新这组前端时须同时发布当前网关；旧网关将显示主流程能力缺失并返回登录。具体协议与网页适配见[选服和入图公告](entry-scenes-implementation-2026-10-07.md)。

`assets/raw/` 和 `assets/web/` 属于可重建产物并被 Git 忽略。`content/classic-176/asset-sources.json` 锁定下载地址、文件大小和 SHA-256；导入器缺少源文件时会自动下载，哈希变化会停止导入。国服 UI 原始帧需要用户准备 2003 客户端解出的 `Data` 目录，再执行：

```sh
python3 tools/validate-national-ui.py --data-dir /path/to/Data
python3 tools/import-national-ui.py --data-dir /path/to/Data --export-root assets/web/ui-national
python3 tools/validate-national-ui.py --data-dir /path/to/Data \
  --export-root assets/web/ui-national --json .runtime/reports/national-ui-validation.json
```

生产页面使用国服资源会话；缺少所需库时显示缺项并提供重试。地图单元来自`map-sources.json`共同来源契约，六张不同的原图必须先导入；现有运行目录更新流程见[原地图来源说明](original-map-sources-2026-10-07.md)。安装包用于资源、视觉和协议取证，浏览器运行链路由自有OpenMir2服务端与WebSocket网关提供。

## 运行模式

安装预检现在显式选择环境：`python3 scripts/install-check.py --mode compose` 保持容器交付要求，检查 Docker CLI、Compose、Bash 和 Node/npm；`python scripts/install-check.py --mode native-windows` 检查本机 Windows、MySQL 客户端、Node/npm、.NET 8 服务端运行时及项目默认 .NET 10 网关 SDK/运行时。可用 `--dotnet`、`--node`、`--npm`、`--mysql` 指定绝对工具路径。预检只读，不初始化数据库、不构建、不启动服务，`ok` 仅代表安装依赖存在，不能作为联机就绪证明。

本机模式报告的 `deliveryComplete` 仍为 false：MySQL 初始化、网关启动配置、本机备份/恢复尚未形成仓库内完整自动交付链。`backup.py create/restore` 和 `wait-ready.py` 使用 Compose，本机模式不会输出这些命令冒充适用操作。本机六服务可用 `scripts/run-server-native.py start/stop/status --dotnet <path>` 管理；发布文件或刷新配置前，先正常保存停服并验证本机备份。2026-10-01 的 .NET 8 网关兼容测试构建与项目默认 net10 构建分别登记。

- `python3 scripts/prepare-runtime.py --refresh-p0` 生成最小 P0 世界，适合确定性战斗、技能和掉落回归；P0 任务审计会报告跳过 Q001。
- `python3 scripts/prepare-runtime.py --refresh-classic-route` 生成 570 张地图的经典路线目录，并保留账号与角色存档；当前目录包含 Q001 地图任务。
- 切换运行模式后重启 `engine` 和 `web-gateway`。修改运行配置前先创建备份。

## Compose模式停服与备份

正常停服会先停止网关、请求在线角色保存并等待数据库确认，再停止引擎和数据库：

```sh
bash scripts/compose.sh stop
```

备份工具会导出 `mir2_account`、`mir2_db`、`mir2_data` 及行会、沙巴克文件，数据库密码不会写入归档：

```sh
python3 scripts/backup.py create
python3 scripts/backup.py verify .runtime/backups/mir2-save-YYYYMMDD-HHMMSS.tar.gz
python3 scripts/backup.py restore .runtime/backups/mir2-save-YYYYMMDD-HHMMSS.tar.gz --yes
```

## 验收命令

```sh
python3 scripts/install-check.py
npm run build
npm run test:web
python3 -m unittest discover -s tests -p 'test_*.py'
python3 tools/content_audit.py --verify-hashes \
  --json .runtime/reports/content-audit.json \
  --markdown .runtime/reports/content-audit.md
python3 tools/world_catalog_audit.py --json .runtime/reports/world-catalog.json
python3 tools/skill_combat_audit.py --json .runtime/reports/skill-combat-audit.json
python3 tools/quest_catalog_audit.py --runtime-mode p0 \
  --json .runtime/reports/quest-catalog-audit.json
node tools/movement_replay.mjs
node tools/reconnect_probe.mjs
node tools/session_stability_probe.mjs
node tools/frame_budget_probe.mjs
node tools/power_loss_probe.mjs
```

双客户端 PK、交易和行会战使用 `tools/pvp_fixture_setup.mjs`、`tools/pvp_probe.mjs`、`tools/trade_probe.mjs` 与 `scripts/run-guild-war-known-fixture.sh`。报告全部写入被忽略的 `.runtime/reports/`，不应提交账号、密码、令牌或个人存档。

## 交付限制

此前基线已验证 OpenMir2 服务端、WebSocket 网关、浏览器登录/选角/入图/移动、P0 战斗与掉落、15 项技能、行会战夹具、570 张地图内容闭合、30 秒稳定性、5 个重连周期、异常退出恢复和 60 FPS 帧预算。2026-09-29 在 Windows 11 上又实测 2003 原版客户端通过回环协议桥在可移动的 800×600 窗口中登录、选服、选角、入图并点击移动；登录框显示账号和密码星号。旧协议桥与窗口辅助程序的源码分别位于 `scripts/old-client-codec-proxy.py` 和 `tools/native-window-fix/`。原客户端程序、dgVoodoo 兼容 DLL、账号、数据库和本机桌面启动脚本不在仓库交付文件中；干净检出尚不能直接复现本机窗口入口。跨地图、完整原端玩法、逐像素 UI 校准、Safari/Firefox、完整 1.76 内容与沙巴克战役、两小时稳定性、真实主机断电和云部署仍需专项验收。测试范围与此前全量 Python 回归的已知失败见 [实施状态](implementation-status.md)。
