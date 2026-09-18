import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateSchedule } from "../src/lib/loan-Schedule";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const principal = 200000_00; // ₹2,00,000 in paise
  const annualRateBps = 1800;  // 18%
  const tenureMonths = 24;
  const disbursementDate = new Date("2026-01-01");

  const { emiAmount, instalments } = generateSchedule(
    principal,
    annualRateBps,
    tenureMonths,
    disbursementDate
  );

  const loan = await prisma.loan.create({
    data: {
      principal,
      annualRateBps,
      tenureMonths,
      disbursementDate,
      emiAmount,
      instalments: {
        create: instalments.map((i) => ({
          instalmentNumber: i.instalmentNumber,
          dueDate: i.dueDate,
          principalComponent: i.principalComponent,
          interestComponent: i.interestComponent,
          totalDue: i.totalDue,
        })),
      },
    },
  });

  console.log("Seeded loan:", loan.id);
  console.log(`Principal: ₹${principal / 100}, EMI: ₹${emiAmount / 100}, Tenure: ${tenureMonths} months`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });