# 经典版本边界审计：完整 1000 物品 / 108 技能

本次保留目录全部 1000 件物品、108 项技能和现有缺图计数，只新增只读审计工具、测试与独立报告。没有筛减 SQL、目录、地图、运行世界、账号或角色，也没有建立新的历史版本白名单。

“项目经典输入支持”“参考源码明确扩展声明”“历史 2003 国服版本”是三种不同结论。当前没有配套数据库与同版本原端运行的直接年代证明，因此报告每一行的 `versionStatus` 都是 `unknown`。本机国服像素的来源与 SHA 不能替数据库中每个名字、ID 或效果证明年代。

## 结果与含义

| 域 | 全部行 | classical_supported | explicit_extension | unclassified_evidence | 当前目录缺图 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 物品 | 1000 | 69 | 3 | 928 | 599 |
| 技能 | 108 | 33 | 3 | 72 | 63 |

分组含义：

- `classical_supported` 只表示项目契约明确支持。物品为 `version-profile.json` 的 36 个 P0 名称，加上固定 SQL 中实际 `StdMode=4`、同名对应 1–33 输入技能的 33 本书。它不是完整经典物品清单，更不是逐项历史认证。
- `explicit_extension` 表示超出当前项目经典输入/清单，并且能以精确身份对应参考源码的“1.8版以后技能”声明，或原服同名技能书。参考声明是明确的源码证据；当前安装版本、SQL 所属年代、同版本原端兼容性仍未知。
- `unclassified_evidence` 表示证据不足。`contract_outside_scope` 只说明超出当前输入或 P0 清单，不能据此认定是后期内容。名字中有“英雄”“四级”“白日门”，数值较大、图标缺失、`Shape=99` 或 `Job=99` 都没有被用作年代分类规则。

69 件契约支持物品、33 项输入技能在当前目录中均有对应图标记录。明确扩展组分别还有 2 件物品、2 项技能缺图；未知组仍有 597 件物品、61 项技能缺图。这里的“有图”是目录的精确源/索引解析结果，不是同版本原端的图像用途或动态比较结果。599 / 63 不变。

报告的 10161 条记录是重复 NPC 挂载、掉落概率行及生成夹具入口的逐行潜在引用，不是独立目标数量。解析范围内 `classicRouteExtensionEntrances=0`；这只表示已解析并成功关联的潜在入口没有指向这 3 项明确扩展技能/书。它不能证明运行路线完全没有扩展、所有条件分支可达或世界内容闭合。未知组有 6138 条经典路线潜在引用，分为 5691 条掉落、238 条 NPC 发物和 209 条商店库存；也不能把这些引用统称为后期内容。

## 技能边界与冲突

`skill-input.json` 明确列 1–33，共 33 项；`skill-rules.json` 只锁定其中 15 项参数。工具逐项核对固定 SQL 的 ID、效果、职业、费用、伤害参数、等级、修炼值与延迟，15 项没有参数差异。其余 18 项输入支持不会因此变成已锁定参数，也不会被移出审计。

参考文件 `Common/Grobal2.pas:1304` 原文为 `//以下1.8版以后技能`，其后的公开技能常量为 ID 34–59。工具只提取 `SKILL_` 数值声明、名称注释和行号，不复制其他常量。归类要求参考明确扩展声明与当前原服相同 ID/符号及精确名称对应；不以编号范围直接判断全部数据库行。

| 固定 SQL 行身份 | 精确参考 / 原服依据 | 结果 |
| --- | --- | --- |
| magics Idx=38，MagID=48，群体施毒术 | Grobal2:1319 的同名 `SKILL_GROUPAMYOUNSUL`；MagicConst:154，同名 XML 注释在 152 | 明确扩展声明对应 |
| Idx=45，MagID=45，灭天火 | Grobal2:1316 `SKILL_45 / FlameDisruptor`；MagicConst:171 同符号，169 明确“灭天火” | 明确扩展声明对应 |
| Idx=46，MagID=46，分身术 | Grobal2:1317 `SKILL_46 / Mirroring`；MagicConst:175 同符号，173 明确“分身术” | 明确扩展声明对应 |
| Idx=34，MagID=34，解毒术 | 参考 34 的名称是“双龙斩”；原服解毒常量是 40 | 身份不一致，未知 |
| Idx=48，MagID=48，气功波 | 同 ID 另一行群体施毒术的 Effect=27；此行 Effect=36；参考气功波常量是 37 | 重复 ID / 效果冲突，未知 |
| Idx=58，MagID=58，流星火雨 | 参考与原服只有 `SKILL_58`，没有对应当前 SQL 名称的明确注释 | 超出输入，身份/历史未知 |
| 后续英雄、四级、500/501 等行 | 缺少精确历史版本对应证明 | 保留各行，未知 |

完整重复 ID 清单见报告 `duplicateMagicIds`。同效果别名和不同效果冲突分别保留，MagID=48 的两行不会合并。工具使用物品 `Id`、技能 `Idx` 保留数据库主键，避免用重复 MagID 覆盖一行。

物品书的关联采用原服真实路径：`PlayObject.Operate.cs:675–676` 的 `StdMode=4 → ReadBook`；`PlayObject.Base.cs:2170` 把 `stdItem.Name` 交给 `FindMagic`，随后检查已学、职业与最低等级，生成实际技能实例；`GameSrv/Word/WorldServer.cs:1559` 按同名 `OrdinalIgnoreCase` 匹配。这个路径没有把 `Shape` 当版本，也没有自动去掉英雄/白日门名称前缀。

据此关联的扩展书为 Id=509 灭天火、559 群体施毒术、562 分身术。灭天火的数据库 Looks=0，在当前精确索引目录有帧；这个字段不能证明图标用途正确或年代。白日门火球术 Id=441 等名字没有被强行绑定普通火球术；各行的 `unresolvedBookName` 或实际书/技能关联均保留。

## 入口检查的实际范围

工具读取固定 `vendor/openmir2/sql/mir2_data.sql`，同时读取固定数据子模块的 `MapInfo.txt`、`MonGen.txt`、`MerChant.txt`、`Npcs.txt`、`MapQuest.txt`，扫描 Market_Def、Npc_def、MapQuest_def 与所有 MonItems 文本。该次记录 507 个输入源 SHA、2827 条源刷怪、134 条源 NPC 挂载；profile 572 图，固定 MapInfo 有 322 个声明图名。profile 归属与固定 MapInfo 声明分别保存，不能混为当前运行配置。

解析库存 `[goods]`、`#ACT/#ELSEACT` 内 `GIVE/ADDSKILL/H.GIVE/H.ADDSKILL`，保留节名、条件起点行号、命令接收者与来源。`#SAY`、注释或仅谈论高级书的文本不会算发放。其他动作、跨脚本调用、变量展开、升级改物及条件图未做完整语义解释，仍属于开放缺口。

经典路线的生成判断使用生产 `city_services.normalize_merchant()` 和 `quest_only_script()` 的纯函数。原书店等被移除的库存不会当作当前商店；保留的任务奖励也不会因店名被一并丢掉。原掉落表与 prepare-runtime 的骷髅、骷髅精灵、鹿 P0 替换分开保存；被替换的源掉落不计入生成路线潜在入口。

生成的综合商人采用生产 `service_definitions()` 的坐标与 p0 供应文本；其他 P0 NPC 复制关系从 prepare-runtime AST 的实际字面赋值读取。工具不会执行 `prepare-runtime.main()`，也不会准备/刷新运行世界。f-string 的不完整前缀不会被记作真实文件名。不能解析出挂载关系的 P0/QManage/QFunction/副本文本保留为 `unresolved_mount`，不会仅凭文件存在宣称生效。

具体可追踪例子：

| 入口 | 审计结论 | 证据边界 |
| --- | --- | --- |
| p0 综合商人出售乌木剑；源 MonItems/半兽人.txt:5 等掉落同名物品 Id=209 | 当前生成或源路线潜在入口；物品超 P0 白名单，归未知 | 不能据超白名单把普通武器认定为后期 |
| p0/skill-trainer.txt:14 发回城石；p0/city-general-merchant.txt:81 售回城石 | 保留未能关联固定 1000 行的引用 | 固定 SQL 无同名行；本次未读取当前 DB，也未验证运行时派生/补入物品 |
| LEGM2.CC假人NPC/假人上线NPC-jiaren.txt:43 的 H.ADDSKILL 破魂斩、44 的 H.GIVE 火龙之心；532 的 H.ADDSKILL 英雄灭天火 | 真实固定脚本里的英雄命令引用；当前 profile 不含 jiaren，标潜在源引用且 `classicRoutePotential=false` | 不能把源中英雄命令认作当前经典地图已经开放该功能；名称年代与原服命令实现仍待核验 |
| 灭天火、分身术、群体施毒术的 SQL 技能及对应书 | 有精确扩展声明身份对应；已解析入口没有命中 | 不等于已证明无其他入口；不能反推全部数据库扩展都不可达 |

453 条未能关联目录实例的入口继续保留，包括 195 条金币、13 条回城石及其他名称。金币是货币特殊语义，不能把这些行全部算为缺失物品或后期内容。掉落与刷怪仅按怪名/文件名精确对应；例如带数字后缀的怪物别名不被擅自裁剪，别名解析与实际原服掉落文件选择仍待补证。

## 可重建工具、证据与测试

新增工具 `tools/classic_version_boundary_audit.py` 默认只打印摘要。`--output` 才保存报告；已有目标报告会拒绝覆盖，重跑需用新的归档名称。

```powershell
python -X utf8 tools/classic_version_boundary_audit.py `
  --reference-root 'C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir' `
  --output .runtime/reports/classic-version-boundary-seventh-rerun.json
python -X utf8 -m unittest discover -s tests -p 'test_classic_version_boundary_audit.py' -v
```

省略 `--reference-root` 的可移植检查仍保留 1000/108；缺少参考声明时对应目标增加未知数，不能沿用有参考时的 3/3 分组。全量报告每行含 SQL 源行、名称/ID、契约范围、图标现状、原服/参考声明、书关联与入口 ID；每个入口含源文件/行/SHA、挂载或刷怪关系、转换状态与 `liveVerified=false`。

当前结论对应 `.runtime/reports/classic-version-boundary-seventh-final.json`，生成时间 2026-10-01 12:42:34 UTC / 北京时间 20:42:34。初始快照在 12:32:15 UTC 生成并原样保留。两次之间，根代理重建目录的地图当前选源/导出快照及相关诊断元数据；物品、技能与图标规则没有改变。

最终快照比较已断言全量 1000/108、69/3/928 与 33/3/72 分类相同，摘要和全部逐行审计正文不变；507 个源中只目录文件 SHA 改变，另外 506 个不变，并核对最终 507 个 SHA 与当前实际文件一致。独立回执为 `classic-version-boundary-seventh-final-snapshot-check.json`。目录 SHA 从 `634f3eb5c34515d345aff5dcdfc753d7d6d62a93d7e2c444d85da170273550df` 变为 `ace3d0a8b4b9adc39ae029c2ded755c078d5f327cd81311295bedc749f74182e`。这次复核仍是纯源审计。

归档指纹：

| 文件 | SHA-256 |
| --- | --- |
| tools/classic_version_boundary_audit.py | 104cb3d66fd83c6cf091eb86e485b17ff82777d2e8cec87d7545595faf72387f |
| tests/test_classic_version_boundary_audit.py | a114b8a446b2c7b2a37b190f951435ea2a2c5fab6687ce741a22823722f01c96 |
| .runtime/reports/classic-version-boundary-seventh-final.json（当前源快照） | 41b862f6e2686f5dd4ded52adbd84704e9b7231804ea8bca37c450e6b67d1c08 |
| .runtime/reports/classic-version-boundary-seventh.json（保留的初始快照） | bc6b2cd941ba93be2bc9ab932509d969486fb2903196c2572a5ab83367da4455 |
| .runtime/reports/classic-version-boundary-seventh-final-snapshot-check.json | c35ee8b128a3708c2f2d8f3d0bf149170a0c2199d1e3c5c91b0a8ac885da738d |
| .runtime/reports/classic-version-boundary-seventh-regression.log | 7f2ea55f47fb25003410f9b1ec485456f42bde4169be6f25f32e9ba40b038d89 |
| 固定 mir2_data.sql | 36ced8769d58a69741d9b9d0307459805a27629b388dca896a853917b97f622f |
| 参考 Common/Grobal2.pas | 4a3c5dba187b7ac183653c5316c87f70efbc6c9e53880da803732a826f5b9083 |

最终报告规范化内容 SHA（去生成时间）为 `e8b9ca2a65a534aa3299418e9f681c4d90e5a81cbe883bb88145b2e9a3094822`；初始报告为 `5cc5227015817c64ecdf9947952dffe96a5b9350c40abac9537f9fdeb49e18ae`。源文件清单按实际字节 SHA 固定；声明的上游 sourceLocks 与当前集成源码的实际字节指纹分别保留。工具与 23 项测试在快照更新期间保持冻结。

23 项生产审计回归 PASS，覆盖 SQL 引号/转义/NULL/主键完整性、异常行拒绝、输入与参数锁区分、明确扩展声明正例、错 ID/错名/错符号负例、未知名字不判史、NPC 说话/条件/库存/英雄接收者、真实城市过滤、生成 AST f-string 边界、全部 1000/108、缺图不判版本、MagID=48 双行、原书同名逻辑、替换掉落、源路径/SHA 和禁止运行数据库读取。这个回执属于纯 Python / 源审计，不是联机、浏览器或原端验证。

## 下一步版本过滤方案（本次没有实施）

应先取得有日期与字节指纹的同版本原端/数据库，补齐 `unclassified_evidence` 的逐项依据，并处理重复 MagID=48 的身份歧义。当前 69/33 是最小明确支持范围，不能直接拿来裁掉未知的普通装备、药品或高级书。

后续若需要经典模式，应新增独立、显式的模式与允许/拒绝契约，保留全量目录及扩展模式。NPC 库存、发物、掉落、实际学书、服务端技能种类应使用同一精确身份规则并在原服侧实施；前端可以显示该模式状态，不能靠隐藏图标或删列表改变奖励/技能权威。未知目标进入待核队列；缺图保留实例和可见诊断，继续计入原 1000/108 审计。

实施前还需检查未解析命令、跨脚本链接、条件与权限、原服怪名别名、派生物品（如回城石）和原端/浏览器联机路径。不能把本次静态“扩展入口 0”当作已经完成这些步骤。
