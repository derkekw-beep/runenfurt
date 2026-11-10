// 2D-Figuren: lädt die in Blender gerenderten Bildfolgen und zeigt sie als Tafeln, die zur Kamera stehen.
// Teamfarbe kommt aus einer Maske (ein Sammelbild für beide Seiten), der Schatten ist dasselbe Bild flach auf den
// Boden gelegt. Die Bewegung folgt allein dem Zustand der Spielregeln (laufen, ausholen, zuschlagen, stehen).
import { THREE, TEAM, ASSETS, RIVER_TOP, RIVER_BOT } from './deps.js';
import { PITCH, SUN } from './look.js';

const TAU = Math.PI * 2;
const BAKE_EL = 38 * Math.PI / 180;      // Blickwinkel, unter dem die Bilder gerendert wurden (tools/blender/rf_kit.py)
export const SCALE = 0.8;                 // Größe der Figuren im Feld: ein Schläger ist damit rund anderthalb Felder hoch
const BIAS = 0.3;                         // Tafel für die Tiefe ein Stück zur Kamera rücken: steht sicher vor Nachbarn
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Wer neben oder vor einem Turm steht, wird ganz vor ihm gezeichnet (auch der ausgestreckte Arm); nur wer hinter
// ihm steht, wird von ihm verdeckt. BEHIND = ab wie viel Abstand nach hinten eine Figur als "dahinter" gilt.
export const BEHIND = 0.3;
// Liefert den Turm (oder das Gebäude), vor dem die Figur an (x, z) steht – sonst null. occ: [{ x, z, r, h }]
export function frontOf(x, z, occ) {
  let best = null;
  if (occ) for (const o of occ) if (z >= o.z - BEHIND && z < o.z + o.r + 1.8 && Math.abs(x - o.x) < o.r + 1.9 && (!best || o.z + o.r > best.z + best.r)) best = o;
  return best;
}
// Trägt in die Tafel ein, vor welchem Punkt sie liegen muss: der vorderste, höchste Punkt des Turms
export function setFront(u, o) { if (o) u.uFront.value.set(1, o.h + 0.3, o.z + o.r + 0.3); else u.uFront.value.x = 0; }

const defs = new Map(), ready = new Map();
let index = null;
export async function unitIndex() { if (!index) index = await (await fetch(ASSETS + 'units/index.json')).json(); return index; }
export function loadUnit(name) {
  if (!defs.has(name)) defs.set(name, (async () => {
    const info = await (await fetch(`${ASSETS}units/${name}.json`)).json();
    const L = new THREE.TextureLoader();
    const [tex, mask] = await Promise.all([L.loadAsync(`${ASSETS}units/${name}.webp`), L.loadAsync(`${ASSETS}units/${name}_m.webp`)]);
    tex.colorSpace = THREE.SRGBColorSpace;
    for (const t of [tex, mask]) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 2; }
    const [AW, AH] = info.size, k = SCALE / info.ppu;
    info.h *= SCALE; info.stride = (info.stride || 0.85) * SCALE;
    info.rect = info.frames.map(f => [f[0] / AW, 1 - (f[1] + f[3]) / AH, (f[0] + f[2]) / AW, 1 - f[1] / AH]);
    info.quad = info.frames.map(f => [f[4] * k, f[5] * k, (f[4] + f[2]) * k, (f[5] + f[3]) * k]);
    const def = { name, info, tex, mask, h: info.h, kind: 'sprite' };
    ready.set(name, def);
    return def;
  })());
  return defs.get(name);
}
export const getUnit = name => ready.get(name) || null;

// Kleine Kartenbilder aller neuen Figuren (eine Datei je Figur): werden beim Start geladen, die großen Bildfolgen
// dagegen erst für die Karten eines Kampfs (loadUnit) – und danach wieder freigegeben (releaseUnits).
const ports = new Map();
export function loadPortraits(names) {
  return Promise.all(names.map(n => new Promise(res => { const im = new Image(); im.onload = () => { ports.set(n, im); res(); }; im.onerror = () => res(); im.src = `${ASSETS}units/${n}_k.webp`; })));
}
export const hasPortrait = name => ports.has(name);
// Bild für Karten und Menüs: n Figuren nebeneinander, mit hellem Schein (dunkle Figuren heben sich vom Kartengrund ab)
// name: ein Modell oder eine Liste von Modellen (gemischte Karte: das erste steht vorn)
export function portrait(name, w, h, n = 1) {
  const figs = (Array.isArray(name) ? name : [name]).map(x => ports.get(x)); if (!figs.length || figs.some(f => !f)) return null;
  const fig = figs.reduce((a, b) => (b.height > a.height ? b : a));
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const c = out.getContext('2d'); c.imageSmoothingQuality = 'high';
  const s = Math.min(h * 0.7 / fig.height, w * 0.84 / fig.width) * (n > 2 ? 0.62 : n > 1 ? 0.74 : 1), fw = fig.width * s, fh = fig.height * s;
  const spots = n === 1 ? [[0, 0]] : n === 2 ? [[-0.2, -0.04], [0.2, 0.03]] : n === 3 ? [[0, -0.1], [-0.22, 0.04], [0.22, 0.05]] : n === 4 ? [[-0.2, -0.1], [0.2, -0.09], [-0.22, 0.05], [0.21, 0.06]] : [[-0.28, -0.1], [0, -0.12], [0.28, -0.09], [-0.16, 0.05], [0.17, 0.06]];
  c.shadowColor = 'rgba(210,235,255,.5)'; c.shadowBlur = Math.max(4, w * 0.045);
  spots.forEach(([x, y], k) => { const im = figs[(spots.length - 1 - k) % figs.length], iw = im.width * s, ih = im.height * s; c.drawImage(im, w / 2 + x * w - iw / 2, h * 0.84 + y * h - ih, iw, ih); });   // hinten zuerst
  return out;
}
// Bildfolgen freigeben, die im nächsten Kampf nicht vorkommen (keep: Menge der Namen, die bleiben)
export function releaseUnits(keep) {
  for (const [name, def] of ready) if (!keep.has(name)) { def.tex.dispose(); def.mask.dispose(); ready.delete(name); defs.delete(name); }
}

const VERT = `
  uniform vec4 uQuad; uniform vec4 uRect; uniform vec2 uScale; uniform vec2 uTrig; uniform float uBias; uniform vec3 uFront;
  varying vec2 vUv;
  void main() {
    float ty = position.y < 0.5 ? uQuad.y : position.y < 1.5 ? clamp(0.0, uQuad.y, uQuad.w) : uQuad.w;
    float tx = mix(uQuad.x, uQuad.z, position.x);
    vUv = vec2(mix(uRect.x, uRect.z, position.x), mix(uRect.y, uRect.w, (ty - uQuad.y) / (uQuad.w - uQuad.y)));
    vec4 foot = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec2 off = vec2(tx * uScale.x, ty * uScale.y);
    vec4 clip = projectionMatrix * (foot + vec4(off, 0.0, 0.0));
    // Tiefe: über der Standlinie wie eine aufrecht stehende Tafel, darunter flach auf dem Boden (nach vorn auslaufend)
    vec3 w = off.y >= 0.0 ? vec3(0.0, off.y * uTrig.x, uBias) : vec3(0.0, 0.03, -off.y * uTrig.y + uBias);
    vec4 virt = projectionMatrix * (foot + viewMatrix * vec4(w, 0.0));
    float zn = virt.z / virt.w;
    if (uFront.x > 0.5) { vec4 fr = projectionMatrix * viewMatrix * vec4(modelMatrix[3].x, uFront.y, uFront.z, 1.0); zn = min(zn, fr.z / fr.w); }   // steht vor einem Turm: ganz davor
    clip.z = zn * clip.w;
    gl_Position = clip;
  }`;
const FRAG = `
  uniform sampler2D map; uniform sampler2D mask; uniform vec3 uMain; uniform vec3 uDark; uniform vec3 uTint;
  uniform float uFlash; uniform float uAlpha; uniform float uGlow; uniform float uSolid; uniform float uFrost;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    if (uSolid > 0.5) { if (c.a < 0.5) discard; gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }   // nur für die Verdeckungsprüfung
    if (c.a < 0.004) discard;
    vec3 m = texture2D(mask, vUv).rgb;
    vec3 col = c.rgb, k = c.rgb / 0.693;                      // Teamflächen sind neutral grau gerendert: Helligkeit mal Teamfarbe
    col = mix(col, k * uMain, m.r); col = mix(col, k * uDark, m.g);
    col *= uTint;
    col += col * m.b * uGlow;
    col = mix(col, vec3(0.72, 0.9, 1.15) * (0.4 + dot(col, vec3(0.5))), uFrost * 0.6);
    col = mix(col, vec3(1.0), uFlash);
    float a = c.a * uAlpha;
    gl_FragColor = vec4(col * a, a);
  }`;
const SH_VERT = `
  uniform vec4 uQuad; uniform vec4 uRect; uniform vec2 uScale; uniform vec3 uSh;
  varying vec2 vUv;
  void main() {
    float tx = mix(uQuad.x, uQuad.z, position.x) * uScale.x, ty = mix(uQuad.y, uQuad.w, position.y) * uScale.y;
    vUv = vec2(mix(uRect.x, uRect.z, position.x), mix(uRect.y, uRect.w, position.y));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(vec3(tx, 0.0, 0.0) + uSh * ty, 1.0);
  }`;
const SH_FRAG = `
  uniform sampler2D map; uniform vec3 uCol; uniform float uStrength; varying vec2 vUv;
  void main() { float a = texture2D(map, vUv, 1.7).a * uStrength; gl_FragColor = vec4(mix(vec3(1.0), uCol, a), 1.0); }`;

export function createSprites(look, hooks = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 2, 0, 1, 2, 0], 3));
  geo.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5]);
  const shGeo = new THREE.BufferGeometry();
  shGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3));
  shGeo.setIndex([0, 1, 2, 2, 1, 3]);
  const baseMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, mask: { value: null }, uQuad: { value: new THREE.Vector4() }, uRect: { value: new THREE.Vector4() }, uScale: { value: new THREE.Vector2(1, 1) },
      uTrig: { value: new THREE.Vector2(1 / Math.cos(PITCH), 1 / Math.sin(PITCH)) }, uBias: { value: BIAS }, uFront: { value: new THREE.Vector3() }, uMain: { value: new THREE.Color() }, uDark: { value: new THREE.Color() },
      uTint: { value: new THREE.Color(1, 1, 1) }, uFlash: { value: 0 }, uAlpha: { value: 1 }, uGlow: { value: 1.5 }, uSolid: { value: 0 }, uFrost: { value: 0 } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.DoubleSide,
  });
  // Schatten: so lang, wie die Sonne ihn wirft; die Bildhöhe wird dafür in echte Höhe umgerechnet
  const sh = new THREE.Vector3(-SUN.x / SUN.y, 0, -SUN.z / SUN.y).multiplyScalar(0.9 / Math.cos(BAKE_EL));
  const shMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, uQuad: { value: new THREE.Vector4() }, uRect: { value: new THREE.Vector4() }, uScale: { value: new THREE.Vector2(1, 1) }, uSh: { value: sh },
      uCol: { value: new THREE.Vector3(0.5, 0.53, 0.62) }, uStrength: { value: 0.95 } },
    vertexShader: SH_VERT, fragmentShader: SH_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });

  function make(def, side, id = 0) {
    const mat = baseMat.clone(), sm = shMat.clone();
    mat.uniforms.map.value = def.tex; mat.uniforms.mask.value = def.mask; sm.uniforms.map.value = def.tex;
    mat.uniforms.uMain.value.set(TEAM[side].main); mat.uniforms.uDark.value.set(TEAM[side].dark);
    const mesh = new THREE.Mesh(geo, mat), shadow = new THREE.Mesh(shGeo, sm);
    mesh.frustumCulled = false; shadow.frustumCulled = false; shadow.renderOrder = 5;
    look.world.add(shadow, mesh);
    const inst = { neu: true, sprite: true, model: def.name, scale: 1, status: null, statusKey: '', extras: [], def, mesh, shadow, u: mat.uniforms, su: sm.uniforms, side, yaw: side === 0 ? Math.PI : 0, dir: side === 0 ? def.info.dirs / 2 : 0,
      phase: (id * 0.37) % 1, idle: (id * 0.61) % 1, age: 0, hp: null, flash: 0, sq: 0, sqv: 0, kx: 0, kz: 0, lunge: 0, px: null, pz: 0, landed: false, wasStrike: false, h: def.info.h, frame: -1 };
    setFrame(inst, 0);
    return inst;
  }

  function setFrame(inst, i) {
    if (i === inst.frame) return;
    inst.frame = i;
    const info = inst.def.info, r = info.rect[i], q = info.quad[i];
    inst.u.uRect.value.set(r[0], r[1], r[2], r[3]); inst.u.uQuad.value.set(q[0], q[1], q[2], q[3]);
    inst.su.uRect.value.copy(inst.u.uRect.value); inst.su.uQuad.value.copy(inst.u.uQuad.value);
  }

  const frameOf = (info, dir, anim, f) => dir * info.per + info.anims[anim].start + f;

  // e: Einheit aus den Spielregeln (mit e._x, e._y = geglättete Lage). Setzt Bild, Lage, Stauchung, Aufblitzen.
  function update(e, inst, g, dt, time, occ) {
    const info = inst.def.info, A = info.anims, u = inst.u;
    inst.age += dt;
    const t = e.targetId ? g.byId.get(e.targetId) : null;
    const moving = e.kind === 'unit' && !e.inRange && e.deployT <= 0 && e.rootT <= 0 && !(e.stunT > 0);
    let want = inst.yaw;
    if (t && (e.inRange || !moving)) want = Math.atan2(t.x - e.x, t.y - e.y);
    else if (moving && (e.vx || e.vy)) want = Math.atan2(e.vx, e.vy);
    inst.yaw += wrap(want - inst.yaw) * Math.min(1, dt * 12);
    const step = TAU / info.dirs;
    if (Math.abs(wrap(inst.yaw - inst.dir * step)) > step * 0.62) inst.dir = ((Math.round(inst.yaw / step) % info.dirs) + info.dirs) % info.dirs;

    const s = Math.max(0, e.anim || 0) / 0.3;
    const wind = e.inRange && e.cd > 0 && e.cd < 0.3 && e.deployT <= 0 && !(e.stunT > 0) ? 1 - e.cd / 0.3 : 0;
    const moved = inst.px === null ? 0 : Math.hypot(e._x - inst.px, e._y - inst.pz);
    inst.px = e._x; inst.pz = e._y;
    let anim = 'idle', f = 0;
    const striking = s > 0 && !(e.stunT > 0);
    if (e.stunT > 0 || e.iceT > 0) { anim = 'idle'; f = 0; }
    else if (striking) { anim = 'strike'; f = Math.min(A.strike.n - 1, Math.floor((1 - s) * A.strike.n)); }
    else if (wind > 0) { anim = 'windup'; f = Math.min(A.windup.n - 1, Math.floor(wind * A.windup.n)); }
    else if (info.flap) { inst.phase += dt * info.flap; anim = moving ? 'walk' : 'idle'; f = Math.floor(inst.phase * A[anim].n) % A[anim].n; }   // Flieger schlagen immer mit den Flügeln
    else if (moving) { inst.phase += moved / info.stride; anim = e.charging && A.run ? 'run' : 'walk'; f = Math.floor(inst.phase * A[anim].n) % A[anim].n; }   // 'run' (wenn vorhanden): Lauf im Ansturm
    else if (e.inRange && info.hold && info.hold !== 'idle') { anim = info.hold; f = 0; }
    else { inst.idle += dt * 1.15; f = Math.floor(inst.idle * A.idle.n) % A.idle.n; }
    // Flussspringer (ford): über dem Wasser ein Sprungbogen – er beginnt kurz vor dem Ufer und endet kurz dahinter
    let hop = 0;
    if (e.ford && !inst.fly) { const k = (e._y - RIVER_TOP + 0.45) / (RIVER_BOT - RIVER_TOP + 0.9); if (k > 0 && k < 1) hop = Math.sin(Math.PI * k) * 1.05; }
    if (hop > 0.03 && moving) { anim = 'walk'; f = Math.floor(A.walk.n / 4); }   // im Sprung: Schrittbild mit weit gespreizten Beinen
    setFrame(inst, frameOf(info, inst.dir, anim, f));
    if (hop > 0.03 && !inst.hopping) { inst.hopping = true; inst.sqv += 3.2; }   // Absprung: streckt sich
    else if (hop <= 0.03 && inst.hopping) { inst.hopping = false; inst.sqv -= 4.5; if (hooks.onLand) hooks.onLand(e, inst); }   // Landung: staucht, Staub

    // Schlag: ein kurzer Ruck zum Ziel (nur Nahkämpfer)
    if (striking && !inst.wasStrike) { inst.lunge = e.range < 2 ? 0.16 : -0.05; inst.sqv += e.range < 2 ? 1.6 : 0.8; if (hooks.onStrike) hooks.onStrike(e, inst); }
    inst.wasStrike = striking;
    inst.lunge *= Math.exp(-dt * 11);
    // Treffer: aufblitzen, stauchen, ein kleiner Stoß weg vom Gegner
    if (inst.hp !== null && e.hp < inst.hp - 0.5) {
      inst.flash = 0.1; inst.sqv -= 2.4;
      const a = inst.yaw + Math.PI; inst.kx += Math.sin(a) * 0.07; inst.kz += Math.cos(a) * 0.07;
    }
    inst.hp = e.hp;
    if (inst.flash > 0) inst.flash -= dt;
    inst.kx *= Math.exp(-dt * 14); inst.kz *= Math.exp(-dt * 14);
    // Aufmarsch: fällt von oben, landet, staucht
    let y = inst.fly ? inst.fly + Math.sin(time * 2.5 + e.id) * 0.08 : 0, sx = 1, sy = 1;
    const drop0 = y;
    const q = Math.min(1, inst.age / 0.26);
    y += hop;
    if (q < 1) { y += (1 - q) * (1 - q) * 5.5; sx = 0.88; sy = 1.14; }
    else if (!inst.landed) { inst.landed = true; if (!inst.fly) { inst.sqv -= 5.2; if (hooks.onLand) hooks.onLand(e, inst); } }
    for (let i = 0; i < 2; i++) { const h = dt / 2; inst.sqv += (-inst.sq * 300 - inst.sqv * 17) * h; inst.sq += inst.sqv * h; }   // Feder: Stauchen und Nachschwingen
    inst.sq = Math.max(-0.4, Math.min(0.4, inst.sq));
    sy *= 1 + inst.sq; sx *= 1 - inst.sq * 0.55;
    if (e.stunT > 0) sx *= 1 + Math.sin(time * 34) * 0.025;
    u.uScale.value.set(sx, sy);
    const lx = Math.sin(inst.yaw) * inst.lunge, lz = Math.cos(inst.yaw) * inst.lunge;
    inst.mesh.position.set(e._x + inst.kx + lx, y, e._y + inst.kz + lz);
    inst.mesh.renderOrder = (inst.fly ? 3000 : 1000) + Math.round((e._y + inst.kz + lz) * 24);
    setFront(u, frontOf(e._x, e._y, occ));
    u.uTint.value.copy(look.lightTint); inst.su.uCol.value.copy(look.shadowTint);
    u.uFlash.value = inst.flash > 0 ? 0.7 * Math.min(1, inst.flash / 0.05) : 0;
    u.uAlpha.value = e.hidden ? 0.42 : 1;
    u.uFrost.value = e.iceT > 0 ? 1 : e.slowT > 0 ? 0.5 : 0;
    // Schatten bleibt am Boden; in der Luft kleiner und blasser
    const air = Math.min(1, (y - drop0 * 0.6) / 5.5 + hop * 0.25);
    inst.shadow.position.set(e._x + inst.kx + lx + y * 0.3, 0.025, e._y + inst.kz + lz - y * 0.22);
    inst.su.uScale.value.set(sx * (1 - air * 0.5), sy * (1 - air * 0.5));
    inst.su.uStrength.value = (e.hidden ? 0.3 : 0.95) * (1 - air * 0.75);
  }

  // Flieger: schwebt in der Höhe h über dem Feld, liegt immer über allem am Boden, Schatten flach darunter
  function setFlier(inst, h) {
    inst.fly = h; inst.mesh.material.depthTest = false;
    inst.su.uSh.value.set(0, 0, -1.15); inst.shadow.renderOrder = 6;
  }
  function remove(inst) { look.world.remove(inst.mesh, inst.shadow); inst.mesh.material.dispose(); inst.shadow.material.dispose(); }

  return { make, update, remove, setFrame, frameOf, setFlier };
}
