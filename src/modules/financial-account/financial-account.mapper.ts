import { toNumberRequired } from '../../utils/serialize.util.js'

export function mapFinancialAccount(a: any) {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    bankName: a.bankName || undefined,
    accountNumber: a.accountNumber || undefined,
    openingBalance: toNumberRequired(a.openingBalance),
    active: a.active,
  }
}
