import { z } from 'zod';
import { duplicateIds } from './id';
import { scheduleConflicts } from './time';
import { SCHEMA_VERSION, type DiningEvent, type ValidationIssue } from './types';
import { calculateSettlement } from '../settlement/calculate';

const clockTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const exactTime = z.object({
  kind: z.literal('exact'),
  time: clockTime,
  dayOffset: z.number().int().nonnegative(),
});
const stationTime = z.discriminatedUnion('kind', [
  exactTime,
  z.object({
    kind: z.literal('fuzzy'),
    period: z.enum(['清晨', '上午', '中午', '下午', '傍晚', '晚上', '深夜']),
  }),
  z.object({ kind: z.literal('pending') }),
]);
const coordinate = z.object({
  lng: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90),
  system: z.literal('GCJ02'),
});
const administrativeArea = z.object({
  province: z.string(),
  provinceCode: z.string(),
  city: z.string(),
  cityCode: z.string(),
  district: z.string().optional(),
  districtCode: z.string().optional(),
  center: coordinate.optional(),
});
const participant = z.object({
  id: z.string().min(1),
  name: z.string(),
  note: z.string().optional(),
});
const station = z.object({
  id: z.string(),
  shortName: z.string(),
  name: z.string(),
  address: z.string(),
  coordinate,
  poiId: z.string().optional(),
  sourceUrl: z.string().optional(),
  start: stationTime,
  end: z.object({ time: clockTime, dayOffset: z.number().int().nonnegative() }).optional(),
  activity: z.string().optional(),
  participantIds: z.array(z.string()),
  reminder: z.string().optional(),
});
const route = z.object({
  id: z.string(),
  fromStationId: z.string(),
  toStationId: z.string(),
  mode: z.enum(['walking', 'cycling', 'driving', 'taxi', 'transit', 'custom']),
  identityKey: z.string(),
  status: z.enum(['ready', 'stale', 'fallback']),
  distanceMeters: z.number().finite().nonnegative().optional(),
  durationMinutes: z.number().finite().nonnegative().optional(),
  geometry: z.array(
    z.object({
      lng: z.number().finite().min(-180).max(180),
      lat: z.number().finite().min(-90).max(90),
    }),
  ),
  calculatedAt: z.string().optional(),
  manualDescription: z.string().optional(),
});
const expense = z.object({
  id: z.string(),
  name: z.string(),
  scope: z.union([
    z.object({ kind: z.literal('global') }),
    z.object({ kind: z.literal('station'), stationId: z.string() }),
  ]),
  amountCents: z.number().int().nonnegative().nullable(),
  allocation: z.object({
    mode: z.enum(['equal', 'weighted', 'custom', 'fixed_then_equal', 'fixed_then_weighted']),
    includedParticipantIds: z.array(z.string()),
    weights: z.record(z.number().finite().positive()).optional(),
    customCents: z.record(z.number().int().nonnegative()).optional(),
    fixedCents: z.record(z.number().int().nonnegative()).optional(),
  }),
  payments: z.array(
    z.object({ participantId: z.string(), amountCents: z.number().int().nonnegative() }),
  ),
  note: z.string().optional(),
});
const eventSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  title: z.string(),
  date: z.string().optional(),
  city: z.string().optional(),
  area: administrativeArea.optional(),
  intro: z.string().optional(),
  settlementStatus: z.enum(['not_started', 'organizing', 'completed']),
  participants: z.array(participant),
  stations: z.array(station),
  itinerary: z.array(z.string()),
  unscheduledStationIds: z.array(z.string()),
  routes: z.array(route),
  expenses: z.array(expense),
  updatedAt: z.string(),
});

export function parseEvent(input: unknown): DiningEvent {
  if (
    typeof input === 'object' &&
    input !== null &&
    'schemaVersion' in input &&
    Number((input as { schemaVersion: unknown }).schemaVersion) > SCHEMA_VERSION
  )
    throw new Error(`活动数据版本过新，当前仅支持版本 ${SCHEMA_VERSION}`);
  return eventSchema.parse(input) as DiningEvent;
}

export function validateEvent(event: DiningEvent): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!event.title.trim())
    issues.push({ severity: 'error', code: 'TITLE_REQUIRED', message: '活动名称不能为空' });
  if (!event.area?.provinceCode && !event.city)
    issues.push({
      severity: 'error',
      code: 'AREA_REQUIRED',
      message: '请选择活动所在省份和城市',
    });
  duplicateIds(event).forEach((id) =>
    issues.push({
      severity: 'error',
      code: 'DUPLICATE_ID',
      message: `内部编号重复：${id}`,
      entityId: id,
    }),
  );
  event.stations
    .filter((station) => station.start.kind === 'pending')
    .forEach((station) =>
      issues.push({
        severity: 'warning',
        code: 'TIME_PENDING',
        message: `${station.shortName || station.name} 的时间待定`,
        entityId: station.id,
      }),
    );
  event.routes
    .filter((route) => route.status !== 'ready')
    .forEach((route) =>
      issues.push({
        severity: 'warning',
        code: 'ROUTE_FALLBACK',
        message: '部分路线使用了直线或自定义交通',
        entityId: route.id,
      }),
    );
  scheduleConflicts(event).forEach((conflict) =>
    issues.push({
      severity: 'warning',
      code: 'SCHEDULE_CONFLICT',
      message: `相邻行程预计冲突 ${conflict.lateByMinutes} 分钟`,
      entityId: conflict.toStationId,
    }),
  );
  const settlement = calculateSettlement(event);
  if (event.settlementStatus === 'completed' && !settlement.complete)
    issues.push({
      severity: 'error',
      code: 'SETTLEMENT_INCOMPLETE',
      message: '费用、分摊或垫付尚未守恒，不能标记结算完成',
    });
  return issues;
}
