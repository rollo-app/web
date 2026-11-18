// Usage: npm run reel:audio (npm run reel also renders the video)
// Synthesizes the Reel's soundtrack (120 BPM, 22 s) into public/reel/music.wav and copies the
// App Store badge next to it. Both are generated, not committed.
// Everything is placed on the same frame numbers as the video (src/reel/beats.ts), so cuts,
// text and sounds stay in sync. Pure JS, no samples: nothing to license.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { AT, BAR, BEAT, FPS, MONTAGE, SEND_PRESS, SHUTTER, FLY, TOTAL, pinStep } = await import("../src/reel/beats.ts");

const SR = 44100;
const N = Math.ceil((TOTAL / FPS) * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const at = (frame) => Math.round((frame / FPS) * SR);
const sec = (s) => Math.round(s * SR);

// Deterministic noise so every render sounds the same.
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

/** Mix a mono generator `fn(i, t)` into the buffer from `start` for `len` samples. */
function mix(start, len, fn, gain = 1, pan = 0) {
  const gl = gain * Math.min(1, 1 - pan);
  const gr = gain * Math.min(1, 1 + pan);
  for (let i = 0; i < len; i++) {
    const j = start + i;
    if (j < 0 || j >= N) continue;
    const v = fn(i, i / SR);
    L[j] += v * gl;
    R[j] += v * gr;
  }
}

const freq = (note) => 440 * 2 ** ((note - 69) / 12); // MIDI → Hz

// ── Instruments ──────────────────────────────────────────────────────────────────────────────────────
function kick(frame, gain = 1) {
  let ph = 0;
  mix(at(frame), sec(0.45), (i, t) => {
    const f = 45 + 110 * Math.exp(-t * 28);
    ph += (2 * Math.PI * f) / SR;
    return Math.sin(ph) * Math.exp(-t * 7) + (i < 40 ? rnd() * 0.3 * (1 - i / 40) : 0);
  }, gain);
}

function hat(frame, gain = 0.18, pan = 0.25) {
  let prev = 0;
  mix(at(frame), sec(0.06), (i, t) => {
    const n = rnd();
    const hp = n - prev; // crude high-pass
    prev = n;
    return hp * Math.exp(-t * 70);
  }, gain, pan);
}

function clap(frame, gain = 0.35) {
  let lp = 0;
  mix(at(frame), sec(0.25), (i, t) => {
    lp += (rnd() - lp) * 0.35;
    const bursts = t < 0.03 ? (Math.floor(t / 0.01) % 2 === 0 ? 1 : 0.4) : 1;
    return (lp * 1.6 * bursts + Math.sin(2 * Math.PI * 190 * t) * 0.25) * Math.exp(-t * 14);
  }, gain, -0.1);
}

function tick(frame, gain = 0.22) {
  mix(at(frame), sec(0.04), (i, t) => Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t * 120), gain);
}

/** Warm saw-ish tone (a few harmonics) through a one-pole low-pass. */
function tone(start, len, f, { gain = 0.1, attack = 0.02, release = 0.2, cutoff = 1400, harmonics = 6, pan = 0, detune = 0 } = {}) {
  let lp = 0;
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  const ff = f * (1 + detune);
  mix(start, len + sec(release), (i, t) => {
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin(2 * Math.PI * ff * h * t) / h;
    lp += (v - lp) * a;
    const env = Math.min(1, t / attack) * (i < len ? 1 : Math.exp(-((i - len) / SR) * (5 / release)));
    return lp * env;
  }, gain, pan);
}

function chord(frame, frames, notes, opts = {}) {
  for (const n of notes) {
    tone(at(frame), at(frames), freq(n), { ...opts, detune: 0.003, pan: -0.3 });
    tone(at(frame), at(frames), freq(n), { ...opts, detune: -0.003, pan: 0.3 });
  }
}

function bass(frame, frames, note, gain = 0.32) {
  tone(at(frame), at(frames), freq(note), { gain, attack: 0.005, release: 0.08, cutoff: 500, harmonics: 4 });
  tone(at(frame), at(frames), freq(note - 12), { gain: gain * 0.8, attack: 0.005, release: 0.08, cutoff: 200, harmonics: 1 });
}

/** Filtered noise whose cutoff and level rise over `frames` (a riser) or fall (a whoosh). */
function sweep(frame, frames, { from = 200, to = 6000, gain = 0.3, shape = "rise", pan = 0 } = {}) {
  let lp = 0;
  const len = at(frames);
  mix(at(frame), len, (i) => {
    const p = i / len;
    const fc = from * (to / from) ** p;
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    lp += (rnd() - lp) * a;
    const env = shape === "rise" ? p ** 2 : Math.sin(Math.PI * p) ** 2;
    return lp * env;
  }, gain, pan);
}

function crash(frame, gain = 0.35) {
  let prev = 0;
  mix(at(frame), sec(2.2), (i, t) => {
    const n = rnd();
    const hp = n - prev * 0.6;
    prev = n;
    return hp * Math.exp(-t * 2.2);
  }, gain, 0.15);
}

/** Mechanical shutter: two short clacks. */
function shutter(frame) {
  for (const [dt, g] of [[0, 0.7], [0.045, 0.45]]) {
    let lp = 0;
    mix(at(frame) + sec(dt), sec(0.05), (i, t) => {
      lp += (rnd() - lp) * 0.5;
      return (lp + Math.sin(2 * Math.PI * 900 * t) * 0.3) * Math.exp(-t * 90);
    }, g);
  }
}

function blip(frame, f, gain = 0.07, pan = 0) {
  mix(at(frame), sec(0.07), (i, t) => Math.sin(2 * Math.PI * f * t * (1 + t * 3)) * Math.exp(-t * 55), gain, pan);
}

/** Tape stop: the pulse brakes with the grid. */
function brake(frame) {
  let ph = 0;
  mix(at(frame), sec(0.35), (i, t) => {
    const f = 320 * Math.exp(-t * 9);
    ph += (2 * Math.PI * f) / SR;
    return (Math.sin(ph) * 0.8 + rnd() * 0.15) * Math.exp(-t * 6);
  }, 0.45);
}

/** Darkroom drone: low hum with a slow tremolo, swelling toward the hit. */
function drone(frame, frames) {
  const len = at(frames);
  mix(at(frame), len, (i, t) => {
    const p = i / len;
    const trem = 0.75 + 0.25 * Math.sin(2 * Math.PI * 2 * t); // 2 Hz = the beat
    return (Math.sin(2 * Math.PI * 55 * t) + 0.6 * Math.sin(2 * Math.PI * 110.4 * t) + 0.4 * Math.sin(2 * Math.PI * 164.8 * t) + 0.25 * Math.sin(2 * Math.PI * 220.6 * t)) * trem * (0.35 + 0.65 * p);
  }, 0.4);
}

/** Electric-piano-ish note: a sine with a bell overtone that decays, slight tremolo. */
function keys(frame, frames, note, { gain = 0.09, pan = 0 } = {}) {
  const f = freq(note);
  const len = at(frames);
  mix(at(frame), len + sec(0.4), (i, t) => {
    const decay = Math.exp(-t * 2.2);
    const tail = i < len ? 1 : Math.exp(-((i - len) / SR) * 12);
    const bell = Math.sin(2 * Math.PI * f * 3.01 * t) * 0.25 * Math.exp(-t * 9);
    const body = Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 4);
    return (body + bell) * decay * tail * (0.9 + 0.1 * Math.sin(2 * Math.PI * 5 * t)) * Math.min(1, t / 0.004);
  }, gain, pan);
}

/** Short plucked note for the arpeggio. */
function pluck(frame, note, gain = 0.07, pan = 0) {
  const f = freq(note);
  let lp = 0;
  mix(at(frame), sec(0.35), (i, t) => {
    let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t) / (h * h);
    const fc = 600 + 3500 * Math.exp(-t * 18);
    lp += (v - lp) * (1 - Math.exp((-2 * Math.PI * fc) / SR));
    return lp * Math.exp(-t * 9) * Math.min(1, t / 0.002);
  }, gain, pan);
}

// ── Arrangement (Fmaj7 – Cmaj7 – Am7 – G6, warm and a little nostalgic) ─────────────────────────────
const PROG = [
  { chord: [53, 57, 60, 64], root: 41 }, // Fmaj7
  { chord: [52, 55, 59, 60], root: 48 }, // Cmaj7
  { chord: [55, 57, 60, 64], root: 45 }, // Am7
  { chord: [55, 59, 62, 64], root: 43 }, // G6
];
const stepAt = (f) => PROG[(((f - AT.logo) / BAR) % 4 + 4) % 4];

// Bar 1: the pulse. A tick per beat while the grid scrolls, keys holding the first chord.
for (let b = 0; b < 4; b++) {
  tick(AT.hook + b * BEAT, 0.28);
  kick(AT.hook + b * BEAT, 0.55);
}
for (const n of PROG[0].chord) keys(AT.hook, BAR - 2, n + 12, { gain: 0.1, pan: (n % 3) * 0.2 - 0.2 });

// Bar 2: dead stop with the grid, silence, then a riser into the logo.
brake(AT.stop);
sweep(AT.stop + 2 * BEAT, 2 * BEAT, { from: 300, to: 5000, gain: 0.2 });

/** Bars of groove: kick on 1 and 3 plus a push before 3, offbeat hats, keys on the chord, bass and an 8th-note arpeggio. */
function groove(fromBar, toBar, { clapOn = false, gain = 1, melody = null } = {}) {
  for (let f = fromBar; f < toBar; f += BAR) {
    const step = stepAt(f);
    const half = BEAT / 2;
    for (const n of step.chord) keys(f, BAR - 4, n, { gain: 0.05 * gain, pan: ((n % 4) - 1.5) * 0.15 });
    chord(f, BAR, step.chord, { gain: 0.018 * gain, attack: 0.3, cutoff: 900, harmonics: 3 });
    for (const k of [0, 2 * BEAT - half, 2 * BEAT]) kick(f + k, 0.85 * gain);
    for (let e = 0; e < 8; e++) hat(f + e * half + (e % 2 ? 1 : 0), (e % 2 ? 0.15 : 0.07) * gain, e % 2 ? 0.3 : -0.2);
    bass(f, BEAT * 1.3, step.root, 0.3 * gain);
    bass(f + BEAT + half, half, step.root + 12, 0.18 * gain);
    bass(f + 2 * BEAT, BEAT, step.root, 0.26 * gain);
    bass(f + 3 * BEAT, BEAT * 0.8, step.root + 7, 0.24 * gain);
    const arp = [...step.chord, step.chord[1] + 12, step.chord[2] + 12, step.chord[1] + 12, step.chord[0] + 12].map((n) => n + 12);
    arp.forEach((n, e) => pluck(f + e * half, n, 0.045 * gain, e % 2 ? 0.35 : -0.35));
    if (clapOn) for (const b of [1, 3]) clap(f + b * BEAT, 0.3 * gain);
    const line = melody?.[(f - fromBar) / BAR];
    if (line) line.forEach(([beat, note, len]) => keys(f + beat * BEAT, len * BEAT, note, { gain: 0.08 * gain }));
  }
}
groove(AT.logo, AT.darkroom);

// Logo: one bell per circle, climbing.
[0, 1, 2].forEach((i) => keys(AT.logo + i * BEAT, BEAT, [76, 79, 84][i], { gain: 0.09 }));

// Camera: shutter on the beat, a tap on "Mandar al rollo", a whoosh as the photo flies into the roll.
shutter(SHUTTER);
blip(SEND_PRESS, 600, 0.08);
sweep(FLY - 4, 22, { from: 400, to: 4000, gain: 0.28, shape: "whoosh" });

// Map: a tiny pop per pin (photos with GPS).
const pins = JSON.parse(readFileSync(join(root, "src", "data", "photos.json"), "utf8")).filter((p) => p.lat !== null && p.lng !== null && p.takenAt !== "").length;
for (let i = 0; i < pins; i++) blip(AT.map + Math.round(i * pinStep(pins)), 1100 + ((i * 137) % 500), 0.045, ((i % 5) - 2) * 0.15);

// Bars 7–8: the music drops out; darkroom drone, a music-box hint of the theme, a long riser into the hit.
drone(AT.darkroom, AT.hit - AT.darkroom);
[[0, 76], [1, 74], [2, 72], [4, 76], [5, 79], [6, 77]].forEach(([b, n]) => pluck(AT.darkroom + b * BEAT, n + 12, 0.06, 0.2));
sweep(AT.darkroom + BAR, BAR, { from: 150, to: 9000, gain: 0.28 });

// Bar 9: the hit, the full groove comes back with claps and a melody on top.
kick(AT.hit, 1.3);
crash(AT.hit, 0.3);
for (const n of [53, 57, 60, 64, 69]) keys(AT.hit, BEAT * 2, n + 12, { gain: 0.07 });
groove(AT.hit, AT.end, {
  clapOn: true,
  gain: 1.05,
  melody: [
    [[0, 81, 1.5], [1.5, 79, 0.5], [2, 77, 1], [3, 76, 1]],
    null, // bar 10: the word stabs carry it
  ],
});

// Bar 10: a stab on each word, rising.
MONTAGE.forEach((m, i) => { for (const n of [[72, 76, 79], [74, 77, 81], [76, 79, 84]][i]) keys(m.at, BEAT / 2, n, { gain: 0.06 }); });

// Bar 11: resolve to Cmaj9 and let it ring.
kick(AT.end, 0.7);
for (const n of [48, 55, 59, 62, 64, 71]) keys(AT.end, BAR - BEAT, n, { gain: 0.07 });
chord(AT.end, BAR - BEAT, [55, 59, 64], { gain: 0.025, attack: 0.2, release: 0.9, cutoff: 1200, harmonics: 3 });
bass(AT.end, BAR - BEAT, 36, 0.26);

// ── Master: normalize, soft clip, fade the last frames, write 16-bit WAV ─────────────────────────────
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const norm = 0.9 / peak;
const fadeFrom = at(TOTAL - 8);
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const fade = i < fadeFrom ? 1 : 1 - (i - fadeFrom) / (N - fadeFrom);
  const l = Math.tanh(L[i] * norm * 1.2) * fade;
  const r = Math.tanh(R[i] * norm * 1.2) * fade;
  data.writeInt16LE(Math.round(l * 32767), i * 4);
  data.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
const out = join(root, "public", "reel", "music.wav");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.concat([header, data]));
console.log(`${out} (${(N / SR).toFixed(2)} s)`);
copyFileSync(join(root, "..", "scripts", "site", "app-store-badge.svg"), join(root, "public", "reel", "app-store-badge.svg"));
