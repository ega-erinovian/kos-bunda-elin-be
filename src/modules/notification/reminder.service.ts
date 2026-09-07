import prisma from '../../config/prisma.js'
import logger from '../../config/logger.js'
import { AppError } from '../../utils/apiError.js'
import { sendNotification } from './notification.service.js'
import {
  daysFromDue,
  getJenisForDaysFromDue,
  getJenisForOffset,
} from './reminder-eligibility.util.js'
import type { NotificationChannel, JenisPesan, NotificationLog } from '@prisma/client'
import { format } from 'date-fns'
import { Decimal } from 'decimal.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReminderSweepOptions {
  propertyId?: string
  now?: Date
}

export interface SkippedReason {
  reason: string
  pembayaranId?: string
  penyewaId?: string
  channel?: NotificationChannel
}

export interface ReminderSweepResult {
  sent: number
  skipped: number
  sentLogs: NotificationLog[]
  skippedReasons: SkippedReason[]
}

export interface ManualReminderOptions {
  propertyId: string
  pembayaranId?: string
  penyewaId?: string
  now?: Date
}

export interface ManualReminderResult {
  sent: NotificationLog[]
  skipped: SkippedReason[]
}

// ---------------------------------------------------------------------------
// Helpers: formatting & template rendering (pure)
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value)
}

function formatDate(date: Date): string {
  try {
    return format(date, 'dd MMMM yyyy')
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

function renderTemplate(isi: string, data: Record<string, string>): string {
  return isi.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => data[key] ?? '')
}

function getDefaultTemplate(jenis: JenisPesan): string {
  if (jenis === 'REMINDER_TUNGGAKAN') {
    return 'Halo {{nama}}, kamar {{kamar}} menunggak sejak {{tanggalJatuhTempo}}. Sisa tagihan: Rp {{sisaTagihan}} untuk periode {{periode}}. Mohon segera lakukan pembayaran.'
  }
  if (jenis === 'REMINDER_JATUH_TEMPO') {
    return 'Halo {{nama}}, kamar {{kamar}} akan jatuh tempo pada {{tanggalJatuhTempo}}. Nominal: Rp {{nominal}}. Sisa tagihan: Rp {{sisaTagihan}} untuk periode {{periode}}.'
  }
  return 'Halo {{nama}}, ada pengumuman untuk kamar {{kamar}}.'
}

function toNumberDecimal(value: Decimal | number | string): number {
  if (value instanceof Decimal) return value.toNumber()
  if (typeof value === 'number') return value

  const maybeDecimal = value as unknown as { toNumber?: () => number }
  if (maybeDecimal && typeof maybeDecimal.toNumber === 'function') {
    return maybeDecimal.toNumber()
  }
  return Number(value)
}

// ---------------------------------------------------------------------------
// Core: payload builder (shares logic between sweep + manual)
// ---------------------------------------------------------------------------

interface BuildPayloadArgs {
  propertyId: string
  propertyNama: string | null
  pembayaran: {
    id: string
    periodeBulan: number
    periodeTahun: number
    tanggalJatuhTempo: Date
    nominal: Decimal | number
    totalDibayar: Decimal | number
    status: string
  }
  penyewa: {
    id: string
    nama: string
    noHp: string
    kamar: { nomor: string }
  }
  jenis: JenisPesan
  channel: NotificationChannel
  now: Date
}

async function buildAndSend({
  propertyId,
  propertyNama,
  pembayaran,
  penyewa,
  jenis,
  channel,
  now,
}: BuildPayloadArgs): Promise<{ log: NotificationLog | null; deduped: boolean; skippedReason?: string }> {
  const supported: NotificationChannel[] = ['WEB_PUSH', 'WHATSAPP']
  if (!supported.includes(channel)) {
    return {
      log: null,
      deduped: false,
      skippedReason: `channel_not_supported: ${channel}`,
    }
  }

  if (channel === 'WHATSAPP' && !penyewa.noHp) {
    return { log: null, deduped: false, skippedReason: 'missing_phone_number' }
  }

  const nominalNum = toNumberDecimal(pembayaran.nominal)
  const totalDibayarNum = toNumberDecimal(pembayaran.totalDibayar)
  const sisaNum = Math.max(0, nominalNum - totalDibayarNum)
  const periodeStr = `${pembayaran.periodeBulan}/${pembayaran.periodeTahun}`

  const template = await prisma.messageTemplate.findFirst({
    where: { propertyId, channel, jenis, aktif: true },
  })

  const rawIsi = template?.isi ?? getDefaultTemplate(jenis)

  const dataMap: Record<string, string> = {
    nama: penyewa.nama,
    kamar: penyewa.kamar.nomor,
    nominal: formatCurrency(nominalNum),
    periode: periodeStr,
    periodeBulan: String(pembayaran.periodeBulan),
    periodeTahun: String(pembayaran.periodeTahun),
    tanggalJatuhTempo: formatDate(pembayaran.tanggalJatuhTempo),
    totalDibayar: formatCurrency(totalDibayarNum),
    sisaTagihan: formatCurrency(sisaNum),
    noHp: penyewa.noHp,
    status: pembayaran.status,
    namaProperty: propertyNama ?? '',
  }

  const isiRingkas = renderTemplate(rawIsi, dataMap)

  const recipient = channel === 'WHATSAPP' ? penyewa.noHp : `webpush:${penyewa.id}`

  const templateData: Record<string, string | number> = {
    nama: penyewa.nama,
    kamar: penyewa.kamar.nomor,
    periode: periodeStr,
    tanggalJatuhTempo: formatDate(pembayaran.tanggalJatuhTempo),
    nominal: String(nominalNum),
    sisaTagihan: String(sisaNum),
    namaProperty: propertyNama ?? '',
  }

  try {
    const result = await sendNotification(
      {
        propertyId,
        penyewaId: penyewa.id,
        pembayaranId: pembayaran.id,
        channel,
        jenis,
        recipient,
        isiRingkas,
        templateData,
      },
      { dedupeDate: now },
    )

    if (result.deduped) {
      return { log: result.log as NotificationLog | null, deduped: true }
    }

    return { log: result.log as NotificationLog, deduped: false }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.warn({ err, pembayaranId: pembayaran.id, channel }, 'reminder send failed')
    return { log: null, deduped: false, skippedReason: message }
  }
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

/**
 * Runs the reminder sweep.
 */
export async function runReminderSweep(options: ReminderSweepOptions = {}): Promise<ReminderSweepResult> {
  const now = options.now ?? new Date()

  const propertyIds: string[] = options.propertyId
    ? [options.propertyId]
    : (await prisma.property.findMany({ select: { id: true } })).map((p) => p.id)

  let sent = 0
  let skipped = 0
  const sentLogs: NotificationLog[] = []
  const skippedReasons: SkippedReason[] = []

  for (const propertyId of propertyIds) {
    const config = await prisma.reminderConfig.findUnique({ where: { propertyId } })

    if (!config) {
      logger.info({ propertyId }, 'Reminder sweep: no ReminderConfig — skipping property')
      continue
    }

    if (!config.active) {
      logger.info({ propertyId }, 'Reminder sweep: config inactive — skipping property')
      continue
    }

    const offsets = config.offsets as number[]
    const channels = config.channels as NotificationChannel[]

    if (offsets.length === 0 || channels.length === 0) {
      logger.info({ propertyId }, 'Reminder sweep: empty offsets or channels — skipping property')
      continue
    }

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { nama: true },
    })

    const outstanding = await prisma.pembayaran.findMany({
      where: {
        status: { in: ['BELUM_BAYAR', 'SEBAGIAN', 'TERLAMBAT'] },
        penyewa: { kamar: { propertyId }, aktif: true },
      },
      include: {
        penyewa: {
          include: { kamar: { select: { nomor: true } } },
        },
      },
    })

    for (const bill of outstanding) {
      const fresh = await prisma.pembayaran.findUnique({ where: { id: bill.id } })

      if (!fresh) {
        skipped++
        skippedReasons.push({ reason: 'pembayaran_not_found', pembayaranId: bill.id })
        continue
      }

      if (fresh.status === 'LUNAS') {
        skipped++
        skippedReasons.push({ reason: 'already_paid', pembayaranId: bill.id })
        continue
      }

      const offset = daysFromDue(fresh.tanggalJatuhTempo, now)

      if (!offsets.includes(offset)) {
        skipped++
        skippedReasons.push({ reason: `offset_not_matched: daysFromDue=${offset}`, pembayaranId: bill.id })
        continue
      }

      const jenis = getJenisForOffset(offset)

      for (const channel of channels) {
        const outcome = await buildAndSend({
          propertyId,
          propertyNama: property?.nama ?? null,
          pembayaran: {
            id: fresh.id,
            periodeBulan: fresh.periodeBulan,
            periodeTahun: fresh.periodeTahun,
            tanggalJatuhTempo: fresh.tanggalJatuhTempo,
            nominal: fresh.nominal as unknown as Decimal,
            totalDibayar: fresh.totalDibayar as unknown as Decimal,
            status: fresh.status,
          },
          penyewa: {
            id: bill.penyewa.id,
            nama: bill.penyewa.nama,
            noHp: bill.penyewa.noHp,
            kamar: { nomor: bill.penyewa.kamar.nomor },
          },
          jenis,
          channel,
          now,
        })

        if (outcome.deduped) {
          skipped++
          skippedReasons.push({ reason: 'duplicate_today', pembayaranId: bill.id, channel })
          continue
        }

        if (outcome.skippedReason) {
          skipped++
          skippedReasons.push({ reason: outcome.skippedReason, pembayaranId: bill.id, channel })
          continue
        }

        if (outcome.log) {
          sent++
          sentLogs.push(outcome.log)
        } else {
          skipped++
          skippedReasons.push({ reason: 'unknown_send_error', pembayaranId: bill.id, channel })
        }
      }
    }
  }

  logger.info({ sent, skipped, propertyIds }, 'Reminder sweep finished')

  return { sent, skipped, sentLogs, skippedReasons }
}

// ---------------------------------------------------------------------------
// Manual trigger
// ---------------------------------------------------------------------------

/**
 * Manual per-tenant or per-bill trigger.
 */
export async function sendManualReminder(options: ManualReminderOptions): Promise<ManualReminderResult> {
  const now = options.now ?? new Date()

  if (!options.pembayaranId && !options.penyewaId) {
    throw new AppError('Either pembayaranId or penyewaId is required', 400)
  }

  if (options.pembayaranId && options.penyewaId) {
    throw new AppError('Provide only one of pembayaranId or penyewaId', 400)
  }

  const propertyId = options.propertyId

  const config = await prisma.reminderConfig.findUnique({ where: { propertyId } })
  const channels = (config?.channels as NotificationChannel[] | undefined) ?? (['WEB_PUSH'] as NotificationChannel[])

  const effectiveChannels = channels.length > 0 ? channels : (['WEB_PUSH'] as NotificationChannel[])

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { nama: true },
  })

  const sent: NotificationLog[] = []
  const skipped: SkippedReason[] = []

  // Resolve target bills (property-scoped, tenant-active guard where relevant)
  let bills: Array<{
    pembayaran: {
      id: string
      periodeBulan: number
      periodeTahun: number
      tanggalJatuhTempo: Date
      nominal: Decimal | number
      totalDibayar: Decimal | number
      status: string
    }
    penyewa: { id: string; nama: string; noHp: string; kamar: { nomor: string } }
  }> = []

  if (options.pembayaranId) {
    const raw = await prisma.pembayaran.findFirst({
      where: {
        id: options.pembayaranId,
        penyewa: { kamar: { propertyId } },
      },
      include: {
        penyewa: { include: { kamar: { select: { nomor: true } } } },
      },
    })

    if (!raw) {
      throw new AppError('Pembayaran tidak ditemukan', 404)
    }

    // Re-fetch defensively
    const fresh = await prisma.pembayaran.findUnique({ where: { id: raw.id } })
    if (!fresh || fresh.status === 'LUNAS') {
      skipped.push({ reason: 'already_paid', pembayaranId: raw.id })
      return { sent, skipped }
    }

    bills = [
      {
        pembayaran: {
          id: fresh.id,
          periodeBulan: fresh.periodeBulan,
          periodeTahun: fresh.periodeTahun,
          tanggalJatuhTempo: fresh.tanggalJatuhTempo,
          nominal: fresh.nominal as unknown as Decimal,
          totalDibayar: fresh.totalDibayar as unknown as Decimal,
          status: fresh.status,
        },
        penyewa: {
          id: raw.penyewa.id,
          nama: raw.penyewa.nama,
          noHp: raw.penyewa.noHp,
          kamar: { nomor: raw.penyewa.kamar.nomor },
        },
      },
    ]
  } else if (options.penyewaId) {
    const tenant = await prisma.penyewa.findFirst({
      where: { id: options.penyewaId, kamar: { propertyId } },
      include: { kamar: { select: { nomor: true } } },
    })

    if (!tenant) {
      throw new AppError('Penyewa tidak ditemukan', 404)
    }

    const outstanding = await prisma.pembayaran.findMany({
      where: {
        penyewaId: tenant.id,
        status: { in: ['BELUM_BAYAR', 'SEBAGIAN', 'TERLAMBAT'] },
      },
    })

    if (outstanding.length === 0) {
      skipped.push({ reason: 'no_outstanding_bills', penyewaId: tenant.id })
      return { sent, skipped }
    }

    for (const raw of outstanding) {
      const fresh = await prisma.pembayaran.findUnique({ where: { id: raw.id } })
      if (!fresh || fresh.status === 'LUNAS') {
        skipped.push({ reason: 'already_paid', pembayaranId: raw.id })
        continue
      }

      bills.push({
        pembayaran: {
          id: fresh.id,
          periodeBulan: fresh.periodeBulan,
          periodeTahun: fresh.periodeTahun,
          tanggalJatuhTempo: fresh.tanggalJatuhTempo,
          nominal: fresh.nominal as unknown as Decimal,
          totalDibayar: fresh.totalDibayar as unknown as Decimal,
          status: fresh.status,
        },
        penyewa: {
          id: tenant.id,
          nama: tenant.nama,
          noHp: tenant.noHp,
          kamar: { nomor: tenant.kamar.nomor },
        },
      })
    }

    if (bills.length === 0) {
      return { sent, skipped }
    }
  }

  // For each bill × channel, send (no offset filter)
  for (const { pembayaran, penyewa } of bills) {
    const offset = daysFromDue(pembayaran.tanggalJatuhTempo, now)
    const jenis = getJenisForDaysFromDue(offset)

    for (const channel of effectiveChannels) {
      const outcome = await buildAndSend({
        propertyId,
        propertyNama: property?.nama ?? null,
        pembayaran,
        penyewa,
        jenis,
        channel,
        now,
      })

      if (outcome.deduped) {
        skipped.push({ reason: 'duplicate_today', pembayaranId: pembayaran.id, channel })
        continue
      }

      if (outcome.skippedReason) {
        skipped.push({ reason: outcome.skippedReason, pembayaranId: pembayaran.id, channel })
        continue
      }

      if (outcome.log) {
        sent.push(outcome.log)
      } else {
        skipped.push({ reason: 'unknown_send_error', pembayaranId: pembayaran.id, channel })
      }
    }
  }

  return { sent, skipped }
}
