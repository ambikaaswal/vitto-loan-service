export interface ScheduleInstalment {
  instalmentNumber: number;
  dueDate: Date;
  principalComponent: number; // paise
  interestComponent: number;  // paise
  totalDue: number;           // paise
}

export interface GeneratedSchedule {
  emiAmount: number; // in paise
  instalments: ScheduleInstalment[];
}

/**
 * Generates an EMI repayment schedule using the standard amortization formula:
 *   EMI = P × r × (1 + r)^n / ((1 + r)^n − 1)
 * where r is the monthly rate (annual rate / 12 / 100).
 *
 * All money is handled in paise (integer) to avoid floating point error.
 * The EMI itself is computed once in rupees-as-float internally (necessary,
 * since the formula is inherently non-integer), then rounded to the nearest
 * paise for persistence and all downstream arithmetic.
 */

export function generateSchedule(
  principalPaise: number,
  annualRateBps: number, // e.g. 1800 = 18.00%
  tenureMonths: number,
  disbursementDate: Date
): GeneratedSchedule {
  if (principalPaise <= 0) throw new Error("principal must be positive");
  if (tenureMonths <= 0) throw new Error("tenure must be a positive integer number of months");
  if (annualRateBps < 0) throw new Error("interest rate must not be negative");

  const monthlyRate = annualRateBps / 100 / 12 / 100; // bps -> percent -> monthly fraction

  let emiAmount: number;
  if (monthlyRate === 0) {
    // Zero-interest edge case: formula divides by zero, so fall back to
    // simple equal division of principal across tenure.
    emiAmount = Math.round(principalPaise / tenureMonths);
  } else {
    const factor = Math.pow(1 + monthlyRate, tenureMonths);
    const emiExact = (principalPaise * monthlyRate * factor) / (factor - 1);
    emiAmount = Math.round(emiExact);
  }

  const instalments: ScheduleInstalment[] = [];
  let outstandingPrincipal = principalPaise;

  for (let i = 1; i <= tenureMonths; i++) {
    const dueDate = new Date(disbursementDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    const interestComponent = Math.round(outstandingPrincipal * monthlyRate);

    let principalComponent: number;
    let totalDue: number;

    if (i === tenureMonths) {
      // Final instalment absorbs whatever principal remains, so the
      // schedule always fully amortizes to exactly zero.
      principalComponent = outstandingPrincipal;
      totalDue = principalComponent + interestComponent;
    } else {
      principalComponent = emiAmount - interestComponent;
      totalDue = emiAmount;
    }

    instalments.push({
      instalmentNumber: i,
      dueDate,
      principalComponent,
      interestComponent,
      totalDue,
    });

    outstandingPrincipal -= principalComponent;
  }

  return { emiAmount, instalments };
}