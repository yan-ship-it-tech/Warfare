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
import { useMemo, useState } from "react";
import type { Asset } from "../types";
import type { PendingStub, ResolvedConnection, WorldModel } from "../data/model";
import { resolveBand } from "../data/model";
import { CONNECTION_STYLE, DOMAIN_ACCENT, SIDE_ACCENT, SIDE_LABELS } from "../config/ui";
import { resolveIcon } from "../icons/registry";
import { resolveVignette } from "../scene/vignettes";
import { useViewState } from "../state/viewState";
import { useOverrides } from "../state/overridesState";
import { catalogSiblings, findCatalogEntry, resolveAssetDisplay } from "../data/catalog";

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
  const Icon = resolveIcon({ group: asset.group, category: asset.category, id: asset.id, domain: asset.domain });
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

  return (
    <div className="detail__body">
      <header className="detail__header" style={{ ["--accent" as string]: accent }}>
        <div className="detail__icon" style={{ color: accent }}>
          <Icon />
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
      </header>

      <SwapPicker asset={asset} />

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

      <p className="detail__role">{asset.short_role}</p>

      {asset.characteristics?.length > 0 && (
        <section className="detail__section">
          <h3>Key characteristics</h3>
          <ul className="bullets">
            {asset.characteristics.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {asset.employment_notes && (
        <section className="detail__section">
          <h3>How it's employed</h3>
          <p>{asset.employment_notes}</p>
        </section>
      )}

      {asset.contrast_vs_traditional && (
        <section className="detail__section detail__section--contrast">
          <h3>What changed vs. traditional warfare</h3>
          <p>{asset.contrast_vs_traditional}</p>
        </section>
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

      <section className="detail__section">
        <h3>Imagery</h3>
        <div className="gallery">
          {(asset.gallery_images ?? []).length === 0 && (
            <p className="detail__note">No gallery images listed for this asset yet.</p>
          )}
          {(asset.gallery_images ?? []).map((src) => (
            <GalleryTile key={src} src={src} accent={accent} />
          ))}
        </div>
      </section>

      <section className="detail__section">
        <h3>Sources</h3>
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
  const Icon = resolveIcon({ id: stub.id, domain: stub.domain });
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
        <div className="detail__icon detail__icon--stub" style={{ color: accent }}>
          <Icon />
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
