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
import { CARDS, UNITS, RUNES } from './cards.js';
import { W, RIVER_TOP, BRIDGES, OUTER_Y, MAIN_Y, MAX_KRAFT, STD_LEVEL, cardMult, towerMult, spawnUnit, hurt, formation, mainTower } from './sim.js';

export const STAGE = 5;        // Wellen je Etappe; die letzte ist die Bosswelle
// Die Risse: Seit dem 2026-11-14 hat die Wellenseite keine Türme mehr. Die Gegner steigen aus drei Rissen am oberen Feldrand –
// linke Bahn, rechte Bahn, in der Mitte der Boss. Sie liegen genau auf den Sockeln, auf denen sonst die gegnerischen Türme stehen.
// [x, y] in Feldmaßen; der Zeichner malt sie an dieselben Stellen (render3d.js).
export const RIFTS = [[BRIDGES[0], OUTER_Y], [BRIDGES[1], OUTER_Y], [W / 2, MAIN_Y]];
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
export const boonText = (g, o) => { if (o.id === 'kk') return `${CARDS[o.card].name}: ${POWERS[o.power].text}.`; const b = o.id === 'pakt' ? PACT : BOONS[o.id]; return typeof b.text === 'function' ? b.text(g, g.waves.u, o) : b.text; };
export const boonName = o => (o.id === 'kk' ? `${POWERS[o.power].name} · ${CARDS[o.card].name}` : o.id === 'pakt' ? PACT.name : BOONS[o.id].name);
export const boonRar = o => (o.id === 'kk' ? POWERS[o.power].rar : o.id === 'pakt' ? 3 : BOONS[o.id].rar);

// ---- Hilfen --------------------------------------------------------------------------------------------------------
const rnd = u => ((u.seed = (Math.imul(u.seed, 1664525) + 1013904223) >>> 0) / 4294967296);   // eigener Zufall: Wellen und Angebote hängen nur vom Keim ab
const emit = (g, e) => { if (g.events.length < 400) g.events.push(e); };
const addKraft = (g, n) => { const S = g.sides[0]; S.kraft = Math.min(MAX_KRAFT, S.kraft + n); };
const heal = (g, t, share) => { if (t.hp <= 0) return; t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * share)); emit(g, { t: 'heal', x: t.x, y: t.y }); };
const fallen = (g, u) => u.outer.filter(t => !g.ents.some(e => e.kind === 'tower' && e.side === 0 && e.lane === t.lane && e.hp > 0));
const towerHp = g => { let s = 0; for (const e of g.ents) if (e.kind === 'tower' && e.side === 0) s += e.hp; return s; };
const score = (u, pts) => { const n = Math.round(pts * u.mult); u.score += n; return n; };
const foesLeft = g => g.ents.some(e => e.side === 1 && e.kind !== 'tower' && e.hp > 0);


// ---- Kartenkräfte ----------------------------------------------------------------------------------------------------
// Wie die Modifikatoren im Chaos-Modus des Vorbilds (Wiki „C.H.A.O.S.“): nach jedem Boss die Wahl zwischen zweien, jede gilt für eine
// Karte des Decks und bleibt bis zum Ende des Laufs; eine Karte bekommt höchstens eine. Drei Seltenheiten, die selteneren kommen mit
// jeder Etappe öfter (POWER_ODDS: die Wahrscheinlichkeiten des Vorbilds je Wahl). Die Arten folgen den Verstärkungen des Vorbilds
// (Wiki „Buff“: Rage, Shield Boost, Passive Heal, Initial Spawn, Death Spawn, Death Damage, Stun Attack, Berserk) – dazu Eilschritt
// und Zwilling. Die Einzelliste der 150 Modifikatoren des Vorbilds steht nicht im Wiki; Namen und Zuschnitt sind eigene.
//   fits(c, d): passt die Kraft zu dieser Karte? (c = Karte, d = ihre Einheit) · on(g, u, e): Wirkung auf eine frisch erschienene Einheit
export const POWERS = {
  raserei:   { name: 'Raserei',      rar: 0, text: 'läuft und schlägt dauerhaft 30 % schneller', fits: (c, d) => !d.building && d.dmg > 0, on: (g, u, e) => { e.hasteT = 1e9; e.pwHaste = true; } },
  schild:    { name: 'Schildträger', rar: 0, text: 'erscheint mit einem Schild in Höhe von 30 % ihres Lebens', fits: (c, d) => !d.shield, on: (g, u, e) => { e.shield = e.maxShield = Math.round(e.maxHp * 0.3); } },
  eile:      { name: 'Eilschritt',   rar: 0, text: 'läuft 75 % schneller', fits: (c, d) => !d.building && d.speed > 0 && d.speed < 2.2, on: (g, u, e) => { e.speed *= 1.75; } },
  heil:      { name: 'Heilpuls',     rar: 1, text: 'heilt jede Sekunde 4 % ihres Lebens', fits: (c, d) => d.hp >= 600, on: (g, u, e) => { e.regen = 0.04; } },
  laehm:     { name: 'Lähmschlag',   rar: 1, text: 'jeder Schuss lähmt das Ziel eine halbe Sekunde', fits: (c, d) => d.proj > 0 && !d.stunHit && !d.building, on: (g, u, e) => { e.d = { ...e.d, stunHit: 0.5 }; } },
  gefolge:   { name: 'Gefolge',      rar: 1, text: 'bringt drei Kiesel mit', fits: (c, d) => !d.building && !d.air && c.unit !== 'kiesel', on: (g, u, e, first) => { if (first) for (let i = 0; i < 3; i++) mark(spawnUnit(g, 'kiesel', 0, clamp(e.x + (i - 1) * 0.7, 0.4, W - 0.4), e.y + 0.8, e.lvl, { deployT: e.deployT })); } },
  brut:      { name: 'Totenbrut',    rar: 1, text: 'zerfällt beim Tod in drei Kiesel', fits: (c, d) => !d.deathSpawn && !d.building && c.unit !== 'kiesel' && d.hp >= 300, on: (g, u, e) => { e.d = { ...e.d, deathSpawn: { unit: 'kiesel', count: 3 } }; } },
  bombe:     { name: 'Sterbebombe',  rar: 2, text: 'hinterlässt beim Tod eine Bombe: 230 Schaden im Umkreis von drei Feldern', fits: (c, d) => !d.deathDmg && !d.kamikaze, on: (g, u, e) => { e.d = { ...e.d, deathDmg: { dmg: 230, r: 3, knock: 1.5 } }; } },
  berserker: { name: 'Berserker',    rar: 2, text: 'gerät unter halbem Leben in Raserei: 30 % schneller, 40 % mehr Schaden', fits: (c, d) => !d.building && d.dmg > 0 && d.hp >= 500, on: (g, u, e) => { e.bers = 1; } },
  zwilling:  { name: 'Zwilling',     rar: 2, text: 'erscheint doppelt', fits: (c, d) => !d.building && c.cost <= 6, on: (g, u, e) => { mark(spawnUnit(g, e.type, 0, clamp(e.x + 0.7, 0.4, W - 0.4), e.y, e.lvl, { deployT: e.deployT })); } },
};
// Seltenheit je Wahl (Zeile = die wievielte Wahl des Laufs): gewöhnlich / selten / episch in Prozent – die Tabelle des Vorbilds
export const POWER_ODDS = [[90, 10, 0], [20, 80, 0], [0, 50, 50], [0, 20, 80], [0, 0, 100]];
const mark = e => { e.pw = true; return e; };   // schon behandelt: bekommt keine Kartenkraft mehr (Gefolge, Zwilling)
const cardUnit = id => { const c = CARDS[id]; return c && c.type !== 'spell' && c.type !== 'tower' ? UNITS[c.mix ? c.mix[0][0] : c.unit] : null; };
function offerPower(g) {
  const u = g.waves.u, odds = POWER_ODDS[Math.min(POWER_ODDS.length - 1, u.powerN)], opts = [];
  const cards = deckOf(g).filter(id => cardUnit(id) && !u.powers[id]);
  for (let tries = 0; opts.length < 2 && tries < 80 && cards.length; tries++) {
    let x = rnd(u) * 100, rar = 0;
    while (rar < 2 && x >= odds[rar]) x -= odds[rar++];
    const card = cards[Math.floor(rnd(u) * cards.length)], c = CARDS[card], d = cardUnit(card);
    let ids = Object.keys(POWERS).filter(id => POWERS[id].rar === rar && POWERS[id].fits(c, d));
    if (!ids.length && tries > 40) ids = Object.keys(POWERS).filter(id => POWERS[id].fits(c, d));
    ids = ids.filter(id => !opts.some(o => o.power === id || o.card === card));
    if (!ids.length) continue;
    opts.push({ id: 'kk', power: ids[Math.floor(rnd(u) * ids.length)], card });
  }
  if (!opts.length) return;
  u.powerN++;
  u.choice = { big: true, first: false, kind: 'kraft', options: opts };
  emit(g, { t: 'boon', big: true, first: false, n: g.waves.n, kind: 'kraft' });
}
// Kartenkräfte auf frisch erschienene eigene Einheiten legen; laufende Wirkungen (Heilpuls, Berserker)
function powerTick(g, u, dt) {
  if (u.powerList.length) {
    const firsts = new Set();
    for (const e of g.ents) {
      if (e.id < u.seen || e.side !== 0 || e.kind === 'tower' || e.pw) continue;
      e.pw = true;
      const card = u.cardOf.get(e.type), pw = card && u.powers[card];
      if (!pw) continue;
      POWERS[pw].on(g, u, e, !firsts.has(card));
      firsts.add(card);
    }
  }
  u.pulse = (u.pulse || 0) + dt;
  const beat = u.pulse >= 1;
  if (beat) u.pulse -= 1;
  for (const e of g.ents) {
    if (e.hp <= 0) continue;
    if (beat && e.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * e.regen));
    if (e.bers === 1 && e.hp < e.maxHp / 2) { e.bers = 2; e.hasteT = 1e9; e.dmg = Math.round(e.dmg * 1.4); emit(g, { t: 'surv', k: 'bers', x: e.x, y: e.y }); }
  }
}

// ---- Feldlaunen ---------------------------------------------------------------------------------------------------------
// Wie die Feld-Zauber des Vorbilds (Wiki „Global Spell“): Ab der zweiten Etappe liegt über jeder Etappe eine Laune, die für BEIDE
// Seiten gilt – Raserei (alles 30 % schneller, Kraft fließt ein Drittel schneller), Heilender Boden (alles heilt jede Sekunde),
// Gewitter (alle 15 Sekunden trifft ein Blitz die drei zähesten Truppen auf dem Feld), Schneesturm (alle 12 Sekunden friert alles
// kurz ein). Die Bosswelle gehört noch dazu; mit der nächsten Etappe wechselt die Laune.
export const MOODS = {
  raserei:   { name: 'Raserei',          text: 'Alles läuft und schlägt 30 % schneller – auch die Gegner. Deine Kraft fließt ein Drittel schneller.' },
  heilboden: { name: 'Heilender Boden',  text: 'Alles auf dem Feld heilt jede Sekunde ein wenig – Truppen, Gebäude und Türme beider Seiten.' },
  gewitter:  { name: 'Gewitter',         text: 'Alle 15 Sekunden trifft ein Blitz die drei zähesten Truppen auf dem Feld – gleich, wem sie gehören.' },
  schnee:    { name: 'Schneesturm',      text: 'Alle 12 Sekunden friert ein Kälteeinbruch alle Truppen kurz ein.' },
};
function setMood(g, u, id) {
  const S = g.sides[0];
  if (u.mood === 'raserei') { g.rageAll = false; S.kraftMult -= 0.35; for (const e of g.ents) if (e.moodHaste) { e.moodHaste = false; if (e.bers !== 2 && !e.pwHaste) e.hasteT = 0; } }   // die Raserei endet – außer bei denen, die sie aus eigener Kraft haben
  u.mood = id; u.moodT = id === 'gewitter' ? 15 : id === 'schnee' ? 12 : 1;
  if (id === 'raserei') { g.rageAll = true; S.kraftMult += 0.35; u.seenMood = g.nextId; for (const e of g.ents) { if (e.hasteT > 1e5) e.pwHaste = true; else e.moodHaste = true; e.hasteT = 1e9; } }   // alles, auch die Türme
  if (id) emit(g, { t: 'surv', k: 'laune', id, name: MOODS[id].name, text: MOODS[id].text });
}
function moodTick(g, u, dt) {
  if (!u.mood) return;
  if (u.mood === 'raserei') { for (const e of g.ents) if (e.id >= u.seenMood && !e.pwHaste) e.moodHaste = true; u.seenMood = g.nextId; return; }   // Neue sind durch g.rageAll schon angetrieben: nur vormerken, damit die Raserei am Etappenende endet
  u.moodT -= dt;
  if (u.moodT > 0) return;
  if (u.mood === 'heilboden') {
    u.moodT = 1;
    for (const e of g.ents) if (e.hp > 0 && e.hp < e.maxHp && !e.stub) e.hp = Math.min(e.maxHp, e.hp + Math.round(20 * cardMult(e.lvl) * (e.kind === 'tower' ? 2 : 1)));
  } else if (u.mood === 'gewitter') {
    u.moodT = 15;
    const top = g.ents.filter(e => e.kind === 'unit' && e.hp > 0 && !e.hidden).sort((a, b) => b.hp - a.hp).slice(0, 3);
    if (top.length) {
      emit(g, { t: 'bolts', x: top[0].x, y: top[0].y, hits: top.map(e => ({ x: e.x, y: e.y, air: e.air })) });
      const dmg = Math.round(420 * cardMult(foeLevel(g, Math.max(1, g.waves.n))));
      for (const e of top) hurt(g, e, e.boss ? Math.round(dmg * 0.5) : dmg, 1 - e.side);
    }
  } else if (u.mood === 'schnee') {
    u.moodT = 12;
    for (const e of g.ents) if (e.kind === 'unit' && e.hp > 0) { e.iceT = Math.max(e.iceT || 0, 1.2); e.slowT = Math.max(e.slowT || 0, 3); }
    emit(g, { t: 'burst', x: W / 2, y: 16, r: 9, frost: true, big: true, side: 0 }); emit(g, { t: 'surv', k: 'frost' });
  }
}

// ---- Aufbau eines Laufs -------------------------------------------------------------------------------------------
// waves: { pool, lvl, endless, goal } aus progress.modeRules · seed: Zufallskeim · danger: 0 bis 5 · daily: Tagesherausforderung (Kennzeichen)
export function setup(waves, { seed = 1, danger = 0, daily = '' } = {}) {
  const cfg = { seed: (seed >>> 0) || 1, danger: clamp(danger | 0, 0, DANGER.length), daily: daily || '' };
  return { ...waves, endless: true, rifts: true, director: (g, dt) => { if (!g.waves.u) init(g, cfg); tick(g, dt); } };   // rifts: eigene Arena ohne gegnerische Türme (sim.js)
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
    powers: {}, powerList: [], powerN: 0, powerDue: false, cardOf: new Map(), mood: '', moodT: 0, seenMood: g.nextId, pulse: 0,
  };
  // welche Einheit zu welcher Karte des Decks gehört (für die Kartenkräfte)
  for (const id of deckOf(g)) { const c = CARDS[id]; if (c.type === 'spell') continue; for (const [t] of c.mix || [[c.unit]]) u.cardOf.set(t, id); const R = RUNES[id]; if (R && R.unit) u.cardOf.set(R.unit, id); }
  for (const e of g.ents) if (e.kind === 'tower' && e.side === 0 && !e.main) u.outer.push({ type: e.type, x: e.x, y: e.y, lane: e.lane, lvl: e.lvl });
  if (cfg.danger >= 3) { S.kraft = 2; S.kraftMult *= 0.9; }
  if (cfg.danger >= 5) for (const e of g.ents) if (e.kind === 'tower' && e.side === 0) e.hp = e.maxHp = Math.round(e.maxHp * 0.8);
  const mt = mainTower(g, 0); u.edge = mt ? towerEdge(mt.lvl) : 0;
  u.next = themeFor(u, 1);
  offer(g, false, true);   // Startsegen: der Lauf beginnt mit einer Wahl
}

// ---- Wellen ---------------------------------------------------------------------------------------------------------
const isBoss = n => n % STAGE === 0;
export const TUNE = { base: 5, lin: 1.5, quad: 0.18 };   // seit der Riss-Arena (2026-11-14) deutlich steiler: eigene Truppen halten die Stellung und sammeln sich an
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
  if ((n - 1) % STAGE === 0) { newQuest(u, stage); const ids = Object.keys(MOODS).filter(id => id !== u.mood); setMood(g, u, stage >= 2 ? ids[Math.floor(rnd(u) * ids.length)] : ''); }
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
    const [rx, ry] = RIFTS[gr.lane], x = rx + (rnd(u) - 0.5) * 2.6, y = ry + rnd(u) * 2.4, c = CARDS[gr.id], us = unitsOf(gr.id), pts = Math.max(2, Math.round(8 * c.cost / us.length));
    formation(us.length, 0.5, 1).forEach(([dx, dy], i) => u.queue.push({ at: gr.at, unit: us[i], x: clamp(x + dx, 0.4, W - 0.4), y: clamp(y + dy, 0.4, RIVER_TOP - 0.5), lvl: Math.max(lvl, floorOf(g, gr.id)), pts, elite: i === 0 ? gr.elite || '' : '', card: i === 0 ? gr.id : '' }));
  }
  let bossName = '';
  if (boss) {
    const kind = BOSS_KINDS[(stage - 1) % BOSS_KINDS.length], single = u.pool.filter(id => unitsOf(id).length === 1);
    const cands = single.filter(id => kind.fits(unitOf(id)));
    const id = (cands.length ? cands : single.length ? single : u.pool).reduce((a, b) => (unitOf(b).hp > unitOf(a).hp ? b : a));
    u.queue.push({ at: 1.2, unit: unitsOf(id)[0], x: RIFTS[2][0], y: RIFTS[2][1] + 1.2, lvl: Math.max(lvl, floorOf(g, id)) + 1, pts: 150 * stage, boss: { kind: kind.id, name: kind.name, stage, card: id }, card: id });
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
  if (isBoss(n)) u.powerDue = true;   // nach dem Segen folgt die Kartenkraft
  if (n % 2 === 0 || isBoss(n)) offer(g, isBoss(n));
  if (!u.choice && u.powerDue) { u.powerDue = false; offerPower(g); }
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
  if (o.id === 'kk') {   // Kartenkraft: gilt ab jetzt für jede Einheit dieser Karte
    u.powers[o.card] = o.power; u.powerList.push({ card: o.card, power: o.power });
    emit(g, { t: 'surv', k: 'kraft', card: o.card, power: o.power });
    return o;
  }
  if (o.id === 'pakt') {
    u.pacts++; u.foeLvl++; u.mult += 0.25; u.extra = 2;
  } else {
    BOONS[o.id].on(g, u, o);
    u.boons[o.id] = (u.boons[o.id] || 0) + 1; u.order.push(o.id);
  }
  emit(g, { t: 'surv', k: 'segen', id: o.id });
  if (u.extra > 0) { u.extra--; offer(g, true); if (u.choice) u.choice.options = u.choice.options.filter(x => x.id !== 'pakt'); }
  if (!u.choice && u.powerDue) { u.powerDue = false; offerPower(g); }
  return o;
}
// Einmal je Lauf: drei neue Angebote
export function reroll(g) {
  const u = g.waves && g.waves.u;
  if (!u || !u.choice || u.choice.kind === 'kraft' || u.rerolls < 1) return false;
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
  powerTick(g, u, dt);
  moodTick(g, u, dt);
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
    mood: u.mood ? MOODS[u.mood].name : '', powers: u.powerList.map(p => ({ card: p.card, name: POWERS[p.power].name })), kind: u.choice ? u.choice.kind || '' : '',
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
