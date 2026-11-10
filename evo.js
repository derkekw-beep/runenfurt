// Runenformen der zweiten Gruppe (2026-11-10): die übrigen Evolutionen des Vorbilds. Ihre Regeln stehen als Felder an der
// Runen-Einheit (cards.js) oder am Runen-Zauber (RUNES[id].spell); hier steht, was diese Felder im Kampf tun.
// Der Spielkern (sim.js) ruft evoTick, evoWorld, evoShot, evoImpact, evoStrike, evoHurt und evoDeath an wenigen Stellen auf.
// Quelle der Werte: Wiki-Seiten „<Karte>/Evolution“ (tools/abgleich/evo-details.txt); was dort fehlt, ist in
// VORBILD-ABGLEICH.md als „angesetzt“ vermerkt.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fwd = side => (side === 0 ? -1 : 1);
const edge = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
const alive = e => e && e.hp > 0;
const foe = (u, e) => e.side !== u.side && e.hp > 0 && !e.hidden && !(e.digT > 0);

// Fläche, die eine Weile liegen bleibt (Funken, Gift, Frost, Sog, Antrieb): eine Zone wie die eines Zaubers, mit eigener Regel
function field(api, g, side, x, y, def, lvl, delay = 0) {
  api.zoneAt(g, side, x, y, def, lvl, delay);
}

// ---- je Takt und Figur -------------------------------------------------------------------------
// Gibt true zurück, wenn die Figur in diesem Takt nichts weiter tun darf (im Zwinger gefangen).
export function evoTick(api, g, u, dt) {
  if (u.cagedBy) { // Wolfszwinger: gefangen, bis der Zwinger fällt
    const c = g.byId.get(u.cagedBy);
    if (alive(c)) { u.stunT = Math.max(u.stunT, 0.2); u.inRange = false; u.hidden = true; return true; }
    u.cagedBy = 0; u.hidden = false; u.y = api.offRiver(u.y); u.ox = u.x; u.oy = u.y;
  }
  if (u.gustT > 0) u.gustT -= dt;
  if (u.veilT > 0) u.veilT -= dt;
  if (u.venom) { // Gift des Blasrohrwichts: schadet allem um den Vergifteten, je mehr Pfeile, desto stärker
    const v = u.venom;
    v.tick -= dt;
    if (v.tick <= 1e-9) { v.tick += 0.5; const row = v.def.levels.filter(([n]) => v.n >= n).pop(); api.areaDamage(g, v.side, u.x, u.y, v.def.r, Math.round(row[1] * 0.5 * v.mult), true, v.def.towerF); api.emit(g, { t: 'aura', x: u.x, y: u.y, r: v.def.r, dur: 0.5, kind: 'gift' }); }
    if (u.kind !== 'unit') { v.t -= dt; if (v.t <= 0) u.venom = null; }   // an Gebäuden und Türmen hält es nur kurz
  }
  const d = u.d;
  if (!d.rune) return false;
  const m = api.cardMult(u.lvl);
  if (u.ghost && u.home) { // Geist des Trommelschlägers: vergeht kurz nachdem er den Kreis seiner Trommel verlässt
    u.awayT = Math.hypot(u.x - u.home.x, u.y - u.home.y) > u.home.r ? (u.awayT || 0) + dt : 0;
    if (u.awayT > 0.5) { api.die(g, u); return true; }
  }
  if (d.glide && !u.landed && u.hp < u.maxHp) land(api, g, u);
  if (d.hop && (u.hopN || 0) < d.hop.length && u.hp > 0 && u.hp <= u.maxHp * d.hop[u.hopN || 0].at) hop(api, g, u);
  if (d.gust) gustAt(api, g, u.side, u.x, u.y, d.gust, u);
  if (d.drain) { // Dornenkoloss: Welle, die gegnerische Truppen eine Stufe kostet
    u.drainT = (u.drainT ?? d.drain.first) - dt;
    if (u.drainT <= 0) {
      u.drainT += d.drain.every;
      for (const e of g.ents) {
        if (!foe(u, e) || e.kind !== 'unit' || e.lvl <= 1 || Math.hypot(e.x - u.x, e.y - u.y) - e.r > d.drain.r) continue;
        e.lvl--; e.maxHp = Math.round(e.maxHp / 1.1); e.hp = Math.max(1, Math.round(e.hp / 1.1)); e.dmg = Math.round(e.dmg / 1.1);
      }
      api.emit(g, { t: 'burst', x: u.x, y: u.y, r: d.drain.r, side: u.side });
    }
  }
  if (d.net) { // Splitterjäger: Netz auf die nächste Truppe
    u.netT = (u.netT ?? 0) - dt;
    if (u.netT <= 0) {
      let best = null, bd = d.net.range;
      for (const e of g.ents) { if (!foe(u, e) || e.kind !== 'unit') continue; const dd = edge(u, e); if (dd <= bd) { bd = dd; best = e; } }
      if (best) {
        u.netT = d.net.every; api.stun(best, d.net.dur);
        if (best.air) { best.air = false; best.groundT = d.net.dur; }
        api.emit(g, { t: 'chain', from: u.model, side: u.side, x: u.x, y: u.y, air: false, hits: [{ x: best.x, y: best.y, air: best.air }] });
      } else u.netT = 0;
    }
  }
  if (d.spear) { // Sturmbrüder: Speerwurf auf Bodentruppen in mittlerer Entfernung, dahinter eine Antriebsspur
    u.spearT = (u.spearT ?? 0) - dt;
    if (u.spearT <= 0) {
      let best = null, bd = Infinity;
      for (const e of g.ents) { if (!foe(u, e) || e.kind !== 'unit' || e.air) continue; const dd = edge(u, e); if (dd >= d.spear.min && dd <= d.spear.max && dd < bd) { bd = dd; best = e; } }
      if (best) {
        u.spearT = d.spear.cd;
        const dx = best.x - u.x, dy = best.y - u.y, L = Math.hypot(dx, dy) || 1;
        for (let k = 0; k <= L; k += 1) field(api, g, u.side, u.x + dx / L * k, u.y + dy / L * k, d.spear.trail, u.lvl);
        api.emit(g, { t: 'chain', from: u.model, side: u.side, x: u.x, y: u.y, air: false, hits: [{ x: best.x, y: best.y, air: false }] });
        api.damage(g, best, Math.round(d.spear.dmg * m), u.side, u);
      } else u.spearT = 0;
    }
  }
  if (d.cage) { // Wolfszwinger: zieht eine Bodentruppe hinein und schlägt sie im Takt
    let c = u.captive ? g.byId.get(u.captive) : null;
    if (!alive(c) || c.cagedBy !== u.id) c = null;
    if (!c) {
      let bd = d.cage.r;
      for (const e of g.ents) { if (!foe(u, e) || e.kind !== 'unit' || e.air || e.cagedBy || e.ghost) continue; const dd = edge(u, e); if (dd <= bd) { bd = dd; c = e; } }
      if (c) { c.cagedBy = u.id; c.hidden = true; u.captive = c.id; u.cageT = d.cage.atk; c.charging = false; c.runT = 0; c.targetId = 0; api.emit(g, { t: 'hookcast', x: u.x, y: u.y, tx: c.x, ty: c.y }); }
    }
    if (c) {
      c.x = u.x; c.y = u.y; c.ox = c.x; c.oy = c.y;
      u.cageT -= dt;
      if (u.cageT <= 1e-9) { u.cageT += d.cage.atk; u.anim = 0.3; api.emit(g, { t: 'hit', from: 'zwingerwolf', x: u.x, y: u.y }); api.damage(g, c, Math.round(d.cage.dmg * m), u.side); }
    }
  }
  if (d.chargeHit) { // Stammläufer: wer dem Anlauf im Weg steht, wird getroffen und weggestoßen
    if (!u.charging) u.rammed = null;
    else for (const e of g.ents) {
      if (!foe(u, e) || e.kind !== 'unit' || e.air || (u.rammed && u.rammed.has(e.id)) || edge(u, e) > 0.15) continue;
      (u.rammed ||= new Set()).add(e.id);
      if (api.canKnock(e)) api.push(e, e.x - u.x, e.y - u.y, d.chargeHit.knock);
      api.damage(g, e, Math.round(d.chargeHit.dmg * m), u.side, u);
      api.emit(g, { t: 'impact', x: e.x, y: e.y });
    }
  }
  if (d.barrage && !u.barraged) { // Steinschleuder: nach dem Aufstellen regnet es neun Kugeln in zwei Reihen
    u.barraged = true;
    const b = d.barrage, f = fwd(u.side), far = f < 0 ? api.RIVER_TOP - b.off : api.RIVER_BOT + b.off, near = f < 0 ? api.RIVER_BOT + b.off : api.RIVER_TOP - b.off;
    const row = (n, y) => { for (let i = 0; i < n; i++) api.blastAt(g, u.side, api.W * (i + 0.5) / n, y, b.r, b.delay + i * 0.08, { dmg: Math.round(b.dmg * m), tf: b.towerF, knock: b.knock }); };
    row(5, far); row(4, near);
  }
  return false;
}

function land(api, g, u) { // Keilerrotte: die Flieger fallen zu Boden und schlagen ein
  u.landed = true; u.air = false; u.y = api.offRiver(u.y); u.oy = u.y; u.rt = null;
  api.emit(g, { t: 'impact', x: u.x, y: u.y, r: u.d.glide.r });
  api.areaDamage(g, u.side, u.x, u.y, u.d.glide.r, Math.round(u.d.glide.dmg * api.cardMult(u.lvl)), false, 1);
}

function hop(api, g, u) { // Maulwurfshügel: taucht ab, lässt Wichte zurück und kommt eine Vierteldrehung um den Turm wieder hoch
  const h = u.d.hop[u.hopN || 0];
  u.hopN = (u.hopN || 0) + 1;
  for (let i = 0; i < h.leave; i++) api.spawn(g, 'wicht', u.side, clamp(u.x + (i - (h.leave - 1) / 2) * 0.7, 0.4, api.W - 0.4), u.y, { deployT: 0.5, first: 0.4 }, u.lvl);
  let t = null, bd = 3.6;
  for (const e of g.ents) { if (e.side === u.side || e.kind !== 'tower' || e.hp <= 0) continue; const dd = Math.hypot(e.x - u.x, e.y - u.y); if (dd <= bd) { bd = dd; t = e; } }
  if (t) {
    const dx = u.x - t.x, dy = u.y - t.y, ok = (x, y) => x >= 0.5 && x <= api.W - 0.5 && y >= 0.5 && y <= api.H - 0.5 && api.offRiver(y) === y;
    const [nx, ny] = ok(t.x - dy, t.y + dx) ? [t.x - dy, t.y + dx] : ok(t.x + dy, t.y - dx) ? [t.x + dy, t.y - dx] : [u.x, u.y];
    u.x = nx; u.y = ny; u.ox = nx; u.oy = ny;
  }
  u.digT = h.dig ?? 1; u.hidden = true; u.inRange = false; u.targetId = 0;
  api.emit(g, { t: 'rise', side: u.side, x: u.x, y: u.y });
}

// Windfeld des Nebelrochens: bremst Gegner, treibt Eigene beim Laufen an
function gustAt(api, g, side, x, y, G, self) {
  for (const e of g.ents) {
    if (e === self || e.kind !== 'unit' || e.hp <= 0 || Math.abs(e.x - x) > G.w / 2 || Math.abs(e.y - y) > G.h / 2) continue;
    if (e.side !== side) api.snare(e, 0.3, G.slow); else { e.gustT = 0.3; e.gustF = G.fast; }
  }
}

// ---- einmal je Takt für das ganze Feld ---------------------------------------------------------
export function evoWorld(api, g, dt) {
  if (g.gusts && g.gusts.length) { for (const w of g.gusts) { w.t -= dt; gustAt(api, g, w.side, w.x, w.y, w.G, null); } g.gusts = g.gusts.filter(w => w.t > 0); }
  if (g.arcs && g.arcs.length) { // Gewitterrochen: der Blitz springt weiter, solange zwei Gegner nah genug beieinander stehen
    for (const a of g.arcs) {
      a.t -= dt;
      if (a.t > 1e-9) continue;
      const cur = g.byId.get(a.at);
      let best = null, bd = a.def.r;
      if (alive(cur)) for (const e of g.ents) { if (e === cur || e.side === a.side || e.hp <= 0 || e.hidden || e.kind === 'tower' || e.ghost) continue; const dd = Math.hypot(e.x - cur.x, e.y - cur.y) - e.r; if (dd <= bd) { bd = dd; best = e; } }
      if (!best || ++a.n > a.def.max) { a.done = true; continue; }
      a.t += a.def.every; a.at = best.id;
      api.emit(g, { t: 'chain', from: 'gewitterrochen', side: a.side, x: cur.x, y: cur.y, air: cur.air, hits: [{ x: best.x, y: best.y, air: best.air }] });
      api.damage(g, best, Math.round(a.def.dmg * a.mult), a.side);
    }
    g.arcs = g.arcs.filter(a => !a.done);
  }
}

// ---- Geschosse ---------------------------------------------------------------------------------
// Was ein Schuss dieser Einheit mitbringt (null: nichts Besonderes)
export function evoShot(u) {
  const d = u.d;
  if (d.spark) return { spark: d.spark };
  if (d.bounce) return { bounce: d.bounce.n, step: d.bounce.step };
  if (d.venom) return { venom: d.venom };
  if (d.frostShot) { u.shotN = (u.shotN || 0) + 1; return u.shotN % d.frostShot.every === 1 ? { frost: d.frostShot } : null; }
  return null;
}
// Beim Einschlag eines Geschosses (t: das Ziel, falls es noch lebt)
export function evoImpact(api, g, p, t) {
  const E = p.evo, lvl = p.lvl || 1;
  if (E.spark) { // Knallfrosch: am Zerplatzen ein großes Funkenfeld, am Ende jeder Kernbahn ein kleines
    const s = E.spark, bx = p.tx - p.sx, by = p.ty - p.sy, a0 = Math.atan2(by, bx), nb = p.burst.n || 1;
    field(api, g, p.side, p.tx, p.ty, { ...s.zone, radius: s.big.r, dur: s.big.dur }, lvl);
    for (let i = 0; i < nb; i++) { const a = a0 + (i - (nb - 1) / 2) * (p.burst.fan || 0); field(api, g, p.side, clamp(p.tx + Math.cos(a) * p.burst.len, 0, api.W), clamp(p.ty + Math.sin(a) * p.burst.len, 0, api.H), { ...s.zone, radius: s.small.r, dur: s.small.dur }, lvl, p.burst.len / (p.burst.speed || 13)); }
  }
  if (E.bounce > 0) { // Zündler: die Bombe springt in gerader Linie weiter und trifft niemanden zweimal
    const bx = p.tx - p.sx, by = p.ty - p.sy, L = Math.hypot(bx, by) || 1;
    g.projs.push({ ...p, done: false, x: p.tx, y: p.ty, ox: p.tx, oy: p.ty, sx: p.tx, sy: p.ty, tx: clamp(p.tx + bx / L * E.step, 0.3, api.W - 0.3), ty: clamp(p.ty + by / L * E.step, 0.3, api.H - 0.3), targetId: 0, evo: { ...E, bounce: E.bounce - 1 } });
  }
  if (E.venom && alive(t)) { // Blasrohrwicht: jeder Pfeil vergiftet stärker
    const n = (t.venom ? t.venom.n : 0) + 1;
    t.venom = { side: p.side, def: E.venom, n, mult: api.cardMult(lvl), tick: t.venom ? t.venom.tick : 0.5, t: E.venom.dur };
  }
  if (E.frost) { // Weitschützin: der Frostpfeil bremst alles im weiten Umkreis
    for (const e of g.ents) if (e.side !== p.side && e.kind === 'unit' && e.hp > 0 && Math.hypot(e.x - p.tx, e.y - p.ty) <= E.frost.r + e.r) e.slowT = Math.max(e.slowT, E.frost.slow);
    api.emit(g, { t: 'aura', x: p.tx, y: p.ty, r: E.frost.r, dur: 0.6, kind: 'frost' });
  }
}

// ---- Schlag, Schaden, Tod ----------------------------------------------------------------------
// Nach jedem Schlag einer Runenform (cloaked: sie schlug aus der Unsichtbarkeit zu)
export function evoStrike(api, g, u, t, cloaked) {
  const d = u.d, m = api.cardMult(u.lvl);
  if (d.glide && !u.landed) land(api, g, u);
  if (d.multiply) { // Kieseltrio: jeder Schlag ruft einen weiteren, bis acht beisammen sind
    let n = 0; for (const e of g.ents) if (e.hp > 0 && e.side === u.side && e.pack === u.pack && e.type === u.type) n++;
    if (n < d.multiply.max) api.spawn(g, u.type, u.side, clamp(u.x + (u.id % 2 ? 0.6 : -0.6), 0.4, api.W - 0.4), u.y, { deployT: d.multiply.wait, pack: u.pack }, u.lvl);
  }
  if (d.strikeZone) field(api, g, u.side, u.x, u.y, d.strikeZone, u.lvl);   // Klingentänzerin: Sog bei jedem Hieb
  if (d.ambush && cloaked) { // Nebelschleicher: aus dem Nebel geschlagen, stehen zwei Knechte neben dem Ziel
    api.areaDamage(g, u.side, t.x, t.y, d.ambush.r, Math.round(d.ambush.dmg * m), false, 1);
    for (let i = 0; i < d.ambush.count; i++) api.spawn(g, d.ambush.unit, u.side, clamp(t.x + (i ? 0.7 : -0.7), 0.4, api.W - 0.4), api.offRiver(clamp(t.y - fwd(u.side) * 0.5, 0.4, api.H - 0.4)), { deployT: 0.3 }, u.lvl);
    api.emit(g, { t: 'impact', x: t.x, y: t.y, r: d.ambush.r });
  }
  if (d.arc && u.chainN >= d.arc.after && u.chainLast) (g.arcs ||= []).push({ side: u.side, def: d.arc, mult: m, at: u.chainLast, t: d.arc.every, n: 0 });
  if (d.ramBack && u.hp > 0 && alive(t)) { // Stammläufer: prallt zurück und rammt wieder, jedes Mal mit voller Wucht
    const dx = u.x - t.x, dy = u.y - t.y, L = Math.hypot(dx, dy) || 1, ny = clamp(u.y + dy / L * d.ramBack, 0.5, api.H - 0.5);
    u.x = clamp(u.x + dx / L * d.ramBack, 0.5, api.W - 0.5); if (api.offRiver(ny) === ny) u.y = ny;
    u.ox = u.x; u.oy = u.y; u.inRange = false; u.charging = true; u.runT = d.charge.after; u.rammed = null; u.rt = null;
  }
}

// Schaden an einer Figur: gibt zurück, was davon ankommt (0: nichts)
export function evoHurt(api, g, e, amount) {
  if (e.ghost || e.veilT > 0) return 0;
  if (e.d.veil && !e.veiled) { // Krähenschwarm: der erste Treffer verpufft, die Krähe verschwindet für einen Augenblick
    e.veiled = true; e.veilT = e.d.veil.dur; e.cloakT = e.d.veil.dur; e.cloakRate = e.d.veil.rate; e.cloakSlow = e.d.veil.slow; e.hidden = true;
    api.emit(g, { t: 'shield', x: e.x, y: e.y });
    return 0;
  }
  return amount;
}

// Stirbt eine Figur
export function evoDeath(api, g, e) {
  const d = e.d;
  if (e.captive) { const c = g.byId.get(e.captive); if (c && c.cagedBy === e.id) c.cagedBy = 0; }
  if (d.lord) for (const o of g.ents) if (o.hp > 0 && o.lord === e.id) api.die(g, o);   // fällt der Feldherr, vergehen alle Schatten
  if (!d.rune || e.ghost) return;
  if (d.shade) { // Kieselbande: solange der Feldherr lebt, kämpft jeder Gefallene als Schatten weiter
    const lord = g.ents.find(o => o.hp > 0 && o.side === e.side && o.pack === e.pack && o.d.lord);
    if (lord) api.spawn(g, d.shade, e.side, e.x, e.y, { deployT: 0.3, ghost: true, lord: lord.id, pack: e.pack }, e.lvl);
  }
  if (d.ghostAfter) api.spawn(g, d.ghostAfter.unit, e.side, e.x, e.y, { deployT: 0.3, ghost: true, home: { x: e.x, y: e.y, r: d.ghostAfter.r } }, e.lvl);
  if (d.deathField) field(api, g, e.side, e.x, e.y, d.deathField, e.lvl);
  if (d.gust) (g.gusts ||= []).push({ side: e.side, x: e.x, y: e.y, G: d.gust, t: d.gust.linger });
}
