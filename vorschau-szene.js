// Kartenvorschau, Teil 1: die Szene. Für jede Karte entsteht ein kleines Spiel mit den echten Regeln (sim.createGame):
// die Karte wird in einem Ausschnitt der eigenen Feldhälfte ausgespielt und trifft auf eine Gegnergruppe, die zu ihr passt.
// Reine Logik ohne Bildschirm – gezeichnet wird in vorschau.js, geprüft in test/vorschau.test.js.
//   scene(id, { form, lvl })   form: '' gewöhnlich · 'rune' Runenform · 'held' Heldenform
//   → { g, view, dur, kind, units, step(), done, stats }
import { CARDS, UNITS, RUNES } from './cards.js';
import { HERO_FORMS } from './helden.js';
import * as sim from './sim.js';

const SEED = 4711;
// Ausschnitt des Felds, den die Vorschau zeigt (eigene Hälfte direkt unter dem Fluss), und die festen Orte darin
export const VIEW = { x0: 3.6, x1: 14.4, y0: 16.1, y1: 24.5 };
const VIEW_TOWER = { x0: 0.2, x1: 11, y0: 18.4, y1: 26.4 };   // Turmkarten: der linke Außenturm steht mit im Bild
const ME = { x: 9, y: 22.5 }, FOE = { x: 9, y: 18.9 }, MID = { x: 9, y: 20.4 };

// Was eine Einheit alles aufs Feld bringen kann (für das Vorladen der Bildfolgen)
function family(unit, out) {
  const u = UNITS[unit];
  if (!u || out.has(unit)) return;
  out.add(unit);
  for (const k of ['spawn', 'deathSpawn', 'morph', 'hatch', 'hitSpawn']) if (u[k] && u[k].unit) family(u[k].unit, out);
  if (u.second && u.second.unit) family(u.second.unit, out);
}

// Gegnergruppen: [Einheit, dx, dy] um den Sammelpunkt – je Art drei Gewichte (für Karten bis 2, bis 4 und ab 5 Kraft),
// damit die gezeigte Karte ihren Auftritt meist gewinnt
const GROUPS = {
  boden:   [[['wicht', -0.7, 0], ['wicht', 0.7, 0]],
            [['eisenwaechter', 0, 0], ['wicht', -1.2, -0.4]],
            [['eisenwaechter', 0, 0], ['wicht', -1.2, -0.5], ['wicht', 1.2, -0.5], ['kiesel', -0.6, -1], ['kiesel', 0.6, -1]]],
  schwarm: [[['kiesel', -1, 0], ['kiesel', -0.3, 0.4], ['kiesel', 0.4, 0], ['kiesel', 1.1, 0.4]],
            [['kiesel', -1.4, 0], ['kiesel', -0.7, 0.4], ['kiesel', 0, 0], ['kiesel', 0.7, 0.4], ['kiesel', 1.4, 0], ['wicht', -0.8, -0.8], ['wicht', 0.8, -0.8]],
            [['kiesel', -1.4, 0], ['kiesel', -0.7, 0.4], ['kiesel', 0, 0], ['kiesel', 0.7, 0.4], ['kiesel', 1.4, 0], ['wicht', -0.8, -0.8], ['wicht', 0.8, -0.8], ['eisenwaechter', 0, -1.2]]],
  luft:    [[['nachtfalter', -0.8, 0], ['nachtfalter', 0.8, 0], ['kiesel', 0, 0.4]],
            [['kraehe', -1, 0], ['nachtfalter', 1, 0], ['wicht', 0, 0.4]],
            [['kraehe', -1.1, 0], ['kraehe', 1.1, 0], ['eisenwaechter', 0, 0.4]]],
  stark:   [[['hammerschmied', 0, 0]], [['hammerschmied', 0, 0]], [['hammerschmied', -0.7, 0], ['eisenwaechter', 0.7, 0]]],
  pulk:    [[['eisenwaechter', 0, 0.5], ['waldlaeufer', -1.1, -0.9], ['waldlaeufer', 1.1, -0.9], ['kiesel', -1.3, 0.3], ['kiesel', 1.3, 0.3], ['kiesel', -0.5, -0.2], ['kiesel', 0.5, -0.2]]],
  reihe:   [[['eisenwaechter', 0, 0.6], ['wicht', -0.9, -0.2], ['wicht', 0.9, -0.2], ['waldlaeufer', 0, -1.3]]],
};
// Anrückende Gegner für Gebäude und Türme: [Einheit, dx, Wartezeit] – sie erscheinen nacheinander am Flussufer
const MARCH = {
  boden: [['kiesel', -0.8, 0], ['kiesel', 0, 0.4], ['kiesel', 0.8, 0.8], ['wicht', -0.6, 2.4], ['wicht', 0.6, 3.2], ['eisenwaechter', 0, 5]],
  luft:  [['kiesel', -0.6, 0], ['nachtfalter', 0.7, 0.5], ['kiesel', -1, 1.6], ['kraehe', 0.2, 2.6], ['wicht', 1, 3.4], ['nachtfalter', -0.5, 4.6], ['wicht', 0.6, 5.2]],
  brut:  [['kiesel', -0.6, 0.6], ['kiesel', 0.6, 2], ['wicht', 0, 4], ['kiesel', -0.8, 6], ['kiesel', 0.8, 6.4]],
  weit:  [['waldlaeufer', -0.8, 0], ['waldlaeufer', 0.8, 0.3], ['kiesel', 0, 5]],   // bleiben auf Abstand: Ziel für Geschütze mit Mindestabstand
};

export function scene(id, opt = {}) {
  const c = CARDS[id];
  if (!c) return null;
  const lvl = Math.max(1, opt.lvl || sim.STD_LEVEL), form = opt.form === 'rune' && RUNES[id] ? 'rune' : opt.form === 'held' && HERO_FORMS[id] ? 'held' : '';
  const tower = c.type === 'tower', R = form === 'rune' ? RUNES[id] : null;
  const unit = tower ? UNITS[c.unit] : c.type === 'spell' ? null : UNITS[R && R.unit ? R.unit : c.mix ? c.mix[0][0] : c.unit];
  const ability = form === 'held' ? HERO_FORMS[id].ability : c.hero ? c.ability : null;
  const levels = [{ cards: { [id]: lvl, eisenwaechter: lvl }, tower: lvl, towerType: tower ? id : undefined, runes: R ? [id] : [], forms: form === 'held' ? [id] : [] }, { cards: {}, tower: lvl }];
  const g = sim.createGame({ seed: SEED, decks: [[id], []], levels, rules: { runeAlways: [true, false] } });
  const S = g.sides[0];
  const script = [], units = new Set(), stats = { played: false, ability: false, hurt: 0, healed: 0, born: 0, fell: 0 };
  const at = (t, fn) => script.push({ t, fn });   // fn gibt 'nochmal' zurück, wenn es im nächsten Takt wieder versucht werden soll
  // Gegner sind Attrappen: Sie folgen allen Regeln, schlagen aber nur knapp halb so hart zu – die gezeigte Karte soll ihren Auftritt haben
  const foe = (type, x, y, extra) => { family(type, units); const e = sim.spawnUnit(g, type, 1, x, y, lvl, { deployT: 1, ...extra }); e.dmg = Math.round(e.dmg * 0.45); return e; };
  const mine = (type, x, y, extra) => { family(type, units); return sim.spawnUnit(g, type, 0, x, y, lvl, { deployT: 1, ...extra }); };
  const tier = c.cost <= 2 ? 0 : c.cost <= 4 ? 1 : 2;
  const group = (name, p = FOE) => { const G = GROUPS[name]; return G[Math.min(tier, G.length - 1)].map(([t, dx, dy]) => foe(t, p.x + dx, p.y + dy)); };
  const march = (name, x = 9, y = 17.5) => MARCH[name].map(([t, dx, wait]) => foe(t, x + dx, y, { deployT: 1 + wait }));
  const hut = (p = FOE, extra) => { const e = foe('steinschleuder', p.x, p.y, { hp: 4000, maxHp: 4000, life: 0, ...extra }); e.dmg = Math.round(e.dmg * 0.5); return e; };           // Gebäude als Ziel: hält die ganze Szene durch
  const post = p => mine('kraftquell', p.x, p.y, { kraftT: 999, life: 0, hp: 6000, maxHp: 6000 });                          // eigener Posten, an dem sich die Gegner sammeln
  const play = (card, x, y) => {
    S.hand[0] = card; S.kraft = sim.MAX_KRAFT;
    const p = sim.clampDeploy(g, 0, card, x, y);
    return !p.blocked && sim.playCard(g, 0, 0, p.x, p.y);
  };
  const center = side => { let x = 0, y = 0, n = 0; for (const e of g.ents) if (e.side === side && e.kind !== 'tower' && e.hp > 0 && !e.keep) { x += e.x; y += e.y; n++; } return n ? { x: x / n, y: y / n } : MID; };
  const weaken = () => { for (const e of g.ents) if (e.side === 0 && e.kind !== 'tower' && !e.keep && e.hp > 1) { e.hp = 1; e.shield = 0; } };   // der nächste Treffer fällt sie: zeigt, was beim Tod geschieht
  let view = VIEW, dur = 9, kind = 'truppe', own = id, minT = 4.5;
  if (c.type !== 'spell' && !tower) for (const [u] of c.mix || [[c.unit]]) family(u, units);
  if (R && R.unit) family(R.unit, units);
  if (R && R.extra) for (const [u] of R.extra) family(u, units);
  if (ability && ability.unit) family(ability.unit, units);

  if (tower) {
    // Turmkarte: der Außenturm verteidigt sich gegen eine anrückende Gruppe
    kind = 'turm'; view = VIEW_TOWER; dur = 10;
    march(unit.hitsAir === false ? 'boden' : 'luft', 3.5, 18.8);
    if (unit.bless) { mine('eisenwaechter', 5.5, 23.2); S.blessT = 2.5; }   // Segen: sonst erst nach einer halben Minute zu sehen
    family(c.unit, units);
  } else if (c.type === 'spell') {
    kind = 'zauber'; dur = Math.min(11, 6.5 + (c.dur || 0) * 0.6 + (c.delay || 0));
    const spellAt = (t, where) => at(t, () => { const p = where(); if (play(id, p.x, p.y)) stats.played = true; });
    if (c.mirror) {            // Wiederholen: erst eine Truppe, dann dieselbe noch einmal
      own = 'eisenwaechter'; family('eisenwaechter', units); group('boden');
      at(0.5, () => { play('eisenwaechter', ME.x - 1.5, ME.y); });
      spellAt(1.6, () => ({ x: ME.x + 1.5, y: ME.y }));
    } else if (c.heal || c.haste || c.clone) {   // wirkt auf die eigenen Truppen: sie stehen im Gefecht
      const a = mine('hammerschmied', MID.x - 0.8, MID.y + 1.2), b = mine('eisenwaechter', MID.x + 0.8, MID.y + 1.2), d = mine('waldlaeufer', MID.x, MID.y + 2.6);
      if (c.heal) for (const e of [a, b, d]) e.hp = Math.round(e.maxHp * 0.35);
      if (c.haste) hut({ x: FOE.x, y: FOE.y - 0.4 }); else { foe('eisenwaechter', FOE.x - 0.8, FOE.y); foe('eisenwaechter', FOE.x + 0.8, FOE.y); }
      spellAt(2.4, () => center(0));
    } else if (c.summon && !c.dmg || c.summonOver) {   // bringt Truppen: mitten ins gegnerische Lager
      hut(); foe('waldlaeufer', FOE.x - 1.6, FOE.y + 0.6); foe('waldlaeufer', FOE.x + 1.6, FOE.y + 0.6);
      spellAt(1.2, () => ({ x: FOE.x, y: FOE.y + (c.summonOver ? 0.4 : 1.4) }));
      dur = c.summonOver ? 11 : 8;
    } else {                   // Schaden, Frost, Sog, Fluch …: auf einen Pulk, der einen eigenen Posten angreift
      const p = post({ x: MID.x, y: MID.y + 1.9 }); p.keep = true;
      group(c.roll ? 'reihe' : 'pulk', { x: MID.x, y: MID.y - 0.6 });
      if (c.ground || c.buildF) hut({ x: MID.x + 2.2, y: MID.y - 1.6 }, { hp: 1500, maxHp: 1500 });
      spellAt(2.3, () => { const m = center(1); return c.roll ? { x: m.x, y: Math.min(VIEW.y1 - 0.6, m.y + (c.roll.len > 6 ? 3.6 : 2.6)) } : m; });
    }
  } else {
    const building = c.type === 'building', spawner = !!(unit.spawn || (R && UNITS[R.unit] && UNITS[R.unit].spawn));
    kind = building ? 'gebaeude' : 'truppe';
    let where = { ...ME }, weak = 0;
    if (building) {
      where = { x: 9, y: unit.minRange ? 23.6 : 22.6 };
      if (unit.tunnel || c.anywhere) { hut({ x: FOE.x + 1.6, y: FOE.y - 0.3 }); where = { x: FOE.x - 0.6, y: FOE.y + 1.2 }; foe('waldlaeufer', FOE.x - 1.8, FOE.y - 0.6); }
      else if (unit.kraft) { dur = 7; at(1.2, () => { for (const e of g.ents) if (e.side === 0 && e.d.kraft) e.kraftT = Math.min(e.kraftT, 2.2); }); }   // der erste Tropfen fällt in der Vorschau früher
      else if (!unit.dmg && !unit.spawn) { march('brut'); weak = 3.2; }     // wirkt erst, wenn es fällt
      else if (spawner) { march('brut'); dur = 11; }
      else { march(unit.minRange ? 'weit' : unit.hitsAir ? 'luft' : 'boden'); dur = 10; }
    } else {
      const area = unit.splash || unit.spin || unit.line || unit.chain || unit.scatter || unit.burst;
      if (unit.tunnel || c.anywhere) { hut({ x: FOE.x + 1.2, y: FOE.y - 0.4 }); foe('waldlaeufer', FOE.x - 1.6, FOE.y - 0.4); where = { x: FOE.x - 0.4, y: FOE.y + 1.3 }; }
      else if (unit.targets === 'buildings') { hut(); foe('kiesel', FOE.x - 1.5, FOE.y + 0.6); foe('kiesel', FOE.x + 1.5, FOE.y + 0.6); }
      else if (spawner) march('brut', 9, 17.8);
      else if (unit.healHit || unit.enchant) { group('boden'); const a = mine('eisenwaechter', ME.x - 1.4, ME.y - 0.8), b = mine('waldlaeufer', ME.x + 1.4, ME.y + 0.2); if (unit.healHit) { a.hp = Math.round(a.maxHp * 0.4); b.hp = Math.round(b.maxHp * 0.4); } }
      else if (unit.deathDmg || unit.deathSpawn || unit.hatch || unit.deathZone || unit.morph || unit.bounty || (ability && ability.id === 'bannerruf')) group(area ? 'schwarm' : 'stark');
      else if (unit.kamikaze || area) group('schwarm');
      else if (unit.hitsAir && unit.range >= 2) group('luft');
      else group('boden');
      if (unit.deathDmg || unit.deathSpawn || unit.hatch || unit.deathZone || unit.morph) { weak = 5; dur = 10.5; }
      if (spawner) dur = Math.max(dur, 11);
      if (c.hero) where.x -= 1.5;
    }
    at(0.5, () => { if (play(id, where.x, where.y)) stats.played = true; });
    if (ability && (ability.id === 'bannerruf' || ability.id === 'grabmutter')) weak = 0;
    if (ability && ability.id === 'bannerruf') weak = 3;   // der Ruf geht erst, wenn der letzte Wicht gefallen ist
    if (weak) at(weak, weaken);
  }
  if (ability) {   // Fähigkeit eines Helden oder einer Heldenform: auslösen, sobald es geht
    dur = Math.max(dur, 11);
    const from = c.type === 'spell' ? 4.2 : ability.id === 'bannerruf' ? 3.2 : ability.id === 'glutmahl' ? 5 : 3.4;
    minT = from + 4.5;
    at(from, () => { S.kraft = sim.MAX_KRAFT; if (!sim.useAbility(g, 0, id)) return 'nochmal'; stats.ability = true; });
  }

  script.sort((a, b) => a.t - b.t);
  const hp0 = new Map();
  let idle = 0;
  const sc = {
    g, view, dur, kind, units: [...units].map(u => UNITS[u].model || u), stats, card: own,
    get done() { return g.time >= dur || (idle > 1.6 && g.time > minT); },   // früher von vorn, sobald eine Seite das Feld geräumt hat
    step() {
      while (script.length && script[0].t <= g.time) { if (script[0].fn() === 'nochmal') break; script.shift(); }
      const foes = g.ents.some(e => e.side === 1 && e.kind !== 'tower'), own = g.ents.some(e => e.side === 0 && e.kind !== 'tower' && !e.keep);
      idle = (kind === 'truppe' || kind === 'gebaeude') && stats.played && !script.length && (!foes || !own) && !g.zones.length ? idle + sim.DT : 0;
      for (const e of g.ents) {
        if (e.kind === 'tower') { e.hp = e.maxHp; if (e.side === 1 || !tower) e.cd = 5; }   // Türme fallen nie; nur in der Szene einer Turmkarte schießen die eigenen
        else if (e.keep) e.hp = e.maxHp;
      }
      hp0.clear(); for (const e of g.ents) if (e.kind !== 'tower' && !e.keep) hp0.set(e.id, [e.hp + (e.shield || 0), e.side]);
      const n0 = g.nextId;
      sim.step(g);
      for (const [eid, [h, side]] of hp0) {
        const e = g.byId.get(eid), now = e ? Math.max(0, e.hp) + (e.shield || 0) : 0;
        if (now > h && side === 0) stats.healed += now - h;
        if (now < h && side === 1) stats.hurt += h - now;
        if (!e && side === 0) stats.fell++;
      }
      for (const e of g.ents) if (e.id >= n0 && e.side === 0) stats.born++;
    },
  };
  return sc;
}

// Welche Formen eine Karte in der Vorschau zeigen kann
export const sceneForms = id => ['', ...(RUNES[id] ? ['rune'] : []), ...(HERO_FORMS[id] ? ['held'] : [])];
