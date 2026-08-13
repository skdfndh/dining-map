import type { AdministrativeArea } from './types';

import areaData from 'china-area-data';

export interface AreaOption {
  value: string;
  label: string;
}

const MUNICIPALITIES = new Set(['北京市', '天津市', '上海市', '重庆市']);
const ROOT_CODE = '86';
const data = areaData as Record<string, Record<string, string>>;

function options(code: string): AreaOption[] {
  return Object.entries(data[code] ?? {}).map(([value, label]) => ({ value, label }));
}

export const provinces = options(ROOT_CODE);

export function citiesFor(provinceCode?: string): AreaOption[] {
  if (!provinceCode) return [];
  const province = provinces.find((item) => item.value === provinceCode);
  if (!province) return [];
  const cities = options(provinceCode);
  if (MUNICIPALITIES.has(province.label))
    return cities.map((city) => ({ ...city, label: province.label }));
  return cities;
}

export function districtsFor(provinceCode?: string, cityCode?: string): AreaOption[] {
  if (!provinceCode || !cityCode) return [];
  return options(cityCode).filter((item) => item.label !== '市辖区');
}

export function buildArea(
  provinceCode: string,
  cityCode: string,
  districtCode?: string,
): AdministrativeArea | undefined {
  const province = provinces.find((item) => item.value === provinceCode);
  const city = citiesFor(provinceCode).find((item) => item.value === cityCode);
  if (!province || !city) return undefined;
  const district = districtsFor(provinceCode, cityCode).find((item) => item.value === districtCode);
  return {
    province: province.label,
    provinceCode,
    city: city.label,
    cityCode,
    district: district?.label,
    districtCode: district?.value,
  };
}

export function areaSearchName(area: AdministrativeArea): string {
  return `${area.province}${area.city === area.province ? '' : area.city}${area.district ?? ''}`;
}
