// Spielmodi nach dem Vorbild – reine Logik ohne Bildschirm (Anzeige: modi-ui.js).
//   Ereignisse   Modi mit Sonderregel, die täglich wechseln (Modus des Tages) – doppelte/dreifache Kraft, Kraftflut, Anschwellen,
//                Plötzliches Ende, drei Arten der Kartenwahl, Spiegelkampf, Raserei, fertige Decks, Truppenansturm, Überleben
//   Serien       Herausforderungen bis 12 Siege oder 3 Niederlagen mit Belohnungsleiter; dazu das Wochenereignis mit einmaligen Belohnungen
//   Rangliste    Ligen mit Stufen: ein Sieg eine Stufe hinauf, eine Niederlage eine hinab; goldene Stufen halten; am Monatsanfang von vorn
// Regeln des Vorbilds: Wiki-Seiten „Special Event Challenges“, „Tournament“, „Ranked“, „Global Spell“ (Stand 2026-11-14, siehe recherche/modi).
// Namen und Texte sind eigene. Der Stand liegt in profile.modi; Belohnungen schreibt der Aufrufer über grant (P.grantReward) gut.
import { CARDS, CARD_IDS, UNITS, DEFAULT_DECK, MAX_HEROES } from './cards.js';
import * as P from './progress.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const unitOf = id => { const c = CARDS[id]; return c.type === 'spell' ? null : UNITS[c.mix ? c.mix[0][0] : c.unit]; };

// ---- Ereignisse ---------------------------------------------------------------------------------------------------
// deck: 'eigen' eigenes Deck · 'wahl' je zwei Karten, eine für den Gegner · 'dreier' eine aus dreien, acht Mal · 'gross' abwechselnd
//       aus 36 offenen Karten · 'spiegel' beide dasselbe Zufallsdeck · 'fertig' zwei fertige Decks werden zugelost
// even: beide Seiten auf gleicher Stufe (wie die Turnierstufe des Vorbilds) – immer, wenn nicht das eigene Deck gespielt wird
export const EVENTS = {
  doppelt:     { name: 'Doppelte Kraft',  short: '2× Kraft', deck: 'eigen', text: 'Die Kraft fließt das ganze Spiel doppelt so schnell. Beide beginnen mit leerem Vorrat.', rules: () => ({ kraftFixed: 2, startKraft: 0 }) },
  dreifach:    { name: 'Dreifache Kraft', short: '3× Kraft', deck: 'eigen', text: 'Die Kraft fließt das ganze Spiel dreimal so schnell. Beide beginnen mit leerem Vorrat.', rules: () => ({ kraftFixed: 3, startKraft: 0 }) },
  flut:        { name: 'Kraftflut',       short: '7× Kraft', deck: 'eigen', text: 'Kraft ohne Ende: Sie fließt siebenmal so schnell. Wer schneller spielt, gewinnt.', rules: () => ({ kraftFixed: 7 }) },
  anschwellen: { name: 'Anschwellen',     short: 'Anschwellen', deck: 'eigen', text: 'Jede Minute fließt die Kraft schneller: einfach, doppelt, dreifach – in der Verlängerung vier- und fünffach.', rules: () => ({ kraftPlan: [1, 2, 3, 4, 5] }) },
  tod:         { name: 'Plötzliches Ende', short: 'Plötzliches Ende', deck: 'eigen', text: 'Das Spiel beginnt in der Verlängerung: fünf Minuten, der erste gefallene Turm entscheidet sofort. Die Kraft fließt doppelt, in den letzten zwei Minuten dreifach.', rules: () => ({ sudden: true, duration: 300, overtime: 0, kraftPlan: [2, 2, 2, 3, 3] }) },
  wahl:        { name: 'Kartenwahl',      short: 'Kartenwahl', deck: 'wahl', even: true, text: 'Vier Mal zwei Karten: eine behältst du, die andere bekommt der Gegner. Was er dir gibt, siehst du erst im Kampf.' },
  dreierwahl:  { name: 'Dreierwahl',      short: 'Dreierwahl', deck: 'dreier', even: true, text: 'Acht Mal eine aus drei Karten; die anderen beiden verfallen. Du siehst, woraus dein Gegner wählt – nicht, was er nimmt.' },
  grosswahl:   { name: 'Große Auswahl',   short: 'Große Auswahl', deck: 'gross', even: true, text: '36 offene Karten für beide. Ihr wählt abwechselnd, bis jeder acht hat – wer nimmt, nimmt dem anderen etwas weg.' },
  spiegel:     { name: 'Spiegelkampf',    short: 'Spiegelkampf', deck: 'spiegel', even: true, text: 'Beide spielen dasselbe zufällige Deck in derselben Kartenfolge – mit dem Widerhall darin. Es entscheidet nur das Können.', rules: () => ({ mirror: true }) },
  raserei:     { name: 'Raserei',         short: 'Raserei', deck: 'eigen', text: 'Über dem ganzen Feld liegt Raserei: Truppen, Gebäude und Türme sind dauerhaft schneller, und die Kraft fließt um ein Drittel schneller.', rules: () => ({ rage: true, kraft: [1.35, 1.35] }) },
  decks:       { name: 'Fertige Decks',   short: 'Fertige Decks', deck: 'fertig', even: true, text: 'Jeder bekommt ein fertiges, erprobtes Deck zugelost. Gleiche Stufe für beide.' },
  truppen:     { name: 'Truppenansturm',  short: 'Truppenansturm', deck: 'eigen', text: 'An beiden Haupttürmen erscheinen laufend Truppen des Tages – je schneller die Kraft fließt, desto mehr.', rules: (p, day) => { const u = rushUnit(p, day); return { kraftPlan: [1, 2, 2, 3, 3], passive: [{ unit: u, count: 2, every: 9 }, { unit: u, count: 2, every: 9 }] }; } },
  ansturm:     { name: 'Überleben',       short: 'Überleben', deck: 'eigen', own: true, text: 'Wellen ohne Ende in Etappen: Themen, Elite-Gegner, Bosse – und nach jeder zweiten Welle ein Segen deiner Wahl.' },
};
export const EVENT_IDS = Object.keys(EVENTS);
export const eventName = id => (EVENTS[id] ? EVENTS[id].name : id === 'rang' ? 'Rangliste' : SERIES[id] ? SERIES[id].name : P.MODES[id] ? P.MODES[id].name : 'Kampf');
// Truppe des Tages im Truppenansturm: eine billige Bodentruppe, die der Spieler schon kennt
const RUSH = ['wicht', 'kiesel', 'dornwerfer', 'raeuber', 'nachtfalter'];
export function rushUnit(p, day) { const ok = RUSH.filter(u => UNITS[u]); return ok[hash('rush' + day) % ok.length] || 'wicht'; }

// Wechsel wie im Vorbild: jeden Tag ein Modus des Tages (mit Bonus beim ersten Sieg), jede Woche ein Wochenereignis als Serie
export const eventOfDay = day => EVENT_IDS[hash('tag' + day) % EVENT_IDS.length];
export const weekId = day => { const d = new Date(day + 'T12:00:00Z'), t = d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5; return new Date(t).toISOString().slice(0, 10); };   // Montag der Woche
const WEEK_EVENTS = EVENT_IDS.filter(id => !EVENTS[id].own);
export const eventOfWeek = day => WEEK_EVENTS[hash('woche' + weekId(day)) % WEEK_EVENTS.length];
// die drei Ereignisse, die heute neben dem Modus des Tages offen sind (wechseln täglich); der Rest ruht
export function eventsToday(day) {
  const top = eventOfDay(day), rest = EVENT_IDS.filter(id => id !== top && id !== 'ansturm');
  let s = hash('heute' + day) || 1;
  shuffle(rest, () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296));
  return [top, ...rest.slice(0, 5)];
}

// ---- Karten für die Wahl-Modi ---------------------------------------------------------------------------------------
// Wie im Vorbild sind Wiederholen und Abbilder in allen Wahl-Modi gesperrt; in der Dreierwahl dazu Helden und die zwei
// Karten, die dort zu stark wären (die teuerste Truppe und der Träger mit der großen Lunte).
const draftBan = id => CARDS[id].mirror || CARDS[id].clone;
const tripleBan = id => draftBan(id) || CARDS[id].hero || CARDS[id].cost >= 9 || (unitOf(id) && unitOf(id).deathDmg && unitOf(id).deathDmg.delay && unitOf(id).hp > 3000);
// Wert einer Karte für ein entstehendes Deck: der Computer wählt damit; hält Zauber, Gebäude, Flugabwehr und Kosten im Rahmen
export function pickValue(deck, id, rnd = Math.random) {
  const c = CARDS[id], u = unitOf(id), n = t => deck.filter(x => CARDS[x].type === t).length;
  let v = 1 + rnd() * 1.2;
  if (c.type === 'spell') v += n('spell') < 2 ? 1.6 : -3;
  if (c.type === 'building') v += n('building') < 1 ? 0.6 : -2.5;
  if (u && u.hitsAir && deck.filter(x => unitOf(x) && unitOf(x).hitsAir).length < 2) v += 1.4;
  if (u && u.targets === 'buildings' && !deck.some(x => unitOf(x) && unitOf(x).targets === 'buildings')) v += 1.3;
  if (c.hero) v += deck.filter(x => CARDS[x].hero).length < 2 ? 0.8 : -5;
  const cost = [...deck, id].reduce((s, x) => s + CARDS[x].cost, 0) / (deck.length + 1);
  return v - Math.abs(cost - 3.8) * 0.9;
}
const best = (deck, ids, rnd) => ids.reduce((a, b) => (pickValue(deck, b, rnd) > pickValue(deck, a, rnd) ? b : a));

// Dreierwahl: je acht Dreiergruppen für beide Seiten (48 verschiedene Karten)
export function tripleSets(rnd) {
  const ids = shuffle(CARD_IDS.filter(id => !tripleBan(id)), rnd);
  const mk = o => Array.from({ length: 8 }, (_, i) => ids.slice(o + i * 3, o + i * 3 + 3));
  return { mine: mk(0), foe: mk(24) };
}
export function tripleDecks(sets, picks, rnd) {
  const mine = sets.mine.map((t, i) => t[clamp(picks[i] | 0, 0, 2)]), foe = [];
  for (const t of sets.foe) foe.push(best(foe, t, rnd));
  return [mine, foe];
}
// Große Auswahl: 36 offene Karten (genug Zauber, Gebäude und Flugabwehr für zwei Decks), dazu die Reihenfolge der Wahl:
// einer beginnt mit einer Karte, dann immer zwei, der Beginner nimmt die letzte.
export function megaPool(rnd) {
  const ok = shuffle(CARD_IDS.filter(id => !draftBan(id)), rnd), take = (f, n) => ok.filter(f).slice(0, n);
  const spells = take(id => CARDS[id].type === 'spell', 7), builds = take(id => CARDS[id].type === 'building', 4);
  const heroes = take(id => CARDS[id].hero, Math.min(4, MAX_HEROES + 1)), air = take(id => CARDS[id].type === 'troop' && !CARDS[id].hero && unitOf(id).hitsAir, 8);
  const got = new Set([...spells, ...builds, ...heroes, ...air]);
  const rest = ok.filter(id => !got.has(id) && CARDS[id].type === 'troop' && !CARDS[id].hero).slice(0, 36 - got.size);
  return shuffle([...got, ...rest], rnd);
}
export const megaOrder = first => { const a = first ? 0 : 1, b = 1 - a, o = [a]; for (let i = 0; i < 7; i++) o.push(i % 2 ? a : b, i % 2 ? a : b); o.push(a); return o; };   // 16 Züge: wer wählt wann (0 = Spieler)
export function megaAiPick(pool, taken, deck, rnd) {
  const free = pool.filter(id => !taken.includes(id) && (!CARDS[id].hero || deck.filter(x => CARDS[x].hero).length < 2));
  return free.length ? best(deck, free, rnd) : pool.find(id => !taken.includes(id));
}
// Spiegelkampf: ein zufälliges, spielbares Deck für beide – immer mit dem Widerhall, wenn es ihn gibt
export function mirrorDeck(rnd) {
  const deck = [], pool = shuffle(CARD_IDS.filter(id => !CARDS[id].mirror && !CARDS[id].hero), rnd);
  const echo = CARD_IDS.find(id => CARDS[id].mirror);
  if (echo) deck.push(echo);
  while (deck.length < 8) { const cand = pool.filter(id => !deck.includes(id)).slice(0, 6); deck.push(best(deck, cand, rnd)); }
  return deck;
}
// Fertige Decks: das Startdeck und die Decks der Arenawächter, soweit ihre Karten erlaubt sind
export function builtDecks(rnd) {
  const all = shuffle([DEFAULT_DECK, ...P.BOSSES.map(b => b.deck)].filter(d => d.every(id => CARDS[id])), rnd);
  return [[...all[0]], [...all[1 % all.length]]];
}

// ---- Stand im Spielstand ------------------------------------------------------------------------------------------------
const num = (v, d = 0) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : d);
export function state(p) {
  const r = p.modi && typeof p.modi === 'object' ? p.modi : {}, ser = r.ser && typeof r.ser === 'object' ? r.ser : {}, k = r.rank && typeof r.rank === 'object' ? r.rank : {};
  const run = x => (x && typeof x === 'object' ? { w: clamp(num(x.w), 0, 99), l: clamp(num(x.l), 0, 9), ...(x.week ? { week: String(x.week).slice(0, 10), mode: EVENTS[x.mode] ? x.mode : 'doppelt' } : {}) } : null);
  if (!p.modi || !p.modi.ok) p.modi = {
    ok: 1, ser: Object.fromEntries(Object.keys(SERIES).map(id => [id, run(ser[id])])),
    week: typeof r.week === 'string' ? r.week.slice(0, 10) : '', weekGot: (Array.isArray(r.weekGot) ? r.weekGot : []).filter(n => Number.isInteger(n)), weekFree: !!r.weekFree,
    best: { klassisch: num(r.best && r.best.klassisch), gross: num(r.best && r.best.gross), woche: num(r.best && r.best.woche) },
    rank: { season: typeof k.season === 'string' ? k.season.slice(0, 8) : '', league: clamp(num(k.league), 0, LEAGUES.length - 1), step: num(k.step), last: clamp(num(k.last), 0, LEAGUES.length - 1), top: clamp(num(k.top), 0, LEAGUES.length - 1),
      rating: num(k.rating), w: num(k.w), l: num(k.l), got: (Array.isArray(k.got) ? k.got : []).filter(n => Number.isInteger(n) && n > 0 && n < LEAGUES.length), sgot: (Array.isArray(k.sgot) ? k.sgot : []).filter(n => Number.isInteger(n) && n >= 0 && n < LEAGUES.length) },
  };
  return p.modi;
}

// ---- Serien: Herausforderungen bis 12 Siege oder 3 Niederlagen -----------------------------------------------------------
// fee: Eintritt in Runensplittern (wie im Vorbild 10 und 100). Die Belohnung wächst mit jedem Sieg (ladder[Siege] = Liste von Belohnungen);
// sie wird am Ende der Serie ausgezahlt – auch ohne Sieg gibt es den Grundpreis.
export const SERIES_WINS = 12, SERIES_LOSSES = 3;
const G1 = { t: 'gold', crate: 1 }, G4 = { t: 'gold', crate: 4 }, L = s => ({ t: 'lucky', s }), J = (r, n) => ({ t: 'jk', r, n, grow: true });
const LADDER = [[G1], [G1, J('gewoehnlich', 4)], [G1, J('gewoehnlich', 8)], [G4], [G4, J('gewoehnlich', 10)], [G4, J('selten', 3)], [G4, L(2)], [G4, L(2), J('selten', 4)],
  [G4, G1, L(3)], [G4, G4, L(3)], [G4, G4, L(3), J('episch', 2)], [G4, G4, L(4), J('episch', 3)], [G4, G4, G4, L(5), J('episch', 4), { t: 'gems', n: 20 }]];
const GRAND = LADDER.map((r, w) => [...r, ...r, w >= 4 ? L(Math.min(5, 2 + Math.floor(w / 3))) : G4, ...(w >= 8 ? [{ t: 'gems', n: w * 10 }] : []), ...(w === 12 ? [{ t: 'runebox' }, { t: 'hero', n: 40 }] : [])]);
export const SERIES = {
  klassisch: { name: 'Klassische Herausforderung', fee: 10, ladder: LADDER, text: 'Dein Deck, gleiche Stufe für beide. Zwölf Siege sind das Ziel – nach der dritten Niederlage ist Schluss.' },
  gross:     { name: 'Große Herausforderung',      fee: 100, ladder: GRAND, text: 'Wie die klassische, aber mit hohem Einsatz und großem Preis. Die Gegner sind von Anfang an stärker.' },
  woche:     { name: 'Wochenereignis',             fee: 0, refee: 10, ladder: LADDER.map(r => r.slice(0, 1)), text: 'Jede Woche ein anderer Modus als Serie. Der erste Versuch ist frei; besondere Siegzahlen bringen einmalige Belohnungen.' },
};
// Wochenereignis: einmalige Belohnungen bei diesen Siegzahlen (je Woche)
export const WEEK_ONCE = [{ at: 2, r: G4 }, { at: 4, r: L(2) }, { at: 6, r: { t: 'gems', n: 15 } }, { at: 8, r: L(3) }, { at: 10, r: { t: 'wild', n: 1 } }, { at: 12, r: L(5) }];
function weekCheck(p, day) { const m = state(p), w = weekId(day); if (m.week !== w) { m.week = w; m.weekGot = []; m.weekFree = false; m.ser.woche = null; } return m; }
export function seriesInfo(p, id, day) {
  const m = weekCheck(p, day), S = SERIES[id], run = m.ser[id], mode = id === 'woche' ? eventOfWeek(day) : '';
  const fee = id === 'woche' ? (m.weekFree ? S.refee : 0) : S.fee, done = !!run && (run.w >= SERIES_WINS || run.l >= SERIES_LOSSES);
  return { id, name: id === 'woche' ? `Wochenereignis: ${EVENTS[mode].name}` : S.name, text: S.text, mode, fee, can: !run && p.gems >= fee, run, done, wins: run ? run.w : 0, losses: run ? run.l : 0, best: m.best[id] || 0,
    prize: S.ladder[run ? Math.min(run.w, SERIES_WINS) : 0], next: run && !done && run.w < SERIES_WINS ? S.ladder[run.w + 1] : null, top: S.ladder[SERIES_WINS],
    once: id === 'woche' ? WEEK_ONCE.map(o => ({ ...o, reached: !!run && run.w >= o.at, got: m.weekGot.includes(o.at) })) : [] };
}
export function seriesEnter(p, id, day) {
  const i = seriesInfo(p, id, day), m = state(p);
  if (!i.can) return false;
  p.gems -= i.fee;
  m.ser[id] = { w: 0, l: 0, ...(id === 'woche' ? { week: m.week, mode: i.mode } : {}) };
  if (id === 'woche') m.weekFree = true;
  return true;
}
// Ergebnis eines Kampfs der Serie; ein Unentschieden zählt nicht. Gibt den neuen Stand zurück.
export function seriesResult(p, id, winner, day) {
  const m = weekCheck(p, day), run = m.ser[id];
  if (!run || run.w >= SERIES_WINS || run.l >= SERIES_LOSSES) return null;
  if (winner === 0) run.w++; else if (winner === 1) run.l++;
  m.best[id] = Math.max(m.best[id] || 0, run.w);
  return seriesInfo(p, id, day);
}
// Serie beenden und den Preis auszahlen (jederzeit möglich; nach 12 Siegen oder 3 Niederlagen der einzige Weg weiter)
export function seriesClaim(p, id, day, grant, rnd = Math.random) {
  const m = weekCheck(p, day), run = m.ser[id];
  if (!run) return null;
  const list = SERIES[id].ladder[Math.min(run.w, SERIES_WINS)];
  m.ser[id] = null;
  return list.map(r => ({ r, loot: grant(p, r, rnd) }));
}
export function weekClaim(p, at, day, grant, rnd = Math.random) {
  const m = weekCheck(p, day), o = WEEK_ONCE.find(x => x.at === at), run = m.ser.woche;
  if (!o || m.weekGot.includes(at) || !(run ? run.w >= at : false)) return null;
  m.weekGot.push(at);
  return grant(p, o.r, rnd);
}
// Gegner in einer Serie: mit jedem Sieg stärker, wie im Vorbild (dort trifft man Spieler mit gleich vielen Siegen)
export const seriesAi = (id, wins) => (id === 'gross' ? (wins < 3 ? 'mittel' : 'schwer') : wins < 3 ? 'leicht' : wins < 8 ? 'mittel' : 'schwer');

// ---- Rangliste: Ligen und Stufen -------------------------------------------------------------------------------------------
// Wie im Vorbild (Stand 2025): drei Ligen mit je 11 Stufen und goldenen Stufen (jede fünfte, sechste, siebte), drei mit je 10 Stufen
// ohne goldene, dann die oberste Liga mit Wertung. Sieg: eine Stufe hinauf. Niederlage: eine hinab – außer man steht auf einer
// goldenen Stufe oder am Fuß der Liga (aus einer Liga steigt man nie ab). Unentschieden: nichts. Am Monatsanfang beginnen alle
// unten; wer letzte Saison höher stand, steigt mit jedem Sieg mehrere Stufen (boost), bis er wieder dort ist.
export const LEAGUES = [
  { name: 'Furtwacht',     steps: 11, gold: 5, boost: 4, season: G1 },
  { name: 'Steinbund',     steps: 11, gold: 6, boost: 5, once: G4, season: J('gewoehnlich', 20) },
  { name: 'Eisenbund',     steps: 11, gold: 7, boost: 6, once: L(3), season: J('selten', 8) },
  { name: 'Runenliga',     steps: 10, gold: 0, boost: 7, once: G4, season: G4 },
  { name: 'Sternenliga',   steps: 10, gold: 0, boost: 8, once: L(4), season: J('episch', 3) },
  { name: 'Königsliga',    steps: 10, gold: 0, boost: 9, once: { t: 'runebox' }, season: { t: 'jk', r: 'legendaer', n: 1 } },
  { name: 'Ewige Liga',    steps: 0,  gold: 0, boost: 10, once: L(5), season: { t: 'hero', n: 30 } },
];
export const RANK_ARENA = 6;   // offen ab der siebten Arena (im Vorbild erst am Ende des Trophäenwegs; hier früher, damit es etwas zu erspielen gibt)
export const rankOpen = p => P.arenaIndex(Math.max(p.best || 0, p.trophies || 0)) >= RANK_ARENA;
export const isGolden = (league, step) => step === 0 || (LEAGUES[league].gold > 0 && step % LEAGUES[league].gold === 0);
function rankSeason(p) {
  const k = state(p).rank, id = p.season ? p.season.id : '';
  if (k.season !== id) { if (k.season) k.last = k.league; k.season = id; k.league = 0; k.step = 0; k.sgot = []; k.rating = 0; k.w = 0; k.l = 0; }
  return k;
}
export function rankInfo(p) {
  const k = rankSeason(p), Lg = LEAGUES[k.league], top = k.league === LEAGUES.length - 1;
  return { open: rankOpen(p), league: k.league, name: Lg.name, step: k.step, steps: Lg.steps, top, rating: k.rating, golden: Array.from({ length: Lg.steps }, (_, i) => isGolden(k.league, i)), boost: k.league < k.last ? LEAGUES[k.last].boost : 1, last: k.last, best: k.top, w: k.w, l: k.l,
    once: LEAGUES.map((l, i) => (l.once ? { league: i, name: l.name, r: l.once, reached: k.top >= i, got: k.got.includes(i) } : null)).filter(Boolean),
    season: LEAGUES.map((l, i) => ({ league: i, name: l.name, r: l.season, reached: k.league >= i, got: k.sgot.includes(i) })) };
}
export function rankResult(p, winner) {
  const k = rankSeason(p), before = { league: k.league, step: k.step, rating: k.rating }, top = LEAGUES.length - 1;
  if (winner === 0) k.w++; else if (winner === 1) k.l++;
  if (k.league === top) {   // oberste Liga: nur noch die Wertung zählt
    if (winner === 0) k.rating += 30; else if (winner === 1) k.rating = Math.max(0, k.rating - 24);
  } else if (winner === 0) {
    k.step += k.league < k.last ? LEAGUES[k.last].boost : 1;
    while (k.league < top && k.step >= LEAGUES[k.league].steps) { k.step -= LEAGUES[k.league].steps; k.league++; if (k.league >= k.last) k.step = Math.min(k.step, 0); }
    if (k.league === top) { k.step = 0; if (!k.rating) k.rating = 1200 + Math.round(800 * k.w / Math.max(1, k.w + k.l)); }   // Startwertung nach der Siegquote: 1200 bis 2000
  } else if (winner === 1 && !isGolden(k.league, k.step)) k.step--;
  k.top = Math.max(k.top, k.league);
  return { before, league: k.league, step: k.step, rating: k.rating, up: k.league > before.league, held: winner === 1 && k.step === before.step && k.league !== top };
}
export function rankClaim(p, kind, league, grant, rnd = Math.random) {
  const k = rankSeason(p), Lg = LEAGUES[league], list = kind === 'once' ? k.got : k.sgot, r = Lg && (kind === 'once' ? Lg.once : Lg.season);
  if (!r || list.includes(league) || (kind === 'once' ? k.top : k.league) < league) return null;
  list.push(league);
  return grant(p, r, rnd);
}
export const rankAi = league => (league < 1 ? 'mittel' : 'schwer');
// Stufe der Gegner: die übliche der Arena, in höheren Ligen bis zu drei Stufen darüber (nie über der Höchststufe)
export function rankLevels(p, league) {
  const l = P.opponentLevels(p, 'mittel'), lvl = Math.min(P.MAX_LEVEL, l.lvl + Math.min(3, Math.floor(league / 2)));
  return { ...l, cards: Object.fromEntries(CARD_IDS.map(id => [id, Math.max(P.startLevel(id), lvl)])), tower: lvl, lvl };   // keine Karte unter der Startstufe ihrer Seltenheit
}
export const openCount = (p, day) => { const m = weekCheck(p, day); let n = 0; for (const id of Object.keys(SERIES)) { const i = seriesInfo(p, id, day); if (i.done) n++; n += i.once.filter(o => o.reached && !o.got).length; } if (rankOpen(p)) { const r = rankInfo(p); n += r.once.filter(o => o.reached && !o.got).length + r.season.filter(o => o.reached && !o.got).length; } void m; return n; };

// ---- Kampfaufbau: was ein Modus für startBattle bedeutet -------------------------------------------------------------------
// opts: { mode, decks?, series?, ranked? } · gibt { rules, decks, even, ai, label, order } zurück (null = main.js macht es wie bisher)
export function battle(p, opts, day, rnd) {
  const id = opts.series ? (opts.series === 'woche' ? seriesInfo(p, 'woche', day).mode : '') : opts.mode, E = EVENTS[id];
  const out = { rules: null, decks: null, even: false, ai: null, label: '', order: false, levels: null };
  if (opts.ranked) { const r = rankInfo(p); out.ai = rankAi(r.league); out.levels = rankLevels(p, r.league); out.label = r.name; return out; }
  if (opts.series) { const i = seriesInfo(p, opts.series, day); out.ai = seriesAi(opts.series, i.wins); out.even = true; out.label = opts.series === 'woche' ? EVENTS[id].short : opts.series === 'gross' ? 'Große Serie' : 'Serie'; }
  if (!E) return opts.series ? out : null;
  if (E.own) return null;
  out.rules = E.rules ? E.rules(p, day) : {};
  out.even = out.even || !!E.even; out.label = out.label || E.short;
  if (opts.decks) { out.decks = opts.decks; out.order = true; }
  else if (E.deck === 'spiegel') { const d = mirrorDeck(rnd); out.decks = [d, [...d]]; out.order = false; }
  else if (E.deck === 'fertig') { out.decks = builtDecks(rnd); out.order = true; }
  return out;
}
