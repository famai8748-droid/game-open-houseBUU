"""Paint a schoolgirl bob onto the protagonist (seen from behind) in the funeral frames.
Usage: python -I rin_bob.py <frames_dir>   -> writes intro_s1_fN_rin.png beside each frame."""
import sys, os
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


def paint(src, dst, xL, xR, wy, yC):
    im = Image.open(src).convert('RGB')
    px = im.load()
    W, H = im.size
    cx = (xL + xR) // 2
    samp = sorted(px[x, y] for x in range(max(0, cx - 30), cx + 30, 3) for y in range(wy - 30, wy, 3))
    base = samp[len(samp) // 2]
    shade = lambda d: tuple(max(0, min(255, c + d)) for c in base)
    yB = yC + 16
    length = yB - wy
    width = xR - xL
    for by in range(wy - wy % B, yB, B):
        t = (by - wy) / length
        flare = int(4 * t)                           # bob widens a touch toward the ends
        curl = 0
        if t > 0.78:                                 # rounded, curled-under bottom corners
            curl = int(((t - 0.78) / 0.22) ** 1.6 * 22)
        lo, hi = xL - flare + curl, xR + flare - curl
        for bx in range(lo - lo % B, hi + 1, B):
            u = (bx - xL) / max(1, width)            # 0 left .. 1 right
            c = shade(0)
            # strands: thin lighter lines that start at different heights
            k = (bx // B) % 6
            if k == 2 and 0.2 + 0.2 * ((bx // B) % 4) / 3 < t < 0.85:
                c = shade(7)
            if hi - B < bx and 0.1 < t < 0.7:           # faint warm rim from the altar candles
                c = (min(255, base[0] + 22), min(255, base[1] + 13), min(255, base[2] + 7))
            if t > 0.9 and (bx // B) % 5 in (1, 3):  # tapered, slightly uneven tips
                continue
            for yy in range(by, min(by + B, H)):
                for xx in range(max(0, bx), min(bx + B, W)):
                    px[xx, yy] = c
    im.save(dst)
    print(os.path.basename(dst), base)


d = sys.argv[1]
for f, h in HEADS.items():
    paint(os.path.join(d, f + '.png'), os.path.join(d, f + '_rin.png'), *h)
