import type { Station } from '../domain/types';
import { formatStationTimeRange } from '../domain/time';

export function createStationMarkerContent(
  station: Station,
  index: number,
  current = false,
  past = false,
  identity?: 'mine' | 'not-mine',
): HTMLButtonElement {
  const content = document.createElement('button');
  const sequence = index >= 0 ? String(index + 1) : '待';
  content.type = 'button';
  content.className = `amap-table-marker ${current ? 'is-current' : ''} ${past ? 'is-past' : ''} ${identity === 'mine' ? 'is-mine' : identity === 'not-mine' ? 'not-mine' : ''}`;

  const number = document.createElement('b');
  number.textContent = sequence;
  const time = document.createElement('span');
  time.textContent = formatStationTimeRange(station);
  const name = document.createElement('strong');
  name.textContent = station.shortName;
  content.append(number, time, name);
  if (identity) {
    const badge = document.createElement('em');
    badge.className = 'identity-badge';
    badge.textContent = identity === 'mine' ? '有我' : '不参加';
    content.append(badge);
  }
  content.setAttribute(
    'aria-label',
    `${index >= 0 ? `第${index + 1}站 ${station.shortName}` : `待安排站点 ${station.shortName}`}${identity ? `，${identity === 'mine' ? '有我' : '不参加'}` : ''}`,
  );
  return content;
}
