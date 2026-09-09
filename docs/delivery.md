# 安装、备份与交付

本文对应 2026-09-09 的可复现基线。历史运行快照保存在 [`docs/archive/`](archive/README.md)，当前功能与缺口见 [`docs/implementation-status.md`](implementation-status.md)。

## 干净检出

需要 Git、Python 3、Node.js/npm、Docker 和 Docker Compose。Apple Silicon 可使用 Colima；脚本会自动选择 `docker compose` 或 `docker-compose`。`vendor/openmir2` 由私有镜像 `leiniaozl229/mir2-openmir2` 提供固定提交，`vendor/mirserver-data` 使用公开数据仓库。干净检出需要对主仓库和私有镜像具备 GitHub 访问权限。

```sh
git clone <repository-url>
cd mir2
git submodule update --init --recursive
npm ci
python3 scripts/install-check.py
bash scripts/build-server.sh
bash scripts/build-gateway.sh
python3 scripts/prepare-runtime.py --refresh-classic-route
python3 scripts/import-map-assets.py
bash scripts/compose.sh up -d
python3 scripts/wait-ready.py
npm run dev
```

打开 `http://127.0.0.1:5173/play.html` 进入联机页，`http://127.0.0.1:5173/ui-calibration.html` 进入 800×600 国服 UI 校准页。旧协议服务端端口由 Compose 保持在本机回环地址，WebSocket 网关入口为 `127.0.0.1:18800/ws`。

`assets/raw/` 和 `assets/web/` 属于可重建产物并被 Git 忽略。`content/classic-176/asset-sources.json` 锁定下载地址、文件大小和 SHA-256；导入器缺少源文件时会自动下载，哈希变化会停止导入。国服 UI 原始帧需要用户准备 2003 客户端解出的 `Data` 目录，再执行：

```sh
python3 tools/validate-national-ui.py --data-dir /path/to/Data
python3 tools/import-national-ui.py --data-dir /path/to/Data --export-root assets/web/ui-national
python3 tools/validate-national-ui.py --data-dir /path/to/Data \
  --export-root assets/web/ui-national --json .runtime/reports/national-ui-validation.json
```

没有国服 `Data` 时，页面会显示缺项并使用 Crystal 候选帧，地图和游戏逻辑仍可运行。安装包只用于资源、视觉和协议取证，浏览器运行链路由自有 OpenMir2 服务端与 WebSocket 网关提供。

## 运行模式

- `python3 scripts/prepare-runtime.py --refresh-p0` 生成最小 P0 世界，适合确定性战斗、技能和掉落回归；P0 任务审计会报告跳过 Q001。
- `python3 scripts/prepare-runtime.py --refresh-classic-route` 生成 570 张地图的经典路线目录，并保留账号与角色存档；当前目录包含 Q001 地图任务。
- 切换运行模式后重启 `engine` 和 `web-gateway`。修改运行配置前先创建备份。

## 停服与备份

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

当前已验证 OpenMir2 服务端、WebSocket 网关、浏览器登录/选角/入图/移动、P0 战斗与掉落、15 项技能、行会战夹具、570 张地图内容闭合、30 秒稳定性、5 个重连周期、异常退出恢复和 60 FPS 帧预算。Windows 原端动态兼容、逐像素 UI 校准、Safari/Firefox、完整 1.76 任务与怪物内容、完整沙巴克战役、两小时稳定性、真实主机断电和云服务器部署仍需专项验收。
