// Lädt die in Blender gebauten 3D-Teile (assets/props.json) und liefert das gemeinsame Material dafür:
// weiche Zeichentrick-Schattierung mit Teamfarbe, eingerechneter Verschattung, Randlicht und Leuchten.
import { THREE, TEAM, ASSETS } from './deps.js';

const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

let cache = null;
export async function loadProps() {
  if (cache) return cache;
  const raw = await (await fetch(ASSETS + 'props.json')).json();
  cache = {};
  for (const [name, m] of Object.entries(raw)) {
    const parts = {};
    for (const [pn, p] of Object.entries(m.parts)) {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(b64(p.pos).buffer), col8 = b64(p.col), col = new Float32Array(col8.length);
      for (let i = 0; i < col8.length; i++) col[i] = lin(col8[i] / 255);
      const piv = p.pivot;
      for (let i = 0; i < pos.length; i += 3) { pos[i] -= piv[0]; pos[i + 1] -= piv[1]; pos[i + 2] -= piv[2]; }   // Teil um seinen Drehpunkt legen
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(b64(p.nor).buffer), 3, true));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('aux', new THREE.BufferAttribute(b64(p.aux), 4, true));
      const idx = b64(p.idx);
      g.setIndex(new THREE.BufferAttribute(p.wide ? new Uint32Array(idx.buffer) : new Uint16Array(idx.buffer), 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      parts[pn] = { geo: g, pivot: piv };
    }
    cache[name] = { h: m.h, parts };
  }
  return cache;
}

// Verlauf für die Schattierung: Schattenseite 0, weicher Übergang, Lichtseite 1
let grad = null;
function gradient() {
  if (grad) return grad;
  const n = 64, d = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const u = i / (n - 1), t = Math.min(1, Math.max(0, (u - 0.5) / 0.2)); d[i] = Math.round(255 * (t * t * (3 - 2 * t)) * (0.86 + 0.14 * u)); }
  grad = new THREE.DataTexture(d, n, 1, THREE.RedFormat); grad.minFilter = grad.magFilter = THREE.LinearFilter; grad.needsUpdate = true;
  return grad;
}

// Ersetzen mit Prüfung: ein Muster, das nichts trifft, würde den Effekt sonst still verschlucken
function rep(src, a, b) { if (!src.includes(a)) throw new Error('Shader-Muster fehlt: ' + a); return src.replace(a, b); }

const col = hex => new THREE.Color(hex);   // Hex ist sRGB, three rechnet es in den linearen Arbeitsraum um

export function propMaterial(side = -1, glow = 1) {
  const T = TEAM[side < 0 ? 0 : side];
  const u = { uTeamMain: { value: col(T.main) }, uTeamDark: { value: col(T.dark) }, uTeamLight: { value: col(T.light) }, uGlow: { value: glow }, uFlash: { value: 0 }, uTintMul: { value: new THREE.Vector3(1, 1, 1) } };
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient() });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec4 aux;\nvarying vec4 vAux;\n' + rep(sh.vertexShader, '#include <begin_vertex>', '#include <begin_vertex>\n\tvAux = aux;');
    let f = 'uniform vec3 uTeamMain; uniform vec3 uTeamDark; uniform vec3 uTeamLight; uniform float uGlow; uniform float uFlash; uniform vec3 uTintMul; varying vec4 vAux;\n' + sh.fragmentShader;
    f = rep(f, '#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = mix(diffuseColor.rgb * uTintMul, uTeamMain, vAux.x);
      diffuseColor.rgb = mix(diffuseColor.rgb, vAux.y > 0.75 ? uTeamDark : uTeamLight, step(0.25, vAux.y));
      vec3 rfBase = diffuseColor.rgb;
      diffuseColor.rgb *= mix(vec3(0.50, 0.48, 0.68), vec3(1.0), pow(clamp(vAux.z, 0.0, 1.0), 0.8));`);
    f = rep(f, '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += rfBase * vAux.w * uGlow;');
    f = rep(f, '#include <opaque_fragment>', `float rfRim = pow(1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))), 3.0);
      outgoingLight += rfBase * vec3(1.0, 0.95, 0.85) * rfRim * 0.4 * saturate(normal.x * 0.6 + normal.y * 0.5 + 0.3);
      outgoingLight = mix(outgoingLight, vec3(1.5), uFlash);
      #include <opaque_fragment>`);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'rf-prop';
  m.userData.u = u;
  return m;
}
