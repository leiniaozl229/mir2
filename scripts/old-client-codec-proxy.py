"""Loopback-only old Mir2 6-bit codec bridge for the local OpenMir2 server."""
import asyncio
import base64
import json
import os
import struct
import sys
import time
from pathlib import Path

LOCAL_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 7000
if LOCAL_PORT not in (7000, 17100, 17200):
    raise SystemExit("Unsupported local Mir2 gate port")
UPSTREAM_PORT = LOCAL_PORT + 1
BASE64_ALPHABET = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
OLD_ALPHABET = bytes(range(60, 124))
TO_OLD = bytes.maketrans(BASE64_ALPHABET, OLD_ALPHABET)
FROM_OLD = bytes.maketrans(OLD_ALPHABET, BASE64_ALPHABET)
TO_VALUE = bytes.maketrans(OLD_ALPHABET, bytes(range(64)))
NEW_FIRST = bytes(((((first << 2) & 0xF0) | (fourth & 0x0C) | (first & 0x03)) ^ 0xAC)
                  for fourth in range(64) for first in range(64))
NEW_SECOND = bytes(((((second << 2) & 0xF0) | ((fourth << 2) & 0x0C) | (second & 0x03)) ^ 0xAC)
                   for fourth in range(64) for second in range(64))
NEW_THIRD = bytes(((third | ((fourth << 2) & 0xC0)) ^ 0xAC)
                  for fourth in range(64) for third in range(64))
TRACE = os.environ.get("MIR2_CODEC_TRACE") == "1"
ITEM_MESSAGE_IDS = {200, 201, 203, 621}
GROUND_ITEMS_PATH = os.environ.get("MIR2_GROUND_ITEMS_PATH")
if LOCAL_PORT == 17200 and not GROUND_ITEMS_PATH:
    GROUND_ITEMS_PATH = str(Path(os.environ["MIR2_NATIVE_CLIENT_EXE"]).resolve().parent.parent
                            / "native-ground-items.json")
ACTIVE_GROUND_TRACKER = None


def file_checksum(path):
    data = Path(path).read_bytes()
    data += bytes((-len(data)) % 4)
    checksum = 0
    for (word,) in struct.iter_unpack("<I", data):
        checksum ^= word
    return checksum


NATIVE_CRC = file_checksum(os.environ["MIR2_NATIVE_CLIENT_EXE"]) if LOCAL_PORT == 17200 else None


def version_frame():
    # The original client compares its own file checksum with SM_VERSION_FAIL.
    header = struct.pack("<IHHHH", NATIVE_CRC, 1106, 0, 0, 0)
    return b"#" + old_encode(header + bytes([0xAC] * 4)) + b"!"


def old_decode(data):
    # The old alphabet is standard Base64 sextets shifted into bytes 60..123.
    # A trailing lone sextet has no complete byte, matching the old decoder.
    if len(data) % 4 == 1:
        data = data[:-1]
    encoded = data.translate(FROM_OLD)
    return base64.b64decode(encoded + b"=" * (-len(encoded) % 4))


def old_encode(data):
    return base64.b64encode(data).rstrip(b"=").translate(TO_OLD)


def new_encode(data):
    result = bytearray()
    no, remainder = 2, 0
    for value in data:
        value ^= 0xAC
        if no == 6:
            result.append((value & 0x3F) + 60)
            remainder |= (value >> 2) & 0x30
            result.append(remainder + 60)
            remainder = 0
        else:
            temp = value >> 2
            result.append(((temp & 0x3C) | (value & 0x03)) + 60)
            remainder = (remainder << 2) | (temp & 0x03)
        no = no % 6 + 2
    if no != 2:
        result.append(remainder + 60)
    return bytes(result)


def new_decode(data):
    values = data.translate(TO_VALUE)
    result = bytearray()
    append = result.append
    for pos in range(0, len(values) - 3, 4):
        base = values[pos + 3] << 6
        append(NEW_FIRST[base + values[pos]])
        append(NEW_SECOND[base + values[pos + 1]])
        append(NEW_THIRD[base + values[pos + 2]])
    rem = len(values) % 4
    if rem:
        tail = values[-rem:]
        if rem == 2:
            result.append(((((tail[0] << 2) & 0xF0) | ((tail[1] << 2) & 0x0C) | (tail[0] & 0x03)) ^ 0xAC))
        elif rem == 3:
            result.append(((((tail[0] << 2) & 0xF0) | (tail[2] & 0x0C) | (tail[0] & 0x03)) ^ 0xAC))
            result.append(((((tail[1] << 2) & 0xF0) | ((tail[2] << 2) & 0x0C) | (tail[1] & 0x03)) ^ 0xAC))
    return bytes(result)


def convert(frame, to_server):
    if not frame.startswith(b"#") or not frame.endswith(b"!"):
        return frame
    if LOCAL_PORT == 17200 and not to_server:
        # This client releases its action lock only for +GOOD/ or +FAIL/.
        # OpenMir2 abbreviates the same game-gate replies to +GD/ and +FL/.
        if frame.startswith(b"#+GD/"):
            return b"#+GOOD/" + frame[5:]
        if frame.startswith(b"#+FL/"):
            return b"#+FAIL/" + frame[5:]
    marker = frame[1:2] if to_server and frame[1:2] in b"123456789" else b""
    body = frame[1 + len(marker):-1]
    if (LOCAL_PORT == 17200 and not to_server and len(body) >= 16
            and all(60 <= value <= 123 for value in body[:16])):
        header = new_decode(body[:16])
        message_id = int.from_bytes(header[4:6], "little") if len(header) == 12 else -1
        if message_id in (6, 7, 9, 10) and len(body) > 27:
            # Turn and push messages append a separately encoded name after
            # the eight-byte CharDesc (11 encoded bytes). Decoding the joined
            # fields as one stream corrupts the Chinese actor name.
            desc = body[16:27]
            name = body[27:]
            if all(60 <= value <= 123 for value in desc + name):
                return (b"#" + old_encode(header) + old_encode(new_decode(desc))
                        + old_encode(new_decode(name)) + b"!")
        if message_id == 652:
            # Shop details are encoded twice: the outer string contains a
            # slash-delimited list of individually encoded ClientItem records.
            # Convert both layers and the legacy item identity/price offsets.
            inner = new_decode(body[16:])
            fields = inner.split(b"/")
            converted = []
            for field in fields:
                if not field:
                    converted.append(field)
                    continue
                if any(value < 60 or value > 123 for value in field):
                    return frame
                item_blob = bytearray(new_decode(field))
                if len(item_blob) != 124:
                    return frame
                item_blob[44:52] = item_blob[100:108]
                converted.append(old_encode(item_blob))
            return b"#" + old_encode(header) + old_encode(b"/".join(converted)) + b"!"
        if message_id == 621:
            # The encoded header runs directly into a literal slot number;
            # the remaining fields alternate slot/item and end with '/'.
            fields = body[16:].split(b"/")
            if fields[-1] == b"":
                fields.pop()
                trailing_slash = True
            else:
                trailing_slash = False
            if len(fields) % 2:
                return frame
            converted = []
            for index in range(0, len(fields), 2):
                slot, encoded_item = fields[index:index + 2]
                if (not slot.isdigit() or not encoded_item
                        or any(value < 60 or value > 123 for value in encoded_item)):
                    return frame
                item_blob = bytearray(new_decode(encoded_item))
                if len(item_blob) != 124:
                    return frame
                item_blob[44:52] = item_blob[100:108]
                converted.extend((slot, old_encode(item_blob)))
            suffix = b"/".join(converted) + (b"/" if trailing_slash else b"")
            return b"#" + old_encode(header) + suffix + b"!"
    # Game packets can join independently encoded fields with literal '/'.
    parts = body.split(b"/")
    if not body or any(any(value < 60 or value > 123 for value in part) for part in parts):
        return frame
    if to_server:
        decoded_parts = [old_decode(part) for part in parts]
        if LOCAL_PORT == 17200 and decoded_parts[0].startswith(b"**") and decoded_parts[0].endswith(b"/0"):
            decoded_parts[0] = decoded_parts[0][:-1] + b"0000000000"
        encoded = b"/".join(new_encode(part) for part in decoded_parts)
    else:
        decoded_parts = [bytearray(new_decode(part)) for part in parts]
        if (LOCAL_PORT == 17200 and decoded_parts and len(decoded_parts[0]) >= 6
                and int.from_bytes(decoded_parts[0][4:6], "little") in ITEM_MESSAGE_IDS):
            for index, item_blob in enumerate(decoded_parts):
                offset = 12 if index == 0 else 0
                if len(item_blob) - offset == 124:
                    # This 2003 client reads MakeIndex/Dura/DuraMax from
                    # bytes 44..51 of the item payload. OpenMir2
                    # places these fields at bytes 100..107 in its newer wire
                    # structure, so copy them into the legacy slots.
                    item_blob[offset + 44:offset + 52] = item_blob[offset + 100:offset + 108]
        if (LOCAL_PORT == 17200 and decoded_parts and len(decoded_parts[0]) >= 12
                and int.from_bytes(decoded_parts[0][4:6], "little") == 1106):
            decoded_parts[0][0:4] = NATIVE_CRC.to_bytes(4, "little")
        encoded = b"/".join(old_encode(part) for part in decoded_parts)
    return b"#" + marker + encoded + b"!"


def relay_payload(frame, to_server):
    outgoing = convert(frame, to_server)
    if LOCAL_PORT != 17200 or to_server or not frame.startswith(b"#") or not frame.endswith(b"!"):
        return outgoing
    encoded = frame[1:-1].split(b"/")[0]
    if any(value < 60 or value > 123 for value in encoded):
        return outgoing
    message = new_decode(encoded)
    if len(message) >= 12 and int.from_bytes(message[4:6], "little") == 50:
        # The client's first game timer may run before the server's later check.
        return outgoing + version_frame()
    return outgoing


class GroundItemTracker:
    """Mirror ground items and monsters already visible to this client."""

    def __init__(self, path):
        self.path = Path(path)
        self.actor_id = None
        self.player_x = None
        self.player_y = None
        self.items = {}
        self.monsters = {}
        self.pending = None
        self.failed = False
        self.flush()

    def observe(self, frame, to_server):
        if not frame.startswith(b"#") or not frame.endswith(b"!"):
            return
        marker = frame[1:2] if to_server and frame[1:2] in b"123456789" else b""
        body = frame[1 + len(marker):-1]
        if len(body) < 16 or any(value < 60 or value > 123 for value in body[:16]):
            return
        header = old_decode(body[:16]) if to_server else new_decode(body[:16])
        if len(header) != 12:
            return
        recog, message_id, x, y, _series = struct.unpack("<IHHHH", header)
        changed = False
        if to_server:
            # CM_TURN/WALK/RUN pack destination X/Y into the 32-bit Recog.
            # Param and Tag contain action controls, often 0 and direction.
            target_x, target_y = recog & 0xFFFF, recog >> 16
            if (message_id in (3010, 3011, 3013) and self.actor_id is not None
                    and self._near_player(target_x, target_y, 3)):
                changed = (self.player_x, self.player_y) != (target_x, target_y)
                self.player_x, self.player_y = target_x, target_y
        elif message_id in (50, 51, 634):
            if recog and x and y:
                self.actor_id = recog
                self.player_x, self.player_y = x, y
                self.items.clear()
                self.monsters.clear()
                changed = True
        elif (message_id == 28 and recog == self.actor_id and
              self._near_player(x, y, 3)) or (message_id in (801, 807) and
              recog == self.actor_id and x and y):
            changed = (self.player_x, self.player_y) != (x, y)
            self.player_x, self.player_y = x, y
        elif message_id == 633:
            self.items.clear()
            self.monsters.clear()
            changed = True
        elif message_id in (10, 11, 13, 801, 807):
            if message_id in (10, 801, 807) and len(body) >= 27:
                description = body[16:27]
                if all(60 <= value <= 123 for value in description):
                    feature = struct.unpack_from("<I", new_decode(description))[0]
                    # The low feature byte is 0 for players and 50 for NPCs.
                    if feature & 0xFF not in (0, 50) and recog != self.actor_id:
                        previous = self.monsters.get(recog, {})
                        name = self._actor_name(body[27:]) or previous.get("name", "")
                        if name and not self._is_summon(name):
                            self.monsters[recog] = {"id": recog, "x": x, "y": y,
                                                    "name": name, "hp": previous.get("hp"),
                                                    "maxHp": previous.get("maxHp")}
                            changed = True
                        elif recog in self.monsters:
                            del self.monsters[recog]
                            changed = True
                    elif recog in self.monsters:
                        del self.monsters[recog]
                        changed = True
            elif recog in self.monsters and (x, y) != (self.monsters[recog]["x"], self.monsters[recog]["y"]):
                self.monsters[recog]["x"] = x
                self.monsters[recog]["y"] = y
                changed = True
        elif message_id == 42 and recog in self.monsters:
            name = self._actor_name(body[16:])
            if name:
                if self._is_summon(name):
                    del self.monsters[recog]
                else:
                    self.monsters[recog]["name"] = name
                changed = True
        elif message_id == 31 and recog in self.monsters and y > 0:
            hp = min(x, y)
            if (self.monsters[recog]["hp"], self.monsters[recog]["maxHp"]) != (hp, y):
                self.monsters[recog]["hp"] = hp
                self.monsters[recog]["maxHp"] = y
                changed = True
        elif message_id in (29, 30, 32, 34, 800, 806):
            changed = self.monsters.pop(recog, None) is not None
        elif message_id == 610 and len(body) > 16:
            encoded_name = body[16:]
            if all(60 <= value <= 123 for value in encoded_name):
                raw_name = new_decode(encoded_name).split(b"\0", 1)[0]
                name = raw_name.decode("gbk", errors="replace").strip()
                if name:
                    self.items[recog] = {"id": recog, "x": x, "y": y, "name": name[:40]}
                    changed = True
        elif message_id == 611:
            changed = self.items.pop(recog, None) is not None
        if changed:
            self.schedule_flush()

    def _near_player(self, x, y, distance):
        return (self.player_x is not None and self.player_y is not None and
                x > 0 and y > 0 and
                abs(x - self.player_x) <= distance and
                abs(y - self.player_y) <= distance)

    @staticmethod
    def _actor_name(encoded):
        if not encoded or any(value < 60 or value > 123 for value in encoded):
            return ""
        raw = new_decode(encoded).split(b"\0", 1)[0].split(b"/", 1)[0]
        return raw.decode("gbk", errors="replace").strip()[:40]

    @staticmethod
    def _is_summon(name):
        return name == "变异骷髅" or ("(" in name[:-1] and name.endswith(")"))

    def schedule_flush(self):
        if self.pending is None:
            self.pending = asyncio.get_running_loop().call_later(0.05, self.flush)

    def flush(self):
        self.pending = None
        if self is not ACTIVE_GROUND_TRACKER and ACTIVE_GROUND_TRACKER is not None:
            return
        document = {"actorId": self.actor_id, "x": self.player_x, "y": self.player_y,
                    "items": list(self.items.values())[:256],
                    "monsters": list(self.monsters.values())[:256]}
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.path.with_suffix(self.path.suffix + ".tmp")
            temporary.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
            os.replace(temporary, self.path)
        except OSError as error:
            if not self.failed:
                print(f"Ground item overlay state unavailable: {error}", file=sys.stderr)
                self.failed = True

    def close(self):
        if self.pending is not None:
            self.pending.cancel()
            self.pending = None
        self.player_x = self.player_y = None
        self.items.clear()
        self.monsters.clear()
        self.flush()


def trace_frame(frame, to_server, elapsed_ms):
    if not TRACE or not frame.startswith(b"#") or not frame.endswith(b"!"):
        return
    marker = frame[1:2] if to_server and frame[1:2] in b"123456789" else b""
    encoded = frame[1 + len(marker):-1].split(b"/")[0]
    if not encoded or any(value < 60 or value > 123 for value in encoded):
        return
    decoded = old_decode(encoded) if to_server else new_decode(encoded)
    fields = struct.unpack_from("<IHHHH", decoded) if len(decoded) >= 12 else (0, -1, 0, 0, 0)
    recog, message_id, param, tag, series = fields
    if LOCAL_PORT != 17200:
        print(f"codec {time.time():.3f} port={LOCAL_PORT} {'client' if to_server else 'server'} "
              f"id={message_id} bytes={len(frame)} ms={elapsed_ms:.3f}",
              file=sys.stderr, flush=True)
        return
    print(f"codec {time.time():.3f} {'client' if to_server else 'server'} id={message_id} "
          f"recog={recog} param={param} tag={tag} series={series} bytes={len(frame)} ms={elapsed_ms:.3f}",
          file=sys.stderr, flush=True)


async def handle(client_reader, client_writer):
    global ACTIVE_GROUND_TRACKER
    try:
        server_reader, server_writer = await asyncio.open_connection("127.0.0.1", UPSTREAM_PORT)
    except OSError:
        client_writer.close()
        return

    tracker = None
    if LOCAL_PORT == 17200 and GROUND_ITEMS_PATH:
        tracker = GroundItemTracker(GROUND_ITEMS_PATH)
        ACTIVE_GROUND_TRACKER = tracker
        tracker.flush()

    async def relay(reader, writer, direction):
        buffer = bytearray()
        try:
            while data := await reader.read(8192):
                buffer.extend(data)
                while buffer:
                    if buffer[0] == ord("$"):
                        writer.write(b"$")
                        await writer.drain()
                        del buffer[0]
                        continue
                    if b"!" not in buffer:
                        break
                    end = buffer.index(b"!") + 1
                    frame = bytes(buffer[:end])
                    del buffer[:end]
                    began = time.perf_counter() if TRACE else 0
                    outgoing = relay_payload(frame, direction == "client_to_gate")
                    if tracker is not None:
                        tracker.observe(frame, direction == "client_to_gate")
                    if TRACE:
                        trace_frame(frame, direction == "client_to_gate", (time.perf_counter() - began) * 1000)
                    writer.write(outgoing)
                    await writer.drain()
        except (ConnectionError, OSError):
            pass
        finally:
            writer.close()

    await asyncio.gather(relay(client_reader, server_writer, "client_to_gate"),
                         relay(server_reader, client_writer, "gate_to_client"),
                         return_exceptions=True)
    if tracker is not None:
        if ACTIVE_GROUND_TRACKER is tracker:
            tracker.close()
            ACTIVE_GROUND_TRACKER = None


async def main():
    async with await asyncio.start_server(handle, "127.0.0.1", LOCAL_PORT) as listener:
        await listener.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
