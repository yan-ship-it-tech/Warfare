// ─────────────────────────────────────────────────────────────────────────
// Procedural per-domain ground textures.
//
// Deliberately not photorealistic (Pass 5 direction change — see
// docs/DECISIONS.md): a real satellite basemap was tried and reads as a
// battle-management system rather than a teaching tool, and fighting real
// geography against the non-linear distance-band compression this app
// depends on doesn't work. This is a topographic-illustration style instead
// — closer to an editorial explainer graphic (hillshade + contour lines,
// muted natural palette) than either a tech-pitch-deck gradient or a photo.
// Everything here is generated (SVG turbulence + procedural contour rings),
// which is the point: it should read as unambiguously stylized.
// ─────────────────────────────────────────────────────────────────────────
import type { Domain } from "../types";

interface TerrainSpec {
  /** feTurbulence base frequency — smaller = larger, slower-varying blobs. */
  freq: number;
  octaves: number;
  /** Two-stop tint the noise is colorized into, dark → light. */
  colors: [string, string];
  /** Extra overlay pattern drawn on top of the noise. */
  overlay: "furrows" | "waves" | "stars" | "circuit" | "hatch" | "grid" | "contour" | "none";
  opacity: number;
}

// Muted, natural, topo-map palette — shifted away from the earlier
// tech/circuit-board hues toward what an editorial terrain illustration uses.
const SPECS: Record<Domain, TerrainSpec> = {
  land: { freq: 0.7, octaves: 2, colors: ["#4a4632", "#6b6845"], overlay: "contour", opacity: 0.4 },
  air: { freq: 0.01, octaves: 3, colors: ["#16283f", "#33547c"], overlay: "none", opacity: 0.45 },
  sea: { freq: 0.3, octaves: 3, colors: ["#123842", "#256e7d"], overlay: "waves", opacity: 0.5 },
  space: { freq: 0.9, octaves: 2, colors: ["#0a0a1e", "#241a3d"], overlay: "stars", opacity: 0.55 },
  cyber_ew: { freq: 0.5, octaves: 2, colors: ["#241a30", "#453258"], overlay: "circuit", opacity: 0.4 },
  logistics: { freq: 0.45, octaves: 2, colors: ["#333d27", "#4c5936"], overlay: "hatch", opacity: 0.38 },
  medical: { freq: 0.35, octaves: 2, colors: ["#332022", "#48292c"], overlay: "grid", opacity: 0.35 },
  c2_comms: { freq: 0.45, octaves: 2, colors: ["#173430", "#26534a"], overlay: "circuit", opacity: 0.4 },
};

function overlayMarkup(kind: TerrainSpec["overlay"], seed: number): string {
  switch (kind) {
    case "furrows":
      // Diagonal plough/trench lines, angled to reinforce the oblique read.
      return `
        <pattern id="ov" width="46" height="46" patternTransform="rotate(-28)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="46" stroke="#000" stroke-opacity="0.22" stroke-width="3"/>
          <line x1="23" y1="0" x2="23" y2="46" stroke="#fff" stroke-opacity="0.05" stroke-width="1"/>
        </pattern>`;
    case "waves":
      return `
        <pattern id="ov" width="120" height="26" patternUnits="userSpaceOnUse">
          <path d="M0 13 Q 30 0 60 13 T 120 13" fill="none" stroke="#fff" stroke-opacity="0.09" stroke-width="1.5"/>
          <path d="M0 22 Q 30 9 60 22 T 120 22" fill="none" stroke="#000" stroke-opacity="0.12" stroke-width="1.5"/>
        </pattern>`;
    case "stars": {
      let dots = "";
      let s = seed;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      for (let i = 0; i < 90; i++) {
        const x = (rnd() * 240).toFixed(1);
        const y = (rnd() * 240).toFixed(1);
        const r = (rnd() * 1.1 + 0.2).toFixed(2);
        const o = (rnd() * 0.6 + 0.25).toFixed(2);
        dots += `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" fill-opacity="${o}"/>`;
      }
      return `<pattern id="ov" width="240" height="240" patternUnits="userSpaceOnUse">${dots}</pattern>`;
    }
    case "circuit":
      return `
        <pattern id="ov" width="64" height="64" patternUnits="userSpaceOnUse">
          <path d="M8 0V20H32V64M56 0V44H24" fill="none" stroke="#fff" stroke-opacity="0.10" stroke-width="1.2"/>
          <circle cx="8" cy="20" r="2" fill="#fff" fill-opacity="0.14"/>
          <circle cx="32" cy="64" r="2" fill="#fff" fill-opacity="0.1"/>
          <circle cx="56" cy="44" r="2" fill="#fff" fill-opacity="0.1"/>
        </pattern>`;
    case "hatch":
      return `
        <pattern id="ov" width="34" height="34" patternTransform="rotate(-28)" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="0" y2="34" stroke="#fff" stroke-opacity="0.08" stroke-width="6"/>
        </pattern>`;
    case "grid":
      return `
        <pattern id="ov" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#fff" stroke-opacity="0.06" stroke-width="1"/>
        </pattern>`;
    case "contour": {
      // Hand-drawn-feeling elevation contour rings — the topo-map cue that
      // reads as "illustrated terrain" rather than either a flat tint or a
      // photo. Irregular (not perfect circles) so it doesn't look vector-CAD.
      let s = seed;
      const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
      let rings = "";
      for (let r = 26; r < 300; r += 34) {
        const jx = (rnd() - 0.5) * 18;
        const jy = (rnd() - 0.5) * 18;
        const rx = r * (0.9 + rnd() * 0.2);
        const ry = r * (0.75 + rnd() * 0.2);
        rings += `<ellipse cx="${120 + jx}" cy="${140 + jy}" rx="${rx.toFixed(
          1,
        )}" ry="${ry.toFixed(1)}" fill="none" stroke="#000" stroke-opacity="0.1" stroke-width="1"/>`;
      }
      return `<pattern id="ov" width="300" height="300" patternUnits="userSpaceOnUse">${rings}</pattern>`;
    }
    case "none":
    default:
      return "";
  }
}

function svgFor(domain: Domain, seed: number): string {
  const spec = SPECS[domain];
  const [c1, c2] = spec.colors;
  const overlay = overlayMarkup(spec.overlay, seed);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">
  <defs>
    <filter id="n" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="${spec.freq / 100}" numOctaves="${spec.octaves}" seed="${seed}" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.9 0.9 0.9 0 0"/>
      <feComponentTransfer><feFuncA type="linear" slope="1.6" intercept="-0.25"/></feComponentTransfer>
    </filter>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <!-- Fixed upper-left light source — a cheap hillshade cue that reads
         as "relief" rather than a flat fill, consistent across every lane
         so the whole scene shares one implied light direction. -->
    <linearGradient id="hs" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.12"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.14"/>
    </linearGradient>
    ${overlay}
  </defs>
  <rect width="240" height="240" fill="url(#g)"/>
  <rect width="240" height="240" filter="url(#n)" fill="#fff" opacity="${spec.opacity}"/>
  <rect width="240" height="240" fill="url(#hs)"/>
  ${spec.overlay !== "none" ? '<rect width="240" height="240" fill="url(#ov)"/>' : ""}
</svg>`.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const cache = new Map<string, string>();

/** CSS-ready background-image value for a domain's ground texture. Cached —
 *  every lane in the same domain reuses one generated image. `seed` lets a
 *  side get a very slightly different pattern so the two halves don't look
 *  like a mirrored decal. */
export function terrainTexture(domain: Domain, seed = 1): string {
  const key = `${domain}:${seed}`;
  let uri = cache.get(key);
  if (!uri) {
    uri = svgFor(domain, seed);
    cache.set(key, uri);
  }
  return `url("${uri}")`;
}
