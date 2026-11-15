"""棋谱海报长卷排版的像素级验证（参数化版）：
用法: python3 verify-poster-pixels.py <b64文件> <每列行数> <半分辨率行距> [b64文件2 每列行数2 行距2]
在半分辨率导出图上检测着法长诗区域的文本行，量化行距是否均匀舒展（无挤压）。
"""
import base64
import io
import sys

from PIL import Image


def load(path):
    raw = open(path).read().strip().strip('"')
    img = Image.open(io.BytesIO(base64.b64decode(raw.split(",", 1)[1] if "," in raw else raw))).convert("L")
    return img


def text_bands(px, x0, x1, y0, y1, dark_thresh=140):
    out, in_band, top = [], False, 0
    for y in range(y0, y1):
        dark = sum(1 for x in range(x0, x1, 2) if px[x, y] < dark_thresh)
        hit = dark >= 3
        if hit and not in_band:
            in_band, top = True, y
        elif not hit and in_band:
            in_band = False
            if y - top >= 1:  # 细笔画行可能只占 1px 高（颗粒噪点灰度≈235，不会误触发）
                out.append([top, y])
    if in_band:
        out.append([top, y1])
    return out


def merge_bands(bands, max_gap):
    """合并压缩伪影切开的同一文本行；max_gap 须显著小于真实行距。"""
    if not bands:
        return []
    out = [list(bands[0])]
    for a, b in bands[1:]:
        if a - out[-1][1] <= max_gap:
            out[-1][1] = b
        else:
            out.append([a, b])
    return out


def verify(path, rows_per_col, row_h_half, tag):
    img = load(path)
    W, H = img.size
    px = img.load()
    print(f"[{tag}] 导出图 {W}x{H}（原稿 1440x{H*2}），期望每列 {rows_per_col} 行、行距 {row_h_half}px(半分辨率)")

    # 诗区窗口：首行基线 840（半分辨率）到末行基线+descender，严格避开版记分隔线
    y0 = 815
    y1 = int(840 + (rows_per_col - 1) * row_h_half + 9)
    left = merge_bands(text_bands(px, 78, 363, y0, y1), max_gap=int(row_h_half * 0.35))
    right = merge_bands(text_bands(px, 373, 658, y0, y1), max_gap=int(row_h_half * 0.35))
    lc = [(a + b) / 2 for a, b in left]
    rc = [(a + b) / 2 for a, b in right]
    print(f"[{tag}] 左列 {len(lc)} 行 / 右列 {len(rc)} 行")

    gaps = [lc[i + 1] - lc[i] for i in range(len(lc) - 1)] + [rc[i + 1] - rc[i] for i in range(len(rc) - 1)]
    heights = [b - a for a, b in left + right]
    med = sorted(gaps)[len(gaps) // 2]
    print(f"[{tag}] 行距: min={min(gaps):.1f} 中位={med:.1f} max={max(gaps):.1f}；条带高 max={max(heights)}px")

    ok_rows = len(lc) == rows_per_col and len(rc) == rows_per_col
    ok_uniform = all(abs(g - row_h_half) <= 3.5 for g in gaps)  # 条带中心距 = 行距 ± 字形高矮偏移
    ok_no_melt = max(heights) <= row_h_half * 0.8  # 挤压时整列粘连成一块
    assert ok_rows, f"[{tag}] 行数不符: {len(lc)}/{len(rc)} != {rows_per_col}"
    assert ok_uniform, f"[{tag}] 行距不均匀: 中位 {med} 应为 {row_h_half}"
    assert ok_no_melt, f"[{tag}] 文本粘连：仍然挤压"
    print(f"[{tag}] 通过：行数精确、行距均匀({med:.0f}px)、无粘连 ✓\n")


if __name__ == "__main__":
    args = sys.argv[1:]
    assert len(args) >= 3, "用法: verify-poster-pixels.py <b64> <每列行数> <半分辨率行距> [b64b 行数b 行距b]"
    verify(args[0], int(args[1]), float(args[2]), "120手")
    if len(args) >= 6:
        verify(args[3], int(args[4]), float(args[5]), "500手")
    print("全部像素级验证通过：棋谱长卷无挤压、无溢出、版面完整 ✓")
