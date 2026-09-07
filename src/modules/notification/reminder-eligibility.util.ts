import { differenceInCalendarDays, startOfDay } from 'date-fns'

/**
 * Computes the number of calendar days between `now` and `tanggalJatuhTempo`.
 * Uses calendar-day granularity so a bill due today at any hour and a sweep
 * running at 08:00 produce `0`, regardless of the exact millisecond.
 */
export function daysFromDue(tanggalJatuhTempo: Date, now: Date = new Date()): number {
  const dueDay = startOfDay(tanggalJatuhTempo)
  const nowDay = startOfDay(now)
  return differenceInCalendarDays(nowDay, dueDay)
}

/**
 * Pure eligibility check extracted for testability.
 *
 * @example
 * isReminderDue(-1, new Date('2026-08-26'), new Date('2026-08-25')) // true (H-1)
 * isReminderDue(0, new Date('2026-08-25'), new Date('2026-08-25'))  // true (H)
 * isReminderDue(1, new Date('2026-08-25'), new Date('2026-08-26'))  // true (H+1)
 */
export function isReminderDue(offset: number, tanggalJatuhTempo: Date, now: Date = new Date()): boolean {
  return daysFromDue(tanggalJatuhTempo, now) === offset
}

/**
 * Derives the notification kind from the sign of the offset.
 *
 * - offset <= 0 → forthcoming / on-time (`REMINDER_JATUH_TEMPO`)
 * - offset > 0  → overdue (`REMINDER_TUNGGAKAN`)
 */
export function getJenisForOffset(offset: number): 'REMINDER_JATUH_TEMPO' | 'REMINDER_TUNGGAKAN' {
  return offset > 0 ? 'REMINDER_TUNGGAKAN' : 'REMINDER_JATUH_TEMPO'
}

/**
 * Derives the notification kind for manual sends, where no offset was matched.
 */
export function getJenisForDaysFromDue(daysFromDue: number): 'REMINDER_JATUH_TEMPO' | 'REMINDER_TUNGGAKAN' {
  return daysFromDue > 0 ? 'REMINDER_TUNGGAKAN' : 'REMINDER_JATUH_TEMPO'
}
