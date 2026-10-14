// Soundtrack for the demo video, synthesised from scratch (no samples, so no licences to track):
// a calm ambient bed (slow pads, sub bass and sparse bells with a stereo delay)
// and UI sound effects placed at the events record.js logged (click, key, whoosh, pop, chime).
// writeSoundtrack(events, seconds, file) writes a 44.1 kHz 16-bit stereo WAV.
const fs = require('fs');

const SR = 44100;
const TAU = Math.PI * 2;
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

// seeded noise so every render sounds the same
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

// Ambient bed: Fmaj7 – Am7 – Cmaj9 – G6/9, one chord every two bars at 66 BPM. Slow detuned pads with a breathing
// swell, a soft sub bass, and sparse pentatonic bell notes sent through a stereo feedback delay for space. No drums.
function music(L, R, seconds) {
  const n = Math.floor(seconds * SR);
  const beat = 60 / 66, span = beat * 8;
  const chords = [[29, [53, 57, 60, 64]], [33, [57, 60, 64, 67]], [36, [55, 59, 62, 64]], [31, [55, 59, 62, 64]]];
  const bells = [72, 74, 76, 79, 81, 84, 86, 88];   // C major pentatonic, upper register
  const wetL = new Float32Array(n), wetR = new Float32Array(n);
  const add = (buf, i, v) => { if (i >= 0 && i < n) buf[i] += v; };

  for (let c = 0; c * span < seconds + span; c++) {
    const [root, tones] = chords[c % 4], t0 = c * span, fade = 2.4;
    const s0 = Math.floor((t0 - fade) * SR), s1 = Math.min(n, Math.floor((t0 + span + fade) * SR));
    // pad: each chord tone as three detuned partials, crossfading 2.4 s into the next chord
    for (let i = Math.max(0, s0); i < s1; i++) {
      const t = i / SR, u = t - (t0 - fade), len = span + 2 * fade;
      const env = Math.sin(Math.PI * Math.min(1, Math.max(0, u / len))) ** 1.5;
      const breathe = 0.75 + 0.25 * Math.sin(TAU * t / 9 + c);
      let l = 0, r = 0;
      tones.forEach((m, k) => {
        const f = midi(m);
        const a = Math.sin(TAU * f * 0.996 * t + k), b = Math.sin(TAU * f * 1.004 * t + 2 * k), h = 0.18 * Math.sin(TAU * 2 * f * t + k);
        l += a + 0.7 * b + h; r += 0.7 * a + b + h;
      });
      const g = 0.0105 * env * breathe;
      L[i] += l * g; R[i] += r * g;
      // sub bass: the chord root, very soft
      const sb = Math.sin(TAU * midi(root) * t) * 0.05 * env;
      L[i] += sb; R[i] += sb;
    }
    // bells: four to six sparse notes per chord, at seeded off-grid times
    const count = 4 + Math.floor((rnd() + 1) * 1.2);
    for (let k = 0; k < count; k++) {
      const st = t0 + (k + 0.15 + (rnd() + 1) * 0.3) * span / count, m = bells[Math.floor((rnd() + 1) / 2 * bells.length) % bells.length];
      const f = midi(m), i0 = Math.floor(st * SR), pan = 0.5 + rnd() * 0.35, vel = 0.035 + (rnd() + 1) * 0.012;
      for (let j = 0; j < 2.8 * SR; j++) {
        const t = j / SR, env = Math.exp(-t * 1.6) * Math.min(1, t / 0.006);
        const v = (Math.sin(TAU * f * t) + 0.28 * Math.sin(TAU * 2.0 * f * t) * Math.exp(-t * 3) + 0.1 * Math.sin(TAU * 3.01 * f * t) * Math.exp(-t * 5)) * env * vel;
        add(L, i0 + j, v * (1 - pan)); add(R, i0 + j, v * pan);
        add(wetL, i0 + j, v * (1 - pan)); add(wetR, i0 + j, v * pan);
      }
    }
  }
  // stereo feedback delay (ping-pong) on the bells, then a slow fade in and out
  const dL = Math.floor(0.42 * SR), dR = Math.floor(0.61 * SR), fb = 0.52, mix = 0.55;
  const bL = new Float32Array(n), bR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const yL = wetL[i] + (i >= dR ? bR[i - dR] * fb : 0), yR = wetR[i] + (i >= dL ? bL[i - dL] * fb : 0);
    bL[i] = yL; bR[i] = yR;
    L[i] += (yL - wetL[i]) * mix; R[i] += (yR - wetR[i]) * mix;
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR, g = Math.min(1, t / 3) * Math.min(1, (seconds - t) / 4);
    L[i] *= g; R[i] *= g;
  }
}

function sfx(L, R, events) {
  const n = L.length;
  const add = (i, v, pan = 1) => { if (i >= 0 && i < n) { L[i] += v * (2 - pan) / 2; R[i] += v * pan / 2; } };
  for (const ev of events) {
    const s0 = Math.floor(ev.t * SR);
    if (ev.type === 'click') {
      for (let j = 0; j < 0.05 * SR; j++) {
        const t = j / SR;
        add(s0 + j, (rnd() * Math.exp(-t * 900) * 0.35 + Math.sin(TAU * 1800 * t) * Math.exp(-t * 120) * 0.12) * 1.3);
      }
    } else if (ev.type === 'key') {
      const f = 2600 + rnd() * 500;
      for (let j = 0; j < 0.02 * SR; j++) {
        const t = j / SR;
        add(s0 + j, (rnd() * 0.5 + Math.sin(TAU * f * t) * 0.5) * Math.exp(-t * 400) * 0.1, 1 + rnd() * 0.3);
      }
    } else if (ev.type === 'whoosh') {
      const len = 0.9; let lp = 0;
      for (let j = 0; j < len * SR; j++) {
        const t = j / SR, p = t / len, env = Math.sin(Math.PI * p) ** 2;
        const a = 0.02 + 0.25 * Math.sin(Math.PI * p); lp += a * (rnd() - lp);
        add(s0 + j, lp * env * 0.35, 0.6 + 0.8 * p);
      }
    } else if (ev.type === 'pop') {
      for (let j = 0; j < 0.12 * SR; j++) {
        const t = j / SR, f = 700 + 500 * Math.min(1, t / 0.04);
        add(s0 + j, Math.sin(TAU * f * t) * Math.exp(-t * 30) * 0.07);
      }
    } else if (ev.type === 'chime') {
      [[1046.5, 0], [1318.5, 0.09], [1568, 0.18], [2093, 0.27]].forEach(([f, d]) => {
        const s1 = s0 + Math.floor(d * SR);
        for (let j = 0; j < 1.6 * SR; j++) {
          const t = j / SR, env = Math.exp(-t * 3) * Math.min(1, t / 0.005);
          add(s1 + j, (Math.sin(TAU * f * t) + 0.2 * Math.sin(TAU * 2.76 * f * t)) * env * 0.07);
        }
      });
    }
  }
}

function writeSoundtrack(events, seconds, file) {
  const n = Math.floor(seconds * SR), L = new Float32Array(n), R = new Float32Array(n);
  music(L, R, seconds);
  sfx(L, R, events);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? 0.7 / peak : 1;   // normalise the peak to about -3 dBFS
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

module.exports = { writeSoundtrack };
