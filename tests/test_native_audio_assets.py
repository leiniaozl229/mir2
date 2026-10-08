import hashlib
import importlib.util
import json
import tempfile
import unittest
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("native_audio_audit", ROOT / "tools/validate-native-audio.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeAudioAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.native, self.assets, self.dist = [self.root / name for name in ("Wav", "audio", "dist")]
        for directory in (self.native, self.assets, self.dist): directory.mkdir()
        self.source = self.root / "SoundUtil.pas"
        self.source.write_text("s_hit_sword = 52;\ns_yedo_man = 130;\nbmg_intro = 'wav\\log-in-long2.wav';\n", encoding="ascii")
        self.profile = self.root / "audio-playback.json"
        self.profile.write_text(json.dumps(dict(schemaVersion=1, music={"login": "log-in-long2.wav"}, effects={"weaponSword": "52.wav", "powerMale": "m7-1.wav"})), encoding="utf-8")
        (self.native / "sound.lst").write_text(";中文注释\n52: wav\\52.wav\n130: wav\\M7-1.wav\n", encoding="cp936")
        for name in ("52.wav", "M7-1.wav", "log-in-long2.wav"):
            with wave.open(str(self.native / name), "wb") as audio:
                audio.setparams((1, 2, 8000, 0, "NONE", "not compressed")); audio.writeframes(b"\x01\x00\x02\x00" * 3)
            for directory in (self.assets, self.dist): (directory / name.lower()).write_bytes((self.native / name).read_bytes())
        self.manifest = [dict(file=path.name.lower(), sha256=hashlib.sha256(path.read_bytes()).hexdigest()) for path in sorted(self.native.glob("*.wav"))]
        self.write_manifest()

    def write_manifest(self):
        encoded = json.dumps(self.manifest)
        for directory in (self.assets, self.dist): (directory / "manifest.json").write_text(encoded, encoding="utf-8")

    def audit(self): return module.audit(self.profile, self.native, self.assets, self.dist, self.source)
    def codes(self): return {error["code"] for error in self.audit()["errors"]}

    def test_native_mapping_casing_and_all_stage_bytes(self):
        result = self.audit()
        self.assertEqual(result["status"], "PASS", result["errors"])
        self.assertEqual(result["summary"], dict(nativeWavs=3, publicWavs=3, distWavs=3, manifestWavs=3, mappedRoles=3, mappedUniqueFiles=3, errors=0))
        male = next(row for row in result["mappings"] if row["role"] == "powerMale")
        self.assertEqual(male["nativeSoundNumber"], 130)
        self.assertEqual(male["expectedFile"], "M7-1.wav")
        self.assertTrue(all(copy["matchesNative"] for row in result["files"] for copy in row["copies"].values()))

    def test_parser_preserves_empty_slots_and_reference_monotonic_duplicate_rule(self):
        entries, ignored = module.parse_sound_list(";comment\n1: wav\\1.wav\n2:\n2: wav\\2.wav\n1: wav\\other.wav\n4: wav\\4.wav\n")
        self.assertIsNone(entries[2]["file"])
        self.assertEqual(list(entries), [1, 2, 4])
        self.assertEqual([entry["number"] for entry in ignored], [2, 1])
        with self.assertRaises(ValueError): module.parse_sound_list("2: ../../escape.wav")

    def test_changed_built_bytes_and_manifest_hash_are_detected(self):
        (self.dist / "52.wav").write_bytes(b"changed wave")
        self.manifest[0]["sha256"] = "0" * 64; self.write_manifest()
        self.assertIn("byte-mismatch", self.codes())
        self.assertIn("manifest-hash-mismatch", self.codes())
        self.assertEqual(self.audit()["status"], "FAIL")

    def test_missing_and_extra_resources_cannot_pass_complete_copy_audit(self):
        (self.assets / "m7-1.wav").unlink()
        (self.dist / "extra.wav").write_bytes(b"extra")
        codes = self.codes()
        self.assertTrue({"missing-resource", "missing-mapped-resource", "unexpected-resource"} <= codes)

    def test_profile_swapped_existing_files_cannot_pass_mapping_audit(self):
        value = json.loads(self.profile.read_text())
        value["effects"]["weaponSword"] = "m7-1.wav"
        self.profile.write_text(json.dumps(value))
        self.assertIn("role-mapping-mismatch", self.codes())
        value["effects"]["unverified"] = "52.wav"; self.profile.write_text(json.dumps(value))
        self.assertIn("unproven-role-mapping", self.codes())

    def test_unsafe_profile_and_manifest_paths_are_rejected_without_outside_reads(self):
        for bad in ("../52.wav", "C:\\52.wav", "/52.wav", " 52.wav", "52.mp3"):
            with self.subTest(path=bad):
                value = json.loads(self.profile.read_text()); value["effects"]["weaponSword"] = bad
                self.profile.write_text(json.dumps(value)); self.assertIn("invalid-input", self.codes())
        self.manifest.append(dict(file="../../52.wav", sha256="0" * 64)); self.write_manifest()
        self.assertIn("invalid-input", self.codes())

    def test_duplicate_manifest_and_wrong_hash_format_are_rejected(self):
        self.manifest.append(dict(self.manifest[0])); self.write_manifest()
        self.assertIn("invalid-input", self.codes())
        self.manifest.pop(); self.manifest[0]["sha256"] = "not a SHA256"; self.write_manifest()
        self.assertIn("invalid-input", self.codes())

    def test_dist_manifest_identity_and_linux_url_case_are_checked(self):
        (self.dist / "manifest.json").write_text("[]")
        self.assertIn("manifest-copy-mismatch", self.codes())
        (self.assets / "m7-1.wav").rename(self.assets / "M7-1.wav")
        self.assertIn("mapped-url-case-mismatch", self.codes())

    def test_missing_native_reference_and_sound_number_fail_with_actionable_error(self):
        self.source.unlink(); result = self.audit()
        self.assertEqual(result["status"], "FAIL")
        self.assertEqual(result["errors"][0]["code"], "invalid-input")
        self.source.write_text("s_hit_sword = 51;\nbmg_intro = 'wav\\log-in-long2.wav';")
        self.assertIn("unproven-role-mapping", self.codes())


if __name__ == "__main__": unittest.main()
