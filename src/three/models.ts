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
// Pass 19: relocated to palette.ts, unchanged values, so the 5 UGV builders,
// the human-figure builder and Pass 18's fortification hero geometry in this
// same file can reach for the identical shared materials instead of each
// declaring their own copies. Re-exported below for anything importing
// HERO_MATERIALS from this file specifically (nothing currently does, but
// the name predates this move and dropping it would be a silent API change).
import { HULL, HULL_DARK, METAL, RUBBER, GLASS, SKIN, FATIGUES, FATIGUES_DARK, WOOD, SANDBAG, CANVAS, HERO_MATERIALS } from "./palette";
export { HERO_MATERIALS };

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

// ── ground robots (Pass 19 item 6/BACKLOG "5 unmodeled Russian UGVs") ────
// docs/3d-model-sourcing-manifest.xlsx flags all five Russian UGVs
// (Kurier, Omich-2, Uran-6, Uran-9, Varan) as having no free source model —
// the newest, least-documented systems in the catalog, per the manifest's
// own README. Moot anyway: this environment's egress proxy blocks binary
// fetches from every host the manifest names (confirmed this pass, not
// assumed — see docs/DECISIONS.md Pass 19), so "download the free one" was
// never actually available here. Authored geometry, same convention as
// every other model in this file, is the only path that was ever open —
// and it means these five don't have to be hidden behind Pass 18's swap
// mechanism the way the brief's fallback suggested; they can just exist.
//
// Small tracked/wheeled chassis, deliberately smaller than the tank/IFV
// hero tier (a UGV is a fraction of a crewed vehicle's size) — same
// `tracks()`/`wheels()` helpers, shorter length and lower ride height.

/** Shared small tracked base for the four tracked UGVs below — silhouette
 *  differs per-caller via what gets added on top, not via a different hull. */
function ugvTrackedBase(): THREE.Group {
  const g = new THREE.Group();
  tracks(g, 2.6, 0.68, 0.28, 4);
  g.add(box(2.4, 0.5, 1.2, HULL_DARK, 0, 0.75, 0));
  return g;
}

/** Kurier — small tracked logistics/resupply UGV. Silhouette feature: a
 *  flat open cargo bed, not a turret — this is a delivery platform. */
function ugvKurier(): THREE.Group {
  const g = ugvTrackedBase();
  g.add(box(1.9, 0.35, 1.05, HULL, 0, 1.15, 0));        // cargo bed
  g.add(box(1.9, 0.06, 0.1, METAL, 0, 1.35, 0.5));      // bed rail (front)
  g.add(box(1.9, 0.06, 0.1, METAL, 0, 1.35, -0.5));     // bed rail (rear)
  g.add(box(0.5, 0.4, 1.0, HULL_DARK, -1.1, 1.0, 0));   // control/comms box, forward
  return g;
}

/** Omich-2 — tracked logistics/casevac UGV. Same class as Kurier, distinct
 *  silhouette: an enclosed box body (protecting a stretcher/cargo) rather
 *  than an open bed, and set slightly lower. */
function ugvOmich2(): THREE.Group {
  const g = ugvTrackedBase();
  g.add(box(2.2, 0.62, 1.1, HULL, 0, 1.06, 0));         // enclosed cargo/casevac box
  g.add(box(0.06, 0.5, 1.0, HULL_DARK, 1.13, 1.06, 0)); // rear door line
  return g;
}

/** Uran-6 — mine-clearing UGV. Silhouette feature: a rotary flail drum
 *  mounted forward, the one detail that makes this a mine-clearer and not
 *  a generic tracked box. */
function ugvUran6(): THREE.Group {
  const g = ugvTrackedBase();
  g.add(box(1.6, 0.55, 1.15, HULL, -0.2, 1.05, 0));     // hull
  const drum = cyl(0.4, 0.4, 1.3, 8, METAL, 1.55, 0.55, 0);
  drum.rotation.z = Math.PI / 2;
  g.add(drum);                                           // flail drum, forward and low
  for (let i = -1; i <= 1; i++) {
    const chain = box(0.05, 0.35, 0.05, HULL_DARK, 1.55, 0.3, i * 0.5);
    g.add(chain);                                        // flail chains hinting at the drum's function
  }
  return g;
}

/** Uran-9 — armed combat UGV. Silhouette feature: a small turret with a
 *  cannon barrel, the same "turret + barrel overhang" cue mainBattleTank
 *  uses, scaled down onto a much smaller tracked hull. */
function ugvUran9(): THREE.Group {
  const g = ugvTrackedBase();
  g.add(box(1.7, 0.55, 1.15, HULL, 0, 1.05, 0));        // hull
  g.add(box(0.75, 0.4, 0.75, HULL_DARK, 0.1, 1.5, 0));  // small turret
  const barrel = cyl(0.05, 0.06, 1.5, 6, METAL, 1.2, 1.55, 0);
  barrel.rotation.z = Math.PI / 2;
  g.add(barrel);
  const at = cyl(0.05, 0.05, 0.9, 6, METAL, 0.7, 1.7, 0.35); // ATGM rail, one side
  at.rotation.z = Math.PI / 2;
  g.add(at);
  return g;
}

/** Varan — modular combat/engineering/EW UGV. Wheeled, not tracked (the
 *  one silhouette distinction the brief's own category description asks
 *  for — "modular chassis" reads as a flatbed platform, not a turret). */
function ugvVaran(): THREE.Group {
  const g = new THREE.Group();
  wheels(g, [-0.9, 0, 0.9], 0.62, 0.3);
  g.add(box(2.6, 0.5, 1.15, HULL, 0, 0.62, 0));         // flatbed chassis
  g.add(box(1.0, 0.35, 1.0, HULL_DARK, 0.6, 1.0, 0));   // modular payload block (generic — "modular" is the point)
  return g;
}

// ── human figures (Pass 19 item 2 — dismounted squad / CP / OP / CCP) ────
// Every marker on this map until Pass 18 represented equipment. This is the
// first geometry representing the people who use it — deliberately the
// plainest possible low-poly figure (box legs, box torso, box head/helmet,
// one rifle), because at marker scale a human reads by silhouette and
// posture, not detail, the same rule every vehicle model already follows.
// One shared base, `humanFigureBase()`, and each of the four asset
// categories below adds ONE distinguishing prop rather than a different
// figure — matching MODEL_STYLE_GUIDE.md's "one or two features, not an
// attempt at completeness" rule.
function humanFigureBase(mat = FATIGUES): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.32, 0.7, 0.22, mat, 0, 0.35, 0));          // legs (one block — no per-leg articulation needed at this scale)
  g.add(box(0.4, 0.5, 0.26, mat, 0, 0.95, 0));           // torso
  g.add(box(0.24, 0.24, 0.24, SKIN, 0, 1.32, 0));        // head
  g.add(box(0.28, 0.14, 0.28, FATIGUES_DARK, 0, 1.46, 0)); // helmet
  return g;
}

/** Dismounted rifle squad — the base figure plus a slung rifle, the one
 *  prop that reads as "infantry" rather than "person." */
function humanDismountedSquad(): THREE.Group {
  const g = humanFigureBase();
  const rifle = box(0.06, 0.06, 0.9, HULL_DARK, 0.25, 1.0, 0.1);
  rifle.rotation.y = 0.5;
  g.add(rifle);
  // A second, slightly offset figure — "squad," not "one soldier."
  const second = humanFigureBase(FATIGUES_DARK);
  second.position.set(0.55, 0, 0.35);
  second.rotation.y = 0.4;
  g.add(second);
  return g;
}

/** Tactical command post — the figure plus a field radio/antenna, the prop
 *  that reads as "commanding," not "fighting." */
function humanCommandPost(): THREE.Group {
  const g = humanFigureBase();
  g.add(box(0.22, 0.3, 0.16, HULL_DARK, -0.32, 0.9, 0)); // radio pack, on the back
  const antenna = cyl(0.015, 0.015, 0.9, 4, METAL, -0.32, 1.5, 0);
  g.add(antenna);
  g.add(box(0.8, 0.06, 0.5, WOOD, 0.5, 0.55, 0));        // folding map table
  return g;
}

/** Observation post — the figure kneeling (whole group tilted low) with
 *  binoculars, the prop that reads as "watching," not "moving." */
function humanObservationPost(): THREE.Group {
  const g = humanFigureBase();
  g.scale.set(1, 0.72, 1);                                // kneeling/low posture
  g.add(box(0.2, 0.1, 0.14, HULL_DARK, 0.22, 0.95, 0));   // binoculars, held up
  return g;
}

/** Forward casualty collection point — the figure kneeling beside a
 *  stretcher, the prop that identifies this as the medical position. */
function humanCasualtyPoint(): THREE.Group {
  const g = humanFigureBase(FATIGUES_DARK);
  g.scale.set(1, 0.8, 1);
  const stretcher = box(1.5, 0.05, 0.55, CANVAS, 0.9, 0.35, 0);
  g.add(stretcher);
  for (const sx of [0.2, 1.6]) g.add(cyl(0.03, 0.03, 0.55, 6, WOOD, sx, 0.35, 0)); // stretcher poles
  return g;
}

// ── Pass 18 fortification hero geometry (dugout / artillery position / ──
// ── ammo point) ───────────────────────────────────────────────────────
// These three categories are positions, not vehicles — MODEL_STYLE_GUIDE.md
// §4's hero/scenery split explicitly allows a wider primitive vocabulary
// here (cones, etc.) the way scenery.ts's own trench/fighting-position
// dressing already does, since a dug-in position has different silhouette
// needs than a vehicle. Built to read as clearly related to (not identical
// to) scenery.ts's decorative trench belt and fighting positions, sharing
// the same WOOD/SANDBAG materials, so the two coexisting on the same strip
// (a real, clickable dugout marker among many decorative unclickable ones)
// don't look like they came from two different artists.
function fortificationDugout(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(1.05, 1.2, 0.5, 8, HULL_DARK, 0, -0.15, 0)); // dug pit
  const r = [0.55, 0.95, 1.35, -0.55, -0.95, -1.35];
  r.forEach((a) => {
    const ang = (a / 1.35) * Math.PI * 0.55;
    g.add(
      box(0.55, 0.28, 0.32, SANDBAG, Math.cos(ang) * 1.15, 0.14, Math.sin(ang) * 1.15),
    );
  });
  g.add(box(0.12, 1.0, 0.12, WOOD, -0.9, 0.5, -0.9));    // shoring post at the entrance
  g.add(box(0.12, 1.0, 0.12, WOOD, -1.15, 0.5, -0.65));
  return g;
}

function fortificationArtilleryPosition(): THREE.Group {
  const g = new THREE.Group();
  g.add(cyl(1.7, 1.9, 0.7, 10, HULL_DARK, 0, -0.05, 0)); // earthen revetment ring, dug in
  g.add(cyl(1.5, 1.7, 0.55, 10, RUBBER, 0, -0.15, 0));   // interior pit, darker
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(box(0.5, 0.3, 0.3, SANDBAG, Math.cos(a) * 1.75, 0.05, Math.sin(a) * 1.75));
  }
  const net = box(3.2, 0.06, 3.2, CANVAS, 0, 1.3, 0); // camo net overhead, tilted
  net.rotation.x = 0.12;
  net.rotation.z = -0.08;
  g.add(net);
  return g;
}

function fortificationAmmoPoint(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.2, 0.08, 1.6, WOOD, 0, 0.04, 0));           // pallet base
  const positions: [number, number, number][] = [
    [-0.6, 0.24, -0.4], [0, 0.24, -0.4], [0.6, 0.24, -0.4],
    [-0.6, 0.24, 0.4], [0, 0.24, 0.4], [0.6, 0.24, 0.4],
    [-0.3, 0.72, -0.1], [0.3, 0.72, -0.1], [0, 0.72, 0.3],
  ];
  for (const [x, y, z] of positions) g.add(box(0.5, 0.4, 0.7, HULL_DARK, x, y, z)); // stacked crates
  g.add(box(2.4, 0.06, 1.8, CANVAS, 0, 1.02, 0));     // tarp over the stack
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

  // Pass 19 — the 5 Russian UGVs the sourcing manifest flags as having no
  // free model (moot: binary fetches are blocked here regardless — see the
  // header comment above). Authored instead of hidden.
  "side_b-ground-robots-kurier": ugvKurier,
  "side_b-ground-robots-omich-2": ugvOmich2,
  "side_b-ground-robots-uran-6": ugvUran6,
  "side_b-ground-robots-uran-9": ugvUran9,
  "side_b-ground-robots-varan": ugvVaran,

  // Pass 19 item 2 — human figures for Pass 18's dismounted squad / command
  // post / observation post / casualty collection point, both sides.
  "side_a-infantry-dismounted-squad": humanDismountedSquad,
  "side_b-infantry-dismounted-squad": humanDismountedSquad,
  "side_a-c2-position-command-post": humanCommandPost,
  "side_b-c2-position-command-post": humanCommandPost,
  "side_a-infantry-position-observation": humanObservationPost,
  "side_b-infantry-position-observation": humanObservationPost,
  "side_a-medical-point-forward": humanCasualtyPoint,
  "side_b-medical-point-forward": humanCasualtyPoint,

  // Pass 19 item 2 — Pass 18's dugout / artillery position / ammo point,
  // as procedural fortification geometry rather than human figures.
  "side_a-infantry-position-dugout": fortificationDugout,
  "side_b-infantry-position-dugout": fortificationDugout,
  "side_a-artillery-position-firing": fortificationArtilleryPosition,
  "side_b-artillery-position-firing": fortificationArtilleryPosition,
  "side_a-logistics-ammo-point-railhead": fortificationAmmoPoint,
  "side_b-logistics-ammo-point": fortificationAmmoPoint,
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
