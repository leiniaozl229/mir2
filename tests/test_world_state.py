import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from world_state import WorldState
from wire_codec import encode
import struct


def packet(ident, actor=7, x=290, y=620, body=b''):
    return dict(id=ident, recog=actor, param=x, tag=y, series=2, body=body)


class WorldStateTests(unittest.TestCase):
    def test_ground_drop_rejection_success_and_pickup(self):
        state = WorldState()
        raw = bytes.fromhex((Path(__file__).parent / 'fixtures/native-client-item.hex').read_text())
        state.apply(packet(200, body=raw))
        make_index = next(iter(state.inventory))
        state.apply(packet(601, actor=make_index))
        self.assertIn(make_index, state.inventory)
        state.apply(packet(600, actor=make_index))
        self.assertNotIn(make_index, state.inventory)
        state.apply(packet(610, actor=99, body='鸡肉'.encode('gbk')))
        self.assertEqual(state.ground_items[99]['x'], 290)
        state.apply(packet(200, body=raw))
        state.apply(packet(611, actor=99))
        self.assertIn(make_index, state.inventory)
        self.assertEqual(state.ground_items, {})

    def test_movement_death_and_removal(self):
        state = WorldState()
        state.apply(packet(10))
        state.apply(packet(42, body='鸡'.encode('gbk')))
        state.apply(packet(11, x=291))
        self.assertEqual(state.entities[7]['x'], 291)
        self.assertEqual(state.names[7], '鸡')
        state.apply(packet(31, x=1, y=100))  # STRUCK fields are HP, not position.
        self.assertEqual(state.entities[7]['x'], 291)
        state.apply(packet(32))
        self.assertTrue(state.entities[7]['dead'])
        state.apply(packet(30))
        self.assertNotIn(7, state.entities)
        self.assertNotIn(7, state.names)

    def test_separately_encoded_description_and_name(self):
        state = WorldState()
        event = packet(10)
        event['encodedBody'] = encode(struct.pack('<II', 10485771, 0)) + encode('鸡/255'.encode('gbk'))
        state.apply(event)
        self.assertEqual(state.names[7], '鸡')
        self.assertEqual(state.entities[7]['feature'], 10485771)
        state.apply(packet(44, x=5, y=0))
        self.assertEqual(state.experience_gained, 5)

    def test_inventory_name_is_a_bounded_gbk_field(self):
        state = WorldState()
        name = '鸡肉'.encode('gbk')
        state.apply(packet(200, body=bytes([len(name)]) + name + bytes(123-len(name))))
        self.assertEqual(state.inventory_additions[0]['name'], '鸡肉')
        with self.assertRaises(ValueError):
            state.apply(packet(200, body=b'\xff' + bytes(14)))

    def test_map_change_clears_previous_world(self):
        state = WorldState()
        state.apply(packet(50))
        state.apply(packet(10, actor=9))
        state.apply(packet(42, body=b'old'))
        state.apply(packet(51, body=b'0'))
        self.assertEqual(state.map, '0')
        self.assertEqual(state.entities, {})
        self.assertEqual(state.names, {})
        self.assertIsNone(state.player_id)
