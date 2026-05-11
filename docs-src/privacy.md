# Privacy & threat model

CursorParty is anonymous and ephemeral by design. There is no signup, no user account, no identity persisted across sessions. Room state lives entirely in the browsers of connected peers.

## What other peers in your room see

- **Cursor position**, name, and colour (random per session).
- **Sticky notes** — text, position, author colour. Every note is visible to every peer.
- The y-webrtc peer ID assigned to your tab (random UUID, rotates each session).

There is no privacy _within_ a room — assume anything you put on the canvas is visible to everyone else with the room code.

## What the signaling server sees

The signaling server (`wss://turn.0docker.com/ws` by default) is a generic y-webrtc fan-out:

- The room topic (`cursorparty:<roomCode>`) — this is how it knows who to forward your messages to.
- Peer counts — implicit from the subscriber list.

**If you set a room password:** y-webrtc encrypts every WebRTC signalling message and CRDT update with XSalsa20 (via the libsodium-bound `cryptoutils` module) keyed on `PBKDF2(password)`. The server sees encrypted blobs and cannot read your notes, your cursor, or the SDP offers/answers.

**If you do not set a room password:** the server can read the SDP offers/answers and the Yjs CRDT updates. It cannot inject content into your room without solving for a colluding peer.

The signaling server does not log message bodies. The maintainer does not run any analytics on this stack.

## What the TURN relay sees

The TURN relay (`turn:turn.0docker.com:3479` by default) relays DTLS-encrypted WebRTC packets when peers cannot connect directly. The relay sees:

- Source and destination IPs of WebRTC peers it relays for.
- DTLS-encrypted bytes. It cannot decrypt the payload.

If you require zero metadata at the TURN relay, point Settings at your own coturn deployment.

## What the network sees

- An eavesdropper on your link to the signaling server sees TLS-encrypted WebSocket traffic (wss://).
- An eavesdropper between peers sees DTLS-encrypted WebRTC traffic — including the room password handshake (which is XSalsa20-encrypted with a key derived from the password before it reaches the wire).

## What we do not do

- No service worker — hard refresh always gets the latest code.
- No localStorage of room contents — only of endpoint preferences.
- No third-party analytics. No Sentry. No telemetry of any kind.
- No CDN-hosted scripts. Everything in the build is served from GitHub Pages.
- No identity persisted across sessions. Your name and colour are regenerated every page load.

## Caveats

- The room code is in your URL hash. URL hashes are not sent to servers, but browser sync features (Chrome Sync, iCloud Tabs) may sync your URL across your own devices.
- If you join a room without a password, you trust every other peer to behave. Any peer can broadcast forged Yjs updates that any peer will accept (this is the CRDT model — there is no admin).
- y-webrtc's password-based encryption is symmetric; the password is the gate. Anyone who has the password has full read/write access.
