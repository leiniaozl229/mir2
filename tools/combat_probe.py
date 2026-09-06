"""Bounded live combat exercise for the dedicated P0 account."""
import json
from pathlib import Path
import socket
import time

DIRECTIONS = [(0,-1),(1,-1),(1,0),(1,1),(0,1),(-1,1),(-1,0),(-1,-1)]


def pump(game, duration):
    deadline = time.monotonic() + duration
    old_timeout = game.sock.gettimeout()
    game.sock.settimeout(.2)
    try:
        while time.monotonic() < deadline:
            try:
                game.receive()
            except socket.timeout:
                pass
    finally:
        game.sock.settimeout(old_timeout)


def fight_chicken(game, state, world, position, evidence_path=None):
    evidence_path = evidence_path or Path(__file__).resolve().parents[1] / '.runtime/reports/combat.json'
    pump(game, 1)
    candidates = [actor for actor in state.entities if state.names.get(actor) == '鸡'
                  and not state.entities[actor]['dead']]
    distance = lambda actor: max(abs(state.entities[actor]['x']-position[0]),
                                 abs(state.entities[actor]['y']-position[1]))
    target_id = min(candidates, key=distance) if candidates else None
    initial_exp = state.experience_gained
    attacks = 0
    visited = []
    for action in range(80):
        if target_id is None:
            candidates = [actor for actor in state.entities if state.names.get(actor) == '鸡'
                          and not state.entities[actor]['dead']]
            if candidates:
                target_id = min(candidates, key=distance)
        if target_id in state.deaths and state.experience_gained > initial_exp:
            print('PASS chicken death and experience gain; attacks:', attacks, flush=True)
            evidence = {'target': '鸡', 'attacks': attacks,
                        'experienceGained': state.experience_gained - initial_exp,
                        'deathConfirmed': True, 'harvestInventoryAddition': False}
            evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
            corpse = state.entities.get(target_id)
            if corpse is None:
                raise AssertionError('corpse missing before harvest')
            before_items = len(state.inventory_additions)
            dx = (corpse['x'] > position[0]) - (corpse['x'] < position[0])
            dy = (corpse['y'] > position[1]) - (corpse['y'] < position[1])
            direction = DIRECTIONS.index((dx, dy))
            for attempt in range(12):
                game.send(1007, recog=target_id, param=corpse['x'], tag=corpse['y'], series=direction)
                pump(game, .8)
                if len(state.inventory_additions) > before_items:
                    print('PASS corpse harvest added inventory item', flush=True)
                    additions = state.inventory_additions[before_items:]
                    if not any(item['name'] == '鸡肉' for item in additions):
                        raise AssertionError('harvest added unexpected item')
                    evidence['harvestInventoryAddition'] = True
                    evidence['items'] = additions
                    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
                    return position, evidence
            raise AssertionError('no inventory addition after corpse harvest')
        target = state.entities.get(target_id)
        if target is None:
            if target_id is not None:
                raise AssertionError('combat target left view before confirmed kill')
            # Navigate to the documented P0 spawn area to find a live target.
            target = {'x': 292, 'y': 623}
        tx, ty = target['x'], target['y']
        dx = (tx > position[0]) - (tx < position[0])
        dy = (ty > position[1]) - (ty < position[1])
        if target_id is not None and max(abs(tx-position[0]), abs(ty-position[1])) <= 1 and (dx or dy):
            direction = DIRECTIONS.index((dx,dy))
            game.send(3014, recog=position[0] | position[1]<<16, tag=direction)
            attacks += 1
            print('COMBAT attack', attacks, 'at', position, flush=True)
            pump(game, 1.5)
            continue
        occupied = {(v['x'],v['y']) for k,v in state.entities.items()
                    if k != state.player_id and not v['dead']}
        options = []
        for direction, (ox,oy) in enumerate(DIRECTIONS):
            point = position[0]+ox, position[1]+oy
            if not world.blocked(*point) and point not in occupied:
                score = max(abs(tx-point[0]), abs(ty-point[1])) + (3 if point in visited[-6:] else 0)
                options.append((score,direction,point))
        if not options:
            raise AssertionError('no legal step towards chicken')
        _, direction, point = min(options)
        game.send(3011, recog=point[0] | point[1]<<16, tag=direction)
        for _ in range(200):
            event = game.receive()
            if event['id'] == -1 and event['body'].startswith(b'+GD/'):
                visited.append(position)
                position = point
                break
            if event['id'] == 28:
                position = event['param'],event['tag']
                break
        else:
            raise AssertionError('no movement response during combat')
        pump(game, 1.0)
    raise AssertionError('combat action budget exhausted without confirmed kill')
