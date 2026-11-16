"""Render the API's concentration samples as a small PNG without extra packages."""
import struct
import zlib


def render(points):
    width, height = 720, 320
    left, top, right, bottom = 56, 24, 22, 42
    x2, y2 = width - right, height - bottom
    pixels = bytearray((13, 20, 31) * (width * height))

    def dot(x, y, color):
        if 0 <= x < width and 0 <= y < height:
            i = (y * width + x) * 3
            pixels[i:i + 3] = bytes(color)

    def line(x0, y0, x1, y1, color, thick=1):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        error = dx + dy
        while True:
            for offset in range(-(thick // 2), (thick + 1) // 2):
                dot(x0, y0 + offset, color)
            if x0 == x1 and y0 == y1:
                break
            doubled = 2 * error
            if doubled >= dy:
                error += dy
                x0 += sx
            if doubled <= dx:
                error += dx
                y0 += sy

    for part in range(5):
        y = top + round((y2 - top) * part / 4)
        line(left, y, x2, y, (39, 54, 69))
    for part in range(7):
        x = left + round((x2 - left) * part / 6)
        line(x, top, x, y2, (39, 54, 69))
    line(left, top, left, y2, (135, 153, 170), 2)
    line(left, y2, x2, y2, (135, 153, 170), 2)

    day_start = points[0]["time"]
    day = [point for point in points if point["time"] <= day_start + 24 * 3600000]
    maximum = max((point["bloodMgL"] for point in day), default=0)
    if maximum > 0 and len(day) > 1:
        coords = [(left + round(i * (x2 - left) / (len(day) - 1)),
                   y2 - round(point["bloodMgL"] / maximum * (y2 - top) * .9))
                  for i, point in enumerate(day)]
        for (x0, y0), (x1, y1) in zip(coords, coords[1:]):
            line(x0, y0, x1, y1, (122, 203, 255), 3)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    raw = b"".join(b"\0" + pixels[y * width * 3:(y + 1) * width * 3]
                   for y in range(height))
    return (b"\x89PNG\r\n\x1a\n" +
            chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 2, 0, 0, 0)) +
            chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b""))
