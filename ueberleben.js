// Überleben: der Ablauf eines Laufs. Statt gleichförmiger Wellen gibt es Etappen aus fünf Wellen mit Thema und Ansage,
// Elite-Gegner, eine Bosswelle am Ende jeder Etappe, Aufträge mit Bonus, Punkte – und nach jeder zweiten Welle die Wahl
// zwischen drei Segen, die den Lauf prägen (stärkere Karten, mehr Kraft, zähere Türme, Sonderkräfte).
// Seit 2026-11-18 außerdem: nach jeder ungeraden Welle eine Kartenkraft (bis zu zwei je Karte, auch für Zauber und Gebäude), zu jeder
// neuen Etappe ein Fluch zur Wahl (einer oder beide – mehr Gefahr, mehr Punkte), Ereignisse mitten in der Welle (Goldwicht,
// Sternschnuppen, Kopfgeld, Nachschub, Großangriff), ein Kombo-Zähler für schnelle Folgen von Siegen und Bosse mit Erdstoß.
// Gefahrenstufen machen den Lauf härter und bringen mehr Punkte; die Tagesherausforderung hat einen festen Zufallskeim.
//
// Der Spielkern (sim.js) kennt davon nur einen Haken: rules.waves.director(g, dt) ersetzt den eingebauten Wellen-Ablauf.
// Alles hier ist reine Logik ohne Bildschirm; Anzeige und Auswahl stehen in ueberleben-ui.js.
//   setup(waves, { seed, danger, daily })   macht aus den Wellen-Regeln von progress.modeRules einen Lauf
//   pick(g, k) · reroll(g) · autoPick(g)    Segen wählen (k = Nummer des Angebots), neu würfeln, den Computer wählen lassen
//   hud(g) · summary(g)                     was die Anzeige braucht · Abrechnung am Ende
//   survLoad · bookRun · dangerOpen · dailyInfo …   Bestenliste, Gefahrenstufen und Tagesherausforderung im Spielstand
import { CARDS, UNITS, RUNES } from './cards.js';
import { W, RIVER_TOP, BRIDGES, OUTER_Y, MAIN_Y, MAX_KRAFT, STD_LEVEL, cardMult, towerMult, towerDmg, spawnUnit, hurt, formation, mainTower } from './sim.js';

export const STAGE = 5;        // Wellen je Etappe; die letzte ist die Bosswelle
// Die Risse: Seit dem 2026-11-14 hat die Wellenseite keine Türme mehr. Die Gegner steigen aus drei Rissen am oberen Feldrand –
// linke Bahn, rechte Bahn, in der Mitte der Boss. Sie liegen genau auf den Sockeln, auf denen sonst die gegnerischen Türme stehen.
// [x, y] in Feldmaßen; der Zeichner malt sie an dieselben Stellen (render3d.js).
// Seit 2026-11-15 liegen die Risse ganz am oberen Feldrand (vorher auf den Turmplätzen): das ganze Feld ist Kampfplatz, die Wellen haben
// einen längeren Weg, und aufstellen darf man bis kurz vor die Risse.
export const RIFTS = [[BRIDGES[0], 2.4], [BRIDGES[1], 2.4], [W / 2, 1.5]];
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
export const boonText = (g, o) => { if (o.id === 'kk') return `${CARDS[o.card].name}: ${POWERS[o.power].text}.`; if (o.id === 'fluch') return o.curses.map(c => CURSES[c].text).join(' '); const b = o.id === 'pakt' ? PACT : BOONS[o.id]; return typeof b.text === 'function' ? b.text(g, g.waves.u, o) : b.text; };
export const boonName = o => (o.id === 'kk' ? `${POWERS[o.power].name} · ${CARDS[o.card].name}` : o.id === 'fluch' ? o.curses.map(c => CURSES[c].name).join(' + ') : o.id === 'pakt' ? PACT.name : BOONS[o.id].name);
export const boonRar = o => (o.id === 'kk' ? POWERS[o.power].rar : o.id === 'fluch' || o.id === 'pakt' ? 3 : BOONS[o.id].rar);

// ---- Hilfen --------------------------------------------------------------------------------------------------------
const rnd = u => ((u.seed = (Math.imul(u.seed, 1664525) + 1013904223) >>> 0) / 4294967296);   // eigener Zufall: Wellen und Angebote hängen nur vom Keim ab
const emit = (g, e) => { if (g.events.length < 400) g.events.push(e); };
const addKraft = (g, n) => { const S = g.sides[0]; S.kraft = Math.min(MAX_KRAFT, S.kraft + n); };
const heal = (g, t, share) => { if (t.hp <= 0) return; t.hp = Math.min(t.maxHp, t.hp + Math.round(t.maxHp * share)); emit(g, { t: 'heal', x: t.x, y: t.y }); };
const fallen = (g, u) => u.outer.filter(t => !g.ents.some(e => e.kind === 'tower' && e.side === 0 && e.lane === t.lane && e.hp > 0));
const towerHp = g => { let s = 0; for (const e of g.ents) if (e.kind === 'tower' && e.side === 0) s += e.hp; return s; };
const score = (u, pts) => { const n = Math.round(pts * u.mult * (u.curseMult || 1)); u.score += n; return n; };
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
  // seit 2026-11-16, nach der Liste des Chaos-Modus im Vorbild (je Karte dort: mehr Leben, schneller schlagen, weiter schießen, Flächenschaden, mehr Figuren …)
  koloss:    { name: 'Koloss',       rar: 0, text: 'hat doppeltes Leben, läuft aber ein Viertel langsamer', fits: (c, d) => !d.building && d.hp >= 300, on: (g, u, e) => { e.hp = e.maxHp = e.maxHp * 2; e.speed *= 0.75; } },
  hagel:     { name: 'Schnellfeuer', rar: 0, text: 'schlägt und schießt um die Hälfte schneller', fits: (c, d) => d.dmg > 0, on: (g, u, e) => { e.atk /= 1.5; } },
  weitblick: { name: 'Weitblick',    rar: 0, text: 'reicht um die Hälfte weiter', fits: (c, d) => d.range >= 3, on: (g, u, e) => { e.range *= 1.5; e.sight = Math.max(e.sight || 0, e.range + 1); } },
  spender:   { name: 'Kraftspender', rar: 0, text: 'gibt beim Aufstellen eine Kraft zurück', fits: (c, d) => c.cost >= 3, on: (g, u, e, first) => { if (first) addKraft(g, 1); } },
  wucht:     { name: 'Wuchtschlag',  rar: 1, text: 'trifft alles im Umkreis von anderthalb Feldern', fits: (c, d) => !d.splash && d.dmg > 0 && !d.building, on: (g, u, e) => { e.splash = 1.5; } },
  drilling:  { name: 'Drilling',     rar: 2, text: 'erscheint dreifach', fits: (c, d) => !d.building && c.cost <= 3, on: (g, u, e) => { for (const dx of [-0.7, 0.7]) mark(spawnUnit(g, e.type, 0, clamp(e.x + dx, 0.4, W - 0.4), e.y, e.lvl, { deployT: e.deployT })); } },
  riese:     { name: 'Riesenwuchs',  rar: 2, text: 'hat doppeltes Leben und doppelten Schaden', fits: (c, d) => !d.building && d.dmg > 0 && c.cost >= 4, on: (g, u, e) => { e.hp = e.maxHp = e.maxHp * 2; e.dmg *= 2; } },
  zwilling:  { name: 'Zwilling',     rar: 2, text: 'erscheint doppelt', fits: (c, d) => !d.building && c.cost <= 6, on: (g, u, e) => { mark(spawnUnit(g, e.type, 0, clamp(e.x + 0.7, 0.4, W - 0.4), e.y, e.lvl, { deployT: e.deployT })); } },
  // seit 2026-11-18: verrücktere Kräfte – sie hängen an Treffern und am Fallen (onHit, onDie unten)
  vampir:    { name: 'Blutsauger',   rar: 1, text: 'heilt sich um ein Drittel des Schadens, den sie anrichtet', fits: (c, d) => !d.building && d.dmg > 0, on: (g, u, e) => { e.vamp = 0.33; } },
  kette:     { name: 'Kettenblitz',  rar: 2, text: 'jeder Treffer springt mit halber Wucht auf zwei weitere Gegner über', fits: (c, d) => d.dmg > 0 && !d.chain, on: (g, u, e) => { e.chainHit = 2; } },
  frosthieb: { name: 'Frosthieb',    rar: 0, text: 'jeder Treffer bremst das Ziel zwei Sekunden lang', fits: (c, d) => d.dmg > 0 && !d.slow, on: (g, u, e) => { e.frostHit = 2; } },
  gift:      { name: 'Giftklinge',   rar: 1, text: 'jeder Treffer vergiftet: drei Sekunden lang Schaden', fits: (c, d) => d.dmg > 0, on: (g, u, e) => { e.poisonHit = true; } },
  dornen:    { name: 'Dornenpanzer', rar: 0, text: 'wer sie aus der Nähe schlägt, bekommt 40 % des Schadens zurück', fits: (c, d) => d.hp >= 400, on: (g, u, e) => { e.thorns = 0.4; } },
  wieder:    { name: 'Wiedergeburt', rar: 2, text: 'steht nach dem ersten Fallen mit halbem Leben wieder auf', fits: (c, d) => !d.building && d.hp >= 300, on: (g, u, e) => { e.revive = true; } },
  spreng:    { name: 'Sprengschlag', rar: 1, text: 'jeder dritte Treffer explodiert im Umkreis von zwei Feldern', fits: (c, d) => d.dmg > 0 && !d.building, on: (g, u, e) => { e.boomN = 3; e.boomC = 0; } },
  ernte:     { name: 'Seelenernte',  rar: 1, text: 'jeder Gegner, den sie fällt, gibt ihr 8 % mehr Schaden (bis +80 %)', fits: (c, d) => d.dmg > 0, on: (g, u, e) => { e.reap = 0; } },
  wachstum:  { name: 'Wachstum',     rar: 2, text: 'wächst mit jedem Gegner, den sie fällt: mehr Leben, mehr Schaden', fits: (c, d) => !d.building && d.dmg > 0, on: (g, u, e) => { e.grow = 0; } },
  gold:      { name: 'Goldhand',     rar: 0, text: 'jeder Gegner, den sie fällt, bringt eine halbe Kraft und Extrapunkte', fits: (c, d) => d.dmg > 0, on: (g, u, e) => { e.goldHit = true; } },
  dauerbau:  { name: 'Dauerbau',     rar: 0, text: 'steht doppelt so lange', fits: (c, d) => !!d.building && d.life > 0, on: (g, u, e) => { e.life *= 2; } },
  // Zauber: wirken auf den Kreis, den der Zauber beim Ausspielen bekommt (zonePowers unten)
  nachhall:  { name: 'Nachhall',     rar: 2, spell: true, text: 'wirkt eine Sekunde später ein zweites Mal', fits: (c, d, id) => !c.dur && id !== 'trugbild' && id !== 'widerhall' },
  weite:     { name: 'Weitwurf',     rar: 0, spell: true, text: 'wirkt in einem um 40 % größeren Kreis', fits: c => !c.roll && !c.summon },
  eiszauber: { name: 'Eiszauber',    rar: 1, spell: true, text: 'friert alle getroffenen Gegner anderthalb Sekunden ein', fits: c => !c.summon && !c.heal },
  heilregen: { name: 'Heilregen',    rar: 1, spell: true, text: 'heilt deine Truppen im Kreis um ein Drittel ihres Lebens', fits: c => !c.roll },
  rueckfluss:{ name: 'Rückfluss',    rar: 0, spell: true, text: 'trifft er drei Gegner oder mehr, gibt er zwei Kraft zurück', fits: c => !c.summon && !c.heal },
};
export const MAX_POWERS = 2;   // so viele Kartenkräfte trägt eine Karte höchstens
// Seltenheit je Wahl (Zeile = die wievielte Wahl des Laufs): gewöhnlich / selten / episch in Prozent – die Tabelle des Vorbilds
export const POWER_ODDS = [[90, 10, 0], [20, 80, 0], [0, 50, 50], [0, 20, 80], [0, 0, 100]];
const mark = e => { e.pw = true; return e; };   // schon behandelt: bekommt keine Kartenkraft mehr (Gefolge, Zwilling)
const cardUnit = id => { const c = CARDS[id]; return c && c.type !== 'spell' && c.type !== 'tower' ? UNITS[c.mix ? c.mix[0][0] : c.unit] : null; };
const isSpellCard = id => !!CARDS[id] && CARDS[id].type === 'spell';
export const powersOf = (u, id) => u.powers[id] || [];
const powerFits = (pid, id) => { const P = POWERS[pid], c = CARDS[id]; return P.spell ? isSpellCard(id) && P.fits(c, null, id) : !!cardUnit(id) && P.fits(c, cardUnit(id), id); };
function offerPower(g) {
  const u = g.waves.u, odds = POWER_ODDS[Math.min(POWER_ODDS.length - 1, Math.floor(u.powerN / 2))], opts = [];
  const cards = deckOf(g).filter(id => (cardUnit(id) || isSpellCard(id)) && powersOf(u, id).length < MAX_POWERS);
  for (let tries = 0; opts.length < 3 && tries < 90 && cards.length; tries++) {
    let x = rnd(u) * 100, rar = 0;
    while (rar < 2 && x >= odds[rar]) x -= odds[rar++];
    const card = cards[Math.floor(rnd(u) * cards.length)];
    let ids = Object.keys(POWERS).filter(id => POWERS[id].rar === rar && powerFits(id, card));
    if (!ids.length && tries > 45) ids = Object.keys(POWERS).filter(id => powerFits(id, card));
    ids = ids.filter(id => !powersOf(u, card).includes(id) && !opts.some(o => o.power === id || o.card === card));
    if (!ids.length) continue;
    opts.push({ id: 'kk', power: ids[Math.floor(rnd(u) * ids.length)], card });
  }
  if (!opts.length) return false;
  u.powerN++;
  u.choice = { big: true, first: false, kind: 'kraft', options: opts };
  emit(g, { t: 'boon', big: true, first: false, n: g.waves.n, kind: 'kraft' });
  return true;
}
// Kartenkräfte auf frisch erschienene eigene Einheiten legen; laufende Wirkungen (Heilpuls, Berserker)
function powerTick(g, u, dt) {
  if (u.powerList.length) {
    const firsts = new Set();
    for (const e of g.ents) {
      if (e.id < u.seen || e.side !== 0 || e.kind === 'tower' || e.pw) continue;
      e.pw = true;
      const card = u.cardOf.get(e.type), pws = card && u.powers[card];
      if (!pws) continue;
      for (const pw of pws) POWERS[pw].on(g, u, e, !firsts.has(card));
      firsts.add(card);
    }
  }
  u.pulse = (u.pulse || 0) + dt;
  const beat = u.pulse >= 1;
  if (beat) u.pulse -= 1;
  for (const e of g.ents) {
    if (e.hp <= 0) continue;
    if (beat && e.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * e.regen));
    if (beat && e.psnT > 0) { e.psnT--; hurt(g, e, e.psnDmg, 0); emit(g, { t: 'poison', x: e.x, y: e.y, air: e.air }); }   // Giftklinge
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

// ---- Flüche: zu jeder neuen Etappe (ab der zweiten) wählst du einen von zweien – oder beide ---------------------------------
// Ein Fluch macht die Gegner der Etappe gefährlicher und gilt bis zum Ende ihrer Bosswelle. Einer bringt 25 % mehr Punkte,
// beide zusammen 60 % und sofort einen Großen Segen obendrauf. Derselbe Fluch kommt nie zweimal hintereinander.
export const CURSES = {
  eisenhaut: { name: 'Eisenhaut',   text: 'Gegner erscheinen mit einem Schild in Höhe eines Viertels ihres Lebens.' },
  blutdurst: { name: 'Blutdurst',   text: 'Gegner heilen sich um 30 % des Schadens, den sie anrichten.' },
  spiegel:   { name: 'Spiegelbrut', text: 'Jeder dritte gefallene Gegner kehrt als Schemen mit einem Drittel Leben zurück.' },
  spreng:    { name: 'Sprengsatz',  text: 'Gegner explodieren beim Fallen und treffen deine Truppen ringsum.' },
  wut:       { name: 'Letzte Wut',  text: 'Die letzten fünf Gegner einer Welle laufen und schlagen schneller.' },
  eiskralle: { name: 'Eiskralle',   text: 'Jeder Treffer der Gegner bremst deine Truppen.' },
  stachel:   { name: 'Stachelhaut', text: 'Wer Gegner aus der Nähe schlägt, bekommt ein Fünftel des Schadens zurück.' },
  nebel:     { name: 'Nebelmarsch', text: 'Gegner bleiben unsichtbar, bis sie den Fluss erreichen oder angreifen.' },
  horde:     { name: 'Horde',       text: 'Jede Welle ist ein Drittel größer.' },
  flink:     { name: 'Flinke Füße', text: 'Gegner laufen 25 % schneller.' },
  kraftraub: { name: 'Kraftraub',   text: 'Jeder Treffer an deinen Türmen kostet dich etwas Kraft.' },
  riesen:    { name: 'Riesenwuchs', text: 'Der zäheste Trupp jeder Welle hat doppeltes Leben und anderthalbfachen Schaden.' },
};
export const CURSE_MULT = [1, 1.25, 1.6];   // Punkte-Faktor mit keinem, einem, zwei Flüchen
const cursed = (u, id) => u.curses.includes(id);
function offerCurse(g) {
  const u = g.waves.u, ids = Object.keys(CURSES).filter(id => !u.lastCurses.includes(id));
  const a = ids.splice(Math.floor(rnd(u) * ids.length), 1)[0], b = ids[Math.floor(rnd(u) * ids.length)];
  u.choice = { big: false, first: false, kind: 'fluch', options: [{ id: 'fluch', curses: [a] }, { id: 'fluch', curses: [b] }, { id: 'fluch', curses: [a, b] }] };
  emit(g, { t: 'boon', big: false, first: false, n: g.waves.n, kind: 'fluch' });
  return true;
}
// nach einer Wahl: was steht noch an? (nach dem Boss: Großer Segen → Kartenkraft → Fluch der nächsten Etappe)
function nextChoice(g, u) {
  if (u.choice) return;
  if (u.powerDue) { u.powerDue = false; if (offerPower(g)) return; }
  if (u.curseDue) { u.curseDue = false; offerCurse(g); }
}

// ---- Ereignisse: ab Welle 3 bringt gut jede dritte gewöhnliche Welle eines mit (nie zwei Wellen hintereinander) -----------
export const EVENTS = {
  schatz:    { name: 'Goldwicht',      text: 'Ein Goldwicht huscht übers Feld. Fang ihn, bevor er nach 14 Sekunden verschwindet: 3 Kraft, Punkte und einmal Neu-Würfeln.' },
  sterne:    { name: 'Sternschnuppen', text: 'Sterne fallen aufs Feld und treffen alles, was darunter steht – beide Seiten.' },
  kopfgeld:  { name: 'Kopfgeld',       text: 'Auf einen Gegner ist ein Kopfgeld ausgesetzt (goldene Raute). Wer ihn fällt, bekommt 3 Kraft und Punkte.' },
  nachschub: { name: 'Nachschub',      text: 'Ein Versorgungszug kommt durch: 3 Kraft sofort, deine Türme heilen ein wenig.' },
  sturm:     { name: 'Großangriff',    text: 'Diese Welle ist anderthalbmal so groß – und bringt doppelte Punkte.' },
};
function pickEvent(g, u, n) {
  if (isBoss(n) || n < 3 || u.lastEvent === n - 1 || rnd(u) > 0.38) return '';
  const ids = Object.keys(EVENTS).filter(id => id !== 'nachschub' || mine(g).some(t => t.hp < t.maxHp * 0.85));
  u.lastEvent = n; u.stats.events++;
  return ids[Math.floor(rnd(u) * ids.length)];
}

// ---- Kombo: Siege in schneller Folge (höchstens 2,5 Sekunden Abstand) bringen mehr Punkte, ab dem fünften bis zum Doppelten --
export const COMBO_GAP = 2.5;
export const comboMult = c => 1 + Math.min(1, Math.max(0, c - 4) * 0.05);

// ---- Haken in den Spielkern: Treffer und Fallen (sim.js ruft sie nur im Überleben) ------------------------------------------
function onHit(g, s, e, amt) {
  const u = g.waves && g.waves.u;
  if (!u) return amt;
  if (s.side === 0) {   // Kartenkräfte deiner Truppen
    if (s.reap) amt *= 1 + Math.min(0.8, s.reap * 0.08);
    if (s.vamp && s.kind === 'unit' && s.hp > 0 && s.hp < s.maxHp) { s.hp = Math.min(s.maxHp, s.hp + Math.round(amt * s.vamp)); if (++u.fxN % 3 === 0) emit(g, { t: 'heal', x: s.x, y: s.y }); }
    if (e.kind === 'unit') {
      if (s.frostHit) { e.slowT = Math.max(e.slowT, s.frostHit); if (++u.fxN % 2 === 0) emit(g, { t: 'surv', k: 'frosthieb', x: e.x, y: e.y }); }
      if (s.poisonHit) { e.psnT = 3; e.psnDmg = Math.max(e.psnDmg || 0, Math.round(s.dmg * 0.25)); }
    }
    if (s.boomN && ++s.boomC >= s.boomN) { s.boomC = 0; g.zones.push({ blast: { dmg: Math.round(amt * 0.8), slow: 0, tf: 0.5 }, side: 0, x: e.x, y: e.y, r: 2, delay: 0.01, dur: 0, done: false }); }
    if (s.chainHit && !u.chaining) {
      u.chaining = true;
      const d2 = o => Math.hypot(o.x - e.x, o.y - e.y);
      const more = g.ents.filter(o => o !== e && o.side === 1 && o.kind !== 'tower' && o.hp > 0 && !o.hidden && d2(o) <= 3.5).sort((a, b) => d2(a) - d2(b)).slice(0, s.chainHit);
      if (more.length) { emit(g, { t: 'chain', side: 0, x: e.x, y: e.y, air: e.air, hits: more.map(o => ({ x: o.x, y: o.y, air: o.air })) }); for (const o of more) hurt(g, o, Math.round(amt * 0.5), 0); }
      u.chaining = false;
    }
  } else if (s.side === 1 && u.curses.length) {   // Flüche der Gegner
    if (cursed(u, 'blutdurst') && s.kind === 'unit' && s.hp < s.maxHp) { s.hp = Math.min(s.maxHp, s.hp + Math.round(amt * 0.3)); if (++u.fxN % 3 === 0) emit(g, { t: 'heal', x: s.x, y: s.y }); }
    if (cursed(u, 'eiskralle') && e.kind === 'unit') e.slowT = Math.max(e.slowT, 1.5);
    if (cursed(u, 'kraftraub') && e.kind === 'tower') { const S = g.sides[0]; S.kraft = Math.max(0, S.kraft - 0.25); }
    if (cursed(u, 'nebel') && s.cloakT > 1e5) s.cloakT = 0;
  }
  // Rückschlag aus der Nähe: Dornenpanzer (deine Kraft) und Stachelhaut (Fluch); hurt hat keinen Angreifer, also keine Kette
  if (s.kind === 'unit' && s.hp > 0 && Math.hypot(s.x - e.x, s.y - e.y) <= s.r + e.r + 1.6) {
    if (e.side === 0 && e.thorns && s.side === 1) hurt(g, s, Math.round(amt * e.thorns), 0);
    else if (e.side === 1 && s.side === 0 && cursed(u, 'stachel')) hurt(g, s, Math.round(amt * 0.2), 1);
  }
  return amt;
}
function onDie(g, e) {
  const u = g.waves && g.waves.u;
  if (!u || e.kind === 'tower') return false;
  if (e.side === 0) {
    if (!e.revive || e.revived || e.kind !== 'unit' || e.hp > 0) return false;
    e.revived = true; e.hp = Math.round(e.maxHp * 0.5); e.stunT = Math.max(e.stunT, 0.5); e.psnT = 0;   // Wiedergeburt
    emit(g, { t: 'healaura', x: e.x, y: e.y, r: 1.4, side: 0 }); emit(g, { t: 'surv', k: 'wieder', x: e.x, y: e.y });
    return true;
  }
  const k = e.lastBy ? g.byId.get(e.lastBy) : null;
  if (k && k.side === 0 && k.hp > 0) {
    if (k.reap !== undefined) k.reap++;
    if (k.grow !== undefined && k.grow < 10) { k.grow++; const add = Math.round(k.maxHp * 0.1); k.maxHp += add; k.hp += add; k.dmg = Math.round(k.dmg * 1.08); emit(g, { t: 'grow', x: k.x, y: k.y }); }
    if (k.goldHit) { addKraft(g, 0.5); score(u, 6); emit(g, { t: 'coin', x: e.x, y: e.y }); }
  }
  if (cursed(u, 'spreng')) g.zones.push({ blast: { dmg: Math.round(90 * cardMult(e.lvl)), slow: 0, tf: 0.35 }, side: 1, x: e.x, y: e.y, r: 1.5, delay: 0.25, dur: 0, done: false });
  if (cursed(u, 'spiegel') && !e.shade && !e.boss && ++u.mirrorN % 3 === 0) u.later.push({ at: u.time + 0.4, k: 'schemen', type: e.type, x: e.x, y: e.y, lvl: e.lvl, hp: Math.round(e.maxHp / 3) });
  return false;
}

// Kartenkräfte der Zauber: greifen am Kreis, sobald der Zauber ausgespielt ist (vor seiner Wirkung)
function zonePowers(g, u) {
  for (const z of g.zones) {
    if (z.pw || z.side !== 0 || !z.card || !isSpellCard(z.card)) continue;
    z.pw = true;
    const pws = u.powers[z.card];
    if (!pws) continue;
    const t = u.time + Math.max(0, z.delay || 0);
    for (const pw of [...pws].sort((a, b) => (b === 'weite') - (a === 'weite'))) {   // erst den Kreis vergrößern, dann die übrigen Wirkungen messen
      if (pw === 'weite') z.r *= 1.4;
      else if (pw === 'nachhall') u.later.push({ at: t + 1, k: 'nach', z: { ...z, delay: 0, hit: false, done: false, held: undefined, pw: true } });
      else if (pw === 'eiszauber') u.later.push({ at: t + 0.05, k: 'eis', x: z.x, y: z.y, r: z.r });
      else if (pw === 'heilregen') u.later.push({ at: t + 0.05, k: 'heil', x: z.x, y: z.y, r: z.r });
      else if (pw === 'rueckfluss') u.later.push({ at: t - 0.02, k: 'fluss', x: z.x, y: z.y, r: z.r });
    }
  }
}
// Nachwirkungen zu einem festen Zeitpunkt
function laterTick(g, u) {
  const inR = (e, L) => Math.hypot(e.x - L.x, e.y - L.y) <= L.r + e.r;
  for (let i = u.later.length - 1; i >= 0; i--) {
    const L = u.later[i];
    if (L.at > u.time) continue;
    u.later.splice(i, 1);
    if (L.k === 'stern') { emit(g, { t: 'spell', spell: 'sternschlag', side: 1, x: L.x, y: L.y, r: L.r }); for (const e of g.ents) if (e.side === 1 && e.kind === 'unit' && e.hp > 0 && inR(e, L)) hurt(g, e, e.boss ? Math.round(L.dmg / 2) : L.dmg, 0); }
    else if (L.k === 'nach') { g.zones.push(L.z); emit(g, { t: 'surv', k: 'nachhall', x: L.z.x, y: L.z.y }); }
    else if (L.k === 'eis') { emit(g, { t: 'burst', x: L.x, y: L.y, r: L.r, frost: true, side: 0 }); for (const e of g.ents) if (e.side === 1 && e.kind === 'unit' && e.hp > 0 && inR(e, L)) { e.stunT = Math.max(e.stunT, 1.5); e.iceT = Math.max(e.iceT || 0, 1.5); e.inRange = false; } }
    else if (L.k === 'heil') { emit(g, { t: 'healaura', x: L.x, y: L.y, r: L.r, side: 0 }); for (const e of g.ents) if (e.side === 0 && e.kind === 'unit' && e.hp > 0 && inR(e, L) && e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp / 3)); emit(g, { t: 'heal', x: e.x, y: e.y }); } }
    else if (L.k === 'fluss') { if (g.ents.filter(e => e.side === 1 && e.kind !== 'tower' && e.hp > 0 && inR(e, L)).length >= 3) { addKraft(g, 2); emit(g, { t: 'surv', k: 'rueckfluss', x: L.x, y: L.y }); } }
    else if (L.k === 'schemen') {
      const s = spawnUnit(g, L.type, 1, L.x, L.y, L.lvl, { deployT: 0.5 });
      s.hp = s.maxHp = Math.max(1, L.hp); s.shade = true;
      u.foes.set(s.id, { pts: 2, elite: '', boss: false, x: s.x, y: s.y, lvl: L.lvl });
      emit(g, { t: 'clone', x: s.x, y: s.y, side: 1 });
    }
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
    score: 0, mult: dangerMult(cfg.danger), kills: 0, stats: { fast: 0, flawless: 0, elites: 0, bosses: 0, quests: 0, combo: 0, curses: 0, events: 0, treasures: 0 },
    boons: {}, order: [], choice: null, extra: 0, rerolls: 1, pacts: 0, foeLvl: cfg.danger >= 1 ? 1 : 0, foeSpeed: cfg.danger >= 2 ? 1.1 : 1,
    waveKraft: 0, wehr: false, seen: g.nextId, twr: 0, hurtNow: false, cleared: 0, bolt: 0,
    quest: null, boss: null, outer: [], last: null,
    powers: {}, powerList: [], powerN: 0, powerDue: false, cardOf: new Map(), mood: '', moodT: 0, seenMood: g.nextId, pulse: 0,
    curses: [], lastCurses: [], curseMult: 1, curseDue: false, event: '', lastEvent: 0, treasure: null, stars: null, later: [],
    combo: 0, lastKill: -9, mirrorN: 0, wut: false, waveBonus: 1, waveTotal: 0, chaining: false, fxN: 0,
  };
  g.hitHook = onHit; g.dieHook = onDie;
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
// Seit 2026-11-15 rücken die eigenen Truppen von selbst vor und gehen auf jeden Gegner los: Wer die ersten zehn Wellen übersteht, hätte
// sonst ein Heer, das alles Weitere am Riss abfängt (gemessen: Mitte Welle 33). Darum wächst die Wellenstärke ab Welle 9 zusätzlich
// im Quadrat (late, from).
export const TUNE = { base: 5, lin: 1.5, quad: 0.21, late: 1.6, from: 9 };
const floorOf = (g, id) => (g.waves.floor ? g.waves.floor(id) : 0);   // Mindeststufe einer Karte (ihre Startstufe, progress.js) – wie beim Computergegner
const budget = n => TUNE.base + n * TUNE.lin + n * n * TUNE.quad + TUNE.late * Math.max(0, n - TUNE.from) ** 2;   // Kraftwert einer Welle: wächst erst gemächlich, dann immer steiler – kein Lauf geht ewig
// Türme wachsen im Vorbild langsamer als Karten: auf niedrigen Stufen sind sie im Verhältnis stärker (Stufe 2: gut ein Viertel).
// Im Überleben tragen die Türme den Lauf – die Wellen gleichen diesen Vorsprung in ganzen Stufen aus (Turmstufe 1: drei, 2–4: zwei, 5–7: eine, ab 8: keine).
export const towerEdge = lvl => Math.max(0, Math.round(Math.log(towerMult(lvl, true) / cardMult(lvl)) / Math.log(1.1)));
// Seit 2026-11-16 gedeckelt: Die Gegner steigen höchstens LVL_CAP Stufen über ihren Anfang (vorher ohne Grenze – spät im Lauf standen sie
// so viele Stufen über den eigenen Karten, dass nichts mehr half). Danach kommt nur noch alle zehn Wellen eine Stufe dazu (ab Welle 30).
export const LVL_CAP = 5;
export const foeLevel = (g, n) => g.waves.lvl + Math.min(LVL_CAP, Math.floor((n - 1) / STAGE) + Math.max(0, Math.floor((n - 17) / 4))) + Math.max(0, Math.floor((n - 20) / 10)) + g.waves.u.foeLvl + (g.waves.u.edge || 0);   // jede Etappe eine Stufe stärker, ab Welle 21 noch schneller
// Wellenmacht (seit 2026-11-18): Ab Welle 16 hat jede Welle 6 % mehr Leben und 3,5 % mehr Schaden als die vorige (wächst mit, wie die
// Segen und Kräfte des Spielers) – sichtbar in der Anzeige, ohne höhere Stufen. Vorher blieben die Wellen nach der Stufengrenze gleich
// stark; der Computer-Spieler stand bei Welle 44 mit unversehrten Türmen, mit +5 % je Welle (ohne Zinseszins) noch bei Welle 56.
export const RAMP = { from: 15, hp: 1.06, dmg: 1.035 };
export const rampOf = n => Math.max(0, n - RAMP.from);
export const rampHp = n => RAMP.hp ** rampOf(n), rampDmg = n => RAMP.dmg ** rampOf(n);
export const waveTime = n => (isBoss(n) ? 42 : 24);
// Risswacht (seit 2026-11-18): Die Wellenseite hat keine Türme. Ohne Gegenwehr stand das eigene Heer am Ende auf den Rissen und fing
// jede Welle schon beim Erscheinen ab (gemessen: Welle 30 mit unversehrten Türmen, auch bei steilerer Wellenmacht). Jetzt schießen
// die drei Risse wie Kronentürme auf eigene Truppen und Gebäude in ihrer Nähe – Schaden eines Turms auf der Stufe der Gegner.
export const RIFT_GUARD = { range: 7, every: 0.8 };
function riftGuard(g, u, dt) {
  if (!g.waves.n || (u.riftT = (u.riftT || 0) - dt) > 0) return;
  u.riftT += RIFT_GUARD.every;
  const n = g.waves.n, dmg = Math.round(UNITS.aussenturm.dmg * towerDmg(foeLevel(g, n)) * rampDmg(n));   // towerDmg: Faktor zur Stufe 11
  for (const [x, y] of RIFTS) {
    let best = null, bd = RIFT_GUARD.range;
    for (const e of g.ents) { if (e.side !== 0 || e.kind === 'tower' || e.hp <= 0 || e.hidden || e.deployT > 0) continue; const d = Math.hypot(e.x - x, e.y - y) - e.r; if (d < bd) { bd = d; best = e; } }
    if (!best) continue;
    emit(g, { t: 'riftbolt', x, y, tx: best.x, ty: best.y, air: best.air });
    hurt(g, best, dmg, 1);
  }
}   // spätestens dann rückt die nächste Welle nach, auch wenn noch Gegner stehen

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
  u.twr = towerHp(g); u.hurtNow = false; u.bolt = u.boons.blitzwacht ? 2.6 : 0; u.wut = false;
  const ev = pickEvent(g, u, n);
  u.event = ev; u.waveBonus = ev === 'sturm' ? 2 : 1;
  if (ev === 'nachschub') { addKraft(g, 3); for (const t of mine(g)) heal(g, t, 0.12); }
  if (ev === 'sterne') u.stars = { left: 5 + stage, t: 2.5 };
  if (u.waveKraft) addKraft(g, u.waveKraft);
  if ((n - 1) % STAGE === 0) { newQuest(u, stage); const ids = Object.keys(MOODS).filter(id => id !== u.mood); setMood(g, u, stage >= 2 ? ids[Math.floor(rnd(u) * ids.length)] : ''); }
  let lvl = foeLevel(g, n);
  const T = THEMES[u.theme] || THEMES.gemischt, lanes = T.both || boss ? [0, 1] : [rnd(u) < 0.5 ? 0 : 1];
  const themed = u.pool.filter(T.fits);
  let left = budget(n) * (boss ? (stage === 1 ? 0.4 : 0.55) : 1) * (cursed(u, 'horde') ? 1.33 : 1) * (ev === 'sturm' ? 1.5 : 1), k = 0, at = 0;   // Begleiter des Bosses; der erste Boss kommt mit kleinem Gefolge
  const groups = [];
  for (let tries = 0; left >= 1 && tries < 90 && groups.length < 22; tries++) {
    const from = themed.length && rnd(u) < 0.78 ? themed : u.pool, id = from[Math.floor(rnd(u) * from.length)], c = CARDS[id];
    if (c.cost > left + 0.5 && tries < 50) continue;
    left -= c.cost;
    groups.push({ id, lane: lanes[k++ % lanes.length], at });
    at += 0.7 + rnd(u) * 0.6;
  }
  if (left > 5) lvl += Math.min(2, Math.floor(left / 8));   // mehr Trupps passen nicht aufs Feld: was an Stärke übrig ist, wird zu höheren Stufen
  // Elite: der zäheste Trupp der Welle bekommt eine Eigenschaft
  let elite = '';
  const eliteN = boss ? 0 : (u.danger >= 4 && n >= 2) || (n >= 4 && rnd(u) < Math.min(0.9, 0.3 + n * 0.03)) ? 1 + (n >= 15 ? 1 : 0) + (n >= 25 ? 1 : 0) : 0;
  const tough = [...groups].sort((a, b) => unitOf(b.id).hp - unitOf(a.id).hp);
  if (cursed(u, 'riesen') && tough.length) tough[0].giant = true;
  if (ev === 'kopfgeld' && groups.length) groups[Math.floor(rnd(u) * groups.length)].bounty = true;
  for (let i = 0; i < eliteN && i < tough.length; i++) { const ks = Object.keys(ELITES).filter(e => e !== 'brut' || UNITS.kiesel); tough[i].elite = ks[Math.floor(rnd(u) * ks.length)]; elite = elite || tough[i].elite; }
  for (const gr of groups) {
    const [rx, ry] = RIFTS[gr.lane], x = rx + (rnd(u) - 0.5) * 2.6, y = ry + rnd(u) * 2.4, c = CARDS[gr.id], us = unitsOf(gr.id), pts = Math.max(2, Math.round(8 * c.cost / us.length));
    formation(us.length, 0.5, 1).forEach(([dx, dy], i) => u.queue.push({ at: gr.at, unit: us[i], x: clamp(x + dx, 0.4, W - 0.4), y: clamp(y + dy, 0.4, RIVER_TOP - 0.5), lvl: Math.max(lvl, floorOf(g, gr.id)), pts, elite: i === 0 ? gr.elite || '' : '', card: i === 0 ? gr.id : '', giant: !!gr.giant, bounty: i === 0 && !!gr.bounty }));
  }
  let bossName = '';
  if (boss) {
    const kind = BOSS_KINDS[(stage - 1) % BOSS_KINDS.length], single = u.pool.filter(id => unitsOf(id).length === 1);
    const cands = single.filter(id => kind.fits(unitOf(id)));
    const id = (cands.length ? cands : single.length ? single : u.pool).reduce((a, b) => (unitOf(b).hp > unitOf(a).hp ? b : a));
    u.queue.push({ at: 1.2, unit: unitsOf(id)[0], x: RIFTS[2][0], y: RIFTS[2][1] + 1.2, lvl: Math.max(lvl, floorOf(g, id)) + 1, pts: 150 * stage, boss: { kind: kind.id, name: kind.name, stage, card: id }, card: id });
    bossName = kind.name;
  }
  if (ev === 'schatz') {   // Goldwicht: ein flinker Einzelner aus dem Vorrat, der nicht kämpft
    const quick = u.pool.filter(id => unitsOf(id).length === 1 && !unitOf(id).air && unitOf(id).speed >= 1.5), from = quick.length ? quick : u.pool.filter(id => unitsOf(id).length === 1);
    const id = (from.length ? from : u.pool)[Math.floor(rnd(u) * (from.length || u.pool.length))], [rx, ry] = RIFTS[rnd(u) < 0.5 ? 0 : 1];
    u.queue.push({ at: 2.5, unit: unitsOf(id)[0], x: rx, y: ry + 1, lvl, pts: 0, elite: '', card: id, treasure: true });
  }
  u.queue.sort((a, b) => a.at - b.at);
  u.waveTotal = u.queue.length;
  emit(g, { t: 'wave', n, boss, lvl, theme: u.theme, name: boss ? bossName : T.name, hint: boss ? BOSS_KINDS[(stage - 1) % BOSS_KINDS.length].text : T.hint, elite, event: ev, curses: [...u.curses] });
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
  const late = rampOf(g.waves.n);
  if (late) { const kh = rampHp(g.waves.n); e.hp = e.maxHp = Math.round(e.maxHp * kh); e.dmg = Math.round(e.dmg * rampDmg(g.waves.n)); if (e.shield) e.shield = e.maxShield = Math.round(e.shield * kh); }
  if (q.giant) { e.hp = e.maxHp = Math.round(e.maxHp * 2); e.dmg = Math.round(e.dmg * 1.5); meta.pts *= 2; }
  if (cursed(u, 'eisenhaut')) e.shield = e.maxShield = (e.shield || 0) + Math.round(e.maxHp * 0.25);
  if (cursed(u, 'flink')) e.speed *= 1.25;
  if (cursed(u, 'nebel')) e.cloakT = 1e9;
  if (q.treasure) { e.dmg = 0; e.hp = e.maxHp = Math.round(e.maxHp * 2.5); e.speed *= 1.25; e.blessed = true; e.treasure = true; e.cloakT = 0; meta.treasure = true; meta.pts = 0; u.treasure = { id: e.id, t: 14 }; emit(g, { t: 'surv', k: 'goldwicht', x: e.x, y: e.y }); }
  if (q.bounty) { e.blessed = true; meta.bounty = true; }
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
    const pts = score(u, (20 + 5 * n) * (fast ? 1.5 : 1) * u.waveBonus + (flawless ? 30 : 0));
    u.cleared++; if (fast) { u.stats.fast++; questAdd(g, u, 'eilig'); } if (flawless) { u.stats.flawless++; questAdd(g, u, 'makellos'); }
    emit(g, { t: 'surv', k: 'clear', n, pts, fast, flawless });
  }
  u.phase = 'pause'; u.t = cleared ? 3.5 : 0.4;
  u.event = ''; u.stars = null;
  // Stelle in der Etappe: nach Welle 1 und 3 eine Kartenkraft, nach 2 und 4 ein Segen; nach dem Boss Großer Segen, Kartenkraft und
  // der Fluch der nächsten Etappe (die Flüche dieser Etappe enden hier)
  const k = n % STAGE;
  if (isBoss(n)) { u.curses = []; u.curseMult = 1; u.powerDue = true; u.curseDue = true; offer(g, true); }
  else if (k === 2 || k === 4) offer(g, false);
  else u.powerDue = true;
  nextChoice(g, u);
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
    u.powers[o.card] = [...powersOf(u, o.card), o.power]; u.powerList.push({ card: o.card, power: o.power });
    emit(g, { t: 'surv', k: 'kraft', card: o.card, power: o.power });
    nextChoice(g, u);
    return o;
  }
  if (o.id === 'fluch') {   // Fluch der Etappe: einer oder beide
    u.curses = [...o.curses]; u.lastCurses = [...o.curses]; u.curseMult = CURSE_MULT[o.curses.length]; u.stats.curses += o.curses.length;
    emit(g, { t: 'surv', k: 'fluch', ids: o.curses, names: o.curses.map(c => CURSES[c].name) });
    if (o.curses.length > 1) { offer(g, true); if (u.choice) u.choice.options = u.choice.options.filter(x => x.id !== 'pakt'); }   // beide: Großer Segen obendrauf
    nextChoice(g, u);
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
  nextChoice(g, u);
  return o;
}
// Einmal je Lauf: drei neue Angebote
export function reroll(g) {
  const u = g.waves && g.waves.u;
  if (!u || !u.choice || u.choice.kind === 'kraft' || u.choice.kind === 'fluch' || u.rerolls < 1) return false;
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
  if (u.choice.kind === 'fluch') return pick(g, 0);   // der Computer nimmt einen Fluch, nie beide
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
  zonePowers(g, u);
  laterTick(g, u);
  riftGuard(g, u, dt);
  u.seen = g.nextId;
  // gefallene Gegner: Punkte, Beute, Brut der Elite
  for (const [id, m] of u.foes) {
    const e = g.byId.get(id);
    if (e && e.hp > 0) { m.x = e.x; m.y = e.y; continue; }
    u.foes.delete(id);
    u.kills++;
    u.combo = u.time - u.lastKill <= COMBO_GAP ? u.combo + 1 : 1; u.lastKill = u.time;
    if (u.combo > u.stats.combo) u.stats.combo = u.combo;
    if (u.combo >= 10 && u.combo % 10 === 0) emit(g, { t: 'surv', k: 'kombo', n: u.combo });
    score(u, m.pts * comboMult(u.combo)); questAdd(g, u, 'jaeger');
    if (m.treasure) { addKraft(g, 3); u.rerolls++; u.stats.treasures++; emit(g, { t: 'coin', x: m.x, y: m.y, big: true }); emit(g, { t: 'surv', k: 'schatz', x: m.x, y: m.y, pts: score(u, 120 * Math.ceil(g.waves.n / STAGE)) }); u.treasure = null; }
    if (m.bounty) { addKraft(g, 3); emit(g, { t: 'surv', k: 'kopfgeld', x: m.x, y: m.y, pts: score(u, 80 * Math.ceil(g.waves.n / STAGE)) }); }
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
      b.stompT = (b.stompT ?? 6) - dt;   // Erdstoß: angekündigt durch einen roten Kreis, betäubt kurz, was darin steht
      if (b.stompT <= 0 && e.deployT <= 0 && !(e.stunT > 0)) {
        if (g.ents.some(o => o.side === 0 && o.kind !== 'tower' && o.hp > 0 && !o.air && Math.hypot(o.x - e.x, o.y - e.y) <= 3.2)) {
          b.stompT = b.rage ? 5 : 8; const r = 2.6;
          emit(g, { t: 'cast', spell: 'stampf', side: 1, x: e.x, y: e.y, r, delay: 0.9 });
          g.zones.push({ blast: { dmg: Math.round(160 * cardMult(e.lvl)), slow: 0, stun: 0.8, tf: 0.3 }, side: 1, x: e.x, y: e.y, r, delay: 0.9, dur: 0, done: false });
          emit(g, { t: 'surv', k: 'stampf', name: b.name });
        } else b.stompT = 1;
      }
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
  // Goldwicht: entkommt nach seiner Zeit · Sternschnuppen · Letzte Wut · Nebelmarsch
  if (u.treasure) {
    const e = g.byId.get(u.treasure.id);
    if (!e || e.hp <= 0) u.treasure = null;
    else if ((u.treasure.t -= dt) <= 0) { u.foes.delete(e.id); e.hp = 0; u.treasure = null; emit(g, { t: 'rise', side: 1, x: e.x, y: e.y }); emit(g, { t: 'surv', k: 'entkommen', x: e.x, y: e.y }); }
  }
  if (u.stars && u.phase === 'welle' && (u.stars.t -= dt) <= 0) {
    u.stars.t = 1.1; u.stars.left--;
    const near = g.ents.filter(e => e.kind === 'unit' && e.hp > 0 && !e.stub), at = near.length && rnd(u) < 0.7 ? near[Math.floor(rnd(u) * near.length)] : { x: 1.5 + rnd(u) * (W - 3), y: 4 + rnd(u) * 24 };
    const x = clamp(at.x + (rnd(u) - 0.5) * 1.2, 0.6, W - 0.6), y = clamp(at.y + (rnd(u) - 0.5) * 1.2, 0.6, 31.4), r = 1.6, dmg = Math.round(240 * cardMult(foeLevel(g, Math.max(1, g.waves.n))));
    emit(g, { t: 'cast', spell: 'sternschlag', side: 1, x, y, r, delay: 1.0 });
    g.zones.push({ blast: { dmg, slow: 0, tf: 0.3 }, side: 1, x, y, r, delay: 1.0, dur: 0, done: false });   // trifft deine Seite …
    u.later.push({ at: u.time + 1.0, k: 'stern', x, y, r, dmg });                                            // … und die Gegner zur selben Zeit
    if (u.stars.left <= 0) u.stars = null;
  }
  if (cursed(u, 'wut') && u.phase === 'welle' && !u.queue.length && !u.wut) {
    const left = g.ents.filter(e => e.side === 1 && e.kind === 'unit' && e.hp > 0);
    if (left.length && left.length <= 5) { u.wut = true; for (const e of left) e.hasteT = 1e9; emit(g, { t: 'surv', k: 'wut' }); }
  }
  if (cursed(u, 'nebel')) for (const e of g.ents) if (e.side === 1 && e.cloakT > 1e5 && (e.y >= RIVER_TOP - 1 || e.inRange)) e.cloakT = 0;
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
    mood: u.mood ? MOODS[u.mood].name : '', moodText: u.mood ? MOODS[u.mood].text : '', powers: u.powerList.map(p => ({ card: p.card, power: p.power, name: POWERS[p.power].name, rar: POWERS[p.power].rar })), kind: u.choice ? u.choice.kind || '' : '',
    curses: u.curses.map(id => ({ id, name: CURSES[id].name, text: CURSES[id].text })), curseMult: u.curseMult,
    event: u.event ? { id: u.event, name: EVENTS[u.event].name, text: EVENTS[u.event].text } : null, treasure: u.treasure ? Math.max(0, u.treasure.t) : 0,
    combo: u.time - u.lastKill <= COMBO_GAP && u.combo >= 3 ? u.combo : 0, comboMult: comboMult(u.combo), comboLeft: Math.max(0, COMBO_GAP - (u.time - u.lastKill)) / COMBO_GAP,
    ramp: Math.round((rampHp(wv.n) - 1) * 100), stagePos: wv.n ? ((wv.n - 1) % STAGE) + 1 : 0, total: Math.max(u.waveTotal, u.foes.size + u.queue.length),
  };
}
export function summary(g) {
  const wv = g.waves, u = wv && wv.u;
  if (!u) return null;
  return { wave: wv.n, score: u.score, kills: u.kills, danger: u.danger, daily: u.daily, mult: u.mult, time: Math.round(g.time), boons: [...u.order], pacts: u.pacts, powers: u.powerList.map(p => ({ ...p })), ...u.stats };
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
