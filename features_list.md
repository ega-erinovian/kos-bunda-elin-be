# features_list.md — Endpoint / Feature Inventory

> Mirrors `PLAN.md §2` frozen contract. One row per endpoint/shape. Keep in sync with `PROGRESS.md`.
> Status legend: `✅ live` · `🟡 partial` · `⬜ todo` — same as `PROGRESS.md`.

## Legend & conventions

- **Shaping**: `Decimal→number` via `src/utils/serialize.util.ts:12`, `Date→ISO string` in mappers, `404` not `403` on cross-property (`src/config/property.ts:41`).
- **Auth**: `requireAuth` = cookie `access_token` OR `Bearer` (`src/middlewares/auth.middleware.ts:32`); `[OWNER]` = `requireRole('OWNER')` (`src/middlewares/role.middleware.ts:3`).
- **Property**: new code uses `getRequestPropertyId(req)` (`src/config/property.ts:41`); Fase 0–4 still on `getDefaultPropertyId()` (debt in `PROGRESS.md §1 Phase 7`).
- **Idempotency**: `Idempotency-Key` required on `POST /pembayaran/:id/payments` (`src/modules/pembayaran/pembayaran.service.ts:217`).

## 0) Summary

| Domain | Live | Todo | Total |
|---|---|---|---|
| Payments & Billing (§2.1) | 6 | 0 | 6 |
| Notifications — Templates & Reminder Config (§2.2) | 5 | 0 | 5 |
| Notifications — Log / Send / Sweep / Webhook (§2.3) | 6 | 0 | 6 |
| Finance Ledger — Accounts/Categories/Transactions/Audit (§2.4) | 11 | 0 | 11 |
| Expenses & Reversal (§2.5) | 5 | 0 | 5 |
| Receivables & Aging (§2.6) | 3 | 0 | 3 |
| Tenant Deposits (§2.7) | 4 | 0 | 4 |
| Financial Reports (§2.8) | 8 | 0 | 8 |
| Dashboard Expansion (§2.9) | 0 | 1 | 1 |
| **Total frozen endpoints** | **48** | **1** | **49** |

> Counts include `GET/POST` webhook as 2 rows. Infra phases (7/18–21) have no user-facing endpoints.

## 1) Payments & Billing — Phase 5, extended by Phase 12

| ID | Feature | Endpoint | Method | Auth | Status | Implementation | Contract | Notes |
|---|---|---|---|---|---|---|---|---|
| F-PAY-01 | List bills | `/api/pembayaran?status=belum_bayar\|sebagian\|lunas\|terlambat\|akan_jatuh_tempo\|menunggak&penyewaId=&periodeBulan=&periodeTahun=&page=&limit=` | GET | `requireAuth` | ✅ | `src/modules/pembayaran/pembayaran.route.ts:13` + `pembayaran.service.ts:45` + `pembayaran.schema.ts:3` | `PLAN.md §2.1:119` | `akan_jatuh_tempo` = H-3→H, `menunggak` = `< today`; `page/limit` 1/20 max 100; status never client-settable |
| F-PAY-02 | Get bill detail (embeds paymentRecords) | `/api/pembayaran/:id` | GET | `requireAuth` | ✅ | `pembayaran.service.ts:117` + `pembayaran.mapper.ts:81` | `PLAN.md §2.1:121` + `§1 item 4` | `paymentRecords` only on detail, not list; ordered `paymentDate asc` |
| F-PAY-03 | Create bill | `/api/pembayaran` | POST | `requireAuth` | ✅ | `pembayaran.service.ts:125` | `PLAN.md §2.1:123` | `@@unique([penyewaId,periodeBulan,periodeTahun])`; `status` derived from `tanggalJatuhTempo` |
| F-PAY-04 | Patch bill (catatan/tanggalJatuhTempo only) | `/api/pembayaran/:id` | PATCH | `requireAuth` | ✅ | `pembayaran.service.ts:187` | `PLAN.md §2.1:124` | `status`/`nominal` never patchable |
| F-PAY-05 | Record payment (idempotent) | `/api/pembayaran/:id/payments` | POST | `requireAuth` | ✅ | `pembayaran.route.ts:21` + `pembayaran.service.ts:239` (`$transaction` + `createTransactionForPayment` + `writeAuditLog` + `404` on invalid `financialAccountId`) + `finance-integration.service.ts:12` + `pembayaran.mapper.ts:97` | `PLAN.md §2.1:126` + `§1 item 6` + `§1 item 5` | Header `Idempotency-Key` required + `sha256` fallback; `201` new / `200` replay; atomically creates `FinancialTransaction source=RENT_PAYMENT` (`Cash` fallback + `RENT` category) |
| F-PAY-06 | List payment history | `/api/pembayaran/:id/payments` | GET | `requireAuth` | ✅ | `pembayaran.service.ts:400` + `pembayaran.mapper.ts:97` (`financialTransactionId` via `financialTransaction` relation) | `PLAN.md §2.1:143` | `paymentDate asc`, `financialTransactionId` now non-null for RENT_PAYMENT rows (Phase 12) |

**Shapes:** `StatusPembayaran` `BELUM_BAYAR|SEBAGIAN|LUNAS|TERLAMBAT` (`schema.prisma:20`); `PaymentMethod` `CASH|BANK_TRANSFER|QRIS|E_WALLET|OTHER` (`schema.prisma:27`); `PaymentRecord.financialTransactionId?` present via Phase 12 (`financialTransaction` relation, `Decimal→number` via `serialize.util.ts:12`).

## 2) Notifications — Templates & Reminder Config — Phase 6

| ID | Feature | Endpoint | Method | Auth | Status | Implementation | Contract | Notes |
|---|---|---|---|---|---|---|---|---|
| F-NTF-01 | List message templates | `/api/message-template?channel=WEB_PUSH\|WHATSAPP` | GET | `requireAuth` | ✅ | `src/modules/message-template/message-template.route.ts` + `message-template.service.ts` + `message-template.mapper.ts` | `PLAN.md §2.2:168` | Scoped `@@unique([propertyId,channel,jenis])`; read DTO omits `propertyId` (`PLAN.md §1 item 10` proposed) |
| F-NTF-02 | Create message template | `/api/message-template` | POST | `OWNER` | ✅ | same module | `PLAN.md §2.2:169` + `§1 item 11` | Kept for seeding/ops, not exercised by FE |
| F-NTF-03 | Patch message template | `/api/message-template/:id` | PATCH | `OWNER` | ✅ | `message-template.service.ts` | `PLAN.md §2.2:170` | Body `{ isi: string }` |
| F-NTF-04 | Get reminder config | `/api/reminder-config` | GET | `requireAuth` | ✅ | `src/modules/reminder-config/reminder-config.route.ts` + `reminder-config.service.ts` | `PLAN.md §2.2:172` | Single row per property (`propertyId @unique`) |
| F-NTF-05 | Patch reminder config | `/api/reminder-config` | PATCH | `OWNER` | ✅ | `reminder-config.schema.ts` | `PLAN.md §2.2:173` | `offsets: int[-30,30]` sorted unique, `channels: non-empty subset`, `active: bool` |

## 3) Notifications — Log, Resend, Send, Sweep, Webhook — Phases 6/9/10

| ID | Feature | Endpoint | Method | Auth | Status | Implementation | Contract | Notes |
|---|---|---|---|---|---|---|---|---|
| F-NTF-06 | List notification log | `/api/notification-log?penyewaId=&channel=&status=&from=&to=&page=&pageSize=` | GET | `requireAuth` | ✅ | `src/modules/notification-log/notification-log.route.ts` + `notification-log.service.ts` + `notification-log.mapper.ts` | `PLAN.md §2.3:201` + `§1 item 2` | Returns `{ data: NotificationLog[], pagination: Pagination }`; `page/pageSize` default `1/50` |
| F-NTF-07 | Resend notification | `/api/notification-log/:id/resend` | POST | `requireAuth` | ✅ | `src/modules/notification/notification.service.ts:125` (`resendNotificationLog` — dedupeKey bypass `${orig}:resend:${Date.now()}`) | `PLAN.md §2.3:203` | Creates new row with independent id, new `providerMessageId` |
| F-NTF-08 | Manual send reminders | `/api/notification/reminders/send` | POST | `requireAuth` | ✅ | `src/modules/notification/notification.route.ts` + `reminder.service.ts:347` (`sendManualReminder`) | `PLAN.md §2.3:205` | Body `{ pembayaranId } \| { penyewaId }`; bypasses offset check, not dedupe |
| F-NTF-09 | Run sweep (cron + manual) | `/api/notification/reminders/run-sweep` | POST | `OWNER` | ✅ | `src/modules/notification/notification.route.ts` + `reminder.service.ts:213` (`runReminderSweep`), `src/jobs/reminder.job.ts` | `PLAN.md §2.3:208` | Multi-property loop; per-`ReminderConfig.offsets`; re-fetches `Pembayaran` before send; `SEBAGIAN` renders remaining balance |
| F-NTF-10 | WhatsApp webhook verify | `/api/notification/whatsapp/webhook` | GET | public (HMAC) | ✅ | `src/modules/notification/whatsapp-webhook.route.ts` + `whatsapp-webhook.controller.ts:37` | `PLAN.md §2.3:211` | Meta `hub.challenge` handshake vs `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| F-NTF-11 | WhatsApp webhook events | `/api/notification/whatsapp/webhook` | POST | public (HMAC) | ✅ | `whatsapp-webhook.controller.ts:222` (Meta + Evolution extraction, `X-Hub-Signature-256` HMAC) + `notification.service.ts:90` (`updateStatusFromWebhook`) | `PLAN.md §2.3:212` | Maps `sent/delivered/read/failed` → `NotificationStatus`; retry job `src/modules/notification/notification-retry.job.ts` with `2^retryCount` backoff, `[permanent]` pin |

**DTO note:** `NotificationLog` DTO omits `propertyId/penyewaId/pembayaranId/providerMessageId/retryCount/dedupeKey` (internal per `PLAN.md §2.3:233`).

## 4) Finance Ledger — Accounts, Categories, Transactions, Audit — Phase 11

| ID | Feature | Endpoint | Method | Auth | Status | Implementation | Contract | Notes |
|---|---|---|---|---|---|---|---|---|
| F-FIN-01 | List financial accounts | `/api/finance/accounts` | GET | `requireAuth` | ✅ | `src/modules/financial-account/financial-account.route.ts` + `financial-account.service.ts` + `financial-account.mapper.ts` | `PLAN.md §2.4:240` | Property-scoped; `@@unique([propertyId,name])` |
| F-FIN-02 | Create financial account | `/api/finance/accounts` | POST | `requireAuth` | ✅ | `financial-account.schema.ts` | `PLAN.md §2.4:241` | Body `{ name, type: FinancialAccountType, bankName?, accountNumber?, openingBalance }` |
| F-FIN-03 | Patch financial account | `/api/finance/accounts/:id` | PATCH | `requireAuth` | ✅ | `financial-account.service.ts` | `PLAN.md §2.4:244` | Property-scoped update |
| F-FIN-04 | List financial categories | `/api/finance/categories?type=INCOME\|EXPENSE` | GET | `requireAuth` | ✅ | `src/modules/financial-category/*` | `PLAN.md §2.4:246` | `@@unique([propertyId,code])` |
| F-FIN-05 | Create financial category | `/api/finance/categories` | POST | `requireAuth` | ✅ | `financial-category.service.ts` | `PLAN.md §2.4:247` | Body `{ type: CategoryType, code, name }` |
| F-FIN-06 | Patch financial category | `/api/finance/categories/:id` | PATCH | `requireAuth` | ✅ | `financial-category.service.ts` | `PLAN.md §2.4:250` | Validates type consistency |
| F-FIN-07 | List financial transactions | `/api/finance/transactions?type=&categoryId=&accountId=&from=&to=&page=&pageSize=` | GET | `requireAuth` | ✅ | `src/modules/financial-transaction/financial-transaction.route.ts:11` + `financial-transaction.service.ts:11` | `PLAN.md §2.4:252` + `§1 item 2` | `Pagination { page,pageSize,total,totalPages }`; `where.deletedAt = null`; `@@index([propertyId,transactionDate])` |
| F-FIN-08 | Create financial transaction (manual) | `/api/finance/transactions` | POST | `requireAuth` | ✅ | `financial-transaction.service.ts:42` (`sourceToType` + `$transaction` + `writeAuditLog`) | `PLAN.md §2.4:254` | `source` restricted to `MANUAL_INCOME/EXPENSE` (system sources `RENT_PAYMENT/DEPOSIT/*` not client-settable) |
| F-FIN-09 | Patch financial transaction | `/api/finance/transactions/:id` | PATCH | `requireAuth` | ✅ | `financial-transaction.service.ts:87` | `PLAN.md §2.4:258` | Only `description/referenceNumber/categoryId` editable; amount via reversal (Phase 13) |
| F-FIN-10 | Soft-delete financial transaction | `/api/finance/transactions/:id` | DELETE | `OWNER` | ✅ | `financial-transaction.service.ts:126` (`deletedAt`) | `PLAN.md §2.4:261` | Sets `deletedAt`, never hard delete; audit `TRANSACTION_SOFT_DELETED` |
| F-FIN-11 | List audit log | `/api/audit-log?entity=&entityId=&propertyId=&from=&to=` | GET | `OWNER` | ✅ | `src/modules/audit/audit.route.ts` + `audit.service.ts:1` (`writeAuditLog(tx,…)` inside same `$transaction`) + `audit.schema.ts` | `PLAN.md §2.4:263` | `entity=PaymentRecord/FinancialTransaction/Deposit`, `@@index([propertyId,entity,entityId])` |

**Enum:** `FinancialAccountType CASH|BANK|E_WALLET|QRIS|OTHER`; `CategoryType INCOME|EXPENSE`; `TransactionType INCOME|EXPENSE`; `TransactionSource RENT_PAYMENT|MANUAL_INCOME|MANUAL_EXPENSE|DEPOSIT|DEPOSIT_REFUND|ADJUSTMENT|REFUND` (`schema.prisma:79`).

## 5) Expenses & Reversal — Phase 13

| ID | Feature | Endpoint | Method | Auth | Status | Implementation | Contract | Notes |
|---|---|---|---|---|---|---|---|---|
| F-EXP-01 | Create expense | `/api/expenses` | POST | `requireAuth` | ✅ | `src/modules/expense/expense.route.ts:12` + `expense.service.ts:9` (`createExpense` `type=EXPENSE` + `writeAuditLog EXPENSE_CREATED`) | `PLAN.md §2.5:297` | `category.type=EXPENSE`, requires `vendorName`, `receiptUrl?` must be URL |
| F-EXP-02 | List expenses | `/api/expenses?categoryId=&accountId=&from=&to=&vendorName=` | GET | `requireAuth` | ✅ | `src/modules/expense/expense.route.ts:13` + `expense.service.ts:68` (`listExpenses` filtered, `vendorName` `contains` `insensitive`) | `PLAN.md §2.5:301` | Filtered `FinancialTransaction` list; `pagination { page,pageSize,total,totalPages }` |
| F-EXP-03 | Patch expense | `/api/expenses/:id` | PATCH | `requireAuth` | ✅ | `src/modules/expense/expense.route.ts:14` + `expense.service.ts:98` (`updateExpense` `vendorName`/`receiptUrl`/`description` only) | `PLAN.md §2.5:302` | Only `vendorName/receiptUrl/description`; amount via reversal |
| F-EXP-04 | Reverse expense | `/api/expenses/:id/reverse` | POST | `OWNER` | ✅ | `src/modules/expense/expense.route.ts:15` + `expense.service.ts:138` (`reverseExpense` → `reverseTransaction`) + `financial-transaction.service.ts` (`ADJUSTMENT`) | `PLAN.md §2.5:305` | Body `{ reason }` → `201 { reversal: FinancialTransaction }`; inserts offsetting `ADJUSTMENT` row, never mutates amount |
| F-EXP-05 | Reverse any transaction | `/api/finance/transactions/:id/reverse` | POST | `OWNER` | ✅ | `src/modules/financial-transaction/financial-transaction.route.ts` + `financial-transaction.service.ts:reverseTransaction` | `PLAN.md §2.5:308` | Same semantics as F-EXP-04 for manual income/expense |

## 6) Receivables & Aging — Phase 14

| ID | Feature | Endpoint | Method | Auth | Status | Implementation | Contract | Notes |
|---|---|---|---|---|---|---|---|---|
| F-RCV-01 | List receivables by tenant | `/api/receivables` | GET | `requireAuth` | ✅ | `src/modules/receivable/receivable.route.ts:11` + `receivable.service.ts:12` (`getReceivables` grouped by `penyewaId`, `outstanding = nominal - totalDibayar`, sorted `outstanding desc`) + `receivable.controller.ts:9` | `PLAN.md §2.6:316` | `outstanding = nominal - totalDibayar` per non-`LUNAS`; `ReceivableByTenant { penyewaId,nama,outstanding,unpaidPeriods }`; `Decimal→number` via `toNumberRequired`; `?asOf` additive |
| F-RCV-02 | Receivables summary | `/api/receivables/summary` | GET | `requireAuth` | ✅ | `src/modules/receivable/receivable.route.ts:10` + `receivable.service.ts:33` (`getSummary` `totalOutstanding`/`unpaidPeriodCount`/`propertyTotal` alias) | `PLAN.md §2.6:317` | `ReceivableSummary { totalOutstanding,unpaidPeriodCount,propertyTotal }`; `propertyTotal` = `totalOutstanding` per §2.6 reconciliation; `{ success:true, data }` envelope |
| F-RCV-03 | Aging buckets | `/api/receivables/aging` | GET | `requireAuth` | ✅ | `src/utils/aging.util.ts:1` (`daysPastDue`/`bucketLabel`/`bucketAging` — 5 buckets) + `src/modules/receivable/receivable.service.ts:43` (`getAging`) + `receivable.route.ts:11` | `PLAN.md §2.6:318` + `§1 item 3` | Labels exactly `"current"\|"1-30"\|"31-60"\|"61-90"\|"90+"` (not prose); always 5 buckets; `outstanding`/`count` per bucket; `?asOf` controls bucketing |

## 7) Tenant Deposits — Phase 15

| ID | Feature | Endpoint | Method | Auth | Status | Implementation | Contract | Notes |
|---|---|---|---|---|---|---|---|---|
| F-DEP-01 | Receive deposit | `/api/deposits` | POST | `requireAuth` | ✅ | `src/modules/deposit/deposit.route.ts:11` + `deposit.service.ts:33` (`receiveDeposit` via `penyewa.kamar.propertyId`, `DEPOSIT` category + Cash fallback, `$transaction` + `writeAuditLog DEPOSIT_RECEIVED`, `deposit.mapper.ts:1`) + `prisma/migrations/20260920055611_tenant_deposits/migration.sql` | `PLAN.md §2.7:337` | Body `{ penyewaId, amountReceived, receivedDate }` → `201 Deposit`; creates `FinancialTransaction source=DEPOSIT type=INCOME` in same `$transaction`; `Decimal→number` via `toNumberRequired` |
| F-DEP-02 | List deposits | `/api/deposits?penyewaId=&status=` | GET | `requireAuth` | ✅ | `deposit.route.ts:11` + `deposit.service.ts:78` (`listDeposits` where `propertyId` + optional `penyewaId`/`status`, ordered `receivedDate desc`) + `deposit.mapper.ts:1` | `PLAN.md §2.7:340` | `status=HELD\|PARTIALLY_REFUNDED\|REFUNDED\|FORFEITED`; no pagination (frozen contract); `FORFEITED` enum-only, renderable |
| F-DEP-03 | Deduct from deposit | `/api/deposits/:id/deduct` | PATCH | `requireAuth` | ✅ | `deposit.route.ts:11` + `deposit.service.ts:89` (`deductDeposit` replace `deductionAmount`/`deductionReason`, invariant `deduction+refund ≤ amountReceived` 400, status stays `HELD`, `writeAuditLog DEPOSIT_DEDUCTED`; no ledger row) | `PLAN.md §2.7:341` | Body `{ deductionAmount, deductionReason }` → `200 Deposit`; repeat replaces; 400 if `REFUNDED`/`FORFEITED` |
| F-DEP-04 | Refund deposit | `/api/deposits/:id/refund` | POST | `requireAuth` | ✅ | `deposit.route.ts:11` + `deposit.service.ts:131` (`refundDeposit` `$transaction` Cash fallback + auto-create `DEPOSIT_REFUND` EXPENSE, `refundDate` ≥ `receivedDate` 400, invariant 400, 409 if already `REFUNDED`/`FORFEITED`, status `PARTIALLY_REFUNDED`→`REFUNDED` when `deduction+refund ≥ amountReceived`, `writeAuditLog DEPOSIT_REFUNDED`) | `PLAN.md §2.7:344` | Body `{ refundAmount, refundDate }` → `200 Deposit`; creates `FinancialTransaction source=DEPOSIT_REFUND type=EXPENSE`; `FORFEITED` no endpoint (enum-only per FE sync) |

**Model:** `DepositStatus HELD|PARTIALLY_REFUNDED|REFUNDED|FORFEITED` + `Deposit { propertyId, penyewaId, amountReceived, receivedDate, deductionAmount, deductionReason?, refundAmount?, refundDate?, status }` (`schema.prisma:89`, `300`, `314`, `333`); `@@index([propertyId,penyewaId])`, `@@index([propertyId,status])`; `FinancialTransaction.depositId` FK (`migration.sql:29`).

## 8) Financial Reports — Phase 16

| ID | Feature | Endpoint | Method | Auth | Status | Implementation | Contract | Notes |
|---|---|---|---|---|---|---|---|---|
| F-RPT-01 | Dashboard report | `/api/reports/dashboard?from=&to=` | GET | `requireAuth` | ✅ | `src/modules/finance-report/finance-report.route.ts:11` + `finance-report.controller.ts:7` (`dashboard`) + `finance-report.service.ts:340` (`getDashboardReport`+`getRevenueTrend` UTC month `yyyy-MM` + `overdueRent` point-in-time + `occupancyRate` TERISI/active) + `src/routes/index.ts:44` | `PLAN.md §2.8:361` | `DashboardReport { revenue, expenses, cashFlow, occupancyRate, overdueRent, revenueTrend }` — old `overdueRent?`/`revenueTrend?` now always present (additive per `§1 item 1` still compatible); `from/to` optional defaults `startOfMonth(now)`→`now`, `MAX 1095d` 400, `getRequestPropertyId` isolated, UTC bucketing fixes `Asia/Jakarta` TZ drift |
| F-RPT-02 | Transaction report | `/api/reports/transactions?from=&to=&type=&categoryId=` | GET | `requireAuth` | ✅ | `finance-report.route.ts:11` (`transactions`) + `finance-report.service.ts:238` (`getTransactionsReport` `deletedAt=null` + `type`/`categoryId` filters + `transactionDate desc`) + `financial-transaction.mapper.ts` (`Decimal→number`) + `finance-report.schema.ts:11` | `PLAN.md §2.8:362` | Raw filtered transactions for table export; plain `{ data: FinancialTransaction[] }` no pagination as §2.8 wired (`supertest` verified); `type` and `categoryId` optional filters |
| F-RPT-03 | Revenue report | `/api/reports/revenue?from=&to=` | GET | `requireAuth` | ✅ | `finance-report.service.ts:74` (`getRevenueReport` billed=`Pembayaran.nominal` by `tanggalJatuhTempo`, cash=`PaymentRecord.amountPaid` by `paymentDate`, `otherIncome` excl `RENT_PAYMENT/DEPOSIT`, `collectionRate`=`cash/billed`, `expected`=billed) + `finance-report.schema.ts:3` + `controller:22` | `PLAN.md §2.8:363` | `RevenueReport { billedRevenue,cashRevenue,expectedRevenue,collectionRate,otherIncome }` — `otherIncome` always present (optional additive now concrete); `Decimal→number` via `Decimal.js`; verified `3M/2M/400k/0.666` hand-computed fixture + deposit excluded check |
| F-RPT-04 | Expense report | `/api/reports/expenses?from=&to=` | GET | `requireAuth` | ✅ | `finance-report.service.ts:126` (`getExpenseReport` `total` excl `DEPOSIT_REFUND` + `byCategory` groupBy `categoryId` `amount desc` + `trend` UTC month `amount`) + `schema/controller` | `PLAN.md §2.8:364` | `ExpenseReport { totalExpenses, byCategory: {categoryId,amount}[], trend: {month,amount}[] }` — `trend` always present (monthsBetween UTC `yyyy-MM` with 0-fill); verified `500k` excl refund + `byCategory` sum + trend `2026-01/02` |
| F-RPT-05 | Cash-flow report | `/api/reports/cash-flow?from=&to=` | GET | `requireAuth` | ✅ | `finance-report.service.ts:182` (`getCashFlowReport` inflow all `INCOME` incl `DEPOSIT/RENT_PAYMENT`, outflow all `EXPENSE` incl `DEPOSIT_REFUND`, `net=inflow-outflow`) | `PLAN.md §2.8:365` | `CashFlowReport { inflow,outflow,net }` — includes deposits (unlike revenue/expense), verified `3.4M/700k/2.7M` incl deposit/refund, `net` diverges from `netOperatingIncome` |
| F-RPT-06 | Income-statement report | `/api/reports/income-statement?from=&to=` | GET | `requireAuth` | ✅ | `finance-report.service.ts:216` (`getIncomeStatementReport` reuses `getRevenueReport`+`getExpenseReport`, `totalIncome=cash+other`, `NIO=income-expenses`) | `PLAN.md §2.8:366` | `IncomeStatementReport { totalIncome,totalExpenses,netOperatingIncome }` — excludes deposits from both sides, verified `2.4M/500k/1.9M` and `NIO≠netCash` divergence |
| F-RPT-07 | Receivables report (alias) | `/api/reports/receivables` | GET | `requireAuth` | ✅ | `finance-report.route.ts:11` + `controller:37` (`receivables` thin alias) + `receivable.service.ts:39` (`getReceivables` via `penyewa.kamar.propertyId`, `receivable.schema.ts:4` `asOf` guard) | `PLAN.md §2.8:367` | Same as F-RCV-01; thin wrapper, `getRequestPropertyId` + `resolveAsOf`, cross-checked alias vs `/api/receivables` equal `data.length` |
| F-RPT-08 | Aging report (alias) | `/api/reports/receivables/aging` | GET | `requireAuth` | ✅ | `finance-report.route.ts:11` + `controller:48` (`receivablesAging`) + `receivable.service.ts:77` (`getAging`+`bucketAging` `current`/`1-30`/…) + `receivable.schema.ts` | `PLAN.md §2.8:368` | Same as F-RCV-03; 5 buckets `current`/`1-30`/`31-60`/`61-90`/`90+`, validated alias vs direct buckets length 5 |

**Definitions:** `billed` = `Pembayaran.nominal` by `tanggalJatuhTempo`; `cash` = `PaymentRecord.amountPaid` by `paymentDate` (canonical per metric table, `FinancialTransaction RENT_PAYMENT` 1:1 and not double-counted: `otherIncome` excl `RENT_PAYMENT`, `totalIncome=cash+other`); deposits excluded from revenue (`otherIncome` excl `DEPOSIT`, `totalExpenses` excl `DEPOSIT_REFUND`) but included in cash flow (`inflow` all `INCOME` incl `DEPOSIT`, `outflow` all `EXPENSE` incl `DEPOSIT_REFUND`) per `PLAN.md §3 Phase 16 metric table` — verified divergence (`NIO 1.9M` vs `net 2.7M`).

## 9) Dashboard Expansion — Phase 17

| ID | Feature | Endpoint | Method | Auth | Status | Implementation | Contract | Notes |
|---|---|---|---|---|---|---|---|---|
| F-DSH-01 | Dashboard summary | `/api/dashboard/summary?from=&to=` | GET | `requireAuth` | ⬜ | `src/modules/dashboard/dashboard.service.ts` + `dashboard.mapper.ts` (missing) — composes `kamar`+`pembayaran` + Phase 16 + notification stats | `PLAN.md §2.9:397` `§1 item 9` | Additive `finance?: { totalReceivables, netOperatingIncomeThisMonth }`, `notifications?: { remindersSentToday, failedMessagesCount }`; never removes/renames existing keys |

## 10) How to use

- **Before coding:** pick next `⬜` in `PROGRESS.md §1` (Phase 17 is next). Implement exactly the row's `Contract` cell.
- **After coding:** flip `Status` to `✅`/`🟡`, fill `Implementation` file:line, add the PR to `PROGRESS.md §1 Notes`, and tick `PLAN.md §3` acceptance criteria.
- **Shape guard:** every monetary `Decimal→number` (`serialize.util.ts:12` + `Decimal.js` sums in `finance-report.service.ts`), `AgingBucket.label` literal set, `Pagination` shape (`page/pageSize/total/totalPages`), report `RevenueReport`/`ExpenseReport`/`CashFlowReport` shapes — contract suite in `PROGRESS.md §1 Phase 18` will fail otherwise.

## 11) Source-of-truth chain

`PLAN.md §2` (wire) → `features_list.md` (this inventory) → `PROGRESS.md` (phase narrative) → `src/*` (code). If rows conflict with `PLAN.md`, `PLAN.md` wins — fix the row.
