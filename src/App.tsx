import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JoinScreen } from "./components/JoinScreen";
import { ShareCard } from "./components/ShareCard";
import { Settings } from "./components/Settings";
import { makeLocalUser, type LocalUser } from "./lib/identity";
import {
  buildShareUrl,
  readPasswordFromUrl,
  readRoomFromUrl,
  writeUrlHash,
} from "./lib/room";
import { joinRoom, type Room, type StickyNote } from "./lib/yjsRoom";

type Status = "disconnected" | "connecting" | "online" | "alone";

type PeerCursor = {
  clientId: number;
  x: number;
  y: number;
  name: string;
  color: string;
};

export default function App() {
  const [user] = useState<LocalUser>(() => makeLocalUser());
  const [roomCode, setRoomCode] = useState<string | null>(() => readRoomFromUrl());
  const [password, setPassword] = useState<string | undefined>(
    () => readPasswordFromUrl() ?? undefined,
  );
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [cursors, setCursors] = useState<PeerCursor[]>([]);
  const [peerCount, setPeerCount] = useState(0);
  const [turnWarning, setTurnWarning] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);

  // Join room when code is set
  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;
    let r: Room | null = null;
    setStatus("connecting");
    (async () => {
      r = await joinRoom(roomCode, password);
      if (cancelled) {
        r.destroy();
        return;
      }
      setRoom(r);
      writeUrlHash(roomCode, password);
      if (!r.turnState.hasRelay) {
        setTurnWarning(
          "TURN relay unavailable — falling back to STUN only. Cross-NAT may fail.",
        );
      }
      // Notes observer
      const sync = () => {
        const list = [...r!.notes.values()].sort((a, b) => a.createdAt - b.createdAt);
        setNotes(list);
      };
      sync();
      r.notes.observeDeep(sync);

      // Awareness for cursors
      const awareness = r.provider.awareness;
      awareness.setLocalStateField("user", {
        name: user.name,
        color: user.color,
        id: user.id,
      });
      const updateCursors = () => {
        const me = awareness.clientID;
        const states = awareness.getStates();
        const list: PeerCursor[] = [];
        states.forEach((state, clientId) => {
          if (clientId === me) return;
          const cursor = state.cursor as { x: number; y: number } | undefined;
          const u = state.user as { name: string; color: string } | undefined;
          if (cursor && u) {
            list.push({
              clientId,
              x: cursor.x,
              y: cursor.y,
              name: u.name,
              color: u.color,
            });
          }
        });
        setCursors(list);
        setPeerCount(states.size - 1); // exclude self
        setStatus(states.size > 1 ? "online" : "alone");
      };
      updateCursors();
      awareness.on("change", updateCursors);
    })().catch((err) => {
      console.error("[room] failed to join:", err);
      setStatus("disconnected");
    });

    return () => {
      cancelled = true;
      r?.destroy();
      setRoom(null);
      setCursors([]);
      setNotes([]);
      setPeerCount(0);
    };
  }, [roomCode, password, user]);

  // Pointer → awareness
  useEffect(() => {
    if (!room) return;
    const awareness = room.provider.awareness;
    let lastSent = 0;
    const onMove = (ev: PointerEvent) => {
      const now = performance.now();
      if (now - lastSent < 30) return;
      lastSent = now;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      awareness.setLocalStateField("cursor", { x, y });
    };
    const onLeave = () => awareness.setLocalStateField("cursor", null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [room]);

  const addNote = useCallback(
    (clientX: number, clientY: number) => {
      if (!room) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      const note: StickyNote = {
        id: crypto.randomUUID(),
        x,
        y,
        text: "",
        color: user.color,
        authorId: user.id,
        createdAt: Date.now(),
      };
      room.notes.set(note.id, note);
    },
    [room, user],
  );

  const updateNote = useCallback(
    (id: string, patch: Partial<StickyNote>) => {
      if (!room) return;
      const existing = room.notes.get(id);
      if (!existing) return;
      room.notes.set(id, { ...existing, ...patch });
    },
    [room],
  );

  const deleteNote = useCallback(
    (id: string) => {
      if (!room) return;
      room.notes.delete(id);
    },
    [room],
  );

  const shareUrl = useMemo(
    () => (roomCode ? buildShareUrl(roomCode, password) : ""),
    [roomCode, password],
  );

  function leaveRoom() {
    setRoomCode(null);
    setPassword(undefined);
    history.replaceState(null, "", window.location.pathname);
  }

  if (!roomCode) {
    return (
      <>
        <JoinScreen
          onJoin={(code, pw) => {
            setRoomCode(code);
            setPassword(pw);
          }}
        />
        <SettingsCornerButton onOpen={() => setShowSettings(true)} />
        {showSettings && <Settings onClose={() => setShowSettings(false)} />}
      </>
    );
  }

  return (
    <>
      <div
        ref={wrapRef}
        className="canvas-wrap"
        onDoubleClick={(e) => addNote(e.clientX, e.clientY)}
      >
        {notes.map((n) => (
          <Sticky
            key={n.id}
            note={n}
            wrapRef={wrapRef}
            onUpdate={(patch) => updateNote(n.id, patch)}
            onDelete={() => deleteNote(n.id)}
            isMine={n.authorId === user.id}
          />
        ))}
        {cursors.map((c) => (
          <Cursor key={c.clientId} cursor={c} wrapRef={wrapRef} />
        ))}
      </div>

      <div className="hud">
        <div className="panel" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span
            className={`status-dot ${
              status === "online" ? "ok" : status === "alone" ? "warn" : "bad"
            }`}
          />
          <span style={{ fontSize: 13 }}>
            {status === "online"
              ? `${peerCount} peer${peerCount === 1 ? "" : "s"}`
              : status === "alone"
                ? "alone"
                : status === "connecting"
                  ? "connecting…"
                  : "offline"}
          </span>
          <span style={{ fontSize: 12, color: "var(--fg-dim)" }}>
            room <strong style={{ color: "var(--fg)" }}>{roomCode}</strong>
          </span>
          <span style={{ fontSize: 12, color: user.color }}>{user.name}</span>
        </div>
      </div>

      {turnWarning && <div className="warning-banner">{turnWarning}</div>}

      <div className="toolbar">
        <button onClick={() => setShowShare(true)}>📤 Share</button>
        <button onClick={() => setShowSettings(true)}>⚙</button>
        <button onClick={leaveRoom}>← Leave</button>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 70,
          left: 12,
          fontSize: 11,
          color: "var(--fg-dim)",
          pointerEvents: "none",
        }}
      >
        double-click anywhere to drop a sticky
      </div>

      {showShare && (
        <ShareCard
          url={shareUrl}
          roomCode={roomCode}
          onClose={() => setShowShare(false)}
        />
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </>
  );
}

function SettingsCornerButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{ position: "fixed", bottom: 12, right: 12, zIndex: 5 }}
    >
      ⚙ Settings
    </button>
  );
}

function Cursor({
  cursor,
  wrapRef,
}: {
  cursor: PeerCursor;
  wrapRef: React.RefObject<HTMLDivElement | null>;
}) {
  const wrap = wrapRef.current;
  const rect = wrap?.getBoundingClientRect();
  if (!rect) return null;
  const px = cursor.x * rect.width;
  const py = cursor.y * rect.height;
  return (
    <div className="cursor" style={{ transform: `translate(${px}px, ${py}px)` }}>
      <div className="arrow" style={{ color: cursor.color }}>
        ➤
      </div>
      <div className="name" style={{ background: cursor.color }}>
        {cursor.name}
      </div>
    </div>
  );
}

function Sticky({
  note,
  wrapRef,
  onUpdate,
  onDelete,
  isMine,
}: {
  note: StickyNote;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  onUpdate: (patch: Partial<StickyNote>) => void;
  onDelete: () => void;
  isMine: boolean;
}) {
  const [editing, setEditing] = useState(note.text === "" && isMine);
  const [text, setText] = useState(note.text);
  const draggingRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  useEffect(() => {
    if (!editing) setText(note.text);
  }, [note.text, editing]);

  const wrap = wrapRef.current;
  const rect = wrap?.getBoundingClientRect();
  if (!rect) return null;
  const left = note.x * rect.width;
  const top = note.y * rect.height;

  function onPointerDown(ev: React.PointerEvent) {
    if (editing) return;
    if ((ev.target as HTMLElement).tagName === "BUTTON") return;
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    draggingRef.current = {
      offsetX: ev.clientX - left,
      offsetY: ev.clientY - top,
    };
  }

  function onPointerMove(ev: React.PointerEvent) {
    const d = draggingRef.current;
    const w = wrapRef.current;
    if (!d || !w) return;
    const r = w.getBoundingClientRect();
    const x = (ev.clientX - d.offsetX) / r.width;
    const y = (ev.clientY - d.offsetY) / r.height;
    onUpdate({ x: clamp01(x), y: clamp01(y) });
  }

  function onPointerUp(ev: React.PointerEvent) {
    (ev.target as HTMLElement).releasePointerCapture(ev.pointerId);
    draggingRef.current = null;
  }

  return (
    <div
      className="sticky"
      style={{
        left,
        top,
        borderTop: `4px solid ${note.color}`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isMine) setEditing(true);
      }}
    >
      {editing ? (
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setEditing(false);
            onUpdate({ text });
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditing(false);
              setText(note.text);
            }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              setEditing(false);
              onUpdate({ text });
            }
          }}
        />
      ) : (
        <div>{note.text || <em style={{ opacity: 0.5 }}>(empty)</em>}</div>
      )}
      <div className="sticky-actions">
        {isMine && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
