/* 活版音效：落子「咔哒」（活字机）、放板「唰」（铅条滑入）、胜利印章闷响。
 * 全部用 Web Audio 合成，无音频文件。可开关，状态持久化。
 */

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}

export function isSoundEnabled() {
  return enabled;
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

function noiseBuffer(c: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/* 活字机咔哒：高频短噪声 + 低频顿音 */
export function playPawnClick() {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime;

  const click = c.createBufferSource();
  click.buffer = noiseBuffer(c, 0.05);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2400;
  bp.Q.value = 1.4;
  const g1 = c.createGain();
  g1.gain.setValueAtTime(0.5, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  click.connect(bp).connect(g1).connect(c.destination);
  click.start(t);

  const thump = c.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(170, t);
  thump.frequency.exponentialRampToValueAtTime(80, t + 0.07);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.28, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  thump.connect(g2).connect(c.destination);
  thump.start(t);
  thump.stop(t + 0.1);
}

/* 铅条滑入：带通噪声上扫，短促「唰」 */
export function playWallSlide() {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 0.24);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.9;
  bp.frequency.setValueAtTime(420, t);
  bp.frequency.exponentialRampToValueAtTime(1500, t + 0.2);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.34, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + 0.25);
}

/* 非法着法（校对退回）：低哑双击 */
export function playReject() {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime;
  for (const off of [0, 0.09]) {
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = 130;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t + off);
    g.gain.exponentialRampToValueAtTime(0.1, t + off + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.07);
    o.connect(g).connect(c.destination);
    o.start(t + off);
    o.stop(t + off + 0.08);
  }
}

/* 胜利印章：重闷响 + 余韵 */
export function playStamp() {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.3);
  const g = c.createGain();
  g.gain.setValueAtTime(0.6, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.55);

  const ring = c.createOscillator();
  ring.type = "triangle";
  ring.frequency.value = 620;
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.12, t + 0.02);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  ring.connect(g2).connect(c.destination);
  ring.start(t + 0.02);
  ring.stop(t + 0.65);
}
