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
import { buildHeroModel, hasHeroModel } from "./models";
import {
  worldPlacement,
  lateralLayout,
  worldXFor,
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
 *  title; beyond it, it degrades to a dot; past the far tier it is not
 *  rendered at all.
 *
 *  Relative, not absolute, because absolute thresholds break at the ends of
 *  the zoom range: with a fixed 700-unit cutoff and OrbitControls.maxDistance
 *  at 900, pulling all the way back put every asset past the cutoff and the
 *  scene lost its labels entirely instead of thinning. Scaling with the orbit
 *  radius means "far" always means far *for this framing* — zooming out thins
 *  the field via the budget and collision grid, which is the intended
 *  behaviour, rather than emptying it. */
const LABEL_FULL_DIST = (camDist: number) => camDist * 1.25 + 60;
const LABEL_DOT_DIST = (camDist: number) => camDist * 3 + 200;
/** Titled labels allowed per megapixel of viewport. The budget scales with
 *  the area actually available rather than being a fixed count that is stingy
 *  on a desktop and unreadable on a phone. */
const LABEL_BUDGET_PER_MPX = 30;
/** Terrain samples per occlusion probe. */
const OCCLUSION_SAMPLES = 6;

type LabelTier = "full" | "dot" | "hidden";

interface LabelState {
  id: string;
  name: string;
  km: number;
  side: string;
  domain: string;
  accent: string;
  sideColor: string;
  isStub: boolean;
  x: number;
  y: number;
  tier: LabelTier;
  /** 0–1 proximity fade, applied to dots so the far field recedes instead of
   *  presenting every distant asset at full strength. */
  fade: number;
  depth: number;
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
  lod: THREE.LOD | null;
  /** Grounded assets can be hidden behind terrain; elevated ones effectively
   *  cannot, so they skip the occlusion probe entirely. */
  grounded: boolean;
}

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

  const [labels, setLabels] = useState<LabelState[]>([]);
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

  const proj = useMemo(() => buildProjection(world.bands, world.domains), [world.bands, world.domains]);

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
    controls.panSpeed = 0.4;
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

    let raf = 0;
    const projected = new THREE.Vector3();

    const tick = () => {
      raf = requestAnimationFrame(tick);

      // Camera fly-to, used by selection and by the Lessons page.
      const fly = flyRef.current;
      if (fly) {
        const t = Math.min(1, (performance.now() - fly.t0) / fly.dur);
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

      const w = mount.clientWidth;
      const h = mount.clientHeight;
      const next: LabelState[] = [];

      // Project each marker's OWN world point. Everything that lifts the label
      // clear of its icon happens below, in pixels, so the offset cannot vary
      // with camera pitch the way a world-space lift does.
      const camPos = camera.position;
      const measured = entriesRef.current.map((entry) => {
        projected.copy(entry.anchor).project(camera);
        return {
          entry,
          sx: (projected.x * 0.5 + 0.5) * w,
          sy: (-projected.y * 0.5 + 0.5) * h,
          sz: projected.z,
          dist: camPos.distanceTo(entry.anchor),
        };
      });

      // Priority, best first. Pinned entries are placed before anything else
      // so they can never lose a collision to an arbitrary neighbour; a
      // lesson's focus set outranks the rest of the field; otherwise nearest
      // wins, which is also what reads correctly when two labels overlap.
      const focusIds = focusSetRef.current;
      const pinRank = (id: string): number => {
        if (selectedRef.current === id) return 0;
        if (hoveredRef.current === id) return 1;
        if (focusIds && focusIds.has(id)) return 2;
        return 3;
      };
      const ordered = measured.sort(
        (a, b) => pinRank(a.entry.id) - pinRank(b.entry.id) || a.dist - b.dist,
      );

      const grid = new LabelGrid();
      // Budget scales with viewport area rather than being a fixed count.
      const budget = Math.max(8, Math.round(((w * h) / 1_000_000) * LABEL_BUDGET_PER_MPX));
      let titled = 0;
      // Tier thresholds follow the current framing — see LABEL_FULL_DIST.
      const orbitRadius = camPos.distanceTo(controls.target);
      const fullDist = LABEL_FULL_DIST(orbitRadius);
      const dotDist = LABEL_DOT_DIST(orbitRadius);

      for (const { entry, sx, sy, sz, dist } of ordered) {
        const isSel = selectedRef.current === entry.id;
        const isHov = hoveredRef.current === entry.id;
        const pinned = isSel || isHov;
        const behind = sz > 1;
        // Cull against the label's own box, not the marker point, so a pin
        // whose title would land entirely outside the viewport is never built.
        const offscreen =
          sx + LABEL_W / 2 < 0 ||
          sx - LABEL_W / 2 > w ||
          sy < -LABEL_H ||
          sy - LABEL_LIFT_PX - LABEL_H > h;

        const mat = entry.marker.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = isSel ? 2.4 : isHov ? 1.5 : 0.75;
        const s = isSel ? 1.6 : isHov ? 1.3 : 1;
        entry.marker.scale.setScalar(s);
        entry.marker.rotation.y += 0.006;
        // Side ring tracks selection too — the persistent cue gets brighter
        // rather than being replaced by a different one.
        (entry.ring.material as THREE.MeshBasicMaterial).opacity = isSel
          ? 0.95
          : isHov
            ? 0.7
            : 0.42;

        let tier: LabelTier;
        if (behind || offscreen) {
          tier = "hidden";
        } else if (pinned) {
          // Selection and hover are always fully titled, at any distance.
          tier = "full";
        } else if (dist > dotDist) {
          tier = "hidden";
        } else if (
          entry.grounded &&
          dist < dotDist &&
          occludedByTerrain(camPos, entry.anchor)
        ) {
          // Behind a ridge: keep the dot as a "something is there" cue, but
          // never the title, which would read as being in front of the rise.
          tier = "dot";
        } else if (dist > fullDist || titled >= budget) {
          tier = "dot";
        } else {
          const y2 = sy - LABEL_LIFT_PX;
          const box = { x1: sx - LABEL_W / 2, y1: y2 - LABEL_H, x2: sx + LABEL_W / 2, y2 };
          tier = grid.collides(box) ? "dot" : "full";
        }

        if (tier === "full") {
          const y2 = sy - LABEL_LIFT_PX;
          grid.insert({ x1: sx - LABEL_W / 2, y1: y2 - LABEL_H, x2: sx + LABEL_W / 2, y2 });
          if (!pinned) titled += 1;
        } else if (tier === "dot") {
          // Dots reserve their own small footprint so they don't pile into an
          // unreadable clump at the far end of the axis.
          grid.insert({ x1: sx - 6, y1: sy - 6, x2: sx + 6, y2: sy + 6 });
        }

        if (tier === "hidden") continue;

        next.push({
          ...(entry.node.kind === "asset"
            ? {
                name: swapNamesRef.current.get(entry.node.asset.id) ?? entry.node.asset.name,
                km: entry.node.asset.distance_km_from_zero,
                isStub: false,
              }
            : { name: entry.node.stub.label, km: entry.node.stub.distance_km_from_zero, isStub: true }),
          id: entry.id,
          side: nodeSide(entry.node),
          domain: nodeDomain(entry.node),
          accent: DOMAIN_ACCENT[nodeDomain(entry.node)] ?? "#8b93a3",
          sideColor: SIDE_ACCENT[nodeSide(entry.node)].base,
          x: sx,
          y: sy,
          tier,
          fade: THREE.MathUtils.clamp(1 - (dist - fullDist) / (dotDist - fullDist), 0.3, 1),
          depth: sz,
        });
      }

      setLabels(next);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
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

    // Distance graticule: one standing gate per band edge, both sides. These
    // are the 3D equivalent of the 2D ruler's band boundaries and are placed
    // through the identical projection call, so the two views cannot drift.
    const gateMat = new THREE.LineBasicMaterial({ color: "#7d8798", transparent: true, opacity: 0.35 });
    for (const span of proj.spans) {
      for (const side of ["side_a", "side_b"] as const) {
        const x = worldXFor(side, span.band.max_km, proj);
        const pts = [
          new THREE.Vector3(x, terrainHeight(x, -70) - 1, -70),
          new THREE.Vector3(x, terrainHeight(x, -70) + 13, -70),
          new THREE.Vector3(x, terrainHeight(x, 70) + 13, 70),
          new THREE.Vector3(x, terrainHeight(x, 70) - 1, 70),
        ];
        zero.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gateMat));
      }
    }

    scene.add(terrain, props, scenery, zero);

    return () => {
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

    // Breadth layout first: every asset needs to know its cohort before any of
    // them can be positioned, so this cannot be folded into the loop below.
    const lateral = lateralLayout(
      nodes.map((n) => ({
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
        z: lateral.get(node.id) ?? 0,
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
      const markerMat = new THREE.MeshStandardMaterial({
        color: isStub ? "#8b93a3" : accent,
        emissive: isStub ? "#8b93a3" : accent,
        emissiveIntensity: 0.75,
        flatShading: true,
        roughness: 0.4,
        transparent: isStub,
        opacity: isStub ? 0.55 : 1,
      });
      const marker = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), markerMat);
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
      const padY = (elevated ? groundY : 0) + 0.12;

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(2.15, 2.9, 28),
        new THREE.MeshBasicMaterial({
          color: sideColor,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = padY + 0.02;
      g.add(ring);

      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(2.15, 20),
        new THREE.MeshBasicMaterial({
          color: sideColor,
          transparent: true,
          opacity: 0.13,
          depthWrite: false,
        }),
      );
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
        lod,
        grounded: !elevated,
      });
    }

    scene.add(root);
    entriesRef.current = entries;

    return () => {
      scene.remove(root);
      root.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m.dispose();
        }
      });
      entriesRef.current = [];
    };
  }, [nodes, proj, ready]);

  // Selection/hover are read by the render loop from refs so that hovering a
  // node does not re-run the scene-building effects above.
  useEffect(() => {
    selectedRef.current = view.selectedId;
  }, [view.selectedId]);
  useEffect(() => {
    hoveredRef.current = view.hoveredId;
  }, [view.hoveredId]);
  useEffect(() => {
    const ids = view.focusRequest?.assetIds;
    focusSetRef.current = ids && ids.length > 0 ? new Set(ids) : null;
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

  // Raycast so the models themselves are clickable, not just their labels.
  const onCanvasClick = useCallback(
    (e: React.MouseEvent) => {
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

  const focusSet = view.focusRequest?.assetIds ?? null;

  return (
    <div className="scene3d">
      <div className="scene3d__mount" ref={mountRef} onClick={onCanvasClick} />

      {/* Labels are DOM, positioned from the projected MARKER point each frame
          and then lifted a constant number of pixels — screen space, not world
          space, which is what keeps a nametag locked over its own icon at any
          camera pitch. They stay the accessible, keyboard-reachable
          representation of the scene — the canvas is the picture, this is the
          interface. */}
      <div className="scene3d__labels">
        {labels.map((l) => {
          const dimmed = focusSet ? !focusSet.includes(l.id) : false;
          const isDot = l.tier === "dot";
          return (
            <button
              key={l.id}
              type="button"
              className={[
                "pin3d",
                `pin3d--${l.side}`,
                l.isStub ? "pin3d--stub" : "",
                view.selectedId === l.id ? "is-selected" : "",
                view.hoveredId === l.id ? "is-hovered" : "",
                dimmed ? "is-dimmed" : "",
                isDot ? "is-collapsed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                // A dot stands in for the icon, so it centres ON the marker; a
                // titled label hangs its bottom edge a fixed lift above it,
                // with the leader stub spanning exactly that gap.
                transform: isDot
                  ? `translate(-50%, -50%) translate(${l.x}px, ${l.y}px)`
                  : `translate(-50%, -100%) translate(${l.x}px, ${l.y - LABEL_LIFT_PX}px)`,
                ["--accent" as string]: l.accent,
                ["--side" as string]: l.sideColor,
                ["--lift" as string]: `${LABEL_LIFT_PX}px`,
                ["--fade" as string]: l.fade,
                zIndex: Math.max(1, Math.round((1 - l.depth) * 1000)),
              }}
              title={isDot ? `${l.name} — ${l.isStub ? "pending" : `${l.km} km`}` : undefined}
              onClick={(e) => {
                e.stopPropagation();
                view.select(l.id);
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
          );
        })}
      </div>

      <div className="scene3d__legend">
        <span className="scene3d__side scene3d__side--a">← {SIDE_LABELS.side_a.short} rear</span>
        <span className="scene3d__zero">zero line</span>
        <span className="scene3d__side scene3d__side--b">{SIDE_LABELS.side_b.short} rear →</span>
      </div>
    </div>
  );
}

export default Scene3D;
