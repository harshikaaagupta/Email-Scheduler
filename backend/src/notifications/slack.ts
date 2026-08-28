import { prisma } from "../db/prisma.js";

/**
 * Sends a Slack message to every user who has connected Slack, via their
 * stored incoming-webhook URL. If nobody has connected Slack yet this is a
 * silent no-op (never throws, never crashes the worker) - and the moment a
 * user connects, subsequent rate-limit hits start notifying them without
 * any redeploy since we read the webhook URL fresh from the DB each time.
 */
export async function notifyRateLimitHit(params: {
  senderName: string;
  senderEmail: string;
  limitPerHour: number;
  nextWindowStart: Date;
}) {
  const usersWithSlack = await prisma.user.findMany({
    where: { slackWebhookUrl: { not: null } },
    select: { id: true, slackWebhookUrl: true },
  });

  if (usersWithSlack.length === 0) return;

  const text =
    `:rotating_light: *Rate limit reached* for sender *${params.senderName}* (${params.senderEmail}).\n` +
    `Hourly limit of *${params.limitPerHour}* emails reached. ` +
    `Remaining emails have been automatically rescheduled to start at ` +
    `${params.nextWindowStart.toISOString()}.`;

  await Promise.allSettled(
    usersWithSlack.map((user) =>
      fetch(user.slackWebhookUrl as string, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).catch((err) => {
        console.error("Failed to send Slack notification:", err);
      })
    )
  );
}
