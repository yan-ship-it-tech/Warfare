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
import { CONNECTION_STYLE, DOMAIN_ACCENT, SIDE_ACCENT, SIDE_LABELS } from "../config/ui";
import { resolveIcon } from "../icons/registry";
import { resolveVignette } from "../scene/vignettes";
import { useViewState } from "../state/viewState";

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
  const Icon = resolveIcon({ category: asset.category, id: asset.id, domain: asset.domain });
  const band = world.bands.find((b) => b.id === asset.band_id);
  const domain = world.domains.find((d) => d.id === asset.domain);
  const accent = DOMAIN_ACCENT[asset.domain] ?? "#8b93a3";
  const { vignette, known } = resolveVignette(asset.reactive_behavior?.animation_id);
  const citable = (asset.sources ?? []).filter((s) => s.url && s.url.trim() !== "");
  const uncited = (asset.sources ?? []).filter((s) => !s.url || s.url.trim() === "");

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
            {asset.echelon}
          </p>
          <h2>{asset.name}</h2>
          <p className="detail__category">{asset.category}</p>
        </div>
      </header>

      <div className="detail__stats">
        <div>
          <span className="k">Distance</span>
          <span className="v">{asset.distance_km_from_zero} km</span>
        </div>
        <div>
          <span className="k">Band</span>
          <span className="v">{band?.label ?? asset.band_id}</span>
        </div>
        <div>
          <span className="k">Representative</span>
          <span className="v" title={asset.representative_system}>
            {asset.representative_system}
          </span>
        </div>
      </div>

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
  const band = world.bands.find((b) => b.id === stub.band_id);

  const template = useMemo(
    () =>
      JSON.stringify(
        {
          id: stub.id,
          name: stub.label,
          side: stub.side,
          domain: stub.domain,
          echelon: band?.echelon ?? "tactical",
          distance_km_from_zero: stub.distance_km_from_zero,
          band_id: stub.band_id,
          category: "",
          representative_system: "",
          icon_image: `/icons/${stub.id.replace(/^side_[ab]-/, "")}.png`,
          gallery_images: [],
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
