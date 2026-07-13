#!/usr/bin/env python3
"""Generate the PWA icon set for Sudoku.

Draws a 3x3 grid with a few digits filled in, in the site palette. Everything is
drawn at 4x and downsampled so the rules and glyphs come out clean.

Two shapes are produced from the same artwork:

  * the standard icons, where the art fills the tile
  * the maskable icon, where the art is shrunk into the safe zone — Android crops
    a maskable icon to whatever shape the launcher uses, and anything outside the
    middle ~80% can be cut off.

Usage:  python3 scripts/generate_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BG = (10, 14, 26, 255)         # --bg-base
CELL = (15, 30, 48, 255)       # --cell-bg
RULE = (46, 122, 181, 255)     # --rule-box
GIVEN = (232, 234, 246, 255)   # --digit-given
USER = (92, 159, 212, 255)     # --digit-user

# A 3x3 face with a scatter of digits — enough to read as sudoku at 48px.
# None is an empty cell; (digit, is_given) otherwise.
FACE = [
    [(5, True), None, (3, False)],
    [None, (7, False), None],
    [(1, False), None, (9, True)],
]

SS = 4
ICONS = Path(__file__).resolve().parent.parent / "icons"

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
]


def load_font(px: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, px)
    # Bitmap fallback: the icon will be uglier but the build still succeeds.
    return ImageFont.load_default()


def draw(size: int, inset: float) -> Image.Image:
    s = size * SS
    img = Image.new("RGBA", (s, s), BG)
    d = ImageDraw.Draw(img)

    pad = s * inset
    box = s - 2 * pad
    cell = box / 3

    d.rounded_rectangle(
        [pad, pad, s - pad, s - pad],
        radius=box * 0.10,
        fill=CELL,
        outline=RULE,
        width=max(2, int(box * 0.035)),
    )

    # The two inner rules that make it a grid.
    for i in (1, 2):
        d.line([pad + cell * i, pad, pad + cell * i, s - pad], fill=RULE, width=max(1, int(box * 0.018)))
        d.line([pad, pad + cell * i, s - pad, pad + cell * i], fill=RULE, width=max(1, int(box * 0.018)))

    font = load_font(int(cell * 0.62))
    for r, row in enumerate(FACE):
        for c, entry in enumerate(row):
            if entry is None:
                continue
            digit, is_given = entry
            cx = pad + cell * (c + 0.5)
            cy = pad + cell * (r + 0.5)
            d.text(
                (cx, cy),
                str(digit),
                font=font,
                fill=GIVEN if is_given else USER,
                anchor="mm",
            )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)

    for size in (192, 512):
        draw(size, inset=0.08).save(ICONS / f"icon-{size}.png")

    # Maskable: art pulled into the safe zone, background bleeding to the edges.
    draw(512, inset=0.22).save(ICONS / "icon-maskable-512.png")

    # iOS applies its own rounding and has no transparency, so a plain square.
    draw(180, inset=0.08).save(ICONS / "apple-touch-icon.png")

    print(f"wrote 4 icons to {ICONS}")


if __name__ == "__main__":
    main()
