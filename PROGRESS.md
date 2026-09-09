# PROGRESS.md — Harness Engineering Tracker

> Single source for *what's built vs what's next*. Update this file on every phase landing.
> `features_list.md` is the endpoint inventory; this file is the phase narrative + checkboxes.
> `PLAN.md §2` is the wire contract; `AGENTS.md` is how to implement it.

**Branch:** `admin-finance` · **Last audited:** 2026-09-09 · **Auditor:** harness (codebase grep + migration + route inspection)

## Legend

- `✅ Done` — shipped, routes + service + schema + mapper + tests exist and `PLAN.md` acceptance criteria met
- `🟡 Partial` — code exists but diverges from `PLAN.md` (debt noted)
- `⬜ Todo` — not started / no route / no schema
- `🔒 Blocked` — depends on earlier `⬜`

## 0) At a glance

| Metric | Value |
|---|---|
| Phases complete (✅) | 11 / 21 |
| Endpoints live (`src/routes/index.ts:1` + `src/modules/*/ *.route.ts`) | 24 |
| Endpoints frozen in `PLAN.md §2` | ~43 |
| Migrations landed (`prisma/migrations/*`) | 6 |
| Last migration | `20260907000000_finance_foundation` |

## 1) Phase board

| Phase | Title | Status | Routes | Schema | Key files | Tests | Notes |
|---|---|---|---|---|---|---|---|
| **Fase 0** | Init (Express + TS + Prisma + zod + pino + jest) | ✅ Done | `src/app.ts:10`, `src/server.ts:1` | `prisma/schema.prisma:1` | `src/config/env.ts:4`, `src/config/prisma.ts:1` | `jest.config.js:3` pass | boilerplate locked |
| **Fase 1** | Prisma v1 (Property, Admin, Kamar, Penyewa, PushSubscription, RefreshToken) | ✅ Done | — | `schema.prisma:89`–`165` | `prisma/migrations/20260728144901_init` | — | `Property` + `Kamar.propertyId` present |
| **Fase 2** | Core skeleton (app, config, middlewares, utils, routes) | ✅ Done | `src/app.ts:10`, `src/routes/index.ts:1` | — | `src/middlewares/auth.middleware.ts:32`, `src/utils/apiError.ts:1` | `tests/*.test.ts` harness | mount order `helmet→cors→json{verify rawBody}→cookie→pino→/api→error` preserved |
| **Fase 3** | Auth (login/logout/me/refresh, httpOnly + hashed refresh) | ✅ Done | `src/modules/auth/auth.route.ts` | `RefreshToken` model | `src/modules/auth/auth.service.ts:1` | — | Bearer + cookie accepted `auth.middleware.ts:32`; DB wins over JWT claim |
| **Fase 4** | Kamar & Penyewa CRUD | ✅ Done | `src/modules/kamar/kamar.route.ts`, `src/modules/penyewa/penyewa.route.ts` | `Kamar @@unique([propertyId,nomor])` | `src/modules/kamar/kamar.service.ts:27`, `src/modules/penyewa/penyewa.service.ts` | `tests/kamar.test.ts`, `tests/penyewa.service.test.ts` | Uses `getDefaultPropertyId()` — flagged for Phase 7 migration |
| **Phase 5** | Payment Module (rev.) — `SEBAGIAN`, `PaymentRecord`, `totalDibayar`, idempotency | ✅ Done | `src/modules/pembayaran/pembayaran.route.ts:13` (6 routes) | `StatusPembayaran.SEBAGIAN`, `PaymentRecord` + `idempotencyKey @unique` | `src/modules/pembayaran/pembayaran.service.ts:236` (`addPaymentRecord` + `prisma.$transaction`), `src/utils/paymentStatus.util.ts:19`, `src/modules/pembayaran/pembayaran.mapper.ts:50`, `scripts/backfill-payment-records.ts` | `tests/pembayaran.test.ts`, `computePembayaranStatus` unit | `GET /api/pembayaran/:id` embeds `paymentRecords` only on detail (`mapper.ts:81`); `POST /payments` returns `201`/`200` replay |
| **Phase 6** | Notification Foundation (MessageTemplate, ReminderConfig, NotificationLog, provider abstraction) | ✅ Done | `src/modules/message-template/message-template.route.ts`, `src/modules/reminder-config/reminder-config.route.ts`, `src/modules/notification-log/notification-log.route.ts` | `MessageTemplate @@unique([propertyId,channel,jenis])`, `ReminderConfig offsets/channels`, `NotificationLog dedupeKey @unique` | `src/modules/notification/notification.service.ts:20` (`computeDedupeKey` + `P2002` guard), `src/modules/notification/providers/webpush.provider.ts`, `src/modules/notification/notification.types.ts` | dedupe + pagination blocks | `dedupeKey = ${pembayaranId}:${channel}:${jenis}:${YYYY-MM-DD}` |
| **Phase 7** | Multi-Property Context | 🟡 Partial | `src/middlewares/property.middleware.ts:4` (`resolveProperty`/`requireProperty`) | — (no migration) | `src/config/property.ts:41` (`getRequestPropertyId(req)`), `src/middlewares/auth.middleware.ts:59` (`req.user.propertyId` from DB) | cross-property isolation suite `⬜` (fixture helper missing) | Infra shipped. **Debt:** Fase 0–4 services still call `getDefaultPropertyId()` — must migrate to `getRequestPropertyId(req)` per `property.ts:28` note. New modules (finance, notification) already use `getRequestPropertyId`/`propertyId` param. |
| **Phase 8** | WhatsApp Module (Cloud API provider) | ✅ Done | — (reuses `channel=WHATSAPP` on existing routes) | `NotificationChannel.WHATSAPP` already in Phase 6 | `src/modules/notification/providers/whatsapp.provider.ts:46`, `src/modules/notification/whatsapp.client.ts`, `src/modules/message-template/whatsapp-template.util.ts` | provider unit (mock HTTP) | `WHATSAPP_PROVIDER=mock` in CI; `62xxxxxxxxxx` normalization enforced; template fallback on 24h window error |
| **Phase 9** | Payment Reminder Engine (sweep + manual send) | ✅ Done | `src/modules/notification/notification.route.ts` (`POST /reminders/send`, `POST /reminders/run-sweep [OWNER]`) | — | `src/modules/notification/reminder.service.ts:213` (`runReminderSweep` + `sendManualReminder`), `src/modules/notification/reminder-eligibility.util.ts`, `src/jobs/reminder.job.ts` | `tests/reminder-eligibility.test.ts`, `tests/reminder-engine.test.ts` | Per-property `ReminderConfig.offsets` + `channels`; re-fetches `Pembayaran` before send; `LUNAS` skip; `SEBAGIAN` balance rendered |
| **Phase 10** | WhatsApp Webhook, Delivery Tracking, Retry, Resend | ✅ Done | `src/modules/notification/whatsapp-webhook.route.ts` (GET+POST `/notification/whatsapp/webhook` [public]) + `POST /notification-log/:id/resend` | `NotificationLog.retryCount/status/providerMessageId/deliveredAt/readAt/failedAt` | `src/modules/notification/whatsapp-webhook.controller.ts:222` (HMAC `X-Hub-Signature-256` + Meta/Evolution extraction), `src/modules/notification/notification.service.ts:90` (`updateStatusFromWebhook` + `resendNotificationLog` + `retryFailedNotifications`), `src/modules/notification/notification-retry.job.ts` | `tests/whatsapp-hook.test.ts` | Public webhook verified by HMAC, not `requireAuth`; retry with `2^retryCount` backoff; permanent `[permanent]` pinned to `MAX_RETRY` |
| **Phase 11** | Finance Foundation (FinancialAccount, FinancialCategory, FinancialTransaction, AuditLog) | ✅ Done | `src/modules/financial-account/financial-account.route.ts`, `src/modules/financial-category/financial-category.route.ts`, `src/modules/financial-transaction/financial-transaction.route.ts`, `src/modules/audit/audit.route.ts` | `FinancialAccount`, `FinancialCategory`, `FinancialTransaction @@index([propertyId,transactionDate])`, `AuditLog` | `src/modules/financial-account/financial-account.service.ts`, `src/modules/financial-category/financial-category.service.ts`, `src/modules/financial-transaction/financial-transaction.service.ts:58` (`$transaction` + `writeAuditLog`), `src/modules/audit/audit.service.ts:1`, `prisma/seed-finance-categories.ts` | finance scoping tests | `FinancialTransaction.paymentRecordId @unique` reserved for Phase 12; soft delete via `deletedAt`; manual `source` restricted to `MANUAL_INCOME/EXPENSE` |
| **Phase 12** | Payment ↔ Finance Integration (auto RENT_PAYMENT transaction, idempotent) | ✅ Done | `src/modules/pembayaran/pembayaran.route.ts:21` (no new route) — `POST /api/pembayaran/:id/payments` now also creates `FinancialTransaction` | FK `PaymentRecord.financialAccountId → FinancialAccount` + `FinancialTransaction.paymentRecordId @unique` (`schema.prisma:198`, `312`) already via `20260907000000_finance_foundation` | `src/modules/pembayaran/pembayaran.service.ts:239` (`$transaction` + `createTransactionForPayment` + `writeAuditLog` + `idempotency` validation), `src/modules/finance/finance-integration.service.ts:12` (`RENT` category + `Cash` fallback + `RENT_PAYMENT` creation), `src/modules/pembayaran/pembayaran.mapper.ts:97` (`financialTransactionId` projection) | `tests/pembayaran.test.ts` (8/8) + manual `verify-phase12.ts` (7 checks: fallback, explicit account, idempotent `200`, detail/history `financialTransactionId`, `404` rollback, `RENT_PAYMENT` blocked manually, `amount` equality) | No gap — `addPaymentRecord` now atomically creates `PaymentRecord` → recompute `totalDibayar/status` → `FinancialTransaction source=RENT_PAYMENT` → backfill `financialAccountId` → `AuditLog PAYMENT_RECORDED`; `FinancialTransaction.paymentRecordId @unique` + `idempotencyKey @unique` guarantee no double-count. |
| **Phase 13** | Income & Expense Management (vendorName/receiptUrl, reversal) | ⬜ Todo | `POST /api/expenses`, `GET /api/expenses`, `PATCH /api/expenses/:id`, `POST /api/expenses/:id/reverse [OWNER]`, `POST /api/finance/transactions/:id/reverse [OWNER]` | `FinancialTransaction.vendorName/receiptUrl` already exist (`schema.prisma:321`) | `src/modules/expense/*` (missing) ; reversal = new `ADJUSTMENT` row, never mutate `amount` | — | Share ledger with Phase 11; `receiptUrl` is URL-only (client uploads to object storage) |
| **Phase 14** | Receivables (outstanding by tenant, summary, aging) | ⬜ Todo | `GET /api/receivables`, `/summary`, `/aging` | none (computed on read from `Pembayaran`) | `src/modules/receivable/receivable.service.ts` + `src/utils/aging.util.ts` (bucket labels `"current"`/`"1-30"`/`"31-60"`/`"61-90"`/`"90+"` per `PLAN.md §1 item 3`) | aging boundary tests | Receivables = `nominal - totalDibayar` for non-`LUNAS`; no materialized table yet |
| **Phase 15** | Tenant Deposits | ⬜ Todo | `POST /api/deposits`, `GET /api/deposits?penyewaId=&status=`, `PATCH /api/deposits/:id/deduct`, `POST /api/deposits/:id/refund` | `Deposit` model + `DepositStatus HELD/PARTIALLY_REFUNDED/REFUNDED/FORFEITED` (missing from `schema.prisma`) | `src/modules/deposit/*` | HELD→PARTIALLY→REFUNDED lifecycle | Deposits excluded from rental revenue, included in cash flow; `deduction+refund ≤ amountReceived` |
| **Phase 16** | Financial Reports (revenue, expenses, cash-flow, income-statement, dashboard) | ⬜ Todo | `GET /api/reports/*` (8 endpoints, `PLAN.md §2.8`) | `@@index([propertyId,transactionDate])` already | `src/modules/finance-report/*` | metric hand-computed fixture tests | Additive optional keys `otherIncome`, `overdueRent`, `trend` per `PLAN.md §1 item 1`; `from/to` capped by `REPORTS_MAX_RANGE_DAYS` |
| **Phase 17** | Dashboard Expansion (`GET /api/dashboard/summary` additive `finance`/`notifications`) | ⬜ Todo | `GET /api/dashboard/summary` | — | `src/modules/dashboard/dashboard.service.ts` + `dashboard.mapper.ts` (missing) | cross-check `finance` vs Phase 16, `notifications` vs log | Additive only, no renamed fields |
| **Phase 18** | Testing & Data Isolation (cross-property + contract suite) | 🟡 Partial | — | — | `tests/global-setup.ts`, `tests/setup-env.ts`, individual suites exist; **missing** `src/__tests__/isolation/cross-property.test.ts`, `src/__tests__/contract/response-shapes.test.ts`, `src/test-utils/seed-two-properties.ts` | existing suites pass; isolation parametrized suite pending | Must assert forged `propertyId` in body ignored; monetary fields are `number` not `string` |
| **Phase 19** | Docker / Prod Config | 🟡 Partial | — | — | `docker-compose.yml:1` (only `db`+`adminer`; `app` service missing), `.env.example:36` present | `docker-compose up` + `prisma migrate deploy` smoke pending | Webhook needs public `APP_URL`; WhatsApp creds optional in dev, required in prod (`src/config/env.ts:33`) |
| **Phase 20** | CI | 🟡 Partial | — | — | `.github/workflows/ci.yml` **missing** | `npm run typecheck && lint && test` local only | Needs `postgres:16-alpine` service, `DATABASE_URL`, `prisma migrate deploy` before `jest`, mock WhatsApp HTTP |
| **Phase 21** | README / API Docs | 🟡 Partial | — | — | `README.md` exists but missing WhatsApp setup, finance concepts, `ReminderConfig` offsets, multi-property migration path, full `PLAN.md §2` contract pointer | — | Mirror of frontend `CONTRACT.md` once it lands (`PLAN.md §0.1` precedence) |

## 2) Current harness state (what the auditor actually saw)

- **Routes wired** (`src/routes/index.ts:1`): `/health`, `/notification/whatsapp/webhook` (public), `/auth`, `/kamar`, `/penyewa`, `/pembayaran`, `/message-template`, `/reminder-config`, `/notification-log`, `/notification`, `/push`, `/finance/accounts`, `/finance/categories`, `/finance/transactions`, `/audit-log`. No `/expenses`, `/deposits`, `/receivables`, `/reports`, `/dashboard/summary` yet.
- **Schema signal**: `TransactionSource` already includes `RENT_PAYMENT/DEPOSIT/DEPOSIT_REFUND/ADJUSTMENT/REFUND` (`schema.prisma:79`) ahead of Phases 12/15; `FinancialTransaction.depositId: String?` is a plain string awaiting FK in Phase 15 (`schema.prisma:314`); `Deposit` model absent — confirms Phases 12–15 not landed.
- **Finance integration**: `src/modules/pembayaran/pembayaran.service.ts:239` now creates `FinancialTransaction source=RENT_PAYMENT` inside same `$transaction` via `src/modules/finance/finance-integration.service.ts:12`; `pembayaran.mapper.ts:97` projects `financialTransactionId`; fallback to `Cash` account + `RENT` category creation handled; `404` on invalid `financialAccountId` prevents `P2003`. Verified via `verify-phase12.ts` (7 checks) + `tests/pembayaran.test.ts` 8/8.
- **Migrations landed**: `20260728144901_init`, `20260728150554_add_refresh_token`, `20260816125116_payment_method_and_history`, `20260819204157_add_idempotency_key`, `20260828000000_notification_foundation`, `20260907000000_finance_foundation` — 6 migrations, matching phases through 11.

## 3) Next harness increment (proposed order)

1. **Phase 13** — thin `src/modules/expense/*` over `financial-transaction.service.ts` (`vendorName` required, `receiptUrl` URL, reversal as offsetting `ADJUSTMENT` row).
3. **Phase 14** — `receivable.service.ts` + `aging.util.ts` (literal labels `PLAN.md §1 item 3`).
4. **Phase 15** — `Deposit` model + `depositId` FK, deposit↔finance ledger linkage, exclusion from revenue reports.
5. **Phase 16/17** — `finance-report` + `dashboard` additive keys (`PLAN.md §2.8`/`§2.9`).
6. **Phase 18** — land `seed-two-properties` helper + isolation + contract suites (this unblocks Phases 19/20).
7. **Phase 19/20/21** — `docker-compose.yml` `app` service, `ci.yml` with Postgres service + `migrate deploy`, README consolidation.

## 4) How to update this file (harness rule)

1. After landing a phase, flip its `Status` in §1, add the PR/branch, and tick its checklist in `PLAN.md §3`.
2. Mirror the endpoint diff in `features_list.md` (same PR).
3. Keep §2 honest — grep `src/routes/index.ts`, `prisma/schema.prisma`, `prisma/migrations/*` before editing prose.
4. Never mark `✅` without: route registered, service property-scoped, `Decimal→number` mapped (`src/utils/serialize.util.ts:12`), `AppError` on 404, and isolation test for cross-property.

## 5) Cross-references

- **Wire contract:** `PLAN.md §2` (path/method/shape/status/role) — authoritative over this file.
- **How to code it:** `AGENTS.md §2` (module anatomy), `§3` (naming/isolation/Decimal/auth/idempotency), `§4` (endpoint checklist).
- **Endpoint inventory:** `features_list.md` — one row per frozen endpoint.
- **Contracts reconciled:** `PLAN.md §1` (11 reconciliations including `§1 item 7` Decimal→number, `§1 item 3` aging labels, `§1 item 6` Idempotency-Key).
