# AGENTS.md — Express + TypeScript Best Practice for this Repo

> Source of truth: `PLAN.md §2` is the wire contract (path/method/shape/status/role). This file is **how to implement it** correctly in this codebase. If they conflict, `PLAN.md` wins.

## 0) Stack — don't add what already exists

- **Runtime:** `express@5`, `typescript@ES2022` (`NodeNext`), `tsx watch src/server.ts` for dev.
- **DB:** `prisma@7` + `@prisma/adapter-pg` (postgres), `prisma.config.ts` expects `DATABASE_URL`.
- **Validation:** `zod@4` + `src/middlewares/validate.middleware.ts`.
- **Auth:** `jsonwebtoken` + `bcrypt` + `cookie-parser` (httpOnly `access_token` + SHA-256 hashed `RefreshToken` table).
- **Logging:** `pino` + `pino-http` (`src/config/logger.ts`). Never `console.log` in request path.
- **Jobs:** `node-cron` (`src/jobs/*`, `src/modules/notification/notification-retry.job.ts`).
- **Deps already usable:** `date-fns`, `decimal.js`, `helmet`, `cors`, `web-push`, `supertest`, `jest`+`ts-jest`.

**Commands (use these, don't invent new):**

```bash
npm run dev           # tsx watch src/server.ts
npm run build         # tsc -p tsconfig.json  (rootDir src -> dist)
npm start             # node dist/server.js
npm test              # jest (roots src,tests, setupFiles tests/setup-env.ts)
npm run lint          # eslint (flat config eslint.config.js)
npm run typecheck     # tsc --noEmit
npm run prisma:generate
npm run prisma:migrate
npm run prisma:deploy
```

`tsconfig.json:7` `module: NodeNext` → every local import **must** use `.js` extension (`import x from './y.js'`).

---

## 1) Project Structure — feature-module layout

```
src/
  app.ts                 # express() + helmet/cors/json/cookie/pinoHttp + /api + errorMiddleware
  server.ts              # listen + SIGTERM/SIGINT + startReminderJob/startNotificationRetryJob
  config/
    env.ts               # zod envSchema — single place to add env vars
    prisma.ts            # single PrismaClient (PrismaPg adapter)
    logger.ts            # pino
    property.ts          # getDefaultPropertyId() | getRequestPropertyId(req)
  middlewares/
    auth.middleware.ts   # requireAuth — cookie OR Bearer, re-fetches Admin from DB
    role.middleware.ts   # requireRole('OWNER'|'STAFF')
    property.middleware.ts # resolveProperty / requireProperty
    validate.middleware.ts # validate(schema, 'body'|'query'|'params')
    error.middleware.ts  # AppError -> JSON, else 500 + logger.error
  utils/
    apiError.ts          # AppError(message, statusCode)
    apiResponse.ts       # apiSuccess / apiPagination
    asyncHandler.ts      # asyncHandler wrapper
    serialize.util.ts    # toNumber / toNumberRequired — Decimal → number (P0, see §1 item 7)
    paymentStatus.util.ts# computePembayaranStatus pure fn
    date.util.ts
  types/express.d.ts     # req.user / req.admin / req.property / req.rawBody
  routes/index.ts        # /health + all module routers under /api
  modules/<domain>/      # one folder per domain — see §2
  jobs/reminder.job.ts
prisma/
  schema.prisma          # single schema, enums + models
  migrations/
  seed.ts
tests/                   # integration/unit tests
```

**Rule:** fewest files possible. New domain = new `src/modules/<name>/` folder. Don't create `src/controllers/`, `src/services/` top-level aggregations — they've been intentionally flattened into modules.

---

## 2) Module Anatomy — copy this, don't invent

Every module has **exactly** these files (omit `mapper.ts` only if no frozen contract shape):

```
src/modules/example/
  example.route.ts
  example.controller.ts
  example.service.ts
  example.schema.ts      # zod schemas + inferred TS types
  example.mapper.ts      # Prisma → DTO (Decimal→number, field omission)
```

**`example.schema.ts`:**
```ts
import { z } from 'zod'
export const createExampleSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive().or(z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number)),
})
export type CreateExampleInput = z.infer<typeof createExampleSchema>
```
- `coerce` for query/params numbers/dates. `page/limit` default `1/20`, max `100`. For finance/logs `page/pageSize` default `1/50`.
- Future date guard: `paymentDate` ≤ now+1d, `transactionDate` ≤ now.

**`example.route.ts`:**
```ts
import { Router } from 'express'
import { requireAuth } from '../../middlewares/auth.middleware.js'
import { requireRole } from '../../middlewares/role.middleware.js'
import { validate } from '../../middlewares/validate.middleware.js'
import * as controller from './example.controller.js'
import { createExampleSchema } from './example.schema.js'

const router = Router()
router.use(requireAuth) // or per-route — but always requireAuth first
router.get('/', validate(listQuerySchema, 'query'), controller.list)
router.post('/', validate(createExampleSchema), controller.create)
router.patch('/:id', controller.update)
router.delete('/:id', requireRole('OWNER'), controller.remove)
export default router
```
- Register in `src/routes/index.ts` under `/api/<path>` — keep `whatsappWebhookRoutes` **before** `requireAuth` (public + HMAC check `src/app.ts:15` rawBody).
- Mount order in `app.ts` matters: `helmet → cors → express.json({verify rawBody}) → urlencoded → cookieParser → pinoHttp → /api → errorMiddleware`.

**`example.controller.ts`:**
```ts
import { Request, Response, NextFunction } from 'express'
import { apiSuccess, apiPagination } from '../../utils/apiResponse.js'
import * as service from './example.service.js'
import { mapExample } from './example.mapper.js'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = req.query as unknown as ListQuery // validated already
    const { data, total } = await service.list(getRequestPropertyId(req), query)
    return apiPagination(res, data.map(mapExample), { page: query.page, limit: query.limit, total })
  } catch (err) { next(err) }
}
```
- Thin: no business logic, no Prisma. Use `apiSuccess(res, dto, 201|200)` or `apiPagination`. For idempotent replay (§2.1) return `200` on replay, `201` on create — check `service` flag.
- Prefer explicit `try/catch → next(err)` over `asyncHandler` if file already uses it (both allowed, be consistent per file — see `src/utils/asyncHandler.ts:3`).

**`example.service.ts`:**
```ts
import prisma from '../../config/prisma.js'
import { AppError } from '../../utils/apiError.js'
import { getRequestPropertyId } from '../../config/property.js' // or getDefaultPropertyId for Fase0-4 compat

export async function getById(req: Request, id: string) {
  const propertyId = getRequestPropertyId(req)
  const row = await prisma.example.findFirst({ where: { id, propertyId } })
  if (!row) throw new AppError('Example tidak ditemukan', 404) // 404 not 403 for cross-property
  return row
}
```
- Throw `AppError(message, status)` — `error.middleware.ts:11` formats it.
- **Transactions:** `prisma.$transaction(async (tx) => { ... })` for any multi-write (payment+finance, deposit+tx, audit). Always `writeAuditLog(tx, {...})` inside same tx (see `src/modules/audit/audit.service.ts:1`).
- **Soft delete:** never hard delete finance rows — set `deletedAt`. Expense reversal inserts offsetting row, never mutates amount.

**`example.mapper.ts`:**
```ts
import { toNumberRequired } from '../../utils/serialize.util.js'
export function mapExample(row: any) {
  return {
    id: row.id,
    amount: toNumberRequired(row.amount), // MUST — Prisma Decimal -> number (§1 item 7)
    createdAt: row.createdAt.toISOString(),
  }
}
```
- Every monetary `Decimal` → `toNumberRequired`. Dates → `toISOString()`. Omit internal fields (`propertyId`, `penyewaId` internal, `providerMessageId`, `retryCount`, `dedupeKey`) unless contract exposes them.
- One mapper per frozen shape; `detail` may embed `paymentRecords` while `list` does not (`src/modules/pembayaran/pembayaran.mapper.ts:50`).

---

## 3) Critical Conventions — violations break contract or isolation

### 3.1 Naming (from `PLAN.md §11`)
- **Indonesian** for domain-core models: `Kamar`, `Penyewa`, `Pembayaran`, `StatusPembayaran`, `JenisPesan` — keep them, never rename.
- **English** for infra/finance: `Property`, `Admin`, `NotificationLog`, `FinancialAccount`, `PaymentRecord`, `Deposit`.
- Mixed is intentional. Don't "normalize" it.

### 3.2 Property Isolation (Phase 7)
- **Never** trust `propertyId` from body/query/params. Always derive via:
  ```ts
  import { getRequestPropertyId } from '../../config/property.js'
  const propertyId = getRequestPropertyId(req) // req.property.id ?? req.user.propertyId ?? default
  ```
- New modules (Phase 8+) **must** use `getRequestPropertyId(req)`. Fase 0–4 modules still use `getDefaultPropertyId()` — don't touch them until migration.
- All Prisma queries: `where: { ..., propertyId }` or `penyewa: { kamar: { propertyId } }`. On mismatch → `404`, not `403` (don't leak existence).
- Tests for every new resource: seed 2 properties/2 admins, assert A cannot read B's id (even with real id), and forged `propertyId` in body is ignored.

### 3.3 Decimal Serialization (§1 item 7 — P0)
- Prisma `Decimal` `.toJSON()` → `string`. Frontend expects `number`. **Every** mapper must call `toNumber`/`toNumberRequired` (`src/utils/serialize.util.ts:12`). Covered by `tests` contract suite — if you add a monetary field and forget this, CI fails.

### 3.4 Auth & Roles
- `requireAuth` (`src/middlewares/auth.middleware.ts:32`) accepts `access_token` cookie **or** `Authorization: Bearer` header, verifies JWT with `env.ACCESS_TOKEN_SECRET`, re-fetches `Admin` from DB (DB wins over claim). Sets `req.user` and `req.admin` (same principal). New code: use `req.user`.
- `requireRole('OWNER')` (`src/middlewares/role.middleware.ts:3`) — used for: `DELETE /finance/transactions/:id`, `POST /expenses/:id/reverse`, `POST /notification/reminders/run-sweep`, template/config patches, `GET /audit-log`.
- WhatsApp webhooks (`GET/POST /api/notification/whatsapp/webhook`) are **public** — protect via `X-Hub-Signature-256` HMAC against `WHATSAPP_APP_SECRET`, not `requireAuth` (`src/modules/notification/whatsapp-webhook.route.ts`).

### 3.5 Validation
- Always `validate(schema, source)` before controller. Query `coerce` ints/dates; body strict enums.
- Phone: accept `08xx`/`+62xx`, normalize to `62xx` (reuse existing regex in `penyewa.service.ts`).
- `paymentDate` ≤ now+1d, `transactionDate` not future, `receiptUrl` must be URL if present.

### 3.6 Idempotency (§1 item 6) & Dedupe
- `POST /api/pembayaran/:id/payments` requires `Idempotency-Key` header; service also derives deterministic fallback `sha256(pembayaranId+amount+date+ref)` (`src/modules/pembayaran/pembayaran.service.ts:217`). Unique `idempotencyKey` + catch `P2002` = replay returns original with `200`.
- Notifications: `dedupeKey = ${pembayaranId}:${channel}:${jenis}:${YYYY-MM-DD}` (`src/modules/notification/notification.service.ts:20`) with `@unique` — insert throws = "already sent today, skip". Resend (`POST /notification-log/:id/resend`) bypasses by appending `:resend:${Date.now()}`.

### 3.7 Status Derivation
- `Pembayaran.status` is **never** client-settable. Derived via `computePembayaranStatus(nominal, totalDibayar, due, now)` (`src/utils/paymentStatus.util.ts:19`). Partial = `SEBAGIAN` regardless of due date; overdue only when `totalDibayar <=0 && now > due`.

### 3.8 Logging & Env
- New env var → add to `src/config/env.ts:4` `envSchema` (zod). Make it `optional()` in dev/test, required only in production so `npm test` without Meta creds still boots.
- Use `logger.info/error` (`src/config/logger.ts:3`), not `console.log`. Add `LOG_LEVEL` support already present.

---

## 4) Adding a New Endpoint — checklist

1. **Read `PLAN.md §2`** — copy path/method/request/response/status/role exactly. Note `[proposed]` gaps — flag them, don't guess.
2. **Schema** — add `zod` schema in `<module>.schema.ts`.
3. **Service** — implement with property scoping + `AppError`. Wrap multi-write in `$transaction` + audit.
4. **Mapper** — convert Decimals/dates, omit internal fields, match frozen TS interface from `PLAN.md §2`.
5. **Controller** — thin, `apiSuccess`/`apiPagination`, correct status (201 vs 200 replay).
6. **Route** — `requireAuth` (+ `requireRole` if needed) + `validate`, register in `src/routes/index.ts`.
7. **Prisma** — `prisma/schema.prisma` change → `npm run prisma:migrate` → update mapper. Never hand-edit `migrations/*.sql` except backfill ordering noted in `PLAN.md §3`.
8. **Tests** — unit for pure fns (`compute*`, `isReminderDue`), integration for happy/404/403/validation, cross-property isolation, contract shape (`number` not `string`), pagination (`tests/*.test.ts` patterns).

---

## 5) Prisma & DB

- Provider `postgresql`. Models already carry `@unique([propertyId, nomor])`, `@unique([propertyId, code])`, etc. Keep that pattern.
- New index for reports: `@@index([propertyId, transactionDate])` already on `FinancialTransaction`.
- Seed: `prisma/seed.ts` + `seed-finance-categories.ts` for default categories (RENT, LATE_FEE, etc.). Use `DEFAULT_PROPERTY_ID` from `.env`.
- Backfills: one-off `scripts/backfill-*.ts` + `tsx`, not inline SQL when conditional logic needed.

---

## 6) API Response Shape

- Success: `{ success: true, data }` or `{ success: true, data: [], meta: { page, limit, total, totalPages } }` (`src/utils/apiResponse.ts:3`). Some older endpoints return `{ data, pagination: { page, pageSize, total, totalPages } }` — match `PLAN.md §2` per endpoint; new finance/logs use `pagination` object, kamar/pembayaran list uses `meta`.
- Error: `{ success: false, message, errors?, issues? }` via `validate` or `AppError`.
- Never leak stack traces (handled by `error.middleware.ts:20` → 500 generic).

---

## 7) Testing — run before push

```bash
npm run typecheck && npm run lint && npm test
```

- `jest.config.js:3` uses `ts-jest`, `roots src,tests`, `30s` timeout, `moduleNameMapper` for `.js` imports.
- Contract suite: assert every monetary field is `number`, not `string`; `AgingBucket.label` ∈ `{"current","1-30","31-60","61-90","90+"}`; pagination blocks correct.
- Isolation suite: `tests/` — seed two properties, assert 404 cross-property for **every** resource type.
- WhatsApp provider: mock HTTP (`whatsapp.client.ts`), never hit Meta in CI (`WHATSAPP_PROVIDER=mock`).

---

## 8) Docker / Prod

- `docker-compose.yml` — single `app` + `db` (postgres:16-alpine). New env vars via `.env`, no extra worker container unless load demands it. Webhook must be public (`APP_URL`).
- `npm run prisma:deploy` on fresh DB must succeed through all migrations.

---

## 9) Don't

- Don't add a new dependency when `zod`/`date-fns`/`decimal.js`/`prisma` already covers it.
- Don't create `interface I<Foo>Service`, `Factory`, or `Config` for a single implementation — one file is enough.
- Don't rename `Pembayaran`/`Kamar`/`Penyewa` to English.
- Don't read `propertyId` from client input.
- Don't return `Decimal` or `Date` objects directly — always map to `number`/`string`.
- Don't hard-delete financial history — `deletedAt` or offsetting reversal row.
- Don't put reminder/notification business logic outside `notification.service.ts` / `reminder.service.ts`.

---

## 10) Harness — PROGRESS.md & features_list.md

- **Before coding:** read `PROGRESS.md:1` (phase board — what's ✅/🟡/⬜) and `features_list.md:1` (row per frozen endpoint, `PLAN.md §2` inventory). They are the harness tracker; if they conflict with `PLAN.md`, `PLAN.md` wins.
- **After landing a phase:** update both in the same PR:
  1. Flip the phase `Status` in `PROGRESS.md §1`, note the PR/branch in `Notes`, and reconcile `PROGRESS.md §2` (grep `src/routes/index.ts:1` + `prisma/schema.prisma:1` + `prisma/migrations/*`).
  2. Flip the matching rows `Status` in `features_list.md` (§1–§9), fill `Implementation` file:line.
  3. Tick `PLAN.md §3` acceptance criteria for that phase.
- **Next milestone:** `PROGRESS.md:1` shows Phase 12 (Payment ↔ Finance) as the immediate `⬜` — wire `addPaymentRecord` → `FinancialTransaction RENT_PAYMENT` inside one `$transaction` before starting Phase 13.

---

## 11) Quick Reference — file:line for patterns to copy

- Auth guard: `src/middlewares/auth.middleware.ts:32`
- Role guard: `src/middlewares/role.middleware.ts:3`
- Property resolution: `src/config/property.ts:41` / `src/middlewares/property.middleware.ts:4`
- Validation: `src/middlewares/validate.middleware.ts:4`
- Error handling: `src/utils/apiError.ts:1` + `src/middlewares/error.middleware.ts:5`
- Decimal helper: `src/utils/serialize.util.ts:12`
- Status logic: `src/utils/paymentStatus.util.ts:19`
- Mapper pattern: `src/modules/pembayaran/pembayaran.mapper.ts:50` / `src/modules/financial-transaction/financial-transaction.mapper.ts`
- Idempotent payment: `src/modules/pembayaran/pembayaran.service.ts:236`
- Notification dedupe: `src/modules/notification/notification.service.ts:20`
- Audit in transaction: `src/modules/financial-transaction/financial-transaction.service.ts:58`
- Route registration: `src/routes/index.ts:1` + `src/app.ts:10`
- Env schema: `src/config/env.ts:4`
