# 第十一批：召唤物让路与 HUD 等级

本批处理两个已定位的细节；完整复刻目标继续开放。第十批冻结主题和 closed 报告保留，新证据独立使用 `follow-hud-v11` / `follow-v11` 前缀。

## 召唤物跟随

生产 `BaseObject.WalkTo` 已计算主人前方下一格的 `n20/n24`，却用 `newX == 0 && newY == n24` 判断让路。结果是召唤物能够走入主人下一步的位置，增加碰撞；地图横坐标为零且纵坐标相同的合法位置又被错误拒绝。改为同时比较 `newX == n20 && newY == n24`。主人方向、地图移动与碰撞、墙体、安全区、火墙、移动消息和失败回滚流程保留。

依据是本地 GB18030 `GameOfMir/M2Server/ObjBase.pas` 的 WalkTo 第 2043–2047 行，SHA256 `65d59610b8a1f7f4dcf76058a753651d1a97997ad273fc4df8e468e65a989262`。这是参考源码证据，尚未与目标年代原端实际玩法逐项比对。

`tests/SummonFollowRegression` 使用实际生产 WalkTo、ActorMgr、地图文件解析与格子迁移；只隔离网络和无关服务。修复前第三次运行 10/20：八个主人方向、横坐标零误拦截及开启避火后的主人前方占位，共十项按预期失败。前两次失败来自新测试夹具缺少类型命名空间，完整 build 日志保留，不能算作生产问题复现。

修复后专项 20/20，涵盖八方向、x=0、同横/纵坐标不同格、墙体、存活占位、地图边界、召唤物安全区豁免、天然怪物安全区规则和真实 FireBurnEvent 避火。现有 NativeCorePolicyRegression 49/49、MonsterAiRegression 29/29、原 CoreRegression 入口均通过。Core 只有一个汇总 PASS 标记，不能计为一个独立场景。

四个入口重新构建至本任务独占 `work/follow-v11-final/artifacts`，实际运行的五个生产 DLL 哈希一致；972 个选定 native 源码、项目及 JSON 输入构建前后稳定。首个构建 28 个警告、0 错误，其余三个 0 警告、0 错误。结果：`.runtime/reports/follow-v11-native-final.json`，旧源码复现：`follow-v11-native-reprothird.json`。另以 PE metadata 比对旧复现与修复后 M2Server 的全部 2,357 个方法及 IL，只有 `BaseObject.WalkTo` 变化，见 `follow-hud-v11-il-comparison.json`；这不包含源码换行与调试信息差异。本批未部署或重启原服，当前本机战斗尚不能据此认定已使用新 DLL。

## HUD 等级

原 `data-hud-name` 实际填等级，却放在左侧血球下方。生产 HUD、联机页和校准页统一改为 `data-hud-level` / `levelText`；布局契约改为 `nationalHud.fields.level`，相对主底板 `(660,147)`，800×600 绝对位置 `(660,496)`。国服布局隐藏独立职业文字，避免覆盖 Lv 数字；候选布局仍保留职业显示。角色姓名继续由人物窗口承担。

依据是 `Client/FState.pas` 的 `DBottomDirectPaint`：`PomiTextOut(660, SCREENHEIGHT - 104, IntToStr(...Level))`，以及人物窗口姓名绘制分支。该文件 SHA256 `f685ca03af5a999858d5826e924ace25b404b2703107831027b59f6f2491e6b8`。国服 Prguse#1 底图的 Lv 区域支持位置判断。契约 `reference_source` 只确认文字用途和绘制坐标；宽 76 是 Web 文本容器选择，仍属于 proposed。仍须同版原端检查文本基线、字体、色彩和缩放。

新增 `tests/hud_level_regression.mjs` 执行实际生产 ClassicHud 和布局模块，覆盖权威属性/升级事件、延迟素材加载后的最新等级、金币/血量更新不改等级、退出清空、新角色替换，以及两页面共享控件。4 组通过，已加入 canonical `test:web`。当前 36 脚本 459 个 PASS 标记、TypeScript 和 Vite 构建通过；这些标记不是 459 项原端视觉验收。结果：`.runtime/reports/follow-hud-v11-web.json`。

## 跟踪与边界

UI-022、GAME-023 记录本批证据并清除对应已修复的具体源码缺口；状态保持 partial。195 项仍为 5 implemented、181 partial、9 missing、0 verified。修改台账后的 Python 全套 366/366，285 个 Python/契约/台账输入前后稳定，台账审计和 diff 检查通过。历史哈希保全和本批最终输入记录在 `.runtime/reports/replication-follow-hud-v11-batch.json`。

网页改动由现有 Vite 开发服务提供；HTTP 只能确认资源可取得，不能替代浏览器交互。没有执行浏览器/GPU、原端截图、听音或真实账号玩法验证，没有操作生产数据库。仍待：多人/多召唤实际跟随和碰撞、全部怪物与首领行为、原端 HUD 各状态帧/菜单热区/字体差分，以及此前正常退出、存档未知恢复和后台连接生命周期缺口。全功能、美术、经济与社交的其余条目继续按总台账推进。
