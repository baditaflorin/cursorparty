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
};

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
