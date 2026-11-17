#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""步步为营 Yoola 素材三件套（v2 修正版）
logo 220×220 / 封面分享图 510×350 / 加载图 640×1400
风格与 Web 版一致：草浆纸白 #F5F2EA + 墨黑 #1A1A1A + 荧光红 #FF4D2E / 钴蓝 #2440B3。
中文一律思源宋体（子集含所需汉字），纯 ASCII 才用 IBM Plex Mono / Playfair。
"""
from PIL import Image, ImageDraw, ImageFont
import random, os

FONT_DIR = '/home/z/my-project/quoridor-yoola/package/fonts'
OUT_DIR = '/home/z/my-project/download/素材'
os.makedirs(OUT_DIR, exist_ok=True)

PAPER = (245, 242, 234)
INK = (26, 26, 26)
RED = (255, 77, 46)
BLUE = (36, 64, 179)

def F(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)

def serifX(sz): return F('serif-sc-black.ttf', sz)
def serifB(sz): return F('serif-sc-bold.ttf', sz)
def serifR(sz): return F('serif-sc-regular.ttf', sz)
def monoB(sz): return F('plex-mono-bold.ttf', sz)
def monoR(sz): return F('plex-mono-regular.ttf', sz)
def westB(sz): return F('playfair-black.ttf', sz)

def grain(img, n, alpha_max=28, seed=7):
    rnd = random.Random(seed)
    d = ImageDraw.Draw(img, 'RGBA')
    w, h = img.size
    for _ in range(n):
        x, y = rnd.randrange(w), rnd.randrange(h)
        d.point((x, y), fill=(26, 26, 26, rnd.randrange(5, alpha_max)))

def tracked_text(d, x, y, text, font, fill, tracking=0):
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + tracking

def tracked_width(d, text, font, tracking=0):
    return sum(d.textlength(c, font=font) for c in text) + tracking * max(0, len(text) - 1)

def center_tracked(d, cx, y, text, font, fill, tracking=0):
    w = tracked_width(d, text, font, tracking)
    tracked_text(d, cx - w / 2, y, text, font, fill, tracking)

# ---------------------------------------------------------------- logo 220×220
def make_logo():
    W = H = 220
    img = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(img, 'RGBA')
    d.rectangle([10, 10, W - 11, H - 11], outline=INK + (178,), width=1)
    d.rectangle([16, 16, W - 17, H - 17], outline=INK + (102,), width=1)
    # 步步为营 2×2（54px，行距留足，避免与底部 QUORIDOR 相撞）
    f = serifX(54)
    cells = [(W/2 - 36, 38), (W/2 + 10, 38), (W/2 - 36, 100), (W/2 + 10, 100)]
    for ch, (x, y) in zip('步步为营', cells):
        d.text((x + 2.5, y + 2.5), ch, font=f, fill=RED + (110,))
        d.text((x, y), ch, font=f, fill=INK)
    d.line([(W/2 - 48, 94), (W/2 + 48, 94)], fill=INK + (76,), width=1)
    d.line([(W/2, 34), (W/2, 166)], fill=INK + (45,), width=1)
    center_tracked(d, W/2, 184, 'QUORIDOR', monoB(10), INK + (165,), 3)
    grain(img, 300, 30)
    img.save(os.path.join(OUT_DIR, 'logo-220x220.png'))
    print('logo ok')

# ------------------------------------------------------- 封面分享图 510×350
def make_cover():
    W, H = 510, 350
    img = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(img, 'RGBA')
    d.rectangle([12, 12, W - 13, H - 13], outline=INK + (178,), width=1)
    d.rectangle([18, 18, W - 19, H - 19], outline=INK + (102,), width=1)
    # 眉线（纯 ASCII 用 mono，中文用宋体小签）
    center_tracked(d, W/2, 40, '限量印刷棋谱专著', serifR(15), INK + (158,), 7)
    center_tracked(d, W/2, 68, 'A MONOGRAPH THAT PLAYS BACK', monoR(11), INK + (140,), 4)
    # 主标题（红套印，82px）
    f = serifX(82)
    cw = d.textlength('步', font=f)
    x0 = W/2 - (4 * cw + 3 * 10) / 2
    for i, ch in enumerate('步步为营'):
        x = x0 + i * (cw + 10)
        d.text((x + 2.5, 100 + 2.5), ch, font=f, fill=RED + (112,))
        d.text((x, 100), ch, font=f, fill=INK)
    # QUORIDOR（字距收窄）
    center_tracked(d, W/2, 216, 'QUORIDOR', westB(27), INK, 7)
    center_tracked(d, W/2, 256, 'EST. 1997 · GIGAMIC PARIS — SET IN TYPE MMXXVI', monoR(11), INK + (140,), 2)
    # 双色行（中文用宋体，确保字形存在；红蓝方块着色）
    fMix = serifR(13)
    seg = [('双色 RISOGRAPH 套印 ', INK + (150,)), ('■ 荧光红', RED), (' × ', INK + (150,)), ('■ 钴蓝', BLUE), (' · 步步为营编辑部 出品', INK + (150,))]
    total = sum(d.textlength(s, font=fMix) for s, _ in seg)
    x = W/2 - total / 2
    for s, c in seg:
        d.text((x, 288), s, font=fMix, fill=c)
        x += d.textlength(s, font=fMix)
    center_tracked(d, W/2, 316, '第壹卷第壹版 · MMXXVI 限量玖拾玖部', serifR(12), INK + (140,), 3)
    grain(img, 1000, 28)
    img.save(os.path.join(OUT_DIR, 'cover-share-510x350.png'))
    print('cover ok')

# ---------------------------------------------------------- 加载图 640×1400
def make_loading():
    W, H = 640, 1400
    img = Image.new('RGB', (W, H), PAPER)
    d = ImageDraw.Draw(img, 'RGBA')
    d.rectangle([20, 20, W - 21, H - 21], outline=INK + (178,), width=1)
    d.rectangle([28, 28, W - 29, H - 29], outline=INK + (102,), width=1)
    # 顶部眉线
    center_tracked(d, W/2, 84, '限量印刷棋谱专著', serifB(17), INK + (160,), 9)
    center_tracked(d, W/2, 118, 'A MONOGRAPH THAT PLAYS BACK', monoR(13), INK + (140,), 6)
    d.line([(W/2 - 120, 152), (W/2 + 120, 152)], fill=INK + (64,), width=1)
    # 横排大标题（红色套印，118px，四字完整落在安全边距内）
    f = serifX(118)
    cw = d.textlength('步', font=f)
    x0 = W/2 - (4 * cw + 3 * 12) / 2
    for i, ch in enumerate('步步为营'):
        x = x0 + i * (cw + 12)
        d.text((x + 3.5, 204 + 3.5), ch, font=f, fill=RED + (112,))
        d.text((x, 204), ch, font=f, fill=INK)
    # 棋盘插画（7×7，严格居中）
    cell = 58
    bx, by = W/2 - 3 * cell, 424
    gw = 6 * cell
    for i in range(7):
        d.line([(bx + i * cell, by), (bx + i * cell, by + gw)], fill=INK + (232,), width=2)
        d.line([(bx, by + i * cell), (bx + gw, by + i * cell)], fill=INK + (232,), width=2)
    # 底线虚线（目标线）
    for xx in range(int(bx) + 6, int(bx + gw) - 4, 16):
        d.line([(xx, by + 2), (xx + 8, by + 2)], fill=INK + (128,), width=2)
        d.line([(xx, by + gw - 2), (xx + 8, by + gw - 2)], fill=INK + (128,), width=2)
    # 铅条挡板（红）+ 套印影
    wall_y = by + 3 * cell - 8
    d.rounded_rectangle([bx + cell + 6 + 2, wall_y + 2, bx + 3 * cell - 6 + 2, wall_y + 16 + 2], radius=8, fill=RED + (100,))
    d.rounded_rectangle([bx + cell + 6, wall_y, bx + 3 * cell - 6, wall_y + 16], radius=8, fill=RED)
    # 棋子
    def pawn(cx, cy, ch, color):
        r = 36
        d.ellipse([cx - r + 3, cy - r + 3, cx + r + 3, cy + r + 3], fill=color + (112,))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
        d.ellipse([cx - r + 5, cy - r + 5, cx + r - 5, cy + r - 5], outline=PAPER + (216,), width=2)
        fch = serifB(36)
        wch = d.textlength(ch, font=fch)
        d.text((cx - wch/2 + 1, cy - 24 + 1), ch, font=fch, fill=INK + (126,))
        d.text((cx - wch/2, cy - 24), ch, font=fch, fill=PAPER)
    pawn(bx + 3 * cell, by + 5 * cell, '甲', RED)
    pawn(bx + 3 * cell, by + cell, '乙', BLUE)
    # 可走小点
    for (px, py) in [(bx + 2 * cell, by + 5 * cell), (bx + 4 * cell, by + 5 * cell), (bx + 3 * cell, by + 4 * cell)]:
        d.ellipse([px - 6, py - 6, px + 6, py + 6], fill=RED + (106,))
    # 短句（横排，居中）
    center_tracked(d, W/2, 828, '一册会下棋的书', serifB(38), INK, 10)
    center_tracked(d, W/2, 892, 'A GAME THAT PLAYS BACK', monoR(14), INK + (140,), 6)
    # 玩法三行（填补中部空间，红蓝小点引导）
    feats = [('开局 · 挡板 · 归途', serifB(30), 952), ('先手一步 · 慢着法全在指尖', serifR(25), 1006), ('速战速决 · 页边小注', serifR(25), 1050)]
    for txt, ft, yy in feats:
        w = tracked_width(d, txt, ft, 6)
        x = W/2 - w/2
        d.ellipse([x - 18, yy + 14, x - 10, yy + 22], fill=RED)
        tracked_text(d, x, yy, txt, ft, INK + (200,), 6)
        d.ellipse([x + w + 10, yy + 14, x + w + 18, yy + 22], fill=BLUE)
    # 页脚（顶部细分隔线）
    d.line([(W/2 - 150, 1284), (W/2 + 150, 1284)], fill=INK + (64,), width=1)
    center_tracked(d, W/2, 1304, 'QUORIDOR · EST. 1997 · MMXXVI', monoB(14), INK + (160,), 4)
    center_tracked(d, W/2, 1338, '步步为营编辑部 出品', serifR(14), INK + (140,), 5)
    grain(img, 5600, 30)
    img.save(os.path.join(OUT_DIR, 'loading-640x1400.png'))
    print('loading ok')

make_logo()
make_cover()
make_loading()

from PIL import Image as I
for name, mx in [('logo-220x220.png', 1 << 20), ('cover-share-510x350.png', 10 << 20), ('loading-640x1400.png', 1 << 20)]:
    p = os.path.join(OUT_DIR, name)
    im = I.open(p)
    sz = os.path.getsize(p)
    print(name, im.size, f'{sz/1024:.0f}KB', 'OK' if sz < mx else 'TOO BIG')
