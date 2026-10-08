2026-10-01 只读取证，范围为 UI-015 改密、UI-061 系统确认/取消和 UI-058 小退/大退。未改生产、契约、清单或测试，未运行原端/浏览器，未发送改密、删除或退出动作。以下 Delphi 为 `reference_source`，当前 OpenMir2 为 `server_source`，现有导出图片为 `native_pixels`；`historical_sameversion=unknown`。源代码规则、国服图片和当前服务端协议分别记录，不能互相替代同版运行证明。

下一批优先实施 UI-061 的单 OK 与 OK+Cancel 系统框。当前已有模态容器、层级、资源加载、世界动作阻断和系统文字事件；缺的是显式结果和键盘/关闭语义，可以在这些模块上补一个轻量生产控制器。改密须另加网关 prelogin 请求/结果，小退须另理清原 TCP 生命周期和存档确认，均不适合用通用关闭回调代替协议行为。

| 已有生产模块 | 可复用位置 | 复用边界 |
| --- | --- | --- |
| `classic-auth.ts` | `:186` bind，`:191` setBusy，`:198` showLogin，`:207` showSelect，`:220` showCreate；`play.ts:192` 以场景回调连接 BGM | 可扩展原认证组件场景及全控件 busy，无需第二套登录状态框架；当前场景没有改密，场景/BGM切换不是服务器退出成功 |
| `classic-ui.ts` | `:45` applyNationalUiFrame，`:66` loadClassicUiSession | 共用国服 manifest 与失败恢复；系统框候选帧需单独取准确帧，不能继续把 generic system 402 当成原确认框 |
| `classic-hud.ts` | `:155` skinWindow，`:207` 当前 national system 选 402 | 保留现 NPC/死亡提示用途；新增系统确认皮肤可由该共享入口承担，不能把旧 402 用途无证据改称原系统确认框 |
| `play.html` / `window-drag.ts` | `play.html:78` classic-modal-layer；`window-drag.ts:8` bringClassicWindowToFront，`:13` closeTopClassicWindow | 复用一个窗口层级/拖动体系；系统框 Escape 要先执行其结果规则，不能无条件走 generic closeTop |
| `classic-input.ts` / `play.ts` | `classic-input.ts:22` routeClassicKey；`play.ts:501` cancelWorldIntent、`:503` worldInputAvailable、`:507` worldInputBlocked、`:521` closeTopWindow | 现服务状态允许 F9/F10/F11，系统确认模态需要更高优先级；仅追加其判定，不重建世界输入框架。模态期间继续渲染和接收服务器权威事件 |
| `NpcProjection.cs` / `play.ts` | `NpcProjection.cs:9–14` 当前服 767/772 → dialogueMessage；`play.ts:753` system kind，`:267–277` hide/close 分离 | 已是系统文字的真实生产入口；确认框不拥有 NpcSession，不应关闭底层商店会话、取消无关物品/施法等待或丢迟到经济结果 |
| `ui-calibration.ts` | `:125–126` 展示 system；`:177–178` 仅把系统按钮点击写成“系统动作”字符串 | 现确认/取消属于夹具，下一批应挂生产控制器；存在按钮不能当成默认键/结果已实现 |
| `LegacyConnection.cs` / `GatewaySession.cs` | `LegacyConnection.cs:19–24` Header+GBK Encode；`GatewaySession.cs:383–395` 使用独立短连接注册 | 改密可复用短连接/超时模式和编码；不可把一次性 TCP client 当成可重复 Connect 的连接池。当前 Run `:87–101` 没有 changePassword/logout 请求分支 |

UI-061 的原参考规则较完整。`FState.pas:738–748` 初始化背景 360、OK 361、Yes 363、Cancel 365、No 367；`:2002–2040` 的 DialogSize 0/1/2 分别用 381/360/380，居中，默认横向框文字起点 (39,38)、按钮基点 (324,126)。`:2060–2082` 依 Cancel、No、Yes、OK 顺序从右往左，每次减 110；横向 OK+Cancel 因而 OK=(214,126)、Cancel=(324,126)，这些是参考局部坐标。`:2045` 允许拖动；`:2084–2085` 隐藏原编辑控件后 ShowModal。`:2120–2124` 恢复控件、可见聊天框重新获焦，返回 DMsgDlg.DialogResult。Web 可以用 Promise 代替其消息泵阻塞循环，不复制 `Application.ProcessMessages` 循环。

`FState.pas:2130–2136` 按 Sender 返回 mrOk/mrYes/mrCancel/mrNo。**`:2142–2149` 的 Enter 只在 OK 是唯一可见按钮，或 Yes 是唯一可见按钮时有效；OK+Cancel 和 Yes+No 不会因 Enter 自动确认。`:2152–2155` 的 Escape 仅在 Cancel 可见时返回 mrCancel。** `DWinCtl.pas:869–874` 设置唯一 ModalDWindow 和焦点，`:948–958` 有可见模态时优先转交键盘后退出路由，鼠标亦在 `:976–985` 优先模态。不能直接依赖 HTML form submit 或聚焦 button 的隐式 Enter click，否则会改变多按钮规则；若决定采用聚焦按钮 Enter 等浏览器适配，需要单独标 proposed。

原参考按钮绘制 `FState.pas:2219–2224` 使用 FaceIndex 正常帧、FaceIndex+1 Downed，未发现独立 hover 帧证明。当前国服 Prguse 导出确有下列几何；按键语义来自参考，像素不能证明同版语义。参考 `MShare.pas:596–600` 使用 MAINIMAGEFILE，而 `Share.pas:40–50` 的 CUSTOMLIBFILE 条件会选择 Graphics/FrmMain/Main.wil 或 Data/Prguse.wil，因此不能无条件把全部参考 g_WMainImages 帧配成国服 Prguse。

| 本机国服 Prguse 帧 | 实际导出宽×高 | 下一批可用证据 |
| --- | --- | --- |
| 360 / 380 / 381 | 452×179 / 256×359 / 188×105 | 横向/竖向/小框是参考用途，导出证明框像素与几何，仍待同版热区/排版 |
| 361→362 | 80×34 / 80×34 | 正常/按下，国服图片文字“确定” |
| 363→364 | 80×34 / 80×34 | 参考 Yes 结果槽；国服正常图也为“确定”，不能凭英文 Sender 改画“是” |
| 365→366 / 367→368 | 各 80×34 | 参考 Cancel/No；当前国服两组像素 SHA 相同，均为“取消”，不能凭编号冒充已验证“否”文字 |
| 50 | 420×299 | 实际像素为“修改密码”、用户名/当前密码/新密码/重复及底部同意/取消区域 |
| 402 | 416×347 | 当前通用 system 使用，未与参考确认框 360/380/381 建立同版对应 |

建议的 UI-061 最小生产接口为 `show({text, buttons:['ok']|['ok','cancel'], size?}) -> Promise<'ok'|'cancel'|'interrupted'>`，在 classic-modal-layer 中增加一个真实 panel，复用现共享皮肤/层级。每次请求有本地序号，一次点击/键盘只完成一次；跨图、死亡、断线或被后续提示替换时返回 interrupted，不伪造 ok/cancel 权威结果。恢复焦点必须确认旧元素仍连接、可见且仍属于当前场景。DOM Tab 循环、aria-modal、IME中忽略默认/取消键、连续提示排队策略与关闭焦点归还属于 proposed 浏览器适配，不能标 native_runtime。完整预期回归应覆盖单 OK Enter、OK+Cancel Enter不提交、Cancel Escape、无 Cancel Escape不关、按下/松开/移出/取消、重复动作、旧回调、底层 NPC 会话保留和世界动作阻断；这些是下一批验收建议，本轮未执行。

UI-015 原参考入口为 `FState.pas:769–774` 的改密按钮 53、局部/登录坐标 (268,558) 与关闭按钮 64；点击 `:2371–2373` → `IntroScn.pas:971–973` → lsChgpw。`IntroScn.pas:414–479` 建四个 TEdit，最大长度均 10，后三个密码掩码；四个 y 为 ny+92/119/145/172、x=nx+191，nx=SCREENWIDTH/2−210、ny=SCREENHEIGHT/2−150。`:912–917` 进入时账号获焦；`:642–643` 消费 Enter，`:701–704` 依账号→旧密码→新密码→重复→账号循环，不是按 Enter直接提交。`:1082–1087` 只有重复匹配才调用 SendChgPw 并立即返回登录；不匹配时系统 OK 提示并聚焦新密码。`:640–641` 新密码/重复拒绝 ~、单引号、空格的键入属于该参考分支，不能从未完成同版匹配推定本服统一字符政策。

改密协议与当前服可对上：`ClMain.pas:2864–2869` 发送 CM_CHANGEPASSWORD(2003) 的 Header 加 GBK编码 `account<TAB>oldPassword<TAB>newPassword`；当前 `Messages.cs:118/250–251` 同样为 2003/506/507。`LoginSrv/Services/ClientSession.cs:139–156` 是尚未登录帐号的路径，同连接 5 秒限制的过快请求只记警告，未发送 typed 失败；`:424–444` TAB分隔，最短新密码 3，原密码比较 OrdinalIgnoreCase 后调用存储；`:448–450` 旧密码错误为 -1，`:440/453–455` 达到错误次数且未过 180秒为 -2；`:465–474` 仅 nCode=1 返回 506，否则 507/Recog。**参考 `ClMain.pas:3767–3768` 将 -2 文案写成“新密码不一致”，与当前服锁定含义不同，不能直接搬其文案。**

下一步改密应扩展 ClassicAuth 和 login 阶段的 typed 命令/结果，参考 Register 的独立短连接以避免破坏后续 login.Connect；重复密码属于本地验证，不能发送密码重复字段冒充原协议。等待、超时、失败恢复和成功后再登录需单独证据；不能把收到 506 前的回到登录页当改密成功。现登录/注册 maxlength10、账号字段校验及 GBK 字节边界需在该业务中一致检查，密码不进入日志/错误插值/报告。本轮只读当前服实现，没有调用存储或真实改密。原国服帧 50 目视字段区域和按钮区域明显不等于上述参考输入/按钮坐标（参考 `FState.pas:888–892` 按钮为 (81,141)/(160,141)）；实施应按国服像素另测量并登记 proposed 热区，不能盲复制旧源坐标。

UI-058 的小退与大退在参考中是两条不同流程。`ClMain.pas:1167–1184` AppLogout 先 OK+Cancel 询问“是否重新选择人物”，OK 后发 CM_SOFTCLOSE(1009)，清 actors/窗口，设置 g_SoftClosed，按 BoOneClick 分支启 tcSoftClose 或 tcReSelConnect。`:2535–2539` 关闭 TCP；`:2541–2574` 重置、切选角并连接 SelGate/查询角色，未证明固定视觉倒计时。AppExit `:1187–1193` 先 OK+Cancel 确认，保存本地 bag cache 后关闭主程序；选角 Exit 的 `IntroScn.pas:1237–1239` 也关闭程序。浏览器返回登录/关闭标签页属于适配，不能称原程序“大退返回登录”。`ClMain.pas:1499–1507` 的 F12 走 DOptionClick（Ctrl+Alt F12 开配置），`:1575–1608` 为 Alt+X 小退与 Alt+Q 大退。

底部退出按钮 `FState.pas:1234–1239` 取 DlgConf 的 Image/Left/Top，注释 136/138、(530,104)/(560,104) 不是生效配置证明。`:5568–5597` 及上述 Alt+X/Q 分支在战斗检测前先把三个 latest tick 写成 now+10001，存在明显自定义强退逻辑；因此不能凭这个分支宣称国服标准 10秒战斗限制/倒计时。当前服 `PlayObject.Message.cs:884–893` 收 1009 后设 BoReconnection/BoSoftClose（wParam=1还设 emergency），该分支没有业务退出 ACK；`:369–391` 的后续 MakeGhost 路径也不能单凭标志证明 DB 保存已完成。

目前 Web 已有选角退出 `play.ts:624–627`：禁止重连、关闭 WebSocket、显示登录，和旧参考“关程序”不同；`classic-auth.ts:28/107/113/183` 已有退出按钮皮肤/回调，不能据旧 UI-058 gap 否认这一窄范围已有适配。世界中没有小退/大退 typed 命令。`play.ts:587–592` 默认重连会恢复 selectedCharacter，`:594–601` 可以用无 resumeCharacter 的登录进入选角，但不能直接套普通重连。`GatewaySession.cs:427–435` 的 SelectCharacter/readonly game connection 与 `ReadGame:695` finally 取消整个 lifetime，意味着当前世界 TCP 结束并不会保留一个可再次选角的同一网关会话；仅改 phase='characters' 或显示旧角色列表并不闭环。下一批退出需要明确连接重建、主动/意外断线意图区分、迟到回调隔离和存档后重登验证，不能先隐藏画面、改权威物品或宣告退出已保存。

来源定位基准为 `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client`。以下指纹锁定本轮所读源码/像素 manifest；参考一般按 gb18030 解码，Share.pas 部分非 ASCII 注释需容错解码，引用的条件编译与路径常量为 ASCII。

| 参考文件 | SHA256 |
| --- | --- |
| IntroScn.pas | `838aed85539bfc668393ce8e5b80d9adccb15da21791203b97c7bc481305711d` |
| ClMain.pas | `08c79ace18755ca96882079ed0c5a5ff71c91bd8bb2de6ab539d90272355c74e` |
| FState.pas | `f685ca03af5a999858d5826e924ace25b404b2703107831027b59f6f2491e6b8` |
| DWinCtl.pas | `7603c9cbe0fcb224f3017a2b618b3d5cb581dd4850ae10735ec7834359ed61ff` |
| Grobal2.pas | `12216ae60afe64b7e6fb9143e9286552559f2a445d1fff56d62a158e938e3ed2` |
| Share.pas | `e25154998cd50b1ad1c08f8c123bd10e575bbabbb011cd96c570f7317d1af8c2` |

| 当前项目文件 | SHA256 |
| --- | --- |
| apps/web/src/classic-auth.ts | `8a664ea5389be9c60847ce5160bfc51f9a3d48f816fad9299dbe1d39575ab8d1` |
| apps/web/src/classic-input.ts | `9bc601c8ecf77505666778f6c09e4a6b6897e8d973dda415dbf09dc9db339ebd` |
| apps/web/src/classic-hud.ts | `96e0d09683ceca56f3fc7ef79cfa5002786a1451715f7e8b2a482d13c28ae31a` |
| apps/web/src/play.ts | `ba4a10f32da259d3ab7b8d108ee163891a7281894a573a1ee0994adfa1d84515` |
| services/web-gateway/GatewaySession.cs | `9f0714cb14b3b0eb5b39860b5f13e4a58fb09cfb0ad1108827e6ab73839194e8` |
| vendor/openmir2/src/LoginSrv/Services/ClientSession.cs | `08bdcf6dac50d7e5336015a411f4d43074f5262ba96b156241f804d03edd1231` |
| vendor/openmir2/src/M2Server/Player/PlayObject.Message.cs | `b9b8963ad0bfd1976e1e8f8bacdf767fc86d68f4c3a968a1036e87eb87bbbee8` |
| assets/web/ui-national/prguse/library.json | `f7b57c6ef18d71132655acd8502b26672fca0ee323cdbd3f6477a698bda2f363` |

未新增历史同版、native_runtime、browser_runtime 或 visual_comparison 结论；本文件不升级 UI-015/UI-058/UI-061 清单状态。下一批必须保持来源/玩法协议与浏览器适配的证据边界。
