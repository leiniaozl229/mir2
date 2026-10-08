import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from wil_lib import WeMadeLibrary, export

spec = importlib.util.spec_from_file_location("national_melee_import", ROOT / "scripts/import-national-melee-assets.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
CONFIG = json.loads((ROOT / "content/classic-176/melee-visual.json").read_text(encoding="utf-8"))


def fixture(root, export_assets=True):
    source_dir, output = root / "source", root / "assets"
    source_dir.mkdir()
    header = bytearray(56)
    header[:36] = b"#ILIB v1.0-WEMADE Entertainment inc."
    struct.pack_into("<i", header, 44, 4010)
    struct.pack_into("<i", header, 48, 256)
    struct.pack_into("<i", header, 52, 1024)
    palette = bytearray(1024)
    palette[4:12] = bytes((10, 80, 140, 0, 200, 90, 20, 0))
    data = header + palette
    offsets = [0] * 4010
    for number in [0, *module.INDICES]:
        offsets[number] = len(data)
        data += struct.pack("<hhhh", 2, 2, -3 + number % 5, -12) + bytes((1, 0, 2, 1))
    index = bytearray(48)
    index[:36] = b"#INDX v1.0-WEMADE Entertainment inc."
    struct.pack_into("<i", index, 44, 4010)
    index += struct.pack("<4010i", *offsets)
    source = source_dir / "Magic.wil"
    source.write_bytes(data)
    (source_dir / "Magic.wix").write_bytes(index)
    locks = {"sourceSha256": hashlib.sha256(data).hexdigest(), "indexSha256": hashlib.sha256(index).hexdigest()}
    manifest = export(source, output, indices=[0, *module.INDICES])
    manifest["customProvenance"] = {"preserve": True}
    (output / "library.json").write_text(json.dumps(manifest), encoding="utf-8")
    contract = copy.deepcopy(CONFIG)
    contract["evidence"].update(locks)
    contract["frames"] = {str(number): manifest["frames"][str(number)] for number in module.INDICES}
    if not export_assets:
        # Only this synthetic temp fixture is removed, never native/repo assets.
        for file in output.iterdir():
            file.unlink()
        output.rmdir()
    return source_dir, output, contract, locks


class NationalMeleeImportTests(unittest.TestCase):
    def test_exact_192_original_indices_geometry_and_png_alpha(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, out, contract, locks = fixture(Path(temporary))
            report = module.inspect(source, out, contract, locks=locks)
            self.assertTrue(report["complete"])
            self.assertEqual((report["requested"], report["matched"], report["repaired"]), (192, 192, 0))
            self.assertTrue(all(item["byteEqual"] and item["geometryEqual"] for item in report["frames"]))
            self.assertEqual(set(item["index"] for item in report["frames"]), set(module.INDICES))

    def test_default_check_missing_assets_never_creates_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, out, contract, locks = fixture(Path(temporary), export_assets=False)
            report = module.inspect(source, out, contract, locks=locks)
            self.assertFalse(report["complete"])
            self.assertEqual(report["matched"], 0)
            self.assertFalse(out.exists())

    def test_apply_repairs_png_and_geometry_and_preserves_unrelated_indices(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, out, contract, locks = fixture(Path(temporary))
            manifest = json.loads((out / "library.json").read_text())
            old_extra = copy.deepcopy(manifest["frames"]["0"])
            extra_png = (out / old_extra["file"]).read_bytes()
            damaged = manifest["frames"]["800"]
            (out / damaged["file"]).write_bytes(b"bad-png")
            manifest["frames"]["1410"]["offsetX"] += 1
            (out / "library.json").write_text(json.dumps(manifest))
            before = (out / "library.json").read_bytes()
            check = module.inspect(source, out, contract, locks=locks)
            self.assertEqual((check["matched"], len(check["issuesBeforeApply"])), (190, 2))
            self.assertEqual((out / "library.json").read_bytes(), before)
            applied = module.inspect(source, out, contract, locks=locks, apply=True)
            self.assertTrue(applied["complete"])
            self.assertEqual(applied["repairedIndices"], [800, 1410])
            current = json.loads((out / "library.json").read_text())
            self.assertEqual(current["frames"]["0"], old_extra)
            self.assertEqual(current["customProvenance"], {"preserve": True})
            self.assertEqual((out / old_extra["file"]).read_bytes(), extra_png)
            repeated = module.inspect(source, out, contract, locks=locks, apply=True)
            self.assertEqual(repeated["repaired"], 0)

    def test_locked_source_and_existing_manifest_wrong_version_fail_before_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, out, contract, locks = fixture(Path(temporary))
            before = {p.name: p.read_bytes() for p in out.iterdir()}
            original = (source / "Magic.wil").read_bytes()
            (source / "Magic.wil").write_bytes(original + b"wrong-release")
            with self.assertRaisesRegex(ValueError, "source version mismatch"):
                module.inspect(source, out, contract, locks=locks, apply=True)
            self.assertEqual({p.name: p.read_bytes() for p in out.iterdir()}, before)
            (source / "Magic.wil").write_bytes(original)
            manifest = json.loads(before["library.json"])
            manifest["indexSha256"] = "wrong"
            (out / "library.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "another source"):
                module.inspect(source, out, contract, locks=locks, apply=True)
            self.assertEqual((out / contract["frames"]["800"]["file"]).read_bytes(), before[contract["frames"]["800"]["file"]])

    def test_contract_mutation_mapping_path_and_geometry_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, out, contract, locks = fixture(Path(temporary))
            before = {p.name: p.read_bytes() for p in out.iterdir()}
            for mutate, message in [
                (lambda c: c["specials"]["fire"].update(base=3390), "mapping"),
                (lambda c: c["bodyAction"].update(count=5), "body"),
                (lambda c: c["frames"]["800"].update(file="../escaped.png"), "unsafe"),
                (lambda c: c["frames"]["800"].update(offsetY=123), "decoded frame"),
            ]:
                bad = copy.deepcopy(contract)
                mutate(bad)
                with self.assertRaisesRegex(ValueError, message):
                    module.inspect(source, out, bad, locks=locks, apply=True)
                self.assertEqual({p.name: p.read_bytes() for p in out.iterdir()}, before)

    def test_required_empty_original_frame_refuses_full_apply(self):
        with tempfile.TemporaryDirectory() as temporary:
            source, out, contract, locks = fixture(Path(temporary))
            index = bytearray((source / "Magic.wix").read_bytes())
            struct.pack_into("<i", index, 48 + 800 * 4, 0)
            (source / "Magic.wix").write_bytes(index)
            locks = {**locks, "indexSha256": hashlib.sha256(index).hexdigest()}
            contract["evidence"].update(locks)
            (out / "library.json").unlink()
            before = {p.name: p.read_bytes() for p in out.iterdir()}
            with self.assertRaisesRegex(ValueError, "empty"):
                module.inspect(source, out, contract, locks=locks, apply=True)
            self.assertEqual({p.name: p.read_bytes() for p in out.iterdir()}, before)

    def test_actual_locked_native_pair_matches_192_exported_frames_when_present(self):
        native = Path("C:/Program Files (x86)/shanda/Legend of Mir/Data")
        exported = ROOT / "assets/web/effects/Magic"
        if not native.exists() or not exported.exists():
            self.skipTest("actual installed locked release is unavailable")
        report = module.inspect(native, exported, CONFIG)
        self.assertTrue(report["complete"])
        self.assertEqual(report["matched"], 192)
        self.assertEqual(report["repaired"], 0)


if __name__ == "__main__":
    unittest.main()
