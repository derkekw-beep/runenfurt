// Vorausdenken für den Computergegner (ai.js). Statt nur nach Faustregeln zu entscheiden, probiert er die Züge, die er erwägt,
// in einer Kopie des Felds mit den echten Spielregeln aus – und dazu, was geschieht, wenn er gar nichts spielt. Danach
// vergleicht er die Ergebnisse in Kraft gerechnet: Was ist auf dem Feld übrig, was haben die Türme abbekommen, wie viel Kraft
// bleibt ihm. Er wählt, was am meisten bringt. So tauscht er Kraft günstig, verteidigt nicht mehr als nötig und greift nicht
// in eine Abwehr hinein, an der sein Angriff zerschellt.
//
// Geprüft und verworfen (2026-11-14): den Gegner in der Kopie mit den Karten weiterspielen zu lassen, die man von ihm kennt.
// Das kostet ein Drittel mehr Rechenzeit und gewann im direkten Vergleich nicht (90 : 110 gegen die Fassung ohne).
//
// Ehrlich bleibt er dabei: Die Kopie enthält vom Gegner nur, was auf dem Feld steht. Hand, Nachziehkarte, Stapel und Kraft
// des Gegners werden nicht einmal gelesen (SECRET) – in der Kopie spielt der Gegner keine weitere Karte, seine Truppen,
// Gebäude und fliegenden Zauber handeln nach den Regeln weiter.
//
// Das Nachdenken ist über mehrere Regeltakte verteilt (budget = Takte der Kopie je echtem Takt), damit kein Bild ruckelt:
// ein Gedanke dauert so einige Zehntelsekunden – seine Reaktionszeit.
//   cloneGame(g, side)                 Kopie aus Sicht dieser Seite
//   startThought(g, side, cands, o)    cands: [{ act: { idx, x, y } | null, bias }] · o: { horizon (s), byHp, noise, rnd }
//   advanceThought(th, budget)         rechnet weiter; true, sobald alle Züge durchgespielt sind
//   bestOf(th)                         der beste Zug (Eintrag aus cands, mit score)
import * as CARDS_M from './cards.js';
import * as HELDEN_M from './helden.js';
import * as EVO_M from './evo.js';
import { CARDS, UNITS, RUNES } from './cards.js';
import { step, playCard, DT, H, MAX_KRAFT } from './sim.js';

// Alles Feste (Karten- und Einheitendaten) wird geteilt, nie kopiert – auch, weil der Spielkern Beschreibungen vergleicht.
const STATIC = new WeakSet();
(function mark(o, depth) {
  if (!o || typeof o !== 'object' || STATIC.has(o) || depth > 9) return;
  STATIC.add(o);
  for (const k of Object.keys(o)) mark(o[k], depth + 1);
})([CARDS_M, HELDEN_M, EVO_M].map(m => Object.values(m)), 0);

function copy(o, memo) {
  if (!o || typeof o !== 'object' || STATIC.has(o)) return o;
  const hit = memo.get(o);
  if (hit) return hit;
  if (ArrayBuffer.isView(o)) { const t = o.slice(); memo.set(o, t); return t; }
  if (Array.isArray(o)) { const a = new Array(o.length); memo.set(o, a); for (let i = 0; i < o.length; i++) a[i] = copy(o[i], memo); return a; }
  if (o instanceof Map) { const m = new Map(); memo.set(o, m); for (const [k, v] of o) m.set(k, copy(v, memo)); return m; }
  if (o instanceof Set) { const s = new Set(); memo.set(o, s); for (const v of o) s.add(copy(v, memo)); return s; }
  const c = {};
  memo.set(o, c);
  for (const k in o) c[k] = copy(o[k], memo);
  return c;
}

// Was die KI vom Gegner nie liest – in der Kopie stehen dafür leere Werte
const SECRET = { hand: () => [null, null, null, null], next: () => null, queue: () => [], kraft: () => 0, last: () => '', away: () => [], cycle: () => ({}), spent: () => 0 };
const SKIP = { events: 1, dead: 1, occ: 1, sides: 1 };   // Ereignisse und Zwischenspeicher braucht die Kopie nicht
export function cloneGame(g, side) {
  const memo = new Map(), c = {};
  memo.set(g, c);
  for (const k in g) if (!SKIP[k]) c[k] = copy(g[k], memo);
  c.events = []; c.dead = [];
  c.sides = [];
  for (let s = 0; s < g.sides.length; s++) {
    const S = g.sides[s];
    if (s === side || side == null) { c.sides.push(copy(S, memo)); continue; }
    const B = {};
    for (const k in S) B[k] = SECRET[k] ? SECRET[k]() : copy(S[k], memo);
    c.sides.push(B);
  }
  if (c.waves) c.waves = null;   // Wellen gehören nicht in die Vorschau eines Zugs
  return c;
}

// ---- Bewertung: alles in Kraft ---------------------------------------------------------------------------------------
// Wert einer einzelnen Einheit: der Anteil an ihrer Karte; Einheiten ohne eigene Karte (Brut, Bruchstücke) nach ihren Werten.
const UNIT_VAL = new Map();
function unitVal(type, d) {
  let v = UNIT_VAL.get(type);
  if (v != null) return v;
  if (!UNIT_VAL.size) {
    for (const id in CARDS) {
      const c = CARDS[id];
      if (c.type === 'spell' || c.type === 'tower') continue;
      const list = c.mix ? c.mix : [[c.unit, c.count || 1]], n = list.reduce((s, m) => s + m[1], 0);
      for (const [u] of list) if (!UNIT_VAL.has(u) || UNIT_VAL.get(u) > c.cost / n) UNIT_VAL.set(u, c.cost / n);
      const R = RUNES[id];
      if (R && R.unit && !UNIT_VAL.has(R.unit)) UNIT_VAL.set(R.unit, c.cost / (R.count || c.count || 1));
    }
    v = UNIT_VAL.get(type);
    if (v != null) return v;
  }
  const dps = d.kamikaze ? (d.dmg || 0) * 0.5 : (d.dmg || 0) / (d.atk || 1);
  v = Math.min(4, (Math.sqrt((d.hp + (d.shield || 0)) * Math.max(20, dps)) / 180) * (1 + (d.range || 0) / 10));
  UNIT_VAL.set(type, v);
  return v;
}

export const TUNE = { press: 0 };   // Stellgrößen der Bewertung (tools/ki_messen.mjs kann sie zur Probe ändern: denk.press=0)
// Stand aus Sicht von side. byHp: der nächste Turm entscheidet (Verlängerung, Plötzliches Ende) – ein Turm ist dann alles wert.
export function evalGame(g, side, byHp, own = 1) {
  if (g.over) return g.winner === side ? 400 : g.winner === 'draw' ? 0 : -400;
  const TL = byHp ? 60 : 12, my = y => (side === 1 ? y : H - y);
  let v = 0, towers = [0, 0];
  for (const e of g.ents) {
    if (e.hp <= 0) continue;
    const mine = e.side === side, sg = mine ? 1 : -1;
    if (e.kind === 'tower') {
      towers[mine ? 0 : 1]++;
      v += sg * (e.hp / 140 - Math.max(0, e.maxHp * 0.45 - e.hp) / 420 + (e.main ? 60 : TL));
      continue;
    }
    if (e.kind === 'unit') {
      let w = unitVal(e.type, e.d) * Math.pow((Math.max(0, e.hp) + (e.shield || 0)) / (e.maxHp + (e.maxShield || 0)), 0.8);
      if (e.clone) w *= 0.25;
      // wer schon in der gegnerischen Hälfte steht, ist mehr wert: er muss beantwortet werden
      const deep = mine ? my(e.y) > H / 2 + 1 : my(e.y) < H / 2 - 1;
      v += sg * w * (deep ? 1.25 : 1) * (mine ? own : 1);
      // Druck über den Rechenhorizont hinaus: Wer gerade auf einen Turm einschlägt, tut das weiter, bis er fällt. Der eigene
      // Druck zählt nur halb so viel – darauf wird der Gegner noch antworten.
      if (TUNE.press && e.inRange && e.targetId) {
        const t = g.byId.get(e.targetId);
        if (t && t.kind === 'tower' && t.side !== e.side && t.hp > 0) v += sg * Math.min(5, e.hp / 160) * ((e.dmg || 0) / (e.atk || 1)) * (e.d.towerDmg || 1) / 140 * (mine ? TUNE.press * 0.5 : TUNE.press);
      }
    } else {
      const c = CARDS[e.type] || CARDS[e.d.model] || null, cost = c ? c.cost : 3;
      const life = e.d.life ? Math.max(0, Math.min(1, (e.life ?? e.d.life) / e.d.life)) : 1;
      v += sg * cost * Math.min(e.hp / e.maxHp, life) * 0.8;
    }
  }
  // drei Türme je Seite: ein gefallener fehlt in der Summe oben (sein Bonus und sein Leben) – das ist der Verlust
  v += Math.min(MAX_KRAFT, g.sides[side].kraft);
  return v;
}

// ---- Ein Gedanke: mehrere Züge nacheinander durchspielen ---------------------------------------------------------------
export function startThought(g, side, cands, o = {}) {
  return { side, base: cloneGame(g, side), cands: cands.map(c => ({ ...c, score: -Infinity })), i: 0, cur: null, left: 0, steps: Math.max(30, Math.round((o.horizon || 6) / DT)),
    byHp: !!o.byHp, own: o.own ?? 1, noise: o.noise || 0, rnd: o.rnd || null, t0: g.time, used: 0 };
}

// capMs: höchstens so viele Millisekunden je Aufruf (nur im laufenden Spiel gesetzt – auf einem langsamen Gerät dauert ein Gedanke
// dann mehr Takte, das Bild bleibt flüssig; ohne capMs zählt allein budget, damit Tests und Messungen wiederholbar bleiben)
export function advanceThought(th, budget, capMs = 0) {
  const t0 = capMs ? performance.now() : 0;
  if (capMs && budget > 25) {   // in Häppchen rechnen und dazwischen auf die Uhr sehen
    let done = false;
    while (budget > 0 && !done) { const n = Math.min(25, budget); budget -= n; done = advanceThought(th, n); if (performance.now() - t0 >= capMs) break; }
    return done;
  }
  while (budget > 0 && th.i < th.cands.length) {
    const c = th.cands[th.i];
    if (!th.cur) {
      // der letzte Zug darf die Grundkopie selbst verbrauchen
      th.cur = th.i === th.cands.length - 1 ? th.base : cloneGame(th.base, null);
      th.left = th.steps;
      if (c.act && !playCard(th.cur, th.side, c.act.idx, c.act.x, c.act.y)) { c.score = -Infinity; c.failed = true; th.cur = null; th.i++; continue; }
    }
    const g = th.cur;
    let n = Math.min(budget, th.left);
    budget -= n; th.left -= n; th.used += n;
    while (n-- > 0 && !g.over) { step(g); g.events.length = 0; }
    if (g.over) th.left = 0;
    if (th.left <= 0) {
      c.score = evalGame(g, th.side, th.byHp, th.own) + (c.bias || 0) + (th.noise && th.rnd ? (th.rnd() - 0.5) * 2 * th.noise : 0);
      th.cur = null; th.i++;
    }
  }
  return th.i >= th.cands.length;
}

export function bestOf(th) {
  let best = null;
  for (const c of th.cands) if (!c.failed && (!best || c.score > best.score)) best = c;
  return best;
}
