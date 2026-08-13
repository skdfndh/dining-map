export const SCHEMA_VERSION = 1 as const;
export const FUZZY_PERIODS = ['清晨', '上午', '中午', '下午', '傍晚', '晚上', '深夜'] as const;

export type EntityId = string;
export type FuzzyPeriod = (typeof FUZZY_PERIODS)[number];
export type SettlementStatus = 'not_started' | 'organizing' | 'completed';
export type TransportMode = 'walking' | 'cycling' | 'driving' | 'taxi' | 'transit' | 'custom';

export type StationTime =
  | { kind: 'exact'; time: string; dayOffset: number }
  | { kind: 'fuzzy'; period: FuzzyPeriod }
  | { kind: 'pending' };

export interface Coordinate {
  lng: number;
  lat: number;
  system: 'GCJ02';
}

export interface AdministrativeArea {
  province: string;
  provinceCode: string;
  city: string;
  cityCode: string;
  district?: string;
  districtCode?: string;
  center?: Coordinate;
}

export interface Participant {
  id: EntityId;
  name: string;
  note?: string;
}

export interface Station {
  id: EntityId;
  shortName: string;
  name: string;
  address: string;
  coordinate: Coordinate;
  poiId?: string;
  sourceUrl?: string;
  start: StationTime;
  end?: { time: string; dayOffset: number };
  activity?: string;
  participantIds: EntityId[];
  reminder?: string;
}

export interface RouteGeometryPoint {
  lng: number;
  lat: number;
}

export interface RouteSegment {
  id: EntityId;
  fromStationId: EntityId;
  toStationId: EntityId;
  mode: TransportMode;
  identityKey: string;
  status: 'ready' | 'stale' | 'fallback';
  distanceMeters?: number;
  durationMinutes?: number;
  geometry: RouteGeometryPoint[];
  calculatedAt?: string;
  manualDescription?: string;
}

export type AllocationMode =
  'equal' | 'weighted' | 'custom' | 'fixed_then_equal' | 'fixed_then_weighted';

export interface AllocationRule {
  mode: AllocationMode;
  includedParticipantIds: EntityId[];
  weights?: Record<EntityId, number>;
  customCents?: Record<EntityId, number>;
  fixedCents?: Record<EntityId, number>;
}

export interface PaymentRecord {
  participantId: EntityId;
  amountCents: number;
}

export interface Expense {
  id: EntityId;
  name: string;
  scope: { kind: 'global' } | { kind: 'station'; stationId: EntityId };
  amountCents: number | null;
  allocation: AllocationRule;
  payments: PaymentRecord[];
  note?: string;
}

export interface DiningEvent {
  schemaVersion: typeof SCHEMA_VERSION;
  id: EntityId;
  title: string;
  date?: string;
  city?: string;
  area?: AdministrativeArea;
  intro?: string;
  settlementStatus: SettlementStatus;
  participants: Participant[];
  stations: Station[];
  itinerary: EntityId[];
  unscheduledStationIds: EntityId[];
  routes: RouteSegment[];
  expenses: Expense[];
  updatedAt: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  entityId?: EntityId;
}

export interface ViewerState {
  participantId?: EntityId;
  currentStationId?: EntityId;
  arrivedStationIds: EntityId[];
  mode: 'overview' | 'step';
  focusedStationId?: EntityId;
}
