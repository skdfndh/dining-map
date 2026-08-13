import type { DiningEvent, EntityId } from './types';

export function createId(prefix: string): EntityId {
  const random =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

export function duplicateIds(event: DiningEvent): EntityId[] {
  const ids = [
    event.id,
    ...event.participants.map((item) => item.id),
    ...event.stations.map((item) => item.id),
    ...event.routes.map((item) => item.id),
    ...event.expenses.map((item) => item.id),
  ];
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  ids.forEach((id) => (seen.has(id) ? duplicates.add(id) : seen.add(id)));
  return [...duplicates];
}
