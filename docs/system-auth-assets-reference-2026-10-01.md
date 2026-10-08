# 系统框与改密原图契约（第八批）

本批只确认原装国服 Prguse 的资源身份、原索引、几何、透明度及导出 PNG 的像素。系统框和改密热区已供生产组件复用，同版原客户端的控件位置、按下行为、字体及浏览器视觉对照仍未验收。两份契约的 `complete` 均为 `false`，`nativeSameVersion` 为 `unknown`。

## 原图与独立来源

`content/classic-176/system-dialog.json`、`auth-actions.json` 绑定 `national:ui:prguse`。默认源目录来自冻结的 `active-asset-sources.json` 的 `roots.nationalData`，本机为 `C:/Program Files (x86)/shanda/Legend of Mir/Data`。验证器读取原目录，显式 `--data-dir` 同样必须匹配以下独立锁，禁止借用可变运行目录中的装备覆盖库。

| 来源 | 字节数 | SHA-256 |
| --- | ---: | --- |
| Prguse.wil | 4313717 | 88a12492138bc85ba0429dce3cbd857efcea5b7659cdd8d85a4f2f4db68d5ef2 |
| Prguse.WIX | 2088 | e3c60272e6493fb8c409a8bc90834f01b61f37647152865c9125827e82514531 |
| 现有完整 library.json | 记录于回执 | f7b57c6ef18d71132655acd8502b26672fca0ee323cdbd3f6477a698bda2f363 |

来源共 510 个索引。全部 16 个本批帧从 WIL/WIX 重解码，保持 bottom-up 原索引像素与调色板 0 透明规则。现有 PNG 与确定性重建逐字节相等，PIL 解码的 RGBA 与原 BGRA 转换结果相等；契约另锁 PNG SHA、RGBA/BGRA SHA、原偏移和 alpha 统计。回执还记录原帧偏移、原 indexed-buffer SHA 和 1024 字节调色板 SHA。

| 原索引 | 实际几何 | 已观察的像素用途 |
| --- | --- | --- |
| 360 / 380 / 381 | 452×179 / 256×359 / 188×105 | 横框 / 竖框 / 小框底图 |
| 361–368 | 每帧 80×34 | 确定、取消按钮；361/362、363/364、365/366、367/368 的 normal/pressed 对应关系来自参考实现 |
| 50 | 420×299 | 四行修改密码底图，含“同意”“取消”按钮像素 |
| 53 | 128×33 | “修改密码”入口按钮 |
| 54 | 296×253 | PASSWORD 面板底图，不能作为 53 的按下帧 |
| 64 | 16×23 | 小型关闭 X；实际同版动作和位置待验 |
| 65 | 800×600 | 选角整屏底图，不能作为 64 的按下帧 |

51 为英文 CANCEL 按钮、52 为中文取消按钮，实际几何分别为 96×34、96×33；本批只作邻近原图查阅，未据相邻关系指定它们为改密按下帧。53 与 64 的 pressed/hover 暂复用 normal，并明确 `reuse_normal_unverified`，没有独立按下或 hover 证明。没有新增 public PNG，也没有重绘。

## 布局与证据分级

参考 `FState.pas` SHA `f685ca03af5a999858d5826e924ace25b404b2703107831027b59f6f2491e6b8` 证明系统框用 360/380/381、以整数 `div 2` 居中，按钮按 cancel/no/yes/ok 从右向左递减 110。消息用白字黑描边、反斜杠分行、行距 14。仅单一 OK/Yes 可用 Enter；Escape 需要 Cancel。参考 `DMsgDlgDirectPaint` / 按钮绘制用图像 `ClientRect` 放在控件坐标，因此国服帧记载的 `(+7,-44)` 只保留作资源偏移，不用于 UI 平移。

参考原坐标无法覆盖本批所有安全布局：横框四按钮第四个 left=-6、竖框第二个 left=-5、小框消息起点 (39,38) 与按钮起点 (90,36) 相交。因此横框四按钮重新拟合、竖框多按钮两列、小框单按钮重新拟合且多按钮转横框，均标为 `proposed`；它们的唯一坐标来自契约。参考一至三按钮横框和单按钮竖框保留局部坐标，仍不构成同版国服运行证明。文本裁剪范围、中文字体候选及 12px CSS 字号也为 proposed。

修改密码参考 `IntroScn.pas` SHA `838aed85539bfc668393ce8e5b80d9adccb15da21791203b97c7bc481305711d` 提供四输入、10 字符限制、后三项密码掩码、Enter 顺序和本地重复校验。其输入 x=191 与按钮 (81,141)/(160,141) 不符合本机国服 50 帧的标签、字段边框和底部按钮。契约保留这些参考事实，生产热区按原图观察给出保守拟合，证据为 `proposed_native_pixel_measurement`。

| 改密元素 | 50 帧局部热区 left,top,width,height |
| --- | --- |
| 用户名称 | 240,119,132,14 |
| 当前密码 | 240,151,132,17 |
| 新密码 | 240,178,132,15 |
| 重复 | 240,210,132,14 |
| 同意 | 178,251,87,35 |
| 取消 | 272,251,101,35 |

50 帧在 800×600 画布的整数居中位置是 (190,150)，热区按底图局部坐标叠加。字段矩形处于观测边框内；两按钮通过透明控件接收输入、复用已烘焙底图。此测量没有原端鼠标热区或焦点截图证明。目标字体和 10 字符如何与实际输入宽度适配仍需浏览器与同版原端验证。

## 可重建验证与真实范围

```powershell
python -B -X utf8 scripts/validate-system-auth-assets.py --report .runtime/reports/system-auth-eighth-native-assets-final.json
python -B -X utf8 -m unittest discover -s tests -p test_system_auth_assets.py -v
```

最终资产回执 `.runtime/reports/system-auth-eighth-native-assets-final.json` 为资产范围通过（exit 0）、16 帧像素和字节相等、整体完成度 false。原首次回执和后续回执均保留，首次遇到的 manifest 字段误读已经修正为 `sourceFrameCount`；没有修改已有 manifest。专项最终日志 `.runtime/reports/system-auth-eighth-assets-tests-final.log` 为 18 项通过。测试覆盖原安装资源和非对称 WIL 夹具、透明度/翻转、错误源锁、改写 PNG 后同步伪造 manifest/hash 仍被原源像素阻止、两个错误相邻按下帧、越界/重叠热区和证据升级拒绝。

这些是 `native_pixels`、`reference_source`、`source_review`、`unit_regression` 证据。没有 browser_runtime、native_runtime、GPU 编译、同版原端交互或视觉差分证明。生产系统框及改密组件的接线、协议与交互回归由对应实现批次另行登记。
