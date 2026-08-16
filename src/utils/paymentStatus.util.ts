import { Decimal } from 'decimal.js'
import { StatusPembayaran } from '@prisma/client'

/**
 * Pure function to compute Pembayaran status based on business rules
 * 
 * @param nominal - Total amount due
 * @param totalDibayar - Total amount paid so far
 * @param tanggalJatuhTempo - Due date
 * @param now - Current date/time for comparison
 * @returns Computed status
 * 
 * Business rules:
 * - totalDibayar <= 0 && now > tanggalJatuhTempo → TERLAMBAT
 * - totalDibayar <= 0 && now <= tanggalJatuhTempo → BELUM_BAYAR
 * - 0 < totalDibayar < nominal → SEBAGIAN (regardless of due date)
 * - totalDibayar >= nominal → LUNAS
 */
export function computePembayaranStatus(
  nominal: Decimal | number,
  totalDibayar: Decimal | number,
  tanggalJatuhTempo: Date,
  now: Date = new Date()
): StatusPembayaran {
  // Convert Decimal to number for comparison
  const nominalNum = typeof nominal === 'number' ? nominal : nominal.toNumber()
  const totalDibayarNum =
    typeof totalDibayar === 'number' ? totalDibayar : totalDibayar.toNumber()

  // LUNAS: paid in full or overpaid
  if (totalDibayarNum >= nominalNum) {
    return StatusPembayaran.LUNAS
  }

  // SEBAGIAN: partial payment received
  if (totalDibayarNum > 0 && totalDibayarNum < nominalNum) {
    return StatusPembayaran.SEBAGIAN
  }

  // No payment yet: TERLAMBAT if overdue, BELUM_BAYAR otherwise
  if (totalDibayarNum <= 0) {
    // Compare dates at day level (ignore time)
    const dueDate = new Date(tanggalJatuhTempo)
    dueDate.setHours(0, 0, 0, 0)
    const currentDate = new Date(now)
    currentDate.setHours(0, 0, 0, 0)

    if (currentDate > dueDate) {
      return StatusPembayaran.TERLAMBAT
    }
    return StatusPembayaran.BELUM_BAYAR
  }

  // Fallback (should never reach here)
  return StatusPembayaran.BELUM_BAYAR
}

/**
 * Determines if a payment would result in an overpayment
 */
export function isOverpayment(
  nominal: Decimal | number,
  totalDibayar: Decimal | number
): boolean {
  const nominalNum = typeof nominal === 'number' ? nominal : nominal.toNumber()
  const totalDibayarNum =
    typeof totalDibayar === 'number' ? totalDibayar : totalDibayar.toNumber()

  return totalDibayarNum > nominalNum
}

/**
 * Calculate remaining balance
 */
export function calculateRemainingBalance(
  nominal: Decimal | number,
  totalDibayar: Decimal | number
): number {
  const nominalNum = typeof nominal === 'number' ? nominal : nominal.toNumber()
  const totalDibayarNum =
    typeof totalDibayar === 'number' ? totalDibayar : totalDibayar.toNumber()

  const remaining = nominalNum - totalDibayarNum
  return remaining > 0 ? remaining : 0
}
