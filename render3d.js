// 3D-Darstellung mit three.js. Die Bühne (Licht, Arena, Kamera, Nachbearbeitung), die neuen Figuren aus Blender, die neuen
// Türme und die neuen Effekte kommen aus engine/. Alles, was dort noch nicht neu gebaut ist (übrige Figuren, Helden,
// Gebäude, Geschosse, Effekte), zeichnet diese Datei wie bisher in dieselbe Bühne.
// Gleiche Schnittstelle wie der 2D-Zeichner in render.js (resize, reset, onEvent, draw, toField, snapshot).
import * as THREE from './vendor/three.module.min.js';
import { CARDS, UNITS, RUNES } from './cards.js';
import { W, H, RIVER_TOP, RIVER_BOT, BRIDGES, BRIDGE_HALF, OUTER_Y, MAIN_Y, POCKET, deployPlan, cardCost, outerTower } from './sim.js';
import * as SIM from './sim.js'; // nur für deployTiles: wird benutzt, sobald es das gibt
import { TEAM } from './render.js';
import { getDef, merge, P, box, cyl, cone, sph, rock, FLY, USCALE, STONE, STONE_D, STONE_L, WOOD_D } from './models3d.js';
import { createLook, PITCH } from './engine/look.js';
import { createSprites, loadUnit, getUnit, unitIndex, loadPortraits, hasPortrait, releaseUnits, warmUnits, frontOf, setFront, portrait, SCALE } from './engine/sprites.js';
import { createFx } from './engine/fx.js';
import { createActors } from './engine/actors.js';

const PI = Math.PI;
const BUILDING_ART = ['ballista', 'aussenturm', 'geschuetzturm', 'klingenturm', 'segensturm', 'steinschleuder', 'kesselturm', 'fernschleuder', 'sonnenspiegel', 'kraftquell', 'erdloch', 'raeuberlager', 'kieselhaufen', 'wolfszwinger', 'maulwurfshuegel', 'funkenpfahl', 'kurbelbogen', 'armbrustwagen_w']; // Gebäude und Türme mit eigenem Kartenbild aus Blender (engine/assets/units/<modell>_k.webp)
const RUNE_COLOR = '#c98bff', GOLD = '#f5c542';
const ease = t => 1 - (1 - t) * (1 - t);
const LEAN = -0.3; // Figuren leicht zur Kamera kippen, damit man Gesichter statt Scheitel sieht
// Wie eine menschliche Figur zuschlägt
const STYLE = { raufbold: 'punch', fasstraeger: 'punch', waldlaeufer: 'bow', sternschuetzin: 'bow', weitschuetzin: 'bow', schattenjaegerin: 'bow', bolzenschuetzin: 'xbow', torknacker: 'ram',
  eisenwaechter: 'slash', marschall: 'slash', schildknappe: 'slash', nebelschleicher: 'slash', windlaeufer: 'slash', hammerschmied: 'smash', erzritter: 'smash', wurzelkoenig: 'smash',
  klingentaenzerin: 'spin', brockenwerfer: 'throw', zuendler: 'throw', kegler: 'bowl', trommelschlaeger: 'drum',
  raeuber: 'smash', sturmbruder: 'slash', speerwache: 'ram', muellerbursche: 'smash', steinwerferin: 'throw', wueterich: 'drum', distelritter: 'smash', sichelwerfer: 'throw', splitterjaeger: 'xbow',
  wegelagerin: 'slash', falterhueterin: 'smash', seilwerfer: 'slash', stollenmeister: 'ram', flussmoench: 'punch', jungfuerst: 'xbow', leibwaechterin: 'slash' };

export function createRenderer3D(canvas, overlay) {
  // Bühne der Engine: Zeichner, Licht, Kamera, Arena, Nachbearbeitung
  const look = createLook(canvas, { maxDpr: 3 });
  const { renderer, world, camera } = look;
  const o2 = overlay.getContext('2d');
  const efx = createFx(look), actors = createActors(look, efx);
  const sprites = createSprites(look, { onLand: e => actors.land(e) });
  // Welche Figuren neue Bildfolgen haben, steht in engine/assets/units/index.json. Zu Beginn werden nur ihre kleinen
  // Kartenbilder geladen; die großen Bildfolgen holt prepare() für die Karten des jeweiligen Kampfs.
  const fresh = new Set();
  const ready = Promise.race([
    Promise.allSettled([look.ready, unitIndex().then(list => { for (const n of list) fresh.add(n); setTimeout(() => warmUnits(list), 6000); return loadPortraits([...list, ...BUILDING_ART]); })]),
    new Promise(r => setTimeout(r, 6000)),
  ]);
  const UNIT = SCALE;   // Größe der Figuren im Feld – gilt auch für die bisherigen
  const occ = [];       // Türme und Gebäude dieses Bilds: wer davor steht, wird ganz davor gezeichnet
  let lastG = null;

  const matLit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const matHit = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffffff', emissiveIntensity: 0.7 }); // kurzes Aufblitzen bei Treffern
  const matGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const matDim = new THREE.MeshBasicMaterial({ vertexColors: true, color: '#7d8791' });
  const matGhost = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false }); // Unsichtbare schimmern nur
  const opt = { maxDpr: 3, shadows: true, shake: true, fxRate: 1 };
  // Kontur: dieselbe Form noch einmal, leicht aufgebläht und von innen gezeichnet
  const matLine = new THREE.MeshBasicMaterial({ color: '#141b26', side: THREE.BackSide });
  matLine.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize( normal ) * 0.026;'); };
  // flächige Schattierung in zwei Tönen und dickere Kontur für die 2D-Figuren
  const grad = new THREE.DataTexture(new Uint8Array([165, 255]), 2, 1, THREE.RedFormat); grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const matCel = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: grad });
  const matLineBold = new THREE.MeshBasicMaterial({ color: '#141b26', side: THREE.BackSide });
  matLineBold.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize( normal ) * 0.042;'); };
  let width = 300, height = 400, dpr = 1, arena = -1;

  function resize(w, h, ratio, arenaIdx = 0) {
    look.resize(w, h, ratio);
    ({ width, height, dpr } = look.size());
    overlay.width = Math.round(width * dpr); overlay.height = Math.round(height * dpr);
    overlay.style.width = `${width}px`; overlay.style.height = `${height}px`;
    if (arenaIdx !== arena) { arena = arenaIdx; look.setArena(arena); }
  }

  const v3 = new THREE.Vector3();
  const project = look.project;
  const ray = new THREE.Vector3();
  function toField(cx, cy) {
    const r = canvas.getBoundingClientRect();
    const nx = (cx - r.left) / r.width * 2 - 1, ny = 1 - (cy - r.top) / r.height * 2;
    if (ny < -1.02) return null; // unterhalb des Felds (Kartenleiste)
    v3.set(nx, ny, 0.5).unproject(camera);
    ray.copy(v3).sub(camera.position);
    if (ray.y >= -1e-6) return null;
    const t = -camera.position.y / ray.y;
    const x = camera.position.x + ray.x * t, y = camera.position.z + ray.z * t;
    return x >= -2 && x <= W + 2 && y >= -2 && y <= H + 0.8 ? { x, y } : null;
  }
  // fernes Wetterleuchten (Donnerschlucht): die Bühne meldet den Zeitpunkt, der Blitz kommt von hier
  look.onStorm = x => beam([x, 13, -9 - Math.random() * 3], [x + (Math.random() - 0.5) * 4, 0.2, -4 - Math.random() * 4], '#fffbd0', 0.13, 0.32);

  // -- Figuren --
  const ringGeo = new THREE.RingGeometry(0.86, 1, 40), discGeo = new THREE.CircleGeometry(1, 40), ballGeo = new THREE.SphereGeometry(1, 12, 8);
  const auraGeo = new THREE.RingGeometry(0.72, 1.12, 32), octaGeo = new THREE.OctahedronGeometry(1), beamGeo = new THREE.CylinderGeometry(1, 1, 1, 5).rotateX(PI / 2);
  const flatMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const flat = (geo, color, opacity) => { const m = new THREE.Mesh(geo, flatMat(color, opacity)); m.rotation.x = -PI / 2; return m; };
  const runeMat = new THREE.MeshBasicMaterial({ color: RUNE_COLOR }), runeAura = flatMat(RUNE_COLOR, 0.55), heroAura = flatMat(GOLD, 0.45);
  const STATUS = { ice: '#e6f7ff', stun: '#fff27a', root: '#4fa646', slow: '#9fdcff', haste: '#ffa53d', curse: '#b06adf', ward: '#ffffff' };

  const insts = new Map();
  let dying = [];
  function makeInst(e, staged, cel) {
    const def = getDef(e.model || e.type, e.side);
    const group = new THREE.Group(), inner = new THREE.Group(), parts = {}, lit = [];
    group.add(inner);
    inner.rotation.order = 'YXZ';
    if (e.kind === 'unit' && (!staged || cel === 'bake')) group.rotation.x = LEAN;
    for (const [name, geo] of Object.entries(def.geos)) {
      const glow = name[0] === 'g';
      const mesh = new THREE.Mesh(geo, glow ? matGlow : cel ? matCel : matLit);
      mesh.castShadow = !glow;
      if (def.piv[name]) mesh.position.set(...def.piv[name]);
      if (!glow) { mesh.add(new THREE.Mesh(geo, cel ? matLineBold : matLine)); lit.push(mesh); }
      inner.add(mesh); parts[name] = mesh;
    }
    const scale = def.s * (e.kind === 'unit' ? USCALE * (staged ? 1 : UNIT) : 1);
    group.scale.setScalar(scale);
    const inst = { group, inner, parts, lit, def, scale, staged: !!staged, yaw: e.side === 0 ? PI : 0, age: 0, hp: e.hp, flash: 0, flashing: 0, spin: 0, status: null, statusKey: '', extras: [], air: e.air, model: e.model || e.type };
    if (e.rune || e.hero) {
      const aura = new THREE.Mesh(auraGeo, e.rune ? runeAura : heroAura); aura.rotation.x = -PI / 2; aura.scale.setScalar(e.r * 1.5);
      inst.aura = aura; inst.extras.push(aura);
      if (e.rune) { const gem = new THREE.Mesh(octaGeo, runeMat); gem.scale.set(0.09, 0.15, 0.09); inst.gem = gem; inst.extras.push(gem); }
      if (!staged) for (const m of inst.extras) world.add(m);
    }
    if (!staged) world.add(group);
    return inst;
  }
  function dropBeam(i) { if (i.beam) { world.remove(i.beam); i.beam.material.dispose(); i.beam = null; } }
  function removeInst(inst) { dropBeam(inst); world.remove(inst.group); for (const m of inst.extras) world.remove(m); if (inst.status) { world.remove(inst.status); inst.status.material.dispose(); } }
  // Verschwundene Figur: kurz zusammensacken lassen statt einfach zu verschwinden
  function dropInst(id, animated) {
    const i = insts.get(id); if (!i) return;
    insts.delete(id); dropBeam(i);
    if (i.neu) { for (const m of i.extras) world.remove(m); if (i.status) { world.remove(i.status); i.status.material.dispose(); i.status = null; } if (i.tower) actors.removeTower(i); else if (i.building) actors.removeBuilding(i); else sprites.remove(i); return; }
    if (i.sprite) {
      if (i.status) { world.remove(i.status); i.status.material.dispose(); i.status = null; }
      if (i.blob) world.remove(i.blob);
      if (animated) dying.push({ inst: i, t: 0 }); else { world.remove(i.mesh); i.mat.dispose(); }
      return;
    }
    if (!animated || i.def.kind === 'tower') { removeInst(i); return; }
    for (const m of i.extras) world.remove(m);
    if (i.status) { world.remove(i.status); i.status.material.dispose(); i.status = null; }
    for (const m of i.lit) m.castShadow = false;
    dying.push({ inst: i, t: 0 });
  }

  // Bewegung einer Figur für dieses Bild. wind: 0→1 kurz vor dem Schlag (Ausholen), s: 1→0 direkt danach.
  function animate(e, inst, time, dt, g, moving) {
    const { group, parts: p, def } = inst;
    const s = Math.max(0, e.anim || 0) / 0.3;
    const wind = e.inRange && e.cd > 0 && e.cd < 0.3 && e.deployT <= 0 && !(e.stunT > 0) ? 1 - e.cd / 0.3 : 0;
    const stunned = e.stunT > 0;
    const pace = moving ? (e.speed || 1) * (e.charging ? 2 : 1) * (e.hasteT > 0 ? 1.3 : 1) * (e.slowT > 0 ? 0.65 : 1) : 0;
    const w = moving ? Math.sin(time * (6 + pace * 4.5) + e.id * 1.7) : 0;
    const t = e.targetId ? g.byId.get(e.targetId) : null;
    const breathe = 1 + Math.sin(time * 2.6 + e.id) * 0.018;
    let y = 0, lunge = 0, tilt = 0, sy = 1;
    inst.age += dt;
    if (e.kind === 'unit') {
      let want = inst.yaw;
      if (t && (e.inRange || !moving)) want = Math.atan2(t.x - e.x, t.y - e.y);
      else if (moving && (e.vx || e.vy)) want = Math.atan2(e.vx, e.vy);
      let d = want - inst.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      inst.yaw += d * Math.min(1, dt * 12);
    }
    if (def.kind === 'human') {
      if (p.legL) { p.legL.rotation.x = w * 0.8; p.legR.rotation.x = -w * 0.8; }
      let aL = -w * 0.55, aR = w * 0.55;
      const st = STYLE[inst.model];
      if (st === 'punch') { aR = w * 0.5 + wind * 1.0 - s * 2.0; aL = e.inRange ? -0.9 + s * 0.3 : aL; lunge = s * 0.18 - wind * 0.08; }
      else if (st === 'bow') { aL = -1.4; aR = -1.2 + wind * 0.9 - s * 0.2; }
      else if (st === 'xbow') { aR = -1.35 + s * 0.25; aL = -1.1; lunge = -s * 0.1; }
      else if (p.gOrb) { // Zauberkundige: Stab oder Kugel heben, beim Wirken aufleuchten
        aR = -1.0 - wind * 0.5 + s * 0.5; aL = -w * 0.4 - wind * 0.6;
        p.gOrb.position.y = def.piv.gOrb[1] + Math.sin(time * 4 + e.id) * 0.03 + wind * 0.12;
        p.gOrb.scale.setScalar(1 + wind * 0.7 + s * 0.4);
        p.gOrb.rotation.y = time * 2;
      }
      else if (st === 'ram') { aR = -0.9; aL = -0.6; lunge = s * 0.35 - wind * 0.15; }
      else if (st === 'slash') { aL = -0.9; aR = -0.5 + wind * 1.1 - s * 1.5; lunge = s * 0.12; }
      else if (st === 'smash') { aR = -1.2 - wind * 1.3 + s * 1.9; tilt += s * 0.3 - wind * 0.18; }
      else if (st === 'spin') {
        p.armL.rotation.z = -1.25 - wind * 0.3; p.armR.rotation.z = 1.25 + wind * 0.3; aL = -0.3; aR = -0.3;
        inst.spin = s > 0 ? (1 - s) * PI * 2 : 0;
      }
      else if (st === 'throw') { aR = w * 0.4 - wind * 2.7 - s * 1.1; aL = -w * 0.4 + wind * 0.5; tilt += s * 0.28 - wind * 0.16; lunge = s * 0.1; }  // über Kopf werfen
      else if (st === 'bowl') { aR = w * 0.3 + wind * 1.1 - s * 1.5; aL = -w * 0.4 - s * 0.4; tilt += s * 0.4 - wind * 0.1; lunge = s * 0.12; }        // Kugel von unten rollen
      else if (st === 'drum') { const b = Math.sin(time * (moving ? 16 : 7) + e.id) * 0.32; aL = -0.95 + b - s * 0.6 + wind * 0.5; aR = -0.95 - b - s * 0.6 + wind * 0.5; lunge = s * 0.15; }
      p.armL.rotation.x = aL; p.armR.rotation.x = aR;
      p.body.scale.y = breathe;
      y = Math.abs(w) * 0.06;
      tilt += moving ? 0.1 + pace * 0.04 : 0;
    } else if (def.kind === 'golem') {
      p.legL.rotation.x = w * 0.5; p.legR.rotation.x = -w * 0.5;
      p.armL.rotation.x = -w * 0.35 - wind * 0.4; p.armR.rotation.x = w * 0.35 + wind * 1.4 - s * 2.2;
      p.gRune.scale.setScalar(1 + Math.sin(time * 3 + e.id) * 0.07 + s * 0.2);
      y = Math.abs(w) * 0.06; tilt = s * 0.2 - wind * 0.1;
    } else if (def.kind === 'blob') {
      const hop = moving ? Math.abs(Math.sin(time * (9 + pace * 2) + e.id)) : 0;
      y = hop * 0.14; sy = 1 - s * 0.2 + hop * 0.08 - (1 - hop) * (moving ? 0.08 : 0) + wind * 0.12; lunge = s * 0.25 - wind * 0.1;
      if (p.gFlame) p.gFlame.scale.set(1, 1 + Math.sin(time * 14 + e.id) * 0.25 + wind * 0.8, 1);
    } else if (def.kind === 'bird') { const f = 0.25 + Math.sin(time * 18 + e.id) * 0.75; p.wingL.rotation.z = -f; p.wingR.rotation.z = f; y = (FLY[inst.model] || 1.5) + Math.sin(time * 3 + e.id) * 0.08 - wind * 0.15; lunge = s * 0.3; tilt = 0.15 + wind * 0.3; }
    else if (def.kind === 'ray') { const f = Math.sin(time * 4 + e.id) * 0.35; p.wingL.rotation.z = -f; p.wingR.rotation.z = f; y = (FLY[inst.model] || 1.7) + Math.sin(time * 2 + e.id) * 0.08; tilt = s * -0.2; if (p.gOrb) p.gOrb.scale.setScalar(1 + (e.inRange ? 0.45 : 0) + Math.sin(time * 5 + e.id) * 0.1); }
    else if (def.kind === 'beetle') { const f = 0.5 + Math.sin(time * 40 + e.id) * 0.45; p.wingL.rotation.z = -f; p.wingR.rotation.z = f; y = (FLY[inst.model] || 1.9) + Math.sin(time * 2.5 + e.id) * 0.1 - s * 0.25; tilt = 0.12 + wind * 0.2; lunge = inst.model === 'donnerkaefer' ? 0 : s * 0.3; }
    else if (def.kind === 'beast') {
      const k = e.charging ? 1.1 : 0.75;
      p.legFL.rotation.x = w * k; p.legBR.rotation.x = w * k; p.legFR.rotation.x = -w * k; p.legBL.rotation.x = -w * k;
      y = Math.abs(w) * (e.charging ? 0.12 : 0.05); tilt = (e.charging ? 0.22 : 0) + s * 0.3 - wind * 0.15; lunge = s * 0.4 - wind * 0.15;
    } else if (def.kind === 'cart') { // rollt, der Kristall lädt sich sichtbar auf
      const load = e.atk ? 1 - Math.min(1, (e.cd || 0) / e.atk) : 0.5, c = p.gCrystal;
      y = moving ? Math.abs(Math.sin(time * 14 + e.id)) * 0.03 : 0; tilt = -s * 0.14;
      c.rotation.y = time * (1 + load * 7); c.scale.setScalar(0.45 + load * 0.75 + s * 0.7); c.position.y = def.piv.gCrystal[1] + Math.sin(time * 3 + e.id) * 0.03;
    } else if (def.kind === 'wagon') { // rollt und ruckt beim Schuss zurück
      y = moving ? Math.abs(Math.sin(time * 14 + e.id)) * 0.03 : 0; tilt = -s * 0.12; lunge = -s * 0.12;
    } else if (def.kind === 'turret') {
      if (t) inst.yaw = Math.atan2(t.x - e.x, t.y - e.y);
      p.top.rotation.y = inst.yaw; p.top.rotation.x = -wind * 0.15 + s * 0.2;
      sy = 1 + s * 0.04;
      if (e.d && e.d.burrow) { // vergraben: nur die Spitze schaut heraus
        inst.sink = (inst.sink || 0) + ((e.buried ? 1 : 0) - (inst.sink || 0)) * Math.min(1, dt * 9);
        y = -inst.sink * 1.15 * inst.scale;
        if (p.gOrb) p.gOrb.scale.setScalar(e.buried ? 0.5 : 1 + wind * 0.6 + s * 0.5 + Math.sin(time * 9 + e.id) * 0.08);
      }
    } else if (def.kind === 'tower') {
      const c = p.gCrystal, awake = e.active !== false;
      c.material = awake ? matGlow : matDim;
      if (awake) { c.rotation.y = time * 1.2 + e.x; c.position.y = def.piv.gCrystal[1] + Math.sin(time * 2 + e.x) * 0.08 + s * 0.15; c.scale.setScalar(1 + s * 0.25); }
    } else if (def.kind === 'static') { sy = 1 + s * 0.08; if (p.gGlow) p.gGlow.scale.setScalar(1 + Math.sin(time * 3 + e.id) * 0.035 + s * 0.12); }

    // Aufmarsch: vom Himmel fallen, landen, kurz stauchen
    let scale = inst.scale;
    if (e.deployT > 0 && e.kind === 'unit') {
      const q = Math.min(1, inst.age / 0.32);
      if (q < 1) { y += (1 - q) * (1 - q) * 4; scale *= 0.6 + 0.4 * q; }
      else { const b = Math.min(1, (inst.age - 0.32) / 0.22); sy *= 1 - Math.sin(b * PI) * 0.28; }
    } else if (inst.age < 0.18) scale *= 0.3 + 0.7 * ease(inst.age / 0.18);
    if (stunned) tilt = Math.sin(time * 18 + e.id) * 0.08;
    inst.inner.rotation.set(tilt, e.kind === 'unit' ? inst.yaw + inst.spin : 0, 0);
    group.scale.set(scale, scale * sy, scale);
    const px = e._x + Math.sin(inst.yaw) * lunge, pz = e._y + Math.cos(inst.yaw) * lunge;
    group.position.set(px, y, pz);

    // Treffer: kurz weiß aufblitzen (der stetige Verfall von Gebäuden zählt nicht)
    if (e.hp < inst.hp - (e.life ? 30 : 0.5)) inst.flash = 0.09;
    inst.hp = e.hp;
    if (inst.flash > 0) inst.flash -= dt;
    const mode = inst.staged ? 0 : e.hidden ? 2 : inst.flash > 0 ? 1 : 0;
    if (mode !== inst.flashing) { inst.flashing = mode; for (const m of inst.lit) { m.material = mode === 2 ? matGhost : mode === 1 ? matHit : matLit; m.children[0].visible = mode !== 2; m.castShadow = mode !== 2; } }

    // Runen- oder Heldenkranz, Zustandsring (betäubt, festgehalten, gebremst, angetrieben)
    if (inst.aura) { inst.aura.position.set(e._x, 0.035, e._y); inst.aura.rotation.z = time * 1.5; }
    if (inst.gem) { inst.gem.position.set(px, y + def.h * scale + 0.28 + Math.sin(time * 3 + e.id) * 0.05, pz); inst.gem.rotation.y = time * 3; }
    if (!inst.staged) statusRing(e, inst, time);
  }

  // -- 2D-Figuren --------------------------------------------------------------------------------
  // Normale Truppen sind flächige Cartoon-Figuren: je Figur und Farbe wird einmal eine Bildfolge gezeichnet
  // (flächig in zwei Tönen, dicke Kontur; stehen, laufen, ausholen, zuschlagen – von vorn, von der Seite, von
  // hinten) und im Spiel als Tafel gezeigt, die immer zur Kamera steht. Helden und Runenformen bleiben plastisch.
  const isFlat = e => e.kind === 'unit' && !e.hero && !e.rune;
  const SPRITE_R = { wicht: 1.6, kiesel: 1.3, glutling: 1.6, kraehe: 2.0, rochen: 3.4, donnerkaefer: 3.0, steinhueter: 4.0, steinling: 2.6, erzritter: 4.8, hornbulle: 3.6, hammerschmied: 2.9, klingentaenzerin: 2.9, torknacker: 2.7,
    dornwerfer: 1.9, nachtfalter: 1.7, schildknappe: 2.5, brockenwerfer: 4.6, gewitterkarren: 3.6, kegler: 4.3, sternschuetzin: 2.8, wuehler: 2.4, trommelschlaeger: 2.7, eisbrocken: 3.0, panzerbaer: 4.0, basaltriese: 4.8,
    weitschuetzin: 3.0, blasrohrwicht: 2.1, panzerhornisse: 2.6, laternenfisch: 3.2, zuendler: 2.4, sprengkaefer: 1.8, fasstraeger: 4.4,
    raeuber: 3.0, sturmbruder: 3.3, speerwache: 3.6, muellerbursche: 3.9, steinwerferin: 2.3, wueterich: 2.8, distelritter: 3.3, sichelwerfer: 3.6, splitterjaeger: 3.0, wegelagerin: 2.7, falterhueterin: 3.1, seilwerfer: 2.9, fluchweberin: 2.9, leibwaechterin: 4.0,
    frostling: 1.6, funkling: 1.6, tauling: 1.6, knallfrosch: 1.9, pulverwicht: 2.2, pulverwicht_k: 2.2, zitterling: 1.9, kraftkloss: 3.0, kraftkloss_m: 2.2, kraftkloss_k: 1.6, irrwisch: 2.0, glutei: 1.9, wanderbusch: 2.2, buschwicht: 1.8,
    keiler: 2.6, zwingerwolf: 2.9, rankenreiterin: 3.9, stammlaeufer: 4.0, flugsamen: 2.6, jungrochen: 2.6, segelwicht: 2.9, gewitterrochen: 3.6, aschenschwinge: 4.8, aschenfunke: 1.5, glutfalke: 3.1,
    astriese: 5.4, dornenkoloss: 5.2, runenhuene: 4.6, stelzenkessel: 4.2, armbrustwagen: 3.2 };
  const DIRS = [0.55, PI / 2, PI - 0.55]; // Blick nach vorn, zur Seite, nach hinten (jeweils rechts; links wird gespiegelt)
  const WALK = 6, WIND = 2, STRIKE = 4, PER = 1 + WALK + WIND + STRIKE, COLS = 8, ROWS = Math.ceil(3 * PER / COLS);
  const ANCHOR = 0.3; // Standpunkt liegt 30 % über der Unterkante des Bilds
  const LOOPED = { bird: 18, ray: 4, beetle: 40 }; // Flieger schlagen immer mit den Flügeln (Zahl = Tempo in animate)
  const celScene = new THREE.Scene();
  celScene.add(new THREE.AmbientLight('#ffffff', 1.0));
  const celSun = new THREE.DirectionalLight('#ffffff', 2.2); celSun.position.set(-3, 6, 5); celScene.add(celSun);
  const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 80);
  bakeCam.position.set(0, 30 * Math.sin(PITCH), 30 * Math.cos(PITCH)); bakeCam.lookAt(0, 0, 0);
  const sheets = new Map();
  let bakeQueue = [];

  // Bildfolgen und Kartenbilder zeichnet ein zweiter, kleiner Zeichner. So muss die große Spielfläche dafür nie
  // umgestellt werden – das hat beim Kampfbeginn sonst für jede Figur einmal geruckelt.
  let baker = null;
  function shoot(scn, cam, w, h, ctx, dx, dy) {
    if (baker === null) { try { baker = new THREE.WebGLRenderer({ antialias: true, alpha: true }); baker.setPixelRatio(1); } catch { baker = false; } }
    if (baker) {
      if (baker.domElement.width !== w || baker.domElement.height !== h) baker.setSize(w, h, false);
      baker.render(scn, cam);
      ctx.drawImage(baker.domElement, dx, dy);
      return;
    }
    // Rückfall, falls kein zweiter WebGL-Kontext zu bekommen ist: die Spielfläche kurz umstellen
    const old = renderer.getSize(new THREE.Vector2()), oldRatio = renderer.getPixelRatio();
    renderer.setPixelRatio(1); renderer.setSize(w, h, false); renderer.shadowMap.enabled = false;
    renderer.render(scn, cam);
    ctx.drawImage(renderer.domElement, dx, dy);
    renderer.shadowMap.enabled = true; renderer.setPixelRatio(oldRatio); renderer.setSize(old.x, old.y, false);
  }

  function getSheet(model, side) {
    const key = model + side;
    if (sheets.has(key)) return sheets.get(key);
    const R = SPRITE_R[model] || 2.4, px = Math.min(224, Math.max(72, Math.round(R * 60 / 8) * 8));
    const cv = document.createElement('canvas'); cv.width = COLS * px; cv.height = ROWS * px;
    const ctx = cv.getContext('2d');
    const u = UNITS[model] || {};
    const fake = { type: model, model, side, id: 0, kind: 'unit', x: 0, y: 0, _x: 0, _y: 0, r: u.r || 0.4, hp: 1, anim: 0, cd: 0, inRange: false, deployT: 0, rootT: 0, stunT: 0, active: true, vx: 0, vy: 0, targetId: 0, air: !!u.air, speed: 1 };
    const inst = makeInst(fake, true, 'bake'); inst.age = 1;
    const kind = inst.def.kind, world0 = { byId: new Map() };
    celScene.add(inst.group);
    Object.assign(bakeCam, { left: -R / 2, right: R / 2, top: R * (1 - ANCHOR), bottom: -R * ANCHOR }); bakeCam.updateProjectionMatrix();
    const cycle = f => (LOOPED[kind] ? (2 * PI * f) / LOOPED[kind] : kind === 'blob' ? (PI * f) / 11 : (2 * PI * f) / 10.5); // Zeitpunkt für Schrittphase f
    DIRS.forEach((yaw, d) => {
      for (let k = 0; k < PER; k++) {
        let time = 0, moving = false;
        fake.anim = 0; fake.cd = 0; fake.inRange = false;
        if (k >= 1 && k <= WALK) { time = cycle((k - 1) / WALK); moving = true; }
        else if (k > WALK && k <= WALK + WIND) { fake.inRange = true; fake.cd = 0.3 * (1 - (k - WALK) / WIND * 0.97); }
        else if (k > WALK + WIND) { fake.inRange = true; fake.anim = 0.3 * (1 - (k - WALK - WIND - 1) / STRIKE); }
        inst.yaw = yaw; inst.spin = 0;
        animate(fake, inst, time, 0, world0, moving);
        if (fake.air) inst.group.position.y -= FLY[model] || 1.5;
        const i = d * PER + k;
        shoot(celScene, bakeCam, px, px, ctx, (i % COLS) * px, Math.floor(i / COLS) * px);
      }
    });
    celScene.remove(inst.group);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const sheet = { tex, R, def: inst.def, kind };
    sheets.set(key, sheet);
    return sheet;
  }

  // Tafel mit drei Punktreihen: Unterkante, Standlinie, Oberkante. Gezeichnet wird sie zur Kamera gedreht,
  // die Tiefe aber so gerechnet, als stünde die Figur aufrecht (und ihr Standring läge auf dem Boden) –
  // so verdecken Türme und Figuren einander richtig.
  const quadGeo = new THREE.BufferGeometry();
  quadGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -ANCHOR, 0, 0.5, -ANCHOR, 0, -0.5, 0, 0, 0.5, 0, 0, -0.5, 1 - ANCHOR, 0, 0.5, 1 - ANCHOR, 0], 3));
  quadGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, ANCHOR, 1, ANCHOR, 0, 1, 1, 1], 2));
  quadGeo.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5]);
  const spriteMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uSize: { value: new THREE.Vector2(1, 1) }, uFlip: { value: 0 }, uFlash: { value: 0 }, uGhost: { value: 0 }, uTint: { value: 0 }, uFront: { value: new THREE.Vector3() }, uTrig: { value: new THREE.Vector2(1 / Math.cos(PITCH), 1 / Math.sin(PITCH)) } },
    vertexShader: `
      uniform vec4 uRect; uniform vec2 uSize; uniform float uFlip; uniform vec2 uTrig; uniform vec3 uFront;
      varying vec2 vUv;
      void main() {
        vUv = uRect.xy + vec2(uFlip > 0.5 ? 1.0 - uv.x : uv.x, uv.y) * uRect.zw;
        vec4 foot = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = position.y * uSize.y;
        vec4 clip = projectionMatrix * (foot + vec4(position.x * uSize.x, s, 0.0, 0.0));
        vec3 off = s >= 0.0 ? vec3(0.0, s * uTrig.x, 0.0) : vec3(0.0, 0.04 - s * 0.14, -s * uTrig.y); // unterer Teil: knapp über dem Boden, nach vorn leicht ansteigend (sonst verdeckt ihn der Boden bei großen Figuren hinten)
        vec4 virt = projectionMatrix * (foot + viewMatrix * vec4(off, 0.0));
        float zn = virt.z / virt.w;
        if (uFront.x > 0.5) { vec4 fr = projectionMatrix * viewMatrix * vec4(modelMatrix[3].x, uFront.y, uFront.z, 1.0); zn = min(zn, fr.z / fr.w); } // steht vor einem Turm: ganz davor
        clip.z = zn * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float uFlash; uniform float uGhost; uniform float uTint;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.5) discard;
        if (uGhost > 0.5 && mod(floor(gl_FragCoord.x * 0.5) + floor(gl_FragCoord.y * 0.5), 2.0) < 0.5) discard; // Unsichtbare: nur ein Raster aus Punkten
        c.rgb = mix(c.rgb, vec3(0.75, 0.85, 1.0), uGhost * 0.45);
        c.rgb = mix(c.rgb, vec3(0.5, 0.9, 1.0), uTint * 0.55); // Abbild
        gl_FragColor = vec4(mix(c.rgb, vec3(1.0), uFlash), 1.0);
      }`,
  });
  const blobMat = flatMat('#000000', 0.22);

  function makeSprite(e) {
    const model = e.model || e.type, sheet = getSheet(model, e.side);
    const mat = spriteMat.clone(); mat.uniforms.map.value = sheet.tex;
    const mesh = new THREE.Mesh(quadGeo, mat); mesh.frustumCulled = false;
    world.add(mesh);
    const inst = { sprite: true, mesh, mat, sheet, def: sheet.def, scale: sheet.def.s * USCALE * UNIT, yaw: e.side === 0 ? PI : 0, age: 0, hp: e.hp, flash: 0, phase: (e.id * 0.37) % 1, status: null, statusKey: '', air: e.air, model, blob: null };
    if (e.air) { inst.blob = new THREE.Mesh(discGeo, blobMat); inst.blob.rotation.x = -PI / 2; inst.blob.scale.setScalar(e.r * 1.2); world.add(inst.blob); }
    return inst;
  }

  function animateSprite(e, inst, time, dt, g, moving) {
    const u = inst.mat.uniforms, kind = inst.sheet.kind, R = inst.sheet.R * UNIT;
    const s = Math.max(0, e.anim || 0) / 0.3;
    const wind = e.inRange && e.cd > 0 && e.cd < 0.3 && e.deployT <= 0 && !(e.stunT > 0) ? 1 - e.cd / 0.3 : 0;
    const pace = moving ? (e.speed || 1) * (e.charging ? 2 : 1) * (e.hasteT > 0 ? 1.3 : 1) * (e.slowT > 0 ? 0.65 : 1) : 0;
    const t = e.targetId ? g.byId.get(e.targetId) : null;
    inst.age += dt;
    let want = inst.yaw;
    if (t && (e.inRange || !moving)) want = Math.atan2(t.x - e.x, t.y - e.y);
    else if (moving && (e.vx || e.vy)) want = Math.atan2(e.vx, e.vy);
    let dy = want - inst.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    inst.yaw += dy * Math.min(1, dt * 12);
    // Blickrichtung und Bild wählen
    const fx = Math.sin(inst.yaw), fz = Math.cos(inst.yaw);
    const d = Math.abs(fx) > Math.abs(fz) * 1.7 ? 1 : fz > 0 ? 0 : 2;
    let k = 0, sy = 1;
    if (LOOPED[kind]) { inst.phase += dt * (kind === 'ray' ? 0.7 : 2.2); k = 1 + Math.floor(inst.phase * WALK) % WALK; }
    else if (e.stunT > 0) k = 0;
    else if (wind > 0) k = 1 + WALK + (wind < 0.55 ? 0 : 1);
    else if (s > 0) k = 1 + WALK + WIND + Math.min(STRIKE - 1, Math.floor((1 - s) * STRIKE));
    else if (moving) { inst.phase += dt * (6 + pace * 4.5) / (2 * PI) * (kind === 'blob' ? 1.6 : 1); k = 1 + Math.floor(inst.phase * WALK) % WALK; }
    else sy = 1 + Math.sin(time * 2.6 + e.id) * 0.02; // im Stand leicht atmen
    const i = d * PER + k;
    u.uRect.value.set((i % COLS) / COLS, 1 - (Math.floor(i / COLS) + 1) / ROWS, 1 / COLS, 1 / ROWS);
    u.uFlip.value = fx < 0 ? 1 : 0;
    // Aufmarsch: herabfallen, landen, stauchen
    let y = e.air ? (FLY[inst.model] || 1.5) + Math.sin(time * 2.5 + e.id) * 0.08 : 0, sc = 1;
    if (e.deployT > 0) {
      const q = Math.min(1, inst.age / 0.32);
      if (q < 1) { y += (1 - q) * (1 - q) * 4; sc = 0.6 + 0.4 * q; }
      else { const b = Math.min(1, (inst.age - 0.32) / 0.22); sy *= 1 - Math.sin(b * PI) * 0.28; }
    } else if (inst.age < 0.18) sc = 0.3 + 0.7 * ease(inst.age / 0.18);
    if (e.stunT > 0) sy *= 1 + Math.sin(time * 30) * 0.03;
    u.uSize.value.set(R * sc * (2 - sy), R * sc * sy);
    inst.mesh.position.set(e._x, y, e._y);
    if (inst.blob) inst.blob.position.set(e._x, 0.03, e._y);
    if (e.hp < inst.hp - 0.5) inst.flash = 0.09;
    inst.hp = e.hp;
    if (inst.flash > 0) inst.flash -= dt;
    u.uFlash.value = inst.flash > 0 ? 0.8 : 0;
    u.uGhost.value = e.hidden ? 1 : 0;
    u.uTint.value = e.clone ? 1 : 0;
    setFront(u, frontOf(e._x, e._y, occ));
    if (inst.blob) inst.blob.visible = !e.hidden;
    statusRing(e, inst, time);
  }

  // Zustandsring am Boden (betäubt, festgehalten, gebremst, angetrieben) – für 2D- und 3D-Figuren
  function statusRing(e, inst, time) {
    const key = e.wardT > 0 ? 'ward' : e.iceT > 0 ? 'ice' : e.stunT > 0 ? 'stun' : e.rootT > 0 ? 'root' : e.curseT > 0 || e.ampT > 0 ? 'curse' : e.slowT > 0 ? 'slow' : e.hasteT > 0 ? 'haste' : '';
    if (key !== inst.statusKey) {
      inst.statusKey = key;
      if (key && !inst.status) { inst.status = flat(ringGeo, '#fff', 0.9); world.add(inst.status); }
      if (inst.status) { inst.status.visible = !!key; if (key) inst.status.material.color.set(STATUS[key]); }
    }
    if (key) { inst.status.position.set(e._x, 0.05, e._y); inst.status.scale.setScalar(e.r * (1.35 + Math.sin(time * 10) * 0.08)); }
  }

  // Bildfolgen für alle Figuren dieses Spiels vormerken; gezeichnet wird eine je Bild, damit nichts ruckelt
  function prepare(g) {
    const add = (unit, side) => {
      const u = UNITS[unit]; if (!u || u.tower || done.has(unit + side)) return;
      done.add(unit + side);
      if (!u.building) { if (fresh.has(u.model || unit)) want.add(u.model || unit); else if (!u.hero && !u.rune) bakeQueue.push([u.model || unit, side]); }
      for (const k of ['spawn', 'deathSpawn', 'morph', 'hatch', 'curse']) if (u[k] && !done.has(u[k].unit + side)) add(u[k].unit, side);
    };
    const done = new Set(), want = new Set();
    bakeQueue = [];
    g.sides.forEach((S, side) => { for (const id of [...S.hand, S.next, ...S.queue]) {
      const c = CARDS[id];
      if (c.type === 'spell') { for (const k of ['summon', 'summonOver', 'rollSpawn']) if (c[k]) add(c[k].unit, side); if (c.curse) add(c.curse, side); continue; }
      for (const [unit] of c.mix || [[c.unit]]) add(unit, side);
      if (RUNES[id]) add(RUNES[id].unit, side);
      if (c.ability && c.ability.unit) add(c.ability.unit, side);
    } });
    releaseUnits(want);                               // Bildfolgen des letzten Kampfs freigeben, die jetzt nicht vorkommen
    return Promise.all([...want].map(n => loadUnit(n).catch(() => { fresh.delete(n); })));      // neue Bildfolgen dieses Kampfs laden (nicht ladbar: Figur wie bisher)
  }


  // -- Geschosse, Effekte, Trümmer, Zonen --
  const projs = new Map(), zones = new Map(), projsN = new Map(), seenN = new Set();
  let fx = [], ruins = [], shake = 0, last = 0;
  const arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5).rotateX(PI / 2), boltGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5).rotateX(PI / 2);
  const pm = c => new THREE.MeshBasicMaterial({ color: c });
  const rollGeo = new THREE.CylinderGeometry(0.45, 0.45, 1, 10).rotateZ(PI / 2);
  const sickleGeo = new THREE.TorusGeometry(0.42, 0.06, 6, 14, PI * 1.25).rotateX(PI / 2);
  const fanGeo = merge([-0.42, -0.21, 0, 0.21, 0.42].map((x, i) => P(sph(0.07), '#ffffff', [x, 0, (i % 2) * 0.25 - 0.1])));
  const ARROWS = new Set(['waldlaeufer', 'weitschuetzin', 'blasrohrwicht', 'schattenjaegerin', 'klingenturm', 'kurbelbogen', 'jungfuerst']);
  const ARC = { geschuetzturm: 0.9, steinschleuder: 2.2, fernschleuder: 4.5, kesselturm: 1.8, brockenwerfer: 1.6, zuendler: 1.5, steinwerferin: 0.9, pulverwicht: 1.6, glutbrocken: 2.6, knallfrosch: 0.8, ranke: 0.7 };
  const projMats = { tar: pm('#2a2118'), star: pm('#fff27a'), arrow: pm('#f3ead2'), spark: pm('#ffb347'), mist: pm('#cdbdf5'), frost: pm('#bfeaff'), thorn: pm('#9be564'), bolt: pm('#fff27a'), stone: new THREE.MeshLambertMaterial({ color: STONE }), wood: new THREE.MeshLambertMaterial({ color: '#9a6634' }), steel: pm('#e3e7ee'), curse: pm('#b06adf'), seed: pm('#b5482c'), ember: pm('#ff8a2a'), rune: pm(RUNE_COLOR), t0: pm(TEAM[0].light), t1: pm(TEAM[1].light) };
  const BALL = { geschuetzturm: ['tar', 0.27], dornwerfer: ['thorn', 0.1], brockenwerfer: ['stone', 0.3], gewitterkarren: ['bolt', 0.32], zuendler: ['spark', 0.18], blitzfaenger: ['bolt', 0.12], kesselturm: ['tar', 0.22], fernschleuder: ['stone', 0.3], funkenweberin: ['spark', 0.2], rochen: ['mist', 0.24], frostschamane: ['frost', 0.2], wurzelmutter: ['thorn', 0.17], sturmrufer: ['bolt', 0.17], steinschleuder: ['stone', 0.2],
    steinwerferin: ['stone', 0.11], knallfrosch: ['seed', 0.17], jungrochen: ['mist', 0.17], pulverwicht: ['tar', 0.17], segelwicht: ['thorn', 0.11], zitterling: ['bolt', 0.11], aschenschwinge: ['ember', 0.13], aschenfunke: ['ember', 0.1],
    ranke: ['thorn', 0.16], fluchweberin: ['curse', 0.15], glutbrocken: ['ember', 0.26], funkenpfahl: ['bolt', 0.16] };
  const LAUNCH = { funkenpfahl: 1.7, kurbelbogen: 0.9, glutbrocken: 2.2, flugsamen: FLY.flugsamen, jungrochen: FLY.jungrochen, segelwicht: FLY.segelwicht, aschenschwinge: FLY.aschenschwinge, aschenfunke: FLY.aschenfunke, aussenturm: 2.7, geschuetzturm: 3.1, klingenturm: 2.9, segensturm: 2.8, hauptturm: 3.6, rochen: FLY.rochen, ballista: 0.7, steinschleuder: 1.0, brockenwerfer: 1.9, kesselturm: 1.3, fernschleuder: 1.6, gewitterkarren: 1.3 };
  function makeProj(p) {
    let m;
    if (p.line) { // Bahn-Geschosse: Steinwalze, Kegelkugel, Sternenpfeil
      if (p.from === 'rollstein' || p.from === 'hohlstamm') { m = new THREE.Mesh(rollGeo, p.from === 'hohlstamm' ? projMats.wood : projMats.stone); m.scale.set(p.w, p.from === 'hohlstamm' ? 0.8 : 1, p.from === 'hohlstamm' ? 0.8 : 1); m.castShadow = true; }
      else if (p.from === 'kegler') { m = new THREE.Mesh(ballGeo, projMats.stone); m.scale.setScalar(0.42); m.castShadow = true; }
      else if (p.from === 'sichelwerfer') { m = new THREE.Mesh(sickleGeo, projMats.steel); m.userData.spin = true; }
      else if (p.from === 'knallfrosch_kern') { m = new THREE.Mesh(fanGeo, projMats.seed); m.scale.set(p.w, 1, 1); m.userData.fan = true; }
      else { m = new THREE.Mesh(boltGeo, projMats.star); m.scale.set(1.4, 1.4, 1.5); }
      world.add(m);
      return m;
    }
    if (ARROWS.has(p.from)) { m = new THREE.Mesh(arrowGeo, p.rune ? projMats.rune : projMats.arrow); if (p.from === 'blasrohrwicht') m.scale.setScalar(0.6); }
    else if (p.from === 'ballista' || p.from === 'bolzenschuetzin') m = new THREE.Mesh(boltGeo, p.rune ? projMats.rune : projMats.arrow);
    else { const [mat, size] = BALL[p.from] || ['t' + p.side, 0.14]; m = new THREE.Mesh(ballGeo, projMats[mat]); m.scale.setScalar(size); }
    m.userData = { y0: LAUNCH[p.from] ?? 1.0, d0: Math.max(0.5, Math.hypot(p.tx - p.ox, p.ty - p.oy)), arc: ARC[p.from] ?? (p.splash ? 1.2 : 0.25) };
    world.add(m);
    return m;
  }

  const debrisGeo = new THREE.IcosahedronGeometry(1, 0), debrisMat = new THREE.MeshLambertMaterial({ color: STONE });
  function addFx(f) { for (const m of f.meshes || (f.mesh ? [f.mesh] : [])) world.add(m); fx.push(f); }
  function endFx(f) { for (const m of f.meshes || (f.mesh ? [f.mesh] : [])) { world.remove(m); if (!f.keep) m.material.dispose(); } }
  const pop = (x, y, z, color, r, d, o = 0.9) => { const m = new THREE.Mesh(ballGeo, flatMat(color, o)); m.position.set(x, y, z); addFx({ k: 'pop', mesh: m, t: 0, d, r, o }); };
  const ringFx = (x, z, color, r, d) => { const m = flat(ringGeo, color, 0.9); m.position.set(x, 0.06, z); addFx({ k: 'ring', mesh: m, t: 0, d, r }); };
  // Gezackter Lichtstrahl zwischen zwei Punkten (Blitz)
  function beam(a, b, color, wdt, d, straight) {
    const meshes = [], start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), n = straight ? 1 : 4;
    let from = start.clone();
    for (let i = 1; i <= n; i++) {
      const to = new THREE.Vector3().lerpVectors(start, end, i / n);
      if (i < n) to.add(new THREE.Vector3((Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.7));
      const m = new THREE.Mesh(beamGeo, flatMat(color, 1));
      m.position.lerpVectors(from, to, 0.5); m.lookAt(to); m.scale.set(wdt, wdt, from.distanceTo(to));
      meshes.push(m); from = to;
    }
    addFx({ k: 'fade', meshes, t: 0, d });
  }

  function onEvent(ev) {
    if (actors.onEvent(ev, lastG, projsN)) return; // neues Rezept hat gegriffen (engine/registry.js)
    if (ev.t === 'hit') {
      if (ev.spin) { ringFx(ev.x, ev.y, '#ffffff', ev.spin, 0.25); return; }
      pop(ev.x, 0.6, ev.y, ev.frost ? '#bfeaff' : ev.root ? '#7fd069' : ev.curse ? '#b06adf' : ev.from === 'tauling' ? '#7dffa8' : ev.splash ? '#ffd27a' : '#ffffff', ev.splash ? ev.splash * 0.9 : ev.heavy ? 0.55 : 0.3, ev.splash ? 0.3 : 0.16);
      if (ev.heavy) ringFx(ev.x, ev.y, '#ffffff', 0.9, 0.22);
    } else if (ev.t === 'die') {
      if (ev.kind === 'tower') {
        const r = ev.main ? 1.3 : 1, parts = [];
        for (let i = 0; i < 9; i++) parts.push(P(rock(0.22 + (i % 3) * 0.1), i % 2 ? STONE : STONE_D, [Math.sin(i * 2.4) * r * 0.75, 0.12 + (i % 2) * 0.1, Math.cos(i * 2.4) * r * 0.75], [i, i * 2, 0]));
        parts.push(P(cyl(r * 1.1, r * 1.15, 0.06, 12), '#4a4640', [0, 0.03, 0]));
        const m = new THREE.Mesh(merge(parts), matLit); m.position.set(ev.x, 0, ev.y); m.castShadow = true; world.add(m); ruins.push(m);
        pop(ev.x, 1, ev.y, '#ffbe5a', 3, 0.7, 0.85); ringFx(ev.x, ev.y, '#ffffff', 3.4, 0.6); ringFx(ev.x, ev.y, '#d9cfc0', r * 2.8, 1.0);
        for (let i = 0; i < (ev.main ? 18 : 12); i++) { // Trümmer fliegen im Bogen davon
          const m = new THREE.Mesh(debrisGeo, debrisMat), a = i * 0.52 + Math.random() * 0.4, sp = 1.5 + Math.random() * 3.2;
          m.position.set(ev.x, 1 + Math.random() * 1.8, ev.y); m.scale.setScalar(0.1 + Math.random() * 0.2); m.castShadow = true;
          addFx({ k: 'debris', mesh: m, keep: true, t: 0, d: 1.3, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 4 + Math.random() * 4.5 });
        }
        shake = ev.main ? 0.8 : 0.5;
      } else pop(ev.x, ev.air ? 1.5 : 0.4, ev.y, '#e9edf2', ev.kind === 'building' ? 1 : 0.5, 0.32, 0.8);
    } else if (ev.t === 'deploy') {
      ringFx(ev.x, ev.y, ev.rune ? RUNE_COLOR : ev.hero ? GOLD : TEAM[ev.side].light, ev.rune || ev.hero ? 1.6 : 1, 0.4);
      if (ev.echo) { ringFx(ev.x, ev.y, '#e9edf2', 1.6, 0.55); ringFx(ev.x, ev.y, '#e9edf2', 2.2, 0.7); }
      if (ev.rune || ev.hero) { // Lichtsäule
        const m = new THREE.Mesh(beamGeo, flatMat(ev.rune ? RUNE_COLOR : GOLD, 0.6)); m.rotation.x = PI / 2; m.position.set(ev.x, 4, ev.y); m.scale.set(0.9, 0.9, 8);
        addFx({ k: 'fade', meshes: [m], t: 0, d: 0.7, o: 0.6 });
      }
    } else if (ev.t === 'wake') ringFx(ev.x, ev.y, TEAM[ev.side].light, 2.4, 0.6);
    else if (ev.t === 'burst') { ringFx(ev.x, ev.y, ev.frost ? '#bfeaff' : '#ffd27a', ev.r, ev.big ? 0.5 : 0.35); pop(ev.x, 0.5, ev.y, ev.frost ? '#dff3ff' : '#ffb347', ev.r * (ev.big ? 1 : 0.8), ev.big ? 0.5 : 0.3); if (ev.big) shake = Math.max(shake, 0.35); }
    else if (ev.t === 'trail') ringFx(ev.x, ev.y, '#ffa53d', ev.r, 0.5);
    else if (ev.t === 'impact') { pop(ev.x, 0.7, ev.y, '#ffffff', 1.1, 0.25); ringFx(ev.x, ev.y, '#ffffff', ev.r || 1.6, 0.3); shake = Math.max(shake, 0.18); }
    else if (ev.t === 'bless') { // Segen: Lichtstrahl vom Turm, die Truppe leuchtet golden auf
      beam([ev.fx, 3.3, ev.fy], [ev.x, 1.0, ev.y], '#ffe08a', 0.1, 0.5); ringFx(ev.x, ev.y, GOLD, 1.4, 0.6); pop(ev.x, 1.1, ev.y, '#fff3c4', 0.9, 0.5, 0.8);
      const m = new THREE.Mesh(octaGeo, flatMat(GOLD, 1)); m.position.set(ev.x, 1.4, ev.y); m.scale.set(0.2, 0.3, 0.2); addFx({ k: 'rise', mesh: m, t: 0, d: 0.9, y0: 1.4 });
    }
    else if (ev.t === 'shield') { ringFx(ev.x, ev.y, '#bfeaff', 0.9, 0.3); pop(ev.x, 0.7, ev.y, '#dff3ff', 0.5, 0.25); }
    else if (ev.t === 'kraft') { const m = new THREE.Mesh(ballGeo, flatMat('#8fe0ff', 0.95)); m.position.set(ev.x, 1.0, ev.y); m.scale.setScalar(0.16); addFx({ k: 'rise', mesh: m, t: 0, d: 0.8, y0: 1.0 }); ringFx(ev.x, ev.y, '#58c7f3', 1.1, 0.4); }
    else if (ev.t === 'fuse') {
      const disc = flat(discGeo, '#ff5a3a', 0.25), ring = flat(ringGeo, '#ffd27a', 0.9);
      disc.position.set(ev.x, 0.05, ev.y); ring.position.set(ev.x, 0.06, ev.y); disc.scale.setScalar(ev.r); ring.scale.setScalar(ev.r);
      const keg = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: '#7a4f2a' })); keg.position.set(ev.x, 0.3, ev.y); keg.scale.set(0.34, 0.42, 0.34);
      for (const m of [disc, ring, keg]) world.add(m);
      fx.push({ k: 'cast', meshes: [disc, ring, keg], spell: 'fuse', x: ev.x, y: ev.y, r: ev.r, t: 0, d: ev.delay });
    } else if (ev.t === 'bolts') {
      for (const h of ev.hits) { const ty = h.air ? 1.5 : 0.3; beam([h.x + 0.8, 9, h.y - 0.6], [h.x, ty, h.y], '#fffbd0', 0.12, 0.35); pop(h.x, ty + 0.3, h.y, '#fff27a', 1.0, 0.35); ringFx(h.x, h.y, '#fff27a', 1.1, 0.3); }
      shake = Math.max(shake, 0.3);
    }
    else if (ev.t === 'charge') ringFx(ev.x, ev.y, '#f3ead2', 0.9, 0.3);
    else if (ev.t === 'chain') { // Blitz, der von Ziel zu Ziel springt
      let from = [ev.x, ev.air ? 1.9 : 0.8, ev.y];
      for (const h of ev.hits) { const to = [h.x, h.air ? 1.5 : 0.6, h.y]; beam(from, to, '#fff9b0', 0.07, 0.28); pop(to[0], to[1], to[2], '#fff27a', 0.5, 0.25); from = to; }
    }
    else if (ev.t === 'scatter') { // Splitterfächer
      const y0 = ev.air ? 1.5 : 0.9;
      for (let i = 0; i < 7; i++) { const a = ev.ang + (i / 6 - 0.5) * ev.cone, L = ev.reach * (0.75 + (i % 3) * 0.12); beam([ev.x + Math.cos(a) * 0.5, y0, ev.y + Math.sin(a) * 0.5], [ev.x + Math.cos(a) * L, 0.6, ev.y + Math.sin(a) * L], '#e9edf2', 0.035, 0.16, true); }
      for (const h of ev.hits) pop(h.x, h.air ? 1.5 : 0.6, h.y, '#ffffff', 0.4, 0.18);
      pop(ev.x + Math.cos(ev.ang) * 0.5, y0, ev.y + Math.sin(ev.ang) * 0.5, '#ffd27a', 0.5, 0.14);
    }
    else if (ev.t === 'hookcast') ringFx(ev.x, ev.y, '#d8c7a0', 1.0, 0.5);
    else if (ev.t === 'hook') { // gespanntes Seil
      const m = new THREE.Mesh(beamGeo, flatMat('#d8c7a0', 1)), a = new THREE.Vector3(ev.x, 0.9, ev.y), b = new THREE.Vector3(ev.tx, ev.air ? 1.5 : 0.7, ev.ty);
      m.position.lerpVectors(a, b, 0.5); m.lookAt(b); m.scale.set(0.06, 0.06, a.distanceTo(b));
      addFx({ k: 'fade', meshes: [m], t: 0, d: 0.35 }); pop(ev.tx, 0.7, ev.ty, '#ffffff', 0.6, 0.25); ringFx(ev.x, ev.y, '#d8c7a0', 0.8, 0.3);
    }
    else if (ev.t === 'morph') { pop(ev.x, 0.7, ev.y, ev.building ? '#d9cfc0' : '#ffb347', 1.0, 0.35, 0.85); ringFx(ev.x, ev.y, ev.building ? '#ffffff' : '#ff8a2a', 1.2, 0.4); }
    else if (ev.t === 'hatch') { pop(ev.x, 0.6, ev.y, '#ffb347', 1.2, 0.4, 0.85); ringFx(ev.x, ev.y, '#ffe08a', 1.4, 0.45); }
    else if (ev.t === 'curse') { pop(ev.x, 0.6, ev.y, '#b06adf', 0.9, 0.4, 0.8); ringFx(ev.x, ev.y, '#c98bff', 1.0, 0.4); }
    else if (ev.t === 'clone') { pop(ev.x + 0.35, ev.air ? 1.5 : 0.7, ev.y, '#8fe0ff', 0.9, 0.4, 0.7); ringFx(ev.x + 0.35, ev.y, '#bfeeff', 1.0, 0.4); }
    else if (ev.t === 'rise') { pop(ev.x, 0.2, ev.y, '#8a6a43', 0.5, 0.3, 0.8); ringFx(ev.x, ev.y, '#d9cfc0', 0.6, 0.3); }
    else if (ev.t === 'pulse') { const m = flat(discGeo, '#7a4fd0', 0.75); m.position.set(ev.x, 0.07, ev.y); addFx({ k: 'blast', mesh: m, t: 0, d: 0.4, r: ev.r }); pop(ev.x, 0.5, ev.y, ev.n <= 1 ? '#f0d9ff' : '#b06adf', ev.r * (ev.n <= 1 ? 0.9 : 0.6), 0.3, 0.75); if (ev.n <= 1) shake = Math.max(shake, 0.15); }
    else if (ev.t === 'ench') { pop(ev.x, ev.air ? 1.5 : 0.7, ev.y, '#c98bff', 0.9, 0.3, 0.9); ringFx(ev.x, ev.y, '#c98bff', 0.9, 0.3); }
    else if (ev.t === 'rune') { beam([ev.fx, 2.2, ev.fy], [ev.x, 1.0, ev.y], '#c98bff', 0.07, 0.45); ringFx(ev.x, ev.y, '#c98bff', 1.1, 0.5); }
    else if (ev.t === 'ability') {
      if (ev.id === 'schleier') { pop(ev.x, 0.9, ev.y, '#c98bff', 1.3, 0.45, 0.7); ringFx(ev.x, ev.y, '#c98bff', 1.4, 0.4); }
      else if (ev.id === 'wurzelheer') { ringFx(ev.x, ev.y, '#7fd069', 2.4, 0.5); for (const h of ev.hits) { ringFx(h.x, h.y, '#9be564', 0.7, 0.4); pop(h.x, 0.3, h.y, '#6b4a2b', 0.5, 0.3, 0.7); } }
      else if (ev.id === 'sturmlauf') { let from = [ev.x, 0.8, ev.y]; for (const h of ev.hits) { const to = [h.x, h.air ? 1.5 : 0.8, h.y]; beam(from, to, '#ffffff', 0.1, 0.4); pop(to[0], to[1], to[2], '#dffaff', 0.7, 0.3); from = to; } shake = Math.max(shake, 0.1); }
      else if (ev.id === 'seitenwechsel') { for (const h of ev.hits) { pop(h.x, 0.3, h.y, '#6b4f32', 1.0, 0.4, 0.85); ringFx(h.x, h.y, '#8a6a43', 1.2, 0.4); } pop(ev.x, 0.3, ev.y, '#6b4f32', 1.0, 0.4, 0.85); ringFx(ev.x, ev.y, GOLD, 1.3, 0.5); }
      else if (ev.id === 'stillewacht') { ringFx(ev.x, ev.y, '#ffffff', 1.5, 0.6); ringFx(ev.x, ev.y, '#8fe0ff', 1.0, 0.45); pop(ev.x, 0.9, ev.y, '#dff3ff', 1.1, 0.45, 0.6); }
      else if (ev.id === 'leibwache') { for (const h of ev.hits) { ringFx(h.x, h.y, GOLD, 1.6, 0.5); const m = new THREE.Mesh(beamGeo, flatMat(GOLD, 0.6)); m.rotation.x = PI / 2; m.position.set(h.x, 4, h.y); m.scale.set(0.7, 0.7, 8); addFx({ k: 'fade', meshes: [m], t: 0, d: 0.6, o: 0.6 }); } }
      else if (ev.id === 'schlachtruf') { ringFx(ev.x, ev.y, GOLD, ev.r, 0.6); ringFx(ev.x, ev.y, '#fff3c4', ev.r * 0.6, 0.45); for (const h of ev.hits) pop(h.x, 1.2, h.y, GOLD, 0.5, 0.35, 0.7); }
      else { for (const h of ev.hits) { beam([ev.x, 1.9, ev.y], [h.x, h.air ? 1.5 : 0.5, h.y], '#fff9b0', 0.07, 0.3); pop(h.x, h.air ? 1.5 : 0.5, h.y, '#fff27a', 0.7, 0.3); } shake = Math.max(shake, 0.12); }
    } else if (ev.t === 'cast') {
      const disc = flat(discGeo, TEAM[ev.side].main, 0.3), ring = flat(ringGeo, TEAM[ev.side].light, 0.9);
      disc.position.set(ev.x, 0.05, ev.y); ring.position.set(ev.x, 0.06, ev.y); disc.scale.setScalar(ev.r); ring.scale.setScalar(ev.r);
      const meshes = [disc, ring];
      if (FALL[ev.spell]) meshes.push(new THREE.Mesh(ev.spell === 'sternschlag' ? new THREE.OctahedronGeometry(FALL[ev.spell][1]) : new THREE.IcosahedronGeometry(FALL[ev.spell][1], 0), new THREE.MeshBasicMaterial({ color: FALL[ev.spell][0] })));
      if (ev.spell === 'hagelschauer') for (let i = 0; i < 14; i++) { const h = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: '#eaf6ff' })); h.scale.set(0.07, 0.3, 0.07); h.userData = { a: i * 2.4, q: Math.sqrt((i + 0.5) / 14), o: i / 14 }; meshes.push(h); }
      for (const m of meshes) world.add(m);
      fx.push({ k: 'cast', meshes, spell: ev.spell, x: ev.x, y: ev.y, r: ev.r, t: 0, d: Math.max(0.05, ev.delay) });
    } else if (ev.t === 'spell') {
      if (ev.spell === 'eiswurf') { pop(ev.x, 0.6, ev.y, '#dff3ff', ev.r * 0.8, 0.4, 0.7); ringFx(ev.x, ev.y, '#ffffff', ev.r, 0.4); shake = Math.max(shake, 0.15); }
      if (ev.spell === 'wachkiste') { pop(ev.x, 0.5, ev.y, '#ffd27a', ev.r * 0.8, 0.4, 0.8); ringFx(ev.x, ev.y, '#ffffff', ev.r, 0.4); shake = Math.max(shake, 0.25); }
      if (ev.spell === 'trugbild') { ringFx(ev.x, ev.y, '#8fe0ff', ev.r, 0.6); ringFx(ev.x, ev.y, '#ffffff', ev.r * 0.6, 0.45); }
      if (ev.spell === 'bodengrollen') shake = Math.max(shake, 0.5);
      const col = { hohlstamm: '#9a6634', trugbild: '#8fe0ff', bodengrollen: '#b08a5a', eiswurf: '#dff3ff', wurzelfluch: '#b06adf', geroellfeld: '#939aa5', wachkiste: '#c9a35e', sternenschlund: '#7a4fd0', sternschlag: '#ffcf5a', hagelschauer: '#dff1ff', wurzelgriff: '#7fd069', heilquell: '#7dffa8', funkenschlag: '#fff27a', sumpfdunst: '#a6d94a', kriegstrommel: '#ffa53d', frostnacht: '#dff3ff', donnerkeil: '#fff27a', felssturz: '#ffb347', wichtwurf: '#c79a5e', wirbelwind: '#e6f7ff' }[ev.spell];
      if (col) { const m = flat(discGeo, col, 0.7); m.position.set(ev.x, 0.07, ev.y); addFx({ k: 'blast', mesh: m, t: 0, d: 0.45, r: ev.r }); }
      if (ev.spell === 'felssturz') { shake = Math.max(shake, 0.4); pop(ev.x, 0.6, ev.y, '#ffd27a', ev.r * 1.1, 0.45, 0.85); ringFx(ev.x, ev.y, '#ffffff', ev.r * 1.5, 0.4); }
      if (ev.spell === 'frostnacht') { pop(ev.x, 0.6, ev.y, '#dff3ff', ev.r * 0.9, 0.5, 0.6); ringFx(ev.x, ev.y, '#ffffff', ev.r, 0.5); }
      if (ev.spell === 'sternschlag') { shake = Math.max(shake, 0.25); pop(ev.x, 0.5, ev.y, '#ffd27a', ev.r * 0.8, 0.4, 0.8); }
      if (ev.spell === 'funkenschlag') for (let i = 0; i < 3; i++) { const a = i * 2.1; beam([ev.x + Math.cos(a) * 0.6, 7, ev.y + Math.sin(a) * 0.6], [ev.x + Math.cos(a) * ev.r * 0.5, 0.2, ev.y + Math.sin(a) * ev.r * 0.5], '#fff9b0', 0.06, 0.25); }
      if (ev.spell === 'kriegstrommel') ringFx(ev.x, ev.y, '#ffa53d', ev.r, 0.5);
    } else if (ev.t === 'heal') {
      const m = new THREE.Mesh(ballGeo, flatMat('#7dffa8', 0.9)); m.position.set(ev.x + (Math.random() - 0.5) * 0.4, 0.8, ev.y); m.scale.setScalar(0.09);
      addFx({ k: 'rise', mesh: m, t: 0, d: 0.6 });
    }
  }

  function updateFx(dt, time) {
    for (const f of fx) {
      f.t += dt * opt.fxRate;
      const p = Math.min(1, f.t / f.d);
      if (f.k === 'pop') { f.mesh.scale.setScalar(f.r * (0.3 + ease(p) * 0.7)); f.mesh.material.opacity = f.o * (1 - p); }
      else if (f.k === 'ring') { f.mesh.scale.setScalar(f.r * (0.3 + ease(p) * 0.7)); f.mesh.material.opacity = 1 - p; }
      else if (f.k === 'blast') { f.mesh.scale.setScalar(f.r * (0.6 + p * 0.4)); f.mesh.material.opacity = 0.7 * (1 - p); }
      else if (f.k === 'debris') {
        const m = f.mesh; f.vy -= 14 * dt;
        m.position.x += f.vx * dt; m.position.z += f.vz * dt; m.position.y += f.vy * dt;
        if (m.position.y < 0.1) { m.position.y = 0.1; f.vy = Math.abs(f.vy) * 0.35; f.vx *= 0.55; f.vz *= 0.55; }
        m.rotation.x += dt * 7; m.rotation.z += dt * 5;
        if (p > 0.8) m.scale.multiplyScalar(Math.max(0, 1 - dt * 6));
      }
      else if (f.k === 'rise') { f.mesh.position.y = (f.y0 || 0.8) + p * 0.8; f.mesh.material.opacity = 1 - p; }
      else if (f.k === 'fade') { for (const m of f.meshes) m.material.opacity = (f.o || 1) * (1 - p); }
      else if (f.k === 'cast') {
        for (const m of f.meshes.slice(2)) {
          if (FALL[f.spell]) { m.position.set(f.x - (1 - p) * 3, 0.4 + (1 - p) * 14, f.y - (1 - p) * 2); m.rotation.set(time * 5, time * 7, 0); }
          else if (f.spell === 'fuse') { m.scale.set(0.34, 0.42 + Math.sin(time * 30) * 0.03, 0.34); f.meshes[0].material.opacity = 0.2 + p * 0.3 + Math.sin(time * (10 + p * 30)) * 0.08; }
          else { const u = m.userData, q = (p * 2 + u.o) % 1; m.position.set(f.x + Math.cos(u.a) * u.q * f.r, 4 * (1 - q), f.y + Math.sin(u.a) * u.q * f.r); }
        }
      }
    }
    const done = fx.filter(f => f.t >= f.d);
    if (done.length) { done.forEach(endFx); fx = fx.filter(f => f.t < f.d); }
    for (const d of dying) {
      d.t += dt;
      const p = Math.min(1, d.t / 0.32);
      if (d.inst.sprite) { const R = d.inst.sheet.R * UNIT; d.inst.mat.uniforms.uSize.value.set(R * (1 + p * 0.3), R * Math.max(0.02, 1 - p)); if (d.inst.air) d.inst.mesh.position.y = Math.max(0, d.inst.mesh.position.y - dt * 6); continue; }
      const grp = d.inst.group, k = d.inst.scale;
      grp.scale.set(k * (1 + p * 0.3), k * Math.max(0.02, 1 - p), k * (1 + p * 0.3));
      if (d.inst.air) grp.position.y = Math.max(0, grp.position.y - dt * 6);
      d.inst.inner.rotation.z = p * 0.5;
    }
    if (dying.some(d => d.t >= 0.32)) { for (const d of dying) if (d.t >= 0.32) dropDying(d.inst); dying = dying.filter(d => d.t < 0.32); }
  }

  // -- Auswahl: gesperrte Zone und Vorschau --
  const zoneMat = flatMat('#d0324a', 0.24);
  const lock = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), zoneMat); m.rotation.x = -PI / 2; m.visible = false; world.add(m); return m; });
  const ghostDisc = flat(discGeo, TEAM[0].main, 0.32), ghostRing = flat(ringGeo, '#ffffff', 0.95), rangeRing = flat(new THREE.RingGeometry(0.985, 1, 64), '#ffffff', 0.5);
  for (const m of [ghostDisc, ghostRing, rangeRing]) { m.visible = false; world.add(m); }
  // Platzierungs-Vorschau (alles aus deployPlan in sim.js): Kachelraster des erlaubten Bereichs, belegte Kacheln eines
  // Gebäudes, je Figur eines Trupps eine Scheibe an ihrem Platz
  const gridImg = document.createElement('canvas'); gridImg.width = gridImg.height = 64;
  { const q = gridImg.getContext('2d'); q.strokeStyle = 'rgba(255,255,255,.9)'; q.lineWidth = 3; q.strokeRect(0, 0, 64, 64); }
  const grid = [0, 1, 2, 3].map(() => {
    const tex = new THREE.CanvasTexture(gridImg); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.2, depthWrite: false }));
    m.rotation.x = -PI / 2; m.visible = false; world.add(m); return m;
  });
  const setGrid = (m, x0, x1, z0, z1) => { // Kachelgrenzen liegen auf ganzen Feldmaßen, auch wenn der Bereich mittendrin beginnt
    m.visible = true; m.position.set((x0 + x1) / 2, 0.045, (z0 + z1) / 2); m.scale.set(x1 - x0, z1 - z0, 1);
    m.material.map.repeat.set(x1 - x0, z1 - z0); m.material.map.offset.set(x0 % 1, (1 - (z1 % 1)) % 1);
  };
  // Kachelkarte aus deployTiles: erlaubte Kacheln mit feinem Rand, gesperrte rötlich (nur neu gemalt, wenn sie sich ändert)
  const TP = 24, maskCv = document.createElement('canvas'); maskCv.width = W * TP; maskCv.height = H * TP;
  const maskTex = new THREE.CanvasTexture(maskCv); maskTex.colorSpace = THREE.SRGBColorSpace;
  const maskMesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: maskTex, transparent: true, depthWrite: false }));
  maskMesh.rotation.x = -PI / 2; maskMesh.position.set(W / 2, 0.045, H / 2); maskMesh.visible = false; world.add(maskMesh);
  let maskKey = '';
  function paintMask(tiles, red) {
    let key = red ? 'r' : 's'; for (let i = 0; i < tiles.length; i += 6) key += String.fromCharCode(48 + (tiles[i] | tiles[i + 1] << 1 | tiles[i + 2] << 2 | tiles[i + 3] << 3 | tiles[i + 4] << 4 | tiles[i + 5] << 5));
    if (key === maskKey) return;
    maskKey = key;
    const q = maskCv.getContext('2d'); q.clearRect(0, 0, maskCv.width, maskCv.height);
    q.lineWidth = 1;
    for (let r = 0; r < H; r++) for (let col = 0; col < W; col++) {
      if (tiles[r * W + col]) { q.strokeStyle = 'rgba(255,255,255,.3)'; q.strokeRect(col * TP + 0.5, r * TP + 0.5, TP - 1, TP - 1); }
      else if (red) { q.fillStyle = 'rgba(60,8,24,.46)'; q.fillRect(col * TP, r * TP, TP, TP); } // dunkelrot: auch auf rotem Boden zu sehen
    }
    maskTex.needsUpdate = true;
  }
  const tileFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flatMat(TEAM[0].main, 0.5)); tileFill.rotation.x = -PI / 2;
  const tileEdge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, z]) => new THREE.Vector3(x, 0, z))), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }));
  for (const m of [tileFill, tileEdge]) { m.visible = false; world.add(m); }
  const spotPool = [];
  const spotAt = i => { while (spotPool.length <= i) { const d = flat(discGeo, TEAM[0].main, 0.55), r = flat(ringGeo, '#ffffff', 0.95); world.add(d, r); spotPool.push([d, r]); } return spotPool[i]; };
  const border = flat(new THREE.PlaneGeometry(W, 0.08), '#ffffff', 0.6); border.position.set(W / 2, 0.05, RIVER_BOT + 0.2); border.visible = false; world.add(border);
  const setRect = (m, x0, x1, z0, z1) => { m.visible = true; m.position.set((x0 + x1) / 2, 0.04, (z0 + z1) / 2); m.scale.set(x1 - x0, z1 - z0, 1); };
  const ZONE_COLOR = { heilquell: '#58d68d', sumpfdunst: '#a6d94a', wirbelwind: '#d7f2ff', bodengrollen: '#b08a5a', wurzelfluch: '#9a2fff', geroellfeld: '#8d939c', sternenschlund: '#5a3aa0' };
  const FALL = { sternschlag: ['#ffe08a', 0.45], felssturz: ['#8d939c', 0.8], wichtwurf: ['#9a6634', 0.42], eiswurf: ['#dff3ff', 0.5], wachkiste: ['#9a6634', 0.6] };
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  // Brennstrahl (Laternenfisch, Sonnenspiegel): steht, solange das Ziel getroffen wird, und wird sichtbar heißer
  function rampBeam(e, inst, g, time) {
    const t = e.inRange && e.targetId && e.deployT <= 0 && !(e.stunT > 0) ? g.byId.get(e.targetId) : null;
    if (!t) { if (inst.beam) inst.beam.visible = false; return; }
    if (!inst.beam) { inst.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.9, depthWrite: false })); world.add(inst.beam); }
    const hot = e.rampT >= e.d.ramp[1][0] ? 2 : e.rampT >= e.d.ramp[0][0] ? 1 : 0, b = inst.beam;
    va.set(e._x, e.air ? (FLY[inst.model] || 1.5) + 0.35 : 1.2, e._y); vb.set(t._x ?? t.x, t.air ? 1.5 : t.kind === 'tower' ? 1.8 : 0.6, t._y ?? t.y);
    const w = [0.045, 0.085, 0.15][hot] * (1 + Math.sin(time * 40) * 0.15);
    b.visible = true; b.position.lerpVectors(va, vb, 0.5); b.lookAt(vb); b.scale.set(w, w, va.distanceTo(vb));
    b.material.color.set(['#ffe08a', '#ffb347', '#fff6d8'][hot]);
    if (hot && Math.random() < 0.3) pop(vb.x, vb.y, vb.z, '#ffb347', 0.25 * hot, 0.2, 0.8);
  }

  const dropDying = i => { if (i.sprite) { world.remove(i.mesh); i.mat.dispose(); } else world.remove(i.group); };

  function reset() {
    for (const id of [...insts.keys()]) dropInst(id, false);
    for (const d of dying) dropDying(d.inst); dying = [];
    bakeQueue = [];
    for (const m of projs.values()) world.remove(m); projs.clear();
    for (const m of zones.values()) { world.remove(m); m.material.dispose(); } zones.clear();
    fx.forEach(endFx); fx = [];
    for (const m of ruins) { world.remove(m); m.geometry.dispose(); } ruins = [];
    for (const o of projsN.values()) actors.removeProj(o); projsN.clear();
    actors.reset();
    shake = 0;
  }

  const seen = new Set();
  function draw(g, a, ui, now) {
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0); last = now;
    const time = now / 1000;
    if (bakeQueue.length) getSheet(...bakeQueue.shift());
    // Figuren
    lastG = g; occ.length = 0;
    for (const e of g.ents) if (e.kind !== 'unit') { const i = insts.get(e.id); occ.push({ x: e.x, z: e.y, r: e.r, h: i ? i.def.h * i.scale : 3.5 }); }
    for (const e of g.ents) {
      e._x = e.ox + (e.x - e.ox) * a; e._y = e.oy + (e.y - e.oy) * a;
      const moving = e.kind === 'unit' && !e.inRange && e.deployT <= 0 && e.rootT <= 0 && !(e.stunT > 0);
      const model = e.model || e.type;
      const neu = e.kind === 'tower' ? actors.hasTower(model) : e.kind === 'building' ? actors.hasBuilding(model) : fresh.has(model); // neu gebaut? sonst wie bisher (auch Helden und Runenformen)
      if (neu && e.kind === 'unit' && !getUnit(model)) { loadUnit(model).catch(() => fresh.delete(model)); continue; } // Bildfolge lädt noch (kam nicht über prepare): gleich da – oder nicht ladbar: dann wie bisher
      let inst = insts.get(e.id);
      if (inst && (inst.model !== model || !!inst.sprite !== (e.kind === 'unit' && (neu || isFlat(e))) || !!inst.neu !== neu)) { dropInst(e.id, false); inst = null; } // verwandelt (oder neue Teile sind eben fertig geladen)
      if (!inst) {
        inst = neu ? (e.kind === 'tower' ? actors.makeTower(e) : e.kind === 'building' ? actors.makeBuilding(e) : sprites.make(getUnit(model), e.side, e.id)) : isFlat(e) ? makeSprite(e) : makeInst(e); insts.set(e.id, inst);
        if (neu && e.air) sprites.setFlier(inst, FLY[model] || 1.5);
        if (neu && e.kind === 'unit' && (e.rune || e.hero)) {   // Schein am Boden, bei Runenformen ein Stein über dem Kopf
          const aura = new THREE.Mesh(auraGeo, e.rune ? runeAura : heroAura); aura.rotation.x = -PI / 2; aura.scale.setScalar(e.r * 1.5); inst.aura = aura; inst.extras.push(aura);
          if (e.rune) { const gem = new THREE.Mesh(octaGeo, runeMat); gem.scale.set(0.09, 0.15, 0.09); inst.gem = gem; inst.extras.push(gem); }
          for (const m of inst.extras) world.add(m);
        }
      }
      if (inst.neu) {
        if (inst.tower) actors.updateTower(e, inst, dt, time); else if (inst.building) actors.updateBuilding(e, inst, g, dt, time); else { sprites.update(e, inst, g, dt, time, occ); if (e.clone) inst.u.uFrost.value = 0.8; }
        statusRing(e, inst, time);
        if (inst.aura) { inst.aura.position.set(e._x, 0.035, e._y); inst.aura.rotation.z = time * 1.5; }
        if (inst.gem) { inst.gem.position.set(inst.mesh.position.x, inst.mesh.position.y + inst.h + 0.3 + Math.sin(time * 3 + e.id) * 0.05, inst.mesh.position.z); inst.gem.rotation.y = time * 3; }
      } else if (inst.sprite) animateSprite(e, inst, time, dt, g, moving); else animate(e, inst, time, dt, g, moving);
      if (e.d.ramp) rampBeam(e, inst, g, time);
    }
    if (insts.size !== g.ents.length) for (const id of [...insts.keys()]) if (!g.byId.has(id)) dropInst(id, true);
    // Geschosse
    seen.clear(); seenN.clear();
    for (const p of g.projs) {
      if (actors.hasProj(p)) { seenN.add(p); let o = projsN.get(p); if (!o) { o = actors.makeProj(p); projsN.set(p, o); } actors.updateProj(p, o, a); continue; }
      seen.add(p);
      let m = projs.get(p);
      if (!m) { m = makeProj(p); projs.set(p, m); }
      const x = p.ox + (p.x - p.ox) * a, z = p.oy + (p.y - p.oy) * a;
      if (p.line) {
        const yy = m.userData.spin || m.userData.fan ? 0.95 : m.geometry === boltGeo ? 0.9 : 0.45;
        m.position.set(x, yy, z);
        if (m.userData.spin) m.rotation.y += dt * 22;
        else if (m.geometry === boltGeo || m.userData.fan) m.lookAt(x + p.vx, yy, z + p.vy); else m.rotation.x += dt * 10 * (p.vy < 0 ? -1 : 1);
        continue;
      }
      const left = Math.hypot(p.tx - x, p.ty - z), u = Math.min(1, left / m.userData.d0);
      const ty = p.air ? 1.5 : 0.6;
      m.position.set(x, ty + (m.userData.y0 - ty) * u + Math.sin(u * PI) * m.userData.arc, z);
      if (m.geometry === arrowGeo || m.geometry === boltGeo) m.lookAt(p.tx, ty, p.ty);
    }
    for (const [p, m] of projs) if (!seen.has(p)) { world.remove(m); projs.delete(p); }
    for (const [p, o] of projsN) if (!seenN.has(p)) { actors.removeProj(o); projsN.delete(p); }
    // Dauerzonen (Heilquell, Sumpfdunst)
    seen.clear();
    for (const z of g.zones) {
      if (!z.hit || !ZONE_COLOR[z.spell] || actors.hasSpell(z.spell)) continue;   // Zonen mit neuem Rezept zeichnet die Engine
      seen.add(z);
      let m = zones.get(z);
      if (!m) { m = flat(discGeo, ZONE_COLOR[z.spell], 0.25); m.position.set(z.x, 0.05, z.y); m.scale.setScalar(z.r); world.add(m); zones.set(z, m); }
      m.material.opacity = 0.24 + 0.08 * Math.sin(time * 6);
      if (z.spell === 'wirbelwind' && Math.random() < dt * 40) { const q = time * 6 + Math.random() * PI * 2, r = (0.2 + Math.random() * 0.8) * z.r; pop(z.x + Math.cos(q) * r, 0.3 + Math.random() * 1.6, z.y + Math.sin(q) * r, '#ffffff', 0.22, 0.35, 0.6); }
      if (z.spell === 'bodengrollen' && Math.random() < dt * 22) { const q = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * z.r; pop(z.x + Math.cos(q) * r, 0.15, z.y + Math.sin(q) * r, '#d9c8a8', 0.35, 0.3, 0.7); shake = Math.max(shake, 0.08); }
      if (z.spell === 'wurzelfluch' && Math.random() < dt * 12) { const q = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * z.r; pop(z.x + Math.cos(q) * r, 0.3 + Math.random() * 0.8, z.y + Math.sin(q) * r, '#c98bff', 0.22, 0.5, 0.6); }
      if (z.spell === 'sternenschlund' && Math.random() < dt * 16) { const q = time * 5 + Math.random() * PI * 2, r = (0.3 + Math.random() * 0.7) * z.r; pop(z.x + Math.cos(q) * r, 0.2, z.y + Math.sin(q) * r, '#b06adf', 0.2, 0.35, 0.7); }
      if (z.spell === 'sumpfdunst' && Math.random() < dt * 14) { const q = Math.random() * PI * 2, r = Math.sqrt(Math.random()) * z.r; pop(z.x + Math.cos(q) * r, 0.3, z.y + Math.sin(q) * r, '#c5ee6a', 0.3, 0.5, 0.5); }
    }
    for (const [z, m] of zones) if (!seen.has(z)) { world.remove(m); m.material.dispose(); zones.delete(z); }
    updateFx(dt, time);
    runeAura.opacity = 0.45 + 0.2 * Math.sin(time * 5); heroAura.opacity = 0.4 + 0.15 * Math.sin(time * 4);

    // Auswahl
    const sel = ui && ui.sel != null ? g.sides[0].hand[ui.sel] : null;
    const selCard = sel ? (CARDS[sel].mirror && g.sides[0].last ? CARDS[g.sides[0].last] : CARDS[sel]) : null; // Widerhall zeigt die Karte, die er wiederholt
    const troop = sel && (selCard.ownSide || (selCard.type !== 'spell' && !selCard.anywhere));
    for (const m of lock) m.visible = false;
    for (const m of grid) m.visible = false;
    const tiles = sel && SIM.deployTiles ? SIM.deployTiles(g, 0, sel) : null;
    maskMesh.visible = !!tiles;
    border.visible = !!troop && !tiles;
    if (tiles) paintMask(tiles, !!troop);
    else if (troop) for (const lane of [0, 1]) {
      const open = !outerTower(g, 1, lane), x0 = lane * W / 2, x1 = x0 + W / 2;
      setRect(lock[lane * 2], x0, x1, 0, open ? POCKET : RIVER_BOT + 0.2);
      if (open) setRect(lock[lane * 2 + 1], x0, x1, RIVER_TOP - 0.2, RIVER_BOT + 0.2);
      setGrid(grid[lane * 2], x0, x1, RIVER_BOT + 0.2, H);                      // erlaubt: das eigene Feld …
      if (open) setGrid(grid[lane * 2 + 1], x0, x1, POCKET, RIVER_TOP - 0.2);   // … und die Tasche hinter einem gefallenen Außenturm
    } else if (sel) setGrid(grid[0], 0, W, 0, H);                               // Zauber und Karten für überall: das ganze Feld
    let label = null;
    const plan = sel && ui.ghost ? deployPlan(g, 0, sel, ui.ghost.x, ui.ghost.y) : null; // was beim Loslassen wirklich geschieht
    ghostDisc.visible = ghostRing.visible = rangeRing.visible = tileFill.visible = tileEdge.visible = false;
    let used = 0;
    if (plan) {
      const card = selCard, ok = g.sides[0].kraft >= cardCost(g, 0, sel) && plan.ok !== false, fill = ok ? TEAM[0].main : '#cc3333', edge = ok ? '#ffffff' : '#ffb3b3';
      let top = plan.y - 0.9; // Oberkante der Vorschau: darüber steht der Name
      if (plan.kind === 'spell') { // Wirkungskreis
        const r = Math.max(0.9, plan.radius || (card.roll ? card.roll.w / 2 : 0));
        ghostDisc.visible = ghostRing.visible = true;
        ghostDisc.material.color.set(fill); ghostRing.material.color.set(edge);
        ghostDisc.position.set(plan.x, 0.08, plan.y); ghostRing.position.set(plan.x, 0.09, plan.y); ghostDisc.scale.setScalar(r); ghostRing.scale.setScalar(r);
        top = plan.y - r;
      } else if (plan.tiles) { // Gebäude: seine Kacheln
        const t = plan.tiles;
        tileFill.visible = tileEdge.visible = true;
        tileFill.material.color.set(fill); tileEdge.material.color.set(edge);
        tileFill.position.set(t.x0 + t.w / 2, 0.08, t.y0 + t.h / 2); tileFill.scale.set(t.w, t.h, 1);
        tileEdge.position.set(t.x0 + t.w / 2, 0.09, t.y0 + t.h / 2); tileEdge.scale.set(t.w, 1, t.h);
        top = t.y0;
      }
      if (plan.kind !== 'spell' && !(plan.tiles && plan.kind === 'building')) for (const sp of plan.spots) { // jede Figur an ihrem Platz
        const [d, r] = spotAt(used++), rr = Math.max(0.28, sp.r);
        d.visible = r.visible = true; d.material.color.set(fill); r.material.color.set(edge);
        d.position.set(sp.x, 0.08, sp.y); r.position.set(sp.x, 0.09, sp.y); d.scale.setScalar(rr); r.scale.setScalar(rr);
        top = Math.min(top, sp.y - rr);
      }
      const lead = plan.spots[0] && UNITS[plan.spots[0].unit];
      if (lead && lead.range >= 2) { rangeRing.visible = true; rangeRing.position.set(plan.x, 0.07, plan.y); rangeRing.scale.setScalar(lead.range + lead.r); }
      label = { text: CARDS[sel].mirror ? `Widerhall: ${card.name}` : card.name, x: plan.x, z: top - 0.2 };
    }
    for (let i = used; i < spotPool.length; i++) spotPool[i][0].visible = spotPool[i][1].visible = false;

    if (shake > 0 && !opt.shake) shake = 0;
    if (shake > 0) shake -= dt;
    actors.frame(dt * opt.fxRate, time, shake, opt.shake); // neue Effekte, Wackeln der Kamera, Aufblitzen
    look.render(time);

    // Lebensbalken und Beschriftung als 2D-Ebene darüber
    o2.setTransform(dpr, 0, 0, dpr, 0, 0);
    o2.clearRect(0, 0, width, height);
    o2.textAlign = 'center'; o2.textBaseline = 'middle'; o2.lineJoin = 'round';
    let lvlFont = '';
    for (const e of g.ents) {
      const tower = e.kind === 'tower';
      if (e.deployT > 0 && e.kind === 'unit') { // Aufmarsch-Uhr am Standpunkt
        const [fx0, fy0] = project(e._x, 0, e._y), [fx1] = project(e._x + 1, 0, e._y), pp = fx1 - fx0, q = 1 - Math.min(1, e.deployT), r = Math.max(4.5, pp * 0.2);
        o2.lineWidth = Math.max(2.5, pp * 0.085); o2.strokeStyle = 'rgba(12,20,28,.75)'; o2.beginPath(); o2.arc(fx0, fy0 + r * 1.9, r, 0, PI * 2); o2.stroke();
        o2.strokeStyle = '#ffffff'; o2.beginPath(); o2.arc(fx0, fy0 + r * 1.9, r, -PI / 2, -PI / 2 + PI * 2 * q); o2.stroke();
      }
      const bar = tower || e.hero || e.hp < e.maxHp || e.maxShield;
      const inst = insts.get(e.id); if (!inst) continue;
      if (inst.bar == null) inst.bar = e.hp;
      inst.bar += (e.hp - inst.bar) * Math.min(1, dt * 5);
      const top = inst.def.h * inst.scale + (e.air ? FLY[inst.model] || 1.5 : 0) + 0.15;
      const [sx, sy] = project(e._x, top, e._y), [sx2] = project(e._x + 1, top, e._y);
      const ppt = sx2 - sx; // Pixel je Feld in dieser Tiefe
      const w = (tower ? 1.9 : e.hero ? 1.5 : Math.max(0.8, e.r * 2.2)) * ppt, h = Math.max(4, (tower ? 0.34 : e.hero ? 0.22 : 0.17) * ppt);
      const y = Math.max(2, sy - h);
      if (e.blessed) { o2.fillStyle = GOLD; o2.strokeStyle = 'rgba(15,20,26,.9)'; o2.lineWidth = 1.5; const q = Math.max(3.5, ppt * 0.16), my = y - q - 2; o2.beginPath(); o2.moveTo(sx, my - q); o2.lineTo(sx + q, my); o2.lineTo(sx, my + q); o2.lineTo(sx - q, my); o2.closePath(); o2.fill(); o2.stroke(); }
      if (e.ench) { o2.fillStyle = RUNE_COLOR; o2.strokeStyle = 'rgba(15,20,26,.9)'; o2.lineWidth = 1.5; const q = Math.max(3, ppt * 0.13), mx = sx + (e.blessed ? q * 2.6 : 0), my = y - q - 2; o2.beginPath(); o2.moveTo(mx, my - q); o2.lineTo(mx + q, my); o2.lineTo(mx, my + q); o2.lineTo(mx - q, my); o2.closePath(); o2.fill(); o2.stroke(); }
      // Stufenschild in Teamfarbe: immer da; mit Balken (nach dem ersten Schaden) steht es links daneben
      if (!tower) {
        const q = Math.max(9, Math.round(ppt * 0.36)), two = e.lvl > 9, bw = two ? q * 1.45 : q, lx = bar ? sx - w / 2 - bw - 3 : sx - bw / 2, ly = bar ? y + h / 2 - q / 2 : y + h - q;
        const font = `800 ${Math.max(8, Math.round(q * 0.82))}px -apple-system, system-ui, "Segoe UI", sans-serif`;
        if (lvlFont !== font) { lvlFont = font; o2.font = font; } // Schrift nur setzen, wenn sie wechselt (Schwärme)
        o2.fillStyle = 'rgba(10,16,24,.9)'; o2.fillRect(lx - 1.5, ly - 1.5, bw + 3, q + 3);
        o2.fillStyle = TEAM[e.side].dark; o2.fillRect(lx, ly, bw, q);
        o2.fillStyle = '#fff'; o2.fillText(String(e.lvl), lx + bw / 2, ly + q / 2 + 0.5);
      }
      if (!bar) continue;
      const bx0 = sx - w / 2, rr = h * 0.45, T = TEAM[e.side];
      o2.fillStyle = e.hero ? GOLD : e.rune ? RUNE_COLOR : 'rgba(10,16,24,.9)'; o2.beginPath(); o2.roundRect(bx0 - 2, y - 2, w + 4, h + 4, rr + 2); o2.fill();
      o2.fillStyle = 'rgba(40,52,66,.95)'; o2.beginPath(); o2.roundRect(bx0, y, w, h, rr); o2.fill();
      const fw = w * Math.max(0, e.hp) / e.maxHp, lw = w * Math.max(0, Math.min(e.maxHp, inst.bar)) / e.maxHp;
      if (lw > fw + 0.5) { o2.fillStyle = '#ffffff'; o2.beginPath(); o2.roundRect(bx0, y, Math.max(rr, lw), h, rr); o2.fill(); }
      if (fw > 0.5) {
        o2.save(); o2.beginPath(); o2.roundRect(bx0, y, w, h, rr); o2.clip();
        const gr = o2.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, T.light); gr.addColorStop(0.45, T.main); gr.addColorStop(1, T.dark);
        o2.fillStyle = gr; o2.fillRect(bx0, y, fw, h);
        o2.fillStyle = 'rgba(255,255,255,.35)'; o2.fillRect(bx0, y + h * 0.12, fw, h * 0.22);
        o2.restore();
      }
      if (e.shield > 0) { o2.fillStyle = 'rgba(15,20,26,.9)'; o2.fillRect(sx - w / 2 - 1, y - h * 0.7 - 2, w + 2, h * 0.7 + 1); o2.fillStyle = '#dff3ff'; o2.fillRect(sx - w / 2, y - h * 0.7 - 1, w * e.shield / e.maxShield, h * 0.7 - 1); }
      if (tower) {
        lvlFont = ''; o2.font = `800 ${Math.max(10, Math.round(ppt * 0.5))}px -apple-system, system-ui, "Segoe UI", sans-serif`;
        o2.lineWidth = 3; o2.strokeStyle = 'rgba(15,20,26,.9)'; o2.strokeText(String(Math.ceil(e.hp)), sx, y + h / 2 + 0.5);
        o2.fillStyle = '#fff'; o2.fillText(String(Math.ceil(e.hp)), sx, y + h / 2 + 0.5);
        const bw = h * 1.25, bx = sx - w / 2 - bw - 4; // Turmstufe links neben dem Balken
        o2.fillStyle = 'rgba(15,20,26,.9)'; o2.fillRect(bx - 1.5, y - 1.5, bw + 3, h + 3); o2.fillStyle = TEAM[e.side].dark; o2.fillRect(bx, y, bw, h);
        o2.fillStyle = '#fff'; o2.fillText(String(e.lvl), bx + bw / 2, y + h / 2 + 0.5);
        if (e.main && !e.active) { o2.strokeText('z z', sx + w * 0.75, y + h / 2 + Math.sin(time * 2) * 2); o2.fillText('z z', sx + w * 0.75, y + h / 2 + Math.sin(time * 2) * 2); }
      }
    }
    if (label) {
      const [sx, sy] = project(label.x, 0.2, label.z);
      o2.font = '800 15px -apple-system, system-ui, "Segoe UI", sans-serif';
      o2.lineWidth = 4; o2.strokeStyle = 'rgba(15,20,26,.9)'; o2.strokeText(label.text, sx, Math.max(12, sy - 8));
      o2.fillStyle = '#fff'; o2.fillText(label.text, sx, Math.max(12, sy - 8));
    }
  }

  // Bild einer Einheit für die Karten: kleines eigenes Bühnenbild, mit demselben WebGL-Kontext gezeichnet
  const snapScene = new THREE.Scene();
  snapScene.add(new THREE.HemisphereLight('#ffffff', '#8a93a8', 2.4));
  const snapSun = new THREE.DirectionalLight('#fff4dc', 2.2); snapSun.position.set(-2, 5, 4); snapScene.add(snapSun);
  const snapCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  function snapshot(id, w, h) {
    const card = CARDS[id];
    if (card.type === 'spell') return null;
    const u = UNITS[card.unit], model = u.model || card.unit;
    if (!card.mix && hasPortrait(model)) return portrait(model, w, h, u.building || u.tower ? 1 : Math.min(card.count, 5));
    if (card.mix && card.mix.every(([m]) => hasPortrait(UNITS[m].model || m))) {   // gemischte Karte: alle Figuren neu -> Bild aus beiden
      const names = card.mix.flatMap(([m, k]) => Array(Math.min(k, 2)).fill(UNITS[m].model || m)).slice(0, 5);
      return portrait(names, w, h, names.length);
    }
    const def = getDef(model, 0);
    const solid = u.building || u.tower;
    const holder = new THREE.Group(), cel = !u.hero && !solid, stage = cel ? celScene : snapScene;
    const n = Math.min(card.count, 5);
    const mixed = card.mix ? card.mix.flatMap(([m, k]) => Array(Math.min(k, card.mix.length > 1 && card.count > 5 ? 2 : k)).fill(m)) : null; // vorn die Ersten der Liste
    const order = n === 3 ? [1, 2, 0] : n === 4 ? [2, 3, 0, 1] : n === 5 ? [3, 4, 0, 1, 2] : [0, 1];
    const spots = n === 1 ? [[0, 0]] : n === 2 ? [[-0.5, 0], [0.5, 0.15]] : n === 3 ? [[0, -0.4], [-0.55, 0.3], [0.55, 0.35]] : n === 4 ? [[-0.45, -0.35], [0.45, -0.3], [-0.5, 0.4], [0.45, 0.45]] : [[-0.7, -0.4], [0, -0.5], [0.7, -0.35], [-0.4, 0.4], [0.4, 0.45]];
    const sc = solid ? 1 : USCALE, tall = def.h * def.s * sc;
    const gap = Math.max(0.75, u.r * 2.3) * sc;
    spots.forEach(([x, z], i) => {
      const mu = mixed ? mixed[order.indexOf(i)] || mixed[mixed.length - 1] : card.unit, model = UNITS[mu].model || mu;
      const fake = { type: mu, model, side: 0, id: i + 1, kind: u.tower ? 'tower' : u.building ? 'building' : 'unit', x: x * gap, y: z * gap, _x: x * gap, _y: z * gap, r: u.r, hp: 1, anim: 0, cd: 0, inRange: false, deployT: 0, rootT: 0, active: true, vx: 0, vy: 0, targetId: 0, air: !!u.air, d: UNITS[mu] };
      const inst = makeInst(fake, true, cel ? 'card' : false); holder.add(inst.group);
      inst.yaw = 0.5; inst.age = 1;
      animate(fake, inst, 0.3 + i * 0.4, 0, { byId: new Map() }, false);
      if (u.air) inst.group.position.y = 0.3;
    });
    stage.add(holder);
    const asp = w / h;
    const half = n > 1 ? gap * (n > 4 ? 0.95 : 0.6) + 0.5 * sc : Math.max(u.r * 1.55, 0.55) * sc; // halbe Breite der Gruppe
    const span = Math.max((tall + (u.air ? 0.5 : 0)) * 0.6, half / asp * 1.08);
    Object.assign(snapCam, { left: -span * asp, right: span * asp, top: span, bottom: -span });
    snapCam.updateProjectionMatrix();
    const cy = tall * (u.air ? 0.2 : 0.42) + (u.air ? 0.3 : 0);
    snapCam.position.set(0, cy + 5, 9); snapCam.lookAt(0, cy - 0.12 * span, 0);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    shoot(stage, snapCam, w, h, out.getContext('2d'), 0, 0);
    stage.remove(holder);
    return out;
  }

  // Grafik-Einstellungen: Auflösung, Schatten, Bildschirmwackeln
  function setOptions(o) {
    opt.maxDpr = o.quality === 'niedrig' ? 1.5 : o.quality === 'mittel' ? 2 : 3;
    opt.shadows = o.quality !== 'niedrig'; opt.shake = o.shake !== false;
    if (o.fxRate != null) opt.fxRate = o.fxRate; // Zeitlupe der Effekte – nur für die Foto-Werkzeuge
    look.setQuality({ maxDpr: opt.maxDpr, samples: o.quality === 'niedrig' ? 0 : o.quality === 'mittel' ? 2 : 4, shadows: opt.shadows });
  }

  // Ort eines Feldpunkts auf dem Bildschirm (für Einblendungen über der Spielfläche)
  function toScreen(x, z, y = 1) { const [sx, sy] = project(x, y, z), r = canvas.getBoundingClientRect(); return { x: r.left + sx * r.width / width, y: r.top + sy * r.height / height }; }

  return { ready, look, sprites, fx: efx, insts, resize, reset, onEvent, draw, toField, toScreen, snapshot, prepare, setOptions, warmFigures: () => unitIndex().then(list => warmUnits(list, { force: true })),   // alle Bildfolgen für den Offline-Betrieb laden (rund 72 MB)
    sheet: (m, side) => getSheet(m, side).tex.image, three: true, info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }) };
}
