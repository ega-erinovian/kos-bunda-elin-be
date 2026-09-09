export function mapFinancialCategory(c: any) {
  return {
    id: c.id,
    type: c.type,
    code: c.code,
    name: c.name,
    active: c.active,
  }
}
