export interface AllocatableInstalment {
  id: string;
  instalmentNumber: number;
  dueDate: Date;
  totalDue: number;   // paise
  amountPaid: number; // paise, already settled so far
}

export interface AllocationLine {
  instalmentId: string;
  amountApplied: number; // paise
}

export interface AllocationResult {
  allocations: AllocationLine[];
  unallocatedAmount: number; // paise left over if payment exceeds total remaining schedule
}


export function allocatePayment(
  instalments: AllocatableInstalment[],
  paymentAmount: number
): AllocationResult {
  if (paymentAmount <= 0) {
    throw new Error("payment amount must be positive");
  }

  // Oldest outstanding instalment first, regardless of input order.
  const sorted = [...instalments]
    .filter((i) => i.amountPaid < i.totalDue)
    .sort((a, b) => a.instalmentNumber - b.instalmentNumber);

  let remaining = paymentAmount;
  const allocations: AllocationLine[] = [];

  for (const instalment of sorted) {
    if (remaining <= 0) break;

    const outstandingOnThisInstalment = instalment.totalDue - instalment.amountPaid;
    const amountApplied = Math.min(remaining, outstandingOnThisInstalment);

    allocations.push({ instalmentId: instalment.id, amountApplied });
    remaining -= amountApplied;
  }

  return {
    allocations,
    unallocatedAmount: remaining, // 0 in the normal case
  };
}