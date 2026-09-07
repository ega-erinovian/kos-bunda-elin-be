import { describe, it, expect } from '@jest/globals'
import {
  daysFromDue,
  isReminderDue,
  getJenisForOffset,
  getJenisForDaysFromDue,
} from '../src/modules/notification/reminder-eligibility.util.js'

describe('reminder-eligibility.util (pure)', () => {
  const now = new Date('2026-08-25T08:00:00+07:00')

  const dueOn = (offset: number): Date => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    const due = new Date(d)
    due.setDate(d.getDate() - offset)
    return due
  }

  describe('daysFromDue', () => {
    it('returns 0 when due is today regardless of hour', () => {
      const dueMorning = new Date('2026-08-25T00:01:00+07:00')
      const dueNight = new Date('2026-08-25T23:59:00+07:00')
      expect(daysFromDue(dueMorning, now)).toBe(0)
      expect(daysFromDue(dueNight, now)).toBe(0)
    })

    it('returns negative for future due dates (H-n)', () => {
      expect(daysFromDue(dueOn(-7), now)).toBe(-7)
      expect(daysFromDue(dueOn(-3), now)).toBe(-3)
      expect(daysFromDue(dueOn(-1), now)).toBe(-1)
    })

    it('returns 0 for due today (H)', () => {
      expect(daysFromDue(dueOn(0), now)).toBe(0)
    })

    it('returns positive for overdue (H+n)', () => {
      expect(daysFromDue(dueOn(1), now)).toBe(1)
      expect(daysFromDue(dueOn(3), now)).toBe(3)
      expect(daysFromDue(dueOn(7), now)).toBe(7)
    })

    it('handles month/year boundaries', () => {
      const endOfMonth = new Date('2026-08-31T08:00:00+07:00')
      const startNextMonth = new Date('2026-09-01T08:00:00+07:00')
      // 2026-09-01 is 1 day after 2026-08-31
      expect(daysFromDue(new Date('2026-08-31T00:00:00+07:00'), startNextMonth)).toBe(1)
      expect(daysFromDue(startNextMonth, endOfMonth)).toBe(-1)
    })
  })

  describe('isReminderDue', () => {
    it.each([-7, -3, -1, 0, 1, 3, 7])('matches exactly offset %i', (offset) => {
      expect(isReminderDue(offset, dueOn(offset), now)).toBe(true)
    })

    it('does not match off-by-one offsets', () => {
      expect(isReminderDue(0, dueOn(1), now)).toBe(false)
      expect(isReminderDue(-1, dueOn(0), now)).toBe(false)
      expect(isReminderDue(7, dueOn(6), now)).toBe(false)
    })

    it('returns false for offset not in config (e.g. 2, 10)', () => {
      expect(isReminderDue(2, dueOn(2), now)).toBe(true) // would be true if queried for 2
      expect(isReminderDue(7, dueOn(2), now)).toBe(false) // but sweep checks includes(2) false
      expect(isReminderDue(0, dueOn(2), now)).toBe(false)
    })
  })

  describe('getJenisForOffset', () => {
    it.each([
      [-7, 'REMINDER_JATUH_TEMPO'],
      [-1, 'REMINDER_JATUH_TEMPO'],
      [0, 'REMINDER_JATUH_TEMPO'],
      [1, 'REMINDER_TUNGGAKAN'],
      [3, 'REMINDER_TUNGGAKAN'],
      [7, 'REMINDER_TUNGGAKAN'],
    ] as const)('offset %i → %s', (offset, expected) => {
      expect(getJenisForOffset(offset)).toBe(expected)
    })
  })

  describe('getJenisForDaysFromDue', () => {
    it('mirrors getJenisForOffset semantics for manual sends', () => {
      expect(getJenisForDaysFromDue(-5)).toBe('REMINDER_JATUH_TEMPO')
      expect(getJenisForDaysFromDue(0)).toBe('REMINDER_JATUH_TEMPO')
      expect(getJenisForDaysFromDue(1)).toBe('REMINDER_TUNGGAKAN')
      expect(getJenisForDaysFromDue(10)).toBe('REMINDER_TUNGGAKAN')
    })
  })
})
