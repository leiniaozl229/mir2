# 商店、出售、修理、仓库服务细节批次

日期：2026-10-01。对应 UI-010、UI-033、UI-038–UI-043。本批保持 `partial`：当前生产组件已按可核查的素材与参考流程实现，尚无国服同版运行逐态对照和真实浏览器交互/像素差分。本文件只记录本批有限依据和实际生产回归，不替代完整 UI 清单。

## 原始依据及版本边界

Delphi 参考目录为 `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client`。`FState.pas` SHA256 为 `f685ca03af5a999858d5826e924ace25b404b2703107831027b59f6f2491e6b8`。该参考目录未证明与国服 2003/1.76 二进制同版；以下规则属于 `reference_source`。

| 源码位置 | 可核查规则 | 当前采用及限制 |
| --- | --- | --- |
| FState.pas:15–16、1322–1361 | LISTLINEHEIGHT=13，MAXMENU=10；DMenu frame385，DSell frame392，独立上一页/下一页/确定/关闭，挂物槽27,67,61×52 | 买/取菜单和卖/修/存挂槽使用不同生产结构；参考按钮坐标超过当前素材尺寸，未照抄为国服同版热区 |
| FState.pas:4894–5009 | 菜单十行，自绘名称/价格/成色；点击选中、属性提示；仓库共用菜单 | 每行只选择，独立确定；属性来自真实实例，成色报价不能作为最大持久；字体、基线和红色精确值仍 proposed |
| FState.pas:5027–5052 | 商品目录确定后按 subMenu 请求成色或买入；成色买入/仓库取回使用实例号；LastestClickTime+5000 | 选择不提前成交，按钮等待期间禁止重复；原5000为点击节流，本批8秒 UI 等待取消属于 proposed |
| FState.pas:5054–5075 | 本地商品/仓库页步长 MAXMENU-1=9；成色远端页步长10 | 本地十行九步重叠，成色 page=0/10/20…；空末页可以上一页返回，短页禁止继续；额外返回目录按钮 proposed |
| FState.pas:5078–5110 | SoldOutGoods/DelStorageItem 按实例删除并限制滚动索引 | 只有已接受权威结果才调整当前展示列表，放槽不删背包 |
| FState.pas:5195–5225、5251–5264 | DSell 单槽拿放/置换；出售/修理放物后询价；确定才发送卖/修/存请求 | 单槽接受当前实例，报价后独立确认；无 held 时点击槽取消本地选择；参考完整 held 置换还未实现 |
| FState.pas:4795–4802 | CloseDSellDlg 归还未提交的拿取物 | 本批挂槽仅表示选择，背包权威实例不提前移除；关闭清展示，不回滚或丢弃经济权威成功 |
| FState.pas:4602–4644 | DItemGridDblClick 未按 BoStorageMenu/SpotDlgMode 分支；Ctrl移快捷，其他条件走使用物品 | 买/取模式下背包继续原使用/穿戴路由；卖/修/存双击/右键快速挂槽为 proposed 浏览器便利入口；其生产路由另由 inventory_service 回归覆盖 |

参考 DMenu 没有显式双击购买处理。本批双击仅选择、确定成交是保守的 proposed 浏览器规则，需要同版运行确认。

已实际查看导出像素，属于 `native_pixels`，不属于 `native_runtime`：

| 本地素材 | 实际尺寸/用途 | SHA256 |
| --- | --- | --- |
| assets/web/ui-national/prguse/385.88de6040d4a97805.png | 308×205，三列菜单、十行空间，内含上一页/下一页/确定/关闭像素 | 88de6040d4a978058fe3c003afee8aef380a86972808a760597c4c597a86ce8a |
| assets/web/ui-national/prguse/392.1f3e6404f4155ec8.png | 140×181，单挂物槽、报价条、内含确定/关闭像素 | 1f3e6404f4155ec81097969ca75d5dbbd471c0227bda28af9bf9f41163f25ca2 |

热区按上述像素测量，再由 `content/classic-176/service-ui.json` 提供唯一几何。画布800×600不变；页面放置坐标、拖动热区、状态文字位置、hover/pressed/disabled 回退和字体仍 proposed。服务组件与 ClassicHud 共用 `skinServiceWindow`，不再把 generic402覆盖到385/392，也不以参考其他尺寸按钮覆盖素材已画好的确定键。

2026-10-03 服务热区反馈已按素材底图修整：385/392 本身已画有翻页、确定和关闭像素，normal 状态直接显示这些原帧；hover、pressed、disabled 改为只调亮/压暗热区下的底图像素，避免原先的矩形 hover 描边盖住图案。旧浏览器不支持 backdrop-filter 时保留描边/暗色回退。亮度比例属于交互推断，不是同版按钮状态帧证据；浏览器视觉比较仍待验收。`tests/service_windows_regression.mjs` 22组组件行为未变且通过，`tsc --noEmit` 通过；本会话未能连接浏览器，未作截图或实际热区目测。

## 生产交互和协议边界

`shop.ts`：目录和具体成色在同一菜单互换，目录本地分页、成色远端分页；等待细分为 details/purchase/quote/sale。成色回复同时核对当前 NPC、等待阶段、name/page；购买核对名称和实例号。成色 Tooltip 使用网关嵌套真实 item 的属性，`SM_SENDDETAILGOODSLIST(652)` 中 MaxDura 已被售价覆盖，因此最大持久保持0；行内只显示真实当前持久。没有确认过的数量/堆叠命令不被前端构造。

终审修复成色分页：`detailPageFull`保存最近一次匹配652原始页是否满十件，已接受购买删掉显示行后仍可下一页。该标记在有效回复更新，短/空页关闭下一页；新请求开始保留旧页标记，但ServiceWait禁止await期间重复翻页；clear/新NPC/返回目录清标记。没有新增自动成交或额外回读。

本轮集成复审补齐652响应的 `name=request.name`：网关保留捕获的请求名，即使成色空页也可由前端准确核对名称；不会把另一个商品的旧空页填进当前菜单。`tests/NpcGatewayRegression/Program.cs` 的实际 `UpdateShopState` 反射回归增加非空旧页和空页的 name/page/stamp 断言，沿用9组NPC+4组binding的组数，不将附加断言重复算成新组。已实际net8构建0警告/0错误并运行9组NPC+4组binding全PASS；回执为`.runtime/reports/npc-gateway-service-details-2026-10-01.json`及同名`.log`，JSON保存当前Gateway/Program/Projection/helper源SHA256；本改动不解决原 TCP 同 NPC/同商品/同页无 nonce 的不可辨别回复。

`repair.ts`：一个挂物槽，当前背包实例放入后查询费用，报价有效后按确定修理。当前网关允许0费用，负报价禁止提交；特殊修理最大持久损耗与同版收费仍欠端到端取证。

`storage.ts`：存入使用单槽，放槽只选物、确认才发送；取回使用十行菜单和九步本地页。网关704发送累积 items，同 NPC、同模式后续页刷新列表、保留选择与已发取回等待；主动新会话由 play 先清组件，组件不拿 npcId 假装 session stamp。满库、存费、满包/超重和存档等真实条件仍需完整联机验证。

三个组件均提供 `acceptsInventoryItem()`、`offerInventoryItem(item)` 和 `syncInventory(items)`。出售/修理/存入只接受当前背包实例；buy/take 无接物槽。offer 返回 true 后仅消费 held 光标，未移除权威背包。出售/修理发送失败或异常恢复原挂槽/报价；存入 offer 不发送请求。权威更新刷新选中持久/完整属性，物品消失清槽和报价，已发送 sale/repair/store 等待保留，原成功仍由 play/Gateway 应用权威状态。

`ServiceWait` 的8秒计时捕获实际 request 对象，旧 timer 不能释放同值新请求。超时、拒绝、关闭、blur、hidden、pointercancel 清本地等待，迟到报价不能填槽；成功经济结果独立属于 play/Gateway，组件关闭不取消成交。组件 `rejectPending(reason?,phase?)` 和实际play error路由只取消commandType对应phase，旧quote不清sale/repair、旧details不清purchase、旧store不清take；默认无phase仍供关闭/输入丢失取消全部当前等待。相同phase的旧Web拒绝尚无独立requestId，不能保证不清同phase的新等待。原 TCP 同 NPC 无 nonce 的归因限制继续按 UI-037 登记，本批不声称解决不可区分回复。

## 已执行回归

`tests/service_windows_regression.mjs` 转译实际生产 ShopView、RepairView、StorageView、ServiceWait、皮肤 helper 和共享物品 Tooltip/orePurity，在 fake DOM/timer 下 **22组 PASS**。日志为 `.runtime/reports/service-windows-regression-2026-10-01.log`，逐条包含源 SHA256。覆盖：

- contract 热区/尺寸/拖动位置；目录十行九步、独立确认、库存仅在接受后变化；成色 name/page/实例/阶段、十步远端分页和空末页。
- 单槽出售、修理、存入和菜单取回；负/零报价、错误实例、重复确认、失败后重新询价、false/throw 恢复。
- 同 NPC 累积仓库页保留 take；权威属性/极品变化、物品消失、已发经济等待保持；旧 timer、超时重试、关闭/blur/hidden/pointercancel。
- 共享 Tooltip 的 bonus、价钱不冒充最大持久、原尺寸图标、矿石 banker rounding。
- 第21组用真实四类成交等待证明phase拒绝不释放其他phase，匹配拒绝仍清timer；其余生命周期取消规则保留。
- 第22组覆盖满页买一件后仍可下一页、await不重复请求、短/空页停翻及目录/clear/新NPC清标记。

`tests/inventory_service_regression.mjs` 本轮执行 **12组 PASS**，实际 InventoryView 与 service-input helper 的 fake DOM 回归覆盖拿取/落槽/拖入、拒绝保留 held、当前实例/属性、原普通使用、pending、顶层与模态门控，新增第12组矿石tooltip实际orePurity round-to-even。`tests/frontend_regression.mjs` 本轮38组 PASS；服务组是静态接线检查，行为验证以新22组生产组件回归为准。`tsc --noEmit` 本轮通过。全量构建、其他业务回归和浏览器/真实协议探针由主任务另行登记，不从此日志推导。

上述检查不证明真实 CSS 布局、浏览器焦点/拖动、多设备缩放、国服按钮状态帧、真经济成交/金币/独立 itemAdded、重登经济持久或同版原端一致。验收保留清单中的全部条件。

本批生产接线 `tests/npc_play_regression.mjs` 最新 **12组 PASS**，日志 `.runtime/reports/npc-play-regression.log`：实际AST抽取play callback/helpers + NpcSession + view stubs。第10组覆盖八种commandType到精确view/phase；第11组证明权威sync从debugState剥离本地slot，避免未变权威属性废报价；第12组AST抽取Shop/Repair/Storage实际构造器，验证false/true send结果透传及18次精确命令参数。该12组与22组组件证明不同范围，不重复累加成同一组；仍无真实浏览器或原端运行证明。

最后分页回归回执记录于 2026-10-01T08:49:10.632710+00:00：服务22组PASS；shop.ts SHA256 `f059f2a9562e7d25ab6dc8a3cbf05a3d771f50348983d97892e089adf64adcfa`，service_windows_regression.mjs SHA256 `934f9bc6870bd4713dcbbdeb651345b76b5abcc253f1d4452439910e19fc9169`，日志SHA256 `14fe3394f61faa05aa48857acd0d7f1c15afc0bb8489b662bc6657d7e387621c`。范围仍为实际生产class与fakeDOM/timer，不证明浏览器或原端分页运行。

## 2026-10-03 出售槽鼠标拿取补充

回看 `FState.pas:5195–5225` 后，补齐原端出售槽的拿取反馈：物品暂放出售槽时从背包格隐藏，但仍保留在 InventoryView 的权威物品映射中；点击已询价的槽内物品，会清除本地报价并把当前实例放到跟随鼠标的 held preview；手持另一件物品放到占用槽时，新物品询价、被替换物品回到鼠标上。关窗、会话清理和未发成交的取消释放 presentation reservation，不预扣金币或背包物；只有匹配的服务端出售结果才更新权威库存与金币。

实现位于 `ShopView.setInventoryInteraction`、`InventoryView.reserveForService/releaseFromService/holdFromService` 与 `bindInventoryServiceSlot`。2026-10-03 `service_windows_regression.mjs` 当前24组PASS，覆盖槽内拿取与Inventory拒绝时保留槽物/报价；`inventory_service_regression.mjs` 当前15组PASS，覆盖原背包格隐藏、cursor preview和占槽置换；`tsc --noEmit`通过。仍是fake DOM/生产模块回归，不证明真实浏览器像素、满背包边界、同版鼠标时序或经济持久化；修理/仓库等其他服务槽的held置换也未由此宣称完成。
