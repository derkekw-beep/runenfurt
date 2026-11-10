// Heldenformen gewöhnlicher Karten – wie beim Vorbild: Steht eine Karte mit freigeschalteter Heldenform auf dem Heldenplatz
// oder dem freien Platz, kommt sie als Held aufs Feld und bringt eine Fähigkeit mit (Knopf über der Hand, kostet Kraft,
// einmal je Einsatz). Werte der Stufe 11 aus dem Wiki des Vorbilds (Seiten „<Karte>/Hero“, Stand 2026-11-10;
// `node tools/abgleich/helden.mjs` holt sie neu). Namen und Texte sind eigene.
// Der Spielkern (sim.js) ruft formUse, formTick, formWorld, formStrike, formHurt und formDeath an wenigen Stellen auf.
import { UNITS } from './cards.js';

const A = (id, name, cost, extra, desc) => ({ id, name, cost, cd: 999, once: true, form: true, delay: 0.93, ...extra, desc });
export const HERO_FORMS = {
  eisenwaechter:    { ability: A('schildruf', 'Schildruf', 2, { radius: 6.5, dur: 5, shield: 512 }, 'Hebt für fünf Sekunden einen Schild und ruft alle Gegner im Umkreis von 6,5 Feldern auf sich – Truppen wie Gebäude.') },
  steinhueter:      { ability: A('felswurf', 'Felswurf', 2, { radius: 2, far: 9, stun: 2, dmg: 135 }, 'Packt den zähesten Gegner in zwei Feldern Umkreis und schleudert ihn neun Felder quer übers Feld; er ist danach zwei Sekunden benommen.') },
  hammerschmied:    { ability: A('glutmahl', 'Glutmahl', 1, { heal: 0.3, bar: 22, perHit: 10, levels: [1, 2, 3, 5] }, 'Stärkt sich: heilt 30 % und steigt um Stufen auf – je länger er gewartet und je öfter er zugeschlagen hat, desto mehr (bis fünf).') },
  bolzenschuetzin:  { ability: A('bolzenstand', 'Bolzenstand', 3, { ahead: 3, unit: 'heldengeschuetz' }, 'Stellt drei Felder vor sich ein Schnellfeuergeschütz auf, das zehn Sekunden hält und beim Aufsetzen Schaden macht.') },
  funkenweberin:    { ability: A('funkenflug', 'Funkenflug', 2, { dur: 5, speed: 1.5, radius: 3, whirl: 2, dmg: 43, towerF: 0.36 }, 'Hebt für fünf Sekunden ab und fliegt schneller; jeder Feuerball hinterlässt einen Wirbel, der Gegner zur Mitte zieht und versengt.') },
  eisbrocken:       { ability: A('schneetreiben', 'Schneetreiben', 2, { radius: 4, pulses: 3, every: 1, dmg: 69, slow: 2 }, 'Drei Schneeböen im Umkreis von vier Feldern: jede schadet und bremst alle Gegner zwei Sekunden lang.') },
  wurzelwichte:     { ability: A('bannerruf', 'Bannerruf', 1, { banner: 5, unit: 'wicht', count: 2, back: 1, delay: 0 }, 'Fällt der letzte Wicht, bleibt fünf Sekunden ihr Banner stehen. In dieser Zeit ruft der Knopf zwei weitere Wichte dorthin.') },
  panzerhornisse:   { ability: A('stachelsprung', 'Stachelsprung', 2, { dmg: 399, towerF: 0.25, back: 3.5, delay: 1.5 }, 'Springt zum nächsten Gegner, wo immer er steht, und sticht hart zu. Fällt das Ziel oder vergehen 3,5 Sekunden, kehrt sie zurück.') },
  hohlstamm:        { ability: A('zweiterlauf', 'Zweiter Lauf', 1, { len: 3, w: 2.6, dmg: 116, heal: 0.5, delay: 0 }, 'Der Räuber rollt im Stamm noch einmal drei Felder vor, trifft alle Bodentruppen und heilt die Hälfte seiner Wunden.') },
  sternschuetzin:   { ability: A('sternentrug', 'Sternentrug', 2, { back: 3.5, unit: 'trugbildnis', shots: 3, dmg: 48, len: 13.5, w: 0.5, delay: 0 }, 'Springt 3,5 Felder zurück, lässt ein Trugbild stehen und schießt drei Pfeile, die alles in ihrer Bahn durchschlagen.') },
  donnerkaefer:     { ability: A('kieselspringer', 'Kieselspringer', 2, { radius: 6.5, unit: 'sargspringer', dmg: 263, towerF: 0.1, delay: 0 }, 'Ein Kiesel springt aus dem Korb auf den nächsten Bodengegner in 6,5 Feldern, schlägt beim Landen ein und kämpft weiter.') },
  distelritter:     { ability: A('absprung', 'Absprung', 3, { unit: 'sturmkeiler', dmg: 307, radius: 2, delay: 1 }, 'Springt vom Reittier und schlägt beim Aufprall ein. Das Tier stürmt allein auf Gebäude los; er kämpft zu Fuß weiter, ohne Anlauf.') },
  kegler:           { ability: A('standwurf', 'Standwurf', 2, { delay: 2.5, dur: 7.3, atk: 1.9, range: 11.5, dmg: 508, towerF: 0.5, splash: 2, proj: 5 }, 'Stellt sich fest hin und wirft 7,3 Sekunden lang schwere Brocken im hohen Bogen – bis zu 11,5 Felder weit.') },
  kieselhaufen:     { ability: A('grabmutter', 'Grabmutter', 5, { unit: 'grabmutter', delay: 1 }, 'Aus dem Haufen erhebt sich die Grabmutter: ein Koloss, der nur Gebäude angreift.') },
  wueterich:        { ability: A('baerenzorn', 'Bärenzorn', 3, { dur: 4, atk: 0.2, speed: 2.7, dmg: 167, towerF: 0.25, delay: 0 }, 'Vier Sekunden Raserei: rasend schnelle Hiebe, rasender Lauf – und sein Leben fällt in dieser Zeit nicht unter eins.') },
  klingentaenzerin: { ability: A('klingenwirbel', 'Klingenwirbel', 3, { dur: 3.5, every: 0.25, dmg: 97, radius: 2.5, towerF: 0.5, ward: 0.85, dash: 5.5, delay: 0 }, 'Wirbelt 3,5 Sekunden lang voran: trifft viermal je Sekunde alles um sich und nimmt dabei 15 % weniger Schaden.') },
};
export const HERO_FORM_IDS = Object.keys(HERO_FORMS);

// Was die Fähigkeiten aufs Feld bringen (gleiche Figuren wie verwandte Einheiten, bis sie eigene bekommen)
Object.assign(UNITS, {
  heldengeschuetz: { building: true, hp: 1536, life: 10, dmg: 140, atk: 0.5, range: 4.0, r: 0.5, hitsAir: true, proj: 16, deployDmg: { dmg: 204, r: 1.5 }, model: 'ballista' },
  sargspringer:    { hp: 473, dmg: 204, atk: 1.1, range: 0.5, speed: 2.4, r: 0.5, mass: 1, first: 0.5, model: 'kiesel' },
  sturmkeiler:     { hp: 1356, dmg: 179, atk: 1.6, range: 0.8, speed: 1.2, r: 0.75, mass: 10, targets: 'buildings', charge: { after: 2.5, speed: 2, dmg: 2 }, first: 0.5, model: 'keiler' },
  grabmutter:      { hp: 4224, dmg: 422, atk: 1.5, range: 1.2, speed: 0.9, r: 0.75, mass: 18, sight: 7, targets: 'buildings', first: 0.5, model: 'wurzelmutter' },
  trugbildnis:     { hp: 271, life: 7, r: 0.6, mass: 3, speed: 0, model: 'sternschuetzin' },
});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fwd = side => (side === 0 ? -1 : 1);
const foes = (g, u) => g.ents.filter(e => e.side !== u.side && e.hp > 0 && !e.hidden);
const near = (g, u, pred) => { let best = null, bd = Infinity; for (const e of foes(g, u)) { if (pred && !pred(e)) continue; const d = Math.hypot(e.x - u.x, e.y - u.y); if (d < bd) { bd = d; best = e; } } return best; };

// Knopf gedrückt: die meisten Fähigkeiten wirken nach einem kurzen Ausholen (delay); bis dahin muss der Held leben
export function formUse(api, g, side, h, a) {
  if (a.delay > 0) { h.castT = a.delay; h.castA = a; } else fire(api, g, h, a);
}

function fire(api, g, h, a) {
  const m = api.cardMult(h.lvl), side = h.side, f = fwd(side);
  const ev = { t: 'ability', id: a.id, side, x: h.x, y: h.y, hits: [] };
  switch (a.id) {
    case 'schildruf': {
      h.shield = h.maxShield = Math.round(a.shield * m); h.formMode = 'schild'; h.formT = a.dur;
      for (const e of foes(g, h)) if (e.dmg && Math.hypot(e.x - h.x, e.y - h.y) - e.r <= a.radius && !(h.air && !e.hitsAir)) { e.tauntId = h.id; e.tauntT = a.dur; e.targetId = h.id; ev.hits.push({ x: e.x, y: e.y }); }
      break;
    }
    case 'felswurf': {
      let v = null;
      for (const e of foes(g, h)) if (e.kind === 'unit' && Math.hypot(e.x - h.x, e.y - h.y) - e.r <= a.radius + h.r && (!v || e.hp > v.hp)) v = e;
      if (!v) { h.abilityUsed = false; h.abilityCd = 0; g.sides[side].kraft = Math.min(10, g.sides[side].kraft + a.cost); return; } // niemand da: Kraft zurück
      v.x = clamp(v.x + (v.x < api.W / 2 ? a.far : -a.far), 0.5, api.W - 0.5); v.y = v.air ? v.y : api.offRiver(v.y); v.ox = v.x; v.oy = v.y; v.rt = null; v.targetId = 0; v.inRange = false;
      api.stun(v, a.stun); api.damage(g, v, Math.round(a.dmg * m), side, h);
      ev.hits.push({ x: v.x, y: v.y, air: v.air });
      break;
    }
    case 'glutmahl': {
      const bars = Math.min(3, Math.floor((h.pan || 0) / a.bar)), up = a.levels[bars], k = Math.pow(1.1, up);
      h.lvl += up; h.maxHp = Math.round(h.maxHp * k); h.dmg = Math.round(h.dmg * k);
      h.hp = Math.min(h.maxHp, Math.round(h.hp * k + h.maxHp * a.heal)); h.pan = 0; ev.up = up;
      break;
    }
    case 'bolzenstand':
      api.spawn(g, a.unit, side, clamp(h.x, 1, api.W - 1), api.offRiver(clamp(h.y + f * a.ahead, 1, api.H - 1)), { deployT: 1 }, h.lvl);
      break;
    case 'funkenflug': h.formMode = 'flug'; h.formT = a.dur; h.air0 = h.air; h.air = true; h.speed0 = h.speed; h.speed *= a.speed; h.rt = null; break;
    case 'schneetreiben': h.pulseN = a.pulses; h.pulseT = 0; h.pulseA = a; break;
    case 'stachelsprung': {
      const t = near(g, h);
      if (!t) break;
      h.warp = { x: h.x, y: h.y, t: a.back, id: t.id };
      const d = Math.hypot(t.x - h.x, t.y - h.y) || 1, gap = t.r + h.r + 0.2;
      h.x = t.x - (t.x - h.x) / d * gap; h.y = t.y - (t.y - h.y) / d * gap; h.ox = h.x; h.oy = h.y; h.targetId = t.id; h.rt = null;
      api.damage(g, t, Math.round(a.dmg * m * (t.kind === 'tower' ? a.towerF : 1)), side, h);
      ev.hits.push({ x: t.x, y: t.y, air: t.air });
      break;
    }
    case 'zweiterlauf': {
      const y1 = clamp(h.y + f * a.len, 0.5, api.H - 0.5);
      for (const e of foes(g, h)) if (!e.air && Math.abs(e.x - h.x) <= a.w / 2 + e.r && (e.y - h.y) * f >= -e.r && (e.y - y1) * f <= e.r) { api.damage(g, e, Math.round(a.dmg * m * (e.kind === 'tower' ? 0.25 : 1)), side, h); ev.hits.push({ x: e.x, y: e.y }); }
      h.y = api.offRiver(y1); h.oy = h.y; h.rt = null; h.hp = Math.min(h.maxHp, Math.round(h.hp + (h.maxHp - h.hp) * a.heal)); ev.tx = h.x; ev.ty = h.y;
      break;
    }
    case 'sternentrug': {
      const x0 = h.x, y0 = h.y, t = g.byId.get(h.targetId) || near(g, h);
      api.spawn(g, a.unit, side, x0, y0, { deployT: 0, clone: true }, h.lvl);
      h.y = api.offRiver(clamp(h.y - f * a.back, 0.5, api.H - 0.5)); h.oy = h.y; h.rt = null;
      // drei Pfeile in einem schmalen Fächer auf das Ziel (ohne Ziel geradeaus)
      const base = t ? Math.atan2(t.y - h.y, t.x - h.x) : Math.atan2(f, 0);
      for (let i = 0; i < a.shots; i++) {
        const w = base + (i - (a.shots - 1) / 2) * 0.16, dx = Math.cos(w), dy = Math.sin(w);
        for (const e of foes(g, h)) { const rx = e.x - h.x, ry = e.y - h.y, along = rx * dx + ry * dy, across = Math.abs(rx * dy - ry * dx); if (along >= 0 && along <= a.len && across <= a.w / 2 + e.r) api.damage(g, e, Math.round(a.dmg * m * (e.kind === 'tower' ? 0.25 : 1)), side, h); }
        ev.hits.push({ x: h.x + dx * a.len, y: h.y + dy * a.len, air: true });
      }
      break;
    }
    case 'kieselspringer': {
      const t = near(g, h, e => !e.air && e.kind === 'unit' && Math.hypot(e.x - h.x, e.y - h.y) <= a.radius) || near(g, h, e => !e.air && Math.hypot(e.x - h.x, e.y - h.y) <= a.radius);
      const x = t ? t.x : h.x, y = t ? t.y : h.y;
      api.areaDamage(g, side, x, y, 1.2, Math.round(a.dmg * m), false, a.towerF);
      api.spawn(g, a.unit, side, clamp(x, 0.5, api.W - 0.5), api.offRiver(clamp(y + f * -0.3, 0.5, api.H - 0.5)), { deployT: 0.3 }, h.lvl);
      ev.hits.push({ x, y });
      break;
    }
    case 'absprung':
      api.areaDamage(g, side, h.x, h.y, a.radius, Math.round(a.dmg * m), false, 0);
      api.spawn(g, a.unit, side, clamp(h.x + 0.9, 0.5, api.W - 0.5), h.y, { deployT: 0.3 }, h.lvl);
      h.onFoot = true; h.charging = false; h.runT = 0;
      break;
    case 'standwurf': h.formMode = 'wurf'; h.formT = a.dur; h.keep = { speed: h.speed, range: h.range, atk: h.atk, dmg: h.dmg, sight: h.sight }; h.speed = 0; h.range = a.range; h.sight = a.range; h.atk = a.atk; h.dmg = Math.round(a.dmg * m); h.cd = a.atk; h.inRange = false; h.targetId = 0; h.rt = null; break;
    case 'grabmutter': api.spawn(g, a.unit, side, clamp(h.x, 1, api.W - 1), api.offRiver(clamp(h.y + f * 1.2, 1, api.H - 1)), { deployT: 1 }, h.lvl); break;
    case 'baerenzorn': h.formMode = 'baer'; h.formT = a.dur; h.keep = { speed: h.speed, atk: h.atk, dmg: h.dmg }; h.speed = a.speed; h.atk = a.atk; h.dmg = Math.round(a.dmg * m); h.cd = Math.min(h.cd, a.atk); break;
    case 'klingenwirbel': h.formMode = 'wirbel'; h.formT = a.dur; h.spinT = 0; h.keep = { speed: h.speed }; h.speed = Math.max(h.speed, a.dash / a.dur); h.spinA = a; break;
    default: return;
  }
  api.emit(g, ev);
}

// Je Takt für jede Figur in Heldenform: Ausholen, laufende Wirkungen, deren Ende
export function formTick(api, g, u, dt) {
  if (u.pan != null || u.formId === 'hammerschmied') u.pan = Math.min(66, (u.pan || 0) + dt); // die Uhr des Glutmahls
  if (u.castT > 0) { u.castT -= dt; if (u.castT <= 0) fire(api, g, u, u.castA); }
  if (u.pulseN > 0) { // Schneetreiben
    u.pulseT -= dt;
    if (u.pulseT <= 0) { const a = u.pulseA; u.pulseN--; u.pulseT = a.every; api.areaDamage(g, u.side, u.x, u.y, a.radius, Math.round(a.dmg * api.cardMult(u.lvl)), true, 0.25, a.slow); api.emit(g, { t: 'burst', side: u.side, x: u.x, y: u.y, r: a.radius, frost: true }); }
  }
  if (u.warp) { // Stachelsprung: zurück, wenn das Ziel fällt oder die Zeit um ist
    u.warp.t -= dt; const t = g.byId.get(u.warp.id);
    if (u.warp.t <= 0 || !t || t.hp <= 0) { u.x = u.warp.x; u.y = u.warp.y; u.ox = u.x; u.oy = u.y; u.warp = null; u.targetId = 0; u.inRange = false; u.rt = null; }
  }
  if (!u.formMode) return;
  if (u.formMode === 'wirbel') { // Klingenwirbel: trifft in festem Takt alles um sie herum
    u.spinT -= dt;
    if (u.spinT <= 0) { const a = u.spinA; u.spinT = a.every; api.areaDamage(g, u.side, u.x, u.y, a.radius, Math.round(a.dmg * api.cardMult(u.lvl)), false, a.towerF); u.anim = 0.2; api.emit(g, { t: 'hit', from: u.model, x: u.x, y: u.y, spin: a.radius }); }
  }
  u.formT -= dt;
  if (u.formT > 0) return;
  if (u.formMode === 'schild') { u.shield = 0; u.maxShield = 0; }
  if (u.formMode === 'flug') { u.air = !!u.air0; u.speed = u.speed0; u.y = u.air ? u.y : api.offRiver(u.y); u.rt = null; }
  if (u.keep) { Object.assign(u, u.keep); u.keep = null; u.inRange = false; }
  u.formMode = '';
}

// Einmal je Takt für das ganze Feld: Feuerwirbel des Funkenflugs und die Banner der Wichte
export function formWorld(api, g, dt) {
  if (g.whirls && g.whirls.length) {
    for (const w of g.whirls) {
      w.t -= dt; w.tick -= dt;
      const hit = w.tick <= 0; if (hit) w.tick = 0.5;
      for (const e of g.ents) {
        if (e.side === w.side || e.hp <= 0 || e.hidden) continue;
        const dx = w.x - e.x, dy = w.y - e.y, d = Math.hypot(dx, dy);
        if (d > w.r + e.r) continue;
        if (e.kind === 'unit' && d > 0.15) { const s = Math.min(d, 2.5 * dt * 6 / Math.max(3, e.d.mass || 3)); e.x += dx / d * s; e.y += dy / d * s; } // leichte Figuren zieht es schneller zur Mitte
        if (hit) api.damage(g, e, Math.round(w.dmg * (e.kind === 'tower' ? w.towerF : 1)), w.side);
      }
    }
    g.whirls = g.whirls.filter(w => w.t > 0);
  }
  if (g.banners && g.banners.length) { for (const b of g.banners) b.t -= dt; g.banners = g.banners.filter(b => b.t > 0 && !b.used); }
}

// Standwurf: statt der rollenden Kugel fliegt ein schwerer Brocken im hohen Bogen auf die Stelle des Ziels (trifft nur den Boden)
export function formShot(api, g, u, t) {
  if (u.formMode !== 'wurf') return false;
  const a = HERO_FORMS.kegler.ability;
  g.projs.push({ x: u.x, y: u.y, ox: u.x, oy: u.y, sx: u.x, sy: u.y, tx: t.x, ty: t.y, targetId: 0, speed: a.proj, dmg: u.dmg, splash: a.splash, slow: 0, stun: 0, root: 0, curse: null, burst: null,
    side: u.side, hitsAir: false, from: u.model, rune: false, air: true, towerF: a.towerF, srcId: u.id });
  api.emit(g, { t: 'shoot', from: u.model, side: u.side, x: u.x, y: u.y });
  return true;
}
// Nach jedem eigenen Schlag einer Figur in Heldenform
export function formStrike(api, g, u, t) {
  if (u.formId === 'hammerschmied') u.pan = Math.min(66, (u.pan || 0) + HERO_FORMS.hammerschmied.ability.perHit);
  if (u.formMode === 'flug' && t) { const a = HERO_FORMS.funkenweberin.ability; (g.whirls ||= []).push({ side: u.side, x: t.x, y: t.y, r: a.radius, t: a.whirl, tick: 0.25, dmg: Math.round(a.dmg * api.cardMult(u.lvl)), towerF: a.towerF }); api.emit(g, { t: 'cast', spell: 'wirbelwind', side: u.side, x: t.x, y: t.y, r: a.radius, delay: 0 }); }
}
// Faktor auf den Schaden eines Schlags gegen ein Ziel (Türme nehmen von manchen Fähigkeiten weniger)
export const formTowerF = u => (u.formMode === 'baer' ? HERO_FORMS.wueterich.ability.towerF : 1);
// Schaden, den eine Figur in Heldenform nimmt: der Klingenwirbel schützt etwas; im Bärenzorn fällt das Leben nicht unter eins
export function formHurt(e, amount) { return e.formMode === 'wirbel' ? Math.round(amount * e.spinA.ward) : amount; }
export const formFloor = e => (e.formMode === 'baer' ? 1 : 0);

// Stirbt eine Figur in Heldenform: fällt der letzte Wicht des Trupps, bleibt ihr Banner stehen
export function formDeath(api, g, e) {
  if (e.castT > 0 && e.castA) { const S = g.sides[e.side]; S.kraft = Math.min(10, S.kraft + e.castA.cost); e.castT = 0; } // fällt er beim Ausholen, kommt die Kraft zurück
  if (e.formId !== 'wurzelwichte') return;
  if (g.ents.some(o => o !== e && o.hp > 0 && o.formGroup === e.formGroup)) return;
  (g.banners ||= []).push({ side: e.side, x: e.x, y: e.y, t: HERO_FORMS.wurzelwichte.ability.banner, lvl: e.lvl, used: false });
  api.emit(g, { t: 'banner', side: e.side, x: e.x, y: e.y });
}
// Bannerruf: zwei Wichte ein Feld hinter dem Banner
export function bannerUse(api, g, side) {
  const b = (g.banners || []).find(o => o.side === side && o.t > 0 && !o.used), a = HERO_FORMS.wurzelwichte.ability;
  if (!b) return false;
  b.used = true;
  for (let i = 0; i < a.count; i++) api.spawn(g, a.unit, side, clamp(b.x + (i - (a.count - 1) / 2) * 1.0, 0.5, api.W - 0.5), api.offRiver(clamp(b.y - fwd(side) * a.back, 0.5, api.H - 0.5)), { deployT: 1 }, b.lvl);
  api.emit(g, { t: 'ability', id: a.id, side, x: b.x, y: b.y, hits: [] });
  return true;
}
