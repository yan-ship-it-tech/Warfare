// ─────────────────────────────────────────────────────────────────────────
// The WebGL battlefield.
//
// Hybrid by design, and that is the point rather than a compromise: the
// ground, the models and the depth cues are WebGL (things DOM genuinely
// cannot do), while every label and hit target stays a real DOM <button>
// positioned by projecting its world point to screen each frame. That keeps
// the four things Pass 1 chose DOM for — crisp text at any zoom, focus order,
// aria state, platform hover — none of which WebGL gives back for free.
// See docs/DECISIONS.md Pass 6 for why that earlier call is redirected
// rather than reversed.
// ─────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { WorldModel, SceneNode } from "../data/model";
import { nodeSide, nodeDomain, nodePlatformDomain, nodeDistance } from "../data/model";
import { buildProjection } from "../scene/projection";
import { LabelGrid } from "../scene/labelGrid";
import { DOMAIN_ACCENT, SIDE_ACCENT, SIDE_LABELS } from "../config/ui";
import { useViewState } from "../state/viewState";
import { useOverrides } from "../state/overridesState";
import { resolveAssetDisplay } from "../data/catalog";
import { buildTerrain, terrainHeight } from "./terrain3d";
import { buildProps, PROP_BUDGET } from "./props";
import { buildScenery, disposeScenery, SCENERY_BUDGET } from "./scenery";
import { loadOsmData, buildOsmInset, disposeOsmInset } from "./osmTerrain";
import { applyTacticalSiting } from "./tacticalSiting";
import { buildHeroModel, hasHeroModel } from "./models";
import { perf } from "./perfMonitor";
import {
  worldPlacement,
  lateralLayout,
  worldXFor,
  worldXToKm,
  worldHalfWidth,
  DOMAIN_ALTITUDE,
  STRIP_HALF_Z,
} from "./worldMapping";

/** Above this, a PLATFORM domain is genuinely off the deck (air, space, and
 *  the airborne members of the EW/C2 tiers) and gets the floating-marker-on-a-
 *  tether treatment. At or below it the group's own position is already on the
 *  terrain surface — see worldPlacement() — so the marker belongs right there.
 *
 *  Pass 7 gated this on the *engagement* domain, which is why the fix appeared
 *  to work for tanks and ships and did nothing for the 16 assets whose
 *  engagement and platform domains differ. See src/data/placement.ts. */
const ELEVATED_ALTITUDE_THRESHOLD = 2;

const BG = new THREE.Color("#0a0d13");
/** Scenario-focus mode's "not in this scenario" treatment for the WebGL
 *  marker/ring/fill trio: desaturate toward this flat grey rather than a
 *  literal blur (a real screen-space blur needs a post-processing pass this
 *  scene doesn't have — see docs/DECISIONS.md for why that was scoped out).
 *  The DOM labels (.pin3d.is-dimmed) DO get a real CSS blur on top of this,
 *  since that layer has no such constraint. */
const FOCUS_DIM_COLOR = new THREE.Color(0x565a62);

// ── label declutter tuning ───────────────────────────────────────────────
/** Screen box a titled label reserves. Must match .pin3d's real footprint or
 *  the collision test is measuring the wrong rectangle. */
const LABEL_W = 132;
const LABEL_H = 32;
/** Constant screen-space gap from marker to the bottom of its label. Constant
 *  is the entire fix for the drifting-nametag bug: the anchor used to be a
 *  world point 3 units above the marker, and the screen distance between two
 *  world points separated in Y collapses toward zero as the camera tilts
 *  toward the horizon and grows without bound as it looks down — so the label
 *  slid off its own icon and the CSS leader stub pointed at empty ground. */
const LABEL_LIFT_PX = 28;
/** Beyond this multiple of the current orbit radius a label is not drawn at
 *  all. Relative, not absolute, because absolute thresholds break at the ends
 *  of the zoom range: with a fixed 700-unit cutoff and OrbitControls.maxDistance
 *  at 900, pulling all the way back put every asset past the cutoff and the
 *  scene lost its labels entirely instead of thinning. Scaling with the orbit
 *  radius means "far" always means far *for this framing*. */
const LABEL_FAR_DIST = (camDist: number) => camDist * 2 + 140;

// ── proximity labelling (Pass 16 item 5) ─────────────────────────────────
// "Don't render all of them all the time." Before this pass every asset
// inside the far tier got a DOM label — titled if it won a collision, a dot
// if it didn't — so ~90 labels were laid out, written and composited every
// frame regardless of where the user was actually looking.
//
// Now a title is earned, in this order: selection and hover always; a
// scenario-focus member next; then whatever is nearest the POINTER (or the
// viewport's centre of interest when the pointer is elsewhere), up to a cap.
// Everything else is simply not labelled — the WebGL marker and its Pass 8
// side ring still say "something is here", which is exactly the job the old
// dot tier was doing badly (see item 6).
/** Screen radius around the focus point inside which an asset may be titled,
 *  as a fraction of the viewport's short edge, then clamped to sane pixels. */
const PROXIMITY_FRACTION = 0.42;
const PROXIMITY_MIN_PX = 220;
const PROXIMITY_MAX_PX = 560;
/** Where "near" is measured from when the pointer is not over the canvas.
 *  Slightly below centre: the camera's default oblique framing puts the
 *  subject there, not at the geometric middle. */
const IDLE_FOCUS_Y = 0.55;
/** Titled labels allowed per megapixel of viewport, and the hard clamp either
 *  side of it. Scales with the area actually available rather than being a
 *  fixed count that is stingy on a desktop and unreadable on a phone. */
const LABEL_BUDGET_PER_MPX = 14;
const LABEL_CAP_MIN = 6;
const LABEL_CAP_MAX = 26;
/** Terrain samples per occlusion probe. */
const OCCLUSION_SAMPLES = 6;
/** Ceiling on occlusion probes per layout. An asset rejected for being
 *  behind a ridge does not consume label budget, so it stays a candidate and
 *  gets re-probed on the next frame — which meant a low camera over the
 *  churned zero-line terrain could still spend hundreds of terrainHeight()
 *  calls a frame rejecting the same assets. Past this ceiling the probe is
 *  skipped and the label is allowed: showing one label that a rise would
 *  have hidden is a far cheaper error than a frame-time spike. */
const MAX_OCCLUSION_PROBES = 28;

// ── pan gain, per input device (item 3) ──────────────────────────────────
/** Pass 7's damped mouse gain, unchanged — it is correct for a mouse. */
const MOUSE_PAN_SPEED = 0.4;
/** A two-finger touch pan has a small fraction of a mouse drag's travel: a
 *  thumb crosses maybe 200px where a mouse crosses the screen and back. At
 *  0.4 that meant a full swipe barely moved the field, which is the "far too
 *  slow on mobile" report. 1.7 makes a comfortable swipe cover roughly the
 *  same ground a mouse drag does, which is the consistency Pass 7 was after
 *  — the same damping philosophy, applied to a different input. */
const TOUCH_PAN_SPEED = 1.7;

// ── tap vs. drag (item 4) ────────────────────────────────────────────────
// "Drags frequently fail or open the detail panel instead." The old handler
// had a bare 4px movement check and no notion of time, no pointer capture,
// and it selected the asset on drop — so a drag ended with the panel open
// over the map and the camera flying to the thing you had just placed, and a
// release outside the pin landed on the canvas as a deselect instead.
//
// A gesture is a TAP only if it crosses NEITHER threshold: it stayed within
// the slop radius AND it was released promptly. Crossing the movement
// threshold commits it to a drag, irreversibly. Crossing only the time
// threshold makes it neither — a finger resting on a pin and lifting off
// should not open anything.
/** Movement, in px, past which the gesture is a drag and can't be a tap.
 *  6px rather than 4: a touch contact patch wanders more than a mouse, and
 *  the old 4px made deliberate taps register as failed drags on a phone. */
const TAP_SLOP_PX = 6;
/** Hold time, in ms, past which a stationary press stops counting as a tap.
 *  Well clear of a deliberate mouse click (~80–150ms) so ordinary clicking
 *  is untouched — this is aimed at the press-hesitate-release gesture. */
const TAP_MAX_MS = 500;
/** How long after a pointer gesture resolves a click is ignored. The browser
 *  synthesises a click on release regardless of how far the pointer
 *  travelled, and that click is what used to open the detail panel at the
 *  end of a drag. */
const CLICK_SWALLOW_MS = 350;
/** Hysteresis. A label that is ALREADY titled keeps a head start — it is
 *  ranked as if it were this many px nearer the focus point, and it is
 *  allowed to sit this much beyond the proximity radius before it drops.
 *  Without it, drifting the pointer across a crowded stretch makes titles
 *  swap in and out around the cap boundary every few frames, which reads as
 *  flicker rather than as decluttering. */
const PROXIMITY_HOLD_PX = 70;
const PROXIMITY_HOLD_FACTOR = 1.18;
/** Pointer movement, in px, that counts as "the focus point moved" and so
 *  re-runs the label layout. Below this the layout is left alone — a mouse
 *  jitters constantly and re-laying out for a 2px twitch is pure waste. */
const POINTER_DIRTY_PX = 10;

/** What React needs to MOUNT a pin. Position and tier are deliberately NOT
 *  in here: they are written straight to the DOM node each frame by the
 *  render loop (see applyPin), so panning the camera does not re-render
 *  React at all. This roster only changes when the asset set changes. */
interface PinInfo {
  id: string;
  name: string;
  km: number;
  side: string;
  domain: string;
  accent: string;
  sideColor: string;
  isStub: boolean;
}

/** Live per-pin DOM state, so the loop can write only what actually changed.
 *  Setting an identical style string still dirties style resolution in every
 *  engine tested, and at ~90 pins × 60fps that was measurable. */
interface PinDom {
  el: HTMLButtonElement;
  x: number;
  y: number;
  z: number;
  cls: string;
  shown: boolean;
}

/** One measured candidate per frame. Reused in place — see `measured` below. */
interface Measured {
  entry: Entry;
  sx: number;
  sy: number;
  sz: number;
  dist: number;
  /** Distance from the label focus point, in screen px. */
  focusDist: number;
  rank: number;
  offscreen: boolean;
}

interface Entry {
  id: string;
  node: SceneNode;
  group: THREE.Group;
  /** The marker's own world position. Labels project THIS and then offset in
   *  screen space — never a pre-lifted world point. */
  anchor: THREE.Vector3;
  /** Row index into the three shared marker/ring/fill InstancedMeshes (Pass
   *  19) — `entries[k]`/`measured[k]`/instance row `k` are always the same
   *  asset, by construction (see the creation loop). */
  idx: number;
  /** Local Y offset of the ring/fill pad above the group's own origin —
   *  stored so a drag can recompute their world Y without re-deriving
   *  `groundY`, matching what the old parent-child Mesh hierarchy did for
   *  free. See onPinDragMove. */
  padY: number;
  lod: THREE.LOD | null;
  /** Grounded assets can be hidden behind terrain; elevated ones effectively
   *  cannot, so they skip the occlusion probe entirely. */
  grounded: boolean;
  /** The marker/ring/fill's real colour, so scenario-focus dimming (which
   *  desaturates toward grey per frame) has something to restore to without
   *  re-reading it off the material each time. */
  baseColor: THREE.Color;
  sideColorHex: THREE.Color;
}

/** Handles to the three shared instanced meshes built by the asset-objects
 *  effect — read by layout()/tick()/onCanvasClick()/onPinDragMove(), all of
 *  which live outside that effect's closure. */
interface InstancedHandles {
  marker: THREE.InstancedMesh;
  ring: THREE.InstancedMesh;
  fill: THREE.InstancedMesh;
}

// ── shared geometry ──────────────────────────────────────────────────────
// Every asset used to build its own octahedron, ring and disc — at ~90 assets
// that is 270 BufferGeometries uploaded to the GPU describing 3 distinct
// shapes, rebuilt from scratch on every filter toggle or band edit (the asset
// effect below re-runs on those). They are identical by construction, so they
// are built once for the page instead. Materials stay per-entry: the render
// loop animates colour and opacity per asset, which a shared material could
// not express.
//
// Marked `userData.shared` so the effect's disposal traverse skips them —
// disposing a shared geometry on the first rebuild would blank every marker.
function shared<T extends THREE.BufferGeometry>(g: T): T {
  g.userData.shared = true;
  return g;
}
const MARKER_GEO = shared(new THREE.OctahedronGeometry(1.5, 0));
const RING_GEO = shared(new THREE.RingGeometry(2.15, 2.9, 28));
const FILL_GEO = shared(new THREE.CircleGeometry(2.15, 20));
const LOD_PROXY_GEO = shared(new THREE.BoxGeometry(5, 2.4, 3));
const LOD_PROXY_MAT = new THREE.MeshStandardMaterial({
  color: "#4f5547",
  flatShading: true,
  roughness: 0.9,
});
LOD_PROXY_MAT.userData.shared = true;

// ── Pass 19: instanced marker/ring/fill, per-instance opacity ────────────
// Pass 16 shared the GEOMETRY (3 singletons instead of ~270 uploads) but kept
// per-entry MATERIALS, because colour, emissive intensity and opacity are
// all animated per asset (selection, hover, scenario-focus dimming) and
// InstancedMesh has none of that per-instance without a custom shader —
// named explicitly as deferred work in docs/PLANNING.md. This is that
// shader: onBeforeCompile injects a per-instance `instanceOpacity` float
// attribute into `<color_fragment>`, and — marker only — a per-instance
// `instanceEmissive` intensity scalar that combines with the free built-in
// `instanceColor` tint (three's own instancing mixin already multiplies
// diffuse by it; it does NOT touch emissive, which this adds).
//
// `INSTANCE_COUNT_MAX` bounds how many rows the three shared instance
// buffers below are ever allocated for. The roster is 103 at last count and
// grows only via Duplicate/roster-swap (a user clicking a button, not an
// unbounded process) — 512 is a comfortable ceiling with room for a live
// editing session, not a number picked to exactly fit today's roster.
const INSTANCE_COUNT_MAX = 512;

function withInstancedOpacity<T extends THREE.Material>(material: T, tintEmissive: boolean): T {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "attribute float instanceOpacity;\nvarying float vInstanceOpacity;\n#include <common>",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvInstanceOpacity = instanceOpacity;");

    let frag = shader.fragmentShader.replace(
      "#include <common>",
      "varying float vInstanceOpacity;\n#include <common>",
    );
    frag = frag.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vInstanceOpacity;");
    if (tintEmissive) {
      // vColor is three's own instancing-colour varying — only declared when
      // `mesh.instanceColor` is set, which every instanced mesh below does,
      // so it's always available here. `instanceEmissive` is this file's own
      // addition, the per-instance answer to `material.emissiveIntensity`.
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "attribute float instanceEmissive;\nvarying float vInstanceEmissive;\n#include <common>",
        )
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvInstanceEmissive = instanceEmissive;");
      frag = frag
        .replace("#include <common>", "varying float vInstanceEmissive;\n#include <common>")
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n  totalEmissiveRadiance *= vColor.rgb * vInstanceEmissive;\n#endif",
        );
    }
    shader.fragmentShader = frag;
    // Marker only: a slow shared spin, applied to the LOCAL vertex before the
    // per-instance transform so every instance rotates identically regardless
    // of its own position — replaces the old per-entry `mesh.rotation.y +=`
    // (Pass 6-era) with one uniform update per frame instead of N per frame.
    if (tintEmissive) {
      shader.uniforms.uSpin = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "uniform float uSpin;\n#include <common>")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n{\n  float c = cos(uSpin), s = sin(uSpin);\n  transformed.xz = mat2(c, -s, s, c) * transformed.xz;\n}",
        );
    }
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => `instanced-opacity-${tintEmissive ? "emissive-spin" : "flat"}`;
  return material;
}

function instancedAttr(count: number, fill = 1): THREE.InstancedBufferAttribute {
  return new THREE.InstancedBufferAttribute(new Float32Array(count).fill(fill), 1);
}

const MARKER_INSTANCED_MAT = withInstancedOpacity(
  new THREE.MeshStandardMaterial({
    flatShading: true,
    roughness: 0.4,
    emissive: "#ffffff",
    emissiveIntensity: 1,
    transparent: true,
  }),
  true,
);
MARKER_INSTANCED_MAT.userData.shared = true;

const RING_INSTANCED_MAT = withInstancedOpacity(
  new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  false,
);
RING_INSTANCED_MAT.userData.shared = true;

const FILL_INSTANCED_MAT = withInstancedOpacity(
  new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
  false,
);
FILL_INSTANCED_MAT.userData.shared = true;

function makeInstancedMesh(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, INSTANCE_COUNT_MAX);
  mesh.count = 0; // grown to the live roster size as entries are written
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(INSTANCE_COUNT_MAX * 3).fill(1), 3);
  mesh.geometry.setAttribute("instanceOpacity", instancedAttr(INSTANCE_COUNT_MAX, 1));
  if (mat === MARKER_INSTANCED_MAT) mesh.geometry.setAttribute("instanceEmissive", instancedAttr(INSTANCE_COUNT_MAX, 0.75));
  mesh.name = name;
  mesh.frustumCulled = false; // instances span the whole strip; per-instance culling isn't worth the complexity here
  return mesh;
}

/**
 * Cheap ridge-occlusion probe: march the camera→target segment and report
 * whether terrain rises above it anywhere along the way. Six samples is not a
 * depth buffer, but it reliably catches the case that actually misleads — a
 * label for something sitting in dead ground behind a rise, drawn as if it
 * were in front of it.
 *
 * terrainHeight() is genuinely expensive — three octaves of value noise plus
 * a handful of exp/pow terms — so this is now called only for the handful of
 * candidates that are actually about to be titled, not for every asset in
 * the scene every frame (which is what ~500 terrainHeight calls per frame
 * were before Pass 16).
 */
function occludedByTerrain(cam: THREE.Vector3, target: THREE.Vector3): boolean {
  perf.occlusionProbes++;
  for (let i = 1; i < OCCLUSION_SAMPLES; i++) {
    const t = i / OCCLUSION_SAMPLES;
    const px = cam.x + (target.x - cam.x) * t;
    const py = cam.y + (target.y - cam.y) * t;
    const pz = cam.z + (target.z - cam.z) * t;
    if (terrainHeight(px, pz) > py + 0.9) return true;
  }
  return false;
}

export function Scene3D({ world }: { world: WorldModel }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const view = useViewState();
  const overrides = useOverrides();

  // The pin ROSTER — what React mounts. Changes only when the visible asset
  // set changes; never per frame.
  const [pins, setPins] = useState<PinInfo[]>([]);
  /** Transient confirmation for a completed drag. A drag no longer opens the
   *  detail panel (item 4) — this is what tells you the drop landed. */
  const [dropNote, setDropNote] = useState<string | null>(null);
  /** ODbL credit string, read off the loaded OSM file itself rather than
   *  hardcoded — set once, the one time the inset finishes loading (Pass 17
   *  item 2: the attribution is non-optional the moment the data renders). */
  const [osmAttribution, setOsmAttribution] = useState<string | null>(null);
  // Catalog swaps must show through here too, or the same asset would carry
  // two different names depending on which view you were looking at.
  const swapNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of world.assets) {
      const swapId = overrides.assetOverrides[a.id]?.catalog_equipment_id;
      m.set(a.id, resolveAssetDisplay(a, swapId).name);
    }
    return m;
  }, [world.assets, overrides.assetOverrides]);
  const swapNamesRef = useRef(swapNames);
  useEffect(() => {
    swapNamesRef.current = swapNames;
  }, [swapNames]);
  const [ready, setReady] = useState(false);

  // Refs the animation loop reads without forcing a React re-render.
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  const instancedRef = useRef<InstancedHandles | null>(null);
  const selectedRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);
  // Read by the declutter pass so a lesson's assets outrank the rest of the
  // field for label space, without re-running the scene-building effects.
  const focusSetRef = useRef<Set<string> | null>(null);
  const flyRef = useRef<{ from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t0: number; dur: number } | null>(null);
  // Soft pan bounds, in world X — kept a ref (not read from `proj` directly)
  // because the render loop is set up once on mount and proj can change
  // later if bands are edited live. Margin lets the target reach past the
  // strip's edge, just not disappear into empty fog.
  const panBoundXRef = useRef(120);
  /** In-progress drag-to-reposition state, read/written by the pin's
   *  pointerdown/move/up handlers below. A ref, not state, so a pointermove
   *  doesn't force a re-render 60 times a second — same reasoning as every
   *  other ref the render loop touches. null when nothing is being dragged. */
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    startedAt: number;
    pointerId: number;
    /** True once the movement threshold is crossed and this gesture has
     *  committed to being a drag rather than a tap. */
    dragging: boolean;
    target: HTMLElement | null;
  } | null>(null);
  const dragRaycasterRef = useRef(new THREE.Raycaster());
  /** Scratch for repositioning the dragged asset's marker/ring/fill instance
   *  rows — reused across every pointermove of a drag, same reasoning as
   *  dragHitRef below: a drag can fire this dozens of times a second. */
  const dragScratchRef = useRef({
    matrix: new THREE.Matrix4(),
    quat: new THREE.Quaternion(),
    ringQuat: new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    scale: new THREE.Vector3(1, 1, 1),
  });
  const dragPlaneRef = useRef(new THREE.Plane());
  const dragHitRef = useRef(new THREE.Vector3());
  /** performance.now() before which a click is swallowed. Set when a drag
   *  commits, because the browser still delivers a click to whatever is under
   *  the pointer on release — that synthetic click is precisely what used to
   *  open the detail panel at the end of a drag. */
  const swallowClickUntilRef = useRef(0);
  const dropNoteTimerRef = useRef(0);

  // ── render-loop bookkeeping ───────────────────────────────────────────
  /** Bumped by anything that invalidates the label layout but is not camera
   *  motion: the asset set rebuilding, selection, hover, scenario focus, and
   *  a pointer move worth re-ranking for. The loop compares this against the
   *  value it last laid out at — that comparison plus the camera check is
   *  what lets an idle frame skip the layout entirely. */
  const layoutDirtyRef = useRef(0);
  /** Live DOM handle + last-written state for every mounted pin. */
  const pinDomRef = useRef(new Map<string, PinDom>());
  /** Ruler segment elements, keyed `${side}:${bandId}` (item 9). */
  const rulerElsRef = useRef(new Map<string, HTMLDivElement>());
  const rulerRootRef = useRef<HTMLDivElement | null>(null);
  /** Pointer position over the canvas, in CSS px relative to the mount, and
   *  whether the pointer is actually over it. Drives proximity labelling. */
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  /** The render loop is set up once on mount; this keeps it calling the
   *  current setter rather than one captured on the first render. */
  const setAxisFlippedRef = useRef(view.setAxisFlipped);
  setAxisFlippedRef.current = view.setAxisFlipped;

  const proj = useMemo(() => buildProjection(world.bands, world.domains), [world.bands, world.domains]);
  // The engine-setup effect below runs once on mount; the drag handlers it
  // registers need the CURRENT projection whenever a band edit changes it
  // later, so they read this ref rather than closing over `proj` by value.
  const projRef = useRef(proj);
  useEffect(() => {
    projRef.current = proj;
  }, [proj]);

  const nodes = useMemo<SceneNode[]>(() => {
    const list: SceneNode[] = world.assets
      .filter((a) => !view.hiddenGroups.has(a.group))
      .map((a) => ({ kind: "asset" as const, id: a.id, asset: a }));
    if (view.showPending) {
      for (const s of world.stubs) list.push({ kind: "stub", id: s.id, stub: s });
    }
    return list.filter((n) => view.visibleSides.has(nodeSide(n)));
  }, [world.assets, world.stubs, view.showPending, view.visibleSides, view.hiddenGroups]);

  // ── one-time engine setup ─────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(BG, 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.classList.add("scene3d__canvas");
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = BG;
    // Atmospheric falloff. On an axis this compressed, haze is doing real
    // work — it is the cue that separates "far down the rear" from "just
    // over there", which parallax alone cannot sell.
    scene.fog = new THREE.Fog(BG, 150, 640);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(46, mount.clientWidth / mount.clientHeight, 0.6, 2600);
    camera.position.set(-74, 58, 104);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 14;
    controls.maxDistance = 900;
    // Never let the camera go under the ground plane or fully top-down —
    // both break the oblique read this view exists to give.
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minPolarAngle = Math.PI * 0.06;
    controls.target.set(0, 5, 0);
    // Three's defaults (all 1) scale pan/rotate distance with camera
    // distance from the target — at this scene's default framing that reads
    // as wildly oversensitive: a small drag traverses a large fraction of
    // the strip. Slowed down for predictable small-gesture control; damping
    // above still gives motion weight without amplifying the gain.
    controls.rotateSpeed = 0.55;
    controls.panSpeed = MOUSE_PAN_SPEED;
    controls.zoomSpeed = 0.7;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xa8c0e0, 0x2a2a20, 1.15));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.5);
    sun.position.set(-140, 190, 90);
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6f88b8, 0.45);
    rim.position.set(120, 60, -140);
    scene.add(rim);

    setReady(true);

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ── pointer tracking for proximity labelling (item 5) ────────────────
    // Passive: this must never be able to delay a scroll or a gesture. It
    // only records where the pointer is and flags the layout dirty when it
    // has moved far enough to change the ranking — a mouse jitters
    // constantly and re-ranking the field for a 2px twitch was exactly the
    // kind of unthrottled pointer work item 2 asks about.
    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const p = pointerRef.current;
      if (!p.active || Math.hypot(x - p.x, y - p.y) > POINTER_DIRTY_PX) {
        layoutDirtyRef.current++;
      }
      p.x = x;
      p.y = y;
      p.active = true;
    };
    const onPointerLeave = () => {
      if (pointerRef.current.active) layoutDirtyRef.current++;
      pointerRef.current.active = false;
    };

    // ── item 3: two-finger pan was far too slow on mobile ───────────────
    // OrbitControls applies one panSpeed to both mouse and touch. Pass 7
    // damped it to 0.4 for predictable small mouse gestures on a scene where
    // the default gain traversed a large fraction of the strip per drag —
    // that call is right for a mouse and badly wrong for a thumb, because a
    // two-finger touch pan has a fraction of the travel a mouse drag does.
    // Rather than fighting Pass 7's damping by raising it for everyone, the
    // gain is chosen per input device at the moment the gesture starts.
    const onPointerDownDevice = (e: PointerEvent) => {
      controls.panSpeed = e.pointerType === "touch" ? TOUCH_PAN_SPEED : MOUSE_PAN_SPEED;
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove, { passive: true });
    renderer.domElement.addEventListener("pointerleave", onPointerLeave, { passive: true });
    renderer.domElement.addEventListener("pointerdown", onPointerDownDevice, { passive: true });

    let raf = 0;
    const projected = new THREE.Vector3();
    const axisProbe = new THREE.Vector3();
    // Pass 19: scratch for writing into the instanced marker/ring/fill
    // buffers below — same "allocate once, reuse every pass" discipline as
    // the rest of this block, not a per-entry `new`.
    const layoutScratchColor = new THREE.Color();
    const layoutScratchMatrix = new THREE.Matrix4();
    const layoutScratchQuat = new THREE.Quaternion();
    const layoutScratchScale = new THREE.Vector3(1, 1, 1);
    /** Set true whenever this pass wrote into an instanced buffer, so the
     *  needsUpdate flush at the end of layout() runs once, not per entry. */
    const instancedDirtyRef = { current: false };

    // ── per-frame scratch, allocated exactly once ───────────────────────
    // The old loop built a fresh array of ~90 measurement objects, sorted it
    // into another array, and constructed a new LabelGrid, every frame. None
    // of that showed up as a slow average — it showed up as periodic GC
    // pauses, which is what "smooth, then it freezes" actually is.
    const grid = new LabelGrid();
    /** Ids titled on the previous layout — the hysteresis input. */
    const shownIds = new Set<string>();
    /** Backing store. `measured` holds the same objects in whatever order the
     *  last sort left them, so it is rebuilt from the pool only when the
     *  asset count actually changes — never per frame. */
    const pool: Measured[] = [];
    const measured: Measured[] = [];
    const sizeMeasured = (n: number) => {
      while (pool.length < n) {
        pool.push({
          entry: null as unknown as Entry,
          sx: 0, sy: 0, sz: 0, dist: 0, focusDist: 0, rank: 4, offscreen: true,
        });
      }
      if (measured.length !== n) {
        measured.length = 0;
        for (let i = 0; i < n; i++) measured.push(pool[i]);
      }
    };
    const byRank = (a: Measured, b: Measured) => a.rank - b.rank || a.focusDist - b.focusDist;

    // Camera state as of the last layout, so an idle frame can prove nothing
    // moved without allocating a Vector3 to compare against.
    const lastCam = new THREE.Vector3(NaN, NaN, NaN);
    const lastTarget = new THREE.Vector3(NaN, NaN, NaN);
    let lastDirty = -1;
    let lastW = -1;
    let lastH = -1;
    let lastFlipped: boolean | null = null;

    /** Writes one pin's position/tier to the DOM, and only what changed. */
    const applyPin = (
      id: string,
      x: number,
      y: number,
      z: number,
      shown: boolean,
      cls: string,
    ) => {
      const dom = pinDomRef.current.get(id);
      if (!dom) return;
      if (dom.cls !== cls) {
        dom.el.className = cls;
        dom.cls = cls;
      }
      if (dom.shown !== shown) dom.shown = shown;
      // A pin that isn't drawn doesn't need its transform maintained; it is
      // transparent and non-interactive until it comes back, and it comes
      // back with a fresh transform in the same frame it is shown.
      if (!shown) return;
      // NaN-safe on purpose: a freshly mounted pin starts at x/y = NaN, and
      // `Math.abs(NaN - x) > 0.25` is FALSE — so the natural way to write
      // this silently never writes the first transform and every label sits
      // at the layer's top-left corner forever. Negating the "close enough"
      // test instead makes the NaN case fall through to a write.
      if (!(Math.abs(dom.x - x) <= 0.25) || !(Math.abs(dom.y - y) <= 0.25)) {
        dom.el.style.transform = `translate(-50%, -100%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        dom.x = x;
        dom.y = y;
      }
      if (dom.z !== z) {
        dom.el.style.zIndex = String(z);
        dom.z = z;
      }
    };

    /** Banded distance ruler (item 9). Positions one segment per band per
     *  side by projecting that band's real world-X edges to the screen — so
     *  equal km spans visibly occupy unequal screen width, which IS the
     *  compression the axis applies. A linear ruler here would lie. */
    const layoutRuler = (w: number, h: number) => {
      const root = rulerRootRef.current;
      if (!root) return;
      const projRuler = projRef.current;
      const groundZ = THREE.MathUtils.clamp(controls.target.z, -STRIP_HALF_Z, STRIP_HALF_Z);
      const screenXAt = (worldX: number): number | null => {
        axisProbe.set(worldX, terrainHeight(worldX, groundZ) + 1.5, groundZ);
        axisProbe.project(camera);
        if (axisProbe.z > 1) return null; // behind the camera
        return (axisProbe.x * 0.5 + 0.5) * w;
      };

      // Foreshortening guard: rotate until the axis points at the camera and
      // every band edge lands on the same pixel. Showing a ruler then would
      // be worse than showing none, so it fades out instead.
      const left = screenXAt(-panBoundXRef.current + 40);
      const right = screenXAt(panBoundXRef.current - 40);
      const readable =
        left !== null && right !== null && Math.abs(right - left) > w * 0.22;
      if (root.dataset.readable !== String(readable)) {
        root.dataset.readable = String(readable);
      }
      if (!readable) return;

      for (const side of ["side_a", "side_b"] as const) {
        for (const span of projRuler.spans) {
          const el = rulerElsRef.current.get(`${side}:${span.band.id}`);
          if (!el) continue;
          const x1 = screenXAt(worldXFor(side, span.band.min_km, projRuler));
          const x2 = screenXAt(worldXFor(side, span.displayMaxKm, projRuler));
          if (x1 === null || x2 === null) {
            if (el.dataset.on !== "0") {
              el.dataset.on = "0";
              el.style.width = "0px";
            }
            continue;
          }
          const l = Math.min(x1, x2);
          const width = Math.abs(x2 - x1);
          if (el.dataset.on !== "1") el.dataset.on = "1";
          el.style.transform = `translateX(${l.toFixed(1)}px)`;
          el.style.width = `${Math.max(0, width).toFixed(1)}px`;
          // "Wide enough for its text" is a live question — a band that is
          // 8px across on screen must not print a label over its neighbour.
          const roomy = width > 54 ? "1" : "0";
          if (el.dataset.roomy !== roomy) el.dataset.roomy = roomy;
          const kmSpan = span.displayMaxKm - span.band.min_km;
          const perHundred = width > 1 ? (kmSpan / width) * 100 : 0;
          const scale = perHundred >= 100 ? `${Math.round(perHundred)}` : perHundred.toFixed(perHundred < 10 ? 1 : 0);
          const readout = el.querySelector<HTMLElement>(".ruler3d__scale");
          if (readout && readout.textContent !== `${scale} km`) readout.textContent = `${scale} km`;
        }
      }
      void h;
    };

    /** The label layout pass. Everything expensive in this file lives here,
     *  which is exactly why the loop is allowed to skip it. */
    const layout = (w: number, h: number) => {
      const camPos = camera.position;
      const focusIds = focusSetRef.current;
      const selId = selectedRef.current;
      const hovId = hoveredRef.current;

      // Where "near" is measured from: the pointer when it is over the
      // canvas, otherwise the framing's centre of interest.
      const fx = pointerRef.current.active ? pointerRef.current.x : w / 2;
      const fy = pointerRef.current.active ? pointerRef.current.y : h * IDLE_FOCUS_Y;
      const proximity = THREE.MathUtils.clamp(
        Math.min(w, h) * PROXIMITY_FRACTION,
        PROXIMITY_MIN_PX,
        PROXIMITY_MAX_PX,
      );

      const entries = entriesRef.current;
      sizeMeasured(entries.length);
      const orbitRadius = camPos.distanceTo(controls.target);
      const farDist = LABEL_FAR_DIST(orbitRadius);

      for (let k = 0; k < entries.length; k++) {
        const entry = entries[k];
        projected.copy(entry.anchor).project(camera);
        const sx = (projected.x * 0.5 + 0.5) * w;
        const sy = (-projected.y * 0.5 + 0.5) * h;
        const m = measured[k];
        m.entry = entry;
        m.sx = sx;
        m.sy = sy;
        m.sz = projected.z;
        m.dist = camPos.distanceTo(entry.anchor);
        const held = shownIds.has(entry.id);
        // Already-titled labels are ranked as if slightly nearer, so a small
        // pointer drift can't shuffle the set around the budget boundary.
        m.focusDist = Math.hypot(sx - fx, sy - fy) - (held ? PROXIMITY_HOLD_PX : 0);
        // Cull against the label's own box, not the marker point, so a pin
        // whose title would land entirely outside the viewport is never
        // considered.
        m.offscreen =
          projected.z > 1 ||
          sx + LABEL_W / 2 < 0 ||
          sx - LABEL_W / 2 > w ||
          sy < -LABEL_H ||
          sy - LABEL_LIFT_PX - LABEL_H > h;

        // Priority. Selection and hover can never lose a collision to an
        // arbitrary neighbour; a lesson's focus set outranks the rest of the
        // field; then it is a question of proximity to where the user is
        // actually looking, which is what stops the far end of the axis
        // spending the label budget on things nobody asked about.
        if (entry.id === selId) m.rank = 0;
        else if (entry.id === hovId) m.rank = 1;
        else if (focusIds && focusIds.has(entry.id)) m.rank = 2;
        else if (
          !m.offscreen &&
          m.focusDist <= (held ? proximity * PROXIMITY_HOLD_FACTOR : proximity) &&
          m.dist <= farDist
        )
          m.rank = 3;
        else m.rank = 4;
      }

      // Sorted in place — no new array, and byRank is hoisted, so no closure.
      measured.sort(byRank);

      grid.clear();
      const budget = THREE.MathUtils.clamp(
        Math.round(((w * h) / 1_000_000) * LABEL_BUDGET_PER_MPX),
        LABEL_CAP_MIN,
        LABEL_CAP_MAX,
      );
      let titled = 0;
      let probes = 0;
      shownIds.clear();

      for (let k = 0; k < measured.length; k++) {
        const { entry, sx, sy, sz, dist, rank, offscreen } = measured[k];
        const isSel = entry.id === selId;
        const isHov = entry.id === hovId;
        const pinned = isSel || isHov;

        // ── WebGL appearance ─────────────────────────────────────────────
        // Scenario-focus mode: dim/desaturate everything not in the active
        // focus set, unless the user has selected or hovered it directly —
        // without that override, opening a lesson and then clicking some
        // other asset to compare it would leave the very thing you clicked
        // on nearly invisible.
        const isStubEntry = entry.node.kind === "stub";
        const inFocusMode = focusIds !== null;
        const inFocusSet = !inFocusMode || focusIds!.has(entry.id);
        const dimmed = inFocusMode && !inFocusSet && !pinned;
        const highlighted = inFocusMode && inFocusSet && !pinned;

        // Pass 19: marker/ring/fill are rows in three shared InstancedMeshes
        // now, not per-entry Meshes with their own Material — every write
        // below lands in a per-instance buffer at `entry.idx` instead of
        // mutating an object. instancedRef is only null for a stray call
        // before the asset-objects effect has run once, which layout()
        // itself can't reach (it's built by the same mount effect that
        // creates the ref) — the guard is defensive, not load-bearing.
        const inst = instancedRef.current;
        if (inst) {
          const i = entry.idx;
          const markerOpacity = inst.marker.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute;
          const markerEmissive = inst.marker.geometry.getAttribute("instanceEmissive") as THREE.InstancedBufferAttribute;
          const ringOpacity = inst.ring.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute;
          const fillOpacity = inst.fill.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute;

          if (dimmed) {
            inst.marker.setColorAt(i, layoutScratchColor.copy(FOCUS_DIM_COLOR));
            markerEmissive.setX(i, 0.2);
            markerOpacity.setX(i, (isStubEntry ? 0.55 : 1) * 0.22);
            inst.ring.setColorAt(i, layoutScratchColor.copy(FOCUS_DIM_COLOR));
            inst.fill.setColorAt(i, layoutScratchColor.copy(FOCUS_DIM_COLOR));
            ringOpacity.setX(i, 0.1);
            fillOpacity.setX(i, 0.04);
          } else {
            inst.marker.setColorAt(i, layoutScratchColor.copy(entry.baseColor));
            markerEmissive.setX(i, isSel ? 2.4 : isHov ? 1.5 : highlighted ? 1.05 : 0.75);
            markerOpacity.setX(i, isStubEntry ? 0.55 : 1);
            inst.ring.setColorAt(i, layoutScratchColor.copy(entry.sideColorHex));
            inst.fill.setColorAt(i, layoutScratchColor.copy(entry.sideColorHex));
            // Side ring tracks selection too — the persistent cue gets brighter
            // rather than being replaced by a different one. A scenario-focus
            // member gets the same treatment one notch down, so the highlighted
            // set reads as a group without every member looking selected.
            ringOpacity.setX(i, isSel ? 0.95 : isHov ? 0.7 : highlighted ? 0.62 : 0.42);
            fillOpacity.setX(i, isSel || isHov ? 0.13 : highlighted ? 0.2 : 0.13);
          }
          layoutScratchScale.setScalar(isSel ? 1.6 : isHov ? 1.3 : 1);
          layoutScratchMatrix.compose(entry.anchor, layoutScratchQuat.identity(), layoutScratchScale);
          inst.marker.setMatrixAt(i, layoutScratchMatrix);
          instancedDirtyRef.current = true;
        }

        // ── label tier ───────────────────────────────────────────────────
        // Two tiers now, not three. The old "dot" tier is gone (item 6): it
        // lagged its asset during pan because it was React state applied a
        // frame late, and what it encoded — side, via a blue/red fill — the
        // Pass 8 ground ring already carries in the scene itself.
        let show = false;
        if (offscreen) {
          show = false;
        } else if (pinned) {
          // Selection and hover are always titled, at any distance.
          show = true;
        } else if (rank === 4 || dist > farDist || titled >= budget) {
          show = false;
        } else {
          const y2 = sy - LABEL_LIFT_PX;
          const x1 = sx - LABEL_W / 2;
          const x2 = sx + LABEL_W / 2;
          // Occlusion is probed LAST, and only for a candidate that has
          // already won everything else — it is the expensive test.
          if (grid.collides({ x1, y1: y2 - LABEL_H, x2, y2 })) show = false;
          else if (
            entry.grounded &&
            probes < MAX_OCCLUSION_PROBES &&
            (probes++, occludedByTerrain(camPos, entry.anchor))
          )
            show = false;
          else show = true;
        }

        if (show) {
          const y2 = sy - LABEL_LIFT_PX;
          grid.insert({ x1: sx - LABEL_W / 2, y1: y2 - LABEL_H, x2: sx + LABEL_W / 2, y2 });
          if (!pinned) titled += 1;
          shownIds.add(entry.id);
        }

        const cls =
          "pin3d" +
          ` pin3d--${nodeSide(entry.node)}` +
          (entry.node.kind === "stub" ? " pin3d--stub" : "") +
          (isSel ? " is-selected" : "") +
          (isHov ? " is-hovered" : "") +
          (dimmed ? " is-dimmed" : "") +
          (highlighted ? " is-focused" : "") +
          (show ? "" : " is-off");
        applyPin(entry.id, sx, sy, Math.max(1, Math.round((1 - sz) * 1000)), show, cls);
      }

      // One GPU upload per changed buffer per layout() call, not per entry —
      // layout() itself already only runs when something is dirty (idle
      // frames skip it entirely, see the tick loop below), so this is the
      // same "batch, don't stream" discipline Pass 16 already established.
      if (instancedDirtyRef.current) {
        const inst = instancedRef.current;
        if (inst) {
          inst.marker.instanceMatrix.needsUpdate = true;
          if (inst.marker.instanceColor) inst.marker.instanceColor.needsUpdate = true;
          if (inst.ring.instanceColor) inst.ring.instanceColor.needsUpdate = true;
          if (inst.fill.instanceColor) inst.fill.instanceColor.needsUpdate = true;
          (inst.marker.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute).needsUpdate = true;
          (inst.marker.geometry.getAttribute("instanceEmissive") as THREE.InstancedBufferAttribute).needsUpdate = true;
          (inst.ring.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute).needsUpdate = true;
          (inst.fill.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute).needsUpdate = true;
        }
        instancedDirtyRef.current = false;
      }

      perf.entries = entries.length;
      perf.titled = titled;

      layoutRuler(w, h);

      // ── legend orientation (item 8) ──────────────────────────────────
      // Which side is on the left is a question about the camera, not the
      // data. Probe both rears through the same projection the scene uses
      // and let the answer drive the header.
      axisProbe.set(-100, 6, 0).project(camera);
      const aX = axisProbe.x;
      axisProbe.set(100, 6, 0).project(camera);
      const flipped = aX > axisProbe.x;
      if (flipped !== lastFlipped) {
        lastFlipped = flipped;
        // Published to view state, not kept local: the Legend panel states
        // the same orientation in words and must not be able to contradict
        // the header. Only fires on an actual flip, so this is a handful of
        // React renders per session, not per frame.
        setAxisFlippedRef.current(flipped);
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const frameStart = performance.now();

      // Camera fly-to, used by selection and by the Lessons page.
      const fly = flyRef.current;
      if (fly) {
        const t = Math.min(1, (frameStart - fly.t0) / fly.dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        camera.position.lerpVectors(fly.from, fly.to, e);
        controls.target.lerpVectors(fly.tFrom, fly.tTo, e);
        if (t >= 1) flyRef.current = null;
      }

      // Soft clamp on the pan target, in X and Z. Not a hard wall — it lets
      // the target reach a margin past the strip's edge — but it stops a
      // fast pan gesture from throwing the camera into empty fog with no
      // landmark to reorient by, which compounds a too-sensitive drag into
      // "lost," not just "overshot".
      if (!flyRef.current) {
        const bx = panBoundXRef.current;
        controls.target.x = THREE.MathUtils.clamp(controls.target.x, -bx, bx);
        controls.target.z = THREE.MathUtils.clamp(controls.target.z, -STRIP_HALF_Z - 30, STRIP_HALF_Z + 30);
      }

      controls.update();

      // The markers idle-spin. Kept out of the layout pass so it survives a
      // skipped layout. Pass 19: the marker mesh is now one shared
      // InstancedMesh, so this used to be "one float add and a matrix per
      // marker" is now one float add and one shader uniform, full stop —
      // the rotation happens on the GPU (withInstancedOpacity's vertex
      // shader), not via N per-frame matrix recomposes.
      const shader = MARKER_INSTANCED_MAT.userData.shader as { uniforms: { uSpin: { value: number } } } | undefined;
      if (shader) shader.uniforms.uSpin.value += 0.006;

      const w = mount.clientWidth;
      const h = mount.clientHeight;

      // ── the skip ─────────────────────────────────────────────────────
      // The label layout depends on the camera, the viewport, and a short
      // list of discrete events (selection, hover, focus, the asset set,
      // pointer position). If none of them changed, last frame's layout is
      // still exactly right and re-deriving it is pure waste. On a still
      // camera this takes the per-frame cost of this file to approximately
      // zero, which is what leaves headroom for Passes 17–19.
      const dirty = layoutDirtyRef.current;
      const moved =
        !camera.position.equals(lastCam) ||
        !controls.target.equals(lastTarget) ||
        dirty !== lastDirty ||
        w !== lastW ||
        h !== lastH;

      let layoutMs = 0;
      if (moved && w > 0 && h > 0) {
        const t0 = performance.now();
        layout(w, h);
        layoutMs = performance.now() - t0;
        lastCam.copy(camera.position);
        lastTarget.copy(controls.target);
        lastDirty = dirty;
        lastW = w;
        lastH = h;
      }

      const r0 = performance.now();
      renderer.render(scene, camera);
      const renderMs = performance.now() - r0;

      const info = renderer.info;
      perf.drawCalls = info.render.calls;
      perf.triangles = info.render.triangles;
      perf.programs = info.programs?.length ?? 0;
      perf.geometries = info.memory.geometries;
      perf.textures = info.memory.textures;
      perf.sample(frameStart, layoutMs, renderMs, !moved);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      // The schematic view's axis cannot rotate, so leaving a flip published
      // behind would make its Legend state the orientation backwards.
      setAxisFlippedRef.current(false);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      renderer.domElement.removeEventListener("pointerdown", onPointerDownDevice);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // ── terrain + props, rebuilt only when the axis geometry itself changes ─
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready) return;

    const halfX = worldHalfWidth(proj);
    panBoundXRef.current = halfX + 40;
    // Prop budget follows device capability rather than being a fixed number
    // that is either wasteful on a laptop or unusable on a phone.
    const lowPower =
      (navigator.hardwareConcurrency ?? 4) <= 4 ||
      window.matchMedia("(max-width: 820px)").matches;

    const terrain = buildTerrain(halfX);
    const props = buildProps(halfX, PROP_BUDGET[lowPower ? "low" : "high"]);
    const scenery = buildScenery(proj, SCENERY_BUDGET[lowPower ? "low" : "high"], halfX);

    // Zero line — a standing marker plane rather than a painted stripe, so it
    // stays readable from an oblique angle instead of foreshortening away.
    const zero = new THREE.Group();
    zero.name = "zeroline";
    const zeroMat = new THREE.MeshBasicMaterial({
      color: "#f0f2f8",
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const zeroPlane = new THREE.Mesh(new THREE.PlaneGeometry(150, 9), zeroMat);
    zeroPlane.rotation.y = Math.PI / 2;
    zeroPlane.position.set(0, 4.5, 0);
    zero.add(zeroPlane);

    // The line itself is carried by a bright stripe laid on the ground, which
    // stays legible from any orbit angle without occluding terrain behind it.
    const stripePts: THREE.Vector3[] = [];
    for (let z = -72; z <= 72; z += 3) stripePts.push(new THREE.Vector3(0, terrainHeight(0, z) + 0.35, z));
    const stripeMat = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55 });
    zero.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(stripePts), stripeMat));

    // Pass 17 item 0/6: the "distance graticule" that used to live here — one
    // open-frame line per band edge, standing 14 units tall and spanning the
    // full ±70 Z width of the strip — is REMOVED, not retuned. Confirmed by an
    // A/B screenshot test (docs/DECISIONS.md Pass 17): from most oblique
    // camera angles these open picture-frames stack up and read as broken
    // rectangular wireframes floating in the sky — exactly the "hard border/
    // seam artifact" this pass's item 0 was sent to find. They were also
    // already redundant: Pass 16 built the real equivalent, the DOM `ruler3d`
    // overlay, which shows the same band boundaries as an actual banded ruler
    // with a live km-per-100px readout instead of a standing line nobody could
    // read distance off of. Do not re-add a 3D-space graticule here — extend
    // the 2D ruler overlay instead if band boundaries need a stronger cue.

    scene.add(terrain, props, scenery, zero);

    // The OSM metric inset (Pass 17 item 1) loads asynchronously — its data
    // file is a dynamic import specifically so it gets its own chunk instead
    // of bloating the always-loaded Scene3D bundle (see osmTerrain.ts's
    // header). `cancelled` guards against this exact effect having already
    // been cleaned up (a band edit, a fast unmount) by the time the import
    // resolves — without it, a stale build could add geometry to a scene
    // this effect no longer owns.
    let cancelled = false;
    let osmGroup: THREE.Group | null = null;
    loadOsmData().then((osm) => {
      if (cancelled) return;
      const built = buildOsmInset(osm, proj);
      osmGroup = built.group;
      scene.add(osmGroup);
      setOsmAttribution(built.attribution);
    });

    return () => {
      cancelled = true;
      if (osmGroup) {
        scene.remove(osmGroup);
        disposeOsmInset(osmGroup);
      }
      scene.remove(terrain, props, scenery, zero);
      terrain.geometry.dispose();
      (terrain.material as THREE.Material).dispose();
      props.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      disposeScenery(scenery);
      zero.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
      zeroMat.dispose();
      stripeMat.dispose();
    };
  }, [proj, ready]);

  // ── asset objects ──────────────────────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !ready) return;

    const root = new THREE.Group();
    root.name = "assets";
    const entries: Entry[] = [];

    // Manually-dragged assets (AssetOverride.lateral_offset_world) sit out of
    // the auto layout entirely rather than being fed into it and then nudged
    // — lateralLayout()'s relaxation pass exists to keep AUTO-placed assets
    // from colliding, and running a manually-placed one through it would
    // silently move it again right after the user dropped it there.
    const manualZ = new Map<string, number>();
    for (const node of nodes) {
      const z = overrides.assetOverrides[node.id]?.lateral_offset_world;
      if (typeof z === "number") manualZ.set(node.id, z);
    }

    // Breadth layout first: every asset needs to know its cohort before any of
    // them can be positioned, so this cannot be folded into the loop below.
    const autoNodes = nodes.filter((n) => !manualZ.has(n.id));
    const lateral = lateralLayout(
      autoNodes.map((n) => ({
        id: n.id,
        side: nodeSide(n),
        km: nodeDistance(n),
        platformDomain: nodePlatformDomain(n),
      })),
      proj,
    );
    // Pass 18: nudge terrain-affine categories (artillery, drone teams,
    // logistics, air-defense, command posts) toward the real ground Pass 17
    // built, without disturbing lateralLayout's own collision-safe spread —
    // see tacticalSiting.ts's header for why this is a post-process, not a
    // change to lateralLayout itself. Only auto-placed nodes participate; a
    // manually-dragged asset is a deliberate user override, same reasoning
    // manualZ already uses to skip lateralLayout above.
    const sited = applyTacticalSiting(
      autoNodes
        .filter((n) => n.kind === "asset")
        .map((n) => ({
          id: n.id,
          side: nodeSide(n),
          category: n.asset.category,
          x: worldXFor(nodeSide(n), nodeDistance(n), proj),
        })),
      lateral,
      proj,
    );

    // Pass 19: the marker/ring/fill trio for every asset — previously three
    // individual Meshes per entry (Pass 16 shared their geometry; materials
    // stayed per-entry because colour/opacity/emissive are animated) — are
    // now three shared InstancedMesh draws for the WHOLE roster. See the
    // withInstancedOpacity()/makeInstancedMesh() header comment above for why
    // this needed a custom shader and couldn't just be `InstancedMesh` as
    // shipped. `dummyMatrix`/`dummyColor` are scratch objects reused across
    // every entry in the loop below — allocating one per entry was exactly
    // the kind of steady per-rebuild garbage Pass 16 eliminated elsewhere.
    const markerInstanced = makeInstancedMesh(MARKER_GEO, MARKER_INSTANCED_MAT, "markers");
    const ringInstanced = makeInstancedMesh(RING_GEO, RING_INSTANCED_MAT, "rings");
    const fillInstanced = makeInstancedMesh(FILL_GEO, FILL_INSTANCED_MAT, "fills");
    root.add(markerInstanced, ringInstanced, fillInstanced);
    const dummyMatrix = new THREE.Matrix4();
    const dummyQuat = new THREE.Quaternion();
    const dummyColor = new THREE.Color();
    const ringQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    const ONE = new THREE.Vector3(1, 1, 1);

    let idx = 0;
    for (const node of nodes) {
      const side = nodeSide(node);
      const domain = nodeDomain(node);
      const platformDomain = nodePlatformDomain(node);
      const km = nodeDistance(node);
      const isStub = node.kind === "stub";

      const pos = worldPlacement({
        side,
        platformDomain,
        km,
        z: manualZ.get(node.id) ?? sited.get(node.id) ?? lateral.get(node.id) ?? 0,
        proj,
        terrainHeightAt: terrainHeight,
      });

      const g = new THREE.Group();
      g.position.set(pos.x, pos.y, pos.z);

      const accent = DOMAIN_ACCENT[domain] ?? "#8b93a3";
      const sideColor = SIDE_ACCENT[side].base;

      // Hero geometry where it exists, behind an LOD so it stops costing
      // anything once the camera pulls back past the range it reads at.
      let lod: THREE.LOD | null = null;
      if (!isStub && hasHeroModel(node.id)) {
        const model = buildHeroModel(node.id, sideColor);
        if (model) {
          lod = new THREE.LOD();
          lod.addLevel(model, 0);
          const proxy = new THREE.Mesh(LOD_PROXY_GEO, LOD_PROXY_MAT);
          lod.addLevel(proxy, 165);
          lod.addLevel(new THREE.Group(), 420);
          g.add(lod);
        }
      }

      // Every asset — hero or not — carries the same marker, so the hero
      // tier reads as extra detail rather than as a different class of
      // thing, and nothing becomes unfindable for lacking a model. Only
      // genuinely elevated domains get it lifted onto a tether — this was
      // previously unconditional (7.5 units up, always), which is why land
      // and sea assets briefly rendered as if airborne: their group origin
      // is already on the terrain surface (see worldPlacement()), so lifting
      // the marker on top of that put it floating over its own footprint.
      const elevated = (DOMAIN_ALTITUDE[platformDomain] ?? 0) > ELEVATED_ALTITUDE_THRESHOLD;
      const markerColorHex = isStub ? "#8b93a3" : accent;
      const markerY = elevated ? 7.5 : 1.4;

      const k = idx++;
      dummyMatrix.compose(
        new THREE.Vector3(pos.x, pos.y + markerY, pos.z),
        dummyQuat.identity(),
        ONE,
      );
      markerInstanced.setMatrixAt(k, dummyMatrix);
      markerInstanced.setColorAt(k, dummyColor.set(markerColorHex));
      (markerInstanced.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute).setX(
        k,
        isStub ? 0.55 : 1,
      );
      (markerInstanced.geometry.getAttribute("instanceEmissive") as THREE.InstancedBufferAttribute).setX(k, 0.75);
      markerInstanced.userData.assetIds = markerInstanced.userData.assetIds ?? [];
      markerInstanced.userData.assetIds[k] = node.id;

      // Tether from the marker down to the true ground point — only meaningful
      // when there IS a real gap to explain (air/space/mast tiers). Grounded
      // domains skip it entirely: their marker already sits right at the
      // surface, and drawing a stalk down to a point 1.4 units below it would
      // just be visual noise, not a corrected version of the same cue.
      const groundY = terrainHeight(pos.x, pos.z) - pos.y;
      if (elevated) {
        const tether = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, markerY, 0),
            new THREE.Vector3(0, groundY, 0),
          ]),
          new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.45 }),
        );
        g.add(tether);
      }

      // ── side identification ────────────────────────────────────────────
      // A soft pad at 0.16 opacity was not a cue you could read before the
      // label — at any real camera distance it washed out against terrain of
      // similar value. The persistent cue is now a hard-edged ring in the side
      // colour plus a dim fill inside it: the ring survives distance and
      // shallow angles (it is the shape, not the tint, that carries), and the
      // fill keeps the footprint readable when the ring is near edge-on.
      const padY = (elevated ? groundY : 0) + 0.12;

      dummyMatrix.compose(new THREE.Vector3(pos.x, pos.y + padY + 0.02, pos.z), ringQuat, ONE);
      ringInstanced.setMatrixAt(k, dummyMatrix);
      ringInstanced.setColorAt(k, dummyColor.set(sideColor));
      (ringInstanced.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute).setX(k, 0.42);

      dummyMatrix.compose(new THREE.Vector3(pos.x, pos.y + padY, pos.z), ringQuat, ONE);
      fillInstanced.setMatrixAt(k, dummyMatrix);
      fillInstanced.setColorAt(k, dummyColor.set(sideColor));
      (fillInstanced.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute).setX(k, 0.13);

      root.add(g);
      entries.push({
        id: node.id,
        node,
        group: g,
        // The marker's own position — NOT a pre-lifted point. The lift that
        // keeps a label clear of its icon is applied in screen space in the
        // render loop, which is what stops it drifting off under camera tilt.
        anchor: new THREE.Vector3(pos.x, pos.y + markerY, pos.z),
        idx: k,
        padY,
        lod,
        grounded: !elevated,
        baseColor: new THREE.Color(markerColorHex),
        sideColorHex: new THREE.Color(sideColor),
      });
    }

    markerInstanced.count = ringInstanced.count = fillInstanced.count = idx;
    markerInstanced.instanceMatrix.needsUpdate = true;
    ringInstanced.instanceMatrix.needsUpdate = true;
    fillInstanced.instanceMatrix.needsUpdate = true;
    if (markerInstanced.instanceColor) markerInstanced.instanceColor.needsUpdate = true;
    if (ringInstanced.instanceColor) ringInstanced.instanceColor.needsUpdate = true;
    if (fillInstanced.instanceColor) fillInstanced.instanceColor.needsUpdate = true;
    for (const m of [markerInstanced, ringInstanced, fillInstanced]) {
      const op = m.geometry.getAttribute("instanceOpacity") as THREE.InstancedBufferAttribute;
      op.needsUpdate = true;
    }
    (markerInstanced.geometry.getAttribute("instanceEmissive") as THREE.InstancedBufferAttribute).needsUpdate = true;

    scene.add(root);
    entriesRef.current = entries;
    instancedRef.current = { marker: markerInstanced, ring: ringInstanced, fill: fillInstanced };

    // The pin roster React mounts. Built here, once per asset-set change —
    // NOT per frame. Everything that varies per frame (position, z-order,
    // whether the label is drawn at all) is written straight to these nodes
    // by the render loop, which is what took ~90 React re-renders a second
    // down to zero.
    setPins(
      entries.map((e) => {
        const node = e.node;
        const side = nodeSide(node);
        const domain = nodeDomain(node);
        return node.kind === "asset"
          ? {
              id: e.id,
              name: swapNamesRef.current.get(node.asset.id) ?? node.asset.name,
              km: node.asset.distance_km_from_zero,
              side,
              domain,
              accent: DOMAIN_ACCENT[domain] ?? "#8b93a3",
              sideColor: SIDE_ACCENT[side].base,
              isStub: false,
            }
          : {
              id: e.id,
              name: node.stub.label,
              km: node.stub.distance_km_from_zero,
              side,
              domain,
              accent: DOMAIN_ACCENT[domain] ?? "#8b93a3",
              sideColor: SIDE_ACCENT[side].base,
              isStub: true,
            };
      }),
    );
    layoutDirtyRef.current++;

    return () => {
      scene.remove(root);
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          // Shared geometry outlives this effect by design — disposing it on
          // the first rebuild would blank every marker in the scene.
          if (!o.geometry.userData.shared) o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => !x.userData.shared && x.dispose());
          else if (!m.userData.shared) m.dispose();
        }
      });
      entriesRef.current = [];
    };
  }, [nodes, proj, ready, overrides.assetOverrides]);

  // Selection/hover are read by the render loop from refs so that hovering a
  // node does not re-run the scene-building effects above.
  // Each also invalidates the label layout, which is otherwise skipped
  // entirely on a still camera — without the bump, selecting something with
  // the camera at rest would not repaint its label until you nudged the view.
  useEffect(() => {
    selectedRef.current = view.selectedId;
    layoutDirtyRef.current++;
  }, [view.selectedId]);
  useEffect(() => {
    hoveredRef.current = view.hoveredId;
    layoutDirtyRef.current++;
  }, [view.hoveredId]);
  useEffect(() => {
    const ids = view.focusRequest?.assetIds;
    focusSetRef.current = ids && ids.length > 0 ? new Set(ids) : null;
    layoutDirtyRef.current++;
  }, [view.focusRequest]);

  /** Eases the camera to frame a set of assets. */
  const flyTo = useCallback((ids: string[]) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || ids.length === 0) return;

    const pts = entriesRef.current.filter((e) => ids.includes(e.id)).map((e) => e.anchor);
    if (pts.length === 0) return;

    const box = new THREE.Box3();
    pts.forEach((p) => box.expandByPoint(p));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 26);
    const dist = THREE.MathUtils.clamp(span * 1.5 + 46, 52, 620);

    flyRef.current = {
      from: camera.position.clone(),
      to: center.clone().add(new THREE.Vector3(-dist * 0.5, dist * 0.62, dist * 0.75)),
      tFrom: controls.target.clone(),
      tTo: center.clone(),
      t0: performance.now(),
      dur: 900,
    };
  }, []);

  // Selection frames the asset; a lesson's focus request frames its whole set.
  useEffect(() => {
    if (view.selectedId) flyTo([view.selectedId]);
  }, [view.selectedId, flyTo]);

  useEffect(() => {
    if (view.focusRequest && view.focusRequest.assetIds.length > 0) {
      flyTo(view.focusRequest.assetIds);
    }
  }, [view.focusRequest, flyTo]);

  // ── drag-to-reposition ────────────────────────────────────────────────
  // Hangs off the DOM pin's pointerdown, not a canvas raycast: the pin is
  // this scene's real hit-target (see the file header — every label stays a
  // real DOM <button> for exactly this reason), and it visually sits well
  // above its marker's actual screen point (LABEL_LIFT_PX + the label's own
  // height) — a canvas raycast at the pin's screen position would mostly
  // miss the marker underneath it. Starting from the pin also means this
  // never has to fight OrbitControls for pointerdown priority: the pin lives
  // in a sibling overlay div, not inside `renderer.domElement`, so
  // OrbitControls' own listener never sees this gesture at all.
  //
  // Only real assets are draggable, not pending stubs — a stub's position is
  // inferred from its id, not authored, so there's nothing to drag it TO.
  // "Ground assets stay pinned to terrain height, air assets stay in their
  // elevation band" falls out of reusing worldPlacement() — the same
  // function every asset is placed with initially — for every live update
  // during the drag rather than reimplementing that rule here: only km (via
  // worldXToKm) and z move; Y is whatever worldPlacement() says it should be
  // at the new (x, z), same as it was on load.
  const ndcFromClient = useCallback((clientX: number, clientY: number): THREE.Vector2 => {
    const renderer = rendererRef.current;
    if (!renderer) return new THREE.Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }, []);

  const onPinDragMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      const camera = cameraRef.current;
      if (!drag || !camera || e.pointerId !== drag.pointerId) return;
      // ── the discriminator ────────────────────────────────────────────
      // Until the pointer travels further than TAP_SLOP_PX this gesture is
      // still potentially a tap, and nothing moves. Past it, the gesture has
      // committed to being a drag and can never become a tap again — which
      // is what stops "I meant to drag it" ending in an opened detail panel.
      if (!drag.dragging) {
        if (Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY) < TAP_SLOP_PX) {
          return;
        }
        drag.dragging = true;
        // Once committed, swallow the click the browser will synthesise on
        // release. Refreshed again on pointerup, since a long drag would
        // otherwise outlive this window.
        swallowClickUntilRef.current = performance.now() + CLICK_SWALLOW_MS;
      }
      const entry = entriesRef.current.find((x) => x.id === drag.id);
      if (!entry) return;
      const raycaster = dragRaycasterRef.current;
      raycaster.setFromCamera(ndcFromClient(e.clientX, e.clientY), camera);
      if (!raycaster.ray.intersectPlane(dragPlaneRef.current, dragHitRef.current)) return;

      const side = nodeSide(entry.node);
      const platformDomain = nodePlatformDomain(entry.node);
      const proj = projRef.current;
      // Clamped to this asset's own side: a drag repositions where a real
      // system stands, not which side of the war it's on, so crossing the
      // zero line clamps to it rather than reassigning `side`.
      const km = worldXToKm(side, dragHitRef.current.x, proj);
      const z = THREE.MathUtils.clamp(dragHitRef.current.z, -STRIP_HALF_Z, STRIP_HALF_Z);
      const next = worldPlacement({ side, platformDomain, km, z, proj, terrainHeightAt: terrainHeight });
      entry.group.position.set(next.x, next.y, next.z);
      const markerY = entry.grounded ? 1.4 : 7.5;
      entry.anchor.set(next.x, next.y + markerY, next.z);

      // Pass 19: marker/ring/fill are shared InstancedMesh rows, not this
      // entry's own children — moving `entry.group` (above) no longer moves
      // them for free. layout() (triggered by the dirty bump below) will
      // re-set the marker's matrix from `entry.anchor` on the next frame,
      // but it never touches ring/fill (their matrices are static outside a
      // drag), so this is the one place that has to move all three itself.
      const inst = instancedRef.current;
      if (inst) {
        const s = dragScratchRef.current;
        const i = entry.idx;
        s.matrix.compose(entry.anchor, s.quat.identity(), s.scale.setScalar(1));
        inst.marker.setMatrixAt(i, s.matrix);
        s.matrix.compose(new THREE.Vector3(next.x, next.y + entry.padY + 0.02, next.z), s.ringQuat, s.scale);
        inst.ring.setMatrixAt(i, s.matrix);
        s.matrix.compose(new THREE.Vector3(next.x, next.y + entry.padY, next.z), s.ringQuat, s.scale);
        inst.fill.setMatrixAt(i, s.matrix);
        inst.marker.instanceMatrix.needsUpdate = true;
        inst.ring.instanceMatrix.needsUpdate = true;
        inst.fill.instanceMatrix.needsUpdate = true;
      }

      // The asset moved without the camera moving, so the layout pass would
      // otherwise skip and the label would sit on the marker's old point.
      layoutDirtyRef.current++;
    },
    [ndcFromClient],
  );

  const onPinDragEnd = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (drag && e.pointerId !== drag.pointerId) return;
      window.removeEventListener("pointermove", onPinDragMove);
      window.removeEventListener("pointerup", onPinDragEnd);
      window.removeEventListener("pointercancel", onPinDragEnd);
      const controls = controlsRef.current;
      if (controls) controls.enabled = true;
      dragRef.current = null;
      if (!drag) return;
      if (drag.target && drag.target.hasPointerCapture?.(drag.pointerId)) {
        drag.target.releasePointerCapture(drag.pointerId);
      }

      const heldMs = performance.now() - drag.startedAt;
      const travelled = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);

      if (!drag.dragging) {
        // Neither threshold crossed → this was a tap, and a tap selects.
        // Crossing EITHER (a long stationary press, or movement) means it was
        // not a tap and nothing is selected — a press-and-wiggle that ends
        // where it began no longer opens a panel the user didn't ask for.
        if (travelled < TAP_SLOP_PX && heldMs <= TAP_MAX_MS) {
          view.select(drag.id);
        }
        // Either way the pointer path has resolved this gesture; the click
        // the browser is about to synthesise must not resolve it a second
        // time (see the onClick handler, which only serves the keyboard).
        swallowClickUntilRef.current = performance.now() + CLICK_SWALLOW_MS;
        return;
      }

      // A committed drag. Re-arm the swallow window from the release, not
      // from where the drag committed.
      swallowClickUntilRef.current = performance.now() + CLICK_SWALLOW_MS;
      const entry = entriesRef.current.find((x) => x.id === drag.id);
      if (!entry) return;
      const side = nodeSide(entry.node);
      const km = Math.max(0, Math.round(worldXToKm(side, entry.group.position.x, projRef.current) * 10) / 10);
      // Committed to the SAME overrides store every other edit in this app
      // uses (src/state/overridesState.tsx) — a dropped asset is a placement
      // edit, not a new kind of state. This is what makes the drop survive the
      // full rebuild the next render triggers (the "asset objects" effect
      // above), what the detail panel's "edited locally" tag picks up, and
      // what Export/the sync worker carry along with everything else.
      overrides.setAssetOverride(entry.id, {
        distance_km_from_zero: km,
        lateral_offset_world: Math.round(entry.group.position.z * 100) / 100,
      });
      // A drop no longer SELECTS (Pass 16 item 4). Selecting opened the
      // detail panel over the map at the end of every drag — the exact
      // complaint — and it also fired flyTo(), so the camera lurched away
      // from the position you had just chosen. The confirmation is now a
      // transient line that names the new distance and gets out of the way.
      const label = swapNamesRef.current.get(entry.id) ?? entry.id;
      setDropNote(`${label} → ${km} km`);
      window.clearTimeout(dropNoteTimerRef.current);
      dropNoteTimerRef.current = window.setTimeout(() => setDropNote(null), 2200);
      // Depend on view.select specifically, not `view` — `view` gets a new
      // identity on every hover, and this function's reference has to stay
      // stable across a drag: the cleanup effect just below tears down the
      // listeners whenever THIS reference changes, and if a hover fired mid-
      // drag and swapped it out, the pointerup that ends the drag would never
      // reach it. That was a real bug here, caught by testing an actual drag
      // rather than just reading the handler code.
    },
    [onPinDragMove, overrides.setAssetOverride, view.select],
  );

  const onPinDragStart = useCallback(
    (id: string, e: React.PointerEvent) => {
      if (e.button !== 0) return; // primary button/touch only
      const entry = entriesRef.current.find((x) => x.id === id);
      if (!entry) return;
      const controls = controlsRef.current;
      if (controls) controls.enabled = false;
      dragPlaneRef.current.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), entry.group.position);
      const target = e.currentTarget as HTMLElement;
      // Pointer capture keeps the gesture bound to the pin even though the
      // pin moves out from under the pointer as the asset follows it — and
      // it means a release outside the pin still reaches this handler rather
      // than landing on the canvas as a deselecting click.
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // Capture is best-effort; the window listeners below are the floor.
      }
      dragRef.current = {
        id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startedAt: performance.now(),
        pointerId: e.pointerId,
        dragging: false,
        target,
      };
      window.addEventListener("pointermove", onPinDragMove);
      window.addEventListener("pointerup", onPinDragEnd);
      window.addEventListener("pointercancel", onPinDragEnd);
    },
    [onPinDragMove, onPinDragEnd],
  );

  // Drags in progress must not survive an unmount (route away mid-drag, etc.)
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPinDragMove);
      window.removeEventListener("pointerup", onPinDragEnd);
      window.removeEventListener("pointercancel", onPinDragEnd);
      window.clearTimeout(dropNoteTimerRef.current);
      dragRef.current = null;
    };
  }, [onPinDragMove, onPinDragEnd]);

  // Raycast so the models themselves are clickable, not just their labels.
  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      // A click landing here right after a drag is the browser's synthetic
      // release click, not a new intent — acting on it deselected the asset
      // the user had just repositioned.
      if (performance.now() < swallowClickUntilRef.current) return;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      if (!camera || !renderer) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      // Pass 19: the marker/ring/fill trio is three shared InstancedMeshes
      // now, not children of each entry's own group — they raycast
      // separately, and a hit reports `instanceId` instead of an object to
      // walk up from. Hero-model groups (LOD + tether only, post-Pass-19)
      // still raycast the old way. Both go into one intersectObjects call so
      // three.js sorts them together by distance — whichever is actually
      // nearest the camera wins, same as before.
      const inst = instancedRef.current;
      const targets: THREE.Object3D[] = entriesRef.current.map((x) => x.group);
      if (inst) targets.push(inst.marker, inst.ring, inst.fill);
      const hits = ray.intersectObjects(targets, true);
      if (hits.length === 0) {
        view.select(null);
        return;
      }
      const hit = hits[0];
      if (inst && (hit.object === inst.marker || hit.object === inst.ring || hit.object === inst.fill)) {
        const entry = entriesRef.current[hit.instanceId ?? -1];
        view.select(entry ? entry.id : null);
        return;
      }
      let o: THREE.Object3D | null = hit.object;
      while (o && !entriesRef.current.some((x) => x.group === o)) o = o.parent;
      const entry = entriesRef.current.find((x) => x.group === o);
      if (entry) view.select(entry.id);
      else view.select(null);
    },
    [view],
  );

  /** Stores each pin's DOM node so the render loop can position it directly.
   *  A ref callback rather than an effect: React hands the node over at the
   *  moment it exists, which is what lets the loop treat the roster as
   *  write-through rather than having to check for a node every frame. */
  const setPinEl = useCallback((id: string) => {
    return (el: HTMLButtonElement | null) => {
      const map = pinDomRef.current;
      if (el) map.set(id, { el, x: NaN, y: NaN, z: -1, cls: "", shown: false });
      else map.delete(id);
      // A newly attached node has never been positioned, and React commits
      // it AFTER the layout pass that would have positioned it — so without
      // this the very first frame's layout writes into an empty map and the
      // idle-skip then keeps any later layout from running. The labels only
      // appeared once you happened to move the camera. Attaching a node is
      // itself a reason to lay out again.
      layoutDirtyRef.current++;
    };
  }, []);

  const setRulerEl = useCallback((key: string) => {
    return (el: HTMLDivElement | null) => {
      if (el) rulerElsRef.current.set(key, el);
      else rulerElsRef.current.delete(key);
    };
  }, []);

  // Left/right rear labels follow the camera, not the data (item 8).
  const leftSide = view.axisFlipped ? "side_b" : "side_a";
  const rightSide = view.axisFlipped ? "side_a" : "side_b";

  return (
    <div className="scene3d">
      <div className="scene3d__mount" ref={mountRef} onClick={onCanvasClick} />

      {/* Labels are DOM, positioned from the projected MARKER point each frame
          and then lifted a constant number of pixels — screen space, not world
          space, which is what keeps a nametag locked over its own icon at any
          camera pitch. They stay the accessible, keyboard-reachable
          representation of the scene — the canvas is the picture, this is the
          interface.

          Every asset gets a node, mounted once; the loop decides frame by
          frame which of them are actually drawn (`is-off`). Mounting the full
          roster and hiding most of it beats mounting and unmounting as the
          camera moves: React does no work per frame, the fade in and out is a
          plain CSS opacity transition, and a decluttered pin stays in the tab
          order, so the keyboard path this layer exists for is unaffected. */}
      <div className="scene3d__labels">
        {pins.map((l) => (
          <button
            key={l.id}
            ref={setPinEl(l.id)}
            type="button"
            className="pin3d is-off"
            style={{
              ["--accent" as string]: l.accent,
              ["--side" as string]: l.sideColor,
              ["--lift" as string]: `${LABEL_LIFT_PX}px`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              // Pointer gestures are resolved by the discriminator in
              // onPinDragEnd, which sets a swallow window; what reaches here
              // inside that window is the synthetic click that follows every
              // release. `detail === 0` is the keyboard's synthetic click
              // (Enter/Space), which has no pointer path and must still work.
              if (e.detail !== 0 && performance.now() < swallowClickUntilRef.current) return;
              view.select(l.id);
            }}
            onPointerDown={(e) => {
              if (!l.isStub) onPinDragStart(l.id, e);
            }}
            onMouseEnter={() => view.hover(l.id)}
            onMouseLeave={() => view.hover(null)}
            onFocus={() => view.hover(l.id)}
            onBlur={() => view.hover(null)}
            aria-pressed={view.selectedId === l.id}
          >
            <span className="pin3d__name">{l.name}</span>
            <span className="pin3d__km">{l.isStub ? "pending" : `${l.km} km`}</span>
          </button>
        ))}
      </div>

      {/* Banded distance ruler (item 9). Each segment is positioned from the
          real projected screen-X of its band's edges, so a band that the axis
          compresses hard is visibly narrower than one it doesn't — the ruler
          SHOWS the compression rather than papering over it with an even
          scale that would be a lie. The per-band "km per 100px" readout is
          the same fact stated numerically. */}
      <div className="ruler3d" ref={rulerRootRef} data-readable="true" aria-hidden="true">
        {(["side_a", "side_b"] as const).map((side) =>
          proj.spans.map((span) => (
            <div
              key={`${side}:${span.band.id}`}
              ref={setRulerEl(`${side}:${span.band.id}`)}
              className={`ruler3d__band ruler3d__band--${side}`}
              style={{ ["--side" as string]: SIDE_ACCENT[side].base }}
              data-on="0"
              data-roomy="0"
            >
              <span className="ruler3d__label">{span.band.label}</span>
              <span className="ruler3d__scale" />
            </div>
          )),
        )}
        <span className="ruler3d__caption">
          band scale — segments are equal in km only within a band
        </span>
      </div>

      {/* Screen-reader equivalent of the ruler: the compression is a fact
          about the data, not only about the picture. */}
      <p className="sr-only">
        The horizontal axis is compressed differently per distance band:{" "}
        {proj.spans
          .map((s) => `${s.band.label}, ${s.band.min_km} to ${s.displayMaxKm} km`)
          .join("; ")}
        .
      </p>

      <div className="scene3d__legend">
        <span className={`scene3d__side scene3d__side--${leftSide === "side_a" ? "a" : "b"}`}>
          ← {SIDE_LABELS[leftSide].short} rear
        </span>
        <span className="scene3d__zero">zero line</span>
        <span className={`scene3d__side scene3d__side--${rightSide === "side_a" ? "a" : "b"}`}>
          {SIDE_LABELS[rightSide].short} rear →
        </span>
      </div>

      {/* Drag confirmation. Replaces the detail panel that used to open on
          every drop (item 4) — it names what moved and where, then leaves. */}
      <div className="scene3d__dropnote" role="status" aria-live="polite">
        {dropNote ? <span>{dropNote}</span> : null}
      </div>

      {/* ODbL credit (Pass 17 item 2) — non-optional the moment the OSM
          inset's rail/tree/road geometry is actually on screen. Read off the
          loaded file's own `source.attribution`, not hardcoded, so it can
          never drift from what the data file itself declares. */}
      {osmAttribution && <div className="scene3d__osm-credit">{osmAttribution}</div>}
    </div>
  );
}

export default Scene3D;
