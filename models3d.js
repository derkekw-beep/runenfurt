// 3D-Modelle aller Figuren, aus Grundformen zusammengesetzt (eigene Entwürfe, keine Dateien).
// Jede Figur besteht aus wenigen beweglichen Teilen; unbewegte Formen werden je Teil zu einer Geometrie
// mit Eckfarben verschmolzen. Blickrichtung ist +Z, Maße in Feldern.
import * as THREE from './vendor/three.module.min.js';
import { TEAM } from './render.js';

const PI = Math.PI;
export const SKIN = '#f3c9a2', INK = '#1d2530', DARK = '#2a2f3a';
export const STONE = '#939aa5', STONE_D = '#646b75', STONE_L = '#b4bbc4', WOOD = '#9a6634', WOOD_D = '#5d3d1f';
const GOLD = '#f5c542', GOLD_D = '#b98617', STEEL = '#c5cbd4', STEEL_D = '#7d8590', BONE = '#f3ead2';
export const FLY = { kraehe: 1.5, rochen: 1.7, donnerkaefer: 1.9 };
export const USCALE = 1.3; // Figuren größer zeichnen als ihr Spielradius: auf dem Handy besser zu erkennen

// ---- Bausteine ---------------------------------------------------------------------------------
export const sph = r => new THREE.SphereGeometry(r, 16, 12);
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const cone = (r, h, seg = 10) => new THREE.ConeGeometry(r, h, seg);
export const caps = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 12);
export const octa = r => new THREE.OctahedronGeometry(r);
export const rock = r => new THREE.IcosahedronGeometry(r, 0);
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

function towerModel(T, main) {
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
  return { kind: 'tower', s: 1, h: cy + r * 1.6 + 0.25, parts: { body, gCrystal: [P(octa(r), T.main, [0, 0, 0], [0, 0, 0], [1, 1.6, 1]), P(octa(r * 0.55), T.light, [0, 0, 0], [0, PI / 4, 0], [1, 1.9, 1])] }, piv: { gCrystal: [0, cy, 0] } };
}

const golem = T => ({
  kind: 'golem', s: 1, h: 2.15,
  parts: {
    body: [...baseRing(T, 0.8), P(rock1(0.62), STONE, [0, 1.02, 0], [0, 0.3, 0], [1.12, 1.0, 0.9]), P(rock1(0.3), STONE_L, [0, 1.74, 0.1], [0, 0.9, 0]),
      P(sph(0.36), '#6f9a52', [0.05, 1.5, -0.2], [0, 0, 0], [1.1, 0.35, 0.9]), P(box(0.34, 0.07, 0.05), INK, [0, 1.8, 0.37])],
    legL: [P(cyl(0.25, 0.3, 0.5, 7), STONE_D, [0, -0.25, 0])], legR: [P(cyl(0.25, 0.3, 0.5, 7), STONE_D, [0, -0.25, 0])],
    armL: [P(rock1(0.25), STONE_D, [0, -0.05, 0]), P(rock1(0.36), STONE_L, [0, -0.6, 0.05], [0.5, 0.3, 0])], armR: [P(rock1(0.25), STONE_D, [0, -0.05, 0]), P(rock1(0.36), STONE_L, [0, -0.6, 0.05], [0.2, 1, 0])],
    gRune: [P(octa(0.22), T.main, [0, 1.02, 0.52], [0, 0, 0], [1, 1.4, 0.45]), P(sph(0.055), T.light, [-0.11, 1.8, 0.37]), P(sph(0.055), T.light, [0.11, 1.8, 0.37]),
      P(octa(0.15), T.main, [-0.42, 1.62, -0.1], [0, 0, 0.5], [1, 1.6, 1]), P(octa(0.15), T.main, [0.42, 1.62, -0.1], [0, 0, -0.5], [1, 1.6, 1]), P(octa(0.13), T.main, [0, 1.3, -0.55], [0.6, 0, 0], [1, 1.5, 1])],
  },
  piv: { legL: [-0.3, 0.5, 0], legR: [0.3, 0.5, 0], armL: [-0.82, 1.28, 0], armR: [0.82, 1.28, 0] },
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
  steinhueter: golem,
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
  aussenturm: T => towerModel(T, false),
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
