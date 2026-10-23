"""THE SMOKE — the token builder's part library (0.5.25).

Every part is a hand-drawn vector piece in the house token style (the same geometry as the people tokens: bone shapes,
ink detail, soft shadow, a neon ring), on one 512 x 512 canvas, seen from directly above and FACING THE TOP EDGE.
The builder stacks the parts, rotates the figure to face the bottom edge like every other token, adds the ring and
the shadow, and renders a 512 x 512 WebP.

Art standard (keep new parts to it):
  * canvas 512 x 512, centre (256, 256); the figure faces up; head centre (256, 234), radius 58;
  * shoulders (medium build) are the ellipse (256, 256) rx 150 ry 70; arms (256 +/- 132, 270) rx 30 ry 58;
    hands (256 +/- 132, 210) r 15; the stance is a stride: left shoe forward at (216, 164), right shoe back at (294, 356);
  * the builder scales everything below z 100 for slim (x .88) and heavy (x 1.19) builds; the head (z >= 100) is never
    scaled;
  * colours are slots, written var(--slot): skin, hair, top, outer, legs, shoes, hat, acc (faction trim), bag, glove,
    each with -dark and -light shades made by the builder. Ink is #0a0d10. Fixed colours are fine for metal, glass and
    hi-vis tape;
  * each part file holds one or more <g data-z="N"> groups (sorted by z across all parts); a group may carry
    data-tag="cap" or similar so a hat can hide just that piece of the hair.

Usage: python3 scripts/tokens/draw_parts.py   (from the system folder) -> assets/tokens/builder/**.svg + data/token-builder.json
"""
import json, math, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'tokens', 'builder')
C = 256.0
INK = '#0a0d10'
HX, HY, HR = C, C - 22, 58           # head
SW, SD = 150, 70                      # shoulders (medium)
AX, AY, ARX, ARY = 132, C + 14, 30, 58  # arms (x offset from centre)
HANDY = C - 46                        # hands


def f(v): return f'{v:.1f}'.rstrip('0').rstrip('.') if isinstance(v, float) else str(v)
def circle(cx, cy, r, fill, extra=''): return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{fill}"{extra}/>'
def ellipse(cx, cy, rx, ry, fill, extra=''): return f'<ellipse cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" fill="{fill}"{extra}/>'
def rect(x, y, w, h, fill, rx=0, extra=''): return f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" rx="{f(rx)}" fill="{fill}"{extra}/>'
def line(x1, y1, x2, y2, stroke, w, extra=''): return f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="{stroke}" stroke-width="{f(w)}" stroke-linecap="round"{extra}/>'
def path(d, fill='none', extra=''): return f'<path d="{d}" fill="{fill}"{extra}/>'
def stroke(colour, w, op=None, cap='round'): return f' stroke="{colour}" stroke-width="{f(w)}" stroke-linecap="{cap}" stroke-linejoin="round"' + (f' opacity="{op}"' if op is not None else '')
def poly(points, fill, extra=''): return f'<path d="M{" L".join(f"{f(x)},{f(y)}" for x, y in points)} Z" fill="{fill}"{extra}/>'
def g(z, body, tag=None): return f'<g data-z="{z}"' + (f' data-tag="{tag}"' if tag else '') + f'>{body}</g>'
V = lambda slot: f'var(--{slot})'


def ellipse_cap(cx, cy, rx, ry, ycut, keep='below', n=28):
    """The part of an ellipse on one side of the horizontal line y = ycut, as a closed polygon (sleeves, hems)."""
    pts = []
    for i in range(n * 4 + 1):
        a = 2 * math.pi * i / (n * 4)
        x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
        if (keep == 'below' and y >= ycut) or (keep == 'above' and y <= ycut): pts.append((x, y))
    # close along the cut
    if not pts: return []
    pts.sort(key=lambda p: math.atan2(p[1] - cy, p[0] - cx))
    return pts


def ellipse_band(cx, cy, rx, ry, y0, y1, n=40):
    """The slice of an ellipse between y0 and y1 (y0 < y1), as a polygon."""
    def xs(y):
        t = 1 - ((y - cy) / ry) ** 2
        return rx * math.sqrt(max(0.0, t))
    ys = [y0 + (y1 - y0) * i / n for i in range(n + 1)]
    left = [(cx - xs(y), y) for y in ys]
    right = [(cx + xs(y), y) for y in reversed(ys)]
    return left + right


def hlines_in_ellipse(cx, cy, rx, ry, ys, colour, w, op=None):
    out = []
    for y in ys:
        t = 1 - ((y - cy) / ry) ** 2
        if t <= 0: continue
        dx = rx * math.sqrt(t) * 0.94
        out.append(line(cx - dx, y, cx + dx, y, colour, w, f' opacity="{op}"' if op else ''))
    return ''.join(out)


def arc_q(x1, y1, qx, qy, x2, y2): return f'M{f(x1)},{f(y1)} Q{f(qx)},{f(qy)} {f(x2)},{f(y2)}'


# ------------------------------------------------------------------------------------------------- shared shapes
def torso(fill, rx=SW, ry=SD, extra=''): return ellipse(C, C, rx, ry, fill, extra)
def arms(fill, rx=ARX, ry=ARY, extra=''): return ''.join(ellipse(C + s * AX, AY, rx, ry, fill, extra) for s in (-1, 1))
def sleeves_short(fill, cut=C - 2):
    out = ''
    for s in (-1, 1):
        pts = ellipse_band(C + s * AX, AY, ARX + 1, ARY + 1, cut, AY + ARY + 1)
        out += poly(pts, fill) + line(C + s * AX - ARX * .92, cut, C + s * AX + ARX * .92, cut, INK, 3, ' opacity=".35"')
    return out
def cuffs(fill, y=C - 36, h=10):
    return ''.join(poly(ellipse_band(C + s * AX, AY, ARX + .5, ARY + .5, y, y + h), fill) for s in (-1, 1))
def collar_ring(colour, w=10, r=64): return f'<circle cx="{f(HX)}" cy="{f(HY)}" r="{f(r)}" fill="none"{stroke(colour, w)}/>'
def back_seam(op=.45): return line(C, C - SD + 10, C, C + SD - 8, INK, 4, f' opacity="{op}"')
JACKET_LINES = (line(C, C - SD + 8, C, C + SD - 8, INK, 5, ' opacity=".5"') +
                ''.join(path(f'M{f(C + s * 30)},{f(C - SD + 6)} L{f(C + s * 62)},{f(C - 8)}', 'none', stroke(INK, 5, .45)) for s in (-1, 1)))


PARTS = []   # (category, id, label, svg body, meta)
def part(category, pid, label, body, **meta): PARTS.append((category, pid, label, body, meta))

# ------------------------------------------------------------------------------------------------- body (always on)
part('body', 'base', 'Body', g(20, arms(V('skin'))), always=True)
part('body', 'hands', 'Hands', g(70, ''.join(circle(C + s * AX, HANDY, 15, V('glove'), stroke(INK, 3, .55)) for s in (-1, 1))), always=True)
part('body', 'head', 'Head', g(99, ''.join(ellipse(HX + s * 57, HY + 2, 9, 14, V('skin'), stroke(INK, 3, .55)) for s in (-1, 1)) +
     path(f'M{f(HX - 10)},{f(HY - HR + 2)} L{f(HX)},{f(HY - HR - 12)} L{f(HX + 10)},{f(HY - HR + 2)}', V('skin'))) +
     g(100, circle(HX, HY, HR, V('skin'), stroke(INK, 4))), always=True)

# ------------------------------------------------------------------------------------------------- shoes (stride)
FS, BS = (C - 40, C - 92), (C + 38, C + 100)   # front shoe, back shoe centres
def shoe_pair(body_fn):
    return g(10, body_fn(*FS, 'front') + body_fn(*BS, 'back'))
def sh_trainer(x, y, end):
    return (ellipse(x, y, 16, 26, V('shoes'), stroke('#ece4cf', 4)) + ellipse(x, y - 12, 10, 10, V('shoes-light')) +
            path(f'M{f(x - 10)},{f(y + 6)} Q{f(x)},{f(y - 2)} {f(x + 11)},{f(y - 10)}', 'none', stroke(V('acc'), 4)))
def sh_hightop(x, y, end):
    return (ellipse(x, y, 17, 27, V('shoes'), stroke('#ece4cf', 4)) + ellipse(x, y + 12, 12, 9, V('shoes-dark')) +
            ''.join(line(x - 6, y - 10 + i * 7, x + 6, y - 10 + i * 7, '#ece4cf', 2.5) for i in range(3)))
def sh_runner(x, y, end):
    return (ellipse(x, y, 15, 26, V('shoes'), stroke(V('shoes-dark'), 4)) + path(f'M{f(x - 14)},{f(y + 4)} L{f(x + 14)},{f(y - 4)}', 'none', stroke('#ece4cf', 4)) +
            ellipse(x, y - 16, 7, 8, V('shoes-light')))
def sh_boot(x, y, end):
    return (ellipse(x, y, 17, 27, V('shoes'), stroke(INK, 3, .6)) + ellipse(x, y + 12, 13, 10, V('shoes-dark')) +
            ''.join(circle(x + s * 6, y - 8 + i * 7, 2, '#c9b48a') for s in (-1, 1) for i in range(3)))
def sh_workboot(x, y, end):
    return (ellipse(x, y, 19, 29, V('shoes'), stroke(INK, 3, .6)) + ellipse(x, y - 14, 13, 11, V('shoes-light')) +
            path(f'M{f(x - 15)},{f(y + 8)} Q{f(x)},{f(y + 2)} {f(x + 15)},{f(y + 8)}', 'none', stroke(V('shoes-dark'), 4)))
def sh_smart(x, y, end):
    return (path(f'M{f(x)},{f(y - 30)} Q{f(x + 17)},{f(y - 12)} {f(x + 14)},{f(y + 14)} Q{f(x)},{f(y + 28)} {f(x - 14)},{f(y + 14)} Q{f(x - 17)},{f(y - 12)} {f(x)},{f(y - 30)} Z', V('shoes'), stroke(INK, 2.5, .6)) +
            path(f'M{f(x - 5)},{f(y - 18)} Q{f(x)},{f(y - 24)} {f(x + 5)},{f(y - 18)}', 'none', stroke('#ffffff', 3, .55)))
def sh_slider(x, y, end):
    return (ellipse(x, y, 15, 25, '#ece4cf', stroke(INK, 2.5, .4)) + rect(x - 16, y - 10, 32, 14, V('shoes'), 6, stroke(INK, 2, .45)) +
            ''.join(circle(x - 8 + i * 5.5, y - 22, 3, V('skin')) for i in range(4)))
def sh_heel(x, y, end):
    return (path(f'M{f(x)},{f(y - 28)} Q{f(x + 13)},{f(y - 8)} {f(x + 10)},{f(y + 10)} L{f(x - 10)},{f(y + 10)} Q{f(x - 13)},{f(y - 8)} {f(x)},{f(y - 28)} Z', V('shoes'), stroke(INK, 2.5, .55)) +
            circle(x, y + 18, 5, V('shoes-dark')) + ellipse(x, y - 6, 6, 9, V('skin')))
for pid, label, fn, colour in [('trainers', 'Trainers', sh_trainer, '#f1ede2'), ('hightops', 'High-tops', sh_hightop, '#16181c'), ('runners', 'Running shoes', sh_runner, '#ff5a6e'),
                               ('boots', 'Boots', sh_boot, '#3a2a1e'), ('workboots', 'Work boots', sh_workboot, '#b0864e'), ('smart', 'Smart shoes', sh_smart, '#16181c'),
                               ('sliders', 'Sliders & socks', sh_slider, '#16181c'), ('heels', 'Heels', sh_heel, '#6e2a35')]:
    part('shoes', pid, label, shoe_pair(fn), colour='shoes', default=colour)

# ------------------------------------------------------------------------------------------------- legs (bottoms)
FL = (C - 56, C - 86, 32, 30)   # front leg segment x, y, w, h (over the back of the front shoe)
BL = (C + 22, C + 58, 32, 40)   # back leg segment
def legs(fill, w_adj=0, extra=''):
    (fx, fy, fw, fh), (bx, by, bw, bh) = FL, BL
    return rect(fx + w_adj / 2, fy, fw - w_adj, fh, fill, 12, extra) + rect(bx + w_adj / 2, by, bw - w_adj, bh, fill, 12, extra)
def hems(fill, h=7, w_adj=0):
    (fx, fy, fw, fh), (bx, by, bw, bh) = FL, BL
    return rect(fx + w_adj / 2, fy, fw - w_adj, h, fill, 4) + rect(bx + w_adj / 2, by + bh - h, bw - w_adj, h, fill, 4)
part('legs', 'jeans', 'Jeans', g(12, legs(V('legs')) + hems(V('legs-dark')) + line(FL[0] + 22, FL[1] + 6, FL[0] + 22, FL[1] + FL[3] - 2, '#e8c66a', 2, ' opacity=".6"') + line(BL[0] + 10, BL[1] + 2, BL[0] + 10, BL[1] + BL[3] - 6, '#e8c66a', 2, ' opacity=".6"')), colour='legs', default='#3d5a80')
part('legs', 'joggers', 'Joggers', g(12, legs(V('legs')) + hems(V('legs-dark'), 9, 6) + line(FL[0] + 3, FL[1] + 10, FL[0] + 3, FL[1] + FL[3], V('acc'), 3) + line(BL[0] + BL[2] - 3, BL[1], BL[0] + BL[2] - 3, BL[1] + BL[3] - 10, V('acc'), 3)), colour='legs', default='#2f333a')
part('legs', 'cargos', 'Cargo trousers', g(12, legs(V('legs')) + hems(V('legs-dark')) + rect(FL[0] + 4, FL[1] + 10, 13, 12, V('legs-dark'), 3) + rect(BL[0] + 16, BL[1] + 8, 13, 14, V('legs-dark'), 3)), colour='legs', default='#6b6b45')
part('legs', 'suit', 'Suit trousers', g(12, legs(V('legs'), 2) + line(FL[0] + 16, FL[1] + 2, FL[0] + 16, FL[1] + FL[3] - 2, V('legs-light'), 2.5) + line(BL[0] + 16, BL[1] + 2, BL[0] + 16, BL[1] + BL[3] - 2, V('legs-light'), 2.5)), colour='legs', default='#2f333a')
part('legs', 'shorts', 'Shorts', g(12, legs(V('skin'), 4) + rect(FL[0], FL[1] + FL[3] - 12, FL[2], 12, V('legs'), 6) + rect(BL[0], BL[1], BL[2], 14, V('legs'), 6) +
                                   rect(FL[0] + 3, FL[1], FL[2] - 6, 6, '#ece4cf', 3) + rect(BL[0] + 3, BL[1] + BL[3] - 6, BL[2] - 6, 6, '#ece4cf', 3)), colour='legs', default='#6b6b45')
part('legs', 'skirt', 'Skirt', g(12, legs(V('skin'), 8) + ellipse(C, C + 8, 124, 84, V('legs')) + path(f'M{f(C - 110)},{f(C + 40)} Q{f(C)},{f(C + 100)} {f(C + 110)},{f(C + 40)}', 'none', stroke(V('legs-dark'), 4))), colour='legs', default='#16181c')
part('legs', 'leggings', 'Leggings', g(12, legs(V('legs'), 8) + hems(V('legs-light'), 4, 8)), colour='legs', default='#16181c')
part('legs', 'overalls', 'Overalls', g(12, legs(V('legs')) + hems(V('legs-dark'))) +
     g(52, ''.join(path(f'M{f(C + s * 50)},{f(C - SD + 4)} L{f(C + s * 46)},{f(C + SD - 4)}', 'none', stroke(V('legs'), 15)) + circle(C + s * 50, C - SD + 12, 4, '#e8c66a') for s in (-1, 1))),
     colour='legs', default='#22304a')

# ------------------------------------------------------------------------------------------------- tops
TOP_DEFAULT = '#d9d3c4'
part('top', 'tee', 'T-shirt', g(30, torso(V('top')) + sleeves_short(V('top'))) + g(31, path(arc_q(C - 46, C + 20, C, C + 50, C + 46, C + 20), 'none', stroke(V('top-dark'), 5))), colour='top', default=TOP_DEFAULT)
part('top', 'vest', 'Vest', g(30, ellipse(C, C, 118, 68, V('top')) + path(arc_q(C - 40, C + 22, C, C + 46, C + 40, C + 22), 'none', stroke(V('top-dark'), 4))), colour='top', default='#f1ede2')
part('top', 'longsleeve', 'Long sleeves', g(30, torso(V('top')) + arms(V('top')) + cuffs(V('top-dark'))), colour='top', default='#16181c')
part('top', 'hoodie', 'Hoodie', g(30, torso(V('top')) + arms(V('top')) + cuffs(V('top-dark'), C - 40, 12)) + g(33, ellipse(C, C + 36, 70, 38, V('top-dark')) + ellipse(C, C + 30, 46, 22, V('top'), stroke(INK, 2, .25))), colour='top', default='#2f333a', hood=True)
part('top', 'shirt', 'Shirt', g(30, torso(V('top')) + arms(V('top')) + cuffs(V('top-light'))) + g(31, path(arc_q(C - 124, C + 26, C, C + 62, C + 124, C + 26), 'none', stroke(V('top-dark'), 3.5, .8)) +
     path(arc_q(C - 52, C + 14, C, C + 50, C + 52, C + 14), 'none', stroke(V('top-light'), 9))), colour='top', default='#f1ede2')
part('top', 'polo', 'Polo shirt', g(30, torso(V('top')) + sleeves_short(V('top'))) + g(31, path(arc_q(C - 52, C + 14, C, C + 50, C + 52, C + 14), 'none', stroke(V('top-dark'), 10)) +
     ''.join(line(C + s * AX - 26, C + 6, C + s * AX + 26, C + 6, V('top-dark'), 4) for s in (-1, 1))), colour='top', default='#22304a')
part('top', 'football', 'Football shirt', g(30, torso(V('top')) + sleeves_short(V('top')) + ''.join(poly(ellipse_band(C + s * AX, AY, ARX + 1, ARY + 1, C + 46, C + 58), V('acc')) for s in (-1, 1)) +
     ''.join(path(f'M{f(C + s * 98)},{f(C - 50)} Q{f(C + s * 112)},{f(C)} {f(C + s * 98)},{f(C + 52)}', 'none', stroke(V('acc'), 9)) for s in (-1, 1))) +
     g(32, '<text data-upright="1" x="256" y="306" text-anchor="middle" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="34" fill="var(--acc)" opacity=".9">{{number}}</text>'),
     colour='top', default='#c0392b', number=True)
part('top', 'stripes', 'Striped top', g(30, torso(V('top')) + arms(V('top')) + hlines_in_ellipse(C, C, SW, SD, [C - 52 + i * 16 for i in range(8)], V('top-dark'), 6) +
     ''.join(hlines_in_ellipse(C + s * AX, AY, ARX, ARY, [AY - 46 + i * 16 for i in range(7)], V('top-dark'), 5) for s in (-1, 1))), colour='top', default='#f1ede2')
part('top', 'rollneck', 'Roll neck', g(30, torso(V('top')) + arms(V('top')) + cuffs(V('top-dark'))) + g(95, collar_ring(V('top-dark'), 16, 66)), colour='top', default='#16181c')
part('top', 'jersey', 'Cycling jersey', g(30, torso(V('top')) + sleeves_short(V('top'), C + 6) + ''.join(path(arc_q(C - 140, C + 4 + i * 12, C, C - 58 + i * 12, C + 140, C + 4 + i * 12), 'none', stroke(V('acc'), 6)) for i in range(2)) +
     ''.join(rect(C - 48 + i * 34, C + 44, 28, 16, V('top-dark'), 4) for i in range(3))), colour='top', default='#22304a')

# ------------------------------------------------------------------------------------------------- outerwear
part('outerwear', 'bomber', 'Bomber jacket', g(40, torso(V('outer'), SW + 3, SD + 3) + arms(V('outer'), ARX + 2, ARY + 1) + cuffs(V('outer-dark'), C - 40, 12) + JACKET_LINES) + g(95, collar_ring(V('outer-dark'), 12, 66)), colour='outer', default='#3a3f46')
part('outerwear', 'puffer', 'Puffer jacket', g(40, torso(V('outer'), SW + 9, SD + 7) + arms(V('outer'), ARX + 5, ARY + 3) + hlines_in_ellipse(C, C, SW + 9, SD + 7, [C - 44, C - 16, C + 12, C + 40], V('outer-dark'), 4) +
     ''.join(hlines_in_ellipse(C + s * AX, AY, ARX + 5, ARY + 3, [AY - 34, AY - 8, AY + 18, AY + 44], V('outer-dark'), 4) for s in (-1, 1))) + g(95, collar_ring(V('outer-dark'), 16, 67)), colour='outer', default='#16181c')
part('outerwear', 'hivis', 'Hi-vis vest', g(40, torso(V('outer'), SW + 2, SD + 2) + hlines_in_ellipse(C, C, SW + 2, SD + 2, [C + 10, C + 38], '#dfe6ea', 9) +
     ''.join(line(C + s * 62, C - SD + 6, C + s * 62, C + SD - 6, '#dfe6ea', 9) for s in (-1, 1))), colour='outer', default='#d8e03a', hivis=True)
part('outerwear', 'hivisjacket', 'Hi-vis jacket', g(40, torso(V('outer'), SW + 3, SD + 3) + arms(V('outer'), ARX + 2, ARY + 1) + hlines_in_ellipse(C, C, SW + 3, SD + 3, [C + 8, C + 36], '#dfe6ea', 9) +
     ''.join(hlines_in_ellipse(C + s * AX, AY, ARX + 2, ARY + 1, [AY - 20, AY + 8], '#dfe6ea', 7) for s in (-1, 1))) + g(95, collar_ring(V('outer-dark'), 12, 66)), colour='outer', default='#d8e03a', hivis=True)
part('outerwear', 'leather', 'Leather jacket', g(40, torso(V('outer'), SW + 3, SD + 3) + arms(V('outer'), ARX + 2, ARY + 1) +
     path(f'M{f(C - 36)},{f(C - SD + 6)} L{f(C + 58)},{f(C + 30)}', 'none', stroke('#c9d4e0', 3.5, .8)) +
     ''.join(rect(C + s * 104 - 16, C - 30, 32, 14, V('outer-dark'), 4, stroke(INK, 2, .5)) + path(arc_q(C + s * 140, C - 10, C + s * 96, C + 10, C + s * 60, C + 54), 'none', stroke(V('outer-light'), 3, .7)) for s in (-1, 1))) +
     g(95, collar_ring(V('outer-dark'), 12, 66)), colour='outer', default='#16181c')
part('outerwear', 'trench', 'Long coat', g(14, path(f'M{f(C - SW * .82)},{f(C + 10)} Q{f(C - SW * .86)},{f(C + 128)} {f(C - SW * .5)},{f(C + 140)} L{f(C + SW * .5)},{f(C + 140)} Q{f(C + SW * .86)},{f(C + 128)} {f(C + SW * .82)},{f(C + 10)} Z', V('outer-dark')) +
     line(C, C + 40, C, C + 138, INK, 5, ' opacity=".45"')) +
     g(40, torso(V('outer'), SW + 3, SD + 3) + arms(V('outer'), ARX + 2, ARY + 1) + path(arc_q(C - SW * .8, C - 10, C, C - SD - 26, C + SW * .8, C - 10), 'none', stroke(INK, 6, .5)) + line(C - 90, C + 56, C + 90, C + 56, V('outer-dark'), 8)),
     colour='outer', default='#b9a47a')
part('outerwear', 'parka', 'Parka', g(40, torso(V('outer'), SW + 6, SD + 5) + arms(V('outer'), ARX + 4, ARY + 2) + cuffs(V('outer-dark'), C - 42, 12) + back_seam()) +
     g(96, ellipse(C, C + 46, 70, 40, V('outer-dark')) + f'<ellipse cx="{f(C)}" cy="{f(C + 44)}" rx="58" ry="30" fill="none"{stroke("#d9cdb0", 12)} stroke-dasharray="3 5"/>'), colour='outer', default='#5f6b3a', hood=True)
part('outerwear', 'tracktop', 'Tracksuit top', g(40, torso(V('outer'), SW + 2, SD + 2) + arms(V('outer'), ARX + 1, ARY) + cuffs(V('outer-dark'), C - 40, 10) +
     ''.join(line(C + s * AX + dx, AY - ARY + 10, C + s * AX + dx, AY + ARY - 8, '#f1ede2', 3.5) for s in (-1, 1) for dx in (-8, 0, 8)) + line(C, C - SD + 8, C, C + SD - 8, '#c9d4e0', 3)) +
     g(95, collar_ring(V('outer-dark'), 10, 65)), colour='outer', default='#22304a')
part('outerwear', 'gilet', 'Gilet', g(40, torso(V('outer'), SW + 6, SD + 5) + hlines_in_ellipse(C, C, SW + 6, SD + 5, [C - 40, C - 12, C + 16, C + 44], V('outer-dark'), 4)) + g(95, collar_ring(V('outer-dark'), 14, 66)), colour='outer', default='#16181c')
part('outerwear', 'blazer', 'Blazer', g(40, torso(V('outer'), SW + 2, SD + 2) + arms(V('outer'), ARX + 1, ARY) + cuffs(V('top-light'), C - 44, 6) +
     ''.join(path(arc_q(C + s * 146, C - 6, C + s * 120, C - 40, C + s * 64, C - 58), 'none', stroke(V('outer-dark'), 3.5)) for s in (-1, 1)) + line(C, C + 30, C, C + SD, INK, 3, ' opacity=".5"')) +
     g(95, collar_ring(V('top-light'), 7, 62)), colour='outer', default='#22304a')
part('outerwear', 'denim', 'Denim jacket', g(40, torso(V('outer'), SW + 3, SD + 3) + arms(V('outer'), ARX + 2, ARY + 1) + cuffs(V('outer-dark'), C - 40, 10) +
     path(arc_q(C - 120, C + 6, C, C + 40, C + 120, C + 6), 'none', stroke('#e8c66a', 2.5, .7) + ' stroke-dasharray="5 4"') +
     ''.join(line(C + s * 60, C + 14, C + s * 60, C + 58, '#e8c66a', 2.5, ' opacity=".6" stroke-dasharray="5 4"') for s in (-1, 1))) + g(95, collar_ring(V('outer-dark'), 12, 66)), colour='outer', default='#4a6d93')
part('outerwear', 'courier', 'Courier jacket', g(40, torso(V('outer'), SW + 3, SD + 3) + arms(V('outer'), ARX + 2, ARY + 1) + cuffs(V('outer-dark'), C - 40, 12) +
     hlines_in_ellipse(C, C, SW + 3, SD + 3, [C + 30], '#dfe6ea', 8) + ''.join(poly(ellipse_band(C + s * AX, AY, ARX + 2, ARY + 1, AY - 52, AY - 26), V('acc')) for s in (-1, 1))) + g(95, collar_ring(V('outer-dark'), 12, 66)),
     colour='outer', default='#2f7f7f')
part('outerwear', 'mac', 'Rain mac', g(40, torso(V('outer'), SW + 4, SD + 4) + arms(V('outer'), ARX + 3, ARY + 2) + cuffs(V('outer-dark'), C - 42, 10) +
     ''.join(path(arc_q(C + s * 120, C - 30, C + s * 90, C, C + s * 112, C + 40), 'none', stroke('#ffffff', 4, .35)) for s in (-1, 1)) + back_seam(.35)) +
     g(96, ellipse(C, C + 44, 54, 28, V('outer-dark'))), colour='outer', default='#c0392b', hood=True)

# ------------------------------------------------------------------------------------------------- trim (faction colour)
part('trim', 'stripe', 'Shoulder stripe', g(55, path(arc_q(C - SW * .92, C + 6, C, C - SD * .6, C + SW * .92, C + 6), 'none', stroke(V('acc'), 6, .85))))
part('trim', 'double', 'Double stripe', g(55, ''.join(path(arc_q(C - SW * .92, C + 6 + d, C, C - SD * .6 + d, C + SW * .92, C + 6 + d), 'none', stroke(V('acc'), 5, .85)) for d in (0, 14))))
part('trim', 'piping', 'Sleeve piping', g(55, ''.join(line(C + s * (AX + 24), AY - 40, C + s * (AX + 24), AY + 44, V('acc'), 4) for s in (-1, 1)) + path(arc_q(C - 60, C + 22, C, C + 54, C + 60, C + 22), 'none', stroke(V('acc'), 4))))
part('trim', 'battenburg', 'Battenburg checks', g(55, ''.join(rect(C - 120 + i * 30, C + 26, 30, 18, V('acc') if i % 2 == 0 else '#f1ede2', 0, ' opacity=".95"') for i in range(8))))
part('trim', 'collar', 'Glow collar', g(97, f'<circle cx="{f(HX)}" cy="{f(HY)}" r="66" fill="none"{stroke(V("acc"), 5, .9)} filter="url(#glow)"/>'))

# ------------------------------------------------------------------------------------------------- neck
part('neck', 'chain', 'Chain', g(60, path(arc_q(C - 50, C + 14, C, C + 60, C + 50, C + 14), 'none', stroke('#e8c66a', 5) + ' stroke-dasharray="6 3"')))
part('neck', 'bigchain', 'Chunky chain', g(60, path(arc_q(C - 54, C + 10, C, C + 66, C + 54, C + 10), 'none', stroke('#e8c66a', 10) + ' stroke-dasharray="9 4"') + circle(C, C + 38, 9, '#e8c66a', stroke(INK, 2, .6))))
part('neck', 'scarf', 'Scarf', g(60, rect(C + 14, C + 36, 18, 64, V('acc-dark'), 8) + rect(C + 34, C + 34, 18, 52, V('acc'), 8)) + g(96, collar_ring(V('acc'), 18, 68)))
part('neck', 'lanyard', 'Lanyard', g(60, path(arc_q(C - 50, C + 14, C, C + 58, C + 50, C + 14), 'none', stroke(V('acc'), 4))))
part('neck', 'cans', 'Headphones round the neck', g(96, path(arc_q(C - 56, C + 16, C, C + 64, C + 56, C + 16), 'none', stroke('#2a2e33', 9)) + ''.join(ellipse(C + s * 60, C + 8, 14, 19, '#2a2e33', stroke(INK, 2, .6)) + circle(C + s * 60, C + 8, 5, V('acc')) for s in (-1, 1))))

# ------------------------------------------------------------------------------------------------- on the back / carried
part('back', 'backpack', 'Backpack', g(6, rect(C - 64, C + 40, 128, 92, V('bag'), 22, stroke(INK, 3, .5)) + rect(C - 40, C + 96, 80, 26, V('bag-dark'), 10) + rect(C - 16, C + 30, 32, 14, V('bag-dark'), 6)) +
     g(50, ''.join(path(f'M{f(C + s * 58)},{f(C - SD + 6)} L{f(C + s * 52)},{f(C + SD - 2)}', 'none', stroke(V('bag-dark'), 13)) for s in (-1, 1))), colour='bag', default='#2f333a')
part('back', 'courierbox', 'Courier box', g(52, rect(C - 82, C + 22, 164, 132, V('bag'), 12, stroke(INK, 4, .7)) + rect(C - 82, C + 70, 164, 22, V('acc')) + rect(C - 70, C + 30, 140, 30, V('bag-light'), 8, ' opacity=".5"')),
     colour='bag', default='#2f7f7f')
part('back', 'messenger', 'Messenger bag', g(7, rect(C + 76, C + 40, 72, 58, V('bag'), 12, stroke(INK, 3, .5)) + rect(C + 76, C + 40, 72, 22, V('bag-dark'), 10)) +
     g(50, path(f'M{f(C - 118)},{f(C - 40)} L{f(C + 96)},{f(C + 52)}', 'none', stroke(V('bag-dark'), 12))), colour='bag', default='#5f6b3a')
part('back', 'holdall', 'Sports holdall', g(15, rect(C - 196, C - 70, 40, 128, V('bag'), 18, stroke(INK, 3, .55)) + rect(C - 196, C - 20, 40, 14, V('acc')) + path(f'M{f(C - 176)},{f(C - 70)} Q{f(C - 150)},{f(C - 54)} {f(C - 140)},{f(C - 48)}', 'none', stroke(INK, 4, .6))),
     colour='bag', default='#16181c')
part('back', 'toolbag', 'Tool bag', g(15, rect(C - 198, C - 50, 46, 96, V('bag'), 10, stroke(INK, 3, .55)) + rect(C - 192, C - 66, 10, 20, '#c9d4e0', 3) + rect(C - 178, C - 72, 8, 26, '#c0392b', 3) + rect(C - 166, C - 62, 9, 16, '#e8c66a', 3)),
     colour='bag', default='#b0864e')
part('back', 'guitar', 'Guitar case', g(5, path(f'M{f(C - 22)},{f(C + 30)} Q{f(C - 40)},{f(C + 120)} {f(C - 30)},{f(C + 170)} Q{f(C)},{f(C + 196)} {f(C + 30)},{f(C + 170)} Q{f(C + 40)},{f(C + 120)} {f(C + 22)},{f(C + 30)} Z', V('bag'), stroke(INK, 3, .55))) +
     g(50, ''.join(path(f'M{f(C + s * 56)},{f(C - SD + 6)} L{f(C + s * 30)},{f(C + SD - 2)}', 'none', stroke(V('bag-dark'), 10)) for s in (-1, 1))), colour='bag', default='#16181c')

# ------------------------------------------------------------------------------------------------- gloves (hand colour only)
for pid, label, col in [('black', 'Black gloves', '#16181c'), ('work', 'Work gloves', '#b0864e'), ('latex', 'Medical gloves', '#8fb8e8'), ('cycling', 'Cycling gloves', 'acc')]:
    part('gloves', pid, label, '', glove=col)

# ------------------------------------------------------------------------------------------------- props (in the hands)
RH, LH = (C + AX, HANDY), (C - AX, HANDY)
part('prop', 'phone', 'Phone', g(69, rect(RH[0] - 14, RH[1] - 56, 28, 46, '#121a22', 5, stroke(V('acc'), 3)) + rect(RH[0] - 10, RH[1] - 52, 20, 36, V('acc'), 3, ' opacity=".35"')))
part('prop', 'spraycan', 'Spray can', g(69, rect(RH[0] - 12, RH[1] - 62, 24, 52, '#c9d4e0', 8, stroke(INK, 3, .6)) + circle(RH[0], RH[1] - 64, 9, V('acc'), stroke(INK, 2, .6)) + rect(RH[0] - 12, RH[1] - 40, 24, 9, V('acc'))))
part('prop', 'crowbar', 'Crowbar', g(69, path(f'M{f(RH[0])},{f(RH[1])} L{f(RH[0] + 14)},{f(RH[1] - 120)} Q{f(RH[0] + 16)},{f(RH[1] - 138)} {f(RH[0] + 2)},{f(RH[1] - 138)}', 'none', stroke('#2a2e33', 9)) +
     path(f'M{f(RH[0] + 6)},{f(RH[1] - 60)} L{f(RH[0] + 13)},{f(RH[1] - 110)}', 'none', stroke('#c0392b', 9))))
part('prop', 'bat', 'Baseball bat', g(69, poly([(RH[0] - 4, RH[1] + 8), (RH[0] + 5, RH[1] + 8), (RH[0] + 22, RH[1] - 150), (RH[0] + 2, RH[1] - 152)], '#c49a6c', stroke(INK, 3, .6)) + circle(RH[0] + 12, RH[1] - 151, 10, '#c49a6c', stroke(INK, 3, .6))))
part('prop', 'wrench', 'Wrench', g(69, rect(RH[0] - 5, RH[1] - 100, 10, 96, '#9aa0a6', 4, stroke(INK, 2.5, .6)) + path(f'M{f(RH[0] - 16)},{f(RH[1] - 98)} Q{f(RH[0])},{f(RH[1] - 128)} {f(RH[0] + 16)},{f(RH[1] - 98)} L{f(RH[0] + 7)},{f(RH[1] - 98)} L{f(RH[0] + 7)},{f(RH[1] - 112)} L{f(RH[0] - 7)},{f(RH[1] - 112)} L{f(RH[0] - 7)},{f(RH[1] - 98)} Z', '#9aa0a6', stroke(INK, 2.5, .6))))
part('prop', 'torch', 'Torch', g(68, poly([(RH[0] - 8, RH[1] - 40), (RH[0] + 8, RH[1] - 40), (RH[0] + 70, RH[1] - 200), (RH[0] - 60, RH[1] - 200)], '#fff4c0', ' opacity=".22"')) + g(69, rect(RH[0] - 9, RH[1] - 44, 18, 40, '#2a2e33', 6) + rect(RH[0] - 11, RH[1] - 48, 22, 10, '#e8c66a', 4)))
part('prop', 'cigarette', 'Cigarette', g(69, line(LH[0] + 4, LH[1] - 10, LH[0] + 10, LH[1] - 30, '#f1ede2', 5) + circle(LH[0] + 11, LH[1] - 33, 5, '#ff8a3d', ' filter="url(#glow)"')))
part('prop', 'coffee', 'Coffee', g(69, circle(RH[0], RH[1] - 22, 15, '#ece4cf', stroke(INK, 3, .55)) + circle(RH[0], RH[1] - 22, 10, '#6b4a32') + circle(RH[0] + 5, RH[1] - 26, 2.5, '#ece4cf')))
part('prop', 'takeaway', 'Takeaway bag', g(15, rect(RH[0] + 10, RH[1] - 30, 48, 60, '#c49a6c', 6, stroke(INK, 3, .55)) + line(RH[0] + 14, RH[1] - 16, RH[0] + 54, RH[1] - 16, '#8a5a32', 3) + circle(RH[0] + 34, RH[1] + 6, 9, V('acc'), ' opacity=".85"')))
part('prop', 'dlock', 'D-lock', g(69, path(f'M{f(RH[0] - 18)},{f(RH[1] - 10)} L{f(RH[0] - 18)},{f(RH[1] - 64)} Q{f(RH[0])},{f(RH[1] - 92)} {f(RH[0] + 18)},{f(RH[1] - 64)} L{f(RH[0] + 18)},{f(RH[1] - 10)}', 'none', stroke('#16181c', 8)) + rect(RH[0] - 24, RH[1] - 22, 48, 14, '#e8c66a', 5, stroke(INK, 2, .6))))
part('prop', 'can', 'Can of lager', g(69, circle(LH[0], LH[1] - 20, 12, '#c9d4e0', stroke(INK, 2.5, .55)) + f'<circle cx="{f(LH[0])}" cy="{f(LH[1] - 20)}" r="8" fill="none"{stroke(V("acc"), 3)}/>'))
part('prop', 'radio', 'Police radio', g(69, rect(LH[0] - 10, LH[1] - 50, 20, 40, '#16181c', 5, stroke(INK, 2, .6)) + rect(LH[0] - 3, LH[1] - 66, 6, 18, '#16181c', 3) + circle(LH[0], LH[1] - 38, 3, '#5ef0c4')))

# ------------------------------------------------------------------------------------------------- hair
def cap(fill, r=HR, extra=''): return circle(HX, HY, r, fill, stroke(INK, 4) + extra)
def parting(op=.6): return path(arc_q(HX - HR + 10, HY - 18, HX, HY - HR - 8, HX + HR - 10, HY - 18), 'none', stroke(V('hair-dark'), 5, op))
part('hair', 'shaved', 'Shaved', g(110, circle(HX, HY, HR - 3, V('hair'), ' opacity=".28"'), 'cap'), colour='hair')
part('hair', 'buzz', 'Buzz cut', g(110, circle(HX, HY, HR - 4, V('hair'), ' opacity=".8"'), 'cap'), colour='hair')
part('hair', 'short', 'Short', g(110, cap(V('hair')) + parting(), 'cap'), colour='hair')
part('hair', 'fade', 'Skin fade', g(110, circle(HX, HY, HR - 3, V('hair'), ' opacity=".35"') + circle(HX, HY - 4, HR - 14, V('hair')) + path(arc_q(HX - 30, HY - 30, HX, HY - 48, HX + 30, HY - 30), 'none', stroke(V('hair-light'), 4, .7)), 'cap'), colour='hair')
part('hair', 'quiff', 'Quiff', g(110, cap(V('hair')) + ellipse(HX, HY - 38, 30, 22, V('hair-light')) + path(arc_q(HX - 24, HY - 34, HX, HY - 62, HX + 24, HY - 34), 'none', stroke(V('hair-dark'), 3, .6)), 'cap'), colour='hair')
part('hair', 'curly', 'Curly', g(110, cap(V('hair'), HR + 2) + ''.join(circle(HX + (HR - 2) * math.cos(a), HY + (HR - 2) * math.sin(a), 11, V('hair')) for a in [i * math.pi / 7 for i in range(14)]) +
     ''.join(path(f'M{f(HX + 30 * math.cos(a) - 5)},{f(HY + 30 * math.sin(a))} q5,-7 10,0', 'none', stroke(V('hair-dark'), 3, .7)) for a in [i * math.pi / 4 for i in range(8)]), 'cap'), colour='hair')
part('hair', 'afro', 'Afro', g(110, ''.join(circle(HX + 70 * math.cos(a), HY + 70 * math.sin(a), 13, V('hair')) for a in [i * math.pi / 9 for i in range(18)]) + circle(HX, HY, 72, V('hair'), stroke(INK, 3, .5)) +
     ''.join(circle(HX + rr * math.cos(a), HY + rr * math.sin(a), 2.5, V('hair-dark')) for rr in (20, 38, 54) for a in [i * math.pi / (4 + rr // 12) + rr for i in range(int(8 + rr // 6))]), 'cap'), colour='hair')
part('hair', 'long', 'Long', g(104, path(f'M{f(HX - HR + 6)},{f(HY + 10)} Q{f(HX - HR + 2)},{f(HY + 104)} {f(HX)},{f(HY + 108)} Q{f(HX + HR - 2)},{f(HY + 104)} {f(HX + HR - 6)},{f(HY + 10)} Z', V('hair')) +
     ''.join(path(f'M{f(HX + d)},{f(HY + 30)} Q{f(HX + d * 1.2)},{f(HY + 70)} {f(HX + d * .9)},{f(HY + 100)}', 'none', stroke(V('hair-dark'), 3, .5)) for d in (-26, -8, 10, 28)), 'tail') +
     g(110, cap(V('hair')) + parting(.5), 'cap'), colour='hair')
part('hair', 'ponytail', 'Ponytail', g(104, ellipse(HX, HY + 80, 15, 36, V('hair'), stroke(INK, 3, .5)) + rect(HX - 12, HY + 46, 24, 8, V('acc'), 3), 'tail') + g(110, cap(V('hair')) + path(f'M{f(HX)},{f(HY - HR + 4)} L{f(HX)},{f(HY + HR - 4)}', 'none', stroke(V('hair-dark'), 3, .5)), 'cap'), colour='hair')
part('hair', 'bun', 'Bun', g(110, cap(V('hair')) + path(f'M{f(HX)},{f(HY - HR + 6)} L{f(HX)},{f(HY + 20)}', 'none', stroke(V('hair-dark'), 3, .45)) + circle(HX, HY + 40, 22, V('hair'), stroke(INK, 3)), 'cap'), colour='hair')
part('hair', 'cornrows', 'Cornrows', g(110, cap(V('hair')) + ''.join(path(f'M{f(HX + d)},{f(HY - HR + 8 + abs(d) * .25)} Q{f(HX + d * 1.15)},{f(HY)} {f(HX + d)},{f(HY + HR - 8 - abs(d) * .25)}', 'none', stroke(V('hair-dark'), 4) + ' stroke-dasharray="4 3"') for d in (-36, -18, 0, 18, 36)), 'cap'), colour='hair')
part('hair', 'locs', 'Locs', g(104, ''.join(path(f'M{f(HX + d)},{f(HY + 30)} Q{f(HX + d * 1.3)},{f(HY + 70)} {f(HX + d * 1.15)},{f(HY + 92 + abs(d) * -.3)}', 'none', stroke(V('hair'), 12) ) for d in (-44, -28, -12, 4, 20, 36, 50)) +
     ''.join(path(f'M{f(HX + d)},{f(HY + 30)} Q{f(HX + d * 1.3)},{f(HY + 70)} {f(HX + d * 1.15)},{f(HY + 92 + abs(d) * -.3)}', 'none', stroke(V('hair-dark'), 3, .45) + ' stroke-dasharray="3 5"') for d in (-44, -28, -12, 4, 20, 36, 50)), 'tail') +
     g(110, cap(V('hair')) + ''.join(circle(HX + 40 * math.cos(a), HY + 40 * math.sin(a), 5, V('hair-dark'), ' opacity=".5"') for a in [i * math.pi / 5 for i in range(10)]), 'cap'), colour='hair')
part('hair', 'mohawk', 'Mohawk', g(110, circle(HX, HY, HR - 3, V('hair'), ' opacity=".25"') + rect(HX - 13, HY - HR - 2, 26, 2 * HR + 4, V('hair'), 13, stroke(INK, 3, .5)), 'cap'), colour='hair')
part('hair', 'bob', 'Bob', g(110, circle(HX, HY + 4, HR + 6, V('hair'), stroke(INK, 4)) + path(arc_q(HX - 44, HY - 36, HX, HY - 66, HX + 44, HY - 36), 'none', stroke(V('hair-dark'), 4, .6)), 'cap'), colour='hair')

# ------------------------------------------------------------------------------------------------- hats
part('hat', 'cap', 'Cap', g(120, cap(V('hat')) + ellipse(HX, HY - HR + 2, 44, 22, V('hat-dark'), stroke(INK, 3, .6)) + ''.join(path(f'M{f(HX)},{f(HY)} L{f(HX + 52 * math.cos(a))},{f(HY + 52 * math.sin(a))}', 'none', stroke(V('hat-dark'), 2.5, .6)) for a in (math.pi * .25, math.pi * .75, math.pi * 1.25, math.pi * 1.75)) + circle(HX, HY, 6, V('hat-dark'))), colour='hat', default='#16181c', hides=['hair:cap'])
part('hat', 'capback', 'Cap (backwards)', g(120, cap(V('hat')) + ellipse(HX, HY + HR - 4, 40, 20, V('hat-dark'), stroke(INK, 3, .6)) + rect(HX - 12, HY + 22, 24, 10, V('skin'), 4) + circle(HX, HY, 6, V('hat-dark'))), colour='hat', default='#c0392b', hides=['hair:cap'])
part('hat', 'beanie', 'Beanie', g(120, circle(HX, HY, HR + 2, V('hat'), stroke(INK, 4)) + f'<circle cx="{f(HX)}" cy="{f(HY)}" r="{HR - 6}" fill="none"{stroke(V("hat-dark"), 10)} stroke-dasharray="3 4"/>' + circle(HX, HY, 16, V('hat-light'), stroke(INK, 2, .5))), colour='hat', default='#16181c', hides=['hair:cap'])
part('hat', 'bucket', 'Bucket hat', g(120, circle(HX, HY, HR + 26, V('hat-dark'), stroke(INK, 3, .6)) + circle(HX, HY, HR - 4, V('hat'), stroke(INK, 3, .6)) + f'<circle cx="{f(HX)}" cy="{f(HY)}" r="{HR + 14}" fill="none"{stroke(V("hat-light"), 2.5, .6)} stroke-dasharray="4 4"/>'), colour='hat', default='#d9d3c4', hides=['hair:cap'])
part('hat', 'hood', 'Hood up', g(120, ellipse(HX, HY + 6, HR + 16, HR + 20, V('hood'), stroke(INK, 5)) + ellipse(HX, HY - 30, 34, 18, INK, ' opacity=".8"') + path(arc_q(HX - 44, HY + 40, HX, HY + 70, HX + 44, HY + 40), 'none', stroke(V('hood-dark'), 4, .6))), hides=['hair'])
part('hat', 'cyclehelmet', 'Cycle helmet', g(120, ellipse(HX, HY - 2, HR + 4, HR + 10, V('hat'), stroke(INK, 4)) + ''.join(rect(HX + d - 5, HY - 44, 10, 70, INK, 5, ' opacity=".55"') for d in (-26, 0, 26)) + path(arc_q(HX - 50, HY - 30, HX, HY - 72, HX + 50, HY - 30), 'none', stroke(V('acc'), 4))), colour='hat', default='#f1ede2', hides=['hair:cap'])
part('hat', 'motohelmet', 'Motorbike helmet', g(120, circle(HX, HY, HR + 8, V('hat'), stroke(INK, 5)) + path(arc_q(HX - 46, HY - 40, HX, HY - 76, HX + 46, HY - 40), 'none', stroke(V('acc'), 11) + ' filter="url(#glow)"') + path(arc_q(HX - 40, HY + 10, HX, HY + 40, HX + 40, HY + 10), 'none', stroke(V('hat-light'), 4, .5))), colour='hat', default='#16181c', hides=['hair', 'face'])
part('hat', 'hardhat', 'Hard hat', g(120, circle(HX, HY, HR + 12, V('hat-dark'), stroke(INK, 3, .6)) + circle(HX, HY, HR + 2, V('hat'), stroke(INK, 3, .6)) + rect(HX - 7, HY - HR, 14, 2 * HR, V('hat-light'), 7)), colour='hat', default='#e8c33a', hides=['hair:cap'])
part('hat', 'flatcap', 'Flat cap', g(120, ellipse(HX, HY + 2, HR + 4, HR + 2, V('hat'), stroke(INK, 4)) + ellipse(HX, HY - HR + 4, 40, 14, V('hat-dark'), stroke(INK, 2.5, .6)) + ''.join(circle(HX + 30 * math.cos(a), HY + 26 * math.sin(a), 2, V('hat-light')) for a in [i * math.pi / 6 for i in range(12)])), colour='hat', default='#6b5a46', hides=['hair:cap'])
part('hat', 'durag', 'Durag', g(118, path(f'M{f(HX - 14)},{f(HY + 40)} Q{f(HX - 22)},{f(HY + 80)} {f(HX - 8)},{f(HY + 118)} L{f(HX + 4)},{f(HY + 116)} Q{f(HX - 8)},{f(HY + 80)} {f(HX + 4)},{f(HY + 44)} Z', V('hat-dark')) +
     path(f'M{f(HX + 10)},{f(HY + 40)} Q{f(HX + 22)},{f(HY + 84)} {f(HX + 14)},{f(HY + 120)} L{f(HX + 26)},{f(HY + 118)} Q{f(HX + 30)},{f(HY + 80)} {f(HX + 24)},{f(HY + 44)} Z', V('hat'))) +
     g(120, cap(V('hat')) + line(HX, HY - HR + 6, HX, HY + HR - 6, V('hat-light'), 3, ' opacity=".7"') + path(arc_q(HX - 40, HY - 30, HX - 10, HY - 50, HX + 10, HY - 50), 'none', stroke('#ffffff', 3, .35))), colour='hat', default='#22304a', hides=['hair:cap'])
part('hat', 'headscarf', 'Headscarf', g(118, path(f'M{f(HX - 60)},{f(HY + 10)} Q{f(HX - 70)},{f(HY + 70)} {f(HX - 30)},{f(HY + 96)} L{f(HX + 30)},{f(HY + 96)} Q{f(HX + 70)},{f(HY + 70)} {f(HX + 60)},{f(HY + 10)} Z', V('hat-dark'))) +
     g(120, circle(HX, HY, HR + 5, V('hat'), stroke(INK, 4)) + ''.join(path(arc_q(HX - 50 + d, HY - 24 - d * .3, HX, HY - 50 + d * .2, HX + 50 - d, HY - 24 - d * .3), 'none', stroke(V('hat-dark'), 3, .55)) for d in (0, 14))), colour='hat', default='#5b4a8a', hides=['hair'])
part('hat', 'turban', 'Turban', g(120, circle(HX, HY, HR + 6, V('hat'), stroke(INK, 4)) + ''.join(path(arc_q(HX - 58 + i * 8, HY + 20 - i * 6, HX - 6 + i * 10, HY - 60 + i * 12, HX + 50 - i * 4, HY - 28 + i * 14), 'none', stroke(V('hat-dark'), 4, .6)) for i in range(4)) + path(f'M{f(HX - 14)},{f(HY - HR - 2)} L{f(HX)},{f(HY - HR - 14)} L{f(HX + 14)},{f(HY - HR - 2)} Z', V('hat-dark'))), colour='hat', default='#e8742c', hides=['hair'])
part('hat', 'bandana', 'Bandana', g(118, path(f'M{f(HX - 8)},{f(HY + 52)} L{f(HX - 26)},{f(HY + 90)} L{f(HX - 6)},{f(HY + 86)} Z', V('hat-dark')) + path(f'M{f(HX + 8)},{f(HY + 52)} L{f(HX + 24)},{f(HY + 92)} L{f(HX + 6)},{f(HY + 86)} Z', V('hat'))) +
     g(120, cap(V('hat')) + ''.join(circle(HX + rr * math.cos(a), HY + rr * math.sin(a), 3.5, '#f1ede2', ' opacity=".75"') for rr in (18, 38) for a in [i * math.pi / 4 + rr for i in range(8)]) + circle(HX, HY + 52, 9, V('hat-dark'), stroke(INK, 2, .5))), colour='hat', default='#c0392b', hides=['hair:cap'])
part('hat', 'policehelmet', 'Police helmet', g(120, circle(HX, HY, HR + 10, '#16181c', stroke(INK, 3, .6)) + circle(HX, HY, HR - 6, '#22263a', stroke(INK, 3, .6)) + rect(HX - 5, HY - HR + 8, 10, 2 * HR - 16, '#2f3550', 5) + path(f'M{f(HX - 10)},{f(HY - HR - 8)} L{f(HX)},{f(HY - HR - 22)} L{f(HX + 10)},{f(HY - HR - 8)} Z', '#c9d4e0', stroke(INK, 2, .6))), hides=['hair:cap'], npc=True)
part('hat', 'policecap', 'Police cap', g(120, circle(HX, HY, HR + 4, '#16181c', stroke(INK, 4)) + f'<circle cx="{f(HX)}" cy="{f(HY)}" r="{HR - 2}" fill="none" stroke="#f1ede2" stroke-width="9" stroke-dasharray="8 8"/>' + ellipse(HX, HY - HR + 2, 40, 16, '#0a0d10') + circle(HX, HY - HR + 14, 6, '#c9d4e0')), hides=['hair:cap'], npc=True)

# ------------------------------------------------------------------------------------------------- face
part('face', 'glasses', 'Glasses', g(125, ''.join(path(f'M{f(HX + s * 52)},{f(HY + 2)} L{f(HX + s * 46)},{f(HY - 46)}', 'none', stroke(INK, 3.5)) for s in (-1, 1)) + path(f'M{f(HX - 40)},{f(HY - 54)} Q{f(HX)},{f(HY - 70)} {f(HX + 40)},{f(HY - 54)}', 'none', stroke(INK, 5))))
part('face', 'shades', 'Shades', g(125, ''.join(path(f'M{f(HX + s * 52)},{f(HY + 2)} L{f(HX + s * 46)},{f(HY - 46)}', 'none', stroke(INK, 4)) for s in (-1, 1)) + ''.join(ellipse(HX + s * 18, HY - 62, 15, 7, '#0a0d10', stroke(V('acc'), 2, .7)) for s in (-1, 1))))
part('face', 'balaclava', 'Balaclava', g(122, circle(HX, HY, HR + 2, '#1b1b22', stroke(INK, 4)) + f'<circle cx="{f(HX)}" cy="{f(HY)}" r="{HR - 10}" fill="none" stroke="#2a2e33" stroke-width="6" stroke-dasharray="2 5"/>' + rect(HX - 26, HY - HR - 2, 52, 12, V('skin'), 5)), hides=['hair', 'hat'])
part('face', 'snood', 'Face mask', g(125, path(arc_q(HX - 44, HY - 40, HX, HY - 74, HX + 44, HY - 40), 'none', stroke(V('acc'), 12)) + ''.join(line(HX + s * 44, HY - 40, HX + s * 56, HY - 4, V('acc-dark'), 3) for s in (-1, 1))))
part('face', 'headphones', 'Headphones', g(126, path(f'M{f(HX - 58)},{f(HY)} Q{f(HX)},{f(HY - 20)} {f(HX + 58)},{f(HY)}', 'none', stroke('#2a2e33', 10)) + ''.join(ellipse(HX + s * 62, HY, 13, 20, '#2a2e33', stroke(INK, 2, .6)) + circle(HX + s * 62, HY, 5, V('acc')) for s in (-1, 1))))
part('face', 'hoops', 'Hoop earrings', g(125, ''.join(f'<circle cx="{f(HX + s * 60)}" cy="{f(HY + 12)}" r="8" fill="none"{stroke("#e8c66a", 3.5)}/>' for s in (-1, 1))))

# ------------------------------------------------------------------------------------------------- palettes and presets
SKINS = [('s1', 'Fair', '#f3d7c2'), ('s2', 'Light', '#e8c0a0'), ('s3', 'Light medium', '#d9a782'), ('s4', 'Medium', '#c68e64'), ('s5', 'Tan', '#a8714a'),
         ('s6', 'Brown', '#8a5636'), ('s7', 'Dark brown', '#6b3f26'), ('s8', 'Deep', '#4a2b1a')]
HAIR = [('#16131a', 'Black'), ('#2a2622', 'Dark brown'), ('#5a3a22', 'Brown'), ('#8a5a32', 'Light brown'), ('#a8452c', 'Ginger'), ('#d8c08a', 'Blonde'),
        ('#ece4cf', 'Platinum'), ('#9a948a', 'Grey'), ('#ff7fb0', 'Pink'), ('#5ef0c4', 'Mint'), ('#7fb2ff', 'Blue'), ('#b9a2ff', 'Lilac')]
CLOTH = [('#f1ede2', 'White'), ('#ece4cf', 'Bone'), ('#d9d3c4', 'Sand'), ('#c9b48a', 'Stone'), ('#9aa0a6', 'Grey marl'), ('#2f333a', 'Charcoal'), ('#16181c', 'Black'),
         ('#22304a', 'Navy'), ('#3d5a80', 'Denim'), ('#7fb2ff', 'Sky'), ('#2f7f7f', 'Teal'), ('#2f5a3a', 'Forest'), ('#5f6b3a', 'Olive'), ('#6b6b45', 'Khaki'),
         ('#6b4a32', 'Brown'), ('#b0864e', 'Tan'), ('#d0a23a', 'Mustard'), ('#e8742c', 'Orange'), ('#c0392b', 'Red'), ('#6e2a35', 'Burgundy'), ('#e88aa8', 'Pink'), ('#5b4a8a', 'Purple'),
         ('#d8e03a', 'Hi-vis yellow'), ('#ff8a3d', 'Hi-vis orange')]
ACCENT = [('#ff7fb0', 'The Chainring'), ('#78ecf3', 'Dead Air Collective'), ('#ff5a6e', 'The Lea Boys'), ('#b9a2ff', 'The Velvet Circuit'), ('#5ef0c4', 'The Towpath Union'),
          ('#e9cc8c', 'The Glasshouse Exchange'), ('#ffc467', 'The Backroom Bookmakers'), ('#ff8a3d', 'The Night Market'), ('#8be6b0', 'Borough Mutual'), ('#7fb2ff', 'The Lantern Desk'),
          ('#c9d4e0', 'Meridian Renewal'), ('#e2364f', 'The Red Thread'), ('#f1ede2', 'Plain white'), ('#e8c33a', 'Gold')]
PRESETS = [
 dict(id='rider', label='Delivery rider', recipe=dict(top='hoodie', outerwear='courier', back='courierbox', legs='joggers', shoes='trainers', hat='cyclehelmet', prop='phone', gloves='cycling', trim='none', neck='none', face='none',
      colours=dict(top='#2f333a', outer='#2f7f7f', bag='#2f7f7f', legs='#16181c', shoes='#f1ede2', hat='#f1ede2'))),
 dict(id='mechanic', label='Mechanic', recipe=dict(top='tee', outerwear='none', back='toolbag', legs='overalls', shoes='workboots', hat='none', prop='wrench', gloves='work', trim='none', neck='none', face='none',
      colours=dict(top='#9aa0a6', legs='#22304a', shoes='#b0864e', bag='#b0864e'))),
 dict(id='roadman', label='Roadman', recipe=dict(top='hoodie', outerwear='puffer', back='messenger', legs='joggers', shoes='trainers', hat='none', prop='phone', gloves='none', trim='none', neck='chain', face='none',
      colours=dict(top='#16181c', outer='#16181c', legs='#2f333a', shoes='#f1ede2', bag='#16181c'))),
 dict(id='smart', label='Smart casual', recipe=dict(top='shirt', outerwear='blazer', back='none', legs='suit', shoes='smart', hat='none', prop='coffee', gloves='none', trim='none', neck='none', face='none',
      colours=dict(top='#f1ede2', outer='#22304a', legs='#2f333a', shoes='#16181c'))),
 dict(id='casual', label='Casual', recipe=dict(top='tee', outerwear='denim', back='backpack', legs='jeans', shoes='trainers', hat='none', prop='none', gloves='none', trim='none', neck='none', face='none',
      colours=dict(top='#d9d3c4', outer='#4a6d93', legs='#22304a', shoes='#f1ede2', bag='#2f333a'))),
 dict(id='writer', label='Graffiti writer', recipe=dict(top='hoodie', outerwear='none', back='backpack', legs='cargos', shoes='hightops', hat='bucket', prop='spraycan', gloves='black', trim='none', neck='none', face='snood',
      colours=dict(top='#5b4a8a', legs='#6b6b45', shoes='#16181c', hat='#d9d3c4', bag='#16181c'))),
 dict(id='driver', label='Wheelman', recipe=dict(top='tee', outerwear='leather', back='none', legs='jeans', shoes='boots', hat='none', prop='none', gloves='black', trim='none', neck='none', face='shades',
      colours=dict(top='#16181c', outer='#16181c', legs='#22304a', shoes='#3a2a1e'))),
 dict(id='dark', label='All in black', recipe=dict(top='longsleeve', outerwear='leather', back='none', legs='joggers', shoes='boots', hat='beanie', prop='none', gloves='black', trim='none', neck='none', face='none',
      colours=dict(top='#16181c', outer='#16181c', legs='#16181c', shoes='#16181c', hat='#16181c'))),
 dict(id='old', label='Old head', recipe=dict(top='shirt', outerwear='trench', back='none', legs='suit', shoes='smart', hat='flatcap', prop='cigarette', gloves='none', trim='none', neck='none', face='none',
      colours=dict(top='#d9d3c4', outer='#6b5a46', legs='#2f333a', shoes='#3a2a1e', hat='#6b5a46'))),
 dict(id='raver', label='Night out', recipe=dict(top='vest', outerwear='none', back='none', legs='skirt', shoes='heels', hat='none', prop='can', gloves='none', trim='collar', neck='chain', face='hoops',
      colours=dict(top='#16181c', legs='#6e2a35', shoes='#16181c'))),
 dict(id='footy', label='Matchday', recipe=dict(top='football', outerwear='none', back='none', legs='jeans', shoes='trainers', hat='none', prop='can', gloves='none', trim='none', neck='none', face='none',
      colours=dict(top='#c0392b', legs='#3d5a80', shoes='#f1ede2'))),
 dict(id='police', label='Met police officer', npc=True, recipe=dict(top='longsleeve', outerwear='hivisjacket', back='none', legs='suit', shoes='boots', hat='policecap', prop='radio', gloves='none', trim='battenburg', neck='none', face='none',
      colours=dict(top='#16181c', outer='#d8e03a', legs='#16181c', shoes='#16181c', acc='#22304a'), ring='#7fb2ff')),
 dict(id='bobby', label='Bobby on foot', npc=True, recipe=dict(top='longsleeve', outerwear='hivis', back='none', legs='suit', shoes='boots', hat='policehelmet', prop='radio', gloves='none', trim='battenburg', neck='none', face='none',
      colours=dict(top='#16181c', outer='#d8e03a', legs='#16181c', shoes='#16181c', acc='#22304a'), ring='#7fb2ff')),
 dict(id='paramedic', label='Paramedic', npc=True, recipe=dict(top='longsleeve', outerwear='hivisjacket', back='holdall', legs='cargos', shoes='boots', hat='none', prop='none', gloves='latex', trim='battenburg', neck='none', face='none',
      colours=dict(top='#2f5a3a', outer='#d8e03a', legs='#2f5a3a', shoes='#16181c', bag='#2f5a3a', acc='#2f5a3a'), ring='#8be6b0')),
 dict(id='cabbie', label='Cabbie', npc=True, recipe=dict(top='shirt', outerwear='none', back='none', legs='suit', shoes='smart', hat='none', prop='coffee', gloves='none', trim='none', neck='none', face='glasses',
      colours=dict(top='#7fb2ff', legs='#2f333a', shoes='#16181c'), ring='#ffc467')),
 dict(id='firefighter', label='Firefighter', npc=True, recipe=dict(top='longsleeve', outerwear='hivisjacket', back='none', legs='cargos', shoes='boots', hat='hardhat', prop='none', gloves='black', trim='stripe', neck='none', face='none',
      colours=dict(top='#16181c', outer='#2f333a', legs='#2f333a', shoes='#16181c', hat='#e8c33a', acc='#d8e03a'), ring='#ff8a3d')),
]
CATEGORIES = [
 dict(key='body', label='Build', group='Body'), dict(key='skin', label='Skin', group='Body'),
 dict(key='hair', label='Hair', group='Head', none='Bald'), dict(key='hat', label='Headwear', group='Head', none='Nothing'), dict(key='face', label='Face', group='Head', none='Nothing'),
 dict(key='top', label='Top', group='Clothes'), dict(key='outerwear', label='Jacket', group='Clothes', none='No jacket'), dict(key='legs', label='Bottoms', group='Clothes'),
 dict(key='shoes', label='Shoes', group='Clothes'), dict(key='gloves', label='Gloves', group='Clothes', none='Bare hands'),
 dict(key='trim', label='Faction trim', group='Style', none='No trim'), dict(key='neck', label='Neck', group='Style', none='Nothing'),
 dict(key='back', label='Bag', group='Kit', none='No bag'), dict(key='prop', label='In hand', group='Kit', none='Empty hands'),
]
BUILDS = [dict(id='slim', label='Slim', sx=.88, sy=.886), dict(id='medium', label='Medium', sx=1, sy=1), dict(id='heavy', label='Heavy', sx=1.187, sy=1.2)]


def main():
    os.makedirs(OUT, exist_ok=True)
    catalogue_parts = []
    for category, pid, label, body, meta in PARTS:
        rel = None
        if body:
            d = os.path.join(OUT, category); os.makedirs(d, exist_ok=True)
            rel = f'assets/tokens/builder/{category}/{pid}.svg'
            open(os.path.join(ROOT, rel), 'w').write(
                f'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" data-part="{category}/{pid}">'
                f'<!-- The Smoke token builder part: {label}. Facing up; colours are slot placeholders the builder fills. -->{body}</svg>\n')
        entry = dict(id=pid, category=category, label=label)
        if rel: entry['file'] = rel
        for k in ('colour', 'default', 'hides', 'always', 'glove', 'hivis', 'hood', 'number', 'npc'):
            if k in meta: entry[k] = meta[k]
        catalogue_parts.append(entry)
    cat = dict(version=1, canvas=512, output=512, note='Built by scripts/tokens/draw_parts.py. Parts face the top edge; the builder turns the figure to face the bottom edge like every Smoke token.',
               builds=BUILDS, categories=CATEGORIES, skins=[dict(id=i, label=l, colour=c) for i, l, c in SKINS],
               palettes=dict(hair=[dict(colour=c, label=l) for c, l in HAIR], cloth=[dict(colour=c, label=l) for c, l in CLOTH], accent=[dict(colour=c, label=l) for c, l in ACCENT]),
               parts=catalogue_parts, presets=PRESETS)
    json.dump(cat, open(os.path.join(ROOT, 'data', 'token-builder.json'), 'w'), indent=1)
    print(len([p for p in catalogue_parts if p.get('file')]), 'part files,', len(catalogue_parts), 'catalogue entries,', len(PRESETS), 'presets')


if __name__ == '__main__':
    main()
