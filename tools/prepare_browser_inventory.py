"""Earn a real chicken-meat item for the dedicated browser test character."""
import json
from pathlib import Path
import time
from protocol_probe import Connection, encode, expect
from world_state import WorldState
from map_tool import ClassicMap
from combat_probe import fight_chicken

ROOT = Path(__file__).resolve().parents[1]
credentials = json.loads((ROOT / '.runtime/web-ui-test.json').read_text())
account, password, character = (credentials[key] for key in ('account', 'password', 'character'))
login, selection, game = None, None, None
try:
    login = Connection(17000)
    login.send(2001, encode(f'{account}/{password}'.encode('gbk')), recog=20030422)
    result = login.receive()
    if result['id'] == 503 and result['recog'] == -3:
        time.sleep(5.2)
        login.send(2001, encode(f'{account}/{password}'.encode('gbk')), recog=20030422)
        result = login.receive()
    if result['id'] != 529:
        raise AssertionError('browser fixture login failed')
    login.send(104, encode('热血传奇'.encode('gbk')))
    ticket = expect(login, 530)['body'].decode('gbk').split('/')[-1]
    selection = Connection(17100)
    selection.send(100, encode(f'{account}/{ticket}'.encode('gbk')))
    expect(selection, 520)
    selection.send(103, encode(f'{account}/{character}'.encode('gbk')))
    expect(selection, 525)
    game = Connection(17200)
    state = WorldState()
    game.observer = state.apply
    handshake = f'**{account}/{character}/{ticket}/20030422/{int(ticket)^0xf2e44fff}/000000000000000000000000000000/0'
    game.sock.sendall(b'#1' + encode(handshake.encode('gbk')) + b'!')
    for _ in range(100):
        event = game.receive()
        if event['id'] == 658:
            game.send(1018)
        if event['id'] == 50:
            if state.map != '0':
                raise AssertionError('browser fixture requires map 0')
            position = event['param'], event['tag']
            world = ClassicMap((ROOT / '.runtime/server/Mir200/Map/0.map').read_bytes())
            fight_chicken(game, state, world, position, ROOT / '.runtime/reports/browser-combat.json')
            break
    else:
        raise AssertionError('browser fixture did not enter world')
finally:
    for connection in (game, selection, login):
        if connection is not None:
            connection.close()
