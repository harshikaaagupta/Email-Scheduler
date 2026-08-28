# Email Scheduler

A production-shaped email job scheduler: schedule bulk email sends at a
specific time, send them through Ethereal (fake SMTP) via multiple
round-robin senders, enforce per-sender hourly rate limits, notify Slack
when a limit is hit, survive server restarts without losing or duplicating
jobs, and browse everything (scheduled + sent) from a dashboard - with
search backed by Elasticsearch and a live BullMQ queue dashboard.

Monorepo layout:

```
backend/    Express + TypeScript API, BullMQ worker, Prisma/Postgres
frontend/   React + TypeScript + Tailwind dashboard (Vite)
docker-compose.yml   Postgres + Redis + Elasticsearch for local dev
```

## Quick start

### 1. Infra: Postgres, Redis, Elasticsearch

```bash
docker compose up -d
```

(No Docker? Point `DATABASE_URL` / `REDIS_HOST` / `ELASTICSEARCH_NODE` at
your own local instances instead - nothing else needs Docker.)

### 2. Backend

```bash
cd backend
cp .env.example .env        # fill in JWT_SECRET, Google/Slack OAuth creds
npm install
npm run prisma:migrate:dev  # creates tables
npm run ethereal:create     # generates real Ethereal test mailboxes, prints SENDERS_JSON
# paste the printed SENDERS_JSON into backend/.env, then:
npm run seed:senders        # loads those senders into the DB
npm run dev                 # API + worker (same process) on :4000
```

Bull Board (live queue dashboard) is at `http://localhost:4000/admin/queues`
(basic-auth: `BULLBOARD_USER` / `BULLBOARD_PASSWORD` from `.env`).

To run the worker as its own process instead (closer to a real deployment):

```bash
RUN_WORKER_IN_PROCESS=false npm run dev     # API only
npm run worker:dev                          # worker only, separate terminal
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_URL=http://localhost:4000
npm install
npm run dev             # http://localhost:5173
```

### 4. Ethereal Email setup

Ethereal accounts are free, throwaway SMTP test mailboxes - nothing is
delivered to a real inbox; every send gets a shareable preview URL instead.
`npm run ethereal:create [count]` (inside `backend/`) calls
`nodemailer.createTestAccount()` for you, upserts the resulting mailboxes
into the `Sender` table, and prints the equivalent `SENDERS_JSON` so you can
paste it into `.env` and reproduce the same senders later with
`npm run seed:senders` (e.g. after wiping the DB) without hitting the
Ethereal API again.

### 5. Google OAuth login

Create an OAuth 2.0 Client ID (Web application) in the
[Google Cloud Console](https://console.cloud.google.com/apis/credentials),
add `http://localhost:4000/api/auth/google/callback` as an authorized
redirect URI, and set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in
`backend/.env`.

### 6. Slack OAuth (rate-limit notifications)

Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps) →
"OAuth & Permissions" → add redirect URL
`http://localhost:4000/api/auth/slack/callback` → under **Bot Token
Scopes** add `incoming-webhook` (this app only requests the
`incoming-webhook` OAuth scope, which is what lets a user pick a channel and
gives us a per-user webhook URL to post into). Set `SLACK_CLIENT_ID` /
`SLACK_CLIENT_SECRET` in `backend/.env`. Click "Connect Slack" in the
dashboard header to complete the real OAuth authorize flow.

---

## Architecture

### How scheduling works (no cron)

`POST /api/emails/campaigns` (compose) does three things per recipient:

1. Writes an `EmailJob` row to Postgres (`status = SCHEDULED`, one row per
   recipient, `scheduledFor = startTime + index * delaySeconds`).
2. Assigns a sender to that row round-robin across all configured senders.
3. Enqueues a **BullMQ delayed job** (`queue.add(..., { delay, jobId })`)
   whose `delay` is `scheduledFor - now`. Redis fires the job at exactly that
   time - there is no polling loop, no `setInterval`, no OS/node cron. This
   is what the assignment calls "BullMQ delayed jobs."

The `jobId` is always the `EmailJob`'s own id. That single choice is what
makes almost everything else (idempotency, safe restarts, safe rate-limit
retries) work: BullMQ refuses to create a second job with an id that's
already waiting/delayed/active, so "add this job" is safe to call more than
once for the same row.

### Persistence across restarts

Two independent layers, because either one alone has a gap:

- **Redis is durable.** `docker-compose.yml` runs Redis with
  `--appendonly yes`, so every delayed job (and its exact fire time) survives
  a Redis restart/crash on its own - BullMQ doesn't need our help here in
  the common case.
- **Postgres is the source of truth, and reconciles Redis on boot.**
  `queue/scheduler.ts` runs once at process startup and re-enqueues every
  `EmailJob` row that isn't `SENT` yet. Because the jobId is deterministic
  (see above), doing this against a queue that *already* has the job (the
  normal case, Redis survived) is a safe no-op. It only actually does work
  in the rare case where Redis lost its data but Postgres didn't (e.g. the
  Redis container was recreated without its volume) - the exact scenario
  the assignment describes ("if the server restarts, future emails are
  still sent at the correct time... not duplicated or restarted from Day
  1").

Combined, this means: kill `-9` the API, the worker, or Redis, bring
everything back up, and every still-pending email fires at its original
scheduled time exactly once.

### Idempotency

- Same `jobId` (`EmailJob.id`) everywhere → BullMQ won't duplicate an
  already-queued job.
- The worker also checks the DB row's `status` before doing anything: if
  `status === 'SENT'` it returns immediately. This guards the (much rarer)
  case where the reconciliation pass above re-adds a job whose row was
  already marked `SENT` but which BullMQ had already removed from Redis
  (e.g. after `removeOnComplete`).
- **Known trade-off:** if the process crashes in the exact window after
  `transporter.sendMail()` succeeds but before the DB write that marks the
  row `SENT`, a restart's reconciliation pass will retry that row and it
  could be sent twice. Closing this fully needs a durable outbox/2-phase
  write; given Ethereal is a test SMTP with no real recipients, we accepted
  this narrow window rather than adding that machinery.

### Rate limiting & concurrency

- **Concurrency**: one BullMQ `Worker` on the `email-sending` queue with
  `concurrency = WORKER_CONCURRENCY` (env, default 5) - that many jobs are
  processed in parallel per worker process, and you can run more worker
  processes (`npm run worker:start`) for more throughput; they all pull
  from the same Redis-backed queue safely.
- **Rate limiting**: implemented as **Redis counters keyed by
  `sender + hour-bucket`**, incremented atomically (`INCR`, which is atomic
  in Redis) inside the job processor, not BullMQ's built-in limiter. This
  was a deliberate choice over BullMQ's native `limiter` option: the native
  limiter transparently delays jobs with no hook to react to "limit just
  got hit," and we need exactly that hook to fire the Slack notification.
  Because it's a real Redis command rather than an in-memory counter, it
  stays correct no matter how many worker processes are running.
  - Effective limit per job = `min(sender.maxEmailsPerHour, campaign.hourlyLimit)`
    - `sender.maxEmailsPerHour` is a hard per-sender ceiling (`MAX_EMAILS_PER_HOUR`
      env is only the fallback for a sender that doesn't set its own).
    - `campaign.hourlyLimit` (the "Hourly limit" field in Compose) can ask
      for a slower pace for that campaign, sharing the same per-sender
      Redis counter as every other campaign using that sender.
  - **When the limit is hit**: the processor calls BullMQ's
    `job.moveToDelayed(nextHourStart, token)` then throws `DelayedError`
    (the documented BullMQ pattern for "put this job back in the future
    from inside its own processor"). The job keeps its identity/jobId and
    is not counted as a failed attempt - it simply reappears at the start
    of the next hour window. The DB row is updated back to `SCHEDULED` with
    the new time so the dashboard reflects the delay immediately.
  - **Trade-off**: the increment-then-maybe-decrement isn't a single atomic
    Lua script, so under very high concurrency a handful of jobs can
    briefly overshoot the limit by one before correcting - acceptable here,
    but a stricter implementation would move this into a Lua script.

### Slack notification on rate-limit hit

- "Connect Slack" does a real Slack OAuth `v2` authorize flow requesting
  the `incoming-webhook` scope. The callback exchanges the code for an
  `incoming_webhook.url` and stores it on that `User` row - no bot token,
  no channel-picking UI to build, and it's naturally per-user/tenant.
- The moment a sender's hourly limit is hit, the worker calls
  `notifications/slack.ts`, which posts to the webhook URL of **every** user
  who has one connected (a live `fetch` POST at the moment of the event,
  not a log line).
- If nobody has connected Slack yet, that function is a silent no-op - no
  crash, no retry storm.
- Because the webhook URL is read fresh from Postgres on every hit (never
  cached at startup), connecting Slack later starts notifications working
  immediately, with no redeploy; disconnecting (`Connected ✅` button)
  clears the row and notifications stop the same way.
- One notification is sent per sender per hour window (a Redis `SET NX`
  flag), not once per delayed job, so 1000 jobs hitting the same limit in
  the same hour produce one Slack message, not 1000.

### Behavior under load (1000+ emails at once)

Scheduling 1000 recipients for the same `startTime` creates 1000 `EmailJob`
rows and 1000 BullMQ jobs, all delayed to roughly the same timestamp. When
that time arrives, up to `WORKER_CONCURRENCY` of them run in parallel; each
one atomically claims a slot in that hour's per-sender Redis counter. Once
`min(sender limit, campaign limit)` slots are claimed, every subsequent job
for that sender is pushed to the next hour window (see above) instead of
being dropped or failed - so a 1000-recipient campaign against a
100/hour sender naturally spreads itself over ~10 hours, in original order
(BullMQ processes delayed jobs in the order their timers expire).

### Search (Elasticsearch)

Every terminal state write (`SENT` or final `FAILED`) is indexed into
Elasticsearch (`search/elasticsearch.ts`) alongside the Postgres write.
`GET /api/emails/scheduled|sent?q=...` queries ES (`multi_match` across
recipient/subject/body) and hydrates the matching rows from Postgres to
render. Indexing and search are both wrapped so that **Elasticsearch being
down never breaks sending or the dashboard** - search silently falls back
to a Postgres `ILIKE` query instead.

### Live BullMQ dashboard

`@bull-board/express` is mounted at `/admin/queues` (Basic Auth via
`BULLBOARD_USER`/`BULLBOARD_PASSWORD`), giving real-time visibility into
waiting/delayed/active/completed/failed jobs on the `email-sending` queue.

---

## Feature checklist

**Backend**
- [x] Schedule API (`POST /api/emails/campaigns`) storing to Postgres + BullMQ delayed jobs, no cron
- [x] Multiple Ethereal senders, round-robin assignment
- [x] Persistence across restarts (Redis AOF + Postgres reconciliation)
- [x] Idempotent sends (deterministic jobId + DB status guard)
- [x] Per-sender/per-campaign hourly rate limiting via Redis counters, jobs rescheduled (not dropped) into the next hour window
- [x] Configurable concurrency (`WORKER_CONCURRENCY`) and limits (`MAX_EMAILS_PER_HOUR`, per-sender `maxEmailsPerHour`) via env/DB, no hardcoding
- [x] Slack OAuth + live webhook notification the moment a sender's limit is hit, with graceful no-connection/reconnection handling
- [x] Elasticsearch indexing + search over scheduled/sent emails, with DB fallback
- [x] Live BullMQ dashboard (Bull Board)
- [x] Google OAuth login issuing an httpOnly JWT cookie session

**Frontend**
- [x] Google login page → dashboard redirect
- [x] Header with avatar/name/email + logout + Connect Slack
- [x] Scheduled Emails / Sent Emails tabs
- [x] Compose modal: subject, body, CSV/TXT lead upload with live detected-address count, start time, delay, hourly limit
- [x] Tables with loading state, empty state, status badges, and search
- [x] Toasts for success/error feedback
- [x] Reusable UI primitives (Button, Input, TextArea, Modal, Table, EmptyState, LoadingSpinner, StatusBadge), typed API layer, TypeScript throughout

## Assumptions & shortcuts

- Senders are configured/seeded via env + a one-off script, not managed
  through the UI - the assignment describes senders as infrastructure
  ("send emails from multiple senders"), not an end-user CRUD feature.
- The Slack notification recipient set is "every user who has connected
  Slack" (this is a small, single-team-shaped app); a larger multi-tenant
  product would scope notifications to the campaign owner's team only,
  which the schema already supports (`EmailJob → Campaign → User`) if
  narrowed further.
- CSV/TXT parsing is intentionally lenient (regex-scans the whole file for
  anything email-shaped) rather than strict column parsing, since the
  assignment only asks for a detected-address count, not a leads schema.
- No refresh-token handling for Google (JWT session is 7 days; re-login
  after expiry) - acceptable for this scope.
