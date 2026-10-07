import sys, numpy as np, potrace
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
S = 3  # upscale before thresholding for smoother outlines
im = Image.open(src).convert('L')
a = np.asarray(im).astype(float)
ys, xs = np.where(a > 128)
pad = 6
x0, x1, y0, y1 = xs.min() - pad, xs.max() + pad, ys.min() - pad, ys.max() + pad
im = im.crop((x0, y0, x1 + 1, y1 + 1))
im = im.resize((im.width * S, im.height * S), Image.LANCZOS)
b = np.asarray(im) > 128
W, H = b.shape[1], b.shape[0]
split = (1005 - x0) * S  # text left of here, footprints right
def trace(mask):
    # Bitmap inverts its input, so pass the background as True
    plist = potrace.Bitmap(~mask).trace(turdsize=20, alphamax=1.0, opticurve=True, opttolerance=0.2)
    f = lambda p: f"{p.x / S:.2f} {p.y / S:.2f}"
    d = []
    for c in plist:
        d.append("M" + f(c.start_point))
        for s in c.segments:
            d.append(("L" + f(s.c) + "L" + f(s.end_point)) if s.is_corner else ("C" + f(s.c1) + " " + f(s.c2) + " " + f(s.end_point)))
        d.append("Z")
    return "".join(d)
text = b.copy(); text[:, split:] = False
feet = b.copy(); feet[:, :split] = False
w, h = W / S, H / S
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" role="img" aria-label="CO2Trace"><title>CO2Trace</title><path id="wordmark" fill="currentColor" fill-rule="evenodd" d="{trace(text)}"/><path id="footprints" fill="currentColor" fill-rule="evenodd" d="{trace(feet)}"/></svg>'''
open(out, 'w').write(svg)
print(w, h, len(svg))
