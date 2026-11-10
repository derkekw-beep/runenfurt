// Computergegner. Er spielt wie ein Mensch am Tisch: Er sieht nur das Feld und was der Gegner ausspielt, zählt
// dessen Kraft und Kartenumlauf mit, tauscht Kraft günstig, baut Angriffe aus Rollen auf und hat eine Reaktionszeit.
//   aiChoose  – die Entscheidung (nutzt nur den Spielzustand, das eigene Gedächtnis und den Zufallsgenerator des Spiels)
//   aiUpdate  – läuft im Regeltakt: beobachten, im Takt der Stufe entscheiden, Karte spielen, Heldenfähigkeit auslösen
// Die KI liest nie Hand, Nachziehkarte, Stapel oder Kraft des Gegners; ihr Gedächtnis liegt in ai.mem.
import { CARDS, UNITS, RUNES, TOWER_SPELL_FACTOR } from './cards.js';
import { W, H, RIVER_TOP, RIVER_BOT, POCKET, MAX_KRAFT, KRAFT_RATE, playCard, clampDeploy, cardCost, rnd, kraftRate, timeLeft, abilities, useAbility } from './sim.js';

// think: Sekunden zwischen zwei Überlegungen · react: Reaktionszeit auf Neues · minAttack: Kraft für einen Angriff aus der Ruhe
// defend/spells: Anteil der Gelegenheiten, die erkannt werden · smart: 0 reagiert nur, 0,5 plant, 1 zählt mit und bestraft
// err: Anteil kopfloser Züge · noise: Fehleinschätzung beim Abwägen · aim: Streuung beim Setzen (Felder)
export const LEVELS = {
  leicht: { name: 'Leicht', think: 2.4, react: 1.2, minAttack: 9, defend: 0.5, spells: 0.25, smart: 0, err: 0.3, noise: 1.6, aim: 1.6 },
  mittel: { name: 'Mittel', think: 1.5, react: 0.85, minAttack: 8, defend: 0.8, spells: 0.7, smart: 0.5, err: 0.2, noise: 1.1, aim: 0.8 },
  schwer: { name: 'Schwer', think: 0.45, react: 0.35, minAttack: 7, defend: 1, spells: 1, smart: 1, err: 0, noise: 0.06, aim: 0.15 },
};

// Spielstile – aus dem Startwert gewählt, damit sich Gegner unterschiedlich anfühlen.
// push: Verschiebung der Angriffsschwelle · back: wie gern ein Angriff hinten beginnt · punish: wie früh ein Kraftloch bestraft wird
// spell: Geduld beim Zaubern (höher = wartet auf mehr Wert) · keep: Kraft, die er zur Abwehr zurückhält
export const STYLES = {
  stuermer:   { id: 'stuermer',   name: 'Stürmer',    push: -1.2, back: 0.3, punish: 1.3, spell: 0.9, keep: 0.6 }, // drückt früh an der Brücke
  baumeister: { id: 'baumeister', name: 'Baumeister', push: 1.2,  back: 1,   punish: 0.8, spell: 1.1, keep: 1.2 }, // sammelt und baut hinten große Angriffe
  taktiker:   { id: 'taktiker',   name: 'Taktiker',   push: 0,    back: 0.6, punish: 1.1, spell: 1,   keep: 1 },   // tauscht Kraft, wechselt die Bahn, kontert
};
const STYLE_IDS = Object.keys(STYLES);

export const createAi = (level, style) => ({ level: LEVELS[level] ? level : 'mittel', style: STYLES[style] ? style : '', t: 2.5, lane: -1, laneT: 0, why: '', note: '', mem: null });

// ---- Kartenkunde: Rollen aus den Eigenschaften der Einheiten (nie aus Kartennamen) -------------------------------

const HALF = H / 2;
const laneOf = x => (x < W / 2 ? 0 : 1);
const laneX = lane => (lane === 0 ? 3.5 : 14.5);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isArea = d => !!(d.splash || d.spin || d.line || d.chain || d.scatter || d.burst || d.multi);
// Schaden je Sekunde aus den Werten einer Einheit (dmg/atk dürfen vom Feld kommen, d ist die Beschreibung)
function rawDps(d, dmg = d.dmg || 0, atk = d.atk || 1) {
  if (d.kamikaze) return dmg * 0.5; // ein einziger Schlag
  let v = dmg / atk;
  if (d.scatter) v *= d.scatter.n * 0.45; // Streuschuss: knapp die Hälfte der Splitter trifft
  if (d.ramp) v *= 4;                     // Brennstrahl wird heißer
  if (d.multi) v *= 1.6;
  if (d.second) v += (d.second.dmg * (d.second.count || 1)) / d.second.atk * 0.8;
  return v;
}
const entDps = e => rawDps(e.d, e.dmg, e.atk);
const spawnDps = d => (d.spawn ? rawDps(UNITS[d.spawn.unit]) * (d.spawn.count || 1) * Math.min(3, 7 / d.spawn.every) : 0);
// Gesamtschaden eines Schadenszaubers (Dauerschaden zählt nur anteilig, weil Gegner aus dem Kreis laufen)
const spellDmg = c => (c.freeze ? 0 : (c.dmg || 0) * (c.waves ? c.waves.n : 1)) || (c.vines ? c.vines.dmg * c.vines.hits : 0) || (c.dot ? c.dot * (c.dur / c.tick) * 0.55 : 0) || (c.pulses ? c.pulses.dmg[1] * c.pulses.n * 0.6 : 0);

const INFO = new Map();
function info(id) {
  let I = INFO.get(id);
  if (I) return I;
  const c = CARDS[id];
  I = { id, c, cost: c.cost, spell: c.type === 'spell', building: false, dps: 0, airDps: 0, hp: 0, body: 0, n: 0, roles: [] };
  let list = null, u = null;
  if (I.spell) {
    I.dmg = spellDmg(c);
    const sum = c.summon || c.summonOver;
    I.kind = c.mirror ? 'mirror' : c.root || c.freeze || c.vines ? 'halt' : sum && !c.dmg ? 'summon' : c.heal ? 'heal' : c.clone ? 'clone' : c.haste ? 'haste' : I.dmg ? 'dmg' : 'other';
    if (I.kind === 'summon') { u = UNITS[sum.unit]; list = Array(sum.count).fill(u); }
    I.roles.push(I.kind === 'dmg' ? (c.cost <= 3 ? 'zauber-klein' : 'zauber-gross') : I.kind === 'halt' ? 'kontrolle' : 'zauber');
  } else {
    u = UNITS[c.unit];
    list = c.mix ? c.mix.flatMap(([k, n]) => Array(n).fill(UNITS[k])) : Array(c.count || 1).fill(u);
  }
  if (!list) return INFO.set(id, I), I;
  I.u = u; I.n = list.length;
  for (const d of list) {
    const hp = d.hp + (d.shield || 0), dp = rawDps(d) + spawnDps(d);
    I.hp += hp; I.body = Math.max(I.body, hp); I.dps += dp;
    if (d.hitsAir || (d.second && d.second.hitsAir) || (d.spawn && UNITS[d.spawn.unit].hitsAir)) I.airDps += d.hitsAir ? dp : dp * 0.5;
  }
  I.air = list.every(d => d.air);
  I.area = isArea(u) || !!u.deployDmg;
  I.ranged = (u.range || 0) >= 3 && !u.kamikaze;
  I.only = u.targets === 'buildings';          // greift nur Gebäude und Türme an
  I.building = !!u.building;
  I.siege = !!(u.minRange || (u.building && u.range >= 9));
  I.well = !!u.kraft;
  I.spawner = !!u.spawn;
  I.speed = u.speed || 0;
  I.swarm = I.n >= 3 && I.body < 450;
  I.brocken = !I.building && !I.spell && I.body >= 2500;
  I.mini = !I.building && !I.spell && !I.brocken && I.body >= 1300 && !I.ranged;
  I.sieg = !I.spell && (I.siege || (I.only && !I.building) || !!u.ford || (!!c.anywhere && !I.building));
  if (!I.spell) {
    if (I.brocken) I.roles.push('brocken');
    if (I.mini) I.roles.push('kaempfer');
    if (I.sieg) I.roles.push('sieg');
    if (I.ranged && !I.only && !I.building) I.roles.push('stuetze');
    if (I.area) I.roles.push('flaeche');
    if (I.airDps > 0 && (I.ranged || I.air)) I.roles.push('luftabwehr');
    if (I.swarm) I.roles.push('schwarm');
    if (c.cost <= 2) I.roles.push('umlauf');
    if (I.building) I.roles.push('gebaeude');
    if (!I.roles.length) I.roles.push(I.ranged ? 'stuetze' : 'kaempfer');
  }
  INFO.set(id, I);
  return I;
}
// Rollen einer Karte, wie die KI sie einordnet (für Tests und Werkzeuge)
export const cardRoles = id => (CARDS[id] ? [...info(id).roles] : []);

// Welche Karte gehört zu einer frisch erschienenen Gruppe von Einheiten? (Schlüssel: Art*Anzahl)
let REV = null, MIRROR = '';
function cardOfGroup(counts) {
  if (!REV) {
    REV = new Map();
    for (const id in CARDS) {
      const c = CARDS[id];
      if (c.mirror) MIRROR = id;
      if (c.type === 'spell' || c.type === 'tower') continue;
      const key = c.mix ? c.mix.map(([k, n]) => `${k}*${n}`).sort().join('+') : `${c.unit}*${c.count || 1}`;
      if (!REV.has(key)) REV.set(key, id);
      const R = RUNES[id];
      if (R && R.unit) REV.set(`${R.unit}*${R.count || c.count || 1}`, id);
    }
  }
  return REV.get([...counts].map(([k, n]) => `${k}*${n}`).sort().join('+')) || '';
}

// ---- Gedächtnis und Beobachtung ---------------------------------------------------------------------------------

function memory(g, ai) {
  if (ai.mem) return ai.mem;
  const style = STYLES[ai.style] || STYLES[STYLE_IDS[Math.floor(rnd(g) * STYLE_IDS.length)]];
  ai.style = style.id;
  return (ai.mem = {
    style, t: g.time, lastId: 1, vis: g.nextId, q: [], live: false, seen: new WeakSet(),
    // was er über den Gegner weiß: geschätzte Kraft, gesehene Karten (mit Umlaufzähler), letzte Ausspielung
    foe: { kraft: Math.min(MAX_KRAFT, 5 + KRAFT_RATE * g.time), spent: 0, seq: 0, cards: new Map(), last: null, wellT: 0, wellEvery: 0 },
  });
}

function notePlay(g, m, id, x, y, heroesOut) {
  const F = m.foe, c = CARDS[id];
  let cid = id, cost = c.cost;
  const prev = F.cards.get(id);
  // dieselbe Karte, obwohl sie noch gar nicht wieder auf der Hand sein kann: das war der Widerhall
  if (!c.hero && prev && MIRROR && F.seq - prev.seq < 4 - heroesOut) { cid = MIRROR; cost = c.cost + 1; }
  const rec = F.cards.get(cid) || { id: cid, n: 0, seq: 0, t: 0 };
  F.seq++;
  rec.n++; rec.seq = F.seq; rec.t = g.time;
  F.cards.set(cid, rec);
  F.kraft = Math.max(0, F.kraft - cost);
  F.spent += cost;
  F.last = { id, cost, t: g.time, x, y, lane: laneOf(x), spell: c.type === 'spell' };
  const u = c.unit && UNITS[c.unit];
  if (u && u.kraft) { F.wellT = g.time + (u.life || 60); F.wellEvery = u.kraft.every; }
}

// Sieht nach, was seit dem letzten Mal geschehen ist: Kraft des Gegners hochzählen, Ausspielungen erkennen
// (neue Einheiten auf dem Feld, neue Zauberkreise). live: Aufruf aus dem Regeltakt, dann gilt die Reaktionszeit.
function observe(g, side, ai, live) {
  const m = memory(g, ai), F = m.foe;
  const dt = g.time - m.t;
  if (dt > 0) {
    m.t = g.time;
    F.kraft = Math.min(MAX_KRAFT, F.kraft + kraftRate(g) * dt + (g.time < F.wellT ? dt / F.wellEvery : 0));
  }
  let played = false;
  for (const z of g.zones) {
    if (!z.card || z.side === side || m.seen.has(z)) continue;
    m.seen.add(z);
    const c = CARDS[z.card];
    if (c && z.delay > c.delay - 0.04 && !z.hit) { notePlay(g, m, z.card, z.x, z.y, 0); played = true; } // (Zonen aus dem Tod einer Einheit zählen nicht)
  }
  if (g.nextId !== m.lastId) {
    const E = g.ents;
    let counts = null, sx = 0, sy = 0, n = 0, hero = '', heroesOut = 0;
    for (let i = E.length - 1; i >= 0 && E[i].id >= m.lastId; i--) {
      const e = E[i];
      if (e.side === side || e.kind === 'tower' || !(e.deployT > 0.9)) continue; // nur frisch Ausgespieltes (Nachwuchs aus Gebäuden erscheint schneller)
      if (e.cardId) hero = e.cardId;
      (counts || (counts = new Map())).set(e.type, (counts.get(e.type) || 0) + 1);
      sx += e.x; sy += e.y; n++;
    }
    if (n) {
      for (const e of E) if (e.side !== side && e.cardId) heroesOut++;
      const id = hero || cardOfGroup(counts);
      if (id) { notePlay(g, m, id, sx / n, sy / n, hero ? heroesOut - 1 : heroesOut); played = true; }
    }
    m.q.push(g.time, g.nextId);
    m.lastId = g.nextId;
  }
  if (live) {
    const L = LEVELS[ai.level] || LEVELS.mittel;
    m.live = true;
    const lim = g.time - L.react + 1e-9;
    while (m.q.length && m.q[0] <= lim) { m.vis = m.q[1]; m.q.splice(0, 2); }
    if (played && L.smart > 0 && ai.t > L.react) ai.t = L.react + 0.02; // Neues gesehen: nach der Reaktionszeit darüber nachdenken
  }
  return m;
}

// ---- Entscheidung -----------------------------------------------------------------------------------------------

export function aiChoose(g, side, ai) {
  const L = LEVELS[ai.level] || LEVELS.mittel;
  const m = observe(g, side, ai, false), F = m.foe, st = m.style;
  const S = g.sides[side];
  const my = y => (side === 1 ? y : H - y); // gespiegelt: mein Hauptturm steht bei my = 3, der Fluss beginnt bei 15
  // der Widerhall zählt als die Karte, die er wiederholt (eine Kraft teurer)
  const hand = [];
  for (let idx = 0; idx < S.hand.length; idx++) {
    const hid = S.hand[idx], hc = CARDS[hid];
    if (!hc) continue;
    const id = hc.mirror ? S.last : hid;
    if (!id) continue;
    const cost = cardCost(g, side, hid);
    if (cost <= S.kraft) hand.push({ id, idx, c: CARDS[id], I: info(id), cost });
  }
  ai.note = 'warten';
  if (!hand.length) return null;
  const place = (idx, x, mm) => {
    if (L.aim) { x += (rnd(g) - 0.5) * L.aim; mm += (rnd(g) - 0.5) * L.aim; }
    const p = clampDeploy(g, side, S.hand[idx], x, side === 1 ? mm : H - mm);
    return { idx, x: p.x, y: p.y };
  };
  // Patzer: schwächere Stufen spielen ab und zu einfach irgendeine Truppe irgendwohin
  if (L.err && S.kraft >= 5 && rnd(g) < L.err) {
    const any = hand.filter(h => !h.I.spell);
    if (any.length) return (ai.note = 'patzer'), place(any[Math.floor(rnd(g) * any.length)].idx, 1.5 + rnd(g) * 15, 2 + rnd(g) * 12.5);
  }

  // --- das Feld, wie er es sieht (frisch Erschienenes erst nach der Reaktionszeit) ---
  const vis = m.live ? m.vis : Infinity;
  const mine = [], myB = [], foes = [], foeB = [], myTw = [null, null], foeTw = [null, null];
  let myMain = null, foeMain = null;
  for (const e of g.ents) {
    if (e.hp <= 0) continue;
    if (e.kind === 'tower') {
      if (e.main) { if (e.side === side) myMain = e; else foeMain = e; }
      else (e.side === side ? myTw : foeTw)[e.lane] = e;
    } else if (e.side === side) (e.kind === 'unit' ? mine : myB).push(e);
    else if (e.id < vis) (e.kind === 'unit' ? foes : foeB).push(e);
  }
  // eigene Zauber, die schon unterwegs sind: ihr Schaden zählt als geschehen
  let pend = null;
  for (const z of g.zones) {
    if (z.side !== side || !z.card || z.hit) continue;
    const d = spellDmg(CARDS[z.card]);
    if (d > 0) (pend || (pend = [])).push(z.x, z.y, z.r, d);
  }
  const hpOf = e => {
    let h = e.hp + (e.kind === 'tower' ? 0 : e.shield || 0);
    if (pend) for (let i = 0; i < pend.length; i += 4) if (Math.hypot(e.x - pend[i], e.y - pend[i + 1]) <= pend[i + 2] + e.r) h -= pend[i + 3] * (e.kind === 'tower' ? TOWER_SPELL_FACTOR : 1);
    return h;
  };

  // --- Spielstand und Phase ---
  const low = (a, b, c) => Math.min(a ? a.hp : Infinity, b ? b.hp : Infinity, c ? c.hp : Infinity);
  const tl = timeLeft(g), byHp = g.sudden || g.phase === 'over'; // der nächste Turm entscheidet, bei Zeitablauf der schwächste
  const crowns = (foeTw[0] ? 0 : 1) + (foeTw[1] ? 0 : 1) - (myTw[0] ? 0 : 1) - (myTw[1] ? 0 : 1);
  const hpGap = low(myTw[0], myTw[1], myMain) - low(foeTw[0], foeTw[1], foeMain);
  const ahead = byHp ? (Math.abs(hpGap) > 120 ? Math.sign(hpGap) : 0) : crowns;
  const endgame = L.smart >= 0.5 && tl < 25 && (byHp || crowns !== 0);
  const allIn = endgame && ahead < 0, guard = endgame && ahead > 0; // Rückstand: alles riskieren · Führung: absichern
  // ein fast gefallener Turm wird zu Ende gebracht (finish: seine Bahn)
  let finish = -1;
  if (L.smart >= 0.5) {
    for (const ln of [0, 1]) if (foeTw[ln] && foeTw[ln].hp < 550 && (finish < 0 || foeTw[ln].hp < foeTw[finish].hp)) finish = ln;
    if (finish < 0 && foeMain && foeMain.hp < 550 && (!foeTw[0] || !foeTw[1])) finish = foeTw[0] ? 1 : 0;
  }
  const double = kraftRate(g) > KRAFT_RATE * 1.5;
  const full = S.kraft >= 9.6;
  const fwd = side === 1 ? 1 : -1;

  // --- Zauber: Wert an einem Punkt ---
  const inSpell = (c, x, y, e) => {
    if (c.roll) {
      const along = (e.y - y) * fwd;
      return !(e.air || along < -0.5 || along > c.roll.len || Math.abs(e.x - x) > c.roll.w / 2 + e.r);
    }
    return Math.hypot(e.x - x, e.y - y) <= c.radius + e.r;
  };
  const targets = [...foes, ...foeB, foeTw[0], foeTw[1], foeMain].filter(Boolean);
  // getroffener Schaden, Türme zählen anteilig, ein Turm-Todesstoß sehr viel
  const spellValue = (c, x, y) => {
    let dmg = spellDmg(c), v = 0, list = targets;
    if (c.pulses || c.strikes) {
      const inside = targets.filter(e => inSpell(c, x, y, e));
      if (c.pulses) dmg = c.pulses.dmg[inside.length <= 1 ? 0 : inside.length <= 4 ? 1 : 2] * c.pulses.n * 0.6; // wer weiterläuft, bekommt nicht alle Stöße ab
      if (c.strikes) list = inside.sort((p, q) => q.hp - p.hp).slice(0, c.strikes);
    }
    for (const e of list) {
      if (!inSpell(c, x, y, e) || (c.ground && e.air) || e.buried) continue;
      const hp = hpOf(e);
      if (hp <= 0) continue;
      if (e.kind === 'tower') { const d = dmg * (c.towerF || TOWER_SPELL_FACTOR); v += hp <= d ? 3000 : d * 0.8; }
      else if (e.kind === 'unit') v += (hp <= dmg ? hp + 40 : dmg * (L.smart ? 0.5 : 1)) + (c.stun ? entDps(e) * 0.6 : 0) + (c.amp ? Math.min(hp, 1500) * 0.15 : 0) + (c.slow ? entDps(e) * 0.5 : 0);
      else v += Math.min(hp, dmg * (c.buildF || 1)) * 0.6;
    }
    return v;
  };
  // bester Punkt: auf jedem Gegner (mit Vorhalt in Laufrichtung) und zwischen Turm und Truppen daneben
  const bestSpell = (c, cands) => {
    let best = null;
    const tryAt = (x, y) => { const v = spellValue(c, x, y); if (!best || v > best.v) best = { v, x, y }; };
    for (const e of cands || targets) {
      if (c.ownSide && my(e.y) > RIVER_TOP - 0.4) continue; // fällt nur aufs eigene Feld
      const lead = c.roll ? -1.2 * fwd : e.kind === 'unit' && !c.dot && !e.inRange && e.stunT <= 0 && e.rootT <= 0 ? (e.vy || 0) * e.speed * c.delay * (L.smart ? 1 : 0.4) : 0;
      tryAt(e.x, e.y + lead);
      if (e.kind === 'tower' && L.smart && !c.roll && !cands) for (const o of foes) {
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (d > 0.5 && d < c.radius * 2) tryAt((o.x + e.x) / 2, (o.y + e.y) / 2);
      }
    }
    return best;
  };
  const cast = (h, x, y) => {
    if (L.aim > 0.3) { x += (rnd(g) - 0.5) * L.aim; y += (rnd(g) - 0.5) * L.aim; }
    return { idx: h.idx, x, y };
  };

  // 0) Der Zauber, der einen Turm fällt, geht vor allem anderen
  if (rnd(g) < L.spells) {
    for (const h of hand) {
      const c = h.c;
      if (h.I.kind !== 'dmg' || c.ownSide) continue;
      const td = (c.dmg || (c.dot ? c.dot * (c.dur / c.tick) : 0) || (c.pulses ? c.pulses.dmg[0] * c.pulses.n : 0)) * (c.towerF || TOWER_SPELL_FACTOR) * 0.98;
      for (const t of [foeMain, foeTw[0], foeTw[1]]) {
        if (!t || hpOf(t) <= 0 || hpOf(t) > td) continue;
        ai.note = 'todesstoss';
        return { idx: h.idx, x: t.x, y: c.roll ? t.y - fwd * 1.5 : t.y };
      }
    }
  }

  // --- Bedrohungen je Bahn: Wie viel Schaden käme am Turm an, wenn nichts weiter geschieht? ---
  const item = (e, tw) => {
    const d = Math.hypot(e.x - tw.x, e.y - tw.y), hp = hpOf(e);
    if (e.kind !== 'unit') { // gegnerisches Gebäude in meiner Hälfte
      const dp = spawnDps(e.d) || (d - tw.r <= e.range ? entDps(e) : 0);
      return { e, hp, dps: dp, a: 0, eng: Math.max(0, d - 7.5), air: false, small: false, kami: false, dmg: 0, only: true, ranged: true };
    }
    const sp = Math.max(0.3, e.speed * (e.slowT > 0 ? 0.65 : 1)), stuck = Math.max(e.stunT, e.rootT, e.deployT, 0);
    return { e, hp, dps: entDps(e) * (e.d.towerDmg || 1), a: stuck + Math.max(0, d - e.range - e.r - tw.r) / sp, eng: Math.max(0, d - 7.5) / sp, air: e.air, small: e.maxHp < 450,
      kami: !!e.d.kamikaze, dmg: e.dmg, only: e.targets === 'buildings', ranged: e.range >= 3 };
  };
  // Dg/Da: Abwehrschaden je Sekunde gegen Boden/Luft · ar: Flächenanteil · holdU/holdB: Aufschub durch Ablenkung (Truppe/Gebäude)
  const leakOf = (items, Dg, Da, ar, holdU, holdB, airHold) => {
    let tc = 0, sum = 0, smalls = 0;
    for (const t of items) if (t.small) smalls++;
    const af = 1 + ar * Math.min(3, Math.max(0, smalls - 1));
    for (const t of items) {
      tc = Math.max(tc, t.eng) + t.hp / ((t.air ? Da : Dg) * (t.small ? af : 1));
      const over = tc - t.a - (t.only ? holdB : t.air && !airHold ? 0 : t.ranged ? holdU * 0.4 : holdU);
      if (over > 0) sum += t.kami ? t.dmg : t.dps * Math.min(over, 16);
    }
    return sum;
  };
  const TL = byHp ? 60 : 12; // so viel Kraft ist ein verlorener Turm wert
  const val = (leak, tw) => leak / (tw.hp < tw.maxHp * 0.45 ? 105 : 140) + (leak >= tw.hp ? (tw.main ? 60 : TL) : leak >= tw.hp * 0.6 ? (tw.main ? 60 : TL) * 0.35 : 0);
  const T = [[], []];
  for (const e of foes) {
    const lim = HALF + (e.air || e.ford ? 1.5 : 0.5) + (L.smart >= 0.5 ? 0 : 0);
    if (my(e.y) < lim) T[laneOf(e.x)].push(e);
  }
  for (const b of foeB) if (my(b.y) < HALF && (b.d.spawn || b.dmg)) T[laneOf(b.x)].push(b);
  const assess = ln => {
    const tw = myTw[ln] || myMain;
    if (!T[ln].length || !tw) return null;
    const items = T[ln].map(e => item(e, tw)).filter(t => t.hp > 0).sort((p, q) => p.a - q.a);
    if (!items.length) return null;
    const lead = items[0].e;
    let Dg = Math.max(1, tw.dmg / tw.atk), Da = Dg, ar = 0;
    for (const e of mine) {
      if (e.targets === 'buildings' || !e.dmg || my(e.y) > HALF + 2 || (laneOf(e.x) !== ln && Math.abs(e.x - lead.x) > 5.5)) continue;
      const d = entDps(e) * (e.hp < 250 && e.maxHp > 500 ? 0.4 : 1);
      Dg += d; if (e.hitsAir) Da += d; if (isArea(e.d)) ar += d;
    }
    for (const b of myB) {
      const d = b.dmg && Math.hypot(b.x - lead.x, b.y - lead.y) <= b.range + 3 && !b.d.minRange ? entDps(b) : spawnDps(b.d);
      if (!d || (laneOf(b.x) !== ln && Math.abs(b.x - lead.x) > 6.5)) continue;
      Dg += d; if (b.hitsAir) Da += d; if (isArea(b.d)) ar += d;
    }
    const leak = leakOf(items, Dg, Da, ar / Dg, 0, 0, false);
    return { ln, tw, items, lead, Dg, Da, ar, leak, val: val(leak, tw) };
  };
  const A = [assess(0), assess(1)].filter(Boolean).sort((p, q) => q.val - p.val);
  const danger = A.length ? A[0].val : 0;

  // Wohin mit dem Verteidiger? Angreifer in die Mitte ziehen, damit beide Türme treffen; Schwärme umstellen.
  const defSpot = (I, a) => {
    const lead = a.lead, lm = my(lead.y), toMid = lead.x < W / 2 ? 1 : -1;
    if (L.smart < 0.5 || 0) { // Anfänger stellt sich einfach davor
      if (I.building) return [9 - toMid * 2, 10];
      return I.ranged ? [lead.x + toMid * 1.5, Math.max(3.5, Math.min(lm, HALF - 2) - 3.5)] : [lead.x, Math.max(3.5, Math.min(lm, HALF - 1.6) - (lead.air ? 0 : 1.2))];
    }
    if (I.building) { // Richtung Mitte, so weit es geht – aber näher am Angreifer als der Turm, sonst läuft er dorthin
      const cx = 9 + toMid * 0.6, cm = 8.6, d = Math.hypot(cx - lead.x, cm - lm) || 1;
      const k = Math.min(1, Math.max(2.5, Math.hypot(a.tw.x - lead.x, my(a.tw.y) - lm) - 0.9) / d);
      return [lead.x + (cx - lead.x) * k, lm + (cm - lm) * k];
    }
    if (lead.air) return I.ranged ? [a.tw.x + toMid * 2.2, my(a.tw.y) + 1.6] : [lead.x, Math.max(3, lm - 1)];
    const loner = a.items.find(t => t.ranged && !t.only && t.e.kind === 'unit' && t.e.maxHp < 1000); // Schütze hinter der Spitze
    if (!I.ranged && !I.air && loner && lead.targets === 'buildings') return [loner.e.x, my(loner.e.y) - 0.3];
    if (lead.targets === 'buildings' || lead.kind !== 'unit') { // er beachtet meine Truppen nicht: Nahkämpfer direkt drauf, Schützen auf Abstand
      if (I.ranged) return [lead.x + toMid * 2.4, Math.max(2.5, Math.min(lm, 13) - 3)];
      return [lead.x, Math.min(lm, 14) - (I.swarm ? 0.2 : 0.9)];
    }
    if (I.swarm && !isArea(lead.d) && lm < 13.5) return [lead.x, lm - 0.2]; // Schwarm mitten auf den Einzelnen: er wird umstellt
    if (!I.ranged && lead.range >= 3) return [lead.x, lm - 0.3];           // Nahkämpfer direkt auf den Schützen
    // ein zerbrechlicher Schütze lockt nicht: Er stellt sich so, dass der Turm dem Angreifer näher ist als er selbst
    if (I.ranged && lead.range < 3 && I.body < entDps(lead) * 3.5) return [a.tw.x + toMid * 2.6, Math.max(1.5, my(a.tw.y) - 0.4)];
    // sonst: zur Mitte locken (in Sichtweite bleiben, sonst läuft er einfach weiter zum Turm)
    let px = 9 - toMid * (I.ranged ? 0.3 : 1.2), pm = clamp(lm - (I.ranged ? 5 : 3.5), I.ranged ? 5 : 6.5, I.ranged ? 9 : 9.8);
    const d = Math.hypot(px - lead.x, pm - lm), reach = I.ranged ? 5 : 4.6;
    if (d > reach) { const k = reach / d; px = lead.x + (px - lead.x) * k; pm = lm + (pm - lm) * k; }
    return [px, pm];
  };

  // 1) Verteidigen – mit der Karte, die für die wenigste Kraft den meisten Schaden abwendet
  if (danger > 0.45 && rnd(g) < L.defend) {
    let best = null;
    for (const a of A) {
      if (a.val <= 0.45) continue;
      if (finish >= 0 && L.smart >= 1 && !guard && S.kraft < 7 && a.leak < a.tw.hp * 0.6) continue; // Wettlauf: erst den Turm holen
      let thr = 0, thrAir = 0, onlyDps = 0, areaThr = false, allAir = true;
      for (const t of a.items) {
        if (t.only) onlyDps += t.dps; else { thr += t.dps; if (t.e.hitsAir) thrAir += t.dps; if (isArea(t.e.d)) areaThr = true; }
        if (!t.air) allAir = false;
      }
      for (const h of hand) {
        const I = h.I, c = h.c;
        let net = -Infinity, act = null;
        if (I.spell && I.kind !== 'summon') {
          if (I.kind === 'dmg') {
            const sp = bestSpell(c, T[a.ln]);
            if (!sp || sp.v < 60) continue;
            const left = [];
            for (const t of a.items) {
              if (!inSpell(c, sp.x, sp.y, t.e) || (c.ground && t.air)) { left.push(t); continue; }
              const hp = t.hp - I.dmg * (t.e.kind === 'building' ? c.buildF || 1 : 1);
              if (hp > 0) left.push({ ...t, hp, a: t.a + (c.stun || 0) + (c.slow ? 1 : 0) + (c.knock ? 0.6 : 0) });
            }
            net = a.val - val(leakOf(left, a.Dg, a.Da, a.ar / a.Dg, 0, 0, false), a.tw) - h.cost;
            act = cast(h, sp.x, sp.y);
          } else if (I.kind === 'halt') {
            const dur = c.root || c.freeze || (c.vines ? c.vines.dur : 0), lead = a.lead;
            const left = a.items.map(t => ((c.freeze || c.vines || !t.air) && t.e.kind === 'unit' && Math.hypot(t.e.x - lead.x, t.e.y - lead.y) <= c.radius ? { ...t, a: t.a + dur } : t));
            net = a.val - val(leakOf(left, a.Dg, a.Da, a.ar / a.Dg, 0, 0, false), a.tw) - h.cost - 0.5; // hält nur auf: lieber etwas, das bleibt
            act = cast(h, lead.x, lead.y);
          } else continue;
        } else {
          const u = I.u;
          if (I.siege || I.well || (I.only && !I.building) || !I.dps) { if (!(I.only && thr > 0 && !I.building && I.body >= 900)) continue; } // Belagerer verteidigen nicht (höchstens als Schild)
          if (allAir && !I.airDps) continue;
          const eff = I.spell ? 0.6 : 0.85; // Aufstellzeit
          const dps0 = I.only && !I.building ? 0 : I.dps * eff;
          const canBeHit = I.air ? thrAir : thr;
          const frail = areaThr && I.swarm ? 0.35 : 1;
          const holdU = I.building ? 0 : Math.min(6, (I.hp * frail) / Math.max(80, canBeHit)) * (canBeHit > 0 ? 0.8 : 0);
          const holdB = I.building ? Math.min(8, I.hp / Math.max(60, onlyDps)) + 1.5 : 0;
          let fight = 0;
          for (const t of a.items) fight += t.hp / (a.Dg + dps0);
          const surv = I.building ? 0 : clamp(1 - (canBeHit * Math.min(fight, 8)) / (I.hp * frail), 0, 1);
          const live = I.building ? 1 : 0.45 + 0.55 * surv, dps = dps0 * live; // wer im Kampf fällt, teilt nicht bis zum Ende aus
          const leak = leakOf(a.items, a.Dg + dps, a.Da + (I.only && !I.building ? 0 : I.airDps * eff * live), (a.ar + (I.area ? dps : 0)) / (a.Dg + dps), holdU, holdB, I.air);
          net = a.val - val(leak, a.tw) - h.cost + surv * h.cost * 0.5; // was überlebt, kontert danach
          if (u.kamikaze && !I.area && a.items.length > 2) net -= 1;
          const [x, mm] = c.summon || c.summonOver ? [a.lead.x, my(a.lead.y) - 0.5] : defSpot(I, a);
          act = I.spell ? { idx: h.idx, x, y: side === 1 ? mm : H - mm } : place(h.idx, x, mm);
        }
        if (L.noise) net += (rnd(g) - 0.5) * L.noise * 4;
        if (net > 0.35 && (!best || net > best.net)) best = { net, act };
      }
    }
    if (best) return (ai.note = 'abwehr'), best.act;
    if (danger > 2.5 && !full) return (ai.note = 'sparen'), null; // sparen, bis eine passende Antwort bezahlbar ist
  }

  // 2) Lohnende Zauber
  const mineAt = (e, r) => mine.filter(o => Math.hypot(o.x - e.x, o.y - e.y) <= r);
  if (rnd(g) < L.spells) {
    ai.note = 'zauber'; // (gilt nur, wenn hier wirklich etwas gespielt wird)
    let inbound = 0;
    for (const e of foes) if (my(e.y) >= HALF + 0.5) inbound += (e.hp * 0.4 + entDps(e) * 6) / 260;
    const spellKeep = L.smart >= 1 ? Math.min(4, inbound * 0.5) : 0; // kommt etwas auf mich zu, bleibt Kraft für die Abwehr
    const patience = (L.smart ? 160 : 110) * (L.smart >= 1 ? st.spell : 1) * (allIn ? 0.6 : 1);
    for (const h of hand) {
      const c = h.c, I = h.I;
      if (!I.spell) continue;
      if (I.kind === 'dmg') {
        const sp = bestSpell(c);
        if (sp && sp.v >= h.cost * patience && (S.kraft - h.cost >= spellKeep || sp.v >= h.cost * patience * 1.6)) return cast(h, sp.x, sp.y);
        if (finish >= 0 && !c.ownSide && !c.roll) { // zwei Zauber reichen für den Turm: werfen
          const ft = foeTw[finish] || foeMain, td = (c.dmg || (c.dot ? c.dot * (c.dur / c.tick) : 0)) * (c.towerF || TOWER_SPELL_FACTOR);
          if (ft && td > 0 && hpOf(ft) <= td * 2.1 && hpOf(ft) > 0) return { idx: h.idx, x: ft.x, y: ft.y };
        }
        // letzte Sekunden: jeder Punkt am schwächsten Turm zählt (bei Zeitablauf entscheidet der schwächste Turm)
        if (endgame && byHp && !c.ownSide && tl < 12 && !danger) {
          const t = [foeTw[0], foeTw[1], foeMain].filter(Boolean).sort((p, q) => p.hp - q.hp)[0];
          if (t && (ahead <= 0 || full)) return { idx: h.idx, x: t.x, y: c.roll ? t.y - fwd * 1.5 : t.y };
        }
      } else if (I.kind === 'summon') { // Truppen direkt an den schwächeren Turm werfen
        const t = [foeTw[0], foeTw[1]].filter(Boolean).sort((p, q) => p.hp - q.hp)[0] || foeMain;
        // Nach und nach erscheinende Truppen lohnen nur, wenn ein eigener Brocken den Turm beschäftigt (oder die Kraft sonst verfällt)
        const tanked = t && mine.some(e => e.maxHp >= 1200 && Math.hypot(e.x - t.x, e.y - t.y) <= 5);
        if (t && (c.summonOver ? tanked || S.kraft >= 9.8 : (tanked || S.kraft >= Math.max(6, h.cost + 1)) && !danger)) return { idx: h.idx, x: t.x + (rnd(g) - 0.5) * 2, y: t.y - fwd * 1.4 };
      } else if (I.kind === 'heal') {
        for (const e of mine) if (mineAt(e, c.radius).reduce((s, o) => s + (o.maxHp - o.hp), 0) >= 900) return { idx: h.idx, x: e.x, y: e.y };
      } else if (I.kind === 'clone') { // Trugbild auf einen Angriff, der sich lohnt
        for (const e of mine) {
          if (e.hero || e.clone || my(e.y) < HALF - 4) continue;
          const near = mineAt(e, c.radius).filter(o => !o.hero && !o.clone);
          if (near.length >= 3 || near.reduce((s, o) => s + entDps(o), 0) >= 380) return { idx: h.idx, x: e.x, y: e.y };
        }
      } else if (I.kind === 'haste') {
        for (const e of mine) {
          if (my(e.y) < HALF - 3) continue; // nur für einen Angriff, der schon unterwegs ist
          const near = mineAt(e, c.radius);
          if ((near.length >= 3 && near.reduce((s, o) => s + o.hp, 0) >= 1200) || near.reduce((s, o) => s + entDps(o), 0) >= 450) return { idx: h.idx, x: e.x, y: e.y };
        }
      }
    }
  }

  ai.note = 'warten';
  // Kraftquell hinten aufstellen, wenn gerade Ruhe ist
  const well = hand.find(h => h.I.well);
  if (well && !danger && !allIn && S.kraft >= 7.5 && !myB.some(e => e.d.kraft)) return (ai.note = 'kraftquell'), place(well.idx, 9 + (rnd(g) < 0.5 ? -3.5 : 3.5), 1.4);

  // --- 3) Angriff: Was weiß ich über den Gegner? ---
  const smart = L.smart;
  let heroesOut = 0;
  for (const e of foes) if (e.cardId) heroesOut++;
  const canHave = rec => F.seq - rec.seq >= 4 - heroesOut; // kann die Karte schon wieder auf seiner Hand sein?
  let foeSpell = null, foeWin = null, foeBuildOut = false, foeBuildKnown = false;
  if (smart >= 1) for (const rec of F.cards.values()) {
    if (rec.id === MIRROR) continue;
    const I = info(rec.id);
    if (I.spell) { if (I.kind === 'dmg' && I.dmg >= 200 && canHave(rec) && (!foeSpell || I.dmg > foeSpell.dmg)) foeSpell = { dmg: I.dmg, r: I.c.radius }; continue; }
    if ((I.only || I.brocken) && !I.building && (!foeWin || I.cost > foeWin.I.cost)) foeWin = { I, rec };
    if (I.building && !I.well && !I.siege) { foeBuildKnown = true; if (!canHave(rec)) foeBuildOut = true; }
  }
  // meine Schlüsselabwehr gegen seinen Siegbringer: aufheben, solange er ihn spielen könnte
  let keyId = '';
  if (foeWin && canHave(foeWin.rec) && F.kraft >= foeWin.I.cost - 3) {
    let bs = 0;
    for (const id of [...S.hand, S.next, ...S.queue]) {
      const I = CARDS[id] && !CARDS[id].mirror ? info(id) : null;
      if (!I || I.spell || (I.only && !I.building) || I.well || I.siege) continue;
      const sc = ((foeWin.I.air ? I.airDps : I.dps) + (I.building && foeWin.I.only ? 260 : 0)) / Math.sqrt(I.cost);
      if (sc > bs) { bs = sc; keyId = id; }
    }
  }
  // gegnerische Truppen, die erst noch kommen: dafür Kraft zurückhalten
  // … aber nur so viel, wie bis zu ihrer Ankunft am Fluss nicht ohnehin nachwächst
  let coming = 0, eta = 99;
  for (const e of foes) {
    if (my(e.y) < HALF + 0.5) continue;
    coming += (e.hp * 0.4 + entDps(e) * 6) / 260;
    eta = Math.min(eta, (my(e.y) - HALF - 0.5) / Math.max(0.3, e.speed));
  }
  const reserve = smart >= 0.5 && !allIn && coming ? clamp(Math.min(6, coming * 1.1 * st.keep) - kraftRate(g) * eta * 0.8, 0, 5) : 0;

  // meine Truppen auf dem Feld: Gibt es eine Spitze, hinter der sich ein Angriff lohnt?
  const grp = [0, 0], anchor = [null, null];
  for (const e of mine) {
    if (!e.speed || e.clone) continue;
    const ln = laneOf(e.x);
    grp[ln] += e.hp * 0.4 + entDps(e) * 6;
    if (!anchor[ln] || e.maxHp > anchor[ln].maxHp) anchor[ln] = e;
  }
  const pushLane = grp[0] >= 500 || grp[1] >= 500 ? (grp[0] >= grp[1] ? 0 : 1) : -1;
  let front = pushLane >= 0 ? anchor[pushLane] : null;
  const frontM = front ? my(front.y) : 0;
  const building = !!front && frontM < 8 && front.maxHp >= 1300 && front.speed < 1.5; // der Brocken läuft noch hinten an: Kraft sammeln
  // steht seine Abwehr schon in dieser Bahn, lohnt die andere mehr
  let swap = false;
  if (front && smart >= 1 && finish < 0 && foeTw[0] && foeTw[1] && frontM < 13) {
    let def = 0;
    for (const e of foes) if (laneOf(e.x) === pushLane && my(e.y) > HALF + 1 && e.targets !== 'buildings') def += e.hp * 0.4 + entDps(e) * 6;
    for (const b of foeB) if (b.dmg && my(b.y) > HALF && Math.abs(b.x - laneX(pushLane)) < 6.5) def += b.hp * 0.4 + entDps(b) * 6;
    swap = def > grp[pushLane] * 1.2 + 400;
  }
  if (swap) front = null;
  // Kraftloch: Er hat gerade viel ausgegeben, und ich habe deutlich mehr als er
  const punish = smart >= 1 && !!F.last && g.time - F.last.t < 6 && F.kraft <= 3.2 * st.punish && S.kraft - F.kraft >= 3.5 && !danger && !guard;

  // Bahnwahl mit Begründung (ai.why)
  const pickLane = () => {
    if (finish >= 0) { ai.why = 'Turm zu Ende bringen'; return finish; }
    if (swap) { ai.why = 'Bahnwechsel: dort steht seine Abwehr'; ai.laneT = g.time + 10; return 1 - pushLane; }
    if (front && smart > 0) { ai.why = 'hinter die eigene Spitze'; return pushLane; }
    const t0 = foeTw[0], t1 = foeTw[1];
    if (punish && !F.last.spell && my(F.last.y) > 21 && F.last.cost >= 4 && t0 && t1) { ai.laneT = g.time + 8; ai.why = 'Gegenbahn: er hat gegenüber Kraft gebunden'; return 1 - F.last.lane; }
    if (g.time < ai.laneT && ai.lane >= 0) return ai.lane;
    ai.laneT = g.time + 18;
    if (smart >= 0.5 && t0 && t1 && Math.abs(t0.hp - t1.hp) > 150) { ai.why = 'schwächerer Turm'; return t0.hp < t1.hp ? 0 : 1; }
    if (smart >= 0.5 && (!t0 || !t1) && foeMain) { ai.why = 'offene Seite zum Hauptturm'; return !t0 ? 0 : 1; }
    if (smart >= 1) { // einem stehenden Abwehrgebäude ausweichen
      const b = foeB.find(e => e.dmg && my(e.y) > HALF);
      if (b && Math.abs(b.x - 9) > 2) { ai.why = 'weg vom Abwehrgebäude'; return 1 - laneOf(b.x); }
    }
    ai.why = 'frei gewählt';
    return rnd(g) < 0.5 ? 0 : 1;
  };

  let need = L.minAttack + (smart >= 1 ? st.push : 0) - (double ? 1.5 : 0);
  if (smart >= 1 && !F.seq && g.time < 14) need = Math.max(need, st.id === 'stuermer' ? 8 : 9.6); // Eröffnung: erst sehen, was er tut
  if (front && smart >= 0.5 && !building) need = Math.min(need, 5);
  if (smart >= 1 && !front) need += 0.3 * Math.max(0, F.kraft - 6); // er hat viel Kraft auf der Hand: nicht leer laufen
  if (building) need = Math.max(need, 8.5);
  if (punish) need = Math.min(need, 4);
  if (finish >= 0 && !guard) need = Math.min(need, 2);
  if (guard) need = 9.4;
  if (allIn) need = 0;
  need = Math.min(9.6, need + reserve);
  if (S.kraft < need) return (ai.note = 'warten'), null;

  const lane = (ai.lane = pickLane());
  const lx = laneX(lane), pocket = !foeTw[lane];
  const troops = hand.filter(h => !h.I.spell);
  if (!troops.length) {
    if (!full) return null;
    ai.note = 'zauber'; // volle Kraft und nur Zauber auf der Hand: nicht verfallen lassen
    const h = hand.find(x => x.I.kind === 'dmg' && !x.c.ownSide) || hand[0];
    const t = foeTw[lane] || foeMain;
    if (h.I.kind === 'dmg' && t) { const sp = bestSpell(h.c); return sp && sp.v > 150 ? { idx: h.idx, x: sp.x, y: sp.y } : { idx: h.idx, x: t.x, y: h.c.roll ? t.y - fwd * 1.5 : t.y }; }
    return mine[0] ? { idx: h.idx, x: mine[0].x, y: mine[0].y } : null;
  }
  if (front && laneOf(front.x) !== lane) front = null;
  const tanky = !!front && front.maxHp >= 1300;
  const rate = h => {
    const I = h.I, u = I.u;
    let s = 1 + (1 - smart) * rnd(g) * 3;
    if (I.well) return -9;
    if (I.siege) s += front ? -1 : 1.5;
    if (h.c.anywhere) s += 1;
    if (u.ford) s += 0.5;
    if (h.id === keyId && !full && !allIn) s -= 4;      // die Antwort auf seinen Siegbringer bleibt auf der Hand
    if (guard) s += I.building && I.dps ? 5 : I.only ? -2 : 0; // Führung absichern: lieber etwas, das hinten steht
    if (front) {
      if (tanky) { // Unterstützung hinter die Spitze
        if (I.ranged && !I.only) s += 3;
        if (I.area) s += 1;
        if (I.swarm) s += foeSpell ? 0 : 1.5;
        if (I.sieg && !I.siege) s += 1.5;
        if (I.brocken) s -= 1.5;
      } else {     // die Überlebenden sind zerbrechlich: etwas Zähes davor
        if (I.brocken) s += 3; else if (I.mini) s += 2.5;
        if (I.ranged && !I.only) s += 1;
        if (I.swarm) s += 0.5;
      }
      if (I.building) s -= 2;
    } else {
      const quick = punish || finish >= 0;
      if (I.brocken) s += quick ? 1 : 3 + st.back;
      else if (I.mini) s += quick ? 2.5 : 1.5;
      if (I.only && !I.building) s += quick ? 3 : 1.5;
      if (quick && I.speed >= 1.5 && !I.ranged && I.body >= 600) s += 2;
      if (finish >= 0 && (I.air || I.speed >= 1.5)) s += 1.5;
      if (I.swarm && smart >= 1 && finish < 0) s -= 1;
      if (punish && foeBuildKnown && foeBuildOut && I.only) s += 1; // sein Gebäude ist gerade nicht auf der Hand
      if (I.spawner) s += 1;
      if (h.c.hero) s += 1;
      if (I.ranged && !I.building && !I.brocken) s -= smart * 3;
      if (u.kamikaze) s -= 1;
      if (I.building && u.dmg && !I.siege) s -= 1.5;
      if (smart >= 1 && h.cost <= 2 && !punish) s += 0.4; // billig eröffnen, die Hand weiterdrehen
    }
    return s;
  };
  let pick = null, ps = -Infinity;
  for (const h of troops) { const s = rate(h); if (s > ps) { ps = s; pick = h; } }
  if (ps < 0.5 && !full && !allIn) return null; // nichts auf der Hand, womit sich ein Angriff beginnen ließe
  ai.note = allIn ? 'alles-riskieren' : punish ? 'bestrafen' : guard ? 'absichern' : front ? 'nachsetzen' : 'aufbauen';
  const I = pick.I, u = I.u;
  const t = foeTw[lane] || foeMain;
  if (I.siege) return place(pick.idx, lx, HALF - 1.7); // Belagerungsgerät an den Fluss: von dort reicht es bis zum Turm
  if (pick.c.anywhere && smart && t) return { idx: pick.idx, x: t.x + (rnd(g) - 0.5), y: t.y - fwd * 1.7 }; // gräbt sich direkt am Turm aus
  // einem bekannten Flächenzauber ausweichen: Zerbrechliches nicht zu anderen Zerbrechlichen stellen
  const spread = (x, mm) => {
    if (!foeSpell || I.body > foeSpell.dmg) return [x, mm];
    const crowd = (px, pm) => mine.some(e => e.maxHp <= foeSpell.dmg && Math.hypot(e.x - px, my(e.y) - pm) < foeSpell.r + 0.8);
    if (!crowd(x, mm)) return [x, mm];
    const R = foeSpell.r + 1.3;
    for (const [dx, dm] of [[x < lx ? -R : R, 0], [x < lx ? R : -R, 0], [0, -R]]) {
      const px = x + dx, pm = mm + dm;
      if (px > 0.8 && px < W - 0.8 && pm > 0.8 && !crowd(px, pm)) return [px, pm];
    }
    return [x, mm];
  };
  if (front) {
    const fm = Math.min(frontM, pocket ? H - POCKET : RIVER_TOP - 0.6);
    if (!tanky && (I.brocken || I.mini)) return place(pick.idx, front.x, Math.min(fm + 1.6, RIVER_TOP - 0.6)); // vor die Schützen
    const [x, mm] = spread(front.x + (rnd(g) - 0.5) * 1.5, I.ranged ? fm - 2.8 : fm - 0.8);
    return place(pick.idx, x, mm);
  }
  if (I.building) return place(pick.idx, guard ? 9 + (lane === 0 ? -0.9 : 0.9) : lx + (lane === 0 ? 2.5 : -2.5), guard ? 9.2 : HALF - 4.5);
  if (guard) return place(pick.idx, 9 + (lane === 0 ? -2 : 2), 6); // Führung absichern: zwischen die Türme
  if (pocket && smart >= 0.5 && (I.sieg || punish || allIn || finish >= 0 || I.speed >= 1.5)) return place(pick.idx, lx + (rnd(g) - 0.5), H - POCKET - 0.4); // durch die offene Seite
  const rush = punish || allIn || finish >= 0 || !smart || I.speed >= 1.5 || (smart >= 1 && !I.brocken && rnd(g) > st.back);
  if (rush) return place(pick.idx, lx + (rnd(g) - 0.5), RIVER_TOP - 0.6); // schnelle direkt an die Brücke
  const [x, mm] = spread(lx + (rnd(g) - 0.5) * 2, 1.2 + rnd(g));
  return place(pick.idx, x, mm); // langsame hinten starten, damit Kraft nachwächst
}

// Lohnt die Fähigkeit einer Heldenform (helden.js) gerade? Jede wirkt nur einmal je Einsatz – also nicht ins Leere.
function formWanted(g, side, st, near) {
  const h = st.ent, a = st.ability, S = g.sides[side];
  const all = g.ents.filter(e => e.side !== side && !e.hidden), foes = all.filter(e => e.kind === 'unit'), ground = foes.filter(e => !e.air);
  const hurt = h.hp < h.maxHp * 0.5, onMe = all.filter(e => e.targetId === h.id && e.dmg > 0 && e.hp > 0).length;
  switch (a.id) {
    case 'schildruf': return near(all.filter(e => e.dmg > 0), a.radius).length >= 2 || (hurt && onMe >= 1);
    case 'felswurf': return near(foes, a.radius + h.r).some(e => e.hp >= 500);
    case 'glutmahl': return (h.pan || 0) >= 44 || (hurt && onMe >= 1) || (h.inRange && (h.pan || 0) >= 22);
    case 'bolzenstand': return near(foes, 6).length >= 1 && S.kraft >= 5;
    case 'funkenflug': return near(ground.filter(e => !e.hitsAir), 3).length >= 1 || near(foes, 5.5).length >= 3;
    case 'schneetreiben': return near(foes, a.radius).length >= 2 || near(foes, a.radius).some(e => e.hp >= 600);
    case 'bannerruf': return S.kraft >= 2.5 || st.left < 1.5;             // das Banner steht nur fünf Sekunden; nicht die letzte Kraft dafür geben
    case 'stachelsprung': return foes.some(e => e.hp > 0 && e.hp <= a.dmg * 1.6 && e.dmg > 0) && !hurt;
    case 'zweiterlauf': return near(ground, a.len).length >= 1 && (hurt || near(ground, a.len).length >= 2);
    case 'sternentrug': return near(ground, 3).length >= 1 || onMe >= 2;
    case 'kieselspringer': return near(ground, a.radius).length >= 1;
    case 'absprung': return near(all.filter(e => e.kind !== 'unit'), 7).length >= 1 || (hurt && near(ground, 2).length >= 1);
    case 'standwurf': return near(all.filter(e => e.kind !== 'unit'), a.range).length >= 1 && near(foes, 4).length === 0;
    case 'grabmutter': return S.kraft >= a.cost + 1.5;
    case 'baerenzorn': return (h.inRange && S.kraft >= 5) || (h.hp < h.maxHp * 0.35 && onMe >= 1);
    case 'klingenwirbel': return near(ground, a.radius).length >= 2 || near(ground, a.radius).some(e => e.hp >= 700);
    default: return false;
  }
}

// Soll der Held seine Fähigkeit jetzt einsetzen?
export function aiAbility(g, side, ai) {
  const L = LEVELS[ai.level] || LEVELS.mittel;
  for (const st of abilities(g, side)) {
    if (!st.ready) continue;
    const h = st.ent, a = st.ability;
    const near = (list, r) => list.filter(e => e !== h && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) - e.r <= r);
    const foes = near(g.ents.filter(e => e.side !== side), a.radius);
    if (st.form) { if (formWanted(g, side, st, near)) return st.cardId; continue; }
    if (a.id === 'schlachtruf') {
      const allies = near(g.ents.filter(e => e.side === side && e.kind === 'unit'), a.radius);
      const fight = near(g.ents.filter(e => e.side !== side), 7).length > 0;
      if (fight && (allies.length >= 2 || (allies.length >= 1 && L.smart < 1))) return st.cardId;
    } else if (a.id === 'blitzkette' || a.id === 'sturmlauf') {
      const units = foes.filter(e => e.kind === 'unit' && !e.hidden);
      if (units.length >= 2 || units.some(e => e.hp >= 500) || foes.some(e => e.kind === 'tower' && e.hp <= a.dmg * TOWER_SPELL_FACTOR)) return st.cardId;
    } else if (a.id === 'schleier') {
      if (h.inRange || near(g.ents.filter(e => e.side !== side && e.kind === 'unit'), 5).length) return st.cardId;
    } else if (a.id === 'wurzelheer' || a.id === 'leibwache') {
      if (near(g.ents.filter(e => e.side !== side), 5).length) return st.cardId;
    } else if (a.id === 'seitenwechsel') { // abtauchen, wenn es eng wird oder die Ladung viele trifft
      const units = foes.filter(e => e.kind === 'unit');
      if (units.length >= 3 || (h.hp < h.maxHp * 0.4 && units.length)) return st.cardId;
    } else if (a.id === 'stillewacht') {
      if (g.ents.some(e => e.side !== side && e.targetId === h.id && e.dmg > 0 && e.inRange)) return st.cardId;
    }
  }
  return null;
}

export function aiUpdate(g, side, ai, dt) {
  if (g.over) return false;
  observe(g, side, ai, true); // jeden Takt hinsehen (billig), nur im Takt der Stufe nachdenken
  ai.t -= dt;
  if (ai.t > 0) return false;
  const L = LEVELS[ai.level] || LEVELS.mittel;
  ai.t = L.think * (0.7 + rnd(g) * 0.6);
  if (rnd(g) < 0.4 + L.smart * 0.6) { const id = aiAbility(g, side, ai); if (id && useAbility(g, side, id)) return true; }
  const act = aiChoose(g, side, ai);
  if (!act) return false;
  const p = clampDeploy(g, side, g.sides[side].hand[act.idx], act.x, act.y);
  return playCard(g, side, act.idx, p.x, p.y);
}
