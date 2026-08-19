# Deploying the shared sync store

`src/state/persistence.ts` has supported a shared REST store since Pass 6;
what was missing was an actual endpoint. `worker/` is that endpoint — a
Cloudflare Worker over a KV namespace, matching the `GET`/`PUT` one-JSON-
document contract the client already speaks. This is the "yours to create"
step flagged in `docs/BACKLOG.md` #21: it needs a Cloudflare account, so it
has to happen outside this session, the same way enabling GitHub Pages
itself did.

**Cost:** free at this app's scale — one small JSON document, edited
occasionally. Cloudflare's Workers + KV free tier covers this with enormous
headroom.

## 1. One-time setup

```bash
cd worker
npm install
npx wrangler login          # opens a browser to authorize against your Cloudflare account
npx wrangler kv namespace create SYNC_KV
```

The last command prints something like:

```
🌀 Creating namespace with title "warfare-twin-sync-SYNC_KV"
✨ Success!
Add the following to your configuration file:
[[kv_namespaces]]
binding = "SYNC_KV"
id = "a1b2c3d4e5f6..."
```

Copy that `id` into `worker/wrangler.toml`, replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

## 2. (Optional) set a write token

Anyone with the worker's URL can `GET` the shared state — that's the point,
it's meant to be shared. A write token doesn't make this secure (see the
honesty note in `worker/src/index.ts` — a token shipped to the client via
`VITE_SYNC_TOKEN` is visible in the public bundle same as the URL is), but
it does stop a search-engine crawler or a stray bot from overwriting the
store by accident. Worth setting for a low-friction speed bump:

```bash
npx wrangler secret put SYNC_WRITE_TOKEN
# paste any random string when prompted
```

If you skip this, leave `VITE_SYNC_TOKEN` unset in step 4 too — the worker
accepts unauthenticated writes when no token secret is configured.

## 3. Deploy the worker

```bash
npx wrangler deploy
```

Prints a URL like `https://warfare-twin-sync.<your-subdomain>.workers.dev`.
That's `VITE_SYNC_URL`.

## 4. Wire it into the deployed app

The GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) already
passes these through at build time — you only need to set the repo secrets:

Repo → **Settings → Secrets and variables → Actions** → **New repository
secret**:

| Secret name | Value |
|---|---|
| `SYNC_URL` | the workers.dev URL from step 3 |
| `SYNC_WRITE_TOKEN` | the token from step 2, if you set one — otherwise omit |

Push anything to the branch (or re-run the workflow manually) to pick them
up. Confirm it worked: open the deployed app, look at the "Edits" badge in
the toolbar — it should read **"Shared store"** instead of **"This browser
only"**.

## 5. Confirm it end-to-end

1. Open the app in two different browsers (or one normal + one private
   window — different `localStorage`, same shared store).
2. Edit something — move an asset's distance, or edit its role text.
3. Reload the *other* browser. The edit should be there.
4. If it isn't: check the browser console for `[persistence]` warnings —
   the client logs (and falls back to local-only) on any fetch failure
   rather than losing the edit silently.

## What this does *not* do

- **No auth beyond the optional write token.** Anyone who has the URL can
  read the whole shared state, and — if you skipped step 2 — write to it.
  Fine for a small-team teaching tool passed around by link; not fine if
  this is ever exposed somewhere adversarial. That would be a real backend
  with real accounts, a different piece of work.
- **No versioning or conflict resolution.** The worker stores one document;
  the last `PUT` wins. Two people editing at the same moment will have one
  edit silently overwrite the other. Acceptable for the "small team, mostly
  sequential edits" use case this was built for; a real multi-user tool
  would want last-write-wins replaced with a merge strategy or a CRDT.
- **Still no video persistence.** The shared store holds `bands` and
  `assetOverrides` — the same JSON that used to live only in `localStorage`.
  Uploaded video still plays via an in-session `URL.createObjectURL` and is
  not written here; a real clip is too large for this document-per-app
  model regardless of where it's stored. See `docs/BACKLOG.md` #2.
