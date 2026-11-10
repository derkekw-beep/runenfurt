// Was wie aussieht: Geschosse je Schütze, Treffer, Einschläge und Zauber als kurze Rezepte aus den Bausteinen
// in fx.js. Neue Karte = neuer Eintrag hier; fehlt einer, greift ein Standard, der aus den Kartenwerten gebaut wird
// (Radius, Seite, Art) – es bleibt also nie etwas ohne Effekt.
//
// Ein Rezept bekommt (fx, ev, C): fx = Bausteine, ev = Ereignis der Spielregeln (x, y = Ort auf dem Feld, r = Radius,
// side = Seite), C = { team: Farben der Seite, shake(n), sfx(name) }. Auf dem Feld ist y die Tiefe: im Raum also z.
import { THREE } from './deps.js';
import { CELL } from './fx.js';

// ---- Geschosse: kind 'arrow' | 'orb' | 'rock'; y0 = Abschusshöhe, arc = Bogenhöhe, color 'team' = Farbe der Seite
export const PROJECTILES = {
  waldlaeufer: { kind: 'arrow', y0: 1.15, arc: 0.5, hit: 'arrow' },
  aussenturm: { kind: 'orb', y0: 3.1, arc: 0.25, size: 0.2, color: 'team', hit: 'orb' },
  hauptturm: { kind: 'orb', y0: 4.6, arc: 0.3, size: 0.26, color: 'team', hit: 'orb' },
  ballista: { kind: 'arrow', y0: 0.95, arc: 0.15, scale: 1.5, hit: 'arrow' },
  funkenweberin: { kind: 'orb', y0: 1.45, arc: 0.7, size: 0.2, color: '#ffd45a', glow: '#ffb347', hit: 'spark' },
  _: { kind: 'orb', y0: 1.0, arc: 0.4, size: 0.16, color: '#fff3c4', hit: 'orb' },
};
// ---- Nahkampf-Treffer je Angreifer (sonst 'punch')
export const MELEE = { raufbold: 'punch', steinhueter: 'slam', wicht: 'bite', kraehe: 'bite' };

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
  orb(fx, ev, C) {
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 1, cell: CELL.glow, color: C.team.light, hdr: 3, size: 1.1, size2: 0.2, life: 0.16 });
    fx.burst({ x: ev.x, y: 0.9, z: ev.y, n: 8, cell: CELL.spark, color: '#ffffff', color2: C.team.main, hdr: 2.6, size: [0.09, 0.17], life: [0.2, 0.38], speed: [2, 5], up: [0.5, 2.5], gravity: -7, drag: 2.5 });
    fx.ring({ x: ev.x, z: ev.y, r0: 0.15, r: 0.7, dur: 0.22, color: C.team.light, hdr: 1.6, width: 0.2 });
  },
};

// ---- Allgemeine Ereignisse
export const EVENTS = {
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
      fx.fall({ make: core, dur: ev.delay, from: [ev.x - 4.5, 15, ev.y - 3], to: [ev.x, 0.4, ev.y],
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
      fx.burst({ x, y: 0.4, z, n: 14, cell: CELL.smoke, add: 0, color: '#ffd9a0', color2: '#7d7f8c', alpha: 0.8, size: [0.6, 0.9], size2: [1.4, 2.0], life: [0.6, 1.1], speed: [1, 3], up: [0.6, 2.4], drag: 2.4, spin: [0.4, 1.5], spread: r * 0.6 });
      fx.burst({ x, y: 0.3, z, n: 12, cell: CELL.star, color: '#fff3a8', hdr: 2.6, size: [0.14, 0.26], size2: 0.02, life: [0.5, 1.0], speed: [1, 3.5], up: [2.5, 5.5], gravity: -6, drag: 1.2, spin: [3, 8], spread: r * 0.5 });
      fx.debris({ x, z, n: 7, color: '#8a6a44', power: 0.8, size: 0.7 });
      fx.decal({ x, z, r: r * 1.15, dur: 9 });
      C.shake(0.55); C.flash(0.12);
    },
  },
};

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
