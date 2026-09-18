import { z } from "zod";
import { prisma } from "../../../../../lib/prisma";
import { allocatePayment } from "../../../../../lib/payment-allocation";
import { ok, fail, withAuth } from "../../../../../lib/api-response";
import crypto from "crypto";

const recordPaymentSchema = z.object({
  amount: z.number().int().positive(), // paise
  date: z.string().datetime(),
  idempotencyKey: z.string().optional(), // caller may supply one; we derive one if not
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async () => {
    const { id: loanId } = await params;

    const body = await request.json().catch(() => null);
    const parsed = recordPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return fail("INVALID_INPUT", parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { amount, date, idempotencyKey: providedKey } = parsed.data;

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { instalments: true },
    });
    if (!loan) {
      return fail("NOT_FOUND", `No loan found with id ${loanId}`);
    }

    // Deterministic key when caller doesn't supply one: same loan + amount +
    // date collapses to the same key, so an accidental double-submit of the
    // exact same payment is caught even without client cooperation.
    const idempotencyKey =
      providedKey ??
      crypto
        .createHash("sha256")
        .update(`${loanId}:${amount}:${date}`)
        .digest("hex");

    const existing = await prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) {
      // Duplicate submission: return the original result, don't reapply.
      const alreadyAllocated = await prisma.paymentAllocation.findMany({
        where: { paymentId: existing.id },
      });
      return ok({ payment: existing, allocations: alreadyAllocated, duplicate: true });
    }

    const { allocations } = allocatePayment(
      loan.instalments.map((i) => ({
        id: i.id,
        instalmentNumber: i.instalmentNumber,
        dueDate: i.dueDate,
        totalDue: i.totalDue,
        amountPaid: i.amountPaid,
      })),
      amount
    );

    const payment = await prisma.$transaction(async (tx) => {
      const createdPayment = await tx.payment.create({
        data: {
          loanId,
          amount,
          paymentDate: new Date(date),
          idempotencyKey,
        },
      });

      for (const line of allocations) {
        await tx.paymentAllocation.create({
          data: {
            paymentId: createdPayment.id,
            instalmentId: line.instalmentId,
            amountApplied: line.amountApplied,
          },
        });

        await tx.instalment.update({
          where: { id: line.instalmentId },
          data: { amountPaid: { increment: line.amountApplied } },
        });
      }

      return createdPayment;
    });

    return ok({ payment, allocations }, 201);
  });
}