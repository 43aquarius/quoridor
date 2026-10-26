#!/usr/bin/env python3
"""精选开发验证截图 → 缩放压缩为 README 素材（docs/screenshots/）。

源图来自 scripts/shot-*.png（E2E 验证存证），只挑能代表产品面貌的几张入库。
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

JOBS = [
    ("scripts/shot-hero-final.png", "docs/screenshots/hero.png", 1200),
    ("scripts/shot-r3-e2e-final.png", "docs/screenshots/duel-ai.png", 1100),
    ("scripts/shot-4p-final.png", "docs/screenshots/four-player.png", 1100),
    ("scripts/shot-v2-online-waiting.png", "docs/screenshots/online-room.png", 1100),
    ("scripts/shot-poster.png", "docs/screenshots/poster.png", 1100),
    ("scripts/shot-v2-mobile-game.png", "docs/screenshots/mobile.png", 390),
]


def main() -> None:
    for src, dst, width in JOBS:
        sp = os.path.join(ROOT, src)
        dp = os.path.join(ROOT, dst)
        if not os.path.exists(sp):
            print(f"跳过（缺源图）: {src}")
            continue
        os.makedirs(os.path.dirname(dp), exist_ok=True)
        im = Image.open(sp).convert("RGB")
        if im.width > width:
            h = round(im.height * width / im.width)
            im = im.resize((width, h), Image.LANCZOS)
        im.save(dp, optimize=True)
        if os.path.getsize(dp) > 300_000:
            im.quantize(colors=256).save(dp, optimize=True)
        print(f"{dst}  {im.width}x{im.height}  {os.path.getsize(dp) / 1024:.0f}KB")


if __name__ == "__main__":
    main()
