// Zeichnet Spielfeld, Einheiten, Geschosse und Effekte auf ein Canvas. Alles ist gezeichnet, es gibt keine Bilddateien.
import { CARDS, UNITS } from './cards.js';
import { W, H, RIVER_TOP, RIVER_BOT, BRIDGES, BRIDGE_HALF, OUTER_Y, MAIN_Y, POCKET, clampDeploy, outerTower } from './sim.js';

export const TEAM = [
  { main: '#2ec4b6', dark: '#0f6b63', light: '#a8f3ea' },
  { main: '#ec5f78', dark: '#8a2440', light: '#ffc6d0' },
];
const SKIN = '#f1c7a1', INK = '#1d2530';
const TAU = Math.PI * 2;

const circ = (c, x, y, r, fill, stroke, lw = 0.05) => {
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
};
const ell = (c, x, y, rx, ry, fill, stroke, lw = 0.05) => {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
};
const rrect = (c, x, y, w, h, r, fill, stroke, lw = 0.05) => {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
};
const poly = (c, pts, fill, stroke, lw = 0.05) => {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
};
const line = (c, x1, y1, x2, y2, color, lw) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = lw; c.lineCap = 'round'; c.stroke(); };

// ---- Figuren -----------------------------------------------------------------------------------
// Alle Figuren werden um (0,0) = Standpunkt gezeichnet, Einheit = Felder, Blick nach rechts (wird gespiegelt).

function legs(c, R, walk) {
  c.fillStyle = '#2a2f3a';
  rrect(c, -R * 0.5, R * 0.3 - walk * R * 0.25, R * 0.38, R * 0.55, R * 0.12, '#2a2f3a');
  rrect(c, R * 0.12, R * 0.3 + walk * R * 0.25, R * 0.38, R * 0.55, R * 0.12, '#2a2f3a');
}
function torso(c, R, T, color) {
  rrect(c, -R * 0.75, -R * 0.75, R * 1.5, R * 1.25, R * 0.4, color || T.main, T.dark, 0.05);
}
function head(c, R, skin = SKIN) {
  circ(c, 0, -R * 1.2, R * 0.6, skin, INK, 0.04);
  circ(c, R * 0.2, -R * 1.22, R * 0.08, INK);
  circ(c, R * 0.45, -R * 1.22, R * 0.07, INK);
}
const swing = e => Math.max(0, e.anim || 0) / 0.3; // 1 direkt nach dem Schlag, fällt auf 0

const DRAW = {
  raufbold(c, e, T, walk) {
    const R = e.r * 1.15, s = swing(e);
    legs(c, R, walk); torso(c, R, T); head(c, R);
    c.fillStyle = '#a8442a'; c.beginPath(); c.arc(0, -R * 1.3, R * 0.62, Math.PI * 1.05, Math.PI * 1.95); c.fill(); // Haarschopf
    line(c, -R * 0.55, -R * 1.3, R * 0.6, -R * 1.42, T.dark, 0.09); // Stirnband
    circ(c, R * (0.75 + s * 0.6), -R * 0.25, R * 0.3, SKIN, INK, 0.04);
    circ(c, -R * 0.7, -R * 0.05, R * 0.27, SKIN, INK, 0.04);
  },
  waldlaeufer(c, e, T, walk) {
    const R = e.r * 1.15, s = swing(e);
    legs(c, R, walk); torso(c, R, T); head(c, R);
    poly(c, [-R * 0.7, -R * 0.95, 0, -R * 2.05, R * 0.55, -R * 1.5, R * 0.1, -R * 1.45, -R * 0.2, -R * 0.9], '#35613a', INK, 0.04); // Kapuze
    c.beginPath(); c.arc(R * 0.55, -R * 0.4, R * 0.95, -Math.PI * 0.42, Math.PI * 0.42); c.strokeStyle = '#7a4f2a'; c.lineWidth = 0.08; c.stroke();
    line(c, R * 0.95, -R * 1.25, R * (0.95 - s * 0.35), -R * 0.4, '#e8e2d0', 0.03);
    line(c, R * (0.95 - s * 0.35), -R * 0.4, R * 0.95, R * 0.45, '#e8e2d0', 0.03);
  },
  steinhueter(c, e, T, walk, time) {
    const R = e.r, s = swing(e);
    poly(c, [-R * 0.95, R * 0.55, -R * 1.05, -R * 0.3, -R * 0.6, -R * 1.25, R * 0.1, -R * 1.5, R * 0.8, -R * 1.1, R * 1.05, -R * 0.2, R * 0.85, R * 0.55], '#8b8f96', '#3d4148', 0.07);
    poly(c, [-R * 0.6, -R * 1.25, R * 0.1, -R * 1.5, R * 0.8, -R * 1.1, R * 0.2, -R * 0.85, -R * 0.4, -R * 0.9], '#a9adb3');
    line(c, -R * 0.4, -R * 0.9, -R * 0.55, -R * 0.1, '#5c6068', 0.05); line(c, R * 0.2, -R * 0.85, R * 0.45, R * 0.2, '#5c6068', 0.05);
    c.shadowColor = T.main; c.shadowBlur = 8;
    poly(c, [0, -R * 0.55, R * 0.28, -R * 0.15, 0, R * 0.25, -R * 0.28, -R * 0.15], T.main, T.light, 0.04); // Rune
    circ(c, R * 0.15, -R * 1.08, R * 0.09, T.light); circ(c, R * 0.5, -R * 1.02, R * 0.09, T.light);
    c.shadowBlur = 0;
    circ(c, R * (1.0 + s * 0.4), -R * (0.1 + s * 0.3), R * 0.36, '#8b8f96', '#3d4148', 0.06);
    circ(c, -R * 1.0, R * 0.0 + walk * 0.05, R * 0.34, '#7d8188', '#3d4148', 0.06);
  },
  wicht(c, e, T, walk) {
    const R = e.r * 1.2, s = swing(e);
    ell(c, 0, -R * 0.35 + walk * 0.03, R * 0.85, R * 0.8, '#7b5637', '#3b2716', 0.04);
    poly(c, [-R * 0.5, -R * 0.95, -R * 1.15, -R * 1.5, -R * 0.15, -R * 1.1], T.main, T.dark, 0.03);
    poly(c, [R * 0.3, -R * 1.0, R * 0.9, -R * 1.65, R * 0.6, -R * 0.85], T.main, T.dark, 0.03);
    circ(c, R * 0.15, -R * 0.5, R * 0.16, '#ffe26a'); circ(c, R * 0.58, -R * 0.5, R * 0.14, '#ffe26a');
    line(c, R * 0.6, -R * 0.1, R * (1.0 + s * 0.4), -R * 0.2, '#3b2716', 0.07);
  },
  kraehe(c, e, T, walk, time) {
    const R = e.r * 1.25, f = Math.sin(time * 16 + e.id) * 0.6, s = swing(e);
    poly(c, [-R * 0.2, -R * 0.2, -R * 1.6, -R * (0.5 + f), -R * 0.9, R * 0.15], '#2b3044', INK, 0.03);
    poly(c, [R * 0.1, -R * 0.2, R * 1.2, -R * (0.6 + f), R * 0.9, R * 0.1], '#3a4059', INK, 0.03);
    ell(c, 0, 0, R * 0.75, R * 0.5, '#1f2333', INK, 0.03);
    circ(c, R * 0.65, -R * 0.3, R * 0.36, '#1f2333', INK, 0.03);
    poly(c, [R * 0.9, -R * 0.4, R * (1.5 + s * 0.3), -R * 0.25, R * 0.9, -R * 0.1], '#f2b33d');
    circ(c, R * 0.72, -R * 0.38, R * 0.08, '#fff');
    line(c, R * 0.3, -R * 0.05, R * 0.55, R * 0.25, T.main, 0.1);
  },
  rochen(c, e, T, walk, time) {
    const R = e.r * 1.15, f = Math.sin(time * 4 + e.id) * 0.18;
    line(c, -R * 0.8, 0, -R * 1.9, R * 0.25 + f * 0.5, '#5b4a86', 0.07);
    poly(c, [R * 1.0, 0, R * 0.1, -R * (1.25 + f), -R * 0.9, 0, R * 0.1, R * (1.0 + f)], '#8e7cc3', '#3f3168', 0.06);
    poly(c, [R * 0.75, 0, R * 0.1, -R * 0.55, -R * 0.5, 0, R * 0.1, R * 0.45], '#b3a5dc');
    line(c, R * 0.0, -R * 0.75, -R * 0.35, -R * 0.3, T.main, 0.09); line(c, R * 0.0, R * 0.6, -R * 0.35, R * 0.25, T.main, 0.09);
    circ(c, R * 0.6, -R * 0.2, R * 0.09, '#fff'); circ(c, R * 0.6, R * 0.2, R * 0.09, '#fff');
  },
  funkenweberin(c, e, T, walk, time) {
    const R = e.r * 1.15, s = swing(e);
    legs(c, R, walk);
    poly(c, [-R * 0.9, R * 0.6, -R * 0.5, -R * 0.8, R * 0.5, -R * 0.8, R * 0.9, R * 0.6], T.main, T.dark, 0.05); // Robe
    head(c, R);
    ell(c, 0, -R * 1.55, R * 1.05, R * 0.25, '#4a2f6b', INK, 0.04); // Hutkrempe
    poly(c, [-R * 0.5, -R * 1.6, R * 0.1, -R * 2.5, R * 0.5, -R * 1.6], '#5c3a86', INK, 0.04);
    c.shadowColor = '#ffb347'; c.shadowBlur = 10;
    circ(c, R * (1.0 + s * 0.3), -R * (0.5 + s * 0.4), R * (0.26 + 0.05 * Math.sin(time * 9)), '#ffd27a', '#ff8a2a', 0.05);
    c.shadowBlur = 0;
  },
  torknacker(c, e, T, walk) {
    const R = e.r * 1.1, s = swing(e);
    legs(c, R, walk); torso(c, R, T); head(c, R);
    c.beginPath(); c.arc(0, -R * 1.25, R * 0.62, Math.PI, TAU); c.fillStyle = '#6b4a2b'; c.fill(); c.strokeStyle = INK; c.lineWidth = 0.04; c.stroke(); // Lederkappe
    const k = s * R * 0.5;
    rrect(c, -R * 0.9 + k, -R * 0.45, R * 2.2, R * 0.5, R * 0.12, '#8a5a2e', '#3b2716', 0.05);
    rrect(c, R * 1.1 + k, -R * 0.52, R * 0.4, R * 0.64, R * 0.08, '#b9bec6', '#3d4148', 0.05);
  },
  eisenwaechter(c, e, T, walk) {
    const R = e.r * 1.15, s = swing(e);
    legs(c, R, walk); torso(c, R, T); head(c, R);
    c.beginPath(); c.arc(0, -R * 1.25, R * 0.66, Math.PI * 0.95, Math.PI * 2.05); c.fillStyle = '#aab0b9'; c.fill(); c.strokeStyle = '#3d4148'; c.lineWidth = 0.05; c.stroke(); // Helm
    rrect(c, -R * 0.08, -R * 1.9, R * 0.16, R * 0.7, 0.03, '#aab0b9', '#3d4148', 0.03);
    line(c, R * 0.6, -R * 0.2, R * (1.3 + s * 0.4), -R * (0.9 - s * 0.7), '#d9dde3', 0.09); // Klinge
    circ(c, -R * 0.45, -R * 0.05, R * 0.62, T.dark, INK, 0.05); circ(c, -R * 0.45, -R * 0.05, R * 0.22, '#d9dde3'); // Schild
  },
  hammerschmied(c, e, T, walk) {
    const R = e.r * 1.15, s = swing(e);
    legs(c, R, walk); torso(c, R, T);
    rrect(c, -R * 0.45, -R * 0.6, R * 0.9, R * 1.05, R * 0.15, '#6b4a2b', '#3b2716', 0.04); // Schürze
    head(c, R);
    c.beginPath(); c.arc(R * 0.1, -R * 1.02, R * 0.5, 0.1, Math.PI - 0.1); c.fillStyle = '#d98f3a'; c.fill(); // Bart
    c.save(); c.translate(R * 0.7, -R * 0.2); c.rotate(-1.0 + s * 1.9);
    line(c, 0, 0, 0, -R * 1.5, '#7a4f2a', 0.1);
    rrect(c, -R * 0.55, -R * 2.0, R * 1.1, R * 0.62, R * 0.1, '#9aa0a9', '#3d4148', 0.06);
    c.restore();
  },
  ballista(c, e, T, walk, time, aim) {
    const R = e.r;
    circ(c, 0, 0, R, '#8a6a43', '#3b2716', 0.07); circ(c, 0, 0, R * 0.72, '#a58256');
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; circ(c, Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.86, R * 0.08, '#3b2716'); }
    c.save(); c.rotate(aim ?? -Math.PI / 2);
    rrect(c, -R * 0.5, -R * 0.12, R * 1.5, R * 0.24, 0.04, '#5d4127', INK, 0.03);
    c.beginPath(); c.arc(R * 0.2, 0, R * 0.8, -1.25, 1.25); c.strokeStyle = T.main; c.lineWidth = 0.12; c.stroke();
    line(c, R * 0.45, -R * 0.76, -R * 0.3 + swing(e) * R * 0.5, 0, '#e8e2d0', 0.03); line(c, R * 0.45, R * 0.76, -R * 0.3 + swing(e) * R * 0.5, 0, '#e8e2d0', 0.03);
    poly(c, [R * 1.25, 0, R * 0.9, -R * 0.14, R * 0.9, R * 0.14], '#d9dde3');
    c.restore();
  },
  erdloch(c, e, T) {
    const R = e.r;
    ell(c, 0, R * 0.1, R * 1.1, R * 0.85, '#6b4f32', '#3b2716', 0.07);
    ell(c, 0, 0, R * 0.8, R * 0.58, '#8a6a43');
    ell(c, 0, R * 0.05, R * 0.52, R * 0.36, '#1b130c');
    for (const [x, y, a] of [[-0.9, -0.3, -0.6], [0.85, -0.35, 0.5], [0, -0.75, 0]]) poly(c, [x * R, y * R, (x + Math.sin(a) * 0.5 - 0.15) * R, (y - 0.55) * R, (x + Math.sin(a) * 0.5 + 0.2) * R, (y - 0.4) * R], T.main, T.dark, 0.03);
  },
  aussenturm(c, e, T, walk, time) { tower(c, e, T, time, false); },
  hauptturm(c, e, T, walk, time) { tower(c, e, T, time, true); },
};

function tower(c, e, T, time, main) {
  const R = e.r;
  ell(c, 0, R * 0.35, R * 1.12, R * 0.8, 'rgba(0,0,0,.28)');
  // Sockel aus Steinquadern
  rrect(c, -R, -R * 0.75, R * 2, R * 1.6, R * 0.25, '#7f8791', '#333a44', 0.08);
  rrect(c, -R, -R * 0.75, R * 2, R * 0.55, R * 0.25, '#9aa2ac');
  for (let i = -1; i <= 1; i++) rrect(c, i * R * 0.66 - R * 0.24, -R * 1.02, R * 0.48, R * 0.4, 0.04, '#9aa2ac', '#333a44', 0.06);
  line(c, -R * 0.55, R * 0.1, -R * 0.1, R * 0.1, '#5d646e', 0.05); line(c, R * 0.2, R * 0.45, R * 0.7, R * 0.45, '#5d646e', 0.05);
  rrect(c, -R * 0.82, -R * 0.2, R * 1.64, R * 0.22, 0.04, T.main, T.dark, 0.04); // Banner
  // Runenkristall
  const awake = e.active !== false, glow = awake ? 0.6 + 0.4 * Math.sin(time * 3 + e.x) : 0;
  const k = main ? 0.62 : 0.5, y0 = -R * (main ? 1.25 : 1.15);
  if (awake) { c.shadowColor = T.main; c.shadowBlur = 6 + glow * 10; }
  poly(c, [0, y0 - R * k * 1.3, R * k * 0.6, y0, 0, y0 + R * k * 0.75, -R * k * 0.6, y0], awake ? T.main : '#69717c', awake ? T.light : '#333a44', 0.05);
  c.shadowBlur = 0;
  poly(c, [0, y0 - R * k * 1.3, R * k * 0.6, y0, 0, y0 - R * k * 0.2], 'rgba(255,255,255,.35)');
  if (main) { circ(c, -R * 0.55, R * 0.42, R * 0.13, T.light); circ(c, 0, R * 0.42, R * 0.13, T.light); circ(c, R * 0.55, R * 0.42, R * 0.13, T.light); }
}

// Der 2D-Zeichner ist nur der Rückfall ohne WebGL: neuere Figuren leihen sich dort eine vorhandene Zeichnung.
const ALIAS = { geschuetzturm: 'aussenturm', klingenturm: 'aussenturm', segensturm: 'aussenturm', dornwerfer: 'wicht', blasrohrwicht: 'wicht', sprengkaefer: 'wicht', wuehler: 'wicht', nachtfalter: 'kraehe', panzerhornisse: 'kraehe', laternenfisch: 'rochen', schildknappe: 'eisenwaechter', nebelschleicher: 'eisenwaechter', windlaeufer: 'eisenwaechter',
  trommelschlaeger: 'raufbold', fasstraeger: 'hammerschmied', wurzelkoenig: 'hammerschmied', kegler: 'hammerschmied', brockenwerfer: 'hammerschmied', zuendler: 'raufbold', sternschuetzin: 'waldlaeufer', weitschuetzin: 'waldlaeufer', schattenjaegerin: 'waldlaeufer',
  blitzfaenger: 'funkenweberin', feldheilerin: 'funkenweberin', eisbrocken: 'steinhueter', basaltriese: 'steinhueter', panzerbaer: 'torknacker', gewitterkarren: 'ballista', sonnenspiegel: 'ballista', kesselturm: 'ballista', fernschleuder: 'ballista', glutofen: 'erdloch', kraftquell: 'erdloch',
  raeuber: 'raufbold', sturmbruder: 'raufbold', speerwache: 'eisenwaechter', muellerbursche: 'hammerschmied', steinwerferin: 'waldlaeufer', wueterich: 'raufbold', distelritter: 'eisenwaechter', sichelwerfer: 'hammerschmied', splitterjaeger: 'waldlaeufer',
  wegelagerin: 'raufbold', falterhueterin: 'funkenweberin', seilwerfer: 'raufbold', fluchweberin: 'funkenweberin', stollenmeister: 'hammerschmied', flussmoench: 'raufbold', jungfuerst: 'waldlaeufer', leibwaechterin: 'eisenwaechter',
  frostling: 'wicht', funkling: 'wicht', tauling: 'wicht', knallfrosch: 'wicht', pulverwicht: 'wicht', pulverwicht_k: 'wicht', zitterling: 'wicht', kraftkloss: 'steinhueter', kraftkloss_m: 'wicht', kraftkloss_k: 'wicht', irrwisch: 'wicht', glutei: 'erdloch',
  wanderbusch: 'wicht', buschwicht: 'wicht', keiler: 'torknacker', zwingerwolf: 'torknacker', rankenreiterin: 'torknacker', stammlaeufer: 'torknacker', flugsamen: 'rochen', jungrochen: 'rochen', segelwicht: 'kraehe', gewitterrochen: 'rochen',
  aschenschwinge: 'rochen', aschenfunke: 'kraehe', glutfalke: 'kraehe', astriese: 'steinhueter', dornenkoloss: 'steinhueter', runenhuene: 'steinhueter', stelzenkessel: 'steinhueter', armbrustwagen: 'ballista', armbrustwagen_w: 'ballista',
  raeuberlager: 'erdloch', kieselhaufen: 'erdloch', wolfszwinger: 'erdloch', maulwurfshuegel: 'erdloch', funkenpfahl: 'ballista', kurbelbogen: 'ballista',
  glutling: 'wicht', kiesel: 'wicht', klingentaenzerin: 'eisenwaechter', bolzenschuetzin: 'waldlaeufer', donnerkaefer: 'rochen', frostschamane: 'funkenweberin', erzritter: 'eisenwaechter', wurzelmutter: 'funkenweberin', hornbulle: 'torknacker', steinling: 'steinhueter', marschall: 'eisenwaechter', sturmrufer: 'funkenweberin', steinschleuder: 'ballista' };
const drawer = model => DRAW[model] || DRAW[ALIAS[model]] || DRAW.raufbold;

function drawFigure(c, e, time, moving) {
  const T = TEAM[e.side], fn = drawer(e.model || e.type);
  const walk = moving ? Math.sin(time * 11 + e.id * 1.7) : 0;
  if (e.kind === 'unit' || e.kind === undefined) {
    c.save();
    if (e.face < 0) c.scale(-1, 1);
    fn(c, e, T, walk, time);
    c.restore();
  } else {
    fn(c, e, T, walk, time, e.aim);
  }
}

// ---- Kartenbilder ------------------------------------------------------------------------------

const CARD_BG = { tower: ['#5f6d80', '#2b3644'], troop: ['#3b5f7d', '#22384d'], spell: ['#6a4a94', '#35224f'], building: ['#7a5c3a', '#3f2e1b'] };

function spellIcon(c, spell, time = 0) {
  if (spell === 'sternschlag') {
    line(c, -0.9, -1.0, 0.1, 0.0, 'rgba(255,220,130,.5)', 0.35);
    c.shadowColor = '#ffcf5a'; c.shadowBlur = 12;
    const p = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * TAU / 10, r = i % 2 ? 0.3 : 0.7; p.push(0.2 + Math.cos(a) * r, 0.1 + Math.sin(a) * r); }
    poly(c, p, '#ffe08a', '#e08a1f', 0.05); c.shadowBlur = 0;
  } else if (spell === 'hagelschauer') {
    ell(c, 0, -0.55, 0.85, 0.36, '#aebccc', '#4d5a6b', 0.05); circ(c, -0.35, -0.75, 0.33, '#c5d1de'); circ(c, 0.25, -0.82, 0.4, '#c5d1de');
    for (const [x, y] of [[-0.6, 0.15], [-0.1, 0.4], [0.4, 0.1], [0.65, 0.55], [-0.4, 0.7], [0.15, 0.8]]) { line(c, x + 0.1, y - 0.25, x, y, 'rgba(255,255,255,.5)', 0.05); circ(c, x, y, 0.11, '#eaf6ff', '#6f8fb0', 0.03); }
  } else if (spell === 'wurzelgriff') {
    for (const [x, s] of [[-0.55, -1], [0, 1], [0.55, -1]]) {
      c.beginPath(); c.moveTo(x, 0.8); c.bezierCurveTo(x + 0.5 * s, 0.3, x - 0.5 * s, -0.2, x + 0.15 * s, -0.8);
      c.strokeStyle = '#3f8a3a'; c.lineWidth = 0.16; c.lineCap = 'round'; c.stroke();
      poly(c, [x + 0.15 * s, -0.8, x + 0.5 * s, -0.75, x + 0.3 * s, -0.5], '#7fd069');
    }
  } else if (spell === 'funkenschlag') {
    c.shadowColor = '#fff27a'; c.shadowBlur = 14;
    poly(c, [0.25, -0.95, -0.45, 0.1, 0.0, 0.1, -0.3, 0.95, 0.5, -0.2, 0.05, -0.2], '#fff27a', '#e08a1f', 0.06);
    c.shadowBlur = 0;
    line(c, -0.75, -0.5, -0.55, -0.35, '#fff9b0', 0.07); line(c, 0.7, 0.45, 0.85, 0.6, '#fff9b0', 0.07); line(c, -0.7, 0.55, -0.5, 0.45, '#fff9b0', 0.07);
  } else if (spell === 'sumpfdunst') {
    for (const [x, y, r, col] of [[-0.4, 0.1, 0.5, '#6fa83a'], [0.35, 0.2, 0.55, '#7fbd45'], [0, -0.3, 0.55, '#93d152'], [-0.1, 0.35, 0.45, '#a6d94a']]) circ(c, x, y, r, col, '#3d6b1f', 0.05);
    for (const [x, y, r] of [[-0.55, -0.7, 0.12], [0.6, -0.55, 0.16], [0.1, -0.95, 0.09]]) circ(c, x, y, r, 'rgba(200,240,130,.6)', '#eaffc0', 0.04);
    circ(c, -0.15, -0.05, 0.11, '#2f4f1a'); circ(c, 0.25, -0.05, 0.11, '#2f4f1a'); line(c, -0.1, 0.35, 0.25, 0.35, '#2f4f1a', 0.08);
  } else if (spell === 'frostnacht') {
    c.shadowColor = '#bfeaff'; c.shadowBlur = 12;
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI / 3, dx = Math.cos(a), dy = Math.sin(a);
      line(c, -dx * 0.9, -dy * 0.9, dx * 0.9, dy * 0.9, '#eaf8ff', 0.13);
      for (const s of [-1, 1]) for (const q of [0.5, -0.5]) { const bx = dx * 0.55 * s, by = dy * 0.55 * s, b = a + q * 1.5; line(c, bx, by, bx + Math.cos(b) * 0.28 * s, by + Math.sin(b) * 0.28 * s, '#bfeaff', 0.09); }
    }
    c.shadowBlur = 0; circ(c, 0, 0, 0.16, '#ffffff', '#6fa8c8', 0.04);
  } else if (spell === 'donnerkeil') {
    ell(c, 0, -0.72, 0.9, 0.3, '#59647a', '#2a313b', 0.05); circ(c, -0.4, -0.86, 0.3, '#6b768c'); circ(c, 0.2, -0.95, 0.36, '#6b768c');
    c.shadowColor = '#fff27a'; c.shadowBlur = 16;
    for (const [x, k] of [[-0.5, 0.8], [0.05, 1.15], [0.6, 0.8]]) poly(c, [x + 0.12 * k, -0.55, x - 0.2 * k, 0.05, x + 0.02 * k, 0.05, x - 0.12 * k, 0.75 * k, x + 0.26 * k, -0.1, x + 0.05 * k, -0.1], '#fff27a', '#e08a1f', 0.04);
    c.shadowBlur = 0;
  } else if (spell === 'felssturz') {
    for (const x of [-0.75, -0.45, -0.15]) line(c, x, -1.0, x + 0.35, -0.35, 'rgba(255,255,255,.35)', 0.1);
    poly(c, [-0.55, -0.15, 0.05, -0.6, 0.7, -0.25, 0.85, 0.4, 0.3, 0.85, -0.45, 0.65, -0.8, 0.2], '#8d939c', '#3a4048', 0.07);
    poly(c, [0.05, -0.6, 0.7, -0.25, 0.25, 0.05, -0.2, -0.1], '#b4bbc4'); line(c, -0.2, -0.1, -0.45, 0.65, '#646b75', 0.06); line(c, 0.25, 0.05, 0.3, 0.85, '#646b75', 0.06);
  } else if (spell === 'wichtwurf') {
    poly(c, [-0.2, -0.75, 0.2, -0.75, 0.3, -0.45, -0.3, -0.45], '#7a5a34', '#3b2716', 0.05);
    c.beginPath(); c.moveTo(-0.28, -0.45); c.bezierCurveTo(-1.0, 0.1, -0.8, 0.9, 0, 0.9); c.bezierCurveTo(0.8, 0.9, 1.0, 0.1, 0.28, -0.45); c.closePath();
    c.fillStyle = '#b08350'; c.fill(); c.strokeStyle = '#3b2716'; c.lineWidth = 0.06; c.stroke();
    line(c, -0.3, -0.45, 0.3, -0.45, TEAM[0].main, 0.1);
    circ(c, -0.2, 0.25, 0.1, '#ffe26a', '#3b2716', 0.03); circ(c, 0.25, 0.25, 0.1, '#ffe26a', '#3b2716', 0.03);
    poly(c, [-0.45, -0.1, -0.32, -0.42, -0.2, -0.1], TEAM[0].main, '#3b2716', 0.03); poly(c, [0.2, -0.1, 0.32, -0.42, 0.45, -0.1], TEAM[0].main, '#3b2716', 0.03);
  } else if (spell === 'rollstein') {
    for (const y of [-0.35, 0.05, 0.45]) line(c, -1.0, y + 0.45, -0.55, y + 0.45, 'rgba(255,255,255,.35)', 0.08);
    rrect(c, -0.5, -0.35, 1.45, 0.9, 0.42, '#8d939c', '#3a4048', 0.07);
    ell(c, 0.75, 0.1, 0.24, 0.45, '#b4bbc4', '#3a4048', 0.06); ell(c, 0.75, 0.1, 0.1, 0.2, '#646b75');
    for (const x of [-0.2, 0.2]) line(c, x, -0.33, x, 0.53, '#646b75', 0.06);
  } else if (spell === 'wirbelwind') {
    c.strokeStyle = '#eaf8ff'; c.lineCap = 'round';
    for (const [y, w, t] of [[-0.7, 0.85, 0.16], [-0.3, 0.65, 0.15], [0.08, 0.46, 0.14], [0.42, 0.3, 0.12], [0.72, 0.16, 0.1]]) { c.lineWidth = t; c.beginPath(); c.ellipse(Math.sin(y * 4) * 0.12, y, w, 0.16, 0, 0.3, Math.PI * 1.85); c.stroke(); }
    circ(c, -0.75, 0.55, 0.06, '#c5d1de'); circ(c, 0.7, 0.3, 0.05, '#c5d1de'); circ(c, 0.55, 0.8, 0.07, '#c5d1de');
  } else if (spell === 'kriegstrommel') {
    ell(c, 0, 0.45, 0.75, 0.3, '#7a4f2a', '#3b2716', 0.06);
    c.fillStyle = '#9a6634'; c.fillRect(-0.75, -0.2, 1.5, 0.65); c.strokeStyle = '#3b2716'; c.lineWidth = 0.06; c.strokeRect(-0.75, -0.2, 1.5, 0.65);
    c.fillStyle = TEAM[0].main; c.fillRect(-0.75, 0.0, 1.5, 0.2);
    ell(c, 0, -0.2, 0.75, 0.3, '#f1e3c4', '#3b2716', 0.06);
    line(c, -0.2, -0.3, -0.85, -0.95, '#5d3d1f', 0.1); circ(c, -0.2, -0.3, 0.1, '#f3ead2', '#3b2716', 0.03);
    line(c, 0.3, -0.15, 0.9, -0.85, '#5d3d1f', 0.1); circ(c, 0.3, -0.15, 0.1, '#f3ead2', '#3b2716', 0.03);
  } else if (spell === 'hohlstamm') {
    for (const y of [-0.5, -0.1, 0.3]) line(c, -1.0, y + 0.3, -0.6, y + 0.3, 'rgba(255,255,255,.35)', 0.08);
    rrect(c, -0.55, -0.4, 1.35, 0.95, 0.4, '#9a6634', '#3b2716', 0.07);
    for (const x of [-0.25, 0.1]) line(c, x, -0.36, x + 0.08, 0.5, '#7a4f2a', 0.05);
    ell(c, 0.62, 0.08, 0.3, 0.47, '#c79a5e', '#3b2716', 0.06); ell(c, 0.62, 0.08, 0.19, 0.32, '#2a1d14');
    circ(c, 0.56, 0.02, 0.055, '#ffe26a'); circ(c, 0.72, 0.02, 0.055, '#ffe26a');
    poly(c, [-0.2, -0.4, -0.05, -0.75, 0.1, -0.4], '#6fb455', '#2f5f24', 0.04);
  } else if (spell === 'trugbild') {
    const man = (x, fill, edge) => { rrect(c, x - 0.3, -0.05, 0.6, 0.8, 0.2, fill, edge, 0.06); circ(c, x, -0.42, 0.34, fill, edge, 0.06); };
    c.globalAlpha = 0.55; man(0.38, '#8fe0ff', '#dff7ff'); c.globalAlpha = 1;
    man(-0.3, TEAM[0].main, '#12313a');
    circ(c, -0.4, -0.45, 0.07, '#fff'); circ(c, -0.18, -0.45, 0.07, '#fff');
    for (const [x, y, k] of [[0.85, -0.75, 0.16], [0.75, 0.6, 0.12], [0.1, -0.9, 0.1]]) poly(c, [x, y - k, x + k * 0.3, y - k * 0.3, x + k, y, x + k * 0.3, y + k * 0.3, x, y + k, x - k * 0.3, y + k * 0.3, x - k, y, x - k * 0.3, y - k * 0.3], '#ffffff');
  } else if (spell === 'bodengrollen') {
    poly(c, [-0.95, 0.1, -0.2, -0.2, 0.05, 0.2, -0.25, 0.85, -0.9, 0.7], '#a37b4c', '#3b2716', 0.06);
    poly(c, [0.0, -0.3, 0.9, -0.05, 0.95, 0.65, 0.0, 0.9, 0.3, 0.25], '#8f6a40', '#3b2716', 0.06);
    poly(c, [-0.2, -0.2, 0.0, -0.3, 0.3, 0.25, 0.0, 0.9, -0.25, 0.85, 0.05, 0.2], '#1f140c');
    for (const [x, y, r] of [[-0.55, -0.6, 0.16], [0.45, -0.7, 0.2], [0.0, -0.85, 0.12]]) { poly(c, [x - r, y, x - r * 0.3, y - r, x + r, y - r * 0.4, x + r * 0.7, y + r * 0.8, x - r * 0.5, y + r], '#939aa5', '#3a4048', 0.04); line(c, x, y + r + 0.08, x, y + r + 0.3, 'rgba(255,255,255,.4)', 0.05); }
  } else if (spell === 'eiswurf') {
    for (const x of [-0.8, -0.5, -0.2]) line(c, x, -1.0, x + 0.3, -0.45, 'rgba(255,255,255,.4)', 0.09);
    c.shadowColor = '#bfeaff'; c.shadowBlur = 10;
    poly(c, [-0.5, -0.25, 0.1, -0.65, 0.75, -0.3, 0.85, 0.4, 0.3, 0.85, -0.45, 0.6, -0.75, 0.15], '#bfeaff', '#4d8fb0', 0.07); c.shadowBlur = 0;
    poly(c, [0.1, -0.65, 0.75, -0.3, 0.3, 0.0, -0.15, -0.15], '#eaf8ff'); line(c, -0.15, -0.15, -0.45, 0.6, '#7fb2d0', 0.05); line(c, 0.3, 0.0, 0.3, 0.85, '#7fb2d0', 0.05);
  } else if (spell === 'wurzelfluch') {
    c.shadowColor = '#b06adf'; c.shadowBlur = 14; circ(c, 0, 0.05, 0.78, '#4a2c66', '#c98bff', 0.07); c.shadowBlur = 0;
    for (const [x, s] of [[-0.35, -1], [0.35, 1]]) { c.beginPath(); c.moveTo(x, 0.75); c.bezierCurveTo(x - 0.5 * s, 0.3, x + 0.4 * s, -0.1, x - 0.1 * s, -0.55); c.strokeStyle = '#6b4a2b'; c.lineWidth = 0.14; c.lineCap = 'round'; c.stroke(); }
    poly(c, [-0.5, -0.35, -0.3, -0.85, -0.15, -0.35], TEAM[0].main, '#12313a', 0.04); poly(c, [0.15, -0.35, 0.3, -0.85, 0.5, -0.35], TEAM[0].main, '#12313a', 0.04);
    circ(c, -0.2, 0.1, 0.13, '#ffe26a', '#3b2716', 0.03); circ(c, 0.2, 0.1, 0.13, '#ffe26a', '#3b2716', 0.03); line(c, -0.15, 0.42, 0.15, 0.42, '#c98bff', 0.07);
  } else if (spell === 'geroellfeld') {
    ell(c, 0, 0.6, 0.95, 0.3, '#6b4f32', '#3b2716', 0.05);
    for (const [x, y, r] of [[-0.5, 0.25, 0.3], [0.5, 0.2, 0.28], [0.0, -0.25, 0.36]]) {
      ell(c, x, y + r * 0.9, r * 1.2, r * 0.4, '#8a6a43', '#3b2716', 0.04);
      poly(c, [x - r, y + r * 0.6, x - r * 0.8, y - r * 0.4, x - r * 0.1, y - r, x + r * 0.8, y - r * 0.5, x + r, y + r * 0.6], '#939aa5', '#3a4048', 0.05);
      circ(c, x - r * 0.3, y, r * 0.14, '#ffe26a'); circ(c, x + r * 0.3, y, r * 0.14, '#ffe26a');
      poly(c, [x - r * 0.25, y - r * 0.95, x, y - r * 1.5, x + r * 0.25, y - r * 0.95], TEAM[0].main, '#12313a', 0.03);
    }
  } else if (spell === 'widerhall') {
    c.save(); c.rotate(-0.15); rrect(c, -0.75, -0.6, 0.75, 1.1, 0.1, '#e9edf2', '#3a4048', 0.06); rrect(c, -0.65, -0.5, 0.55, 0.55, 0.06, TEAM[0].main); c.restore();
    c.strokeStyle = '#e9edf2'; c.lineCap = 'round';
    [[0.38, 0.9], [0.62, 0.6], [0.86, 0.32]].forEach(([r, o]) => { c.globalAlpha = o; c.lineWidth = 0.1; c.beginPath(); c.arc(0.05, 0, r, -0.95, 0.95); c.stroke(); });
    c.globalAlpha = 1;
    c.font = '900 0.5px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 0.1; c.strokeStyle = '#2a1d40'; c.strokeText('+1', 0.45, 0.72); c.fillStyle = '#ffe08a'; c.fillText('+1', 0.45, 0.72);
  } else if (spell === 'wachkiste') {
    for (const x of [-0.6, 0, 0.6]) line(c, x, -1.0, x, -0.62, 'rgba(255,255,255,.4)', 0.09);
    rrect(c, -0.7, -0.45, 1.4, 1.25, 0.08, '#9a6634', '#3b2716', 0.07);
    c.fillStyle = TEAM[0].main; c.fillRect(-0.7, 0.02, 1.4, 0.3);
    for (const x of [-0.5, 0.5]) line(c, x, -0.42, x, 0.77, '#5d3d1f', 0.07);
    line(c, -0.67, -0.42, 0.67, -0.42, '#c79a5e', 0.08);
    poly(c, [-0.24, -0.2, 0.24, -0.2, 0.24, 0.25, 0, 0.55, -0.24, 0.25], '#e9edf2', '#3a4048', 0.05); line(c, 0, -0.12, 0, 0.4, TEAM[0].main, 0.08);
  } else if (spell === 'sternenschlund') {
    c.shadowColor = '#b06adf'; c.shadowBlur = 16; circ(c, 0, 0, 0.85, '#2a1d40', '#7a4fd0', 0.07); c.shadowBlur = 0;
    c.lineCap = 'round';
    [[0.68, '#5a3aa0', 0.12], [0.48, '#7a4fd0', 0.11], [0.28, '#b06adf', 0.1]].forEach(([r, col, w], i) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.arc(0, 0, r, i * 1.3, i * 1.3 + 4.2); c.stroke(); });
    circ(c, 0, 0, 0.1, '#0c0814');
    for (const [x, y, r] of [[-0.55, -0.45, 0.07], [0.6, -0.3, 0.05], [0.4, 0.6, 0.06], [-0.5, 0.5, 0.04], [0.05, -0.72, 0.04]]) circ(c, x, y, r, '#fff6d8');
  } else {
    c.shadowColor = '#7dffa8'; c.shadowBlur = 10;
    c.beginPath(); c.moveTo(0, -0.85); c.bezierCurveTo(0.8, 0.1, 0.6, 0.8, 0, 0.8); c.bezierCurveTo(-0.6, 0.8, -0.8, 0.1, 0, -0.85);
    c.fillStyle = '#58d68d'; c.fill(); c.strokeStyle = '#1f7a48'; c.lineWidth = 0.06; c.stroke(); c.shadowBlur = 0;
    rrect(c, -0.1, 0.0, 0.2, 0.55, 0.04, '#fff'); rrect(c, -0.28, 0.18, 0.56, 0.2, 0.04, '#fff');
  }
}

// Zeichnet das Bild einer Karte in ein Rechteck w×h (Pixel) des Kontexts.
export function drawCardArt(c, id, w, h, figure) {
  const card = CARDS[id];
  const [a, b] = CARD_BG[card.type];
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, a); g.addColorStop(1, b);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.08)';
  c.beginPath(); c.ellipse(w / 2, h * 0.7, w * 0.42, h * 0.16, 0, 0, TAU); c.fill();
  if (figure && card.type !== 'spell') { c.drawImage(figure, 0, 0, w, h); return; }
  c.save();
  if (card.type === 'spell') {
    const k = Math.min(w, h) * 0.38;
    c.translate(w / 2, h * 0.46); c.scale(k, k);
    spellIcon(c, card.spell);
  } else {
    const u = UNITS[card.unit];
    const span = (card.count > 1 ? 2.3 : 1) * Math.max(u.r * 2.6, 1.0) + (u.air ? 0.6 : 0);
    const k = Math.min(w, h) / span * 0.82;
    c.translate(w / 2, h * (u.building ? 0.5 : u.air ? 0.48 : 0.6)); c.scale(k, k);
    const spots = card.count === 1 ? [[0, 0]] : card.count > 4 ? [[-0.6, -0.3], [0, -0.4], [0.6, -0.3], [-0.3, 0.35], [0.35, 0.4]] : card.count === 2 ? [[-0.5, 0], [0.5, 0.05]] : card.count === 3 ? [[0, -0.35], [-0.5, 0.25], [0.5, 0.3]] : [[-0.4, -0.3], [0.4, -0.25], [-0.45, 0.35], [0.4, 0.4]];
    spots.forEach(([x, y], i) => {
      c.save(); c.translate(x * u.r * 2.6, y * u.r * 2.6);
      drawFigure(c, { type: card.unit, model: u.model || card.unit, side: 0, r: u.r, face: 1, anim: 0, id: i, kind: u.building ? 'building' : 'unit', active: true, x: 0 }, 0.4 + i, false);
      c.restore();
    });
  }
  c.restore();
}

// App-Symbol: Runenkristall auf dunklem Grund
export function drawIcon(c, size, pad = 0) {
  const g = c.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#1f4a57'); g.addColorStop(1, '#0d1c26');
  c.fillStyle = g; c.fillRect(0, 0, size, size);
  const k = (size - pad * 2) / 4.2;
  c.save(); c.translate(size / 2, size / 2 + k * 0.75); c.scale(k, k);
  ell(c, 0, 0.75, 1.5, 0.4, 'rgba(0,0,0,.35)');
  rrect(c, -1.15, -0.35, 2.3, 1.1, 0.25, '#7f8791', '#2a313b', 0.09);
  rrect(c, -1.15, -0.35, 2.3, 0.4, 0.25, '#9aa2ac');
  for (let i = -1; i <= 1; i++) rrect(c, i * 0.76 - 0.27, -0.66, 0.54, 0.44, 0.05, '#9aa2ac', '#2a313b', 0.08);
  c.shadowColor = '#2ec4b6'; c.shadowBlur = size * 0.08;
  poly(c, [0, -2.45, 0.75, -1.25, 0, -0.55, -0.75, -1.25], '#2ec4b6', '#a8f3ea', 0.08);
  c.shadowBlur = 0;
  poly(c, [0, -2.45, 0.75, -1.25, 0, -1.4], 'rgba(255,255,255,.4)');
  c.restore();
}

// ---- Spielfeld ---------------------------------------------------------------------------------

export const RUNE_STONES = [[0.7, RIVER_TOP - 3.5], [17.3, RIVER_TOP - 3.5], [0.7, RIVER_BOT + 3.5], [17.3, RIVER_BOT + 3.5], [9, RIVER_TOP - 1.6], [9, RIVER_BOT + 1.6]];
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// Bodenfarben je Arena: [gegnerische Hälfte, eigene Hälfte]
const GROUND = [
  [[122, 186, 88], [112, 194, 96]],   // Moosgrund
  [[176, 180, 116], [160, 188, 112]], // Kieselfurt
  [[96, 172, 160], [88, 182, 164]],   // Nebelhain
  [[150, 158, 176], [138, 166, 182]], // Eisenklamm
  [[150, 188, 214], [136, 196, 216]], // Sturmhöhe
  [[214, 138, 98], [208, 154, 100]],  // Glutkessel
  [[112, 122, 204], [106, 134, 212]], // Sternwarte
  [[178, 138, 214], [162, 148, 220]], // Runenthron
  [[176, 206, 226], [162, 210, 230]], // Frostzinnen
  [[104, 132, 122], [96, 142, 128]],  // Schattenmoor
  [[186, 170, 132], [176, 180, 136]], // Donnerschlucht
  [[106, 174, 188], [98, 184, 196]],  // Kristallgrotte
  [[168, 150, 140], [160, 160, 146]], // Aschenfeld
  [[226, 196, 136], [218, 204, 142]], // Himmelsbrücke
];

// Kleinteile des Bodens je Arena: Tupfer (Blumen, Kiesel, Schnee, Glut …), Halme, Fluss, Uferkante
const LOOK = [
  { dots: ['#fff3c4', '#ffb3c8', '#cfe9ff', '#ffe08a'], core: '#f0a92e', tuft: 'rgba(40,90,50,.5)', river: ['#2a86c8', '#45b4ec'], bank: '#4a6b4a' },
  { dots: ['#e8e2d0', '#cfc7b0', '#f2ecd8', '#b9b29c'], core: null, tuft: 'rgba(90,100,50,.45)', river: ['#3a8fc0', '#62c0ea'], bank: '#8a8466', big: 1.5 },
  { dots: ['#d7fff4', '#a8f0e0', '#ffd6f5', '#e8fff8'], core: '#59c9b5', tuft: 'rgba(20,80,80,.5)', river: ['#1f7f8c', '#49b8c0'], bank: '#2f6b66' },
  { dots: ['#c9793a', '#8d939c', '#d9a05a', '#6f7782'], core: null, tuft: 'rgba(60,66,80,.5)', river: ['#3d6f9c', '#5c9bc8'], bank: '#555c68', big: 1.4 },
  { dots: ['#ffffff', '#e8f4ff', '#fff3c4', '#d7ecff'], core: null, tuft: 'rgba(50,90,120,.45)', river: ['#4f8fc4', '#8cc8f0'], bank: '#6f8fa8' },
  { dots: ['#ffb347', '#ff8a2a', '#ffe08a', '#ff6a3a'], core: '#fff3c4', tuft: 'rgba(110,50,30,.5)', river: ['#c9381a', '#ffb347'], bank: '#3a221c' },
  { dots: ['#fff6d8', '#ffffff', '#cfd6ff', '#ffe08a'], core: null, tuft: 'rgba(40,50,120,.5)', river: ['#2a3f9c', '#5870d8'], bank: '#2a3166' },
  { dots: ['#e7ccff', '#c98bff', '#fff3ff', '#f0b3ff'], core: '#8a4fd0', tuft: 'rgba(80,40,120,.5)', river: ['#5a3fa8', '#8f78e0'], bank: '#4a3570' },
  { dots: ['#ffffff', '#f4fbff', '#ffffff', '#e6f4ff'], core: null, tuft: 'rgba(120,160,190,.5)', river: ['#9fd4ee', '#e6f7ff'], bank: '#b8d8e8', big: 2.4 },
  { dots: ['#9be564', '#6fa83a', '#c5ee6a', '#59824a'], core: null, tuft: 'rgba(30,50,40,.55)', river: ['#34502f', '#5f7f44'], bank: '#2a382a' },
  { dots: ['#e8c890', '#c9a064', '#f2dcae', '#a8824a'], core: null, tuft: 'rgba(110,80,40,.5)', river: ['#3a7fb0', '#5fb0dc'], bank: '#8a6a43', big: 1.3 },
  { dots: ['#8fffe6', '#ffb3f0', '#d7fffa', '#b3c8ff'], core: '#ffffff', tuft: 'rgba(30,90,100,.5)', river: ['#12606e', '#2fb0b8'], bank: '#1f5560' },
  { dots: ['#6a6460', '#8a847e', '#ff8a2a', '#4a4642'], core: null, tuft: 'rgba(60,54,50,.55)', river: ['#4a5560', '#77848f'], bank: '#3a3632', big: 1.4 },
  { dots: ['#ffffff', '#fff3c4', '#ffe08a', '#ffffff'], core: '#f6c453', tuft: 'rgba(150,120,50,.45)', river: ['#bfe3ff', '#ffffff'], bank: '#e6c98a' },
];

export function paintField(c, k, arena = 0, plain = false) {
  const ground = GROUND[arena] || GROUND[0], L = LOOK[arena] || LOOK[0];
  c.save(); c.scale(k, k);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const enemy = y < RIVER_TOP;
    const base = enemy ? ground[0] : ground[1];
    const v = (x + y) % 2 ? 0 : -10, n = Math.round(hash(x, y) * 6);
    c.fillStyle = `rgb(${base[0] + v + n},${base[1] + v + n},${base[2] + v + n})`;
    c.fillRect(x, y, 1.02, 1.02);
  }
  // Trampelpfade von den Brücken zu den Türmen
  c.strokeStyle = 'rgba(232,196,120,.6)'; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const bx of BRIDGES) {
    const a = OUTER_Y - 0.5, b = MAIN_Y + 0.1;
    c.beginPath(); c.moveTo(bx, a); c.lineTo(bx, H - a); c.stroke();
    c.beginPath(); c.moveTo(bx, a); c.quadraticCurveTo(bx, b, 9, b); c.stroke();
    c.beginPath(); c.moveTo(bx, H - a); c.quadraticCurveTo(bx, H - b, 9, H - b); c.stroke();
  }
  // helle Plätze unter den Türmen
  for (const [x, y, r] of [[3.5, OUTER_Y, 1.9], [14.5, OUTER_Y, 1.9], [9, MAIN_Y, 2.5], [3.5, H - OUTER_Y, 1.9], [14.5, H - OUTER_Y, 1.9], [9, H - MAIN_Y, 2.5]]) { ell(c, x, y, r, r, 'rgba(236,214,160,.7)', 'rgba(150,120,70,.35)', 0.08); ell(c, x, y, r * 0.72, r * 0.72, null, 'rgba(150,120,70,.25)', 0.05); }
  // Blumen
  for (let i = 0; i < 60; i++) {
    const x = hash(i, 41) * W, y = hash(i, 57) * H;
    if (y > RIVER_TOP - 0.5 && y < RIVER_BOT + 0.5) continue;
    circ(c, x, y, 0.07 * (L.big || 1), L.dots[i % 4]); if (L.core) circ(c, x, y, 0.03, L.core);
  }
  // Grasbüschel und Kiesel
  for (let i = 0; i < 150; i++) {
    const x = hash(i, 11) * W, y = hash(i, 23) * H;
    if (y > RIVER_TOP - 0.4 && y < RIVER_BOT + 0.4) continue;
    if (i % 4 === 0) ell(c, x, y, 0.16, 0.11, 'rgba(180,186,190,.75)', 'rgba(60,70,70,.5)', 0.03);
    else { line(c, x, y, x - 0.08, y - 0.2, L.tuft, 0.05); line(c, x + 0.1, y, x + 0.16, y - 0.22, L.tuft, 0.05); }
  }
  // Fluss
  const rg = c.createLinearGradient(0, RIVER_TOP, 0, RIVER_BOT);
  rg.addColorStop(0, L.river[0]); rg.addColorStop(0.5, L.river[1]); rg.addColorStop(1, L.river[0]);
  c.fillStyle = L.bank; c.fillRect(0, RIVER_TOP - 0.18, W, RIVER_BOT - RIVER_TOP + 0.36);
  c.fillStyle = rg; c.fillRect(0, RIVER_TOP, W, RIVER_BOT - RIVER_TOP);
  for (let i = 0; i < 26; i++) { const x = hash(i, 5) * W, y = RIVER_TOP + 0.3 + hash(i, 9) * 1.4; line(c, x, y, x + 0.5 + hash(i, 2) * 0.5, y, 'rgba(255,255,255,.22)', 0.06); }
  // Brücken aus Steinplatten
  for (const bx of plain ? [] : BRIDGES) {
    rrect(c, bx - BRIDGE_HALF, RIVER_TOP - 0.35, BRIDGE_HALF * 2, RIVER_BOT - RIVER_TOP + 0.7, 0.2, '#a39d92', '#4a463f', 0.1);
    for (let i = 0; i < 4; i++) line(c, bx - BRIDGE_HALF + 0.15, RIVER_TOP + 0.05 + i * 0.63, bx + BRIDGE_HALF - 0.15, RIVER_TOP + 0.05 + i * 0.63, 'rgba(74,70,63,.55)', 0.05);
    rrect(c, bx - BRIDGE_HALF - 0.12, RIVER_TOP - 0.35, 0.3, RIVER_BOT - RIVER_TOP + 0.7, 0.1, '#7d776d', '#4a463f', 0.05);
    rrect(c, bx + BRIDGE_HALF - 0.18, RIVER_TOP - 0.35, 0.3, RIVER_BOT - RIVER_TOP + 0.7, 0.1, '#7d776d', '#4a463f', 0.05);
  }
  // Runensteine am Rand
  for (const [x, y] of plain ? [] : RUNE_STONES) {
    ell(c, x, y + 0.3, 0.45, 0.18, 'rgba(0,0,0,.25)');
    poly(c, [x - 0.32, y + 0.3, x - 0.25, y - 0.45, x + 0.05, y - 0.65, x + 0.3, y - 0.35, x + 0.32, y + 0.3], '#7b828c', '#333a44', 0.05);
    line(c, x - 0.05, y - 0.3, x - 0.05, y + 0.1, '#cfe9e5', 0.05); line(c, x - 0.05, y - 0.3, x + 0.12, y - 0.12, '#cfe9e5', 0.05);
  }
  c.restore();
}

export function createRenderer(canvas) {
  const c = canvas.getContext('2d');
  let ts = 20, dpr = 1, k = 20, field = null;
  let fx = [], ruins = [], shake = 0, last = 0, arena = 0;

  function resize(w, h, ratio, arenaIdx = arena) {
    arena = arenaIdx; ts = Math.max(8, Math.floor(Math.min(w / W, h / H) * 4) / 4); dpr = ratio; k = ts * dpr;
    canvas.width = Math.round(W * k); canvas.height = Math.round(H * k);
    canvas.style.width = `${W * ts}px`; canvas.style.height = `${H * ts}px`;
    field = document.createElement('canvas');
    field.width = canvas.width; field.height = canvas.height;
    paintField(field.getContext('2d'), k, arena);
  }

  function reset() { fx = []; ruins = []; shake = 0; }

  // Ereignisse der Simulation in Effekte übersetzen
  function onEvent(ev) {
    if (ev.t === 'hit') fx.push({ k: ev.splash ? 'ring' : 'spark', x: ev.x, y: ev.y, t: 0, d: ev.splash ? 0.3 : 0.18, r: ev.splash || 0.35, color: ev.splash ? '#ffd27a' : '#fff' });
    else if (ev.t === 'die') {
      if (ev.kind === 'tower') { ruins.push({ x: ev.x, y: ev.y, r: ev.main ? 1.3 : 1.0, side: ev.side }); fx.push({ k: 'boom', x: ev.x, y: ev.y, t: 0, d: 0.8, r: 2.6 }); shake = 0.5; }
      else fx.push({ k: 'puff', x: ev.x, y: ev.y - (ev.air ? 0.9 : 0), t: 0, d: 0.35, r: ev.kind === 'building' ? 0.9 : 0.45 });
    } else if (ev.t === 'deploy') fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, d: 0.35, r: 0.9, color: TEAM[ev.side].light });
    else if (ev.t === 'cast') fx.push({ k: 'cast', spell: ev.spell, side: ev.side, x: ev.x, y: ev.y, t: 0, d: ev.delay, r: ev.r });
    else if (ev.t === 'spell') {
      const col = { sternschlag: '#ffcf5a', hagelschauer: '#dff1ff', wurzelgriff: '#7fd069', heilquell: '#7dffa8' }[ev.spell];
      fx.push({ k: 'blast', x: ev.x, y: ev.y, t: 0, d: 0.45, r: ev.r, color: col });
      if (ev.spell === 'sternschlag') shake = Math.max(shake, 0.25);
    } else if (ev.t === 'heal') fx.push({ k: 'plus', x: ev.x + (Math.random() - 0.5) * 0.4, y: ev.y - 0.6, t: 0, d: 0.6 });
    else if (ev.t === 'ability' || ev.t === 'burst') fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, d: 0.5, r: ev.r, color: '#ffe08a' });
    else if (ev.t === 'wake') fx.push({ k: 'ring', x: ev.x, y: ev.y, t: 0, d: 0.6, r: 2.2, color: TEAM[ev.side].light });
  }

  function hpBar(e, x, y) {
    if (e.kind !== 'tower' && e.hp >= e.maxHp) return;
    const w = e.kind === 'tower' ? 1.9 : Math.max(0.7, e.r * 2), h = e.kind === 'tower' ? 0.3 : 0.16;
    const top = Math.max(0.12, y - (e.kind === 'tower' ? e.r * 2.2 : e.kind === 'building' ? e.r * 1.5 : e.r * 2.6 + (e.air ? 0.9 : 0)) - h);
    rrect(c, x - w / 2 - 0.04, top - 0.04, w + 0.08, h + 0.08, 0.06, 'rgba(15,20,26,.85)');
    rrect(c, x - w / 2, top, Math.max(0.02, w * e.hp / e.maxHp), h, 0.04, TEAM[e.side].main);
    if (e.kind === 'tower') text(String(Math.ceil(e.hp)), x, top + h / 2, 0.42, '#fff', true);
  }

  // Text in Pixeln setzen (Schriftgrößen unter 1 px sind in manchen Browsern unzuverlässig)
  function text(str, x, y, size, color, outline) {
    c.save(); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.font = `800 ${Math.round(size * ts)}px -apple-system, system-ui, "Segoe UI", sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (outline) { c.lineWidth = 3; c.strokeStyle = 'rgba(15,20,26,.9)'; c.lineJoin = 'round'; c.strokeText(str, x * ts, y * ts); }
    c.fillStyle = color; c.fillText(str, x * ts, y * ts);
    c.restore();
  }

  function drawFx(dt) {
    for (const f of fx) {
      f.t += dt;
      const p = Math.min(1, f.t / f.d);
      if (f.k === 'spark') { for (let i = 0; i < 5; i++) { const a = i * 1.26 + f.x * 3; line(c, f.x + Math.cos(a) * p * 0.2, f.y + Math.sin(a) * p * 0.2, f.x + Math.cos(a) * (0.15 + p * 0.4), f.y + Math.sin(a) * (0.15 + p * 0.4), `rgba(255,255,255,${1 - p})`, 0.06); } }
      else if (f.k === 'ring') { c.globalAlpha = 1 - p; circ(c, f.x, f.y, f.r * (0.4 + p * 0.6), null, f.color, 0.1); c.globalAlpha = 1; }
      else if (f.k === 'puff') { c.globalAlpha = (1 - p) * 0.8; for (let i = 0; i < 5; i++) { const a = i * 1.26; circ(c, f.x + Math.cos(a) * p * f.r, f.y + Math.sin(a) * p * f.r - p * 0.3, f.r * (0.5 - p * 0.25), '#e9edf2'); } c.globalAlpha = 1; }
      else if (f.k === 'boom') { c.globalAlpha = 1 - p; circ(c, f.x, f.y, f.r * p, 'rgba(255,190,90,.6)', '#fff', 0.15); for (let i = 0; i < 9; i++) { const a = i * 0.7; circ(c, f.x + Math.cos(a) * p * f.r, f.y + Math.sin(a) * p * f.r, 0.18, '#7f8791'); } c.globalAlpha = 1; }
      else if (f.k === 'blast') { c.globalAlpha = (1 - p) * 0.7; circ(c, f.x, f.y, f.r * (0.6 + p * 0.4), f.color, '#fff', 0.1); c.globalAlpha = 1; }
      else if (f.k === 'plus') { c.globalAlpha = 1 - p; rrect(c, f.x - 0.05, f.y - p * 0.6 - 0.16, 0.1, 0.32, 0.02, '#7dffa8'); rrect(c, f.x - 0.16, f.y - p * 0.6 - 0.05, 0.32, 0.1, 0.02, '#7dffa8'); c.globalAlpha = 1; }
      else if (f.k === 'cast') {
        c.globalAlpha = 0.35; circ(c, f.x, f.y, f.r, TEAM[f.side].main); c.globalAlpha = 0.9; circ(c, f.x, f.y, f.r, null, TEAM[f.side].light, 0.07); c.globalAlpha = 1;
        if (f.spell === 'sternschlag') { const sx = f.x - (1 - p) * 4, sy = f.y - (1 - p) * 9; line(c, sx - 0.6, sy - 1.3, sx, sy, 'rgba(255,220,130,.6)', 0.3); c.shadowColor = '#ffcf5a'; c.shadowBlur = 14; circ(c, sx, sy, 0.38, '#ffe08a', '#e08a1f', 0.06); c.shadowBlur = 0; }
        else if (f.spell === 'hagelschauer') for (let i = 0; i < 16; i++) { const a = hash(i, 3) * TAU, r = Math.sqrt(hash(i, 8)) * f.r, q = (p + hash(i, 1)) % 1, hx = f.x + Math.cos(a) * r, hy = f.y + Math.sin(a) * r - (1 - q) * 3; line(c, hx + 0.1, hy - 0.4, hx, hy, 'rgba(235,246,255,.85)', 0.07); }
      }
    }
    fx = fx.filter(f => f.t < f.d);
  }

  // g: Spielzustand, a: Anteil des laufenden Simulationsschritts (für weiche Bewegung), ui: Auswahl/Geist
  function draw(g, a, ui, now) {
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0); last = now;
    const time = now / 1000;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(field, 0, 0);
    let sx = 0, sy = 0;
    if (shake > 0) { shake -= dt; sx = (Math.random() - 0.5) * shake * 0.5; sy = (Math.random() - 0.5) * shake * 0.5; }
    c.setTransform(k, 0, 0, k, sx * k, sy * k);

    for (const r of ruins) {
      ell(c, r.x, r.y + 0.2, r.r * 1.1, r.r * 0.75, 'rgba(40,36,30,.55)');
      for (let i = 0; i < 6; i++) { const q = hash(i, Math.round(r.x * 7 + r.y)); rrect(c, r.x - r.r + q * r.r * 1.6, r.y - 0.3 + hash(i, 4) * 0.7, 0.4, 0.3, 0.06, i % 2 ? '#7f8791' : '#9aa2ac', '#333a44', 0.04); }
    }

    // Auswahl: gesperrten Bereich abdunkeln
    const sel = ui && ui.sel != null ? g.sides[0].hand[ui.sel] : null;
    if (sel && CARDS[sel].type !== 'spell' && !CARDS[sel].anywhere) {
      c.fillStyle = 'rgba(190,40,60,.22)';
      for (const lane of [0, 1]) {
        const open = !outerTower(g, 1, lane);
        c.fillRect(lane * W / 2, 0, W / 2, open ? POCKET : RIVER_BOT + 0.2);
        if (open) c.fillRect(lane * W / 2, RIVER_TOP - 0.2, W / 2, RIVER_BOT - RIVER_TOP + 0.4);
      }
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.06; c.setLineDash([0.3, 0.25]);
      c.beginPath(); c.moveTo(0, RIVER_BOT + 0.2); c.lineTo(W, RIVER_BOT + 0.2); c.stroke(); c.setLineDash([]);
    }

    // Heilkreise
    for (const z of g.zones) if (z.hit && CARDS[z.card].heal) {
      c.globalAlpha = 0.22 + 0.08 * Math.sin(time * 6); circ(c, z.x, z.y, z.r, '#58d68d'); c.globalAlpha = 0.8; circ(c, z.x, z.y, z.r, null, '#b6ffd0', 0.06); c.globalAlpha = 1;
    }

    const list = g.ents.slice().sort((p, q) => (p.air - q.air) || (p.y - q.y));
    for (const e of list) {
      const x = e.ox + (e.x - e.ox) * a, y = e.oy + (e.y - e.oy) * a;
      e._x = x; e._y = y;
      const moving = e.kind === 'unit' && !e.inRange && e.deployT <= 0 && e.rootT <= 0;
      c.save(); c.translate(x, y);
      if (e.kind === 'unit') {
        ell(c, 0, e.r * 0.75, e.r * 1.05, e.r * 0.5, 'rgba(0,0,0,.28)');
        ell(c, 0, e.r * 0.75, e.r * 1.05, e.r * 0.5, null, TEAM[e.side].main, 0.07);
      }
      if (e.rootT > 0) for (let i = 0; i < 5; i++) { const q = i * 1.26 + e.id; line(c, Math.cos(q) * e.r * 1.1, e.r * 0.7 + Math.sin(q) * e.r * 0.4, Math.cos(q) * e.r * 0.4, -e.r * 0.3, '#3f8a3a', 0.09); }
      if (e.air) c.translate(0, -0.9 + Math.sin(time * 3 + e.id) * 0.07);
      if (e.deployT > 0) c.globalAlpha = 0.55;
      if (e.model === 'ballista' || e.model === 'steinschleuder') { const t = e.targetId && g.byId.get(e.targetId); if (t) e.aim = Math.atan2(t.y - e.y, t.x - e.x); }
      drawFigure(c, e, time, moving);
      c.restore();
      if (e.main && !e.active) text('z z', x + 0.9, y - e.r * 1.9 + Math.sin(time * 2) * 0.1, 0.5, '#fff', true);
    }

    // Geschosse
    for (const p of g.projs) {
      const x = p.ox + (p.x - p.ox) * a, y = p.oy + (p.y - p.oy) * a - (p.air ? 0.5 : 0.4);
      if (p.line) { if (p.from === 'rollstein') rrect(c, x - p.w / 2, y, p.w, 0.8, 0.35, '#8d939c', '#3a4048', 0.08); else circ(c, x, y, p.from === 'kegler' ? 0.4 : 0.14, p.from === 'kegler' ? '#8d939c' : '#fff27a', '#3a4048', 0.05); continue; }
      const ang = Math.atan2(p.ty - p.y, p.tx - p.x), dx = Math.cos(ang), dy = Math.sin(ang);
      if (p.from === 'waldlaeufer') line(c, x - dx * 0.45, y - dy * 0.45, x, y, '#f3ead2', 0.07);
      else if (p.from === 'ballista') line(c, x - dx * 0.7, y - dy * 0.7, x, y, '#e6e9ee', 0.11);
      else if (p.from === 'funkenweberin') { c.shadowColor = '#ff9a3a'; c.shadowBlur = 10; circ(c, x, y, 0.22, '#ffd27a', '#ff8a2a', 0.05); c.shadowBlur = 0; }
      else if (p.from === 'rochen') { circ(c, x, y, 0.26, 'rgba(190,170,240,.9)', '#fff', 0.04); }
      else { c.shadowColor = TEAM[p.side].main; c.shadowBlur = 8; circ(c, x, y, 0.17, TEAM[p.side].light, TEAM[p.side].dark, 0.04); c.shadowBlur = 0; }
    }

    for (const e of list) hpBar(e, e._x, e._y);
    drawFx(dt);

    // Geist der gewählten Karte unter dem Finger
    if (sel && ui.ghost) {
      const card = CARDS[sel], p = clampDeploy(g, 0, sel, ui.ghost.x, ui.ghost.y);
      const r = card.type === 'spell' ? card.radius : Math.max(0.9, UNITS[card.unit].r * (card.count > 1 ? 2.4 : 1.4));
      const ok = g.sides[0].kraft >= card.cost;
      c.globalAlpha = 0.3; circ(c, p.x, p.y, r, ok ? TEAM[0].main : '#c33'); c.globalAlpha = 1;
      circ(c, p.x, p.y, r, null, ok ? '#fff' : '#ffb3b3', 0.08);
      if (card.type !== 'spell') { const u = UNITS[card.unit]; if (u.range >= 2) { c.setLineDash([0.25, 0.25]); circ(c, p.x, p.y, u.range + u.r, null, 'rgba(255,255,255,.6)', 0.05); c.setLineDash([]); } }
      text(card.name, p.x, Math.max(0.5, p.y - r - 0.5), 0.55, '#fff', true);
    }
  }

  function toField(cx, cy) {
    const r = canvas.getBoundingClientRect();
    const x = (cx - r.left) / ts, y = (cy - r.top) / ts;
    return x >= -0.5 && x <= W + 0.5 && y >= -0.5 && y <= H + 0.3 ? { x, y } : null;
  }

  return { resize, reset, onEvent, draw, toField, snapshot: () => null, prepare: null, setOptions: () => {} };
}
