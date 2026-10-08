# 小退、退出会话与存档源审查（2026-10-01）

UI-058 仍未完成。本次独立核对当前主仓库服务端/网关与参考 `ClMain.pas`，仅新增本文和 `.runtime/reports/logout-session-source-review-eighth.json`。未修改生产代码、协议、计划、台账、运行数据、账号或服务。证据等级为 `server_source`、`reference_source`、`source_review`；没有原端运行、浏览器运行或本批存档测试证据。

当前源码中的小退发送 CM1009 并保留重选角色票据，角色消失后先将存档加入队列再关闭游戏连接；数据库回执在服务端内部处理。这里存在三个不能用于声称“已保存”的捷径：TCP EOF、保存队列变空、`RcdSaved == true`。进一步核对发现，当前 DBSrv 未检查存储 `Update` 的 bool 返回值，仍可能发送成功回执；即时重登还会优先读取更新后的内存缓存。因此下一批需先补失败链验收，才能暴露保存完成语义。

## 精确源码链

下面路径均相对于仓库根目录，参考文件使用实际外部路径。行号绑定本次报告中的完整文件 SHA，后续源码变化应重新定位。

| 路径及行号 | 独立核对事实 | 等级与边界 |
| --- | --- | --- |
| `vendor/openmir2/src/OpenMir2/Messages.cs:41` | `CM_SOFTCLOSE=1009`；同文件 `:29/:255` 为查询角色 CM100/SM520，`:488` 为内部保存回执 DBR1102 | server_source；消息号不能证明会话已退或已保存 |
| `M2Server/Player/PlayObject.Message.cs:884–894` | 非 OffLineFlag 时设 `BoReconnection=true`、`BoSoftClose=true`；wParam=1 另设 emergency；此 case 无客户端业务 ACK | server_source；CM1009/0 与 /1 的票据语义不同 |
| 同文件 `:369–391` | Run 处理 soft/emergency/kick 后调用 MakeGhost；kick 才有此处 SM_OUTOFCONNECTION | server_source；设置关闭标志和 MakeGhost 都不是 DB 完成通知 |
| `M2Server/Player/PlayObject.cs:3507–3511`、`M2Server/Actor/BaseObject.Base.cs:488–500` | override 调 base；base 设 Ghost（CanReAlive 分支改 Invisible）、GhostTick 并 DisappearA | server_source；不能把 Ghost 与持久化等同 |
| `GameSrv/Word/WorldServer.cs:646/:707–714` | Ghost 分支移出 PlayObjectList、Disappear、加入 free list、DealCancelA、SaveHumanRcd，随后 CloseUser 和服务组退出通知 | server_source；源码顺序证明先 enqueue 再关闭，不证明保存提交完毕 |
| 同文件 `:1075–1089` | 非 robot 才 MakeSaveRcd，组成 Account/ChrName/SessionID/PlayObject 的 SavePlayerRcd，再 AddToSaveRcdList | server_source；内存快照、排队与 SQL 事务为不同阶段 |
| `GameSrv/Services/FrnEngn.cs:198–209` | 临界区内只向 m_SaveRcdList 添加记录 | server_source；未为新一轮存档清零 RcdSaved |
| `GameSrv/Word/Threads/CharacterDataProcessor.cs:66–88`、`GameSrv/Services/PlayerDataService.cs:94–108` | processor 送保存记录；DB_SAVEHUMANRCD 请求有 queryId，发送成功后保存该 queryId 至 SaveProcessList | server_source；queryId 关联内部请求，未转成浏览器业务 ACK |
| `DBSrv/Services/Impl/DataService.cs:217–250` | 找到角色后 cache.Add、storage.Update、bo21=false；随后发 DBR_SAVEHUMANRCD/Recog1；失败分支返回另一种失败消息 | server_source；忽略 Update 返回值的问题见下节 |
| `GameSrv/Services/PlayerDataService.cs:114–129`、`GameSrv/Services/FrnEngn.cs:56–76` | 当前 queryId 的消息仅在 DBR_SAVEHUMANRCD 且 Recog1 时 RemoveSaveList；匹配记录设置 RcdSaved=true 并移除 | server_source；内部相关性可追踪，但当前 ACK 不等于 SQL 写入成功 |
| `GameSrv/Word/Threads/CharacterDataProcessor.cs:124–145`、`GameSrv/Services/FrnEngn.cs:159–178` | 加载同名角色前，若仍在保存队列则 reTry 等待 | server_source；是保存/加载屏障，不是客户端“保存完成”接口 |
| `M2Server/Net/TCP/TCPNetChannel.cs:166–168`、`M2Server/Net/ChannelMessageHandler.cs:385–407` | 普通 close 在 !BoReconnection 或 soft+emergency 条件下通知注销票据；1009/0 的 reconnect 保留票据 | server_source；主 Gate 连接整体断开另有 `TCPNetChannel.cs:277–285` 路径，下一批需单独验证 |
| `GameSrv/Services/AuthenticationService.cs:81–93`、`LoginSrv/Services/SessionServer.cs:143–146/:315–330` | 发送 SS_SOFTOUTSESSION；LoginSrv CloseUser 调 SessionManager.Delete，再处理旧 SessionList | server_source；释放动作与数据库保存完成没有同一个客户端事务 ACK |
| `LoginSrv/Services/SessionManager.cs:58–73` | Delete 同时校验 sessionId 与 account，并在锁内删除匹配的 session/account 映射 | server_source；禁止拿旧会话结果释放另一个新登录 |
| `DBSrv/Services/Impl/UserService.cs:353–361/:443–491` | CM100 解码 account/sessionId，CheckSession 通过后 SetGlobaSessionNoPlay，查询角色列表并回 SM520；失败为查询失败并关闭 | server_source；新鲜角色列表响应只证明选角查询，不证明完整角色存档 |
| `DBSrv/Services/Impl/ClientSession.cs:118–133/:160–190` | CheckSession 核账号/票据；save/load 和 StartPlay 状态另分别修改 | server_source；票据保留、可查询、可重新加载是不同状态 |

表内以 `M2Server`、`GameSrv` 等开头的短路径均位于 `vendor/openmir2/src/`。报告保留上述范围的逐行原文和所有 21 个来源文件的 size/SHA；未记录任何实际账号、票据或口令。

## 保存确认的真实缺口

1. **存储返回 false 仍可能被发成成功 ACK。** `DBSrv/Services/Impl/DataService.cs:233–235` 调用 bool `_playDataStorage.Update` 后不读取返回值，直接设 `bo21=false`；`:240–244` 据此发送成功回执。接口 `Storeages/DBSrv.Storage/IPlayDataStorage.cs:24` 明确返回 bool。MySQL 实现 `Storeages/DBSvr.Storage.MySQL/PlayDataStorage.Save.cs:14–25/:45–83` 在未找到角色、连接失败或事务异常时可返回 false。这个源码反例足以阻止当前 ACK 被升级成 durable-save 证明；本批没有执行真实 DB 故障注入，也未修改该逻辑。
2. **队列消失可来自错误清理。** `CharacterDataProcessor.cs:35–47` 在 DataServer 断开且队列非空时记录保存失败并 ClearSaveList；`FrnEngn.cs:255–265` 直接清掉列表。故 InSaveRcdList=false、等待结束或角色能重入都不能单独作为成功标记。
3. **RcdSaved 不是每次保存的完成令牌。** 本次对 `vendor/openmir2/src/**/*.cs` 的赋值扫描仅找到初始化 `PlayObject.cs:892` 设 false，以及匹配内部 ACK 的 `FrnEngn.cs:66` 设 true。SaveHumanRcd/AddToSaveRcdList 没有新一轮重置；旧的 true 无法绑定本次退出。若下一批需要暴露 saved 状态，必须关联本次保存请求/queryId，而不是读取这一个布尔值。
4. **即时重登可能仅证明缓存。** `DataService.cs:174–177` 先 cache.Get，未命中才 storage.Get；同文件 `:233–234` 保存时先把新快照加入缓存，再做存储更新。因此快速重新入图拿到新背包不构成独立 SQL 持久化证明。安全验收需另有绕缓存的持久数据读取或受控缓存失效后加载，不能仅重复同一缓存路径。

以上是当前源码证据。未证明正在运行的 DLL 与该源码一致，也未审完每个 MySQL 子保存方法的错误传播、事务行数或所有替代存储后端。修正外层 bool 判断之后仍需实际失败与持久化回归，不能直接宣布整条链闭合。

## 原参考的小退与大退

实际参考文件为 `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client/ClMain.pas`，SHA `08c79ace18755ca96882079ed0c5a5ff71c91bd8bb2de6ab539d90272355c74e`。原字节用 GB18030 解码查阅；这是参考实现，不是国服同版运行证明。

- `:1167–1184` AppLogout 先 OK/Cancel 询问“是否重新选择人物”，OK 后 SendClientMessage(CM_SOFTCLOSE,0,0,0,0)、ClearActors、CloseAllWindows。非 BoOneClick 分支设 g_SoftClosed 并 tcSoftClose；另一分支直接 tcReSelConnect。Savebags 是本地 `.itm` 缓存，与服务端数据库存档不同。
- `:2523–2540` timer 处理 tcSoftClose 时关闭游戏 TCP；`:2763–2775` disconnect 在 g_SoftClosed 条件下清标志并安排 tcReSelConnect。`:2541–2574` ResetGameVariables、切 stSelectChr，用新 SelGate 连接或 BoOneClick 路由后查询；`:2880–2885` SendQueryChr 发送 CM_QUERYCHR 和 LoginId/Certification。
- `:1187–1194` AppExit 确认后写本地 bag cache 并 FrmMain.Close。这段代码是退出桌面程序；浏览器返回登录页或关闭标签页必须登记为 Web 适配，不能改名成已验证的原“大退返回登录”。
- `:1575–1609` Alt+X/Q 分支在战斗判断前给 latest hit/magic/struck tick 写 now+10001，存在自定义强退行为。该参考不能证明国服标准战斗等待限制。`:2532` 的 timer Interval=2000 与 BoOneClick 分支的 Interval=1 也不构成固定可见倒计时或同版动态时序。

原参考窗口素材、进入/离开选角动画、音乐切换、战斗退出限制、错误提示和同版原客户端输入行为均需后续 native_runtime 与 browser_runtime/visual_comparison 证据。

## 当前网关为何不能仅切 phase

`services/web-gateway/GatewaySession.cs:8` 的 login/selection/game 为 readonly 一次生命期连接；`LegacyConnection.cs:7/:12–17/:68` 持有同一个 TcpClient，dispose 后不能当作新的可重连槽。Gateway `:95–102` 的选角进入流程启动 ReadGame；`:461–470` 以当前 account/character/ticket 入图。`:729` ReadGame finally 会 CancelAsync 整个会话 lifetime，`:335–345` 最终结束 WebSocket。当前源码没有 logout 请求/角色重选阶段。

下一批必须拥有独立的 game/selection 连接代际和关闭原因。预期小退的游戏 EOF 应结束旧 game reader，而不终止仍需选角的 WebSocket；旧 reader 成功、错误或 finally 都不得影响后继连接。小退使用保留票据做真实 CM100/SM520 查询，不能复用旧角色数组或只把 `phase` 改成 characters。大退/异常断线的票据释放、密码内存和 UI 重置要另有明确边界，且不为重选持久存储用户口令。

## 下一批安全实现与验收

先补存储失败回执、保存请求相关性与可重连会话生命周期的生产回归，再接 UI-058 确认弹窗。以下仍是待实施/待验收条目：

- Cancel 不发送 CM1009、不关闭连接、不清权威状态；Confirm 在当前 world 会话只发一次请求，重复点击、超时、断线及旧返回各有确定结果。等待文案只能描述已达到的退出/查询阶段，未取得持久性证明前不显示“已保存”。
- 小退 CM1009/0 保留当前账号票据，真实新选角查询返回 SM520 后才能展示 characters；后继新 game 连接实际入图。同一代请求保护 account/session、logoutId/epoch、角色与 mapGeneration，旧 game/map/NPC/equip/trade/skill/input/音效异步回调不污染新阶段。
- 普通/大退与 emergency 退出按服务端票据释放规则处理；释放旧 session 不能影响新登录。重登和小退不要依赖客户端保存密码，也不在日志中输出票据或认证消息体。
- 存储 Update=false/异常、DBServer 不连通、内部负回执、排队超时均不得产生成功 saved 结果；保存与同角色 reload 按真实 queryId/实际生产类测试。需要涵盖 SQL 绕缓存校验、失败后重试和保存队列清理路径，确认不会以假 ACK 或新缓存掩盖 SQL 失败。
- 真实协议测试再次入图后核对装备/背包实例号、耐久与实例属性、金币、技能快捷键、权威地图/坐标；持久数据独立核验要与 UI 状态回执分开记录。测试账号/物品的安全准备与清理由下一批另行授权并归档，本次没有创建它们。
- 浏览器真实操作覆盖 world→确认→等待→选角→再次入图、返回登录、Cancel、重复请求、资源迟到和连接失败。原端对照另核系统框、快捷键、战斗限制、定时器和音乐/动画；源码/夹具测试不能替代这些运行证据。

本次只读源审查不给 UI-058 增加完成度，也不改变现有经济、概率、地图、持久数据或运行服务。报告 `complete=false`，全部上述实现门槛仍待后续批次闭合。
