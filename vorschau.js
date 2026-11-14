// Kartenvorschau, Teil 2: die Anzeige im Kartenblatt. Die Szene (vorschau-szene.js) läuft mit den echten Spielregeln und wird
// vom echten Zeichner des Kampfs gezeichnet – ohne zweiten WebGL-Kontext: Der Kampf-Zeichner ist im Menü unbenutzt, er
// zeichnet den Ausschnitt auf seine (unsichtbare) Fläche, und das Bild wird in eine kleine 2D-Fläche im Blatt kopiert.
// Bildfolgen der Figuren werden erst hier geladen und beim Schließen wieder freigegeben. Die Vorschau hält an, sobald das
// Blatt zu ist, die Seite im Hintergrund liegt oder die Vorschau aus dem Bild geschoben wurde.
//   createPreview({ renderer, restore, arena, calm }) → { mount(id, { lvl }), stop(), state }
//   restore(): stellt die Größe des Kampf-Zeichners wieder her (layout in main.js)
import { scene, sceneForms } from './vorschau-szene.js';
import { DT } from './sim.js';
import { setTexMode, loadUnit, unitIndex, releaseUnits, loadedUnits } from './engine/sprites.js';

const FORM_LABEL = { '': 'Normal', rune: '◆ Rune', held: '♛ Held' };   // kurz: drei Knöpfe passen auch auf 320 Bildpunkte Breite

export function createPreview({ renderer, restore, arena, calm = () => false }) {
  const look = renderer.look || null, gl = look ? look.renderer.domElement : null, labels = typeof document !== 'undefined' ? document.querySelector('#labels') : null;
  let cur = null;   // die laufende Vorschau: { box, cv, ctx, id, lvl, form, sc, mine, raf, … }

  function stop() {
    const c = cur; if (!c) return;
    cur = null;
    cancelAnimationFrame(c.raf);
    if (c.io) c.io.disconnect();
    renderer.reset();
    look.setView(null);
    const keep = new Set(loadedUnits().filter(n => !c.mine.has(n)));   // nur freigeben, was die Vorschau selbst geladen hat
    releaseUnits(keep);
    restore();
  }

  // Bildfolgen der Szene laden und auf die Grafikkarte legen; fertig (oder gescheitert) → die Szene läuft los
  async function load(c, sc) {
    const fresh = new Set(await unitIndex().catch(() => [])), have = new Set(loadedUnits());
    const px = c.cv.width / (sc.view.x1 - sc.view.x0);
    setTexMode({ scale: px >= 72 ? 1 : px >= 54 ? 0.75 : 0.5, mask: px >= 72 ? 1 : 0.5, mips: false });
    const names = sc.units.filter(n => fresh.has(n) && !have.has(n));
    for (const n of names) c.mine.add(n);
    const defs = await Promise.all(names.map(n => loadUnit(n).catch(() => null)));
    if (cur !== c || c.sc !== sc) return false;
    for (const d of defs) if (d && !d.up) { d.up = true; for (const t of [d.tex, d.mask]) { look.renderer.initTexture(t); if (t.image && t.image.getContext) t.image.width = t.image.height = 0; } }
    return true;
  }

  function begin(c) {
    const sc = scene(c.id, { form: c.form, lvl: c.lvl });
    c.sc = sc; c.acc = 0; c.last = 0; c.fade = 1; c.ready = false; c.loops = 0;
    renderer.reset();
    look.setView(sc.view);
    const r = c.cv.getBoundingClientRect(), w = Math.max(120, Math.round(r.width)), h = Math.max(80, Math.round(r.height)), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.cv.width = Math.round(w * dpr); c.cv.height = Math.round(h * dpr);
    c.w = w; c.h = h; c.dpr = dpr;
    renderer.resize(w, h, dpr, arena());
    c.box.classList.add('loading');
    load(c, sc).then(ok => { if (ok && cur === c && c.sc === sc) { c.ready = true; c.box.classList.remove('loading'); } });
  }
  const again = c => { const sc = scene(c.id, { form: c.form, lvl: c.lvl }); c.sc = sc; c.acc = 0; c.fade = 1; renderer.reset(); };   // dieselbe Szene von vorn (alles ist schon geladen)

  function frame(now) {
    const c = cur; if (!c) return;
    if (!c.box.isConnected) { stop(); return; }
    c.raf = requestAnimationFrame(frame);
    if (!c.ready || document.hidden || !c.seen || c.held) { c.last = 0; return; }
    const dt = c.last ? Math.min(0.1, (now - c.last) / 1000) : 0; c.last = now;
    const sc = c.sc, g = sc.g;
    if (sc.done) {   // Schleife: kurz abblenden, dann von vorn; bei „Bewegung reduzieren“ nur ein Durchlauf je Antippen
      c.fade -= dt * 3;
      if (c.fade <= 0) { if (calm()) { c.held = true; c.box.classList.add('held'); } again(c); return; }
    } else {
      c.fade = Math.min(1, c.fade + dt * 4);
      c.acc += dt;
      let n = 0;
      while (c.acc >= DT && n++ < 6 && !sc.done) { sc.step(); for (const ev of g.events) renderer.onEvent(ev); g.events.length = 0; c.acc -= DT; }
      if (n >= 6) c.acc = 0;
    }
    const size = look.size();   // hat inzwischen jemand die Größe des Zeichners geändert (Fenster gedreht)? dann wieder auf den Ausschnitt stellen
    if (size.width !== c.w || size.height !== c.h) renderer.resize(c.w, c.h, c.dpr, arena());
    renderer.draw(g, sc.done ? 1 : Math.min(1, c.acc / DT), null, now);
    const x = c.ctx;
    x.globalAlpha = 1; x.drawImage(gl, 0, 0, c.cv.width, c.cv.height);
    if (labels && labels.width) x.drawImage(labels, 0, 0, c.cv.width, c.cv.height);
    if (c.fade < 1) { x.globalAlpha = 1 - Math.max(0, c.fade); x.fillStyle = '#0b1a22'; x.fillRect(0, 0, c.cv.width, c.cv.height); x.globalAlpha = 1; }
  }

  // Baut die Vorschau einer Karte und startet sie. Gibt das Element fürs Kartenblatt zurück (null ohne 3D-Zeichner).
  function mount(id, { lvl = 1 } = {}) {
    if (!look) return null;
    stop();
    const box = document.createElement('div'); box.className = 'vorschau loading'; box.dataset.id = id;
    const cv = document.createElement('canvas'); cv.setAttribute('aria-label', 'Vorschau: so spielt die Karte'); cv.setAttribute('role', 'img');
    const wait = document.createElement('div'); wait.className = 'vsLoad'; wait.textContent = 'Vorschau lädt …';
    const play = document.createElement('div'); play.className = 'vsPlay'; play.textContent = 'Antippen: Vorschau abspielen';
    box.append(cv, wait, play);
    const forms = sceneForms(id), c = { box, cv, ctx: cv.getContext('2d'), id, lvl, form: '', mine: new Set(), raf: 0, seen: true, held: false, ready: false };
    if (forms.length > 1) {
      const seg = document.createElement('div'); seg.className = 'vsForms';
      for (const f of forms) { const b = document.createElement('button'); b.type = 'button'; b.textContent = FORM_LABEL[f]; b.dataset.form = f; b.className = f ? `f-${f}` : ''; if (!f) b.classList.add('on'); seg.append(b); }
      seg.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || cur !== c || b.dataset.form === c.form) return;
        e.stopPropagation();
        c.form = b.dataset.form; c.held = false; box.classList.remove('held');
        for (const o of seg.children) o.classList.toggle('on', o === b);
        begin(c);
      });
      box.append(seg);
    }
    cv.addEventListener('click', () => { if (cur !== c || !c.ready) return; c.held = false; box.classList.remove('held'); again(c); });   // antippen = von vorn
    cur = c;
    // erst starten, wenn das Element im Blatt steht und seine Größe kennt
    requestAnimationFrame(() => {
      if (cur !== c) return;
      if (!box.isConnected) { cur = null; return; }
      if (typeof IntersectionObserver !== 'undefined') { c.io = new IntersectionObserver(es => { c.seen = es[es.length - 1].isIntersecting; }); c.io.observe(box); }
      begin(c);
      c.raf = requestAnimationFrame(frame);
    });
    return box;
  }

  return { mount, stop, get state() { return cur ? { id: cur.id, form: cur.form, ready: cur.ready, time: cur.sc ? cur.sc.g.time : 0, loaded: [...cur.mine], held: cur.held, stats: cur.sc ? cur.sc.stats : null } : null; } };
}
