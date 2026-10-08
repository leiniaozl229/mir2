# 原客户端图标规则与加载恢复

第六批继续195项完整复刻范围，统一物品、装备、地物与技能的原始取帧规则。原帧身份、参考源码语义、服务端权威状态和实际浏览器画面分别验收。

## 参考依据与单一事实契约

`content/classic-176/icon-usage.json` 保存源文件SHA和取帧规则。参考Delphi代码属于 `reference_source`，尚未证明与本机国服二进制完全同版。

| 入口 | 原字段与图库 | 参考位置 |
|---|---|---|
| 背包、六槽物品栏、出售与交易 | `Item.S.Looks` 精确索引，Items族 | FState.pas 3846、4652、5235、5767、5798 |
| 装备纸娃娃 | `Looks`→`GetWStateImg`，stateitem族 | FState.pas 2826–2839、3051–3054；ClMain.pas 6176–6242 |
| 地面掉落 | `DropItem.Looks`，DnItems族 | PlayScn.pas 1204、1857 |
| 技能正常态、按下态 | `btEffect * 2`，按下时再加1；MagIcon族 | FState.pas 3489–3499 |

技能ID和Effect是独立字段。火球术Effect1使用2/3，治愈术Effect2使用4/5，Effect0合法使用0/1。群体施毒术与气功波虽同为MagID48，Effect27和36分别对应54/55与72/73；图标规则不能解除技能身份冲突。

物品索引不按名称、Shape、性别或相邻帧改写。参考端的女性衣服+80只见于注释。`GetWStateImg` 的>=10000索引转向独立StN族；当前没有匹配的生效源，继续登记缺项。

## 当前生产行为

`icon-frames.ts` 按注册命名空间、源/索引SHA、帧数、格式、原索引及有符号几何选择原帧，拒绝占位与无身份图库。技能页和HUD共用Effect规则；技能页保留按住、拖出、重新进入、松开、pointercancel与lost capture的状态复位。F1–F8 HUD布局继续标为Web适配。

背包、拿取预览、装备、服务物品槽、数字快捷栏与地面显示共用 `item-icons.ts` 的精确Looks规则，各自使用Items/stateitem/DnItems。原 `item-assets.json` 的40个名称替换及两个通用回退保留为 `proposed_unselected`；服务端实例、报价、金币、技能绑定与pending不由图标加载决定。

失败的HTTP、JSON或同步请求会移除失败Promise，正在加载和成功的请求继续共享。技能与物品PNG重试采用新请求代数，地物仅释放实际失败的Pixi缓存。旧代数、旧物品、关闭或切图后的回调不恢复旧展示；真实空帧显示缺图，网络失败提供重试。登录、选角等全部界面的完整恢复仍属于UI-002剩余范围。

资源管理页另显示原索引、源锁、命名空间、缺图原因、未选的旧拟议索引、技能按下帧及身份冲突。候选PNG导出齐全也显示“参考候选，未绑定”，不能成为当前地图完整性的证明。

## 覆盖纠正与仍待解决的缺项

全目录仍是1000物品、108技能。按原端字段重新统计，当前生效图标为401物品、45技能；599物品缺图包含576越界和23占位，63技能缺图包含60越界和3占位，按下帧同样缺63。第五批的580/58包含名称/通用替换和技能ID取帧，本批以真实取帧规则纠正；旧报告保留其当时范围。

白日门雷电术保留Looks1144，旧拟议0未采用；金创药(特量)保留5022，旧拟议813未采用；祖玛井中月保留5123，旧拟议48未采用。两个通用回退分别涉及102和42条种子记录。更完整的图库仍须证明内容身份、独立源锁和用途，不用替图增加完成数。

## GA0地砖候选

锁定的参考Tiles.Lib SHA为 `98ea436fdba1de0b401b67bb76d75fdde0360e458461f6acc5fedc592d2d1865`，31775帧。GA0的408个越界索引均能解码为96×64非透明图，逐像素验证PNG一致，保留signed offset(7,-44)。125个与国服共有的索引中123个像素与几何一致，9和14两项不同。

`export_ga0_tiles_candidate.py` 默认规划写0文件，显式apply写408PNG、manifest与独立registry，重复apply写0。候选命名空间为 `/libraries/reference-ga0/Tiles`；4284项既有国服/生产Tiles及GA0文件前后哈希未变。registry保留 `mapBindingActive:false`、`mapVersionPairingVerified:false`、`complete:false`。当前生产仍有GA0的408帧缺口。

候选启用需要按地图、图层和原索引选择同一source/frame/URL，保留125个国服共有帧，并确认地板参考绘制规则。地板不使用人物的偏移追加方式。目标地图/图库的历史配对、实际浏览器GPU和同版原端比较仍待验收。

## 本批执行回执

| 检查 | 实际结果 | 回执（.runtime/reports） |
|---|---|---|
| TypeScript/Vite | 最新代码构建通过；public既有资源保留，新增候选定向复制 | icons-v6-web-checks.json |
| 全部前端脚本 | 324组/27脚本通过，真实模块/AST/VM和模拟DOM/Pixi范围 | icons-v6-web-tests.json |
| 完整Python | 279项，278通过，GA0/Tiles10320既有缺帧1失败 | icons-v6-python-checks.json |
| 完整内容审计 | 实际CLI exit1/complete=false；599/63及ID48、GA0生产408保持开放 | icons-v6-content-audit.json |
| HTTP/构建资源 | 409候选文件加12个国服图标/manifest共421文件，源/HTTP/dist字节一致；play/resources/18801 HTTP200 | icons-v6-http.json |
| 运行状态 | 仅重启本任务Vite以识别新增public文件；原服服务PID与6个运行DLL哈希均未变 | icons-v6-runtime-final.json |

生产切图请求开始即分配代数，旧地图manifest、chunk、纹理的成功或失败不会提交到新场景；play的地图就绪还核对socket、地图代数、目标与本次Promise。真实浏览器GPU与同版原端画面仍待验收，地图修复的证据限于实际生产模块/接线回归。

旧资源管理器浏览器smoke已迁移当前目录数量、精确索引与未选候选断言，并做语法检查。本轮浏览器控制工具不可调用，脚本主体未执行，未新增浏览器截图或浏览器通过声明。只读复审和旧DOM回调的修复前/后证据见 `icon-consumer-review-2026-10-01.md` 与 `item-icon-consumers-sixth-postreview.json`。

195项复刻目标和0项完整verified继续保留。第五批与本批初始失败/修复前回执保留，最终指纹汇总 `replication-icons-v6-batch.json`。
