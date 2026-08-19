// ─────────────────────────────────────────────────────────────────────────
// Page registry. The one place that knows what routed pages exist. Adding a
// page — the asset library page mentioned as coming in a later pass — is
// meant to cost one entry here plus the component itself: no changes to the
// router, the drawer, or App.tsx. NavDrawer renders its nav links straight
// off PAGES, and App.tsx resolves the current route by matching `path`.
// ─────────────────────────────────────────────────────────────────────────
import type { ComponentType, ReactNode } from "react";
import type { WorldModel } from "../data/model";
import { AboutPage } from "./AboutPage";
import { DataHealthPage } from "./DataHealthPage";
import { LessonsPage } from "./LessonsPage";

export interface PageProps {
  world: WorldModel;
}

export interface PageBadge {
  text: string;
  tone?: "error" | "warning";
}

export interface PageDef {
  path: string;
  /** Shown as the page shell's <h2> and the document context. */
  title: string;
  /** Shown as the button label in the drawer's nav list. */
  navLabel: string;
  /** Optional hover text on the drawer nav button. */
  navHint?: string;
  Component: ComponentType<PageProps>;
  /** Optional live count/status badge next to the nav label, e.g. issue or
   *  lesson counts. Computed from the current world so it stays live. */
  badge?: (world: WorldModel) => PageBadge | null;
}

export const PAGES: PageDef[] = [
  {
    path: "/health",
    title: "Data health",
    navLabel: "Data health",
    navHint: "Everything the loader flagged while reading data/",
    Component: DataHealthPage,
    badge: (world) => {
      const errors = world.issues.filter((i) => i.severity === "error").length;
      const warnings = world.issues.filter((i) => i.severity === "warning").length;
      if (errors) return { text: `${errors}!`, tone: "error" };
      if (warnings) return { text: String(warnings), tone: "warning" };
      if (world.issues.length) return { text: String(world.issues.length) };
      return null;
    },
  },
  {
    path: "/lessons",
    title: "Key lessons learned",
    navLabel: "Key lessons",
    navHint: "Sourced findings from doctrine.md, each linked to the assets that demonstrate it",
    Component: LessonsPage,
    badge: (world) => (world.lessons.length ? { text: String(world.lessons.length) } : null),
  },
  {
    path: "/about",
    title: "About / disclaimer",
    navLabel: "About / disclaimer",
    Component: AboutPage,
  },
];

export function findPage(path: string): PageDef | undefined {
  return PAGES.find((p) => p.path === path);
}

export function renderBadge(def: PageDef, world: WorldModel): ReactNode {
  const b = def.badge?.(world);
  if (!b) return null;
  return <em className={`chip__count${b.tone ? ` chip__count--${b.tone}` : ""}`}>{b.text}</em>;
}
