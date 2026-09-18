# Vitto Loan Repayment Service

A Next.js application that generates a loan repayment schedule, records payments against it, and reports a loan's current position at any time. Built for the Vitto Full Stack SDE (MSME Lending) technical assessment.

## Stack

- **Next.js** (App Router, TypeScript) — API route handlers + single UI page
- **PostgreSQL** via **Prisma 7** (driver adapters) — hosted on **Neon**
- **Firebase Authentication** (email/password) — server-side token verification
- **Vitest** — unit + integration tests

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Environment variables** — copy `.env.example` to `.env` and fill in the values (sent separately in the submission email):
   ```bash
   cp .env.example .env
   ```
   Required variables:
   - `DATABASE_URL` — Neon Postgres connection string
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — Firebase Admin SDK (server-side token verification)
   - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` — Firebase client SDK

3. **Database setup** — schema is created via Prisma migrations, not manually:
   ```bash
   npx prisma migrate deploy
   npx prisma generate
   ```

4. **Seed a sample loan** (recommended) — creates a ₹2,00,000 loan at 18% p.a. over 24 months, so there's data to view immediately without using the API directly:
```bash
   npm run seed
```
   The script prints the created loan's ID to the terminal — copy it and paste it into the UI's "Loan ID" field to load the schedule. A loan is not created automatically; this step (or a manual `POST /api/loans` call) is required before the UI has anything to display.

   A sample loan is already seeded in the database:
  Loan ID: d27474f0-6b5c-4012-9a90-64d63124e981

5. **Run the app**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000), sign up with an email/password (or sign in with the test account provided in the submission email), paste in a loan ID, and load it.

## Database

**PostgreSQL, hosted on [Neon](https://neon.tech)**. Schema is defined in `prisma/schema.prisma` and applied via Prisma migrations (`prisma/migrations/`) — never created or altered by hand. A payment cannot exist without a loan: this is enforced at the schema level via a required foreign key (`onDelete: Restrict`), not just in application code. Nothing in this system is hard-deleted (loans, instalments, and payments all use `Restrict` rather than `Cascade`) — this is a financial ledger, and rows are never removed, only added to.

## Tests

Single command, runs unit and integration tests together against a real database:
```bash
npm run test
```

- **Unit tests** (`src/lib/loan-schedule.test.ts`, `src/lib/payment-allocation.test.ts`) — pure functions, no database. Cover the EMI formula against the brief's worked example, full amortization (no rupee lost to rounding), invalid input (negative principal, zero tenure), underpayment, overpayment across multiple instalments, and payment ordering.
- **Integration tests** (`src/app/api/loans/loan-api.integration.test.ts`) — call the actual route handlers against the real Neon database (not mocks): one success path (create + retrieve a loan with computed position), one failure path (unknown loan ID → 404), and one confirming an unauthenticated request is rejected (401). Test data is cleaned up after the run. Firebase token verification is mocked at its single boundary function (`verifyAuthToken`) so the suite doesn't depend on live Firebase network calls or a hardcoded credential — everything downstream of that boundary (routing, validation, database writes) is fully real.

## Endpoint reference

All endpoints require `Authorization: Bearer <Firebase ID token>`. Requests without a valid token receive `401 { error: { code: "UNAUTHENTICATED", message } }`.

### `POST /api/loans` — create a loan
```json
// Request
{
  "principal": 20000000,        // paise
  "annualRateBps": 1800,        // basis points, 1800 = 18.00%
  "tenureMonths": 24,
  "disbursementDate": "2026-01-01T00:00:00.000Z"
}

// Response 201
{ "data": { "id": "...", "principal": 20000000, "...": "...", "instalments": [ /* 24 rows */ ] } }
```

### `GET /api/loans/:id` — get a loan
Returns the full schedule plus a computed current position.
```json
// Response 200
{
  "data": {
    "id": "...",
    "instalments": [
      { "instalmentNumber": 1, "dueDate": "...", "principalComponent": 698482, "interestComponent": 300000, "totalDue": 998482, "amountPaid": 500000 }
    ],
    "position": {
      "outstandingPrincipal": 19500000,
      "nextDueDate": "2026-02-01T00:00:00.000Z",
      "nextDueAmount": 498482,
      "overdueAmount": 7487856
    }
  }
}
```
Unknown loan ID → `404 { error: { code: "NOT_FOUND", message } }`.

### `POST /api/loans/:id/payments` — record a payment
```json
// Request
{
  "amount": 500000,             // paise
  "date": "2026-02-05T00:00:00.000Z"
}

// Response 201 (or 200 on a detected duplicate — see below)
{
  "data": {
    "payment": { "id": "...", "amount": 500000, "...": "..." },
    "allocations": [ { "instalmentId": "...", "amountApplied": 500000 } ],
    "duplicate": false
  }
}
```

**Common error shape** across all three endpoints:
```json
{ "error": { "code": "INVALID_INPUT" | "NOT_FOUND" | "UNAUTHENTICATED" | "INTERNAL", "message": "..." } }
```

## Money type

**Integer paise throughout the entire system** — the database, the API, and the schedule/allocation logic never use a floating-point type for money. `principalComponent`, `interestComponent`, `totalDue`, `amountPaid`, and `amount` are all stored and computed as whole-number paise (₹1 = 100 paise). The interest rate itself follows the same rule: it's stored as `annualRateBps` (basis points — e.g. `1800` = 18.00%), an integer, rather than a float or Prisma `Decimal`. This avoids floating-point rounding error entirely, at the cost of needing to divide by 100 (rupees) or 10000 (percent) at the display layer.

## Allocation and rounding decisions

**EMI calculation and rounding.** The EMI is computed once via the standard amortization formula and rounded to the nearest paise. Because per-instalment rounding can drift the total principal recovered away from the exact original principal by a rupee or two over the life of the loan, **the final instalment absorbs the entire remaining principal balance** rather than using the formula-derived amount — this is the brief's own "final instalment is the conventional place for the remainder" rule, and it guarantees the schedule always fully amortizes to exactly zero with nothing lost to rounding.

**Payment allocation order.** When a payment comes in, it is applied to the **oldest outstanding (unpaid or partially-paid) instalment first**, in strict instalment-number order — this mirrors how most real EMI systems clear arrears before anything else, and is easy to defend as a default. Within a single instalment, the payment is applied as **one lump sum against `totalDue`** — this implementation does not split a partial payment into "this much was interest, this much was principal" within an instalment; the instalment is settled as a single unit. One practical consequence: `outstandingPrincipal` in the "current position" response is the sum of `principalComponent` for every instalment not yet *fully* paid — a partially-paid instalment still counts its full principal component as outstanding until that instalment is completely settled.

**Underpayment.** A payment smaller than the instalment due is applied to that instalment's `amountPaid`, leaving it partially settled (`amountPaid < totalDue`). It remains the "next due" instalment until a later payment closes the gap.

**Overpayment.** Once a payment fully settles the current oldest instalment, **the excess rolls forward and settles the next instalment(s) in order** — it does not reduce principal ahead of schedule or trigger early loan closure. This was a deliberate choice: the brief explicitly lists prepayment/foreclosure as out of scope, and letting overpayment reduce principal early would edge into exactly that. Rolling forward keeps the behavior contained to "settling what's due," which is squarely in scope. If a payment exceeds the entire remaining schedule, the excess is returned as `unallocatedAmount` by the allocation function rather than silently absorbed (the route currently has no remaining instalments to apply it to in that edge case).

**Late payment.** There is no separate penalty/late-fee mechanism (explicitly out of scope per the brief). A late payment is instead reflected purely through the "current position" calculation: any unpaid instalment whose due date has already passed contributes to `overdueAmount`, which is recalculated live against the current date on every `GET /api/loans/:id` call — nothing is pre-computed or cached.

**Duplicate submission.** Every payment is written with a deterministic `idempotencyKey` — a hash of `loanId + amount + date` when the caller doesn't supply one explicitly. This key has a `@unique` constraint at the database level (Prisma schema), so a duplicate submission is caught by the database itself, not only by application logic. On a detected duplicate, the endpoint does **not** throw an error — it returns the original payment's result again (with `duplicate: true`). This makes the endpoint safe to retry blindly (e.g. after a network timeout where the client isn't sure if the first request succeeded), which is the practical intent behind "the same payment must not be applied twice."

**Invalid input.** Two layers of validation: Zod schemas on each route catch malformed shapes (non-numeric values, missing fields) before any business logic runs; `generateSchedule()`'s own checks (reused from the tested unit function, not duplicated) catch semantically invalid values — negative principal, zero or negative tenure, negative interest rate. An unknown loan ID returns `404 NOT_FOUND` rather than a generic error.