// ─────────────────────────────────────────────────────────────────────────
// Hero-tier 3D models — authored procedurally from primitives, not sourced.
//
// Why not downloaded assets: this build environment cannot fetch binary files
// (the egress proxy denies them — established in Pass 3/4 and unchanged), so
// any third-party .glb would be a URL referenced sight-unseen, with a licence
// I could not actually read to verify. Procedural geometry sidesteps both
// problems at once: the licence is unambiguous (authored here, same terms as
// the rest of the repo) and the result is verifiably what shipped. It also
// happens to be the right aesthetic — the brief asked for deliberately
// stylized low-poly, not photoreal, and primitives are exactly that.
//
// Scale: 1 world unit ≈ 12 scene px. Models are drawn oversized relative to
// true scale on purpose — a to-scale tank on this compressed axis would be
// sub-pixel. Same convention as an icon on a map: legibility over literalism.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";

const HULL = new THREE.MeshStandardMaterial({ color: "#5d6350", flatShading: true, roughness: 0.85 });
const HULL_DARK = new THREE.MeshStandardMaterial({ color: "#3f4438", flatShading: true, roughness: 0.9 });
const METAL = new THREE.MeshStandardMaterial({ color: "#6e7378", flatShading: true, roughness: 0.55, metalness: 0.45 });
const RUBBER = new THREE.MeshStandardMaterial({ color: "#23262a", flatShading: true, roughness: 1 });
const GLASS = new THREE.MeshStandardMaterial({ color: "#9fd0e8", flatShading: true, roughness: 0.25, metalness: 0.3 });

/** Every hero model shares these so a scene-wide material swap stays trivial. */
export const HERO_MATERIALS = [HULL, HULL_DARK, METAL, RUBBER, GLASS];

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rt: number, rb: number, h: number, seg: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

/** Road wheels down both sides of a tracked hull. */
function tracks(g: THREE.Group, len: number, halfZ: number, r: number, count: number) {
  for (const sz of [-halfZ, halfZ]) {
    g.add(box(len, r * 1.5, r * 0.9, RUBBER, 0, r * 0.75, sz));
    for (let i = 0; i < count; i++) {
      const wx = -len / 2 + (len / (count - 1)) * i;
      const w = cyl(r, r, r * 0.55, 8, HULL_DARK, wx, r * 0.75, sz);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
}

function wheels(g: THREE.Group, xs: number[], halfZ: number, r: number) {
  for (const sz of [-halfZ, halfZ]) {
    for (const wx of xs) {
      const w = cyl(r, r, r * 0.7, 10, RUBBER, wx, r, sz);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  }
}

// ── land ────────────────────────────────────────────────────────────────
function mainBattleTank(): THREE.Group {
  const g = new THREE.Group();
  tracks(g, 7.4, 1.9, 0.72, 6);
  g.add(box(7.0, 1.05, 3.4, HULL, 0, 1.75, 0));
  g.add(box(4.6, 0.55, 3.0, HULL, -0.2, 2.5, 0));     // turret base
  g.add(box(3.6, 0.95, 2.5, HULL, -0.3, 3.05, 0));    // turret
  const barrel = cyl(0.19, 0.22, 5.6, 8, METAL, 2.4, 3.15, 0);
  barrel.rotation.z = Math.PI / 2;
  g.add(barrel);
  g.add(box(0.5, 0.35, 0.5, HULL_DARK, -1.2, 3.7, 0.5)); // commander's cupola
  return g;
}

function towedHowitzer(): THREE.Group {
  const g = new THREE.Group();
  const barrel = cyl(0.17, 0.21, 6.4, 8, METAL, 1.3, 1.5, 0);
  barrel.rotation.z = Math.PI / 2 - 0.12;
  g.add(barrel);
  g.add(box(1.5, 0.9, 1.8, HULL, -1.1, 1.35, 0));     // breech
  for (const sz of [-1, 1]) {
    const leg = box(4.4, 0.28, 0.38, HULL_DARK, -3.0, 0.5, sz * 0.8);
    leg.rotation.y = sz * 0.16;
    g.add(leg);
  }
  wheels(g, [-0.6], 1.35, 0.78);
  return g;
}

function mlrsTruck(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(8.6, 0.7, 2.9, HULL_DARK, 0, 1.15, 0));   // chassis
  g.add(box(2.5, 1.9, 2.7, HULL, -2.9, 2.35, 0));     // cab
  g.add(box(0.12, 1.0, 2.2, GLASS, -4.12, 2.6, 0));   // windscreen
  const pack = box(3.4, 1.5, 2.4, HULL, 1.8, 2.6, 0); // tube pack
  pack.rotation.z = 0.2;
  g.add(pack);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const t = cyl(0.16, 0.16, 3.3, 6, HULL_DARK, 1.9 + r * 0.02, 2.15 + r * 0.42, -0.85 + c * 0.56);
      t.rotation.z = Math.PI / 2 + 0.2;
      g.add(t);
    }
  }
  wheels(g, [-3.0, 1.4, 2.8], 1.55, 0.8);
  return g;
}

function himars(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(7.6, 0.7, 2.7, HULL_DARK, 0, 1.2, 0));
  g.add(box(2.7, 2.1, 2.6, HULL, -2.5, 2.45, 0));     // armoured cab
  g.add(box(0.12, 1.0, 2.0, GLASS, -3.85, 2.75, 0));
  const pod = box(4.0, 1.9, 2.2, HULL, 1.6, 2.9, 0);  // single six-pack pod
  pod.rotation.z = 0.26;
  g.add(pod);
  g.add(box(0.25, 1.7, 2.0, HULL_DARK, 3.45, 3.36, 0));
  wheels(g, [-2.6, 1.5, 3.0], 1.45, 0.82);
  return g;
}

// ── air defence ─────────────────────────────────────────────────────────
function patriotLauncher(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(8.0, 0.6, 2.9, HULL_DARK, 0, 0.95, 0));   // trailer bed
  const rack = new THREE.Group();                      // elevated canister rack
  rack.add(box(5.4, 2.4, 2.7, HULL, 0, 0, 0));
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      rack.add(box(5.5, 1.0, 1.15, HULL_DARK, 0.05, -0.6 + r * 1.2, -0.68 + c * 1.36));
    }
  }
  rack.position.set(0.4, 3.0, 0);
  rack.rotation.z = 0.72;                              // launch elevation
  g.add(rack);
  g.add(box(1.0, 1.6, 2.4, HULL, -3.2, 1.9, 0));       // erector
  wheels(g, [2.2, 3.4], 1.5, 0.72);
  g.add(box(0.5, 1.4, 0.5, HULL_DARK, -4.0, 0.7, 0));  // landing leg
  return g;
}

function shortRangeAD(): THREE.Group {
  const g = new THREE.Group();
  tracks(g, 6.2, 1.7, 0.6, 5);
  g.add(box(6.0, 1.2, 3.1, HULL, 0, 1.7, 0));
  g.add(box(3.0, 1.3, 2.6, HULL, -0.4, 2.9, 0));       // turret
  for (const sz of [-1, 1]) {
    const gun = cyl(0.12, 0.14, 4.2, 6, METAL, 1.6, 3.1, sz * 0.85);
    gun.rotation.z = Math.PI / 2 - 0.3;
    g.add(gun);
  }
  const dish = cyl(0.9, 0.9, 0.18, 12, METAL, -1.4, 4.0, 0);  // search radar
  dish.rotation.x = 0.4;
  g.add(dish);
  return g;
}

// ── air ─────────────────────────────────────────────────────────────────
function loiteringMunition(): THREE.Group {
  const g = new THREE.Group();
  const body = cyl(0.34, 0.24, 3.6, 8, HULL, 0, 0, 0);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const nose = cyl(0.02, 0.34, 0.8, 8, HULL_DARK, 2.2, 0, 0);
  nose.rotation.z = -Math.PI / 2;
  g.add(nose);
  // The X-wing pairs Lancet-type munitions are recognisable by.
  for (const [ax, roll] of [[-0.7, 0], [-0.7, Math.PI / 2], [1.1, 0], [1.1, Math.PI / 2]] as const) {
    const w = box(0.7, 0.07, 3.4, HULL_DARK, ax, 0, 0);
    w.rotation.x = roll + Math.PI / 4;
    g.add(w);
  }
  return g;
}

function reconUAV(): THREE.Group {
  const g = new THREE.Group();
  const body = cyl(0.4, 0.28, 3.0, 8, HULL, 0, 0, 0);
  body.rotation.z = Math.PI / 2;
  g.add(body);
  g.add(box(0.5, 0.16, 8.6, HULL_DARK, 0.1, 0.3, 0));   // high wing
  for (const sz of [-1, 1]) {                            // V-tail
    const t = box(1.1, 0.1, 1.9, HULL_DARK, -1.7, 0.45, sz * 0.75);
    t.rotation.x = sz * 0.7;
    g.add(t);
  }
  const prop = cyl(0.03, 0.03, 2.0, 6, RUBBER, -1.75, 0, 0);
  prop.rotation.x = Math.PI / 2;
  g.add(prop);
  g.add(cyl(0.22, 0.22, 0.3, 10, GLASS, 0.5, -0.36, 0)); // gimbal ball
  return g;
}

// ── registry ────────────────────────────────────────────────────────────
type Builder = () => THREE.Group;

/**
 * Hero tier — the assets most likely to be clicked in a live demo get real
 * geometry. Everything else stays a billboard marker; that split is a
 * deliberate scope line, tracked as an upgrade path in docs/BACKLOG.md
 * rather than left as a silent gap.
 */
const HERO_BUILDERS: Record<string, Builder> = {
  "side_a-armor-leopard2": mainBattleTank,
  "side_b-armor-t72": mainBattleTank,
  "side_a-artillery-himars-m142": himars,
  "side_a-artillery-m777": towedHowitzer,
  "side_b-artillery-mlrs-grad": mlrsTruck,
  "side_a-air-defense-long-patriot": patriotLauncher,
  "side_b-air-defense-short-pantsir": shortRangeAD,
  "side_a-air-defense-cuas-gepard": shortRangeAD,
  "side_b-uav-strike-lancet": loiteringMunition,
  "side_a-uav-reconnaissance-tactical": reconUAV,
  "side_b-uav-reconnaissance-tactical": reconUAV,
};

export const HERO_ASSET_IDS = Object.keys(HERO_BUILDERS);

export function hasHeroModel(assetId: string): boolean {
  return assetId in HERO_BUILDERS;
}

/** Cache by builder, not by asset id — the two tanks share one geometry set. */
const cache = new Map<Builder, THREE.Group>();

/**
 * Returns a hero model for an asset, or null if it isn't in the hero tier.
 * Clones a cached prototype so the eleven hero assets cost seven builds.
 */
export function buildHeroModel(assetId: string, accent: string): THREE.Group | null {
  const builder = HERO_BUILDERS[assetId];
  if (!builder) return null;

  let proto = cache.get(builder);
  if (!proto) {
    proto = builder();
    cache.set(builder, proto);
  }
  const model = proto.clone(true);

  // A side-coloured plate so which side owns a vehicle survives at any zoom,
  // without recolouring the whole hull into a toy.
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.3, 0.14),
    new THREE.MeshStandardMaterial({ color: accent, flatShading: true, roughness: 0.6, emissive: accent, emissiveIntensity: 0.25 }),
  );
  plate.position.set(-1.2, 1.0, 1.75);
  model.add(plate);

  return model;
}

export function disposeHeroCache() {
  cache.clear();
}
