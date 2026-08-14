import type { DiningEvent, EntityId } from './types';

function omitKey<T>(values: Record<EntityId, T> | undefined, id: EntityId) {
  if (!values || !(id in values)) return values;
  const next = { ...values };
  delete next[id];
  return next;
}

export function removeParticipant(event: DiningEvent, participantId: EntityId): DiningEvent {
  return {
    ...event,
    participants: event.participants.filter((person) => person.id !== participantId),
    stations: event.stations.map((station) => ({
      ...station,
      participantIds: station.participantIds.filter((id) => id !== participantId),
    })),
    expenses: event.expenses.map((expense) => ({
      ...expense,
      allocation: {
        ...expense.allocation,
        includedParticipantIds: expense.allocation.includedParticipantIds.filter(
          (id) => id !== participantId,
        ),
        weights: omitKey(expense.allocation.weights, participantId),
        customCents: omitKey(expense.allocation.customCents, participantId),
        fixedCents: omitKey(expense.allocation.fixedCents, participantId),
      },
      payments: expense.payments.filter((payment) => payment.participantId !== participantId),
    })),
  };
}
