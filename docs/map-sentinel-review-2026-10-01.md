第七批地图接入后的窄范围补审于 2026-10-01 冻结。固定 GA0 原文件 SHA256 `231b29ef5afa24aa276d195c037fa576b268033726642f0750e8c5ae2bbe5c2f` 的 54 个高编号引用，已按原参考图库越界返回 nil 的行为跳过绘制，并单独报告“参考规则跳过”。真实资源缺失仍进入原未解析计数。精确 408 个参考补图和 125 个国服索引保持此前来源选择。

原参考 `PlayScn.pas:556` 取背景 `wBkImg and $7FFF`，大于零后减一，偶数 x/y 取 `g_WTilesImages.Images`，`:561` 仅非 nil 时绘制。中层 `:582` 使用原 wMidImg，大于零后减一，`:586` 同样只绘非 nil。`WIL.pas:348` 的 FGetImageSurface 在 memory 模式 `:355` 检查 0≤index<ImageCount，cache 模式进入 GetCachedSurface；`:575–578` 先将 Result=nil，越界即退出。GetCachedImage `:611–614` 亦同。该源码支持“超过当前库 ImageCount 的取图返回 nil”，没有证明所有地图的 `number>=0x7f00` 均是统一历史 sentinel 规则。

实际 raw MAP 的 54 条为背景 Tiles masked number 32758…32767 各 2 条、中层 SmTiles masked number 32767 共 34 条、Objects 0 条；全部位于偶数 x/y。背景对应索引 32757…32766，中层 Web masked 索引 32766，均超出锁定国服库 count（Tiles 7910、SmTiles 938）。原中层 raw word 65535 在上述参考中未 mask，减一为 65534，同样越界返回 nil。此补丁没有扩大中层一般解码规则；其他地图的中层差异仍待原端验收。

生产 `map-assets.ts:67` 仅列明该固定地图 id/SHA、background/Tiles 上述 10 个索引与 middle/SmTiles 的单个索引；`:86` 在已经通过 active national 库声明身份、count、format 校验后，并再次检查超出库 count，才返回 `empty / reference_out_of_range_nil`。其他地图/指纹、层、一般越界索引或错误 source 继续 missing。该行为不依赖参考补图是否 enabled，也不改变任何补图索引集合。

`map-view.ts:79` 将此 reason 单列 referenceRuleSkipped；原碰撞 flag 计算先于各层取图。`:123` 发布当前已提交 renderDiagnostics，`:125` 在非零时显示参考规则跳过计数，`:136` 返回诊断副本，新地图开始时清理旧诊断。统计窗口只包含本次可见范围，不能把 54 个原文件全量数量冒充每个视窗的跳过数量，也不能将跳过项算成已补全的图片。

| 独立证据 | 结果与范围 |
| --- | --- |
| `.runtime/reports/map-sentinel-seventh-source.json` | ART 的原 54 条坐标/rawWord/cellHex 与原参考源码审计；SHA256 `7177f360ce3d9748fc8e5214e95434632bbd80d217f271bf0e2c53b0e8cfdbed` |
| `tests/map_sentinel_regression.mjs` | 5/5 PASS：实际原 MAP SHA/54 条和偶坐标；实际导出块逐字节重建完整 MAP 与 flags；生产 resolver 窄范围及负控制；真实 Pixi 生产 createMapView 读取原导出块，遍历覆盖全部 54 条所在视窗、核单列计数和碰撞、不发高索引纹理请求，并额外访问普通参考补图 |
| 原 `map_assets` / `map_sources` / `map_loading` | 在新源码上重新执行 12+8+17，共 37/37 PASS；新专项加后本代理范围合计 42/42 |
| TypeScript / diff | `tsc --noEmit` 与 owned diff check 均 exit 0 |

真实 Pixi 场景、Sprite 与 Texture 均为 8.13.2 生产类；Application 初始化、网络交付和时钟为 Node 夹具。实际文件与 map chunks 由本机文件读取，未启动浏览器/GPU、原客户端运行、CDP 或联机协议。本补审仍为 source_review/unit_regression，保持 partial，不升级 native/browser 验证。

| 文件 | 当前 SHA256 |
| --- | --- |
| `apps/web/src/map-assets.ts` | `6b150b79585134d0ad67da54d1ebfad59b0e5d41e53ee8312c4daa77c6204c0f` |
| `apps/web/src/map-view.ts` | `056d4ba3cf099fc6bf519daff7a3bd6c95c5045eafc6ace9a71e021a9795f3d9` |
| `tests/map_sentinel_regression.mjs` | `cc9795d769c6d261483f2b95ee404dce912759e98436d25b828873b9fc56c5ed` |

原参考完整 SHA256：PlayScn.pas `0dcc555bf7fbd10fbd1ac240250bdc0bc28dead21ad188f664030c1af7426120`；WIL.pas `662fa57702187698953d74c81464ba995fe05668125100a4f39a57f3119186ec`；MapUnit.pas `99efb1d83a594262421d2136c49fa265bc67071cfa783c3c457f6e2d8aba78e3`（`:30–48` 的 52 字节头和 12 字节 cell record）。源文件按 gb18030 解码审阅。

## 全库越界帧边界复核 · 2026-10-02

本节将“特定高位编码是历史 sentinel”与“经身份校验的 WIL 索引越过 `ImageCount`”分开处理。原版 `WIL.pas` 的 `FGetImageSurface` 在越界时先置 `Result=nil` 并退出；该结论适用于同一锁定图库的任意越界索引，不要求地图 ID 或高位数值固定。Web resolver 现在只在 national WIL 身份与 `sourceFrameCount` 一致后，将未被精确地图候选覆盖的越界索引解析为 `empty / reference_out_of_range_nil`。明确绑定的 GA0 参考 Tiles 帧仍优先于原库越界结果；库内缺帧、身份不符、候选缺失仍是 `missing`。

这项通用边界规则让 327xx 资源号及 `Objects3` 的 9229 以上索引按原 WIL 行为返回空，而不再把它们误报为可补齐的图像。它不会推断 0x7f00 sentinel，不会填造图块，也不会改变碰撞。回归验证覆盖九个国服原版地图图库在 `index === ImageCount` 时的结果、库内真实缺项仍为 missing、GA0 精确候选仍可越过原 Tiles 库边界，以及真实 Pixi 地图场景不请求这些越界帧纹理。界面诊断仍单独显示参考规则跳过数量；线上浏览器截图验收仍未完成。

本次新回执 `.runtime/reports/map-sentinel-seventh-review.json` 记录 previousSha 与新源码；日志使用 `map-v7-sentinel-ui-*` 前缀。原 37 组接入回执 `.runtime/reports/map-source-binding-seventh.json`（SHA256 `4b70bad4be6b2023574195a425dddea1263e69b7ad3c81bb6c46eaf85773014e`）、原日志和 `map-source-binding-review-2026-10-01.md` 保留原源码指纹及历史范围。该旧回执没有覆盖这次 54 条处理。
