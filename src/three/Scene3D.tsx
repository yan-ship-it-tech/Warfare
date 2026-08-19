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
//
// Pass 13 kept that architecture and changed how the DOM half is DRIVEN.
// Until this pass the loop rebuilt a React array of label descriptors and
// called setLabels() once per frame, so every frame carried a full React
// render + reconciliation + style recalculation of up to ~90 absolutely
// positioned buttons — and it landed AFTER renderer.render(), which is
// exactly why the pins visibly lagged the scene during a pan and snapped
// back when it stopped. Now React owns only what a pin IS (one stable
// button per node, mounted once); the loop owns where it is and what state
// it is in, written straight to style/classList inside the same rAF that
// draws the frame. React commits during a pan went from one per frame to
// zero. See docs/DECISIONS.md Pass 13.
// ─────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { WorldModel, SceneNode } from "../data/model";
import { nodeSide, nodeDomain, nodePlatformDomain, nodeDistance } from "../data/model";
import { buildProjection } from "../scene/projection";
import { LabelGrid } from "../scene/labelGrid";
import { DOMAIN_ACCENT, SIDE_ACCENT, SIDE_LABELS } from "../config/ui";
import type { Side } from "../types";
import { useViewState } from "../state/viewState";
import { useOverrides } from "../state/overridesState";
import { resolveAssetDisplay } from "../data/catalog";
import { buildTerrain, terrainHeight } from "./terrain3d";
import { buildProps, PROP_BUDGET } from "./props";
import { buildScenery, disposeScenery, SCENERY_BUDGET } from "./scenery";
import { buildHeroModel, hasHeroModel } from "./models";
import { installPerfHud, markReactCommit, type PerfHud } from "./perfHud";
import { mergeStaticGroup } from "./mergeStatic";
import { buildRulerModel, type RulerModel } from "./ruler3d";
import { buildOsmInset, disposeOsmInset, OSM_ATTRIBUTION } from "./osmTerrain";
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
/** Label distance tiers, expressed RELATIVE to how far the camera currently
 *  sits from its orbit target. Inside the near tier a label may carry its
 *  title; beyond it, it degrades to a hit-target-only pin; past the far tier
 *  it is not in the document at all.
 *
 *  Relative, not absolute, because absolute thresholds break at the ends of
 *  the zoom range: with a fixed 700-unit cutoff and OrbitControls.maxDistance
 *  at 900, pulling all the way back put every asset past the cutoff and the
 *  scene lost its labels entirely instead of thinning. Scaling with the orbit
 *  radius means "far" always means far *for this framing* — zooming out thins
 *  the field via the budget and collision grid, which is the intended
 *  behaviour, rather than emptying it.
 *
 *  Pass 13 tightened the near tier (was camDist * 1.25 + 60): with ~90 assets
 *  the old value titled most of the field most of the time, which is the
 *  "every label rendered all the time" the brief asked to stop. */
const LABEL_FULL_DIST = (camDist: number) => camDist * 0.72 + 34;
const LABEL_DOT_DIST = (camDist: number) => camDist * 3 + 200;
/** Titled labels allowed per megapixel of viewport. The budget scales with
 *  the area actually available rather than being a fixed count that is stingy
 *  on a desktop and unreadable on a phone. Pass 13 halved it (was 30) and
 *  added the hard cap below — 30/Mpx on a 1440×900 screen authorised 39
 *  simultaneous titles, which is a wall of text, not a decluttered field. */
const LABEL_BUDGET_PER_MPX = 13;
/** Ceiling regardless of viewport area. A 4K display should show more labels
 *  than a phone, but not proportionally more — past this many the reader is
 *  scanning, not reading, whatever the screen size. */
const LABEL_BUDGET_MAX = 20;
/** Terrain samples per occlusion probe. */
const OCCLUSION_SAMPLES = 6;
/** Ceiling on how long the declutter pass may go without re-running while the
 *  camera sits still. Everything else is event-driven (see `labelsDirty`);
 *  this only catches drift nothing else reports. */
const DECLUTTER_MAX_INTERVAL_MS = 400;

// ── pan sensitivity ──────────────────────────────────────────────────────
// Three's defaults (all 1) scale pan/rotate distance with camera distance
// from the target — at this scene's default framing that reads as wildly
// oversensitive with a mouse: a small drag traverses a large fraction of the
// strip. Pass 7 slowed it to 0.4 and added damping, and that is still right
// for a mouse, where the pointer can travel the full width of a desktop
// screen in one gesture.
//
// It is NOT right for a two-finger pan, which is what Pass 13 item 3 is
// about: on a phone the same 0.4 has to move ~400 world units of strip using
// a gesture that can physically travel maybe 300 CSS px before the fingers
// run out of glass, so crossing the map took half a dozen repeated swipes.
// The fix is a touch-specific multiplier on the SAME curve rather than a
// second pan implementation — damping, bounds clamping and the rest are
// unchanged and still shared.
const PAN_SPEED_MOUSE = 0.4;
const PAN_SPEED_TOUCH = 1.15;

// ── drag gesture discrimination (Pass 13 item 4) ─────────────────────────
/** Pointer travel, in CSS px, past which a press on a pin IS a drag. The old
 *  value was 4 px, which is inside the jitter of a real finger tap on a phone
 *  and roughly at the edge of it for a mouse — so taps kept turning into
 *  drags of a few px, and drags that started slowly kept being read as taps. */
const DRAG_SLOP_PX = 9;
/** Hold this long without releasing and the press commits to a drag even
 *  before the slop is crossed. That is the touch path: a deliberate
 *  press-and-hold arms the drag, so the subsequent slow finger movement is
 *  never mistaken for a tap that wandered. */
const DRAG_HOLD_MS = 380;
/** Release later than this, having never moved the asset, and the press is
 *  read as a cancelled drag rather than as a tap — nothing is selected. Sits
 *  well beyond DRAG_HOLD_MS on purpose: between the two, the drag is armed
 *  but a release without movement still counts as a tap, so someone who
 *  simply clicks slowly is not punished for it. Past this, holding still and
 *  letting go is the only way to back out of a drag you didn't want. */
const TAP_MAX_MS = 700;

type LabelTier = "full" | "dot" | "hidden";

/** Dynamic pin classes, as a bitmask — the render loop diffs the mask and
 *  only touches classList for the bits that actually changed, which is what
 *  keeps a 90-pin field off the style-recalculation budget during a pan. */
const C_SELECTED = 1;
const C_HOVERED = 2;
const C_DIMMED = 4;
const C_FOCUSED = 8;
const C_COLLAPSED = 16;
const C_HIDDEN = 32;
const C_DRAGGING = 64;
const CLASS_BITS: [number, string][] = [
  [C_SELECTED, "is-selected"],
  [C_HOVERED, "is-hovered"],
  [C_DIMMED, "is-dimmed"],
  [C_FOCUSED, "is-focused"],
  [C_COLLAPSED, "is-collapsed"],
  [C_HIDDEN, "is-hidden"],
  [C_DRAGGING, "is-dragging"],
];

/** What React mounted for one node, and what the loop last wrote to it. Held
 *  on the Entry so a frame costs one Map lookup per pin and no allocation. */
interface PinRender {
  cls: number;
  tx: number;
  ty: number;
  z: number;
  tier: LabelTier;
  /** Cached ridge-occlusion verdict — the probe is 5 terrainHeight() calls,
   *  and running it for every asset every frame was ~450 noise evaluations a
   *  frame for a verdict that only changes when the camera does. */
  occluded: boolean;
  occludedAt: number;
}

interface Entry {
  id: string;
  node: SceneNode;
  group: THREE.Group;
  /** The marker's own world position. Labels project THIS and then offset in
   *  screen space — never a pre-lifted world point. */
  anchor: THREE.Vector3;
  marker: THREE.Mesh;
  ring: THREE.Mesh;
  fill: THREE.Mesh;
  lod: THREE.LOD | null;
  /** Grounded assets can be hidden behind terrain; elevated ones effectively
   *  cannot, so they skip the occlusion probe entirely. */
  grounded: boolean;
  /** The marker/ring/fill's real colour, so scenario-focus dimming (which
   *  desaturates toward grey) has something to restore to without re-reading
   *  it off the material each time. */
  baseColor: THREE.Color;
  sideColorHex: THREE.Color;
  /** Per-frame scratch, written in place. Reused rather than reallocated —
   *  see docs/DECISIONS.md Pass 13 on per-frame allocation. */
  sx: number;
  sy: number;
  sz: number;
  dist: number;
  r: PinRender;
}

/** One pin's static content. Derived from `nodes`, so React re-renders the
 *  label layer when the roster changes and at no other time. */
interface PinDatum {
  id: string;
  name: string;
  km: number;
  isStub: boolean;
  side: Side;
  accent: string;
  sideColor: string;
}

// Marker, side ring and side fill are the same three shapes for every asset
// in the scene — one octahedron, one ring, one disc. They were built fresh
// per asset, which is ~270 BufferGeometry allocations and ~270 GPU buffer
// uploads on load AND on every rebuild (a rebuild is what a placement edit
// triggers). Shared module-level geometries instead; only the MATERIALS stay
// per-asset, because those are what carry per-asset colour, opacity and the
// scenario-focus dimming state.
const MARKER_GEO = new THREE.OctahedronGeometry(1.5, 0);
const RING_GEO = new THREE.RingGeometry(2.15, 2.9, 28);
const FILL_GEO = new THREE.CircleGeometry(2.15, 20);

/**
 * Cheap ridge-occlusion probe: march the camera→target segment and report
 * whether terrain rises above it anywhere along the way. Six samples is not a
 * depth buffer, but it reliably catches the case that actually misleads — a
 * label for something sitting in dead ground behind a rise, drawn as if it
 * were in front of it.
 */
function occludedByTerrain(cam: THREE.Vector3, target: THREE.Vector3): boolean {
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
  const [ready, setReady] = useState(false);

  // Refs the animation loop reads without forcing a React re-render.
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const entriesRef = useRef<Entry[]>([]);
  /** Same entries, kept in a second array the declutter pass sorts in place.
   *  Sorting `entriesRef.current` itself would reorder the list every other
   *  piece of code iterates. */
  const orderRef = useRef<Entry[]>([]);
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

  // ── what the loop is allowed to skip ───────────────────────────────────
  // The declutter/label pass is not free (a sort, a collision grid, a ridge
  // probe and up to ~90 DOM writes), and for most frames of a still camera
  // it would compute exactly what it computed last frame. These two flags,
  // plus OrbitControls.update()'s own "did anything move" return value, are
  // what let it be skipped — which is what turns an idle scene from "React
  // and the style engine running flat out" into "draw the frame".
  /** Positions changed for a reason the camera doesn't know about: an asset
   *  was dragged, the roster changed, the viewport resized. */
  const labelsDirtyRef = useRef(true);
  /** Selection / hover / scenario-focus changed, so the WebGL materials and
   *  the pin classes need rewriting. Material writes used to happen for every
   *  entry every frame — ~540 colour copies a frame to express a state that
   *  changes when a human clicks something. */
  const visualsDirtyRef = useRef(true);
  const hudRef = useRef<PerfHud | null>(null);
  /** Marker/ring/fill materials, kept alive across scene rebuilds.
   *
   *  A placement edit (a drag-drop, an inline distance change) rebuilds every
   *  asset group. Rebuilding ~90 of them means ~270 brand-new materials, and
   *  the first renderer.render() after that has to bind a fresh program and a
   *  fresh uniform set for each one — measured at ~97 ms of main thread in a
   *  single frame, which is the drop's visible hitch. The geometry is shared
   *  (MARKER_GEO and friends); the materials cannot be, because they carry
   *  per-asset colour, opacity and scenario-focus state — so they are cached
   *  per asset instead. Keyed on everything that would change what the
   *  material looks like, so a catalog swap or a side change still gets a new
   *  one. Disposed on unmount, not on rebuild. */
  const matCacheRef = useRef(
    new Map<
      string,
      { marker: THREE.MeshStandardMaterial; ring: THREE.MeshBasicMaterial; fill: THREE.MeshBasicMaterial }
    >(),
  );

  // ── DOM the render loop writes to directly ─────────────────────────────
  const pinElsRef = useRef(new Map<string, HTMLButtonElement>());
  const tickElsRef = useRef(new Map<string, HTMLElement>());
  const bandElsRef = useRef(new Map<string, HTMLElement>());
  const rulerRootRef = useRef<HTMLDivElement | null>(null);
  const rulerModelRef = useRef<RulerModel | null>(null);
  /** Screen X of every ruler label placed this pass, for the collision test.
   *  Fixed-size and reused — the ruler update runs at the same rate as the
   *  label declutter, and allocating an array there would undo the point. */
  const placedLabelXRef = useRef(new Float64Array(96));
  const axisFlippedRef = useRef(false);
  /** The render loop is built once on mount and has to reach the CURRENT
   *  setter — see the effect that keeps this up to date. */
  const setAxisFlippedRef = useRef(view.setAxisFlipped);

  /** In-progress drag-to-reposition state, read/written by the pin's
   *  pointerdown/move/up handlers below. A ref, not state, so a pointermove
   *  doesn't force a re-render 60 times a second — same reasoning as every
   *  other ref the render loop touches. null when nothing is being dragged. */
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    el: HTMLElement;
    startClientX: number;
    startClientY: number;
    startT: number;
    /** Set once the gesture has been classified as a drag rather than a tap. */
    committed: boolean;
    /** Set once the asset has actually been moved, which is what decides
     *  whether there is anything to write back on release. */
    movedAsset: boolean;
    /** Furthest the pointer ever got from where it went down. A tap is a
     *  gesture that never exceeded DRAG_SLOP_PX, measured over the whole
     *  press rather than at the moment of release — a finger that wanders
     *  30 px out and comes back is not a tap. */
    maxDist: number;
    holdTimer: number;
  } | null>(null);
  const dragRaycasterRef = useRef(new THREE.Raycaster());
  const dragPlaneRef = useRef(new THREE.Plane());
  const dragHitRef = useRef(new THREE.Vector3());
  /** Set on pointerup so the click event the browser synthesises right after
   *  doesn't select a second time (or re-select something we just dragged).
   *  Keyboard activation still reaches onClick, which is the whole reason
   *  these stay <button>s. */
  const pointerHandledRef = useRef(false);

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

  /** One React-rendered button per node. This list — not a per-frame
   *  recomputation of who is visible — is what React reconciles. */
  const pinData = useMemo<PinDatum[]>(
    () =>
      nodes.map((n) => {
        const side = nodeSide(n);
        const domain = nodeDomain(n);
        return {
          id: n.id,
          name: n.kind === "asset" ? swapNames.get(n.asset.id) ?? n.asset.name : n.stub.label,
          km: nodeDistance(n),
          isStub: n.kind === "stub",
          side,
          accent: DOMAIN_ACCENT[domain] ?? "#8b93a3",
          sideColor: SIDE_ACCENT[side].base,
        };
      }),
    [nodes, swapNames],
  );

  const rulerModel = useMemo(() => buildRulerModel(proj), [proj]);
  useEffect(() => {
    rulerModelRef.current = rulerModel;
    labelsDirtyRef.current = true;
  }, [rulerModel]);

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
    controls.rotateSpeed = 0.55;
    controls.panSpeed = PAN_SPEED_MOUSE;
    controls.zoomSpeed = 0.7;
    controlsRef.current = controls;

    // Pan gain is per input device, not per app (Pass 13 item 3). Set from
    // whatever pointer most recently started a gesture on the canvas, before
    // OrbitControls' own handler for the same event reads panSpeed — hence
    // the capture phase. Everything else about the pan (damping, the soft
    // bounds clamp below) is shared and untouched.
    const onCanvasPointerDown = (e: PointerEvent) => {
      controls.panSpeed = e.pointerType === "touch" ? PAN_SPEED_TOUCH : PAN_SPEED_MOUSE;
    };
    renderer.domElement.addEventListener("pointerdown", onCanvasPointerDown, { capture: true, passive: true });

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
      // A resize moves every projected point; nothing else would report it.
      labelsDirtyRef.current = true;
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const removeHud = installPerfHud(renderer, mount, (hud) => {
      hudRef.current = hud;
    });

    let raf = 0;
    // Scratch, allocated once. Nothing inside tick() may allocate: at 60 Hz a
    // per-frame Vector3 (or a fresh array of ~90 measurement objects, which
    // is what this loop used to build) is a guaranteed minor-GC treadmill,
    // and a minor GC landing mid-pan is exactly the hitch Pass 13 was asked
    // to remove.
    const projected = new THREE.Vector3();
    const axisProbe = new THREE.Vector3();
    const grid = new LabelGrid();
    let lastDeclutterAt = 0;
    let nFull = 0;
    let nDot = 0;
    let nHidden = 0;

    /** Screen X of a point on the distance axis, in CSS px — NaN if the point
     *  is behind the camera. The behind check is done in view space, before
     *  the perspective divide, because after it a behind-camera point is
     *  indistinguishable from a far-off-screen one: w goes negative and x
     *  comes back mirrored. */
    const axisScreenX = (worldX: number, w: number): number => {
      axisProbe.set(worldX, 0, 0).applyMatrix4(camera.matrixWorldInverse);
      if (axisProbe.z > -camera.near) return NaN;
      axisProbe.applyMatrix4(camera.projectionMatrix);
      return (axisProbe.x * 0.5 + 0.5) * w;
    };

    // ── the declutter + DOM-write pass ───────────────────────────────────
    // Runs only when something it depends on has changed (see labelsDirtyRef
    // / visualsDirtyRef / OrbitControls.update()'s return). Writes go straight
    // to style and classList inside this rAF, so a pin and its marker are
    // drawn from the SAME camera — which is the whole fix for pins lagging
    // the scene during a pan and snapping back at the end of it.
    const labelPass = (now: number, w: number, h: number, visualsDirty: boolean) => {
      const entries = entriesRef.current;
      const camPos = camera.position;
      const pins = pinElsRef.current;

      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        // Project each marker's OWN world point. Everything that lifts the
        // label clear of its icon happens below, in pixels, so the offset
        // cannot vary with camera pitch the way a world-space lift does.
        projected.copy(e.anchor).project(camera);
        e.sx = (projected.x * 0.5 + 0.5) * w;
        e.sy = (-projected.y * 0.5 + 0.5) * h;
        e.sz = projected.z;
        e.dist = camPos.distanceTo(e.anchor);
      }

      // Priority, best first. Pinned entries are placed before anything else
      // so they can never lose a collision to an arbitrary neighbour; a
      // lesson's focus set outranks the rest of the field; otherwise nearest
      // wins, which is also what reads correctly when two labels overlap.
      const focusIds = focusSetRef.current;
      const selId = selectedRef.current;
      const hovId = hoveredRef.current;
      const pinRank = (id: string): number => {
        if (selId === id) return 0;
        if (hovId === id) return 1;
        if (focusIds && focusIds.has(id)) return 2;
        return 3;
      };
      const order = orderRef.current;
      order.sort((a, b) => pinRank(a.id) - pinRank(b.id) || a.dist - b.dist);

      grid.clear();
      // Budget scales with viewport area, then caps.
      const budget = Math.min(
        LABEL_BUDGET_MAX,
        Math.max(6, Math.round(((w * h) / 1_000_000) * LABEL_BUDGET_PER_MPX)),
      );
      let titled = 0;
      // Tier thresholds follow the current framing — see LABEL_FULL_DIST.
      const orbitRadius = camPos.distanceTo(controls.target);
      const fullDist = LABEL_FULL_DIST(orbitRadius);
      const dotDist = LABEL_DOT_DIST(orbitRadius);
      const dragId = dragRef.current?.committed ? dragRef.current.id : null;
      nFull = 0;
      nDot = 0;
      nHidden = 0;

      for (let i = 0; i < order.length; i++) {
        const e = order[i];
        const sx = e.sx;
        const sy = e.sy;
        const isSel = selId === e.id;
        const isHov = hovId === e.id;
        const pinned = isSel || isHov;
        const behind = e.sz > 1;
        // Cull against the label's own box, not the marker point, so a pin
        // whose title would land entirely outside the viewport is never built.
        const offscreen =
          sx + LABEL_W / 2 < 0 ||
          sx - LABEL_W / 2 > w ||
          sy < -LABEL_H ||
          sy - LABEL_LIFT_PX - LABEL_H > h;

        // Scenario-focus mode: dim/desaturate everything not in the active
        // focus set, unless the user has selected or hovered it directly —
        // without that override, opening a lesson and then clicking some
        // other asset to compare it would leave the very thing you clicked
        // on nearly invisible, which is the "half-working" outcome the brief
        // warned against.
        const isStubEntry = e.node.kind === "stub";
        const inFocusMode = focusIds !== null;
        const inFocusSet = !inFocusMode || focusIds!.has(e.id);
        const dimmed = inFocusMode && !inFocusSet && !pinned;
        const highlighted = inFocusMode && inFocusSet && !pinned;

        if (visualsDirty) {
          const mat = e.marker.material as THREE.MeshStandardMaterial;
          const ringMat = e.ring.material as THREE.MeshBasicMaterial;
          const fillMat = e.fill.material as THREE.MeshBasicMaterial;
          if (dimmed) {
            mat.color.copy(FOCUS_DIM_COLOR);
            mat.emissive.copy(FOCUS_DIM_COLOR);
            mat.emissiveIntensity = 0.2;
            mat.opacity = (isStubEntry ? 0.55 : 1) * 0.22;
            ringMat.color.copy(FOCUS_DIM_COLOR);
            fillMat.color.copy(FOCUS_DIM_COLOR);
            ringMat.opacity = 0.1;
            fillMat.opacity = 0.04;
          } else {
            mat.color.copy(e.baseColor);
            mat.emissive.copy(e.baseColor);
            mat.emissiveIntensity = isSel ? 2.4 : isHov ? 1.5 : highlighted ? 1.05 : 0.75;
            mat.opacity = isStubEntry ? 0.55 : 1;
            ringMat.color.copy(e.sideColorHex);
            fillMat.color.copy(e.sideColorHex);
            // Side ring tracks selection too — the persistent cue gets
            // brighter rather than being replaced by a different one. A
            // scenario-focus member gets the same treatment one notch down,
            // so the highlighted set reads as a group without every member
            // looking selected.
            ringMat.opacity = isSel ? 0.95 : isHov ? 0.7 : highlighted ? 0.62 : 0.42;
            fillMat.opacity = isSel || isHov ? 0.13 : highlighted ? 0.2 : 0.13;
          }
          e.marker.scale.setScalar(isSel ? 1.6 : isHov ? 1.3 : 1);
        }

        let tier: LabelTier;
        if (behind || offscreen) {
          tier = "hidden";
        } else if (pinned) {
          // Selection and hover are always fully titled, at any distance.
          tier = "full";
        } else if (e.dist > dotDist) {
          tier = "hidden";
        } else if (e.dist > fullDist || titled >= budget) {
          tier = "dot";
        } else {
          const y2 = sy - LABEL_LIFT_PX;
          const box = { x1: sx - LABEL_W / 2, y1: y2 - LABEL_H, x2: sx + LABEL_W / 2, y2 };
          if (grid.collides(box)) {
            tier = "dot";
          } else if (e.grounded && occluded(e, camPos, now)) {
            // Behind a ridge: keep the hit target as a "something is there"
            // affordance, but never the title, which would read as being in
            // front of the rise. Probed HERE and not before the cheap tests,
            // so the ridge probe only runs for the handful of assets that
            // were about to win a title — not for all ~90, every frame.
            tier = "dot";
          } else {
            tier = "full";
          }
        }

        if (tier === "full") {
          const y2 = sy - LABEL_LIFT_PX;
          grid.insert({ x1: sx - LABEL_W / 2, y1: y2 - LABEL_H, x2: sx + LABEL_W / 2, y2 });
          if (!pinned) titled += 1;
          nFull += 1;
        } else if (tier === "dot") {
          // Hit targets reserve their own small footprint so they don't pile
          // into one unhittable clump at the far end of the axis.
          grid.insert({ x1: sx - 6, y1: sy - 6, x2: sx + 6, y2: sy + 6 });
          nDot += 1;
        } else {
          nHidden += 1;
        }

        // ── write it ──────────────────────────────────────────────────────
        const el = pins.get(e.id);
        if (!el) continue;
        const r = e.r;

        let cls = 0;
        if (isSel) cls |= C_SELECTED;
        if (isHov) cls |= C_HOVERED;
        if (dimmed) cls |= C_DIMMED;
        if (highlighted) cls |= C_FOCUSED;
        if (tier === "dot") cls |= C_COLLAPSED;
        if (tier === "hidden") cls |= C_HIDDEN;
        if (dragId === e.id) cls |= C_DRAGGING;
        if (cls !== r.cls) {
          const changed = cls ^ r.cls;
          for (let b = 0; b < CLASS_BITS.length; b++) {
            const [bit, name] = CLASS_BITS[b];
            if (changed & bit) el.classList.toggle(name, (cls & bit) !== 0);
          }
          if (changed & C_SELECTED) el.setAttribute("aria-pressed", isSel ? "true" : "false");
          r.cls = cls;
        }

        if (tier !== "hidden") {
          // A hit-target-only pin centres ON the marker; a titled one hangs
          // its bottom edge a fixed lift above it, with the leader stub
          // spanning exactly that gap.
          const ty = tier === "full" ? sy - LABEL_LIFT_PX : sy;
          if (tier !== r.tier || Math.abs(sx - r.tx) > 0.2 || Math.abs(ty - r.ty) > 0.2) {
            el.style.transform =
              tier === "full"
                ? `translate3d(${sx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) translate(-50%, -100%)`
                : `translate3d(${sx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) translate(-50%, -50%)`;
            r.tx = sx;
            r.ty = ty;
          }
          // Depth order among pins. Distance, not NDC z — NDC z is crushed
          // into the top of its range by this camera's far plane, so it
          // resolved barely a dozen distinct layers across the whole strip.
          const z = Math.max(1, Math.min(900, Math.round(900 - e.dist)));
          if (z !== r.z) {
            el.style.zIndex = String(z);
            r.z = z;
          }
        }
        r.tier = tier;
      }

      updateRuler(w);
      lastDeclutterAt = now;
    };

    /** Ridge-occlusion, memoised per entry. The probe is 5 terrainHeight()
     *  calls — ~35 value-noise evaluations — and its answer only changes when
     *  the camera does, so re-running it for every asset on every frame (what
     *  this loop used to do: ~450 noise evaluations a frame) bought nothing. */
    const occluded = (e: Entry, camPos: THREE.Vector3, now: number): boolean => {
      if (now - e.r.occludedAt < 120) return e.r.occluded;
      e.r.occluded = occludedByTerrain(camPos, e.anchor);
      e.r.occludedAt = now;
      return e.r.occluded;
    };

    // ── distance ruler ───────────────────────────────────────────────────
    // Ticks live at constant KILOMETRE steps and are drawn wherever that
    // kilometre projects to, so the spacing between them is the band
    // compression made visible. See src/three/ruler3d.ts.
    const updateRuler = (w: number) => {
      const model = rulerModelRef.current;
      const root = rulerRootRef.current;
      if (!model || !root || w <= 0) return;

      // Which way is the axis pointing on screen right now? Straight off the
      // camera's own right vector — matrixWorld's first column is where world
      // space maps to screen-right — rather than by projecting the two ends of
      // the axis and comparing them. Projection was the first attempt and it
      // is not safe here: a point behind the camera comes back through the
      // perspective divide with a NEGATIVE w, so its NDC x flips sign and the
      // comparison silently reports the axis mirrored when it isn't. The
      // deep-rear ends of a 360-unit axis go behind the camera routinely.
      // Everything below — and the header/legend side labels, Pass 13 item 8
      // — follows from this one number.
      const rightX = camera.matrixWorld.elements[0];
      const flipped = rightX < 0;
      if (flipped !== axisFlippedRef.current) {
        axisFlippedRef.current = flipped;
        setAxisFlippedRef.current(flipped);
      }

      // Orbited round to look straight down the axis: every tick projects to
      // nearly the same screen X and a screen-space ruler stops meaning
      // anything. Say so by hiding it, rather than drawing 60 ticks in a
      // 40 px pile and letting the reader think the axis really is that short.
      // |right · X| is the cosine of how side-on the axis is; below ~0.3 the
      // ruler is within about 17 degrees of end-on.
      const degenerate = Math.abs(rightX) < 0.3;
      if (degenerate !== root.classList.contains("is-degenerate")) {
        root.classList.toggle("is-degenerate", degenerate);
      }
      if (degenerate) return;

      const ticks = model.ticks;
      const els = tickElsRef.current;
      // model.ticks is sorted by world X; screen order is that or its reverse.
      const step = flipped ? -1 : 1;
      const start = flipped ? ticks.length - 1 : 0;
      const end = flipped ? -1 : ticks.length;

      // Two passes so that band EDGES — the ticks where the scale itself
      // changes, and therefore the ones a reader most needs the number of —
      // claim their labels before the interior ticks compete for the same
      // pixels. One pass in screen order let a 1 km tick take a slot and mute
      // the 500 km band edge two pixels along, which is exactly backwards.
      const placed = placedLabelXRef.current;
      let placedCount = 0;
      const fits = (sx: number, gap: number): boolean => {
        for (let j = 0; j < placedCount; j++) if (Math.abs(sx - placed[j]) < gap) return false;
        return true;
      };
      for (let pass = 0; pass < 2; pass++) {
        for (let i = start; i !== end; i += step) {
          const t = ticks[i];
          if (t.major !== (pass === 0)) continue;
          const el = els.get(t.key);
          if (!el) continue;
          const sx = axisScreenX(t.worldX, w);
          const off = Number.isNaN(sx) || sx < -30 || sx > w + 30;
          // A tick whose label would sit on top of its neighbour's keeps its
          // MARK and loses its NUMBER — the mark density is the compression
          // cue and must survive; the number is what would become unreadable.
          // Tighter on a phone: 44 px between numbers is a comfortable gap on
          // a 1440 px axis and most of a band on a 390 px one, where it would
          // leave the ruler with marks and almost no readable numbers.
          const narrow = w < 620;
          const showLabel =
            !off &&
            fits(sx, t.major ? (narrow ? 24 : 30) : narrow ? 34 : 44) &&
            placedCount < placed.length;
          if (showLabel) placed[placedCount++] = sx;
          if (!off) el.style.transform = `translate3d(${sx.toFixed(1)}px, 0, 0)`;
          el.classList.toggle("is-off", off);
          el.classList.toggle("is-mute", !showLabel);
        }
      }

      const bandEls = bandElsRef.current;
      for (const b of model.bands) {
        const el = bandEls.get(b.key);
        if (!el) continue;
        const a0 = axisScreenX(b.x0, w);
        const a1 = axisScreenX(b.x1, w);
        if (Number.isNaN(a0) || Number.isNaN(a1)) {
          el.classList.add("is-off");
          continue;
        }
        const left = Math.min(a0, a1);
        const width = Math.abs(a1 - a0);
        // Clamped to the viewport so a band running off-screen still shows
        // its name at the edge instead of parking it 2000 px away.
        const vis = Math.min(w, left + width) - Math.max(0, left);
        el.style.transform = `translate3d(${Math.max(0, left).toFixed(1)}px, 0, 0)`;
        el.style.width = `${Math.max(0, vis).toFixed(1)}px`;
        el.classList.toggle("is-off", vis < 74);
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const hud = hudRef.current;
      const now = performance.now();
      if (hud) hud.begin(now);

      // Camera fly-to, used by selection and by the Lessons page.
      const fly = flyRef.current;
      if (fly) {
        const t = Math.min(1, (now - fly.t0) / fly.dur);
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

      // OrbitControls.update() returns whether the camera actually moved this
      // frame — including the tail of its own damping. That is the authority
      // on "do the screen-space overlays need recomputing", and it is free.
      const camMoved = controls.update();

      const entries = entriesRef.current;
      for (let i = 0; i < entries.length; i++) entries[i].marker.rotation.y += 0.006;

      const w = mount.clientWidth;
      const h = mount.clientHeight;
      const visualsDirty = visualsDirtyRef.current;
      if (
        w > 0 &&
        h > 0 &&
        (camMoved ||
          visualsDirty ||
          labelsDirtyRef.current ||
          now - lastDeclutterAt > DECLUTTER_MAX_INTERVAL_MS)
      ) {
        labelsDirtyRef.current = false;
        visualsDirtyRef.current = false;
        labelPass(now, w, h, visualsDirty);
      }

      renderer.render(scene, camera);
      if (hud) {
        hud.setLabelCounts(nFull, nDot, nHidden);
        hud.end(performance.now());
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      removeHud();
      hudRef.current = null;
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onCanvasPointerDown, { capture: true });
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
    // Every sandbag, plank and dragon's tooth was its own draw call — several
    // hundred of them, none of which ever moves. Merged by material into a
    // handful of batches; the picture is identical, the per-draw overhead is
    // not. See src/three/mergeStatic.ts and docs/DECISIONS.md Pass 13.
    mergeStaticGroup(scenery);
    // The real Pokrovsk-AOI rail/tree-line patch — src/three/osmTerrain.ts.
    // Built alongside terrain/scenery for the same reason (only `proj`
    // changing should rebuild it, never a frame).
    const osmInset = buildOsmInset(proj);

    // Zero line — a standing marker plane, readable from an oblique angle
    // without foreshortening away. Pass 14 removed this group's other
    // occupant: a bright white LineBasicMaterial polyline running the full
    // length of the strip at a fixed z-step of 3, hugging noisy terrain
    // height. That reads exactly like what it is — a raw geometric
    // artifact, a "seam" — not a battlefield feature, and it's what item 6
    // was asking to fix (docs/DECISIONS.md Pass 14 has the before screenshot
    // that made this obvious once looked at rather than read). What marks
    // the line now: the terrain's own scar/damage tint (already there,
    // terrain3d.ts), the density of props.ts's crater/wreck scatter (already
    // concentrated at x≈0), and this pass's new static smoke columns
    // (scenery.ts) — cues that read as *the ground being fought over*
    // rather than a line drawn on top of it.
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

    // Distance graticule: one standing gate per band edge, both sides. These
    // are the in-scene counterpart to the screen-space ruler along the bottom
    // (src/three/ruler3d.ts) and are placed through the identical projection
    // call, so the ruler, the gates and the 2D schematic cannot drift.
    const gateMat = new THREE.LineBasicMaterial({ color: "#7d8798", transparent: true, opacity: 0.35 });
    const gatePts: THREE.Vector3[] = [];
    for (const span of proj.spans) {
      for (const side of ["side_a", "side_b"] as const) {
        const x = worldXFor(side, span.band.max_km, proj);
        // One LineSegments for every gate rather than one Line each: same
        // picture, one draw call instead of ten.
        const corners = [
          new THREE.Vector3(x, terrainHeight(x, -70) - 1, -70),
          new THREE.Vector3(x, terrainHeight(x, -70) + 13, -70),
          new THREE.Vector3(x, terrainHeight(x, 70) + 13, 70),
          new THREE.Vector3(x, terrainHeight(x, 70) - 1, 70),
        ];
        for (let i = 0; i < corners.length - 1; i++) {
          gatePts.push(corners[i], corners[i + 1]);
        }
      }
    }
    const gates = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gatePts), gateMat);
    zero.add(gates);

    scene.add(terrain, props, scenery, osmInset, zero);
    labelsDirtyRef.current = true;

    return () => {
      scene.remove(terrain, props, scenery, osmInset, zero);
      terrain.geometry.dispose();
      (terrain.material as THREE.Material).dispose();
      props.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      disposeScenery(scenery);
      disposeOsmInset(osmInset);
      zero.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
      });
      zeroMat.dispose();
      gateMat.dispose();
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
    const lateral = lateralLayout(
      nodes
        .filter((n) => !manualZ.has(n.id))
        .map((n) => ({
          id: n.id,
          side: nodeSide(n),
          km: nodeDistance(n),
          platformDomain: nodePlatformDomain(n),
        })),
      proj,
    );

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
        z: manualZ.get(node.id) ?? lateral.get(node.id) ?? 0,
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
        // Already merged by material, once, on the shared prototype — see
        // buildHeroModel(). Its geometries are flagged `sharedGeometry` and
        // must survive this scene's teardown.
        const model = buildHeroModel(node.id, sideColor);
        if (model) {
          lod = new THREE.LOD();
          lod.addLevel(model, 0);
          const proxy = new THREE.Mesh(
            new THREE.BoxGeometry(5, 2.4, 3),
            new THREE.MeshStandardMaterial({ color: "#4f5547", flatShading: true, roughness: 0.9 }),
          );
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
      const matKey = `${node.id}|${accent}|${sideColor}|${isStub ? 1 : 0}`;
      let mats = matCacheRef.current.get(matKey);
      if (!mats) {
        mats = {
          marker: new THREE.MeshStandardMaterial({
            color: isStub ? "#8b93a3" : accent,
            emissive: isStub ? "#8b93a3" : accent,
            emissiveIntensity: 0.75,
            flatShading: true,
            roughness: 0.4,
            // Always transparent, not just for stubs — scenario-focus mode
            // modulates opacity on every marker (see the label pass), and a
            // material created opaque silently ignores opacity writes.
            transparent: true,
            opacity: isStub ? 0.55 : 1,
          }),
          ring: new THREE.MeshBasicMaterial({
            color: sideColor,
            transparent: true,
            opacity: 0.42,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
          fill: new THREE.MeshBasicMaterial({
            color: sideColor,
            transparent: true,
            opacity: 0.13,
            depthWrite: false,
          }),
        };
        matCacheRef.current.set(matKey, mats);
      }
      const marker = new THREE.Mesh(MARKER_GEO, mats.marker);
      const markerY = elevated ? 7.5 : 1.4;
      marker.position.y = markerY;
      marker.userData.assetId = node.id;
      g.add(marker);

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
      //
      // Pass 13 note: this ring is also why the collapsed DOM label no longer
      // draws a coloured dot of its own. See docs/DECISIONS.md Pass 13 item 6.
      const padY = (elevated ? groundY : 0) + 0.12;

      const ring = new THREE.Mesh(RING_GEO, mats.ring);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = padY + 0.02;
      g.add(ring);

      const fill = new THREE.Mesh(FILL_GEO, mats.fill);
      fill.rotation.x = -Math.PI / 2;
      fill.position.y = padY;
      g.add(fill);

      root.add(g);
      entries.push({
        id: node.id,
        node,
        group: g,
        // The marker's own position — NOT a pre-lifted point. The lift that
        // keeps a label clear of its icon is applied in screen space in the
        // render loop, which is what stops it drifting off under camera tilt.
        anchor: new THREE.Vector3(pos.x, pos.y + markerY, pos.z),
        marker,
        ring,
        fill,
        lod,
        grounded: !elevated,
        baseColor: new THREE.Color(isStub ? "#8b93a3" : accent),
        sideColorHex: new THREE.Color(sideColor),
        sx: 0,
        sy: 0,
        sz: 0,
        dist: 0,
        // Starts matching what React just mounted: hidden, untransformed.
        // -99999 rather than NaN because every "has this moved enough to be
        // worth a style write" test below is a comparison, and comparisons
        // against NaN are false — the pin would never get its first write.
        r: { cls: C_HIDDEN, tx: -99999, ty: -99999, z: -1, tier: "hidden", occluded: false, occludedAt: -1e9 },
      });
    }

    scene.add(root);
    entriesRef.current = entries;
    orderRef.current = entries.slice();
    // React re-rendered the pin buttons back to their base className on this
    // same commit for any change that touched `nodes` — but a band edit
    // changes `proj` alone, and then the buttons keep whatever classes the
    // loop last wrote while the fresh Entry records claim they are hidden.
    // Resetting from the mounted base string makes the two agree either way.
    for (const e of entries) {
      const el = pinElsRef.current.get(e.id);
      if (el && el.dataset.baseClass) el.className = el.dataset.baseClass;
    }
    labelsDirtyRef.current = true;
    visualsDirtyRef.current = true;
    return () => {
      scene.remove(root);
      const cachedMats = new Set<THREE.Material>();
      for (const m of matCacheRef.current.values()) {
        cachedMats.add(m.marker);
        cachedMats.add(m.ring);
        cachedMats.add(m.fill);
      }
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          // Shared geometry outlives the scene: the three marker shapes are
          // module-level, and hero geometry belongs to models.ts's prototype
          // cache. Disposing either here would free GPU buffers that the very
          // next rebuild immediately needs back — the previous version did
          // exactly that, and paid the re-upload on every placement edit.
          if (o.geometry !== MARKER_GEO && o.geometry !== RING_GEO && o.geometry !== FILL_GEO && !o.userData.sharedGeometry) {
            o.geometry.dispose();
          }
          // Cached materials (see matCacheRef) outlive the rebuild by design.
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => { if (!cachedMats.has(x)) x.dispose(); });
          else if (!cachedMats.has(m)) m.dispose();
        }
      });
      entriesRef.current = [];
      orderRef.current = [];
    };
  }, [nodes, proj, ready, overrides.assetOverrides]);

  // The material cache is per-mount, and this is the only thing that empties
  // it — a rebuild deliberately does not.
  useEffect(() => {
    const cache = matCacheRef.current;
    return () => {
      for (const m of cache.values()) {
        m.marker.dispose();
        m.ring.dispose();
        m.fill.dispose();
      }
      cache.clear();
    };
  }, []);

  // Selection/hover/focus are read by the render loop from refs so that
  // hovering a node does not re-run the scene-building effects above. Each
  // one also raises `visualsDirty`, which is what the loop waits for before
  // touching a single material — see the label pass.
  useEffect(() => {
    selectedRef.current = view.selectedId;
    visualsDirtyRef.current = true;
  }, [view.selectedId]);
  useEffect(() => {
    hoveredRef.current = view.hoveredId;
    visualsDirtyRef.current = true;
  }, [view.hoveredId]);
  useEffect(() => {
    const ids = view.focusRequest?.assetIds;
    focusSetRef.current = ids && ids.length > 0 ? new Set(ids) : null;
    visualsDirtyRef.current = true;
  }, [view.focusRequest]);

  useEffect(() => {
    setAxisFlippedRef.current = view.setAxisFlipped;
  }, [view.setAxisFlipped]);

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
  // Hangs off the DOM pin's pointer events, not a canvas raycast: the pin is
  // this scene's real hit-target (see the file header — every label stays a
  // real DOM <button> for exactly this reason), and it visually sits well
  // above its marker's actual screen point (LABEL_LIFT_PX + the label's own
  // height) — a canvas raycast at the pin's screen position would mostly
  // miss the marker underneath it. Starting from the pin also means this
  // never has to fight OrbitControls for pointerdown priority: the pin lives
  // in a sibling overlay div, not inside `renderer.domElement`, so
  // OrbitControls' own listener never sees this gesture at all.
  //
  // Pass 13 changed three things about how the gesture is *recognised*, all
  // of them because a real Playwright drag found them and reading the code
  // did not (same lesson Pass 11 recorded, and the reason the brief insisted
  // on testing it the same way):
  //
  //  1. Pointer capture + React-owned listeners. The old version added
  //     `pointermove`/`pointerup` to `window` from inside a useCallback and
  //     removed them from a cleanup keyed on that callback's identity — so
  //     any re-render that changed the callback mid-gesture tore down the
  //     drag's own listeners. Capturing the pointer on the pin element means
  //     every subsequent move and the release retarget to that element, so
  //     React's own handlers see them and React owns their lifecycle. There
  //     is nothing left to tear down at the wrong moment.
  //  2. `pointercancel` is handled. Without it — and without
  //     `touch-action: none` on the pin, which is what provokes it — a touch
  //     drag that the browser decided was a scroll left `controls.enabled`
  //     false forever. That is the "occasional freeze": not a slow frame, a
  //     camera whose input had been switched off and never switched back.
  //  3. A real discriminator instead of a 4 px threshold. 4 px is inside the
  //     jitter of a finger tap, so taps became drags; and nothing at all
  //     handled the opposite case of a deliberate slow press.
  //
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

  /** Promotes a pending press to a real drag. Called by the movement
   *  threshold and by the hold timer — whichever comes first. */
  const commitDrag = useCallback(() => {
    const drag = dragRef.current;
    if (!drag || drag.committed) return;
    const entry = entriesRef.current.find((x) => x.id === drag.id);
    if (!entry) return;
    drag.committed = true;
    window.clearTimeout(drag.holdTimer);
    const controls = controlsRef.current;
    if (controls) controls.enabled = false;
    dragPlaneRef.current.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), entry.group.position);
    labelsDirtyRef.current = true;
  }, []);

  /** The single exit from a gesture — pointerup, pointercancel, lost capture
   *  and unmount all land here. Restoring `controls.enabled` unconditionally
   *  is the point: any path that skipped it left the camera frozen. */
  const endDrag = useCallback(
    (released: boolean) => {
      const drag = dragRef.current;
      dragRef.current = null;
      const controls = controlsRef.current;
      if (controls) controls.enabled = true;
      if (!drag) return;
      window.clearTimeout(drag.holdTimer);
      try {
        if (drag.el.hasPointerCapture(drag.pointerId)) drag.el.releasePointerCapture(drag.pointerId);
      } catch {
        /* the element may already be gone; nothing to release */
      }
      labelsDirtyRef.current = true;
      if (!released) return;
      // The browser synthesises a click after any pointerup on a button. This
      // pointer path has already decided what the gesture meant — including
      // deciding it meant nothing — so that click must not get a second vote.
      // Missing this let a deliberately cancelled drag still select the asset,
      // which is the exact "it opened the detail panel instead" the brief was
      // about. Keyboard activation has no preceding pointerup and is unaffected.
      pointerHandledRef.current = true;

      const entry = entriesRef.current.find((x) => x.id === drag.id);
      if (!entry) return;

      if (drag.movedAsset) {
        const side = nodeSide(entry.node);
        const km = worldXToKm(side, entry.group.position.x, projRef.current);
        // Committed to the SAME overrides store every other edit in this app
        // uses (src/state/overridesState.tsx) — a dropped asset is a placement
        // edit, not a new kind of state. This is what makes the drop survive
        // the full rebuild the next render triggers (the "asset objects"
        // effect above), what the detail panel's "edited locally" tag picks
        // up, and what Export/the sync worker carry along with everything else.
        overrides.setAssetOverride(entry.id, {
          distance_km_from_zero: Math.max(0, Math.round(km * 10) / 10),
          lateral_offset_world: Math.round(entry.group.position.z * 100) / 100,
        });
        // Selecting the dropped asset is the drop's confirmation — the detail
        // panel opens showing its new distance rather than leaving the only
        // feedback to whatever the marker looks like from the current camera.
        view.select(entry.id);
      } else if (drag.maxDist <= DRAG_SLOP_PX && performance.now() - drag.startT <= TAP_MAX_MS) {
        // Neither threshold produced any actual movement, and it was over
        // quickly enough to have been meant as a tap: select.
        view.select(entry.id);
      }
    },
    [overrides.setAssetOverride, view.select],
  );

  const onPinPointerDown = useCallback(
    (id: string, draggable: boolean, e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0 || !e.isPrimary) return; // primary button/touch only
      // A press that starts while another is still live (a second finger, a
      // stuck capture) must not leave the first one half-alive.
      if (dragRef.current) endDrag(false);
      const el = e.currentTarget;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is an optimisation here, not a requirement */
      }
      dragRef.current = {
        id,
        pointerId: e.pointerId,
        el,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startT: performance.now(),
        committed: false,
        movedAsset: false,
        maxDist: 0,
        holdTimer: draggable ? window.setTimeout(commitDrag, DRAG_HOLD_MS) : 0,
      };
    },
    [commitDrag, endDrag],
  );

  const onPinPointerMove = useCallback(
    (draggable: boolean, e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      const camera = cameraRef.current;
      if (!drag || drag.pointerId !== e.pointerId || !camera) return;
      const travel = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      if (travel > drag.maxDist) drag.maxDist = travel;
      if (!drag.committed) {
        if (!draggable || travel < DRAG_SLOP_PX) return;
        commitDrag();
        if (!dragRef.current?.committed) return;
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
      drag.movedAsset = true;
      // The camera has not moved, so nothing else would tell the label pass
      // that this pin's screen position is now stale.
      labelsDirtyRef.current = true;
    },
    [commitDrag, ndcFromClient],
  );

  // A drag in progress must not survive an unmount (route away mid-drag), a
  // tab switch, or the window losing focus — all of which can swallow the
  // pointerup that would otherwise end it.
  useEffect(() => {
    const onBlur = () => {
      if (dragRef.current) endDrag(false);
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      if (dragRef.current) endDrag(false);
    };
  }, [endDrag]);

  // Raycast so the models themselves are clickable, not just their labels.
  // Guarded by the same slop the pins use: releasing an orbit-drag over empty
  // ground used to count as a click and silently close whatever was open.
  const canvasDownRef = useRef<{ x: number; y: number } | null>(null);
  const onCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    canvasDownRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      const down = canvasDownRef.current;
      canvasDownRef.current = null;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_SLOP_PX) return;
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
      const targets = entriesRef.current.map((x) => x.group);
      const hits = ray.intersectObjects(targets, true);
      if (hits.length === 0) {
        view.select(null);
        return;
      }
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !entriesRef.current.some((x) => x.group === o)) o = o.parent;
      const entry = entriesRef.current.find((x) => x.group === o);
      if (entry) view.select(entry.id);
      else view.select(null);
    },
    [view],
  );

  const leftSide: Side = view.axisFlipped ? "side_b" : "side_a";
  const rightSide: Side = view.axisFlipped ? "side_a" : "side_b";
  markReactCommit();

  return (
    <div className="scene3d">
      <div
        className="scene3d__mount"
        ref={mountRef}
        onPointerDown={onCanvasPointerDown}
        onClick={onCanvasClick}
      />

      {/* Labels are DOM, positioned from the projected MARKER point and then
          lifted a constant number of pixels — screen space, not world space,
          which is what keeps a nametag locked over its own icon at any camera
          pitch. They stay the accessible, keyboard-reachable representation of
          the scene — the canvas is the picture, this is the interface.

          React mounts one button per node and then leaves them alone: every
          per-frame position, tier and state change below is written by the
          render loop straight to style/classList. See the file header. */}
      <div className="scene3d__labels">
        {pinData.map((p) => {
          const base = [
            "pin3d",
            `pin3d--${p.side}`,
            p.isStub ? "pin3d--stub" : "",
            "is-hidden",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={p.id}
              type="button"
              ref={(el) => {
                if (el) pinElsRef.current.set(p.id, el);
                else pinElsRef.current.delete(p.id);
              }}
              className={base}
              data-base-class={base}
              style={{
                ["--accent" as string]: p.accent,
                ["--side" as string]: p.sideColor,
                ["--lift" as string]: `${LABEL_LIFT_PX}px`,
              }}
              title={`${p.name} — ${p.isStub ? "pending" : `${p.km} km`}`}
              onPointerDown={(e) => onPinPointerDown(p.id, !p.isStub, e)}
              onPointerMove={(e) => onPinPointerMove(!p.isStub, e)}
              onPointerUp={() => endDrag(true)}
              onPointerCancel={() => endDrag(false)}
              onLostPointerCapture={() => {
                // Only a *loss* — a normal release already ran endDrag and
                // cleared dragRef, so this fires on the abnormal path only.
                if (dragRef.current) endDrag(false);
              }}
              onClick={(e) => {
                e.stopPropagation();
                // The pointer path already decided (and already selected, or
                // deliberately didn't). Keyboard activation has no preceding
                // pointer gesture and falls through to select, which is what
                // keeps these real buttons rather than decorated divs.
                if (pointerHandledRef.current) {
                  pointerHandledRef.current = false;
                  return;
                }
                if (dragRef.current || pointerHandledRef.current) return;
                view.select(p.id);
              }}
              onMouseEnter={() => view.hover(p.id)}
              onMouseLeave={() => view.hover(null)}
              onFocus={() => view.hover(p.id)}
              onBlur={() => view.hover(null)}
              aria-pressed={false}
            >
              <span className="pin3d__name">{p.name}</span>
              <span className="pin3d__km">{p.isStub ? "pending" : `${p.km} km`}</span>
            </button>
          );
        })}
      </div>

      {/* Distance ruler. Tick POSITIONS are written by the render loop from
          the live camera; only the set of ticks is React's. See ruler3d.ts
          for why the spacing is deliberately uneven. */}
      <div className="scene3d__ruler" ref={rulerRootRef} aria-hidden="true">
        <div className="scene3d__ruler-bands">
          {rulerModel.bands.map((b) => (
            <span
              key={b.key}
              className={`scene3d__ruler-band scene3d__ruler-band--${b.side}`}
              ref={(el) => {
                if (el) bandElsRef.current.set(b.key, el);
                else bandElsRef.current.delete(b.key);
              }}
            >
              {b.label}
            </span>
          ))}
        </div>
        <div className="scene3d__ruler-ticks">
          {rulerModel.ticks.map((t) => (
            <span
              key={t.key}
              className={`scene3d__ruler-tick scene3d__ruler-tick--${t.side}${t.major ? " is-major" : ""}`}
              ref={(el) => {
                if (el) tickElsRef.current.set(t.key, el);
                else tickElsRef.current.delete(t.key);
              }}
            >
              <i />
              <b>{t.label}</b>
            </span>
          ))}
        </div>
        <p className="scene3d__ruler-note">
          km from the zero line · tick spacing is non-linear — each band has its own scale
        </p>
      </div>

      {/* Which side is on which edge follows the camera, not a constant.
          Orbiting past 90° used to leave this claiming Ukraine was on the
          left while the scene showed the opposite (Pass 13 item 8). */}
      <div className="scene3d__legend">
        <span className={`scene3d__side scene3d__side--${leftSide}`}>
          ← {SIDE_LABELS[leftSide].short} rear
        </span>
        <span className="scene3d__zero">zero line</span>
        <span className={`scene3d__side scene3d__side--${rightSide}`}>
          {SIDE_LABELS[rightSide].short} rear →
        </span>
      </div>

      {/* The one non-optional obligation that comes with drawing OSM data
          at all (docs/OSM_PIPELINE.md § Licensing) — real rail lines and
          tree rows now render inside the metric inset (osmTerrain.ts).
          Bottom-left so it never competes with the legend/ruler for the
          same corner, and small enough to read as a citation, not a UI
          element. Repeated in the About page for anyone who never orbits
          past the inset. */}
      <div className="scene3d__osm-credit">{OSM_ATTRIBUTION}</div>
    </div>
  );
}

export default Scene3D;
