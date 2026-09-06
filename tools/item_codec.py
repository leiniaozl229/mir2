"""Pinned OpenMir2 ClientItem (124-byte) identity and durability decoder."""
import struct


def parse_client_item(body):
    if len(body) != 124:
        raise ValueError(f'unsupported ClientItem size: {len(body)}')
    if body[0] > 14:
        raise ValueError('invalid ClientItem name length')
    make_index, dura, dura_max = struct.unpack_from('<iHH', body, 100)
    return {'name': body[1:1+body[0]].decode('gbk'), 'makeIndex': make_index,
            'durability': dura, 'maxDurability': dura_max,
            'stdMode': body[15], 'weight': body[17], 'packetHex': body.hex()}
