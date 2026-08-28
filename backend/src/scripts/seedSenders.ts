import "dotenv/config";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";

/**
 * Upserts the senders configured in SENDERS_JSON into the database.
 * Use this to (re)seed after `npm run ethereal:create` printed a
 * SENDERS_JSON value you pasted into .env, or to change maxEmailsPerHour
 * for existing senders without touching the DB by hand.
 */
async function main() {
  if (env.senders.length === 0) {
    console.warn(
      "SENDERS_JSON is empty. Run `npm run ethereal:create` first to generate real Ethereal test accounts."
    );
    return;
  }

  for (const sender of env.senders) {
    await prisma.sender.upsert({
      where: { email: sender.email },
      update: sender,
      create: sender,
    });
    console.log(`Seeded sender: ${sender.name} <${sender.email}>`);
  }
}

main()
  .catch((err) => {
    console.error("Failed to seed senders:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
