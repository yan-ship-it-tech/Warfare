// Asset editor — add a brand-new asset from scratch, live, from the browser.
//
// Distinct from the per-field "edit" controls already in DetailPanel.tsx:
// those patch a *shipped* asset's text/placement/media. This page builds an
// entirely new Asset record — category, side, placement, every schema field
// — without a code change or a spreadsheet round-trip, per the explicit ask.
//
// How it stays live without a backend: it writes into the same overrides
// store as everything else in src/state/overridesState.tsx (this browser's
// localStorage, or the shared sync store when VITE_SYNC_URL is configured —
// see docs/DEPLOY_SYNC_WORKER.md). loadWorld() merges `customAssets` in
// alongside the shipped data/assets/*.json files and runs each one through
// the exact same validateAsset() check, so a locally-added asset shows up on
// the map, in Data health, and in the detail panel exactly like a shipped
// one — it just isn't a file, and won't survive Export/Import or a fresh
// browser without moving the edit set along with it.
//
// Two honest scope lines, stated in the UI rather than faked:
//   1. Map icon is chosen automatically from Group/Category/Domain, the same
//      way it already works for every shipped asset (src/icons/registry.tsx)
//      — there's no separate icon upload, because icon_image was never read
//      for the map glyph in the first place (Pass 5 decision).
//   2. A custom asset gets the standard marker+label treatment in the 3D
//      view, not a real hero model — HERO_BUILDERS is procedural TypeScript
//      geometry compiled at build time, not something a live page can inject.
//      That's the same deliberate scope line docs/BACKLOG.md #22 already
//      draws for 16 of the 27 originally-shipped assets, not a gap unique to
//      this feature.
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Asset, ConnectionType, Domain, Echelon, Side } from "../types";
import type { WorldModel } from "../data/model";
import { resolveBand } from "../data/model";
import { useViewState } from "../state/viewState";
import { useOverrides } from "../state/overridesState";
import { ALL_CONNECTION_TYPES } from "../state/viewState";
import { SIDE_LABELS } from "../config/ui";

const ECHELONS: Echelon[] = ["tactical", "operational", "strategic"];
const CONNECTION_TYPE_LABEL: Record<ConnectionType, string> = {
  supply: "Supply",
  data_c2: "Data / C2",
  personnel: "Personnel",
  fires_support: "Fires support",
  casevac: "Casevac",
  maintenance: "Maintenance",
};
const MAX_IMAGE_BYTES = 3_000_000;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

interface DraftKeyFact {
  label: string;
  value: string;
}
interface DraftSource {
  label: string;
  url: string;
}
interface DraftConnection {
  target_id: string;
  type: ConnectionType;
  description: string;
}

interface Draft {
  id: string;
  idTouched: boolean;
  name: string;
  side: Side;
  domain: Domain;
  echelon: Echelon;
  group: string;
  category: string;
  representative_system: string;
  distance_km_from_zero: string;
  hasOperatingRange: boolean;
  opMin: string;
  opMax: string;
  unitCostUsd: string;
  costDisplay: string;
  costConfidence: "reported" | "estimated" | "unknown";
  keyFacts: DraftKeyFact[];
  shortRole: string;
  characteristics: string;
  employmentNotes: string;
  contrast: string;
  sources: DraftSource[];
  connections: DraftConnection[];
  galleryImages: string[];
}

function emptyDraft(defaultDomain: Domain, defaultGroup: string): Draft {
  return {
    id: "",
    idTouched: false,
    name: "",
    side: "side_a",
    domain: defaultDomain,
    echelon: "tactical",
    group: defaultGroup,
    category: "",
    representative_system: "",
    distance_km_from_zero: "5",
    hasOperatingRange: false,
    opMin: "",
    opMax: "",
    unitCostUsd: "",
    costDisplay: "",
    costConfidence: "unknown",
    keyFacts: [
      { label: "", value: "" },
      { label: "", value: "" },
      { label: "", value: "" },
    ],
    shortRole: "",
    characteristics: "",
    employmentNotes: "",
    contrast: "",
    sources: [{ label: "", url: "" }],
    connections: [],
    galleryImages: [],
  };
}

function draftFromAsset(a: Asset): Draft {
  return {
    id: a.id,
    idTouched: true,
    name: a.name,
    side: a.side,
    domain: a.domain,
    echelon: a.echelon,
    group: a.group,
    category: a.category ?? "",
    representative_system: a.representative_system ?? "",
    distance_km_from_zero: String(a.distance_km_from_zero ?? 0),
    hasOperatingRange: !!a.operating_range_km,
    opMin: a.operating_range_km ? String(a.operating_range_km.min_km) : "",
    opMax: a.operating_range_km ? String(a.operating_range_km.max_km) : "",
    unitCostUsd: a.cost?.unit_cost_usd != null ? String(a.cost.unit_cost_usd) : "",
    costDisplay: a.cost?.display ?? "",
    costConfidence: a.cost?.confidence ?? "unknown",
    keyFacts:
      a.key_facts && a.key_facts.length > 0
        ? [0, 1, 2].map((i) => a.key_facts[i] ?? { label: "", value: "" })
        : [
            { label: "", value: "" },
            { label: "", value: "" },
            { label: "", value: "" },
          ],
    shortRole: a.short_role ?? "",
    characteristics: (a.characteristics ?? []).join("\n"),
    employmentNotes: a.employment_notes ?? "",
    contrast: a.contrast_vs_traditional ?? "",
    sources: a.sources && a.sources.length > 0 ? a.sources.map((s) => ({ ...s })) : [{ label: "", url: "" }],
    connections: (a.connections ?? []).map((c) => ({ ...c })),
    galleryImages: a.gallery_images ?? [],
  };
}

export function AssetEditorPanel({ world }: { world: WorldModel }) {
  const view = useViewState();
  const overrides = useOverrides();
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(world.domains[0]?.id ?? "land", world.groups[0]?.id ?? ""));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [imageWarning, setImageWarning] = useState<string | null>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  if (view.openPanel !== "editor") return null;

  const customList = Object.values(overrides.customAssets).sort((a, b) => a.name.localeCompare(b.name));

  const startNew = () => {
    setEditingId(null);
    setDraft(emptyDraft(world.domains[0]?.id ?? "land", world.groups[0]?.id ?? ""));
    setJustSavedId(null);
    setMode("form");
  };

  const startEdit = (asset: Asset) => {
    setEditingId(asset.id);
    setDraft(draftFromAsset(asset));
    setJustSavedId(null);
    setMode("form");
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (!d.idTouched && (key === "name" || key === "side" || key === "category" || key === "group")) {
        const basis = next.category.trim() || next.group.trim() || "asset";
        next.id = `${next.side}-${slugify(basis)}-${slugify(next.name)}`.replace(/-+/g, "-").replace(/-$/, "");
      }
      return next;
    });

  const km = Number(draft.distance_km_from_zero);
  const computedBand = Number.isFinite(km) ? resolveBand(km, world.bands) : undefined;

  const errors: string[] = [];
  if (!draft.name.trim()) errors.push("Name is required.");
  if (!draft.id.trim()) errors.push("Id is required.");
  else if (!/^[a-z0-9][a-z0-9_-]*$/.test(draft.id.trim())) {
    errors.push("Id should be lowercase letters, digits, - and _ only (matches every shipped asset's id style).");
  } else {
    const existing = world.assetsById.get(draft.id.trim());
    if (existing && existing.id !== editingId) {
      errors.push(`Id "${draft.id.trim()}" is already in use by "${existing.name}" — pick a different one.`);
    }
  }
  if (!draft.group) errors.push("Group is required — it's what drives the show/hide filter and the map icon.");
  if (!Number.isFinite(km) || km < 0) errors.push("Distance from zero must be a number ≥ 0.");
  if (draft.hasOperatingRange) {
    const min = Number(draft.opMin);
    const max = Number(draft.opMax);
    if (!Number.isFinite(min) || !Number.isFinite(max)) errors.push("Operating range needs numeric min and max.");
    else if (min > max) errors.push("Operating range min is greater than max.");
  }

  const buildAsset = (): Asset => {
    const id = draft.id.trim();
    return {
      id,
      name: draft.name.trim(),
      side: draft.side,
      domain: draft.domain,
      echelon: draft.echelon,
      group: draft.group,
      distance_km_from_zero: km,
      operating_range_km: draft.hasOperatingRange
        ? { min_km: Number(draft.opMin), max_km: Number(draft.opMax) }
        : null,
      band_id: computedBand?.id ?? world.bands[0]?.id ?? "",
      category: draft.category.trim() || draft.group,
      representative_system: draft.representative_system.trim() || draft.name.trim(),
      // Not read for the map glyph (see file header) — kept for schema
      // completeness / consistency with shipped assets only.
      icon_image: `/icons/${slugify(draft.name) || "asset"}.png`,
      gallery_images: draft.galleryImages,
      cost: {
        unit_cost_usd: draft.unitCostUsd.trim() === "" ? null : Number(draft.unitCostUsd),
        display: draft.costDisplay.trim() || (draft.costConfidence === "unknown" ? "Not publicly disclosed" : ""),
        confidence: draft.costConfidence,
      },
      key_facts: draft.keyFacts
        .filter((kf) => kf.label.trim() || kf.value.trim())
        .map((kf) => ({ label: kf.label.trim(), value: kf.value.trim() })),
      short_role: draft.shortRole.trim(),
      characteristics: draft.characteristics
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      employment_notes: draft.employmentNotes.trim(),
      contrast_vs_traditional: draft.contrast.trim(),
      connections: draft.connections
        .filter((c) => c.target_id.trim())
        .map((c) => ({ target_id: c.target_id.trim(), type: c.type, description: c.description.trim() })),
      sources: draft.sources
        .filter((s) => s.label.trim() || s.url.trim())
        .map((s) => ({ label: s.label.trim(), url: s.url.trim() })),
      // Deliberately not authored here, same as every shipped asset — see
      // docs/CONTENT_PIPELINE.md. A live-added asset ships without a
      // `verification` block at all, so the detail panel shows no
      // verified/unverified pill next to Sources (that pill only renders
      // when `asset.verification` is set — see DetailPanel.tsx). The
      // separate "unsourced" tag still applies correctly if `sources` is
      // empty, since that one just checks the array. A real verification
      // pill needs `node scripts/audit-content.mjs --write` to run against
      // this asset for real, same as any shipped one.
      editable: true,
    };
  };

  const canSave = errors.length === 0;

  const save = () => {
    if (!canSave) return;
    const asset = buildAsset();
    overrides.saveCustomAsset(asset);
    setJustSavedId(asset.id);
    setMode("list");
  };

  const viewOnMap = (id: string) => {
    if (view.renderMode !== "terrain3d") view.setRenderMode("terrain3d");
    view.select(id);
    view.focusAssets([id]);
    view.setOpenPanel(null);
  };

  const onImageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageWarning(null);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setImageWarning(`${file.name}: not a picture — skipped.`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setImageWarning(`${file.name}: over 3 MB, too big to save in the browser — skipped.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = String(reader.result);
        setDraft((d) => ({ ...d, galleryImages: [...d.galleryImages, url] }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Asset editor">
      <div className="modal__scrim" onClick={() => view.setOpenPanel(null)} />
      <div className="modal__body modal__body--wide">
        <button className="detail__close" onClick={() => view.setOpenPanel(null)} aria-label="Close">
          ✕
        </button>
        <h2>Asset editor</h2>

        {mode === "list" ? (
          <ListMode
            world={world}
            customList={customList}
            justSavedId={justSavedId}
            confirmDeleteId={confirmDeleteId}
            setConfirmDeleteId={setConfirmDeleteId}
            onNew={startNew}
            onEdit={startEdit}
            onDelete={(id) => overrides.removeCustomAsset(id)}
            onView={viewOnMap}
          />
        ) : (
          <FormMode
            world={world}
            draft={draft}
            set={set}
            setDraft={setDraft}
            errors={errors}
            canSave={canSave}
            computedBand={computedBand}
            editingId={editingId}
            imageWarning={imageWarning}
            onImageFiles={onImageFiles}
            onCancel={() => setMode("list")}
            onSave={save}
          />
        )}
      </div>
    </div>
  );
}

/** Same "copy the JSON, paste into a real file" bridge StubDetail already
 *  offers for pending targets — the way a browser-only custom asset
 *  graduates into a real, sourced, auditable data/assets/*.json file
 *  without retyping it by hand. */
function CopyJsonButton({ asset }: { asset: Asset }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--ghost"
      title={`Paste into data/assets/${asset.id}.json to make this a real, committed, auditable asset`}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(JSON.stringify(asset, null, 2))
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1800);
          });
      }}
    >
      {copied ? "Copied" : "Copy JSON"}
    </button>
  );
}

function ListMode({
  world,
  customList,
  justSavedId,
  confirmDeleteId,
  setConfirmDeleteId,
  onNew,
  onEdit,
  onDelete,
  onView,
}: {
  world: WorldModel;
  customList: Asset[];
  justSavedId: string | null;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  onNew: () => void;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
  onView: (id: string) => void;
}) {
  return (
    <>
      <p>
        Build a brand-new asset — category, side, placement, every schema field a shipped asset has —
        without a code change or a spreadsheet round-trip. Saves into the same store as every other
        edit in this app (this browser, or the shared sync store if one is configured), and appears on
        the map immediately.
      </p>
      <p className="about__foot">
        Its map icon is chosen automatically from Group / Category / Domain, exactly like every shipped
        asset — there's no separate icon upload. It gets the standard marker + label treatment in the 3D
        view rather than a custom hero model; see this panel's form for why.
      </p>
      <div className="detail__vignette-row" style={{ margin: "14px 0" }}>
        <button type="button" className="btn" onClick={onNew}>
          + New asset
        </button>
      </div>
      {customList.length === 0 ? (
        <p className="detail__note">Nothing added yet in this browser.</p>
      ) : (
        <ul className="health__list">
          {customList.map((a) => {
            const band = resolveBand(a.distance_km_from_zero, world.bands);
            return (
              <li key={a.id}>
                <div className="health__meta">
                  <code>{a.id}</code>
                  {justSavedId === a.id && <span className="tag tag--ok">saved</span>}
                </div>
                <p>
                  <b>{a.name}</b> — {SIDE_LABELS[a.side].short}, {a.group || "no group"},{" "}
                  {a.distance_km_from_zero} km ({band?.label ?? "unmatched band"})
                </p>
                <div className="detail__vignette-row">
                  <button type="button" className="btn btn--ghost" onClick={() => onView(a.id)}>
                    View on map
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => onEdit(a)}>
                    Edit
                  </button>
                  <CopyJsonButton asset={a} />
                  <button
                    type="button"
                    className={`btn btn--ghost${confirmDeleteId === a.id ? " btn--danger" : ""}`}
                    onClick={() => {
                      if (confirmDeleteId === a.id) {
                        onDelete(a.id);
                        setConfirmDeleteId(null);
                      } else {
                        setConfirmDeleteId(a.id);
                        window.setTimeout(() => setConfirmDeleteId(null), 3000);
                      }
                    }}
                  >
                    {confirmDeleteId === a.id ? "Click again to confirm delete" : "Delete"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function FormMode({
  world,
  draft,
  set,
  setDraft,
  errors,
  canSave,
  computedBand,
  editingId,
  imageWarning,
  onImageFiles,
  onCancel,
  onSave,
}: {
  world: WorldModel;
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  setDraft: Dispatch<SetStateAction<Draft>>;
  errors: string[];
  canSave: boolean;
  computedBand: ReturnType<typeof resolveBand>;
  editingId: string | null;
  imageWarning: string | null;
  onImageFiles: (files: FileList | null) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const idPreview = useMemo(() => draft.id || "(fill in name / category to generate one)", [draft.id]);

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{editingId ? `Editing ${editingId}` : "New asset"}</h3>

      <div className="editor-grid">
        <label className="editor-field">
          <span>Name</span>
          <input
            type="text"
            className="bands-table__input"
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. RQ-11 Raven"
          />
        </label>
        <label className="editor-field">
          <span>Id</span>
          <input
            type="text"
            className="bands-table__input"
            value={draft.id}
            onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value, idTouched: true }))}
          />
        </label>
      </div>
      <p className="detail__note">
        Id preview: <code>{idPreview}</code> — auto-generated from side / category / name until you edit
        it by hand.
      </p>

      <div className="editor-grid editor-grid--4">
        <label className="editor-field">
          <span>Side</span>
          <select className="bands-table__input" value={draft.side} onChange={(e) => set("side", e.target.value as Side)}>
            <option value="side_a">{SIDE_LABELS.side_a.short}</option>
            <option value="side_b">{SIDE_LABELS.side_b.short}</option>
          </select>
        </label>
        <label className="editor-field">
          <span>Domain</span>
          <select className="bands-table__input" value={draft.domain} onChange={(e) => set("domain", e.target.value as Domain)}>
            {world.domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="editor-field">
          <span>Echelon</span>
          <select className="bands-table__input" value={draft.echelon} onChange={(e) => set("echelon", e.target.value as Echelon)}>
            {ECHELONS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <label className="editor-field">
          <span>Group</span>
          <select className="bands-table__input" value={draft.group} onChange={(e) => set("group", e.target.value)}>
            <option value="">— choose —</option>
            {world.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="editor-grid">
        <label className="editor-field">
          <span>Category (free text, e.g. "armor-main-battle-tank")</span>
          <input
            type="text"
            className="bands-table__input"
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
          />
        </label>
        <label className="editor-field">
          <span>Representative system</span>
          <input
            type="text"
            className="bands-table__input"
            value={draft.representative_system}
            onChange={(e) => set("representative_system", e.target.value)}
            placeholder="Defaults to name if left blank"
          />
        </label>
      </div>

      <div className="editor-grid editor-grid--3">
        <label className="editor-field">
          <span>Distance from zero (km)</span>
          <input
            type="number"
            className="bands-table__input"
            value={draft.distance_km_from_zero}
            min={0}
            onChange={(e) => set("distance_km_from_zero", e.target.value)}
          />
        </label>
        <div className="editor-field">
          <span>Computed band</span>
          <p className="detail__note" style={{ margin: 0 }}>
            {computedBand ? computedBand.label : "no band matches — check the bands editor"}
          </p>
        </div>
        <label className="editor-field editor-field--checkbox">
          <input
            type="checkbox"
            checked={draft.hasOperatingRange}
            onChange={(e) => set("hasOperatingRange", e.target.checked)}
          />
          <span>Has an operating-range bracket</span>
        </label>
      </div>
      {draft.hasOperatingRange && (
        <div className="editor-grid editor-grid--3">
          <label className="editor-field">
            <span>Range min (km)</span>
            <input type="number" className="bands-table__input" value={draft.opMin} onChange={(e) => set("opMin", e.target.value)} />
          </label>
          <label className="editor-field">
            <span>Range max (km)</span>
            <input type="number" className="bands-table__input" value={draft.opMax} onChange={(e) => set("opMax", e.target.value)} />
          </label>
        </div>
      )}

      <h3>Cost</h3>
      <div className="editor-grid editor-grid--3">
        <label className="editor-field">
          <span>Unit cost (USD, blank = none)</span>
          <input type="number" className="bands-table__input" value={draft.unitCostUsd} onChange={(e) => set("unitCostUsd", e.target.value)} />
        </label>
        <label className="editor-field">
          <span>Display text</span>
          <input
            type="text"
            className="bands-table__input"
            value={draft.costDisplay}
            onChange={(e) => set("costDisplay", e.target.value)}
            placeholder='e.g. "~$1.1M per launcher unit"'
          />
        </label>
        <label className="editor-field">
          <span>Confidence</span>
          <select
            className="bands-table__input"
            value={draft.costConfidence}
            onChange={(e) => set("costConfidence", e.target.value as Draft["costConfidence"])}
          >
            <option value="reported">reported</option>
            <option value="estimated">estimated</option>
            <option value="unknown">unknown</option>
          </select>
        </label>
      </div>

      <h3>Key facts (up to 3)</h3>
      {draft.keyFacts.map((kf, i) => (
        <div className="editor-grid" key={i}>
          <label className="editor-field">
            <span>Label {i + 1}</span>
            <input
              type="text"
              className="bands-table__input"
              value={kf.label}
              onChange={(e) =>
                setDraft((d) => {
                  const next = d.keyFacts.slice();
                  next[i] = { ...next[i], label: e.target.value };
                  return { ...d, keyFacts: next };
                })
              }
            />
          </label>
          <label className="editor-field">
            <span>Value {i + 1}</span>
            <input
              type="text"
              className="bands-table__input"
              value={kf.value}
              onChange={(e) =>
                setDraft((d) => {
                  const next = d.keyFacts.slice();
                  next[i] = { ...next[i], value: e.target.value };
                  return { ...d, keyFacts: next };
                })
              }
            />
          </label>
        </div>
      ))}

      <h3>Narrative</h3>
      <label className="editor-field">
        <span>Short role (one sentence, shown on hover)</span>
        <input type="text" className="bands-table__input" value={draft.shortRole} onChange={(e) => set("shortRole", e.target.value)} />
      </label>
      <label className="editor-field">
        <span>Characteristics (one per line)</span>
        <textarea className="detail__edit-area" value={draft.characteristics} onChange={(e) => set("characteristics", e.target.value)} />
      </label>
      <label className="editor-field">
        <span>Employment notes</span>
        <textarea className="detail__edit-area" value={draft.employmentNotes} onChange={(e) => set("employmentNotes", e.target.value)} />
      </label>
      <label className="editor-field">
        <span>Contrast vs. traditional warfare</span>
        <textarea className="detail__edit-area" value={draft.contrast} onChange={(e) => set("contrast", e.target.value)} />
        <span className="detail__note">
          Per docs/CONTENT_PIPELINE.md this should pull its framing from docs/doctrine.md rather than
          being invented fresh — not enforced here, just worth keeping in mind.
        </span>
      </label>

      <h3>Sources</h3>
      {draft.sources.map((s, i) => (
        <div className="editor-grid" key={i}>
          <label className="editor-field">
            <span>Label</span>
            <input
              type="text"
              className="bands-table__input"
              value={s.label}
              onChange={(e) =>
                setDraft((d) => {
                  const next = d.sources.slice();
                  next[i] = { ...next[i], label: e.target.value };
                  return { ...d, sources: next };
                })
              }
            />
          </label>
          <label className="editor-field">
            <span>URL</span>
            <input
              type="text"
              className="bands-table__input"
              value={s.url}
              onChange={(e) =>
                setDraft((d) => {
                  const next = d.sources.slice();
                  next[i] = { ...next[i], url: e.target.value };
                  return { ...d, sources: next };
                })
              }
            />
          </label>
        </div>
      ))}
      <div className="detail__vignette-row">
        <button type="button" className="btn btn--ghost" onClick={() => setDraft((d) => ({ ...d, sources: [...d.sources, { label: "", url: "" }] }))}>
          + Add source
        </button>
      </div>
      <p className="detail__note">
        No sources yet is fine — the "unsourced" flag on the detail panel handles that honestly either
        way. Note this asset won't get a verified/unverified pill at all (that only comes from
        <code>node scripts/audit-content.mjs --write</code>, which reads real files in
        <code>data/assets/</code> — it can't see a browser-only asset). Use "Copy JSON" below to turn
        this into a real file later if you want a real derived verification status.
      </p>

      <h3>Connections (optional)</h3>
      {draft.connections.map((c, i) => (
        <div className="editor-grid editor-grid--3" key={i}>
          <label className="editor-field">
            <span>Target asset id</span>
            <input
              type="text"
              className="bands-table__input"
              value={c.target_id}
              onChange={(e) =>
                setDraft((d) => {
                  const next = d.connections.slice();
                  next[i] = { ...next[i], target_id: e.target.value };
                  return { ...d, connections: next };
                })
              }
            />
          </label>
          <label className="editor-field">
            <span>Type</span>
            <select
              className="bands-table__input"
              value={c.type}
              onChange={(e) =>
                setDraft((d) => {
                  const next = d.connections.slice();
                  next[i] = { ...next[i], type: e.target.value as ConnectionType };
                  return { ...d, connections: next };
                })
              }
            >
              {ALL_CONNECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CONNECTION_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="editor-field">
            <span>Description</span>
            <input
              type="text"
              className="bands-table__input"
              value={c.description}
              onChange={(e) =>
                setDraft((d) => {
                  const next = d.connections.slice();
                  next[i] = { ...next[i], description: e.target.value };
                  return { ...d, connections: next };
                })
              }
            />
          </label>
        </div>
      ))}
      <div className="detail__vignette-row">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              connections: [...d.connections, { target_id: "", type: "data_c2", description: "" }],
            }))
          }
        >
          + Add connection
        </button>
      </div>

      <h3>Photos</h3>
      <p className="detail__note">
        Optional. Stored the same way an uploaded detail-panel photo is (size-capped, re-encoded to a
        data URL) — up to 3 MB each.
      </p>
      <input type="file" accept="image/*" multiple onChange={(e) => onImageFiles(e.target.files)} />
      {imageWarning && <p className="detail__note" style={{ color: "var(--warn)" }}>{imageWarning}</p>}
      {draft.galleryImages.length > 0 && (
        <div className="gallery">
          {draft.galleryImages.map((url, i) => (
            <div className="gallery__tile" key={i}>
              <img src={url} alt="" />
              <button
                type="button"
                className="gallery__tile-remove"
                onClick={() => setDraft((d) => ({ ...d, galleryImages: d.galleryImages.filter((_, j) => j !== i) }))}
                aria-label="Remove image"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {errors.length > 0 && (
        <div className="editor-errors">
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="detail__edit-actions" style={{ marginTop: 18 }}>
        <button type="button" className="btn" disabled={!canSave} onClick={onSave}>
          {editingId ? "Save changes" : "Add asset"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
  );
}
