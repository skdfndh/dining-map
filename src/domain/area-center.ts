import areaCenters from './area-centers.json';
import type { AdministrativeArea, Coordinate } from './types';

const centers = areaCenters as unknown as Record<string, [number, number]>;

export function resolveOfflineAreaCenter(area: AdministrativeArea): Coordinate | undefined {
  const codes = [area.districtCode, area.cityCode, area.provinceCode];
  for (const code of codes) {
    if (!code) continue;
    const center = centers[code];
    if (center) return { lng: center[0], lat: center[1], system: 'GCJ02' };
  }
  return undefined;
}
