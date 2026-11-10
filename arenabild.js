// Hauptmenü: in der Mitte steht die Arena, in der man gerade spielt – ein vorab aufgenommenes Bild des leeren Spielfelds
// (ui/arena-NN.webp, erzeugt von tools/arena_bilder.mjs). Es schwebt leicht, ein Lichtschimmer zieht darüber, Antippen lässt es federn.
// Steht still, solange das Menü nicht zu sehen ist, bei „Bewegung reduzieren“ und bei Grafik „Niedrig“.
// Gleiche Schnittstelle wie die frühere Figurenbühne: setDeck(deck, arena), start, stop, resize, poke, setQuality, running, state.
export function createStage(canvas) {
  const c = canvas.getContext('2d');
  const reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  let W = 0, H = 0, dpr = 1, quality = 'hoch', arena = -1, img = null, gen = 0, running = false, raf = 0, last = 0, pokeAt = -1e9, box = null;
  const calm = () => reduce.matches || quality === 'niedrig';

  function resize() {
    const r = canvas.getBoundingClientRect();
    const d = Math.min(window.devicePixelRatio || 1, quality === 'hoch' ? 2 : quality === 'mittel' ? 1.5 : 1);
    if (!r.width || !r.height || (r.width === W && r.height === H && d === dpr)) return;
    W = r.width; H = r.height; dpr = d;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    draw(performance.now());
  }

  function load(i) {
    const g = ++gen, im = new Image();
    im.onload = () => { if (g === gen) { img = im; draw(performance.now()); } };
    im.onerror = () => { if (g === gen) img = null; };
    im.src = `./ui/arena-${String(i + 1).padStart(2, '0')}.webp`;
  }

  function draw(now) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (!img || !W) return;
    const t = calm() ? 0 : now / 1000, bob = Math.sin(t * 0.9) * 3;
    const k = Math.max(0, 1 - (now - pokeAt) / 420), s = 1 + 0.045 * k * Math.sin(k * Math.PI * 2.5); // Federn nach dem Antippen
    // so groß wie möglich: die ganze Höhe, zwischen den Seitenknöpfen
    let h = H - 16, w = h * img.width / img.height;
    const maxW = Math.max(120, W - 2 * Math.min(96, W * 0.25));
    if (w > maxW) { w = maxW; h = w * img.height / img.width; }
    const x = (W - w) / 2, y = (H - h) / 2 + bob, r = Math.min(18, w * 0.07);
    box = { x, y, w, h };
    c.save();
    c.translate(W / 2, H / 2 + bob); c.scale(s, s); c.translate(-W / 2, -(H / 2 + bob));
    const shape = () => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 26; c.shadowOffsetY = 12;
    shape(); c.fillStyle = '#0b1a22'; c.fill();
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.save(); shape(); c.clip();
    c.drawImage(img, x, y, w, h);
    if (!calm()) { // ein schmaler Lichtschimmer wandert langsam schräg über das Bild
      const p = ((t * 0.11) % 1.6) - 0.3, gx = x + w * p, g = c.createLinearGradient(gx - w * 0.25, y, gx + w * 0.25, y + h * 0.4);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x, y, w, h);
    }
    const v = c.createLinearGradient(0, y, 0, y + h); // oben und unten leicht abgedunkelt: das Bild sitzt ruhiger im Menü
    v.addColorStop(0, 'rgba(6,16,22,.30)'); v.addColorStop(0.18, 'rgba(6,16,22,0)'); v.addColorStop(0.82, 'rgba(6,16,22,0)'); v.addColorStop(1, 'rgba(6,16,22,.30)');
    c.fillStyle = v; c.fillRect(x, y, w, h);
    c.restore();
    shape(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.22)'; c.stroke();
    c.restore();
  }

  function loop(now) {
    if (!running) return;
    if (now - last >= 33 && (!calm() || now - pokeAt < 450)) { last = now; draw(now); } // höchstens 30 Bilder je Sekunde
    raf = requestAnimationFrame(loop);
  }

  return {
    setDeck(deck, a) { a = a || 0; if (a !== arena) { arena = a; img = null; load(a); } },
    start() { if (running) return; running = true; resize(); draw(performance.now()); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize,
    poke(px, py) {
      if (!box) return false;
      const r = canvas.getBoundingClientRect(), x = px - r.left, y = py - r.top;
      if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) return false;
      pokeAt = performance.now(); if (!running) draw(pokeAt);
      return true;
    },
    setQuality(q) { quality = q; W = 0; resize(); if (!running) draw(performance.now()); },
    get running() { return running; },
    get state() { return { arena, loaded: !!img, actors: [] }; },
  };
}
