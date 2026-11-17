#!/usr/bin/env python3
"""步步为营 — Yoola 平台素材生成（Risograph 印刷风，与游戏内视觉一致）
1. icon.png         220×220   玩法 logo
2. share-image.png  510×350   封面及分享图
3. loading-image.png 640×1400 竖屏加载背景图（<1MiB）
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = "/home/z/my-project/quoridor-yoola/package/yoola-assets"
os.makedirs(OUT, exist_ok=True)

PAPER = (242, 236, 221)
PANEL = (251, 247, 236)
CELL_A = (242, 234, 214)
CELL_B = (239, 229, 204)
INK = (26, 26, 26)
RED = (255, 77, 46)
RED_D = (217, 58, 32)
BLUE = (36, 64, 179)
BLUE_D = (28, 51, 144)
SOFT = (26, 26, 26, 140)

F_BOLD = "/usr/share/fonts/truetype/chinese/NotoSansSC-Bold.ttf"
F_REG = "/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf"
F_BLACK = "/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Black.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def rr(d, box, r, fill=None, outline=None, width=1):
    d.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def dots(d, w, h, gap=18, alpha=12):
    """细网点纸感"""
    for y in range(4, h, gap):
        for x in range(4, w, gap):
            d.point((x, y), fill=(26, 26, 26, alpha))


def draw_board(d, ox, oy, size, n=5, wall_thick=None):
    """迷你棋盘：格子 + 目标行染色"""
    p = size / n
    c = p * 0.84
    g = p - c
    # 顶行红染 / 底行蓝染
    d.rectangle([ox - 4, oy - 4, ox + size + 4, oy + p * 0.9], fill=(255, 77, 46, 36))
    d.rectangle([ox - 4, oy + size - p * 0.9, ox + size + 4, oy + size + 4], fill=(36, 64, 179, 36))
    # 格子
    for yy in range(n):
        for xx in range(n):
            fill = CELL_A if (xx + yy) % 2 == 0 else CELL_B
            d.rectangle([ox + xx * p + g / 2, oy + yy * p + g / 2,
                         ox + xx * p + g / 2 + c, oy + yy * p + g / 2 + c], fill=fill)
    return p, c, g


def draw_wall(d, ox, oy, p, c, g, x, y, o, col):
    if o == "h":
        box = [ox + x * p + g / 2, oy + (y + 1) * p - g / 2,
               ox + x * p + g / 2 + c * 2 + g, oy + (y + 1) * p + g / 2]
    else:
        box = [ox + (x + 1) * p - g / 2, oy + y * p + g / 2,
               ox + (x + 1) * p + g / 2, oy + y * p + g / 2 + c * 2 + g]
    rr(d, [box[0] + 2, box[1] + 2, box[2] + 2, box[3] + 2], g / 2, fill=(26, 26, 26, 70))
    rr(d, box, g / 2, fill=col)


def draw_pawn(d, cx, cy, r, col, ch, f):
    cx, cy, r = int(cx), int(cy), int(r)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col, outline=INK, width=max(2, r // 6))
    w, h = d.textbbox((0, 0), ch, font=f)[2:]
    d.text((cx - w / 2, cy - h / 2 - 1), ch, font=f, fill=PANEL)


# ─────────────────────────── 1. icon 220×220 ───────────────────────────
def make_icon():
    S = 220
    img = Image.new("RGB", (S, S), PAPER)
    d = ImageDraw.Draw(img, "RGBA")
    dots(d, S, S, gap=14, alpha=14)
    # 外框
    rr(d, [6, 6, S - 6, S - 6], 26, outline=INK, width=5)
    # 中央棋盘
    bs = 118
    ox, oy = (S - bs) / 2, 40
    p, c, g = draw_board(d, ox, oy, bs, n=4)
    draw_wall(d, ox, oy, p, c, g, 1, 1, "h", RED)
    draw_wall(d, ox, oy, p, c, g, 1, 2, "v", BLUE)
    fp = font(F_BOLD, int(c * 0.62))
    draw_pawn(d, ox + p * 0.5 + c / 2, oy + 3 * p + c / 2, c * 0.42, RED, "甲", fp)
    draw_pawn(d, ox + 2 * p + c / 2, oy + c / 2, c * 0.42, BLUE, "乙", fp)
    # 底部题字
    ft = font(F_BOLD, 30)
    w = d.textbbox((0, 0), "步步为营", font=ft)[2]
    d.text(((S - w) / 2 + 2, 166 + 2), "步步为营", font=ft, fill=(26, 26, 26, 60))
    d.text(((S - w) / 2, 166), "步步为营", font=ft, fill=INK)
    img.save(f"{OUT}/icon.png", optimize=True)
    print("icon.png", img.size, os.path.getsize(f"{OUT}/icon.png"), "bytes")


# ─────────────────────────── 2. share 510×350 ───────────────────────────
def make_share():
    W, H = 510, 350
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img, "RGBA")
    dots(d, W, H, gap=16, alpha=11)
    # 边框
    rr(d, [8, 8, W - 8, H - 8], 18, outline=INK, width=4)
    # 左侧题字区
    fx = 36
    ft = font(F_BLACK, 66)
    d.text((fx + 4, 56 + 4), "步步为营", font=ft, fill=BLUE)
    d.text((fx, 56), "步步为营", font=ft, fill=RED)
    fs = font(F_REG, 17)
    d.text((fx + 2, 142), "QUORIDOR · 快手互动玩法", font=fs, fill=(26, 26, 26, 175))
    # 规则三行
    fr = font(F_BOLD, 20)
    lines = [
        ("走一步，或立一堵墙", INK),
        ("率先抵达对面底线者胜", INK),
        ("看谁先把谁困死！", RED),
    ]
    y = 190
    for txt, col in lines:
        d.text((fx, y), txt, font=fr, fill=col)
        y += 32
    # 右侧棋盘插画
    bs = 236
    ox, oy = W - bs - 42, (H - bs) / 2
    p, c, g = draw_board(d, ox, oy, bs, n=5)
    draw_wall(d, ox, oy, p, c, g, 1, 1, "h", RED)
    draw_wall(d, ox, oy, p, c, g, 3, 2, "v", RED)
    draw_wall(d, ox, oy, p, c, g, 1, 2, "h", BLUE)
    draw_wall(d, ox, oy, p, c, g, 2, 3, "v", BLUE)
    fp = font(F_BOLD, int(c * 0.62))
    draw_pawn(d, ox + 2 * p + c / 2, oy + 3 * p + c / 2, c * 0.44, RED, "甲", fp)
    draw_pawn(d, ox + 2 * p + c / 2, oy + p + c / 2, c * 0.44, BLUE, "乙", fp)
    img.save(f"{OUT}/share-image.png", optimize=True)
    print("share-image.png", img.size, os.path.getsize(f"{OUT}/share-image.png"), "bytes")


# ─────────────────────────── 3. loading 640×1400 ───────────────────────────
def make_loading():
    W, H = 640, 1400
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img, "RGBA")
    dots(d, W, H, gap=20, alpha=10)
    # 顶部安全区示意：细红条
    d.rectangle([0, 0, W, 10], fill=RED)
    # 大标题（红蓝错位铅印）
    ft = font(F_BLACK, 128)
    tw = d.textbbox((0, 0), "步步为营", font=ft)[2]
    tx = (W - tw) / 2
    d.text((tx + 6, 306 + 6), "步步为营", font=ft, fill=BLUE)
    d.text((tx, 306), "步步为营", font=ft, fill=RED)
    fs = font(F_REG, 30)
    sw = d.textbbox((0, 0), "QUORIDOR · 挡板棋对决", font=fs)[2]
    d.text(((W - sw) / 2, 474), "QUORIDOR · 挡板棋对决", font=fs, fill=(26, 26, 26, 180))
    # 中部棋盘 hero
    bs = 470
    ox, oy = (W - bs) / 2, 570
    p, c, g = draw_board(d, ox, oy, bs, n=5)
    draw_wall(d, ox, oy, p, c, g, 1, 1, "h", RED)
    draw_wall(d, ox, oy, p, c, g, 3, 2, "v", BLUE)
    draw_wall(d, ox, oy, p, c, g, 1, 2, "h", BLUE)
    draw_wall(d, ox, oy, p, c, g, 2, 3, "v", RED)
    fp = font(F_BOLD, int(c * 0.62))
    draw_pawn(d, ox + 2 * p + c / 2, oy + 3 * p + c / 2, c * 0.44, RED, "甲", fp)
    draw_pawn(d, ox + 2 * p + c / 2, oy + p + c / 2, c * 0.44, BLUE, "乙", fp)
    # 底部加载文案
    fl = font(F_BOLD, 36)
    lw = d.textbbox((0, 0), "正在排版铅字……", font=fl)[2]
    d.text(((W - lw) / 2 + 3, 1126 + 3), "正在排版铅字……", font=fl, fill=(26, 26, 26, 60))
    d.text(((W - lw) / 2, 1126), "正在排版铅字……", font=fl, fill=INK)
    fm = font(F_REG, 24)
    mw = d.textbbox((0, 0), "甲乙执红蓝二色 · 放板围路 · 先达者胜", font=fm)[2]
    d.text(((W - mw) / 2, 1190), "甲乙执红蓝二色 · 放板围路 · 先达者胜", font=fm, fill=(26, 26, 26, 165))
    img.save(f"{OUT}/loading-image.png", optimize=True)
    print("loading-image.png", img.size, os.path.getsize(f"{OUT}/loading-image.png"), "bytes")


make_icon()
make_share()
make_loading()
