# Agent 实机试玩与调试

这套机制用于发现浏览器、网关和旧游戏服务之间的跨层问题，重点覆盖“协议已经成功，实际画面或输入仍然错误”的情况。默认场景启动一份可见 Chrome，通过真实登录页、选角页、键盘和鼠标操作游戏；测试结束后角色返回起点。

## 一键运行

```sh
bash scripts/run-agent-playtest.sh
```

脚本会确认数据库、引擎和 Web 网关已启动，在需要时临时启动 Vite，然后执行 `tools/agent_playtest.mjs`。默认读取 `.runtime/probe-account.json`，凭据只在本机进程和登录表单之间传递，不写入报告或控制台。也可以通过以下环境变量切换环境：

| 变量 | 用途 |
| --- | --- |
| `MIR2_AGENT_CREDENTIALS` | 指向 `{account,password}` JSON 文件 |
| `MIR2_AGENT_PLAY_URL` | 指定联机页，默认 `http://127.0.0.1:5173/play.html?agent=1` |
| `MIR2_AGENT_CHROME_PORT` | 指定临时 Chrome DevTools 端口 |
| `CHROME_PATH` | 指定 Chrome、Chromium 或 Edge 可执行文件 |
| `MIR2_AGENT_HEADLESS=1` | 使用无头模式；动作视觉验收优先保留默认可见模式，避免系统对后台动画计时降频 |

## 观测接口

`play.html?agent=1` 会安装只读的 `window.__mir2Agent`：

```js
window.__mir2Agent.snapshot()
window.__mir2Agent.events()
window.__mir2Agent.clear()
```

普通联机 URL 不安装该接口。快照包含当前地图和世代、自机逻辑格、服务端确认格、渲染像素与格坐标、屏幕锚点、相机位置、待决动作、输入意图、周围可通行方向和实体数量。事件使用 2,000 条环形上限，记录动作开始、移动目标、ACK、完成、回滚及脱敏后的网关消息元数据；其中没有账号、密码、聊天正文或物品详情。

## 默认移动场景

工具执行以下顺序，并在每个阶段读取浏览器内部状态：

1. 从登录表单进入角色，等待地图、自机、Pixi 场景和背包初始化，记录人物首帧可渲染耗时。
2. 键盘走一步，在约半程采样渲染位置并截图。检查早到 ACK 仍绑定当前动作，人物处于起终点之间，人物和相机锚点保持一致，动作至少运行 590ms。
3. 按住方向键 1.35 秒。检查恰好调度三段单格移动，相邻动作起点保持约 600ms 间隔。
4. 点击三格外的直线目标。检查路线没有偏折并抵达目标格。
5. 在角色右侧或左侧约 230px、垂直偏差 1px 的位置按住右键。检查两段移动均为同一水平方向的跑步。
6. 每个场景反向返回，最终坐标必须与试玩起点一致；浏览器异常和 error 日志必须为空。

方向会根据当前地图碰撞和实体占位动态选择。缺少所需直线时只跳过对应右键场景，其余关键检查失败会让命令返回非零状态。

## 证据与排查

每次运行生成独立目录：

```text
.runtime/reports/agent-playtest/<UTC 时间>/
├── report.json
├── 01-login.png
├── 02-entered-world.png
├── 02b-pose-ready.png
├── 03-movement-midpoint.png
├── 04-finished.png
└── 99-failure.png       # 仅失败时
```

`.runtime/reports/agent-playtest/latest.json` 始终指向最近一次结果。报告包含断言、动作时间、起终点、观察器时间线、浏览器错误和脱敏 WebSocket 摘要。失败时还会保存最终快照，便于判断故障落在输入、动作调度、ACK、渲染、相机、网关或运行环境。

Agent 排查移动问题时应先运行该场景，再按以下顺序定位：

1. 检查 `movement-start → action-ack → action-finish` 是否使用同一 `actionId`。
2. 比较 `startedAt`、ACK 时间和 `elapsedMs`，确认动作结束满足视觉周期与确认条件。
3. 比较 `self`、`confirmedCell`、`render.grid`，识别预测未回滚、权威坐标分叉或显示追赶多格。
4. 比较 `render.screen` 与 `(400,300)`，识别人物和相机采用不同时间线。
5. 查看 WebSocket 摘要和浏览器错误，最后核对中间帧截图。

新增试玩场景时继续通过页面控件、Chrome Input 或真实指针事件触发操作，把只读状态加入 `snapshot()`，把关键边界加入观察事件，并保证场景结束后恢复角色、物品和地图状态。会消耗物品、改变任务、交易、行会或角色存档的场景应使用可丢弃夹具账号，并在报告中记录清理结果。
