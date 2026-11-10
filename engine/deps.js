// Einzige Stelle, an der die Engine auf das übrige Spiel zugreift: three.js, Feldmaße, Karten, Farben, Kulissen.
export * as THREE from '../vendor/three.module.min.js';
export { W, H, RIVER_TOP, RIVER_BOT, BRIDGES, BRIDGE_HALF, OUTER_Y, MAIN_Y, POCKET, clampDeploy, outerTower } from '../sim.js';
export { CARDS, UNITS } from '../cards.js';
export { TEAM, GROUND, LOOK } from '../render.js';
export { THEMES } from '../scenery.js';
export { merge, P, sph } from '../models3d.js';

export const ASSETS = new URL('./assets/', import.meta.url).href;
