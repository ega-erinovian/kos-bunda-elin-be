import {
  addDays,
  startOfMonth,
  endOfMonth,
  isBefore,
  isAfter,
  isSameDay,
  format,
  differenceInDays,
} from 'date-fns'

export function getDatesBefore(target: Date, days: number): Date[] {
  const result: Date[] = []
  for (let i = 1; i <= days; i++) {
    result.push(addDays(target, -i))
  }
  return result
}

export function getDatesAfter(target: Date, days: number): Date[] {
  const result: Date[] = []
  for (let i = 1; i <= days; i++) {
    result.push(addDays(target, i))
  }
  return result
}

export function isOverdue(jatuhTempo: Date): boolean {
  return isBefore(jatuhTempo, new Date()) && !isSameDay(jatuhTempo, new Date())
}

export function isDueSoon(jatuhTempo: Date, withinDays: number): boolean {
  const diff = differenceInDays(jatuhTempo, new Date())
  return diff >= 0 && diff <= withinDays
}

export function getMonthRange(tahun: number, bulan: number) {
  const date = new Date(tahun, bulan - 1)
  return {
    start: startOfMonth(date),
    end: endOfMonth(date),
  }
}

export { format, differenceInDays, addDays, isBefore, isAfter, isSameDay }
