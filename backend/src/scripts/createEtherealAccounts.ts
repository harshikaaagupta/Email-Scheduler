import "dotenv/config";
import nodemailer from "nodemailer";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";

/**
 * Creates real, throwaway Ethereal Email test mailboxes (one per sender)
 * and upserts them into the Sender table so the app has something to send
 * from out of the box. Also prints the equivalent SENDERS_JSON so it can
 * be pasted into .env for reproducible re-seeding later (`npm run
 * seed:senders`) without hitting the Ethereal API again.
 *
 * Usage: npm run ethereal:create [count]   (default count = 3)
 */
async function main() {
  const count = Number(process.argv[2] ?? 3);
  const senders = [];

  for (let i = 0; i < count; i++) {
    const account = await nodemailer.createTestAccount();
    senders.push({
      name: `Sender ${i + 1}`,
      email: account.user,
      smtpHost: account.smtp.host,
      smtpPort: account.smtp.port,
      smtpUser: account.user,
      smtpPass: account.pass,
      maxEmailsPerHour: env.maxEmailsPerHourDefault,
    });
  }

  for (const sender of senders) {
    await prisma.sender.upsert({
      where: { email: sender.email },
      update: sender,
      create: sender,
    });
  }

  console.log(`Created and seeded ${senders.length} Ethereal sender account(s).\n`);
  console.log("Paste this into backend/.env to make it reproducible:\n");
  console.log(`SENDERS_JSON=${JSON.stringify(senders)}\n`);
  console.log("Preview any sent message at the URL nodemailer prints (getTestMessageUrl).");
}

main()
  .catch((err) => {
    console.error("Failed to create Ethereal accounts:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
