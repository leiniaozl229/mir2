# 浏览器网关协议 v1（实施中）

2026-09-09 状态记录见 [实施状态](implementation-status.md) 与 [UI 复刻审查](ui-fidelity-audit-2026-09-09.md)。网关现在串行化攻击、移动和施法确认，移动拒绝会恢复服务端权威坐标；`command_rejected` 会解除前端物品等待态，国服 UI 已显示操作状态和完整聊天控件。真实服务复验范围以各 `.runtime/reports/` 报告为准。

本机入口 `ws://127.0.0.1:18800/ws`，健康检查 `/health`。网关使用 .NET 10，连接 Compose 内部 engine 的 7000、7100、7200 三个固定端口。客户端不能提交后端地址或登录票据。

客户端每条 WebSocket 文本消息为一个 JSON 对象，最大 8 KiB。服务端响应为 `{sequence, mapGeneration, message}`：sequence 在连接内递增，mapGeneration 在收到新地图时递增。断线后创建新连接并重新登录，不重放先前操作。

| 阶段 | 请求 | 返回 |
|---|---|---|
| 连接 | 无 | `message: {type: "connected", protocol: 1}` |
| 登录页 | `{type:"register",account,password}` | `{type:"registrationResult",accepted,reason}`；成功后仍可在同一连接登录 |
| 登录页改密 | `{type:"changePassword",requestId,account,oldPassword,newPassword}` | `changePasswordResult{requestId,accepted,status,reason,requestSent}`；需 `connected.features.passwordChange===true` |
| 登录 | `{type: "login", account, password, interactiveLogin:true}` | `servers{servers:[{name,status,routable}]}`，等待用户选择；历史探针未设置交互能力时保持自动流程 |
| 服务器选择 | `{type:"selectServer",name}` | 原生CM104→SM530→CM100→SM520，返回`characters{characters:[{name,job,hair,level,sex}]}` |
| 角色列表 | `{type:"createCharacter",name,job,sex,hair}` | `characterCreationResult`，成功后返回新的 `characters` 快照；网关会等待旧选角服务的 1 秒防刷窗口，避免 `NEWCHR` 被丢弃 |
| 选角 | `{type: "selectCharacter", name}` | 交互登录等待`entryNotice{noticeId,lines}`，来自原生SM658；随后显式确认 |
| 入图公告 | `{type:"acknowledgeEntryNotice",noticeId}` | 当前公告/游戏代次匹配时发送一次原生CM1018；之后消费权威地图及自身事件 |
| 入图后 | `{type:"move",x,y,direction,run?,actionId,mapGeneration}` | `actionResult`，`kind:"move"`，并携带确认或校正坐标 |
| 入图后 | `{type: "inventory"}` | `{type:"inventory",items:[...]}` |
| 入图后 | `{type:"dropItem",makeIndex}` | `{type:"dropResult",makeIndex,accepted}` 及地面事件 |
| 入图后 | `{type:"dropGold",amount}` | 原生 `CM_DROPGOLD=1016`，数量编码在 16-bit `Param`；之后只以 `currency.gold` 或系统消息呈现服务端结果 |
| 入图后 | `{type:"pickup"}` | `itemAdded` 与 `groundItemRemoved` |
| 入图后 | `{type:"attack",direction,actionId,mapGeneration}` | `actionResult`，`kind:"attack"`；另有 `entityAction`、`health`、`entityDied`、`experience` |
| 入图后 | `{type:"openDoor",x,y}` | `door`，服务端确认后开门或自动关门 |
| 入图后 | `{type:"butch",targetId}` | 挖肉动作及成功后的 `itemAdded` |
| 入图后 | `{type:"equipItem",makeIndex,slot}` | `itemActionResult` 与 `equipment` 状态 |
| 入图后 | `{type:"takeOffItem",slot}` | `itemAdded` 与 `itemActionResult` |
| 入图后 | `{type:"useItem",makeIndex}` | `itemActionResult`；成功后物品从背包移除 |
| 入图后 | `{type:"npc",targetId,npcSessionId,mapGeneration}` | 相邻 NPC 的 `npcDialogue` |
| NPC 关闭 | `{type:"npcClose",npcId,npcSessionId,mapGeneration}` | 只关闭匹配展示身份，保留原生在途报价与成交等待 |
| 技能设置 | `{type:"setMagicKey",magicId,key,bindingId}` | 原生211完整`skills`快照和`magicKeyResult`；key为0或ASCII49–56 |
| NPC 对话 | `{type:"dialogueSelect",npcId,command,npcSessionId,mapGeneration}` | 后续 `npcDialogue` 或对应功能消息 |
| 商店购买 | `{type:"shopDetails",npcId,name,page}` / `{type:"buyShopItem",npcId,name,makeIndex?}` | `shopDetails{npcId,name,page,items}` / `shopPurchaseResult` |
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

SM_LOGON 50 表示角色入图，随后允许移动。原生状态帧通过 id=-1、status 传递，`+GD/` 表示服务端接受操作；28 表示拒绝。网关把待确认动作投影为 `{type:"actionResult",actionId,kind,accepted,x,y,reason,mapGeneration}`，其中 `kind` 为 `move`、`attack`、`spell` 或 `mine`；可预期的本地命令拒绝使用 `error`，并携带相同 `actionId` 与 `kind`。浏览器只消费与当前待决动作完全匹配的结果，每个连接同时只允许一个需要 GOOD/FAIL 的动作；5 秒未确认会断线重连并重新同步。移动位置最终以服务端确认和同步结果为准。网关按已确认位置重新计算合法目标：走路必须相邻一格，跑步必须沿同方向前进两格；提交的目标坐标不匹配时会拒绝请求。

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

持续效果和强制位移（2026-10-01）：804 投影为 `{type:"mapEvent",id,x,y,eventType,eventParam}`，其中 x 来自 Tag、y 来自 Series，eventParam 来自编码后的四字节 ShortMessage.Ident。805 投影为 `{type:"mapEventRemoved",id}`。火墙 ET_FIRE=5 使用国服 Magic[1630..1635]、40ms/帧、原图偏移和加色混合；每个事件 ID 对应一个持续效果，只在原服隐藏消息或切图时移除。伤害、五格十字的生成和持续时间全部由原服决定。重复显示、隐藏后素材才加载完毕、切图后复用 ID 均不会重建旧效果。

6（SM_RUSH）和 9（SM_BACKSTEP）投影为 `entity`，action 分别为 `rush`、`backstep`，forced=true；网关同步自身确认位置和对象占格。冲撞打断待决移动时保留旧 actionId 的命令槽直到其回包，回包拒绝旧目标并保留位移位置，避免旧 +GD 确认新指令。浏览器停止继续移动与追击，反向步行动画保持服务端朝向。7（SM_RUSHKUNG）是冲撞阻挡，投影为 `{type:"rushBlocked",id,targetX,targetY,direction}`；坐标是前探目标而非人物实际位置，动画前探半格后返回，网关确认位置不变。原服消息队列对相同优先级增加入队顺序，防止多步冲撞倒序到达；原有消息优先级保持不变。

`connected.features` 增加 mapEvents、forcedMovement。`node tools/world_events_probe.mjs` 经实际 WebSocket、原生网关和游戏服验证火墙五格 ID/坐标/自然到期、撞墙保持原位、占格移动拒绝、连续冲撞位移和后续移动；探针新建独立角色，通过隔离技能导师学习技能，私密清理清单保存在 `.runtime/world-events-fixtures.json`。本机原生服务正常停止并备份后，使用 `python tools/cleanup_world_events_probe.py --mysql <mysql路径> --port <本机数据库端口>` 只移除清单中的账号、角色和关联记录，然后重启原生服务。不要在运行中的引擎上删除角色记录。

该探针还验证安全区外两名独立角色的实际冲撞：低等级目标收到连续 SM_BACKSTEP，位置按顺序更新，之后能正常移动。生产端仅将被拒绝的追击格临时避让 1.5 秒，重复拒绝刷新期限；临时堵塞时保留目标并重试，避免移动怪物离开后仍无法接近。静态地图的通行性仍来自原地图数据。


NPC 会话隔离（2026-10-01）：`connected.features.npcSessions=true` 时，NPC、商店、出售、修理、仓库及 NPC 行会命令都必须携带当前 `npcSessionId + mapGeneration`，并匹配 `npcId`。每次点击用递增且大于0的会话号；新地图自动脚本仅在新上下文允许显式 `automatic:true` 的会话0。本地关闭、死亡、断线后立即拒绝旧展示回复；不存在入图后按秒数丢弃对话的规则。643/645/646/668/700/704按原生NPC对象匹配，过期对象回复不覆盖当前状态或断开连接。当前服767是SM_MENU_OK，772是SM_DLGMSG；这两类独立提示没有NPC身份，不伪造npcId，关闭提示不会关闭其下的商店会话。

旧原生协议没有请求nonce，647/671报价和部分经济结果还缺NPC/物品身份，因此关闭展示后保留原来的请求实例、报价/经济等待槽及捕获的展示身份，同类型请求串行至原回复被消费。过期报价不成为新NPC可成交报价；成功购买/出售/修理/仓库存取仍应用服务端背包/金币确认，无须窗口仍可见。原协议仍无法可靠区分同一个NPC关闭重开后的旧643/645等原生回复；前端会话号不能被描述成解决了原生来源关联，继续保留此缺口。

成色回复 `shopDetails.name` 来自网关捕获的原 `shopDetails` 请求，`page` 来自已核对请求页的652 Tag；即使 `items=[]` 也保留名称。前端核对等待阶段、NPC、名称和页码，防止旧空页被另一商品的新等待消费。这只使用当前已保存的请求上下文，未给原 TCP 添加 nonce，也不宣称区分同 NPC、同商品、同页的不可辨别旧回复。

技能快捷键（2026-10-01）：`connected.features.magicKeyBinding=true` 时可提交 `setMagicKey`。CM_MAGICKEYCHANGE=1008，Recog=已学MagicId，Param=#0或ASCII'1'..'8'；原服在游戏线程原子清除占槽技能，再设置目标并发送真实SM_SENDMYMAGIC=211完整快照。浏览器与网关只按目标键一致且无其它技能占槽确认，不修改本地技能列表冒充成功，不以+GD确认。技能列表保留全部已学技能，底部快捷栏固定8格，不把None技能补进空槽。

`bindingId` 是网页请求代数，原生头不携带此字段。`magicKeyResult:{magicId,key,bindingId,accepted,reason?}` 与命令错误回包保留它，迟到错误/超时不能取消更新的同技能同键请求。原服确认与移动/攻击/施法等待槽独立。双方设置等待上限5秒；网关切图、角色死亡、目标技能删除也释放等待并返回失败。超时或取消只释放交互等待，迟到211仍按权威完整快照应用。`MIR2_PROTOCOL_TRACE`只记录命令类型及阶段，不记录登录口令、票据或完整JSON。

独立复验使用 `node tools/npc_skill_probe.mjs`：新建隔离法师，验证八键、占槽、None、非法/未学拒绝、独立移动、NPC会话拒绝和正常重登持久化。私密夹具清单为`.runtime/npc-skill-fixtures.json`，报告不含凭据；清理前正常停止原服并备份，再用 `python tools/cleanup_npc_skill_probe.py --mysql <路径> --port <端口> --apply`，最后重启。运行报告、完整复刻的未关闭项及当前环境见 `docs/web-replication-plan.md`。

真实挖矿意图（2026-10-01）：`connected.features.mining=true` 时，浏览器提交 `{type:"mine",direction,actionId,mapGeneration}`，direction 为0–7，actionId必须是大于0的安全整数，mapGeneration必须匹配当前地图。命令仅接受以上四个字段；坐标、目标矿石、品质、数量和奖励不能由浏览器指定。网关从已确认的武器槽1检查可用Shape19锄、StdMode5/6及持久大于0，并使用当前服务端位置；已有移动、攻击、施法或物品操作未确认时拒绝新挖矿。

原服 `ClientHitXY` 的矿分支先用人物已有Dir取得前格，因此网关将同一mine动作串行为 `CM_TURN=3010` → 此次转身的原生`+GD` → `CM_HEAVYHIT=3015` → 挥锄的`+GD`或28。第一条GOOD不完成动作，也不释放共享原生等待槽；转身确认后再次检查角色位置、地图和锄实例，防止受推移或损坏装备后挥向旧格。挖矿直接使用3015，不经过战士攻击选择器，不消费已蓄烈火等技能状态。结果为 `actionResult:{kind:"mine",actionId,mapGeneration,accepted,reason}`；accepted只表示原服接受该次尝试，矿图旗标、前格墙面、矿点余量、随机产出、背包空间和品质继续由原服判定。原端允许Shift在空地强制挥锄；此时原服可能只做重击，没有矿石或碎屑。

网关实际发送挥锄后投影 `miningProgress:{phase:"swing",id,actionId,x,y,direction,mapGeneration}`，供自身重动作展示；原服自身原始短帧`=DIG`专门解析为 `miningStrike:{id,actionId,x,y,direction,mapGeneration}`，只表示击中石头并应显示碎屑。远端SM_HEAVYHIT=15的非空原生正文投影为 `entityAction.digFragment=true`，空正文为false。两种碎屑标记均不添加物品，也不代表产矿成功。矿石只通过原生SM_ADDITEM=200投影的itemAdded进入已确认背包；StdMode43的原始durability表示矿石纯度，显示采用参考端Delphi Round(Dura/1000)，半整数按偶数取整，普通装备的持久语义保持独立。

`MiningController`复用生产页面的统一actionId与地图代数：左键无目标、装备可用锄且前格不能走，或Shift强制挥锄，开启自动循环；下一次请求须同时等原生动作确认、动作动画结束与攻击节拍。参考ClMain的节拍为 `max(0,hitTime-min(800,min(370,level*14)+hitSpeed*itemSpeed)+(attackSlow?1500:0))`，默认hitTime1400、itemSpeed60，attackSlow来自HandWeight>MaxHandWeight；657的hitSpeed按参考ShortInt有符号值投影，负值减慢。参考扩展ClientConf支持时序覆盖与featureEx骑马字段，当前固定原服ClientConf和八字节Desc未提供这几个字段，因此默认值和骑马门槛的证据界限保持记录，不从普通feature猜测。

手动移动、交互、选技能、窗口、Escape、失焦和pointercancel停止继续挥锄。已发送的原生请求没有取消协议，其等待槽必须接收旧GOOD/FAIL再排空。自身死亡、51/633/634切图立即返回旧mine的失败结果，仍保留网关旧原生槽直到其回包；迟到的转身GOOD只能结束旧mine，不能启动新挥锄或确认新移动。五秒无法确认会返回失败并关闭旧WebSocket/TCP后重新同步，不能在同一不确定的旧连接上清槽重试。

独立矿石探针分三阶段：`node tools/mining_probe.mjs --create-only`正常注册新m八位十六进制账号与对应M角色并退出存档；正常停服并创建包含新角色的有效备份后，`python tools/prepare_mining_probe.py --stage purchase --backup <新.tar.gz> --mysql <路径> --port <端口> --apply`只设置此角色等级、金币及现有综合商人相邻出生位置；重启后`node tools/mining_probe.mjs --purchase`通过真实目录、报价、购买及装备回包取得原锄。再次正常停服并备份，准备工具`--stage mine`只将已有真实锄的夹具移动到现有D401矿图临墙可走格，初始朝向与矿墙相反以验证转身流程。重启后`node tools/mining_probe.mjs --run`按原矿率最多采样240次，验证碎屑、实际矿石、丢弃拾取和正常重登的实例/品质保存；达到上限无矿记为样本不足，不宣布矿石闭环通过。私密清单位于`.runtime/mining-fixtures.json`，准备工具默认只计划，无数据库操作；`--apply`校验停服、单个隔离角色所有权与输入备份的SQL/状态SHA及包含该新角色。清理前正常停服并备份，再用`python tools/cleanup_mining_probe.py --mysql <路径> --port <端口> --apply`。这些操作不修改地图、矿率、怪物或其它角色；产码TCP回归、真实联机报告、生产浏览器与原端运行对照分别记录。

近战实际种类与请求排空（2026-10-01）：`entityAction` 追加 `legacyIdent`、`meleeKind`、`self` 与 `actionId`。真实 SM14/15/16/18/19/24/8 分别投影 normal/heavy/big/power/thrusting/halfMoon/fire；半月SM24使用普通ActHit人体与半月剑光，SM16仍独立大幅动作。原生头没有网页actionId：仅当前自身且待确认attack能关联当前网页请求，远端actionId为空。收到自身SM只确认实际攻击表现，完成攻击继续等待原生+GD/28；不能把SM或技能开关当作动作ACK。

战士+LNG/+WID/+FIR更新`warriorSkill`，保留cast等待槽直到该次原生+GD/28排空，防止状态先到时发送新攻击、让旧施法GOOD错误确认新攻击。网页自身预测为normal人体，带`meleeActionId`与`predictedMelee=true`；同ID真实SM可沿用已处理的帧时钟，专属剑光和声音由实际kind决定。不同请求、远端、重击、大幅、死亡与过期代数不继承预测；完成的动作不重播。

固定原服在消耗攻杀/烈火准备标记之前快照实际最终hitMode，广播与新增自身SM使用该快照；半月魔力不足先降级普通攻击。ClientHitXY在验证0–7方向后设置Dir，再取得真实目标，保留原伤害、随机与魔耗公式。普通RM_HEAVYHIT的旁观发送使用header-only；挖矿非空DIG正文继续保留。参考ClMain4086–4109对这七类SM均排除g_MySelf，所以新增自身表现消息不会重复驱动该参考端人体；同包原客户端运行兼容仍单独验收。

聊天请求新增可选`raw`与`chatId`。`raw`保留原CM_SAY字符串和显式@、!、!!、!~、/name前缀，服务端仍校验180 GBK字节与控制字符；原中文文本不改成网页本地回显。`chatId`为网页草稿代数，只在合法正安全整数时由typed say错误回显；不进入原生头，也不代表原服投递ACK。控制器仅匹配最新已发草稿的同ID错误，旧/缺失ID不能覆盖新草稿。say拒绝不会释放移动/攻击/施法等待槽。真实原服chat/system事件继续决定聊天记录。

## 独立改密请求与结果边界（第八批）

改密限于未登录阶段，使用独立 LoginGate 短连接；生产页面另开 WebSocket，不借用世界连接，也不自动登录新密码。请求身份是正的 JavaScript safe integer，并在同一会话中严格递增；非法或重用身份返回泛型 error，不伪造新的结果来终止先前请求。并行改密、登录和注册受 pending 门控。重复密码仅在本地校验，不发送。

账号为 4–10 位 ASCII 字母或数字。原密码至少 1 字符，新密码至少 3 字符，严格 GBK 编码后分别最多 10 字节，拒绝控制字符和斜杠（现有 Web 登录分隔策略）；不 trim、不变大小写。四个参考编辑框的 maxlength=10 是字符限制，与 GBK 字节限制分开记录。无法 GBK 编码的字符由网关拒绝，前端不假装具备完整编码表。

当前 LoginSrv 在新连接创建时设置 LastUpdatePwdTick，前 5 秒的 CM2003 会被忽略。网关实际等待 5.1 秒，再编码 account TAB oldPassword TAB newPassword；整次请求最多 15 秒，前端最多等待 18 秒。口令与完整消息体不写日志，编码 payload 在结束后清零。

| status | accepted | reason | requestSent | 含义 |
|---|---|---|---|---|
| succeeded | true | 0 | true | 仅原生 SM506 确认修改成功 |
| rejected | false | SM507 的 Recog 整数 | true | -1 原密码错误；-2 暂时锁定；其他值保留，不能借用参考客户端的 -2 新密码不符文案 |
| invalid / unavailable / busy / throttled | false | null | false | 字段、阶段、并行或节流拒绝，未发 CM2003 |
| timeout / disconnected / protocol_error | null（已发）或 false（未发） | null | true 或 false | 已发或部分写入后未收到确定结果，不能声明回滚 |

浏览器只消费 `{sequence,mapGeneration:0,message}` 中匹配当前 requestId 的有效结果。提交到网关后，浏览器在本地超时、断线或取消等待时无法判断 CM2003 是否已发送，`requestSent` 在本地状态为 null；取消没有原服撤销命令。成功后清空口令并回登录；失败允许修正；关闭、切换场景和 pagehide 清除改密秘密。原始安装包的字段/按钮热区、字体和同版动态比较仍待核，见 `content/classic-176/auth-actions.json`。

## 角色小退与连接代次（第十批，2026-10-02）

网关外层信封为 `{sequence,mapGeneration,sessionGeneration,message}`。`sequence` 在整个 WebSocket 内递增；每次开始字段有效的新认证、启动新的游戏连接，以及接受一次小退或大退，`sessionGeneration` 各递增一次。新认证在选角之前就使旧退出结果失效，同时保留退出 ID 的高水位，不能用旧结果退出新账号。网页先核对连接/角色代次，再核对地图代次；旧地图加载、消息和超时不得覆盖新角色。

`connected.features.logout=true` 时，已入图角色可提交 `{type:"logout",mode:"reselect"|"login",logoutId,mapGeneration}`。`logoutId` 必须为正的 JavaScript safe integer；新请求在本 WebSocket 中递增，并匹配当前地图。确认取消不发送。确认提交先阻断未来世界输入，网关尚未接受时继续消费当前代次的权威包；收到关联 `waiting` 后才隔离旧世界展示和异步工作。

接受后立即递增两个代次，发送 `{type:"logoutState",logoutId,mode,state:"waiting",sessionGeneration}`。重复的同 ID、模式与原地图请求重发当前状态，不能再发原生指令；另一个请求、字段冲突、非法身份和过期地图通过 `error/code:"command_rejected"` 拒绝，并仅回显可验证的 `logoutId` 与 `mode`。未接受的拒绝不能取消已经接受的等待。旧请求在新角色世界中不再重发旧选角结果。

`reselect` 只发送一次原生 `CM_SOFTCLOSE=1009/0`。先停止旧投影和定时器，再串行发送；等待旧读取自然结束并 join，随后由唯一消费者等待 EOF。不会先取消正在等待的 Windows TCP 接收再尝试发送小退。整个退出与新选角查询共用 15 秒期限；已退出的旧连接不自动重发 CM1009。使用内存中的账号/票据新建 selection 连接，发送 CM100 并等待真实 SM520。只有关联终态 `{type:"logoutState",state:"characters",logoutId,mode,sessionGeneration,characters,requiresLogin:false}` 发布新列表；不另发普通 `characters` 包。初次登录与建角保持普通列表协议。

`login` 是网页返回登录的适配流程，关闭旧游戏、选角及登录连接，清除账号/票据/世界，再返回关联 `state:"login"`。参考 `AppExit` 关闭客户端，没有发送 CM1009，因此此模式也不补发该命令。它不声明服务器票据已释放或角色已经持久保存。

已接受后的超时、断线或无效选角结果发送 `state:"failed",requiresLogin:true`，清除旧身份并返回登录；不得恢复旧世界或宣称保存成功。网页断开时清理并等待退休读取与定时器结束。未接受的字段/阶段拒绝可以回到继续消费权威包的原世界。EOF、选角成功、窗口关闭均不是数据库的持久保存确认；第九批保存 ACK/事务和正常停服的验收独立追踪。

参考普通 F12 调用声音开关；F12 不发送网关命令。网页音效/BGM 音量设置及设置窗口属于明确标注的网页适配，不能把参考 Ctrl+Alt+F12 扩展窗口或未经核实的国服素材热区写成同版本原端证据。原端/真实浏览器/听音和原服换角持久数据验收继续开放。

## HUD 饱食、昼夜与增量值（第十二批，2026-10-02）

原生 SM_DAYCHANGING=46 投影为 `{type:"daylight",phase:packet.Param,darkLevel:packet.Tag}`。phase 0/1/2/3 对应 Prguse 15/12/13/14；未知值隐藏图标。654 是角色灯光，不能转换为全局昼夜。地图暗层与角色灯光效果仍待接入。

SM_MYSTATUS=708 保留 myStatus.status，饱食档位1..4对应Prguse16..19；0或未知值不画。原服食物提高饱食储备，按1000分档、5000封顶，数值越高越饱；网页不启动本地饥饿计时器。health31仅self同时更新HUD/人物面板，其他实体受击不覆盖玩家血球；weights622同时更新两处。沿用现有会话/地图代次，没有新增浏览器修改昼夜或饱食的命令。

本机18801测试网关已更新。当前Vite启动脚本实际覆盖/ws到18801；标准vite.config新增可选MIR2_WEB_GATEWAY_TARGET，默认18800保留。真实账号、原端/浏览器、照明和食物持久化验收仍开放，详见[本批范围](hud-state-implementation-2026-10-02.md)。

## 场景光值与死亡调色（第十三批，2026-10-02）

entity消息50/10/11/13/9保留Series高字节light，低字节仍direction；不刷新光值的6/801/807发送light:null，Web保留现存值。SM_CHANGELIGHT654投影actorLight的Recog/Param，Tag客户端key不转换为地图暗度。SM_NEWMAP51与SM_CHANGEMAP634的map事件增加darkLevel=Series，46继续phase=Param/darkLevel=Tag。字段新增不改变游戏命令及代次，未知actorLight不生成实体。

Web默认self死亡调色落在整个世界舞台，HUD/窗口独立；原地alive27、切图、世界清理和已接受退出解除。生产fogApplied仍false，六个原遮罩/npal只作来源与校准，不代表夜景绘制。原端可配置死亡颜色、尸骨/挖出/复活所有光值路径与同版实际渲染继续开放，详见[场景来源与本批边界](scene-lighting-death-implementation-2026-10-02.md)。

### 选角删除（第十四批）

`connected.features.characterDeletion=true`表示当前网关支持删除闭环。仅characters阶段允许`{type:"deleteCharacter",requestId,name}`；requestId为递增正安全整数，名字必须来自此账号当前SM520列表。选角命令不使用世界actionId/mapGeneration。CM102仅发送角色名字，等待原服>1000ms限流后发送一次；绝不重试在途删除。

`characterDeletionResult`包含requestId/name、accepted(bool|null)、status、requestSent、requiresLogin；已核实结果还带characters。SM523且新SM520不含该名字才是deleted/true；SM524为rejected/false但仍查询列表恢复原服boChrQueryed；523却仍有角色为not-deleted/false。服务器没有返回名单时不能前端删角色。写前超时为not-sent/false，可能已写后的坏ACK/列表、EOF/超时为unknown/null，两类都退役selection并要求重新登录。typed command_rejected携带安全requestId，旧/不同ID不能解除当前删除等待。

SM520星号前缀标记selected，网页保留按姓名选择；名单校验完整后才替换白名单。制作群的目标版行为、真实删除限制/持久化及同版原端/浏览器待验收。当前18801仍上一版，删除publish保持staging，不把新源码视为已更新运行连接。

## 2026-10-02 第十四批测试网关运行补充

此前封存后，18801连接释放，护栏确认0活跃连接再切换PID12516→17432，Vite14700保留。新网关已通过实际5173/ws证明characterDeletion=true、未登录删除requestId相关拒绝、退出拒绝与正常关闭；5原图/清单源HTTP/dist一致。原服/SQL/生产角色未操作，真实隔离删除及同版验收仍待完成。代码与测试输入不变，复用此前42网页脚本497标记/80网关实际组/384Python/4校准分支。详见[运行补充](selection-delete-runtime-2026-10-02.md)，最新档案为`replication-selection-live-v14-batch.json`；先前staging记录为其封存时点，不覆盖历史。

### 原服删除回执修复（第十五批）

DBSrv源码仅在校验当前记录所属账号/姓名、未删除、成功读取同名等级且严格小于DeleteMinLevel，并成功更新删除标记后发送SM523；其余分支及异常发送SM524。MySQL更新必须命中一行。26组生产TCP回执及8组独占真实MySQL测试通过。当前运行原服未替换DLL，网关保持523/524后SM520名单核实及未知结果不重发；新源码回执规则不能视为当前运行服务已升级。详见[原服修复范围](selection-delete-native-implementation-2026-10-02.md)。


## 原端地图描述（2026-10-08）

SM_MAPDESCRIPTION=54投影为`{type:"mapDescription",title:string,musicId:number}`，标题使用GBK正文第一段CR之前的文本，musicId来自Recog（原服无音乐为-1）。保留与其他游戏事件相同的会话／地图代次信封。浏览器仅从该权威事件更新HUD地图标题；每次map进入，包括相同地图编号，先清空上一标题，再与已确认角色坐标组合。原地图音乐播放尚待接入，不能把musicId投影当作声音验收。

EntryScenesGatewayRegression用实际旧协议TCP读写覆盖非空／CR标题、空标题、音乐编号、同编号换图新代次及已有选角／公告／重选路径。生产HUD／play回归覆盖beginMap清空、坐标保持标题、旧异步文字与重试回调丢弃。完整真实服务登录入图和断线范围另行验收。
