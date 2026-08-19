// ─────────────────────────────────────────────────────────────────────────
// Shared-edits sync store for the Warfare digital twin.
//
// Implements exactly the contract src/state/persistence.ts already expects
// (see that file's header comment — this Worker was written to match it,
// not the other way around):
//
//   GET  /            → the saved StoreShape JSON, or 404 if nothing saved yet
//   PUT  /   {body}    ← a StoreShape JSON document, stored verbatim
//
// One document, one key. This app has one shared editable state (bands +
// asset overrides), not per-user records, so there is deliberately no
// routing, no auth system, no database — a single KV key is the entire
// storage model. If per-user or per-session state is ever wanted, that's a
// real schema decision (see docs/BACKLOG.md), not a config change to this.
//
// Auth: an optional bearer token gate (`SYNC_WRITE_TOKEN` secret), checked
// on PUT only. Be honest with yourself about what this buys you — if the
// token is supplied to the client via VITE_SYNC_TOKEN it ships inside the
// public bundle same as the URL does, so this is a "keep casual scanners
// from stumbling into write access" gate, not real authentication. Treat
// the shared store the way the toolbar badge already describes it: shared,
// not secured. Real access control is out of scope for a static-site demo
// tool and would mean a real backend with real accounts — not this.
// ─────────────────────────────────────────────────────────────────────────

export interface Env {
  SYNC_KV: KVNamespace;
  ALLOWED_ORIGINS: string;
  SYNC_WRITE_TOKEN?: string;
}

const STORE_KEY = "warfare-twin:store:v1";
// KV values are capped well under Cloudflare's 25 MiB limit — this store
// holds band edits and asset-override JSON, not media (persisted images
// stay in each browser's localStorage; see docs/DECISIONS.md Pass 5/6 on
// why video specifically can't live here either without a real redesign).
const MAX_BODY_BYTES = 2_000_000;

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    vary: "origin",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "GET") {
      const raw = await env.SYNC_KV.get(STORE_KEY);
      if (raw === null) {
        return new Response(JSON.stringify({ error: "no store saved yet" }), {
          status: 404,
          headers: { ...cors, "content-type": "application/json" },
        });
      }
      return new Response(raw, { status: 200, headers: { ...cors, "content-type": "application/json" } });
    }

    if (request.method === "PUT") {
      if (env.SYNC_WRITE_TOKEN) {
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${env.SYNC_WRITE_TOKEN}`) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { ...cors, "content-type": "application/json" },
          });
        }
      }

      const body = await request.text();
      if (body.length > MAX_BODY_BYTES) {
        return new Response(JSON.stringify({ error: "payload too large" }), {
          status: 413,
          headers: { ...cors, "content-type": "application/json" },
        });
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return new Response(JSON.stringify({ error: "invalid JSON" }), {
          status: 400,
          headers: { ...cors, "content-type": "application/json" },
        });
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as { version?: unknown }).version !== 1 ||
        typeof (parsed as { assetOverrides?: unknown }).assetOverrides !== "object"
      ) {
        return new Response(JSON.stringify({ error: "does not match StoreShape v1" }), {
          status: 400,
          headers: { ...cors, "content-type": "application/json" },
        });
      }

      await env.SYNC_KV.put(STORE_KEY, body);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...cors, "content-type": "application/json" },
    });
  },
};
