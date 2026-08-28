import nodemailer, { Transporter } from "nodemailer";
import type { Sender } from "@prisma/client";
import { prisma } from "../db/prisma.js";

const transporterCache = new Map<string, Transporter>();

export async function listActiveSenders(): Promise<Sender[]> {
  const senders = await prisma.sender.findMany({ orderBy: { createdAt: "asc" } });
  if (senders.length === 0) {
    throw new Error(
      "No senders configured. Run `npm run seed:senders` after populating SENDERS_JSON " +
        "(see `npm run ethereal:create` to generate real Ethereal test accounts)."
    );
  }
  return senders;
}

export function pickSenderRoundRobin(senders: Sender[], index: number): Sender {
  return senders[index % senders.length];
}

export function getTransporterFor(sender: Sender): Transporter {
  const cached = transporterCache.get(sender.id);
  if (cached) return cached;

  const transporter = nodemailer.createTransport({
    host: sender.smtpHost,
    port: sender.smtpPort,
    secure: sender.smtpPort === 465,
    auth: {
      user: sender.smtpUser,
      pass: sender.smtpPass,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });

  transporterCache.set(sender.id, transporter);
  return transporter;
}
