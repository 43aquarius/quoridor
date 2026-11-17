#!/usr/bin/env python3
"""生成《步步为营》Yoola 平台素材（与游戏 UI 一致的 Risograph 印刷专著风）
产物:
  package/yoola-assets/icon.png         220×220  玩法 logo
  package/yoola-assets/share-image.png  510×350  封面及分享图
  package/yoola-assets/loading-image.png 640×1400 竖屏加载图
同时导出到 download/素材/（中文名便于识别）与 download/素材包 zip 源。
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, random

OUT_PKG = "/home/z/my-project/quoridor-yoola/package/yoola-assets"
OUT_DL = "/home/z/my-project/download/素材"
os.makedirs(OUT_PKG, exist_ok=True)
os.makedirs(OUT_DL, exist_ok=True)

PAPER = (245, 242, 234)
INK = (26, 26, 26)
RED = (255, 77, 46)
BLUE = (36, 64, 179)
GREY = (85, 85, 79)

F_SERIF_X = "/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Black.ttf"
F_SERIF_B = "/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf"
F_SERIF_R = "/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf"
F_MONO = "/tmp/fonts/IBMPlexMono-Regular.ttf"
F_MONO_B = "/tmp/fonts/IBMPlexMono-Bold.ttf"
F_WEST = "/tmp/fonts/playfair-400.ttf"
F_MONO_CJK = "/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf"  # 中英混排等宽（含 CJK）


def mixed_font(line, size, latin_font=None, cjk_font=None):
    """整行含中文时用 Sarasa 等宽（含CJK）；纯拉丁用 Plex Mono"""
    has_cjk = any(ord(ch) > 0x2E7F for ch in line)
    return ImageFont.truetype(F_MONO_CJK if has_cjk else (latin_font or F_MONO), size)


def paper_texture(img, density=2600, alpha=14):
    """纸面颗粒"""
    d = ImageDraw.Draw(img, "RGBA")
    w, h = img.size
    rnd = random.Random(41)
    for _ in range(density):
        x, y = rnd.randrange(w), rnd.randrange(h)
        v = rnd.randrange(20, 60)
        d.point((x, y), fill=(v, v, v, alpha))
    return img


def text_misreg(d, xy, s, font, fill, offset=(4, 4), misreg_fill=None, anchor=None):
    """套印错位文字：先印偏移色版再印主体"""
    x, y = xy
    d.text((x + offset[0], y + offset[1]), s, font=font, fill=misreg_fill or fill, anchor=anchor)
    d.text((x, y), s, font=font, fill=fill, anchor=anchor)


def tracked(d, xy, s, font, fill, gap, anchor_center_x=None):
    """带字距文本；anchor_center_x 给定时水平居中"""
    widths = [d.textlength(ch, font=font) for ch in s]
    total = sum(widths) + gap * (len(s) - 1)
    x = (anchor_center_x - total / 2) if anchor_center_x else xy[0]
    y = xy[1]
    for ch, w in zip(s, widths):
        d.text((x, y), ch, font=font, fill=fill)
        x += w + gap
    return total


# ────────────────────────── 1) 玩法 logo 220×220 ──────────────────────────
def make_icon():
    S = 4  # 超采样
    W = 220 * S
    img = Image.new("RGB", (W, W), PAPER)
    d = ImageDraw.Draw(img)
    # 双线书框
    d.rectangle([10 * S, 10 * S, W - 10 * S, W - 10 * S], outline=INK, width=3 * S)
    d.rectangle([16 * S, 16 * S, W - 16 * S, W - 16 * S], outline=INK, width=1 * S)
    # 顶部眉线小签
    f_mono_t = ImageFont.truetype(F_MONO, 14 * S)
    tracked(d, (0, 28 * S), "QUORIDOR", f_mono_t, GREY, 4 * S, anchor_center_x=W / 2)
    # 2×2 活字盘：步/步/为/营
    f_tile = ImageFont.truetype(F_SERIF_X, 58 * S)
    cells = [("步", RED), ("步", BLUE), ("为", BLUE), ("营", RED)]
    cell = 66 * S
    cx0 = (W - 2 * cell + 6 * S) / 2
    cy0 = 52 * S
    for i, (ch, col) in enumerate(cells):
        gx, gy = i % 2, i // 2
        x = cx0 + gx * cell
        y = cy0 + gy * cell
        d.rectangle([x, y, x + cell - 6 * S, y + cell - 6 * S], outline=INK, width=2 * S)
        text_misreg(d, (x + (cell - 6 * S) / 2, y + (cell - 6 * S) / 2), ch,
                    f_tile, col, offset=(3 * S, 3 * S), misreg_fill=col, anchor="mm")
    # 底部：一行等宽小字（含中文 → Sarasa）
    f_mono_b = ImageFont.truetype(F_MONO_CJK, 12 * S)
    tracked(d, (0, W - 32 * S), "步步为营编辑部", f_mono_b, GREY, 2 * S, anchor_center_x=W / 2)
    img = img.resize((220, 220), Image.LANCZOS)
    img = paper_texture(img, 500)
    return img


# ──────────────────────── 2) 封面及分享图 510×350 ────────────────────────
def make_share():
    S = 3
    W, H = 510 * S, 350 * S
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    # 双线书框
    d.rectangle([14 * S, 14 * S, W - 14 * S, H - 14 * S], outline=INK, width=3 * S)
    d.rectangle([22 * S, 22 * S, W - 22 * S, H - 22 * S], outline=INK, width=1 * S)
    # 眉线（两行，避开主标题）
    f_mast = ImageFont.truetype(F_MONO, 12.5 * S)
    tracked(d, (0, 46 * S), "限量印刷棋谱专著", ImageFont.truetype(F_MONO_CJK, 12.5 * S), GREY, 4 * S, anchor_center_x=W / 2)
    tracked(d, (0, 66 * S), "A MONOGRAPH THAT PLAYS BACK", f_mast, GREY, 3 * S, anchor_center_x=W / 2)
    # 主标题（红色套印错位）
    f_title = ImageFont.truetype(F_SERIF_X, 84 * S)
    text_misreg(d, (W / 2, 132 * S), "步步为营", f_title, INK, offset=(5 * S, 5 * S), misreg_fill=RED, anchor="mm")
    # QUORIDOR
    f_west = ImageFont.truetype(F_WEST, 28 * S)
    tracked(d, (0, 194 * S), "QUORIDOR", f_west, INK, 9 * S, anchor_center_x=W / 2)
    # 发行信息
    f_mono = ImageFont.truetype(F_MONO, 12.5 * S)
    tracked(d, (0, 232 * S), "EST. 1997 · GIGAMIC PARIS — SET IN TYPE MMXXVI", f_mono, GREY, 2 * S, anchor_center_x=W / 2)
    # 分隔 + 三标语
    d.line([W / 2 - 150 * S, 254 * S, W / 2 + 150 * S, 254 * S], fill=(26, 26, 26, 90), width=1 * S)
    f_serif = ImageFont.truetype(F_SERIF_R, 17 * S)
    d.text((W / 2, 268 * S), "走子，或放板 · 围堵与突围的纸上博弈", font=f_serif, fill=GREY, anchor="ma")
    # 双色行（含中文 → Sarasa）
    f_mono2 = ImageFont.truetype(F_MONO_CJK, 12 * S)
    seg = [("双色 RISOGRAPH 套印 ", GREY), ("■ 荧光红", RED), (" × ", GREY), ("■ 钴蓝", BLUE), (" · 四档 AI 棋手", GREY)]
    total = sum(d.textlength(s, font=f_mono2) for s, _ in seg) + 2 * S * (len(seg) - 1)
    x = W / 2 - total / 2
    for s, c in seg:
        d.text((x, 294 * S), s, font=f_mono2, fill=c)
        x += d.textlength(s, font=f_mono2) + 2 * S
    # 底部
    f_mono3 = ImageFont.truetype(F_MONO_CJK, 11 * S)
    tracked(d, (0, 326 * S), "快手互动玩法 · 离线单机版", f_mono3, GREY, 2 * S, anchor_center_x=W / 2)
    img = img.resize((510, 350), Image.LANCZOS)
    img = paper_texture(img, 3000)
    return img


# ───────────────────────── 3) 加载图 640×1400 ─────────────────────────
def make_loading():
    S = 3
    W, H = 640 * S, 1400 * S
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    # 双线书框
    d.rectangle([22 * S, 22 * S, W - 22 * S, H - 22 * S], outline=INK, width=3 * S)
    d.rectangle([32 * S, 32 * S, W - 32 * S, H - 32 * S], outline=INK, width=1 * S)
    # 顶部眉线（两行）
    tracked(d, (0, 320 * S), "限量印刷棋谱专著", ImageFont.truetype(F_MONO_CJK, 17 * S), GREY, 6 * S, anchor_center_x=W / 2)
    tracked(d, (0, 354 * S), "A MONOGRAPH THAT PLAYS BACK", ImageFont.truetype(F_MONO, 15 * S), GREY, 4 * S, anchor_center_x=W / 2)
    # 主标题（红色套印错位）
    f_title = ImageFont.truetype(F_SERIF_X, 128 * S)
    text_misreg(d, (W / 2, 490 * S), "步步为营", f_title, INK, offset=(7 * S, 7 * S), misreg_fill=RED, anchor="mm")
    # QUORIDOR
    f_west = ImageFont.truetype(F_WEST, 42 * S)
    tracked(d, (0, 600 * S), "QUORIDOR", f_west, INK, 13 * S, anchor_center_x=W / 2)
    # 发行信息
    f_mono = ImageFont.truetype(F_MONO, 16 * S)
    tracked(d, (0, 656 * S), "EST. 1997 · GIGAMIC PARIS", f_mono, GREY, 3 * S, anchor_center_x=W / 2)
    tracked(d, (0, 684 * S), "SET IN TYPE MMXXVI", f_mono, GREY, 3 * S, anchor_center_x=W / 2)
    # 中部：迷你棋盘装饰（9路 + 甲乙 + 两块板）
    bx, by, cell = (W - 360 * S) / 2, 780 * S, 40 * S
    for i in range(10):
        d.line([bx + i * cell, by, bx + i * cell, by + 9 * cell], fill=INK, width=1 * S)
        d.line([bx, by + i * cell, bx + 9 * cell, by + i * cell], fill=INK, width=1 * S)
    d.rectangle([bx - 10 * S, by - 10 * S, bx + 9 * cell + 10 * S, by + 9 * cell + 10 * S], outline=INK, width=2 * S)
    f_pawn = ImageFont.truetype(F_SERIF_B, 40 * S)
    # 乙（蓝）顶部中列
    d.ellipse([bx + 4 * cell + 8 * S, by + 8 * S, bx + 5 * cell - 8 * S, by + cell - 8 * S], fill=BLUE, outline=INK, width=2 * S)
    d.text((bx + 4.5 * cell, by + cell / 2), "乙", font=f_pawn, fill=PAPER, anchor="mm")
    # 甲（红）底部中列
    d.ellipse([bx + 4 * cell + 8 * S, by + 8 * cell + 8 * S, bx + 5 * cell - 8 * S, by + 9 * cell - 8 * S], fill=RED, outline=INK, width=2 * S)
    d.text((bx + 4.5 * cell, by + 8.5 * cell), "甲", font=f_pawn, fill=PAPER, anchor="mm")
    # 两块挡板
    d.rounded_rectangle([bx + 2 * cell + 3 * S, by + 3 * cell - 5 * S, bx + 4 * cell - 3 * S, by + 3 * cell + 5 * S], radius=5 * S, fill=BLUE)
    d.rounded_rectangle([bx + 5 * cell - 5 * S, by + 5 * cell + 3 * S, bx + 5 * cell + 5 * S, by + 7 * cell - 3 * S], radius=5 * S, fill=RED)
    # 目标点线
    for gx in range(1, 9):
        d.ellipse([bx + gx * cell - 2 * S, by - 4 * S, bx + gx * cell + 2 * S, by + 4 * S - 2 * S], fill=GREY)
    # 加载提示（含中文 → Sarasa）
    f_load = ImageFont.truetype(F_MONO_CJK, 16 * S)
    tracked(d, (0, 1258 * S), "正在排版 · LOADING", f_load, GREY, 4 * S, anchor_center_x=W / 2)
    # 底部版权块
    f_c1 = ImageFont.truetype(F_SERIF_R, 15 * S)
    d.text((W / 2, 1298 * S), "第壹卷第壹版 · MMXXVI 限量玖拾玖部", font=f_c1, fill=GREY, anchor="ma")
    f_c2 = ImageFont.truetype(F_MONO_CJK, 13 * S)
    d.text((W / 2, 1324 * S), "字体 思源宋体 / IBM Plex Mono / Playfair Display · 纸色 草浆纸白", font=f_c2, fill=GREY, anchor="ma")
    seg = [("双色 RISOGRAPH 套印 ", GREY), ("■ 荧光红", RED), (" × ", GREY), ("■ 钴蓝", BLUE)]
    total = sum(d.textlength(s, font=f_c2) for s, _ in seg) + 2 * S * (len(seg) - 1)
    x = W / 2 - total / 2
    for s, c in seg:
        d.text((x, 1350 * S), s, font=f_c2, fill=c)
        x += d.textlength(s, font=f_c2) + 2 * S
    d.text((W / 2, 1374 * S), "步步为营编辑部 出品 · 快手互动玩法", font=ImageFont.truetype(F_MONO_CJK, 12 * S), fill=GREY, anchor="ma")
    img = img.resize((640, 1400), Image.LANCZOS)
    img = paper_texture(img, 9000)
    return img


icon = make_icon()
share = make_share()
loading = make_loading()

icon.save(f"{OUT_PKG}/icon.png")
share.save(f"{OUT_PKG}/share-image.png")
loading.save(f"{OUT_PKG}/loading-image.png")
icon.save(f"{OUT_DL}/logo-220x220.png")
share.save(f"{OUT_DL}/cover-share-510x350.png")
loading.save(f"{OUT_DL}/loading-640x1400.png")

for f in ["icon.png", "share-image.png", "loading-image.png"]:
    p = f"{OUT_PKG}/{f}"
    print(f, os.path.getsize(p) // 1024, "KB")
print("素材生成完成")
