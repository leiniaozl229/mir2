# 浏览器网关协议 v1（实施中）

2026-09-08 审查与修复记录见 [整体 review R01–R10](reviews/2026-09-08-review.md)。网关现在串行化攻击、移动和施法确认，移动拒绝会恢复服务端权威坐标；`command_rejected` 会解除前端物品等待态，国服 UI 已显示操作状态和完整聊天控件。真实服务复验范围仍按 review 的环境事件说明执行。

本机入口 `ws://127.0.0.1:18800/ws`，健康检查 `/health`。网关使用 .NET 10，连接 Compose 内部 engine 的 7000、7100、7200 三个固定端口。客户端不能提交后端地址或登录票据。

客户端每条 WebSocket 文本消息为一个 JSON 对象，最大 8 KiB。服务端响应为 `{sequence, mapGeneration, message}`：sequence 在连接内递增，mapGeneration 在收到新地图时递增。断线后创建新连接并重新登录，不重放先前操作。

| 阶段 | 请求 | 返回 |
|---|---|---|
| 连接 | 无 | `message: {type: "connected", protocol: 1}` |
| 登录页 | `{type:"register",account,password}` | `{type:"registrationResult",accepted,reason}`；成功后仍可在同一连接登录 |
| 登录 | `{type: "login", account, password}` | `{type: "characters", characters: [{name,job,hair,level,sex}]}` |
| 角色列表 | `{type:"createCharacter",name,job,sex,hair}` | `characterCreationResult`，成功后返回新的 `characters` 快照；网关会等待旧选角服务的 1 秒防刷窗口，避免 `NEWCHR` 被丢弃 |
| 选角 | `{type: "selectCharacter", name}` | 地图及原生游戏事件 |
| 入图后 | `{type:"move",x,y,direction,run?,actionId,mapGeneration}` | `actionResult`，`kind:"move"`，并携带确认或校正坐标 |
| 入图后 | `{type: "inventory"}` | `{type:"inventory",items:[...]}` |
| 入图后 | `{type:"dropItem",makeIndex}` | `{type:"dropResult",makeIndex,accepted}` 及地面事件 |
| 入图后 | `{type:"pickup"}` | `itemAdded` 与 `groundItemRemoved` |
| 入图后 | `{type:"attack",direction,actionId,mapGeneration}` | `actionResult`，`kind:"attack"`；另有 `entityAction`、`health`、`entityDied`、`experience` |
| 入图后 | `{type:"openDoor",x,y}` | `door`，服务端确认后开门或自动关门 |
| 入图后 | `{type:"butch",targetId}` | 挖肉动作及成功后的 `itemAdded` |
| 入图后 | `{type:"equipItem",makeIndex,slot}` | `itemActionResult` 与 `equipment` 状态 |
| 入图后 | `{type:"takeOffItem",slot}` | `itemAdded` 与 `itemActionResult` |
| 入图后 | `{type:"useItem",makeIndex}` | `itemActionResult`；成功后物品从背包移除 |
| 入图后 | `{type:"npc",targetId}` | 相邻 NPC 的 `npcDialogue` |
| NPC 对话 | `{type:"dialogueSelect",npcId,command}` | 后续 `npcDialogue` 或对应功能消息 |
| 商店购买 | `{type:"shopDetails",npcId,name,page}` / `{type:"buyShopItem",npcId,name,makeIndex?}` | `shopDetails` / `shopPurchaseResult` |
| 商店出售 | `{type:"querySellItem",npcId,makeIndex}` / `{type:"sellShopItem",npcId,makeIndex}` | `shopSellQuote` / `shopSellResult` |
| 仓库存取 | `{type:"storeItem",npcId,makeIndex}` / `{type:"takeStorageItem",npcId,makeIndex}` | `storageDeposit` / `storageItems` / `storageResult` |
| 施法 | `{type:"castMagic",magicId,targetId?,actionId,mapGeneration}` | `actionResult`，`kind:"spell"`；另有 `spellResult`、`magicEffect`、`spellCast`、`magicFailed`、`warriorSkill` 及资源/熟练度更新 |
| 组队 | `{type:"groupMode",enabled}`、`groupCreate`、`groupAdd`、`groupRemove`（后三者带 `target`） | `groupMode`、`groupResult`、`groupMembers`、`groupCancel` |
| 玩家交易 | `tradeRequest`、`tradeAdd`、`tradeRemove`、`tradeGold`、`tradeAccept`、`tradeCancel` | `tradeOpened`、`tradeResult`、`tradeGold`、`tradeClosed`、`tradeSuccess` 及双方物品状态 |
| 攻击模式 | `{type:"attackMode",mode}`，`mode` 为 0–6 | `attackMode`，值来自旧服 213 的 `Recog` 字段 |
| 行会 | `{type:"guildOpen"}`、`guildHome`、`guildMembers`、`{type:"guildCreate",npcId,guildName}`、`{type:"guildAdd",target}`、`{type:"guildRemove",target}`、`{type:"guildNotice",notice}`、`{type:"guildRanks",ranks:[{no,name,members}]}`、`guildAlly`、`{type:"guildBreakAlly",target}`、`{type:"guildWarRequest",npcId,guildName}`、`{type:"castleWarDialogue",npcId}` | `guildName`、`guildInfo`（公告/战争/联盟；战争倒计时位于 `warGuildTimers:[{name,remainingMs}]`）、`guildMembers`（封号分组）、`guildResult`；行会战与攻城申请继续返回旧服系统消息、`castleWar` 状态和 NPC 对话 |

地图事件 `{type:"map", map:"0"}` 已提供 UTF-8 投影。初次入图由 51/50 建立地图和自身对象；同一会话换图时，633 清理旧地图对象，634 提供新地图名与自身坐标，801/807 提供传送后对象外观。网关在 634 递增 `mapGeneration`，清除位置、NPC、商店和地面暂态，同时保留背包、装备、属性与技能快照。浏览器静态资源已包含 0、1、2、3、D001–D003、D011/D012、D021–D024、D401–D406、D411–D416、D421–D423、D501–D505、D511–D515、D601–D619、D701、D710–D717 的 `map.json` 与分块，服务端地图名直接映射到 `/maps/{id}/`。客户端换图期间暂停 NPC 对话，待新地图首帧完成后再接受新脚本文本。对象 10/11/13/50/801/807 提供 `{type:"entity",id,x,y,direction,feature,status,name,nameColor,self,kind,action}`；`kind` 为 `player`、`npc`、`monster` 或 `slave`（名称 `变异骷髅` 或调色板 254）。未知或本包未提供的字段可为 null，应保留已知状态。29/30/800/806 为 entityRemoved，27 为 entityAlive，32/34 为 entityDied，41 为 appearance，42 为 entityName，100 为 `{type:"systemMessage",text,castleWar?}`；沙巴克开始、结束、10 分钟提醒和占领广播会附带 `castleWar.phase`、`castleName`，提醒带 `remainingMinutes`，占领带 `guildName`。名称中的旧式反斜杠换行转换为换行符。

角色能力消息投影为 `attributes`，包含等级、职业、金币、HP/MP、攻击/魔法/道术、防御/魔防、经验及三类负重；上下限属性使用 `{min,max}`。`resources` 更新 HP、MP 和最大 HP，`weights`、`currency`、`levelUp` 分别处理增量状态。所有字段均来自旧服确认消息，装备改变后的能力包会替换面板数值。

物品实例投影为 `{name,makeIndex,durability,maxDurability,stdMode,weight,looks}`。背包快照使用 `inventory`，新增、移除和持久更新使用 `itemAdded`、`itemRemoved`、`itemUpdated`；地面出现和消失使用 `groundItem`、`groundItemRemoved`。装备快照为 `{type:"equipment",slots:[{slot,item}]}`，槽位使用旧服的 0–12 编号。装备、卸装和使用物品的确认统一返回 `{type:"itemActionResult",kind,makeIndex,slot,item,accepted,reason,feature}`。网关从已确认的背包或装备状态取得物品名称、实例编号、模式和槽位，并拒绝不匹配的穿戴请求；浏览器只能选择已确认实例。拾取坐标来自网关确认的角色位置，浏览器不能覆盖。

同时暂用 `{type:"legacy", id, recog, param, tag, series, encodedBody, status}` 保留原字段；encodedBody 是旧编码字节的 Base64，不能直接当作文本。含多段独立编码的消息按消息定义分别解码。已投影事件和 legacy 事件不可重复应用同一状态变更。

SM_LOGON 50 表示角色入图，随后允许移动。原生状态帧通过 id=-1、status 传递，`+GD/` 表示服务端接受操作；28 表示拒绝。网关把三类待确认动作投影为 `{type:"actionResult",actionId,kind,accepted,x,y,reason,mapGeneration}`，其中 `kind` 为 `move`、`attack` 或 `spell`；可预期的本地命令拒绝使用 `error`，并携带相同 `actionId` 与 `kind`。浏览器只消费与当前待决动作完全匹配的结果，每个连接同时只允许一个需要 GOOD/FAIL 的动作；5 秒未确认会断线重连并重新同步。移动位置最终以服务端确认和同步结果为准。网关按已确认位置重新计算合法目标：走路必须相邻一格，跑步必须沿同方向前进两格；提交的目标坐标不匹配时会拒绝请求。

基础近战由旧服继续结算。网关使用已确认的角色坐标组合 CM_HIT，浏览器仅提供八方向；点击活体目标后客户端保留目标状态，按攻击节奏重复提交，目标移动时重新走向目标，手动移动或死亡事件会清除状态。挖肉时，网关要求目标仍在当前视野、已有死亡事件、与角色相邻，并使用网关记录的尸体坐标计算方向。`entityAction` 表示攻击或挖肉动作，`health` 携带当前/最大 HP 和本次伤害，`entityDied` 携带尸体位置，`experience` 携带本次增加量与当前经验。

NPC 由对象外观低字节 50 识别。网关只允许点击视野中相邻的活 NPC，并将当前 NPC 绑定到会话；后续选项命令必须以 `@` 开头且匹配当前对话对象。旧脚本 `<显示文字/@标签>` 转换为 `npcDialogue.options`，反斜杠换行转换为浏览器文本换行。脚本可带任务标记，投影结果会在 `npcDialogue` 或 `dialogueMessage` 中附加 `quests:[{id,status,title,summary,objective,detail}]`；为兼容早期客户端，同时保留首条任务的 `quest:{id,status,title,summary,objective,detail}`。当前 P0 的比奇试炼使用 1001/1002，猎人试炼使用 1003/1004；任务旗标由原生角色存档保存，浏览器可在同一角色下同时显示多条任务。

商店目录来自 645，商品为 `{name,subMenu,price,stock}`。装备类商品先用 1015 请求具体实例；652 使用外层消息编码和逐实例编码两层结构，投影为 `{name,makeIndex,price,durability,stdMode,weight,looks}`。消耗品购买只能提交目录中的名称，装备购买还必须提交当前详情页中已确认的实例号。购买结果由 650/651 返回，成功时携带剩余金币。出售由 646 开启，只列出网关当前确认的背包实例；1012/647 完成询价，1013/648/649 完成出售。询价、购买和出售均绑定当前商人，浏览器不能提交价格或任意物品名称。

仓库存入入口 700 只列出已确认背包实例，1031 后由 701/702/703 确认成功、仓库满或失败。取回目录 704 是逐实例独立编码的分页列表，1032 后由 705/706/707 确认成功、失败或背包已满。网关以实例号和名称共同验证存取请求，成功后同步背包与仓库投影；浏览器不能构造仓库中不存在的实例。

技能列表 211 由多个独立编码的 84 字节 ClientMagic 记录组成，210/212 分别增加和移除技能，640 更新等级与熟练度。浏览器施法只提交已学习的 `magicId`；`targetId` 可省略或为 0，此时对自己施法。网关从已确认的玩家或活体非 NPC 实体取得目标坐标，限制十二格距离，并构造旧协议 3017。对自己施法使用当前玩家实体及其权威坐标。`spellResult` 表示游戏服务已接受或拒绝操作；638/639 投影魔法效果或失败，17 投影其他对象的施法动作。战士刺杀/半月/烈火的 `+LNG`/`+WID`/`+FIR` 状态帧另投影为 `{type:"warriorSkill",thrusting?,halfMoon?,fireHit?}`，并视为施法已接受。MP、HP、伤害和熟练度仍由旧服结算消息更新。真实浏览器已覆盖法师火球术目标施法、道士治愈术自施和战士基本剑术被动训练；三者重登后均恢复。

当前旧协议没有独立的客户端回城复活请求。自身 `entityDied` 到达后，浏览器禁止移动与交互并显示回城按钮；用户点击后关闭旧 WebSocket，使用仅保存在页面内存中的账号凭据重新登录并自动选择原角色。服务端保存 0 HP 后，在下一次入图时按角色 HomeMap/HomeX/HomeY 随机落到安全区附近，并恢复 14 HP。27 的 `entityAlive` 用于服务端原地复活事件。

动态门使用旧协议 `CM_OPENDOOR (1002)`、`SM_OPENDOOR_OK (612)` 和 `SM_CLOSEDOOR (614)`。网关只接受角色相邻的坐标，并将 612/614 投影为 `{type:"door",x,y,open}`；联机页在收到移动拒绝后会保留一次目标步，收到对应开门事件就重试该步。服务端按共享状态同步整组门格的通行性，地图层绘制服务端确认的开闭状态。

当前实现已有账号注册、三职业角色创建、登录、选择、入图、主世界与 570 张可解析经典地图跨图与重连、移动、基础近战、单目标及自我基础施法、被动技能训练、死亡回城、经验、聊天、基础组队、玩家交易、攻击模式、行会面板、挖肉、NPC 对话、商店买卖与修理、仓库存取、背包、穿脱装备、使用药品、丢弃与拾取和动态门。17 与 638 分别投影 `spellCast` 和带目标对象的 `magicEffect`；浏览器按服务端效果号复用已锁定的 Magic/Magic2 帧，并为版本清单中的主动技能提供代表序列，换图会取消在途与延迟特效。修理使用 668、671、669/670 服务消息和 1024、1023 客户命令，网关把询价与执行绑定到当前 NPC 及已确认的背包实例。浏览器以 `{type:"say",channel,target,text}` 发送附近、喊话、私聊、组队或行会聊天；网关校验频道、私聊对象和 180 个 GBK 字节上限，再构造旧服 3030。服务端的 40、101–104 分别投影为 `chat` 的 local、group、shout、whisper、guild 频道。组队面板以 `{type:"groupMode",enabled}`、`{type:"groupCreate",target}`、`{type:"groupAdd",target}` 和 `{type:"groupRemove",target}` 发送操作，网关映射到 1019–1022；659、660–667 投影为开关、结果、解散和成员列表。真实双浏览器已验证 `WebCheck` 与 `Group905` 在同一张比奇地图建立两人队伍，成员列表在两边同步，临时测试账号已清理。玩家交易面板以 `{type:"tradeRequest",target}`、`tradeAdd`、`tradeRemove`、`tradeGold`、`tradeAccept` 和 `tradeCancel` 发送动作，网关分别映射到 1025–1030，并投影 673、675–687 的交易状态。交易请求按角色名定位同地图相邻玩家，放入物品时绑定已确认的实例编号，取消会退回暂存物品和金币。真实双浏览器已验证蜡烛与 10 金币在 `Tao905`、`WMage905` 之间完成交换；攻击模式面板以 `{type:"attackMode",mode}` 发送 0–6，网关映射 1046，服务端 213 回传当前模式值（`Recog` 字段）。行会面板以 `{type:"guildOpen"}`、`guildHome`、`guildMembers`、`{type:"guildCreate",npcId,guildName}`、`{type:"guildAdd",target}`、`{type:"guildRemove",target}`、`{type:"guildNotice",notice}`、`{type:"guildRanks",ranks}`、`guildAlly`、`{type:"guildBreakAlly",target}`、`{type:"guildWarRequest",npcId,guildName}` 和 `{type:"castleWarDialogue",npcId}` 发送操作，网关映射到 1035–1045 与当前国王 NPC 对话 1011；750、753、754、756、757–763、768–771 投影为行会名、行会信息、公告/战争/联盟、封号分组、无行会结果和创建/成员/联盟操作结果。宣战按钮调用旧服 `@@guildwar`，攻城按钮进入 `$REQUESTCASTLELIST` 对话流程，金币、掌门身份、目标行会、祖玛头像和城堡日期仍由服务端校验。完整战争计时、沙巴克占领与联盟场景还需专项数据和规则回归。

`guildWarRequest` 会先进入国王的战争二级对话，再提交带目标行会名的 `@@guildwar`；双行会宣战、双方战争关系和倒计时递减已由 `tools/guild_war_probe.mjs` 实机验证。攻城入口遵循旧脚本的“金条 → 城堡列表 → `@requestcastlewarnow`”顺序；可选双行会夹具已实机验证有效申请、许可回包、祖玛头像消耗和 `AttackSabukWall.txt` 持久化。沙巴克广播现在投影为 `systemMessage.castleWar`，联机页会在行会面板显示开始、结束提醒和占领结果。完整攻城计时、沙巴克占领与联盟战斗仍需专项数据和规则回归。

642 的 Recog、Param、Tag/Series 分别映射当前持久、装备槽和最大持久。网关只更新该槽位中已经确认的实例；当前持久为零时发出 `equipmentBroken`，否则发出 `equipmentDurability`。

默认浏览器 Origin 允许 `http://127.0.0.1:5173` 和 `http://localhost:5173`。可通过 MIR2_WEB_ORIGINS 配置精确列表；服务只发布到主机回环地址。TCP 拆包/粘包、1 MiB 包长上限、10 秒发送超时与会话断开清理已有实现。非浏览器探针可不带 Origin。格式错误、状态不匹配和目标失效等可预期的浏览器命令错误返回 `{type:"error",code:"command_rejected",message}`，WebSocket 保持打开；网络与旧服连接异常仍结束会话。浏览器收到错误后会清除待决施法状态。

验证命令：

```sh
bash scripts/build-gateway.sh
bash scripts/compose.sh up -d web-gateway
python3 scripts/wait-ready.py
node tools/gateway_probe.mjs
```

探针读取现有独立测试账号，验证真实 WebSocket 登录、选角、入图、角色能力、背包、移动、丢弃、地面状态与拾取，输出 `.runtime/reports/gateway.json`，不会在控制台输出口令。
