// Bodenbild einer Arena: wird einmal auf eine Zeichenfläche gemalt (Kacheln, Wege, Turmplätze, Ufer, Halme, Blumen,
// Verschattung an Mauern und Türmen) und liegt dann als Textur auf dem Feld. Alles Feste im begehbaren Bereich ist
// hier nur gemalt – so kann keine Figur darin stecken.
import { W, H, RIVER_TOP, RIVER_BOT, BRIDGES, BRIDGE_HALF, OUTER_Y, MAIN_Y, GROUND, LOOK, THEMES } from './deps.js';

const TAU = Math.PI * 2;
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const rgb = (c, k = 1, a = 1) => `rgba(${Math.round(Math.min(255, c[0] * k))},${Math.round(Math.min(255, c[1] * k))},${Math.round(Math.min(255, c[2] * k))},${a})`;

// Farben und Kleinteile je Arena: abgeleitet aus den vorhandenen Tabellen (GROUND, LOOK in render.js; THEMES in
// scenery.js). Eine neue Arena braucht dort ihre Einträge – der Rest ergibt sich hier.
const hex3 = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const toHex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export function groundTheme(i) {
  const g = GROUND[i] || GROUND[0], L = LOOK[i] || LOOK[0], T = THEMES[i] || THEMES[0];
  const avg = mix3(g[0], g[1], 0.5), lum = (avg[0] * 0.3 + avg[1] * 0.59 + avg[2] * 0.11) / 255;
  const pop = c => c.map(v => v * 1.03);                       // Rasen eine Spur kräftiger als in der flachen Fassung
  const tuft = (L.tuft.match(/\d+/g) || [40, 90, 50]).slice(0, 3).map(Number);
  const wall = hex3(T.wall[1]), shallow = hex3(L.river[1]);
  return {
    grass: [pop(g[0]), pop(g[1])], path: mix3(avg, [246, 208, 146], 0.85), sand: mix3(avg, [232, 200, 148], 0.82),
    plaza: mix3(wall, [200, 205, 216], 0.55), dots: L.dots, core: L.core, tuft, big: L.big || 1,
    water: { deep: L.river[0], shallow: L.river[1], foam: toHex(mix3(shallow, [255, 255, 255], 0.78)) }, bank: L.bank,
    outer: T.outer ? hex3(T.outer) : avg.map(v => v * 0.84), dark: lum < 0.5,
  };
}

export function towerSpots() {
  const out = [];
  for (const s of [0, 1]) {
    const my = y => (s === 0 ? H - y : y);
    out.push({ x: 3.5, y: my(OUTER_Y), r: 1.0, side: s }, { x: 14.5, y: my(OUTER_Y), r: 1.0, side: s }, { x: 9, y: my(MAIN_Y), r: 1.3, side: s, main: true });
  }
  return out;
}

export function paintGround(c, K, T) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  c.save(); c.scale(K, K);
  // 1 Rasen in zwei Tönen, je Kachel leicht verschieden, mit weicher Kante (wirkt wie gelegte Platten aus Gras)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = T.grass[y < H / 2 ? 0 : 1], k = ((x + y) % 2 ? 0.955 : 1.03) * (0.985 + hash(x, y) * 0.03);
    c.fillStyle = rgb(g, k); c.fillRect(x, y, 1.01, 1.01);
    const gr = c.createLinearGradient(x, y, x + 1, y + 1);
    gr.addColorStop(0, 'rgba(255,255,220,.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(20,60,40,.10)');
    c.fillStyle = gr; c.fillRect(x, y, 1, 1);
  }
  c.lineWidth = 0.035; c.strokeStyle = 'rgba(30,90,50,.13)';
  c.beginPath(); for (let x = 1; x < W; x++) { c.moveTo(x, 0); c.lineTo(x, H); } for (let y = 1; y < H; y++) { c.moveTo(0, y); c.lineTo(W, y); } c.stroke();
  // 2 große helle Flecken (Sonne), dunkle Ränder an den Mauern
  for (const cy of [H * 0.25, H * 0.75]) {
    const g = c.createRadialGradient(W / 2, cy, 1, W / 2, cy, 11);
    g.addColorStop(0, 'rgba(255,255,190,.16)'); g.addColorStop(1, 'rgba(255,255,190,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  const edge = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => { const g = c.createLinearGradient(gx0, gy0, gx1, gy1); g.addColorStop(0, 'rgba(18,50,60,.34)'); g.addColorStop(1, 'rgba(18,50,60,0)'); c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0); };
  edge(0, 0, 1.3, H, 0, 0, 1.3, 0); edge(W - 1.3, 0, W, H, W, 0, W - 1.3, 0); edge(0, 0, W, 1.4, 0, 0, 0, 1.4); edge(0, H - 1.0, W, H, 0, H, 0, H - 1.0);

  // 3 Wege: von den Außentürmen über die Brücken, im Bogen zum Hauptturm
  const spots = towerSpots();
  const pathLine = (w, style) => {
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = w; c.strokeStyle = style;
    for (const bx of BRIDGES) { c.beginPath(); c.moveTo(bx, OUTER_Y); c.lineTo(bx, H - OUTER_Y); c.stroke(); }
    for (const s of [0, 1]) {
      const my = y => (s === 0 ? H - y : y);
      c.beginPath(); c.moveTo(BRIDGES[0], my(OUTER_Y)); c.bezierCurveTo(BRIDGES[0], my(MAIN_Y - 0.4), 6, my(MAIN_Y), 9, my(MAIN_Y));
      c.bezierCurveTo(12, my(MAIN_Y), BRIDGES[1], my(MAIN_Y - 0.4), BRIDGES[1], my(OUTER_Y)); c.stroke();
    }
  };
  pathLine(2.5, 'rgba(60,90,40,.16)'); pathLine(2.25, rgb(T.path, 0.86)); pathLine(2.0, rgb(T.path, 1.0)); pathLine(1.3, rgb(T.path, 1.06, 0.6));
  for (let i = 0; i < 520; i++) {   // Kiesel und helle Sprenkel auf den Wegen
    const lane = i % 3, t = rnd();
    let x, y;
    if (lane < 2) { x = BRIDGES[lane] + (rnd() - 0.5) * 1.8; y = OUTER_Y + t * (H - 2 * OUTER_Y); }
    else { x = 3.5 + rnd() * 11; y = (rnd() < 0.5 ? MAIN_Y : H - MAIN_Y) + (rnd() - 0.5) * 1.2; }
    if (y > RIVER_TOP - 0.3 && y < RIVER_BOT + 0.3) continue;
    const r = 0.025 + rnd() * 0.05;
    c.fillStyle = rnd() < 0.5 ? rgb(T.path, 0.8, 0.7) : rgb(T.path, 1.14, 0.8);
    c.beginPath(); c.ellipse(x, y, r * 1.3, r, rnd() * 3, 0, TAU); c.fill();
  }

  // 4 Turmplätze: gepflasterte Scheibe, außen dunkler Rand, weicher Schatten um den Turmfuß
  for (const s of spots) {
    const R = s.r + 0.62;
    let g = c.createRadialGradient(s.x, s.y, R * 0.7, s.x, s.y, R + 0.45);
    g.addColorStop(0, 'rgba(30,60,50,.30)'); g.addColorStop(1, 'rgba(30,60,50,0)'); c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, R + 0.45, 0, TAU); c.fill();
    c.fillStyle = rgb(T.plaza, 0.72); c.beginPath(); c.arc(s.x, s.y, R + 0.05, 0, TAU); c.fill();
    const rings = s.main ? 3 : 2;
    for (let k = rings; k >= 1; k--) {
      const r1 = R * k / rings, r0 = R * (k - 1) / rings, n = Math.round(7 * k * (s.main ? 1.2 : 1));
      for (let i = 0; i < n; i++) {
        const a0 = (i + (k % 2) * 0.5) / n * TAU, a1 = a0 + TAU / n;
        c.fillStyle = rgb(T.plaza, 0.9 + hash(i + k * 31, Math.round(s.x * 7 + s.y)) * 0.18);
        c.beginPath(); c.arc(s.x, s.y, r1 - 0.03, a0 + 0.02 / r1, a1 - 0.02 / r1); c.arc(s.x, s.y, r0 + 0.03, a1 - 0.02 / Math.max(r0, 0.2), a0 + 0.02 / Math.max(r0, 0.2), true); c.closePath(); c.fill();
      }
    }
    g = c.createRadialGradient(s.x + 0.25, s.y - 0.2, s.r * 0.7, s.x + 0.25, s.y - 0.2, s.r + 0.75);
    g.addColorStop(0, 'rgba(24,30,56,.5)'); g.addColorStop(1, 'rgba(24,30,56,0)'); c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, R + 0.3, 0, TAU); c.fill();
  }

  // 5 Ufer: Sandstreifen mit Steinen, nasse dunkle Kante
  for (const [y0, dir] of [[RIVER_TOP, -1], [RIVER_BOT, 1]]) {
    const g = c.createLinearGradient(0, y0, 0, y0 + dir * 0.75);
    g.addColorStop(0, rgb(T.sand, 0.86)); g.addColorStop(0.45, rgb(T.sand, 1.02)); g.addColorStop(1, rgb(T.sand, 1.0, 0));
    c.fillStyle = g; c.fillRect(0, Math.min(y0, y0 + dir * 0.75), W, 0.75);
    c.fillStyle = 'rgba(40,50,60,.25)'; c.fillRect(0, dir < 0 ? y0 - 0.07 : y0, W, 0.07);
    for (let i = 0; i < 46; i++) {
      const x = rnd() * W, y = y0 + dir * (0.12 + rnd() * 0.42), r = 0.05 + rnd() * 0.1;
      if (BRIDGES.some(b => Math.abs(x - b) < BRIDGE_HALF + 0.25)) continue;
      c.fillStyle = 'rgba(40,50,60,.28)'; c.beginPath(); c.ellipse(x + 0.03, y + 0.03, r * 1.25, r, 0, 0, TAU); c.fill();
      c.fillStyle = rgb(T.plaza, 0.8 + rnd() * 0.3); c.beginPath(); c.ellipse(x, y, r * 1.25, r, rnd(), 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.3, r * 0.5, r * 0.3, 0, 0, TAU); c.fill();
    }
  }
  // Brückenauflagen: Weg läuft dunkler auf die Bohlen zu
  for (const bx of BRIDGES) for (const [y0, dir] of [[RIVER_TOP, -1], [RIVER_BOT, 1]]) {
    const g = c.createLinearGradient(0, y0, 0, y0 + dir * 0.9);
    g.addColorStop(0, 'rgba(60,40,24,.42)'); g.addColorStop(1, 'rgba(60,40,24,0)');
    c.fillStyle = g; c.fillRect(bx - BRIDGE_HALF - 0.15, Math.min(y0, y0 + dir * 0.9), BRIDGE_HALF * 2 + 0.3, 0.9);
  }

  // 6 Halme, Blumen, Kiesel im Gras (nicht auf Wegen und Plätzen)
  const free = (x, y) => !(y > RIVER_TOP - 0.8 && y < RIVER_BOT + 0.8) && !BRIDGES.some(b => Math.abs(x - b) < 1.35 && y > OUTER_Y && y < H - OUTER_Y)
    && !spots.some(s => Math.hypot(x - s.x, y - s.y) < s.r + 0.95) && !(Math.abs(y - MAIN_Y) < 0.9 || Math.abs(y - (H - MAIN_Y)) < 0.9) && !(Math.abs(y - MAIN_Y - 1.7) < 1.9 && Math.abs(x - 9) > 4.3 && Math.abs(x - 9) < 6.7) && !(Math.abs(y - (H - MAIN_Y) + 1.7) < 1.9 && Math.abs(x - 9) > 4.3 && Math.abs(x - 9) < 6.7);
  for (let i = 0; i < 620; i++) {
    const x = 0.3 + rnd() * (W - 0.6), y = 0.3 + rnd() * (H - 0.6), k = rnd();
    if (!free(x, y)) continue;
    if (k < 0.62) {   // Grasbüschel: drei Halme, dunkel, mit hellem Zwilling
      for (const [col, dx] of [[rgb(T.tuft, 1, 0.5), 0], [rgb(T.grass[0], 1.22, 0.5), 0.03]]) {
        c.strokeStyle = col; c.lineWidth = 0.035; c.lineCap = 'round'; c.beginPath();
        for (const a of [-0.5, 0, 0.5]) { c.moveTo(x + dx, y); c.quadraticCurveTo(x + dx + a * 0.08, y - 0.1, x + dx + a * 0.22, y - 0.17 - rnd() * 0.05); }
        c.stroke();
      }
    } else if (k < 0.86) { // Blume
      const col = T.dots[Math.floor(rnd() * T.dots.length)], r = (0.045 + rnd() * 0.03) * Math.min(1.8, T.big || 1);
      c.fillStyle = 'rgba(30,70,40,.25)'; c.beginPath(); c.arc(x + 0.02, y + 0.03, r * 1.5, 0, TAU); c.fill();
      c.fillStyle = col; for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; c.beginPath(); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.72, 0, TAU); c.fill(); }
      if (T.core) { c.fillStyle = T.core; c.beginPath(); c.arc(x, y, r * 0.55, 0, TAU); c.fill(); }
    } else {               // Kiesel
      const r = 0.05 + rnd() * 0.06;
      c.fillStyle = 'rgba(30,60,50,.3)'; c.beginPath(); c.ellipse(x + 0.03, y + 0.03, r * 1.3, r, 0, 0, TAU); c.fill();
      c.fillStyle = rgb(T.plaza, 0.95); c.beginPath(); c.ellipse(x, y, r * 1.3, r, rnd(), 0, TAU); c.fill();
    }
  }
  c.restore();
}

// Kleine Kachel für das Umland außerhalb des Felds (wird wiederholt)
export function paintOuter(c, size, T) {
  let seed = 777;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  c.fillStyle = rgb(T.outer); c.fillRect(0, 0, size, size);
  for (let i = 0; i < 160; i++) {
    const x = rnd() * size, y = rnd() * size, r = (0.04 + rnd() * 0.1) * size;
    c.fillStyle = rgb(T.outer, 0.9 + rnd() * 0.2, 0.25);
    for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) { c.beginPath(); c.ellipse(x + dx, y + dy, r, r * 0.7, rnd() * 3, 0, TAU); c.fill(); }
  }
  for (let i = 0; i < 70; i++) {
    const x = rnd() * size, y = rnd() * size;
    c.strokeStyle = rgb(T.tuft, 1, 0.45); c.lineWidth = size * 0.006; c.lineCap = 'round'; c.beginPath();
    for (const a of [-0.5, 0, 0.5]) { c.moveTo(x, y); c.lineTo(x + a * size * 0.02, y - size * 0.03); }
    c.stroke();
  }
}
