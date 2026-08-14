import AMapLoader from '@amap/amap-jsapi-loader';

export interface AMapSdk {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMap;
  Marker: new (options: Record<string, unknown>) => AMapOverlay;
  Polyline: new (options: Record<string, unknown>) => AMapOverlay;
  Pixel: new (x: number, y: number) => unknown;
  plugin(names: string | string[], callback: () => void): void;
  PlaceSearch: new (options?: Record<string, unknown>) => AMapPlaceSearch;
  Walking: new (options?: Record<string, unknown>) => AMapRouteSearch;
  Riding: new (options?: Record<string, unknown>) => AMapRouteSearch;
  Driving: new (options?: Record<string, unknown>) => AMapRouteSearch;
  Transfer: new (options?: Record<string, unknown>) => AMapRouteSearch;
  DistrictSearch: new (options?: Record<string, unknown>) => AMapDistrictSearch;
  Geocoder: new (options?: Record<string, unknown>) => AMapGeocoder;
}

export interface AMapMap {
  add(items: AMapOverlay | AMapOverlay[]): void;
  remove(items: AMapOverlay | AMapOverlay[]): void;
  clearMap(): void;
  destroy(): void;
  resize(): void;
  setFitView(items?: AMapOverlay[], immediately?: boolean, avoid?: number[]): void;
  setZoomAndCenter(zoom: number, center: [number, number]): void;
  on(
    event: string,
    handler: (event: {
      lnglat?: { getLng(): number; getLat(): number };
      name?: string;
      id?: string;
    }) => void,
  ): void;
}

export interface AMapOverlay {
  on(event: string, handler: () => void): void;
}
interface AMapPlaceSearch {
  search(keyword: string, callback: (status: string, result: unknown) => void): void;
  getDetails(id: string, callback: (status: string, result: unknown) => void): void;
}
interface AMapRouteSearch {
  search(
    origin: [number, number],
    destination: [number, number],
    callback: (status: string, result: unknown) => void,
  ): void;
}
interface AMapDistrictSearch {
  search(keyword: string, callback: (status: string, result: unknown) => void): void;
}
interface AMapGeocoder {
  getAddress(
    coordinate: [number, number],
    callback: (status: string, result: unknown) => void,
  ): void;
}

let sdkPromise: Promise<AMapSdk> | undefined;

export function hasAmapConfig(): boolean {
  return Boolean(import.meta.env.VITE_AMAP_KEY && import.meta.env.VITE_AMAP_SECURITY_CODE);
}

export async function loadAmap(): Promise<AMapSdk> {
  if (!hasAmapConfig()) throw new Error('地图服务尚未配置，请在 .env.local 中填写高德 Web 端凭据');
  if (!sdkPromise) {
    window._AMapSecurityConfig = { securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE ?? '' };
    sdkPromise = AMapLoader.load({
      key: import.meta.env.VITE_AMAP_KEY ?? '',
      version: '2.0',
      plugins: [],
    }) as Promise<AMapSdk>;
  }
  try {
    return await sdkPromise;
  } catch {
    sdkPromise = undefined;
    throw new Error('地图暂时无法加载，请检查网络和高德域名配置');
  }
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}
