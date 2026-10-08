# 保存确认、缓存与退出边界：第九批源审查

本次重新读取实际 Delphi 与主仓库保存链，另按授权修复缓存首次写入及保存后按账号、SessionID 精确解除读取状态。本文与新报告 `save-v9-source-review.json` 独立归档，保留第八批退出源审查及其源码指纹。本文是源码和测试边界说明；没有读取或修改 SQL、运行原客户端、部署 DLL、退出实际角色或停止原服。`historical_sameversion` 仍为 `unknown`。

成功保存回包必须来自存储成功，不能来自 TCP 发送、缓存命中、队列消失或旧的 `RcdSaved`。结果未知的已发送快照保留同人物读取屏障，避免新快照越过它。本批尚不能提供浏览器“已保存”的持久化证明。

## 原参考与当前协议

实际参考目录为 `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir`。原字节按 GB18030 解码，完整 SHA 与逐行片段记录在新报告。

| 来源 | 实际规则与范围 |
|---|---|
| `DBServer/DBSMain.pas:5–8,382–437` | 使用 `Grobal2`；保存正常分支 `:432` 发送 `DBR_SAVEHUMANRCD/Recog=1`，失败 `:435` 使用 `DBR_LOADHUMANRCD/Recog=0`。参考内部记录库并非本机 MySQL。 |
| `M2Server/RunDB.pas:4–5,348–363` | 使用 `Grobal2`，按 queryId 等待 5000ms；只将保存标识及 Recog=1 判为成功。发送时 Recog 带 SessionID。 |
| `Common/Grobal2.pas:469–474` | 本链内部编号为加载 1100、保存 1102。客户端同号的 `SM_OPENHEALTH`、`SM_BREAKWEAPON` 属于另一消息域。 |
| `Common/Common.pas:218–230` | 另一套定义是保存 1101、失败 1102；不能替代上述 `uses Grobal2` 链的编号。参考目录存在不同协议版本，不据此认定国服同版。 |
| `DBServer/DBSMain.pas:329–378` | 只有新获取读取权后 `nCheckCode=1` 才访问记录并成功回包；找到会话而已加载时仍是非法重复请求。 |
| 主仓库 `vendor/openmir2/src/OpenMir2/Messages.cs:483–488` | 当前链明确 DBR_FAIL=2000、DB_SAVEHUMANRCD=101、DBR_LOADHUMANRCD=1100、DBR_SAVEHUMANRCD=1102。内部保存 ACK 不是客户端退出 ACK。 |

## 已读取的第九批实现

下面描述读取时的工作树实现，精确行号与文件指纹绑定新报告。其他成员仍可能修正各自源码；本文不能替代最终构建、测试回执或部署清单。

`DBSrv/Services/Impl/DataService.cs` 的 `SaveHumanRcd` 读取存储 Add/Update 返回值，成功后才刷新缓存、精确解除当前账号与 native Recog 对应的会话读取权，并发送保存 1102/1。空对象、存储 false 或异常不发送成功。已经提交后的缓存或会话维护失败独立记录，不能把一次真实提交改判成未提交；缓存刷新异常留下绕缓存标记，即使 Delete 也失败，下次仍调用存储读取。

`LoadHumanRcd` 仅放行本次新获取读取权的 `nCheckCode=1`，同时验证实际读取对象、Header 与 Data。新获取读取权后 Index/Get 失败、异常或空对象会按原 account+SessionID 释放本次 claim；重复请求没有获取 claim，不能解除另一请求已经持有的读取权。这区别是修正旧 `boFoundSession` 放行条件后新增的必要失败路径。

`Storeages/DBSrv.Storage/Impl/CacheStorageService.cs` 原先只在键已存在时替换，首次 Add 根本不插入。现用实际 ConcurrentDictionary 索引器原子插入或替换，保留大小写不敏感键与 Delete。缓存条目仍是进程内对象，不是独立 SQL 持久记录。

`DBSrv/Services/Impl/ClientSession.cs` 新增二参数 `SetSessionSaveRcd(account, sessionId)`，只解除同时匹配的会话；空账号、非正 SessionID 或无匹配返回 false。单参方法保留兼容，生产保存和失败读取清理必须使用二参数方法。旧会话的迟到成功不能按 account 一并解除同账号新会话。

`GameSrv/Services/PlayerDataService.cs` 的保存等待绑定 queryId 与实际 SavePlayerRcd，按同人物最旧快照串行；只1102/1释放对应记录，1100/0退回该尝试且换 queryId 重试，其他标识、5秒超时及发送异常保留结果未知屏障。不同人物回复逐项处理，不以队头缺 ACK 阻断全部角色；活动 queryId 登记、进程内单调不复用编号及耗尽后拒绝分配，使已退役回包不能消费后继请求。存储明确失败后的重试与发送/确认未知后的保留是不同路径。

`GameSrv/Services/FrnEngn.cs` 入队重新置 `RcdSaved=false`；对应成功 ACK 移除后，仅在同人物没有后续快照时置 true。`ClearSaveList` 不再删除仍需确认的快照。`CharacterDataProcessor` 保留断线队列，先处理保存，再按 `InSaveRcdList` 阻挡同人物加载。该屏障由进程内队列提供；ClientSession 的读取位不能替代保存请求相关性或跨进程持久化。

## 重连与停服仍需分别验证

初次审阅的 `GameSrv/Services/DataQueryServer.cs`（修前 SHA `34d518b81291144f0ed7be5c76690d5c60134b194bea952e44a6a512629ea861`）在连接/断开时没有重置接收半帧，拼接使用 ByteBlock.Buffer 的容量而非实际 nMsgLen；全 src 调用扫描只有 `GameServer.StartUp` 调用 Start，没有自动重连注册。后续源码已补 nMsgLen 拼接、连接代际及半帧清理、UsePolling 重连、Stop 取消连接并阻止重连；新报告分别保留所读快照和复审指纹。只读锁序审查未发现 SaveGate/UserDBCriticalSection 反向获取，接收侧改用独立 receiveGate 后 Enqueue 无须获取 SaveGate。不能用 fake IsConnected 切换证明生产重连恢复，也不能重发提交结果未知的保存来制造成功。

当前 native 停服仍有独立阻断，保存 ACK 修复不能关闭它：

- `GameSrv/AppService.cs:156–178` 的 SavePlayer 最多等待10秒，超时只 return 当前 void 方法；上层 OnShutdown 没有接收失败结果。
- `:240–267` 先取初始在线快照，再执行 StopService，随后3秒取消。`:194–237` 的 `await Task.Factory.StartNew(async ...)` 未 Unwrap，外层 Task 完成不代表倒计时、关 Gate 与最终 Stopping 完成。
- 初始快照后的倒计时期间世界仍运行，最后 Gate 关闭还可能产生新的退出快照，源码没有一次最后的确认 drain。
- `GameSrv/GameServer.cs:49–58` 停止 UserProcessor、CharacterDataProcessor 后才关 DataServer；仍待确认的快照只在进程内，进程退出会失去重试与读取屏障。
- `OpenMir2/TimerScheduledService.cs:37–42` StopAsync 释放定时器并停止后台循环，不能当作已经排空保存队列。

这些问题由源码即可定位，本文没有执行停服、DB断线或故障注入。Root 已明确把 native 停服修复与验收留作下一批门槛，部署或备份前不能用本批内部 ACK 测试声称完整正常停服已保存。

## 测试与剩余门槛

新 `tests/NativeSaveConfirmationRegression/SessionCacheChecks.cs` 公开 `SessionCacheChecks.Run()`，执行真实 CacheStorageService 与 ClientSession，返回6组并逐组打印 PASS；Program/csproj 由 Root 接入。覆盖首次 Add、同键大小写 replace、Delete、旧会话精确释放、错误身份保持锁，以及 CloseSession 后迟到清理与一次重新读取。fixture 只构造、不调用 Start；账号同步目标显式设为独立的 `127.0.0.1:1`，最终 Stop 并 Dispose 私有 socket。即使重连插件尝试连接也不接触原服默认端口，本文不以未调用 Start 推断绝无 TCP 尝试。

实际最新 `.runtime/reports/save-v9-confirmation-third.json` 记录 .NET8/Release 编译0、运行0，26组 PASS，其中6组是本模块。已核当前两生产文件及最终测试 SHA `9930fc7f84e39d6f4cd07cd3e63bfa47e3bf3666b509ccc1a807518e47468462` 与该回执一致，210输入前后冻结；逐组输出见 `save-v9-confirmation-third-run.log`。其余20组是真实生产 DataService 的独立回环 TCP 加 fixture 存储，不是实际 MySQL。first/second尝试保留；second后续失败由测试入口缺少生产 Program 已有的 GB2312 provider 注册导致，不是新生产缺陷，不能把其中已通过的旧6组替代最新测试源码回执。

保存链测试还需真实生产类/TCP 验证提交后成功、false/异常负回包、缓存 Add/Delete 失败仍从存储读取、失败 load 释放自己 claim、重复 load 保持已有 claim、同人物多快照顺序、其他人物不受未知 ACK 阻塞、超时后迟到成功与重连不自动重发未知请求。真实 SQL 应另测子保存异常传播、事务完整性、零行更新、COMMIT/回包丢失与绕缓存读回；bool=false 或 RollBack 调用本身不能证明数据库已回滚。

还发现快照一致性边界：所读 `WorldServer.MakeSaveRcd` 将 StatusTimeArr、BonusAbil、三组 Quest 数组直接从活人物赋给记录；`ClientUserItem.ToServerItem` 直接共享 Desc。同人物串行能控制发送顺序，不能单独冻结这些可变引用。若排队或明确失败后的重试期间人物继续变化，可能得到旧金币与新任务/属性混合的记录。已向 Root 提交此具体来源，须以入队快照深拷贝或其它确实冻结数据的方法，以及实际生产工厂回归闭合；本文不宣称排队记录已经不可变。

实际 MySQL 内容、运行 DLL 与源码匹配、异常退出后的恢复、停服最终 drain、限定账号保存与清理、完整小退/大退协议和浏览器/原端行为均未由本文验证。第八批资料与报告保留，本文 `complete=false`，不提升 UI-058 或其它台账状态。
