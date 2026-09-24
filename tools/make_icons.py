"""Erzeugt die App-Symbole (PNG) in ../icons. Aufruf: python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent.parent / "icons"
GREEN = (14, 124, 102, 255)
WHITE = (242, 246, 248, 255)
S = 2048  # Arbeitsgröße, wird für Kantenglättung herunterskaliert


def draw(scale):
    """scale: Anteil der Kantenlänge, den das Ticket einnimmt (maskable braucht Rand)."""
    img = Image.new("RGBA", (S, S), GREEN)
    d = ImageDraw.Draw(img)
    w, h = S * scale, S * scale * 0.68
    x0, y0 = (S - w) / 2, (S - h) / 2
    x1, y1 = x0 + w, y0 + h
    d.rounded_rectangle((x0, y0, x1, y1), radius=w * 0.09, fill=WHITE)
    # Kerben links und rechts auf Höhe der Perforation
    py = y0 + h * 0.66
    r = w * 0.075
    d.ellipse((x0 - r, py - r, x0 + r, py + r), fill=GREEN)
    d.ellipse((x1 - r, py - r, x1 + r, py + r), fill=GREEN)
    # Perforation
    dash, gap, th = w * 0.045, w * 0.035, w * 0.018
    x = x0 + r * 1.6
    while x + dash < x1 - r * 1.6:
        d.rounded_rectangle((x, py - th / 2, x + dash, py + th / 2), radius=th / 2, fill=GREEN)
        x += dash + gap
    # Euro-Zeichen im oberen Teil
    font = ImageFont.truetype("arialbd.ttf", int(h * 0.5))
    cy = y0 + (py - y0) / 2
    d.text((S / 2, cy), "€", font=font, fill=GREEN, anchor="mm")
    # Balken im Abriss
    bw, bh = w * 0.55, h * 0.07
    by = py + (y1 - py) / 2
    d.rounded_rectangle((S / 2 - bw / 2, by - bh / 2, S / 2 + bw / 2, by + bh / 2), radius=bh / 2, fill=(213, 238, 231, 255))
    d.rounded_rectangle((S / 2 - bw / 2, by - bh / 2, S / 2 - bw / 2 + bw * 0.62, by + bh / 2), radius=bh / 2, fill=GREEN)
    return img


def main():
    OUT.mkdir(exist_ok=True)
    normal, maskable = draw(0.74), draw(0.6)
    for name, src, size in [
        ("icon-192.png", normal, 192),
        ("icon-512.png", normal, 512),
        ("maskable-512.png", maskable, 512),
        ("apple-touch-icon.png", maskable, 180),
        ("favicon-32.png", normal, 32),
    ]:
        src.resize((size, size), Image.LANCZOS).convert("RGB").save(OUT / name, optimize=True)
        print(name)


if __name__ == "__main__":
    main()
