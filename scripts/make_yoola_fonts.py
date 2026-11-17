#!/usr/bin/env python3
"""字体子集化：收集 Yoola 包全部用字 → pyftsubset 生成 9 个子集字体
产物: quoridor-yoola/package/fonts/*.ttf
"""
import os, re, glob, subprocess, sys

PKG = "/home/z/my-project/quoridor-yoola/package"
OUT = PKG + "/fonts"
os.makedirs(OUT, exist_ok=True)

# 1) 收集用字：业务 js + game.json + 规则/文案
chars = set()
for f in glob.glob(PKG + "/gameplay/**/*.js", recursive=True) + [PKG + "/game.js"]:
    src = open(f, encoding="utf-8", errors="ignore").read()
    for ch in src:
        if not ch.isascii():  # 非 ASCII 全收（中文/罗马数字/符号）
            chars.add(ch)
    # 注释里的中文也收（保险）
    for m in re.findall(r"'([^']{2,80})'", src):
        for ch in m:
            chars.add(ch)

# ASCII 可打印全集 + 常用补充
extras = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    "0123456789"
    " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
    "ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ"      # 罗马数字
    "—–·×→←↑↓✓✕■□●○◆…"
    "「」『』（）：；、。，！？·"
    "№°±≥≤≈"
    "①②③④⑤⑥⑦⑧⑨⑩"
)
for ch in extras:
    chars.add(ch)
# 动态数字/坐标已含 ASCII；棋谱记号 WALL H V
charset = "".join(sorted(c for c in chars if c.strip() or c == " "))
print(f"用字集: {len(charset)} 字符（CJK: {sum(1 for c in charset if ord(c) > 0x2E7F)}）")

with open("/tmp/yoola-glyphs.txt", "w", encoding="utf-8") as f:
    f.write(charset)

def subset(src, dst, name_ps=None):
    cmd = ["pyftsubset", src,
           "--text-file=/tmp/yoola-glyphs.txt",
           "--output-file=" + dst,
           "--layout-features=*",
           "--glyph-names",
           "--recalc-bounds",
           "--drop-tables+=DSIG",
           "--name-IDs=*"]
    if name_ps:
        cmd.append("--name-legacy")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  失败 {os.path.basename(src)}: {r.stderr[:300]}")
        return False
    print(f"  {os.path.basename(dst)} {os.path.getsize(dst)/1024:.0f}KB ← {os.path.basename(src)}")
    return True

# 2) 实例化 Playfair 可变字体 → 静态
def instance(var, wght, dst):
    r = subprocess.run([sys.executable, "-m", "fontTools.varLib.instancer",
                        var, f"wght={wght}", "-o", dst],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(f"  实例化失败 {var} {wght}: {r.stderr[:200]}")
        return None
    return dst

print("实例化 Playfair…")
pf400 = instance("/tmp/fonts/PlayfairDisplay-var.ttf", 400, "/tmp/fonts/playfair-400.ttf")
pf900 = instance("/tmp/fonts/PlayfairDisplay-var.ttf", 900, "/tmp/fonts/playfair-900.ttf")
pfi400 = instance("/tmp/fonts/PlayfairDisplay-Italic-var.ttf", 400, "/tmp/fonts/playfair-i400.ttf")

print("子集化…")
ok = True
ok &= subset("/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf", f"{OUT}/serif-sc-regular.ttf")
ok &= subset("/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf", f"{OUT}/serif-sc-bold.ttf")
ok &= subset("/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Black.ttf", f"{OUT}/serif-sc-black.ttf")
ok &= subset("/tmp/fonts/IBMPlexMono-Regular.ttf", f"{OUT}/plex-mono-regular.ttf")
ok &= subset("/tmp/fonts/IBMPlexMono-Bold.ttf", f"{OUT}/plex-mono-bold.ttf")
ok &= subset("/tmp/fonts/IBMPlexMono-Italic.ttf", f"{OUT}/plex-mono-italic.ttf")
ok &= subset(pf400, f"{OUT}/playfair-regular.ttf")
ok &= subset(pf900, f"{OUT}/playfair-black.ttf")
ok &= subset(pfi400, f"{OUT}/playfair-italic.ttf")
print("完成" if ok else "存在失败项")
