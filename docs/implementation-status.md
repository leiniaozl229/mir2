# 实施状态

基线快照：2026-09-09；Windows 原客户端进度更新至 2026-09-27。下方基线指标是历史报告，不代表 Windows 本轮重新跑过全套检查。历史审查与旧指标已移到 [`docs/archive/`](archive/README.md)。实施范围与未完成项仍以 [`PLAN.md`](../PLAN.md) 为准。

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

- Windows 11 原版客户端的完整玩法、跨地图、长时运行及原端截图差分验收；本轮只确认本地服务的登录、选角、比奇入图与一步移动。
- 原端逐像素 UI 校准、字体与光标确认，以及 Safari/Firefox 首发验证。
- 完整 1.76 任务、怪物视觉和地图动态内容的逐条浏览器回归。
- 完整沙巴克战役、攻城计时、占城和联盟战斗场景。
- 连续两小时以上稳定性、真实主机断电和云服务器部署验收。

### Windows 原端启动探测（2026-09-26）

已在 Windows 11（22631）中完成安装包安装，默认目录为 `C:\Program Files (x86)\shanda\Legend of Mir`。安装后的 `Mir.exe`、`mir.dat`、`mirclient.dll` 哈希与安装包清单一致。先后从直接解包副本和正式安装目录启动，均弹出 `EOleSysError in module Mir.exe at 000760A5. 没有注册类。`，未到登录界面。没有输入账号；启动观察期间未发现该进程的 TCP/UDP 会话。

2026-09-27 的短时 ProcMon 跟踪将缺失类定位到 32 位 CLSID `{D27CDB6E-AE6D-11CF-96B8-444553540000}`：`Mir.exe` 启动约 8 秒后查询 `HKCR\WOW6432Node\CLSID\{D27CDB6E-AE6D-11CF-96B8-444553540000}`，结果为 `NAME NOT FOUND`。Adobe 文档把该 CLSID 用作嵌入 SWF 的 Flash ActiveX 控件；主机注册表中没有该项，客户端安装目录和解包文件也没有 `.ocx`/`.swf`。这与“没有注册类”弹窗时间吻合，Flash ActiveX 是当前最有证据支持的启动阻塞原因。flash.cn 下载中心目前列有支持 Windows 11 的 ActiveX 版，帮助页说明 ActiveX 用于本地游戏客户端。用户同意后，已从官网公开链接下载在线安装启动器 `flashplayerax_install_cn_web.exe` 至 `work` 并验证 Authenticode 签名有效（签名主体为 Wipro Connected Services, Inc.）；2026-09-27 01:15 以管理员权限启动。至 01:27 该进程仍响应但窗口标题为空，没有网络连接，临时日志基本为空，32 位 Flash CLSID 仍未注册。用户随后完成安装。复核发现 32 位 COM CLSID 已注册，`InprocServer32` 指向 `Flash32_34_0_0_384.ocx`，该模块已由 `Mir.exe` 加载。重启后 `Mir.exe`（PID 19864）持续运行并响应，窗口标题为 `Legend of Mir`，说明已跨过先前 Flash COM 阻塞；仅凭进程状态尚不能确认游戏内登录是否可用。进程当时有两个外部 IPv6 443 连接及本机 21441 连接，未输入账号或密码，外部连接用途尚未确认。Adobe 全球版 Flash Player 已于 2020-12-31 结束支持并建议卸载；本次是在用户 Windows 主机上进行的兼容性试验，并非隔离虚拟机。素材解包和 WIL/WIX 导入已单独通过，不受此启动结果影响。[Adobe Flash 文档](https://helpx.adobe.com/archive/flash/flash-professional-cs5-5-troubleshooting.pdf)、[Adobe Flash EOL](https://www.adobe.com/uk/products/flashplayer/end-of-life-alternative.html)、[flash.cn 下载中心](https://www.flash.cn/download)、[flash.cn ActiveX 适用说明](https://www.flash.cn/help/article?id=31&tag=3)、[flash.cn 当前版本元数据](https://api.flash.cn/config/flashVersion/)

用户随后确认原版客户端已启动。对安装目录 `Data` 的只读清点确认有 42 组 WIL/WIX；项目已导入的仍是核心 UI 八组、2,760 帧。客户端数据还含角色、怪物、效果、地图瓦片等图库，可作为后续玩法素材解析源；这次尚未做新的转换。

用户提供的当前窗口截图显示约 400×400 的私服区服选择启动页，选中“沁园春（72区）”，包含“确定”和“新手推荐”入口；它尚不是游戏内账号登录画面。用户已明确选择只复刻进入游戏后的界面，因此该启动页仅用于解释客户端当前所处阶段，不纳入复刻范围。项目的游戏内认证组件 `apps/web/src/classic-auth.ts` 使用 `ChrSel#22` 作为 800×600 登录背景，并实现账号登录、选角和创建角色场景。旧服务器是否可用未验证，本轮没有触发区服连接。

用户点击区服页“确定”后，`Mir.exe`（PID 16452）拉起 `mir.dat`（PID 21764）；后者标题为 `legend of mir2`，窗口存在且进程响应。当前只观察到 `Mir.exe` 与 `mir.dat` 之间的 `127.0.0.1` 本机连接，没有账号输入，也没有检测到外部游戏服务器连接。原生画面仍需用户截图才能核对是否到达游戏内登录页。

### Windows 原端接入本地服务（2026-09-27）

已建立原生 Windows 的 .NET 8 + MySQL 8.4 运行环境，六个 OpenMir2 服务与 MySQL 存储模块构建成功。`scripts/restore-mirserver-data-windows.py` 从固定提交恢复 1,699 个合法文件；5 个含反斜杠的非法文件名仅不落盘，Git 对象保留、子模块 SHA 不变。`scripts/prepare-runtime.py --native-windows` 生成回环配置并统一服务器下发的转跳地址；当前服务端 Gate 使用 `7001/17101/17201`，由原客户端固定使用的 `7000/17100/17200` 经协议桥转发。SelGate 已修复忽略配置端口的问题。

`tools/prepare-native-client.py` 在 `.runtime/native-client` 创建独立程序与配置副本，保留原程序哈希，Data/Map/Wav 通过 junction 引用安装资源。运行中主模块只读分析确认 `mir.dat` 读取 `mirsetup.ini`、`ftp.ini` 与 `mir.ini`，登录端口为常量 7000；直启时需 `mir.ini [Setup] Patched=1`，程序会自行写回 0，故使用生成的 `Launch-Local.ps1` 每次重置。最初已抓到原客户端登录页，并用 TCP 与 LoginGate 日志确认它连接本机 7000；后续实际入图结果见下节。

实际协议探针通过登录、建角、选角、入图、移动，并在重启后恢复位置与背包。原生监督器已实际完成保存后停服，支持服务写回的 GB18030 配置/日志、排空玩家与存档队列，以及等待真正世界停止的回执。新增只读 `drainstatus` 控制台诊断。九项原生接入/停服回归通过。全量 Python 101 项仍有 14 个失败、5 个错误，涉及缺失浏览器导出素材、D718/D719 清单差异及 Windows `python3` 别名；未据此声明整项目验收通过。当前为 P0 世界。

### 原版客户端入图实测（2026-09-27）

Windows 11 上的 2003 原版 `mir.dat` 已通过本机 OpenMir2 服务完成账号登录、角色选择、公告确认，进入 P0 比奇地图 `0`；鼠标点击后角色坐标从 `(287,616)` 移至 `(288,615)`，进程持续运行。入图与移动有原生窗口截图和服务状态记录，不是浏览器联机页的结果。原始客户端程序未修改；本机入口 `7000/17100/17200` 经 `scripts/old-client-codec-proxy.py` 转发到服务 Gate `7001/17101/17201`，完成旧版与服务端编码转换。

此前“登录后断开”的关键原因是客户端首个游戏定时器会立即检查 `mir.dat` 的 XOR 校验值，而服务端较晚发送的 `SM_VERSION_FAIL` 校验值为 0。协议桥现在按客户端文件计算校验值，在 `SM_LOGON` 后同一次 TCP 写入中补发匹配的版本帧，并修正稍后到达的服务端版本帧；冷启动原客户端后已验证能入图。该桥需要以 `MIR2_NATIVE_CLIENT_EXE` 指向本机客户端文件启动，且仅监听回环地址；本机安装资源、账号与数据库仍保存在被 Git 忽略的运行目录，仓库提交不包含它们。

当前客户端登录输入字符不可见，本机启动方式使用预填测试账号完成验证。跨地图、战斗、背包、重连、长时稳定性及其他原版客户端版本尚未实测；P0 世界不等于完整 1.76 内容。协议桥现有 7 项单元测试，本地原生接入/停服测试共 9 项通过。先前全量 Python 101 项有 14 个失败、5 个错误，涉及浏览器素材缺失、清单差异和 Windows `python3` 别名，不能据此声明全项目回归通过。

本地性能复测将旧版 6 位编解码改为等价的 Base64 字母表转换，并将服务端新编码的解码改为查表；10 KB 基准的旧编码约从 14.8 ms 降到 0.1 ms，旧编解码往返约从 26.4 ms 降到 0.2 ms，服务端到客户端整帧转换约从 9.4 ms 降到 5.0 ms。冷启动后窗口版原客户端再次进入比奇。地图稳定运行时实测封包大多只有几十字节、桥进程 CPU 接近空闲，因此这项优化主要降低较大封包或突发消息的转换耗时。桌面启动脚本已能在确认原监督器及六个服务进程均退出时清理遗留锁文件。

连续移动卡住的原因已从[旧客户端源码](https://github.com/lzxsz/MIR2/blob/98711dad31567d9a7e272956f6c5a2487000848b/GameOfMir/MirClient/ClMain.pas#L4214)和实测封包确认：客户端每次动作后锁定输入，只有收到 `+GOOD/` 或 `+FAIL/` 才解锁，否则约 10 秒后超时；OpenMir2 游戏网关返回的是 `+GD/` 与 `+FL/`。本地游戏端口的协议桥现将这两个回执转换成旧客户端识别的长格式，不改动原版程序。修复后原生客户端连续向南点击 8 次，记录到 8 次 `CM_WALK` 及相应回执，坐标由 `(288,612)` 到 `(288,620)`，进程响应、连接保持。先前服务端不向玩家自身回发 `SM_WALK` 的行为不是此卡顿的原因，该实验已撤回。

复测期间测试角色因附近怪物攻击死亡，表现为灰色画面和无法继续走路。服务端原先的 `InSafeZone()` 只有在整张地图标记安全时才会检查出生点，导致比奇出生点的安全范围失效。现修正出生点半径判定，并禁止怪物攻击安全区内的玩家；已将本地测试角色恢复至比奇出生点、满血，重新登录后完成上述连续移动验证。安全区外的战斗行为仍待单独验收。

原版客户端与浏览器使用同一自有服务端，但浏览器另经 WebSocket 网关运行。原版客户端也可用于视觉、资源和协议取证；此前原端无法在 macOS 运行的历史说明见 [`docs/ui-fidelity-audit-2026-09-09.md`](ui-fidelity-audit-2026-09-09.md)。
