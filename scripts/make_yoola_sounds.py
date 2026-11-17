#!/usr/bin/env python3
"""合成《步步为营》活版音效 —— 复刻 Web 版 WebAudio 合成规格为音频文件
产物: quoridor-yoola/package/res/Audio/{pawn-click,wall-slide,reject,stamp}.mp3
规格(来自 src/lib/game/sounds.ts):
  pawn-click: 带通噪声(0.05s, BP 2400Hz Q1.4, gain 0.5→0.001/50ms) + 正弦顿音(170→80Hz/70ms, gain 0.28→0.001/90ms)
  wall-slide: 带通噪声(0.24s, BP Q0.9 扫频 420→1500Hz/200ms, gain 0.0001→0.34/60ms→0.001/220ms)
  reject:     两个方波双击(130Hz, 偏移 0/90ms, gain 0.1, 各 80ms)
  stamp:      正弦(120→45Hz/300ms, gain 0.6→0.001/500ms) + 三角波余韵(620Hz, +20ms 起, gain 0.12→0.001/600ms)
"""
import numpy as np, subprocess, os, sys

SR = 44100
OUT = "/home/z/my-project/quoridor-yoola/package/res/Audio"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1997)


def bp_filter(x, freq, q, sr=SR):
    """双二阶带通滤波（模仿 BiquadFilter bandpass）"""
    w0 = 2 * np.pi * freq / sr
    alpha = np.sin(w0) / (2 * q)
    b0, b1, b2 = alpha, 0.0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * np.cos(w0), 1 - alpha
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    b0n, b1n, b2n = b0 / a0, b1 / a0, b2 / a0
    a1n, a2n = a1 / a0, a2 / a0
    for i in range(len(x)):
        xn = x[i]
        yn = b0n * xn + b1n * x1 + b2n * x2 - a1n * y1 - a2n * y2
        x2, x1 = x1, xn
        y2, y1 = y1, yn
        y[i] = yn
    return y


def bp_sweep(x, f0, f1, q, dur, sr=SR):
    """扫频带通：分小段用时变频率的带通（近似 exponentialRampToValueAtTime）"""
    n = len(x)
    seg = 256
    out = np.zeros(n)
    f_prev = f0
    for i in range(0, n, seg):
        t = i / sr
        frac = t / dur
        f_end = f0 * (f1 / f0) ** min(frac, 1.0)
        f_mid = (f_prev + f_end) / 2
        chunk = x[i:i + seg]
        out[i:i + seg] = bp_filter(chunk, f_mid, q)
        f_prev = f_end
    return out


def env_exp(n, g0, g1, dur, sr=SR):
    """指数包络 g0→g1 over dur"""
    t = np.arange(n) / sr
    k = np.minimum(t / dur, 1.0)
    return g0 * (g1 / g0) ** k


def env_attack_exp(n, ga, g_peak, t_attack, g_end, t_release, sr=SR):
    """起音指数到峰值，再指数释放"""
    t = np.arange(n) / sr
    env = np.zeros(n)
    a = t < t_attack
    env[a] = ga * (g_peak / ga) ** (t[a] / t_attack)
    r = ~a
    k = np.minimum((t[r] - t_attack) / t_release, 1.0)
    env[r] = g_peak * (g_end / g_peak) ** k
    return env


def sine_sweep(f0, f1, dur, sr=SR):
    n = int(dur * sr)
    t = np.arange(n) / sr
    k = t / dur
    freq = f0 * (f1 / f0) ** k
    phase = 2 * np.pi * np.cumsum(freq) / sr
    return np.sin(phase)


def square_wave(freq, dur, sr=SR):
    n = int(dur * sr)
    t = np.arange(n) / sr
    return np.sign(np.sin(2 * np.pi * freq * t)) * 0.9


def save(name, sig, gain=1.0):
    sig = sig * gain
    peak = np.max(np.abs(sig))
    if peak > 0: sig = sig / peak * min(peak, 0.92)
    pcm = (sig * 32767).astype(np.int16)
    wav = f"/tmp/{name}.wav"
    with open(wav, "wb") as f:
        f.write(b"RIFF"); f.write((36 + len(pcm) * 2).to_bytes(4, "little"))
        f.write(b"WAVE"); f.write(b"fmt ")
        f.write((16).to_bytes(4, "little")); f.write((1).to_bytes(2, "little"))
        f.write((1).to_bytes(2, "little")); f.write(SR.to_bytes(4, "little"))
        f.write((SR * 2).to_bytes(4, "little")); f.write((2).to_bytes(2, "little"))
        f.write((16).to_bytes(2, "little")); f.write(b"data")
        f.write((len(pcm) * 2).to_bytes(4, "little"))
        f.write(pcm.tobytes())
    mp3 = f"{OUT}/{name}.mp3"
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-b:a", "128k", mp3])
    if r.returncode != 0:
        print("ffmpeg 失败，保留 wav", name); subprocess.run(["cp", wav, f"{OUT}/{name}.wav"])
    print(f"  {name}.mp3 {os.path.getsize(mp3)/1024:.0f}KB" if os.path.exists(mp3) else f"  {name}.wav")


# 1) 落子咔哒
n = int(0.16 * SR)
click = bp_filter(rng.uniform(-1, 1, n), 2400, 1.4) * env_exp(n, 0.5, 0.001, 0.05)
thump_n = int(0.09 * SR)
thump = np.zeros(n)
thump[:thump_n] = sine_sweep(170, 80, 0.09) * env_exp(thump_n, 0.28, 0.001, 0.09)
save("pawn-click", click * 0.9 + thump)

# 2) 铅条滑入
n = int(0.28 * SR)
noise = rng.uniform(-1, 1, n)
swept = bp_sweep(noise, 420, 1500, 0.9, 0.2)
save("wall-slide", swept * env_attack_exp(n, 0.0001, 0.34, 0.06, 0.001, 0.22))

# 3) 校对退回双击
n = int(0.22 * SR)
sig = np.zeros(n)
for off in (0.0, 0.09):
    s0 = int(off * SR)
    seg = square_wave(130, 0.08) * env_attack_exp(int(0.08 * SR), 0.0001, 0.1, 0.008, 0.001, 0.07)
    sig[s0:s0 + len(seg)] += seg
save("reject", sig)

# 4) 胜利印章
n = int(0.7 * SR)
t = np.arange(n) / SR
thud = np.zeros(n)
thud_n = int(0.3 * SR)
thud[:thud_n] = sine_sweep(120, 45, 0.3) * env_exp(thud_n, 0.6, 0.001, 0.3)
ring_t = np.maximum(t - 0.02, 0)
ring = (np.abs(2 * ((620 * ring_t) % 1) - 1) * 2 - 1)  # 三角波 620Hz
ring_env = np.where(t < 0.02, 0.0, env_exp(n, 0.12, 0.001, 0.6))
save("stamp", thud + ring * ring_env)

print("音效合成完成")
