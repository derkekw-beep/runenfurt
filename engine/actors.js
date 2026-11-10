// Neue Türme, Geschosse und Ereignis-Effekte. Der Zeichner des Spiels (render3d.js) fragt hier zuerst an; was es hier
// (noch) nicht gibt, zeichnet er wie bisher.
import { THREE, TEAM, CARDS } from './deps.js';
import { propMaterial } from './meshes.js';
import { CELL } from './fx.js';
import { PROJECTILES, MELEE, HITS, EVENTS, SPELLS } from './registry.js';

// Türme (Modell im Spiel = Name des Modells aus Blender). Das bewegte Teil heißt immer 'crystal':
// bob = Schweben, spin = Drehung je Sekunde, pulse = Aufblähen beim Schuss, spark = Farbe der Funken beim Schuss (sonst Teamfarbe)
const TOWERS = { aussenturm: {}, hauptturm: {}, geschuetzturm: { bob: 0.012, spin: 0, pulse: 0.6, spark: '#ffb347' }, klingenturm: { bob: 0.05, spin: 3.2, pulse: 0.2 }, segensturm: { bob: 0.08, spin: 1.3, spark: '#ffe08a' } };
const BUILDINGS = { ballista: 'ballista' };                              // Gebäude mit drehbarem Oberteil (Teile: body, top, bolt)

export function createActors(look, fx) {
  let trauma = 0, flashV = 0;
  const ruins = [], ruinMat = propMaterial(-1);
  const ctx = side => ({ team: TEAM[side === 1 ? 1 : 0], shake: n => { trauma = Math.min(1, Math.max(trauma, n)); }, flash: n => { flashV = Math.max(flashV, n); }, slow() {} });

  // ---- Türme: Körper und schwebender Kristall, je Turm eigenes Material (blitzt einzeln auf) ----
  const hasTower = model => !!look.props && !!TOWERS[model] && !!look.props[model];
  function makeTower(e) {
    const model = e.model || e.type, P = look.props[model];
    const mat = propMaterial(e.side, 1), cmat = propMaterial(e.side, 1.6);
    const body = new THREE.Mesh(P.parts.body.geo, mat); body.castShadow = body.receiveShadow = true;
    const cr = new THREE.Mesh(P.parts.crystal.geo, cmat); cr.castShadow = true;
    const group = new THREE.Group(); group.position.set(e.x, 0, e.y); group.add(body, cr);
    const piv = P.parts.crystal.pivot; cr.position.set(piv[0], piv[1], piv[2]);
    look.world.add(group);
    return { neu: true, tower: true, model, cfg: TOWERS[model], group, body, cr, mat, cmat, cy: piv[1], def: { h: P.h, kind: 'tower' }, scale: 1, hp: e.hp, flash: 0, pulse: 0, punch: 0, wasAnim: 0, status: null, statusKey: '', extras: [] };
  }
  function updateTower(e, i, dt, time) {
    const T = i.cfg;
    i.cr.position.y = i.cy + Math.sin(time * 1.7 + e.id) * (T.bob ?? 0.09);
    i.cr.rotation.y += dt * ((T.spin ?? 0.9) + i.pulse * 9);
    if ((e.anim || 0) > i.wasAnim + 0.05) {   // Schuss: Kristall pulst, Funken
      i.pulse = 1;
      fx.burst({ x: e.x, y: i.cr.position.y, z: e.y, n: 6, cell: CELL.spark, color: '#ffffff', color2: T.spark || TEAM[e.side].light, hdr: 3, size: [0.1, 0.2], life: [0.2, 0.4], speed: [1.5, 3.5], up: [0.5, 2], drag: 3 });
    }
    i.wasAnim = e.anim || 0;
    i.pulse = Math.max(0, i.pulse - dt * 3.5);
    const k = 1 + i.pulse * (T.pulse ?? 0.28); i.cr.scale.set(k, k, k);
    i.cmat.userData.u.uGlow.value = e.active === false ? 0.3 : 1.5 + i.pulse * 5 + Math.sin(time * 3 + e.id) * 0.15;
    if (e.hp < i.hp - 0.5) { i.flash = 0.09; i.punch = 1; }
    i.hp = e.hp;
    if (i.flash > 0) i.flash -= dt;
    i.mat.userData.u.uFlash.value = i.flash > 0 ? 0.55 : 0;
    i.punch = Math.max(0, i.punch - dt * 7);
    const s = 1 + Math.sin(i.punch * Math.PI) * 0.035; i.group.scale.set(s, 1 - Math.sin(i.punch * Math.PI) * 0.03, s);
  }
  function removeTower(i) { look.world.remove(i.group); i.mat.dispose(); i.cmat.dispose(); }

  // ---- Gebäude: fester Sockel, Oberteil dreht sich zum Ziel, der Bolzen fehlt kurz nach dem Schuss ----
  const hasBuilding = model => !!look.props && !!BUILDINGS[model] && !!look.props[BUILDINGS[model]];
  function makeBuilding(e) {
    const model = e.model || e.type, P = look.props[BUILDINGS[model]], mat = propMaterial(e.side, 1);
    const group = new THREE.Group(); group.position.set(e.x, 0, e.y);
    const body = new THREE.Mesh(P.parts.body.geo, mat); body.castShadow = body.receiveShadow = true; group.add(body);
    const top = new THREE.Group(), piv = P.parts.top.pivot; top.position.set(piv[0], piv[1], piv[2]); group.add(top);
    const tm = new THREE.Mesh(P.parts.top.geo, mat); tm.castShadow = true; top.add(tm);
    let bolt = null;
    if (P.parts.bolt) { bolt = new THREE.Mesh(P.parts.bolt.geo, mat); bolt.castShadow = true; top.add(bolt); }
    look.world.add(group);
    return { neu: true, building: true, model, group, top, bolt, mat, def: { h: P.h, kind: 'building' }, scale: 1, hp: e.hp, flash: 0, age: 0, yaw: e.side === 0 ? Math.PI : 0, kick: 0, wasAnim: 0, status: null, statusKey: '', extras: [] };
  }
  function updateBuilding(e, i, g, dt, time) {
    i.age += dt;
    const t = e.targetId ? g.byId.get(e.targetId) : null;
    if (t) { const want = Math.atan2(t.x - e.x, t.y - e.y), d = Math.atan2(Math.sin(want - i.yaw), Math.cos(want - i.yaw)); i.yaw += d * Math.min(1, dt * 10); }
    if ((e.anim || 0) > i.wasAnim + 0.05) i.kick = 1;   // Schuss: Rückstoß
    i.wasAnim = e.anim || 0; i.kick = Math.max(0, i.kick - dt * 5);
    i.top.rotation.y = i.yaw; i.top.position.x = -Math.sin(i.yaw) * i.kick * 0.12; i.top.position.z = -Math.cos(i.yaw) * i.kick * 0.12;
    if (i.bolt) i.bolt.visible = !(e.cd > e.atk * 0.45);   // nachgeladen wird in der zweiten Hälfte der Pause
    const q = Math.min(1, i.age / 0.22), pop = q < 1 ? 0.5 + 0.5 * q + Math.sin(q * Math.PI) * 0.18 : 1;   // erscheint mit einem kleinen Sprung
    i.group.scale.set(pop, q < 1 ? pop : 1 + i.kick * 0.03, pop);
    if (e.hp < i.hp - 30) i.flash = 0.09;   // der stetige Verfall zählt nicht als Treffer
    i.hp = e.hp;
    if (i.flash > 0) i.flash -= dt;
    i.mat.userData.u.uFlash.value = i.flash > 0 ? 0.55 : 0;
  }
  function removeBuilding(i) { look.world.remove(i.group); i.mat.dispose(); }

  // ---- Geschosse ----
  const orbGeo = new THREE.SphereGeometry(1, 12, 8);
  const arrow = (() => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.74, 5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f1e4c0' }));
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.17, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#eef3f8' })); head.position.z = 0.44;
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.015, 0.16), new THREE.MeshBasicMaterial({ color: '#ffffff' })); fl.position.z = -0.32;
    const fl2 = fl.clone(); fl2.rotation.z = Math.PI / 2;
    g.add(shaft, head, fl, fl2);
    return g;
  })();
  const blade = (() => {   // Wurfstern: zwei gekreuzte Klingenpaare, dreht sich im Flug
    const g = new THREE.Group(), hell = new THREE.MeshBasicMaterial({ color: new THREE.Color('#f4f7fb').multiplyScalar(1.5) }), grau = new THREE.MeshBasicMaterial({ color: '#b9c3d0' });
    for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.13), hell); b.rotation.y = a; g.add(b); }
    for (const a of [Math.PI / 4, -Math.PI / 4]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.09), grau); b.rotation.y = a; g.add(b); }
    return g;
  })();
  const hasProj = p => !p.line && Object.hasOwn(PROJECTILES, p.from) && p.from !== '_';
  function makeProj(p) {
    const d = PROJECTILES[p.from];
    let m;
    if (d.kind === 'arrow' || d.kind === 'blade') { m = (d.kind === 'arrow' ? arrow : blade).clone(); if (d.scale) m.scale.setScalar(d.scale); }
    else {
      const c = new THREE.Color(d.color === 'team' ? TEAM[p.side].light : d.color || '#ffffff').multiplyScalar(d.kind === 'rock' ? 1 : 3.2);
      m = new THREE.Mesh(orbGeo, new THREE.MeshBasicMaterial({ color: c })); m.scale.setScalar(d.size || 0.18);
    }
    m.renderOrder = 5200; look.world.add(m);
    return { m, d, d0: Math.max(0.01, Math.hypot(p.tx - p.sx, p.ty - p.sy)), acc: 0, last: new THREE.Vector3(p.sx, d.y0, p.sy) };
  }
  const pv = new THREE.Vector3();
  function updateProj(p, o, a) {
    const x = p.ox + (p.x - p.ox) * a, z = p.oy + (p.y - p.oy) * a;
    const left = Math.hypot(p.tx - x, p.ty - z), u = Math.min(1, left / o.d0), ty = p.air ? 1.6 : 0.85;
    pv.set(x, ty + (o.d.y0 - ty) * u + Math.sin(u * Math.PI) * o.d.arc, z);
    if (o.d.kind === 'arrow') { o.m.position.copy(o.last); o.m.lookAt(pv); }
    else if (o.d.kind === 'blade') o.m.rotation.y += pv.distanceTo(o.last) * 7;
    o.m.position.copy(pv);
    o.acc += pv.distanceTo(o.last); o.last.copy(pv);
    while (o.acc > 0.16) {   // Spur
      o.acc -= 0.16;
      if (o.d.kind === 'arrow' || o.d.kind === 'blade') fx.burst({ x: pv.x, y: pv.y, z: pv.z, n: 1, cell: CELL.glow, color: '#ffffff', hdr: 1.1, alpha: 0.45, size: 0.16, size2: 0.02, life: 0.16 });
      else if (o.d.trail === 'smoke') fx.burst({ x: pv.x, y: pv.y, z: pv.z, n: 1, cell: CELL.smoke, add: 0, color: '#d5d8df', alpha: 0.5, size: [0.2, 0.28], size2: [0.45, 0.6], life: [0.3, 0.45], spread: 0.03 });
      else if (o.d.trail === 'fuse') fx.burst({ x: pv.x, y: pv.y + 0.12, z: pv.z, n: 1, cell: CELL.spark, color: '#fff1b8', color2: '#ff8a2a', hdr: 2.6, size: [0.07, 0.13], life: [0.15, 0.28], speed: [0.3, 1], up: [0.2, 1.2] });
      else fx.burst({ x: pv.x, y: pv.y, z: pv.z, n: 1, cell: CELL.glow, color: o.d.color === 'team' ? TEAM[p.side].light : o.d.color, color2: o.d.color === 'team' ? TEAM[p.side].main : o.d.glow || o.d.color, hdr: 2.6, size: (o.d.size || 0.18) * 3.2, size2: 0.05, life: [0.16, 0.26], spread: 0.03 });
    }
  }
  const removeProj = o => look.world.remove(o.m);

  // ---- Ereignisse der Spielregeln: liefert true, wenn hier ein neues Rezept gegriffen hat ----
  function sideOf(ev, g, projs) {
    for (const p of projs.keys()) if (p.from === ev.from && Math.hypot(p.tx - ev.x, p.ty - ev.y) < 1.2) return p.side;
    if (g) { let best = null, bd = 9; for (const e of g.ents) { if ((e.model || e.type) !== ev.from) continue; const d = Math.hypot(e.x - ev.x, e.y - ev.y); if (d < bd) { bd = d; best = e; } } if (best) return best.side; }
    return 0;
  }
  function onEvent(ev, g, projs) {
    const C = ctx(ev.side);
    if (ev.t === 'hit') {
      const known = Object.hasOwn(PROJECTILES, ev.from) && ev.from !== '_';
      if (!known && !MELEE[ev.from]) return false;
      if (ev.spin) { if (!MELEE[ev.from]) return false; HITS.spin(fx, ev, C); return true; }
      HITS[known ? PROJECTILES[ev.from].hit : MELEE[ev.from]](fx, ev, ctx(sideOf(ev, g, projs)));
      if (ev.heavy) { fx.ring({ x: ev.x, z: ev.y, r0: 0.3, r: 1.3, dur: 0.25, color: '#ffffff', hdr: 1.6 }); trauma = Math.max(trauma, 0.2); }
      if (ev.splash) fx.ring({ x: ev.x, z: ev.y, r0: ev.splash * 0.3, r: ev.splash, dur: 0.3, color: ev.frost ? '#bfeaff' : '#ffd27a', hdr: 1.6, width: 0.25 });
      return true;
    }
    if (ev.t === 'die') {
      if (ev.kind === 'tower') {
        EVENTS.die_tower(fx, ev, C);
        if (look.props) for (const [nm, dx, dz, s] of [['fels', 0, 0, 1.1], ['stein', 0.7, 0.3, 1.2], ['stein', -0.6, -0.4, 1.0], ['fels', -0.3, 0.6, 0.7]]) {
          const m = new THREE.Mesh(look.props[nm].parts.body.geo, ruinMat); m.position.set(ev.x + dx, 0, ev.y + dz); m.scale.setScalar(s * (ev.main ? 1.25 : 1)); m.rotation.y = dx * 5; m.castShadow = m.receiveShadow = true;
          look.world.add(m); ruins.push(m);
        }
      } else if (ev.kind === 'building') EVENTS.die_building(fx, ev, C); else EVENTS.die_unit(fx, ev, C);
      return true;
    }
    if (ev.t === 'deploy') { if (ev.rune || ev.hero || ev.echo) return false; EVENTS.deploy(fx, ev, C); return true; }
    if (ev.t === 'cast' && SPELLS[ev.spell]) { SPELLS[ev.spell].cast(fx, ev, C); return true; }
    if (ev.t === 'spell' && SPELLS[ev.spell]) { SPELLS[ev.spell].impact(fx, ev, C); return true; }
    if (ev.t === 'wake') { EVENTS.wake(fx, ev, C); return true; }
    if (ev.t === 'charge' || ev.t === 'impact' || ev.t === 'bolts') { EVENTS[ev.t](fx, ev, C); return true; }
    return false;
  }
  const land = e => { EVENTS.land(fx, { x: e._x, y: e._y, r: e.r }, ctx(e.side)); trauma = Math.max(trauma, e.r > 0.6 ? 0.22 : 0.08); };

  // Je Bild: Effekte weiterrechnen, Wackeln und Aufblitzen abklingen lassen. extra = Wackeln aus dem bisherigen Zeichner.
  function frame(dt, time, extra, on) {
    fx.update(dt, time);
    trauma = Math.max(0, trauma - dt * 1.5);
    const t = on ? Math.max(trauma, Math.min(1, extra || 0)) : 0, k = t * t * 0.55;
    look.update(dt, time, k > 0.0005 ? { x: Math.sin(time * 61) * k, y: Math.sin(time * 47 + 1.3) * k * 0.6, z: Math.sin(time * 53 + 2.1) * k } : null);
    flashV = Math.max(0, flashV - dt * 1.8); look.grade.uFlash.value = flashV * flashV * 2;
  }
  function reset() { for (const m of ruins) look.world.remove(m); ruins.length = 0; fx.clear(); trauma = flashV = 0; }

  return { hasTower, makeTower, updateTower, removeTower, hasBuilding, makeBuilding, updateBuilding, removeBuilding, hasProj, makeProj, updateProj, removeProj, onEvent, land, frame, reset, cardSpell: id => !!SPELLS[CARDS[id] && CARDS[id].spell] };
}
