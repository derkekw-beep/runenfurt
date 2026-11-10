// Computergegner. aiChoose ist eine reine Entscheidung (nutzt nur den Spielzustand und dessen Zufallsgenerator),
// aiUpdate ruft sie im Takt der Schwierigkeit auf, spielt die Karte und löst Heldenfähigkeiten aus.
import { CARDS, UNITS, TOWER_SPELL_FACTOR } from './cards.js';
import { W, H, RIVER_TOP, RIVER_BOT, OUTER_Y, playCard, clampDeploy, cardCost, rnd, outerTower, mainTower, kraftRate, abilities, useAbility } from './sim.js';

export const LEVELS = {
  leicht: { name: 'Leicht', think: 2.4, minAttack: 9, defend: 0.5, spells: 0.25, smart: 0, err: 0.3 },
  mittel: { name: 'Mittel', think: 1.2, minAttack: 8, defend: 0.9, spells: 0.7, smart: 0.5, err: 0.25 },
  schwer: { name: 'Schwer', think: 0.5, minAttack: 7, defend: 1, spells: 1, smart: 1, err: 0 },
};

export const createAi = level => ({ level: LEVELS[level] ? level : 'mittel', t: 2.5, lane: -1, laneT: 0 });

const dps = u => ((u.dmg || 0) * (u.scatter ? u.scatter.n * 0.45 : 1)) / (u.atk || 1); // Streuschuss: knapp die Hälfte der Splitter trifft
// Gesamtschaden eines Schadenszaubers (Dauerschaden zählt nur anteilig, weil Gegner aus dem Kreis laufen)
const spellDmg = c => (c.freeze ? 0 : c.dmg) || (c.dot ? c.dot * (c.dur / c.tick) * 0.55 : 0) || (c.pulses ? c.pulses.dmg[1] * c.pulses.n * 0.6 : 0);

// Wert eines Schadenszaubers an Punkt (x, y): getroffener Schaden, Türme zählen anteilig, ein Turm-Todesstoß sehr viel.
function spellValue(g, side, c, x, y) {
  let dmg = spellDmg(c);
  let v = 0;
  let list = g.ents;
  if (c.pulses) { // Stöße: je weniger Gegner im Kreis, desto härter
    const n = g.ents.filter(e => e.side !== side && Math.hypot(e.x - x, e.y - y) <= c.radius + e.r * 0.6).length;
    dmg = c.pulses.dmg[n <= 1 ? 0 : n <= 4 ? 1 : 2] * c.pulses.n * 0.6; // wer weiterläuft, bekommt nicht alle Stöße ab
  }
  if (c.strikes) list = g.ents.filter(e => e.side !== side && Math.hypot(e.x - x, e.y - y) <= c.radius + e.r * 0.6).sort((p, q) => q.hp - p.hp).slice(0, c.strikes);
  const vy = side === 0 ? -1 : 1;
  for (const e of list) {
    if (e.side === side) continue;
    if (c.roll) { // Bahn der Walze: von (x, y) nach vorn
      const along = (e.y - y) * vy;
      if (e.air || along < -0.5 || along > c.roll.len || Math.abs(e.x - x) > c.roll.w / 2 + e.r * 0.6) continue;
    } else if (Math.hypot(e.x - x, e.y - y) > c.radius + e.r * 0.6) continue;
    if ((c.ground && e.air) || e.buried) continue;
    if (e.kind === 'tower') { const d = dmg * (c.towerF || TOWER_SPELL_FACTOR); v += e.hp <= d ? 3000 : d * 0.8; }
    else if (e.kind === 'unit') v += Math.min(e.hp, dmg) + (e.hp <= dmg ? 40 : 0) + (c.stun ? dps(e) * 0.6 : 0) + (c.amp ? Math.min(e.hp, 1500) * 0.15 : 0) + (c.slow ? dps(e) * 0.5 : 0);
    else v += Math.min(e.hp, dmg * (c.buildF || 1)) * 0.6;
  }
  return v;
}

function bestSpell(g, side, c) {
  let best = null;
  for (const e of g.ents) {
    if (e.side === side) continue;
    if (c.ownSide && (side === 0 ? e.y < RIVER_BOT + 0.4 : e.y > RIVER_TOP - 0.4)) continue; // fällt nur aufs eigene Feld
    // Kandidaten: auf dem Gegner selbst und leicht in dessen Laufrichtung versetzt
    const lead = c.roll ? (side === 0 ? 1.2 : -1.2) : e.kind === 'unit' && !c.dot ? (e.vy || 0) * e.speed * c.delay : 0;
    const v = spellValue(g, side, c, e.x, e.y + lead);
    if (!best || v > best.v) best = { v, x: e.x, y: e.y + lead };
  }
  return best;
}

export function aiChoose(g, side, ai) {
  const L = LEVELS[ai.level];
  const S = g.sides[side];
  const my = y => (side === 1 ? y : H - y); // gespiegelt: mein Hauptturm steht bei my = 3, der Fluss beginnt bei 15
  const HALF = H / 2;
  // der Widerhall zählt als die Karte, die er wiederholt (eine Kraft teurer)
  const hand = S.hand.map((id, idx) => { const eff = CARDS[id].mirror ? S.last : id; return eff ? { id: eff, idx, c: CARDS[eff], cost: cardCost(g, side, id) } : null; }).filter(h => h && h.cost <= S.kraft);
  if (!hand.length) return null;
  const place = (idx, x, m) => { const p = clampDeploy(g, side, S.hand[idx], x, side === 1 ? m : H - m); return { idx, x: p.x, y: p.y }; };
  // Patzer: schwächere Stufen spielen ab und zu einfach irgendeine Truppe irgendwohin
  if (L.err && S.kraft >= 5 && rnd(g) < L.err) {
    const any = hand.filter(h => h.c.type !== 'spell');
    if (any.length) return place(any[Math.floor(rnd(g) * any.length)].idx, 1.5 + rnd(g) * 15, 2 + rnd(g) * 12.5);
  }
  const foes = g.ents.filter(e => e.side !== side && e.kind === 'unit');
  const mine = g.ents.filter(e => e.side === side && e.kind === 'unit');

  // 1) Bedrohungen in meiner Hälfte
  const threats = foes.filter(e => my(e.y) < HALF + (e.air ? 1.5 : 0.2));
  const power = list => list.reduce((s, e) => s + e.hp * 0.4 + dps(e) * 6, 0);
  const tp = power(threats);
  if (threats.length && rnd(g) < L.defend) {
    const defenders = mine.filter(e => my(e.y) < HALF + 1);
    const need = L.smart >= 0.5 ? tp > 350 && power(defenders) < tp * 1.3 : true;
    if (need) {
      const lead = threats.reduce((a, b) => (my(a.y) < my(b.y) ? a : b));
      const airHp = threats.filter(e => e.air).reduce((s, e) => s + e.hp, 0), allHp = threats.reduce((s, e) => s + e.hp, 0);
      const airShare = airHp / allHp;
      const swarm = threats.length >= 3 && allHp / threats.length < 450;
      const tank = threats.some(e => e.maxHp >= 1600);
      let best = null;
      for (const h of hand) {
        const c = h.c;
        let score;
        if (c.type === 'spell') {
          if (c.root || c.freeze) {
            const held = threats.filter(e => (c.freeze || !e.air) && Math.hypot(e.x - lead.x, e.y - lead.y) <= c.radius);
            score = held.reduce((s, e) => s + dps(e), 0) * (c.root || c.freeze) * 0.5;
            if (score < (c.freeze ? 500 : 300)) continue;
            score = score / Math.sqrt(c.cost);
            if (!best || score > best.score) best = { score, act: { idx: h.idx, x: lead.x, y: lead.y } };
            continue;
          }
          if (!spellDmg(c)) continue;
          const sp = bestSpell(g, side, c);
          if (!sp || sp.v < c.cost * (L.smart ? 150 : 100)) continue;
          score = sp.v / Math.sqrt(c.cost);
          if (!best || score > best.score) best = { score, act: { idx: h.idx, x: sp.x, y: sp.y } };
          continue;
        }
        const u = UNITS[c.unit];
        if (u.targets === 'buildings' || u.minRange) continue;
        const su = u.dmg ? u : u.spawn ? UNITS[u.spawn.unit] : u.deathSpawn ? UNITS[u.deathSpawn.unit] : null; // Gebäude ohne eigenen Angriff zählen über das, was herauskommt
        if (!su) continue;
        if (airShare > 0.95 && !su.hitsAir) continue;
        const n = c.count || 1;
        score = dps(su) * n * (u.dmg ? 1 : 2) + u.hp * n * 0.06;
        if (airShare > 0.2 && !su.hitsAir) score *= 1 - airShare * 0.8;
        if (swarm) score *= u.splash || u.spin ? 2.2 : n >= 3 ? 1.2 : 0.7;
        if (tank) score *= dps(su) * n >= 250 ? 1.5 : 0.8;
        if (u.kamikaze && !swarm) score *= u.stunArea ? 1 : 0.5; // Frost hält auch einen Einzelnen auf
        if (c.type === 'building' && !tank && !threats.some(e => e.targets === 'buildings')) score *= 0.6;
        score = score / Math.sqrt(c.cost) * (1 + (1 - L.smart) * (rnd(g) - 0.5) * 1.6);
        let x, m;
        const lm = my(lead.y);
        if (c.type === 'building') { x = 9 + (lead.x < 9 ? -2 : 2); m = OUTER_Y + 3.5; }
        else if (u.range >= 2 && !u.kamikaze && !u.scatter) { x = lead.x + (lead.x < 9 ? 1.5 : -1.5); m = Math.max(3.5, Math.min(lm, HALF - 2) - 3.5); } // Streuschützen gehören dicht heran
        else { x = lead.x; m = Math.max(3.5, Math.min(lm, HALF - 1.6) - (lead.air ? 0 : 1.2)); }
        if (!best || score > best.score) best = { score, act: place(h.idx, x, m) };
      }
      if (best) return best.act;
      if (S.kraft < 9.5) return null; // sparen, bis eine passende Antwort bezahlbar ist
    }
  }

  // 2) Lohnende Zauber
  if (rnd(g) < L.spells) {
    for (const h of hand) {
      const c = h.c;
      if (c.type !== 'spell') continue;
      if (spellDmg(c) && !c.root) {
        const sp = bestSpell(g, side, c);
        if (sp && sp.v >= c.cost * (L.smart ? 160 : 110)) return { idx: h.idx, x: sp.x, y: sp.y };
      } else if (c.summon || c.summonOver) { // Wichte direkt an den schwächeren Turm werfen
        const ts = [outerTower(g, 1 - side, 0), outerTower(g, 1 - side, 1)].filter(Boolean).sort((p, q) => p.hp - q.hp);
        const t = ts[0] || mainTower(g, 1 - side);
        // Nach und nach erscheinende Truppen lohnen nur, wenn ein eigener Brocken den Turm beschäftigt (oder die Kraft sonst verfällt)
        const tanked = t && mine.some(e => e.maxHp >= 1200 && Math.hypot(e.x - t.x, e.y - t.y) <= 5);
        if (t && c.summonOver ? tanked || S.kraft >= 9.8 : t && S.kraft >= Math.max(6, h.cost + 1) && !threats.length) return { idx: h.idx, x: t.x + (rnd(g) - 0.5) * 2, y: t.y + (side === 1 ? -1.4 : 1.4) };
      } else if (c.heal) {
        for (const e of mine) {
          const hurt = mine.filter(o => Math.hypot(o.x - e.x, o.y - e.y) <= c.radius).reduce((s, o) => s + (o.maxHp - o.hp), 0);
          if (hurt >= 900) return { idx: h.idx, x: e.x, y: e.y };
        }
      } else if (c.clone) { // Trugbild auf einen Angriff, der sich lohnt
        for (const e of mine) {
          if (e.hero || e.clone || my(e.y) < HALF - 4) continue;
          const near = mine.filter(o => !o.hero && !o.clone && Math.hypot(o.x - e.x, o.y - e.y) <= c.radius);
          if (near.length >= 3 || near.reduce((s, o) => s + dps(o), 0) >= 380) return { idx: h.idx, x: e.x, y: e.y };
        }
      } else if (c.haste) {
        for (const e of mine) {
          if (my(e.y) < HALF - 3) continue; // nur für einen Angriff, der schon unterwegs ist
          const near = mine.filter(o => Math.hypot(o.x - e.x, o.y - e.y) <= c.radius);
          if (near.length >= 3 || near.reduce((s, o) => s + dps(o), 0) >= 450) return { idx: h.idx, x: e.x, y: e.y };
        }
      }
    }
  }

  // Kraftquell hinten aufstellen, wenn gerade Ruhe ist
  const well = hand.find(h => h.c.type === 'building' && UNITS[h.c.unit].kraft);
  if (well && !threats.length && S.kraft >= 7.5 && !g.ents.some(e => e.side === side && e.d.kraft)) return place(well.idx, 9 + (rnd(g) < 0.5 ? -3.5 : 3.5), 1.4);

  // 3) Angriff aufbauen
  const full = S.kraft >= 9.6;
  const pushing = mine.filter(e => my(e.y) > HALF - 5);
  const minAttack = L.minAttack - (kraftRate(g) > 0.5 ? 1.5 : 0);
  if (S.kraft < minAttack && !(pushing.length && L.smart >= 0.5 && S.kraft >= 5)) return null;
  if (g.time > ai.laneT || ai.lane < 0) {
    const t0 = outerTower(g, 1 - side, 0), t1 = outerTower(g, 1 - side, 1);
    if (L.smart >= 0.5 && t0 && t1 && Math.abs(t0.hp - t1.hp) > 150) ai.lane = t0.hp < t1.hp ? 0 : 1;
    else if (L.smart >= 0.5 && (!t0 || !t1) && mainTower(g, 1 - side)) ai.lane = !t0 ? 0 : 1;
    else ai.lane = rnd(g) < 0.5 ? 0 : 1;
    ai.laneT = g.time + 18;
  }
  if (pushing.length && L.smart > 0) ai.lane = pushing.reduce((a, b) => (a.hp > b.hp ? a : b)).x < W / 2 ? 0 : 1;
  const lx = ai.lane === 0 ? 3.5 : 14.5;
  const troops = hand.filter(h => h.c.type !== 'spell');
  if (!troops.length) {
    if (!full) return null;
    // volle Kraft und nur Zauber auf der Hand: nicht verfallen lassen
    const h = hand.find(x => spellDmg(x.c)) || hand[0];
    const t = outerTower(g, 1 - side, ai.lane) || mainTower(g, 1 - side);
    return spellDmg(h.c) ? { idx: h.idx, x: t.x, y: t.y } : mine[0] ? { idx: h.idx, x: mine[0].x, y: mine[0].y } : null;
  }
  const front = pushing.filter(e => (e.x < W / 2 ? 0 : 1) === ai.lane).sort((a, b) => my(b.y) - my(a.y))[0];
  const rate = h => {
    const c = h.c, u = UNITS[c.unit];
    let s = 1 + (1 - L.smart) * rnd(g) * 3;
    if (u.kraft) return -9;
    const siege = u.minRange || (u.building && u.range >= 9);
    if (siege) s += front ? -1 : 1.5;
    if (c.anywhere) s += 1;
    if (u.ford) s += 0.5;
    if (front) { // Unterstützung hinter die Spitze
      if (u.range >= 2 && !u.kamikaze) s += 3;
      if (u.splash || u.spin) s += 1;
      if ((c.count || 1) >= 3) s += 1.5;
      if (c.type === 'building') s -= 2;
    } else {
      if (u.hp >= 1600) s += 3;
      if (u.targets === 'buildings') s += 1.5;
      if (u.spawn) s += 1;
      if (c.hero) s += 1;
      if (u.range >= 2 && !u.building) s -= L.smart;
      if (u.kamikaze) s -= 1;
      if (u.building && u.dmg && !siege) s -= 1.5;
    }
    return s;
  };
  const pick = troops.map(h => ({ h, s: rate(h) })).sort((a, b) => b.s - a.s)[0].h;
  const u = UNITS[pick.c.unit];
  if (u.minRange || (u.building && u.range >= 9)) return place(pick.idx, lx, HALF - 1.7); // Belagerungsgerät an den Fluss: von dort reicht es bis zum Turm
  if (pick.c.anywhere && L.smart) { // gräbt sich direkt am Turm aus
    const t = outerTower(g, 1 - side, ai.lane) || mainTower(g, 1 - side);
    if (t) return { idx: pick.idx, x: t.x + (rnd(g) - 0.5), y: t.y + (side === 1 ? -1.7 : 1.7) };
  }
  if (front) {
    const fm = my(front.y);
    return place(pick.idx, front.x + (rnd(g) - 0.5) * 1.5, u.range >= 2 ? fm - 2.5 : fm - 0.8);
  }
  if (pick.c.type === 'building') return place(pick.idx, lx + (ai.lane === 0 ? 2.5 : -2.5), HALF - 4.5);
  if (u.speed >= 1.5 || !L.smart) return place(pick.idx, lx + (rnd(g) - 0.5), RIVER_TOP - 0.6); // schnelle direkt an die Brücke
  return place(pick.idx, lx + (rnd(g) - 0.5) * 2, 1.2 + rnd(g)); // langsame hinten starten, damit Kraft nachwächst
}

// Soll der Held seine Fähigkeit jetzt einsetzen?
export function aiAbility(g, side, ai) {
  const L = LEVELS[ai.level];
  for (const st of abilities(g, side)) {
    if (!st.ready) continue;
    const h = st.ent, a = st.ability;
    const near = (list, r) => list.filter(e => e !== h && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) - e.r <= r);
    const foes = near(g.ents.filter(e => e.side !== side), a.radius);
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
  ai.t -= dt;
  if (ai.t > 0 || g.over) return false;
  const L = LEVELS[ai.level];
  ai.t = L.think * (0.7 + rnd(g) * 0.6);
  if (rnd(g) < 0.4 + L.smart * 0.6) { const id = aiAbility(g, side, ai); if (id && useAbility(g, side, id)) return true; }
  const act = aiChoose(g, side, ai);
  if (!act) return false;
  const p = clampDeploy(g, side, g.sides[side].hand[act.idx], act.x, act.y);
  return playCard(g, side, act.idx, p.x, p.y);
}
