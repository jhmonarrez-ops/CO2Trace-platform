"""Minimal protobuf wire-format decoder (no schema), enough to read openLCA library indexes."""


def varint(b, i):
    n = s = 0
    while True:
        c = b[i]; i += 1
        n |= (c & 0x7F) << s; s += 7
        if c < 0x80:
            return n, i


def fields(b):
    """Yield (field_number, wire_type, value) for one message; length-delimited values are bytes."""
    i = 0
    while i < len(b):
        key, i = varint(b, i)
        f, t = key >> 3, key & 7
        if t == 0:
            v, i = varint(b, i)
        elif t == 1:
            v = b[i:i + 8]; i += 8
        elif t == 2:
            n, i = varint(b, i); v = b[i:i + n]; i += n
        elif t == 5:
            v = b[i:i + 4]; i += 4
        else:
            raise ValueError('wire type %d' % t)
        yield f, t, v


def tree(b, depth=0, maxd=4):
    """Debug view: decode nested messages where possible."""
    out = []
    for f, t, v in fields(b):
        if t == 2 and depth < maxd:
            try:
                s = v.decode('utf-8')
                if s.isprintable():
                    out.append((f, s)); continue
            except UnicodeDecodeError:
                pass
            try:
                out.append((f, tree(v, depth + 1, maxd))); continue
            except Exception:
                pass
        out.append((f, v))
    return out
