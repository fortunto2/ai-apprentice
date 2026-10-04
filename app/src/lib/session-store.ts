// One capture session: events, frames, transcript, Work Map. Persisted in IndexedDB so the
// Map and Teach pages can read it after a reload. Frames are JPEG data URLs (~40 KB each).

import type { Frame } from "./frame-capture";
import type { MasteryItem, ScreenEvent, TranscriptLine, WorkMap } from "./schemas";

export type Session = {
  id: string;
  startedAt: number;
  endedAt?: number;
  events: ScreenEvent[];
  frames: Frame[];
  transcript: TranscriptLine[];
  workMap?: WorkMap;
  mastery?: MasteryItem[];
};

const DB = "apprentice";
const STORE = "sessions";
const CURRENT = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function saveSession(session: Session, key = CURRENT) {
  const s = { ...session, frames: referencedFrames(session) };
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(s, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadSession(key = CURRENT): Promise<Session | null> {
  const db = await openDb();
  return new Promise((res, rej) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => res((req.result as Session) ?? null);
    req.onerror = () => rej(req.error);
  });
}

export { fmtT } from "./time";

// Only frames that an event or a Work Map step points at are ever shown again.
export function referencedFrames(s: Session): Frame[] {
  const ids = new Set<string>();
  for (const e of s.events) if (e.frameId) ids.add(e.frameId);
  for (const st of s.workMap?.steps ?? []) if (st.screenMoment.frameId) ids.add(st.screenMoment.frameId);
  return s.frames.filter((f) => ids.has(f.id));
}
