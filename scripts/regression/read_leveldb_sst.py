#!/usr/bin/env python3
"""Read-only LevelDB .ldb/.sst reader. Python stdlib only (including Snappy decoding).

This is intentionally a minimal auditor for immutable LevelDB table records,
not a general live LevelDB database client or writer.
"""
from pathlib import Path
import struct
import sys


def varint(b, i):
    val = 0
    for n in range(10):
        if i >= len(b):
            raise ValueError('Truncated varint')
        z = b[i]; i += 1
        val |= (z & 127) << (7 * n)
        if z < 128:
            return val, i
    raise ValueError('Overlong varint')


def handle(b, idx):
    off, idx = varint(b, idx)
    sz, idx = varint(b, idx)
    return (off, sz), idx


def decode_snappy(b):
    """Decode raw (non-framed) Snappy block; supports all four tag forms."""
    length, i = varint(b, 0)
    out = bytearray()
    while i < len(b):
        tag = b[i]; i += 1
        kind = tag & 3
        if kind == 0:
            n = tag >> 2
            if n < 60:
                n += 1
            else:
                nb = n - 59
                if i + nb > len(b):
                    raise ValueError('Truncated Snappy literal length')
                n = int.from_bytes(b[i:i+nb], 'little') + 1
                i += nb
            if i + n > len(b):
                raise ValueError('Truncated Snappy literal')
            out.extend(b[i:i+n]); i += n
        else:
            if kind == 1:
                n = 4 + ((tag >> 2) & 7)
                if i >= len(b):
                    raise ValueError('Truncated Snappy copy-1 offset')
                offset = ((tag & 0xe0) << 3) | b[i]
                i += 1
            elif kind == 2:
                n = 1 + (tag >> 2)
                if i + 2 > len(b):
                    raise ValueError('Truncated Snappy copy-2 offset')
                offset = int.from_bytes(b[i:i+2], 'little')
                i += 2
            else:
                n = 1 + (tag >> 2)
                if i + 4 > len(b):
                    raise ValueError('Truncated Snappy copy-4 offset')
                offset = int.from_bytes(b[i:i+4], 'little')
                i += 4
            if offset < 1 or offset > len(out):
                raise ValueError('Invalid Snappy backreference')
            for _ in range(n):
                out.append(out[-offset])
        if len(out) > length:
            raise ValueError('Snappy decoded more than claimed length')
    if len(out) != length:
        raise ValueError(f'Snappy length mismatch: expected {length}, got {len(out)}')
    return bytes(out)


def block(f, h):
    off, sz = h
    if off < 0 or sz < 0 or off + sz + 5 > len(f):
        raise ValueError('Out-of-bounds LevelDB table block')
    data = f[off:off+sz]
    typ = f[off+sz]
    if typ == 0:
        return data
    if typ == 1:
        return decode_snappy(data)
    raise ValueError(f'Unsupported compression {typ} at {off}')


def entries(b):
    if len(b) < 4:
        raise ValueError('Truncated restart count')
    count = struct.unpack('<I', b[-4:])[0]
    boundary = len(b) - 4 - 4*count
    if boundary < 0:
        raise ValueError('Bad block restart array')
    pos = 0
    last = b''
    while pos < boundary:
        shared, pos = varint(b, pos)
        unshared, pos = varint(b, pos)
        vlen, pos = varint(b, pos)
        if shared > len(last) or pos + unshared + vlen > boundary:
            raise ValueError('Truncated LevelDB entry')
        key = last[:shared] + b[pos:pos+unshared]
        pos += unshared
        val = b[pos:pos+vlen]
        pos += vlen
        yield key, val
        last = key


def sst(path):
    f = Path(path).read_bytes()
    if len(f) < 48 or f[-8:] != bytes.fromhex('57fb808b247547db'):
        raise ValueError(f'Bad LevelDB table magic: {path}')
    footer = f[-48:-8]
    _meta, idx = handle(footer, 0)
    index, _ = handle(footer, idx)
    for _key, h in entries(block(f, index)):
        data, _ = handle(h, 0)
        for key, value in entries(block(f, data)):
            yield key, value

if __name__ == '__main__':
    for p in sys.argv[1:]:
        vals = list(sst(p))
        print(Path(p).name, len(vals), 'records')
