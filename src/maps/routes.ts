import { createId } from '../domain/id';
import type { DiningEvent, RouteSegment, Station, TransportMode } from '../domain/types';
import type { MapService } from './types';

export function routeIdentity(from: Station, to: Station, mode: TransportMode): string {
  return `${from.id}@${from.coordinate.lng.toFixed(6)},${from.coordinate.lat.toFixed(6)}>${to.id}@${to.coordinate.lng.toFixed(6)},${to.coordinate.lat.toFixed(6)}:${mode}`;
}

function samePoint(
  left: { lng: number; lat: number },
  right: { lng: number; lat: number },
): boolean {
  return left.lng === right.lng && left.lat === right.lat;
}

function isLegacyEndpointLine(route: RouteSegment, from: Station, to: Station): boolean {
  return (
    route.status === 'ready' &&
    route.geometry.length === 2 &&
    samePoint(route.geometry[0], from.coordinate) &&
    samePoint(route.geometry[1], to.coordinate)
  );
}

export function reconcileRoutes(
  event: DiningEvent,
  defaultMode: TransportMode = 'walking',
): RouteSegment[] {
  const stations = new Map(event.stations.map((station) => [station.id, station]));
  const existing = new Map(event.routes.map((route) => [route.identityKey, route]));
  const routes: RouteSegment[] = [];
  for (let index = 0; index < event.itinerary.length - 1; index += 1) {
    const from = stations.get(event.itinerary[index]);
    const to = stations.get(event.itinerary[index + 1]);
    if (!from || !to) continue;
    const priorByEndpoints = event.routes.find(
      (route) => route.fromStationId === from.id && route.toStationId === to.id,
    );
    const mode = priorByEndpoints?.mode ?? defaultMode;
    const key = routeIdentity(from, to, mode);
    routes.push(
      existing.has(key) && !isLegacyEndpointLine(existing.get(key)!, from, to)
        ? existing.get(key)!
        : {
            id: createId('route'),
            fromStationId: from.id,
            toStationId: to.id,
            mode,
            identityKey: key,
            status: 'stale',
            geometry: [
              { lng: from.coordinate.lng, lat: from.coordinate.lat },
              { lng: to.coordinate.lng, lat: to.coordinate.lat },
            ],
          },
    );
  }
  return routes;
}

export async function recalculateRoute(
  event: DiningEvent,
  routeId: string,
  service: MapService,
): Promise<RouteSegment> {
  const route = event.routes.find((item) => item.id === routeId);
  if (!route) throw new Error('未找到路线');
  const from = event.stations.find((item) => item.id === route.fromStationId);
  const to = event.stations.find((item) => item.id === route.toStationId);
  if (!from || !to) throw new Error('路线端点不存在');
  if (route.mode === 'custom')
    return {
      ...route,
      status: 'fallback',
      geometry: [
        { lng: from.coordinate.lng, lat: from.coordinate.lat },
        { lng: to.coordinate.lng, lat: to.coordinate.lat },
      ],
    };
  try {
    const result = await service.calculateRoute({
      origin: from.coordinate,
      destination: to.coordinate,
      mode: route.mode,
      city: event.city,
    });
    if (result.geometry.length < 2) throw new Error('地图服务未返回有效道路折线');
    return {
      ...route,
      ...result,
      status: 'ready',
      calculatedAt: new Date().toISOString(),
      identityKey: routeIdentity(from, to, route.mode),
    };
  } catch {
    return {
      ...route,
      status: 'fallback',
      geometry: [
        { lng: from.coordinate.lng, lat: from.coordinate.lat },
        { lng: to.coordinate.lng, lat: to.coordinate.lat },
      ],
    };
  }
}

export async function recalculateStaleRoutes(
  event: DiningEvent,
  service: MapService,
): Promise<RouteSegment[]> {
  return Promise.all(
    event.routes.map((route) =>
      route.status === 'stale' && route.mode !== 'custom'
        ? recalculateRoute(event, route.id, service)
        : route,
    ),
  );
}
