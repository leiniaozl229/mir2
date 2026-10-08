# 第十批 Web 声音、设置与退出实现（2026-10-02）

本篇只记录本批 UI 源码与 VM 回归，不改变前八、九批的冻结档案。UI-058 全范围仍为 partial：没有同版国服原端运行、浏览器操作或逐像素对照证据，退出终态也不是 SQL 保存确认。总计划和三域台账由根任务统一登记。

## 已核来源与适配边界

- Delphi `FState.pas:3813–3821` 的 `DOptionClick` 仅翻转 `g_boSound`，并写入“音乐打开/关闭”聊天文本。`ClMain.pas:1499–1507` 区分普通 F12 与 Ctrl+Alt+F12 扩展配置窗；本批普通 F12 复用既有 Web 总声开关，不实现参考扩展配置窗。
- `FState.pas:1194–1203` 的 HUD 声音图为 11；`:1234–1239` 的退出/小退图配置为 138/136，其坐标来自配置值和注释默认值，没有同版国服热区证明。`:6754–6760` 提示 Alt+X、Alt+Q、F12。
- `ClMain.pas:1167–1194` 的小退/退出均使用 OK+Cancel 确认。小退确认发送 `CM_SOFTCLOSE/0`（1009）；大退关闭原应用。本批大退返回浏览器登录页，属于 Web 适配。
- `ClMain.pas:1575–1611` 与 `FState.pas:5568–5598` 带参考扩展强制更新时间字段的退出规则，不采用它作为国服战斗限制。实际退出是否被当前服务器接受由网关决定。
- 参考 DConfig 所用 image182 与本机国服 Prguse182 的 64×16 像素不匹配，不能把 182 当设置大窗。本批采用国服通用板 402（416×347）、关闭 64、原小退 136/137 和大退 138/139（28×13）。保留原 OUT/EX 像素，不重绘原按钮文本。设置用途、HUD 新入口、布局、字体、分音量和显示选项均标为 proposed。
- WIL 签名偏移 (+7,-44) 只记录来源；UI 按整图原宽高和局部坐标显示，不施加人物绘制偏移。源版本配对为 `historicalSameVersion:unknown`。

Delphi 源指纹：

| 源 | SHA-256 |
| --- | --- |
| FState.pas | f685ca03af5a999858d5826e924ace25b404b2703107831027b59f6f2491e6b8 |
| ClMain.pas | 08c79ace18755ca96882079ed0c5a5ff71c91bd8bb2de6ab539d90272355c74e |

绝对参考根为 `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client`。`content/classic-176/client-settings.json` 是新事实契约，锁定 Prguse source/index SHA、六帧文件/尺寸/PNG SHA，并单列 proposed 热区。运行时校核 source/index 身份、帧文件/尺寸和真实 Image natural 尺寸；未在浏览器重新计算 PNG 字节哈希。

## 生产交互与模块复用

`ClientSettingsView` 与 `DisplaySettings` 同时用于 play 和校准页。前者复用 `ClassicUiSession`、`applyNationalUiFrame` 和 `makeClassicWindowDraggable`，没有第二套皮肤。校准页的退出结果是显式离线夹具，共用 `LogoutController`、`LogoutWaitingView` 和生产 SystemDialog；不会发送真实退出协议，也不把模拟 characters/login 当联机或保存证明。

设置包含总声、背景/效果音量、compact/expanded/hidden 地图显示、聊天记录显示、小退和大退。`GameAudio.preferences/setEnabled/toggleEnabled/setVolumes/subscribe` 会更新正在播放的 BGM/效果、新 voice 和 blur/focus 恢复后的音量；分音量乘以每个 voice 的原 baseVolume。保留 `mir2-audio`，另保存 `mir2-audio-levels`；显示选项保存至 `mir2-web-display-v1`。存储失败仍可在当前页使用。Tab 地图循环同步持久化，隐藏聊天记录保留输入。

设置窗覆盖 stage 指针，Tab 在可见有效控件内循环，Escape 仅关闭设置，IME 不触发快捷退出。普通 F12、Alt+X/Q 排除编辑器、IME、repeat 和额外修饰键。死亡世界仍可从受功能门控的菜单请求退出。资源失配或 PNG 失败显示“界面暂未加载”，设置仍可操作，显式重试保留当前选项；旧异步回调不能覆盖重开实例。HUD 父层 pointer-events:none，因此新入口显式 pointer-events:auto。

退出复用 SystemDialog 的 OK+Cancel：Enter 多按钮不隐式确认，Escape/取消只完成本地决定。取消不发送 logout/CM1009、不清背包或 pendingAction。初始选角退出仍是确认后关闭 WS 回登录；角色内退出使用新网关协议。

## 退出两阶段与关联

请求为 `{type:'logout',mode:'reselect'|'login',logoutId,mapGeneration}`，仅 `connected.features.logout===true` 且当前世界连接可用时开放；正整数安全范围 ID 在本页递增，每次显式确认发送一次。响应为相关 `logoutState`，携相同 logoutId/mode、sessionGeneration、waiting/characters/login/failed，characters 必须来自真实新 SM520。普通 characters 不能完成等待。根网关拥有旧 native reader 的退役、CM1009 与新 CM100/SM520 流程。

1. 确认后本地等待立即盖 UI、阻断新世界/NPC/物品/交易/聊天/技能指令并取消未来连续意图；继续消费原 epoch 的地图、物品/金币等权威包和地图加载，保留已有凭据与重连策略。
2. 收到网关 accepted waiting 后才清凭据/自动重连、旧 NPC 窗口、visuals、magicEffects、audio、装备/技能展示等待，隔离旧地图 promise 和消息。重复 waiting 不重复执行清理；较旧的 envelope/body 代数不能通过。
3. 等待前 typed logout 拒绝只匹配当前 ID/mode，移除 overlay，恢复已更新的当前世界与原重连能力。旧 ID/不同 mode 或 accepted waiting 后的 typed error 不能终结当前操作。
4. 相关 characters 才清旧世界 authority、返回实际选角；不会自动重进旧人物。新选择回调捕获 socket 与 sessionGeneration。原自动重连 resumeCharacter 只消费一次，后续创建/重选列表不会自动选择旧 A。
5. login/failed 或等待中断线返回登录；wire failed 缺少或传 false requiresLogin 也不会复活旧世界。页面不显示 saved；不自动重放 CM1009。大退终态关闭 Web WS。未接受时断线的结果仍未确认。

外层先核 sessionGeneration，再核 mapGeneration。MapView 原 map transaction 继续复用；其 isCurrentMap 增加 accepted/session 边界，旧 setMap/minimap 完成不会重置退出后的 worldReady。延迟行会查询固定 socket+session 代数；旧 actor/audio 异步仍依既有生产生命周期 guard。回城按钮去掉“等待一秒即保存死亡状态”的旧假设，改共用确认的小退到真实选角，不自动选择或宣称复活完成。

## 源码定位

| 文件 | 当前行 | 职责 |
| --- | --- | --- |
| `apps/web/src/logout.ts` | 10 | `export class LogoutWaitingView {` |
| `apps/web/src/logout.ts` | 20 | `export class LogoutController {` |
| `apps/web/src/client-settings.ts` | 9 | `export class DisplaySettings {` |
| `apps/web/src/client-settings.ts` | 22 | `export class ClientSettingsView {` |
| `apps/web/src/client-settings.ts` | 43 | `this.music.oninput=()=>options.audio.setVolumes({musicVolume:Number(this.` |
| `apps/web/src/game-audio.ts` | 27 | `preferences():AudioPreferences{return {enabled:this.enabled,musicVolume:t` |
| `apps/web/src/game-audio.ts` | 31 | `setVolumes(value:Partial<Pick<AudioPreferences,'musicVolume'|'effectsVolu` |
| `apps/web/src/classic-input.ts` | 23 | `export function routeClassicKey(event:KeyboardEvent,actions:ClassicKeyboard` |
| `apps/web/src/play.ts` | 239 | `const settings=new ClientSettingsView(classicModalLayer,classicSurface,{aud` |
| `apps/web/src/play.ts` | 242 | `const logout=new LogoutController({available:canLogout,mapGeneration:()=>ma` |
| `apps/web/src/play.ts` | 246 | `onAccepted:()=>{credentials=undefined;reconnectEnabled=false;if(reconnectT` |
| `apps/web/src/play.ts` | 251 | `function canLogout(){return socket?.readyState===WebSocket.OPEN&&gatewayFea` |
| `apps/web/src/play.ts` | 252 | `function worldCommandsAvailable(){return socket?.readyState===WebSocket.OPE` |
| `apps/web/src/play.ts` | 255 | `function finishLogout(state:LogoutState){` |
| `apps/web/src/play.ts` | 263 | `function showCharacterSelection(active:WebSocket,list:SelectCharacter[],res` |
| `apps/web/src/play.ts` | 705 | `else if(message.type==='characters'){const resume=resumeCharacter;resumeC` |
| `apps/web/src/play.ts` | 713 | `const isCurrentMap=()=>!logout.isAccepted()&&sessionGeneration===targetS` |
| `apps/web/src/ui-calibration.ts` | 52 | `const settings=new ClientSettingsView(document.querySelector<HTMLElement>('` |
| `apps/web/src/ui-calibration.ts` | 54 | `const logout=new LogoutController({available:()=>true,mapGeneration:()=>1,s` |
| `apps/web/src/ui-calibration.ts` | 56 | `onAccepted:()=>{systemDialog.interrupt();audio.setPhase('silent');},` |

## 回归与冻结

当前专项为 `tests/logout_settings_regression.mjs` 19 组和 `tests/logout_play_regression.mjs` 15 组，共 34 组，执行真实生产类/TS AST，DOM、媒体、transport 为夹具。包括取消/重复/失效代数、accepted 回调一次、typed error 阶段、failed/断线、旧选角回调、queued map+物品+entity→reject、reject→unexpected close、accepted 后晚包、Map promise、音量实际应用/持久化、旧资源失败与焦点/IME。

另将 9 个受本批新增 play 边界影响的旧 fixture 迁移到 `tests/helpers/play_ui_context.mjs`：旧玩法 scope 的退出/设置边界保持 inactive，但 send/selection/cycle/defer helper 从生产 AST 提取，保留原断言和计数。首次 compatibility 失败保留；新专项完整覆盖退出 active 路径。针对性 11 脚本全 exit0，TSC exit0，sourceBefore==After。

最新回执：`.runtime/reports/logout-v10-ui-accepted-final.json` 与 `logout-v10-ui-accepted-source-freeze.json`。此前 `.runtime/reports/logout-v10-ui-targeted.json` 的 17/11 是接收 waiting 前处理调整之前的历史接入回执，仍保留，不作为当前行为证据；compat-first/second 失败也未覆盖。根任务负责最终全套 canonical runner、Vite、网关回环与统一台账。

仍需同版 F12/菜单/战斗限制与所有热区、真实浏览器 pointer/Tab/IME/资源 retry、截图差分、完整保存/停服路径及 Web 大退适配验收。VM 和真实网关回环不能替代这些证明。全部 scope 不升级 verified。
