// Läuft vor allem anderen, deshalb nur einfaches JavaScript.
// Lädt das Spiel länger als zweieinhalb Sekunden (erster Besuch, große Bilddateien), zeigt ein kleiner Hinweis, dass es lädt.
// Notbremse: Startet das Spiel gar nicht (z. B. Datei fehlt nach einem Update), nach 25 Sekunden einen Hinweis
// mit „Neu laden“ zeigen. Der Knopf setzt nur den Spiel-Code (Service Worker + Cache) zurück –
// der Spielstand im localStorage bleibt unangetastet.
(function () {
  var hint = null;
  setTimeout(function () {
    if (window.__runenfurt) return;
    hint = document.createElement('div');
    hint.setAttribute('role', 'status');
    hint.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom));z-index:98;padding:9px 16px;border-radius:999px;background:rgba(21,43,56,.92);border:1px solid #2a4657;color:#cfe3ee;font:600 14px -apple-system,system-ui,sans-serif';
    hint.textContent = 'Runenfurt lädt …';
    document.body.appendChild(hint);
    var t = setInterval(function () { if (window.__runenfurt) { clearInterval(t); if (hint) { hint.remove(); hint = null; } } }, 300);
  }, 2500);
  setTimeout(function () {
    if (window.__runenfurt) return;
    if (hint) { hint.remove(); hint = null; }
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;left:16px;right:16px;bottom:calc(40px + env(safe-area-inset-bottom));z-index:99;padding:16px;border-radius:16px;background:#152b38;border:1px solid #2a4657;color:#fff;font:16px/1.4 -apple-system,system-ui,sans-serif;text-align:center';
    box.textContent = 'Das Spiel ist nicht richtig gestartet. Dein Spielstand ist sicher. ';
    var b = document.createElement('button');
    b.textContent = 'Neu laden';
    b.style.cssText = 'display:block;margin:12px auto 0;padding:12px 20px;border:0;border-radius:999px;background:#2ec4b6;color:#05312d;font:700 16px -apple-system,system-ui,sans-serif';
    b.onclick = function () {
      var done = function () { location.reload(); };
      try {
        var p1 = navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); }) : Promise.resolve();
        var p2 = window.caches ? caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }) : Promise.resolve();
        Promise.all([p1, p2]).then(done, done);
      } catch (e) { done(); }
    };
    box.appendChild(b);
    document.body.appendChild(box);
  }, 25000);
})();
