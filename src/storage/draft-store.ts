import { openDB } from 'idb';
import { parseEvent } from '../domain/schema';
import type { DiningEvent } from '../domain/types';

const DB_NAME = 'dining-map-editor';
const STORE = 'drafts';
const ACTIVITY_KEY_PREFIX = 'activity:';
const STORED_DRAFT_KIND = 'activity-draft';
export const MAX_SAVED_DRAFTS = 24;

interface StoredDraft {
  kind: typeof STORED_DRAFT_KIND;
  savedAt: number;
  event: DiningEvent;
}

interface DraftEntry {
  key: IDBValidKey;
  savedAt: number;
  event: DiningEvent;
}

export interface SavedDraftSummary {
  id: string;
  title: string;
  date?: string;
  area: string;
  participantCount: number;
  stationCount: number;
  savedAt: number;
}

async function database() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    },
  });
}

function safeEvent(value: unknown): DiningEvent | undefined {
  try {
    return parseEvent(value);
  } catch {
    return undefined;
  }
}

function draftEntry(key: IDBValidKey, value: unknown): DraftEntry | undefined {
  if (
    typeof key === 'string' &&
    key.startsWith(ACTIVITY_KEY_PREFIX) &&
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    const stored = value as Partial<StoredDraft>;
    if (stored.kind !== STORED_DRAFT_KIND) return undefined;
    const event = safeEvent(stored.event);
    if (!event) return undefined;
    return {
      key,
      event,
      savedAt:
        typeof stored.savedAt === 'number' && Number.isFinite(stored.savedAt)
          ? Math.max(0, stored.savedAt)
          : 0,
    };
  }
  if (key !== 'current' && key !== 'snapshot' && key !== 'previous-event') return undefined;
  const event = safeEvent(value);
  if (!event) return undefined;
  const updatedAt = Date.parse(event.updatedAt);
  return { key, event, savedAt: Number.isFinite(updatedAt) ? updatedAt : 0 };
}

async function readDraftEntries(): Promise<DraftEntry[]> {
  const db = await database();
  const keys = await db.getAllKeys(STORE);
  const values = await db.getAll(STORE);
  const byActivity = new Map<string, DraftEntry>();
  keys.forEach((key, index) => {
    const entry = draftEntry(key, values[index]);
    if (!entry) return;
    const previous = byActivity.get(entry.event.id);
    if (!previous || previous.savedAt < entry.savedAt) byActivity.set(entry.event.id, entry);
  });
  return [...byActivity.values()].sort(
    (left, right) =>
      right.savedAt - left.savedAt || left.event.title.localeCompare(right.event.title, 'zh-CN'),
  );
}

async function saveActivityDraft(event: DiningEvent, savedAt = Date.now()): Promise<void> {
  const db = await database();
  const stored: StoredDraft = {
    kind: STORED_DRAFT_KIND,
    savedAt,
    event: structuredClone(event),
  };
  await db.put(STORE, stored, `${ACTIVITY_KEY_PREFIX}${event.id}`);
  const activityKeys = (await db.getAllKeys(STORE)).filter(
    (key): key is string => typeof key === 'string' && key.startsWith(ACTIVITY_KEY_PREFIX),
  );
  if (activityKeys.length <= MAX_SAVED_DRAFTS) return;
  const activityDrafts = await Promise.all(
    activityKeys.map(async (key) => ({ key, entry: draftEntry(key, await db.get(STORE, key)) })),
  );
  await Promise.all(
    activityDrafts
      .sort((left, right) => (right.entry?.savedAt ?? 0) - (left.entry?.savedAt ?? 0))
      .slice(MAX_SAVED_DRAFTS)
      .map(({ key }) => db.delete(STORE, key)),
  );
}

export async function saveDraft(event: DiningEvent): Promise<void> {
  const db = await database();
  const current = safeEvent(await db.get(STORE, 'current'));
  if (current) await db.put(STORE, current, 'snapshot');
  await db.put(STORE, structuredClone(event), 'current');
  await saveActivityDraft(event);
}

export async function loadDraft(): Promise<DiningEvent | undefined> {
  return safeEvent(await (await database()).get(STORE, 'current'));
}

export async function loadSnapshot(): Promise<DiningEvent | undefined> {
  return safeEvent(await (await database()).get(STORE, 'snapshot'));
}

export async function savePreviousEvent(event: DiningEvent): Promise<void> {
  await (await database()).put(STORE, structuredClone(event), 'previous-event');
  await saveActivityDraft(event);
}

export async function loadPreviousEvent(): Promise<DiningEvent | undefined> {
  return safeEvent(await (await database()).get(STORE, 'previous-event'));
}

export async function listSavedDrafts(): Promise<SavedDraftSummary[]> {
  return (await readDraftEntries()).map(({ event, savedAt }) => ({
    id: event.id,
    title: event.title.trim() || '未命名聚餐',
    date: event.date,
    area: event.area
      ? [event.area.province, event.area.city, event.area.district].filter(Boolean).join(' · ')
      : event.city || '地区待定',
    participantCount: event.participants.length,
    stationCount: event.stations.length,
    savedAt,
  }));
}

export async function loadSavedDraft(eventId: string): Promise<DiningEvent | undefined> {
  const entry = (await readDraftEntries()).find(({ event }) => event.id === eventId);
  return entry ? structuredClone(entry.event) : undefined;
}

export async function deleteSavedDraft(eventId: string): Promise<void> {
  const db = await database();
  const current = safeEvent(await db.get(STORE, 'current'));
  if (current?.id === eventId) throw new Error('当前正在编辑的草稿不能删除');
  const keys = await db.getAllKeys(STORE);
  const values = await db.getAll(STORE);
  await Promise.all(
    keys.map((key, index) => {
      const entry = draftEntry(key, values[index]);
      return entry?.event.id === eventId ? db.delete(STORE, key) : Promise.resolve();
    }),
  );
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
