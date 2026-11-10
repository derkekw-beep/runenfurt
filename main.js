// Runenfurt – Oberfläche, Bedienung und Spielschleife.
import { CARDS, CARD_IDS, TOWER_IDS, UNITS, RUNES, RUNE_LEVEL, avgCost, TOWER_SPELL_FACTOR, UNIT_NAMES, MAX_HEROES, heroCount } from './cards.js';
import * as sim from './sim.js';
import { createAi, aiUpdate, LEVELS } from './ai.js';
import * as P from './progress.js';
import { createRenderer, drawCardArt } from './render.js';
import { createRenderer3D } from './render3d.js';
import { sfx, unlock, setSound, setVolume } from './audio.js';
import { STORY, explain } from './lore.js';
import { createStage } from './menu.js';

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
if (renderer.ready) await renderer.ready; // neue Bildfolgen und 3D-Teile (engine/assets) – höchstens wenige Sekunden
const field = $('#arena');
const stage = createStage($('#stageCv')); // Figuren des Decks im Hauptmenü

function applySettings() {
  setSound(profile.sound); setVolume(profile.set.volume);
  renderer.setOptions(profile.set);
  stage.setQuality(profile.set.quality);
  document.body.classList.toggle('calm', profile.set.quality === 'niedrig'); // Grafik „Niedrig“: keine Dauer-Animationen im Menü
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
  const rar = P.rarity(id);
  const e = el(opt.tag || 'button', `card r-${rar}${c.hero ? ' hero' : ''}`);
  const cv = document.createElement('canvas'); cv.width = 200; cv.height = 264;
  cv.getContext('2d').drawImage(art(id), 0, 0);
  e.append(cv);
  if (c.type !== 'tower') e.append(el('span', 'cost', opt.cost != null ? opt.cost : c.mirror ? '+1' : c.cost)); // Türme kosten keine Kraft
  e.append(el('span', c.name.length > 10 ? 'name long' : 'name', c.name));
  if (opt.locked != null) { e.classList.add('locked'); e.append(el('span', 'lv', `Arena ${opt.locked + 1}`)); }
  else if (opt.lvl) e.append(el('span', 'lv', `St. ${opt.lvl}`));
  if (opt.meter) {
    const m = el('span', 'meter'); const i = el('i'); i.style.width = `${Math.min(100, opt.meter * 100)}%`; m.append(i); e.append(m);
    if (opt.meter >= 1) e.classList.add('up');
  }
  // Seltenheit: Rahmenfarbe und ein Stein oben in der Mitte (selten: Raute, episch: Doppelraute, legendär: Stern); Helden tragen ein Banner
  if (rar === 'held') e.append(el('span', 'heroMark', 'Held')); else if (rar !== 'gewoehnlich') e.append(el('span', `rar ${rar}`, ''));
  // Runenform: Zeichen unten links – blass mit Scherbenstand, solange sie noch nicht erweckt ist
  const rune = opt.rune === undefined ? (opt.locked == null && profile.cards[id] ? P.runeInfo(profile, id) : RUNES[id] ? { have: 0, need: P.RUNE_SHARDS, done: false } : null) : opt.rune;
  if (rune) e.append(el('span', rune.done ? 'runeMark' : 'runeMark off', rune.done ? '' : `<i>${rune.have}/${rune.need}</i>`));
  if (opt.ability) e.append(el('span', 'abil', `<b>${opt.ability.cost}</b>${opt.ability.name}`)); // Held in der Hand: Fähigkeit und ihre Kosten
  if (opt.wish) e.append(el('span', 'wishMark', '★'));
  if (opt.pips) { // Zyklen bis zur Runenform
    const row = el('span', 'pips');
    for (let i = 0; i < opt.pips.of; i++) row.append(el('i', i < opt.pips.n ? 'on' : ''));
    e.append(row);
    if (opt.pips.n >= opt.pips.of) { e.classList.add('rune'); e.append(el('span', 'runeNow', 'Runenform')); }
    else row.title = `noch ${opt.pips.of - opt.pips.n}`;
  }
  e.dataset.id = id;
  return e;
}

// ---- Bildschirme und Reiter --------------------------------------------------------------------
const TABS = { home: $('#tabHome'), cards: $('#tabCards'), shop: $('#tabShop'), road: $('#tabRoad'), more: $('#tabMore') };
const TAB_ORDER = ['shop', 'cards', 'home', 'road', 'more']; // Reihenfolge der unteren Leiste: bestimmt die Richtung des Übergangs
let screen = 'menu', tab = 'home';
function show(name) {
  const battle = name === 'battle';
  screen = battle ? 'battle' : 'menu';
  $('#battle').hidden = !battle; $('#menu').hidden = battle;
  if (battle) { stageSync(); return; }
  dayCheck(); chestTick();
  const from = tab;
  if (TABS[name]) tab = name;
  for (const [k, s] of Object.entries(TABS)) s.hidden = k !== tab;
  for (const b of $('#nav').children) if (b.dataset.tab) b.classList.toggle('on', b.dataset.tab === tab);
  $('#nav').style.setProperty('--i', TAB_ORDER.indexOf(tab));
  if (from !== tab) { // der neue Reiter gleitet aus der Richtung herein, in der er in der Leiste liegt
    const t = TABS[tab]; t.classList.remove('inL', 'inR'); void t.offsetWidth;
    t.classList.add(TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(from) ? 'inR' : 'inL');
  }
  render();
  stageSync();
}
// Die Bühne im Hauptmenü läuft nur, wenn man sie sieht: Reiter „Kampf“, kein Kampf, keine Einblendung, Seite im Vordergrund
function stageSync() {
  const on = screen === 'menu' && tab === 'home' && overlay.hidden && fxLayer.hidden && !document.hidden;
  if (on) { stage.setDeck(profile.deck, profile.arena); stage.start(); } else stage.stop();
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

const overlay = $('#overlay'), sheet = $('#sheet'), fxLayer = $('#fx');
new MutationObserver(() => stageSync()).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
new MutationObserver(() => stageSync()).observe(fxLayer, { attributes: true, attributeFilter: ['hidden'] });
window.addEventListener('resize', () => stage.resize());
function openSheet(node, center) { sheet.replaceChildren(node); overlay.classList.toggle('center', !!center); overlay.hidden = false; sheet.scrollTop = 0; }
function closeSheet() { overlay.hidden = true; sheet.replaceChildren(); for (const c of overlay.querySelectorAll('.confetti')) c.remove(); }
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
  const now = Date.now();
  const dots = { shop: !profile.shop.gift, cards: canUpgradeAny(), home: P.questsOpen(profile) > 0 || profile.crownBox >= P.CROWN_BOX || P.chestsReady(profile, now) > 0 || P.freeInfo(profile, now).n > 0, road: P.roadOpen(profile).length > 0, more: false };
  for (const b of $('#nav').children) if (b.dataset.tab) b.lastElementChild.hidden = !dots[b.dataset.tab];
}

// Beute zeigen: Gold, Runensplitter, Karten
const RAR_ORDER = { gewoehnlich: 0, selten: 1, episch: 2, legendaer: 3, held: 4 };
const byRarity = (a, b) => RAR_ORDER[P.rarity(a.id)] - RAR_ORDER[P.rarity(b.id)];
function lootBox(title, loot) {
  const box = el('div', 'chest'); box.append(el('b', 't', title));
  const row = el('div', 'loot');
  if (loot.gold) row.append(el('div', 'item goldItem', `<span class="ico coin"></span>+${fmt(loot.gold)}`));
  if (loot.gems) row.append(el('div', 'item goldItem', `<span class="ico gem"></span>+${loot.gems}`));
  if (loot.jokers) row.append(el('div', 'item goldItem', `<span class="ico joker"></span>+${loot.jokers}`));
  if (loot.wild) row.append(el('div', 'item goldItem', `<span class="ico wild"></span>+${loot.wild}`));
  for (const s of [...(loot.cards || [])].sort(byRarity)) { const it = el('div', 'item'); it.append(cardEl(s.id, { tag: 'div' }), document.createTextNode(`× ${s.n}`)); row.append(it); }
  for (const s of loot.shards || []) { const it = el('div', 'item shardItem'); it.append(cardEl(s.id, { tag: 'div' }), el('span', '', `<span class="ico shard"></span>+${s.n}`)); row.append(it); }
  [...row.children].forEach((it, i) => it.style.setProperty('--i', i)); // Stück für Stück einblenden
  box.append(row);
  return box;
}
function lootSheet(title, loot, note, kind) {
  const summary = () => {
    const body = el('div');
    body.append(lootBox(title, loot));
    if (note) body.append(el('p', 'center', note));
    simpleSheet('', body);
    render();
  };
  if (kind && (loot.cards || []).length) openChest(kind, title, loot, summary); else { sfx('chest'); summary(); }
}

// Truhe öffnen: Sie fällt herein, ein Antippen öffnet sie, dann kommt der Inhalt Stück für Stück heraus.
function openChest(kind, title, loot, done) {
  const items = [];
  if (loot.gold) items.push({ t: 'gold', n: loot.gold });
  if (loot.jokers) items.push({ t: 'joker', n: loot.jokers });
  for (const s of [...(loot.cards || [])].sort(byRarity)) items.push({ t: 'card', id: s.id, n: s.n }); // das Seltenste kommt zum Schluss
  if (loot.gems) items.push({ t: 'gem', n: loot.gems });
  for (const s of loot.shards || []) items.push({ t: 'shard', id: s.id, n: s.n });
  if (loot.wild) items.push({ t: 'wild', n: loot.wild });
  const box = el('div', `chestfx ${kind}`, `<button class="skip">Überspringen</button><div class="ctitle">${title}</div><div class="cstage"><div class="rays"></div><div class="reveal"></div><div class="chestbox"><i class="glowin"></i><i class="lid"></i><i class="body"></i><i class="lock"></i><b class="ccount">${items.length}</b></div></div><div class="cinfo"></div><div class="uphint">Tippen zum Öffnen</div>`);
  const reveal = box.querySelector('.reveal'), info = box.querySelector('.cinfo'), count = box.querySelector('.ccount'), hint = box.querySelector('.uphint');
  fxLayer.replaceChildren(box); fxLayer.hidden = false;
  sfx('deploy');
  let i = -1, closed = false, timer = 0, last = performance.now();
  const close = () => { if (closed) return; closed = true; clearTimeout(timer); fxLayer.hidden = true; fxLayer.replaceChildren(); fxLayer.onclick = null; done(); };
  const next = () => {
    clearTimeout(timer);
    if (i < 0) { box.classList.add('open'); sfx('chest'); hint.textContent = 'Tippen für das nächste Stück'; }
    i++;
    if (i >= items.length) { close(); return; }
    const it = items[i], rar = it.id ? P.rarity(it.id) : '', node = el('div', `ritem ${it.t}${it.t === 'card' ? ` r-${rar}` : ''}`);
    box.dataset.rar = it.t === 'card' ? rar : it.t === 'shard' || it.t === 'wild' ? 'rune' : ''; // Strahlen in der Farbe der Seltenheit
    if (it.t === 'card') {
      node.append(cardEl(it.id, { tag: 'div', lvl: profile.cards[it.id].lvl }));
      const wish = profile.wish === it.id, fine = RAR_ORDER[rar] >= 2;
      if (fine) for (let k = 0; k < 14; k++) { const sp = el('i', 'rspark'), a = (k / 14) * 6.283; sp.style.setProperty('--x', `${Math.cos(a) * 120}px`); sp.style.setProperty('--y', `${Math.sin(a) * 150}px`); node.append(sp); } // Episches und Selteneres mit Funkenkranz
      info.innerHTML = `<small class="rword ${rar}">${P.RARITY_NAME[rar]}</small><b>${CARDS[it.id].name}</b><span>× ${it.n}</span>${wish ? '<em class="wish">★ Wunschkarte</em>' : ''}${P.upgradeInfo(profile, it.id).can ? '<em class="can">Bereit zum Aufwerten</em>' : ''}`;
      sfx(wish || fine ? 'rune' : 'flip');
    } else if (it.t === 'shard') {
      node.append(cardEl(it.id, { tag: 'div' }));
      const r = P.runeInfo(profile, it.id);
      info.innerHTML = `<small class="rword rune">Runenscherbe</small><b>${CARDS[it.id].name}</b><span>+ ${it.n} · ${r.have} / ${r.need}</span>${r.done ? '<em class="can">Runenform erweckt!</em>' : ''}`;
      sfx('rune');
    } else if (it.t === 'wild') {
      node.innerHTML = '<span class="ico wild"></span>';
      info.innerHTML = `<small class="rword rune">passt auf jede Karte</small><b>Wanderscherbe</b><span>+ ${it.n}</span>`;
      sfx('rune');
    } else {
      node.innerHTML = `<span class="ico ${it.t === 'gold' ? 'coin' : it.t}"></span>`;
      info.innerHTML = `<b>${it.t === 'gold' ? 'Gold' : it.t === 'gem' ? 'Runensplitter' : 'Joker'}</b><span>+ ${fmt(it.n)}</span>`;
      sfx('coin');
    }
    reveal.replaceChildren(node);
    info.classList.remove('show'); void info.offsetWidth; info.classList.add('show');
    count.textContent = items.length - i - 1; count.classList.toggle('zero', i === items.length - 1);
    last = performance.now();
    timer = setTimeout(next, 2100);
  };
  box.querySelector('.skip').addEventListener('click', e => { e.stopPropagation(); sfx('click'); close(); });
  fxLayer.onclick = () => { if (performance.now() - last > 320) next(); };
  timer = setTimeout(next, 2800); // öffnet sich nach kurzem Warten von selbst
}

// ---- Reiter „Kampf“ ----------------------------------------------------------------------------
const clock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} Std. ${String(m).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
const mins = ms => { const m = Math.round(ms / 60000); return m >= 60 ? `${dec(Math.round(m / 6) / 10)} Std.` : `${m} Min.`; };
const chestTick = () => { if (P.tickChests(profile, Date.now())) save(); };
// Was in einer Truhe steckt, in einem Satz
function chestText(kind, arena = profile.arena) {
  const i = P.chestInfo(kind, arena);
  return `${i.cards} Karten · rund ${fmt(i.gold)} Gold · ${i.jokers} Joker${i.gems ? ` · ${i.gems} Runensplitter` : ''}`;
}
// Truhenplätze: fertig (antippen öffnet), läuft (Restzeit), wartet, frei (zeigt blass, was der nächste Sieg bringt)
let slotKey = '';
function renderChests(force) {
  const now = Date.now(), slots = P.chestSlots(profile, now), key = slots.map(c => (c ? c.kind + c.state : '-')).join() + profile.cyc;
  const row = $('#chestRow');
  if (force || key !== slotKey || row.children.length !== slots.length) {
    slotKey = key;
    let free = 0;
    row.replaceChildren(...slots.map((c, i) => {
      if (!c) { const kind = P.cycleKind(profile.cyc + free), first = !free++; const b = el('button', 'slot vacant', `<span class="chestIco ${kind}"></span><b>${first ? 'Nächster Sieg' : 'Frei'}</b><small>${first ? P.CHESTS[kind].name : 'Truhenplatz'}</small>`); b.dataset.i = i; return b; }
      const b = el('button', `slot ${c.state}`, `<span class="chestIco ${c.kind}"></span><b></b><small>${c.name}</small><i class="prog"><i></i></i>`);
      b.dataset.i = i; return b;
    }));
  }
  slots.forEach((c, i) => {
    if (!c) return;
    const b = row.children[i], txt = c.state === 'ready' ? 'Öffnen' : c.state === 'run' ? clock(c.left) : mins(c.total);
    if (b.children[1].textContent !== txt) b.children[1].textContent = txt;
    b.lastElementChild.firstElementChild.style.width = `${c.state === 'wait' ? 0 : 100 * (1 - c.left / c.total)}%`;
  });
  const fr = P.freeInfo(profile, now);
  $('#freeInfo').textContent = fr.n ? (fr.n > 1 ? `${fr.n} bereit` : 'bereit') : `in ${clock(fr.next)}`;
  $('#freeDot').hidden = !fr.n; $('#freeBtn').classList.toggle('go', fr.n > 0);
}
function renderHome() {
  const a = P.ARENAS[profile.arena], next = P.ARENAS[profile.arena + 1];
  $('#who').textContent = profile.name;
  $('#deckName').textContent = `Deck ${profile.slot + 1}`;
  $('#deckInfo').textContent = `Ø ${dec(avgCost(profile.deck).toFixed(1))} Kraft`;
  renderChests(true);
  const freeSlot = profile.chests.includes(null);
  $('#playInfo').textContent = freeSlot ? `Sieg bringt: ${P.CHESTS[P.cycleKind(profile.cyc)].name}` : 'Alle Truhenplätze belegt';
  $('#crownFill').style.width = `${Math.min(100, 100 * profile.crownBox / P.CROWN_BOX)}%`;
  $('#crownBtn').classList.toggle('go', profile.crownBox >= P.CROWN_BOX);
  $('#questBtn').classList.toggle('go', P.questsOpen(profile) > 0);
  $('#arenaNo').textContent = `Arena ${profile.arena + 1}`;
  $('#arenaName').textContent = a.name;
  $('#trophyNum').textContent = fmt(profile.trophies);
  $('#trophyFill').style.width = next ? `${Math.max(0, Math.min(100, 100 * (profile.trophies - a.at) / (next.at - a.at)))}%` : '100%';
  $('#arenaHint').textContent = next ? `Noch ${next.at - profile.trophies} Trophäen bis ${next.name}${next.unlock.length ? ' – dort warten neue Karten' : ''}` : 'Höchste Arena erreicht';
  for (const b of $('#levelSeg').children) b.classList.toggle('on', b.dataset.level === profile.level);
  const open = P.questsOpen(profile), left = profile.quests.filter(q => !q.claimed).length;
  $('#questInfo').textContent = open ? `${open} bereit` : left ? `${left} offen` : 'erledigt';
  $('#questDot').hidden = !open;
  $('#crownInfo').textContent = profile.crownBox >= P.CROWN_BOX ? 'bereit' : `${profile.crownBox} / ${P.CROWN_BOX}`;
  $('#crownDot').hidden = profile.crownBox < P.CROWN_BOX;
  $('#modeDot').hidden = !(P.modeBonusOpen(profile) || P.bossNext(profile) >= 0);
  const n = profile.wins + profile.losses + profile.draws;
  $('#stats').textContent = n ? `${profile.wins} Siege · ${profile.losses} Niederlagen${profile.draws ? ` · ${profile.draws} Unentschieden` : ''}` : 'Zerstöre die Türme auf der anderen Seite der Furt.';
}

$('#levelSeg').addEventListener('click', e => { const l = e.target.dataset.level; if (!l) return; profile.level = l; save(); sfx('click'); renderHome(); });
$('#playBtn').addEventListener('click', () => { sfx('click'); if (!profile.seenHelp) showHelp(() => startBattle(false)); else startBattle(false); });
$('#modeBtn').addEventListener('click', () => { sfx('click'); showModes(); });
$('#arenaBox').addEventListener('click', () => { sfx('click'); show('road'); });
$('#lvlPill').addEventListener('click', () => { sfx('click'); show('more'); });
$('#questBtn').addEventListener('click', () => { sfx('click'); showQuests(); });
$('#crownBtn').addEventListener('click', () => {
  sfx('click');
  const loot = P.claimCrownBox(profile);
  if (loot) { save(); lootSheet('Kronentruhe', loot, '', 'kronen'); return; }
  simpleSheet('Kronentruhe', el('div', 'chestCard', `<span class="chestIco kronen"></span><p class="center">Jede Krone aus einem Kampf zählt – auch bei einer Niederlage. Bei ${P.CROWN_BOX} Kronen öffnet sich die Kronentruhe.</p><p class="center small">${chestText('kronen')} · 5 Runensplitter</p><div class="meterBig"><i style="width:${100 * profile.crownBox / P.CROWN_BOX}%"></i><span>${profile.crownBox} / ${P.CROWN_BOX} Kronen</span></div>`));
});
$('#deckBtn').addEventListener('click', () => { sfx('click'); show('cards'); });
$('#stageCv').addEventListener('pointerdown', e => { if (stage.poke(e.clientX, e.clientY)) sfx('click'); });
// Freie Truhe: alle vier Stunden eine, höchstens zwei warten
$('#freeBtn').addEventListener('click', () => {
  sfx('click');
  const now = Date.now(), loot = P.claimFree(profile, now);
  if (loot) { save(); lootSheet('Freie Truhe', loot, '', 'frei'); return; }
  simpleSheet('Freie Truhe', el('div', 'chestCard', `<span class="chestIco frei"></span><p class="center">Alle vier Stunden gibt es eine kleine Truhe geschenkt. Höchstens ${P.FREE_MAX} warten auf dich.</p><p class="center small">${chestText('frei')}</p><div class="notice">Die nächste kommt in ${clock(P.freeInfo(profile, now).next)}</div>`));
});
// Truhenplätze: fertige Truhe öffnen, sonst zeigen, was drin ist und wie lange sie noch braucht
$('#chestRow').addEventListener('click', e => {
  const b = e.target.closest('.slot'); if (!b) return;
  sfx('click');
  const i = Number(b.dataset.i), now = Date.now();
  chestTick();
  const c = P.chestSlots(profile, now)[i];
  if (!c) { showCycle(); return; }
  if (c.state === 'ready') { const loot = P.openSlot(profile, i, now); if (loot) { save(); lootSheet(c.name, loot, '', c.kind); } return; }
  showSlot(i);
});
function showSlot(i) {
  const now = Date.now(), c = P.chestSlots(profile, now)[i];
  if (!c) return;
  const cost = P.skipCost(profile, i, now), running = P.chestSlots(profile, now).find(x => x && x.state === 'run');
  const d = el('div', 'chestCard', `<h3>${c.name}</h3><span class="chestIco ${c.kind}"></span><p class="center small">aus Arena ${c.arena + 1} · ${P.ARENAS[c.arena].name}</p><p class="center">${chestText(c.kind, c.arena)}</p>`);
  d.append(el('div', 'notice', c.state === 'run' ? `Öffnet sich in <b class="left">${clock(c.left)}</b>` : `Wartet – braucht ${mins(c.total)}${running ? `, zuerst ist die ${running.name} dran` : ''}`));
  d.append(el('p', 'center small', 'Truhen öffnen sich nacheinander von selbst – auch wenn das Spiel zu ist.'));
  const row = el('div', 'btns'), skip = el('button', 'btn primary', `Sofort öffnen <span class="ico gem"></span>${cost}`);
  skip.disabled = profile.gems < cost;
  skip.addEventListener('click', () => {
    const t = Date.now();
    if (!P.skipChest(profile, i, t)) { sfx('error'); return; }
    const loot = P.openSlot(profile, i, t);
    save(); sfx('buy'); closeSheet(); sheetDismiss = null;
    if (loot) lootSheet(c.name, loot, '', c.kind); else render();
  });
  row.append(closeBtn(), skip); d.append(row);
  sheetDismiss = () => { closeSheet(); sheetDismiss = null; };
  openSheet(d, true);
}
// Truhenfolge: was die nächsten Siege bringen
function showCycle() {
  const d = el('div', 'chestCard');
  d.append(el('p', 'center', 'Jeder Sieg legt eine Truhe auf einen freien Truhenplatz. Welche es ist, steht fest – so sieht deine Reihe aus:'));
  const row = el('div', 'cycle');
  P.nextChests(profile, 8).forEach((kind, k) => row.append(el('div', k ? '' : 'next', `<span class="chestIco ${kind}"></span><small>${k ? `${k + 1}.` : 'als Nächstes'}</small>`)));
  d.append(row);
  const list = el('div', 'kinds');
  for (const kind of ['sieg', 'eisen', 'riesen', 'runen']) list.append(el('div', '', `<span class="chestIco ${kind}"></span><span><b>${P.CHESTS[kind].name} <em>${mins(P.chestTime(kind))}</em></b><small>${chestText(kind)}</small></span>`));
  d.append(list, el('p', 'center small', 'Sind alle vier Plätze belegt, bringt ein Sieg nur Trophäen und die Siegprämie.'));
  simpleSheet('Truhenfolge', d);
}
// Uhren im Hauptmenü: einmal je Sekunde, nur solange der Reiter „Kampf“ zu sehen ist
setInterval(() => {
  if (screen !== 'menu' || tab !== 'home' || document.hidden) return;
  const ready = P.chestsReady(profile, Date.now());
  chestTick(); renderChests(false);
  if (P.chestsReady(profile, Date.now()) !== ready) renderTop();
  const left = sheet.querySelector('.chestCard .left'); // offenes Truhenblatt läuft mit
  if (left) { const run = P.chestSlots(profile, Date.now()).find(x => x && x.state === 'run'); if (run) left.textContent = clock(run.left); }
}, 1000);

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
  const all = profile.questBonus === profile.day;
  body.append(el('div', `qbonus${all ? ' claimed' : ''}`, `<div class="qt"><b>Alle drei erledigt</b><small>${all ? 'Wanderscherbe erhalten' : 'bringt eine Wanderscherbe für eine Runenform deiner Wahl'}</small></div><span class="ico wild big"></span>`));
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
<li><b>Runenform:</b> Manche Karten lassen sich mit sechs Runenscherben erwecken. Danach erscheinen sie jedes zweite oder dritte Mal in einer stärkeren Form (violette Rauten auf der Karte).</li>
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
let cardView = 'werte'; // zuletzt gewählte Ansicht im Kartenblatt (Werte, Erklärung, Geschichte)
let filter = 'alle', sort = 'arena';
const SORTS = { arena: ['Arena', null], selten: ['Seltenheit', (a, b) => RAR_ORDER[P.rarity(b)] - RAR_ORDER[P.rarity(a)]], kraft: ['Kraft', (a, b) => CARDS[a].cost - CARDS[b].cost], stufe: ['Stufe', (a, b) => (profile.cards[b] ? profile.cards[b].lvl : 0) - (profile.cards[a] ? profile.cards[a].lvl : 0)] };
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
  for (const id of profile.deck) { const e = cardEl(id, { lvl: profile.cards[id].lvl, meter: meter(id), wish: profile.wish === id }); if (swap) e.classList.add('pick'); dg.append(e); }
  // Türme: die gewählte Art gilt für beide Außentürme; der Hauptturm steigt mit der Spielerstufe
  $('#towerInfo').textContent = `Hauptturm: Stufe ${P.playerLevel(profile.xp).lvl}`;
  $('#towerGrid').replaceChildren(...TOWER_IDS.map(id => {
    if (!profile.cards[id]) return cardEl(id, { locked: P.unlockArena(id) });
    const e = cardEl(id, { lvl: profile.cards[id].lvl, meter: meter(id), wish: profile.wish === id });
    if (profile.towerSel === id) { e.classList.add('sel'); e.append(el('span', 'selMark', '✓')); }
    return e;
  }));
  const chips = $('#filterChips');
  chips.replaceChildren(...Object.entries(FILTERS).map(([k, [label]]) => { const b = el('button', k === filter ? 'on' : '', label); b.dataset.f = k; return b; }));
  $('#sortChips').replaceChildren(el('small', '', 'Sortieren'), ...Object.entries(SORTS).map(([k, [label]]) => { const b = el('button', k === sort ? 'on' : '', label); b.dataset.s = k; return b; }));
  const cg = $('#collGrid'); cg.replaceChildren();
  const all = P.ARENAS.flatMap(a => a.unlock).filter(id => CARDS[id].type !== 'tower' && !profile.deck.includes(id) && FILTERS[filter][1](CARDS[id]));
  if (SORTS[sort][1]) { const own = all.filter(id => profile.cards[id]).sort(SORTS[sort][1]), rest = all.filter(id => !profile.cards[id]).sort(SORTS[sort][1]); all.splice(0, all.length, ...own, ...rest); } // eigene Karten zuerst
  for (const id of all) cg.append(profile.cards[id] ? cardEl(id, { lvl: profile.cards[id].lvl, meter: meter(id), wish: profile.wish === id }) : cardEl(id, { locked: P.unlockArena(id) }));
  if (!all.length) cg.append(el('p', 'empty', 'Keine weiteren Karten in dieser Auswahl.'));
  $('#collCount').textContent = `${Object.keys(profile.cards).filter(id => CARDS[id].type !== 'tower').length} von ${CARD_IDS.length} Karten`;
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
$('#sortChips').addEventListener('click', e => { const k = e.target.dataset.s; if (!k) return; sfx('click'); sort = k; renderDeck(); });
$('#deckGrid').addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  sfx('click');
  if (swap) {
    if (CARDS[swap].hero && !CARDS[c.dataset.id].hero && heroCount(profile.deck) >= MAX_HEROES) { // ein vierter Held ginge nur im Tausch gegen einen anderen
      sfx('error'); flash(c); $('#swapHint').textContent = `Höchstens ${MAX_HEROES} Helden im Deck – tippe einen Helden an, um ihn zu ersetzen.`;
      return;
    }
    profile.deck[profile.deck.indexOf(c.dataset.id)] = swap; swap = null; save(); renderDeck(); return;
  }
  showCard(c.dataset.id);
});
$('#towerGrid').addEventListener('click', e => { const c = e.target.closest('.card'); if (!c) return; sfx('click'); swap = null; showCard(c.dataset.id); });
$('#collGrid').addEventListener('click', e => { const c = e.target.closest('.card'); if (!c) return; sfx('click'); swap = null; showCard(c.dataset.id); });

const SPEED_NAME = v => (v <= 1.0 ? 'Langsam' : v <= 1.4 ? 'Mittel' : v <= 2.0 ? 'Schnell' : 'Sehr schnell'); // 0,9 · 1,2 · 1,8 · 2,4 Felder je Sekunde
const SPAWN_NAME = new Proxy({ wicht: ['Wicht', 'Wichte'] }, { get: (t, k) => t[k] || UNIT_NAMES[k] || [k, k] }); // Kurzformen für die Wertetabelle
function statRows(id, lvl) {
  const c = CARDS[id], m = sim.cardMult(lvl), up = lvl < P.MAX_LEVEL ? sim.cardMult(lvl + 1) : 0;
  const rows = [];
  const scaled = (label, base) => rows.push([label, fmt(Math.round(base * m)), up ? `+${fmt(Math.round(base * up) - Math.round(base * m))}` : '']);
  if (c.type === 'tower') { // Türme wachsen mit 8 % je Stufe
    const u = UNITS[c.unit], tm = sim.towerMult(lvl), tu = lvl < P.MAX_LEVEL ? sim.towerMult(lvl + 1) : 0;
    const grow = (label, base) => rows.push([label, fmt(Math.round(base * tm)), tu ? `+${fmt(Math.round(base * tu) - Math.round(base * tm))}` : '']);
    grow('Leben', u.hp); grow('Schaden', u.dmg);
    rows.push(['Schlagtempo', `${dec(u.atk)} s`, '']); grow('Schaden je Sekunde', u.dmg / u.atk);
    if (u.ammo) { rows.push(['Klingenvorrat', `${u.ammo.max} · neu alle ${dec(u.ammo.reload)} s`, '']); rows.push(['Wenn leer', `ein Wurf alle ${dec(u.ammo.reload + u.atk)} s`, '']); }
    if (u.bless) { rows.push(['Segen', `alle ${u.bless.every}–38 s`, '']); rows.push(['Wirkung', 'zäheste Truppe +1 Stufe', '']); }
    rows.push(['Reichweite', `${dec(u.range)} Felder`, '']); rows.push(['Ziele', 'Luft & Boden', '']);
    return rows;
  }
  if (c.type === 'spell') {
    if (c.dmg) { scaled(c.strikes ? 'Schaden je Blitz' : 'Schaden', c.dmg); scaled('Turmschaden', c.dmg * TOWER_SPELL_FACTOR); }
    if (c.strikes) rows.push(['Blitze', `${c.strikes} – auf die zähesten Ziele`, '']);
    if (c.heal) { scaled('Heilung je Schlag', c.heal); rows.push(['Dauer', `${c.dur} s`, '']); }
    if (c.mirror) { rows.push(['Wiederholt', 'deine letzte Karte', '']); rows.push(['Kosten', 'ihre Kraft + 1', '']); rows.push(['Stufe der Wiederholung', String(lvl + 1), lvl < P.MAX_LEVEL ? '+1' : '']); rows.push(['Nicht möglich', 'Helden', '']); return rows; }
    if (c.dot) { scaled('Schaden je Sekunde', c.dot / c.tick); if (c.buildF) scaled('Gebäudeschaden je Sek.', c.dot / c.tick * c.buildF); if (!c.pull) scaled('Turmschaden je Sek.', c.dot / c.tick * (c.towerF || TOWER_SPELL_FACTOR)); rows.push(['Dauer', `${c.dur} s`, '']); }
    if (c.ground) rows.push(['Trifft', 'nur am Boden', '']);
    if (c.slow) rows.push(['Bremst', `${c.dot ? 'solange es bebt' : `${dec(c.slow)} s`} · −30 %`, '']);
    if (c.amp) rows.push(['Gegner nehmen', `+${Math.round((c.amp - 1) * 100)} % Schaden`, '']);
    if (c.curse) rows.push(['Gefallene werden', SPAWN_NAME[c.curse][1], '']);
    if (c.clone) { rows.push(['Verdoppelt', 'eigene Truppen im Kreis', '']); rows.push(['Abbild', '1 Leben, voller Schaden', '']); }
    if (c.pulses) { scaled('Stoß bei 1 Gegner', c.pulses.dmg[0]); scaled('bei 2 bis 4', c.pulses.dmg[1]); scaled('ab 5', c.pulses.dmg[2]); rows.push(['Stöße', `${c.pulses.n} · jede Sekunde`, '']); }
    if (c.summonOver) { rows.push(['Bringt', `${c.summonOver.count} ${SPAWN_NAME[c.summonOver.unit][1]}`, '']); rows.push(['Takt', `alle ${dec(c.summonOver.every)} s einer`, '']); scaled(`${SPAWN_NAME[c.summonOver.unit][0]}: Schaden`, UNITS[c.summonOver.unit].dmg); scaled(`${SPAWN_NAME[c.summonOver.unit][0]}: Leben`, UNITS[c.summonOver.unit].hp); }
    if (c.rollSpawn) { rows.push(['Bringt', `${c.rollSpawn.count} ${SPAWN_NAME[c.rollSpawn.unit][0]}`, '']); scaled(`${SPAWN_NAME[c.rollSpawn.unit][0]}: Leben`, UNITS[c.rollSpawn.unit].hp); }
    if (c.ownSide) rows.push(['Wirken', 'nur auf eigener Seite', '']);
    if (c.root) rows.push(['Hält fest', `${dec(c.root)} s`, '']);
    if (c.freeze) rows.push(['Friert ein', `${dec(c.freeze)} s · auch Türme`, '']);
    if (c.stun) rows.push(['Betäubt', `${dec(c.stun)} s`, '']);
    if (c.haste) rows.push(['Treibt an', `${c.haste} s · +30 %`, '']);
    if (c.summon) { const sn = SPAWN_NAME[c.summon.unit]; rows.push(['Bringt', `${c.summon.count} ${sn[c.summon.count > 1 ? 1 : 0]}`, '']); scaled(`${sn[0]}: Schaden`, UNITS[c.summon.unit].dmg); scaled(`${sn[0]}: Leben`, UNITS[c.summon.unit].hp); }
    if (c.roll) { rows.push(['Rollt', `${c.roll.len} Felder weit`, '']); rows.push(['Breite', `${dec(c.roll.w)} Felder`, '']); }
    if (c.knock) rows.push(['Rückstoß', `${dec(c.knock)} Felder`, '']);
    if (c.pull) rows.push(['Zieht', 'Truppen zur Mitte', '']);
    if (!c.roll && c.radius) rows.push(['Radius', `${dec(c.radius)} Felder`, '']);
    return rows;
  }
  const u = UNITS[c.unit], s = u.spawn ? UNITS[u.spawn.unit] : null;
  scaled('Leben', u.hp);
  if (u.shield) scaled('Schild', u.shield);
  if (u.ramp) { rows.push([u.rampMelee ? 'Schaden je Sek.' : 'Brennstrahl je Sek.', `${fmt(u.dmg / u.atk * m)} – ${fmt(u.dmg * u.ramp.at(-1)[1] / u.atk * m)}`, '']); rows.push(['Volle Hitze nach', `${u.ramp.at(-1)[0]} s am selben Ziel`, '']); }
  else if (u.scatter) { scaled('Schaden je Splitter', u.dmg); rows.push(['Splitter', `${u.scatter.n} im Fächer`, '']); rows.push(['Schlagtempo', `${dec(u.atk)} s`, '']); }
  else if (u.dmg) { scaled(u.splash || u.line || u.burst ? 'Flächenschaden' : 'Schaden', u.dmg); rows.push(['Schlagtempo', `${dec(u.atk)} s`, '']); }
  if (c.mix) for (const [bu, bk] of c.mix.slice(1)) { const b = UNITS[bu], sn = SPAWN_NAME[bu][0]; scaled(`${sn}: Leben`, b.hp); scaled(`${sn}: Schaden`, b.dmg); rows.push([`${sn}: Reichweite`, `${dec(b.range)} Felder`, '']); }
  if (u.chain) rows.push(['Springt über', `auf ${u.chain.n - 1} weitere Ziele`, '']);
  if (u.line && u.line.back) rows.push(['Kehrt zurück', 'trifft zweimal', '']);
  if (u.burst) rows.push(['Streut', `${dec(u.burst.len)} Felder hinter das Ziel`, '']);
  if (u.recoil) rows.push(['Rückstoß', `wirft ihn ${dec(u.recoil)} Felder zurück`, '']);
  if (u.combo) scaled(`Jeder ${u.combo.every}. Schlag`, u.dmg * u.combo.f);
  if (u.frenzy && u.frenzy.reset) rows.push(['Wird schneller', `bis ${dec(u.atk * Math.pow(u.frenzy.f, u.frenzy.max))} s`, '']);
  if (u.stunArea) rows.push(['Vereist', `${dec(u.stunArea)} s · alles ringsum`, '']);
  if (u.healBurst) scaled('Heilt ringsum', u.healBurst.amt);
  if (u.second) { scaled(u.second.count > 1 ? 'Besatzung: Schaden' : 'Zweitangriff', u.second.dmg); rows.push(['· Takt und Weite', `${dec(u.second.atk)} s · ${u.second.minRange ? `${dec(u.second.minRange)}–` : ''}${dec(u.second.range)} Felder`, '']); if (u.second.root) rows.push(['· hält fest', `${dec(u.second.root)} s`, '']); }
  if (u.reflect) { scaled('Rückschlag', u.reflect.dmg); rows.push(['· trifft Angreifer', `bis ${dec(u.reflect.r)} Felder · ${dec(u.reflect.stun)} s betäubt`, '']); }
  if (u.enchant) { scaled('Zeichen: Zusatzschaden', u.enchant.bonus); rows.push(['· zeichnet', `${u.enchant.count} Verbündete, jeder ${u.enchant.every}. Treffer`, '']); }
  if (u.hook) rows.push(['Haken', `${dec(u.hook.min)}–${u.hook.max} Felder`, '']);
  if (u.curse) rows.push(['Fluch', `${dec(u.curse.dur)} s · wird ${SPAWN_NAME[u.curse.unit][0]}`, '']);
  if (u.morph) rows.push(['Bei halbem Leben', UNITS[u.morph.unit].building ? `wird Gebäude (${UNITS[u.morph.unit].life} s)` : 'zündet sich und rennt los', '']);
  if (u.morph && !UNITS[u.morph.unit].building) scaled('Sprengschaden', UNITS[u.morph.unit].dmg);
  if (u.bounty) rows.push(['Schenkt dem Gegner', 'bis zu 4 Kraft', '']);
  if (u.burrow) rows.push(['Besonderheit', 'vergraben unangreifbar', '']);
  if (u.dashGuard) rows.push(['Im Sprung', 'unverwundbar', '']);
  if (c.spread) rows.push(['Aufstellung', `Reihe über ${c.spread} Felder`, '']);
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
  if (u.slow) rows.push(['Bremst', `${dec(u.slow)} s · −30 %`, '']);
  if (u.charge) rows.push(['Ansturm', 'doppeltes Tempo, doppelter Stoß', '']);
  if (u.leap) rows.push(['Sprung', `${dec(u.leap.min)}–${u.leap.max} Felder · doppelter Schaden`, '']);
  if (u.deployDmg) scaled('Schaden bei Landung', u.deployDmg.dmg);
  if (u.healHit) scaled('Heilt je Schlag', u.healHit.amt);
  if (u.load) rows.push(['Erste Ladung', `${u.load} s`, '']);
  if (u.deathDmg) { scaled('Schaden beim Tod', u.deathDmg.dmg); if (u.deathDmg.delay) rows.push(['Lunte', `${u.deathDmg.delay} s`, '']); if (u.deathDmg.slow) rows.push(['Bremst beim Tod', `${dec(u.deathDmg.slow)} s`, '']); }
  if (u.deathSpawn) rows.push([UNITS[u.deathSpawn.unit].targets === 'buildings' ? 'Zerbricht in' : UNITS[u.deathSpawn.unit].hatch ? 'Hinterlässt' : 'Beim Tod', `${u.deathSpawn.count} ${SPAWN_NAME[u.deathSpawn.unit][u.deathSpawn.count > 1 ? 1 : 0]}`, '']);
  if (u.deathZone) rows.push(['Beim Tod', CARDS[u.deathZone].name, '']);
  if (u.life) rows.push(['Lebensdauer', `${u.life} s`, '']);
  if (u.speed) rows.push(['Tempo', SPEED_NAME(u.speed), '']);
  if (u.dmg) rows.push(['Reichweite', u.range >= 2 ? `${u.minRange ? `${dec(u.minRange)}–` : ''}${dec(u.range)} Felder` : 'Nahkampf', '']);
  if (u.dmg) rows.push(['Ziele', u.targets === 'buildings' ? 'Gebäude' : u.hitsAir ? 'Luft & Boden' : 'Boden', '']);
  if (c.mix) rows.push(['Anzahl', c.mix.map(([, k]) => k).join(' + '), '']);
  else if (c.count > 1) rows.push(['Anzahl', `× ${c.count}`, '']);
  if (u.air) rows.push(['Bewegung', 'Fliegt', '']);
  if (u.ford) rows.push(['Bewegung', 'springt über den Fluss', '']);
  if (c.anywhere) rows.push(['Aufstellen', 'überall auf dem Feld', '']);
  return rows;
}

function showCard(id) {
  const c = CARDS[id], own = profile.cards[id];
  const d = el('div');
  const top = el('div', 'detail');
  top.append(cardEl(id, { tag: 'div', lvl: own ? own.lvl : 0 }));
  const lvl = own ? own.lvl : 1;
  const rar = P.rarity(id);
  top.append(el('div', '', `<h4>${c.name}</h4><div class="rword ${rar}">${P.RARITY_NAME[rar]}</div><div class="role">${c.type === 'tower' ? c.role : c.mirror ? `${c.role} · kostet 1 Kraft mehr als die wiederholte Karte` : `${c.role} · ${c.cost} Kraft`}</div><p>${c.desc}</p>`));
  d.append(top);
  // Drei Ansichten: Werte, genaue Erklärung, Geschichte
  const seg = el('div', 'seg small infoSeg'), panes = { werte: el('div', 'pane'), wirkung: el('div', 'pane how'), story: el('div', 'pane story') };
  for (const [k, label] of [['werte', 'Werte'], ['wirkung', 'Erklärung'], ['story', 'Geschichte']]) { const b = el('button', k === cardView ? 'on' : '', label); b.dataset.view = k; seg.append(b); panes[k].hidden = k !== cardView; }
  seg.addEventListener('click', e => { const v = e.target.dataset.view; if (!v) return; sfx('click'); cardView = v; for (const b of seg.children) b.classList.toggle('on', b.dataset.view === v); for (const [k, pn] of Object.entries(panes)) pn.hidden = k !== v; });
  d.append(seg);
  // Werte: bei einer eigenen Karte unter der Höchststufe steht in jeder Zeile, die wächst, „alt → neu“ mit dem Zuwachs
  const rows = statRows(id, lvl), nextRows = own && lvl < P.MAX_LEVEL ? statRows(id, lvl + 1) : null;
  if (nextRows) panes.werte.append(el('div', 'lvlLine', `<span>Stufe ${lvl}</span><i>→</i><b>Stufe ${lvl + 1}</b><small>Vorschau der Aufwertung</small>`));
  panes.werte.append(el('div', 'statlist', rows.map(([k, v, plus], i) => {
    const nv = nextRows && nextRows[i] && nextRows[i][0] === k ? nextRows[i][1] : v;
    return nv !== v ? `<div class="chg"><span>${k}</span><b><s>${v}</s><i>→</i><u>${nv}</u>${plus ? `<em>${plus}</em>` : ''}</b></div>` : `<div>${k}<b>${v}</b></div>`;
  }).join('')));
  if (c.hero) panes.werte.append(el('div', 'extra heroBox', `<b>Fähigkeit: ${c.ability.name}</b><small>${c.ability.cost} Kraft · ${c.ability.once ? 'einmal je Einsatz' : `alle ${c.ability.cd} s`}</small><p>${c.ability.desc}</p>`));
  if (RUNES[id]) {
    const R = RUNES[id], ri = own ? P.runeInfo(profile, id) : { have: 0, need: P.RUNE_SHARDS, done: false };
    const rb = el('div', `extra runeBox${ri.done ? ' on' : ''}`, `<b><span class="runeMark${ri.done ? '' : ' off'}"></span>Runenform</b><small>${ri.done ? 'erweckt' : 'noch nicht erweckt'} · jede ${R.cycles + 1}. Karte erscheint in dieser Form</small><p>${R.desc}</p>`);
    if (!ri.done) {
      rb.append(el('div', 'shards', `<div class="shardRow">${Array.from({ length: ri.need }, (_, k) => `<i class="${k < ri.have ? 'on' : ''}"></i>`).join('')}</div><span>${ri.have} / ${ri.need} Runenscherben</span>`));
      if (own) {
        const wb = el('button', 'btn wildBtn', `<span class="ico wild"></span>Wanderscherbe einsetzen <em>${profile.wild}</em>`);
        wb.disabled = profile.wild < 1;
        wb.addEventListener('click', () => {
          if (!P.useWild(profile, id)) { sfx('error'); return; }
          save(); sfx('rune'); render();
          if (P.hasRune(profile, id)) playRune(id, () => showCard(id)); else showCard(id);
        });
        rb.append(wb, el('small', 'src', `Scherben: Riesen- und Runentruhe (sicher), andere Truhen mit Glück, Modus des Tages, Stufe ${RUNE_LEVEL} der Karte. Wanderscherben: alle drei Tagesaufgaben, Trophäenweg, Bosse, Laden.`));
      }
    }
    panes.werte.append(rb);
  }
  panes.wirkung.append(el('ul', '', explain(id, lvl).map(t => `<li>${esc(t)}</li>`).join('')), el('small', '', `Zahlen für Stufe ${lvl}.`));
  panes.story.append(el('p', '', esc(STORY[id] || '')));
  d.append(panes.werte, panes.wirkung, panes.story);
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
      if (j.each > 1 && j.missing) d.append(el('p', 'center small', `${P.RARITY_NAME[rar]}e Karte: ${j.each} Joker ersetzen eine Kopie.`));
      jb.disabled = !j.use;
      jb.addEventListener('click', () => { if (P.useJokers(profile, id)) { save(); sfx('buy'); render(); showCard(id); } });
      const wb = el('button', `btn${profile.wish === id ? ' wished' : ''}`, `<span class="ico star"></span>${profile.wish === id ? 'Wunschkarte ✓' : 'Als Wunschkarte'}`);
      wb.addEventListener('click', () => { P.setWish(profile, id); save(); sfx('click'); render(); showCard(id); });
      tools.append(jb, wb);
      d.append(tools);
    }
    if (c.type === 'tower') { // Turmart für beide Außentürme wählen
      const on = profile.towerSel === id, b = el('button', 'btn', on ? 'Aufgestellt ✓' : 'Aufstellen');
      b.disabled = on;
      b.addEventListener('click', () => { P.setTower(profile, id); save(); sfx('deploy'); render(); showCard(id); });
      btns.append(b);
      d.insertBefore(el('p', 'center small', `Gilt für beide Außentürme. Der Hauptturm steigt mit deiner Spielerstufe (jetzt Stufe ${P.playerLevel(profile.xp).lvl}).`), d.querySelector('.upline, .notice') || null);
    } else if (!profile.deck.includes(id)) {
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
  if (r.shards) notes.push(P.hasRune(profile, id) ? ['rune', 'Runenform erweckt!'] : ['shard', `+${r.shards} Runenscherben · ${P.runeInfo(profile, id).have} / ${P.RUNE_SHARDS}`]);
  if (r.levelUp) notes.push(['lvl', `Spielerstufe ${P.playerLevel(profile.xp).lvl} – stärkere Türme, +5 Runensplitter`]);
  playUpgrade(id, from, r.lvl, changes, notes, () => { render(); if (reopen) showCard(id); });
}
// Runenform erweckt: dieselbe Bühne in Violett
function playRune(id, done) { playUpgrade(id, profile.cards[id].lvl, profile.cards[id].lvl, [], [['rune', `Jede ${RUNES[id].cycles + 1}. Karte erscheint jetzt in Runenform`], ['text', RUNES[id].desc]], done, '<b class="runeTitle">Runenform erweckt!</b>'); }
function playUpgrade(id, from, to, changes, notes, done, title) {
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
  changes.forEach(([k, a, b], i) => { const na = parseNum(a), nb = parseNum(b), plus = Number.isFinite(na) && Number.isFinite(nb) ? `<em>+${fmt(nb - na)}</em>` : ''; const row = el('div', 'uprow', `<span>${k}</span><span class="vals"><s>${a}</s><i>→</i><b data-a="${esc(a)}" data-b="${esc(b)}">${a}</b>${plus}</span>`); row.style.animationDelay = `${0.9 + i * 0.16}s`; list.append(row); });
  notes.forEach(([kind, text], i) => { const n = el('div', `upnote ${kind}`, text); n.style.animationDelay = `${1.05 + (changes.length + i) * 0.16}s`; list.append(n); });
  box.append(stage, el('div', 'uptitle', `<small>${CARDS[id].name}</small>${title || `<b>Stufe <span class="old">${from}</span><span class="arrow">→</span><span class="new">${to}</span></b>`}`), list, el('div', 'uphint', 'Tippen zum Fortfahren'));
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
  for (const kind of P.SHOP_CHESTS) {
    const c = P.CHESTS[kind], info = P.chestInfo(kind, profile.arena);
    const b = el('button', 'offer chestOffer', `<span class="chestIco ${kind}"></span><b>${c.name}</b><small>${info.cards} Karten<br>rund ${fmt(info.gold)} Gold</small><em class="${profile.gems < c.gems ? 'poor' : ''}"><span class="ico gem"></span>${c.gems}</em>`);
    b.addEventListener('click', () => {
      if (profile.gems < c.gems) { sfx('error'); flash(b); return; }
      const loot = P.buyChest(profile, kind);
      if (loot) { save(); lootSheet(c.name, loot, '', kind); }
    });
    chests.append(b);
  }
  body.append(chests);

  head('Runenformen', `${profile.wild} Wanderscherben`);
  const wild = el('button', `offer wide${profile.shop.wild ? ' sold' : ''}`, `<span class="ico wild big"></span><span><b>Wanderscherbe</b><small>${profile.shop.wild ? 'Heute schon gekauft' : 'Passt auf jede Karte mit Runenform · eine am Tag'}</small></span><em class="${profile.gems < P.WILD_PRICE && !profile.shop.wild ? 'poor' : ''}">${profile.shop.wild ? '✓' : `<span class="ico gem"></span>${P.WILD_PRICE}`}</em>`);
  wild.id = 'wildOffer';
  wild.addEventListener('click', () => { if (profile.shop.wild) return; if (P.buyWild(profile)) { save(); sfx('buy'); render(); } else { sfx('error'); flash(wild); } });
  body.append(wild);
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
      row.append(el('span', 'at', `${fmt(r.at)} <span class="ico trophy"></span>`), el('span', 'what', r.kind === 'gold' ? `<span class="ico coin"></span>${r.n} Gold` : r.kind === 'gems' ? `<span class="ico gem"></span>${r.n} Runensplitter${r.wild ? ' <span class="ico wild"></span>Wanderscherbe' : ''}` : `<span class="chestIco ${r.chest} mini"></span>${P.CHESTS[r.chest].name}`));
      const b = el('button', 'btn primary', got ? '✓' : can ? 'Abholen' : '');
      b.disabled = !can || got;
      b.addEventListener('click', () => {
        const loot = P.claimRoad(profile, r.at);
        if (!loot) return;
        save();
        if (loot.cards.length) lootSheet(`${P.CHESTS[r.chest].name} vom Trophäenweg`, loot, '', r.chest); else { sfx('coin'); render(); }
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
<p>${CARD_IDS.length} Karten · ${TOWER_IDS.length} Turmarten · ${P.ARENAS.length} Arenen · ${P.BOSSES.length} Bosse · ${Object.keys(RUNES).length} Runenformen</p>
<p class="small">3D-Darstellung mit three.js (MIT-Lizenz, © three.js-Autoren). <span id="ver"></span></p>`);
  simpleSheet('Über Runenfurt', body);
  fetch('./sw.js').then(r => r.text()).then(t => { const m = t.match(/VERSION = '([^']+)'/); const v = $('#ver'); if (m && v) v.textContent = `Version ${m[1].replace('runenfurt-', '')}.`; }).catch(() => {});
}

// ---- Spielmodi und Bosskämpfe ------------------------------------------------------------------
function showModes() {
  const d = el('div', 'modes');
  d.append(el('h3', '', 'Spielmodi'), el('p', 'center small', 'Herausforderungen ohne Trophäen. Jeder Sieg bringt eine Truhe.'));
  const today = P.modeOfDay(profile.day), list = el('div', 'list');
  const row = (key, name, text, badge) => { const b = el('button', 'btn item modeRow', `<span><b>${name}${badge ? `<em>${badge}</em>` : ''}</b><small>${text}</small></span><i></i>`); b.dataset.mode = key; list.append(b); };
  const ids = [today, ...P.MODE_IDS.filter(id => id !== today)];
  for (const id of ids) row(id, P.MODES[id].name, P.MODES[id].text, id === today ? (P.modeBonusOpen(profile) ? `Heute +${P.MODE_BONUS} <span class="ico gem"></span>` : 'Modus des Tages') : '');
  row('uebung', 'Übungskampf', 'Ein normaler Kampf, der nicht zählt – zum Ausprobieren neuer Decks.', '');
  d.append(list);
  d.append(el('div', 'sub', `<b>Bosskämpfe</b><span>${profile.bosses.length} von ${P.BOSSES.length} besiegt</span>`));
  const bosses = el('div', 'list');
  P.BOSSES.forEach((b, i) => {
    if (i > profile.arena + 1) return;
    const open = P.bossOpen(profile, i), won = profile.bosses.includes(i);
    const r = el('button', `btn item bossRow${won ? ' won' : ''}${open ? '' : ' shut'}`, `<span><b>${b.name}${won ? '<em class="ok">besiegt</em>' : open ? `<em>+${P.BOSS_REWARD.gems} <span class="ico gem"></span></em>` : ''}</b><small>${open ? `Arena ${i + 1} · ${P.ARENAS[i].name} – ${b.text}` : `Wartet in Arena ${i + 1} (${P.ARENAS[i].name}, ${P.ARENAS[i].at} Trophäen).`}</small></span><i></i>`);
    r.dataset.boss = i; r.disabled = !open;
    bosses.append(r);
  });
  d.append(bosses);
  const btns = el('div', 'btns one'); btns.append(closeBtn()); d.append(btns);
  d.addEventListener('click', e => {
    const m = e.target.closest('.modeRow'), b = e.target.closest('.bossRow');
    if (!m && !b) return;
    sfx('click');
    const go = () => { if (b) startBattle({ boss: Number(b.dataset.boss) }); else if (m.dataset.mode === 'uebung') startBattle({ training: true }); else if (m.dataset.mode === 'wahl') startDraft(); else startBattle({ mode: m.dataset.mode }); };
    if (!profile.seenHelp) showHelp(go); else go();
  });
  sheetDismiss = () => { closeSheet(); sheetDismiss = null; };
  openSheet(d, false);
}

// Kartenwahl: vier Runden, je zwei Karten – eine für mich, die andere für den Gegner
function startDraft() {
  let s = ((Number(params.get('seed')) || Date.now()) >>> 0) || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pairs = P.draftPairs(rnd), picks = [];
  for (const pr of pairs) for (const id of pr) art(id);
  const step = () => {
    const i = picks.length, d = el('div', 'draft');
    if (i === 4) {
      const [mine, foe] = P.draftDecks(pairs, picks, rnd);
      d.append(el('h3', '', 'Dein Deck'), el('p', 'center small', 'Vier gewählt, vier vom Gegner bekommen. Beide Seiten spielen auf gleicher Stufe.'));
      const grid = el('div', 'grid'); for (const id of mine) grid.append(cardEl(id, { tag: 'div' })); d.append(grid);
      const row = el('div', 'btns'), go = el('button', 'btn primary', 'Los geht’s');
      go.addEventListener('click', () => { sfx('click'); startBattle({ mode: 'wahl', decks: [mine, foe] }); });
      row.append(closeBtn('Abbrechen'), go); d.append(row);
    } else {
      d.append(el('h3', '', 'Kartenwahl'), el('p', 'center', `Runde ${i + 1} von 4 – welche Karte nimmst du? Die andere bekommt dein Gegner.`));
      const row = el('div', 'draftRow');
      pairs[i].forEach((id, k) => {
        const b = el('button', 'draftPick');
        b.append(cardEl(id, { tag: 'div' }), el('small', '', `${CARDS[id].role}`));
        b.addEventListener('click', () => { sfx('click'); picks.push(k); step(); });
        row.append(b);
      });
      d.append(row);
      if (i) { const got = el('div', 'thumbs'); picks.forEach((k, j) => got.append(cardEl(pairs[j][k], { tag: 'div' }))); d.append(el('p', 'center small', 'Bisher gewählt:'), got); }
      const row2 = el('div', 'btns one'); row2.append(closeBtn('Abbrechen')); d.append(row2);
    }
    sheetDismiss = null; openSheet(d, true);
  };
  step();
}

// ---- Kampf -------------------------------------------------------------------------------------
const B = { arena: null, g: null, ai: null, auto: null, acc: 0, last: 0, sel: null, ghost: null, paused: false, running: false, endAt: 0, drag: null, flags: {}, hand: [], next: null };

function layout() {
  const cs = getComputedStyle($('#probe'));
  const sat = parseFloat(cs.paddingTop) || 0, sab = parseFloat(cs.paddingBottom) || 0;
  const vw = window.innerWidth, vh = window.innerHeight;
  const root = getComputedStyle(document.documentElement);
  const hud = parseFloat(root.getPropertyValue('--hud')) || 44, panel = parseFloat(root.getPropertyValue('--panel')) || 148;
  renderer.resize(vw, vh - sat - sab - hud - panel, Math.min(3, window.devicePixelRatio || 1), B.arena ?? profile.arena);
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 300));

// opts: { training } Übungskampf · { mode } Spielmodus (bei 'wahl' mit decks) · { boss } Bosskampf der Arena
function startBattle(opts) {
  opts = opts === true ? { training: true } : opts || {};
  closeSheet(); sheetDismiss = null;
  unlock();
  const seed = (Number(params.get('seed')) || Date.now()) >>> 0;
  let s = seed || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mode = opts.mode || null, boss = opts.boss ?? null;
  let decks = [profile.deck, P.opponentDeck(profile, rnd)], levels = [P.playerLevels(profile), P.opponentLevels(profile, profile.level)], rules = {}, aiLevel = profile.level;
  B.foe = P.opponentName(rnd); B.label = '';
  const foeTower = P.opponentTower(profile, rnd);
  levels[1].towerType = foeTower;
  if (boss != null) {
    const set = P.bossSetup(profile, boss);
    decks[1] = set.deck; levels[1] = set.levels; rules = set.rules; aiLevel = 'schwer'; B.foe = P.BOSSES[boss].name; B.label = 'Bosskampf';
  } else if (mode) {
    rules = P.modeRules(profile, mode); B.label = mode === 'dreifach' ? '3× Kraft' : P.MODES[mode].name;
    const even = () => [P.evenLevels(profile, profile.towerSel), P.evenLevels(profile, mode === 'spiegel' ? profile.towerSel : foeTower)];
    if (mode === 'spiegel') { decks[1] = [...profile.deck]; levels = even(); }
    if (mode === 'wahl') { decks = opts.decks; levels = even(); }
    if (mode === 'ansturm') B.foe = 'Ansturm';
  }
  for (const id of decks[0]) art(id); // Kartenbilder vor dem Kampf erzeugen
  const opp = levels[1];
  B.g = sim.createGame({ seed, decks, levels, rules });
  B.ai = mode === 'ansturm' ? null : createAi(aiLevel);
  B.auto = AUTO ? createAi(AUTO) : null;
  B.opts = opts;
  B.arena = boss != null ? boss : profile.arena; // ein Boss empfängt in seiner eigenen Arena
  B.level = profile.level; B.oppLvl = opp.lvl; B.training = !!opts.training;
  B.count = { played: {}, spells: 0, abilities: 0 };
  B.slowT = 0;
  B.acc = 0; B.last = performance.now(); B.sel = null; B.ghost = null; B.paused = false; B.endAt = 0; B.flags = {}; B.hand = []; B.next = null; B.booked = false;
  $('#foeName').textContent = B.foe;
  renderer.reset();
  show('battle');
  layout();
  if (renderer.prepare) renderer.prepare(B.g);
  updateHud(true);
  banner(boss != null ? `Boss: ${B.foe}` : opts.training ? 'Übungskampf' : B.label || 'Kampf!');
  toast(boss != null ? P.BOSSES[boss].text : mode === 'ansturm' ? 'Halte drei Minuten durch!' : `${B.foe} · Kartenstufe ${opp.lvl}`, boss != null ? 4500 : 2600);
  sfx('horn');
  wakeLock(true);
  if (!B.running) { B.running = true; requestAnimationFrame(frame); }
}

// Eine Krone fliegt vom gefallenen Turm zur Anzeige oben
function flyCrown(ev) {
  if (!renderer.toScreen || SPEED > 1) return;
  const target = $(ev.side === 1 ? '#crownMe' : '#crownFoe'), from = renderer.toScreen(ev.x, ev.y, 2.4), to = target.getBoundingClientRect();
  const c = el('span', 'ico crown fly');
  c.style.left = `${from.x - 16}px`; c.style.top = `${from.y - 16}px`;
  document.body.append(c);
  const a = c.animate([
    { transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(2.8)', opacity: 1, offset: 0.22 }, { transform: 'scale(2.4)', opacity: 1, offset: 0.5 },
    { transform: `translate(${to.left + to.width / 2 - from.x}px, ${to.top + to.height / 2 - from.y}px) scale(1)`, opacity: 1 },
  ], { duration: 1150, easing: 'cubic-bezier(.45,0,.2,1)' });
  a.onfinish = () => { c.remove(); target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); sfx('coin'); };
}
function confetti() {
  const box = el('div', 'confetti'), cols = ['#2ec4b6', '#f6c453', '#ffffff', '#c98bff', '#58c7f3'];
  for (let i = 0; i < 46; i++) { const p = el('i'); p.style.left = `${Math.random() * 100}%`; p.style.background = cols[i % cols.length]; p.style.animationDuration = `${1.7 + Math.random() * 1.6}s`; p.style.animationDelay = `${Math.random() * 0.9}s`; p.style.setProperty('--r', `${Math.random() * 720 - 360}deg`); p.style.setProperty('--dx', `${Math.random() * 120 - 60}px`); box.append(p); }
  overlay.prepend(box);
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
    else if (ev.t === 'shoot') sfx(UNITS[ev.from] && UNITS[ev.from].tower ? 'tower' : 'shoot');
    else if (ev.t === 'bless') sfx('bless');
    else if (ev.t === 'chain') sfx('funkenschlag');
    else if (ev.t === 'scatter') sfx('scatter');
    else if (ev.t === 'hook') sfx('hook');
    else if (ev.t === 'pulse') sfx('pulse');
    else if (ev.t === 'morph' || ev.t === 'hatch' || ev.t === 'curse' || ev.t === 'clone') sfx('morph');
    else if (ev.t === 'ench') sfx('heavy');
    else if (ev.t === 'die' && ev.kind === 'tower') { sfx('fall'); if (!ev.main && !g.over) banner(ev.side === 1 ? 'Turm zerstört!' : 'Turm verloren!'); if (SPEED === 1) B.slowT = 0.75; flyCrown(ev); }
    else if (ev.t === 'wake') sfx('wake');
    else if (ev.t === 'shield' || ev.t === 'fuse') sfx(ev.t);
    else if (ev.t === 'kraft') { if (ev.side === 0) sfx('kraft'); }
    else if (ev.t === 'overtime') { sfx('horn'); banner('Verlängerung – der nächste Turm gewinnt!'); }
    else if (ev.t === 'wave') { sfx('wake'); banner(`Welle ${ev.n}`); }
  }
  g.events.length = 0;
  if (!B.flags.double && !g.kraftFixed && g.phase === 'main' && g.time >= g.duration - 60) { B.flags.double = true; banner('Doppelte Kraft!'); sfx('horn'); }
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
    B.acc += dt * SPEED * (B.slowT > 0 ? 0.3 : 1); // kurze Zeitlupe, wenn ein Turm fällt
    if (B.slowT > 0) B.slowT -= dt;
    let n = 0;
    while (B.acc >= sim.DT && n++ < 60 && !g.over) {
      if (B.ai) aiUpdate(g, 1, B.ai, sim.DT);
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
  const ph = g.phase === 'over' ? `Verlängerung${rate > 2 ? ' · 3×' : ' · 2×'}` : g.waves && g.waves.n ? `Welle ${g.waves.n}` : rate > 1 && !g.kraftFixed ? '2× Kraft' : B.label || '';
  if (force || B.flags.ph !== ph) { B.flags.ph = ph; $('#phase').textContent = ph; $('#clock').classList.toggle('hot', g.phase === 'over' || left <= 10); }
  const cr = `${g.sides[1].crowns}:${S.crowns}`;
  if (force || B.flags.cr !== cr) { B.flags.cr = cr; $('#crownFoe').textContent = g.sides[1].crowns; $('#crownMe').textContent = S.crowns; }
  $('#kraftFill').style.width = `${S.kraft * 10}%`;
  const k = Math.floor(S.kraft + 1e-6);
  if (force || B.flags.k !== k) { B.flags.k = k; $('#kraftNum').textContent = k; $('#kraft').classList.toggle('full', k >= sim.MAX_KRAFT); }
  const hand = $('#hand');
  for (let i = 0; i < 4; i++) {
    const id = S.hand[i], R = S.runes.has(id) ? RUNES[id] : null;
    const echo = CARDS[id].mirror, price = sim.cardCost(g, 0, id);
    const key = R ? `${id}|${Math.min(R.cycles, S.cycle[id] || 0)}` : echo ? `${id}|${S.last || ''}` : id;
    if (force || B.hand[i] !== key) {
      const fresh = !B.hand[i] || B.hand[i].split('|')[0] !== id;
      B.hand[i] = key;
      const e = cardEl(id, { lvl: S.levels[id] || 1, rune: null, pips: R ? { n: Math.min(R.cycles, S.cycle[id] || 0), of: R.cycles } : null, cost: echo ? (Number.isFinite(price) ? price : '?') : null, ability: CARDS[id].hero ? CARDS[id].ability : null });
      if (echo && S.last) e.querySelector('.name').textContent = `↺ ${CARDS[S.last].name}`;
      e.dataset.i = i;
      if (!force && fresh) e.classList.add('new');
      if (hand.children[i]) hand.replaceChild(e, hand.children[i]); else hand.append(e);
    }
    const e = hand.children[i];
    e.classList.toggle('poor', price > S.kraft);
    e.classList.toggle('sel', B.sel === i);
  }
  if (force || B.next !== S.next) { B.next = S.next; $('#nextCard').replaceChildren(cardEl(S.next, { tag: 'div', rune: null })); }
  // Heldenfähigkeiten
  const abl = g.over ? [] : sim.abilities(g, 0), akey = abl.map(a => a.cardId).join();
  const box = $('#abilities');
  if (force || B.flags.abl !== akey) {
    B.flags.abl = akey;
    box.classList.toggle('many', abl.length > 2);
    box.replaceChildren(...abl.map(a => { const b = el('button', 'ability', `<span class="an">${a.ability.name}</span><span class="ac">${a.ability.cost}</span><span class="cdn"></span>`); b.dataset.id = a.cardId; b.setAttribute('aria-label', `${CARDS[a.cardId].name}: ${a.ability.name}, ${a.ability.cost} Kraft`); return b; }));
  }
  abl.forEach((a, i) => {
    const b = box.children[i];
    b.classList.toggle('ready', a.ready);
    b.classList.toggle('cool', a.cd > 0);
    const txt = a.cd > 0 ? `${Math.ceil(a.cd)} s` : '';
    if (b.lastChild.textContent !== txt) b.lastChild.textContent = txt;
  });
}

// Bedienung: Karte antippen und aufs Feld tippen – oder Karte aufs Feld ziehen.
const fieldPos = e => renderer.toField(e.clientX, e.clientY);
function tryPlay(pos) {
  const g = B.g;
  if (B.sel == null || !pos || g.over || B.paused) return;
  const id = g.sides[0].hand[B.sel], c = CARDS[id];
  if (c.mirror && !g.sides[0].last) { toast('Noch keine Karte zum Wiederholen'); sfx('error'); return; }
  if (g.sides[0].kraft < sim.cardCost(g, 0, id)) { toast('Zu wenig Kraft'); sfx('error'); return; }
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
  toast(!st ? 'Held ist gefallen' : st.used ? 'Fähigkeit ist verbraucht' : st.cd > 0 ? 'Fähigkeit lädt noch' : B.g.sides[0].kraft < st.ability.cost ? 'Zu wenig Kraft' : st.ent.deployT > 0 ? 'Held ist noch nicht bereit' : 'Kein Gegner in Reichweite');
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
document.addEventListener('visibilitychange', () => { stageSync(); if (document.hidden) pause(); else if (screen === 'battle' && !B.g.over) wakeLock(true); else if (screen === 'menu' && overlay.hidden) show(tab); });

function finishBattle() {
  B.booked = true;
  wakeLock(false);
  const g = B.g, w = g.winner;
  const timeout = !B.gaveUp && w !== 'draw' && g.sides[0].crowns === g.sides[1].crowns;
  const questsBefore = P.questsOpen(profile);
  const special = B.opts.mode || B.opts.boss != null;
  const res = P.applyResult(profile, { winner: w, level: B.level, crowns: g.sides[0].crowns, foeCrowns: g.sides[1].crowns, foe: B.foe, when: Date.now(), training: B.training, mode: B.opts.mode, boss: B.opts.boss, ...B.count });
  B.gaveUp = false;
  save();
  sfx(w === 0 ? 'win' : w === 1 ? 'lose' : 'draw');
  const d = el('div');
  d.append(el('h3', w === 0 ? 'win' : w === 1 ? 'lose' : '', w === 0 ? 'Sieg!' : w === 1 ? 'Niederlage' : 'Unentschieden'));
  const crowns = el('div', 'crowns3'); // die eigenen Kronen springen nacheinander auf
  for (let i = 0; i < 3; i++) { const c = el('i', i < g.sides[0].crowns ? 'on' : ''); c.style.animationDelay = `${0.4 + i * 0.3}s`; crowns.append(c); if (i < g.sides[0].crowns) setTimeout(() => { if (!overlay.hidden) sfx('coin'); }, 550 + i * 300); }
  d.append(crowns);
  if (w === 0) confetti();
  d.append(el('div', 'result', `<span class="me">${g.sides[0].crowns}</span><span class="ico crown"></span><span class="foe">${g.sides[1].crowns}</span>`));
  if (timeout) d.append(el('p', 'center', 'Entschieden über den am stärksten beschädigten Turm.'));
  if (B.training) d.append(el('p', 'center', 'Übungskampf – Trophäen und Truhen bleiben unberührt.'));
  else if (special) {
    d.append(el('p', 'center', `${B.opts.boss != null ? `Bosskampf gegen ${B.foe}` : `Herausforderung „${P.MODES[B.opts.mode].name}“`} – ohne Trophäen.`));
    if (res.bossFirst) d.append(el('div', 'notice', `Boss besiegt! +${P.BOSS_REWARD.gems} Runensplitter, ${P.BOSS_REWARD.wild} Wanderscherben und eine große Truhe`));
    if (res.bonus) d.append(el('div', 'notice', `Modus des Tages gewonnen: +${res.bonus} Runensplitter${res.shards && res.shards.shards[0] ? ` und eine Runenscherbe (${CARDS[res.shards.shards[0].id].name})` : res.shards && res.shards.wild ? ' und eine Wanderscherbe' : ''}`));
  } else {
    const delta = el('div', 'delta', `<span class="ico trophy"></span>${res.delta > 0 ? '+' : ''}${res.delta}<span style="color:var(--dim);font-weight:600;font-size:15px">&nbsp;→ <b class="tcount">${fmt(profile.trophies - res.delta)}</b></span>`);
    d.append(delta);
    const tc = delta.querySelector('.tcount'), from = profile.trophies - res.delta, t0 = performance.now() + 700; // Trophäen zählen hoch oder herunter
    const tick = now => { const q = Math.min(1, Math.max(0, (now - t0) / 800)); tc.textContent = fmt(from + res.delta * q); if (q < 1 && tc.isConnected) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  if (res.arenaUp) d.append(el('div', 'notice', `Neue Arena: ${res.arenaUp}! +${res.gems} Runensplitter`));
  if (res.newCards.length) {
    const box = el('div', 'chest'); box.append(el('b', 't', 'Neue Karten freigeschaltet'));
    const loot = el('div', 'loot');
    for (const id of res.newCards) { const it = el('div', 'item'); it.append(cardEl(id, { tag: 'div' })); loot.append(it); }
    box.append(loot); d.append(box);
  }
  if (res.chest) { // die Siegestruhe wartet verschlossen; der Inhalt ist schon gutgeschrieben
    const big = res.bossFirst, cname = big ? 'Bosstruhe' : 'Siegestruhe';
    const slot = el('div', 'chestSlot'), cb = el('button', 'chestBtn', `<span class="chestIco ${big ? 'runen' : 'sieg'}"></span><b>${cname} öffnen</b>`);
    cb.addEventListener('click', () => {
      sfx('click');
      openChest(big ? 'runen' : 'sieg', cname, res.chest, () => {
        slot.replaceChildren(lootBox(cname, res.chest));
        if (canUpgradeAny()) slot.append(el('p', 'center', 'Du kannst eine Karte aufwerten – schau unter „Karten“.'));
      });
    });
    slot.append(cb); d.append(slot);
  }
  if (res.slot) { // die gewonnene Truhe liegt jetzt auf einem Truhenplatz
    const v = P.chestSlots(profile, Date.now())[res.slot.i], C = P.CHESTS[res.slot.kind];
    d.append(el('div', 'wonChest', `<span class="chestIco ${res.slot.kind}"></span><span><b>${C.name} gewonnen</b><small>Truhenplatz ${res.slot.i + 1} · ${v && v.state === 'run' ? `öffnet sich in ${mins(v.left)}` : `wartet, braucht ${mins(P.chestTime(res.slot.kind))}`}</small></span>`));
  } else if (res.full) d.append(el('div', 'notice', `Alle Truhenplätze sind belegt – die ${P.CHESTS[res.full].name} wartet auf deinen nächsten Sieg.`));
  if (res.gold) d.append(el('p', 'center prize', `<span class="ico coin"></span>+${res.gold} Gold Siegprämie`));
  if (res.crownBox) d.append(el('div', 'notice', 'Die Kronentruhe ist voll – hol sie dir im Menü!'));
  if (P.questsOpen(profile) > questsBefore) d.append(el('div', 'notice', 'Tagesaufgabe erfüllt – Belohnung wartet im Menü.'));
  const row = el('div', 'btns');
  const menu = el('button', 'btn', 'Menü'), again = el('button', 'btn primary', 'Nochmal');
  menu.addEventListener('click', () => { sfx('click'); closeSheet(); B.running = false; show('home'); });
  again.addEventListener('click', () => { sfx('click'); if (B.opts.mode === 'wahl') { closeSheet(); B.running = false; show('home'); startDraft(); } else startBattle(B.opts); });
  row.append(menu, again); d.append(row);
  sheetDismiss = null;
  openSheet(d, true);
}

// ---- Start -------------------------------------------------------------------------------------
applySettings();
layout();
// Kartenbilder nach und nach vorab erzeugen, damit das Menü sofort da ist
const artQueue = [...profile.deck, ...Object.keys(CARDS)];
(function pump() { if (screen !== 'battle') for (let i = 0; i < 5 && artQueue.length; i++) art(artQueue.shift()); if (artQueue.length) setTimeout(pump, 25); })();
document.addEventListener('pointerdown', unlock, { once: true });
show('home');
window.__runenfurt = { B, sim, renderer, stage, P, save, get profile() { return profile; }, start: startBattle, show };

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
