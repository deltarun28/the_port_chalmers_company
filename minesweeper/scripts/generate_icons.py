#!/usr/bin/env python3
"""Generate the PWA icon set for Minesweeper.

Draws a mine on a night-sky board in the site palette. Everything is drawn at 4x
and downsampled, which is how the curves and spikes come out smooth without
pulling in an SVG rasteriser.

Two shapes are produced from the same artwork:

  * the standard icons, where the art fills the tile
  * the maskable icon, where the art is shrunk into the safe zone — Android crops
    a maskable icon to whatever shape the launcher uses, and anything outside the
    middle ~80% can be cut off.

Usage:  python3 scripts/generate_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

BG = (10, 14, 26, 255)        # --bg-base
BOARD = (23, 50, 78, 255)     # --cell-hidden
EDGE = (35, 95, 146, 255)     # --cell-hidden-edge
MINE = (232, 234, 246, 255)   # --text-primary
SHINE = (168, 216, 240, 255)  # --text-highlight
FUSE = (251, 191, 36, 255)    # --n5, warm against all the blue

SS = 4                        # supersampling factor
ICONS = Path(__file__).resolve().parent.parent / "icons"


def draw(size: int, inset: float) -> Image.Image:
    """Render one icon. `inset` is the fraction of the tile left as margin."""
    s = size * SS
    img = Image.new("RGBA", (s, s), BG)
    d = ImageDraw.Draw(img)

    pad = s * inset
    box = s - 2 * pad

    # Rounded board tile behind the mine.
    d.rounded_rectangle(
        [pad, pad, s - pad, s - pad],
        radius=box * 0.18,
        fill=BOARD,
        outline=EDGE,
        width=max(1, int(s * 0.012)),
    )

    cx = cy = s / 2
    r = box * 0.26                       # mine body
    spike_len = r * 1.55                 # spikes reach past the body
    spike_w = r * 0.30

    # Eight spikes: four square, four diagonal — the classic mine silhouette.
    for i in range(8):
        if i % 2 == 0:
            dx, dy = [(0, -1), (1, 0), (0, 1), (-1, 0)][i // 2]
        else:
            k = 0.7071
            dx, dy = [(k, -k), (k, k), (-k, k), (-k, -k)][i // 2]
        ex, ey = cx + dx * spike_len, cy + dy * spike_len
        d.line([cx, cy, ex, ey], fill=MINE, width=int(spike_w))
        # Round the spike tips so they don't read as cut-off sticks.
        d.ellipse([ex - spike_w / 2, ey - spike_w / 2, ex + spike_w / 2, ey + spike_w / 2], fill=MINE)

    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=MINE)

    # Highlight, up and to the left — gives the body a bit of volume.
    hr = r * 0.28
    hx, hy = cx - r * 0.38, cy - r * 0.38
    d.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=SHINE)

    # Fuse spark on the top-right spike.
    fx, fy = cx + 0.7071 * spike_len, cy - 0.7071 * spike_len
    fr = spike_w * 0.85
    d.ellipse([fx - fr, fy - fr, fx + fr, fy + fr], fill=FUSE)

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)

    for size in (192, 512):
        draw(size, inset=0.06).save(ICONS / f"icon-{size}.png")

    # Maskable: pull the art well inside the safe zone and let the background
    # bleed to the edges, so any launcher crop still lands on background.
    draw(512, inset=0.20).save(ICONS / "icon-maskable-512.png")

    # iOS applies its own rounding and has no transparency, so a plain square.
    draw(180, inset=0.06).save(ICONS / "apple-touch-icon.png")

    print(f"wrote 4 icons to {ICONS}")


if __name__ == "__main__":
    main()
