import { describe, it, expect } from "vitest";
import { allocatePayment, AllocatableInstalment } from "./payment-allocation";

function instalment(
  overrides: Partial<AllocatableInstalment>
): AllocatableInstalment {
  return {
    id: "i1",
    instalmentNumber: 1,
    dueDate: new Date("2026-02-01"),
    totalDue: 9986_00,
    amountPaid: 0,
    ...overrides,
  };
}

describe("allocatePayment", () => {
  it("underpayment: ₹5,000 against a ₹9,986 instalment partially settles it", () => {
    const result = allocatePayment([instalment({})], 5000_00);

    expect(result.allocations).toEqual([{ instalmentId: "i1", amountApplied: 5000_00 }]);
    expect(result.unallocatedAmount).toBe(0);
  });

  it("overpayment: 2x instalment settles the current instalment and rolls into the next", () => {
    const instalments = [
      instalment({ id: "i1", instalmentNumber: 1 }),
      instalment({ id: "i2", instalmentNumber: 2 }),
    ];

    const result = allocatePayment(instalments, 9986_00 * 2);

    expect(result.allocations).toEqual([
      { instalmentId: "i1", amountApplied: 9986_00 },
      { instalmentId: "i2", amountApplied: 9986_00 },
    ]);
    expect(result.unallocatedAmount).toBe(0);
  });

  it("payment beyond total remaining schedule surfaces the excess rather than absorbing it silently", () => {
    const instalments = [instalment({ id: "i1", instalmentNumber: 1 })];

    const result = allocatePayment(instalments, 9986_00 + 500_00);

    expect(result.allocations).toEqual([{ instalmentId: "i1", amountApplied: 9986_00 }]);
    expect(result.unallocatedAmount).toBe(500_00);
  });

  it("always settles the oldest outstanding instalment first, even if passed out of order", () => {
    const instalments = [
      instalment({ id: "i2", instalmentNumber: 2 }),
      instalment({ id: "i1", instalmentNumber: 1 }),
    ];

    const result = allocatePayment(instalments, 5000_00);

    expect(result.allocations).toEqual([{ instalmentId: "i1", amountApplied: 5000_00 }]);
  });

  it("skips instalments that are already fully paid", () => {
    const instalments = [
      instalment({ id: "i1", instalmentNumber: 1, amountPaid: 9986_00 }), // already settled
      instalment({ id: "i2", instalmentNumber: 2 }),
    ];

    const result = allocatePayment(instalments, 3000_00);

    expect(result.allocations).toEqual([{ instalmentId: "i2", amountApplied: 3000_00 }]);
  });

  it("rejects a zero or negative payment amount", () => {
    expect(() => allocatePayment([instalment({})], 0)).toThrow();
    expect(() => allocatePayment([instalment({})], -100)).toThrow();
  });
});