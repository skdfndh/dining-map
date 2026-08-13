import type { Coordinate, RouteGeometryPoint, TransportMode } from '../domain/types';

export interface PlaceCandidate {
  name: string;
  address: string;
  coordinate: Coordinate;
  poiId?: string;
}
export interface MapPickTarget {
  coordinate: Coordinate;
  hotspot?: Pick<PlaceCandidate, 'name' | 'poiId' | 'coordinate'>;
}
export interface AreaCenterResult {
  lng: number;
  lat: number;
}
export interface RouteRequest {
  origin: Coordinate;
  destination: Coordinate;
  mode: TransportMode;
  city?: string;
}
export interface RouteResult {
  distanceMeters: number;
  durationMinutes: number;
  geometry: RouteGeometryPoint[];
}

export interface MapService {
  searchPlaces(keyword: string, city?: string): Promise<PlaceCandidate[]>;
  enrichHotspot(hotspot: NonNullable<MapPickTarget['hotspot']>): Promise<PlaceCandidate>;
  reverseGeocode(coordinate: Coordinate): Promise<PlaceCandidate>;
  calculateRoute(request: RouteRequest): Promise<RouteResult>;
  resolveAreaCenter(keyword: string): Promise<AreaCenterResult>;
}
