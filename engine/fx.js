// Effekt-Bausteine: Teilchen (ein Zeichenaufruf für alle), Bodenringe und -scheiben, Brandflecken, Strahlen,
// Trümmer, zeitversetzte Schritte. Rezepte (registry.js) setzen daraus Treffer, Zauber und Einschläge zusammen.
// Farben dürfen heller als Weiß sein (hdr): solche Stellen leuchten in der Nachbearbeitung nach.
import { THREE } from './deps.js';
import { anchor } from './halten.js';

const TAU = Math.PI * 2;
export const CELL = { glow: 0, spark: 1, star: 2, smoke: 3, ring: 4, shard: 5, dust: 6, diamond: 7 };
const MAX = 1800;

function particleAtlas() {
  const S = 64, cv = document.createElement('canvas'); cv.width = S * 4; cv.height = S * 2;
  const c = cv.getContext('2d');
  const at = (i, fn) => { c.save(); c.translate((i % 4) * S + S / 2, Math.floor(i / 4) * S + S / 2); fn(); c.restore(); };
  at(0, () => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64); });
  at(1, () => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 28); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.scale(0.32, 1); c.fillStyle = g; c.fillRect(-90, -32, 180, 64); });
  at(2, () => { c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, r = i % 2 ? 6 : 29; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); const g = c.createRadialGradient(0, 0, 0, 0, 0, 20); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64); });
  at(3, () => { for (const [x, y, r] of [[0, 2, 19], [-10, -6, 13], [11, -5, 14], [-4, 10, 12], [9, 9, 11], [0, -12, 11]]) { const g = c.createRadialGradient(x, y, r * 0.2, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.7, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); } });
  at(4, () => { c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 25, 0, TAU); c.stroke(); });
  at(5, () => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-18, 16); c.lineTo(20, 10); c.lineTo(2, -22); c.closePath(); c.fill(); });
  at(6, () => { const g = c.createRadialGradient(0, 0, 4, 0, 0, 29); g.addColorStop(0, 'rgba(255,255,255,.75)'); g.addColorStop(0.6, 'rgba(255,255,255,.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64); });
  at(7, () => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -26); c.lineTo(15, 0); c.lineTo(0, 26); c.lineTo(-15, 0); c.closePath(); c.fill(); });
  const t = new THREE.CanvasTexture(cv); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

const tmp = new THREE.Color();
// Farbe als linearer Dreier, mal Helligkeit (hdr > 1 leuchtet)
export function rgb(hex, hdr = 1) { tmp.set(hex); return [tmp.r * hdr, tmp.g * hdr, tmp.b * hdr]; }
const rand = (a, b) => a + Math.random() * (b - a);
const pick = v => (Array.isArray(v) ? rand(v[0], v[1]) : v);

export function createFx(look) {
  const { world } = look;
  // ---- Teilchen ----
  const P = { n: 0, x: new Float32Array(MAX * 3), v: new Float32Array(MAX * 3), age: new Float32Array(MAX), life: new Float32Array(MAX), s0: new Float32Array(MAX), s1: new Float32Array(MAX),
    rot: new Float32Array(MAX), vr: new Float32Array(MAX), c0: new Float32Array(MAX * 3), c1: new Float32Array(MAX * 3), al: new Float32Array(MAX), add: new Float32Array(MAX), cell: new Float32Array(MAX),
    g: new Float32Array(MAX), drag: new Float32Array(MAX), fade: new Float32Array(MAX), floor: new Float32Array(MAX) };
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3), iSR = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4), iCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
  for (const a of [iPos, iSR, iCol]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos); geo.setAttribute('iSR', iSR); geo.setAttribute('iCol', iCol);
  geo.instanceCount = 0;
  const pMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: particleAtlas() } },
    vertexShader: `attribute vec3 iPos; attribute vec4 iSR; attribute vec4 iCol; varying vec2 vUv; varying vec4 vCol; varying float vAdd;
      void main(){ float cell = floor(iSR.z); vAdd = fract(iSR.z) * 2.0; vCol = iCol;
        vUv = (uv + vec2(mod(cell, 4.0), 1.0 - floor(cell / 4.0))) / vec2(4.0, 2.0);
        float c = cos(iSR.y), s = sin(iSR.y); vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSR.x;
        vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += p; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol; varying float vAdd;
      void main(){ float a = texture2D(map, vUv).a * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * a, a * (1.0 - vAdd)); }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false,
  });
  const pMesh = new THREE.Mesh(geo, pMat); pMesh.frustumCulled = false; pMesh.renderOrder = 6000; world.add(pMesh);

  // o: { x, y, z, n, cell, add (0..1), color, color2, hdr, alpha, size, size2 (Endgröße), life, speed, up, spread (Startkreis), gravity, drag, spin, fade, dir: [x,y,z] + cone, floor }
  function burst(o) {
    const n = o.n || 1, c0 = rgb(o.color || '#ffffff', o.hdr || 1), c1 = o.color2 ? rgb(o.color2, o.hdr2 || o.hdr || 1) : c0;
    for (let k = 0; k < n && P.n < MAX; k++) {
      const i = P.n++, a = Math.random() * TAU, sp = pick(o.speed || 0), r = Math.sqrt(Math.random()) * (o.spread || 0);
      let dx = Math.cos(a), dz = Math.sin(a), dy = 0;
      if (o.dir) { const cone = o.cone ?? 0.3; dx = o.dir[0] + (Math.random() - 0.5) * cone; dy = o.dir[1] + (Math.random() - 0.5) * cone; dz = o.dir[2] + (Math.random() - 0.5) * cone; }
      P.x[i * 3] = o.x + Math.cos(a) * r; P.x[i * 3 + 1] = (o.y || 0) + (o.jitterY ? Math.random() * o.jitterY : 0); P.x[i * 3 + 2] = o.z + Math.sin(a) * r;
      P.v[i * 3] = dx * sp; P.v[i * 3 + 1] = dy * sp + pick(o.up || 0); P.v[i * 3 + 2] = dz * sp;
      P.age[i] = 0; P.life[i] = pick(o.life || 0.5); P.s0[i] = pick(o.size || 0.2); P.s1[i] = o.size2 != null ? pick(o.size2) : P.s0[i] * 0.2;
      P.rot[i] = o.rot != null ? o.rot : Math.random() * TAU; P.vr[i] = pick(o.spin || 0) * (Math.random() < 0.5 ? -1 : 1);
      P.c0.set(c0, i * 3); P.c1.set(c1, i * 3); P.al[i] = o.alpha ?? 1; P.add[i] = o.add ?? 1; P.cell[i] = o.cell ?? 0;
      P.g[i] = o.gravity || 0; P.drag[i] = o.drag || 0; P.fade[i] = o.fade || 1; P.floor[i] = o.floor ? 1 : 0;
    }
  }
  function stepParticles(dt) {
    let i = 0;
    while (i < P.n) {
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) {   // letztes Teilchen an diese Stelle holen
        const j = --P.n;
        if (i !== j) { for (const k of ['x', 'v', 'c0', 'c1']) P[k].copyWithin(i * 3, j * 3, j * 3 + 3); for (const k of ['age', 'life', 's0', 's1', 'rot', 'vr', 'al', 'add', 'cell', 'g', 'drag', 'fade', 'floor']) P[k][i] = P[k][j]; }
        continue;
      }
      const d = Math.exp(-P.drag[i] * dt);
      P.v[i * 3] *= d; P.v[i * 3 + 1] = P.v[i * 3 + 1] * d + P.g[i] * dt; P.v[i * 3 + 2] *= d;
      P.x[i * 3] += P.v[i * 3] * dt; P.x[i * 3 + 1] += P.v[i * 3 + 1] * dt; P.x[i * 3 + 2] += P.v[i * 3 + 2] * dt;
      if (P.floor[i] && P.x[i * 3 + 1] < 0.05) { P.x[i * 3 + 1] = 0.05; P.v[i * 3 + 1] *= -0.4; P.v[i * 3] *= 0.6; P.v[i * 3 + 2] *= 0.6; }
      P.rot[i] += P.vr[i] * dt;
      const t = P.age[i] / P.life[i], a = P.al[i] * Math.pow(1 - t, P.fade[i]) * Math.min(1, t * 14);
      iPos.array[i * 3] = P.x[i * 3]; iPos.array[i * 3 + 1] = P.x[i * 3 + 1]; iPos.array[i * 3 + 2] = P.x[i * 3 + 2];
      iSR.array[i * 4] = P.s0[i] + (P.s1[i] - P.s0[i]) * t; iSR.array[i * 4 + 1] = P.rot[i]; iSR.array[i * 4 + 2] = P.cell[i] + Math.min(0.499, P.add[i] * 0.499);
      iCol.array[i * 4] = P.c0[i * 3] + (P.c1[i * 3] - P.c0[i * 3]) * t; iCol.array[i * 4 + 1] = P.c0[i * 3 + 1] + (P.c1[i * 3 + 1] - P.c0[i * 3 + 1]) * t; iCol.array[i * 4 + 2] = P.c0[i * 3 + 2] + (P.c1[i * 3 + 2] - P.c0[i * 3 + 2]) * t; iCol.array[i * 4 + 3] = a;
      i++;
    }
    geo.instanceCount = P.n; iPos.needsUpdate = iSR.needsUpdate = iCol.needsUpdate = true;
  }

  // ---- Bodenringe und -scheiben (flach auf dem Boden, leuchtend) ----
  const flatGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Vector3(1, 1, 1) }, uA: { value: 1 }, uW: { value: 0.12 }, uFill: { value: 0 }, uDash: { value: 0 }, uSpin: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform float uA, uW, uFill, uDash, uSpin; varying vec2 vP;
      void main(){ float d = length(vP); if (d > 1.0) discard;
        float ring = smoothstep(1.0 - uW, 1.0 - uW * 0.6, d) * (1.0 - smoothstep(0.96, 1.0, d));
        if (uDash > 0.5) { float a = atan(vP.y, vP.x) + uSpin; ring *= smoothstep(0.35, 0.5, abs(fract(a * uDash / 6.2832) - 0.5) * 2.0 + 0.2); }
        float a = max(ring, uFill * (0.35 + 0.65 * d * d) * (1.0 - smoothstep(0.96, 1.0, d))) * uA;
        gl_FragColor = vec4(uCol * a, 0.0); }`,
    transparent: true, premultipliedAlpha: true, depthWrite: false,
  });
  anchor(world, flatGeo, ringMat);   // der Ring-Shader bleibt übersetzt (engine/halten.js)
  const live = [];     // laufende Effekte: { t, d, update(k, dt), end() }
  const flats = [];
  function flat(o) {
    const m = new THREE.Mesh(flatGeo, ringMat.clone()); m.frustumCulled = false; m.renderOrder = 20;
    m.position.set(o.x, o.y ?? 0.04, o.z); world.add(m); flats.push(m);
    return m;
  }
  const drop = m => { world.remove(m); m.material.dispose(); const i = flats.indexOf(m); if (i >= 0) flats.splice(i, 1); };
  // Ring, der sich ausbreitet und verblasst
  function ring(o) {
    const m = flat(o), u = m.material.uniforms, c = rgb(o.color || '#ffffff', o.hdr || 1.5);
    u.uCol.value.set(c[0], c[1], c[2]); u.uW.value = o.width ?? 0.14;
    const r0 = o.r0 ?? 0.2, r1 = o.r ?? 1;
    live.push({ t: -(o.delay || 0), d: o.dur || 0.4, update(k) { const e = 1 - (1 - k) * (1 - k); const r = r0 + (r1 - r0) * e; m.scale.set(r, 1, r); u.uA.value = (o.alpha ?? 1) * (1 - k) * (k < 0 ? 0 : 1); m.visible = k >= 0; }, end() { drop(m); } });
  }
  // Scheibe mit gestricheltem, kreisendem Rand: kündigt einen Zauber an (bleibt dur Sekunden, zieht sich dabei zusammen)
  function zone(o) {
    const m = flat(o), u = m.material.uniforms, c = rgb(o.color || '#ffffff', o.hdr || 1.2);
    u.uCol.value.set(c[0], c[1], c[2]); u.uW.value = 0.07; u.uFill.value = o.fill ?? 0.3; u.uDash.value = o.dash ?? 14;
    m.scale.set(o.r, 1, o.r);
    live.push({ t: 0, d: o.dur || 0.6, update(k, dt, time) { u.uSpin.value = time * 1.6; u.uA.value = Math.min(1, k * 8) * (0.7 + 0.3 * Math.sin(time * 14)); const s = o.r * (1 + 0.06 * (1 - k)); m.scale.set(s, 1, s); }, end() { drop(m); } });
  }
  // Pfütze: farbige Scheibe, die sich kurz ausbreitet und dann langsam verblasst (Tod einer Runenform: violett, eines Helden: gold)
  function puddle(o) {
    const m = flat({ ...o, y: 0.03 }), u = m.material.uniforms, c = rgb(o.color || '#ffffff', o.hdr || 1.15);
    u.uCol.value.set(c[0], c[1], c[2]); u.uW.value = 0.16; u.uFill.value = 0.9; m.renderOrder = 6;
    live.push({ t: 0, d: o.dur || 2.8, update(k) { const g = Math.min(1, k * 10), r = (o.r || 0.9) * (0.3 + 0.7 * (1 - (1 - g) * (1 - g))); m.scale.set(r, 1, r * 0.9); u.uA.value = (o.alpha ?? 0.8) * (k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5); }, end() { drop(m); } });
  }
  // Brandfleck: dunkelt den Boden ab und verblasst langsam
  let scorchTex = null, scorchMat = null;
  function scorchSetup() {
    if (!scorchTex) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 26; i++) { const a = Math.random() * TAU, r = Math.random() * 30, s = 14 + Math.random() * 22; const g = c.createRadialGradient(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 0, 64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s); g.addColorStop(0, 'rgba(40,30,34,.5)'); g.addColorStop(1, 'rgba(40,30,34,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }
      scorchTex = new THREE.CanvasTexture(cv);
    }
    if (!scorchMat) {   // ein Vorbild für alle Brandflecken; sein Shader bleibt übersetzt (engine/halten.js)
      scorchMat = new THREE.ShaderMaterial({ uniforms: { map: { value: scorchTex }, uK: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D map; uniform float uK; varying vec2 vUv; void main(){ vec3 c = texture2D(map, vUv).rgb; gl_FragColor = vec4(mix(vec3(1.0), c, uK), 1.0); }',
        transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
      anchor(world, flatGeo, scorchMat);
    }
  }
  scorchSetup();   // gleich beim Start: der Shader ist übersetzt, bevor der erste Fleck entsteht
  function decal(o) {
    const mat = scorchMat.clone(); mat.uniforms.map.value = scorchTex;
    const m = new THREE.Mesh(flatGeo, mat); m.position.set(o.x, 0.02, o.z); m.scale.set(o.r, 1, o.r); m.rotation.y = Math.random() * TAU; m.renderOrder = 3; world.add(m);
    live.push({ t: 0, d: o.dur || 6, update(k) { mat.uniforms.uK.value = (o.strength ?? 0.8) * (1 - k * k); }, end() { world.remove(m); mat.dispose(); } });
  }
  // Strahl zwischen zwei Punkten (leuchtender Streifen, verblasst)
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6).rotateX(Math.PI / 2);
  function beam(o) {
    const c = rgb(o.color || '#ffffff', o.hdr || 3), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(beamGeo, mat), a = new THREE.Vector3(...o.from), b = new THREE.Vector3(...o.to);
    m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); const w = o.width || 0.08; m.scale.set(w, w, a.distanceTo(b)); m.renderOrder = 5500; world.add(m);
    live.push({ t: 0, d: o.dur || 0.25, update(k) { mat.opacity = 1 - k; const s = w * (1 - k * 0.6); m.scale.x = m.scale.y = s; }, end() { world.remove(m); mat.dispose(); } });
  }
  // Trümmer: kantige Brocken, die im Bogen davonfliegen und liegen bleiben, bis sie verblassen
  const chunkGeo = new THREE.IcosahedronGeometry(1, 0);
  function debris(o) {
    const mat = new THREE.MeshLambertMaterial({ color: o.color || '#9aa1ad', flatShading: true });
    for (let i = 0; i < (o.n || 8); i++) {
      const m = new THREE.Mesh(chunkGeo, mat), a = Math.random() * TAU, sp = rand(1.5, 4.5) * (o.power || 1), s = rand(0.08, 0.24) * (o.size || 1);
      m.position.set(o.x, rand(0.6, 2.2), o.z); m.scale.setScalar(s); m.castShadow = true; world.add(m);
      const v = [Math.cos(a) * sp, rand(4, 8.5), Math.sin(a) * sp], spin = [rand(-9, 9), rand(-9, 9)];
      live.push({ t: 0, d: rand(1.6, 2.6), update(k, dt) {
        if (m.position.y > s * 0.6 || v[1] > 0) { v[1] -= 22 * dt; m.position.x += v[0] * dt; m.position.y += v[1] * dt; m.position.z += v[2] * dt; m.rotation.x += spin[0] * dt; m.rotation.z += spin[1] * dt;
          if (m.position.y < s * 0.6) { m.position.y = s * 0.6; if (v[1] < -3) { v[1] *= -0.35; v[0] *= 0.5; v[2] *= 0.5; } else v[1] = 0; } }
        if (k > 0.75) m.scale.setScalar(s * (1 - (k - 0.75) / 0.25));
      }, end() { world.remove(m); } });
    }
  }
  // Etwas fällt vom Himmel und schlägt nach dur Sekunden ein (o.make liefert das Objekt, o.trail streut Teilchen)
  function fall(o) {
    const m = o.make(); m.renderOrder = 5600; world.add(m);
    const from = o.from, to = o.to;
    live.push({ t: 0, d: o.dur, update(k, dt, time) { const e = o.arc != null ? k : k * k;   // arc: gleichmäßiger Flug im Bogen (Wurf vom Turm) statt beschleunigtem Fall
      m.position.set(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e + (o.arc || 0) * 4 * k * (1 - k), from[2] + (to[2] - from[2]) * e); m.rotation.z += dt * 7; m.rotation.x += dt * 4; if (o.trail) o.trail(m.position, dt); },
      end() { world.remove(m); if (o.done) o.done(); } });
  }
  // Dauerhafte Bodenmarke (Auswahl beim Setzen einer Karte): bleibt, bis sie versteckt wird
  function marker(o = {}) {
    const m = flat({ x: 0, z: 0, y: o.y ?? 0.05 }), u = m.material.uniforms; m.visible = false;
    u.uW.value = o.width ?? 0.1; u.uFill.value = o.fill ?? 0; u.uDash.value = o.dash ?? 0;
    return { mesh: m, set(x, z, r, color, hdr = 1.2, a = 1) { m.visible = true; m.position.x = x; m.position.z = z; m.scale.set(r, 1, r); const c = rgb(color, hdr); u.uCol.value.set(c[0], c[1], c[2]); u.uA.value = a; }, spin(t) { u.uSpin.value = t; }, hide() { m.visible = false; } };
  }
  const after = (delay, fn) => live.push({ t: -delay, d: 0.0001, update() {}, end: fn });

  function update(dt, time) {
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i]; f.t += dt;
      if (f.t >= f.d) { f.update(1, dt, time); f.end(); live.splice(i, 1); } else f.update(f.t < 0 ? -1 : f.t / f.d, dt, time);
    }
    stepParticles(dt);
  }
  function clear() { for (const f of live) f.end(); live.length = 0; P.n = 0; geo.instanceCount = 0; }

  return { burst, ring, zone, puddle, decal, beam, debris, fall, after, marker, update, clear, count: () => P.n, CELL };
}
