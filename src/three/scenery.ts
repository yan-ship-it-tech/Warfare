// ─────────────────────────────────────────────────────────────────────────
// Static terrain scenery — dressing, not data.
//
// Everything here is decorative geometry with no id, no detail panel, no
// entry in data/. That distinction matters: these are not additional
// battlefield assets competing with the real ones for attention or
// implying a specific real facility exists at a specific point (the same
// caution that kept a real photo off the two generic "representative
// infrastructure" power-plant assets in Pass 5 applies doubly to inventing
// a whole 3D building). This is what makes the strip read as *a* fought-
// over place rather than empty ground with icons floating over it —
// nothing here is a claim about *the* place.
//
// Same authored-geometry aesthetic as src/three/models.ts and the same
// reason: this sandbox cannot fetch binary assets, so anything sourced
// would be trusted under a licence nobody here could read. Primitives,
// same as the hero tier.
//
// Pass 10 adds the mixed-biome landmark kinds (villages at three condition
// tiers, an urban cluster, a port, a ruined-infrastructure set-piece, a
// hand-placed wreck) plus the coastal water plane from terrain3d.ts — see
// that file's header for why the shoreline position is a fixed world-X
// rather than something derived from the live `Projection` passed in here.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";
import type { Side } from "../types";
import type { Projection } from "../scene/projection";
import {
  terrainHeight,
  buildWater,
  buildRiverWater,
  isInWater,
  riverCenterAt,
  RIVER_HALF_WIDTH,
  RIVER_WATER_LEVEL_Y,
} from "./terrain3d";
import { worldXFor, STRIP_HALF_Z } from "./worldMapping";

// ── material palette (Pass 19 — governance) ───────────────────────────────
// Pass 12 flagged 19 ungoverned one-off materials here with no shared,
// exported list equivalent to models.ts's HERO_MATERIALS, and measured two
// pairs close enough to be visually redundant (RUBBLE/WALL_RUINED,
// SANDBAG/WALL_INTACT) — "recommended fix, not made in this pass." This is
// that fix, done the same measured way: re-running Pass 12's own RGB-
// distance method against every material in the scene (not just this file)
// found the count had grown to 27 by Pass 19 (Pass 17 alone added 7: CANOPY,
// EARTH_MOUND, BRIDGE_DECK, BRIDGE_DECK_BROKEN, REBAR, PONTOON_MAT,
// SMOKE_MAT) and a third pair (WIRE/BRIDGE_DECK_BROKEN, distance 4.4 — even
// tighter than Pass 12's own two) that had drifted in since. All three
// pairs are merged below — same object, not just a matching hex, so a
// future edit to one can't silently un-sync the other. WOOD/SANDBAG/CANVAS
// now live in palette.ts, shared with models.ts's new UGV/human-figure/
// fortification-hero geometry (Pass 19 item 2) — see that file's header.
//
// What did NOT get merged, on purpose: everything below the ~15-distance
// "not reliably distinguishable" line is a real, disclosed follow-up, not a
// silent gap — the Pass 17-era cluster (BRIDGE_DECK_BROKEN, PONTOON_MAT,
// EARTH_MOUND, REBAR, PIER_WOOD, CONCRETE_DARK) all sit within ~16 RGB units
// of each other and of DIRT_WALL, which is real drift worth a dedicated
// look, but attempting it inline here — while also shipping the shader,
// instancing and new-asset geometry this pass already carries — risked
// exactly the kind of "fixed four things while quietly breaking a fifth"
// mistake this repo's own verification standard warns against. Logged in
// docs/MODEL_STYLE_GUIDE.md and docs/BACKLOG.md rather than guessed at.
import { WOOD, SANDBAG, CANVAS } from "./palette";
const CONCRETE = new THREE.MeshStandardMaterial({ color: "#6b6d63", flatShading: true, roughness: 0.92 });
const CONCRETE_DARK = new THREE.MeshStandardMaterial({ color: "#4a4b43", flatShading: true, roughness: 0.95 });
const METAL_RUST = new THREE.MeshStandardMaterial({ color: "#6b4a3a", flatShading: true, roughness: 0.8, metalness: 0.2 });
const METAL_TANK = new THREE.MeshStandardMaterial({ color: "#8a8f92", flatShading: true, roughness: 0.5, metalness: 0.4 });
const DIRT_WALL = new THREE.MeshStandardMaterial({ color: "#3e3826", flatShading: true, roughness: 1 });
// WIRE and BRIDGE_DECK_BROKEN measured 4.4 RGB units apart (Pass 19) — one
// material, two names, since "wire" reads as a thin fitting and "broken
// bridge deck" as a slab; same colour underneath, same as RUBBLE below.
const WIRE = new THREE.MeshStandardMaterial({ color: "#3a3a38", flatShading: true, roughness: 0.6, metalness: 0.5 });
const BRIDGE_DECK_BROKEN = WIRE;

// ── Pass 10 materials: villages, urban cluster, port, wreck ──────────────
// WALL_INTACT merged into SANDBAG (Pass 12 measured 5.4 RGB units apart —
// well under the ~15 "not reliably distinguishable" line) and WALL_RUINED
// into RUBBLE (4.7 apart) — both literal aliases now, not just matching
// hex values, so the two can never drift apart again by accident.
const WALL_INTACT = SANDBAG;
const WALL_DAMAGED = new THREE.MeshStandardMaterial({ color: "#5f5748", flatShading: true, roughness: 0.95 });
const RUBBLE = new THREE.MeshStandardMaterial({ color: "#302c26", flatShading: true, roughness: 1 });
const WALL_RUINED = RUBBLE;
// ROOF_INTACT/ROOF_DAMAGED sit above the scene's usual ≤~30% saturation
// band (S=0.42/0.35) — flagged by Pass 12 as plausible but undocumented.
// Confirmed intentional here: a terracotta roof tile genuinely reads more
// saturated than bare dirt or concrete, the same kind of deliberate,
// narrow accent GLASS/EMBER/water already are elsewhere in the scene.
const ROOF_INTACT = new THREE.MeshStandardMaterial({ color: "#7a3b32", flatShading: true, roughness: 0.85 });
const ROOF_DAMAGED = new THREE.MeshStandardMaterial({ color: "#4a2a24", flatShading: true, roughness: 0.9 });
const URBAN_WALL_A = new THREE.MeshStandardMaterial({ color: "#5a5f66", flatShading: true, roughness: 0.8 });
const URBAN_WALL_B = new THREE.MeshStandardMaterial({ color: "#6b6558", flatShading: true, roughness: 0.8 });
const PIER_WOOD = new THREE.MeshStandardMaterial({ color: "#4a4438", flatShading: true, roughness: 1 });
const WRECK_HULL = new THREE.MeshStandardMaterial({ color: "#211d17", flatShading: true, roughness: 0.85, metalness: 0.3 });
const EMBER = new THREE.MeshStandardMaterial({
  color: "#ff5a1f",
  emissive: "#ff5a1f",
  emissiveIntensity: 1.5,
  flatShading: true,
  roughness: 0.6,
});

function box(w: number, h: number, d: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}
function cyl(rt: number, rb: number, h: number, seg: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
}

// ── landmark structures (a few, unique, placed by hand) ───────────────────

/** A representative power-generation node — cooling structure + switchyard,
 *  not any specific named plant. See the file header on why this stays
 *  generic on purpose. */
export function buildPowerPlant(): THREE.Group {
  const g = new THREE.Group();
  const tower = cyl(2.6, 3.6, 8, 12, CONCRETE);
  tower.position.y = 4;
  g.add(tower);
  const towerNeck = cyl(2.9, 2.6, 1, 12, CONCRETE_DARK);
  towerNeck.position.y = 7.9;
  g.add(towerNeck);

  const switchyard = box(9, 3.2, 5.5, CONCRETE_DARK);
  switchyard.position.set(-7, 1.6, 0);
  g.add(switchyard);
  for (let i = 0; i < 5; i++) {
    const pylon = box(0.25, 3.6, 0.25, METAL_TANK);
    pylon.position.set(-2 + i * 1.4, 1.8, 6.5);
    g.add(pylon);
    const arm = box(2.6, 0.15, 0.15, METAL_TANK);
    arm.position.set(-2 + i * 1.4, 3.2, 6.5);
    g.add(arm);
  }
  return g;
}

/** A fuel/POL depot — tank farm with a low containment berm. */
export function buildFuelDepot(): THREE.Group {
  const g = new THREE.Group();
  const positions: [number, number][] = [
    [-3, -2], [0, -2.4], [3, -2],
    [-1.6, 1.4], [1.6, 1.4],
  ];
  for (const [x, z] of positions) {
    const r = 1.5 + (Math.abs(x * z) % 3) * 0.15;
    const tank = cyl(r, r, 2.6, 14, METAL_TANK);
    tank.position.set(x, 1.3, z);
    g.add(tank);
    const cap = cyl(r * 1.02, r * 1.02, 0.15, 14, METAL_RUST);
    cap.position.set(x, 2.65, z);
    g.add(cap);
  }
  const berm = new THREE.Mesh(
    new THREE.TorusGeometry(5.6, 0.5, 6, 20),
    DIRT_WALL,
  );
  berm.rotation.x = Math.PI / 2;
  berm.position.y = 0.2;
  g.add(berm);
  return g;
}

/** A forward-ish command post — dug-in, camouflaged, antenna mast, not a
 *  building that would ever actually be visible from a distance. */
export function buildCommandPost(): THREE.Group {
  const g = new THREE.Group();
  const bunker = box(5, 1.6, 4, DIRT_WALL);
  bunker.position.y = 0.8;
  g.add(bunker);
  const roofBerm = box(5.6, 0.5, 4.6, DIRT_WALL);
  roofBerm.position.y = 1.85;
  g.add(roofBerm);
  const tent = box(2.6, 1.4, 2.2, CANVAS);
  tent.position.set(-3.6, 0.7, 1.5);
  tent.rotation.y = 0.3;
  g.add(tent);
  const mast = cyl(0.05, 0.08, 5, 5, METAL_TANK);
  mast.position.set(2.6, 2.5, -1.5);
  g.add(mast);
  const antenna = cyl(0.5, 0.5, 0.05, 8, WIRE);
  antenna.rotation.x = Math.PI / 2;
  antenna.position.set(2.6, 4.8, -1.5);
  g.add(antenna);
  return g;
}

type Condition = "ruined" | "damaged" | "intact";

/** One small house, condition-dependent: fewer/tilted walls and a missing
 *  or askew roof the more damaged it is, with an occasional rubble pile
 *  beside anything that isn't intact. */
function buildHouse(condition: Condition, r: () => number): THREE.Group {
  const g = new THREE.Group();
  const wallMat = condition === "intact" ? WALL_INTACT : condition === "damaged" ? WALL_DAMAGED : WALL_RUINED;
  const w = 2.6 + r() * 1.2;
  const d = 2.2 + r() * 1;
  const h = 1.6 + r() * 0.5;
  const body = box(w, h, d, wallMat);
  body.position.y = h / 2;
  if (condition === "ruined") {
    body.rotation.z = (r() - 0.5) * 0.35;
    body.scale.y = 0.55 + r() * 0.3;
  } else if (condition === "damaged") {
    body.rotation.z = (r() - 0.5) * 0.1;
  }
  g.add(body);

  const hasRoof = condition === "intact" ? true : condition === "damaged" ? r() > 0.3 : r() > 0.78;
  if (hasRoof) {
    const roofMat = condition === "intact" ? ROOF_INTACT : ROOF_DAMAGED;
    const roof = cyl(0, Math.max(w, d) * 0.75, 1.1, 4, roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = h + 0.4;
    if (condition !== "intact") roof.rotation.z = (r() - 0.5) * 0.3;
    g.add(roof);
  }

  if (condition !== "intact" && r() > 0.4) {
    const rub = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + r() * 0.5, 0), RUBBLE);
    rub.position.set(w * 0.7, 0.3, (r() - 0.5) * d);
    rub.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
    g.add(rub);
  }
  return g;
}

/** A cluster of houses at one condition tier — the "rural village" unit
 *  item 3 asked for, reused at each of the three damage tiers rather than
 *  three separate builders, since only the material/completeness choice
 *  actually differs. */
function buildVillage(condition: Condition, seed: number, count: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  for (let i = 0; i < count; i++) {
    const house = buildHouse(condition, r);
    const angle = (i / count) * Math.PI * 2 + r() * 0.6;
    const radius = 3 + r() * 5.5;
    house.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius * 0.7);
    house.rotation.y += r() * Math.PI * 2;
    g.add(house);
  }
  return g;
}

/** A small town skyline — the "urban cluster" tier, reserved for the intact
 *  50 km+ bands per item 1's gradient. A handful of taller rectangular
 *  volumes rather than a real streetscape; the point is silhouette, viewed
 *  from the distance this always renders at. */
function buildUrbanCluster(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  const mats = [URBAN_WALL_A, URBAN_WALL_B];
  for (let i = 0; i < 9; i++) {
    const w = 2 + r() * 2.2;
    const d = 2 + r() * 2.2;
    const h = 4 + r() * 11;
    const b = box(w, h, d, mats[i % 2]);
    b.position.set((r() - 0.5) * 18, h / 2, (r() - 0.5) * 13);
    b.rotation.y = r() * 0.3;
    g.add(b);
  }
  return g;
}

// ── tactical terrain features (Pass 17 item 6, for Pass 18 to build into) ──
// PLANNING.md's Pass 18 brief needs these to exist before it can site assets
// "where they'd actually sit" — artillery hidden in forest, a drone team on
// an elevated treeline, infantry holding a built-up block. This pass builds
// the ground truth; Pass 18 owns deciding which asset goes where. See
// TERRAIN_FEATURES below for the exported, Pass-18-facing list.
const CANOPY = new THREE.MeshStandardMaterial({ color: "#3f5330", flatShading: true, roughness: 1 });
const EARTH_MOUND = new THREE.MeshStandardMaterial({ color: "#4a4230", flatShading: true, roughness: 1 });

/** Intact-canopy trees, distinct from props.ts's shattered near-line
 *  treeline on purpose — a forest patch offered as artillery cover has to
 *  actually read as cover (still standing, canopy overhead), not as more of
 *  the same bare-trunk battle damage already scattered everywhere else. */
function buildTreeCluster(r: () => number, count: number, spreadX: number, spreadZ: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const x = (r() - 0.5) * spreadX;
    const z = (r() - 0.5) * spreadZ;
    const h = 2.6 + r() * 2.2;
    const trunk = cyl(0.08, 0.22, h, 5, WOOD);
    trunk.position.set(x, h / 2, z);
    g.add(trunk);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.9 + r() * 0.6, 1.6 + r() * 1.2, 6), CANOPY);
    canopy.position.set(x, h + 0.4, z);
    g.add(canopy);
  }
  return g;
}

/** A forest patch — artillery cover: dense canopy a battery can hide a tube
 *  and its resupply track under without digging a full firing pit. */
function buildForestPatch(seed: number): THREE.Group {
  return buildTreeCluster(rngLocal(seed), 22, 11, 9);
}

/** An elevated treeline — a raised earthen ridge (a real fold in the ground,
 *  not just taller trees) topped with a treeline, the high-and-covered
 *  combination a drone team actually wants for a launch/recovery position:
 *  line of sight over the surrounding ground plus overhead concealment. */
function buildElevatedTreeline(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  const ridge = box(9, 1.1, 3, EARTH_MOUND);
  ridge.position.y = 0.55;
  ridge.rotation.y = (r() - 0.5) * 0.6;
  g.add(ridge);
  const trees = buildTreeCluster(r, 12, 9, 2.4);
  trees.position.y = 1.05;
  g.add(trees);
  return g;
}

/** A small harbour: a couple of warehouse volumes on the dry side plus a
 *  pier reaching out over the water — this is the "place to build out the
 *  Russia-naval category" item 2 asked for, sitting right at the coastline
 *  buildWater() draws. */
function buildPortHarbor(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const b = box(4, 2.8 + (i % 2) * 0.6, 6, CONCRETE_DARK);
    b.position.set(-7 + i * 5.5, 1.4, -2 + (i % 2) * 1.5);
    g.add(b);
  }
  const pier = box(2, 0.4, 15, PIER_WOOD);
  pier.position.set(7, 0.2, 0);
  g.add(pier);
  for (let i = 0; i < 6; i++) {
    const post = cyl(0.14, 0.14, 1.6, 6, PIER_WOOD);
    post.position.set(6.1, -0.6, -7 + i * 2.8);
    g.add(post);
  }
  return g;
}

/** A destroyed piece of key infrastructure — a collapsed span with exposed
 *  rebar, standing in for a bridge or rail junction. This is item 1's
 *  "occasional destroyed key infrastructure" in the otherwise-intact 50 km+
 *  band: rare and hand-placed rather than scattered. */
function buildRuinedInfrastructure(): THREE.Group {
  const g = new THREE.Group();
  const base = box(7.5, 2.2, 5, WALL_RUINED);
  base.position.y = 1.1;
  base.rotation.z = 0.1;
  g.add(base);
  const collapse = box(6.2, 1, 4.4, RUBBLE);
  collapse.position.set(1.2, 0.5, 0.4);
  collapse.rotation.set(0.15, 0.4, 0.08);
  g.add(collapse);
  for (let i = 0; i < 4; i++) {
    const strut = cyl(0.06, 0.06, 2.4, 4, METAL_RUST);
    strut.position.set(-2.4 + i * 1.4, 1.6, 2.2);
    strut.rotation.z = 0.3;
    g.add(strut);
  }
  return g;
}

/** One hand-placed burnt vehicle husk with a smouldering ember accent —
 *  distinct from props.ts's instanced wreck field (props:wrecks), which
 *  covers the near-line *density* of this but can't carry a per-instance
 *  emissive glow. A handful of these mark specific "still burning" points
 *  rather than trying to make every one of the instanced husks glow. */
function buildWreckMarker(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  const hull = box(1.2 + r() * 1.3, 0.55 + r() * 0.3, 2.4 + r() * 1.3, WRECK_HULL);
  hull.position.y = 0.35;
  hull.rotation.set((r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.5);
  g.add(hull);
  if (r() > 0.4) {
    const turret = box(0.7, 0.4, 0.9, WRECK_HULL);
    turret.position.set(0.1, 0.75, -0.2);
    turret.rotation.y = r() * Math.PI;
    g.add(turret);
  }
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.2 + r() * 0.15, 6, 5), EMBER);
  ember.position.set(0.15 + (r() - 0.5) * 0.6, 0.45, 0.2 + (r() - 0.5) * 0.6);
  g.add(ember);
  return g;
}

function rngLocal(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

// ── river crossings (Pass 17 item 5) ──────────────────────────────────────
// Positioned directly from the river's own geometry (terrain3d.ts's
// riverCenterAt/RIVER_HALF_WIDTH), in world-X/Z, not through the LANDMARKS
// side+km convention below — a crossing has no "distance from the zero line"
// of its own to author; it sits wherever the river actually is at the Z it's
// placed at.
const BRIDGE_DECK = new THREE.MeshStandardMaterial({ color: "#5a5850", flatShading: true, roughness: 0.85 });
// BRIDGE_DECK_BROKEN is declared near the top of this file now (aliased to
// WIRE — Pass 19 merge, see that comment) rather than here.
const REBAR = new THREE.MeshStandardMaterial({ color: "#4a453e", flatShading: true, roughness: 0.6, metalness: 0.5 });
const PONTOON_MAT = new THREE.MeshStandardMaterial({ color: "#3c4a3a", flatShading: true, roughness: 0.85 });
const SMOKE_MAT = new THREE.MeshStandardMaterial({
  color: "#57585a",
  transparent: true,
  opacity: 0.32,
  flatShading: true,
  roughness: 1,
  depthWrite: false,
});

/** The governance list Pass 12 asked for and Pass 19 ships: every material
 *  this file declares for itself (WOOD/SANDBAG/CANVAS are governed via
 *  palette.ts's own HERO_MATERIALS instead — no need to double-list them).
 *  The next scenery addition reaching for a new colour should check this
 *  list — and docs/MODEL_STYLE_GUIDE.md's real RGB-distance numbers —
 *  before declaring #28. */
export const SCENERY_MATERIALS = [
  CONCRETE, CONCRETE_DARK, METAL_RUST, METAL_TANK, DIRT_WALL, WIRE,
  WALL_DAMAGED, RUBBLE, ROOF_INTACT, ROOF_DAMAGED, URBAN_WALL_A, URBAN_WALL_B,
  PIER_WOOD, WRECK_HULL, EMBER, CANOPY, EARTH_MOUND, BRIDGE_DECK, REBAR,
  PONTOON_MAT, SMOKE_MAT,
];
for (const m of SCENERY_MATERIALS) m.userData.shared = true;

/** A rising smoke plume: a handful of overlapping soft spheres, larger and
 *  more transparent higher up. Cheap and legible at any zoom without a real
 *  particle system — reused at the destroyed bridge and available to any
 *  future wreck placement. Item 6 named "craters, burnt vehicle hulks,
 *  smoke, damaged treelines" as the contested-zone dressing; craters, hulks
 *  and thinned/damaged treelines already existed on this map (props.ts,
 *  and this file's trench/obstacle/fighting-position belt) — smoke was the
 *  one actually missing, not a retune. */
function buildSmokePlume(seed: number): THREE.Group {
  const g = new THREE.Group();
  const r = rngLocal(seed);
  let y = 0.3;
  for (let i = 0; i < 4; i++) {
    const s = 0.5 + i * 0.35 + r() * 0.2;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), SMOKE_MAT);
    puff.position.set((r() - 0.5) * 0.8 * i, y, (r() - 0.5) * 0.8 * i);
    g.add(puff);
    y += s * 1.1;
  }
  return g;
}

/** A destroyed river bridge: two deck approaches from each bank that don't
 *  meet, tilted down toward the gap rather than merely stopping short (what
 *  actually reads as "destroyed" instead of "under construction"); a
 *  collapsed span fallen into the water between them; exposed rebar; a
 *  smoke plume. Deck height is measured from the water surface, not from
 *  terrainHeight() at the channel centre — that call already includes the
 *  river's own depression, so anchoring to it would put the deck barely
 *  above the riverbed instead of above the water. */
function buildDestroyedBridge(z: number): THREE.Group {
  const g = new THREE.Group();
  const cx = riverCenterAt(z);
  const deckY = RIVER_WATER_LEVEL_Y + 2.4;
  const span = RIVER_HALF_WIDTH * 2 + 5; // reaches a little past each bank
  const r = rngLocal(0x8271 ^ Math.round(z * 97));

  for (const dir of [-1, 1] as const) {
    const bankX = cx + dir * span * 0.5;
    const gapX = cx + dir * RIVER_HALF_WIDTH * 0.5;
    const len = Math.abs(bankX - gapX);
    const deck = box(len, 0.5, 4.2, BRIDGE_DECK);
    deck.position.set((bankX + gapX) / 2, deckY, z);
    deck.rotation.z = -dir * 0.15;
    g.add(deck);

    for (let p = 0; p < 3; p++) {
      const px = bankX - dir * (((p + 0.5) / 3) * len);
      const groundY = terrainHeight(px, z);
      const pier = cyl(0.4, 0.55, Math.max(0.6, deckY - groundY), 6, CONCRETE_DARK);
      pier.position.set(px, (deckY + groundY) / 2, z);
      g.add(pier);
    }
  }

  const fallen = box(span * 0.3, 0.45, 4, BRIDGE_DECK_BROKEN);
  fallen.position.set(cx, RIVER_WATER_LEVEL_Y + 0.2, z + 1.1);
  fallen.rotation.set(0.5, 0.22, 0.3);
  g.add(fallen);

  for (let i = 0; i < 5; i++) {
    const bar = cyl(0.04, 0.04, 1.4 + r() * 0.8, 4, REBAR);
    bar.position.set(cx + (i - 2) * 0.5, RIVER_WATER_LEVEL_Y + 0.6, z - 1.4 + i * 0.3);
    bar.rotation.set(0.9 + r() * 0.2, 0, 0.3);
    g.add(bar);
  }

  g.add(buildSmokePlume(0x9a01 ^ Math.round(z * 31)));
  return g;
}

/** An improvised pontoon crossing: a chain of low floating segments riding
 *  at the water line, plus a single guide-rope line — the one detail that
 *  sells "improvised" against the destroyed bridge's collapsed permanence.
 *  Placed at a distinct Z from the bridge so the two read as separate
 *  crossings, the way a real unit would build a second route rather than
 *  queue at the one the enemy has already ranged. */
function buildPontoonCrossing(z: number): THREE.Group {
  const g = new THREE.Group();
  const cx = riverCenterAt(z);
  const halfW = RIVER_HALF_WIDTH * 0.82;
  const segCount = 7;
  for (let i = 0; i < segCount; i++) {
    const t = i / (segCount - 1);
    const x = cx - halfW + t * halfW * 2;
    const seg = box(0.9, 0.22, 1.1, PONTOON_MAT);
    seg.position.set(x, RIVER_WATER_LEVEL_Y + 0.14, z + Math.sin(t * Math.PI) * 0.3);
    seg.rotation.y = (t - 0.5) * 0.1;
    g.add(seg);
  }
  // A thin box, not a Line — every other piece of geometry in this file is a
  // Mesh, and disposeScenery() below only walks Mesh/InstancedMesh. A Line
  // here would leak its geometry on every terrain rebuild.
  const rope = box(halfW * 2, 0.04, 0.04, WOOD);
  rope.position.set(cx, RIVER_WATER_LEVEL_Y + 0.5, z);
  g.add(rope);
  return g;
}

const villageRuined = () => buildVillage("ruined", 0xb17e, 5);
const villageDamaged = () => buildVillage("damaged", 0xc0de, 6);
const villageIntact = () => buildVillage("intact", 0xfeed, 7);

const LANDMARK_BUILDERS = {
  power_plant: buildPowerPlant,
  fuel_depot: buildFuelDepot,
  command_post: buildCommandPost,
  village_ruined: villageRuined,
  village_damaged: villageDamaged,
  village_intact: villageIntact,
  urban_cluster: () => buildUrbanCluster(0x7089),
  port_harbor: buildPortHarbor,
  ruined_infrastructure: buildRuinedInfrastructure,
  wreck_marker: () => buildWreckMarker(0x9a11),
} as const;

const TACTICAL_FEATURE_BUILDERS = {
  forest_patch: () => buildForestPatch(0x513e),
  elevated_treeline: () => buildElevatedTreeline(0xd7a2),
  // Same builder as the deep-rear "urban_cluster" landmark — a built-up
  // block is the same kind of ground at a different, tactically relevant
  // distance from the line, not a different shape. Placement is what makes
  // it read as "a block a squad could hold" rather than "a town."
  built_up_block: () => buildUrbanCluster(0xb10c),
} as const;

/** Exported (Pass 18) alongside `TERRAIN_FEATURES` for the same reason:
 *  "Patriot near what it defends" needs to know where "what it defends"
 *  actually stands, not just have Pass 18 invent a second, unrelated
 *  coordinate for a power plant or urban cluster that already has one. */
export interface LandmarkSpec {
  kind: keyof typeof LANDMARK_BUILDERS;
  side: Side;
  km: number;
  z: number;
  rotationY: number;
}

/**
 * Fixed, hand-placed landmarks — a handful, not a scatter. Distance stops
 * follow item 1's destruction gradient (ruined near the line, damaged
 * through the mid bands, intact/urban past 50 km) and item 3's ask for a
 * mixed biome — villages, an urban cluster, rolling steppe left as bare
 * terrain, forest belts handled in props.ts. km values are real distances
 * from the zero line; the world-X they land at goes through the same
 * `Projection` the ruler and every real asset use (`worldXFor` below), so a
 * live band edit moves these exactly as it moves everything else — unlike
 * the destruction-gradient *tint* in terrain3d.ts, which is a fixed
 * world-X and does not track band edits (see that file's header).
 */
export const LANDMARKS: LandmarkSpec[] = [
  { kind: "power_plant", side: "side_a", km: 95, z: 22, rotationY: 0.4 },
  { kind: "power_plant", side: "side_b", km: 110, z: -18, rotationY: -0.3 },
  { kind: "fuel_depot", side: "side_a", km: 42, z: -26, rotationY: 0.2 },
  { kind: "fuel_depot", side: "side_b", km: 55, z: 30, rotationY: -0.5 },
  { kind: "command_post", side: "side_a", km: 12, z: 40, rotationY: 0.6 },
  { kind: "command_post", side: "side_b", km: 14, z: -36, rotationY: -0.2 },

  // 0-5 km: total destruction — ruined villages right at the line.
  { kind: "village_ruined", side: "side_a", km: 3, z: -44, rotationY: 0.5 },
  { kind: "village_ruined", side: "side_b", km: 3.5, z: 40, rotationY: -0.4 },

  // 5-20 km: damaged forest + mixed-condition structures.
  { kind: "village_damaged", side: "side_a", km: 11, z: 32, rotationY: 0.9 },
  { kind: "village_damaged", side: "side_b", km: 9, z: -30, rotationY: -0.7 },

  // 20-50 km: lighter but visible damage — still calling these "damaged",
  // one tier gentler in practice since buildHouse's own randomness already
  // gives a lighter touch than the 5-20 km pair above.
  { kind: "village_intact", side: "side_a", km: 28, z: -48, rotationY: 0.2 },
  { kind: "village_intact", side: "side_b", km: 33, z: 46, rotationY: -0.6 },

  // 50 km+: mostly intact — a second intact village plus one urban cluster
  // per side, and one occasional destroyed piece of key infrastructure so
  // the "mostly" in "mostly intact" stays honest.
  { kind: "village_intact", side: "side_a", km: 140, z: 20, rotationY: 0.7 },
  { kind: "village_intact", side: "side_b", km: 180, z: -22, rotationY: -0.3 },
  { kind: "urban_cluster", side: "side_a", km: 130, z: -40, rotationY: 0.15 },
  { kind: "urban_cluster", side: "side_b", km: 170, z: 34, rotationY: -0.25 },
  { kind: "ruined_infrastructure", side: "side_a", km: 230, z: 6, rotationY: 0.3 },
  { kind: "ruined_infrastructure", side: "side_b", km: 150, z: 8, rotationY: -0.15 },

  // The coast: a port right at the shoreline (see buildWater in
  // terrain3d.ts) — this is the "place to build out the Russia-naval
  // category" item 2 asked for.
  { kind: "port_harbor", side: "side_b", km: 262, z: -4, rotationY: -0.1 },

  // A couple of hand-placed burning wrecks with an ember glow, on top of
  // props.ts's instanced wreck field.
  { kind: "wreck_marker", side: "side_a", km: 2, z: 8, rotationY: 0.4 },
  { kind: "wreck_marker", side: "side_b", km: 2.2, z: -10, rotationY: -0.6 },
  { kind: "wreck_marker", side: "side_a", km: 4, z: -26, rotationY: 1.1 },
];

/** A terrain feature Pass 18 can site an asset "into" — exported (unlike
 *  `LANDMARKS` above) specifically so that pass can read `TERRAIN_FEATURES`
 *  and place an asset at/near a real `(side, km, z)` this ground actually
 *  supports, rather than continuing to pick coordinates blind. `radius` is
 *  the rough usable extent, world units, for "does this asset sit inside the
 *  feature" — not a hard boundary, a siting hint. `use` states the intent in
 *  words so Pass 18 doesn't have to infer it from the geometry or the kind
 *  name alone. */
export interface TerrainFeature {
  id: string;
  kind: keyof typeof TACTICAL_FEATURE_BUILDERS;
  side: Side;
  km: number;
  z: number;
  radius: number;
  use: string;
}

export const TERRAIN_FEATURES: TerrainFeature[] = [
  // Forest patches — artillery cover, per item 6. Sited in the 5-20 km band
  // where a tube would actually be dug in, not the open 0-5 km scar.
  { id: "forest-a-1", kind: "forest_patch", side: "side_a", km: 8, z: 24, radius: 6, use: "artillery firing position under canopy" },
  { id: "forest-a-2", kind: "forest_patch", side: "side_a", km: 16, z: -34, radius: 6, use: "artillery firing position under canopy" },
  { id: "forest-b-1", kind: "forest_patch", side: "side_b", km: 10, z: -22, radius: 6, use: "artillery firing position under canopy" },
  { id: "forest-b-2", kind: "forest_patch", side: "side_b", km: 15, z: 38, radius: 6, use: "artillery firing position under canopy" },

  // Elevated treelines — drone team observation/launch positions. Closer to
  // the line than the forest patches: a drone team needs line of sight to
  // the contact area, not deep cover.
  { id: "ridge-a-1", kind: "elevated_treeline", side: "side_a", km: 4, z: 12, radius: 5, use: "drone launch/observation position" },
  { id: "ridge-a-2", kind: "elevated_treeline", side: "side_a", km: 6, z: -18, radius: 5, use: "drone launch/observation position" },
  { id: "ridge-b-1", kind: "elevated_treeline", side: "side_b", km: 5, z: 6, radius: 5, use: "drone launch/observation position" },
  { id: "ridge-b-2", kind: "elevated_treeline", side: "side_b", km: 4.5, z: -30, radius: 5, use: "drone launch/observation position" },

  // Built-up blocks — infantry-holdable ground, closer to the line than the
  // existing deep-rear "urban_cluster" villages/towns.
  { id: "block-a-1", kind: "built_up_block", side: "side_a", km: 7, z: -10, radius: 9, use: "infantry-held built-up block" },
  { id: "block-b-1", kind: "built_up_block", side: "side_b", km: 6, z: 16, radius: 9, use: "infantry-held built-up block" },
];

// ── near-line belt (instanced: trench segments, wire, fighting positions) ─

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

const dummy = new THREE.Object3D();

/** A zigzag trench line — not one long straight cut (real trenches traverse
 *  to limit blast/enfilade along their own length), rendered as a chain of
 *  short angled segments hugging the terrain near the line. */
/** Max trench segments either side ever produces — `STRIP_HALF_Z` is fixed,
 *  so this is a real ceiling, not a guess: `2*(STRIP_HALF_Z-6)/(3.2*0.85)`
 *  rounded up with margin. Sized once so the two InstancedMeshes below
 *  (shared across both sides — one draw call each, not one per side) never
 *  need to grow. */
const TRENCH_SEGMENTS_MAX = 100;

/** Pass 19: was a Group of individually-authored trench/post Mesh pairs —
 *  up to ~90 draw calls on its own at the high scenery budget (2 meshes ×
 *  ~45 segments), the single biggest un-instanced draw-call cost left in
 *  the scene after the marker/ring/fill conversion. Same InstancedMesh +
 *  scratch-Object3D pattern buildObstacleBelt already established just
 *  below (and props.ts's own tree/crater scatter before that) — not a new
 *  pattern, reused. Trenches and posts are geometrically distinct so they
 *  need their own InstancedMesh each; both sides share one pair of meshes
 *  rather than one pair per side, since nothing about a trench segment's
 *  geometry depends on which side it's on. */
function buildTrenchLines(proj: Projection): THREE.Group {
  const g = new THREE.Group();
  const trenchGeo = new THREE.BoxGeometry(1.6, 0.9, 3.2);
  const postGeo = new THREE.BoxGeometry(0.12, 1.1, 0.12);
  const trenchMesh = new THREE.InstancedMesh(trenchGeo, DIRT_WALL, TRENCH_SEGMENTS_MAX);
  const postMesh = new THREE.InstancedMesh(postGeo, WOOD, TRENCH_SEGMENTS_MAX);
  const segLen = 3.2;
  let placed = 0;

  for (const side of ["side_a", "side_b"] as Side[]) {
    const r = rng(side === "side_a" ? 0x7a11 : 0xbeef);
    let z = -STRIP_HALF_Z + 6;
    const x0 = worldXFor(side, 0.4, proj);
    const x1 = worldXFor(side, 2.2, proj);

    while (z < STRIP_HALF_Z - 6) {
      const jog = (r() - 0.5) * (x1 - x0) * 0.6;
      const x = x0 + (x1 - x0) * 0.5 + jog;
      if (isInWater(x, z) || placed >= TRENCH_SEGMENTS_MAX) {
        // The river cuts a real gap in the line here rather than a trench
        // dug straight through open water — the march continues past it.
        z += segLen * 0.85;
        continue;
      }
      const rotY = (r() - 0.5) * 0.5;

      dummy.position.set(x, terrainHeight(x, z) + 0.1, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      trenchMesh.setMatrixAt(placed, dummy.matrix);

      // Timber shoring posts along the trench wall — real dugouts are
      // shored with whatever's on hand, and it's the detail that reads as
      // "somebody dug in here" rather than "a rectangle was placed here".
      dummy.position.set(x + 0.75, terrainHeight(x, z) + 0.55, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      postMesh.setMatrixAt(placed, dummy.matrix);

      placed++;
      z += segLen * 0.85;
    }
  }

  trenchMesh.count = placed;
  postMesh.count = placed;
  trenchMesh.instanceMatrix.needsUpdate = true;
  postMesh.instanceMatrix.needsUpdate = true;
  trenchMesh.name = "scenery:trenches";
  postMesh.name = "scenery:trench-posts";
  g.add(trenchMesh, postMesh);
  return g;
}

/** Concertina wire + dragon's-teeth belt — the instanced obstacle line just
 *  forward of a trench line. */
function buildObstacleBelt(proj: Projection, side: Side, count: number): THREE.InstancedMesh {
  const geo = new THREE.ConeGeometry(0.35, 0.6, 4);
  const mesh = new THREE.InstancedMesh(geo, CONCRETE_DARK, count);
  const r = rng(side === "side_a" ? 0x0bad : 0xf00d);
  const xCenter = worldXFor(side, 0.15, proj);

  let placed = 0;
  for (let i = 0; i < count; i++) {
    const z = -STRIP_HALF_Z + (i / count) * STRIP_HALF_Z * 2;
    const x = xCenter + (r() - 0.5) * 2.2;
    if (isInWater(x, z)) continue; // no dragon's teeth in the river
    dummy.position.set(x, terrainHeight(x, z) + 0.3, z);
    dummy.rotation.set(0, r() * Math.PI, 0);
    dummy.scale.setScalar(0.8 + r() * 0.5);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = `scenery:obstacles:${side}`;
  return mesh;
}

/** Small dug-in fighting positions — sandbagged pits — scattered within the
 *  first couple of km either side, denser than the deep rear and sparse
 *  right at the churned scar where nothing stays standing (same logic
 *  props.ts already uses for treelines). */
/** Pass 19: was a Group of individually-authored pit+5-sandbag Mesh sets —
 *  up to 6 draw calls per position (1 pit + 5 bags), ×14 positions ×2 sides
 *  at the high scenery budget = up to 168 draw calls on its own. Same
 *  InstancedMesh conversion as buildTrenchLines above: one shared pit mesh,
 *  one shared sandbag mesh, both sides and every position in two draw
 *  calls total. `maxCount` is `SCENERY_BUDGET`'s own ceiling (14/side, the
 *  largest tier), passed in rather than hardcoded so the two stay in sync
 *  if that budget ever changes. */
function buildFightingPositions(proj: Projection, maxCount: number): THREE.Group {
  const g = new THREE.Group();
  const pitGeo = new THREE.CylinderGeometry(1.1, 1.3, 0.5, 6);
  const bagGeo = new THREE.BoxGeometry(0.55, 0.28, 0.32);
  const pitMesh = new THREE.InstancedMesh(pitGeo, DIRT_WALL, maxCount);
  const bagMesh = new THREE.InstancedMesh(bagGeo, SANDBAG, maxCount * 5);
  let placedPits = 0;
  let placedBags = 0;

  for (const side of ["side_a", "side_b"] as Side[]) {
    const r = rng(side === "side_a" ? 0x5150 : 0x1234);
    const xNear = worldXFor(side, 1, proj);
    const xFar = worldXFor(side, 7, proj);

    for (let i = 0; i < maxCount; i++) {
      const x = xNear + (xFar - xNear) * r();
      const z = (r() * 2 - 1) * STRIP_HALF_Z;
      if (isInWater(x, z)) continue; // no dug-in pit sits in the river
      const y = terrainHeight(x, z);

      dummy.position.set(x, y - 0.1, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      pitMesh.setMatrixAt(placedPits++, dummy.matrix);

      for (let b = 0; b < 5; b++) {
        const a = (b / 5) * Math.PI * 1.4 - Math.PI * 0.7;
        dummy.position.set(x + Math.cos(a) * 1.15, y + 0.15, z + Math.sin(a) * 1.15);
        dummy.rotation.set(0, a, 0);
        dummy.updateMatrix();
        bagMesh.setMatrixAt(placedBags++, dummy.matrix);
      }
    }
  }

  pitMesh.count = placedPits;
  bagMesh.count = placedBags;
  pitMesh.instanceMatrix.needsUpdate = true;
  bagMesh.instanceMatrix.needsUpdate = true;
  pitMesh.name = "scenery:fighting-position-pits";
  bagMesh.name = "scenery:fighting-position-sandbags";
  g.add(pitMesh, bagMesh);
  return g;
}

export interface SceneryBudget {
  fightingPositionsPerSide: number;
  obstaclesPerSide: number;
}

export const SCENERY_BUDGET: Record<"high" | "low", SceneryBudget> = {
  high: { fightingPositionsPerSide: 14, obstaclesPerSide: 90 },
  low: { fightingPositionsPerSide: 6, obstaclesPerSide: 40 },
};

/** Builds the whole scenery group: landmarks + near-line belt + the coastal
 *  water plane, both sides. Called alongside buildTerrain()/buildProps() and
 *  disposed the same way. `halfWidthX` sizes the water plane's far edge to
 *  match whatever terrain extent was actually generated. */
export function buildScenery(proj: Projection, budget: SceneryBudget, halfWidthX: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "scenery";

  for (const spec of LANDMARKS) {
    const model = LANDMARK_BUILDERS[spec.kind]();
    const x = worldXFor(spec.side, spec.km, proj);
    model.position.set(x, terrainHeight(x, spec.z), spec.z);
    model.rotation.y = spec.rotationY;
    model.name = `scenery:landmark:${spec.kind}:${spec.side}`;
    g.add(model);
  }

  // Pass 17 item 6 / Pass 18 dependency: real ground for the tactical siting
  // TERRAIN_FEATURES describes, not just data with nothing standing on it.
  for (const feature of TERRAIN_FEATURES) {
    const model = TACTICAL_FEATURE_BUILDERS[feature.kind]();
    const x = worldXFor(feature.side, feature.km, proj);
    model.position.set(x, terrainHeight(x, feature.z), feature.z);
    model.name = `scenery:feature:${feature.id}`;
    g.add(model);
  }

  // Pass 19: buildTrenchLines()/buildFightingPositions() now instance across
  // BOTH sides internally (2 draw calls total each, not 2-per-side) — only
  // buildObstacleBelt still takes an explicit side, unchanged from Pass 7.
  g.add(buildTrenchLines(proj));
  g.add(buildFightingPositions(proj, budget.fightingPositionsPerSide));
  for (const side of ["side_a", "side_b"] as Side[]) {
    g.add(buildObstacleBelt(proj, side, budget.obstaclesPerSide));
  }

  const water = buildWater(halfWidthX);
  if (water) g.add(water);

  g.add(buildRiverWater());
  // Bridge dead centre of the strip (z=0); pontoon offset 14 units along Z
  // so the two crossings never overlap (bridge span ≈ RIVER_HALF_WIDTH*2+5
  // ≈ 17, well clear of a 14-unit offset).
  const bridge = buildDestroyedBridge(0);
  bridge.name = "scenery:river-bridge";
  g.add(bridge);
  const pontoon = buildPontoonCrossing(14);
  pontoon.name = "scenery:pontoon-crossing";
  g.add(pontoon);

  return g;
}

export function disposeScenery(group: THREE.Group) {
  group.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
      o.geometry.dispose();
    }
  });
}
