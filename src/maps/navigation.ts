import type { Station } from '../domain/types';

export function amapNavigationUrl(station: Station): string {
  const params = new URLSearchParams({
    from: '',
    to: `${station.coordinate.lng},${station.coordinate.lat},${station.name.replaceAll(',', ' ')}`,
    mode: 'car',
    policy: '0',
    src: 'dining-map',
    callnative: '1',
  });
  return `https://uri.amap.com/navigation?${params}`;
}

export function baiduNavigationUrl(station: Station): string {
  const params = new URLSearchParams({
    destination: `latlng:${station.coordinate.lat},${station.coordinate.lng}|name:${station.name}`,
    coord_type: 'gcj02',
    mode: 'driving',
    output: 'html',
    src: 'webapp.skdfndh.diningmap',
  });
  return `https://api.map.baidu.com/direction?${params}`;
}
