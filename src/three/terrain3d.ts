// ─────────────────────────────────────────────────────────────────────────
// Synthetic stylized terrain strip.
//
// Explicitly NOT real geography and not satellite imagery (that was tried in
// Pass 4 and reverted — see docs/DECISIONS.md). This is a representative
// cross-section: rolling steppe relief, a churned scar along the zero line,
// low-poly flat-shaded facets and a muted palette, so it reads as a teaching
// diagram that happens to be three-dimensional rather than as a map of
// anywhere in particular.
//
// Height is a deterministic value-noise sum — same seed, same terrain, every
// load — so an asset placed on the surface never moves between sessions.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import { STRIP_HALF_Z } from "./worldMapping";

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** One octave of value noise. */
function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fz = smooth(z - z0);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/**
 * Ground height at a world (x, z).
 *
 * Deliberately low-amplitude: the front this depicts is open rolling steppe,
 * and inventing mountains to make a 3D view look dramatic would be the same
 * dishonesty the terrain-exaggeration note called out in Pass 4. Relief here
 * is ridges and shallow draws, plus the one feature that genuinely dominates
 * the ground near the line — churn.
 */
export function terrainHeight(x: number, z: number): number {
  const broad = valueNoise(x * 0.012, z * 0.012, 1) * 5.2;
  const mid = valueNoise(x * 0.045, z * 0.045, 7) * 1.9;
  const fine = valueNoise(x * 0.16, z * 0.16, 13) * 0.5;
  let h = broad + mid + fine - 3.4;

  // A shallow draw running across the strip — the kind of feature that
  // actually dictates covered approach routes on ground like this.
  h -= Math.exp(-Math.pow((z - 18) / 14, 2)) * 1.5;

  // The zero-line scar: ground churned by sustained fires, dropping into a
  // shell-pocked belt a few km either side of the line.
  const scar = Math.exp(-Math.pow(x / 26, 2));
  h -= scar * 1.7;
  h += scar * (valueNoise(x * 0.55, z * 0.55, 29) - 0.5) * 2.6;

  return h;
}

const COLOR_GROUND_LOW = new THREE.Color("#4c4a34");
const COLOR_GROUND_HIGH = new THREE.Color("#6f6b48");
const COLOR_SCAR = new THREE.Color("#3a352b");
const COLOR_A = new THREE.Color("#3f5068");
const COLOR_B = new THREE.Color("#65403c");

/**
 * Builds the terrain mesh. Vertex-coloured rather than textured: a flat-shaded
 * facet palette is the whole visual language here, and it costs one geometry
 * instead of a texture fetch.
 */
export function buildTerrain(halfWidthX: number): THREE.Mesh {
  const segX = Math.min(360, Math.max(140, Math.round(halfWidthX * 1.1)));
  const segZ = 92;
  const geo = new THREE.PlaneGeometry(halfWidthX * 2, STRIP_HALF_Z * 2 + 40, segX, segZ);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);

    // Elevation ramp first, then the side tint, then the scar on top — the
    // scar has to win visually because it is the feature that explains where
    // the line is without needing a label.
    const t = THREE.MathUtils.clamp((h + 4) / 8, 0, 1);
    c.copy(COLOR_GROUND_LOW).lerp(COLOR_GROUND_HIGH, t);

    const sideMix = THREE.MathUtils.clamp(Math.abs(x) / 190, 0, 1) * 0.32;
    c.lerp(x < 0 ? COLOR_A : COLOR_B, sideMix);

    const scar = Math.exp(-Math.pow(x / 24, 2));
    c.lerp(COLOR_SCAR, scar * 0.75);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.96,
    metalness: 0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  mesh.name = "terrain";
  return mesh;
}
