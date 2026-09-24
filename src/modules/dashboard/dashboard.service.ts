import prisma from '../../config/prisma.js'
import { Decimal } from 'decimal.js'
import { startOfDay } from 'date-fns'
import { getEffectiveRange, getIncomeStatementReport } from '../finance-report/finance-report.service.js'
import { getSummary } from '../receivable/receivable.service.js'

export interface DashboardSummary {
  kamar: {
    total: number
    terisi: number
    kosong: number
    occupancyRate: number
  }
  pembayaran: {
    total: number
    lunas: number
    belumBayar: number
    sebagian: number
    terlambat: number
    outstanding: number
  }
  finance: {
    totalReceivables: number
    netOperatingIncomeThisMonth: number
  }
  notifications: {
    remindersSentToday: number
    failedMessagesCount: number
  }
}

export async function getDashboardSummary(
  propertyId: string,
  query: { from?: Date; to?: Date },
): Promise<DashboardSummary> {
  const { from, to } = getEffectiveRange(query)

  const [
    kamarCounts,
    pembayaranGroup,
    pembayaranOutstandingRows,
    financeTotalReceivables,
    financeIncomeStatement,
    remindersSentToday,
    failedMessagesCount,
  ] = await Promise.all([
    Promise.all([
      prisma.kamar.count({ where: { propertyId } }),
      prisma.kamar.count({ where: { propertyId, status: 'TERISI' as any } }),
      prisma.kamar.count({ where: { propertyId, status: 'KOSONG' as any } }),
      prisma.kamar.count({ where: { propertyId, status: 'NONAKTIF' as any } }),
    ]),
    prisma.pembayaran.groupBy({
      by: ['status'],
      where: { penyewa: { kamar: { propertyId } } },
      _count: { status: true },
    } as any),
    prisma.pembayaran.findMany({
      where: {
        penyewa: { kamar: { propertyId } },
        status: { not: 'LUNAS' as any },
      },
      select: { nominal: true, totalDibayar: true },
    }),
    getSummary(propertyId, to).then((s) => s.totalOutstanding),
    getIncomeStatementReport(propertyId, { from, to }).then((r) => r.netOperatingIncome),
    prisma.notificationLog.count({
      where: {
        propertyId,
        createdAt: { gte: startOfDay(new Date()) },
      },
    }),
    prisma.notificationLog.count({
      where: {
        propertyId,
        status: 'FAILED' as any,
        createdAt: { gte: from, lte: to },
      },
    }),
  ])

  const [totalKamar, terisi, kosong, nonaktif] = kamarCounts
  const active = totalKamar - nonaktif
  const occupancyRate = active > 0 ? terisi / active : 0

  const statusMap = new Map<string, number>()
  for (const g of pembayaranGroup as any[]) {
    statusMap.set(g.status, g._count.status)
  }
  const totalPembayaran = (pembayaranGroup as any[]).reduce((acc, g) => acc + g._count.status, 0)

  let outstanding = new Decimal(0)
  for (const r of pembayaranOutstandingRows) {
    const nominal = new Decimal(r.nominal as any)
    const paid = new Decimal(r.totalDibayar as any)
    const diff = nominal.minus(paid)
    if (diff.greaterThan(0)) outstanding = outstanding.plus(diff)
  }

  return {
    kamar: {
      total: totalKamar,
      terisi,
      kosong,
      occupancyRate,
    },
    pembayaran: {
      total: totalPembayaran,
      lunas: statusMap.get('LUNAS') ?? 0,
      belumBayar: statusMap.get('BELUM_BAYAR') ?? 0,
      sebagian: statusMap.get('SEBAGIAN') ?? 0,
      terlambat: statusMap.get('TERLAMBAT') ?? 0,
      outstanding: outstanding.toNumber(),
    },
    finance: {
      totalReceivables: financeTotalReceivables,
      netOperatingIncomeThisMonth: financeIncomeStatement,
    },
    notifications: {
      remindersSentToday,
      failedMessagesCount,
    },
  }
}
