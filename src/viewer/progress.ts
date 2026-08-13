import type { DiningEvent, EntityId, ViewerState } from '../domain/types';
import { minutesFromExact } from '../domain/time';

export function inferCurrentStation(
  event: DiningEvent,
  state: ViewerState,
  now = new Date(),
): EntityId | undefined {
  if (state.currentStationId && event.itinerary.includes(state.currentStationId))
    return state.currentStationId;
  if (event.date && event.date === now.toISOString().slice(0, 10)) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const exactStations = event.itinerary
      .map((id) => event.stations.find((station) => station.id === id))
      .filter((station) => station?.start.kind === 'exact');
    const current = exactStations.find((station) => {
      if (!station || station.start.kind !== 'exact' || station.start.dayOffset !== 0) return false;
      const start = minutesFromExact(station.start);
      const end =
        station.end && station.end.dayOffset === 0 ? minutesFromExact(station.end) : undefined;
      return nowMinutes >= start && (end === undefined || nowMinutes <= end);
    });
    if (current) return current.id;
  }
  return event.itinerary.find((id) => !state.arrivedStationIds.includes(id));
}
