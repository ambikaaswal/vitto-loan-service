import { prisma } from "../../../../lib/prisma";
import { ok, fail, withAuth } from "../../../../lib/api-response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async () => {
    const { id } = await params;

    const loan = await prisma.loan.findUnique({
      where: { id },
      include: {
        instalments: { orderBy: { instalmentNumber: "asc" } },
      },
    });

    if (!loan) {
      return fail("NOT_FOUND", `No loan found with id ${id}`);
    }

    const now = new Date();
    const unpaidInstalments = loan.instalments.filter((i) => i.amountPaid < i.totalDue);

    // Outstanding principal = principal belonging to instalments not yet
    // fully settled. Each instalment's totalDue is settled as one unit
    // (see payment-allocation.ts), so there's no partial interest/principal
    // split to account for within an instalment.
    const outstandingPrincipal = unpaidInstalments.reduce(
      (sum, i) => sum + i.principalComponent,
      0
    );

    const nextInstalment = unpaidInstalments[0] ?? null;

    // Overdue: any unpaid instalment whose due date has already passed.
    // This is how the "late payment" case from section 02 is surfaced —
    // there's no separate "late fee" or penalty logic (explicitly out of
    // scope), just a running total of what's owed and past due.
    const overdueAmount = unpaidInstalments
      .filter((i) => i.dueDate < now)
      .reduce((sum, i) => sum + (i.totalDue - i.amountPaid), 0);

    return ok({
      ...loan,
      position: {
        outstandingPrincipal,
        nextDueDate: nextInstalment?.dueDate ?? null,
        nextDueAmount: nextInstalment ? nextInstalment.totalDue - nextInstalment.amountPaid : 0,
        overdueAmount,
      },
    });
  });
}