# Map object-bank correction — 2026-10-02

The Web renderer treated every foreground MAP frame as `Objects.wil`. The 2003 client stores the object-library selector in `TMapInfo.btArea` at byte 10 and passes it to `GetObjs`; values 0–6 select `Objects.wil` through `Objects7.wil`, while values outside the native 0–14 selector range fall back to `Objects.wil`. The renderer also merged background and middle layers into one insertion-ordered container and treated static 96×64 objects as floor sprites. The reference client paints background, middle, 48×32 foreground tiles, then larger foreground objects in row depth order.

The Web renderer now reads the selector from byte 10, lazy-loads the exact hash-locked library for the visible area, and keeps background, middle, flat foreground, and depth-sorted foreground in their own draw passes. It does not substitute `Objects.wil` for areas 7–14, which require `Objects8.wil`–`Objects15.wil`.

## Full-profile audit and import

All 572 exported map manifests and their chunk hashes were checked. The result is recorded in `.runtime/reports/national-map-object-bank-import-2026-10-02.json`.

| Measure | Result |
|---|---:|
| Maps with at least one supported secondary object bank | 519 |
| Front-layer references in areas 1–6 | 1,298,797 |
| Unique requested frames across `Objects2`–`Objects7` | 45,200 |
| Frames exported from the installed 2003 libraries | 44,487 |
| Out-of-range `Objects3` frame indices | 713 |
| References asking for absent `Objects8`–`Objects15` libraries | 85,176 |

The 713 `Objects3` indices are above the locked native `Objects3` frame count (9,229); they are not image rows omitted by the exporter. The ShandaMir2 reference `Objects3.Lib` checked on 2026-10-02 also has 9,229 frames (21,215,660 bytes; SHA-256 `9915e630aa93facd0096f8cefe18e74db6366054fd6ae5ae85b271f53f0dd901`), so it cannot supply these numbers. Under the original client's WIL bounds behavior, those requests return nil.

The six source pairs are pinned in `content/classic-176/active-asset-sources.json` and `scripts/import-national-map-object-banks.py`. Output manifests retain WIL/WIX hashes, source frame numbers, PNG hashes, and signed frame offsets. The importer verifies the exported-chunk SHA-256, validates the merged object dependency set against `map.json`, preserves old files, and leaves unavailable frames explicit. `--apply` refuses to write if map manifests or chunks fail validation.

## Verification and remaining limits

The focused checks passed: object-bank importer tests, active-source contract tests, map resolver tests, real-Pixi map-source tests, map-loading tests, GA0 sentinel tests, and TypeScript `--noEmit`. The original 2003 installation still has no `Objects8`–`Objects15` source files, and `Objects3` lacks 713 referenced indices. To address the most common missing foregrounds without mislabeling their provenance, a separate candidate import now uses the five matching bank files listed in the [ShandaMir2 Crystal resource directory](https://mirfiles.com/resources/mir2/crystal/patch/Data/Map/ShandaMir2/). This community reference source is not proven to be the historical client paired with these exported server maps.

The isolated object-bank candidate import covers 18 exact map IDs and source hashes with 34 map/bank bindings. It exports 10,735 unique requested indices from `Objects8`, `Objects9`, `Objects10`, `Objects13`, and `Objects14`: 10,724 decoded images and 11 source-declared empty frames. A second import covers `Tiles.Lib` for 19 exact map IDs: it selects 63 unique frames only where the active national `Tiles.wil` has a missing frame or a 1×1 placeholder, and records 91 other map/index occurrences for which the candidate package also has no usable tile. Map 63's 36 major ground holes are included. Its existing full-size national tiles stay authoritative. Source-file SHA-256, byte length, Crystal-v2 frame count, and every exported PNG hash are recorded. Candidate images live under `assets/web/libraries/reference-map-candidates/`; no national WIL-derived library is changed. Browser resolution also requires the map ID, raw map SHA-256, layer, bank, and exact frame index to match the generated map-object or map-tile contract. It reports mismatches as missing or retains the locked national frame and never falls back to a neighboring frame.

This fills the source-image holes for the selected custom-map versions as a visibly separate, unverified candidate layer. The all-layer offline composition `.runtime/reports/map-extension-candidates-2026-10-02/map-63-150-200-full-layers.png` now has continuous cave ground where the earlier object-only preview had black. `mapVersionPairingVerified` remains `false`: the server map hashes establish which exported map bytes selected each frame, but do not prove that the ShandaMir2 library set is the original art paired with those maps. The importer, manifest validator, resolver, and real-Pixi map-load tests cover the bindings and fallback boundary. National WIL `ImageCount` out-of-range references now follow the original client's nil result across all locked native map libraries, while exact GA0 candidates still take precedence and in-range missing frames remain unresolved. The 91 tile references for which neither national nor candidate source provides a real tile remain open. Native-client and live-browser screenshot parity also remain open.

## Full-map effective source audit · 2026-10-02

The 572 exported maps contain 4,215,717 background-tile references, 33,133 middle-layer references and 1,952,842 animated/static foreground frame references. Reclassifying against the actual resolver rules (native identity, exact map-hash candidates, then original WIL out-of-range nil) yields:

| Layer | Native image | Exact candidate image | Explicit or source nil | Still unresolved |
|---|---:|---:|---:|---:|
| Background tiles | 4,033,387 | 181,336 | 903 | 91 |
| Middle layer | 31,636 | 0 | 1,497 | 0 |
| Foreground | 1,864,521 | 85,152 | 3,169 | 0 |

The background candidate total includes 408 GA0 references from its existing contract and 180,928 exact map-tile candidate references. The 903 source-nil background frames, 1,463 middle frames and 3,145 foreground frames exceed their locked native library counts. The other nil totals are 34 already-reviewed GA0 middle references and 24 source-declared empty foreground frames. The remaining 91 background references span 23 map IDs but reduce to nine frame indices (`9, 14, 19, 24, 39, 434, 444, 445, 1941`); each is 1×1 in the locked national WIL and empty (0×0) in the ShandaMir2 candidate library. No neighbor tile or alternate index is substituted. The composition check for map 63 remains an offline image, not a browser/native screenshot comparison.

There is no native-client screenshot comparison for this batch. Source/runtime screenshot parity remains open in ART-005/006/051.
