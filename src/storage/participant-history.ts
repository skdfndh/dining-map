import { pinyin } from 'pinyin-pro';
import { createId } from '../domain/id';
import type { Participant } from '../domain/types';

export const PARTICIPANT_HISTORY_STORAGE_KEY = 'dining-map:participant-history';
export const MAX_PARTICIPANT_HISTORY = 200;

export interface ParticipantHistoryEntry {
  name: string;
  note?: string;
  lastUsedAt: number;
}

export function createParticipantFromHistory(entry: ParticipantHistoryEntry): Participant {
  return { id: createId('person'), name: entry.name, note: entry.note };
}

function normalizeText(value: string, maxLength: number): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function participantHistoryKey(value: Pick<Participant, 'name' | 'note'>): string {
  return `${normalizeText(value.name, 80).toLocaleLowerCase()}\u0000${normalizeText(value.note ?? '', 120).toLocaleLowerCase()}`;
}

export function participantHistoryInitial(name: string): string {
  const normalized = normalizeText(name, 80);
  if (!normalized) return '#';
  const firstPinyin = pinyin(normalized[0], { toneType: 'none', type: 'array' })[0] ?? '';
  const initial = firstPinyin[0]?.toUpperCase() ?? '';
  return /^[A-Z]$/.test(initial) ? initial : '#';
}

function participantSortKey(name: string): string {
  return pinyin(normalizeText(name, 80), { toneType: 'none', type: 'array' })
    .join('')
    .toLocaleLowerCase();
}

export function sortParticipantHistory(
  entries: ParticipantHistoryEntry[],
): ParticipantHistoryEntry[] {
  return [...entries].sort((left, right) => {
    const leftInitial = participantHistoryInitial(left.name);
    const rightInitial = participantHistoryInitial(right.name);
    if (leftInitial === '#' && rightInitial !== '#') return 1;
    if (rightInitial === '#' && leftInitial !== '#') return -1;
    return (
      leftInitial.localeCompare(rightInitial) ||
      participantSortKey(left.name).localeCompare(participantSortKey(right.name)) ||
      left.name.localeCompare(right.name, 'zh-CN') ||
      (left.note ?? '').localeCompare(right.note ?? '', 'zh-CN')
    );
  });
}

function sanitizeEntry(value: unknown): ParticipantHistoryEntry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== 'string') return undefined;
  const name = normalizeText(record.name, 80);
  if (!name || name === '新参与人') return undefined;
  const note = typeof record.note === 'string' ? normalizeText(record.note, 120) : '';
  const lastUsedAt =
    typeof record.lastUsedAt === 'number' && Number.isFinite(record.lastUsedAt)
      ? Math.max(0, record.lastUsedAt)
      : 0;
  return { name, note: note || undefined, lastUsedAt };
}

export function mergeParticipantHistory(
  current: unknown[],
  participants: Array<Pick<Participant, 'name' | 'note'>>,
  now = Date.now(),
): ParticipantHistoryEntry[] {
  const entries = new Map<string, ParticipantHistoryEntry>();
  current.forEach((value) => {
    const entry = sanitizeEntry(value);
    if (!entry) return;
    const key = participantHistoryKey(entry);
    const previous = entries.get(key);
    if (!previous || previous.lastUsedAt < entry.lastUsedAt) entries.set(key, entry);
  });
  participants.forEach((value) => {
    const entry = sanitizeEntry({ ...value, lastUsedAt: now });
    if (entry) entries.set(participantHistoryKey(entry), entry);
  });
  const newest = [...entries.values()]
    .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
    .slice(0, MAX_PARTICIPANT_HISTORY);
  return sortParticipantHistory(newest);
}

export function loadParticipantHistory(): ParticipantHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(PARTICIPANT_HISTORY_STORAGE_KEY) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return mergeParticipantHistory(parsed.slice(0, MAX_PARTICIPANT_HISTORY), [], 0);
  } catch {
    return [];
  }
}

export function saveParticipantHistory(entries: ParticipantHistoryEntry[]): void {
  try {
    localStorage.setItem(
      PARTICIPANT_HISTORY_STORAGE_KEY,
      JSON.stringify(mergeParticipantHistory(entries, [], 0).slice(0, MAX_PARTICIPANT_HISTORY)),
    );
  } catch {
    // Participant editing remains usable when storage is blocked or full.
  }
}
