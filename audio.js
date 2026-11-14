// Klänge: alles wird im Browser erzeugt (Web Audio), es gibt keine Tondateien.
// Seit 2026-11-11: Ausgang über Tiefpass und Begrenzer (nichts klirrt, wenn viel zugleich klingt), Rechteck- und Sägezahn-Töne werden
// abgemildert, häufige Klänge (Treffer, Schüsse) schwanken leicht in der Tonhöhe, damit sie sich nicht abnutzen.
// Seit 2026-11-14 (Überarbeitung): Hall (ein erzeugter Raumklang, Anteil je Klang in WET), Lage im Raum (sfx(name, alt, { x }) –
// x ist die Feldspalte, links klingt links), neue Bausteine (Glocke, Schlag, Bläser, Windstoß) und eigene Klänge je Art:
// Aufstellen nach Gewicht (leicht, schwer, Schwarm, Flieger, Gebäude), Runenform und Held, Klinge, Biss, Wucht, Bogen, Magie,
// Wurf, Kanone, Sturz großer Truppen, Einsturz von Gebäuden, Krone, die letzten Sekunden, volle Kraft, Runenform auf der Hand.
// Welches Ereignis welchen Klang bekommt, entscheidet main.js (soundOf).
let ctx = null, master = null, verb = null, dest = null, enabled = true, noiseBuf = null, vary = 1;
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
      // Hall: ein kurzer, erzeugter Raumklang (Rauschen, das in gut einer Sekunde ausklingt) – gibt Einschlägen und Fanfaren Gewicht
      try {
        const len = Math.floor(ctx.sampleRate * 1.15), ir = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) { const b = ir.getChannelData(c); for (let i = 0; i < len; i++) b[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
        const conv = ctx.createConvolver(); conv.buffer = ir;
        const tame = ctx.createBiquadFilter(); tame.type = 'lowpass'; tame.frequency.value = 4200;
        verb = ctx.createGain(); verb.gain.value = 0.55;
        verb.connect(conv); conv.connect(tame); tame.connect(master);
      } catch { verb = null; }
      dest = master;
    }
    if (ctx.state !== 'running') ctx.resume();
  } catch { /* ohne Ton weiterspielen */ }
}

// ---- Bausteine -----------------------------------------------------------------------------------------------------
// o: { a: Anstieg in Sekunden, det: zweite, leicht verstimmte Stimme (Faktor), vib: [Hz, Tiefe in Hz] }
function tone(f0, f1, dur, type = 'sine', vol = 0.3, delay = 0, o = null) {
  const t = ctx.currentTime + delay, g = ctx.createGain();
  const hard = type === 'square' || type === 'sawtooth', a = (o && o.a) || (hard ? 0.012 : 0.006);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(hard ? vol * 0.8 : vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let into = g;
  if (hard) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.min(5200, Math.max(f0, f1) * 3.2); f.connect(g); into = f; }   // kantige Wellen abmildern
  for (const k of o && o.det ? [1, o.det] : [1]) {
    const osc = ctx.createOscillator();
    osc.type = type; osc.frequency.setValueAtTime(f0 * vary * k, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * vary * k), t + dur);
    if (o && o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1]; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.02); }
    osc.connect(into); osc.start(t); osc.stop(t + dur + 0.02);
  }
  g.connect(dest);
}
// f1: das Filter fährt in der Dauer dorthin (Windstoß, Zischen) · q: Güte des Filters
function noise(dur, vol = 0.3, freq = 1200, type = 'lowpass', delay = 0, f1 = 0, q = 0) {
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  if (q) f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5, dur + 0.02);
}
// Glocke: Grundton mit zwei unharmonischen Obertönen, die schneller verklingen
function bell(f, dur, vol = 0.12, delay = 0) { tone(f, f, dur, 'sine', vol, delay); tone(f * 2.76, f * 2.76, dur * 0.55, 'sine', vol * 0.32, delay); tone(f * 5.4, f * 5.4, dur * 0.22, 'sine', vol * 0.16, delay); }
// Schlag: tiefer Ton, der abfällt, mit einem kurzen Anschlag
function thud(f, dur, vol = 0.35, delay = 0) { tone(f, f * 0.42, dur, 'sine', vol, delay); noise(Math.min(0.05, dur * 0.4), vol * 0.3, f * 9, 'lowpass', delay); }
// Bläser: zwei leicht verstimmte Sägezahn-Stimmen mit weichem Anstieg
function brass(f, dur, vol = 0.14, delay = 0) { tone(f, f, dur, 'sawtooth', vol, delay, { a: 0.035, det: 1.006 }); tone(f * 2, f * 2, dur * 0.8, 'triangle', vol * 0.25, delay, { a: 0.05 }); }
// Windstoß: Rauschen, dessen Filter von f0 nach f1 fährt
function whoosh(dur, vol, f0, f1, delay = 0) { noise(dur, vol, f0, 'bandpass', delay, f1, 0.9); }
const arp = (list, step, fn) => list.forEach((f, i) => fn(f, i * step));

const SOUNDS = {
  // ---- Menü ----
  click: () => { tone(660, 880, 0.045, 'sine', 0.16); noise(0.012, 0.05, 5000, 'highpass'); },
  tab: () => tone(520, 640, 0.04, 'sine', 0.1),
  error: () => { tone(196, 147, 0.1, 'triangle', 0.18); tone(147, 110, 0.14, 'triangle', 0.16, 0.09); },
  kasse: () => { noise(0.05, 0.2, 6000, 'highpass'); bell(1319, 0.2, 0.14); bell(1976, 0.4, 0.14, 0.08); bell(2637, 0.45, 0.07, 0.1); },   // Kauf-Simulation
  buy: () => arp([784, 988, 1319], 0.07, (f, d) => tone(f, f, d > 0.1 ? 0.2 : 0.09, 'triangle', 0.14, d)),
  chest: () => { arp([392, 523, 659, 784, 1047], 0.08, (f, d) => tone(f, f, 0.2, 'triangle', 0.17, d)); bell(1568, 0.6, 0.06, 0.4); },
  coin: () => { bell(1568, 0.12, 0.12); bell(2093, 0.3, 0.1, 0.06); },
  flip: () => { whoosh(0.08, 0.2, 2200, 4200); tone(650, 1150, 0.09, 'triangle', 0.12); },
  upgrade: () => { arp([523, 659, 784, 1047], 0.07, (f, d) => tone(f, f, 0.18, 'triangle', 0.14, d)); bell(2093, 0.5, 0.07, 0.3); brass(262, 0.5, 0.06, 0.02); },
  rune: () => arp([660, 880, 1320, 1760], 0.05, (f, d) => bell(f, 0.3, 0.1, d)),

  // ---- Aufstellen: nach Gewicht der Karte ----
  deploy: () => { thud(190, 0.16, 0.34); noise(0.12, 0.1, 900, 'bandpass'); tone(420, 210, 0.06, 'triangle', 0.08); },
  deploy_leicht: () => { thud(270, 0.1, 0.22); noise(0.07, 0.08, 1600, 'bandpass'); },
  deploy_schwer: () => { thud(92, 0.36, 0.5); noise(0.3, 0.2, 260); tone(60, 36, 0.32, 'sine', 0.3, 0.03); noise(0.18, 0.08, 1200, 'bandpass', 0.05); },
  deploy_schwarm: () => [0, 0.05, 0.11].forEach(d => { thud(290, 0.07, 0.15, d); noise(0.04, 0.05, 2000, 'bandpass', d); }),
  deploy_luft: () => { whoosh(0.34, 0.3, 500, 2600); tone(300, 520, 0.22, 'sine', 0.1); },
  deploy_bau: () => { thud(150, 0.14, 0.34); noise(0.06, 0.2, 2400, 'bandpass'); tone(520, 470, 0.05, 'square', 0.05, 0.05); thud(118, 0.13, 0.22, 0.09); },
  rune_auf: () => { thud(78, 0.45, 0.42); arp([330, 494, 659, 988, 1319], 0.045, (f, d) => bell(f, 0.55, 0.09, 0.04 + d)); noise(0.5, 0.06, 6000, 'highpass', 0.05); },   // Runenform betritt das Feld
  held_auf: () => { thud(88, 0.32, 0.4); brass(392, 0.22, 0.15); brass(587, 0.45, 0.15, 0.15); bell(1175, 0.5, 0.05, 0.16); },                                          // Held betritt das Feld
  rune_bereit: () => { [[196, 294, 0], [262, 392, 0.13], [294, 440, 0.26]].forEach(([a, b, d]) => { brass(a, d > 0.2 ? 0.4 : 0.15, 0.1, d); brass(b, d > 0.2 ? 0.4 : 0.15, 0.08, d); }); bell(1760, 0.5, 0.05, 0.28); },   // die nächste Karte der Hand kommt in Runenform

  // ---- Angriff und Treffer ----
  hit: () => { noise(0.035, 0.1, 2600, 'bandpass'); tone(190, 110, 0.05, 'sine', 0.13); },
  klinge: () => { noise(0.07, 0.13, 5200, 'highpass', 0, 2400); tone(1900, 900, 0.05, 'triangle', 0.05); tone(2600, 2600, 0.07, 'sine', 0.025); },   // Schwert, Sichel
  biss: () => { noise(0.03, 0.1, 3200, 'bandpass'); tone(520, 300, 0.04, 'square', 0.05); },
  heavy: () => { thud(120, 0.2, 0.4); noise(0.1, 0.17, 420); tone(60, 40, 0.18, 'sine', 0.2); },
  wucht: () => { thud(84, 0.32, 0.5); noise(0.16, 0.2, 300); noise(0.08, 0.1, 2000, 'bandpass', 0.02); },                                           // Faustschlag eines Riesen
  shoot: () => { noise(0.05, 0.06, 3200, 'bandpass'); tone(980, 520, 0.05, 'sine', 0.06); },
  bogen: () => { tone(520, 180, 0.07, 'triangle', 0.1); noise(0.06, 0.06, 4200, 'highpass'); },                                                     // Sehne schnellt
  pfeil_treffer: () => { noise(0.03, 0.09, 2600, 'bandpass'); tone(240, 160, 0.04, 'sine', 0.1); },
  magie: () => { tone(880, 1500, 0.09, 'sine', 0.08); tone(1320, 2100, 0.09, 'sine', 0.04, 0.02); noise(0.06, 0.03, 6000, 'highpass'); },
  magie_treffer: () => { tone(1200, 400, 0.1, 'sine', 0.1); noise(0.07, 0.08, 3600, 'bandpass'); },
  wurf: () => { whoosh(0.16, 0.1, 400, 1200); tone(180, 120, 0.12, 'sine', 0.12); },                                                                // Stein, Fass
  kanone: () => { thud(108, 0.22, 0.45); noise(0.12, 0.3, 700); noise(0.25, 0.08, 2500, 'bandpass', 0.03); },
  tower: () => { tone(210, 120, 0.09, 'triangle', 0.1); noise(0.04, 0.05, 1400, 'bandpass'); },
  scatter: () => { noise(0.12, 0.4, 1800, 'bandpass'); tone(160, 60, 0.12, 'sine', 0.3); },
  hook: () => { tone(700, 200, 0.18, 'sawtooth', 0.1); noise(0.1, 0.15, 1200, 'bandpass', 0.1); },
  pulse: () => { thud(90, 0.35, 0.45); tone(400, 120, 0.25, 'triangle', 0.08); },
  charge: () => { tone(200, 900, 0.6, 'sawtooth', 0.07); whoosh(0.6, 0.06, 800, 3200); },
  shield: () => { bell(1400, 0.14, 0.14); noise(0.08, 0.18, 5000, 'highpass'); },
  fuse: () => { noise(0.4, 0.1, 5000, 'highpass'); },
  morph: () => { tone(300, 900, 0.18, 'triangle', 0.14); noise(0.12, 0.12, 2600, 'bandpass'); },
  aura: () => { noise(0.25, 0.05, 2400, 'bandpass'); tone(520, 420, 0.2, 'sine', 0.04); },                       // Funken-, Gift-, Frostfeld

  // ---- Fallen ----
  pop: () => { tone(260, 90, 0.09, 'sine', 0.13); noise(0.05, 0.05, 1800, 'bandpass'); },                         // eine kleine Truppe fällt
  sturz: () => { thud(100, 0.36, 0.4); noise(0.3, 0.2, 500); tone(300, 80, 0.25, 'triangle', 0.1); },            // eine große Truppe fällt
  einsturz: () => { noise(0.5, 0.3, 700); thud(120, 0.3, 0.35); [0.08, 0.17, 0.27].forEach(d => noise(0.06, 0.12, 2600, 'bandpass', d)); },   // ein Gebäude bricht zusammen
  rune_tod: () => { arp([1320, 988, 740, 494], 0.05, (f, d) => bell(f, 0.3, 0.07, d)); noise(0.3, 0.06, 5000, 'highpass'); },
  held_tod: () => { brass(294, 0.2, 0.12); brass(196, 0.45, 0.12, 0.16); },
  fall: () => { noise(1.0, 0.55, 400); tone(120, 30, 0.8, 'sawtooth', 0.3); thud(60, 0.9, 0.5); [0.25, 0.4, 0.58, 0.8].forEach(d => noise(0.07, 0.14, 2200, 'bandpass', d)); },   // ein Turm stürzt
  krone: () => { bell(1047, 0.5, 0.13); bell(1568, 0.6, 0.11, 0.09); bell(2093, 0.8, 0.08, 0.18); },             // die Krone des gefallenen Turms

  // ---- Spielverlauf ----
  launch: () => { whoosh(0.35, 0.16, 900, 2400); tone(260, 620, 0.3, 'sine', 0.1); },                              // Wurfzauber verlässt den Hauptturm
  cast: () => { tone(520, 980, 0.18, 'sine', 0.1); noise(0.1, 0.04, 5000, 'highpass'); },
  ability: () => { arp([523, 784, 1047], 0.06, (f, d) => bell(f, 0.3, 0.12, d)); noise(0.2, 0.06, 4000, 'highpass'); },   // Fähigkeit einer Heldenform
  kraft: () => { tone(660, 1320, 0.18, 'sine', 0.12); },
  voll: () => { bell(880, 0.3, 0.06); bell(1320, 0.4, 0.05, 0.07); },                                              // der Kraftvorrat ist voll
  bless: () => arp([784, 1047, 1319], 0.09, (f, d) => bell(f, 0.35, 0.1, d)),
  wake: () => { bell(660, 0.35, 0.12); bell(660, 0.35, 0.12, 0.18); thud(110, 0.3, 0.3); },                       // der Hauptturm erwacht, eine Welle beginnt
  horn: () => { brass(196, 0.55, 0.16); brass(294, 0.75, 0.15, 0.25); brass(147, 0.95, 0.09, 0.25); },
  tick: () => tone(1100, 1100, 0.035, 'sine', 0.1),
  tick_hoch: () => { tone(1480, 1480, 0.06, 'sine', 0.14); tone(740, 740, 0.09, 'sine', 0.08); },                 // die letzten drei Sekunden
  win: () => { arp([523, 659, 784, 1047], 0.13, (f, d) => { tone(f, f, 0.3, 'triangle', 0.22, d); brass(f / 2, 0.3, 0.07, d); }); bell(2093, 0.9, 0.07, 0.42); brass(262, 0.9, 0.08, 0.42); },
  lose: () => arp([392, 330, 262, 196], 0.18, (f, d) => { tone(f, f * 0.97, 0.35, 'triangle', 0.2, d); brass(f / 2, 0.35, 0.06, d); }),
  draw: () => [392, 392].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.2, i * 0.25)),

  // ---- Zauber (jeder klingt nach dem, was er tut) ----
  sternschlag: () => { thud(70, 0.6, 0.55); noise(0.6, 0.5, 600); noise(0.25, 0.2, 3200, 'bandpass', 0.02); [0.12, 0.2, 0.31].forEach(d => noise(0.05, 0.08, 2400, 'bandpass', d)); },
  hagelschauer: () => { noise(0.45, 0.3, 3500, 'highpass'); [0, 0.06, 0.12, 0.2, 0.27, 0.36].forEach(d => tone(2200, 1400, 0.03, 'sine', 0.04, d)); },
  wurzelgriff: () => { tone(150, 320, 0.25, 'sawtooth', 0.12); noise(0.2, 0.1, 900); },
  heilquell: () => { bell(660, 0.4, 0.14); bell(990, 0.5, 0.11, 0.1); },
  schlachtruf: () => { brass(220, 0.35, 0.15); brass(330, 0.5, 0.13, 0.18); },
  blitzkette: () => { noise(0.25, 0.4, 5000, 'highpass'); tone(1800, 200, 0.2, 'square', 0.12); thud(90, 0.3, 0.3, 0.05); },
  funkenschlag: () => { noise(0.15, 0.35, 5000, 'highpass'); tone(1500, 300, 0.12, 'square', 0.12); tone(3000, 900, 0.05, 'sine', 0.05); },
  sumpfdunst: () => { noise(0.6, 0.25, 300); tone(180, 120, 0.4, 'sine', 0.15, 0, { vib: [7, 12] }); tone(240, 160, 0.3, 'sine', 0.1, 0.2, { vib: [9, 14] }); },
  kriegstrommel: () => [0, 0.14, 0.28].forEach(d => { thud(120, 0.16, 0.45, d); noise(0.05, 0.15, 800, 'lowpass', d); }),
  frostnacht: () => { noise(0.5, 0.3, 6000, 'highpass'); bell(1800, 0.5, 0.09); bell(2400, 0.4, 0.06, 0.08); bell(3200, 0.3, 0.04, 0.15); },
  donnerkeil: () => { noise(0.5, 0.55, 3000, 'highpass'); tone(2000, 120, 0.25, 'square', 0.14); thud(80, 0.7, 0.5, 0.05); noise(0.9, 0.25, 220, 'lowpass', 0.1); },
  felssturz: () => { noise(0.7, 0.6, 450); thud(110, 0.7, 0.6); [0.15, 0.3, 0.5].forEach(d => noise(0.08, 0.14, 1800, 'bandpass', d)); },
  wichtwurf: () => { tone(300, 120, 0.15, 'triangle', 0.3); noise(0.12, 0.2, 900); },
  rollstein: () => { noise(0.9, 0.3, 260); tone(70, 55, 0.9, 'sawtooth', 0.12, 0, { vib: [11, 6] }); },
  wirbelwind: () => { whoosh(1.2, 0.25, 600, 2600); tone(300, 700, 1.0, 'sine', 0.06, 0, { vib: [6, 30] }); },
  schleier: () => { tone(900, 300, 0.35, 'sine', 0.14); noise(0.3, 0.12, 4000, 'highpass'); },
  wurzelheer: () => { tone(120, 260, 0.3, 'sawtooth', 0.14); noise(0.3, 0.18, 700); },
  sturmlauf: () => { whoosh(0.3, 0.3, 1400, 3600); tone(500, 1400, 0.25, 'triangle', 0.14); },
  seitenwechsel: () => { noise(0.35, 0.3, 300); tone(200, 60, 0.3, 'sawtooth', 0.14); },
  stillewacht: () => { bell(440, 0.6, 0.13); bell(660, 0.7, 0.08, 0.05); },
  leibwache: () => { brass(294, 0.2, 0.13); brass(392, 0.35, 0.11, 0.12); },
  hohlstamm: () => { noise(0.6, 0.3, 300); tone(90, 70, 0.6, 'sawtooth', 0.12); },
  trugbild: () => { bell(900, 0.35, 0.1); bell(1350, 0.35, 0.07, 0.08); },
  bodengrollen: () => { noise(1.4, 0.5, 160); tone(55, 40, 1.4, 'sawtooth', 0.2, 0, { vib: [14, 5] }); },
  eiswurf: () => { noise(0.3, 0.4, 4500, 'highpass'); thud(160, 0.3, 0.4); },
  wurzelfluch: () => { tone(220, 110, 0.6, 'sawtooth', 0.1); tone(330, 165, 0.6, 'sine', 0.1, 0.1); },
  geroellfeld: () => { noise(0.8, 0.3, 240); thud(100, 0.6, 0.2); },
  wachkiste: () => { noise(0.4, 0.5, 500); thud(130, 0.4, 0.5); },
  sternenschlund: () => { tone(120, 50, 0.8, 'sine', 0.3, 0, { vib: [5, 8] }); tone(600, 150, 0.7, 'triangle', 0.06); },
};
// Mindestabstand zwischen zwei gleichen Klängen (Sekunden)
const GAP = { hit: 0.06, klinge: 0.06, biss: 0.05, wucht: 0.1, shoot: 0.07, bogen: 0.07, magie: 0.07, wurf: 0.08, kanone: 0.1, pfeil_treffer: 0.06, magie_treffer: 0.06, tower: 0.1, heavy: 0.08,
  heilquell: 1, pop: 0.08, sturz: 0.1, einsturz: 0.15, aura: 0.2, launch: 0.1, deploy: 0.03, deploy_leicht: 0.03, deploy_schwarm: 0.05, voll: 2, rune_bereit: 1.5 };
// diese schwanken leicht in der Tonhöhe
const VARIED = new Set(['hit', 'klinge', 'biss', 'wucht', 'shoot', 'bogen', 'magie', 'wurf', 'kanone', 'pfeil_treffer', 'magie_treffer', 'tower', 'heavy', 'deploy', 'deploy_leicht', 'deploy_schwer', 'deploy_schwarm', 'deploy_luft', 'deploy_bau', 'pop', 'sturz', 'scatter']);
// Hallanteil je Klang (alles Übrige: ein Hauch)
const WET = { heavy: 0.2, wucht: 0.3, kanone: 0.3, deploy_schwer: 0.3, rune_auf: 0.45, held_auf: 0.4, rune_bereit: 0.3, sturz: 0.3, einsturz: 0.35, rune_tod: 0.4, held_tod: 0.35, fall: 0.55, krone: 0.4,
  horn: 0.4, wake: 0.3, win: 0.35, lose: 0.35, sternschlag: 0.45, felssturz: 0.5, donnerkeil: 0.55, frostnacht: 0.4, hagelschauer: 0.25, kriegstrommel: 0.3, bodengrollen: 0.4, blitzkette: 0.35, funkenschlag: 0.25,
  heilquell: 0.35, bless: 0.35, ability: 0.3, chest: 0.2, upgrade: 0.25, rune: 0.3, pulse: 0.3, wachkiste: 0.3, eiswurf: 0.25, sternenschlund: 0.45, stillewacht: 0.4 };
export const SOUND_NAMES = Object.keys(SOUNDS);

// Für Werkzeuge (tools/klang.mjs): rechnet einen Klang ohne Lautsprecher aus und meldet Spitze, mittlere Lautstärke und Dauer –
// so fällt auf, wenn ein Klang stumm bleibt, übersteuert oder beim Erzeugen scheitert. Ändert am laufenden Ton nichts.
export async function measure(name, seconds = 2.2) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC || !SOUNDS[name]) return null;
  const sr = 44100, off = new OAC(2, Math.floor(sr * seconds), sr), keep = [ctx, master, verb, dest, noiseBuf];
  let err = '';
  try {
    ctx = off; master = off.createGain(); master.connect(off.destination); verb = null; dest = master;
    noiseBuf = off.createBuffer(1, sr, sr);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    SOUNDS[name]();
  } catch (e) { err = String(e && e.message || e); }
  [ctx, master, verb, dest, noiseBuf] = keep;
  if (err) return { name, err };
  const buf = await off.startRendering(), ch = buf.getChannelData(0);
  let peak = 0, sum = 0, last = 0;
  for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v; sum += v * v; if (v > 0.003) last = i; }
  return { name, peak: Math.round(peak * 1000) / 1000, rms: Math.round(Math.sqrt(sum / Math.max(1, last)) * 1000) / 1000, dur: Math.round((last / sr) * 100) / 100 };
}

// alt: Ersatzklang, falls es für name keinen eigenen gibt (etwa die Fähigkeiten der Heldenformen)
// o.x: Feldspalte (0 bis 18), aus der der Klang kommt – er klingt dann von links oder rechts
export function sfx(name, alt, o) {
  if (!SOUNDS[name]) name = alt;
  if (!ctx || !enabled || ctx.state !== 'running' || !SOUNDS[name]) return;
  const now = ctx.currentTime;
  if (now - (lastAt[name] || -1) < (GAP[name] || 0.02)) return;
  lastAt[name] = now;
  vary = VARIED.has(name) ? 0.94 + Math.random() * 0.12 : 1;
  try {
    // je Klang ein eigener Bus: Lage im Raum und Hallanteil
    const bus = ctx.createGain();
    let out = bus;
    if (o && o.x != null && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-0.7, Math.min(0.7, ((o.x - 9) / 9) * 0.7)); bus.connect(p); out = p; }
    out.connect(master);
    const wet = WET[name] ?? 0.06;
    if (verb && wet > 0) { const w = ctx.createGain(); w.gain.value = wet; out.connect(w); w.connect(verb); }
    dest = bus;
    SOUNDS[name]();
  } catch { /* egal */ }
  dest = master;
  vary = 1;
}
