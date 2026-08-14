import type { Station } from '../domain/types';
import { formatStationTimeRange } from '../domain/time';

export function createStationMarkerContent(
  station: Station,
  index: number,
  current = false,
  past = false,
): HTMLButtonElement {
  const content = document.createElement('button');
  const sequence = index >= 0 ? String(index + 1) : '待';
  content.type = 'button';
  content.className = `amap-table-marker ${current ? 'is-current' : ''} ${past ? 'is-past' : ''}`;

  const number = document.createElement('b');
  number.textContent = sequence;
  const time = document.createElement('span');
  time.textContent = formatStationTimeRange(station);
  const name = document.createElement('strong');
  name.textContent = station.shortName;
  content.append(number, time, name);
  content.setAttribute(
    'aria-label',
    index >= 0 ? `第${index + 1}站 ${station.shortName}` : `待安排站点 ${station.shortName}`,
  );
  return content;
}
