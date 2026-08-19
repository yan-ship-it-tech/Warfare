// Key Lessons Learned.
//
// Seeded from docs/doctrine.md's already-sourced findings rather than written
// fresh — every entry in data/lessons.json names the doctrine section and the
// sourcing tag it came from, so a lesson is as traceable as an asset.
//
// The part that matters: a lesson is not a paragraph, it is a pointer at the
// map. "Show on map" frames that lesson's assets in the 3D view and dims the
// rest, so the claim gets demonstrated on the same objects the rest of the
// tool is built from instead of being asserted alongside them.
import { useState } from "react";
import type { WorldModel } from "../data/model";
import { CONNECTION_STYLE, SIDE_ACCENT } from "../config/ui";
import { useViewState } from "../state/viewState";

export function LessonsPanel({ world }: { world: WorldModel }) {
  const view = useViewState();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (view.openPanel !== "lessons") return null;

  const showOnMap = (assetIds: string[]) => {
    // The 3D view is the one that can actually fly a camera; switching first
    // means the button does the same thing regardless of which view you were
    // in when you pressed it.
    if (view.renderMode !== "terrain3d") view.setRenderMode("terrain3d");
    view.select(null);
    view.focusAssets(assetIds);
    view.setOpenPanel(null);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Key lessons learned">
      <div className="modal__scrim" onClick={() => view.setOpenPanel(null)} />
      <div className="modal__body modal__body--wide">
        <button className="detail__close" onClick={() => view.setOpenPanel(null)} aria-label="Close">
          ✕
        </button>
        <h2>Key lessons learned</h2>
        <p>
          Drawn from <code>docs/doctrine.md</code> — the same sourced reference every asset's
          "what changed vs. traditional warfare" field is written against. Each lesson names the
          doctrine section and source tag behind it, and points at the assets on the map that
          demonstrate it. {world.lessons.length} lessons.
        </p>

        <ol className="lessons">
          {world.lessons.map((lesson) => {
            const open = expanded === lesson.id;
            const linked = lesson.asset_ids
              .map((id) => world.assetsById.get(id))
              .filter((a): a is NonNullable<typeof a> => Boolean(a));
            return (
              <li key={lesson.id} className={`lessons__item${open ? " is-open" : ""}`}>
                <button
                  type="button"
                  className="lessons__head"
                  onClick={() => setExpanded(open ? null : lesson.id)}
                  aria-expanded={open}
                >
                  <span className="lessons__num">{String(lesson.order).padStart(2, "0")}</span>
                  <span className="lessons__title">
                    <b>{lesson.title}</b>
                    <em>{lesson.summary}</em>
                  </span>
                  <span className="lessons__chev">{open ? "▾" : "▸"}</span>
                </button>

                {open && (
                  <div className="lessons__body">
                    <p>{lesson.detail}</p>

                    <div className="lessons__meta">
                      <span className="tag tag--info">{lesson.doctrine_ref}</span>
                      <span className="lessons__source">{lesson.source_tag}</span>
                    </div>

                    {lesson.connection_types.length > 0 && (
                      <div className="lessons__links">
                        <span className="lessons__links-label">Dependency types in play</span>
                        {lesson.connection_types.map((t) => {
                          const style = CONNECTION_STYLE[t];
                          return (
                            <span key={t} className="lessons__chip" style={{ color: style?.color }}>
                              <i style={{ background: style?.color }} />
                              {style?.label ?? t}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="lessons__assets">
                      <span className="lessons__links-label">Worked example on the map</span>
                      <div className="lessons__asset-row">
                        {linked.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="lessons__asset"
                            style={{ ["--side" as string]: SIDE_ACCENT[a.side].base }}
                            onClick={() => {
                              showOnMap(lesson.asset_ids);
                              view.select(a.id);
                            }}
                            title={a.short_role}
                          >
                            {a.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button type="button" className="btn" onClick={() => showOnMap(lesson.asset_ids)}>
                      ▶ Show all {linked.length} on the map
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <p className="about__foot">
          Adding a lesson is adding an entry to <code>data/lessons.json</code> — same
          data-driven contract as assets, no code change.
        </p>
      </div>
    </div>
  );
}
