// Deck-Würfel: schlägt auf Knopfdruck ein Deck vor, das sich bewährt hat – eine der Deck-Vorlagen (metadecks.js), übersetzt in die
// Karten, die der Spieler besitzt. Fehlt eine Karte der Vorlage, tritt die ähnlichste eigene an ihre Stelle (gleiche Art, gleiche
// Aufgaben, ähnliche Kosten); am Ende wird geprüft, dass das Deck ein Mittel gegen Türme, einen Zauber und etwas gegen Flieger hat
// und nicht zu teuer ist. Die Reihenfolge passt zu den besonderen Deck-Plätzen (Runenplatz, Heldenplatz).
//   rollDeck(profile, rnd, { avoid })  →  { deck, name, base, full, swaps: [[fehlt, ersatz], …] }
import { CARDS } from './cards.js';
import { cardInfo } from './ai.js';
import * as P from './progress.js';
import { META } from './metadecks.js';

export const avgCost = d => d.reduce((s, id) => s + (CARDS[id].cost || 0), 0) / d.length;
const ownedCards = p => Object.keys(p.cards).filter(id => CARDS[id] && CARDS[id].type !== 'tower');
const has = (id, role) => cardInfo(id).roles.includes(role);
const isSpell = id => CARDS[id].type === 'spell';
const antiAir = id => has(id, 'luftabwehr') || (isSpell(id) && cardInfo(id).kind === 'dmg');
// Mittel gegen Türme: Truppen und Bauten, die auf Türme gehen – und Zauber, die Truppen am Turm absetzen (Wichtwurf, Geröllfeld)
export const isWin = id => has(id, 'sieg') || (isSpell(id) && cardInfo(id).kind === 'summon');

// Wie gut ersetzt b die Karte a?
export function fit(a, b) {
  const A = cardInfo(a), B = cardInfo(b);
  let s = CARDS[a].type === CARDS[b].type ? 3 : 0;
  for (const r of A.roles) if (B.roles.includes(r)) s += 2;
  for (const r of B.roles) if (!A.roles.includes(r)) s -= 0.4;
  s -= Math.abs(CARDS[a].cost - CARDS[b].cost) * 0.9;
  if (!!CARDS[a].hero !== !!CARDS[b].hero) s -= 1.5;
  return s;
}

export function rollDeck(p, rnd = Math.random, { avoid = [] } = {}) {
  const own = ownedCards(p), have = new Set(own), lvl = id => (p.cards[id] ? p.cards[id].lvl : 0);
  if (own.length < 8) return null;
  const key = d => [...d].sort().join(','), skip = new Set([key(p.deck), ...avoid.map(key)]);
  // Vorlagen nach Eignung: möglichst viele eigene Karten, dann deren Stufen, dazu etwas Zufall
  const ranked = META.map((m, i) => { const mine = m.d.filter(id => have.has(id)); return { m, i, n: mine.length, s: mine.length * 10 + mine.reduce((a, id) => a + lvl(id), 0) / 8 + rnd() * 6 }; })
    .sort((a, b) => b.s - a.s);
  const full = ranked.filter(r => r.n === 8 && !skip.has(key(r.m.d)));
  const pool = full.length ? full : ranked.slice(0, 5);
  const pick = pool[Math.floor(rnd() * pool.length)], deck = [...pick.m.d], swaps = [];
  const free = () => own.filter(id => !deck.includes(id));
  const best = (cands, score) => cands.map(id => [score(id) + lvl(id) * 0.12 + rnd() * 0.6, id]).sort((a, b) => b[0] - a[0]).map(x => x[1])[0];
  // fehlende Karten ersetzen
  for (let i = 0; i < 8; i++) {
    const a = deck[i];
    if (have.has(a)) continue;
    const b = best(free(), id => fit(a, id));
    deck[i] = b; swaps.push([a, b]);
  }
  // Prüfungen: Mittel gegen Türme, ein Zauber, etwas gegen Flieger, nicht zu teuer
  const weakest = keep => deck.map((id, i) => [i, id]).filter(([, id]) => !keep(id)).sort((x, y) => lvl(x[1]) - lvl(y[1]) || CARDS[y[1]].cost - CARDS[x[1]].cost)[0];
  const need = test => {
    if (deck.some(test)) return;
    const c = free().filter(test); if (!c.length) return;
    const w = weakest(id => isWin(id) || isSpell(id)); if (!w) return;
    const b = best(c, id => -Math.abs(CARDS[id].cost - CARDS[w[1]].cost));
    swaps.push([w[1], b]); deck[w[0]] = b;
  };
  if (swaps.length) { need(isWin); need(isSpell); need(antiAir); }   // eine vollständige Vorlage bleibt, wie sie ist
  for (let n = 0; n < 3 && swaps.length && avgCost(deck) > 4.5; n++) {
    const w = deck.map((id, i) => [i, id]).filter(([, id]) => !isWin(id)).sort((x, y) => CARDS[y[1]].cost - CARDS[x[1]].cost)[0];
    const c = free().filter(id => CARDS[id].cost <= 3 && CARDS[id].type === CARDS[w[1]].type); if (!c.length) break;
    const b = best(c, id => fit(w[1], id)); swaps.push([w[1], b]); deck[w[0]] = b;
  }
  const ordered = P.slotOrder(deck, p.arena, { pool: own, runes: own.filter(id => P.hasRune(p, id)), forms: own.filter(id => P.hasForm(p, id)) });
  return { deck: ordered, name: pick.m.n, base: pick.i, full: swaps.length === 0, swaps: swaps.filter(([a, b]) => ordered.includes(b)) };
}

// Das vorgeschlagene Deck in den gewählten Deck-Platz legen
export function applyDeck(p, deck) {
  if (!deck || deck.length !== 8 || new Set(deck).size !== 8 || deck.some(id => !p.cards[id] || CARDS[id].type === 'tower')) return false;
  p.decks[p.slot].splice(0, 8, ...deck); p.deck = p.decks[p.slot];
  return true;
}
