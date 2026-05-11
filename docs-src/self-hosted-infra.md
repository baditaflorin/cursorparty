# Self-hosted infrastructure

CursorParty is a static site. It has no backend of its own. Peer-to-peer connectivity is provided by three independently deployable open-source services on a single Hetzner VPS at `turn.0docker.com`.

```
┌───────────────────────────────┐
│ CursorParty (this app)        │
│ GitHub Pages, no backend      │
└──────────┬─────────┬──────────┘
           │         │
   wss://  │         │ https://
  signaling│         │ TURN creds
           ▼         ▼
   ┌──────────┐  ┌──────────┐    turn:3479
   │signaling │  │turn-token│  ┌───────────┐
   │ -server  │  │ -server  │  │  coturn   │
   └──────────┘  └────┬─────┘  │ -hetzner  │
                      │HMAC    └───────────┘
                      └─shared secret──┘
```

## Services

| Repo                                                                                | Endpoint                               | What it does                                                                                                                                                                                |
| ----------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [baditaflorin/signaling-server](https://github.com/baditaflorin/signaling-server)   | `wss://turn.0docker.com/ws`            | y-webrtc protocol WebSocket fan-out. Clients subscribe to a topic (room name), publish JSON blobs, server rebroadcasts to every other subscriber. Inspects nothing inside the `data` field. |
| [baditaflorin/turn-token-server](https://github.com/baditaflorin/turn-token-server) | `https://turn.0docker.com/credentials` | Issues time-limited HMAC-SHA1 credentials (1-hour TTL). Shared secret never leaves the server. Returns `{username, password, ttl, uris}`.                                                   |
| [baditaflorin/coturn-hetzner](https://github.com/baditaflorin/coturn-hetzner)       | `turn:turn.0docker.com:3479` UDP/TCP   | The actual TURN relay. `coturn 4.6` in Docker with `--use-auth-secret`. UDP relay ports 49152–65535.                                                                                        |

All three have `/health`, Prometheus `/metrics`, nginx example configs, and bootstrap scripts. Total cost: ~4 €/month on a Hetzner CX22 running all three side-by-side.

## How to use your own

The Settings panel exposes two fields backed by `localStorage`:

- `cursorparty:signalingUrl` — defaults to `wss://turn.0docker.com/ws`
- `cursorparty:turnTokenUrl` — defaults to `https://turn.0docker.com/credentials`

Override either to point CursorParty at your own deployment. Reload after changing.

Build-time defaults can be set via env vars:

```sh
VITE_WEBRTC_SIGNALING=wss://your.example/ws \
VITE_TURN_TOKEN_URL=https://your.example/credentials \
  npm run build
```

## Fallback behaviour

If the TURN token endpoint is unreachable or `cursorparty:turnTokenUrl` is empty, the app falls back to STUN-only. A warning banner appears in the UI. STUN-only works for ~70% of NAT pairs; symmetric NAT and most mobile carrier networks need TURN.

If the signaling server is unreachable, peers cannot discover each other. There is no client-side fallback for signaling; switch to a different signaling URL in Settings.

## Reference apps on the same stack

- [anon-conf-poll](https://github.com/baditaflorin/anon-conf-poll) — anonymous live polling with Semaphore proofs. The canonical Yjs implementation of this stack.
- [meshtrack-studio](https://github.com/baditaflorin/meshtrack-studio) — collaborative browser DAW.
- [pockettalkie](https://github.com/baditaflorin/pockettalkie) — encrypted push-to-talk rooms (sibling app).
- [tagboard](https://github.com/baditaflorin/tagboard) — AprilTag-anchored AR sticky notes (sibling app).
