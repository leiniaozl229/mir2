#!/usr/bin/env python3
"""Take off and re-equip one item through the 2003 client's codec bridge."""

import json
import os
import socket
import time

from native_bridge_reconnect_probe import (
    Connection, ROOT, bag_items, decode, detailed_bag, detailed_equipment, encode, item_identity,
    login, snapshot,
)


def receive_until(game, wanted, timeout=12):
    deadline = time.monotonic() + timeout
    seen = []
    while time.monotonic() < deadline:
        try:
            event = game.receive()
        except socket.timeout:
            continue
        seen.append(event["id"])
        if event["id"] in wanted:
            return event
    raise TimeoutError(f"missing old-client response {sorted(wanted)}; seen={seen}")


def wait_takeoff(game, identity):
    deadline = time.monotonic() + 12
    succeeded = False
    added = False
    while time.monotonic() < deadline and not (succeeded and added):
        try:
            event = game.receive()
        except socket.timeout:
            continue
        if event["id"] == 620:
            raise AssertionError(f"old-client take-off request was rejected, reason={event['recog']}")
        if event["id"] == 619:
            succeeded = True
        elif event["id"] == 200 and event["body"] is not None:
            added = item_identity(event["body"]) == identity
    if not (succeeded and added):
        raise TimeoutError("take-off did not return both success and the item-added packet")
    # The old server erroneously emitted a failure after success. Keep watching
    # briefly so this regression is caught even if the messages arrive apart.
    original_timeout = game.sock.gettimeout()
    game.sock.settimeout(0.2)
    try:
        end = time.monotonic() + 0.8
        while time.monotonic() < end:
            try:
                if game.receive()["id"] == 620:
                    raise AssertionError("take-off returned failure after success")
            except socket.timeout:
                pass
    finally:
        game.sock.settimeout(original_timeout)


def open_game(account, character, ticket):
    game = Connection(17200)
    handshake = (f"**{account}/{character}/{ticket}/20030422/"
                 f"{int(ticket) ^ 0xf2e44fff}/000000000000000000000000000000/0")
    game.sock.sendall(b"#1" + encode(handshake.encode("gbk")) + b"!")
    bag = None
    bag_details = None
    bag_metadata = {}
    equipment = None
    map_name = None
    position = None
    level = None
    ability_hex = None
    actors = {}
    names = {}
    requested_bag = False
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        event = game.receive()
        ident = event["id"]
        if ident in (10, 11, 13):
            actors[event["recog"]] = (event["param"], event["tag"])
        elif ident == 42 and event["body"]:
            names[event["recog"]] = event["body"].decode("gbk").split("/")[0]
        if ident == 658:
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
            bag_details = detailed_bag(event)
            for field in event["wireBody"].split(b"/"):
                if field:
                    raw = decode(field)
                    bag_metadata[item_identity(raw)[0]] = {
                        "stdMode": raw[15], "weight": raw[17],
                        "need": raw[36], "needLevel": raw[37],
                    }
        elif ident == 621:
            equipment = detailed_equipment(event)
        elif ident == 52 and event["body"]:
            level = event["body"][0]
            ability_hex = event["body"].hex()
        if all(value is not None for value in (map_name, position, bag, equipment)):
            return game, {"map": map_name, "position": position, "bag": bag,
                          "equipment": {slot: item[0] for slot, item in equipment.items()}}, equipment, bag_details, {"level": level, "abilityHex": ability_hex, "bag": bag_metadata, "actors": actors, "names": names}
    game.close()
    raise TimeoutError("old-client bridge did not provide a complete initial equipment snapshot")


def main():
    account = os.environ["MIR2_NATIVE_ACCOUNT"]
    password = os.environ["MIR2_NATIVE_PASSWORD"]
    character = os.environ["MIR2_NATIVE_CHARACTER"]
    slot = int(os.environ.get("MIR2_EQUIPMENT_SLOT", "1"))
    game, before, details, bag_details, metadata = open_game(account, character, login(account, password, character))
    if os.environ.get("MIR2_NPC_INSPECT") == "1":
        trainer = next((actor for actor, pos in metadata["actors"].items()
                        if tuple(pos) == (284, 609)), None)
        if trainer is None:
            game.close()
            raise AssertionError("P0 trainer is not visible at 284,609")
        game.send(1010, recog=trainer)
        dialogue = receive_until(game, {643})
        print(json.dumps({"npcId": trainer,
                          "dialogue": dialogue["body"].decode("gbk")}, ensure_ascii=True))
        game.close()
        return
    if os.environ.get("MIR2_NEARBY_INSPECT") == "1":
        original_timeout = game.sock.gettimeout()
        game.sock.settimeout(0.3)
        try:
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                try:
                    event = game.receive()
                except socket.timeout:
                    continue
                if event["id"] in (10, 11, 13):
                    metadata["actors"][event["recog"]] = (event["param"], event["tag"])
                elif event["id"] == 42 and event["body"]:
                    metadata["names"][event["recog"]] = event["body"].decode("gbk").split("/")[0]
        finally:
            game.sock.settimeout(original_timeout)
        x, y = before["position"]
        nearby = [dict(id=actor, x=pos[0], y=pos[1],
                       name=metadata["names"].get(actor, ""))
                  for actor, pos in metadata["actors"].items()
                  if max(abs(pos[0] - x), abs(pos[1] - y)) <= 5]
        print(json.dumps({"position": before["position"], "level": metadata["level"],
                          "nearby": nearby}, ensure_ascii=True))
        game.close()
        return
    if os.environ.get("MIR2_EQUIPMENT_INSPECT") == "1":
        print(json.dumps({"equipment": details, "bag": bag_details,
                          "metadata": metadata}, ensure_ascii=True))
        game.close()
        return
    if os.environ.get("MIR2_LEVEL_SEVEN_RESTORE") == "1":
        restore_index = int(os.environ["MIR2_RESTORE_MAKE_INDEX"])
        candidate = next(((identity, name) for identity, name in bag_details
                          if identity[0] == restore_index), None)
        if candidate is None or slot in details:
            game.close()
            raise AssertionError("original item is not in the bag or its slot is not empty")
        identity, name = candidate
        trainer = next((actor for actor, pos in metadata["actors"].items()
                        if tuple(pos) == (284, 609)), None)
        if trainer is None:
            game.close()
            raise AssertionError("P0 trainer is not visible at 284,609")
        original_level = metadata["level"]
        try:
            game.send(1010, recog=trainer)
            dialogue = receive_until(game, {643})
            if b"@levelseven" not in dialogue["body"]:
                raise AssertionError("P0 trainer does not expose the seven-level test action")
            game.send(1011, encode(b"@levelseven"), recog=trainer)
            level_up = receive_until(game, {45})
            if level_up["param"] != 7:
                raise AssertionError("P0 trainer did not set the test character to level seven")
            game.send(1003, encode(name.encode("gbk")), recog=restore_index, param=slot)
            reply = receive_until(game, {615, 616})
            if reply["id"] != 615:
                raise AssertionError(f"item restoration still failed, reason={reply['recog']}")
        finally:
            game.close()
        time.sleep(5.2)
        verification, after, _, _, after_metadata = open_game(
            account, character, login(account, password, character))
        verification.close()
        if after["equipment"].get(slot) != identity or identity in after["bag"]:
            raise AssertionError("restored bracelet did not persist in its original slot")
        if after_metadata["level"] != 7:
            raise AssertionError("test character level did not persist")
        report = {"status": "passed", "originalLevel": original_level,
                  "testLevel": after_metadata["level"], "restoredSlot": slot,
                  "itemMakeIndex": restore_index, "bagCount": len(after["bag"]),
                  "equipmentCount": len(after["equipment"])}
        destination = ROOT / ".runtime/reports/native-bridge-equipment-restore.json"
        destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
        print("PASS P0 trainer level change and old-client equipment restoration")
        return
    restore_index = int(os.environ.get("MIR2_RESTORE_MAKE_INDEX", "0"))
    if restore_index:
        candidate = next(((identity, name) for identity, name in bag_details
                          if identity[0] == restore_index), None)
        if candidate is None:
            game.close()
            raise AssertionError("item to restore is missing from the bag")
        identity, name = candidate
        game.send(1003, encode(name.encode("gbk")), recog=restore_index, param=slot)
        reply = receive_until(game, {615, 616})
        game.close()
        if reply["id"] != 615:
            raise AssertionError(f"old-client restoration was rejected, reason={reply['recog']}")
        time.sleep(5.2)
        after = snapshot(account, character, login(account, password, character), True)
        if after["equipment"].get(slot) != identity or identity in after["bag"]:
            raise AssertionError("restored item did not persist in its original slot")
        print(f"PASS restored equipment slot {slot} through old-client bridge")
        return
    if slot not in details:
        game.close()
        raise AssertionError(f"test slot {slot} is empty")
    identity, name, item_meta = details[slot]
    ability_hex = metadata["abilityHex"]
    if ability_hex is None:
        game.close()
        raise AssertionError("ability snapshot is missing; refusing to alter equipment")
    ability = bytes.fromhex(ability_hex)
    if item_meta["need"] != 0 or ability[0] < item_meta["needLevel"]:
        game.close()
        raise AssertionError("test item cannot be re-equipped at this character level")
    if slot in (1, 2):
        if ability[38] > ability[39] or item_meta["weight"] > ability[39]:
            game.close()
            raise AssertionError("test character is over the hand-weight limit")
    elif ability[36] > ability[37]:
        game.close()
        raise AssertionError("test character is over the wearable-weight limit")
    if len(before["bag"]) >= 45:
        game.close()
        raise AssertionError("test bag is too full to safely remove equipment")
    make_index = identity[0]
    item_body = encode(name.encode("gbk"))
    takeoff_sent = False
    restored = False
    try:
        game.send(1004, item_body, recog=make_index, param=slot)
        takeoff_sent = True
        wait_takeoff(game, identity)
        game.send(1003, item_body, recog=make_index, param=slot)
        takeon_reply = receive_until(game, {615, 616})
        if takeon_reply["id"] != 615:
            raise AssertionError(f"old-client take-on request was rejected, reason={takeon_reply['recog']}")
        restored = True
    finally:
        if takeoff_sent and not restored:
            # The test character must retain its original gear on error.
            try:
                game.send(1003, item_body, recog=make_index, param=slot)
                restored = receive_until(game, {615, 616})["id"] == 615
            except (OSError, TimeoutError):
                pass
        game.close()
        if takeoff_sent and not restored:
            raise RuntimeError(f"equipment slot {slot} may need manual restoration")

    time.sleep(5.2)
    after = snapshot(account, character, login(account, password, character), True)
    if after != before:
        raise AssertionError("equipment, durability, bag or position changed after the equipment cycle")
    report = {"status": "passed", "slot": slot, "itemMakeIndex": make_index,
              "durability": list(identity[1:]), "bagCount": len(after["bag"]),
              "equipmentCount": len(after["equipment"]), "reconnected": True}
    destination = ROOT / ".runtime/reports/native-bridge-equipment.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("PASS old-client take-off, bag addition, take-on and reconnect persistence")


if __name__ == "__main__":
    main()
