# 地图动画节拍校准 — 2026-10-02

Web 原来用 `floor(performance.now()/100)` 推进地图动画，所以水流、火盆和装饰前景按原版的一半速度播放；页面恢复前台时还会按墙钟一次跳过多个动画节拍。

参考客户端 `GameOfMir/Client/PlayScn.pas`（SHA-256 `0dcc555bf7fbd10fbd1ac240250bdc0bc28dead21ad188f664030c1af7426120`）在 892–895 行以 `GetTickCount` 检查 50 ms，推进共享 `m_nAniCount`，超过 100000 后清零；1080–1083 行按 `(m_nAniCount mod (ani + ani*btAniTick)) div (1+btAniTick)` 选择动画帧。Web 地图 ticker 现在使用相同的 50 ms 共享计数、循环上限和 `btAniTick+1` 帧停留方式。延迟绘制只推进一次，符合参考代码的单次绘制检查，不用墙钟补追错过的节拍。

生产 `createMapView` 回归覆盖零/非零 `btAniTick`、循环、延迟绘制和逐索引加载，14 组通过；地图加载、门帧和碰撞回归19组通过。TypeScript `--noEmit` 及不重复复制静态资源的 Vite 生产构建通过，构建762个模块并保留现有 public 资产树。5173 当前实际提供新版源模块，地图63分库候选 Tiles/Object清单和具体 PNG 返回200；所取候选 PNG 与dist字节一致。

这只校准节拍与逐帧选择，不声称完成水流/加色/偏移的像素级同版验收。现有572张离线视口预览是抽样，不等于每个MAP格子均有素材；全图核算仍有23张地图的91条背景引用无可用源帧（锁定国服帧为1×1、现候选帧为空）。它们保持显式缺项，不借邻帧填充。当前没有本机浏览器截图工具，未做真实游戏视口或原端帧差分。

完整验证结果与输入 SHA 见 `.runtime/reports/map-animation-cadence-2026-10-02.json`。ART-007 仍为 `partial`。
