// Key Lessons Learned.
//
// Seeded from docs/doctrine.md's already-sourced findings rather than written
// fresh — every entry in data/lessons.json names the doctrine section and the
// sourcing tag it came from, so a lesson is as traceable as an asset.
//
// The part that matters: a lesson is not a paragraph, it is a pointer at the
// map. "Show on the battlefield" flies the camera to that lesson's assets and
// puts the whole app into scenario-focus mode (src/state/viewState.tsx's
// FocusRequest) — everything else dims/blurs in both renderers — so the claim
// gets demonstrated on the same objects the rest of the tool is built from
// instead of being asserted alongside them. Exit via the banner, Escape, or
// clicking empty battlefield.
//
// Pass 24 makes Pass 23's convergence audit legible. Pass 23 wrote
// `corpus_support`, `contested` and `caution` into data/lessons.json but
// deliberately touched no UI, which left an UNSUPPORTED lesson rendering at
// exactly the same visual confidence as a CONVERGENT-3 one — the opposite of
// what that audit was for. Two rules follow:
//   * the support tier shows in the *collapsed* row, because a reader
//     scanning the list is exactly who the tier is meant to warn; and
//   * `caution` on a contested lesson shows in the collapsed row too. A
//     caveat behind an expander is a caveat most readers never see.
// The full `corpus_support` prose stays in the expanded body — the badge is a
// lossy summary of it and is never the only thing on offer.
import { useState } from "react";
import { CONNECTION_STYLE, SIDE_ACCENT } from "../config/ui";
import { useViewState } from "../state/viewState";
import { useRouter } from "../state/router";
import type { PageProps } from "./registry";

/**
 * Support tiers, strongest first. Ranked so a lesson whose prose names more
 * than one tier can be badged with its headline tier *and* its weakest one —
 * lesson 11's cost asymmetry is CONVERGENT-2 while the statistic it used to
 * lead with is CONTRADICTED, and collapsing that to either token alone would
 * misreport it.
 */
const SUPPORT_TIERS = [
  { token: "CONVERGENT-3", mod: "c3", note: "all three reference documents, independently" },
  { token: "CONVERGENT-2", mod: "c2", note: "two of the three reference documents" },
  { token: "SINGLE-SOURCE", mod: "single", note: "one reference document only" },
  { token: "CONTRADICTED", mod: "bad", note: "the corpus argues against it" },
  { token: "UNSUPPORTED", mod: "bad", note: "no reference document carries it" },
] as const;

type SupportTier = (typeof SUPPORT_TIERS)[number];

/**
 * Read the tier tokens back out of a lesson's `corpus_support` prose, in the
 * order they appear. Deliberately a parser over prose rather than an enum on
 * the record: the audit's own finding is that one lesson can hold claims at
 * different confidences, and flattening that into a single stored enum would
 * throw away the part most worth showing.
 */
function supportTiers(
  text: string | undefined,
): { headline: SupportTier; also: SupportTier[] } | null {
  if (!text) return null;
  const seen: SupportTier[] = [];
  const re = new RegExp(SUPPORT_TIERS.map((t) => t.token).join("|"), "g");
  for (const m of text.matchAll(re)) {
    const tier = SUPPORT_TIERS.find((t) => t.token === m[0]);
    if (tier && !seen.includes(tier)) seen.push(tier);
  }
  if (seen.length === 0) return null;
  const [headline, ...rest] = seen;
  // Only *weaker* tiers earn a second badge. A stronger tier mentioned later
  // in the prose is supporting detail, not a caveat.
  const headlineRank = SUPPORT_TIERS.indexOf(headline);
  return { headline, also: rest.filter((t) => SUPPORT_TIERS.indexOf(t) > headlineRank) };
}

export function LessonsPage({ world }: PageProps) {
  const view = useViewState();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);

  const showOnMap = (assetIds: string[], label: string) => {
    // The 3D view is the one that can actually fly a camera; switching first
    // means the button does the same thing regardless of which view you were
    // in when you pressed it. focusAssets() now doubles as "scenario focus
    // mode" — everything not in assetIds dims/blurs in both renderers, not
    // just the 3D one, so the effect survives a later switch to Schematic.
    if (view.renderMode !== "terrain3d") view.setRenderMode("terrain3d");
    view.select(null);
    view.focusAssets(assetIds, label);
    router.navigate("/");
  };

  return (
    <>
      <h2>Key lessons learned</h2>
      <p>
        Drawn from <code>docs/doctrine.md</code> — the same sourced reference every asset's
        "what changed vs. traditional warfare" field is written against. Each lesson names the
        doctrine section and source tag behind it, and points at the assets on the map that
        demonstrate it. {world.lessons.length} lessons.
      </p>
      <p className="lessons__key">
        Each lesson carries the result of the convergence audit against the three
        lessons-learned reference documents — Russian-side, Western-side, Ukrainian-side.
        Read the badge before the claim:
        {SUPPORT_TIERS.map((t) => (
          <span key={t.token} className={`support support--${t.mod}`} title={t.note}>
            {t.token}
            <i>{t.note}</i>
          </span>
        ))}
      </p>

      <ol className="lessons">
        {world.lessons.map((lesson) => {
          const open = expanded === lesson.id;
          const support = supportTiers(lesson.corpus_support);
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
                  {support && (
                    <span className="lessons__support">
                      <span className={`support support--${support.headline.mod}`}>
                        {support.headline.token}
                      </span>
                      {support.also.map((t) => (
                        <span key={t.token} className={`support support--${t.mod} support--part`}>
                          part {t.token}
                        </span>
                      ))}
                      {lesson.contested && (
                        <span className="support support--contested">CONTESTED</span>
                      )}
                    </span>
                  )}
                </span>
                <span className="lessons__chev">{open ? "▾" : "▸"}</span>
              </button>

              {lesson.contested && lesson.caution && (
                <p className="lessons__caution">
                  <b>Caution</b>
                  {lesson.caution}
                </p>
              )}

              {open && (
                <div className="lessons__body">
                  <p>{lesson.detail}</p>

                  {lesson.corpus_support && (
                    <div className="lessons__corpus">
                      <span className="lessons__links-label">Corpus support</span>
                      <p>{lesson.corpus_support}</p>
                    </div>
                  )}

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
                            showOnMap(lesson.asset_ids, lesson.title);
                            view.select(a.id);
                          }}
                          title={a.short_role}
                        >
                          {a.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn"
                    onClick={() => showOnMap(lesson.asset_ids, lesson.title)}
                  >
                    ▶ Show all {linked.length} on the battlefield
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
    </>
  );
}
