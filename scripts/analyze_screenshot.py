#!/usr/bin/env python3
"""分析 H5 预览截图：验证纸底、红蓝标题、按钮、棋盘等关键色块是否存在且位置合理"""
from PIL import Image
import sys

def analyze(path):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    print(f"尺寸: {w}x{h}")
    px = img.load()

    def near(c1, c2, tol=30):
        return all(abs(a - b) <= tol for a, b in zip(c1, c2))

    PAPER = (242, 236, 221)      # F2ECDD
    RED = (255, 77, 46)          # FF4D2E
    BLUE = (36, 64, 179)         # 2440B3
    INK = (26, 26, 26)           # 1A1A1A
    CELL = (242, 234, 214)       # F2EAD6

    counts = {"paper": 0, "red": 0, "blue": 0, "ink": 0, "cell": 0, "white": 0, "black": 0}
    red_ys, blue_ys, ink_ys = [], [], []
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            c = px[x, y]
            if near(c, PAPER, 12): counts["paper"] += 1
            if near(c, RED, 40): counts["red"] += 1; red_ys.append(y)
            if near(c, BLUE, 40): counts["blue"] += 1; blue_ys.append(y)
            if near(c, INK, 25): counts["ink"] += 1; ink_ys.append(y)
            if near(c, CELL, 8): counts["cell"] += 1
            if c[0] > 250 and c[1] > 250 and c[2] > 250: counts["white"] += 1
            if c[0] < 5 and c[1] < 5 and c[2] < 5: counts["black"] += 1

    total = (w // 2) * (h // 2)
    for k, v in counts.items():
        print(f"  {k}: {v} ({v*100.0/total:.1f}%)")
    if red_ys: print(f"  红色像素 y 范围: {min(red_ys)}-{max(red_ys)}")
    if blue_ys: print(f"  蓝色像素 y 范围: {min(blue_ys)}-{max(blue_ys)}")
    if ink_ys: print(f"  墨色像素 y 范围: {min(ink_ys)}-{max(ink_ys)}")

    # 判定
    ok = True
    if counts["paper"] + counts["cell"] < total * 0.5:
        print("!! 纸底占比过低——背景可能未绘制"); ok = False
    if counts["red"] < 50: print("!! 缺少红色（标题/按钮）"); ok = False
    if counts["blue"] < 30: print("!! 缺少蓝色（标题错位/棋盘乙子）"); ok = False
    if counts["ink"] < 30: print("!! 缺少墨色（文字/描边）"); ok = False
    print("=> " + ("通过" if ok else "异常"))
    return ok

if __name__ == "__main__":
    sys.exit(0 if analyze(sys.argv[1]) else 1)
