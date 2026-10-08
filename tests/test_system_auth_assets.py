import copy
import importlib.util
import json
from pathlib import Path
import shutil
import struct
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("system_auth_assets", ROOT / "scripts/validate-system-auth-assets.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class SystemAuthAssetsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.seed_temp = tempfile.TemporaryDirectory()
        cls.seed = Path(cls.seed_temp.name)
        data = cls.seed / "Data"
        data.mkdir()
        wil = bytearray(56 + 256 * 4)
        wil[:11] = b"#ILIB v1.0-"
        struct.pack_into("<i", wil, 48, 256)
        struct.pack_into("<i", wil, 52, 1024)
        # Distinct BGRA colors and asymmetric top/bottom rows exercise palette
        # conversion, transparent index zero and the original bottom-up format.
        struct.pack_into("<I", wil, 56 + 4, 0x00332211)
        struct.pack_into("<I", wil, 56 + 8, 0x00665544)
        offsets = [0] * 510
        for index, (width, height) in sorted(MODULE.EXPECTED_GEOMETRY.items()):
            offsets[index] = len(wil)
            wil += struct.pack("<hhhh", width, height, 7, -44)
            wil += bytes([0]) * width + bytes([1]) * width * (height - 2) + bytes([2]) * width
        wix = bytes(48) + struct.pack("<510i", *offsets)
        (data / "Prguse.wil").write_bytes(wil)
        (data / "Prguse.WIX").write_bytes(wix)
        cls.pins = {"data": {"path": "Prguse.wil", "bytes": len(wil), "sha256": MODULE.sha(wil)},
                    "index": {"path": "Prguse.WIX", "bytes": len(wix), "sha256": MODULE.sha(wix)},
                    "sourceFrameCount": 510}
        folder = cls.seed / "assets/web/ui-national/prguse"
        folder.mkdir(parents=True)
        content = cls.seed / "content/classic-176"
        content.mkdir(parents=True)
        library = MODULE.WeMadeLibrary(data / "Prguse.wil", data / "Prguse.WIX")
        frame_locks, exported = {}, {}
        for index in MODULE.EXPECTED_GEOMETRY:
            frame = library.frame(index)
            bgra = frame.pop("pixels")
            rgba = bytearray(bgra)
            rgba[0::4], rgba[2::4] = bgra[2::4], bgra[0::4]
            png = MODULE.png_rgba(frame["width"], frame["height"], bgra)
            file = f"{index}.{MODULE.sha(png)[:16]}.png"
            (folder / file).write_bytes(png)
            exported[str(index)] = {**frame, "file": file, "sha256": MODULE.sha(png)}
            alpha = {"transparent": frame["width"], "opaque": frame["width"] * (frame["height"] - 1), "partial": 0,
                     "bbox": [0, 0, frame["width"], frame["height"] - 1]}
            frame_locks[str(index)] = {**exported[str(index)], "sourceSha256": cls.pins["data"]["sha256"],
                                      "indexSha256": cls.pins["index"]["sha256"], "provenance": "native_pixels",
                                      "pixelSha256": MODULE.sha(rgba), "bgraSha256": MODULE.sha(bgra), "alpha": alpha}
        manifest = {"sourceSha256": cls.pins["data"]["sha256"], "indexSha256": cls.pins["index"]["sha256"],
                    "sourceFrameCount": 510, "frames": exported}
        write_json(folder / "library.json", manifest)
        active = {"roots": {"nationalData": "Data"}, "assets": [{"id": "national:ui:prguse", "role": "active_required",
                  "provenance": "native_pixels", "namespace": "/ui-national/prguse",
                  "sourceFiles": [{**cls.pins[purpose], "purpose": purpose, "root": "nationalData"} for purpose in ("data", "index")],
                  "library": {"sourceFrameCount": 510}}]}
        write_json(content / "active-asset-sources.json", active)
        for path in MODULE.CONTRACTS:
            contract = MODULE.read_json(ROOT / path)
            contract["sourceSha256"] = cls.pins["data"]["sha256"]
            contract["indexSha256"] = cls.pins["index"]["sha256"]
            contract["source"].update({purpose: cls.pins[purpose] for purpose in ("data", "index")})
            contract["source"]["manifestSha256"] = MODULE.sha((folder / "library.json").read_bytes())
            for index in contract["frames"]:
                contract["frames"][index] = frame_locks[index]
            reference = contract["referenceLayout"] if contract["domain"] == "system-dialog" else contract["changePassword"]["reference"]
            reference_path = cls.seed / (contract["domain"] + "-reference.pas")
            reference_path.write_bytes(b"fixture reference source; no native runtime claim")
            reference["path"] = str(reference_path)
            reference["sha256"] = MODULE.sha(reference_path.read_bytes())
            write_json(cls.seed / path, contract)

    @classmethod
    def tearDownClass(cls):
        cls.seed_temp.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "repo"
        shutil.copytree(self.seed, self.root)

    def tearDown(self):
        self.temp.cleanup()

    def contracts(self):
        return [MODULE.read_json(self.root / path) for path in MODULE.CONTRACTS]

    def save(self, contracts):
        for path, contract in zip(MODULE.CONTRACTS, contracts):
            write_json(self.root / path, contract)

    def audit(self, **kwargs):
        return MODULE.audit(self.root, expected_source=self.pins, **kwargs)

    def test_original_wil_rebuild_preserves_16_frames_offsets_alpha_and_open_parity(self):
        report = self.audit()
        self.assertTrue(report["assetValidationPassed"])
        self.assertEqual(report["checkedFrames"], 16)
        self.assertFalse(report["complete"])
        self.assertEqual(report["nativeSameVersion"], "unknown")
        frame = report["frames"]["50"]
        self.assertEqual((frame["offsetX"], frame["offsetY"]), (7, -44))
        self.assertEqual(frame["alpha"]["transparent"], 420)
        image = MODULE.Image.open(self.root / frame["png"]).convert("RGBA")
        self.assertEqual(image.getpixel((0, 0)), (0x66, 0x55, 0x44, 255))
        self.assertEqual(image.getpixel((0, 298)), (0, 0, 0, 0))
        image.close()

    def test_original_root_is_repository_relative_and_explicit_path_is_reported(self):
        self.assertEqual(self.audit()["sourceSelection"], "active-asset-sources.roots.nationalData")
        self.assertEqual(self.audit(data_dir=self.root / "Data")["sourceSelection"], "explicit-data-dir")

    def test_wrong_explicit_source_fails_hash_without_changing_export(self):
        wrong = self.root / "WrongData"
        shutil.copytree(self.root / "Data", wrong)
        with (wrong / "Prguse.wil").open("ab") as stream:
            stream.write(b"overlay")
        before = {p.name: MODULE.sha(p.read_bytes()) for p in (self.root / "assets/web/ui-national/prguse").iterdir()}
        with self.assertRaisesRegex(ValueError, "source hash/size mismatch"):
            self.audit(data_dir=wrong)
        after = {p.name: MODULE.sha(p.read_bytes()) for p in (self.root / "assets/web/ui-national/prguse").iterdir()}
        self.assertEqual(before, after)

    def test_mutating_both_active_and_contract_source_locks_cannot_replace_pin(self):
        active_path = self.root / "content/classic-176/active-asset-sources.json"
        active = MODULE.read_json(active_path)
        active["assets"][0]["sourceFiles"][0]["sha256"] = "0" * 64
        write_json(active_path, active)
        contracts = self.contracts()
        for contract in contracts:
            contract["sourceSha256"] = "0" * 64
            contract["source"]["data"]["sha256"] = "0" * 64
        self.save(contracts)
        with self.assertRaisesRegex(ValueError, "independent pin"):
            self.audit()

    def test_rehashed_png_and_manifest_still_cannot_replace_original_pixels(self):
        contracts = self.contracts()
        locked = contracts[0]["frames"]["361"]
        path = self.root / "assets/web/ui-national/prguse" / locked["file"]
        png = MODULE.png_rgba(80, 34, bytes((1, 2, 3, 255)) * 80 * 34)
        path.write_bytes(png)
        locked["sha256"] = MODULE.sha(png)
        manifest_path = path.parent / "library.json"
        manifest = MODULE.read_json(manifest_path)
        manifest["frames"]["361"]["sha256"] = MODULE.sha(png)
        write_json(manifest_path, manifest)
        for contract in contracts:
            contract["source"]["manifestSha256"] = MODULE.sha(manifest_path.read_bytes())
        self.save(contracts)
        with self.assertRaisesRegex(ValueError, "PNG bytes differ from original"):
            self.audit()

    def test_alpha_lock_cannot_hide_transparent_palette_pixels(self):
        contracts = self.contracts()
        contracts[0]["frames"]["360"]["alpha"]["transparent"] = 0
        self.save(contracts)
        with self.assertRaisesRegex(ValueError, "pixel/alpha lock mismatch"):
            self.audit()

    def test_manifest_and_contract_geometry_both_must_match_original(self):
        contracts = self.contracts()
        contracts[0]["frames"]["361"]["offsetY"] = 0
        self.save(contracts)
        with self.assertRaisesRegex(ValueError, "offsetY mismatch"):
            self.audit()

    def test_missing_pressed_png_is_a_real_asset_failure(self):
        frame = self.contracts()[0]["frames"]["362"]
        (self.root / "assets/web/ui-national/prguse" / frame["file"]).unlink()
        with self.assertRaises(FileNotFoundError):
            self.audit()

    def test_fake_original_runtime_and_verified_font_layout_are_rejected(self):
        for key, value in (("nativeSameVersion", "verified"), ("historicalLayoutVerified", True),
                           ("browserVisualComparisonVerified", True), ("complete", True)):
            with self.subTest(key=key):
                contracts = self.contracts()
                contracts[0][key] = value
                with self.assertRaisesRegex(ValueError, "parity must remain open"):
                    MODULE.validate_layouts(*contracts)

    def test_adjacent_password_panel_cannot_be_used_as_login_pressed_state(self):
        contracts = self.contracts()
        contracts[1]["changePassword"]["loginEntry"]["pressedFrame"] = 54
        with self.assertRaisesRegex(ValueError, "adjacent frame is a backdrop"):
            MODULE.validate_layouts(*contracts)

    def test_adjacent_character_screen_cannot_be_used_as_close_pressed_state(self):
        contracts = self.contracts()
        contracts[1]["changePassword"]["closeCandidate"]["pressedFrame"] = 65
        with self.assertRaisesRegex(ValueError, "adjacent frame is a backdrop"):
            MODULE.validate_layouts(*contracts)

    def test_negative_original_four_button_layout_is_rejected(self):
        contracts = self.contracts()
        contracts[0]["variants"]["horizontal"]["buttonPositionsByCount"]["4"][-1]["left"] = -6
        with self.assertRaisesRegex(ValueError, "outside native panel"):
            MODULE.validate_layouts(*contracts)

    def test_vertical_duplicate_hotzones_and_text_overlap_are_rejected(self):
        for mutate, message in ((lambda v: v["buttonPositionsByCount"]["2"].__setitem__(1, copy.deepcopy(v["buttonPositionsByCount"]["2"][0])), "overlapping button"),
                                (lambda v: v["text"].__setitem__("height", 300), "overlaps text")):
            contracts = self.contracts()
            mutate(contracts[0]["variants"]["vertical"])
            with self.assertRaisesRegex(ValueError, message):
                MODULE.validate_layouts(*contracts)

    def test_small_multibutton_requires_declared_safe_fallback(self):
        contracts = self.contracts()
        contracts[0]["variants"]["small"].pop("fallbackSizeForOverflow")
        with self.assertRaisesRegex(ValueError, "explicit horizontal fallback"):
            MODULE.validate_layouts(*contracts)

    def test_reference_hotzones_crossing_native_field_border_are_rejected(self):
        contracts = self.contracts()
        contracts[1]["changePassword"]["inputs"]["account"]["left"] = 191
        with self.assertRaisesRegex(ValueError, "fit measured border"):
            MODULE.validate_layouts(*contracts)

    def test_input_masks_and_embedded_button_identity_cannot_be_lost(self):
        for mutation, message in ((lambda p: p["inputs"]["oldPassword"].__setitem__("masked", False), "edit policy"),
                                  (lambda p: p["buttons"]["agree"].__setitem__("embeddedInBackground", False), "baked native")):
            contracts = self.contracts()
            mutation(contracts[1]["changePassword"])
            with self.assertRaisesRegex(ValueError, message):
                MODULE.validate_layouts(*contracts)

    def test_reference_source_cannot_be_promoted_to_native_pixels(self):
        contracts = self.contracts()
        contracts[0]["referenceLayout"]["kind"] = "native_pixels"
        self.save(contracts)
        with self.assertRaisesRegex(ValueError, "cannot become native runtime"):
            self.audit()

    def test_installed_original_sources_and_existing_16_pngs_pass_asset_scope_only(self):
        active = MODULE.read_json(ROOT / "content/classic-176/active-asset-sources.json")
        original = Path(active["roots"]["nationalData"])
        if not original.is_absolute():
            original = ROOT / original
        if not (original / "Prguse.wil").is_file() or not (ROOT / "assets/web/ui-national/prguse/library.json").is_file():
            self.skipTest("Original national WIL/WIX and exported PNGs are not installed")
        report = MODULE.audit()
        self.assertTrue(report["assetValidationPassed"])
        self.assertEqual(report["checkedFrames"], 16)
        self.assertFalse(report["complete"])
        self.assertEqual(report["nativeSameVersion"], "unknown")


if __name__ == "__main__":
    unittest.main()
