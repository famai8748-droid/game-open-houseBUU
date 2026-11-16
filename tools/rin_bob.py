"""Paint a schoolgirl bob onto the protagonist (seen from behind) in the funeral frames.
Usage: python -I rin_bob.py <frames_dir>   -> writes intro_s1_fN_rin.png beside each frame.

The hair is shaded like the rest of the pixel art: a dark blue-black base, a cool sheen band
across the crown (window light from the left), a few lighter strands, a warm candle rim on the
right and a rounded, curled-under bottom edge, so it reads as hair and not a black box."""
import sys, os, math
from PIL import Image

# per frame: skull left/right at its widest row, that row's y, collar top at the neck centre
HEADS = {
    'intro_s1_f0': (76, 215, 93, 166),
    'intro_s1_f1': (60, 203, 93, 166),
    'intro_s1_f2': (42, 189, 93, 166),
    'intro_s1_f4': (10, 170, 70, 166),
    'intro_s1_f5': (-20, 152, 80, 174),
}
B = 3  # art pixel block

BASE = (24, 21, 28)
DEEP = (12, 10, 15)
STRAND = (38, 36, 48)
SHEEN = (58, 64, 84)
SHEEN_HI = (82, 90, 112)
RIM = (66, 44, 34)


def mix(a, b, k):
    return tuple(int(a[i] + (b[i] - a[i]) * k) for i in range(3))


def head_top(px, cx, wy):
    y = wy
    while y > 2 and sum(px[cx, y - 1]) < 90:
        y -= 1
    return y


def paint(src, dst, xL, xR, wy, yC):
    im = Image.open(src).convert('RGB')
    px = im.load()
    W, H = im.size
    cx = (xL + xR) // 2
    cxs = min(W - 1, max(0, cx))
    top = head_top(px, cxs, wy) - 2
    half = (xR - xL) / 2 + 1          # a little volume over the skull
    yB = yC + 3                       # ends just on the collar
    for by in range(top - top % B, yB, B):
        yc = by + B / 2
        if yc < wy:                   # crown: follow the skull's ellipse
            v = (wy - yc) / max(1, wy - top)
            hw = half * math.sqrt(max(0.0, 1 - v * v))
        else:                         # fall: straight, then curl under at the ends
            t = (yc - wy) / max(1, yB - wy)
            hw = half + 1.5 * t
            if t > 0.72:
                hw -= ((t - 0.72) / 0.28) ** 2 * half * 0.35
        if hw < 2:
            continue
        lo, hi = cx - hw, cx + hw
        for bx in range(int(lo) - int(lo) % B, int(hi) + 1, B):
            xc = bx + B / 2
            if xc < lo or xc > hi:
                continue
            u = (xc - lo) / max(1, hi - lo)          # 0 left .. 1 right
            c = BASE
            # sheen: an arc across the upper crown, brightest on the window (left) side
            if yc < wy + 8:
                v = (wy - yc) / max(1, wy - top)     # 1 at the top, 0 at the widest row
                band = 1 - abs(v - (0.5 - 0.3 * (u - 0.5) ** 2 * 4)) / 0.2
                if band > 0:
                    k = band * (0.85 - 0.6 * u)
                    c = mix(c, SHEEN_HI if band > 0.7 and u < 0.4 else SHEEN, max(0, min(1, k)))
            # strands below the sheen, staggered lengths
            col = int(bx // B)
            if yc > wy + 4 and col % 5 == 2:
                end = yB - 3 * B - (col * 7 % 4) * B
                if yc < end:
                    c = mix(c, STRAND, 0.5)
            # parting shadow down the middle of the back
            if abs(xc - cx) < B and yc > wy - 6:
                c = mix(c, DEEP, 0.6)
            # cold window light on the left edge, warm candle rim on the right
            if u < 0.08 and yc > wy - 4:
                c = mix(c, SHEEN, 0.3)
            if u > 0.9 and yc > top + 6:
                c = mix(c, RIM, 0.55)
            # the curled-under ends are in shadow
            if yc > yB - 2 * B:
                c = mix(c, DEEP, 0.55)
            for yy in range(max(0, by), min(by + B, H)):
                for xx in range(max(0, bx), min(bx + B, W)):
                    px[xx, yy] = c
    im.save(dst)
    print(os.path.basename(dst), 'top', top)


d = sys.argv[1]
for f, h in HEADS.items():
    paint(os.path.join(d, f + '.png'), os.path.join(d, f + '_rin.png'), *h)
