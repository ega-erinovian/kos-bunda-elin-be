# Plan v3: Backend "Kost Putri Bunda Elin" — Contract-Reconciled with `PLAN.md` (Frontend)

> This document **supersedes `PLAN_kost-bunda-elin-be_v2.md` as the wire contract**, while **keeping its
> internal implementation strategy** (Prisma schema, migrations, phase sequencing, business logic, cron
> jobs, auth model) wherever that strategy doesn't conflict with what the frontend already froze and
> tested against mocks in `PLAN.md`.
>
> Per `PLAN.md` §Phase 9's handoff instructions: *"Implement every endpoint in this document exactly as
> specified — path, method, request shape, response shape, status codes, and the stated auth/role gates.
> Internal implementation choices ... are entirely up to the backend team; `PLAN_kost-bunda-elin-be_v2.md`
> is a reasonable reference for that internal detail ... Where it does conflict, [the frontend document]
> is authoritative."*
>
> This plan follows that rule mechanically: **§1 lists every place the two source documents actually
> disagree, and the resolution adopted.** Everywhere they don't disagree (the large majority — the two
> documents were clearly developed in lockstep), this plan just carries v2's design forward unchanged.
> Phase numbering (**Phase 5 revision, Phase 6 → Phase 21**) is kept identical to v2, because that
> numbering encodes a real dependency order (multi-property before WhatsApp, finance foundation before
> payment integration, etc.) that has nothing to do with the frontend's build order and shouldn't be
> reshuffled to match it. A cross-reference table in §0.2 maps each backend phase to the frontend phase(s)
> that consume it.

---

## 0. How to use this document

### 0.1 Precedence

| Layer | Source of truth |
|---|---|
| Wire contract (path, method, request/response shape, status code, role gate) | `PLAN.md` (frontend), reproduced exactly in §2 below |
| Database schema, migrations, cron/job design, internal service boundaries, retry/backoff mechanics | `PLAN_kost-bunda-elin-be_v2.md`, carried forward unchanged unless §1 says otherwise |
| Anything the frontend contract left unspecified (a type it referenced but didn't fully define, a response shape it didn't pin down) | Defined here as an explicit **proposed addendum**, flagged, so the frontend's eventual `CONTRACT.md` (its own Phase 9 deliverable) can adopt or override it before either side ships |

### 0.2 Backend phase ↔ Frontend phase cross-reference

| Backend phase (this doc) | Frontend phase(s) it satisfies (`PLAN.md`) |
|---|---|
| Phase 5 (revision) — Payment Module | Phase 1 — Payments & Billing |
| Phase 6 — Notification Foundation | Phase 2 — Notifications (foundation the FE contract assumes) |
| Phase 7 — Multi-Property Context | infrastructure only; no direct FE phase, gates everything from Phase 8 on |
| Phase 8 — WhatsApp Module | Phase 2 — Notifications (WhatsApp channel) |
| Phase 9 — Payment Reminder Engine | Phase 2 — Notifications (send/sweep) |
| Phase 10 — WhatsApp Webhook, Delivery, Retry | Phase 2 — Notifications (log/resend) |
| Phase 11 — Finance Foundation | Phase 3 — Finance Ledger |
| Phase 12 — Payment ↔ Finance Integration | Phase 1 (financialAccountId), Phase 3 (linked transaction) |
| Phase 13 — Income and Expense Management | Phase 4 — Expenses |
| Phase 14 — Receivables | Phase 5 — Receivables & Aging |
| Phase 15 — Tenant Deposits | Phase 6 — Tenant Deposits |
| Phase 16 — Financial Reports | Phase 7 — Financial Reports |
| Phase 17 — Dashboard Expansion | Phase 8 — Dashboard Expansion |
| Phase 18 — Testing and Data Isolation | Phase 9 — Contract Freeze & Handoff (backend-side half) |
| Phase 19 — Docker/Prod Config | — (ops) |
| Phase 20 — CI | Phase 9 — proves the contract in §2 continuously |
| Phase 21 — README/API Docs | Phase 9 — the backend-facing mirror of `CONTRACT.md` |

### 0.3 What is unchanged from v2 (not repeated in full below)

Everything already marked "unchanged, completed" in v2 stays that way and is out of scope here:
**Fase 0 (init), Fase 1 (Prisma schema v1), Fase 2 (core skeleton), Fase 3 (auth), Fase 4 (kamar & penyewa
modules)**, the domain naming convention (Indonesian core models, English infrastructure/finance models),
and §0/§1/§2/§3 of the original v1 plan (Konteks, Tech Stack, Ringkasan Fitur, Struktur Folder baseline).

---

## 1. Reconciliation — every place this plan overrides `PLAN_kost-bunda-elin-be_v2.md`

These are the only real disagreements found between the two source documents (the vast majority of v2's
design was already consistent with the frontend's frozen contract — the two were evidently developed
together). Nothing in §3's Prisma schema needs to change for any of these; every reconciliation below is
an **API/DTO-layer** decision, not a data-model one.

| # | Area | `PLAN_kost-bunda-elin-be_v2.md` said | `PLAN.md` (frontend) froze | Resolution in this plan |
|---|---|---|---|---|
| 1 | Report metric richness | Phase 16's metric table includes "Other income" (separate from rental), "Overdue rent," and month-bucketed "Revenue trend"/"Expense trend" as first-class metrics | `RevenueReport`, `ExpenseReport`, `CashFlowReport`, `IncomeStatementReport`, `DashboardReport` interfaces have **no fields** for those four metrics | Compute all of v2's metrics as before, but expose the ones missing a home in the frozen types as **additive, optional** extra keys alongside the required ones (§2.16). Frontend's mock-tested code only reads the frozen keys, so nothing breaks; the extra keys are available the moment the frontend's `CONTRACT.md` is amended to consume them. Flagged for the frontend team to resolve permanently in their own `CONTRACT.md`. |
| 2 | List pagination shape | Not specified for `notification-log` or `finance/transactions` | Response type includes a bare `pagination` field, shape unspecified | Define once, reuse everywhere: `Pagination { page: number; pageSize: number; total: number; totalPages: number }`, with optional `page`/`pageSize` query params (default `1`/`50`), additive to the documented query strings (§2.4, §2.6). |
| 3 | Aging bucket labels | Prose labels ("Current", "1–30 days", "31–60 days", "61–90 days", "> 90 days") | Literal union type: `"current" \| "1-30" \| "31-60" \| "61-90" \| "90+"` | Adopt the frontend's exact literal strings as the wire values; v2's prose labels are display-only English glosses used **nowhere in the API**, kept only as internal code comments (§3, Phase 14). |
| 4 | `GET /api/pembayaran/:id` detail shape | Not explicitly revised in v2's endpoint list for Phase 5 | Frontend's extended `Pembayaran` type declares `paymentRecords?: PaymentRecord[]  // present on detail fetches only` | Phase 5 now explicitly embeds `paymentRecords` on the **detail** fetch only (not on list responses), additive field, no schema change (§2.1). |
| 5 | `PaymentRecord.financialTransactionId` | Implied by the `paymentRecordId @unique` relation on `FinancialTransaction` (Phase 12) but never spelled out as a response field | Frontend's Phase 3 note: *"a successful `POST /api/pembayaran/:id/payments` response additionally includes a `financialTransactionId` on the returned `paymentRecord` once linked"* | The Phase 5/12 response mapper for `PaymentRecord` projects the reverse relation into `financialTransactionId?: string`, present only once Phase 12 has linked it (§2.1, §3 Phase 12). |
| 6 | `Idempotency-Key` header | Optional — service derives a deterministic fallback key from `pembayaranId + amountPaid + paymentDate + referenceNumber` when the header is absent | Typed as **required**: `headers: { "Idempotency-Key": string } ` | Header is documented as **required** in the contract (§2.1) because the frontend always sends it. The deterministic-fallback code path from v2 is kept as defense-in-depth for any future non-FE client, but is not part of the documented contract and must never be relied on by the shipped frontend. |
| 7 | Decimal (de)serialization | Not addressed | Every monetary field is typed `number` (`amountPaid`, `nominal`, `totalDibayar`, `outstanding`, all finance/report/deposit amounts) | **New cross-cutting requirement (§4):** Prisma's `Decimal` type serializes to a *string* by default (`Decimal.prototype.toJSON`); every response mapper must call `.toNumber()` (or equivalent) before returning, or every one of these fields silently breaks the frontend's `number`-typed contract. This was not called out anywhere in v2 and is treated as a P0 implementation note, not an optional nicety. |
| 8 | `StatusPembayaran` casing in filters vs. field values | Not addressed explicitly (pre-existing behavior) | Filter values are lowercase (`status=sebagian`), the field itself returns uppercase (`"SEBAGIAN"`) | Confirmed as an intentional, pre-existing asymmetry carried over unchanged — not a new inconsistency introduced by this plan. Noted only so a future contract audit doesn't flag it as a bug. |
| 9 | `dashboard/summary` `finance`/`notifications` keys | v2: "additive keys only ... e.g. reminders sent today, failed messages needing attention" (prose, no type) | `PLAN.md` Phase 8: "response type gains optional `finance` and `notifications` keys" (also prose, no type) | Neither document actually freezes this shape. This plan proposes a concrete shape (§2.17) derived from the frontend's own Phase 8 UI spec (reminders sent today, failed messages needing attention, total receivables, net operating income this month) and flags it as **the** shape to implement against — the frontend team should copy it verbatim into their `CONTRACT.md` rather than re-deriving it. |
| 10 | `MessageTemplate` full response shape | Full Prisma model shown (§3, Phase 6) | Frontend references the type but the visible contract only pins the `PATCH` body (`{ isi: string }`) | This plan defines the read shape explicitly (§2.2), omitting `propertyId` (server-derived, never client-facing) from the DTO. Flagged as a proposed addendum, same as #9. |
| 11 | `POST /api/message-template` (create) | Present in v2's endpoint list | Absent from the frontend's frozen contract (only `GET`/`PATCH` are exercised; templates are treated as pre-seeded, one row per `jenis` × `channel`) | Endpoint is **kept** (useful for seeding/ops tooling, harmless additive surface) but explicitly marked **not required or exercised by the current frontend build** — its absence from frontend tests is not a compliance gap. OWNER-gated for consistency with `PATCH`. |

None of the above require a schema change (see §3 — the consolidated Prisma schema is identical to v2's).
All eleven are response-shaping, pagination, or documentation-completeness decisions.

---

## 2. Consolidated API Contract (implement exactly as written)

This section is the backend-facing equivalent of the frontend's own `CONTRACT.md` deliverable (its Phase
9). Everything here is either copied verbatim from `PLAN.md`'s frozen per-phase contracts, or — where
marked **[proposed]** — a concrete addendum filling a gap neither source document pinned down (see §1,
items 1, 2, 9, 10). All routes require `requireAuth` unless marked `[public]`; `[OWNER]` means
`requireRole('OWNER')` additionally. All routes are property-scoped per Phase 7 once it lands, using
`getDefaultPropertyId()` until then, matching v2's `§11` decision.

Shared type used throughout **[proposed, §1 item 2]**:
```ts
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
```

### 2.1 Payments & Billing (Phase 5, extended by Phase 12)

```
GET    /api/pembayaran?status=belum_bayar|sebagian|lunas|terlambat|akan_jatuh_tempo|menunggak
                                                        → 200 { data: Pembayaran[] }   (unchanged shape)
GET    /api/pembayaran/:id                             → 200 Pembayaran & { paymentRecords: PaymentRecord[] }
                                                          // paymentRecords embedded on DETAIL fetch only — new in this plan, §1 item 4
POST   /api/pembayaran                                 → 201 Pembayaran   (unchanged: create a bill)
PATCH  /api/pembayaran/:id                             → 200 Pembayaran   (catatan/tanggalJatuhTempo only — status is never client-settable)

POST   /api/pembayaran/:id/payments
  headers: { "Idempotency-Key": string }               // REQUIRED, §1 item 6
  body: {
    paymentMethod: "CASH" | "BANK_TRANSFER" | "QRIS" | "E_WALLET" | "OTHER";
    paymentDate: string;          // ISO date, not > now + 1 day
    amountPaid: number;           // > 0
    referenceNumber?: string;     // max 100 chars
    notes?: string;               // max 500 chars
    financialAccountId?: string;  // uuid, format-checked at Phase 5, existence-checked from Phase 12
  }
  → 201 {
      paymentRecord: PaymentRecord;
      pembayaran: { id: string; status: StatusPembayaran; totalDibayar: number; tanggalBayar: string | null };
      warning?: "overpaid";
    }
  Same Idempotency-Key + same body replayed → 200 with the original result (never a second record).

GET    /api/pembayaran/:id/payments                    → 200 { data: PaymentRecord[] }   // ordered by paymentDate ascending
```

```ts
type StatusPembayaran = "BELUM_BAYAR" | "SEBAGIAN" | "LUNAS" | "TERLAMBAT";
type PaymentMethod = "CASH" | "BANK_TRANSFER" | "QRIS" | "E_WALLET" | "OTHER";

interface PaymentRecord {
  id: string;
  pembayaranId: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  amountPaid: number;                       // Decimal → number, §1 item 7
  referenceNumber?: string;
  notes?: string;
  financialAccountId?: string;
  financialTransactionId?: string;          // present once linked by Phase 12, §1 item 5
  createdByAdmin?: { id: string; nama: string };
  createdAt: string;
}
```

### 2.2 Notifications — Templates & Reminder Config (Phase 6)

```
GET    /api/message-template?channel=WEB_PUSH|WHATSAPP → 200 { data: MessageTemplate[] }
POST   /api/message-template                    [OWNER] → 201 MessageTemplate   // kept, not exercised by FE — §1 item 11
PATCH  /api/message-template/:id  { isi: string } [OWNER] → 200 MessageTemplate

GET    /api/reminder-config                             → 200 ReminderConfig
PATCH  /api/reminder-config                      [OWNER]
  body: { offsets: number[]; channels: NotificationChannel[]; active: boolean }
  → 200 ReminderConfig
```

```ts
type NotificationChannel = "WEB_PUSH" | "WHATSAPP" | "EMAIL" | "SMS";

interface MessageTemplate {                // [proposed read shape], §1 item 10
  id: string;
  channel: NotificationChannel;
  jenis: string;                            // JenisPesan
  isi: string;
  aktif: boolean;
  updatedAt: string;
}

interface ReminderConfig {
  offsets: number[];
  channels: NotificationChannel[];
  active: boolean;
  updatedAt: string;
}
```

### 2.3 Notifications — Log, Resend, Send, Sweep (Phase 6, 9, 10)

```
GET    /api/notification-log?penyewaId=&channel=&status=&from=&to=&page=&pageSize=
                                                        → 200 { data: NotificationLog[]; pagination: Pagination }   // §1 item 2
POST   /api/notification-log/:id/resend                → 201 NotificationLog   // new row, independent id

POST   /api/notification/reminders/send
  body: { pembayaranId: string } | { penyewaId: string }
  → 200 { sent: NotificationLog[]; skipped: { reason: string }[] }
POST   /api/notification/reminders/run-sweep    [OWNER] → 200 { sent: number; skipped: number }

# Public, not behind requireAuth — Phase 10
GET    /api/notification/whatsapp/webhook        [public] # Meta verification handshake (hub.challenge)
POST   /api/notification/whatsapp/webhook        [public] # HMAC-verified via X-Hub-Signature-256
```

```ts
type NotificationStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

interface NotificationLog {
  id: string;
  channel: NotificationChannel;
  jenis: string;
  recipient: string;
  status: NotificationStatus;
  isiRingkas: string;
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  failedAt?: string;
  failureReason?: string;
}
```

*(Internal-only fields — `propertyId`, `penyewaId`, `pembayaranId`, `providerMessageId`, `retryCount`,
`dedupeKey` — exist on the Prisma model per v2 §3 Phase 6 but are intentionally omitted from this DTO;
they are not part of the frontend contract.)*

### 2.4 Finance Ledger — Accounts, Categories, Transactions (Phase 11, 12)

```
GET    /api/finance/accounts                             → 200 { data: FinancialAccount[] }
POST   /api/finance/accounts
  body: { name: string; type: FinancialAccountType; bankName?: string; accountNumber?: string; openingBalance: number }
  → 201 FinancialAccount
PATCH  /api/finance/accounts/:id                          → 200 FinancialAccount

GET    /api/finance/categories?type=INCOME|EXPENSE       → 200 { data: FinancialCategory[] }
POST   /api/finance/categories
  body: { type: CategoryType; code: string; name: string }
  → 201 FinancialCategory
PATCH  /api/finance/categories/:id                        → 200 FinancialCategory

GET    /api/finance/transactions?type=&categoryId=&accountId=&from=&to=&page=&pageSize=
                                                          → 200 { data: FinancialTransaction[]; pagination: Pagination }   // §1 item 2
POST   /api/finance/transactions
  body: { accountId: string; categoryId: string; amount: number; transactionDate: string;
          description?: string; referenceNumber?: string; source: "MANUAL_INCOME" | "MANUAL_EXPENSE" }
  → 201 FinancialTransaction
PATCH  /api/finance/transactions/:id
  body: { description?: string; referenceNumber?: string; categoryId?: string }
  → 200 FinancialTransaction
DELETE /api/finance/transactions/:id             [OWNER]  → 204   // soft delete (deletedAt)

GET    /api/audit-log?entity=&entityId=&propertyId=&from=&to=  [OWNER] → 200 { data: AuditLogEntry[] }
```

```ts
type FinancialAccountType = "CASH" | "BANK" | "E_WALLET" | "QRIS" | "OTHER";
type CategoryType = "INCOME" | "EXPENSE";
type TransactionType = "INCOME" | "EXPENSE";
type TransactionSource =
  | "RENT_PAYMENT" | "MANUAL_INCOME" | "MANUAL_EXPENSE"
  | "DEPOSIT" | "DEPOSIT_REFUND" | "ADJUSTMENT" | "REFUND";

interface FinancialAccount {
  id: string; name: string; type: FinancialAccountType;
  bankName?: string; accountNumber?: string; openingBalance: number; active: boolean;
}
interface FinancialCategory {
  id: string; type: CategoryType; code: string; name: string; active: boolean;
}
interface FinancialTransaction {
  id: string; accountId: string; categoryId: string; tenantId?: string; pembayaranId?: string;
  paymentRecordId?: string; depositId?: string;
  type: TransactionType; source: TransactionSource; amount: number;         // Decimal → number, §1 item 7
  transactionDate: string; description?: string; referenceNumber?: string;
  vendorName?: string; receiptUrl?: string; createdAt: string; deletedAt?: string;
}
interface AuditLogEntry {
  id: string; entity: string; entityId: string; action: string;
  beforeValue?: unknown; afterValue?: unknown; adminId?: string; createdAt: string;
}
```

### 2.5 Expenses & Reversal (Phase 13)

```
POST   /api/expenses
  body: { categoryId: string; accountId: string; amount: number; transactionDate: string;
          vendorName: string; receiptUrl?: string }
  → 201 FinancialTransaction   // type=EXPENSE
GET    /api/expenses?categoryId=&accountId=&from=&to=&vendorName= → 200 { data: FinancialTransaction[] }
PATCH  /api/expenses/:id
  body: { vendorName?: string; receiptUrl?: string; description?: string }
  → 200 FinancialTransaction
POST   /api/expenses/:id/reverse                 [OWNER]
  body: { reason: string }
  → 201 { reversal: FinancialTransaction }
POST   /api/finance/transactions/:id/reverse     [OWNER]
  body: { reason: string }
  → 201 { reversal: FinancialTransaction }
```

### 2.6 Receivables & Aging (Phase 14)

```
GET    /api/receivables                → 200 { data: ReceivableByTenant[] }
GET    /api/receivables/summary        → 200 ReceivableSummary
GET    /api/receivables/aging          → 200 { buckets: AgingBucket[] }
```

```ts
interface ReceivableByTenant {
  penyewaId: string; nama: string; outstanding: number; unpaidPeriods: number;
}
interface ReceivableSummary {
  totalOutstanding: number; unpaidPeriodCount: number; propertyTotal: number;
}
interface AgingBucket {
  label: "current" | "1-30" | "31-60" | "61-90" | "90+";   // §1 item 3
  outstanding: number; count: number;
}
```

### 2.7 Tenant Deposits (Phase 15)

```
POST   /api/deposits
  body: { penyewaId: string; amountReceived: number; receivedDate: string }
  → 201 Deposit
GET    /api/deposits?penyewaId=&status=  → 200 { data: Deposit[] }
PATCH  /api/deposits/:id/deduct
  body: { deductionAmount: number; deductionReason: string }
  → 200 Deposit
POST   /api/deposits/:id/refund
  body: { refundAmount: number; refundDate: string }
  → 200 Deposit
```

```ts
type DepositStatus = "HELD" | "PARTIALLY_REFUNDED" | "REFUNDED" | "FORFEITED";
interface Deposit {
  id: string; penyewaId: string; amountReceived: number; receivedDate: string;
  deductionAmount: number; deductionReason?: string;
  refundAmount?: number; refundDate?: string; status: DepositStatus;
}
```

### 2.8 Financial Reports (Phase 16)

```
GET /api/reports/dashboard?from=&to=                       → 200 DashboardReport
GET /api/reports/transactions?from=&to=&type=&categoryId=  → 200 { data: FinancialTransaction[] }
GET /api/reports/revenue?from=&to=                         → 200 RevenueReport
GET /api/reports/expenses?from=&to=                        → 200 ExpenseReport
GET /api/reports/cash-flow?from=&to=                       → 200 CashFlowReport
GET /api/reports/income-statement?from=&to=                → 200 IncomeStatementReport
GET /api/reports/receivables                                → thin alias of §2.6
GET /api/reports/receivables/aging                           → thin alias of §2.6
```

```ts
interface RevenueReport {
  billedRevenue: number; cashRevenue: number; expectedRevenue: number; collectionRate: number;
  otherIncome?: number;                          // [proposed additive, §1 item 1]
}
interface ExpenseReport {
  totalExpenses: number; byCategory: { categoryId: string; amount: number }[];
  trend?: { month: string; amount: number }[];   // [proposed additive, §1 item 1]
}
interface CashFlowReport { inflow: number; outflow: number; net: number }
interface IncomeStatementReport { totalIncome: number; totalExpenses: number; netOperatingIncome: number }
interface DashboardReport {
  revenue: RevenueReport; expenses: ExpenseReport; cashFlow: CashFlowReport;
  occupancyRate: number;
  overdueRent?: number;                                   // [proposed additive, §1 item 1]
  revenueTrend?: { month: string; billedRevenue: number; cashRevenue: number }[];  // [proposed additive]
}
```

All five report metric definitions (billed vs. cash basis, what counts as "revenue" vs. "other income",
occupancy formula) are computed exactly per v2 §Phase 16's metric table — see §3, Phase 16, for the full
table. Only the **response shape** is reconciled here; the **computation** is unchanged from v2.

### 2.9 Dashboard Expansion (Phase 17)

```
GET /api/dashboard/summary?from=&to=   → 200 {
  kamar: /* unchanged */;
  pembayaran: /* unchanged */;
  finance?: { totalReceivables: number; netOperatingIncomeThisMonth: number };      // [proposed], §1 item 9
  notifications?: { remindersSentToday: number; failedMessagesCount: number };      // [proposed], §1 item 9
}
```

No existing field of `kamar`/`pembayaran` is renamed, removed, or retyped — matches both source documents
exactly.

---

## 3. Implementation Plan by Phase

Structure per phase, unchanged from v2's format: **Objective → Database changes → Files → Business logic
→ Validation → Authorization → Tests → Acceptance criteria.** The **Contract** subsection of each phase
below is a pointer into §2 (single source of truth) rather than being repeated; only genuinely new
implementation detail is written out per phase. Everything not repeated here (exact migration SQL,
`prisma.$transaction` step ordering, retry/backoff formulas, webhook signature verification, etc.) is
**unchanged from `PLAN_kost-bunda-elin-be_v2.md`** at the section noted.

### Phase 5 (revision) — Payment Module

**Objective:** Add partial-payment/payment-history support to `Pembayaran` without breaking any existing
row or endpoint. *(v2 §A, unchanged.)*

**Database changes:** unchanged from v2 §A.3 — one new enum value (`SEBAGIAN`), one new enum
(`PaymentMethod`), one new table (`PaymentRecord`), two new columns on `Pembayaran`
(`totalDibayar`, plus the existing `tanggalBayar` gains its new meaning). Migration steps, backfill
script, and rationale are unchanged from v2 §A.3/§A.4.

**Contract:** §2.1 above. **New vs. v2:** the detail-fetch `paymentRecords` embed (§1 item 4) and the
required `Idempotency-Key` header framing (§1 item 6).

**Files to create or modify:** unchanged from v2 §A.4, **plus**:
- `src/modules/pembayaran/pembayaran.mapper.ts` — **new**, the response-mapper enforcing §1 items 4, 5, 7
  (embeds `paymentRecords` on detail only; projects `financialTransactionId` once Phase 12 links it;
  converts every `Decimal` to `number`).

**Business logic:** `computePembayaranStatus` and `addPaymentRecord` transaction steps are unchanged from
v2 §A.6. Overpayment is allowed with a `warning: "overpaid"` field, not blocked, per v2's explicit
decision.

**Validation:** unchanged from v2 §A.7.

**Authorization:** unchanged from v2 §A.8 (property-scope check upgraded in Phase 7).

**Tests:** unchanged from v2 §A.9, **plus**:
- Detail fetch (`GET /api/pembayaran/:id`) includes `paymentRecords`; list fetch (`GET /api/pembayaran`)
  does not.
- Every monetary field in the payment response is a JSON `number`, never a `string` (regression test for
  §1 item 7 — this is the single easiest contract violation to introduce by accident).

**Acceptance criteria:** unchanged from v2 §A.10, plus: response shapes match §2.1 exactly, verified by a
contract test that type-checks a captured response against the frozen TypeScript interfaces (see §5).

---

### Phase 6 — Notification Foundation + Web Push Refactor

**Objective, database changes, files, business logic, validation, authorization, tests:** unchanged from
v2 (§B, Phase 6) in full — the channel-agnostic `notification.service.ts`, `dedupeKey` mechanism,
`MessageTemplate`/`ReminderConfig`/`NotificationLog` schema, and migration notes are adopted as-is.

**Contract:** §2.2 and §2.3 above. **New vs. v2:** the `MessageTemplate` read DTO (§1 item 10) and the
`pagination` field on the notification-log list (§1 item 2) both need a response mapper
(`src/modules/notification-log/notification-log.mapper.ts`,
`src/modules/message-template/message-template.mapper.ts`) that v2 didn't call out as a separate file —
added here as an explicit deliverable of this phase.

**Acceptance criteria:** unchanged from v2, plus: `GET /api/notification-log` response includes a
correctly-computed `pagination` block (`total`/`totalPages` match the unfiltered count, `page`/`pageSize`
respected).

---

### Phase 7 — Multi-Property Context for New Modules

Unchanged from v2 (§B, Phase 7) in full — objective, JWT claim addition, `resolveProperty` middleware,
`getRequestPropertyId()`, and the cross-property isolation test requirements it establishes for every
phase after it. No contract-layer reconciliation applies to this phase (middleware-only, no new
endpoints).

---

### Phase 8 — WhatsApp Module

Unchanged from v2 (§B, Phase 8) in full — `NotificationProvider` implementation, Cloud API client, phone
number format validation. No new endpoints in this phase; the contract it enables (`channel=WHATSAPP` on
already-defined endpoints) is already captured in §2.2/§2.3.

---

### Phase 9 — Payment Reminder Engine

Unchanged from v2 (§B, Phase 9) in full — `reminder.service.ts`, `isReminderDue`, offset-matching logic,
`SEBAGIAN` remaining-balance messaging, dedupe-guard interaction between manual send and scheduled sweep.

**Contract:** §2.3 above (`POST /api/notification/reminders/send`, `POST .../run-sweep`) — matches v2
verbatim, no reconciliation needed.

---

### Phase 10 — WhatsApp Webhook, Delivery Tracking, Retry, Failure Logging

Unchanged from v2 (§B, Phase 10) in full — webhook signature verification, status mapping, retry job with
backoff, permanent-vs-transient error classification.

**Contract:** §2.3 above. Matches v2 verbatim.

---

### Phase 11 — Finance Foundation (Accounts, Categories, Transactions)

**Database changes, files, business logic, validation, authorization, tests:** unchanged from v2 (§B,
Phase 11) in full, including the `AuditLog` foundation and the "expenses are `FinancialTransaction` rows
with `type=EXPENSE`, not a separate table" design note.

**Contract:** §2.4 above. **New vs. v2:** the `pagination` field on `GET /api/finance/transactions` (§1
item 2), and every monetary field (`openingBalance`, `amount`) must be mapper-converted from `Decimal` to
`number` (§1 item 7) — add `src/modules/financial-transaction/financial-transaction.mapper.ts`,
`src/modules/financial-account/financial-account.mapper.ts` as explicit deliverables.

**Acceptance criteria:** unchanged from v2, plus: `GET /api/finance/transactions` pagination block is
correct under every filter combination.

---

### Phase 12 — Payment ↔ Finance Integration

Unchanged from v2 (§B, Phase 12) in full — the FK constraints deferred from Phase 5/11, the single
`prisma.$transaction` sequence (record payment → recompute status → create linked transaction → link
account back onto the payment record → write audit log), and the idempotency mechanism
(`PaymentRecord.idempotencyKey @unique` + `FinancialTransaction.paymentRecordId @unique`).

**Contract:** no new endpoints. This phase is what makes §2.1's `financialTransactionId` field
(§1 item 5) start appearing in `PaymentRecord` responses — the response mapper added in Phase 5
(`pembayaran.mapper.ts`) reads the now-populated relation; no mapper change needed here, only the
underlying data becoming available.

**Acceptance criteria:** unchanged from v2, plus: once this phase ships, every `PaymentRecord` returned by
§2.1 for a rent payment includes a non-null `financialTransactionId`.

---

### Phase 13 — Income and Expense Management

**Database changes, files, business logic, validation, authorization, tests:** unchanged from v2 (§B,
Phase 13) in full — expense module as a thin view over `financial-transaction.service.ts`,
`reverseTransaction()` always inserting an offsetting row rather than mutating/deleting, receipt handling
as a URL-only field (no upload pipeline).

**Contract:** §2.5 above. **New vs. v2:** the reversal endpoints' response is explicitly
`{ reversal: FinancialTransaction }` (wrapped), not a bare `FinancialTransaction` — v2's endpoint list
didn't specify the wrapper; adopt the frontend's frozen shape.

---

### Phase 14 — Receivables

**Database changes, files, business logic, validation, authorization, tests:** unchanged from v2 (§B,
Phase 14) in full — computed-on-read design (no `ReceivableSnapshot` table), aging bucket boundaries.

**Contract:** §2.6 above. **New vs. v2:** aging bucket `label` values use the frontend's exact literal
strings (`"current" | "1-30" | "31-60" | "61-90" | "90+"`), not v2's prose labels (§1 item 3) — update
`src/utils/aging.util.ts`'s bucket constant accordingly; the bucket **boundaries** themselves (≤0, 1–30,
31–60, 61–90, >90 days past due) are unchanged from v2.

---

### Phase 15 — Tenant Deposits

Unchanged from v2 (§B, Phase 15) in full — `Deposit` schema, the deposit-received/refund/forfeiture
transaction sequences, and the "excluded from revenue, included in cash flow" enforcement mechanism
(filtering `source = DEPOSIT`/`DEPOSIT_REFUND` out of revenue-specific aggregations rather than leaving
deposits out of the ledger entirely).

**Contract:** §2.7 above. Matches v2 verbatim.

---

### Phase 16 — Financial Reports

**Database changes, files, business logic (metric computation), validation, authorization, tests:**
unchanged from v2 (§B, Phase 16) in full, **including the full metric definition table** (billed vs. cash
basis for every metric, occupancy formula) — reproduced here for completeness since §2.8 depends on it:

| Metric | Basis | Definition |
|---|---|---|
| Rental revenue | Billed / Cash | Billed: sum of `Pembayaran.nominal` due in range. Cash: sum of `PaymentRecord.amountPaid` in range. Both exposed as `billedRevenue`/`cashRevenue`. |
| Other income | Cash | Sum of `INCOME` transactions, `source NOT IN (RENT_PAYMENT, DEPOSIT)`, in range. |
| Total income | Cash | Cash rental revenue + other income. |
| Total expenses | Cash | Sum of `EXPENSE` transactions, `source != DEPOSIT_REFUND`, not soft-deleted/reversed, in range. |
| Net operating income | Cash | Total income − total expenses. |
| Cash inflow / outflow | Cash | All `INCOME`/`EXPENSE` transactions respectively, including deposit movements. |
| Outstanding / overdue rent | Billed | `nominal - totalDibayar` for non-`LUNAS` bills, as of `to`; "overdue" restricted to `tanggalJatuhTempo < to`. |
| Collection rate | Billed vs. Cash | cash rental revenue ÷ billed rental revenue, in range. |
| Expected rental revenue | Billed | Sum of `nominal` for all bills due in range, regardless of status. |
| Expense by category | Cash | Total expenses grouped by `categoryId`. |
| Revenue / expense trend | Cash | Respective cash metric, bucketed by month across the range. |
| Occupancy rate | n/a | `TERISI` kamar ÷ total active kamar, as of `to`. |

**Contract:** §2.8 above. **New vs. v2:** the response shape reconciliation from §1 item 1 — every metric
in the table above is computed exactly as specified, but "Other income," "Overdue rent," and the two
trend series are surfaced as the additive optional fields shown in §2.8, since the frontend's frozen
interfaces don't have required slots for them.

**Acceptance criteria:** unchanged from v2, plus: every field in §2.8's interfaces (required and
optional) is present and correctly computed; a contract test asserts the required fields alone are
sufficient to satisfy the frozen frontend types (i.e., the additive fields are genuinely additive, never
a substitute for a required one).

---

### Phase 17 — Dashboard Expansion

**Database changes, business logic:** unchanged from v2 (§B, Phase 17) — additive `finance`/`notifications`
keys composed from Phase 16's report service and Phase 10's notification stats, existing `kamar`/
`pembayaran` keys untouched.

**Files to create or modify:** unchanged from v2, **plus** `src/modules/dashboard/dashboard.mapper.ts` —
**new**, implementing the concrete `finance`/`notifications` shape proposed in §2.9 (§1 item 9), since
neither source document pinned this down and a mapper makes the decision explicit and testable rather
than implicit in `dashboard.service.ts`.

**Contract:** §2.9 above.

**Acceptance criteria:** unchanged from v2 (`GET /api/dashboard/summary` fully backward compatible), plus:
`finance.totalReceivables` matches §2.6's `ReceivableSummary.totalOutstanding` for the same `to` date, and
`notifications.failedMessagesCount` matches a `GET /api/notification-log?status=FAILED` count for the same
range — both cross-checked in a single integration test so the dashboard card and the underlying detail
view (which the frontend's Phase 8 UI explicitly links together) can never silently diverge.

---

### Phase 18 — Testing and Data Isolation

Unchanged from v2 (§B, Phase 18) in full — the parametrized cross-property isolation suite, the
two-property/two-admin seed fixture, and the "forged `propertyId` in body/query is ignored" test pattern.

**New addition (not in v2):** a **contract-compliance suite**,
`src/__tests__/contract/response-shapes.test.ts`, that hits every endpoint in §2 against seeded fixture
data and validates the JSON response against the exact TypeScript interfaces in §2 (via `zod` schemas
mirroring those interfaces, or a JSON-schema derived from them) — specifically checking:
- every documented `number` field is a JSON number, never a string (catches §1 item 7 regressions),
- every documented required field is present,
- every documented status code is the one actually returned,
- `AgingBucket.label` values are exactly the frontend's literal set (§1 item 3),
- pagination blocks (§1 item 2) are structurally correct.

This is the backend-side mechanism that makes "flipping `NEXT_PUBLIC_API_MODE` to `live` requires no
frontend code change" (the frontend's own Phase 9 acceptance criterion) actually verifiable from the
backend side too, rather than only discoverable by manually pointing the frontend at a live backend.

**Acceptance criteria:** unchanged from v2, plus: the contract-compliance suite passes in CI (Phase 20)
for every endpoint in §2, with zero exceptions.

---

### Phase 19 — Docker and Production Configuration

Unchanged from v2 (§B, Phase 19) in full.

### Phase 20 — CI

Unchanged from v2 (§B, Phase 20) in full, **plus**: the new Phase 18 contract-compliance suite runs as
part of the same required `npm test` step (not a separate optional job) so a shape regression blocks the
PR the same way an isolation-test regression would.

### Phase 21 — README and API Documentation

Unchanged from v2 (§B, Phase 21) in full, **plus**: the README's API reference section should explicitly
state that §2 of *this* document is the canonical contract (superseding v2's §C.3 endpoint list, which is
now historical), and should link to the frontend's `CONTRACT.md` once that lands, noting the precedence
rule from §0.1.

---

## 4. Cross-cutting implementation requirements (new in this plan, apply to every phase above)

1. **Decimal → number serialization (§1 item 7).** Every module's response mapper must explicitly convert
   Prisma `Decimal` fields to JS `number` before they reach `res.json()`. Recommended: a single shared
   helper, `src/utils/serialize.util.ts` exporting `toNumber(d: Decimal | null): number | null`, used by
   every `.mapper.ts` file introduced above, rather than relying on each module remembering to do it
   independently. Add a lint rule or a codebase-wide test (Phase 18's contract suite) that fails if any
   endpoint in §2 returns a `string` for a field documented as `number`.
2. **One `.mapper.ts` per module that has a frozen contract shape.** This plan introduces the convention
   (v2 didn't have one) that DTO shaping lives in an explicit, unit-testable file, not inline in
   controllers — see the `pembayaran.mapper.ts`, `notification-log.mapper.ts`,
   `message-template.mapper.ts`, `financial-transaction.mapper.ts`, `financial-account.mapper.ts`, and
   `dashboard.mapper.ts` additions called out per-phase above. This is what makes the Phase 18
   contract-compliance suite tractable: it tests mappers directly against §2's types, not full HTTP
   round-trips for every case.
3. **`[proposed]` markers in §2 are a to-do for both teams, not a license to guess forever.** Items 1, 2,
   9, and 10 from §1 should be finalized into the frontend's own `CONTRACT.md` (its Phase 9 deliverable)
   as soon as it's written, at which point this document's `[proposed]` tags should be removed and any
   difference reconciled the same way §1 reconciles everything else.

---

## 5. Appendices

### 5.1 Consolidated Prisma schema

**Unchanged from `PLAN_kost-bunda-elin-be_v2.md` §C.1 in full.** None of the reconciliation in §1 requires
a schema change — every difference found was in response shaping, not data modeling. Implementers should
use v2 §C.1 as the authoritative schema reference; it is not reproduced a second time here to avoid the
two documents drifting out of sync on the one section that didn't need to change.

### 5.2 Folder structure

Unchanged from v2 §C.2, **plus** the `.mapper.ts` files called out in §3/§4 above:

```
src/modules/pembayaran/pembayaran.mapper.ts               # NEW — Phase 5
src/modules/notification-log/notification-log.mapper.ts    # NEW — Phase 6
src/modules/message-template/message-template.mapper.ts    # NEW — Phase 6
src/modules/financial-transaction/financial-transaction.mapper.ts  # NEW — Phase 11
src/modules/financial-account/financial-account.mapper.ts  # NEW — Phase 11
src/modules/dashboard/dashboard.mapper.ts                  # NEW — Phase 17
src/utils/serialize.util.ts                                # NEW — Phase 5 (toNumber helper, §4.1)
src/__tests__/contract/response-shapes.test.ts              # NEW — Phase 18
```

### 5.3 Environment variables, phase-renumbering map, Docker/CI additions, README outline

Unchanged from v2 §C.4–§C.8 in full — no reconciliation item in §1 touches env vars, infra, or the
old→new phase numbering map (this document keeps v2's Phase 5→21 numbers exactly).

---

## 6. Definition of done (per phase, mirrors the frontend's own §"Appendix: definition of done")

1. Response shape matches §2 exactly — verified by the Phase 18 contract-compliance suite, not just eyeballed.
2. Every monetary field is a JSON `number` (§4.1) — no exceptions, no "just this once."
3. DB migration is additive-only, matching v2's discipline (no existing column renamed/retyped/dropped).
4. Cross-property isolation test exists for every new resource type from Phase 7 onward (v2 §B, Phase 7's
   requirement, carried forward unmodified).
5. `AuditLog` entry written for every financial-affecting mutation from Phase 12 onward (v2's requirement).
6. OWNER-gated routes actually enforce `requireRole('OWNER')` server-side — the frontend's UI-level gate
   (disabled-with-tooltip) is UX courtesy only, never the real boundary.
7. Tests added: at least one validation-rejection + one happy-path per new endpoint, plus the contract
   assertion from item 1.
8. Any place this phase's implementation would deviate from §2 must update §1's reconciliation table
   first — §2 is never silently changed to match what was easier to build.
