"""Round-trip one dedicated test item through the authoritative ground state."""
from combat_probe import pump, DIRECTIONS
from wire_codec import encode
from pathlib import Path
import json


def drop_and_pickup(game, state, world, position):
    item = next((value for value in state.inventory.values() if value['name'] == '鸡肉'), None)
    if item is None:
        raise AssertionError('drop test requires harvested chicken meat')
    original = dict(item)
    original.pop('packetHex', None)  # Expected fields are calculated, not a received packet.
    if original["stdMode"] == 40:
        original["durability"] = max(0, original["durability"] - 2000)
    before = set(state.ground_items)
    game.send(1000, recog=item['makeIndex'], body=encode(item['name'].encode('gbk')))
    pump(game, 2)
    evidence_file = Path(__file__).resolve().parents[1] / '.runtime/reports/drop-pickup.json'
    evidence = {'before': dict(item), 'expectedAfter': original,
                'dropAccepted': state.drop_results.get(item['makeIndex']),
                'groundItems': list(state.ground_items.values()), 'pickupVerified': False}
    evidence_file.write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
    if state.drop_results.get(item['makeIndex']) is not True:
        raise AssertionError(f'drop result={state.drop_results}; messages={state.system_messages[-3:]}')
    new_items = [value for key,value in state.ground_items.items()
                 if key not in before and value['name'] == item['name']]
    if len(new_items) != 1:
        raise AssertionError('expected exactly one newly visible ground item')
    ground = new_items[0]
    for _ in range(8):
        if position == (ground['x'],ground['y']):
            break
        dx = (ground['x'] > position[0]) - (ground['x'] < position[0])
        dy = (ground['y'] > position[1]) - (ground['y'] < position[1])
        target = position[0]+dx, position[1]+dy
        if world.blocked(*target):
            raise AssertionError('ground item path blocked')
        game.send(3011, recog=target[0] | target[1]<<16, tag=DIRECTIONS.index((dx,dy)))
        for _ in range(150):
            event = game.receive()
            if event['id'] == -1 and event['body'].startswith(b'+GD/'):
                position = target
                break
            if event['id'] == 28:
                raise AssertionError('server rejected approach to ground item')
        pump(game, 1)
    if position != (ground['x'],ground['y']):
        raise AssertionError('did not reach ground item')
    game.send(1001, param=position[0], tag=position[1])
    pump(game, 2)
    restored = state.inventory.get(item['makeIndex'])
    keys = ('name','makeIndex','durability','maxDurability','stdMode')
    if restored is None or any(restored[key] != original[key] for key in keys):
        raise AssertionError('pickup did not restore original item identity and durability')
    if ground['id'] in state.ground_items:
        raise AssertionError('picked item remains visible on ground')
    evidence.update(pickupVerified=True, after=restored)
    evidence_file.write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
    print('PASS drop/pickup preserved item identity and applied meat wear', flush=True)
    return position, {'name': item['name'], 'makeIndex': item['makeIndex'], 'passed': True}
