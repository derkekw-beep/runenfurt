// Runenfurt – Oberfläche, Bedienung und Spielschleife.
import { CARDS, UNITS, RUNES, RUNE_LEVEL, avgCost, TOWER_SPELL_FACTOR } from './cards.js';
import * as sim from './sim.js';
import { createAi, aiUpdate, LEVELS } from './ai.js';
import * as P from './progress.js';
import { createRenderer, drawCardArt, drawIcon } from './render.js';
import { createRenderer3D } from './render3d.js';
import { sfx, unlock, setSound, setVolume } from './audio.js';

const $ = s => document.querySelector(s);
const KEY = 'runenfurt-v1';
const params = new URLSearchParams(location.search);

let profile;
try { profile = P.loadProfile(localStorage.getItem(KEY)); } catch { profile = P.newProfile(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* privater Modus: dann eben ohne Speichern */ } };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayCheck = () => { if (P.ensureDay(profile, today())) save(); };
dayCheck();

// Testhilfe: ?safe=47,34 simuliert die Ränder eines iPhones, ?speed=8 beschleunigt, ?auto=schwer lässt den Computer für mich spielen
if (params.get('safe')) { const [t, b] = params.get('safe').split(',').map(Number); document.documentElement.style.setProperty('--sat', `${t || 0}px`); document.documentElement.style.setProperty('--sab', `${b || 0}px`); }
const SPEED = Math.min(40, Math.max(1, Number(params.get('speed')) || 1));
const AUTO = LEVELS[params.get('auto')] ? params.get('auto') : null;

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dec = v => String(v).replace('.', ',');
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// ---- Zeichner: 3D mit three.js, ohne WebGL der einfache 2D-Zeichner ------------------------------
const canvas = $('#arena');
let renderer;
try {
  if (params.has('2d')) throw new Error('2D erzwungen');
  renderer = createRenderer3D(canvas, $('#labels'));
} catch {
  const fresh = canvas.cloneNode(); canvas.replaceWith(fresh); // ein Canvas kann nur eine Art Kontext haben
  renderer = createRenderer(fresh);
  $('#labels').hidden = true;
}
const field = $('#arena');

function applySettings() {
  setSound(profile.sound); setVolume(profile.set.volume);
  renderer.setOptions(profile.set);
  document.body.classList.toggle('lefty', profile.set.lefty);
  $('#fps').hidden = !profile.set.fps;
}

// ---- Kartenbilder ------------------------------------------------------------------------------
const artCache = new Map();
function art(id) {
  if (!artCache.has(id)) {
    const c = document.createElement('canvas'); c.width = 200; c.height = 264;
    drawCardArt(c.getContext('2d'), id, 200, 264, renderer.snapshot(id, 200, 264));
    artCache.set(id, c);
  }
  return artCache.get(id);
}
function cardEl(id, opt = {}) {
  const c = CARDS[id];
  const e = el(opt.tag || 'button', c.hero ? 'card hero' : 'card');
  const cv = document.createElement('canvas'); cv.width = 200; cv.height = 264;
  cv.getContext('2d').drawImage(art(id), 0, 0);
  e.append(cv, el('span', 'cost', c.cost), el('span', c.name.length > 10 ? 'name long' : 'name', c.name));
  if (opt.locked != null) { e.classList.add('locked'); e.append(el('span', 'lv', `Arena ${opt.locked + 1}`)); }
  else if (opt.lvl) e.append(el('span', 'lv', `St. ${opt.lvl}`));
  if (opt.meter) {
    const m = el('span', 'meter'); const i = el('i'); i.style.width = `${Math.min(100, opt.meter * 100)}%`; m.append(i); e.append(m);
    if (opt.meter >= 1) e.classList.add('up');
  }
  if (opt.rune) e.append(el('span', 'runeMark', ''));
  if (opt.wish) e.append(el('span', 'wishMark', '★'));
  if (opt.pips) { // Zyklen bis zur Runenform
    const row = el('span', 'pips');
    for (let i = 0; i < opt.pips.of; i++) row.append(el('i', i < opt.pips.n ? 'on' : ''));
    e.append(row);
    if (opt.pips.n >= opt.pips.of) e.classList.add('rune');
  }
  e.dataset.id = id;
  return e;
}

// ---- Bildschirme und Reiter --------------------------------------------------------------------
const TABS = { home: $('#tabHome'), cards: $('#tabCards'), shop: $('#tabShop'), road: $('#tabRoad'), more: $('#tabMore') };
let screen = 'menu', tab = 'home';
function show(name) {
  const battle = name === 'battle';
  screen = battle ? 'battle' : 'menu';
  $('#battle').hidden = !battle; $('#menu').hidden = battle;
  if (battle) return;
  dayCheck();
  if (TABS[name]) tab = name;
  for (const [k, s] of Object.entries(TABS)) s.hidden = k !== tab;
  for (const b of $('#nav').children) b.classList.toggle('on', b.dataset.tab === tab);
  render();
}
function render() {
  renderTop();
  if (tab === 'home') renderHome();
  else if (tab === 'cards') renderDeck();
  else if (tab === 'shop') renderShop();
  else if (tab === 'road') renderRoad();
  else renderMore();
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; sfx('click'); swap = null; roadSeen = false; show(b.dataset.tab); });

const overlay = $('#overlay'), sheet = $('#sheet');
function openSheet(node, center) { sheet.replaceChildren(node); overlay.classList.toggle('center', !!center); overlay.hidden = false; sheet.scrollTop = 0; }
function closeSheet() { overlay.hidden = true; sheet.replaceChildren(); }
let sheetDismiss = null; // Tippen neben das Blatt schließt es, wenn erlaubt
overlay.addEventListener('click', e => { if (e.target === overlay && sheetDismiss) sheetDismiss(); });
const closeBtn = (label = 'Schließen', then) => { const b = el('button', 'btn', label); b.addEventListener('click', () => { sfx('click'); closeSheet(); sheetDismiss = null; if (then) then(); }); return b; };
// Blatt mit Überschrift, Inhalt und einem Schließen-Knopf
function simpleSheet(title, body, center = true) {
  const d = el('div');
  if (title) d.append(el('h3', '', title));
  d.append(body);
  const row = el('div', 'btns one'); row.append(closeBtn()); d.append(row);
  sheetDismiss = () => { closeSheet(); sheetDismiss = null; };
  openSheet(d, center);
  return d;
}

const canUpgradeAny = () => Object.keys(profile.cards).some(id => P.upgradeInfo(profile, id).can);
const untilMidnight = () => { const n = new Date(), m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1); const min = Math.max(1, Math.ceil((m - n) / 60000)); return `${Math.floor(min / 60)} Std. ${min % 60} Min.`; };

function renderTop() {
  const pl = P.playerLevel(profile.xp);
  $('#lvlNum').textContent = pl.lvl;
  $('#xpFill').style.width = pl.need ? `${100 * pl.xp / pl.need}%` : '100%';
  $('#goldNum').textContent = fmt(profile.gold);
  $('#gemNum').textContent = fmt(profile.gems);
  const dots = { shop: !profile.shop.gift, cards: canUpgradeAny(), home: P.questsOpen(profile) > 0 || profile.crownBox >= P.CROWN_BOX, road: P.roadOpen(profile).length > 0, more: false };
  for (const b of $('#nav').children) b.lastElementChild.hidden = !dots[b.dataset.tab];
}

// Beute zeigen: Gold, Runensplitter, Karten
function lootBox(title, loot) {
  const box = el('div', 'chest'); box.append(el('b', 't', title));
  const row = el('div', 'loot');
  if (loot.gold) row.append(el('div', 'item goldItem', `<span class="ico coin"></span>+${fmt(loot.gold)}`));
  if (loot.gems) row.append(el('div', 'item goldItem', `<span class="ico gem"></span>+${loot.gems}`));
  if (loot.jokers) row.append(el('div', 'item goldItem', `<span class="ico joker"></span>+${loot.jokers}`));
  for (const s of loot.cards || []) { const it = el('div', 'item'); it.append(cardEl(s.id, { tag: 'div' }), document.createTextNode(`× ${s.n}`)); row.append(it); }
  [...row.children].forEach((it, i) => it.style.setProperty('--i', i)); // Stück für Stück einblenden
  box.append(row);
  return box;
}
function lootSheet(title, loot, note) {
  const body = el('div');
  body.append(lootBox(title, loot));
  if (note) body.append(el('p', 'center', note));
  simpleSheet('', body);
  sfx('chest');
  render();
}

// ---- Reiter „Kampf“ ----------------------------------------------------------------------------
function renderHome() {
  const a = P.ARENAS[profile.arena], next = P.ARENAS[profile.arena + 1];
  $('#who').textContent = `${profile.name} · Deck ${profile.slot + 1} · Ø ${dec(avgCost(profile.deck).toFixed(1))} Kraft`;
  $('#arenaNo').textContent = `Arena ${profile.arena + 1}`;
  $('#arenaName').textContent = a.name;
  $('#trophyNum').textContent = fmt(profile.trophies);
  $('#trophyFill').style.width = next ? `${Math.max(0, Math.min(100, 100 * (profile.trophies - a.at) / (next.at - a.at)))}%` : '100%';
  $('#arenaHint').textContent = next ? `Noch ${next.at - profile.trophies} Trophäen bis ${next.name}${next.unlock.length ? ' – dort warten neue Karten' : ''}` : 'Höchste Arena erreicht';
  for (const b of $('#levelSeg').children) b.classList.toggle('on', b.dataset.level === profile.level);
  const open = P.questsOpen(profile), left = profile.quests.filter(q => !q.claimed).length;
  $('#questInfo').textContent = open ? `${open} abholbereit` : left ? `${left} offen` : 'alle erledigt';
  $('#questDot').hidden = !open;
  $('#crownInfo').textContent = profile.crownBox >= P.CROWN_BOX ? 'bereit zum Öffnen' : `${profile.crownBox} / ${P.CROWN_BOX} Kronen`;
  $('#crownDot').hidden = profile.crownBox < P.CROWN_BOX;
  const n = profile.wins + profile.losses + profile.draws;
  $('#stats').textContent = n ? `${profile.wins} Siege · ${profile.losses} Niederlagen${profile.draws ? ` · ${profile.draws} Unentschieden` : ''}` : 'Zerstöre die Türme auf der anderen Seite der Furt.';
}

$('#levelSeg').addEventListener('click', e => { const l = e.target.dataset.level; if (!l) return; profile.level = l; save(); sfx('click'); renderHome(); });
$('#playBtn').addEventListener('click', () => { sfx('click'); if (!profile.seenHelp) showHelp(() => startBattle(false)); else startBattle(false); });
$('#trainBtn').addEventListener('click', () => { sfx('click'); if (!profile.seenHelp) showHelp(() => startBattle(true)); else startBattle(true); });
$('#arenaBox').addEventListener('click', () => { sfx('click'); show('road'); });
$('#lvlPill').addEventListener('click', () => { sfx('click'); show('more'); });
$('#questBtn').addEventListener('click', () => { sfx('click'); showQuests(); });
$('#crownBtn').addEventListener('click', () => {
  sfx('click');
  const loot = P.claimCrownBox(profile);
  if (loot) { save(); lootSheet('Kronentruhe', loot); return; }
  simpleSheet('Kronentruhe', el('p', 'center', `Jede Krone aus einem Kampf zählt – auch bei einer Niederlage. Bei ${P.CROWN_BOX} Kronen öffnet sich eine große Truhe mit Gold, Karten und Runensplittern.<br><br><b>${profile.crownBox} / ${P.CROWN_BOX} Kronen</b>`));
});

function showQuests() {
  const body = el('div', 'quests');
  profile.quests.forEach((q, i) => {
    const d = P.QUESTS[q.id], done = q.have >= q.need;
    const row = el('div', `quest${q.claimed ? ' claimed' : done ? ' done' : ''}`);
    row.append(el('div', 'qt', `<b>${d.text(q.need)}</b><div class="meterBig${done ? ' ok' : ''}"><i style="width:${100 * q.have / q.need}%"></i><span>${q.have} / ${q.need}</span></div>`));
    const b = el('button', 'btn primary', q.claimed ? 'Erledigt' : `<span class="ico coin"></span>${d.gold}${d.gems ? ` <span class="ico gem"></span>${d.gems}` : ''}`);
    b.disabled = q.claimed || !done;
    b.addEventListener('click', () => { if (P.claimQuest(profile, i)) { save(); sfx('coin'); showQuests(); render(); } });
    row.append(b); body.append(row);
  });
  body.append(el('p', 'center small', `Neue Aufgaben in ${untilMidnight()}`));
  simpleSheet('Tagesaufgaben', body);
}

function showHelp(then) {
  const d = el('div', 'help', `<h3>So geht’s</h3>
<ul>
<li><b>Ziel:</b> Zerstöre mehr Türme als der Gegner. Fällt der <b>Hauptturm</b>, ist das Spiel sofort gewonnen.</li>
<li><b>Karten spielen:</b> Karte antippen und dann aufs Feld tippen – oder die Karte direkt aufs Feld ziehen. Truppen und Gebäude nur auf deine Hälfte, Zauber überallhin.</li>
<li><b>Kraft:</b> Jede Karte kostet Kraft (blaue Zahl). Der Balken füllt sich von selbst, ab Minute 2 doppelt so schnell.</li>
<li><b>Zeit:</b> 3 Minuten. Steht es dann gleich, gewinnt in der Verlängerung der nächste zerstörte Turm.</li>
<li><b>Türme:</b> Sie schießen erst, wenn ein Gegner die Brücke hinter sich gelassen hat.</li>
<li><b>Helden:</b> Steht ein Held auf dem Feld, erscheint ein goldener Knopf für seine Fähigkeit – sie kostet Kraft.</li>
<li><b>Runenform:</b> Ab Kartenstufe 3 erscheint manche Karte jedes zweite oder dritte Mal in einer stärkeren Form (violette Rauten auf der Karte).</li>
<li><b>Fortschritt:</b> Siege bringen Trophäen und eine Truhe. Der Trophäenweg, Tagesaufgaben und die Kronentruhe bringen Gold, Karten und Runensplitter; im Laden gibt es täglich neue Angebote.</li>
</ul>`);
  const b = el('button', 'btn primary', then ? 'Los geht’s' : 'Alles klar');
  const row = el('div', 'btns one'); row.append(b); d.append(row);
  const done = () => { profile.seenHelp = true; save(); closeSheet(); sheetDismiss = null; if (then) then(); };
  b.addEventListener('click', () => { sfx('click'); done(); });
  sheetDismiss = then ? null : done;
  openSheet(d, true);
}

// ---- Reiter „Karten“ ---------------------------------------------------------------------------
let swap = null; // Karte aus der Sammlung, die gerade ins Deck getauscht wird
let filter = 'alle';
const FILTERS = { alle: ['Alle', () => true], troop: ['Truppen', c => c.type === 'troop' && !c.hero], hero: ['Helden', c => !!c.hero], spell: ['Zauber', c => c.type === 'spell'], building: ['Gebäude', c => c.type === 'building'] };
function renderDeck() {
  const ups = P.upgradable(profile);
  $('#upBox').hidden = !ups.length;
  $('#upSum').textContent = ups.length > 1 ? `${ups.length} Karten` : '';
  $('#upRow').replaceChildren(...ups.map(id => {
    const b = el('button', 'upItem');
    b.append(cardEl(id, { tag: 'div', lvl: profile.cards[id].lvl }), el('em', '', `<span class="ico coin"></span>${fmt(P.upgradeInfo(profile, id).gold)}`));
    b.dataset.id = id;
    return b;
  }));
  $('#wishInfo').textContent = profile.wish ? `${CARDS[profile.wish].name} – in jeder Truhe` : 'noch keine gewählt';
  $('#jokerNum').textContent = `${fmt(profile.jokers)} Joker`;
  $('#avgCost').textContent = `Ø ${dec(avgCost(profile.deck).toFixed(1))} Kraft`;
  const seg = $('#slotSeg');
  seg.replaceChildren(...Array.from({ length: P.DECK_SLOTS }, (_, i) => { const b = el('button', i === profile.slot ? 'on' : '', `Deck ${i + 1}`); b.dataset.slot = i; return b; }));
  const hint = $('#swapHint');
  hint.hidden = !swap;
  if (swap) hint.textContent = `Tippe die Deck-Karte an, die ${CARDS[swap].name} ersetzen soll.`;
  const meter = id => { const c = profile.cards[id], u = P.upgradeInfo(profile, id); return u.max ? 0 : Math.max(0.001, c.n / u.copies); };
  const dg = $('#deckGrid'); dg.replaceChildren();
  for (const id of profile.deck) { const e = cardEl(id, { lvl: profile.cards[id].lvl, meter: meter(id), rune: P.hasRune(profile, id), wish: profile.wish === id }); if (swap) e.classList.add('pick'); dg.append(e); }
  const chips = $('#filterChips');
  chips.replaceChildren(...Object.entries(FILTERS).map(([k, [label]]) => { const b = el('button', k === filter ? 'on' : '', label); b.dataset.f = k; return b; }));
  const cg = $('#collGrid'); cg.replaceChildren();
  const all = P.ARENAS.flatMap(a => a.unlock).filter(id => !profile.deck.includes(id) && FILTERS[filter][1](CARDS[id]));
  for (const id of all) cg.append(profile.cards[id] ? cardEl(id, { lvl: profile.cards[id].lvl, meter: meter(id), rune: P.hasRune(profile, id), wish: profile.wish === id }) : cardEl(id, { locked: P.unlockArena(id) }));
  if (!all.length) cg.append(el('p', 'empty', 'Keine weiteren Karten in dieser Auswahl.'));
  $('#collCount').textContent = `${Object.keys(profile.cards).length} von ${Object.keys(CARDS).length} Karten`;
}
$('#upRow').addEventListener('click', e => { const b = e.target.closest('.upItem'); if (b) doUpgrade(b.dataset.id, false); });
$('#wishBtn').addEventListener('click', () => {
  sfx('click');
  if (profile.wish) { showCard(profile.wish); return; }
  simpleSheet('Wunschkarte', el('p', 'center', 'Wähle eine Karte, die du schneller aufwerten willst: Sie steckt dann in <b>jeder Truhe</b> und bekommt dort den größten Stapel.<br><br>Tippe dazu eine Karte an und wähle „Als Wunschkarte“.'));
});
$('#jokerBtn').addEventListener('click', () => {
  sfx('click');
  simpleSheet('Joker', el('p', 'center', `Joker ersetzen fehlende Karten beim Aufwerten – bei jeder beliebigen Karte. Du findest sie in allen Truhen.<br><br>Tippe eine Karte an und wähle „Joker einsetzen“.<br><br><b>Du hast ${fmt(profile.jokers)} Joker.</b>`));
});
$('#slotSeg').addEventListener('click', e => { const s = e.target.dataset.slot; if (s == null) return; sfx('click'); swap = null; P.setSlot(profile, Number(s)); save(); renderDeck(); });
$('#filterChips').addEventListener('click', e => { const f = e.target.dataset.f; if (!f) return; sfx('click'); filter = f; renderDeck(); });
$('#deckGrid').addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  sfx('click');
  if (swap) { profile.deck[profile.deck.indexOf(c.dataset.id)] = swap; swap = null; save(); renderDeck(); return; }
  showCard(c.dataset.id);
});
$('#collGrid').addEventListener('click', e => { const c = e.target.closest('.card'); if (!c) return; sfx('click'); swap = null; showCard(c.dataset.id); });

const SPEED_NAME = v => (v <= 0.8 ? 'Langsam' : v <= 1.1 ? 'Mittel' : v <= 1.6 ? 'Schnell' : 'Sehr schnell');
const SPAWN_NAME = { wicht: ['Wicht', 'Wichte'], glutling: ['Glutling', 'Glutlinge'], steinling: ['Steinling', 'Steinlinge'] };
function statRows(id, lvl) {
  const c = CARDS[id], m = sim.cardMult(lvl), up = lvl < P.MAX_LEVEL ? sim.cardMult(lvl + 1) : 0;
  const rows = [];
  const scaled = (label, base) => rows.push([label, fmt(Math.round(base * m)), up ? `+${fmt(Math.round(base * up) - Math.round(base * m))}` : '']);
  if (c.type === 'spell') {
    if (c.dmg) { scaled(c.strikes ? 'Schaden je Blitz' : 'Schaden', c.dmg); scaled('Turmschaden', c.dmg * TOWER_SPELL_FACTOR); }
    if (c.strikes) rows.push(['Blitze', `${c.strikes} – auf die zähesten Ziele`, '']);
    if (c.heal) { scaled('Heilung je Schlag', c.heal); rows.push(['Dauer', `${c.dur} s`, '']); }
    if (c.dot) { scaled('Schaden je Sekunde', c.dot / c.tick); if (!c.pull) scaled('Turmschaden je Sek.', c.dot / c.tick * TOWER_SPELL_FACTOR); rows.push(['Dauer', `${c.dur} s`, '']); }
    if (c.root) rows.push(['Hält fest', `${dec(c.root)} s`, '']);
    if (c.freeze) rows.push(['Friert ein', `${dec(c.freeze)} s · auch Türme`, '']);
    if (c.stun) rows.push(['Betäubt', `${dec(c.stun)} s`, '']);
    if (c.haste) rows.push(['Treibt an', `${c.haste} s · +35 %`, '']);
    if (c.summon) { rows.push(['Bringt', `${c.summon.count} ${SPAWN_NAME[c.summon.unit][1]}`, '']); scaled('Wicht: Schaden', UNITS[c.summon.unit].dmg); scaled('Wicht: Leben', UNITS[c.summon.unit].hp); }
    if (c.roll) { rows.push(['Rollt', `${c.roll.len} Felder weit`, '']); rows.push(['Breite', `${dec(c.roll.w)} Felder`, '']); }
    if (c.knock) rows.push(['Rückstoß', `${dec(c.knock)} Felder`, '']);
    if (c.pull) rows.push(['Zieht', 'Truppen zur Mitte', '']);
    if (!c.roll) rows.push(['Radius', `${dec(c.radius)} Felder`, '']);
    return rows;
  }
  const u = UNITS[c.unit], s = u.spawn ? UNITS[u.spawn.unit] : null;
  scaled('Leben', u.hp);
  if (u.shield) scaled('Schild', u.shield);
  if (u.ramp) { rows.push(['Brennstrahl je Sek.', `${fmt(u.dmg / u.atk * m)} – ${fmt(u.dmg * u.ramp.at(-1)[1] / u.atk * m)}`, '']); rows.push(['Volle Hitze nach', `${u.ramp.at(-1)[0]} s am selben Ziel`, '']); }
  else if (u.dmg) { scaled(u.splash || u.line ? 'Flächenschaden' : 'Schaden', u.dmg); rows.push(['Schlagtempo', `${dec(u.atk)} s`, '']); }
  if (u.towerDmg) scaled('Turmschaden', u.dmg * u.towerDmg);
  if (s) { if (!u.dmg) scaled(`${SPAWN_NAME[u.spawn.unit][0]}: Schaden`, s.dmg); rows.push(['Bringt hervor', `${u.spawn.count > 1 ? `${u.spawn.count} ${SPAWN_NAME[u.spawn.unit][1]}` : `1 ${SPAWN_NAME[u.spawn.unit][0]}`} alle ${dec(u.spawn.every)} s`, '']); }
  if (u.kraft) rows.push(['Liefert', `1 Kraft alle ${dec(u.kraft.every)} s`, '']);
  if (u.spin) rows.push(['Trifft', 'alles ringsum', '']);
  if (u.line) rows.push(['Trifft', 'alles auf seiner Bahn', '']);
  if (u.multi) rows.push(['Ziele zugleich', String(u.multi), '']);
  if (u.knock) rows.push(['Rückstoß', `${dec(u.knock)} Felder`, '']);
  if (u.stunHit) rows.push(['Betäubt', `${dec(u.stunHit)} s je Treffer`, '']);
  if (u.kamikaze) rows.push(['Besonderheit', 'zerplatzt beim Angriff', '']);
  if (u.stealth) rows.push(['Besonderheit', 'unsichtbar bis zum Angriff', '']);
  if (u.slow) rows.push(['Bremst', `${dec(u.slow)} s · −35 %`, '']);
  if (u.charge) rows.push(['Ansturm', 'doppeltes Tempo, doppelter Stoß', '']);
  if (u.leap) rows.push(['Sprung', `${dec(u.leap.min)}–${u.leap.max} Felder · doppelter Schaden`, '']);
  if (u.deployDmg) scaled('Schaden bei Landung', u.deployDmg.dmg);
  if (u.healHit) scaled('Heilt je Schlag', u.healHit.amt);
  if (u.load) rows.push(['Erste Ladung', `${u.load} s`, '']);
  if (u.deathDmg) { scaled('Schaden beim Tod', u.deathDmg.dmg); if (u.deathDmg.delay) rows.push(['Lunte', `${u.deathDmg.delay} s`, '']); if (u.deathDmg.slow) rows.push(['Bremst beim Tod', `${dec(u.deathDmg.slow)} s`, '']); }
  if (u.deathSpawn) rows.push(['Zerbricht in', `${u.deathSpawn.count} ${SPAWN_NAME[u.deathSpawn.unit][1]}`, '']);
  if (u.deathZone) rows.push(['Beim Tod', CARDS[u.deathZone].name, '']);
  if (u.life) rows.push(['Lebensdauer', `${u.life} s`, '']);
  if (u.speed) rows.push(['Tempo', SPEED_NAME(u.speed), '']);
  if (u.dmg) rows.push(['Reichweite', u.range >= 2 ? `${u.minRange ? `${dec(u.minRange)}–` : ''}${dec(u.range)} Felder` : 'Nahkampf', '']);
  if (u.dmg) rows.push(['Ziele', u.targets === 'buildings' ? 'Gebäude' : u.hitsAir ? 'Luft & Boden' : 'Boden', '']);
  if (c.count > 1) rows.push(['Anzahl', `× ${c.count}`, '']);
  if (u.air) rows.push(['Bewegung', 'Fliegt', '']);
  if (c.anywhere) rows.push(['Aufstellen', 'überall auf dem Feld', '']);
  return rows;
}

function showCard(id) {
  const c = CARDS[id], own = profile.cards[id];
  const d = el('div');
  const top = el('div', 'detail');
  top.append(cardEl(id, { tag: 'div', lvl: own ? own.lvl : 0 }));
  const lvl = own ? own.lvl : 1;
  top.append(el('div', '', `<h4>${c.name}</h4><div class="role">${c.role} · ${c.cost} Kraft</div><p>${c.desc}</p>`));
  d.append(top);
  d.append(el('div', 'statlist', statRows(id, lvl).map(([k, v, plus]) => `<div>${k}<b>${v}${plus && own ? `<em>${plus}</em>` : ''}</b></div>`).join('')));
  if (c.hero) d.append(el('div', 'extra heroBox', `<b>Fähigkeit: ${c.ability.name}</b><small>${c.ability.cost} Kraft · alle ${c.ability.cd} s</small><p>${c.ability.desc}</p>`));
  if (RUNES[id]) {
    const R = RUNES[id], has = own && own.lvl >= RUNE_LEVEL;
    d.append(el('div', `extra runeBox${has ? ' on' : ''}`, `<b>Runenform</b><small>${has ? 'freigeschaltet' : `ab Stufe ${RUNE_LEVEL}`} · jede ${R.cycles + 1}. Karte</small><p>${R.desc}</p>`));
  }
  const btns = el('div', 'btns');
  if (!own) {
    d.append(el('div', 'notice', `Wird in Arena ${P.unlockArena(id) + 1} (${P.ARENAS[P.unlockArena(id)].name}, ${P.ARENAS[P.unlockArena(id)].at} Trophäen) freigeschaltet.`));
    btns.classList.add('one');
  } else {
    const u = P.upgradeInfo(profile, id);
    if (u.max) d.append(el('div', 'notice', 'Höchste Stufe erreicht'));
    else {
      d.append(el('div', 'upline', `<div class="meterBig${own.n >= u.copies ? ' ok' : ''}"><i style="width:${Math.min(100, 100 * own.n / u.copies)}%"></i><span>${own.n} / ${u.copies} Karten</span></div>`));
      const ub = el('button', 'btn primary', `Aufwerten <span class="ico coin"></span>${fmt(u.gold)}`);
      ub.disabled = !u.can;
      ub.addEventListener('click', () => doUpgrade(id, true));
      btns.append(ub);
      // Was fehlt noch – und wie kommt man schneller hin: Joker einsetzen, Wunschkarte festlegen
      const j = P.jokerInfo(profile, id), lack = [];
      if (j.missing) lack.push(`${j.missing} ${j.missing === 1 ? 'Karte' : 'Karten'}`);
      if (profile.gold < u.gold) lack.push(`${fmt(u.gold - profile.gold)} Gold`);
      if (lack.length) d.append(el('p', 'center small lack', `Es fehlen noch ${lack.join(' und ')}.`));
      const tools = el('div', 'tools');
      const jb = el('button', 'btn', `<span class="ico joker"></span>${j.use ? `${j.use} Joker einsetzen` : 'Joker einsetzen'}`);
      jb.disabled = !j.use;
      jb.addEventListener('click', () => { if (P.useJokers(profile, id)) { save(); sfx('buy'); render(); showCard(id); } });
      const wb = el('button', `btn${profile.wish === id ? ' wished' : ''}`, `<span class="ico star"></span>${profile.wish === id ? 'Wunschkarte ✓' : 'Als Wunschkarte'}`);
      wb.addEventListener('click', () => { P.setWish(profile, id); save(); sfx('click'); render(); showCard(id); });
      tools.append(jb, wb);
      d.append(tools);
    }
    if (!profile.deck.includes(id)) {
      const b = el('button', 'btn', 'Ins Deck');
      b.addEventListener('click', () => { sfx('click'); swap = id; closeSheet(); show('cards'); $('#tabCards .scroll').scrollTop = 0; });
      btns.append(b);
    }
  }
  btns.append(closeBtn());
  if (btns.children.length === 1) btns.classList.add('one');
  d.append(btns);
  sheetDismiss = closeSheet;
  openSheet(d, false);
}

// Aufwerten mit Animation: Karten fliegen ein, die Karte blitzt auf, die Werte zählen hoch.
const fxLayer = $('#fx');
const parseNum = s => (/^[\d.]+$/.test(s) ? Number(String(s).replace(/\./g, '')) : NaN);
function doUpgrade(id, reopen) {
  const own = profile.cards[id];
  if (!own || !fxLayer.hidden) return;
  const from = own.lvl, before = statRows(id, from);
  const r = P.upgrade(profile, id);
  if (!r) { sfx('error'); return; }
  save();
  const after = statRows(id, r.lvl);
  const changes = before.map((a, i) => [a[0], a[1], after[i] ? after[i][1] : a[1]]).filter(c => c[1] !== c[2]).slice(0, 4);
  const notes = [];
  if (r.lvl === RUNE_LEVEL && RUNES[id]) notes.push(['rune', 'Runenform freigeschaltet!']);
  if (r.levelUp) notes.push(['lvl', `Spielerstufe ${P.playerLevel(profile.xp).lvl} – stärkere Türme, +5 Runensplitter`]);
  playUpgrade(id, from, r.lvl, changes, notes, () => { render(); if (reopen) showCard(id); });
}
function playUpgrade(id, from, to, changes, notes, done) {
  const rune = notes.some(n => n[0] === 'rune');
  const box = el('div', `upfx${rune ? ' rune' : ''}`), stage = el('div', 'stage');
  const card = cardEl(id, { tag: 'div', lvl: from });
  stage.append(el('div', 'rays'), card);
  for (let i = 0; i < 6; i++) { // Kartenkopien fliegen von außen in die Karte
    const c = el('i', 'copy'), a = (i / 6) * 6.283 + 0.4;
    c.style.setProperty('--x', `${Math.cos(a) * 150}px`); c.style.setProperty('--y', `${Math.sin(a) * 190}px`); c.style.animationDelay = `${i * 0.05}s`;
    stage.append(c);
  }
  for (let i = 0; i < 28; i++) { // Funken beim Aufblitzen
    const s = el('i', 'spark'), a = (i / 28) * 6.283 + Math.random() * 0.3, dist = 90 + Math.random() * 120;
    s.style.setProperty('--x', `${Math.cos(a) * dist}px`); s.style.setProperty('--y', `${Math.sin(a) * dist}px`); s.style.animationDelay = `${0.62 + Math.random() * 0.12}s`;
    stage.append(s);
  }
  const list = el('div', 'uplist');
  changes.forEach(([k, a, b], i) => { const row = el('div', 'uprow', `<span>${k}</span><b data-a="${esc(a)}" data-b="${esc(b)}">${a}</b>`); row.style.animationDelay = `${0.9 + i * 0.16}s`; list.append(row); });
  notes.forEach(([kind, text], i) => { const n = el('div', `upnote ${kind}`, text); n.style.animationDelay = `${1.05 + (changes.length + i) * 0.16}s`; list.append(n); });
  box.append(stage, el('div', 'uptitle', `<small>${CARDS[id].name}</small><b>Stufe <span class="old">${from}</span><span class="arrow">→</span><span class="new">${to}</span></b>`), list, el('div', 'uphint', 'Tippen zum Fortfahren'));
  fxLayer.replaceChildren(box); fxLayer.hidden = false;
  sfx('charge');
  let closed = false;
  const t1 = setTimeout(() => {
    sfx('upgrade'); if (rune) setTimeout(() => sfx('rune'), 280);
    card.querySelector('.lv').textContent = `St. ${to}`;
    const t0 = performance.now();
    const items = [...list.querySelectorAll('b[data-a]')].map((n, i) => ({ n, a: parseNum(n.dataset.a), b: parseNum(n.dataset.b), raw: n.dataset.b, start: 300 + i * 160 }));
    const tick = now => { // Werte hochzählen
      let busy = false;
      for (const it of items) {
        const q = Math.min(1, (now - t0 - it.start) / 450);
        if (q < 1) busy = true;
        if (q <= 0) continue;
        it.n.textContent = Number.isFinite(it.a) && Number.isFinite(it.b) ? fmt(it.a + (it.b - it.a) * q) : it.raw;
        if (q >= 1) it.n.classList.add('done');
      }
      if (busy && !closed) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, 620);
  const close = () => { if (closed) return; closed = true; clearTimeout(t1); clearTimeout(t2); fxLayer.hidden = true; fxLayer.replaceChildren(); done(); };
  const t2 = setTimeout(close, 4300 + notes.length * 700);
  const armed = performance.now();
  fxLayer.onclick = () => { if (performance.now() - armed > 700) close(); };
}
function toastSheet(msg) { sheet.prepend(el('div', 'notice', msg)); }

// ---- Reiter „Laden“ ----------------------------------------------------------------------------
function renderShop() {
  const body = $('#shopBody'); body.replaceChildren();
  const head = (t, s) => body.append(el('div', 'sub', `<b>${t}</b><span>${s || ''}</span>`));
  head('Tagesgeschenk', `neu in ${untilMidnight()}`);
  const gift = el('button', `offer wide${profile.shop.gift ? ' sold' : ''}`, `<span class="ico coin big"></span><span><b>${P.giftGold(profile)} Gold</b><small>${profile.shop.gift ? 'Heute schon abgeholt' : 'Jeden Tag einmal gratis'}</small></span><em>${profile.shop.gift ? '✓' : 'Abholen'}</em>`);
  gift.disabled = profile.shop.gift;
  gift.addEventListener('click', () => { const r = P.claimGift(profile); if (r) { save(); sfx('coin'); render(); } });
  body.append(gift);

  head('Angebote des Tages', 'Karten gegen Gold');
  const grid = el('div', 'offers');
  for (const o of P.shopOffers(profile)) {
    const b = el('button', `offer${o.sold ? ' sold' : ''}`);
    b.append(cardEl(o.id, { tag: 'div' }), el('b', 'n', `× ${o.n}`), el('em', profile.gold < o.gold && !o.sold ? 'poor' : '', o.sold ? 'Gekauft' : `<span class="ico coin"></span>${fmt(o.gold)}`));
    b.addEventListener('click', () => {
      if (o.sold) return;
      if (profile.gold < o.gold) { sfx('error'); flash(b); return; }
      if (P.buyOffer(profile, o.i)) { save(); sfx('buy'); render(); }
    });
    grid.append(b);
  }
  body.append(grid);

  head('Truhen', 'gegen Runensplitter');
  const chests = el('div', 'offers two');
  for (const [kind, c] of Object.entries(P.CHESTS)) {
    const b = el('button', 'offer chestOffer', `<span class="chestIco ${kind}"></span><b>${c.name}</b><small>${kind === 'holz' ? 'Gold und vier Kartenstapel' : 'Viel Gold und fünf große Kartenstapel'}</small><em class="${profile.gems < c.gems ? 'poor' : ''}"><span class="ico gem"></span>${c.gems}</em>`);
    b.addEventListener('click', () => {
      if (profile.gems < c.gems) { sfx('error'); flash(b); return; }
      const loot = P.buyChest(profile, kind);
      if (loot) { save(); lootSheet(c.name, loot); }
    });
    chests.append(b);
  }
  body.append(chests);

  head('Gold', '');
  const gold = el('button', 'offer wide', `<span class="ico coin big"></span><span><b>${P.GOLD_PACK.gold} Gold</b><small>Für Aufwertungen und Angebote</small></span><em class="${profile.gems < P.GOLD_PACK.gems ? 'poor' : ''}"><span class="ico gem"></span>${P.GOLD_PACK.gems}</em>`);
  gold.addEventListener('click', () => { if (P.buyGold(profile)) { save(); sfx('buy'); render(); } else { sfx('error'); flash(gold); } });
  body.append(gold);
  body.append(el('p', 'fine', 'Runensplitter bekommst du nur im Spiel: auf dem Trophäenweg, für Aufgaben, neue Arenen, Spielerstufen und aus der Kronentruhe. Echtes Geld gibt es hier nicht.'));
}
function flash(node) { node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); }

// ---- Reiter „Weg“ (Trophäenweg) ----------------------------------------------------------------
let roadSeen = false;
function renderRoad() {
  const body = $('#roadBody'); body.replaceChildren();
  body.append(el('div', 'sub', `<b>Trophäenweg</b><span>Bestmarke ${fmt(profile.best)}</span>`));
  let here = null, firstOpen = null;
  P.ARENAS.forEach((a, i) => {
    const reached = profile.arena >= i;
    const box = el('div', `arenaStep${reached ? ' reached' : ''}${profile.arena === i ? ' now' : ''}`);
    box.append(el('div', 'ah', `<small>Arena ${i + 1} · ${fmt(a.at)} <span class="ico trophy"></span></small><b>${a.name}</b>`));
    const thumbs = el('div', 'thumbs');
    for (const id of a.unlock) { const t = cardEl(id, { tag: 'button' }); if (!reached) t.classList.add('locked'); thumbs.append(t); }
    box.append(thumbs);
    body.append(box);
    if (profile.arena === i) here = box;
    const next = P.ARENAS[i + 1];
    for (const r of P.ROAD) {
      if (r.at <= a.at || (next && r.at > next.at)) continue;
      const can = profile.best >= r.at, got = profile.road.includes(r.at);
      const row = el('div', `mile${got ? ' got' : can ? ' can' : ''}`);
      row.append(el('span', 'at', `${fmt(r.at)} <span class="ico trophy"></span>`), el('span', 'what', r.kind === 'gold' ? `<span class="ico coin"></span>${r.n} Gold` : r.kind === 'gems' ? `<span class="ico gem"></span>${r.n} Runensplitter` : '<span class="chestIco holz mini"></span>Truhe'));
      const b = el('button', 'btn primary', got ? '✓' : can ? 'Abholen' : '');
      b.disabled = !can || got;
      b.addEventListener('click', () => {
        const loot = P.claimRoad(profile, r.at);
        if (!loot) return;
        save();
        if (loot.cards.length) lootSheet('Truhe vom Trophäenweg', loot); else { sfx('coin'); render(); }
      });
      row.append(b); body.append(row);
      if (can && !got && !firstOpen) firstOpen = row;
    }
  });
  const target = firstOpen || here; // zur ersten abholbereiten Belohnung springen, sonst zur eigenen Arena
  if (!roadSeen && target) { roadSeen = true; requestAnimationFrame(() => target.scrollIntoView({ block: 'center' })); }
}
$('#roadBody').addEventListener('click', e => { const c = e.target.closest('.thumbs .card'); if (c) { sfx('click'); showCard(c.dataset.id); } });

// ---- Reiter „Mehr“: Profil, Statistik, Einstellungen ---------------------------------------------
function renderMore() {
  const body = $('#moreBody'); body.replaceChildren();
  const pl = P.playerLevel(profile.xp), st = profile.stats, n = profile.wins + profile.losses + profile.draws;
  const fav = Object.entries(st.played).sort((a, b) => b[1] - a[1])[0];
  const card = el('div', 'profile');
  card.append(el('div', 'ph', `<span class="lvl big"><b>${pl.lvl}</b></span><div><b>${esc(profile.name)}</b><small>Arena ${profile.arena + 1} · ${P.ARENAS[profile.arena].name}</small></div>`));
  card.append(el('div', 'statlist', [
    ['Trophäen', fmt(profile.trophies)], ['Bestmarke', fmt(profile.best)], ['Kämpfe', fmt(n)], ['Siegquote', n ? `${Math.round(100 * profile.wins / n)} %` : '–'],
    ['Siege', fmt(profile.wins)], ['Drei-Kronen-Siege', fmt(st.three)], ['Längste Siegesserie', fmt(st.bestStreak)], ['Kronen gesamt', fmt(st.crowns)],
    ['Karten gespielt', fmt(st.cards)], ['Lieblingskarte', fav ? CARDS[fav[0]].name : '–'],
  ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('')));
  body.append(card);
  const list = el('div', 'list');
  const item = (label, sub, fn) => { const b = el('button', 'btn item', `<span><b>${label}</b><small>${sub}</small></span><i></i>`); b.addEventListener('click', () => { sfx('click'); fn(); }); list.append(b); };
  item('Einstellungen', 'Ton, Grafik, Bedienung, Name', showSettings);
  item('Letzte Kämpfe', profile.log.length ? `${profile.log.length} Einträge` : 'noch keine', showLog);
  item('So geht’s', 'Regeln in Kürze', () => showHelp());
  item('Spielstand sichern', 'Auf ein anderes Gerät übertragen', showTransfer);
  item('Über Runenfurt', 'Version und Hinweise', showAbout);
  body.append(list);
}

function showLog() {
  const body = el('div', 'log');
  if (!profile.log.length) body.append(el('p', 'center', 'Noch kein Kampf bestritten.'));
  for (const e of profile.log) {
    const when = e.t ? new Date(e.t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '';
    body.append(el('div', `logRow ${e.w === 0 ? 'win' : e.w === 1 ? 'lose' : ''}`, `<b>${e.w === 0 ? 'Sieg' : e.w === 1 ? 'Niederlage' : 'Unentschieden'}</b><span>${e.c[0]} : ${e.c[1]}</span><small>${esc(e.foe || 'Gegner')} · ${LEVELS[e.lv].name}${when ? ` · ${when}` : ''}</small><em>${e.d > 0 ? '+' : ''}${e.d} <span class="ico trophy"></span></em>`));
  }
  simpleSheet('Letzte Kämpfe', body);
}

function showSettings() {
  const body = el('div', 'settings');
  const s = profile.set;
  const toggle = (label, sub, get, set) => {
    const b = el('button', `setRow${get() ? ' on' : ''}`, `<span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><i class="switch"></i>`);
    b.addEventListener('click', () => { set(!get()); b.classList.toggle('on', get()); save(); applySettings(); sfx('click'); });
    body.append(b);
  };
  toggle('Ton', '', () => profile.sound, v => { profile.sound = v; });
  const vol = el('label', 'setRow', `<span><b>Lautstärke</b></span><input type="range" min="0" max="100" step="5" value="${Math.round(s.volume * 100)}" aria-label="Lautstärke">`);
  vol.querySelector('input').addEventListener('input', e => { s.volume = Number(e.target.value) / 100; applySettings(); });
  vol.querySelector('input').addEventListener('change', () => { save(); sfx('deploy'); });
  body.append(vol);
  const q = el('div', 'setRow col', '<span><b>Grafik</b><small>Niedrig spart Akku: geringere Auflösung, keine Schatten</small></span>');
  const seg = el('div', 'seg small');
  for (const k of P.QUALITIES) { const b = el('button', s.quality === k ? 'on' : '', k[0].toUpperCase() + k.slice(1)); b.addEventListener('click', () => { s.quality = k; save(); applySettings(); layout(); sfx('click'); for (const o of seg.children) o.classList.toggle('on', o === b); }); seg.append(b); }
  q.append(seg); body.append(q);
  toggle('Bildschirmwackeln', 'bei schweren Treffern', () => s.shake, v => { s.shake = v; });
  toggle('Fähigkeitsknöpfe links', 'für Linkshänder', () => s.lefty, v => { s.lefty = v; });
  toggle('Bildrate anzeigen', 'kleine Zahl oben im Kampf', () => s.fps, v => { s.fps = v; });
  const name = el('label', 'setRow', `<span><b>Name</b></span><input type="text" maxlength="16" value="${esc(profile.name)}" autocomplete="off" autocapitalize="words" spellcheck="false" aria-label="Name">`);
  name.querySelector('input').addEventListener('change', e => { const v = e.target.value.trim().slice(0, 16); profile.name = v || 'Runenwächter'; e.target.value = profile.name; save(); render(); });
  body.append(name);
  const reset = el('button', 'btn warn', 'Spielstand zurücksetzen');
  reset.addEventListener('click', () => {
    const d = el('div', '', '<h3>Wirklich alles löschen?</h3><p class="center">Trophäen, Karten, Gold und Runensplitter gehen verloren. Das lässt sich nicht rückgängig machen.</p>');
    const row = el('div', 'btns'), yes = el('button', 'btn warn', 'Ja, löschen');
    yes.addEventListener('click', () => { const keep = profile.set, snd = profile.sound; profile = P.newProfile(); profile.set = keep; profile.sound = snd; profile.seenHelp = true; P.ensureDay(profile, today()); save(); closeSheet(); sheetDismiss = null; show('home'); });
    row.append(closeBtn('Abbrechen', showSettings), yes); d.append(row);
    sheetDismiss = null; openSheet(d, true);
  });
  body.append(reset);
  simpleSheet('Einstellungen', body);
}

function showTransfer() {
  const body = el('div', 'transfer');
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(profile))));
  body.append(el('p', '', 'Kopiere diesen Text und füge ihn auf dem anderen Gerät hier wieder ein. So ziehst du mit deinem Spielstand um – zum Beispiel von der Adresse im WLAN auf die veröffentlichte Seite.'));
  const ta = el('textarea'); ta.value = code; ta.rows = 5; ta.setAttribute('aria-label', 'Spielstand als Text'); ta.spellcheck = false;
  body.append(ta);
  const row = el('div', 'btns'), copy = el('button', 'btn', 'Kopieren'), load = el('button', 'btn primary', 'Text laden');
  const msg = el('p', 'center small', '');
  copy.addEventListener('click', async () => {
    ta.value = code; ta.select();
    try { await navigator.clipboard.writeText(code); msg.textContent = 'Kopiert.'; } catch { try { document.execCommand('copy'); msg.textContent = 'Kopiert.'; } catch { msg.textContent = 'Bitte den Text von Hand markieren und kopieren.'; } }
  });
  load.addEventListener('click', () => {
    const raw = ta.value.trim();
    if (!raw || raw === code) { msg.textContent = 'Füge zuerst den Text vom anderen Gerät ein.'; return; }
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(raw))));
      if (!data || typeof data !== 'object' || !data.cards) throw new Error('kein Spielstand');
      profile = P.loadProfile(data); P.ensureDay(profile, today()); save(); applySettings();
      closeSheet(); sheetDismiss = null; show('home');
    } catch { msg.textContent = 'Das ist kein gültiger Spielstand.'; sfx('error'); }
  });
  row.append(copy, load); body.append(row, msg);
  simpleSheet('Spielstand sichern', body);
}

function showAbout() {
  const body = el('div', '', `<p>Runenfurt ist ein eigenständiges Echtzeit-Kartenspiel gegen den Computer. Es läuft ganz auf deinem Gerät: kein Konto, keine Werbung, keine Käufe, keine Datenübertragung. Der Spielstand liegt nur in diesem Browser.</p>
<p>${Object.keys(CARDS).length} Karten · ${P.ARENAS.length} Arenen · ${Object.keys(RUNES).length} Runenformen</p>
<p class="small">3D-Darstellung mit three.js (MIT-Lizenz, © three.js-Autoren). <span id="ver"></span></p>`);
  simpleSheet('Über Runenfurt', body);
  fetch('./sw.js').then(r => r.text()).then(t => { const m = t.match(/VERSION = '([^']+)'/); const v = $('#ver'); if (m && v) v.textContent = `Version ${m[1].replace('runenfurt-', '')}.`; }).catch(() => {});
}

// ---- Kampf -------------------------------------------------------------------------------------
const B = { g: null, ai: null, auto: null, acc: 0, last: 0, sel: null, ghost: null, paused: false, running: false, endAt: 0, drag: null, flags: {}, hand: [], next: null };

function layout() {
  const cs = getComputedStyle($('#probe'));
  const sat = parseFloat(cs.paddingTop) || 0, sab = parseFloat(cs.paddingBottom) || 0;
  const vw = window.innerWidth, vh = window.innerHeight;
  const root = getComputedStyle(document.documentElement);
  const hud = parseFloat(root.getPropertyValue('--hud')) || 44, panel = parseFloat(root.getPropertyValue('--panel')) || 148;
  renderer.resize(vw, vh - sat - sab - hud - panel, Math.min(3, window.devicePixelRatio || 1), profile.arena);
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 300));

function startBattle(training) {
  closeSheet(); sheetDismiss = null;
  unlock();
  for (const id of profile.deck) art(id); // Kartenbilder vor dem Kampf erzeugen (im Kampf würde das die Bühne stören)
  const seed = (Number(params.get('seed')) || Date.now()) >>> 0;
  let s = seed || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const opp = P.opponentLevels(profile, profile.level);
  B.g = sim.createGame({ seed, decks: [profile.deck, P.opponentDeck(profile, rnd)], levels: [P.playerLevels(profile), opp] });
  B.ai = createAi(profile.level);
  B.auto = AUTO ? createAi(AUTO) : null;
  B.level = profile.level; B.oppLvl = opp.lvl; B.training = !!training; B.foe = P.opponentName(rnd);
  B.count = { played: {}, spells: 0, abilities: 0 };
  B.acc = 0; B.last = performance.now(); B.sel = null; B.ghost = null; B.paused = false; B.endAt = 0; B.flags = {}; B.hand = []; B.next = null; B.booked = false;
  $('#foeName').textContent = B.foe;
  renderer.reset();
  show('battle');
  layout();
  if (renderer.prepare) renderer.prepare(B.g);
  updateHud(true);
  banner(training ? 'Übungskampf' : 'Kampf!');
  toast(`${B.foe} · Kartenstufe ${opp.lvl}`, 2600);
  sfx('horn');
  wakeLock(true);
  if (!B.running) { B.running = true; requestAnimationFrame(frame); }
}

let bannerT = 0;
function banner(text) { const b = $('#banner'); b.hidden = true; void b.offsetWidth; b.textContent = text; b.hidden = false; clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; }, 2000); }
let toastT = 0;
function toast(text, ms = 1300) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }

let lock = null;
async function wakeLock(on) {
  try {
    if (on && navigator.wakeLock && !lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    else if (!on && lock) { await lock.release(); lock = null; }
  } catch { /* nicht überall verfügbar */ }
}

function handleEvents() {
  const g = B.g;
  for (const ev of g.events) {
    renderer.onEvent(ev);
    if (ev.t === 'deploy') sfx(ev.rune || ev.hero ? 'rune' : 'deploy');
    else if (ev.t === 'ability') sfx(ev.id);
    else if (ev.t === 'burst' || ev.t === 'impact') sfx('heavy');
    else if (ev.t === 'cast') sfx('cast');
    else if (ev.t === 'spell') sfx(ev.spell);
    else if (ev.t === 'hit') sfx(ev.heavy || ev.splash ? 'heavy' : 'hit');
    else if (ev.t === 'shoot') sfx(ev.from === 'aussenturm' || ev.from === 'hauptturm' ? 'tower' : 'shoot');
    else if (ev.t === 'die' && ev.kind === 'tower') { sfx('fall'); if (!ev.main && !g.over) banner(ev.side === 1 ? 'Turm zerstört!' : 'Turm verloren!'); }
    else if (ev.t === 'wake') sfx('wake');
    else if (ev.t === 'shield' || ev.t === 'fuse') sfx(ev.t);
    else if (ev.t === 'kraft') { if (ev.side === 0) sfx('kraft'); }
    else if (ev.t === 'overtime') { sfx('horn'); banner('Verlängerung – der nächste Turm gewinnt!'); }
  }
  g.events.length = 0;
  if (!B.flags.double && g.phase === 'main' && g.time >= g.duration - 60) { B.flags.double = true; banner('Doppelte Kraft!'); sfx('horn'); }
  if (!B.flags.triple && g.phase === 'over' && g.time >= g.duration + g.overtime - 60) { B.flags.triple = true; banner('Dreifache Kraft!'); sfx('horn'); }
  const left = Math.ceil(sim.timeLeft(g));
  if (left <= 10 && left > 0 && left !== B.flags.tick && !g.over) { B.flags.tick = left; sfx('tick'); }
}

const fpsBox = $('#fps');
let fpsN = 0, fpsT = 0;
function frame(now) {
  if (!B.running) return;
  requestAnimationFrame(frame);
  const g = B.g;
  const dt = Math.min(0.1, (now - B.last) / 1000); B.last = now;
  if (!B.paused && !g.over) {
    B.acc += dt * SPEED;
    let n = 0;
    while (B.acc >= sim.DT && n++ < 60 && !g.over) {
      aiUpdate(g, 1, B.ai, sim.DT);
      if (B.auto) aiUpdate(g, 0, B.auto, sim.DT);
      sim.step(g);
      B.acc -= sim.DT;
    }
    if (n >= 60) B.acc = 0;
    handleEvents();
  }
  renderer.draw(g, g.over || B.paused ? 1 : Math.min(1, B.acc / sim.DT), B, now);
  updateHud(false);
  if (profile.set.fps) { fpsN++; if (now - fpsT >= 500) { fpsBox.textContent = `${Math.round(fpsN * 1000 / (now - fpsT))} Bilder/s`; fpsN = 0; fpsT = now; } }
  if (g.over && !B.endAt) { B.endAt = now + 1700; B.sel = null; B.ghost = null; }
  if (g.over && B.endAt && now >= B.endAt && !B.booked) finishBattle();
}

function updateHud(force) {
  const g = B.g, S = g.sides[0];
  const left = g.over ? B.flags.left || 0 : Math.max(0, Math.ceil(sim.timeLeft(g)));
  B.flags.left = left;
  const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (force || B.flags.time !== txt) { B.flags.time = txt; $('#time').textContent = txt; }
  const rate = Math.round(sim.kraftRate(g) / sim.KRAFT_RATE);
  const ph = g.phase === 'over' ? `Verlängerung${rate > 2 ? ' · 3×' : ' · 2×'}` : rate > 1 ? '2× Kraft' : '';
  if (force || B.flags.ph !== ph) { B.flags.ph = ph; $('#phase').textContent = ph; $('#clock').classList.toggle('hot', g.phase === 'over' || left <= 10); }
  const cr = `${g.sides[1].crowns}:${S.crowns}`;
  if (force || B.flags.cr !== cr) { B.flags.cr = cr; $('#crownFoe').textContent = g.sides[1].crowns; $('#crownMe').textContent = S.crowns; }
  $('#kraftFill').style.width = `${S.kraft * 10}%`;
  const k = Math.floor(S.kraft + 1e-6);
  if (force || B.flags.k !== k) { B.flags.k = k; $('#kraftNum').textContent = k; $('#kraft').classList.toggle('full', k >= sim.MAX_KRAFT); }
  const hand = $('#hand');
  for (let i = 0; i < 4; i++) {
    const id = S.hand[i], R = S.runes.has(id) ? RUNES[id] : null;
    const key = R ? `${id}|${Math.min(R.cycles, S.cycle[id] || 0)}` : id;
    if (force || B.hand[i] !== key) {
      const fresh = !B.hand[i] || B.hand[i].split('|')[0] !== id;
      B.hand[i] = key;
      const e = cardEl(id, { lvl: S.levels[id] || 1, pips: R ? { n: Math.min(R.cycles, S.cycle[id] || 0), of: R.cycles } : null });
      e.dataset.i = i;
      if (!force && fresh) e.classList.add('new');
      if (hand.children[i]) hand.replaceChild(e, hand.children[i]); else hand.append(e);
    }
    const e = hand.children[i];
    e.classList.toggle('poor', CARDS[S.hand[i]].cost > S.kraft);
    e.classList.toggle('sel', B.sel === i);
  }
  if (force || B.next !== S.next) { B.next = S.next; $('#nextCard').replaceChildren(cardEl(S.next, { tag: 'div' })); }
  // Heldenfähigkeiten
  const abl = g.over ? [] : sim.abilities(g, 0), akey = abl.map(a => a.cardId).join();
  const box = $('#abilities');
  if (force || B.flags.abl !== akey) {
    B.flags.abl = akey;
    box.classList.toggle('many', abl.length > 2);
    box.replaceChildren(...abl.map(a => { const b = el('button', 'ability', `<span class="an">${a.ability.name}</span><span class="ac">${a.ability.cost}</span><span class="cdn"></span>`); b.dataset.id = a.cardId; return b; }));
  }
  abl.forEach((a, i) => {
    const b = box.children[i];
    b.classList.toggle('ready', a.ready);
    b.classList.toggle('cool', a.cd > 0);
    const txt = a.cd > 0 ? String(Math.ceil(a.cd)) : '';
    if (b.lastChild.textContent !== txt) b.lastChild.textContent = txt;
  });
}

// Bedienung: Karte antippen und aufs Feld tippen – oder Karte aufs Feld ziehen.
const fieldPos = e => renderer.toField(e.clientX, e.clientY);
function tryPlay(pos) {
  const g = B.g;
  if (B.sel == null || !pos || g.over || B.paused) return;
  const id = g.sides[0].hand[B.sel], c = CARDS[id];
  if (g.sides[0].kraft < c.cost) { toast('Zu wenig Kraft'); sfx('error'); return; }
  const p = sim.clampDeploy(g, 0, id, pos.x, pos.y);
  if (sim.playCard(g, 0, B.sel, p.x, p.y)) {
    B.sel = null; B.ghost = null;
    B.count.played[id] = (B.count.played[id] || 0) + 1;
    if (c.type === 'spell') B.count.spells++;
  }
}
$('#abilities').addEventListener('pointerdown', e => {
  const b = e.target.closest('.ability'); if (!b || B.g.over || B.paused) return;
  e.preventDefault(); e.stopPropagation(); unlock();
  if (sim.useAbility(B.g, 0, b.dataset.id)) { B.count.abilities++; return; }
  const st = sim.abilities(B.g, 0).find(a => a.cardId === b.dataset.id);
  toast(!st ? 'Held ist gefallen' : st.cd > 0 ? 'Fähigkeit lädt noch' : B.g.sides[0].kraft < st.ability.cost ? 'Zu wenig Kraft' : st.ent.deployT > 0 ? 'Held ist noch nicht bereit' : 'Kein Gegner in Reichweite');
  sfx('error');
});
$('#hand').addEventListener('pointerdown', e => {
  const c = e.target.closest('.card'); if (!c || B.g.over || B.paused) return;
  e.preventDefault(); unlock();
  const i = Number(c.dataset.i);
  B.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, was: B.sel === i };
  B.sel = i; B.ghost = null;
  sfx('click');
});
window.addEventListener('pointermove', e => {
  const d = B.drag; if (!d || d.id !== e.pointerId) return;
  if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) d.moved = true;
  if (d.moved) B.ghost = fieldPos(e);
});
const endDrag = e => {
  const d = B.drag; if (!d || d.id !== e.pointerId) return;
  B.drag = null;
  if (e.type === 'pointercancel') { B.ghost = null; return; }
  if (d.moved) { const pos = fieldPos(e); if (pos) tryPlay(pos); B.ghost = null; }
  else if (d.was) B.sel = null; // zweites Antippen hebt die Auswahl auf
};
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
field.addEventListener('pointerdown', e => {
  e.preventDefault(); unlock();
  if (B.g.over || B.paused) return;
  if (B.sel == null) { toast('Erst unten eine Karte wählen'); return; }
  B.fieldPtr = e.pointerId; B.ghost = fieldPos(e);
});
field.addEventListener('pointermove', e => { if (B.fieldPtr === e.pointerId) B.ghost = fieldPos(e); });
field.addEventListener('pointerup', e => { if (B.fieldPtr !== e.pointerId) return; B.fieldPtr = null; tryPlay(fieldPos(e)); B.ghost = null; });
field.addEventListener('pointercancel', () => { B.fieldPtr = null; B.ghost = null; });
document.addEventListener('contextmenu', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (screen === 'battle') e.preventDefault(); }, { passive: false });

function pause() {
  if (screen !== 'battle' || B.g.over || B.paused) return;
  B.paused = true; B.sel = null; B.ghost = null; B.drag = null;
  const d = el('div', '', '<h3>Pause</h3><p class="center">Das Spiel wartet auf dich.</p>');
  const row = el('div', 'btns');
  const quit = el('button', 'btn warn', 'Aufgeben'), go = el('button', 'btn primary', 'Weiter');
  go.addEventListener('click', () => { sfx('click'); closeSheet(); sheetDismiss = null; B.paused = false; B.last = performance.now(); });
  quit.addEventListener('click', () => { sfx('click'); closeSheet(); sheetDismiss = null; B.paused = false; B.g.over = true; B.g.winner = 1; B.g.phase = 'end'; B.gaveUp = true; B.endAt = performance.now(); });
  row.append(quit, go); d.append(row);
  sheetDismiss = null;
  openSheet(d, true);
}
$('#pauseBtn').addEventListener('click', () => { sfx('click'); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else if (screen === 'battle' && !B.g.over) wakeLock(true); else if (screen === 'menu' && overlay.hidden) show(tab); });

function finishBattle() {
  B.booked = true;
  wakeLock(false);
  const g = B.g, w = g.winner;
  const timeout = !B.gaveUp && w !== 'draw' && g.sides[0].crowns === g.sides[1].crowns;
  const questsBefore = P.questsOpen(profile);
  const res = P.applyResult(profile, { winner: w, level: B.level, crowns: g.sides[0].crowns, foeCrowns: g.sides[1].crowns, foe: B.foe, when: Date.now(), training: B.training, ...B.count });
  B.gaveUp = false;
  save();
  sfx(w === 0 ? 'win' : w === 1 ? 'lose' : 'draw');
  const d = el('div');
  d.append(el('h3', w === 0 ? 'win' : w === 1 ? 'lose' : '', w === 0 ? 'Sieg!' : w === 1 ? 'Niederlage' : 'Unentschieden'));
  d.append(el('div', 'result', `<span class="me">${g.sides[0].crowns}</span><span class="ico crown"></span><span class="foe">${g.sides[1].crowns}</span>`));
  if (timeout) d.append(el('p', 'center', 'Entschieden über den am stärksten beschädigten Turm.'));
  if (B.training) d.append(el('p', 'center', 'Übungskampf – Trophäen und Truhen bleiben unberührt.'));
  else d.append(el('div', 'delta', `<span class="ico trophy"></span>${res.delta > 0 ? '+' : ''}${res.delta}<span style="color:var(--dim);font-weight:600;font-size:15px">&nbsp;→ ${fmt(profile.trophies)}</span>`));
  if (res.arenaUp) d.append(el('div', 'notice', `Neue Arena: ${res.arenaUp}! +${res.gems} Runensplitter`));
  if (res.newCards.length) {
    const box = el('div', 'chest'); box.append(el('b', 't', 'Neue Karten freigeschaltet'));
    const loot = el('div', 'loot');
    for (const id of res.newCards) { const it = el('div', 'item'); it.append(cardEl(id, { tag: 'div' })); loot.append(it); }
    box.append(loot); d.append(box);
  }
  if (res.chest) {
    d.append(lootBox('Siegestruhe', res.chest));
    if (canUpgradeAny()) d.append(el('p', 'center', 'Du kannst eine Karte aufwerten – schau unter „Karten“.'));
    setTimeout(() => sfx('coin'), 700);
  }
  if (res.crownBox) d.append(el('div', 'notice', 'Die Kronentruhe ist voll – hol sie dir im Menü!'));
  if (P.questsOpen(profile) > questsBefore) d.append(el('div', 'notice', 'Tagesaufgabe erfüllt – Belohnung wartet im Menü.'));
  const row = el('div', 'btns');
  const menu = el('button', 'btn', 'Menü'), again = el('button', 'btn primary', 'Nochmal');
  menu.addEventListener('click', () => { sfx('click'); closeSheet(); B.running = false; show('home'); });
  again.addEventListener('click', () => { sfx('click'); startBattle(B.training); });
  row.append(menu, again); d.append(row);
  sheetDismiss = null;
  openSheet(d, true);
}

// ---- Start -------------------------------------------------------------------------------------
drawIcon($('#emblem').getContext('2d'), 320, 20);
applySettings();
layout();
// Kartenbilder nach und nach vorab erzeugen, damit das Menü sofort da ist
const artQueue = [...profile.deck, ...Object.keys(CARDS)];
(function pump() { if (screen !== 'battle') for (let i = 0; i < 5 && artQueue.length; i++) art(artQueue.shift()); if (artQueue.length) setTimeout(pump, 25); })();
document.addEventListener('pointerdown', unlock, { once: true });
show('home');
window.__runenfurt = { B, sim, renderer, get profile() { return profile; }, start: startBattle, show };

// Offline-Betrieb: Service Worker anmelden; eine neue Version lädt die Seite neu, aber nie mitten im Kampf.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !params.has('nosw')) {
  let current = navigator.serviceWorker.controller, reloading = false;
  const maybeReload = () => {
    const w = navigator.serviceWorker.controller;
    if (!w || w === current) return;
    if (!current) { current = w; return; } // Erstinstallation
    current = w;
    if (reloading) return;
    if (screen === 'battle') { const t = setInterval(() => { if (screen !== 'battle') { clearInterval(t); location.reload(); } }, 1000); reloading = true; return; }
    reloading = true; location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', maybeReload);
  navigator.serviceWorker.register('./sw.js').then(reg => {
    document.addEventListener('visibilitychange', () => { if (!document.hidden && screen !== 'battle') reg.update().catch(() => {}); });
  }).catch(() => { /* ohne Offline-Cache weiterspielen */ });
}
