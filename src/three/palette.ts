// ─────────────────────────────────────────────────────────────────────────
// Shared vehicle/hero material palette — Pass 19.
//
// Was `models.ts`'s own `HERO_MATERIALS` (HULL, HULL_DARK, METAL, RUBBER,
// GLASS — unchanged values, just relocated) so every new authored model this
// pass adds (the 5 Russian UGVs, the human figures, Pass 18's fortification
// hero geometry) can reuse the exact same five rather than each new builder
// file declaring its own copies. `docs/MODEL_STYLE_GUIDE.md` §3's rule —
// "reach for an existing shared material first" — is what this exists to
// make actually checkable: one file, one list, not a private const buried
// in whichever builder needed it first.
//
// This is deliberately NOT the same list as scenery.ts's own
// `SCENERY_MATERIALS` (see that file's header). Measured, not assumed:
// none of scenery.ts's structural/landmark colours (concrete, wood, canvas,
// dirt) are actually close enough to any of these five to merge — a real
// RGB-distance check across every material in the scene (same method
// docs/MODEL_STYLE_GUIDE.md's Pass 12 audit used) found zero cross-file
// matches under the ~15-distance "visually indistinguishable" threshold
// involving models.ts's materials. Vehicle hardware and scene dressing are
// allowed to look like different things, because they are.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from "three";

export const HULL = new THREE.MeshStandardMaterial({ color: "#5d6350", flatShading: true, roughness: 0.85 });
export const HULL_DARK = new THREE.MeshStandardMaterial({ color: "#3f4438", flatShading: true, roughness: 0.9 });
export const METAL = new THREE.MeshStandardMaterial({ color: "#6e7378", flatShading: true, roughness: 0.55, metalness: 0.45 });
export const RUBBER = new THREE.MeshStandardMaterial({ color: "#23262a", flatShading: true, roughness: 1 });
export const GLASS = new THREE.MeshStandardMaterial({ color: "#9fd0e8", flatShading: true, roughness: 0.25, metalness: 0.3 });

/** New this pass, for the low-poly human figures (item 2 of the brief) —
 *  one flat skin tone and two fatigue tones, not a wardrobe. At marker
 *  scale a figure reads by silhouette and posture, the same "legibility
 *  over literalism" rule every other hero model already follows; more
 *  colour variety would spend primitive/material budget nothing at this
 *  scale would actually resolve. */
export const SKIN = new THREE.MeshStandardMaterial({ color: "#8a6f5c", flatShading: true, roughness: 0.95 });
export const FATIGUES = new THREE.MeshStandardMaterial({ color: "#4a4d3c", flatShading: true, roughness: 1 });
export const FATIGUES_DARK = new THREE.MeshStandardMaterial({ color: "#33352a", flatShading: true, roughness: 1 });

/** WOOD and SANDBAG: exact same values scenery.ts already used (verbatim,
 *  not re-tuned) — moved here so Pass 18's fortification hero geometry
 *  below (dugout, artillery position, ammo point) and scenery.ts's own
 *  decorative trenches/fighting positions read as the same substance
 *  instead of two files each declaring their own #8c7f5c. scenery.ts now
 *  imports these rather than redeclaring them — see that file's own
 *  SCENERY_MATERIALS governance list for the rest of its palette. */
export const WOOD = new THREE.MeshStandardMaterial({ color: "#5c4a34", flatShading: true, roughness: 1 });
export const SANDBAG = new THREE.MeshStandardMaterial({ color: "#8c7f5c", flatShading: true, roughness: 1 });
export const CANVAS = new THREE.MeshStandardMaterial({ color: "#4f5a41", flatShading: true, roughness: 0.9 });
SANDBAG.userData.shared = true;
WOOD.userData.shared = true;
CANVAS.userData.shared = true;

export const HERO_MATERIALS = [HULL, HULL_DARK, METAL, RUBBER, GLASS, SKIN, FATIGUES, FATIGUES_DARK, WOOD, SANDBAG, CANVAS];
for (const m of HERO_MATERIALS) m.userData.shared = true;
