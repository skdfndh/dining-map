import { describe, expect, it } from 'vitest';
import { duplicateIds } from '../src/domain/id';
import { parseEvent, validateEvent } from '../src/domain/schema';
import { createBlankEvent, createSampleEvent } from '../src/domain/sample';
import {
  autoSortStations,
  fillSortableUnscheduledStations,
  formatStationTime,
  formatStationTimeRange,
  scheduleConflicts,
} from '../src/domain/time';
import { buildArea, citiesFor, districtsFor } from '../src/domain/areas';

describe('event domain', () => {
  it('creates independent blank dining activities', () => {
    const first = createBlankEvent();
    const second = createBlankEvent();
    expect(first.id).not.toBe(second.id);
    expect(first.title).toBe('');
    expect(first.stations).toEqual([]);
    expect(first.expenses).toEqual([]);
  });

  it('builds linked province, city and optional district values', () => {
    expect(citiesFor('440000').find((item) => item.label === '广州市')?.value).toBe('440100');
    expect(districtsFor('440000', '440100').some((item) => item.label === '天河区')).toBe(true);
    expect(buildArea('310000', '310100', '310104')).toMatchObject({
      province: '上海市',
      city: '上海市',
      district: '徐汇区',
    });
  });

  it('round trips a valid event and rejects future versions', () => {
    const event = createSampleEvent();
    expect(parseEvent(JSON.parse(JSON.stringify(event))).id).toBe(event.id);
    const legacy = { ...event, area: undefined };
    expect(parseEvent(JSON.parse(JSON.stringify(legacy))).city).toBe('上海');
    expect(() => parseEvent({ ...event, schemaVersion: 99 })).toThrow('版本过新');
  });

  it('detects duplicate stable ids', () => {
    const event = createSampleEvent();
    event.participants[1].id = event.participants[0].id;
    expect(duplicateIds(event)).toEqual([event.participants[0].id]);
  });

  it('sorts exact and fuzzy times and leaves pending stations out', () => {
    const event = createSampleEvent();
    const result = autoSortStations(event.stations);
    expect(result.itinerary).toEqual(['s_cafe', 's_ktv', 's_hotpot']);
    expect(result.unscheduled).toEqual(['s_river']);
    expect(formatStationTime({ kind: 'exact', time: '01:00', dayOffset: 1 })).toContain('第2天');
  });

  it('formats optional station end times for compact map markers', () => {
    expect(
      formatStationTimeRange({
        start: { kind: 'exact', time: '14:30', dayOffset: 0 },
        end: { time: '16:30', dayOffset: 0 },
      }),
    ).toBe('14:30–16:30');
    expect(
      formatStationTimeRange({
        start: { kind: 'exact', time: '23:30', dayOffset: 0 },
        end: { time: '01:00', dayOffset: 1 },
      }),
    ).toBe('23:30–01:00 · 第2天');
    expect(formatStationTimeRange({ start: { kind: 'fuzzy', period: '下午' } })).toBe('下午');
  });

  it('appends sortable pending-area stations without changing the manual itinerary', () => {
    const event = createSampleEvent();
    event.itinerary = ['s_hotpot'];
    event.unscheduledStationIds = ['s_river', 's_ktv', 's_cafe'];

    const result = fillSortableUnscheduledStations(event);

    expect(result.itinerary).toEqual(['s_hotpot', 's_cafe', 's_ktv']);
    expect(result.unscheduledStationIds).toEqual(['s_river']);
    expect(result.insertedStationIds).toEqual(['s_cafe', 's_ktv']);
  });

  it('warns without blocking pending times', () => {
    const issues = validateEvent(createSampleEvent());
    expect(issues).toContainEqual(
      expect.objectContaining({ severity: 'warning', code: 'TIME_PENDING' }),
    );
  });

  it('requires an area for new activities but accepts legacy city data', () => {
    const blank = createBlankEvent();
    expect(validateEvent(blank).some((issue) => issue.code === 'AREA_REQUIRED')).toBe(true);
    expect(
      validateEvent({ ...blank, city: '上海' }).some((issue) => issue.code === 'AREA_REQUIRED'),
    ).toBe(false);
  });

  it('finds insufficient travel time', () => {
    const event = createSampleEvent();
    event.stations[0].end = { time: '14:20', dayOffset: 0 };
    event.stations[0].start = { kind: 'exact', time: '12:00', dayOffset: 0 };
    expect(scheduleConflicts(event)[0]?.lateByMinutes).toBe(12);
  });
});
