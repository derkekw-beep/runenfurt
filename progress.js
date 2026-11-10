// Fortschritt: Trophäen, Arenen, Kartenstufen, Gold, Runensplitter, Sonderdinge (Joker je Seltenheit, Runenscherben,
// Wanderscherben, Stärkungstränke, Furtmarken), Schicksalstruhen, Tagessiege, Runenpfad (Saison), Trophäenweg,
// Sammlungsstufe, Kartenmeisterschaft, Tagesaufgaben, Laden und Saisonmarkt.
// Reine Funktionen auf einem Profil-Objekt (kein Browser, keine Uhr – Tag und Uhrzeit werden von außen hereingereicht).
// Aufbau wie im Genre seit 2025/26 üblich (siehe FORTSCHRITT-VORBILD.md): keine Truhen mit Wartezeit mehr, sondern
// Schicksalstruhen für die ersten Siege des Tages; jede Krone füllt den Runenpfad der Saison (Kalendermonat);
// Trophäen öffnen Arenen, Arenen schalten Karten frei, doppelte Karten + Gold heben die Kartenstufe.
import * as C from './cards.js';
import { HERO_FORMS, HERO_FORM_IDS } from './helden.js';
import { CARDS, UNITS, RUNES, RUNE_LEVEL, CARD_IDS, TOWER_IDS, DEFAULT_TOWER, DEFAULT_DECK, MAX_HEROES, heroCount, sanitizeDeck } from './cards.js';

// ---- Seltenheit --------------------------------------------------------------------------------
// Jede Karte hat eine Seltenheit (Zuordnung in cards.js). Seltenere Karten brauchen weniger Kopien je Stufe, liegen dafür
// seltener und in kleineren Stapeln in den Truhen; ein Joker ist bei ihnen weniger wert. Gold und Erfahrung je Stufe sind gleich.
export const RARITIES = ['gewoehnlich', 'selten', 'episch', 'legendaer', 'held'];
export const RARITY_NAME = { gewoehnlich: 'Gewöhnlich', selten: 'Selten', episch: 'Episch', legendaer: 'Legendär', held: 'Held' };
export const rarity = id => (C.RARITY && C.RARITY[id]) || (CARDS[id] && CARDS[id].hero ? 'held' : 'gewoehnlich');
// Kopien für die Aufwertung von Stufe n auf n+1 (Index n-1) – die Reihen des Genres, jeweils ab der ersten Stufe der Seltenheit
export const UP_COPIES_BY = {
  gewoehnlich: [2, 4, 10, 20, 50, 100, 200, 400],
  selten:      [1, 2, 4, 10, 20, 50, 100, 200],
  episch:      [1, 2, 4, 10, 20, 30, 50, 70],
  legendaer:   [1, 2, 4, 6, 9, 12, 14, 20],
  held:        [1, 2, 4, 6, 9, 12, 14, 20],
};
export const COPY_VALUE = { gewoehnlich: 1, selten: 2, episch: 4, legendaer: 10, held: 10 };     // so viele gewöhnliche Kopien (und Joker) ist eine Kopie wert
export const CHEST_WEIGHT = { gewoehnlich: 1, selten: 0.8, episch: 0.55, legendaer: 0.3, held: 0.3 }; // Gewicht beim Auswürfeln eines Stapels
export const copiesFor = (id, lvl) => UP_COPIES_BY[rarity(id)][lvl - 1] || 0;

// ---- Runenformen verdienen -----------------------------------------------------------------------
// Eine Runenform wird aus sechs Runenscherben ihrer Karte erweckt. Scherben liegen in größeren Truhen (für eine zufällige
// eigene Karte mit Runenform), Wanderscherben passen auf jede Karte: Trophäenweg, alle drei Tagesaufgaben, Bosse, Laden.
export const RUNE_SHARDS = 6;
export const SHARD_CHANCE = { sieg: 0.06, eisen: 0.2, riesen: 1, runen: 1, kronen: 0.25, holz: 0.1, frei: 0 }; // Chance je alter Truhe (Runentruhe: zwei Scherben)
export const WILD_PRICE = 30;       // Runensplitter für eine Wanderscherbe im Laden (eine am Tag)
export const WILD_CAP = 6;          // mehr Wanderscherben lassen sich nicht kaufen (geschenkte gehen darüber hinaus)
export const RUNE_LEVEL_SHARDS = 2; // Scherben, wenn die Karte Stufe RUNE_LEVEL erreicht
// Joker gibt es je Seltenheit: einer ersetzt eine fehlende Kopie einer Karte dieser Seltenheit. Ist der Vorrat schon voll,
// wird ein neuer Joker zu einer Kopie einer zufälligen eigenen Karte dieser Seltenheit (oder zu Gold).
export const JOKER_CAP = { gewoehnlich: 100, selten: 40, episch: 15, legendaer: 4, held: 2 }; // in Arena 1; wächst mit der Arena wie die Beute
export const jokerCap = (p, rar) => Math.round(JOKER_CAP[rar] * (1 + 0.35 * p.arena));
export const JOKER_NAME = { gewoehnlich: 'Gewöhnlicher Joker', selten: 'Seltener Joker', episch: 'Epischer Joker', legendaer: 'Legendärer Joker', held: 'Heldenjoker' };
export const POTION_CAP = 8, POTION_HOURS = 3, POTION_PRICE = 12; // Stärkungstrank: hebt eine Karte drei Stunden lang auf die Stufe des Hauptturms


export const ARENAS = [
  { name: 'Moosgrund',      at: 0,    unlock: [...DEFAULT_DECK, DEFAULT_TOWER, 'kieseltrio', 'flussraeuber', 'wueterich'] },
  { name: 'Kieselfurt',     at: 300,  unlock: ['eisenwaechter', 'hagelschauer', 'glutling', 'eisenmarschall', 'dornwerfer', 'geschuetzturm', 'frostling', 'kieselhaufen', 'wurzelrotte', 'eiswurf'] },
  { name: 'Nebelhain',      at: 600,  unlock: ['nebelrochen', 'erdloch', 'bolzenschuetzin', 'funkenschlag', 'nachtfalter', 'flugsamen', 'segelwicht', 'rochenbrut', 'funkling'] },
  { name: 'Eisenklamm',     at: 1000, unlock: ['hammerschmied', 'wurzelgriff', 'klingentaenzerin', 'zuendler', 'schildknappen', 'klingenturm', 'distelritter', 'funkenpfahl', 'stammlaeufer', 'hohlstamm'] },
  { name: 'Sturmhöhe',      at: 1300, unlock: ['torknacker', 'heilquell', 'frostschamane', 'eisbrocken', 'kesselturm', 'tauling', 'zitterlinge', 'muehlenbande', 'wolfszwinger'] },
  { name: 'Glutkessel',     at: 1600, unlock: ['kieselbande', 'steinschleuder', 'sturmrufer', 'glutofen', 'sprengkaefer', 'segensturm', 'pulverwicht', 'raeuberlager', 'knallfrosch', 'bodengrollen'] },
  { name: 'Sternwarte',     at: 2000, unlock: ['wurzelmutter', 'hornbulle', 'kriegstrommel', 'rollstein', 'blasrohrwicht', 'keilerrotte', 'grenzwache', 'wachkiste', 'splitterjaeger'] },
  { name: 'Runenthron',     at: 2300, unlock: ['erzritter', 'donnerkaefer', 'sumpfdunst', 'panzerhornisse', 'wichtwurf', 'sturmbrueder', 'astriese', 'falterhueterin', 'widerhall'] },
  { name: 'Frostzinnen',    at: 2600, unlock: ['frostnacht', 'feldheilerin', 'wuehler', 'weitschuetzin', 'wegelagerin', 'seilwerfer', 'armbrustwagen', 'maulwurfshuegel'] },
  { name: 'Schattenmoor',   at: 3000, unlock: ['nebelschleicher', 'schattenjaegerin', 'kraehenschwarm', 'wirbelwind', 'wanderbusch', 'fluchweberin', 'wurzelfluch', 'geroellfeld'] },
  { name: 'Donnerschlucht', at: 3400, unlock: ['blitzfaenger', 'gewitterkarren', 'donnerkeil', 'fernschleuder', 'gewitterrochen', 'dornenkoloss', 'kurbelbogen', 'schuetzenbund'] },
  { name: 'Kristallgrotte', at: 3800, unlock: ['sternschuetzin', 'laternenfisch', 'sonnenspiegel', 'kraftquell', 'sichelwerfer', 'runenhuene', 'trugbild', 'sternenschlund', 'jungfuerst'] },
  { name: 'Aschenfeld',     at: 4200, unlock: ['fasstraeger', 'trommelschlaeger', 'kegler', 'felssturz', 'wurzelkoenig', 'aschenschwinge', 'glutfalke', 'stelzenkessel', 'kraftkloss', 'stollenmeister'] },
  { name: 'Himmelsbrücke',  at: 4600, unlock: ['panzerbaer', 'basaltriese', 'brockenwerfer', 'windlaeufer', 'rankenreiterin', 'flussmoench'] },
];
export const MAX_LEVEL = 9;
// Aufwertung von Stufe n auf n+1: Index n-1
export const UP_COPIES = [2, 4, 10, 20, 50, 100, 200, 400];
export const UP_GOLD = [5, 20, 50, 150, 400, 1000, 2000, 4000];
export const UP_XP = [4, 5, 6, 10, 25, 50, 100, 200];
export const LEVEL_XP = [20, 50, 100, 200, 400, 800, 1600, 3200]; // Erfahrung für Spielerstufe 2, 3, …
export const TROPHY = { leicht: [24, -16], mittel: [30, -22], schwer: [36, -28] };
export const DECK_SLOTS = 3;
const MIN = 60000;
// Alte Truhenarten. Truhen mit Wartezeit gibt es nicht mehr (wie im Vorbild seit 2025); die Arten leben weiter als
// Bosstruhe und als Truhen im Truhenlager alter Spielstände. size streckt den Inhalt, cardF/goldF verschieben ihn zu
// Karten oder Gold, stacks = Zahl der Kartenstapel, bonus = Runensplitter obendrauf.
export const CHESTS = {
  holz:   { name: 'Holztruhe',   size: 1.5 },
  eisen:  { name: 'Eisentruhe',  size: 2.4 },
  riesen: { name: 'Riesentruhe', size: 5, cardF: 1.4, goldF: 0.6, stacks: 6 },
  runen:  { name: 'Runentruhe',  size: 5, bonus: 8 },
  sieg:   { name: 'Siegestruhe', size: 1.2 },
  frei:   { name: 'Freie Truhe', size: 0.5 },
  kronen: { name: 'Kronentruhe', size: 2 },
};
export const QUALITIES = ['hoch', 'mittel', 'niedrig'];

// ---- Tagessiege ------------------------------------------------------------------------------------
// Die ersten vier Siege des Tages bringen je eine Schicksalstruhe (die erste beginnt mit zwei Funken), die ersten 25
// eine kleine Siegprämie (Gold oder ein Kartenstapel), die ersten drei dazu Bonuskronen für den Runenpfad.
export const DAY_CHESTS = [2, 1, 1, 1];
export const DAY_PRIZES = 25;
export const BONUS_CROWNS = 5, BONUS_WINS = 3;

// ---- Saison und Runenpfad ----------------------------------------------------------------------------
// Eine Saison ist ein Kalendermonat nach der Uhr des Geräts. Jede Krone aus einem Kampf füllt den Runenpfad: 90 Stufen
// mit zwei Spuren. Die Wegspur ist frei, die Runenspur schaltet man je Saison mit Runensplittern frei (die Wegspur
// bringt genau diesen Preis wieder ein). Danach füllen weitere Kronen den Kronenspeicher.
export const PASS_TIERS = 90, PASS_CROWNS = 10;
export const PASS_PRICE = 100;   // Runensplitter für die Runenspur einer Saison
export const PASS_SKIP = 10;     // Runensplitter, um die laufende Stufe sofort abzuschließen
export const BANK_CROWNS = 20;   // Kronenspeicher: je 20 Kronen eine Schicksalstruhe, eine am Tag abholbar
const MONTHS = ['Eismond', 'Taumond', 'Saatmond', 'Knospenmond', 'Blütenmond', 'Sonnenmond', 'Heumond', 'Erntemond', 'Nebelmond', 'Laubmond', 'Sturmmond', 'Julmond'];
export const seasonId = day => String(day || '').slice(0, 7);
export const seasonName = id => { const m = Number(String(id).slice(5, 7)); return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${String(id).slice(0, 4)}` : 'Saison'; };
// Tage bis zum Saisonende (einschließlich heute)
export const seasonLeft = day => { const [y, m, d] = String(day).split('-').map(Number); return y && m && d ? new Date(y, m, 0).getDate() - d + 1 : 0; };

const num = (v, def) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : def);
const newStats = () => ({ crowns: 0, three: 0, streak: 0, bestStreak: 0, cards: 0, spells: 0, abilities: 0, played: {} });
const newSet = () => ({ volume: 0.8, quality: 'hoch', fps: false, lefty: false, shake: true });
const newJokers = () => ({ gewoehnlich: 0, selten: 0, episch: 0, legendaer: 0, held: 0 });
const newSeason = (id = '') => ({ id, crowns: 0, free: [], rune: [], open: false, bank: 0, bankDay: '', marks: 0, spent: 0, market: {} });

export function newProfile() {
  const cards = {};
  for (const id of ARENAS[0].unlock) cards[id] = { lvl: 1, n: 0 };
  const decks = Array.from({ length: DECK_SLOTS }, () => [...DEFAULT_DECK]);
  return {
    v: 2, trophies: 0, best: 0, arena: 0, gold: 0, gems: 0, xp: 0, cards, decks, slot: 0, deck: decks[0], level: 'leicht', sound: true,
    wins: 0, losses: 0, draws: 0, seenHelp: false, name: 'Runenwächter', set: newSet(), stats: newStats(), log: [],
    runes: {}, wild: 0, road: [], day: '', quests: [], shop: { bought: [], gift: false }, wish: '', bosses: [], modeDay: '', towerSel: DEFAULT_TOWER,
    jk: newJokers(), potions: 0, boosts: {}, stash: [], dayWins: 0, modeWins: 0, season: newSeason(), coll: [], mast: {}, note: null, slots: 1, heroCoins: 0, forms: {},
  };
}

// Alte Joker (einer für alles, gezählt in gewöhnlichen Kopien) gleichwertig auf die Seltenheiten verteilen: die Hälfte
// bleibt gewöhnlich, der Rest wird nach Wert zu seltenen, epischen und legendären Jokern – nur für Seltenheiten, von
// denen der Spieler Karten hat. Was nicht aufgeht, bleibt gewöhnlich.
export function splitJokers(p, n) {
  const out = newJokers(), has = r => Object.keys(p.cards).some(id => rarity(id) === r);
  let rest = n;
  for (const [r, share] of [['legendaer', 0.1], ['episch', 0.15], ['selten', 0.25]]) {
    if (!has(r)) continue;
    const k = Math.floor((n * share) / COPY_VALUE[r]);
    out[r] = k; rest -= k * COPY_VALUE[r];
  }
  out.gewoehnlich = Math.max(0, rest);
  return out;
}

// Gespeichertes Profil prüfen und fehlende Felder ergänzen (nie abstürzen, wenn der Speicher beschädigt ist).
export function loadProfile(raw) {
  const p = newProfile();
  let d = null;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { d = null; }
  if (!d || typeof d !== 'object') return p;
  p.trophies = num(d.trophies, 0); p.best = Math.max(num(d.best, 0), p.trophies); p.gold = num(d.gold, 0); p.gems = num(d.gems, 0); p.xp = num(d.xp, 0);
  p.wins = num(d.wins, 0); p.losses = num(d.losses, 0); p.draws = num(d.draws, 0);
  p.arena = Math.min(ARENAS.length - 1, Math.max(num(d.arena, 0), arenaIndex(p.best)));
  if (TROPHY[d.level]) p.level = d.level;
  p.sound = d.sound !== false; p.seenHelp = !!d.seenHelp;
  if (typeof d.name === 'string' && d.name.trim()) p.name = d.name.trim().slice(0, 16);
  for (const id of unlockedIds(p)) {
    const c = d.cards && d.cards[id];
    p.cards[id] = { lvl: Math.min(MAX_LEVEL, Math.max(1, num(c && c.lvl, 1))), n: num(c && c.n, 0) };
  }
  const fix = list => {
    const out = sanitizeDeck((Array.isArray(list) ? list : []).filter(id => p.cards[id])).filter(id => p.cards[id]);
    for (const id of DEFAULT_DECK) if (out.length < 8 && !out.includes(id)) out.push(id);
    return out;
  };
  const src = Array.isArray(d.decks) ? d.decks : [d.deck];
  p.decks = Array.from({ length: DECK_SLOTS }, (_, i) => fix(src[i] || (i === 0 ? d.deck : null)));
  p.slot = Math.min(DECK_SLOTS - 1, num(d.slot, 0));
  p.deck = p.decks[p.slot];
  const s = d.set || {};
  if (Number.isFinite(s.volume)) p.set.volume = Math.min(1, Math.max(0, s.volume));
  if (QUALITIES.includes(s.quality)) p.set.quality = s.quality;
  p.set.fps = !!s.fps; p.set.lefty = !!s.lefty; p.set.shake = s.shake !== false;
  const st = d.stats || {};
  for (const k of ['crowns', 'three', 'streak', 'bestStreak', 'cards', 'spells', 'abilities']) p.stats[k] = num(st[k], 0);
  if (st.played && typeof st.played === 'object') for (const id of CARD_IDS) if (num(st.played[id], 0)) p.stats.played[id] = num(st.played[id], 0);
  if (Array.isArray(d.log)) p.log = d.log.filter(e => e && typeof e === 'object').slice(0, 12).map(e => ({ w: e.w === 0 || e.w === 1 ? e.w : 'draw', c: [num(e.c && e.c[0], 0), num(e.c && e.c[1], 0)], d: Number.isFinite(e.d) ? Math.round(e.d) : 0, lv: TROPHY[e.lv] ? e.lv : 'mittel', foe: typeof e.foe === 'string' ? e.foe.slice(0, 16) : '', t: num(e.t, 0) }));
  // Joker je Seltenheit; ein alter Spielstand mit einem einzigen Joker-Vorrat bekommt ihn gleichwertig aufgeteilt
  if (d.jk && typeof d.jk === 'object') for (const r of RARITIES) p.jk[r] = num(d.jk[r], 0);
  else if (num(d.jokers, 0)) p.jk = splitJokers(p, num(d.jokers, 0));
  // Runenformen: alte Spielstände kennen keine Scherben – wer die Form über die Kartenstufe schon hatte, behält sie
  if (d.runes && typeof d.runes === 'object') { for (const id of Object.keys(RUNES)) if (p.cards[id] && num(d.runes[id], 0)) p.runes[id] = Math.min(RUNE_SHARDS, num(d.runes[id], 0)); }
  else for (const id of Object.keys(RUNES)) if (p.cards[id] && p.cards[id].lvl >= RUNE_LEVEL) p.runes[id] = RUNE_SHARDS;
  p.wild = num(d.wild, 0);
  // Truhenlager: Truhen, die ein alter Spielstand noch auf Truhenplätzen liegen hatte, lassen sich sofort öffnen. Dazu
  // als Ersatz für die freie Truhe zwei Stück und für eine volle Kronentruhe eine; angefangene Kronen zählen für den Runenpfad.
  const stashOf = c => (c && typeof c === 'object' && CHESTS[c.k] ? { k: c.k, a: Math.min(p.arena, num(c.a, 0)) } : null);
  const fresh = !d.season || typeof d.season !== 'object'; // Spielstand von vor dem Umbau (oder ganz neu)
  if (Array.isArray(d.stash)) p.stash = d.stash.map(stashOf).filter(Boolean).slice(0, 40);
  else if (fresh) {
    if (Array.isArray(d.chests)) p.stash = d.chests.map(stashOf).filter(Boolean).slice(0, 8);
    if ('free' in d || 'chests' in d) p.stash.push({ k: 'frei', a: p.arena }, { k: 'frei', a: p.arena });
    for (let k = Math.floor(num(d.crownBox, 0) / 10); k > 0 && p.stash.length < 40; k--) p.stash.push({ k: 'kronen', a: p.arena });
  }
  const se = d.season;
  if (!fresh) {
    const tiers = list => [...new Set((Array.isArray(list) ? list : []).filter(n => Number.isInteger(n) && n >= 1 && n <= PASS_TIERS))];
    p.season = { id: typeof se.id === 'string' ? se.id.slice(0, 7) : '', crowns: Math.min(PASS_TIERS * PASS_CROWNS, num(se.crowns, 0)), free: tiers(se.free), rune: tiers(se.rune), open: !!se.open, bank: num(se.bank, 0), bankDay: typeof se.bankDay === 'string' ? se.bankDay.slice(0, 10) : '', marks: num(se.marks, 0), spent: num(se.spent, 0), market: {} };
    if (se.market && typeof se.market === 'object') MARKET.forEach((m, i) => { if (num(se.market[i], 0)) p.season.market[i] = Math.min(m.max, num(se.market[i], 0)); });
  } else p.season.crowns = num(d.crownBox, 0) % 10;
  p.potions = num(d.potions, 0); p.dayWins = num(d.dayWins, 0); p.modeWins = num(d.modeWins, 0);
  if (d.boosts && typeof d.boosts === 'object') for (const [id, t] of Object.entries(d.boosts)) if (p.cards[id] && num(t, 0)) p.boosts[id] = num(t, 0);
  if (Array.isArray(d.coll)) p.coll = [...new Set(d.coll.filter(n => Number.isInteger(n) && n > 0 && n % COLL_STEP === 0))];
  if (d.mast && typeof d.mast === 'object') for (const [id, n] of Object.entries(d.mast)) if (p.cards[id] && num(n, 0)) p.mast[id] = Math.min(MASTERY.length, num(n, 0));
  if (d.note && typeof d.note === 'object' && typeof d.note.id === 'string') p.note = { id: d.note.id.slice(0, 7), n: num(d.note.n, 0), gold: num(d.note.gold, 0), marks: num(d.note.marks, 0) };
  if (typeof d.wish === 'string' && p.cards[d.wish]) p.wish = d.wish;
  if (Array.isArray(d.bosses)) p.bosses = [...new Set(d.bosses.filter(i => Number.isInteger(i) && i >= 0 && i < BOSSES.length))];
  if (typeof d.modeDay === 'string') p.modeDay = d.modeDay.slice(0, 10);
  if (TOWER_IDS.includes(d.towerSel) && p.cards[d.towerSel]) p.towerSel = d.towerSel;
  if (Array.isArray(d.road)) p.road = [...new Set(d.road.filter(a => ROAD.some(r => r.at === a)))];
  if (typeof d.day === 'string') p.day = d.day.slice(0, 10);
  if (Array.isArray(d.quests)) p.quests = d.quests.filter(q => q && QUESTS[q.id]).slice(0, 3).map(q => ({ id: q.id, need: Math.max(1, num(q.need, 1)), have: num(q.have, 0), claimed: !!q.claimed }));
  if (d.shop && typeof d.shop === 'object') p.shop = { bought: Array.isArray(d.shop.bought) ? d.shop.bought.filter(i => Number.isInteger(i) && i >= 0 && i < 8) : [], gift: !!d.shop.gift, ...(d.shop.wild ? { wild: true } : {}) };
  if (d.questBonus === p.day && p.day) p.questBonus = p.day;
  p.heroCoins = num(d.heroCoins, 0);
  if (d.forms && typeof d.forms === 'object') for (const id of HERO_FORM_IDS) if (d.forms[id] && p.cards[id]) p.forms[id] = 1;
  // Deck-Plätze: Helden stehen nur noch auf ihren Plätzen (höchstens zwei). Beim ersten Laden eines älteren Spielstands rücken
  // außerdem Karten mit erweckter Runenform auf die Runenplätze, damit niemand seine Runenform sucht.
  const own = [...DEFAULT_DECK, ...Object.keys(p.cards)].filter(id => p.cards[id]);
  p.decks = p.decks.map(dk => slotOrder(dk, p.arena, { pool: own, runes: d.slots ? null : Object.keys(RUNES).filter(id => hasRune(p, id)) }));
  p.deck = p.decks[p.slot]; p.slots = 1;
  return p;
}

export const arenaIndex = trophies => { let i = 0; while (i + 1 < ARENAS.length && trophies >= ARENAS[i + 1].at) i++; return i; };
export const unlockedIds = p => ARENAS.slice(0, p.arena + 1).flatMap(a => a.unlock);
export const unlockArena = id => ARENAS.findIndex(a => a.unlock.includes(id));

export function playerLevel(xp) {
  let lvl = 1, rest = xp;
  while (lvl - 1 < LEVEL_XP.length && rest >= LEVEL_XP[lvl - 1]) { rest -= LEVEL_XP[lvl - 1]; lvl++; }
  return { lvl, xp: rest, need: LEVEL_XP[lvl - 1] || 0 };
}

export function upgradeInfo(p, id) {
  const c = p.cards[id];
  if (!c) return null;
  if (c.lvl >= MAX_LEVEL) return { max: true, can: false, copies: 0, gold: 0 };
  const copies = copiesFor(id, c.lvl), gold = UP_GOLD[c.lvl - 1];
  return { max: false, copies, gold, can: c.n >= copies && p.gold >= gold };
}

export function upgrade(p, id) {
  const info = upgradeInfo(p, id);
  if (!info || !info.can) return false;
  const c = p.cards[id], before = playerLevel(p.xp).lvl;
  c.n -= info.copies; p.gold -= info.gold; p.xp += UP_XP[c.lvl - 1]; c.lvl++;
  questProgress(p, 'aufwerten', 1);
  const levelUp = playerLevel(p.xp).lvl > before;
  if (levelUp) p.gems += 5;
  const shards = c.lvl === RUNE_LEVEL && RUNES[id] ? addShards(p, id, RUNE_LEVEL_SHARDS) : 0; // die Karte reift: zwei Runenscherben
  return shards ? { lvl: c.lvl, levelUp, shards } : { lvl: c.lvl, levelUp };
}

// Joker ersetzen fehlende Kopien beim Aufwerten – bei jeder Karte ihrer Seltenheit, einer je Kopie.
export function jokerInfo(p, id) {
  const c = p.cards[id], u = upgradeInfo(p, id), rar = rarity(id), have = p.jk[rar] || 0;
  if (!c || !u || u.max) return { missing: 0, use: 0, have, rar };
  const missing = Math.max(0, u.copies - c.n);
  return { missing, use: Math.min(missing, have), have, rar };
}
export function useJokers(p, id) {
  const j = jokerInfo(p, id);
  if (!j.use) return 0;
  p.cards[id].n += j.use; p.jk[j.rar] -= j.use;
  return j.use;
}
export const jokerTotal = p => RARITIES.reduce((s, r) => s + (p.jk[r] || 0), 0);
// Joker gutschreiben. Wer unter der Obergrenze liegt, behält alle (auch darüber hinaus); ist der Vorrat schon voll, wird
// daraus ein Stapel einer zufälligen eigenen Karte dieser Seltenheit, ohne passende Karte Gold. Gibt zurück, was ankam.
export function addJokers(p, rar, n, rnd = Math.random) {
  if (!(n > 0) || !(rar in p.jk)) return {};
  if (p.jk[rar] < jokerCap(p, rar)) { p.jk[rar] += n; return { jk: { [rar]: n } }; }
  const pool = Object.keys(p.cards).filter(id => rarity(id) === rar && p.cards[id].lvl < MAX_LEVEL);
  if (!pool.length) { const gold = n * COPY_VALUE[rar] * 5; p.gold += gold; return { gold }; }
  const id = pool[Math.floor(rnd() * pool.length)];
  p.cards[id].n += n;
  return { cards: [{ id, n }] };
}
// Wunschkarte festlegen (noch einmal dieselbe Karte hebt den Wunsch auf)
export function setWish(p, id) { p.wish = p.cards[id] && p.wish !== id ? id : ''; return p.wish; }
// Karten, die sich gerade aufwerten lassen, die billigsten zuerst
export const upgradable = p => Object.keys(p.cards).filter(id => upgradeInfo(p, id).can).sort((a, b) => upgradeInfo(p, a).gold - upgradeInfo(p, b).gold);

// Hat der Spieler die Runenform dieser Karte? (sechs Runenscherben gesammelt)
export const hasRune = (p, id) => !!(RUNES[id] && p.cards[id] && (p.runes[id] || 0) >= RUNE_SHARDS);
export const runeInfo = (p, id) => (RUNES[id] ? { have: Math.min(RUNE_SHARDS, (p.cards[id] && p.runes[id]) || 0), need: RUNE_SHARDS, done: hasRune(p, id) } : null);
// Karten, deren Runenform noch nicht erweckt ist
export const runeOpen = p => Object.keys(RUNES).filter(id => p.cards[id] && !hasRune(p, id));

// ---- Deck-Plätze -----------------------------------------------------------------------------
// Wie beim Vorbild sind die ersten drei Plätze eines Decks besonders: Platz 1 ist der Runenplatz – nur dort spielt eine Karte ihre
// Runenform –, Platz 2 der Heldenplatz – nur dort darf ein Held stehen –, Platz 3 der freie Platz für eins von beidem.
// Ein Deck hat damit höchstens zwei Runenformen und höchstens zwei Helden. Die Plätze öffnen sich mit den Arenen: beim Vorbild
// in Arena 3, 5 und 10 von gut doppelt so vielen; bei uns in Arena 1, 2 (dort kommt der erste Held) und 5. arena zählt ab 0.
export const SPECIAL_SLOTS = [
  { kind: 'rune', name: 'Runenplatz', arena: 0 },
  { kind: 'hero', name: 'Heldenplatz', arena: 1 },
  { kind: 'wild', name: 'Freier Platz', arena: 4 },
];
export const slotOpen = (p, i) => !!SPECIAL_SLOTS[i] && p.arena >= SPECIAL_SLOTS[i].arena;
export const heroPlaces = arena => [1, 2].filter(i => arena >= SPECIAL_SLOTS[i].arena); // Plätze, auf denen ein Held stehen darf
export const runePlaces = arena => [0, 2].filter(i => arena >= SPECIAL_SLOTS[i].arena); // Plätze, auf denen eine Runenform spielt
export const canPlace = (p, id, i) => !CARDS[id].hero || heroPlaces(p.arena).includes(i);
// Spielt diese Karte in diesem Deck ihre Runenform? (erweckt und auf einem Runenplatz)
export const runeActive = (p, id, deck = p.deck) => hasRune(p, id) && !CARDS[id].hero && runePlaces(p.arena).includes(deck.indexOf(id)) && !formActive(p, id, deck);
export const deckRunes = (p, deck = p.deck) => deck.filter(id => runeActive(p, id, deck));
// Zwei Karten eines Decks tauschen die Plätze – nur wenn danach beide stehen dürfen, wo sie stehen
export function moveInDeck(p, id, i) {
  const j = p.deck.indexOf(id), other = p.deck[i];
  if (j < 0 || j === i || !other || !canPlace(p, id, i) || !canPlace(p, other, j)) return false;
  p.deck[i] = id; p.deck[j] = other;
  return true;
}
// Ein Deck so ordnen, dass es zu den Plätzen passt – für jede Seite gleich: Helden rücken auf die Heldenplätze (überzählige weichen
// der nächsten Karte aus pool); sind runes genannt, rücken Karten mit Runenform von den gewöhnlichen Plätzen auf freie Runenplätze.
export function slotOrder(deck, arena, { pool = CARD_IDS, runes = null, forms = null } = {}) {
  const out = [...deck], hp = heroPlaces(arena), isH = id => !!(CARDS[id] && CARDS[id].hero);
  for (const id of out.filter(isH).slice(hp.length)) {
    const sub = pool.find(c => CARDS[c] && CARDS[c].type !== 'tower' && !isH(c) && !out.includes(c));
    if (sub) out[out.indexOf(id)] = sub;
  }
  out.filter(isH).forEach((id, k) => { const at = out.indexOf(id), want = hp[k]; if (at !== want) [out[at], out[want]] = [out[want], out[at]]; });
  const isF = id => !!forms && forms.includes(id) && !isH(id);
  const pull = (i, ok) => { const j = out.findIndex((id, k) => k > 2 && ok(id)); if (j >= 0) [out[i], out[j]] = [out[j], out[i]]; };
  if (forms && hp.includes(1) && !isH(out[1]) && !isF(out[1])) pull(1, isF); // eine Karte mit Heldenform auf den Heldenplatz
  if (runes) for (const i of runePlaces(arena)) { if (isH(out[i]) || isF(out[i]) || runes.includes(out[i])) continue; pull(i, id => runes.includes(id) && !isH(id) && !isF(id)); }
  if (forms && hp.includes(2) && !isH(out[2]) && !isF(out[2]) && !(runes && runes.includes(out[2]))) pull(2, isF);
  return out;
}
// ---- Heldenformen ------------------------------------------------------------------------------
// Manche gewöhnlichen Karten haben wie beim Vorbild eine Heldenform (app/helden.js): freigeschaltet für 200 Heldenmünzen,
// spielt sie nur auf dem Heldenplatz und dem freien Platz – dann kommt die Karte als Held mit einer Fähigkeit aufs Feld.
// Hat eine Karte auf dem freien Platz beides, gilt die Heldenform.
export const HERO_FORM_PRICE = 200;
export const hasForm = (p, id) => !!(HERO_FORMS[id] && p.cards[id] && p.forms[id]);
export const formInfo = (p, id) => (HERO_FORMS[id] ? { done: hasForm(p, id), price: HERO_FORM_PRICE, can: !!p.cards[id] && !p.forms[id] && p.heroCoins >= HERO_FORM_PRICE } : null);
export function buyForm(p, id) { const f = formInfo(p, id); if (!f || !f.can) return false; p.heroCoins -= HERO_FORM_PRICE; p.forms[id] = 1; return true; }
export function formActive(p, id, deck = p.deck) { return hasForm(p, id) && heroPlaces(p.arena).includes(deck.indexOf(id)); }
export const deckForms = (p, deck = p.deck) => deck.filter(id => formActive(p, id, deck));
export const slotForms = (deck, forms, arena) => heroPlaces(arena).map(i => deck[i]).filter(id => id && forms.includes(id) && !CARDS[id].hero);
// Die Runenformen, die in einem Deck wirklich spielen: nur auf dem Runenplatz und dem freien Platz
export const slotRunes = (deck, runes, arena) => runePlaces(arena).map(i => deck[i]).filter(id => id && runes.includes(id) && !CARDS[id].hero);
// Scherben einer Karte gutschreiben; gibt zurück, wie viele wirklich gebraucht wurden
export function addShards(p, id, n) {
  if (!RUNES[id] || !p.cards[id] || n <= 0) return 0;
  const have = p.runes[id] || 0, add = Math.min(n, RUNE_SHARDS - have);
  if (add > 0) p.runes[id] = have + add;
  return add;
}
// Wanderscherbe auf eine Karte legen
export function useWild(p, id) {
  if (p.wild < 1 || !addShards(p, id, 1)) return false;
  p.wild--;
  return true;
}
// n Scherben für zufällige offene Karten (ohne offene Karte werden daraus Wanderscherben). Gibt { shards: [{ id, n }], wild } zurück.
export function rollShards(p, n, rnd) {
  const out = { shards: [], wild: 0 };
  for (let i = 0; i < n; i++) {
    const open = runeOpen(p);
    if (!open.length) { p.wild++; out.wild++; continue; }
    const id = open[Math.floor(rnd() * open.length)];
    addShards(p, id, 1);
    const s = out.shards.find(x => x.id === id); if (s) s.n++; else out.shards.push({ id, n: 1 });
  }
  return out;
}

// Stärkungstrank: hebt eine Karte (keine Turmkarte) für drei Stunden auf die Stufe des Hauptturms. now = Uhrzeit in Millisekunden.
export const boosted = (p, id, now) => !!(now > 0 && p.boosts[id] > now && p.boosts[id] - now <= POTION_HOURS * 60 * MIN);
export const boostLevel = (p, id, now) => (p.cards[id] ? (boosted(p, id, now) ? Math.max(p.cards[id].lvl, Math.min(MAX_LEVEL, playerLevel(p.xp).lvl)) : p.cards[id].lvl) : 0);
export function usePotion(p, id, now) {
  if (p.potions < 1 || !p.cards[id] || CARDS[id].type === 'tower' || !(now > 0) || boosted(p, id, now)) return false;
  for (const k of Object.keys(p.boosts)) if (!boosted(p, k, now)) delete p.boosts[k]; // abgelaufene aufräumen
  p.potions--; p.boosts[id] = now + POTION_HOURS * 60 * MIN;
  return true;
}
export function addPotions(p, n) {
  const add = Math.max(0, Math.min(n, POTION_CAP - p.potions)), gold = (n - add) * 50; // über dem Vorrat wird ein Trank zu Gold
  p.potions += add; p.gold += gold;
  return gold ? (add ? { potions: add, gold } : { gold }) : { potions: add };
}

// Stufen für createGame: eigene Karten (mit Stärkungstrank, wenn die Uhrzeit mitkommt), Hauptturm (= Spielerstufe),
// Art und Stufe der Außentürme, Runenformen
export const playerLevels = (p, now = 0) => ({
  cards: Object.fromEntries(Object.entries(p.cards).map(([id, c]) => [id, now ? boostLevel(p, id, now) : c.lvl])),
  tower: playerLevel(p.xp).lvl, towerType: p.towerSel, outer: p.cards[p.towerSel].lvl,
  runes: deckRunes(p), // nur die Karten auf dem Runenplatz und dem freien Platz
  forms: deckForms(p), // Heldenformen: nur auf dem Heldenplatz und dem freien Platz
});

// Der Computergegner wächst mit der Arena, auf Leicht eine Stufe darunter.
export function opponentLevels(p, level) {
  const base = 1 + Math.round((p.arena * (MAX_LEVEL - 1)) / (ARENAS.length - 1));
  const lvl = Math.max(1, Math.min(MAX_LEVEL, base - (level === 'leicht' ? 1 : 0)));
  return { cards: Object.fromEntries(CARD_IDS.map(id => [id, lvl])), tower: lvl, lvl, runes: lvl >= RUNE_LEVEL ? Object.keys(RUNES) : [], forms: lvl >= RUNE_LEVEL + 1 ? [...HERO_FORM_IDS] : [] };
}

// Turmart wählen (nur freigeschaltete Turmkarten)
export function setTower(p, id) { if (TOWER_IDS.includes(id) && p.cards[id]) p.towerSel = id; return p.towerSel; }
// Turmart des Computergegners: irgendeine, die es in dieser Arena schon gibt
export function opponentTower(p, rnd) { const pool = TOWER_IDS.filter(id => unlockArena(id) <= p.arena); return pool[Math.floor(rnd() * pool.length)] || DEFAULT_TOWER; }

// Gegnerdeck: acht Karten aus allem, was bis zu dieser Arena freigeschaltet ist – immer mit Luftabwehr und einem Zauber.
export function opponentDeck(p, rnd) {
  const pool = unlockedIds(p).filter(id => CARDS[id].type !== 'tower');
  for (let tries = 0; tries < 60; tries++) {
    const ids = [...pool];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const deck = ids.slice(0, 8);
    const spells = deck.filter(id => CARDS[id].type === 'spell').length;
    const troops = deck.filter(id => CARDS[id].type === 'troop').length;
    const builds = deck.filter(id => CARDS[id].type === 'building').length;
    const antiAir = deck.filter(id => CARDS[id].type !== 'spell' && UNITS[CARDS[id].unit].hitsAir).length;
    const cost = deck.reduce((s, id) => s + CARDS[id].cost, 0) / 8;
    if (troops >= 4 && spells <= 2 && builds <= 2 && antiAir >= 2 && cost <= 4.6 && heroCount(deck) <= 2) return deck;
  }
  return [...DEFAULT_DECK];
}

const FOES = ['Brakka', 'Yselda', 'Torwin', 'Mirella', 'Garrok', 'Fennja', 'Oswin', 'Thalea', 'Rurik', 'Isbeth', 'Kolja', 'Wendra', 'Harbard', 'Liora', 'Dunmar', 'Sefa', 'Varek', 'Ombra', 'Jorin', 'Astrid die Graue', 'Mogrim', 'Tilda', 'Eskil', 'Runa'];
export const opponentName = rnd => FOES[Math.floor(rnd() * FOES.length)];

// Truhe: Gold, Kartenstapel aus den freigeschalteten Karten und ein paar Joker. size streckt den Inhalt
// (1 = Siegestruhe). Die Wunschkarte steckt in jeder Truhe und bekommt rund 40 % der Karten.
export function rollChest(p, crowns, rnd, size = 1, { cardF = 1, goldF = 1, stacks: nStacks = 0 } = {}) {
  const gold = Math.round((30 + p.arena * 15 + crowns * 5 + Math.floor(rnd() * 11)) * size * goldF);
  const pool = unlockedIds(p).filter(id => p.cards[id] && p.cards[id].lvl < MAX_LEVEL);
  let total = Math.round((8 + p.arena * 3) * size * cardF);
  const jokers = Math.max(1, Math.round(total * 0.12));
  const stacks = {};
  const wish = p.wish && pool.includes(p.wish) ? p.wish : '';
  if (wish) { stacks[wish] = Math.max(1, Math.round(total * 0.4)); total -= stacks[wish]; }
  const kinds = Math.min(pool.length - (wish ? 1 : 0), nStacks || (size >= 3 ? 5 : size > 1 ? 4 : 3));
  // total zählt in gewöhnlichen Kopien; seltenere Karten werden seltener gezogen und ihr Stapel ist entsprechend kleiner
  const pick = () => {
    const rest = pool.filter(id => !stacks[id]), sum = rest.reduce((a, id) => a + CHEST_WEIGHT[rarity(id)], 0);
    let x = rnd() * sum;
    for (const id of rest) { x -= CHEST_WEIGHT[rarity(id)]; if (x < 0) return id; }
    return rest[rest.length - 1];
  };
  for (let i = 0; i < kinds && total > 0; i++) {
    const id = pick();
    const n = i === kinds - 1 ? total : Math.max(1, Math.round(total * (0.3 + rnd() * 0.3)));
    stacks[id] = n; total -= n;
  }
  if (wish && total > 0) stacks[wish] += total; // nichts verfällt, wenn sonst keine Karte mehr in Frage kommt
  return { gold, cards: Object.entries(stacks).map(([id, n]) => ({ id, n: Math.max(1, Math.round(n / COPY_VALUE[rarity(id)])) })), jk: { gewoehnlich: jokers } };
}
function grantChest(p, chest) {
  p.gold += chest.gold;
  for (const [r, n] of Object.entries(chest.jk || {})) p.jk[r] += n;
  for (const s of chest.cards) p.cards[s.id].n += s.n;
  return chest;
}
// Zwei Beuten zusammenzählen (für „Alles abholen“ und die Übersicht nach mehreren Belohnungen)
export function mergeLoot(a, b) {
  if (!b) return a;
  for (const k of ['gold', 'gems', 'wild', 'potions', 'marks']) if (b[k]) a[k] = (a[k] || 0) + b[k];
  for (const [r, n] of Object.entries(b.jk || {})) { a.jk = a.jk || {}; a.jk[r] = (a.jk[r] || 0) + n; }
  for (const key of ['cards', 'shards']) for (const s of b[key] || []) { a[key] = a[key] || []; const x = a[key].find(y => y.id === s.id); if (x) x.n += s.n; else a[key].push({ id: s.id, n: s.n }); }
  return a;
}

// Inhalt einer alten Truhe (Truhenlager, Bosstruhe) auswürfeln und gutschreiben. arena = Arena, in der sie verdient wurde.
export function chestLoot(p, kind, rnd = Math.random, arena = p.arena, crowns = 2) {
  const C = CHESTS[kind], save = p.arena;
  p.arena = Math.max(0, Math.min(save, arena));
  const chest = rollChest(p, crowns, rnd, C.size, C);
  p.arena = save;
  if (C.bonus) { chest.gems = C.bonus; p.gems += C.bonus; }
  grantChest(p, chest);
  const ch = SHARD_CHANCE[kind] || 0, n = ch >= 1 ? (kind === 'runen' ? 2 : 1) : rnd() < ch ? 1 : 0; // Runenscherben: sicher in den großen Truhen, sonst mit etwas Glück
  if (n) { const sh = rollShards(p, n, rnd); if (sh.shards.length) chest.shards = sh.shards; if (sh.wild) chest.wild = sh.wild; }
  return chest;
}

// Was eine alte Truhe dieser Art in dieser Arena ungefähr enthält (für die Anzeige)
export function chestInfo(kind, arena) {
  const C = CHESTS[kind], cards = Math.round((8 + arena * 3) * C.size * (C.cardF || 1));
  return { cards, gold: Math.round((45 + arena * 15) * C.size * (C.goldF || 1) / 5) * 5, jokers: Math.max(1, Math.round(cards * 0.12)), gems: C.bonus || 0 };
}

// Truhenlager: Truhen aus alten Spielständen, sofort zu öffnen. Platz: { k: Art, a: Arena }.
export function openStash(p, i, rnd = Math.random) {
  const c = p.stash[i];
  if (!c) return null;
  p.stash.splice(i, 1);
  const loot = chestLoot(p, c.k, rnd, c.a, c.k === 'kronen' ? 3 : 2);
  if (c.k === 'kronen') { loot.gems = (loot.gems || 0) + 5; p.gems += 5; }
  return { kind: c.k, ...loot };
}

// ---- Schicksalstruhen ----------------------------------------------------------------------------
// Eine Schicksalstruhe hat ein bis fünf Funken. Beim Öffnen fallen die Schicksalswürfe (vier, ab vier Funken einer):
// jeder kann die Truhe um einen Funken heben. Am Ende steht genau eine Belohnung, je mehr Funken, desto wertvoller.
// Wahrscheinlichkeiten und Aufbau der Beutetabellen folgen dem Vorbild (ohne dessen Schmuckstücke: deren Anteil ist Gold).
export const LUCKY_ODDS = { 1: [31.64, 43.04, 20.25, 4.06, 1.01], 2: [0, 33.36, 45.59, 19.71, 1.34], 3: [0, 0, 40.96, 56.97, 2.07], 4: [0, 0, 0, 96, 4], 5: [0, 0, 0, 0, 100] };
export const luckySpins = start => (start >= 4 ? 1 : 4);
export const LUCKY_LOOT = {
  1: [['gold', 50], ['c:gewoehnlich', 26], ['c:selten', 24]],
  2: [['gold', 42], ['c:gewoehnlich', 20], ['c:selten', 19], ['c:episch', 19]],
  3: [['gold', 32], ['c:gewoehnlich', 19], ['c:selten', 17.5], ['c:episch', 17.5], ['c:legendaer', 10.5], ['c:held', 3.5]],
  4: [['c:gewoehnlich', 16.5], ['c:selten', 15.3], ['c:episch', 15.4], ['c:legendaer', 9.1], ['c:held', 2.7], ['j:gewoehnlich', 8], ['j:selten', 7.5], ['j:episch', 7], ['j:legendaer', 6.5], ['j:held', 6.5], ['wild', 5.5]],
  5: [['c:gewoehnlich', 16], ['c:selten', 14.9], ['c:episch', 15], ['c:legendaer', 8.9], ['c:held', 2.7], ['j:gewoehnlich', 9], ['j:selten', 8], ['j:episch', 6.5], ['j:legendaer', 5.5], ['j:held', 4], ['rune', 9.5]],
};
export const LUCKY_UNITS = [0, 6, 13, 28, 60, 120];  // Wert eines Kartenstapels in gewöhnlichen Kopien (Arena 1)
export const LUCKY_GOLD = [0, 80, 170, 400, 0, 0];   // Gold (Arena 1)
export const WISH_SHARE = 0.4;                        // so oft geht ein Kartenstapel an die Wunschkarte
const RAR_F = { gewoehnlich: 1.4, selten: 1.2, episch: 1.1, legendaer: 1.2, held: 1.2 }; // Gewicht je Seltenheit: gleicht aus, dass gewöhnliche Karten die meisten Kopien brauchen
export const arenaF = arena => 1 + 0.35 * arena;      // Truhen und Prämien wachsen mit der Arena
const stackOf = (units, rar) => Math.max(1, Math.round((units * RAR_F[rar]) / COPY_VALUE[rar]));
const poolOf = (p, rar) => Object.keys(p.cards).filter(id => rarity(id) === rar && p.cards[id].lvl < MAX_LEVEL);
const draw = (table, rnd) => { const sum = table.reduce((s, e) => s + e[1], 0); let x = rnd() * sum; for (const e of table) { x -= e[1]; if (x < 0) return e[0]; } return table[table.length - 1][0]; };
// Ein Kartenstapel dieser Seltenheit – oder, mit WISH_SHARE, einer der Wunschkarte. Wird gleich gutgeschrieben.
function cardStack(p, rar, units, rnd) {
  const wish = p.wish && p.cards[p.wish] && p.cards[p.wish].lvl < MAX_LEVEL ? p.wish : '';
  let id = wish && rnd() < WISH_SHARE ? wish : '';
  if (!id) { const pool = poolOf(p, rar); if (!pool.length) return null; id = pool[Math.floor(rnd() * pool.length)]; }
  const n = stackOf(units, rarity(id));
  p.cards[id].n += n;
  return { id, n };
}
// Schicksalswürfe: Endstand und der Stand nach jedem Wurf
export function luckyStars(start, rnd, odds = LUCKY_ODDS) {
  const stars = draw(odds[start].map((w, i) => [i + 1, w]).filter(e => e[1] > 0), rnd), spins = luckySpins(start);
  const ups = new Set();
  while (ups.size < Math.min(spins, stars - start)) ups.add(Math.floor(rnd() * spins));
  const path = [];
  for (let i = 0, s = start; i < spins; i++) { if (ups.has(i)) s++; path.push(s); }
  return { stars, path };
}
// n Scherben möglichst auf eine Karte (ohne offene Karte werden daraus Wanderscherben)
function focusShards(p, n, rnd) {
  const out = { shards: [], wild: 0 };
  while (n > 0) {
    const open = runeOpen(p);
    if (!open.length) { p.wild += n; out.wild += n; break; }
    const id = open[Math.floor(rnd() * open.length)], k = addShards(p, id, n);
    out.shards.push({ id, n: k }); n -= k;
  }
  return out;
}
// Schicksalstruhe öffnen und gutschreiben. start = Funken zu Beginn. Gibt { box, start, stars, path, … Beute } zurück.
export function luckyOpen(p, start = 1, rnd = Math.random, arena = p.arena) {
  start = Math.max(1, Math.min(5, start | 0));
  const { stars, path } = luckyStars(start, rnd), units = LUCKY_UNITS[stars] * arenaF(arena);
  const ok = e => { const [t, r] = e[0].split(':'); return t === 'c' || t === 'j' ? poolOf(p, r).length > 0 : true; }; // nur, was der Spieler schon gebrauchen kann
  const [t, r] = draw(LUCKY_LOOT[stars].filter(ok), rnd).split(':');
  const loot = { box: 'los', start, stars, path, cards: [] };
  if (t === 'gold') { loot.gold = Math.round((LUCKY_GOLD[stars] * arenaF(arena)) / 5) * 5; p.gold += loot.gold; }
  else if (t === 'c') { const s = cardStack(p, r, units, rnd); if (s) loot.cards.push(s); }
  else if (t === 'j') mergeLoot(loot, addJokers(p, r, stackOf(units * 0.8, r), rnd));
  else if (t === 'wild') { p.wild++; loot.wild = 1; }
  else { const sh = focusShards(p, RUNE_SHARDS, rnd); if (sh.shards.length) loot.shards = sh.shards; if (sh.wild) loot.wild = sh.wild; } // eine ganze Runenform
  return loot;
}
// Runenkiste: beginnt mit drei Funken, enthält nur Runenscherben (1 / 2 / 6)
export const RUNEBOX_ODDS = { 3: [0, 0, 49.3, 45.6, 5.1] };
export const RUNEBOX_SHARDS = { 3: 1, 4: 2, 5: 6 };
export function runeBoxOpen(p, rnd = Math.random) {
  const { stars, path } = luckyStars(3, rnd, RUNEBOX_ODDS), sh = focusShards(p, RUNEBOX_SHARDS[stars], rnd);
  const loot = { box: 'runenkiste', start: 3, stars, path, cards: [] };
  if (sh.shards.length) loot.shards = sh.shards;
  if (sh.wild) loot.wild = sh.wild;
  return loot;
}
export const crateGold = (arena, big) => Math.round(((80 + 35 * arena) * (big ? 4 : 1)) / 5) * 5; // Goldkiste, volle Goldkiste

// Eine Belohnung gutschreiben (Runenpfad, Trophäenweg, Sammlungsstufe, Saisonmarkt). Arten: gold (n oder crate),
// gems (n, dazu wild), lucky (s Funken), runebox, jk (r Seltenheit, n; grow = wächst mit der Arena), wild, potion,
// rune (n Scherben für Karte id).
export const jokerCount = (r, arena) => (r.grow ? Math.max(1, Math.round(r.n * arenaF(arena))) : r.n);
export function grantReward(p, r, rnd = Math.random, arena = p.arena) {
  if (r.t === 'gold') { const n = r.crate ? crateGold(arena, r.crate > 1) : r.n; p.gold += n; return { gold: n, cards: [] }; }
  if (r.t === 'gems') { p.gems += r.n; if (r.wild) p.wild += r.wild; return r.wild ? { gems: r.n, wild: r.wild, cards: [] } : { gems: r.n, cards: [] }; }
  if (r.t === 'lucky') return luckyOpen(p, r.s, rnd, arena);
  if (r.t === 'runebox') return runeBoxOpen(p, rnd);
  if (r.t === 'jk') return { cards: [], ...addJokers(p, r.r, jokerCount(r, arena), rnd) };
  if (r.t === 'wild') { p.wild += r.n; return { wild: r.n, cards: [] }; }
  if (r.t === 'hero') { p.heroCoins += r.n; return { hero: r.n, cards: [] }; } // Heldenmünzen
  if (r.t === 'potion') return { cards: [], ...addPotions(p, r.n) };
  if (r.t === 'rune') { // Runenform der Saison: Scherben für diese Karte – wer sie nicht hat oder schon erweckt hat, bekommt Wanderscherben
    const n = addShards(p, r.id, r.n), wild = r.n - n;
    p.wild += wild;
    return { cards: [], ...(n ? { shards: [{ id: r.id, n }] } : {}), ...(wild ? { wild } : {}) };
  }
  return { cards: [] };
}

// ---- Runenpfad -----------------------------------------------------------------------------------
export const seasonRune = id => { const ids = Object.keys(RUNES); return ids[hashStr('r' + id) % ids.length]; }; // Runenform der Saison
const J = (r, n) => ({ t: 'jk', r, n, grow: true }), L3 = { t: 'lucky', s: 3 }, G4 = { t: 'gold', crate: 4 }, RB = { t: 'runebox' };
// Runenspur: Stufe 1 und jede dritte Stufe
const RUNE_TRACK = [J('gewoehnlich', 25), L3, J('selten', 10), J('episch', 4), G4, J('gewoehnlich', 25), L3, J('legendaer', 1), J('selten', 10), G4,
  J('gewoehnlich', 25), J('episch', 4), L3, RB, G4, J('gewoehnlich', 25), J('selten', 10), J('legendaer', 1), L3, G4,
  J('gewoehnlich', 25), J('episch', 4), J('selten', 10), J('held', 1), RB, J('gewoehnlich', 25), L3, J('legendaer', 1), { t: 'potion', n: 2 }, { t: 'lucky', s: 5 }];
// Belohnung einer Stufe. track: 'free' (Wegspur) oder 'rune' (Runenspur); null = dort liegt nichts.
export function passReward(track, tier, id = '') {
  if (!(tier >= 1 && tier <= PASS_TIERS)) return null;
  if (track === 'rune' && [20, 50, 80].includes(tier)) return { t: 'hero', n: 30 }; // Heldenmünzen: je Saison 90 auf der Runenspur, 60 auf der Wegspur
  if (track === 'rune') return tier === 1 ? { t: 'rune', n: RUNE_SHARDS, id: seasonRune(id) } : tier % 3 ? null : RUNE_TRACK[tier / 3 - 1];
  if (tier === 90) return { t: 'lucky', s: 5 };
  if (tier === 45) return L3;
  if ([20, 50, 70].includes(tier)) return { t: 'hero', n: 20 };
  if (tier === 30 || tier === 75) return { t: 'wild', n: 1 };
  if ([10, 35, 55, 80].includes(tier)) return { t: 'gems', n: 25 };
  if ([15, 40, 60, 85].includes(tier)) return { t: 'potion', n: 1 };
  return tier % 3 === 1 ? { t: 'gold', crate: 1 } : { t: 'lucky', s: tier % 3 === 2 ? 1 : 2 };
}
export function passInfo(p) {
  const c = Math.min(PASS_TIERS * PASS_CROWNS, p.season.crowns), tier = Math.floor(c / PASS_CROWNS), done = tier >= PASS_TIERS;
  return { tier, into: done ? 0 : c % PASS_CROWNS, need: PASS_CROWNS, done };
}
// Kronen gutschreiben; gibt zurück, wie viele Stufen dadurch fertig wurden. Nach Stufe 90 füllen sie den Kronenspeicher.
export function passAdd(p, crowns) {
  if (!(crowns > 0)) return 0;
  const s = p.season, before = passInfo(p).tier, room = PASS_TIERS * PASS_CROWNS - s.crowns;
  s.crowns += Math.min(room, crowns); s.bank += Math.max(0, crowns - room);
  return passInfo(p).tier - before;
}
export function passOpen(p) {
  const { tier } = passInfo(p), s = p.season, out = [];
  for (let t = 1; t <= tier; t++) {
    if (!s.free.includes(t)) out.push({ track: 'free', tier: t });
    if (s.open && !s.rune.includes(t) && passReward('rune', t, s.id)) out.push({ track: 'rune', tier: t });
  }
  return out;
}
export function claimPass(p, track, tier, rnd = Math.random) {
  const s = p.season, r = passReward(track, tier, s.id), list = track === 'rune' ? s.rune : s.free;
  if (!r || tier > passInfo(p).tier || list.includes(tier) || (track === 'rune' && !s.open)) return null;
  list.push(tier);
  return grantReward(p, r, rnd);
}
// Alles Offene auf einmal: eine zusammengezählte Beute mit n = Zahl der Belohnungen
export function claimPassAll(p, rnd = Math.random) {
  const sum = { cards: [] };
  let n = 0;
  for (const c of passOpen(p)) { mergeLoot(sum, claimPass(p, c.track, c.tier, rnd)); n++; }
  return n ? { ...sum, n } : null;
}
// Runenspur der laufenden Saison freischalten (alle schon erreichten Stufen werden abholbar)
export function buyPass(p) {
  if (p.season.open || p.gems < PASS_PRICE) return false;
  p.gems -= PASS_PRICE; p.season.open = true;
  return true;
}
// Laufende Stufe abschließen: ein Runensplitter je fehlende Krone
export const skipCost = p => { const i = passInfo(p); return i.done ? 0 : (PASS_CROWNS - i.into) * (PASS_SKIP / PASS_CROWNS); };
export function skipTier(p) {
  const cost = skipCost(p);
  if (!cost || p.gems < cost) return false;
  p.gems -= cost; p.season.crowns += PASS_CROWNS - passInfo(p).into;
  return true;
}
export const bankInfo = p => { const ready = Math.floor(p.season.bank / BANK_CROWNS); return { ready, can: ready > 0 && p.season.bankDay !== p.day, into: p.season.bank % BANK_CROWNS }; };
export function claimBank(p, rnd = Math.random) {
  if (!bankInfo(p).can) return null;
  p.season.bank -= BANK_CROWNS; p.season.bankDay = p.day;
  return luckyOpen(p, 1, rnd);
}
// Neue Saison? Verdiente, aber nicht abgeholte Belohnungen der alten werden gutgeschrieben, übrige Furtmarken zu Gold.
export function ensureSeason(p, day) {
  const id = seasonId(day), s = p.season;
  if (!id || s.id === id) return false;
  if (!s.id) { s.id = id; return true; } // erster Start: angefangene Kronen bleiben
  const rnd = seeded(hashStr('e' + s.id + p.gold)), sum = { cards: [] };
  let n = 0;
  for (const c of passOpen(p)) { mergeLoot(sum, claimPass(p, c.track, c.tier, rnd)); n++; }
  for (let k = Math.min(5, bankInfo(p).ready); k > 0; k--) { mergeLoot(sum, luckyOpen(p, 1, rnd)); n++; }
  const marks = s.marks;
  p.gold += marks;
  if (n || marks) p.note = { id: s.id, n, gold: (sum.gold || 0) + marks, marks };
  p.season = newSeason(id);
  return true;
}

// ---- Furtmarken und Saisonmarkt ---------------------------------------------------------------------
// Furtmarken gibt es für Siege in den Spielmodi und gegen Bosse; sie gelten nur in der laufenden Saison. Der Saisonmarkt
// tauscht sie gegen Sonderdinge; die besten Stücke öffnen sich erst, wenn genug Marken ausgegeben sind (gate).
export const MARKS = { mode: 25, modeWins: 4, day: 60, boss: 150, quests: 20 };
export const MARKET = [
  { t: 'gold', crate: 4, price: 60, max: 5 },
  { t: 'jk', r: 'gewoehnlich', n: 12, grow: true, price: 80, max: 5 },
  { t: 'jk', r: 'selten', n: 5, grow: true, price: 100, max: 4 },
  { t: 'jk', r: 'episch', n: 2, grow: true, price: 140, max: 3 },
  { t: 'potion', n: 1, price: 60, max: 4 },
  { t: 'lucky', s: 3, price: 150, max: 3 },
  { t: 'wild', n: 1, price: 250, max: 2 },
  { t: 'runebox', price: 400, max: 1, gate: 600 },
  { t: 'lucky', s: 5, price: 600, max: 1, gate: 1200 },
  { t: 'hero', n: 25, price: 200, max: 2 },
];
export const marketInfo = p => MARKET.map((m, i) => { const got = p.season.market[i] || 0, locked = (m.gate || 0) > p.season.spent; return { i, ...m, got, left: m.max - got, locked, can: !locked && got < m.max && p.season.marks >= m.price }; });
export function buyMarket(p, i, rnd = Math.random) {
  const m = marketInfo(p)[i];
  if (!m || !m.can) return null;
  p.season.marks -= m.price; p.season.spent += m.price; p.season.market[i] = m.got + 1;
  return grantReward(p, MARKET[i], rnd);
}

// Siegprämie: Gold (35 %) oder ein Kartenstapel (30 % gewöhnlich, 30 % selten, 5 % episch)
export function winPrize(p, rnd = Math.random) {
  const x = rnd(), rar = x < 0.35 ? '' : x < 0.65 ? 'gewoehnlich' : x < 0.95 ? 'selten' : 'episch';
  const s = rar ? cardStack(p, rar, PRIZE_UNITS * arenaF(p.arena), rnd) : null;
  if (s) return { cards: [s] };
  const gold = Math.round(PRIZE_GOLD * arenaF(p.arena));
  p.gold += gold;
  return { gold, cards: [] };
}
export const PRIZE_UNITS = 4, PRIZE_GOLD = 100;

// Spielergebnis verbuchen. winner: 0 = Spieler, 1 = Computer, 'draw'. Gibt zurück, was sich geändert hat.
// Zusätzliche Angaben (alle freiwillig): foeCrowns, foe, when, played {Karte: Anzahl}, spells, abilities, training.
export function applyResult(p, res, rnd = Math.random) {
  const { winner, level, crowns = 0 } = res;
  // out.lucky = Schicksalstruhe (einer der ersten vier Siege des Tages), out.prize = Siegprämie, out.chest = Bosstruhe,
  // out.crowns = Kronen für den Runenpfad (mit Bonuskronen), out.tiers = dadurch abgeschlossene Stufen, out.marks = Furtmarken
  const out = { delta: 0, chest: null, lucky: null, prize: null, crowns: 0, bonusCrowns: 0, tiers: 0, marks: 0, arenaUp: null, newCards: [], gems: 0, bonus: 0, bossFirst: false };
  if (res.training) return out; // Übungskampf: zählt nicht
  const ranked = !res.mode && res.boss == null; // nur der normale Kampf zählt für Trophäen
  const st = p.stats;
  for (const [id, n] of Object.entries(res.played || {})) if (CARDS[id]) { st.played[id] = (st.played[id] || 0) + n; st.cards += n; }
  st.spells += res.spells || 0; st.abilities += res.abilities || 0; st.crowns += crowns;
  questProgress(p, 'kaempfe', 1); questProgress(p, 'kronen', crowns); questProgress(p, 'zauber', res.spells || 0);
  questProgress(p, 'karten', Object.values(res.played || {}).reduce((s, n) => s + n, 0)); questProgress(p, 'helden', res.abilities || 0);
  const before = p.trophies;
  const dayWin = () => { // Tagessiege: Bonuskronen, Schicksalstruhe, Siegprämie
    p.dayWins++;
    if (p.dayWins <= BONUS_WINS) out.bonusCrowns = BONUS_CROWNS;
    if (p.dayWins <= DAY_CHESTS.length) out.lucky = luckyOpen(p, DAY_CHESTS[p.dayWins - 1], rnd);
    if (p.dayWins <= DAY_PRIZES) out.prize = winPrize(p, rnd);
  };
  const finish = () => { // jede Krone zählt für den Runenpfad – auch bei einer Niederlage
    out.crowns = crowns + out.bonusCrowns; out.tiers = passAdd(p, out.crowns);
    p.season.marks += out.marks;
    p.log.unshift({ w: winner === 0 || winner === 1 ? winner : 'draw', c: [crowns, num(res.foeCrowns, 0)], d: out.delta, lv: TROPHY[level] ? level : 'mittel', foe: typeof res.foe === 'string' ? res.foe.slice(0, 16) : '', t: num(res.when, 0) });
    p.log.length = Math.min(p.log.length, 12);
    return out;
  };
  if (!ranked) {
    if (winner === 0) {
      questProgress(p, 'siege', 1);
      if (res.boss != null && BOSSES[res.boss] && !p.bosses.includes(res.boss)) { // erster Sieg über diesen Boss: große Belohnung
        p.bosses.push(res.boss); out.bossFirst = true;
        const save = p.arena; p.arena = Math.max(p.arena, res.boss);
        out.chest = grantChest(p, { ...rollChest(p, 3, rnd, BOSS_REWARD.size), gems: BOSS_REWARD.gems });
        p.arena = save;
        for (const [r, n] of Object.entries(BOSS_REWARD.jk)) { p.jk[r] += n; out.chest.jk[r] = (out.chest.jk[r] || 0) + n; }
        p.gems += BOSS_REWARD.gems;
        p.wild += BOSS_REWARD.wild; out.chest.wild = (out.chest.wild || 0) + BOSS_REWARD.wild;
        out.marks += MARKS.boss;
      }
      if (res.mode) {
        if (++p.modeWins <= MARKS.modeWins) out.marks += MARKS.mode; // die ersten Modus-Siege des Tages bringen Furtmarken
        if (res.mode === modeOfDay(p.day) && modeBonusOpen(p)) { p.modeDay = p.day; p.gems += MODE_BONUS; out.bonus = MODE_BONUS; out.shards = rollShards(p, 1, rnd); out.marks += MARKS.day; } // dazu eine Runenscherbe
      }
      dayWin();
    }
    return finish();
  }
  if (winner === 'draw') { p.draws++; st.streak = 0; }
  else {
    const [win, loss] = TROPHY[level] || TROPHY.mittel;
    const floor = ARENAS[p.arena].at; // einmal erreichte Arenen verliert man nicht mehr
    if (winner === 0) { p.wins++; p.trophies += win; st.streak++; st.bestStreak = Math.max(st.bestStreak, st.streak); if (crowns >= 3) st.three++; questProgress(p, 'siege', 1); }
    else { p.losses++; p.trophies = Math.max(floor, p.trophies + loss); st.streak = 0; }
  }
  out.delta = p.trophies - before;
  p.best = Math.max(p.best, p.trophies);
  const a = arenaIndex(p.trophies);
  if (a > p.arena) {
    p.arena = a; out.arenaUp = ARENAS[a].name; out.gems = 10; p.gems += 10;
    for (const ar of ARENAS.slice(0, a + 1)) for (const id of ar.unlock) if (!p.cards[id]) { p.cards[id] = { lvl: 1, n: 0 }; out.newCards.push(id); }
  }
  if (winner === 0) dayWin();
  return finish();
}

// ---- Trophäenweg: alle 100 Trophäen eine Belohnung, abzuholen sobald die Bestmarke reicht -----------
// Sechs Arten im Wechsel: Gold, Kartenwahl (eine von zwei Karten der Arena), Schicksalstruhe, Runensplitter, Joker,
// und als sechstes abwechselnd Runensplitter mit Wanderscherbe oder eine Runenkiste.
export const ROAD = Array.from({ length: 50 }, (_, i) => {
  const at = (i + 1) * 100, a = arenaIndex(at), k = i % 6;
  if (k === 0) return { at, t: 'gold', n: 80 + a * 30 };
  if (k === 1) return { at, t: 'choice', units: 16 + a * 6 };
  if (k === 2) return { at, t: 'lucky', s: 2 };
  if (k === 3) return { at, t: 'gems', n: 10 };
  if (k === 4) return i % 12 === 4 ? { at, t: 'jk', r: 'gewoehnlich', n: 10 + a * 4 } : { at, t: 'jk', r: 'selten', n: 4 + a * 2 };
  return i % 12 === 5 ? { at, t: 'gems', n: 10, wild: 1 } : { at, t: 'runebox' };
});
// Kartenwahl eines Meilensteins: zwei feste Karten seiner Arena mit ihrer Stückzahl
export function roadChoice(at) {
  const r = ROAD.find(x => x.at === at);
  if (!r || r.t !== 'choice') return null;
  const ids = ARENAS[arenaIndex(at)].unlock.filter(id => CARDS[id].type !== 'tower'), rnd = seeded(hashStr('w' + at));
  const i = Math.floor(rnd() * ids.length), j = (i + 1 + Math.floor(rnd() * (ids.length - 1))) % ids.length;
  return [i, j].map(k => ({ id: ids[k], n: stackOf(r.units, rarity(ids[k])) }));
}
export const roadOpen = p => ROAD.filter(r => p.best >= r.at && !p.road.includes(r.at));
export function claimRoad(p, at, rnd = Math.random, pick = 0) {
  const r = ROAD.find(x => x.at === at);
  if (!r || p.best < at || p.road.includes(at)) return null;
  if (r.t === 'choice') {
    const c = roadChoice(at)[pick ? 1 : 0];
    if (!p.cards[c.id]) return null;
    p.road.push(at); p.cards[c.id].n += c.n;
    return { cards: [c] };
  }
  p.road.push(at);
  return grantReward(p, r, rnd, Math.min(p.arena, arenaIndex(at))); // Inhalt nach der Arena des Meilensteins
}

// ---- Sammlungsstufe ------------------------------------------------------------------------------
// Jede Kartenstufe zählt eins, jede erweckte Runenform fünf. Alle zehn Stufen gibt es eine Belohnung.
export const COLL_STEP = 10, COLL_FIRST = 20;
export const COLL_MAX = (CARD_IDS.length + TOWER_IDS.length) * MAX_LEVEL + 5 * Object.keys(RUNES).length;
export const collLevel = p => Object.values(p.cards).reduce((s, c) => s + c.lvl, 0) + 5 * Object.keys(RUNES).filter(id => hasRune(p, id)).length;
export function collReward(lvl) {
  if (lvl % 100 === 0) return { t: 'lucky', s: 5 };
  if (lvl % 50 === 0) return { t: 'lucky', s: 4 };
  if (lvl % 90 === 0) return { t: 'runebox' };
  const k = lvl / COLL_STEP;
  if (k % 2 === 0) return { t: 'gems', n: 5 + Math.min(10, Math.floor(lvl / 100)) };
  return k % 6 === 3 ? { t: 'jk', r: 'selten', n: 6 } : k % 6 === 5 && lvl >= 150 ? { t: 'jk', r: 'episch', n: 2 } : { t: 'jk', r: 'gewoehnlich', n: 12 };
}
export function collOpen(p) {
  const lvl = collLevel(p), out = [];
  for (let n = COLL_FIRST; n <= lvl; n += COLL_STEP) if (!p.coll.includes(n)) out.push(n);
  return out;
}
export function claimColl(p, lvl, rnd = Math.random) {
  if (lvl % COLL_STEP || lvl < COLL_FIRST || lvl > collLevel(p) || p.coll.includes(lvl)) return null;
  p.coll.push(lvl);
  return grantReward(p, collReward(lvl), rnd);
}

// ---- Kartenmeisterschaft -------------------------------------------------------------------------
// Wer eine Karte oft ausspielt, meistert sie: drei Schritte je Karte, jeder bringt Gold.
export const MASTERY = [{ need: 15, gold: 100 }, { need: 40, gold: 200 }, { need: 100, gold: 500 }];
export function masteryInfo(p, id) {
  const played = p.stats.played[id] || 0, step = p.mast[id] || 0, next = MASTERY[step] || null;
  return { played, step, next, can: !!(next && p.cards[id] && played >= next.need) };
}
export function claimMastery(p, id) {
  const m = masteryInfo(p, id);
  if (!m.can) return null;
  p.mast[id] = m.step + 1; p.gold += m.next.gold;
  return { gold: m.next.gold };
}
export const masteryOpen = p => Object.keys(p.stats.played).filter(id => masteryInfo(p, id).can);

// ---- Tagesaufgaben -----------------------------------------------------------------------------
export const QUESTS = {
  kaempfe:   { need: 3,  gold: 40, gems: 0, text: n => `Bestreite ${n} Kämpfe` },
  siege:     { need: 2,  gold: 60, gems: 3, text: n => `Gewinne ${n} Kämpfe` },
  kronen:    { need: 5,  gold: 50, gems: 0, text: n => `Hole ${n} Kronen` },
  zauber:    { need: 6,  gold: 40, gems: 0, text: n => `Wirke ${n} Zauber` },
  karten:    { need: 40, gold: 40, gems: 2, text: n => `Spiele ${n} Karten aus` },
  helden:    { need: 3,  gold: 30, gems: 4, text: n => `Setze ${n}-mal eine Heldenfähigkeit ein`, needs: p => Object.keys(p.cards).some(id => CARDS[id].hero) },
  aufwerten: { need: 1,  gold: 30, gems: 2, text: () => 'Werte eine Karte auf' },
};
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const seeded = seed => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

// Neuer Tag: neue Aufgaben und neue Angebote. day = 'JJJJ-MM-TT'. Gibt true zurück, wenn sich etwas geändert hat.
export function ensureDay(p, day) {
  const season = ensureSeason(p, day);
  if (p.day === day && p.quests.length) return season;
  p.day = day; p.dayWins = 0; p.modeWins = 0;
  const r = seeded(hashStr('q' + day));
  const ids = Object.keys(QUESTS).filter(id => !QUESTS[id].needs || QUESTS[id].needs(p));
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  p.quests = ids.slice(0, 3).map(id => ({ id, need: QUESTS[id].need, have: 0, claimed: false }));
  p.shop = { bought: [], gift: false };
  return true;
}
export function questProgress(p, id, n) {
  if (!n) return;
  for (const q of p.quests) if (q.id === id && !q.claimed) q.have = Math.min(q.need, q.have + n);
}
export const questsOpen = p => p.quests.filter(q => !q.claimed && q.have >= q.need).length;
// Alle drei erledigt: eine Schicksalstruhe mit zwei Funken und Furtmarken (lucky = ihre Beute)
export function claimQuest(p, i, rnd = Math.random) {
  const q = p.quests[i];
  if (!q || q.claimed || q.have < q.need) return null;
  q.claimed = true;
  const d = QUESTS[q.id];
  p.gold += d.gold; p.gems += d.gems;
  if (p.quests.length >= 3 && p.quests.every(x => x.claimed) && p.questBonus !== p.day) {
    p.questBonus = p.day; p.season.marks += MARKS.quests;
    return { gold: d.gold, gems: d.gems, marks: MARKS.quests, lucky: luckyOpen(p, 2, rnd) };
  }
  return { gold: d.gold, gems: d.gems };
}

// ---- Laden: täglich wechselnde Kartenangebote, ein Geschenk, Schicksalstruhen und Sonderdinge gegen Runensplitter ----
export const SHOP_BOXES = [{ t: 'lucky', s: 2, gems: 8 }, { t: 'lucky', s: 3, gems: 18 }, { t: 'lucky', s: 4, gems: 40 }, { t: 'runebox', gems: 45 }];
export const GOLD_PACK = { gems: 20, gold: 250 };
export function shopOffers(p) {
  const r = seeded(hashStr('s' + p.day + p.arena));
  const pool = unlockedIds(p).filter(id => p.cards[id]);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const sizes = [5, 10, 20, 40];
  return pool.slice(0, 4).map((id, i) => {
    const n = Math.max(1, Math.round(sizes[i] / COPY_VALUE[rarity(id)])), full = p.cards[id].lvl >= MAX_LEVEL; // gleicher Preis, kleinerer Stapel
    return { i, id, n, gold: sizes[i] * (4 + CARDS[id].cost), sold: p.shop.bought.includes(i) || full };
  });
}
export const giftGold = p => 40 + p.arena * 10;
// Tagesgeschenk: Gold, ein paar Runensplitter und eine Schicksalstruhe mit einem Funken (lucky = ihre Beute)
export const GIFT_GEMS = 3;
export function claimGift(p, rnd = Math.random) {
  if (p.shop.gift) return null;
  p.shop.gift = true; p.gold += giftGold(p); p.gems += GIFT_GEMS;
  return { gold: giftGold(p), gems: GIFT_GEMS, lucky: luckyOpen(p, 1, rnd) };
}
export function buyOffer(p, i) {
  const o = shopOffers(p)[i];
  if (!o || o.sold || p.gold < o.gold) return null;
  p.gold -= o.gold; p.cards[o.id].n += o.n; p.shop.bought.push(i);
  return { cards: [{ id: o.id, n: o.n }] };
}
export function buyBox(p, i, rnd = Math.random) {
  const b = SHOP_BOXES[i];
  if (!b || p.gems < b.gems) return null;
  p.gems -= b.gems;
  return grantReward(p, b, rnd);
}
export function buyWild(p) { // eine Wanderscherbe am Tag, solange der Vorrat nicht voll ist
  if (p.shop.wild || p.gems < WILD_PRICE || p.wild >= WILD_CAP) return null;
  p.gems -= WILD_PRICE; p.shop.wild = true; p.wild++;
  return { wild: 1 };
}
export function buyPotion(p) {
  if (p.gems < POTION_PRICE || p.potions >= POTION_CAP) return null;
  p.gems -= POTION_PRICE; p.potions++;
  return { potions: 1 };
}
export function buyGold(p) {
  if (p.gems < GOLD_PACK.gems) return null;
  p.gems -= GOLD_PACK.gems; p.gold += GOLD_PACK.gold;
  return { gold: GOLD_PACK.gold };
}

// ---- Spielmodi (Herausforderungen ohne Trophäen) -------------------------------------------------
// Siege zählen wie jeder Sieg für die Tagessiege; dazu gibt es Furtmarken, im Modus des Tages beim ersten Sieg auch Runensplitter.
export const MODES = {
  wahl:     { name: 'Kartenwahl',       text: 'Vier Mal zwei Karten: eine behältst du, die andere bekommt der Gegner. Alle 123 Karten, gleiche Stufe für beide.' },
  dreifach: { name: 'Dreifache Kraft',  text: 'Die Kraft fließt von Anfang an dreimal so schnell. Teure Karten, volles Feld.' },
  tod:      { name: 'Plötzlicher Tod',  text: 'Der erste zerstörte Turm entscheidet das Spiel sofort.' },
  spiegel:  { name: 'Spiegelkampf',     text: 'Der Gegner spielt genau dein Deck – auf gleicher Stufe.' },
  ansturm:  { name: 'Ansturm',          text: 'Kein Gegner mit Karten, sondern immer stärkere Wellen. Halte drei Minuten durch, ohne mehr Türme zu verlieren als du zerstörst.' },
};
export const MODE_IDS = Object.keys(MODES);
export const MODE_BONUS = 5; // Runensplitter für den ersten Sieg des Tages im Modus des Tages
export const modeOfDay = day => MODE_IDS[hashStr('m' + day) % MODE_IDS.length];
export const modeBonusOpen = p => p.modeDay !== p.day;

// Sonderregeln eines Modus für createGame
export function modeRules(p, mode) {
  if (mode === 'dreifach') return { kraftFixed: 3 };
  if (mode === 'tod') return { sudden: true };
  if (mode === 'ansturm') {
    const pool = unlockedIds(p).filter(id => CARDS[id].type === 'troop' && !CARDS[id].hero && !CARDS[id].anywhere);
    return { waves: { pool, lvl: opponentLevels(p, 'mittel').lvl } };
  }
  return {};
}
// Gleiche Stufen für beide Seiten (Kartenwahl, Spiegelkampf)
export const evenLevels = (p, towerType = DEFAULT_TOWER) => { const l = opponentLevels(p, 'mittel'); return { cards: l.cards, tower: l.lvl, lvl: l.lvl, runes: l.runes, forms: l.forms, towerType }; };

// Kartenwahl: acht Paare gleicher Art (5 Truppen, 2 Zauber, 1 Gebäude) – so bekommt jede Seite ein spielbares Deck.
export function draftPairs(rnd) {
  const take = (type, n) => {
    let ids = CARD_IDS.filter(id => CARDS[id].type === type), heroes = 0;
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    ids = ids.filter(id => !CARDS[id].hero || ++heroes <= MAX_HEROES); // höchstens drei Helden in der ganzen Auswahl
    return Array.from({ length: n }, (_, i) => [ids[i * 2], ids[i * 2 + 1]]);
  };
  const pairs = [...take('troop', 5), ...take('spell', 2), ...take('building', 1)];
  for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
  return pairs;
}
// Die ersten vier Paare wählt der Spieler (picks: 0 oder 1 je Paar), die letzten vier der Gegner.
export function draftDecks(pairs, picks, rnd) {
  const mine = [], foe = [];
  pairs.forEach((pair, i) => {
    const k = i < 4 ? picks[i] : (rnd() < 0.5 ? 0 : 1);
    (i < 4 ? mine : foe).push(pair[k]); (i < 4 ? foe : mine).push(pair[1 - k]);
  });
  return [mine, foe];
}

// ---- Bosskämpfe: ein Wächter je Arena, mit festem Deck und einer Verstärkung --------------------
export const BOSSES = [
  { name: 'Borkenhüterin Ylva',   deck: ['wurzelwichte', 'waldlaeufer', 'steinhueter', 'ballistenturm', 'raufbold', 'sturmkraehen', 'funkenweberin', 'sternschlag'], text: 'Aus ihrem Hauptturm kriecht alle 16 Sekunden ein Wurzelwicht.', rules: { passive: { unit: 'wicht', count: 1, every: 16 } } },
  { name: 'Flussvogt Garrun',     deck: ['eisenwaechter', 'eisenmarschall', 'dornwerfer', 'glutling', 'hagelschauer', 'steinhueter', 'waldlaeufer', 'ballistenturm'], text: 'Flussbefestigung: Seine Türme sind 30 % zäher.', rules: { towerHp: 1.3 } },
  { name: 'Nebelmutter Sefa',     deck: ['nebelrochen', 'nachtfalter', 'sturmkraehen', 'bolzenschuetzin', 'funkenschlag', 'erdloch', 'wurzelwichte', 'funkenweberin'], text: 'Alle 22 Sekunden steigt ein Nachtfalter von ihrem Hauptturm auf.', rules: { passive: { unit: 'nachtfalter', count: 1, every: 22 } } },
  { name: 'Schmiedemeister Dunmar', tower: 'geschuetzturm', adj: 1, deck: ['hammerschmied', 'eisenwaechter', 'schildknappen', 'zuendler', 'klingentaenzerin', 'ballistenturm', 'wurzelgriff', 'sternschlag'], text: 'Seine Türme sind gepanzert: 30 % mehr Leben. Seine Karten sind eine Stufe höher.', rules: { towerHp: 1.3 } },
  { name: 'Windruferin Astrid',   tower: 'klingenturm', adj: 1, deck: ['frostschamane', 'torknacker', 'sturmkraehen', 'nebelrochen', 'heilquell', 'eisbrocken', 'kesselturm', 'hagelschauer'], text: 'Rückenwind: Ihre Truppen laufen 10 % schneller und sind eine Stufe höher.', rules: { speed: 1.1 } },
  { name: 'Glutfürst Varek',      deck: ['glutling', 'glutofen', 'sprengkaefer', 'kieselbande', 'sturmrufer', 'steinschleuder', 'sternschlag', 'hammerschmied'], text: 'Alle acht Sekunden hüpft ein Glutling aus seinem Hauptturm.', rules: { passive: { unit: 'glutling', count: 1, every: 8 } } },
  { name: 'Sterndeuter Oswin',    deck: ['wurzelmutter', 'blasrohrwicht', 'hornbulle', 'kriegstrommel', 'rollstein', 'sternschlag', 'funkenweberin', 'bolzenschuetzin'], text: 'Sternenwind: Seine Truppen laufen ein Zehntel schneller.', rules: { speed: 1.1 } },
  { name: 'Runenkönigin Thalea',  tower: 'segensturm', adj: -2, deck: ['raufbold', 'waldlaeufer', 'steinhueter', 'eisenwaechter', 'funkenweberin', 'hammerschmied', 'ballistenturm', 'sumpfdunst'], text: 'Runenmacht: Jede ihrer Karten erscheint immer in Runenform – dafür zwei Stufen niedriger.', rules: { runeAlways: true } },
  { name: 'Frostwächter Eskil',   adj: 1, deck: ['frostnacht', 'frostschamane', 'eisbrocken', 'feldheilerin', 'wuehler', 'weitschuetzin', 'hagelschauer', 'steinhueter'], text: 'Alle 34 Sekunden löst sich ein Eisbrocken von seinem Hauptturm. Seine Karten sind eine Stufe höher.', rules: { passive: { unit: 'eisbrocken', count: 1, every: 34 } } },
  { name: 'Moorhexe Ombra',       adj: -1, deck: ['nebelschleicher', 'schattenjaegerin', 'kraehenschwarm', 'wirbelwind', 'sumpfdunst', 'nachtfalter', 'wurzelgriff', 'erdloch'], text: 'Alle 35 Sekunden schleicht ein unsichtbarer Nebelschleicher los. Ihre Karten sind dafür eine Stufe niedriger.', rules: { passive: { unit: 'nebelschleicher', count: 1, every: 35 } } },
  { name: 'Donnerbaron Rurik',    tower: 'geschuetzturm', deck: ['blitzfaenger', 'gewitterkarren', 'donnerkeil', 'fernschleuder', 'funkenschlag', 'eisenwaechter', 'bolzenschuetzin', 'sturmrufer'], text: 'Aufgeladen: 10 % mehr Kraft.', rules: { kraft: 1.1 } },
  { name: 'Kristallseher Jorin',  deck: ['sternschuetzin', 'laternenfisch', 'sonnenspiegel', 'kraftquell', 'heilquell', 'schildknappen', 'klingentaenzerin', 'sternschlag'], text: 'Kristallpanzer: Seine Türme sind um ein Fünftel zäher.', rules: { towerHp: 1.2 } },
  { name: 'Aschenkönig Mogrim',   tower: 'klingenturm', deck: ['fasstraeger', 'trommelschlaeger', 'kegler', 'felssturz', 'wurzelkoenig', 'glutling', 'sprengkaefer', 'glutofen'], text: 'Alle neun Sekunden springt ein Glutling aus seinem Hauptturm.', rules: { passive: { unit: 'glutling', count: 1, every: 9 } } },
  { name: 'Himmelsfürstin Liora', tower: 'segensturm', deck: ['panzerbaer', 'basaltriese', 'brockenwerfer', 'windlaeufer', 'donnerkeil', 'panzerhornisse', 'feldheilerin', 'frostnacht'], text: 'Herrin der Brücke: ein Fünftel mehr Kraft und um ein Viertel zähere Türme.', rules: { kraft: 1.2, towerHp: 1.25 } },
];
export const BOSS_REWARD = { gems: 20, jk: { gewoehnlich: 6, selten: 2 }, size: 3, wild: 2 };
export const bossOpen = (p, i) => i <= p.arena && !!BOSSES[i];
export const bossNext = p => { for (let i = 0; i <= p.arena; i++) if (!p.bosses.includes(i)) return i; return -1; };
// Regeln und Stufen eines Bosskampfs: der Boss spielt auf Seite 1, auf der üblichen Gegnerstufe seiner Arena –
// seine Stärke kommt aus dem abgestimmten Deck, der Verstärkung und dem schweren Computergegner
export function bossSetup(p, i) {
  const b = BOSSES[i], r = b.rules, rules = {};
  for (const k of ['kraft', 'speed', 'towerHp', 'runeAlways', 'passive']) if (r[k]) rules[k] = [null, r[k]];
  const lvl = Math.max(1, Math.min(MAX_LEVEL, opponentLevels({ arena: i }, 'mittel').lvl + (b.adj || 0))); // einzelne Bosse eine Stufe höher oder niedriger
  return { deck: [...b.deck], rules, levels: { cards: Object.fromEntries(CARD_IDS.map(id => [id, lvl])), tower: lvl, lvl, towerType: b.tower || DEFAULT_TOWER, runes: lvl >= RUNE_LEVEL || r.runeAlways ? Object.keys(RUNES) : [] } };
}

// Deck-Platz wechseln (p.deck zeigt immer auf das gewählte Deck)
export function setSlot(p, i) { p.slot = Math.max(0, Math.min(DECK_SLOTS - 1, i | 0)); p.deck = p.decks[p.slot]; }
