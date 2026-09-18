import { z } from "zod";
import { prisma } from "../../../lib/prisma";
import { generateSchedule } from "../../../lib/loan-Schedule";
import { ok, fail, withAuth } from "../../../lib/api-response";

const createLoanSchema = z.object({
  principal: z.number().int().positive(),       // paise
  annualRateBps: z.number().int().min(0),        // e.g. 1800 = 18%
  tenureMonths: z.number().int().positive(),
  disbursementDate: z.string().datetime(),        // ISO string
});

export async function POST(request: Request) {
  return withAuth(request, async () => {
    const body = await request.json().catch(() => null);
    const parsed = createLoanSchema.safeParse(body);

    if (!parsed.success) {
      return fail("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
    }

    const { principal, annualRateBps, tenureMonths, disbursementDate } = parsed.data;

    let schedule;
    try {
      schedule = generateSchedule(
        principal,
        annualRateBps,
        tenureMonths,
        new Date(disbursementDate)
      );
    } catch (err) {
      return fail("INVALID_INPUT", err instanceof Error ? err.message : "Invalid loan parameters");
    }

    const loan = await prisma.loan.create({
      data: {
        principal,
        annualRateBps,
        tenureMonths,
        disbursementDate: new Date(disbursementDate),
        emiAmount: schedule.emiAmount,
        instalments: {
          create: schedule.instalments.map((i) => ({
            instalmentNumber: i.instalmentNumber,
            dueDate: i.dueDate,
            principalComponent: i.principalComponent,
            interestComponent: i.interestComponent,
            totalDue: i.totalDue,
          })),
        },
      },
      include: { instalments: true },
    });

    return ok(loan, 201);
  });
}