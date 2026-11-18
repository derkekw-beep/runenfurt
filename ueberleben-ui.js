// Überleben: Anzeige im Kampf (Wellenkopf mit Etappe, Fortschritt, Flüche, Ereignis, Kombo, Boss, Kräfte und Segen), die große
// Wellen-Ansage, die Wahl der Segen, Kartenkräfte und Flüche, das Blatt vor dem Start und die Abrechnung.
// Die Regeln selbst stehen in ueberleben.js. main.js ruft nur: sheet(), start(), onEvent(ev), update(now), result(box, book), stop().
import { CARDS } from './cards.js';
import * as U from './ueberleben.js';

// Symbole: kleine Zeichnungen, damit sie auf jedem Gerät gleich aussehen
const SVG = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  kraft:  SVG('<path d="M12 2c4 5 7 8.4 7 12a7 7 0 0 1-14 0c0-3.6 3-7 7-12z" fill="currentColor"/><path d="M9 14a3 3 0 0 0 3 3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>'),
  turm:   SVG('<path d="M5 3h3v3h2.5V3h3v3H16V3h3v6l-2 2v8h2v2H5v-2h2v-8L5 9z" fill="currentColor"/>'),
  karte:  SVG('<rect x="5" y="3" width="14" height="18" rx="2.5" fill="currentColor"/><path d="M12 7l4 5h-2.6v5h-2.8v-5H8z" fill="#fff" opacity=".85"/>'),
  blitz:  SVG('<path d="M13.5 2L5 13.5h5.5L9 22l9.5-12.5H13z" fill="currentColor"/>'),
  schild: SVG('<path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z" fill="currentColor"/><path d="M12 6v12" stroke="#fff" stroke-width="1.6" opacity=".6"/>'),
  trupp:  SVG('<circle cx="8" cy="8" r="3.2" fill="currentColor"/><circle cx="16.5" cy="9" r="2.7" fill="currentColor"/><path d="M2.5 20c0-4 2.4-6.5 5.5-6.5s5.5 2.5 5.5 6.5zM14 20c0-1.8-.4-3.4-1.2-4.6 1-.9 2.2-1.4 3.7-1.4 3 0 5 2.3 5 6z" fill="currentColor"/>'),
  pakt:   SVG('<path d="M12 2l2.6 6.3L21 9l-4.8 4.3L17.6 20 12 16.5 6.4 20l1.4-6.7L3 9l6.4-.7z" fill="currentColor"/>'),
  schaedel: SVG('<path d="M12 2.5c-4.7 0-8 3.3-8 7.6 0 2.6 1.2 4.5 3 5.6V19a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 19v-3.3c1.8-1.1 3-3 3-5.6 0-4.3-3.3-7.6-8-7.6z" fill="currentColor"/><circle cx="8.8" cy="11" r="2" fill="#1a0b10"/><circle cx="15.2" cy="11" r="2" fill="#1a0b10"/><path d="M11 15.6l1-1.8 1 1.8z" fill="#1a0b10"/>'),
  stern:  SVG('<path d="M12 1.5l2.9 7 7.6.6-5.8 5 1.8 7.4L12 17.5l-6.5 4 1.8-7.4-5.8-5 7.6-.6z" fill="currentColor"/>'),
  laune:  SVG('<path d="M6 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.6 1.5A3.5 3.5 0 0 1 17 15z" fill="currentColor"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  auftrag: SVG('<path d="M6 3h12v18l-6-4-6 4z" fill="currentColor"/><path d="M9 9l2 2 4-4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>'),
};
const BOON_ICON = { kraftfluss: 'kraft', doppelkraft: 'kraft', vorrat: 'kraft', beutezug: 'kraft', mauerwerk: 'turm', bollwerk: 'turm', turmschuetzen: 'turm', turmstaerke: 'turm', wiederaufbau: 'turm', letztewehr: 'turm',
  drill: 'karte', schulung: 'karte', meisterschaft: 'karte', runenmacht: 'karte', blitzwacht: 'blitz', frostfalle: 'blitz', eilmarsch: 'trupp', wachposten: 'trupp', verstaerkung: 'trupp', schutzbann: 'schild', pakt: 'pakt', kk: 'karte', fluch: 'schaedel' };
const icon = id => ICON[BOON_ICON[id] || 'blitz'];
const RAR_CLASS = ['r0', 'r1', 'r2', 'r3'];
const komma = v => String(Math.round(v * 100) / 100).replace('.', ',');

// ctx: { el, fmt, sfx, banner, toast, openSheet, closeSheet, setDismiss, B, P, art(id), inset(px), profile(), save(), today(), start(opts), auto(), mileRow, collected, askHelp(go) }
export function createSurvUi(ctx) {
  const { el, fmt, sfx, B, P } = ctx;
  const wrap = document.querySelector('#arenaWrap');
  let bar = null, parts = null, kit = null, insetH = 0, lastKey = '', lastT = 0, choosing = false, seenThemes = new Set(), lastScore = 0, lastWave = 0;

  // ---- Anzeige im Kampf ----
  // Flach gehalten (seit 2026-11-18, vorher lag die halbe Arena unter der Anzeige): eine Zeile Wellenkopf, eine schmale Zeile Chips.
  // Boss und Kombo stecken in den Kästen der ersten Zeile, Kräfte und Segen stehen klein unten links. Die Kamera rückt das Feld
  // unter die Anzeige (ctx.inset → renderer.setInset): nichts vom Feld liegt unter der Anzeige.
  function start() {
    stop();
    if (!B.g.waves || !B.g.waves.director) return;
    bar = el('div', 'survBar',
      '<div class="svTop">' +
        '<div class="svWaveBox"><b class="svN">0</b><span class="svLbl">Welle</span><div class="svPips"></div></div>' +
        '<div class="svMid"><div class="svTheme"></div><div class="svProg"><i></i><span></span></div></div>' +
        '<div class="svScore"><b>0</b><span></span></div>' +
      '</div>' +
      '<div class="svChips"></div>');
    bar.id = 'survBar';
    kit = el('div', 'svKit');
    wrap.append(bar, kit);
    const q = s => bar.querySelector(s);
    parts = { n: q('.svN'), pips: q('.svPips'), box: q('.svWaveBox'), mid: q('.svMid'), theme: q('.svTheme'), prog: q('.svProg i'), progT: q('.svProg span'), scoreBox: q('.svScore'), score: q('.svScore b'), mult: q('.svScore span'), chips: q('.svChips') };
    lastKey = ''; choosing = false; seenThemes = new Set(); lastScore = 0; lastWave = 0; insetH = -1;
    update(0, true);
  }
  function stop() {
    if (bar) bar.remove(); if (kit) kit.remove(); bar = parts = kit = null; choosing = false;
    const w = document.querySelector('.svWaveBanner'); if (w) w.remove();
    if (insetH !== 0) { insetH = 0; ctx.inset(0); }
  }
  // Platz für die Anzeige: so hoch, wie sie gerade ist (die Kamera rechnet nur neu, wenn sich das ändert)
  function fitInset() {
    const h = Math.round(bar.offsetTop + bar.offsetHeight + 2);
    if (h !== insetH && h > 10) { insetH = h; ctx.inset(h); }
  }

  const chip = (cls, ico, text, title = '') => `<span class="svChip ${cls}" title="${title.replace(/"/g, '&quot;')}">${ico}<b>${text}</b></span>`;
  function update(now, force) {
    if (!bar) return;
    const g = B.g, h = U.hud(g);
    if (!h) return;
    if (h.choice && !choosing && !g.over && !B.loading) { choose(); force = true; }   // die Anzeige zeigt beim Wählen den Stand von jetzt
    // Kombo: im Punktekasten, läuft jede Bildfolge mit
    parts.scoreBox.classList.toggle('combo', !!h.combo);
    parts.scoreBox.classList.toggle('hot', h.combo >= 10);
    const m = h.mult * (h.curseMult || 1);
    parts.mult.textContent = h.combo ? `Kombo ${h.combo} ×${komma(h.comboMult)}` : m > 1.001 ? `×${komma(m)}` : 'Punkte';
    parts.mult.classList.toggle('on', m > 1.001 || !!h.combo);
    if (!force && now - lastT < 150) return;
    lastT = now;
    const q = h.quest;
    const key = [h.mood, h.powers.length, h.wave, h.theme, h.score, h.phase, Math.ceil(h.nextIn), h.left, q && q.have, q && q.done, h.boons.length, h.boons.reduce((s, b) => s + b.n, 0), h.boss && Math.round(h.boss.hp / h.boss.maxHp * 60), h.boss && h.boss.rage, h.curses.length, h.event && h.event.id, Math.ceil(h.treasure), h.ramp].join('|');
    if (key === lastKey) { fitInset(); return; }
    lastKey = key;
    // Wellenkopf: Nummer, Etappe als fünf Punkte (der letzte ist der Boss)
    parts.n.textContent = h.wave || '–';
    if (h.wave !== lastWave) { lastWave = h.wave; parts.box.classList.remove('bump'); void parts.box.offsetWidth; parts.box.classList.add('bump'); }
    parts.pips.innerHTML = Array.from({ length: U.STAGE }, (_, i) => `<i class="${i + 1 < h.stagePos ? 'done' : i + 1 === h.stagePos ? (h.phase === 'welle' ? 'now' : 'done') : ''}${i === U.STAGE - 1 ? ' boss' : ''}"></i>`).join('');
    parts.box.classList.toggle('boss', h.stagePos === U.STAGE);
    // Mitte: Thema und Fortschritt der Welle – in der Bosswelle Name und Leben des Bosses
    parts.mid.classList.toggle('wait', h.phase !== 'welle');
    parts.mid.classList.toggle('bossbar', !!h.boss);
    parts.mid.classList.toggle('rage', !!(h.boss && h.boss.rage));
    if (h.boss) {
      parts.theme.textContent = h.boss.rage ? `${h.boss.name} · Raserei` : h.boss.name;
      parts.prog.style.transform = `scaleX(${Math.max(0, h.boss.hp / h.boss.maxHp)})`;
      parts.progT.textContent = `noch ${h.left} Gegner`;
    } else if (h.phase === 'welle') {
      parts.theme.textContent = h.theme;
      parts.prog.style.transform = `scaleX(${h.total ? Math.max(0, Math.min(1, 1 - h.left / h.total)) : 0})`;
      parts.progT.textContent = h.left ? `noch ${h.left} Gegner` : 'Welle geschafft';
    } else {
      parts.theme.textContent = h.choice ? (h.kind === 'kraft' ? 'Kartenkraft wählen' : h.kind === 'fluch' ? 'Fluch wählen' : 'Segen wählen') : `Gleich: ${h.next}`;
      parts.prog.style.transform = `scaleX(${h.choice ? 1 : Math.max(0, 1 - h.nextIn / 4)})`;
      parts.progT.textContent = h.choice ? 'Pause' : `in ${Math.ceil(h.nextIn)} s`;
    }
    // Punkte
    parts.score.textContent = fmt(h.score);
    if (h.score > lastScore && lastScore) { parts.score.classList.remove('tick'); void parts.score.offsetWidth; parts.score.classList.add('tick'); }
    lastScore = h.score;
    // Chips: Flüche, Ereignis, Wellenmacht, Feldlaune, Auftrag – eine schmale Zeile
    const chips = [];
    for (const c of h.curses) chips.push(chip('curse', ICON.schaedel, c.name, c.text));
    if (h.event) chips.push(chip('event', ICON.stern, h.event.id === 'schatz' && h.treasure ? `${h.event.name} ${Math.ceil(h.treasure)} s` : h.event.name, h.event.text));
    if (h.ramp) chips.push(chip('ramp', ICON.schild, `+${h.ramp} %`, `Wellenmacht: Ab Welle 16 hat jede Welle mehr Leben und Schaden – gerade ${h.ramp} % mehr Leben.`));
    if (h.mood) chips.push(chip('mood', ICON.laune, h.mood, h.moodText));
    if (q) chips.push(chip(`quest${q.done ? ' ok' : ''}`, ICON.auftrag, q.done ? `${q.name} ✓` : `${q.name} ${q.have}/${q.need}`, q.text));
    parts.chips.innerHTML = chips.join('');
    // unten links: Kartenkräfte (mit Kartenbild) und die letzten Segen
    const shown = h.boons.slice(-4);
    kit.innerHTML = h.powers.slice(-6).map(p => `<span class="svPow r${p.rar}" title="${p.name} · ${CARDS[p.card].name}" data-card="${p.card}"></span>`).join('') + shown.map(b => `<span class="svBoon" title="${b.name}">${icon(b.id)}${b.n > 1 ? `<i>${b.n}</i>` : ''}</span>`).join('') + (h.boons.length > shown.length ? `<span class="svMore">+${h.boons.length - shown.length}</span>` : '');
    for (const s of kit.querySelectorAll('.svPow')) s.append(thumb(s.dataset.card, 40, 52));
    fitInset();
  }
  // kleines Kartenbild (aus dem Kartenbild-Speicher von main.js)
  function thumb(id, w, h) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    try { const a = ctx.art(id); c.getContext('2d').drawImage(a, 0, 0, c.width, c.height); } catch { /* Bild noch nicht da */ }
    return c;
  }

  // große Ansage zu Beginn einer Welle: Nummer, Name, Flüche und Ereignis
  function waveBanner(ev) {
    const old = document.querySelector('.svWaveBanner'); if (old) old.remove();
    const tags = [...(ev.curses || []).map(id => `<span class="curse">${ICON.schaedel}${U.CURSES[id].name}</span>`), ev.event ? `<span class="event">${ICON.stern}${U.EVENTS[ev.event].name}</span>` : '', ev.elite ? `<span class="elite">${ICON.schild}Elite: ${U.ELITES[ev.elite].name}</span>` : ''].join('');
    const b = el('div', `svWaveBanner${ev.boss ? ' boss' : ''}`, `<small>${ev.boss ? 'Bosswelle' : `Etappe ${Math.ceil(ev.n / U.STAGE)} · Welle`}</small><b>${ev.boss ? ev.name : ev.n}</b>${ev.boss ? '' : `<em>${ev.name}</em>`}${tags ? `<div class="tags">${tags}</div>` : ''}`);
    wrap.append(b);
    setTimeout(() => b.remove(), 2200);
  }

  // Ereignisse des Laufs: Ansagen, Klänge. Gibt true zurück, wenn das Ereignis hier behandelt ist.
  function onEvent(ev) {
    if (!bar) return false;
    if (ev.t === 'wave') {
      sfx(ev.boss ? 'horn' : 'wake');
      waveBanner(ev);
      const key = ev.boss ? 'boss' + ev.name : ev.theme;
      const msg = [];
      if (ev.event) msg.push(U.EVENTS[ev.event].text);
      if (ev.boss || !seenThemes.has(key)) { seenThemes.add(key); msg.push(ev.hint); }
      if (ev.elite) msg.push(`Elite: ${U.ELITES[ev.elite].name} – ${U.ELITES[ev.elite].text}.`);
      if (msg.length) setTimeout(() => ctx.toast(msg.join(' '), 3600), 1400);
      return true;
    }
    if (ev.t !== 'surv') return ev.t === 'boon';
    const k = ev.k;
    if (k === 'clear') { sfx('coin'); float(`+${fmt(ev.pts)}${ev.fast ? ' · eilig' : ''}${ev.flawless ? ' · makellos' : ''}`); }
    else if (k === 'auftrag') { sfx('bless'); ctx.banner(`Auftrag „${ev.name}“ erfüllt!`); float(`+${fmt(ev.pts)} · Türme geheilt`); }
    else if (k === 'boss') { sfx('win'); ctx.banner('Boss besiegt!'); float(`+${fmt(ev.pts)}`); }
    else if (k === 'zorn') { sfx('horn'); ctx.toast(`${ev.name} gerät in Raserei!`, 2200); }
    else if (k === 'stampf') sfx('charge');
    else if (k === 'ruf') sfx('wake');
    else if (k === 'elite') sfx('shield');
    else if (k === 'wehr') { sfx('bless'); ctx.banner('Letzte Wehr!'); }
    else if (k === 'laune') { sfx('horn'); ctx.toast(`Feldlaune: ${ev.name} – ${ev.text}`, 4200); }
    else if (k === 'frost') sfx('frostnacht');
    else if (k === 'bers') sfx('charge');
    else if (k === 'kraft') sfx('rune');
    else if (k === 'fluch') { sfx('horn'); float(`Fluch: ${ev.names.join(' + ')}`, 'curse'); }
    else if (k === 'kombo') { sfx('coin'); float(`Kombo ${ev.n}!`, 'combo'); }
    else if (k === 'goldwicht') { sfx('chest'); ctx.banner('Goldwicht!'); }
    else if (k === 'schatz') { sfx('kasse'); ctx.banner('Goldwicht gefangen!'); float(`+${fmt(ev.pts)} · +3 Kraft · Neu-Würfeln`, 'gold'); }
    else if (k === 'entkommen') { sfx('flip'); ctx.toast('Der Goldwicht ist entkommen.', 1800); }
    else if (k === 'kopfgeld') { sfx('kasse'); float(`Kopfgeld: +${fmt(ev.pts)} · +3 Kraft`, 'gold'); }
    else if (k === 'wut') { sfx('horn'); ctx.toast('Letzte Wut: Die übrigen Gegner rasen!', 1800); }
    else if (k === 'wieder') sfx('bless');
    else if (k === 'rueckfluss') { sfx('rune'); float('Rückfluss: +2 Kraft'); }
    else if (k === 'nachhall') sfx('magie');
    return true;
  }
  // kleine Einblendung unter den Punkten
  function float(text, cls = '') {
    if (!bar) return;
    const f = el('span', `svFloat ${cls}`, text);
    bar.append(f);
    setTimeout(() => f.remove(), 1700);
  }

  // ---- Wählen: das Spiel hält an, bis gewählt ist (Segen, Kartenkraft oder Fluch) ----
  function choose() {
    const g = B.g, u = g.waves.u;
    if (ctx.auto()) { const o = U.autoPick(g); if (o) ctx.toast(`${o.id === 'kk' ? 'Kartenkraft' : o.id === 'fluch' ? 'Fluch' : 'Segen'}: ${U.boonName(o)}`, 1200); return; }   // Zeitraffer und Computer-Spieler wählen selbst
    choosing = true; B.paused = true; B.sel = null; B.ghost = null; B.drag = null;
    const draw = () => {
      const ch = u.choice, kind = ch.kind || 'segen', d = el('div', `boonPick k-${kind}`);
      const title = kind === 'kraft' ? 'Kartenkraft' : kind === 'fluch' ? 'Wähle deinen Fluch' : ch.first ? 'Dein Startsegen' : ch.big ? 'Großer Segen' : 'Wähle einen Segen';
      const sub = kind === 'kraft' ? 'Eine deiner Karten bekommt für den Rest des Laufs eine besondere Kraft – jede Karte trägt bis zu zwei.'
        : kind === 'fluch' ? `Etappe ${Math.ceil((g.waves.n + 1) / U.STAGE)} beginnt. Ein Fluch macht die Gegner gefährlicher, bis ihr Boss fällt – dafür gibt es mehr Punkte. Beide zusammen bringen ×1,6 und sofort einen Großen Segen.`
        : ch.first ? 'Jeder Lauf beginnt mit einer Wahl. Segen gelten bis zum Ende des Laufs.' : ch.big ? `Bosswelle ${g.waves.n} überstanden – hier sind seltene Segen häufiger.` : `Welle ${g.waves.n} überstanden. Die nächste: ${U.hud(g).next}.`;
      d.append(el('div', 'bpHead', `<span class="bpIco">${kind === 'kraft' ? ICON.karte : kind === 'fluch' ? ICON.schaedel : ICON.stern}</span><h3>${title}</h3><p>${sub}</p>`));
      const row = el('div', 'boonRow');
      ch.options.forEach((o, k) => {
        const rar = U.boonRar(o), have = u.boons[o.id] || 0;
        let b;
        if (o.id === 'kk') {   // Kartenkraft: Kartenbild, Name der Kraft, Wirkung
          const own = U.powersOf(u, o.card).map(p => U.POWERS[p].name);
          b = el('button', `boon kk ${RAR_CLASS[rar]}`, `<span class="bArt"></span><span class="bTxt"><b>${U.POWERS[o.power].name}</b><span class="bCard">${CARDS[o.card].name}${own.length ? ` · hat schon ${own.join(', ')}` : ''}</span><small>${U.POWERS[o.power].text[0].toUpperCase() + U.POWERS[o.power].text.slice(1)}.</small></span><em>${U.RAR_NAME[rar]}</em>`);
          b.querySelector('.bArt').append(thumb(o.card, 58, 76));
        } else if (o.id === 'fluch') {
          const both = o.curses.length > 1;
          b = el('button', `boon curse${both ? ' both' : ''}`, `<span class="bIco">${ICON.schaedel}${both ? ICON.schaedel : ''}</span><span class="bTxt"><b>${U.boonName(o)}</b><small>${o.curses.map(c => U.CURSES[c].text).join(' ')}</small></span><em>Punkte ×${komma(U.CURSE_MULT[o.curses.length])}${both ? ' + Segen' : ''}</em>`);
        } else {
          b = el('button', `boon ${RAR_CLASS[rar]}`, `<span class="bIco">${icon(o.id)}</span><span class="bTxt"><b>${U.boonName(o)}${have ? ` <i>${have + 1}. Mal</i>` : ''}</b><small>${U.boonText(g, o)}</small></span><em>${rar === 3 ? 'Wagnis' : U.RAR_NAME[rar]}</em>`);
        }
        b.style.animationDelay = `${k * 0.08}s`;
        b.dataset.k = k;
        b.addEventListener('click', () => { sfx(o.id === 'fluch' ? 'horn' : rar >= 2 ? 'rune' : 'buy'); b.classList.add('chosen'); setTimeout(() => { if (u.choice === ch) U.pick(g, k); if (u.choice) draw(); else done(); }, 220); });   // kurz aufleuchten lassen, dann wählen
        row.append(b);
      });
      d.append(row);
      if (u.rerolls > 0 && kind === 'segen') { const r = el('button', 'btn rerollBtn', `Neu würfeln <em>${u.rerolls}</em>`); r.addEventListener('click', () => { if (U.reroll(g)) { sfx('flip'); draw(); } }); d.append(r); }
      if (u.order.length || u.powerList.length) d.append(el('p', 'center small boonHave', [u.order.length ? `Segen: ${listBoons(u)}` : '', u.powerList.length ? `Kräfte: ${u.powerList.map(p => `${U.POWERS[p.power].name} (${CARDS[p.card].name})`).join(', ')}` : ''].filter(Boolean).join(' · ')));
      ctx.setDismiss(null);
      ctx.openSheet(d, true);
    };
    const done = () => { ctx.closeSheet(); choosing = false; B.paused = false; B.last = performance.now(); lastKey = ''; };
    sfx('chest');
    draw();
  }
  const listBoons = u => Object.entries(u.boons).map(([id, n]) => `${U.BOONS[id].name}${n > 1 ? ` ×${n}` : ''}`).join(', ');

  // ---- Abrechnung nach dem Lauf ----
  function result(box, sum, book) {
    if (!sum) return;
    const d = el('div', 'survEnd');
    d.append(el('div', 'svScore', `<b>${fmt(sum.score)}</b><span>Punkte${sum.mult > 1 ? ` · ×${String(sum.mult).replace('.', ',')} durch Gefahr` : ''}</span>`));
    if (book.high) d.append(el('div', 'notice', 'Neue Bestmarke bei den Punkten!'));
    else if (book.place) d.append(el('p', 'center small', `Platz ${book.place} in deiner Bestenliste.`));
    d.append(el('div', 'svStats', [['Besiegt', sum.kills], ['Bosse', sum.bosses], ['Elite', sum.elites], ['Beste Kombo', sum.combo || 0], ['Flüche', sum.curses || 0], ['Aufträge', sum.quests], ['Makellos', sum.flawless], ['Goldwichte', sum.treasures || 0]].map(([k, v]) => `<span><b>${v}</b>${k}</span>`).join('')));
    if (sum.powers && sum.powers.length) d.append(el('p', 'center small', `Kartenkräfte: ${sum.powers.map(p => `${U.POWERS[p.power].name} (${CARDS[p.card].name})`).join(', ')}`));
    if (sum.boons.length) { const n = {}; for (const id of sum.boons) n[id] = (n[id] || 0) + 1; d.append(el('p', 'center small', `Segen: ${Object.entries(n).map(([id, k]) => `${U.BOONS[id].name}${k > 1 ? ` ×${k}` : ''}`).join(', ')}`)); }
    if (book.dangerUp) d.append(el('div', 'notice', `Gefahrenstufe ${book.dangerUp} gemeistert – ${book.dangerUp < U.DANGER.length ? `Stufe ${book.dangerUp + 1} ist jetzt wählbar. ` : ''}Die Belohnung wartet unter „Modi“.`));
    if (book.daily) d.append(el('div', 'notice', book.daily.can ? 'Tagesherausforderung geschafft – die Belohnung wartet unter „Modi“.' : `Tagesherausforderung: beste Welle heute ${book.daily.wave}${book.daily.wave < U.DAILY_GOAL ? ` · Belohnung ab Welle ${U.DAILY_GOAL}` : ''}.`));
    box.append(d);
  }

  // ---- Blatt vor dem Start ----
  function sheet() {
    const p = ctx.profile(), s = p.surv, day = ctx.today();
    for (const [k, v] of Object.entries(U.survLoad(s))) if (s[k] === undefined) s[k] = v;
    const open = U.dangerOpen(p);
    let danger = Math.min(s.pick || 0, open);
    const d = el('div', 'survSheet');
    d.append(el('h3', '', 'Überleben'));
    d.append(el('p', 'center small', 'Wellen ohne Ende in Etappen zu fünf, am Ende jeder Etappe ein Boss. Die Risse wehren sich wie Türme gegen jeden, der ihnen zu nahe kommt. Nach jeder Welle wählst du: Kartenkräfte für deine Karten, Segen für den ganzen Lauf – und zu jeder neuen Etappe einen Fluch für die Gegner, der mehr Punkte bringt. Dazwischen Ereignisse wie Goldwicht und Sternschnuppen. Schluss ist, wenn dein Hauptturm fällt.'));
    d.append(el('div', 'svBest', `<span><b>${s.best}</b>beste Welle</span><span><b>${fmt(s.high || 0)}</b>beste Punkte</span><span><b>${s.runs}</b>Läufe</span>`));
    // Gefahrenstufe
    d.append(el('div', 'sub', '<b>Gefahrenstufe</b><span>mehr Gefahr, mehr Punkte</span>'));
    const chips = el('div', 'chips dangerChips'), info = el('div', 'dangerInfo');
    const drawDanger = () => {
      chips.replaceChildren(...Array.from({ length: U.DANGER.length + 1 }, (_, i) => { const b = el('button', i === danger ? 'on' : '', i ? String(i) : 'Keine'); b.disabled = i > open; b.dataset.d = i; return b; }));
      info.innerHTML = danger ? `<b>Punkte ×${String(U.dangerMult(danger)).replace('.', ',')}</b><ul>${U.DANGER.slice(0, danger).map(c => `<li><b>${c.name}:</b> ${c.text}</li>`).join('')}</ul>` : `<small>Ohne Fluch. ${open < U.DANGER.length ? `Erreiche Welle ${U.DAILY_GOAL} auf Stufe ${open}, um Stufe ${open + 1} freizuschalten.` : ''}</small>`;
    };
    chips.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; sfx('click'); danger = Number(b.dataset.d); s.pick = danger; ctx.save(); drawDanger(); });
    drawDanger();
    d.append(chips, info);
    const go = el('button', 'btn primary wide', 'Lauf starten');
    go.addEventListener('click', () => { sfx('click'); ctx.askHelp(() => ctx.start({ mode: 'ansturm', danger })); });
    d.append(go);
    // Tagesherausforderung
    const di = U.dailyInfo(p, day), dr = ctx.rewardParts(U.DAILY_REWARD);
    const box = el('div', `dailyBox${di.can ? ' can' : di.got ? ' got' : ''}`, `<b>Tagesherausforderung</b><small>Heute für alle Versuche gleich: dieselben Wellen, dieselben Segen. Flüche: ${di.name}.</small><div class="dailyLine"><span>${di.tries ? `Beste heute: Welle ${di.wave} · ${fmt(di.score)} Punkte` : 'Heute noch nicht versucht'}</span><span class="dailyPrize">${dr.ico}${di.got ? 'abgeholt' : `ab Welle ${U.DAILY_GOAL}`}</span></div>`);
    const dbtn = el('button', `btn${di.can ? ' primary' : ''}`, di.can ? 'Belohnung abholen' : 'Tagesherausforderung starten');
    dbtn.addEventListener('click', () => {
      if (di.can) { const loot = U.claimDaily(p, day, P.grantReward); if (loot) { ctx.save(); ctx.collected(dbtn, loot, 'Tagesherausforderung'); } return; }
      sfx('click'); ctx.askHelp(() => ctx.start({ mode: 'ansturm', danger: di.danger, daily: day }));
    });
    box.append(dbtn); d.append(box);
    // Bestenliste der eigenen Läufe
    d.append(el('div', 'sub', '<b>Deine besten Läufe</b><span></span>'));
    if (s.top && s.top.length) {
      const t = el('div', 'topRuns');
      s.top.forEach((r, i) => t.append(el('div', 'topRow', `<i>${i + 1}</i><b>${fmt(r.score)}</b><span>Welle ${r.wave}</span><span>${r.daily ? 'Tag' : r.danger ? `Gefahr ${r.danger}` : '–'}</span><small>${r.when ? new Date(r.when).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''}</small>`)));
      d.append(t);
    } else d.append(el('p', 'center small', 'Noch kein Lauf. Dein erster steht gleich hier.'));
    // Meilensteine und Belohnungen der Gefahrenstufen
    d.append(el('div', 'sub', `<b>Meilensteine</b><span>Bestleistung: Welle ${s.best}</span>`));
    const miles = el('div', 'survList');
    const shown = P.SURV.filter((m, i) => s.best >= m.at || i < 3 || P.SURV[i - 2].at <= s.best);
    for (const m of shown) miles.append(ctx.mileRow(`Welle ${m.at}`, m, s.best >= m.at, s.got.includes(m.at), p.arena, b => ctx.collected(b, P.claimSurv(p, m.at), 'Meilenstein')));
    for (const c of U.dangerClaims(p)) if (c.level <= open) miles.append(ctx.mileRow(`Gefahr ${c.level}`, c.reward, c.reached, c.got, p.arena, b => ctx.collected(b, U.claimDanger(p, c.level, P.grantReward), `Gefahrenstufe ${c.level}`)));
    d.append(miles);
    const btns = el('div', 'btns one'), back = el('button', 'btn', 'Zurück');
    back.addEventListener('click', () => { sfx('click'); ctx.back(); });
    btns.append(back); d.append(btns);
    ctx.setDismiss(() => ctx.closeSheet());
    ctx.openSheet(d, false);
  }
  // kurzer Stand für die Auswahlseite der Modi
  const open = () => { const p = ctx.profile(); return P.survOpen(p).length + (U.dailyInfo(p, ctx.today()).can ? 1 : 0) + U.dangerClaims(p).filter(c => c.reached && !c.got).length; };

  return { start, stop, update, onEvent, result, sheet, open, get choosing() { return choosing; }, cardName: id => CARDS[id].name };
}
