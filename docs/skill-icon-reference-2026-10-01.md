# 技能图标取帧与恢复证据（2026-10-01）

本批修正生产技能页与 HUD 的图标身份和失败恢复，证据等级为 `reference_source`、`contract`、`source_review`、`unit_regression`。没有追加原客户端运行对照或真实浏览器像素/指针验证，完整 UI 复刻状态保持 `partial`。F1–F8 HUD 布局、重试提示、键盘激活、左键约束和当前技能行布局属于 Web 适配；本批测试不证明原版窗口尺寸、字体、坐标或全部技能美术已完成。

## 原参考与当前协议

Delphi 参考根目录为 `C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client`，文本按 GB18030 读取，指纹按原始字节计算。

| 来源 | 确切依据 | SHA-256 |
| --- | --- | --- |
| `FState.pas` | `DStMag1DirectPaint` 第 3487–3499 行：技能来自 `g_MagicList`，普通图标为 `pm.Def.btEffect * 2`，`Downed` 状态取 `icon + 1`。第 3506–3532 行点击图标打开 `SetMagicKeyDlg` 并按 `wMagicId` 发送绑键。 | `f685ca03af5a999858d5826e924ace25b404b2703107831027b59f6f2491e6b8` |
| `DWinCtl.pas` | `TDButton` 第 654–694 行：捕获后移动到控件外清除 `Downed`，回到内部恢复；松手只在 `InRange` 时调用 `FOnClick`，随后释放捕获并恢复普通状态。 | `7603c9cbe0fcb224f3017a2b618b3d5cb581dd4850ae10735ec7834359ed61ff` |
| `Grobal2.pas` | `TMagic` 第 630–633 行分别定义 `wMagicID`、名称、`btEffectType` 和 `btEffect`。效果字段与魔法业务 ID 独立。 | `12216ae60afe64b7e6fb9143e9286552559f2a445d1fff56d62a158e938e3ed2` |
| `services/web-gateway/MagicProjection.cs` | `MagicSkill` 与 `Parse`：旧消息的 `body[26]` 投影为 `effect`，`body[25]` 为 `effectType`，`U16(body,8)` 为 `magicId`。 | `10ed0d26247e68e32c3dbe6a2910936e3966b15f1da8a785a96c20f01da8f8ca` |

`content/classic-176/icon-usage.json` 是当前取帧规则的单一事实来源。生产 `skills.ts` 的 `skillIconIndexOf` 读取其中的 `skills.normalMultiplier` 与 `pressedOffset`，`classic-hud.ts` 调用同一函数取普通帧。零效果合法。名称覆盖、直接使用 `magicId`、减一取帧、默认帧和相邻帧均不参与技能图标选择。

生成 SQL 中两个 `magicId=48` 条目分别为群体施毒术 `effect=27` 与气功波 `effect=36`，其普通帧分别为 54 与 72。当前国服 MagIcon 只有 72 个源帧，因此后一索引越界。回归分别验证这两个效果的显示/缺图行为；业务 ID 冲突仍需独立修复，本批没有更改 SQL、数据库或网关技能身份规则。当前目录统计为 1000 个物品/108 个技能，按原字段精确映射得到 401/45 个图标，仍有 599/63 个缺图。第五批历史的 580/58 使用了未证明的名称/通用替换，不能代表当前准确覆盖。

## 生产行为与来源边界

共享 `icon-frames.ts` 只接受 `active-asset-sources.json` 已登记的 public namespace，并核对 manifest 的源数据/索引 SHA、帧总数、格式和精确索引。`reference_candidate` 需要调用方明确 opt-in；生产技能页/HUD 均未选择候选源。当前国服 `/ui-national/magic-icons/library.json` 的源 WIL SHA 为 `22109b4327adbef871eb0008e4fff928d60020c400b43441a7522abf33656a02`，WIX SHA 为 `b5e646cb44ebd117eb083053a11f7500166293621281cba423349459e4fd0472`。runtime 只核对 manifest 身份；原 WIL/WIX 与全部输出 PNG 的字节完整性由离线资源审计承担。

几何校验拒绝 tiny、非法宽高/偏移、越界索引、不安全文件名和声明空帧。PNG 加载后核对真实尺寸，并用共享 `iconHasPixels` 读取已解码 alpha：透明图标显示缺图，不提供网络重试；没有可读 canvas 或读回失败时返回 unknown，不声称已经证明透明。

技能页用准确普通/按下帧显示图标，捕获拖出后恢复普通帧，拖回恢复按下帧，控件外松手不打开绑键。`pointercancel`、捕获丢失和旧 render 均终止旧绘制回调。HUD 使用同效果族普通帧并保留稀疏 F1–F8 槽。

manifest/PNG 加载失败显示简单重试控件，显式重试保持已选技能、权威技能字段、施法 pending 和绑键 pending/计时器。重试 PNG 使用新请求序号，旧 load/error 回调按加载、render、图标按下状态代次隔离；清空技能和 HUD 后旧回调不得重新生成图标。缺图显示“图标暂缺”或带该标签的 `?`，仍可选技、施法和绑键，不改变服务端权威状态或动作槽。玩法界面不显示资源路径、哈希或诊断字段。

## 本批回归范围

| 脚本与回执 | 组数 | 可证明范围 |
| --- | ---: | --- |
| `tests/icon_frames_regression.mjs` → `.runtime/reports/icon-frames-regression-2026-10-01.log` | 9 | 执行真实共享 helper，读取当前 native manifest 与 PNG 头/指纹；精确索引、tiny、几何、身份、namespace、候选域、歧义以及已解码 alpha/不可读 canvas。 |
| `tests/skill_icons_regression.mjs` → `.runtime/reports/skill-icons-regression-2026-10-01.log` | 10 | 执行真实 `classic-ui`、`classic-layout`、共享 helper、`SkillBar` 与 `ClassicHud`，fake DOM/fetch/timer 模拟按下/拖出/取消、404、PNG 错误、透明/尺寸错误、显式重试和陈旧回调。使用当前 JSON 与 manifest，没有用假图标映射替换生产逻辑。 |
| `tests/skill_keys_regression.mjs` → `.runtime/reports/skill-icons-skill-keys-regression-2026-10-01.log` | 7 | 原绑键回归加载真实共享 helper 和当前取帧契约，保留 ASCII/None、冲突快照、超时、关闭、绑定 ID 与迟到拒绝隔离断言。 |

三脚本共 26 组通过，TypeScript `--noEmit` 通过。DOM、canvas 像素读回输入与 fetch 故障由测试夹具提供，这些结果属于生产逻辑回归，不能替代真实浏览器渲染、原端对照或完整联机验收。指纹、环境与每个回执的范围见 `.runtime/reports/skill-icon-evidence-2026-10-01.json`；全项目构建和广泛回归由本批中央归档另行记录。
