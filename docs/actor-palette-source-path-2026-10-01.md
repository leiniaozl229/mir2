# 调色板原始来源路径修正（2026-10-01）

调色板导出 CLI 的默认输入、安装包重建回归，现在共同读取 `content/classic-176/active-asset-sources.json` 的 `roots.nationalData`。相对路径按仓库根目录解析；显式 `--data-dir` 保持优先。全部 22 个兼容 WIL 的完整文件 SHA、原始调色板锁、整数平均和最近颜色规则保持原值，现有 bundled JSON 未重写。

旧测试读取 `.runtime/native-client/Data`。该运行链接已由另一项装备工作指向 `.runtime/native-equipment-data`：Hum 从 10800 帧扩为 14400 帧，完整文件 SHA 由 `6a3867…` 变为 `431fb2…`，WIX 也有对应变化。原安装 `C:/Program Files (x86)/shanda/Legend of Mir/Data` 的 Hum/WIX、Prguse 及 22 个兼容来源仍符合已有锁；实际重建与 bundled JSON 语义和换行归一文本一致。逻辑库名 `NHum` 本来就对应原文件 `Hum.wil`，无需改名或放宽 SHA。相同的 1024 字节调色板不能替代完整源文件身份。

初始全量 Python 的 332 项、331 通过、1 个 ERROR，以及原 8 项专项的 7 通过、1 个 ERROR，均保留为修正前历史。错误是 `test_installed_national_sources_rebuild_bundled_resource` 的 `source hash mismatch: Hum.wil`。本批新增默认绝对路径、相对路径、缺失配置拒绝和 CLI 默认路由回归，并强化显式错误源继续拒绝且不写输出，共 12 项实际通过。真实默认 `--check` 已验证原安装全部 22 个来源；显式运行 overlay 仍按锁退出 1。

```powershell
python -B -X utf8 -m unittest discover -s tests -p test_actor_palette_export.py -v
python -B -X utf8 scripts/export-actor-status-palette.py --check --report .runtime/reports/actor-palette-seventh-check.json
python -B -X utf8 scripts/export-actor-status-palette.py --check --data-dir .runtime/native-client/Data
```

最后一条是预期失败边界，仍报 Hum 源 SHA 不符。无配置时也不会回退到可变运行目录。完整 Python 的修正后结果由 Root 在新前缀下另行归档，12 项专项不代替全量结果。

当前 `actor-status-palette.json` 为 Windows CRLF，磁盘 SHA 为 `008828504b0fe62527e1b0298f96b3f2569893ea0bb1ef63262fea047921cb9e`；导出器报告对 canonical LF 编码计算的 `resourceSha256` 为 `8f46af647fc9de0a3b97286740c12cc1e2065821921851f60d76c5e05680e906`。两种已有序列化口径均记录，不能把后者称为磁盘文件 SHA。

调查与当前来源指纹见 [失败调查](../.runtime/reports/actor-palette-seventh-failure-review.json)、[12 项专项日志](../.runtime/reports/actor-palette-seventh-tests.log)、[原安装只读检查](../.runtime/reports/actor-palette-seventh-check.json) 和 [修复回执](../.runtime/reports/actor-palette-seventh-repaired.json)。原 palette/actor 契约、国服文件、bundled JSON、运行 junction 和装备 overlay 均未修改。本批没有部署装备或操作服务、数据库；GPU 执行、画面调色板混合和浏览器/原客户端视觉比较仍待独立验收。
