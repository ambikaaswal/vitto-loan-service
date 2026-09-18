import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "../../../lib/prisma";

// Mock only the auth boundary — DB and route logic remain fully real.
vi.mock("../../../lib/firebase-admin", () => ({
  verifyAuthToken: vi.fn(async (authHeader: string | null) => {
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("UNAUTHENTICATED");
    }
    if (authHeader === "Bearer valid-test-token") {
      return "test-uid";
    }
    throw new Error("UNAUTHENTICATED");
  }),
}));

import { POST as createLoan } from "./route";
import { GET as getLoan } from "./[id]/route";

function makeRequest(body: unknown, authHeader?: string) {
  return new Request("http://localhost/api/loans", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify(body),
  });
}

let createdLoanId: string;

describe("Loan API integration", () => {
  afterAll(async () => {
    // Clean up test data created during this run.
    if (createdLoanId) {
      await prisma.instalment.deleteMany({ where: { loanId: createdLoanId } });
      await prisma.loan.delete({ where: { id: createdLoanId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("success path: creates a loan and retrieves it with a computed position", async () => {
    const createRes = await createLoan(
      makeRequest(
        {
          principal: 100000_00,
          annualRateBps: 1200,
          tenureMonths: 12,
          disbursementDate: "2026-01-01T00:00:00.000Z",
        },
        "Bearer valid-test-token"
      )
    );

    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    expect(createJson.data.instalments).toHaveLength(12);
    createdLoanId = createJson.data.id;

    const getReq = new Request(`http://localhost/api/loans/${createdLoanId}`, {
      headers: { Authorization: "Bearer valid-test-token" },
    });
    const getRes = await getLoan(getReq, { params: Promise.resolve({ id: createdLoanId }) });

    expect(getRes.status).toBe(200);
    const getJson = await getRes.json();
    expect(getJson.data.position.outstandingPrincipal).toBe(100000_00);
    expect(getJson.data.position.overdueAmount).toBeGreaterThan(0); // disbursed in the past
  });

  it("failure path: fetching an unknown loan id returns 404 with a consistent error shape", async () => {
    const req = new Request("http://localhost/api/loans/00000000-0000-0000-0000-000000000000", {
      headers: { Authorization: "Bearer valid-test-token" },
    });
    const res = await getLoan(req, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("rejects an unauthenticated request to create a loan", async () => {
    const res = await createLoan(
      makeRequest({
        principal: 50000_00,
        annualRateBps: 1000,
        tenureMonths: 6,
        disbursementDate: "2026-01-01T00:00:00.000Z",
      }) // no auth header
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHENTICATED");
  });
});