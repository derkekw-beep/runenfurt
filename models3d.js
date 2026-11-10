// 3D-Modelle aller Figuren, aus Grundformen zusammengesetzt (eigene Entwürfe, keine Dateien).
// Jede Figur besteht aus wenigen beweglichen Teilen; unbewegte Formen werden je Teil zu einer Geometrie
// mit Eckfarben verschmolzen. Blickrichtung ist +Z, Maße in Feldern.
import * as THREE from './vendor/three.module.min.js';
import { TEAM } from './render.js';

const PI = Math.PI;
export const SKIN = '#f3c9a2', INK = '#1d2530', DARK = '#2a2f3a';
export const STONE = '#939aa5', STONE_D = '#646b75', STONE_L = '#b4bbc4', WOOD = '#9a6634', WOOD_D = '#5d3d1f';
const GOLD = '#f5c542', GOLD_D = '#b98617', STEEL = '#c5cbd4', STEEL_D = '#7d8590', BONE = '#f3ead2';
export const FLY = { kraehe: 1.5, rochen: 1.7, donnerkaefer: 1.9, nachtfalter: 1.3, panzerhornisse: 1.6, laternenfisch: 1.7,
  flugsamen: 1.9, jungrochen: 1.6, segelwicht: 1.8, gewitterrochen: 1.8, aschenschwinge: 2.0, aschenfunke: 1.4, glutfalke: 1.7 };
export const USCALE = 1.3; // Figuren größer zeichnen als ihr Spielradius: auf dem Handy besser zu erkennen

// ---- Bausteine ---------------------------------------------------------------------------------
export const sph = r => new THREE.SphereGeometry(r, 16, 12);
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);
export const caps = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 12);
export const octa = r => new THREE.OctahedronGeometry(r);
export const rock = r => new THREE.IcosahedronGeometry(r, 0);
export const dome = r => new THREE.SphereGeometry(r, 16, 8, 0, PI * 2, 0, PI / 2); // Halbkugel: nichts ragt unter den Boden
export const rock1 = r => { const g = new THREE.IcosahedronGeometry(r, 1); g.computeVertexNormals(); return g; }; // kantiger Brocken
export const torus = (r, t, arc = PI * 2) => new THREE.TorusGeometry(r, t, 8, 18, arc);
const basis = (x, y, z) => new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z));
export const AXIS_Z = [PI / 2, 0, 0]; // Zylinder/Kegel von der Hochachse nach vorn (+Z) kippen
// Ein Teil: Form, Farbe, Ort, Drehung (Euler oder Matrix), Streckung
export const P = (geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => ({ geo, color, p, r, s });

// Mehrere Teile zu einer Geometrie mit Eckfarben verschmelzen (ein Zeichenaufruf statt vieler)
export function merge(parts) {
  const pos = [], nor = [], colr = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), t = new THREE.Vector3(), sc = new THREE.Vector3(), nm = new THREE.Matrix3(), c = new THREE.Color();
  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
    if (part.r.isMatrix4) q.setFromRotationMatrix(part.r); else q.setFromEuler(e.set(part.r[0], part.r[1], part.r[2]));
    m.compose(t.set(...part.p), q, sc.set(...part.s));
    nm.getNormalMatrix(m);
    c.set(part.color);
    const pa = g.attributes.position, na = g.attributes.normal;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      colr.push(c.r, c.g, c.b);
    }
    if (g !== part.geo) g.dispose();
    part.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  return out;
}

// Standfläche in Teamfarbe (Helden: mit Goldrand)
const baseRing = (T, r, gold) => [
  ...(gold ? [P(cyl(r * 1.16, r * 1.16, 0.016, 24), GOLD, [0, 0.008, 0])] : []),
  P(cyl(r, r, 0.02, 24), T.main, [0, 0.012, 0]), P(cyl(r * 0.78, r * 0.78, 0.024, 24), '#22303a', [0, 0.014, 0]),
];

// Stab aufrecht in der rechten Hand (der Arm ist dabei um -1 nach vorn gedreht)
const staff = (color, len = 0.9) => P(cyl(0.024, 0.028, len, 6), color, [0, -0.3, 0], [1.0, 0, 0]);
const ORB_AT = [0.275, 1.1, 0.25]; // Spitze dieses Stabs im Körper-Raum

// Menschliche Figur: Rumpf, großer Kopf, zwei Beine und zwei Arme als bewegliche Teile.
function human(T, o = {}) {
  const skin = o.skin || SKIN;
  const body = [...baseRing(T, 0.42, o.gold)];
  if (o.robe) body.push(P(cyl(0.15, 0.34, 0.66, 14), o.robe === true ? T.main : o.robe, [0, 0.36, 0]), P(cyl(0.346, 0.346, 0.05, 14), T.dark, [0, 0.06, 0]), P(cyl(0.2, 0.2, 0.06, 14), T.dark, [0, 0.46, 0]));
  else body.push(P(cyl(0.2, 0.25, 0.42), T.main, [0, 0.52, 0]), P(cyl(0.258, 0.258, 0.07), T.dark, [0, 0.36, 0]));
  body.push(P(sph(0.24), skin, [0, 0.93, 0]), P(sph(0.058), '#ffffff', [-0.095, 0.965, 0.2]), P(sph(0.058), '#ffffff', [0.095, 0.965, 0.2]), P(sph(0.034), INK, [-0.095, 0.965, 0.245]), P(sph(0.034), INK, [0.095, 0.965, 0.245]), P(sph(0.03), '#e59a86', [0, 0.89, 0.235]));
  const leg = () => [P(box(0.13, 0.26, 0.17), DARK, [0, -0.13, 0.01]), P(box(0.15, 0.08, 0.22), '#4a3524', [0, -0.27, 0.03])];
  const arm = () => [P(caps(0.065, 0.16), o.sleeve || T.main, [0, -0.13, 0]), P(sph(o.fist || 0.085), skin, [0, -0.3, 0])];
  const d = {
    kind: 'human', s: o.s || 1, h: o.h || 1.3,
    parts: { body, legL: o.robe ? [] : leg(), legR: o.robe ? [] : leg(), armL: arm(), armR: arm() },
    piv: { legL: [-0.11, 0.31, 0], legR: [0.11, 0.31, 0], armL: [-0.275, 0.68, 0], armR: [0.275, 0.68, 0] },
  };
  if (o.extra) o.extra(d.parts, d);
  return d;
}

function towerModel(T, main, kind = 'wach') {
  const k = main ? 1.3 : 1, oct = [0, PI / 8, 0];
  const body = [P(box(2.0 * k, 0.3, 2.0 * k), STONE_D, [0, 0.15, 0]), P(box(2.1 * k, 0.1, 2.1 * k), STONE_L, [0, 0.05, 0])];
  const sh = main ? 1.7 : 1.45, top = 0.3 + sh;
  body.push(P(cyl(0.76 * k, 0.92 * k, sh, 8), STONE, [0, 0.3 + sh / 2, 0], oct));
  body.push(P(cyl(0.89 * k, 0.92 * k, 0.2, 8), T.main, [0, 0.62, 0], oct));
  body.push(P(cyl(0.8 * k, 0.82 * k, 0.07, 8), T.dark, [0, 0.76, 0], oct));
  body.push(P(cyl(1.0 * k, 0.8 * k, 0.28, 8), STONE_L, [0, top + 0.12, 0], oct));
  for (let i = 0; i < 8; i++) { const a = i * PI / 4; body.push(P(box(0.3 * k, 0.26, 0.2 * k), STONE_L, [Math.sin(a) * 0.86 * k, top + 0.38, Math.cos(a) * 0.86 * k], [0, a, 0])); }
  body.push(P(box(0.36, 0.52, 0.08), '#3b2a1a', [0, 0.56, 0.83 * k]), P(box(0.12, 0.3, 0.06), '#20262e', [0, top - 0.45, 0.74 * k]));
  body.push(P(cyl(0.8 * k, 0.8 * k, 0.04, 8), T.dark, [0, top + 0.27, 0], oct), P(cyl(0.6 * k, 0.6 * k, 0.05, 8), T.main, [0, top + 0.28, 0], oct));
  for (const sx of [-1, 1]) body.push(P(box(0.05, 0.62, 0.34), T.main, [sx * 0.9 * k, top - 0.3, 0]), P(box(0.34, 0.62, 0.05), T.main, [0, top - 0.3, -0.9 * k]));
  let cy;
  if (main) {
    body.push(P(cyl(0.62, 0.74, 0.7, 8), STONE, [0, top + 0.6, 0], oct), P(cyl(0.78, 0.62, 0.2, 8), STONE_L, [0, top + 1.04, 0], oct));
    for (const x of [-0.42, 0, 0.42]) body.push(P(sph(0.11), T.light, [x, 1.25, 0.96 * k - Math.abs(x) * 0.28]));
    cy = top + 2.05;
  } else { body.push(P(cyl(0.26, 0.36, 0.2, 8), STONE_D, [0, top + 0.35, 0])); cy = top + 1.25; }
  const r = main ? 0.56 : 0.44;
  let glow = [P(octa(r), T.main, [0, 0, 0], [0, 0, 0], [1, 1.6, 1]), P(octa(r * 0.55), T.light, [0, 0, 0], [0, PI / 4, 0], [1, 1.9, 1])], gz = 0;
  if (kind === 'geschuetz') { // dicker Mörser, in dessen Mündung es glüht
    body.push(P(box(0.8, 0.3, 0.8), '#4a505c', [0, top + 0.5, 0]), P(cyl(0.3, 0.4, 1.0, 10), '#3a3f48', [0, top + 0.95, 0.12], [0.45, 0, 0]), P(torus(0.33, 0.07), STEEL, [0, top + 1.36, 0.32], [PI / 2 + 0.45, 0, 0]), P(torus(0.4, 0.06), T.main, [0, top + 0.72, 0.01], [PI / 2 + 0.45, 0, 0]));
    glow = [P(sph(0.2), '#ffb347'), P(sph(0.11), '#fff3c4', [0.03, 0.04, 0.04])]; cy = top + 1.42; gz = 0.36;
  } else if (kind === 'klingen') { // Klingenkranz, darüber ein kreisender Wurfstern
    for (let i = 0; i < 8; i++) { const a = i * PI / 4; body.push(P(box(0.05, 0.56, 0.16), '#e3e7ee', [Math.sin(a) * 0.52, top + 0.66, Math.cos(a) * 0.52], [0, a, 0.3])); }
    body.push(P(cyl(0.4, 0.46, 0.14, 8), STEEL_D, [0, top + 0.42, 0]));
    glow = [P(box(1.0, 0.05, 0.16), '#f0f3f7'), P(box(0.16, 0.05, 1.0), '#f0f3f7'), P(box(0.7, 0.05, 0.12), '#c5cbd4', [0, 0, 0], [0, PI / 4, 0]), P(box(0.12, 0.05, 0.7), '#c5cbd4', [0, 0, 0], [0, PI / 4, 0]), P(octa(0.15), T.light, [0, 0, 0], [0, 0, 0], [1, 1.4, 1])];
  } else if (kind === 'segen') { // Altar mit schwebendem Segensstern
    body.push(P(cyl(0.36, 0.44, 0.3, 8), '#e8dcc0', [0, top + 0.45, 0]), P(cyl(0.44, 0.44, 0.06, 8), GOLD_D, [0, top + 0.62, 0]));
    for (const [x, z] of [[-0.5, 0.3], [0.5, 0.3], [0, -0.56]]) body.push(P(cyl(0.04, 0.05, 0.3, 6), '#f3ead2', [x, top + 0.45, z]), P(sph(0.05), '#ffe08a', [x, top + 0.64, z]));
    glow = [P(octa(0.36), GOLD, [0, 0, 0], [0, 0, 0], [1, 1, 0.3]), P(octa(0.36), '#fff3c4', [0, 0, 0], [0, 0, PI / 4], [1, 1, 0.26]), P(sph(0.13), '#ffffff')];
  }
  return { kind: 'tower', s: 1, h: cy + r * 1.6 + 0.25, parts: { body, gCrystal: glow }, piv: { gCrystal: [0, cy, gz] } };
}

const golem = (T, c = {}) => { const S = c.stone || STONE, SD = c.dark || STONE_D, SL = c.light || STONE_L; return {
  kind: 'golem', s: 1, h: 2.15,
  parts: {
    body: [...baseRing(T, 0.8), P(rock1(0.62), S, [0, 1.02, 0], [0, 0.3, 0], [1.12, 1.0, 0.9]), P(rock1(0.3), SL, [0, 1.74, 0.1], [0, 0.9, 0]),
      P(sph(0.36), c.cap || '#6f9a52', [0.05, 1.5, -0.2], [0, 0, 0], [1.1, 0.35, 0.9]), P(box(0.34, 0.07, 0.05), INK, [0, 1.8, 0.37])],
    legL: [P(cyl(0.25, 0.3, 0.5, 7), SD, [0, -0.25, 0])], legR: [P(cyl(0.25, 0.3, 0.5, 7), SD, [0, -0.25, 0])],
    armL: [P(rock1(0.25), SD, [0, -0.05, 0]), P(rock1(0.36), SL, [0, -0.6, 0.05], [0.5, 0.3, 0])], armR: [P(rock1(0.25), SD, [0, -0.05, 0]), P(rock1(0.36), SL, [0, -0.6, 0.05], [0.2, 1, 0])],
    gRune: [P(octa(0.22), T.main, [0, 1.02, 0.52], [0, 0, 0], [1, 1.4, 0.45]), P(sph(0.055), T.light, [-0.11, 1.8, 0.37]), P(sph(0.055), T.light, [0.11, 1.8, 0.37]),
      P(octa(0.15), T.main, [-0.42, 1.62, -0.1], [0, 0, 0.5], [1, 1.6, 1]), P(octa(0.15), T.main, [0.42, 1.62, -0.1], [0, 0, -0.5], [1, 1.6, 1]), P(octa(0.13), T.main, [0, 1.3, -0.55], [0.6, 0, 0], [1, 1.5, 1])],
  },
  piv: { legL: [-0.3, 0.5, 0], legR: [0.3, 0.5, 0], armL: [-0.82, 1.28, 0], armR: [0.82, 1.28, 0] },
}; };

// Pulverwicht: Wicht mit Pulversack; mit brennender Lunte, sobald er selbst losrennt
const pulverwicht = (T, lit) => ({
  kind: 'blob', s: 1, h: 0.95,
  parts: { body: [...baseRing(T, 0.38), P(sph(0.29), '#6d4a3a', [0, 0.32, 0], [0, 0, 0], [1, 0.95, 1]), P(sph(0.3), '#b5482c', [0, 0.46, -0.02], [0, 0, 0], [1.02, 0.5, 1.02]), P(sph(0.08), '#b5482c', [0.24, 0.42, -0.14]),
    P(sph(0.06), '#ffe26a', [-0.1, 0.36, 0.25]), P(sph(0.06), '#ffe26a', [0.1, 0.36, 0.25]), P(sph(0.03), INK, [-0.1, 0.36, 0.3]), P(sph(0.03), INK, [0.1, 0.36, 0.3]), P(torus(0.26, 0.035), T.main, [0, 0.16, 0], AXIS_Z),
    P(sph(0.24), '#3a3f48', [0, 0.46, -0.3], [0, 0, 0], [1, 1.1, 0.9]), P(cyl(0.07, 0.09, 0.08, 8), '#2a2f3a', [0, 0.72, -0.3]), P(cyl(0.012, 0.012, 0.16, 4), '#e8e2d0', [0.02, 0.83, -0.3], [0, 0, -0.3]),
    P(sph(0.11), '#3a3f48', [0.3, 0.3, 0.16]), P(sph(0.08), '#3b2716', [-0.12, 0.05, 0.07]), P(sph(0.08), '#3b2716', [0.12, 0.05, 0.07])],
    ...(lit ? { gFlame: [P(cone(0.07, 0.2, 6), '#ffe08a', [0.05, 0.98, -0.3]), P(sph(0.05), '#ff8a2a', [0.05, 0.9, -0.3])] } : {}) },
  piv: {},
});
// Kraftkloß in drei Größen: zwei übereinander sitzende Tropfen in der Farbe der Kraft
const kloss = (T, k) => ({
  kind: 'blob', s: k, h: 1.25,
  parts: { body: [...baseRing(T, 0.56), P(sph(0.5), '#3fa9d8', [0, 0.4, 0], [0, 0, 0], [1.1, 0.8, 1.1]), P(sph(0.34), '#58c7f3', [0, 0.84, 0], [0, 0, 0], [1.05, 0.85, 1.05]), P(sph(0.16), '#8fe0ff', [0.04, 1.14, 0], [0, 0, 0], [1, 0.9, 1]),
    P(sph(0.14), '#bfeeff', [-0.22, 0.56, 0.3], [0, 0, 0], [1, 1.3, 0.4]), P(sph(0.07), INK, [-0.13, 0.88, 0.3]), P(sph(0.07), INK, [0.13, 0.88, 0.3]), P(box(0.16, 0.035, 0.04), INK, [0, 0.74, 0.34]), P(torus(0.5, 0.045), T.main, [0, 0.2, 0], AXIS_Z)],
    gFlame: [P(octa(0.07), '#eafaff', [0.04, 1.34, 0], [0, 0, 0], [1, 1.5, 1])] },
  piv: {},
});

export const MODELS = {
  raufbold: T => human(T, { fist: 0.125, extra: p => {
    p.body.push(P(sph(0.25), '#b5482c', [0, 1.05, -0.04], [0, 0, 0], [1, 0.6, 1]), P(cone(0.1, 0.2, 6), '#b5482c', [0.02, 1.2, 0.05], [0.5, 0, 0]), P(torus(0.238, 0.034), T.dark, [0, 1.0, 0], AXIS_Z));
  } }),
  waldlaeufer: T => human(T, { s: 0.92, extra: p => {
    p.body.push(P(sph(0.255), T.dark, [0, 0.95, -0.08]), P(cone(0.26, 0.36), T.dark, [0, 1.2, -0.04], [-0.25, 0, 0]), P(cone(0.05, 0.2, 5), BONE, [0.12, 1.3, -0.1], [0, 0, -0.5]), P(box(0.12, 0.34, 0.1), WOOD_D, [0.08, 0.6, -0.26], [0, 0, 0.3]));
    p.armL.push(P(torus(0.27, 0.024, PI), WOOD, [0, -0.3, 0], basis([0, 0, 1], [0, -1, 0], [1, 0, 0])), P(cyl(0.008, 0.008, 0.54, 4), '#e8e2d0', [0, -0.3, 0], AXIS_Z));
  } }),
  funkenweberin: T => { const d = human(T, { s: 0.95, h: 1.62, robe: true, extra: p => {
    p.body.push(P(cyl(0.37, 0.37, 0.035, 16), '#4a2f6b', [0, 1.12, 0]), P(cone(0.2, 0.44), '#5c3a86', [0, 1.35, 0]), P(cyl(0.2, 0.21, 0.07, 12), T.main, [0, 1.17, 0]), P(sph(0.2), '#e9d27a', [0, 0.9, -0.1]));
    p.gOrb = [P(sph(0.12), '#ffd27a'), P(sph(0.07), '#fff6d8', [0.03, 0.04, 0.04])];
  } }); d.piv.gOrb = [0.3, 0.62, 0.3]; return d; },
  frostschamane: T => { const d = human(T, { s: 0.95, h: 1.5, robe: true, extra: p => {
    p.body.push(P(sph(0.27), '#eef4f8', [0, 0.97, -0.08]), P(cyl(0.36, 0.36, 0.07, 14), '#eef4f8', [0, 0.1, 0]),
      P(cone(0.03, 0.32, 5), '#d8c7a0', [-0.15, 1.3, -0.05], [0, 0, 0.55]), P(cone(0.03, 0.32, 5), '#d8c7a0', [0.15, 1.3, -0.05], [0, 0, -0.55]));
    p.armR.push(staff('#7a8ea0'));
    p.gOrb = [P(octa(0.12), '#bfeaff', [0, 0, 0], [0, 0, 0], [1, 1.5, 1]), P(octa(0.07), '#ffffff', [0, 0, 0], [0, PI / 4, 0], [1, 1.8, 1])];
  } }); d.piv.gOrb = ORB_AT; return d; },
  wurzelmutter: T => { const d = human(T, { s: 1.02, h: 1.5, robe: '#6b4a2b', sleeve: '#6b4a2b', extra: p => {
    p.body.push(P(cyl(0.23, 0.3, 0.14, 12), T.main, [0, 0.5, 0]), P(sph(0.2), '#4f8a3c', [-0.14, 1.08, -0.06]), P(sph(0.2), '#5fa049', [0.14, 1.1, -0.04]), P(sph(0.17), '#6fb455', [0, 1.2, 0.02]),
      P(sph(0.06), '#ff9db5', [0.12, 1.25, 0.12]), P(cone(0.05, 0.16, 5), T.main, [-0.2, 1.24, 0], [0, 0, 0.7]));
    p.armR.push(staff(WOOD_D));
    p.gOrb = [P(sph(0.11), '#9be564'), P(cone(0.05, 0.14, 5), '#5fa049', [0, 0.14, 0])];
  } }); d.piv.gOrb = ORB_AT; return d; },
  torknacker: T => human(T, { s: 1.08, extra: p => {
    p.body.push(P(sph(0.252), '#6b4a2b', [0, 1.05, -0.03], [0, 0, 0], [1, 0.62, 1]), P(cone(0.06, 0.3, 5), T.main, [-0.1, 1.27, -0.1], [-0.5, 0, 0.3]));
    p.body.push(P(cyl(0.11, 0.11, 0.95, 10), WOOD, [0.31, 0.5, 0.25], AXIS_Z), P(cyl(0.128, 0.128, 0.16, 10), STEEL, [0.31, 0.5, 0.74], AXIS_Z), P(cyl(0.115, 0.115, 0.05, 10), WOOD_D, [0.31, 0.5, 0.2], AXIS_Z));
  } }),
  eisenwaechter: T => human(T, { s: 1.05, extra: p => {
    p.body.push(P(sph(0.256), STEEL, [0, 1.04, -0.05], [0, 0, 0], [1, 0.7, 1]), P(box(0.07, 0.2, 0.36), T.main, [0, 1.27, -0.05]));
    p.armL.push(P(cyl(0.26, 0.26, 0.05, 14), T.dark, [-0.03, -0.22, 0.13], AXIS_Z), P(cyl(0.27, 0.27, 0.03, 14), STEEL, [-0.03, -0.22, 0.115], AXIS_Z), P(sph(0.07), STEEL, [-0.03, -0.22, 0.17]));
    p.armR.push(P(box(0.045, 0.5, 0.09), '#e3e7ee', [0, -0.3, 0.32], AXIS_Z), P(box(0.16, 0.04, 0.05), WOOD_D, [0, -0.3, 0.08]));
  } }),
  hammerschmied: T => human(T, { s: 1.15, extra: p => {
    p.body.push(P(torus(0.225, 0.04), T.main, [0, 1.03, 0], AXIS_Z), P(sph(0.17), '#d98f3a', [0, 0.82, 0.12], [0, 0, 0], [1.1, 0.9, 0.8]), P(box(0.3, 0.36, 0.04), '#6b4a2b', [0, 0.5, 0.235]));
    p.armR.push(P(cyl(0.03, 0.03, 0.7, 6), WOOD, [0, -0.3, 0.3], AXIS_Z), P(box(0.36, 0.22, 0.2), STEEL_D, [0, -0.3, 0.66]), P(box(0.38, 0.12, 0.22), STEEL, [0, -0.3, 0.66]));
  } }),
  klingentaenzerin: T => human(T, { s: 1.0, extra: p => {
    p.body.push(P(sph(0.25), '#7a2e3a', [0, 1.05, -0.05], [0, 0, 0], [1, 0.62, 1]), P(caps(0.07, 0.26), '#7a2e3a', [0, 0.95, -0.3], [0.7, 0, 0]), P(torus(0.238, 0.03), T.main, [0, 1.0, 0], AXIS_Z), P(cyl(0.26, 0.38, 0.22, 12), T.dark, [0, 0.31, 0]));
    for (const a of [p.armL, p.armR]) a.push(P(box(0.04, 0.52, 0.1), '#e3e7ee', [0, -0.3, 0.32], AXIS_Z), P(box(0.14, 0.04, 0.05), GOLD_D, [0, -0.3, 0.07]));
  } }),
  bolzenschuetzin: T => human(T, { s: 0.98, extra: p => {
    p.body.push(P(sph(0.26), T.main, [0.03, 1.1, -0.02], [0, 0, 0], [1.1, 0.45, 1.1]), P(cone(0.04, 0.3, 5), BONE, [-0.16, 1.25, -0.05], [0, 0, 0.6]), P(box(0.36, 0.5, 0.05), T.dark, [0, 0.58, -0.24], [0.15, 0, 0]), P(box(0.32, 0.075, 0.04), '#3b2a1a', [0, 0.98, 0.215]));
    p.armR.push(P(box(0.08, 0.62, 0.08), WOOD_D, [0, -0.5, 0.05]), P(torus(0.24, 0.03, PI), STEEL, [0, -0.72, 0.05], basis([1, 0, 0], [0, -1, 0], [0, 0, -1])), P(cyl(0.012, 0.012, 0.5, 4), '#e6e9ee', [0, -0.6, 0.11]));
  } }),
  erzritter: T => human(T, { s: 1.5, h: 1.45, sleeve: STEEL_D, extra: p => {
    p.body.push(P(cyl(0.225, 0.275, 0.44), STEEL, [0, 0.52, 0]), P(sph(0.275), STEEL, [0, 0.95, 0]), P(box(0.3, 0.06, 0.04), INK, [0, 0.97, 0.26]), P(box(0.05, 0.2, 0.04), INK, [0, 0.9, 0.262]),
      P(cone(0.08, 0.34, 6), T.main, [0, 1.32, -0.04], [-0.3, 0, 0]), P(sph(0.15), STEEL_D, [-0.3, 0.74, 0]), P(sph(0.15), STEEL_D, [0.3, 0.74, 0]), P(box(0.26, 0.42, 0.03), T.main, [0, 0.5, 0.265]), P(cyl(0.283, 0.283, 0.06), GOLD_D, [0, 0.33, 0]));
    p.armR.push(P(box(0.07, 0.9, 0.13), '#e3e7ee', [0, -0.3, 0.55], AXIS_Z), P(box(0.3, 0.06, 0.07), GOLD_D, [0, -0.3, 0.1]));
  } }),
  marschall: T => human(T, { s: 1.25, h: 1.75, gold: true, extra: p => {
    p.body.push(P(cyl(0.215, 0.268, 0.3), STEEL, [0, 0.56, 0]), P(sph(0.13), GOLD, [-0.28, 0.73, 0]), P(sph(0.13), GOLD, [0.28, 0.73, 0]),
      P(sph(0.256), STEEL, [0, 1.04, -0.05], [0, 0, 0], [1, 0.7, 1]), P(torus(0.2, 0.04), GOLD, [0, 1.16, -0.03], AXIS_Z),
      P(cone(0.05, 0.16, 5), GOLD, [0, 1.27, 0.14]), P(cone(0.05, 0.16, 5), GOLD, [-0.15, 1.27, 0.02]), P(cone(0.05, 0.16, 5), GOLD, [0.15, 1.27, 0.02]),
      P(box(0.44, 0.62, 0.05), T.dark, [0, 0.5, -0.27], [0.12, 0, 0]), P(cyl(0.02, 0.02, 1.2, 6), WOOD_D, [-0.14, 1.05, -0.24]), P(box(0.42, 0.3, 0.025), T.main, [0.08, 1.45, -0.24]), P(sph(0.05), GOLD, [-0.14, 1.67, -0.24]));
    p.armR.push(P(box(0.055, 0.62, 0.1), '#eef1f5', [0, -0.3, 0.38], AXIS_Z), P(box(0.2, 0.05, 0.06), GOLD, [0, -0.3, 0.08]));
    p.armL.push(P(cyl(0.22, 0.22, 0.05, 14), GOLD, [-0.03, -0.22, 0.13], AXIS_Z), P(cyl(0.15, 0.15, 0.06, 14), T.main, [-0.03, -0.22, 0.135], AXIS_Z));
  } }),
  sturmrufer: T => { const d = human(T, { s: 1.15, h: 1.6, robe: '#27406e', sleeve: '#27406e', gold: true, extra: p => {
    p.body.push(P(cyl(0.352, 0.352, 0.06, 14), GOLD, [0, 0.1, 0]), P(cyl(0.21, 0.21, 0.07, 14), T.main, [0, 0.5, 0]), P(sph(0.262), '#1c2f55', [0, 0.97, -0.07]), P(cone(0.2, 0.3), '#1c2f55', [0, 1.2, -0.08], [-0.4, 0, 0]),
      P(sph(0.15), '#f2f2f2', [0, 0.78, 0.13], [0, 0, 0], [1, 1.3, 0.7]), P(torus(0.25, 0.025), GOLD, [0, 1.0, -0.02], [PI / 2 - 0.25, 0, 0]));
    p.armR.push(staff(GOLD_D, 1.05));
    p.gOrb = [P(octa(0.13), '#fff27a', [0, 0, 0], [0, 0, 0], [1, 1.5, 1]), P(octa(0.08), '#ffffff', [0, 0, 0], [0, PI / 4, 0], [1, 1.8, 1]), P(octa(0.05), T.light, [-0.5, -0.1, -0.4]), P(octa(0.05), T.light, [-0.05, -0.05, -0.6])];
  } }); d.piv.gOrb = [ORB_AT[0], 1.2, ORB_AT[2]]; return d; },
  steinhueter: T => golem(T),
  steinling: T => { const d = golem(T); d.s = 0.62; return d; },
  wicht: T => ({
    kind: 'blob', s: 1, h: 0.75,
    parts: { body: [...baseRing(T, 0.28), P(sph(0.24), '#7b5637', [0, 0.27, 0], [0, 0, 0], [1, 0.92, 1]), P(cone(0.07, 0.28, 6), T.main, [-0.17, 0.52, 0], [0, 0, 0.6]), P(cone(0.07, 0.28, 6), T.main, [0.17, 0.52, 0], [0, 0, -0.6]),
      P(sph(0.055), '#ffe26a', [-0.09, 0.32, 0.2]), P(sph(0.055), '#ffe26a', [0.09, 0.32, 0.2]), P(sph(0.07), '#3b2716', [-0.1, 0.05, 0.06]), P(sph(0.07), '#3b2716', [0.1, 0.05, 0.06])] },
    piv: {},
  }),
  kiesel: T => ({
    kind: 'blob', s: 1, h: 0.5,
    parts: { body: [...baseRing(T, 0.2), P(rock1(0.17), STONE, [0, 0.19, 0], [0, 0.4, 0], [1, 0.9, 1]), P(sph(0.036), '#ffe26a', [-0.06, 0.23, 0.14]), P(sph(0.036), '#ffe26a', [0.06, 0.23, 0.14]), P(octa(0.075), T.main, [0, 0.4, -0.02], [0, 0, 0], [1, 1.5, 1])] },
    piv: {},
  }),
  glutling: T => ({
    kind: 'blob', s: 1, h: 0.75,
    parts: { body: [...baseRing(T, 0.26), P(sph(0.2), '#ff8a2a', [0, 0.26, 0]), P(cone(0.15, 0.34, 8), '#ffa53d', [0, 0.52, -0.01]), P(sph(0.04), INK, [-0.07, 0.3, 0.17]), P(sph(0.04), INK, [0.07, 0.3, 0.17]), P(torus(0.17, 0.035), T.main, [0, 0.15, 0], AXIS_Z)],
      gFlame: [P(cone(0.09, 0.26, 6), '#ffe08a', [0, 0.52, 0.02]), P(sph(0.07), '#fff3c4', [0, 0.38, 0.1])] },
    piv: {},
  }),
  kraehe: T => ({
    kind: 'bird', s: 1, h: 0.4,
    parts: {
      body: [P(sph(0.2), '#232842', [0, 0, 0], [0, 0, 0], [0.8, 0.7, 1.25]), P(sph(0.13), '#232842', [0, 0.08, 0.24]), P(cone(0.045, 0.16, 6), '#f2b33d', [0, 0.06, 0.41], AXIS_Z), P(sph(0.03), '#fff', [-0.07, 0.12, 0.33]), P(sph(0.03), '#fff', [0.07, 0.12, 0.33]),
        P(torus(0.11, 0.036), T.main, [0, 0.03, 0.14]), P(cone(0.09, 0.24, 4), '#1a1e33', [0, 0.02, -0.33], [-PI / 2, 0, 0])],
      wingL: [P(box(0.42, 0.03, 0.26), '#343b5c', [-0.21, 0, 0]), P(box(0.12, 0.035, 0.27), T.main, [-0.36, 0, 0])], wingR: [P(box(0.42, 0.03, 0.26), '#343b5c', [0.21, 0, 0]), P(box(0.12, 0.035, 0.27), T.main, [0.36, 0, 0])],
    },
    piv: { wingL: [-0.12, 0.05, 0], wingR: [0.12, 0.05, 0] },
  }),
  rochen: T => ({
    kind: 'ray', s: 1, h: 0.5,
    parts: {
      body: [P(sph(0.5), '#8e7cc3', [0, 0, 0], [0, 0, 0], [0.9, 0.28, 1]), P(sph(0.3), '#b3a5dc', [0, 0.08, 0], [0, 0, 0], [0.8, 0.3, 0.9]), P(sph(0.05), '#fff', [-0.2, 0.08, 0.42]), P(sph(0.05), '#fff', [0.2, 0.08, 0.42]),
        P(cyl(0.012, 0.03, 0.75, 6), '#5b4a86', [0, 0, -0.82], AXIS_Z), P(box(0.5, 0.03, 0.08), T.main, [0, 0.16, -0.12]), P(box(0.42, 0.03, 0.08), T.main, [0, 0.15, 0.1])],
      wingL: [P(sph(0.42), '#7a68b3', [-0.3, 0, 0], [0, 0, 0], [1, 0.12, 0.8])], wingR: [P(sph(0.42), '#7a68b3', [0.3, 0, 0], [0, 0, 0], [1, 0.12, 0.8])],
    },
    piv: { wingL: [-0.32, 0, 0], wingR: [0.32, 0, 0] },
  }),
  donnerkaefer: T => ({
    kind: 'beetle', s: 1, h: 0.75,
    parts: {
      body: [P(sph(0.42), '#2f6a58', [0, 0, 0], [0, 0, 0], [1, 0.7, 1.2]), P(sph(0.3), '#e8d9a8', [0, -0.12, 0.02], [0, 0, 0], [1, 0.5, 1.1]), P(sph(0.2), '#1f4439', [0, 0.02, 0.5]), P(cone(0.06, 0.34, 6), BONE, [0, 0.14, 0.72], [1.1, 0, 0]),
        P(sph(0.045), '#ffe26a', [-0.11, 0.08, 0.66]), P(sph(0.045), '#ffe26a', [0.11, 0.08, 0.66]), P(box(0.5, 0.04, 0.1), T.main, [0, 0.28, -0.1]), P(box(0.36, 0.04, 0.1), T.main, [0, 0.25, -0.34]), P(box(0.04, 0.05, 0.7), T.dark, [0, 0.29, -0.05]),
        P(rock(0.3), STONE, [0, -0.5, 0], [0.4, 0.7, 0]), P(cyl(0.015, 0.015, 0.3, 4), INK, [-0.15, -0.3, 0.1]), P(cyl(0.015, 0.015, 0.3, 4), INK, [0.15, -0.3, 0.1])],
      wingL: [P(box(0.55, 0.02, 0.3), '#d9f2ee', [-0.3, 0, 0])], wingR: [P(box(0.55, 0.02, 0.3), '#d9f2ee', [0.3, 0, 0])],
    },
    piv: { wingL: [-0.22, 0.26, -0.1], wingR: [0.22, 0.26, -0.1] },
  }),
  hornbulle: T => {
    const leg = () => [P(box(0.15, 0.36, 0.17), '#5d3d24', [0, -0.18, 0]), P(box(0.17, 0.08, 0.2), INK, [0, -0.36, 0.01])];
    return {
      kind: 'beast', s: 1, h: 1.25,
      parts: {
        body: [...baseRing(T, 0.6), P(caps(0.34, 0.5), '#8f5d3b', [0, 0.66, 0], AXIS_Z), P(box(0.72, 0.26, 0.4), T.main, [0, 0.82, -0.05]), P(box(0.5, 0.05, 0.44), T.dark, [0, 0.98, -0.05]),
          P(sph(0.27), '#7d5032', [0, 0.66, 0.6]), P(sph(0.16), '#e6cba6', [0, 0.57, 0.83]), P(sph(0.04), INK, [-0.14, 0.75, 0.8]), P(sph(0.04), INK, [0.14, 0.75, 0.8]), P(sph(0.03), INK, [-0.06, 0.58, 0.98]), P(sph(0.03), INK, [0.06, 0.58, 0.98]),
          P(cone(0.07, 0.42, 6), BONE, [-0.24, 0.92, 0.7], [0.9, 0, 0.5]), P(cone(0.07, 0.42, 6), BONE, [0.24, 0.92, 0.7], [0.9, 0, -0.5]), P(cyl(0.025, 0.015, 0.36, 5), '#5d3d24', [0, 0.7, -0.68], [-0.9, 0, 0])],
        legFL: leg(), legFR: leg(), legBL: leg(), legBR: leg(),
      },
      piv: { legFL: [-0.2, 0.42, 0.3], legFR: [0.2, 0.42, 0.3], legBL: [-0.2, 0.42, -0.32], legBR: [0.2, 0.42, -0.32] },
    };
  },
  ballista: T => ({
    kind: 'turret', s: 1, h: 1.0,
    parts: {
      body: [P(cyl(0.88, 0.88, 0.04, 16), T.main, [0, 0.02, 0]), P(cyl(0.76, 0.82, 0.22, 12), WOOD, [0, 0.13, 0]), P(cyl(0.6, 0.6, 0.06, 12), '#b58f5e', [0, 0.27, 0]), P(cyl(0.1, 0.15, 0.2, 8), WOOD_D, [0, 0.38, 0])],
      top: [P(box(0.16, 0.12, 1.3), WOOD_D, [0, 0, 0.15]), P(torus(0.55, 0.045, PI), T.main, [0, 0.07, 0.3], basis([1, 0, 0], [0, 0, 1], [0, -1, 0])), P(cyl(0.025, 0.025, 0.8, 6), '#e6e9ee', [0, 0.09, 0.45], AXIS_Z), P(cone(0.06, 0.16, 6), STEEL, [0, 0.09, 0.92], AXIS_Z)],
    },
    piv: { top: [0, 0.5, 0] },
  }),
  steinschleuder: T => ({
    kind: 'turret', s: 1, h: 1.1,
    parts: {
      body: [P(cyl(0.82, 0.82, 0.04, 16), T.main, [0, 0.02, 0]), P(cyl(0.68, 0.74, 0.2, 10), STONE_D, [0, 0.12, 0]), P(cyl(0.52, 0.52, 0.05, 10), STONE_L, [0, 0.24, 0])],
      top: [P(box(0.08, 0.5, 0.1), WOOD_D, [-0.22, 0.2, 0]), P(box(0.08, 0.5, 0.1), WOOD_D, [0.22, 0.2, 0]), P(cyl(0.035, 0.035, 0.52, 6), STEEL_D, [0, 0.42, 0], [0, 0, PI / 2]),
        P(box(0.08, 0.08, 1.0), WOOD, [0, 0.5, 0.1], [-0.45, 0, 0]), P(sph(0.15), STONE, [0, 0.76, 0.55]), P(box(0.22, 0.2, 0.2), T.main, [0, 0.28, -0.36])],
    },
    piv: { top: [0, 0.28, 0] },
  }),
  erdloch: T => ({
    kind: 'static', s: 1, h: 0.75,
    parts: { body: [P(cyl(0.92, 0.92, 0.03, 16), T.main, [0, 0.015, 0]), P(sph(0.85), '#6b4f32', [0, 0, 0], [0, 0, 0], [1, 0.42, 1]), P(torus(0.42, 0.12), '#8a6a43', [0, 0.33, 0], AXIS_Z), P(cyl(0.36, 0.36, 0.02, 16), '#150e08', [0, 0.37, 0]),
      P(cone(0.08, 0.34, 5), T.main, [-0.55, 0.38, 0.1], [0, 0, 0.5]), P(cone(0.08, 0.34, 5), T.main, [0.5, 0.4, -0.2], [0, 0, -0.5]), P(cone(0.07, 0.3, 5), T.main, [0.1, 0.42, -0.55], [-0.5, 0, 0])] },
    piv: {},
  }),
  // ---- Erweiterung: weitere Figuren --------------------------------------------------------------
  schildknappe: T => human(T, { s: 0.86, extra: p => {
    p.body.push(P(sph(0.255), STEEL, [0, 1.05, -0.03], [0, 0, 0], [1, 0.62, 1]), P(cone(0.05, 0.14, 5), T.main, [0, 1.24, -0.03]));
    p.armL.push(P(box(0.44, 0.6, 0.03), STEEL, [-0.03, -0.24, 0.13]), P(box(0.4, 0.56, 0.05), T.main, [-0.03, -0.24, 0.15]), P(box(0.08, 0.5, 0.06), T.dark, [-0.03, -0.24, 0.18]));
    p.armR.push(P(cyl(0.02, 0.02, 0.95, 5), WOOD_D, [0, -0.3, 0.3], AXIS_Z), P(cone(0.05, 0.16, 5), STEEL, [0, -0.3, 0.84], AXIS_Z));
  } }),
  brockenwerfer: T => human(T, { s: 1.5, h: 1.4, skin: '#8fae6a', sleeve: '#8fae6a', fist: 0.12, extra: p => {
    p.body.push(P(sph(0.3), '#8fae6a', [0, 0.56, 0.06], [0, 0, 0], [1.05, 0.9, 0.95]), P(box(0.5, 0.12, 0.44), T.main, [0, 0.36, 0.02]), P(cone(0.035, 0.14, 5), BONE, [-0.1, 0.86, 0.2], [0.2, 0, 0]), P(cone(0.035, 0.14, 5), BONE, [0.1, 0.86, 0.2], [0.2, 0, 0]),
      P(sph(0.09), '#7d9a5c', [-0.26, 0.98, 0], [0, 0, 0], [0.5, 1, 0.8]), P(sph(0.09), '#7d9a5c', [0.26, 0.98, 0], [0, 0, 0], [0.5, 1, 0.8]), P(torus(0.27, 0.035), WOOD_D, [0, 0.62, 0.03], [PI / 2, 0.7, 0]), P(sph(0.12), '#6b8550', [0, 1.14, -0.04], [0, 0, 0], [1.4, 0.5, 1.2]));
    p.armR.push(P(rock1(0.21), STONE, [0, -0.44, 0.05], [0.3, 0.5, 0]));
  } }),
  kegler: T => human(T, { s: 1.4, h: 1.4, skin: '#8aa0c0', sleeve: '#8aa0c0', fist: 0.11, extra: p => {
    p.body.push(P(sph(0.29), '#8aa0c0', [0, 0.55, 0.05], [0, 0, 0], [1.05, 0.85, 0.95]), P(box(0.56, 0.1, 0.44), T.dark, [0, 0.38, 0.01]), P(torus(0.24, 0.035), WOOD_D, [0, 1.02, 0], AXIS_Z), P(cone(0.07, 0.2, 6), BONE, [0, 1.22, 0]),
      P(sph(0.13), '#f2f2f2', [0, 0.78, 0.15], [0, 0, 0], [1.2, 0.9, 0.6]));
    p.armR.push(P(sph(0.2), STONE_D, [0, -0.46, 0.03]), P(torus(0.2, 0.022), T.main, [0, -0.46, 0.03]));
  } }),
  sternschuetzin: T => human(T, { s: 0.95, extra: p => {
    p.body.push(P(sph(0.255), '#d9dde8', [0, 0.97, -0.08]), P(caps(0.07, 0.3), '#d9dde8', [0, 0.72, -0.26], [0.25, 0, 0]), P(torus(0.238, 0.025), GOLD, [0, 1.03, 0], AXIS_Z), P(octa(0.06), '#fff27a', [0, 1.06, 0.24], [0, 0, 0], [1, 1.4, 0.5]),
      P(box(0.4, 0.55, 0.04), '#27406e', [0, 0.52, -0.25], [0.12, 0, 0]), P(octa(0.07), '#fff27a', [0, 0.6, -0.285], [0, 0, 0], [1, 1, 0.3]));
    p.armL.push(P(torus(0.3, 0.022, PI), GOLD, [0, -0.3, 0], basis([0, 0, 1], [0, -1, 0], [1, 0, 0])), P(cyl(0.007, 0.007, 0.6, 4), '#fff6d8', [0, -0.3, 0], AXIS_Z), P(octa(0.05), '#fff27a', [0, -0.3, 0.3]));
  } }),
  blitzfaenger: T => { const d = human(T, { s: 0.98, h: 1.55, robe: true, extra: p => {
    p.body.push(P(sph(0.25), '#c9793a', [0, 1.04, -0.05], [0, 0, 0], [1, 0.6, 1]), P(box(0.36, 0.1, 0.06), '#3b2a1a', [0, 0.968, 0.205]), P(sph(0.065), '#bfeaff', [-0.095, 0.968, 0.235]), P(sph(0.065), '#bfeaff', [0.095, 0.968, 0.235]),
      P(cyl(0.02, 0.02, 0.6, 5), '#c9793a', [-0.17, 1.0, -0.24], [0, 0, 0.25]), P(cyl(0.02, 0.02, 0.6, 5), '#c9793a', [0.17, 1.0, -0.24], [0, 0, -0.25]), P(sph(0.055), '#fff27a', [-0.245, 1.3, -0.24]), P(sph(0.055), '#fff27a', [0.245, 1.3, -0.24]),
      P(torus(0.16, 0.025), '#c9793a', [0, 0.34, 0], AXIS_Z), P(torus(0.2, 0.025), '#c9793a', [0, 0.22, 0], AXIS_Z));
    p.gOrb = [P(octa(0.1), '#fff27a', [0, 0, 0], [0, 0, 0], [1, 1.4, 1]), P(octa(0.06), '#ffffff', [0, 0, 0], [0, PI / 4, 0], [1, 1.7, 1])];
  } }); d.piv.gOrb = [0.3, 0.62, 0.3]; return d; },
  trommelschlaeger: T => human(T, { s: 1.05, extra: p => {
    p.body.push(P(box(0.07, 0.17, 0.36), T.main, [0, 1.2, -0.03]), P(torus(0.238, 0.03), '#b5482c', [0, 1.02, 0], AXIS_Z), P(cyl(0.19, 0.19, 0.2, 14), WOOD, [0, 0.5, 0.27], [1.0, 0, 0]),
      P(cyl(0.2, 0.2, 0.03, 14), '#f1e3c4', [0, 0.556, 0.357], [1.0, 0, 0]), P(cyl(0.2, 0.2, 0.03, 14), T.dark, [0, 0.444, 0.183], [1.0, 0, 0]), P(torus(0.27, 0.025), WOOD_D, [0, 0.64, 0.05], [PI / 2 - 0.5, 0, 0]));
    for (const a of [p.armL, p.armR]) a.push(P(cyl(0.018, 0.018, 0.34, 5), BONE, [0, -0.3, 0.15], AXIS_Z), P(sph(0.04), BONE, [0, -0.3, 0.33]));
  } }),
  weitschuetzin: T => human(T, { s: 0.9, extra: p => {
    p.body.push(P(cyl(0.37, 0.37, 0.03, 16), '#5b7a3a', [0, 1.1, 0]), P(cone(0.2, 0.2, 10), '#6b8f44', [0, 1.21, 0]), P(cone(0.04, 0.42, 5), '#f2f2f2', [0.2, 1.3, -0.1], [-0.5, 0, -0.5]), P(sph(0.2), '#c96a3a', [0, 0.9, -0.12]),
      P(box(0.12, 0.34, 0.1), WOOD_D, [-0.08, 0.6, -0.26], [0, 0, -0.3]));
    p.armL.push(P(torus(0.42, 0.022, PI), WOOD, [0, -0.3, 0], basis([0, 0, 1], [0, -1, 0], [1, 0, 0])), P(cyl(0.007, 0.007, 0.84, 4), '#e8e2d0', [0, -0.3, 0], AXIS_Z));
  } }),
  nebelschleicher: T => human(T, { s: 1.0, h: 1.45, robe: '#aab6c2', sleeve: '#aab6c2', skin: '#dfe6ee', extra: p => {
    p.body.push(P(sph(0.27), '#8793a2', [0, 0.97, -0.07]), P(cone(0.2, 0.34), '#8793a2', [0, 1.2, -0.1], [-0.5, 0, 0]), P(cyl(0.22, 0.22, 0.08, 12), T.main, [0, 0.72, 0]), P(box(0.1, 0.34, 0.04), T.main, [0.12, 0.52, 0.2], [0, 0, -0.15]),
      P(cyl(0.352, 0.352, 0.05, 14), '#c9d3dd', [0, 0.07, 0]));
    p.armR.push(P(box(0.035, 0.36, 0.08), '#e3e7ee', [0, -0.3, 0.24], AXIS_Z), P(box(0.12, 0.035, 0.05), INK, [0, -0.3, 0.06]));
  } }),
  zuendler: T => human(T, { s: 0.85, extra: p => {
    p.body.push(P(sph(0.25), '#5d3d24', [0, 1.05, -0.04], [0, 0, 0], [1, 0.6, 1]), P(box(0.3, 0.05, 0.14), '#5d3d24', [0, 1.02, 0.2]), P(torus(0.25, 0.03), WOOD_D, [0, 0.56, 0], [PI / 2, 0.6, 0]), P(sph(0.06), '#b5482c', [-0.14, 0.5, 0.2]), P(sph(0.06), '#b5482c', [0.02, 0.6, 0.23]));
    p.armR.push(P(sph(0.13), '#b5482c', [0, -0.42, 0.02]), P(cyl(0.05, 0.07, 0.06, 8), '#3b2716', [0, -0.3, 0.02]), P(cone(0.04, 0.12, 5), '#ffe08a', [0, -0.21, 0.02]));
  } }),
  feldheilerin: T => { const d = human(T, { s: 1.02, h: 1.5, robe: '#eef2ee', sleeve: '#eef2ee', extra: p => {
    p.body.push(P(cyl(0.21, 0.21, 0.07, 14), T.main, [0, 0.5, 0]), P(cyl(0.352, 0.352, 0.05, 14), T.main, [0, 0.08, 0]), P(sph(0.25), '#8a5a34', [0, 0.98, -0.07]), P(sph(0.12), '#8a5a34', [0, 1.22, -0.1]), P(sph(0.07), '#6fb455', [0.13, 1.14, 0.08]),
      P(box(0.16, 0.2, 0.1), '#9a6634', [-0.2, 0.36, 0.14]));
    p.armR.push(staff('#c9b98a'));
    p.gOrb = [P(sph(0.11), '#7dffa8'), P(sph(0.06), '#eafff0', [0.03, 0.03, 0.04])];
  } }); d.piv.gOrb = ORB_AT; return d; },
  fasstraeger: T => human(T, { s: 1.45, h: 1.45, fist: 0.11, extra: p => {
    p.body.push(P(cyl(0.26, 0.26, 0.5, 12), WOOD, [0, 0.72, -0.34]), P(cyl(0.27, 0.27, 0.05, 12), STEEL_D, [0, 0.58, -0.34]), P(cyl(0.27, 0.27, 0.05, 12), STEEL_D, [0, 0.86, -0.34]), P(cyl(0.2, 0.2, 0.02, 12), WOOD_D, [0, 0.98, -0.34]),
      P(cyl(0.012, 0.012, 0.16, 4), INK, [0.05, 1.05, -0.34], [0, 0, -0.3]), P(box(0.5, 0.06, 0.34), WOOD_D, [0, 0.66, -0.12]), P(sph(0.16), '#5d3d24', [0, 0.8, 0.14], [0, 0, 0], [1.2, 0.8, 0.6]), P(box(0.34, 0.06, 0.05), INK, [0.02, 1.0, 0.225], [0, 0, 0.2]));
    p.gFuse = [P(sph(0.05), '#ffe08a', [0.08, 1.14, -0.34])];
  } }),
  schattenjaegerin: T => human(T, { s: 1.12, h: 1.6, gold: true, sleeve: '#3a2a55', extra: p => {
    p.body.push(P(sph(0.262), '#3a2a55', [0, 0.98, -0.07]), P(cone(0.2, 0.34), '#3a2a55', [0, 1.22, -0.1], [-0.45, 0, 0]), P(box(0.3, 0.08, 0.04), '#2a1d40', [0, 0.89, 0.225]), P(torus(0.25, 0.025), GOLD, [0, 1.0, -0.02], [PI / 2 - 0.25, 0, 0]),
      P(box(0.46, 0.66, 0.04), '#3a2a55', [0, 0.5, -0.26], [0.14, 0, 0]), P(box(0.46, 0.06, 0.045), GOLD, [0, 0.2, -0.3], [0.14, 0, 0]), P(box(0.1, 0.36, 0.1), '#2a1d40', [0.1, 0.62, -0.3], [0, 0, 0.3]), P(cyl(0.262, 0.262, 0.06), GOLD, [0, 0.36, 0]));
    p.armL.push(P(torus(0.32, 0.026, PI), '#2a1d40', [0, -0.3, 0], basis([0, 0, 1], [0, -1, 0], [1, 0, 0])), P(cyl(0.008, 0.008, 0.64, 4), '#c98bff', [0, -0.3, 0], AXIS_Z), P(octa(0.05), GOLD, [0, -0.3, 0.32]), P(octa(0.05), GOLD, [0, -0.3, -0.32]));
  } }),
  wurzelkoenig: T => human(T, { s: 1.4, h: 1.7, gold: true, skin: '#8a6a43', sleeve: '#6b4a2b', fist: 0.11, extra: p => {
    p.body.push(P(cyl(0.21, 0.27, 0.42), '#6b4a2b', [0, 0.52, 0]), P(box(0.3, 0.3, 0.03), T.main, [0, 0.52, 0.245]), P(sph(0.3), '#4f8a3c', [0, 0.72, -0.16], [0, 0, 0], [1.25, 0.9, 0.7]),
      P(torus(0.21, 0.04), GOLD, [0, 1.14, -0.02], AXIS_Z), P(cone(0.05, 0.3, 5), '#5d3d1f', [-0.17, 1.3, -0.02], [0, 0, 0.45]), P(cone(0.05, 0.3, 5), '#5d3d1f', [0.17, 1.3, -0.02], [0, 0, -0.45]), P(cone(0.04, 0.2, 5), '#5d3d1f', [-0.3, 1.34, -0.02], [0, 0, 1.0]), P(cone(0.04, 0.2, 5), '#5d3d1f', [0.3, 1.34, -0.02], [0, 0, -1.0]),
      P(sph(0.07), '#6fb455', [-0.12, 1.2, 0.1]), P(sph(0.07), '#6fb455', [0.14, 1.22, 0.06]), P(sph(0.14), '#5fa049', [0, 0.78, 0.16], [0, 0, 0], [1.3, 0.9, 0.6]));
    p.armR.push(P(cyl(0.05, 0.035, 0.6, 6), WOOD_D, [0, -0.3, 0.26], AXIS_Z), P(rock1(0.17), WOOD, [0, -0.3, 0.62], [0.3, 0.2, 0], [1, 1, 1.3]), P(cone(0.04, 0.12, 5), '#6fb455', [0.1, -0.2, 0.62], [0, 0, -0.8]));
  } }),
  windlaeufer: T => human(T, { s: 1.2, h: 1.65, gold: true, sleeve: '#e8edf2', extra: p => {
    p.body.push(P(cyl(0.21, 0.262, 0.3), '#e8edf2', [0, 0.57, 0]), P(sph(0.255), '#e8edf2', [0, 1.05, -0.05], [0, 0, 0], [1, 0.62, 1]), P(cone(0.05, 0.4, 5), T.main, [0.06, 1.3, -0.14], [-0.9, 0, 0]), P(cone(0.04, 0.3, 5), GOLD, [-0.06, 1.26, -0.12], [-0.9, 0, 0]),
      P(torus(0.21, 0.035), GOLD, [0, 0.76, 0], AXIS_Z), P(box(0.16, 0.06, 0.7), T.main, [0.1, 0.78, -0.5], [0.25, 0.15, 0]), P(box(0.14, 0.05, 0.4), T.dark, [0.16, 0.9, -0.95], [0.5, 0.2, 0]), P(cyl(0.262, 0.262, 0.06), GOLD, [0, 0.36, 0]));
    p.armR.push(P(box(0.04, 0.66, 0.11), '#eef1f5', [0, -0.3, 0.4], AXIS_Z), P(box(0.18, 0.05, 0.06), GOLD, [0, -0.3, 0.08]), P(box(0.04, 0.2, 0.09), '#eef1f5', [0, -0.26, 0.74], [1.2, 0, 0]));
  } }),
  dornwerfer: T => ({
    kind: 'blob', s: 1, h: 0.8,
    parts: { body: [...baseRing(T, 0.27), P(sph(0.21), '#5fa049', [0, 0.26, 0], [0, 0, 0], [1, 1.05, 1]), P(cone(0.1, 0.3, 6), '#3f8a3a', [0, 0.56, -0.02]), P(sph(0.06), '#ff9db5', [0.02, 0.72, -0.02]),
      P(sph(0.05), '#fff', [-0.08, 0.3, 0.17]), P(sph(0.05), '#fff', [0.08, 0.3, 0.17]), P(sph(0.028), INK, [-0.08, 0.3, 0.21]), P(sph(0.028), INK, [0.08, 0.3, 0.21]), P(torus(0.18, 0.035), T.main, [0, 0.14, 0], AXIS_Z),
      P(cone(0.035, 0.42, 5), BONE, [0.22, 0.34, 0.08], [1.2, 0, 0]), P(sph(0.06), '#3b2716', [-0.09, 0.04, 0.05]), P(sph(0.06), '#3b2716', [0.09, 0.04, 0.05])] },
    piv: {},
  }),
  blasrohrwicht: T => ({
    kind: 'blob', s: 1, h: 0.85,
    parts: { body: [...baseRing(T, 0.28), P(sph(0.22), '#c79a5e', [0, 0.27, 0]), P(cone(0.34, 0.2, 8), T.main, [0, 0.52, 0]), P(cone(0.12, 0.16, 6), T.dark, [0, 0.66, 0]),
      P(sph(0.05), '#fff', [-0.09, 0.32, 0.18]), P(sph(0.05), '#fff', [0.09, 0.32, 0.18]), P(sph(0.028), INK, [-0.09, 0.32, 0.22]), P(sph(0.028), INK, [0.09, 0.32, 0.22]),
      P(cyl(0.028, 0.028, 0.46, 6), WOOD, [0, 0.22, 0.4], AXIS_Z), P(cyl(0.035, 0.035, 0.05, 6), BONE, [0, 0.22, 0.62], AXIS_Z), P(sph(0.065), '#3b2716', [-0.1, 0.04, 0.05]), P(sph(0.065), '#3b2716', [0.1, 0.04, 0.05])] },
    piv: {},
  }),
  sprengkaefer: T => ({
    kind: 'blob', s: 1, h: 0.75,
    parts: { body: [...baseRing(T, 0.28), P(sph(0.21), '#3a3f52', [0, 0.2, 0.05], [0, 0, 0], [1, 0.75, 1.2]), P(sph(0.12), '#2a2f3a', [0, 0.2, 0.3]), P(sph(0.04), '#ffe26a', [-0.07, 0.24, 0.38]), P(sph(0.04), '#ffe26a', [0.07, 0.24, 0.38]),
      P(cyl(0.15, 0.15, 0.3, 10), '#b5482c', [0, 0.44, -0.02], [0, 0, PI / 2]), P(cyl(0.155, 0.155, 0.05, 10), T.main, [-0.09, 0.44, -0.02], [0, 0, PI / 2]), P(cyl(0.155, 0.155, 0.05, 10), T.main, [0.09, 0.44, -0.02], [0, 0, PI / 2]), P(cyl(0.012, 0.012, 0.14, 4), INK, [0, 0.64, -0.02])],
      gFlame: [P(sph(0.05), '#ffe08a', [0, 0.72, -0.02])] },
    piv: {},
  }),
  wuehler: T => ({
    kind: 'blob', s: 1, h: 0.95,
    parts: { body: [...baseRing(T, 0.42), P(sph(0.33), '#5a4636', [0, 0.36, 0], [0, 0, 0], [1, 1.05, 1]), P(sph(0.2), '#6d5644', [0, 0.42, 0.22]), P(sph(0.06), '#ff9db5', [0, 0.42, 0.42]),
      P(sph(0.035), INK, [-0.12, 0.52, 0.32]), P(sph(0.035), INK, [0.12, 0.52, 0.32]), P(sph(0.2), STEEL, [0, 0.64, 0], [0, 0, 0], [1.1, 0.6, 1.1]), P(cyl(0.26, 0.26, 0.03, 12), STEEL_D, [0, 0.6, 0.02]), P(torus(0.3, 0.04), T.main, [0, 0.2, 0], AXIS_Z),
      ...[-1, 1].flatMap(sx => [0, 1, 2].map(i => P(cone(0.03, 0.18, 4), BONE, [sx * (0.26 + i * 0.05), 0.2 - i * 0.02, 0.26 - i * 0.04], [1.3, 0, 0])))],
      gLamp: [P(sph(0.07), '#fff3c4', [0, 0.7, 0.2])] },
    piv: {},
  }),
  nachtfalter: T => ({
    kind: 'bird', s: 1, h: 0.35,
    parts: {
      body: [P(sph(0.14), '#8d86a8', [0, 0, 0], [0, 0, 0], [0.8, 0.8, 1.3]), P(sph(0.1), '#a39cc0', [0, 0.04, 0.17]), P(sph(0.03), '#ffe26a', [-0.05, 0.08, 0.24]), P(sph(0.03), '#ffe26a', [0.05, 0.08, 0.24]),
        P(cyl(0.008, 0.008, 0.16, 4), INK, [-0.04, 0.16, 0.22], [0.5, 0, 0.3]), P(cyl(0.008, 0.008, 0.16, 4), INK, [0.04, 0.16, 0.22], [0.5, 0, -0.3])],
      wingL: [P(sph(0.2), '#d9d3ec', [-0.2, 0, 0.02], [0, 0, 0], [1, 0.08, 0.85]), P(sph(0.07), T.main, [-0.24, 0.012, 0.02], [0, 0, 0], [1, 0.1, 1])], wingR: [P(sph(0.2), '#d9d3ec', [0.2, 0, 0.02], [0, 0, 0], [1, 0.08, 0.85]), P(sph(0.07), T.main, [0.24, 0.012, 0.02], [0, 0, 0], [1, 0.1, 1])],
    },
    piv: { wingL: [-0.08, 0.03, 0], wingR: [0.08, 0.03, 0] },
  }),
  panzerhornisse: T => ({
    kind: 'beetle', s: 1, h: 0.6,
    parts: {
      body: [P(sph(0.3), '#e8b23a', [0, 0, -0.12], [0, 0, 0], [1, 0.85, 1.25]), P(torus(0.27, 0.05), '#2a2f3a', [0, 0, -0.05]), P(torus(0.22, 0.05), '#2a2f3a', [0, 0, -0.3]), P(sph(0.22), STEEL, [0, 0.04, 0.3]), P(box(0.3, 0.06, 0.2), T.main, [0, 0.2, 0.26]),
        P(sph(0.05), '#ff5a4a', [-0.1, 0.08, 0.47]), P(sph(0.05), '#ff5a4a', [0.1, 0.08, 0.47]), P(cone(0.07, 0.36, 6), BONE, [0, -0.08, -0.6], [-PI / 2 - 0.3, 0, 0]), P(cone(0.03, 0.2, 5), INK, [-0.08, -0.05, 0.52], [1.9, 0, 0]), P(cone(0.03, 0.2, 5), INK, [0.08, -0.05, 0.52], [1.9, 0, 0])],
      wingL: [P(box(0.5, 0.02, 0.26), '#d9f2ee', [-0.27, 0, 0])], wingR: [P(box(0.5, 0.02, 0.26), '#d9f2ee', [0.27, 0, 0])],
    },
    piv: { wingL: [-0.16, 0.22, -0.05], wingR: [0.16, 0.22, -0.05] },
  }),
  laternenfisch: T => ({
    kind: 'ray', s: 1, h: 0.6,
    parts: {
      body: [P(sph(0.42), '#2f5a6e', [0, 0, 0], [0, 0, 0], [0.85, 0.8, 1.1]), P(sph(0.3), '#3f7388', [0, -0.08, 0.2], [0, 0, 0], [0.9, 0.55, 0.9]), P(sph(0.09), '#fff', [-0.2, 0.14, 0.3]), P(sph(0.09), '#fff', [0.2, 0.14, 0.3]), P(sph(0.045), INK, [-0.22, 0.15, 0.37]), P(sph(0.045), INK, [0.22, 0.15, 0.37]),
        ...[-0.18, -0.06, 0.06, 0.18].map(x => P(cone(0.035, 0.12, 4), BONE, [x, -0.02, 0.44], [PI, 0, 0])), P(cone(0.2, 0.4, 4), '#24485a', [0, 0, -0.55], [-PI / 2, 0, 0], [0.3, 1, 1]), P(box(0.36, 0.03, 0.1), T.main, [0, 0.33, -0.05]), P(box(0.05, 0.14, 0.4), T.main, [0, 0.36, -0.1]),
        P(cyl(0.015, 0.02, 0.42, 5), '#24485a', [0, 0.42, 0.28], [0.9, 0, 0])],
      wingL: [P(sph(0.2), '#3f7388', [-0.16, 0, 0], [0, 0, 0], [1, 0.12, 0.7])], wingR: [P(sph(0.2), '#3f7388', [0.16, 0, 0], [0, 0, 0], [1, 0.12, 0.7])],
      gOrb: [P(sph(0.1), '#ffe08a'), P(sph(0.055), '#fff6d8', [0.02, 0.03, 0.03])],
    },
    piv: { wingL: [-0.34, -0.05, 0], wingR: [0.34, -0.05, 0], gOrb: [0, 0.56, 0.47] },
  }),
  eisbrocken: T => { const d = golem(T, { stone: '#a9d3ea', dark: '#7fb2d0', light: '#dff3ff', cap: '#f4fbff' }); d.s = 0.72; return d; },
  basaltriese: T => { const d = golem(T, { stone: '#4a4f5c', dark: '#33373f', light: '#6a7080', cap: '#ff8a2a' }); d.s = 1.22; return d; },
  panzerbaer: T => {
    const leg = () => [P(box(0.2, 0.4, 0.22), '#5a4030', [0, -0.2, 0]), P(box(0.23, 0.09, 0.27), INK, [0, -0.4, 0.02])];
    return {
      kind: 'beast', s: 1.12, h: 1.4,
      parts: {
        body: [...baseRing(T, 0.62), P(caps(0.4, 0.5), '#6d5038', [0, 0.74, -0.02], AXIS_Z), P(box(0.86, 0.3, 0.3), T.main, [0, 0.86, -0.05]), P(box(0.7, 0.14, 0.6), STEEL, [0, 1.1, -0.05]), P(box(0.5, 0.08, 0.5), STEEL_D, [0, 1.2, -0.05]),
          P(sph(0.3), '#7a5a40', [0, 0.82, 0.62]), P(sph(0.16), '#c9a57c', [0, 0.72, 0.86]), P(sph(0.05), INK, [0, 0.76, 1.0]), P(sph(0.045), INK, [-0.14, 0.92, 0.84]), P(sph(0.045), INK, [0.14, 0.92, 0.84]),
          P(sph(0.1), '#5a4030', [-0.22, 1.08, 0.58]), P(sph(0.1), '#5a4030', [0.22, 1.08, 0.58]), P(sph(0.24), STEEL, [0, 0.98, 0.56], [0, 0, 0], [1.1, 0.5, 0.9]), P(cone(0.05, 0.16, 5), GOLD, [0, 1.14, 0.56])],
        legFL: leg(), legFR: leg(), legBL: leg(), legBR: leg(),
      },
      piv: { legFL: [-0.26, 0.46, 0.3], legFR: [0.26, 0.46, 0.3], legBL: [-0.26, 0.46, -0.36], legBR: [0.26, 0.46, -0.36] },
    };
  },
  gewitterkarren: T => ({
    kind: 'cart', s: 1, h: 1.5,
    parts: {
      body: [...baseRing(T, 0.62), P(box(0.8, 0.26, 1.0), WOOD, [0, 0.36, 0]), P(box(0.86, 0.06, 1.06), WOOD_D, [0, 0.5, 0]), P(box(0.84, 0.1, 0.16), T.main, [0, 0.36, 0.52]),
        ...[-1, 1].flatMap(sx => [-0.3, 0.3].map(z => P(cyl(0.2, 0.2, 0.09, 12), WOOD_D, [sx * 0.45, 0.2, z], [0, 0, PI / 2]))), ...[-1, 1].flatMap(sx => [-0.3, 0.3].map(z => P(cyl(0.07, 0.07, 0.11, 8), STEEL, [sx * 0.45, 0.2, z], [0, 0, PI / 2]))),
        P(cyl(0.12, 0.2, 0.5, 8), '#c9793a', [0, 0.78, 0]), P(torus(0.17, 0.03), STEEL, [0, 0.66, 0], AXIS_Z), P(torus(0.15, 0.03), STEEL, [0, 0.82, 0], AXIS_Z), P(torus(0.13, 0.03), STEEL, [0, 0.96, 0], AXIS_Z),
        P(cyl(0.02, 0.02, 0.5, 5), STEEL_D, [-0.3, 0.78, -0.4]), P(cyl(0.02, 0.02, 0.5, 5), STEEL_D, [0.3, 0.78, -0.4]), P(sph(0.05), '#fff27a', [-0.3, 1.05, -0.4]), P(sph(0.05), '#fff27a', [0.3, 1.05, -0.4])],
      gCrystal: [P(octa(0.2), '#fff27a', [0, 0, 0], [0, 0, 0], [1, 1.4, 1]), P(octa(0.12), '#ffffff', [0, 0, 0], [0, PI / 4, 0], [1, 1.7, 1])],
    },
    piv: { gCrystal: [0, 1.28, 0] },
  }),
  // ---- Erweiterung: weitere Gebäude --------------------------------------------------------------
  sonnenspiegel: T => ({
    kind: 'turret', s: 1, h: 1.5,
    parts: {
      body: [P(cyl(0.88, 0.88, 0.04, 16), T.main, [0, 0.02, 0]), P(cyl(0.7, 0.78, 0.22, 8), STONE_D, [0, 0.13, 0]), P(cyl(0.2, 0.3, 0.7, 8), STONE, [0, 0.58, 0]), P(torus(0.24, 0.04), T.main, [0, 0.5, 0], AXIS_Z)],
      top: [P(cyl(0.5, 0.5, 0.05, 20), GOLD_D, [0, 0.2, 0.0], AXIS_Z), P(cyl(0.44, 0.44, 0.06, 20), '#fff6d8', [0, 0.2, 0.02], AXIS_Z), P(sph(0.1), '#ffe08a', [0, 0.2, 0.1]), P(box(0.08, 0.3, 0.08), STEEL_D, [0, 0, -0.03])],
    },
    piv: { top: [0, 0.98, 0] },
  }),
  kesselturm: T => ({
    kind: 'turret', s: 1, h: 1.35,
    parts: {
      body: [P(cyl(0.88, 0.88, 0.04, 16), T.main, [0, 0.02, 0]), P(cyl(0.62, 0.74, 0.7, 8), STONE, [0, 0.39, 0]), P(cyl(0.72, 0.62, 0.14, 8), STONE_L, [0, 0.8, 0]), P(cyl(0.64, 0.66, 0.1, 8), T.main, [0, 0.3, 0]), P(box(0.2, 0.3, 0.06), '#3b2a1a', [0, 0.2, 0.68])],
      top: [P(sph(0.42), '#2a2f3a', [0, 0.16, 0], [0, 0, 0], [1, 0.7, 1]), P(torus(0.36, 0.05), STEEL_D, [0, 0.34, 0], AXIS_Z), P(cyl(0.33, 0.33, 0.03, 14), '#3d2f1f', [0, 0.36, 0]), P(sph(0.07), '#5a4630', [0.1, 0.38, 0.05]), P(sph(0.05), '#5a4630', [-0.14, 0.38, -0.08]), P(box(0.06, 0.06, 0.5), WOOD, [0, 0.4, 0.3], [-0.5, 0, 0])],
    },
    piv: { top: [0, 0.87, 0] },
  }),
  fernschleuder: T => ({
    kind: 'turret', s: 1, h: 1.6,
    parts: {
      body: [P(cyl(0.9, 0.9, 0.04, 16), T.main, [0, 0.02, 0]), P(box(1.2, 0.12, 1.2), WOOD_D, [0, 0.1, 0]), P(box(1.1, 0.04, 1.1), WOOD, [0, 0.17, 0])],
      top: [P(box(0.08, 0.9, 0.1), WOOD_D, [-0.3, 0.42, 0], [0.25, 0, 0]), P(box(0.08, 0.9, 0.1), WOOD_D, [-0.3, 0.42, 0], [-0.25, 0, 0]), P(box(0.08, 0.9, 0.1), WOOD_D, [0.3, 0.42, 0], [0.25, 0, 0]), P(box(0.08, 0.9, 0.1), WOOD_D, [0.3, 0.42, 0], [-0.25, 0, 0]),
        P(cyl(0.04, 0.04, 0.7, 6), STEEL_D, [0, 0.84, 0], [0, 0, PI / 2]), P(box(0.09, 0.09, 1.7), WOOD, [0, 0.9, -0.2], [0.5, 0, 0]), P(box(0.34, 0.34, 0.3), T.main, [0, 0.52, 0.5]), P(box(0.36, 0.08, 0.32), T.dark, [0, 0.52, 0.5]), P(sph(0.16), STONE, [0, 1.36, -0.9])],
    },
    piv: { top: [0, 0.18, 0] },
  }),
  glutofen: T => ({
    kind: 'static', s: 1, h: 1.1,
    parts: {
      body: [P(cyl(0.9, 0.9, 0.03, 16), T.main, [0, 0.015, 0]), P(cyl(0.7, 0.78, 0.2, 10), STONE_D, [0, 0.12, 0]), P(sph(0.62), '#b5673a', [0, 0.2, 0], [0, 0, 0], [1, 0.95, 1]), P(cyl(0.14, 0.18, 0.4, 8), '#8a4a2a', [0, 0.9, -0.2]), P(torus(0.3, 0.07, PI), '#8a4a2a', [0, 0.2, 0.52]), P(torus(0.64, 0.05), T.main, [0, 0.26, 0], AXIS_Z)],
      gGlow: [P(sph(0.26), '#ff8a2a', [0, 0.3, 0.42], [0, 0, 0], [1, 1, 0.5]), P(sph(0.14), '#ffe08a', [0, 0.27, 0.5], [0, 0, 0], [1, 1, 0.5])],
    },
    piv: {},
  }),
  kraftquell: T => ({
    kind: 'static', s: 1, h: 1.2,
    parts: {
      body: [P(cyl(0.9, 0.9, 0.03, 16), T.main, [0, 0.015, 0]), P(cyl(0.62, 0.7, 0.4, 10), STONE, [0, 0.22, 0]), P(torus(0.58, 0.09), STONE_L, [0, 0.42, 0], AXIS_Z), ...[0, 1, 2].map(i => P(box(0.1, 0.9, 0.1), STONE_D, [Math.sin(i * 2.094) * 0.6, 0.6, Math.cos(i * 2.094) * 0.6])), P(torus(0.62, 0.05), T.main, [0, 1.04, 0], AXIS_Z)],
      gGlow: [P(cyl(0.5, 0.5, 0.03, 16), '#58c7f3', [0, 0.41, 0]), P(octa(0.16), '#8fe0ff', [0, 0.82, 0], [0, 0, 0], [1, 1.6, 1]), P(octa(0.09), '#ffffff', [0, 0.82, 0], [0, PI / 4, 0], [1, 1.8, 1])],
    },
    piv: {},
  }),
  // ---- Zweite Erweiterung: Menschen ---------------------------------------------------------------
  raeuber: T => human(T, { s: 1.0, fist: 0.1, sleeve: SKIN, extra: p => { // Flussräuber: Fellmütze, Bart, Ruder
    p.body.push(P(sph(0.258), '#6b4a2b', [0, 1.07, -0.03], [0, 0, 0], [1.02, 0.55, 1.02]), P(sph(0.07), '#e8dcc0', [0, 1.22, -0.03]), P(sph(0.17), '#c9793a', [0, 0.8, 0.13], [0, 0, 0], [1.2, 0.85, 0.6]),
      P(torus(0.255, 0.045), '#8a6a43', [0, 0.72, 0], AXIS_Z), P(box(0.07, 0.4, 0.03), WOOD_D, [-0.1, 0.52, 0.235], [0, 0, 0.5]));
    p.armR.push(P(cyl(0.026, 0.026, 0.8, 6), WOOD, [0, -0.3, 0.26], AXIS_Z), P(box(0.17, 0.035, 0.3), WOOD_D, [0, -0.3, 0.78]));
  } }),
  sturmbruder: T => human(T, { s: 1.14, fist: 0.1, sleeve: SKIN, extra: p => { // Sturmbrüder: Federhelm, breites Hackmesser
    p.body.push(P(sph(0.258), STEEL_D, [0, 1.05, -0.04], [0, 0, 0], [1, 0.66, 1]), P(box(0.05, 0.16, 0.05), STEEL_D, [0, 0.93, 0.235]), P(cone(0.05, 0.42, 5), T.main, [-0.2, 1.3, -0.08], [-0.3, 0, 0.5]), P(cone(0.05, 0.42, 5), T.main, [0.2, 1.3, -0.08], [-0.3, 0, -0.5]),
      P(box(0.08, 0.5, 0.03), '#3b2a1a', [0.1, 0.52, 0.235], [0, 0, -0.5]), P(box(0.08, 0.5, 0.03), '#3b2a1a', [-0.1, 0.52, 0.235], [0, 0, 0.5]), P(cyl(0.262, 0.262, 0.07), GOLD_D, [0, 0.36, 0]));
    p.armR.push(P(box(0.05, 0.5, 0.2), '#e3e7ee', [0, -0.3, 0.4], AXIS_Z), P(box(0.05, 0.16, 0.12), '#e3e7ee', [0, -0.24, 0.62], AXIS_Z), P(box(0.07, 0.07, 0.2), WOOD_D, [0, -0.3, 0.06]));
    p.armL.push(P(torus(0.075, 0.025), GOLD, [0, -0.14, 0], AXIS_Z)); p.armR.push(P(torus(0.075, 0.025), GOLD, [0, -0.14, 0], AXIS_Z));
  } }),
  speerwache: T => human(T, { s: 0.95, extra: p => { // Grenzwache: Helm mit Kamm, hoher Schild, langer Speer
    p.body.push(P(sph(0.256), STEEL, [0, 1.04, -0.04], [0, 0, 0], [1, 0.68, 1]), P(box(0.05, 0.22, 0.4), T.main, [0, 1.25, -0.06]), P(box(0.3, 0.05, 0.05), STEEL_D, [0, 1.0, 0.22]), P(box(0.4, 0.5, 0.04), T.dark, [0, 0.52, -0.25], [0.12, 0, 0]));
    p.armL.push(P(box(0.4, 0.74, 0.04), T.main, [-0.03, -0.2, 0.14]), P(box(0.44, 0.78, 0.025), GOLD_D, [-0.03, -0.2, 0.125]), P(octa(0.1), GOLD, [-0.03, -0.2, 0.17], [0, 0, 0], [1, 1.3, 0.4]));
    p.armR.push(P(cyl(0.02, 0.02, 1.3, 5), WOOD_D, [0, -0.3, 0.38], AXIS_Z), P(cone(0.055, 0.22, 5), STEEL, [0, -0.3, 1.12], AXIS_Z), P(box(0.1, 0.02, 0.1), T.main, [0, -0.3, 0.96]));
  } }),
  muellerbursche: T => human(T, { s: 1.32, fist: 0.11, sleeve: '#efe6d2', extra: p => { // Mühlenbande: Müllerbursche mit Mehlsack
    p.body.push(P(sph(0.29), '#efe6d2', [0, 0.56, 0.06], [0, 0, 0], [1.05, 0.9, 0.95]), P(box(0.34, 0.36, 0.04), T.main, [0, 0.5, 0.3]), P(sph(0.25), '#f6f1e4', [0.03, 1.1, -0.03], [0, 0, 0], [1.05, 0.5, 1.05]), P(sph(0.13), '#f6f1e4', [0.12, 1.18, -0.1]),
      P(sph(0.05), '#e59a86', [-0.14, 0.87, 0.2]), P(sph(0.05), '#e59a86', [0.14, 0.87, 0.2]));
    p.armL.push(P(sph(0.2), '#d8c9a4', [-0.04, -0.3, 0.12], [0, 0, 0], [1, 1.25, 0.8]), P(torus(0.09, 0.03), WOOD_D, [-0.04, -0.08, 0.12], AXIS_Z));
    p.armR.push(P(box(0.07, 0.07, 0.7), WOOD, [0, -0.3, 0.3]), P(box(0.3, 0.05, 0.3), WOOD_D, [0, -0.3, 0.72]));
  } }),
  steinwerferin: T => human(T, { s: 0.8, extra: p => { // Mühlenbande: Zöpfe, Schleuder, Umhängetasche
    p.body.push(P(sph(0.252), '#d98f3a', [0, 0.99, -0.06]), P(sph(0.1), '#d98f3a', [-0.27, 0.86, -0.04]), P(sph(0.1), '#d98f3a', [0.27, 0.86, -0.04]), P(sph(0.04), T.main, [-0.25, 0.95, -0.03]), P(sph(0.04), T.main, [0.25, 0.95, -0.03]),
      P(box(0.2, 0.18, 0.1), WOOD_D, [-0.2, 0.4, 0.14]), P(box(0.06, 0.5, 0.03), WOOD_D, [0.04, 0.55, 0.23], [0, 0, 0.6]));
    p.armR.push(P(cyl(0.012, 0.012, 0.3, 4), '#e8e2d0', [0, -0.42, 0.04]), P(rock(0.08), STONE, [0, -0.58, 0.04]));
  } }),
  wueterich: T => human(T, { s: 0.98, fist: 0.09, sleeve: SKIN, extra: p => { // rote Stachelhaare, zwei Beile, Kriegsbemalung
    for (const [x, z, a] of [[-0.14, 0, 0.5], [0, 0.03, 0], [0.14, 0, -0.5], [-0.07, -0.1, 0.25], [0.07, -0.1, -0.25]]) p.body.push(P(cone(0.075, 0.34, 5), '#c93a2a', [x, 1.22 - Math.abs(x) * 0.25, z - 0.03], [-0.25, 0, a]));
    p.body.push(P(box(0.36, 0.05, 0.04), T.main, [0, 0.9, 0.215]), P(box(0.42, 0.14, 0.42), '#5d3d24', [0, 0.36, 0]), P(box(0.08, 0.36, 0.03), '#5d3d24', [0, 0.56, 0.235]));
    for (const a of [p.armL, p.armR]) a.push(P(cyl(0.022, 0.022, 0.42, 5), WOOD_D, [0, -0.3, 0.16], AXIS_Z), P(box(0.04, 0.2, 0.17), STEEL, [0, -0.24, 0.34]), P(box(0.045, 0.06, 0.06), STEEL_D, [0, -0.3, 0.34]));
  } }),
  distelritter: T => human(T, { s: 1.14, h: 1.5, sleeve: '#4b3a5e', extra: p => { // dunkle Rüstung, Distelkamm, Dornenschild, Streitkolben
    p.body.push(P(cyl(0.215, 0.27, 0.44), '#4b3a5e', [0, 0.52, 0]), P(sph(0.268), '#4b3a5e', [0, 0.96, 0]), P(box(0.34, 0.09, 0.04), '#1d1626', [0, 0.98, 0.25]), P(sph(0.035), '#f0d9ff', [-0.08, 0.98, 0.268]), P(sph(0.035), '#f0d9ff', [0.08, 0.98, 0.268]), P(sph(0.13), '#b06adf', [0, 1.3, -0.02]),
      ...[0, 1, 2, 3, 4, 5].map(i => P(cone(0.03, 0.16, 4), '#d9b8f5', [Math.sin(i * 1.05) * 0.12, 1.4, Math.cos(i * 1.05) * 0.12 - 0.02], [Math.cos(i * 1.05) * 0.7, 0, -Math.sin(i * 1.05) * 0.7])),
      P(cyl(0.05, 0.07, 0.12, 6), '#5fa049', [0, 1.2, -0.02]), P(cyl(0.278, 0.278, 0.06), T.main, [0, 0.33, 0]), P(sph(0.13), '#3a2c4a', [-0.29, 0.74, 0]), P(sph(0.13), '#3a2c4a', [0.29, 0.74, 0]));
    p.armL.push(P(cyl(0.27, 0.27, 0.05, 6), T.main, [-0.03, -0.22, 0.13], AXIS_Z), P(cyl(0.2, 0.2, 0.06, 6), '#3a2c4a', [-0.03, -0.22, 0.14], AXIS_Z), P(cone(0.05, 0.18, 5), BONE, [-0.03, -0.22, 0.25], AXIS_Z));
    p.armR.push(P(cyl(0.028, 0.028, 0.5, 6), WOOD_D, [0, -0.3, 0.22], AXIS_Z), P(sph(0.13), STEEL_D, [0, -0.3, 0.52]), ...[0, 1, 2, 3].map(i => P(cone(0.035, 0.12, 4), BONE, [Math.cos(i * 1.57) * 0.14, -0.3 + Math.sin(i * 1.57) * 0.14, 0.52], [0, 0, i * 1.57 - 1.57])));
  } }),
  sichelwerfer: T => human(T, { s: 1.22, fist: 0.1, sleeve: SKIN, extra: p => { // Kapuze, Gesichtstuch, große Sichel
    p.body.push(P(sph(0.266), '#3d4a3a', [0, 0.98, -0.06]), P(cone(0.19, 0.3), '#3d4a3a', [0, 1.2, -0.12], [-0.6, 0, 0]), P(box(0.34, 0.14, 0.05), T.main, [0, 0.86, 0.2]), P(box(0.46, 0.2, 0.44), '#3d4a3a', [0, 0.66, 0]),
      P(torus(0.27, 0.035), WOOD_D, [0, 0.6, 0.02], [PI / 2, -0.6, 0]), P(cyl(0.262, 0.262, 0.07), '#5d3d24', [0, 0.36, 0]));
    p.armR.push(P(cyl(0.026, 0.026, 0.3, 6), WOOD_D, [0, -0.3, 0.12], AXIS_Z), P(torus(0.24, 0.035, PI * 1.15), '#e3e7ee', [0, -0.3, 0.5], basis([0, 0, 1], [0, 1, 0], [-1, 0, 0])));
  } }),
  splitterjaeger: T => human(T, { s: 1.02, extra: p => { // breiter Hut mit Feder, dreiläufiges Splitterrohr
    p.body.push(P(cyl(0.4, 0.4, 0.03, 16), '#5d4a30', [0, 1.1, 0]), P(cyl(0.2, 0.23, 0.16, 12), '#6d5838', [0, 1.19, 0]), P(torus(0.22, 0.025), T.main, [0, 1.13, 0], AXIS_Z), P(cone(0.04, 0.4, 5), '#eef2ee', [0.22, 1.32, -0.08], [-0.4, 0, -0.6]),
      P(sph(0.14), '#8a6a43', [0, 0.82, 0.14], [0, 0, 0], [1.1, 0.7, 0.6]), P(box(0.07, 0.5, 0.03), '#3b2a1a', [0.06, 0.55, 0.235], [0, 0, -0.6]), ...[-0.12, 0, 0.12].map(x => P(cyl(0.03, 0.03, 0.09, 5), GOLD_D, [x * 0.9 + 0.02, 0.56 + x * 1.2, 0.26])));
    p.armR.push(P(box(0.09, 0.4, 0.09), WOOD_D, [0, -0.44, 0.04]), ...[[-0.05, 0], [0.05, 0], [0, 0.07]].map(([x, z]) => P(cyl(0.04, 0.045, 0.5, 6), STEEL_D, [x, -0.78, 0.04 + z])), P(torus(0.085, 0.02), STEEL, [0, -0.98, 0.06], AXIS_Z));
  } }),
  wegelagerin: T => human(T, { s: 0.98, sleeve: '#3a3f52', extra: p => { // Kapuzenumhang, Halstuch vor dem Gesicht, Pferdeschwanz
    p.body.push(P(sph(0.262), '#3a3f52', [0, 0.99, -0.07]), P(caps(0.06, 0.3), '#c9793a', [0.08, 0.86, -0.3], [0.9, 0, -0.2]), P(box(0.36, 0.16, 0.06), T.main, [0, 0.86, 0.19]), P(cone(0.08, 0.16, 4), T.main, [0, 0.72, 0.2], [PI, 0, 0]),
      P(box(0.44, 0.6, 0.04), '#3a3f52', [0, 0.5, -0.26], [0.2, 0, 0]), P(cyl(0.262, 0.262, 0.06), '#2a2f3a', [0, 0.36, 0]));
    p.armR.push(P(box(0.035, 0.34, 0.07), '#e3e7ee', [0, -0.3, 0.24], AXIS_Z), P(box(0.12, 0.035, 0.05), GOLD_D, [0, -0.3, 0.07]));
    p.armL.push(P(box(0.035, 0.26, 0.06), '#e3e7ee', [0, -0.3, 0.2], AXIS_Z));
  } }),
  falterhueterin: T => human(T, { s: 1.02, h: 1.55, robe: '#3d3355', sleeve: '#3d3355', extra: p => { // Falterflügel am Rücken, Laternenstab
    p.body.push(P(sph(0.262), '#2a2440', [0, 0.98, -0.07]), P(cyl(0.21, 0.21, 0.07, 14), T.main, [0, 0.5, 0]), P(cyl(0.352, 0.352, 0.05, 14), '#d9d3ec', [0, 0.07, 0]),
      P(sph(0.3), '#d9d3ec', [-0.3, 0.86, -0.26], [0.2, 0.5, 0.3], [1, 1.25, 0.08]), P(sph(0.3), '#d9d3ec', [0.3, 0.86, -0.26], [0.2, -0.5, -0.3], [1, 1.25, 0.08]),
      P(sph(0.1), T.main, [-0.34, 0.95, -0.25], [0.2, 0.5, 0.3], [1, 1.2, 0.12]), P(sph(0.1), T.main, [0.34, 0.95, -0.25], [0.2, -0.5, -0.3], [1, 1.2, 0.12]),
      P(cyl(0.008, 0.008, 0.2, 4), INK, [-0.06, 1.28, 0.08], [0.4, 0, 0.3]), P(cyl(0.008, 0.008, 0.2, 4), INK, [0.06, 1.28, 0.08], [0.4, 0, -0.3]));
    p.armR.push(staff('#5d4a6b', 0.95), P(box(0.12, 0.16, 0.12), '#2a2440', [0, -0.74, 0.27]));
    p.gLamp = [P(sph(0.075), '#ffe08a', [0.275, 1.13, 0.27])];
  } }),
  seilwerfer: T => human(T, { s: 1.03, fist: 0.095, sleeve: SKIN, extra: p => { // Kopftuch, aufgerolltes Seil über der Schulter, Haken
    p.body.push(P(sph(0.256), T.main, [0, 1.04, -0.05], [0, 0, 0], [1, 0.64, 1]), P(sph(0.07), T.main, [0.2, 1.0, -0.2]), P(cone(0.05, 0.2, 4), T.main, [0.26, 0.9, -0.24], [0.5, 0, -0.5]),
      P(torus(0.24, 0.045), '#d8c7a0', [0, 0.62, 0.02], [PI / 2, 0.7, 0]), P(torus(0.24, 0.045), '#c9b98a', [0.03, 0.6, 0.03], [PI / 2, 0.85, 0]), P(sph(0.13), '#5d3d24', [0, 0.8, 0.14], [0, 0, 0], [1.1, 0.6, 0.6]));
    p.armR.push(P(cyl(0.022, 0.022, 0.3, 5), STEEL_D, [0, -0.3, 0.14], AXIS_Z), P(torus(0.12, 0.03, PI * 1.2), STEEL, [0, -0.2, 0.3], basis([0, 0, 1], [0, 1, 0], [-1, 0, 0])), P(cone(0.04, 0.1, 4), STEEL, [0, -0.08, 0.26], [0.6, 0, 0]));
  } }),
  fluchweberin: T => { const d = human(T, { s: 0.96, h: 1.6, robe: '#3d2a4f', sleeve: '#3d2a4f', skin: '#d9cfe8', extra: p => { // spitze Kapuze, Spindel, violette Fluchkugel
    p.body.push(P(sph(0.262), '#2c1d3b', [0, 0.98, -0.06]), P(cone(0.2, 0.5), '#2c1d3b', [0, 1.3, -0.14], [-0.55, 0, 0]), P(cyl(0.21, 0.21, 0.07, 14), T.main, [0, 0.5, 0]), P(cyl(0.352, 0.352, 0.05, 14), '#b06adf', [0, 0.07, 0]),
      P(sph(0.045), '#c98bff', [-0.095, 0.965, 0.21]), P(sph(0.045), '#c98bff', [0.095, 0.965, 0.21]));
    p.armL.push(P(cyl(0.012, 0.012, 0.36, 4), WOOD_D, [0, -0.36, 0.02]), P(sph(0.07), '#e8e2d0', [0, -0.36, 0.02], [0, 0, 0], [1, 1.5, 1]));
    p.gOrb = [P(sph(0.11), '#b06adf'), P(sph(0.06), '#f0d9ff', [0.03, 0.03, 0.04]), P(torus(0.15, 0.015), '#c98bff', [0, 0, 0], [0.5, 0, 0.3])];
  } }); d.piv.gOrb = [0.3, 0.62, 0.3]; return d; },
  stollenmeister: T => human(T, { s: 1.28, h: 1.6, gold: true, fist: 0.1, sleeve: '#6b5a3a', extra: p => { // Held: Grubenhelm mit Lampe, Bart, großer Bohrer
    p.body.push(P(sph(0.262), GOLD_D, [0, 1.05, -0.03], [0, 0, 0], [1, 0.62, 1]), P(cyl(0.3, 0.3, 0.03, 14), GOLD_D, [0, 1.0, 0.03]), P(box(0.12, 0.1, 0.08), STEEL_D, [0, 1.13, 0.2]),
      P(sph(0.2), '#e8e2d0', [0, 0.76, 0.12], [0, 0, 0], [1.15, 1.0, 0.6]), P(cyl(0.215, 0.27, 0.42), '#6b5a3a', [0, 0.52, 0]), P(box(0.36, 0.44, 0.2), WOOD_D, [0, 0.56, -0.3]), P(cyl(0.268, 0.268, 0.06), GOLD, [0, 0.36, 0]), P(box(0.5, 0.05, 0.03), T.main, [0, 0.62, 0.24]));
    p.armR.push(P(cyl(0.11, 0.11, 0.26, 10), STEEL_D, [0, -0.3, 0.16], AXIS_Z), P(cone(0.14, 0.5, 10), STEEL, [0, -0.3, 0.54], AXIS_Z), P(torus(0.1, 0.02), GOLD, [0, -0.3, 0.44]), P(torus(0.06, 0.018), GOLD, [0, -0.3, 0.62]), P(torus(0.12, 0.025), GOLD, [0, -0.3, 0.3]));
    p.gLamp = [P(sph(0.06), '#fff3c4', [0, 1.13, 0.25])];
  } }),
  flussmoench: T => human(T, { s: 1.22, h: 1.6, gold: true, fist: 0.125, robe: '#4a6a7d', sleeve: SKIN, extra: p => { // Held: kahler Kopf, Wellenschärpe, Perlenkette, bloße Fäuste
    p.body.push(P(cyl(0.352, 0.352, 0.06, 14), GOLD, [0, 0.08, 0]), P(cyl(0.21, 0.21, 0.08, 14), T.main, [0, 0.48, 0]), P(box(0.12, 0.5, 0.04), T.main, [0.12, 0.26, 0.24], [0, 0, -0.12]), P(cyl(0.27, 0.2, 0.1, 14), '#3a5564', [0, 0.7, 0]),
      ...[0, 1, 2, 3, 4, 5, 6].map(i => P(sph(0.045), BONE, [Math.sin((i - 3) * 0.33) * 0.2, 0.7 - Math.cos((i - 3) * 0.33) * 0.14, 0.2 + Math.cos((i - 3) * 0.33) * 0.03])),
      P(box(0.1, 0.03, 0.04), INK, [-0.095, 1.03, 0.2], [0, 0, 0.25]), P(box(0.1, 0.03, 0.04), INK, [0.095, 1.03, 0.2], [0, 0, -0.25]), P(sph(0.05), T.light, [0, 1.06, 0.215]));
    for (const a of [p.armL, p.armR]) a.push(P(torus(0.085, 0.03), '#e8e2d0', [0, -0.22, 0], AXIS_Z));
  } }),
  jungfuerst: T => human(T, { s: 0.94, h: 1.5, gold: true, extra: p => { // Held: kleine Krone, Umhang, Handarmbrust
    p.body.push(P(sph(0.254), '#e9d27a', [0, 0.99, -0.06]), P(cyl(0.17, 0.19, 0.1, 10), GOLD, [0, 1.2, -0.02]), ...[0, 1, 2, 3, 4].map(i => P(cone(0.04, 0.1, 4), GOLD, [Math.sin(i * 1.257) * 0.15, 1.29, Math.cos(i * 1.257) * 0.15 - 0.02])), P(sph(0.035), T.light, [0, 1.21, 0.17]),
      P(box(0.46, 0.62, 0.04), T.main, [0, 0.5, -0.26], [0.14, 0, 0]), P(box(0.46, 0.07, 0.045), '#f6f1e4', [0, 0.2, -0.3], [0.14, 0, 0]), P(cyl(0.262, 0.262, 0.06), GOLD, [0, 0.36, 0]), P(sph(0.06), GOLD, [0, 0.72, 0.2]));
    p.armR.push(P(box(0.07, 0.46, 0.07), WOOD_D, [0, -0.46, 0.05]), P(torus(0.19, 0.026, PI), GOLD_D, [0, -0.64, 0.05], basis([1, 0, 0], [0, -1, 0], [0, 0, -1])), P(cyl(0.01, 0.01, 0.38, 4), '#e6e9ee', [0, -0.55, 0.1]));
  } }),
  leibwaechterin: T => human(T, { s: 1.22, h: 1.55, sleeve: STEEL_D, extra: p => { // Vollhelm mit Federbusch, Umhang, Zweihänder
    p.body.push(P(cyl(0.22, 0.27, 0.44), STEEL, [0, 0.52, 0]), P(sph(0.27), STEEL, [0, 0.96, 0]), P(box(0.3, 0.045, 0.04), INK, [0, 0.99, 0.255]), P(box(0.04, 0.16, 0.04), INK, [0, 0.92, 0.257]),
      P(caps(0.07, 0.34), T.main, [0, 1.3, -0.14], [-0.9, 0, 0]), P(box(0.5, 0.7, 0.04), T.main, [0, 0.48, -0.28], [0.15, 0, 0]), P(sph(0.14), GOLD_D, [-0.3, 0.74, 0]), P(sph(0.14), GOLD_D, [0.3, 0.74, 0]), P(cyl(0.278, 0.278, 0.06), GOLD_D, [0, 0.33, 0]));
    p.armR.push(P(box(0.06, 0.95, 0.14), '#eef1f5', [0, -0.3, 0.6], AXIS_Z), P(box(0.34, 0.06, 0.07), GOLD, [0, -0.3, 0.12]), P(cyl(0.03, 0.03, 0.2, 6), WOOD_D, [0, -0.3, 0.0], AXIS_Z));
  } }),
  // ---- Zweite Erweiterung: Kleine und Getier ------------------------------------------------------
  frostling: T => ({
    kind: 'blob', s: 1, h: 0.78,
    parts: { body: [...baseRing(T, 0.26), P(sph(0.2), '#bfeaff', [0, 0.26, 0]), P(octa(0.13), '#eaf8ff', [0, 0.52, -0.01], [0, 0, 0], [1, 1.7, 1]), P(octa(0.08), '#dff3ff', [-0.14, 0.44, -0.02], [0, 0, 0.5], [1, 1.6, 1]), P(octa(0.08), '#dff3ff', [0.14, 0.44, -0.02], [0, 0, -0.5], [1, 1.6, 1]),
      P(sph(0.04), INK, [-0.07, 0.3, 0.17]), P(sph(0.04), INK, [0.07, 0.3, 0.17]), P(torus(0.17, 0.035), T.main, [0, 0.15, 0], AXIS_Z)],
      gFlame: [P(octa(0.06), '#ffffff', [0, 0.72, -0.01], [0, 0, 0], [1, 1.6, 1])] },
    piv: {},
  }),
  funkling: T => ({
    kind: 'blob', s: 1, h: 0.78,
    parts: { body: [...baseRing(T, 0.26), P(sph(0.2), '#ffe26a', [0, 0.26, 0]), P(sph(0.04), INK, [-0.07, 0.3, 0.17]), P(sph(0.04), INK, [0.07, 0.3, 0.17]), P(torus(0.17, 0.035), T.main, [0, 0.15, 0], AXIS_Z),
      P(box(0.03, 0.16, 0.03), '#c9793a', [-0.1, 0.5, 0], [0, 0, 0.5]), P(box(0.03, 0.16, 0.03), '#c9793a', [-0.1, 0.62, 0], [0, 0, -0.5]), P(box(0.03, 0.16, 0.03), '#c9793a', [0.1, 0.5, 0], [0, 0, -0.5]), P(box(0.03, 0.16, 0.03), '#c9793a', [0.1, 0.62, 0], [0, 0, 0.5])],
      gFlame: [P(octa(0.05), '#fffbd0', [-0.13, 0.72, 0]), P(octa(0.05), '#fffbd0', [0.13, 0.72, 0])] },
    piv: {},
  }),
  tauling: T => ({
    kind: 'blob', s: 1, h: 0.78,
    parts: { body: [...baseRing(T, 0.26), P(sph(0.2), '#7fe0c0', [0, 0.26, 0]), P(cone(0.14, 0.3, 10), '#7fe0c0', [0, 0.5, 0]), P(sph(0.04), INK, [-0.07, 0.3, 0.17]), P(sph(0.04), INK, [0.07, 0.3, 0.17]), P(sph(0.03), '#e59a86', [0, 0.22, 0.19]),
      P(torus(0.17, 0.035), T.main, [0, 0.15, 0], AXIS_Z), P(sph(0.1), '#5fa049', [0.12, 0.62, -0.02], [0, 0, -0.6], [1.5, 0.2, 0.8])],
      gFlame: [P(sph(0.055), '#eafff6', [-0.06, 0.4, 0.14])] },
    piv: {},
  }),
  knallfrosch: T => ({
    kind: 'blob', s: 1, h: 0.8,
    parts: { body: [...baseRing(T, 0.34), P(sph(0.27), '#5fa049', [0, 0.24, 0], [0, 0, 0], [1.1, 0.8, 1.15]), P(sph(0.2), '#e9e2a8', [0, 0.17, 0.12], [0, 0, 0], [1, 0.7, 1]), P(sph(0.16), T.main, [0, 0.14, 0.22], [0, 0, 0], [1.2, 0.8, 0.8]),
      P(sph(0.1), '#6fb455', [-0.13, 0.46, 0.1]), P(sph(0.1), '#6fb455', [0.13, 0.46, 0.1]), P(sph(0.065), '#fff', [-0.13, 0.48, 0.16]), P(sph(0.065), '#fff', [0.13, 0.48, 0.16]), P(sph(0.035), INK, [-0.13, 0.49, 0.215]), P(sph(0.035), INK, [0.13, 0.49, 0.215]),
      P(sph(0.13), '#4f8a3c', [-0.27, 0.12, -0.12], [0, 0, 0], [0.7, 0.8, 1.4]), P(sph(0.13), '#4f8a3c', [0.27, 0.12, -0.12], [0, 0, 0], [0.7, 0.8, 1.4]), P(sph(0.08), '#b5482c', [0, 0.36, 0.3], [0, 0, 0], [1, 1, 1.5]), P(cyl(0.01, 0.01, 0.12, 4), INK, [0, 0.42, 0.4], [0.9, 0, 0])],
      gFlame: [P(sph(0.035), '#ffe08a', [0, 0.47, 0.46])] },
    piv: {},
  }),
  pulverwicht: T => pulverwicht(T, false),
  pulverwicht_k: T => pulverwicht(T, true),
  zitterling: T => ({
    kind: 'blob', s: 1, h: 0.85,
    parts: { body: [...baseRing(T, 0.3), P(cyl(0.13, 0.17, 0.32, 10), '#f1e3c4', [0, 0.2, 0]), P(sph(0.3), '#e8b23a', [0, 0.46, 0], [0, 0, 0], [1, 0.62, 1]), P(cyl(0.3, 0.3, 0.03, 14), '#c9793a', [0, 0.42, 0]),
      ...[[0.14, 0.58, 0.1], [-0.16, 0.56, 0.02], [0, 0.63, -0.1], [0.05, 0.56, 0.2]].map(q => P(sph(0.055), '#8fe0ff', q, [0, 0, 0], [1, 0.5, 1])),
      P(sph(0.04), INK, [-0.06, 0.26, 0.14]), P(sph(0.04), INK, [0.06, 0.26, 0.14]), P(torus(0.15, 0.03), T.main, [0, 0.1, 0], AXIS_Z)],
      gFlame: [P(octa(0.055), '#fffbd0', [0, 0.72, 0], [0, 0, 0], [1, 1.5, 1])] },
    piv: {},
  }),
  kraftkloss: T => kloss(T, 1),
  kraftkloss_m: T => kloss(T, 0.68),
  kraftkloss_k: T => kloss(T, 0.46),
  irrwisch: T => ({
    kind: 'blob', s: 1, h: 0.9,
    parts: { body: [...baseRing(T, 0.3), P(sph(0.22), '#8a6fd0', [0, 0.34, 0]), P(cone(0.17, 0.4, 8), '#a58be0', [0.03, 0.62, -0.04], [-0.2, 0, -0.15]), P(cone(0.12, 0.3, 6), '#6f58b0', [0, 0.1, -0.02], [PI, 0, 0]), P(torus(0.2, 0.03), T.main, [0, 0.3, 0], AXIS_Z)],
      gFlame: [P(sph(0.05), '#e8fff0', [-0.08, 0.38, 0.18]), P(sph(0.05), '#e8fff0', [0.08, 0.38, 0.18]), P(cone(0.06, 0.2, 6), '#d9c8ff', [0.05, 0.8, -0.07], [-0.2, 0, -0.15])] },
    piv: {},
  }),
  glutei: T => ({
    kind: 'static', s: 1, h: 0.8,
    parts: { body: [...baseRing(T, 0.36), P(sph(0.3), '#f3ead2', [0, 0.34, 0], [0, 0, 0], [0.85, 1.15, 0.85]), P(torus(0.2, 0.04), '#8a4a2a', [0, 0.1, 0], AXIS_Z), P(sph(0.07), '#e8b23a', [0.14, 0.44, 0.18], [0, 0, 0], [1, 1, 0.4]), P(sph(0.05), '#e8b23a', [-0.16, 0.3, 0.17], [0, 0, 0], [1, 1, 0.4])],
      gGlow: [P(box(0.03, 0.26, 0.03), '#ff8a2a', [0.0, 0.42, 0.25], [0, 0, 0.5]), P(box(0.03, 0.2, 0.03), '#ff8a2a', [0.08, 0.26, 0.25], [0, 0, -0.6]), P(box(0.03, 0.16, 0.03), '#ffe08a', [-0.07, 0.5, 0.22], [0, 0, -0.4])] },
    piv: {},
  }),
  wanderbusch: T => ({
    kind: 'blob', s: 1, h: 0.95,
    parts: { body: [...baseRing(T, 0.36), P(sph(0.28), '#4f8a3c', [0, 0.36, 0]), P(sph(0.2), '#5fa049', [-0.2, 0.5, 0.05]), P(sph(0.2), '#5fa049', [0.2, 0.52, -0.03]), P(sph(0.19), '#6fb455', [0, 0.66, 0]), P(sph(0.15), '#3f7a34', [0.02, 0.3, 0.2]),
      P(sph(0.045), '#ff9db5', [0.2, 0.68, 0.1]), P(sph(0.045), '#ff9db5', [-0.14, 0.7, 0.08]), P(sph(0.07), '#3b2716', [-0.12, 0.05, 0.08]), P(sph(0.07), '#3b2716', [0.12, 0.05, 0.08]), P(box(0.26, 0.08, 0.04), '#1a2414', [0, 0.4, 0.3])],
      gFlame: [P(sph(0.04), '#ffe26a', [-0.07, 0.4, 0.32]), P(sph(0.04), '#ffe26a', [0.07, 0.4, 0.32])] },
    piv: {},
  }),
  buschwicht: T => ({
    kind: 'blob', s: 1, h: 0.8,
    parts: { body: [...baseRing(T, 0.28), P(sph(0.23), '#6d7a3a', [0, 0.27, 0], [0, 0, 0], [1, 0.92, 1]), P(sph(0.15), '#4f8a3c', [0, 0.5, -0.02], [0, 0, 0], [1.3, 0.6, 1.2]), P(cone(0.06, 0.2, 5), '#6fb455', [-0.12, 0.6, 0], [0, 0, 0.7]), P(cone(0.06, 0.2, 5), '#6fb455', [0.12, 0.62, 0], [0, 0, -0.6]),
      P(sph(0.055), '#ffe26a', [-0.09, 0.32, 0.19]), P(sph(0.055), '#ffe26a', [0.09, 0.32, 0.19]), P(torus(0.19, 0.03), T.main, [0, 0.14, 0], AXIS_Z), P(box(0.03, 0.05, 0.3), '#e3e7ee', [0.22, 0.26, 0.2]), P(sph(0.07), '#3b2716', [-0.1, 0.05, 0.06]), P(sph(0.07), '#3b2716', [0.1, 0.05, 0.06])] },
    piv: {},
  }),
  keiler: T => {
    const leg = () => [P(box(0.1, 0.22, 0.11), '#3b2a1e', [0, -0.11, 0]), P(box(0.11, 0.05, 0.13), INK, [0, -0.22, 0.01])];
    return {
      kind: 'beast', s: 1, h: 0.85,
      parts: {
        body: [...baseRing(T, 0.4), P(caps(0.23, 0.32), '#5a4030', [0, 0.42, 0], AXIS_Z), P(box(0.5, 0.14, 0.2), T.main, [0, 0.52, -0.05]), ...[-0.2, -0.05, 0.1, 0.25].map(z => P(cone(0.05, 0.16, 4), '#2a1d14', [0, 0.7, z], [-0.3, 0, 0])),
          P(sph(0.2), '#4a3426', [0, 0.4, 0.4]), P(cyl(0.09, 0.11, 0.14, 8), '#c9a57c', [0, 0.34, 0.6], AXIS_Z), P(sph(0.03), INK, [-0.09, 0.47, 0.54]), P(sph(0.03), INK, [0.09, 0.47, 0.54]),
          P(cone(0.035, 0.18, 5), BONE, [-0.12, 0.36, 0.6], [0.3, 0, 0.5]), P(cone(0.035, 0.18, 5), BONE, [0.12, 0.36, 0.6], [0.3, 0, -0.5]), P(cone(0.05, 0.12, 4), '#4a3426', [-0.14, 0.58, 0.36]), P(cone(0.05, 0.12, 4), '#4a3426', [0.14, 0.58, 0.36])],
        legFL: leg(), legFR: leg(), legBL: leg(), legBR: leg(),
      },
      piv: { legFL: [-0.14, 0.25, 0.2], legFR: [0.14, 0.25, 0.2], legBL: [-0.14, 0.25, -0.22], legBR: [0.14, 0.25, -0.22] },
    };
  },
  zwingerwolf: T => {
    const leg = () => [P(box(0.09, 0.3, 0.1), '#6b7280', [0, -0.15, 0]), P(box(0.1, 0.05, 0.13), '#3a4048', [0, -0.3, 0.02])];
    return {
      kind: 'beast', s: 1, h: 0.95,
      parts: {
        body: [...baseRing(T, 0.44), P(caps(0.2, 0.42), '#7d8590', [0, 0.5, 0], AXIS_Z), P(sph(0.2), '#9aa2ac', [0, 0.44, 0.1], [0, 0, 0], [0.9, 0.8, 1.2]), P(torus(0.17, 0.04), T.main, [0, 0.56, 0.3]),
          P(sph(0.18), '#7d8590', [0, 0.62, 0.44]), P(cone(0.1, 0.26, 6), '#9aa2ac', [0, 0.57, 0.64], AXIS_Z), P(sph(0.035), INK, [0, 0.58, 0.77]), P(sph(0.03), '#ffe26a', [-0.08, 0.68, 0.56]), P(sph(0.03), '#ffe26a', [0.08, 0.68, 0.56]),
          P(cone(0.055, 0.17, 4), '#5a626c', [-0.1, 0.82, 0.4]), P(cone(0.055, 0.17, 4), '#5a626c', [0.1, 0.82, 0.4]), P(cone(0.08, 0.4, 6), '#5a626c', [0, 0.58, -0.56], [-PI / 2 - 0.5, 0, 0])],
        legFL: leg(), legFR: leg(), legBL: leg(), legBR: leg(),
      },
      piv: { legFL: [-0.13, 0.34, 0.24], legFR: [0.13, 0.34, 0.24], legBL: [-0.13, 0.34, -0.28], legBR: [0.13, 0.34, -0.28] },
    };
  },
  rankenreiterin: T => { // Hirschkäfer mit Reiterin
    const leg = () => [P(box(0.07, 0.3, 0.07), '#1f2a24', [0, -0.15, 0], [0, 0, 0]), P(box(0.1, 0.04, 0.14), INK, [0, -0.3, 0.03])];
    return {
      kind: 'beast', s: 1, h: 1.55,
      parts: {
        body: [...baseRing(T, 0.55), P(sph(0.38), '#2f4a3c', [0, 0.52, -0.08], [0, 0, 0], [1, 0.72, 1.3]), P(box(0.03, 0.04, 0.8), '#1f2a24', [0, 0.8, -0.1]), P(sph(0.2), '#1f2a24', [0, 0.48, 0.46]),
          P(cone(0.05, 0.42, 5), '#5d3d24', [-0.14, 0.52, 0.76], [1.3, 0, 0.35]), P(cone(0.05, 0.42, 5), '#5d3d24', [0.14, 0.52, 0.76], [1.3, 0, -0.35]), P(cone(0.03, 0.14, 4), '#5d3d24', [-0.2, 0.6, 0.78], [1.3, 0, -0.7]), P(cone(0.03, 0.14, 4), '#5d3d24', [0.2, 0.6, 0.78], [1.3, 0, 0.7]),
          P(sph(0.035), '#ffe26a', [-0.1, 0.56, 0.6]), P(sph(0.035), '#ffe26a', [0.1, 0.56, 0.6]), P(box(0.5, 0.06, 0.34), T.main, [0, 0.8, -0.05]),
          // Reiterin
          P(cyl(0.14, 0.17, 0.3, 10), T.main, [0, 1.0, -0.05]), P(sph(0.18), SKIN, [0, 1.3, -0.03]), P(sph(0.185), '#5fa049', [0, 1.39, -0.07], [0, 0, 0], [1.03, 0.62, 1]), P(caps(0.05, 0.24), '#5fa049', [0, 1.14, -0.22], [0.5, 0, 0]), P(sph(0.045), '#fff', [-0.07, 1.31, 0.13]), P(sph(0.045), '#fff', [0.07, 1.31, 0.13]),
          P(sph(0.026), INK, [-0.07, 1.31, 0.165]), P(sph(0.026), INK, [0.07, 1.31, 0.165]), P(caps(0.04, 0.2), T.main, [0.2, 1.05, 0.06], [-0.9, 0, 0]), P(torus(0.11, 0.022), '#7fd069', [0.22, 1.16, 0.22], [0.4, 0, 0])],
        legFL: leg(), legFR: leg(), legBL: leg(), legBR: leg(),
      },
      piv: { legFL: [-0.3, 0.34, 0.2], legFR: [0.3, 0.34, 0.2], legBL: [-0.3, 0.34, -0.3], legBR: [0.3, 0.34, -0.3] },
    };
  },
  stammlaeufer: T => { // zwei Flussräuber tragen einen Baumstamm
    const leg = () => [P(box(0.12, 0.26, 0.16), DARK, [0, -0.13, 0.01]), P(box(0.14, 0.08, 0.2), '#4a3524', [0, -0.27, 0.03])];
    const man = (x, z) => [P(cyl(0.17, 0.21, 0.36), T.main, [x, 0.5, z]), P(sph(0.2), SKIN, [x, 0.86, z]), P(sph(0.215), '#6b4a2b', [x, 0.97, z - 0.02], [0, 0, 0], [1, 0.55, 1]), P(sph(0.13), '#c9793a', [x, 0.76, z + 0.12], [0, 0, 0], [1.1, 0.8, 0.6]),
      P(sph(0.028), INK, [x - 0.07, 0.89, z + 0.18]), P(sph(0.028), INK, [x + 0.07, 0.89, z + 0.18]), P(caps(0.055, 0.2), SKIN, [x + (x < 0 ? 0.2 : -0.2), 0.6, z], [0, 0, x < 0 ? -0.9 : 0.9])];
    return {
      kind: 'beast', s: 1, h: 1.2,
      parts: {
        body: [...baseRing(T, 0.6), P(cyl(0.17, 0.19, 1.5, 10), WOOD, [0, 0.6, 0.12], AXIS_Z), P(cyl(0.2, 0.2, 0.14, 10), STEEL_D, [0, 0.6, 0.86], AXIS_Z), P(cone(0.16, 0.2, 8), STEEL, [0, 0.6, 1.02], AXIS_Z), P(cyl(0.12, 0.12, 0.02, 10), '#e0c08a', [0, 0.6, -0.635], AXIS_Z),
          P(cyl(0.035, 0.03, 0.14, 5), WOOD_D, [0.1, 0.78, -0.2], [0, 0, -0.5]), ...man(-0.36, 0.3), ...man(0.36, -0.3)],
        legFL: leg(), legFR: leg(), legBL: leg(), legBR: leg(),
      },
      piv: { legFL: [-0.42, 0.31, 0.3], legFR: [-0.3, 0.31, 0.3], legBL: [0.3, 0.31, -0.3], legBR: [0.42, 0.31, -0.3] },
    };
  },
  // ---- Zweite Erweiterung: Flieger ---------------------------------------------------------------
  flugsamen: T => ({
    kind: 'ray', s: 1, h: 0.9,
    parts: {
      body: [P(sph(0.3), '#b08350', [0, -0.3, 0], [0, 0, 0], [1, 1.1, 1]), P(torus(0.2, 0.04), T.main, [0, -0.12, 0], AXIS_Z), P(cyl(0.012, 0.012, 0.5, 4), '#e8e2d0', [0, 0.18, 0]), P(sph(0.07), '#8a6a43', [0, 0.42, 0]),
        ...Array.from({ length: 10 }, (_, i) => { const a = i * 0.628, t = 0.5 + (i % 2) * 0.25; return P(cyl(0.008, 0.008, 0.4, 3), '#ffffff', [Math.cos(a) * 0.17 * t * 2, 0.56, Math.sin(a) * 0.17 * t * 2], [Math.sin(a) * t, 0, -Math.cos(a) * t]); }),
        ...Array.from({ length: 10 }, (_, i) => { const a = i * 0.628, t = 0.5 + (i % 2) * 0.25; return P(sph(0.06), '#f6f6f0', [Math.cos(a) * 0.36 * t * 2, 0.7 - t * 0.12, Math.sin(a) * 0.36 * t * 2]); }),
        P(sph(0.045), '#ffe26a', [-0.09, -0.24, 0.26]), P(sph(0.045), '#ffe26a', [0.09, -0.24, 0.26]), P(rock(0.08), STONE, [0.12, -0.02, 0.05]), P(rock(0.07), STONE_L, [-0.1, -0.02, -0.04])],
      wingL: [P(sph(0.2), '#6fb455', [-0.2, 0, 0], [0, 0, 0], [1, 0.1, 0.5])], wingR: [P(sph(0.2), '#6fb455', [0.2, 0, 0], [0, 0, 0], [1, 0.1, 0.5])],
    },
    piv: { wingL: [-0.05, 0.36, 0], wingR: [0.05, 0.36, 0] },
  }),
  jungrochen: T => ({
    kind: 'ray', s: 0.78, h: 0.5,
    parts: {
      body: [P(sph(0.46), '#5fb0a8', [0, 0, 0], [0, 0, 0], [0.9, 0.3, 1]), P(sph(0.28), '#9fe0d6', [0, 0.08, 0.02], [0, 0, 0], [0.8, 0.3, 0.9]), P(sph(0.075), '#fff', [-0.19, 0.1, 0.38]), P(sph(0.075), '#fff', [0.19, 0.1, 0.38]), P(sph(0.04), INK, [-0.19, 0.11, 0.44]), P(sph(0.04), INK, [0.19, 0.11, 0.44]),
        P(cyl(0.012, 0.03, 0.5, 6), '#3f8a82', [0, 0, -0.66], AXIS_Z), P(box(0.4, 0.03, 0.08), T.main, [0, 0.16, -0.08]), ...[[-0.15, -0.2], [0.12, -0.26], [0, 0.18]].map(([x, z]) => P(sph(0.05), '#e9f7c0', [x, 0.13, z], [0, 0, 0], [1, 0.4, 1]))],
      wingL: [P(sph(0.36), '#4f9a92', [-0.26, 0, 0], [0, 0, 0], [1, 0.12, 0.8])], wingR: [P(sph(0.36), '#4f9a92', [0.26, 0, 0], [0, 0, 0], [1, 0.12, 0.8])],
    },
    piv: { wingL: [-0.3, 0, 0], wingR: [0.3, 0, 0] },
  }),
  segelwicht: T => ({
    kind: 'ray', s: 1, h: 0.8,
    parts: {
      body: [P(sph(0.2), '#7b5637', [0, -0.28, 0], [0, 0, 0], [1, 0.95, 1]), P(cone(0.06, 0.22, 6), T.main, [-0.14, -0.08, 0], [0, 0, 0.6]), P(cone(0.06, 0.22, 6), T.main, [0.14, -0.08, 0], [0, 0, -0.6]), P(sph(0.05), '#ffe26a', [-0.08, -0.24, 0.17]), P(sph(0.05), '#ffe26a', [0.08, -0.24, 0.17]),
        P(cyl(0.01, 0.01, 0.4, 4), '#e8e2d0', [-0.16, 0.0, 0], [0, 0, 0.45]), P(cyl(0.01, 0.01, 0.4, 4), '#e8e2d0', [0.16, 0.0, 0], [0, 0, -0.45]), P(cyl(0.02, 0.02, 0.9, 5), '#3f7a34', [0, 0.2, 0], AXIS_Z), P(cone(0.03, 0.34, 5), BONE, [0.2, -0.3, 0.14], [1.3, 0, 0]),
        P(sph(0.06), '#3b2716', [-0.08, -0.48, 0.04]), P(sph(0.06), '#3b2716', [0.08, -0.48, 0.04])],
      wingL: [P(sph(0.3), '#5fa049', [-0.26, 0, 0], [0, 0, 0], [1, 0.08, 1.1]), P(box(0.5, 0.02, 0.03), '#3f7a34', [-0.26, 0.03, 0], [0, 0.4, 0])], wingR: [P(sph(0.3), '#6fb455', [0.26, 0, 0], [0, 0, 0], [1, 0.08, 1.1]), P(box(0.5, 0.02, 0.03), '#3f7a34', [0.26, 0.03, 0], [0, -0.4, 0])],
    },
    piv: { wingL: [-0.02, 0.2, 0], wingR: [0.02, 0.2, 0] },
  }),
  gewitterrochen: T => ({
    kind: 'ray', s: 1.05, h: 0.55,
    parts: {
      body: [P(sph(0.5), '#3a4a6b', [0, 0, 0], [0, 0, 0], [0.9, 0.3, 1.05]), P(sph(0.3), '#566a94', [0, 0.09, 0], [0, 0, 0], [0.8, 0.3, 0.9]), P(sph(0.05), '#fff27a', [-0.2, 0.08, 0.44]), P(sph(0.05), '#fff27a', [0.2, 0.08, 0.44]),
        P(cyl(0.012, 0.03, 0.8, 6), '#2a3650', [0, 0, -0.86], AXIS_Z), P(octa(0.07), '#fff27a', [0, 0, -1.28], [0, 0, 0], [1, 1, 1.6]), P(box(0.5, 0.03, 0.08), T.main, [0, 0.17, -0.14]),
        ...[[-0.2, 0.05, 0.5], [-0.12, -0.1, -0.5], [0.2, 0.0, 0.5], [0.12, -0.16, -0.5]].map(([x, z, a]) => P(box(0.04, 0.02, 0.22), '#fff27a', [x, 0.15, z], [0, a, 0]))],
      wingL: [P(sph(0.44), '#2f3d5c', [-0.3, 0, 0], [0, 0, 0], [1, 0.12, 0.85]), P(box(0.3, 0.02, 0.04), '#fff27a', [-0.4, 0.05, 0.05], [0, 0.4, 0])], wingR: [P(sph(0.44), '#2f3d5c', [0.3, 0, 0], [0, 0, 0], [1, 0.12, 0.85]), P(box(0.3, 0.02, 0.04), '#fff27a', [0.4, 0.05, 0.05], [0, -0.4, 0])],
      gOrb: [P(octa(0.09), '#fff27a', [0, 0, 0], [0, 0, 0], [1, 1.4, 1]), P(octa(0.05), '#ffffff', [0, 0, 0], [0, PI / 4, 0], [1, 1.7, 1])],
    },
    piv: { wingL: [-0.32, 0, 0], wingR: [0.32, 0, 0], gOrb: [0, 0.02, 0.56] },
  }),
  aschenschwinge: T => ({
    kind: 'ray', s: 1.45, h: 0.6,
    parts: {
      body: [P(sph(0.5), '#3a3230', [0, 0, 0], [0, 0, 0], [0.95, 0.42, 1.1]), P(rock1(0.3), '#4a403c', [0, 0.14, -0.05], [0.2, 0.4, 0], [1.1, 0.5, 1.2]), P(sph(0.2), '#2a2422', [0, 0.03, 0.5]), P(cone(0.07, 0.2, 5), '#2a2422', [0, 0.0, 0.7], AXIS_Z),
        P(cone(0.05, 0.2, 5), '#5a4a44', [-0.14, 0.22, 0.44], [-0.4, 0, 0.3]), P(cone(0.05, 0.2, 5), '#5a4a44', [0.14, 0.22, 0.44], [-0.4, 0, -0.3]), P(box(0.56, 0.03, 0.1), T.main, [0, 0.21, -0.16]), P(cone(0.14, 0.4, 5), '#2a2422', [0, 0, -0.66], [-PI / 2, 0, 0], [1, 1, 0.4])],
      wingL: [P(sph(0.5), '#5a2a22', [-0.38, 0, 0], [0, 0, 0], [1, 0.1, 0.8]), P(box(0.6, 0.03, 0.05), '#2a2422', [-0.36, 0.04, 0.12], [0, 0.25, 0])], wingR: [P(sph(0.5), '#5a2a22', [0.38, 0, 0], [0, 0, 0], [1, 0.1, 0.8]), P(box(0.6, 0.03, 0.05), '#2a2422', [0.36, 0.04, 0.12], [0, -0.25, 0])],
      gGlow: [P(sph(0.05), '#ff8a2a', [-0.09, 0.09, 0.64]), P(sph(0.05), '#ff8a2a', [0.09, 0.09, 0.64]), P(box(0.03, 0.02, 0.3), '#ff8a2a', [-0.14, 0.27, -0.05], [0, 0.4, 0]), P(box(0.03, 0.02, 0.24), '#ffb347', [0.1, 0.28, 0.05], [0, -0.5, 0]), P(box(0.03, 0.02, 0.2), '#ff8a2a', [0.02, 0.27, -0.25], [0, 1.2, 0])],
    },
    piv: { wingL: [-0.36, 0.02, 0], wingR: [0.36, 0.02, 0] },
  }),
  aschenfunke: T => ({
    kind: 'bird', s: 0.85, h: 0.35,
    parts: {
      body: [P(sph(0.15), '#4a403c', [0, 0, 0], [0, 0, 0], [0.9, 0.8, 1.2]), P(sph(0.1), '#3a3230', [0, 0.04, 0.17]), P(cone(0.035, 0.1, 5), '#2a2422', [0, 0.02, 0.29], AXIS_Z), P(torus(0.09, 0.028), T.main, [0, 0.02, 0.08])],
      wingL: [P(box(0.3, 0.025, 0.2), '#5a2a22', [-0.16, 0, 0])], wingR: [P(box(0.3, 0.025, 0.2), '#5a2a22', [0.16, 0, 0])],
      gGlow: [P(sph(0.035), '#ffb347', [-0.05, 0.08, 0.24]), P(sph(0.035), '#ffb347', [0.05, 0.08, 0.24]), P(sph(0.06), '#ff8a2a', [0, 0.1, -0.05], [0, 0, 0], [1, 0.4, 1.4])],
    },
    piv: { wingL: [-0.08, 0.04, 0], wingR: [0.08, 0.04, 0] },
  }),
  glutfalke: T => ({
    kind: 'bird', s: 1.3, h: 0.45,
    parts: {
      body: [P(sph(0.2), '#e8762a', [0, 0, 0], [0, 0, 0], [0.85, 0.75, 1.3]), P(sph(0.14), '#f3a23a', [0, -0.05, 0.08], [0, 0, 0], [0.8, 0.6, 1.1]), P(sph(0.13), '#e8762a', [0, 0.09, 0.26]), P(cone(0.05, 0.13, 6), '#3b2a1a', [0, 0.05, 0.42], [PI / 2 + 0.5, 0, 0]),
        P(sph(0.03), '#fff', [-0.07, 0.13, 0.35]), P(sph(0.03), '#fff', [0.07, 0.13, 0.35]), P(sph(0.018), INK, [-0.07, 0.13, 0.375]), P(sph(0.018), INK, [0.07, 0.13, 0.375]), P(cone(0.04, 0.16, 4), '#ffd27a', [0, 0.22, 0.2], [-0.6, 0, 0]),
        P(torus(0.11, 0.034), T.main, [0, 0.02, 0.12]), ...[-0.3, 0, 0.3].map(a => P(cone(0.06, 0.36, 4), a ? '#c9552a' : '#ffb347', [Math.sin(a) * 0.15, 0.0, -0.4], [-PI / 2, 0, -a], [1, 1, 0.4]))],
      wingL: [P(box(0.46, 0.03, 0.3), '#c9552a', [-0.23, 0, 0]), P(box(0.2, 0.035, 0.34), '#ffb347', [-0.44, 0, -0.03]), P(box(0.1, 0.035, 0.2), '#ffe08a', [-0.56, 0, -0.08])], wingR: [P(box(0.46, 0.03, 0.3), '#c9552a', [0.23, 0, 0]), P(box(0.2, 0.035, 0.34), '#ffb347', [0.44, 0, -0.03]), P(box(0.1, 0.035, 0.2), '#ffe08a', [0.56, 0, -0.08])],
    },
    piv: { wingL: [-0.12, 0.05, 0], wingR: [0.12, 0.05, 0] },
  }),
  // ---- Zweite Erweiterung: Kolosse und Gerät ------------------------------------------------------
  astriese: T => { // wandelnder Baumstumpf mit zwei Dornwerfern in den Ästen
    const d = golem(T, { stone: '#7a5a38', dark: '#5d3d1f', light: '#9a7a4c', cap: '#4f8a3c' }); d.s = 1.06;
    for (const sx of [-1, 1]) d.parts.body.push(P(cyl(0.05, 0.08, 0.5, 6), '#5d3d1f', [sx * 0.5, 1.75, -0.1], [0, 0, -sx * 0.7]), P(sph(0.17), '#5fa049', [sx * 0.62, 2.0, -0.1]), P(cone(0.08, 0.22, 6), '#3f8a3a', [sx * 0.62, 2.22, -0.1]),
      P(sph(0.04), '#fff', [sx * 0.62 - 0.06, 2.04, 0.04]), P(sph(0.04), '#fff', [sx * 0.62 + 0.06, 2.04, 0.04]), P(cone(0.025, 0.3, 5), BONE, [sx * 0.62 + 0.14, 2.02, 0.1], [1.2, 0, 0]), P(sph(0.16), '#5fa049', [sx * 0.3, 1.95, -0.25]));
    d.h = 2.4; return d;
  },
  dornenkoloss: T => {
    const d = golem(T, { stone: '#3d5a3a', dark: '#2a3f2a', light: '#5f8a4a', cap: '#7a2e5a' }); d.s = 1.16;
    for (let i = 0; i < 10; i++) { const a = i * 0.628, y = 0.75 + (i % 3) * 0.3; d.parts.body.push(P(cone(0.07, 0.34, 5), BONE, [Math.sin(a) * 0.66, y, Math.cos(a) * 0.52], [Math.cos(a) * 1.4, 0, -Math.sin(a) * 1.4])); }
    d.parts.armL.push(P(cone(0.06, 0.26, 5), BONE, [-0.3, -0.6, 0.05], [0, 0, 1.57])); d.parts.armR.push(P(cone(0.06, 0.26, 5), BONE, [0.3, -0.6, 0.05], [0, 0, -1.57]));
    return d;
  },
  runenhuene: T => {
    const d = golem(T, { stone: '#5b5470', dark: '#3c3650', light: '#8a80a8', cap: '#3c3650' }); d.s = 1.02;
    d.parts.gRune.push(P(torus(0.3, 0.03), '#c98bff', [0, 1.02, 0.5], [0, 0, 0], [1, 1.2, 0.5]), P(octa(0.1), '#c98bff', [0, 2.06, 0.1], [0, 0, 0], [1, 1.6, 1]), P(octa(0.08), '#c98bff', [-0.82, 0.62, 0.05], [0, 0, 0], [1, 1.5, 1]), P(octa(0.08), '#c98bff', [0.82, 0.62, 0.05], [0, 0, 0], [1, 1.5, 1]));
    d.h = 2.3; return d;
  },
  stelzenkessel: T => ({ // ein Wicht steuert einen Kessel auf Stelzen
    kind: 'golem', s: 1, h: 2.0,
    parts: {
      body: [...baseRing(T, 0.62), P(sph(0.5), '#3a3f48', [0, 1.05, 0], [0, 0, 0], [1, 0.86, 1]), P(torus(0.43, 0.06), STEEL_D, [0, 1.34, 0], AXIS_Z), P(cyl(0.4, 0.4, 0.03, 14), '#1a1410', [0, 1.37, 0]), P(box(0.3, 0.22, 0.05), T.main, [0, 1.0, 0.48]), P(torus(0.5, 0.035), STEEL_D, [0, 0.95, 0], AXIS_Z),
        P(sph(0.2), '#7b5637', [0, 1.52, -0.05]), P(cone(0.06, 0.24, 6), T.main, [-0.15, 1.72, -0.05], [0, 0, 0.6]), P(cone(0.06, 0.24, 6), T.main, [0.15, 1.72, -0.05], [0, 0, -0.6]),
        P(cyl(0.1, 0.14, 0.46, 8), '#2a2f3a', [0.34, 1.52, -0.24], [0.5, 0, -0.35]), P(torus(0.11, 0.025), STEEL, [0.4, 1.7, -0.14], [PI / 2 + 0.5, 0, -0.35])],
      legL: [P(cyl(0.05, 0.06, 0.74, 6), WOOD_D, [0, -0.36, 0]), P(box(0.2, 0.06, 0.28), STEEL_D, [0, -0.72, 0.04])], legR: [P(cyl(0.05, 0.06, 0.74, 6), WOOD_D, [0, -0.36, 0]), P(box(0.2, 0.06, 0.28), STEEL_D, [0, -0.72, 0.04])],
      armL: [P(cyl(0.045, 0.045, 0.5, 6), STEEL_D, [0, -0.25, 0]), P(sph(0.14), STEEL, [0, -0.55, 0.03])], armR: [P(cyl(0.045, 0.045, 0.5, 6), STEEL_D, [0, -0.25, 0]), P(box(0.24, 0.2, 0.22), STEEL, [0, -0.58, 0.05]), P(box(0.26, 0.06, 0.24), GOLD_D, [0, -0.58, 0.05])],
      gRune: [P(sph(0.05), '#ffe26a', [-0.08, 1.56, 0.12]), P(sph(0.05), '#ffe26a', [0.08, 1.56, 0.12]), P(sph(0.09), '#ff8a2a', [0.44, 1.76, -0.08])],
    },
    piv: { legL: [-0.3, 0.76, 0], legR: [0.3, 0.76, 0], armL: [-0.58, 1.18, 0], armR: [0.58, 1.18, 0] },
  }),
  armbrustwagen: T => ({
    kind: 'wagon', s: 1, h: 1.2,
    parts: {
      body: [...baseRing(T, 0.56), P(box(0.7, 0.2, 0.95), WOOD, [0, 0.36, 0]), P(box(0.76, 0.06, 1.0), WOOD_D, [0, 0.48, 0]), P(box(0.74, 0.1, 0.14), T.main, [0, 0.36, 0.5]),
        ...[-1, 1].flatMap(sx => [-0.28, 0.28].map(z => P(cyl(0.2, 0.2, 0.08, 12), WOOD_D, [sx * 0.42, 0.2, z], [0, 0, PI / 2]))), ...[-1, 1].flatMap(sx => [-0.28, 0.28].map(z => P(cyl(0.06, 0.06, 0.1, 8), STEEL, [sx * 0.42, 0.2, z], [0, 0, PI / 2]))),
        P(cyl(0.06, 0.09, 0.2, 8), WOOD_D, [0, 0.6, 0.05]), P(box(0.12, 0.1, 1.0), WOOD_D, [0, 0.74, 0.18]), P(torus(0.42, 0.04, PI), T.main, [0, 0.8, 0.4], basis([1, 0, 0], [0, 0, 1], [0, -1, 0])), P(cyl(0.02, 0.02, 0.7, 6), '#e6e9ee', [0, 0.82, 0.4], AXIS_Z), P(cone(0.05, 0.14, 6), STEEL, [0, 0.82, 0.8], AXIS_Z),
        P(sph(0.16), '#7b5637', [0, 0.72, -0.34]), P(cone(0.05, 0.18, 6), T.main, [-0.12, 0.88, -0.34], [0, 0, 0.6]), P(cone(0.05, 0.18, 6), T.main, [0.12, 0.88, -0.34], [0, 0, -0.6]), P(sph(0.04), '#ffe26a', [-0.06, 0.75, -0.2]), P(sph(0.04), '#ffe26a', [0.06, 0.75, -0.2])],
    },
    piv: {},
  }),
  armbrustwagen_w: T => ({ // die Achse ist gebrochen: der Wagen steht schief auf dem Boden, die Armbrust dreht sich weiter
    kind: 'turret', s: 1, h: 1.1,
    parts: {
      body: [P(cyl(0.7, 0.7, 0.04, 16), T.main, [0, 0.02, 0]), P(box(0.7, 0.2, 0.95), WOOD, [0, 0.2, 0], [0, 0, 0.12]), P(box(0.76, 0.06, 1.0), WOOD_D, [0, 0.32, 0], [0, 0, 0.12]), P(cyl(0.2, 0.2, 0.08, 12), WOOD_D, [0.62, 0.06, 0.3], [PI / 2 - 0.2, 0, 0.3]), P(cyl(0.2, 0.2, 0.08, 12), WOOD_D, [-0.5, 0.2, -0.28], [0, 0, PI / 2 - 0.5]),
        P(box(0.3, 0.05, 0.06), WOOD_D, [0.5, 0.05, -0.4], [0, 0.6, 0]), P(cyl(0.06, 0.09, 0.2, 8), WOOD_D, [0, 0.42, 0.05])],
      top: [P(box(0.12, 0.1, 1.0), WOOD_D, [0, 0, 0.13]), P(torus(0.42, 0.04, PI), T.main, [0, 0.06, 0.35], basis([1, 0, 0], [0, 0, 1], [0, -1, 0])), P(cyl(0.02, 0.02, 0.7, 6), '#e6e9ee', [0, 0.08, 0.35], AXIS_Z), P(cone(0.05, 0.14, 6), STEEL, [0, 0.08, 0.75], AXIS_Z)],
    },
    piv: { top: [0, 0.56, 0.05] },
  }),
  // ---- Zweite Erweiterung: Gebäude ----------------------------------------------------------------
  raeuberlager: T => ({
    kind: 'static', s: 1, h: 1.5,
    parts: {
      body: [P(cyl(0.95, 0.95, 0.03, 16), T.main, [0, 0.015, 0]), P(cone(0.8, 1.2, 8), '#b08350', [0, 0.62, -0.05]), P(cone(0.82, 0.3, 8), T.main, [0, 0.17, -0.05], [0, 0, 0], [1, 1, 1]), P(cone(0.3, 0.44, 8), '#8a6a43', [0, 1.02, -0.05]),
        P(box(0.3, 0.5, 0.06), '#2a1d14', [0, 0.28, 0.62], [-0.55, 0, 0]), P(cyl(0.025, 0.025, 1.0, 5), WOOD_D, [-0.1, 1.2, -0.05], [0, 0, 0.35]), P(cyl(0.025, 0.025, 1.0, 5), WOOD_D, [0.1, 1.2, -0.05], [0, 0, -0.35]),
        P(box(0.14, 0.03, 0.22), WOOD, [-0.26, 1.64, -0.05], [0, 0, 0.35]), P(box(0.14, 0.03, 0.22), WOOD, [0.26, 1.64, -0.05], [0, 0, -0.35]), P(rock(0.1), STONE_D, [0.62, 0.08, 0.52]), P(rock(0.09), STONE, [0.48, 0.07, 0.66]), P(rock(0.09), STONE_D, [0.74, 0.07, 0.64])],
      gGlow: [P(cone(0.09, 0.26, 6), '#ff8a2a', [0.62, 0.24, 0.62]), P(cone(0.05, 0.16, 6), '#ffe08a', [0.6, 0.2, 0.64])],
    },
    piv: {},
  }),
  kieselhaufen: T => ({
    kind: 'static', s: 1, h: 1.0,
    parts: {
      body: [P(cyl(0.8, 0.8, 0.03, 16), T.main, [0, 0.015, 0]), P(rock1(0.4), STONE_D, [-0.25, 0.26, 0.1], [0.3, 0.2, 0]), P(rock1(0.38), STONE, [0.28, 0.24, 0.05], [0, 0.8, 0.2]), P(rock1(0.34), STONE_L, [0, 0.26, -0.3], [0.5, 0, 0]), P(rock1(0.32), STONE, [0.02, 0.56, 0], [0.2, 1.2, 0]),
        P(rock1(0.2), STONE_L, [-0.05, 0.86, 0.02], [0, 0.5, 0.3]), P(rock1(0.16), STONE_D, [0.45, 0.12, 0.42]), P(rock1(0.14), STONE, [-0.5, 0.1, 0.42]), P(octa(0.1), T.main, [-0.05, 1.08, 0.02], [0, 0, 0], [1, 1.5, 1])],
      gGlow: [P(sph(0.04), '#ffe26a', [-0.06, 0.6, 0.28]), P(sph(0.04), '#ffe26a', [0.1, 0.6, 0.27]), P(sph(0.035), '#ffe26a', [-0.33, 0.3, 0.44]), P(sph(0.035), '#ffe26a', [-0.2, 0.3, 0.47])],
    },
    piv: {},
  }),
  wolfszwinger: T => ({
    kind: 'static', s: 1, h: 1.25,
    parts: {
      body: [P(cyl(0.85, 0.85, 0.03, 16), T.main, [0, 0.015, 0]), P(box(1.1, 0.12, 1.1), WOOD_D, [0, 0.09, 0]), P(box(1.16, 0.1, 1.16), WOOD_D, [0, 1.05, 0]), P(box(1.0, 0.06, 1.0), T.main, [0, 1.13, 0]),
        ...Array.from({ length: 12 }, (_, i) => { const s = Math.floor(i / 3), k = (i % 3 - 1) * 0.34, q = [[k, 0.5], [k, -0.5], [0.5, k], [-0.5, k]][s]; return P(cyl(0.03, 0.03, 0.9, 5), STEEL_D, [q[0], 0.58, q[1]]); }),
        ...[[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]].map(([x, z]) => P(box(0.1, 0.92, 0.1), WOOD, [x, 0.58, z])), P(sph(0.3), '#3a4048', [0, 0.42, 0], [0, 0, 0], [1, 0.9, 1.1]), P(cone(0.07, 0.18, 4), '#3a4048', [-0.12, 0.74, 0.1]), P(cone(0.07, 0.18, 4), '#3a4048', [0.12, 0.74, 0.1]),
        P(torus(0.1, 0.03), STEEL, [0, 0.55, 0.53])],
      gGlow: [P(sph(0.045), '#ff5a4a', [-0.1, 0.52, 0.27]), P(sph(0.045), '#ff5a4a', [0.1, 0.52, 0.27])],
    },
    piv: {},
  }),
  maulwurfshuegel: T => ({
    kind: 'static', s: 1, h: 1.0,
    parts: {
      body: [P(cyl(0.85, 0.85, 0.03, 16), T.main, [0, 0.015, 0]), P(dome(0.8), '#6b4f32', [0, 0.02, 0], [0, 0, 0], [1, 0.55, 1]), P(sph(0.45), '#7d5f3e', [0.2, 0.2, -0.1], [0, 0, 0], [1, 0.6, 1]), P(torus(0.3, 0.1), '#8a6a43', [-0.08, 0.42, 0.1], [PI / 2 - 0.25, 0, 0]), P(cyl(0.26, 0.26, 0.02, 14), '#150e08', [-0.08, 0.45, 0.12], [-0.25, 0, 0]),
        P(box(0.06, 0.5, 0.06), WOOD_D, [-0.4, 0.5, 0.1], [0, 0, 0.15]), P(box(0.06, 0.5, 0.06), WOOD_D, [0.24, 0.52, 0.12], [0, 0, -0.15]), P(box(0.76, 0.06, 0.08), WOOD, [-0.08, 0.76, 0.11]),
        P(cyl(0.015, 0.015, 0.6, 4), WOOD_D, [0.45, 0.6, -0.3]), P(box(0.26, 0.16, 0.02), T.main, [0.59, 0.82, -0.3]), ...[[0.5, 0.42], [-0.55, 0.3], [0.1, 0.66]].map(([x, z]) => P(rock(0.09), '#5a4128', [x, 0.08, z]))],
      gGlow: [P(sph(0.06), '#fff3c4', [-0.08, 0.68, 0.16])],
    },
    piv: {},
  }),
  funkenpfahl: T => ({
    kind: 'turret', s: 1, h: 1.6,
    parts: {
      body: [P(cyl(0.78, 0.78, 0.04, 16), T.main, [0, 0.02, 0]), P(cyl(0.5, 0.6, 0.16, 10), STONE_D, [0, 0.1, 0]), P(torus(0.42, 0.07), '#6b4f32', [0, 0.16, 0], AXIS_Z)],
      top: [P(cyl(0.09, 0.12, 1.1, 8), WOOD_D, [0, 0.55, 0]), ...[0.3, 0.5, 0.7, 0.9].map(y => P(torus(0.15 - y * 0.03, 0.03), '#c9793a', [0, y, 0], AXIS_Z)), P(cyl(0.16, 0.1, 0.1, 8), STEEL_D, [0, 1.12, 0]), P(box(0.3, 0.05, 0.05), '#c9793a', [0, 1.05, 0.12]), P(torus(0.2, 0.04), T.main, [0, 0.14, 0], AXIS_Z)],
      gOrb: [P(sph(0.13), '#fff27a'), P(sph(0.07), '#ffffff', [0.03, 0.04, 0.04])],
    },
    piv: { top: [0, 0.18, 0], gOrb: [0, 1.48, 0] },
  }),
  kurbelbogen: T => ({
    kind: 'turret', s: 1, h: 1.25,
    parts: {
      body: [P(cyl(0.9, 0.9, 0.04, 16), T.main, [0, 0.02, 0]), P(box(1.1, 0.12, 1.2), WOOD_D, [0, 0.1, 0]), P(box(0.9, 0.05, 1.0), WOOD, [0, 0.18, 0]), P(box(0.1, 0.5, 0.1), WOOD_D, [-0.36, 0.42, -0.1]), P(box(0.1, 0.5, 0.1), WOOD_D, [0.36, 0.42, -0.1]), P(cyl(0.04, 0.04, 0.84, 6), STEEL_D, [0, 0.62, -0.1], [0, 0, PI / 2])],
      top: [P(box(0.2, 0.14, 1.6), WOOD, [0, 0.0, 0.2]), P(box(0.24, 0.06, 0.5), STEEL_D, [0, 0.09, 0.7]), P(torus(0.72, 0.05, PI), T.main, [0, 0.06, 0.55], basis([1, 0, 0], [0, 0, 1], [0, -1, 0])), P(cyl(0.012, 0.012, 1.44, 4), '#e8e2d0', [0, 0.06, 0.55], [0, 0, PI / 2]),
        ...[-0.06, 0, 0.06].map(x => P(cyl(0.02, 0.02, 0.9, 5), '#e6e9ee', [x, 0.12, 0.55], AXIS_Z)), P(cone(0.07, 0.16, 6), STEEL, [0, 0.12, 1.06], AXIS_Z), P(torus(0.2, 0.035), GOLD_D, [0.2, 0.0, -0.5], [0, PI / 2, 0]), P(cyl(0.02, 0.02, 0.2, 5), WOOD_D, [0.3, 0.18, -0.5], [0, 0, PI / 2]),
        P(box(0.3, 0.26, 0.3), T.main, [0, 0.1, -0.4]), P(box(0.32, 0.06, 0.32), T.dark, [0, 0.24, -0.4])],
    },
    piv: { top: [0, 0.66, -0.1] },
  }),
  aussenturm: T => towerModel(T, false),
  geschuetzturm: T => towerModel(T, false, 'geschuetz'),
  klingenturm: T => towerModel(T, false, 'klingen'),
  segensturm: T => towerModel(T, false, 'segen'),
  hauptturm: T => towerModel(T, true),
};

const defCache = new Map();
export function getDef(model, side) {
  const key = model + side;
  if (!defCache.has(key)) {
    const d = MODELS[model](TEAM[side]);
    d.geos = {};
    for (const [name, parts] of Object.entries(d.parts)) if (parts.length) d.geos[name] = merge(parts);
    delete d.parts;
    defCache.set(key, d);
  }
  return defCache.get(key);
}
