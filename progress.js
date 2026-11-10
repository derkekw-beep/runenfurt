// Fortschritt: Trophäen, Arenen, Kartenstufen, Gold, Runensplitter, Truhen, Trophäenweg, Tagesaufgaben, Laden.
// Reine Funktionen auf einem Profil-Objekt (kein Browser, keine Uhr – der Tag wird von außen hereingereicht).
// Aufbau nach dem üblichen Muster des Genres: Siege bringen Trophäen und eine Truhe, Trophäen öffnen Arenen,
// Arenen schalten Karten frei, doppelte Karten + Gold heben die Kartenstufe, Aufwerten bringt Erfahrung.
import { CARDS, UNITS, RUNES, RUNE_LEVEL, CARD_IDS, TOWER_IDS, DEFAULT_TOWER, DEFAULT_DECK, MAX_HEROES, heroCount, sanitizeDeck } from './cards.js';

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
export const CROWN_BOX = 10; // so viele Kronen füllen die Kronentruhe
export const QUALITIES = ['hoch', 'mittel', 'niedrig'];

const num = (v, def) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : def);
const newStats = () => ({ crowns: 0, three: 0, streak: 0, bestStreak: 0, cards: 0, spells: 0, abilities: 0, played: {} });
const newSet = () => ({ volume: 0.8, quality: 'hoch', fps: false, lefty: false, shake: true });

export function newProfile() {
  const cards = {};
  for (const id of ARENAS[0].unlock) cards[id] = { lvl: 1, n: 0 };
  const decks = Array.from({ length: DECK_SLOTS }, () => [...DEFAULT_DECK]);
  return {
    v: 2, trophies: 0, best: 0, arena: 0, gold: 0, gems: 0, xp: 0, cards, decks, slot: 0, deck: decks[0], level: 'leicht', sound: true,
    wins: 0, losses: 0, draws: 0, seenHelp: false, name: 'Runenwächter', set: newSet(), stats: newStats(), log: [],
    crownBox: 0, road: [], day: '', quests: [], shop: { bought: [], gift: false }, jokers: 0, wish: '', bosses: [], modeDay: '', towerSel: DEFAULT_TOWER,
  };
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
  p.crownBox = num(d.crownBox, 0); p.jokers = num(d.jokers, 0);
  if (typeof d.wish === 'string' && p.cards[d.wish]) p.wish = d.wish;
  if (Array.isArray(d.bosses)) p.bosses = [...new Set(d.bosses.filter(i => Number.isInteger(i) && i >= 0 && i < BOSSES.length))];
  if (typeof d.modeDay === 'string') p.modeDay = d.modeDay.slice(0, 10);
  if (TOWER_IDS.includes(d.towerSel) && p.cards[d.towerSel]) p.towerSel = d.towerSel;
  if (Array.isArray(d.road)) p.road = [...new Set(d.road.filter(a => ROAD.some(r => r.at === a)))];
  if (typeof d.day === 'string') p.day = d.day.slice(0, 10);
  if (Array.isArray(d.quests)) p.quests = d.quests.filter(q => q && QUESTS[q.id]).slice(0, 3).map(q => ({ id: q.id, need: Math.max(1, num(q.need, 1)), have: num(q.have, 0), claimed: !!q.claimed }));
  if (d.shop && typeof d.shop === 'object') p.shop = { bought: Array.isArray(d.shop.bought) ? d.shop.bought.filter(i => Number.isInteger(i) && i >= 0 && i < 8) : [], gift: !!d.shop.gift };
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
  const copies = UP_COPIES[c.lvl - 1], gold = UP_GOLD[c.lvl - 1];
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
  return { lvl: c.lvl, levelUp };
}

// Joker ersetzen fehlende Karten beim Aufwerten – für jede beliebige Karte.
export function jokerInfo(p, id) {
  const c = p.cards[id], u = upgradeInfo(p, id);
  if (!c || !u || u.max) return { missing: 0, use: 0 };
  const missing = Math.max(0, u.copies - c.n);
  return { missing, use: Math.min(missing, p.jokers) };
}
export function useJokers(p, id) {
  const { use } = jokerInfo(p, id);
  if (!use) return 0;
  p.cards[id].n += use; p.jokers -= use;
  return use;
}
// Wunschkarte festlegen (noch einmal dieselbe Karte hebt den Wunsch auf)
export function setWish(p, id) { p.wish = p.cards[id] && p.wish !== id ? id : ''; return p.wish; }
// Karten, die sich gerade aufwerten lassen, die billigsten zuerst
export const upgradable = p => Object.keys(p.cards).filter(id => upgradeInfo(p, id).can).sort((a, b) => upgradeInfo(p, a).gold - upgradeInfo(p, b).gold);

// Hat der Spieler die Runenform dieser Karte? (ab Kartenstufe RUNE_LEVEL)
export const hasRune = (p, id) => !!(RUNES[id] && p.cards[id] && p.cards[id].lvl >= RUNE_LEVEL);

// Stufen für createGame: eigene Karten, Hauptturm (= Spielerstufe), Art und Stufe der Außentürme, Runenformen
export const playerLevels = p => ({
  cards: Object.fromEntries(Object.entries(p.cards).map(([id, c]) => [id, c.lvl])),
  tower: playerLevel(p.xp).lvl, towerType: p.towerSel, outer: p.cards[p.towerSel].lvl,
  runes: Object.keys(RUNES).filter(id => hasRune(p, id)),
});

// Der Computergegner wächst mit der Arena, auf Leicht eine Stufe darunter.
export function opponentLevels(p, level) {
  const base = 1 + Math.round((p.arena * (MAX_LEVEL - 1)) / (ARENAS.length - 1));
  const lvl = Math.max(1, Math.min(MAX_LEVEL, base - (level === 'leicht' ? 1 : 0)));
  return { cards: Object.fromEntries(CARD_IDS.map(id => [id, lvl])), tower: lvl, lvl, runes: lvl >= RUNE_LEVEL ? Object.keys(RUNES) : [] };
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
export function rollChest(p, crowns, rnd, size = 1) {
  const gold = Math.round((30 + p.arena * 15 + crowns * 5 + Math.floor(rnd() * 11)) * size);
  const pool = unlockedIds(p).filter(id => p.cards[id] && p.cards[id].lvl < MAX_LEVEL);
  let total = Math.round((8 + p.arena * 3) * size);
  const jokers = Math.max(1, Math.round(total * 0.12));
  const stacks = {};
  const wish = p.wish && pool.includes(p.wish) ? p.wish : '';
  if (wish) { stacks[wish] = Math.max(1, Math.round(total * 0.4)); total -= stacks[wish]; }
  const kinds = Math.min(pool.length - (wish ? 1 : 0), size >= 3 ? 5 : size > 1 ? 4 : 3);
  for (let i = 0; i < kinds && total > 0; i++) {
    let id;
    do { id = pool[Math.floor(rnd() * pool.length)]; } while (stacks[id]);
    const n = i === kinds - 1 ? total : Math.max(1, Math.round(total * (0.3 + rnd() * 0.3)));
    stacks[id] = n; total -= n;
  }
  if (wish && total > 0) stacks[wish] += total; // nichts verfällt, wenn sonst keine Karte mehr in Frage kommt
  return { gold, cards: Object.entries(stacks).map(([id, n]) => ({ id, n })), jokers };
}
function grantChest(p, chest) {
  p.gold += chest.gold; p.jokers += chest.jokers || 0;
  for (const s of chest.cards) p.cards[s.id].n += s.n;
  return chest;
}

// Spielergebnis verbuchen. winner: 0 = Spieler, 1 = Computer, 'draw'. Gibt zurück, was sich geändert hat.
// Zusätzliche Angaben (alle freiwillig): foeCrowns, foe, when, played {Karte: Anzahl}, spells, abilities, training.
export function applyResult(p, res, rnd = Math.random) {
  const { winner, level, crowns = 0 } = res;
  const out = { delta: 0, chest: null, arenaUp: null, newCards: [], gems: 0, crownBox: false, bonus: 0, bossFirst: false };
  if (res.training) return out; // Übungskampf: zählt nicht
  const ranked = !res.mode && res.boss == null; // nur der normale Kampf zählt für Trophäen
  const st = p.stats;
  for (const [id, n] of Object.entries(res.played || {})) if (CARDS[id]) { st.played[id] = (st.played[id] || 0) + n; st.cards += n; }
  st.spells += res.spells || 0; st.abilities += res.abilities || 0; st.crowns += crowns;
  questProgress(p, 'kaempfe', 1); questProgress(p, 'kronen', crowns); questProgress(p, 'zauber', res.spells || 0);
  questProgress(p, 'karten', Object.values(res.played || {}).reduce((s, n) => s + n, 0)); questProgress(p, 'helden', res.abilities || 0);
  const before = p.trophies, boxBefore = p.crownBox;
  p.crownBox += crowns;
  out.crownBox = boxBefore < CROWN_BOX && p.crownBox >= CROWN_BOX;
  if (!ranked) {
    if (winner === 0) {
      questProgress(p, 'siege', 1);
      if (res.boss != null && BOSSES[res.boss] && !p.bosses.includes(res.boss)) { // erster Sieg über diesen Boss: große Belohnung
        p.bosses.push(res.boss); out.bossFirst = true;
        const save = p.arena; p.arena = Math.max(p.arena, res.boss);
        out.chest = grantChest(p, { ...rollChest(p, 3, rnd, BOSS_REWARD.size), gems: BOSS_REWARD.gems });
        p.arena = save;
        p.jokers += BOSS_REWARD.jokers; out.chest.jokers += BOSS_REWARD.jokers; p.gems += BOSS_REWARD.gems;
      } else out.chest = grantChest(p, rollChest(p, crowns, rnd, 0.7));
      if (res.mode && res.mode === modeOfDay(p.day) && modeBonusOpen(p)) { p.modeDay = p.day; p.gems += MODE_BONUS; out.bonus = MODE_BONUS; }
    }
    p.log.unshift({ w: winner === 0 || winner === 1 ? winner : 'draw', c: [crowns, num(res.foeCrowns, 0)], d: 0, lv: TROPHY[level] ? level : 'mittel', foe: typeof res.foe === 'string' ? res.foe.slice(0, 16) : '', t: num(res.when, 0) });
    p.log.length = Math.min(p.log.length, 12);
    return out;
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
  p.log.unshift({ w: winner === 0 || winner === 1 ? winner : 'draw', c: [crowns, num(res.foeCrowns, 0)], d: out.delta, lv: TROPHY[level] ? level : 'mittel', foe: typeof res.foe === 'string' ? res.foe.slice(0, 16) : '', t: num(res.when, 0) });
  p.log.length = Math.min(p.log.length, 12);
  const a = arenaIndex(p.trophies);
  if (a > p.arena) {
    p.arena = a; out.arenaUp = ARENAS[a].name; out.gems = 10; p.gems += 10;
    for (const ar of ARENAS.slice(0, a + 1)) for (const id of ar.unlock) if (!p.cards[id]) { p.cards[id] = { lvl: 1, n: 0 }; out.newCards.push(id); }
  }
  if (winner === 0) out.chest = grantChest(p, rollChest(p, crowns, rnd));
  return out;
}

// ---- Kronentruhe -------------------------------------------------------------------------------
export function claimCrownBox(p, rnd = Math.random) {
  if (p.crownBox < CROWN_BOX) return null;
  p.crownBox -= CROWN_BOX;
  p.gems += 5;
  return { ...grantChest(p, rollChest(p, 3, rnd, 2)), gems: 5 };
}

// ---- Trophäenweg: alle 100 Trophäen eine Belohnung, abzuholen sobald die Bestmarke reicht -----------
export const ROAD = Array.from({ length: 50 }, (_, i) => {
  const at = (i + 1) * 100, a = arenaIndex(at);
  return i % 3 === 1 ? { at, kind: 'chest', size: 1.5 } : i % 3 === 2 ? { at, kind: 'gems', n: 10 } : { at, kind: 'gold', n: 80 + a * 30 };
});
export const roadOpen = p => ROAD.filter(r => p.best >= r.at && !p.road.includes(r.at));
export function claimRoad(p, at, rnd = Math.random) {
  const r = ROAD.find(x => x.at === at);
  if (!r || p.best < at || p.road.includes(at)) return null;
  p.road.push(at);
  if (r.kind === 'gold') { p.gold += r.n; return { gold: r.n, cards: [] }; }
  if (r.kind === 'gems') { p.gems += r.n; return { gold: 0, gems: r.n, cards: [] }; }
  const save = p.arena; p.arena = Math.min(p.arena, arenaIndex(at)); // Inhalt nach der Arena des Meilensteins
  const chest = rollChest(p, 2, rnd, r.size); p.arena = save;
  return grantChest(p, chest);
}

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
  if (p.day === day && p.quests.length) return false;
  p.day = day;
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
export function claimQuest(p, i) {
  const q = p.quests[i];
  if (!q || q.claimed || q.have < q.need) return null;
  q.claimed = true;
  const d = QUESTS[q.id];
  p.gold += d.gold; p.gems += d.gems;
  return { gold: d.gold, gems: d.gems };
}

// ---- Laden: täglich wechselnde Kartenangebote, ein Geschenk, Truhen gegen Runensplitter --------------
export const CHESTS = {
  holz:  { name: 'Holztruhe',  gems: 15, size: 1.5 },
  runen: { name: 'Runentruhe', gems: 50, size: 5 },
};
export const GOLD_PACK = { gems: 20, gold: 250 };
export function shopOffers(p) {
  const r = seeded(hashStr('s' + p.day + p.arena));
  const pool = unlockedIds(p).filter(id => p.cards[id]);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const sizes = [5, 10, 20, 40];
  return pool.slice(0, 4).map((id, i) => {
    const n = sizes[i], full = p.cards[id].lvl >= MAX_LEVEL;
    return { i, id, n, gold: n * (4 + CARDS[id].cost), sold: p.shop.bought.includes(i) || full };
  });
}
export const giftGold = p => 40 + p.arena * 10;
export function claimGift(p) {
  if (p.shop.gift) return null;
  p.shop.gift = true; p.gold += giftGold(p);
  return { gold: giftGold(p) };
}
export function buyOffer(p, i) {
  const o = shopOffers(p)[i];
  if (!o || o.sold || p.gold < o.gold) return null;
  p.gold -= o.gold; p.cards[o.id].n += o.n; p.shop.bought.push(i);
  return { cards: [{ id: o.id, n: o.n }] };
}
export function buyChest(p, kind, rnd = Math.random) {
  const c = CHESTS[kind];
  if (!c || p.gems < c.gems) return null;
  p.gems -= c.gems;
  return grantChest(p, rollChest(p, 3, rnd, c.size));
}
export function buyGold(p) {
  if (p.gems < GOLD_PACK.gems) return null;
  p.gems -= GOLD_PACK.gems; p.gold += GOLD_PACK.gold;
  return { gold: GOLD_PACK.gold };
}

// ---- Spielmodi (Herausforderungen ohne Trophäen) -------------------------------------------------
// Jeder Sieg bringt eine kleinere Truhe; der Modus des Tages gibt beim ersten Sieg zusätzlich Runensplitter.
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
export const evenLevels = (p, towerType = DEFAULT_TOWER) => { const l = opponentLevels(p, 'mittel'); return { cards: l.cards, tower: l.lvl, lvl: l.lvl, runes: l.runes, towerType }; };

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
export const BOSS_REWARD = { gems: 20, jokers: 6, size: 3 };
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
