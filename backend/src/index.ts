import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { authRouter } from "./routes/auth.js";
import { emailsRouter } from "./routes/emails.js";
import { sendersRouter } from "./routes/senders.js";
import { mountBullBoard } from "./bullboard.js";
import { runStartupReconciliation } from "./queue/scheduler.js";
import { startWorker } from "./queue/worker.js";

const app = express();

app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use(env.bullBoardPath, mountBullBoard());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/emails", emailsRouter);
app.use("/api/senders", sendersRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

async function main() {
  // Safety net: re-enqueue any DB rows that survived a restart but might
  // have lost their corresponding Redis job (see queue/scheduler.ts).
  await runStartupReconciliation();

  // The worker can also be run as its own process (`npm run worker:dev`)
  // for a production-like separation of API and processing; running it
  // in-process here too keeps local/dev setup to a single `npm run dev`.
  if (process.env.RUN_WORKER_IN_PROCESS !== "false") {
    startWorker();
  }

  app.listen(env.port, () => {
    console.log(`Email scheduler API listening on http://localhost:${env.port}`);
    console.log(`Bull Board dashboard at http://localhost:${env.port}${env.bullBoardPath}`);
  });
}

main().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
