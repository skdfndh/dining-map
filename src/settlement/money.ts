export function parseYuan(value: string): number | null {
  const normalized = value.trim().replace(/[¥￥,，\s]/g, '');
  if (!normalized) return null;
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) throw new Error('金额最多保留两位小数');
  const [yuan, cents = ''] = normalized.split('.');
  return Number(yuan) * 100 + Number(cents.padEnd(2, '0'));
}

export function formatYuan(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}¥${(Math.abs(cents) / 100).toFixed(2)}`;
}
