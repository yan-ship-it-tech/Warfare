// Detail panel for the selected node.
//
// For a real asset this is the teaching payload: role, characteristics, how
// it's actually employed, and — the field worth the most thought — what
// changed versus traditional warfare. Sourcing is shown plainly, including
// when it is absent, because a room of subject-matter experts will check.
//
// For a pending stub it explains why the node exists, which parts of its
// position were inferred rather than authored, and hands over a ready-made
// JSON skeleton so building the real asset is a copy-paste away.
import { lazy, Suspense, useMemo, useRef, useState } from "react";
import type { Asset } from "../types";
import type { PendingStub, ResolvedConnection, WorldModel } from "../data/model";
import { resolveBand } from "../data/model";
import { CONNECTION_STYLE, DOMAIN_ACCENT, SIDE_ACCENT, SIDE_LABELS } from "../config/ui";
import { resolveVignette } from "../scene/vignettes";
import { resolveSidc, resolveStubSidc } from "../symbology/sidc";
// milsymbol.js itself is ~750 kB uncompressed (see MilSymbol.tsx's own header
// comment) — code-split it, same convention Pass 6 used for the 3D engine, so
// it's fetched only once a detail panel actually renders, never on first
// paint. sidc.ts (small, pure data/string logic) stays a normal import.
const MilSymbol = lazy(() => import("../symbology/MilSymbol"));
import { useViewState } from "../state/viewState";
import { useOverrides, type CustomMedia } from "../state/overridesState";
import { catalogSiblings, findCatalogEntry, resolveAssetDisplay } from "../data/catalog";

/**
 * Clone an asset for swarm/scenario building (e.g. "duplicate this Lancet
 * five times to show a saturation attack") — a real, independent `Asset`
 * record written into `overrides.customAssets`, the exact same mechanism the
 * Asset Editor page uses for brand-new assets. The source file under
 * `data/assets/` is never touched: this is additive, same as every other
 * override in this app.
 *
 * Effective (possibly locally-edited) text is baked into the copy rather than
 * re-pointing at the original's override record — the clone is meant to
 * drift independently from here on (drag it, edit it, delete it) without
 * that ever touching the asset it was copied from.
 */
function duplicateAsset(
  original: Asset,
  effectiveText: {
    short_role: string;
    employment_notes: string;
    contrast_vs_traditional: string;
    characteristics: string[];
  },
  existingIds: Set<string>,
  existingNames: Set<string>,
): Asset {
  const baseId = original.id.replace(/-copy(-\d+)?$/, "");
  let id = `${baseId}-copy`;
  for (let n = 2; existingIds.has(id); n++) id = `${baseId}-copy-${n}`;

  const baseName = original.name.replace(/\s*\(copy(?: \d+)?\)$/, "");
  let name = `${baseName} (copy)`;
  for (let n = 2; existingNames.has(name); n++) name = `${baseName} (copy ${n})`;

  return {
    ...original,
    id,
    name,
    short_role: effectiveText.short_role,
    employment_notes: effectiveText.employment_notes,
    contrast_vs_traditional: effectiveText.contrast_vs_traditional,
    characteristics: effectiveText.characteristics,
  };
}

interface Props {
  world: WorldModel;
  onReplay: () => void;
}

export function DetailPanel({ world, onReplay }: Props) {
  const view = useViewState();
  const id = view.selectedId;
  const asset = id ? world.assetsById.get(id) : undefined;
  const stub = id && !asset ? world.stubsById.get(id) : undefined;

  const edges = useMemo(() => {
    if (!id) return { out: [] as ResolvedConnection[], in: [] as ResolvedConnection[] };
    return {
      out: world.connections.filter((c) => c.source_id === id),
      in: world.connections.filter((c) => c.target_id === id),
    };
  }, [id, world.connections]);

  if (!id) return null;
  if (!asset && !stub) return null;

  return (
    <aside className="detail" aria-label="Asset detail">
      <button className="detail__close" onClick={() => view.select(null)} aria-label="Close detail panel">
        ✕
      </button>
      {asset ? (
        <AssetDetail asset={asset} world={world} edges={edges} onReplay={onReplay} />
      ) : (
        <StubDetail stub={stub!} world={world} edges={edges} />
      )}
    </aside>
  );
}

function EdgeList({
  title,
  edges,
  world,
  direction,
}: {
  title: string;
  edges: ResolvedConnection[];
  world: WorldModel;
  direction: "out" | "in";
}) {
  const view = useViewState();
  if (edges.length === 0) return null;
  return (
    <section className="detail__section">
      <h3>{title}</h3>
      <ul className="edge-list">
        {edges.map((c) => {
          const otherId = direction === "out" ? c.target_id : c.source_id;
          const other = world.assetsById.get(otherId);
          const style = CONNECTION_STYLE[c.type];
          const exists = Boolean(other);
          return (
            <li key={c.key}>
              <button
                type="button"
                className={`edge-list__row${exists || view.showPending ? "" : " is-inert"}`}
                onClick={() => (exists || view.showPending ? view.select(otherId) : undefined)}
                onMouseEnter={() => view.hoverConnection(c.key)}
                onMouseLeave={() => view.hoverConnection(null)}
              >
                <span className="edge-list__type" style={{ color: style?.color }}>
                  <i style={{ background: style?.color }} />
                  {style?.label ?? c.type}
                </span>
                <span className="edge-list__target">
                  {other ? other.name : otherId}
                  {!exists && <em className="tag tag--pending">pending</em>}
                </span>
                <span className="edge-list__desc">{c.description}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AssetDetail({
  asset,
  world,
  edges,
  onReplay,
}: {
  asset: Asset;
  world: WorldModel;
  edges: { out: ResolvedConnection[]; in: ResolvedConnection[] };
  onReplay: () => void;
}) {
  const { sidc, meaning } = resolveSidc({
    side: asset.side,
    group: asset.group,
    category: asset.category,
    domain: asset.domain,
  });
  const group = world.groupsById.get(asset.group);
  const band = resolveBand(asset.distance_km_from_zero, world.bands);
  const domain = world.domains.find((d) => d.id === asset.domain);
  const accent = group?.color ?? DOMAIN_ACCENT[asset.domain] ?? "#8b93a3";
  const { vignette, known } = resolveVignette(asset.reactive_behavior?.animation_id);
  const citable = (asset.sources ?? []).filter((s) => s.url && s.url.trim() !== "");
  const uncited = (asset.sources ?? []).filter((s) => !s.url || s.url.trim() === "");

  const overrides = useOverrides();
  const swapId = overrides.assetOverrides[asset.id]?.catalog_equipment_id;
  const display = resolveAssetDisplay(asset, swapId);
  const textOverride = overrides.assetOverrides[asset.id]?.text;
  const effectiveRole = textOverride?.short_role ?? asset.short_role;
  const effectiveEmployment = textOverride?.employment_notes ?? asset.employment_notes;
  const effectiveContrast = textOverride?.contrast_vs_traditional ?? asset.contrast_vs_traditional;
  const effectiveCharacteristics = textOverride?.characteristics ?? asset.characteristics ?? [];
  const view = useViewState();

  const duplicate = () => {
    const existingIds = new Set([...world.assetsById.keys(), ...Object.keys(overrides.customAssets)]);
    const existingNames = new Set([
      ...world.assets.map((a) => a.name),
      ...Object.values(overrides.customAssets).map((a) => a.name),
    ]);
    const clone = duplicateAsset(
      asset,
      {
        short_role: effectiveRole,
        employment_notes: effectiveEmployment ?? "",
        contrast_vs_traditional: effectiveContrast ?? "",
        characteristics: effectiveCharacteristics,
      },
      existingIds,
      existingNames,
    );
    overrides.saveCustomAsset(clone);
    view.select(clone.id);
  };

  return (
    <div className="detail__body">
      <header className="detail__header" style={{ ["--accent" as string]: accent }}>
        <div className="detail__icon">
          <Suspense fallback={null}>
            <MilSymbol sidc={sidc} meaning={meaning} />
          </Suspense>
        </div>
        <div>
          <p className="detail__eyebrow">
            <span style={{ color: SIDE_ACCENT[asset.side].text }}>{SIDE_LABELS[asset.side].short}</span>
            <span className="dot">·</span>
            {domain?.label ?? asset.domain}
            <span className="dot">·</span>
            {group?.label ?? asset.group}
          </p>
          <h2>{display.name}</h2>
          <p className="detail__category">
            {display.category}
            {display.manufacturer && (
              <>
                <span className="dot">·</span>
                {display.manufacturer}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="detail__duplicate"
          onClick={duplicate}
          title="Add an independent copy of this asset to the battlefield — for swarm/scenario building. Never touches the source data file."
        >
          ⧉ Duplicate
        </button>
      </header>

      <HeroImage image={asset.image} sidc={sidc} meaning={meaning} />

      <SwapPicker asset={asset} />
      <RosterSwapPicker asset={asset} world={world} />

      {display.isSwapped && (
        <p className="swap-banner">
          Showing <b>{display.name}</b> from the catalog in this slot. The role notes below (role,
          employment, contrast) were written for <b>{asset.representative_system}</b> and describe the
          category in general — they weren't rewritten per system.
          {display.wikipedia && (
            <>
              {" "}
              <a href={display.wikipedia} target="_blank" rel="noreferrer noopener">
                Wikipedia →
              </a>
            </>
          )}
        </p>
      )}

      {/* The three facts every asset carries in comparable form — cost is the
          one guaranteed tile, the other two are author-chosen per asset (or,
          when swapped, read from the catalog entry's own specifications). */}
      <div className="key-facts">
        <div className="key-facts__tile key-facts__tile--cost">
          <span className="k">Unit cost</span>
          <span className={`v${display.cost?.confidence === "unknown" ? " v--unknown" : ""}`}>
            {display.cost?.display ?? "Not recorded"}
          </span>
          {display.cost && display.cost.confidence !== "reported" && (
            <span className={`tag tag--${display.cost.confidence === "unknown" ? "warn" : "info"}`}>
              {display.cost.confidence}
            </span>
          )}
        </div>
        {(display.key_facts ?? []).map((f, i) => (
          <div className="key-facts__tile" key={i}>
            <span className="k">{f.label}</span>
            <span className="v">{f.value}</span>
          </div>
        ))}
      </div>

      {display.isSwapped && display.combat_notes && (
        <p className="detail__note">
          <b>Catalog note:</b> {display.combat_notes}
        </p>
      )}

      <PlacementRow asset={asset} band={band} />

      <EditableRole
        value={effectiveRole}
        isOverridden={textOverride?.short_role !== undefined}
        onSave={(v) => overrides.setAssetText(asset.id, { short_role: v })}
        onReset={() => {
          const { short_role: _drop, ...rest } = textOverride ?? {};
          overrides.setAssetOverride(asset.id, { text: rest });
        }}
      />

      <EditableList
        title="Key characteristics"
        items={effectiveCharacteristics}
        isOverridden={textOverride?.characteristics !== undefined}
        onSave={(items) => overrides.setAssetText(asset.id, { characteristics: items })}
        onReset={() => {
          const { characteristics: _drop, ...rest } = textOverride ?? {};
          overrides.setAssetOverride(asset.id, { text: rest });
        }}
      />

      {(effectiveEmployment || textOverride?.employment_notes !== undefined) && (
        <EditableSection
          title="How it's employed"
          value={effectiveEmployment ?? ""}
          isOverridden={textOverride?.employment_notes !== undefined}
          onSave={(v) => overrides.setAssetText(asset.id, { employment_notes: v })}
          onReset={() => {
            const { employment_notes: _drop, ...rest } = textOverride ?? {};
            overrides.setAssetOverride(asset.id, { text: rest });
          }}
        />
      )}

      {(effectiveContrast || textOverride?.contrast_vs_traditional !== undefined) && (
        <EditableSection
          title="What changed vs. traditional warfare"
          value={effectiveContrast ?? ""}
          warn
          isOverridden={textOverride?.contrast_vs_traditional !== undefined}
          onSave={(v) => overrides.setAssetText(asset.id, { contrast_vs_traditional: v })}
          onReset={() => {
            const { contrast_vs_traditional: _drop, ...rest } = textOverride ?? {};
            overrides.setAssetOverride(asset.id, { text: rest });
          }}
        />
      )}

      {asset.notable_events && asset.notable_events.length > 0 && (
        <section className="detail__section">
          <h3>Notable moments</h3>
          <ul className="notable-events">
            {asset.notable_events.map((ev, i) => (
              <li key={i}>
                <div className="notable-events__head">
                  <span className="notable-events__date">{ev.date}</span>
                  <span className="notable-events__title">{ev.title}</span>
                </div>
                <p>{ev.description}</p>
                {(ev.sources ?? []).length > 0 && (
                  <p className="notable-events__sources">
                    {ev.sources.map((s, j) => (
                      <span key={j}>
                        {j > 0 && " · "}
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer noopener">
                            {s.label}
                          </a>
                        ) : (
                          s.label
                        )}
                      </span>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {asset.reactive_behavior && (
        <section className="detail__section">
          <h3>Reactive behaviour</h3>
          <p className="detail__vignette">{asset.reactive_behavior.description}</p>
          <div className="detail__vignette-row">
            <button type="button" className="btn btn--ghost" onClick={onReplay}>
              ▶ Replay on map
            </button>
            <span className={`tag ${known ? "tag--ok" : "tag--warn"}`}>
              {known ? vignette.kind : "no vignette yet"}
            </span>
          </div>
          {!known && <p className="detail__note">{vignette.caption}</p>}
        </section>
      )}

      <EdgeList title="Depends on" edges={edges.out} world={world} direction="out" />
      <EdgeList title="Depended on by" edges={edges.in} world={world} direction="in" />

      <MediaSection asset={asset} accent={accent} />

      <section className="detail__section">
        <h3>
          Sources
          {asset.verification && (
            <span
              className={`tag tag--${
                asset.verification.status === "verified"
                  ? "ok"
                  : asset.verification.status === "sourced_low_confidence"
                    ? "info"
                    : "warn"
              }`}
              title={`Audited ${asset.verification.last_audit} — ${asset.verification.independent_sources} independent named source(s). See docs/CONTENT_PIPELINE.md.`}
            >
              {asset.verification.status === "verified"
                ? `verified · ${asset.verification.independent_sources} sources`
                : asset.verification.status === "sourced_low_confidence"
                  ? "1 source only"
                  : "unverified"}
            </span>
          )}
        </h3>
        {asset.verification && asset.verification.notes.length > 0 && (
          <ul className="verify-notes">
            {asset.verification.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        {citable.length > 0 ? (
          <ul className="sources">
            {citable.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer noopener">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {uncited.map((s, i) => (
          <p key={i} className="detail__unsourced">
            <span className="tag tag--warn">unverified</span> {s.label}
          </p>
        ))}
        {citable.length === 0 && uncited.length === 0 && (
          <p className="detail__unsourced">
            <span className="tag tag--warn">unsourced</span> No sources recorded. Treat every figure
            above as provisional until one is added.
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * The detail page's hero photo — "picture directly under the asset name"
 * (Pass 20). Driven by `asset.image`, sourced from
 * docs/imagery-sourcing-ledger.xlsx (see types.ts's doc comment on the
 * field for the full provenance story). A real photo (`kind: "photo"`)
 * renders with its license and a link back to the Commons file page for
 * full attribution — the same "always show sourcing" standard `sources`
 * gets elsewhere in this panel. Anything else (`conceptual`/`placeholder`,
 * or a photo whose URL 404s — Commons files do get renamed/deleted) falls
 * back to the asset's own MIL-STD-2525 symbol at a larger size, with a
 * caption explaining why there's no photo, rather than a blank gap.
 */
function HeroImage({ image, sidc, meaning }: { image: Asset["image"]; sidc: string; meaning: string }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = image?.kind === "photo" && image.url && !failed;

  if (showPhoto) {
    return (
      <figure className="hero-image">
        <img className="hero-image__photo" src={image.url!} alt="" onError={() => setFailed(true)} loading="lazy" />
        <figcaption className="hero-image__caption">
          <span>{image.license}</span>
          {image.source_url && (
            <a href={image.source_url} target="_blank" rel="noreferrer noopener">
              Wikimedia Commons ↗
            </a>
          )}
        </figcaption>
      </figure>
    );
  }

  const caption =
    image?.caption ??
    (failed
      ? "The sourced photo could not be loaded — showing this system's category symbol instead."
      : "No photograph on file for this asset yet.");

  return (
    <div className="hero-image hero-image--empty">
      <span className="mil-symbol">
        <Suspense fallback={null}>
          <MilSymbol sidc={sidc} meaning={meaning} size={90} />
        </Suspense>
      </span>
      <p>{caption}</p>
    </div>
  );
}

/**
 * "Change this slot to a different real system" — e.g. Russia's armor slot
 * swapping T-72B3 for T-90M or T-80BVM. Only renders when the asset has a
 * `comparison_group` and the catalog actually has more than one option for
 * it; otherwise there's nothing to swap to. The default option is always
 * the asset's own authored system, explicitly labeled so it's clear what
 * "reset" means.
 */
function SwapPicker({ asset }: { asset: Asset }) {
  const overrides = useOverrides();
  if (!asset.comparison_group) return null;
  const seed = findCatalogEntry(asset.side, asset.comparison_group);
  if (!seed) return null;
  const siblings = catalogSiblings(seed);
  if (siblings.length <= 1) return null;

  const current = overrides.assetOverrides[asset.id]?.catalog_equipment_id ?? "";

  return (
    <div className="swap-picker">
      <label>
        Show this slot as
        <select
          value={current}
          onChange={(e) =>
            overrides.setAssetOverride(asset.id, { catalog_equipment_id: e.target.value || null })
          }
        >
          <option value="">{asset.representative_system} (default)</option>
          {siblings.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * "Swap in a different real system" — Pass 18's same-category replacement,
 * built by reusing `duplicateAsset()`'s own clone-into-`customAssets`
 * mechanism (Pass 11), not a second, independent one. Lists every OTHER
 * asset sharing this one's `category` and `side` (the roster itself, not
 * just the 14/89 assets that carry a `comparison_group` — that's what
 * `SwapPicker` above already covers). Picking one clones the TARGET's full
 * profile but keeps THIS asset's own site (`distance_km_from_zero` /
 * `operating_range_km` / `band_id`), so the clone visibly takes over this
 * position rather than adding a second marker at the target's own spot.
 *
 * Deliberately additive, same as Duplicate: nothing is hidden or removed.
 * The original stays exactly where it was, and the target's own separate
 * entry (if it has one) is untouched — this map already treats duplicate
 * representation as accurate (FPV teams, Starlink terminals really do
 * appear more than once on a real battlefield), so a swapped-in system
 * showing up twice is consistent with that, not a bug. That also makes
 * "every category stays represented" true by construction: a swap can only
 * ever ADD an instance of a category that was already present, never
 * subtract one.
 */
function RosterSwapPicker({ asset, world }: { asset: Asset; world: WorldModel }) {
  const overrides = useOverrides();
  const view = useViewState();
  const siblings = useMemo(
    () => world.assets.filter((a) => a.id !== asset.id && a.side === asset.side && a.category === asset.category),
    [world.assets, asset.id, asset.side, asset.category],
  );
  if (siblings.length === 0) return null;

  const swapIn = (target: Asset) => {
    const existingIds = new Set([...world.assetsById.keys(), ...Object.keys(overrides.customAssets)]);
    const existingNames = new Set([
      ...world.assets.map((a) => a.name),
      ...Object.values(overrides.customAssets).map((a) => a.name),
    ]);
    const slot = asset.id.replace(/^side_[ab]-/, "");
    let id = `${target.id}-at-${slot}`;
    for (let n = 2; existingIds.has(id); n++) id = `${target.id}-at-${slot}-${n}`;
    let name = `${target.name} (swapped in)`;
    for (let n = 2; existingNames.has(name); n++) name = `${target.name} (swapped in ${n})`;

    overrides.saveCustomAsset({
      ...target,
      id,
      name,
      distance_km_from_zero: asset.distance_km_from_zero,
      operating_range_km: asset.operating_range_km,
      band_id: asset.band_id,
    });
    view.select(id);
  };

  return (
    <div className="swap-picker">
      <label>
        Swap in a different {asset.category} system here
        <select
          value=""
          onChange={(e) => {
            const target = siblings.find((s) => s.id === e.target.value);
            if (target) swapIn(target);
          }}
        >
          <option value="">Pick a same-category system to place here…</option>
          {siblings.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p className="swap-picker__hint">
        Adds an independent copy of the chosen system at this position — {asset.name} stays on the map too, same as
        Duplicate above.
      </p>
    </div>
  );
}

/**
 * Distance/band readout plus the placement editor. Band is never stored here
 * — it's recomputed from whatever bands are current, so editing the distance
 * (or editing a band cutoff elsewhere) immediately shows the correct band
 * without anyone re-tagging the asset by hand.
 */
function PlacementRow({ asset, band }: { asset: Asset; band: ReturnType<typeof resolveBand> }) {
  const overrides = useOverrides();
  const [editing, setEditing] = useState(false);
  const [distance, setDistance] = useState(String(asset.distance_km_from_zero));
  const [rangeMin, setRangeMin] = useState(String(asset.operating_range_km?.min_km ?? ""));
  const [rangeMax, setRangeMax] = useState(String(asset.operating_range_km?.max_km ?? ""));
  // Deliberately narrower than overrides.hasAssetOverride: that flag also
  // goes true from a catalog swap (a different kind of local edit, shown by
  // its own banner), and this tag is specifically about distance/range.
  const placementOverride = overrides.assetOverrides[asset.id];
  const isOverridden =
    placementOverride?.distance_km_from_zero !== undefined ||
    placementOverride?.operating_range_km !== undefined;

  const save = () => {
    const km = Number(distance);
    if (!Number.isFinite(km) || km < 0) return;
    const min = Number(rangeMin);
    const max = Number(rangeMax);
    const hasRange = rangeMin.trim() !== "" && rangeMax.trim() !== "" && Number.isFinite(min) && Number.isFinite(max);
    overrides.setAssetOverride(asset.id, {
      distance_km_from_zero: km,
      operating_range_km: hasRange ? { min_km: min, max_km: max } : null,
    });
    setEditing(false);
  };

  const cancel = () => {
    setDistance(String(asset.distance_km_from_zero));
    setRangeMin(String(asset.operating_range_km?.min_km ?? ""));
    setRangeMax(String(asset.operating_range_km?.max_km ?? ""));
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="placement-row">
        <div className="placement-row__stats">
          <div>
            <span className="k">Distance</span>
            <span className="v">{asset.distance_km_from_zero} km</span>
          </div>
          <div>
            <span className="k">Band</span>
            <span className="v">{band?.label ?? "—"}</span>
          </div>
          {asset.operating_range_km && (
            <div>
              <span className="k">Typical range</span>
              <span className="v">
                {asset.operating_range_km.min_km}–{asset.operating_range_km.max_km} km
              </span>
            </div>
          )}
        </div>
        <button type="button" className="placement-row__edit" onClick={() => setEditing(true)}>
          ✎ Adjust placement
        </button>
        {isOverridden && <span className="tag tag--info">edited locally</span>}
      </div>
    );
  }

  return (
    <div className="placement-row placement-row--editing">
      <div className="placement-row__form">
        <label>
          Distance from zero (km)
          <input type="number" min={0} value={distance} onChange={(e) => setDistance(e.target.value)} />
        </label>
        <label>
          Typical range — min km
          <input type="number" min={0} value={rangeMin} onChange={(e) => setRangeMin(e.target.value)} placeholder="optional" />
        </label>
        <label>
          Typical range — max km
          <input type="number" min={0} value={rangeMax} onChange={(e) => setRangeMax(e.target.value)} placeholder="optional" />
        </label>
      </div>
      <p className="detail__note">
        Band recomputes automatically from distance bands. Saved to this browser only — see About.
      </p>
      <div className="placement-row__actions">
        <button type="button" className="btn" onClick={save}>
          Save
        </button>
        <button type="button" className="btn btn--ghost" onClick={cancel}>
          Cancel
        </button>
        {isOverridden && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              overrides.resetAssetOverride(asset.id);
              cancel();
            }}
          >
            Reset to authored value
          </button>
        )}
      </div>
    </div>
  );
}

/** The lead sentence under the key facts — not wrapped in a `.detail__section`
 *  card (it reads as the panel's opening line, not a labeled block), but
 *  editable the same way everything else below it is. */
function EditableRole({
  value,
  isOverridden,
  onSave,
  onReset,
}: {
  value: string;
  isOverridden: boolean;
  onSave: (v: string) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <div className="detail__role-row">
        <p className="detail__role">{value}</p>
        <button
          type="button"
          className="detail__section-edit"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
        >
          ✎ edit
        </button>
        {isOverridden && <span className="tag tag--info">edited</span>}
      </div>
    );
  }
  return (
    <div className="detail__role-row detail__role-row--editing">
      <textarea className="detail__edit-area" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <div className="detail__edit-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
        >
          Save
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)}>
          Cancel
        </button>
        {isOverridden && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              onReset();
              setEditing(false);
            }}
          >
            Reset to authored text
          </button>
        )}
      </div>
    </div>
  );
}

/** One editable free-text section — role narrative, employment, contrast.
 *  Every field here lives in `overrides.assetOverrides[id].text`, a plain
 *  browser-local edit exactly like placement and system-swap (see
 *  src/state/overridesState.tsx) — not written back to the asset's own JSON
 *  file, which stays the shipped, reviewed content. */
function EditableSection({
  title,
  value,
  isOverridden,
  warn,
  onSave,
  onReset,
}: {
  title: string;
  value: string;
  isOverridden: boolean;
  warn?: boolean;
  onSave: (v: string) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <section className={`detail__section${warn ? " detail__section--contrast" : ""}`}>
      <h3>
        {title}
        <span>
          {isOverridden && !editing && <span className="tag tag--info">edited</span>}{" "}
          <button
            type="button"
            className="detail__section-edit"
            onClick={() => {
              if (!editing) setDraft(value);
              setEditing((e) => !e);
            }}
          >
            {editing ? "cancel" : "✎ edit"}
          </button>
        </span>
      </h3>
      {editing ? (
        <>
          <textarea className="detail__edit-area" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="detail__edit-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
            >
              Save
            </button>
            {isOverridden && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  onReset();
                  setEditing(false);
                }}
              >
                Reset to authored text
              </button>
            )}
          </div>
        </>
      ) : (
        <p>{value || <em className="detail__note">Not written yet — click edit to add one.</em>}</p>
      )}
    </section>
  );
}

/** Same edit contract as EditableSection but for the bulleted characteristics
 *  list — one line of the textarea per bullet, blank lines dropped on save. */
function EditableList({
  title,
  items,
  isOverridden,
  onSave,
  onReset,
}: {
  title: string;
  items: string[];
  isOverridden: boolean;
  onSave: (items: string[]) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(items.join("\n"));

  return (
    <section className="detail__section">
      <h3>
        {title}
        <span>
          {isOverridden && !editing && <span className="tag tag--info">edited</span>}{" "}
          <button
            type="button"
            className="detail__section-edit"
            onClick={() => {
              if (!editing) setDraft(items.join("\n"));
              setEditing((e) => !e);
            }}
          >
            {editing ? "cancel" : "✎ edit"}
          </button>
        </span>
      </h3>
      {editing ? (
        <>
          <textarea
            className="detail__edit-area"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="One characteristic per line"
          />
          <div className="detail__edit-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                onSave(
                  draft
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean),
                );
                setEditing(false);
              }}
            >
              Save
            </button>
            {isOverridden && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  onReset();
                  setEditing(false);
                }}
              >
                Reset to authored list
              </button>
            )}
          </div>
        </>
      ) : items.length > 0 ? (
        <ul className="bullets">
          {items.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : (
        <p className="detail__note">Nothing listed yet — click edit to add some.</p>
      )}
    </section>
  );
}

/** Pictures and video. gallery_images (authored, shipped in the asset's own
 *  JSON) render first; anything uploaded from this browser follows. Images
 *  persist (size-capped, re-encoded to a data URL); video plays for this
 *  session only — see the CustomMedia doc comment in overridesState.tsx for
 *  why, and docs/BACKLOG.md for the real-backend item that would fix it. */
function MediaSection({ asset, accent }: { asset: Asset; accent: string }) {
  const overrides = useOverrides();
  const custom = overrides.assetOverrides[asset.id]?.customMedia ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const authoredCount = (asset.gallery_images ?? []).length;

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setWarn(null);
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) {
        setWarn(`${file.name}: not a picture or video — skipped.`);
        continue;
      }
      const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      if (isImage) {
        if (file.size > 3_000_000) {
          setWarn(`${file.name}: over 3 MB, too big to save in the browser — skipped.`);
          continue;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const media: CustomMedia = {
            id,
            kind: "image",
            url: String(reader.result),
            name: file.name,
            persisted: true,
          };
          overrides.addCustomMedia(asset.id, media);
        };
        reader.readAsDataURL(file);
      } else {
        const media: CustomMedia = {
          id,
          kind: "video",
          url: URL.createObjectURL(file),
          name: file.name,
          persisted: false,
        };
        overrides.addCustomMedia(asset.id, media);
      }
    }
  };

  return (
    <section className="detail__section">
      <h3>
        Media
        <button type="button" className="detail__section-edit" onClick={() => fileRef.current?.click()}>
          + Upload picture / video
        </button>
      </h3>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="detail__file-input"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {warn && <p className="detail__note">{warn}</p>}
      <div className="gallery">
        {authoredCount === 0 && custom.length === 0 && (
          <p className="detail__note">Nothing here yet — upload a picture or a short clip.</p>
        )}
        {(asset.gallery_images ?? []).map((src) => (
          <GalleryTile key={src} src={src} accent={accent} />
        ))}
        {custom.map((m) => (
          <div className={`gallery__tile${m.kind === "video" ? " gallery__tile--video" : ""}`} key={m.id}>
            {m.kind === "video" ? (
              <video src={m.url} controls playsInline preload="metadata" />
            ) : (
              <img src={m.url} alt={m.name} />
            )}
            <button
              type="button"
              className="gallery__tile-remove"
              onClick={() => overrides.removeCustomMedia(asset.id, m.id)}
              aria-label={`Remove ${m.name}`}
            >
              ✕
            </button>
            {!m.persisted && <span className="gallery__tile-badge">not saved — lost on refresh</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function GalleryTile({ src, accent }: { src: string; accent: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="gallery__tile gallery__tile--missing" style={{ ["--accent" as string]: accent }}>
        <span>Image not supplied</span>
        <code>{src}</code>
      </div>
    );
  }
  return (
    <div className="gallery__tile">
      <img src={src} alt="" onError={() => setFailed(true)} loading="lazy" />
    </div>
  );
}

function StubDetail({
  stub,
  world,
  edges,
}: {
  stub: PendingStub;
  world: WorldModel;
  edges: { out: ResolvedConnection[]; in: ResolvedConnection[] };
}) {
  const [copied, setCopied] = useState(false);
  const { sidc, meaning } = resolveStubSidc({ side: stub.side, domain: stub.domain });
  const accent = DOMAIN_ACCENT[stub.domain] ?? "#8b93a3";
  const band = resolveBand(stub.distance_km_from_zero, world.bands);

  const template = useMemo(
    () =>
      JSON.stringify(
        {
          id: stub.id,
          name: stub.label,
          side: stub.side,
          domain: stub.domain,
          echelon: band?.echelon ?? "tactical",
          group: "",
          distance_km_from_zero: stub.distance_km_from_zero,
          operating_range_km: null,
          band_id: band?.id ?? stub.band_id,
          category: "",
          representative_system: "",
          icon_image: `/icons/${stub.id.replace(/^side_[ab]-/, "")}.png`,
          gallery_images: [],
          cost: { unit_cost_usd: null, display: "", confidence: "unknown" },
          key_facts: [
            { label: "", value: "" },
            { label: "", value: "" },
            { label: "", value: "" },
          ],
          short_role: "",
          characteristics: [],
          employment_notes: "",
          contrast_vs_traditional: "",
          connections: [],
          sources: [],
          editable: true,
        },
        null,
        2,
      ),
    [stub, band],
  );

  const inferredFields = [
    stub.inferred.side ? "side" : null,
    stub.inferred.domain ? "domain" : null,
    stub.inferred.band ? "band" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="detail__body">
      <header className="detail__header detail__header--stub" style={{ ["--accent" as string]: accent }}>
        <div className="detail__icon detail__icon--stub">
          <Suspense fallback={null}>
            <MilSymbol sidc={sidc} meaning={meaning} />
          </Suspense>
        </div>
        <div>
          <p className="detail__eyebrow">
            <span className="tag tag--pending">pending target</span>
          </p>
          <h2>{stub.label}</h2>
          <p className="detail__category">{stub.id}</p>
        </div>
      </header>

      <p className="detail__role">
        Nothing is wrong here. One or more assets declare a dependency on this id, but no asset file
        exists for it yet — the scaffold treats that as a normal intermediate state, so the edge is
        drawn to a provisional node instead of being dropped.
      </p>

      <div className="detail__stats">
        <div>
          <span className="k">Placed at</span>
          <span className="v">{stub.distance_km_from_zero} km</span>
        </div>
        <div>
          <span className="k">Band</span>
          <span className="v">{band?.label ?? stub.band_id}</span>
        </div>
        <div>
          <span className="k">Inferred</span>
          <span className="v">{inferredFields.length ? inferredFields.join(", ") : "nothing — all read from the id"}</span>
        </div>
      </div>

      <section className="detail__section">
        <h3>Where the position came from</h3>
        <p>
          Side, domain and band are read out of the id slug where it says so
          {inferredFields.length > 0
            ? `, and borrowed from the referencing asset for: ${inferredFields.join(", ")}`
            : ""}
          . The distance is a representative point inside the band, not an authored placement. Once a
          real asset file exists it replaces this node entirely.
        </p>
      </section>

      <section className="detail__section">
        <h3>Referenced by</h3>
        <ul className="bullets">
          {stub.referenced_by.map((rid) => (
            <li key={rid}>{world.assetsById.get(rid)?.name ?? rid}</li>
          ))}
        </ul>
      </section>

      <EdgeList title="Depended on by" edges={edges.in} world={world} direction="in" />

      <section className="detail__section">
        <h3>Build it</h3>
        <p className="detail__note">
          Save as <code>data/assets/{stub.id}.json</code>. The loader picks it up on reload — no code
          change, and every edge already pointing here resolves automatically.
        </p>
        <div className="detail__vignette-row">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(template).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              });
            }}
          >
            {copied ? "Copied" : "Copy JSON skeleton"}
          </button>
        </div>
        <pre className="code-block">{template}</pre>
      </section>
    </div>
  );
}
