# 聊天输入基础批次的依据和边界

2026-10-01。对应 UI-046，日志显示和滚动限制仍由 UI-045 单独追踪。本批实现 `chat-input.ts`、网关 `raw` 通道及生产页面接线，后续追加实际页面回调的有限单元证据。状态保持 `partial`：参考源码未证明与国服 2003/1.76 二进制同版，本批没有原端运行、真实浏览器 IME 或真实聊天投递验收。

## 参考规则

Delphi 目录：`C:/Users/122/Documents/Codex/2026-09-27/codex-threads-01a0ddc4-8265-75b0-82f2/work/mir2-client-reference/GameOfMir/Client`。

| 定位 | 参考行为 | 当前采用与限制 |
| --- | --- | --- |
| PlayScn.pas:267–273、427–440 | 隐藏 TEdit、MaxLength70；Enter调用SendSay并清输入/隐藏，Escape清输入/隐藏 | module正常Enter防止默认重复提交，true后清输入/blur，Escape清/blur；国服同版70的ANSI/字节含义和真实焦点时序仍待证 |
| ClMain.pas:1741–1752、1765–1782 | Space/Enter打开聊天，行会开关时预填`!~`；`@`/`!`/`/`打开前缀输入；斜杠可复用WhisperName并将光标放末尾 | module提供open(prefix)，前缀只填空草稿。复用已发私聊对象支持全部合法名字，参考Length>2的ANSI短名字条件未照搬；非空草稿保留属proposed Web行为 |
| ClMain.pas:1754–1762、2999–3003；当前PlayObject.Chat.cs ProcessSayMsg/ProcessUserLineMsg | `!`喊话、`!!`组队、`!~`行会、`/名字 内容`私聊；原SendSay发送原串，斜杠发送后记忆对象；原服`@`进入命令路径 | 显式前缀优先于频道选择，走raw只保留现有外层Trim，不再次包频道前缀；`@`和参数空格不被改写。服务端权限、禁言、喊话间隔由原服决定 |
| FState.pas:1896–1923；HUtil32.pas:695–756 | 点击聊天行以两次GetValidStr3提取姓名，覆盖为`/姓名 `并将光标放末尾 | chatNameFromLine按相同分隔符提取，进一步按当前网关合法对象规则限制；selectLine只给玩家chat使用，系统提示不可作为玩家姓名 |
| ClMain.pas:1698–1721；DrawScrn.pas:147–191 | Up/Down/PgUp/PgDn调整ChatBoardTop；日志按文本宽度换行，ChatStrs超过200删除首行 | 没有找到已发送消息回填编辑框的实现。本批100条发送历史、Up/Down回取、保留未发草稿均明确为proposed Web增强；它们不替代原聊天板滚动，也不证明UI-045完成 |

SHA256：PlayScn `0dcc555bf7fbd10fbd1ac240250bdc0bc28dead21ad188f664030c1af7426120`；ClMain `08c79ace18755ca96882079ed0c5a5ff71c91bd8bb2de6ab539d90272355c74e`；FState `f685ca03af5a999858d5826e924ace25b404b2703107831027b59f6f2491e6b8`；HUtil32 `4e569c71805085dd315da106e2b35add28edd985edcef76ecaa783fcffbd7219`；DrawScrn `1a844e9078375470ae5df2ce35f3470b2e22faf8a53d4252aac8b62cf136e4d7`。均为 `reference_source`。

## 模块接口和发送边界

`ChatInputController(input, actions)` 绑定一次keydown、compositionstart/end、input和blur。页面表单提交调用 `submit()`，不要重复绑定keydown。actions为channel()/target()/send(command):boolean以及可选canSend()/status()/setChannel()/setTarget()；`open(prefix?)`、`selectName(name)`、`selectLine(text)`、`resetHistory()`、`dispose()`分别供打开输入、姓名点击、角色切换清历史和解绑使用。

`chatCommandOf`输出当前say结构。普通文字使用选择的local/shout/group/guild/whisper；显式`!`/`!!`/`!~`/`/姓名 内容`/`@命令`使用`channel:'raw'`，因此选择其他频道也不会重复包前缀或改写命令。空文本、无内容前缀、缺私聊正文、非法对象、控制字符和确定超长字符串在发送前拒绝；最终GBK可编码性和前缀后的180字节总长由生产ChatCommand/LegacyCodec验证。页面的私聊required约束应由module统一验证，以免raw命令被当前选择的空私聊对象阻止。

send返回false、canSend=false或抛错会保留草稿、光标、选区和焦点；只有true才清输入/blur并保存内存发送历史。true仅表示消息进入发送调用，不能当作服务端已投递。纯 `chatCommandOf` 不分配编号；实际submit发送前分配正整数 `chatId`，失败尝试不复用，resetHistory也不重置计数。网关仅回显有效say请求的编号（JSON整型、1..Number.MAX_SAFE_INTEGER）。`rejectLastSend(reason?,chatId?)`只接受正整数且仍在有界待决表中的匹配发送编号；匹配的typed拒绝会显示原因，只有其草稿仍为空、版本未变且频道/对象未变时才恢复。旧拒绝不会覆盖新草稿；待决关联最多保留32条。页面say错误立即return，不取消无关移动、物品、施法或服务pending。chatId只归因Web网关typed拒绝，未改原TCP聊天协议，也不是原服投递ACK。

IME期间和isComposing/keyCode229均不发送、回取、清输入或换姓名；blur释放本地composition gate而不清草稿。普通光标在文本中间、选区和Ctrl/Alt/Meta/Shift方向键保持编辑语义；历史只在折叠选区位于首尾时回取，Down越过最新条恢复原草稿和channel/target/光标。相邻相同text/channel/target只保留一项，总量100，resetHistory不会清当前草稿。这些历史细节均为proposed。

原客户端`/cmd`、`/debug`、`@password`等本地调试/口令模式拦截没有在此模块复制；国服同版命令目录、客户端本地命令与服务端命令边界仍需取证。没有新增复制姓名或推断菜单。

## 本批实际回归

`tests/chat_input_regression.mjs` 转译实际生产controller，fake input/events下 **19组PASS**：结构频道/对象、原前缀与@参数优先、空内容/非法输入、两次token姓名提取、正常queued发送、断连/false/throw保稿、composition/keyCode229/blur、Enter重复、Escape、编辑光标和选区、历史回取/恢复/编辑/上限、斜杠对象、点击姓名、有限拒绝恢复、reset和dispose，以及连续A/B发送的旧/缺失/非法ID拒绝、同ID恢复、编号不复用和纯解析无ID。独立strict TypeScript模块检查通过。未借此证明真实浏览器compositionend/implicit-submit时序。

`tests/chat_play_regression.mjs` 用TypeScript AST提取生产play构造配置、表单、channel、window keyboard与socket message回调、appendChat，加载真实controller和routeClassicKey。当前 **10组PASS**：方向键/Pg滚动、世界输入阻断时仍可滚动、新消息底部跟随、阅读历史时保持位置、普通消息200行上限、长消息超额物理行裁剪。fake Range按可配置字符宽度模拟折行；这是实际生产逻辑的fake DOM覆盖，不是浏览器像素或原端等同验证。

`tests/ChatGatewayRegression` 直接编译生产ChatCommand.cs与LegacyCodec.cs。实际.NET8构建0警告/0错误，**5组PASS**：raw原串/外层Trim、其他结构频道未变、非空/控制字符、ASCII180/CJK90/前缀额外字节/不可编码字符，以及真实legacy codec往返和对象限制。raw通道复用现有验证，不新增聊天权限或原服确认假象。

日志为`.runtime/reports/chat-input-regression-2026-10-01.log`、`.runtime/reports/chat-play-regression-2026-10-01.log`和`.runtime/reports/chat-gateway-regression-2026-10-01.log`，末尾保存实际源和测试SHA256；记录时间与日志指纹另由UI JSON登记。浏览器、同版原端、真实18801聊天投递/权限/禁言及滚动像素均待验收，服务端确认不能由queued调用代替。

## 2026-10-03 状态补记

聊天发送失败关联现在覆盖最近32个queued请求：旧请求的拒绝仍能显示，不会因更新请求已发出而静默；只有仍未被用户编辑的对应空草稿才恢复。聊天日志响应ArrowUp/ArrowDown/PageUp/PageDown，并用DOM Range按实际折行物理行保留最多200行。裁剪超额时只删最旧长消息的前缀；读者停在历史位置时按删除高度修正scrollTop，新消息只在原先已到底时自动跟随。方向键步长读取聊天日志CSS行高，翻页步长为视口高度减该行高，生产逻辑回归通过。浏览器Range与Delphi按文本宽度/双字节字符计算的ChatStrs尚未逐字体核对；协议前景/背景色字节已按锁定Prguse索引调色板绘制到消息文本范围，并由网关与聊天回归覆盖；实际各频道色值、字体/行距和真实浏览器滚动外观仍待同版截图验收。
