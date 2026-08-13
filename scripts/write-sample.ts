import { writeFile } from 'node:fs/promises';
import { createSampleEvent } from '../src/domain/sample';
import { exportEventJson } from '../src/export/data';

await writeFile(
  new URL('../public/event.json', import.meta.url),
  exportEventJson(createSampleEvent()),
  'utf8',
);
