# CursorParty

Shared cursors and sticky notes on an infinite canvas. Open the URL, see everyone's pointer in real time, double-click anywhere to drop a note. No signup, no backend, ephemeral.

→ <https://baditaflorin.github.io/cursorparty/>

## What it is

A peer-to-peer collaborative whiteboard built as a single static site. State lives entirely in connected browsers via a Yjs CRDT mesh — close all tabs and the room is gone.

- **Cursors** — every peer's pointer position broadcast through Yjs awareness.
- **Sticky notes** — Yjs `Y.Map`. Drag, edit, delete. Everyone sees every change.
- **Rooms** — a random 7-character code in the URL hash. QR code for joining from a phone.
- **Optional encryption** — set a room password and y-webrtc encrypts wire traffic with XSalsa20.

## How to join

1. Open the URL.
2. Either click **Start a new room** or paste a room code or scan a QR.
3. Share the URL/QR with anyone you want in the room.

The room code is in the URL hash (`#r=ABCDEFG`), so refreshing keeps you in the room. The room password (if any) is also in the hash (`&k=...`), which means it's never sent to any server.

## Self-hosted infrastructure

CursorParty has no backend of its own. Signaling and TURN relay are provided by the maintainer's small open-source stack on a single Hetzner VPS at `turn.0docker.com`:

| Repo                                                                   | Endpoint                               | Purpose                             |
| ---------------------------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| [signaling-server](https://github.com/baditaflorin/signaling-server)   | `wss://turn.0docker.com/ws`            | y-webrtc protocol WebSocket fan-out |
| [turn-token-server](https://github.com/baditaflorin/turn-token-server) | `https://turn.0docker.com/credentials` | HMAC TURN creds, 1-hour TTL         |
| [coturn-hetzner](https://github.com/baditaflorin/coturn-hetzner)       | `turn:turn.0docker.com:3479`           | TURN relay                          |

The **Settings** panel lets you point CursorParty at your own deployment of these. If the infra is down, the app falls back to STUN-only with a warning banner (this works for ~70% of NAT pairs).

See [docs/self-hosted-infra.md](docs-src/self-hosted-infra.md) for the full integration pattern.

## Privacy & threat model

Read [docs/privacy.md](docs-src/privacy.md). Short version:

- Anyone with the room code can see cursors and notes.
- Anyone with the room code AND password can read encrypted wire traffic.
- The maintainer's signaling server sees: room code, peer count, encrypted blobs (when password is set), or plaintext awareness/CRDT updates (when no password).
- The TURN relay sees: DTLS-encrypted WebRTC streams. It cannot decrypt them.

There is no authentication, no user accounts, no logs of room contents anywhere.

## Develop

```
npm install
npm run dev
```

Open <http://localhost:5173>. Open the same URL in a second browser window to test peer-to-peer.

## Build for GitHub Pages

```
npm run build
```

Outputs to `docs/`. Commit `docs/` and GitHub Pages serves it. There is no GitHub Actions workflow — the build runs locally, gated by the pre-commit hook (`npm run fmt:check && npm run typecheck && npm run smoke`).

## Reference apps copied from

- [anon-conf-poll](https://github.com/baditaflorin/anon-conf-poll) — `turnConfig.ts`, signaling URL handling, the `+` → `_` lz-string swap (CursorParty doesn't currently need it but the pattern is loaded), the Settings panel pattern.
- [meshtrack-studio](https://github.com/baditaflorin/meshtrack-studio) — Yjs awareness for ephemeral per-peer state.

## License

MIT.
