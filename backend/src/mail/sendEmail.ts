import type { Sender } from "@prisma/client";
import { getTransporterFor } from "./senders.js";

export interface SendEmailInput {
  sender: Sender;
  to: string;
  subject: string;
  body: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl?: string;
}

export async function sendEmail({ sender, to, subject, body }: SendEmailInput): Promise<SendEmailResult> {
  const transporter = getTransporterFor(sender);

  const info = await transporter.sendMail({
    from: `"${sender.name}" <${sender.email}>`,
    to,
    subject,
    html: body,
  });

  const nodemailer = await import("nodemailer");
  const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;

  return { messageId: info.messageId, previewUrl };
}
