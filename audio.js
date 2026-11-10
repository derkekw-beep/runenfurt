// Klänge: alles wird im Browser erzeugt (Web Audio), es gibt keine Tondateien.
let ctx = null, master = null, enabled = true, noiseBuf = null;
const lastAt = {};

export function setSound(on) { enabled = !!on; if (master) master.gain.value = enabled ? 0.5 : 0; }

// Muss in einer Berührung aufgerufen werden (iOS gibt den Ton erst dann frei).
export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = enabled ? 0.5 : 0; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running') ctx.resume();
  } catch { /* ohne Ton weiterspielen */ }
}

function tone(f0, f1, dur, type = 'sine', vol = 0.3, delay = 0) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 1200, type = 'lowpass', delay = 0) {
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5, dur + 0.02);
}

const SOUNDS = {
  click: () => tone(520, 700, 0.05, 'triangle', 0.2),
  error: () => { tone(170, 120, 0.12, 'square', 0.14); },
  deploy: () => { tone(240, 90, 0.14, 'triangle', 0.35); noise(0.08, 0.15, 700); },
  hit: () => noise(0.05, 0.12, 2400, 'bandpass'),
  heavy: () => { tone(110, 45, 0.16, 'sine', 0.4); noise(0.09, 0.2, 500); },
  shoot: () => tone(880, 420, 0.06, 'triangle', 0.08),
  tower: () => tone(300, 160, 0.08, 'square', 0.06),
  sternschlag: () => { noise(0.55, 0.5, 600); tone(140, 35, 0.5, 'sine', 0.5); },
  hagelschauer: () => { noise(0.45, 0.3, 3500, 'highpass'); },
  wurzelgriff: () => { tone(150, 320, 0.25, 'sawtooth', 0.12); noise(0.2, 0.1, 900); },
  heilquell: () => { tone(660, 660, 0.25, 'sine', 0.18); tone(990, 990, 0.35, 'sine', 0.14, 0.1); },
  cast: () => tone(500, 1100, 0.2, 'sine', 0.12),
  fall: () => { noise(0.9, 0.55, 400); tone(120, 30, 0.8, 'sawtooth', 0.3); tone(60, 30, 0.9, 'sine', 0.5); },
  wake: () => { tone(220, 330, 0.3, 'square', 0.08); tone(330, 440, 0.3, 'square', 0.08, 0.15); },
  horn: () => { tone(196, 196, 0.5, 'sawtooth', 0.14); tone(294, 294, 0.6, 'sawtooth', 0.12, 0.25); },
  tick: () => tone(1000, 1000, 0.04, 'square', 0.08),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.25, i * 0.13)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.97, 0.35, 'triangle', 0.22, i * 0.18)),
  draw: () => [392, 392].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.2, i * 0.25)),
  rune: () => [660, 880, 1320, 1760].forEach((f, i) => tone(f, f * 1.02, 0.22, 'sine', 0.14, i * 0.05)),
  schlachtruf: () => { tone(220, 330, 0.35, 'sawtooth', 0.16); tone(330, 494, 0.45, 'sawtooth', 0.14, 0.18); },
  blitzkette: () => { noise(0.25, 0.4, 5000, 'highpass'); tone(1800, 200, 0.2, 'square', 0.12); tone(90, 40, 0.3, 'sine', 0.3, 0.05); },
  funkenschlag: () => { noise(0.15, 0.35, 5000, 'highpass'); tone(1500, 300, 0.12, 'square', 0.12); },
  sumpfdunst: () => { noise(0.6, 0.25, 300); tone(180, 120, 0.4, 'sine', 0.15); tone(240, 160, 0.3, 'sine', 0.1, 0.2); },
  kriegstrommel: () => [0, 0.14, 0.28].forEach(d => { tone(120, 50, 0.16, 'sine', 0.45, d); noise(0.05, 0.15, 800, 'lowpass', d); }),
  coin: () => { tone(1320, 1320, 0.08, 'square', 0.1); tone(1760, 1760, 0.2, 'square', 0.1, 0.07); },
  upgrade: () => [440, 554, 659, 880].forEach((f, i) => tone(f, f, 0.18, 'square', 0.1, i * 0.07)),
};
const GAP = { hit: 0.06, shoot: 0.07, tower: 0.1, heavy: 0.08, heilquell: 1 };

export function sfx(name) {
  if (!ctx || !enabled || ctx.state !== 'running' || !SOUNDS[name]) return;
  const now = ctx.currentTime;
  if (now - (lastAt[name] || -1) < (GAP[name] || 0.02)) return;
  lastAt[name] = now;
  try { SOUNDS[name](); } catch { /* egal */ }
}
