import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from protocol_probe import Connection, encode, decode, pascal


class ProtocolCodecTests(unittest.TestCase):
    def test_seed_and_remainder_vectors(self):
        # AC XOR AC = 0; the trailing character carries redistributed bits.
        self.assertEqual(encode(bytes.fromhex("ac")), b"<<")
        self.assertEqual(encode(bytes.fromhex("000000")), b"ddhk")
        self.assertEqual(decode(b"ddhk"), bytes(3))

    def test_all_bytes_and_partial_groups(self):
        raw = bytes(range(256))
        for length in range(257):
            self.assertEqual(decode(encode(raw[:length])), raw[:length])

    def test_malformed_wire_data(self):
        for raw in [b"<", b"<<<<<", b"\x00<", b"|<"]:
            with self.assertRaises(ValueError):
                decode(raw)

    def test_status_and_message_specific_body_are_preserved(self):
        connection = Connection.__new__(Connection)
        connection.buffer = b"#+GD/123!"
        self.assertEqual(connection.receive()["body"], b"+GD/123")
        header = encode(struct.pack("<iHHHH", 0, 46, 0, 0, 0))
        connection.buffer = b"#" + header + b"<!"
        response = connection.receive()
        self.assertEqual(response["id"], 46)
        self.assertIsNone(response["body"])
        self.assertEqual(response["encodedBody"], b"<")

    def test_chinese_pascal_lengths_are_bytes(self):
        self.assertEqual(pascal("比奇", 4), b"\x04" + "比奇".encode("gbk"))
        with self.assertRaises(ValueError):
            pascal("比奇", 3)


if __name__ == "__main__":
    unittest.main()
