// Klänge: alles wird im Browser erzeugt (Web Audio), es gibt keine Tondateien.
// Seit 2026-11-11: Ausgang über Tiefpass und Begrenzer (nichts klirrt, wenn viel zugleich klingt), Rechteck- und Sägezahn-Töne werden
// abgemildert, häufige Klänge (Treffer, Schüsse) schwanken leicht in der Tonhöhe, damit sie sich nicht abnutzen.
let ctx = null, master = null, enabled = true, noiseBuf = null, vary = 1;
const lastAt = {};

let volume = 0.8;
const level = () => (enabled ? 0.62 * volume : 0);
export function setSound(on) { enabled = !!on; if (master) master.gain.value = level(); }
export function setVolume(v) { volume = Math.min(1, Math.max(0, Number(v) || 0)); if (master) master.gain.value = level(); }

// Muss in einer Berührung aufgerufen werden (iOS gibt den Ton erst dann frei).
export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = level();
      const soft = ctx.createBiquadFilter(); soft.type = 'lowpass'; soft.frequency.value = 9000; soft.Q.value = 0.3;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.14;
      master.connect(soft); soft.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running') ctx.resume();
  } catch { /* ohne Ton weiterspielen */ }
}

function tone(f0, f1, dur, type = 'sine', vol = 0.3, delay = 0) {
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  const hard = type === 'square' || type === 'sawtooth', a = hard ? 0.012 : 0.006;
  o.type = type; o.frequency.setValueAtTime(f0 * vary, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * vary), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(hard ? vol * 0.8 : vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (hard) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.min(5200, Math.max(f0, f1) * 3.2); o.connect(f); f.connect(g); } else o.connect(g);   // kantige Wellen abmildern
  g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 1200, type = 'lowpass', delay = 0) {
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5, dur + 0.02);
}

const SOUNDS = {
  click: () => { tone(660, 880, 0.045, 'sine', 0.16); noise(0.012, 0.05, 5000, 'highpass'); },
  tab: () => tone(520, 640, 0.04, 'sine', 0.1),
  error: () => { tone(196, 147, 0.1, 'triangle', 0.18); tone(147, 110, 0.14, 'triangle', 0.16, 0.09); },
  deploy: () => { noise(0.12, 0.12, 900, 'bandpass'); tone(200, 80, 0.16, 'sine', 0.36); tone(400, 200, 0.06, 'triangle', 0.1); },
  hit: () => { noise(0.035, 0.1, 2600, 'bandpass'); tone(190, 110, 0.05, 'sine', 0.13); },
  heavy: () => { tone(120, 42, 0.2, 'sine', 0.4); noise(0.1, 0.17, 420); tone(60, 40, 0.18, 'sine', 0.2); },
  shoot: () => { noise(0.05, 0.06, 3200, 'bandpass'); tone(980, 520, 0.05, 'sine', 0.06); },
  tower: () => { tone(210, 120, 0.09, 'triangle', 0.1); noise(0.04, 0.05, 1400, 'bandpass'); },
  sternschlag: () => { noise(0.55, 0.5, 600); tone(140, 35, 0.5, 'sine', 0.5); },
  hagelschauer: () => { noise(0.45, 0.3, 3500, 'highpass'); },
  wurzelgriff: () => { tone(150, 320, 0.25, 'sawtooth', 0.12); noise(0.2, 0.1, 900); },
  heilquell: () => { tone(660, 660, 0.25, 'sine', 0.18); tone(990, 990, 0.35, 'sine', 0.14, 0.1); },
  cast: () => { tone(520, 980, 0.18, 'sine', 0.1); noise(0.1, 0.04, 5000, 'highpass'); },
  launch: () => { noise(0.35, 0.16, 1400, 'bandpass'); tone(260, 620, 0.3, 'sine', 0.1); },                    // Wurfzauber verlässt den Hauptturm
  ability: () => { [523, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 'sine', 0.14, i * 0.06)); noise(0.2, 0.06, 4000, 'highpass'); },   // Fähigkeit einer Heldenform
  pop: () => { tone(260, 90, 0.09, 'sine', 0.13); noise(0.05, 0.05, 1800, 'bandpass'); },                         // eine Truppe fällt
  aura: () => { noise(0.25, 0.05, 2400, 'bandpass'); tone(520, 420, 0.2, 'sine', 0.04); },                       // Funken-, Gift-, Frostfeld
  kasse: () => { noise(0.05, 0.2, 6000, 'highpass'); tone(1319, 1319, 0.09, 'sine', 0.16); tone(1976, 1976, 0.35, 'sine', 0.16, 0.08); tone(2637, 2637, 0.4, 'sine', 0.08, 0.1); },   // Kauf-Simulation
  fall: () => { noise(0.9, 0.55, 400); tone(120, 30, 0.8, 'sawtooth', 0.3); tone(60, 30, 0.9, 'sine', 0.5); },
  wake: () => { tone(220, 330, 0.3, 'square', 0.08); tone(330, 440, 0.3, 'square', 0.08, 0.15); },
  horn: () => { tone(196, 196, 0.5, 'sawtooth', 0.14); tone(294, 294, 0.6, 'sawtooth', 0.12, 0.25); },
  tick: () => tone(1100, 1100, 0.035, 'sine', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.25, i * 0.13)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.97, 0.35, 'triangle', 0.22, i * 0.18)),
  draw: () => [392, 392].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.2, i * 0.25)),
  rune: () => [660, 880, 1320, 1760].forEach((f, i) => tone(f, f * 1.02, 0.22, 'sine', 0.14, i * 0.05)),
  schlachtruf: () => { tone(220, 330, 0.35, 'sawtooth', 0.16); tone(330, 494, 0.45, 'sawtooth', 0.14, 0.18); },
  blitzkette: () => { noise(0.25, 0.4, 5000, 'highpass'); tone(1800, 200, 0.2, 'square', 0.12); tone(90, 40, 0.3, 'sine', 0.3, 0.05); },
  funkenschlag: () => { noise(0.15, 0.35, 5000, 'highpass'); tone(1500, 300, 0.12, 'square', 0.12); },
  sumpfdunst: () => { noise(0.6, 0.25, 300); tone(180, 120, 0.4, 'sine', 0.15); tone(240, 160, 0.3, 'sine', 0.1, 0.2); },
  kriegstrommel: () => [0, 0.14, 0.28].forEach(d => { tone(120, 50, 0.16, 'sine', 0.45, d); noise(0.05, 0.15, 800, 'lowpass', d); }),
  frostnacht: () => { noise(0.5, 0.3, 6000, 'highpass'); tone(1800, 900, 0.4, 'sine', 0.12); tone(2400, 1200, 0.3, 'sine', 0.08, 0.08); },
  donnerkeil: () => { noise(0.5, 0.55, 3000, 'highpass'); tone(2000, 120, 0.25, 'square', 0.14); tone(80, 35, 0.6, 'sine', 0.5, 0.05); },
  felssturz: () => { noise(0.7, 0.6, 450); tone(110, 28, 0.7, 'sine', 0.6); },
  wichtwurf: () => { tone(300, 120, 0.15, 'triangle', 0.3); noise(0.12, 0.2, 900); },
  rollstein: () => { noise(0.9, 0.3, 260); tone(70, 55, 0.9, 'sawtooth', 0.12); },
  wirbelwind: () => { noise(1.2, 0.25, 1800, 'bandpass'); tone(300, 700, 1.0, 'sine', 0.06); },
  schleier: () => { tone(900, 300, 0.35, 'sine', 0.14); noise(0.3, 0.12, 4000, 'highpass'); },
  wurzelheer: () => { tone(120, 260, 0.3, 'sawtooth', 0.14); noise(0.3, 0.18, 700); },
  sturmlauf: () => { noise(0.3, 0.3, 2600, 'bandpass'); tone(500, 1400, 0.25, 'triangle', 0.14); },
  scatter: () => { noise(0.12, 0.4, 1800, 'bandpass'); tone(160, 60, 0.12, 'sine', 0.3); },
  hook: () => { tone(700, 200, 0.18, 'sawtooth', 0.1); noise(0.1, 0.15, 1200, 'bandpass', 0.1); },
  pulse: () => { tone(90, 40, 0.35, 'sine', 0.45); tone(400, 120, 0.25, 'triangle', 0.08); },
  morph: () => { tone(300, 900, 0.18, 'triangle', 0.14); noise(0.12, 0.12, 2600, 'bandpass'); },
  seitenwechsel: () => { noise(0.35, 0.3, 300); tone(200, 60, 0.3, 'sawtooth', 0.14); },
  stillewacht: () => { tone(440, 440, 0.5, 'sine', 0.16); tone(660, 660, 0.6, 'sine', 0.1, 0.05); },
  leibwache: () => { tone(294, 392, 0.2, 'sawtooth', 0.14); tone(392, 587, 0.3, 'sawtooth', 0.12, 0.12); },
  hohlstamm: () => { noise(0.6, 0.3, 300); tone(90, 70, 0.6, 'sawtooth', 0.12); },
  trugbild: () => { tone(900, 1500, 0.3, 'sine', 0.12); tone(1200, 1800, 0.3, 'sine', 0.08, 0.08); },
  bodengrollen: () => { noise(1.4, 0.5, 160); tone(55, 40, 1.4, 'sawtooth', 0.2); },
  eiswurf: () => { noise(0.3, 0.4, 4500, 'highpass'); tone(160, 60, 0.3, 'sine', 0.4); },
  wurzelfluch: () => { tone(220, 110, 0.6, 'sawtooth', 0.1); tone(330, 165, 0.6, 'sine', 0.1, 0.1); },
  geroellfeld: () => { noise(0.8, 0.3, 240); tone(100, 70, 0.6, 'sine', 0.2); },
  wachkiste: () => { noise(0.4, 0.5, 500); tone(130, 40, 0.4, 'sine', 0.5); },
  sternenschlund: () => { tone(120, 50, 0.8, 'sine', 0.3); tone(600, 150, 0.7, 'triangle', 0.06); },
  shield: () => { tone(1400, 500, 0.12, 'triangle', 0.2); noise(0.08, 0.2, 5000, 'highpass'); },
  kraft: () => { tone(660, 1320, 0.18, 'sine', 0.12); },
  fuse: () => { noise(0.4, 0.1, 5000, 'highpass'); },
  buy: () => [784, 988, 1319].forEach((f, i) => tone(f, f, i === 2 ? 0.2 : 0.09, 'triangle', 0.14, i * 0.07)),
  chest: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.18, i * 0.08)),
  bless: () => [784, 1047, 1319].forEach((f, i) => tone(f, f, 0.3, 'sine', 0.12, i * 0.09)),
  flip: () => { noise(0.07, 0.2, 3200, 'bandpass'); tone(650, 1150, 0.09, 'triangle', 0.12); },
  charge: () => { tone(200, 900, 0.6, 'sawtooth', 0.07); noise(0.6, 0.05, 2400, 'bandpass'); },
  coin: () => { tone(1568, 1568, 0.07, 'sine', 0.14); tone(2093, 2093, 0.22, 'sine', 0.12, 0.06); },
  upgrade: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.14, i * 0.07)); tone(2093, 2093, 0.4, 'sine', 0.07, 0.3); },
};
const GAP = { hit: 0.06, shoot: 0.07, tower: 0.1, heavy: 0.08, heilquell: 1, pop: 0.08, aura: 0.2, launch: 0.1 };
const VARIED = new Set(['hit', 'shoot', 'tower', 'heavy', 'deploy', 'pop', 'scatter']);   // diese schwanken leicht in der Tonhöhe

// alt: Ersatzklang, falls es für name keinen eigenen gibt (etwa die Fähigkeiten der Heldenformen)
export function sfx(name, alt) {
  if (!SOUNDS[name]) name = alt;
  if (!ctx || !enabled || ctx.state !== 'running' || !SOUNDS[name]) return;
  const now = ctx.currentTime;
  if (now - (lastAt[name] || -1) < (GAP[name] || 0.02)) return;
  lastAt[name] = now;
  vary = VARIED.has(name) ? 0.94 + Math.random() * 0.12 : 1;
  try { SOUNDS[name](); } catch { /* egal */ }
  vary = 1;
}
