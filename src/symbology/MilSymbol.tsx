// Renders a MIL-STD-2525C symbol via milsymbol.js (MIT licensed) from an
// already-resolved SIDC. See sidc.ts for how the SIDC itself gets built —
// this component only draws it.
import { useMemo } from "react";
import ms from "milsymbol";
// milsymbol's package.json `exports` field only exposes the bare specifier
// (no documented subpath to import just the 2525C table), so the default
// entry — all five standards it ships (2525B/C, APP6-B/D, the last two on an
// entirely separate numeric-SIDC table) — is what's actually available.
// That's real weight (~750 kB uncompressed) this app's own performance
// discipline (CLAUDE.md, docs/DECISIONS.md Pass 16) wouldn't want in the
// main bundle. Fix is the same one Pass 6 already used for the 3D engine:
// this whole module is lazy-loaded (see DetailPanel.tsx's React.lazy import)
// so the cost is paid only by a visitor who actually opens the detail panel,
// never on first paint.

interface Props {
  sidc: string;
  /** Human-readable meaning of the symbol's function ID, e.g. "Tank, medium"
   *  — used as the accessible label, since the SIDC itself is not readable
   *  to anyone who hasn't memorized MIL-STD-2525. */
  meaning: string;
  /** Pixel size milsymbol renders at before the SVG scales to its container
   *  via CSS. Higher = crisper at large display sizes. */
  size?: number;
  className?: string;
}

/** milsymbol's own colors (pale blue Friend / pale red Hostile, black
 *  outline) already read fine against this app's dark panels — no override
 *  needed, unlike the old currentColor-based hand-drawn icon set. */
function MilSymbolImpl({ sidc, meaning, size = 60, className }: Props) {
  const svg = useMemo(() => {
    try {
      const sym = new ms.Symbol(sidc, { size, strokeWidth: 8 });
      return sym.asSVG();
    } catch {
      return null;
    }
  }, [sidc, size]);

  if (!svg) return null;

  return (
    <span
      className={className}
      role="img"
      aria-label={`Symbol: ${meaning}`}
      title={`${meaning} — MIL-STD-2525C ${sidc}`}
      // milsymbol's own generated markup — sidc/meaning are both derived
      // from this app's own data (sidc.ts), never user input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Default export, specifically so DetailPanel.tsx can React.lazy() this
// module — lazy() requires a default export resolving to the component.
export default MilSymbolImpl;
