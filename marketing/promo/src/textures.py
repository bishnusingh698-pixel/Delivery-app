"""Print textures for the promo video (python3 src/textures.py, from marketing/promo).

build/tex/paper.jpg      cream stock with soft fibres, the sheet background (1920x1080)
build/tex/grain.png      fine print grain, alpha only, a static overlay on the whole frame
build/tex/ink.png        ink-coverage mask: mostly solid with small voids, for big type and flat shapes
build/tex/rubber.png     stronger voids and worn edges, for rubber stamps
"""
import pathlib
import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "build" / "tex"; OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def blur(a, r):
    """Gaussian blur (float, wraps around so textures tile)."""
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]; fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * r) ** 2 * (fx ** 2 + fy ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * g)).astype(np.float32)


def z(a):
    return (a - a.mean()) / (a.std() + 1e-9)


def fractal(h, w, octaves):
    """Sum of blurred noise layers, each scaled to unit deviation, then the sum too."""
    acc = np.zeros((h, w), np.float32)
    for radius, weight in octaves:
        acc += weight * z(blur(rng.standard_normal((h, w)), radius))
    return z(acc)


# paper: cream base, low-frequency mottling, faint fibres
H, W = 1080, 1920
base = np.array([241, 234, 219], np.float32)
mott = fractal(H, W, [(60, 1.0), (14, 0.5), (3, 0.25)])
fib = np.zeros((H, W), np.float32)
for _ in range(900):
    x, y = rng.integers(0, W), rng.integers(0, H)
    L = rng.integers(8, 40); ang = rng.uniform(0, np.pi)
    for i in range(L):
        xx, yy = int(x + i * np.cos(ang)), int(y + i * np.sin(ang))
        if 0 <= xx < W and 0 <= yy < H:
            fib[yy, xx] += 1
fib = blur(fib, 0.6)
fib = fib / (fib.max() + 1e-9)
img = base[None, None, :] * (1 + 0.012 * mott[..., None]) - 26 * fib[..., None]
Image.fromarray(np.uint8(np.clip(img, 0, 255))).save(OUT / "paper.jpg", quality=92)

# grain: alpha speckle (dark), tile 1024
G = 1024
n = rng.standard_normal((G, G)).astype(np.float32)
n = z(blur(n, 0.55))
alpha = np.clip((np.abs(n) - 1.1) / 2.2, 0, 1) ** 1.2 * 150
rgba = np.zeros((G, G, 4), np.uint8); rgba[..., :3] = (40, 30, 22); rgba[..., 3] = np.uint8(np.clip(alpha, 0, 255))
Image.fromarray(rgba).save(OUT / "grain.png")

# ink coverage: solid with voids (riso coverage is never perfect)
T = 1024
v = fractal(T, T, [(0.9, 1.0), (2.5, 0.7), (9, 0.5)])
dens = 1 - np.clip((v - 2.0) * 1.6, 0, 1)            # small voids, about 3% of the area
dens *= 0.88 + 0.12 * np.clip(0.5 + 0.25 * z(blur(rng.standard_normal((T, T)), 40)), 0, 1)  # density drift
mask = np.zeros((T, T, 4), np.uint8); mask[..., :3] = 0; mask[..., 3] = np.uint8(np.clip(dens, 0, 1) * 255)
Image.fromarray(mask).save(OUT / "ink.png")

# rubber stamp: more voids, scratches
r = fractal(T, T, [(0.8, 1.0), (2.5, 0.8), (8, 0.7)])
d = 1 - np.clip((r - 1.2) * 1.4, 0, 1)
scr = np.zeros((T, T), np.float32)
for _ in range(16):
    x, y = rng.integers(0, T), rng.integers(0, T); ang = rng.uniform(-0.5, 0.5); L = rng.integers(20, 90)
    for i in range(L):
        xx, yy = int(x + i * np.cos(ang)) % T, int(y + i * np.sin(ang)) % T
        scr[yy, xx] = 1
d *= 1 - np.clip(blur(scr, 0.6) * 2.2, 0, 0.85)
m2 = np.zeros((T, T, 4), np.uint8); m2[..., 3] = np.uint8(np.clip(d, 0, 1) * 255)
Image.fromarray(m2).save(OUT / "rubber.png")
print("textures ->", OUT)
