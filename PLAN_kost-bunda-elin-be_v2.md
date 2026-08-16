# Plan v2: Backend "Kost Putri Bunda Elin" — Phase 5 Revision & Phase 6+ (Notification/WhatsApp, Multi-Property, Finance)

> This document **continues** `PLAN_kost-bunda-elin-be.md`. It does not replace Sections 0–3 (Konteks, Tech Stack, Ringkasan Fitur, Struktur Folder) or the completed **Fase 0–4** work (init project, Prisma schema v1, core skeleton, auth, kamar & penyewa modules). Those are implemented and out of scope for redesign here.
>
> Give this file to Claude Code **after** the original plan, in order, one phase = one prompt, same as before. Where a phase modifies a file created in Fase 0–4, the instruction says so explicitly — everything else is additive.

---

## 0. What this document changes

| Original doc section | Status |
|---|---|
| §0 Konteks & Referensi | Unchanged, with **one correction**: the line *"Bukan bagian dari boilerplate ini: ... WhatsApp Cloud API (opsional, fase belakangan)"* is now superseded — WhatsApp is in scope starting Phase 8 below. No other change. |
| §1 Tech Stack | Unchanged, **additive** rows only — see §C.6 below (adds `axios`/`undici` for WhatsApp Cloud API calls, plus a small in-process retry mechanism — decision explained in Phase 10). |
| §2 Ringkasan Fitur | Unchanged for 2.1–2.5 (auth, kamar, penyewa, pembayaran, web push are as implemented). 2.6 "skeleton" models (`MessageTemplate`, `NotificationLog`, `ReminderConfig`) are now **graduated from skeleton to full implementation** — see Phases 6–10. |
| §3 Struktur Folder | Extended, not rewritten — see §C.2 for the full updated tree. |
| §4 Skema Database | Extended, not rewritten — Fase 0–4 models (`Property`, `Admin`, `Kamar`, `Penyewa`, `PushSubscription`, `RefreshToken`) are untouched. §C.1 gives the full consolidated schema after Phase 21. |
| §5 Env Vars | Extended — see §C.4. |
| §6 Endpoint | Extended — see §C.3. |
| §7 Docker / §8 CI / §9 Package Scripts | Extended — see §C.6, §C.7. |
| §10 Urutan Eksekusi | **Fase 0–4 unchanged.** Fase 5 (pembayaran) is revised below. Fase 6–11 (old numbering) are **reorganized and expanded** into the new Phase 6–21 sequence below — see §C.5 for the mapping table. |
| §11 Keputusan yang Sudah Dikonfirmasi | Unchanged. Its `getDefaultPropertyId()` / `DEFAULT_PROPERTY_ID` decision is explicitly preserved and extended in Phase 7 below, not replaced. |

**Naming convention kept from v1:** domain-core models stay Indonesian (`Kamar`, `Penyewa`, `Pembayaran`, `StatusPembayaran`, `JenisPesan`) because Fase 0–4/5 already shipped with these names — renaming them now would be a breaking, non-additive change for no functional benefit. New infrastructure/finance models follow the existing English convention already used for `Property`, `Admin`, `NotificationLog`, `MessageTemplate`, `ReminderConfig`, `PushSubscription`, `RefreshToken` (e.g. `PaymentMethod`, `PaymentRecord`, `FinancialAccount`, `FinancialTransaction`, `Deposit`). This matches the request to "prefer an enum such as `PaymentMethod`" while keeping `Pembayaran` as the bill/invoice model unchanged in name.

---

## A. Phase 5 Revision — Payment Module (`Pembayaran`)

### A.1 Current state (as implemented)

```prisma
model Pembayaran {
  id                String           @id @default(uuid())
  penyewaId         String
  penyewa           Penyewa          @relation(fields: [penyewaId], references: [id])
  periodeBulan      Int
  periodeTahun      Int
  tanggalJatuhTempo DateTime
  status            StatusPembayaran @default(BELUM_BAYAR)
  tanggalBayar      DateTime?
  nominal           Decimal          @db.Decimal(12, 2)
  catatan           String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  @@unique([penyewaId, periodeBulan, periodeTahun])
}

enum StatusPembayaran {
  BELUM_BAYAR
  LUNAS
  TERLAMBAT
}
```

One row = one month's bill. One payment event overwrites `tanggalBayar`/`status` directly on the bill. This cannot represent: which method was used, a reference/receipt number, a partial payment, or a history of multiple payment events against the same bill.

### A.2 Design decision

Two options were considered:

- **Option A (in-place fields only):** add `paymentMethod`, `referenceNumber`, `amountPaid` directly onto `Pembayaran`. Minimal migration, but a second partial payment on the same bill **overwrites** the first payment's method/date/reference — payment history is lost, and "payment history" is an explicit requirement.
- **Option B (recommended): add one small child table, keep `Pembayaran` almost untouched.** `Pembayaran` keeps meaning "the bill for this tenant/period" (unchanged), and a new `PaymentRecord` table stores each individual payment event (method, date, amount, reference, notes). `Pembayaran` gets two new columns (`status` enum value + one denormalized running-total column) purely for fast reads.

**Option B is chosen** because it satisfies partial payment, payment history, and multiple methods per bill, while still being a **purely additive migration**: no existing column is renamed, retyped, or dropped; no existing row's data changes shape. It is *not* a "major schema change" in the sense of restructuring — it is one new table plus two nullable/defaulted columns on an existing table.

### A.3 Database changes (migration is additive-only, no data loss)

```prisma
enum StatusPembayaran {
  BELUM_BAYAR
  SEBAGIAN     // NEW — partial payment received, balance remaining
  LUNAS
  TERLAMBAT
}

enum PaymentMethod {
  CASH
  BANK_TRANSFER
  QRIS
  E_WALLET
  OTHER
}

model Pembayaran {
  id                String           @id @default(uuid())
  penyewaId         String
  penyewa           Penyewa          @relation(fields: [penyewaId], references: [id])
  periodeBulan      Int
  periodeTahun      Int
  tanggalJatuhTempo DateTime
  status            StatusPembayaran @default(BELUM_BAYAR)
  tanggalBayar      DateTime?        // now means "date the bill became fully LUNAS"; kept for backward compatibility
  nominal           Decimal          @db.Decimal(12, 2)     // unchanged meaning: amount due
  totalDibayar      Decimal          @default(0) @db.Decimal(12, 2)   // NEW — running sum of paymentRecords.amountPaid
  catatan           String?          // unchanged meaning: bill-level note
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  paymentRecords    PaymentRecord[]                          // NEW relation
  notificationLogs  NotificationLog[]                        // NEW relation (Phase 6)
  financialTransactions FinancialTransaction[]                // NEW relation (Phase 12, forward-declared here for clarity)

  @@unique([penyewaId, periodeBulan, periodeTahun])
}

model PaymentRecord {
  id                 String        @id @default(uuid())
  pembayaranId       String
  pembayaran         Pembayaran    @relation(fields: [pembayaranId], references: [id])
  paymentMethod      PaymentMethod
  paymentDate        DateTime
  amountPaid         Decimal       @db.Decimal(12, 2)
  referenceNumber    String?
  notes              String?
  financialAccountId String?       // NEW, nullable, NO FK yet — see note below
  createdByAdminId   String?
  createdByAdmin     Admin?        @relation(fields: [createdByAdminId], references: [id])
  createdAt          DateTime      @default(now())

  financialTransaction FinancialTransaction?   // NEW relation (Phase 12), 1:1
}
```

**Note on `financialAccountId`:** the `FinancialAccount` model does not exist until Phase 11. Adding the plain nullable `String?` column now (with **no** `@relation`/FK constraint) lets the payment form start capturing "which account did this cash/transfer land in" as free text/ID immediately if useful, without waiting for the finance module, and without a second `ALTER TABLE ... ADD COLUMN`. Phase 12 only needs to **add the FK constraint** (`ALTER TABLE "PaymentRecord" ADD CONSTRAINT ... FOREIGN KEY`) once `FinancialAccount` exists — no column changes, no backfill. If this forward column is judged unnecessary complexity for Phase 5, it can be safely deferred to Phase 12 entirely instead; either way is additive.

**Migration steps (safe order):**
1. `ALTER TYPE "StatusPembayaran" ADD VALUE 'SEBAGIAN';` — Postgres 12+ allows this online; Prisma generates it automatically via `prisma migrate dev`. Note: cannot be used in the *same* transaction that also inserts a row with that value — not an issue for a schema-only migration.
2. `ALTER TABLE "Pembayaran" ADD COLUMN "totalDibayar" DECIMAL(12,2) NOT NULL DEFAULT 0;` — safe, defaults existing rows to 0.
3. `CREATE TYPE "PaymentMethod" AS ENUM (...);`
4. `CREATE TABLE "PaymentRecord" (...);` with FK to `Pembayaran` and to `Admin` (nullable).
5. **Backfill script** (`prisma/migrations/.../backfill.ts` or a one-off script run once): for every existing `Pembayaran` where `status IN ('LUNAS','TERLAMBAT')` and `tanggalBayar IS NOT NULL`, insert one `PaymentRecord` with `paymentMethod = OTHER`, `paymentDate = tanggalBayar`, `amountPaid = nominal`, `notes = 'Backfilled from pre-Phase-5-revision data'`, and set `totalDibayar = nominal`. For rows still `BELUM_BAYAR`/`TERLAMBAT` with no payment, leave `totalDibayar = 0`. This keeps historical bills consistent with the new "totalDibayar reflects reality" invariant without guessing a method that was never recorded.
6. No existing endpoint response shape needs to break: `status`, `tanggalBayar`, `nominal`, `catatan` keep working as before; new fields are additive in the JSON payload.

### A.4 Files to create or modify

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `SEBAGIAN`, `PaymentMethod`, `PaymentRecord`, new `Pembayaran` columns/relations (as above). |
| `prisma/migrations/<timestamp>_payment_method_and_history/migration.sql` | Generated by `prisma migrate dev`, then hand-append the backfill (or a separate `scripts/backfill-payment-records.ts` run once post-deploy — preferred, since backfill logic with conditionals is awkward in raw SQL). |
| `src/modules/pembayaran/pembayaran.schema.ts` | Modify — add `createPaymentRecordSchema` (paymentMethod, paymentDate, amountPaid, referenceNumber?, notes?, financialAccountId?). |
| `src/modules/pembayaran/pembayaran.service.ts` | Modify — add `addPaymentRecord()`, `getPaymentHistory()`, `computeStatus()`, refactor `updatePembayaran` so direct status/tanggalBayar edits go through the same status-recompute path. |
| `src/modules/pembayaran/pembayaran.controller.ts` | Modify — add handlers for the two new endpoints below. |
| `src/modules/pembayaran/pembayaran.route.ts` | Modify — register new routes. |
| `src/utils/paymentStatus.util.ts` | New — pure function `computePembayaranStatus(nominal, totalDibayar, tanggalJatuhTempo, now)`. |
| `scripts/backfill-payment-records.ts` | New — one-off backfill script described above. |

### A.5 Endpoints

```
GET    /api/pembayaran?status=akan_jatuh_tempo|menunggak|belum_bayar|sebagian|lunas|terlambat   # status filter extended
POST   /api/pembayaran                       # unchanged: create a bill
PATCH  /api/pembayaran/:id                   # unchanged shape, but catatan/tanggalJatuhTempo only — status is no longer settable directly here
POST   /api/pembayaran/:id/payments          # NEW — record a payment (partial or full) against a bill
GET    /api/pembayaran/:id/payments          # NEW — list payment history for a bill
```

### A.6 Business logic

- `computePembayaranStatus(nominal, totalDibayar, tanggalJatuhTempo, now)`:
  - `totalDibayar <= 0 && now > tanggalJatuhTempo` → `TERLAMBAT`
  - `totalDibayar <= 0 && now <= tanggalJatuhTempo` → `BELUM_BAYAR`
  - `0 < totalDibayar < nominal` → `SEBAGIAN` (regardless of due date — the reminder engine, not the status enum, is what distinguishes "partial but not yet due" from "partial and overdue"; see Phase 9).
  - `totalDibayar >= nominal` → `LUNAS`, and `tanggalBayar` is set to the date of the payment record that crossed the threshold (if not already set).
- `addPaymentRecord(pembayaranId, dto)` runs inside `prisma.$transaction`:
  1. Lock/read the `Pembayaran` row.
  2. Insert the `PaymentRecord`.
  3. Recompute `totalDibayar = existing + dto.amountPaid`.
  4. Recompute `status` via `computePembayaranStatus`.
  5. Update `Pembayaran` with new `totalDibayar`, `status`, and `tanggalBayar` if now `LUNAS`.
  - Overpayment (`totalDibayar > nominal` after insert) is **allowed, not blocked** — the API returns a `warning: "overpaid"` field in the response rather than a 4xx, since forcing a hard cap is a business decision the owner should make manually (e.g. credit toward next month), and this plan does not invent that policy. This can be tightened later without a schema change.
- A daily status-refresh pass (reusing the Phase 9 cron) flips `BELUM_BAYAR`/`SEBAGIAN` bills past due date to `TERLAMBAT`-flavored reminders even though the enum stays `SEBAGIAN` — see Phase 9 for the exact reminder-vs-status interaction.

### A.7 Validation (zod)

- `paymentMethod`: enum, required.
- `paymentDate`: ISO date, required, not in the future beyond a small clock-skew allowance (reject dates > now + 1 day).
- `amountPaid`: positive decimal, required, `> 0`.
- `referenceNumber`: optional string, max 100 chars.
- `notes`: optional string, max 500 chars.
- `financialAccountId`: optional uuid (existence check deferred to Phase 12 once the table exists; Phase 5 only validates format).

### A.8 Authorization

- All `/api/pembayaran/*` routes remain behind `requireAuth`.
- `POST /api/pembayaran/:id/payments` additionally checks the bill's tenant belongs to the admin's property (via `getDefaultPropertyId()` for now, upgraded in Phase 7) — reject with 404 (not 403, to avoid leaking existence) if the bill belongs to a different property once multi-property lands.

### A.9 Tests

- Unit: `computePembayaranStatus` covering all four branches + the exact-equal-to-nominal boundary.
- Integration: create bill → add one partial `PaymentRecord` → status becomes `SEBAGIAN`, `totalDibayar` correct.
- Integration: add a second `PaymentRecord` that completes the bill → status becomes `LUNAS`, `tanggalBayar` set, history has 2 rows with different methods/dates.
- Integration: overpayment does not throw, returns warning flag.
- Integration: `GET .../payments` returns records ordered by `paymentDate` ascending.
- Regression: existing `GET /api/pembayaran` filters (`akan_jatuh_tempo`, `menunggak`) still return correct results after the schema change.
- Migration test: run the backfill script against a seeded pre-migration dataset snapshot, assert `totalDibayar`/`PaymentRecord` counts match expectations.

### A.10 Acceptance criteria

- [ ] Existing Fase 0–4 tests and Fase 5 tests (as currently implemented) still pass unmodified.
- [ ] A bill can receive 1..N payments with different methods/dates/references, each individually queryable.
- [ ] `status` is never set directly by a client request — it is always derived from `totalDibayar` vs `nominal` vs due date.
- [ ] No existing `Pembayaran` row loses data; backfill produces one `PaymentRecord` per historically-paid bill.
- [ ] `SEBAGIAN` shows up correctly in dashboard/queries that previously only handled `BELUM_BAYAR`/`LUNAS`/`TERLAMBAT`.

---

## B. Phase 6 → Phase 21

### Phase 6 — Notification Foundation + Web Push Refactor

**Objective:** Turn the current push-only skeleton (`push.service.ts` calling `web-push` directly from the cron job) into a channel-agnostic notification layer, without changing what the end user experiences yet (still Web Push only after this phase). This is the seam that Phase 8 (WhatsApp) plugs into later.

**Database changes:**
```prisma
enum NotificationChannel {
  WEB_PUSH
  WHATSAPP
  EMAIL   // reserved, not implemented
  SMS     // reserved, not implemented
}

enum NotificationStatus {
  PENDING
  SENT
  DELIVERED
  READ
  FAILED
}

model MessageTemplate {
  id         String              @id @default(uuid())
  propertyId String              // NEW
  property   Property            @relation(fields: [propertyId], references: [id])
  channel    NotificationChannel @default(WEB_PUSH)   // NEW
  jenis      JenisPesan
  isi        String
  aktif      Boolean             @default(true)
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt

  @@unique([propertyId, channel, jenis])
}

model ReminderConfig {
  id         String                 @id @default(uuid())
  propertyId String                 @unique
  property   Property               @relation(fields: [propertyId], references: [id])
  offsets    Int[]                  @default([-7, -3, -1, 0, 1, 3, 7])  // negative = H-n, 0 = H, positive = H+n overdue
  channels   NotificationChannel[]  @default([WEB_PUSH])
  active     Boolean                @default(true)
  updatedAt  DateTime               @updatedAt
}

model NotificationLog {
  id                String              @id @default(uuid())
  propertyId        String
  property          Property            @relation(fields: [propertyId], references: [id])
  penyewaId         String?
  penyewa           Penyewa?            @relation(fields: [penyewaId], references: [id])
  pembayaranId      String?
  pembayaran        Pembayaran?         @relation(fields: [pembayaranId], references: [id])
  channel           NotificationChannel
  jenis             JenisPesan
  recipient         String              // phone (WA) or subscription id hash (web push)
  providerMessageId String?
  status            NotificationStatus  @default(PENDING)
  retryCount        Int                 @default(0)
  isiRingkas        String
  dedupeKey         String              @unique   // e.g. `${pembayaranId}:${channel}:${jenis}:${YYYY-MM-DD}`
  sentAt            DateTime?
  deliveredAt       DateTime?
  readAt            DateTime?
  failedAt          DateTime?
  failureReason     String?
  createdAt         DateTime            @default(now())
}
```

*Migration note:* `MessageTemplate.propertyId` is added `NOT NULL` — backfill every existing row with `DEFAULT_PROPERTY_ID` before adding the constraint (there is only one property today, so this is a single `UPDATE ... SET "propertyId" = '<default>'` before `ALTER COLUMN ... SET NOT NULL`). `ReminderConfig` replaces `hMinusHari`/`hPlusHari` with `offsets`: migration script converts `hMinusHari.map(n => -n) + [0] + hPlusHari` into the new array for the existing row, then drops the two old columns. `NotificationLog` is small/empty in practice (skeleton, unused) so it can be recreated rather than migrated column-by-column if simpler.

**Why `dedupeKey` instead of a composite unique index with a date function:** Postgres unique constraints can't directly express "same calendar day" without a generated/expression column. Computing `dedupeKey` in the application layer (before insert) and giving it a plain `@unique` column is simpler, portable, and still enforces the "prevent duplicate messages at the database level" requirement — the insert throws a unique-violation the app catches and treats as "already sent today, skip."

**Files to create or modify:**
- New: `src/modules/notification/notification.types.ts` — shared `NotificationPayload`, `NotificationProvider` interface (`send(payload): Promise<{providerMessageId?: string; status: NotificationStatus}>`).
- New: `src/modules/notification/providers/webpush.provider.ts` — wraps existing `web-push` call, implements `NotificationProvider`.
- New: `src/modules/notification/notification.service.ts` — the **shared** service: `sendNotification(channel, payload)` picks the provider, writes `NotificationLog`, computes `dedupeKey`, catches unique-violation as "skip, already sent."
- Modify: `src/modules/push/push.service.ts` — strip down to subscribe/unsubscribe CRUD only; sending logic moves out to `notification.service.ts` + `webpush.provider.ts`.
- Modify: `src/jobs/reminder.job.ts` — now calls a reminder **service** (Phase 9), not `push.service` directly.
- New: `src/modules/message-template/message-template.service.ts` — CRUD scoped by `propertyId` + `channel`.
- Modify: `src/modules/notification-log/notification-log.service.ts` — CRUD/read scoped by `propertyId`, filters by `channel`, `status`, `penyewaId`.

**Endpoints:**
```
GET    /api/message-template?channel=WEB_PUSH|WHATSAPP
POST   /api/message-template
PATCH  /api/message-template/:id
GET    /api/notification-log?penyewaId=&channel=&status=&from=&to=
GET    /api/reminder-config
PATCH  /api/reminder-config          # offsets, channels, active
```

**Business logic:** `notification.service.sendNotification()` is the *only* place allowed to call a provider or write `NotificationLog`. No module besides this service and Phase 9's reminder engine should import a provider directly — this satisfies "do not place reminder business logic directly inside `push.service`."

**Validation:** `offsets` must be a sorted array of distinct integers in `[-30, 30]`; `channels` must be a non-empty subset of the enum; `MessageTemplate.isi` must be non-empty and template placeholders (`{{nama}}` etc.) are validated against a known whitelist at save time so a typo doesn't silently fail to render later.

**Authorization:** all routes `requireAuth`; `PATCH /api/reminder-config` and template mutation restricted to `requireRole('OWNER')`, consistent with the existing 3.4 pattern.

**Tests:** provider interface contract test (a fake provider satisfies it), dedupe-key collision is caught and treated as a no-op (not a 500), template CRUD scoped correctly, `ReminderConfig` offsets migration produces the expected array from a seeded pre-migration row.

**Acceptance criteria:**
- [ ] Web Push reminders still work end-to-end exactly as before this phase, now routed through `notification.service`.
- [ ] Sending the same reminder twice for the same bill/channel/day is rejected at the DB layer, not just in application logic.
- [ ] `push.service.ts` contains no reminder/business logic, only subscribe/unsubscribe + the provider adapter.

---

### Phase 7 — Multi-Property Context for New Modules

**Objective:** Give every module built from Phase 8 onward a trustworthy, server-derived property id, without touching how Fase 0–4/§11 modules resolve `DEFAULT_PROPERTY_ID` today.

**Database changes:** none required. (Optional, non-blocking: a denormalized `propertyId` could be added later to `Pembayaran` to avoid a 3-way join through `Penyewa → Kamar → Property` in hot paths; not needed yet, `Kamar.propertyId` is sufficient for filtering.)

**Files to create or modify:**
- Modify: `src/modules/auth/auth.service.ts` — when issuing the access token, embed `propertyId` (read from `Admin.propertyId`) as a JWT claim alongside `adminId`/`role`. This is an additive claim; existing claims are untouched, so current token verification keeps working.
- Modify: `src/middlewares/auth.middleware.ts` — `requireAuth` sets `req.user = { id, role, propertyId }` (currently likely just `{ id, role }`).
- New: `src/middlewares/property.middleware.ts` — `resolveProperty` sets `req.property = { id: req.user.propertyId }`; used by all Phase 8+ modules instead of `getDefaultPropertyId()`.
- New: `src/config/property.ts` — add `getRequestPropertyId(req)` returning `req.property?.id ?? req.user?.propertyId ?? getDefaultPropertyId()`, so new code has one function to call and old code is untouched.

**Endpoints:** none new; this phase is middleware-only.

**Business logic:** never trust `propertyId` from body/query/params for authorization — it may be read from the URL for routing convenience (e.g. reports scoped per property in a future multi-admin-per-property setup), but every write/read must additionally filter by `req.property.id` and reject (404) rows that don't match.

**Validation:** n/a.

**Authorization:** this phase *is* the authorization foundation for everything after it.

**Tests — cross-property isolation (required from this phase forward for every new module):**
- Seed two `Property` rows, one `Admin` each.
- For every Phase 8+ resource type, assert Admin A's token cannot read/update/delete a resource owned by Property B, even when given B's real id in the URL (expect 404).
- Assert a forged/edited `propertyId` in a request body is ignored, not honored.

**Acceptance criteria:**
- [ ] `req.user.propertyId` is available on every authenticated request.
- [ ] Fase 0–4 modules (`kamar`, `penyewa`, `dashboard`) are unmodified and still use `getDefaultPropertyId()`.
- [ ] A documented, one-line migration path exists for switching those old modules over later (swap `getDefaultPropertyId()` for `getRequestPropertyId(req)` — no schema change needed since they already carry `propertyId` per §11).

---

### Phase 8 — WhatsApp Module

**Objective:** Add outbound WhatsApp messaging via the Meta WhatsApp Cloud API, behind the `NotificationProvider` abstraction from Phase 6, so the reminder engine (Phase 9) can send to either channel interchangeably.

**Database changes:** none beyond Phase 6 (channel enum already includes `WHATSAPP`). Add columns to `Penyewa` only if not already covered — `noHp` already exists and is already normalized to `62xxxxxxxxxx` per §11 decision 2, which is exactly the format the Cloud API expects. No schema change needed here.

**Files to create or modify:**
- New: `src/modules/notification/providers/whatsapp.provider.ts` — implements `NotificationProvider`; calls `POST https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages` with the Cloud API bearer token, maps the Cloud API response (`messages[0].id`) to `providerMessageId`, maps HTTP failure to `status: FAILED` + `failureReason`.
- New: `src/modules/notification/whatsapp.client.ts` — thin HTTP client (axios/undici) wrapping auth headers, base URL, and a typed `sendTemplateMessage()` / `sendTextMessage()`.
- Modify: `src/modules/notification/notification.service.ts` — register `whatsapp.provider.ts` in the channel → provider map alongside `webpush.provider.ts`.
- New: `src/modules/message-template/whatsapp-template.util.ts` — if using Cloud API's approved message templates (recommended for reliability/deliverability outside the 24h session window), maps internal `MessageTemplate` rows to a Cloud API template name + component variables.

**Endpoints:** none new in this phase beyond what Phase 6 already exposes (`MessageTemplate` now usable with `channel=WHATSAPP`). Manual send/webhook endpoints land in Phases 9–10.

**Business logic:** the provider is purely "take a rendered message + recipient, call the API, return status/providerMessageId" — it does not decide *when* to send (that's Phase 9) or *what* the message says beyond variable substitution already done by the caller.

**Validation:** recipient phone must match the existing `62xxxxxxxxxx` normalized format (reuse the regex from §11 decision 2); reject/skip sends to tenants without a valid `noHp`.

**Authorization:** n/a (internal service, not directly exposed).

**Tests:** provider unit test with a mocked Cloud API HTTP layer covering success, 4xx (bad template/recipient), 5xx (transient — should be retryable, see Phase 10), and malformed response.

**Acceptance criteria:**
- [ ] Calling `notification.service.sendNotification('WHATSAPP', payload)` results in a real Cloud API call in staging and a correctly populated `NotificationLog` row.
- [ ] No WhatsApp-specific code exists outside `whatsapp.provider.ts` / `whatsapp.client.ts` / `whatsapp-template.util.ts`.

---

### Phase 9 — Payment Reminder Engine

**Objective:** Replace the ad-hoc "check H-3/H-1/H and H+3/H+7" logic in the old cron job with a proper reminder engine driven by `ReminderConfig.offsets`, status-aware, per-property, and channel-agnostic.

**Database changes:** none beyond Phase 6.

**Files to create or modify:**
- New: `src/modules/notification/reminder.service.ts` — **the shared reminder/business-logic service** referenced throughout this plan. Contains `runReminderSweep(propertyId?)`.
- Modify: `src/jobs/reminder.job.ts` — cron now just calls `reminderService.runReminderSweep()` for every active property (loop over all `Property` rows, not just the default one, so this job is multi-property-ready even while other modules still default to one).
- New: `src/modules/notification/reminder-eligibility.util.ts` — pure function `isReminderDue(offset, tanggalJatuhTempo, now)`.
- New: `POST /api/notification/reminders/send` manual-trigger endpoint — `src/modules/notification/notification.controller.ts`, `.route.ts`.

**Endpoints:**
```
POST   /api/notification/reminders/send        # body: { pembayaranId } or { penyewaId } — manual/ad-hoc trigger
POST   /api/notification/reminders/run-sweep    # OWNER-only manual re-run of the whole daily sweep (ops/debug tool)
```

**Business logic:**
1. For each `Property`, load its `ReminderConfig` (`offsets`, `channels`, `active`). Skip if `active = false`.
2. For each `Pembayaran` still outstanding for that property (`status IN (BELUM_BAYAR, SEBAGIAN, TERLAMBAT)`):
   - **Re-fetch the payment row fresh from the DB right before deciding to send** (per the explicit requirement to re-check latest status before sending — a payment may have been recorded seconds earlier in the same sweep window).
   - If `status = LUNAS` → skip, no reminder (also true structurally since the query already excludes `LUNAS`, but re-checked defensively in case of a race).
   - Compute `daysFromDue = diffInDays(now, tanggalJatuhTempo)`; if `daysFromDue` matches one of `ReminderConfig.offsets`, this bill is "due for a reminder today."
   - Choose `jenis`: `offset <= 0` → `REMINDER_JATUH_TEMPO` (upcoming); `offset > 0` → `REMINDER_TUNGGAKAN` (overdue).
   - If `status = SEBAGIAN`, the message renders the **remaining balance** (`nominal - totalDibayar`), not the full `nominal` — this is the "reminder for remaining balance if partial payment is supported" requirement.
   - For each channel in `ReminderConfig.channels`, call `notification.service.sendNotification(channel, payload)`, which itself applies the `dedupeKey` guard from Phase 6 — so even if the sweep runs twice in a day (manual trigger + cron), only one message per bill/channel/day goes out.
3. Manual `POST /api/notification/reminders/send` bypasses the offset-matching check (admin explicitly asked for it now) but **not** the dedupe-key guard — an admin can force-send once per day per channel, not spam.

**Validation:** `pembayaranId`/`penyewaId` must exist and belong to the caller's property (Phase 7 guard).

**Authorization:** `requireAuth`; `run-sweep` additionally `requireRole('OWNER')`.

**Tests:**
- `isReminderDue` boundary tests for every offset in the default set.
- Sweep test: seed bills at each offset boundary, assert exactly the right ones produce a `NotificationLog` row with the right `jenis`.
- `SEBAGIAN` bill reminder message contains the remaining balance, not the full nominal.
- Re-running the sweep twice in the same day sends zero duplicate messages (asserted via `NotificationLog` count, not just "no error").
- `LUNAS` bills never produce a reminder even if they happen to still fall on an offset date (defensive re-check test).

**Acceptance criteria:**
- [ ] Reminder decisions live only in `reminder.service.ts` / `reminder-eligibility.util.ts` — `whatsapp.provider.ts` and `webpush.provider.ts` contain zero "when to send" logic.
- [ ] Every `Property` gets its own sweep using its own `ReminderConfig`.
- [ ] Manual trigger and scheduled sweep share the same underlying function, not duplicated logic.

---

### Phase 10 — WhatsApp Webhook, Delivery Tracking, Retry, Failure Logging

**Objective:** Close the loop — Meta's Cloud API delivers status callbacks asynchronously; capture them, retry transient failures, and expose a manual resend path.

**Database changes:** none beyond Phase 6's `NotificationLog` (it already has `providerMessageId`, `status`, `retryCount`, `deliveredAt`, `readAt`, `failedAt`, `failureReason` — this phase is the first to actually populate them from the webhook).

**Files to create or modify:**
- New: `src/modules/notification/whatsapp-webhook.controller.ts` — `GET` handler for Meta's webhook verification handshake (`hub.challenge` echo against `WHATSAPP_WEBHOOK_VERIFY_TOKEN`), `POST` handler for status/inbound events.
- New: `src/modules/notification/whatsapp-webhook.route.ts` — registered **before** `requireAuth` in the route table (Meta calls this unauthenticated; verify via the `X-Hub-Signature-256` HMAC header against `WHATSAPP_APP_SECRET` instead).
- New: `src/modules/notification/notification-retry.job.ts` — a second `node-cron` job (or a scheduled sweep inside the existing reminder job) that finds `NotificationLog` rows with `status = FAILED` and `retryCount < MAX_RETRY` and re-sends via `notification.service`, incrementing `retryCount` and applying exponential backoff (`retryCount` gates a minimum re-try delay, e.g. skip if `failedAt` is less than `2^retryCount` minutes ago).
- Modify: `src/modules/notification/notification.service.ts` — add `updateStatusFromWebhook(providerMessageId, event)` that finds the `NotificationLog` row by `providerMessageId` and updates `status`/`deliveredAt`/`readAt`/`failedAt`/`failureReason`.
- New: `POST /api/notification-log/:id/resend` manual resend endpoint.

**Endpoints:**
```
GET    /api/notification/whatsapp/webhook       # Meta verification handshake
POST   /api/notification/whatsapp/webhook       # Meta delivery/read/failed status + inbound messages
POST   /api/notification-log/:id/resend         # manual resend of a specific failed message
```

**Business logic:**
- Verify every inbound webhook POST's HMAC signature before processing; reject with 401 if it doesn't match — this endpoint is public by necessity, signature verification is the only protection.
- Map Meta's status values (`sent`, `delivered`, `read`, `failed`) to `NotificationStatus`; on `failed`, capture Meta's `errors[0].title`/`message` into `failureReason`.
- Retry job only retries `FAILED` rows caused by transient errors (5xx / timeout / rate-limit) — permanent errors (invalid recipient, template rejected, opted-out number) are marked `FAILED` with `retryCount` immediately pinned at `MAX_RETRY` so the retry job skips them (`failureReason` distinguishes the two via an `isRetryable` flag on the provider's error mapping).
- Manual resend always creates a **new** attempt (new `providerMessageId` expected) but reuses the same `dedupeKey` semantics is intentionally bypassed here — this is an explicit admin action, not a scheduled duplicate.

**Validation:** webhook payload validated against Meta's documented shape with zod (`safeParse`, log and 200-ack even on shape mismatch so Meta doesn't keep retrying a payload we'll never understand, but alert via log).

**Authorization:** webhook routes are **not** behind `requireAuth` (Meta can't authenticate that way) — protected instead by HMAC signature check. `resend` endpoint is behind `requireAuth`.

**Tests:**
- HMAC verification rejects tampered payloads.
- Webhook handler correctly transitions `SENT → DELIVERED → READ` and `SENT → FAILED` for representative Meta payload fixtures.
- Retry job respects `MAX_RETRY` and backoff timing; permanent-error rows are never retried.
- Manual resend creates a new `NotificationLog` row and is independent of `dedupeKey`.

**Acceptance criteria:**
- [ ] Delivery/read/failed status from Meta is reflected in `NotificationLog` within one webhook round-trip.
- [ ] Transient failures self-heal via retry without admin action; permanent failures are visible and manually resendable.
- [ ] Webhook endpoint rejects unsigned/invalid requests.

---

### Phase 11 — Finance Foundation (Accounts, Categories, Transactions)

**Objective:** Introduce the core ledger: `FinancialAccount`, `FinancialCategory`, `FinancialTransaction`, all property-scoped. This phase creates the tables and plain CRUD only — automatic creation from rent payments is Phase 12.

**Database changes:**
```prisma
enum FinancialAccountType {
  CASH
  BANK
  E_WALLET
  QRIS
  OTHER
}

enum CategoryType {
  INCOME
  EXPENSE
}

enum TransactionType {
  INCOME
  EXPENSE
}

enum TransactionSource {
  RENT_PAYMENT
  MANUAL_INCOME
  MANUAL_EXPENSE
  DEPOSIT
  DEPOSIT_REFUND
  ADJUSTMENT
  REFUND
}

model FinancialAccount {
  id             String               @id @default(uuid())
  propertyId     String
  property       Property             @relation(fields: [propertyId], references: [id])
  name           String
  type           FinancialAccountType
  bankName       String?
  accountNumber  String?
  openingBalance Decimal              @default(0) @db.Decimal(14, 2)
  active         Boolean              @default(true)
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  transactions   FinancialTransaction[]
  paymentRecords PaymentRecord[]        // enabled by adding the FK now (see Phase 12)

  @@unique([propertyId, name])
}

model FinancialCategory {
  id         String       @id @default(uuid())
  propertyId String
  property   Property     @relation(fields: [propertyId], references: [id])
  type       CategoryType
  code       String       // e.g. RENT, ELECTRICITY
  name       String
  active     Boolean      @default(true)
  createdAt  DateTime     @default(now())

  transactions FinancialTransaction[]

  @@unique([propertyId, code])
}

model FinancialTransaction {
  id               String             @id @default(uuid())
  propertyId       String
  property         Property           @relation(fields: [propertyId], references: [id])
  accountId        String
  account          FinancialAccount   @relation(fields: [accountId], references: [id])
  categoryId       String
  category         FinancialCategory  @relation(fields: [categoryId], references: [id])
  tenantId         String?
  tenant           Penyewa?           @relation(fields: [tenantId], references: [id])
  pembayaranId     String?
  pembayaran       Pembayaran?        @relation(fields: [pembayaranId], references: [id])
  paymentRecordId  String?            @unique   // enforces one transaction per payment event, see Phase 12
  paymentRecord    PaymentRecord?     @relation(fields: [paymentRecordId], references: [id])
  depositId        String?
  deposit          Deposit?           @relation(fields: [depositId], references: [id])
  type             TransactionType
  source           TransactionSource
  amount           Decimal            @db.Decimal(14, 2)
  transactionDate  DateTime
  description      String?
  referenceNumber  String?
  vendorName       String?            // expense-specific, optional
  receiptUrl       String?            // expense-specific, optional
  createdByAdminId String?
  createdByAdmin   Admin?             @relation(fields: [createdByAdminId], references: [id])
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  deletedAt        DateTime?          // soft delete / reversal marker

  @@index([propertyId, transactionDate])
  @@index([propertyId, type, categoryId])
}

model AuditLog {
  id           String   @id @default(uuid())
  propertyId   String?
  property     Property? @relation(fields: [propertyId], references: [id])
  adminId      String?
  admin        Admin?   @relation(fields: [adminId], references: [id])
  entity       String   // e.g. "Pembayaran", "FinancialTransaction", "Deposit"
  entityId     String
  action       String   // e.g. "PAYMENT_RECORDED", "EXPENSE_REVERSED", "DEPOSIT_DEDUCTED"
  beforeValue  Json?
  afterValue   Json?
  createdAt    DateTime @default(now())

  @@index([propertyId, entity, entityId])
  @@index([propertyId, createdAt])
}
```

**Audit foundation (introduced here, used from Phase 12 onward):** `AuditLog` is added in this phase because it is first needed the moment financial mutations exist. `src/modules/audit/audit.service.ts` exposes `writeAuditLog(tx, { propertyId, adminId, entity, entityId, action, before, after })`, always called **inside** the same `prisma.$transaction` as the mutation it's recording, so an audit entry and its underlying change are atomically consistent (never one without the other). From Phase 12 onward, every financial-affecting mutation listed in the request — payment changes, expense changes, refunds, adjustments, deposit deductions, financial transaction changes — calls this helper as its final step. Reads (`GET /api/audit-log?entity=&entityId=&propertyId=&from=&to=`, `requireRole('OWNER')`) are added in this same phase's `audit.controller.ts`/`.route.ts`.

*Design note on "Expenses" as a separate concept:* rather than a second `Expense` table duplicating most of `FinancialTransaction`'s columns, expenses are `FinancialTransaction` rows with `type = EXPENSE`. The expense-only fields (`vendorName`, `receiptUrl`) are added as nullable columns on the shared table — this keeps one ledger, one balance calculation, one report query path, and avoids a UNION between two tables everywhere reports are built. Phase 13 covers the expense-specific endpoints/validation on top of this shared table.

**Files to create or modify:**
- New module folders: `src/modules/financial-account/`, `src/modules/financial-category/`, `src/modules/financial-transaction/` (each with the usual `.controller/.service/.route/.schema.ts`).
- New: `prisma/seed-finance-categories.ts` — seeds the default category list from the request (RENT, LATE_FEE, PARKING, LAUNDRY, OTHER_INCOME / ELECTRICITY, WATER, INTERNET, SALARY, CLEANING, MAINTENANCE, REPAIR, TAX, SUPPLIES, SECURITY, RENOVATION, MARKETING, ADMINISTRATIVE, OTHER_EXPENSE) for every existing `Property` — run once, and also called when a new property is created in a future multi-property admin flow.

**Endpoints:**
```
GET    /api/finance/accounts
POST   /api/finance/accounts
PATCH  /api/finance/accounts/:id
GET    /api/finance/categories?type=INCOME|EXPENSE
POST   /api/finance/categories
PATCH  /api/finance/categories/:id
GET    /api/finance/transactions?type=&categoryId=&accountId=&from=&to=
POST   /api/finance/transactions          # manual entry, source=MANUAL_INCOME|MANUAL_EXPENSE only here
PATCH  /api/finance/transactions/:id      # only description/referenceNumber/category editable; amount edits go through reversal (Phase 13)
DELETE /api/finance/transactions/:id      # soft delete (sets deletedAt), OWNER only
```

**Business logic:** account/category CRUD is straightforward property-scoped CRUD. Manual transaction creation validates `category.type === transaction.type` and `account.propertyId === category.propertyId === req.property.id`.

**Validation:** `amount > 0`; `transactionDate` not in the future; `categoryId`/`accountId` must belong to the caller's property (Phase 7); `source` on manually-created rows is restricted to `MANUAL_INCOME`/`MANUAL_EXPENSE` — the other source values are only ever set by system code (Phase 12/15), never accepted from client input.

**Authorization:** `requireAuth` for reads; mutations `requireAuth`, delete `requireRole('OWNER')`.

**Tests:** category/account CRUD scoping, manual transaction type/category consistency validation, cross-property rejection (Phase 7 pattern reused), soft-delete excludes rows from default list queries but keeps them in audit/history queries.

**Acceptance criteria:**
- [ ] Every property has its own account/category set; none are shared across properties.
- [ ] Default categories are seeded and match the requested list exactly.
- [ ] Deleting a transaction never physically removes the row.

---

### Phase 12 — Payment ↔ Finance Integration

**Objective:** A rent payment automatically produces its financial transaction — no duplicate manual income entry — using `prisma.$transaction` for atomicity, and is idempotent against duplicate submission.

**Database changes:** add the FK constraints deferred from Phase 5/11:
```sql
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_financialAccountId_fkey"
  FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id");
```
(`FinancialTransaction.paymentRecordId` unique FK was already declared in Phase 11's schema in anticipation of this phase.)

**Files to create or modify:**
- Modify: `src/modules/pembayaran/pembayaran.service.ts` — `addPaymentRecord()` (from Phase 5) is extended to also create the linked `FinancialTransaction` inside the **same** `$transaction`.
- New: `src/modules/finance/finance-integration.service.ts` — `createTransactionForPayment(tx, paymentRecord)` — resolves the `RENT` category for the property (creating it if somehow missing), resolves the account from `paymentRecord.financialAccountId` (falling back to a property's default "Cash" account if none was specified), and inserts the `FinancialTransaction` row with `source = RENT_PAYMENT`.
- Modify: `src/modules/pembayaran/pembayaran.controller.ts` — no interface change; the extra step is invisible to the API consumer.

**Endpoints:** no new endpoints; `POST /api/pembayaran/:id/payments` (Phase 5) now has this side effect.

**Business logic — the full sequence inside one `prisma.$transaction`:**
1. Record the `PaymentRecord`.
2. (Payment method/date/amount/reference already part of step 1's payload.)
3. Recompute and update `Pembayaran.status`/`totalDibayar` (Phase 5 logic).
4. Create the `FinancialTransaction` (`source = RENT_PAYMENT`, linked via `paymentRecordId`).
5. Link `financialAccountId` on the `PaymentRecord` if it wasn't already set going in, using the account chosen for step 4 — keeps both sides consistent even when the client didn't pick an account explicitly.
6. Update the receivable aggregate if a materialized/cached receivable summary exists (Phase 14) — otherwise this is a no-op since receivables are computed on read in the initial version (see Phase 14 design note).
7. Write an `AuditLog` row (`entity = 'Pembayaran'`, `action = 'PAYMENT_RECORDED'`) via `audit.service.writeAuditLog()` (foundation introduced in Phase 11).

**Idempotency against duplicate submission:** the client should send an `Idempotency-Key` header (or the service derives a deterministic key from `pembayaranId + amountPaid + paymentDate + referenceNumber` when the header is absent) stored on `PaymentRecord` as a unique column `idempotencyKey String? @unique`. A retried identical request hits the unique constraint, and the service catches it and returns the original result (200, not 201) instead of creating a second payment + second transaction. This is the primary mechanism satisfying "prevent duplicate financial transactions if the payment request is submitted more than once" — combined with `FinancialTransaction.paymentRecordId @unique`, which makes it structurally impossible to attach two transactions to one payment record even if the idempotency check were ever bypassed.

**Validation:** unchanged from Phase 5, plus the idempotency key format check.

**Authorization:** unchanged from Phase 5.

**Tests:**
- Submitting the same payment payload twice (same idempotency key) results in exactly one `PaymentRecord` and one `FinancialTransaction`.
- A failure injected between steps 3 and 4 (simulated) rolls back the entire `$transaction` — no orphaned `PaymentRecord` without its `FinancialTransaction`.
- `FinancialTransaction.amount` always equals `PaymentRecord.amountPaid` for `source = RENT_PAYMENT` rows.

**Acceptance criteria:**
- [ ] No code path lets an admin manually create a `MANUAL_INCOME` transaction for a rent payment — the automatic link is the only path for `RENT_PAYMENT` source.
- [ ] Retrying a payment submission (network retry, double-click) never double-counts revenue.

---

### Phase 13 — Income and Expense Management

**Objective:** Full CRUD/workflow for manual income and, in particular, complete expense management on top of the Phase 11 ledger.

**Database changes:** none beyond Phase 11's `vendorName`/`receiptUrl` columns (already added there so this phase doesn't need another migration).

**Files to create or modify:**
- New: `src/modules/expense/expense.controller.ts` / `.service.ts` / `.route.ts` / `.schema.ts` — a thin, expense-flavored view over `financial-transaction.service.ts` (`type = EXPENSE`), so validation/UX can be expense-specific (requires `vendorName`, optionally `receiptUrl`) without duplicating the underlying persistence logic.
- Modify: `src/modules/financial-transaction/financial-transaction.service.ts` — add `reverseTransaction(id, reason)`: creates a new offsetting `FinancialTransaction` (`source = ADJUSTMENT`, negative-equivalent via opposite `type` or a signed-amount convention — **decision:** keep `amount` always positive and use `type` to determine sign in aggregations, so a reversal of an `EXPENSE` is an `INCOME`-typed adjustment row referencing the original via `description`) rather than mutating or deleting the original row.
- New: file upload handling for `receiptUrl` — out of scope for local disk storage in production; store the URL only (client uploads to existing object storage, e.g. S3-compatible, and passes the URL). Document this assumption in the endpoint validation, do not build a new upload pipeline unless the project already has one.

**Endpoints:**
```
POST   /api/expenses                 # category.type must be EXPENSE, requires vendorName
GET    /api/expenses?categoryId=&accountId=&from=&to=&vendorName=
PATCH  /api/expenses/:id             # non-amount fields only
POST   /api/expenses/:id/reverse     # creates offsetting adjustment, OWNER only
POST   /api/finance/transactions/:id/reverse   # generic reversal for any manual income/expense
```

**Business logic:** `reverse` never deletes; it always inserts a new row and leaves the original intact with a `description` cross-reference (`"Reversal of <id>"` / `"Reversed by <id>"`) — satisfies "prefer soft delete or reversal instead of permanently deleting financial history" more strongly than the Phase 11 soft-delete flag alone, and is the recommended path for *amount* corrections specifically (soft-delete via `deletedAt` remains available for pure mistakes that should disappear from active views entirely, e.g. a test entry). Every create, reverse, and soft-delete on `FinancialTransaction`/expense rows writes an `AuditLog` entry (`action` in `EXPENSE_CREATED`/`EXPENSE_REVERSED`/`TRANSACTION_SOFT_DELETED`) with `beforeValue`/`afterValue` snapshots, per the audit foundation from Phase 11.

**Validation:** `vendorName` required for expense creation, `receiptUrl` optional but must be a well-formed URL if present.

**Authorization:** `requireAuth` for create/read; `reverse` restricted to `requireRole('OWNER')`.

**Tests:** expense creation requires vendor; reversal produces a correctly-signed offsetting entry and the net effect on category/account totals is zero; reversed transactions are excluded from "active" totals but included in full history.

**Acceptance criteria:**
- [ ] Every expense has category + account + amount + date + vendor at minimum, matching the request.
- [ ] Reversing an expense never deletes the original row.

---

### Phase 14 — Receivables

**Objective:** Property-level and tenant-level outstanding-rent visibility, including an aging report.

**Database changes:** none — receivables are **computed on read** from `Pembayaran`/`PaymentRecord`, not stored in a new table. Design note: a materialized/cached table (`ReceivableSnapshot`) could be added later if computing this on every request becomes a performance problem at scale, but for a single small kost property this is unnecessary complexity now — computing over a few hundred `Pembayaran` rows per property is trivial.

**Files to create or modify:**
- New: `src/modules/receivable/receivable.service.ts` — `getOutstandingByTenant(propertyId)`, `getAgingReport(propertyId, asOfDate?)`.
- New: `src/modules/receivable/receivable.controller.ts` / `.route.ts`.
- New: `src/utils/aging.util.ts` — pure function bucketing a list of `{ outstandingAmount, daysPastDue }` into the 5 buckets.

**Endpoints:**
```
GET    /api/receivables                        # per-tenant outstanding list for the property
GET    /api/receivables/summary                 # total receivables, count of unpaid periods, property total
GET    /api/receivables/aging                    # aging buckets
```

**Business logic:**
- Outstanding per bill = `nominal - totalDibayar` for any `Pembayaran` not `LUNAS`.
- Per tenant: sum of outstanding across all their non-`LUNAS` bills + count of unpaid periods.
- Aging buckets, computed against `tanggalJatuhTempo`:
  - **Current**: `daysPastDue <= 0` (not yet due).
  - **1–30 days**, **31–60 days**, **61–90 days**, **> 90 days**: standard buckets by `daysPastDue = today - tanggalJatuhTempo`.
- Property total receivables = sum of all tenants' outstanding.

**Validation:** `asOfDate` optional query param, defaults to today; must not be in the future.

**Authorization:** `requireAuth`, property-scoped per Phase 7.

**Tests:** aging bucket boundary tests (exactly 30, 31, 60, 61, 90, 91 days past due); a `SEBAGIAN` bill's outstanding reflects the remainder, not the full nominal; a `LUNAS` bill never appears in receivables.

**Acceptance criteria:**
- [ ] Matches the requested fields: unpaid rent, overdue rent, tenant outstanding balance, unpaid period count, property total, and the 5-bucket aging report.

---

### Phase 15 — Tenant Deposits

**Objective:** Track refundable security deposits separately from rental revenue.

**Database changes:**
```prisma
enum DepositStatus {
  HELD
  PARTIALLY_REFUNDED
  REFUNDED
  FORFEITED
}

model Deposit {
  id               String        @id @default(uuid())
  propertyId       String
  property         Property      @relation(fields: [propertyId], references: [id])
  penyewaId        String
  penyewa          Penyewa       @relation(fields: [penyewaId], references: [id])
  amountReceived   Decimal       @db.Decimal(14, 2)
  receivedDate     DateTime
  deductionAmount  Decimal       @default(0) @db.Decimal(14, 2)
  deductionReason  String?
  refundAmount     Decimal?      @db.Decimal(14, 2)
  refundDate       DateTime?
  status           DepositStatus @default(HELD)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  transactions     FinancialTransaction[]
}
```

**Files to create or modify:** new module `src/modules/deposit/` (controller/service/route/schema).

**Endpoints:**
```
POST   /api/deposits                       # record deposit received
GET    /api/deposits?penyewaId=&status=
PATCH  /api/deposits/:id/deduct            # set deductionAmount/deductionReason
POST   /api/deposits/:id/refund            # sets refundAmount/refundDate/status
```

**Business logic:**
- Receiving a deposit creates a `Deposit` row **and**, inside the same `$transaction`, a `FinancialTransaction` with `source = DEPOSIT`, `type = INCOME`... **but excluded from revenue reports** (see Phase 16 — cash-based reports include it as a cash inflow, but "rental revenue"/income-statement metrics explicitly filter out `source = DEPOSIT`/`DEPOSIT_REFUND`). This is how "refundable deposits must not be counted as rental income" is enforced: not by leaving it out of the ledger (it's real cash movement and belongs in cash flow), but by excluding that `source` value from revenue-specific aggregations.
- Refunding creates a second `FinancialTransaction` with `source = DEPOSIT_REFUND`, `type = EXPENSE` (cash going back out), and updates `Deposit.status` to `PARTIALLY_REFUNDED` or `REFUNDED` depending on whether `refundAmount + deductionAmount < amountReceived`.
- `FORFEITED` status is a manual admin action (no refund, full deduction) — when set, the deduction amount becomes an income transaction (`source = ADJUSTMENT`) since a forfeited deposit *is* real income to the property, unlike a held/refundable one.

**Validation:** `deductionAmount + refundAmount <= amountReceived`; `refundDate` required when `status` moves to `REFUNDED`/`PARTIALLY_REFUNDED`.

**Authorization:** `requireAuth`; refund/deduct actions logged to `AuditLog` (foundation introduced in Phase 11).

**Tests:** deposit lifecycle (HELD → PARTIALLY_REFUNDED → REFUNDED), forfeiture path, deposit transactions excluded from rental-revenue report but present in cash-flow report.

**Acceptance criteria:**
- [ ] Deposits never appear in "rental revenue"/income-statement totals.
- [ ] Deposit cash movements are fully traceable via linked `FinancialTransaction` rows.

---

### Phase 16 — Financial Reports

**Objective:** Property-specific reporting endpoints with date filters, matching every metric requested.

**Database changes:** none (all computed from Phase 11–15 tables). Add indexes if not already present: `@@index([propertyId, transactionDate])` on `FinancialTransaction` (already declared in Phase 11).

**Files to create or modify:** new module `src/modules/finance-report/` (`.service.ts` holds the aggregation queries, `.controller.ts`/`.route.ts` expose them).

**Endpoints:**
```
GET /api/reports/dashboard?from=&to=
GET /api/reports/transactions?from=&to=&type=&categoryId=
GET /api/reports/revenue?from=&to=
GET /api/reports/expenses?from=&to=
GET /api/reports/cash-flow?from=&to=
GET /api/reports/income-statement?from=&to=
GET /api/reports/receivables            # thin wrapper over Phase 14
GET /api/reports/receivables/aging      # thin wrapper over Phase 14
```

**Business logic — metric definitions (explicitly separating cash-based vs billed/receivable metrics, as required):**

| Metric | Basis | Definition |
|---|---|---|
| Rental revenue | Billed | Sum of `Pembayaran.nominal` for bills with `tanggalJatuhTempo` in range (what was owed for the period) — **or** cash-based variant using `PaymentRecord.amountPaid`/`paymentDate` in range, exposed as a second field so the dashboard can show both. |
| Other income | Cash | Sum of `FinancialTransaction.amount` where `type=INCOME`, `source NOT IN (RENT_PAYMENT, DEPOSIT)`, in range. |
| Total income | Cash | Rental revenue (cash-based) + other income. |
| Total expenses | Cash | Sum of `FinancialTransaction.amount` where `type=EXPENSE`, `source != DEPOSIT_REFUND`, not soft-deleted/reversed, in range. |
| Net operating income | Cash | Total income − total expenses. |
| Cash inflow | Cash | All `INCOME`-typed transactions including deposits received, in range. |
| Cash outflow | Cash | All `EXPENSE`-typed transactions including deposit refunds, in range. |
| Outstanding rent | Billed | Sum of `(nominal - totalDibayar)` for non-`LUNAS` bills, **as of `to`** (not filtered by due date range — it's a point-in-time balance). |
| Overdue rent | Billed | Same, restricted to bills where `tanggalJatuhTempo < to`. |
| Collection rate | Billed vs Cash | `(cash-based rental revenue in range) / (billed rental revenue in range)`. |
| Expected rental revenue | Billed | Sum of `nominal` for all bills due in range, regardless of payment status. |
| Expense by category | Cash | `total expenses` grouped by `categoryId`. |
| Revenue trend | Cash | Cash-based rental revenue bucketed by month across the range. |
| Expense trend | Cash | Total expenses bucketed by month across the range. |
| Occupancy rate | n/a (rooms) | `TERISI` kamar / total active kamar for the property, **as of `to`** — reuses existing `Kamar.status`, not a new finance concept. |

**Validation:** `from`/`to` required on report endpoints other than `/dashboard` (which defaults to current month); `from <= to`; range capped at e.g. 3 years to avoid pathological queries.

**Authorization:** `requireAuth`, property-scoped.

**Tests:** each metric has at least one test with a hand-computed expected value against a small seeded dataset; explicit test asserting rental revenue (billed) and rental revenue (cash) diverge correctly when a bill is only partially paid within the range; deposits excluded from revenue but included in cash flow (cross-check with Phase 15's acceptance criterion).

**Acceptance criteria:**
- [ ] Every metric listed in the request is present in the dashboard response.
- [ ] Every report response is scoped to exactly one property and the caller's own property, never leaking another property's numbers.

---

### Phase 17 — Dashboard Expansion

**Objective:** Fold the new finance/notification data into the existing `GET /api/dashboard/summary` endpoint (Fase 8 in the original plan) without breaking its current consumers.

**Database changes:** none.

**Files to create or modify:** modify `src/modules/dashboard/dashboard.service.ts` — compose the existing kamar/pembayaran summary with the Phase 16 dashboard report and Phase 10 notification delivery stats (e.g. "reminders sent today", "failed messages needing attention").

**Endpoints:**
```
GET /api/dashboard/summary?from=&to=   # from/to now optional, existing shape preserved + new `finance` and `notifications` keys
```

**Business logic:** additive keys only (`finance: {...}`, `notifications: {...}`) alongside the existing `kamar`/`pembayaran` keys — no renamed or removed fields, so any existing frontend consumer keeps working.

**Validation:** `from`/`to` optional, default to current month if absent (matches Phase 16 default).

**Authorization:** unchanged (`requireAuth`).

**Tests:** existing dashboard summary test still passes with the new keys present; new keys match Phase 16 report values for the same range.

**Acceptance criteria:**
- [ ] `GET /api/dashboard/summary` is backward compatible — no existing field is removed, renamed, or changes type.

---

### Phase 18 — Testing and Data Isolation

**Objective:** Consolidate and complete the cross-property authorization test suite promised throughout Phases 7–17, plus overall test coverage hardening before infra polish.

**Database changes:** none.

**Files to create or modify:**
- New: `src/__tests__/isolation/cross-property.test.ts` — one parametrized suite exercising every property-scoped resource type (payments, notifications, financial accounts, categories, transactions, expenses, income, receivables, reports, deposits — explicitly the list from the request) against a two-property, two-admin seed fixture, asserting Property A's admin gets 404 on every Property B resource, both via direct id lookup and via list-endpoint filtering (make sure list endpoints never leak B's rows even without an explicit id).
- New: `src/test-utils/seed-two-properties.ts` — shared fixture builder used by the above and by individual module tests.
- Audit: run coverage report, fill gaps flagged by earlier phases' "Tests" sections that were deferred.

**Endpoints:** none new.

**Business logic:** none new — this phase is verification, not features.

**Validation / Authorization:** n/a — this phase tests the validation/authorization built in prior phases.

**Tests:** as described above; additionally a "forged propertyId" test per resource (client sends Property B's id in the body/query where the API accepts an id at all) confirming the server-derived `req.property.id` always wins.

**Acceptance criteria:**
- [ ] Every resource type listed in the "Multi-Property Preparation" requirement has an explicit passing cross-property isolation test.
- [ ] CI (Phase 20) runs this suite on every PR, not just locally.

---

### Phase 19 — Docker and Production Configuration

**Objective:** Update the Fase 9 Docker setup (originally the old §10 item 10) for the new env vars, the cron/webhook processes, and production hardening — without re-architecting the container layout unnecessarily.

**Database changes:** none.

**Files to create or modify:**
- Modify: `docker-compose.yml` — `app` service gains the new WhatsApp/finance env vars (via `.env`); no new service is required since the reminder cron and the webhook server run in the same Node process as the API (as in the original plan) — a separate worker container is *not* introduced unless the retry/cron load later demands it, keeping infra complexity proportional to actual need.
- Modify: `Dockerfile` — unchanged multi-stage shape; ensure the new `axios`/HTTP client dependency is included in the production `node_modules` copy step (no native bindings expected, so no extra build step).
- Modify: `.env.example` — see §C.4 for the full consolidated list.
- New note in `docker-compose.yml` comments: the WhatsApp webhook endpoint (`/api/notification/whatsapp/webhook`) must be reachable from the public internet in production (behind the same reverse proxy/TLS termination as the rest of the API) — Meta will not deliver callbacks to `localhost`; document the need for a public `APP_URL` or a tunnel (e.g. ngrok) in local development.

**Endpoints:** none new.

**Business logic:** n/a.

**Validation:** `src/config/env.ts` (zod-validated env) extended to require the new WhatsApp/finance vars only when `NODE_ENV=production` (keep them optional in `development`/`test` so the boilerplate still boots without Meta credentials configured, matching the original plan's "opsional" framing before this became mandatory for production use).

**Authorization:** n/a.

**Tests:** `docker-compose up` smoke test (build + healthcheck) already covered by the original plan's Fase 9 acceptance criteria — extend to also assert `prisma migrate deploy` succeeds against the full Phase 5–17 migration history from a fresh database.

**Acceptance criteria:**
- [ ] Fresh `docker-compose up` on an empty database ends with a fully migrated, seeded schema (all phases) and a healthy `app` container.
- [ ] Missing WhatsApp credentials in development does not crash the app — WhatsApp sends simply fail gracefully and are logged as `FAILED` with a clear `failureReason`, not a boot-time crash.

---

### Phase 20 — CI

**Objective:** Extend the existing GitHub Actions workflow (old §8/Fase 10) to run the new isolation suite and finance/notification tests, and to run against a real Postgres service container (the original plan listed this as optional; it is now required since Phase 18's tests need a real database for transactional/`$transaction` behavior).

**Database changes:** none.

**Files to create or modify:** modify `.github/workflows/ci.yml` — add a `postgres:16-alpine` service container, `DATABASE_URL` pointed at it, `prisma migrate deploy` step before `npm test`, and ensure `npm test` includes the Phase 18 isolation suite (not behind a separate optional job).

**Endpoints:** none.

**Business logic:** n/a.

**Validation:** n/a.

**Authorization:** n/a — but note CI secrets: WhatsApp Cloud API tests must run against **mocked** HTTP calls (Phase 8's provider tests), never real Meta credentials in CI.

**Tests:** the CI config itself is verified by a green run on the PR that introduces it.

**Acceptance criteria:**
- [ ] `npm test` in CI runs against a real ephemeral Postgres, including the full migration history.
- [ ] No real WhatsApp/Meta credentials are required or used in CI.

---

### Phase 21 — README and API Documentation

**Objective:** Bring documentation up to date with everything from Phase 5–20 (old §11/Fase 11 only covered local/Docker setup and VAPID keys).

**Database changes:** none.

**Files to create or modify:** `README.md` — add sections for: WhatsApp Cloud API setup (obtaining `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`, configuring the webhook URL + verify token in Meta's dashboard), finance module concepts (accounts/categories/transactions, cash vs billed metrics distinction), how `ReminderConfig` offsets work, how to add a new property (documenting the current `DEFAULT_PROPERTY_ID`-based limitation and the `req.user.propertyId` migration path from Phase 7), and a consolidated API reference (or a pointer to generated OpenAPI docs, if the project adds `zod-to-openapi` — optional, not required by this plan).

**Endpoints:** none.

**Business logic / Validation / Authorization:** n/a.

**Tests:** n/a (docs are not executable, though a link-check / markdown-lint step in CI is a reasonable optional addition).

**Acceptance criteria:**
- [ ] A new developer can go from `git clone` to a working local environment with WhatsApp sends mocked/disabled, using only the README.
- [ ] Every env var in `.env.example` is documented with what it's for and where to obtain it.

---

## C. Updated Cross-Cutting Sections

### C.1 Consolidated Prisma Schema (state after Phase 21)

Models/enums carried over **unchanged** from Fase 0–4 (`Property` core fields, `Admin`, `Kamar`, `PushSubscription`, `RefreshToken`, `StatusKamar`, `Role`) are shown with only their **new relation lines** added (marked `// NEW`); their original fields are omitted here for brevity — see original §4 for the full original field list, which is untouched.

```prisma
// ── Fase 0–4 models — relations extended only, no field changes ──

model Property {
  // ...original fields unchanged (id, nama, alamat, createdAt, updatedAt)...
  admins               Admin[]
  kamar                Kamar[]
  reminderConfig       ReminderConfig?
  messageTemplates     MessageTemplate[]        // NEW
  notificationLogs     NotificationLog[]        // NEW
  financialAccounts    FinancialAccount[]       // NEW
  financialCategories  FinancialCategory[]      // NEW
  financialTransactions FinancialTransaction[]  // NEW
  deposits             Deposit[]                // NEW
  auditLogs            AuditLog[]               // NEW
}

model Admin {
  // ...original fields unchanged (id, nama, email, passwordHash, role, propertyId, createdAt, updatedAt)...
  refreshTokens        RefreshToken[]
  createdPaymentRecords PaymentRecord[]         // NEW (createdByAdmin)
  createdTransactions  FinancialTransaction[]   // NEW (createdByAdmin)
  auditLogs            AuditLog[]               // NEW
}

model Penyewa {
  // ...original fields unchanged...
  pembayaran           Pembayaran[]
  pushSubscriptions    PushSubscription[]
  notificationLogs     NotificationLog[]
  deposits             Deposit[]                // NEW
  financialTransactions FinancialTransaction[]  // NEW
}

// Kamar, PushSubscription, RefreshToken, Role, StatusKamar: unchanged, omitted here.

// ── Phase 5 revision ──

enum StatusPembayaran {
  BELUM_BAYAR
  SEBAGIAN        // NEW
  LUNAS
  TERLAMBAT
}

enum PaymentMethod {          // NEW
  CASH
  BANK_TRANSFER
  QRIS
  E_WALLET
  OTHER
}

model Pembayaran {
  id                    String                 @id @default(uuid())
  penyewaId             String
  penyewa               Penyewa                @relation(fields: [penyewaId], references: [id])
  periodeBulan          Int
  periodeTahun          Int
  tanggalJatuhTempo     DateTime
  status                StatusPembayaran       @default(BELUM_BAYAR)
  tanggalBayar          DateTime?
  nominal               Decimal                @db.Decimal(12, 2)
  totalDibayar          Decimal                @default(0) @db.Decimal(12, 2)   // NEW
  catatan               String?
  createdAt             DateTime               @default(now())
  updatedAt             DateTime               @updatedAt

  paymentRecords        PaymentRecord[]                                          // NEW
  notificationLogs      NotificationLog[]                                        // NEW
  financialTransactions FinancialTransaction[]                                   // NEW

  @@unique([penyewaId, periodeBulan, periodeTahun])
}

model PaymentRecord {          // NEW
  id                   String              @id @default(uuid())
  pembayaranId         String
  pembayaran           Pembayaran          @relation(fields: [pembayaranId], references: [id])
  paymentMethod        PaymentMethod
  paymentDate          DateTime
  amountPaid           Decimal             @db.Decimal(12, 2)
  referenceNumber      String?
  notes                String?
  financialAccountId   String?
  financialAccount     FinancialAccount?   @relation(fields: [financialAccountId], references: [id])   // FK added in Phase 12
  idempotencyKey       String?             @unique
  createdByAdminId     String?
  createdByAdmin       Admin?              @relation(fields: [createdByAdminId], references: [id])
  createdAt            DateTime            @default(now())

  financialTransaction FinancialTransaction?
}

// ── Phase 6: Notification foundation ──

enum NotificationChannel {   // NEW
  WEB_PUSH
  WHATSAPP
  EMAIL     // reserved
  SMS       // reserved
}

enum NotificationStatus {    // NEW
  PENDING
  SENT
  DELIVERED
  READ
  FAILED
}

model MessageTemplate {
  id         String              @id @default(uuid())
  propertyId String                                                             // NEW
  property   Property            @relation(fields: [propertyId], references: [id])  // NEW
  channel    NotificationChannel @default(WEB_PUSH)                             // NEW
  jenis      JenisPesan
  isi        String
  aktif      Boolean             @default(true)
  createdAt  DateTime            @default(now())
  updatedAt  DateTime            @updatedAt

  @@unique([propertyId, channel, jenis])
}

model ReminderConfig {
  id         String                 @id @default(uuid())
  propertyId String                 @unique
  property   Property               @relation(fields: [propertyId], references: [id])
  offsets    Int[]                  @default([-7, -3, -1, 0, 1, 3, 7])          // REPLACES hMinusHari/hPlusHari
  channels   NotificationChannel[]  @default([WEB_PUSH])                        // NEW
  active     Boolean                @default(true)                             // NEW
  updatedAt  DateTime               @updatedAt
}

model NotificationLog {
  id                String              @id @default(uuid())
  propertyId        String                                                     // NEW
  property          Property            @relation(fields: [propertyId], references: [id])  // NEW
  penyewaId         String?
  penyewa           Penyewa?            @relation(fields: [penyewaId], references: [id])
  pembayaranId      String?                                                    // NEW
  pembayaran        Pembayaran?         @relation(fields: [pembayaranId], references: [id])  // NEW
  channel           NotificationChannel                                        // NEW (replaces implicit web-push-only)
  jenis             JenisPesan
  recipient         String                                                     // NEW
  providerMessageId String?                                                    // NEW
  status            NotificationStatus  @default(PENDING)                      // REPLACES StatusKirim
  retryCount        Int                 @default(0)                            // NEW
  isiRingkas        String
  dedupeKey         String              @unique                                // NEW
  sentAt            DateTime?                                                  // NEW
  deliveredAt       DateTime?                                                  // NEW
  readAt            DateTime?                                                  // NEW
  failedAt          DateTime?                                                  // NEW
  failureReason     String?                                                    // NEW
  createdAt         DateTime            @default(now())
}

// NOTE: StatusKirim (SUKSES/GAGAL) is superseded by NotificationStatus and can be dropped
// once NotificationLog is migrated — it was unused skeleton data (2.6), so no backfill is needed.

// JenisPesan (REMINDER_JATUH_TEMPO / REMINDER_TUNGGAKAN / PENGUMUMAN): unchanged from original.

// ── Phase 11: Finance foundation (+ Audit) ──

enum FinancialAccountType {   // NEW
  CASH
  BANK
  E_WALLET
  QRIS
  OTHER
}

enum CategoryType {           // NEW
  INCOME
  EXPENSE
}

enum TransactionType {        // NEW
  INCOME
  EXPENSE
}

enum TransactionSource {      // NEW
  RENT_PAYMENT
  MANUAL_INCOME
  MANUAL_EXPENSE
  DEPOSIT
  DEPOSIT_REFUND
  ADJUSTMENT
  REFUND
}

model FinancialAccount {      // NEW
  id             String               @id @default(uuid())
  propertyId     String
  property       Property             @relation(fields: [propertyId], references: [id])
  name           String
  type           FinancialAccountType
  bankName       String?
  accountNumber  String?
  openingBalance Decimal              @default(0) @db.Decimal(14, 2)
  active         Boolean              @default(true)
  createdAt      DateTime             @default(now())
  updatedAt      DateTime             @updatedAt

  transactions   FinancialTransaction[]
  paymentRecords PaymentRecord[]

  @@unique([propertyId, name])
}

model FinancialCategory {     // NEW
  id         String       @id @default(uuid())
  propertyId String
  property   Property     @relation(fields: [propertyId], references: [id])
  type       CategoryType
  code       String
  name       String
  active     Boolean      @default(true)
  createdAt  DateTime     @default(now())

  transactions FinancialTransaction[]

  @@unique([propertyId, code])
}

model FinancialTransaction {  // NEW
  id               String             @id @default(uuid())
  propertyId       String
  property         Property           @relation(fields: [propertyId], references: [id])
  accountId        String
  account          FinancialAccount   @relation(fields: [accountId], references: [id])
  categoryId       String
  category         FinancialCategory  @relation(fields: [categoryId], references: [id])
  tenantId         String?
  tenant           Penyewa?           @relation(fields: [tenantId], references: [id])
  pembayaranId     String?
  pembayaran       Pembayaran?        @relation(fields: [pembayaranId], references: [id])
  paymentRecordId  String?            @unique
  paymentRecord    PaymentRecord?     @relation(fields: [paymentRecordId], references: [id])
  depositId        String?
  deposit          Deposit?           @relation(fields: [depositId], references: [id])
  type             TransactionType
  source           TransactionSource
  amount           Decimal            @db.Decimal(14, 2)
  transactionDate  DateTime
  description      String?
  referenceNumber  String?
  vendorName       String?
  receiptUrl       String?
  createdByAdminId String?
  createdByAdmin   Admin?             @relation(fields: [createdByAdminId], references: [id])
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  deletedAt        DateTime?

  @@index([propertyId, transactionDate])
  @@index([propertyId, type, categoryId])
}

model AuditLog {              // NEW
  id           String    @id @default(uuid())
  propertyId   String?
  property     Property? @relation(fields: [propertyId], references: [id])
  adminId      String?
  admin        Admin?    @relation(fields: [adminId], references: [id])
  entity       String
  entityId     String
  action       String
  beforeValue  Json?
  afterValue   Json?
  createdAt    DateTime  @default(now())

  @@index([propertyId, entity, entityId])
  @@index([propertyId, createdAt])
}

// ── Phase 15: Deposits ──

enum DepositStatus {          // NEW
  HELD
  PARTIALLY_REFUNDED
  REFUNDED
  FORFEITED
}

model Deposit {               // NEW
  id               String        @id @default(uuid())
  propertyId       String
  property         Property      @relation(fields: [propertyId], references: [id])
  penyewaId        String
  penyewa          Penyewa       @relation(fields: [penyewaId], references: [id])
  amountReceived   Decimal       @db.Decimal(14, 2)
  receivedDate     DateTime
  deductionAmount  Decimal       @default(0) @db.Decimal(14, 2)
  deductionReason  String?
  refundAmount     Decimal?      @db.Decimal(14, 2)
  refundDate       DateTime?
  status           DepositStatus @default(HELD)
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  transactions     FinancialTransaction[]
}
```

### C.2 Updated Folder Structure

Only new/changed paths are shown; everything under Fase 0–4 (`auth/`, `kamar/`, `penyewa/`) is unchanged.

```
src/
├── modules/
│   ├── pembayaran/                      # MODIFIED (Phase 5)
│   │   ├── pembayaran.controller.ts
│   │   ├── pembayaran.service.ts        # + addPaymentRecord, getPaymentHistory, computeStatus
│   │   ├── pembayaran.route.ts          # + POST/GET :id/payments
│   │   └── pembayaran.schema.ts         # + createPaymentRecordSchema
│   ├── notification/                    # NEW (Phase 6, 8, 9, 10)
│   │   ├── notification.types.ts
│   │   ├── notification.service.ts      # shared send + dedupe + status update
│   │   ├── notification.controller.ts   # manual send/sweep endpoints
│   │   ├── notification.route.ts
│   │   ├── reminder.service.ts          # Phase 9 — the shared reminder/business-logic service
│   │   ├── reminder-eligibility.util.ts
│   │   ├── notification-retry.job.ts    # Phase 10
│   │   ├── whatsapp-webhook.controller.ts   # Phase 10
│   │   ├── whatsapp-webhook.route.ts        # Phase 10
│   │   ├── whatsapp.client.ts               # Phase 8
│   │   └── providers/
│   │       ├── webpush.provider.ts      # Phase 6 (moved out of push.service)
│   │       └── whatsapp.provider.ts     # Phase 8
│   ├── push/                            # MODIFIED (Phase 6) — subscribe/unsubscribe CRUD only now
│   │   ├── push.controller.ts
│   │   ├── push.service.ts
│   │   ├── push.route.ts
│   │   └── push.schema.ts
│   ├── message-template/                # GRADUATED from skeleton (Phase 6)
│   │   └── ...
│   │   └── whatsapp-template.util.ts    # Phase 8
│   ├── notification-log/                # GRADUATED from skeleton (Phase 6)
│   │   └── ...
│   ├── financial-account/               # NEW (Phase 11)
│   ├── financial-category/              # NEW (Phase 11)
│   ├── financial-transaction/           # NEW (Phase 11, 12)
│   │   └── financial-transaction.service.ts   # + reverseTransaction (Phase 13)
│   ├── expense/                         # NEW (Phase 13)
│   ├── receivable/                      # NEW (Phase 14)
│   ├── deposit/                         # NEW (Phase 15)
│   ├── finance-report/                  # NEW (Phase 16)
│   ├── audit/                           # NEW (Phase 11)
│   │   ├── audit.service.ts
│   │   ├── audit.controller.ts
│   │   └── audit.route.ts
│   └── dashboard/                       # MODIFIED (Phase 17)
│       └── dashboard.service.ts         # + finance/notification keys
├── middlewares/
│   └── property.middleware.ts           # NEW (Phase 7) — resolveProperty
├── config/
│   └── property.ts                      # MODIFIED (Phase 7) — + getRequestPropertyId(req)
├── utils/
│   ├── paymentStatus.util.ts            # NEW (Phase 5)
│   └── aging.util.ts                    # NEW (Phase 14)
├── jobs/
│   └── reminder.job.ts                  # MODIFIED (Phase 9) — calls reminder.service, loops all properties
├── test-utils/
│   └── seed-two-properties.ts           # NEW (Phase 18)
└── __tests__/
    └── isolation/
        └── cross-property.test.ts       # NEW (Phase 18)

scripts/
└── backfill-payment-records.ts          # NEW (Phase 5)

prisma/
└── seed-finance-categories.ts           # NEW (Phase 11)
```

### C.3 Updated API Contract (consolidated, new/changed only)

Everything from original §6 stays as-is; the following are added or changed by phase. All routes below sit behind `requireAuth` unless noted otherwise.

```
# Phase 5
POST   /api/pembayaran/:id/payments
GET    /api/pembayaran/:id/payments

# Phase 6
GET    /api/message-template?channel=
GET    /api/notification-log?penyewaId=&channel=&status=&from=&to=
GET    /api/reminder-config
PATCH  /api/reminder-config                          # OWNER

# Phase 9
POST   /api/notification/reminders/send
POST   /api/notification/reminders/run-sweep         # OWNER

# Phase 10
GET    /api/notification/whatsapp/webhook            # public, verified by hub.challenge
POST   /api/notification/whatsapp/webhook            # public, verified by HMAC signature
POST   /api/notification-log/:id/resend

# Phase 11
GET    /api/finance/accounts
POST   /api/finance/accounts
PATCH  /api/finance/accounts/:id
GET    /api/finance/categories?type=
POST   /api/finance/categories
PATCH  /api/finance/categories/:id
GET    /api/finance/transactions?type=&categoryId=&accountId=&from=&to=
POST   /api/finance/transactions
PATCH  /api/finance/transactions/:id
DELETE /api/finance/transactions/:id                 # OWNER, soft delete
GET    /api/audit-log?entity=&entityId=&propertyId=&from=&to=   # OWNER

# Phase 13
POST   /api/expenses
GET    /api/expenses?categoryId=&accountId=&from=&to=&vendorName=
PATCH  /api/expenses/:id
POST   /api/expenses/:id/reverse                     # OWNER
POST   /api/finance/transactions/:id/reverse         # OWNER

# Phase 14
GET    /api/receivables
GET    /api/receivables/summary
GET    /api/receivables/aging

# Phase 15
POST   /api/deposits
GET    /api/deposits?penyewaId=&status=
PATCH  /api/deposits/:id/deduct
POST   /api/deposits/:id/refund

# Phase 16
GET    /api/reports/dashboard?from=&to=
GET    /api/reports/transactions?from=&to=&type=&categoryId=
GET    /api/reports/revenue?from=&to=
GET    /api/reports/expenses?from=&to=
GET    /api/reports/cash-flow?from=&to=
GET    /api/reports/income-statement?from=&to=
GET    /api/reports/receivables
GET    /api/reports/receivables/aging

# Phase 17 (existing endpoint, extended)
GET    /api/dashboard/summary?from=&to=              # + finance, notifications keys
```

### C.4 Updated Environment Variables (append to original §5 `.env.example`)

```env
# WhatsApp Cloud API (Phase 8–10) — required in production, optional in development/test
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_APP_SECRET=                    # for X-Hub-Signature-256 webhook verification
WHATSAPP_WEBHOOK_VERIFY_TOKEN=          # for the GET handshake (hub.verify_token)
WHATSAPP_API_VERSION=v20.0
WHATSAPP_MAX_RETRY=3

# Notification (Phase 6)
NOTIFICATION_RETRY_CRON_SCHEDULE=*/15 * * * *

# Reports / receivables (Phase 14/16) — no new secrets needed, listed for completeness only
REPORTS_MAX_RANGE_DAYS=1100

# Multi-property (Phase 7) — DEFAULT_PROPERTY_ID (already in original §5) is kept, unchanged.
```

### C.5 Phase Renumbering Map (old §10 Fase → new Phase)

| Old (`§10 Urutan Eksekusi`) | New | Status |
|---|---|---|
| Fase 0 — Init project | Phase 0 | Unchanged, completed |
| Fase 1 — Prisma schema | Phase 1 | Unchanged, completed |
| Fase 2 — Core app skeleton | Phase 2 | Unchanged, completed |
| Fase 3 — Module auth | Phase 3 | Unchanged, completed |
| Fase 4 — Module kamar & penyewa | Phase 4 | Unchanged, completed |
| Fase 5 — Module pembayaran | **Phase 5** | Revised — §A above |
| Fase 6 — Module push | **Phase 6** | Absorbed into "Notification Foundation + Web Push Refactor" |
| Fase 7 — Job reminder | **Phase 9** | Rebuilt as "Payment Reminder Engine", moved later so it can depend on multi-property (Phase 7) and WhatsApp (Phase 8) |
| *(new)* | **Phase 7** | Multi-Property Context |
| *(new)* | **Phase 8** | WhatsApp Module |
| *(new)* | **Phase 10** | WhatsApp Webhook + Delivery Tracking |
| *(new)* | **Phase 11–17** | Finance Foundation → Dashboard Expansion |
| Fase 8 — Dashboard summary | **Phase 17** | Extended, not replaced |
| *(new)* | **Phase 18** | Testing and Data Isolation |
| Fase 9 — Dockerize | **Phase 19** | Extended |
| Fase 10 — CI | **Phase 20** | Extended |
| Fase 11 — README | **Phase 21** | Extended |

### C.6 Docker & Tech Stack Additions

| Layer | Addition | Why |
|---|---|---|
| HTTP client | `axios` (or `undici` if avoiding an extra dependency is preferred — either is fine, pick one and use it consistently) | WhatsApp Cloud API calls (Phase 8). |
| Retry/backoff | plain `node-cron` sweep + `retryCount`/`failedAt` columns (Phase 10) — **no new queue system** (e.g. BullMQ/Redis) is introduced | The message volume for a single small kost property does not justify a Redis-backed job queue; the existing `node-cron` + DB-column approach already used for reminders is reused for retries. Revisit only if volume grows across many properties later. |
| Webhook exposure | none new in `docker-compose.yml` — the existing `app` service already exposes `PORT`; production reverse proxy/TLS (outside this compose file's scope, as in the original plan) must route `/api/notification/whatsapp/webhook` publicly. | Meta requires HTTPS and public reachability; this is a deployment/infra concern already outside `docker-compose.yml`'s original scope (which only handles `app`/`db`/`adminer`), so it is documented, not newly modeled in compose. |
| `docker-compose.yml` / `Dockerfile` | No structural change — same `app`, `db`, `adminer` services; only new env vars flow through `.env`. | Keeps infra complexity proportional to the actual need (see Phase 19). |

### C.7 CI Additions

`.github/workflows/ci.yml` (extends original §8 steps 1–5) now also:

6. Starts a `postgres:16-alpine` service container (was previously "optional if there are tests" — now required).
7. Runs `npx prisma migrate deploy` against the service container before tests, so the full Phase 5–17 migration history is exercised on every PR.
8. Runs `npm test`, which now includes the Phase 18 cross-property isolation suite and all provider tests (WhatsApp/web-push calls mocked, no real external calls in CI).

### C.8 README Outline Additions

Append to the original README structure (setup, Docker, VAPID, seed/migration):

1. **WhatsApp Cloud API setup** — creating a Meta app, obtaining `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`, configuring the webhook URL + `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in the Meta dashboard, and approving message templates.
2. **Reminder configuration** — how `ReminderConfig.offsets`/`channels` work per property, with examples.
3. **Finance module overview** — accounts/categories/transactions relationship, the cash-based vs billed/receivable metric distinction (Phase 16 table), and where deposits fit (excluded from revenue, included in cash flow).
4. **Multi-property status** — current single-property limitation via `DEFAULT_PROPERTY_ID`, and the documented upgrade path via `req.user.propertyId` (Phase 7) for when a second property is actually onboarded.
5. **Running the full test suite locally**, including the isolation suite and how to point it at a local Postgres.

---

## Summary of what changed vs. what's new

- **Genuinely additive, zero breaking changes:** Phase 5 (new table + 2 columns + 1 enum value), Phase 6 (new columns on existing skeleton tables that were unused in production), Phases 7–21 (entirely new tables/modules).
- **No existing endpoint response shape loses a field.** `Pembayaran`, `Kamar`, `Penyewa`, `dashboard/summary` all keep their original fields; new data is added under new keys/new endpoints.
- **No `Fase 0–4` file is rewritten**, only `pembayaran.*`, `push.service.ts`, `auth.middleware.ts`/`auth.service.ts` (Phase 7's additive JWT claim), and `dashboard.service.ts` (Phase 17) are *modified*, and each modification is called out explicitly above rather than assumed.
