import {
  FUZZY_PERIODS,
  type DiningEvent,
  type EntityId,
  type Station,
  type StationTime,
} from './types';

const PERIOD_RANK = new Map(FUZZY_PERIODS.map((period, index) => [period, index]));

export function minutesFromExact(value: { time: string; dayOffset: number }): number {
  const [hour = 0, minute = 0] = value.time.split(':').map(Number);
  return value.dayOffset * 1440 + hour * 60 + minute;
}

export function formatStationTime(time: StationTime): string {
  if (time.kind === 'pending') return '待定';
  if (time.kind === 'fuzzy') return time.period;
  const suffix = time.dayOffset > 0 ? ` · 第${time.dayOffset + 1}天` : '';
  return `${time.time}${suffix}`;
}

export function formatStationTimeRange(station: Pick<Station, 'start' | 'end'>): string {
  if (!station.end) return formatStationTime(station.start);
  const startLabel =
    station.start.kind === 'exact'
      ? station.start.time
      : station.start.kind === 'fuzzy'
        ? station.start.period
        : '待定';
  const startDayOffset = station.start.kind === 'exact' ? station.start.dayOffset : 0;

  if (startDayOffset === station.end.dayOffset) {
    const daySuffix = startDayOffset > 0 ? ` · 第${startDayOffset + 1}天` : '';
    return `${startLabel}–${station.end.time}${daySuffix}`;
  }

  const startDaySuffix = startDayOffset > 0 ? ` · 第${startDayOffset + 1}天` : '';
  const endDaySuffix = station.end.dayOffset > 0 ? ` · 第${station.end.dayOffset + 1}天` : '';
  return `${startLabel}${startDaySuffix}–${station.end.time}${endDaySuffix}`;
}

export function autoSortStations(stations: Station[]): {
  itinerary: EntityId[];
  unscheduled: EntityId[];
} {
  const pending = stations
    .filter((station) => station.start.kind === 'pending')
    .map((station) => station.id);
  const scheduled = stations
    .map((station, index) => ({ station, index }))
    .filter(({ station }) => station.start.kind !== 'pending')
    .sort((a, b) => {
      const left = a.station.start;
      const right = b.station.start;
      if (left.kind === 'exact' && right.kind === 'exact')
        return minutesFromExact(left) - minutesFromExact(right) || a.index - b.index;
      if (left.kind === 'exact') return -1;
      if (right.kind === 'exact') return 1;
      if (left.kind === 'pending') return 1;
      if (right.kind === 'pending') return -1;
      return (
        (PERIOD_RANK.get(left.period) ?? 99) - (PERIOD_RANK.get(right.period) ?? 99) ||
        a.index - b.index
      );
    })
    .map(({ station }) => station.id);
  return { itinerary: scheduled, unscheduled: pending };
}

export function fillSortableUnscheduledStations(
  event: Pick<DiningEvent, 'stations' | 'itinerary' | 'unscheduledStationIds'>,
): {
  itinerary: EntityId[];
  unscheduledStationIds: EntityId[];
  insertedStationIds: EntityId[];
} {
  const stationsById = new Map(event.stations.map((station) => [station.id, station]));
  const sortableStations = event.unscheduledStationIds
    .map((id) => stationsById.get(id))
    .filter((station): station is Station => Boolean(station && station.start.kind !== 'pending'));
  const sortedIds = autoSortStations(sortableStations).itinerary;
  const sortedIdSet = new Set(sortedIds);
  const existingIdSet = new Set(event.itinerary);
  const insertedStationIds = sortedIds.filter((id) => !existingIdSet.has(id));

  return {
    itinerary: [...event.itinerary, ...insertedStationIds],
    unscheduledStationIds: event.unscheduledStationIds.filter((id) => !sortedIdSet.has(id)),
    insertedStationIds,
  };
}

export interface ScheduleConflict {
  fromStationId: EntityId;
  toStationId: EntityId;
  lateByMinutes: number;
}

export function scheduleConflicts(event: DiningEvent): ScheduleConflict[] {
  const stations = new Map(event.stations.map((station) => [station.id, station]));
  const routes = new Map(
    event.routes.map((route) => [`${route.fromStationId}>${route.toStationId}`, route]),
  );
  const conflicts: ScheduleConflict[] = [];
  for (let index = 0; index < event.itinerary.length - 1; index += 1) {
    const from = stations.get(event.itinerary[index]);
    const to = stations.get(event.itinerary[index + 1]);
    if (!from?.end || to?.start.kind !== 'exact') continue;
    const route = routes.get(`${from.id}>${to.id}`);
    if (!route?.durationMinutes) continue;
    const available = minutesFromExact(to.start) - minutesFromExact(from.end);
    if (available < route.durationMinutes)
      conflicts.push({
        fromStationId: from.id,
        toStationId: to.id,
        lateByMinutes: route.durationMinutes - available,
      });
  }
  return conflicts;
}
