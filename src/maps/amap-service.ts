import { loadAmap } from './amap-loader';
import type { MapPickTarget, MapService, PlaceCandidate, RouteRequest, RouteResult } from './types';

function plugin(sdk: Awaited<ReturnType<typeof loadAmap>>, name: string): Promise<void> {
  return new Promise((resolve) => sdk.plugin(name, resolve));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function mapReverseGeocodeResult(
  raw: unknown,
  coordinate: PlaceCandidate['coordinate'],
): PlaceCandidate {
  const regeocode = asRecord(asRecord(raw).regeocode);
  const poi = asRecord(asArray(regeocode.pois)[0]);
  const road = asRecord(asArray(regeocode.roads)[0]);
  const address = String(regeocode.formattedAddress ?? '');
  const name = String(poi.name ?? road.name ?? address).trim();
  return {
    name: name || '新地点',
    address,
    poiId: poi.id ? String(poi.id) : undefined,
    coordinate,
  };
}

function geometryFromNode(
  value: unknown,
  seen = new Set<object>(),
): { lng: number; lat: number }[] {
  if (Array.isArray(value)) return value.flatMap((item) => geometryFromNode(item, seen));
  if (typeof value !== 'object' || value === null || seen.has(value)) return [];
  seen.add(value);
  const record = asRecord(value);
  const path = asArray(record.path)
    .map((point) => {
      const item = asRecord(point);
      const lng =
        typeof item.lng === 'number'
          ? item.lng
          : Number((point as { getLng?: () => number }).getLng?.());
      const lat =
        typeof item.lat === 'number'
          ? item.lat
          : Number((point as { getLat?: () => number }).getLat?.());
      return { lng, lat };
    })
    .filter((point) => Number.isFinite(point.lng) && Number.isFinite(point.lat));
  if (path.length) return path;
  return Object.values(record).flatMap((item) => geometryFromNode(item, seen));
}

export function parseAmapRouteResult(result: unknown): {
  geometry: { lng: number; lat: number }[];
  distance: number;
  duration: number;
} {
  const root = asRecord(result);
  const routes = asArray(root.routes ?? root.plans);
  const first = asRecord(routes[0]);
  const steps = asArray(first.steps ?? first.rides ?? first.segments);
  const geometry = geometryFromNode(steps);
  const distance = Number(
    first.distance ??
      steps.reduce<number>((sum, step) => sum + Number(asRecord(step).distance ?? 0), 0),
  );
  const duration = Number(
    first.time ??
      first.duration ??
      steps.reduce<number>((sum, step) => sum + Number(asRecord(step).time ?? 0), 0),
  );
  return { geometry, distance, duration };
}

export class AmapService implements MapService {
  async enrichHotspot(hotspot: NonNullable<MapPickTarget['hotspot']>): Promise<PlaceCandidate> {
    if (!hotspot.poiId) return { ...hotspot, address: '' };
    const sdk = await loadAmap();
    await plugin(sdk, 'AMap.PlaceSearch');
    const search = new sdk.PlaceSearch({});
    return new Promise((resolve) =>
      search.getDetails(hotspot.poiId!, (status, raw) => {
        if (status !== 'complete') {
          resolve({ ...hotspot, address: '' });
          return;
        }
        const poi = asRecord(asArray(asRecord(asRecord(raw).poiList).pois)[0]);
        resolve({
          name: hotspot.name,
          address: String(poi.address ?? ''),
          poiId: hotspot.poiId,
          coordinate: hotspot.coordinate,
        });
      }),
    );
  }

  async reverseGeocode(coordinate: PlaceCandidate['coordinate']): Promise<PlaceCandidate> {
    const sdk = await loadAmap();
    await plugin(sdk, 'AMap.Geocoder');
    const geocoder = new sdk.Geocoder({ radius: 500, extensions: 'all' });
    return new Promise((resolve, reject) =>
      geocoder.getAddress([coordinate.lng, coordinate.lat], (status, raw) => {
        if (status !== 'complete') {
          reject(new Error('暂时无法识别这个位置，请手动填写地点名称和地址'));
          return;
        }
        resolve(mapReverseGeocodeResult(raw, coordinate));
      }),
    );
  }

  async resolveAreaCenter(keyword: string): Promise<{ lng: number; lat: number }> {
    const sdk = await loadAmap();
    await plugin(sdk, 'AMap.DistrictSearch');
    const search = new sdk.DistrictSearch({ level: 'district', subdistrict: 0 });
    return new Promise((resolve, reject) =>
      search.search(keyword, (status, raw) => {
        const district = asRecord(asArray(asRecord(raw).districtList)[0]);
        const center = district.center as
          { lng?: number; lat?: number; getLng?: () => number; getLat?: () => number } | undefined;
        const lng = Number(center?.lng ?? center?.getLng?.());
        const lat = Number(center?.lat ?? center?.getLat?.());
        if (status !== 'complete' || !Number.isFinite(lng) || !Number.isFinite(lat)) {
          reject(new Error('暂时无法定位该行政区'));
          return;
        }
        resolve({ lng, lat });
      }),
    );
  }

  async searchPlaces(keyword: string, city?: string): Promise<PlaceCandidate[]> {
    const sdk = await loadAmap();
    await plugin(sdk, 'AMap.PlaceSearch');
    const search = new sdk.PlaceSearch({
      city: city || '全国',
      citylimit: Boolean(city),
      pageSize: 10,
    });
    return new Promise((resolve, reject) =>
      search.search(keyword, (status, raw) => {
        if (status !== 'complete') {
          reject(new Error('未找到匹配地点'));
          return;
        }
        const result = asRecord(raw);
        const poiList = asRecord(result.poiList);
        const pois = asArray(poiList.pois);
        resolve(
          pois
            .map((poi) => {
              const item = asRecord(poi);
              const location = asRecord(item.location);
              return {
                name: String(item.name ?? ''),
                address: String(item.address ?? item.pname ?? ''),
                poiId: item.id ? String(item.id) : undefined,
                coordinate: {
                  lng: Number(
                    location.lng ?? (item.location as { getLng?: () => number })?.getLng?.(),
                  ),
                  lat: Number(
                    location.lat ?? (item.location as { getLat?: () => number })?.getLat?.(),
                  ),
                  system: 'GCJ02' as const,
                },
              };
            })
            .filter(
              (poi) => Number.isFinite(poi.coordinate.lng) && Number.isFinite(poi.coordinate.lat),
            ),
        );
      }),
    );
  }

  async calculateRoute(request: RouteRequest): Promise<RouteResult> {
    if (request.mode === 'custom') throw new Error('自定义交通无需自动算路');
    const sdk = await loadAmap();
    const pluginName =
      request.mode === 'walking'
        ? 'AMap.Walking'
        : request.mode === 'cycling'
          ? 'AMap.Riding'
          : request.mode === 'transit'
            ? 'AMap.Transfer'
            : 'AMap.Driving';
    await plugin(sdk, pluginName);
    const Constructor =
      request.mode === 'walking'
        ? sdk.Walking
        : request.mode === 'cycling'
          ? sdk.Riding
          : request.mode === 'transit'
            ? sdk.Transfer
            : sdk.Driving;
    const service = new Constructor(
      request.mode === 'transit' ? { city: request.city, cityd: request.city } : {},
    );
    return new Promise((resolve, reject) =>
      service.search(
        [request.origin.lng, request.origin.lat],
        [request.destination.lng, request.destination.lat],
        (status, raw) => {
          if (status !== 'complete') {
            reject(new Error('高德未返回可用路线'));
            return;
          }
          const parsed = parseAmapRouteResult(raw);
          if (parsed.geometry.length < 2) {
            reject(new Error('高德未返回可用的道路折线'));
            return;
          }
          resolve({
            distanceMeters: Math.round(parsed.distance),
            durationMinutes: Math.max(1, Math.round(parsed.duration / 60)),
            geometry: parsed.geometry,
          });
        },
      ),
    );
  }
}
