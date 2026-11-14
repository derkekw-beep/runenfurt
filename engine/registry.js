// Was wie aussieht: Geschosse je Schütze, Treffer, Einschläge und Zauber als kurze Rezepte aus den Bausteinen
// in fx.js. Neue Karte = neuer Eintrag hier; fehlt einer, greift ein Standard, der aus den Kartenwerten gebaut wird
// (Radius, Seite, Art) – es bleibt also nie etwas ohne Effekt.
//
// Ein Rezept bekommt (fx, ev, C): fx = Bausteine, ev = Ereignis der Spielregeln (x, y = Ort auf dem Feld, r = Radius,
// side = Seite), C = { team: Farben der Seite, shake(n), sfx(name) }. Auf dem Feld ist y die Tiefe: im Raum also z.
import { THREE } from './deps.js';
import { CELL } from './fx.js';

// ---- Geschosse: kind 'arrow' | 'orb' | 'rock' (leuchtet nicht) | 'blade' (kreisender Wurfstern); y0 = Abschusshöhe, arc = Bogenhöhe,
//      color 'team' = Farbe der Seite, trail 'smoke' | 'fuse' = Spur aus Rauch oder Funken statt Leuchten
export const PROJECTILES = {
  waldlaeufer: { kind: 'arrow', y0: 1.15, arc: 0.5, hit: 'arrow' },
  aussenturm: { kind: 'orb', y0: 3.1, arc: 0.25, size: 0.2, color: 'team', hit: 'orb' },
  hauptturm: { kind: 'orb', y0: 4.6, arc: 0.3, size: 0.26, color: 'team', hit: 'orb' },
  ballista: { kind: 'arrow', y0: 0.95, arc: 0.15, scale: 1.5, hit: 'arrow' },
  dornwerfer: { kind: 'arrow', y0: 0.45, arc: 0.35, scale: 0.55, hit: 'bite' },
  funkenweberin: { kind: 'orb', y0: 1.45, arc: 0.7, size: 0.2, color: '#ffd45a', glow: '#ffb347', hit: 'spark' },
  kraehe: { kind: 'orb', y0: 1.6, arc: 0.05, size: 0.09, color: '#dfe9ff', glow: '#8fb4ff', hit: 'bite' },   // die Krähen spucken aus kurzer Entfernung
  geschuetzturm: { kind: 'rock', y0: 3.0, arc: 1.1, size: 0.26, color: '#2a2d35', trail: 'smoke', hit: 'shell' },
  klingenturm: { kind: 'blade', y0: 2.9, arc: 0.25, hit: 'slash' },
  segensturm: { kind: 'orb', y0: 2.9, arc: 0.3, size: 0.19, color: '#ffe9a8', glow: '#ffb347', hit: 'spark' },
  bolzenschuetzin: { kind: 'arrow', y0: 1.0, arc: 0.12, scale: 0.9, hit: 'arrow' },
  zuendler: { kind: 'rock', y0: 1.3, arc: 1.5, size: 0.15, color: '#c2452c', trail: 'fuse', hit: 'bomb' },
  _: { kind: 'orb', y0: 1.0, arc: 0.4, size: 0.16, color: '#fff3c4', hit: 'orb' },
};
// ---- Nahkampf-Treffer je Angreifer (sonst 'punch')
export const MELEE = { raufbold: 'punch', steinhueter: 'slam', wicht: 'bite', raeuber: 'punch', wueterich: 'slash', eisenwaechter: 'slash', kiesel: 'bite',
  hammerschmied: 'slam', schildknappe: 'slash', torknacker: 'slam', klingentaenzerin: 'slash', stammlaeufer: 'slam', distelritter: 'slash' };   // Rundumschläge (ev.spin) nehmen stets HITS.spin

export const HITS = {
  punch(fx, ev, C) {
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 1, cell: CELL.star, color: '#ffffff', hdr: 2.2, size: [0.75, 0.9], size2: 0.2, life: 0.13, spin: 3 });
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 7, cell: CELL.spark, color: '#fff1b8', color2: '#ffb347', hdr: 2.4, size: [0.1, 0.2], life: [0.16, 0.3], speed: [2.5, 5.5], up: [0.5, 2.5], gravity: -9, drag: 3 });
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 3, cell: CELL.dust, add: 0, color: '#e9dfc8', alpha: 0.55, size: [0.25, 0.4], size2: [0.6, 0.8], life: [0.3, 0.45], speed: [0.4, 1.2], up: 0.5, drag: 3 });
  },
  // schwerer Schlag (Steinhüter): Staubwelle, Brocken, die Kamera wackelt
  slam(fx, ev, C) {
    fx.burst({ x: ev.x, y: 0.6, z: ev.y, n: 1, cell: CELL.star, color: '#ffffff', hdr: 2.4, size: [1.3, 1.5], size2: 0.3, life: 0.15, spin: 2 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: 1.7, dur: 0.32, color: '#fff3d6', hdr: 1.6, width: 0.2 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; fx.burst({ x: ev.x + Math.cos(a) * 0.3, y: 0.15, z: ev.y + Math.sin(a) * 0.3, n: 1, cell: CELL.dust, add: 0, color: '#e9dfc8', alpha: 0.6, size: [0.4, 0.55], size2: [0.9, 1.2], life: [0.4, 0.6], dir: [Math.cos(a), 0.15, Math.sin(a)], cone: 0.2, speed: [2, 3.2], drag: 4 }); }
    fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 8, cell: CELL.shard, add: 0, color: '#b4bac6', size: [0.1, 0.18], life: [0.4, 0.7], speed: [1.5, 4], up: [2.5, 5], gravity: -16, spin: [5, 12], floor: true });
    C.shake(0.3);
  },
  // Klinge (Schwert, Beil): heller Schnitt, Funken zur Seite
  slash(fx, ev) {
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 1, cell: CELL.spark, color: '#ffffff', hdr: 2.6, size: [1.3, 1.5], size2: 0.5, life: 0.12, rot: 0.6 + Math.random() * 1.2 });
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 6, cell: CELL.spark, color: '#ffffff', color2: '#cfd8e3', hdr: 2.2, size: [0.08, 0.16], life: [0.16, 0.3], speed: [2.5, 5.5], up: [0.5, 2.2], gravity: -9, drag: 3 });
  },
  // kleiner Biss oder Schnabelhieb (Wurzelwicht, Sturmkrähe)
  bite(fx, ev) {
    fx.burst({ x: ev.x, y: 0.8, z: ev.y, n: 1, cell: CELL.star, color: '#ffffff', hdr: 2, size: [0.42, 0.5], size2: 0.1, life: 0.1, spin: 3 });
    fx.burst({ x: ev.x, y: 0.8, z: ev.y, n: 3, cell: CELL.spark, color: '#fff1b8', color2: '#ffb347', hdr: 2.2, size: [0.07, 0.12], life: [0.14, 0.24], speed: [2, 4], up: [0.5, 2], gravity: -9, drag: 3 });
  },
  // Funkenball schlägt ein (Funkenweberin): gelber Blitz, Funkenregen
  spark(fx, ev) {
    fx.burst({ x: ev.x, y: 0.8, z: ev.y, n: 1, cell: CELL.glow, color: '#fff3a8', hdr: 3.2, size: 2.0, size2: 0.4, life: 0.2 });
    fx.burst({ x: ev.x, y: 0.7, z: ev.y, n: 14, cell: CELL.spark, color: '#ffffff', color2: '#ffb347', hdr: 2.8, size: [0.09, 0.2], life: [0.3, 0.6], speed: [2, 6], up: [1, 4.5], gravity: -11, drag: 2, floor: true });
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 6, cell: CELL.star, color: '#fff3a8', hdr: 2.4, size: [0.12, 0.2], size2: 0.02, life: [0.4, 0.7], speed: [0.6, 2], up: [1.5, 3.5], drag: 1.5, spin: [3, 8] });
  },
  arrow(fx, ev) {
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 1, cell: CELL.star, color: '#ffffff', hdr: 1.8, size: 0.5, size2: 0.12, life: 0.1 });
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 4, cell: CELL.shard, add: 0, color: '#d9b98a', size: [0.07, 0.12], life: [0.25, 0.4], speed: [1.5, 3.5], up: [1.5, 3.5], gravity: -14, spin: [6, 14] });
  },
  // Mörserkugel schlägt ein (Geschützturm): Feuerball, Druckring, Rauch, Brandfleck
  shell(fx, ev, C) {
    fx.burst({ x: ev.x, y: 0.7, z: ev.y, n: 1, cell: CELL.glow, color: '#ffe2a0', hdr: 3, size: 1.9, size2: 0.5, life: 0.2 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 1.3, dur: 0.3, color: '#ffd27a', hdr: 2, width: 0.2 });
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 12, cell: CELL.spark, color: '#fff1b8', color2: '#ff7a1a', hdr: 2.8, size: [0.1, 0.22], life: [0.3, 0.6], speed: [2.5, 6.5], up: [1.5, 5], gravity: -14, drag: 1.5, floor: true });
    fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 6, cell: CELL.smoke, add: 0, color: '#d9d4c8', color2: '#6f7380', alpha: 0.8, size: [0.4, 0.6], size2: [0.9, 1.3], life: [0.5, 0.9], speed: [0.6, 1.8], up: [0.6, 2], drag: 2.5, spin: [0.4, 1.5], spread: 0.3 });
    fx.decal({ x: ev.x, z: ev.y, r: 0.8, dur: 5, strength: 0.5 });
    C.shake(0.22);
  },
  // Bombe platzt (Zündler): Feuerball über die Fläche, Funken, Rauch
  bomb(fx, ev, C) {
    const r = ev.splash || 1.2;
    fx.burst({ x: ev.x, y: 0.6, z: ev.y, n: 1, cell: CELL.glow, color: '#ffd9a0', hdr: 3, size: r * 1.7, size2: r * 0.5, life: 0.2 });
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 1, cell: CELL.star, color: '#ffffff', hdr: 2.4, size: r * 1.2, size2: r * 0.3, life: 0.14, spin: 2 });
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 10, cell: CELL.spark, color: '#fff1b8', color2: '#ff5a2a', hdr: 2.8, size: [0.09, 0.2], life: [0.3, 0.55], speed: [2, 5.5], up: [1.5, 4.5], gravity: -13, drag: 1.5, floor: true });
    fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 5, cell: CELL.smoke, add: 0, color: '#e6ddd0', color2: '#7d7f8c', alpha: 0.75, size: [0.35, 0.5], size2: [0.8, 1.1], life: [0.4, 0.8], speed: [0.5, 1.5], up: [0.5, 1.8], drag: 2.5, spin: [0.4, 1.5], spread: r * 0.3 });
    C.shake(0.14);
  },
  // Rundumschlag (Klingentänzerin): heller Schnittkreis um die Figur (ev.spin = Radius)
  spin(fx, ev) {
    const r = ev.spin;
    fx.ring({ x: ev.x, z: ev.y, r0: r * 0.35, r, dur: 0.22, color: '#ffffff', hdr: 2.2, width: 0.1 });
    fx.ring({ x: ev.x, z: ev.y, r0: r * 0.2, r: r * 0.85, dur: 0.3, color: '#cfe4ff', hdr: 1.4, width: 0.3, delay: 0.03 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + Math.random(); fx.burst({ x: ev.x + Math.cos(a) * r * 0.8, y: 0.8, z: ev.y + Math.sin(a) * r * 0.8, n: 1, cell: CELL.spark, color: '#ffffff', hdr: 2.4, size: [0.5, 0.7], size2: 0.2, life: 0.12, rot: a }); }
  },
  orb(fx, ev, C) {
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 1, cell: CELL.glow, color: C.team.light, hdr: 3, size: 1.1, size2: 0.2, life: 0.16 });
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 8, cell: CELL.spark, color: '#ffffff', color2: C.team.main, hdr: 2.6, size: [0.09, 0.17], life: [0.2, 0.38], speed: [2, 5], up: [0.5, 2.5], gravity: -7, drag: 2.5 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.15, r: 0.7, dur: 0.22, color: C.team.light, hdr: 1.6, width: 0.2 });
  },
};

// ---- Allgemeine Ereignisse
export const EVENTS = {
  // Antriebskreis einer Runenform: zwei Ringe in der Farbe des Antriebs, die bis zum Rand des Kreises laufen
  trail(fx, ev) {
    fx.ring({ x: ev.x, z: ev.y, r0: ev.r * 0.25, r: ev.r, dur: 0.55, color: '#ffa53d', hdr: 1.7, width: 0.2, alpha: 0.85 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.1, r: ev.r * 0.6, dur: 0.4, color: '#ffe2a8', hdr: 1.3, width: 0.3, alpha: 0.6 });
  },
  // Karte gespielt: Lichtring in Teamfarbe (der Staub kommt, wenn die Figuren landen)
  deploy(fx, ev, C) {
    fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: ev.hero || ev.rune ? 2.0 : 1.35, dur: 0.45, color: C.team.light, hdr: 1.8, width: 0.16 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.1, r: 0.9, dur: 0.3, color: '#ffffff', hdr: 1.4, width: 0.3 });
  },
  // Figur landet: Staubkranz, kleiner Ring, ein paar Halme
  land(fx, ev, C) {
    const r = ev.r || 0.4;
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283; fx.burst({ x: ev.x + Math.cos(a) * r * 0.5, y: 0.12, z: ev.y + Math.sin(a) * r * 0.5, n: 1, cell: CELL.dust, add: 0, color: '#efe6cf', alpha: 0.6, size: [0.3, 0.42], size2: [0.7, 0.95], life: [0.35, 0.55], dir: [Math.cos(a), 0.12, Math.sin(a)], cone: 0.2, speed: [1.6, 2.6], drag: 4.5 }); }
    fx.ring({ x: ev.x, z: ev.y, r0: r * 0.5, r: r * 2.6, dur: 0.3, color: C.team.light, hdr: 1.3, width: 0.22, alpha: 0.8 });
    fx.burst({ x: ev.x, y: 0.1, z: ev.y, n: 5, cell: CELL.shard, add: 0, color: '#6fc24a', size: [0.06, 0.1], life: [0.3, 0.5], speed: [1, 2.6], up: [2, 4], gravity: -15, spin: [5, 12], spread: r });
    // wie im Vorbild: braune Erdbrocken spritzen etwa ein Feld weit nach allen Seiten (bei großen Figuren mehr)
    const n = r >= 0.7 ? 12 : 7;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random() * 0.5; fx.burst({ x: ev.x + Math.cos(a) * r * 0.4, y: 0.1, z: ev.y + Math.sin(a) * r * 0.4, n: 1, cell: CELL.shard, add: 0, color: i % 3 ? '#6b4a2e' : '#8a6238', size: [0.08, 0.15], life: [0.35, 0.55], dir: [Math.cos(a), 1.1, Math.sin(a)], cone: 0.2, speed: [2.2, 3.6], gravity: -15, spin: [4, 10], floor: true }); }
  },
  // Figur fällt: Rauchwolke, Funken in Teamfarbe steigen auf
  die_unit(fx, ev, C) {
    const y = ev.air ? 1.6 : 0.6;
    fx.burst({ x: ev.x, y, z: ev.y, n: 7, cell: CELL.smoke, add: 0, color: '#f4f1ea', color2: '#cfd3dc', alpha: 0.85, size: [0.45, 0.65], size2: [0.9, 1.25], life: [0.4, 0.65], speed: [0.5, 1.6], up: [0.4, 1.4], drag: 3, spin: [0.5, 2], spread: 0.25, jitterY: 0.5 });
    fx.burst({ x: ev.x, y: y + 0.2, z: ev.y, n: 6, cell: CELL.diamond, color: C.team.light, color2: C.team.main, hdr: 2.2, size: [0.1, 0.16], size2: 0.02, life: [0.5, 0.9], speed: [0.3, 1], up: [1.6, 3], drag: 1.5, spin: [1, 4], spread: 0.2 });
    fx.burst({ x: ev.x, y, z: ev.y, n: 1, cell: CELL.glow, color: '#ffffff', hdr: 1.6, size: 1.2, size2: 0.3, life: 0.14 });
  },
  die_building(fx, ev, C) {
    EVENTS.die_unit(fx, ev, C);
    fx.debris({ x: ev.x, z: ev.y, n: 8, power: 0.7 }); fx.decal({ x: ev.x, z: ev.y, r: 1.2, dur: 8 }); C.shake(0.25);
  },
  // Turm fällt: Lichtblitz, Druckwellen, Rauchsäule, Trümmer, Brandfleck
  die_tower(fx, ev, C) {
    const k = ev.main ? 1.3 : 1;
    fx.burst({ x: ev.x, y: 1.4, z: ev.y, n: 1, cell: CELL.glow, color: '#fff3c4', hdr: 3.4, size: 4.2 * k, size2: 1.2, life: 0.3 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.5, r: 4.2 * k, dur: 0.55, color: '#ffffff', hdr: 2.2, width: 0.12 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: 2.8 * k, dur: 0.8, color: C.team.light, hdr: 1.6, width: 0.3, delay: 0.08 });
    fx.burst({ x: ev.x, y: 0.4, z: ev.y, n: 22, cell: CELL.smoke, add: 0, color: '#e8e2d6', color2: '#8b8f9a', alpha: 0.9, size: [0.8, 1.2], size2: [1.8, 2.6], life: [0.9, 1.7], speed: [0.8, 3.2], up: [0.6, 3.2], drag: 2.2, spin: [0.3, 1.5], spread: 0.9 * k, jitterY: 1.6 });
    fx.burst({ x: ev.x, y: 1.2, z: ev.y, n: 26, cell: CELL.spark, color: '#fff1b8', color2: '#ff8a2a', hdr: 3, size: [0.12, 0.26], life: [0.5, 1.0], speed: [3, 8], up: [3, 8], gravity: -14, drag: 1.2, floor: true });
    fx.burst({ x: ev.x, y: 1.6, z: ev.y, n: 14, cell: CELL.diamond, color: C.team.light, color2: C.team.main, hdr: 2.6, size: [0.16, 0.3], size2: 0.03, life: [0.8, 1.5], speed: [1, 3], up: [3, 6.5], drag: 1.4, spin: [2, 6] });
    fx.debris({ x: ev.x, z: ev.y, n: ev.main ? 22 : 15, power: 1.15 * k, size: 1.2 });
    fx.decal({ x: ev.x, z: ev.y, r: 2.4 * k, dur: 40, strength: 0.7 });
    C.shake(ev.main ? 1.0 : 0.7); C.flash(0.35);
  },
  wake(fx, ev, C) { fx.ring({ x: ev.x, z: ev.y, r0: 0.6, r: 3, dur: 0.7, color: C.team.light, hdr: 1.8, width: 0.14 }); },
  // Ansturm beginnt: Staub wirbelt auf
  charge(fx, ev) {
    fx.ring({ x: ev.x, z: ev.y, r0: 0.2, r: 0.9, dur: 0.28, color: '#f3ead2', hdr: 1.4, width: 0.2 });
    fx.burst({ x: ev.x, y: 0.15, z: ev.y, n: 6, cell: CELL.dust, add: 0, color: '#efe6cf', alpha: 0.6, size: [0.3, 0.45], size2: [0.7, 1.0], life: [0.35, 0.55], speed: [0.6, 1.6], up: [0.2, 0.7], drag: 3, spread: 0.3 });
  },
  // Wucht eines Ansturms, Sprungs oder Aufschlags (ev.r = Reichweite der Wucht): Stern, Ring, Staub, Wackeln
  impact(fx, ev, C) {
    const r = ev.r || 1.6;
    fx.burst({ x: ev.x, y: 0.7, z: ev.y, n: 1, cell: CELL.star, color: '#ffffff', hdr: 2.4, size: [1.3, 1.5], size2: 0.3, life: 0.15, spin: 2 });
    fx.ring({ x: ev.x, z: ev.y, r0: r * 0.2, r, dur: 0.3, color: '#ffffff', hdr: 1.8, width: 0.16 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; fx.burst({ x: ev.x + Math.cos(a) * 0.3, y: 0.15, z: ev.y + Math.sin(a) * 0.3, n: 1, cell: CELL.dust, add: 0, color: '#e9dfc8', alpha: 0.6, size: [0.35, 0.5], size2: [0.8, 1.1], life: [0.35, 0.55], dir: [Math.cos(a), 0.15, Math.sin(a)], cone: 0.2, speed: [1.8, 3], drag: 4 }); }
    fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 6, cell: CELL.shard, add: 0, color: '#c9a878', size: [0.08, 0.15], life: [0.35, 0.6], speed: [1.5, 4], up: [2, 4.5], gravity: -15, spin: [5, 12], floor: true });
    C.shake(0.18);
  },
  // Blitze eines Zaubers auf einzelne Ziele (ev.hits = [{ x, y, air }])
  bolts(fx, ev, C) {
    for (const h of ev.hits) { const y = h.air ? 1.5 : 0.3; bolt(fx, h.x, h.y);
      fx.burst({ x: h.x, y, z: h.y, n: 1, cell: CELL.glow, color: '#fff9b0', hdr: 2.3, size: 1.2, size2: 0.3, life: 0.18 });
      fx.ring({ x: h.x, z: h.y, r0: 0.2, r: 1.1, dur: 0.28, color: '#fff27a', hdr: 1.9, width: 0.14 });
      fx.burst({ x: h.x, y, z: h.y, n: 9, cell: CELL.spark, color: '#ffffff', color2: '#ffe45a', hdr: 3, size: [0.09, 0.2], life: [0.25, 0.5], speed: [2.5, 6], up: [1, 4.5], gravity: -12, drag: 2, floor: true }); }
    C.shake(0.3);
  },
};

// ---- Zauber: cast = Ankündigung beim Ausspielen (ev.delay Sekunden bis zum Einschlag), impact = Einschlag
export const SPELLS = {
  sternschlag: {
    cast(fx, ev, C) {
      fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: ev.delay, color: C.team.light, hdr: 1.3, fill: 0.28 });
      const core = () => { const g = new THREE.Group();
        const a = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.6, 1.6) }));
        const b = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8, 5) })); b.rotation.y = 0.8; g.add(a, b); return g; };
      let acc = 0;
      fx.fall({ make: core, dur: ev.delay, arc: ev.arc, from: ev.src || [ev.x - 4.5, 15, ev.y - 3], to: [ev.x, 0.4, ev.y],
        trail(p, dt) { acc += dt; while (acc > 0.012) { acc -= 0.012;
          fx.burst({ x: p.x, y: p.y, z: p.z, n: 1, cell: CELL.glow, color: '#fff3a8', color2: '#ff9a2a', hdr: 3.2, size: [0.5, 0.75], size2: 0.08, life: [0.18, 0.3], spread: 0.1 });
          if (Math.random() < 0.5) fx.burst({ x: p.x, y: p.y, z: p.z, n: 1, cell: CELL.star, color: '#ffffff', hdr: 2.5, size: [0.12, 0.2], life: [0.3, 0.5], speed: [0.3, 1.2], up: [-0.5, 1], drag: 2, spin: 4 }); } } });
    },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev;
      fx.burst({ x, y: 0.8, z, n: 1, cell: CELL.glow, color: '#fff6c8', hdr: 3.2, size: r * 2.1, size2: r * 0.7, life: 0.24 });
      fx.burst({ x, y: 0.5, z, n: 1, cell: CELL.star, color: '#ffffff', hdr: 2.6, size: r * 2.0, size2: r * 0.4, life: 0.18, spin: 2 });
      fx.ring({ x, z, r0: r * 0.3, r: r * 1.5, dur: 0.4, color: '#fff3c4', hdr: 2.6, width: 0.14 });
      fx.ring({ x, z, r0: r * 0.2, r: r * 1.05, dur: 0.6, color: '#ffb347', hdr: 1.8, width: 0.35, delay: 0.05 });
      fx.burst({ x, y: 0.5, z, n: 26, cell: CELL.spark, color: '#fff3a8', color2: '#ff7a1a', hdr: 3.2, size: [0.12, 0.28], life: [0.4, 0.85], speed: [3, 8.5], up: [2, 7], gravity: -16, drag: 1.3, floor: true });
      fx.burst({ x, y: 0.4, z, n: 10, cell: CELL.smoke, add: 0, color: '#ffd9a0', color2: '#7d7f8c', alpha: 0.8, size: [0.6, 0.9], size2: [1.4, 2.0], life: [0.6, 1.1], speed: [1, 3], up: [0.6, 2.4], drag: 2.4, spin: [0.4, 1.5], spread: r * 0.6 });
      // wie im Vorbild: eine große dunkle Wolke über der ganzen Fläche, die die Figuren kurz verdeckt, darin der glühende Kern
      fx.burst({ x, y: 0.7, z, n: 16, cell: CELL.smoke, add: 0, color: '#5a4534', color2: '#231d19', alpha: 0.88, size: [r * 0.45, r * 0.65], size2: [r * 0.8, r * 1.1], life: [0.7, 1.2], speed: [0.4, 1.6], up: [0.5, 1.8], drag: 2.2, spin: [0.3, 1.2], spread: r * 0.55 });
      fx.burst({ x, y: 0.9, z, n: 5, cell: CELL.glow, color: '#ffb347', color2: '#ff5a1a', hdr: 2.4, size: [r * 0.5, r * 0.7], size2: r * 0.15, life: [0.3, 0.5], spread: r * 0.25 });
      // Steinsplitter fliegen strahlenförmig davon
      for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283 + Math.random() * 0.3; fx.burst({ x: x + Math.cos(a) * r * 0.25, y: 0.4, z: z + Math.sin(a) * r * 0.25, n: 1, cell: CELL.shard, add: 0, color: i % 2 ? '#3a3330' : '#8a6a44', size: [0.12, 0.22], life: [0.5, 0.9], dir: [Math.cos(a), 0.9, Math.sin(a)], cone: 0.25, speed: [4, 8], gravity: -17, spin: [5, 12], floor: true }); }
      fx.burst({ x, y: 0.3, z, n: 12, cell: CELL.star, color: '#fff3a8', hdr: 2.6, size: [0.14, 0.26], size2: 0.02, life: [0.5, 1.0], speed: [1, 3.5], up: [2.5, 5.5], gravity: -6, drag: 1.2, spin: [3, 8], spread: r * 0.5 });
      fx.debris({ x, z, n: 7, color: '#8a6a44', power: 0.8, size: 0.7 });
      fx.decal({ x, z, r: r * 1.15, dur: 9 });
      C.shake(0.55); C.flash(0.12);
    },
  },
};

// Gezackter Blitz vom Himmel bis zum Boden: heller Kern in bläulichem Schein, hier und da ein Seitenast, ein kurzes Nachzucken,
// ein Lichtfleck und eine Brandstelle am Einschlag. (Bis 2026-11-14: zwei dünne gelbe Linien aus fünf Stücken.)
function bolt(fx, x, z, color = '#4f9dff', top = 9) {
  const strike = (dur, w, glow) => {
    const N = 6;
    let p = [x + (Math.random() - 0.5) * 2.4, top, z + (Math.random() - 0.5) * 1.0];
    for (let i = 1; i <= N; i++) {
      const k = 1 - i / N, j = i < N ? 0.8 : 0, q = [x + (Math.random() - 0.5) * j + (p[0] - x) * k * 0.55, top * k + 0.12, z + (Math.random() - 0.5) * j * 0.6];
      if (glow) fx.beam({ from: p, to: q, color, hdr: 0.95, width: w * 2.5, dur: dur * 1.2 });   // Schein
      fx.beam({ from: p, to: q, color: '#ffffff', hdr: 2.3, width: w * 0.8, dur });             // Kern
      if (glow && i > 1 && i < N && Math.random() < 0.4) { const b = [q[0] + (Math.random() - 0.5) * 1.8, Math.max(0.3, q[1] - 0.5 - Math.random() * 0.9), q[2] + (Math.random() - 0.5) * 0.8]; fx.beam({ from: q, to: b, color: '#dff1ff', hdr: 1.9, width: w * 0.55, dur: dur * 0.7 }); }   // Seitenast
      p = q;
    }
  };
  strike(0.2, 0.05, true);
  fx.after(0.08, () => strike(0.14, 0.035, false));   // Nachzucken
  fx.burst({ x, y: 0.18, z, n: 1, cell: CELL.glow, color: '#ffffff', color2: color, hdr: 2.4, size: 1.3, size2: 0.3, life: 0.18 });
  fx.burst({ x, y: 0.2, z, n: 3, cell: CELL.ring, color: '#dff1ff', hdr: 2, alpha: 0.9, size: [0.15, 0.25], size2: [0.5, 0.8], life: [0.25, 0.4], spread: 0.4 });   // kleine Lichtbögen am Boden
  fx.decal({ x, z, r: 0.5, dur: 5, strength: 0.6 });
}
const lump = (r, color, hdr = 1) => () => new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), hdr > 1 ? new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(hdr) }) : new THREE.MeshLambertMaterial({ color, flatShading: true }));

Object.assign(SPELLS, {
  // Hagelschauer: Eiskörner prasseln schräg herab, am Ende ein kalter Stoß über die ganze Fläche
  hagelschauer: {
    cast(fx, ev, C) {
      fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: ev.delay, color: '#cfeaff', hdr: 1.3, fill: 0.22 });
      const late = ev.src ? Math.max(0, ev.delay - 0.3) : 0, n = ev.src ? 6 : Math.max(4, Math.round((ev.delay + 0.25) / 0.07));
      if (ev.src) fx.fall({ make: lump(0.2, '#f2fbff', 2.2), dur: ev.delay, arc: ev.arc, from: ev.src, to: [ev.x, 0.6, ev.y], trail(p) { fx.burst({ x: p.x, y: p.y, z: p.z, n: 2, cell: CELL.spark, color: '#f2fbff', color2: '#bfe6ff', hdr: 1.6, size: [0.25, 0.4], size2: 0.05, life: [0.12, 0.2], spread: 0.5 }); } });   // das Pfeilbündel fliegt vom Turm, erst über dem Ziel geht der Schauer nieder
      for (let i = 0; i < n; i++) fx.after(late + i * 0.07, () => {
        fx.burst({ x: ev.x - 0.9, y: 5.2, z: ev.y - 0.45, n: 8, cell: CELL.spark, color: '#f2fbff', color2: '#bfe6ff', hdr: 1.5, alpha: 0.9, size: [0.5, 0.75], size2: [0.5, 0.7], life: [0.4, 0.45], fade: 0.2, rot: 0.17, dir: [0.17, -1, 0.09], cone: 0.03, speed: [11.5, 13], spread: ev.r * 0.95 });
        fx.burst({ x: ev.x - 0.9, y: 5.2, z: ev.y - 0.45, n: 4, cell: CELL.shard, add: 0, color: '#ffffff', size: [0.13, 0.2], size2: [0.13, 0.2], life: [0.4, 0.45], fade: 0.2, dir: [0.17, -1, 0.09], cone: 0.03, speed: [11.5, 13], spread: ev.r * 0.95, spin: [4, 9] });
      });
    },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev;
      fx.ring({ x, z, r0: r * 0.4, r: r * 1.05, dur: 0.4, color: '#e6f6ff', hdr: 2, width: 0.12 });
      fx.burst({ x, y: 0.25, z, n: 22, cell: CELL.star, color: '#ffffff', color2: '#bfe6ff', hdr: 2.2, size: [0.25, 0.45], size2: 0.05, life: [0.12, 0.3], spread: r * 0.95, spin: 3 });
      fx.burst({ x, y: 0.2, z, n: 18, cell: CELL.shard, add: 0, color: '#f2fbff', size: [0.07, 0.13], life: [0.3, 0.55], speed: [0.8, 2.4], up: [1.5, 3.5], gravity: -14, spin: [6, 14], spread: r * 0.9 });
      fx.burst({ x, y: 0.3, z, n: 10, cell: CELL.smoke, add: 0, color: '#eaf6ff', alpha: 0.5, size: [0.6, 0.9], size2: [1.2, 1.7], life: [0.5, 0.9], speed: [0.3, 1], up: [0.2, 0.8], drag: 2, spread: r * 0.7 });
      C.shake(0.2);
    },
  },
  // Eiswurf: ein Eisbrocken fliegt herab und zerspringt; Splitter fliegen nach außen (er stößt zurück und bremst)
  eiswurf: {
    cast(fx, ev, C) {
      fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: ev.delay, color: '#cfeaff', hdr: 1.3, fill: 0.25 });
      let acc = 0;
      fx.fall({ make: lump(0.5, '#cfeeff', 1.5), dur: ev.delay, arc: ev.arc, from: ev.src || [ev.x + 3.5, 12, ev.y - 2.5], to: [ev.x, 0.4, ev.y],
        trail(p, dt) { acc += dt; while (acc > 0.03) { acc -= 0.03; fx.burst({ x: p.x, y: p.y, z: p.z, n: 1, cell: CELL.glow, color: '#dff3ff', color2: '#8fd0ff', hdr: 1.4, alpha: 0.8, size: [0.3, 0.45], size2: 0.06, life: [0.16, 0.26], spread: 0.08 }); } } });
    },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev;
      fx.burst({ x, y: 0.7, z, n: 1, cell: CELL.glow, color: '#cfeaff', hdr: 1.7, alpha: 0.85, size: r * 1.5, size2: r * 0.6, life: 0.22 });
      fx.ring({ x, z, r0: r * 0.25, r: r * 1.2, dur: 0.35, color: '#ffffff', hdr: 1.9, width: 0.14 });
      fx.ring({ x, z, r0: r * 0.2, r, dur: 0.55, color: '#8fd0ff', hdr: 1.6, width: 0.3, delay: 0.04 });
      fx.burst({ x, y: 0.4, z, n: 20, cell: CELL.shard, add: 0, color: '#f2fbff', color2: '#bfe6ff', size: [0.1, 0.2], life: [0.4, 0.75], speed: [3, 7], up: [1.5, 5], gravity: -15, spin: [6, 14], floor: true });
      fx.burst({ x, y: 0.4, z, n: 10, cell: CELL.star, color: '#ffffff', hdr: 2.4, size: [0.14, 0.26], size2: 0.02, life: [0.4, 0.8], speed: [1, 3], up: [2, 4.5], gravity: -6, drag: 1.2, spin: [3, 8], spread: r * 0.4 });
      fx.burst({ x, y: 0.3, z, n: 8, cell: CELL.smoke, add: 0, color: '#eaf6ff', alpha: 0.55, size: [0.5, 0.8], size2: [1.1, 1.6], life: [0.5, 0.9], speed: [0.8, 2.2], up: [0.3, 1], drag: 2.2, spread: r * 0.5 });
      C.shake(0.3);
    },
  },
  // Funkenschlag: drei gezackte Blitze schlagen ein, kurzer gelber Schein (lähmt kurz)
  funkenschlag: {
    cast(fx, ev, C) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.12, ev.delay), color: '#fff27a', hdr: 1.4, fill: 0.2 }); },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev;
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + Math.random(), bx = x + Math.cos(a) * r * 0.45, bz = z + Math.sin(a) * r * 0.45; bolt(fx, bx, bz);
        fx.burst({ x: bx, y: 0.3, z: bz, n: 1, cell: CELL.glow, color: '#fff9b0', hdr: 2.2, size: 0.95, size2: 0.25, life: 0.16 });
        fx.burst({ x: bx, y: 0.3, z: bz, n: 6, cell: CELL.spark, color: '#ffffff', color2: '#ffe45a', hdr: 3, size: [0.09, 0.18], life: [0.2, 0.45], speed: [2, 5.5], up: [1, 4], gravity: -12, drag: 2, floor: true }); }
      fx.burst({ x, y: 0.6, z, n: 1, cell: CELL.glow, color: '#fff27a', hdr: 1.2, alpha: 0.55, size: r * 1.8, size2: r * 1.1, life: 0.18 });
      fx.ring({ x, z, r0: r * 0.3, r: r * 1.05, dur: 0.3, color: '#fff9b0', hdr: 2.2, width: 0.12 });
      C.shake(0.25); C.flash(0.1);
    },
  },
  // Frostnacht: kalter Schein, ein Reifring bleibt stehen, Schneeflocken sinken, solange der Frost hält
  frostnacht: {
    cast(fx, ev, C) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: '#bfeaff', hdr: 1.4, fill: 0.3 }); },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev;
      fx.burst({ x, y: 0.7, z, n: 1, cell: CELL.glow, color: '#bfe6ff', hdr: 1.4, alpha: 0.7, size: r * 1.9, size2: r * 1.3, life: 0.4 });
      fx.ring({ x, z, r0: r * 0.2, r, dur: 0.45, color: '#ffffff', hdr: 1.8, width: 0.16 });
      fx.ring({ x, z, r0: r * 0.985, r, dur: 3.8, color: '#bfeaff', hdr: 1.3, width: 0.05, alpha: 0.9 });
      fx.burst({ x, y: 0.25, z, n: 16, cell: CELL.smoke, add: 0, color: '#eaf6ff', alpha: 0.5, size: [0.7, 1.0], size2: [1.4, 2.0], life: [0.9, 1.6], speed: [0.2, 0.8], up: [0.1, 0.5], drag: 2, spread: r * 0.85 });
      fx.burst({ x, y: 0.3, z, n: 14, cell: CELL.shard, add: 0, color: '#f2fbff', size: [0.08, 0.15], life: [0.4, 0.7], speed: [1, 3], up: [2, 4.5], gravity: -13, spin: [6, 14], spread: r * 0.8 });
      for (let i = 0; i < 14; i++) fx.after(i * 0.25, () => fx.burst({ x, y: 2.4, z, n: 7, cell: CELL.star, color: '#ffffff', color2: '#bfeaff', hdr: 1.8, size: [0.16, 0.26], size2: 0.06, life: [1.0, 1.5], speed: [0.1, 0.4], up: [-1.6, -1.0], drag: 0.4, spin: [1, 3], spread: r * 0.9, jitterY: 0.8 }));
      C.shake(0.15);
    },
  },
  // Felssturz: ein großer Brocken stürzt herab – sein Schatten wächst am Boden –, dann Staubwelle, Trümmer und Krater
  felssturz: {
    cast(fx, ev, C) {
      fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: ev.delay, color: C.team.light, hdr: 1.3, fill: 0.34 });
      fx.ring({ x: ev.x, z: ev.y, r0: ev.r * 1.3, r: ev.r * 0.3, dur: ev.delay, color: '#1c1f26', hdr: 0.5, width: 0.9, alpha: 0.5 });
      let acc = 0;
      fx.after(ev.src ? 0 : Math.max(0, ev.delay - 0.75), () => fx.fall({ make: lump(1.05, '#8d939c'), dur: ev.src ? ev.delay : Math.min(0.75, ev.delay), arc: ev.arc, from: ev.src || [ev.x - 2.2, 17, ev.y - 1.6], to: [ev.x, 0.7, ev.y],
        trail(p, dt) { acc += dt; while (acc > 0.03) { acc -= 0.03; fx.burst({ x: p.x, y: p.y, z: p.z, n: 1, cell: CELL.dust, add: 0, color: '#d9d2c2', alpha: 0.5, size: [0.4, 0.6], size2: [0.9, 1.2], life: [0.25, 0.4], spread: 0.3 }); } } }));
    },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev;
      fx.burst({ x, y: 0.7, z, n: 1, cell: CELL.glow, color: '#fff0d0', hdr: 2.6, size: r * 2.6, size2: r * 0.9, life: 0.22 });
      fx.ring({ x, z, r0: r * 0.3, r: r * 1.7, dur: 0.45, color: '#ffffff', hdr: 2.2, width: 0.14 });
      fx.ring({ x, z, r0: r * 0.2, r: r * 1.15, dur: 0.7, color: '#e9dfc8', hdr: 1.4, width: 0.4, delay: 0.05 });
      for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; fx.burst({ x: x + Math.cos(a) * r * 0.4, y: 0.2, z: z + Math.sin(a) * r * 0.4, n: 1, cell: CELL.dust, add: 0, color: '#e9dfc8', alpha: 0.7, size: [0.6, 0.85], size2: [1.5, 2.0], life: [0.6, 0.95], dir: [Math.cos(a), 0.14, Math.sin(a)], cone: 0.2, speed: [3, 4.6], drag: 3.5 }); }
      fx.burst({ x, y: 0.5, z, n: 14, cell: CELL.smoke, add: 0, color: '#e8e2d6', color2: '#8b8f9a', alpha: 0.85, size: [0.7, 1.0], size2: [1.6, 2.3], life: [0.8, 1.4], speed: [0.6, 2.2], up: [0.8, 3], drag: 2.2, spin: [0.3, 1.5], spread: r * 0.5 });
      fx.burst({ x, y: 0.5, z, n: 16, cell: CELL.shard, add: 0, color: '#b4bac6', size: [0.12, 0.24], life: [0.5, 0.9], speed: [2, 6], up: [3, 7], gravity: -16, spin: [5, 12], floor: true });
      fx.debris({ x, z, n: 16, power: 1.2, size: 1.3 });
      fx.decal({ x, z, r: r * 1.25, dur: 14, strength: 0.75 });
      C.shake(0.8); C.flash(0.1);
    },
  },
});

Object.assign(SPELLS, {
  // Wurzelgriff: Ranken schießen aus dem Boden und halten fest; ein grüner Ring bleibt, solange der Griff hält
  wurzelgriff: {
    cast(fx, ev, C) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: '#a8e88a', hdr: 1.3, fill: 0.25 }); },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev, hold = 3.4;
      fx.ring({ x, z, r0: r * 0.2, r, dur: 0.4, color: '#c8f5a8', hdr: 1.8, width: 0.16 });
      fx.ring({ x, z, r0: r * 0.985, r, dur: hold, color: '#7fd069', hdr: 1.2, width: 0.06, alpha: 0.9 });
      for (let i = 0; i < 11; i++) { const a = i / 11 * 6.283 + Math.random() * 0.4, q = (0.35 + Math.random() * 0.55) * r, bx = x + Math.cos(a) * q, bz = z + Math.sin(a) * q;   // Ranken: zwei Glieder, die sich nach innen neigen
        const mx = bx - Math.cos(a) * 0.12, mz = bz - Math.sin(a) * 0.12, tx = bx - Math.cos(a + 0.9) * 0.3, tz = bz - Math.sin(a + 0.9) * 0.3, h = 0.5 + Math.random() * 0.35;
        fx.beam({ from: [bx, 0.03, bz], to: [mx, h * 0.6, mz], color: '#5fae4a', hdr: 1.3, width: 0.085, dur: hold }); fx.beam({ from: [mx, h * 0.6, mz], to: [tx, h, tz], color: '#8fd66a', hdr: 1.3, width: 0.055, dur: hold }); }
      fx.burst({ x, y: 0.2, z, n: 16, cell: CELL.shard, add: 0, color: '#6fb84a', color2: '#4a7a34', size: [0.08, 0.15], life: [0.4, 0.7], speed: [0.8, 2.5], up: [2, 4.5], gravity: -14, spin: [5, 12], spread: r * 0.85 });
      fx.burst({ x, y: 0.15, z, n: 10, cell: CELL.dust, add: 0, color: '#d9cfae', alpha: 0.5, size: [0.4, 0.6], size2: [0.9, 1.3], life: [0.4, 0.7], speed: [0.4, 1.2], up: [0.2, 0.7], drag: 3, spread: r * 0.8 });
      C.shake(0.15);
    },
  },
  // Heilquell: sanfter grüner Schein, ein Ring bleibt fünf Sekunden, Lichtpunkte steigen auf
  heilquell: {
    cast(fx, ev, C) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: '#7dffa8', hdr: 1.2, fill: 0.22 }); },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev, dur = 5;
      fx.burst({ x, y: 0.5, z, n: 1, cell: CELL.glow, color: '#9dffbc', hdr: 1.3, alpha: 0.6, size: r * 1.7, size2: r * 1.2, life: 0.5 });
      fx.ring({ x, z, r0: r * 0.2, r, dur: 0.45, color: '#d6ffe2', hdr: 1.7, width: 0.14 });
      fx.ring({ x, z, r0: r * 0.985, r, dur, color: '#7dffa8', hdr: 1.2, width: 0.06, alpha: 0.9 });
      for (let i = 0; i < 10; i++) fx.after(i * 0.5, () => {
        fx.ring({ x, z, r0: r * 0.15, r: r * 0.95, dur: 0.9, color: '#7dffa8', hdr: 1.0, width: 0.1, alpha: 0.5 });
        fx.burst({ x, y: 0.2, z, n: 7, cell: CELL.diamond, color: '#e6ffee', color2: '#7dffa8', hdr: 1.9, size: [0.1, 0.17], size2: 0.03, life: [0.8, 1.3], speed: [0.05, 0.3], up: [0.9, 1.7], drag: 0.8, spin: [1, 3], spread: r * 0.9 }); });
    },
  },
  // Donnerkeil: dunkle Ankündigung mit Knistern, dann gelber Stoß; die drei Blitze selbst kommen als eigenes Ereignis (EVENTS.bolts)
  donnerkeil: {
    cast(fx, ev, C) {
      fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: ev.delay, color: '#fff27a', hdr: 1.4, fill: 0.2 });
      fx.ring({ x: ev.x, z: ev.y, r0: ev.r * 1.1, r: ev.r * 0.4, dur: ev.delay, color: '#1c1f26', hdr: 0.5, width: 0.9, alpha: 0.4 });
      const n = Math.max(3, Math.round(ev.delay / 0.1));
      for (let i = 0; i < n; i++) fx.after(i * 0.1, () => fx.burst({ x: ev.x, y: 0.3, z: ev.y, n: 4, cell: CELL.spark, color: '#ffffff', color2: '#ffe45a', hdr: 2.6, size: [0.12, 0.26], life: [0.1, 0.2], spread: ev.r * 0.9, jitterY: 1.2 }));
    },
    impact(fx, ev, C) {
      const { x, y: z, r } = ev;
      fx.burst({ x, y: 0.6, z, n: 1, cell: CELL.glow, color: '#fff27a', hdr: 1.2, alpha: 0.55, size: r * 1.8, size2: r * 1.1, life: 0.2 });
      fx.ring({ x, z, r0: r * 0.3, r: r * 1.05, dur: 0.35, color: '#fff9b0', hdr: 2.2, width: 0.12 });
      C.shake(0.45); C.flash(0.12);
    },
  },
});

// Standard für Zauber ohne eigenes Rezept: Farbe aus der Art der Karte, Größe aus ihrem Radius
export function defaultSpell(card) {
  const col = card && card.freeze ? '#bfeaff' : card && card.heal ? '#7dffa8' : card && card.stun ? '#fff27a' : '#ffd27a';
  return {
    cast(fx, ev, C) { fx.zone({ x: ev.x, z: ev.y, r: ev.r, dur: Math.max(0.15, ev.delay), color: C.team.light, hdr: 1.3 }); },
    impact(fx, ev, C) {
      fx.burst({ x: ev.x, y: 0.7, z: ev.y, n: 1, cell: CELL.glow, color: col, hdr: 3, size: ev.r * 2, size2: ev.r * 0.7, life: 0.22 });
      fx.ring({ x: ev.x, z: ev.y, r0: ev.r * 0.3, r: ev.r * 1.3, dur: 0.45, color: col, hdr: 2.2, width: 0.18 });
      fx.burst({ x: ev.x, y: 0.5, z: ev.y, n: 16, cell: CELL.spark, color: '#ffffff', color2: col, hdr: 2.6, size: [0.1, 0.22], life: [0.35, 0.7], speed: [2, 6], up: [1.5, 5], gravity: -12, drag: 1.5, spread: ev.r * 0.4 });
      C.shake(0.25);
    },
  };
}
