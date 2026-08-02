#!/usr/bin/env node
// Regression test for the shared-notes CRDT correctness fixes:
//   1. A malformed/adversarial value written into the `notes` Y.Map by any
//      peer (nothing validates writes at runtime -- Y.Map<StickyNote> is a
//      compile-time-only type) must never crash the render pipeline.
//   2. Deleting a note that another peer is concurrently editing must
//      resolve deterministically (same outcome on every peer) instead of
//      always resurrecting the note with the concurrent edit's content.
//
// Bundles the real src/lib/yjsRoom.ts with esbuild (already a transitive
// devDependency via vite) so this exercises the actual shipped logic, not a
// reimplementation. No new dependencies added. Run with `node
// scripts/crdt-regression.mjs`.

import { strict as assert } from "node:assert";
import { buildSync } from "esbuild";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import * as Y from "yjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
// Build inside the repo (not the system tmpdir) so plain Node ESM resolution
// of the un-bundled `y-webrtc` import can still walk up to this repo's
// node_modules.
const scratchDir = path.join(repoRoot, "node_modules", ".crdt-regression-scratch");
mkdirSync(scratchDir, { recursive: true });
const outDir = mkdtempSync(path.join(scratchDir, "build-"));
const outFile = path.join(outDir, "yjsRoom.bundle.mjs");

buildSync({
  entryPoints: [path.join(repoRoot, "src/lib/yjsRoom.ts")],
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "browser",
  // y-webrtc / WebrtcProvider isn't needed for the pure helpers under test
  // and pulls in browser-only APIs (RTCPeerConnection, etc). Leave both
  // external: y-webrtc so the bundle can be evaluated under plain Node, and
  // yjs so the bundled code shares the exact same Yjs module instance as
  // this test script (two separate copies would trip Yjs's own
  // cross-instance sanity warning and could mask instanceof-based bugs).
  external: ["y-webrtc", "yjs"],
});

const { isValidStickyNote, visibleNotes } = await import(outFile);

function sync(...docs) {
  for (let round = 0; round < 2; round++) {
    for (const a of docs) {
      for (const b of docs) {
        if (a === b) continue;
        Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
      }
    }
  }
}

function makeNote(overrides) {
  return {
    id: "n1",
    x: 0.1,
    y: 0.1,
    text: "hello",
    color: "red",
    authorId: "A",
    createdAt: 1,
    ...overrides,
  };
}

// --- Test 1: basic 3-way convergence on concurrent note creation ---
{
  const a = new Y.Doc();
  const b = new Y.Doc();
  const c = new Y.Doc();
  a.getMap("notes").set("n1", makeNote({ id: "n1", authorId: "A", createdAt: 1 }));
  b.getMap("notes").set("n2", makeNote({ id: "n2", authorId: "B", createdAt: 2 }));
  c.getMap("notes").set("n3", makeNote({ id: "n3", authorId: "C", createdAt: 3 }));
  sync(a, b, c);

  const va = visibleNotes(a.getMap("notes"));
  const vb = visibleNotes(b.getMap("notes"));
  const vc = visibleNotes(c.getMap("notes"));
  assert.equal(va.length, 3, "peer A should see all 3 notes");
  assert.deepEqual(
    va.map((n) => n.id),
    vb.map((n) => n.id),
    "peers A and B must converge on the same note set/order",
  );
  assert.deepEqual(
    vb.map((n) => n.id),
    vc.map((n) => n.id),
    "peers B and C must converge on the same note set/order",
  );
  console.log("[ok] concurrent creation converges across peers");
}

// --- Test 2: delete-vs-concurrent-edit race resolves deterministically ---
// (the classic Y.Map CRDT bug: Map#delete() unconditionally loses to any
// concurrent set() on the same key, so a real delete() would always
// resurrect the note with the concurrent editor's content. Soft-delete via
// set({..., deleted: true}) makes it a normal concurrent-write conflict,
// resolved the same deterministic way on every peer.)
{
  const a = new Y.Doc();
  const b = new Y.Doc();
  const na = a.getMap("notes");
  const nb = b.getMap("notes");
  na.set("x1", makeNote({ id: "x1", text: "original" }));
  sync(a, b);

  // Peer A deletes (tombstones); peer B concurrently edits, unaware.
  const existingOnA = na.get("x1");
  na.set("x1", { ...existingOnA, deleted: true });
  nb.set("x1", { ...nb.get("x1"), text: "B edited concurrently" });

  sync(a, b);

  const va = visibleNotes(a.getMap("notes"));
  const vb = visibleNotes(b.getMap("notes"));
  assert.deepEqual(
    va,
    vb,
    "both peers must converge on the identical visible-notes result",
  );
  console.log(
    "[ok] delete-vs-concurrent-edit converges identically on both peers " +
      `(outcome: ${va.length === 0 ? "tombstoned" : "edit kept"}, same on both sides)`,
  );
}

// --- Test 3: adversarial/malformed peer payloads never crash the reader ---
{
  const a = new Y.Doc();
  const na = a.getMap("notes");
  na.set("good", makeNote({ id: "good" }));
  na.set("adv-null", null);
  na.set("adv-string", "not a note");
  na.set("adv-number", 42);
  na.set("adv-missing-fields", { noXFieldAtAll: true });
  na.set(
    "adv-wrong-types",
    makeNote({
      id: "adv-wrong-types",
      x: NaN,
      createdAt: "not-a-number",
      authorId: null,
    }),
  );

  assert.equal(isValidStickyNote(null), false);
  assert.equal(isValidStickyNote("not a note"), false);
  assert.equal(isValidStickyNote({ noXFieldAtAll: true }), false);

  let threw = false;
  let list;
  try {
    list = visibleNotes(na);
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "visibleNotes() must not throw on adversarial map contents");
  assert.deepEqual(
    list.map((n) => n.id),
    ["good"],
    "only the well-formed note should survive filtering",
  );
  console.log("[ok] adversarial/malformed peer payloads are filtered out, not a crash");
}

console.log("\nAll CRDT regression checks passed.");

rmSync(scratchDir, { recursive: true, force: true });
