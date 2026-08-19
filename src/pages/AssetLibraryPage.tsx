// Asset library — browse the whole roster by category and side, independent
// of where anything sits on the map. The battlefield views are built to be
// walked (pan/zoom/scroll to find something); this page is built to be
// searched — pick a filter, or type a name, and go straight to the asset.
//
// Selecting a row doesn't leave the page: it expands in place to show the
// asset's role and the three actions the brief asked for. "Edit" branches on
// what kind of asset it is rather than pretending there's one editing
// surface — a custom asset (built or duplicated in the Asset editor) opens
// that form directly; a shipped asset opens the detail panel, which is
// where its inline edit controls actually live (see AssetEditorPanel.tsx's
// own header for why the form can't touch a shipped asset's fields).
import { useMemo, useState } from "react";
import type { AssetGroup, Side } from "../types";
import { resolveIcon } from "../icons/registry";
import { resolveAssetDisplay } from "../data/catalog";
import { resolveBand } from "../data/model";
import { DOMAIN_ACCENT, SIDE_ACCENT, SIDE_LABELS } from "../config/ui";
import { useViewState } from "../state/viewState";
import { useOverrides } from "../state/overridesState";
import { useRouter } from "../state/router";
import type { PageProps } from "./registry";

export function AssetLibraryPage({ world }: PageProps) {
  const view = useViewState();
  const overrides = useOverrides();
  const router = useRouter();

  const [sideFilter, setSideFilter] = useState<Side | "all">("all");
  const [groupFilter, setGroupFilter] = useState<AssetGroup | "all">("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const countsByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of world.assets) {
      if (sideFilter !== "all" && a.side !== sideFilter) continue;
      m.set(a.group, (m.get(a.group) ?? 0) + 1);
    }
    return m;
  }, [world.assets, sideFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return world.assets
      .filter((a) => {
        if (sideFilter !== "all" && a.side !== sideFilter) return false;
        if (groupFilter !== "all" && a.group !== groupFilter) return false;
        if (q && !a.name.toLowerCase().includes(q) && !a.category.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          a.group.localeCompare(b.group) ||
          a.distance_km_from_zero - b.distance_km_from_zero ||
          a.name.localeCompare(b.name),
      );
  }, [world.assets, sideFilter, groupFilter, query]);

  const viewDetail = (id: string) => {
    view.select(id);
    router.navigate("/");
  };

  const edit = (id: string) => {
    if (id in overrides.customAssets) view.requestEditAsset(id);
    else viewDetail(id); // shipped asset — its edit controls live in the detail panel
  };

  const showOnBattlefield = (id: string, name: string) => {
    if (view.renderMode !== "terrain3d") view.setRenderMode("terrain3d");
    view.select(null);
    view.focusAssets([id], name);
    router.navigate("/");
  };

  return (
    <>
      <h2>Asset library</h2>
      <p>
        Every asset on the map, browsable by side and category instead of by where it sits.
        {" "}{world.assets.length} total. Pick one to see its role, then jump to it.
      </p>

      <div className="library__filters">
        <div className="toolbar__group">
          {(["all", "side_a", "side_b"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`chip chip--side${sideFilter === s ? " is-on" : ""}`}
              style={s !== "all" ? { ["--chip" as string]: SIDE_ACCENT[s].base } : undefined}
              onClick={() => setSideFilter(s)}
            >
              {s === "all" ? "Both sides" : SIDE_LABELS[s].short}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="library__search"
          placeholder="Search by name or category…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search assets"
        />
      </div>

      <div className="toolbar__group library__categories">
        <button
          type="button"
          className={`chip${groupFilter === "all" ? " is-on" : ""}`}
          onClick={() => setGroupFilter("all")}
        >
          All categories
        </button>
        {world.groups.map((g) => {
          const count = countsByGroup.get(g.id) ?? 0;
          return (
            <button
              key={g.id}
              type="button"
              className={`chip chip--type${groupFilter === g.id ? " is-on" : ""}${count === 0 ? " is-unused" : ""}`}
              style={{ ["--chip" as string]: g.color }}
              onClick={() => setGroupFilter(g.id)}
              title={g.description}
              disabled={count === 0}
            >
              <i />
              {g.label} <em className="chip__count">{count}</em>
            </button>
          );
        })}
      </div>

      <p className="library__count">
        {filtered.length} of {world.assets.length} shown
        {(sideFilter !== "all" || groupFilter !== "all" || query) && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setSideFilter("all");
              setGroupFilter("all");
              setQuery("");
            }}
          >
            Clear filters
          </button>
        )}
      </p>

      {filtered.length === 0 ? (
        <p className="detail__unsourced">No assets match these filters.</p>
      ) : (
        <ul className="library">
          {filtered.map((asset) => {
            const open = expandedId === asset.id;
            const swapId = overrides.assetOverrides[asset.id]?.catalog_equipment_id;
            const display = resolveAssetDisplay(asset, swapId);
            const Icon = resolveIcon({
              group: asset.group,
              category: asset.category,
              id: asset.id,
              domain: asset.domain,
            });
            const group = world.groupsById.get(asset.group);
            const band = resolveBand(asset.distance_km_from_zero, world.bands);
            const isCustom = asset.id in overrides.customAssets;
            const accent = group?.color ?? DOMAIN_ACCENT[asset.domain] ?? "#8b93a3";
            const textOverride = overrides.assetOverrides[asset.id]?.text;
            const role = textOverride?.short_role ?? asset.short_role;

            return (
              <li key={asset.id} className={`library__item${open ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="library__head"
                  onClick={() => setExpandedId(open ? null : asset.id)}
                  aria-expanded={open}
                  style={{ ["--accent" as string]: accent }}
                >
                  <span className="library__icon" style={{ color: accent }}>
                    <Icon />
                  </span>
                  <span className="library__title">
                    <b>
                      {display.name}
                      {isCustom && <em className="tag tag--info">local</em>}
                    </b>
                    <span className="library__sub">
                      <span style={{ color: SIDE_ACCENT[asset.side].text }}>
                        {SIDE_LABELS[asset.side].short}
                      </span>
                      <span className="dot">·</span>
                      {group?.label ?? asset.group}
                      <span className="dot">·</span>
                      {asset.distance_km_from_zero} km
                    </span>
                  </span>
                  <span className="lessons__chev">{open ? "▾" : "▸"}</span>
                </button>

                {open && (
                  <div className="library__body">
                    <p>{role}</p>
                    <div className="library__meta">
                      <span className="tag tag--info">{band?.label ?? "unbanded"}</span>
                      <span className="tag tag--info">{display.category}</span>
                    </div>
                    <div className="library__actions">
                      <button type="button" className="btn" onClick={() => viewDetail(asset.id)}>
                        View detail
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => edit(asset.id)}
                        title={isCustom ? "Opens the Asset editor" : "Opens the detail panel's inline edit controls"}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => showOnBattlefield(asset.id, display.name)}
                      >
                        ▶ Show on battlefield
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
