import { differenceInCalendarDays, startOfDay } from 'date-fns'

export const AGING_LABELS = ['current', '1-30', '31-60', '61-90', '90+'] as const
export type AgingLabel = (typeof AGING_LABELS)[number]

export interface AgingItem {
  outstanding: number
  daysPastDue: number
}

export interface AgingBucket {
  label: AgingLabel
  outstanding: number
  count: number
}

export function daysPastDue(tanggalJatuhTempo: Date, asOf: Date = new Date()): number {
  return differenceInCalendarDays(startOfDay(asOf), startOfDay(tanggalJatuhTempo))
}

export function bucketLabel(days: number): AgingLabel {
  if (days <= 0) return 'current'
  if (days <= 30) return '1-30'
  if (days <= 60) return '31-60'
  if (days <= 90) return '61-90'
  return '90+'
}

export function bucketAging(items: AgingItem[]): AgingBucket[] {
  const map: Record<AgingLabel, AgingBucket> = {
    current: { label: 'current', outstanding: 0, count: 0 },
    '1-30': { label: '1-30', outstanding: 0, count: 0 },
    '31-60': { label: '31-60', outstanding: 0, count: 0 },
    '61-90': { label: '61-90', outstanding: 0, count: 0 },
    '90+': { label: '90+', outstanding: 0, count: 0 },
  }
  for (const item of items) {
    const label = bucketLabel(item.daysPastDue)
    map[label].outstanding += item.outstanding
    map[label].count += 1
  }
  return AGING_LABELS.map((l) => map[l])
}
