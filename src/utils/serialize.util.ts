import { Decimal } from 'decimal.js'

/**
 * Converts Prisma Decimal to JSON number
 * 
 * This is required because Prisma's Decimal.prototype.toJSON() serializes to string,
 * but the frontend contract (§1 item 7 of PLAN.md) expects number for all monetary fields.
 * 
 * @param d - Decimal value or null
 * @returns number or null
 */
export function toNumber(d: Decimal | null | undefined): number | null {
  if (d === null || d === undefined) {
    return null
  }
  return d.toNumber()
}

/**
 * Converts Prisma Decimal to JSON number, with non-null guarantee
 * 
 * @param d - Decimal value
 * @returns number (never null)
 */
export function toNumberRequired(d: Decimal): number {
  return d.toNumber()
}

/**
 * Converts an array of Decimal values to numbers
 * 
 * @param arr - Array of Decimal values
 * @returns Array of numbers
 */
export function toNumberArray(arr: Decimal[]): number[] {
  return arr.map((d) => d.toNumber())
}
