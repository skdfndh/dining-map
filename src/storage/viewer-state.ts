import type { ViewerState } from '../domain/types';

const defaultState: ViewerState = { arrivedStationIds: [], mode: 'overview' };

export function viewerStateKey(eventId: string): string {
  return `dining-map:viewer:${eventId}`;
}

export function loadViewerState(eventId: string): ViewerState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(viewerStateKey(eventId)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...defaultState };
    const value = parsed as Record<string, unknown>;
    return {
      participantId: typeof value.participantId === 'string' ? value.participantId : undefined,
      currentStationId:
        typeof value.currentStationId === 'string' ? value.currentStationId : undefined,
      arrivedStationIds: Array.isArray(value.arrivedStationIds)
        ? [...new Set(value.arrivedStationIds.filter((id): id is string => typeof id === 'string'))]
        : [],
      mode: value.mode === 'step' ? 'step' : 'overview',
      focusedStationId:
        typeof value.focusedStationId === 'string' ? value.focusedStationId : undefined,
    };
  } catch {
    return { ...defaultState };
  }
}

export function saveViewerState(eventId: string, state: ViewerState): void {
  try {
    localStorage.setItem(viewerStateKey(eventId), JSON.stringify(state));
  } catch {
    // Viewing remains usable when storage is blocked or full.
  }
}
