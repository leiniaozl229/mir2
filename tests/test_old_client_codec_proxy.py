"""Compatibility checks for the 2003 client bridge."""
import importlib.util
import asyncio
import json
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

    def test_legacy_runlogin_code_is_padded_for_actual_marker(self):
        login = b"**tester01/warrior/1/20210101/0"
        frame = b"#3" + self.proxy.old_encode(login) + b"!"
        converted = self.proxy.convert(frame, True)
        self.assertEqual(self.proxy.new_decode(converted[2:-1]),
                         b"**tester01/warrior/1/20210101/0000000000")

    def test_actor_name_after_char_desc_keeps_chinese_text(self):
        desc = struct.pack("<II", 0x1234, 0x5678)
        name = "边界武器店/5".encode("gbk")
        for message_id in (6, 7, 9, 10):
            header = struct.pack("<IHHHH", 123, message_id, 280, 609, 0)
            frame = (b"#" + self.proxy.new_encode(header)
                     + self.proxy.new_encode(desc) + self.proxy.new_encode(name) + b"!")
            converted = self.proxy.convert(frame, False)
            with self.subTest(message_id=message_id):
                self.assertEqual(self.proxy.old_decode(converted[1:17]), header)
                self.assertEqual(self.proxy.old_decode(converted[17:28]), desc)
                self.assertEqual(self.proxy.old_decode(converted[28:-1]), name)

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

    def test_shop_details_convert_both_codec_layers_and_legacy_item_fields(self):
        item = bytearray(124)
        item[:5] = b"\x04Wood"
        item[100:108] = struct.pack("<IHH", 15802433, 7000, 55)
        header = struct.pack("<IHHHH", 44, 652, 2, 0, 0)
        inner = self.proxy.new_encode(item) + b"/" + self.proxy.new_encode(item) + b"/"
        frame = b"#" + self.proxy.new_encode(header) + self.proxy.new_encode(inner) + b"!"
        converted = self.proxy.convert(frame, False)
        self.assertEqual(self.proxy.old_decode(converted[1:17]), header)
        legacy_inner = self.proxy.old_decode(converted[17:-1])
        fields = legacy_inner.split(b"/")
        self.assertEqual(len(fields), 3)
        self.assertEqual(fields[-1], b"")
        for field in fields[:2]:
            legacy_item = self.proxy.old_decode(field)
            self.assertEqual(legacy_item[:44], item[:44])
            self.assertEqual(legacy_item[44:52], item[100:108])

    def test_ground_item_tracker_follows_visible_items_and_player(self):
        async def scenario():
            state_path = Path(self.temporary.name) / "ground-items.json"
            tracker = self.proxy.GroundItemTracker(state_path)

            def server_frame(message_id, recog, x=0, y=0, text=""):
                header = struct.pack("<IHHHH", recog, message_id, x, y, 0)
                return (b"#" + self.proxy.new_encode(header)
                        + self.proxy.new_encode(text.encode("gbk")) + b"!")

            def client_frame(message_id, x, y):
                header = struct.pack("<IHHHH", x | (y << 16), message_id, 0, 3, 0)
                return b"#1" + self.proxy.old_encode(header) + b"!"

            tracker.observe(server_frame(50, 81, 100, 130), False)
            tracker.observe(server_frame(610, 9001, 102, 131, "骷髅戒指"), False)
            await asyncio.sleep(0.08)
            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual((state["x"], state["y"]), (100, 130))
            self.assertEqual(state["items"],
                             [{"id": 9001, "x": 102, "y": 131, "name": "骷髅戒指"}])

            tracker.observe(client_frame(3011, 101, 130), True)
            await asyncio.sleep(0.08)
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8"))["x"], 101)
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8"))["items"][0]["name"], "骷髅戒指")
            tracker.observe(client_frame(3011, 0, 1), True)
            await asyncio.sleep(0.08)
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8"))["x"], 101)
            tracker.observe(server_frame(28, 999, 0, 5), False)
            await asyncio.sleep(0.08)
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8"))["x"], 101)
            tracker.observe(server_frame(28, 81, 100, 130), False)
            await asyncio.sleep(0.08)
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8"))["x"], 100)
            tracker.observe(server_frame(611, 9001, 102, 131), False)
            await asyncio.sleep(0.08)
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8"))["items"], [])
            tracker.observe(server_frame(610, 9002, 103, 131, "乌木剑"), False)
            tracker.observe(server_frame(634, 81, 200, 300), False)
            await asyncio.sleep(0.08)
            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(state["actorId"], 81)
            self.assertEqual((state["x"], state["y"], state["items"]), (200, 300, []))
            tracker.close()

        asyncio.run(scenario())

    def test_monster_overlay_uses_visible_actor_and_actual_hit_points(self):
        async def scenario():
            state_path = Path(self.temporary.name) / "monsters.json"
            tracker = self.proxy.GroundItemTracker(state_path)

            def frame(message_id, actor, x=0, y=0, feature=None, name=""):
                header = self.proxy.new_encode(struct.pack("<IHHHH", actor, message_id, x, y, 0))
                payload = b""
                if feature is not None:
                    payload += self.proxy.new_encode(struct.pack("<II", feature, 0))
                if name:
                    payload += self.proxy.new_encode(name.encode("gbk"))
                return b"#" + header + payload + b"!"

            tracker.observe(frame(50, 81, 100, 130), False)
            tracker.observe(frame(10, 1001, 102, 130, 1, "稻草人/5"), False)
            tracker.observe(frame(10, 1002, 101, 130, 50, "传送员/5"), False)
            tracker.observe(frame(10, 1003, 103, 130, 1, "骷髅(主人)/254"), False)
            await asyncio.sleep(0.08)
            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(state["monsters"],
                             [{"id": 1001, "x": 102, "y": 130, "name": "稻草人",
                               "hp": None, "maxHp": None}])

            tracker.observe(frame(11, 1001, 103, 131), False)
            tracker.observe(frame(31, 1001, 17, 40), False)
            await asyncio.sleep(0.08)
            monster = json.loads(state_path.read_text(encoding="utf-8"))["monsters"][0]
            self.assertEqual((monster["x"], monster["y"], monster["hp"], monster["maxHp"]),
                             (103, 131, 17, 40))
            tracker.observe(frame(32, 1001), False)
            await asyncio.sleep(0.08)
            self.assertEqual(json.loads(state_path.read_text(encoding="utf-8"))["monsters"], [])
            tracker.close()

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
