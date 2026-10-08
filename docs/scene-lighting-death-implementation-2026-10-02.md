# 场景调色、原始灯光数据与权威光值：第十三批

完整 Web 复刻继续按 UI、美术、玩法台账追踪。本批补了死亡场景调色、角色光值和入图暗度；原始灯光数据已有可重建导入及校准入口。生产夜景绘制仍未接入，没有把原始数据存在或单元测试通过视为同版运行证明。

## 已落地的场景行为

`WorldTone` 使用已有国服调色板和 `createActorPaletteFilter('gray')`，对 Pixi 世界舞台的合成结果应用灰阶。依据为 MShare 的默认 ceGrayScale 与 PlayScn1404–1405 对世界表面的 DrawEffect。网页的 DOM HUD、窗口及校准文字在该舞台之外。地图空白背景从旧的近黑绿色改为黑色，对齐原表面 Fill(0)。

只按 self 的权威 `dead` 状态切换，怪物或其他角色死亡不会改变玩家场景。相同状态重复更新不会重复追加滤镜；复活、切图、世界清理及已接受退出会解除调色。滤镜保留期间可以复用，页面实际离开时销毁它；保留其他滤镜和共享调色 LUT。校准页使用生产 createMapView、OnlineActor 与 WorldTone，没有第二套地图、人物皮肤或游戏权威。

当前默认灰阶已经实现；原端可配置死亡颜色、八位帧缓冲混合后量化、同版死亡截图、实际 GPU、死亡音乐与回城复活全流程仍开放。

## 角色光与地图暗度

| 原生消息 | 当前投影与消费 | 依据和边界 |
| --- | --- | --- |
| 50、10、11、13、9 | entity.direction=Series低字节；entity.light=Series高字节 | PlayScn2294–2301、2322–2332；新字段保留0和未知光值 |
| 6、801、807 | entity.light=null，网页保留已有光值 | 这些参考路径没有同样的光值刷新，不能用无关消息清零旧值 |
| 654 | actorLight.id=Recog，light=Param | ClMain4034–4039 与 PlayObject.Message1857–1858；Tag为client key，不能当作昼夜或地图暗度 |
| 51、634 | map.darkLevel=Series | ClMain转发darkness、PlayScn2272–2277、原服DayBright()发送；随各自地图代次生效 |
| 46 | daylight.phase=Param、darkLevel=Tag | 继续驱动HUD图标；场景保存同一暗度权威 |

网页收到 actorLight 只更新现存实体；删除/切图后的未知ID不会生成幽灵角色。旧 socket、旧地图代次和已接受退出继续由原有接收护栏隔离。WorldTone 保存暗度供后续渲染对接，`fogApplied`明确为false；没有用本机时间、光值或图标自行判定夜景。

目前未新增SM_DIGUP20、尸骨33及死亡/复活路径的全部灯光刷新投影；它们与演员施法瞬时光、地图btLight、火墙及其他事件光源一起保持未完成范围。

## 原始灯光资源与版本差异

导入源固定为 active-asset-sources 的 nationalData，不能落到可变的原端运行junction。`scripts/export-scene-lighting.py`校验全部源与合同后，逐字节复制六份lig0*.dat、npal.idx并生成library.json；`--check`只读，重复导出不重写相同文件。

| 等级 | 原文件 | 尺寸 | 附加尾部 |
| --- | --- | --- | --- |
| 0 | lig0a.dat | 196×176 | 904字节，原LoadFog读取width×height后不使用，源锁保留 |
| 1 | lig0b.dat | 448×360 | 0 |
| 2 | lig0c.dat | 620×528 | 0 |
| 3 | lig0d.dat | 688×590 | 0 |
| 4 | lig0e.dat | 808×672 | 0 |
| 5 | lig0f.dat | 928×769 | 0 |

文件前8字节为小端有符号宽高，后续为行优先的亮度字节。生产数据读取器先核对整个原文件SHA，再核对几何；坏HTTP、错版本和失败请求可重试，强制重新读取采用新Promise，旧失败不能删除新成功缓存。

npal.idx为48字节对齐记录头加5份256×256索引表，IndexCount位于32；表顺序mix/anti/heavy/light/dungeon。实际DrawFog使用darkLevel1/2/3选择后三张表，以fogByte×256+sourcePaletteIndex查找。

独立重算后三张表共196,608项，与原文件字节全部一致。重算按参考写出的RGB×分子÷分母顺序、nearest-even Round、RGB Manhattan距离及0..255首个最小值。第一次探针先除比例再乘RGB，在light[17,94]制造了一个浮点顺序差异；原文件没有改，修正表达式顺序后的报告为当前接受结果。不能为消除这类探针差异重建或覆盖原npal。

参考 PlayScn1398 在最终 ApplyLightMap/DrawFog 前强制 `g_boViewFog:=False`，注释“免蜡”。该参考带有扩展修改，不能用它证明国服原端夜景关闭；国服包保留六份原遮罩也不能证明它在当前原端执行。

参考 FogCopy 的实际MMX使用paddd，按32位字相加，可能跨字节进位并回绕；它没有做逐字节饱和相加，maxfog参数也没有用于当前活动汇编。每行处理完整8字节块，剩下1..7像素的分支被注释。参考还有AddLight遮挡筛选、各等级LightMask及-5垂直偏移。这些都不能直接替换成现代径向渐变，也不能据此断言目标国服二进制具有相同缺陷。

## 校准入口和验收边界

[场景校准页](http://127.0.0.1:5173/scene-calibration.html)共用生产地图/人物/死亡调色，支持比奇与GA0地图样例、死亡状态和六档原始遮罩诊断。遮罩灰度是0–30数值的诊断展示，不是原端场景色彩；界面明确标注不连接账号和夜景待核。异步地图及遮罩显示保留当前请求代数，实际离页后旧结果不再画入。

当前接受：

- `scene-v13-web-accepted.json`：41个canonical网页脚本、488个PASS标记，TypeScript/Vite通过，149个输入前后稳定。新增WorldTone4组使用实际Pixi容器/滤镜/Uniform/LUT与生产TS/AST，GlProgram工厂替换，未执行GPU。数据读取4组含六个真实遮罩全字节、失败和重试所有权。标记数不等于同版视觉验收数。
- `scene-v13-gateway-final.json`：8入口、75个PASS标记，排除NPC/改密summary后73实际组，39输入稳定；包括20组packed光值、未知/零光值及真实private TCP分包/合包后654/51/634字段和地图代次。正式net10声明不变，本机独占net8兼容执行实际生产源码。
- `scene-v13-lighting-check.json`：8个导出文件核对一致、0写入；11项Python导入专项通过；完整Python377/377通过，288个输入前后稳定，详见`scene-v13-python.json`和本批总档案。
- `scene-v13-npal-comparison-final.json`：三个原始暗度表196,608项独立对照一致，保留最初表达式顺序探针的历史报告。
- `scene-v13-runtime.json`：8个原始数据/清单源、HTTP和dist相同，6个当前页面/模块可取；实际5173/ws连接新18801，未登录消息/拒绝/正常关闭通过。

18801从自有PID15396在0活跃客户时切到PID12516，新publish WebGateway.dll SHA256为`d04144fb7057ed5917dbf97e874f0acbc88b816ccf405d594dfc510e82c10ab7`。Vite14700保留，实际代理仍18801。原服、数据库、角色与第十一批召唤物修复没有由本批部署或写入。进程身份、磁盘DLL、HTTP/WS证明各有范围，不能把磁盘哈希当作内存DLL字节证明。

保留第一次WorldTone夹具的VM跨realm数组/初始空filters差异，以及两次canonical中新增生命周期和光值接口未加入旧夹具的失败。实际页面离开清理由现有单一pagehide处理，不新增重复生命周期监听。当前成功结果对应修正夹具及新增场景校准后的完整执行。

ART-009、ART-010由missing进入partial；默认死亡调色与确切光照数据/权威链已存在，完整天气、昼夜雾、地图/演员/法术光源仍未完成。UI-022、ART-018、GAME-080保持partial。目标原端/真实浏览器/GPU/像素/帧预算、死亡颜色配置、尸体/骨架/复活/死亡掉落及全部UI、美术、技能、经济、社交验收继续开放。
