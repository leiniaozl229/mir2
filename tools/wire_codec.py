"""Wire codec matching the pinned OpenMir2 EncryptUtil implementation."""
def encode(raw):
    """OpenMir2 EncryptUtil wire format (XOR AC, rearranged six-bit groups)."""
    output = bytearray()
    for offset in range(0, len(raw), 3):
        group = [v ^ 0xac for v in raw[offset:offset + 3]]
        remainder = 0
        for i, value in enumerate(group):
            if i == 2:
                output.append((value & 63) + 0x3c)
                remainder |= (value >> 2) & 0x30
            else:
                output.append(((value >> 2) & 0x3c | value & 3) + 0x3c)
                remainder = (remainder << 2) | ((value >> 2) & 3)
        output.append(remainder + 0x3c)
    return bytes(output)


def decode(raw):
    if len(raw) % 4 == 1 or any(not 0x3c <= v <= 0x7b for v in raw):
        raise ValueError("invalid encoded packet")
    output = bytearray()
    for offset in range(0, len(raw), 4):
        group = [v - 0x3c for v in raw[offset:offset + 4]]
        remainder = group[-1]
        for i, value in enumerate(group[:-1]):
            if i == 2:
                decoded = value | ((remainder << 2) & 0xc0)
            else:
                shift = 2 if i == 1 or len(group) == 2 else 0
                decoded = ((value << 2) & 0xf0) | ((remainder << shift) & 12) | (value & 3)
            output.append(decoded ^ 0xac)
    return bytes(output)


