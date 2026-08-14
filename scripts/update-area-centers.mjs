import { writeFile } from 'node:fs/promises';

const sourceCommit = '5822c4c0a0bdfd73327f9454976c8661bfd6ad9f';
const sourceRoot = `https://raw.githubusercontent.com/Supeset/China-GeoData/${sourceCommit}/geojson`;
const sourceFiles = ['china_province_full.geojson', 'china_province_city_full.geojson'];
const centers = {};

for (const sourceFile of sourceFiles) {
  const response = await fetch(`${sourceRoot}/${sourceFile}`);
  if (!response.ok) throw new Error(`Failed to download ${sourceFile}: ${response.status}`);
  const collection = await response.json();
  for (const feature of collection.features ?? []) {
    const code = String(feature.properties?.adcode ?? '');
    const center = feature.properties?.center;
    if (!/^\d{6}$/.test(code) || !Array.isArray(center) || center.length < 2) continue;
    const lng = Number(center[0]);
    const lat = Number(center[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    centers[code] = [lng, lat];
  }
}

const ordered = Object.fromEntries(
  Object.entries(centers).sort(([left], [right]) => left.localeCompare(right)),
);
await writeFile(
  new URL('../src/domain/area-centers.json', import.meta.url),
  `${JSON.stringify(ordered, null, 2)}\n`,
  'utf8',
);
console.log(`Wrote ${Object.keys(ordered).length} administrative centers.`);
