#!/usr/bin/env python3
"""Exercise the 2003 client's loopback codec bridge and item persistence."""

import base64
import json
import os
from pathlib import Path
import socket
import struct
import time


ROOT = Path(__file__).resolve().parents[1]
OLD_ALPHABET = bytes(range(60, 124))
BASE64_ALPHABET = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


def encode(data):
    return base64.b64encode(data).rstrip(b"=").translate(bytes.maketrans(BASE64_ALPHABET, OLD_ALPHABET))


def decode(data):
    if len(data) % 4 == 1 or any(value not in OLD_ALPHABET for value in data):
        raise ValueError("invalid old-client encoded field")
    value = data.translate(bytes.maketrans(OLD_ALPHABET, BASE64_ALPHABET))
    return base64.b64decode(value + b"=" * (-len(value) % 4))


class Connection:
    def __init__(self, port):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=10)
        self.sock.settimeout(10)
        self.buffer = bytearray()
        self.sequence = 1

    def send(self, message, body=b"", recog=0, param=0, tag=0, series=0):
        header = encode(struct.pack("<iHHHH", recog, message, param, tag, series))
        self.sock.sendall(b"#" + str(self.sequence).encode("ascii") + header + body + b"!")
        self.sequence = self.sequence % 9 + 1

    def receive(self):
        while True:
            start = self.buffer.find(b"#")
            end = self.buffer.find(b"!", max(start, 0))
            if start >= 0 and end > start:
                raw = bytes(self.buffer[start + 1:end])
                del self.buffer[:end + 1]
                if raw.startswith(b"+"):
                    return {"id": -1, "body": raw}
                if len(raw) < 16:
                    continue
                header = struct.unpack("<iHHHH", decode(raw[:16]))
                wire_body = raw[16:]
                try:
                    body = decode(wire_body)
                except ValueError:
                    body = None
                return dict(zip(("recog", "id", "param", "tag", "series"), header),
                            body=body, wireBody=wire_body)
            data = self.sock.recv(65536)
            if not data:
                raise ConnectionError("old-client bridge closed the connection")
            self.buffer.extend(data)
            if len(self.buffer) > 1024 * 1024:
                raise ValueError("oversize old-client response")

    def close(self):
        self.sock.close()


def expect(connection, ident):
    event = connection.receive()
    if event["id"] != ident:
        raise AssertionError(f"expected message {ident}, got {event['id']}")
    return event


def item_identity(raw):
    if len(raw) != 124:
        raise AssertionError(f"expected a 124-byte ClientItem, got {len(raw)}")
    legacy = struct.unpack_from("<IHH", raw, 44)
    current = struct.unpack_from("<IHH", raw, 100)
    if legacy != current:
        raise AssertionError("bridge did not mirror item ID and durability into legacy offsets")
    make_index, durability, maximum = legacy
    if not make_index or not maximum or durability > maximum:
        raise AssertionError("invalid item identity or durability")
    return (make_index, durability, maximum)


def detailed_bag(event):
    fields = [field for field in event["wireBody"].split(b"/") if field]
    if len(fields) != event["series"]:
        raise AssertionError("old-client bag count differs from message header")
    result = []
    for field in fields:
        raw = decode(field)
        identity = item_identity(raw)
        name_length = raw[0]
        if not 0 < name_length <= 14:
            raise AssertionError("invalid old-client bag item name length")
        result.append((identity, raw[1:1 + name_length].decode("gbk")))
    return result


def bag_items(event):
    return sorted(identity for identity, _ in detailed_bag(event))


def detailed_equipment(event):
    fields = event["wireBody"].split(b"/")
    if fields and fields[-1] == b"":
        fields.pop()
    if len(fields) % 2:
        raise AssertionError("old-client equipment slot/item fields are misaligned")
    slots = {}
    for slot, item in zip(fields[::2], fields[1::2]):
        if not slot.isdigit():
            raise AssertionError("old-client equipment slot is not numeric")
        slot_number = int(slot)
        if slot_number in slots:
            raise AssertionError("duplicate equipment slot")
        raw = decode(item)
        identity = item_identity(raw)
        name_length = raw[0]
        if not 0 < name_length <= 14:
            raise AssertionError("invalid old-client equipment name length")
        slots[slot_number] = (identity, raw[1:1 + name_length].decode("gbk"),
                              {"stdMode": raw[15], "weight": raw[17],
                               "need": raw[36], "needLevel": raw[37]})
    return slots


def equipped_items(event):
    return {slot: details[0] for slot, details in detailed_equipment(event).items()}


def login(account, password, character):
    login_gate = Connection(7000)
    try:
        for attempt in range(2):
            login_gate.send(2001, encode(f"{account}/{password}".encode("gbk")), recog=20030422)
            response = login_gate.receive()
            if response["id"] == 529:
                break
            if (response["id"] == 503 and response["recog"] == -3 and attempt == 0
                    and os.environ.get("MIR2_STRICT_RELOGIN") != "1"):
                time.sleep(5.2)  # Wait for the previous session ticket to clear.
                continue
            raise AssertionError(f"old-client login rejected: message {response['id']}, reason={response['recog']}")
        login_gate.send(104, encode("热血传奇".encode("gbk")))
        ticket_response = expect(login_gate, 530)
        ticket = ticket_response["body"].decode("gbk").split("/")[-1]
        selection = Connection(17100)
        try:
            selection.send(100, encode(f"{account}/{ticket}".encode("gbk")))
            characters = expect(selection, 520)
            if character.encode("gbk") not in characters["body"]:
                raise AssertionError("test character is missing from the old-client selection reply")
            selection.send(103, encode(f"{account}/{character}".encode("gbk")))
            expect(selection, 525)
        finally:
            selection.close()
    finally:
        login_gate.close()
    return ticket


def snapshot(account, character, ticket, expect_equipment, notice_delay=0):
    game = Connection(17200)
    try:
        handshake = (f"**{account}/{character}/{ticket}/20030422/"
                     f"{int(ticket) ^ 0xf2e44fff}/000000000000000000000000000000/0")
        game.sock.sendall(b"#1" + encode(handshake.encode("gbk")) + b"!")
        map_name = None
        position = None
        bag = None
        equipment = None
        received = []
        requested_bag = False
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            event = game.receive()
            ident = event["id"]
            received.append(ident)
            if ident == 658:
                if notice_delay:
                    time.sleep(notice_delay)
                game.send(1018)
            elif ident == 51:
                map_name = event["body"].decode("gbk")
            elif ident == 50:
                position = (event["param"], event["tag"])
                if not requested_bag:
                    game.send(81)
                    requested_bag = True
            elif ident == 201:
                bag = bag_items(event)
            elif ident == 621:
                equipment = equipped_items(event)
            if map_name is not None and position is not None and bag is not None:
                if not expect_equipment or equipment is not None:
                    return {"map": map_name, "position": position,
                            "bag": bag, "equipment": equipment or {}}
        raise TimeoutError("no complete old-client snapshot: "
                           f"map={map_name is not None}, position={position is not None}, "
                           f"bag={bag is not None}, equipment={equipment is not None}, "
                           f"messageIds={received}")
    finally:
        game.close()


def main():
    account = os.environ["MIR2_NATIVE_ACCOUNT"]
    password = os.environ["MIR2_NATIVE_PASSWORD"]
    character = os.environ["MIR2_NATIVE_CHARACTER"]
    expect_equipment = os.environ.get("MIR2_EXPECT_EQUIPMENT") == "1"
    notice_delay = float(os.environ.get("MIR2_NOTICE_DELAY_SECONDS", "0"))
    if not 0 <= notice_delay < 120:
        raise ValueError("MIR2_NOTICE_DELAY_SECONDS must be between 0 and 120")
    first = snapshot(account, character, login(account, password, character),
                     expect_equipment, notice_delay)
    time.sleep(5.2)
    second = snapshot(account, character, login(account, password, character), expect_equipment)
    if first != second:
        raise AssertionError("old-client inventory, equipment or position changed after reconnect")
    report = {"status": "passed", "map": second["map"],
              "position": second["position"], "bagCount": len(second["bag"]),
              "equipmentSlots": sorted(second["equipment"]),
              "equipmentDurability": {str(slot): value[1:] for slot, value in second["equipment"].items()},
              "reconnects": 1, "noticeDelaySeconds": notice_delay}
    destination = ROOT / ".runtime/reports/native-bridge-reconnect.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("PASS old-client bridge login, map entry, item fields and reconnect persistence")


if __name__ == "__main__":
    main()
