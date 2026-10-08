# 经典战士攻击链隔离探针

`tools/melee_probe.mjs` 通过真实 WebSocket→网关→原服验证经典技能 7（攻杀）、12（刺杀）、25（半月）、26（烈火）。两个新 Warrior 由原注册、建角色和入图协议创建；账号为 `p[8hex]`、角色为 `P[8hex]`，私有凭据只保存在忽略文件 `.runtime/melee-fixtures.json`。报告不输出账号、密码、NPC正文或任意原生消息正文。

所有命令从仓库根目录执行；`node`、`python`、`mysql` 可替换为本机已有运行时的绝对路径。脚本不启动、停止或部署服务。准备、清理的 `--apply` 需要原服正常停止且有创建夹具之后的有效备份；默认仅输出计划，不访问数据库。

```powershell
$env:MIR2_GATEWAY_URL = 'ws://127.0.0.1:18801/ws'
node tools/melee_probe.mjs --create-only
```

创建阶段必须先连接已运行的隔离网关，正常退出两角色并等待保存。注册成功后才在私有清单写入 `registered=true`，清理不会取得碰撞或拒绝注册的账号所有权。创建报告为 `.runtime/reports/melee-live-create-only.json`。然后由操作者正常停服、生成并校验新备份。

```powershell
python tools/prepare_melee_probe.py --stage learn
python tools/prepare_melee_probe.py --stage learn --apply --backup <新备份.tar.gz> --mysql <mysql.exe>
```

`learn` 只把清单内两角色移到原地图 0 的边界导师（284,609）旁两处可走格。它核对实际地图、MerChant 注册和原导师 `[@warriorset]` 节点，不插入魔法、武器或修改等级、伤害、MP规则。部署对应版本的网关和 M2Server，再由操作者恢复原服后运行：

```powershell
node tools/melee_probe.mjs --run
```

运行阶段携带当前 `npcSessionId/mapGeneration`，按原 `ClickNpcTime` 严格大于节流等待，读取当前原生选项再选择 `@skills`→`@warriorset`。原脚本提供 35 级、200 MP、原四技能 3 级及木剑；探针通过原装备协议穿木剑。随后限量真实挥剑等待原 `+PWR`，验证实际 SM18、SM8、SM24、SM19，以及自己的请求编号/位置/方向、独立旁观者收到同种原生 SM 和唯一动作 ACK。刺杀输入的两格目标使用实际可见 NPC，路径从原 `.map` 做有界搜索；服务端决定实际伤害。

探针绑定技能 12/25/26 的真实 F1/F2/F3，要求原 SM211 确认，正常退出并重登核对已学技能、键位和原木剑实例。`.runtime/reports/melee-live-run.json` 只在全部动作与持久化闭环成功时标记 `closedLoopVerified=true`；这不证明浏览器交互、原端视觉、范围伤害或全部训练等级。

低 MP 是第二个明确阶段。正常停止并再备份，准备仅清单内攻击者保存的 `Mp=0`，其他角色、最大 MP、技能、费用和公式保持原规则。该阶段先验证已通过原服保存的四技能存在。

```powershell
python tools/prepare_melee_probe.py --stage low-mp --apply --backup <新备份.tar.gz> --mysql <mysql.exe>
# 操作者重新启动已部署的原服与网关之后：
node tools/melee_probe.mjs --low-mp
```

低 MP 阶段读取原 SM52/53 的实际 MP，要求其低于烈火费用。原服 `ClientSpellXY` 的烈火分支返回成功处理输入，即使没有确认蓄力，也可能发送 GOOD；探针不会要求这个 ACK 为 false。原 `AllowFireHitSkill` 先设置内部字段再检查 MP 的既有行为保持不变，验收要求无 `+FIR`、无网关伪造蓄力，以及下一实际 SM 没有未确认的 fire；若不符会如实失败。报告为 `.runtime/reports/melee-live-low-mp.json`。

最后正常退出、停服、再次备份并清理：

```powershell
python tools/cleanup_melee_probe.py
python tools/cleanup_melee_probe.py --apply --backup <新备份.tar.gz> --mysql <mysql.exe>
```

清理先核对两账号没有清单外角色，再按原关联表删除拥有的角色、索引和账号；随后核对账号/角色/索引残留为 0，并去除清单密码。`.runtime/reports/melee-cleanup.json` 的 `verified=true` 才证明清理完成。数据库驱动失败输出不会进入报告或终端。

生产类专项为 `tests/NativeMeleeRegression`（6 组，真实地图/PlayObject/包编解码）、`tests/MeleeGatewayRegression`（7 组，真实生产网关 loopback TCP）、`tests/ChatSessionRegression`（5 组，真实 Run 的 WebSocket 拒绝回显）；夹具准备/清理的无数据库专项为 `python tests/test_melee_probe_fixtures.py`（12 项）。编译/回执与当前 SHA 位于 `.runtime/reports/melee-source-freeze.json` 和对应 `melee-*.log`、`chat-session-*.log`。
