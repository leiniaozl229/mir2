"""Compatibility checks for the 2003 client bridge."""
import importlib.util
import os
from pathlib import Path
import struct
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PROXY = ROOT / "scripts/old-client-codec-proxy.py"


class OldClientCodecProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        client = Path(cls.temporary.name) / "mir.dat"
        client.write_bytes(b"\x01\x02\x03\x04\x05")
        previous_args = sys.argv
        previous_client = os.environ.get("MIR2_NATIVE_CLIENT_EXE")
        try:
            sys.argv = [str(PROXY), "17200"]
            os.environ["MIR2_NATIVE_CLIENT_EXE"] = str(client)
            spec = importlib.util.spec_from_file_location("old_client_codec_proxy", PROXY)
            cls.proxy = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.proxy)
        finally:
            sys.argv = previous_args
            if previous_client is None:
                os.environ.pop("MIR2_NATIVE_CLIENT_EXE", None)
            else:
                os.environ["MIR2_NATIVE_CLIENT_EXE"] = previous_client

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_uses_client_file_checksum(self):
        self.assertEqual(self.proxy.NATIVE_CRC, 0x04030204)

    def test_old_codec_matches_legacy_bit_packing_across_lengths(self):
        for length in range(0, 260):
            payload = bytes((index * 73 + length) % 256 for index in range(length))
            bits = "".join(f"{byte:08b}" for byte in payload)
            bits += "0" * (-len(bits) % 6)
            expected = bytes(int(bits[index:index + 6], 2) + 60
                             for index in range(0, len(bits), 6))
            with self.subTest(length=length):
                self.assertEqual(self.proxy.old_encode(payload), expected)
                self.assertEqual(self.proxy.old_decode(expected), payload)
        # The legacy decoder ignores one incomplete trailing sextet.
        self.assertEqual(self.proxy.old_decode(self.proxy.old_encode(b"abc") + b"<"), b"abc")

    def test_new_codec_round_trips_all_byte_values_and_tail_lengths(self):
        for length in range(0, 260):
            payload = bytes((index * 73 + length) % 256 for index in range(length))
            with self.subTest(length=length):
                self.assertEqual(self.proxy.new_decode(self.proxy.new_encode(payload)), payload)

    def test_sends_matching_check_with_logon(self):
        logon = struct.pack("<IHHHH", 7, 50, 250, 200, 0) + bytes(16)
        incoming = b"#" + self.proxy.new_encode(logon) + b"!"
        frames = self.proxy.relay_payload(incoming, False).split(b"!")
        self.assertEqual(len(frames), 3)
        original = self.proxy.old_decode(frames[0][1:])
        check = self.proxy.old_decode(frames[1][1:])
        self.assertEqual(struct.unpack_from("<H", original, 4)[0], 50)
        self.assertEqual(struct.unpack_from("<IH", check), (0x04030204, 1106))

    def test_corrects_later_server_check(self):
        version = struct.pack("<IHHHH", 0, 1106, 0, 0, 0) + bytes([0xAC] * 4)
        incoming = b"#" + self.proxy.new_encode(version) + b"!"
        corrected = self.proxy.relay_payload(incoming, False)
        self.assertEqual(self.proxy.old_decode(corrected[1:-1])[:6],
                         struct.pack("<IH", 0x04030204, 1106))

    def test_other_game_messages_do_not_add_check(self):
        new_map = struct.pack("<IHHHH", 0, 51, 250, 200, 0)
        incoming = b"#" + self.proxy.new_encode(new_map) + b"!"
        self.assertEqual(self.proxy.relay_payload(incoming, False).count(b"!"), 1)

    def test_game_action_replies_unlock_legacy_client(self):
        self.assertEqual(self.proxy.convert(b"#+GD/12345!", False), b"#+GOOD/12345!")
        self.assertEqual(self.proxy.convert(b"#+FL/12345!", False), b"#+FAIL/12345!")
        self.assertEqual(self.proxy.convert(b"#+GOOD/12345!", False), b"#+GOOD/12345!")
        self.assertEqual(self.proxy.convert(b"#+GD/12345!", True), b"#+GD/12345!")

    def test_inventory_items_keep_real_instance_and_durability_for_legacy_client(self):
        item = bytearray(124)
        item[:5] = b"\x04Wood"
        item[44:48] = struct.pack("<I", 5)  # New format's Stock, misread as the old item ID.
        item[100:108] = struct.pack("<IHH", 15802433, 7000, 8000)
        for message_id in (200, 201, 203):
            header = struct.pack("<IHHHH", 0, message_id, 0, 0, 0)
            frame = (b"#" + self.proxy.new_encode(header)
                     + self.proxy.new_encode(item) + b"/" + self.proxy.new_encode(item) + b"/!")
            converted = self.proxy.convert(frame, False)
            parts = converted[1:-1].split(b"/")
            first = self.proxy.old_decode(parts[0])
            second = self.proxy.old_decode(parts[1])
            with self.subTest(message_id=message_id):
                self.assertEqual(first[:12], header)
                self.assertEqual(first[12 + 44:12 + 52], item[100:108])
                self.assertEqual(second[44:52], item[100:108])
                self.assertEqual(first[12:12 + 44], item[:44])

        header = struct.pack("<IHHHH", 0, 621, 0, 0, 0)
        frame = (b"#" + self.proxy.new_encode(header) + b"1/"
                 + self.proxy.new_encode(item) + b"/!")
        converted = self.proxy.convert(frame, False)
        parts = converted[1:-1].split(b"/")
        self.assertEqual(parts[0][-1:], b"1")
        self.assertEqual(parts[2], b"")
        self.assertEqual(self.proxy.old_decode(parts[0][:-1]), header)
        self.assertEqual(self.proxy.old_decode(parts[1])[44:52], item[100:108])


if __name__ == "__main__":
    unittest.main()
