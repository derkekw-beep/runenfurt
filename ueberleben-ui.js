// Überleben: Anzeige im Kampf (Welle, Thema, nächste Welle, Punkte, Auftrag, Boss, Segen), die Wahl der Segen,
// das Blatt vor dem Start (Gefahrenstufe, Tagesherausforderung, Bestenliste, Meilensteine) und die Abrechnung.
// Die Regeln selbst stehen in ueberleben.js. main.js ruft nur: sheet(), start(), onEvent(ev), update(now), result(box, book), stop().
import { CARDS } from './cards.js';
import * as U from './ueberleben.js';

// Symbole der Segen: kleine Zeichnungen, damit sie auf jedem Gerät gleich aussehen
const SVG = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  kraft:  SVG('<path d="M12 2c4 5 7 8.4 7 12a7 7 0 0 1-14 0c0-3.6 3-7 7-12z" fill="currentColor"/><path d="M9 14a3 3 0 0 0 3 3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>'),
  turm:   SVG('<path d="M5 3h3v3h2.5V3h3v3H16V3h3v6l-2 2v8h2v2H5v-2h2v-8L5 9z" fill="currentColor"/>'),
  karte:  SVG('<rect x="5" y="3" width="14" height="18" rx="2.5" fill="currentColor"/><path d="M12 7l4 5h-2.6v5h-2.8v-5H8z" fill="#fff" opacity=".85"/>'),
  blitz:  SVG('<path d="M13.5 2L5 13.5h5.5L9 22l9.5-12.5H13z" fill="currentColor"/>'),
  schild: SVG('<path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z" fill="currentColor"/><path d="M12 6v12" stroke="#fff" stroke-width="1.6" opacity=".6"/>'),
  trupp:  SVG('<circle cx="8" cy="8" r="3.2" fill="currentColor"/><circle cx="16.5" cy="9" r="2.7" fill="currentColor"/><path d="M2.5 20c0-4 2.4-6.5 5.5-6.5s5.5 2.500 5.500 6.500zM14 20c0-1.800-.4-3.400-1.200-4.600 1-.9 2.200-1.400 3.700-1.400 3 0 5 2.300 5 6z" fill="currentColor"/>'),
  pakt:   SVG('<path d="M12 2l2.6 6.300L21 9l-4.800 4.300L17.600 20 12 16.500 6.400 20l1.400-6.700L3 9l6.400-.7z" fill="currentColor"/>'),
};
const BOON_ICON = { kraftfluss: 'kraft', doppelkraft: 'kraft', vorrat: 'kraft', beutezug: 'kraft', mauerwerk: 'turm', bollwerk: 'turm', turmschuetzen: 'turm', turmstaerke: 'turm', wiederaufbau: 'turm', letztewehr: 'turm',
  drill: 'karte', schulung: 'karte', meisterschaft: 'karte', runenmacht: 'karte', blitzwacht: 'blitz', frostfalle: 'blitz', eilmarsch: 'trupp', wachposten: 'trupp', verstaerkung: 'trupp', schutzbann: 'schild', pakt: 'pakt', kk: 'karte' };
const icon = id => ICON[BOON_ICON[id] || 'blitz'];

// ctx: { el, fmt, sfx, banner, toast, openSheet, closeSheet, setDismiss, B, P, profile(), save(), today(), start(opts), auto(), mileRow, collected, askHelp(go) }
export function createSurvUi(ctx) {
  const { el, fmt, sfx, B, P } = ctx;
  const wrap = document.querySelector('#arenaWrap');
  let bar = null, parts = null, lastKey = '', lastT = 0, choosing = false, seenThemes = new Set();

  // ---- Anzeige im Kampf ----
  function start() {
    stop();
    if (!B.g.waves || !B.g.waves.director) return;
    bar = el('div', 'survBar', '<div class="svRow"><span class="svWave"></span><span class="svPts"></span></div><div class="svRow two"><span class="svNext"></span><span class="svQuest"></span></div><div class="svBoss" hidden><i></i><b></b></div><div class="svBoons"></div>');
    bar.id = 'survBar';
    wrap.append(bar);
    parts = { wave: bar.querySelector('.svWave'), pts: bar.querySelector('.svPts'), next: bar.querySelector('.svNext'), quest: bar.querySelector('.svQuest'), boss: bar.querySelector('.svBoss'), boons: bar.querySelector('.svBoons') };
    lastKey = ''; choosing = false; seenThemes = new Set();
    update(0, true);
  }
  function stop() { if (bar) bar.remove(); bar = parts = null; choosing = false; }

  function update(now, force) {
    if (!bar) return;
    const g = B.g, h = U.hud(g);
    if (!h) return;
    if (h.choice && !choosing && !g.over && !B.loading) { choose(); force = true; }   // die Anzeige zeigt beim Wählen den Stand von jetzt
    if (!force && now - lastT < 200) return;
    lastT = now;
    const q = h.quest, key = [h.mood, h.powers.length, h.wave, h.theme, h.score, h.phase, Math.ceil(h.nextIn), h.left, q && q.have, q && q.done, h.boons.length, h.boons.reduce((s, b) => s + b.n, 0), h.boss && Math.round(h.boss.hp / h.boss.maxHp * 50), h.boss && h.boss.rage].join('|');
    if (key === lastKey) return;
    lastKey = key;
    parts.wave.innerHTML = h.wave ? `<b>Welle ${h.wave}</b> ${h.theme}${h.mood ? ` <em class="svMood">${h.mood}</em>` : ''}` : '<b>Überleben</b> gleich geht es los';
    parts.pts.innerHTML = `<b>${fmt(h.score)}</b> Punkte${h.mult > 1 ? ` <em>×${String(h.mult).replace('.', ',')}</em>` : ''}`;
    parts.next.textContent = h.phase === 'pause' ? (h.choice ? (h.kind === 'kraft' ? 'Wähle eine Kartenkraft' : 'Wähle einen Segen') : `Nächste: ${h.next} in ${Math.ceil(h.nextIn)} s`) : `Noch ${h.left} ${h.left === 1 ? 'Gegner' : 'Gegner'} · danach: ${h.next}`;
    parts.quest.innerHTML = q ? `<span class="${q.done ? 'ok' : ''}">${q.done ? '✓ ' : ''}${q.name} ${q.done ? '' : `${q.have}/${q.need}`}</span>` : '';
    parts.quest.title = q ? q.text : '';
    parts.boss.hidden = !h.boss;
    if (h.boss) { parts.boss.firstChild.style.width = `${Math.max(0, 100 * h.boss.hp / h.boss.maxHp)}%`; parts.boss.lastChild.textContent = h.boss.rage ? `${h.boss.name} · in Raserei` : h.boss.name; parts.boss.classList.toggle('rage', h.boss.rage); }
    const shown = h.boons.slice(-5);
    parts.boons.innerHTML = h.powers.map(p => `<span class="svBoon kk" title="${p.name}">${ICON.karte}</span>`).join('') + shown.map(b => `<span class="svBoon" title="${b.name}">${icon(b.id)}${b.n > 1 ? `<i>${b.n}</i>` : ''}</span>`).join('') + (h.boons.length > shown.length ? `<span class="svMore">+${h.boons.length - shown.length}</span>` : '');
  }

  // Ereignisse des Laufs: Ansagen, Klänge. Gibt true zurück, wenn das Ereignis hier behandelt ist.
  function onEvent(ev) {
    if (!bar) return false;
    if (ev.t === 'wave') {
      sfx(ev.boss ? 'horn' : 'wake');
      ctx.banner(ev.boss ? `Welle ${ev.n} · ${ev.name}` : `Welle ${ev.n} · ${ev.name}`);
      const key = ev.boss ? 'boss' + ev.name : ev.theme;
      if (ev.boss || !seenThemes.has(key) || ev.elite) { seenThemes.add(key); ctx.toast(`${ev.hint}${ev.elite ? ` Elite: ${U.ELITES[ev.elite].name} – ${U.ELITES[ev.elite].text}.` : ''}`, 3200); }
      return true;
    }
    if (ev.t !== 'surv') return ev.t === 'boon';
    if (ev.k === 'clear') { sfx('coin'); float(`+${fmt(ev.pts)}${ev.fast ? ' · eilig' : ''}${ev.flawless ? ' · makellos' : ''}`); }
    else if (ev.k === 'auftrag') { sfx('bless'); ctx.banner(`Auftrag „${ev.name}“ erfüllt!`); float(`+${fmt(ev.pts)} · Türme geheilt`); }
    else if (ev.k === 'boss') { sfx('win'); ctx.banner('Boss besiegt!'); float(`+${fmt(ev.pts)}`); }
    else if (ev.k === 'zorn') { sfx('horn'); ctx.toast(`${ev.name} gerät in Raserei!`, 2200); }
    else if (ev.k === 'ruf') sfx('wake');
    else if (ev.k === 'elite') sfx('shield');
    else if (ev.k === 'wehr') { sfx('bless'); ctx.banner('Letzte Wehr!'); }
    else if (ev.k === 'laune') { sfx('horn'); ctx.banner(`Feldlaune: ${ev.name}`); ctx.toast(ev.text, 4200); }
    else if (ev.k === 'frost') sfx('frostnacht');
    else if (ev.k === 'bers') sfx('charge');
    else if (ev.k === 'kraft') sfx('rune');
    return true;
  }
  // kleine Punkte-Einblendung an der Punktzahl
  function float(text) {
    if (!bar) return;
    const f = el('span', 'svFloat', text);
    bar.append(f);
    setTimeout(() => f.remove(), 1500);
  }

  // ---- Segen wählen: das Spiel hält an, bis gewählt ist ----
  function choose() {
    const g = B.g, u = g.waves.u;
    if (ctx.auto()) { const o = U.autoPick(g); if (o) ctx.toast(`Segen: ${U.boonName(o)}`, 1200); return; }   // Zeitraffer und Computer-Spieler wählen selbst
    choosing = true; B.paused = true; B.sel = null; B.ghost = null; B.drag = null;
    const draw = () => {
      const ch = u.choice, d = el('div', 'boonPick');
      d.append(el('h3', '', ch.kind === 'kraft' ? 'Kartenkraft' : ch.first ? 'Dein Startsegen' : ch.big ? 'Großer Segen' : 'Wähle einen Segen'));
      d.append(el('p', 'center small', ch.kind === 'kraft' ? 'Der Boss ist gefallen: Eine deiner Karten bekommt für den Rest des Laufs eine besondere Kraft. Jede Karte kann nur eine tragen.' : ch.first ? 'Jeder Lauf beginnt mit einer Wahl. Segen gelten bis zum Ende des Laufs.' : ch.big ? `Bosswelle ${g.waves.n} überstanden – hier sind seltene Segen häufiger.` : `Welle ${g.waves.n} überstanden. Die nächste: ${U.hud(g).next}.`));
      const row = el('div', 'boonRow');
      ch.options.forEach((o, k) => {
        const rar = U.boonRar(o), have = u.boons[o.id] || 0;
        const b = el('button', `boon r${rar}`, `<span class="bIco">${icon(o.id)}</span><span class="bTxt"><b>${U.boonName(o)}${have ? ` <i>${have + 1}. Mal</i>` : ''}</b><small>${U.boonText(g, o)}</small></span><em>${rar === 3 ? 'Wagnis' : U.RAR_NAME[rar]}</em>`);
        b.dataset.k = k;
        b.addEventListener('click', () => { sfx(rar >= 2 ? 'rune' : 'buy'); const got = U.pick(g, k); if (!got) return; if (u.choice) draw(); else done(); });
        row.append(b);
      });
      d.append(row);
      if (u.rerolls > 0 && ch.kind !== 'kraft') { const r = el('button', 'btn rerollBtn', `Neu würfeln <em>${u.rerolls}</em>`); r.addEventListener('click', () => { if (U.reroll(g)) { sfx('flip'); draw(); } }); d.append(r); }
      if (u.order.length) d.append(el('p', 'center small boonHave', `Deine Segen: ${listBoons(u)}`));
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
    d.append(el('div', 'svStats', [['Besiegt', sum.kills], ['Bosse', sum.bosses], ['Elite', sum.elites], ['Aufträge', sum.quests], ['Makellos', sum.flawless], ['Eilig', sum.fast]].map(([k, v]) => `<span><b>${v}</b>${k}</span>`).join('')));
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
    d.append(el('p', 'center small', 'Wellen ohne Ende in Etappen zu fünf: Themen, Elite-Gegner, am Ende ein Boss. Nach jeder zweiten Welle wählst du einen Segen. Schluss ist, wenn dein Hauptturm fällt.'));
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
