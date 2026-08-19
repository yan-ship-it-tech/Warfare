// ─────────────────────────────────────────────────────────────────────────
// Router. Hash-based on purpose, not history/pushState: this app deploys to
// GitHub Pages as a project site (see vite.config.ts's `base`) with no
// server-side rewrite, so a direct load of a pushState URL like
// /Warfare/health would 404 before React ever runs. `#/health` always
// resolves to the same document. main.tsx already carved out `#bench` as an
// escape hatch on the same mechanism — this extends the pattern rather than
// bringing in a second one, and stays a real, bookmarkable, back-button-
// aware URL, which is the part of "real routes" that actually matters here.
// ─────────────────────────────────────────────────────────────────────────
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

function normalizePath(hash: string): string {
  const raw = hash.replace(/^#/, "");
  if (!raw || raw === "/") return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export interface RouterValue {
  path: string;
  navigate: (path: string) => void;
}

const Ctx = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState<string>(() => normalizePath(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setPath(normalizePath(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((next: string) => {
    const target = next.startsWith("/") ? next : `/${next}`;
    const nextHash = target === "/" ? "" : `#${target}`;
    if (nextHash === window.location.hash) {
      // Same target: hashchange won't fire, so update state directly rather
      // than leaving the app pointed at a route it's already showing.
      setPath(target);
      return;
    }
    window.location.hash = nextHash;
  }, []);

  const value = useMemo<RouterValue>(() => ({ path, navigate }), [path, navigate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRouter(): RouterValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRouter must be used inside <RouterProvider>");
  return v;
}
