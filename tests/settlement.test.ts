import { describe, expect, it } from 'vitest';
import { createSampleEvent } from '../src/domain/sample';
import { calculateExpense, calculateSettlement } from '../src/settlement/calculate';
import { formatYuan, parseYuan } from '../src/settlement/money';

describe('settlement', () => {
  it('parses money as integer cents', () => {
    expect(parseYuan('￥1,234.50')).toBe(123450);
    expect(formatYuan(-123450)).toBe('-¥1234.50');
    expect(() => parseYuan('1.234')).toThrow();
  });

  it('uses a deterministic largest remainder', () => {
    const calculation = calculateExpense({
      id: 'e',
      name: 'test',
      scope: { kind: 'global' },
      amountCents: 100,
      allocation: { mode: 'equal', includedParticipantIds: ['a', 'b', 'c'] },
      payments: [{ participantId: 'a', amountCents: 100 }],
    });
    expect(calculation.shares).toEqual({ a: 34, b: 33, c: 33 });
    expect(calculation.unallocatedCents).toBe(0);
  });

  it('tracks custom unallocated cents', () => {
    const calculation = calculateExpense({
      id: 'e',
      name: 'test',
      scope: { kind: 'global' },
      amountCents: 30000,
      allocation: { mode: 'custom', includedParticipantIds: ['a'], customCents: { a: 25000 } },
      payments: [],
    });
    expect(calculation.unallocatedCents).toBe(5000);
    expect(calculation.unpaidCents).toBe(30000);
  });

  it('supports multiple payers and balanced compact transfers', () => {
    const event = createSampleEvent();
    event.expenses = [
      {
        id: 'e',
        name: 'dinner',
        scope: { kind: 'global' },
        amountCents: 60000,
        allocation: {
          mode: 'equal',
          includedParticipantIds: ['p_lin', 'p_zhou', 'p_wang', 'p_chen'],
        },
        payments: [
          { participantId: 'p_lin', amountCents: 40000 },
          { participantId: 'p_zhou', amountCents: 20000 },
        ],
      },
    ];
    const result = calculateSettlement(event);
    expect(result.complete).toBe(true);
    expect(result.transfers.reduce((sum, transfer) => sum + transfer.amountCents, 0)).toBe(30000);
  });
});
