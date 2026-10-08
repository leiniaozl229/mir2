"""Exercise production source auditing with real tiny WIL/WIX/PNG fixtures."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("active_asset_audit", ROOT / "tools/content_audit.py")
audit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audit)
decoder = audit.load_tool("wil_lib")


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


class ActiveAssetSourcesTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.root_patch = patch.object(audit, "ROOT", self.root)
        self.tool_patch = patch.object(audit, "load_tool", return_value=decoder)
        self.root_patch.start()
        self.tool_patch.start()
        self.addCleanup(self.tool_patch.stop)
        self.addCleanup(self.root_patch.stop)
        self.addCleanup(self.temporary.cleanup)
        self.data = self.root / "Data"
        self.data.mkdir()
        header = bytearray(56)
        header[:36] = b"#ILIB v1.0-WEMADE Entertainment inc."
        struct.pack_into("<i", header, 48, 256)
        struct.pack_into("<i", header, 52, 1024)
        palette = bytearray(1024)
        palette[4:8] = bytes((0, 0, 128, 0))
        pixels = struct.pack("<hhhh", 2, 2, -3, 4) + bytes((1, 1, 0, 0))
        (self.data / "Fixture.wil").write_bytes(header + palette + pixels)
        (self.data / "Fixture.wix").write_bytes(bytes(48) + struct.pack("<ii", 1080, 0))
        self.directory = self.root / "assets/web/actors/Fixture"
        self.manifest = decoder.export(self.data / "Fixture.wil", self.directory)
        sources = [{"root": "nationalData", "path": "Fixture." + ext, "purpose": purpose,
            "bytes": (self.data / ("Fixture." + ext)).stat().st_size,
            "sha256": hashlib.sha256((self.data / ("Fixture." + ext)).read_bytes()).hexdigest()}
            for ext, purpose in (("wil", "data"), ("wix", "index"))]
        self.asset = dict(id="national:test", role="active_required", provenance="native_pixels",
            version="fixture", namespace="/actors/Fixture", category="actor", kind="library",
            sourceFiles=sources, library=dict(manifests=["assets/web/actors/Fixture/library.json"],
                format="wil-classic", sourceFrameCount=2, coverage="all_source"))
        self.contract = dict(schemaVersion=1, id="fixture", targetVersion="fixture", scope="Unit fixture",
            roots=dict(repository=".", nationalData=str(self.data)), assets=[self.asset])

    def run_audit(self):
        return audit.active_source_status(self.contract)

    def save_manifest(self):
        write_json(self.directory / "library.json", self.manifest)

    def reasons(self, report):
        entries = report.get("entries", [])
        return [failure["reason"] for row in entries for failure in row["failures"]] + [
            failure["reason"] for row in entries for lib in row["libraries"] for failure in lib["failures"]]

    def test_real_pair_geometry_empty_and_export_hashes_are_validated(self):
        report = self.run_audit()
        self.assertTrue(report["ok"], report)
        self.assertEqual(report["sourceLocks"]["actor"]["locked"], 2)
        self.assertEqual(report["libraries"]["actor"][0]["empty"], [1])
        self.assertTrue(all(row["hashChecked"] for row in report["entries"][0]["sources"]))

    def test_optional_candidate_missing_does_not_replace_or_fail_active_source(self):
        candidate = dict(id="candidate", role="reference_candidate", provenance="reference_source",
            version="crystal-reference", namespace="candidate/Fixture.Lib", category="actor", kind="file",
            sourceFiles=[dict(root="repository", path="assets/raw/Fixture.Lib", purpose="identity",
                bytes=1, sha256="a" * 64)], exports=[])
        self.contract["assets"].append(candidate)
        report = self.run_audit()
        self.assertTrue(report["ok"])
        self.assertFalse(report["referenceCandidates"][0]["ok"])
        (self.data / "Fixture.wil").unlink()
        report = self.run_audit()
        self.assertFalse(report["ok"])
        self.assertIn("source_missing", self.reasons(report))

    def test_same_size_native_mutation_fails_without_optional_hash_flag(self):
        path = self.data / "Fixture.wil"
        data = bytearray(path.read_bytes()); data[-1] ^= 1; path.write_bytes(data)
        report = self.run_audit()
        self.assertFalse(report["ok"])
        self.assertIn("source_lock_mismatch", self.reasons(report))

    def test_missing_index_source_never_falls_back_to_manifest_hash(self):
        (self.data / "Fixture.wix").unlink()
        report = self.run_audit()
        self.assertFalse(report["ok"])
        self.assertIn("source_missing", self.reasons(report))

    def test_export_source_hash_and_frame_count_are_independent_gates(self):
        self.manifest["sourceSha256"] = "b" * 64
        self.manifest["sourceFrameCount"] = 3
        self.save_manifest()
        report = self.run_audit()
        self.assertFalse(report["ok"])
        self.assertIn("library_source_hash", self.reasons(report))
        self.assertIn("library_schema_format_frame_count", self.reasons(report))

    def test_missing_png_and_color_only_tampering_fail(self):
        frame = self.manifest["frames"]["0"]
        path = self.directory / frame["file"]
        original = path.read_bytes()
        path.unlink()
        self.assertIn("frame_exports", self.reasons(self.run_audit()))
        path.write_bytes(original[:-1] + bytes([original[-1] ^ 1]))
        report = self.run_audit()
        self.assertFalse(report["ok"])
        exports = report["entries"][0]["libraries"][0]["failures"][-1]["entries"]
        self.assertIn("export_hash_mismatch", [value["reason"] for value in exports])

    def test_signed_offset_and_source_index_are_checked_against_native(self):
        self.manifest["frames"]["0"]["offsetX"] = 3
        self.manifest["frames"]["0"]["index"] = 1
        self.save_manifest()
        report = self.run_audit()
        failures = report["entries"][0]["libraries"][0]["failures"]
        entries = next(value["entries"] for value in failures if value["reason"] == "frame_geometry")
        self.assertEqual({value["reason"] for value in entries}, {"source_index_mismatch", "native_geometry_mismatch"})

    def test_source_frame_cannot_be_reclassified_as_empty(self):
        self.manifest["empty"] = [0, 1]
        self.manifest["frames"] = {}
        self.save_manifest()
        report = self.run_audit()
        self.assertFalse(report["ok"])
        self.assertIn("frame_geometry", self.reasons(report))

    def test_out_of_range_empty_is_a_real_gap_in_partial_map_library(self):
        self.asset["library"]["coverage"] = "map_dependencies"
        self.manifest["empty"].append(10320)
        self.manifest["missing"] = [10321]
        self.save_manifest()
        report = self.run_audit()
        self.assertFalse(report["ok"])
        self.assertIn("library_index_identity", self.reasons(report))
        self.assertIn("declared_missing_frames", self.reasons(report))

    def test_full_export_missing_index_stays_incomplete(self):
        self.manifest["empty"] = []
        self.save_manifest()
        report = self.run_audit()
        self.assertFalse(report["ok"])
        self.assertIn("source_frames_not_exported", self.reasons(report))

    def test_manifest_cannot_claim_another_active_namespace(self):
        self.asset["namespace"] = "/items/Items"
        report = self.run_audit()
        self.assertTrue(any("namespace mismatch" in error for error in report["contractErrors"]))
        self.assertEqual(report["entries"], [])

    def test_source_and_export_paths_cannot_escape(self):
        self.asset["sourceFiles"][0]["path"] = "../Fixture.wil"
        self.assertTrue(self.run_audit()["contractErrors"])
        self.asset["sourceFiles"][0]["path"] = "Fixture.wil"
        self.manifest["frames"]["0"]["file"] = "../escape.png"
        self.save_manifest()
        self.assertIn("library_invalid", self.reasons(self.run_audit()))

    def test_profile_binding_catches_independent_contract_drift(self):
        self.asset["contractBinding"] = dict(path="content/locks.json", key="sourceFamilies.Fixture")
        write_json(self.root / "content/locks.json", {"sourceFamilies": {"Fixture": dict(
            sourceSha256="c" * 64, indexSha256=self.asset["sourceFiles"][1]["sha256"], frameCount=2)}})
        self.assertIn("source_contract_mismatch", self.reasons(self.run_audit()))

    def test_unconverted_cursor_is_bound_to_independent_upstream_lock(self):
        filename = "Cursor.CUR"
        source = self.root / "assets/web/ui/Cursors" / filename
        source.parent.mkdir(parents=True)
        source.write_bytes(struct.pack("<HHH", 0, 2, 1) + b"original-cursor")
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        cursor = dict(id="cursor", role="active_required", provenance="reference_source", version="reference",
            namespace="/ui/Cursors/" + filename, category="cursor", kind="file",
            sourceFiles=[dict(root="repository", path="assets/web/ui/Cursors/" + filename,
                purpose="identity", bytes=source.stat().st_size, sha256=digest)],
            exports=["assets/web/ui/Cursors/" + filename],
            contractBinding=dict(path="content/cursors.json", key="cursorFiles", file=filename))
        self.contract["assets"].append(cursor)
        write_json(self.root / "content/cursors.json", {"cursorFiles": [dict(file=filename, bytes=source.stat().st_size, sha256=digest)]})
        self.assertTrue(self.run_audit()["ok"])
        cursor["sourceFiles"][0]["sha256"] = "d" * 64
        source.write_bytes(b"mutated")
        self.assertIn("source_contract_mismatch", self.reasons(self.run_audit()))

    def test_audio_manifest_missing_export_identity_fails(self):
        native = self.data / "91.wav"; native.write_bytes(b"fixture WAV bytes")
        exported = self.root / "assets/web/audio/91.wav"; exported.parent.mkdir(parents=True); exported.write_bytes(native.read_bytes())
        self.contract["assets"].append(dict(id="audio", role="active_required", provenance="native_pixels",
            version="fixture", namespace="/audio/91.wav", category="audio", kind="file",
            sourceFiles=[dict(root="nationalData", path="91.wav", purpose="identity", bytes=native.stat().st_size,
                sha256=hashlib.sha256(native.read_bytes()).hexdigest())], exports=["assets/web/audio/91.wav"],
            exportManifest=dict(path="assets/web/audio/manifest.json", file="91.wav")))
        write_json(self.root / "assets/web/audio/manifest.json", [])
        self.assertIn("export_manifest_identity", self.reasons(self.run_audit()))

    def test_derived_png_is_never_treated_as_original_cursor_bytes(self):
        path = self.root / "assets/web/ui/Cursors/Cursor.CUR"
        path.parent.mkdir(parents=True)
        path.write_bytes((self.directory / self.manifest["frames"]["0"]["file"]).read_bytes())
        self.contract["assets"].append(dict(id="derived-cursor", role="active_required", provenance="reference_source",
            version="reference", namespace="/ui/Cursors/Cursor.CUR", category="cursor", kind="file",
            sourceFiles=[dict(root="repository", path="assets/web/ui/Cursors/Cursor.CUR", purpose="identity",
                bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest())],
            exports=["assets/web/ui/Cursors/Cursor.CUR"]))
        self.assertIn("cursor_is_not_original_cur_format", self.reasons(self.run_audit()))

    def test_required_root_override_is_explicit_and_stays_hash_locked(self):
        alternate = self.root / "other"; alternate.mkdir()
        report = audit.active_source_status(self.contract, source_roots={"nationalData": alternate})
        self.assertIn("source_missing", self.reasons(report))
        self.assertTrue(audit.active_source_status(self.contract, source_roots={"repository": alternate})["contractErrors"])

    def test_resource_catalog_gap_and_id_conflict_are_not_hidden_by_valid_baseline(self):
        class Catalog:
            def build(self):
                return dict(items=[dict(id=127, name="extension armour", iconIndex=869, iconUrl=None)],
                    skills=[dict(idx=38, name="poison extension", magicId=48, iconUrl=None)],
                    diagnostics=dict(duplicateMagicIds=[48]), summary=dict(itemIcons=580, skillIcons=58))
            def validate(self, data):
                return ["unusable override"]
        with patch.object(audit, "load_tool", return_value=Catalog()):
            report = audit.resource_coverage_status()
        self.assertFalse(report["ok"])
        self.assertEqual(report["duplicateMagicIds"], [48])
        self.assertEqual(len(report["missingItemIcons"]), 1)
        self.assertEqual(len(report["missingSkillIcons"]), 1)

    def test_checked_in_contract_has_pinned_sources_and_schema(self):
        contract = json.loads((ROOT / "content/classic-176/active-asset-sources.json").read_text(encoding="utf-8"))
        with patch.object(audit, "ROOT", ROOT):
            self.assertEqual(audit.validate_active_contract(contract), [])
        self.assertEqual(sum(row["kind"] == "library" for row in contract["assets"]), 45)
        self.assertEqual(sum(row["role"] == "reference_candidate" for row in contract["assets"]), 68)
        schema = json.loads((ROOT / "content/classic-176/active-asset-sources.schema.json").read_text(encoding="utf-8"))
        self.assertIn("assets", schema["required"])
        self.assertEqual(schema["properties"]["schemaVersion"]["const"], 1)

    def test_malformed_contract_fails_closed_before_reading_assets(self):
        report = audit.active_source_status([])
        self.assertTrue(report["contractErrors"])
        self.assertEqual(report["entries"], [])

    def test_map_actual_source_hash_and_outlier_dependencies_remain_failures(self):
        source = self.root / "vendor/mirserver-data/Mir200/Map/GA0.map"
        source.parent.mkdir(parents=True); source.write_bytes(b"actual MAP fixture")
        write_json(self.root / "assets/web/maps/GA0/map.json", dict(id="GA0", format="classic-12",
            sourceSha256="a" * 64, chunks=["0.bin"], dependencies=dict(Tiles=[0, 10320])))
        write_json(self.root / "assets/web/libraries/Tiles/library.json", dict(frames={"0": {}}, empty=[]))
        report = audit.map_status(["GA0"])
        self.assertEqual(report["malformed"], ["GA0"])
        self.assertEqual(report["dependencyMissing"], {"GA0": {"Tiles": [10320]}})


if __name__ == "__main__":
    unittest.main()
