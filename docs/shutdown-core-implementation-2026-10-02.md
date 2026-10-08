# 第十批：退出会话、正常停服与原服基础逻辑

本批继续完整 Web 复刻，覆盖设置、声音、退出状态机及其原服前置保存边界。UI 详情见 [设置与退出实现](logout-settings-implementation-2026-10-02.md)，协议见 [Web 协议](web-protocol.md)。本篇和本批新回执独立记录，不改写第八、九批冻结报告。全部目标仍未完成，台账状态只衡量落地和证据，不表示复刻百分比。

## 网页设置和退出

普通 F12 按 Delphi 参考翻转总声开关。Ctrl+Alt+F12 扩展配置窗没有同版依据，本批未实现。新增 Web 设置入口，提供总声、背景/效果分音量、地图大小/隐藏、聊天记录显示；音量更新已有和新播放声音，偏好分别保存。设置板采用国服 Prguse402，关闭64，小退136/137，大退138/139；六帧的源、原索引、几何和 PNG SHA 锁入 `client-settings.json`。位置、设置用途及独立音量明确为 proposed，同版原菜单热区待核。

小退/大退共用系统确认，取消不发送退出，不清背包或在途动作。确认后立即遮罩、阻断新命令，只取消未来持续意图；此时继续接收当前地图和物品权威状态。收到网关 accepted waiting 才退役旧世界、清凭据及自动重连。接受前相关拒绝可恢复刚更新的世界，接受后错误不能恢复旧人物。小退只有相关的新 characters 结果才回选角，不自动选择旧角色；大退返回登录并关闭 WS，是原应用退出在浏览器中的适配。死亡回城按钮也复用明确的小退确认，删除“延迟一秒就保存成功”的旧假设；完整死亡复活仍待原服验收。

## 网关连接和代次

`GatewaySession.Logout.cs` 复用实际 `GatewaySession.Run` 和不可复用的 `LegacyConnection`。请求需要正安全整数 `logoutId`、模式和当前 `mapGeneration`，所有 Web 包带 `sessionGeneration`。合法新认证尝试、进入人物和接受退出均推进代次；退出结果缓存也检查其认证代次。同一 WS 大退后重新认证、尚未选角时，旧 ID 不能返回上一次 login 终态，不能改变新账号选角状态。

每个人物 epoch 捕获独立游戏 TCP、reader、计时器和发送锁。退出先在 Web 发送锁内发布 waiting，然后停止旧挖矿/键槽等待计时器。小退只发送一次 CM1009，按同一截止时间等待读者退出和原 TCP EOF，再新建选角 TCP，以账户及 ticket 发 CM100，解析新 SM520。Windows 下不能先取消阻塞 Receive 再调用 GetStream 发送 CM1009；该真实失败已保留，最终顺序先发原协议，再有限等待/清理读者。

同 ID 的同一请求可重发当前 waiting/终态，不重发 CM1009/CM100；冲突模式、旧地图、其他 pending 请求或新世界旧 ID 相关拒绝。退役读者的 finally、迟到完整/半包、旧地图片段和五秒计时器不能关闭或修改新连接。新角色的背包、装备、技能、金币、NPC、交易及所有 pending 从新原服状态建立。超时、坏 SM520 或接受后断线，返回 failed/登录，清身份，不重放退出。

CM1009、原 TCP EOF、新 SM520 和 UI 终态都不是 SQL 提交确认。无保存 lease nonce 的迟到旧 save/新 load，以及跨进程数字 session 复用仍开放。

## 正常停止的保存屏障

`AppService` 提供共享的停止 attempt 和明确结果。调用方取消只取消自己的等待，不撤销已接受的保存；失败/超时留下冻结状态和诊断，后续 attempt 可以继续。Host 停止路径不能因其 token 到期直接跳过排空；模块/连接某一步抛错后，可重试失败步骤，已经完成的步骤不重复执行。

`ServerBase` 分离世界、存储和网络 lifetime。先关闭新载入准入并静默 GameGate 入口，等待世界定时处理器和怪物线程结束，再执行模块停止和冻结。DB 收包/ACK、已准入的载入及保存队列继续运行。GameGate 非空接收队列的消费者完成并 join；同时 Stop 调用共用同一个任务。

冻结后共享真实 `ProcessHumans` 的载入初始化段，返回前不运行人物 tick。反向删除实际完成的 LoadPlayerQueue 索引，终态 null 清除；每个完成/拒绝/超时 query 精确退役，迟到 positive 不能留缓存阻塞 PendingLoadCount，也不能冒充另一人物。仍在途的其他 load 保留。数据库及世界 deferred 金币变更调用当前没有实现；停止期间 false 或未执行的任务保留为不支持屏障，不清队列宣称成功，也不开始最终快照。世界金币入口释放其锁并在关闭准入后拒绝新任务，避免旧缺失 LeaveCriticalSection 造成阻塞。

所有交易先 `DealCancelA` 退款并检查 escrow 清空，再为每个人物入队一次最终冻结快照。普通 `SaveHumanRcd` 的“允许判断→序列化→入队”、Freeze 标记及最终快照使用同一个 world `_shutdownGate`。控制台普通保存若先取得锁，其快照只可能排在最终快照之前；冻结后被拒绝，不能迟到覆盖退款结果。

只有真实保存 ACK、原生 pending、世界载入/金币/工作计数和最终快照阶段都完成，才停止存储处理器/DB 连接并报告停止。五秒未知不是成功，不能清队列消除未知。本批没有 durable journal；进程被杀、电源断开、COMMIT 网络未知恢复，以及旧 save 在新 load 后到达的持久顺序仍需后续实现和验证。

Planes 的 listener/client 及其重连定时器、Authentication 回调和通用 send pump 没有全进程 join 证据。相关 actor 处理入口经已停止的 SystemProcess，本批保存屏障检查不能外推为所有 TCP/后台任务均已关闭。

## 装备持久和天然怪物保护

原 Core 构建缺口涉及的生产基础方法恢复并重新编译。四个实际 ushort 扣减位置（武器DoDamageWeapon，攻击/挖矿共用；衣服受击；饰品受击；复活戒指1000点）使用饱和减法，低持久扣到零，保留原 RNG、通知阈值、删除消息和能力重算。挖矿的既有PlayObject.Base调用同一武器方法，该Base文件未改。

保护范围复用现有安全区几何并处理 null 列表。Master 为空、race≥53 且排除55/110/111/112 的天然攻击怪物，不能走入安全区或从区内攻击。自然刷怪、CanReAlive 和 Respawn 使用可走且非安全的候选格；没有合法局部候选时不发布怪物、不提前清尸体或再滚掉落。搜索有边界，不能证明大地图其他位置没有可用格。默认脚本 CreateMonster 和召唤 placement 保留既有语义。

此天然保护分类来自项目补丁0025，不能称为已证明的国服原版规则。fearFire 修正为 `canWalk && CanSafeWalk`，避免普通地面被旧反向条件拒绝、事件火焰拒绝被覆盖。Master WalkTo 的既有 `newX==0` 与 Delphi `newX==n20` 差异仍单独开放，地图占位/保护并发提交也未证明为原子。

## 本批验收和运行范围

| 范围 | 证据和结果 | 明确限制 |
| --- | --- | --- |
| 网页 | 35 个 canonical 脚本、455 个 PASS 标记，TypeScript noEmit/Vite 通过；其中新增 UI19、play15 个专项组 | 实际生产 TS/AST，DOM/Pixi/media/transport 为夹具；无浏览器/GPU/听音证明 |
| 网关 | 8 个入口、69 个实际组；独立审查真实复现并修复新认证旧退出缓存 | 隔离 NET8 兼容构建、生产 Run/private TCP；正式 NET10 声明保留，无真实原服账号/SQL重登 |
| 停止、载入及并发保存 | 24/24组、16独立场景；NativeSaveQueue按当前依赖重编23/23；938个输入构建/运行前后及归档时一致，两入口同组7DLL | 实际 AppService/ServerBase/World 类与私有 DB TCP、隔离Debug/NET8；不等同生产 SQL 持久化或全部后台任务退出 |
| 基础逻辑 | NativeCorePolicy49/49、原CoreRegression与MonsterAi29/29通过；三个入口在同一final-bin执行，五个公共DLL字节一致 | 19个选定源前后锁定、Release/NET8；与停止组分别锁产物，不合称两组之间同一DLL。独占cwd，非原端/部署 |
| Python/台账 | 完整 discovery366/366通过；台账只提升UI-058到partial，195项为5 implemented/181 partial/9 missing/0 verified；修改台账后单独重跑其审计 | 完整Python发生在台账更新前，源当时稳定；后续仅两个台账输入变化单独登记，不称重跑全套。全内容/同版复刻仍 incomplete |
| HTTP/运行 | 当前18801 PID18648，发布 DLL `6cc8f88011c2baff2c87eb0e5787d202548def8c171ecab650da6906ea8f79ce`；实际健康和未认证 WS通过，7个 Vite页面/模块与6PNG+清单 delivery通过 | WebSocket只验功能声明/相关拒绝/正常关闭，未登录或操作浏览器 |

当前回执：`logout-v10-web-first.json`、`logout-v10-gateway-accepted-final.json`、`logout-v10-art-resolved.json`、`logout-v10-runtime-closure.json`；UI 当前冻结为 `logout-v10-ui-accepted-{final,source-freeze}.json`。停止24、队列23及其938输入的最终报告为 `shutdown-v10-{regression,save-queue-compat,source-freeze}.json`；核心49/Core/AI29为 `native-core-v10-final-source-freeze.json`。网关 seventh 的最后一个旧 fixture 路径错误保持 overall failed；七个成功入口加 eighth 单独修复的 GatewayRegression 组成最终八入口，不把失败报告改成成功。

本批仅更新已授权的本机18801测试网关，保留两个旧 publish。关闭旧网关前确认无已建立客户端；当前新 source/publish 指纹一致。原服过程与磁盘 GameSrv/ScriptSystem/SystemModule 在其他工作中发生变化，独立记入 runtime closure；本批未停止原服、部署这些原服源码、登录生产账号或改生产行。磁盘 SHA 不证明加载进内存的程序集身份。M2 持久/天然怪物和正常停止的当前源只以隔离构建/类测试为依据。

第九批39/23/213/72为历史保存/队列/存储 seam/隔离SQL范围，原报告及schema清理记录保留；本批没有重做72项SQL，不将原TCP退出证明替代存储提交。所有初始失败、审查反例和修复后证明分别封存。

后续逐条继续：同版原端菜单/热区、浏览器 pointer/Tab/IME/截图、实际声音/GPU、完整死亡/复活、真实退出与重登持久核对、故障恢复/耐久日志，以及其余美术、技能、经济、社交全部开放需求。
