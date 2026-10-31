/** Exact decimal kept as a coefficient and an exponent. Parsing never uses Number. */
export type Decimal = {
  readonly coefficient: bigint
  readonly exponent: bigint
}

const LEXEME = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/u

export type LexemeFailure = 'lexeme' | 'precision'

export function parseLexeme(lexeme: string, unit: string): Decimal | LexemeFailure {
  const match = LEXEME.exec(lexeme)
  if (match === null) return 'lexeme'
  const fraction = match[2] ?? ''
  if (unit === 'token' && fraction.length > 0) return 'precision'
  if (unit === 'USD' && fraction.length > 2) return 'precision'
  const digits = `${match[1] ?? ''}${fraction}`
  return {
    coefficient: BigInt(digits),
    exponent: -BigInt(fraction.length),
  }
}

export function addDecimals(left: Decimal, right: Decimal): Decimal {
  if (left.coefficient === 0n) return right
  if (right.coefficient === 0n) return left
  const exponent = left.exponent < right.exponent ? left.exponent : right.exponent
  const coefficient =
    left.coefficient * 10n ** (left.exponent - exponent) +
    right.coefficient * 10n ** (right.exponent - exponent)
  return { coefficient, exponent }
}

export function formatDecimal(value: Decimal): string {
  let coefficient = value.coefficient
  let exponent = value.exponent
  if (coefficient === 0n) return '0'
  while (coefficient % 10n === 0n) {
    coefficient /= 10n
    exponent += 1n
  }
  const negative = coefficient < 0n
  const digits = (negative ? -coefficient : coefficient).toString()
  const sign = negative ? '-' : ''
  if (exponent >= 0n) return `${sign}${digits}${'0'.repeat(Number(exponent))}`
  const places = Number(-exponent)
  if (digits.length <= places) return `${sign}0.${'0'.repeat(places - digits.length)}${digits}`
  const point = digits.length - places
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`
}
