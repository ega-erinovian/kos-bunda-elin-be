# Kos Bunda Elin Backend

Backend API for **Kost Putri Bunda Elin** — a multi-property boarding house management system. Built with **Express 5**, **TypeScript**, **Prisma ORM**, and **PostgreSQL**.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+, Express 5, TypeScript (ES2022, NodeNext) |
| Database | PostgreSQL 16, Prisma 7 + `@prisma/adapter-pg` |
| Validation | Zod 4 |
| Auth | JWT (access token in httpOnly cookie) + bcrypt + hashed refresh tokens |
| Logging | Pino + pino-http |
| Jobs | node-cron |
| Testing | Jest + ts-jest + supertest |
| Linting | ESLint (flat config) |

---

## Project Structure

```
src/
├── app.ts                    # Express setup, middleware stack, route registration
├── server.ts                 # HTTP server, graceful shutdown, cron jobs
├── config/
│   ├── env.ts                # Zod-validated environment schema
│   ├── prisma.ts             # PrismaClient singleton
│   ├── logger.ts             # Pino logger
│   └── property.ts           # getDefaultPropertyId / getRequestPropertyId
├── middlewares/
│   ├── auth.middleware.ts    # requireAuth (cookie OR Bearer)
│   ├── role.middleware.ts    # requireRole('OWNER'|'STAFF')
│   ├── property.middleware.ts# resolveProperty / requireProperty
│   ├── validate.middleware.ts# validate(schema, 'body'|'query'|'params')
│   └── error.middleware.ts   # AppError → JSON, else 500
├── utils/
│   ├── apiError.ts           # AppError class
│   ├── apiResponse.ts        # apiSuccess / apiPagination
│   ├── asyncHandler.ts       # async wrapper
│   ├── serialize.util.ts     # Decimal → number (CRITICAL)
│   ├── paymentStatus.util.ts # computePembayaranStatus pure fn
│   ├── aging.util.ts         # Aging bucket logic
│   └── date.util.ts
├── types/express.d.ts        # req.user / req.admin / req.property / req.rawBody
├── routes/index.ts           # /health + all module routers under /api
├── modules/<domain>/         # One folder per domain (see below)
└── jobs/
    └── reminder.job.ts       # Cron: daily reminder sweep
```

### Module Anatomy (every domain follows this)

```
src/modules/example/
├── example.route.ts          # Router + middlewares + validation
├── example.controller.ts     # Thin: req → service → apiResponse
├── example.service.ts        # Business logic, Prisma, transactions
├── example.schema.ts         # Zod schemas + inferred TS types
└── example.mapper.ts         # Prisma → DTO (Decimal→number, Date→ISO)
```

---

## Core Concepts

### Property Isolation (Multi-Tenant)
- **Single property v1** (`DEFAULT_PROPERTY_ID` from `.env`), schema/code ready for multi-property.
- **Never** trust `propertyId` from client. Always derive via:
  ```ts
  import { getRequestPropertyId } from '../config/property.js';
  const propertyId = getRequestPropertyId(req);
  ```
- All Prisma queries scoped: `where: { ..., propertyId }` or via relations (`penyewa: { kamar: { propertyId } }`).
- Cross-property access returns **404** (not 403) to avoid leaking existence.

### Decimal Serialization (P0)
Prisma `Decimal` serializes to **string** by default. Frontend expects `number`.
**Every mapper must call `toNumber`/`toNumberRequired`** (`src/utils/serialize.util.ts:12`).

### Auth & Roles
- `requireAuth`: accepts `access_token` cookie **or** `Authorization: Bearer` header.
- Verifies JWT, re-fetches `Admin` from DB (DB wins over claim). Sets `req.user` + `req.admin`.
- `requireRole('OWNER')` gates: DELETE finance, expense reversal, reminder sweep, audit log.

### Idempotency
- `POST /api/pembayaran/:id/payments` requires `Idempotency-Key` header.
- Service derives deterministic fallback `sha256(pembayaranId+amount+date+ref)`.
- Unique `idempotencyKey` + `P2002` catch = replay returns original with **200**.

### Notification Dedupe
- `dedupeKey = ${pembayaranId}:${channel}:${jenis}:${YYYY-MM-DD}` with `@unique`.
- Insert throws = "already sent today, skip".
- Resend (`POST /notification-log/:id/resend`) bypasses by appending `:resend:${Date.now()}`.

### Status Derivation
- `Pembayaran.status` **never** client-settable. Derived via:
  ```ts
  computePembayaranStatus(nominal, totalDibayar, due, now)
  ```
- Partial = `SEBAGIAN` regardless of due date; overdue only when `totalDibayar <= 0 && now > due`.

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or Docker)
- pnpm/npm/yarn

### Environment Variables
Copy `.env.example` → `.env` and fill:

```bash
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/kos_bunda_elin?schema=public"

# JWT
ACCESS_TOKEN_SECRET="your-32-char-secret"
ACCESS_TOKEN_EXPIRY="15m"
REFRESH_TOKEN_EXPIRY_DAYS=30

# Default property (single-property mode)
DEFAULT_PROPERTY_ID="uuid-of-property"

# Optional: WhatsApp Cloud API
WHATSAPP_APP_SECRET=""
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_WEBHOOK_VERIFY_TOKEN=""
WHATSAPP_PROVIDER="mock"  # "mock" for CI, "cloud" for prod

# Optional: Web Push
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:admin@example.com"

# App
PORT=3000
NODE_ENV="development"
LOG_LEVEL="info"
APP_URL="http://localhost:3000"
```

### Install & Run

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database (optional)
npm run prisma:seed

# Development (watch mode)
npm run dev

# Production build
npm run build
npm start
```

### Docker

```bash
# Start PostgreSQL only (dev)
docker-compose up -d db

# Full stack (prod) — add `app` service to docker-compose.yml first
docker-compose up -d
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with `tsx watch` |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Jest (integration + unit) |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Create & apply migration (dev) |
| `npm run prisma:deploy` | Apply migrations (prod/CI) |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run prisma:seed` | Run seed script |

---

## API Endpoints (Frozen Contract)

All routes under `/api`. **Auth required** unless marked `[public]`. `[OWNER]` = `requireRole('OWNER')`.

### Auth
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | public | Login → sets `access_token` cookie |
| POST | `/api/auth/refresh` | public | Rotate access token via refresh token |
| POST | `/api/auth/logout` | requireAuth | Revoke refresh token |
| GET | `/api/auth/me` | requireAuth | Current admin profile |

### Rooms (`/api/kamar`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/kamar` | requireAuth | List rooms (filter: status, page, limit) |
| POST | `/api/kamar` | requireAuth | Create room |
| GET | `/api/kamar/:id` | requireAuth | Get room detail |
| PATCH | `/api/kamar/:id` | requireAuth | Update room |
| DELETE | `/api/kamar/:id` | requireAuth | Delete room |

### Tenants (`/api/penyewa`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/penyewa` | requireAuth | List tenants (filter: kamarId, aktif, search, page, limit) |
| POST | `/api/penyewa` | requireAuth | Create tenant |
| GET | `/api/penyewa/:id` | requireAuth | Get tenant detail |
| PATCH | `/api/penyewa/:id` | requireAuth | Update tenant |
| DELETE | `/api/penyewa/:id` | requireAuth | Soft delete (set `aktif=false`) |

### Payments & Billing (`/api/pembayaran`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/pembayaran` | requireAuth | List bills (filter: status, penyewaId, periode, page, limit) |
| POST | `/api/pembayaran` | requireAuth | Create bill |
| GET | `/api/pembayaran/:id` | requireAuth | **Detail** — embeds `paymentRecords` |
| PATCH | `/api/pembayaran/:id` | requireAuth | Update `catatan`/`tanggalJatuhTempo` only |
| POST | `/api/pembayaran/:id/payments` | requireAuth | **Record payment** (idempotent, `Idempotency-Key` required) |
| GET | `/api/pembayaran/:id/payments` | requireAuth | Payment history (ordered by `paymentDate asc`) |

**Payment body:**
```json
{
  "paymentMethod": "CASH|BANK_TRANSFER|QRIS|E_WALLET|OTHER",
  "paymentDate": "2026-01-15",
  "amountPaid": 500000,
  "referenceNumber": "TRX-123",
  "notes": "Partial payment",
  "financialAccountId": "uuid-optional"
}
```

### Notifications — Templates & Config (`/api/message-template`, `/api/reminder-config`)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/message-template?channel=WEB_PUSH\|WHATSAPP` | requireAuth | List templates |
| POST | `/api/message-template` | OWNER | Create template (seeding/ops) |
| PATCH | `/api/message-template/:id` | OWNER | Update `isi` only |
| GET | `/api/reminder-config` | requireAuth | Get reminder config |
| PATCH | `/api/reminder-config` | OWNER | Update offsets, channels, active |

### Notifications — Log, Send, Sweep, Webhook
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/notification-log` | requireAuth | List logs (filter: penyewaId, channel, status, from, to, page, pageSize) |
| POST | `/api/notification-log/:id/resend` | requireAuth | Resend (creates new log row) |
| POST | `/api/notification/reminders/send` | requireAuth | Manual send for `pembayaranId` or `penyewaId` |
| POST | `/api/notification/reminders/run-sweep` | OWNER | Run reminder sweep (cron calls this) |
| GET | `/api/notification/whatsapp/webhook` | public | Meta verification handshake |
| POST | `/api/notification/whatsapp/webhook` | public | Meta webhook events (HMAC verified) |

### Finance — Accounts, Categories, Transactions, Audit
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/finance/accounts` | requireAuth | List financial accounts |
| POST | `/api/finance/accounts` | requireAuth | Create account |
| PATCH | `/api/finance/accounts/:id` | requireAuth | Update account |
| GET | `/api/finance/categories?type=INCOME\|EXPENSE` | requireAuth | List categories |
| POST | `/api/finance/categories` | requireAuth | Create category |
| PATCH | `/api/finance/categories/:id` | requireAuth | Update category |
| GET | `/api/finance/transactions` | requireAuth | List transactions (filter: type, categoryId, accountId, from, to, page, pageSize) |
| POST | `/api/finance/transactions` | requireAuth | Create manual transaction (`source`: MANUAL_INCOME\|MANUAL_EXPENSE) |
| PATCH | `/api/finance/transactions/:id` | requireAuth | Update description/referenceNumber/categoryId |
| DELETE | `/api/finance/transactions/:id` | OWNER | Soft delete (`deletedAt`) |
| GET | `/api/audit-log` | OWNER | List audit logs (filter: entity, entityId, propertyId, from, to) |

### Expenses & Reversal
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/expenses` | requireAuth | Create expense (requires `vendorName`, `receiptUrl?`) |
| GET | `/api/expenses` | requireAuth | List expenses (filter: categoryId, accountId, from, to, vendorName) |
| PATCH | `/api/expenses/:id` | requireAuth | Update `vendorName`/`receiptUrl`/`description` |
| POST | `/api/expenses/:id/reverse` | OWNER | Reverse expense (inserts offsetting `ADJUSTMENT`) |
| POST | `/api/finance/transactions/:id/reverse` | OWNER | Reverse any manual transaction |

### Receivables & Aging
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/receivables` | requireAuth | Outstanding by tenant |
| GET | `/api/receivables/summary` | requireAuth | Summary totals |
| GET | `/api/receivables/aging` | requireAuth | 5 buckets: `current` `1-30` `31-60` `61-90` `90+` |
| GET | `/api/reports/receivables` | requireAuth | Alias of above |
| GET | `/api/reports/receivables/aging` | requireAuth | Alias of above |

### Tenant Deposits
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/deposits` | requireAuth | Receive deposit |
| GET | `/api/deposits` | requireAuth | List deposits (filter: penyewaId, status) |
| PATCH | `/api/deposits/:id/deduct` | requireAuth | Deduct from deposit (replaces amount) |
| POST | `/api/deposits/:id/refund` | requireAuth | Refund deposit |

### Financial Reports
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/reports/dashboard?from=&to=` | requireAuth | Dashboard report (revenue, expenses, cash flow, occupancy, overdue, revenue trend) |
| GET | `/api/reports/transactions?from=&to=` | requireAuth | Raw transactions for export (no pagination) |
| GET | `/api/reports/revenue?from=&to=` | requireAuth | Revenue report (billed, cash, otherIncome, collectionRate, expected) |
| GET | `/api/reports/expenses?from=&to=` | requireAuth | Expense report (total, byCategory, trend) |
| GET | `/api/reports/cash-flow?from=&to=` | requireAuth | Cash flow (inflow, outflow, net) |
| GET | `/api/reports/income-statement?from=&to=` | requireAuth | Income statement (totalIncome, totalExpenses, netOperatingIncome) |

### Dashboard Expansion
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/dashboard/summary?from=&to=` | requireAuth | Unified summary: kamar counts, pembayaran grouped, finance + notifications additive keys |

---

## Key Data Models (Prisma Schema Highlights)

```prisma
// Core
Property, Admin, Kamar, Penyewa, RefreshToken

// Payments
Pembayaran (bill per tenant per month)
PaymentRecord (individual payment events, idempotent)

// Notifications
MessageTemplate (per property, channel, jenis)
ReminderConfig (offsets: [-7,-3,-1,0,1,3,7], channels, active)
NotificationLog (dedupeKey @unique, retryCount, status tracking)

// Finance
FinancialAccount (CASH|BANK|E_WALLET|QRIS|OTHER)
FinancialCategory (INCOME|EXPENSE, unique code per property)
FinancialTransaction (type, source, amount, links to paymentRecord/deposit)
AuditLog (entity, entityId, action, before/after JSON)

// Deposits
Deposit (HELD|PARTIALLY_REFUNDED|REFUNDED|FORFEITED, linked to FinancialTransaction)
```

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/pembayaran.test.ts
```

**Test suites include:**
- Unit: `computePembayaranStatus`, `aging.util`, `reminder-eligibility`
- Integration: All endpoints (happy path, 404, 403, validation)
- Cross-property isolation: 2 properties, 2 admins, assert A cannot read B
- Contract: Monetary fields are `number` (not `string`), aging labels exact, pagination shape

---

## Development Workflow

1. **Read `PLAN.md §2`** — wire contract (path/method/shape/status/role)
2. **Add schema** in `prisma/schema.prisma` → `npm run prisma:migrate`
3. **Create module** under `src/modules/<domain>/` (route, controller, service, schema, mapper)
4. **Register route** in `src/routes/index.ts`
5. **Write tests** (unit + integration + isolation)
6. **Run checks** before push:
   ```bash
   npm run typecheck && npm run lint && npm test
   ```

---

## Critical Conventions (from AGENTS.md)

- **Indonesian** for domain models: `Kamar`, `Penyewa`, `Pembayaran`, `StatusPembayaran`, `JenisPesan`
- **English** for infra/finance: `Property`, `Admin`, `FinancialAccount`, `FinancialTransaction`, `Deposit`
- Never add dependencies when `zod`/`date-fns`/`decimal.js`/`prisma` cover it
- No interfaces/factories for single implementations
- Never hard-delete financial history — `deletedAt` or offsetting reversal row
- Use `logger.info/error`, never `console.log` in request path
- New env vars → add to `src/config/env.ts` (zod), optional in dev/test

---

## CI/CD (Phase 20 — TODO)

- `.github/workflows/ci.yml` with PostgreSQL service
- `prisma migrate deploy` before tests
- `WHATSAPP_PROVIDER=mock` in CI
- `npm run typecheck && npm run lint && npm test`

---

## Documentation References

| Document | Purpose |
|----------|---------|
| `PLAN.md` | **Wire contract** (path/method/shape/status/role) — authoritative |
| `AGENTS.md` | Implementation conventions (how to code in this repo) |
| `PROGRESS.md` | Phase tracker (what's ✅/🟡/⬜) |
| `features_list.md` | Endpoint inventory (one row per frozen endpoint) |
| `prisma/schema.prisma` | Database schema |

---

## License

ISC