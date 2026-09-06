"""Small protocol state reducer used by the live P0 probe.

Only messages whose field meanings have been checked against OpenMir2 are reduced.
Unknown messages remain available to the caller and never fabricate entity state.
"""
import struct
from wire_codec import decode
from item_codec import parse_client_item


class WorldState:
    def __init__(self):
        self.map = None
        self.player_id = None
        self.entities = {}
        self.names = {}
        self.packet_counts = {}
        self.deaths = set()
        self.experience_gained = 0
        self.inventory_additions = []
        self.inventory = {}
        self.ground_items = {}
        self.drop_results = {}
        self.system_messages = []

    def apply(self, event):
        ident = event['id']
        self.packet_counts[ident] = self.packet_counts.get(ident, 0) + 1
        if ident == 51:
            self.map = event['body'].decode('gbk')
            self.entities.clear()
            self.names.clear()
            self.deaths.clear()
            self.ground_items.clear()
            self.player_id = None
        elif ident == 50:
            self.player_id = event['recog']
            self._position(event)
        elif ident in (10, 11, 13):
            self._position(event)
        elif ident == 42 and event['body'] is not None:
            self.names[event['recog']] = event['body'].decode('gbk')
        elif ident in (29, 30):
            self.entities.pop(event['recog'], None)
            self.names.pop(event['recog'], None)
        elif ident == 200 and event['body'] is not None:
            item = parse_client_item(event['body'])
            self.inventory_additions.append(item)
            self.inventory[item['makeIndex']] = item
        elif ident == 201:
            items = [parse_client_item(decode(raw)) for raw in event['encodedBody'].split(b'/') if raw]
            if len(items) != event['series']:
                raise ValueError('bag item count mismatch')
            self.inventory = {item['makeIndex']: item for item in items}
        elif ident == 100 and event["body"] is not None:
            self.system_messages.append(event["body"].decode("gbk"))
        elif ident in (600,601):
            self.drop_results[event['recog']] = ident == 600
            if ident == 600:
                self.inventory.pop(event['recog'], None)
        elif ident == 610:
            self.ground_items[event['recog']] = {'id': event['recog'], 'x': event['param'],
                'y': event['tag'], 'looks': event['series'], 'name': event['body'].decode('gbk')}
        elif ident == 611:
            self.ground_items.pop(event['recog'], None)
        elif ident == 202:
            self.inventory.pop(event['recog'], None)
        elif ident == 44:
            self.experience_gained += event["param"] | event["tag"] << 16
        elif ident in (32, 34):
            self.deaths.add(event["recog"])
            actor = self.entities.get(event['recog'])
            if actor is not None:
                actor['dead'] = True

    def _position(self, event):
        actor = self.entities.setdefault(event['recog'], {'dead': False})
        actor.update(x=event['param'], y=event['tag'], direction=event['series'] & 255)
        wire = event.get('encodedBody', b'')
        if event['id'] in (10, 11, 13) and len(wire) >= 11:
            feature, status = struct.unpack('<II', decode(wire[:11]))
            actor.update(feature=feature, status=status)
            if event['id'] == 10 and len(wire) > 11:
                self.names[event['recog']] = decode(wire[11:]).decode('gbk').split('/')[0]
