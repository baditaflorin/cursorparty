import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { fetchIceServers, loadSignalingUrls, type TurnState } from "./turnConfig";

export type StickyNote = {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  authorId: string;
  createdAt: number;
  // Tombstone flag. We never call Y.Map#delete on a note key: deleting a key
  // outright loses to any concurrent set() from another peer (Yjs Map
  // "add wins" semantics), which silently resurrects a note that a peer just
  // deleted the instant someone else was mid-edit. Marking `deleted: true`
  // via set() instead means a delete-vs-edit race is resolved by the same
  // last-writer-wins rule as any other concurrent edit -- deterministic and
  // identical across peers, instead of edits unconditionally beating deletes.
  deleted?: boolean;
};

/**
 * Runtime shape check for values read out of the shared `notes` Y.Map.
 *
 * The map is typed `Y.Map<StickyNote>` at the TypeScript level only --
 * nothing enforces that shape at runtime. Any connected peer (malicious,
 * buggy, or just running a mismatched build) can write an arbitrary value
 * for any key, and Yjs will happily merge and broadcast it. Without this
 * guard, a peer writing e.g. `null` or `{}` for a note key crashes every
 * other peer's render pipeline (`note.createdAt - other.createdAt`,
 * `note.x * width`, etc. on a non-conforming value).
 */
export function isValidStickyNote(value: unknown): value is StickyNote {
  if (!value || typeof value !== "object") return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === "string" &&
    typeof n.x === "number" &&
    Number.isFinite(n.x) &&
    typeof n.y === "number" &&
    Number.isFinite(n.y) &&
    typeof n.text === "string" &&
    typeof n.color === "string" &&
    typeof n.authorId === "string" &&
    typeof n.createdAt === "number" &&
    Number.isFinite(n.createdAt)
  );
}

/** Notes that should actually be rendered: well-formed and not tombstoned. */
export function visibleNotes(notes: Y.Map<StickyNote>): StickyNote[] {
  const out: StickyNote[] = [];
  notes.forEach((value) => {
    if (isValidStickyNote(value) && !value.deleted) out.push(value);
  });
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export type CursorState = {
  x: number;
  y: number;
  name: string;
  color: string;
};

export type Room = {
  doc: Y.Doc;
  provider: WebrtcProvider;
  notes: Y.Map<StickyNote>;
  turnState: TurnState;
  signalingUrl: string;
  destroy: () => void;
};

export async function joinRoom(
  roomCode: string,
  password: string | undefined,
): Promise<Room> {
  const turnState = await fetchIceServers();
  const signalingUrls = loadSignalingUrls();

  const doc = new Y.Doc();
  const notes = doc.getMap<StickyNote>("notes");

  // y-webrtc encrypts wire traffic to the signaling server with the password
  // (XSalsa20). Peers without the password cannot read room contents.
  const provider = new WebrtcProvider(`cursorparty:${roomCode}`, doc, {
    signaling: signalingUrls,
    password: password || undefined,
    peerOpts: { config: { iceServers: turnState.iceServers } },
    maxConns: 24,
  });

  return {
    doc,
    provider,
    notes,
    turnState,
    signalingUrl: signalingUrls[0],
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
  };
}
