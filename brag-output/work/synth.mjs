// Soundtrack for the Svarah brag video: music + effects written as one piece, D major, 100 BPM.
import fs from 'node:fs';
const SR = 48000, DUR = 22.4, N = Math.round(SR * DUR), BEAT = 0.6, BAR = 2.4;
const mk = () => [new Float32Array(N), new Float32Array(N)];
const dry = mk(), duck = mk(), send = mk();
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
function add(bus, t0, len, pan, fn, sendAmt = 0) {
  const i0 = Math.round(t0 * SR), n = Math.round(len * SR), gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = 0; i < n; i++) { const j = i0 + i; if (j < 0 || j >= N) continue; const s = fn(i / SR, i);
    bus[0][j] += s * gl; bus[1][j] += s * gr; if (sendAmt) { send[0][j] += s * gl * sendAmt; send[1][j] += s * gr * sendAmt; } }
}
class BQ { constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, f, q) { const w = 2 * Math.PI * f / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q); let b0, b1, b2; const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
    if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; } else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; } else { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0; return this; }
  run(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2; this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; } }
const att = (t, a) => Math.min(1, t / a);

// ── instruments ──
const pluck = (t0, m, g = 0.2, pan = 0, d = 0.32, sd = 0.3) => { const f = mtof(m);
  add(dry, t0, d * 7, pan, (t) => g * att(t, 0.003) * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t / d) + 0.32 * Math.sin(2 * Math.PI * 4 * f * t) * Math.exp(-t / (d * 0.16)) + 0.12 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t / (d * 0.5))), sd); };
const bell = (t0, m, g = 0.15, pan = 0, d = 0.7) => { const f = mtof(m);
  add(dry, t0, d * 6, pan, (t) => g * att(t, 0.004) * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t / d) + 0.25 * Math.sin(2 * Math.PI * 2.76 * f * t) * Math.exp(-t / (d * 0.25)) + 0.1 * Math.sin(2 * Math.PI * 5.4 * f * t) * Math.exp(-t / (d * 0.1))), 0.6); };
const pad = (t0, len, notes, g = 0.05) => { for (const [k, m] of notes.entries()) for (const [det, pan] of [[-4, -0.6], [4, 0.6]]) { const f = mtof(m + det / 100);
  add(duck, t0, len + 0.9, pan * (k % 2 ? 1 : -1), (t) => { const e = att(t, 0.45) * (t > len ? Math.max(0, 1 - (t - len) / 0.9) : 1); let s = 0;
    for (let h = 1; h <= 5; h++) s += Math.sin(2 * Math.PI * f * h * t + h) / Math.pow(h, 1.7); return g * (k === 0 ? 0.55 : 1) * e * s * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.4 * t + k)); }, 0.35); } };
const bass = (t0, len, m, g = 0.3) => { const f = mtof(m);
  add(duck, t0, len + 0.08, 0, (t) => { const e = att(t, 0.008) * (t > len ? Math.max(0, 1 - (t - len) / 0.08) : 1) * (0.55 + 0.45 * Math.exp(-t / 0.25)); return g * e * Math.tanh(1.6 * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t))) / 1.2; }); };
const kicks = [];
const kick = (t0, g = 0.75) => { kicks.push(t0); let ph = 0;
  add(dry, t0, 0.4, 0, (t) => { ph += 2 * Math.PI * (46 + 115 * Math.exp(-t / 0.028)) / SR; return g * Math.sin(ph) * Math.exp(-t / 0.15) * att(t, 0.001); }); };
const noise = (t0, len, g, pan, type, f, q, env, sd = 0) => { const b = new BQ().set(type, f, q), b2 = new BQ().set(type, f, q); add(dry, t0, len, pan, (t) => g * env(t) * b2.run(b.run(rnd())), sd); };
const clap = (t0, g = 0.5) => { for (const o of [0, 0.011, 0.023]) noise(t0 + o, 0.22, g * (o ? 0.6 : 1), 0.1, 'bp', 1700, 1.1, (t) => Math.exp(-t / (o === 0.023 ? 0.07 : 0.012)) * att(t, 0.001), 0.25); };
const hat = (t0, g = 0.1, pan = 0.25) => noise(t0, 0.08, g, pan, 'hp', 8000, 0.8, (t) => Math.exp(-t / 0.018) * att(t, 0.001));
const lead = (t0, len, m, g = 0.13) => { const f = mtof(m); let ph = 0;
  add(dry, t0, len + 0.25, -0.1, (t) => { ph += 2 * Math.PI * f * (1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * t) * att(t, 0.25)) / SR; const e = att(t, 0.012) * (t > len ? Math.max(0, 1 - (t - len) / 0.25) : 1) * (0.7 + 0.3 * Math.exp(-t / 0.2));
    return g * e * (Math.sin(ph) + 0.28 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph)); }, 0.45); };
const sweep = (t0, len, g, f0, f1, shape) => {
  for (const pan of [-0.5, 0.5]) { const b = new BQ(); add(dry, t0, len, pan, (t, i) => { if (i % 32 === 0) b.set('bp', f0 * Math.pow(f1 / f0, t / len), 1.4); return g * shape(t / len) * b.run(rnd()); }, 0.3); } };

// ── harmony ──
const C = { D: { pad: [50, 57, 62, 66, 69], arp: [74, 78, 81, 76, 86], root: 38 }, Bm: { pad: [47, 54, 57, 62, 66], arp: [74, 78, 81, 73, 83], root: 35 },
  G: { pad: [43, 50, 55, 59, 66], arp: [74, 79, 83, 78, 86], root: 43 }, A: { pad: [45, 52, 57, 61, 64], arp: [73, 76, 81, 79, 85], root: 45 } };
const halves = ['D', 'D', 'D', 'D', 'Bm', 'Bm', 'G', 'G', 'A', 'A', 'G', 'A', 'D', 'Bm', 'G', 'A'];   // two per bar, bars 1–8
for (let i = 0; i < halves.length;) { let j = i; while (j + 1 < halves.length && halves[j + 1] === halves[i]) j++;
  const t0 = i * 1.2, len = (j - i + 1) * 1.2, b = t0 / BAR; pad(t0, len, C[halves[i]].pad, b < 1 ? 0.03 : b < 3 ? 0.036 : b < 6 ? 0.042 : 0.05); i = j + 1; }
const chordAt = (t) => C[halves[Math.min(halves.length - 1, Math.floor((t + 1e-6) / 1.2))]];

// bar 1 — hook: four soft notes over a rising pad
[[0, 78], [0.6, 81], [1.2, 86], [1.8, 81]].forEach(([t, m]) => pluck(t, m, 0.15, 0.2, 0.4, 0.5));
// bars 2–8 — arpeggio on eighths
const pat = [0, 2, 1, 3, 2, 4, 1, 2];
for (let k = 0; k < 7 * 8; k++) { const t = BAR + k * 0.3, bar = Math.floor((t + 1e-6) / BAR), ch = chordAt(t);
  const g = bar < 3 ? 0.085 : bar < 5 ? 0.105 : bar < 6 ? 0.1 + 0.05 * ((t - 12) / 2.4) : 0.13;
  pluck(t, ch.arp[pat[k % 8]], g * (k % 2 ? 0.8 : 1), k % 2 ? 0.45 : -0.45, 0.22, 0.3);
  if (bar >= 6) pluck(t, ch.arp[pat[k % 8]] - 12, g * 0.5, k % 2 ? -0.3 : 0.3, 0.2, 0.2); }
// drums
for (let bar = 1; bar < 8; bar++) for (let b = 0; b < 4; b++) { const t = bar * BAR + b * BEAT;
  const build = bar === 5 && b >= 2;                       // kick drops out before the reveal
  if (bar < 3) { if (b % 2 === 0) kick(t, 0.5); } else if (!build) kick(t, bar >= 6 ? 0.8 : 0.66);
  if (bar >= 3 && !build) { hat(t + 0.3, bar >= 6 ? 0.12 : 0.085); if (b % 2 === 1) clap(t, bar >= 6 ? 0.42 : 0.26); }
  if (bar >= 6) { hat(t, 0.06, -0.3); hat(t + 0.15, 0.035, -0.3); hat(t + 0.45, 0.035, 0.4); } }
// build (bar 6): roll + riser, resolving into the poster reveal at 14.4
for (let k = 0; k < 4; k++) noise(13.2 + k * 0.15, 0.1, 0.1 + 0.03 * k, 0, 'bp', 2200, 1, (t) => Math.exp(-t / 0.03), 0.2);
for (let k = 0; k < 8; k++) noise(13.8 + k * 0.075, 0.08, 0.14 + 0.03 * k, 0, 'bp', 2400, 1, (t) => Math.exp(-t / 0.022), 0.2);
sweep(10.9, 3.5, 0.34, 350, 7000, (x) => x * x * x);
// bass
for (let bar = 1; bar < 8; bar++) { const t0 = bar * BAR;
  if (bar < 3) bass(t0, 2.2, chordAt(t0).root, 0.2);
  else if (bar < 6) for (const [b, l] of [[0, 0.5], [0.9, 0.25], [1.2, 0.5], [2.1, 0.25]]) bass(t0 + b, l, chordAt(t0 + b).root, 0.27);
  else for (let k = 0; k < 8; k++) bass(t0 + k * 0.3, 0.22, chordAt(t0 + k * 0.3).root + (k % 4 === 3 ? 12 : 0), 0.3); }
// lead (bars 7–8): the campaign lands
[[0, 0.9, 78], [1, 0.5, 81], [1.5, 0.5, 83], [2, 1, 81], [3, 0.5, 78], [3.5, 0.5, 76], [4, 1, 74], [5, 0.5, 76], [5.5, 0.5, 78], [6, 1, 76], [7, 0.5, 81], [7.5, 0.5, 85]]
  .forEach(([b, l, m]) => lead(14.4 + b * BEAT, l * BEAT * 0.92, m));
// reveal impact
add(dry, 14.4, 1.2, 0, (t) => 0.5 * Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t / 0.35));
noise(14.4, 1.6, 0.16, 0, 'hp', 5000, 0.7, (t) => Math.exp(-t / 0.4) * att(t, 0.002), 0.5);

// ── effects, in key, on the grid ──
pluck(2.9, 74, 0.16, 0, 0.12, 0.4); pluck(2.98, 81, 0.16, 0, 0.16, 0.4);                          // mic on
for (let i = 0; i < 17; i++) noise(3.3 + i * 0.15, 0.03, 0.035, (i % 2 ? 0.3 : -0.3), 'bp', 3200, 2, (t) => Math.exp(-t / 0.006)); // live words
pluck(6.5, 81, 0.14, 0, 0.12, 0.4); pluck(6.58, 74, 0.14, 0, 0.16, 0.4);                           // mic off
[74, 76, 78, 81, 83, 86].forEach((m, i) => bell(7.5 + i * 0.3, m, 0.085, -0.3 + i * 0.12, 0.35));  // facts land
add(dry, 10.8, 0.12, 0, (t) => 0.35 * Math.sin(2 * Math.PI * 140 * t * Math.exp(-t * 12)) * Math.exp(-t / 0.03)); pluck(10.8, 69, 0.2, 0, 0.25, 0.4); // confirm
[69, 71, 74, 76, 78].forEach((m, i) => bell(11.4 + i * 0.6, m + 12, 0.1 + 0.012 * i, -0.2 + i * 0.1, 0.4)); // steps tick off
[81, 86, 83, 90].forEach((m, i) => pluck(15.0 + i * 0.6, m, 0.07, 0.5, 0.3, 0.6));                  // channel cards
[81, 86, 90].forEach((m, i) => bell(17.4 + i * 0.045, m, 0.11, 0.1 * i, 0.9));                       // every number matches
sweep(18.9, 0.34, 0.3, 500, 6000, (x) => Math.sin(Math.PI * x) ** 2);                               // wipe

// bar 9 — outro: one resolved chord, left to ring
const T9 = 19.2; kick(T9, 0.8); bass(T9, 1.8, 38, 0.3); pad(T9, 1.7, [50, 57, 62, 66, 69, 76], 0.05);
noise(T9, 1.8, 0.12, 0, 'hp', 5500, 0.7, (t) => Math.exp(-t / 0.5) * att(t, 0.002), 0.5);
[62, 69, 74, 78, 81, 86].forEach((m, i) => pluck(T9 + i * 0.035, m, 0.17, -0.5 + i * 0.2, 0.7, 0.6));
[78, 81, 86].forEach((m, i) => bell(20.27 + i * 0.15, m, 0.08, 0.2 - i * 0.2, 0.8));                 // CTA

// ── mix ──
const sc = new Float32Array(N).fill(1);
for (const k of kicks) { const i0 = Math.round(k * SR); for (let i = 0; i < SR * 0.5 && i0 + i < N; i++) sc[i0 + i] = Math.min(sc[i0 + i], 1 - 0.55 * Math.exp(-(i / SR) / 0.11)); }
function reverb(x, off) { const out = new Float32Array(N), combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ buf: new Float32Array(d + off), i: 0, lp: 0 })), aps = [225, 556, 441].map((d) => ({ buf: new Float32Array(d + off), i: 0 }));
  for (let n = 0; n < N; n++) { let s = 0; for (const c of combs) { const y = c.buf[c.i]; c.lp = y * 0.72 + c.lp * 0.28; c.buf[c.i] = x[n] + c.lp * 0.86; c.i = (c.i + 1) % c.buf.length; s += y; }
    s /= combs.length; for (const a of aps) { const y = a.buf[a.i]; a.buf[a.i] = s + y * 0.5; a.i = (a.i + 1) % a.buf.length; s = y - s * 0.5; } out[n] = s; } return out; }
const wet = [reverb(send[0], 0), reverb(send[1], 23)];
const out = [new Float32Array(N), new Float32Array(N)]; let peak = 0;
for (let ch = 0; ch < 2; ch++) { const hp = new BQ().set('hp', 28, 0.7);
  for (let i = 0; i < N; i++) { const v = hp.run(dry[ch][i] + duck[ch][i] * sc[i] + wet[ch][i] * 0.5); out[ch][i] = v; peak = Math.max(peak, Math.abs(v)); } }
const drive = 1.15 / peak, pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { const t = i / SR, fade = Math.min(1, t / 0.01) * Math.min(1, Math.max(0, (DUR - t) / 1.1)) ** 1.5;
  for (let ch = 0; ch < 2; ch++) pcm.writeInt16LE(Math.round(32767 * 0.89 * fade * Math.tanh(out[ch][i] * drive) / Math.tanh(1.15)), 44 + i * 4 + ch * 2); }
fs.writeFileSync('music.wav', pcm); console.log('peak', peak.toFixed(3));
