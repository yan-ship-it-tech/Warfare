# Asset Scaffold — Multi-Domain Warfare Digital Twin

This is the data layer proof-of-concept: the schema plus 4 fully worked
example assets across both sides and two domains (air, land), showing the
pattern to replicate for every category in the master prompt's breadth pass.

## Files

- `types.ts` — the full data model (Asset, DistanceBand, DomainLayer,
  AssetConnection). Read this first.
- `data/bands.json` — the 4 default distance-from-zero bands (tactical /
  op-near / op-deep / strategic-rear). Adjust cutoffs freely.
- `data/domains.json` — the 8 domain layers used for vertical stacking,
  in scroll order.
- `data/assets/*.json` — one file per asset, one asset per file. This is the
  pattern for "easy to add/rearrange" — a new asset is a new JSON file, not
  a code change.
- `data/connections.json` — flat list mirroring the connections already
  embedded in each asset, for rendering a full dependency-graph overlay
  without walking every asset file.

## The 4 example assets

| Asset | Side | Domain | Category | Distance | Researched? |
|---|---|---|---|---|---|
| Patriot (PAC-3 MSE) | side_a | air | air-defense-long-range | 40 km | Yes — web-sourced |
| M777 Howitzer | side_a | land | artillery | 12 km | Yes — web-sourced |
| Lancet | side_b | air | uav-strike | 3 km | Yes — web-sourced |
| T-72 | side_b | land | armor-main-battle-tank | 4 km | Partial — spot-check before publishing, source field intentionally left blank as a flag |

Note the T-72 entry: where research is thin or I fell back on general
knowledge rather than a specific citation, the `sources` field says so
explicitly rather than presenting it as verified. Keep this convention —
it's the difference between a credible teaching tool and a shaky one in
front of a room of subject-matter experts.

## How this extends to the full breadth pass

For every category in the master prompt's asset list:

1. Pick one representative real-world system (already given for several
   in the original brief — CUAS, MANPADS, Bayraktar-style ISR/strike UAV,
   Leopard 2, HIMARS/MLRS, etc.).
2. Research it (2-4 targeted searches is usually enough for a first pass).
3. Fill the `Asset` shape — the `contrast_vs_traditional` field is the one
   most worth spending real thought on; it's the actual teaching payload.
4. Add 1-3 `connections` even if the target doesn't exist yet (see the
   `connections.json` note on stub/pending targets) — the dependency web
   is most convincing when it's dense, and it's fine to build it out of
   order.
5. Placeholder `icon_image` / `gallery_images` paths are fine at this
   stage — art direction (photo vs. uniform illustrated icon set) is still
   an open decision from the master prompt.

## Not yet decided (carried over from the master prompt)

- Icon art style (photo-realistic vs. commissioned uniform illustration set)
- Whether medical/casevac and logistics get dedicated vertical lanes or
  share the `land` layer
- Actual side labels for the UI (kept generic `side_a` / `side_b` in data
  so relabeling is a config change, not a data migration)
