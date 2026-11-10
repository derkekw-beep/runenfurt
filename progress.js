// Fortschritt: Trophäen, Arenen, Kartenstufen, Gold, Truhen. Reine Funktionen auf einem Profil-Objekt.
// Aufbau nach dem üblichen Muster des Genres: Siege bringen Trophäen und eine Truhe, Trophäen öffnen Arenen,
// Arenen schalten Karten frei, doppelte Karten + Gold heben die Kartenstufe, Aufwerten bringt Erfahrung.
import { CARDS, UNITS, RUNES, RUNE_LEVEL, CARD_IDS, DEFAULT_DECK, sanitizeDeck } from './cards.js';

export const ARENAS = [
  { name: 'Moosgrund',  at: 0,    unlock: DEFAULT_DECK },
  { name: 'Kieselfurt', at: 300,  unlock: ['eisenwaechter', 'hagelschauer', 'glutling', 'eisenmarschall'] },
  { name: 'Nebelhain',  at: 600,  unlock: ['nebelrochen', 'erdloch', 'bolzenschuetzin', 'funkenschlag'] },
  { name: 'Eisenklamm', at: 1000, unlock: ['hammerschmied', 'wurzelgriff', 'klingentaenzerin'] },
  { name: 'Sturmhöhe',  at: 1300, unlock: ['torknacker', 'heilquell', 'frostschamane'] },
  { name: 'Glutkessel', at: 1600, unlock: ['kieselbande', 'steinschleuder', 'sturmrufer'] },
  { name: 'Sternwarte', at: 2000, unlock: ['wurzelmutter', 'hornbulle', 'kriegstrommel'] },
  { name: 'Runenthron', at: 2300, unlock: ['erzritter', 'donnerkaefer', 'sumpfdunst'] },
];
export const MAX_LEVEL = 9;
// Aufwertung von Stufe n auf n+1: Index n-1
export const UP_COPIES = [2, 4, 10, 20, 50, 100, 200, 400];
export const UP_GOLD = [5, 20, 50, 150, 400, 1000, 2000, 4000];
export const UP_XP = [4, 5, 6, 10, 25, 50, 100, 200];
export const LEVEL_XP = [20, 50, 100, 200, 400, 800, 1600, 3200]; // Erfahrung für Spielerstufe 2, 3, …
export const TROPHY = { leicht: [24, -16], mittel: [30, -22], schwer: [36, -28] };

export function newProfile() {
  const cards = {};
  for (const id of DEFAULT_DECK) cards[id] = { lvl: 1, n: 0 };
  return { v: 1, trophies: 0, best: 0, arena: 0, gold: 0, xp: 0, cards, deck: [...DEFAULT_DECK], level: 'leicht', sound: true, wins: 0, losses: 0, draws: 0, seenHelp: false };
}

// Gespeichertes Profil prüfen und fehlende Felder ergänzen (nie abstürzen, wenn der Speicher beschädigt ist).
export function loadProfile(raw) {
  const p = newProfile();
  let d = null;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { d = null; }
  if (!d || typeof d !== 'object') return p;
  const num = (v, def) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : def);
  p.trophies = num(d.trophies, 0); p.best = Math.max(num(d.best, 0), p.trophies); p.gold = num(d.gold, 0); p.xp = num(d.xp, 0);
  p.wins = num(d.wins, 0); p.losses = num(d.losses, 0); p.draws = num(d.draws, 0);
  p.arena = Math.min(ARENAS.length - 1, Math.max(num(d.arena, 0), arenaIndex(p.best)));
  if (TROPHY[d.level]) p.level = d.level;
  p.sound = d.sound !== false; p.seenHelp = !!d.seenHelp;
  for (const id of unlockedIds(p)) {
    const c = d.cards && d.cards[id];
    p.cards[id] = { lvl: Math.min(MAX_LEVEL, Math.max(1, num(c && c.lvl, 1))), n: num(c && c.n, 0) };
  }
  p.deck = sanitizeDeck((Array.isArray(d.deck) ? d.deck : []).filter(id => p.cards[id])).filter(id => p.cards[id]);
  for (const id of DEFAULT_DECK) if (p.deck.length < 8 && !p.deck.includes(id)) p.deck.push(id);
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
  return { lvl: c.lvl, levelUp: playerLevel(p.xp).lvl > before };
}

// Hat der Spieler die Runenform dieser Karte? (ab Kartenstufe RUNE_LEVEL)
export const hasRune = (p, id) => !!(RUNES[id] && p.cards[id] && p.cards[id].lvl >= RUNE_LEVEL);

// Stufen für createGame: eigene Karten, Turmstufe und freigeschaltete Runenformen
export const playerLevels = p => ({
  cards: Object.fromEntries(Object.entries(p.cards).map(([id, c]) => [id, c.lvl])),
  tower: playerLevel(p.xp).lvl,
  runes: Object.keys(RUNES).filter(id => hasRune(p, id)),
});

// Der Computergegner wächst mit der Arena, auf Leicht eine Stufe darunter.
export function opponentLevels(p, level) {
  const lvl = Math.max(1, Math.min(MAX_LEVEL, p.arena + 1 - (level === 'leicht' ? 1 : 0)));
  return { cards: Object.fromEntries(CARD_IDS.map(id => [id, lvl])), tower: lvl, lvl, runes: lvl >= RUNE_LEVEL ? Object.keys(RUNES) : [] };
}

// Gegnerdeck: acht Karten aus allem, was bis zu dieser Arena freigeschaltet ist – immer mit Luftabwehr und einem Zauber.
export function opponentDeck(p, rnd) {
  const pool = unlockedIds(p);
  for (let tries = 0; tries < 40; tries++) {
    const ids = [...pool];
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const deck = ids.slice(0, 8);
    const spells = deck.filter(id => CARDS[id].type === 'spell').length;
    const troops = deck.filter(id => CARDS[id].type === 'troop').length;
    const antiAir = deck.filter(id => CARDS[id].type !== 'spell' && UNITS[CARDS[id].unit].hitsAir).length;
    if (troops >= 4 && spells <= 2 && antiAir >= 2) return deck;
  }
  return [...DEFAULT_DECK];
}

// Truhe nach einem Sieg: Gold und Kartenstapel aus den freigeschalteten Karten.
export function rollChest(p, crowns, rnd) {
  const gold = 30 + p.arena * 15 + crowns * 5 + Math.floor(rnd() * 11);
  const pool = unlockedIds(p).filter(id => p.cards[id] && p.cards[id].lvl < MAX_LEVEL);
  let total = 8 + p.arena * 3;
  const stacks = {};
  const kinds = Math.min(pool.length, 3);
  for (let i = 0; i < kinds && total > 0; i++) {
    let id;
    do { id = pool[Math.floor(rnd() * pool.length)]; } while (stacks[id]);
    const n = i === kinds - 1 ? total : Math.max(1, Math.round(total * (0.3 + rnd() * 0.3)));
    stacks[id] = n; total -= n;
  }
  return { gold, cards: Object.entries(stacks).map(([id, n]) => ({ id, n })) };
}

// Spielergebnis verbuchen. winner: 0 = Spieler, 1 = Computer, 'draw'. Gibt zurück, was sich geändert hat.
export function applyResult(p, { winner, level, crowns = 0 }, rnd = Math.random) {
  const out = { delta: 0, chest: null, arenaUp: null, newCards: [] };
  if (winner === 'draw') { p.draws++; return out; }
  const [win, loss] = TROPHY[level] || TROPHY.mittel;
  const floor = ARENAS[p.arena].at; // einmal erreichte Arenen verliert man nicht mehr
  const before = p.trophies;
  if (winner === 0) { p.wins++; p.trophies += win; } else { p.losses++; p.trophies = Math.max(floor, p.trophies + loss); }
  out.delta = p.trophies - before;
  p.best = Math.max(p.best, p.trophies);
  const a = arenaIndex(p.trophies);
  if (a > p.arena) {
    p.arena = a; out.arenaUp = ARENAS[a].name;
    for (const ar of ARENAS.slice(0, a + 1)) for (const id of ar.unlock) if (!p.cards[id]) { p.cards[id] = { lvl: 1, n: 0 }; out.newCards.push(id); }
  }
  if (winner === 0) {
    out.chest = rollChest(p, crowns, rnd);
    p.gold += out.chest.gold;
    for (const s of out.chest.cards) p.cards[s.id].n += s.n;
  }
  return out;
}
