import type { DiningEvent } from '../domain/types';
import { parseEvent, validateEvent } from '../domain/schema';
import { calculateSettlement } from '../settlement/calculate';
import { formatYuan } from '../settlement/money';

export function importEventJson(text: string): DiningEvent {
  return parseEvent(JSON.parse(text));
}
export function exportEventJson(event: DiningEvent): string {
  return JSON.stringify({ ...event, updatedAt: new Date().toISOString() }, null, 2);
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportSettlementCsv(event: DiningEvent): string {
  const settlement = calculateSettlement(event);
  const participants = new Map(event.participants.map((item) => [item.id, item.name]));
  const rows: unknown[][] = [
    ['聚餐地图结算', event.title],
    ['结算状态', event.settlementStatus === 'completed' ? '最终' : '非最终'],
    [],
    ['姓名', '消费', '垫付', '净额', '结果'],
    ...settlement.totals.map((total) => [
      participants.get(total.participantId),
      formatYuan(total.consumedCents),
      formatYuan(total.paidCents),
      formatYuan(total.netCents),
      total.netCents > 0 ? '应付' : total.netCents < 0 ? '应收' : '已平衡',
    ]),
    [],
    ['转出人', '转入人', '金额'],
    ...settlement.transfers.map((transfer) => [
      participants.get(transfer.fromParticipantId),
      participants.get(transfer.toParticipantId),
      formatYuan(transfer.amountCents),
    ]),
  ];
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}

export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportSummary(event: DiningEvent) {
  return { issues: validateEvent(event), settlement: calculateSettlement(event) };
}
