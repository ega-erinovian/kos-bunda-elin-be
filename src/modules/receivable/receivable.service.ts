import prisma from '../../config/prisma.js'
import { toNumberRequired } from '../../utils/serialize.util.js'
import { bucketAging, daysPastDue } from '../../utils/aging.util.js'
import type { AgingBucket } from '../../utils/aging.util.js'

export interface ReceivableByTenant {
  penyewaId: string
  nama: string
  outstanding: number
  unpaidPeriods: number
}

export interface ReceivableSummary {
  totalOutstanding: number
  unpaidPeriodCount: number
  propertyTotal: number
}

async function fetchUnpaidRows(propertyId: string) {
  return prisma.pembayaran.findMany({
    where: {
      status: { not: 'LUNAS' },
      penyewa: { kamar: { propertyId } },
    },
    include: {
      penyewa: { select: { id: true, nama: true } },
    },
    orderBy: { tanggalJatuhTempo: 'asc' },
  })
}

function outstandingOf(row: { nominal: unknown; totalDibayar: unknown }): number {
  const nominal = toNumberRequired(row.nominal as any)
  const paid = toNumberRequired(row.totalDibayar as any)
  const diff = nominal - paid
  return diff > 0 ? diff : 0
}

export async function getReceivables(propertyId: string, asOf: Date): Promise<ReceivableByTenant[]> {
  void asOf
  const rows = await fetchUnpaidRows(propertyId)
  const grouped = new Map<string, ReceivableByTenant>()
  for (const row of rows) {
    const out = outstandingOf(row)
    if (out <= 0) continue
    const key = row.penyewaId
    const existing = grouped.get(key)
    if (existing) {
      existing.outstanding += out
      existing.unpaidPeriods += 1
    } else {
      grouped.set(key, {
        penyewaId: key,
        nama: row.penyewa.nama,
        outstanding: out,
        unpaidPeriods: 1,
      })
    }
  }
  return [...grouped.values()].sort((a, b) => b.outstanding - a.outstanding)
}

export async function getSummary(propertyId: string, asOf: Date): Promise<ReceivableSummary> {
  const rows = await fetchUnpaidRows(propertyId)
  void asOf
  let totalOutstanding = 0
  let unpaidPeriodCount = 0
  for (const row of rows) {
    const out = outstandingOf(row)
    if (out <= 0) continue
    totalOutstanding += out
    unpaidPeriodCount += 1
  }
  return { totalOutstanding, unpaidPeriodCount, propertyTotal: totalOutstanding }
}

export async function getAging(propertyId: string, asOf: Date): Promise<{ buckets: AgingBucket[] }> {
  const rows = await fetchUnpaidRows(propertyId)
  const items = rows
    .map((row) => ({
      outstanding: outstandingOf(row),
      daysPastDue: daysPastDue(row.tanggalJatuhTempo, asOf),
    }))
    .filter((i) => i.outstanding > 0)
  return { buckets: bucketAging(items) }
}
