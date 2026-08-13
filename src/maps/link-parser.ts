import type { PlaceCandidate } from './types';

export interface LinkParseResult {
  candidate?: Partial<PlaceCandidate>;
  sourceUrl: string;
  fallbackRequired: boolean;
}

export function parseMapShareLink(raw: string): LinkParseResult {
  const sourceUrl = raw.trim();
  try {
    const url = new URL(sourceUrl);
    const lngRaw =
      url.searchParams.get('longitude') ??
      url.searchParams.get('lng') ??
      url.searchParams.get('lon');
    const latRaw = url.searchParams.get('latitude') ?? url.searchParams.get('lat');
    const lng = lngRaw === null || lngRaw === '' ? Number.NaN : Number(lngRaw);
    const lat = latRaw === null || latRaw === '' ? Number.NaN : Number(latRaw);
    const name =
      url.searchParams.get('name') ??
      url.searchParams.get('poiname') ??
      url.searchParams.get('title') ??
      '';
    const address = url.searchParams.get('address') ?? url.searchParams.get('addr') ?? '';
    if (Number.isFinite(lng) && Number.isFinite(lat))
      return {
        sourceUrl,
        fallbackRequired: false,
        candidate: { name, address, coordinate: { lng, lat, system: 'GCJ02' } },
      };
    return { sourceUrl, fallbackRequired: true, candidate: name ? { name, address } : undefined };
  } catch {
    return { sourceUrl, fallbackRequired: true };
  }
}
