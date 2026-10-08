第七批地图来源接入于 2026-10-01 冻结。`map-assets.ts` 与生产 `createMapView` 已采用 `map-asset-bindings.json` 的当前 enabled 选择：仅 GA0 原 MAP 指纹 `231b29ef5afa24aa276d195c037fa576b268033726642f0750e8c5ae2bbe5c2f` 的 background/Tiles 层、精确 408 个原库范围外索引使用 `/libraries/reference-ga0/Tiles`。125 个原库索引和全部其他地图/层仍使用国服来源。国服索引 9、14 的 1×1 帧是本批明确保留的原资源，不能套用物品/技能的微小占位判据。

候选身份为 `reference_source` / `reference_candidate`，`mapVersionPairingVerified=false`。新选择合同 SHA256 为 `669fe0d73bcff81adabdc7cf050886f27d9c3fe5db62a356961dc86e8a2ab3b0`。六批 registry/manifest 的 `mapBindingActive:false` 是导出时快照，当前选择由新合同决定。可渲染范围没有升级成国服原版版本配对证明，也没有减少原国服库缺项。

生产来源规则：`map-assets.ts:25` 校验选择策略、原 MAP SHA、候选库 SHA/format/count/namespace、国服库 SHA/indexSHA/count、精确 408 集、125 个合法国服索引和保护集合 9/14。默认不可变合同预编译一次、三个国服库预索引；测试传入的合同逐次校验。`resolveMapFrame` 在每个具体索引上决定来源、帧和完整 URL，不使用同名库、相邻索引或默认帧替代。候选帧强制原 index/sourceIndex/sourceSHA、合法 PNG SHA256 格式、文件名与几何；旧国服导出帧的源字段仍可能只存在于 library 级，因此其 library 身份、frame.index/PNG SHA 格式/几何为必需，帧级 source 字段存在时必须一致。

`map-view.ts:42` 在成功缓存前校验候选 manifest 的声明身份与精确导出索引集；HTTP、解析和身份失败释放该请求，允许重新加载。`map-view.ts:75` 对 base 与每个动画索引分别调用同一 resolver。背景无动画扩展，地板坐标仍为 x×48/y×32，不叠加候选的 (7,-44) 偏移。纹理缓存键为完整 URL，失败只删除对应失败 Promise，不销毁已成功共享纹理。原 mapRequest/worldRequest/generation、异步队列、碰撞提交及迟到场景销毁规则保留。

本轮 runtime 检查的是 JSON 声明身份与帧元数据。没有逐 PNG 的额外 fetch/crypto，也没有在浏览器中重新计算 manifest 字节 SHA。实际 PNG 字节、原 locked.Lib 解码 RGBA/alpha 和 source/dist/HTTP 字节检查属于独立 ART/部署回执，本文件的 Node 结果不替代这些检查。

| 回归 | 通过组数 | 可证明范围 |
| --- | ---: | --- |
| `tests/map_assets_regression.mjs` | 12 | 实读当前合同、国服三库与候选 manifest；408 个候选与 125 个国服索引逐项解析；pending/模糊绑定、地图指纹/源身份/策略/几何/索引错误及保护集合；元数据级解析 |
| `tests/map_sources_regression.mjs` | 8 | 实际生产 helper/createMapView、真实 Pixi 8.13.2 Container/Graphics/Sprite/Texture；Application 初始化、网络、时钟为夹具；原网格位置、静态背景/国服逐帧动画、越界 EMPTY、迟到 manifest/texture、演员与共享贴图保留、HTTP/身份失败和完整 URL 重试 |
| `tests/map_loading_regression.mjs` | 17 | 原十组生产地图事务加七组真实 play 消息回调 AST 路径；已接真实来源 helper，仍使用 fake 场景对象与网络 |
| `tsc --noEmit` / `git diff --check` | exit 0 | TypeScript 类型与本批差异格式 |

新 Pixi 回归使用隔离的 5×5 合成地图块、真实源 manifest 和对应 MAP 元数据指纹，测试的是生产事务及渲染调用规则；其合成块不是原 MAP 字节重建验证。没有启动浏览器/CDP、GPU 渲染、真实联网地图操作或原端截图。本批状态仍应保留 partial。

最终指纹：

| 文件 | SHA256 |
| --- | --- |
| `apps/web/src/map-assets.ts` | `2ce3b5c6b25e2604ec4d096c25ed1d7ec5f2ca7ad27f71564bd7d551366c61b1` |
| `apps/web/src/map-view.ts` | `9da6cf39c56727a9d52a5b67f46e90bcac18e69b654f9777b260efdf999efa6b` |
| `tests/map_assets_regression.mjs` | `c418046c32aba62d488908e71dc9624ad14a0dae229233c8c9c99d0044d2e80d` |
| `tests/map_sources_regression.mjs` | `a019b2258ceb23dfe12dab678ede6f8b41be0ba70c4375087955cc84963f41e6` |
| `tests/map_loading_regression.mjs` | `d9093c71ad6bd9c6e2bac2e0534bbdcb6585448829681cbbdba4c5d60512d60a` |

独立最终回执：`.runtime/reports/map-source-binding-seventh.json`；三个日志为 `map-assets-regression-seventh.log`、`map-sources-regression-seventh.log`、`map-loading-regression-seventh.log`。中途 noEmit 的可选字段类型错误已改为比较此前已校验的锁定 binding.sourceFrameCount；最终 noEmit exit 0。Root 的首次构建失败日志保留历史，最终归档应引用修正后的源码与回执。
