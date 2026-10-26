#!/usr/bin/env python3
"""从 public/icon.svg 与 scripts/icon-fg.svg 生成 Android 全密度启动图标。

产出（android/app/src/main/res/）：
- mipmap-{mdpi..xxxhdpi}/ic_launcher.png       圆角方形品牌图标
- mipmap-{mdpi..xxxhdpi}/ic_launcher_round.png 纸色圆盘 + 前景纹样
- mipmap-{mdpi..xxxhdpi}/ic_launcher_fg.png    自适应图标前景（108dp 画布）
另有 docs/icon-512.png 供仓库/发布物料使用。
"""
import io
import os

import cairosvg
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FULL = os.path.join(ROOT, "public", "icon.svg")
FG = os.path.join(ROOT, "scripts", "icon-fg.svg")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
DENSITIES = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}
PAPER = (245, 242, 234, 255)


def render_png(svg_path: str, size: int) -> Image.Image:
    buf = io.BytesIO()
    cairosvg.svg2png(url=svg_path, write_to=buf, output_width=size, output_height=size)
    buf.seek(0)
    return Image.open(buf).convert("RGBA")


def main() -> None:
    ss = 2048  # 超采样抗锯齿
    full = render_png(FULL, ss)
    fg_big = render_png(FG, ss)

    # 圆形图标的圆盘底 + 前景纹样（66/108 安全区比例居中）
    disc = Image.new("RGBA", (ss, ss), (0, 0, 0, 0))
    ImageDraw.Draw(disc).ellipse((0, 0, ss - 1, ss - 1), fill=PAPER)
    inner = int(ss * 66 / 108)
    fg_inner = fg_big.resize((inner, inner), Image.LANCZOS)
    off = (ss - inner) // 2
    disc.alpha_composite(fg_inner, (off, off))

    for name, scale in DENSITIES.items():
        mdir = os.path.join(RES, f"mipmap-{name}")
        os.makedirs(mdir, exist_ok=True)
        base = int(48 * scale)
        fbase = int(108 * scale)
        full.resize((base, base), Image.LANCZOS).save(
            os.path.join(mdir, "ic_launcher.png"), optimize=True)
        disc.resize((base, base), Image.LANCZOS).save(
            os.path.join(mdir, "ic_launcher_round.png"), optimize=True)
        fg_big.resize((fbase, fbase), Image.LANCZOS).save(
            os.path.join(mdir, "ic_launcher_fg.png"), optimize=True)
        print(f"mipmap-{name}: launcher {base}px / round {base}px / fg {fbase}px")

    docs = os.path.join(ROOT, "docs")
    os.makedirs(docs, exist_ok=True)
    full.resize((512, 512), Image.LANCZOS).save(
        os.path.join(docs, "icon-512.png"), optimize=True)
    print("docs/icon-512.png 完成")


if __name__ == "__main__":
    main()
