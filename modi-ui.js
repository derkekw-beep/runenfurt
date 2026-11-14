// Auswahlseite der Spielmodi (Knopf „Modi“): vier Reiter – Ereignisse (täglich wechselnd), Serien (Herausforderungen),
// Rangliste (Ligen), Bosse. Dazu die Kartenwahl der Dreierwahl und der Großen Auswahl und die Zeilen in der Abrechnung.
// Die Regeln stehen in modi.js; main.js ruft sheet(), book(), result(), again(), dot().
import { CARDS } from './cards.js';
import * as M from './modi.js';

// ctx: { el, fmt, sfx, P, profile(), save(), today(), start(opts), draft(opts), surv(), survOpen(), openSheet, closeSheet, setDismiss, cardEl, art,
//        rewardParts, mileRow, collected, lootSheet, askHelp, untilMidnight(), rnd() }
export function createModiUi(ctx) {
  const { el, fmt, sfx, P } = ctx;
  let tab = 'ereignisse';
  const TABS = { ereignisse: 'Ereignisse', serien: 'Serien', rang: 'Rangliste', bosse: 'Bosse' };
  // Preis als Reihe kleiner Marken; gleiche Belohnungen werden zusammengezählt („3× …“)
  const prize = list => { const n = new Map(); for (const r of list) { const k = JSON.stringify(r); n.set(k, [r, (n.get(k) ? n.get(k)[1] : 0) + 1]); } return [...n.values()].map(([r, k]) => { const pt = ctx.rewardParts(r); return `<span class="prz">${pt.ico}<small>${k > 1 ? `${k}× ` : ''}${pt.short}</small></span>`; }).join(''); };

  // ---- Kampf starten: je nach Modus erst die Kartenwahl ----
  function launch(opts) {
    const p = ctx.profile(), ev = opts.series === 'woche' ? M.seriesInfo(p, 'woche', ctx.today()).mode : opts.series || opts.ranked ? '' : opts.mode, type = M.EVENTS[ev] ? M.EVENTS[ev].deck : 'eigen';
    if (ev === 'ansturm') return ctx.surv();
    const o = opts.series === 'woche' ? { ...opts, mode: ev } : opts;
    if (type === 'wahl') return ctx.draft(o);
    if (type === 'dreier') return tripleDraft(o);
    if (type === 'gross') return megaDraft(o);
    ctx.start(o);
  }
  const go = opts => ctx.askHelp(() => launch(opts));

  // ---- Auswahlseite ----
  function sheet(to) {
    if (to && TABS[to]) tab = to;
    const p = ctx.profile(), day = ctx.today(), d = el('div', 'modes modi');
    d.append(el('h3', '', 'Spielmodi'));
    const seg = el('div', 'seg small modiSeg');
    const dots = { serien: Object.keys(M.SERIES).some(id => { const i = M.seriesInfo(p, id, day); return i.done || i.once.some(o => o.reached && !o.got); }), rang: M.rankOpen(p) && (() => { const r = M.rankInfo(p); return r.once.some(o => o.reached && !o.got) || r.season.some(o => o.reached && !o.got); })(), bosse: P.bossNext(p) >= 0, ereignisse: P.modeBonusOpen(p) || ctx.survOpen() > 0 };
    for (const [k, name] of Object.entries(TABS)) { const b = el('button', k === tab ? 'on' : '', `${name}${dots[k] ? '<span class="dot"></span>' : ''}`); b.dataset.tab = k; seg.append(b); }
    seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.dataset.tab === tab) return; sfx('tab'); sheet(b.dataset.tab); });
    d.append(seg);
    const body = el('div', 'modiBody');
    ({ ereignisse: events, serien: series, rang: rank, bosse: bosses })[tab](body, p, day);
    d.append(body);
    const btns = el('div', 'btns one'), close = el('button', 'btn', 'Schließen');
    close.addEventListener('click', () => { sfx('click'); ctx.closeSheet(); ctx.setDismiss(null); });
    btns.append(close); d.append(btns);
    ctx.setDismiss(() => { ctx.closeSheet(); ctx.setDismiss(null); });
    ctx.openSheet(d, false);
  }

  function events(body, p, day) {
    body.append(el('p', 'center small', `Sonderregeln ohne Trophäen – jeden Tag eine andere Auswahl. Siege zählen als Tagessiege und bringen ${P.MARKS.mode} Furtmarken (die ersten ${P.MARKS.modeWins} am Tag).`));
    const ids = M.eventsToday(day), list = el('div', 'list');
    ids.forEach((id, i) => {
      const E = M.EVENTS[id], top = i === 0;
      const b = el('button', `btn item modeRow${top ? ' dayMode' : ''}`, `<span><b>${E.name}${top ? `<em>${P.modeBonusOpen(p) ? `Heute +${P.MODE_BONUS} <span class="ico gem"></span>` : 'Modus des Tages'}</em>` : ''}</b><small>${E.text}</small>${top ? `<small class="when">Modus des Tages · wechselt in ${ctx.untilMidnight()}</small>` : ''}</span><i></i>`);
      b.dataset.mode = id;
      b.addEventListener('click', () => { sfx('click'); go({ mode: id }); });
      list.append(b);
    });
    body.append(list);
    body.append(el('div', 'sub', '<b>Immer offen</b><span></span>'));
    const more = el('div', 'list'), n = ctx.survOpen();
    const sv = el('button', 'btn item modeRow survRow', `<span><b>Überleben${n ? `<em class="ok">${n} abholbereit</em>` : `<em>Bestleistung: Welle ${p.surv.best}</em>`}</b><small>${M.EVENTS.ansturm.text}</small></span><i></i>`);
    sv.dataset.mode = 'ansturm';
    sv.addEventListener('click', () => { sfx('click'); ctx.surv(); });
    const tr = el('button', 'btn item modeRow', '<span><b>Übungskampf</b><small>Ein normaler Kampf, der nicht zählt – zum Ausprobieren neuer Decks.</small></span><i></i>');
    tr.dataset.mode = 'uebung';
    tr.addEventListener('click', () => { sfx('click'); ctx.askHelp(() => ctx.start({ training: true })); });
    more.append(sv, tr); body.append(more);
    body.append(el('p', 'center small', `Morgen wieder dabei: ${M.EVENT_IDS.filter(id => !ids.includes(id) && id !== 'ansturm').slice(0, 4).map(id => M.EVENTS[id].name).join(', ')} …`));
  }

  function series(body, p, day) {
    body.append(el('p', 'center small', `Herausforderungen als Serie: bis ${M.SERIES_WINS} Siege – nach der ${M.SERIES_LOSSES}. Niederlage ist Schluss. Mit jedem Sieg wächst der Preis; die Gegner werden stärker.`));
    for (const id of ['woche', 'klassisch', 'gross']) {
      const i = M.seriesInfo(p, id, day), box = el('div', `serie${i.run ? ' on' : ''}${i.done ? ' done' : ''}${id === 'woche' ? ' week' : ''}`);
      box.dataset.series = id;
      box.append(el('b', 'sTitle', i.name), el('small', '', id === 'woche' ? `${M.EVENTS[i.mode].text} ${i.text}` : i.text));
      if (i.run) {
        box.append(el('div', 'sPips', `<span class="wins">${Array.from({ length: M.SERIES_WINS }, (_, k) => `<i class="${k < i.wins ? 'on' : ''}"></i>`).join('')}</span><span class="losses">${Array.from({ length: M.SERIES_LOSSES }, (_, k) => `<i class="${k < i.losses ? 'on' : ''}"></i>`).join('')}</span>`));
        box.append(el('div', 'sLine', `<span>${i.wins} ${i.wins === 1 ? 'Sieg' : 'Siege'} · ${i.losses} ${i.losses === 1 ? 'Niederlage' : 'Niederlagen'}</span><span>Preis jetzt:</span>`), el('div', 'sPrize', prize(i.prize)));
        if (i.next) box.append(el('div', 'sLine dim', '<span>Nach dem nächsten Sieg:</span>'), el('div', 'sPrize dim', prize(i.next)));
      } else box.append(el('div', 'sLine', `<span>Hauptpreis bei ${M.SERIES_WINS} Siegen:</span>${i.best ? `<span>Bestleistung: ${i.best}</span>` : ''}`), el('div', 'sPrize', prize(i.top)));
      if (i.once.length) {
        const row = el('div', 'sOnce');
        for (const o of i.once) {
          const pt = ctx.rewardParts(o.r), b = el('button', `once${o.got ? ' got' : o.reached ? ' can' : ''}`, `<small>${o.at} Siege</small>${pt.ico}<em>${o.got ? '✓' : pt.short}</em>`);
          b.disabled = !o.reached || o.got;
          b.addEventListener('click', () => { const loot = M.weekClaim(p, o.at, day, P.grantReward); if (!loot) return; ctx.save(); ctx.collected(b, loot, 'Wochenereignis'); if (!loot.box) sheet('serien'); });
          row.append(b);
        }
        box.append(el('div', 'sLine', '<span>Einmalige Belohnungen dieser Woche:</span>'), row);
      }
      const btns = el('div', 'sBtns');
      if (!i.run) {
        const b = el('button', 'btn primary', i.fee ? `Antreten <span class="ico gem"></span>${i.fee}` : 'Antreten · frei');
        b.disabled = !i.can;
        b.addEventListener('click', () => { if (!M.seriesEnter(p, id, day)) { sfx('error'); return; } ctx.save(); sfx('buy'); ctx.render(); sheet('serien'); });
        btns.append(b);
        if (!i.can) box.append(el('small', 'lackGems', `Dir fehlen ${i.fee - p.gems} Runensplitter.`));
      } else if (i.done) {
        const b = el('button', 'btn primary', 'Preis abholen');
        b.addEventListener('click', () => claim(id, b));
        btns.append(b);
      } else {
        const f = el('button', 'btn primary', i.wins + i.losses ? 'Weiterkämpfen' : 'Erster Kampf'), q = el('button', 'btn', 'Beenden');
        f.addEventListener('click', () => { sfx('click'); go({ mode: id === 'woche' ? i.mode : id, series: id }); });
        q.addEventListener('click', () => claim(id, q));
        btns.append(q, f);
      }
      box.append(btns);
      body.append(box);
    }
  }
  // Serie abrechnen: alle Belohnungen des erreichten Preises gutschreiben und zusammen zeigen
  function claim(id, src) {
    const p = ctx.profile(), got = M.seriesClaim(p, id, ctx.today(), P.grantReward);
    if (!got) return;
    ctx.save(); sfx('chest'); ctx.render();
    const d = el('div', 'serieLoot');
    d.append(el('h3', '', 'Dein Preis'));
    for (const g of got) {
      const pt = ctx.rewardParts(g.r), l = g.loot, parts = [];
      if (l.gold) parts.push(`${fmt(l.gold)} Gold`);
      if (l.gems) parts.push(`${l.gems} Runensplitter`);
      for (const c of l.cards || []) parts.push(`${CARDS[c.id].name} × ${c.n}`);
      for (const s of l.shards || []) parts.push(`${s.n} Runenscherben (${CARDS[s.id].name})`);
      if (l.wild) parts.push(`${l.wild} Wanderscherbe${l.wild > 1 ? 'n' : ''}`);
      if (l.hero) parts.push(`${l.hero} Heldenmünzen`);
      if (l.jk) for (const [r, n] of Object.entries(l.jk)) if (n) parts.push(`${n} Joker (${P.RARITY_NAME[r] || r})`);
      if (l.potions) parts.push(`${l.potions} Stärkungstrank`);
      d.append(el('div', 'lootRow', `${pt.ico}<span><b>${pt.name}</b><small>${parts.join(' · ') || 'gutgeschrieben'}</small></span>`));
    }
    const row = el('div', 'btns one'), ok = el('button', 'btn primary', 'Weiter');
    ok.addEventListener('click', () => { sfx('click'); sheet('serien'); });
    row.append(ok); d.append(row);
    ctx.setDismiss(null);
    ctx.openSheet(d, true);
    void src;
  }

  function rank(body, p) {
    const r = M.rankInfo(p);
    if (!r.open) {
      const a = P.ARENAS[M.RANK_ARENA];
      body.append(el('div', 'chestCard', `<span class="ico trophy huge"></span><p class="center">Die Rangliste öffnet sich in <b>Arena ${M.RANK_ARENA + 1} (${a.name})</b> – ab ${fmt(a.at)} Trophäen.</p><p class="center small">Dort steigst du Stufe um Stufe durch sieben Ligen: Ein Sieg bringt dich eine Stufe hinauf, eine Niederlage eine hinab. Goldene Stufen halten dich.</p>`));
      return;
    }
    const box = el('div', `league l${r.league}`);
    box.append(el('div', 'lgHead', `<span class="lgBadge"><b>${r.league + 1}</b></span><span><b>${r.name}</b><small>${P.seasonName(p.season.id)} · ${r.w} Siege, ${r.l} Niederlagen</small></span>`));
    if (r.top) box.append(el('div', 'lgRating', `<b>${fmt(r.rating)}</b><span>Wertung – jeder Kampf zählt</span>`));
    else {
      box.append(el('div', 'lgSteps', r.golden.map((g, i) => `<i class="${i < r.step ? 'done' : ''}${i === r.step ? ' here' : ''}${g ? ' gold' : ''}"></i>`).join('') + '<i class="goal"></i>'));
      box.append(el('small', '', `Stufe ${r.step} von ${r.steps} · ${r.golden[r.step] ? 'du stehst sicher (goldene Stufe)' : 'eine Niederlage kostet eine Stufe'}${r.boost > 1 ? ` · Rückenwind: jeder Sieg bringt ${r.boost} Stufen, bis du wieder in der ${M.LEAGUES[r.last].name} bist` : ''}`));
    }
    const b = el('button', 'btn primary wide', 'Ranglistenkampf');
    b.addEventListener('click', () => { sfx('click'); go({ mode: 'rang', ranked: true }); });
    box.append(b);
    body.append(box);
    body.append(el('p', 'center small', 'Ohne Trophäen. Sieg: eine Stufe hinauf. Niederlage: eine hinab – nie aus der Liga heraus. Am Monatsanfang beginnen alle wieder unten.'));
    body.append(el('div', 'sub', '<b>Ligen und Belohnungen</b><span>einmalig · je Saison</span>'));
    const list = el('div', 'survList lgList');
    M.LEAGUES.forEach((L, i) => {
      const once = r.once.find(o => o.league === i), sea = r.season.find(o => o.league === i);
      list.append(el('div', `lgName${i === r.league ? ' here' : ''}`, `<b>${i + 1}. ${L.name}</b><small>${L.steps ? `${L.steps} Stufen${L.gold ? ` · jede ${L.gold}. golden` : ''}` : 'Wertung statt Stufen'}</small>`));
      if (once) list.append(ctx.mileRow('einmalig', once.r, once.reached, once.got, p.arena, btn => { const loot = M.rankClaim(p, 'once', i, P.grantReward); if (loot) { ctx.collected(btn, loot, L.name); if (!loot.box) sheet('rang'); } }));
      list.append(ctx.mileRow('Saison', sea.r, sea.reached, sea.got, p.arena, btn => { const loot = M.rankClaim(p, 'season', i, P.grantReward); if (loot) { ctx.collected(btn, loot, L.name); if (!loot.box) sheet('rang'); } }));
    });
    body.append(list);
  }

  function bosses(body, p) {
    body.append(el('p', 'center small', `Je Arena ein Wächter mit festem Deck und einer Verstärkung. ${p.bosses.length} von ${P.BOSSES.length} besiegt.`));
    const list = el('div', 'list');
    P.BOSSES.forEach((b, i) => {
      if (i > p.arena + 1) return;
      const open = P.bossOpen(p, i), won = p.bosses.includes(i);
      const r = el('button', `btn item bossRow${won ? ' won' : ''}${open ? '' : ' shut'}`, `<span><b>${b.name}${won ? '<em class="ok">besiegt</em>' : open ? `<em>+${P.BOSS_REWARD.gems} <span class="ico gem"></span></em>` : ''}</b><small>${open ? `Arena ${i + 1} · ${P.ARENAS[i].name} – ${b.text}` : `Wartet in Arena ${i + 1} (${P.ARENAS[i].name}, ${P.ARENAS[i].at} Trophäen).`}</small></span><i></i>`);
      r.dataset.boss = i; r.disabled = !open;
      r.addEventListener('click', () => { sfx('click'); ctx.askHelp(() => ctx.start({ boss: i })); });
      list.append(r);
    });
    body.append(list);
  }

  // ---- Dreierwahl: acht Mal eine aus drei ----
  function tripleDraft(opts) {
    const rnd = ctx.rnd(), sets = M.tripleSets(rnd), picks = [];
    for (const t of [...sets.mine, ...sets.foe]) for (const id of t) ctx.art(id);
    const step = () => {
      const i = picks.length, d = el('div', 'draft');
      if (i === 8) {
        const [mine, foe] = M.tripleDecks(sets, picks, rnd);
        d.append(el('h3', '', 'Dein Deck'), el('p', 'center small', 'Acht gewählt. Was dein Gegner genommen hat, zeigt erst der Kampf. Gleiche Stufe für beide.'));
        const grid = el('div', 'grid'); for (const id of mine) grid.append(ctx.cardEl(id, { tag: 'div' })); d.append(grid);
        const row = el('div', 'btns'), back = el('button', 'btn', 'Abbrechen'), start = el('button', 'btn primary', 'Los geht’s');
        back.addEventListener('click', () => { sfx('click'); sheet(); });
        start.addEventListener('click', () => { sfx('click'); ctx.start({ ...opts, decks: [mine, foe] }); });
        row.append(back, start); d.append(row);
      } else {
        d.append(el('h3', '', 'Dreierwahl'), el('p', 'center', `Runde ${i + 1} von 8 – nimm eine Karte. Die anderen beiden verfallen.`));
        const row = el('div', 'draftRow three');
        sets.mine[i].forEach((id, k) => {
          const b = el('button', 'draftPick');
          b.append(ctx.cardEl(id, { tag: 'div' }), el('small', '', CARDS[id].role));
          b.addEventListener('click', () => { sfx('click'); picks.push(k); step(); });
          row.append(b);
        });
        d.append(row);
        const foe = el('div', 'thumbs foeThumbs'); for (const id of sets.foe[i]) foe.append(ctx.cardEl(id, { tag: 'div' }));
        d.append(el('p', 'center small', 'Dein Gegner wählt gerade aus:'), foe);
        if (i) { const got = el('div', 'thumbs'); picks.forEach((k, j) => got.append(ctx.cardEl(sets.mine[j][k], { tag: 'div' }))); d.append(el('p', 'center small', 'Bisher gewählt:'), got); }
        const row2 = el('div', 'btns one'), back = el('button', 'btn', 'Abbrechen');
        back.addEventListener('click', () => { sfx('click'); sheet(); });
        row2.append(back); d.append(row2);
      }
      ctx.setDismiss(null); ctx.openSheet(d, true);
    };
    step();
  }

  // ---- Große Auswahl: 36 offene Karten, abwechselnd ----
  function megaDraft(opts) {
    const rnd = ctx.rnd(), pool = M.megaPool(rnd), order = M.megaOrder(rnd() < 0.5), decks = [[], []], taken = [];
    for (const id of pool) ctx.art(id);
    let timer = 0, alive = true;
    const turn = () => order[taken.length];
    const take = (side, id) => { decks[side].push(id); taken.push(id); };
    const draw = () => {
      if (!alive) return;
      const done = taken.length >= order.length, d = el('div', 'draft mega');
      const mineTurn = !done && turn() === 0, left = done ? 0 : order.slice(taken.length).findIndex(s => s !== turn());
      d.append(el('h3', '', done ? 'Dein Deck' : 'Große Auswahl'));
      d.append(el('p', 'center megaTurn' + (mineTurn ? ' me' : ''), done ? 'Beide Decks stehen. Gleiche Stufe für beide.' : mineTurn ? `Du bist dran – wähle ${left < 0 || left > 1 ? 'zwei Karten' : 'eine Karte'}.` : 'Dein Gegner wählt …'));
      const rows = el('div', 'megaDecks');
      for (const s of [0, 1]) { const r = el('div', `megaDeck s${s}`); r.append(el('small', '', s === 0 ? `Du (${decks[0].length}/8)` : `Gegner (${decks[1].length}/8)`)); const t = el('div', 'thumbs'); for (const id of decks[s]) t.append(ctx.cardEl(id, { tag: 'div', rune: null })); r.append(t); rows.append(r); }
      d.append(rows);
      if (!done) {
        const grid = el('div', 'grid megaGrid');
        for (const id of pool) {
          const side = decks[0].includes(id) ? 0 : decks[1].includes(id) ? 1 : -1, c = ctx.cardEl(id, { rune: null });
          if (side >= 0) { c.classList.add('gone', `s${side}`); c.disabled = true; }
          else if (!mineTurn || (CARDS[id].hero && decks[0].filter(x => CARDS[x].hero).length >= 2)) c.disabled = true;
          else c.addEventListener('click', () => { sfx('click'); take(0, id); advance(); });
          grid.append(c);
        }
        d.append(grid);
      }
      const row = el('div', done ? 'btns' : 'btns one'), back = el('button', 'btn', 'Abbrechen');
      back.addEventListener('click', () => { sfx('click'); alive = false; clearTimeout(timer); sheet(); });
      row.append(back);
      if (done) { const start = el('button', 'btn primary', 'Los geht’s'); start.addEventListener('click', () => { sfx('click'); alive = false; ctx.start({ ...opts, decks: [decks[0], decks[1]] }); }); row.append(start); }
      d.append(row);
      const keep = document.querySelector('#sheet') ? document.querySelector('#sheet').scrollTop : 0;
      ctx.setDismiss(null); ctx.openSheet(d, false);
      document.querySelector('#sheet').scrollTop = keep;
    };
    const advance = () => {
      draw();
      if (taken.length < order.length && turn() === 1) timer = setTimeout(() => { if (!alive) return; take(1, M.megaAiPick(pool, taken, decks[1], rnd)); sfx('flip'); advance(); }, ctx.fast() ? 30 : 650);
    };
    advance();
  }

  // ---- nach dem Kampf ----
  // Ergebnis in Serie oder Rangliste verbuchen (vor dem Speichern)
  function book(opts, winner) {
    const p = ctx.profile();
    if (opts.series) return { series: M.seriesResult(p, opts.series, winner, ctx.today()), id: opts.series };
    if (opts.ranked) return { rank: M.rankResult(p, winner), info: M.rankInfo(p) };
    return null;
  }
  function result(box, r) {
    if (!r) return;
    if (r.series) {
      const i = r.series, d = el('div', 'serie on result');
      d.append(el('b', 'sTitle', i.name));
      d.append(el('div', 'sPips', `<span class="wins">${Array.from({ length: M.SERIES_WINS }, (_, k) => `<i class="${k < i.wins ? 'on' : ''}"></i>`).join('')}</span><span class="losses">${Array.from({ length: M.SERIES_LOSSES }, (_, k) => `<i class="${k < i.losses ? 'on' : ''}"></i>`).join('')}</span>`));
      d.append(el('div', 'sLine', `<span>${i.done ? (i.wins >= M.SERIES_WINS ? 'Zwölf Siege – Serie gewonnen!' : 'Dritte Niederlage – die Serie ist zu Ende.') : `${i.wins} ${i.wins === 1 ? 'Sieg' : 'Siege'} · ${i.losses} ${i.losses === 1 ? 'Niederlage' : 'Niederlagen'}`}</span><span>Preis:</span>`), el('div', 'sPrize', prize(i.prize)));
      if (i.once.some(o => o.reached && !o.got)) d.append(el('small', '', 'Eine einmalige Belohnung wartet unter „Modi“ → Serien.'));
      box.append(d);
    } else if (r.rank) {
      const k = r.rank, f = r.info, d = el('div', `league l${k.league} result`);
      d.append(el('div', 'lgHead', `<span class="lgBadge"><b>${k.league + 1}</b></span><span><b>${f.name}</b><small>${k.up ? 'Aufgestiegen!' : f.top ? `Wertung ${fmt(k.before.rating)} → ${fmt(k.rating)}` : k.step > k.before.step ? `${k.step - k.before.step === 1 ? 'Eine Stufe' : `${k.step - k.before.step} Stufen`} hinauf` : k.held ? 'Die Stufe hält – du stehst sicher' : k.step < k.before.step ? 'Eine Stufe hinab' : 'Unentschieden: die Stufe bleibt'}</small></span>`));
      if (!f.top) d.append(el('div', 'lgSteps', f.golden.map((g, i) => `<i class="${i < f.step ? 'done' : ''}${i === f.step ? ' here' : ''}${g ? ' gold' : ''}"></i>`).join('') + '<i class="goal"></i>'));
      if (k.up && f.once.some(o => o.league === k.league && !o.got)) d.append(el('small', '', 'Eine Belohnung für die neue Liga wartet unter „Modi“ → Rangliste.'));
      box.append(d);
    }
  }
  // „Nochmal“ nach einem Kampf im Modus
  function again(opts) {
    const p = ctx.profile();
    if (opts.series) { const i = M.seriesInfo(p, opts.series, ctx.today()); if (!i.run || i.done) { ctx.home(); sheet('serien'); return; } }
    const { decks, ...rest } = opts; void decks;
    const ev = opts.series === 'woche' ? M.seriesInfo(p, 'woche', ctx.today()).mode : opts.mode, type = M.EVENTS[ev] ? M.EVENTS[ev].deck : 'eigen';
    if (type === 'wahl' || type === 'dreier' || type === 'gross') { ctx.home(); launch(rest); } else ctx.start(rest);
  }
  const dot = () => { const p = ctx.profile(); return P.modeBonusOpen(p) || P.bossNext(p) >= 0 || M.openCount(p, ctx.today()) > 0 || ctx.survOpen() > 0; };

  return { sheet, launch, book, result, again, dot };
}
