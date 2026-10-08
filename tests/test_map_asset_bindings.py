"""Real tiny MAP/WIL/Crystal/PNG fixtures for explicit GA0 source selection."""
import copy
import gzip
import hashlib
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import map_asset_bindings as bindings
from crystal_lib import CrystalLibrary, png_rgba
from map_tool import CELL
from wil_lib import WeMadeLibrary


class MapAssetBindingsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.contract = copy.deepcopy(json.loads((ROOT / "content/classic-176/map-asset-bindings.json").read_text(encoding="utf-8")))
        self.row = self.contract["bindings"][0]
        self.row.update(status="enabled", indices=[10320, 10321], preserveNativeIndices=[9, 14])
        def write(relative, data):
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            return path
        self.write = write
        header = bytearray(52)
        struct.pack_into("<HH", header, 0, 2, 2)
        cells = b"".join(CELL.pack(index + 1, 1 if number == 0 else 0, 1 if number == 0 else 0,
                                  0, 0, 0x83 if number == 0 else 0, 2, 0, 0)
                         for number, index in enumerate((9, 14, 10320, 10321)))
        raw = bytes(header) + cells
        self.map_source = write("vendor/mirserver-data/Mir200/Map/GA0.map", raw)
        self.row.update(mapSourcePath=self.map_source.relative_to(self.root).as_posix(), mapSourceBytes=len(raw),
            mapSourceSha256=hashlib.sha256(raw).hexdigest(),
            mapSourceGitBlob=hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest())
        self.chunk = write("assets/web/maps/GA0/fixture.bin", cells)
        self.manifest = dict(schemaVersion=1, id="GA0", sourceSha256=self.row["mapSourceSha256"], format="classic-12",
            cellOrder="column-major", cellBytes=12, width=2, height=2, trailingBytes=0,
            chunks=[dict(x=0, y=0, width=2, height=2, file="fixture.bin", bytes=len(cells), sha256=hashlib.sha256(cells).hexdigest())],
            dependencies={"Tiles": [9, 14, 10320, 10321], "SmTiles": [0], "Objects": [0, 1, 2]})
        self.lock_json("mapManifest", "assets/web/maps/GA0/map.json", self.manifest)

        wil_header = bytearray(56)
        wil_header[:36] = b"#ILIB v1.0-WEMADE Entertainment inc."
        struct.pack_into("<ii", wil_header, 48, 256, 1024)
        palette = bytearray(1024); palette[4:8] = bytes((0, 0, 128, 0))
        wil = write("Data/Tiles.wil", bytes(wil_header) + palette + struct.pack("<hhhh", 1, 1, 0, 0) + b"\1")
        offsets = [0] * 7910; offsets[9] = offsets[14] = 1080
        wix = write("Data/Tiles.WIX", bytes(48) + struct.pack("<7910i", *offsets))
        source_sha, index_sha = self.record(wil)["sha256"], self.record(wix)["sha256"]
        self.row.update(nativeSourceSha256=source_sha, nativeIndexSha256=index_sha, nativeSourceFrameCount=7910)
        native_reader = WeMadeLibrary(wil, wix)
        native_frames = {}
        for index in (9, 14):
            frame = native_reader.frame(index)
            png = png_rgba(frame["width"], frame["height"], frame["pixels"])
            filename = f"{index}.png"; write("assets/web/libraries/Tiles/" + filename, png)
            native_frames[str(index)] = {key: value for key, value in frame.items() if key != "pixels"}
            # Deliberately retain the older native export's optional-source-fields
            # shape. Actual locked raw decode, index, geometry and PNG prove it.
            native_frames[str(index)].update(file=filename, sha256=hashlib.sha256(png).hexdigest())
        self.native = dict(schemaVersion=1, format="wil-classic", sourceSha256=source_sha,
                           indexSha256=index_sha, sourceFrameCount=7910, frames=native_frames, empty=[])
        self.lock_json("nativeManifest", "assets/web/libraries/Tiles/library.json", self.native)
        self.active = dict(roots=dict(repository=".", nationalData=str(self.root / "Data")), assets=[dict(
            id="national:map:Tiles", role="active_required", namespace="/libraries/Tiles", provenance="native_pixels",
            sourceFiles=[dict(root="nationalData", path=path.name, purpose=purpose, **{key: value for key, value in self.record(path).items() if key != "path"}) for path, purpose in ((wil, "data"), (wix, "index"))],
            library=dict(sourceFrameCount=7910, manifests=["assets/web/libraries/Tiles/library.json"]))])
        self.json_file("content/classic-176/active-asset-sources.json", self.active)

        pixels = bytes((3, 2, 1, 255, 0, 0, 0, 0))
        packed = gzip.compress(pixels, mtime=0)
        image = struct.pack("<hhhhhhBi", 2, 1, -3, 4, 0, 0, 0, len(packed)) + packed
        table = [0] * 31775; table[10320] = table[10321] = 8 + 31775 * 4
        source = write(".runtime/staging/candidate-maps/Tiles.Lib", struct.pack("<ii", 2, 31775) + struct.pack("<31775i", *table) + image)
        self.row.update(sourceSha256=self.record(source)["sha256"], sourceFrameCount=31775,
                        candidateSource=dict(path=source.relative_to(self.root).as_posix(), bytes=source.stat().st_size))
        self.source = source
        self.upstream = dict(file="Tiles.Lib", url="https://example.invalid/locked/Tiles.Lib", bytes=source.stat().st_size, sha256=self.row["sourceSha256"])
        self.json_file("content/classic-176/asset-sources.json", dict(files=[self.upstream]))
        self.row["upstreamLock"] = dict(path="content/classic-176/asset-sources.json", section="files", file="Tiles.Lib")
        reader = CrystalLibrary(source.read_bytes()); frames = {}
        for index in (10320, 10321):
            frame = reader.frame(index); png = png_rgba(frame["width"], frame["height"], frame["pixels"])
            filename = f"{index}.png"; write("assets/web/libraries/reference-ga0/Tiles/" + filename, png)
            frames[str(index)] = {key: value for key, value in frame.items() if key != "pixels"}
            frames[str(index)].update(sourceIndex=index, sourceSha256=self.row["sourceSha256"], pixelSha256=hashlib.sha256(frame["pixels"]).hexdigest(), file=filename, sha256=hashlib.sha256(png).hexdigest())
        self.candidate = dict(schemaVersion=1, format="crystal-lib-v2", sourceSha256=self.row["sourceSha256"], sourceFrameCount=31775,
            candidateId=self.row["sourceId"], role="reference_candidate", provenance="reference_source", frames=frames,
            empty=[], missing=[], mapBindingActive=False, mapVersionPairingVerified=False)
        self.lock_json("candidateManifest", "assets/web/libraries/reference-ga0/Tiles/library.json", self.candidate)
        self.registry = dict(id=self.row["sourceId"], role="reference_candidate", provenance="reference_source", namespace=self.row["namespace"],
            sourceFrameCount=31775, source=self.upstream, map=dict(id="GA0", sha256=self.row["mapSourceSha256"], originalIndices=[10320, 10321]),
            mapBindingActive=False, mapVersionPairingVerified=False)
        self.lock_json("candidateRegistry", "content/classic-176/ga0-tiles-candidate.json", self.registry)
        self.pairing = dict(mapId="GA0", mapVersionPairingVerified=False, targetMap=dict(bytes=len(raw), sha256=self.row["mapSourceSha256"],
            gitBlob=self.row["mapSourceGitBlob"], submoduleCommit=self.row["mapSourceCommit"]))
        self.lock_json("pairingEvidence", ".runtime/reports/pairing.json", self.pairing)
        export = dict(candidateId=self.row["sourceId"], source=self.upstream, sourceFrameCount=31775, frames=2,
                      namespace=self.row["namespace"], mapBindingActive=False, mapVersionPairingVerified=False)
        self.lock_json("exportEvidence", ".runtime/reports/export.json", export)

    def record(self, path):
        raw = path.read_bytes()
        return dict(path=path.relative_to(self.root).as_posix(), bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())

    def json_file(self, relative, value):
        return self.write(relative, (json.dumps(value, indent=2) + "\n").encode())

    def lock_json(self, key, relative, value):
        self.row[key] = self.record(self.json_file(relative, value))

    def audit(self):
        return bindings.audit_bindings(self.contract, root=self.root)

    def rejected(self, reason=None):
        report = self.audit()
        self.assertFalse(report["technicalOk"], report)
        self.assertFalse(report["complete"])
        if report["entries"]:
            self.assertFalse(report["entries"][0]["selectionActive"])
            self.assertEqual(report["entries"][0]["renderIndices"], [])
            if reason:
                self.assertIn(reason, [entry["reason"] for entry in report["entries"][0]["failures"]])
        return report

    def test_enabled_source_reads_real_bytes_without_rewriting_files_or_pairing(self):
        before = {str(path): path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        report = self.audit(); row = report["entries"][0]
        self.assertTrue(report["technicalOk"], report["failures"])
        self.assertTrue(row["selectionActive"])
        self.assertEqual(row["nativeMissingIndices"], [10320, 10321])
        self.assertEqual(row["renderIndices"], [10320, 10321])
        self.assertEqual(row["checkedPngFrames"], 2)
        self.assertEqual(row["checkedNativePreservedFrames"], 2)
        self.assertEqual(row["chunks"][0]["dependencies"]["Objects"], [0, 1, 2])
        self.assertFalse(report["complete"])
        self.assertTrue(report["historicalFailures"])
        self.assertEqual(before, {str(path): path.read_bytes() for path in self.root.rglob("*") if path.is_file()})

    def test_pending_still_audits_pixels_but_selects_no_override(self):
        self.row["status"] = "pending"
        report = self.audit(); self.assertTrue(report["technicalOk"])
        self.assertFalse(report["entries"][0]["selectionActive"])
        self.assertEqual(report["entries"][0]["renderIndices"], [])
        self.assertFalse(report["complete"])
        self.assertFalse(self.registry["mapBindingActive"])
        self.assertFalse(self.candidate["mapBindingActive"])

    def test_resolver_requires_exact_map_source_layer_library_and_original_index(self):
        report = self.audit()
        request = dict(map_id="GA0", map_source_sha256=self.row["mapSourceSha256"], layer="background", library="Tiles", index=10320)
        resolved = bindings.resolve_bound_frame(report, **request)
        self.assertEqual(resolved["url"], "/libraries/reference-ga0/Tiles/10320.png")
        self.assertEqual(resolved["frame"]["offsetX"], -3)
        self.assertFalse(resolved["pairingVerified"])
        for changes in (dict(map_id="0"), dict(map_source_sha256="a" * 64), dict(layer="middle"), dict(layer="front"), dict(library="Objects"), dict(index=9), dict(index=14), dict(index=10322), dict(index=True)):
            with self.subTest(changes=changes):
                self.assertIsNone(bindings.resolve_bound_frame(report, **{**request, **changes}))

    def test_contract_rejects_global_other_map_namespace_and_false_pairing(self):
        for changes in (dict(mapId="0"), dict(layer="front"), dict(namespace="/libraries/Tiles"), dict(selectionEvidence="native_pixels"), dict(mapVersionPairingVerified=True), dict(status="automatic"), dict(indices=[10320, 10320])):
            with self.subTest(changes=changes):
                contract = copy.deepcopy(self.contract);contract["bindings"][0].update(changes)
                self.assertTrue(bindings.audit_bindings(contract, root=self.root)["contractErrors"])

    def test_selected_missing_set_cannot_be_reduced(self):
        self.row["indices"] = [10320]
        self.rejected("exact_missing_or_preserved_index_set_mismatch")

    def test_native_placeholder_cannot_be_overridden_or_removed_from_preserve(self):
        self.row["indices"] = [9, 10320, 10321]
        self.assertTrue(self.rejected()["contractErrors"])
        self.row["indices"] = [10320, 10321];self.row["preserveNativeIndices"] = [9]
        self.assertTrue(self.rejected()["contractErrors"])

    def test_chunk_sha_metadata_cannot_hide_changed_original_cell_bytes(self):
        raw = bytearray(self.chunk.read_bytes());struct.pack_into("<H", raw, 24, 10322)
        self.chunk.write_bytes(raw)
        self.manifest["chunks"][0]["sha256"] = hashlib.sha256(raw).hexdigest()
        self.lock_json("mapManifest", "assets/web/maps/GA0/map.json", self.manifest)
        self.rejected("chunk_cells_differ_from_original_map_or_missing")

    def test_manifest_dependency_summary_cannot_drop_actual_animation_range(self):
        self.manifest["dependencies"]["Objects"] = [0]
        self.lock_json("mapManifest", "assets/web/maps/GA0/map.json", self.manifest)
        self.rejected("chunk_derived_dependencies_mismatch")

    def test_chunk_animation_change_cannot_extend_unlocked_range(self):
        raw = bytearray(self.chunk.read_bytes());raw[8] = 0x84
        self.chunk.write_bytes(raw);self.manifest["chunks"][0]["sha256"] = hashlib.sha256(raw).hexdigest()
        self.lock_json("mapManifest", "assets/web/maps/GA0/map.json", self.manifest)
        self.rejected("chunk_derived_dependencies_mismatch")

    def test_overlap_truncation_and_missing_chunk_all_fail(self):
        original = copy.deepcopy(self.manifest)
        for chunks in ([original["chunks"][0], original["chunks"][0]],
                       [{**original["chunks"][0], "width": 1}],
                       [{**original["chunks"][0], "file": "missing.bin"}]):
            with self.subTest(chunks=chunks):
                self.manifest = {**original, "chunks": chunks}
                self.lock_json("mapManifest", "assets/web/maps/GA0/map.json", self.manifest)
                self.rejected("binding_resource_invalid")

    def test_candidate_source_identity_cannot_be_self_certified_by_export_hash(self):
        self.source.write_bytes(self.source.read_bytes() + b"changed")
        self.rejected("binding_resource_invalid")

    def test_independent_upstream_lock_mismatch_fails_even_with_valid_candidate(self):
        self.upstream = {**self.upstream, "sha256": "0" * 64}
        self.json_file("content/classic-176/asset-sources.json", dict(files=[self.upstream]))
        self.rejected("candidate_upstream_lock_mismatch")

    def test_registry_source_identity_must_match_selected_source(self):
        self.registry["sourceFrameCount"] = 31776
        self.lock_json("candidateRegistry", "content/classic-176/ga0-tiles-candidate.json", self.registry)
        self.rejected("candidate_registry_identity")

    def test_candidate_original_index_source_and_geometry_metadata_are_independent(self):
        baseline = copy.deepcopy(self.candidate)
        for changes, reason in ((dict(sourceIndex=10321), "candidate_original_index_or_pixel_identity"),
                                (dict(sourceSha256="0" * 64), "candidate_original_index_or_pixel_identity"),
                                (dict(offsetY=-4), "candidate_signed_geometry_or_shadow_mismatch")):
            with self.subTest(changes=changes):
                self.candidate = copy.deepcopy(baseline);self.candidate["frames"]["10320"].update(changes)
                self.lock_json("candidateManifest", "assets/web/libraries/reference-ga0/Tiles/library.json", self.candidate)
                self.rejected(reason)

    def test_png_self_reported_hash_does_not_hide_rgba_alpha_pixel_change(self):
        frame = self.candidate["frames"]["10320"]
        raw = png_rgba(2, 1, bytes((3, 2, 1, 0, 0, 0, 0, 0)))
        self.write("assets/web/libraries/reference-ga0/Tiles/10320.png", raw)
        frame["sha256"] = hashlib.sha256(raw).hexdigest()
        self.lock_json("candidateManifest", "assets/web/libraries/reference-ga0/Tiles/library.json", self.candidate)
        self.rejected("candidate_png_bytes_or_decoded_pixels_mismatch")

    def test_native_placeholder_transparency_change_is_not_reference_fallback(self):
        raw = png_rgba(1, 1, bytes(4));self.write("assets/web/libraries/Tiles/9.png", raw)
        self.native["frames"]["9"]["sha256"] = hashlib.sha256(raw).hexdigest()
        self.lock_json("nativeManifest", "assets/web/libraries/Tiles/library.json", self.native)
        self.rejected("preserved_native_png_bytes_or_pixels_mismatch")

    def test_path_escape_and_missing_independent_native_source_fail_closed(self):
        contract = copy.deepcopy(self.contract);contract["bindings"][0]["candidateManifest"]["path"] = "../other/library.json"
        self.assertTrue(bindings.audit_bindings(contract, root=self.root)["contractErrors"])
        (self.root / "Data/Tiles.WIX").unlink();self.rejected("binding_resource_invalid")

    def test_failed_audit_cannot_resolve_a_selected_frame(self):
        self.row["nativeSourceSha256"] = "0" * 64
        report = self.rejected("native_independent_contract_identity")
        self.assertIsNone(bindings.resolve_bound_frame(report, map_id="GA0", map_source_sha256=self.row["mapSourceSha256"], layer="background", library="Tiles", index=10320))

    def test_historical_report_false_upgrade_cannot_make_complete(self):
        self.pairing["mapVersionPairingVerified"] = True
        self.lock_json("pairingEvidence", ".runtime/reports/pairing.json", self.pairing)
        report = self.rejected("pairing_evidence_identity_or_false_upgrade")
        self.assertTrue(report["historicalFailures"])


if __name__ == "__main__":
    unittest.main()
