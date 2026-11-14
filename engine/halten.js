// Shader festhalten, damit im Kampf nichts neu übersetzt wird.
//
// three.js wirft ein Shader-Programm weg, sobald das letzte Material verschwindet, das es benutzt – und übersetzt es beim
// nächsten Gebrauch neu. Bei kurzlebigen Dingen (Ring unter einem Treffer, Brandfleck, die Figur selbst, sobald gerade keine
// auf dem Feld steht) geschah das gut einmal je Sekunde. Auf dem PC merkt man davon nichts, ein Handy hängt dabei jedes Mal
// einen Augenblick: das Spiel fühlt sich stockend an, obwohl die Bildrate stimmt.
//
//   anchor(world, geo, mat)   ein dauerhaftes, unsichtbares Exemplar (Größe null, nach wenigen Bildern ausgeblendet) für ein eigenes Shader-Material:
//                             three.js zählt dessen Quelltext mit, Kopien (mat.clone()) bekommen dasselbe Programm.
//   pinPrograms(renderer)     nach jedem Bild: jedes vorhandene Programm bekommt einen Benutzer mehr und wird nie verworfen.
//                             Das deckt die eingebauten Materialien ab (Strahl, Geschoss, Trümmer …), die es je Effekt neu gibt.
import { THREE } from './deps.js';

export function anchor(world, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.setScalar(0); m.frustumCulled = false; m.renderOrder = -1; m.userData.anchor = true;
  m.matrixAutoUpdate = false; m.updateMatrix();
  world.add(m);
  anchors.push([m, WARM_FRAMES]);
  return m;
}
// Ein Anker muss nur so lange mitgezeichnet werden, bis sein Programm übersetzt ist; danach hält ihn allein das (nie verworfene)
// Material fest. Jeder gezeichnete Anker kostet sonst einen Zeichenaufruf je Bild – bei rund zwanzig Ankern messbar.
const anchors = [], WARM_FRAMES = 6;

const pinned = new WeakSet();
export function pinPrograms(renderer) {
  const list = renderer.info.programs;
  if (!list) return 0;
  let n = 0;
  for (const p of list) if (!pinned.has(p)) { pinned.add(p); p.usedTimes++; n++; }
  for (let i = anchors.length - 1; i >= 0; i--) if (--anchors[i][1] <= 0) { anchors[i][0].visible = false; anchors.splice(i, 1); }
  return n;
}

// Die eingebauten Materialien, die es im Kampf je Effekt neu gibt (Geschoss, Strahl, Trümmer, Zauberkörper …), einmal in jeder
// vorkommenden Spielart anlegen: ihre Programme sind dann übersetzt, bevor der Kampf beginnt. Was hier fehlt, übersetzt
// three.js beim ersten Auftreten einmal und pinPrograms hält es danach fest (tools/gefuehl.mjs zeigt, was noch nachkommt).
export function warmBuiltins(world) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
  const gc = g.clone(); gc.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  const B = THREE.MeshBasicMaterial, L = THREE.MeshLambertMaterial, T = { transparent: true, depthWrite: false };
  const list = [
    [g, new B()], [g, new B(T)], [g, new B({ ...T, side: THREE.DoubleSide })], [g, new B({ side: THREE.DoubleSide })], [g, new B({ side: THREE.BackSide })], [g, new B({ ...T, side: THREE.BackSide })],
    [gc, new B({ vertexColors: true })], [gc, new B({ vertexColors: true, ...T })],
    [g, new L()], [g, new L({ flatShading: true })], [g, new L(T)], [g, new L({ flatShading: true, ...T })], [gc, new L({ vertexColors: true })], [gc, new L({ vertexColors: true, ...T })],
  ];
  for (const [geo, mat] of list) { const m = anchor(world, geo, mat); m.castShadow = true; }   // castShadow: auch das Programm für den Schattenwurf
}
