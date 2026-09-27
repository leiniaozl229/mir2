#!/usr/bin/env python3
"""Exercise a safe-zone NPC and one reversible step through the 2003 bridge."""

import json
import os
import socket
import time

from native_bridge_equipment_probe import open_game
from native_bridge_reconnect_probe import ROOT, login, snapshot


DIRECTIONS = ((0, -1), (1, -1), (1, 0), (1, 1),
              (0, 1), (-1, 1), (-1, 0), (-1, -1))
TRAINER_POSITION = (284, 609)


def wait_for(game, predicate, timeout=12):
    deadline = time.monotonic() + timeout
    seen = []
    while time.monotonic() < deadline:
        try:
            event = game.receive()
        except socket.timeout:
            continue
        seen.append(event["id"])
        if predicate(event):
            return event
    raise TimeoutError(f"old-client response missing; messageIds={seen}")


def walk(game, position, direction):
    dx, dy = DIRECTIONS[direction]
    target = (position[0] + dx, position[1] + dy)
    game.send(3011, recog=target[0] | (target[1] << 16), tag=direction)
    reply = wait_for(game, lambda event: event["id"] == -1 and
                     (event["body"].startswith(b"+GOOD/") or
                      event["body"].startswith(b"+FAIL/")))
    if reply["body"].startswith(b"+FAIL/"):
        raise AssertionError(f"old-client walk rejected: {position} -> {target}")
    return target


def main():
    account = os.environ["MIR2_NATIVE_ACCOUNT"]
    password = os.environ["MIR2_NATIVE_PASSWORD"]
    character = os.environ["MIR2_NATIVE_CHARACTER"]
    game, before, _, _, metadata = open_game(account, character, login(account, password, character))
    current = before["position"]
    if before["map"] != "0" or max(abs(current[0] - TRAINER_POSITION[0]),
                                    abs(current[1] - TRAINER_POSITION[1])) > 2:
        game.close()
        raise AssertionError("test character is not beside the P0 safe-zone trainer")
    trainer = next((actor for actor, pos in metadata["actors"].items()
                    if tuple(pos) == TRAINER_POSITION), None)
    if trainer is None:
        game.close()
        raise AssertionError("P0 trainer was not present in the old-client actor stream")

    moved = False
    restored = False
    try:
        game.send(1010, recog=trainer)
        dialogue = wait_for(game, lambda event: event["id"] == 643)
        if not dialogue["body"] or b"@levelseven" not in dialogue["body"]:
            raise AssertionError("old-client NPC dialogue was missing its expected action")
        # East and west of the test character are within the prepared safe zone.
        # Retry another empty adjacent cell only if the first step is rejected.
        occupied = set(tuple(pos) for pos in metadata["actors"].values())
        choices = [direction for direction in (2, 4, 6, 0)
                   if (current[0] + DIRECTIONS[direction][0],
                       current[1] + DIRECTIONS[direction][1]) not in occupied]
        if not choices:
            raise AssertionError("no empty adjacent safe-zone cell")
        failures = []
        for direction in choices:
            try:
                current = walk(game, current, direction)
                moved = True
                break
            except AssertionError as exc:
                failures.append(str(exc))
                time.sleep(0.3)
        if not moved:
            raise AssertionError("all adjacent walks were rejected: " + "; ".join(failures))
        current = walk(game, current, (direction + 4) % 8)
        restored = current == before["position"]
        if not restored:
            raise AssertionError("return step did not reach the original position")
    finally:
        if moved and not restored:
            try:
                walk(game, current, (direction + 4) % 8)
            except (AssertionError, ConnectionError, OSError, TimeoutError):
                pass
        game.close()

    time.sleep(5.2)
    after = snapshot(account, character, login(account, password, character), True)
    if after != before:
        raise AssertionError("old-client NPC/movement test changed the persistent character snapshot")
    report = {"status": "passed", "map": after["map"],
              "position": after["position"], "trainerDialogue": True,
              "stepDirection": direction, "returnedToStart": True,
              "bagCount": len(after["bag"]), "equipmentCount": len(after["equipment"])}
    destination = ROOT / ".runtime/reports/native-bridge-world.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("PASS old-client NPC dialogue, reversible walk and reconnect persistence")


if __name__ == "__main__":
    main()
