"""Loopback-only old Mir2 6-bit codec bridge for the local OpenMir2 server."""
import asyncio
import base64
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
        if len(header) == 12 and int.from_bytes(header[4:6], "little") == 621:
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
        if LOCAL_PORT == 17200 and marker == b"5" and decoded_parts[0].startswith(b"**") and decoded_parts[0].endswith(b"/0"):
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


def trace_frame(frame, to_server, elapsed_ms):
    if not TRACE or LOCAL_PORT != 17200 or not frame.startswith(b"#") or not frame.endswith(b"!"):
        return
    marker = frame[1:2] if to_server and frame[1:2] in b"123456789" else b""
    encoded = frame[1 + len(marker):-1].split(b"/")[0]
    if not encoded or any(value < 60 or value > 123 for value in encoded):
        return
    decoded = old_decode(encoded) if to_server else new_decode(encoded)
    fields = struct.unpack_from("<IHHHH", decoded) if len(decoded) >= 12 else (0, -1, 0, 0, 0)
    recog, message_id, param, tag, series = fields
    print(f"codec {time.time():.3f} {'client' if to_server else 'server'} id={message_id} "
          f"recog={recog} param={param} tag={tag} series={series} bytes={len(frame)} ms={elapsed_ms:.3f}",
          file=sys.stderr, flush=True)


async def handle(client_reader, client_writer):
    try:
        server_reader, server_writer = await asyncio.open_connection("127.0.0.1", UPSTREAM_PORT)
    except OSError:
        client_writer.close()
        return

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


async def main():
    async with await asyncio.start_server(handle, "127.0.0.1", LOCAL_PORT) as listener:
        await listener.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
