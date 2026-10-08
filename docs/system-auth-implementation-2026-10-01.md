# 系统确认与密码修改：第八批实现和验收边界

本批补 UI-015、UI-061，继续追踪 UI-005/007/008/058/063 和相关美术项。目标仍是完整版本复刻；本批两项由 missing 改为 partial，不关闭原端、浏览器或持久化验收。

## 生产系统弹窗

联机页和校准页共用 SystemDialogController、同一份 system-dialog.json 和国服 PNG。横版 360、竖版 380、小框 381，加四种按钮结果及 361–368 正常/按下帧。源码参考与原像素独立登记，背景和按钮只接收锁定源/索引身份、精确文件/几何，PNG 实际解码失败或尺寸错误会显示可操作的恢复界面，不改用另一个版本的图片。

居中按参考 integer div：横框 (174,210)、竖框 (272,120)、小框 (306,247)，不叠加 WIL 的角色锚点偏移。第一版 Math.round 对奇数高度偏一像素，已修正并补独立字面坐标断言。文字字体候选、大小、14 行距、白字/黑影从契约读取；这些字体拟合仍属 proposed，同版栅格未验证。

Enter 只接受唯一 OK 或唯一 Yes；多按钮不依赖 HTML 隐式点击。Escape 仅在 Cancel 存在时返回取消，OK/Yes/Cancel/No 各自保留结果；场景失效为 interrupted。支持排队、替换、销毁、Tab 焦点循环、可见有效控件恢复、IME 隔离、拖动/按下/移出/松开和资源重试。小框放不下多按钮时转横框、浏览器排队/焦点策略均独立记录为适配。模态覆盖层保留最高 CSS 优先级，普通窗口的置前计数不受小范围上限影响。

生产 767/772 系统文本只应用任务更新并显示统一提示，保留底下 NPC 身份、服务窗口和经济等待。打开提示取消未来走跑、追击、连击、挖矿和选技意图，已经发送的动作仍等待权威回包。世界键/鼠标/技能/地图/地面拖放与 NPC 新命令门控同时检查模态；死亡、清图和当前连接关闭会中断旧决策。选角 Exit 需要明确 OK 且仍处于同一 socket/选角场景；返回登录是浏览器适配，尚无角色小退/F12 菜单。

## 独立密码修改

ClassicAuth 在登录场景提供国服 53 入口和 50 改密底图，四字段与嵌入的同意/取消热区来自 auth-actions.json。真实原 WIL 中 54 是 296×253 底图、65 是 800×600 选角底图，不能作为 53/64 的按下帧。53 复用正常态、50 内按钮复用底图，未知状态仍明示未核。输入热区是原像素内拟合，入口位置来自参考实现；字段/按钮同版点击行为和字体尚未实测。

账号、原密码、新密码、重复新密码；后三字段遮罩，参考 maxlength=10。Enter 循环字段而不提交，IME 合成和隐式 submit 单独隔离；等待期间禁编辑/同意，允许取消等待。登录、选角、建角、世界隐藏和 pagehide 清除改密口令；初始资源迟到不重开已隐藏认证层、不丢改密草稿。资源自然尺寸/源身份校验、失败可见控件、明确重试及旧解码代数有回归。

PasswordChangeController 使用独立 WebSocket，先等真实能力握手，再发送带正 safe-integer requestId 的改密 JSON；重复密码不发送，不借用世界连接，不保存到 localStorage，不自动使用新密码登录。真实 envelope 的 sequence/mapGeneration 和当前请求身份过滤迟到/重复/不合法回复。

网关独立 LoginGate TCP 在新建后等待 5.1 秒，再发 CM2003；总超时 15 秒，前端 18 秒。原服只在连接超过 5 秒才处理该命令。SM506 唯一确认成功；SM507 的 -1 为原密码错误，-2 为临时锁定，与参考客户端文案不一致。严格 GBK 最多 10 字节、字段字符/控制字符/分隔策略见 [协议文档](web-protocol.md)。原服发送后超时/断线为结果未确认；关闭等待没有撤销命令，不能声称回滚。未发送与无法判断是否发送分别记录，不记录口令或认证消息体。

## 实际验证

| 范围 | 已执行结果 | 回执 |
|---|---|---|
| 原素材 | 16 帧 WIL 重解码、PNG bytes/RGBA/透明统计相同；18 专项通过 | system-auth-eighth-native-assets-final.json / source-freeze.json |
| 新前端专项 | 系统 27、改密控制器 19、认证与业务 AST 22 组通过 | 当前系统27组见 system-v8-release-system_dialog_regression.log；system-dialog-production-regression.json 为历史26组。改密/认证原回执为 password-change-controller-eighth-run.log / auth-actions-production-regression.json，最新完整脚本与源码指纹以 release 为准 |
| 全前端 | TypeScript/Vite 通过，33 脚本 420 实际断言组通过 | system-v8-release-web-tests.json / release-checks.json；此前原始计数含一条 19/19 汇总 PASS 行，另有 verified 聚合说明，历史保留 |
| 完整 Python | 358/358 通过，涵盖当前合并工作树，并非都由本批新增 | system-v8-initial-python-full-check.json |
| 网关 | 改密生产类/TCP/Run 15 组、既有 GatewayRegression 3 组通过；全量 NET8 兼容 publish，测试与发布 DLL 同 SHA | password-change-eighth-regression.json / system-v8-gateway-stage.json；项目正式 target 仍 net10，此处未宣称 stock net10 构建 |
| 实际原服 | 生产控制器 VM + 真实 WebSocket→18801→LoginGate，仅未知账号 SM507/0；11 组通过，等待实测 5190ms；SELECT 前后账号/角色/索引为 0 | password-change-live-rejection-v8.json |
| HTTP | 16 PNG 与 manifest 的 source/HTTP/dist 相等，页面/模块/新 CSS 路由通过 | system-v8-http-final.json；与早期 layer-build 的后续字体源码差异保留关联范围，最终编译以 release 为准 |

仅将自有测试网关从 PID13716 切换到 PID14992，确认切换前无活跃客户端。旧 publish 保留回退；新网关日志单独命名。本批未部署原服 DLL、修改配置/数据库或原安装 WIL/WIX。M2Server.dll、GameSrv.dll 在第七批封存后、本批暂存检查前已有变化；本批暂存、真实拒绝测试和收尾哈希一致。收尾首次误用第七批哈希基线的失败另存 system-v8-runtime-closure-first-attempt.json，当前边界见 system-v8-runtime-closure.json；未回滚已有文件或原服进程。运行库升级不改变项目的默认 net10 声明。

## 尚未完成

- 原安装包 mir.exe 同状态交互、三种框/全部按钮/输入热区/字体栅格与当前浏览器视觉差分；实际 DOM/CSS/GPU/中文 IME 动态验收。
- 隔离账号的真实注册→改密 SM506→旧密码失败/新密码登录、错误次数锁定、结果未确认后的核对、持久化与限定账号清理。现有 native 备份/清理要求正常停服，本批仅只读未知账号拒绝，不热跑备份冒充一致性证明。
- 删除、交易、死亡与断线等所有系统场景的统一组件迁移和逐项业务规则。生产死亡窗仍采用既有专用流程。
- F12、显示/声音选项、战斗限制、角色小退/大退、selection/game lifetime/epoch 与票据续用。
- 退出源审查发现 Update 返回 false 仍可能发保存成功 ACK、断线会清保存队列、RcdSaved 不按每次请求复位、缓存优先重载可能遮蔽 SQL 失败。须先修保存失败路径并通过持久化验收，见 [退出与存档源审查](logout-session-source-review-2026-10-01.md)。本批仅文档取证，未修改原服保存代码。

既有 GA0/地图历史配对、599 物品/63 技能缺图、MagID48、完整技能/经济/社会玩法等继续由总台账追踪；本批不以两个 UI 新入口代替完整客户端交付。
