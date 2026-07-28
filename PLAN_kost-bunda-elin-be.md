# Plan: Boilerplate Backend "Kost Putri Bunda Elin" Dashboard

> Berikan file ini ke Claude Code sebagai instruksi kerja. Tulis semua prompt di bawah secara berurutan (satu fase = satu prompt), jangan loncat fase supaya Claude Code tidak kehilangan konteks arsitektur.

## 0. Konteks & Referensi

- **Template referensi struktur**: https://github.com/huda7077/FP-0510-01-BE (generated dari template `huda7077/template-express-prisma`) → Express.js + TypeScript + Prisma, folder utama: `src/`, `prisma/`, `.github/workflows/`, `.vscode/`, `tsconfig.json`.
- **Sumber requirement fitur**: technical brief kos (lihat Bagian 2 di bawah — diringkas dari PDF yang diupload).
- **Tujuan**: BE untuk dashboard admin kos "Putri Bunda Elin" — CRUD kamar & penyewa, pencatatan pembayaran bulanan, web push reminder jatuh tempo/tunggakan, dan fondasi untuk fitur tambahan (template pesan, log notifikasi, multi-admin, multi-kos).
- **Bukan bagian dari boilerplate ini**: Next.js FE, WhatsApp Cloud API (opsional, fase belakangan).

---

## 1. Tech Stack (dikonfirmasi dari brief)

| Layer | Pilihan |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | Express.js |
| Bahasa | TypeScript |
| ORM | Prisma |
| Database | PostgreSQL (bukan SQLite, langsung production-ready) |
| Auth | Session via cookie httpOnly + JWT signed token, password hashing pakai bcrypt |
| Push notification | `web-push` (VAPID) |
| Scheduler | `node-cron` |
| Validasi | `zod` |
| Logging | `pino` atau `winston` (pilih `pino` + `pino-http`, lebih ringan) |
| Testing | `jest` + `supertest` |
| Container | Docker + docker-compose (app + postgres + adminer) |
| CI/CD | GitHub Actions (lint, typecheck, build, test) |

---

## 2. Ringkasan Fitur → Kebutuhan Data/Endpoint

Dipetakan dari technical brief (2.2–2.6 = wajib versi 1, 3.x = tambahan, 4.x = opsional/nice-to-have). Boilerplate fokus ke fondasi 2.x + skeleton untuk 3.x supaya gampang dikembangkan tanpa migrasi ulang skema secara drastis.

### 2.1 Auth & Admin
- Login admin (email/username + password) → cookie httpOnly berisi JWT.
- Middleware `requireAuth`, dan `requireRole('owner' | 'staff')` untuk kesiapan fitur multi-admin (3.4) sejak awal, walau versi 1 cukup 1 role default `owner`.

### 2.2 Manajemen Kamar (Kamar/Room)
- CRUD kamar: nomor, lantai, harga, status (`KOSONG`, `TERISI`, `NONAKTIF`).
- Relasi ke `Property` (disiapkan sejak awal untuk fitur 4.5 multi-kos, tapi versi 1 cukup 1 property default yang di-seed).

### 2.3 Manajemen Penyewa (Tenant)
- CRUD penyewa: nama, no HP, kamar (relasi), tanggal mulai sewa, nominal sewa, tanggal jatuh tempo bulanan.
- Set status keluar (tanggal keluar → kamar otomatis jadi `KOSONG`).

### 2.4 Pencatatan Pembayaran (Payment)
- Input pembayaran bulanan: periode (bulan/tahun), tanggal jatuh tempo, status (`BELUM_BAYAR`, `LUNAS`, `TERLAMBAT`), tanggal bayar, nominal, catatan.
- Query list "akan jatuh tempo" (H-3 s.d. H) dan "menunggak" (H+N).

### 2.5 Web Push
- `PushSubscription` model per penyewa (endpoint, p256dh key, auth key).
- Endpoint `POST /api/push/subscribe`, `POST /api/push/unsubscribe`.
- Cron job harian: cek H-3/H-1/H (jatuh tempo) dan H+3/H+7 (tunggakan) → kirim via `web-push`.

### 2.6 Skeleton untuk fitur tambahan (disiapkan modelnya saja, endpoint dasar CRUD)
- `MessageTemplate` (3.1): jenis (`REMINDER_JATUH_TEMPO`, `REMINDER_TUNGGAKAN`, `PENGUMUMAN`), isi dengan placeholder `{{nama}}`, `{{kamar}}`, `{{tanggal_jatuh_tempo}}`, `{{nominal}}`.
- `NotificationLog` (3.2): penyewa, jenis pesan, isi ringkas, waktu kirim, status sukses/gagal.
- `ReminderConfig` (3.1): interval H-berapa / H+berapa, disimpan sebagai konfigurasi global per property.

---

## 3. Struktur Folder (mengikuti gaya template referensi)

```
kost-bunda-elin-be/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .vscode/
│   └── settings.json
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/           (auto-generated)
├── src/
│   ├── config/
│   │   ├── env.ts            # validasi env pakai zod
│   │   ├── prisma.ts         # prisma client singleton
│   │   └── logger.ts
│   ├── middlewares/
│   │   ├── auth.middleware.ts
│   │   ├── error.middleware.ts
│   │   ├── validate.middleware.ts   # zod request validator
│   │   └── role.middleware.ts
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.route.ts
│   │   │   └── auth.schema.ts
│   │   ├── kamar/
│   │   │   ├── kamar.controller.ts
│   │   │   ├── kamar.service.ts
│   │   │   ├── kamar.route.ts
│   │   │   └── kamar.schema.ts
│   │   ├── penyewa/
│   │   │   └── ...(pola sama)
│   │   ├── pembayaran/
│   │   │   └── ...
│   │   ├── push/
│   │   │   ├── push.controller.ts
│   │   │   ├── push.service.ts
│   │   │   ├── push.route.ts
│   │   │   └── push.schema.ts
│   │   ├── message-template/
│   │   │   └── ...
│   │   ├── notification-log/
│   │   │   └── ...
│   │   └── dashboard/
│   │       ├── dashboard.controller.ts
│   │       ├── dashboard.service.ts
│   │       └── dashboard.route.ts
│   ├── jobs/
│   │   └── reminder.job.ts    # node-cron: cek jatuh tempo & tunggakan harian
│   ├── utils/
│   │   ├── apiResponse.ts
│   │   ├── apiError.ts
│   │   ├── asyncHandler.ts
│   │   └── date.util.ts
│   ├── routes/
│   │   └── index.ts           # gabungkan semua module.route.ts
│   ├── app.ts                 # setup express app, middleware global
│   └── server.ts              # entry point, start server + cron
├── docker/
│   └── postgres/ (optional init scripts)
├── .env.example
├── .dockerignore
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

**Catatan pola per module:** setiap module punya `route → controller → service → prisma`. Controller tipis (parsing request, panggil service, kirim response). Service isi business logic + akses Prisma. Schema pakai `zod` untuk validasi body/query, dipakai di `validate.middleware.ts`.

---

## 4. Skema Database (Prisma)

Model inti yang perlu dibuat di `prisma/schema.prisma`:

```prisma
enum Role {
  OWNER
  STAFF
}

enum StatusKamar {
  KOSONG
  TERISI
  NONAKTIF
}

enum StatusPembayaran {
  BELUM_BAYAR
  LUNAS
  TERLAMBAT
}

enum JenisPesan {
  REMINDER_JATUH_TEMPO
  REMINDER_TUNGGAKAN
  PENGUMUMAN
}

enum StatusKirim {
  SUKSES
  GAGAL
}

model Property {
  id        String   @id @default(uuid())
  nama      String
  alamat    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  admins    Admin[]
  kamar     Kamar[]
  reminderConfig ReminderConfig?
}

model Admin {
  id           String   @id @default(uuid())
  nama         String
  email        String   @unique
  passwordHash String
  role         Role     @default(OWNER)
  propertyId   String
  property     Property @relation(fields: [propertyId], references: [id])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Kamar {
  id         String      @id @default(uuid())
  nomor      String
  lantai     String?
  harga      Decimal     @db.Decimal(12, 2)
  status     StatusKamar @default(KOSONG)
  propertyId String
  property   Property    @relation(fields: [propertyId], references: [id])
  penyewa    Penyewa[]
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  @@unique([propertyId, nomor])
}

model Penyewa {
  id                String    @id @default(uuid())
  nama              String
  noHp              String
  kamarId           String
  kamar             Kamar     @relation(fields: [kamarId], references: [id])
  tanggalMulaiSewa  DateTime
  nominalSewa       Decimal   @db.Decimal(12, 2)
  tanggalJatuhTempo Int       // tanggal dalam bulan, misal 5 = tiap tanggal 5
  tanggalKeluar     DateTime?
  aktif             Boolean   @default(true)
  pembayaran        Pembayaran[]
  pushSubscriptions PushSubscription[]
  notificationLogs  NotificationLog[]
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
}

model Pembayaran {
  id               String           @id @default(uuid())
  penyewaId        String
  penyewa          Penyewa          @relation(fields: [penyewaId], references: [id])
  periodeBulan     Int
  periodeTahun     Int
  tanggalJatuhTempo DateTime
  status           StatusPembayaran @default(BELUM_BAYAR)
  tanggalBayar     DateTime?
  nominal          Decimal          @db.Decimal(12, 2)
  catatan          String?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  @@unique([penyewaId, periodeBulan, periodeTahun])
}

model PushSubscription {
  id        String   @id @default(uuid())
  penyewaId String
  penyewa   Penyewa  @relation(fields: [penyewaId], references: [id])
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())
}

model MessageTemplate {
  id        String     @id @default(uuid())
  jenis     JenisPesan
  isi       String     // simpan raw template dengan placeholder {{nama}}, dll
  aktif     Boolean    @default(true)
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model ReminderConfig {
  id          String   @id @default(uuid())
  propertyId  String   @unique
  property    Property @relation(fields: [propertyId], references: [id])
  hMinusHari  Int[]    @default([3, 1, 0])   // H-3, H-1, H
  hPlusHari   Int[]    @default([3, 7])      // H+3, H+7
  updatedAt   DateTime @updatedAt
}

model NotificationLog {
  id         String      @id @default(uuid())
  penyewaId  String
  penyewa    Penyewa     @relation(fields: [penyewaId], references: [id])
  jenis      JenisPesan
  isiRingkas String
  waktuKirim DateTime    @default(now())
  status     StatusKirim
}
```

**Instruksi ke Claude Code:** generate schema ini persis, lalu jalankan `npx prisma migrate dev --name init` dan buat `prisma/seed.ts` yang seed 1 `Property` ("Kos Putri Bunda Elin"), 1 `Admin` role `OWNER` (password di-hash bcrypt, ambil dari env `SEED_ADMIN_PASSWORD`), 1 `ReminderConfig` default, dan beberapa `Kamar` contoh.

---

## 5. Environment Variables (`.env.example`)

```env
# App
NODE_ENV=development
PORT=4000
APP_URL=http://localhost:4000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/kost_bunda_elin?schema=public

# Auth
JWT_SECRET=change-me-super-secret
JWT_EXPIRES_IN=7d
COOKIE_NAME=kbe_session
COOKIE_SECURE=false

# Seed
SEED_ADMIN_EMAIL=admin@kosbundaelin.test
SEED_ADMIN_PASSWORD=ChangeMe123!

# Web Push (VAPID) - generate pakai `npx web-push generate-vapid-keys`
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@kosbundaelin.test

# Cron
REMINDER_CRON_SCHEDULE=0 8 * * *
TZ=Asia/Jakarta
```

---

## 6. Endpoint Utama (API contract untuk fase 1)

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/dashboard/summary          # ringkasan kamar + status pembayaran

GET    /api/kamar
POST   /api/kamar
GET    /api/kamar/:id
PATCH  /api/kamar/:id
DELETE /api/kamar/:id

GET    /api/penyewa
POST   /api/penyewa
GET    /api/penyewa/:id
PATCH  /api/penyewa/:id
POST   /api/penyewa/:id/keluar         # set tanggal keluar + kamar jadi KOSONG

GET    /api/pembayaran?status=akan_jatuh_tempo|menunggak
POST   /api/pembayaran
PATCH  /api/pembayaran/:id

POST   /api/push/subscribe
POST   /api/push/unsubscribe

GET    /api/message-template
POST   /api/message-template
PATCH  /api/message-template/:id

GET    /api/notification-log?penyewaId=
```

Semua endpoint (kecuali `/api/auth/login`) melewati `requireAuth`. Endpoint delete/global-config melewati `requireRole('OWNER')` (fondasi 3.4).

---

## 7. Docker Compose

Target: `docker-compose.yml` di root, dengan service:

- `app` — build dari `Dockerfile` (multi-stage: builder → production), expose port dari `PORT`, depends_on `db` (healthcheck), jalankan `prisma migrate deploy` sebelum start via entrypoint script.
- `db` — image `postgres:16-alpine`, volume persist, healthcheck `pg_isready`.
- `adminer` — image `adminer:latest`, port `8080:8080`, untuk inspeksi DB manual saat development (opsional tapi minta tetap dibuat, gampang di-remove kalau tidak dipakai).

Struktur yang diminta ke Claude Code:

```yaml
services:
  app:
    build: .
    ports: ["${PORT:-4000}:${PORT:-4000}"]
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: kost_bunda_elin
    volumes:
      - db_data:/var/lib/postgresql/data
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  adminer:
    image: adminer:latest
    ports: ["8080:8080"]
    depends_on: [db]

volumes:
  db_data:
```

Dan `Dockerfile` multi-stage (builder: install deps + `tsc build` + `prisma generate`; runner: copy `dist/` + `node_modules` production only + `prisma/`, jalankan `node dist/server.js` lewat entrypoint yang lebih dulu `npx prisma migrate deploy`).

---

## 8. CI/CD (GitHub Actions)

`.github/workflows/ci.yml` menjalankan pada `push`/`pull_request` ke `main`:
1. Checkout + setup Node 20 + cache npm.
2. `npm ci`.
3. `npm run lint`.
4. `npm run typecheck` (`tsc --noEmit`).
5. `npm run build`.
6. (opsional, jika ada test) spin up service `postgres` di job, `npm test`.

---

## 9. Package Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "lint": "eslint . --ext .ts",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:seed": "tsx prisma/seed.ts",
    "prisma:studio": "prisma studio"
  }
}
```

---

## 10. Urutan Eksekusi untuk Claude Code (jalankan bertahap, per fase satu prompt)

1. **Fase 0 — Init project**: `npm init`, install deps (express, typescript, prisma, @prisma/client, bcrypt, jsonwebtoken, cookie-parser, zod, cors, helmet, pino, pino-http, web-push, node-cron, dotenv) + devDeps (tsx, eslint, @typescript-eslint/*, jest, ts-jest, supertest, @types/*). Setup `tsconfig.json`, `.eslintrc`, `.gitignore`, `.env.example`.
2. **Fase 1 — Prisma schema**: buat schema di Bagian 4, jalankan migration awal, buat `seed.ts`.
3. **Fase 2 — Core app skeleton**: `src/app.ts`, `src/server.ts`, `src/config/*`, `src/middlewares/*`, `src/utils/*`.
4. **Fase 3 — Module auth**: login/logout/me, cookie httpOnly + JWT, bcrypt compare.
5. **Fase 4 — Module kamar & penyewa**: CRUD lengkap + validasi zod.
6. **Fase 5 — Module pembayaran**: CRUD + query akan-jatuh-tempo/menunggak (pakai date-fns atau util manual).
7. **Fase 6 — Module push**: subscribe/unsubscribe + `push.service.ts` pembungkus `web-push`.
8. **Fase 7 — Job reminder**: `src/jobs/reminder.job.ts` dengan `node-cron`, baca `ReminderConfig`, query penyewa jatuh tempo/tunggakan, render `MessageTemplate` (replace placeholder), kirim push, catat ke `NotificationLog`.
9. **Fase 8 — Dashboard summary endpoint**: agregasi jumlah kamar per status + jumlah pembayaran per status.
10. **Fase 9 — Dockerize**: `Dockerfile`, `docker-compose.yml`, entrypoint script migrate-then-start.
11. **Fase 10 — CI**: GitHub Actions workflow.
12. **Fase 11 — README**: instruksi setup lokal, setup Docker, generate VAPID keys, cara jalankan seed & migration.

---

## 11. Keputusan yang Sudah Dikonfirmasi

1. **Scope property**: Versi 1 hanya untuk **1 property** (Kos Putri Bunda Elin), tapi skema & kode tetap disiapkan supaya bisa upgrade ke multi-property tanpa migrasi ulang. Konsekuensi teknis:
   - Model `Property`, relasi `propertyId` di `Kamar`, `Admin`, `ReminderConfig` **tetap dipakai persis seperti Bagian 4** (jangan dihapus/disederhanakan).
   - Tapi endpoint **tidak perlu** menerima/memfilter `propertyId` dari client di versi 1 — service layer otomatis pakai "property aktif" yang diambil dari `DEFAULT_PROPERTY_ID` di `.env` (di-set setelah seed jalan), bukan hardcode di query.
   - Tambahkan helper `getDefaultPropertyId()` di `src/config/property.ts` yang baca dari env, dipakai oleh `kamar.service.ts` dan `dashboard.service.ts`. Ini titik satu-satunya yang perlu diubah kalau nanti upgrade ke multi-property (tinggal ganti jadi ambil dari `req.user.propertyId` atau param).

2. **Validasi nomor HP Indonesia**: dipakai di `penyewa.schema.ts` (dan `admin` kalau perlu). Aturan:
   - Terima format `08xxxxxxxxxx` (10–13 digit) atau `+62xxxxxxxxxx`.
   - Normalisasi ke format `62xxxxxxxxxx` (tanpa `+`, tanpa `0` di depan) sebelum disimpan ke DB — ini juga format yang dipakai WhatsApp API nanti di fitur opsional 4.1.
   - Contoh regex zod: `/^(\+62|62|0)8[1-9][0-9]{6,10}$/` lalu `.transform()` untuk normalisasi.

3. **Refresh token terpisah**: tidak pakai JWT tunggal 7 hari. Skema auth jadi:
   - **Access token**: JWT umur pendek (`ACCESS_TOKEN_EXPIRES_IN=15m`), disimpan di cookie httpOnly `access_token`, dipakai `requireAuth` untuk validasi tiap request.
   - **Refresh token**: random string (bukan JWT) umur panjang (`REFRESH_TOKEN_EXPIRES_IN=30d`), disimpan di cookie httpOnly terpisah `refresh_token` **dan** di-hash (SHA-256) lalu disimpan di tabel `RefreshToken` (bukan disimpan plaintext) supaya bisa di-revoke.
   - Tambahan model Prisma:
     ```prisma
     model RefreshToken {
       id         String   @id @default(uuid())
       adminId    String
       admin      Admin    @relation(fields: [adminId], references: [id])
       tokenHash  String   @unique
       expiresAt  DateTime
       revokedAt  DateTime?
       createdAt  DateTime @default(now())
     }
     ```
     (tambahkan relasi `refreshTokens RefreshToken[]` di model `Admin`.)
   - Endpoint tambahan: `POST /api/auth/refresh` — validasi `refresh_token` cookie, cek hash cocok & belum revoked/expired di DB, terbitkan access token baru (rotasi: revoke refresh token lama, terbitkan yang baru — dipakai supaya lebih aman).
   - `POST /api/auth/logout` harus revoke refresh token di DB (set `revokedAt`), bukan cuma clear cookie.

### Update terkait di bagian lain dokumen ini

- **Bagian 5 (.env.example)** tambahkan:
  ```env
  ACCESS_TOKEN_SECRET=change-me-access-secret
  ACCESS_TOKEN_EXPIRES_IN=15m
  REFRESH_TOKEN_EXPIRES_IN=30d
  ACCESS_COOKIE_NAME=access_token
  REFRESH_COOKIE_NAME=refresh_token
  DEFAULT_PROPERTY_ID=
  ```
  (hapus `JWT_SECRET`/`JWT_EXPIRES_IN`/`COOKIE_NAME` lama, diganti pasangan access/refresh di atas.)

- **Bagian 6 (Endpoint)** tambahkan:
  ```
  POST   /api/auth/refresh
  ```

- **Bagian 10 (Urutan Eksekusi)**, Fase 3 diperluas jadi:
  > **Fase 3 — Module auth**: login (terbitkan access + refresh token, refresh token di-hash & disimpan di tabel `RefreshToken`), refresh endpoint (validasi + rotasi), logout (revoke refresh token di DB + clear kedua cookie), `me` endpoint, bcrypt compare untuk password.

- **Fase 4 (kamar & penyewa)** ditambah catatan: gunakan `getDefaultPropertyId()` di service, dan pastikan `penyewa.schema.ts` menerapkan validasi + normalisasi nomor HP di atas.
