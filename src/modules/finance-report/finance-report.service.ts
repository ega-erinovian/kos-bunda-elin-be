import prisma from '../../config/prisma.js'
import { AppError } from '../../utils/apiError.js'
import { MAX_REPORT_RANGE_DAYS } from './finance-report.schema.js'
import { startOfMonth, differenceInCalendarDays } from 'date-fns'
import { Decimal } from 'decimal.js'

export interface EffectiveRange {
  from: Date
  to: Date
}

export function getEffectiveRange(query: { from?: Date; to?: Date }): EffectiveRange {
  const now = new Date()
  let from = query.from ?? startOfMonth(now)
  let to = query.to ?? now

  if (!(from instanceof Date) || isNaN(from.getTime())) from = startOfMonth(now)
  if (!(to instanceof Date) || isNaN(to.getTime())) to = now

  if (from > to) {
    throw new AppError('from tidak boleh setelah to', 400)
  }
  const diffDays = differenceInCalendarDays(to, from)
  const ceilDiff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  const effectiveDiff = Math.max(diffDays, ceilDiff)
  if (effectiveDiff > MAX_REPORT_RANGE_DAYS) {
    throw new AppError(`Rentang laporan maksimal ${MAX_REPORT_RANGE_DAYS} hari (3 tahun)`, 400)
  }
  return { from, to }
}

// ── helpers ──────────────────────────────────────────────────────
function sumDecimalValues(rows: any[], field: string): number {
  let total = new Decimal(0)
  for (const r of rows) {
    const v = r[field]
    if (v === null || v === undefined) continue
    total = total.plus(new Decimal(v as any))
  }
  return total.toNumber()
}

function monthKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthsBetween(from: Date, to: Date): string[] {
  const y1 = from.getUTCFullYear()
  const m1 = from.getUTCMonth()
  const y2 = to.getUTCFullYear()
  const m2 = to.getUTCMonth()
  const out: string[] = []
  let y = y1
  let m = m1
  let guard = 0
  while ((y < y2 || (y === y2 && m <= m2)) && guard < 60) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`)
    m += 1
    if (m > 11) {
      m = 0
      y += 1
    }
    guard += 1
  }
  return out
}

// ── Revenue ──────────────────────────────────────────────────────
export interface RevenueReport {
  billedRevenue: number
  cashRevenue: number
  expectedRevenue: number
  collectionRate: number
  otherIncome: number
}

export async function getRevenueReport(
  propertyId: string,
  query: { from?: Date; to?: Date },
): Promise<RevenueReport> {
  const { from, to } = getEffectiveRange(query)

  const billedRows = await prisma.pembayaran.findMany({
    where: {
      penyewa: { kamar: { propertyId } },
      tanggalJatuhTempo: { gte: from, lte: to },
    },
    select: { nominal: true },
  })
  const billedRevenue = sumDecimalValues(billedRows, 'nominal')
  const expectedRevenue = billedRevenue

  const cashRows = await prisma.paymentRecord.findMany({
    where: {
      pembayaran: { penyewa: { kamar: { propertyId } } },
      paymentDate: { gte: from, lte: to },
    },
    select: { amountPaid: true },
  })
  const cashRevenue = sumDecimalValues(cashRows, 'amountPaid')

  const otherRows = await prisma.financialTransaction.findMany({
    where: {
      propertyId,
      deletedAt: null,
      type: 'INCOME' as any,
      source: { notIn: ['RENT_PAYMENT', 'DEPOSIT'] as any },
      transactionDate: { gte: from, lte: to },
    },
    select: { amount: true },
  })
  const otherIncome = sumDecimalValues(otherRows, 'amount')

  const collectionRate = billedRevenue > 0 ? cashRevenue / billedRevenue : 0

  return { billedRevenue, cashRevenue, expectedRevenue, collectionRate, otherIncome }
}

// ── Expenses ─────────────────────────────────────────────────────
export interface ExpenseReport {
  totalExpenses: number
  byCategory: { categoryId: string; amount: number }[]
  trend: { month: string; amount: number }[]
}

export async function getExpenseReport(
  propertyId: string,
  query: { from?: Date; to?: Date },
): Promise<ExpenseReport> {
  const { from, to } = getEffectiveRange(query)

  const baseWhere: any = {
    propertyId,
    deletedAt: null,
    type: 'EXPENSE',
    source: { not: 'DEPOSIT_REFUND' },
    transactionDate: { gte: from, lte: to },
  }

  const rows = await prisma.financialTransaction.findMany({
    where: baseWhere,
    select: { amount: true, categoryId: true, transactionDate: true },
  })

  const totalExpenses = sumDecimalValues(rows, 'amount')

  const byCatMap = new Map<string, Decimal>()
  for (const r of rows) {
    const key = r.categoryId as string
    const prev = byCatMap.get(key) ?? new Decimal(0)
    byCatMap.set(key, prev.plus(new Decimal(r.amount as any)))
  }
  const byCategory = [...byCatMap.entries()]
    .map(([categoryId, dec]) => ({ categoryId, amount: dec.toNumber() }))
    .sort((a, b) => b.amount - a.amount)

  const monthBuckets = new Map<string, Decimal>()
  for (const r of rows) {
    const k = monthKey(r.transactionDate as Date)
    const prev = monthBuckets.get(k) ?? new Decimal(0)
    monthBuckets.set(k, prev.plus(new Decimal(r.amount as any)))
  }
  const months = monthsBetween(from, to)
  const trend = months.map((m) => ({
    month: m,
    amount: (monthBuckets.get(m) ?? new Decimal(0)).toNumber(),
  }))

  return { totalExpenses, byCategory, trend }
}

// ── Cash Flow ────────────────────────────────────────────────────
export interface CashFlowReport {
  inflow: number
  outflow: number
  net: number
}

export async function getCashFlowReport(
  propertyId: string,
  query: { from?: Date; to?: Date },
): Promise<CashFlowReport> {
  const { from, to } = getEffectiveRange(query)

  const [inRows, outRows] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: {
        propertyId,
        deletedAt: null,
        type: 'INCOME' as any,
        transactionDate: { gte: from, lte: to },
      },
      select: { amount: true },
    }),
    prisma.financialTransaction.findMany({
      where: {
        propertyId,
        deletedAt: null,
        type: 'EXPENSE' as any,
        transactionDate: { gte: from, lte: to },
      },
      select: { amount: true },
    }),
  ])

  const inflow = sumDecimalValues(inRows, 'amount')
  const outflow = sumDecimalValues(outRows, 'amount')
  const net = inflow - outflow

  return { inflow, outflow, net }
}

// ── Income Statement ─────────────────────────────────────────────
export interface IncomeStatementReport {
  totalIncome: number
  totalExpenses: number
  netOperatingIncome: number
}

export async function getIncomeStatementReport(
  propertyId: string,
  query: { from?: Date; to?: Date },
): Promise<IncomeStatementReport> {
  const [revenue, expenses] = await Promise.all([
    getRevenueReport(propertyId, query),
    getExpenseReport(propertyId, query),
  ])
  const totalIncome = revenue.cashRevenue + revenue.otherIncome
  const totalExpenses = expenses.totalExpenses
  const netOperatingIncome = totalIncome - totalExpenses
  return { totalIncome, totalExpenses, netOperatingIncome }
}

// ── Transactions ─────────────────────────────────────────────────
export async function getTransactionsReport(
  propertyId: string,
  query: { from?: Date; to?: Date; type?: 'INCOME' | 'EXPENSE'; categoryId?: string },
) {
  const { from, to } = getEffectiveRange(query)
  const where: any = {
    propertyId,
    deletedAt: null,
    transactionDate: { gte: from, lte: to },
  }
  if (query.type) where.type = query.type
  if (query.categoryId) where.categoryId = query.categoryId

  const data = await prisma.financialTransaction.findMany({
    where,
    orderBy: { transactionDate: 'desc' },
  })
  return { data }
}

// ── Occupancy & overdue helpers for dashboard ────────────────────
async function getOccupancyRate(propertyId: string): Promise<number> {
  const [terisi, active] = await Promise.all([
    prisma.kamar.count({ where: { propertyId, status: 'TERISI' as any } }),
    prisma.kamar.count({ where: { propertyId, status: { not: 'NONAKTIF' as any } } }),
  ])
  if (active === 0) return 0
  return terisi / active
}

async function getOverdueRent(propertyId: string, to: Date): Promise<number> {
  const rows = await prisma.pembayaran.findMany({
    where: {
      penyewa: { kamar: { propertyId } },
      status: { not: 'LUNAS' as any },
      tanggalJatuhTempo: { lt: to },
    },
    select: { nominal: true, totalDibayar: true },
  })
  let total = new Decimal(0)
  for (const r of rows) {
    const nominal = new Decimal(r.nominal as any)
    const paid = new Decimal(r.totalDibayar as any)
    const out = nominal.minus(paid)
    if (out.greaterThan(0)) total = total.plus(out)
  }
  return total.toNumber()
}

async function getRevenueTrend(
  propertyId: string,
  from: Date,
  to: Date,
): Promise<{ month: string; billedRevenue: number; cashRevenue: number }[]> {
  const [billedRows, cashRows] = await Promise.all([
    prisma.pembayaran.findMany({
      where: {
        penyewa: { kamar: { propertyId } },
        tanggalJatuhTempo: { gte: from, lte: to },
      },
      select: { nominal: true, tanggalJatuhTempo: true },
    }),
    prisma.paymentRecord.findMany({
      where: {
        pembayaran: { penyewa: { kamar: { propertyId } } },
        paymentDate: { gte: from, lte: to },
      },
      select: { amountPaid: true, paymentDate: true },
    }),
  ])

  const billedMap = new Map<string, Decimal>()
  for (const r of billedRows) {
    const k = monthKey(r.tanggalJatuhTempo as Date)
    const prev = billedMap.get(k) ?? new Decimal(0)
    billedMap.set(k, prev.plus(new Decimal(r.nominal as any)))
  }
  const cashMap = new Map<string, Decimal>()
  for (const r of cashRows) {
    const k = monthKey(r.paymentDate as Date)
    const prev = cashMap.get(k) ?? new Decimal(0)
    cashMap.set(k, prev.plus(new Decimal(r.amountPaid as any)))
  }
  const months = monthsBetween(from, to)
  return months.map((m) => ({
    month: m,
    billedRevenue: (billedMap.get(m) ?? new Decimal(0)).toNumber(),
    cashRevenue: (cashMap.get(m) ?? new Decimal(0)).toNumber(),
  }))
}

// ── Dashboard composite ──────────────────────────────────────────
export interface DashboardReport {
  revenue: RevenueReport
  expenses: ExpenseReport
  cashFlow: CashFlowReport
  occupancyRate: number
  overdueRent: number
  revenueTrend: { month: string; billedRevenue: number; cashRevenue: number }[]
}

export async function getDashboardReport(
  propertyId: string,
  query: { from?: Date; to?: Date },
): Promise<DashboardReport> {
  const { from, to } = getEffectiveRange(query)
  const [revenue, expenses, cashFlow, occupancyRate, overdueRent, revenueTrend] =
    await Promise.all([
      getRevenueReport(propertyId, { from, to }),
      getExpenseReport(propertyId, { from, to }),
      getCashFlowReport(propertyId, { from, to }),
      getOccupancyRate(propertyId),
      getOverdueRent(propertyId, to),
      getRevenueTrend(propertyId, from, to),
    ])
  return { revenue, expenses, cashFlow, occupancyRate, overdueRent, revenueTrend }
}
