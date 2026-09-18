This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.



## Key Decisions:
1.Money in paise, integers throughout — principalComponent/interestComponent/totalDue are all rounded to the nearest paise per installment.

2.Rate stored as annualRateBps (basis points, e.g. 1800 = 18.00%) — avoids float entirely even for the rate input itself.


## when a payment comes in, what does it settle first?
1.Oldest overdue instalment first, interest-before-principal within each instalment, like most real EMI systems , clears arrears before naything else


## loan route decisions:
Zod validates shape first (numbers are actually numbers, positive, etc.) — this catches "non-numeric values" from section 02 before it ever reaches generateSchedule.

generateSchedule's own throws are caught separately and turned into INVALID_INPUT — this is what catches "negative amounts, zero-month tenure" specifically, reusing the validation you already wrote and tested in the schedule function itself, rather than duplicating those rules in the route.

Dates come in as ISO strings over JSON ("2026-01-01T00:00:00.000Z") since raw Date objects don't serialize — the UI/seed script will need to send it that way too.

## Payments route decisions
Idempotency key is deterministic when not supplied — same loan+amount+date hashes to the same key, so the DB's @unique constraint on idempotencyKey catches accidental duplicates automatically, satisfying the brief's requirement at the database level, not just in app logic.

On duplicate, we don't throw an error — we return the original payment's result again. This is a judgment call worth documenting: silently returning the same result (rather than a 409 error) makes the endpoint safe to retry blindly, which is exactly the "same payment submitted twice must not be applied twice" requirement.

The whole thing runs in a prisma.$transaction — if any part fails partway (e.g. one instalment update fails), nothing is left half-applied.