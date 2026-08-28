import axios from "axios";
import type { ComposePayload, ScheduledEmail, Sender, SentEmail, User } from "../types";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export function googleLoginUrl(): string {
  return `${API_URL}/api/auth/google`;
}

export function slackConnectUrl(): string {
  return `${API_URL}/api/auth/slack`;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get<User>("/api/auth/me");
  return data;
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout");
}

export async function disconnectSlack(): Promise<void> {
  await api.post("/api/auth/slack/disconnect");
}

export async function fetchScheduledEmails(q?: string): Promise<ScheduledEmail[]> {
  const { data } = await api.get<ScheduledEmail[]>("/api/emails/scheduled", { params: { q } });
  return data;
}

export async function fetchSentEmails(q?: string): Promise<SentEmail[]> {
  const { data } = await api.get<SentEmail[]>("/api/emails/sent", { params: { q } });
  return data;
}

export async function fetchSenders(): Promise<Sender[]> {
  const { data } = await api.get<Sender[]>("/api/senders");
  return data;
}

export interface CreateCampaignResponse {
  campaignId: string;
  recipientCount: number;
  emailJobIds: string[];
}

export async function createCampaign(payload: ComposePayload): Promise<CreateCampaignResponse> {
  const form = new FormData();
  form.append("subject", payload.subject);
  form.append("body", payload.body);
  form.append("startTime", payload.startTime);
  form.append("delaySeconds", String(payload.delaySeconds));
  form.append("hourlyLimit", String(payload.hourlyLimit));
  if (payload.file) {
    form.append("file", payload.file);
  }
  const { data } = await api.post<CreateCampaignResponse>("/api/emails/campaigns", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export function extractApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const message = (err.response?.data as { error?: string } | undefined)?.error;
    if (message) return message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
