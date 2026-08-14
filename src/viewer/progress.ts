import type { DiningEvent, EntityId, ViewerState } from '../domain/types';
import { minutesFromExact } from '../domain/time';

function calendarDayOffset(eventDate: string, now: Date): number {
  const [year, month, day] = eventDate.split('-').map(Number);
  const eventUtc = Date.UTC(year, month - 1, day);
  const nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((nowUtc - eventUtc) / 86_400_000);
}

export function inferCurrentStation(
  event: DiningEvent,
  state: ViewerState,
  now = new Date(),
): EntityId | undefined {
  if (state.currentStationId && event.itinerary.includes(state.currentStationId))
    return state.currentStationId;
  if (event.date) {
    const dayOffset = calendarDayOffset(event.date, now);
    const activeOffsets = new Set(
      event.stations.flatMap((station) => [
        station.start.kind === 'exact' ? station.start.dayOffset : 0,
        station.end?.dayOffset ?? 0,
      ]),
    );
    if (dayOffset < 0 || !activeOffsets.has(dayOffset)) return undefined;

    const nowMinutes = dayOffset * 1440 + now.getHours() * 60 + now.getMinutes();
    const current = event.itinerary
      .map((id) => event.stations.find((station) => station.id === id))
      .filter((station) => {
        if (!station || station.start.kind !== 'exact') return false;
        const start = minutesFromExact(station.start) + station.start.dayOffset * 1440;
        const end = station.end
          ? minutesFromExact(station.end) + station.end.dayOffset * 1440
          : (station.start.dayOffset + 1) * 1440 - 1;
        return nowMinutes >= start && nowMinutes <= end;
      })
      .sort((left, right) => {
        if (!left || left.start.kind !== 'exact') return -1;
        if (!right || right.start.kind !== 'exact') return 1;
        return (
          minutesFromExact(left.start) +
          left.start.dayOffset * 1440 -
          (minutesFromExact(right.start) + right.start.dayOffset * 1440)
        );
      })
      .at(-1);
    if (current) return current.id;
  }
  return event.itinerary.find((id) => !state.arrivedStationIds.includes(id));
}

export function sanitizeViewerState(event: DiningEvent, state: ViewerState): ViewerState {
  const participantIds = new Set(event.participants.map((person) => person.id));
  const stationIds = new Set(event.itinerary);
  return {
    participantId:
      state.participantId && participantIds.has(state.participantId)
        ? state.participantId
        : undefined,
    currentStationId:
      state.currentStationId && stationIds.has(state.currentStationId)
        ? state.currentStationId
        : undefined,
    arrivedStationIds: [...new Set(state.arrivedStationIds.filter((id) => stationIds.has(id)))],
    mode: state.mode,
    focusedStationId:
      state.focusedStationId && stationIds.has(state.focusedStationId)
        ? state.focusedStationId
        : undefined,
  };
}
