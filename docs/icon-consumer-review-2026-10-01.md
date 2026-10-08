# 图标 consumer 接线只读复审（2026-10-01）

范围为当前 `inventory.ts`、`item-quickbar.ts`、`service-window.ts`、`ground-items.ts`、`item-icons.ts`、`skills.ts`、`classic-hud.ts`、`classic-ui.ts`、资源目录生成器及资源管理器。未修改生产源码、package 或三个复刻台账，未重复全套测试，也未启动原服/浏览器。复审证据属于源码审查与一次独立生产模块 VM 执行，不构成 browser/native 运行验收。

## 取帧与业务隔离结论

背包、装备、快捷栏与服务挂槽使用 `ItemIconAssets`/`itemIconElement`；地面物品使用相同 assets 状态和精确来源解析，再加载 Pixi 纹理。物品索引为服务端 `looks`。现存 `item-assets.json` 名称覆盖与替换映射只生成 `proposed_unselected` 诊断，不参与 URL 选择。`inventory.iconIndexOf` 是 raw looks 的兼容导出，名为 `loadFallbackItemIcons` 的兼容函数现在加载已登记的国服 gameplay 源。

技能页与 HUD 统一调用 `skillIconIndexOf`，读取 `icon-usage.json` 的效果族规则。正常索引为 `effect * normalMultiplier`，原 `Downed` 状态额外使用 `pressedOffset`。没有发现生产物品/技能图标的 `magicId` 直接取图、`index-1`、默认帧或相邻帧补图入口。按下帧的 `+1` 来自原 FState 规则，保持独立身份校验；搜索命中的地图、堆索引与槽编号运算不属于图标回退。

独立 Node VM 执行真实 `icon-frames.ts`，对当前目录的全部 1000 个物品与 108 个技能双态（216 项）逐项比较 URL，使用真实 national manifests、active source 契约和 icon usage 契约，差异为 0。401 个物品/45 个技能准确覆盖与目录一致；真实缺图没有因迁移降低目标而隐藏。

`classic-ui.loadLibrary` 与 item gameplay library 请求均在拒绝时按原 Promise 身份移除缓存，成功与 in-flight 请求共享。显式技能/HUD/物品重试只更新资源状态，render 不删除背包权威实例、服务 quote 或成交等待、装备 pending、施法和绑键 pending。技能/HUD 有加载/render/按下绘制代次；地面物品有地图 generation、当前实例、draw token 和资源 epoch，旧回调受到隔离。

## 发现并已发给负责 agent 的问题

**R-01，物品 DOM 的旧图片回调可以污染新图标状态。** 审查快照 `apps/web/src/item-icons.ts` 第 94–100 行的 `onload`/`onerror` 只捕获 assets epoch，该 epoch 仅在显式 retry 时变化。clear/replace、服务挂槽替换或快捷栏重绑移除旧 img 后，回调仍能调用 `imageFailed`/`imageEmpty`，触发新的界面 render。独立执行真实 `ItemIconAssets` 与 `itemIconElement`：创建同一 looks=48 的旧/新 img，标记旧图 detached、新图 connected，并按真实 manifest 尺寸完成新图 onload；随后旧图 onerror 使该图资源状态从 `ready` 变为 `failed`。没有业务 pending 被直接释放，但新界面同 URL 被标成失败。建议增加明确的当前 DOM/render 判定或移除回调保护，并覆盖 clear/replace 后旧 load/error 的生产回归。该问题已交给 GAME/Root，本文记录修复前快照，不承担其后续修复状态。

修复前 `item-icons.ts` SHA-256 为 `b183c1dae1cba8dbf1bfa359d0224ff1346f4e9820e2783fdf3507441e660d3b`。复现输出为：`before=ready`，`after=failed`，`freshImageConnected=true`，`oldImageConnected=false`，失败 URL 为当前 national frame 48。测试操作只改变 VM 内 fake DOM/资源状态。

后续修复回执：[item-icon-consumers-sixth-postreview.json](C:/Users/122/Documents/Codex/2026-09-26/https-github-com-leiniaozl229-mir2-git/mir2/.runtime/reports/item-icon-consumers-sixth-postreview.json)，SHA-256 为 `a4825c159911b1f9a46fcc21346e107e364d89d86e3cc68583f4ca8db295f757`。修复后 `item-icons.ts` SHA 为 `939a94240dea706eb6e4179d49ec4abbd79baa5395877d2a2fefcecee4250db0`，回调同时要求 epoch 匹配、图片未 detached 和 consumer 当前 render/实例匹配；cached src 的同步回调延后微任务，在 append 后确认连接状态。背包/装备/快捷栏提供 render 与权威实例判定，held 图标另有选择代次，服务挂槽提供 render 与关闭判定。29 组专项包含本文 Items48 旧 error/alpha0、cached src、同 URL 新 render 和 held 重选；四个已有夹具 38/12/11/22 组与 TypeScript 均通过。只读核对该回执各日志 SHA 与现存文件一致；这些回执仍为 fake DOM/Pixi/network/timer 下的生产回归，未替代真实浏览器验收。

**R-02，资源总览旧文案曾把扩展候选计入覆盖。** 初读 `resource-manager.renderOverview` 写“经典与扩展素材合计覆盖”，当前真实 coverage 只来自已核国服 source，候选贡献为 0。问题发给 Root 后，复读第 89 行已经改为“已核国服生效源覆盖”，同时地图数量改用当前目录值，别名文字明确只比较编号/效果字段并保留其他规则待核。该项在复审过程中已校正。

**R-03，资源库数量标签仍需保留范围说明。** `resource-manager.ts` 第 45/78 行显示“导出范围齐全”和“有效帧”，生成器第 313 行实际取的是 manifest `frames` 记录数与 `missing` 数。当前 MagIcon 72 条导出记录包含 6 个 tiny 占位；map dependency 图库也不等于整库导出。建议标为“导出记录”和“manifest 声明范围缺项为零”，或展示 active source coverage 字段。此标签问题不改变玩法 consumer 的缺图判定，不能将记录数用作可用图标或完整复刻证明。

后续复读 `resource-manager.ts` 第 19/78 行，字段与详情标题已改为“导出帧记录”；第 45 行对 `reference_candidate` 明确显示“参考候选，未绑定”。`visual` 在 assets 分区不生成图片，assets 详情也不生成 candidate 预览。当前文件 SHA 为 `f179a32994a418bcce557e050173f90fe9a97db55033c6e6d002b0f874b91c06`。以上是源码/目录证据，导出记录与可用图标、整库范围和原端用途继续区分；本文保留初读问题作为审查历史。

## 资源诊断证据范围

当前 `resource_catalog.py` 物品/技能的 active 选择使用原 `looks`/`effect` 和统一契约，旧映射明确 `proposedSelected=false`，内容版本保留 `unknown`，两条 MagicID48 效果冲突仍为 `conflict`。`resource-diagnostics.ts` 显示源锁验证、源版本、namespace、精确索引、普通/按下缺项和未选候选，没有给候选图生成预览 URL。管理器缺项过滤同时检查技能双态与身份冲突。

离线 `ResourceSources.source_check` 的源文件 hash/bytes 校验可支持“源锁验证通过”；runtime `resolveIconFrame` 校验的是 manifest 身份/几何。两者均不能单独证明该客户端版本的用途、全部运行状态或原版像素对照。当前目录候选不参与 active coverage，真实缺图和 MagicID48 冲突仍使完整资源闭环不通过。

## 浏览器 smoke 断言迁移范围

`tools/resource_manager_smoke.mjs` 已迁移历史 570 maps/204 missing 和自动扩展图断言：读取当前生成目录及 icon usage 契约，核对全部八张统计卡、图标 coverage 与 missing 总数，检查准确 normal/pressed 索引、ID 冲突诊断、未选候选无图片，以及 missing 过滤数量。原物品/技能/怪物/地图/模板对话框/缺项列表点击路径保留，额外候选与冲突条目也经过真实 UI 选择路径；预期目录 SHA 会写入实际运行报告。仓库路径用 `fileURLToPath` 解码，允许本机 Windows 读取同一生成目录。

本轮只执行 `node --check tools/resource_manager_smoke.mjs` 与文件 diff 检查，均通过；没有执行脚本主体、CDP、截图或安装浏览器，没有生成本轮 `resource-manager-smoke/latest.json`。历史浏览器回执不能验证本次迁移后的断言。真实浏览器 smoke 仍待显式执行和独立归档，语法检查不计入浏览器通过数量。
