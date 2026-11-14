// Weitere Rezepte für alle übrigen Karten: Geschosse, Treffer, Ereignisse und Zauber. Ergänzt registry.js
// (dort stehen Aufbau und Erklärung); actors.js bindet diese Datei mit ein.
import { THREE } from './deps.js';
import { CELL } from './fx.js';
import { PROJECTILES, MELEE, HITS, EVENTS, SPELLS } from './registry.js';

const TAU = Math.PI * 2;
const orb = (color, glow, size = 0.16, y0 = 1.1, arc = 0.4, more = {}) => ({ kind: 'orb', y0, arc, size, color, glow, hit: 'magic', ...more });
const rock = (color, size, y0, arc, hit = 'stone', more = {}) => ({ kind: 'rock', y0, arc, size, color, hit, ...more });
const arrow = (y0, arc, scale = 1, hit = 'arrow') => ({ kind: 'arrow', y0, arc, scale, hit });

// ---- Geschosse (Schlüssel = Schütze). line: fliegt geradeaus durch alles hindurch (Bahn-Geschoss der Spielregeln)
Object.assign(PROJECTILES, {
  frostschamane: orb('#dff3ff', '#8fd0ff', 0.18, 1.5, 0.5), wurzelmutter: orb('#c8f5a8', '#7fd069', 0.16, 1.5, 0.5), sturmrufer: orb('#fffbd0', '#ffe45a', 0.17, 1.7, 0.3),
  blitzfaenger: orb('#fffbd0', '#ffe45a', 0.12, 1.0, 0.15), fluchweberin: orb('#f0d9ff', '#b06adf', 0.15, 1.3, 0.5), glutofen: orb('#ffd75a', '#ff8a2a', 0.2, 0.9, 0.5),
  rochen: orb('#e8e0ff', '#b39df0', 0.22, 1.7, 0.2), jungrochen: orb('#dffaf4', '#7fd9c8', 0.16, 1.6, 0.2), zitterling: orb('#fffbd0', '#8fe0ff', 0.11, 0.8, 0.25),
  aschenschwinge: orb('#ffd75a', '#ff8a2a', 0.13, 2.0, 0.1), aschenfunke: orb('#ffd75a', '#ff8a2a', 0.1, 1.4, 0.1), funkenpfahl: orb('#fffbd0', '#ffe45a', 0.15, 1.6, 0.1),
  ranke: orb('#c8f5a8', '#7fd069', 0.15, 1.2, 0.7), gewitterkarren: orb('#fffbd0', '#ffe45a', 0.32, 1.4, 0.3, { hit: 'thunder' }),
  schattenjaegerin: arrow(1.2, 0.4, 1.05), weitschuetzin: arrow(1.2, 1.3, 1.1), jungfuerst: arrow(0.95, 0.12, 0.75), blasrohrwicht: arrow(0.45, 0.3, 0.5, 'bite'), segelwicht: arrow(1.6, 0.1, 0.5, 'bite'),
  armbrustwagen: arrow(1.0, 0.15, 1.3), armbrustwagen_w: arrow(0.8, 0.15, 1.3), kurbelbogen: arrow(1.0, 0.35, 1.2),
  steinschleuder: rock('#a9afbc', 0.17, 1.3, 2.0), brockenwerfer: rock('#a9afbc', 0.3, 2.0, 1.6), steinwerferin: rock('#a9afbc', 0.1, 1.0, 0.9),
  fernschleuder: rock('#8d939c', 0.28, 1.9, 4.5, 'shell', { trail: 'smoke' }), kesselturm: rock('#2a2118', 0.22, 1.5, 1.8, 'shell', { trail: 'smoke' }),
  knallfrosch: rock('#b5482c', 0.15, 0.6, 0.8, 'bomb', { trail: 'fuse' }), pulverwicht: rock('#3a3f48', 0.15, 0.7, 1.6, 'bomb', { trail: 'fuse' }), glutbrocken: rock('#ff8a2a', 0.24, 2.2, 2.6, 'bomb', { trail: 'fuse' }),
  sternschuetzin: { kind: 'arrow', line: true, y0: 0.95, scale: 1.5, color: '#fffbd0', glow: '#fff27a', hit: 'magic' },
  kegler: { kind: 'rock', line: true, y0: 0.42, size: 0.42, color: '#7a8190', roll: true, trail: 'dust', hit: 'stone' },
  sichelwerfer: { kind: 'blade', line: true, y0: 0.95, scale: 1.3, hit: 'slash' },
  rollstein: { kind: 'log', line: true, y0: 0.45, color: '#8d939c', trail: 'dust', hit: 'stone' },
  hohlstamm: { kind: 'log', line: true, y0: 0.38, color: '#9a6634', k: 0.8, trail: 'dust', hit: 'stone' },
  knallfrosch_kern: { kind: 'fan', line: true, y0: 0.95, color: '#ffd75a', glow: '#ff8a2a', hit: 'spark' },
});

// ---- Nahkampf-Treffer je Angreifer
Object.assign(MELEE, {
  sturmbruder: 'slash', speerwache: 'slash', trommelschlaeger: 'punch', nebelschleicher: 'slash', feldheilerin: 'heal', muellerbursche: 'slam', wegelagerin: 'slash', falterhueterin: 'spark', seilwerfer: 'slash',
  fasstraeger: 'slam', erzritter: 'slam', splitterjaeger: 'arrow', marschall: 'slash', wurzelkoenig: 'slam', windlaeufer: 'slash', stollenmeister: 'slash', flussmoench: 'punch', leibwaechterin: 'slash',
  funkling: 'spark', tauling: 'heal', sprengkaefer: 'bomb', wuehler: 'slash', kraftkloss: 'punch', kraftkloss_m: 'punch', kraftkloss_k: 'bite', irrwisch: 'bite', wanderbusch: 'bite', buschwicht: 'slash', pulverwicht_k: 'bomb',
  steinling: 'slam', eisbrocken: 'slam', basaltriese: 'slam', astriese: 'slam', dornenkoloss: 'slam', runenhuene: 'slam', stelzenkessel: 'slam',
  keiler: 'bite', zwingerwolf: 'bite', hornbulle: 'slam', panzerbaer: 'slam', rankenreiterin: 'slam', nachtfalter: 'bite', panzerhornisse: 'bite', donnerkaefer: 'shell', flugsamen: 'bomb', glutfalke: 'spark', gewitterrochen: 'spark',
});

// ---- Treffer (d = Rezept des Geschosses, wenn es eines gab)
Object.assign(HITS, {
  // Zaubergeschoss: Schein und Funken in der Farbe des Geschosses
  magic(fx, ev, C, d) {
    const c = (d && d.color) || '#fff3c4', g = (d && d.glow) || c, k = Math.max(0.7, ((d && d.size) || 0.16) / 0.16), y = ev.air ? 1.6 : 0.8;
    fx.burst({ x: ev.x, y, z: ev.y, n: 1, cell: CELL.glow, color: c, hdr: 2.6, size: 1.2 * k, size2: 0.25, life: 0.18 });
    fx.burst({ x: ev.x, y, z: ev.y, n: Math.round(7 * k), cell: CELL.spark, color: '#ffffff', color2: g, hdr: 2.6, size: [0.08, 0.17], life: [0.22, 0.45], speed: [1.8, 4.5], up: [0.5, 3], gravity: -8, drag: 2.5 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.15, r: 0.7 * k, dur: 0.25, color: g, hdr: 1.7, width: 0.18 });
  },
  // Stein schlägt ein: Staub und Splitter, kein Feuer
  stone(fx, ev, C, d) {
    const k = Math.max(0.7, ((d && d.size) || 0.2) / 0.2);
    fx.burst({ x: ev.x, y: 0.6, z: ev.y, n: 1, cell: CELL.star, color: '#ffffff', hdr: 1.9, size: 0.6 * k, size2: 0.15, life: 0.1 });
    fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: Math.round(4 * k), cell: CELL.dust, add: 0, color: '#e9dfc8', alpha: 0.6, size: [0.3, 0.45], size2: [0.7, 1.0], life: [0.3, 0.5], speed: [0.5, 1.6], up: [0.3, 1], drag: 3, spread: 0.15 * k });
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: Math.round(5 * k), cell: CELL.shard, add: 0, color: '#b4bac6', size: [0.07, 0.14], life: [0.3, 0.55], speed: [1.5, 3.5], up: [1.5, 4], gravity: -15, spin: [5, 12], floor: true });
    if (k > 1.3) C.shake(0.12);
  },
  // heilender Schlag: grüner Schein, Lichtpunkte steigen
  heal(fx, ev) {
    fx.burst({ x: ev.x, y: 0.8, z: ev.y, n: 1, cell: CELL.glow, color: '#9dffbc', hdr: 2, size: 1.1, size2: 0.3, life: 0.2 });
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 6, cell: CELL.diamond, color: '#e6ffee', color2: '#7dffa8', hdr: 2, size: [0.09, 0.15], size2: 0.02, life: [0.5, 0.9], speed: [0.2, 0.8], up: [1, 2.2], drag: 1, spin: [1, 3], spread: 0.3 });
  },
  // Einschlag des Gewitterkarrens: Blitz vom Himmel, weiter gelber Stoß
  thunder(fx, ev, C) {
    zap(fx, ev.x, ev.y);
    fx.burst({ x: ev.x, y: 0.7, z: ev.y, n: 1, cell: CELL.glow, color: '#fff9b0', hdr: 3, size: 2.6, size2: 0.6, life: 0.22 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: 1.9, dur: 0.35, color: '#fff27a', hdr: 2.2, width: 0.14 });
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 16, cell: CELL.spark, color: '#ffffff', color2: '#ffe45a', hdr: 3, size: [0.1, 0.22], life: [0.3, 0.6], speed: [3, 7], up: [1.5, 5], gravity: -13, drag: 1.6, floor: true });
    fx.decal({ x: ev.x, z: ev.y, r: 0.9, dur: 5, strength: 0.5 }); C.shake(0.4); C.flash(0.08);
  },
});

// Gezackter Blitz vom Himmel (oder zwischen zwei Punkten)
function zap(fx, x, z, color = '#fff9b0', top = 9) { link(fx, [x + (Math.random() - 0.5) * 1.6, top, z + (Math.random() - 0.5) * 0.8], [x, 0.15, z], color, 5, 0.5); }
function link(fx, a, b, color = '#fff9b0', n = 4, jit = 0.45, w = 0.06, dur = 0.24) {
  let p = a;
  for (let i = 1; i <= n; i++) { const k = i / n, j = i < n ? jit : 0, q = [a[0] + (b[0] - a[0]) * k + (Math.random() - 0.5) * j, a[1] + (b[1] - a[1]) * k + (Math.random() - 0.5) * j * 0.7, a[2] + (b[2] - a[2]) * k + (Math.random() - 0.5) * j];
    fx.beam({ from: p, to: q, color, hdr: 2.0, width: w, dur }); fx.beam({ from: p, to: q, color: '#ffffff', hdr: 2.4, width: w * 0.36, dur: dur * 0.75 }); p = q; }
}
const lump = (r, color, hdr = 1) => () => new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), hdr > 1 ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(hdr) }) : new THREE.MeshLambertMaterial({ color, flatShading: true }));
const crate = (s, color) => () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshLambertMaterial({ color })), b = new THREE.Mesh(new THREE.BoxGeometry(s * 1.06, s * 0.16, s * 1.06), new THREE.MeshLambertMaterial({ color: '#6a4424' })); g.add(m, b); return g; };
const keg = (r, color) => () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, r * 2, 10), new THREE.MeshLambertMaterial({ color })); m.geometry.scale(1, 1, 1); return m; };
// wiederholt fn alle step Sekunden, dur Sekunden lang
const every = (fx, dur, step, fn) => { for (let i = 0, n = Math.max(1, Math.round(dur / step)); i < n; i++) fx.after(i * step, () => fn(i, n)); };
const around = (x, z, r) => { const a = Math.random() * TAU, q = Math.sqrt(Math.random()) * r; return [x + Math.cos(a) * q, z + Math.sin(a) * q]; };

// ---- Ereignisse der Spielregeln
Object.assign(EVENTS, {
  // Karte gespielt – auch Helden (Gold), Runenformen (Violett, mit Lichtsäule) und der Widerhall (weiße Doppelringe)
  deploy(fx, ev, C) {
    const col = ev.rune ? '#c98bff' : ev.hero ? '#ffd45a' : C.team.light, big = ev.hero || ev.rune;
    fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: big ? 2.0 : 1.35, dur: 0.45, color: col, hdr: 1.8, width: 0.16 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.1, r: 0.9, dur: 0.3, color: '#ffffff', hdr: 1.4, width: 0.3 });
    if (big) { fx.beam({ from: [ev.x, 8, ev.y], to: [ev.x, 0, ev.y], color: col, hdr: 1.6, width: 0.7, dur: 0.6 });
      fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 10, cell: CELL.diamond, color: '#ffffff', color2: col, hdr: 2.4, size: [0.1, 0.18], size2: 0.02, life: [0.6, 1.1], speed: [0.2, 1], up: [1.5, 3.5], drag: 1, spin: [1, 4], spread: 0.6 }); }
    if (ev.echo) { fx.ring({ x: ev.x, z: ev.y, r0: 0.4, r: 1.7, dur: 0.55, color: '#e9edf2', hdr: 1.5, width: 0.1 }); fx.ring({ x: ev.x, z: ev.y, r0: 0.4, r: 2.3, dur: 0.7, color: '#e9edf2', hdr: 1.3, width: 0.08, delay: 0.08 }); }
  },
  // etwas platzt (Todesschaden, Selbstzünder, Schildbruch): Feuerball über die Fläche – oder Frost
  burst(fx, ev, C) {
    const r = ev.r || 1.5, c = ev.frost ? '#dff3ff' : '#ffd9a0', c2 = ev.frost ? '#8fd0ff' : '#ff5a2a';
    fx.burst({ x: ev.x, y: 0.6, z: ev.y, n: 1, cell: CELL.glow, color: c, hdr: ev.frost ? 1.7 : 3, alpha: ev.frost ? 0.85 : 1, size: r * 1.8, size2: r * 0.6, life: 0.22 });
    fx.ring({ x: ev.x, z: ev.y, r0: r * 0.25, r: r * 1.05, dur: ev.big ? 0.45 : 0.32, color: ev.frost ? '#ffffff' : '#ffd27a', hdr: 2, width: 0.16 });
    if (ev.frost) fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 14, cell: CELL.shard, add: 0, color: '#f2fbff', color2: '#bfe6ff', size: [0.08, 0.16], life: [0.35, 0.65], speed: [2, 5], up: [1.5, 4], gravity: -14, spin: [6, 14], floor: true });
    else fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: Math.round(10 + r * 4), cell: CELL.spark, color: '#fff1b8', color2: c2, hdr: 2.8, size: [0.09, 0.22], life: [0.3, 0.6], speed: [2, 6], up: [1.5, 5], gravity: -13, drag: 1.5, floor: true });
    fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 6, cell: CELL.smoke, add: 0, color: ev.frost ? '#eaf6ff' : '#e6ddd0', color2: ev.frost ? '#cfe6f5' : '#7d7f8c', alpha: 0.7, size: [0.4, 0.6], size2: [0.9, 1.3], life: [0.45, 0.85], speed: [0.5, 1.6], up: [0.5, 1.8], drag: 2.5, spin: [0.4, 1.5], spread: r * 0.35 });
    if (!ev.frost) fx.decal({ x: ev.x, z: ev.y, r: r * 0.7, dur: 5, strength: 0.45 });
    C.shake(ev.big ? 0.35 : 0.16);
  },
  shield(fx, ev) {
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 0.95, dur: 0.3, color: '#dff3ff', hdr: 1.9, width: 0.14 });
    fx.burst({ x: ev.x, y: 0.8, z: ev.y, n: 7, cell: CELL.shard, add: 0, color: '#eaf6ff', color2: '#bfe6ff', size: [0.08, 0.15], life: [0.3, 0.5], speed: [1.5, 3.5], up: [1, 3], gravity: -13, spin: [6, 14] });
  },
  // Kraft entsteht: ein Tropfen steigt auf
  kraft(fx, ev) {
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.1, dur: 0.4, color: '#58c7f3', hdr: 1.7, width: 0.14 });
    fx.burst({ x: ev.x, y: 1.0, z: ev.y, n: 1, cell: CELL.diamond, color: '#dff6ff', color2: '#58c7f3', hdr: 2.6, size: 0.36, size2: 0.12, life: 0.9, up: 1.6, drag: 0.6 });
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 5, cell: CELL.star, color: '#bfeeff', hdr: 2, size: [0.1, 0.16], size2: 0.02, life: [0.4, 0.7], speed: [0.3, 1], up: [0.8, 1.8], drag: 1.2, spin: [2, 5], spread: 0.25 });
  },
  // Lunte brennt (ev.delay Sekunden bis zum Knall): roter Warnkreis, Funken sprühen
  fuse(fx, ev) {
    fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: ev.delay, color: '#ff7a4a', hdr: 1.4, fill: 0.3 });
    every(fx, ev.delay, 0.08, () => fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 2, cell: CELL.spark, color: '#fff1b8', color2: '#ff8a2a', hdr: 2.8, size: [0.07, 0.14], life: [0.15, 0.3], speed: [0.5, 1.6], up: [1, 2.4], gravity: -7 }));
  },
  // Blitz springt von Ziel zu Ziel
  chain(fx, ev) {
    let from = [ev.x, ev.air ? 1.9 : 0.9, ev.y];
    for (const h of ev.hits) { const to = [h.x, h.air ? 1.5 : 0.6, h.y]; link(fx, from, to, '#fff9b0', 3, 0.35, 0.05, 0.22);
      fx.burst({ x: to[0], y: to[1], z: to[2], n: 1, cell: CELL.glow, color: '#fff9b0', hdr: 2.4, size: 0.8, size2: 0.2, life: 0.16 });
      fx.burst({ x: to[0], y: to[1], z: to[2], n: 4, cell: CELL.spark, color: '#ffffff', color2: '#ffe45a', hdr: 2.8, size: [0.07, 0.14], life: [0.15, 0.3], speed: [1.5, 4], up: [0.5, 2.5], gravity: -10, drag: 2 }); from = to; }
  },
  // Splitterfächer (ev.ang = Richtung, ev.cone = Öffnung, ev.reach = Weite)
  scatter(fx, ev) {
    const y0 = ev.air ? 1.5 : 0.9, mx = ev.x + Math.cos(ev.ang) * 0.5, mz = ev.y + Math.sin(ev.ang) * 0.5;
    fx.burst({ x: mx, y: y0, z: mz, n: 1, cell: CELL.glow, color: '#ffe2a0', hdr: 3, size: 1.1, size2: 0.3, life: 0.1 });
    for (let i = 0; i < 9; i++) { const a = ev.ang + (i / 8 - 0.5) * ev.cone, L = ev.reach * (0.7 + (i % 3) * 0.14);
      fx.beam({ from: [mx, y0, mz], to: [ev.x + Math.cos(a) * L, 0.6, ev.y + Math.sin(a) * L], color: '#fff1b8', hdr: 1.6, width: 0.03, dur: 0.14 }); }
    fx.burst({ x: mx, y: y0, z: mz, n: 5, cell: CELL.smoke, add: 0, color: '#e6ddd0', alpha: 0.6, size: [0.25, 0.4], size2: [0.6, 0.9], life: [0.3, 0.5], dir: [Math.cos(ev.ang), 0.2, Math.sin(ev.ang)], cone: 0.5, speed: [1, 2.6], drag: 3 });
    for (const h of ev.hits) HITS.arrow(fx, { x: h.x, y: h.y });
  },
  hookcast(fx, ev) { fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: 1.0, dur: 0.5, color: '#e8dcc0', hdr: 1.4, width: 0.12 }); },
  // gespanntes Seil zwischen Werfer und Beute
  hook(fx, ev) {
    const a = [ev.x, 0.9, ev.y], b = [ev.tx, ev.air ? 1.5 : 0.7, ev.ty];
    fx.beam({ from: a, to: b, color: '#d8c7a0', hdr: 1.1, width: 0.05, dur: 0.4 });
    fx.burst({ x: b[0], y: b[1], z: b[2], n: 1, cell: CELL.star, color: '#ffffff', hdr: 2, size: 0.6, size2: 0.15, life: 0.12 });
    fx.burst({ x: ev.tx, y: 0.15, z: ev.ty, n: 5, cell: CELL.dust, add: 0, color: '#efe6cf', alpha: 0.55, size: [0.3, 0.4], size2: [0.7, 0.9], life: [0.3, 0.5], speed: [0.5, 1.4], up: [0.2, 0.6], drag: 3, spread: 0.3 });
  },
  morph(fx, ev) {
    const c = ev.building ? '#e9dfc8' : '#ffb347';
    fx.burst({ x: ev.x, y: 0.7, z: ev.y, n: 1, cell: CELL.glow, color: c, hdr: 2.2, size: 1.6, size2: 0.4, life: 0.2 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.25, dur: 0.4, color: ev.building ? '#ffffff' : '#ff8a2a', hdr: 1.8, width: 0.16 });
    fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 7, cell: CELL.smoke, add: 0, color: '#f4f1ea', color2: '#cfd3dc', alpha: 0.75, size: [0.4, 0.6], size2: [0.9, 1.2], life: [0.4, 0.7], speed: [0.5, 1.6], up: [0.4, 1.2], drag: 3, spread: 0.3 });
    if (ev.building) fx.debris({ x: ev.x, z: ev.y, n: 4, color: '#8a6a44', power: 0.5, size: 0.6 });
  },
  heal(fx, ev) { fx.burst({ x: ev.x + (Math.random() - 0.5) * 0.4, y: 0.7, z: ev.y, n: 2, cell: CELL.diamond, color: '#e6ffee', color2: '#7dffa8', hdr: 2, size: [0.1, 0.16], size2: 0.02, life: [0.5, 0.8], speed: [0.05, 0.3], up: [1.2, 2], drag: 0.8, spin: [1, 3], spread: 0.15 }); },
  curse(fx, ev) {
    fx.burst({ x: ev.x, y: 0.6, z: ev.y, n: 1, cell: CELL.glow, color: '#c98bff', hdr: 2, size: 1.3, size2: 0.3, life: 0.25 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.0, dur: 0.4, color: '#c98bff', hdr: 1.7, width: 0.16 });
    fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 8, cell: CELL.smoke, add: 0, color: '#c9a8f0', color2: '#6f58b0', alpha: 0.7, size: [0.35, 0.5], size2: [0.8, 1.1], life: [0.4, 0.75], speed: [0.4, 1.4], up: [0.6, 1.8], drag: 2.5, spread: 0.25 });
  },
  hatch(fx, ev, C) {
    fx.burst({ x: ev.x, y: 0.7, z: ev.y, n: 1, cell: CELL.glow, color: '#ffe2a0', hdr: 3, size: 2.0, size2: 0.5, life: 0.25 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.45, dur: 0.45, color: '#ffe08a', hdr: 2, width: 0.16 });
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 9, cell: CELL.shard, add: 0, color: '#f3ead2', size: [0.09, 0.16], life: [0.35, 0.65], speed: [1.5, 4], up: [2, 4.5], gravity: -14, spin: [6, 14], floor: true });
    fx.burst({ x: ev.x, y: 0.6, z: ev.y, n: 10, cell: CELL.spark, color: '#fff1b8', color2: '#ff8a2a', hdr: 2.8, size: [0.09, 0.2], life: [0.3, 0.6], speed: [1.5, 4.5], up: [1.5, 4.5], gravity: -9, drag: 1.5 });
  },
  // Runenhüne zeichnet einen Verbündeten: violetter Faden, Ring am Ziel
  rune(fx, ev) {
    link(fx, [ev.fx, 2.2, ev.fy], [ev.x, 1.0, ev.y], '#c98bff', 3, 0.25, 0.05, 0.4);
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.1, dur: 0.5, color: '#c98bff', hdr: 1.8, width: 0.14 });
  },
  ench(fx, ev) {
    const y = ev.air ? 1.5 : 0.7;
    fx.burst({ x: ev.x, y, z: ev.y, n: 1, cell: CELL.glow, color: '#e0c4ff', hdr: 2.6, size: 1.2, size2: 0.3, life: 0.16 });
    fx.burst({ x: ev.x, y, z: ev.y, n: 6, cell: CELL.diamond, color: '#ffffff', color2: '#c98bff', hdr: 2.4, size: [0.1, 0.17], size2: 0.02, life: [0.3, 0.55], speed: [1.5, 3.5], up: [0.5, 2.5], drag: 2, spin: [2, 6] });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.15, r: 0.9, dur: 0.28, color: '#c98bff', hdr: 1.8, width: 0.16 });
  },
  // etwas steigt aus dem Boden (Geröllfeld): Erde bricht auf
  rise(fx, ev) {
    fx.ring({ x: ev.x, z: ev.y, r0: 0.1, r: 0.6, dur: 0.3, color: '#e9dfc8', hdr: 1.3, width: 0.2 });
    fx.burst({ x: ev.x, y: 0.1, z: ev.y, n: 4, cell: CELL.dust, add: 0, color: '#d9cfae', alpha: 0.6, size: [0.3, 0.42], size2: [0.7, 0.9], life: [0.3, 0.5], speed: [0.4, 1.2], up: [0.3, 0.9], drag: 3, spread: 0.2 });
    fx.burst({ x: ev.x, y: 0.15, z: ev.y, n: 4, cell: CELL.shard, add: 0, color: '#8a6a43', size: [0.07, 0.12], life: [0.3, 0.5], speed: [0.8, 2], up: [2, 3.5], gravity: -14, spin: [5, 12] });
  },
  // Stoß einer Dauerzone (Sternenschlund): je weniger Ziele, desto härter
  pulse(fx, ev, C) {
    const one = ev.n <= 1, r = ev.r;
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 1, cell: CELL.glow, color: one ? '#f0d9ff' : '#b06adf', hdr: one ? 2.6 : 1.8, size: r * (one ? 1.9 : 1.4), size2: r * 0.5, life: 0.25 });
    fx.ring({ x: ev.x, z: ev.y, r0: r * 1.05, r: r * 0.2, dur: 0.35, color: '#c98bff', hdr: 2, width: 0.14 });
    fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 12, cell: CELL.star, color: '#ffffff', color2: '#b06adf', hdr: 2.4, size: [0.12, 0.22], size2: 0.02, life: [0.3, 0.6], speed: [0.5, 2], up: [1, 3], drag: 1.5, spin: [3, 8], spread: r * 0.7 });
    if (one) C.shake(0.2);
  },
  clone(fx, ev) {
    const y = ev.air ? 1.5 : 0.7;
    fx.burst({ x: ev.x + 0.35, y, z: ev.y, n: 1, cell: CELL.glow, color: '#bfeeff', hdr: 2, size: 1.3, size2: 0.4, life: 0.3 });
    fx.ring({ x: ev.x + 0.35, z: ev.y, r0: 0.2, r: 1.0, dur: 0.4, color: '#bfeeff', hdr: 1.7, width: 0.14 });
    fx.burst({ x: ev.x + 0.35, y, z: ev.y, n: 6, cell: CELL.diamond, color: '#ffffff', color2: '#8fe0ff', hdr: 2.2, size: [0.09, 0.15], size2: 0.02, life: [0.4, 0.7], speed: [0.3, 1.2], up: [0.8, 2], drag: 1, spin: [1, 4], spread: 0.3 });
  },
  // Segensturm stärkt eine Truppe: Lichtfaden vom Turm, goldener Schein
  bless(fx, ev) {
    fx.beam({ from: [ev.fx, 3.3, ev.fy], to: [ev.x, 1.0, ev.y], color: '#ffe08a', hdr: 2.2, width: 0.09, dur: 0.5 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.4, dur: 0.6, color: '#ffd45a', hdr: 1.8, width: 0.14 });
    fx.burst({ x: ev.x, y: 1.0, z: ev.y, n: 1, cell: CELL.glow, color: '#fff3c4', hdr: 2.2, size: 1.3, size2: 0.4, life: 0.4 });
    fx.burst({ x: ev.x, y: 0.6, z: ev.y, n: 7, cell: CELL.diamond, color: '#ffffff', color2: '#ffd45a', hdr: 2.4, size: [0.1, 0.17], size2: 0.02, life: [0.6, 1.0], speed: [0.1, 0.5], up: [1.2, 2.4], drag: 0.8, spin: [1, 3], spread: 0.35 });
  },
  // Heldenfähigkeit (ev.id): jede mit eigener Wirkung, sonst Blitze auf die Getroffenen
  ability(fx, ev, C) {
    const hits = ev.hits || [], gold = '#ffd45a';
    if (ev.id === 'schleier') { fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 10, cell: CELL.smoke, add: 0, color: '#c9a8f0', color2: '#6f58b0', alpha: 0.75, size: [0.5, 0.7], size2: [1.1, 1.5], life: [0.5, 0.9], speed: [0.4, 1.4], up: [0.3, 1.2], drag: 2.5, spread: 0.4 }); fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.4, dur: 0.4, color: '#c98bff', hdr: 1.7, width: 0.16 }); }
    else if (ev.id === 'wurzelheer') { fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: 2.4, dur: 0.5, color: '#a8e88a', hdr: 1.7, width: 0.16 }); for (const h of hits) EVENTS.rise(fx, h); }
    else if (ev.id === 'sturmlauf') { let from = [ev.x, 0.8, ev.y]; for (const h of hits) { const to = [h.x, h.air ? 1.5 : 0.8, h.y]; fx.beam({ from, to, color: '#dffaff', hdr: 2.2, width: 0.12, dur: 0.4 }); HITS.slash(fx, { x: h.x, y: h.y }); from = to; } C.shake(0.12); }
    else if (ev.id === 'seitenwechsel') { for (const h of [...hits, ev]) { EVENTS.rise(fx, h); fx.ring({ x: h.x, z: h.y, r0: 0.2, r: 1.3, dur: 0.45, color: h === ev ? gold : '#c9a878', hdr: 1.6, width: 0.16 }); } }
    else if (ev.id === 'stillewacht') { fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.5, dur: 0.6, color: '#ffffff', hdr: 1.9, width: 0.12 }); fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.0, dur: 0.45, color: '#8fe0ff', hdr: 1.7, width: 0.2 }); fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 1, cell: CELL.glow, color: '#dff3ff', hdr: 1.8, size: 1.6, size2: 0.6, life: 0.4 }); }
    else if (ev.id === 'leibwache') { for (const h of hits) EVENTS.deploy(fx, { x: h.x, y: h.y, hero: true }, C); }
    else if (ev.id === 'schlachtruf') { fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: ev.r, dur: 0.6, color: gold, hdr: 1.9, width: 0.14 }); fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: ev.r * 0.6, dur: 0.45, color: '#fff3c4', hdr: 1.6, width: 0.25 }); for (const h of hits) fx.burst({ x: h.x, y: 1.2, z: h.y, n: 4, cell: CELL.diamond, color: '#ffffff', color2: gold, hdr: 2.4, size: [0.1, 0.17], size2: 0.02, life: [0.5, 0.9], up: [1.2, 2.2], drag: 0.8, spin: [1, 3], spread: 0.25 }); }
    else {
      if (ev.id === 'schildruf' || !hits.length) { fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: ev.id === 'schildruf' ? 6.5 : 1.8, dur: 0.55, color: gold, hdr: 1.9, width: 0.16 }); fx.burst({ x: ev.x, y: 1.1, z: ev.y, n: 6, cell: CELL.diamond, color: '#ffffff', color2: gold, hdr: 2.4, size: [0.1, 0.17], size2: 0.02, life: [0.5, 0.9], up: [1.2, 2.2], drag: 0.8, spin: [1, 3], spread: 0.3 }); }   // Heldenformen ohne Ziel: goldener Ring am Helden
      for (const h of hits) { link(fx, [ev.x, 1.9, ev.y], [h.x, h.air ? 1.5 : 0.5, h.y], '#fff9b0', 3, 0.35, 0.05, 0.28); HITS.magic(fx, { x: h.x, y: h.y, air: h.air }, C, { color: '#fffbd0', glow: '#ffe45a' }); } C.shake(0.12);
    }
  },
  // Fläche, die eine Einheit hinterlässt (Runenformen der zweiten Gruppe): Funken, Gift, Frost, Sog, Antrieb – Rand und zarte Füllung für die Dauer
  aura(fx, ev) {
    const col = { funken: '#ffb347', gift: '#b6e34a', frost: '#9fe3ff', sog: '#e8f1ff', wut: '#ff7a59' }[ev.kind] || '#ffffff', dur = Math.max(0.3, ev.dur || 0.4);
    fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur, color: col, hdr: 1.3, fill: 0.2 });
    fx.ring({ x: ev.x, z: ev.y, r0: ev.r * 0.4, r: ev.r, dur: Math.min(0.4, dur), color: col, hdr: 1.6, width: 0.12 });
  },
  // Banner der gefallenen Wichte (Heldenform): steht fünf Sekunden, solange lässt sich der Bannerruf auslösen
  banner(fx, ev) {
    fx.zone({ x: ev.x, z: ev.y, r: 0.8, dur: 5, color: '#ffd45a', hdr: 1.4, fill: 0.25 });
    fx.beam({ from: [ev.x, 0.05, ev.y], to: [ev.x, 2.3, ev.y], color: '#ffe08a', hdr: 2.2, width: 0.09, dur: 5 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.2, dur: 0.5, color: '#ffd45a', hdr: 1.8, width: 0.14 });
  },
});

// ---- Zauber
const stay = (fx, x, z, r, dur, color) => fx.ring({ x, z, r0: r * 0.985, r, dur, color, hdr: 1.2, width: 0.06, alpha: 0.9 });   // Rand, der stehen bleibt, solange die Zone wirkt
Object.assign(SPELLS, {
  // Sumpfdunst: giftgrüne Schwaden hängen acht Sekunden über der Fläche, Blasen steigen
  sumpfdunst: {
    cast(fx, ev) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: '#c5ee6a', hdr: 1.3, fill: 0.25 }); },
    impact(fx, ev) {
      const { x, y: z, r } = ev, dur = 8;
      fx.burst({ x, y: 0.5, z, n: 1, cell: CELL.glow, color: '#c5ee6a', hdr: 1.2, alpha: 0.6, size: r * 1.8, size2: r * 1.2, life: 0.5 });
      fx.ring({ x, z, r0: r * 0.2, r, dur: 0.45, color: '#e2f7a8', hdr: 1.6, width: 0.14 }); stay(fx, x, z, r, dur, '#a6d94a');
      fx.puddle({ x, z, r: r * 1.04, color: '#5fa01e', hdr: 1.0, alpha: 0.46, dur, hold: 0.88, body: 1 });   // die ganze Fläche steht giftgrün, solange der Dunst wirkt
      for (let k = 0; k < 10; k++) { const [px, pz] = around(x, z, r * 0.85); fx.burst({ x: px, y: 0.3, z: pz, n: 1, cell: CELL.smoke, add: 0, color: '#c5ee6a', color2: '#5d8a1e', alpha: 0.55, size: [0.7, 1.0], size2: [1.5, 2.1], life: [1.1, 1.7], speed: [0.2, 0.6], up: [0.3, 0.8], drag: 1.5, spin: [0.2, 0.8] }); }   // der erste Schwall
      every(fx, dur, 0.16, i => { const [px, pz] = around(x, z, r * 0.9);
        fx.burst({ x: px, y: 0.25, z: pz, n: 2, cell: CELL.smoke, add: 0, color: '#c5ee6a', color2: '#5d8a1e', alpha: 0.5, size: [0.6, 0.9], size2: [1.3, 1.9], life: [1.0, 1.6], speed: [0.1, 0.4], up: [0.2, 0.7], drag: 1.5, spin: [0.2, 0.8], spread: 0.6 });
        fx.burst({ x: px, y: 0.12, z: pz, n: 2, cell: CELL.ring, color: '#e9ffb0', hdr: 1.7, alpha: 0.9, size: [0.1, 0.2], size2: [0.26, 0.38], life: [0.45, 0.8], up: [0.5, 1.1], drag: 0.5, spread: 0.6 });
        if (i % 3 === 0) fx.burst({ x: px, y: 0.2, z: pz, n: 1, cell: CELL.glow, color: '#d8ff7a', color2: '#6fae24', hdr: 1.8, alpha: 0.7, size: [0.3, 0.45], size2: 0.05, life: [0.3, 0.5], up: [0.4, 0.9] }); });
    },
  },
  // Kriegstrommel: ein Schlag, zwei Wellen in Rosa-Violett – wer darin steht, wird schneller und glüht am Rand rosa
  // (die Farbe der Raserei wie im Vorbild; engine/sprites.js: uRim)
  kriegstrommel: {
    cast(fx, ev) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.12, ev.delay), color: '#ff7ad1', hdr: 1.4, fill: 0.22 }); },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev, dur = 4.5;
      fx.burst({ x, y: 0.6, z, n: 1, cell: CELL.glow, color: '#ff8fd8', hdr: 2.2, size: r * 1.7, size2: r * 0.8, life: 0.25 });
      fx.ring({ x, z, r0: r * 0.15, r: r * 1.05, dur: 0.35, color: '#ffd9f2', hdr: 2.2, width: 0.14 }); fx.ring({ x, z, r0: r * 0.1, r, dur: 0.55, color: '#ff4fb8', hdr: 1.7, width: 0.3, delay: 0.12 });
      stay(fx, x, z, r, dur, '#ff5cc0');
      fx.puddle({ x, z, r: r * 1.02, color: '#d04aa8', hdr: 1.0, alpha: 0.26, dur, hold: 0.85, body: 1 });
      fx.burst({ x, y: 0.3, z, n: 16, cell: CELL.diamond, color: '#ffe3f6', color2: '#ff4fb8', hdr: 2.2, size: [0.1, 0.18], size2: 0.02, life: [0.6, 1.1], speed: [0.1, 0.5], up: [1.2, 2.6], drag: 0.8, spin: [1, 4], spread: r * 0.85 });
      every(fx, dur, 0.22, () => { const [px, pz] = around(x, z, r * 0.9); fx.burst({ x: px, y: 0.15, z: pz, n: 1, cell: CELL.diamond, color: '#ffe3f6', color2: '#ff4fb8', hdr: 2, size: [0.08, 0.14], size2: 0.02, life: [0.6, 0.9], up: [1.0, 1.9], drag: 0.6, spin: [1, 3] }); });
      C.shake(0.3);
    },
  },
  // Wichtwurf: ein Fass fliegt im hohen Bogen heran und zerplatzt – heraus springen drei Wurzelwichte
  wichtwurf: {
    cast(fx, ev, C) {
      fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: ev.delay, color: C.team.light, hdr: 1.3, fill: 0.3 });
      const back = ev.side === 1 ? -9 : 9;
      fx.fall({ make: keg(0.34, '#9a6634'), dur: ev.delay, arc: ev.arc, from: ev.src || [ev.x, 9, ev.y + back], to: [ev.x, 0.4, ev.y] });
    },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev;
      fx.ring({ x, z, r0: r * 0.25, r: r * 1.1, dur: 0.35, color: '#ffffff', hdr: 1.8, width: 0.14 });
      fx.burst({ x, y: 0.4, z, n: 8, cell: CELL.dust, add: 0, color: '#efe6cf', alpha: 0.65, size: [0.4, 0.6], size2: [0.9, 1.3], life: [0.4, 0.7], speed: [0.8, 2.2], up: [0.3, 1], drag: 3, spread: r * 0.4 });
      fx.debris({ x, z, n: 8, color: '#8a5a2c', power: 0.75, size: 0.7 }); C.shake(0.2);
    },
  },
  // Rollstein und Hohlstamm: die Walze selbst ist ein Bahn-Geschoss; hier nur der Aufschlag am Start
  rollstein: {
    cast(fx, ev, C) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: C.team.light, hdr: 1.3, fill: 0.25 }); },
    impact(fx, ev, C) { EVENTS.impact(fx, { x: ev.x, y: ev.y, r: ev.r }, C); fx.debris({ x: ev.x, z: ev.y, n: 5, power: 0.6, size: 0.7 }); },
  },
  hohlstamm: {
    cast(fx, ev, C) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: C.team.light, hdr: 1.3, fill: 0.25 }); },
    impact(fx, ev, C) { EVENTS.impact(fx, { x: ev.x, y: ev.y, r: ev.r }, C); fx.debris({ x: ev.x, z: ev.y, n: 4, color: '#8a5a2c', power: 0.5, size: 0.6 }); },
  },
  // Wirbelwind: Ringe ziehen sich zur Mitte zusammen, Staub kreist – alles wird herangezogen
  wirbelwind: {
    cast(fx, ev) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.12, ev.delay), color: '#e6f6ff', hdr: 1.3, fill: 0.18 }); },
    impact(fx, ev) {
      const { x, y: z, r } = ev, dur = 1.1;
      every(fx, dur, 0.18, i => fx.ring({ x, z, r0: r, r: r * 0.12, dur: 0.5, color: '#e6f6ff', hdr: 1.6, width: 0.1, alpha: 0.8 }));
      // der Wirbel: je Schritt drei Staubfetzen auf verschiedenen Bahnen, die kreisend nach innen und oben gezogen werden
      every(fx, dur, 0.03, i => { for (let k = 0; k < 3; k++) { const a = i * 0.9 + k * 2.09, q = r * (0.15 + ((i * 3 + k * 5) % 9) / 10), px = x + Math.cos(a) * q, pz = z + Math.sin(a) * q;
        fx.burst({ x: px, y: 0.2 + ((i + k) % 6) * 0.42, z: pz, n: 1, cell: CELL.smoke, add: 0, color: k ? '#ffffff' : '#d9c8a8', color2: '#cfe6f5', alpha: 0.6, size: [0.35, 0.55], size2: [0.75, 1.1], life: [0.35, 0.6], dir: [-Math.sin(a) - Math.cos(a) * 0.55, 0.35, Math.cos(a) - Math.sin(a) * 0.55], cone: 0.15, speed: [3.2, 5], drag: 1.4 }); }
        const b = i * 1.7; fx.burst({ x: x + Math.cos(b) * r * 0.7, y: 0.5 + (i % 4) * 0.5, z: z + Math.sin(b) * r * 0.7, n: 1, cell: CELL.spark, color: '#ffffff', color2: '#bfe6ff', hdr: 2.2, size: [0.1, 0.18], life: [0.25, 0.4], dir: [-Math.sin(b), 0.2, Math.cos(b)], cone: 0.1, speed: [5, 7], drag: 1 }); });
      fx.beam({ from: [x, 0.1, z], to: [x, 4.2, z], color: '#e6f6ff', hdr: 1.1, width: 0.7, dur });
      fx.beam({ from: [x, 0.1, z], to: [x, 3.0, z], color: '#ffffff', hdr: 1.3, width: 0.25, dur });
      fx.puddle({ x, z, r: r * 0.9, color: '#cfe6f5', hdr: 1.0, alpha: 0.16, dur: dur * 1.3, hold: 0.6 });
    },
  },
  // Trugbild: kalter Spiegelschein; die Abbilder selbst meldet das Ereignis 'clone'
  trugbild: {
    cast(fx, ev) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: '#8fe0ff', hdr: 1.3, fill: 0.22 }); },
    impact(fx, ev) {
      const { x, y: z, r } = ev;
      fx.burst({ x, y: 0.6, z, n: 1, cell: CELL.glow, color: '#bfeeff', hdr: 1.5, alpha: 0.7, size: r * 1.8, size2: r * 1.1, life: 0.35 });
      fx.ring({ x, z, r0: r * 0.2, r, dur: 0.5, color: '#8fe0ff', hdr: 1.9, width: 0.12 }); fx.ring({ x, z, r0: r * 0.1, r: r * 0.6, dur: 0.4, color: '#ffffff', hdr: 1.6, width: 0.2 });
    },
  },
  // Bodengrollen: drei Sekunden bebt die Erde – Staub schießt hoch, Risse bleiben
  bodengrollen: {
    cast(fx, ev) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: '#d9b98a', hdr: 1.3, fill: 0.25 }); },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev, dur = 3;
      fx.ring({ x, z, r0: r * 0.2, r: r * 1.05, dur: 0.45, color: '#e9dfc8', hdr: 1.7, width: 0.16 }); stay(fx, x, z, r, dur, '#b08a5a');
      fx.decal({ x, z, r: r * 0.9, dur: 9, strength: 0.55 });
      for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.3, q = r * (0.35 + (k % 3) * 0.2); fx.decal({ x: x + Math.cos(a) * q, z: z + Math.sin(a) * q, r: r * (0.22 + (k % 2) * 0.1), dur: 9, strength: 0.9 }); }   // Risse: dunkle Stellen im Boden
      fx.puddle({ x, z, r: r * 1.02, color: '#6e5232', hdr: 1.0, alpha: 0.3, dur, hold: 0.8, body: 1 });
      every(fx, dur, 0.5, i => { const [px, pz] = around(x, z, r * 0.7); fx.debris({ x: px, z: pz, n: 3, color: '#8a6a43', power: 0.55, size: 0.6 }); fx.ring({ x: px, z: pz, r0: 0.15, r: 0.9, dur: 0.3, color: '#e9dfc8', hdr: 1.3, width: 0.12, alpha: 0.7 }); });
      every(fx, dur, 0.12, i => { const [px, pz] = around(x, z, r * 0.92);
        fx.burst({ x: px, y: 0.12, z: pz, n: 2, cell: CELL.dust, add: 0, color: '#d9c8a8', alpha: 0.6, size: [0.35, 0.5], size2: [0.8, 1.1], life: [0.3, 0.55], speed: [0.2, 0.8], up: [0.8, 1.8], drag: 3, spread: 0.2 });
        if (i % 2 === 0) fx.burst({ x: px, y: 0.15, z: pz, n: 2, cell: CELL.shard, add: 0, color: '#8a6a43', size: [0.07, 0.13], life: [0.3, 0.5], speed: [0.5, 1.5], up: [2, 3.6], gravity: -14, spin: [5, 12] });
        if (i % 4 === 0) C.shake(0.14); });
      C.shake(0.5);
    },
  },
  // Wurzelfluch: violetter Kreis, aus dem sechs Sekunden lang dunkle Schwaden steigen
  wurzelfluch: {
    cast(fx, ev) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: '#c98bff', hdr: 1.3, fill: 0.25 }); },
    impact(fx, ev) {
      const { x, y: z, r } = ev, dur = 6;
      fx.burst({ x, y: 0.5, z, n: 1, cell: CELL.glow, color: '#c98bff', hdr: 1.4, alpha: 0.65, size: r * 1.8, size2: r * 1.1, life: 0.45 });
      fx.ring({ x, z, r0: r * 0.2, r, dur: 0.45, color: '#e0c4ff', hdr: 1.7, width: 0.14 }); stay(fx, x, z, r, dur, '#9a5ae0');
      every(fx, dur, 0.3, () => { const [px, pz] = around(x, z, r * 0.9);
        fx.burst({ x: px, y: 0.2, z: pz, n: 2, cell: CELL.smoke, add: 0, color: '#c9a8f0', color2: '#5a3aa0', alpha: 0.5, size: [0.4, 0.6], size2: [0.9, 1.3], life: [0.8, 1.3], speed: [0.1, 0.4], up: [0.4, 1.0], drag: 1.2, spin: [0.2, 0.8], spread: 0.4 });
        fx.burst({ x: px, y: 0.3, z: pz, n: 1, cell: CELL.diamond, color: '#f0d9ff', color2: '#b06adf', hdr: 2, size: [0.09, 0.14], size2: 0.02, life: [0.7, 1.1], up: [0.9, 1.6], drag: 0.6, spin: [1, 3] }); });
    },
  },
  // Geröllfeld: neun Sekunden lang bricht der Boden auf und Kiesel steigen heraus (jeder meldet sich mit 'rise')
  geroellfeld: {
    cast(fx, ev) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: '#cdd2dc', hdr: 1.3, fill: 0.22 }); },
    impact(fx, ev) {
      const { x, y: z, r } = ev, dur = 9;
      fx.ring({ x, z, r0: r * 0.2, r, dur: 0.5, color: '#e6e9ee', hdr: 1.6, width: 0.14 }); stay(fx, x, z, r, dur, '#a9afbc');
      every(fx, dur, 0.5, () => { const [px, pz] = around(x, z, r * 0.9); fx.burst({ x: px, y: 0.12, z: pz, n: 2, cell: CELL.dust, add: 0, color: '#d9d2c2', alpha: 0.45, size: [0.3, 0.45], size2: [0.7, 1.0], life: [0.5, 0.8], speed: [0.1, 0.4], up: [0.2, 0.6], drag: 2, spread: 0.3 }); });
    },
  },
  // Widerhall: wiederholt die letzte Karte – die Wirkung zeigt deren eigenes Rezept (und der Doppelring beim Ausspielen)
  widerhall: { cast() {}, impact() {} },
  // Wachkiste: drei Sekunden Warnung, dann kracht eine Kiste vom Himmel – ein Wächter steigt heraus
  wachkiste: {
    cast(fx, ev, C) {
      fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: ev.delay, color: C.team.light, hdr: 1.3, fill: 0.3 });
      fx.ring({ x: ev.x, z: ev.y, r0: ev.r * 1.2, r: ev.r * 0.3, dur: ev.delay, color: '#1c1f26', hdr: 0.5, width: 0.9, alpha: 0.45 });
      fx.after(Math.max(0, ev.delay - 0.7), () => fx.fall({ make: crate(0.9, '#c9a35e'), dur: Math.min(0.7, ev.delay), from: [ev.x - 0.6, 16, ev.y - 0.4], to: [ev.x, 0.5, ev.y] }));
    },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev;
      fx.burst({ x, y: 0.7, z, n: 1, cell: CELL.glow, color: '#fff0d0', hdr: 2.6, size: r * 2.0, size2: r * 0.7, life: 0.22 });
      fx.ring({ x, z, r0: r * 0.25, r: r * 1.1, dur: 0.4, color: '#ffffff', hdr: 2.1, width: 0.14 });
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; fx.burst({ x: x + Math.cos(a) * r * 0.3, y: 0.2, z: z + Math.sin(a) * r * 0.3, n: 1, cell: CELL.dust, add: 0, color: '#e9dfc8', alpha: 0.7, size: [0.5, 0.75], size2: [1.2, 1.7], life: [0.5, 0.85], dir: [Math.cos(a), 0.14, Math.sin(a)], cone: 0.2, speed: [2.6, 4], drag: 3.5 }); }
      fx.debris({ x, z, n: 12, color: '#a67c3e', power: 1.0, size: 0.9 }); fx.decal({ x, z, r: r * 0.6, dur: 7, strength: 0.5 }); C.shake(0.6);
    },
  },
  // Sternenschlund: ein dunkler Schlund öffnet sich für vier Sekunden; Ringe stürzen hinein (die drei Stöße melden sich mit 'pulse')
  sternenschlund: {
    cast(fx, ev) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: '#b06adf', hdr: 1.3, fill: 0.3 }); },
    impact(fx, ev) {
      const { x, y: z, r } = ev, dur = 4;
      fx.burst({ x, y: 0.4, z, n: 1, cell: CELL.glow, color: '#7a4fd0', hdr: 1.4, alpha: 0.75, size: r * 1.9, size2: r * 1.4, life: 0.5 });
      stay(fx, x, z, r, dur, '#7a4fd0');
      fx.puddle({ x, z, r: r * 1.03, color: '#1e0d44', hdr: 1.0, alpha: 0.62, dur, hold: 0.85, body: 1 });   // der Schlund: dunkel violett, solange er wirkt
      fx.beam({ from: [x, 0.1, z], to: [x, 11, z], color: '#b78bff', hdr: 1.6, width: 0.34, dur: dur * 0.9 });
      fx.beam({ from: [x, 0.1, z], to: [x, 11, z], color: '#ffffff', hdr: 1.4, width: 0.1, dur: dur * 0.9 });
      every(fx, dur, 0.28, () => fx.ring({ x, z, r0: r, r: r * 0.08, dur: 0.6, color: '#b06adf', hdr: 1.5, width: 0.1, alpha: 0.7 }));
      every(fx, dur, 0.1, i => { const a = i * 1.3, px = x + Math.cos(a) * r * 0.9, pz = z + Math.sin(a) * r * 0.9;
        fx.burst({ x: px, y: 0.25, z: pz, n: 1, cell: CELL.star, color: '#f0d9ff', color2: '#7a4fd0', hdr: 2.2, size: [0.12, 0.2], size2: 0.02, life: [0.4, 0.6], dir: [-Math.cos(a), 0.1, -Math.sin(a)], cone: 0.1, speed: [r * 1.4, r * 1.9], drag: 0.5, spin: [3, 8] }); });
    },
  },
});
