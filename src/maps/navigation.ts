import type { Station } from '../domain/types';

export function amapNavigationUrl(station: Station): string {
  const params = new URLSearchParams({
    from: '聚餐地图',
    sourceApplication: 'dining-map',
    pname: station.name,
    dlat: String(station.coordinate.lat),
    dlon: String(station.coordinate.lng),
    dev: '0',
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
