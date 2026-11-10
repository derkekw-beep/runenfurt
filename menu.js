// Runenfurt – Bühne im Hauptmenü: die Figuren des gewählten Decks stehen vor der eigenen Arena, schauen sich um,
// schlendern ein paar Schritte und holen ab und zu aus. Gezeichnet wird auf einem kleinen 2D-Canvas.
//
// Die Figuren kommen aus der Engine (engine/assets/units): zuerst das kleine Kartenbild (<modell>_k.webp, liegt immer
// im Offline-Speicher), danach – wenn es nichts kostet – die echten Bewegungen aus der Bildfolge. Die großen
// Bildfolgen werden hier nie ungefragt über Mobilfunk geladen: nur wenn sie schon gespeichert sind (nach dem ersten
// Kampf mit der Karte), im WLAN oder am eigenen Rechner. Aus jeder Bildfolge werden nur die paar Bilder herausgelöst,
// die das Menü braucht (drei Blickrichtungen), in Teamfarbe eingefärbt und klein gehalten; das große Bild wird sofort
// wieder freigegeben.
//
// Sparsam: höchstens 30 Bilder je Sekunde, die Schleife steht still, solange das Menü nicht zu sehen ist
// (anderer Reiter, Kampf, Einblendung, Seite im Hintergrund). Bei „Bewegung reduzieren“ und Grafik „Niedrig“ steht das Bild.
import { CARDS, UNITS } from './cards.js';
import { TEAM, GROUND } from './render.js';
import { THEMES } from './scenery.js';
import { FLY } from './models3d.js';

const ASSETS = new URL('./engine/assets/', import.meta.url).href;
const TAU = Math.PI * 2;
const DIRS = [0, 2, 6];                      // Blick zur Kamera, nach rechts, nach links (von acht Richtungen der Bildfolge)
const WANT = { 0: ['idle', 'windup', 'strike'], 2: ['walk'], 6: ['walk'] };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const LIN = Float32Array.from({ length: 256 }, (_, i) => Math.pow(i / 255, 2.2));
const ENC = Uint8ClampedArray.from({ length: 1025 }, (_, i) => Math.round(255 * Math.pow(i / 1024, 1 / 2.2)));
const enc = v => ENC[Math.max(0, Math.min(1024, Math.round(v * 1024)))];

const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Bild fehlt: ' + src)); im.src = src; });
let standP = null;
const stand = () => (standP ||= fetch(ASSETS + 'units/stand.json').then(r => (r.ok ? r.json() : {})).catch(() => ({})));

// Dürfen die großen Bildfolgen geladen werden? Schon gespeichert, WLAN oder der eigene Rechner – sonst nicht.
async function mayLoad(urls) {
  const c = navigator.connection;
  const local = /^(localhost$|127\.|192\.168\.|10\.|\[::1\])/.test(location.hostname);
  if (!(c && c.saveData) && (local || (c && (c.type === 'wifi' || c.type === 'ethernet')))) return true;
  try { for (const u of urls) if (!(await caches.match(u, { ignoreSearch: true }))) return false; return true; } catch { return false; }
}

// Löst die Menü-Bilder einer Figur aus ihrer Bildfolge: { cv, ppu, h, anims: { idle: [[x, y, w, h, ox, oy] …] je Richtung } }
async function loadMoves(name) {
  const v = (await stand())[name], q = v ? '?v=' + v : '', base = `${ASSETS}units/${name}`;
  if (!(await mayLoad([`${base}.json${q}`, `${base}.webp${q}`, `${base}_m.webp${q}`]))) return null;
  const info = await (await fetch(`${base}.json${q}`)).json();
  if (!info || !info.frames) return null;
  const [img, msk] = await Promise.all([loadImg(`${base}.webp${q}`), loadImg(`${base}_m.webp${q}`)]);
  const list = [];
  for (const d of DIRS) for (const a of WANT[d]) { const A = info.anims[a]; if (!A) continue; for (let i = 0; i < A.n; i++) list.push({ d, a, i, f: info.frames[d * info.per + A.start + i] }); }
  // einfache Regalpackung
  const PADW = 1024; let x = 0, y = 0, rowH = 0;
  for (const it of list) { const [, , w, h] = it.f; if (x + w + 2 > PADW) { x = 0; y += rowH + 2; rowH = 0; } it.x = x; it.y = y; x += w + 2; rowH = Math.max(rowH, h); }
  const cv = document.createElement('canvas'); cv.width = PADW; cv.height = y + rowH + 2;
  const c = cv.getContext('2d', { willReadFrequently: true });
  const tmp = document.createElement('canvas'), tc = tmp.getContext('2d', { willReadFrequently: true });
  const main = hex(TEAM[0].main).map(n => LIN[n]), dark = hex(TEAM[0].dark).map(n => LIN[n]);
  const anims = {};
  for (const it of list) {
    const [fx, fy, w, h, ox, oy] = it.f;
    tmp.width = w * 2; tmp.height = h;
    tc.drawImage(img, fx, fy, w, h, 0, 0, w, h); tc.drawImage(msk, fx, fy, w, h, w, 0, w, h);
    const A = tc.getImageData(0, 0, w, h), M = tc.getImageData(w, 0, w, h), p = A.data, m = M.data;
    for (let k = 0; k < p.length; k += 4) { // Teamflächen sind neutral grau gerendert: Helligkeit mal Teamfarbe (wie im Kampf)
      if (!p[k + 3]) continue;
      const mr = m[k] / 255, mg = m[k + 1] / 255;
      if (mr < 0.004 && mg < 0.004) continue;
      for (let ch = 0; ch < 3; ch++) { let col = LIN[p[k + ch]]; const kk = col / 0.693; col += (kk * main[ch] - col) * mr; col += (kk * dark[ch] - col) * mg; p[k + ch] = enc(col); }
    }
    c.putImageData(A, it.x, it.y);
    ((anims[it.a] ||= {})[it.d] ||= [])[it.i] = [it.x, it.y, w, h, ox, oy];
  }
  img.src = ''; msk.src = '';
  if (!anims.idle || !anims.idle[0]) return null;
  return { cv, ppu: info.ppu, h: info.h, anims, flap: info.flap || 0 };
}

export function createStage(canvas) {
  const c = canvas.getContext('2d');
  const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let W = 0, H = 0, dpr = 1, quality = 'hoch', arena = 0, deckKey = '', actors = [], motes = [], bg = null;
  let running = false, raf = 0, last = 0, gen = 0, dirty = true;
  const stills = new Map(), moves = new Map(); // je Modell: Kartenbild und herausgelöste Bewegungen (null = nicht ladbar)
  let seed = 1; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const calm = () => reduce.matches || quality === 'niedrig';

  function resize() {
    const r = canvas.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, quality === 'hoch' ? 2 : quality === 'mittel' ? 1.5 : 1);
    if (!r.width || !r.height) return;
    if (r.width === W && r.height === H && d === dpr) return;
    W = r.width; H = r.height; dpr = d;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    bg = null; dirty = true;
  }

  // Bühne: Boden der eigenen Arena als flaches Oval, darüber ein Lichtschein
  function paintBg() {
    bg = document.createElement('canvas'); bg.width = canvas.width; bg.height = canvas.height;
    const b = bg.getContext('2d'); b.scale(dpr, dpr);
    const [g1, g2] = GROUND[arena] || GROUND[0], col = (g, a = 1) => `rgba(${g[0]},${g[1]},${g[2]},${a})`;
    const rx = Math.min(W * 0.49, unit() * 6.2), ry = Math.max(24, Math.min(H * 0.2, rx * 0.4)), cx = W / 2, cy = Math.min(H - ry - 10, H * 0.5 + ry * 1.2);
    const glow = b.createRadialGradient(cx, cy - ry, 10, cx, cy - ry, Math.max(W, H) * 0.6);
    glow.addColorStop(0, col(g2, 0.22)); glow.addColorStop(1, col(g2, 0));
    b.fillStyle = glow; b.fillRect(0, 0, W, H);
    b.fillStyle = 'rgba(4,12,18,.35)'; b.beginPath(); b.ellipse(cx, cy + ry * 0.16, rx * 1.02, ry * 1.04, 0, 0, TAU); b.fill();
    const gr = b.createLinearGradient(0, cy - ry, 0, cy + ry);
    gr.addColorStop(0, col(g1.map(v => v * 0.72))); gr.addColorStop(1, col(g2));
    b.fillStyle = gr; b.beginPath(); b.ellipse(cx, cy, rx, ry, 0, 0, TAU); b.fill();
    b.strokeStyle = 'rgba(255,255,255,.16)'; b.lineWidth = 2; b.beginPath(); b.ellipse(cx, cy, rx - 1, ry - 1, 0, Math.PI * 1.02, Math.PI * 1.98); b.stroke();
    b.save(); b.beginPath(); b.ellipse(cx, cy, rx, ry, 0, 0, TAU); b.clip(); // ein paar Tupfer und ein heller Pfad
    let s = 7 + arena * 13; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 26; i++) { b.fillStyle = i % 3 ? 'rgba(255,255,255,.07)' : 'rgba(0,30,20,.10)'; b.beginPath(); b.ellipse(cx + (r() * 2 - 1) * rx, cy + (r() * 2 - 1) * ry, 5 + r() * 12, 2 + r() * 4, 0, 0, TAU); b.fill(); }
    b.restore();
    return { cx, cy, rx, ry };
  }
  let geo = { cx: 0, cy: 0, rx: 1, ry: 1 }, place = () => [0, 0];
  const unit = () => Math.max(22, Math.min(80, H * 0.16, W * 0.115)); // Bildpunkte je Feld: Figuren wachsen mit der Bühne

  const modelOf = id => { const u = UNITS[CARDS[id].unit]; return u ? u.model || CARDS[id].unit : null; };
  function setDeck(ids, arenaIdx) {
    const key = ids.join() + '|' + arenaIdx;
    if (key === deckKey) return;
    deckKey = key; arena = arenaIdx; bg = null; dirty = true;
    const my = ++gen;
    seed = 12345 + arenaIdx;
    const list = [];
    for (const id of ids) {
      const card = CARDS[id]; if (!card || card.type === 'spell' || card.type === 'tower') continue;
      const u = UNITS[card.unit], model = modelOf(id);
      const n = u.building ? 1 : card.count >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) list.push({ model, building: !!u.building, fly: u.air ? FLY[model] || 1.5 : 0, big: u.r >= 0.7 || !!u.building });
    }
    // Plätze: Große und Gebäude hinten, Kleine vorn; von der Mitte nach außen
    const back = list.filter(a => a.big), front = list.filter(a => !a.big);
    while (front.length > back.length + 3) back.push(front.pop());
    const place = (row, y) => row.forEach((a, i) => { const k = row.length, t = k === 1 ? 0 : (i / (k - 1)) * 2 - 1; a.hx = t * Math.min(0.9, 0.24 * k); a.hy = y + (i % 2 ? 0.07 : -0.05); });
    place(back, 0.26); place(front, 0.74);
    actors = [...back, ...front].map((a, i) => ({ ...a, x: a.hx, y: a.hy, tx: a.hx, ty: a.hy, act: 'idle', t: rnd() * 3, wait: 1.5 + rnd() * 5 + i * 0.4, dir: 0, ph: rnd() * 4, hop: 0, hv: 0 }));
    motes = Array.from({ length: 12 }, () => ({ x: rnd(), y: rnd(), s: 0.5 + rnd(), p: rnd() * TAU }));
    // Kartenbilder sofort, Bewegungen danach eine Figur nach der anderen
    const models = [...new Set(actors.map(a => a.model))];
    for (const mdl of models) if (!stills.has(mdl)) { stills.set(mdl, null); loadImg(`${ASSETS}units/${mdl}_k.webp`).then(im => { stills.set(mdl, im); dirty = true; if (!running) draw(0); }).catch(() => {}); }
    (async () => {
      await new Promise(res => setTimeout(res, 900));
      for (const mdl of models) {
        if (my !== gen || quality === 'niedrig') return;
        while (!running && my === gen) await new Promise(res => setTimeout(res, 700)); // nur laden, solange das Menü zu sehen ist
        if (moves.has(mdl) || actors.find(a => a.model === mdl).building) continue;
        try { moves.set(mdl, await loadMoves(mdl)); } catch { moves.set(mdl, null); }
        dirty = true;
        await new Promise(res => setTimeout(res, 60));
      }
      for (const k of [...moves.keys()]) if (!models.includes(k)) moves.delete(k); // alte Decks freigeben
    })();
  }

  function step(dt) {
    for (const a of actors) {
      a.t += dt; a.ph += dt;
      a.hv -= dt * 26; a.hop = Math.max(0, a.hop + a.hv * dt); if (a.hop === 0) a.hv = 0;
      if (a.building) continue;
      if (a.act === 'walk') {
        const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy), v = 0.16 * dt;
        if (d <= v) { a.x = a.tx; a.y = a.ty; a.act = 'idle'; a.dir = 0; a.wait = 2.5 + rnd() * 6; }
        else { a.x += dx / d * v; a.y += dy / d * v; a.dir = dx > 0 ? 2 : 6; }
      } else if (a.act === 'strike') {
        if (a.t > 0.95) { a.act = 'idle'; a.wait = 3 + rnd() * 6; }
      } else if ((a.wait -= dt) <= 0) {
        if (rnd() < 0.55) { a.act = 'walk'; a.tx = Math.max(-0.95, Math.min(0.95, a.hx + (rnd() * 2 - 1) * 0.16)); a.ty = Math.max(0.12, Math.min(0.9, a.hy + (rnd() * 2 - 1) * 0.1)); }
        else { a.act = 'strike'; a.t = 0; }
      }
    }
    for (const m of motes) { m.y -= dt * 0.035 * m.s; m.p += dt; if (m.y < -0.05) { m.y = 1.05; m.x = rnd(); } }
  }

  function draw() {
    if (!W) return;
    if (!bg) geo = paintBg();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.drawImage(bg, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { cx, cy, rx, ry } = geo;
    const U = unit();
    // hinten schmal (zwischen den Knöpfen links und rechts), vorn über die ganze Breite
    const narrow = Math.max(36, W / 2 - 92), wide = rx * 0.82, span = y => narrow + (wide - narrow) * Math.max(0, Math.min(1, (y - 0.35) / 0.3));
    place = (a) => [cx + a.x * span(a.y), cy + (a.y * 2 - 1) * ry * 0.78];
    const order = [...actors].sort((p, q) => p.y - q.y);
    for (const a of order) {
      const k = 0.86 + 0.24 * a.y, [sx, sy] = place(a);
      const mv = a.building ? null : moves.get(a.model), still = stills.get(a.model);
      const lift = (a.fly ? a.fly * U * 0.5 + Math.sin(a.ph * 2.4) * 3 : 0) + a.hop * U;
      c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(sx, sy, U * 0.42 * k * (a.big ? 1.5 : 1), U * 0.15 * k * (a.big ? 1.5 : 1), 0, 0, TAU); c.fill();
      if (mv) {
        let anim = 'idle', dir = 0, f = 0;
        if (a.act === 'walk' && mv.anims.walk && mv.anims.walk[a.dir]) { anim = 'walk'; dir = a.dir; f = Math.floor(a.ph * 9) % mv.anims.walk[dir].length; }
        else if (a.act === 'strike' && mv.anims.windup && mv.anims.strike) {
          const q = a.t / 0.95;
          if (q < 0.45) { anim = 'windup'; f = Math.min(mv.anims.windup[0].length - 1, Math.floor(q / 0.45 * mv.anims.windup[0].length)); }
          else { anim = 'strike'; f = Math.min(mv.anims.strike[0].length - 1, Math.floor((q - 0.45) / 0.55 * mv.anims.strike[0].length)); }
        } else f = Math.floor(a.ph * (mv.flap ? mv.flap * 4 : 4.6)) % mv.anims.idle[0].length;
        const fr = mv.anims[anim][dir][f], s = U / mv.ppu * 0.8 * k;
        c.drawImage(mv.cv, fr[0], fr[1], fr[2], fr[3], sx + fr[4] * s, sy - lift - (fr[5] + fr[3]) * s, fr[2] * s, fr[3] * s);
      } else if (still) {
        // Kartenbild: atmet leicht, hüpft beim Ausholen; Größe aus dem Spielradius geschätzt
        const breathe = calm() ? 0 : Math.sin(a.ph * 2.2) * 0.012, hop = a.act === 'strike' ? Math.sin(Math.min(1, a.t / 0.5) * Math.PI) * U * 0.25 : a.act === 'walk' ? Math.abs(Math.sin(a.ph * 8)) * U * 0.07 : 0;
        const hgt = (a.building ? 1.9 : a.big ? 2.3 : 1.55) * U * k, s = hgt / still.height, w = still.width * s;
        c.drawImage(still, sx - w / 2, sy - lift - hop - hgt * (1 + breathe) + hgt * 0.06, w, hgt * (1 + breathe));
      }
    }
    const mote = (THEMES[arena] && THEMES[arena].motes && THEMES[arena].motes.color) || '#fff3c4';
    c.fillStyle = mote;
    for (const m of motes) { c.globalAlpha = 0.25 + 0.3 * Math.abs(Math.sin(m.p * 1.3)); c.beginPath(); c.arc(cx + (m.x * 2 - 1) * rx * 1.05 + Math.sin(m.p) * 6, H * (0.12 + m.y * 0.78), 1.3 * m.s, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
    dirty = false;
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 31) return; // höchstens rund 30 Bilder je Sekunde
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (calm()) { if (dirty) draw(); return; }
    step(dt); draw();
  }
  function start() { resize(); if (running) return; running = true; last = performance.now(); dirty = true; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  // Antippen: die nächste Figur hüpft und holt aus
  function poke(clientX, clientY) {
    if (calm()) return false;
    const r = canvas.getBoundingClientRect(), px = clientX - r.left, py = clientY - r.top;
    let best = null, bd = 70;
    for (const a of actors) { if (a.building) continue; const [sx, y0] = place(a), sy = y0 - 30, d = Math.hypot(px - sx, py - sy); if (d < bd) { bd = d; best = a; } }
    if (!best) return false;
    best.act = 'strike'; best.t = 0; best.hv = 5.5; best.hop = 0.01;
    return true;
  }
  return { setDeck, start, stop, resize, poke, setQuality(q) { quality = q; W = 0; resize(); dirty = true; if (!running) draw(); }, get running() { return running; }, get state() { return { actors: actors.length, moves: [...moves].filter(([, v]) => v).length, stills: [...stills].filter(([, v]) => v).length }; } };
}
