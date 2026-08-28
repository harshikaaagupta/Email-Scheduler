import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface SenderConfig {
  name: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  maxEmailsPerHour: number;
}

function parseSenders(): SenderConfig[] {
  const raw = process.env.SENDERS_JSON ?? "[]";
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    console.warn("SENDERS_JSON is not valid JSON, ignoring");
    return [];
  }
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  backendUrl: process.env.BACKEND_URL ?? "http://localhost:4000",
  jwtSecret: required("JWT_SECRET", "dev-secret-change-me"),
  cookieSecure: process.env.COOKIE_SECURE === "true",

  databaseUrl: required("DATABASE_URL"),

  redisHost: process.env.REDIS_HOST ?? "localhost",
  redisPort: Number(process.env.REDIS_PORT ?? 6379),
  redisPassword: process.env.REDIS_PASSWORD || undefined,

  elasticsearchNode: process.env.ELASTICSEARCH_NODE ?? "http://localhost:9200",
  elasticsearchIndex: process.env.ELASTICSEARCH_INDEX ?? "emails",

  workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 5),
  maxEmailsPerHourDefault: Number(process.env.MAX_EMAILS_PER_HOUR ?? 200),

  bullBoardPath: process.env.BULLBOARD_PATH ?? "/admin/queues",
  bullBoardUser: process.env.BULLBOARD_USER ?? "admin",
  bullBoardPassword: process.env.BULLBOARD_PASSWORD ?? "admin",

  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ??
    "http://localhost:4000/api/auth/google/callback",

  slackClientId: process.env.SLACK_CLIENT_ID ?? "",
  slackClientSecret: process.env.SLACK_CLIENT_SECRET ?? "",
  slackRedirectUri:
    process.env.SLACK_REDIRECT_URI ??
    "http://localhost:4000/api/auth/slack/callback",

  senders: parseSenders(),
};
