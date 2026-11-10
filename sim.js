// Spiel-Logik von Runenfurt: reine Simulation ohne Browser-Abhängigkeiten (läuft auch unter node --test).
// Seite 0 spielt von unten (großes y), Seite 1 von oben. Fester Zeitschritt DT.
import { UNITS, CARDS, RUNES, TOWER_SPELL_FACTOR, HASTE, SLOW_FACTOR, sanitizeDeck } from './cards.js';

// Feldmaße wie im Genre üblich: 18 breit, 32 lang, der Fluss zwei Felder breit in der Mitte.
export const W = 18, H = 32;
export const RIVER_TOP = 15, RIVER_BOT = 17;
export const OUTER_Y = 6.5, MAIN_Y = 3; // Abstand der Türme von der eigenen Grundlinie
export const BRIDGES = [3.5, 14.5];
export const BRIDGE_HALF = 1.3;
export const DT = 1 / 30;
export const MAX_KRAFT = 10;
export const KRAFT_RATE = 1 / 2.8;
const SIGHT = 5.5;
export const POCKET = 11; // so weit darf man nach einem gefallenen Außenturm ins gegnerische Feld setzen (gespiegelt: y >= POCKET)

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
    dmg: Math.round((d.dmg || 0) * m), atk: d.atk || 1, range: d.range || 0, speed: (d.speed || 0) * ((g.sides[side] && g.sides[side].speedMult) || 1),
    proj: d.proj || 0, splash: d.splash || 0, targets: d.targets || 'all',
    main: !!d.main, active: !d.main, life: d.life || 0,
    spawnT: d.spawn ? d.spawn.first : 0,
    cd: d.load || 0, scan: 0, targetId: 0, inRange: false, deployT: 0,
    rootT: 0, stunT: 0, slowT: 0, hasteT: 0, runT: 0, charging: false, stacks: 0, abilityCd: 0,
    shield: Math.round((d.shield || 0) * m), maxShield: Math.round((d.shield || 0) * m), rampT: 0, rampId: 0, revealT: 0, cloakT: 0, cloakRate: 1, hidden: false, iceT: 0,
    kraftT: d.kraft ? d.kraft.every : 0, ammo: d.ammo ? d.ammo.max : 0, ammoT: 0, blessed: false,
    cd2: d.second ? d.second.atk : 0, hookT: 0, hookCd: 0, hookId: 0, curseT: 0, curseSide: 0, curseUnit: '', curseLvl: 1, ampT: 0, wardT: 0, wardF: 1,
    hatchT: d.hatch ? d.hatch.after : 0, ench: null, enchT: 0, comboN: 0, buried: false, upT: 0, ford: !!d.ford, clone: false,
    face: side === 0 ? -1 : 1, anim: 0, vx: 0, vy: 0,
    ...extra,
  };
  g.ents.push(e);
  g.byId.set(e.id, e);
  return e;
}

// levels[s] = { cards: { kartenId: Stufe }, tower: Stufe des Hauptturms, outer: Stufe der Außentürme (sonst wie tower),
//              towerType: Turmkarte der Außentürme, runes: [kartenIds mit Runenform] } – fehlt etwas, gilt Stufe 1
// rules (alles freiwillig) – Sonderregeln für Spielmodi und Bosskämpfe:
//   kraftFixed: n       die Kraft läuft das ganze Spiel n-fach
//   sudden: true        der erste zerstörte Turm entscheidet; bei Zeitablauf zählt der schwächste Turm
//   kraft, speed, towerHp: [Seite 0, Seite 1]   Faktoren für Kraftzufluss, Lauftempo und Turmleben
//   runeAlways: [bool, bool]                    Runenkarten kommen jedes Mal in Runenform
//   passive: [null, { unit, count, every }]     am Hauptturm erscheinen regelmäßig Einheiten
//   waves: { pool: [kartenIds], lvl }           Seite 1 schickt wachsende Wellen (kein Kartenspiel nötig)
export function createGame({ decks, levels, seed = 1, duration = 180, overtime = 120, rules = {} } = {}) {
  const g = {
    sudden: !!rules.sudden, kraftFixed: rules.kraftFixed || 0,
    waves: rules.waves ? { t: 6, n: 0, pool: rules.waves.pool, lvl: rules.waves.lvl || 1 } : null,
    seed: seed >>> 0, time: 0, duration, overtime, phase: 'main', over: false, winner: null,
    ents: [], projs: [], zones: [], events: [], dead: [], byId: new Map(), nextId: 1, sides: [],
  };
  for (let s = 0; s < 2; s++) {
    const deck = sanitizeDeck(decks && decks[s]);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd(g) * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const lv = (levels && levels[s]) || {};
    const pick = key => (rules[key] && rules[key][s]) || null, passive = pick('passive');
    g.sides.push({
      kraftMult: pick('kraft') || 1, speedMult: pick('speed') || 1, runeAlways: !!pick('runeAlways'), passive, passiveT: passive ? passive.every : 0,
      levels: lv.cards || {}, tower: lv.tower || 1, runes: new Set(lv.runes || []), cycle: {}, away: [], blessT: 0,
      kraft: 5, hand: deck.splice(0, 4), next: deck.shift(), queue: deck, crowns: 0, spent: 0,
    });
    const my = y => (s === 0 ? H - y : y);
    const tc = CARDS[lv.towerType], outer = tc && tc.type === 'tower' ? tc.unit : 'aussenturm', outerLvl = lv.outer || lv.tower;
    spawn(g, outer, s, 3.5, my(OUTER_Y), { lane: 0 }, outerLvl);
    spawn(g, outer, s, 14.5, my(OUTER_Y), { lane: 1 }, outerLvl);
    if (UNITS[outer].bless) g.sides[s].blessT = UNITS[outer].bless.every + UNITS[outer].bless.first;
    spawn(g, 'hauptturm', s, 9, my(MAIN_Y), { lane: -1 }, lv.tower);
    const hm = pick('towerHp') || 1;
    if (hm !== 1) for (const e of g.ents) if (e.side === s) e.hp = e.maxHp = Math.round(e.maxHp * hm);
  }
  return g;
}

export const towersOf = (g, side) => g.ents.filter(e => e.kind === 'tower' && e.side === side && e.hp > 0);
export const outerTower = (g, side, lane) => g.ents.find(e => e.kind === 'tower' && e.side === side && e.lane === lane && e.hp > 0) || null;
export const mainTower = (g, side) => g.ents.find(e => e.main && e.side === side) || null;
// doppelt in der letzten Minute und in der Verlängerung, dreifach in deren letzter Minute
export const kraftRate = g => KRAFT_RATE * (g.kraftFixed ? g.kraftFixed : g.time >= g.duration + g.overtime - 60 && g.phase !== 'main' ? 3 : g.phase === 'over' || g.time >= g.duration - 60 ? 2 : 1);
export const timeLeft = g => (g.phase === 'main' ? g.duration - g.time : g.duration + g.overtime - g.time);

// ---- Karten ausspielen -------------------------------------------------------------------------

// Nächster erlaubter Punkt für eine Karte. Zauber dürfen überallhin, Truppen/Gebäude nur aufs eigene Feld
// (plus die Tasche hinter einem zerstörten gegnerischen Außenturm).
export function clampDeploy(g, side, cardId, x, y) {
  let c = CARDS[cardId];
  if (c.mirror && g.sides[side].last) c = CARDS[g.sides[side].last]; // Widerhall: es gelten die Regeln der wiederholten Karte
  x = clamp(x, 0.6, W - 0.6);
  if (c.spread) x = clamp(x, c.spread / 2 + 0.6, W - c.spread / 2 - 0.6); // die ganze Reihe muss aufs Feld passen
  if (c.type === 'spell' && !c.summon && !c.ownSide) return { x, y: clamp(y, 0.6, H - 0.6) };
  if ((c.summon || c.anywhere) && !c.ownSide) { // überall, nur nicht ins Wasser
    y = offRiver(clamp(y, 0.6, H - 0.6));
    if (c.type === 'building') for (const e of g.ents) { // ein Gebäude nicht in ein anderes hinein, sondern daneben
      if (e.kind === 'unit' || e.hp <= 0) continue;
      const min = e.r + UNITS[c.unit].r + 0.15, dx = x - e.x, dy = y - e.y, d = Math.hypot(dx, dy);
      if (d >= min) continue;
      const nx = d > 0.01 ? dx / d : 0, ny = d > 0.01 ? dy / d : e.side === 0 ? -1 : 1;
      x = clamp(e.x + nx * min, 0.6, W - 0.6); y = clamp(e.y + ny * min, 0.6, H - 0.6);
    }
    return { x, y };
  }
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
  return !!(RUNES[id] && S.runes.has(id) && (S.runeAlways || (S.cycle[id] || 0) >= RUNES[id].cycles));
}

// Was kostet die Karte gerade? Der Widerhall kostet eine Kraft mehr als die zuletzt gespielte Karte
// (und ist nicht spielbar, solange noch keine gespielt wurde).
export function cardCost(g, side, id) {
  const c = CARDS[id];
  if (!c) return Infinity;
  if (!c.mirror) return c.cost;
  const last = g.sides[side].last;
  return last ? CARDS[last].cost + 1 : Infinity;
}

function castZone(g, id, side, x, y, lvl, delay) {
  const c = CARDS[id];
  g.zones.push({ spell: c.spell, card: id, side, x, y, r: c.radius, delay, dur: c.dur || 0, tickT: c.dot ? c.tick : 0, done: false, mult: cardMult(lvl), lvl,
    n: 0, t2: c.summonOver ? c.summonOver.first : c.pulses ? c.pulses.first : 0 });
}

// Spielt die Handkarte handIdx an (x, y). Gibt true zurück, wenn die Karte gespielt wurde.
export function playCard(g, side, handIdx, x, y) {
  const S = g.sides[side];
  const hid = S.hand[handIdx];
  const hc = hid && CARDS[hid];
  if (g.over || !hc || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const cost = cardCost(g, side, hid);
  if (S.kraft < cost || !canDeploy(g, side, hid, x, y)) return false;
  const id = hc.mirror ? S.last : hid, c = CARDS[id]; // Widerhall: die zuletzt gespielte Karte noch einmal
  const lvl = hc.mirror ? (S.levels[hid] || 1) + 1 : S.levels[id] || 1; // … auf der Stufe des Widerhalls plus eins
  const R = !hc.mirror && runeReady(g, side, id) ? RUNES[id] : null;
  if (!hc.mirror && S.runes.has(id) && RUNES[id]) S.cycle[id] = R ? 0 : (S.cycle[id] || 0) + 1;
  S.kraft -= cost;
  S.spent += cost;
  if (hc.hero) S.away.push(hid); else S.queue.push(hid); // ein Held kommt erst zurück in den Stapel, wenn er gefallen ist
  S.hand[handIdx] = S.next;
  S.next = S.queue.shift();
  if (!hc.mirror && !hc.hero) S.last = hid;
  if (c.type === 'spell') {
    castZone(g, id, side, x, y, lvl, c.delay);
    emit(g, { t: 'cast', spell: c.spell, side, x, y, r: c.radius, delay: c.delay, echo: !!hc.mirror });
  } else {
    const put = (unit, dx, dy) => spawn(g, unit, side, clamp(x + dx, 0.4, W - 0.4), clamp(y + dy, 0.4, H - 0.4), { deployT: 1, cardId: c.hero ? id : '' }, lvl);
    if (c.mix && !R) { // gemischter Trupp: die zuerst genannten Einheiten stehen vorn
      const list = c.mix.flatMap(([u, n]) => Array(n).fill(u)), fwd = side === 0 ? -1 : 1;
      const pos = [...formation(list.length)].sort((a, b) => (b[1] - a[1]) * fwd);
      list.forEach((u, i) => put(u, pos[i][0], pos[i][1]));
    } else if (c.spread && !R) { // eine Reihe quer über das Feld
      for (let i = 0; i < c.count; i++) put(c.unit, (i / (c.count - 1) - 0.5) * c.spread, 0);
    } else {
      for (const [dx, dy] of formation((R && R.count) || c.count)) put(R ? R.unit : c.unit, dx, dy);
    }
    emit(g, { t: 'deploy', side, x, y, card: id, rune: !!R, hero: !!c.hero, echo: !!hc.mirror });
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
    out.push({ cardId: e.cardId, ent: e, ability: a, cd: Math.max(0, e.abilityCd), ready: e.deployT <= 0 && e.abilityCd <= 0 && e.stunT <= 0 && S.kraft >= a.cost && !(a.once && e.abilityUsed), used: !!(a.once && e.abilityUsed) });
  }
  return out;
}

export function useAbility(g, side, cardId) {
  const st = abilities(g, side).find(s => s.cardId === cardId);
  if (g.over || !st || !st.ready) return false;
  const S = g.sides[side], h = st.ent, a = st.ability, m = cardMult(h.lvl);
  const inReach = (e, x, y) => e.side !== side && e.hp > 0 && !e.hidden && Math.hypot(e.x - x, e.y - y) - e.r <= a.radius;
  if (a.id === 'sturmlauf' && !g.ents.some(e => inReach(e, h.x, h.y))) return false; // niemand da, den er anspringen könnte
  S.kraft -= a.cost; S.spent += a.cost;
  h.abilityCd = a.cd; h.anim = 0.3; h.abilityUsed = true;
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
  } else if (a.id === 'schleier') {
    h.cloakT = a.dur; h.cloakRate = a.rate; h.hidden = true;
  } else if (a.id === 'wurzelheer') {
    for (let i = 0; i < a.count; i++) {
      const w = (i / a.count) * Math.PI * 2 + 0.4;
      const sx = clamp(h.x + Math.cos(w) * 1.3, 0.4, W - 0.4), sy = offRiver(clamp(h.y + Math.sin(w) * 1.3, 0.4, H - 0.4));
      spawn(g, a.unit, side, sx, sy, { deployT: 0.5 }, h.lvl);
      hits.push({ x: sx, y: sy });
    }
  } else if (a.id === 'sturmlauf') {
    // von Gegner zu Gegner springen; er landet neben dem letzten Bodenziel
    let px = h.x, py = h.y, land = null;
    const done = new Set();
    for (let i = 0; i < a.count; i++) {
      let best = null, bd = Infinity;
      for (const e of g.ents) { if (done.has(e.id) || !inReach(e, px, py)) continue; const dd = Math.hypot(e.x - px, e.y - py); if (dd < bd) { bd = dd; best = e; } }
      if (!best) break;
      done.add(best.id); hits.push({ x: best.x, y: best.y, air: best.air });
      if (!best.air && bankOf(best.y) !== 0) land = { x: best.x, y: best.y, r: best.r, fx: px, fy: py };
      px = best.x; py = best.y;
      damage(g, best, Math.round(a.dmg * m * (best.kind === 'tower' ? TOWER_SPELL_FACTOR : 1)), side);
    }
    if (land) {
      const dx = land.fx - land.x, dy = land.fy - land.y, L = Math.hypot(dx, dy) || 1, off = land.r + h.r + 0.1;
      h.x = clamp(land.x + (dx / L) * off, 0.4, W - 0.4); h.y = clamp(land.y + (dy / L) * off, 0.4, H - 0.4);
      if (bankOf(h.y) === 0) h.y = land.y;
      h.ox = h.x; h.oy = h.y; h.targetId = 0; h.inRange = false;
    }
  } else if (a.id === 'seitenwechsel') {
    // am alten Platz bleibt eine Sprengladung, er selbst taucht spiegelbildlich auf der anderen Feldseite auf
    g.zones.push({ blast: { dmg: Math.round(a.dmg * m), slow: 0, tf: TOWER_SPELL_FACTOR }, side, x: h.x, y: h.y, r: a.radius, delay: a.delay, dur: 0, done: false });
    emit(g, { t: 'fuse', x: h.x, y: h.y, r: a.radius, delay: a.delay });
    hits.push({ x: h.x, y: h.y });
    h.x = W - h.x; h.ox = h.x; h.oy = h.y;
    h.targetId = 0; h.inRange = false; h.rampT = 0; h.deployT = 0.5;
  } else if (a.id === 'stillewacht') {
    h.wardT = a.dur; h.wardF = a.f;
  } else if (a.id === 'leibwache') {
    const f = side === 0 ? -1 : 1, gy = offRiver(clamp(h.y + f * 1.6, 0.4, H - 0.4));
    spawn(g, a.unit, side, h.x, gy, { deployT: 0.35 }, h.lvl);
    hits.push({ x: h.x, y: gy });
  }
  emit(g, { t: 'ability', id: a.id, side, x: h.x, y: h.y, r: a.radius, hits });
  return true;
}

// ---- Schaden -----------------------------------------------------------------------------------

function stun(e, t) {
  if (e.charging && e.d.dashGuard) return; // mitten im Sprung prallt auch die Betäubung ab
  e.stunT = Math.max(e.stunT, t); e.inRange = false; e.runT = 0; e.charging = false;
}

function die(g, e) {
  e.hp = 0;
  emit(g, { t: 'die', kind: e.kind, type: e.type, model: e.model, side: e.side, x: e.x, y: e.y, air: e.air, main: e.main });
  g.dead.push(e);
}

// src: die angreifende Einheit (fehlt bei Zaubern) – nur sie kann einen Rückschlag abbekommen
function damage(g, e, amount, bySide, src) {
  if (e.hp <= 0 || g.over) return;
  if (e.buried || (e.charging && e.d.dashGuard)) return; // vergraben oder mitten im Sprung: nichts trifft
  const rf = e.d.reflect;
  if (rf && src && src.hp > 0 && src.side !== e.side && edgeDist(src, e) <= rf.r) { // Dornen schlagen auf nahe Angreifer zurück
    if (src.kind !== 'tower') stun(src, rf.stun);
    emit(g, { t: 'chain', from: e.model, side: e.side, x: e.x, y: e.y, air: e.air, hits: [{ x: src.x, y: src.y, air: src.air }] });
    damage(g, src, Math.round(rf.dmg * cardMult(e.lvl) * (src.kind === 'tower' ? rf.towerF : 1)), e.side);
    if (g.over) return;
  }
  if (e.d.guard && !e.inRange) amount *= e.d.guard;
  if (e.wardT > 0) amount *= e.wardF;
  if (e.ampT > 0) amount *= e.ampF || 1;
  if (e.shield > 0) { // der Schild fängt den Treffer ganz ab, auch wenn er dabei bricht
    e.shield -= amount;
    if (e.shield <= 0) { e.shield = 0; emit(g, { t: 'shield', x: e.x, y: e.y }); }
    return;
  }
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
  if (g.phase === 'over' || g.sudden) finish(g, bySide ?? 1 - e.side);
}

// Nachwirkungen des Todes: Splitter, Bruchstücke, Held zurück in den Kartenstapel
function processDeaths(g) {
  while (g.dead.length) {
    const e = g.dead.shift(), d = e.d;
    if (e.cardId) { const S = g.sides[e.side], i = S.away.indexOf(e.cardId); if (i >= 0) { S.away.splice(i, 1); S.queue.push(e.cardId); } }
    if (g.over) continue;
    if (d.deathDmg && !e.spent) {
      const dd = d.deathDmg, dmg = Math.round(dd.dmg * cardMult(e.lvl));
      if (dd.delay) { // Bombe mit Lunte
        g.zones.push({ blast: { dmg, slow: dd.slow || 0 }, side: e.side, x: e.x, y: e.y, r: dd.r, delay: dd.delay, dur: 0, done: false });
        emit(g, { t: 'fuse', x: e.x, y: e.y, r: dd.r, delay: dd.delay });
      } else {
        emit(g, { t: 'burst', x: e.x, y: e.y, r: dd.r, side: e.side, frost: !!dd.slow });
        areaDamage(g, e.side, e.x, e.y, dd.r, dmg, false, 1, dd.slow || 0);
      }
    }
    if (d.kraft && d.kraft.death) { const S = g.sides[e.side]; S.kraft = Math.min(MAX_KRAFT, S.kraft + d.kraft.death); emit(g, { t: 'kraft', side: e.side, x: e.x, y: e.y }); }
    if (d.deathZone) castZone(g, d.deathZone, e.side, e.x, e.y, e.lvl, 0.05);
    if (d.deathSpawn) {
      const n = d.deathSpawn.count, air = UNITS[d.deathSpawn.unit].air;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.5, rr = n > 1 ? 0.6 : 0, sy = clamp(e.y + Math.sin(a) * rr, 0.4, H - 0.4);
        const k = spawn(g, d.deathSpawn.unit, e.side, clamp(e.x + Math.cos(a) * rr, 0.4, W - 0.4), air || !e.air ? sy : offRiver(sy), { deployT: 0.5 }, e.lvl);
        if (e.clone) makeClone(k);
      }
    }
    if (d.bounty) { // jedes gefallene Stück schenkt dem Gegner Kraft
      const F = g.sides[1 - e.side];
      F.kraft = Math.min(MAX_KRAFT, F.kraft + d.bounty);
      emit(g, { t: 'kraft', side: 1 - e.side, x: e.x, y: e.y });
    }
    if (d.enchant) for (const o of g.ents) if (o.ench && o.ench.by === e.id) o.ench = null; // die Runenzeichen erlöschen mit dem Hünen
    if (e.curseT > 0 && e.kind === 'unit' && e.curseUnit && !e.spent) { // verflucht gefallen: steht für die andere Seite wieder auf
      spawn(g, e.curseUnit, e.curseSide, e.x, UNITS[e.curseUnit].air ? e.y : offRiver(e.y), { deployT: 0.5 }, e.curseLvl);
      emit(g, { t: 'curse', side: e.curseSide, x: e.x, y: e.y });
    }
  }
}

// Abbild (Trugbild): schlägt wie das Vorbild, fällt aber beim ersten Treffer
function makeClone(k) { k.clone = true; k.hp = k.maxHp = 1; k.shield = k.maxShield = 0; }

// Verwandlung bei wenig Leben (Pulverwicht zündet die Lunte, der Armbrustwagen bleibt als Gebäude stehen)
function morph(g, u) {
  const to = u.d.morph.unit, d = UNITS[to], m = cardMult(u.lvl);
  u.type = to; u.d = d; u.model = d.model || to;
  u.kind = d.building ? 'building' : 'unit';
  u.dmg = Math.round((d.dmg || 0) * m); u.atk = d.atk || 1; u.range = d.range || 0;
  u.speed = (d.speed || 0) * (g.sides[u.side].speedMult || 1);
  u.proj = d.proj || 0; u.splash = d.splash || 0; u.targets = d.targets || 'all'; u.hitsAir = !!d.hitsAir; u.r = d.r;
  u.life = d.life || 0; u.maxHp = u.hp; // die Restzeit zehrt vom verbliebenen Leben
  u.targetId = 0; u.inRange = false; u.charging = false; u.runT = 0; u.cd = 0.4; u.vx = 0; u.vy = 0; u.morphed = true;
  emit(g, { t: 'morph', x: u.x, y: u.y, to, building: !!d.building });
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
// Reichweite: Truppen messen von Rand zu Rand, Türme und Gebäude von ihrer Mitte aus –
// so erreicht ein Außenturm (7,5 Felder) niemanden, der noch auf der Brücke steht.
const reachDist = (u, e) => (u.kind === 'unit' ? edgeDist(u, e) : dist(u, e) - e.r);

function canHit(u, e) {
  if (e.side === u.side || e.hp <= 0 || e.hidden) return false;
  if (e.air && !u.hitsAir) return false;
  if (u.targets === 'buildings' && e.kind === 'unit') return false;
  return true;
}

// o (freiwillig): { src: Angreifer, buildF: Faktor auf Gebäude, knock: Rückstoß in Feldern, kx/ky: feste Stoßrichtung (sonst von der Mitte weg) }
function areaDamage(g, side, x, y, radius, dmg, hitsAir, towerFactor = 1, slow = 0, o = null) {
  for (const e of g.ents) {
    if (e.side === side || e.hp <= 0 || (e.air && !hitsAir)) continue;
    if (Math.hypot(e.x - x, e.y - y) > radius + e.r * 0.6) continue;
    if (slow && e.kind === 'unit') e.slowT = Math.max(e.slowT, slow);
    if (o && o.knock && e.kind === 'unit' && e.r < 0.75 && !e.buried) push(e, o.kx === undefined ? e.x - x : o.kx, o.kx === undefined ? e.y - y : o.ky, o.knock);
    damage(g, e, e.kind === 'tower' ? dmg * towerFactor : e.kind === 'building' && o && o.buildF ? dmg * o.buildF : dmg, side, o ? o.src : undefined);
  }
}

// Einheit ein Stück in eine Richtung stoßen; ihr Angriff oder Anlauf ist damit unterbrochen
function push(e, dx, dy, k) {
  const L = Math.hypot(dx, dy) || 1;
  e.x = clamp(e.x + (dx / L) * k, 0.4, W - 0.4); e.y = clamp(e.y + (dy / L) * k, 0.4, H - 0.4);
  e.inRange = false; e.runT = 0; e.charging = false;
}

function shoot(g, u, t, dmg) {
  g.projs.push({ x: u.x, y: u.y, ox: u.x, oy: u.y, sx: u.x, sy: u.y, tx: t.x, ty: t.y, targetId: t.id, speed: u.proj, dmg, splash: u.splash, slow: u.d.slow || 0, stun: u.d.stunHit || 0, root: 0,
    curse: u.d.curse ? { ...u.d.curse, side: u.side, lvl: u.lvl } : null, burst: u.d.burst || null,
    side: u.side, hitsAir: u.hitsAir, from: u.model, rune: u.rune, air: u.air || t.air, srcId: u.id });
}

// Blitz, der vom Ziel aus auf die jeweils nächsten Gegner überspringt
function chainHit(g, u, t, dmg) {
  const c = u.d.chain, hits = [], seen = new Set();
  let cur = t;
  while (cur && hits.length < c.n) {
    seen.add(cur.id); hits.push({ x: cur.x, y: cur.y, air: cur.air });
    if (u.d.stunHit && cur.kind !== 'tower') stun(cur, u.d.stunHit);
    damage(g, cur, dmg, u.side, u);
    let best = null, bd = c.r;
    for (const e of g.ents) {
      if (seen.has(e.id) || !canHit(u, e)) continue;
      const dd = dist(cur, e) - e.r;
      if (dd <= bd) { bd = dd; best = e; }
    }
    cur = best;
  }
  emit(g, { t: 'chain', from: u.model, side: u.side, x: u.x, y: u.y, air: u.air, hits });
}

// Streuschuss: n Splitter gleichmäßig im Fächer; jeder trifft den vordersten Gegner in seiner Bahn
function scatterShot(g, u, t, dmg) {
  const sc = u.d.scatter, ang = Math.atan2(t.y - u.y, t.x - u.x), got = new Map();
  const cands = [];
  for (const e of g.ents) {
    if (!canHit(u, e) || dist(u, e) - e.r > sc.reach) continue;
    const dd = Math.max(dist(u, e), 0.05);
    let da = Math.atan2(e.y - u.y, e.x - u.x) - ang;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    cands.push({ e, dd, da, half: Math.atan2(e.r, dd) });
  }
  cands.sort((p, q) => p.dd - q.dd || p.e.id - q.e.id);
  for (let i = 0; i < sc.n; i++) {
    const a = (i / (sc.n - 1) - 0.5) * sc.cone;
    const c = cands.find(k => Math.abs(a - k.da) <= k.half);
    if (c) got.set(c.e, (got.get(c.e) || 0) + 1);
  }
  for (const [e, n] of got) damage(g, e, dmg * n, u.side, u);
  emit(g, { t: 'scatter', from: u.model, side: u.side, x: u.x, y: u.y, ang, cone: sc.cone, reach: sc.reach, air: u.air || t.air, hits: [...got.keys()].map(e => ({ x: e.x, y: e.y, air: e.air })) });
}

// Haken (Seilwerfer): Truppen heranziehen, an Gebäude sich selbst heranziehen
function pullHook(g, u, h) {
  const dx = h.x - u.x, dy = h.y - u.y, L = Math.hypot(dx, dy) || 1, gap = u.r + h.r + 0.1;
  emit(g, { t: 'hook', x: u.x, y: u.y, tx: h.x, ty: h.y, air: h.air });
  if (h.kind === 'unit') {
    h.x = u.x + (dx / L) * gap; h.y = u.y + (dy / L) * gap;
    if (!h.air && !h.ford && bankOf(h.y) === 0 && bankOf(u.y) !== 0) h.y = u.y; // nicht im Wasser absetzen
    h.ox = h.x; h.oy = h.y; h.targetId = 0;
    stun(h, 0.4); h.slowT = Math.max(h.slowT, 1.5);
  } else {
    u.x = h.x - (dx / L) * gap; u.y = h.y - (dy / L) * gap; u.ox = u.x; u.oy = u.y;
  }
  u.inRange = false; u.targetId = h.id;
}

function strike(g, u, t) {
  const d = u.d;
  u.anim = 0.3;
  let dmg = u.dmg, knock = 0;
  if (d.farBonus && dist(u, t) >= d.farBonus.min) dmg = Math.round(dmg * d.farBonus.f);   // Fernschuss: mehr Schaden ab diesem Abstand
  if (u.charging) { dmg *= (d.charge || d.leap).dmg; u.charging = false; emit(g, { t: 'impact', x: t.x, y: t.y }); }
  u.runT = 0;
  if (d.stealth) u.revealT = d.stealth;
  if (d.ramp) { for (const [after, f] of d.ramp) if (u.rampT >= after) dmg = u.dmg * f; }
  if (d.combo && ++u.comboN >= d.combo.every) { u.comboN = 0; dmg *= d.combo.f; knock = d.combo.knock; emit(g, { t: 'impact', x: t.x, y: t.y }); }
  if (u.ench) { // Zeichen eines Runenhünen: jeder dritte Treffer schlägt mit Zusatzschaden ein
    const by = g.byId.get(u.ench.by);
    if (!by || by.hp <= 0) u.ench = null;
    else if (++u.ench.n >= u.ench.every) { u.ench.n = 0; dmg += u.ench.bonus; emit(g, { t: 'ench', x: t.x, y: t.y, air: t.air }); }
  }
  if (d.kamikaze) {
    u.spent = true;
    if (d.chain) chainHit(g, u, t, dmg);
    else if (u.splash) areaDamage(g, u.side, t.x, t.y, u.splash, dmg, u.hitsAir, 1, 0, { src: u });
    else damage(g, t, dmg, u.side, u);
    if (d.stunArea) for (const e of g.ents) { // Frost: alles ringsum erstarrt kurz
      if (e.side === u.side || e.hp <= 0 || Math.hypot(e.x - t.x, e.y - t.y) > u.splash + e.r * 0.6) continue;
      stun(e, d.stunArea); if (d.ice) e.iceT = d.stunArea;
    }
    if (d.healBurst) {
      const amt = Math.round(d.healBurst.amt * cardMult(u.lvl));
      for (const e of g.ents) if (e !== u && e.side === u.side && e.kind === 'unit' && e.hp > 0 && e.hp < e.maxHp && Math.hypot(e.x - t.x, e.y - t.y) <= d.healBurst.r + e.r * 0.6) { e.hp = Math.min(e.maxHp, e.hp + amt); emit(g, { t: 'heal', x: e.x, y: e.y }); }
    }
    emit(g, { t: 'hit', from: u.model, x: t.x, y: t.y, splash: u.splash || (d.healBurst ? d.healBurst.r : 0), frost: !!d.ice });
    if (u.hp > 0) die(g, u);
    return;
  }
  if (d.chain) chainHit(g, u, t, dmg);
  else if (d.scatter) scatterShot(g, u, t, dmg);
  else if (d.line) { // Geschoss, das auf gerader Bahn durch alles hindurchgeht (mit „back“ kehrt es zum Werfer zurück)
    const dx = t.x - u.x, dy = t.y - u.y, L = Math.hypot(dx, dy) || 1;
    g.projs.push({ line: true, x: u.x, y: u.y, ox: u.x, oy: u.y, vx: dx / L, vy: dy / L, left: d.line.len, len: d.line.len, back: !!d.line.back, w: d.line.w, speed: u.proj, dmg, knock: d.knock || 0, side: u.side, hitsAir: u.hitsAir, from: u.model, hit: new Set(), towerFactor: 1, srcId: u.id });
    emit(g, { t: 'shoot', from: u.model, side: u.side, x: u.x, y: u.y });
  } else if (u.proj) {
    shoot(g, u, t, dmg);
    if (d.multi > 1) {
      const more = g.ents.filter(e => e !== t && canHit(u, e) && reachDist(u, e) <= u.range).sort((p, q) => dist(u, p) - dist(u, q)).slice(0, d.multi - 1);
      for (const e of more) shoot(g, u, e, dmg);
    }
    emit(g, { t: 'shoot', from: u.model, side: u.side, x: u.x, y: u.y });
    if (d.recoil && u.kind === 'unit') { // der Rückstoß wirft den Schützen nach hinten
      const ox = u.x, oy = u.y;
      push(u, u.x - t.x, u.y - t.y, d.recoil);
      if (bankOf(u.y) !== bankOf(oy)) { u.x = ox; u.y = oy; }
    }
  } else {
    if (d.spin) areaDamage(g, u.side, u.x, u.y, d.spin + u.r, dmg, false, 1, 0, { src: u });
    else if (u.splash) areaDamage(g, u.side, t.x, t.y, u.splash, dmg, u.hitsAir, 1, 0, { src: u });
    else damage(g, t, t.kind === 'tower' && d.towerDmg ? dmg * d.towerDmg : dmg, u.side, u);
    if (knock && t.hp > 0 && t.kind === 'unit' && t.r < 0.75) push(t, t.x - u.x, t.y - u.y, knock);
    if (d.ramp && !d.rampMelee) emit(g, { t: 'beam', x: u.x, y: u.y, tx: t.x, ty: t.y, from: u.model, air: u.air, tair: t.air, hot: dmg / u.dmg });
    else emit(g, { t: 'hit', from: u.model, x: d.spin ? u.x : t.x, y: d.spin ? u.y : t.y, heavy: dmg >= 300, spin: d.spin ? d.spin + u.r : 0 });
  }
  if (d.healHit) {
    const amt = Math.round(d.healHit.amt * cardMult(u.lvl));
    for (const e of g.ents) if (e !== u && !e.d.healHit && e.side === u.side && e.kind === 'unit' && e.hp > 0 && e.hp < e.maxHp && dist(u, e) <= d.healHit.r) { e.hp = Math.min(e.maxHp, e.hp + amt); emit(g, { t: 'heal', x: e.x, y: e.y }); }
  }
  if (d.frenzy) u.stacks = Math.min(d.frenzy.max, u.stacks + 1);
}

// ---- Zielsuche ---------------------------------------------------------------------------------

export function pickTarget(g, u) {
  let best = null, bd = Infinity;
  const isStatic = u.kind !== 'unit';
  const reach = isStatic ? u.range : Math.max(SIGHT, u.range + 0.5);
  for (const e of g.ents) {
    if (!canHit(u, e) || (u.d.minRange && dist(u, e) < u.d.minRange)) continue;
    const d = reachDist(u, e);
    if (d <= reach && d < bd) { bd = d; best = e; }
  }
  if (best || isStatic) return best;
  // nichts in Sichtweite: zum nächsten gegnerischen Gebäude oder Turm laufen
  for (const e of g.ents) {
    if (e.kind === 'unit' || !canHit(u, e)) continue;
    const d = dist(u, e) + (u.air || u.ford || bankOf(u.y) === bankOf(e.y) ? 0 : Math.min(...BRIDGES.map(b => Math.abs(u.x - b) + Math.abs(e.x - b))) * 0.5);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

const bankOf = y => (y < RIVER_TOP ? -1 : y > RIVER_BOT ? 1 : 0);
// Punkt aus dem Wasser ans nähere Ufer schieben
const offRiver = y => (y > RIVER_TOP - 0.4 && y < RIVER_BOT + 0.4 ? (y < (RIVER_TOP + RIVER_BOT) / 2 ? RIVER_TOP - 0.4 : RIVER_BOT + 0.4) : y);

// Nächster Wegpunkt für Bodentruppen: über die Brücke, wenn das Ziel auf der anderen Flussseite liegt.
export function waypoint(u, tx, ty) {
  if (u.air || u.ford) return [tx, ty]; // Flieger und Flussspringer nehmen den geraden Weg
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
  if (u.deployT > 0) {
    u.deployT -= dt;
    if (u.deployT <= 0 && d.deployDmg) { // Landung mit Erdstoß
      const dd = d.deployDmg;   // air: trifft auch Flieger, stun/slow: Dauer in Sekunden, tower: Anteil an Türmen (sonst voll)
      emit(g, { t: 'impact', x: u.x, y: u.y, r: dd.r });
      if (dd.stun) for (const e of g.ents) if (e.side !== u.side && e.kind !== 'tower' && e.hp > 0 && (dd.air || !e.air) && Math.hypot(e.x - u.x, e.y - u.y) <= dd.r + e.r * 0.6) stun(e, dd.stun);
      areaDamage(g, u.side, u.x, u.y, dd.r, Math.round(dd.dmg * cardMult(u.lvl)), !!dd.air, dd.tower ?? 1, dd.slow || 0, dd.knock ? { knock: dd.knock } : null);
    }
    return;
  }
  if (d.morph && u.hp <= u.maxHp * d.morph.at && (!UNITS[d.morph.unit].building || bankOf(u.y) !== 0)) { morph(g, u); return; }
  if (u.cloakT > 0) u.cloakT -= dt;
  if (u.revealT > 0) u.revealT -= dt;
  if (u.iceT > 0) u.iceT -= dt;
  if (d.burrow) { // vergraben, solange kein Ziel in Reichweite ist (und noch einen Moment danach oben)
    if (u.inRange) u.upT = 1; else if (u.upT > 0) u.upT -= dt;
    u.buried = u.upT <= 0;
  }
  u.hidden = u.cloakT > 0 || (!!d.stealth && u.revealT <= 0) || u.buried;
  if (u.rootT > 0) u.rootT -= dt;
  if (u.slowT > 0) u.slowT -= dt;
  if (u.hasteT > 0) u.hasteT -= dt;
  if (u.abilityCd > 0) u.abilityCd -= dt;
  if (u.curseT > 0) u.curseT -= dt;
  if (u.ampT > 0) u.ampT -= dt;
  if (u.wardT > 0) u.wardT -= dt;
  if (u.hookCd > 0) u.hookCd -= dt;
  if (u.life) { u.hp -= (u.maxHp / u.life) * dt; if (u.hp <= 0) { die(g, u); return; } }
  if (d.hatch) { // das Ei: bleibt es heil, schlüpft die Einheit erneut
    u.hatchT -= dt;
    if (u.hatchT <= 0) {
      const k = spawn(g, d.hatch.unit, u.side, u.x, u.y, { deployT: 0.4 }, u.lvl);
      if (u.clone) makeClone(k);
      emit(g, { t: 'hatch', x: u.x, y: u.y });
      u.hp = 0; // verschwindet ohne Todeswirkung
    }
    return;
  }
  if (u.stunT > 0) { u.stunT -= dt; u.rampT = 0; u.hookT = 0; if (d.resetOnStun) u.cd = u.atk; return; }
  if (d.enchant) { // zeichnet die nächsten Verbündeten, bis genug gezeichnet sind
    u.enchT -= dt;
    if (u.enchT <= 0) {
      u.enchT = 0.5;
      const en = d.enchant;
      let have = 0;
      for (const e of g.ents) if (e.ench && e.ench.by === u.id && e.hp > 0) have++;
      if (have < en.count) {
        let best = null, bd = en.r;
        for (const e of g.ents) {
          if (e.side !== u.side || e === u || e.kind !== 'unit' || e.hp <= 0 || !e.dmg || e.ench || e.d.kamikaze) continue;
          const dd = dist(u, e);
          if (dd <= bd) { bd = dd; best = e; }
        }
        if (best) { best.ench = { by: u.id, bonus: Math.round(en.bonus * cardMult(u.lvl)), every: en.every, n: 0 }; emit(g, { t: 'rune', x: best.x, y: best.y, fx: u.x, fy: u.y }); }
      }
    }
  }
  if (d.second) { // zweiter, unabhängiger Angriff (Besatzung, Geschoss, Ranke)
    u.cd2 -= dt * (u.slowT > 0 ? SLOW_FACTOR : 1);
    if (u.cd2 <= 0) {
      const s = d.second, list = [];
      for (const e of g.ents) {
        if (e.side === u.side || e.hp <= 0 || e.hidden || (e.air && !s.hitsAir) || (s.units && e.kind !== 'unit')) continue;
        if (edgeDist(u, e) > s.range || (s.minRange && dist(u, e) < s.minRange)) continue;
        list.push(e);
      }
      if (!list.length) u.cd2 = 0.2;
      else {
        list.sort((p, q) => dist(u, p) - dist(u, q) || p.id - q.id);
        u.cd2 = s.atk;
        const dmg2 = Math.round(s.dmg * cardMult(u.lvl));
        for (let i = 0; i < (s.count || 1); i++) {
          const e = list[i % list.length];
          g.projs.push({ x: u.x, y: u.y, ox: u.x, oy: u.y, sx: u.x, sy: u.y, tx: e.x, ty: e.y, targetId: e.id, speed: s.proj, dmg: dmg2, splash: s.splash || 0, slow: 0, stun: 0, root: s.root || 0, curse: null, burst: null,
            side: u.side, hitsAir: !!s.hitsAir, from: s.from, rune: false, air: u.air || e.air, srcId: u.id });
        }
        emit(g, { t: 'shoot', from: s.from, side: u.side, x: u.x, y: u.y });
      }
    }
  }
  if (d.kraft) {
    u.kraftT -= dt;
    if (u.kraftT <= 0) {
      u.kraftT += d.kraft.every;
      const S = g.sides[u.side];
      S.kraft = Math.min(MAX_KRAFT, S.kraft + 1);
      u.anim = 0.3;
      emit(g, { t: 'kraft', side: u.side, x: u.x, y: u.y });
    }
  }
  if (d.spawn) {
    u.spawnT -= dt;
    if (u.spawnT <= 0 && (!d.spawn.near || g.ents.some(e => e.side !== u.side && e.hp > 0 && !e.hidden && Math.hypot(e.x - u.x, e.y - u.y) - e.r <= d.spawn.near))) {   // near: nur wenn ein Gegner so nah ist
      u.spawnT = d.spawn.every;
      const f = u.side === 0 ? -1 : 1, n = d.spawn.count || 1;
      for (let i = 0; i < n; i++) spawn(g, d.spawn.unit, u.side, clamp(u.x + (i - (n - 1) / 2) * 0.6 + (rnd(g) - 0.5) * 0.3, 0.4, W - 0.4), clamp(u.y + f * (u.r + 0.4), 0.4, H - 0.4), { deployT: 0.3 }, u.lvl);
      u.anim = 0.3;
    }
  }
  if (!u.dmg || !u.active) return;
  if (d.ammo && u.ammo < d.ammo.max && (!u.inRange || u.ammo <= 0)) {
    u.ammoT += dt;
    if (u.ammoT >= d.ammo.reload) { u.ammoT = 0; u.ammo++; if (u.inRange) u.cd = Math.max(u.cd, u.atk); } // frisch geschmiedete Klinge: erst ausholen
  }
  const rate = (u.hasteT > 0 ? HASTE : 1) * (u.slowT > 0 ? SLOW_FACTOR : 1);
  u.cd = Math.max(0, u.cd - dt * rate * (u.cloakT > 0 ? u.cloakRate : 1));
  u.scan -= dt;
  let t = u.targetId ? g.byId.get(u.targetId) : null;
  if (t && (t.hp <= 0 || t.hidden || (d.minRange && dist(u, t) < d.minRange))) t = null;
  if (!t || (!u.inRange && u.scan <= 0)) {
    t = pickTarget(g, u);
    u.scan = 0.25;
    u.targetId = t ? t.id : 0;
    if (!t) { u.inRange = false; u.runT = 0; u.charging = false; u.rampT = 0; if (d.frenzy && d.frenzy.reset) u.stacks = 0; return; }
  }
  if (d.ramp && u.rampId !== t.id) { u.rampId = t.id; u.rampT = 0; }
  const dd = reachDist(u, t);
  if (dd <= u.range + (u.inRange ? 0.2 : 0)) {
    if (!u.inRange) { u.inRange = true; u.cd = u.charging ? 0 : Math.max(u.cd, d.first ?? (u.kind === 'unit' ? 0.4 : d.burrow ? 0.5 : 0.25)); }   // first: Zeit bis zum ersten Schlag
    if (t.x !== u.x) u.face = t.x > u.x ? 1 : -1;
    if (d.ramp) u.rampT += dt;
    if (u.cd <= 0 && (!d.ammo || u.ammo > 0)) {
      if (d.ammo) u.ammo--;
      strike(g, u, t);
      u.cd = u.atk * (d.frenzy ? Math.pow(d.frenzy.f, u.stacks) : 1);
    }
  } else {
    u.inRange = false; u.rampT = 0;
    if (d.frenzy && d.frenzy.reset) u.stacks = 0;
    if (u.kind === 'unit' && u.rootT <= 0) {
      if (d.hook) {
        if (u.hookT > 0) { // holt aus; danach fliegt der Haken
          u.hookT -= dt;
          if (u.hookT <= 0) {
            u.hookCd = d.hook.cd;
            const h = g.byId.get(u.hookId);
            if (h && h.hp > 0 && !h.hidden && edgeDist(u, h) <= d.hook.max + 1.5) pullHook(g, u, h);
          }
          return;
        }
        if (u.hookCd <= 0 && !t.air && dd >= d.hook.min && dd <= d.hook.max) {
          u.hookT = d.hook.wind; u.hookId = t.id; u.anim = d.hook.wind; u.vx = 0; u.vy = 0;
          emit(g, { t: 'hookcast', x: u.x, y: u.y, tx: t.x, ty: t.y });
          return;
        }
      }
      if (d.leap && !u.charging && !t.air && dd >= d.leap.min && dd <= d.leap.max) { u.charging = true; emit(g, { t: 'charge', x: u.x, y: u.y }); }
      if (d.charge) { u.runT += dt; if (!u.charging && u.runT >= d.charge.after) { u.charging = true; emit(g, { t: 'charge', x: u.x, y: u.y }); } }
      const [wx, wy] = waypoint(u, t.x, t.y);
      const dx = wx - u.x, dy = wy - u.y, len = Math.hypot(dx, dy) || 1;
      const stepLen = Math.min(u.speed * rate * (u.charging ? (d.charge || d.leap).speed : 1) * dt, len);
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
    if (u.air || u.ford || u.y <= RIVER_TOP || u.y >= RIVER_BOT) continue;
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
    if (z.blast) { // Bombe mit Lunte (Fassträger)
      z.delay -= dt;
      if (z.delay <= 0) {
        z.done = true;
        emit(g, { t: 'burst', x: z.x, y: z.y, r: z.r, side: z.side, big: true });
        areaDamage(g, z.side, z.x, z.y, z.r, z.blast.dmg, true, z.blast.tf || 1, z.blast.slow);
      }
      continue;
    }
    const c = CARDS[z.card];
    if (z.delay > 0) { z.delay -= dt; if (z.delay > 0) continue; }
    if (!z.hit) {
      z.hit = true;
      emit(g, { t: 'spell', spell: z.spell, side: z.side, x: z.x, y: z.y, r: z.r });
      const dmg = Math.round((c.dmg || 0) * z.mult);
      if (c.strikes) { // Blitze auf die zähesten Gegner im Kreis
        const top = g.ents.filter(e => e.side !== z.side && e.hp > 0 && inZone(z, e)).sort((p, q) => q.hp - p.hp || p.id - q.id).slice(0, c.strikes);
        emit(g, { t: 'bolts', x: z.x, y: z.y, hits: top.map(e => ({ x: e.x, y: e.y, air: e.air })) });
        for (const e of top) { if (e.kind !== 'tower') stun(e, c.stun); damage(g, e, e.kind === 'tower' ? dmg * (c.towerF ?? TOWER_SPELL_FACTOR) : dmg, z.side); }
      } else if (c.roll) {
        g.projs.push({ line: true, x: z.x, y: z.y, ox: z.x, oy: z.y, vx: 0, vy: z.side === 0 ? -1 : 1, left: c.roll.len, w: c.roll.w, speed: c.roll.speed, dmg, knock: c.knock || 0, side: z.side, hitsAir: false, from: z.spell, hit: new Set(), towerFactor: c.towerF ?? TOWER_SPELL_FACTOR,
          spawnEnd: c.rollSpawn ? { unit: c.rollSpawn.unit, count: c.rollSpawn.count, lvl: z.lvl } : null });
      } else {
        if (c.stun) for (const e of g.ents) if (e.side !== z.side && e.kind !== 'tower' && e.hp > 0 && inZone(z, e)) stun(e, c.stun);
        if (dmg) areaDamage(g, z.side, z.x, z.y, z.r, dmg, true, c.towerF ?? TOWER_SPELL_FACTOR, c.slow || 0, c.knock ? { knock: c.knock, kx: 0, ky: z.side === 0 ? -1 : 1 } : null);
      }
      if (c.clone) for (const e of [...g.ents]) { // Trugbild: jede eigene Truppe im Kreis bekommt ein Abbild
        if (e.side !== z.side || e.kind !== 'unit' || e.hp <= 0 || e.hero || e.clone || !e.speed || !inZone(z, e)) continue;
        makeClone(spawn(g, e.type, e.side, clamp(e.x + 0.7, 0.4, W - 0.4), e.y, { deployT: 0.3 }, e.lvl));
        emit(g, { t: 'clone', x: e.x, y: e.y, air: e.air });
      }
      if (c.freeze) for (const e of g.ents) if (e.side !== z.side && e.hp > 0 && inZone(z, e)) { stun(e, c.freeze); e.iceT = c.freeze; }
      if (c.summon) for (const [dx, dy] of formation(c.summon.count)) spawn(g, c.summon.unit, z.side, clamp(z.x + dx, 0.4, W - 0.4), offRiver(clamp(z.y + dy, 0.4, H - 0.4)), { deployT: 0.4 }, z.lvl);
      if (c.root) for (const e of g.ents) if (e.side !== z.side && e.kind === 'unit' && !e.air && e.hp > 0 && inZone(z, e)) e.rootT = c.root;
      if (c.haste) for (const e of g.ents) if (e.side === z.side && e.kind === 'unit' && e.hp > 0 && inZone(z, e)) e.hasteT = c.haste;
    }
    if (c.pull) for (const e of g.ents) { // zur Mitte ziehen, schwere Brocken langsamer
      if (e.side === z.side || e.kind !== 'unit' || e.hp <= 0 || !inZone(z, e)) continue;
      const dx = z.x - e.x, dy = z.y - e.y, L = Math.hypot(dx, dy);
      if (L < 0.2) continue;
      const k = Math.min(L, c.pull * Math.min(1, 0.45 / e.r) * dt);
      e.x += (dx / L) * k; e.y += (dy / L) * k;
    }
    if (c.amp || c.curse) for (const e of g.ents) { // Fluch: mehr Schaden; wer im Kreis fällt, wechselt die Seite
      if (e.side === z.side || e.hp <= 0 || e.kind === 'tower' || !inZone(z, e)) continue;
      if (c.amp) { e.ampT = 0.3; e.ampF = c.amp; }
      if (c.curse && e.kind === 'unit') { e.curseT = 0.5; e.curseSide = z.side; e.curseUnit = c.curse; e.curseLvl = z.lvl; }
    }
    if (c.summonOver) { // nach und nach wühlen sich Einheiten aus dem Boden
      z.t2 -= dt;
      if (z.t2 <= 1e-9 && z.n < c.summonOver.count) {
        z.t2 += c.summonOver.every; z.n++;
        const a = rnd(g) * Math.PI * 2, rr = Math.sqrt(rnd(g)) * (z.r - 0.5);
        const sx = clamp(z.x + Math.cos(a) * rr, 0.4, W - 0.4), sy = offRiver(clamp(z.y + Math.sin(a) * rr, 0.4, H - 0.4));
        spawn(g, c.summonOver.unit, z.side, sx, sy, { deployT: 0.4 }, z.lvl);
        emit(g, { t: 'rise', side: z.side, x: sx, y: sy });
      }
    }
    if (c.pulses) { // Stöße, die umso härter treffen, je weniger Gegner im Kreis stehen
      z.t2 -= dt;
      if (z.t2 <= 1e-9 && z.n < c.pulses.n) {
        z.t2 += c.pulses.every; z.n++;
        const hit = g.ents.filter(e => e.side !== z.side && e.hp > 0 && !e.buried && inZone(z, e));
        const per = Math.round(c.pulses.dmg[hit.length <= 1 ? 0 : hit.length <= 4 ? 1 : 2] * z.mult);
        emit(g, { t: 'pulse', x: z.x, y: z.y, r: z.r, n: hit.length });
        for (const e of hit) damage(g, e, e.kind === 'tower' ? per * (c.towerF ?? TOWER_SPELL_FACTOR) : per, z.side);
      }
    }
    if (c.heal || c.dot) {
      z.tickT -= dt;
      if (z.tickT <= 1e-9) {
        z.tickT += c.tick;
        if (c.dot) areaDamage(g, z.side, z.x, z.y, z.r, Math.round(c.dot * z.mult), !c.ground, c.towerF || TOWER_SPELL_FACTOR, c.slow || 0, c.buildF ? { buildF: c.buildF } : null);
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
    if (p.line) {
      const stepLen = Math.min(p.speed * dt, p.left);
      p.x += p.vx * stepLen; p.y += p.vy * stepLen; p.left -= stepLen;
      for (const e of g.ents) {
        if (e.side === p.side || e.hp <= 0 || p.hit.has(e.id) || (e.air && !p.hitsAir)) continue;
        const rx = e.x - p.x, ry = e.y - p.y, along = rx * p.vx + ry * p.vy, across = Math.abs(rx * p.vy - ry * p.vx);
        if (across > p.w / 2 + e.r * 0.6 || along > e.r + 0.3 || along < -stepLen - e.r - 0.3) continue;
        p.hit.add(e.id);
        if (p.knock && e.kind === 'unit' && e.r < 0.75) { // zurückstoßen (schwere Brocken bleiben stehen)
          e.x = clamp(e.x + p.vx * p.knock, 0.4, W - 0.4); e.y = clamp(e.y + p.vy * p.knock, 0.4, H - 0.4);
          e.inRange = false; e.runT = 0; e.charging = false;
        }
        damage(g, e, e.kind === 'tower' ? p.dmg * p.towerFactor : p.dmg, p.side, p.srcId ? g.byId.get(p.srcId) : undefined);
        emit(g, { t: 'hit', from: p.from, x: e.x, y: e.y });
      }
      if (p.left <= 1e-6) {
        if (p.back) { p.back = false; p.vx = -p.vx; p.vy = -p.vy; p.left = p.len; p.hit = new Set(); } // kehrt um und trifft alle noch einmal
        else {
          p.done = true;
          if (p.spawnEnd) for (let i = 0; i < p.spawnEnd.count; i++) spawn(g, p.spawnEnd.unit, p.side, clamp(p.x + i * 0.6, 0.4, W - 0.4), offRiver(clamp(p.y, 0.4, H - 0.4)), { deployT: 0.4 }, p.spawnEnd.lvl);
        }
      }
      continue;
    }
    const t = g.byId.get(p.targetId);
    const alive = t && t.hp > 0;
    if (alive) { p.tx = t.x; p.ty = t.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), stepLen = p.speed * dt;
    if (d <= stepLen + 0.05) {
      const src = p.srcId ? g.byId.get(p.srcId) : undefined;
      if (alive && t.wardT > 0 && !p.bounced && src && src.hp > 0) { // Stille Wacht: das Geschoss fliegt zum Schützen zurück
        p.bounced = true; p.targetId = src.id; p.srcId = t.id; p.side = t.side; p.sx = t.x; p.sy = t.y; p.tx = src.x; p.ty = src.y; p.hitsAir = true;
        emit(g, { t: 'shield', x: t.x, y: t.y });
        continue;
      }
      p.done = true;
      if (p.burst) { // zerspringt am Ziel; die Kerne fliegen in der Schussrichtung weiter
        const bx = p.tx - p.sx, by = p.ty - p.sy, L = Math.hypot(bx, by) || 1;
        g.projs.push({ line: true, x: p.tx - (bx / L) * 0.5, y: p.ty - (by / L) * 0.5, ox: p.tx, oy: p.ty, vx: bx / L, vy: by / L, left: p.burst.len, len: p.burst.len, back: false, w: p.burst.w, speed: 13, dmg: p.dmg, knock: 0,
          side: p.side, hitsAir: p.hitsAir, from: p.from + '_kern', hit: new Set(), towerFactor: 1, srcId: p.srcId });
      } else if (p.splash) areaDamage(g, p.side, p.tx, p.ty, p.splash, p.dmg, p.hitsAir, 1, p.slow, { src });
      else if (alive) {
        if (p.slow && t.kind === 'unit') t.slowT = Math.max(t.slowT, p.slow);
        if (p.stun && t.kind !== 'tower') stun(t, p.stun);
        if (p.root && t.kind === 'unit') t.rootT = Math.max(t.rootT, p.root);
        if (p.curse && t.kind === 'unit') { t.curseT = p.curse.dur; t.curseSide = p.curse.side; t.curseUnit = p.curse.unit; t.curseLvl = p.curse.lvl; }
        damage(g, t, p.dmg, p.side, src);
      }
      emit(g, { t: 'hit', from: p.from, x: p.tx, y: p.ty, splash: p.splash, frost: !!p.slow, root: !!p.root, curse: !!p.curse });
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
  for (const S of g.sides) S.kraft = Math.min(MAX_KRAFT, S.kraft + rate * dt * S.kraftMult);
  g.sides.forEach((S, side) => { // Boss-Verstärkung: am Hauptturm erscheinen regelmäßig Einheiten
    if (!S.passive) return;
    S.passiveT -= dt;
    if (S.passiveT > 0) return;
    S.passiveT += S.passive.every;
    const mt = mainTower(g, side);
    if (!mt || mt.hp <= 0) return;
    const f = side === 0 ? -1 : 1, n = S.passive.count || 1;
    for (let i = 0; i < n; i++) spawn(g, S.passive.unit, side, clamp(mt.x + (i - (n - 1) / 2) * 0.8, 0.4, W - 0.4), mt.y + f * 2.3, { deployT: 0.5 }, S.tower);
    emit(g, { t: 'deploy', side, x: mt.x, y: mt.y + f * 2.3, card: '' });
  });
  g.sides.forEach((S, side) => { // Segenstürme: regelmäßig steigt die zäheste eigene Truppe um eine Stufe
    if (!S.blessT) return;
    const ts = g.ents.filter(e => e.side === side && e.kind === 'tower' && e.d.bless && e.hp > 0);
    if (!ts.length) { S.blessT = 0; return; } // beide gefallen: kein Segen mehr
    const b = ts[0].d.bless;
    S.blessT -= dt * (1 - 0.2 * ts.filter(e => e.inRange).length - 0.2 * (2 - ts.length)); // im Gefecht und mit nur einem Turm langsamer
    if (S.blessT > 0) return;
    const u = g.ents.filter(e => e.side === side && e.kind === 'unit' && !e.blessed && e.deployT <= 0 && e.hp >= e.maxHp * b.min).sort((p, q) => q.maxHp - p.maxHp || p.id - q.id)[0];
    if (!u) { S.blessT = 1; return; } // gerade niemand da: gleich noch einmal schauen
    S.blessT = b.every;
    u.blessed = true; u.lvl++;
    u.maxHp = Math.round(u.maxHp * 1.1); u.hp = Math.round(u.hp * 1.1); u.dmg = Math.round(u.dmg * 1.1);
    emit(g, { t: 'bless', side, x: u.x, y: u.y, fx: ts[0].x, fy: ts[0].y });
  });
  if (g.waves) { // Ansturm: Seite 1 schickt immer stärkere Wellen über eine oder beide Brücken
    const wv = g.waves;
    wv.t -= dt;
    if (wv.t <= 0) {
      wv.n++; wv.t = Math.max(7, 12 - wv.n * 0.4);
      let budget = 4 + wv.n * 1.3;
      const lanes = wv.n % 4 === 0 ? [0, 1] : [wv.n % 2];
      emit(g, { t: 'wave', n: wv.n });
      for (let k = 0; budget >= 1 && k < 14; k++) {
        const id = wv.pool[Math.floor(rnd(g) * wv.pool.length)], c = CARDS[id];
        if (c.cost > budget + 0.5 && k < 9) continue;
        budget -= c.cost;
        const x = BRIDGES[lanes[k % lanes.length]] + (rnd(g) - 0.5) * 3, y = 4 + rnd(g) * 5;
        const units = c.mix ? c.mix.flatMap(([u, n]) => Array(n).fill(u)) : Array(c.count).fill(c.unit);
        formation(units.length).forEach(([dx, dy], i) => spawn(g, units[i], 1, clamp(x + dx, 0.4, W - 0.4), clamp(y + dy, 0.4, RIVER_TOP - 0.5), { deployT: 1 }, wv.lvl));
        emit(g, { t: 'deploy', side: 1, x, y, card: id });
      }
    }
  }
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
    else if (g.waves) finish(g, 0); // durchgehalten
    else if (g.sudden) { const la = lowestTower(g, 0), lb = lowestTower(g, 1); finish(g, Math.abs(la - lb) < 1 ? 'draw' : la > lb ? 0 : 1); }
    else { g.phase = 'over'; emit(g, { t: 'overtime' }); }
  } else if (g.phase === 'over' && g.time >= g.duration + g.overtime) {
    const la = lowestTower(g, 0), lb = lowestTower(g, 1);
    finish(g, Math.abs(la - lb) < 1 ? 'draw' : la > lb ? 0 : 1);
  }
}
