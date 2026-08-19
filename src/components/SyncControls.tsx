// Where edits go, and how to move them.
//
// This is deliberately visible rather than buried in About: "saved" means two
// different things depending on how the app was built (this browser only, vs.
// a shared store), and a stakeholder demo where one person's edits silently
// fail to reach anyone else is exactly the failure this label prevents.
import { useRef, useState } from "react";
import { useOverrides } from "../state/overridesState";

export function SyncControls() {
  const overrides = useOverrides();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      await overrides.importEdits(file);
      setMsg("Edits imported.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Could not read that file.");
    }
    window.setTimeout(() => setMsg(null), 4000);
  };

  return (
    <div className="toolbar__group sync" role="group" aria-label="Edit storage">
      <span className="toolbar__legend">Edits</span>

      <span
        className={`sync__badge sync__badge--${overrides.storageIsShared ? "shared" : "local"}`}
        title={
          overrides.storageIsShared
            ? "Edits are written to a shared store and reach other devices."
            : "Edits are saved in this browser only. Export to move them to another device, or configure VITE_SYNC_URL for a shared store — see src/state/persistence.ts."
        }
      >
        {overrides.storageLabel}
        {overrides.syncState === "saving" && <em>saving…</em>}
        {overrides.syncState === "error" && <em className="is-err">sync failed</em>}
      </span>

      <button type="button" className="chip" onClick={overrides.exportEdits} title="Download all edits as a JSON file">
        Export
      </button>
      <button type="button" className="chip" onClick={() => fileRef.current?.click()} title="Load an exported edits file">
        Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="detail__file-input"
        onChange={(e) => {
          void onImport(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {msg && <span className="sync__msg">{msg}</span>}
    </div>
  );
}
