import { describe, it, expect } from "vitest";
import { generateSchedule } from "./loan-Scheduling";

describe("generateSchedule", () => {
  it("matches the brief's worked example: ₹2,00,000 at 18% p.a. over 24 months ≈ ₹9,986/month", () => {
    const principal = 200000_00; // paise
    const annualRateBps = 1800;  // 18.00%
    const tenureMonths = 24;

    const { emiAmount, instalments } = generateSchedule(
      principal,
      annualRateBps,
      tenureMonths,
      new Date("2026-01-01")
    );

    // Brief allows 1-2 rupee rounding variance
    expect(emiAmount).toBeGreaterThanOrEqual(9984_00);
    expect(emiAmount).toBeLessThanOrEqual(9988_00);

    expect(instalments).toHaveLength(24);
  });

  it("fully amortizes: sum of all principal components equals original principal exactly", () => {
    const principal = 200000_00;
    const { instalments } = generateSchedule(principal, 1800, 24, new Date("2026-01-01"));

    const totalPrincipalRecovered = instalments.reduce(
      (sum, i) => sum + i.principalComponent,
      0
    );

    expect(totalPrincipalRecovered).toBe(principal);
  });

  it("due dates fall one month apart, starting one month after disbursement", () => {
    const { instalments } = generateSchedule(200000_00, 1800, 24, new Date("2026-01-15"));

    expect(instalments[0].dueDate.getMonth()).toBe(1); // Feb (0-indexed)
    expect(instalments[1].dueDate.getMonth()).toBe(2); // Mar
  });

  it("rejects zero or negative tenure", () => {
    expect(() => generateSchedule(200000_00, 1800, 0, new Date())).toThrow();
    expect(() => generateSchedule(200000_00, 1800, -3, new Date())).toThrow();
  });

  it("rejects non-positive principal", () => {
    expect(() => generateSchedule(0, 1800, 24, new Date())).toThrow();
    expect(() => generateSchedule(-500000, 1800, 24, new Date())).toThrow();
  });

  it("handles zero interest rate without dividing by zero", () => {
    const { emiAmount, instalments } = generateSchedule(120000_00, 0, 12, new Date("2026-01-01"));

    expect(emiAmount).toBe(10000_00); // 1,20,000 / 12, exact
    expect(instalments.every((i) => i.interestComponent === 0)).toBe(true);
  });
});