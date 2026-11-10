// Offline-Cache für den Spiel-Code. Spielstände liegen NICHT hier, sondern im localStorage.
// Das Spiel kommt immer komplett aus dem Cache EINER Version – nie halb alt, halb neu.
// Bei jeder Änderung die Versionsnummer erhöhen (macht tools/deploy.mjs).
const VERSION = 'runenfurt-v10';
// Die großen Bildfolgen der Figuren liegen in einem eigenen Speicher, der Versionen überdauert: Sie werden beim ersten
// Gebrauch gespeichert (und vom Spiel im Hintergrund nachgeladen). Ihre Adresse trägt ?v=<Stand der Figur> – ändert sich
// eine Figur, ändert sich die Adresse, und nur sie wird neu geholt. Die Liste unten pflegt tools/engine_dateien.mjs.
const FIGUREN = 'runenfurt-figuren';
const isFigure = url => url.pathname.includes('/engine/assets/units/') && !/(_k\.webp|index\.json|stand\.json)$/.test(url.pathname);
const FILES = [
  './',
  './index.html',
  './style.css',
  './boot.js',
  './main.js',
  './arenabild.js',
  './helden.js', './evo.js',
  './ui/arena-01.webp',
  './ui/arena-02.webp',
  './ui/arena-03.webp',
  './ui/arena-04.webp',
  './ui/arena-05.webp',
  './ui/arena-06.webp',
  './ui/arena-07.webp',
  './ui/arena-08.webp',
  './ui/arena-09.webp',
  './ui/arena-10.webp',
  './ui/arena-11.webp',
  './ui/arena-12.webp',
  './ui/arena-13.webp',
  './ui/arena-14.webp',
  './cards.js',
  './sim.js',
  './ai.js',
  './progress.js',
  './render.js',
  './render3d.js',
  './models3d.js',
  './scenery.js',
  './lore.js',
  './engine/actors.js',
  './engine/deps.js',
  './engine/fx.js',
  './engine/ground.js',
  './engine/look.js',
  './engine/meshes.js',
  './engine/registry.js',
  './engine/rezepte.js',
  './engine/sprites.js',
  './engine/assets/props.json',
  './engine/assets/units/index.json',
  './engine/assets/units/stand.json',
  './engine/assets/units/armbrustwagen_k.webp',
  './engine/assets/units/armbrustwagen_w_k.webp',
  './engine/assets/units/aschenfunke_k.webp',
  './engine/assets/units/aschenschwinge_k.webp',
  './engine/assets/units/astriese_k.webp',
  './engine/assets/units/aussenturm_k.webp',
  './engine/assets/units/ballista_k.webp',
  './engine/assets/units/basaltriese_k.webp',
  './engine/assets/units/blasrohrwicht_k.webp',
  './engine/assets/units/blitzfaenger_k.webp',
  './engine/assets/units/bolzenschuetzin_k.webp',
  './engine/assets/units/brockenwerfer_k.webp',
  './engine/assets/units/buschwicht_k.webp',
  './engine/assets/units/distelritter_k.webp',
  './engine/assets/units/donnerkaefer_k.webp',
  './engine/assets/units/dornenkoloss_k.webp',
  './engine/assets/units/dornwerfer_k.webp',
  './engine/assets/units/eisbrocken_k.webp',
  './engine/assets/units/eisenwaechter_k.webp',
  './engine/assets/units/erdloch_k.webp',
  './engine/assets/units/erzritter_k.webp',
  './engine/assets/units/falterhueterin_k.webp',
  './engine/assets/units/fasstraeger_k.webp',
  './engine/assets/units/feldheilerin_k.webp',
  './engine/assets/units/fernschleuder_k.webp',
  './engine/assets/units/fluchweberin_k.webp',
  './engine/assets/units/flugsamen_k.webp',
  './engine/assets/units/flussmoench_k.webp',
  './engine/assets/units/frostling_k.webp',
  './engine/assets/units/frostschamane_k.webp',
  './engine/assets/units/funkenpfahl_k.webp',
  './engine/assets/units/funkenweberin_k.webp',
  './engine/assets/units/funkling_k.webp',
  './engine/assets/units/geschuetzturm_k.webp',
  './engine/assets/units/gewitterkarren_k.webp',
  './engine/assets/units/gewitterrochen_k.webp',
  './engine/assets/units/glutei_k.webp',
  './engine/assets/units/glutfalke_k.webp',
  './engine/assets/units/glutling_k.webp',
  './engine/assets/units/glutofen_k.webp',
  './engine/assets/units/hammerschmied_k.webp',
  './engine/assets/units/hornbulle_k.webp',
  './engine/assets/units/irrwisch_k.webp',
  './engine/assets/units/jungfuerst_k.webp',
  './engine/assets/units/jungrochen_k.webp',
  './engine/assets/units/kegler_k.webp',
  './engine/assets/units/keiler_k.webp',
  './engine/assets/units/kesselturm_k.webp',
  './engine/assets/units/kiesel_k.webp',
  './engine/assets/units/kieselhaufen_k.webp',
  './engine/assets/units/klingentaenzerin_k.webp',
  './engine/assets/units/klingenturm_k.webp',
  './engine/assets/units/knallfrosch_k.webp',
  './engine/assets/units/kraehe_k.webp',
  './engine/assets/units/kraftkloss_k.webp',
  './engine/assets/units/kraftkloss_k_k.webp',
  './engine/assets/units/kraftkloss_m_k.webp',
  './engine/assets/units/kraftquell_k.webp',
  './engine/assets/units/kurbelbogen_k.webp',
  './engine/assets/units/laternenfisch_k.webp',
  './engine/assets/units/leibwaechterin_k.webp',
  './engine/assets/units/marschall_k.webp',
  './engine/assets/units/maulwurfshuegel_k.webp',
  './engine/assets/units/muellerbursche_k.webp',
  './engine/assets/units/nachtfalter_k.webp',
  './engine/assets/units/nebelschleicher_k.webp',
  './engine/assets/units/panzerbaer_k.webp',
  './engine/assets/units/panzerhornisse_k.webp',
  './engine/assets/units/pulverwicht_k.webp',
  './engine/assets/units/pulverwicht_k_k.webp',
  './engine/assets/units/raeuber_k.webp',
  './engine/assets/units/raeuberlager_k.webp',
  './engine/assets/units/rankenreiterin_k.webp',
  './engine/assets/units/raufbold_k.webp',
  './engine/assets/units/rochen_k.webp',
  './engine/assets/units/runenhuene_k.webp',
  './engine/assets/units/schattenjaegerin_k.webp',
  './engine/assets/units/schildknappe_k.webp',
  './engine/assets/units/segelwicht_k.webp',
  './engine/assets/units/segensturm_k.webp',
  './engine/assets/units/seilwerfer_k.webp',
  './engine/assets/units/sichelwerfer_k.webp',
  './engine/assets/units/sonnenspiegel_k.webp',
  './engine/assets/units/speerwache_k.webp',
  './engine/assets/units/splitterjaeger_k.webp',
  './engine/assets/units/sprengkaefer_k.webp',
  './engine/assets/units/stammlaeufer_k.webp',
  './engine/assets/units/steinhueter_k.webp',
  './engine/assets/units/steinling_k.webp',
  './engine/assets/units/steinschleuder_k.webp',
  './engine/assets/units/steinwerferin_k.webp',
  './engine/assets/units/stelzenkessel_k.webp',
  './engine/assets/units/sternschuetzin_k.webp',
  './engine/assets/units/stollenmeister_k.webp',
  './engine/assets/units/sturmbruder_k.webp',
  './engine/assets/units/sturmrufer_k.webp',
  './engine/assets/units/tauling_k.webp',
  './engine/assets/units/torknacker_k.webp',
  './engine/assets/units/trommelschlaeger_k.webp',
  './engine/assets/units/waldlaeufer_k.webp',
  './engine/assets/units/wanderbusch_k.webp',
  './engine/assets/units/wegelagerin_k.webp',
  './engine/assets/units/weitschuetzin_k.webp',
  './engine/assets/units/wicht_k.webp',
  './engine/assets/units/windlaeufer_k.webp',
  './engine/assets/units/wolfszwinger_k.webp',
  './engine/assets/units/wuehler_k.webp',
  './engine/assets/units/wueterich_k.webp',
  './engine/assets/units/wurzelkoenig_k.webp',
  './engine/assets/units/wurzelmutter_k.webp',
  './engine/assets/units/zitterling_k.webp',
  './engine/assets/units/zuendler_k.webp',
  './engine/assets/units/zwingerwolf_k.webp',
  './engine/assets/units/funkenweberin.json',
  './engine/assets/units/funkenweberin.webp',
  './engine/assets/units/funkenweberin_m.webp',
  './engine/assets/units/kraehe.json',
  './engine/assets/units/kraehe.webp',
  './engine/assets/units/kraehe_m.webp',
  './engine/assets/units/raufbold.json',
  './engine/assets/units/raufbold.webp',
  './engine/assets/units/raufbold_m.webp',
  './engine/assets/units/steinhueter.json',
  './engine/assets/units/steinhueter.webp',
  './engine/assets/units/steinhueter_m.webp',
  './engine/assets/units/waldlaeufer.json',
  './engine/assets/units/waldlaeufer.webp',
  './engine/assets/units/waldlaeufer_m.webp',
  './engine/assets/units/wicht.json',
  './engine/assets/units/wicht.webp',
  './engine/assets/units/wicht_m.webp',
  './vendor/three.module.min.js',
  './vendor/three.core.js',
  './audio.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FIGUREN).map(k => caches.delete(k))))
      .then(() => trimFigures())
      .then(() => self.clients.claim())
  );
});

// Bildfolgen, deren Stand nicht mehr zur neuen Version passt, fliegen aus dem Figuren-Speicher
async function trimFigures() {
  try {
    const res = await (await caches.open(VERSION)).match(new URL('./engine/assets/units/stand.json', self.location).href);
    if (!res) return;
    const stand = await res.json(), c = await caches.open(FIGUREN);
    for (const req of await c.keys()) {
      const u = new URL(req.url), name = u.pathname.split('/').pop().replace(/(_m)?\.(webp|json)$/, '');
      if (stand[name] !== u.searchParams.get('v')) await c.delete(req);
    }
  } catch { /* beim nächsten Mal */ }
}

// Cache-Schlüssel ohne ?…, damit z. B. ./?speed=4 und ./ dasselbe sind
const keyOf = url => {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  return u.href;
};

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (isFigure(new URL(req.url))) {   // Bildfolge: aus dem Figuren-Speicher, sonst holen und dort ablegen
    event.respondWith((async () => {
      const c = await caches.open(FIGUREN), hit = (await c.match(req.url)) || (await (await caches.open(VERSION)).match(keyOf(req.url)));   // auch die fest gespeicherten Figuren des Startdecks
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok) c.put(req.url, res.clone()); return res; }
      catch { return new Response('null', { headers: { 'content-type': 'application/json', 'x-fehlt': '1' } }); }   // ohne Netz und nie gesehen: das Spiel zeichnet die Figur dann wie früher
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(keyOf(req.url));
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const page = (await cache.match(new URL('./index.html', self.location).href)) || (await cache.match(new URL('./', self.location).href));
      if (page) return page;
    }
    try {
      return await fetch(req);
    } catch {
      return Response.error();
    }
  })());
});
