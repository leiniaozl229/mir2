"""Loopback-only old Mir2 6-bit codec bridge for the local OpenMir2 server."""
import asyncio
import os
import struct
import sys
from pathlib import Path

LOCAL_PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 7000
if LOCAL_PORT not in (7000, 17100, 17200):
    raise SystemExit("Unsupported local Mir2 gate port")
UPSTREAM_PORT = LOCAL_PORT + 1


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
    bits = "".join(f"{byte - 60:06b}" for byte in data)
    return bytes(int(bits[i:i + 8], 2) for i in range(0, len(bits) - 7, 8))


def old_encode(data):
    bits = "".join(f"{byte:08b}" for byte in data)
    bits += "0" * ((-len(bits)) % 6)
    return bytes(int(bits[i:i + 6], 2) + 60 for i in range(0, len(bits), 6))


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
    result = bytearray()
    for pos in range(0, len(data) - 3, 4):
        first, second, third, fourth = (value - 60 for value in data[pos:pos + 4])
        result.append((((first << 2) & 0xF0) | (fourth & 0x0C) | (first & 0x03)) ^ 0xAC)
        result.append((((second << 2) & 0xF0) | ((fourth << 2) & 0x0C) | (second & 0x03)) ^ 0xAC)
        result.append((third | ((fourth << 2) & 0xC0)) ^ 0xAC)
    rem = len(data) % 4
    if rem:
        tail = [value - 60 for value in data[-rem:]]
        if rem == 2:
            result.append(((((tail[0] << 2) & 0xF0) | ((tail[1] << 2) & 0x0C) | (tail[0] & 0x03)) ^ 0xAC))
        elif rem == 3:
            result.append(((((tail[0] << 2) & 0xF0) | (tail[2] & 0x0C) | (tail[0] & 0x03)) ^ 0xAC))
            result.append(((((tail[1] << 2) & 0xF0) | ((tail[2] << 2) & 0x0C) | (tail[1] & 0x03)) ^ 0xAC))
    return bytes(result)


def convert(frame, to_server):
    if not frame.startswith(b"#") or not frame.endswith(b"!"):
        return frame
    marker = frame[1:2] if to_server and frame[1:2] in b"123456789" else b""
    body = frame[1 + len(marker):-1]
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
                    outgoing = relay_payload(frame, direction == "client_to_gate")
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
