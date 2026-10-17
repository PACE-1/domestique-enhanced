"""Builds assets/icon.ico and assets/icon.icns from the 1024 px render (see tools/make-icons.mjs)."""
from pathlib import Path

from PIL import Image

assets = Path(__file__).resolve().parent.parent / "assets"
big = assets / ".icon-1024.png"
img = Image.open(big).convert("RGBA")
img.save(assets / "icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
img.save(assets / "icon.icns")
big.unlink()
