# 实施状态

基线快照：2026-09-09；Windows 原客户端进度更新至 2026-09-29。下方基线指标是历史报告，不代表 Windows 本轮重新跑过全套检查。历史审查与旧指标已移到 [`docs/archive/`](archive/README.md)。实施范围与未完成项仍以 [`PLAN.md`](../PLAN.md) 为准。

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

- Windows 11 原版窗口客户端的完整玩法、跨地图、休眠恢复后的长时运行及原端截图差分验收；已确认日常入口登录、选服、选角、入图、鼠标移动和背包基本操作，装备与重登另有旧协议探针及部分原端界面证据。
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

当前客户端登录输入字符不可见，本机启动方式使用预填测试账号完成验证。跨地图、战斗、长时稳定性及其他原版客户端版本尚未实测；背包与重连的协议桥复测见下文，原版 UI 的完整操作仍待验收。P0 世界不等于完整 1.76 内容。协议桥现有 8 项单元测试，本地原生接入/停服测试共 9 项通过。先前全量 Python 101 项有 14 个失败、5 个错误，涉及浏览器素材缺失、清单差异和 Windows `python3` 别名，不能据此声明全项目回归通过。

本地性能复测将旧版 6 位编解码改为等价的 Base64 字母表转换，并将服务端新编码的解码改为查表；10 KB 基准的旧编码约从 14.8 ms 降到 0.1 ms，旧编解码往返约从 26.4 ms 降到 0.2 ms，服务端到客户端整帧转换约从 9.4 ms 降到 5.0 ms。冷启动后原版客户端再次进入比奇。地图稳定运行时实测封包大多只有几十字节、桥进程 CPU 接近空闲，因此这项优化主要降低较大封包或突发消息的转换耗时。桌面启动脚本已能在确认原监督器及六个服务进程均退出时清理遗留锁文件。

连续移动卡住的原因已从[旧客户端源码](https://github.com/lzxsz/MIR2/blob/98711dad31567d9a7e272956f6c5a2487000848b/GameOfMir/MirClient/ClMain.pas#L4214)和实测封包确认：客户端每次动作后锁定输入，只有收到 `+GOOD/` 或 `+FAIL/` 才解锁，否则约 10 秒后超时；OpenMir2 游戏网关返回的是 `+GD/` 与 `+FL/`。本地游戏端口的协议桥现将这两个回执转换成旧客户端识别的长格式，不改动原版程序。修复后原生客户端连续向南点击 8 次，记录到 8 次 `CM_WALK` 及相应回执，坐标由 `(288,612)` 到 `(288,620)`，进程响应、连接保持。先前服务端不向玩家自身回发 `SM_WALK` 的行为不是此卡顿的原因，该实验已撤回。

复测期间测试角色因附近怪物攻击死亡，表现为灰色画面和无法继续走路。服务端原先的 `InSafeZone()` 只有在整张地图标记安全时才会检查出生点，导致比奇出生点的安全范围失效。现修正出生点半径判定，并禁止怪物攻击安全区内的玩家；已将本地测试角色恢复至比奇出生点、满血，重新登录后完成上述连续移动验证。安全区外的战斗行为仍待单独验收。

原版客户端穿戴装备失败的原因也是物品封包结构不一致。服务端的 124 字节 `ClientItem` 将物品实例编号和耐久度放在偏移 100–107；实测这份 2003 客户端却从偏移 44–51 读取，把新结构的库存量 `5` 当作乌木剑编号，发送 `CM_TAKEONITEM` 后收到 `SM_TAKEON_FAIL`。游戏端口协议桥现对背包物品、增添物品、更新物品和已穿戴物品消息复制这三个字段到旧位置，包含紧跟在消息头后的首件背包物品。修复后原版客户端发送正确编号 `15802433`，服务端返回 `SM_TAKEON_OK`；保存停服后数据库确认该编号在武器位。

重登时人物栏空白另有一层原因：`SM_SENDUSEITEMS` 的编码消息头后直接紧接明文装备栏位置数字，后面才是斜杠分隔的编码物品。协议桥原本将这位数字当作非法编码字符，把整条消息原样放过；现按实际边界分别转换消息头、栏位与物品。重启原版客户端再登录后，衣服与首饰等已穿戴物品重新出现在 F10 人物栏，悬停已穿戴首饰显示“持久 8/8”，背包乌木剑显示“持久 7/7”；数据库中的装备耐久也为非零。背包单击物品再单击 F10 装备栏对应位置可穿戴。测试员发放物品的每种装备、交易及掉落仍需逐项验收。

最终重启时还遇到 Windows 对监督器状态文件原子替换的短暂读取拒绝。`run-server-native.py` 的状态读取现对这类瞬时 `PermissionError` 做有限重试；清理诊断日志后重启本地六服务与原版客户端，已再次登录并确认人物栏与首饰耐久显示。

原版客户端与浏览器使用同一自有服务端，但浏览器另经 WebSocket 网关运行。原版客户端也可用于视觉、资源和协议取证；此前原端无法在 macOS 运行的历史说明见 [`docs/ui-fidelity-audit-2026-09-09.md`](ui-fidelity-audit-2026-09-09.md)。

### 窗口模式与原版协议桥复测（2026-09-28）

此前桌面启动器只把 2003 客户端的 Win32 外框放在左上角 800×600；客户端启动时仍把桌面从 1920×1080 切到 800×600。运行中强制恢复桌面分辨率后，游戏背景变白，只剩原生输入框。微软的 [DirectDraw 协作级别](https://learn.microsoft.com/en-us/previous-versions/ms785063%28v%3Dvs.85%29)与[画面表面恢复](https://learn.microsoft.com/en-us/windows/win32/api/ddraw/nf-ddraw-idirectdrawsurface7-restore)文档说明了独占全屏、显示模式切换和表面丢失的关系，这与实测现象一致；尚未跟踪这份二进制的完整调用序列。相近版本的 [ClMain.pas](https://github.com/lzxsz/MIR2/blob/master/GameOfMir/Client/ClMain.pas) 和 [DXDraws.pas](https://github.com/lzxsz/MIR2/blob/master/GameOfMir/Client/DXDraws.pas) 在初始化时分别选择 `DDSCL_FULLSCREEN | DDSCL_EXCLUSIVE` 或 `DDSCL_NORMAL`。该参考源码从 `Lmir.ini` 读取 `FullScreen`，但实际 2003 `mir.dat` 的运行时分析确认使用 `mir.ini`、`mirsetup.ini` 与 `ftp.ini`；两份配置均写入 `FullScreen=0` 的隔离测试中，它仍切换桌面。PE 检查显示原始 `mir.dat` 有 `.aspack` 节、代码节熵值约 8.0，静态字符串因此不能直接确认配置分支。cnc-ddraw 与 DxWnd 隔离测试能产生窗口，但游戏背景未正常绘制。[DDrawCompat 的 `FullscreenMode=borderless`](https://github.com/narzoul/DDrawCompat/wiki/Configuration#fullscreenmode) 只将全屏内容显示为覆盖整个屏幕的无边框窗口，并非用户需要的 800×600 可移动窗口。因此仅改启动脚本、Win32 外框或桌面分辨率不能完成真正窗口化；下一步需跟踪该二进制的 DirectDraw 调用并修正窗口模式的表面创建与呈现，或改用可维护的客户端渲染代码。当时尚未实现真正的可移动窗口模式。

新增 `tools/native_bridge_reconnect_probe.py`，直接走原版客户端使用的 `7000/17100/17200` 旧编码端口，核对登录、选角、入图、背包请求、124 字节物品的旧版与新版编号/耐久偏移、装备栏位，并在断开后重登比较快照。本机 P0 测试角色两次入图均成功，背包 16 件、装备 8 个栏位，重登后地图、坐标、背包和装备数据一致；结果保存在忽略目录 `.runtime/reports/native-bridge-reconnect.json`，不包含账号、密码或票据。此项验证覆盖协议桥和服务端持久化，不能代替原版 UI 的全部操作验收。运行前设置 `MIR2_NATIVE_ACCOUNT`、`MIR2_NATIVE_PASSWORD`、`MIR2_NATIVE_CHARACTER`，已有装备时可设 `MIR2_EXPECT_EQUIPMENT=1`。

旧版协议的卸装、重新穿戴测试发现另一处服务端错误：`ClientTakeOffItems` 在成功发送 `SM_TAKEOFF_OK`（619）后仍保持失败标志为零，紧接着又发送 `SM_TAKEOFF_FAIL`（620）。现于成功分支设置成功标志；重建并重启本地六服务后，`tools/native_bridge_equipment_probe.py` 经原版端口确认武器卸下时收到背包新增与 619、没有随后出现 620，重新穿戴收到 `SM_TAKEON_OK`（615），断线重登后物品编号和耐久保持一致。结果位于 `.runtime/reports/native-bridge-equipment.json`。这是旧版协议和服务端的实测结果，原版客户端界面的卸装、穿戴动作仍需人工复核。

首轮选择手镯测试时还暴露出测试角色原先被强制发放了超出自身承重的装备：3 级时穿戴重量 16、上限 15，所以卸下后无法按正常游戏规则穿回。已先将本机数据库备份到 Git 忽略的 `.runtime/backups/native-before-equip-20260928.sql`，通过 P0 测试导师把该测试角色升至 7 级，再把原手镯穿回原栏位；复测背包 16 件、装备 8 栏和重登快照一致，记录于 `.runtime/reports/native-bridge-equipment-restore.json`。该角色目前为 7 级，未把数据库回滚到备份状态。

随后再次用真实 `mir.dat` 登录测试：首次点击提交出现账号占用提示，客户端此时已无登录端口连接；重新启动客户端后，预填测试账号成功登录、选服，角色选择页显示 7 级，点击开始后到达欢迎公告。点击公告“确定”后，本次窗口采集持续为黑色、只显示光标，尽管游戏端口连接仍存在；地图、人物栏与移动均未在这次可视化测试中得到确认。该现象的原因尚未定位，不能把协议探针通过等同于原端画面验收通过。测试结束后已保存停服、关闭失去画面的客户端，再以 `-NoClient` 重启本地服务；服务与三个协议桥端口均恢复就绪。

账号占用问题进一步定位到会话释放链：游戏网关只在玩家已标记 `Ghost` 时向登录服务通知普通断线；登录服务收到 `SS_SOFTOUTSESSION` 后也只检查未被现有登录流程填充的服务器会话列表，未清理账号判重所用的 `SessionManager`。现将普通断线立即通知、按账号和会话编号精确删除登录票据，并对会话字典访问加锁。修复前开启 `MIR2_STRICT_RELOGIN=1` 的旧端口重连探针在第二次登录收到 `SM_PASSWD_FAIL`（503，原因 -3）；重建并重启服务后，同一探针不靠自动等待重试即可两次登录、入图并保持背包与装备快照一致。该协议测试本身不能证明真实客户端画面已恢复；后续原端复测见下文。

旧端口玩法探针 `tools/native_bridge_world_probe.py` 又验证了比奇 P0 安全区内的 NPC 与移动：测试角色在 `(285,610)` 收到边界导师的对话及 `@levelseven` 选项，但没有执行升级；随后移动一格、收到原客户端需要的 `+GOOD/` 回执、走回原位。断线后严格重新登录，地图、坐标、背包 16 件及装备 8 栏与测试前完全一致。报告位于 `.runtime/reports/native-bridge-world.json`。这补充了协议层可玩性证据；当时真实 `mir.dat` 的黑屏和窗口化仍未通过画面验收。

真实原端黑屏现已定位并修复：游戏端口跟踪显示上一轮 `SM_SENDNOTICE`（658）发出后约 17 秒才收到 `CM_LOGINNOTICEOK`（1018），而 `PlayObject.RunNotice` 在 10 秒就设置紧急断线，因此没有后续地图消息。现将公告等待上限改为 120 秒，并在判超时前先处理已排队的确认。重建服务后，刻意等待约 69 秒才从真实 `mir.dat` 点击公告“确定”；协议桥随后收到地图（51）、坐标（50）及周围对象消息，原端画面实际显示比奇地图和 HUD。F10 人物栏可见已穿戴装备，鼠标点击把角色从 `(285,610)` 移到 `(286,610)`，再移回 `(285,610)`。这一轮验证了此前的公告超时黑屏；真正的 800×600 可移动窗口模式及更长时段玩法仍未验收。

重启保存后还运行了延迟公告回归：`MIR2_NOTICE_DELAY_SECONDS=15 MIR2_STRICT_RELOGIN=1` 的旧端口探针在超过旧 10 秒上限后确认公告、入图，断线后无需自动重试即可再登录，地图、坐标、背包和装备快照一致。报告 `.runtime/reports/native-bridge-reconnect.json` 记录 `noticeDelaySeconds: 15`，不含账号口令。测试用的封包详细跟踪已关闭，运行服务回到普通协议桥配置。

### 原版客户端可移动窗口进展（2026-09-28）

找到 dgVoodoo 2.87.5 的 x86 `DDraw.dll` 可绘出原版登录页的组合：`FullScreenMode=false`、`AppControlledScreenMode=false`、`DisableAltEnterToToggleScreenMode=false`。先在隔离副本、再在正式 `.runtime/native-client` 副本启动原始 `mir.dat`；Windows 桌面保持 1920×1080，原版登录画面在带标题栏的 800×600 客户端区域中正常显示，拖动正式副本时截图窗口原点从 `(776,376)` 移至 `(856,420)`，游戏画面仍可见。关闭水印后重新从同一官方 ZIP 安装并重启，登录画面仍正常。原程序 SHA-256 保持 `db71634bcfd46a7ed682612eee9c6da88e5881524ac2cc6f894890a02b18a3a5`。新增 `tools/install-native-window-wrapper.py`，从用户本地 dgVoodoo ZIP 安装兼容层；ZIP 与 DLL 留在被忽略的本地运行目录，不随仓库提交。

桌面入口 `outputs/Local-Mir.ps1` 已在检测到该配置时跳过旧的强制顶左角外框修改和画面刷新监视器，并将账号预填定位改为按两个可见输入框的屏幕高度排序；脚本实际运行且通过 `WM_GETTEXT` 验证两个字段均为预期值。窗口化客户端的普通短点击和回车没有在登录桥留下请求帧；向其 DirectDraw 子画布发送约 80 毫秒的鼠标按下/抬起消息后，登录桥收到账号请求及成功回应，客户端画面进入选服页。再以同法点击区服后，窗口停在关门画面，没有发出旧协议探针正常发送的第二个登录端口请求，也未连接选角端口。同期同账号旧端口探针登录、选角、入图、严格重登全部通过，故不能将窗口模式标记为可玩。已停止试验客户端，把兼容 DLL 和配置移到本地 `work/window-wrapper-backup`，日常入口恢复原版全屏；登录桥详细跟踪已关闭。后续重点是该二进制在强制窗口状态下的画面循环及输入/选服状态机。

后续复测又分离出一项启动器时序问题：启动器刚写入两个 Win32 `TEdit` 时读回正确，但登录画面稳定后，UI Automation 观察到账号栏变空、密码栏仍有值；普通鼠标点击、拖拽及回车均未在登录桥产生请求。相近版本客户端 `TLoginScene.PlayScene` 在首次绘制时才显示两个输入框并设置焦点，因此“写入后马上读回”不足以证明账号会保留。`outputs/Local-Mir.ps1` 现延迟 750 毫秒再次只读核对两个字段，若被客户端初始化清除则重填；全屏原端启动后又隔数秒验证账号仍在。此项修复只解决预填稳定性，不能解释此前已经成功登录、到达选服页后的窗口卡住。相近版本 `ClMain.pas` 显示，点击区服应发送 `CM_SELECTSERVER`，收到 `SM_SELECTSERVER_OK` 后断开登录 Gate 并连接选角 Gate；此前窗口实验没有完成后一步，而全屏原端同一服务链路可入图。最有证据支持的范围是原版客户端与强制窗口 DirectDraw 兼容层的输入／画面状态切换，具体失败调用仍待 API 级跟踪，不能把此推断写成已确认根因。参考 [Microsoft DirectDraw 协作级别](https://learn.microsoft.com/en-us/previous-versions/ms785063%28v%3Dvs.85%29) 与 [dgVoodoo2 项目说明](https://github.com/dege-diosg/dgVoodoo2)。复测后已移走实验 DLL，日常客户端保持可用的全屏配置；服务与协议桥已恢复正常非跟踪模式。

修正客户端跳转端口后，用同一原始 `mir.dat`、同一 800×600 dgVoodoo 窗口重测。稳定预填后按登录栏回车，真实客户端发送登录请求并收到选服列表；点击、拖拽或回车选择区服时没有 `CM_SELECTSERVER`。仅在隔离诊断桥代发这一请求后，客户端自行连接 `17100` 并绘出已有 7 级角色；角色“开始”按钮同样没有发送 `CM_SELCHR`。诊断桥代发选角后，客户端连接 `17200`，但因代发绕过本地 `CharName` 赋值，首次入图字符串缺角色名；诊断桥临时补齐后还发现原入图包标记为 `#3`，原协议桥只对 `#5` 补齐一位登录校验码，服务器因此拒绝。协议桥现对任何 `**.../0` 旧入图包补齐 10 位校验码。之后服务器返回公告；诊断桥代发公告确认后，客户端自行接收并绘出比奇地图、HUD 和背包，F9 键可打开、关闭背包。地图单击、右击、拖拽和连续点击都没有发出移动请求；`CaptureMouse=true` 也未使选服点击生效。由此可确认窗口画面与三段网络连接本身能工作，当前可复现阻点集中在窗口模式鼠标按键事件；还没有定位到原程序或兼容层内部的具体失败函数。所有代发逻辑仅用于诊断，已经从日常协议桥移除；窗口 DLL 和配置也已移走，日常继续使用原版全屏。

进一步在同一 dgVoodoo 800×600 窗口中复测，诊断桥只代发选服与选角；真实客户端自行连通三段端口，约 10 秒后绘出公告，按回车发出 `CM_LOGINNOTICEOK` 并进入比奇。地图、HUD、活动的 NPC、装备与背包均可见；F9 可开关背包，背包关闭按钮可点击。点击可通行的地面时，客户端发出两次真实 `CM_WALK`，角色从 `(285,610)` 走到 `(287,612)`；拖动窗口、最小化再恢复后仍可绘制地图并开关背包。因此此前“窗口模式地图点击均无效”的结论过宽，窗口内移动已得到实测。聊天输入框能获得焦点并发送 `CM_SAY`，但输入文字未在画面中正常显示，聊天尚未验收通过。

撤掉诊断桥，恢复普通协议桥后反复点击选服按钮仍未见 `CM_SELECTSERVER`；此前角色页“开始”也未发出 `CM_SELCHR`。窗口版仍不能独立从登录进入游戏，选服／选角点击是当前可复现的界面阻点，具体输入失败位置仍待定位。诊断桥已停止，dgVoodoo 文件已从日常客户端副本移出；启动入口继续使用全屏模式。

此次复测中 `GameSrv` 曾在怪物移动时抛出 `AccessViolationException`，堆栈落在 `NativeList<CellObject>.RemoveAt`。检查发现 `RemoveAt` 把末元素后的一项也作为搬移源读取，满容量时可能越界访问；已将循环上界改为最后一个有效源元素，并清空末尾槽位。针对满容量与单元素列表的测试还发现 `NearestPowerOfTwo` 原实现会在容量 2 等输入时溢出，也已修正。`GameSrvTest` 全部 4 项通过，更新后的 `GameSrv` 发布并重启。严格旧端口重登探针再次通过，窗口测试结束时的坐标 `(287,612)`、背包 16 件、装备 8 栏与耐久均保留；服务运行状态为 ready。这验证了当前修复和存档，尚不代表更长时段的稳定性验收。

再次复测窗口时发现，本机 `LoginGate` 的账号服务连接曾超时断开；日志出现未知／非法连接，真实客户端登录请求没有应答，旧端口探针也超时。重启六项服务后，严格旧端口重登探针立即通过，真实窗口客户端重新登录成功。此轮仍由测试桥代发选服和选角，但公告确认、进入比奇、F9 背包、人物装备栏显示与物品悬停耐久信息都由客户端完成。点击背包物品与装备栏位未观察到 `CM_TAKEONITEM`；逐包追踪开启的那轮近距离地图点击也未观察到 `CM_WALK`。后续窗口复测中，公告框一度未响应点击，重新激活窗口后关闭；F9 背包快捷键正常，数次空地点击有点击光效但角色坐标不变 `(287,613)`，按方向键 `Right` 也未移动。后续复测用的桥接未开启逐包跟踪，因此不能据此确认 `CM_WALK` 是否上行。先前一轮实际观察到两次 `CM_WALK`，并由客户端发送 `CM_SAY`、在聊天栏显示消息，因此窗口鼠标移动表现为间歇性，穿戴和移动均未达到稳定验收。当前测试客户端留在窗口地图、背包关闭，测试桥仍为本地诊断配置；关闭后应以 `outputs/Local-Mir.ps1 -Action Start -NoClient` 恢复常规协议桥。

### 原端导师菜单及端口回归（2026-09-28）

原生 `mir.dat` 在比奇安全区点击边界导师时，原测试菜单的十四个单行选项超出了约 400×175 的对话框。`content/classic-176/p0/skill-trainer.txt` 现分为主菜单、技能秘籍、其他测试三页；真实客户端逐页点击、返回和关闭均成功，所有选项留在对话框内，未执行升级、传送或发物品。运行时脚本还发现 Windows 换行重复：UTF-8 源文件的 CRLF 经 `Path.write_text` 再转换后变成 CRCRLF；`scripts/prepare-runtime.py` 现先规范化换行，生成的 GB18030 导师脚本与源文本一致且无 CRCRLF。

重生成配置时暴露另一项可复现回归：服务监听 `17101/17201`，但若把相同端口写入选角和游戏跳转地址，原端会绕过 `17100/17200` 协议桥；画面进入空角色页，数据库中账号、角色和物品均仍在，严格重登探针经桥接可取回完整角色。现在 `prepare-runtime.py` 提供独立的 `--client-selection-port` 与 `--client-game-port`，本机运行时配置为服务监听 `7001/17101/17201`，客户端跳转 `17100/17200`。修正后真实原端重新显示原有 7 级角色、确认公告并进入地图，导师分页实测通过；正常停服已保存世界。`test_native_runtime.py` 的服务／跳转端口及换行检查、`test_p0_quests.py` 均通过。窗口模式仍不能靠鼠标选服或选角；后续已确认入图后的地图点击能移动，见上文复测记录，因此暂不能标记为独立可玩的窗口入口。

### 窗口输入路由对照（2026-09-28）

本轮在 dgVoodoo 800×600 窗口下复测：坐标点击可使按钮进入悬停态，但没有切换账号／密码框焦点；UI Automation 对账号编辑框的元素点击可以切换焦点，而坐标点击、短拖、文本输入、单键输入及 `set_value` 都没有在该控件留下可读值。dgVoodoo 的 `FreeMouse=true` 与 `CursorScaleFactor=1` 两项隔离测试均未改变结果，配置已恢复到原始哈希。

用本地 x86 CNC-DDraw 包设置 `windowed=true` 后，`renderer=auto`、`gdi`、`opengl` 均持续黑屏；进程模块检查确认其实际加载了替换 DLL。已恢复原 dgVoodoo DLL 与配置，运行目录中的 CNC-DDraw INI 和着色器也已移出。结果排除了简单鼠标缩放开关及该兼容层渲染后端作为可用修复；后续应追踪 DirectDraw 子画布的鼠标消息目标与窗口呈现调用，避免继续盲试配置。

### DxWnd 自动刷新对照（2026-09-29）

按 DxWnd 随包手册针对黑屏症状试验 `Auto Primary Surface Blit`，从 800×600 Diablo 窗口预设另建配置，只在 `flag0` 加上 `AUTOREFRESH`（`0x1000`）。测试运行于 `.runtime/dxwnd-trial-2026-09-29` 的独立副本，不带 dgVoodoo DLL；DxWnd 确认向 `mir.dat` 注入了 `dxwnd.dll`。副本初次启动弹出缺少 `Patch.exe` 的自动更新提示，在副本 `mir.ini` 设 `Patched=1` 后可继续启动；原客户端配置和文件未动。

进程保持响应并创建了标题为 `mir` 的主窗口，但桌面自动化窗口枚举没有提供可操作的客户端窗口；当时模块快照也尚未看到 DirectDraw 模块，因此无法观察其画面或验证登录、鼠标与 `AUTOREFRESH` 的呈现效果。此轮结果不能证明该开关修复黑屏；后续补回 dgVoodoo 的联合窗口测试见下一节。

### DxWnd + dgVoodoo 联合窗口对照（2026-09-29）

在同一隔离副本中，逐字节复制日常运行目录的 `DDraw.dll`、`dgVoodoo.conf` 和 `user.ini`，并用 DxWnd 的 800×600 `WINDOWIZE + AUTOREFRESH` 配置启动。进程同时加载 `dxwnd.dll`、`DDraw.dll` 和系统 `D3D11.dll`，自动化工具现在能枚举标题为 `legend of mir2` 的窗口并显示登录场景；拖动标题栏后窗口原点从 `(776, 376)` 移至 `(896, 456)`，确认它是真正可移动的窗口。整个测试只使用隔离副本，日常客户端目录未改。

窗口显示正常，但输入仍未修复：点账号框后用 `type_text("test")`、单键 `t`/`z` 均没有显示字符；点登录面板的红色关闭按钮也没有关闭面板。逐项测试关闭 DxWnd `Correct mouse position`，以及启用 `Position message processing`，都没有变化。启用 `Win Events`、`Cursor/Mouse`、`Inputs` 跟踪后，日志记录到窗口焦点和非客户区鼠标移动，但没有记录到 `WM_CHAR`、`WM_LBUTTONDOWN/UP`；这些日志来自 DxWnd 对默认窗口过程的跟踪，不能单独证明应用过程没有收到消息。短时日志会快速增长到约 1 MB，测试已停止。

当前确认的是图形渲染和可移动窗口路径可用；账号输入、面板点击和实际登录仍未验证成功。DxWnd 已退出，`work/dxwnd/dxwnd.ini` 已恢复为 23 字节初始配置，日常客户端仍保持原状。后续应直接跟踪游戏输入控件使用的输入 API 或窗口子句柄路由，不能把“窗口能显示”当成窗口客户端已可玩。

### DxWnd 子窗口与 DirectInput 输入对照（2026-09-29）

在同一隔离副本上按 DxWnd 官方标志定义增加 `HOOKCHILDWIN`（`0x40000000`），运行日志确认该位生效。Windows 现在能枚举登录画面的两个子编辑控件；Tab 能在控件间切换焦点，但鼠标点账号框后焦点仍停在原编辑控件，点红色关闭按钮也只出现悬停高亮。一次 `type_text("test")` 后 UI Automation 在其中一个编辑控件读到 `Value=test`，截图中的输入框仍为空；这说明控件状态可能收到文字，但不足以证明账号栏已正确填入或文字能正常显示。

再加入 `HOOKDI`（`0x10`）复测，DxWnd 日志确认 DirectInput 钩子已加载，账号框焦点和按钮行为没有变化。另一个配置尝试把 `OUTWINMESSAGES` 追踪位加入 `.dxw`，但 DxWnd 导入后运行日志未列出该跟踪项，因此这轮没有得到新的按键／鼠标消息记录，不能据此断定消息未到达应用。两轮均未提交登录；测试结束后已关闭客户端和 DxWnd，并将 `work/dxwnd/dxwnd.ini` 恢复为原 23 字节内容。正式客户端目录未改，窗口模式仍未达到可正常点击和登录的状态。

DxWnd 标志值参考其[官方头文件](https://github.com/DxWnd/DxWnd.reloaded/blob/master/Include/dxwnd.h)。下一步应先让窗口过程跟踪位在实际运行配置中确认生效，再分别记录主窗口和两个子编辑控件收到的 `WM_LBUTTONDOWN/UP`、`WM_CHAR`；在此之前不把渲染正常视为输入修复。

### 实际输入跟踪与单层 dgVoodoo 对照（2026-09-29）

本轮先将隔离副本 `mir.ini` 的 `Patched` 设为 `1` 再启动；否则 DxWnd 虽能创建进程，窗口枚举暂时看不到 `legend of mir2`。正确启动后登录场景可见。通过 DxWnd 属性页保存日志选项，运行头确认 `HOOKCHILDWIN`、`HOOKDI`、`OUTWINMESSAGES`、`OUTCURSORTRACE`、`OUTDXWINTRACE` 与 `OUTINPUTS` 实际加载；随后分别试验 `MESSAGEPROC` 与 `FIXMOUSEHOOK`，均未改变控件行为。

点击账号框后，UI Automation 焦点仍留在启动时的第二个编辑控件；点击密码框也没有切换焦点。按 `Tab` 可以切换到另一个编辑控件。直接按 `A` 时，DxWnd 日志记录到 `KeyboardHookProcessFunction` 的 `VK_A`，但输入框画面和 UI Automation 值仍为空。`type_text` 在日志里表现为 `Ctrl+V`，不能当作普通键盘字符输入的证据。点击游戏面板红色关闭按钮只产生悬停效果；窗口标题栏的关闭按钮可以正常退出。跟踪日志有 `WM_MOUSEACTIVATE`，但没有 `WM_CHAR` 或 `WM_LBUTTONDOWN/UP` 记录；由于 DxWnd 这组记录来自默认窗口过程，缺少这些日志本身不能证明应用没有在别处处理消息。

再用副本自带 `Launch-Local.ps1` 直接启动 dgVoodoo 窗口，不经过 DxWnd，鼠标点击没有稳定选中对应输入框，`Tab` 可切换两个编辑控件，直接按 `A` 仍无可见文字。把副本 `dgVoodoo.conf` 的 `CaptureMouse` 临时改为 `true` 也没有改善，测试后已恢复 `false`；该选项的官方说明是将指针限制在应用窗口内，并提示可能与输入或应用本身冲突，见 [dgVoodoo 通用说明](https://dgvoodoo2.dege.freeweb.hu/dgVoodoo2/ReadmeGeneral/)。因此外层 DxWnd、窗口坐标修正和鼠标捕获均未构成可用修复，窗口登录交互仍未通过。当前仓库没有这份客户端对应的源码或可编译工程；下一步需对实际 `mir.dat` 跟踪输入 API／子窗口消息，或先找到版本匹配的客户端源码再构建。没有提交登录；日常客户端未改，DxWnd 配置已恢复为 23 字节初始文件，隔离副本已停止，`Patched` 已回到 `0`。

补充运行时模块检查：在隔离副本的登录页进程中可见本地 dgVoodoo `DDraw.dll`、`USER32`、`GDI32`、`IMM32` 和 `WINMM`，当时未加载 `dinput.dll`。`mir.dat` 带 `.aspack` 节且磁盘导入表是解包器入口，因此静态导入表不能证明解包后未动态调用 DirectInput；模块快照只说明登录初始化阶段没有加载该 DLL。该结果使“登录输入问题由 DirectInput 钩子修复”的判断缺少运行时证据，后续应跟踪 `DispatchMessage`、键盘状态查询与目标子窗口的实际消息。复测仅观察进程与模块，没有发送登录请求；结束时已停止测试进程并确认隔离副本 `Patched=0`，正式客户端未改。

### DxWnd HOTPATCH 对照（2026-09-29）

针对 `.aspack` 壳，在 DxWnd 2.06.15 隔离配置中单独增加 `HOTPATCH`（`flags4=0x04000000`）。DxWnd 运行日志确认 `HOTPATCH` 与 `HOOKDLLS` 已加载；官方头文件将此标志描述为处理混淆 IAT 的热补丁机制，见 [DxWnd 官方头文件](https://github.com/DxWnd/DxWnd.reloaded/blob/master/Include/dxwnd.h)。但这次启动的 `mir.dat` 主窗口标题停在 `mir`，进程快照没有本地 dgVoodoo `DDraw.dll`，未达到之前可见的 `legend of mir2` 登录画面，因此没有形成有效的输入对照，也不能认定该选项修复了交互。未提交登录；DxWnd 管理器和测试进程已关闭，`work/dxwnd/dxwnd.ini` 恢复为原 23 字节，隔离副本 `mir.ini` 的 `Patched=0`、dgVoodoo 设置和正式客户端均未改变。当前桌面自动化没有暴露原生窗口，后续验证需先确认此配置能显示登录场景，再测点击与字符输入。

### 原客户端窗口点击修复与日常入口验证（2026-09-29）

继续在隔离副本跟踪实际输入消息后发现：dgVoodoo 显示的游戏主窗口是 800×600，但其 `TDXDraw` 子窗口仅为 386×327。落在画面右侧或下方的点击被分发给 `TFrmMain` 父窗口，未送达处理游戏交互的子窗口；这解释了先前选服、选角和面板按钮虽有画面响应却不执行操作。隔离试验中把 `TDXDraw` 扩至主窗口客户区后，登录界面的“新用户”与“取消”等按钮恢复正常。DxWnd 的 `HOTPATCH` 与 dgVoodoo 同时使用还曾使 `DDraw.dll` 崩溃，因此最终运行路径没有加入 DxWnd。

新增 `tools/native-window-fix` 的 .NET 8 小程序，在客户端运行时定位可见的 800×600 `TFrmMain` 和 `TDXDraw`，把后者调整为父窗口客户区大小，并在切换场景后持续检查。桌面启动脚本 `outputs/Local-Mir.ps1` 在 dgVoodoo 窗口模式下自动启动该辅助程序。隔离客户端通过真实界面独立完成登录、选服、选角、公告确认和入图，点击地面后移动两步，F9 背包可打开并由鼠标按钮关闭。随后用 `.runtime/native-client/mir.dat` 日常副本重新测试，也独立进入比奇；地图点击使坐标从 `(287,617)` 到 `(283,618)`，F9 与背包关闭按钮正常。没有使用协议桥的诊断代发，原 `mir.dat` 字节未改。

测试中发现一次服务监督器虽标记 `ready`，LoginSrv 与 LoginGate 的 TCP 链路实际已断开；正常停服并重启后恢复，日常入口上述测试在重启后的服务上完成。关闭诊断协议跟踪并再次干净启动后，客户端又独立登录并进入地图；三个协议桥的错误日志保持 0 字节。游戏窗口可从 `(776,376)` 拖到 `(856,396)`，地图与人物画面仍正常。这一轮登录栏文字尚不可见；后续修复和复测见下节。

### 窗口登录文字与断线恢复（2026-09-29）

登录场景的两个 `TEdit` 控件一直存有启动器预填的值，但画面没有绘出字符。`tools/native-window-fix` 现增加不夺焦点、允许鼠标穿透的登录文字层：账号显示明文，密码仅显示等长星号；切换场景或游戏失焦时隐藏。读取控件文本使用有 200 毫秒上限的 `SendMessageTimeoutA`，避免客户端卡住时长期堵塞辅助程序。隔离副本中实际用鼠标选中输入框、直接按键输入和退格，文字层随值更新；日常副本登录画面也显示了预填账号与密码星号。原始 `mir.dat` 没有修改。

LoginGate 与 LoginSrv 链路断开后，原实现仅关闭连接而不主动重连。`ClientManager` 现按已有 10 秒检查周期重试，`ClientThread` 用原子标志避免并发连接，并在重连时清空残余收包长度。独立 TCP 故障注入验证了首次连接失败后的接通，以及被动断开后约 10 秒重连。重新发布并启动本机 LoginGate 后，日常窗口客户端通过真实界面登录、选服、选角、确认公告、入图，并用鼠标点击使坐标从 `(508,481)` 到 `(509,481)`。

继续观察时，服务运行约六小时后一次长时间停顿导致 LoginSrv 关闭 DBSrv 链路；DBSrv 在 `Online` 检查与保活发送之间遭到对端关闭，未处理的 `SocketException (10054)` 使后台服务退出，监督器随之停止整组服务。DBSrv 现捕获这一发送失败、关闭失效套接字并让既有定时连接检查重试。重新发布 DBSrv、恢复六服务和三个协议桥后，上述日常窗口客户端再次走通至地图移动。这个修复针对已记录的异常路径；休眠恢复和长时间连续运行还需进一步实测，不能仅凭一次重登宣称稳定性已完全解决。
