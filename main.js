// Runenfurt – Oberfläche, Bedienung und Spielschleife.
import { CARDS, UNITS, RUNES, RUNE_LEVEL, avgCost, TOWER_SPELL_FACTOR } from './cards.js';
import * as sim from './sim.js';
import { createAi, aiUpdate, LEVELS } from './ai.js';
import * as P from './progress.js';
import { createRenderer, drawCardArt, drawIcon } from './render.js';
import { createRenderer3D } from './render3d.js';
import { sfx, unlock, setSound } from './audio.js';

const $ = s => document.querySelector(s);
const KEY = 'runenfurt-v1';
const params = new URLSearchParams(location.search);

let profile;
try { profile = P.loadProfile(localStorage.getItem(KEY)); } catch { profile = P.newProfile(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* privater Modus: dann eben ohne Speichern */ } };
setSound(profile.sound);

// Testhilfe: ?safe=47,34 simuliert die Ränder eines iPhones, ?speed=8 beschleunigt, ?auto=schwer lässt den Computer für mich spielen
if (params.get('safe')) { const [t, b] = params.get('safe').split(',').map(Number); document.documentElement.style.setProperty('--sat', `${t || 0}px`); document.documentElement.style.setProperty('--sab', `${b || 0}px`); }
const SPEED = Math.min(40, Math.max(1, Number(params.get('speed')) || 1));
const AUTO = LEVELS[params.get('auto')] ? params.get('auto') : null;

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

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
  if (opt.pips) { // Zyklen bis zur Runenform
    const row = el('span', 'pips');
    for (let i = 0; i < opt.pips.of; i++) row.append(el('i', i < opt.pips.n ? 'on' : ''));
    e.append(row);
    if (opt.pips.n >= opt.pips.of) e.classList.add('rune');
  }
  e.dataset.id = id;
  return e;
}

// ---- Bildschirme -------------------------------------------------------------------------------
const screens = { home: $('#home'), deck: $('#deck'), battle: $('#battle') };
let screen = 'home';
function show(name) {
  screen = name;
  for (const [k, s] of Object.entries(screens)) s.hidden = k !== name;
  if (name === 'home') renderHome();
  if (name === 'deck') renderDeck();
}
const overlay = $('#overlay'), sheet = $('#sheet');
function openSheet(node, center) { sheet.replaceChildren(node); overlay.classList.toggle('center', !!center); overlay.hidden = false; sheet.scrollTop = 0; }
function closeSheet() { overlay.hidden = true; sheet.replaceChildren(); }
let sheetDismiss = null; // Tippen neben das Blatt schließt es, wenn erlaubt
overlay.addEventListener('click', e => { if (e.target === overlay && sheetDismiss) sheetDismiss(); });

const canUpgradeAny = () => Object.keys(profile.cards).some(id => P.upgradeInfo(profile, id).can);

function renderHome() {
  const a = P.ARENAS[profile.arena], next = P.ARENAS[profile.arena + 1];
  const pl = P.playerLevel(profile.xp);
  $('#lvlNum').textContent = pl.lvl;
  $('#xpFill').style.width = pl.need ? `${100 * pl.xp / pl.need}%` : '100%';
  $('#goldNum').textContent = fmt(profile.gold);
  $('#arenaNo').textContent = `Arena ${profile.arena + 1}`;
  $('#arenaName').textContent = a.name;
  $('#trophyNum').textContent = fmt(profile.trophies);
  $('#trophyFill').style.width = next ? `${Math.max(0, Math.min(100, 100 * (profile.trophies - a.at) / (next.at - a.at)))}%` : '100%';
  $('#arenaHint').textContent = next ? `Noch ${next.at - profile.trophies} Trophäen bis ${next.name}${next.unlock.length ? ' – dort warten neue Karten' : ''}` : 'Höchste Arena erreicht';
  for (const b of $('#levelSeg').children) b.classList.toggle('on', b.dataset.level === profile.level);
  $('#soundBtn').classList.toggle('off', !profile.sound);
  $('#deckDot').hidden = !canUpgradeAny();
  const n = profile.wins + profile.losses + profile.draws;
  $('#stats').textContent = n ? `${profile.wins} Siege · ${profile.losses} Niederlagen${profile.draws ? ` · ${profile.draws} Unentschieden` : ''}` : 'Zerstöre die Türme auf der anderen Seite der Furt.';
}

$('#levelSeg').addEventListener('click', e => { const l = e.target.dataset.level; if (!l) return; profile.level = l; save(); sfx('click'); renderHome(); });
$('#soundBtn').addEventListener('click', () => { profile.sound = !profile.sound; setSound(profile.sound); save(); renderHome(); sfx('click'); });
$('#deckBtn').addEventListener('click', () => { sfx('click'); show('deck'); });
$('#deckBack').addEventListener('click', () => { sfx('click'); swap = null; show('home'); });
$('#helpBtn').addEventListener('click', () => { sfx('click'); showHelp(); });
$('#playBtn').addEventListener('click', () => { sfx('click'); if (!profile.seenHelp) showHelp(startBattle); else startBattle(); });

function showHelp(then) {
  const d = el('div', 'help', `<h3>So geht’s</h3>
<ul>
<li><b>Ziel:</b> Zerstöre mehr Türme als der Gegner. Fällt der <b>Hauptturm</b>, ist das Spiel sofort gewonnen.</li>
<li><b>Karten spielen:</b> Karte antippen und dann aufs Feld tippen – oder die Karte direkt aufs Feld ziehen. Truppen und Gebäude nur auf deine Hälfte, Zauber überallhin.</li>
<li><b>Kraft:</b> Jede Karte kostet Kraft (blaue Zahl). Der Balken füllt sich von selbst, ab Minute 2 doppelt so schnell.</li>
<li><b>Zeit:</b> 3 Minuten. Steht es dann gleich, gewinnt in der Verlängerung der nächste zerstörte Turm.</li>
<li><b>Helden:</b> Steht ein Held auf dem Feld, erscheint rechts ein goldener Knopf für seine Fähigkeit – sie kostet Kraft.</li>
<li><b>Runenform:</b> Ab Kartenstufe 3 erscheint manche Karte jedes zweite oder dritte Mal in einer stärkeren Form (violette Rauten auf der Karte).</li>
<li><b>Fortschritt:</b> Siege bringen Trophäen und eine Truhe mit Gold und Karten. Mit doppelten Karten und Gold wertest du Karten auf; neue Arenen schalten neue Karten frei.</li>
</ul>`);
  const b = el('button', 'btn primary', then ? 'Los geht’s' : 'Alles klar');
  const row = el('div', 'btns one'); row.append(b); d.append(row);
  const done = () => { profile.seenHelp = true; save(); closeSheet(); sheetDismiss = null; if (then) then(); };
  b.addEventListener('click', () => { sfx('click'); done(); });
  sheetDismiss = then ? null : done;
  openSheet(d, true);
}

// ---- Karten & Deck -----------------------------------------------------------------------------
let swap = null; // Karte aus der Sammlung, die gerade ins Deck getauscht wird
function renderDeck() {
  $('#goldNum2').textContent = fmt(profile.gold);
  $('#avgCost').textContent = `Ø ${avgCost(profile.deck).toFixed(1).replace('.', ',')} Kraft`;
  const hint = $('#swapHint');
  hint.hidden = !swap;
  if (swap) hint.textContent = `Tippe die Deck-Karte an, die ${CARDS[swap].name} ersetzen soll.`;
  const meter = id => { const c = profile.cards[id], u = P.upgradeInfo(profile, id); return u.max ? 0 : Math.max(0.001, c.n / u.copies); };
  const dg = $('#deckGrid'); dg.replaceChildren();
  for (const id of profile.deck) { const e = cardEl(id, { lvl: profile.cards[id].lvl, meter: meter(id), rune: P.hasRune(profile, id) }); if (swap) e.classList.add('pick'); dg.append(e); }
  const cg = $('#collGrid'); cg.replaceChildren();
  const all = P.ARENAS.flatMap(a => a.unlock).filter(id => !profile.deck.includes(id));
  for (const id of all) cg.append(profile.cards[id] ? cardEl(id, { lvl: profile.cards[id].lvl, meter: meter(id), rune: P.hasRune(profile, id) }) : cardEl(id, { locked: P.unlockArena(id) }));
  $('#collCount').textContent = `${Object.keys(profile.cards).length} von ${Object.keys(CARDS).length} Karten`;
}
$('#deckGrid').addEventListener('click', e => {
  const c = e.target.closest('.card'); if (!c) return;
  sfx('click');
  if (swap) { profile.deck[profile.deck.indexOf(c.dataset.id)] = swap; swap = null; save(); renderDeck(); return; }
  showCard(c.dataset.id);
});
$('#collGrid').addEventListener('click', e => { const c = e.target.closest('.card'); if (!c) return; sfx('click'); swap = null; showCard(c.dataset.id); });

const SPEED_NAME = v => (v <= 0.8 ? 'Langsam' : v <= 1.1 ? 'Mittel' : v <= 1.6 ? 'Schnell' : 'Sehr schnell');
function statRows(id, lvl) {
  const c = CARDS[id], m = sim.cardMult(lvl), up = lvl < P.MAX_LEVEL ? sim.cardMult(lvl + 1) : 0;
  const rows = [];
  const scaled = (label, base) => rows.push([label, fmt(Math.round(base * m)), up ? `+${fmt(Math.round(base * up) - Math.round(base * m))}` : '']);
  if (c.type === 'spell') {
    if (c.dmg) { scaled('Schaden', c.dmg); scaled('Turmschaden', c.dmg * TOWER_SPELL_FACTOR); }
    if (c.heal) { scaled('Heilung je Schlag', c.heal); rows.push(['Dauer', `${c.dur} s`, '']); }
    if (c.dot) { scaled('Schaden je Sekunde', c.dot); scaled('Turmschaden je Sek.', c.dot * TOWER_SPELL_FACTOR); rows.push(['Dauer', `${c.dur} s`, '']); }
    if (c.root) rows.push(['Hält fest', `${String(c.root).replace('.', ',')} s`, '']);
    if (c.stun) rows.push(['Betäubt', `${String(c.stun).replace('.', ',')} s`, '']);
    if (c.haste) rows.push(['Treibt an', `${c.haste} s · +35 %`, '']);
    rows.push(['Radius', `${String(c.radius).replace('.', ',')} Felder`, '']);
    return rows;
  }
  const u = UNITS[c.unit], s = u.spawn ? UNITS[u.spawn.unit] : null;
  scaled('Leben', u.hp);
  if (u.dmg) { scaled(u.splash ? 'Flächenschaden' : 'Schaden', u.dmg); rows.push(['Schlagtempo', `${String(u.atk).replace('.', ',')} s`, '']); }
  if (s) { if (!u.dmg) scaled('Wicht: Schaden', s.dmg); rows.push(['Bringt hervor', `${u.spawn.count > 1 ? u.spawn.count + ' Wichte' : '1 Wicht'} alle ${String(u.spawn.every).replace('.', ',')} s`, '']); }
  if (u.spin) rows.push(['Trifft', 'alles ringsum', '']);
  if (u.kamikaze) rows.push(['Besonderheit', 'zerplatzt beim Angriff', '']);
  if (u.slow) rows.push(['Bremst', `${String(u.slow).replace('.', ',')} s · −35 %`, '']);
  if (u.charge) rows.push(['Ansturm', 'doppeltes Tempo, doppelter Stoß', '']);
  if (u.deathDmg) scaled('Schaden beim Tod', u.deathDmg.dmg);
  if (u.life) rows.push(['Lebensdauer', `${u.life} s`, '']);
  if (u.speed) rows.push(['Tempo', SPEED_NAME(u.speed), '']);
  if (u.dmg) rows.push(['Reichweite', u.range >= 2 ? `${String(u.range).replace('.', ',')} Felder` : 'Nahkampf', '']);
  if (u.dmg) rows.push(['Ziele', u.targets === 'buildings' ? 'Gebäude' : u.hitsAir ? 'Luft & Boden' : 'Boden', '']);
  if (c.count > 1) rows.push(['Anzahl', `× ${c.count}`, '']);
  if (u.air) rows.push(['Bewegung', 'Fliegt', '']);
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
      ub.addEventListener('click', () => {
        const r = P.upgrade(profile, id);
        if (!r) return;
        save(); sfx('upgrade'); renderDeck(); showCard(id);
        if (r.levelUp) toastSheet(`Spielerstufe ${P.playerLevel(profile.xp).lvl}! Deine Türme werden stärker.`);
        if (r.lvl === RUNE_LEVEL && RUNES[id]) { toastSheet(`Runenform von ${c.name} freigeschaltet!`); sfx('rune'); }
      });
      btns.append(ub);
    }
    if (!profile.deck.includes(id)) {
      const b = el('button', 'btn', 'Ins Deck');
      b.addEventListener('click', () => { sfx('click'); swap = id; closeSheet(); renderDeck(); $('#deck .scroll').scrollTop = 0; });
      btns.append(b);
    }
  }
  const close = el('button', 'btn', 'Schließen');
  close.addEventListener('click', () => { sfx('click'); closeSheet(); });
  btns.append(close);
  if (btns.children.length === 1) btns.classList.add('one');
  d.append(btns);
  sheetDismiss = closeSheet;
  openSheet(d, false);
}
function toastSheet(msg) { sheet.prepend(el('div', 'notice', msg)); }

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

function startBattle() {
  closeSheet(); sheetDismiss = null;
  unlock();
  const seed = (Number(params.get('seed')) || Date.now()) >>> 0;
  let s = seed || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const opp = P.opponentLevels(profile, profile.level);
  B.g = sim.createGame({ seed, decks: [profile.deck, P.opponentDeck(profile, rnd)], levels: [P.playerLevels(profile), opp] });
  B.ai = createAi(profile.level);
  B.auto = AUTO ? createAi(AUTO) : null;
  B.level = profile.level; B.oppLvl = opp.lvl;
  B.acc = 0; B.last = performance.now(); B.sel = null; B.ghost = null; B.paused = false; B.endAt = 0; B.flags = {}; B.hand = []; B.next = null; B.booked = false;
  renderer.reset();
  show('battle');
  layout();
  if (renderer.prepare) renderer.prepare(B.g);
  updateHud(true);
  banner('Kampf!');
  sfx('horn');
  wakeLock(true);
  if (!B.running) { B.running = true; requestAnimationFrame(frame); }
}

let bannerT = 0;
function banner(text) { const b = $('#banner'); b.hidden = true; void b.offsetWidth; b.textContent = text; b.hidden = false; clearTimeout(bannerT); bannerT = setTimeout(() => { b.hidden = true; }, 2000); }
let toastT = 0;
function toast(text) { const t = $('#toast'); t.textContent = text; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1300); }

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
    else if (ev.t === 'overtime') { sfx('horn'); banner('Verlängerung – der nächste Turm gewinnt!'); }
  }
  g.events.length = 0;
  if (!B.flags.double && g.phase === 'main' && g.time >= g.duration - 60) { B.flags.double = true; banner('Doppelte Kraft!'); sfx('horn'); }
  if (!B.flags.triple && g.phase === 'over' && g.time >= g.duration + g.overtime - 60) { B.flags.triple = true; banner('Dreifache Kraft!'); sfx('horn'); }
  const left = Math.ceil(sim.timeLeft(g));
  if (left <= 10 && left > 0 && left !== B.flags.tick && !g.over) { B.flags.tick = left; sfx('tick'); }
}

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
  if (sim.playCard(g, 0, B.sel, p.x, p.y)) { B.sel = null; B.ghost = null; }
}
$('#abilities').addEventListener('pointerdown', e => {
  const b = e.target.closest('.ability'); if (!b || B.g.over || B.paused) return;
  e.preventDefault(); e.stopPropagation(); unlock();
  if (sim.useAbility(B.g, 0, b.dataset.id)) return;
  const st = sim.abilities(B.g, 0).find(a => a.cardId === b.dataset.id);
  toast(!st ? 'Held ist gefallen' : st.cd > 0 ? 'Fähigkeit lädt noch' : B.g.sides[0].kraft < st.ability.cost ? 'Zu wenig Kraft' : 'Held ist noch nicht bereit');
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
document.addEventListener('contextmenu', e => e.preventDefault());
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
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else if (screen === 'battle' && !B.g.over) wakeLock(true); });

function finishBattle() {
  B.booked = true;
  wakeLock(false);
  const g = B.g, w = g.winner;
  const timeout = !B.gaveUp && w !== 'draw' && g.sides[0].crowns === g.sides[1].crowns;
  const res = P.applyResult(profile, { winner: w, level: B.level, crowns: g.sides[0].crowns });
  B.gaveUp = false;
  save();
  sfx(w === 0 ? 'win' : w === 1 ? 'lose' : 'draw');
  const d = el('div');
  d.append(el('h3', w === 0 ? 'win' : w === 1 ? 'lose' : '', w === 0 ? 'Sieg!' : w === 1 ? 'Niederlage' : 'Unentschieden'));
  d.append(el('div', 'result', `<span class="me">${g.sides[0].crowns}</span><span class="ico crown"></span><span class="foe">${g.sides[1].crowns}</span>`));
  if (timeout) d.append(el('p', 'center', 'Entschieden über den am stärksten beschädigten Turm.'));
  d.append(el('div', 'delta', `<span class="ico trophy"></span>${res.delta > 0 ? '+' : ''}${res.delta}<span style="color:var(--dim);font-weight:600;font-size:15px">&nbsp;→ ${fmt(profile.trophies)}</span>`));
  if (res.arenaUp) d.append(el('div', 'notice', `Neue Arena: ${res.arenaUp}!`));
  if (res.newCards.length) {
    const box = el('div', 'chest'); box.append(el('b', 't', 'Neue Karten freigeschaltet'));
    const loot = el('div', 'loot');
    for (const id of res.newCards) { const it = el('div', 'item'); it.append(cardEl(id, { tag: 'div' })); loot.append(it); }
    box.append(loot); d.append(box);
  }
  if (res.chest) {
    const box = el('div', 'chest'); box.append(el('b', 't', 'Siegestruhe'));
    const loot = el('div', 'loot');
    loot.append(el('div', 'item goldItem', `<span class="ico coin"></span>+${res.chest.gold}`));
    for (const s of res.chest.cards) { const it = el('div', 'item'); it.append(cardEl(s.id, { tag: 'div' }), document.createTextNode(`× ${s.n}`)); loot.append(it); }
    box.append(loot); d.append(box);
    if (canUpgradeAny()) d.append(el('p', 'center', 'Du kannst eine Karte aufwerten – schau unter „Karten &amp; Deck“.'));
    setTimeout(() => sfx('coin'), 700);
  }
  const row = el('div', 'btns');
  const menu = el('button', 'btn', 'Menü'), again = el('button', 'btn primary', 'Nochmal');
  menu.addEventListener('click', () => { sfx('click'); closeSheet(); B.running = false; show('home'); });
  again.addEventListener('click', () => { sfx('click'); startBattle(); });
  row.append(menu, again); d.append(row);
  sheetDismiss = null;
  openSheet(d, true);
}

// ---- Start -------------------------------------------------------------------------------------
drawIcon($('#emblem').getContext('2d'), 320, 20);
layout();
for (const id of Object.keys(CARDS)) art(id); // Kartenbilder vorab erzeugen (im Kampf würde das die Bühne stören)
document.addEventListener('pointerdown', unlock, { once: true });
show('home');
window.__runenfurt = { B, sim, renderer, get profile() { return profile; }, start: startBattle };

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
