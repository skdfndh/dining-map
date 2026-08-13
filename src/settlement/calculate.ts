import type { DiningEvent, EntityId, Expense } from '../domain/types';

export interface ExpenseCalculation {
  expenseId: EntityId;
  shares: Record<EntityId, number>;
  paid: Record<EntityId, number>;
  unallocatedCents: number;
  unpaidCents: number;
}

export interface ParticipantTotal {
  participantId: EntityId;
  consumedCents: number;
  paidCents: number;
  netCents: number;
}
export interface Transfer {
  fromParticipantId: EntityId;
  toParticipantId: EntityId;
  amountCents: number;
}
export interface SettlementResult {
  expenseCalculations: ExpenseCalculation[];
  totals: ParticipantTotal[];
  transfers: Transfer[];
  complete: boolean;
}

function largestRemainder(
  amount: number,
  ids: EntityId[],
  weights: Record<EntityId, number>,
): Record<EntityId, number> {
  const result: Record<EntityId, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  if (amount <= 0 || ids.length === 0) return result;
  const totalWeight = ids.reduce((sum, id) => sum + Math.max(0, weights[id] ?? 0), 0);
  if (totalWeight <= 0) return result;
  const rows = ids.map((id, index) => {
    const exact = (amount * Math.max(0, weights[id] ?? 0)) / totalWeight;
    const floor = Math.floor(exact);
    result[id] = floor;
    return { id, remainder: exact - floor, index };
  });
  const remaining = amount - Object.values(result).reduce((sum, value) => sum + value, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) result[rows[index % rows.length].id] += 1;
  return result;
}

export function calculateExpense(expense: Expense): ExpenseCalculation {
  const amount = expense.amountCents;
  const paid = expense.payments.reduce<Record<EntityId, number>>((acc, payment) => {
    acc[payment.participantId] = (acc[payment.participantId] ?? 0) + payment.amountCents;
    return acc;
  }, {});
  if (amount === null)
    return { expenseId: expense.id, shares: {}, paid, unallocatedCents: 0, unpaidCents: 0 };
  const ids = expense.allocation.includedParticipantIds;
  let shares: Record<EntityId, number> = {};
  const fixed = expense.allocation.fixedCents ?? {};
  if (expense.allocation.mode === 'custom')
    shares = Object.fromEntries(ids.map((id) => [id, expense.allocation.customCents?.[id] ?? 0]));
  else if (expense.allocation.mode === 'equal')
    shares = largestRemainder(amount, ids, Object.fromEntries(ids.map((id) => [id, 1])));
  else if (expense.allocation.mode === 'weighted')
    shares = largestRemainder(amount, ids, expense.allocation.weights ?? {});
  else {
    const fixedTotal = Object.values(fixed).reduce((sum, value) => sum + value, 0);
    const flexibleIds = ids.filter((id) => fixed[id] === undefined);
    const remainder = Math.max(0, amount - fixedTotal);
    const weights =
      expense.allocation.mode === 'fixed_then_equal'
        ? Object.fromEntries(flexibleIds.map((id) => [id, 1]))
        : (expense.allocation.weights ?? {});
    shares = { ...fixed, ...largestRemainder(remainder, flexibleIds, weights) };
  }
  const allocated = Object.values(shares).reduce((sum, value) => sum + value, 0);
  const paidTotal = Object.values(paid).reduce((sum, value) => sum + value, 0);
  return {
    expenseId: expense.id,
    shares,
    paid,
    unallocatedCents: amount - allocated,
    unpaidCents: amount - paidTotal,
  };
}

export function compactTransfers(totals: ParticipantTotal[]): Transfer[] {
  const debtors = totals
    .filter((item) => item.netCents > 0)
    .map((item) => ({ id: item.participantId, amount: item.netCents }));
  const creditors = totals
    .filter((item) => item.netCents < 0)
    .map((item) => ({ id: item.participantId, amount: -item.netCents }));
  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0)
      transfers.push({
        fromParticipantId: debtor.id,
        toParticipantId: creditor.id,
        amountCents: amount,
      });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }
  return transfers;
}

export function calculateSettlement(event: DiningEvent): SettlementResult {
  const calculations = event.expenses.map(calculateExpense);
  const totalsMap = new Map(
    event.participants.map((participant) => [
      participant.id,
      { participantId: participant.id, consumedCents: 0, paidCents: 0, netCents: 0 },
    ]),
  );
  calculations.forEach((calculation) => {
    Object.entries(calculation.shares).forEach(([id, cents]) => {
      const total = totalsMap.get(id);
      if (total) total.consumedCents += cents;
    });
    Object.entries(calculation.paid).forEach(([id, cents]) => {
      const total = totalsMap.get(id);
      if (total) total.paidCents += cents;
    });
  });
  const totals = [...totalsMap.values()].map((total) => ({
    ...total,
    netCents: total.consumedCents - total.paidCents,
  }));
  const complete =
    event.expenses.every(
      (expense, index) =>
        expense.amountCents !== null &&
        calculations[index].unallocatedCents === 0 &&
        calculations[index].unpaidCents === 0,
    ) && totals.reduce((sum, total) => sum + total.netCents, 0) === 0;
  return {
    expenseCalculations: calculations,
    totals,
    transfers: complete ? compactTransfers(totals) : [],
    complete,
  };
}
