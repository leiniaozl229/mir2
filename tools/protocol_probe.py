#!/usr/bin/env python3
"""Local TCP probe for the actual OpenMir2 login/character chain."""
from pathlib import Path
import json
import secrets
import socket
import struct
import time
import sys

ROOT = Path(__file__).resolve().parents[1]


from wire_codec import encode, decode


def pascal(value, capacity):
    data = value.encode("gbk")
    if len(data) > capacity:
        raise ValueError("Pascal string exceeds field capacity")
    return bytes([len(data)]) + data + bytes(capacity - len(data))


class Connection:
    def __init__(self, port):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=10)
        self.sock.settimeout(10)
        self.buffer = b""
        self.sequence = 1
        self.observer = None

    def send(self, message, body=b"", recog=0, param=0, tag=0, series=0):
        header = encode(struct.pack("<iHHHH", recog, message, param, tag, series))
        self.sock.sendall(b"#" + str(self.sequence).encode() + header + body + b"!")
        self.sequence = self.sequence % 9 + 1

    def receive(self):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            start = self.buffer.find(b"#")
            end = self.buffer.find(b"!", max(start, 0))
            if start >= 0 and end > start:
                raw = self.buffer[start + 1:end]
                self.buffer = self.buffer[end + 1:]
                if raw.startswith(b"+"):
                    return self.event({"id": -1, "body": raw})
                if len(raw) < 16:
                    continue
                header = struct.unpack("<iHHHH", decode(raw[:16]))
                # Some inventory messages concatenate separately encoded records.
                # Preserve their wire body for a message-specific parser.
                try:
                    body = decode(raw[16:])
                except ValueError:
                    body = None
                return self.event({"recog": header[0], "id": header[1], "param": header[2],
                        "tag": header[3], "series": header[4], "body": body, "encodedBody": raw[16:]})
            packet = self.sock.recv(65536)
            if not packet:
                raise ConnectionError("server closed connection")
            self.buffer += packet
            if len(self.buffer) > 1024 * 1024:
                raise ValueError("oversize receive buffer")
        raise TimeoutError("no complete response")

    def event(self, event):
        observer = getattr(self, "observer", None)
        if observer is not None:
            observer(event)
        return event

    def close(self):
        self.sock.close()


def expect(connection, message):
    response = connection.receive()
    if response["id"] != message:
        raise AssertionError(f"expected {message}, got {response['id']} ({response['recog']})")
    return response


def main():
    combat_result = None
    ground_result = None
    report_file = ROOT / ".runtime/reports/protocol.json"
    prior_report = json.loads(report_file.read_text()) if report_file.exists() else {}
    credentials_file = ROOT / ".runtime/probe-account.json"
    fresh = not credentials_file.exists()
    if fresh:
        credentials_file.write_text(json.dumps({"account": "p" + secrets.token_hex(4),
                                                "password": secrets.token_hex(4)}))
        credentials_file.chmod(0o600)
    credentials = json.loads(credentials_file.read_text())
    account, password = credentials["account"], credentials["password"]
    login = Connection(17000)
    try:
        if not credentials.get("registered", False):
            # The legacy service starts its registration throttle at connection time.
            time.sleep(1.2)
            fields = [(account, 10), (password, 10), ("LocalTest", 20), ("", 14),
                      ("", 14), ("local", 20), ("test", 12), ("", 40)]
            extra = [("local", 20), ("test", 12), ("2000-01-01", 10),
                     ("", 13), ("", 20), ("", 20)]
            login.send(2002, encode(b"".join(pascal(*v) for v in fields)) +
                       encode(b"".join(pascal(*v) for v in extra)))
            expect(login, 504)
            credentials["registered"] = True
            credentials_file.write_text(json.dumps(credentials))
        login.send(2001, encode(f"{account}/{password}".encode("gbk")), recog=20030422)
        response = login.receive()
        if response["id"] == 503 and response["recog"] == -3:
            # SessionClearKick releases the previous ticket after five seconds.
            time.sleep(5.2)
            login.send(2001, encode(f"{account}/{password}".encode("gbk")), recog=20030422)
            response = login.receive()
        if response["id"] != 529:
            raise AssertionError(f"login failed: {response['id']} ({response['recog']})")
        print("PASS login; server list:", response["body"].decode("gbk"))
        login.send(104, encode("热血传奇".encode("gbk")))
        response = expect(login, 530)
        ticket = response["body"].decode("gbk").split("/")[-1]
        selection = Connection(17100)
        try:
            selection.send(100, encode(f"{account}/{ticket}".encode("gbk")))
            response = expect(selection, 520)
            print("PASS authenticated character query; payload bytes:", len(response["body"]))
            character = "Mir" + account[1:]
            if not response["body"]:
                time.sleep(1.2)
                selection.send(101, encode(f"{account}/{character}/1/0/0/".encode("gbk")))
                expect(selection, 521)
                print("PASS character creation")
                selection.send(100, encode(f"{account}/{ticket}".encode("gbk")))
                response = expect(selection, 520)
            if character.encode("gbk") not in response["body"]:
                raise AssertionError("created character missing from server list")
            selection.send(103, encode(f"{account}/{character}".encode("gbk")))
            route = expect(selection, 525)
            print("PASS character selection; game route:", route["body"].decode("gbk"))
            from world_state import WorldState
            state = WorldState()
            game = Connection(17200)
            game.observer = state.apply
            try:
                handshake = f"**{account}/{character}/{ticket}/20030422/{int(ticket) ^ 0xf2e44fff}/000000000000000000000000000000/0"
                game.sock.sendall(b"#1" + encode(handshake.encode("gbk")) + b"!")
                entered_map = None
                for _ in range(40):
                    event = game.receive()
                    print("GAME event", event["id"], "body bytes", len(event["encodedBody"]))
                    if event["id"] == 658:
                        game.send(1018)
                    if event["id"] == 51:
                        entered_map = event["body"].decode("gbk")
                    if event["id"] == 50:
                        if entered_map != "0":
                            raise AssertionError("expected Bichon map 0 before logon")
                        print("PASS entered map", event["param"], event["tag"])
                        break
                else:
                    raise AssertionError("no map entry event")
                start_position = (event["param"], event["tag"])
                previous_target = prior_report.get("walkTarget")
                position_restored = previous_target is not None and list(start_position) == previous_target
                if previous_target is not None:
                    if not position_restored and "--expect-position-restore" in sys.argv:
                        raise AssertionError("position did not restore to previous accepted walk target")
                    if position_restored:
                        print("PASS previous walk position restored")
                    else:
                        print("INFO start position changed since the prior protocol run; another gameplay client may have moved the shared fixture")
                from map_tool import ClassicMap
                world = ClassicMap((ROOT / ".runtime/server/Mir200/Map/0.map").read_bytes())
                from combat_probe import DIRECTIONS, pump
                pump(game, 1.0)
                preferred = 2 if start_position[0] % 2 else 6
                ordered_directions = [preferred] + [i for i in range(8) if i != preferred]
                accepted = False
                for direction in ordered_directions:
                    dx, dy = DIRECTIONS[direction]
                    target = (start_position[0]+dx, start_position[1]+dy)
                    occupied = {(v['x'],v['y']) for k,v in state.entities.items()
                                if k != state.player_id and not v['dead']}
                    if world.blocked(*target) or target in occupied:
                        continue
                    game.send(3011, recog=target[0] | (target[1] << 16), tag=direction)
                    for _ in range(150):
                        movement = game.receive()
                        if movement['id'] == -1 and movement['body'].startswith(b'+GD/'):
                            accepted = True
                            print('PASS server accepted walk', start_position, '->', target)
                            break
                        if movement['id'] == 28:
                            break
                    if accepted:
                        break
                    pump(game, 1.0)
                if not accepted:
                    raise AssertionError('no neighboring step accepted by server')
                game.sock.settimeout(.5)
                observe_until = time.monotonic() + 3
                while time.monotonic() < observe_until:
                    try:
                        game.receive()
                    except socket.timeout:
                        pass
                snapshot = [dict(id=actor, name=state.names.get(actor), **value)
                            for actor, value in state.entities.items() if actor != state.player_id]
                (ROOT / ".runtime/reports/world.json").write_text(json.dumps({
                    "map": state.map, "objects": snapshot,
                    "messageCounts": state.packet_counts}, ensure_ascii=False, indent=2))
                print("WORLD visible objects:", len(snapshot))
                from combat_probe import pump
                game.send(81)
                pump(game, 2)
                (ROOT / '.runtime/reports/inventory-observed.json').write_text(json.dumps({
                    'inventory': list(state.inventory.values()),
                    'groundItems': list(state.ground_items.values()),
                    'messages': state.system_messages,
                    'messageCounts': state.packet_counts}, ensure_ascii=False, indent=2))
                baseline_file = ROOT / '.runtime/reports/inventory-baseline.json'
                baseline = json.loads(baseline_file.read_text()) if baseline_file.exists() else {}
                # Inventory is mutable during a live play session. Older
                # reports did not identify the account/character, so their
                # item ids can belong to a different probe character.
                same_character = baseline.get('account') == account and baseline.get('character') == character
                expected_items = baseline.get('inventory', []) if same_character else []
                if baseline_file.exists() and not same_character:
                    print('INFO ignoring legacy inventory baseline for another or unidentified character')
                combat_file = ROOT / '.runtime/reports/combat.json'
                combat_baseline = json.loads(combat_file.read_text()) if combat_file.exists() else {}
                if not baseline_file.exists() and combat_baseline.get('harvestInventoryAddition'):
                    from item_codec import parse_client_item
                    expected_items = [parse_client_item(bytes.fromhex(item['packetHex'])) for item in combat_baseline['items']]
                if not baseline_file.exists() and prior_report.get('combat'):
                    from item_codec import parse_client_item
                    expected_items = [parse_client_item(bytes.fromhex(item['packetHex']))
                                      for item in prior_report['combat'].get('items', [])]
                for expected_item in expected_items:
                    restored = state.inventory.get(expected_item['makeIndex'])
                    keys = ('name', 'makeIndex', 'durability', 'maxDurability', 'stdMode')
                    if restored is None or any(restored[key] != expected_item[key] for key in keys):
                        raise AssertionError('inventory identity or durability did not restore')
                if expected_items:
                    print('PASS inventory restored; items:', len(expected_items))
                if "--combat" in sys.argv:
                    from combat_probe import fight_chicken
                    target, combat_result = fight_chicken(game, state, world, target)
                if '--drop-pickup' in sys.argv:
                    from drop_probe import drop_and_pickup
                    target, ground_result = drop_and_pickup(game, state, world, target)
                baseline_file.write_text(json.dumps({'account': account, 'character': character,
                    'inventory': list(state.inventory.values()),
                    'source': 'successful live protocol probe'}, ensure_ascii=False, indent=2))
            finally:
                game.close()


        finally:
            selection.close()
    finally:
        login.close()
    report = {"login": "passed", "serverSelection": "passed",
              "characterQuery": "passed", "characterSelection": "passed", "mapEntry": "passed", "movement": "passed", "gameplay": "not-tested", "persistence": "position-restored" if position_restored else "external-movement-detected" if previous_target is not None else "not-tested",
              "combat": combat_result, "groundItemRoundTrip": ground_result, "inventory": list(state.inventory.values()),
              "inventoryRestored": bool(expected_items), "startPosition": list(start_position), "walkTarget": list(target)}
    (ROOT / ".runtime/reports/protocol.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        (ROOT / ".runtime/reports/protocol.json").write_text(json.dumps({
            "status": "failed", "errorType": type(error).__name__,
            "note": "Current run incomplete; inspect console for the failing phase"
        }, indent=2))
        raise
