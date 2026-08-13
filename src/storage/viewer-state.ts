import type { ViewerState } from '../domain/types';

const defaultState: ViewerState = { arrivedStationIds: [], mode: 'overview' };

export function viewerStateKey(eventId: string): string {
  return `dining-map:viewer:${eventId}`;
}

export function loadViewerState(eventId: string): ViewerState {
  try {
    return {
      ...defaultState,
      ...JSON.parse(localStorage.getItem(viewerStateKey(eventId)) ?? '{}'),
    };
  } catch {
    return { ...defaultState };
  }
}

export function saveViewerState(eventId: string, state: ViewerState): void {
  localStorage.setItem(viewerStateKey(eventId), JSON.stringify(state));
}
