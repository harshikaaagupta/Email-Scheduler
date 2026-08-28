export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  slackConnected: boolean;
  slackTeamName?: string | null;
}

export type ScheduledStatus = "SCHEDULED" | "QUEUED" | "SENDING";
export type SentStatus = "SENT" | "FAILED";

export interface SenderRef {
  name: string;
  email: string;
}

export interface ScheduledEmail {
  id: string;
  recipient: string;
  subject: string;
  scheduledFor: string;
  status: ScheduledStatus;
  sender: SenderRef | null;
}

export interface SentEmail {
  id: string;
  recipient: string;
  subject: string;
  sentAt: string | null;
  status: SentStatus;
  error?: string | null;
  sender: SenderRef | null;
}

export interface Sender {
  id: string;
  name: string;
  email: string;
  maxEmailsPerHour: number;
  usedThisHour: number;
}

export interface ComposePayload {
  subject: string;
  body: string;
  startTime: string;
  delaySeconds: number;
  hourlyLimit: number;
  file: File | null;
}

export interface ApiError {
  error: string;
}
