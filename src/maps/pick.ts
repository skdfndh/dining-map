import type { MapPickTarget, MapService, PlaceCandidate } from './types';

export function createHotspotTracker() {
  let current: MapPickTarget['hotspot'];
  return {
    enter(hotspot: NonNullable<MapPickTarget['hotspot']>) {
      current = hotspot;
    },
    leave() {
      current = undefined;
    },
    get current() {
      return current;
    },
  };
}

export async function resolveMapPickTarget(
  service: MapService,
  target: MapPickTarget,
): Promise<PlaceCandidate> {
  return target.hotspot
    ? service.enrichHotspot(target.hotspot)
    : service.reverseGeocode(target.coordinate);
}
