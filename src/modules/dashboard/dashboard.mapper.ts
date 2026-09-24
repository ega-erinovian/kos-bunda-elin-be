import type { DashboardSummary } from './dashboard.service.js'

export function mapDashboardSummary(s: DashboardSummary): DashboardSummary {
  return {
    kamar: {
      total: s.kamar.total,
      terisi: s.kamar.terisi,
      kosong: s.kamar.kosong,
      occupancyRate: s.kamar.occupancyRate,
    },
    pembayaran: {
      total: s.pembayaran.total,
      lunas: s.pembayaran.lunas,
      belumBayar: s.pembayaran.belumBayar,
      sebagian: s.pembayaran.sebagian,
      terlambat: s.pembayaran.terlambat,
      outstanding: s.pembayaran.outstanding,
    },
    finance: {
      totalReceivables: s.finance.totalReceivables,
      netOperatingIncomeThisMonth: s.finance.netOperatingIncomeThisMonth,
    },
    notifications: {
      remindersSentToday: s.notifications.remindersSentToday,
      failedMessagesCount: s.notifications.failedMessagesCount,
    },
  }
}
