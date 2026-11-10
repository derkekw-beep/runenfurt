// Spiel-Logik von Runenfurt: reine Simulation ohne Browser-Abhängigkeiten (läuft auch unter node --test).
// Seite 0 spielt von unten (großes y), Seite 1 von oben. Fester Zeitschritt DT.
import { UNITS, CARDS, RUNES, TOWER_SPELL_FACTOR, HASTE, SLOW_FACTOR, sanitizeDeck } from './cards.js';

export const W = 18, H = 28;
export const RIVER_TOP = 13, RIVER_BOT = 15;
export const BRIDGES = [3.5, 14.5];
export const BRIDGE_HALF = 1.3;
export const DT = 1 / 30;
export const MAX_KRAFT = 10;
export const KRAFT_RATE = 1 / 2.8;
const SIGHT = 5.5;
const POCKET = 9.5; // so weit darf man nach einem gefallenen Außenturm ins gegnerische Feld setzen (gespiegelt: y >= POCKET)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function rnd(g) { // mulberry32
  let t = (g.seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function emit(g, e) { if (g.events.length < 400) g.events.push(e); }

export const cardMult = lvl => Math.pow(1.1, (lvl || 1) - 1);  // Karten: +10 % Leben und Schaden je Stufe
export const towerMult = lvl => Math.pow(1.08, (lvl || 1) - 1); // Türme: +8 % je Stufe

function spawn(g, type, side, x, y, extra, lvl = 1) {
  const d = UNITS[type];
  const m = d.tower ? towerMult(lvl) : cardMult(lvl);
  const e = {
    id: g.nextId++, type, model: d.model || type, d, side, x, y, ox: x, oy: y,
    kind: d.tower ? 'tower' : d.building ? 'building' : 'unit',
    rune: !!d.rune, hero: !!d.hero,
    lvl, hp: Math.round(d.hp * m), maxHp: Math.round(d.hp * m), r: d.r, air: !!d.air, hitsAir: !!d.hitsAir,
    dmg: Math.round((d.dmg || 0) * m), atk: d.atk || 1, range: d.range || 0, speed: d.speed || 0,
    proj: d.proj || 0, splash: d.splash || 0, targets: d.targets || 'all',
    main: !!d.main, active: !d.main, life: d.life || 0,
    spawnT: d.spawn ? d.spawn.first : 0,
    cd: 0, scan: 0, targetId: 0, inRange: false, deployT: 0,
    rootT: 0, stunT: 0, slowT: 0, hasteT: 0, runT: 0, charging: false, stacks: 0, abilityCd: 0,
    face: side === 0 ? -1 : 1, anim: 0, vx: 0, vy: 0,
    ...extra,
  };
  g.ents.push(e);
  g.byId.set(e.id, e);
  return e;
}

// levels[s] = { cards: { kartenId: Stufe }, tower: Stufe, runes: [kartenIds mit Runenform] } – fehlt etwas, gilt Stufe 1
export function createGame({ decks, levels, seed = 1, duration = 180, overtime = 120 } = {}) {
  const g = {
    seed: seed >>> 0, time: 0, duration, overtime, phase: 'main', over: false, winner: null,
    ents: [], projs: [], zones: [], events: [], dead: [], byId: new Map(), nextId: 1, sides: [],
  };
  for (let s = 0; s < 2; s++) {
    const deck = sanitizeDeck(decks && decks[s]);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd(g) * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const lv = (levels && levels[s]) || {};
    g.sides.push({
      levels: lv.cards || {}, tower: lv.tower || 1, runes: new Set(lv.runes || []), cycle: {}, away: [],
      kraft: 5, hand: deck.splice(0, 4), next: deck.shift(), queue: deck, crowns: 0, spent: 0,
    });
    const my = y => (s === 0 ? H - y : y);
    spawn(g, 'aussenturm', s, 3.5, my(6), { lane: 0 }, lv.tower);
    spawn(g, 'aussenturm', s, 14.5, my(6), { lane: 1 }, lv.tower);
    spawn(g, 'hauptturm', s, 9, my(2.5), { lane: -1 }, lv.tower);
  }
  return g;
}

export const towersOf = (g, side) => g.ents.filter(e => e.kind === 'tower' && e.side === side && e.hp > 0);
export const outerTower = (g, side, lane) => g.ents.find(e => e.kind === 'tower' && e.side === side && e.lane === lane && e.hp > 0) || null;
export const mainTower = (g, side) => g.ents.find(e => e.main && e.side === side) || null;
// doppelt in der letzten Minute und in der Verlängerung, dreifach in deren letzter Minute
export const kraftRate = g => KRAFT_RATE * (g.time >= g.duration + g.overtime - 60 && g.phase !== 'main' ? 3 : g.phase === 'over' || g.time >= g.duration - 60 ? 2 : 1);
export const timeLeft = g => (g.phase === 'main' ? g.duration - g.time : g.duration + g.overtime - g.time);

// ---- Karten ausspielen -------------------------------------------------------------------------

// Nächster erlaubter Punkt für eine Karte. Zauber dürfen überallhin, Truppen/Gebäude nur aufs eigene Feld
// (plus die Tasche hinter einem zerstörten gegnerischen Außenturm).
export function clampDeploy(g, side, cardId, x, y) {
  x = clamp(x, 0.6, W - 0.6);
  if (CARDS[cardId].type === 'spell') return { x, y: clamp(y, 0.6, H - 0.6) };
  let m = side === 0 ? y : H - y; // gespiegelt: eigenes Feld ist m > RIVER_BOT
  const lane = x < W / 2 ? 0 : 1;
  const pocket = !outerTower(g, 1 - side, lane);
  const minM = pocket ? POCKET : RIVER_BOT + 0.4;
  m = clamp(m, minM, H - 0.6);
  if (m > RIVER_TOP - 0.4 && m < RIVER_BOT + 0.4) m = m < (RIVER_TOP + RIVER_BOT) / 2 ? RIVER_TOP - 0.4 : RIVER_BOT + 0.4;
  return { x, y: side === 0 ? m : H - m };
}

export function canDeploy(g, side, cardId, x, y) {
  const p = clampDeploy(g, side, cardId, x, y);
  return Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6;
}

const FORMATION = {
  1: [[0, 0]],
  2: [[-0.55, 0], [0.55, 0]],
  3: [[0, -0.5], [-0.6, 0.4], [0.6, 0.4]],
  4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
};
// Aufstellung für n Einheiten: kleine Gruppen fest, große als Spirale
export function formation(n) {
  if (FORMATION[n]) return FORMATION[n];
  const out = [];
  for (let i = 0; i < n; i++) { const a = i * 2.39996, r = 0.42 * Math.sqrt(i); out.push([Math.cos(a) * r, Math.sin(a) * r]); }
  return out;
}

// Ist die nächste Ausspielung dieser Karte die Runenform?
export function runeReady(g, side, id) {
  const S = g.sides[side];
  return !!(RUNES[id] && S.runes.has(id) && (S.cycle[id] || 0) >= RUNES[id].cycles);
}

// Spielt die Handkarte handIdx an (x, y). Gibt true zurück, wenn die Karte gespielt wurde.
export function playCard(g, side, handIdx, x, y) {
  const S = g.sides[side];
  const id = S.hand[handIdx];
  const c = id && CARDS[id];
  if (g.over || !c || S.kraft < c.cost || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (!canDeploy(g, side, id, x, y)) return false;
  const lvl = S.levels[id] || 1;
  const R = runeReady(g, side, id) ? RUNES[id] : null;
  if (S.runes.has(id) && RUNES[id]) S.cycle[id] = R ? 0 : (S.cycle[id] || 0) + 1;
  S.kraft -= c.cost;
  S.spent += c.cost;
  if (c.hero) S.away.push(id); else S.queue.push(id); // ein Held kommt erst zurück in den Stapel, wenn er gefallen ist
  S.hand[handIdx] = S.next;
  S.next = S.queue.shift();
  if (c.type === 'spell') {
    g.zones.push({ spell: c.spell, card: id, side, x, y, r: c.radius, delay: c.delay, dur: c.dur || 0, tickT: c.dot ? c.tick : 0, done: false, mult: cardMult(lvl) });
    emit(g, { t: 'cast', spell: c.spell, side, x, y, r: c.radius, delay: c.delay });
  } else {
    for (const [dx, dy] of formation((R && R.count) || c.count)) {
      spawn(g, R ? R.unit : c.unit, side, clamp(x + dx, 0.4, W - 0.4), clamp(y + dy, 0.4, H - 0.4), { deployT: 1, cardId: c.hero ? id : '' }, lvl);
    }
    emit(g, { t: 'deploy', side, x, y, card: id, rune: !!R, hero: !!c.hero });
  }
  return true;
}

// ---- Helden ------------------------------------------------------------------------------------

export const heroOf = (g, side, cardId) => g.ents.find(e => e.side === side && e.cardId === cardId && e.hp > 0) || null;

// Zustand der Heldenfähigkeiten einer Seite (für Knöpfe und Computergegner)
export function abilities(g, side) {
  const S = g.sides[side], out = [];
  for (const e of g.ents) {
    if (e.side !== side || !e.cardId || e.hp <= 0) continue;
    const a = CARDS[e.cardId].ability;
    out.push({ cardId: e.cardId, ent: e, ability: a, cd: Math.max(0, e.abilityCd), ready: e.deployT <= 0 && e.abilityCd <= 0 && e.stunT <= 0 && S.kraft >= a.cost });
  }
  return out;
}

export function useAbility(g, side, cardId) {
  const st = abilities(g, side).find(s => s.cardId === cardId);
  if (g.over || !st || !st.ready) return false;
  const S = g.sides[side], h = st.ent, a = st.ability, m = cardMult(h.lvl);
  S.kraft -= a.cost; S.spent += a.cost;
  h.abilityCd = a.cd; h.anim = 0.3;
  const hits = [];
  if (a.id === 'schlachtruf') {
    for (const e of g.ents) if (e.side === side && e.kind === 'unit' && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= a.radius) { e.hasteT = a.dur; hits.push({ x: e.x, y: e.y }); }
  } else if (a.id === 'blitzkette') {
    const foes = g.ents.filter(e => e.side !== side && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) - e.r <= a.radius)
      .sort((p, q) => Math.hypot(p.x - h.x, p.y - h.y) - Math.hypot(q.x - h.x, q.y - h.y)).slice(0, a.count);
    for (const e of foes) {
      hits.push({ x: e.x, y: e.y, air: e.air });
      if (e.kind !== 'tower') stun(e, a.stun);
      damage(g, e, Math.round(a.dmg * m * (e.kind === 'tower' ? TOWER_SPELL_FACTOR : 1)), side);
    }
  }
  emit(g, { t: 'ability', id: a.id, side, x: h.x, y: h.y, r: a.radius, hits });
  return true;
}

// ---- Schaden -----------------------------------------------------------------------------------

function stun(e, t) { e.stunT = Math.max(e.stunT, t); e.inRange = false; e.runT = 0; e.charging = false; }

function die(g, e) {
  e.hp = 0;
  emit(g, { t: 'die', kind: e.kind, type: e.type, model: e.model, side: e.side, x: e.x, y: e.y, air: e.air, main: e.main });
  g.dead.push(e);
}

function damage(g, e, amount, bySide) {
  if (e.hp <= 0 || g.over) return;
  if (e.d.guard && !e.inRange) amount *= e.d.guard;
  e.hp -= amount;
  if (e.main && !e.active) { e.active = true; e.cd = 3.5; emit(g, { t: 'wake', side: e.side, x: e.x, y: e.y }); }
  if (e.hp > 0) return;
  die(g, e);
  if (e.kind !== 'tower') return;
  const foe = g.sides[1 - e.side];
  if (e.main) { foe.crowns = 3; finish(g, 1 - e.side); return; }
  foe.crowns = Math.min(3, foe.crowns + 1);
  const mt = mainTower(g, e.side);
  if (mt && !mt.active) { mt.active = true; mt.cd = 3.5; emit(g, { t: 'wake', side: mt.side, x: mt.x, y: mt.y }); }
  if (g.phase === 'over') finish(g, bySide ?? 1 - e.side);
}

// Nachwirkungen des Todes: Splitter, Bruchstücke, Held zurück in den Kartenstapel
function processDeaths(g) {
  while (g.dead.length) {
    const e = g.dead.shift(), d = e.d;
    if (e.cardId) { const S = g.sides[e.side], i = S.away.indexOf(e.cardId); if (i >= 0) { S.away.splice(i, 1); S.queue.push(e.cardId); } }
    if (g.over) continue;
    if (d.deathDmg && !e.spent) {
      emit(g, { t: 'burst', x: e.x, y: e.y, r: d.deathDmg.r, side: e.side });
      areaDamage(g, e.side, e.x, e.y, d.deathDmg.r, Math.round(d.deathDmg.dmg * cardMult(e.lvl)), false);
    }
    if (d.deathSpawn) for (let i = 0; i < d.deathSpawn.count; i++) {
      const a = (i / d.deathSpawn.count) * Math.PI * 2 + 0.5;
      spawn(g, d.deathSpawn.unit, e.side, clamp(e.x + Math.cos(a) * 0.6, 0.4, W - 0.4), clamp(e.y + Math.sin(a) * 0.6, 0.4, H - 0.4), { deployT: 0.5 }, e.lvl);
    }
  }
}

function finish(g, winner) {
  if (g.over) return;
  g.over = true;
  g.winner = winner;
  g.phase = 'end';
  emit(g, { t: 'end', winner });
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const edgeDist = (a, b) => dist(a, b) - a.r - b.r;

function canHit(u, e) {
  if (e.side === u.side || e.hp <= 0) return false;
  if (e.air && !u.hitsAir) return false;
  if (u.targets === 'buildings' && e.kind === 'unit') return false;
  return true;
}

function areaDamage(g, side, x, y, radius, dmg, hitsAir, towerFactor = 1, slow = 0) {
  for (const e of g.ents) {
    if (e.side === side || e.hp <= 0 || (e.air && !hitsAir)) continue;
    if (Math.hypot(e.x - x, e.y - y) > radius + e.r * 0.6) continue;
    if (slow && e.kind === 'unit') e.slowT = Math.max(e.slowT, slow);
    damage(g, e, e.kind === 'tower' ? dmg * towerFactor : dmg, side);
  }
}

function shoot(g, u, t, dmg) {
  g.projs.push({ x: u.x, y: u.y, ox: u.x, oy: u.y, tx: t.x, ty: t.y, targetId: t.id, speed: u.proj, dmg, splash: u.splash, slow: u.d.slow || 0, side: u.side, hitsAir: u.hitsAir, from: u.model, rune: u.rune, air: u.air || t.air });
}

function strike(g, u, t) {
  const d = u.d;
  u.anim = 0.3;
  let dmg = u.dmg;
  if (u.charging) { dmg *= d.charge.dmg; u.charging = false; emit(g, { t: 'impact', x: t.x, y: t.y }); }
  u.runT = 0;
  if (d.kamikaze) {
    areaDamage(g, u.side, t.x, t.y, u.splash, dmg, u.hitsAir);
    emit(g, { t: 'hit', from: u.model, x: t.x, y: t.y, splash: u.splash });
    u.spent = true; die(g, u);
    return;
  }
  if (u.proj) {
    shoot(g, u, t, dmg);
    if (d.multi > 1) {
      const more = g.ents.filter(e => e !== t && canHit(u, e) && edgeDist(u, e) <= u.range).sort((p, q) => dist(u, p) - dist(u, q)).slice(0, d.multi - 1);
      for (const e of more) shoot(g, u, e, dmg);
    }
    emit(g, { t: 'shoot', from: u.model, side: u.side, x: u.x, y: u.y });
  } else {
    if (d.spin) areaDamage(g, u.side, u.x, u.y, d.spin + u.r, dmg, false);
    else if (u.splash) areaDamage(g, u.side, t.x, t.y, u.splash, dmg, u.hitsAir);
    else damage(g, t, dmg, u.side);
    emit(g, { t: 'hit', from: u.model, x: d.spin ? u.x : t.x, y: d.spin ? u.y : t.y, heavy: dmg >= 300, spin: d.spin ? d.spin + u.r : 0 });
  }
  if (d.frenzy) u.stacks = Math.min(d.frenzy.max, u.stacks + 1);
}

// ---- Zielsuche ---------------------------------------------------------------------------------

export function pickTarget(g, u) {
  let best = null, bd = Infinity;
  const isStatic = u.kind !== 'unit';
  const reach = isStatic ? u.range : Math.max(SIGHT, u.range + 0.5);
  for (const e of g.ents) {
    if (!canHit(u, e)) continue;
    const d = edgeDist(u, e);
    if (d <= reach && d < bd) { bd = d; best = e; }
  }
  if (best || isStatic) return best;
  // nichts in Sichtweite: zum nächsten gegnerischen Gebäude oder Turm laufen
  for (const e of g.ents) {
    if (e.kind === 'unit' || !canHit(u, e)) continue;
    const d = dist(u, e) + (u.air || bankOf(u.y) === bankOf(e.y) ? 0 : Math.min(...BRIDGES.map(b => Math.abs(u.x - b) + Math.abs(e.x - b))) * 0.5);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const bankOf = y => (y < RIVER_TOP ? -1 : y > RIVER_BOT ? 1 : 0);

// Nächster Wegpunkt für Bodentruppen: über die Brücke, wenn das Ziel auf der anderen Flussseite liegt.
export function waypoint(u, tx, ty) {
  if (u.air) return [tx, ty];
  const a = bankOf(u.y), b = bankOf(ty);
  if (a === b) return [tx, ty];
  let bx = BRIDGES[0], bc = Infinity;
  for (const c of BRIDGES) { const cost = Math.abs(u.x - c) + Math.abs(tx - c); if (cost < bc) { bc = cost; bx = c; } }
  const lim = BRIDGE_HALF - 0.35;
  if (a === 0) {
    const dir = b !== 0 ? b : ty > u.y ? 1 : -1;
    return [clamp(u.x, bx - lim, bx + lim), dir < 0 ? RIVER_TOP - 0.4 : RIVER_BOT + 0.4];
  }
  if (Math.abs(u.x - bx) <= lim) {
    if (b === 0) return [clamp(tx, bx - lim, bx + lim), ty];
    return [u.x, a < 0 ? RIVER_BOT + 0.4 : RIVER_TOP - 0.4];
  }
  return [bx + clamp(u.x - bx, -lim + 0.1, lim - 0.1), a < 0 ? RIVER_TOP - 0.2 : RIVER_BOT + 0.2];
}

function updateEnt(g, u, dt) {
  const d = u.d;
  if (u.anim > 0) u.anim -= dt;
  if (u.deployT > 0) { u.deployT -= dt; return; }
  if (u.rootT > 0) u.rootT -= dt;
  if (u.slowT > 0) u.slowT -= dt;
  if (u.hasteT > 0) u.hasteT -= dt;
  if (u.abilityCd > 0) u.abilityCd -= dt;
  if (u.life) { u.hp -= (u.maxHp / u.life) * dt; if (u.hp <= 0) { die(g, u); return; } }
  if (u.stunT > 0) { u.stunT -= dt; return; }
  if (d.spawn) {
    u.spawnT -= dt;
    if (u.spawnT <= 0) {
      u.spawnT = d.spawn.every;
      const f = u.side === 0 ? -1 : 1, n = d.spawn.count || 1;
      for (let i = 0; i < n; i++) spawn(g, d.spawn.unit, u.side, clamp(u.x + (i - (n - 1) / 2) * 0.6 + (rnd(g) - 0.5) * 0.3, 0.4, W - 0.4), clamp(u.y + f * (u.r + 0.4), 0.4, H - 0.4), { deployT: 0.3 }, u.lvl);
      u.anim = 0.3;
    }
  }
  if (!u.dmg || !u.active) return;
  const rate = (u.hasteT > 0 ? HASTE : 1) * (u.slowT > 0 ? SLOW_FACTOR : 1);
  u.cd = Math.max(0, u.cd - dt * rate);
  u.scan -= dt;
  let t = u.targetId ? g.byId.get(u.targetId) : null;
  if (t && t.hp <= 0) t = null;
  if (!t || (!u.inRange && u.scan <= 0)) {
    t = pickTarget(g, u);
    u.scan = 0.25;
    u.targetId = t ? t.id : 0;
    if (!t) { u.inRange = false; u.runT = 0; u.charging = false; return; }
  }
  const dd = edgeDist(u, t);
  if (dd <= u.range + (u.inRange ? 0.2 : 0)) {
    if (!u.inRange) { u.inRange = true; u.cd = u.charging ? 0 : Math.max(u.cd, u.kind === 'unit' ? 0.4 : 0.25); }
    if (t.x !== u.x) u.face = t.x > u.x ? 1 : -1;
    if (u.cd <= 0) {
      strike(g, u, t);
      u.cd = u.atk * (d.frenzy ? Math.pow(d.frenzy.f, u.stacks) : 1);
    }
  } else {
    u.inRange = false;
    if (u.kind === 'unit' && u.rootT <= 0) {
      if (d.charge) { u.runT += dt; if (!u.charging && u.runT >= d.charge.after) { u.charging = true; emit(g, { t: 'charge', x: u.x, y: u.y }); } }
      const [wx, wy] = waypoint(u, t.x, t.y);
      const dx = wx - u.x, dy = wy - u.y, len = Math.hypot(dx, dy) || 1;
      const stepLen = Math.min(u.speed * rate * (u.charging ? d.charge.speed : 1) * dt, len);
      u.vx = dx / len; u.vy = dy / len;
      u.x += u.vx * stepLen; u.y += u.vy * stepLen;
      if (Math.abs(dx) > 0.05) u.face = dx > 0 ? 1 : -1;
    } else { u.runT = 0; u.charging = false; }
  }
}

function separate(g) {
  const E = g.ents;
  for (let i = 0; i < E.length; i++) {
    const a = E[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < E.length; j++) {
      const b = E[j];
      if (b.hp <= 0 || a.air !== b.air) continue;
      const aS = a.kind !== 'unit', bS = b.kind !== 'unit';
      if (aS && bS) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const min = a.r + b.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { dx = ((a.id * 7 + b.id) % 5) - 2 || 1; dy = ((a.id + b.id * 3) % 5) - 2; d = Math.hypot(dx, dy); }
      const nx = dx / d, ny = dy / d, over = min - d;
      if (aS || bS) {
        // Einheit ganz aus dem Gebäude schieben und seitlich daran vorbeigleiten lassen
        const u = aS ? b : a, s = aS ? 1 : -1;
        u.x += nx * over * s; u.y += ny * over * s;
        if (!u.inRange) {
          let tx = -ny, ty = nx;
          const dot = tx * u.vx + ty * u.vy;
          if (dot < -0.05 || (Math.abs(dot) <= 0.05 && u.id % 2)) { tx = -tx; ty = -ty; }
          u.x += tx * over * 0.6; u.y += ty * over * 0.6;
        }
      } else {
        const ma = a.r * a.r * (a.inRange ? 3 : 1), mb = b.r * b.r * (b.inRange ? 3 : 1);
        const fa = mb / (ma + mb), fb = ma / (ma + mb);
        a.x -= nx * over * fa * 0.7; a.y -= ny * over * fa * 0.7;
        b.x += nx * over * fb * 0.7; b.y += ny * over * fb * 0.7;
      }
    }
  }
  for (const u of E) {
    if (u.kind !== 'unit') continue;
    u.x = clamp(u.x, 0.4, W - 0.4);
    u.y = clamp(u.y, 0.4, H - 0.4);
    if (u.air || u.y <= RIVER_TOP || u.y >= RIVER_BOT) continue;
    let bx = BRIDGES[0];
    for (const c of BRIDGES) if (Math.abs(u.x - c) < Math.abs(u.x - bx)) bx = c;
    const lim = BRIDGE_HALF - 0.15;
    if (Math.abs(u.x - bx) <= BRIDGE_HALF + 0.3 && bankOf(u.oy) === 0) u.x = clamp(u.x, bx - lim, bx + lim);
    else if (Math.abs(u.x - bx) <= lim) { /* auf der Brücke */ }
    else u.y = u.oy <= RIVER_TOP ? RIVER_TOP : u.oy >= RIVER_BOT ? RIVER_BOT : u.y < (RIVER_TOP + RIVER_BOT) / 2 ? RIVER_TOP : RIVER_BOT;
  }
}

const inZone = (z, e) => Math.hypot(e.x - z.x, e.y - z.y) <= z.r + e.r * 0.6;

function updateZones(g, dt) {
  for (const z of g.zones) {
    const c = CARDS[z.card];
    if (z.delay > 0) { z.delay -= dt; if (z.delay > 0) continue; }
    if (!z.hit) {
      z.hit = true;
      emit(g, { t: 'spell', spell: z.spell, side: z.side, x: z.x, y: z.y, r: z.r });
      if (c.stun) for (const e of g.ents) if (e.side !== z.side && e.kind !== 'tower' && e.hp > 0 && inZone(z, e)) stun(e, c.stun);
      if (c.dmg) areaDamage(g, z.side, z.x, z.y, z.r, Math.round(c.dmg * z.mult), true, TOWER_SPELL_FACTOR);
      if (c.root) for (const e of g.ents) if (e.side !== z.side && e.kind === 'unit' && !e.air && e.hp > 0 && inZone(z, e)) e.rootT = c.root;
      if (c.haste) for (const e of g.ents) if (e.side === z.side && e.kind === 'unit' && e.hp > 0 && inZone(z, e)) e.hasteT = c.haste;
    }
    if (c.heal || c.dot) {
      z.tickT -= dt;
      if (z.tickT <= 1e-9) {
        z.tickT += c.tick;
        if (c.dot) areaDamage(g, z.side, z.x, z.y, z.r, Math.round(c.dot * z.mult), true, TOWER_SPELL_FACTOR);
        else for (const e of g.ents) {
          if (e.side === z.side && e.kind === 'unit' && e.hp > 0 && e.hp < e.maxHp && inZone(z, e)) {
            e.hp = Math.min(e.maxHp, e.hp + Math.round(c.heal * z.mult));
            emit(g, { t: 'heal', x: e.x, y: e.y });
          }
        }
      }
    }
    z.dur -= dt;
    if (z.dur <= 1e-9) z.done = true;
  }
  if (g.zones.some(z => z.done)) g.zones = g.zones.filter(z => !z.done);
}

function updateProjs(g, dt) {
  for (const p of g.projs) {
    p.ox = p.x; p.oy = p.y;
    const t = g.byId.get(p.targetId);
    const alive = t && t.hp > 0;
    if (alive) { p.tx = t.x; p.ty = t.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), stepLen = p.speed * dt;
    if (d <= stepLen + 0.05) {
      p.done = true;
      if (p.splash) areaDamage(g, p.side, p.tx, p.ty, p.splash, p.dmg, p.hitsAir, 1, p.slow);
      else if (alive) { if (p.slow && t.kind === 'unit') t.slowT = Math.max(t.slowT, p.slow); damage(g, t, p.dmg, p.side); }
      emit(g, { t: 'hit', from: p.from, x: p.tx, y: p.ty, splash: p.splash, frost: !!p.slow });
    } else { p.x += (dx / d) * stepLen; p.y += (dy / d) * stepLen; }
  }
  if (g.projs.some(p => p.done)) g.projs = g.projs.filter(p => !p.done);
}

// Schwächster Turm einer Seite (für die Entscheidung nach der Verlängerung)
const lowestTower = (g, side) => Math.min(...towersOf(g, side).map(t => t.hp));

export function step(g, dt = DT) {
  if (g.over) return;
  g.time += dt;
  const rate = kraftRate(g);
  for (const S of g.sides) S.kraft = Math.min(MAX_KRAFT, S.kraft + rate * dt);
  for (const e of g.ents) { e.ox = e.x; e.oy = e.y; }
  updateZones(g, dt);
  for (let i = 0, n = g.ents.length; i < n; i++) { const e = g.ents[i]; if (e.hp > 0) updateEnt(g, e, dt); }
  separate(g);
  updateProjs(g, dt);
  processDeaths(g);
  if (g.ents.some(e => e.hp <= 0)) {
    for (const e of g.ents) if (e.hp <= 0) g.byId.delete(e.id);
    g.ents = g.ents.filter(e => e.hp > 0);
  }
  if (g.over) return;
  const [a, b] = g.sides;
  if (g.phase === 'main' && g.time >= g.duration) {
    if (a.crowns !== b.crowns) finish(g, a.crowns > b.crowns ? 0 : 1);
    else { g.phase = 'over'; emit(g, { t: 'overtime' }); }
  } else if (g.phase === 'over' && g.time >= g.duration + g.overtime) {
    const la = lowestTower(g, 0), lb = lowestTower(g, 1);
    finish(g, Math.abs(la - lb) < 1 ? 'draw' : la > lb ? 0 : 1);
  }
}
