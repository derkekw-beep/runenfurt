// Karten und Einheiten von Runenfurt. Reine Daten, keine Abhängigkeiten.
// Längen in Feldern, Zeiten in Sekunden, Tempo in Feldern pro Sekunde.
// Größenordnungen (Leben, Schaden, Tempo- und Reichweiten-Klassen, Türme, Zauber-Anteil auf Türme) folgen den
// üblichen Turnierwerten des Genres; die Karten selbst sind eigene.

const SLOW = 0.75, MEDIUM = 1.0, FAST = 1.5, VERY_FAST = 2.0; // Tempo-Klassen
const SHORT = 0.6, REACH = 1.0;                                // Nahkampf-Reichweiten

export const UNITS = {
  raufbold:        { hp: 860,  dmg: 115, atk: 1.0, range: SHORT, speed: FAST, r: 0.42 },
  waldlaeufer:     { hp: 300,  dmg: 108, atk: 0.9, range: 5.0, speed: MEDIUM, r: 0.36, hitsAir: true, proj: 11 },
  steinhueter:     { hp: 3900, dmg: 250, atk: 1.5, range: REACH, speed: SLOW, r: 0.78, targets: 'buildings' },
  wicht:           { hp: 195,  dmg: 115, atk: 1.1, range: SHORT, speed: VERY_FAST, r: 0.28 },
  kraehe:          { hp: 225,  dmg: 105, atk: 1.1, range: REACH, speed: FAST, r: 0.3, air: true, hitsAir: true },
  rochen:          { hp: 1150, dmg: 165, atk: 1.5, range: 3.5, speed: FAST, r: 0.6, air: true, hitsAir: true, proj: 8, splash: 1.2 },
  funkenweberin:   { hp: 740,  dmg: 295, atk: 1.4, range: 5.5, speed: MEDIUM, r: 0.38, hitsAir: true, proj: 9, splash: 1.5 },
  torknacker:      { hp: 1650, dmg: 310, atk: 1.6, range: SHORT, speed: VERY_FAST, r: 0.5, targets: 'buildings' },
  eisenwaechter:   { hp: 1750, dmg: 200, atk: 1.2, range: REACH, speed: MEDIUM, r: 0.48 },
  hammerschmied:   { hp: 1380, dmg: 740, atk: 1.6, range: SHORT, speed: FAST, r: 0.5 },
  glutling:        { hp: 215,  dmg: 210, atk: 1.0, range: 2.0, speed: VERY_FAST, r: 0.26, hitsAir: true, splash: 1.5, kamikaze: true },
  klingentaenzerin:{ hp: 1850, dmg: 260, atk: 1.5, range: REACH, speed: MEDIUM, r: 0.46, spin: 1.7 },
  bolzenschuetzin: { hp: 720,  dmg: 215, atk: 1.0, range: 6.0, speed: MEDIUM, r: 0.38, hitsAir: true, proj: 14 },
  donnerkaefer:    { hp: 1650, dmg: 630, atk: 2.0, range: SHORT, speed: MEDIUM, r: 0.62, air: true, targets: 'buildings', deathDmg: { dmg: 240, r: 2.0 } },
  frostschamane:   { hp: 690,  dmg: 90,  atk: 1.7, range: 5.5, speed: MEDIUM, r: 0.38, hitsAir: true, proj: 9, splash: 1.2, slow: 2.5 },
  kiesel:          { hp: 85,   dmg: 85,  atk: 1.1, range: SHORT, speed: FAST, r: 0.2 },
  erzritter:       { hp: 3700, dmg: 820, atk: 1.8, range: REACH, speed: SLOW, r: 0.66 },
  wurzelmutter:    { hp: 840,  dmg: 135, atk: 1.1, range: 5.5, speed: MEDIUM, r: 0.42, hitsAir: true, proj: 9, splash: 1.0, spawn: { unit: 'wicht', every: 7, count: 2, first: 1 } },
  hornbulle:       { hp: 1900, dmg: 390, atk: 1.4, range: REACH, speed: MEDIUM, r: 0.6, charge: { after: 2.5, speed: 2, dmg: 2 } },
  steinling:       { hp: 1040, dmg: 85,  atk: 2.5, range: SHORT, speed: SLOW, r: 0.5, targets: 'buildings' },
  // Helden: eine auslösbare Fähigkeit, nur einmal gleichzeitig auf dem Feld
  marschall:       { hp: 1800, dmg: 160, atk: 0.9, range: REACH, speed: MEDIUM, r: 0.52, hero: true },
  sturmrufer:      { hp: 1000, dmg: 230, atk: 1.2, range: 5.0, speed: MEDIUM, r: 0.42, hitsAir: true, proj: 12, hero: true },
  // Gebäude
  ballista:        { building: true, hp: 1180, life: 30, dmg: 215, atk: 1.1, range: 5.5, r: 0.8, hitsAir: true, proj: 14 },
  steinschleuder:  { building: true, hp: 830,  life: 30, dmg: 210, atk: 1.0, range: 5.5, r: 0.75, proj: 10 },
  erdloch:         { building: true, hp: 1150, life: 30, r: 0.8, spawn: { unit: 'wicht', every: 3.2, count: 1, first: 1 } },
  aussenturm:      { tower: true, hp: 3052, dmg: 109, atk: 0.8, range: 7.5, r: 1.0, hitsAir: true, proj: 14 },
  hauptturm:       { tower: true, main: true, hp: 4824, dmg: 109, atk: 1.0, range: 7.0, r: 1.3, hitsAir: true, proj: 14 },
};

// Runenformen: stärkere Fassung einer Karte, die nach einigen Ausspielungen („Zyklen“) erscheint.
// Bei 2 Zyklen ist jede dritte Karte die Runenform.
const rune = (base, extra) => ({ ...UNITS[base], ...extra, rune: true, model: base });
Object.assign(UNITS, {
  raufbold_r:      rune('raufbold', { hp: 1030, frenzy: { max: 3, f: 0.82 } }),
  waldlaeufer_r:   rune('waldlaeufer', { range: 6.0, splash: 0.9 }),
  wicht_r:         rune('wicht', { deathDmg: { dmg: 90, r: 1.1 } }),
  steinhueter_r:   rune('steinhueter', { deathSpawn: { unit: 'steinling', count: 2 }, deathDmg: { dmg: 230, r: 2.2 } }),
  eisenwaechter_r: rune('eisenwaechter', { guard: 0.5 }),
  ballista_r:      rune('ballista', { multi: 2 }),
});

export const RUNES = {
  raufbold:      { cycles: 2, unit: 'raufbold_r',      desc: '20 % mehr Leben. Jeder Treffer macht seine Schläge schneller (bis zu dreimal).' },
  waldlaeufer:   { cycles: 2, unit: 'waldlaeufer_r',   desc: 'Ein Feld mehr Reichweite; die Pfeile treffen alles dicht um das Ziel.' },
  wurzelwichte:  { cycles: 2, unit: 'wicht_r', count: 6, desc: 'Sechs statt vier Wichte, die beim Tod Dornen in alle Richtungen schießen.' },
  steinhueter:   { cycles: 1, unit: 'steinhueter_r',   desc: 'Zerbricht beim Tod in zwei Steinlinge und reißt Gegner ringsum mit.' },
  eisenwaechter: { cycles: 2, unit: 'eisenwaechter_r', desc: 'Hält den Schild hoch: nimmt beim Laufen nur halben Schaden.' },
  ballistenturm: { cycles: 2, unit: 'ballista_r',      desc: 'Verschießt zwei Bolzen auf einmal – auf zwei verschiedene Ziele.' },
};
export const RUNE_LEVEL = 3; // ab dieser Kartenstufe ist die Runenform verfügbar

export const CARDS = {
  raufbold:      { name: 'Raufbold',      cost: 2, type: 'troop', unit: 'raufbold', count: 1, role: 'Nahkampf',
                   desc: 'Flinker Schläger. Billig, lenkt ab und räumt Fernkämpfer weg.' },
  waldlaeufer:   { name: 'Waldläufer',    cost: 3, type: 'troop', unit: 'waldlaeufer', count: 2, role: 'Fernkampf',
                   desc: 'Zwei Schützen mit großer Reichweite. Treffen auch Flieger.' },
  steinhueter:   { name: 'Steinhüter',    cost: 5, type: 'troop', unit: 'steinhueter', count: 1, role: 'Tank',
                   desc: 'Wandelnder Fels. Hält enorm viel aus und greift nur Gebäude und Türme an.' },
  wurzelwichte:  { name: 'Wurzelwichte',  cost: 2, type: 'troop', unit: 'wicht', count: 4, role: 'Schwarm',
                   desc: 'Vier flinke Biester. Zerlegen einzelne Gegner, fallen aber bei Flächenschaden sofort.' },
  sturmkraehen:  { name: 'Sturmkrähen',   cost: 3, type: 'troop', unit: 'kraehe', count: 3, role: 'Flieger',
                   desc: 'Drei schnelle Krähen. Nur Fernkämpfer und Türme kommen an sie heran.' },
  nebelrochen:   { name: 'Nebelrochen',   cost: 4, type: 'troop', unit: 'rochen', count: 1, role: 'Flieger · Fläche',
                   desc: 'Schwebt übers Feld und spuckt Nebelkugeln, die mehrere Gegner treffen.' },
  funkenweberin: { name: 'Funkenweberin', cost: 5, type: 'troop', unit: 'funkenweberin', count: 1, role: 'Fläche',
                   desc: 'Wirft Funkenbälle aus der Ferne. Stark gegen Schwärme, selbst zerbrechlich.' },
  torknacker:    { name: 'Torknacker',    cost: 4, type: 'troop', unit: 'torknacker', count: 1, role: 'Belagerer',
                   desc: 'Rennt mit dem Rammbalken geradewegs auf das nächste Gebäude los.' },
  eisenwaechter: { name: 'Eisenwächter',  cost: 3, type: 'troop', unit: 'eisenwaechter', count: 1, role: 'Nahkampf',
                   desc: 'Solider Kämpfer mit Schild. Guter Schutz für Fernkämpfer dahinter.' },
  hammerschmied: { name: 'Hammerschmied', cost: 4, type: 'troop', unit: 'hammerschmied', count: 1, role: 'Schwerer Schlag',
                   desc: 'Wenige, vernichtende Hiebe. Ideal gegen Tanks, hilflos gegen Schwärme.' },
  glutling:      { name: 'Glutling',      cost: 1, type: 'troop', unit: 'glutling', count: 1, role: 'Selbstzünder',
                   desc: 'Springt auf den nächsten Gegner und zerplatzt in einer Flamme. Trifft auch Flieger.' },
  klingentaenzerin: { name: 'Klingentänzerin', cost: 4, type: 'troop', unit: 'klingentaenzerin', count: 1, role: 'Rundumschlag',
                   desc: 'Wirbelt mit zwei Klingen und trifft alles um sich herum. Schrecken jedes Schwarms.' },
  bolzenschuetzin: { name: 'Bolzenschützin', cost: 4, type: 'troop', unit: 'bolzenschuetzin', count: 1, role: 'Fernkampf',
                   desc: 'Schwere Armbrust mit sehr großer Reichweite. Holt Flieger und Tanks vom Feld.' },
  donnerkaefer:  { name: 'Donnerkäfer',   cost: 5, type: 'troop', unit: 'donnerkaefer', count: 1, role: 'Flieger · Belagerer',
                   desc: 'Brummt geradewegs zu den Türmen und lässt Brocken fallen. Zerplatzt beim Tod.' },
  frostschamane: { name: 'Frostschamane', cost: 3, type: 'troop', unit: 'frostschamane', count: 1, role: 'Verlangsamer',
                   desc: 'Wenig Schaden, aber jeder Treffer bremst Gegner im Umkreis für kurze Zeit.' },
  kieselbande:   { name: 'Kieselbande',   cost: 3, type: 'troop', unit: 'kiesel', count: 10, role: 'Schwarm',
                   desc: 'Zehn winzige Steinbeißer. Fressen einen Tank in Sekunden, zerbröseln bei jedem Flächentreffer.' },
  erzritter:     { name: 'Erzritter',     cost: 7, type: 'troop', unit: 'erzritter', count: 1, role: 'Schwerer Tank',
                   desc: 'Langsam, schwer gepanzert, mit einem Hieb wie ein Rammbock. Kleine Gegner lenken ihn ab.' },
  wurzelmutter:  { name: 'Wurzelmutter',  cost: 5, type: 'troop', unit: 'wurzelmutter', count: 1, role: 'Beschwörerin',
                   desc: 'Ruft alle sieben Sekunden zwei Wurzelwichte und verschießt Dornenkugeln.' },
  hornbulle:     { name: 'Hornbulle',     cost: 5, type: 'troop', unit: 'hornbulle', count: 1, role: 'Ansturm',
                   desc: 'Nimmt Anlauf: nach kurzer Strecke rennt er doppelt so schnell und der erste Stoß trifft doppelt.' },
  eisenmarschall: { name: 'Eisenmarschall', cost: 4, type: 'troop', hero: true, unit: 'marschall', count: 1, role: 'Held',
                   desc: 'Held im Nahkampf. Sein Schlachtruf treibt alle Verbündeten in der Nähe an.',
                   ability: { id: 'schlachtruf', name: 'Schlachtruf', cost: 1, cd: 12, radius: 4.5, dur: 6, desc: 'Verbündete im Umkreis laufen und schlagen 6 Sekunden lang 35 % schneller.' } },
  sturmrufer:    { name: 'Sturmrufer',    cost: 5, type: 'troop', hero: true, unit: 'sturmrufer', count: 1, role: 'Held',
                   desc: 'Held im Fernkampf. Ruft auf Befehl Blitze auf die nächsten Gegner.',
                   ability: { id: 'blitzkette', name: 'Blitzkette', cost: 2, cd: 14, radius: 6, dmg: 400, stun: 0.6, count: 4, desc: 'Blitze treffen bis zu vier Gegner in der Nähe und betäuben sie kurz.' } },
  sternschlag:   { name: 'Sternschlag',   cost: 4, type: 'spell', spell: 'sternschlag', role: 'Zauber',
                   radius: 2.5, dmg: 690, delay: 0.9, desc: 'Ein Stern stürzt herab: hoher Schaden auf kleiner Fläche. Türme nehmen nur ein Viertel.' },
  hagelschauer:  { name: 'Hagelschauer',  cost: 3, type: 'spell', spell: 'hagelschauer', role: 'Zauber',
                   radius: 3.5, dmg: 360, delay: 0.5, desc: 'Hagel auf großer Fläche. Fegt Schwärme und Flieger weg.' },
  wurzelgriff:   { name: 'Wurzelgriff',   cost: 2, type: 'spell', spell: 'wurzelgriff', role: 'Zauber',
                   radius: 2.6, dmg: 110, delay: 0.3, root: 3.5, desc: 'Ranken halten Bodentruppen 3,5 Sekunden an Ort und Stelle fest.' },
  heilquell:     { name: 'Heilquell',     cost: 3, type: 'spell', spell: 'heilquell', role: 'Zauber',
                   radius: 3.0, heal: 130, tick: 0.5, dur: 5, delay: 0.2, desc: 'Heilt eigene Truppen im Kreis fünf Sekunden lang.' },
  funkenschlag:  { name: 'Funkenschlag',  cost: 2, type: 'spell', spell: 'funkenschlag', role: 'Zauber',
                   radius: 2.5, dmg: 190, delay: 0.1, stun: 0.5, desc: 'Sofortiger Schlag: wenig Schaden, betäubt kurz und unterbricht Angriffe.' },
  sumpfdunst:    { name: 'Sumpfdunst',    cost: 4, type: 'spell', spell: 'sumpfdunst', role: 'Zauber',
                   radius: 3.5, dot: 92, tick: 1, dur: 8, delay: 0.3, desc: 'Giftiger Dunst: acht Sekunden lang Schaden an allem im Kreis, auch an Gebäuden.' },
  kriegstrommel: { name: 'Kriegstrommel', cost: 2, type: 'spell', spell: 'kriegstrommel', role: 'Zauber',
                   radius: 3.0, haste: 6, delay: 0.1, desc: 'Eigene Truppen im Kreis laufen und schlagen 6 Sekunden lang 35 % schneller.' },
  ballistenturm: { name: 'Ballistenturm', cost: 4, type: 'building', unit: 'ballista', count: 1, role: 'Gebäude',
                   desc: 'Verteidigt 30 Sekunden lang gegen Boden und Luft und zieht Belagerer auf sich.' },
  steinschleuder: { name: 'Steinschleuder', cost: 3, type: 'building', unit: 'steinschleuder', count: 1, role: 'Gebäude',
                   desc: 'Günstige Abwehr gegen Bodentruppen. Kommt nicht an Flieger heran.' },
  erdloch:       { name: 'Erdloch',       cost: 4, type: 'building', unit: 'erdloch', count: 1, role: 'Gebäude',
                   desc: 'Aus dem Loch krabbelt 30 Sekunden lang alle paar Sekunden ein Wurzelwicht.' },
};

export const CARD_IDS = Object.keys(CARDS);
export const DECK_SIZE = 8;
export const DEFAULT_DECK = ['raufbold', 'waldlaeufer', 'steinhueter', 'wurzelwichte', 'sturmkraehen', 'funkenweberin', 'sternschlag', 'ballistenturm'];
export const TOWER_SPELL_FACTOR = 0.25;
export const HASTE = 1.35, SLOW_FACTOR = 0.65;

export const avgCost = deck => deck.reduce((s, id) => s + CARDS[id].cost, 0) / (deck.length || 1);

// Gültiges Deck aus beliebiger Eingabe: nur bekannte Karten, keine doppelten, auf 8 aufgefüllt.
export function sanitizeDeck(input) {
  const out = [];
  for (const id of Array.isArray(input) ? input : []) if (CARDS[id] && !out.includes(id) && out.length < DECK_SIZE) out.push(id);
  for (const id of DEFAULT_DECK) if (out.length < DECK_SIZE && !out.includes(id)) out.push(id);
  for (const id of CARD_IDS) if (out.length < DECK_SIZE && !out.includes(id)) out.push(id);
  return out;
}
