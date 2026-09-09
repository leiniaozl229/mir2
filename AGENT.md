# MIR2 项目协作说明

本文件适用于仓库根目录及其子目录中的开发、审查、测试和运行任务。开始修改前先阅读本文件，再查看目标目录是否存在更近层级的协作说明。

## 项目定位

这是一个 2003 国服传奇 1.76 风格的浏览器复刻工程。项目由三层组成：

- `apps/web`：Vite、TypeScript、PixiJS 前端，包含登录、选角、地图、HUD、窗口、物品和联机页面。
- `services/web-gateway`：.NET 10 WebSocket 网关，把浏览器 JSON 命令转换为旧版 Mir TCP 协议，并将服务端事件投影回浏览器。
- `vendor/openmir2`、`vendor/mirserver-data`：固定提交的 OpenMir2 服务端源码和数据子模块。`vendor/openmir2` 使用私有的 `leiniaozl229/mir2-openmir2` 镜像；检出主仓库时需要对主仓库和该镜像都具备 GitHub 访问权限。服务端补丁放在 `patches/openmir2/`，不要直接在子模块工作树里留下未记录的行为修改。

运行时还包含 MySQL、`LoginSrv`、`DBSrv`、`GameSrv`、`LoginGate`、`SelGate` 和 `GameGate`。浏览器连接 `ws://127.0.0.1:18800/ws`，Vite 开发服务器在 `127.0.0.1:5173` 提供页面并代理 `/ws`。原版 `mir.exe` 使用旧版 TCP/Gate 协议，不能直接连接浏览器 WebSocket；原版客户端的动态直连兼容性仍需在 Windows 环境实测。

## 目录职责

| 路径 | 用途 |
| --- | --- |
| `apps/web/src` | 生产前端组件、地图渲染、UI 状态和输入路由 |
| `apps/web/*.html` | 页面入口；`play.html` 是联机页，`ui-calibration.html` 是 UI 校准页 |
| `services/web-gateway` | WebSocket 会话、旧协议连接、状态投影和命令校验 |
| `content/classic-176` | 版本、地图、UI、物品、技能和视觉契约 |
| `assets/web` | 可重建的导出资源；默认被 Git 忽略 |
| `scripts` | 构建、运行目录准备、Compose、备份和就绪检查 |
| `tools` | 资源导入、内容审计、协议探针、视觉差分和运行回归工具 |
| `tests` | Python、前端 Node、CoreRegression、GatewayRegression 和 CastleRegression |
| `docs` | 协议、交付、UI 复刻、运行审查和已知限制 |
| `.runtime` | 本机生成的服务器、数据库配置、日志、报告和备份；禁止提交 |

## 开始工作前

1. 执行 `git status --short`，保留用户已有修改，不要用 reset、clean 或覆盖式复制清理工作树。
2. 执行 `git submodule status`，确认 `vendor/openmir2` 和 `vendor/mirserver-data` 位于项目记录的提交。
3. 先阅读与任务直接相关的文档：协议改动看 `docs/web-protocol.md`，UI 改动看 `docs/client-ui-replication.md` 和 `docs/ui-fidelity-audit-2026-09-09.md`，部署看 `docs/delivery.md`。
4. 运行时数据、账号、角色和报告都在 `.runtime/`；日志和探针输出中不得写入口令、数据库密码或完整认证票据。

## 环境和启动

需要 Git、Python 3、Node.js/npm、Docker 以及 Docker Compose。服务端和网关构建脚本使用固定摘要的 .NET SDK 容器，宿主机可不安装对应 SDK。

首次准备或清洁环境：

```sh
git submodule update --init --recursive
npm ci
bash scripts/build-server.sh
bash scripts/build-gateway.sh
python3 scripts/prepare-runtime.py
bash scripts/compose.sh up -d
python3 scripts/wait-ready.py
npm run dev
```

需要完整经典路线时，在准备运行目录后执行 `python3 scripts/prepare-runtime.py --refresh-classic-route`，然后重启 `engine` 和 `web-gateway`。只更新网关时可执行：

```sh
bash scripts/build-gateway.sh
bash scripts/compose.sh up -d web-gateway
```

常用入口：

- 联机页：`http://127.0.0.1:5173/play.html`
- UI 校准页：`http://127.0.0.1:5173/ui-calibration.html`
- 动作校验页：`http://127.0.0.1:5173/actors.html`
- 网关健康检查：`http://127.0.0.1:18800/health`

查看状态使用 `bash scripts/compose.sh ps`，脚本会自动选择 `docker compose` 或 `docker-compose`。正常停服使用 `bash scripts/compose.sh stop`，该脚本会先停止网关、保存在线角色，再停止引擎和数据库。修改角色或世界配置前先使用 `python3 scripts/backup.py create` 创建备份。

## 构建和测试

每次前端或协议修改至少运行：

```sh
npm run build
npm run test:web
python3 -m unittest discover -s tests -p 'test_*.py'
git diff --check
```

涉及服务端或网关时，再运行：

```sh
bash scripts/build-server.sh
bash scripts/build-gateway.sh
python3 scripts/wait-ready.py
python3 tests/test_web_gateway_contract.py
```

资源改动使用 `python3 tools/validate-national-ui.py`、`python3 tools/import-national-ui.py` 或 `npm run test:resources` 做针对性验证。地图、技能、怪物、任务、交易和城战改动应运行对应 `tools/*_probe.mjs` 或 `scripts/run-*-regression.sh`，并在报告中记录运行环境和范围。真实浏览器回归、原端截图和云主机测试不能用静态单元测试代替。

## 协议和状态约束

- 浏览器命令只能通过网关发送；前端不能自行决定金币、背包实例、装备属性、坐标、伤害、经验或任务结果。
- 移动、攻击和施法请求必须保留 `actionId` 与 `mapGeneration`，等待服务端确认后再推进权威状态。
- 背包、装备、仓库、交易和快捷栏使用服务端确认的物品实例号；拒绝、超时、断线、关闭窗口、Escape、失焦和 `pointercancel` 都要释放 pending 状态。
- 旧协议原始字段可通过 `legacy` 诊断消息保留；已投影的 typed 事件和同一状态变更不能重复应用。
- 网关默认只绑定本机回环地址。云端部署时只公开经过反向代理的 HTTPS/WSS 入口，数据库和旧版内部端口保持私网访问，并配置精确的 `MIR2_WEB_ORIGINS`。

## UI 复刻规则

- 设计画布固定为 800×600；屏幕缩放只改变整体显示比例，不能改变游戏内控件的设计坐标、热区和层级。
- `content/classic-176` 中的 profile、layout、interaction 和 asset manifest 是 UI 单一事实来源。校准页应直接挂载生产组件，禁止维护第二套皮肤或第二套业务交互。
- 国服 WIL/WIX 导入使用 `tools/validate-national-ui.py` 和 `tools/import-national-ui.py`。素材像素、原端运行证据、同期资料、参考实现和浏览器推断要分别标记，缺少原端证据的用途、热区、时序和字体不能标成已确认。
- 登录、选角、HUD、角色、背包、NPC、商店、修理、仓库、交易、队伍、行会和系统弹窗都要覆盖 normal、hover、pressed、selected、disabled、等待、失败和关闭路径；状态帧缺失时明确记录回退或 proposed 状态。
- F1–F8 技能槽保留稀疏编号，数字物品快捷栏独立处理；窗口组合、拖动边界、tooltip 翻边、IME 输入和 Escape/Enter 优先级按现有契约实现。
- 视觉调整优先修改 profile/layout/token 或共享组件，避免在页面中增加孤立坐标和 `!important` 覆盖。原端截图差分使用 `tools/ui_visual_diff.py`，动态区域先建立噪声遮罩再验收。

## 服务端和数据修改规则

- `vendor/openmir2` 和 `vendor/mirserver-data` 是子模块。服务端行为修改写成 `patches/openmir2/*.patch`，通过 `scripts/apply-patches.sh` 应用，并在提交说明中写清上游基线。
- 运行目录由 `scripts/prepare-runtime.py` 生成；不要手工编辑 `.runtime/server`、`.runtime/sql` 来代替可重建脚本。需要保留账号和角色时使用脚本提供的 refresh 选项并先备份。
- 地图、刷怪、NPC、掉落和技能的来源优先使用版本数据文件及 `content/classic-176` 契约。浏览器临时夹具必须与生产数据隔离，并在探针结束后清理测试账号、行会、掉落和城堡状态。
- 修改停服、存档、交易或城战逻辑时，验证正常停服、异常退出、断线重连和重复请求；不要只验证成功路径。

## 诊断和交付

默认日志位于 `.runtime/logs/`，网关协议跟踪可用 `MIR2_PROTOCOL_TRACE=1 bash scripts/compose.sh up -d engine` 临时打开；跟踪内容不得包含密码或完整消息体。服务未就绪时先检查 `bash scripts/compose.sh ps`、`.runtime/logs/LoginGate.log`、`DBSrv.log`、`GameGate.log` 和 `GameSrv.log`。

交付前应说明：改动文件、用户可见行为、运行模式、已执行的测试、未覆盖的真实环境，以及哪些视觉或交互结论仍属于推断。不要把导出的帧数量、静态构建成功或历史截图当作原端逐像素和动态兼容性证明。

中文说明保持直接、具体的表达，避免使用带转折的否定句式。未经用户明确要求，不发送外部消息、不发布部署结果，也不提交包含密码、令牌或个人数据的文件。
