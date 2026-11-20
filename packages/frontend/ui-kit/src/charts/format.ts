export const UNKNOWN_TEXT = '—'

const grouped = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })
const compact = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('zh-CN')
const DECIMAL = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/

const known = (value: number | null): value is number => value !== null && Number.isFinite(value)

export function formatNumber(value: number | null, options: { compact?: boolean } = {}): string {
  if (!known(value)) return UNKNOWN_TEXT
  return (options.compact === true && Math.abs(value) >= 10_000 ? compact : grouped).format(value)
}

export function formatPercent(ratio: number | null): string {
  return known(ratio) ? percent.format(ratio) : UNKNOWN_TEXT
}

export function formatAmount(lexeme: string | null, unit: string): string {
  const parts = lexeme === null ? null : DECIMAL.exec(lexeme)
  if (parts === null) return UNKNOWN_TEXT
  const [, sign = '', whole = '0', fraction] = parts
  const digits = integer.format(BigInt(whole))
  return `${sign}${digits}${fraction === undefined ? '' : `.${fraction}`} ${unit}`
}
