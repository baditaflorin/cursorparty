import { useState } from "react";
import {
  DEFAULTS,
  loadSignalingUrls,
  loadTurnTokenUrl,
  saveSignalingUrl,
  saveTurnTokenUrl,
} from "../lib/turnConfig";

export function Settings({ onClose }: { onClose: () => void }) {
  const [sig, setSig] = useState(loadSignalingUrls()[0]);
  const [turn, setTurn] = useState(loadTurnTokenUrl());
  const [saved, setSaved] = useState(false);

  function save() {
    saveSignalingUrl(sig);
    saveTurnTokenUrl(turn);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  function reset() {
    setSig(DEFAULTS.signalingUrl);
    setTurn(DEFAULTS.turnTokenUrl);
    saveSignalingUrl("");
    saveTurnTokenUrl("");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Settings</h2>
          <button onClick={onClose}>close</button>
        </div>

        <div>
          <label>Signaling WebSocket URL</label>
          <input
            value={sig}
            onChange={(e) => setSig(e.target.value)}
            placeholder={DEFAULTS.signalingUrl}
            spellCheck={false}
          />
          <small>
            y-webrtc protocol pub/sub. Default is the maintainer's{" "}
            <a
              href="https://github.com/baditaflorin/signaling-server"
              target="_blank"
              rel="noreferrer"
            >
              signaling-server
            </a>{" "}
            on Hetzner.
          </small>
        </div>

        <div>
          <label>TURN token URL</label>
          <input
            value={turn}
            onChange={(e) => setTurn(e.target.value)}
            placeholder={DEFAULTS.turnTokenUrl}
            spellCheck={false}
          />
          <small>
            HMAC-signed TURN credentials. Default is the maintainer's{" "}
            <a
              href="https://github.com/baditaflorin/turn-token-server"
              target="_blank"
              rel="noreferrer"
            >
              turn-token-server
            </a>
            . Leave blank to fall back to STUN-only (works for ~70% of NAT pairs).
          </small>
        </div>

        <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
          <button onClick={reset}>Reset to defaults</button>
          <div className="row">
            {saved && <small style={{ color: "var(--ok)" }}>saved</small>}
            <button className="primary" onClick={save}>
              Save
            </button>
          </div>
        </div>

        <small>
          Settings are stored in localStorage on this device only. Reload after changing.
        </small>
      </div>
    </div>
  );
}
