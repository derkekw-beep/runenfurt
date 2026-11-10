// Kulissen der 14 Arenen: Himmel, Licht, Umland, Fluss, Brücken und Schwebeteilchen.
// Eigene Entwürfe aus Grundformen; je Arena eine Streu-Regel (prop) und ein paar feste Blickfänge (mark).
import { P, box, cyl, cone, sph, rock, rock1, octa, torus, STONE, STONE_D, STONE_L, WOOD, WOOD_D } from './models3d.js';

const PI = Math.PI;

// ---- Bausteine fürs Umland: st = beleuchtete Teile, gl = selbstleuchtende Teile ------------------
const pine = (st, x, z, k, a, b, trunk = WOOD_D) => st.push(P(cyl(0.12 * k, 0.16 * k, 0.6 * k, 6), trunk, [x, 0.3 * k - 0.3, z]), P(cone(0.75 * k, 1.5 * k, 7), a, [x, 1.2 * k - 0.3, z]), P(cone(0.55 * k, 1.2 * k, 7), b, [x, 1.9 * k - 0.3, z]));
const round = (st, x, z, k, a, b, trunk = WOOD_D) => st.push(P(cyl(0.1 * k, 0.15 * k, 1.0 * k, 6), trunk, [x, 0.2 * k, z]), P(sph(0.75 * k), a, [x, 1.15 * k, z], [0, 0, 0], [1, 0.85, 1]), P(sph(0.5 * k), b, [x + 0.35 * k, 1.55 * k, z + 0.1 * k]));
const dead = (st, x, z, k, col = '#4a4036') => st.push(P(cyl(0.07 * k, 0.16 * k, 1.8 * k, 5), col, [x, 0.6 * k, z]), P(cyl(0.03 * k, 0.06 * k, 0.9 * k, 4), col, [x + 0.3 * k, 1.3 * k, z], [0, 0, -0.9]), P(cyl(0.03 * k, 0.05 * k, 0.7 * k, 4), col, [x - 0.25 * k, 1.0 * k, z], [0, 0, 0.8]), P(cyl(0.02 * k, 0.04 * k, 0.5 * k, 4), col, [x + 0.05 * k, 1.6 * k, z + 0.15 * k], [0.7, 0, 0.2]));
const stone = (st, x, z, k, col, q = 0) => st.push(P(rock(0.5 * k), col, [x, 0, z], [q, q * 3, 0], [1.2, 0.8, 1]));
const mound = (st, x, z, k, col) => st.push(P(sph(0.9 * k), col, [x, -0.25, z], [0, 0, 0], [1.3, 0.5, 1]));
const crag = (st, x, z, k, a, b) => st.push(P(rock1(0.9 * k), a, [x, 0.3 * k, z], [0.2, x, 0], [1, 1.5, 1]), P(rock1(0.55 * k), b, [x + 0.5 * k, 0.9 * k, z - 0.2 * k], [0.5, z, 0.2], [0.9, 1.4, 0.9]));
const spike = (st, x, z, k, a, b) => st.push(P(cone(0.42 * k, 2.4 * k, 5), a, [x, 0.9 * k, z], [0, x, 0.06]), P(cone(0.26 * k, 1.5 * k, 5), b, [x + 0.45 * k, 0.45 * k, z + 0.2 * k], [0, z, -0.12]));
const crystal = (st, gl, x, z, k, col, base = '#2a4650') => { st.push(P(rock(0.45 * k), base, [x, -0.05, z], [0, x, 0], [1.4, 0.6, 1.4])); gl.push(P(octa(0.34 * k), col, [x, 0.8 * k, z], [0, x, 0.12], [1, 2.6, 1]), P(octa(0.22 * k), col, [x + 0.42 * k, 0.5 * k, z + 0.1], [0, z, -0.35], [1, 2.2, 1]), P(octa(0.17 * k), '#ffffff', [x - 0.32 * k, 0.4 * k, z - 0.1], [0.2, 0, 0.4], [1, 2, 1])); };
const mushroom = (st, gl, x, z, k, cap, glow) => { st.push(P(cyl(0.1 * k, 0.14 * k, 0.7 * k, 6), '#e8e2d0', [x, 0.2 * k, z])); (glow ? gl : st).push(P(sph(0.45 * k), cap, [x, 0.6 * k, z], [0, 0, 0], [1, 0.55, 1])); };
const reed = (st, x, z, k) => { for (let j = 0; j < 4; j++) st.push(P(cyl(0.02, 0.03, 1.1 * k, 4), '#7f9a4a', [x + (j - 1.5) * 0.14, 0.4 * k, z + (j % 2) * 0.12], [0, 0, (j - 1.5) * 0.08]), P(cyl(0.05, 0.05, 0.26 * k, 5), '#6b4a2b', [x + (j - 1.5) * 0.17, 0.95 * k, z + (j % 2) * 0.12])); };
const pool = (st, gl, x, z, k, col, rim) => { st.push(P(cyl(1.0 * k, 1.1 * k, 0.1, 12), rim, [x, -0.27, z])); gl.push(P(cyl(0.85 * k, 0.85 * k, 0.04, 12), col, [x, -0.21, z])); };
const mesa = (st, x, z, k, a, b) => st.push(P(cyl(1.1 * k, 1.4 * k, 1.3 * k, 7), a, [x, 0.35 * k, z]), P(cyl(0.95 * k, 1.1 * k, 0.5 * k, 7), b, [x, 1.2 * k, z]), P(cyl(0.6 * k, 0.8 * k, 0.7 * k, 6), a, [x + 0.2 * k, 1.75 * k, z]));
const pillar = (st, x, z, k, a, b) => st.push(P(cyl(0.3 * k, 0.34 * k, 2.6 * k, 8), a, [x, 1.0 * k, z]), P(box(0.9 * k, 0.2 * k, 0.9 * k), b, [x, 2.38 * k, z]), P(box(0.9 * k, 0.26 * k, 0.9 * k), b, [x, -0.2, z]));
const cloud = (st, x, y, z, k, col = '#ffffff') => st.push(P(sph(0.9 * k), col, [x, y, z], [0, 0, 0], [1.5, 0.55, 1]), P(sph(0.7 * k), col, [x + 0.9 * k, y + 0.1, z + 0.2], [0, 0, 0], [1.3, 0.6, 1]), P(sph(0.6 * k), col, [x - 0.9 * k, y - 0.05, z - 0.1], [0, 0, 0], [1.3, 0.5, 1]));
const stump = (st, gl, x, z, k) => { st.push(P(cyl(0.2 * k, 0.28 * k, 0.7 * k, 6), '#2a2622', [x, 0.05, z]), P(cyl(0.04 * k, 0.07 * k, 0.6 * k, 4), '#2a2622', [x + 0.2 * k, 0.55 * k, z], [0, 0, -0.8])); gl.push(P(sph(0.08 * k), '#ff8a2a', [x, 0.44 * k, z])); };
const lantern = (st, gl, x, z, k, col) => { st.push(P(cyl(0.05, 0.07, 1.6 * k, 5), WOOD_D, [x, 0.5 * k, z]), P(box(0.3, 0.06, 0.3), WOOD_D, [x, 1.32 * k, z])); gl.push(P(octa(0.17), col, [x, 1.1 * k, z], [0, 0, 0], [1, 1.4, 1])); };
const menhir = (st, gl, x, z, k, col) => { st.push(P(rock1(0.55 * k), '#5f5878', [x, 0.9 * k, z], [0.1, x, 0.05], [0.8, 2.4, 0.6])); gl.push(P(box(0.1 * k, 0.9 * k, 0.04), col, [x, 1.1 * k, z + 0.36 * k]), P(box(0.34 * k, 0.1 * k, 0.04), col, [x, 1.3 * k, z + 0.36 * k])); };
const dome = (st, gl, x, z, k) => { st.push(P(cyl(1.3 * k, 1.4 * k, 1.2 * k, 12), '#c9cfdc', [x, 0.3 * k, z]), P(sph(1.3 * k), '#e8edf5', [x, 0.9 * k, z], [0, 0, 0], [1, 0.85, 1]), P(box(0.3 * k, 1.2 * k, 1.5 * k), '#3a4466', [x, 1.5 * k, z + 0.4 * k], [0.5, 0, 0]), P(cyl(0.12 * k, 0.2 * k, 1.6 * k, 8), '#b98617', [x, 2.1 * k, z + 0.9 * k], [0.9, 0, 0])); gl.push(P(sph(0.15 * k), '#fff6d8', [x, 2.72 * k, z + 1.5 * k])); };
const island = (st, x, y, z, k, top, base) => st.push(P(cone(1.3 * k, 1.8 * k, 7), base, [x, y - 0.9 * k, z], [PI, 0, 0]), P(cyl(1.35 * k, 1.3 * k, 0.25 * k, 7), top, [x, y + 0.1 * k, z]));
const scaffold = (st, x, z, k) => { for (const sx of [-1, 1]) st.push(P(box(0.12, 2.2 * k, 0.12), WOOD_D, [x + sx * 0.7 * k, 0.8 * k, z])); st.push(P(box(1.7 * k, 0.12, 0.14), WOOD, [x, 1.85 * k, z]), P(box(1.6 * k, 0.1, 0.12), WOOD, [x, 0.9 * k, z], [0, 0, 0.5]), P(box(0.7 * k, 0.4 * k, 0.5 * k), '#5a606c', [x, 0, z + 0.6 * k]), P(rock(0.22 * k), '#c9793a', [x, 0.3 * k, z + 0.6 * k])); };
const arch = (st, x, z, k, a, b) => { pillar(st, x - 1.6 * k, z, k, a, b); pillar(st, x + 1.6 * k, z, k, a, b); st.push(P(torus(1.6 * k, 0.22 * k, PI), b, [x, 2.45 * k, z])); };

// Punkt vom Feld wegschieben, damit große Stücke nicht in die Mauer ragen
const away = (c, x, z, d) => (z < 0 ? [x, Math.min(z, -d)] : z > c.H ? [x, Math.max(z, c.H + d * 0.7)] : [x < c.W / 2 ? Math.min(x, -d) : Math.max(x, c.W + d), z]);
const STONE_BRIDGE = ['#b3aca0', '#7c766c', '#8d877c', '#9f998d'], WOOD_BRIDGE = ['#a8763e', '#5d3d1f', '#7a5230', '#8a6038'];

// sky: Farbe hinter allem · hemi: [Himmel, Boden, Stärke] · sun: [Farbe, Stärke] · water: [Farbe, Deckkraft]
// wall: [dunkel, hell] · bridge: [Platte, Fuge, Geländer, Pfosten] · rune: [Stein, Zeichen] · motes: Schwebeteilchen
export const THEMES = [
  { name: 'Moosgrund', sky: '#1d3b33', hemi: ['#f2faff', '#98a878', 2.3], sun: ['#fff1d2', 2.6], water: ['#b8e6ff', 0.16], wall: [STONE_D, STONE_L], bridge: STONE_BRIDGE,
    motes: { kind: 'mote', color: '#fff3c4', size: 0.12, n: 26, opacity: 0.7 },
    prop(c, x, z, k, i) { if (i % 5 === 0) stone(c.st, x, z, k, STONE_D, c.r()); else pine(c.st, x, z, k, i % 2 ? c.leaf : c.leaf2, i % 2 ? c.leaf2 : c.leaf); },
    mark(c) { crag(c.st, c.W / 2 + 5, -6.5, 1.8, STONE_D, STONE); mushroom(c.st, c.gl, -2.6, 9, 0.9, '#d9483a', false); mushroom(c.st, c.gl, c.W + 2.4, 20, 0.8, '#d9483a', false); } },
  { name: 'Kieselfurt', sky: '#3d4a36', outer: '#8f9468', hemi: ['#fffaf0', '#b0a878', 2.3], sun: ['#fff4d8', 2.7], water: ['#d7f2ff', 0.2], wall: ['#7d7868', '#b9b29c'], bridge: STONE_BRIDGE,
    prop(c, x, z, k, i) { if (i % 3 === 0) { stone(c.st, x, z, k * 1.3, i % 2 ? '#b9b29c' : '#9a9482', c.r()); stone(c.st, x + 0.7, z + 0.3, k * 0.6, '#cfc7b0', c.r()); } else if (i % 3 === 1) reed(c.st, x, z, k); else round(c.st, x, z, k, '#9fc46a', '#b8d67c', '#e8e2d0'); },
    mark(c) { for (let j = 0; j < 7; j++) stone(c.st, -1.2 - (j % 3) * 0.8, c.H / 2 - 3 + j, 0.7 + (j % 2) * 0.4, '#cfc7b0', j); for (let j = 0; j < 7; j++) stone(c.st, c.W + 1.2 + (j % 3) * 0.8, c.H / 2 - 3 + j, 0.7 + (j % 2) * 0.4, '#b9b29c', j); } },
  { name: 'Nebelhain', sky: '#12302f', outer: '#2f6b66', hemi: ['#d7fff4', '#4f8f88', 2.1], sun: ['#e6fff8', 2.2], water: ['#a8f0e0', 0.22], wall: ['#4f6b6a', '#8fb3ae'], bridge: WOOD_BRIDGE, rune: ['#5f7f7a', '#a8f0e0'],
    motes: { kind: 'wisp', color: '#a8f0e0', size: 0.2, n: 44, opacity: 0.85 },
    prop(c, x, z, k, i) { if (i % 6 === 0) mushroom(c.st, c.gl, x, z, k * 1.5, '#59e0c8', true); else if (i % 6 === 1) stone(c.st, x, z, k, '#4f6b6a', c.r()); else pine(c.st, x, z, k * 1.25, i % 2 ? '#1f5f5a' : '#2f7f74', i % 2 ? '#2f7f74' : '#3f9a8c', '#3b2f2a'); },
    mark(c) { for (const [x, z] of [[-2.2, 6], [c.W + 2.2, 12], [-2.4, 24], [c.W + 2.3, 27]]) mushroom(c.st, c.gl, x, z, 1.3, '#59e0c8', true); } },
  { name: 'Eisenklamm', sky: '#23272f', outer: '#4f5560', hemi: ['#eef2f8', '#6a7078', 2.2], sun: ['#ffe9c4', 2.6], water: ['#b8d8f0', 0.16], wall: ['#4a505c', '#8d949f'], bridge: ['#8d949f', '#4a505c', '#6a707c', '#c9793a'], rune: ['#5a606c', '#ffb347'],
    motes: { kind: 'ember', color: '#ffb347', size: 0.1, n: 22, opacity: 0.9 },
    prop(c, x, z, k, i) { const [px, pz] = away(c, x, z, 2.6); if (i % 4 === 0) scaffold(c.st, px, pz, k); else if (i % 4 === 1) crag(c.st, px, pz, k * 1.5, '#59606c', '#7b838f'); else { crag(c.st, px, pz, k, '#4a505c', '#6a707c'); stone(c.st, px + 0.9, pz + 0.4, k * 0.5, '#c9793a', c.r()); } },
    mark(c) { crag(c.st, -5, -5, 3, '#4a505c', '#6a707c'); crag(c.st, c.W + 5, -5, 3, '#59606c', '#7b838f'); c.gl.push(P(sph(0.5), '#ff8a2a', [c.W / 2, 0.2, -5.5], [0, 0, 0], [1.6, 0.5, 1])); c.st.push(P(cyl(1.2, 1.5, 1.0, 8), '#4a505c', [c.W / 2, 0, -5.5]), P(cyl(0.35, 0.45, 2.4, 6), '#3a3f48', [c.W / 2 + 1.2, 1.0, -6.2])); } },
  { name: 'Sturmhöhe', sky: '#6f9fc8', outer: '#8fb0c8', hemi: ['#ffffff', '#9fb8cc', 2.5], sun: ['#ffffff', 2.5], water: ['#e6f4ff', 0.24], wall: ['#7f94a8', '#c9d8e6'], bridge: STONE_BRIDGE, rune: ['#8fa4b8', '#ffffff'], clouds: 6,
    prop(c, x, z, k, i) { if (i % 4 === 0) cloud(c.st, x, 0.3 + c.r() * 1.2, z, k * 1.2); else if (i % 4 === 1) { const [px, pz] = away(c, x, z, 2.4); crag(c.st, px, pz, k * 1.4, '#9fb4c8', '#c9d8e6'); } else if (i % 4 === 2) pine(c.st, x, z, k, '#4f8a8f', '#6fa8ac'); else spike(c.st, x, z, k, '#a8bccf', '#c9d8e6'); },
    mark(c) { c.st.push(P(cone(4.2, 6.5, 6), '#8fa4b8', [c.W / 2 - 6, 2.4, -8.5]), P(cone(1.5, 2.2, 6), '#ffffff', [c.W / 2 - 6, 4.6, -8.5]), P(cone(3.4, 5.2, 6), '#9fb4c8', [c.W / 2 + 7, 1.8, -8]), P(cone(1.2, 1.8, 6), '#ffffff', [c.W / 2 + 7, 3.6, -8])); } },
  { name: 'Glutkessel', sky: '#2a120c', outer: '#3a2420', hemi: ['#ffd9b0', '#7a3a24', 2.2], sun: ['#ffc48a', 2.6], water: ['#ffd27a', 0.3], wall: ['#3a2a28', '#6a4a40'], bridge: ['#5a4a46', '#2a1f1c', '#3a2a28', '#ff8a2a'], rune: ['#3a2a28', '#ffb347'],
    motes: { kind: 'ember', color: '#ffb347', size: 0.13, n: 70, opacity: 0.95 },
    prop(c, x, z, k, i) { const [px, pz] = away(c, x, z, 2.4); if (i % 4 === 0) pool(c.st, c.gl, px, pz, k * 1.2, i % 8 ? '#ff8a2a' : '#ffb347', '#2f2422'); else if (i % 4 === 1) crag(c.st, px, pz, k * 1.3, '#2f2a2a', '#4a3a36'); else if (i % 4 === 2) spike(c.st, x, z, k, '#3a2f2c', '#4a3a36'); else stump(c.st, c.gl, x, z, k * 1.2); },
    mark(c) { c.st.push(P(cone(5.5, 6, 8), '#2f2a2a', [c.W / 2, 1.6, -9]), P(cone(3.2, 3.4, 8), '#4a3a36', [c.W / 2 + 6.5, 0.6, -7.5])); c.gl.push(P(cyl(1.5, 1.0, 0.5, 8), '#ff8a2a', [c.W / 2, 4.5, -9]), P(cyl(0.3, 0.5, 4.2, 5), '#ff6a3a', [c.W / 2 + 0.8, 2.6, -7.2], [-0.6, 0, 0.1]), P(cyl(0.2, 0.34, 3.4, 5), '#ffb347', [c.W / 2 - 1.2, 2.8, -7.6], [-0.6, 0, -0.25])); } },
  { name: 'Sternwarte', sky: '#0f1433', outer: '#232a5c', hemi: ['#dfe6ff', '#4a54a0', 2.2], sun: ['#eef0ff', 2.3], water: ['#b3c8ff', 0.22], wall: ['#3a4270', '#9fa8d8'], bridge: ['#c9cfdc', '#5a628a', '#8088b0', '#f5c542'], rune: ['#4a5288', '#fff6d8'],
    motes: { kind: 'star', color: '#ffffff', size: 0.16, n: 90, opacity: 0.95 },
    prop(c, x, z, k, i) { if (i % 5 === 0) { const [px, pz] = away(c, x, z, 2.2); pillar(c.st, px, pz, k * 0.8, '#c9cfdc', '#9fa8d8'); c.gl.push(P(sph(0.22 * k), '#fff6d8', [px, 2.2 * k, pz])); } else if (i % 5 === 1) lantern(c.st, c.gl, x, z, k, '#fff6d8'); else round(c.st, x, z, k, i % 2 ? '#2f3f8a' : '#3a4aa0', '#4a5cc0', '#2a2f55'); },
    mark(c) { dome(c.st, c.gl, -4.2, -4.5, 1.5); dome(c.st, c.gl, c.W + 4.2, -5, 1.3); c.gl.push(P(torus(1.5, 0.22, PI * 1.25), '#fff6d8', [c.W / 2, 3.2, -9.5], [0, 0, 0.9])); } },
  { name: 'Runenthron', sky: '#1c1233', outer: '#3a2a5c', hemi: ['#f0e6ff', '#6a4fa0', 2.2], sun: ['#f6e9ff', 2.4], water: ['#d9b8ff', 0.24], wall: ['#4a3f6a', '#a89fd0'], bridge: ['#a89fd0', '#4a3f6a', '#6a5f90', '#c98bff'], rune: ['#5f5878', '#c98bff'],
    motes: { kind: 'mote', color: '#c98bff', size: 0.15, n: 50, opacity: 0.9 },
    prop(c, x, z, k, i) { const [px, pz] = away(c, x, z, 2.2); if (i % 4 === 0) menhir(c.st, c.gl, px, pz, k * 1.3, '#c98bff'); else if (i % 4 === 1) pillar(c.st, px, pz, k * 0.85, '#8f86a8', '#c9bfe6'); else pine(c.st, x, z, k, i % 2 ? '#5a3f8a' : '#6a4a9c', '#7a5ab8', '#2f2540'); },
    mark(c) { arch(c.st, c.W / 2, -6.5, 1.4, '#8f86a8', '#c9bfe6'); c.gl.push(P(octa(0.9), '#c98bff', [c.W / 2, 2.2, -6.5], [0, 0, 0], [1, 1.8, 1]), P(octa(0.5), '#ffffff', [c.W / 2, 2.2, -6.5], [0, PI / 4, 0], [1, 2.2, 1])); } },
  { name: 'Frostzinnen', sky: '#9fc4dc', outer: '#c4dbe8', hemi: ['#ffffff', '#b8d4e6', 2.05], sun: ['#fffaf0', 2.2], water: ['#ffffff', 0.34], wall: ['#8fb0c4', '#e6f4fc'], bridge: ['#cfe6f2', '#8fb0c4', '#a8cfe0', '#ffffff'], rune: ['#9fc4d8', '#ffffff'],
    motes: { kind: 'snow', color: '#ffffff', size: 0.14, n: 110, opacity: 0.95 },
    prop(c, x, z, k, i) { if (i % 4 === 0) spike(c.st, x, z, k * 1.2, '#bfe6ff', '#e6f7ff'); else if (i % 4 === 1) mound(c.st, x, z, k * 1.3, '#ffffff'); else pine(c.st, x, z, k, '#3f7a6a', '#f4fbff', '#5d4a3a'); },
    mark(c) { c.st.push(P(cone(4.5, 7, 5), '#bfe6ff', [c.W / 2 - 5, 2.6, -8.5], [0, 0.4, 0]), P(cone(3.2, 5.5, 5), '#e6f7ff', [c.W / 2 + 3, 2.0, -9], [0, 1.0, 0]), P(cone(2.4, 4, 5), '#bfe6ff', [c.W / 2 + 8, 1.2, -7], [0, 0.2, 0])); } },
  { name: 'Schattenmoor', sky: '#141c18', outer: '#2f3f33', hemi: ['#cfe6d0', '#3f5a44', 1.9], sun: ['#dff0d8', 2.0], water: ['#9be564', 0.2], wall: ['#3a463c', '#7f8f7a'], bridge: WOOD_BRIDGE, rune: ['#4a5a4c', '#9be564'],
    motes: { kind: 'wisp', color: '#b8f08a', size: 0.22, n: 34, opacity: 0.9 },
    prop(c, x, z, k, i) { if (i % 5 === 0) pool(c.st, c.gl, x, z, k * 1.1, '#4f7a3a', '#26302a'); else if (i % 5 === 1) lantern(c.st, c.gl, x, z, k * 0.8, '#b8f08a'); else if (i % 5 === 2) reed(c.st, x, z, k); else dead(c.st, x, z, k * 1.2, i % 2 ? '#3a342c' : '#4a4036'); },
    mark(c) { for (const [x, z] of [[-2.2, 5], [c.W + 2.2, 10], [-2.3, 22], [c.W + 2.4, 26]]) lantern(c.st, c.gl, x, z, 1, '#b8f08a'); } },
  { name: 'Donnerschlucht', sky: '#3a2a22', outer: '#a8763e', hemi: ['#fff0dc', '#a8763e', 2.2], sun: ['#ffe0b0', 2.7], water: ['#cfe9ff', 0.16], wall: ['#7a5230', '#c9a064'], bridge: WOOD_BRIDGE, rune: ['#8a6038', '#fff27a'], storm: true,
    prop(c, x, z, k, i) { const [px, pz] = away(c, x, z, 2.8); if (i % 3 === 0) mesa(c.st, px, pz, k * 1.2, '#a8643a', '#c98452'); else if (i % 3 === 1) stone(c.st, x, z, k * 1.2, '#b8703f', c.r()); else { c.st.push(P(cyl(0.03, 0.05, 2.6 * k, 5), '#8d949f', [x, 1.0 * k, z])); c.gl.push(P(octa(0.12), '#fff27a', [x, 2.4 * k, z])); stone(c.st, x, z, k * 0.5, '#c98452', c.r()); } },
    mark(c) { arch(c.st, c.W / 2, -7, 1.9, '#a8643a', '#c98452'); mesa(c.st, -5, -4, 2.4, '#a8643a', '#c98452'); mesa(c.st, c.W + 5, -5, 2.2, '#b8703f', '#d99a62'); } },
  { name: 'Kristallgrotte', sky: '#081c22', outer: '#1f4852', hemi: ['#c8fff6', '#2f6470', 2.0], sun: ['#dffffa', 2.2], water: ['#8fffe6', 0.26], wall: ['#2a4a55', '#6fa8b0'], bridge: ['#6fa8b0', '#1f4852', '#3a6470', '#8fffe6'], rune: ['#2a4a55', '#ffb3f0'],
    motes: { kind: 'mote', color: '#8fffe6', size: 0.14, n: 60, opacity: 0.9 },
    prop(c, x, z, k, i) { if (i % 3 === 0) crystal(c.st, c.gl, x, z, k * 1.3, '#59e0d0'); else if (i % 3 === 1) crystal(c.st, c.gl, x, z, k, '#ff9be6'); else spike(c.st, x, z, k, '#2a4a55', '#3a6470'); },
    mark(c) { crystal(c.st, c.gl, c.W / 2, -6.5, 3.6, '#59e0d0'); crystal(c.st, c.gl, -4, -4, 2.2, '#ff9be6'); crystal(c.st, c.gl, c.W + 4, -5, 2.4, '#b3c8ff'); } },
  { name: 'Aschenfeld', sky: '#2a2826', outer: '#5a5450', hemi: ['#e6e0d8', '#6a625c', 2.0], sun: ['#ffd9b0', 2.3], water: ['#b8c0c8', 0.18], wall: ['#3f3a36', '#8a847e'], bridge: ['#7a746e', '#2f2a26', '#4a4540', '#ff8a2a'], rune: ['#4a4540', '#ff8a2a'],
    motes: { kind: 'ash', color: '#cfc8c0', size: 0.12, n: 80, opacity: 0.8 },
    prop(c, x, z, k, i) { if (i % 4 === 0) stump(c.st, c.gl, x, z, k * 1.4); else if (i % 4 === 1) stone(c.st, x, z, k, '#3f3a36', c.r()); else if (i % 4 === 2) dead(c.st, x, z, k * 1.2, '#221f1c'); else mound(c.st, x, z, k * 1.2, '#6a645e'); },
    mark(c) { for (const [x, z, k] of [[c.W / 2 - 4, -6, 1.6], [c.W / 2 + 5, -7, 2], [-3.5, -3.5, 1.4]]) { dead(c.st, x, z, k * 1.6, '#221f1c'); c.gl.push(P(sph(0.3 * k), '#ff8a2a', [x + 0.6, -0.15, z + 0.5], [0, 0, 0], [1.5, 0.4, 1])); } } },
  { name: 'Himmelsbrücke', sky: '#8fc4ee', outer: '#9fcdf0', hemi: ['#ffffff', '#cfe6f8', 2.15], sun: ['#fff6d8', 2.3], water: ['#ffffff', 0.4], wall: ['#c9b98a', '#fff3c4'], bridge: ['#fff3c4', '#b98617', '#e6c98a', '#f5c542'], rune: ['#e6d9b0', '#f5c542'], clouds: 7,
    motes: { kind: 'mote', color: '#fff3c4', size: 0.13, n: 40, opacity: 0.85 },
    prop(c, x, z, k, i) { if (i % 3 === 0) cloud(c.st, x, -0.1 + c.r() * 0.7, z, k * 1.5); else if (i % 3 === 1) { const [px, pz] = away(c, x, z, 3); island(c.st, px, 0.4 + c.r() * 1.6, pz, k, '#9fd46a', '#b8a88a'); } else { const [px, pz] = away(c, x, z, 2.2); pillar(c.st, px, pz, k * 0.8, '#fff8e6', '#f5c542'); } },
    mark(c) { arch(c.st, c.W / 2, -6, 1.8, '#fff8e6', '#f5c542'); c.gl.push(P(sph(0.7), '#fff6d8', [c.W / 2, 4.6, -6])); for (let j = 0; j < 9; j++) cloud(c.st, -6 + j * 3.8, -0.5, c.H + 2.5 + (j % 2), 1.6); } },
];
