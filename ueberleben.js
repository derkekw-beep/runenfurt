// Überleben: der Ablauf eines Laufs. Statt gleichförmiger Wellen gibt es Etappen aus fünf Wellen mit Thema und Ansage,
// Elite-Gegner, eine Bosswelle am Ende jeder Etappe, Aufträge mit Bonus, Punkte – und nach jeder zweiten Welle die Wahl
// zwischen drei Segen, die den Lauf prägen (stärkere Karten, mehr Kraft, zähere Türme, Sonderkräfte).
// Gefahrenstufen machen den Lauf härter und bringen mehr Punkte; die Tagesherausforderung hat einen festen Zufallskeim.
//
// Der Spielkern (sim.js) kennt davon nur einen Haken: rules.waves.director(g, dt) ersetzt den eingebauten Wellen-Ablauf.
// Alles hier ist reine Logik ohne Bildschirm; Anzeige und Auswahl stehen in ueberleben-ui.js.
//   setup(waves, { seed, danger, daily })   macht aus den Wellen-Regeln von progress.modeRules einen Lauf
//   pick(g, k) · reroll(g) · autoPick(g)    Segen wählen (k = Nummer des Angebots), neu würfeln, den Computer wählen lassen
//   hud(g) · summary(g)                     was die Anzeige braucht · Abrechnung am Ende
//   survLoad · bookRun · dangerOpen · dailyInfo …   Bestenliste, Gefahrenstufen und Tagesherausforderung im Spielstand
import { CARDS, UNITS } from './cards.js';
import { W, RIVER_TOP, BRIDGES, MAX_KRAFT, STD_LEVEL, cardMult, towerMult, spawnUnit, hurt, formation, mainTower } from './sim.js';

export const STAGE = 5;        // Wellen je Etappe; die letzte ist die Bosswelle
export const TOP_RUNS = 8;     // so viele Läufe behält die Bestenliste
export const DAILY_GOAL = 10;  // Tagesherausforderung: ab dieser Welle gibt es die Tagesbelohnung
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---- Gefahrenstufen: jede Stufe bringt ihren Fluch und alle darunter mit; je Stufe 25 % mehr Punkte -------------
export const DANGER = [
  { name: 'Harte Schale',  text: 'Alle Gegner sind eine Stufe höher.' },
  { name: 'Eilige Meute',  text: 'Alle Gegner laufen 10 % schneller.' },
  { name: 'Karge Zeiten',  text: 'Du beginnst mit 2 Kraft; sie fließt 10 % langsamer.' },
  { name: 'Elitegarde',    text: 'Ab Welle 2 führt ein Elite-Gegner jede Welle an.' },
  { name: 'Morsche Türme', text: 'Deine Türme haben ein Fünftel weniger Leben.' },
];
export const dangerMult = d => 1 + 0.25 * clamp(d | 0, 0, DANGER.length);

// ---- Themen der Wellen: welche Karten des Vorrats dazu passen ----------------------------------------------------
const unitOf = id => { const c = CARDS[id]; return UNITS[c.mix ? c.mix[0][0] : c.unit]; };
export const THEMES = {
  gemischt:  { name: 'Gemischter Trupp', hint: 'Von allem etwas.', fits: () => true },
  schwarm:   { name: 'Schwarm',          hint: 'Viele kleine Gegner – Flächenschaden hilft.', fits: id => CARDS[id].count >= 3 },
  luft:      { name: 'Flieger',          hint: 'Nur Fernkämpfer und Türme treffen sie.', fits: id => !!unitOf(id).air },
  schuetzen: { name: 'Schützenreihe',    hint: 'Sie schießen aus der Ferne – geh nah heran.', fits: id => unitOf(id).range >= 4 && !unitOf(id).air },
  sturm:     { name: 'Sturmangriff',     hint: 'Schnell und über beide Brücken.', both: true, fits: id => unitOf(id).speed >= 1.8 && !unitOf(id).air },
  kolosse:   { name: 'Kolosse',          hint: 'Zäh und langsam – brauchen viel Schaden.', fits: id => unitOf(id).hp >= 1500 },
  zange:     { name: 'Zangenangriff',    hint: 'Über beide Brücken zugleich.', both: true, fits: () => true },
};
// ---- Bosse: je Etappe eine Art; gewählt wird die passende Karte mit dem meisten Leben ---------------------------
export const BOSS_KINDS = [
  { id: 'koloss',    name: 'Der Koloss',         text: 'Hält enorm viel aus.', fits: d => !d.air && d.hp >= 1500 },
  { id: 'brut',      name: 'Die Brutmutter',     text: 'Ruft doppelt so oft Verstärkung.', fits: d => !!d.spawn, fast: true },
  { id: 'sturm',     name: 'Der Sturmbrecher',   text: 'Schnell – und rasend, sobald er angeschlagen ist.', fits: d => d.speed >= 1.8 && !d.air && d.hp >= 600 },
  { id: 'schatten',  name: 'Der Himmelsschatten', text: 'Fliegt: Nur Fernkämpfer und Türme erreichen ihn.', fits: d => !!d.air },
  { id: 'belagerer', name: 'Der Belagerer',      text: 'Geht geradewegs auf deine Türme los.', fits: d => d.targets === 'buildings' },
];
export const ELITES = {
  gepanzert: { name: 'Gepanzert', text: 'trägt einen Schild' },
  rasend:    { name: 'Rasend',    text: 'läuft und schlägt schneller' },
  zaeh:      { name: 'Zäh',       text: 'hat mehr als doppeltes Leben' },
  brut:      { name: 'Brütend',   text: 'zerfällt beim Tod in drei Kiesel' },
};
export const QUESTS = {
  makellos: { name: 'Makellos',  text: n => `Überstehe ${n} Wellen dieser Etappe ohne Turmschaden` },
  eilig:    { name: 'Eilig',     text: n => `Räume ${n} Wellen dieser Etappe in unter 14 Sekunden` },
  jaeger:   { name: 'Jagdfieber', text: n => `Besiege ${n} Gegner in dieser Etappe` },
};

// ---- Segen -------------------------------------------------------------------------------------------------------
// rar: 0 gewöhnlich, 1 selten, 2 episch · max: wie oft er im Lauf gewählt werden kann (0 = beliebig)
// ok(g, u): wird er gerade angeboten? · on(g, u, o): Wirkung beim Wählen (o = das Angebot, bei „Drill“ mit Karte)
const mine = g => g.ents.filter(e => e.kind === 'tower' && e.side === 0 && e.hp > 0);
const deckOf = g => { const S = g.sides[0]; return [...new Set([...S.hand, S.next, ...S.queue, ...S.away])].filter(id => CARDS[id]); };
const lift = (g, ids, k) => { const S = g.sides[0]; for (const id of ids) S.levels[id] = (S.levels[id] || STD_LEVEL) + k; };
export const BOONS = {
  kraftfluss:   { name: 'Kraftfluss',   rar: 0, max: 5, text: 'Deine Kraft fließt 10 % schneller.', on: g => { g.sides[0].kraftMult += 0.1; } },
  mauerwerk:    { name: 'Mauerwerk',    rar: 0, max: 0, text: 'Alle deine Türme heilen 30 % ihres Lebens.', ok: g => mine(g).some(t => t.hp < t.maxHp * 0.9), on: g => { for (const t of mine(g)) heal(g, t, 0.3); } },
  bollwerk:     { name: 'Bollwerk',     rar: 0, max: 4, text: 'Deine Türme bekommen 15 % mehr Leben.', on: g => { for (const t of mine(g)) { const d = Math.round(t.maxHp * 0.15); t.maxHp += d; t.hp += d; } } },
  drill:        { name: 'Drill',        rar: 0, max: 0, text: (g, u, o) => `${CARDS[o.card].name} steigt für diesen Lauf um eine Stufe.`, on: (g, u, o) => lift(g, [o.card], 1) },
  eilmarsch:    { name: 'Eilmarsch',    rar: 0, max: 3, text: 'Deine Truppen laufen 8 % schneller.', on: g => { g.sides[0].speedMult += 0.08; } },
  vorrat:       { name: 'Vorrat',       rar: 0, max: 3, text: 'Sofort 4 Kraft – und jede Welle beginnt mit 1 Kraft extra.', on: (g, u) => { addKraft(g, 4); u.waveKraft += 1; } },
  turmschuetzen:{ name: 'Turmschützen', rar: 0, max: 3, text: 'Deine Türme schießen 12 % schneller.', on: g => { for (const t of mine(g)) t.atk *= 0.88; } },
  turmstaerke:  { name: 'Turmstärke',   rar: 0, max: 3, text: 'Deine Türme treffen 20 % härter.', on: g => { for (const t of mine(g)) t.dmg = Math.round(t.dmg * 1.2); } },
  schulung:     { name: 'Schulung',     rar: 1, max: 3, text: 'Alle deine Karten steigen für diesen Lauf um eine Stufe.', on: g => lift(g, deckOf(g), 1) },
  wachposten:   { name: 'Wachposten',   rar: 1, max: 2, text: (g, u) => (u.boons.wachposten ? 'Die Wurzelwichte am Hauptturm kommen alle 11 statt 18 Sekunden.' : 'Alle 18 Sekunden erscheinen zwei Wurzelwichte an deinem Hauptturm.'), ok: () => !!UNITS.wicht,
                  on: (g, u) => { const S = g.sides[0]; S.passive = { unit: 'wicht', count: 2, every: u.boons.wachposten ? 11 : 18 }; S.passiveT = Math.min(S.passiveT || 99, 3); } },
  runenmacht:   { name: 'Runenmacht',   rar: 1, max: 1, text: 'Deine Runenkarten erscheinen jedes Mal in Runenform.', ok: g => g.sides[0].runes.size > 0 && !g.sides[0].runeAlways, on: g => { g.sides[0].runeAlways = true; } },
  blitzwacht:   { name: 'Blitzwacht',   rar: 1, max: 2, text: (g, u) => (u.boons.blitzwacht ? 'Der Blitz zu Wellenbeginn trifft fünf statt drei Gegner.' : 'Zu Beginn jeder Welle trifft ein Blitz die drei zähesten Gegner.'), on: () => {} },
  frostfalle:   { name: 'Frostfalle',   rar: 1, max: 1, text: 'Alle Gegner erscheinen fünf Sekunden lang verlangsamt.', on: () => {} },
  letztewehr:   { name: 'Letzte Wehr',  rar: 1, max: 1, text: 'Fällt dein Hauptturm unter ein Drittel, heilt er einmal 40 % und betäubt alle Gegner drei Sekunden.', on: () => {} },
  beutezug:     { name: 'Beutezug',     rar: 1, max: 2, text: 'Jeder besiegte Gegner bringt etwas Kraft.', on: () => {} },
  wiederaufbau: { name: 'Wiederaufbau', rar: 1, max: 0, text: 'Ein gefallener Außenturm steht mit halbem Leben wieder auf.', ok: (g, u) => fallen(g, u).length > 0,
                  on: (g, u) => { const t = fallen(g, u)[0]; if (!t) return; const e = spawnUnit(g, t.type, 0, t.x, t.y, t.lvl, { lane: t.lane }); e.hp = Math.round(e.maxHp * 0.5); emit(g, { t: 'heal', x: e.x, y: e.y }); } },
  meisterschaft:{ name: 'Meisterschaft', rar: 2, max: 1, text: 'Alle deine Karten steigen für diesen Lauf um zwei Stufen.', on: g => lift(g, deckOf(g), 2) },
  doppelkraft:  { name: 'Kraftquelle',  rar: 2, max: 2, text: 'Deine Kraft fließt 25 % schneller.', on: g => { g.sides[0].kraftMult += 0.25; } },
  schutzbann:   { name: 'Schutzbann',   rar: 2, max: 1, text: 'Jede deiner Truppen erscheint mit einem Schild in Höhe eines Viertels ihres Lebens.', on: () => {} },
  verstaerkung: { name: 'Verstärkung',  rar: 2, max: 1, text: 'Zu Beginn jeder Welle erscheint eine Truppe deines Decks kostenlos am Hauptturm.', on: () => {} },
};
export const RAR_NAME = ['Gewöhnlich', 'Selten', 'Episch'];
export const PACT = { id: 'pakt', name: 'Dunkler Pakt', rar: 3, text: 'Alle Gegner steigen eine Stufe. Dafür wählst du gleich zwei Segen und bekommst 25 % mehr Punkte.' };
export const boonText = (g, o) => { const b = o.id === 'pakt' ? PACT : BOONS[o.id]; return typeof b.text === 'function' ? b.text(g, g.waves.u, o) : b.text; };
export const boonName = o => (o.id === 'pakt' ? PACT.name : BOONS[o.id].name);

// ---- Hilfen --------------------------------------------------------------------------------------------------------
const rnd = u => ((u.seed = (Math.imul(u.seed, 1664525) + 1013904223) >>> 0) / 4294967296);   // eigener Zufall: Wellen und Angebote hängen nur vom Keim ab
const emit = (g, e) => { if (g.events.length < 400) g.events.push(e); };
const addKraft = (g, n) => { const S = g.sides[0]; S.kraft = Math.min(MAX_KRAFT, S.kraft + n); };
const heal = (g, t, share) => { if (t.hp <= 0) return; t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * share)); emit(g, { t: 'heal', x: t.x, y: t.y }); };
const fallen = (g, u) => u.outer.filter(t => !g.ents.some(e => e.kind === 'tower' && e.side === 0 && e.lane === t.lane && e.hp > 0));
const towerHp = g => { let s = 0; for (const e of g.ents) if (e.kind === 'tower' && e.side === 0) s += e.hp; return s; };
const score = (u, pts) => { const n = Math.round(pts * u.mult); u.score += n; return n; };
const foesLeft = g => g.ents.some(e => e.side === 1 && e.kind !== 'tower' && e.hp > 0);

// ---- Aufbau eines Laufs -------------------------------------------------------------------------------------------
// waves: { pool, lvl, endless, goal } aus progress.modeRules · seed: Zufallskeim · danger: 0 bis 5 · daily: Tagesherausforderung (Kennzeichen)
export function setup(waves, { seed = 1, danger = 0, daily = '' } = {}) {
  const cfg = { seed: (seed >>> 0) || 1, danger: clamp(danger | 0, 0, DANGER.length), daily: daily || '' };
  return { ...waves, endless: true, director: (g, dt) => { if (!g.waves.u) init(g, cfg); tick(g, dt); } };
}

function init(g, cfg) {
  const wv = g.waves, S = g.sides[0];
  S.levels = { ...S.levels };   // Segen heben Stufen nur für diesen Lauf: nie den Spielstand anfassen
  const pool = wv.pool.filter(id => CARDS[id] && CARDS[id].type === 'troop' && !CARDS[id].hero);
  const u = wv.u = {
    seed: cfg.seed, danger: cfg.danger, daily: cfg.daily, pool,
    phase: 'pause', t: 5, waveT: 0, time: 0, theme: '', next: '', queue: [], foes: new Map(),
    score: 0, mult: dangerMult(cfg.danger), kills: 0, stats: { fast: 0, flawless: 0, elites: 0, bosses: 0, quests: 0 },
    boons: {}, order: [], choice: null, extra: 0, rerolls: 1, pacts: 0, foeLvl: cfg.danger >= 1 ? 1 : 0, foeSpeed: cfg.danger >= 2 ? 1.1 : 1,
    waveKraft: 0, wehr: false, seen: g.nextId, twr: 0, hurtNow: false, cleared: 0, bolt: 0,
    quest: null, boss: null, outer: [], last: null,
  };
  for (const e of g.ents) if (e.kind === 'tower' && e.side === 0 && !e.main) u.outer.push({ type: e.type, x: e.x, y: e.y, lane: e.lane, lvl: e.lvl });
  if (cfg.danger >= 3) { S.kraft = 2; S.kraftMult *= 0.9; }
  if (cfg.danger >= 5) for (const e of g.ents) if (e.kind === 'tower' && e.side === 0) e.hp = e.maxHp = Math.round(e.maxHp * 0.8);
  const mt = mainTower(g, 0); u.edge = mt ? towerEdge(mt.lvl) : 0;
  u.next = themeFor(u, 1);
  offer(g, false, true);   // Startsegen: der Lauf beginnt mit einer Wahl
}

// ---- Wellen ---------------------------------------------------------------------------------------------------------
const isBoss = n => n % STAGE === 0;
export const TUNE = { base: 4, lin: 0.7, quad: 0.045 };
const floorOf = (g, id) => (g.waves.floor ? g.waves.floor(id) : 0);   // Mindeststufe einer Karte (ihre Startstufe, progress.js) – wie beim Computergegner
const budget = n => TUNE.base + n * TUNE.lin + n * n * TUNE.quad;   // Kraftwert einer Welle: wächst erst gemächlich, dann immer steiler – kein Lauf geht ewig
// Türme wachsen im Vorbild langsamer als Karten: auf niedrigen Stufen sind sie im Verhältnis stärker (Stufe 2: gut ein Viertel).
// Im Überleben tragen die Türme den Lauf – die Wellen gleichen diesen Vorsprung in ganzen Stufen aus (Turmstufe 1: drei, 2–4: zwei, 5–7: eine, ab 8: keine).
export const towerEdge = lvl => Math.max(0, Math.round(Math.log(towerMult(lvl, true) / cardMult(lvl)) / Math.log(1.1)));
export const foeLevel = (g, n) => g.waves.lvl + Math.floor((n - 1) / STAGE) + Math.max(0, Math.floor((n - 17) / 4)) + g.waves.u.foeLvl + (g.waves.u.edge || 0);   // jede Etappe eine Stufe stärker, ab Welle 21 noch schneller
export const waveTime = n => (isBoss(n) ? 42 : 24);   // spätestens dann rückt die nächste Welle nach, auch wenn noch Gegner stehen

function themeFor(u, n) {
  if (isBoss(n)) return 'boss';
  if (n <= 2) return 'gemischt';
  const ids = Object.keys(THEMES).filter(k => k !== u.theme && u.pool.filter(THEMES[k].fits).length >= (k === 'gemischt' || k === 'zange' ? 1 : 2));
  return ids[Math.floor(rnd(u) * ids.length)] || 'gemischt';
}
const unitsOf = id => { const c = CARDS[id]; return c.mix ? c.mix.flatMap(([m, k]) => Array(k).fill(m)) : Array(c.count).fill(c.unit); };

function startWave(g) {
  const wv = g.waves, u = wv.u, n = ++wv.n, stage = Math.ceil(n / STAGE), boss = isBoss(n);
  g.kraftFixed = n >= 20 ? 3 : n >= 10 ? 2 : 1;
  u.phase = 'welle'; u.waveT = 0; u.theme = u.next; u.next = themeFor(u, n + 1);
  u.twr = towerHp(g); u.hurtNow = false; u.bolt = u.boons.blitzwacht ? 2.6 : 0;
  if (u.waveKraft) addKraft(g, u.waveKraft);
  if ((n - 1) % STAGE === 0) newQuest(u, stage);
  let lvl = foeLevel(g, n);
  const T = THEMES[u.theme] || THEMES.gemischt, lanes = T.both || boss ? [0, 1] : [rnd(u) < 0.5 ? 0 : 1];
  const themed = u.pool.filter(T.fits);
  let left = budget(n) * (boss ? (stage === 1 ? 0.4 : 0.55) : 1), k = 0, at = 0;   // Begleiter des Bosses; der erste Boss kommt mit kleinem Gefolge
  const groups = [];
  for (let tries = 0; left >= 1 && tries < 60 && groups.length < 16; tries++) {
    const from = themed.length && rnd(u) < 0.78 ? themed : u.pool, id = from[Math.floor(rnd(u) * from.length)], c = CARDS[id];
    if (c.cost > left + 0.5 && tries < 50) continue;
    left -= c.cost;
    groups.push({ id, lane: lanes[k++ % lanes.length], at });
    at += 0.7 + rnd(u) * 0.6;
  }
  if (left > 5) lvl += Math.floor(left / 8);   // mehr Trupps passen nicht aufs Feld: was an Stärke übrig ist, wird zu höheren Stufen
  // Elite: der zäheste Trupp der Welle bekommt eine Eigenschaft
  let elite = '';
  const eliteN = boss ? 0 : (u.danger >= 4 && n >= 2) || (n >= 4 && rnd(u) < Math.min(0.9, 0.3 + n * 0.03)) ? 1 + (n >= 15 ? 1 : 0) + (n >= 25 ? 1 : 0) : 0;
  const tough = [...groups].sort((a, b) => unitOf(b.id).hp - unitOf(a.id).hp);
  for (let i = 0; i < eliteN && i < tough.length; i++) { const ks = Object.keys(ELITES).filter(e => e !== 'brut' || UNITS.kiesel); tough[i].elite = ks[Math.floor(rnd(u) * ks.length)]; elite = elite || tough[i].elite; }
  for (const gr of groups) {
    const x = BRIDGES[gr.lane] + (rnd(u) - 0.5) * 3, y = 4 + rnd(u) * 5, c = CARDS[gr.id], us = unitsOf(gr.id), pts = Math.max(2, Math.round(8 * c.cost / us.length));
    formation(us.length, 0.5, 1).forEach(([dx, dy], i) => u.queue.push({ at: gr.at, unit: us[i], x: clamp(x + dx, 0.4, W - 0.4), y: clamp(y + dy, 0.4, RIVER_TOP - 0.5), lvl: Math.max(lvl, floorOf(g, gr.id)), pts, elite: i === 0 ? gr.elite || '' : '', card: i === 0 ? gr.id : '' }));
  }
  let bossName = '';
  if (boss) {
    const kind = BOSS_KINDS[(stage - 1) % BOSS_KINDS.length], single = u.pool.filter(id => unitsOf(id).length === 1);
    const cands = single.filter(id => kind.fits(unitOf(id)));
    const id = (cands.length ? cands : single.length ? single : u.pool).reduce((a, b) => (unitOf(b).hp > unitOf(a).hp ? b : a));
    u.queue.push({ at: 1.2, unit: unitsOf(id)[0], x: BRIDGES[n / STAGE % 2 | 0], y: 5, lvl: Math.max(lvl, floorOf(g, id)) + 1, pts: 150 * stage, boss: { kind: kind.id, name: kind.name, stage, card: id }, card: id });
    bossName = kind.name;
  }
  u.queue.sort((a, b) => a.at - b.at);
  emit(g, { t: 'wave', n, boss, lvl, theme: u.theme, name: boss ? bossName : T.name, hint: boss ? BOSS_KINDS[(stage - 1) % BOSS_KINDS.length].text : T.hint, elite });
  if (u.boons.verstaerkung) reinforce(g, u);
}

function reinforce(g, u) {   // Segen „Verstärkung“: eine Truppe des Decks kostenlos am Hauptturm
  const S = g.sides[0], ids = deckOf(g).filter(id => CARDS[id].type === 'troop' && !CARDS[id].hero && !CARDS[id].anywhere), mt = mainTower(g, 0);
  if (!ids.length || !mt || mt.hp <= 0) return;
  const id = ids[Math.floor(rnd(u) * ids.length)], us = unitsOf(id), x = mt.x + (rnd(u) < 0.5 ? -3 : 3);
  formation(us.length, 0.5, 0).forEach(([dx, dy], i) => spawnUnit(g, us[i], 0, clamp(x + dx, 0.4, W - 0.4), mt.y - 3 + dy, S.levels[id] || STD_LEVEL, { deployT: 1 }));
  emit(g, { t: 'deploy', side: 0, x, y: mt.y - 3, card: id });
}

function release(g, u, q) {   // ein Gegner betritt das Feld
  const d = UNITS[q.unit], extra = { deployT: 1 };
  const e = spawnUnit(g, q.unit, 1, q.x, q.y, q.lvl, extra);
  if (u.foeSpeed !== 1) e.speed *= u.foeSpeed;
  if (u.boons.frostfalle) e.slowT = 5;
  const meta = { pts: q.pts, elite: q.elite || '', boss: !!q.boss, x: e.x, y: e.y, lvl: q.lvl };
  if (q.elite) {
    e.blessed = true; e.elite = q.elite; meta.pts += 40;
    if (q.elite === 'gepanzert') e.shield = e.maxShield = Math.round(e.maxHp * 0.6);
    else if (q.elite === 'rasend') { e.speed *= 1.35; e.atk *= 0.75; }
    else if (q.elite === 'zaeh') e.hp = e.maxHp = Math.round(e.maxHp * 2.2);
  }
  if (q.boss) {
    const s = q.boss.stage;
    e.hero = true; e.boss = true; e.hp = e.maxHp = Math.round(e.maxHp * (1.8 + 0.35 * s)); e.dmg = Math.round(e.dmg * (1.1 + 0.05 * s));
    u.boss = { id: e.id, ...q.boss, callT: q.boss.kind === 'brut' ? 4 : 8, calls: 0, rage: false, maxHp: e.maxHp, hp: e.hp };
  }
  u.foes.set(e.id, meta);
  if (q.card) emit(g, { t: 'deploy', side: 1, x: q.x, y: q.y, card: q.card, hero: !!q.boss });
  return d && e;
}

function newQuest(u, stage) {
  const ids = Object.keys(QUESTS), id = ids[Math.floor(rnd(u) * ids.length)], need = id === 'jaeger' ? 10 + stage * 4 : 2;
  u.quest = { id, need, have: 0, done: false, stage };
}
function questAdd(g, u, id, n = 1) {
  const q = u.quest;
  if (!q || q.done || q.id !== id) return;
  q.have = Math.min(q.need, q.have + n);
  if (q.have < q.need) return;
  q.done = true; u.stats.quests++;
  const pts = score(u, 100 * q.stage);
  for (const t of mine(g)) heal(g, t, 0.12);
  emit(g, { t: 'surv', k: 'auftrag', name: QUESTS[q.id].name, pts });
}

function endWave(g, u, cleared) {
  const n = g.waves.n;
  if (cleared) {
    const fast = u.waveT < 14, flawless = !u.hurtNow;
    const pts = score(u, (20 + 5 * n) * (fast ? 1.5 : 1) + (flawless ? 30 : 0));
    u.cleared++; if (fast) { u.stats.fast++; questAdd(g, u, 'eilig'); } if (flawless) { u.stats.flawless++; questAdd(g, u, 'makellos'); }
    emit(g, { t: 'surv', k: 'clear', n, pts, fast, flawless });
  }
  u.phase = 'pause'; u.t = cleared ? 3.5 : 0.4;
  if (n % 2 === 0 || isBoss(n)) offer(g, isBoss(n));
}

// ---- Segen anbieten und wählen ---------------------------------------------------------------------------------------
function offer(g, big, first = false) {
  const u = g.waves.u, opts = [];
  const can = id => { const b = BOONS[id]; return (!b.max || (u.boons[id] || 0) < b.max) && (!b.ok || b.ok(g, u)) && !opts.some(o => o.id === id); };
  const weights = big ? [30, 50, 20] : [70, 26, 4];
  for (let tries = 0; opts.length < 3 && tries < 60; tries++) {
    let x = rnd(u) * 100, rar = 0;
    while (rar < 2 && x >= weights[rar]) x -= weights[rar++];
    let ids = Object.keys(BOONS).filter(id => BOONS[id].rar === rar && can(id));
    if (!ids.length) ids = Object.keys(BOONS).filter(can);
    if (!ids.length) break;
    if (ids.includes('mauerwerk') && mine(g).some(t => t.hp < t.maxHp * 0.5) && rnd(u) < 0.5) ids = ['mauerwerk'];   // angeschlagen: Heilung kommt öfter
    const id = ids[Math.floor(rnd(u) * ids.length)], o = { id };
    if (id === 'drill') { const d = deckOf(g); o.card = d[Math.floor(rnd(u) * d.length)]; }
    opts.push(o);
  }
  if (big && !u.extra) opts.push({ id: 'pakt' });
  u.choice = { big, first, options: opts };
  emit(g, { t: 'boon', big, first, n: g.waves.n });
}

// Angebot k wählen. Gibt das gewählte Angebot zurück (oder null).
export function pick(g, k) {
  const u = g.waves && g.waves.u, ch = u && u.choice, o = ch && ch.options[k];
  if (!o) return null;
  u.choice = null;
  if (o.id === 'pakt') {
    u.pacts++; u.foeLvl++; u.mult += 0.25; u.extra = 2;
  } else {
    BOONS[o.id].on(g, u, o);
    u.boons[o.id] = (u.boons[o.id] || 0) + 1; u.order.push(o.id);
  }
  emit(g, { t: 'surv', k: 'segen', id: o.id });
  if (u.extra > 0) { u.extra--; offer(g, true); if (u.choice) u.choice.options = u.choice.options.filter(x => x.id !== 'pakt'); }
  return o;
}
// Einmal je Lauf: drei neue Angebote
export function reroll(g) {
  const u = g.waves && g.waves.u;
  if (!u || !u.choice || u.rerolls < 1) return false;
  u.rerolls--;
  const { big, first } = u.choice, pact = u.choice.options.some(o => o.id === 'pakt');
  offer(g, big, first);
  if (!pact) u.choice.options = u.choice.options.filter(o => o.id !== 'pakt');
  return true;
}
// Der Computer wählt (Messskript, Zeitraffer): erst was den ganzen Lauf trägt, Heilung nur wenn nötig
const WANT = { meisterschaft: 10, schulung: 9, doppelkraft: 9, schutzbann: 8, verstaerkung: 8, kraftfluss: 7, wiederaufbau: 9.5, wachposten: 6.5, blitzwacht: 6, letztewehr: 5.5, drill: 5, bollwerk: 4.5, turmstaerke: 4.5, turmschuetzen: 4.5, beutezug: 4.5, runenmacht: 6, frostfalle: 4, vorrat: 3.5, eilmarsch: 2, mauerwerk: 1, pakt: 0 };
export function autoPick(g) {
  const u = g.waves && g.waves.u; if (!u || !u.choice) return null;
  const hurtTowers = mine(g).some(t => t.hp < t.maxHp * 0.55);
  let best = 0, bv = -1;
  u.choice.options.forEach((o, i) => { const v = o.id === 'mauerwerk' && hurtTowers ? 8.5 : WANT[o.id] ?? 3; if (v > bv) { bv = v; best = i; } });
  return pick(g, best);
}

// ---- Takt ---------------------------------------------------------------------------------------------------------------
function tick(g, dt) {
  const u = g.waves.u, S = g.sides[0];
  u.time += dt;
  // neue eigene Truppen: Schutzbann
  if (u.boons.schutzbann) for (const e of g.ents) if (e.id >= u.seen && e.side === 0 && e.kind === 'unit' && !e.maxShield) e.shield = e.maxShield = Math.round(e.maxHp * 0.25);
  u.seen = g.nextId;
  // gefallene Gegner: Punkte, Beute, Brut der Elite
  for (const [id, m] of u.foes) {
    const e = g.byId.get(id);
    if (e && e.hp > 0) { m.x = e.x; m.y = e.y; continue; }
    u.foes.delete(id);
    u.kills++; score(u, m.pts); questAdd(g, u, 'jaeger');
    if (u.boons.beutezug) addKraft(g, 0.12 * u.boons.beutezug);
    if (m.elite) { u.stats.elites++; emit(g, { t: 'surv', k: 'elite', x: m.x, y: m.y }); }
    if (m.elite === 'brut') for (let i = 0; i < 3; i++) spawnUnit(g, 'kiesel', 1, clamp(m.x + (i - 1) * 0.6, 0.4, W - 0.4), m.y, m.lvl, { deployT: 0.5 });
    if (m.boss) { u.stats.bosses++; u.boss = null; emit(g, { t: 'surv', k: 'boss', x: m.x, y: m.y, pts: Math.round(m.pts * u.mult) }); }
  }
  // Gegner der laufenden Welle rücken nach und nach an
  while (u.queue.length && u.phase === 'welle' && u.queue[0].at <= u.waveT) release(g, u, u.queue.shift());
  // Boss: ruft Verstärkung und gerät bei halbem Leben in Raserei
  if (u.boss) {
    const b = u.boss, e = g.byId.get(b.id);
    if (e && e.hp > 0) {
      b.hp = e.hp; b.maxHp = e.maxHp;
      if (!b.rage && e.hp <= e.maxHp * 0.5) { b.rage = true; e.hasteT = 1e6; emit(g, { t: 'surv', k: 'zorn', x: e.x, y: e.y, name: b.name }); }
      b.callT -= dt;
      if (b.callT <= 0 && b.calls < 6 && e.deployT <= 0) {
        b.callT = b.kind === 'brut' ? 4.5 : 9; b.calls++;
        const small = u.pool.filter(id => CARDS[id].cost <= 3), id = (small.length ? small : u.pool)[Math.floor(rnd(u) * (small.length || u.pool.length))], us = unitsOf(id).slice(0, 3);
        us.forEach((unit, i) => { const k = spawnUnit(g, unit, 1, clamp(e.x + (i - 1) * 0.8, 0.4, W - 0.4), clamp(e.y - 1.2, 0.4, 31.5), e.lvl - 1 || 1, { deployT: 0.6 }); u.foes.set(k.id, { pts: 2, elite: '', boss: false, x: k.x, y: k.y, lvl: k.lvl }); });
        emit(g, { t: 'surv', k: 'ruf', x: e.x, y: e.y });
      }
    }
  }
  // Blitzwacht: kurz nach Wellenbeginn trifft ein Blitz die zähesten Gegner
  if (u.bolt > 0 && u.phase === 'welle' && (u.bolt -= dt) <= 0) {
    const top = g.ents.filter(e => e.side === 1 && e.kind === 'unit' && e.hp > 0 && !e.hidden).sort((a, b) => b.hp - a.hp).slice(0, u.boons.blitzwacht > 1 ? 5 : 3);
    if (top.length) {
      emit(g, { t: 'bolts', x: top[0].x, y: top[0].y, hits: top.map(e => ({ x: e.x, y: e.y, air: e.air })) });
      const dmg = Math.round(380 * cardMult(foeLevel(g, g.waves.n)));
      for (const e of top) hurt(g, e, e.boss ? Math.round(dmg * 0.5) : dmg, 0);
    }
  }
  // Letzte Wehr
  if (u.boons.letztewehr && !u.wehr) {
    const mt = mainTower(g, 0);
    if (mt && mt.hp > 0 && mt.hp < mt.maxHp / 3) {
      u.wehr = true; heal(g, mt, 0.4);
      for (const e of g.ents) if (e.side === 1 && e.kind === 'unit' && e.hp > 0) { e.stunT = Math.max(e.stunT, 3); e.inRange = false; }
      emit(g, { t: 'burst', x: mt.x, y: mt.y, r: 7, side: 0, big: true }); emit(g, { t: 'surv', k: 'wehr' });
    }
  }
  if (g.over) return;
  if (u.phase === 'welle') {
    u.waveT += dt;
    if (towerHp(g) < u.twr - 0.5) u.hurtNow = true;
    u.twr = towerHp(g);
    if (!u.queue.length && !foesLeft(g) && u.waveT > 1.5) endWave(g, u, true);
    else if (u.waveT >= waveTime(g.waves.n) && !u.queue.length) endWave(g, u, false);
  } else if (!u.choice) {
    u.t -= dt;
    if (u.t <= 0) startWave(g);
  }
  void S;
}

// ---- Anzeige und Abrechnung -----------------------------------------------------------------------------------------
export function hud(g) {
  const wv = g.waves, u = wv && wv.u;
  if (!u) return null;
  const T = THEMES[u.theme], N = THEMES[u.next], q = u.quest, nextBoss = u.next === 'boss';
  return {
    wave: wv.n, stage: Math.max(1, Math.ceil(wv.n / STAGE)), phase: u.phase, choice: !!u.choice, lvl: wv.n ? foeLevel(g, wv.n) : wv.lvl + u.foeLvl + (u.edge || 0),
    theme: u.theme === 'boss' ? (u.boss ? u.boss.name : 'Bosswelle') : T ? T.name : '', next: nextBoss ? 'Bosswelle' : N ? N.name : '', nextHint: nextBoss ? 'Am Ende der Etappe wartet ein Boss.' : N ? N.hint : '', nextIn: u.phase === 'pause' && !u.choice ? Math.max(0, u.t) : Math.max(0, waveTime(wv.n) - u.waveT),
    left: [...u.foes.keys()].length + u.queue.length, score: u.score, mult: u.mult, kills: u.kills, danger: u.danger, daily: u.daily,
    boons: Object.entries(u.boons).map(([id, n]) => ({ id, n, name: BOONS[id].name })), rerolls: u.rerolls,
    quest: q ? { name: QUESTS[q.id].name, text: QUESTS[q.id].text(q.need), have: q.have, need: q.need, done: q.done } : null,
    boss: u.boss ? { name: u.boss.name, hp: u.boss.hp, maxHp: u.boss.maxHp, rage: u.boss.rage } : null,
  };
}
export function summary(g) {
  const wv = g.waves, u = wv && wv.u;
  if (!u) return null;
  return { wave: wv.n, score: u.score, kills: u.kills, danger: u.danger, daily: u.daily, mult: u.mult, time: Math.round(g.time), boons: [...u.order], pacts: u.pacts, ...u.stats };
}

// ---- Spielstand: Bestenliste der eigenen Läufe, Gefahrenstufen, Tagesherausforderung --------------------------------
// Diese Felder liegen neben best/got/runs in profile.surv. Belohnungen schreibt der Aufrufer mit seiner Funktion gut (grant).
const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
export function survLoad(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const run = x => (x && typeof x === 'object' ? { score: num(x.score), wave: num(x.wave), danger: clamp(num(x.danger), 0, DANGER.length), when: num(x.when), daily: typeof x.daily === 'string' ? x.daily.slice(0, 10) : '' } : null);
  const d = r.daily && typeof r.daily === 'object' ? r.daily : {};
  return {
    top: (Array.isArray(r.top) ? r.top : []).map(run).filter(Boolean).slice(0, TOP_RUNS),
    high: num(r.high), danger: clamp(num(r.danger), 0, DANGER.length), dgot: (Array.isArray(r.dgot) ? r.dgot : []).filter(n => Number.isInteger(n) && n >= 1 && n <= DANGER.length),
    pick: clamp(num(r.pick), 0, DANGER.length),
    daily: { day: typeof d.day === 'string' ? d.day.slice(0, 10) : '', score: num(d.score), wave: num(d.wave), tries: num(d.tries), got: !!d.got },
  };
}
// Höchste wählbare Gefahrenstufe: eine mehr als die höchste, auf der Welle 10 erreicht wurde
export const dangerOpen = p => Math.min(DANGER.length, (p.surv.danger || 0) + 1);
// Tagesherausforderung: Keim, Gefahrenstufe und Startsegen folgen aus dem Datum
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export function dailyConfig(day) {
  const h = hash('ueberleben' + day);
  return { day, seed: h || 1, danger: 1 + (h % 3), name: DANGER.slice(0, 1 + (h % 3)).map(d => d.name).join(' · ') };
}
export function dailyInfo(p, day) {
  const s = p.surv, d = s.daily && s.daily.day === day ? s.daily : { day, score: 0, wave: 0, tries: 0, got: false };
  return { ...dailyConfig(day), score: d.score, wave: d.wave, tries: d.tries, got: d.got, can: d.wave >= DAILY_GOAL && !d.got };
}
export const DAILY_REWARD = { t: 'lucky', s: 3 };
// Belohnung je Gefahrenstufe: einmalig, sobald auf ihr Welle 10 erreicht ist
export const DANGER_REWARD = [{ t: 'gold', crate: 4 }, { t: 'lucky', s: 2 }, { t: 'gems', n: 15 }, { t: 'lucky', s: 4 }, { t: 'hero', n: 30 }];
export const dangerClaims = p => DANGER_REWARD.map((r, i) => ({ level: i + 1, reward: r, reached: (p.surv.danger || 0) >= i + 1, got: (p.surv.dgot || []).includes(i + 1) }));

// Einen Lauf verbuchen (sum = summary(g), when = Zeitstempel, day = heutiges Datum). Gibt zurück, was neu ist.
export function bookRun(p, sum, when, day) {
  const s = p.surv, out = { place: 0, high: false, dangerUp: 0, daily: null };
  if (!sum) return out;
  for (const [k, v] of Object.entries(survLoad(s))) if (s[k] === undefined) s[k] = v;   // älterer Spielstand
  const run = { score: num(sum.score), wave: num(sum.wave), danger: num(sum.danger), when: num(when), daily: sum.daily || '' };
  if (run.score > s.high) { s.high = run.score; out.high = true; }
  s.top.push(run); s.top.sort((a, b) => b.score - a.score || b.wave - a.wave); s.top.length = Math.min(s.top.length, TOP_RUNS);
  out.place = s.top.indexOf(run) + 1;
  if (!run.daily && run.wave >= DAILY_GOAL && run.danger >= 1 && run.danger > s.danger) { s.danger = run.danger; out.dangerUp = run.danger; }
  if (run.daily && run.daily === day) {
    if (s.daily.day !== day) s.daily = { day, score: 0, wave: 0, tries: 0, got: false };
    s.daily.tries++; const better = run.score > s.daily.score;
    s.daily.score = Math.max(s.daily.score, run.score); s.daily.wave = Math.max(s.daily.wave, run.wave);
    out.daily = { better, score: s.daily.score, wave: s.daily.wave, can: s.daily.wave >= DAILY_GOAL && !s.daily.got };
  }
  return out;
}
export function claimDaily(p, day, grant) {
  const s = p.surv;
  if (!s.daily || s.daily.day !== day || s.daily.got || s.daily.wave < DAILY_GOAL) return null;
  s.daily.got = true;
  return grant(p, DAILY_REWARD);
}
export function claimDanger(p, level, grant) {
  const s = p.surv, r = DANGER_REWARD[level - 1];
  if (!r || (s.danger || 0) < level || (s.dgot || []).includes(level)) return null;
  (s.dgot = s.dgot || []).push(level);
  return grant(p, r);
}
