import { openDB } from 'idb';
import type { DiningEvent } from '../domain/types';

const DB_NAME = 'dining-map-editor';
const STORE = 'drafts';

async function database() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
}

export async function saveDraft(event: DiningEvent): Promise<void> {
  const db = await database();
  const current = await db.get(STORE, 'current');
  if (current) await db.put(STORE, current, 'snapshot');
  await db.put(STORE, structuredClone(event), 'current');
}

export async function loadDraft(): Promise<DiningEvent | undefined> {
  return (await database()).get(STORE, 'current');
}

export async function loadSnapshot(): Promise<DiningEvent | undefined> {
  return (await database()).get(STORE, 'snapshot');
}

export async function savePreviousEvent(event: DiningEvent): Promise<void> {
  await (await database()).put(STORE, structuredClone(event), 'previous-event');
}

export async function loadPreviousEvent(): Promise<DiningEvent | undefined> {
  return (await database()).get(STORE, 'previous-event');
}

export async function clearDraft(): Promise<void> {
  const db = await database();
  await db.clear(STORE);
}

export function createDraftAutosaver(delayMs = 500) {
  let timer: number | undefined;
  return (event: DiningEvent, onStatus: (status: 'saving' | 'saved' | 'error') => void) => {
    if (timer) window.clearTimeout(timer);
    onStatus('saving');
    timer = window.setTimeout(() => {
      saveDraft(event)
        .then(() => onStatus('saved'))
        .catch(() => onStatus('error'));
    }, delayMs);
  };
}
