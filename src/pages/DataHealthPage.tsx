// Data health: every complaint the loader collected, grouped by severity.
//
// This is a working tool, not an error screen. While categories are being
// filled in, most of what lands here is a to-do list — unbuilt connection
// targets, assets still missing a citation, drift between connections.json and
// the per-asset arrays.
import { useMemo, useState } from "react";
import type { DataIssue } from "../data/model";
import { useViewState } from "../state/viewState";
import { useRouter } from "../state/router";
import type { PageProps } from "./registry";

const SEVERITY_ORDER: DataIssue["severity"][] = ["error", "warning", "info"];
const SEVERITY_COPY: Record<DataIssue["severity"], string> = {
  error: "Blocks placement or breaks a reference",
  warning: "Renders, but something is inconsistent or missing",
  info: "Expected while the skeleton is still being filled in",
};

export function DataHealthPage({ world }: PageProps) {
  const view = useViewState();
  const router = useRouter();
  const [filter, setFilter] = useState<DataIssue["severity"] | "all">("all");

  const grouped = useMemo(() => {
    const g = new Map<DataIssue["severity"], DataIssue[]>();
    for (const s of SEVERITY_ORDER) g.set(s, []);
    for (const issue of world.issues) g.get(issue.severity)?.push(issue);
    return g;
  }, [world.issues]);

  const shown = SEVERITY_ORDER.filter((s) => filter === "all" || filter === s);

  return (
    <>
      <h2>Data health</h2>
      <p>
        Everything the loader flagged while reading <code>data/</code>. Nothing here stops the map
        rendering unless it is marked as an error — the rest is the working checklist for filling
        out the remaining categories.
      </p>

      <div className="health__filters">
        <button
          type="button"
          className={`chip${filter === "all" ? " is-on" : ""}`}
          onClick={() => setFilter("all")}
        >
          All <em className="chip__count">{world.issues.length}</em>
        </button>
        {SEVERITY_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip chip--${s}${filter === s ? " is-on" : ""}`}
            onClick={() => setFilter(s)}
          >
            {s} <em className="chip__count">{grouped.get(s)?.length ?? 0}</em>
          </button>
        ))}
      </div>

      {shown.map((severity) => {
        const list = grouped.get(severity) ?? [];
        if (list.length === 0) return null;
        return (
          <section key={severity} className="health__group">
            <h3 className={`health__heading health__heading--${severity}`}>
              {severity}
              <span>{SEVERITY_COPY[severity]}</span>
            </h3>
            <ul className="health__list">
              {list.map((issue, i) => (
                <li key={`${severity}-${i}`}>
                  <div className="health__meta">
                    <code>{issue.source}</code>
                    {issue.subject && (
                      <button
                        type="button"
                        className="health__jump"
                        onClick={() => {
                          const target =
                            world.assetsById.get(issue.subject!) ?? world.stubsById.get(issue.subject!);
                          if (target) {
                            view.select(issue.subject!);
                            router.navigate("/");
                          }
                        }}
                      >
                        {issue.subject}
                      </button>
                    )}
                  </div>
                  <p>{issue.message}</p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {world.issues.length === 0 && <p>No issues. Every asset file validated cleanly.</p>}
    </>
  );
}
