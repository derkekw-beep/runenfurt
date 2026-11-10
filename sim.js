// Spiel-Logik von Runenfurt: reine Simulation ohne Browser-Abhängigkeiten (läuft auch unter node --test).
// Seite 0 spielt von unten (großes y), Seite 1 von oben. Fester Zeitschritt DT.
import { UNITS, CARDS, RUNES, FORMS, TOWER_SPELL_FACTOR, HASTE, SLOW_FACTOR, sanitizeDeck } from './cards.js';
import { HERO_FORMS, formUse, formTick, formWorld, formShot, formStrike, formTowerF, formHurt, formFloor, formDeath, bannerUse } from './helden.js';

// Feldmaße wie im Genre üblich: 18 breit, 32 lang, der Fluss zwei Felder breit in der Mitte.
export const W = 18, H = 32;
export const RIVER_TOP = 15, RIVER_BOT = 17;
export const OUTER_Y = 6.5, MAIN_Y = 3; // Abstand der Türme von der eigenen Grundlinie
export const BRIDGES = [3.5, 14.5];
export const BRIDGE_HALF = 1.0; // die Brücken sind zwei Felder breit
export const DT = 1 / 30;
export const MAX_KRAFT = 10;
export const KRAFT_RATE = 1 / 2.8;
const SIGHT = 5.5; // Sichtweite, wenn die Figur keine eigene hat (sight)
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
    snareT: 0, snareF: 1, groundT: 0, hotN: 0, hotT: 0, hotAmt: 0, hotEvery: 0, souls: 0, summonN: 0, summonT: 0, idleT: 0, snipeN: d.snipe ? d.snipe.n : 0,
    face: side === 0 ? -1 : 1, anim: 0, vx: 0, vy: 0,
    ...extra,
  };
  g.ents.push(e);
  g.byId.set(e.id, e);
  return e;
}

// levels[s] = { cards: { kartenId: Stufe }, tower: Stufe des Hauptturms, outer: Stufe der Außentürme (sonst wie tower),
//              towerType: Turmkarte der Außentürme, runes: [kartenIds mit Runenform],
//              forms: [kartenIds, die als Heldenform spielen – siehe helden.js] } – fehlt etwas, gilt Stufe 1
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
    ents: [], projs: [], zones: [], events: [], dead: [], byId: new Map(), nextId: 1, sides: [], banners: [], whirls: [], nextGroup: 1,
  };
  for (let s = 0; s < 2; s++) {
    const deck = sanitizeDeck(decks && decks[s]);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd(g) * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    const lv = (levels && levels[s]) || {};
    const pick = key => (rules[key] && rules[key][s]) || null, passive = pick('passive');
    const forms = new Set((lv.forms || []).filter(id => HERO_FORMS[id] && CARDS[id])); // wer als Heldenform spielt, spielt nicht zugleich als Runenform
    g.sides.push({
      kraftMult: pick('kraft') || 1, speedMult: pick('speed') || 1, runeAlways: !!pick('runeAlways'), passive, passiveT: passive ? passive.every : 0,
      levels: lv.cards || {}, tower: lv.tower || 1, runes: new Set((lv.runes || []).filter(id => !forms.has(id))), forms, formLast: {}, cycle: {}, away: [], blessT: 0,
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
// Raster, Sperrflächen, nächstes freies Feld, Aufstellung und Auftrittstakt folgen den Regeln des Vorbilds.
// Nachgelesen im offenen Nachbau crforge (github.com/voonhous/crforge, Apache-2.0, Stand d3ae65de1e):
// core/battle/deploy/{CardPlacement,DeployMask,PlacementSearch,MapCheck,Formation,InitialDelay}.java und arena/standard_1v1_cells.txt.
// Unser Feld ist deren Feld um eine halbe Drehung gedreht: Seite 0 steht unten, so wie der Spieler es sieht.

const waterTile = (c, r) => r >= RIVER_TOP && r < RIVER_BOT && c !== 3 && c !== 14; // nur die mittlere Kachel jeder Brücke ist trocken
// Kacheln, auf die sich nichts setzen lässt: die Ecken der Grundlinien, die Randkacheln am Fluss und der Sockel der Haupttürme
const deadTile = (c, r) => ((r === 0 || r === H - 1) && (c < 6 || c > 11)) || ((r === RIVER_TOP - 1 || r === RIVER_BOT) && (c === 0 || c === W - 1))
  || (c >= 7 && c <= 10 && ((r >= 1 && r <= 4) || (r >= H - 5 && r <= H - 2)));
// Kacheln je Seite, die ein Gebäude belegt: aus dem Kollisionsradius (bis 0,5 → 2, bis 1,0 → 3). Der Hauptturm sperrt über seinen Sockel 4 × 4.
export const footprint = d => (d.main ? 2 : Math.floor((Math.round(d.r * 1000) + 499) / 500) + 1);

// Was für das Setzen einer Karte gilt
function placing(g, side, cardId) {
  let id = cardId, c = CARDS[id];
  if (c.mirror && g.sides[side].last) { id = g.sides[side].last; c = CARDS[id]; } // Widerhall: es gelten die Regeln der wiederholten Karte
  const spell = c.type === 'spell', f = FORMS[id] || {};
  return { fp: c.type === 'building' ? footprint(UNITS[c.unit]) : 1, enemyOk: (spell || !!c.anywhere) && !c.ownSide, onBuildings: spell, onWater: spell && !c.summon,
    margin: f.margin || 0, lane: !!f.lane };
}

// Offene Kacheln für eine Karte (1 = frei): gegnerische Türme halten ihre Hälfte frei – fällt ein Außenturm, öffnet sich die Tasche davor –,
// und jedes Gebäude sperrt seine eigene Fläche. Zauber dürfen auf Gebäude; manche Karten (lane) brauchen eine ganz freie Reihe.
function deployMask(g, side, P) {
  const open = new Uint8Array(W * H).fill(1);
  const close = (x, y, w, h) => {
    const c0 = Math.max(0, Math.floor(x - w / 2 + 1e-6)), c1 = Math.min(W, Math.floor(x + w / 2 + 1e-6));
    const r0 = Math.max(0, Math.floor(y - h / 2 + 1e-6)), r1 = Math.min(H, Math.floor(y + h / 2 + 1e-6));
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) open[r * W + c] = 0;
  };
  for (const e of g.ents) {
    if (e.kind === 'unit' || e.hp <= 0 || e.digT > 0) continue;
    if (e.kind === 'tower' && e.side !== side && !P.enemyOk) close(e.x, e.y, e.main ? 18 : 11, e.main ? 16 : 21);
    else if (!P.onBuildings) { const fp = footprint(e.d); close(e.x, e.y, fp, fp); }
  }
  if (P.lane) for (let r = 0; r < H; r++) { let whole = 1; for (let c = 0; c < W; c++) whole &= open[r * W + c]; if (!whole) open.fill(0, r * W, (r + 1) * W); }
  return open;
}

function legalAt(P, open, px, py) {
  const c0 = Math.floor(px - P.fp / 2 + 1e-6), r0 = Math.floor(py - P.fp / 2 + 1e-6);
  for (let c = c0; c < c0 + P.fp; c++) for (let r = r0; r < r0 + P.fp; r++) {
    if (c < P.margin || c >= W - P.margin || r < 0 || r >= H || !open[r * W + c]) return false;
    if (waterTile(c, r) ? !P.onWater : deadTile(c, r) && !P.onBuildings) return false;
  }
  return true;
}

// Wo eine Karte landet: Der Punkt rastet auf die Mitte seiner Kachel ein (Gebäude mit gerader Fläche auf die Ecke). Ist die Kachel nicht erlaubt,
// gilt die nächste erlaubte im engsten Ring darum. blocked, wenn es nirgends geht.
export function clampDeploy(g, side, cardId, x, y) {
  const P = placing(g, side, cardId), open = deployMask(g, side, P);
  const cx = clamp(x, 0, W - 0.001), cy = clamp(y, 0, H - 0.001), even = P.fp % 2 === 0;
  const sx = even ? Math.ceil(cx) : Math.floor(cx) + 0.5, sy = even ? Math.ceil(cy) : Math.floor(cy) + 0.5;
  for (let r = 0; r <= 30; r++) {
    let best = null, bd = Infinity;
    for (let j = 0; j < (r === 0 ? 1 : 2 * r); j++) for (let k = 0; k < (r === 0 ? 1 : 4); k++) {
      let dx = k & 1 ? -r : j - r, dy = k & 1 ? r - j : -r;
      if (k > 1) { dx = -dx; dy = -dy; }
      const px = sx - dx, py = sy - dy;
      if (!legalAt(P, open, px, py)) continue;
      const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    if (best) return best;
  }
  return { x: clamp(x, 0.5, W - 0.5), y: clamp(y, 0.5, H - 0.5), blocked: true };
}

// Liegt der Punkt auf der Kachel, auf der die Karte landet? (Ein Punkt im gesperrten Feld würde woandershin verschoben.)
export function canDeploy(g, side, cardId, x, y) {
  const p = clampDeploy(g, side, cardId, x, y), tol = (placing(g, side, cardId).fp % 2 === 0 ? 1 : 0.5) + 1e-6;
  return !p.blocked && Math.abs(p.x - x) <= tol && Math.abs(p.y - y) <= tol;
}

// Für das Raster beim Setzen: auf welchen Kacheln die Karte landen kann, ohne verschoben zu werden (Index reihe * W + spalte, 1 = ja)
export function deployTiles(g, side, cardId) {
  const P = placing(g, side, cardId), open = deployMask(g, side, P), out = new Uint8Array(W * H), k = P.fp % 2 === 0 ? 1 : 0.5;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) out[r * W + c] = legalAt(P, open, c + k, r + k) ? 1 : 0;
  return out;
}

// Die Reihen, in denen die Figuren einer gesetzten Karte stehen dürfen: von der vordersten freien Kachel ihrer Spalte (deren Mitte) bis zur hintersten.
// So stellt sich niemand in den Fluss. Ohne Grenze, wenn die Spalte weit ins gegnerische Feld offen ist.
function columnSpan(g, side, cardId, px) {
  const open = deployMask(g, side, { ...placing(g, side, cardId), onBuildings: false }), c = clamp(Math.floor(px), 0, W - 1);
  let lo = -1, hi = -1;
  for (let r = 0; r < H; r++) if (open[r * W + c]) { if (lo < 0) lo = r; hi = r; }
  if (lo < 0) return null;
  const span = side === 0 ? [lo + 0.5, hi + 1] : [lo, hi + 0.5];
  return span[1] - span[0] >= 16 ? null : span;
}

const sin1024 = deg => Math.round(Math.sin((deg * Math.PI) / 180) * 1024);
const idiv = (a, b) => (b === 0 ? 0 : Math.trunc(a / b));
// Platz der index-ten Figur einer Karte um den gesetzten Punkt, in Tausendstel Feldern und in der Ausrichtung der Quelle (Formation.java):
// eine Figur auf dem Punkt; zwei bis sechs auf einem Ring; sieben als eine in der Mitte und sechs im Ring; ab acht eine Spirale;
// zwei Gruppen stehen sich verschränkt gegenüber (die erste vorn); Karten mit Breite stellen ihre Figuren in eine Reihe.
// n1/n2 Größe der ersten/zweiten Gruppe, bottom = die untere Seite der Quelle (bei uns Seite 0).
export function formOffset(index, n1, radius, width, bottom, shift, n2) {
  let slots = n2 > 0 ? 2 * Math.max(n1, n2) : n1;
  const pair = width !== 0 && n2 === 1;
  if (slots === 1) return [0, 0];
  if (slots === 7) { if (index === 0) return [0, 0]; index -= 1; slots = 6; }
  else shift += slots === 2 ? 90 : slots === 3 ? 180 : slots === 4 ? 45 : slots === 5 ? 180 : 0;
  if (slots >= 3 && width === 0) radius = idiv(radius * 577, idiv(sin1024(idiv(90, n1)) * 1000, 1024)); // der Ring wächst mit der Zahl der Figuren
  if (slots >= 7) radius = idiv(radius * ((3 * index) % 7), 6);
  if (pair) return index === 0 ? [0, 0] : [width, bottom ? -radius : radius];
  let xa, ya, yd;
  if (n2 === 0) { const a = idiv(360 * index, slots) + shift; xa = a + 180; ya = a + 90; yd = 1024; }
  else {
    let p2 = idiv(idiv(360, slots), 2), p1 = p2, sh = n1 === 1 ? 0 : shift;
    if (n1 < n2) p1 += idiv(idiv(180, n2), 2); else if (n2 < n1) p2 += idiv(idiv(180, n1), 2);
    if (n1 === 1 && index === 0) p1 = 90;
    if (n1 >= 2 && n2 === 1) { if (index < n1) p1 = idiv(90, n1); sh = 0; }
    if (index >= n1) { const a = p2 + sh + idiv(360 * (index - n1), slots); xa = a + 270; ya = a + 180; }
    else { const a = p1 + sh + idiv(360 * index, slots); xa = a + 90; ya = a; }
    yd = -1024;
  }
  let x = idiv(sin1024(xa) * radius, 1024), y = idiv(sin1024(ya) * radius, yd);
  if (width !== 0) { x = idiv(index * width, slots - 1) - idiv(width, 2); y = radius * (index % 2) - idiv(radius, 2); if (bottom) { x = -x; y = -y; } }
  else if (bottom) y = -y;
  return [x, y];
}
// Aufstellung von n gleichen Figuren um einen Punkt, in Feldern (Seite 0 schaut nach oben); r = Kollisionsradius oder der Radius der Karte
export function formation(n, r = 0.5, side = 0) {
  const out = [];
  for (let i = 0; i < n; i++) { const [x, y] = formOffset(i, n, Math.round(r * 1000), 0, side === 0, 0, 0); out.push([-x / 1000, -y / 1000]); }
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
  g.zones.push({ spell: c.spell, card: id, side, x, y, r: c.radius, delay, dur: c.dur || (c.waves ? (c.waves.n - 1) * c.waves.every + 0.01 : c.vines ? c.vines.dur : 0), tickT: c.dot ? c.tick : 0, done: false, mult: cardMult(lvl), lvl,
    n: 0, t2: c.summonOver ? c.summonOver.first : c.pulses ? c.pulses.first : 0 });
}

// Was passiert, wenn die Karte bei (x, y) losgelassen wird? Grundlage für playCard und für die Vorschau beim Ziehen.
//   x, y     der Punkt, an dem die Karte wirklich landet (auf die Kachel eingerastet, aufs erlaubte Feld geholt)
//   ok       false, wenn es für die Karte gerade kein freies Feld gibt
//   kind     'spell' | 'building' | 'troop'
//   radius   Wirkungskreis eines Zaubers, sonst 0
//   tiles    belegte Kacheln eines Gebäudes { x0, y0, w, h } in Feldmaßen, sonst null
//   spots    jede Figur einzeln: { unit, x, y, r, wait } – wait = Sekunden, die sie nach der ersten erscheint (bei Zaubern leer)
// null, wenn es nichts zu setzen gibt (Widerhall ohne Vorgänger).
export function deployPlan(g, side, cardId, x, y) {
  const hc = CARDS[cardId], S = g.sides[side];
  if (!hc || (hc.mirror && !S.last)) return null;
  const id = hc.mirror ? S.last : cardId, c = CARDS[id];
  const R = !hc.mirror && runeReady(g, side, id) ? RUNES[id] : null;
  const p = clampDeploy(g, side, cardId, x, y);
  const out = { x: p.x, y: p.y, ok: !p.blocked, kind: c.type === 'spell' ? 'spell' : c.type === 'building' ? 'building' : 'troop', radius: c.type === 'spell' ? c.radius || 0 : 0, tiles: null, spots: [] };
  if (c.type === 'spell') return out;
  const mixed = c.mix && !R; // gemischter Trupp: die zuerst genannten Einheiten stehen vorn
  const list = mixed ? c.mix.flatMap(([u, n]) => Array(n).fill(u)) : Array((R && R.count) || c.count).fill(R ? R.unit : c.unit);
  const n1 = mixed ? c.mix[0][1] : list.length, n2 = list.length - n1;
  const f = FORMS[id] || {}, first = UNITS[list[0]];
  if (first.building) { const fp = footprint(first); out.tiles = { x0: p.x - fp / 2, y0: p.y - fp / 2, w: fp, h: fp }; }
  const radius = Math.round((f.r || first.r) * 1000), width = Math.round((f.w || 0) * 1000), col = columnSpan(g, side, cardId, p.x);
  list.forEach((unit, i) => {
    const d = UNITS[unit], [bx, by] = formOffset(i, n1, radius, width, side === 0, f.shift || 0, n2);
    let uy = p.y - by / 1000;
    if (col && !d.air) uy = clamp(uy, col[0], col[1]);
    out.spots.push({ unit, x: clamp(p.x - bx / 1000, 0.25, W - 0.25), y: clamp(uy, 0.25, H - 0.25), r: d.r, wait: (f.lag || 0) * (first.building ? 1 : i) });
  });
  return out;
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
  const plan = deployPlan(g, side, hid, x, y); // vor dem Weiterzählen des Runenzyklus: der Plan fragt selbst nach der Runenform
  const form = !hc.mirror && S.forms.has(id) ? { id, group: g.nextGroup++ } : null; // Heldenform: die Figuren dieser Ausspielung gehören zusammen
  if (form) S.formLast[id] = form.group;
  x = plan.x; y = plan.y;                      // die Karte landet auf ihrer Kachel
  if (!hc.mirror && S.runes.has(id) && RUNES[id]) S.cycle[id] = R ? 0 : (S.cycle[id] || 0) + 1;
  S.kraft -= cost;
  S.spent += cost;
  if (hc.hero) S.away.push(hid); else S.queue.push(hid); // ein Held kommt erst zurück in den Stapel, wenn er gefallen ist
  S.hand[handIdx] = S.next;
  S.next = S.queue.shift();
  if (!hc.mirror && !hc.hero) S.last = hid;
  if (c.type === 'spell') {
    castZone(g, id, side, x, y, lvl, c.delay);
    if (form) g.zones[g.zones.length - 1].form = form;
    emit(g, { t: 'cast', spell: c.spell, side, x, y, r: c.radius, delay: c.delay, echo: !!hc.mirror });
  } else {
    const home = mainTower(g, side);
    for (const s of plan.spots) { // die Figuren eines Trupps erscheinen kurz nacheinander
      const d = UNITS[s.unit], dig = d.tunnel && home ? Math.hypot(s.x - home.x, s.y - home.y) / d.tunnel : 0; // wer gräbt, braucht vom eigenen Hauptturm bis zum Ziel seine Zeit
      spawn(g, s.unit, side, s.x, s.y, { deployT: (d.deploy || 1) + s.wait, cardId: c.hero ? id : '', ...(dig ? { digT: dig, hidden: true } : {}), ...(form ? { formId: form.id, formGroup: form.group, hero: true } : {}) }, lvl);
    }
    emit(g, { t: 'deploy', side, x, y, card: id, rune: !!R, hero: !!c.hero || !!form, echo: !!hc.mirror });
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
  // Heldenformen: der Knopf gehört zur zuletzt gespielten Karte und bleibt, solange von ihr jemand steht (Abbilder zählen nicht)
  for (const id of S.forms) {
    const a = HERO_FORMS[id].ability, grp = S.formLast[id];
    if (!grp) continue;
    let e = null;
    for (const o of g.ents) if (o.side === side && o.formGroup === grp && o.hp > 0 && !o.clone) { e = o; break; }
    if (a.id === 'bannerruf') { // erst das Banner der gefallenen Wichte macht den Ruf möglich
      const b = g.banners.find(o => o.side === side && o.t > 0 && !o.used);
      if (!e && !b) continue;
      out.push({ cardId: id, form: true, ent: b ? { id: 0, x: b.x, y: b.y, r: 0.5, hp: 1, maxHp: 1, lvl: b.lvl, deployT: 0, inRange: false } : e, ability: a, cd: 0, ready: !!b && S.kraft >= a.cost, used: false, wait: !b, left: b ? b.t : 0 });
      continue;
    }
    if (!e) continue;
    out.push({ cardId: id, form: true, ent: e, ability: a, cd: 0, ready: e.deployT <= 0 && !(e.digT > 0) && e.stunT <= 0 && S.kraft >= a.cost && !e.abilityUsed, used: !!e.abilityUsed });
  }
  return out;
}

export function useAbility(g, side, cardId) {
  const st = abilities(g, side).find(s => s.cardId === cardId);
  if (g.over || !st || !st.ready) return false;
  const S = g.sides[side], h = st.ent, a = st.ability, m = cardMult(h.lvl);
  if (st.form) { // Heldenform: die Wirkung selbst steht in helden.js
    S.kraft -= a.cost; S.spent += a.cost;
    if (a.id === 'bannerruf') return bannerUse(FORM_API, g, side);
    h.abilityUsed = true; h.anim = 0.3;
    formUse(FORM_API, g, side, h, a);
    return true;
  }
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
    h.cloakT = a.dur; h.cloakRate = a.rate; h.cloakSlow = a.slow || 1; h.hidden = true;
  } else if (a.id === 'wurzelheer') {
    // Seelenruf wie im Vorbild: nach kurzer Pause steigt alle a.every Sekunden ein Abbild-Kiesel aus dem Boden – sechs, dazu einer je gesammelter Seele
    h.summonN = Math.min(a.max, a.count + h.souls); h.summonT = a.delay; h.souls = 0;
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
    spawn(g, a.unit, side, h.x, gy, { deployT: 0.3 }, h.lvl);
    hits.push({ x: h.x, y: gy });
  }
  emit(g, { t: 'ability', id: a.id, side, x: h.x, y: h.y, r: a.radius, hits });
  return true;
}

// ---- Schaden -----------------------------------------------------------------------------------

function stun(e, t) {
  if (e.charging && e.d.dashGuard) return; // mitten im Sprung prallt auch die Betäubung ab
  e.stunT = Math.max(e.stunT, t); e.inRange = false; e.runT = 0; e.charging = false;
  if (e.d.rampKeep) e.rampT = 0;
  if (e.d.frenzy && e.d.frenzy.reset) e.stacks = 0;
}

function die(g, e) {
  e.hp = 0;
  emit(g, { t: 'die', kind: e.kind, type: e.type, model: e.model, side: e.side, x: e.x, y: e.y, air: e.air, main: e.main });
  if (e.formId) formDeath(FORM_API, g, e);
  g.dead.push(e);
}

// src: die angreifende Einheit (fehlt bei Zaubern) – nur sie kann einen Rückschlag abbekommen
function damage(g, e, amount, bySide, src) {
  if (e.digT > 0) return; // unter der Erde trifft nichts
  if (e.hp <= 0 || g.over) return;
  if ((e.buried && !g.deep) || (e.charging && e.d.dashGuard)) return; // vergraben oder mitten im Sprung: nichts trifft (g.deep: Frost und Beben reichen auch unter die Erde)
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
  if (e.formMode) amount = formHurt(e, amount);
  if (e.shield > 0) { // der Schild fängt den Treffer ganz ab, auch wenn er dabei bricht
    e.shield -= amount;
    if (e.shield <= 0) {
      e.shield = 0; emit(g, { t: 'shield', x: e.x, y: e.y });
      const sb = e.d.shieldBurst;   // Evolution: der brechende Schild trifft alles ringsum und stößt zurück
      if (sb) { emit(g, { t: 'burst', x: e.x, y: e.y, r: sb.r, side: e.side }); areaDamage(g, e.side, e.x, e.y, sb.r, Math.round(sb.dmg * cardMult(e.lvl)), true, 1, 0, { knock: sb.knock }); }
    }
    return;
  }
  e.hp -= amount;
  if (e.formMode && e.hp < formFloor(e)) e.hp = formFloor(e); // Bärenzorn: das Leben fällt nicht unter eins
  if (e.d.dropAt && !e.dropped && e.hp > 0 && e.hp <= e.maxHp * e.d.dropAt.at) { e.dropped = true; e.dropNow = true; }
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
    // Seelen (Wurzelkönig): jede gefallene Truppe in ihrer letzten Gestalt zählt, gleich von welcher Seite – keine Abbilder, keine Gebäude
    if (e.kind === 'unit' && !e.clone && (!d.deathSpawn || d.second)) for (const k of g.ents) if (k.hp > 0 && k.cardId && CARDS[k.cardId].ability.souls) k.souls = Math.min(CARDS[k.cardId].ability.souls, k.souls + 1);
    if (e.reborn) continue;   // der wiedergeschlüpfte Glutfalke verbrennt nichts mehr und legt kein Ei
    if (d.deathDmg && !e.spent) {
      const dd = d.deathDmg, dmg = Math.round(dd.dmg * cardMult(e.lvl));
      if (dd.delay) { // Bombe mit Lunte
        g.zones.push({ blast: { dmg, slow: dd.slow || 0 }, side: e.side, x: e.x, y: e.y, r: dd.r, delay: dd.delay, dur: 0, done: false });
        emit(g, { t: 'fuse', x: e.x, y: e.y, r: dd.r, delay: dd.delay });
      } else {
        emit(g, { t: 'burst', x: e.x, y: e.y, r: dd.r, side: e.side, frost: !!dd.slow });
        areaDamage(g, e.side, e.x, e.y, dd.r, dmg, true, dd.tower ?? 1, dd.slow || 0, dd.knock ? { knock: dd.knock } : null);   // Todesschaden trifft Boden und Luft
      }
    }
    if (e.ownerId) { const o = g.byId.get(e.ownerId); if (o && o.hp > 0 && o.d.spawnHeal) overheal(g, o, o.d.spawnHeal.amt, o.d.spawnHeal.over); }   // Evolution: fällt ein Gerufener, heilt das die Ruferin
    if (d.kraft && d.kraft.death) { const S = g.sides[e.side]; S.kraft = Math.min(MAX_KRAFT, S.kraft + d.kraft.death); emit(g, { t: 'kraft', side: e.side, x: e.x, y: e.y }); }
    if (d.deathZone) castZone(g, d.deathZone, e.side, e.x, e.y, e.lvl, 0.05);
    if (d.deathSpawn && !(d.deathSpawn.killed && e.spent)) {   // killed: nur wenn besiegt, nicht nach dem eigenen Einschlag
      const n = d.deathSpawn.count, air = UNITS[d.deathSpawn.unit].air;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.5, rr = n > 1 ? 0.6 : 0, sy = clamp(e.y + Math.sin(a) * rr, 0.4, H - 0.4);
        const k = spawn(g, d.deathSpawn.unit, e.side, clamp(e.x + Math.cos(a) * rr, 0.4, W - 0.4), air || !e.air ? sy : offRiver(sy), { deployT: d.deathSpawn.wait ?? 0.5, ...(d.deathSpawn.hit1 ? { first: d.deathSpawn.hit1 } : {}) }, e.lvl);
        if (e.clone) makeClone(k);
      }
    }
    if (d.bounty) { // jedes gefallene Stück schenkt dem Gegner Kraft
      const F = g.sides[1 - e.side];
      F.kraft = Math.min(MAX_KRAFT, F.kraft + d.bounty);
      emit(g, { t: 'kraft', side: 1 - e.side, x: e.x, y: e.y });
    }
    if (d.enchant) for (const o of g.ents) if (o.ench && o.ench.by === e.id) o.ench.until = g.time + (d.enchant.linger || 0); // die Runenzeichen erlöschen kurz nach dem Hünen
    if (e.curseT > 0 && e.kind === 'unit' && e.curseUnit && !e.spent) { // verflucht gefallen: steht für die andere Seite wieder auf
      spawn(g, e.curseUnit, e.curseSide, e.x, UNITS[e.curseUnit].air ? e.y : offRiver(e.y), { deployT: e.curseWait ?? 0.5, ...(e.curseHit1 ? { first: e.curseHit1 } : {}) }, e.curseLvl);
      emit(g, { t: 'curse', side: e.curseSide, x: e.x, y: e.y });
    }
  }
}

// Heilen über das volle Leben hinaus (Evolutionen): höchstens over × Anfangsleben; der Lebensbalken wächst mit
function overheal(g, u, amt, over) {
  if (u.hp <= 0) return;
  u.hp0 = u.hp0 || u.maxHp;
  u.hp = Math.min(Math.round(u.hp0 * over), u.hp + Math.round(amt * cardMult(u.lvl)));
  u.maxHp = Math.max(u.maxHp, u.hp);
  emit(g, { t: 'heal', x: u.x, y: u.y });
}

// Heilung in Schüben (wie im Vorbild: vier Schübe im Abstand einer Viertelsekunde); eine neue Heilung löst die laufende ab
function healOver(e, total, pulses = 1, every = 0) {
  e.hotN = pulses; e.hotAmt = total; e.hotEvery = every; e.hotT = 0;   // hotAmt: was noch aussteht
}

// Heilerin: alle eigenen Truppen ringsum bekommen die Heilung in Schüben – sie selbst und andere Heilerinnen nicht
function healAround(g, u, h) {
  const amt = Math.round(h.amt * cardMult(u.lvl));
  for (const e of g.ents) if (e !== u && !e.d.healHit && e.side === u.side && e.kind === 'unit' && e.hp > 0 && dist(u, e) <= h.r + e.r) healOver(e, amt, h.pulses, h.every);
}

// Nur das Laufen bremsen (Gift, Beben, Fessel): f = verbleibender Anteil des Tempos; die stärkere Bremse gilt
function snare(e, dur, f) {
  e.snareF = e.snareT > 0 ? Math.min(e.snareF, f) : f;
  e.snareT = Math.max(e.snareT, dur);
}

// Wen ein Stoß versetzt: schwere Figuren bleiben stehen (noKnock an der Einheit, sonst ab Trefferfläche 0,75)
const canKnock = e => e.kind === 'unit' && !e.buried && !(e.d.noKnock ?? e.r >= 0.75);

// Stoß um die Einheit herum (Landung, Auftauchen). air: trifft auch Flieger, stun/slow: Dauer in Sekunden, tower: Anteil an Türmen (sonst voll)
function groundPulse(g, u, dd) {
  emit(g, { t: 'impact', x: u.x, y: u.y, r: dd.r });
  if (dd.stun) for (const e of g.ents) if (e.side !== u.side && e.kind !== 'tower' && e.hp > 0 && (dd.air || !e.air) && Math.hypot(e.x - u.x, e.y - u.y) <= dd.r + e.r) stun(e, dd.stun);
  areaDamage(g, u.side, u.x, u.y, dd.r, Math.round(dd.dmg * cardMult(u.lvl)), !!dd.air, dd.tower ?? 1, dd.slow || 0, dd.knock ? { knock: dd.knock } : null);
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
// Reichweite: alle messen von Rand zu Rand, auch Türme und Gebäude (wie im Vorbild: Reichweite plus beide Kollisionsradien).
// Ein Außenturm (7,5 Felder) erreicht damit eine Figur, die mitten auf der Brücke steht.
const reachDist = edgeDist;

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
    if (Math.hypot(e.x - x, e.y - y) > radius + e.r) continue; // getroffen ist, wessen Trefferfläche den Kreis berührt
    if (slow && e.kind === 'unit') e.slowT = Math.max(e.slowT, slow);
    if (o && o.knock && canKnock(e)) push(e, o.kx === undefined ? e.x - x : o.kx, o.kx === undefined ? e.y - y : o.ky, o.knock);
    damage(g, e, e.kind === 'tower' ? dmg * towerFactor : e.kind === 'building' && o && o.buildF ? dmg * o.buildF : dmg, side, o ? o.src : undefined);
  }
}

// Einheit ein Stück in eine Richtung stoßen; ihr Angriff oder Anlauf ist damit unterbrochen
function push(e, dx, dy, k) {
  const L = Math.hypot(dx, dy) || 1;
  e.x = clamp(e.x + (dx / L) * k, 0.4, W - 0.4); e.y = clamp(e.y + (dy / L) * k, 0.4, H - 0.4);
  e.inRange = false; e.runT = 0; e.charging = false;
  if (e.d.frenzy && e.d.frenzy.reset) e.stacks = 0;
}

function shoot(g, u, t, dmg) {
  g.projs.push({ x: u.x, y: u.y, ox: u.x, oy: u.y, sx: u.x, sy: u.y, tx: t.x, ty: t.y, targetId: t.id, speed: u.proj, dmg, splash: u.splash, slow: u.d.slow || 0, stun: u.d.stunHit || 0, root: 0,
    curse: u.d.curse ? { ...u.d.curse, side: u.side, lvl: u.lvl } : null, burst: u.d.burst || null, hitSpawn: u.d.hitSpawn ? { ...u.d.hitSpawn, lvl: u.lvl } : null,
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
    stun(h, 0.4);   // die Bremse nach dem Haken gibt es im Vorbild seit April 2026 nicht mehr
  } else {
    u.x = h.x - (dx / L) * gap; u.y = h.y - (dy / L) * gap; u.ox = u.x; u.oy = u.y;
  }
  u.inRange = false; u.targetId = h.id;
}

function strike(g, u, t) {
  const d = u.d;
  if (u.formMode === 'wirbel') return;                      // im Klingenwirbel schlägt sie nicht einzeln zu – der Wirbel trifft
  u.anim = 0.3;
  if (u.formMode && formShot(FORM_API, g, u, t)) return;    // Standwurf
  let dmg = u.dmg, knock = 0;
  if (u.formMode && t.kind === 'tower') dmg = Math.round(dmg * formTowerF(u));
  const melee = !!d.melee && !t.air && edgeDist(u, t) <= d.melee.range;   // Schützenbund: aus der Nähe wird mit dem Bajonett zugestochen
  if (melee) dmg = Math.round(d.melee.dmg * cardMult(u.lvl));
  else if (u.snipeN > 0) { u.snipeN--; dmg = Math.round(d.snipe.dmg * cardMult(u.lvl)); }   // auch aus der Nähe sind die ersten Schüsse Scharfschüsse
  if (d.farBonus && dist(u, t) >= d.farBonus.min) dmg = Math.round(dmg * d.farBonus.f);   // Fernschuss: mehr Schaden ab diesem Abstand
  if (u.charging) { dmg *= (d.charge || d.leap).dmg; knock = (d.leap && d.leap.knock) || 0; u.charging = false; emit(g, { t: 'impact', x: t.x, y: t.y }); }
  u.runT = 0;
  if (d.stealth) u.revealT = d.stealth;
  if (d.ramp) { for (const [after, f] of d.ramp) if (u.rampT >= after) dmg = u.dmg * f; }
  if (d.combo && ++u.comboN >= d.combo.every) { u.comboN = 0; dmg *= d.combo.f; knock = d.combo.knock; emit(g, { t: 'impact', x: t.x, y: t.y }); }
  if (u.ench) { // Zeichen eines Runenhünen: jeder dritte Treffer schlägt mit Zusatzschaden ein
    const by = g.byId.get(u.ench.by);
    if (u.ench.until !== undefined ? g.time > u.ench.until : !by || by.hp <= 0) u.ench = null;   // until: der Hüne ist gefallen, das Zeichen hält noch einen Augenblick
    else if (++u.ench.n >= u.ench.every) { u.ench.n = 0; dmg += u.ench.bonus; emit(g, { t: 'ench', x: t.x, y: t.y, air: t.air }); }
  }
  if (d.kamikaze === 'drop') { die(g, u); return; }   // lässt am Ziel nur die Fracht fallen: Schaden und Insassen kommen aus dem Tod
  if (d.kamikaze) {
    u.spent = true;
    if (d.chain) chainHit(g, u, t, dmg);
    else if (u.splash) areaDamage(g, u.side, t.x, t.y, u.splash, dmg, u.hitsAir, 1, 0, { src: u });
    else damage(g, t, dmg, u.side, u);
    if (d.stunArea) for (const e of g.ents) { // Frost: alles ringsum erstarrt kurz
      if (e.side === u.side || e.hp <= 0 || Math.hypot(e.x - t.x, e.y - t.y) > u.splash + e.r) continue;
      stun(e, d.stunArea); if (d.ice) e.iceT = d.stunArea;
    }
    if (d.again) g.zones.push({ blast: { dmg, stun: d.stunArea || 0, ice: !!d.ice }, side: u.side, x: t.x, y: t.y, r: u.splash, delay: d.again, dur: 0, done: false });   // Evolution: dieselbe Wirkung noch einmal
    if (d.healBurst) {
      const amt = Math.round(d.healBurst.amt * cardMult(u.lvl));
      for (const e of g.ents) if (e !== u && e.side === u.side && e.kind === 'unit' && e.hp > 0 && Math.hypot(e.x - t.x, e.y - t.y) <= d.healBurst.r + e.r) healOver(e, amt, d.healBurst.pulses, d.healBurst.every);
    }
    emit(g, { t: 'hit', from: u.model, x: t.x, y: t.y, splash: u.splash || (d.healBurst ? d.healBurst.r : 0), frost: !!d.ice });
    if (u.hp > 0) die(g, u);
    return;
  }
  if (d.chain) chainHit(g, u, t, dmg);
  else if (d.scatter) scatterShot(g, u, t, dmg);
  else if (d.line) { // Geschoss, das auf gerader Bahn durch alles hindurchgeht (mit „back“ kehrt es zum Werfer zurück)
    const dx = t.x - u.x, dy = t.y - u.y, L = Math.hypot(dx, dy) || 1;
    g.projs.push({ line: true, x: u.x, y: u.y, ox: u.x, oy: u.y, sx: u.x, sy: u.y, vx: dx / L, vy: dy / L, left: d.line.len, len: d.line.len, back: !!d.line.back, near: d.line.near || null, w: d.line.w, speed: u.proj, dmg, knock: d.knock || 0, side: u.side, hitsAir: u.hitsAir, from: u.model, hit: new Set(), towerFactor: 1, srcId: u.id });
    emit(g, { t: 'shoot', from: u.model, side: u.side, x: u.x, y: u.y });
  } else if (u.proj && !melee) {
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
    else if (u.splash && !melee) { areaDamage(g, u.side, t.x, t.y, u.splash, dmg, u.hitsAir, 1, 0, { src: u, knock: d.combo ? 0 : knock }); if (!d.combo) knock = 0; }
    else {
      damage(g, t, t.kind === 'tower' && d.towerDmg ? dmg * d.towerDmg : dmg, u.side, u);
      if (d.killHeal && t.hp <= 0 && t.kind !== 'tower') overheal(g, u, (d.killHeal.tiers.find(([hp]) => t.maxHp < hp) || d.killHeal.tiers[d.killHeal.tiers.length - 1])[1], d.killHeal.over);   // Evolution: jeder Gefällte heilt
    }
    if (knock && t.hp > 0 && (canKnock(t) || (d.combo && d.combo.all && t.kind === 'unit'))) { const fwd = d.combo && d.combo.fwd; push(t, fwd ? 0 : t.x - u.x, fwd ? (u.side === 0 ? -1 : 1) : t.y - u.y, knock); }   // fwd: immer in Richtung der gegnerischen Türme
    if (d.ramp && !d.rampMelee) emit(g, { t: 'beam', x: u.x, y: u.y, tx: t.x, ty: t.y, from: u.model, air: u.air, tair: t.air, hot: dmg / u.dmg });
    else emit(g, { t: 'hit', from: u.model, x: d.spin ? u.x : t.x, y: d.spin ? u.y : t.y, heavy: dmg >= 300, spin: d.spin ? d.spin + u.r : 0 });
  }
  if (d.healHit) healAround(g, u, d.healHit);
  if (d.frenzy) u.stacks = Math.min(d.frenzy.stages ? d.frenzy.per * (d.frenzy.stages.length - 1) : d.frenzy.max, u.stacks + 1);
  if (d.hitHaste) u.hasteT = Math.max(u.hasteT, d.hitHaste);   // Evolution: jeder Schlag treibt ihn selbst an
  if (d.strikeWave) { const w = d.strikeWave; emit(g, { t: 'impact', x: u.x, y: u.y, r: w.r }); areaDamage(g, u.side, u.x, u.y, w.r, Math.round(w.dmg * cardMult(u.lvl)), false, 1, 0, { knock: w.knock }); }   // Evolution: Druckwelle um den Schützen
  if (d.leech) { u.leechN = d.leech.pulses; u.leechT = 0; }
  if (d.rageTrail) u.trailN = (u.trailN || 0) + 1;
  if (u.formId) formStrike(FORM_API, g, u, t);
  u.rampIdle = 0;
}

// ---- Zielsuche ---------------------------------------------------------------------------------

// Zielwahl wie im Vorbild (crforge: pathfinding/target/CandidateSelector, RangeTest, DefaultTargetSelection):
// Es zählt der Gegner, dessen Mitte am nächsten liegt, unter allen in Sicht – Sichtweite plus beide Kollisionsradien, Türme sieht eine Truppe
// zwei Felder weiter. Gebäude und Türme sehen so weit, wie sie schießen. Solange das Ziel nicht in Reichweite ist, wird jeden Takt neu gewählt.
export function pickTarget(g, u) {
  const isStatic = u.kind !== 'unit', sight = isStatic ? u.range : u.sight || u.d.sight || SIGHT, min = u.d.minRange || 0;
  let best = null, bd = Infinity;
  for (const e of g.ents) {
    if (!canHit(u, e)) continue;
    const d = dist(u, e), rr = u.r + e.r;
    if (min && d < min + rr) continue; // zu nah für eine Belagerungswaffe
    if (d > sight + rr + (e.kind === 'tower' && !isStatic ? 2 : 0)) continue;
    if (d < bd) { bd = d; best = e; }
  }
  if (best || isStatic) return best;
  // Nichts in Sicht: zum Außenturm der eigenen Bahn (dem in der Breite näheren), wenn er näher liegt als der Hauptturm – sonst zum Hauptturm.
  // Gesetzte Gebäude sind kein Marschziel; sie locken erst, wenn sie in Sicht kommen.
  let main = null, lane = null, ld = Infinity;
  for (const e of g.ents) {
    if (e.kind !== 'tower' || !canHit(u, e)) continue;
    if (e.main) main = e; else if (Math.abs(e.x - u.x) < ld) { ld = Math.abs(e.x - u.x); lane = e; }
  }
  return lane && (!main || dist(u, lane) < dist(u, main)) ? lane : main || lane;
}

const bankOf = y => (y < RIVER_TOP ? -1 : y > RIVER_BOT ? 1 : 0);
// Punkt aus dem Wasser ans nähere Ufer schieben
const offRiver = y => (y > RIVER_TOP - 0.4 && y < RIVER_BOT + 0.4 ? (y < (RIVER_TOP + RIVER_BOT) / 2 ? RIVER_TOP - 0.4 : RIVER_BOT + 0.4) : y);
// Was die Heldenformen (helden.js) vom Spielkern brauchen
const FORM_API = { spawn, damage, areaDamage, stun, emit, cardMult, offRiver, W, H };

// Nächster Wegpunkt für Bodentruppen: über die Brücke, wenn das Ziel auf der anderen Flussseite liegt.
export function waypoint(u, tx, ty) {
  if (u.air || u.ford) return [tx, ty]; // Flieger und Flussspringer nehmen den geraden Weg
  const a = bankOf(u.y), b = bankOf(ty);
  if (a === b) return [tx, ty];
  let bx = BRIDGES[0], bc = Infinity;
  for (const c of BRIDGES) { const cost = Math.abs(u.x - c) + Math.abs(tx - c); if (cost < bc) { bc = cost; bx = c; } }
  const lim = BRIDGE_HALF - 0.25;
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

// ---- Wege über das Feld ---------------------------------------------------------------------------
// Bodentruppen suchen ihren Weg wie im Vorbild über ein Raster aus halben Feldern (36 × 64 Zellen): Straßen sind billiger als Gelände,
// eigene Gebäude und Türme teuer (man läuft außen herum), Wasser ist nur für Flussspringer begehbar. Gesucht wird mit acht Richtungen und
// stark gewichteter Schätzung, das Ziel ist die Zelle in Schlagweite, die der Figur am nächsten liegt.
// Nachgelesen in crforge (docs/pathfinding.md, pathfinding/grid/*): Kosten 8 Gelände, 5 Straße, 7 Wasser für Springer, 50 Gebäude;
// Schritt gerade ×10, schräg ×14; Schätzung 10·max + 4·min, Gewicht 5. Flieger nehmen den geraden Weg.
const CW = W * 2, CH = H * 2, NC = CW * CH;
const roadCell = (c, r) => {
  const x = c > CW / 2 - 1 ? CW - 1 - c : c, y = r > CH / 2 - 1 ? CH - 1 - r : r; // die Karte ist in beiden Richtungen spiegelgleich
  if (y < 2) return false;
  if (y < 5) return x >= 14;
  if (y < 9) return x >= 5;
  if (y === 9) return (x >= 5 && x <= 9) || x >= 14;
  if (y < 17) return x >= 4 && x <= 9;
  if (y < 31) return x >= 5 && x <= 8;
  return x === 6 || x === 7;
};
const waterCell = (c, r) => r >= RIVER_TOP * 2 && r < RIVER_BOT * 2 && !((c >= 5 && c <= 8) || (c >= 27 && c <= 30));
const BASE = new Uint8Array(NC); // 0 Wasser, 5 Straße, 8 Gelände
for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) BASE[r * CW + c] = waterCell(c, r) ? 0 : roadCell(c, r) ? 5 : 8;
const cellOf = (x, y) => clamp(Math.floor(y * 2), 0, CH - 1) * CW + clamp(Math.floor(x * 2), 0, CW - 1);
const cellX = n => (n % CW) * 0.5 + 0.25, cellY = n => Math.floor(n / CW) * 0.5 + 0.25;

// Zellen, die die Gebäude und Türme einer Seite belegen (nur die eigenen stehen einer Figur im Weg); je Takt höchstens einmal geprüft
function occluded(g, side) {
  let o = g.occ;
  if (!o) o = g.occ = { time: -1, ver: 0, cells: [new Uint8Array(NC), new Uint8Array(NC)] };
  if (o.time !== g.time) {
    o.time = g.time;
    let ver = 7;
    for (const e of g.ents) if (e.kind !== 'unit' && e.hp > 0) ver = (Math.imul(ver, 31) + e.id * 4 + (e.buried ? 1 : 0)) | 0;
    if (ver !== o.ver) {
      o.ver = ver; o.cells[0].fill(0); o.cells[1].fill(0);
      for (const e of g.ents) {
        if (e.kind === 'unit' || e.hp <= 0 || e.digT > 0) continue;
        const c0 = Math.max(0, Math.floor((e.x - e.r) * 2 + 1e-6)), c1 = Math.min(CW - 1, Math.ceil((e.x + e.r) * 2 - 1e-6) - 1);
        const r0 = Math.max(0, Math.floor((e.y - e.r) * 2 + 1e-6)), r1 = Math.min(CH - 1, Math.ceil((e.y + e.r) * 2 - 1e-6) - 1);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) o.cells[e.side][r * CW + c] = 1;
      }
    }
  }
  return o;
}

const rG = new Int32Array(NC), rFrom = new Int16Array(NC), rSeen = new Uint32Array(NC), rDone = new Uint32Array(NC);
let rStamp = 0;
const DIRS = [[0, -1, 10], [0, 1, 10], [-1, 0, 10], [1, 0, 10], [-1, -1, 14], [-1, 1, 14], [1, 1, 14], [1, -1, 14]];
// Weg von der Zelle start zur Zelle goal: Zellen vom Ziel rückwärts bis zum ersten Schritt, oder null, wenn es keinen gibt
function findRoute(occ, water, start, goal) {
  if (start === goal) return [];
  const stamp = ++rStamp, gc = goal % CW, gr = Math.floor(goal / CW), hN = [start], hF = [0];
  rG[start] = 0; rSeen[start] = stamp; rFrom[start] = -1;
  while (hN.length) {
    // kleinsten Eintrag vom Haufen nehmen
    const n = hN[0], lastN = hN.pop(), lastF = hF.pop();
    if (hN.length) {
      let i = 0;
      for (;;) {
        let k = 2 * i + 1;
        if (k >= hN.length) break;
        if (k + 1 < hN.length && hF[k + 1] < hF[k]) k++;
        if (hF[k] >= lastF) break;
        hN[i] = hN[k]; hF[i] = hF[k]; i = k;
      }
      hN[i] = lastN; hF[i] = lastF;
    }
    if (rDone[n] === stamp) continue;
    rDone[n] = stamp;
    if (n === goal) {
      const path = [];
      for (let k = goal; k !== start; k = rFrom[k]) path.push(k);
      return path;
    }
    const c = n % CW, r = Math.floor(n / CW), g0 = rG[n];
    for (const [dc, dr, w] of DIRS) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc >= CW || nr < 0 || nr >= CH) continue;
      const m = nr * CW + nc;
      if (rDone[m] === stamp) continue;
      const cost = occ[m] ? 50 : BASE[m] || water;
      if (!cost) continue;
      const ng = g0 + cost * w;
      if (rSeen[m] === stamp && ng >= rG[m]) continue;
      rSeen[m] = stamp; rG[m] = ng; rFrom[m] = n;
      const dx = Math.abs(nc - gc), dy = Math.abs(nr - gr), f = ng + 5 * (10 * Math.max(dx, dy) + 4 * Math.min(dx, dy));
      let i = hN.length;
      hN.push(m); hF.push(f);
      while (i > 0) { const p = (i - 1) >> 1; if (hF[p] <= f) break; hN[i] = hN[p]; hF[i] = hF[p]; i = p; }
      hN[i] = m; hF[i] = f;
    }
  }
  return null;
}

// Der Weg einer Bodentruppe zu ihrem Ziel: geplant bis zur nächsten Zelle in Schlagweite, neu geplant, wenn das Ziel wechselt oder wandert
// oder ein Gebäude dazukommt oder fällt. Gibt den Punkt zurück, auf den die Figur jetzt zuläuft.
function routePoint(g, u, t) {
  if (u.air) return [t.x, t.y];
  const o = occluded(g, u.side), occ = o.cells[u.side];
  let rt = u.rt;
  if (!rt || rt.id !== t.id || rt.ver !== o.ver || Math.abs(rt.tx - t.x) + Math.abs(rt.ty - t.y) > 0.75 || (rt.path && rt.path.length && Math.hypot(cellX(rt.path[rt.path.length - 1]) - u.x, cellY(rt.path[rt.path.length - 1]) - u.y) > 3)) {
    // Ziel des Wegs: unter den Zellen in Schlagweite (Reichweite plus beide Trefferflächen) die der Figur nächste; trockene, freie Zellen zuerst
    const reach = u.range + u.r + t.r - 0.05, k = Math.floor(reach * 2) + 1, tc = clamp(Math.floor(t.x * 2), 0, CW - 1), tr = clamp(Math.floor(t.y * 2), 0, CH - 1);
    let goal = -1, rank = 0, bd = Infinity;
    for (let r = Math.max(0, tr - k); r <= Math.min(CH - 1, tr + k); r++) for (let c = Math.max(0, tc - k); c <= Math.min(CW - 1, tc + k); c++) {
      const n = r * CW + c, x = cellX(n), y = cellY(n);
      if (Math.hypot(x - t.x, y - t.y) > reach) continue;
      const rk = (BASE[n] === 0 && !u.ford) || occ[n] ? 1 : 2, d = (x - u.x) * (x - u.x) + (y - u.y) * (y - u.y);
      if (rk > rank || (rk === rank && d < bd)) { rank = rk; bd = d; goal = n; }
    }
    rt = u.rt = { id: t.id, ver: o.ver, tx: t.x, ty: t.y, path: goal < 0 ? null : findRoute(occ, u.ford ? 7 : 0, cellOf(u.x, u.y), goal) };
  }
  const p = rt.path;
  if (!p) return waypoint(u, t.x, t.y); // kein Weg im Raster: wie früher über die nächste Brücke
  // Zellen abhaken, die erreicht sind; die Figur zielt dabei immer eine Zelle voraus und schneidet so Ecken leicht an
  while (p.length && Math.hypot(cellX(p[p.length - 1]) - u.x, cellY(p[p.length - 1]) - u.y) < (p.length > 1 ? 0.75 : 0.3)) p.pop();
  if (!p.length) return [t.x, t.y];
  const n = p[p.length - 1];
  return [cellX(n), cellY(n)];
}

function updateEnt(g, u, dt) {
  const d = u.d;
  if (u.anim > 0) u.anim -= dt;
  if (u.digT > 0) { u.digT -= dt; u.hidden = u.digT > 0; return; } // noch unter der Erde unterwegs
  if (u.deployT > 0) {
    u.deployT -= dt;
    if (u.deployT <= 0 && d.deployDmg) { // Landung mit Erdstoß
      groundPulse(g, u, d.deployDmg);
    }
    if (u.deployT <= 0 && d.deployDmg && d.surfaceDmg) u.pulseCd = 1;   // der Stoß beim Aufstellen gilt auch für das erste Auftauchen gleich danach
    if (u.deployT <= 0 && d.deployHeal) { emit(g, { t: 'heal', x: u.x, y: u.y }); healAround(g, u, d.deployHeal); }   // Heilung bei der Landung
    if (u.deployT <= 0 && d.snipe) u.cd = d.first || 0;
    return;
  }
  if (u.formId) formTick(FORM_API, g, u, dt);
  if (u.hotN > 0) { // Heilung in Schüben
    u.hotT -= dt;
    if (u.hotT <= 0) {
      const amt = Math.round(u.hotAmt / u.hotN);
      u.hotAmt -= amt; u.hotN--; u.hotT += u.hotEvery;
      if (u.hp < u.maxHp) { u.hp = Math.min(u.maxHp, u.hp + amt); emit(g, { t: 'heal', x: u.x, y: u.y }); }
    }
  }
  if (u.groundT > 0) { u.groundT -= dt; if (u.groundT <= 0) u.air = !!d.air; }   // von Ranken heruntergeholt: danach wieder in der Luft
  if (u.snareT > 0) u.snareT -= dt;
  if (u.summonN > 0) { // Seelenruf: einer nach dem anderen steigt aus dem Boden
    u.summonT -= dt;
    if (u.summonT <= 0) {
      const a = CARDS[u.cardId].ability, w = rnd(g) * Math.PI * 2, rr = Math.sqrt(rnd(g)) * a.radius;
      const sx = clamp(u.x + Math.cos(w) * rr, 0.4, W - 0.4), sy = offRiver(clamp(u.y + Math.sin(w) * rr, 0.4, H - 0.4));
      u.summonT += a.every; u.summonN--;
      makeClone(spawn(g, a.unit, u.side, sx, sy, { deployT: 0.4 }, u.lvl));
      emit(g, { t: 'rise', side: u.side, x: sx, y: sy });
    }
  }
  if (d.morph && u.hp <= u.maxHp * d.morph.at && (!UNITS[d.morph.unit].building || bankOf(u.y) !== 0)) { morph(g, u); return; }
  if (u.cloakT > 0) u.cloakT -= dt;
  if (u.revealT > 0) u.revealT -= dt;
  if (u.iceT > 0) u.iceT -= dt;
  if (d.burrow) { // vergraben, solange kein Ziel in Reichweite ist (und noch einen Moment danach oben)
    if (u.inRange) u.upT = 1; else if (u.upT > 0) u.upT -= dt;
    const was = u.buried;
    u.buried = u.upT <= 0;
    if (u.pulseCd > 0) u.pulseCd -= dt;
    if (was && !u.buried && d.surfaceDmg && !(u.pulseCd > 0)) groundPulse(g, u, d.surfaceDmg);   // Evolution: Stoß bei jedem Auftauchen
  }
  u.hidden = u.cloakT > 0 || (!!d.stealth && u.revealT <= 0) || u.buried;
  if (u.rootT > 0) u.rootT -= dt;
  if (u.slowT > 0) u.slowT -= dt;
  if (u.dropNow) { // Evolution: lässt bei dieser Lebensschwelle eine erste Fracht fallen (mit Todesschaden)
    u.dropNow = false;
    const dr = d.dropAt, dd = d.deathDmg;
    if (dd) { emit(g, { t: 'burst', x: u.x, y: u.y, r: dd.r, side: u.side }); areaDamage(g, u.side, u.x, u.y, dd.r, Math.round(dd.dmg * cardMult(u.lvl)), false, dd.tower ?? 1, dd.slow || 0); }
    for (let i = 0; i < dr.count; i++) { const a = (i / dr.count) * Math.PI * 2; spawn(g, dr.unit, u.side, clamp(u.x + Math.cos(a) * 0.6, 0.4, W - 0.4), offRiver(clamp(u.y + Math.sin(a) * 0.6, 0.4, H - 0.4)), { deployT: 0.5 }, u.lvl); }
  }
  if (u.leechN > 0) { u.leechT -= dt; if (u.leechT <= 0) { u.leechN--; u.leechT = d.leech.every; overheal(g, u, d.leech.heal, d.leech.over); } }   // Evolution: jeder Biss heilt in Schüben
  if (d.rageTrail && u.hp <= u.maxHp * d.rageTrail.below) { // Evolution: unter dieser Lebensschwelle immer wieder Antrieb für alle Eigenen ringsum; der Kreis wächst mit jedem Schlag
    u.trailT = (u.trailT || 0) - dt;
    if (u.trailT <= 0) {
      const rt = d.rageTrail, r = Math.min(rt.max, rt.r0 + rt.grow * (u.trailN || 0));
      u.trailT = rt.every;
      for (const e of g.ents) if (e.side === u.side && e.kind === 'unit' && e.hp > 0 && Math.hypot(e.x - u.x, e.y - u.y) <= r + e.r) e.hasteT = Math.max(e.hasteT, rt.dur);
      emit(g, { t: 'trail', side: u.side, x: u.x, y: u.y, r });
    }
  }
  if (d.rampKeep) u.rampIdle = (u.rampIdle || 0) + dt;
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
      const k = spawn(g, d.hatch.unit, u.side, u.x, u.y, { deployT: 0.4, reborn: !!d.hatch.once }, u.lvl);   // once: wer geschlüpft ist, hinterlässt beim nächsten Tod nichts mehr
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
        if (edgeDist(u, e) > s.range || (s.minRange && dist(u, e) < s.minRange + u.r + e.r)) continue;
        list.push(e);
      }
      if (!list.length) u.cd2 = 0.2;
      else {
        list.sort((p, q) => dist(u, p) - dist(u, q) || p.id - q.id);
        u.cd2 = s.atk;
        const dmg2 = Math.round(s.dmg * cardMult(u.lvl));
        for (let i = 0; i < (s.count || 1); i++) {
          const e = list[i % list.length];
          g.projs.push({ x: u.x, y: u.y, ox: u.x, oy: u.y, sx: u.x, sy: u.y, tx: e.x, ty: e.y, targetId: e.id, speed: s.proj, dmg: dmg2, splash: s.splash || 0, slow: 0, stun: 0, root: s.root || 0, snare: s.snare || null, curse: null, burst: null,
            side: u.side, hitsAir: !!s.hitsAir, from: s.from, rune: false, air: u.air || e.air, srcId: u.id });
        }
        emit(g, { t: 'shoot', from: s.from, side: u.side, x: u.x, y: u.y });
      }
    }
  }
  const pace = (u.hasteT > 0 ? HASTE : 1) * (u.slowT > 0 ? SLOW_FACTOR : 1);   // Antrieb und Bremse wirken auch auf Nachschub und Kraftgewinn
  if (d.kraft) {
    u.kraftT -= dt * pace;
    if (u.kraftT <= 0) {
      u.kraftT += d.kraft.every;
      const S = g.sides[u.side];
      S.kraft = Math.min(MAX_KRAFT, S.kraft + 1);
      u.anim = 0.3;
      emit(g, { t: 'kraft', side: u.side, x: u.x, y: u.y });
    }
  }
  if (d.spawn) {
    u.spawnT -= dt * pace;
    if (d.spawn.busy && u.inRange) u.spawnT = Math.min(u.spawnT, d.spawn.busy);   // busy: kürzerer Takt, solange sie kämpft
    if (u.spawnT <= 0 && (!d.spawn.below || u.hp <= u.maxHp * d.spawn.below) && (!d.spawn.near || g.ents.some(e => e.side !== u.side && e.hp > 0 && !e.hidden && Math.hypot(e.x - u.x, e.y - u.y) - e.r <= d.spawn.near))) {   // near: nur wenn ein Gegner so nah ist
      u.spawnT = d.spawn.busy && u.inRange ? d.spawn.busy : d.spawn.every;
      const f = u.side === 0 ? -1 : 1, n = d.spawn.count || 1;
      for (let i = 0; i < n; i++) {
        const heals = d.spawnHeal && (!d.spawnHeal.first || (u.called = (u.called || 0) + 1) <= d.spawnHeal.first);   // Evolution: nur die ersten Gerufenen heilen sie
        spawn(g, d.spawn.unit, u.side, clamp(u.x + (i - (n - 1) / 2) * 0.6 + (rnd(g) - 0.5) * 0.3, 0.4, W - 0.4), clamp(u.y + f * (d.spawn.back ? -d.spawn.back : u.r + 0.4), 0.4, H - 0.4), { deployT: 0.3 + i * (d.spawn.gap || 0), ownerId: heals ? u.id : 0, ...(d.spawn.hit1 ? { first: d.spawn.hit1 } : {}) }, u.lvl);   // gap: die Gerufenen kommen nacheinander, hit1: eigener erster Schlag
      }
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
  if (u.snipeN > 0 && u.cd <= 0) { // Scharfschüsse (Runenform der Bolzenschützin): die ersten Schüsse reichen in ihrer Bahn über das ganze Feld
    const sn = d.snipe;
    let best = null, bd = sn.range;
    for (const e of g.ents) { if (!canHit(u, e) || Math.abs(e.x - u.x) > sn.w / 2 + e.r) continue; const dd = edgeDist(u, e); if (dd <= bd) { bd = dd; best = e; } }
    if (best && bd > u.range) {
      u.snipeN--; u.cd = u.atk; u.anim = 0.3; u.face = best.x > u.x ? 1 : -1;
      g.projs.push({ x: u.x, y: u.y, ox: u.x, oy: u.y, sx: u.x, sy: u.y, tx: best.x, ty: best.y, targetId: best.id, speed: sn.proj, dmg: Math.round(sn.dmg * cardMult(u.lvl)), splash: 0, slow: 0, stun: 0, root: 0, curse: null, burst: null,
        side: u.side, hitsAir: true, from: u.model, rune: true, air: u.air || best.air, srcId: u.id });
      emit(g, { t: 'shoot', from: u.model, side: u.side, x: u.x, y: u.y });
    }
  }
  if (u.tauntT > 0) { // Schildruf: wer gerufen wurde, greift so lange den Rufer an
    u.tauntT -= dt; const tt = g.byId.get(u.tauntId);
    if (u.tauntT > 0 && tt && tt.hp > 0 && !tt.hidden && !(tt.air && !u.hitsAir)) { if (u.targetId !== tt.id) { u.targetId = tt.id; u.inRange = false; } u.scan = 0.2; } else { u.tauntT = 0; u.scan = 0; }
  }
  let t = u.targetId ? g.byId.get(u.targetId) : null;
  if (t && (t.hp <= 0 || t.hidden || (d.minRange && dist(u, t) < d.minRange + u.r + t.r))) t = null;
  if (!t || (!u.inRange && u.scan <= 0)) {
    t = pickTarget(g, u);
    u.scan = 0.05; // ohne Ziel in Reichweite praktisch jeden Takt neu wählen
    u.targetId = t ? t.id : 0;
    if (!t) { u.inRange = false; u.runT = 0; u.charging = false; if (!(d.rampKeep && u.rampIdle < d.rampKeep)) u.rampT = 0; u.idleT += dt; if (d.frenzy && d.frenzy.reset && u.idleT > (d.frenzy.keep || 0)) u.stacks = 0; return; }
  }
  if (d.ramp && u.rampId !== t.id) { u.rampId = t.id; if (!(d.rampKeep && u.rampIdle < d.rampKeep)) u.rampT = 0; }   // rampKeep: die Stufe bleibt so viele Sekunden ohne Treffer erhalten
  const dd = reachDist(u, t);
  if (dd <= u.range + (u.inRange ? 0.2 : 0)) {
    if (!u.inRange) { u.inRange = true; u.cd = u.charging ? 0 : Math.max(u.cd, u.first ?? d.first ?? (u.kind === 'unit' ? 0.4 : d.burrow ? 0.5 : 0.25)); }   // first: Zeit bis zum ersten Schlag (u.first: eigener Wert der Gerufenen)
    if (t.x !== u.x) u.face = t.x > u.x ? 1 : -1;
    if (d.ramp) u.rampT += dt;
    u.idleT = 0;
    if (u.cd <= 0 && (!d.ammo || u.ammo > 0)) {
      if (d.ammo) u.ammo--;
      strike(g, u, t);
      const fz = d.frenzy;   // stages: feste Taktstufen, alle fz.per Schüsse eine weiter; sonst wird jeder Schlag um den Faktor f schneller
      u.cd = !fz ? u.atk : fz.stages ? fz.stages[Math.min(fz.stages.length - 1, Math.floor(u.stacks / fz.per))] : u.atk * Math.pow(fz.f, u.stacks);
    }
  } else {
    u.inRange = false; if (!(d.rampKeep && u.rampIdle < d.rampKeep)) u.rampT = 0;
    u.idleT += dt;
    if (d.frenzy && d.frenzy.reset && u.idleT > (d.frenzy.keep || 0)) u.stacks = 0;
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
      if (d.charge && !u.onFoot && !(d.charge.noShield && u.shield > 0)) { u.runT += u.speed * rate * dt; // Anlauf nach Strecke (charge.after in Feldern), wie im Vorbild
         if (!u.charging && u.runT >= d.charge.after) { u.charging = true; emit(g, { t: 'charge', x: u.x, y: u.y }); } }
      const [wx, wy] = routePoint(g, u, t);
      const dx = wx - u.x, dy = wy - u.y, len = Math.hypot(dx, dy) || 1;
      const stepLen = Math.min(u.speed * rate * (u.snareT > 0 ? u.snareF : 1) * (u.cloakT > 0 ? u.cloakSlow || 1 : 1) * (u.charging ? (d.charge || d.leap).speed : 1) * dt, len);
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
    if (a.hp <= 0 || a.digT > 0) continue;
    for (let j = i + 1; j < E.length; j++) {
      const b = E[j];
      if (b.hp <= 0 || b.digT > 0 || a.air !== b.air) continue;
      const aS = a.kind !== 'unit', bS = b.kind !== 'unit';
      if (aS && bS) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const min = aS ? a.r + Math.min(b.r, 0.5) : bS ? b.r + Math.min(a.r, 0.5) : a.r + b.r, d2 = dx * dx + dy * dy; // ein Gebäude reicht höchstens ein halbes Feld in die Figur hinein
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
        // Wie im Vorbild schiebt die schwerere Figur: jede weicht im Verhältnis der Masse der anderen zur eigenen, höchstens 0,2 Felder je Takt
        const ma = a.d.mass || 1, mb = b.d.mass || 1, qa = ma * ma, qb = mb * mb, k = Math.min(over * 0.7, 0.2);
        const fa = qb / (qa + qb), fb = qa / (qa + qb);
        a.x -= nx * k * fa; a.y -= ny * k * fa;
        b.x += nx * k * fb; b.y += ny * k * fb;
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
    const lim = BRIDGE_HALF;
    if (Math.abs(u.x - bx) <= BRIDGE_HALF + 0.3 && bankOf(u.oy) === 0) u.x = clamp(u.x, bx - lim, bx + lim);
    else if (Math.abs(u.x - bx) <= lim) { /* auf der Brücke */ }
    else u.y = u.oy <= RIVER_TOP ? RIVER_TOP : u.oy >= RIVER_BOT ? RIVER_BOT : u.y < (RIVER_TOP + RIVER_BOT) / 2 ? RIVER_TOP : RIVER_BOT;
  }
}

const inZone = (z, e) => Math.hypot(e.x - z.x, e.y - z.y) <= z.r + e.r;

function updateZones(g, dt) {
  for (const z of g.zones) {
    if (z.blast) { // Bombe mit Lunte (Fassträger)
      z.delay -= dt;
      if (z.delay <= 0) {
        z.done = true;
        emit(g, { t: 'burst', x: z.x, y: z.y, r: z.r, side: z.side, big: !z.blast.stun, frost: !!z.blast.ice });
        if (z.blast.stun) for (const e of g.ents) if (e.side !== z.side && e.hp > 0 && Math.hypot(e.x - z.x, e.y - z.y) <= z.r + e.r) { stun(e, z.blast.stun); if (z.blast.ice) e.iceT = z.blast.stun; }
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
        g.projs.push({ line: true, x: z.x, y: z.y, ox: z.x, oy: z.y, vx: 0, vy: z.side === 0 ? -1 : 1, left: c.roll.len, w: c.roll.w, speed: c.roll.speed, dmg, knock: c.knock || 0, knockAll: !!c.knockAll, side: z.side, hitsAir: false, from: z.spell, hit: new Set(), towerFactor: c.towerF ?? TOWER_SPELL_FACTOR,
          spawnEnd: c.rollSpawn ? { unit: c.rollSpawn.unit, count: c.rollSpawn.count, lvl: z.lvl, wait: c.rollSpawn.wait, form: z.form || null } : null });
      } else if (c.vines) { // Ranken: die zähesten Ziele im Kreis werden festgehalten, Flieger dabei auf den Boden geholt
        z.held = g.ents.filter(e => e.side !== z.side && e.hp > 0 && !e.buried && !e.hidden && inZone(z, e)).sort((p, q) => q.hp - p.hp || p.id - q.id).slice(0, c.vines.n).map(e => e.id);
        z.t2 = c.vines.dur / c.vines.hits; z.n = 0;
        for (const id of z.held) { const e = g.byId.get(id); stun(e, c.vines.dur); if (e.air) { e.air = false; e.groundT = c.vines.dur; } }
      } else {
        if (c.stun) for (const e of g.ents) if (e.side !== z.side && e.kind !== 'tower' && e.hp > 0 && inZone(z, e)) stun(e, c.stun);
        g.deep = !!c.deep;
        if (dmg) areaDamage(g, z.side, z.x, z.y, z.r, dmg, true, c.towerF ?? TOWER_SPELL_FACTOR, c.slow || 0, c.knock ? (c.knockOut ? { knock: c.knock } : { knock: c.knock, kx: 0, ky: z.side === 0 ? -1 : 1 }) : null);
        g.deep = false;
        if (c.waves) { z.n = 1; z.t2 = c.waves.every; }
      }
      if (c.clone) for (const e of [...g.ents]) { // Trugbild: jede eigene Truppe im Kreis bekommt ein Abbild
        if (e.side !== z.side || e.kind !== 'unit' || e.hp <= 0 || e.hero || e.clone || !e.speed || !inZone(z, e)) continue;
        makeClone(spawn(g, e.type, e.side, clamp(e.x + 0.7, 0.4, W - 0.4), e.y, { deployT: 0.3 }, e.lvl));
        emit(g, { t: 'clone', x: e.x, y: e.y, air: e.air });
      }
      if (c.freeze) for (const e of g.ents) if (e.side !== z.side && e.hp > 0 && inZone(z, e)) { stun(e, c.freeze); e.iceT = c.freeze; }
      if (c.summon) for (const [dx, dy] of formation(c.summon.count, 0.5, z.side)) spawn(g, c.summon.unit, z.side, clamp(z.x + dx, 0.4, W - 0.4), offRiver(clamp(z.y + dy, 0.4, H - 0.4)), { deployT: c.summon.wait ?? 0.4, ...(c.summon.hit1 ? { first: c.summon.hit1 } : {}) }, z.lvl);
      if (c.root) for (const e of g.ents) if (e.side !== z.side && e.kind === 'unit' && !e.air && e.hp > 0 && inZone(z, e)) e.rootT = c.root;
    }
    // Antrieb: der Kreis bleibt liegen und wirkt auf alles Eigene darin – Truppen, Gebäude, Türme; wer hinausläuft, behält ihn noch c.linger Sekunden
    if (c.haste) for (const e of g.ents) if (e.side === z.side && e.hp > 0 && inZone(z, e)) e.hasteT = Math.max(e.hasteT, c.linger ?? c.haste);
    if (c.snare) for (const e of g.ents) if (e.side !== z.side && e.kind === 'unit' && e.hp > 0 && !(c.ground && e.air) && inZone(z, e)) snare(e, 1, c.snare);   // Gift und Beben bremsen nur das Laufen
    if (c.waves && z.n > 0 && z.n < c.waves.n) { // weitere Wellen
      z.t2 -= dt;
      if (z.t2 <= 1e-9) {
        z.t2 += c.waves.every; z.n++;
        emit(g, { t: 'spell', spell: z.spell, side: z.side, x: z.x, y: z.y, r: z.r, wave: z.n });
        areaDamage(g, z.side, z.x, z.y, z.r, Math.round(c.dmg * z.mult), true, c.towerF ?? TOWER_SPELL_FACTOR);
      }
    }
    if (c.vines && z.held) { // Schaden in Schüben an den Festgehaltenen
      z.t2 -= dt;
      if (z.t2 <= 1e-9 && z.n < c.vines.hits) {
        z.t2 += c.vines.dur / c.vines.hits; z.n++;
        const per = Math.round(c.vines.dmg * z.mult), hits = [];
        for (const id of z.held) { const e = g.byId.get(id); if (!e || e.hp <= 0) continue; hits.push(e); emit(g, { t: 'hit', from: z.spell, x: e.x, y: e.y }); damage(g, e, e.kind === 'tower' ? per * (c.towerF ?? TOWER_SPELL_FACTOR) : per, z.side); }
      }
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
      if (c.curse && e.kind === 'unit') { e.curseT = 0.5; e.curseSide = z.side; e.curseUnit = c.curse; e.curseLvl = z.lvl; e.curseWait = undefined; e.curseHit1 = c.curseHit1; }
    }
    if (c.summonOver) { // nach und nach wühlen sich Einheiten aus dem Boden
      z.t2 -= dt;
      if (z.t2 <= 1e-9 && z.n < c.summonOver.count) {
        z.t2 += c.summonOver.every; z.n++;
        const a = rnd(g) * Math.PI * 2, rr = Math.sqrt(rnd(g)) * (c.summonOver.rMax ?? z.r - 0.5);
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
        if (c.dot) { g.deep = !!c.deep; areaDamage(g, z.side, z.x, z.y, z.r, Math.round(c.dot * z.mult), !c.ground, c.towerF || TOWER_SPELL_FACTOR, c.slow || 0, c.buildF ? { buildF: c.buildF } : null); g.deep = false; }
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
        if (across > p.w / 2 + e.r || along > e.r + 0.3 || along < -stepLen - e.r - 0.3) continue;
        p.hit.add(e.id);
        if (p.knock && (p.knockAll ? e.kind === 'unit' : canKnock(e))) { // zurückstoßen (schwere Brocken bleiben stehen – außer vor der Walze)
          e.x = clamp(e.x + p.vx * p.knock, 0.4, W - 0.4); e.y = clamp(e.y + p.vy * p.knock, 0.4, H - 0.4);
          e.inRange = false; e.runT = 0; e.charging = false;
        }
        const close = p.near && Math.hypot(e.x - p.sx, e.y - p.sy) <= p.near.max, hd = close ? Math.round(p.dmg * p.near.f) : p.dmg;   // Evolution: wer nah am Werfer steht, bekommt mehr ab
        if (close && p.near.knock && !p.rev && canKnock(e)) { e.x = clamp(e.x + p.vx * p.near.knock, 0.4, W - 0.4); e.y = clamp(e.y + p.vy * p.near.knock, 0.4, H - 0.4); e.inRange = false; e.runT = 0; e.charging = false; }
        damage(g, e, e.kind === 'tower' ? hd * p.towerFactor : hd, p.side, p.srcId ? g.byId.get(p.srcId) : undefined);
        emit(g, { t: 'hit', from: p.from, x: e.x, y: e.y });
      }
      if (p.left <= 1e-6) {
        if (p.back) { p.back = false; p.rev = true; p.vx = -p.vx; p.vy = -p.vy; p.left = p.len; p.hit = new Set(); } // kehrt um und trifft alle noch einmal
        else {
          p.done = true;
          if (p.spawnEnd) for (let i = 0; i < p.spawnEnd.count; i++) spawn(g, p.spawnEnd.unit, p.side, clamp(p.x + i * 0.6, 0.4, W - 0.4), offRiver(clamp(p.y, 0.4, H - 0.4)), { deployT: p.spawnEnd.wait ?? 0.4, ...(p.spawnEnd.form ? { formId: p.spawnEnd.form.id, formGroup: p.spawnEnd.form.group, hero: true } : {}) }, p.spawnEnd.lvl);
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
      if (p.hitSpawn) for (let i = 0; i < p.hitSpawn.count; i++) spawn(g, p.hitSpawn.unit, p.side, clamp(p.tx + (i - (p.hitSpawn.count - 1) / 2) * 0.6, 0.4, W - 0.4), offRiver(clamp(p.ty, 0.4, H - 0.4)), { deployT: p.hitSpawn.deploy ?? 0.3 }, p.hitSpawn.lvl);   // Evolution: mit dem Geschoss landet jemand
      if (p.burst) { // zerspringt am Ziel; die Kerne fliegen in der Schussrichtung weiter
        // jeder Splitter ist ein eigenes Geschoss und trifft für sich: nah am Einschlag treffen alle, weiter hinten nur einzelne
        const bx = p.tx - p.sx, by = p.ty - p.sy, L = Math.hypot(bx, by) || 1, nb = p.burst.n || 1, a0 = Math.atan2(by, bx);
        for (let i = 0; i < nb; i++) {
          const a = a0 + (i - (nb - 1) / 2) * (p.burst.fan || 0), vx = Math.cos(a), vy = Math.sin(a);
          g.projs.push({ line: true, x: p.tx - (bx / L) * 0.5, y: p.ty - (by / L) * 0.5, ox: p.tx, oy: p.ty, vx, vy, left: p.burst.len, len: p.burst.len, back: false, w: p.burst.w, speed: p.burst.speed || 13, dmg: p.dmg, knock: 0,
            side: p.side, hitsAir: p.hitsAir, from: p.from + '_kern', hit: new Set(), towerFactor: 1, srcId: p.srcId });
        }
      } else if (p.splash) areaDamage(g, p.side, p.tx, p.ty, p.splash, p.dmg, p.hitsAir, p.towerF ?? 1, p.slow, { src });
      else if (alive) {
        if (p.slow && t.kind === 'unit') t.slowT = Math.max(t.slowT, p.slow);
        if (p.stun && t.kind !== 'tower') stun(t, p.stun);
        if (p.root && t.kind === 'unit') t.rootT = Math.max(t.rootT, p.root);
        if (p.snare && t.kind === 'unit') snare(t, p.snare.dur, p.snare.f);
        if (p.curse && t.kind === 'unit') { t.curseT = p.curse.dur; t.curseSide = p.curse.side; t.curseUnit = p.curse.unit; t.curseLvl = p.curse.lvl; t.curseWait = p.curse.wait; t.curseHit1 = 0; }
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
        formation(units.length, 0.5, 1).forEach(([dx, dy], i) => spawn(g, units[i], 1, clamp(x + dx, 0.4, W - 0.4), clamp(y + dy, 0.4, RIVER_TOP - 0.5), { deployT: 1 }, wv.lvl));
        emit(g, { t: 'deploy', side: 1, x, y, card: id });
      }
    }
  }
  for (const e of g.ents) { e.ox = e.x; e.oy = e.y; }
  updateZones(g, dt);
  formWorld(FORM_API, g, dt);
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
