import { Router } from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { emailQueue } from "./queue/emailQueue.js";
import { env } from "./config/env.js";

/**
 * Live BullMQ dashboard for real-time queue visibility (waiting / delayed /
 * active / completed / failed jobs), protected with a basic-auth prompt so
 * it isn't left wide open.
 */
export function mountBullBoard() {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(env.bullBoardPath);

  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter,
  });

  const router = Router();
  router.use((req, res, next) => {
    const header = req.headers.authorization;
    const expected = "Basic " + Buffer.from(`${env.bullBoardUser}:${env.bullBoardPassword}`).toString("base64");
    if (header !== expected) {
      res.set("WWW-Authenticate", 'Basic realm="Bull Board"');
      return res.status(401).send("Authentication required");
    }
    next();
  });
  router.use(serverAdapter.getRouter());

  return router;
}
