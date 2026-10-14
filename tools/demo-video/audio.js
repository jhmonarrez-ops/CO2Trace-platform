// Soundtrack for the demo video, synthesised from scratch (no samples, so no licences to track):
// an upbeat "corporate" loop (I–V–vi–IV in C at 104 BPM: pad, plucked arpeggio, bass, soft drums)
// and UI sound effects placed at the events record.js logged (click, key, whoosh, pop, chime).
// writeSoundtrack(events, seconds, file) writes a 44.1 kHz 16-bit stereo WAV.
const fs = require('fs');

const SR = 44100;
const TAU = Math.PI * 2;
const midi = n => 440 * Math.pow(2, (n - 69) / 12);

// seeded noise so every render sounds the same
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function music(L, R, seconds) {
  const bpm = 104, beat = 60 / bpm, bar = beat * 4;
  // C, G, Am, F: [bass root, chord tones]
  const chords = [[36, [60, 64, 67, 72]], [43, [59, 62, 67, 71]], [45, [60, 64, 69, 72]], [41, [60, 65, 69, 72]]];
  const n = Math.floor(seconds * SR);
  const add = (i, l, r) => { if (i >= 0 && i < n) { L[i] += l; R[i] += r; } };

  for (let b = 0; b * bar < seconds; b++) {
    const [root, tones] = chords[b % 4], t0 = b * bar;
    // pad: detuned triangle-ish partials, slow attack, low-passed by keeping only three harmonics
    for (let i = Math.floor(t0 * SR); i < Math.min(n, Math.floor((t0 + bar) * SR)); i++) {
      const t = i / SR - t0, env = Math.min(1, t / 0.6) * Math.min(1, (bar - t) / 0.25);
      let v = 0;
      tones.slice(0, 3).forEach((m, k) => {
        const f = midi(m);
        v += Math.sin(TAU * f * 1.003 * (i / SR)) + Math.sin(TAU * f * 0.997 * (i / SR)) + 0.25 * Math.sin(TAU * 2 * f * (i / SR));
      });
      v *= 0.018 * env;
      add(i, v * 0.9, v * 1.1);
    }
    // plucked arpeggio, eighth notes, alternating pan
    for (let e = 0; e < 8; e++) {
      const m = tones[[0, 1, 2, 3, 2, 1, 2, 3][e]] + 12, f = midi(m), st = t0 + e * beat / 2;
      const len = Math.floor(0.45 * SR), s0 = Math.floor(st * SR), pan = e % 2 ? 0.7 : 1.3;
      for (let j = 0; j < len; j++) {
        const t = j / SR, env = Math.exp(-t * 9) * Math.min(1, t / 0.004);
        const v = (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t) + 0.12 * Math.sin(TAU * 3 * f * t)) * env * 0.05;
        add(s0 + j, v * (2 - pan), v * pan);
      }
    }
    // bass: root on every beat, octave bounce on the "and" of 4
    for (let q = 0; q < 4; q++) {
      const f = midi(root), s0 = Math.floor((t0 + q * beat) * SR), len = Math.floor(beat * 0.9 * SR);
      for (let j = 0; j < len; j++) {
        const t = j / SR, env = Math.min(1, t / 0.01) * Math.exp(-t * 2.2);
        const v = (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t)) * env * 0.11;
        add(s0 + j, v, v);
      }
    }
    // drums: kick on 1 and 3, soft clap on 2 and 4, closed hat on the off-beats
    for (let q = 0; q < 4; q++) {
      const sb = Math.floor((t0 + q * beat) * SR);
      if (q % 2 === 0) for (let j = 0; j < 0.25 * SR; j++) {
        const t = j / SR, f = 50 + 90 * Math.exp(-t * 30), v = Math.sin(TAU * f * t) * Math.exp(-t * 14) * 0.22;
        add(sb + j, v, v);
      } else for (let j = 0; j < 0.12 * SR; j++) {
        const t = j / SR, v = rnd() * Math.exp(-t * 35) * 0.05;
        add(sb + j, v * 0.9, v * 1.1);
      }
      const sh = Math.floor((t0 + (q + 0.5) * beat) * SR);
      let lp = 0;
      for (let j = 0; j < 0.05 * SR; j++) {
        const t = j / SR, x = rnd(); const hp = x - lp; lp = x;
        const v = hp * Math.exp(-t * 80) * 0.03;
        add(sh + j, v * 1.2, v * 0.8);
      }
    }
  }
  // fade in and out
  for (let i = 0; i < n; i++) {
    const t = i / SR, g = Math.min(1, t / 1.5) * Math.min(1, (seconds - t) / 2.5);
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
        add(s0 + j, (rnd() * Math.exp(-t * 900) * 0.35 + Math.sin(TAU * 1800 * t) * Math.exp(-t * 120) * 0.12) * 2);
      }
    } else if (ev.type === 'key') {
      const f = 2600 + rnd() * 500;
      for (let j = 0; j < 0.02 * SR; j++) {
        const t = j / SR;
        add(s0 + j, (rnd() * 0.5 + Math.sin(TAU * f * t) * 0.5) * Math.exp(-t * 400) * 0.16, 1 + rnd() * 0.3);
      }
    } else if (ev.type === 'whoosh') {
      const len = 0.9; let lp = 0;
      for (let j = 0; j < len * SR; j++) {
        const t = j / SR, p = t / len, env = Math.sin(Math.PI * p) ** 2;
        const a = 0.02 + 0.25 * Math.sin(Math.PI * p); lp += a * (rnd() - lp);
        add(s0 + j, lp * env * 0.5, 0.6 + 0.8 * p);
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
  const g = peak > 0.89 ? 0.89 / peak : 1;
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
