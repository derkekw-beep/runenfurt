// Bildschicht der Engine: Zeichner, Licht, Kamera, Arena (Boden, Wasser, Brücken, Mauern, Umland, Schwebeteilchen)
// und die Nachbearbeitung (Leuchten heller Stellen, Farbabstimmung, Randabdunklung).
// Die 3D-Teile aus Blender laden im Hintergrund; bis sie da sind, steht die Arena ohne Mauern und Brücken.
import { THREE, W, H, RIVER_TOP, RIVER_BOT, BRIDGES, BRIDGE_HALF, OUTER_Y, MAIN_Y, THEMES, merge, P, sph } from './deps.js';
import { groundTheme, paintGround, paintOuter } from './ground.js';
import { loadProps, propMaterial } from './meshes.js';
import { pinPrograms } from './halten.js';

export const PITCH = 58 * Math.PI / 180;     // steil von oben, mit langer Brennweite: das Feld füllt die Breite fast ohne Verzerrung
export const SUN = new THREE.Vector3(-9, 20, 7).normalize();          // Richtung zum Licht
// Anteil des Himmelslichts auf dem Boden: so dunkel und so gefärbt ist ein Schatten (auch der unter den 2D-Figuren)
const SKY = [0.80, 0.86, 1.0], SKY_SHARE = 0.62, GROUND_BOUNCE = [0.55, 0.50, 0.45];
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const lin = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export function createLook(canvas, opt = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.autoClear = false; renderer.info.autoReset = false;
  const hdr = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const scene = new THREE.Scene();
  const world = new THREE.Group(); scene.add(world);
  const bg = new THREE.Color('#3f7f3c');
  scene.fog = new THREE.Fog(bg, 150, 200);
  // Licht so gewählt, dass besonnter Boden genau seine gemalte Farbe zeigt: Himmel 62 % (kühl), Sonne 38 % (warm).
  // Jede Arena färbt und dämpft das im Verhältnis zu ihrer Kulisse (setArena).
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1), sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(W / 2, 0, H / 2).addScaledVector(SUN, 30); sun.target.position.set(W / 2, 0, H / 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 22, bottom: -22, near: 1, far: 70 });
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(hemi, sun, sun.target);
  const camera = new THREE.PerspectiveCamera(13, 1, 4, 700);
  const q = { maxDpr: opt.maxDpr ?? 3, samples: opt.samples ?? 4 };
  let width = 300, height = 400, dpr = 1, ratioAsked = 1;
  const shadowTint = new THREE.Vector3(...SKY.map(v => v * SKY_SHARE)), lightTint = new THREE.Color(1, 1, 1);

  // ---- Nachbearbeitung -------------------------------------------------------------------------
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new THREE.Mesh(tri, null); quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad); const qCam = new THREE.Camera();
  const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  let rtScene = null; const chain = []; const LEVELS = 5;
  const mk = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, ...extra });
  const matPre = mk(`uniform sampler2D tSrc; uniform float uThr; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = max(c.r, max(c.g, c.b)); if (!(l >= 0.0 && l < 1000.0)) { c = vec3(0.0); l = 0.0; }   // ungültige Werte würden sich sonst über das ganze Bild ausbreiten
      float k = max(0.0, l - uThr); k = k * k / (k + 0.25);
      gl_FragColor = vec4(c * (k / max(l, 1e-4)), 1.0); }`, { tSrc: { value: null }, uThr: { value: hdr ? 1.0 : 0.82 } });
  const matDown = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 4.0;
      c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
      gl_FragColor = vec4(c / 8.0, 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const matUp = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tSrc, vUv + uTexel * vec2(2.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-2.0, 0.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, 2.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.0, -2.0)).rgb;
      c += 2.0 * (texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb);
      gl_FragColor = vec4(c / 12.0, 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending, transparent: true });
  const grade = { uBloom: { value: 0.85 }, uSat: { value: 1.12 }, uContrast: { value: 1.06 }, uVig: { value: 0.30 }, uFlash: { value: 0 }, uFade: { value: 0 }, uTime: { value: 0 } };
  const matOut = mk(`uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom, uSat, uContrast, uVig, uFlash, uFade, uTime; varying vec2 vUv;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec3 s0 = texture2D(tScene, vUv).rgb; if (!(s0.r + s0.g + s0.b < 3000.0)) s0 = vec3(0.0);
      vec3 c = s0 + texture2D(tBloom, vUv).rgb * uBloom;
      c = max(c, 0.0);
      c = mix(c, 0.8 + (1.0 - exp(-(c - 0.8) * 2.5)) * 0.2, step(0.8, c));           // helle Stellen weich nach Weiß auslaufen lassen
      c = mix(c, vec3(1.0), uFlash);
      c = mix(pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, c * 12.92, step(c, vec3(0.0031308)));   // in Bildschirmfarben
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uContrast + 0.5;
      c += vec3(-0.012, 0.0, 0.02) * (1.0 - l) * (1.0 - l) + vec3(0.012, 0.006, -0.01) * l * l;   // Schatten kühl, Lichter warm
      float d = length((vUv - 0.5) * vec2(0.9, 1.0));
      c *= 1.0 - uVig * smoothstep(0.42, 0.82, d);
      c *= 1.0 - uFade;
      c += (h21(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0); }`, { tScene: { value: null }, tBloom: { value: null }, ...grade });

  function buildTargets() {
    const w = Math.max(2, Math.round(width * dpr)), h = Math.max(2, Math.round(height * dpr));
    if (rtScene) { rtScene.dispose(); for (const c of chain) c.dispose(); chain.length = 0; }
    rtScene = new THREE.WebGLRenderTarget(w, h, { type, samples: q.samples, depthBuffer: true });
    let cw = w, ch = h;
    for (let i = 0; i < LEVELS; i++) { cw = Math.max(2, cw >> 1); ch = Math.max(2, ch >> 1); chain.push(new THREE.WebGLRenderTarget(cw, ch, { type, depthBuffer: false })); }
  }
  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };

  function render(time) {
    renderer.info.reset();
    renderer.setRenderTarget(rtScene); renderer.setClearColor(bg, 1); renderer.clear();
    renderer.render(scene, camera);
    matPre.uniforms.tSrc.value = rtScene.texture; pass(matPre, chain[0]);
    for (let i = 1; i < LEVELS; i++) { matDown.uniforms.tSrc.value = chain[i - 1].texture; matDown.uniforms.uTexel.value.set(0.5 / chain[i - 1].width, 0.5 / chain[i - 1].height); pass(matDown, chain[i]); }
    for (let i = LEVELS - 1; i > 0; i--) { matUp.uniforms.tSrc.value = chain[i].texture; matUp.uniforms.uTexel.value.set(0.5 / chain[i].width, 0.5 / chain[i].height); pass(matUp, chain[i - 1]); }
    matOut.uniforms.tScene.value = rtScene.texture; matOut.uniforms.tBloom.value = chain[0].texture; grade.uTime.value = time % 10;
    pass(matOut, null);
    pinPrograms(renderer);   // kein Programm wird je wieder verworfen und neu übersetzt (engine/halten.js)
  }

  // ---- Kamera: das ganze Feld passt ins Bild ----------------------------------------------------------
  const v3 = new THREE.Vector3(), base = new THREE.Vector3();
  function fitCamera() {
    camera.aspect = width / height;
    const dir = new THREE.Vector3(0, -Math.sin(PITCH), -Math.cos(PITCH)), target = new THREE.Vector3(W / 2, 0, H / 2);
    const pts = [[-0.45, 0, -0.5], [W + 0.45, 0, -0.5], [-0.45, 0, H + 0.45], [W + 0.45, 0, H + 0.45], [W / 2 - 1.6, 4.9, MAIN_Y], [W / 2 + 1.6, 4.9, MAIN_Y], [2, 3.6, OUTER_Y], [W - 2, 3.6, OUTER_Y]];
    let dist = 150;
    for (let it = 0; it < 14; it++) {
      camera.position.copy(target).addScaledVector(dir, -dist);
      camera.lookAt(target); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      let x1 = 0, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { v3.set(...p).project(camera); x1 = Math.max(x1, Math.abs(v3.x)); y0 = Math.min(y0, v3.y); y1 = Math.max(y1, v3.y); }
      const mid = (y0 + y1) / 2, ext = Math.max(x1, (y1 - y0) / 2);
      camera.projectionMatrix.elements[9] = mid;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      if (Math.abs(ext - 0.985) < 0.002) break;
      dist *= ext / 0.985;
    }
    base.copy(camera.position);
    const d = camera.position.distanceTo(target);
    scene.fog.near = d + 9; scene.fog.far = d + 44;
  }

  function resize(w, h, ratio) {
    width = Math.max(50, Math.floor(w)); height = Math.max(50, Math.floor(h)); ratioAsked = ratio; dpr = Math.min(q.maxDpr, ratio);
    renderer.setPixelRatio(dpr); renderer.setSize(width, height, false);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    buildTargets(); fitCamera();
  }
  // Güte: Auflösung, Kantenglättung, Schatten
  function setQuality(o) {
    const before = `${q.maxDpr}/${q.samples}`;
    if (o.maxDpr != null) q.maxDpr = o.maxDpr; if (o.samples != null) q.samples = o.samples;
    if (o.shadows != null) sun.castShadow = !!o.shadows;
    if (rtScene && before !== `${q.maxDpr}/${q.samples}`) resize(width, height, ratioAsked);
  }

  // ---- Arena ---------------------------------------------------------------------------------------
  let props = null, arena = null, arenaIdx = -1, T = groundTheme(0), theme = THEMES[0], motes = null, clouds = [], stormT = 5, flashT = 0;
  const water = { mat: null };
  const matPlain = propMaterial(-1), matSide = [propMaterial(0), propMaterial(1)];
  // Mauern, Pfosten, Brücken: schreiben keine Tiefe und kommen nach allem anderen Festen an die Reihe. So verdecken sie,
  // was hinter ihnen liegt, aber nie eine Figur (die steht immer davor oder darauf).
  const edge = m => { m.depthWrite = false; m.userData.noDepth = true; return m; };
  const matEdge = edge(propMaterial(-1)), matEdgeSide = [edge(propMaterial(0)), edge(propMaterial(1))];
  const matOld = new THREE.MeshLambertMaterial({ vertexColors: true }), matOldGlow = new THREE.MeshBasicMaterial({ vertexColors: true });   // Umland der Arenen ohne neue Kulisse
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.9 });
  const dotTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d'), g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(cv); })();
  const dummy = new THREE.Object3D();
  function instanced(name, part, mat, list) {   // list: [x, y, z, drehung, größe, breite]
    const im = new THREE.InstancedMesh(props[name].parts[part].geo, mat, list.length), piv = props[name].parts[part].pivot;
    list.forEach((p, i) => {
      const s = p[4] ?? 1, sx = p[5] ?? s;
      dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, p[3] || 0, 0); dummy.scale.set(sx, s, s);
      dummy.position.add(v3.set(piv[0], piv[1], piv[2]).multiplyScalar(s).applyEuler(dummy.rotation)); dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.userData.shared = true;
    if (mat.userData.noDepth) im.renderOrder = 2;
    return im;
  }

  function buildArena() {
    if (arena) { world.remove(arena); arena.traverse(o => { if (o.isMesh && !o.userData.shared) o.geometry.dispose(); if (o.material && o.material.map && o.material.map !== dotTex) o.material.map.dispose(); }); }
    if (motes) { scene.remove(motes.pts); motes.pts.geometry.dispose(); motes.pts.material.dispose(); motes = null; }
    clouds = []; stormT = 4; flashT = 0;
    const idx = Math.max(0, arenaIdx);
    theme = THEMES[idx] || THEMES[0]; T = groundTheme(idx);
    // Licht und Hintergrund der Arena: im Verhältnis zur ersten Kulisse gefärbt und gedämpft
    const b0 = THEMES[0], rat = (a, b) => { const x = lin(a), y = lin(b); return x.map((v, i) => v / Math.max(0.05, y[i])); };
    const hs = rat(theme.hemi[0], b0.hemi[0]), hg = rat(theme.hemi[1], b0.hemi[1]), ss = rat(theme.sun[0], b0.sun[0]);
    const hk = theme.hemi[2] / b0.hemi[2], sk = theme.sun[1] / b0.sun[1];
    const sky = SKY.map((v, i) => v * hs[i] * hk), sunC = SKY.map((v, i) => (1 - SKY_SHARE * v) / (1 - SKY_SHARE) * ss[i] * sk);
    hemi.color.setRGB(...sky); hemi.groundColor.setRGB(...GROUND_BOUNCE.map((v, i) => v * hg[i] * hk)); hemi.intensity = SKY_SHARE * Math.PI;
    sun.color.setRGB(...sunC); sun.intensity = (1 - SKY_SHARE) * Math.PI / SUN.y;
    const tot = sky.map((v, i) => v * SKY_SHARE + sunC[i] * (1 - SKY_SHARE));            // Helligkeit besonnten Bodens gegenüber der ersten Arena
    shadowTint.set(...sky.map((v, i) => v * SKY_SHARE / Math.max(0.05, tot[i])));
    lightTint.setRGB(...tot.map(v => 0.35 + 0.65 * v));                                   // Figuren sind fertig beleuchtet gemalt: nur leicht mitfärben
    bg.set(toHexOuter(T.outer)).multiplyScalar(0.55); scene.fog.color.copy(bg);
    arena = new THREE.Group(); world.add(arena);
    // Feld: gemaltes Bodenbild auf zwei Hälften (dazwischen liegt der Fluss tiefer)
    const K = opt.groundK ?? 80, cv = document.createElement('canvas'); cv.width = W * K; cv.height = H * K;
    paintGround(cv.getContext('2d'), K, T);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const gm = new THREE.MeshLambertMaterial({ map: tex });
    for (const [z0, z1] of [[0, RIVER_TOP], [RIVER_BOT, H]]) {
      const g = new THREE.PlaneGeometry(W, z1 - z0), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? 1 - z0 / H : 1 - z1 / H);
      const m = new THREE.Mesh(g, gm); m.rotation.x = -Math.PI / 2; m.position.set(W / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; arena.add(m);
    }
    // Umland: wiederholte Kachel in der Farbe der Arena; der Fluss bleibt frei (er fließt links und rechts aus dem Bild)
    const oc = document.createElement('canvas'); oc.width = oc.height = 256; paintOuter(oc.getContext('2d'), 256, T);
    const ot = new THREE.CanvasTexture(oc); ot.colorSpace = THREE.SRGBColorSpace; ot.wrapS = ot.wrapT = THREE.RepeatWrapping; ot.repeat.set(22, 22); ot.anisotropy = 4;
    const om = new THREE.MeshLambertMaterial({ map: ot });
    for (const [z0, z1] of [[H / 2 - 44, RIVER_TOP], [RIVER_BOT, H / 2 + 44]]) {
      const g = new THREE.PlaneGeometry(88, z1 - z0), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) > 0.5 ? z0 : z1) / 88);
      const m = new THREE.Mesh(g, om); m.rotation.x = -Math.PI / 2; m.position.set(W / 2, -0.02, (z0 + z1) / 2); m.receiveShadow = true; arena.add(m);
    }
    // Fluss: Wasserfläche mit Strömung und Schaum, Uferwände
    const bank = new THREE.MeshLambertMaterial({ color: T.bank });
    for (const z of [RIVER_TOP + 0.02, RIVER_BOT - 0.02]) { const m = new THREE.Mesh(new THREE.BoxGeometry(60, 0.5, 0.04), bank); m.position.set(W / 2, -0.25, z); arena.add(m); }
    const c3 = h => new THREE.Vector3(...lin(h));
    water.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDeep: { value: c3(T.water.deep) }, uShallow: { value: c3(T.water.shallow) }, uFoam: { value: c3(T.water.foam) }, uBridge: { value: new THREE.Vector2(BRIDGES[0], BRIDGES[1]) }, uShade: { value: shadowTint }, uLight: { value: new THREE.Vector3(...tot) } },
      vertexShader: 'varying vec2 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `uniform float uTime; uniform vec3 uDeep, uShallow, uFoam, uShade, uLight; uniform vec2 uBridge; varying vec2 vP;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
        void main(){
          float v = (vP.y - ${RIVER_TOP.toFixed(1)}) / ${(RIVER_BOT - RIVER_TOP).toFixed(1)};
          float edge = min(v, 1.0 - v);
          vec3 col = mix(uShallow, uDeep, smoothstep(0.02, 0.40, edge));
          float n = vn(vec2(vP.x * 0.8 - uTime * 0.55, vP.y * 3.2)) * 0.6 + vn(vec2(vP.x * 2.3 - uTime * 1.0, vP.y * 6.0 + 4.0)) * 0.4;
          col += uFoam * smoothstep(0.60, 0.68, n) * 0.22;                                    // helle Strömungsfäden
          col *= 0.94 + 0.12 * vn(vec2(vP.x * 0.35 - uTime * 0.2, vP.y * 1.2));
          float wob = 0.07 + 0.035 * sin(vP.x * 3.1 + uTime * 1.9) + 0.02 * sin(vP.x * 7.3 - uTime * 2.6);
          col = mix(col, uFoam, smoothstep(wob, wob * 0.45, edge) * 0.9);                      // Schaum am Ufer
          float sp = vn(vec2(vP.x * 9.0 - uTime * 2.0, vP.y * 14.0)); col += uFoam * 1.6 * smoothstep(0.93, 0.97, sp) * smoothstep(0.1, 0.3, edge);   // Glitzern
          float br = min(abs(vP.x - 0.45 - uBridge.x), abs(vP.x - 0.45 - uBridge.y));
          col *= mix(uShade, vec3(1.0), smoothstep(${(BRIDGE_HALF + 0.05).toFixed(2)}, ${(BRIDGE_HALF + 0.35).toFixed(2)}, br));   // Schatten der Brücken
          col *= mix(uShade * 1.15, vec3(1.0), smoothstep(0.0, 0.16, v));                      // Schatten der Uferkante
          gl_FragColor = vec4(col * uLight, 1.0); }`,
    });
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(60, RIVER_BOT - RIVER_TOP), water.mat); wm.rotation.x = -Math.PI / 2; wm.position.set(W / 2, -0.2, (RIVER_TOP + RIVER_BOT) / 2); arena.add(wm);
    if (props) {
      // Brücken (Bohlen bündig mit dem Boden), Kugeln an den Enden in der Farbe der jeweiligen Seite
      for (const bx of BRIDGES) {
        const p = [[bx, 0, (RIVER_TOP + RIVER_BOT) / 2, 0, 1]];
        arena.add(instanced('bruecke', 'body', matEdge, p), instanced('bruecke', 'ball0', matEdgeSide[0], p), instanced('bruecke', 'ball1', matEdgeSide[1], p));
      }
      // Mauer ringsum (am Fluss offen), in der Steinfarbe der Arena; Pfosten mit Fahnen an den Ecken und Flussenden
      const wallTint = lin(theme.wall[1]).map((v, i) => Math.min(1.25, v / lin('#b4bbc4')[i]));
      matEdge.userData.u.uTintMul.value.set(...wallTint);
      const walls = [], run = (x0, z0, x1, z1) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 2)), a = Math.atan2(-(z1 - z0), x1 - x0); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; walls.push([x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, a, 1, L / (2 * n)]); } };
      run(-0.2, -0.2, W + 0.2, -0.2); run(-0.2, H + 0.2, W + 0.2, H + 0.2);
      for (const x of [-0.2, W + 0.2]) { run(x, 0, x, RIVER_TOP - 0.3); run(x, RIVER_BOT + 0.3, x, H); }
      arena.add(instanced('mauer', 'body', matEdge, walls));
      const posts = [[], []];
      for (const x of [-0.2, W + 0.2]) { posts[1].push([x, 0, -0.2, 0], [x, 0, RIVER_TOP - 0.55, 0]); posts[0].push([x, 0, RIVER_BOT + 0.55, 0], [x, 0, H + 0.2, 0]); }
      arena.add(instanced('pfosten', 'body', matEdge, [...posts[0], ...posts[1]]));
      for (const s of [0, 1]) arena.add(instanced('pfosten', 'flag', matEdgeSide[s], posts[s].map(p => [p[0], p[1], p[2], p[0] < 0 ? Math.PI : 0])));
    }
    let seed = 7 + idx * 13; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    if (idx === 0 && props) {
      // Moosgrund: Wald aus den neuen Bäumen oben und an den Seiten, unten nur Niedriges (dort schaut die Kamera über den Rand)
      const lists = { baum: [], tanne: [], busch: [], fels: [], stein: [] }, put = (kind, x, z, s) => lists[kind].push([x, 0, z, r() * 6.28, s]);
      for (let i = 0; i < 150; i++) {
        const side = i % 3, t = r();
        const x = side === 0 ? -1.9 - r() * 10 : side === 1 ? W + 1.9 + r() * 10 : -9 + t * (W + 18), z = side === 2 ? -1.9 - r() * 11 : -7 + t * (H + 7);
        if (z > RIVER_TOP - 1.2 && z < RIVER_BOT + 1.2) continue;
        const k = r();
        put(k < 0.42 ? 'baum' : k < 0.72 ? 'tanne' : k < 0.86 ? 'busch' : k < 0.94 ? 'fels' : 'stein', x, z, 0.85 + r() * 0.6);
      }
      for (let i = 0; i < 26; i++) { const k = r(); put(k < 0.5 ? 'busch' : k < 0.8 ? 'stein' : 'fels', -6 + r() * (W + 12), H + 2.2 + r() * 4, 0.6 + r() * 0.4); }
      for (const [kind, list] of Object.entries(lists)) if (list.length) arena.add(instanced(kind, 'body', matPlain, list));
    } else if (idx > 0) {
      // übrige Arenen: Umland nach ihrer bisherigen Streu-Regel und ihren Blickfängen (scenery.js), bis sie neue Teile bekommen
      const st = [], gl = [], grass = new THREE.Color().setRGB(T.grass[0][0] / 255, T.grass[0][1] / 255, T.grass[0][2] / 255, THREE.SRGBColorSpace), hx = c => '#' + c.getHexString();
      const ctx = { st, gl, r, leaf: hx(grass.clone().multiplyScalar(0.55).offsetHSL(0.02, 0.1, 0)), leaf2: hx(grass.clone().multiplyScalar(0.8).offsetHSL(-0.02, 0.1, 0)), W, H };
      for (let i = 0; i < 90; i++) {
        const side = i % 3, t = r();
        const x = side === 0 ? -1.9 - r() * 9 : side === 1 ? W + 1.9 + r() * 9 : -8 + t * (W + 16), z = side === 2 ? -2.0 - r() * 9 : -6 + t * (H + 8);
        if (z > RIVER_TOP - 1.4 && z < RIVER_BOT + 1.4) continue;
        theme.prop(ctx, x, z, 0.8 + r() * 0.9, i);
      }
      for (let i = 0; i < 18; i++) theme.prop(ctx, -5 + r() * (W + 10), H + 2.4 + r() * 3.6, 0.42 + r() * 0.3, i * 7 + 2);
      if (theme.mark) theme.mark(ctx);
      if (st.length) { const deco = new THREE.Mesh(merge(st), matOld); deco.castShadow = true; deco.receiveShadow = true; arena.add(deco); }
      if (gl.length) arena.add(new THREE.Mesh(merge(gl), matOldGlow));
    }
    // ziehende Wolken, Schwebeteilchen (Schnee, Glut, Asche, Irrlichter, Staub)
    for (let i = 0; i < (theme.clouds || 0); i++) {
      const k = 1.1 + r() * 0.9;
      const m = new THREE.Mesh(merge([P(sph(0.9 * k), '#ffffff', [0, 0, 0], [0, 0, 0], [1.6, 0.5, 1]), P(sph(0.7 * k), '#ffffff', [0.9 * k, 0.1, 0.2], [0, 0, 0], [1.3, 0.55, 1]), P(sph(0.6 * k), '#ffffff', [-0.9 * k, -0.05, -0.1], [0, 0, 0], [1.3, 0.5, 1])]), cloudMat);
      m.position.set(-12 + r() * (W + 24), 2.4 + r() * 2.2, i % 3 === 2 ? H + 3 + r() * 2 : -2.5 - r() * 7);
      arena.add(m); clouds.push({ m, v: 0.25 + r() * 0.4 });
    }
    const M = theme.motes;
    if (M) {
      const pos = new Float32Array(M.n * 3), sd = new Float32Array(M.n * 3);
      for (let i = 0; i < M.n; i++) { pos[i * 3] = -7 + r() * (W + 14); pos[i * 3 + 1] = 0.3 + r() * 5; pos[i * 3 + 2] = -9 + r() * (H + 12); sd[i * 3] = r(); sd[i * 3 + 1] = r(); sd[i * 3 + 2] = pos[i * 3 + 1]; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(M.color).multiplyScalar(1.6), size: M.size * 2.2, map: dotTex, transparent: true, opacity: M.opacity, depthWrite: false, sizeAttenuation: true }));
      pts.frustumCulled = false; scene.add(pts);
      motes = { pts, pos, seed: sd, kind: M.kind, n: M.n, base: M.opacity };
    }
  }
  const toHexOuter = c => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;
  function setArena(idx) { if (idx === arenaIdx) return; arenaIdx = idx; buildArena(); }
  const ready = loadProps().then(p => { props = p; if (arenaIdx >= 0) buildArena(); return p; });

  const api = { onStorm: null };
  function update(dt, time, shake) {
    if (water.mat) water.mat.uniforms.uTime.value = time;
    if (motes) {   // Bewegung der Schwebeteilchen
      const { pos, seed, kind, n } = motes;
      for (let i = 0; i < n; i++) {
        const a = seed[i * 3], b = seed[i * 3 + 1], j = i * 3;
        if (kind === 'snow' || kind === 'ash') { pos[j + 1] -= dt * (kind === 'snow' ? 0.7 + a * 0.7 : 0.25 + a * 0.3); pos[j] += Math.sin(time * 0.9 + b * 6.3) * dt * (kind === 'snow' ? 0.35 : 0.6); if (pos[j + 1] < 0) pos[j + 1] = 5.4; }
        else if (kind === 'ember') { pos[j + 1] += dt * (0.5 + a * 0.9); pos[j] += Math.sin(time * 2 + b * 6.3) * dt * 0.4; if (pos[j + 1] > 5.4) pos[j + 1] = 0.1; }
        else { pos[j + 1] = seed[j + 2] + Math.sin(time * (0.5 + a) + b * 6.3) * (kind === 'star' ? 0.08 : 0.35); if (kind !== 'star') pos[j] += Math.cos(time * 0.4 + b * 6.3) * dt * 0.18; }
      }
      motes.pts.geometry.attributes.position.needsUpdate = true;
      if (kind === 'star' || kind === 'wisp') motes.pts.material.opacity = motes.base * (0.75 + 0.25 * Math.sin(time * 2.3));
    }
    for (const c of clouds) { c.m.position.x += c.v * dt; if (c.m.position.x > W + 14) c.m.position.x = -14; }
    if (theme.storm) {   // fernes Wetterleuchten hinter dem Feld
      stormT -= dt;
      if (stormT <= 0) { stormT = 5 + Math.random() * 7; flashT = 0.16; if (api.onStorm) api.onStorm(Math.random() * W); }
      if (flashT > 0) flashT -= dt;
      hemi.intensity = SKY_SHARE * Math.PI * (flashT > 0 ? 1.35 : 1);
    }
    camera.position.copy(base); if (shake) { camera.position.x += shake.x; camera.position.y += shake.y; camera.position.z += shake.z; }
    camera.updateMatrixWorld();
  }

  function project(x, y, z) { v3.set(x, y, z).project(camera); return [(v3.x + 1) / 2 * width, (1 - v3.y) / 2 * height]; }

  Object.assign(api, { renderer, scene, world, camera, sun, hemi, grade, hdr, ready, shadowTint, lightTint, resize, setArena, setQuality, update, render, project, fitCamera,
    size: () => ({ width, height, dpr }), theme: () => T, targets: () => ({ rtScene, chain }) });
  Object.defineProperty(api, 'props', { get: () => props });   // die 3D-Teile aus Blender, sobald sie geladen sind (vorher null)
  return api;
}
