// Category show/hide — "turn off everything except air defense." A popover
// rather than a modal on purpose: toggling should feel like adjusting a
// filter while still watching the map react, not a separate settings screen.
import { useEffect, useRef } from "react";
import type { WorldModel } from "../data/model";
import { useViewState } from "../state/viewState";

export function CategoryFilterMenu({ world }: { world: WorldModel }) {
  const view = useViewState();
  const ref = useRef<HTMLDivElement>(null);
  const open = view.openPanel === "categories";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) view.setOpenPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") view.setOpenPanel(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, view]);

  if (!open) return null;

  const counts = new Map<string, number>();
  for (const a of world.assets) counts.set(a.group, (counts.get(a.group) ?? 0) + 1);
  const allIds = world.groups.map((g) => g.id);
  const allHidden = view.hiddenGroups.size >= allIds.length;

  return (
    <div className="category-menu" ref={ref} role="menu" aria-label="Show or hide asset categories">
      <div className="category-menu__head">
        <span>Categories</span>
        <div className="category-menu__quick">
          <button type="button" onClick={view.showAllGroups} disabled={view.hiddenGroups.size === 0}>
            All
          </button>
          <button type="button" onClick={() => view.hideAllGroups(allIds)} disabled={allHidden}>
            None
          </button>
        </div>
      </div>
      <ul className="category-menu__list">
        {world.groups.map((g) => {
          const count = counts.get(g.id) ?? 0;
          const on = !view.hiddenGroups.has(g.id);
          return (
            <li key={g.id}>
              <button
                type="button"
                className={`category-menu__row${on ? " is-on" : ""}${count === 0 ? " is-empty" : ""}`}
                onClick={() => view.toggleGroup(g.id)}
                title={g.description}
              >
                <span className="category-menu__swatch" style={{ background: g.color }} />
                <span className="category-menu__label">{g.label}</span>
                <span className="category-menu__count">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
