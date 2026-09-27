import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("prepare_native_client", ROOT / "tools/prepare-native-client.py")
CLIENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CLIENT)


def fixture():
    return CLIENT.build_group(1, [
        b"[main]\r\nname=Old\r\nlastgroup=1\r\n",
        b"[Setup]\r\nsite=old.example\r\nport=21\r\nprogram=mir2.exe\r\n"
        b"[Server]\r\nServerCount=1\r\nserver1name=Old\r\n",
        b"[Setup]\r\nServerAddr=192.0.2.1\r\nParam1=\r\nParam2=fixture-option\r\npatched=1\r\n",
        b"TApplication\tfixture\r\n",
    ])


class NativeClientTests(unittest.TestCase):
    def test_container_round_trip_and_reject_invalid_offsets(self):
        data = fixture()
        count, blocks = CLIENT.parse_group(data)
        self.assertEqual(CLIENT.build_group(count, blocks), data)
        overlap = bytearray(data)
        struct.pack_into("<I", overlap, 20, 44)
        for invalid in (b"", data[:-1], data + b"trailing", bytes(overlap)):
            with self.assertRaises(ValueError):
                CLIENT.parse_group(invalid)

    def test_local_config_has_one_group_and_preserves_non_network_settings(self):
        original = fixture()
        result = CLIENT.local_group(original, "热血传奇")
        count, blocks = CLIENT.parse_group(result)
        self.assertEqual(count, 1)
        updater, server = CLIENT.read_ini(blocks[1]), CLIENT.read_ini(blocks[2])
        self.assertEqual(updater["Setup"]["site"], "127.0.0.1")
        self.assertEqual(updater["Setup"]["port"], "21")
        self.assertEqual(updater["Server"]["server1name"], "热血传奇")
        self.assertEqual(server["Setup"]["ServerAddr"], "127.0.0.1")
        self.assertEqual(server["Setup"]["patched"], "1")
        self.assertNotIn("ServerPort", server["Setup"])
        self.assertEqual(blocks[-1], CLIENT.parse_group(original)[1][-1])

    def test_preparation_preserves_source_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            source, destination = base / "source", base / "prepared"
            source.mkdir()
            for name in CLIENT.PROGRAMS:
                (source / name).write_bytes(b"unchanged program fixture")
            for name in CLIENT.ASSETS:
                (source / name).mkdir()
                (source / name / "asset.bin").write_bytes(b"original asset")
            (source / "group.dat").write_bytes(fixture())
            (source / "user.ini").write_bytes(b"[main]\r\nLastGroup=73\r\n")
            before = {p.name: p.read_bytes() for p in source.iterdir() if p.is_file()}
            manifest = CLIENT.prepare(source, destination, "热血传奇", "copy")
            self.assertFalse(manifest["runtime_verified"])
            self.assertEqual((destination / "original-config/group.dat").read_bytes(), fixture())
            self.assertEqual((destination / "user.ini").read_bytes(), b"[main]\r\nLastGroup=0\r\n")
            entry = CLIENT.read_ini((destination / "mir.ini").read_bytes())
            direct = CLIENT.read_ini((destination / "mirsetup.ini").read_bytes())
            servers = CLIENT.read_ini((destination / "ftp.ini").read_bytes())
            self.assertEqual(entry["Setup"]["Patched"], "1")
            self.assertEqual(entry["Setup"]["Param1"], "")
            self.assertEqual(entry["Setup"]["Param2"], "fixture-option")
            self.assertEqual(direct["Setup"]["ServerAddr"], "127.0.0.1")
            self.assertEqual(servers["Server"]["server1name"], "热血传奇")
            self.assertEqual(before, {p.name: p.read_bytes() for p in source.iterdir() if p.is_file()})
            with self.assertRaises(ValueError):
                CLIENT.prepare(source, destination, "热血传奇", "copy")
            with self.assertRaises(ValueError):
                CLIENT.prepare(source, source / "unsafe-child", "热血传奇", "copy")


if __name__ == "__main__":
    unittest.main()
