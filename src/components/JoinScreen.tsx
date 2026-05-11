import { useState } from "react";
import { makeRoomCode, normalizeRoomCode } from "../lib/room";
import { QRScanner } from "../lib/qr";

export function JoinScreen({
  onJoin,
}: {
  onJoin: (code: string, password: string | undefined) => void;
}) {
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [scanning, setScanning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  function startNew() {
    const newCode = makeRoomCode();
    onJoin(newCode, password || undefined);
  }

  function joinExisting() {
    const cleaned = normalizeRoomCode(code);
    if (cleaned.length < 4) return;
    onJoin(cleaned, password || undefined);
  }

  function handleScan(text: string) {
    setScanning(false);
    try {
      const url = new URL(text);
      const hash = url.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const r = params.get("r");
      const k = params.get("k") ?? "";
      if (r) {
        onJoin(normalizeRoomCode(r), k || undefined);
        return;
      }
    } catch {
      // not a URL — maybe just a code
    }
    const cleaned = normalizeRoomCode(text);
    if (cleaned.length >= 4) onJoin(cleaned, password || undefined);
  }

  return (
    <div className="modal-backdrop" style={{ background: "var(--bg)" }}>
      <div className="modal" style={{ alignItems: "stretch" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>CursorParty</h2>
          <small>
            Shared cursors and sticky notes. No signup, no backend, ephemeral.
          </small>
        </div>

        <button className="primary" onClick={startNew}>
          Start a new room
        </button>

        <div className="row">
          <input
            placeholder="Or enter room code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && joinExisting()}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
          <button onClick={joinExisting} disabled={normalizeRoomCode(code).length < 4}>
            Join
          </button>
        </div>

        <button onClick={() => setScanning(true)}>📷 Scan QR</button>

        <details
          open={showAdvanced}
          onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
        >
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--fg-dim)" }}>
            Optional room password
          </summary>
          <div style={{ marginTop: 8 }}>
            <input
              placeholder="Room password (optional)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="text"
            />
            <small>
              When set, wire traffic to the signaling server is encrypted with this
              password (XSalsa20). Peers without it cannot read room contents.
            </small>
          </div>
        </details>

        {scanning && (
          <QRScanner
            onResult={(r) => handleScan(r.text)}
            onClose={() => setScanning(false)}
          />
        )}
      </div>
    </div>
  );
}
